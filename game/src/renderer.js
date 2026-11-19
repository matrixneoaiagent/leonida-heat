// Leonida Heat v3 - the top-down render pipeline.
// Static Costa Sol is baked into a full-detail layer and a lighter far layer.
// Every moving thing is drawn per frame in a depth pass: long sun shadows that
// swing with the clock, soft contact shadows, per-type car silhouettes with
// damage states, pedestrian walk cycles, particles and neon bloom. Rain wets
// the streets; puddles mirror the lights; palms lean into the sea wind.
//
// Order:
//   baked city -> dynamic building shadows -> water/shore -> road life
//   -> wet reflections -> light pools -> search cones -> actor shadows
//   -> depth pass -> bullets/grenades -> particles -> neon bloom -> markers
//   -> weather -> colour grade/sun/moon -> vignette -> reticle.

import { PALETTE, districtAt } from './config.js';

const TAU = Math.PI * 2;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const smooth = (a, b, v) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

export function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function star(ctx, x, y, r, points = 5) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i += 1) {
    const rad = i % 2 === 0 ? r : r * 0.44;
    const a = -Math.PI / 2 + (i * Math.PI) / points;
    const px = x + Math.cos(a) * rad;
    const py = y + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.width = canvas.width;
    this.height = canvas.height;
    this.view = { x: 0, y: 0, w: 0, h: 0, x2: 0, y2: 0 };
    this.frame = 0;
    this.layers = new Map();
    this.layerCity = null;
    this.rainSeed = 0;
    this.bloomCanvas = null;
  }

  // =================================================================
  // Frame
  // =================================================================
  render(game) {
    const ctx = this.ctx;
    const cam = game.camera;
    this.frame += 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = this.ambientBase(game);
    ctx.fillRect(0, 0, this.width, this.height);

    const shake = cam.shake || 0;
    const shakeX = (Math.random() - 0.5) * shake * 22;
    const shakeY = (Math.random() - 0.5) * shake * 22;

    ctx.save();
    ctx.translate(this.width / 2 + shakeX, this.height / 2 + shakeY);
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-cam.x, -cam.y);

    const halfW = this.width / 2 / cam.zoom;
    const halfH = this.height / 2 / cam.zoom;
    this.view = {
      x: cam.x - halfW, y: cam.y - halfH,
      w: halfW * 2, h: halfH * 2,
      x2: cam.x + halfW, y2: cam.y + halfH,
    };

    this.drawStatic(game);
    this.drawBuildingShadows(game);
    this.drawAmbientWash(game);
    this.drawWaterAnimation(game);
    this.drawShore(game);
    this.drawRoadLife(game);
    this.drawRampsLive(game);
    this.drawWetReflections(game);
    this.drawGroundLighting(game);
    this.drawSearchCones(game);
    this.drawPalms(game);
    this.drawShadows(game);
    this.drawDepthPass(game);
    this.drawBullets(game);
    this.drawGrenades(game);
    this.drawParticles(game);
    this.drawMarkers(game);
    this.drawNeon(game);
    this.drawWeatherWorld(game);
    this.drawReticle(game);
    ctx.restore();

    this.drawAtmosphere(game);
  }

  inView(x, y, pad = 80) {
    const v = this.view;
    return x > v.x - pad && x < v.x2 + pad && y > v.y - pad && y < v.y2 + pad;
  }

  // =================================================================
  // Time-of-day light model
  // =================================================================
  lightInfo(game) {
    const t = ((game.timeOfDay ?? 0.5) % 1 + 1) % 1;
    const sunAlt = Math.sin((t - 0.25) * TAU); // 0 at 06:00, 1 at noon, -1 at midnight
    const daylight = smooth(-0.16, 0.2, sunAlt);
    const dark = 1 - daylight;
    const dawn = Math.exp(-Math.pow((t - 0.255) / 0.05, 2));
    const dusk = Math.exp(-Math.pow((t - 0.715) / 0.055, 2));
    const night = smooth(0.25, -0.35, sunAlt);
    const sunAzimuth = (t - 0.25) * Math.PI * 2 - Math.PI / 2;
    const shadowLen = clamp(0.25 + (1 - clamp(sunAlt, 0, 1)) * 2.6, 0.25, 2.9);
    let sunColor = '#fff3dc';
    if (dawn > 0.25) sunColor = '#ffb6a0';
    else if (dusk > 0.25) sunColor = '#ff9a62';
    else if (daylight < 0.2) sunColor = '#9db8ff';
    return { t, sunAlt, daylight, dark, dawn, dusk, night, sunAzimuth, shadowLen, sunColor };
  }

  ambientBase(game) {
    const li = this.lightInfo(game);
    if (li.dark > 0.55) return '#0b1020';
    if (li.dusk > 0.4) return '#2a1c28';
    if (li.dawn > 0.4) return '#322832';
    return '#6e7f66';
  }

  drawBuildingShadows(game) {
    const li = this.lightInfo(game);
    if (li.daylight < 0.12) return;
    const ctx = this.ctx;
    const ox = Math.cos(li.sunAzimuth + Math.PI) * li.shadowLen * 12;
    const oy = Math.sin(li.sunAzimuth + Math.PI) * li.shadowLen * 12;
    const alpha = clamp(0.1 + li.daylight * 0.13, 0, 0.22);
    ctx.save();
    for (const b of game.city.buildings) {
      if (!this.inView(b.x, b.y, 160)) continue;
      const h = clamp((b.height || 16) / 90, 0.3, 1.2);
      ctx.fillStyle = `rgba(18, 20, 28, ${alpha * h})`;
      roundRect(ctx, b.x - b.w / 2 + ox, b.y - b.h / 2 + oy, b.w, b.h, 3);
      ctx.fill();
    }
    ctx.restore();
  }

  // The baked city is painted for daylight. This wash sits *under* every
  // dynamic light and actor, so night stays dark while neon, headlights,
  // shadows and people remain vivid. A second, lighter grade at the end ties
  // the frame together.
  drawAmbientWash(game) {
    const li = this.lightInfo(game);
    const ctx = this.ctx;
    const v = this.view;
    if (li.dark > 0.01) {
      ctx.fillStyle = `rgba(9, 15, 42, ${li.dark * 0.66})`;
      ctx.fillRect(v.x, v.y, v.w, v.h);
    }
    if (li.dusk > 0.18) {
      ctx.fillStyle = `rgba(255, 112, 66, ${li.dusk * 0.11})`;
      ctx.fillRect(v.x, v.y, v.w, v.h);
      ctx.fillStyle = `rgba(90, 36, 100, ${li.dusk * 0.075})`;
      ctx.fillRect(v.x, v.y, v.w, v.h);
    }
    if (li.dawn > 0.18) {
      ctx.fillStyle = `rgba(255, 154, 172, ${li.dawn * 0.08})`;
      ctx.fillRect(v.x, v.y, v.w, v.h);
    }
  }

  // =================================================================
  // Cached city layers
  // =================================================================
  ensureLayer(game, detail) {
    if (this.layerCity !== game.city) {
      this.layers.clear();
      this.layerCity = game.city;
    }
    const key = detail ? 'detail' : 'far';
    let layer = this.layers.get(key);
    if (layer) return layer;
    const scale = detail ? 1 : 0.5;
    const size = 3200 * scale;
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(size);
    canvas.height = Math.ceil(size);
    const ctx = canvas.getContext('2d', { alpha: false });
    const prevCtx = this.ctx;
    const prevView = this.view;
    const prevDetail = this.detail;
    this.ctx = ctx;
    this.detail = detail;
    this.view = { x: 0, y: 0, w: 3200, h: 3200, x2: 3200, y2: 3200 };
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(scale, scale);
    ctx.fillStyle = '#6e7f66';
    ctx.fillRect(0, 0, 3200, 3200);
    this.bakeGround(game);
    this.bakeRoads(game);
    this.bakeBlocks(game);
    this.bakeProps(game);
    this.bakeRamps(game);
    this.bakeBuildings(game);
    this.ctx = prevCtx;
    this.view = prevView;
    this.detail = prevDetail;
    layer = { canvas, scale };
    this.layers.set(key, layer);
    return layer;
  }

  drawStatic(game) {
    const detail = game.camera.zoom >= 1.35;
    const layer = this.ensureLayer(game, detail);
    const v = this.view;
    const s = layer.scale;
    const sx = Math.max(0, Math.floor(v.x * s) - 2);
    const sy = Math.max(0, Math.floor(v.y * s) - 2);
    const sw = Math.min(layer.canvas.width - sx, Math.ceil((v.x2 - v.x) * s) + 4);
    const sh = Math.min(layer.canvas.height - sy, Math.ceil((v.y2 - v.y) * s) + 4);
    if (sw <= 0 || sh <= 0) return;
    this.ctx.drawImage(
      layer.canvas,
      sx, sy, sw, sh,
      sx / s, sy / s, sw / s, sh / s,
    );
  }

  // =================================================================
  // Baked ground, coast and piers
  // =================================================================
  bakeGround(game) {
    const ctx = this.ctx;
    const grad = ctx.createLinearGradient(0, 0, 3200, 3200);
    grad.addColorStop(0, '#72825f');
    grad.addColorStop(0.5, '#66755d');
    grad.addColorStop(1, '#5b6d5b');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 3200, 3200);

    ctx.strokeStyle = 'rgba(40, 48, 38, 0.08)';
    ctx.lineWidth = 3;
    for (let g = 200; g < 3200; g += 400) {
      ctx.beginPath();
      ctx.moveTo(g, 0);
      ctx.lineTo(g, 3200);
      ctx.moveTo(0, g);
      ctx.lineTo(3200, g);
      ctx.stroke();
    }

    // Shallow inlet west of the marina.
    ctx.fillStyle = 'rgba(53, 128, 140, 0.35)';
    ctx.beginPath();
    ctx.ellipse(2690, 2290, 58, 150, 0.08, 0, TAU);
    ctx.fill();

    const ocean = ctx.createLinearGradient(2712, 0, 3200, 0);
    ocean.addColorStop(0, '#42b4b8');
    ocean.addColorStop(0.14, '#2f99aa');
    ocean.addColorStop(0.55, '#1f7590');
    ocean.addColorStop(1, '#15556f');
    ctx.fillStyle = ocean;
    ctx.fillRect(2712, 0, 488, 3200);

    ctx.fillStyle = '#c9b489';
    ctx.fillRect(2680, 0, 36, 3200);
    const sand = ctx.createLinearGradient(2480, 0, 2712, 0);
    sand.addColorStop(0, '#dfc79c');
    sand.addColorStop(0.24, '#f1d5a5');
    sand.addColorStop(0.8, '#f7e1b7');
    sand.addColorStop(1, '#e7c48f');
    ctx.fillStyle = sand;
    ctx.fillRect(2480, 0, 232, 3200);

    // Boardwalk planks.
    ctx.fillStyle = '#c99a6b';
    ctx.fillRect(2494, 0, 58, 3200);
    ctx.strokeStyle = 'rgba(112, 73, 44, 0.38)';
    ctx.lineWidth = 1.1;
    for (let y = 0; y < 3200; y += 14) {
      ctx.beginPath();
      ctx.moveTo(2494, y);
      ctx.lineTo(2552, y);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255, 241, 216, 0.2)';
    ctx.fillRect(2494, 0, 3, 3200);
    ctx.fillRect(2549, 0, 3, 3200);
    ctx.fillStyle = 'rgba(80, 52, 32, 0.18)';
    for (let y = 28; y < 3200; y += 118) ctx.fillRect(2504, y, 3, 10);

    for (const speck of game.city.sandSpecks) {
      ctx.fillStyle = `rgba(122, 91, 54, ${speck.a})`;
      ctx.beginPath();
      ctx.arc(speck.x, speck.y, speck.r, 0, TAU);
      ctx.fill();
    }
    for (const f of game.city.foamDots) {
      ctx.fillStyle = `rgba(240, 252, 250, ${f.a})`;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r, 0, TAU);
      ctx.fill();
    }

    // Piers.
    for (const p of game.city.piers) {
      const left = p.x - p.w / 2;
      const top = p.y - p.h / 2;
      ctx.fillStyle = 'rgba(10, 38, 46, 0.32)';
      roundRect(ctx, left + 7, top + 10, p.w, p.h, 3);
      ctx.fill();
      ctx.fillStyle = '#b88f63';
      roundRect(ctx, left, top, p.w, p.h, 3);
      ctx.fill();
      ctx.strokeStyle = 'rgba(86, 57, 34, 0.42)';
      ctx.lineWidth = 1.3;
      for (let x = left + 6; x < left + p.w; x += 12) {
        ctx.beginPath();
        ctx.moveTo(x, top + 2);
        ctx.lineTo(x, top + p.h - 2);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
      ctx.fillRect(left + 2, top + 2, p.w - 4, 3);
      ctx.fillStyle = 'rgba(62, 40, 22, 0.35)';
      for (let x = left + 10; x < left + p.w; x += 34) {
        ctx.fillRect(x, top + p.h - 2, 4, 6);
      }
    }
  }

  bakeRoads(game) {
    const ctx = this.ctx;
    for (const road of game.city.roads) {
      const x = road.horizontal ? Math.min(road.x1, road.x2) : road.x1 - road.half;
      const y = road.horizontal ? road.y1 - road.half : Math.min(road.y1, road.y2);
      const w = road.horizontal ? Math.abs(road.x2 - road.x1) : road.width;
      const h = road.horizontal ? road.width : Math.abs(road.y2 - road.y1);

      ctx.fillStyle = 'rgba(64, 58, 62, 0.55)';
      ctx.fillRect(x - 5, y - 5, w + 10, h + 10);

      const grad = road.horizontal
        ? ctx.createLinearGradient(0, y, 0, y + h)
        : ctx.createLinearGradient(x, 0, x + w, 0);
      grad.addColorStop(0, road.kind === 'highway' ? '#4c4b55' : '#57515a');
      grad.addColorStop(0.45, '#4a454e');
      grad.addColorStop(1, road.kind === 'highway' ? '#4d4c56' : '#56505a');
      ctx.fillStyle = grad;
      ctx.fillRect(x, y, w, h);

      ctx.fillStyle = 'rgba(236, 225, 198, 0.16)';
      if (road.horizontal) {
        ctx.fillRect(x, y + 3, w, 2);
        ctx.fillRect(x, y + h - 5, w, 2);
      } else {
        ctx.fillRect(x + 3, y, 2, h);
        ctx.fillRect(x + w - 5, y, 2, h);
      }

      ctx.fillStyle = 'rgba(255, 255, 255, 0.022)';
      for (let g = 0; g < 8; g += 1) {
        const gy = y + 4 + ((g * 97 + road.x1 * 0.13) % Math.max(1, h - 8));
        if (road.horizontal) ctx.fillRect(x, gy, w, 1);
        else ctx.fillRect(x + 4 + ((g * 83) % Math.max(1, w - 8)), y, 1, h);
      }

      if (road.horizontal) {
        const cy = y + h / 2;
        ctx.fillStyle = 'rgba(246, 211, 112, 0.7)';
        ctx.fillRect(x, cy - 2, w, 1.5);
        ctx.fillRect(x, cy + 1, w, 1.5);
        if (road.lanes >= 4) {
          ctx.strokeStyle = 'rgba(245, 239, 224, 0.62)';
          ctx.lineWidth = 2;
          ctx.setLineDash([18, 22]);
          for (const off of [-h * 0.24, h * 0.24]) {
            ctx.beginPath();
            ctx.moveTo(x, cy + off);
            ctx.lineTo(x + w, cy + off);
            ctx.stroke();
          }
          ctx.setLineDash([]);
        }
      } else {
        const cx = x + w / 2;
        ctx.fillStyle = 'rgba(246, 211, 112, 0.7)';
        ctx.fillRect(cx - 2, y, 1.5, h);
        ctx.fillRect(cx + 1, y, 1.5, h);
        if (road.lanes >= 4) {
          ctx.strokeStyle = 'rgba(245, 239, 224, 0.62)';
          ctx.lineWidth = 2;
          ctx.setLineDash([18, 22]);
          for (const off of [-w * 0.24, w * 0.24]) {
            ctx.beginPath();
            ctx.moveTo(cx + off, y);
            ctx.lineTo(cx + off, y + h);
            ctx.stroke();
          }
          ctx.setLineDash([]);
        }
      }
      this.bakeRoadName(ctx, road);
    }

    for (const p of game.city.roadPatches) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      ctx.fillStyle = p.light ? `rgba(197, 188, 176, ${p.alpha})` : `rgba(30, 27, 32, ${p.alpha + 0.1})`;
      roundRect(ctx, -p.w / 2, -p.h / 2, p.w, p.h, Math.min(4, p.h / 2));
      ctx.fill();
      ctx.restore();
    }
    for (const c of game.city.roadCracks) {
      ctx.strokeStyle = `rgba(24, 22, 26, ${c.alpha})`;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      c.points.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.stroke();
    }

    for (const inter of game.city.intersections) {
      const hw = inter.vWidth / 2;
      const hh = inter.hWidth / 2;
      ctx.fillStyle = '#4b4650';
      ctx.fillRect(inter.x - hw, inter.y - hh, inter.vWidth, inter.hWidth);
      this.bakeCrosswalks(ctx, inter);
      ctx.fillStyle = 'rgba(240, 232, 214, 0.55)';
      ctx.fillRect(inter.x - hw - 3, inter.y - hh - 22, inter.vWidth + 6, 3);
      ctx.fillRect(inter.x - hw - 3, inter.y + hh + 19, inter.vWidth + 6, 3);
      ctx.fillRect(inter.x - hw - 22, inter.y - hh - 3, 3, inter.hWidth + 6);
      ctx.fillRect(inter.x + hw + 19, inter.y - hh - 3, 3, inter.hWidth + 6);
      ctx.fillStyle = 'rgba(30, 28, 33, 0.55)';
      ctx.beginPath();
      ctx.arc(inter.x + 18, inter.y - 14, 6, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(150, 142, 132, 0.32)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  bakeRoadName(ctx, road) {
    const len = Math.hypot(road.x2 - road.x1, road.y2 - road.y1);
    const count = Math.max(1, Math.floor(len / 800));
    ctx.save();
    ctx.fillStyle = 'rgba(240, 231, 212, 0.22)';
    ctx.font = '700 9px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    for (let i = 0; i < count; i += 1) {
      const t = (i + 0.5) / count;
      const x = road.x1 + (road.x2 - road.x1) * t;
      const y = road.y1 + (road.y2 - road.y1) * t;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(road.horizontal ? 0 : Math.PI / 2);
      ctx.fillText(road.name.toUpperCase(), 0, 0);
      ctx.restore();
    }
    ctx.restore();
  }

  bakeCrosswalks(ctx, inter) {
    const hw = inter.vWidth / 2;
    const hh = inter.hWidth / 2;
    ctx.fillStyle = 'rgba(245, 240, 225, 0.72)';
    for (const sign of [-1, 1]) {
      const bx = inter.x + sign * (hw + 14);
      for (let i = -3; i <= 3; i += 1) {
        ctx.fillRect(bx - 2, inter.y + i * (inter.hWidth / 8) - 3, 9, 4);
      }
    }
    for (const sign of [-1, 1]) {
      const by = inter.y + sign * (hh + 14);
      for (let i = -3; i <= 3; i += 1) {
        ctx.fillRect(inter.x + i * (inter.vWidth / 8) - 3, by - 2, 4, 9);
      }
    }
  }

  // =================================================================
  // Blocks
  // =================================================================
  bakeBlocks(game) {
    const ctx = this.ctx;
    for (const block of game.city.blocks) {
      const left = block.xMin;
      const top = block.yMin;
      const w = block.w;
      const h = block.h;
      const d = districtAt(block.x, block.y);

      ctx.fillStyle = d.character === 'downtown' ? '#cfc6b4' : PALETTE.sidewalk;
      roundRect(ctx, left, top, w, h, 3);
      ctx.fill();
      ctx.strokeStyle = 'rgba(80, 70, 58, 0.2)';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      ctx.strokeStyle = 'rgba(111, 96, 75, 0.13)';
      ctx.lineWidth = 1;
      for (let gx = left + 12; gx < left + w; gx += 26) {
        ctx.beginPath();
        ctx.moveTo(gx, top);
        ctx.lineTo(gx, top + h);
        ctx.stroke();
      }
      for (let gy = top + 12; gy < top + h; gy += 26) {
        ctx.beginPath();
        ctx.moveTo(left, gy);
        ctx.lineTo(left + w, gy);
        ctx.stroke();
      }

      for (let i = 0; i < 4; i += 1) {
        const h1 = game.city.hash(left + i * 37, top + i * 71, 3);
        const h2 = game.city.hash(top + i * 53, left + i * 29, 4);
        ctx.fillStyle = i % 2 === 0 ? 'rgba(255, 248, 230, 0.13)' : 'rgba(105, 90, 70, 0.09)';
        ctx.fillRect(left + 8 + h1 * Math.max(1, w - 60), top + 8 + h2 * Math.max(1, h - 40), 26 + h2 * 26, 11 + h1 * 12);
      }

      ctx.fillStyle = 'rgba(106, 92, 72, 0.22)';
      ctx.fillRect(left, top, w, 4);
      ctx.fillRect(left, top, 4, h);
      ctx.fillStyle = 'rgba(255, 250, 235, 0.14)';
      ctx.fillRect(left + 4, top + h - 5, w - 8, 2);

      const inner = 26;
      const ix = left + inner;
      const iy = top + inner;
      const iw = w - inner * 2;
      const ih = h - inner * 2;
      if (iw <= 0 || ih <= 0) continue;

      if (block.kind === 'park') {
        this.bakePark(ctx, game, block, ix, iy, iw, ih);
      } else if (block.kind === 'parking') {
        this.bakeParking(ctx, block, ix, iy, iw, ih);
      } else if (block.kind === 'plaza') {
        this.bakePlaza(ctx, block, ix, iy, iw, ih);
      } else {
        ctx.fillStyle = block.lot || d.lot;
        ctx.fillRect(ix, iy, iw, ih);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.fillRect(ix, iy, iw, 3);
        for (const alley of game.city.alleys) {
          if (Math.abs(alley.x - block.x) < block.w / 2 && Math.abs(alley.y - block.y) < block.h / 2) {
            ctx.fillStyle = 'rgba(52, 48, 50, 0.86)';
            ctx.fillRect(alley.x - alley.w / 2, alley.y - alley.h / 2, alley.w, alley.h);
            ctx.fillStyle = 'rgba(230, 220, 200, 0.12)';
            if (alley.w > alley.h) ctx.fillRect(alley.x - alley.w / 2, alley.y - 1, alley.w, 2);
            else ctx.fillRect(alley.x - 1, alley.y - alley.h / 2, 2, alley.h);
          }
        }
      }
      ctx.strokeStyle = 'rgba(90, 78, 62, 0.26)';
      ctx.lineWidth = 1.4;
      ctx.strokeRect(ix + 0.5, iy + 0.5, iw - 1, ih - 1);

      if (w > 120 && h > 120) {
        ctx.fillStyle = '#c8593f';
        ctx.beginPath();
        ctx.arc(left + 15, top + 15, 3, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#4c5a54';
        roundRect(ctx, left + w - 22, top + 14, 9, 6, 1);
        ctx.fill();
      }
    }
  }

  bakePark(ctx, game, block, ix, iy, iw, ih) {
    ctx.fillStyle = '#82a670';
    ctx.fillRect(ix, iy, iw, ih);
    ctx.fillStyle = 'rgba(116, 146, 91, 0.55)';
    for (let i = 0; i < 8; i += 1) {
      const x = ix + ((i * 67) % Math.max(1, iw - 20)) + 8;
      const y = iy + ((i * 113) % Math.max(1, ih - 20)) + 8;
      ctx.beginPath();
      ctx.arc(x, y, 5 + (i % 3) * 3, 0, TAU);
      ctx.fill();
    }
    if (iw > 80 && ih > 80) {
      ctx.fillStyle = 'rgba(219, 206, 172, 0.78)';
      ctx.fillRect(ix + iw / 2 - 7, iy, 14, ih);
      ctx.fillRect(ix, iy + ih / 2 - 7, iw, 14);
      ctx.strokeStyle = 'rgba(120, 108, 84, 0.3)';
      ctx.lineWidth = 1;
      ctx.strokeRect(ix + iw / 2 - 7.5, iy + ih / 2 - 7.5, 15, 15);
    }
    if (game.city.hash(block.x, block.y, 12) > 0.52) {
      const px = ix + iw * 0.62;
      const py = iy + ih * 0.38;
      ctx.fillStyle = 'rgba(58, 132, 148, 0.9)';
      ctx.beginPath();
      ctx.ellipse(px, py, Math.min(30, iw * 0.16), Math.min(20, ih * 0.12), 0.3, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(206, 232, 218, 0.5)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    for (let i = 0; i < 3; i += 1) {
      const bx = ix + 16 + ((i * 47) % Math.max(1, iw - 30));
      const by = iy + 18 + ((i * 71) % Math.max(1, ih - 30));
      ctx.save();
      ctx.translate(bx, by);
      ctx.rotate(block.rng * 0.01);
      ctx.fillStyle = '#8a6b4b';
      ctx.fillRect(-8, -2, 16, 3);
      ctx.fillStyle = 'rgba(70, 54, 38, 0.5)';
      ctx.fillRect(-8, 1, 16, 2);
      ctx.restore();
    }
    ctx.fillStyle = '#3c423d';
    for (const [lx, ly] of [[ix + 14, iy + 14], [ix + iw - 14, iy + 14], [ix + 14, iy + ih - 14], [ix + iw - 14, iy + ih - 14]]) {
      ctx.beginPath();
      ctx.arc(lx, ly, 2.4, 0, TAU);
      ctx.fill();
    }
  }

  bakeParking(ctx, block, ix, iy, iw, ih) {
    ctx.fillStyle = '#5e5a5f';
    ctx.fillRect(ix, iy, iw, ih);
    ctx.strokeStyle = 'rgba(232, 226, 208, 0.34)';
    ctx.lineWidth = 1.3;
    for (let x = ix + 12; x < ix + iw - 8; x += 28) {
      ctx.beginPath();
      ctx.moveTo(x, iy + 10);
      ctx.lineTo(x, iy + ih - 10);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(232, 226, 208, 0.2)';
    for (let y = iy + 30; y < iy + ih - 10; y += 52) {
      ctx.beginPath();
      ctx.moveTo(ix + 6, y);
      ctx.lineTo(ix + iw - 6, y);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(216, 205, 182, 0.6)';
    for (let x = ix + 8; x < ix + iw - 12; x += 28) ctx.fillRect(x, iy + ih - 18, 12, 3);
    void block;
  }

  bakePlaza(ctx, block, ix, iy, iw, ih) {
    ctx.fillStyle = '#cfc6b3';
    ctx.fillRect(ix, iy, iw, ih);
    ctx.strokeStyle = 'rgba(120, 108, 90, 0.22)';
    ctx.lineWidth = 1;
    for (let x = ix; x < ix + iw; x += 26) {
      ctx.beginPath();
      ctx.moveTo(x, iy);
      ctx.lineTo(x, iy + ih);
      ctx.stroke();
    }
    for (let y = iy; y < iy + ih; y += 26) {
      ctx.beginPath();
      ctx.moveTo(ix, y);
      ctx.lineTo(ix + iw, y);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(180, 165, 138, 0.6)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(block.x, block.y, Math.min(iw, ih) * 0.28, 0, TAU);
    ctx.stroke();
  }

  // =================================================================
  // Props
  // =================================================================
  bakeProps(game) {
    const ctx = this.ctx;
    for (const prop of game.city.props) this.bakeProp(ctx, game, prop);
    for (const b of game.city.billboards) this.bakeBillboard(ctx, b);
    for (const light of game.city.streetlights) {
      ctx.fillStyle = 'rgba(20, 18, 22, 0.22)';
      ctx.fillRect(light.x - 1.5, light.y - 1.5, 3, 10);
      ctx.fillStyle = '#4a4640';
      ctx.beginPath();
      ctx.arc(light.x, light.y, light.tall ? 4 : 3, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 226, 164, 0.72)';
      ctx.beginPath();
      ctx.arc(light.x, light.y, 1.7, 0, TAU);
      ctx.fill();
    }
  }

  bakeProp(ctx, game, prop) {
    const t = prop.type;
    if (t === 'bench') {
      ctx.save();
      ctx.translate(prop.x, prop.y);
      ctx.rotate(prop.angle || 0);
      ctx.fillStyle = 'rgba(30, 25, 20, 0.24)';
      ctx.fillRect(-11, 3, 24, 5);
      ctx.fillStyle = '#8a6b4b';
      ctx.fillRect(-12, -4, 24, 5);
      ctx.fillRect(-10, -9, 20, 4);
      ctx.fillStyle = '#4c4035';
      ctx.fillRect(-10, 1, 3, 6);
      ctx.fillRect(7, 1, 3, 6);
      ctx.restore();
    } else if (t === 'umbrella') {
      ctx.save();
      ctx.translate(prop.x, prop.y);
      ctx.fillStyle = 'rgba(30, 25, 20, 0.2)';
      ctx.beginPath();
      ctx.arc(4, 5, 15, 0, TAU);
      ctx.fill();
      ctx.fillStyle = prop.color || '#ff7f9e';
      ctx.beginPath();
      ctx.arc(0, 0, 15, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
      for (let i = 0; i < 6; i += 1) {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, 15, (i / 6) * TAU, (i / 6) * TAU + 0.18);
        ctx.closePath();
        ctx.fill();
      }
      ctx.fillStyle = '#6d5a44';
      ctx.beginPath();
      ctx.arc(0, 0, 2, 0, TAU);
      ctx.fill();
      ctx.restore();
    } else if (t === 'towel') {
      ctx.save();
      ctx.translate(prop.x, prop.y);
      ctx.rotate(prop.angle || 0);
      ctx.fillStyle = 'rgba(60, 45, 30, 0.15)';
      roundRect(ctx, -12, -4, 25, 10, 2);
      ctx.fill();
      ctx.fillStyle = prop.color || '#ff9db0';
      roundRect(ctx, -13, -6, 24, 10, 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.38)';
      ctx.fillRect(-13, -3, 24, 2);
      ctx.restore();
    } else if (t === 'planter') {
      ctx.fillStyle = 'rgba(30, 25, 20, 0.2)';
      ctx.beginPath();
      ctx.arc(prop.x + 2, prop.y + 3, 11, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#8f7a5f';
      roundRect(ctx, prop.x - 10, prop.y - 10, 20, 20, 3);
      ctx.fill();
      ctx.fillStyle = '#5f8a56';
      for (let i = 0; i < 5; i += 1) {
        ctx.beginPath();
        ctx.arc(prop.x - 5 + (i % 3) * 5, prop.y - 4 + Math.floor(i / 3) * 6, 4 + (i % 2), 0, TAU);
        ctx.fill();
      }
    } else if (t === 'crate') {
      ctx.save();
      ctx.translate(prop.x, prop.y);
      ctx.rotate(prop.angle || 0);
      ctx.fillStyle = 'rgba(30, 25, 20, 0.22)';
      ctx.fillRect(-10, -7, 24, 20);
      ctx.fillStyle = '#8d6b45';
      ctx.fillRect(-12, -10, 22, 20);
      ctx.strokeStyle = 'rgba(70, 50, 30, 0.6)';
      ctx.lineWidth = 1.4;
      ctx.strokeRect(-12, -10, 22, 20);
      ctx.beginPath();
      ctx.moveTo(-12, -10);
      ctx.lineTo(10, 10);
      ctx.moveTo(10, -10);
      ctx.lineTo(-12, 10);
      ctx.stroke();
      ctx.restore();
    } else if (t === 'dumpster') {
      ctx.save();
      ctx.translate(prop.x, prop.y);
      ctx.rotate(prop.angle || 0);
      ctx.fillStyle = 'rgba(30, 25, 20, 0.24)';
      ctx.fillRect(-13, -7, 28, 16);
      ctx.fillStyle = '#3f5c4b';
      roundRect(ctx, -15, -10, 28, 17, 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.fillRect(-13, -8, 24, 3);
      ctx.restore();
    } else if (t === 'fountain') {
      ctx.fillStyle = 'rgba(30, 26, 24, 0.18)';
      ctx.beginPath();
      ctx.arc(prop.x + 4, prop.y + 5, prop.r + 4, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#b7ac96';
      ctx.beginPath();
      ctx.arc(prop.x, prop.y, prop.r, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#5ab5bd';
      ctx.beginPath();
      ctx.arc(prop.x, prop.y, prop.r * 0.72, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(236, 250, 246, 0.55)';
      ctx.beginPath();
      ctx.arc(prop.x - 3, prop.y - 3, prop.r * 0.3, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(prop.x, prop.y, prop.r * 0.86, 0.3, 2.2);
      ctx.stroke();
    } else if (t === 'statue') {
      ctx.fillStyle = 'rgba(30, 26, 24, 0.24)';
      ctx.beginPath();
      ctx.arc(prop.x + 4, prop.y + 5, 18, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#9b917d';
      ctx.beginPath();
      ctx.arc(prop.x, prop.y, 16, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#d8cbb2';
      ctx.beginPath();
      ctx.arc(prop.x, prop.y - 8, 5, 0, TAU);
      ctx.fill();
      ctx.fillRect(prop.x - 3, prop.y - 4, 6, 14);
    } else if (t === 'valetSign') {
      ctx.fillStyle = '#33302d';
      ctx.fillRect(prop.x - 1, prop.y, 2, 18);
      ctx.fillStyle = '#ffd166';
      roundRect(ctx, prop.x - 13, prop.y - 10, 26, 12, 2);
      ctx.fill();
      ctx.fillStyle = '#2a2520';
      ctx.font = '800 7px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('VALET', prop.x, prop.y - 2);
    } else if (t === 'garageSign') {
      ctx.fillStyle = '#2c2620';
      ctx.fillRect(prop.x - 1, prop.y, 2, 24);
      ctx.fillStyle = '#ffb45c';
      roundRect(ctx, prop.x - 16, prop.y - 12, 32, 14, 2);
      ctx.fill();
      ctx.fillStyle = '#231b14';
      ctx.font = '900 6px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('REPAIR', prop.x, prop.y - 3);
    } else if (t === 'newsbox') {
      ctx.fillStyle = 'rgba(30, 25, 20, 0.2)';
      ctx.fillRect(prop.x - 5, prop.y - 4, 12, 10);
      ctx.fillStyle = '#c4533d';
      ctx.fillRect(prop.x - 6, prop.y - 7, 11, 12);
      ctx.fillStyle = '#f4ead6';
      ctx.fillRect(prop.x - 4, prop.y - 5, 7, 4);
    } else if (t === 'stall') {
      ctx.save();
      ctx.translate(prop.x, prop.y);
      ctx.fillStyle = 'rgba(30, 25, 20, 0.22)';
      ctx.fillRect(-15, -8, 36, 24);
      ctx.fillStyle = '#8a6b4b';
      ctx.fillRect(-17, -10, 34, 14);
      ctx.fillStyle = '#c95a5a';
      for (let i = 0; i < 4; i += 1) ctx.fillRect(-17 + i * 9, -10, 5, 6);
      ctx.fillStyle = '#f0c96a';
      for (let i = 0; i < 5; i += 1) ctx.beginPath(), ctx.arc(-12 + i * 6, -4 + (i % 2) * 4, 2.2, 0, TAU), ctx.fill();
      ctx.restore();
    } else if (t === 'lifeguard') {
      ctx.fillStyle = 'rgba(30, 25, 20, 0.2)';
      ctx.fillRect(prop.x - 11, prop.y - 6, 29, 26);
      ctx.fillStyle = '#f0dfbd';
      ctx.fillRect(prop.x - 14, prop.y - 10, 28, 20);
      ctx.fillStyle = '#d75a5a';
      ctx.fillRect(prop.x - 14, prop.y - 10, 28, 4);
      ctx.fillStyle = '#7b6a52';
      ctx.fillRect(prop.x - 12, prop.y + 10, 3, 6);
      ctx.fillRect(prop.x + 9, prop.y + 10, 3, 6);
    } else if (t === 'boat') {
      ctx.save();
      ctx.translate(prop.x, prop.y);
      ctx.rotate(prop.angle || 0);
      ctx.fillStyle = 'rgba(10, 38, 46, 0.32)';
      ctx.beginPath();
      ctx.ellipse(3, 4, 10, 24, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = prop.color || '#f4f1e8';
      ctx.beginPath();
      ctx.ellipse(0, 0, 9, 23, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#2d5866';
      ctx.beginPath();
      ctx.ellipse(0, -3, 5, 10, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(0, 0, 6, 19, 0, 0, TAU);
      ctx.stroke();
      ctx.restore();
    } else if (t === 'gazebo') {
      ctx.fillStyle = 'rgba(30, 26, 22, 0.22)';
      ctx.beginPath();
      ctx.arc(prop.x + 4, prop.y + 6, prop.r, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#d9cbb2';
      ctx.beginPath();
      ctx.arc(prop.x, prop.y, prop.r, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = '#a28f70';
      ctx.lineWidth = 3;
      for (let i = 0; i < 6; i += 1) {
        const a = (i / 6) * TAU;
        ctx.beginPath();
        ctx.moveTo(prop.x, prop.y);
        ctx.lineTo(prop.x + Math.cos(a) * prop.r, prop.y + Math.sin(a) * prop.r);
        ctx.stroke();
      }
    } else if (t === 'plazaRing') {
      ctx.strokeStyle = 'rgba(184, 168, 138, 0.6)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(prop.x, prop.y, prop.r, 0, TAU);
      ctx.stroke();
    } else if (t === 'lamp') {
      ctx.fillStyle = '#3c423d';
      ctx.beginPath();
      ctx.arc(prop.x, prop.y, 2.5, 0, TAU);
      ctx.fill();
    }
    void game;
  }

  bakeBillboard(ctx, b) {
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.fillStyle = 'rgba(20, 16, 20, 0.3)';
    ctx.fillRect(-30, -10, 66, 26);
    ctx.fillStyle = '#22252a';
    ctx.fillRect(-34, -16, 68, 20);
    ctx.fillStyle = b.color;
    ctx.font = '900 10px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(b.text, 0, -3);
    ctx.fillStyle = '#555a5f';
    ctx.fillRect(-2, 4, 4, 10);
    ctx.restore();
  }

  bakeRamps(game) {
    const ctx2 = this.ctx;
    for (const ramp of game.city.ramps) {
      ctx2.save();
      ctx2.translate(ramp.x, ramp.y);
      ctx2.rotate(ramp.angle);
      // Shadow and slab.
      ctx2.fillStyle = 'rgba(20, 18, 22, 0.3)';
      roundRect(ctx2, -ramp.w / 2 + 6, -ramp.h / 2 + 7, ramp.w, ramp.h, 4);
      ctx2.fill();
      ctx2.fillStyle = '#5d5962';
      roundRect(ctx2, -ramp.w / 2, -ramp.h / 2, ramp.w, ramp.h, 4);
      ctx2.fill();
      // Rising deck: brighter nose.
      const grad = ctx2.createLinearGradient(-ramp.w / 2, 0, ramp.w / 2, 0);
      grad.addColorStop(0, '#7a7580');
      grad.addColorStop(0.6, '#918a92');
      grad.addColorStop(1, '#c2b7ae');
      ctx2.fillStyle = grad;
      roundRect(ctx2, -ramp.w / 2 + 3, -ramp.h / 2 + 3, ramp.w - 6, ramp.h - 6, 3);
      ctx2.fill();
      // Warning stripes.
      ctx2.save();
      roundRect(ctx2, -ramp.w / 2 + 4, -ramp.h / 2 + 4, ramp.w - 8, ramp.h - 8, 2);
      ctx2.clip();
      for (let x = -ramp.w / 2; x < ramp.w / 2 + 20; x += 18) {
        ctx2.fillStyle = 'rgba(255, 209, 102, 0.6)';
        ctx2.beginPath();
        ctx2.moveTo(x, -ramp.h / 2);
        ctx2.lineTo(x + 8, -ramp.h / 2);
        ctx2.lineTo(x + 8 - 14, ramp.h / 2);
        ctx2.lineTo(x - 14, ramp.h / 2);
        ctx2.closePath();
        ctx2.fill();
      }
      ctx2.restore();
      // Chevrons.
      ctx2.fillStyle = 'rgba(255, 246, 220, 0.9)';
      for (let i = 0; i < 2; i += 1) {
        const cx = ramp.w * 0.12 + i * 12;
        ctx2.beginPath();
        ctx2.moveTo(cx - 5, -9);
        ctx2.lineTo(cx + 4, 0);
        ctx2.lineTo(cx - 5, 9);
        ctx2.lineTo(cx - 1, 9);
        ctx2.lineTo(cx + 8, 0);
        ctx2.lineTo(cx - 1, -9);
        ctx2.closePath();
        ctx2.fill();
      }
      ctx2.restore();
    }
  }

  // =================================================================
  // Buildings
  // =================================================================
  bakeBuildings(game) {
    const ctx = this.ctx;
    const detailed = this.detail;
    const sorted = game.city.buildings.slice().sort((a, b) => a.y - b.y);
    for (const b of sorted) {
      const left = b.x - b.w / 2;
      const top = b.y - b.h / 2;
      const lift = Math.min(26, (b.height || 16) * 0.24);
      const ox = -lift * 0.5;
      const oy = -lift * 0.8;

      ctx.fillStyle = 'rgba(24, 20, 20, 0.2)';
      roundRect(ctx, left + 7, top + 10, b.w, b.h, 3);
      ctx.fill();
      ctx.fillStyle = 'rgba(24, 20, 20, 0.08)';
      roundRect(ctx, left + 14, top + 19, b.w, b.h, 4);
      ctx.fill();

      ctx.fillStyle = this.shade(b.color, -0.24);
      roundRect(ctx, left, top, b.w, b.h, 2.5);
      ctx.fill();
      ctx.fillStyle = this.shade(b.color, -0.12);
      roundRect(ctx, left + ox * 0.35, top + oy * 0.35, b.w, b.h, 2.5);
      ctx.fill();

      this.bakeFacade(ctx, game, b, left, top, detailed);

      const rx = left + ox;
      const ry = top + oy;
      ctx.fillStyle = b.roofColor || '#5b5248';
      roundRect(ctx, rx, ry, b.w * 0.94, b.h * 0.94, 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 250, 235, 0.14)';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      if (b.type === 'tower') {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.055)';
        for (let gy = ry + 8; gy < ry + b.h * 0.9; gy += 10) ctx.fillRect(rx + 6, gy, b.w * 0.9 - 12, 1);
        for (let gx = rx + 8; gx < rx + b.w * 0.9; gx += 14) ctx.fillRect(gx, ry + 5, 1, b.h * 0.88 - 10);
      } else if (b.type === 'warehouse' || b.type === 'container') {
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.12)';
        ctx.lineWidth = 1.2;
        for (let gx = rx + 6; gx < rx + b.w * 0.92; gx += 6) {
          ctx.beginPath();
          ctx.moveTo(gx, ry + 4);
          ctx.lineTo(gx, ry + b.h * 0.9 - 4);
          ctx.stroke();
        }
      } else {
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)';
        ctx.lineWidth = 1;
        ctx.strokeRect(rx + 4.5, ry + 4.5, b.w * 0.94 - 9, b.h * 0.94 - 9);
      }

      if (detailed) this.bakeRoofProps(ctx, game, b, rx, ry);

      if (b.hasRoofPool || b.hasPool) {
        const poolX = b.hasRoofPool ? rx + b.w * 0.55 : left + b.w + 12;
        const poolY = b.hasRoofPool ? ry + b.h * 0.35 : top + b.h * 0.55;
        ctx.fillStyle = '#3ba9bd';
        roundRect(ctx, poolX, poolY, 22, 13, 3);
        ctx.fill();
        ctx.strokeStyle = 'rgba(239, 251, 248, 0.55)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      if (b.hasHelipad) {
        const hx = rx + b.w * 0.5;
        const hy = ry + b.h * 0.5;
        ctx.fillStyle = 'rgba(236, 231, 217, 0.42)';
        ctx.beginPath();
        ctx.arc(hx, hy, Math.min(18, b.w * 0.2), 0, TAU);
        ctx.fill();
        ctx.strokeStyle = 'rgba(245, 240, 224, 0.7)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(hx, hy, Math.min(18, b.w * 0.2), 0, TAU);
        ctx.stroke();
        ctx.fillStyle = 'rgba(70, 66, 58, 0.6)';
        ctx.font = '900 12px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('H', hx, hy + 4);
      }

      if (detailed && b.awning) {
        const aw = Math.min(b.w * 0.8, 86);
        ctx.fillStyle = b.awningColor || '#c45a5a';
        ctx.fillRect(b.x - aw / 2, top + b.h - 2, aw, 9);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.34)';
        for (let i = 0; i < aw; i += 10) ctx.fillRect(b.x - aw / 2 + i, top + b.h - 2, 4, 9);
        ctx.fillStyle = 'rgba(20, 16, 14, 0.16)';
        ctx.fillRect(b.x - aw / 2, top + b.h + 6, aw, 4);
      }

      if (b.neonText && detailed) this.bakeSign(ctx, b, left, top);

      if (b.rollerDoors) {
        for (let i = 0; i < b.rollerDoors; i += 1) {
          const dw = 18;
          const dx = left + 12 + i * (b.w - 30) / Math.max(1, b.rollerDoors);
          ctx.fillStyle = 'rgba(48, 52, 54, 0.8)';
          ctx.fillRect(dx, top + b.h - 5, dw, 7);
          ctx.strokeStyle = 'rgba(210, 206, 196, 0.35)';
          ctx.lineWidth = 0.8;
          for (let yy = top + b.h - 4; yy < top + b.h + 1; yy += 2) {
            ctx.beginPath();
            ctx.moveTo(dx, yy);
            ctx.lineTo(dx + dw, yy);
            ctx.stroke();
          }
        }
      }

      if (b.garden) {
        ctx.strokeStyle = 'rgba(96, 130, 79, 0.5)';
        ctx.lineWidth = 3;
        ctx.strokeRect(left - 5, top - 5, b.w + 10, b.h + 10);
      }
    }
  }

  bakeFacade(ctx, game, b, left, top, detailed) {
    if (!detailed) return;
    const c = b.color || '#9a8d7d';
    const rows = Math.min(5, b.windowRows || 2);
    const cols = b.windowCols || 3;
    const southY = top + b.h;
    const eastX = left + b.w;
    const wallDepth = 6;
    ctx.fillStyle = this.shade(c, -0.32);
    ctx.fillRect(left + 3, southY - wallDepth, b.w - 6, wallDepth);
    ctx.fillRect(eastX - wallDepth, top + 3, wallDepth, b.h - 6);

    const lit = game.city.hash(b.x, b.y, 8);
    for (let r = 0; r < rows; r += 1) {
      for (let i = 0; i < cols; i += 1) {
        const wx = left + 9 + (i + 0.5) * ((b.w - 18) / cols) - 3;
        const litHere = game.city.hash(b.x + i * 17, b.y + r * 31, 9) > 0.34;
        ctx.fillStyle = litHere ? `rgba(255, 224, 164, ${0.62 + lit * 0.2})` : 'rgba(38, 42, 47, 0.78)';
        ctx.fillRect(wx, southY - wallDepth + 0.5 + r * 1.1, 5, 2);
        const wy = top + 10 + (r + 0.5) * ((b.h - 18) / rows) - 2;
        ctx.fillRect(eastX - wallDepth + 0.5, wy, 2, 5);
      }
    }
    if (b.type === 'lowrise' || b.type === 'landmark') {
      ctx.fillStyle = 'rgba(150, 214, 216, 0.42)';
      const glassW = (b.w - 24) / Math.max(1, b.shopWindows || 2);
      for (let i = 0; i < (b.shopWindows || 2); i += 1) {
        ctx.fillRect(left + 12 + i * glassW, southY - 5.5, glassW - 4, 4);
      }
    }
  }

  bakeSign(ctx, b, left, top) {
    const text = b.neonText;
    ctx.save();
    ctx.font = '800 8px "Segoe UI", Arial, sans-serif';
    const w = Math.min(b.w - 8, Math.max(34, ctx.measureText(text).width + 14));
    const x = b.x - w / 2;
    const y = top + b.h - 15;
    ctx.fillStyle = 'rgba(16, 14, 20, 0.72)';
    roundRect(ctx, x, y, w, 12, 2);
    ctx.fill();
    ctx.strokeStyle = b.neonColor || '#ff7fa5';
    ctx.lineWidth = 0.8;
    ctx.stroke();
    ctx.fillStyle = b.neonColor || '#ff7fa5';
    ctx.textAlign = 'center';
    ctx.shadowColor = b.neonColor || '#ff7fa5';
    ctx.shadowBlur = 4;
    ctx.fillText(text, b.x, y + 8.6);
    ctx.shadowBlur = 0;
    ctx.restore();
    void left;
  }

  bakeRoofProps(ctx, game, b, rx, ry) {
    if (!b.roofProps) return;
    for (const prop of b.roofProps) {
      const x = rx + b.w * 0.47 + prop.dx;
      const y = ry + b.h * 0.47 + prop.dy;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(prop.rotate || 0);
      if (prop.type === 'ac') {
        ctx.fillStyle = 'rgba(20, 20, 22, 0.28)';
        ctx.fillRect(-prop.size / 2 + 2, -prop.size / 3 + 3, prop.size, prop.size * 0.66);
        ctx.fillStyle = '#b5b0a5';
        ctx.fillRect(-prop.size / 2, -prop.size / 3, prop.size, prop.size * 0.66);
        ctx.fillStyle = '#7a7770';
        for (let i = 0; i < 3; i += 1) ctx.fillRect(-prop.size / 2 + 2, -prop.size / 3 + 2 + i * 3, prop.size - 4, 1);
      } else if (prop.type === 'tank') {
        ctx.fillStyle = 'rgba(20, 20, 22, 0.28)';
        ctx.beginPath();
        ctx.arc(2, 3, prop.size / 2, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#8c7f6b';
        ctx.beginPath();
        ctx.arc(0, 0, prop.size / 2, 0, TAU);
        ctx.fill();
        ctx.fillStyle = 'rgba(240, 228, 202, 0.25)';
        ctx.beginPath();
        ctx.arc(-2, -2, prop.size / 3, 0, TAU);
        ctx.fill();
      } else if (prop.type === 'vent') {
        ctx.fillStyle = '#6f6b63';
        ctx.fillRect(-prop.size / 3, -prop.size / 3, prop.size * 0.66, prop.size * 0.66);
        ctx.strokeStyle = 'rgba(230, 225, 215, 0.35)';
        ctx.lineWidth = 1;
        ctx.strokeRect(-prop.size / 3, -prop.size / 3, prop.size * 0.66, prop.size * 0.66);
      } else if (prop.type === 'dish') {
        ctx.fillStyle = '#d6d1c4';
        ctx.beginPath();
        ctx.arc(0, 0, prop.size / 2, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#8e8a80';
        ctx.beginPath();
        ctx.arc(0, 0, prop.size / 4, 0, TAU);
        ctx.fill();
      } else if (prop.type === 'solar') {
        ctx.fillStyle = '#334a62';
        ctx.fillRect(-prop.size / 2, -prop.size / 3, prop.size, prop.size * 0.66);
        ctx.strokeStyle = 'rgba(150, 205, 230, 0.4)';
        ctx.lineWidth = 0.7;
        for (let i = 0; i < 3; i += 1) {
          ctx.beginPath();
          ctx.moveTo(-prop.size / 2 + i * prop.size / 3, -prop.size / 3);
          ctx.lineTo(-prop.size / 2 + i * prop.size / 3, prop.size / 3);
          ctx.stroke();
        }
      } else if (prop.type === 'garden') {
        ctx.fillStyle = 'rgba(92, 132, 79, 0.8)';
        roundRect(ctx, -prop.size / 2, -prop.size / 3, prop.size, prop.size * 0.66, 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
        for (let i = 0; i < 3; i += 1) ctx.fillRect(-prop.size / 2 + i * 4, -prop.size / 3 + 2, 2, 2);
      }
      ctx.restore();
    }
    void game;
  }

  shade(hex, amount) {
    if (!hex || hex[0] !== '#') return hex || '#888';
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255;
    let g = (n >> 8) & 255;
    let b = n & 255;
    if (amount < 0) {
      r *= 1 + amount;
      g *= 1 + amount;
      b *= 1 + amount;
    } else {
      r += (255 - r) * amount;
      g += (255 - g) * amount;
      b += (255 - b) * amount;
    }
    return `rgb(${r | 0}, ${g | 0}, ${b | 0})`;
  }

  hexAlpha(hex, alpha) {
    if (!hex || hex[0] !== '#' || hex.length < 7) return `rgba(255, 220, 160, ${alpha})`;
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
  }

  // =================================================================
  // Animated water and shore
  // =================================================================
  drawWaterAnimation(game) {
    const v = this.view;
    if (v.x2 < 2660) return;
    const ctx = this.ctx;
    const time = game.worldTime || 0;
    const storm = game.weather?.type === 'storm' ? 1.5 : game.weather?.type === 'rain' ? 1.15 : 1;
    ctx.save();
    ctx.beginPath();
    ctx.rect(2712, Math.max(0, v.y - 20), 488, Math.min(3200, v.y2 - v.y + 40));
    ctx.clip();

    ctx.strokeStyle = `rgba(206, 246, 244, ${0.13 + 0.05 * storm})`;
    ctx.lineWidth = 1.4 * storm;
    const yStart = Math.max(0, Math.floor(v.y / 52) * 52 - 52);
    const yEnd = Math.min(3200, v.y2 + 52);
    for (let y = yStart; y < yEnd; y += 52) {
      const xFrom = Math.max(2740, v.x - 40);
      const xTo = Math.min(3200, v.x2 + 40);
      ctx.beginPath();
      for (let x = xFrom; x < xTo; x += 30) {
        const wy = y + Math.sin(x * 0.018 + time * 1.6 + y * 0.01) * 6;
        if (x === xFrom) ctx.moveTo(x, wy);
        else ctx.lineTo(x, wy);
      }
      ctx.stroke();
    }

    for (let i = 0; i < 30; i += 1) {
      const x = 2740 + ((i * 173 + time * 22) % 450);
      const y = (i * 271 + time * 9) % 3200;
      const a = 0.08 + 0.18 * (0.5 + 0.5 * Math.sin(time * 2 + i));
      ctx.fillStyle = `rgba(230, 252, 248, ${a})`;
      ctx.fillRect(x, y, 4, 1.4);
    }

    // Marina wake lines.
    ctx.strokeStyle = 'rgba(190, 240, 238, 0.16)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 5; i += 1) {
      const y = 2050 + i * 62 + Math.sin(time * 0.9 + i) * 8;
      ctx.beginPath();
      ctx.moveTo(2740, y);
      ctx.quadraticCurveTo(2830, y + 12, 2920, y - 4);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawShore(game) {
    const v = this.view;
    if (v.x2 < 2660) return;
    const ctx = this.ctx;
    const time = game.worldTime || 0;
    const x = 2712 + Math.sin(time * 1.3) * 2.5;
    ctx.strokeStyle = 'rgba(246, 255, 252, 0.74)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    const start = Math.max(0, Math.floor(v.y / 16) * 16);
    for (let y = start; y <= Math.min(3200, v.y2 + 16); y += 16) {
      const wx = x + Math.sin(y * 0.03 + time * 1.9) * 4 + Math.sin(y * 0.09 + time * 2.7) * 1.4;
      if (y === start) ctx.moveTo(wx, y);
      else ctx.lineTo(wx, y);
    }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(200, 244, 242, 0.32)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    const start2 = Math.max(0, Math.floor(v.y / 20) * 20);
    for (let y = start2; y <= Math.min(3200, v.y2 + 20); y += 20) {
      const wx = x + 12 + Math.sin(y * 0.024 + time * 1.4 + 1) * 7;
      if (y === start2) ctx.moveTo(wx, y);
      else ctx.lineTo(wx, y);
    }
    ctx.stroke();
  }

  // =================================================================
  // Road life
  // =================================================================
  drawRoadLife(game) {
    const ctx = this.ctx;
    for (const s of game.city.skidMarks) {
      if (!this.inView(s.x, s.y, 18)) continue;
      const fade = clamp(1 - s.age / 24, 0, 1);
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.angle);
      ctx.fillStyle = `rgba(20, 18, 22, ${s.alpha * fade * 0.52})`;
      roundRect(ctx, -7, -1.8, 14, 3.6, 1.4);
      ctx.fill();
      ctx.restore();
    }

    // Puddles are always visible as damp patches; rain fills them.
    const wet = game.weather?.wetness ?? 0;
    for (const p of game.city.puddles) {
      if (!this.inView(p.x, p.y, 70)) continue;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      const grad = ctx.createLinearGradient(-p.rx, 0, p.rx, 0);
      grad.addColorStop(0, `rgba(76, 122, 140, ${0.08 + wet * 0.18})`);
      grad.addColorStop(0.5, `rgba(186, 224, 232, ${0.12 + wet * 0.24})`);
      grad.addColorStop(1, `rgba(74, 108, 126, ${0.08 + wet * 0.16})`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(0, 0, p.rx * (0.85 + wet * 0.35), p.ry * (0.9 + wet * 0.25), 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = `rgba(220, 245, 248, ${p.alpha * (0.4 + wet * 0.5)})`;
      ctx.lineWidth = 1;
      ctx.stroke();
      if (wet > 0.08) {
        const neon = districtAt(p.x, p.y).neon;
        ctx.strokeStyle = neon;
        ctx.globalAlpha = Math.min(0.4, wet * 0.4);
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(-p.rx * 0.6, -1);
        ctx.lineTo(p.rx * 0.6, 1);
        ctx.stroke();
      }
      ctx.restore();
    }

    const dark = this.lightInfo(game).dark;
    for (const light of game.city.trafficLights) {
      if (!this.inView(light.x, light.y, 20)) continue;
      const red = light.state === 'red';
      ctx.fillStyle = '#26282a';
      roundRect(ctx, light.x - 3, light.y - 9, 6, 15, 2);
      ctx.fill();
      ctx.fillStyle = red ? '#ff4f4f' : 'rgba(70, 38, 38, 0.6)';
      ctx.beginPath();
      ctx.arc(light.x, light.y - 5, 1.9, 0, TAU);
      ctx.fill();
      ctx.fillStyle = red ? 'rgba(70, 90, 58, 0.55)' : '#5cf08a';
      ctx.beginPath();
      ctx.arc(light.x, light.y + 2, 1.9, 0, TAU);
      ctx.fill();
      if (dark > 0.1) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = dark * 0.5;
        ctx.fillStyle = red ? '#ff4f4f' : '#5cf08a';
        ctx.beginPath();
        ctx.arc(light.x, light.y + (red ? -5 : 2), 7, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
    }
  }

  drawRampsLive(game) {
    const ctx = this.ctx;
    const time = game.worldTime || 0;
    for (const ramp of game.city.ramps) {
      if (!this.inView(ramp.x, ramp.y, 70)) continue;
      const pulse = 0.5 + 0.5 * Math.sin(time * 3 + ramp.x);
      ctx.save();
      ctx.translate(ramp.x, ramp.y);
      ctx.rotate(ramp.angle);
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(255, 209, 102, ${0.05 + pulse * 0.07})`;
      roundRect(ctx, -ramp.w / 2, -ramp.h / 2, ramp.w, ramp.h, 4);
      ctx.fill();
      ctx.strokeStyle = `rgba(255, 226, 165, ${0.25 + pulse * 0.4})`;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }
  }

  // =================================================================
  // Wet reflections
  // =================================================================
  drawWetReflections(game) {
    const wet = game.weather?.wetness ?? 0;
    if (wet < 0.05) return;
    const ctx = this.ctx;
    const v = this.view;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    // Long neon smears on the asphalt where signs face the road.
    for (const b of game.city.buildings) {
      if (!b.neonText || !this.inView(b.x, b.y, 90)) continue;
      const y = b.y + b.h / 2;
      const g = ctx.createLinearGradient(b.x, y, b.x, y + 90 * wet);
      g.addColorStop(0, this.hexAlpha(b.neonColor, 0.12 * wet));
      g.addColorStop(0.4, this.hexAlpha(b.neonColor, 0.05 * wet));
      g.addColorStop(1, this.hexAlpha(b.neonColor, 0));
      ctx.fillStyle = g;
      ctx.fillRect(b.x - 16, y, 32, 90 * wet);
    }

    // Mirrored tail/head lights under moving cars.
    for (const car of this.visibleVehicles(game)) {
      if (car.isDestroyed) continue;
      const fx = Math.cos(car.angle);
      const fy = Math.sin(car.angle);
      const nx = -fy;
      const ny = fx;
      const speed = Math.hypot(car.vx, car.vy);
      const alpha = clamp(0.05 + wet * 0.12, 0, 0.18) * clamp(speed / 160, 0.4, 1);
      const streak = 24 + wet * 50;
      for (const side of [-1, 1]) {
        const lx = car.x - fx * car.length * 0.46 + nx * car.width * 0.28 * side;
        const ly = car.y - fy * car.length * 0.46 + ny * car.width * 0.28 * side;
        const g = ctx.createLinearGradient(lx, ly, lx + fx * streak, ly + fy * streak);
        g.addColorStop(0, `rgba(255, 70, 80, ${alpha})`);
        g.addColorStop(1, 'rgba(255, 70, 80, 0)');
        ctx.strokeStyle = g;
        ctx.lineWidth = 4 + wet * 4;
        ctx.beginPath();
        ctx.moveTo(lx, ly);
        ctx.lineTo(lx + fx * streak, ly + fy * streak);
        ctx.stroke();
      }
      const hx = car.x + fx * car.length * 0.46;
      const hy = car.y + fy * car.length * 0.46;
      const hg = ctx.createLinearGradient(hx, hy, hx + fx * (streak * 0.7), hy + fy * (streak * 0.7));
      hg.addColorStop(0, `rgba(255, 244, 210, ${alpha * 0.7})`);
      hg.addColorStop(1, 'rgba(255, 244, 210, 0)');
      ctx.strokeStyle = hg;
      ctx.lineWidth = 6 + wet * 4;
      ctx.beginPath();
      ctx.moveTo(hx, hy);
      ctx.lineTo(hx + fx * streak * 0.7, hy + fy * streak * 0.7);
      ctx.stroke();
    }

    // A soft sheen over every road in view.
    ctx.fillStyle = `rgba(120, 184, 202, ${0.018 + wet * 0.022})`;
    for (const road of game.city.roads) {
      if (road.horizontal) {
        if (road.y1 < v.y - 80 || road.y1 > v.y2 + 80) continue;
        ctx.fillRect(Math.max(v.x, road.x1), road.y1 - road.half * 0.7, Math.min(v.x2, road.x2) - Math.max(v.x, road.x1), road.half * 1.4);
      } else {
        if (road.x1 < v.x - 80 || road.x1 > v.x2 + 80) continue;
        ctx.fillRect(road.x1 - road.half * 0.7, Math.max(v.y, road.y1), road.half * 1.4, Math.min(v.y2, road.y2) - Math.max(v.y, road.y1));
      }
    }
    ctx.restore();
  }

  visibleVehicles(game) {
    const out = [];
    for (const list of [game.traffic?.vehicles, game.traffic?.parked, game.police?.cops, game.police?.roadblocks]) {
      if (!list) continue;
      for (const v of list) if (this.inView(v.x, v.y, 100)) out.push(v);
    }
    return out;
  }

  // =================================================================
  // Lighting
  // =================================================================
  drawGroundLighting(game) {
    const li = this.lightInfo(game);
    const dark = li.dark;
    if (dark < 0.04) return;
    const ctx = this.ctx;
    const wet = game.weather?.wetness || 0;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    for (const light of game.city.streetlights) {
      if (!this.inView(light.x, light.y, light.radius)) continue;
      const r = light.radius * (0.56 + wet * 0.1);
      const g = ctx.createRadialGradient(light.x, light.y, 1, light.x, light.y, r);
      g.addColorStop(0, `rgba(255, 226, 170, ${0.1 * dark})`);
      g.addColorStop(0.28, `rgba(255, 216, 154, ${0.066 * dark})`);
      g.addColorStop(0.55, `rgba(255, 200, 134, ${0.03 * dark})`);
      g.addColorStop(0.8, `rgba(255, 186, 112, ${0.01 * dark})`);
      g.addColorStop(1, 'rgba(255, 180, 100, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(light.x, light.y, r, 0, TAU);
      ctx.fill();
    }

    for (const b of game.city.buildings) {
      if (!b.neonText || !this.inView(b.x, b.y, 84)) continue;
      const r = 56;
      const g = ctx.createRadialGradient(b.x, b.y, 2, b.x, b.y, r);
      g.addColorStop(0, this.hexAlpha(b.neonColor, 0.13 * dark));
      g.addColorStop(0.34, this.hexAlpha(b.neonColor, 0.072 * dark));
      g.addColorStop(0.68, this.hexAlpha(b.neonColor, 0.02 * dark));
      g.addColorStop(1, this.hexAlpha(b.neonColor, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(b.x, b.y, r, 0, TAU);
      ctx.fill();
    }

    for (const v of this.visibleVehicles(game)) {
      if (!v.headlightsOn || v.isDestroyed || v.aiMode === 'parked') continue;
      const driven = v === game.player.vehicle || v.driver || Math.hypot(v.vx || 0, v.vy || 0) > 24;
      if (!driven) continue;
      const fx = Math.cos(v.angle);
      const fy = Math.sin(v.angle);
      const noseX = v.x + fx * v.length * 0.5;
      const noseY = v.y + fy * v.length * 0.5;
      const len = 128 + wet * 16;
      ctx.save();
      ctx.translate(noseX, noseY);
      ctx.rotate(v.angle);
      const cone = ctx.createLinearGradient(0, 0, len, 0);
      cone.addColorStop(0, `rgba(255, 242, 212, ${0.085 * dark})`);
      cone.addColorStop(0.16, `rgba(255, 236, 196, ${0.058 * dark})`);
      cone.addColorStop(0.52, `rgba(255, 226, 178, ${0.024 * dark})`);
      cone.addColorStop(0.82, `rgba(255, 220, 168, ${0.007 * dark})`);
      cone.addColorStop(1, 'rgba(255, 218, 160, 0)');
      ctx.fillStyle = cone;
      ctx.beginPath();
      ctx.moveTo(0, -v.width * 0.3);
      ctx.lineTo(len, -v.width * 0.5);
      ctx.lineTo(len, v.width * 0.5);
      ctx.lineTo(0, v.width * 0.3);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    for (const cop of game.police?.cops || []) {
      if (!cop.sirenActive || cop.isDestroyed || !this.inView(cop.x, cop.y, 90)) continue;
      const fx = Math.cos(cop.angle);
      const fy = Math.sin(cop.angle);
      const rx = -fy;
      const ry = fx;
      const lampX = cop.x + fx * cop.length * 0.16;
      const lampY = cop.y + fy * cop.length * 0.16;
      const redA = cop.sirenPhase ? 0.11 : 0.035;
      const blueA = cop.sirenPhase ? 0.035 : 0.11;
      for (const [off, rgb, a] of [
        [-cop.width * 0.22, '255, 72, 92', redA],
        [cop.width * 0.22, '92, 166, 255', blueA],
      ]) {
        const gx = lampX + rx * off;
        const gy = lampY + ry * off;
        const radius = 28;
        const g = ctx.createRadialGradient(gx, gy, 1, gx, gy, radius);
        g.addColorStop(0, `rgba(${rgb}, ${a * dark})`);
        g.addColorStop(0.45, `rgba(${rgb}, ${a * 0.5 * dark})`);
        g.addColorStop(0.75, `rgba(${rgb}, ${a * 0.14 * dark})`);
        g.addColorStop(1, `rgba(${rgb}, 0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(gx, gy, radius, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  drawSearchCones(game) {
    const police = game.police;
    if (!police || police.wantedStars <= 0) return;
    const ctx = this.ctx;
    const pulse = 0.35 + 0.2 * Math.sin((game.worldTime || 0) * 5);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const units = [
      ...(police.cops || []).map((c) => ({ x: c.x, y: c.y, angle: c.angle, radius: 205 })),
      ...(police.footCops || []).filter((f) => !f.isDead).map((f) => ({ x: f.x, y: f.y, angle: f.angle, radius: 145 })),
    ];
    for (const u of units) {
      if (!this.inView(u.x, u.y, u.radius + 40)) continue;
      ctx.save();
      ctx.translate(u.x, u.y);
      ctx.rotate(u.angle);
      const grad = ctx.createRadialGradient(0, 0, 8, 0, 0, u.radius);
      grad.addColorStop(0, `rgba(110, 184, 255, ${pulse * 0.055})`);
      grad.addColorStop(0.55, `rgba(90, 160, 255, ${pulse * 0.028})`);
      grad.addColorStop(0.85, `rgba(80, 150, 255, ${pulse * 0.008})`);
      grad.addColorStop(1, 'rgba(70, 140, 255, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, u.radius, -0.4, 0.4);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  // =================================================================
  // Palms
  // =================================================================
  drawPalms(game) {
    const ctx = this.ctx;
    const time = game.worldTime || 0;
    const wind = 0.5 + (game.weather?.wind || 0.3) * 0.9;
    for (const palm of game.city.palmTrees) {
      if (!this.inView(palm.x, palm.y, palm.size * 2 + 30)) continue;
      const size = palm.size;
      const sway = Math.sin(time * (0.7 + wind * 0.55) + palm.x * 0.013 + palm.y * 0.009) * (0.12 + wind * 0.09);
      const sway2 = Math.sin(time * 1.35 + palm.y * 0.017) * 0.05;
      const li = this.lightInfo(game);
      const shadowOff = li.daylight > 0.1 ? li.shadowLen * 8 : 3;
      const sg = ctx.createRadialGradient(palm.x + shadowOff, palm.y + shadowOff * 0.6, 2, palm.x + shadowOff, palm.y + shadowOff * 0.6, size * 0.9);
      sg.addColorStop(0, 'rgba(18, 24, 14, 0.26)');
      sg.addColorStop(1, 'rgba(18, 24, 14, 0)');
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.ellipse(palm.x + shadowOff, palm.y + shadowOff * 0.6, size * 0.85, size * 0.5, 0.2, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = '#7d6748';
      ctx.lineWidth = Math.max(2.5, size * 0.11);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(palm.x, palm.y + size * 0.1);
      ctx.quadraticCurveTo(palm.x + sway * size * 0.25, palm.y - size * 0.05, palm.x + sway * size * 0.55, palm.y - size * 0.12);
      ctx.stroke();
      const topX = palm.x + sway * size * 0.55;
      const topY = palm.y - size * 0.12;
      for (let i = 0; i < 7; i += 1) {
        const a = (i / 7) * TAU + sway + sway2;
        const len = size * (0.72 + (i % 3) * 0.09);
        const bend = 0.3 + Math.sin(time * 1.2 + i) * 0.05;
        ctx.strokeStyle = i % 2 === 0 ? '#4c7b45' : '#5f8f52';
        ctx.lineWidth = Math.max(1.3, size * 0.075);
        ctx.beginPath();
        ctx.moveTo(topX, topY);
        ctx.quadraticCurveTo(
          topX + Math.cos(a) * len * 0.55,
          topY + Math.sin(a) * len * 0.55 - len * 0.14,
          topX + Math.cos(a + bend * 0.16) * len,
          topY + Math.sin(a + bend * 0.16) * len * 0.72,
        );
        ctx.stroke();
        ctx.strokeStyle = 'rgba(97, 140, 78, 0.55)';
        ctx.lineWidth = 0.9;
        for (let j = 1; j <= 3; j += 1) {
          const t = j / 4;
          const lx = topX + Math.cos(a) * len * t * 0.85;
          const ly = topY + Math.sin(a) * len * t * 0.65 - len * 0.1 * t;
          ctx.beginPath();
          ctx.moveTo(lx, ly);
          ctx.lineTo(lx + Math.cos(a + 0.65) * len * 0.16, ly + Math.sin(a + 0.65) * len * 0.1);
          ctx.moveTo(lx, ly);
          ctx.lineTo(lx + Math.cos(a - 0.65) * len * 0.16, ly + Math.sin(a - 0.65) * len * 0.1);
          ctx.stroke();
        }
      }
      ctx.fillStyle = '#6a5538';
      ctx.beginPath();
      ctx.arc(topX, topY, Math.max(1.4, size * 0.055), 0, TAU);
      ctx.fill();
    }
    ctx.lineCap = 'butt';
  }

  // =================================================================
  // Shadows and actors
  // =================================================================
  actorList(game) {
    const actors = [];
    const p = game.player;
    if (p && !p.isInVehicle && !p.hotwire) actors.push({ kind: 'player', y: p.y, ref: p });
    for (const v of this.visibleVehicles(game)) actors.push({ kind: 'vehicle', y: v.y, ref: v });
    for (const ped of game.combat?.pedestrians || []) {
      if (this.inView(ped.x, ped.y, 50)) actors.push({ kind: 'ped', y: ped.y + (ped.isDead ? 0 : 2), ref: ped });
    }
    for (const cop of game.police?.footCops || []) {
      if (!cop.isDead && this.inView(cop.x, cop.y, 50)) actors.push({ kind: 'cop', y: cop.y + 2, ref: cop });
    }
    for (const enemy of game.combat?.enemies || []) {
      if (this.inView(enemy.x, enemy.y, 60)) actors.push({ kind: 'enemy', y: enemy.y + 2, ref: enemy });
    }
    actors.sort((a, b) => a.y - b.y);
    return actors;
  }

  drawShadows(game) {
    const actors = this.actorList(game);
    const ctx = this.ctx;
    const li = this.lightInfo(game);
    const alpha = 0.26 + li.dark * 0.16;
    for (const actor of actors) {
      const r = actor.ref;
      if (actor.kind === 'vehicle') {
        this.softShadow(ctx, r.x + 5, r.y + 7, Math.max(r.width, r.length) * 0.64, alpha, r.angle);
      } else if (r.isDead) {
        this.softShadow(ctx, r.x + 4, r.y + 4, 16, 0.28, 0);
      } else {
        this.softShadow(ctx, r.x + 3, r.y + 4, 12, 0.3, 0);
      }
    }
  }

  softShadow(ctx, x, y, size, alpha, angle) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle || 0);
    const g = ctx.createRadialGradient(0, 0, size * 0.15, 0, 0, size);
    g.addColorStop(0, `rgba(12, 10, 14, ${alpha})`);
    g.addColorStop(0.65, `rgba(12, 10, 14, ${alpha * 0.55})`);
    g.addColorStop(1, 'rgba(12, 10, 14, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, 0, size, size * 0.7, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  drawDepthPass(game) {
    const actors = this.actorList(game);
    for (const actor of actors) {
      if (actor.kind === 'vehicle') this.drawVehicle(game, actor.ref);
      else if (actor.kind === 'ped') this.drawPedestrian(game, actor.ref, false);
      else if (actor.kind === 'cop') this.drawCop(game, actor.ref);
      else if (actor.kind === 'enemy') this.drawEnemy(game, actor.ref);
      else if (actor.kind === 'player') this.drawPlayer(game, actor.ref);
    }
  }

  // =================================================================
  // Cars: per-type silhouettes and damage
  // =================================================================
  drawVehicle(game, v) {
    const ctx = this.ctx;
    const cfg = v.config;
    const art = cfg.art || { body: 'sedan' };
    const L = v.length;
    const W = v.width;
    const destroyed = v.isDestroyed;
    const stage = v.damageStage;
    const lift = v.airHeight || 0;
    ctx.save();
    ctx.translate(v.x, v.y - lift);
    ctx.rotate(v.angle);

    // Wheels (missing on wrecks and damaged bikes).
    const axle = L * 0.29;
    const track = W * 0.44;
    if (!destroyed) {
      if (art.body === 'bike') {
        ctx.fillStyle = '#17171a';
        ctx.save();
        ctx.translate(axle * 1.1, 0);
        ctx.rotate(Math.PI / 2);
        roundRect(ctx, -2.6, -4, 5.2, 8, 2.4);
        ctx.fill();
        ctx.restore();
        ctx.save();
        ctx.translate(-axle * 1.1, 0);
        ctx.rotate(Math.PI / 2);
        roundRect(ctx, -3.2, -5, 6.4, 10, 3);
        ctx.fill();
        ctx.restore();
      } else {
        ctx.fillStyle = '#17171a';
        for (const wx of [axle, -axle]) {
          for (const wy of [-track, track]) {
            if (stage >= 2 && wx > 0 && wy > 0) continue;
            roundRect(ctx, wx - L * 0.1, wy - W * 0.1, L * 0.2, W * 0.2, 2);
            ctx.fill();
          }
        }
        ctx.fillStyle = 'rgba(190, 196, 200, 0.3)';
        for (const wx of [axle, -axle]) {
          for (const wy of [-track, track]) {
            ctx.fillRect(wx - 2, wy - 1, 4, 2);
          }
        }
      }
    }

    const bodyColor = destroyed ? '#242227' : v.color;
    const shade = this.shade(bodyColor, -0.28);
    ctx.fillStyle = shade;
    this.vehicleSilhouette(ctx, art.body, L + 2, W + 2, true);
    ctx.fill();
    ctx.fillStyle = bodyColor;
    this.vehicleSilhouette(ctx, art.body, L, W, false);
    ctx.fill();
    ctx.strokeStyle = 'rgba(18, 16, 20, 0.42)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.13)';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(-L * 0.12, -W * 0.36);
    ctx.lineTo(-L * 0.12, W * 0.36);
    ctx.moveTo(L * 0.3, -W * 0.36);
    ctx.lineTo(L * 0.3, W * 0.36);
    ctx.stroke();

    if (art.body !== 'bike' && !art.open) {
      const roofLen = L * (art.roof || 0.4);
      const roofW = W * 0.72;
      ctx.fillStyle = destroyed ? '#1b1a1f' : 'rgba(32, 50, 58, 0.92)';
      roundRect(ctx, -roofLen * 0.5 + (art.body === 'van' ? -L * 0.06 : L * 0.02), -roofW / 2, roofLen, roofW, 3);
      ctx.fill();
      const glass = ctx.createLinearGradient(0, -roofW / 2, 0, roofW / 2);
      glass.addColorStop(0, 'rgba(144, 205, 218, 0.5)');
      glass.addColorStop(0.5, 'rgba(54, 92, 108, 0.35)');
      glass.addColorStop(1, 'rgba(120, 177, 190, 0.35)');
      ctx.fillStyle = destroyed ? '#2b2a2e' : glass;
      roundRect(ctx, -roofLen * 0.48 + (art.body === 'van' ? -L * 0.06 : L * 0.02), -roofW * 0.44, roofLen * 0.96, roofW * 0.88, 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(230, 245, 245, 0.22)';
      ctx.stroke();
      if (art.body === 'van' || art.body === 'box') {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.fillRect(-roofLen * 0.8, -roofW * 0.36, roofLen * 0.6, roofW * 0.72);
      }
    } else if (art.open && !destroyed) {
      ctx.fillStyle = 'rgba(20, 28, 34, 0.9)';
      roundRect(ctx, -L * 0.17, -W * 0.32, L * 0.36, W * 0.64, 3);
      ctx.fill();
    }

    if (cfg.stripe && !destroyed) {
      ctx.fillStyle = 'rgba(245, 240, 226, 0.7)';
      ctx.fillRect(-L * 0.42, -W * 0.07, L * 0.84, W * 0.06);
      ctx.fillRect(-L * 0.42, W * 0.01, L * 0.84, W * 0.06);
    }

    if (cfg.isPolice) {
      ctx.fillStyle = 'rgba(28, 34, 44, 0.88)';
      ctx.fillRect(-L * 0.3, -W * 0.49, L * 0.6, W * 0.12);
      ctx.fillRect(-L * 0.3, W * 0.37, L * 0.6, W * 0.12);
      ctx.fillStyle = '#ffcf5c';
      ctx.fillRect(-L * 0.28, -W * 0.47, L * 0.16, W * 0.06);
      ctx.fillRect(-L * 0.28, W * 0.41, L * 0.16, W * 0.06);
      ctx.fillStyle = '#2b2f39';
      roundRect(ctx, L * 0.02, -W * 0.32, L * 0.1, W * 0.64, 2);
      ctx.fill();
      const flash = v.sirenActive;
      ctx.fillStyle = flash && v.sirenPhase ? '#ff4a5a' : '#6a2430';
      roundRect(ctx, L * 0.02, -W * 0.28, L * 0.08, W * 0.26, 1.5);
      ctx.fill();
      ctx.fillStyle = flash && !v.sirenPhase ? '#5aa8ff' : '#243d62';
      roundRect(ctx, L * 0.02, W * 0.03, L * 0.08, W * 0.26, 1.5);
      ctx.fill();
      if (flash) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = v.sirenPhase ? 'rgba(255, 70, 90, 0.3)' : 'rgba(90, 168, 255, 0.3)';
        ctx.beginPath();
        ctx.arc(L * 0.06, 0, W * 0.48, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
    }

    const headOn = v.headlightsOn && !destroyed && v.aiMode !== 'parked';
    ctx.fillStyle = headOn ? 'rgba(255, 244, 205, 0.94)' : 'rgba(150, 145, 132, 0.4)';
    this.headlightShapes(ctx, art.body, L, W);
    ctx.fillStyle = v.brakeLightsOn ? '#ff3f4a' : 'rgba(190, 40, 50, 0.8)';
    if (art.body === 'bike') {
      ctx.fillRect(-L * 0.5, -W * 0.12, 3, W * 0.24);
    } else {
      ctx.fillRect(-L * 0.5, -W * 0.36, 3, W * 0.2);
      ctx.fillRect(-L * 0.5, W * 0.16, 3, W * 0.2);
    }
    if (headOn) {
      ctx.fillStyle = 'rgba(255, 248, 224, 0.13)';
      ctx.beginPath();
      ctx.ellipse(L * 0.53, 0, 8, W * 0.34, 0, 0, TAU);
      ctx.fill();
    }

    if (v.driver && art.body !== 'bike' && !art.open) {
      ctx.fillStyle = 'rgba(30, 26, 30, 0.8)';
      ctx.beginPath();
      ctx.arc(L * 0.06, -W * 0.16, 3.2, 0, TAU);
      ctx.fill();
    }

    if (art.spoiler) {
      ctx.fillStyle = this.shade(bodyColor, -0.35);
      ctx.fillRect(-L * 0.51, -W * 0.42, 3.4, W * 0.84);
    }
    if (art.scoop) {
      ctx.fillStyle = this.shade(bodyColor, -0.3);
      roundRect(ctx, L * 0.14, -W * 0.12, L * 0.16, W * 0.24, 2);
      ctx.fill();
    }

    // Damage: scratches/dents, broken glass, soot, fire.
    if (!destroyed) {
      for (let i = 0; i < v.marks.length; i += 1) {
        const m = v.marks[i];
        if (stage === 0 && i > 1) continue;
        if (m.kind === 'dent') {
          ctx.fillStyle = `rgba(20, 18, 22, ${0.22 + stage * 0.1})`;
          ctx.beginPath();
          ctx.ellipse(m.x, m.y, m.r, m.r * 0.7, 0.3, 0, TAU);
          ctx.fill();
        } else {
          ctx.strokeStyle = `rgba(235, 230, 220, ${0.12 + stage * 0.06})`;
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.moveTo(m.x - m.r, m.y - 1);
          ctx.lineTo(m.x + m.r, m.y + 1);
          ctx.stroke();
        }
      }
      if (stage >= 1 && v.brokenGlass) {
        ctx.strokeStyle = 'rgba(210, 238, 242, 0.55)';
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        ctx.moveTo(-L * 0.14, -W * 0.18);
        ctx.lineTo(-L * 0.05, -W * 0.08);
        ctx.lineTo(-L * 0.12, W * 0.02);
        ctx.moveTo(-L * 0.05, -W * 0.08);
        ctx.lineTo(-L * 0.02, W * 0.1);
        ctx.stroke();
      }
      if (stage >= 1) {
        ctx.fillStyle = `rgba(28, 24, 26, ${clamp((1 - v.hp / v.maxHp) * 0.65, 0.08, 0.6)})`;
        ctx.beginPath();
        ctx.ellipse(-L * 0.18, W * 0.08, L * 0.24, W * 0.3, 0.2, 0, TAU);
        ctx.fill();
      }
      if (v.isBurning) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const f = 0.6 + Math.sin((game.worldTime || 0) * 22) * 0.25;
        ctx.fillStyle = `rgba(255, 120, 32, ${0.35 * f})`;
        ctx.beginPath();
        ctx.ellipse(0, 0, L * 0.38, W * 0.42, 0, 0, TAU);
        ctx.fill();
        ctx.restore();
        this.drawFlame(ctx, L * 0.1, 0, 1);
      }
    } else {
      ctx.fillStyle = 'rgba(10, 9, 12, 0.58)';
      ctx.beginPath();
      ctx.ellipse(0, 0, L * 0.38, W * 0.42, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(90, 72, 58, 0.4)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-L * 0.3, -W * 0.3);
      ctx.lineTo(L * 0.2, W * 0.2);
      ctx.moveTo(L * 0.1, -W * 0.3);
      ctx.lineTo(-L * 0.2, W * 0.28);
      ctx.stroke();
    }
    ctx.restore();

    // Stunt flame trail while airborne.
    if (lift > 2) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(255, 200, 120, 0.16)';
      ctx.beginPath();
      ctx.ellipse(v.x, v.y, v.width * 0.7, v.length * 0.6, v.angle, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }

  drawFlame(ctx, x, y, scale) {
    const t = (this.frame * 0.21) % 1;
    ctx.save();
    ctx.translate(x, y);
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 3; i += 1) {
      const h = (10 + i * 5) * scale + Math.sin(t * 6 + i) * 3;
      ctx.fillStyle = i === 0 ? 'rgba(255, 226, 120, 0.85)' : i === 1 ? 'rgba(255, 138, 40, 0.7)' : 'rgba(255, 70, 20, 0.55)';
      ctx.beginPath();
      ctx.moveTo(-3 * scale, 3);
      ctx.quadraticCurveTo(-7 * scale, -h * 0.5, 0, -h);
      ctx.quadraticCurveTo(7 * scale, -h * 0.5, 3 * scale, 3);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  vehicleSilhouette(ctx, body, L, W, outline) {
    const hx = L / 2;
    const hy = W / 2;
    const inset = outline ? 1.4 : 0;
    if (body === 'bike') {
      ctx.beginPath();
      ctx.moveTo(-hx * 0.9, -hy * 0.5 + inset);
      ctx.lineTo(-hx * 0.15, -hy + inset);
      ctx.lineTo(hx * 0.55, -hy * 0.72 + inset);
      ctx.lineTo(hx, 0);
      ctx.lineTo(hx * 0.55, hy * 0.72 - inset);
      ctx.lineTo(-hx * 0.15, hy - inset);
      ctx.lineTo(-hx * 0.9, hy * 0.5 - inset);
      ctx.lineTo(-hx, 0);
      ctx.closePath();
      return;
    }
    if (body === 'sports') {
      ctx.beginPath();
      ctx.moveTo(-hx * 0.86, -hy * 0.72 + inset);
      ctx.lineTo(-hx * 0.5, -hy + inset);
      ctx.lineTo(hx * 0.26, -hy * 0.92 + inset);
      ctx.lineTo(hx * 0.68, -hy * 0.6 + inset);
      ctx.lineTo(hx * 0.92, -hy * 0.3 + inset);
      ctx.quadraticCurveTo(hx, 0, hx * 0.92, hy * 0.3 - inset);
      ctx.lineTo(hx * 0.68, hy * 0.6 - inset);
      ctx.lineTo(hx * 0.26, hy * 0.92 - inset);
      ctx.lineTo(-hx * 0.5, hy - inset);
      ctx.lineTo(-hx * 0.86, hy * 0.72 - inset);
      ctx.quadraticCurveTo(-hx * 0.96, 0, -hx * 0.86, -hy * 0.72 + inset);
      ctx.closePath();
      return;
    }
    if (body === 'muscle') {
      ctx.beginPath();
      ctx.moveTo(-hx * 0.94, -hy * 0.78 + inset);
      ctx.lineTo(-hx * 0.78, -hy + inset);
      ctx.lineTo(hx * 0.5, -hy + inset);
      ctx.lineTo(hx * 0.82, -hy * 0.7 + inset);
      ctx.lineTo(hx * 0.94, -hy * 0.32 + inset);
      ctx.lineTo(hx * 0.94, hy * 0.32 - inset);
      ctx.lineTo(hx * 0.82, hy * 0.7 - inset);
      ctx.lineTo(hx * 0.5, hy - inset);
      ctx.lineTo(-hx * 0.78, hy - inset);
      ctx.lineTo(-hx * 0.94, hy * 0.78 - inset);
      ctx.closePath();
      return;
    }
    if (body === 'van' || body === 'box') {
      ctx.beginPath();
      ctx.moveTo(-hx * 0.96, -hy * 0.86 + inset);
      ctx.lineTo(hx * 0.7, -hy * 0.86 + inset);
      ctx.lineTo(hx * 0.94, -hy * 0.6 + inset);
      ctx.lineTo(hx, -hy * 0.2 + inset);
      ctx.lineTo(hx, hy * 0.2 - inset);
      ctx.lineTo(hx * 0.94, hy * 0.6 - inset);
      ctx.lineTo(hx * 0.7, hy * 0.86 - inset);
      ctx.lineTo(-hx * 0.96, hy * 0.86 - inset);
      ctx.closePath();
      return;
    }
    if (body === 'suv') {
      ctx.beginPath();
      ctx.moveTo(-hx * 0.9, -hy * 0.82 + inset);
      ctx.lineTo(hx * 0.55, -hy * 0.92 + inset);
      ctx.lineTo(hx * 0.84, -hy * 0.66 + inset);
      ctx.lineTo(hx * 0.94, -hy * 0.3 + inset);
      ctx.lineTo(hx * 0.94, hy * 0.3 - inset);
      ctx.lineTo(hx * 0.84, hy * 0.66 - inset);
      ctx.lineTo(hx * 0.55, hy * 0.92 - inset);
      ctx.lineTo(-hx * 0.9, hy * 0.82 - inset);
      ctx.closePath();
      return;
    }
    const nose = body === 'police' ? 0.2 : 0.12;
    const tail = body === 'police' ? 0.9 : 0.88;
    ctx.beginPath();
    ctx.moveTo(-hx * tail, -hy * 0.88 + inset);
    ctx.lineTo(-hx * 0.72, -hy + inset);
    ctx.lineTo(hx * 0.45, -hy + inset);
    ctx.lineTo(hx * 0.76, -hy * 0.72 + inset);
    ctx.lineTo(hx * (1 - nose), -hy * 0.42 + inset);
    ctx.quadraticCurveTo(hx, -hy * 0.2, hx, 0);
    ctx.quadraticCurveTo(hx, hy * 0.2, hx * (1 - nose), hy * 0.42 - inset);
    ctx.lineTo(hx * 0.76, hy * 0.72 - inset);
    ctx.lineTo(hx * 0.45, hy - inset);
    ctx.lineTo(-hx * 0.72, hy - inset);
    ctx.lineTo(-hx * tail, hy * 0.88 - inset);
    ctx.quadraticCurveTo(-hx * 0.98, 0, -hx * tail, -hy * 0.88 + inset);
    ctx.closePath();
  }

  headlightShapes(ctx, body, L, W) {
    if (body === 'bike') {
      ctx.beginPath();
      ctx.arc(L * 0.46, 0, 2.4, 0, TAU);
      ctx.fill();
      return;
    }
    const x = L * 0.46;
    const y = W * 0.3;
    roundRect(ctx, x, -y - 2.4, 3.2, 4.8, 1);
    ctx.fill();
    roundRect(ctx, x, y - 2.4, 3.2, 4.8, 1);
    ctx.fill();
  }

  // =================================================================
  // People
  // =================================================================
  drawPlayer(game, p) {
    this.drawPerson(game, p, {
      shirt: '#e8c26a',
      pants: '#25303c',
      skin: '#d9a87c',
      hair: '#2a1e18',
      jacket: '#b4553f',
    }, true);
  }

  drawCop(game, c) {
    this.drawPerson(game, c, {
      shirt: '#4c7bb5',
      pants: '#26364a',
      skin: '#d9a87c',
      hair: '#2a1e18',
      uniform: true,
      cop: true,
    }, false);
    this.drawGunArm(c.x, c.y, c.angle, c.isDead, '#242a30');
  }

  drawEnemy(game, e) {
    if (e.isDead) {
      this.drawDead(game, e, e.color || '#8a4038');
      return;
    }
    this.drawPerson(game, e, {
      shirt: e.color || '#b8463c',
      pants: '#2d2a2b',
      skin: '#c99a72',
      hair: '#1f1a18',
      vest: e.isBoss,
      helmet: e.isBoss,
    }, false);
    this.drawGunArm(e.x, e.y, e.angle, false, e.isBoss ? '#d7b15c' : '#22262a');
    if (e.isBoss) {
      ctxRing(this.ctx, e.x, e.y, 22, 'rgba(255, 209, 102, 0.3)');
    }
    if (e.crouched) {
      this.ctx.fillStyle = 'rgba(255, 209, 102, 0.35)';
      this.ctx.font = '900 8px Arial, sans-serif';
      this.ctx.textAlign = 'center';
      this.ctx.fillText('COVER', e.x, e.y - 30);
    }
  }

  drawPedestrian(game, p, isCop) {
    if (p.isDead) {
      this.drawDead(game, p, p.shirt || '#8a5d50');
      return;
    }
    this.drawPerson(game, p, {
      shirt: p.shirt,
      pants: p.pants,
      skin: p.skin,
      hair: p.hair,
      hat: p.hat,
      umbrella: p.umbrella,
      umbrellaColor: p.umbrellaColor,
      bag: p.bag,
      phone: p.phone,
      cop: isCop,
    }, false);
  }

  drawPerson(game, p, look, isPlayer) {
    const ctx = this.ctx;
    const face = p.facing ?? 0;
    const walking = p.moving || p.state === 'flee' || p.state === 'walk' || p.state === 'cross';
    const phase = p.walkPhase || p.walkCycle || 0;
    const swing = walking ? Math.sin(phase) : 0;
    const bob = walking ? Math.abs(Math.cos(phase)) * 1.3 : 0;
    ctx.save();
    ctx.translate(p.x, p.y - bob);
    if (p.isRolling) ctx.rotate(Math.sin((p.rollTimer || 0) * 16) * 0.3);
    if (p.meleeSwing > 0) ctx.rotate(p.meleeSide * Math.sin((0.22 - p.meleeSwing) * 22) * 0.12);

    const skin = look.skin || '#d9a87c';
    const shirt = look.shirt || '#6a7b8a';
    const pants = look.pants || '#33404b';

    // Legs.
    ctx.fillStyle = pants;
    if (face === 3 || face === 1) {
      const dir = face === 3 ? 1 : -1;
      roundRect(ctx, -2.6 + swing * 2.8 * dir, 3, 4.2, 8, 2);
      ctx.fill();
      roundRect(ctx, -1.5 - swing * 2.8 * dir, 3, 4.2, 8, 2);
      ctx.fill();
    } else {
      roundRect(ctx, -5.4, 3 + swing * 2.1, 4.2, 8, 2);
      ctx.fill();
      roundRect(ctx, 1.2, 3 - swing * 2.1, 4.2, 8, 2);
      ctx.fill();
    }

    // Torso.
    ctx.fillStyle = shirt;
    roundRect(ctx, -6.2, -5, 12.4, 11, 4);
    ctx.fill();
    if (look.jacket) {
      ctx.fillStyle = look.jacket;
      roundRect(ctx, -6.5, -5.5, 4, 11, 2);
      ctx.fill();
      roundRect(ctx, 2.5, -5.5, 4, 11, 2);
      ctx.fill();
    }
    if (look.vest) {
      ctx.fillStyle = 'rgba(42, 40, 42, 0.9)';
      roundRect(ctx, -5, -4.2, 10, 9, 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(220, 200, 160, 0.4)';
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }
    if (look.cop) {
      ctx.fillStyle = '#2b3648';
      ctx.fillRect(-6, -5.3, 12, 2.4);
      ctx.fillStyle = '#ffd166';
      ctx.beginPath();
      ctx.arc(3.5, -3.8, 1.1, 0, TAU);
      ctx.fill();
    }
    if (look.uniform) {
      ctx.fillStyle = '#26364a';
      ctx.fillRect(-6, 4.6, 12, 1.4);
    }

    // Arms.
    ctx.fillStyle = skin;
    if (face === 3) {
      roundRect(ctx, 3.6, -4 + swing * 1.8, 4.4, 3.4, 1.6);
      ctx.fill();
      roundRect(ctx, 3.6, 1 - swing * 1.8, 4.4, 3.4, 1.6);
      ctx.fill();
    } else if (face === 1) {
      roundRect(ctx, -8, -4 + swing * 1.8, 4.4, 3.4, 1.6);
      ctx.fill();
      roundRect(ctx, -8, 1 - swing * 1.8, 4.4, 3.4, 1.6);
      ctx.fill();
    } else {
      roundRect(ctx, -8.4, -4 + swing * 1.5, 3.4, 7, 1.6);
      ctx.fill();
      roundRect(ctx, 5, -4 - swing * 1.5, 3.4, 7, 1.6);
      ctx.fill();
    }

    // Head.
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(0, -8.2, 4.5, 0, TAU);
    ctx.fill();
    if (face === 2) {
      ctx.fillStyle = look.hair || '#2a1e18';
      ctx.beginPath();
      ctx.arc(0, -8.5, 4.4, 0, TAU);
      ctx.fill();
    } else if (face === 1) {
      ctx.fillStyle = look.hair || '#2a1e18';
      ctx.beginPath();
      ctx.arc(-0.6, -8.8, 4.2, Math.PI * 0.55, Math.PI * 1.55);
      ctx.fill();
      ctx.fillStyle = 'rgba(30, 24, 22, 0.75)';
      ctx.fillRect(-2.2, -8.8, 1, 1);
    } else if (face === 3) {
      ctx.fillStyle = look.hair || '#2a1e18';
      ctx.beginPath();
      ctx.arc(0.6, -8.8, 4.2, -Math.PI * 0.55, Math.PI * 0.45);
      ctx.fill();
      ctx.fillStyle = 'rgba(30, 24, 22, 0.75)';
      ctx.fillRect(1.2, -8.8, 1, 1);
    } else {
      ctx.fillStyle = look.hair || '#2a1e18';
      ctx.beginPath();
      ctx.arc(0, -9.3, 4.3, Math.PI, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(30, 24, 22, 0.75)';
      ctx.fillRect(-1.7, -8.6, 1, 1);
      ctx.fillRect(0.7, -8.6, 1, 1);
    }
    if (look.hat) {
      ctx.fillStyle = '#39424d';
      ctx.beginPath();
      ctx.arc(0, -9.2, 4.8, Math.PI, TAU);
      ctx.fill();
      ctx.fillRect(-6, -9.4, 12, 1.5);
    }
    if (look.cop) {
      ctx.fillStyle = '#1f2e44';
      ctx.beginPath();
      ctx.arc(0, -9, 4.7, Math.PI, TAU);
      ctx.fill();
      ctx.fillRect(-4.6, -9.3, 9.2, 1.4);
      ctx.fillStyle = '#ffd166';
      ctx.fillRect(-0.8, -10.2, 1.6, 1.2);
    }
    if (look.helmet) {
      ctx.fillStyle = '#23252a';
      ctx.beginPath();
      ctx.arc(0, -9, 5, Math.PI, TAU);
      ctx.fill();
    }
    if (look.bag) {
      ctx.fillStyle = '#7d5a3c';
      roundRect(ctx, 4.8, 1, 3.8, 6, 1.6);
      ctx.fill();
    }
    if (look.phone) {
      ctx.fillStyle = 'rgba(120, 230, 220, 0.9)';
      ctx.fillRect(2.2, -1, 2, 3);
    }
    if (look.umbrella) {
      ctx.strokeStyle = '#4a4038';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(2, -2);
      ctx.lineTo(2, -18);
      ctx.stroke();
      ctx.fillStyle = look.umbrellaColor || '#ff7f9e';
      ctx.beginPath();
      ctx.arc(2, -19, 11, Math.PI, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.34)';
      for (let i = 0; i < 4; i += 1) {
        ctx.beginPath();
        ctx.moveTo(2, -19);
        ctx.arc(2, -19, 11, Math.PI + (i / 4) * Math.PI, Math.PI + (i / 4) * Math.PI + 0.22);
        ctx.closePath();
        ctx.fill();
      }
    }

    if (isPlayer && p.weapon && p.weapon.id !== 'fists') {
      this.drawGunArm(p.x, p.y, p.angle, false, '#d8dde2');
    }
    if (p.hitFlash > 0.02) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(255, 220, 170, ${p.hitFlash * 0.45})`;
      ctx.beginPath();
      ctx.arc(0, -2, 10, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
    void game;
  }

  drawGunArm(x, y, angle, dead, color = '#222') {
    if (dead) return;
    const ctx = this.ctx;
    const fx = Math.cos(angle);
    const fy = Math.sin(angle);
    ctx.save();
    ctx.translate(x + fx * 8, y + fy * 8);
    ctx.rotate(angle);
    ctx.fillStyle = color;
    roundRect(ctx, 0, -1.2, 10, 2.4, 1);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.fillRect(2, -1, 5, 0.8);
    ctx.restore();
  }

  drawDead(game, p, color) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.deadAngle || 0);
    ctx.fillStyle = 'rgba(20, 17, 20, 0.25)';
    ctx.beginPath();
    ctx.ellipse(2, 3, 13, 8, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = color || '#8a5d50';
    roundRect(ctx, -5, -10, 10, 20, 4);
    ctx.fill();
    ctx.fillStyle = p.skin || '#c99a72';
    ctx.beginPath();
    ctx.arc(0, -13, 4, 0, TAU);
    ctx.fill();
    ctx.restore();
    void game;
  }

  // =================================================================
  // Bullets, grenades, particles
  // =================================================================
  drawBullets(game) {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const b of game.combat?.bullets || []) {
      if (!this.inView(b.x, b.y, 40)) continue;
      const len = 12 + Math.min(10, (b.speed || 1000) * 0.008);
      const fx = Math.cos(b.angle);
      const fy = Math.sin(b.angle);
      const grad = ctx.createLinearGradient(b.x - fx * len, b.y - fy * len, b.x, b.y);
      grad.addColorStop(0, 'rgba(255, 180, 90, 0)');
      grad.addColorStop(1, b.owner === 'player' ? 'rgba(255, 246, 200, 0.95)' : 'rgba(255, 160, 120, 0.95)');
      ctx.strokeStyle = grad;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(b.x - fx * len, b.y - fy * len);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawGrenades(game) {
    const ctx = this.ctx;
    for (const g of game.combat?.grenades || []) {
      if (!this.inView(g.x, g.y, 40)) continue;
      const z = g.z || 0;
      // Ground shadow shrinks with height.
      ctx.fillStyle = `rgba(10, 10, 14, ${clamp(0.28 - z * 0.0015, 0.08, 0.28)})`;
      ctx.beginPath();
      ctx.ellipse(g.x, g.y + 2, 5, 3, 0, 0, TAU);
      ctx.fill();
      ctx.save();
      ctx.translate(g.x, g.y - z * 0.35);
      ctx.rotate(g.spin || 0);
      ctx.fillStyle = '#3d4a35';
      roundRect(ctx, -3.6, -4.4, 7.2, 8.8, 3);
      ctx.fill();
      ctx.fillStyle = '#252c22';
      ctx.fillRect(-2.4, -4.8, 4.8, 1.6);
      ctx.fillStyle = '#9aa887';
      ctx.fillRect(-1.6, -1.4, 3.2, 1);
      if (g.fuse < 0.55) {
        const pulse = 0.5 + 0.5 * Math.sin((game.worldTime || 0) * 30);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = `rgba(255, 70, 40, ${0.3 + pulse * 0.5})`;
        ctx.beginPath();
        ctx.arc(0, -5, 5, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
      ctx.restore();
    }
  }

  drawParticles(game) {
    const ctx = this.ctx;
    const list = game.particles?.particles || [];
    for (const p of list) {
      if (!this.inView(p.x, p.y, 60)) continue;
      const life = clamp(p.life, 0, 1);
      if (p.type === 'smoke' || p.type === 'dust') {
        const size = p.size * (1.2 - life * 0.35);
        ctx.fillStyle = p.color || 'rgba(180, 180, 180, 0.4)';
        ctx.globalAlpha = life * (p.type === 'dust' ? 0.55 : 0.62);
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(1, size), 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 1;
      } else if (p.type === 'fire' || p.type === 'explosion_fire') {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = life;
        ctx.fillStyle = p.color || '#ff6a22';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.4 + life * 0.7), 0, TAU);
        ctx.fill();
        ctx.restore();
      } else if (p.type === 'spark' || p.type === 'hit') {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = Math.min(1, life * 1.4);
        ctx.strokeStyle = p.color || '#ffd166';
        ctx.lineWidth = p.type === 'hit' ? 2.4 : 1.4;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.02, p.y - p.vy * 0.02);
        ctx.stroke();
        ctx.restore();
      } else if (p.type === 'muzzle') {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle || 0);
        const g = ctx.createRadialGradient(0, 0, 1, 0, 0, p.size * 1.6);
        g.addColorStop(0, `rgba(255, 252, 226, ${life})`);
        g.addColorStop(0.4, `rgba(255, 206, 105, ${life * 0.8})`);
        g.addColorStop(1, 'rgba(255, 160, 50, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(p.size * 2.2, -p.size * 0.45);
        ctx.lineTo(p.size * 2.8, 0);
        ctx.lineTo(p.size * 2.2, p.size * 0.45);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      } else if (p.type === 'shockwave') {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = `rgba(255, 196, 110, ${life * 0.8})`;
        ctx.lineWidth = 4 * life + 1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, TAU);
        ctx.stroke();
        ctx.restore();
      } else if (p.type === 'casing') {
        ctx.fillStyle = `rgba(230, 190, 105, ${life})`;
        ctx.fillRect(p.x, p.y, 2.4, 1.4);
      } else if (p.type === 'glass') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.spin || 0);
        ctx.fillStyle = p.color || 'rgba(170, 230, 238, 0.8)';
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.7);
        ctx.restore();
      } else if (p.type === 'debris') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.spin || 0);
        ctx.fillStyle = p.color || '#5a5148';
        ctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.7);
        ctx.restore();
      } else if (p.type === 'splash' || p.type === 'rain') {
        ctx.strokeStyle = p.color || 'rgba(210, 240, 240, 0.6)';
        ctx.globalAlpha = life;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, TAU);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    for (const c of game.particles?.cashPickups || []) {
      if (!this.inView(c.x, c.y, 30)) continue;
      const bob = Math.sin(c.bob) * 2.5;
      ctx.save();
      ctx.translate(c.x, c.y + bob);
      ctx.fillStyle = 'rgba(255, 209, 102, 0.22)';
      ctx.beginPath();
      ctx.arc(0, 0, 13, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#9bd46d';
      roundRect(ctx, -6, -4, 12, 8, 1.5);
      ctx.fill();
      ctx.fillStyle = '#4f7b37';
      ctx.font = '900 5px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('$', 0, 2);
      ctx.restore();
    }
  }

  // =================================================================
  // Markers
  // =================================================================
  drawMarkers(game) {
    if (game.state === 'title' || game.state === 'controls') return;
    const ctx = this.ctx;
    const time = game.worldTime || 0;
    const marker = game.missions?.availableMarker?.();
    if (marker && this.inView(marker.x, marker.y, 80)) {
      const pulse = 0.5 + 0.5 * Math.sin(time * 2.6);
      const rr = Math.min(marker.radius, 48);
      ctx.save();
      ctx.translate(marker.x, marker.y);
      ctx.strokeStyle = `rgba(255, 209, 102, ${0.55 + pulse * 0.4})`;
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.arc(0, 0, rr, 0, TAU);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255, 240, 190, 0.3)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(0, 0, rr * (0.72 + pulse * 0.1), 0, TAU);
      ctx.stroke();
      const g = ctx.createLinearGradient(0, -58, 0, 0);
      g.addColorStop(0, 'rgba(255, 209, 102, 0)');
      g.addColorStop(1, 'rgba(255, 209, 102, 0.13)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(-10, 0);
      ctx.lineTo(-4, -62);
      ctx.lineTo(4, -62);
      ctx.lineTo(10, 0);
      ctx.closePath();
      ctx.fill();
      star(ctx, 0, -9, 7 + pulse * 1.6);
      ctx.fillStyle = '#ffd166';
      ctx.fill();
      ctx.restore();
    }

    for (const p of game.pickups?.pickups || []) {
      if (!p.active || !this.inView(p.x, p.y, 30)) continue;
      const bob = Math.sin(p.bob) * 3;
      ctx.save();
      ctx.translate(p.x, p.y + bob);
      const g = ctx.createRadialGradient(0, 0, 2, 0, 0, 18);
      g.addColorStop(0, this.hexAlpha(p.def.color, 0.32));
      g.addColorStop(0.55, this.hexAlpha(p.def.color, 0.1));
      g.addColorStop(1, this.hexAlpha(p.def.color, 0));
      ctx.fillStyle = g;
      ctx.fillRect(-18, -18, 36, 36);
      ctx.fillStyle = p.def.color;
      ctx.beginPath();
      ctx.moveTo(0, -9);
      ctx.lineTo(9, 0);
      ctx.lineTo(0, 9);
      ctx.lineTo(-9, 0);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }

    // Mixtapes: a slowly turning cassette with a soft halo.
    for (const item of game.collectibles?.items || []) {
      if (item.found || !this.inView(item.x, item.y, 40)) continue;
      const bob = Math.sin(item.bob) * 4;
      ctx.save();
      ctx.translate(item.x, item.y + bob);
      const g = ctx.createRadialGradient(0, 0, 2, 0, 0, 24);
      g.addColorStop(0, this.hexAlpha(item.color, 0.32));
      g.addColorStop(0.5, this.hexAlpha(item.color, 0.1));
      g.addColorStop(1, this.hexAlpha(item.color, 0));
      ctx.fillStyle = g;
      ctx.fillRect(-24, -24, 48, 48);
      ctx.rotate(Math.sin(item.bob * 0.6) * 0.16);
      ctx.fillStyle = 'rgba(20, 18, 24, 0.85)';
      roundRect(ctx, -11, -7, 22, 14, 2);
      ctx.fill();
      ctx.fillStyle = item.color;
      roundRect(ctx, -9, -5, 18, 10, 1.5);
      ctx.fill();
      ctx.fillStyle = 'rgba(20, 18, 24, 0.8)';
      ctx.beginPath();
      ctx.arc(-3.5, 0, 2.6, 0, TAU);
      ctx.arc(3.5, 0, 2.6, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(20, 18, 24, 0.7)';
      ctx.fillRect(-9, 4, 18, 1.4);
      ctx.restore();
    }

    // Garage repair rings.
    for (const garage of game.city.garages || []) {
      if (!this.inView(garage.x, garage.y, 100)) continue;
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 180, 92, 0.3)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 8]);
      ctx.beginPath();
      ctx.arc(garage.x, garage.y, 66, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(255, 180, 92, 0.7)';
      ctx.font = '900 9px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('REPAIR', garage.x, garage.y - 74);
      ctx.restore();
    }

    const target = game.missions?.active ? game.missions.currentTarget() : null;
    if (target && this.inView(target.x, target.y, 60)) {
      const pulse = 0.5 + 0.5 * Math.sin(time * 3 + 1);
      const rr = Math.max(22, target.radius * 0.5);
      ctx.save();
      ctx.translate(target.x, target.y);
      ctx.strokeStyle = `rgba(255, 209, 102, ${0.34 + pulse * 0.34})`;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.arc(0, 0, rr, 0, TAU);
      ctx.stroke();
      ctx.strokeStyle = `rgba(255, 240, 190, ${0.16 + pulse * 0.1})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, rr * 1.12, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }
  }

  // =================================================================
  // Neon bloom
  // =================================================================
  drawNeon(game) {
    const li = this.lightInfo(game);
    if (li.dark < 0.05) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const b of game.city.buildings) {
      if (!b.neonText || !this.inView(b.x, b.y, 80)) continue;
      const x = b.x;
      const y = b.y - b.h / 2 + b.h - 15;
      const g = ctx.createRadialGradient(x, y, 1, x, y, 26);
      g.addColorStop(0, this.hexAlpha(b.neonColor, 0.36 * li.dark));
      g.addColorStop(0.45, this.hexAlpha(b.neonColor, 0.13 * li.dark));
      g.addColorStop(0.78, this.hexAlpha(b.neonColor, 0.034 * li.dark));
      g.addColorStop(1, this.hexAlpha(b.neonColor, 0));
      ctx.fillStyle = g;
      ctx.fillRect(x - 30, y - 30, 60, 60);
      ctx.fillStyle = this.hexAlpha(b.neonColor, 0.5 * li.dark);
      ctx.fillRect(x - 12, y - 2, 24, 4);
    }
    for (const light of game.city.streetlights) {
      if (!this.inView(light.x, light.y, 20)) continue;
      const g = ctx.createRadialGradient(light.x, light.y, 0, light.x, light.y, 9);
      g.addColorStop(0, `rgba(255, 238, 196, ${0.8 * li.dark})`);
      g.addColorStop(1, 'rgba(255, 220, 160, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(light.x - 10, light.y - 10, 20, 20);
    }
    for (const billboard of game.city.billboards) {
      if (!this.inView(billboard.x, billboard.y, 90)) continue;
      const g = ctx.createRadialGradient(billboard.x, billboard.y - 5, 1, billboard.x, billboard.y - 5, 44);
      g.addColorStop(0, this.hexAlpha(billboard.color, 0.32 * li.dark));
      g.addColorStop(0.5, this.hexAlpha(billboard.color, 0.1 * li.dark));
      g.addColorStop(1, this.hexAlpha(billboard.color, 0));
      ctx.fillStyle = g;
      ctx.fillRect(billboard.x - 46, billboard.y - 51, 92, 92);
      ctx.fillStyle = this.hexAlpha(billboard.color, 0.45 * li.dark);
      ctx.fillRect(billboard.x - 26, billboard.y - 8, 52, 3);
    }
    for (const cop of game.police?.cops || []) {
      if (!cop.sirenActive || !this.inView(cop.x, cop.y, 40)) continue;
      const fx = Math.cos(cop.angle);
      const fy = Math.sin(cop.angle);
      const rx = -fy;
      const ry = fx;
      const lampX = cop.x + fx * cop.length * 0.16;
      const lampY = cop.y + fy * cop.length * 0.16;
      for (const [off, rgb] of [
        [-cop.width * 0.22, cop.sirenPhase ? '255, 72, 92' : '90, 54, 62'],
        [cop.width * 0.22, cop.sirenPhase ? '54, 68, 96' : '92, 166, 255'],
      ]) {
        const gx = lampX + rx * off;
        const gy = lampY + ry * off;
        const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, 13);
        g.addColorStop(0, `rgba(${rgb}, ${0.26 * li.dark})`);
        g.addColorStop(0.5, `rgba(${rgb}, ${0.08 * li.dark})`);
        g.addColorStop(1, `rgba(${rgb}, 0)`);
        ctx.fillStyle = g;
        ctx.fillRect(gx - 14, gy - 14, 28, 28);
      }
    }
    ctx.restore();
  }

  // =================================================================
  // Weather (world + screen) and reticle
  // =================================================================
  drawWeatherWorld(game) {
    const w = game.weather;
    if (!w || w.type === 'clear') return;
    const ctx = this.ctx;
    const v = this.view;
    const intensity = w.intensity || 0.4;
    const time = game.worldTime || 0;
    if (w.type === 'haze') {
      const fog = ctx.createLinearGradient(v.x, v.y, v.x, v.y2);
      fog.addColorStop(0, 'rgba(255, 218, 160, 0.06)');
      fog.addColorStop(0.5, 'rgba(255, 226, 180, 0.1)');
      fog.addColorStop(1, 'rgba(255, 218, 160, 0.04)');
      ctx.fillStyle = fog;
      ctx.fillRect(v.x, v.y, v.w, v.h);
      return;
    }
    ctx.save();
    ctx.strokeStyle = `rgba(190, 224, 232, ${0.22 + intensity * 0.24})`;
    ctx.lineWidth = 1.1;
    const count = Math.floor(120 + intensity * 230);
    for (let i = 0; i < count; i += 1) {
      const seed = (i * 73.13 + time * 310) % 620;
      const x = v.x - 120 + ((i * 137.7 + time * 160) % (v.w + 240));
      const y = v.y - 120 + seed;
      const len = 9 + (i % 5) * 3;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - 4, y + len);
      ctx.stroke();
      if (i % 9 === 0) {
        ctx.fillStyle = `rgba(200, 235, 240, ${0.12 + intensity * 0.12})`;
        ctx.beginPath();
        ctx.arc(x, y + len, 2.2, 0, TAU);
        ctx.fill();
      }
    }
    if (w.type === 'storm') {
      ctx.strokeStyle = `rgba(220, 232, 255, ${0.04 + intensity * 0.05})`;
      ctx.lineWidth = 2;
      for (let i = 0; i < 5; i += 1) {
        const x = v.x + ((i * 317 + time * 90) % v.w);
        ctx.beginPath();
        ctx.moveTo(x, v.y);
        ctx.lineTo(x - 40, v.y2);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  drawReticle(game) {
    const m = game.input.mouse;
    const p = game.player;
    if (!p || game.state === 'title' || game.state === 'paused' || game.state === 'controls') return;
    const ctx = this.ctx;
    const wx = m.worldX;
    const wy = m.worldY;
    const spread = p.weapon?.spread ? 6 + p.weapon.spread * 120 : 7;
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 246, 222, 0.82)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(wx, wy, spread, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = p.weapon?.id === 'fists' ? 'rgba(255, 209, 102, 0.8)' : 'rgba(255, 246, 222, 0.9)';
    ctx.beginPath();
    ctx.arc(wx, wy, 1.8, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 246, 222, 0.5)';
    for (const a of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
      ctx.beginPath();
      ctx.moveTo(wx + Math.cos(a) * (spread + 2), wy + Math.sin(a) * (spread + 2));
      ctx.lineTo(wx + Math.cos(a) * (spread + 6), wy + Math.sin(a) * (spread + 6));
      ctx.stroke();
    }
    if (p.meleeCombo > 0 && p.comboTimer > 0 && p.weapon?.id === 'fists') {
      ctx.fillStyle = 'rgba(255, 209, 102, 0.8)';
      ctx.font = '900 9px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(['', 'JAB', 'CROSS', 'FINISH'][p.meleeCombo] || '', wx, wy - 18);
    }
    ctx.restore();
  }

  drawAtmosphere(game) {
    const ctx = this.ctx;
    const li = this.lightInfo(game);
    const w = game.weather;

    // A light final grade: the heavy lifting is the world-space wash above.
    if (li.dark > 0.01) {
      const g = ctx.createLinearGradient(0, 0, this.width, this.height);
      g.addColorStop(0, `rgba(22, 18, 54, ${li.dark * 0.1})`);
      g.addColorStop(0.5, `rgba(9, 15, 44, ${li.dark * 0.13})`);
      g.addColorStop(1, `rgba(5, 13, 34, ${li.dark * 0.11})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, this.width, this.height);
    }
    if (li.dusk > 0.2) {
      const g = ctx.createLinearGradient(0, 0, this.width, this.height);
      g.addColorStop(0, `rgba(255, 132, 92, ${li.dusk * 0.13})`);
      g.addColorStop(0.6, `rgba(140, 66, 98, ${li.dusk * 0.08})`);
      g.addColorStop(1, `rgba(40, 30, 60, ${li.dusk * 0.1})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, this.width, this.height);
    }
    if (li.dawn > 0.2) {
      const g = ctx.createLinearGradient(0, 0, this.width, this.height);
      g.addColorStop(0, `rgba(255, 168, 170, ${li.dawn * 0.11})`);
      g.addColorStop(0.6, `rgba(160, 120, 160, ${li.dawn * 0.06})`);
      g.addColorStop(1, `rgba(50, 50, 90, ${li.dawn * 0.08})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, this.width, this.height);
    }

    // Sun / moon glow.
    const sunX = this.width * (0.12 + 0.76 * li.t);
    const sunY = this.height * 0.16;
    if (li.daylight > 0.12) {
      const sun = ctx.createRadialGradient(sunX, sunY, 10, sunX, sunY, this.width * 0.62);
      sun.addColorStop(0, `rgba(255, 226, 168, ${0.16 * li.daylight})`);
      sun.addColorStop(0.45, `rgba(255, 172, 118, ${0.06 * li.daylight})`);
      sun.addColorStop(1, 'rgba(255, 140, 110, 0)');
      ctx.fillStyle = sun;
      ctx.fillRect(0, 0, this.width, this.height);
    } else {
      const moon = ctx.createRadialGradient(this.width * 0.74, this.height * 0.12, 4, this.width * 0.74, this.height * 0.12, 240);
      moon.addColorStop(0, 'rgba(198, 220, 255, 0.16)');
      moon.addColorStop(0.4, 'rgba(150, 184, 255, 0.05)');
      moon.addColorStop(1, 'rgba(120, 160, 255, 0)');
      ctx.fillStyle = moon;
      ctx.fillRect(0, 0, this.width, this.height);
      // Stars, deterministic and faint.
      ctx.fillStyle = 'rgba(230, 240, 255, 0.5)';
      for (let i = 0; i < 28; i += 1) {
        const x = (i * 197 + 53) % this.width;
        const y = (i * 83 + 29) % (this.height * 0.5);
        const a = 0.15 + 0.25 * Math.abs(Math.sin(i + (game.worldTime || 0) * 0.3));
        ctx.globalAlpha = a * clamp(li.night, 0, 1);
        ctx.fillRect(x, y, 1.6, 1.6);
      }
      ctx.globalAlpha = 1;
    }

    // Haze/fog on screen.
    if (w && (w.type === 'haze' || w.type === 'rain' || w.type === 'storm')) {
      const fog = w.type === 'storm' ? 0.14 : w.type === 'rain' ? 0.09 : 0.1;
      ctx.fillStyle = `rgba(214, 224, 226, ${fog})`;
      ctx.fillRect(0, 0, this.width, this.height);
    }

    // Rain on the lens.
    if (w && (w.type === 'rain' || w.type === 'storm')) {
      const intensity = w.intensity || 0.5;
      ctx.save();
      ctx.strokeStyle = `rgba(190, 224, 232, ${0.016 + intensity * 0.024})`;
      ctx.lineWidth = 1;
      const time = game.worldTime || 0;
      for (let i = 0; i < 80; i += 1) {
        const x = (i * 97 + Math.sin(time * 0.3 + i) * 30) % this.width;
        const y = (i * 53 + time * 180) % this.height;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - 2, y + 16);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Wet wash.
    const wet = w?.wetness || 0;
    if (wet > 0.05) {
      ctx.fillStyle = `rgba(38, 80, 98, ${wet * 0.045})`;
      ctx.fillRect(0, 0, this.width, this.height);
    }

    // Lightning.
    if (w?.flash > 0) {
      ctx.fillStyle = `rgba(220, 236, 255, ${Math.min(0.48, w.flash * 0.46)})`;
      ctx.fillRect(0, 0, this.width, this.height);
    }

    // Vignette.
    const vig = ctx.createRadialGradient(this.width / 2, this.height / 2, this.height * 0.34, this.width / 2, this.height / 2, this.width * 0.72);
    vig.addColorStop(0, 'rgba(8, 8, 14, 0)');
    vig.addColorStop(1, `rgba(8, 8, 14, ${0.34 + li.dark * 0.2})`);
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, this.width, this.height);

    // Very light scanline texture for the canvas look.
    ctx.fillStyle = 'rgba(255, 255, 255, 0.011)';
    for (let y = 0; y < this.height; y += 4) ctx.fillRect(0, y, this.width, 1);
  }
}

function ctxRing(ctx, x, y, r, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.stroke();
  ctx.restore();
}
