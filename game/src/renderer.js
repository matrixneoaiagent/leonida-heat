// Leonida Heat v4 - world renderer.
//
// The city is baked once into 800 px terrain tiles and cached per CityWorld.
// Everything that moves is composed every frame in a deliberate painter's
// order borrowed from film: ground, water, road wear, reflected light, pools
// of lamplight, palms, contact shadows, actors, projectiles, particles, hot
// muzzle light, markers, weather, then a screen-space grade.
//
// New in this pass: a continuous day/night light ramp (no categorical pops),
// an animated traffic-signal halo system, layered ocean foam, wind-driven
// palms, puddle mirroring and a split muzzle/particle light pass.

import { PALETTE, districtAt } from './config.js';

const TAU = Math.PI * 2;
const TILE = 800;
const WORLD = 3200;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const mix = (a, b, t) => a + (b - a) * t;
const smoothstep = (edge0, edge1, x) => {
  const t = clamp((x - edge0) / (edge1 - edge0 || 1), 0, 1);
  return t * t * (3 - 2 * t);
};

// ---------------------------------------------------------------------------
// Palette helpers. Colours are handled as [r,g,b] triples inside the light
// ramp and converted back to CSS only when a fill is issued.
// ---------------------------------------------------------------------------
function rgb(hex) {
  const value = hex.replace('#', '');
  const full = value.length === 3 ? value.split('').map((c) => c + c).join('') : value;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function css(triple, alpha = 1) {
  const [r, g, b] = triple;
  return alpha >= 1
    ? `rgb(${r | 0}, ${g | 0}, ${b | 0})`
    : `rgba(${r | 0}, ${g | 0}, ${b | 0}, ${alpha.toFixed(3)})`;
}

function blend(a, b, t) {
  return [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
}

function shade(hex, amount) {
  const c = rgb(hex);
  if (amount >= 0) {
    return css([mix(c[0], 255, amount), mix(c[1], 255, amount), mix(c[2], 255, amount)]);
  }
  return css([c[0] * (1 + amount), c[1] * (1 + amount), c[2] * (1 + amount)]);
}

function alpha(hex, a) {
  return css(rgb(hex), a);
}

function pathRound(ctx, x, y, w, h, r) {
  const radius = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function pathStar(ctx, x, y, r, points = 5) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i += 1) {
    const radius = i % 2 === 0 ? r : r * 0.42;
    const a = -Math.PI / 2 + (i * Math.PI) / points;
    const px = x + Math.cos(a) * radius;
    const py = y + Math.sin(a) * radius;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function intersects(box, x, y, pad = 0) {
  return x < box.x2 + pad && x + box.w > box.x - pad && y < box.y2 + pad && y + box.h > box.y - pad;
}

function hash01(x, y) {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

export function roundRect(ctx, x, y, w, h, r) {
  pathRound(ctx, x, y, w, h, r);
}

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------
export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.width = canvas.width || 1280;
    this.height = canvas.height || 720;
    this.view = { x: 0, y: 0, w: 0, h: 0, x2: 0, y2: 0 };
    this.frameIndex = 0;
    this.tileSize = TILE;
    this.tiles = new Map();
    this.tileCity = null;
    this.waterPhase = 0;
    this.lightCache = { key: -1, state: null };
    this._rain = this.buildRainField();
    this._stars = this.buildStars();
    this._tileCount = WORLD / TILE;
  }

  // =================================================================
  // Frame entry
  // =================================================================
  render(game) {
    const ctx = this.ctx;
    const cam = game.camera;
    this.frameIndex += 1;
    this.waterPhase = (game.worldTime || 0) + (game.sessionTime || 0) * 0.35;
    this.light = this.lightState(game);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = css(this.light.base);
    ctx.fillRect(0, 0, this.width, this.height);

    const trauma = cam.shake || 0;
    const sx = (Math.sin(this.frameIndex * 13.7) * 0.55 + Math.sin(this.frameIndex * 4.1) * 0.45) * trauma * 26;
    const sy = (Math.cos(this.frameIndex * 11.3) * 0.5 + Math.cos(this.frameIndex * 5.7) * 0.5) * trauma * 26;

    ctx.save();
    ctx.translate(this.width / 2 + sx, this.height / 2 + sy);
    ctx.rotate((trauma > 0.35 ? Math.sin(this.frameIndex * 7.3) * trauma * 0.006 : 0));
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-cam.x, -cam.y);

    const halfW = this.width / 2 / cam.zoom;
    const halfH = this.height / 2 / cam.zoom;
    this.view = {
      x: cam.x - halfW, y: cam.y - halfH, w: halfW * 2, h: halfH * 2,
      x2: cam.x + halfW, y2: cam.y + halfH,
    };

    this.paintTerrain(game);
    this.paintOcean(game);
    this.paintBuildingShadows(game);
    this.paintStreetWear(game);
    this.paintAmbientWash(game);
    this.paintMirrors(game);
    this.paintLightPools(game);
    this.paintSirenHalos(game);
    this.paintHeadlightWashes(game);
    this.paintSearchSweep(game);
    this.paintBuildingHalos(game);
    this.paintNeonSigns(game);
    this.paintCityLife(game);
    this.paintTrafficSignals(game);
    this.paintPalms(game);
    this.paintContactShadows(game);
    this.paintActors(game);
    this.paintProjectiles(game);
    this.paintParticles(game);
    this.paintMuzzleLight(game);
    this.paintObjectives(game);
    this.paintWorldRain(game);
    this.paintReticle(game);

    ctx.restore();
    this.paintGrade(game);
  }

  inView(x, y, pad = 80) {
    const v = this.view;
    return x > v.x - pad && x < v.x2 + pad && y > v.y - pad && y < v.y2 + pad;
  }

  // =================================================================
  // Continuous light ramp
  // =================================================================
  lightState(game) {
    const raw = ((game.timeOfDay ?? 0.5) % 1 + 1) % 1;
    const key = Math.round(raw * 2000);
    if (this.lightCache.key === key && this.lightCache.state) return this.lightCache.state;

    // Solar altitude, normalised: -1 at midnight, +1 at noon.
    const altitude = Math.sin((raw - 0.25) * TAU);
    const day = smoothstep(-0.12, 0.30, altitude);
    const night = 1 - smoothstep(-0.30, 0.02, altitude);
    const dusk = Math.exp(-Math.pow((raw - 0.716) / 0.055, 2));
    const dawn = Math.exp(-Math.pow((raw - 0.252) / 0.052, 2));
    const golden = Math.max(dusk, dawn);

    // Sky colour is blended through midnight, dawn, noon and dusk anchors.
    const midnight = rgb('#0f1428');
    const predawn = rgb('#3b3550');
    const sunrise = rgb('#e8947a');
    const noon = rgb('#8eb4bf');
    const sunset = rgb('#c96d7c');
    const evening = rgb('#302a48');
    let sky;
    if (raw < 0.20) sky = blend(midnight, predawn, smoothstep(0.02, 0.20, raw));
    else if (raw < 0.31) sky = blend(predawn, sunrise, smoothstep(0.20, 0.31, raw));
    else if (raw < 0.42) sky = blend(sunrise, noon, smoothstep(0.31, 0.42, raw));
    else if (raw < 0.60) sky = noon;
    else if (raw < 0.70) sky = blend(noon, sunset, smoothstep(0.60, 0.70, raw));
    else if (raw < 0.80) sky = blend(sunset, evening, smoothstep(0.70, 0.80, raw));
    else sky = blend(evening, midnight, smoothstep(0.80, 0.96, raw));

    // Ground ambient keeps a little of the district colour at noon.
    const dayGround = rgb('#6f8068');
    const nightGround = rgb('#151a2a');
    const ambient = blend(nightGround, dayGround, day);
    const base = blend(sky, ambient, 0.24);
    const sun = blend(rgb('#9db8ff'), blend(rgb('#ffe2b4'), rgb('#ff9d6e'), golden), day);
    const shadowDir = (raw - 0.26) * TAU + 2.55;
    const shadowLength = clamp(0.10 + (1 - day) * 0.22 + golden * 1.35, 0.10, 1.6);
    const warm = 0.18 + golden * 0.76;

    const state = {
      raw, altitude, day, night, dusk, dawn, golden, sky, base, sun, ambient,
      dark: 1 - day,
      warm,
      shadowDir,
      shadowLength,
      starAlpha: clamp(night * 0.9, 0, 0.9),
      sunX: 0.5 + Math.cos((raw - 0.25) * TAU) * 0.38,
      sunY: 0.16 + (1 - clamp(altitude, 0, 1)) * 0.22,
      key,
    };
    this.lightCache = { key, state };
    return state;
  }

  // =================================================================
  // Terrain tiles
  // =================================================================
  tileAt(game, tx, ty) {
    if (this.tileCity !== game.city) {
      this.tiles.clear();
      this.tileCity = game.city;
    }
    const id = `${tx}:${ty}`;
    let tile = this.tiles.get(id);
    if (tile) return tile;

    const canvas = document.createElement('canvas');
    canvas.width = TILE;
    canvas.height = TILE;
    const tctx = canvas.getContext('2d', { alpha: false });
    const x0 = tx * TILE;
    const y0 = ty * TILE;
    tctx.save();
    tctx.beginPath();
    tctx.rect(0, 0, TILE, TILE);
    tctx.clip();
    tctx.translate(-x0, -y0);

    const box = { x: x0, y: y0, w: TILE, h: TILE, x2: x0 + TILE, y2: y0 + TILE };
    this.bakeGround(tctx, game, box);
    this.bakeLots(tctx, game, box);
    this.bakeAsphalt(tctx, game, box);
    this.bakeStructures(tctx, game, box);
    this.bakeFurniture(tctx, game, box);
    this.bakeRamps(tctx, game, box);
    tctx.restore();

    tile = { canvas, x: x0, y: y0 };
    this.tiles.set(id, tile);
    return tile;
  }

  paintTerrain(game) {
    const v = this.view;
    const maxTx = Math.min(this._tileCount - 1, Math.floor(v.x2 / TILE));
    const maxTy = Math.min(this._tileCount - 1, Math.floor(v.y2 / TILE));
    const minTx = Math.max(0, Math.floor(v.x / TILE));
    const minTy = Math.max(0, Math.floor(v.y / TILE));
    for (let ty = minTy; ty <= maxTy; ty += 1) {
      for (let tx = minTx; tx <= maxTx; tx += 1) {
        const tile = this.tileAt(game, tx, ty);
        this.ctx.drawImage(tile.canvas, tile.x, tile.y);
      }
    }
  }

  bakeGround(ctx, game, box) {
    const city = game.city;
    // Land base: dry coastal green with a hint of the district lot.
    const base = ctx.createLinearGradient(box.x, box.y, box.x, box.y2);
    base.addColorStop(0, '#68775f');
    base.addColorStop(0.55, '#61705a');
    base.addColorStop(1, '#5a6956');
    ctx.fillStyle = base;
    ctx.fillRect(box.x, box.y, box.w, box.h);

    // Beach band.
    if (box.x2 > 2460) {
      const sand = ctx.createLinearGradient(2480, 0, 2720, 0);
      sand.addColorStop(0, '#d9c294');
      sand.addColorStop(0.22, '#efd5a2');
      sand.addColorStop(0.72, '#f3dcaa');
      sand.addColorStop(1, '#d6bd8a');
      ctx.fillStyle = sand;
      ctx.fillRect(2472, box.y - 2, 250, box.h + 4);

      // Boardwalk planks.
      ctx.fillStyle = '#b78d5d';
      ctx.fillRect(2494, box.y - 2, 58, box.h + 4);
      ctx.strokeStyle = 'rgba(86, 58, 36, 0.38)';
      ctx.lineWidth = 1;
      for (let y = Math.floor(box.y / 9) * 9; y < box.y2 + 9; y += 9) {
        ctx.beginPath();
        ctx.moveTo(2494, y);
        ctx.lineTo(2552, y);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(255, 238, 205, 0.22)';
      ctx.fillRect(2494, box.y, 3, box.h);
      ctx.fillRect(2549, box.y, 3, box.h);
      ctx.fillStyle = 'rgba(92, 62, 38, 0.5)';
      ctx.fillRect(2522, box.y, 2, box.h);

      // Wet sand sheen and dry specks.
      for (let i = 0; i < 130; i += 1) {
        const x = 2560 + hash01(box.x + i * 13, box.y + i * 7) * 146;
        const y = box.y + hash01(box.x + i * 3, box.y + i * 11) * box.h;
        ctx.fillStyle = i % 3 === 0 ? 'rgba(120, 94, 58, 0.13)' : 'rgba(255, 246, 214, 0.25)';
        ctx.fillRect(x, y, 1 + (i % 2), 1);
      }
    }

    // Ocean floor; animated surface and foam are painted every frame.
    if (box.x2 > 2700) {
      const sea = ctx.createLinearGradient(2712, 0, 3200, 0);
      sea.addColorStop(0, '#3a9aa4');
      sea.addColorStop(0.25, '#247c8d');
      sea.addColorStop(0.7, '#155d78');
      sea.addColorStop(1, '#0f4b66');
      ctx.fillStyle = sea;
      ctx.fillRect(2712, box.y - 2, 500, box.h + 4);
      ctx.strokeStyle = 'rgba(213, 248, 245, 0.28)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(2712, box.y);
      ctx.lineTo(2712, box.y2);
      ctx.stroke();
    }

    // Grass irregularity: sparse deterministic tufts outside the beach.
    for (let i = 0; i < 116; i += 1) {
      const x = box.x + hash01(box.x + i, box.y + i * 3) * box.w;
      const y = box.y + hash01(box.x + i * 5, box.y + i) * box.h;
      if (x > 2460) continue;
      ctx.fillStyle = i % 4 === 0 ? 'rgba(40, 58, 38, 0.20)' : 'rgba(160, 178, 126, 0.13)';
      ctx.fillRect(x, y, 2 + (i % 4), 1 + (i % 2));
    }

    // Piers (wooden decks).
    for (const pier of city.piers) {
      if (!intersects(box, pier.x - pier.w / 2, pier.y - pier.h / 2, 4) && !(pier.x + pier.w / 2 > box.x && pier.x - pier.w / 2 < box.x2 && pier.y + pier.h / 2 > box.y && pier.y - pier.h / 2 < box.y2)) continue;
      const px = pier.x - pier.w / 2;
      const py = pier.y - pier.h / 2;
      ctx.fillStyle = '#a9835c';
      pathRound(ctx, px, py, pier.w, pier.h, 3);
      ctx.fill();
      ctx.strokeStyle = 'rgba(63, 43, 28, 0.45)';
      ctx.lineWidth = 1;
      for (let x = px + 6; x < px + pier.w; x += 11) {
        ctx.beginPath();
        ctx.moveTo(x, py + 2);
        ctx.lineTo(x, py + pier.h - 2);
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(255, 230, 190, 0.25)';
      ctx.strokeRect(px + 1, py + 1, pier.w - 2, pier.h - 2);
      if (pier.boats) {
        ctx.fillStyle = 'rgba(38, 54, 58, 0.4)';
        ctx.fillRect(px + 18, py + 6, 22, 8);
      }
    }

    // Marina basin lines.
    const marina = city.marina;
    if (marina && marina.x + marina.r > box.x && marina.x - marina.r < box.x2) {
      ctx.strokeStyle = 'rgba(208, 246, 244, 0.14)';
      ctx.lineWidth = 1.4;
      for (let i = 0; i < 3; i += 1) {
        ctx.beginPath();
        ctx.arc(marina.x, marina.y, marina.r - i * 26, 0, TAU);
        ctx.stroke();
      }
    }
  }

  bakeLots(ctx, game, box) {
    const city = game.city;
    for (const block of city.blocks) {
      if (block.xMax < box.x - 8 || block.xMin > box.x2 + 8) continue;
      if (block.yMax < box.y - 8 || block.yMin > box.y2 + 8) continue;
      const b = { x: block.xMin, y: block.yMin, w: block.w, h: block.h };

      // Paving border.
      ctx.fillStyle = '#ccb99c';
      pathRound(ctx, b.x, b.y, b.w, b.h, 4);
      ctx.fill();
      ctx.strokeStyle = 'rgba(74, 62, 50, 0.24)';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      const pad = 18;
      const ix = b.x + pad;
      const iy = b.y + pad;
      const iw = b.w - pad * 2;
      const ih = b.h - pad * 2;
      if (iw <= 0 || ih <= 0) continue;

      if (block.kind === 'park') {
        ctx.fillStyle = '#799567';
        ctx.fillRect(ix, iy, iw, ih);
        ctx.fillStyle = 'rgba(117, 150, 96, 0.5)';
        for (let y = iy + 6; y < iy + ih; y += 12) ctx.fillRect(ix, y, iw, 2);
        ctx.fillStyle = 'rgba(217, 200, 160, 0.5)';
        ctx.fillRect(ix + iw * 0.42, iy, Math.max(8, iw * 0.08), ih);
        ctx.fillRect(ix, iy + ih * 0.48, iw, Math.max(8, ih * 0.07));
        // Pond.
        if (block.pond) {
          ctx.fillStyle = '#3d8c97';
          ctx.beginPath();
          ctx.ellipse(ix + iw * 0.68, iy + ih * 0.34, iw * 0.17, ih * 0.15, 0.2, 0, TAU);
          ctx.fill();
          ctx.strokeStyle = 'rgba(238, 252, 248, 0.45)';
          ctx.lineWidth = 1.2;
          ctx.stroke();
        }
      } else if (block.kind === 'parking') {
        ctx.fillStyle = '#56535a';
        ctx.fillRect(ix, iy, iw, ih);
        ctx.fillStyle = 'rgba(255, 243, 220, 0.05)';
        for (let x = ix; x < ix + iw; x += 60) ctx.fillRect(x, iy, 1, ih);
        ctx.strokeStyle = 'rgba(238, 230, 208, 0.34)';
        ctx.lineWidth = 1.2;
        for (let x = ix + 10; x < ix + iw - 6; x += 24) {
          ctx.beginPath();
          ctx.moveTo(x, iy + 6);
          ctx.lineTo(x, iy + ih - 6);
          ctx.stroke();
        }
        ctx.fillStyle = 'rgba(196, 186, 166, 0.42)';
        for (let x = ix + 6; x < ix + iw - 4; x += 24) ctx.fillRect(x, iy + ih - 12, 10, 3);
      } else if (block.kind === 'plaza') {
        ctx.fillStyle = '#cbbca4';
        ctx.fillRect(ix, iy, iw, ih);
        // Alternating paving tiles.
        const tile = 22;
        for (let y = 0; y < ih; y += tile) {
          for (let x = 0; x < iw; x += tile) {
            if (((x / tile) + (y / tile)) % 2 < 1) {
              ctx.fillStyle = 'rgba(255, 246, 224, 0.12)';
              ctx.fillRect(ix + x, iy + y, Math.min(tile, iw - x), Math.min(tile, ih - y));
            }
          }
        }
        ctx.strokeStyle = 'rgba(106, 92, 74, 0.26)';
        ctx.lineWidth = 1;
        for (let x = ix; x < ix + iw; x += tile) {
          ctx.beginPath();
          ctx.moveTo(x, iy);
          ctx.lineTo(x, iy + ih);
          ctx.stroke();
        }
        for (let y = iy; y < iy + ih; y += tile) {
          ctx.beginPath();
          ctx.moveTo(ix, y);
          ctx.lineTo(ix + iw, y);
          ctx.stroke();
        }
        // Central medallion and radial lines for the larger plazas.
        if (iw > 170 && ih > 150) {
          const cx = ix + iw / 2;
          const cy = iy + ih / 2;
          const r = Math.min(iw, ih) * 0.22;
          ctx.fillStyle = 'rgba(218, 204, 178, 0.55)';
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, TAU);
          ctx.fill();
          ctx.strokeStyle = 'rgba(112, 96, 76, 0.34)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, TAU);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(cx, cy, r * 0.62, 0, TAU);
          ctx.stroke();
          for (let i = 0; i < 8; i += 1) {
            const a = (i / 8) * TAU;
            ctx.beginPath();
            ctx.moveTo(cx + Math.cos(a) * r * 0.68, cy + Math.sin(a) * r * 0.68);
            ctx.lineTo(cx + Math.cos(a) * r * 0.98, cy + Math.sin(a) * r * 0.98);
            ctx.stroke();
          }
        }
        // Café tables and benches keep the paving from reading empty.
        for (let i = 0; i < 4; i += 1) {
          const tx = ix + iw * (i % 2 === 0 ? 0.2 : 0.8);
          const ty = iy + ih * (i < 2 ? 0.22 : 0.78);
          ctx.fillStyle = 'rgba(58, 48, 38, 0.26)';
          ctx.beginPath();
          ctx.arc(tx + 2, ty + 3, 8, 0, TAU);
          ctx.fill();
          ctx.fillStyle = '#e8ddc6';
          ctx.beginPath();
          ctx.arc(tx, ty, 7, 0, TAU);
          ctx.fill();
          ctx.strokeStyle = 'rgba(118, 92, 66, 0.55)';
          ctx.lineWidth = 1.2;
          ctx.stroke();
          ctx.fillStyle = '#9a7958';
          for (let c = 0; c < 3; c += 1) {
            const a = (c / 3) * TAU + 0.4;
            ctx.beginPath();
            ctx.arc(tx + Math.cos(a) * 13, ty + Math.sin(a) * 12, 3.2, 0, TAU);
            ctx.fill();
          }
        }
        ctx.fillStyle = 'rgba(126, 94, 60, 0.7)';
        ctx.fillRect(ix + iw * 0.34, iy + 12, 34, 5);
        ctx.fillRect(ix + iw * 0.62, iy + ih - 17, 34, 5);
      } else {
        // Lot ground tinted by district character.
        const district = districtAt(block.x, block.y);
        ctx.fillStyle = district.lot || '#c6b49d';
        ctx.fillRect(ix, iy, iw, ih);
        ctx.fillStyle = 'rgba(86, 72, 56, 0.12)';
        for (let y = iy + 8; y < iy + ih; y += 16) ctx.fillRect(ix, y, iw, 1.2);
        ctx.strokeStyle = 'rgba(70, 58, 44, 0.18)';
        ctx.strokeRect(ix + 0.5, iy + 0.5, iw - 1, ih - 1);
      }

      // Alley cuts.
      for (const alley of city.alleys) {
        if (alley.x < b.x || alley.x > b.x + b.w || alley.y < b.y || alley.y > b.y + b.h) continue;
        ctx.fillStyle = 'rgba(54, 51, 54, 0.68)';
        if (alley.w > alley.h) ctx.fillRect(alley.x - alley.w / 2, alley.y - alley.h / 2, alley.w, alley.h);
        else ctx.fillRect(alley.x - alley.w / 2, alley.y - alley.h / 2, alley.w, alley.h);
      }
    }

    // Boardwalk benches/planters are baked furniture; keep the pavement warm.
    ctx.fillStyle = 'rgba(255, 244, 214, 0.04)';
    ctx.fillRect(2552, box.y, 7, box.h);
  }

  bakeAsphalt(ctx, game, box) {
    const city = game.city;
    for (const road of city.roads) {
      const rx1 = Math.min(road.x1, road.x2);
      const rx2 = Math.max(road.x1, road.x2);
      const ry1 = Math.min(road.y1, road.y2);
      const ry2 = Math.max(road.y1, road.y2);
      if (road.horizontal) {
        if (ry2 < box.y - road.half || ry1 > box.y2 + road.half) continue;
        if (rx2 < box.x || rx1 > box.x2) continue;
        const y = road.y1 - road.half;
        ctx.fillStyle = '#45424b';
        ctx.fillRect(rx1, y, rx2 - rx1, road.width);
        ctx.fillStyle = 'rgba(255, 244, 224, 0.10)';
        ctx.fillRect(rx1, y, rx2 - rx1, 2);
        ctx.fillStyle = 'rgba(12, 12, 16, 0.18)';
        ctx.fillRect(rx1, y + road.width - 3, rx2 - rx1, 3);
        this.bakeRoadMarkings(ctx, road, 'h', rx1, rx2, box);
      } else {
        if (rx2 < box.x - road.half || rx1 > box.x2 + road.half) continue;
        if (ry2 < box.y || ry1 > box.y2) continue;
        const x = road.x1 - road.half;
        ctx.fillStyle = '#45424b';
        ctx.fillRect(x, ry1, road.width, ry2 - ry1);
        ctx.fillStyle = 'rgba(255, 244, 224, 0.09)';
        ctx.fillRect(x, ry1, 2, ry2 - ry1);
        ctx.fillStyle = 'rgba(12, 12, 16, 0.18)';
        ctx.fillRect(x + road.width - 3, ry1, 3, ry2 - ry1);
        this.bakeRoadMarkings(ctx, road, 'v', ry1, ry2, box);
      }
    }

    // Intersection pads cover the seam of crossing roads.
    for (const inter of city.intersections) {
      if (!intersects(box, inter.x - inter.size, inter.y - inter.size, 100)) continue;
      const half = Math.max(inter.hWidth, inter.vWidth) / 2 + 2;
      ctx.fillStyle = '#48454e';
      pathRound(ctx, inter.x - half, inter.y - half, half * 2, half * 2, 5);
      ctx.fill();
      ctx.strokeStyle = 'rgba(225, 209, 180, 0.34)';
      ctx.lineWidth = 3;
      // Zebra crossings on all four sides.
      for (let side = 0; side < 4; side += 1) {
        const horizontal = side < 2;
        const dir = side % 2 === 0 ? -1 : 1;
        for (let i = -3; i <= 3; i += 1) {
          if (horizontal) {
            const x = inter.x + i * 7;
            const y = inter.y + dir * (half + 5);
            ctx.fillStyle = 'rgba(236, 229, 210, 0.34)';
            ctx.fillRect(x - 2.5, y - 4, 5, 8);
          } else {
            const x = inter.x + dir * (half + 5);
            const y = inter.y + i * 7;
            ctx.fillStyle = 'rgba(236, 229, 210, 0.34)';
            ctx.fillRect(x - 4, y - 2.5, 8, 5);
          }
        }
      }
      // Manhole and tar seams.
      ctx.fillStyle = 'rgba(28, 28, 32, 0.55)';
      ctx.beginPath();
      ctx.arc(inter.x + 26, inter.y + 20, 8, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(196, 186, 166, 0.22)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(inter.x + 26, inter.y + 20, 6, 0, TAU);
      ctx.stroke();
    }

    for (const patch of city.roadPatches) {
      if (!this.inViewBox(box, patch.x, patch.y, 60)) continue;
      ctx.save();
      ctx.translate(patch.x, patch.y);
      ctx.rotate(patch.angle || 0);
      ctx.fillStyle = patch.light
        ? `rgba(126, 119, 112, ${patch.alpha})`
        : `rgba(22, 21, 26, ${patch.alpha + 0.06})`;
      ctx.fillRect(-patch.w / 2, -patch.h / 2, patch.w, patch.h);
      ctx.restore();
    }

    for (const crack of city.roadCracks) {
      const first = crack.points[0];
      if (!this.inViewBox(box, first.x, first.y, 90)) continue;
      ctx.strokeStyle = `rgba(18, 17, 22, ${crack.alpha})`;
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      crack.points.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.stroke();
    }
  }

  bakeRoadMarkings(ctx, road, axis, from, to, box) {
    const horizontal = axis === 'h';
    const center = horizontal ? road.y1 : road.x1;
    const half = road.half;
    const arterial = road.kind === 'arterial' || road.kind === 'highway';

    // Edge lines.
    ctx.fillStyle = 'rgba(236, 226, 204, 0.30)';
    if (horizontal) {
      ctx.fillRect(from, center - half + 3, to - from, 2);
      ctx.fillRect(from, center + half - 5, to - from, 2);
    } else {
      ctx.fillRect(center - half + 3, from, 2, to - from);
      ctx.fillRect(center + half - 5, from, 2, to - from);
    }

    // Centre treatment.
    if (arterial) {
      ctx.fillStyle = 'rgba(244, 203, 93, 0.66)';
      if (horizontal) {
        ctx.fillRect(from, center - 3, to - from, 2);
        ctx.fillRect(from, center + 1, to - from, 2);
      } else {
        ctx.fillRect(center - 3, from, 2, to - from);
        ctx.fillRect(center + 1, from, 2, to - from);
      }
    } else {
      ctx.fillStyle = 'rgba(240, 231, 210, 0.42)';
      if (horizontal) {
        for (let x = Math.floor(from / 26) * 26; x < to; x += 26) ctx.fillRect(x, center - 1, 13, 2);
      } else {
        for (let y = Math.floor(from / 26) * 26; y < to; y += 26) ctx.fillRect(center - 1, y, 2, 13);
      }
    }

    // Lane divider dashes.
    ctx.fillStyle = 'rgba(232, 225, 208, 0.28)';
    const lane = road.width / 4;
    for (const off of [-lane, lane]) {
      if (horizontal) {
        const y = center + off;
        for (let x = Math.floor(from / 34) * 34; x < to; x += 34) ctx.fillRect(x, y - 1, 15, 2);
      } else {
        const x = center + off;
        for (let y = Math.floor(from / 34) * 34; y < to; y += 34) ctx.fillRect(x - 1, y, 2, 15);
      }
    }
    void box;
  }

  bakeStructures(ctx, game, box) {
    const city = game.city;
    const list = city.buildings.filter((b) => b.x + b.w / 2 > box.x - 40 && b.x - b.w / 2 < box.x2 + 40 && b.y + b.h / 2 > box.y - 60 && b.y - b.h / 2 < box.y2 + 40);
    list.sort((a, b) => a.y - b.y);
    for (const b of list) this.paintBuilding(ctx, city, b);
  }

  paintBuilding(ctx, city, b) {
    const left = b.x - b.w / 2;
    const top = b.y - b.h / 2;
    const heightLift = clamp((b.height || 16) * 0.22, 3, 17);
    const roofX = left - heightLift * 0.45;
    const roofY = top - heightLift * 0.78;
    const roofW = b.w * 0.93;
    const roofH = b.h * 0.93;

    // Contact shadow.
    ctx.fillStyle = 'rgba(24, 20, 20, 0.25)';
    pathRound(ctx, left + 5, top + 7, b.w, b.h, 3);
    ctx.fill();

    // Body / south-east walls.
    ctx.fillStyle = shade(b.color || '#9a8d7d', -0.24);
    pathRound(ctx, left, top, b.w, b.h, 2.6);
    ctx.fill();

    // South face and east face are visible as darker bands.
    const faceColor = shade(b.color || '#9a8d7d', -0.38);
    ctx.fillStyle = faceColor;
    ctx.fillRect(left + 2, top + b.h - 7, b.w - 4, 7);
    ctx.fillRect(left + b.w - 7, top + 2, 7, b.h - 4);

    // Lit / dark windows along the faces.
    const rows = Math.min(5, b.windowRows || 2);
    const cols = b.windowCols || 3;
    for (let r = 0; r < rows; r += 1) {
      for (let i = 0; i < cols; i += 1) {
        const litHere = city.hash(b.x + i * 19, b.y + r * 33, 9) > 0.38;
        const glow = litHere ? 'rgba(255, 219, 156, 0.72)' : 'rgba(30, 34, 42, 0.8)';
        ctx.fillStyle = glow;
        ctx.fillRect(left + 9 + i * ((b.w - 18) / cols), top + b.h - 5.5, 5, 2.4);
        ctx.fillRect(left + b.w - 5.5, top + 10 + r * ((b.h - 18) / rows), 2.4, 5);
      }
    }

    // Roof plate, shifted to suggest extrusion.
    ctx.fillStyle = b.roofColor || '#5b5248';
    pathRound(ctx, roofX, roofY, roofW, roofH, 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 250, 232, 0.15)';
    ctx.lineWidth = 1.1;
    ctx.stroke();

    if (b.type === 'tower') {
      // Glass curtain grid.
      ctx.fillStyle = 'rgba(199, 240, 244, 0.10)';
      ctx.fillRect(roofX + 4, roofY + 4, roofW - 8, roofH - 8);
      ctx.strokeStyle = 'rgba(218, 250, 252, 0.13)';
      ctx.lineWidth = 0.8;
      for (let x = roofX + 8; x < roofX + roofW - 4; x += 11) {
        ctx.beginPath();
        ctx.moveTo(x, roofY + 4);
        ctx.lineTo(x, roofY + roofH - 4);
        ctx.stroke();
      }
      for (let y = roofY + 8; y < roofY + roofH - 4; y += 9) {
        ctx.beginPath();
        ctx.moveTo(roofX + 4, y);
        ctx.lineTo(roofX + roofW - 4, y);
        ctx.stroke();
      }
    } else if (b.type === 'warehouse' || b.type === 'container') {
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.14)';
      ctx.lineWidth = 1;
      for (let x = roofX + 5; x < roofX + roofW - 3; x += 5) {
        ctx.beginPath();
        ctx.moveTo(x, roofY + 3);
        ctx.lineTo(x, roofY + roofH - 3);
        ctx.stroke();
      }
    } else {
      ctx.strokeStyle = 'rgba(60, 50, 42, 0.18)';
      ctx.lineWidth = 1;
      ctx.strokeRect(roofX + 5, roofY + 5, roofW - 10, roofH - 10);
    }

    // Roof furniture.
    if (b.roofProps) {
      for (const prop of b.roofProps) {
        const px = roofX + roofW * 0.5 + prop.dx;
        const py = roofY + roofH * 0.5 + prop.dy;
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(prop.rotate || 0);
        if (prop.type === 'ac') {
          ctx.fillStyle = '#a7a9a4';
          ctx.fillRect(-7, -5, 14, 10);
          ctx.fillStyle = '#6d716e';
          ctx.fillRect(-4, -3, 8, 6);
        } else if (prop.type === 'tank') {
          ctx.fillStyle = '#8c7a62';
          ctx.beginPath();
          ctx.arc(0, 0, prop.size * 0.55, 0, TAU);
          ctx.fill();
          ctx.strokeStyle = '#5d4e3e';
          ctx.lineWidth = 1;
          ctx.stroke();
        } else if (prop.type === 'vent') {
          ctx.fillStyle = '#858783';
          ctx.fillRect(-3, -3, 6, 6);
        } else if (prop.type === 'dish') {
          ctx.fillStyle = '#d8d8d2';
          ctx.beginPath();
          ctx.arc(0, 0, 5, 0, TAU);
          ctx.fill();
          ctx.fillStyle = '#6c706e';
          ctx.fillRect(-1, -1, 2, 2);
        } else if (prop.type === 'solar') {
          ctx.fillStyle = '#2e4a62';
          ctx.fillRect(-8, -5, 16, 10);
          ctx.strokeStyle = 'rgba(150, 220, 238, 0.34)';
          for (let x = -6; x < 8; x += 4) {
            ctx.beginPath();
            ctx.moveTo(x, -5);
            ctx.lineTo(x, 5);
            ctx.stroke();
          }
        } else {
          ctx.fillStyle = '#6f8a5d';
          ctx.beginPath();
          ctx.arc(0, 0, prop.size * 0.5, 0, TAU);
          ctx.fill();
          ctx.fillStyle = 'rgba(214, 236, 180, 0.4)';
          ctx.beginPath();
          ctx.arc(-2, -2, prop.size * 0.3, 0, TAU);
          ctx.fill();
        }
        ctx.restore();
      }
    }

    if (b.hasHelipad) {
      const hx = roofX + roofW * 0.52;
      const hy = roofY + roofH * 0.5;
      ctx.fillStyle = 'rgba(232, 228, 216, 0.36)';
      ctx.beginPath();
      ctx.arc(hx, hy, Math.min(17, b.w * 0.18), 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(250, 244, 226, 0.66)';
      ctx.lineWidth = 1.8;
      ctx.stroke();
      ctx.fillStyle = 'rgba(54, 58, 58, 0.65)';
      ctx.font = '900 11px "Segoe UI", Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('H', hx, hy + 4);
    }

    if (b.hasRoofPool || b.hasPool) {
      const px = b.hasRoofPool ? roofX + roofW * 0.65 : left + b.w + 10;
      const py = b.hasRoofPool ? roofY + roofH * 0.34 : top + b.h * 0.55;
      ctx.fillStyle = '#3aa6ba';
      pathRound(ctx, px, py, 23, 14, 4);
      ctx.fill();
      ctx.strokeStyle = 'rgba(240, 255, 252, 0.62)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(220, 255, 255, 0.32)';
      ctx.beginPath();
      ctx.moveTo(px + 4, py + 4);
      ctx.lineTo(px + 18, py + 4);
      ctx.stroke();
    }

    if (b.awning) {
      const aw = Math.min(b.w * 0.72, 84);
      const ax = b.x - aw / 2;
      const ay = top + b.h - 3;
      ctx.fillStyle = b.awningColor || '#c45a5a';
      ctx.fillRect(ax, ay, aw, 10);
      ctx.fillStyle = 'rgba(255, 250, 232, 0.4)';
      for (let x = ax + 2; x < ax + aw - 2; x += 11) ctx.fillRect(x, ay, 5, 10);
      ctx.fillStyle = 'rgba(24, 20, 18, 0.18)';
      ctx.fillRect(ax, ay + 10, aw, 3);
    }

    if (b.rollerDoors) {
      for (let i = 0; i < b.rollerDoors; i += 1) {
        const dw = 18;
        const dx = left + 12 + (i * (b.w - 30)) / Math.max(1, b.rollerDoors);
        ctx.fillStyle = 'rgba(46, 50, 52, 0.82)';
        ctx.fillRect(dx, top + b.h - 6, dw, 7);
        ctx.strokeStyle = 'rgba(214, 210, 198, 0.32)';
        ctx.lineWidth = 0.8;
        for (let y = top + b.h - 5; y < top + b.h + 1; y += 2) {
          ctx.beginPath();
          ctx.moveTo(dx, y);
          ctx.lineTo(dx + dw, y);
          ctx.stroke();
        }
      }
    }

    if (b.garden) {
      ctx.strokeStyle = 'rgba(91, 128, 73, 0.6)';
      ctx.lineWidth = 3;
      ctx.strokeRect(left - 5, top - 5, b.w + 10, b.h + 10);
      ctx.fillStyle = 'rgba(62, 94, 52, 0.5)';
      for (let i = 0; i < 10; i += 1) {
        ctx.beginPath();
        ctx.arc(left - 5 + (i % 5) * (b.w / 4), top - 5 + Math.floor(i / 5) * (b.h + 10), 3, 0, TAU);
        ctx.fill();
      }
    }

    if (b.neonText) {
      ctx.save();
      ctx.font = '800 8px "Segoe UI", Arial, sans-serif';
      const textW = Math.min(b.w - 6, Math.max(36, ctx.measureText(b.neonText).width + 14));
      const px = b.x - textW / 2;
      const py = top + b.h - 17;
      ctx.fillStyle = 'rgba(14, 12, 20, 0.74)';
      pathRound(ctx, px, py, textW, 12, 2);
      ctx.fill();
      ctx.strokeStyle = alpha(b.neonColor || '#ff7fa5', 0.8);
      ctx.lineWidth = 0.8;
      ctx.stroke();
      ctx.fillStyle = b.neonColor || '#ff7fa5';
      ctx.textAlign = 'center';
      ctx.fillText(b.neonText, b.x, py + 8.8);
      ctx.restore();
    }
  }

  bakeFurniture(ctx, game, box) {
    const city = game.city;
    for (const prop of city.props) {
      if (!this.inViewBox(box, prop.x, prop.y, 80)) continue;
      this.paintProp(ctx, prop);
    }
    for (const light of city.streetlights) {
      if (!this.inViewBox(box, light.x, light.y, 40)) continue;
      this.paintLampPost(ctx, light);
    }
    for (const billboard of city.billboards) {
      if (!this.inViewBox(box, billboard.x, billboard.y, 90)) continue;
      this.paintBillboard(ctx, billboard);
    }
    // Parking bay markings around the beach.
    for (const spot of city.parkingSpots) {
      if (!this.inViewBox(box, spot.x, spot.y, 30)) continue;
      ctx.save();
      ctx.translate(spot.x, spot.y);
      ctx.rotate(spot.angle);
      ctx.strokeStyle = 'rgba(238, 230, 208, 0.32)';
      ctx.lineWidth = 1;
      ctx.strokeRect(-11, -17, 22, 34);
      ctx.restore();
    }
  }

  paintProp(ctx, prop) {
    const { x, y } = prop;
    ctx.save();
    ctx.translate(x, y);
    switch (prop.type) {
      case 'bench':
        ctx.rotate(prop.angle || 0);
        ctx.fillStyle = '#8a5c3a';
        ctx.fillRect(-13, -3, 26, 3);
        ctx.fillRect(-13, 1, 26, 2);
        ctx.fillStyle = '#4d4a44';
        ctx.fillRect(-10, 4, 2, 4);
        ctx.fillRect(8, 4, 2, 4);
        break;
      case 'umbrella': {
        const color = prop.color || '#ff7f9e';
        ctx.fillStyle = 'rgba(74, 52, 30, 0.25)';
        ctx.beginPath();
        ctx.ellipse(4, 4, 22, 16, 0.2, 0, TAU);
        ctx.fill();
        for (let i = 0; i < 8; i += 1) {
          ctx.fillStyle = i % 2 ? this.litColor('#f6efe0', 0.5) : color;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.arc(0, 0, 22, (i / 8) * TAU, ((i + 1) / 8) * TAU);
          ctx.closePath();
          ctx.fill();
        }
        ctx.strokeStyle = 'rgba(90, 62, 36, 0.5)';
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(0, 6);
        ctx.stroke();
        break;
      }
      case 'towel':
        ctx.rotate(prop.angle || 0);
        ctx.fillStyle = prop.color || '#ffd166';
        ctx.fillRect(-14, -5, 28, 10);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
        ctx.fillRect(-14, -1, 28, 2);
        break;
      case 'boat':
        ctx.rotate(prop.angle || 0);
        ctx.fillStyle = prop.color || '#f4f1e8';
        ctx.beginPath();
        ctx.ellipse(0, 0, 11, 24, 0, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#2c3b44';
        ctx.fillRect(-5, -6, 10, 9);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(0, 0, 11, 24, 0, 0, TAU);
        ctx.stroke();
        break;
      case 'lifeguard':
        ctx.fillStyle = '#e9d7b9';
        ctx.fillRect(-13, -11, 26, 22);
        ctx.fillStyle = '#e25c5c';
        ctx.beginPath();
        ctx.moveTo(-16, -11);
        ctx.lineTo(0, -20);
        ctx.lineTo(16, -11);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#4c8eaa';
        ctx.fillRect(-9, -5, 18, 3);
        ctx.strokeStyle = '#6d5c44';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(0, -28);
        ctx.lineTo(0, -20);
        ctx.stroke();
        ctx.fillStyle = '#ffd166';
        ctx.fillRect(1, -28, 7, 4);
        break;
      case 'fountain': {
        const r = prop.r || 30;
        ctx.fillStyle = '#b7aa96';
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#4a9fb0';
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.76, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = 'rgba(230, 255, 252, 0.55)';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.52, 0, TAU);
        ctx.stroke();
        ctx.fillStyle = '#d9d3c4';
        ctx.beginPath();
        ctx.arc(0, 0, 4, 0, TAU);
        ctx.fill();
        break;
      }
      case 'statue':
        ctx.fillStyle = '#9c9585';
        ctx.fillRect(-11, -11, 22, 22);
        ctx.fillStyle = '#6f917a';
        ctx.beginPath();
        ctx.arc(0, -2, 5, 0, TAU);
        ctx.fill();
        ctx.fillRect(-3, 2, 6, 10);
        break;
      case 'gazebo': {
        const r = prop.r || 30;
        ctx.fillStyle = 'rgba(60, 48, 36, 0.22)';
        ctx.beginPath();
        ctx.arc(3, 5, r, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#e6d7bd';
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = '#9e7b56';
        ctx.lineWidth = 2;
        for (let i = 0; i < 8; i += 1) {
          const a = (i / 8) * TAU;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * r * 0.72, Math.sin(a) * r * 0.72);
          ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
          ctx.stroke();
        }
        ctx.fillStyle = '#7f9b74';
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.35, 0, TAU);
        ctx.fill();
        break;
      }
      case 'garageSign':
      case 'valetSign': {
        ctx.fillStyle = '#4e4840';
        ctx.fillRect(-1.5, -2, 3, 18);
        ctx.fillStyle = prop.type === 'garageSign' ? '#ffb45c' : '#ff7f9e';
        ctx.fillRect(-13, -12, 26, 10);
        ctx.fillStyle = '#1d1a20';
        ctx.font = '900 6px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(prop.type === 'garageSign' ? 'GARAGE' : 'VALET', 0, -5);
        break;
      }
      case 'lamp':
        ctx.fillStyle = '#5c5a56';
        ctx.fillRect(-1.5, -12, 3, 18);
        ctx.fillStyle = '#ffe3a6';
        ctx.beginPath();
        ctx.arc(0, -13, 3.4, 0, TAU);
        ctx.fill();
        break;
      case 'newsbox':
        ctx.fillStyle = '#3b7ea0';
        ctx.fillRect(-5, -6, 10, 12);
        ctx.fillStyle = '#d8e2e6';
        ctx.fillRect(-3.5, -4, 7, 5);
        break;
      case 'planter':
        ctx.fillStyle = '#7e6a52';
        ctx.fillRect(-9, -9, 18, 18);
        ctx.fillStyle = '#5d8258';
        ctx.beginPath();
        ctx.arc(0, 0, 7, 0, TAU);
        ctx.fill();
        break;
      case 'stall':
        ctx.fillStyle = '#8f5d3b';
        ctx.fillRect(-22, -10, 44, 20);
        ctx.fillStyle = '#d9c9a6';
        ctx.fillRect(-22, 4, 44, 6);
        ctx.fillStyle = '#c94f5b';
        for (let i = 0; i < 6; i += 1) ctx.fillRect(-22 + i * 7.3, -14, 4, 8);
        break;
      case 'crate':
        ctx.rotate(prop.angle || 0);
        ctx.fillStyle = '#9a7446';
        ctx.fillRect(-8, -8, 16, 16);
        ctx.strokeStyle = 'rgba(60, 40, 22, 0.55)';
        ctx.strokeRect(-8, -8, 16, 16);
        ctx.beginPath();
        ctx.moveTo(-8, -8);
        ctx.lineTo(8, 8);
        ctx.moveTo(8, -8);
        ctx.lineTo(-8, 8);
        ctx.stroke();
        break;
      case 'dumpster':
        ctx.rotate(prop.angle || 0);
        ctx.fillStyle = '#4b6452';
        ctx.fillRect(-12, -7, 24, 14);
        ctx.fillStyle = '#34473a';
        ctx.fillRect(-12, -7, 24, 3);
        break;
      case 'plazaRing':
        ctx.strokeStyle = 'rgba(228, 215, 188, 0.55)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, prop.r || 70, 0, TAU);
        ctx.stroke();
        break;
      default:
        ctx.fillStyle = 'rgba(72, 66, 56, 0.5)';
        ctx.beginPath();
        ctx.arc(0, 0, 4, 0, TAU);
        ctx.fill();
        break;
    }
    ctx.restore();
  }

  paintLampPost(ctx, light) {
    ctx.fillStyle = 'rgba(32, 30, 28, 0.6)';
    ctx.beginPath();
    ctx.arc(light.x + 3, light.y + 4, 3, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#57544f';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(light.x, light.y);
    ctx.lineTo(light.x, light.y - 9);
    ctx.stroke();
    ctx.fillStyle = light.color || '#ffe3a6';
    ctx.beginPath();
    ctx.arc(light.x, light.y - 10, 3.2, 0, TAU);
    ctx.fill();
  }

  paintBillboard(ctx, billboard) {
    ctx.save();
    ctx.translate(billboard.x, billboard.y);
    ctx.rotate(billboard.angle || 0);
    ctx.fillStyle = 'rgba(32, 28, 26, 0.35)';
    ctx.fillRect(-30, 8, 62, 8);
    ctx.fillStyle = '#3c3834';
    ctx.fillRect(-3, -3, 6, 18);
    ctx.fillRect(-26, -20, 4, 24);
    ctx.fillRect(22, -20, 4, 24);
    ctx.fillStyle = '#17151a';
    ctx.fillRect(-31, -18, 62, 22);
    ctx.strokeStyle = alpha(billboard.color, 0.8);
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-31, -18, 62, 22);
    ctx.fillStyle = billboard.color;
    ctx.font = '900 9px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(billboard.text, 0, -4);
    ctx.restore();
  }

  bakeRamps(ctx, game, box) {
    for (const ramp of game.city.ramps) {
      if (!this.inViewBox(box, ramp.x, ramp.y, 60)) continue;
      ctx.save();
      ctx.translate(ramp.x, ramp.y);
      ctx.rotate(ramp.angle || 0);
      // Wedge deck.
      ctx.fillStyle = 'rgba(24, 22, 24, 0.30)';
      ctx.fillRect(-ramp.w / 2 + 4, -ramp.h / 2 + 5, ramp.w, ramp.h);
      ctx.fillStyle = '#4f5962';
      ctx.beginPath();
      ctx.moveTo(-ramp.w / 2, ramp.h / 2);
      ctx.lineTo(ramp.w / 2, ramp.h / 2);
      ctx.lineTo(ramp.w / 2 - 6, -ramp.h / 2);
      ctx.lineTo(-ramp.w / 2 + 6, -ramp.h / 2);
      ctx.closePath();
      ctx.fill();
      for (let i = 0; i < 4; i += 1) {
        ctx.fillStyle = i % 2 ? '#f2c14d' : '#2c2d33';
        ctx.fillRect(-ramp.w / 2 + i * (ramp.w / 4), -ramp.h / 2 + 3, ramp.w / 8, ramp.h - 6);
      }
      ctx.strokeStyle = 'rgba(235, 240, 242, 0.48)';
      ctx.lineWidth = 1.4;
      ctx.strokeRect(-ramp.w / 2, -ramp.h / 2, ramp.w, ramp.h);
      ctx.restore();
    }
  }

  inViewBox(box, x, y, pad) {
    return x > box.x - pad && x < box.x2 + pad && y > box.y - pad && y < box.y2 + pad;
  }

  // =================================================================
  // Ocean, foam and shore
  // =================================================================
  paintOcean(game) {
    const v = this.view;
    if (v.x2 < 2680) return;
    const ctx = this.ctx;
    const time = this.waterPhase;
    const weather = game.weather || {};
    const storm = weather.type === 'storm' ? 1.7 : weather.type === 'rain' ? 1.25 : 1;
    const wet = weather.wetness || 0;

    ctx.save();
    ctx.beginPath();
    ctx.rect(2704, Math.max(0, v.y - 30), 540, Math.min(WORLD, v.y2 - v.y + 60));
    ctx.clip();

    // Layered swell bands.
    for (let band = 0; band < 4; band += 1) {
      const baseY = v.y - 40 + ((time * (8 + band * 2.2)) % 90);
      ctx.strokeStyle = `rgba(214, 250, 246, ${0.055 + band * 0.018})`;
      ctx.lineWidth = 1.2 + band * 0.35;
      for (let y = baseY; y < v.y2 + 60; y += 90) {
        const xFrom = Math.max(2730, v.x - 80);
        const xTo = Math.min(WORLD, v.x2 + 90);
        ctx.beginPath();
        for (let x = xFrom; x < xTo; x += 30) {
          const yy = y + Math.sin(x * 0.014 + time * (0.9 + band * 0.24) + band) * (5 + band * 1.7);
          if (x === xFrom) ctx.moveTo(x, yy);
          else ctx.lineTo(x, yy);
        }
        ctx.stroke();
      }
    }

    // Sun / moon glitter ribbon.
    const glint = this.light;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 36; i += 1) {
      const x = 2740 + ((i * 137 + time * 16) % 440);
      const y = v.y + ((i * 227 + time * 11) % Math.max(1, v.h + 120)) - 60;
      if (y < 0 || y > WORLD) continue;
      const a = (0.03 + glint.day * 0.12) * (0.4 + 0.6 * Math.abs(Math.sin(time * 1.7 + i)));
      ctx.fillStyle = `rgba(232, 255, 248, ${a})`;
      ctx.fillRect(x, y, 3 + (i % 3) * 2, 1.2);
    }
    ctx.globalCompositeOperation = 'source-over';

    // Marina / pier wakes.
    ctx.strokeStyle = 'rgba(196, 244, 242, 0.16)';
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 5; i += 1) {
      const y = 2040 + i * 62 + Math.sin(time * 0.8 + i) * 9;
      ctx.beginPath();
      ctx.moveTo(2730, y);
      ctx.quadraticCurveTo(2824, y + 14, 2926, y - 5);
      ctx.stroke();
    }

    // Rain rings on the water.
    if (wet > 0.15) {
      ctx.strokeStyle = `rgba(220, 250, 250, ${wet * 0.18})`;
      ctx.lineWidth = 1;
      for (let i = 0; i < 26; i += 1) {
        const x = 2740 + hash01(i, 7) * 430;
        const y = v.y + ((hash01(i, 3) * v.h + time * (18 + (i % 5) * 4)) % Math.max(1, v.h + 40)) - 20;
        const ring = 2 + ((time * 8 + i) % 7);
        ctx.beginPath();
        ctx.arc(x, y, ring, 0, TAU);
        ctx.stroke();
      }
    }

    // Foam edge, two broken crests.
    const shoreX = 2710 + Math.sin(time * 1.25) * 2.2;
    ctx.strokeStyle = 'rgba(245, 255, 251, 0.82)';
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    const start = Math.max(0, Math.floor(v.y / 14) * 14);
    for (let y = start; y <= Math.min(WORLD, v.y2 + 14); y += 14) {
      const wx = shoreX + Math.sin(y * 0.031 + time * 1.9) * 4 + Math.sin(y * 0.097 + time * 2.7) * 1.4;
      if (y === start) ctx.moveTo(wx, y);
      else ctx.lineTo(wx, y);
    }
    ctx.stroke();

    ctx.strokeStyle = 'rgba(198, 246, 244, 0.42)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let y = start; y <= Math.min(WORLD, v.y2 + 14); y += 18) {
      const wx = shoreX + 15 + Math.sin(y * 0.023 + time * 1.35 + 1) * 7;
      if (y === start) ctx.moveTo(wx, y);
      else ctx.lineTo(wx, y);
    }
    ctx.stroke();

    // Curling foam fringes that slide up the sand.
    for (let i = 0; i < 26; i += 1) {
      const cy = v.y + ((i * 151 + time * 15) % Math.max(1, v.h + 80)) - 40;
      if (cy < 0 || cy > WORLD) continue;
      const inset = 4 + ((i * 7 + time * 9) % 16);
      const length = 12 + (i % 5) * 6;
      ctx.fillStyle = `rgba(242, 255, 252, ${0.16 + (i % 3) * 0.07})`;
      ctx.beginPath();
      ctx.ellipse(shoreX - inset, cy, 3.4, length, 0.1, 0, TAU);
      ctx.fill();
    }

    // Foam specks from the city generator, brighter when the tide is high.
    ctx.fillStyle = 'rgba(238, 255, 252, 0.55)';
    for (const dot of game.city.foamDots) {
      if (dot.y < v.y - 10 || dot.y > v.y2 + 10) continue;
      ctx.globalAlpha = dot.a * (0.55 + 0.45 * Math.sin(time * 1.8 + dot.y * 0.02));
      ctx.beginPath();
      ctx.arc(dot.x + Math.sin(time + dot.y * 0.02) * 2, dot.y, dot.r * storm, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // Wet sand sheen at the water's edge.
    const sheen = ctx.createLinearGradient(2676, 0, 2732, 0);
    sheen.addColorStop(0, 'rgba(111, 90, 58, 0)');
    sheen.addColorStop(0.62, `rgba(111, 90, 58, ${0.10 + wet * 0.16})`);
    sheen.addColorStop(1, 'rgba(111, 90, 58, 0)');
    ctx.fillStyle = sheen;
    ctx.fillRect(2676, Math.max(0, v.y - 20), 56, Math.min(WORLD, v.y2 - v.y + 40));
  }

  // =================================================================
  // Shadows and street detail
  // =================================================================
  paintBuildingShadows(game) {
    const ctx = this.ctx;
    const light = this.light;
    if (light.day < 0.06) return;
    const length = 18 + light.shadowLength * 34;
    const dx = Math.cos(light.shadowDir) * length;
    const dy = Math.sin(light.shadowDir) * length;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, 2712, WORLD);
    ctx.clip();
    ctx.fillStyle = `rgba(18, 22, 28, ${0.10 + light.day * 0.11})`;
    for (const b of game.city.buildings) {
      if (!this.inView(b.x, b.y, 100)) continue;
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.transform(1, 0, 0, 1, 0, 0);
      pathRound(ctx, -b.w / 2 + dx, -b.h / 2 + dy, b.w, b.h, 3);
      ctx.fill();
      ctx.restore();
    }
    for (const p of game.city.palmTrees) {
      if (!this.inView(p.x, p.y, 60)) continue;
      ctx.strokeStyle = `rgba(22, 28, 24, ${0.08 + light.day * 0.09})`;
      ctx.lineWidth = Math.max(2, p.size * 0.18);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + dx * 0.75, p.y + dy * 0.75);
      ctx.stroke();
    }
    ctx.restore();
  }

  paintStreetWear(game) {
    const ctx = this.ctx;
    const city = game.city;
    // Tyre rubber.
    for (const mark of city.skidMarks) {
      if (!this.inView(mark.x, mark.y, 16)) continue;
      const fade = clamp(1 - mark.age / 24, 0, 1) * mark.alpha;
      ctx.save();
      ctx.translate(mark.x, mark.y);
      ctx.rotate(mark.angle);
      ctx.fillStyle = `rgba(20, 19, 22, ${0.32 * fade})`;
      ctx.fillRect(-7, -1.5, 14, 3);
      ctx.restore();
    }

    // Puddles and their damp rings.
    const wet = game.weather?.wetness || 0;
    for (const puddle of city.puddles) {
      if (!this.inView(puddle.x, puddle.y, 70)) continue;
      const growth = 0.7 + wet * 0.55;
      ctx.save();
      ctx.translate(puddle.x, puddle.y);
      ctx.rotate(puddle.angle);
      ctx.fillStyle = `rgba(22, 39, 52, ${puddle.alpha * (0.5 + wet * 0.9)})`;
      ctx.beginPath();
      ctx.ellipse(0, 0, puddle.rx * growth, puddle.ry * growth, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = `rgba(200, 236, 240, ${puddle.alpha * wet * 0.9})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(-1, -1, puddle.rx * growth * 0.74, puddle.ry * growth * 0.68, 0, 0.2, Math.PI * 1.5);
      ctx.stroke();
      ctx.restore();
    }

    // Scuffs and shell casings.
    for (const scuff of game.particles.scuffs) {
      if (!this.inView(scuff.x, scuff.y, 12)) continue;
      ctx.fillStyle = `rgba(206, 195, 174, ${scuff.life * 0.24})`;
      ctx.fillRect(scuff.x - 2, scuff.y - 1, 4, 2);
    }

    // Traffic light housings at the intersections.
    for (const light of city.trafficLights) {
      if (!this.inView(light.x, light.y, 45)) continue;
      ctx.fillStyle = '#3f4146';
      ctx.fillRect(light.x - 2, light.y - 2, 4, 26);
      ctx.fillStyle = '#27282c';
      pathRound(ctx, light.x - 5, light.y + 22, 10, 15, 3);
      ctx.fill();
    }
  }

  // A world-space ambient wash sits *under* the lights, so streetlamps,
  // headlights and neon actually cut through the dark instead of being
  // greyed out by a final screen tint.
  paintAmbientWash(game) {
    const light = this.light;
    const v = this.view;
    const ctx = this.ctx;
    if (light.dark > 0.02) {
      // Multiply towards cold blue rather than painting black over the city:
      // the baked colour survives and the result reads as night, not fog.
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      const r = Math.round(mix(255, 86, light.dark));
      const g = Math.round(mix(255, 98, light.dark));
      const b = Math.round(mix(255, 142, light.dark));
      ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
      ctx.fillRect(v.x - 4, v.y - 4, v.w + 8, v.h + 8);
      ctx.restore();
    }
    if (light.golden > 0.2) {
      const g = ctx.createLinearGradient(v.x, v.y2, v.x2, v.y);
      g.addColorStop(0, `rgba(255, 126, 82, ${0.24 * light.golden})`);
      g.addColorStop(0.55, `rgba(205, 92, 128, ${0.12 * light.golden})`);
      g.addColorStop(1, `rgba(60, 48, 96, 0)`);
      ctx.fillStyle = g;
      ctx.fillRect(v.x - 4, v.y - 4, v.w + 8, v.h + 8);
    }
    // A faint sea mist cools the water side.
    if (v.x2 > 2660 && game.weather?.wetness < 0.8) {
      const mist = ctx.createLinearGradient(2660, 0, 2920, 0);
      mist.addColorStop(0, 'rgba(170, 220, 220, 0)');
      mist.addColorStop(0.5, `rgba(170, 220, 220, ${0.05 + light.dark * 0.05})`);
      mist.addColorStop(1, 'rgba(170, 220, 220, 0)');
      ctx.fillStyle = mist;
      ctx.fillRect(2660, v.y, 270, v.h);
    }
  }

  // Actor-colour lighting: keep saturation but sink values into the night so
  // people and cars belong to the same exposure as the baked city.
  litColor(hex, strength = 0.62) {
    const dark = this.light?.dark || 0;
    if (dark < 0.05) return hex;
    const c = rgb(hex);
    const target = [19, 27, 45];
    const r = Math.round(mix(c[0], target[0], dark * strength));
    const g = Math.round(mix(c[1], target[1], dark * strength));
    const b = Math.round(mix(c[2], target[2], dark * strength));
    return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
  }

  paintMirrors(game) {    const wet = clamp(game.weather?.wetness || 0, 0, 1);
    if (wet < 0.06) return;
    const ctx = this.ctx;
    const light = this.light;
    const time = game.worldTime || 0;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    // Long vertical streaks from street lamps.
    for (const lamp of game.city.streetlights) {
      if (!this.inView(lamp.x, lamp.y, lamp.radius + 90)) continue;
      const h = 38 + lamp.radius * 0.45;
      const g = ctx.createLinearGradient(lamp.x, lamp.y, lamp.x, lamp.y + h);
      g.addColorStop(0, `rgba(255, 226, 168, ${0.23 * wet})`);
      g.addColorStop(0.55, `rgba(255, 214, 140, ${0.10 * wet})`);
      g.addColorStop(1, 'rgba(255, 196, 110, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(lamp.x, lamp.y + h * 0.5, 4 + h * 0.08, h * 0.5, 0, 0, TAU);
      ctx.fill();
    }

    // Neon smears on the wet pavement.
    for (const b of game.city.buildings) {
      if (!b.neonText || !this.inView(b.x, b.y, 100)) continue;
      const baseY = b.y + b.h * 0.46;
      const g = ctx.createLinearGradient(b.x, baseY, b.x, baseY + 56);
      g.addColorStop(0, alpha(b.neonColor || '#ff7fa5', 0.20 * wet));
      g.addColorStop(0.6, alpha(b.neonColor || '#ff7fa5', 0.09 * wet));
      g.addColorStop(1, alpha(b.neonColor || '#ff7fa5', 0));
      ctx.fillStyle = g;
      ctx.fillRect(b.x - 17, baseY, 34, 56);
    }

    // Police siren colour spilling down the asphalt.
    for (const cop of game.police?.cops || []) {
      if (!cop.sirenActive || !this.inView(cop.x, cop.y, 120)) continue;
      const hue = cop.sirenPhase ? '255, 78, 96' : '92, 166, 255';
      const g = ctx.createRadialGradient(cop.x, cop.y + 24, 2, cop.x, cop.y + 38, 64);
      g.addColorStop(0, `rgba(${hue}, ${0.19 * wet})`);
      g.addColorStop(1, `rgba(${hue}, 0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(cop.x, cop.y + 26, 46, 20, cop.angle, 0, TAU);
      ctx.fill();
    }

    // Neon signs spill a wide colour pool onto the wet asphalt.
    for (const billboard of game.city.billboards) {
      if (!this.inView(billboard.x, billboard.y, 120)) continue;
      const g = ctx.createRadialGradient(billboard.x, billboard.y + 18, 2, billboard.x, billboard.y + 24, 76);
      g.addColorStop(0, alpha(billboard.color, 0.16 * wet));
      g.addColorStop(0.55, alpha(billboard.color, 0.055 * wet));
      g.addColorStop(1, alpha(billboard.color, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(billboard.x, billboard.y + 24, 76, 34, 0, 0, TAU);
      ctx.fill();
    }

    // Moving lights streak along the wet tarmac.
    for (const v of this.visibleVehicles(game)) {
      if (v.isDestroyed || v.aiMode === 'parked') continue;
      if (!(v.driver || v === game.player.vehicle || Math.hypot(v.vx || 0, v.vy || 0) > 30)) continue;
      const fx = Math.cos(v.angle);
      const fy = Math.sin(v.angle);
      const rx = -fy;
      const ry = fx;
      const tailX = v.x - fx * v.length * 0.5;
      const tailY = v.y - fy * v.length * 0.5;
      const noseX = v.x + fx * v.length * 0.5;
      const noseY = v.y + fy * v.length * 0.5;
      ctx.save();
      ctx.globalAlpha = wet;
      for (const side of [-1, 1]) {
        const tx = tailX + rx * v.width * 0.3 * side;
        const ty = tailY + ry * v.width * 0.3 * side;
        const g = ctx.createLinearGradient(tx, ty, tx - fx * 58, ty - fy * 58);
        g.addColorStop(0, 'rgba(255, 70, 80, 0.24)');
        g.addColorStop(1, 'rgba(255, 40, 70, 0)');
        ctx.strokeStyle = g;
        ctx.lineWidth = 3.2;
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(tx - fx * 58 + rx * (Math.sin(time * 4 + side) * 3), ty - fy * 58);
        ctx.stroke();
      }
      const hx = noseX;
      const hy = noseY;
      const hg = ctx.createLinearGradient(hx, hy, hx + fx * 46, hy + fy * 46);
      hg.addColorStop(0, 'rgba(255, 236, 186, 0.20)');
      hg.addColorStop(1, 'rgba(255, 220, 160, 0)');
      ctx.strokeStyle = hg;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(hx, hy);
      ctx.lineTo(hx + fx * 46, hy + fy * 46);
      ctx.stroke();
      ctx.restore();
    }

    // Puddles carry a wobbling mirror of the sky.
    for (const puddle of game.city.puddles) {
      if (!this.inView(puddle.x, puddle.y, 70)) continue;
      ctx.fillStyle = css(light.sky, 0.08 + wet * 0.07);
      ctx.beginPath();
      ctx.ellipse(puddle.x, puddle.y, puddle.rx * 0.92, puddle.ry * 0.8, puddle.angle, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = `rgba(232, 252, 255, ${0.10 * wet})`;
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.ellipse(
        puddle.x + Math.sin(time * 1.1 + puddle.seed) * 3,
        puddle.y,
        puddle.rx * 0.55,
        puddle.ry * 0.45,
        puddle.angle,
        0,
        TAU,
      );
      ctx.stroke();
    }
    ctx.restore();
  }

  paintLightPools(game) {
    const dark = this.light.dark;
    if (dark < 0.05) return;
    const ctx = this.ctx;
    const wet = game.weather?.wetness || 0;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const light of game.city.streetlights) {
      if (!this.inView(light.x, light.y, light.radius + 20)) continue;
      const r = light.radius * (0.72 + wet * 0.16);
      const g = ctx.createRadialGradient(light.x, light.y, 1, light.x, light.y, r);
      g.addColorStop(0, `rgba(255, 232, 184, ${0.30 * dark})`);
      g.addColorStop(0.26, `rgba(255, 219, 158, ${0.16 * dark})`);
      g.addColorStop(0.6, `rgba(255, 202, 136, ${0.055 * dark})`);
      g.addColorStop(1, 'rgba(255, 186, 112, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(light.x, light.y, r, 0, TAU);
      ctx.fill();
      // Lamp core.
      ctx.fillStyle = `rgba(255, 250, 224, ${0.85 * dark})`;
      ctx.beginPath();
      ctx.arc(light.x, light.y - 10, 3.8, 0, TAU);
      ctx.fill();
    }
    // Warm spill from windows and diner signage.
    for (const b of game.city.buildings) {
      if (!b.neonText || !this.inView(b.x, b.y, 80)) continue;
      const g = ctx.createRadialGradient(b.x, b.y, 2, b.x, b.y, 54);
      g.addColorStop(0, alpha(b.neonColor || '#ff7fa5', 0.10 * dark));
      g.addColorStop(0.55, alpha(b.neonColor || '#ff7fa5', 0.035 * dark));
      g.addColorStop(1, alpha(b.neonColor || '#ff7fa5', 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(b.x, b.y, 54, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  paintSirenHalos(game) {
    const cops = [...(game.police?.cops || []), ...(game.police?.roadblocks || [])];
    if (!cops.length) return;
    const ctx = this.ctx;
    const time = game.worldTime || 0;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const cop of cops) {
      if (!cop.sirenActive || cop.isDestroyed || !this.inView(cop.x, cop.y, 110)) continue;
      const fx = Math.cos(cop.angle);
      const fy = Math.sin(cop.angle);
      const rx = -fy;
      const ry = fx;
      const lampX = cop.x - fx * cop.length * 0.04;
      const lampY = cop.y - fy * cop.length * 0.04;
      const pulse = 0.55 + 0.45 * Math.sin(time * 9 + (cop.sirenPhase ? 0 : Math.PI));
      for (const [side, rgb] of [[-cop.width * 0.26, cop.sirenPhase ? '255, 72, 92' : '255, 42, 70'], [cop.width * 0.26, cop.sirenPhase ? '68, 130, 255' : '130, 176, 255']]) {
        const gx = lampX + rx * side;
        const gy = lampY + ry * side;
        const radius = 21 + pulse * 7;
        const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, radius);
        g.addColorStop(0, `rgba(${rgb}, ${0.48 * pulse + 0.16})`);
        g.addColorStop(0.24, `rgba(${rgb}, ${0.25 * pulse})`);
        g.addColorStop(0.62, `rgba(${rgb}, ${0.055 * pulse})`);
        g.addColorStop(1, `rgba(${rgb}, 0)`);
        ctx.fillStyle = g;
        ctx.fillRect(gx - radius, gy - radius, radius * 2, radius * 2);
      }
    }
    ctx.restore();
  }

  paintSearchSweep(game) {
    const police = game.police;
    if (!police || police.wantedStars <= 0) return;
    const ctx = this.ctx;
    const time = game.worldTime || 0;
    const units = [
      ...(police.cops || []).map((cop) => ({ x: cop.x, y: cop.y, angle: cop.angle, radius: 220, wide: 0.5 })),
      ...(police.footCops || []).filter((cop) => !cop.isDead).map((cop) => ({ x: cop.x, y: cop.y, angle: cop.angle, radius: 150, wide: 0.62 })),
    ];
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const unit of units) {
      if (!this.inView(unit.x, unit.y, unit.radius + 40)) continue;
      const sway = Math.sin(time * 1.9 + unit.x * 0.01) * 0.08;
      const reach = unit.radius * (0.82 + 0.06 * Math.sin(time * 3 + unit.y));
      ctx.save();
      ctx.translate(unit.x, unit.y);
      ctx.rotate(unit.angle + sway);
      const beam = ctx.createRadialGradient(0, 0, 8, 0, 0, reach);
      beam.addColorStop(0, 'rgba(142, 200, 255, 0.045)');
      beam.addColorStop(0.4, 'rgba(126, 184, 255, 0.025)');
      beam.addColorStop(0.8, 'rgba(108, 168, 255, 0.006)');
      beam.addColorStop(1, 'rgba(96, 156, 255, 0)');
      ctx.fillStyle = beam;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, reach, -unit.wide * 0.78, unit.wide * 0.78);
      ctx.closePath();
      ctx.fill();
      // Searchlight dust cone.
      ctx.strokeStyle = 'rgba(156, 208, 255, 0.08)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(reach, -reach * unit.wide * 0.75);
      ctx.moveTo(0, 0);
      ctx.lineTo(reach, reach * unit.wide * 0.75);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  paintHeadlightWashes(game) {
    const dark = this.light.dark;
    const wet = game.weather?.wetness || 0;
    if (dark < 0.12 && wet < 0.25) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const v of this.visibleVehicles(game)) {
      if (!v.headlightsOn || v.isDestroyed) continue;
      if (v.aiMode === 'parked' || !(v.driver || v === game.player.vehicle || Math.hypot(v.vx || 0, v.vy || 0) > 22)) continue;
      const fx = Math.cos(v.angle);
      const fy = Math.sin(v.angle);
      const noseX = v.x + fx * v.length * 0.48;
      const noseY = v.y + fy * v.length * 0.48;
      const reach = 150 + wet * 55;
      ctx.save();
      ctx.translate(noseX, noseY);
      ctx.rotate(v.angle);
      const g = ctx.createLinearGradient(0, 0, reach, 0);
      g.addColorStop(0, `rgba(255, 242, 210, ${(0.10 + wet * 0.05) * dark + wet * 0.025})`);
      g.addColorStop(0.22, `rgba(255, 235, 194, ${(0.06 + wet * 0.035) * dark})`);
      g.addColorStop(0.62, `rgba(255, 225, 176, ${0.02 * dark})`);
      g.addColorStop(1, 'rgba(255, 216, 160, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, -v.width * 0.26);
      ctx.lineTo(reach, -v.width * 0.52);
      ctx.lineTo(reach, v.width * 0.52);
      ctx.lineTo(0, v.width * 0.26);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  paintBuildingHalos(game) {
    const dark = this.light.dark;
    if (dark < 0.08) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const b of game.city.buildings) {
      if (!b.neonText || !this.inView(b.x, b.y, 70)) continue;
      const x = b.x;
      const y = b.y - b.h / 2 + b.h - 14;
      const g = ctx.createRadialGradient(x, y, 1, x, y, 28);
      g.addColorStop(0, alpha(b.neonColor, 0.44 * dark));
      g.addColorStop(0.42, alpha(b.neonColor, 0.16 * dark));
      g.addColorStop(0.8, alpha(b.neonColor, 0.03 * dark));
      g.addColorStop(1, alpha(b.neonColor, 0));
      ctx.fillStyle = g;
      ctx.fillRect(x - 30, y - 30, 60, 60);
      const width = Math.min(b.w - 8, Math.max(34, b.neonText.length * 5.2));
      ctx.fillStyle = alpha(b.neonColor, 0.46 * dark);
      ctx.fillRect(x - width / 2, y + 1, width, 2.4);
    }
    for (const bb of game.city.billboards) {
      if (!this.inView(bb.x, bb.y, 100)) continue;
      const g = ctx.createRadialGradient(bb.x, bb.y - 7, 2, bb.x, bb.y - 7, 48);
      g.addColorStop(0, alpha(bb.color, 0.26 * dark));
      g.addColorStop(0.52, alpha(bb.color, 0.08 * dark));
      g.addColorStop(1, alpha(bb.color, 0));
      ctx.fillStyle = g;
      ctx.fillRect(bb.x - 48, bb.y - 55, 96, 96);
    }
    ctx.restore();
  }

  // Sign faces are re-inked after the ambient pass so their colour survives
  // the night grade. This is the difference between a grey city and a neon one.
  paintNeonSigns(game) {
    const ctx = this.ctx;
    const dark = this.light.dark;
    if (dark < 0.10) return;
    ctx.save();
    for (const b of game.city.buildings) {
      if (!b.neonText || !this.inView(b.x, b.y, 90)) continue;
      const color = b.neonColor || '#ff7fa5';
      ctx.font = '800 8px "Segoe UI", Arial, sans-serif';
      const w = Math.min(b.w - 8, Math.max(34, ctx.measureText(b.neonText).width + 14));
      const y = b.y - b.h / 2 + b.h - 17;
      ctx.fillStyle = 'rgba(10, 9, 14, 0.82)';
      pathRound(ctx, b.x - w / 2, y, w, 12, 2);
      ctx.fill();
      ctx.strokeStyle = alpha(color, 0.7 + dark * 0.25);
      ctx.lineWidth = 0.9;
      ctx.stroke();
      ctx.textAlign = 'center';
      ctx.fillStyle = alpha(color, 0.85 + dark * 0.15);
      ctx.shadowColor = color;
      ctx.shadowBlur = 6 * dark;
      ctx.fillText(b.neonText, b.x, y + 8.8);
      ctx.shadowBlur = 0;
    }
    for (const billboard of game.city.billboards) {
      if (!this.inView(billboard.x, billboard.y, 100)) continue;
      ctx.save();
      ctx.translate(billboard.x, billboard.y);
      ctx.rotate(billboard.angle || 0);
      ctx.fillStyle = 'rgba(12, 10, 16, 0.86)';
      ctx.fillRect(-31, -18, 62, 22);
      ctx.strokeStyle = alpha(billboard.color, 0.9);
      ctx.lineWidth = 1.4;
      ctx.strokeRect(-31, -18, 62, 22);
      ctx.fillStyle = billboard.color;
      ctx.font = '900 9px "Segoe UI", Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.shadowColor = billboard.color;
      ctx.shadowBlur = 8 * dark;
      ctx.fillText(billboard.text, 0, -4);
      ctx.shadowBlur = 0;
      ctx.restore();
    }
    ctx.restore();
  }

  paintCityLife(game) {
    const dark = this.light.dark;
    if (dark < 0.12) return;
    const ctx = this.ctx;
    const time = game.worldTime || 0;
    ctx.save();
    // Lit windows and tower rim lights.
    for (const b of game.city.buildings) {
      if (!this.inView(b.x, b.y, 100)) continue;
      const left = b.x - b.w / 2;
      const top = b.y - b.h / 2;
      const district = districtAt(b.x, b.y);
      const rows = Math.min(4, b.windowRows || 2);
      const cols = Math.min(6, b.windowCols || 3);
      for (let r = 0; r < rows; r += 1) {
        for (let i = 0; i < cols; i += 1) {
          const on = game.city.hash(b.x + i * 13, b.y + r * 29, 4) > 0.45;
          if (!on) continue;
          const flicker = 0.7 + 0.3 * Math.sin(time * 0.4 + i * 2.1 + r);
          ctx.fillStyle = `rgba(255, 214, 146, ${0.28 * dark * flicker})`;
          ctx.fillRect(left + 8 + i * ((b.w - 16) / cols), top + b.h - 5, 4.2, 2.2);
          ctx.fillStyle = `rgba(255, 220, 160, ${0.16 * dark * flicker})`;
          ctx.fillRect(left + b.w - 5, top + 9 + r * ((b.h - 18) / rows), 2.2, 4.2);
        }
      }
      if (b.height > 38) {
        const rim = district?.neon || '#6fe0e6';
        ctx.strokeStyle = alpha(rim, 0.24 * dark);
        ctx.lineWidth = 1.5;
        ctx.strokeRect(left + 2, top + 2, b.w - 4, b.h - 4);
        ctx.strokeStyle = alpha('#ff8fb1', 0.10 * dark);
        ctx.lineWidth = 1;
        ctx.strokeRect(left + 5, top + 5, b.w - 10, b.h - 10);
        ctx.fillStyle = alpha(rim, 0.5 * dark);
        for (const [cx, cy] of [[left + 4, top + 4], [left + b.w - 4, top + 4], [left + 4, top + b.h - 4], [left + b.w - 4, top + b.h - 4]]) {
          ctx.fillRect(cx - 1.5, cy - 1.5, 3, 3);
        }
      }
      if (b.height > 70 && (Math.sin(time * 1.6 + b.x * 0.02) > 0.35)) {
        const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, 7);
        g.addColorStop(0, `rgba(255, 70, 70, ${0.7 * dark})`);
        g.addColorStop(1, 'rgba(255, 60, 60, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(b.x - 7, b.y - 7, 14, 14);
      }
    }
    // A few neon strips on beach-facing shopfronts.
    for (const b of game.city.buildings) {
      if (!b.awning || !this.inView(b.x, b.y, 80)) continue;
      const color = b.awningColor || '#c45a5a';
      ctx.fillStyle = alpha(color, 0.10 * dark);
      ctx.fillRect(b.x - Math.min(b.w * 0.36, 44), b.y + b.h / 2 + 2, Math.min(b.w * 0.72, 88), 4);
    }
    ctx.restore();
  }

  paintTrafficSignals(game) {
    const ctx = this.ctx;
    const time = game.worldTime || 0;
    const dark = this.light.dark;
    for (const light of game.city.trafficLights) {
      if (!this.inView(light.x, light.y, 50)) continue;
      const red = light.state === 'red';
      const lampY = light.y + 24;
      const color = red ? '255, 86, 96' : '104, 238, 158';
      const pulse = 0.6 + 0.4 * Math.sin(time * (red ? 4.4 : 2.2) + light.timer);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const halo = ctx.createRadialGradient(light.x, lampY, 0, light.x, lampY, 17 + pulse * 5);
      halo.addColorStop(0, `rgba(${color}, ${(0.42 + dark * 0.36) * pulse})`);
      halo.addColorStop(0.45, `rgba(${color}, ${0.12 * pulse})`);
      halo.addColorStop(1, `rgba(${color}, 0)`);
      ctx.fillStyle = halo;
      ctx.fillRect(light.x - 24, lampY - 24, 48, 48);
      ctx.restore();

      ctx.fillStyle = `rgba(${color}, 0.94)`;
      ctx.beginPath();
      ctx.arc(light.x, lampY, 2.7, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(236, 236, 230, 0.45)';
      ctx.beginPath();
      ctx.arc(light.x, lampY + 5, 2.1, 0, TAU);
      ctx.fill();
    }
  }

  paintPalms(game) {
    const ctx = this.ctx;
    const time = game.worldTime || 0;
    const wind = 0.35 + (game.weather?.wind || 0.3) * 1.25;
    if (!this._palmBlocked || this._palmCity !== game.city) {
      this._palmCity = game.city;
      this._palmBlocked = new Set();
      for (const palm of game.city.palmTrees) {
        if (game.city.buildingAt(palm.x, palm.y, 3)) this._palmBlocked.add(palm);
      }
    }
    for (const palm of game.city.palmTrees) {
      if (this._palmBlocked.has(palm)) continue;
      if (!this.inView(palm.x, palm.y, palm.size * 2.2 + 34)) continue;
      const phase = hash01(palm.x, palm.y) * TAU;
      const sway = Math.sin(time * 1.15 + phase) * (1.6 + wind * 2.6) + Math.sin(time * 0.37 + phase * 2) * 0.8;
      const topX = palm.x + sway;
      const topY = palm.y - palm.size;
      ctx.save();
      ctx.strokeStyle = this.litColor('#6f5238', 0.72);
      ctx.lineWidth = Math.max(2, palm.size * 0.12);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(palm.x, palm.y);
      ctx.quadraticCurveTo(palm.x + sway * 0.3, palm.y - palm.size * 0.55, topX, topY);
      ctx.stroke();
      // Fronds: two layers, each rotated around the crown.
      const fronds = 7;
      for (let layer = 0; layer < 2; layer += 1) {
        for (let i = 0; i < fronds; i += 1) {
          const a = (i / fronds) * TAU + layer * 0.22 + Math.sin(time * 1.3 + phase + i) * 0.05;
          const len = palm.size * (layer === 0 ? 1.0 : 0.72) * (0.9 + hash01(i, layer) * 0.24);
          const tipX = topX + Math.cos(a) * len;
          const tipY = topY + Math.sin(a) * len * 0.62 + 3;
          ctx.strokeStyle = layer === 0 ? this.litColor('#3a673a', 0.55) : this.litColor('#58884c', 0.52);
          ctx.lineWidth = layer === 0 ? 2.4 : 1.7;
          ctx.beginPath();
          ctx.moveTo(topX, topY);
          ctx.quadraticCurveTo(
            topX + Math.cos(a) * len * 0.55 + sway * 0.2,
            topY + Math.sin(a) * len * 0.3 - 4,
            tipX,
            tipY,
          );
          ctx.stroke();
        }
      }
      ctx.fillStyle = '#8b6b3f';
      ctx.beginPath();
      ctx.arc(topX, topY, 2.1, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }

  // =================================================================
  // Actor shadows and depth pass
  // =================================================================
  paintContactShadows(game) {
    const ctx = this.ctx;
    const light = this.light;
    const length = 6 + light.shadowLength * 16;
    const dx = Math.cos(light.shadowDir) * length;
    const dy = Math.sin(light.shadowDir) * length;
    const alphaValue = 0.09 + light.day * 0.18;
    ctx.save();
    ctx.fillStyle = `rgba(14, 16, 20, ${alphaValue})`;

    for (const v of this.visibleVehicles(game)) {
      const lift = v.airborne ? v.airHeight || 0 : 0;
      ctx.save();
      ctx.translate(v.x + dx * 0.35, v.y + dy * 0.35 + lift * 0.25);
      ctx.rotate(v.angle);
      ctx.beginPath();
      ctx.ellipse(0, 0, v.length * 0.4, v.width * 0.34, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    const people = this.visiblePeople(game);
    for (const person of people) {
      if (person.isDead) continue;
      const size = person.isPlayer ? 15 : person.isBoss ? 16 : 13;
      ctx.save();
      ctx.translate(person.x + dx * 0.25, person.y + dy * 0.25);
      ctx.rotate(person.angle);
      ctx.beginPath();
      ctx.ellipse(0, 2, size * 1.05, size * 0.62, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  visibleVehicles(game) {
    if (this._vehicleCacheFrame === this.frameIndex) return this._vehicleCache;
    const out = [];
    for (const list of [game.traffic?.vehicles, game.traffic?.parked, game.police?.cops, game.police?.roadblocks]) {
      if (!list) continue;
      for (const v of list) if (this.inView(v.x, v.y, 110)) out.push(v);
    }
    this._vehicleCache = out;
    this._vehicleCacheFrame = this.frameIndex;
    return out;
  }

  visiblePeople(game) {
    const out = [];
    if (game.player) out.push(game.player);
    for (const p of game.combat?.pedestrians || []) if (this.inView(p.x, p.y, 60)) out.push(p);
    for (const e of game.combat?.enemies || []) if (this.inView(e.x, e.y, 60)) out.push(e);
    for (const f of game.police?.footCops || []) if (this.inView(f.x, f.y, 60)) out.push(f);
    if (game.player?.isInVehicle) out.shift();
    return out;
  }

  paintActors(game) {
    const ctx = this.ctx;
    const actors = [];
    for (const v of this.visibleVehicles(game)) actors.push({ kind: 'vehicle', y: v.y + v.length * 0.3, ref: v });
    for (const p of this.visiblePeople(game)) actors.push({ kind: 'person', y: p.y + 6, ref: p });
    actors.sort((a, b) => a.y - b.y);

    // Dead bodies first, flat on the ground.
    for (const p of game.combat?.pedestrians || []) {
      if (p.isDead && this.inView(p.x, p.y, 30)) this.paintBody(ctx, p, p.shirt || '#8a5b67', p.pants || '#3b4a63');
    }
    for (const e of game.combat?.enemies || []) {
      if (e.isDead && this.inView(e.x, e.y, 30)) this.paintBody(ctx, e, e.color || '#8a4438', '#2e2f35');
    }
    for (const f of game.police?.footCops || []) {
      if (f.isDead && this.inView(f.x, f.y, 30)) this.paintBody(ctx, f, '#334a63', '#1e2732');
    }

    for (const actor of actors) {
      if (actor.kind === 'vehicle') this.paintVehicle(ctx, game, actor.ref);
      else this.paintPerson(ctx, actor.ref);
    }
  }

  paintVehicle(ctx, game, v) {
    const L = v.length;
    const W = v.width;
    const art = v.config.art || {};
    const body = art.body || 'sedan';
    const damage = v.damageStage || 0;
    const lift = v.airborne ? -(v.airHeight || 0) * 0.65 : 0;
    const time = game.worldTime || 0;

    ctx.save();
    ctx.translate(v.x, v.y + lift);
    ctx.rotate(v.angle);

    // Tyres peek out under the body.
    if (body !== 'bike') {
      ctx.fillStyle = 'rgba(16, 16, 20, 0.9)';
      const wheelX = L * 0.31;
      const wheelY = W * 0.42;
      for (const wx of [-wheelX, wheelX]) {
        for (const wy of [-wheelY, wheelY]) {
          pathRound(ctx, wx - 4, wy - 2.6, 8, 5.2, 2);
          ctx.fill();
        }
      }
    }

    // Lower chassis.
    ctx.fillStyle = 'rgba(18, 18, 22, 0.72)';
    pathRound(ctx, -L * 0.48, -W * 0.42, L * 0.96, W * 0.84, Math.min(6, W * 0.22));
    ctx.fill();

    // Body silhouette.
    const bodyColor = this.litColor(v.color || '#8f97a2', 0.34);
    const g = ctx.createLinearGradient(0, -W / 2, 0, W / 2);
    g.addColorStop(0, shade(bodyColor, 0.22));
    g.addColorStop(0.35, bodyColor);
    g.addColorStop(1, shade(bodyColor, -0.28));
    ctx.fillStyle = g;

    if (body === 'bike') {
      ctx.fillStyle = '#1a1a1e';
      ctx.fillRect(-L * 0.46, -W * 0.18, L * 0.2, W * 0.36);
      ctx.fillRect(L * 0.28, -W * 0.18, L * 0.2, W * 0.36);
      ctx.fillStyle = bodyColor;
      ctx.beginPath();
      ctx.ellipse(0, 0, L * 0.33, W * 0.34, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#2a2c31';
      ctx.fillRect(-L * 0.06, -W * 0.2, L * 0.28, W * 0.4);
    } else if (body === 'sports') {
      ctx.beginPath();
      ctx.moveTo(L * 0.52, -W * 0.22);
      ctx.quadraticCurveTo(L * 0.34, -W * 0.5, L * 0.02, -W * 0.48);
      ctx.lineTo(-L * 0.36, -W * 0.44);
      ctx.quadraticCurveTo(-L * 0.52, -W * 0.3, -L * 0.5, 0);
      ctx.quadraticCurveTo(-L * 0.52, W * 0.3, -L * 0.36, W * 0.44);
      ctx.lineTo(L * 0.02, W * 0.48);
      ctx.quadraticCurveTo(L * 0.34, W * 0.5, L * 0.52, W * 0.22);
      ctx.closePath();
      ctx.fill();
      // Cabin.
      ctx.fillStyle = 'rgba(24, 36, 44, 0.88)';
      ctx.beginPath();
      ctx.moveTo(L * 0.17, -W * 0.34);
      ctx.lineTo(-L * 0.15, -W * 0.38);
      ctx.lineTo(-L * 0.24, -W * 0.19);
      ctx.lineTo(-L * 0.22, W * 0.19);
      ctx.lineTo(-L * 0.15, W * 0.38);
      ctx.lineTo(L * 0.17, W * 0.34);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(150, 214, 226, 0.28)';
      ctx.beginPath();
      ctx.moveTo(L * 0.14, -W * 0.3);
      ctx.lineTo(-L * 0.09, -W * 0.32);
      ctx.lineTo(-L * 0.02, -W * 0.12);
      ctx.closePath();
      ctx.fill();
      if (art.spoiler) {
        ctx.fillStyle = shade(bodyColor, -0.18);
        ctx.fillRect(-L * 0.5, -W * 0.46, 4, W * 0.92);
      }
    } else if (body === 'muscle') {
      ctx.beginPath();
      ctx.moveTo(L * 0.5, -W * 0.3);
      ctx.lineTo(L * 0.3, -W * 0.48);
      ctx.lineTo(-L * 0.36, -W * 0.48);
      ctx.lineTo(-L * 0.5, -W * 0.3);
      ctx.lineTo(-L * 0.5, W * 0.3);
      ctx.lineTo(-L * 0.36, W * 0.48);
      ctx.lineTo(L * 0.3, W * 0.48);
      ctx.lineTo(L * 0.5, W * 0.3);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(28, 38, 44, 0.86)';
      pathRound(ctx, -L * 0.18, -W * 0.34, L * 0.34, W * 0.68, 3);
      ctx.fill();
      ctx.fillStyle = 'rgba(122, 176, 190, 0.22)';
      pathRound(ctx, L * 0.06, -W * 0.28, L * 0.12, W * 0.56, 2);
      ctx.fill();
      if (art.scoop) {
        ctx.fillStyle = shade(bodyColor, -0.32);
        ctx.fillRect(L * 0.14, -W * 0.1, L * 0.12, W * 0.2);
      }
      if (v.config.stripe) {
        ctx.fillStyle = 'rgba(240, 236, 220, 0.45)';
        ctx.fillRect(-L * 0.42, -W * 0.08, L * 0.16, W * 0.16);
        ctx.fillRect(L * 0.24, -W * 0.08, L * 0.16, W * 0.16);
      }
    } else if (body === 'police') {
      ctx.beginPath();
      pathRound(ctx, -L * 0.48, -W * 0.44, L * 0.96, W * 0.88, 4);
      ctx.fill();
      ctx.fillStyle = '#1d2a38';
      ctx.fillRect(-L * 0.28, -W * 0.45, L * 0.18, W * 0.9);
      ctx.fillRect(L * 0.12, -W * 0.45, L * 0.08, W * 0.9);
      ctx.fillStyle = 'rgba(28, 40, 50, 0.9)';
      pathRound(ctx, -L * 0.16, -W * 0.35, L * 0.3, W * 0.7, 3);
      ctx.fill();
      ctx.fillStyle = '#1d1d24';
      ctx.fillRect(-W * 0.24, -3, W * 0.48, 6);
      // Lightbar.
      ctx.fillStyle = v.sirenPhase ? '#ff4d62' : '#3d4a62';
      ctx.fillRect(-5, -W * 0.36, 8, W * 0.28);
      ctx.fillStyle = v.sirenPhase ? '#37527c' : '#63a8ff';
      ctx.fillRect(-5, W * 0.08, 8, W * 0.28);
      ctx.font = '900 5px Arial, sans-serif';
      ctx.fillStyle = 'rgba(20, 30, 42, 0.7)';
      ctx.textAlign = 'center';
      ctx.fillText('POLICE', -L * 0.02, 2);
    } else if (body === 'suv') {
      ctx.beginPath();
      pathRound(ctx, -L * 0.48, -W * 0.48, L * 0.96, W * 0.96, 5);
      ctx.fill();
      ctx.fillStyle = 'rgba(24, 34, 40, 0.88)';
      pathRound(ctx, -L * 0.3, -W * 0.38, L * 0.55, W * 0.76, 3);
      ctx.fill();
      ctx.fillStyle = 'rgba(110, 175, 204, 0.2)';
      ctx.fillRect(-L * 0.24, -W * 0.33, L * 0.42, W * 0.12);
      ctx.fillStyle = '#1b1f26';
      ctx.fillRect(-W * 0.24, -3, W * 0.48, 6);
      if (v.config.art.lightbar) {
        ctx.fillStyle = v.sirenPhase ? '#ff4d62' : '#2d3c58';
        ctx.fillRect(-4, -W * 0.4, 7, W * 0.3);
        ctx.fillStyle = v.sirenPhase ? '#314f7c' : '#63a8ff';
        ctx.fillRect(-4, W * 0.1, 7, W * 0.3);
      }
    } else if (body === 'van' || body === 'box') {
      pathRound(ctx, -L * 0.5, -W * 0.48, L * 0.96, W * 0.96, 4);
      ctx.fill();
      ctx.fillStyle = shade(bodyColor, -0.2);
      ctx.fillRect(L * 0.18, -W * 0.48, L * 0.28, W * 0.96);
      ctx.fillStyle = 'rgba(26, 36, 42, 0.84)';
      ctx.fillRect(L * 0.28, -W * 0.34, L * 0.11, W * 0.68);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.lineWidth = 1;
      for (let x = -L * 0.18; x < L * 0.05; x += 7) {
        ctx.beginPath();
        ctx.moveTo(x, -W * 0.46);
        ctx.lineTo(x, W * 0.46);
        ctx.stroke();
      }
    } else {
      pathRound(ctx, -L * 0.48, -W * 0.46, L * 0.96, W * 0.92, 5);
      ctx.fill();
      ctx.fillStyle = 'rgba(26, 36, 42, 0.88)';
      pathRound(ctx, -L * 0.24, -W * 0.36, L * 0.48, W * 0.72, 3);
      ctx.fill();
      ctx.fillStyle = 'rgba(132, 190, 206, 0.2)';
      pathRound(ctx, -L * 0.18, -W * 0.3, L * 0.34, W * 0.6, 2);
      ctx.fill();
      if (v.config.stripe) {
        ctx.fillStyle = 'rgba(242, 236, 218, 0.5)';
        ctx.fillRect(-L * 0.4, -W * 0.07, L * 0.18, W * 0.14);
      }
    }

    // Roof highlight and a dark outline help the silhouette read at night.
    ctx.strokeStyle = 'rgba(255, 246, 226, 0.16)';
    ctx.lineWidth = 0.9;
    pathRound(ctx, -L * 0.42, -W * 0.3, L * 0.7, W * 0.6, 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(10, 10, 14, 0.5)';
    ctx.lineWidth = 1.1;
    pathRound(ctx, -L * 0.49, -W * 0.44, L * 0.98, W * 0.88, 4);
    ctx.stroke();
    if (body !== 'bike') {
      ctx.strokeStyle = 'rgba(22, 22, 28, 0.34)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(L * 0.3, -W * 0.4);
      ctx.lineTo(L * 0.3, W * 0.4);
      ctx.moveTo(-L * 0.3, -W * 0.4);
      ctx.lineTo(-L * 0.3, W * 0.4);
      ctx.stroke();
      ctx.fillStyle = 'rgba(170, 224, 234, 0.18)';
      pathRound(ctx, L * 0.02, -W * 0.24, L * 0.12, W * 0.48, 2);
      ctx.fill();
      ctx.fillStyle = shade(bodyColor, -0.3);
      ctx.fillRect(L * 0.05, -W * 0.55, L * 0.07, 2.4);
      ctx.fillRect(L * 0.05, W * 0.55 - 2.4, L * 0.07, 2.4);
    }

    // Scuffs and dents.
    if (damage > 0) {
      ctx.fillStyle = `rgba(24, 22, 24, ${0.12 + damage * 0.14})`;
      for (const mark of v.marks || []) {
        ctx.beginPath();
        ctx.arc(mark.x * 0.8, mark.y * 0.8, mark.r * (0.6 + damage * 0.3), 0, TAU);
        ctx.fill();
      }
    }

    if (v === game.player.vehicle) {
      ctx.strokeStyle = `rgba(255, 207, 92, ${0.18 * this.light.dark})`;
      ctx.lineWidth = 1.4;
      pathRound(ctx, -L * 0.53, -W * 0.5, L * 1.06, W, 6);
      ctx.stroke();
    }

    // Lights.
    ctx.fillStyle = v.brakeLightsOn ? '#ff3d4a' : '#7b2c32';
    ctx.fillRect(-L * 0.49, -W * 0.34, 3, W * 0.18);
    ctx.fillRect(-L * 0.49, W * 0.16, 3, W * 0.18);
    ctx.fillStyle = v.headlightsOn ? '#fff3c4' : '#4f4c44';
    ctx.fillRect(L * 0.47, -W * 0.34, 3, W * 0.16);
    ctx.fillRect(L * 0.47, W * 0.18, 3, W * 0.16);

    if (v.airborne) {
      ctx.strokeStyle = 'rgba(220, 236, 240, 0.28)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(0, 0, L * 0.62, W * 0.7, 0, 0, TAU);
      ctx.stroke();
    }

    if (v.isBurning) {
      this.paintFlame(ctx, L * 0.1, -W * 0.1, 1.2 + Math.sin(time * 8) * 0.2);
      this.paintFlame(ctx, -L * 0.16, W * 0.14, 0.9 + Math.cos(time * 7) * 0.16);
    } else if (damage >= 2) {
      const puff = 0.4 + 0.6 * Math.abs(Math.sin(time * 2 + v.x));
      ctx.fillStyle = `rgba(62, 60, 62, ${0.28 * puff})`;
      ctx.beginPath();
      ctx.arc(L * 0.12, -W * 0.1, 5 + puff * 4, 0, TAU);
      ctx.fill();
    }

    // Occupants read as a windscreen silhouette.
    if (v.driver && !v.isPolice) {
      ctx.fillStyle = 'rgba(24, 26, 30, 0.65)';
      ctx.beginPath();
      ctx.arc(-L * 0.02, -W * 0.14, 2.8, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  paintFlame(ctx, x, y, scale) {
    const flicker = 0.7 + Math.random() * 0.4;
    const g = ctx.createRadialGradient(x, y, 1, x, y, 12 * scale);
    g.addColorStop(0, `rgba(255, 236, 160, ${0.8 * flicker})`);
    g.addColorStop(0.35, `rgba(255, 142, 50, ${0.6 * flicker})`);
    g.addColorStop(1, 'rgba(255, 70, 20, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, 12 * scale, 0, TAU);
    ctx.fill();
  }

  paintPerson(ctx, p) {
    const isPlayer = !!p.isPlayer;
    const isCop = !!p.isCop;
    const isEnemy = !!p.isEnemy;
    const scale = p.isBoss ? 1.14 : 1;
    const x = p.x;
    const y = p.y;
    const walk = p.moving ? Math.sin((p.walkPhase || 0) * 6) : 0;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(p.angle);
    ctx.scale(scale, scale);

    // Legs.
    if (!p.isDead) {
      ctx.strokeStyle = this.litColor(p.pants || (isCop ? '#202938' : '#38404d'), 0.45);
      ctx.lineWidth = 4.2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-1, -3.2);
      ctx.lineTo(-6 + walk * 3, -7.5);
      ctx.moveTo(-1, 3.2);
      ctx.lineTo(-6 - walk * 3, 7.5);
      ctx.stroke();
    }

    // Torso / shoulders with a readable shirt panel.
    const shirtColor = this.litColor(isCop ? '#2f4660' : isEnemy ? (p.color || '#a3473c') : (p.shirt || '#9a6b72'), 0.42);
    ctx.fillStyle = shirtColor;
    ctx.beginPath();
    ctx.ellipse(-2, 0, 8.2, 6.4, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.10)';
    ctx.beginPath();
    ctx.ellipse(-2.4, -1.4, 5.2, 2.2, 0, 0, TAU);
    ctx.fill();
    if (isCop) {
      ctx.fillStyle = '#d9e2e8';
      ctx.fillRect(-5, -5.5, 3, 11);
      ctx.fillStyle = '#86b8e6';
      ctx.fillRect(1, -1.4, 3, 2.8);
    }
    if (isEnemy && p.isBoss) {
      ctx.fillStyle = '#e8b04a';
      ctx.fillRect(-2, -6, 3, 12);
    }

    // Arms. Armed actors point one arm down the aim line; civilians swing both.
    const weapon = p.weapon?.id || (isCop ? 'pistol' : 'pistol');
    const armed = (isPlayer || isCop || isEnemy) && weapon !== 'fists';
    ctx.strokeStyle = shirtColor;
    ctx.lineWidth = 2.6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    if (armed) {
      ctx.moveTo(-1, -5);
      ctx.lineTo(5, -6.5 + walk * 0.8);
    } else {
      ctx.moveTo(-1, -5);
      ctx.lineTo(4 + walk * 2.6, -7.4);
      ctx.moveTo(-1, 5);
      ctx.lineTo(4 - walk * 2.6, 7.4);
    }
    ctx.stroke();
    if (armed) {
      ctx.strokeStyle = isPlayer ? '#3b2f28' : isCop ? '#1e2836' : '#33251f';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(0, 2);
      ctx.lineTo(10, 1);
      ctx.stroke();
      ctx.fillStyle = '#202228';
      if (weapon === 'shotgun' || weapon === 'rifle') ctx.fillRect(8, 0, 11, 2.2);
      else ctx.fillRect(9, 0, 6, 2.4);
      ctx.fillStyle = '#d9b27c';
      ctx.beginPath();
      ctx.arc(11, 1.2, 2.1, 0, TAU);
      ctx.fill();
    } else if (isPlayer) {
      ctx.strokeStyle = this.litColor('#d7ad84', 0.4);
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(-1, 5);
      ctx.lineTo(4, 7);
      ctx.stroke();
    }

    // Head and hair.
    ctx.fillStyle = this.litColor(p.skin || (isCop ? '#c79a76' : isEnemy ? '#c69268' : '#d9a97f'), 0.38);
    ctx.beginPath();
    ctx.arc(2.2, 0, 4.4, 0, TAU);
    ctx.fill();
    ctx.fillStyle = this.litColor(p.hair || (isCop ? '#26303d' : '#2b211c'), 0.6);
    ctx.beginPath();
    ctx.arc(1.8, 0, 4.7, Math.PI * 0.55, Math.PI * 1.45);
    ctx.fill();
    if (isCop) {
      ctx.strokeStyle = '#89a6c2';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(2.2, 0, 5.2, Math.PI * 0.35, Math.PI * 1.65);
      ctx.stroke();
    }
    if (p.hat) {
      ctx.fillStyle = this.litColor('#d8c79c', 0.7);
      ctx.beginPath();
      ctx.arc(1, 0, 5, 0, TAU);
      ctx.fill();
    }

    // Accessories.
    if (p.umbrella && !isPlayer) {
      ctx.save();
      ctx.translate(-2, 0);
      ctx.fillStyle = this.litColor(p.umbrellaColor || '#ff7f9e', 0.42);
      ctx.beginPath();
      ctx.arc(0, 0, 15, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.36)';
      ctx.beginPath();
      ctx.arc(0, 0, 15, -1.2, -0.2);
      ctx.lineTo(0, 0);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(64, 44, 30, 0.55)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-6, 2);
      ctx.stroke();
      ctx.restore();
    } else if (p.bag) {
      ctx.fillStyle = this.litColor('#8f6a4c', 0.7);
      ctx.fillRect(-8, 2, 5, 6);
    } else if (p.phone) {
      ctx.fillStyle = 'rgba(145, 221, 240, 0.8)';
      ctx.fillRect(9, -5, 2.4, 4);
    }

    // Player identifier: a small chevron under the feet.
    if (isPlayer) {
      ctx.strokeStyle = 'rgba(255, 230, 178, 0.75)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(0, 0, 11, 0, TAU);
      ctx.stroke();
    }

    if (p.hitFlash > 0.2) {
      ctx.fillStyle = `rgba(255, 235, 208, ${p.hitFlash * 0.35})`;
      ctx.beginPath();
      ctx.arc(0, 0, 9, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  paintBody(ctx, p, shirt, pants) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.deadAngle || p.angle);
    ctx.fillStyle = 'rgba(74, 24, 30, 0.18)';
    ctx.beginPath();
    ctx.ellipse(0, 4, 12, 7, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = this.litColor(pants);
    ctx.fillRect(-11, -4, 20, 3);
    ctx.fillRect(-11, 1, 20, 3);
    ctx.fillStyle = this.litColor(shirt);
    ctx.beginPath();
    ctx.ellipse(-2, 0, 8, 5.4, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = this.litColor(p.skin || '#d9a97f');
    ctx.beginPath();
    ctx.arc(8, 0, 4, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  // =================================================================
  // Projectiles and effects
  // =================================================================
  paintProjectiles(game) {
    const ctx = this.ctx;
    const combat = game.combat;
    if (!combat) return;

    // Bullets: a hot head and a fading tracer.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const b of combat.bullets || []) {
      if (!this.inView(b.x, b.y, 40)) continue;
      const sx = b.px ?? b.x - Math.cos(b.angle) * 30;
      const sy = b.py ?? b.y - Math.sin(b.angle) * 30;
      const grad = ctx.createLinearGradient(sx, sy, b.x, b.y);
      grad.addColorStop(0, 'rgba(255, 190, 90, 0)');
      grad.addColorStop(0.7, 'rgba(255, 220, 140, 0.55)');
      grad.addColorStop(1, 'rgba(255, 250, 220, 0.95)');
      ctx.strokeStyle = grad;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.fillStyle = '#fff6d0';
      ctx.beginPath();
      ctx.arc(b.x, b.y, 2, 0, TAU);
      ctx.fill();
    }
    ctx.restore();

    for (const g of combat.grenades || []) {
      if (!this.inView(g.x, g.y, 50)) continue;
      const z = g.z || 0;
      const scale = 1 + z * 0.006;
      const sx = g.x;
      const sy = g.y - z * 0.45;
      // Shadow.
      ctx.fillStyle = 'rgba(18, 18, 20, 0.32)';
      ctx.beginPath();
      ctx.ellipse(g.x, g.y + 4, 4.5, 2.1, 0, 0, TAU);
      ctx.fill();
      // Body.
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(g.spin || 0);
      ctx.fillStyle = '#35453a';
      pathRound(ctx, -4 * scale, -3 * scale, 8 * scale, 6 * scale, 2.4);
      ctx.fill();
      ctx.fillStyle = '#8d9b7c';
      ctx.fillRect(-1.4, -3 * scale, 2.8, 6 * scale);
      ctx.restore();
      // Armed fuse.
      const pulse = 0.55 + 0.45 * Math.sin((game.worldTime || 0) * 22);
      ctx.fillStyle = `rgba(255, 92, 74, ${0.5 + pulse * 0.5})`;
      ctx.beginPath();
      ctx.arc(sx + 3, sy - 3, 1.8, 0, TAU);
      ctx.fill();
    }
  }

  paintParticles(game) {
    const ps = game.particles;
    if (!ps) return;
    const ctx = this.ctx;
    const flameTypes = new Set(['spark', 'hit', 'muzzle', 'explosion_fire', 'shockwave', 'rain', 'splash']);

    // Soft pass: smoke, dust and debris first so sparks read on top.
    for (const p of ps.particles) {
      if (!this.inView(p.x, p.y, 70)) continue;
      if (flameTypes.has(p.type)) continue;
      const life = clamp(p.life / (p.maxLife || 1), 0, 1);
      if (p.type === 'smoke') {
        const r = p.size * (1.0 - life * 0.35);
        const g = ctx.createRadialGradient(p.x, p.y, 1, p.x, p.y, r);
        g.addColorStop(0, p.color || 'rgba(130, 128, 132, 0.4)');
        g.addColorStop(0.55, p.color || 'rgba(130, 128, 132, 0.25)');
        g.addColorStop(1, 'rgba(90, 90, 96, 0)');
        ctx.fillStyle = g;
        ctx.globalAlpha = life * 0.08;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, TAU);
        ctx.fill();
      } else if (p.type === 'dust') {
        const r = p.size * (1.4 - life * 0.4);
        const g = ctx.createRadialGradient(p.x, p.y, 1, p.x, p.y, r);
        g.addColorStop(0, p.color || 'rgba(218, 205, 180, 0.5)');
        g.addColorStop(0.5, p.color || 'rgba(218, 205, 180, 0.3)');
        g.addColorStop(1, 'rgba(190, 176, 150, 0)');
        ctx.fillStyle = g;
        ctx.globalAlpha = life * 0.08;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, TAU);
        ctx.fill();
      } else if (p.type === 'casing' || p.type === 'glass' || p.type === 'debris') {
        ctx.globalAlpha = clamp(life * 1.4, 0, 1);
        ctx.fillStyle = p.type === 'casing' ? '#d8b877' : p.color || '#8f9a9c';
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.spin || 0);
        ctx.fillRect(-p.size * 0.6, -p.size * 0.3, p.size * 1.2, p.size * 0.6);
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;

    // Additive pass: heat and light.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of ps.particles) {
      if (!this.inView(p.x, p.y, 90)) continue;
      const life = clamp(p.life / (p.maxLife || 1), 0, 1);
      if (p.type === 'spark') {
        ctx.fillStyle = p.color || '#ffe27a';
        ctx.globalAlpha = life;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, TAU);
        ctx.fill();
      } else if (p.type === 'hit') {
        ctx.fillStyle = p.color || '#ffe9b5';
        ctx.globalAlpha = life * 0.9;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * life, 0, TAU);
        ctx.fill();
      } else if (p.type === 'explosion_fire') {
        const r = p.size * (1.6 - life * 0.8);
        const g = ctx.createRadialGradient(p.x, p.y, 1, p.x, p.y, r);
        g.addColorStop(0, `rgba(255, 248, 196, ${Math.min(1, life * 1.3)})`);
        g.addColorStop(0.34, `rgba(255, 156, 52, ${life * 0.82})`);
        g.addColorStop(1, 'rgba(216, 42, 12, 0)');
        ctx.fillStyle = g;
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, TAU);
        ctx.fill();
      } else if (p.type === 'rain' || p.type === 'splash') {
        ctx.strokeStyle = p.color || 'rgba(205, 235, 240, 0.5)';
        ctx.globalAlpha = life * 0.34;
        ctx.lineWidth = 0.8;
        const r = p.size * (0.55 + (1 - life) * 0.4);
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, Math.PI * 0.15, Math.PI * 0.85);
        ctx.stroke();
      } else if (p.type === 'muzzle') {
        const g = ctx.createRadialGradient(p.x, p.y, 1, p.x, p.y, p.size * 2.4);
        g.addColorStop(0, 'rgba(255, 248, 210, 0.95)');
        g.addColorStop(0.4, 'rgba(255, 196, 92, 0.48)');
        g.addColorStop(1, 'rgba(255, 140, 40, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 2.4, 0, TAU);
        ctx.fill();
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle || 0);
        ctx.fillStyle = 'rgba(255, 240, 180, 0.75)';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(p.size * 2.2, -p.size * 0.5);
        ctx.lineTo(p.size * 1.6, 0);
        ctx.lineTo(p.size * 2.2, p.size * 0.5);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      } else if (p.type === 'shockwave') {
        ctx.strokeStyle = `rgba(255, 210, 150, ${life * 0.5})`;
        ctx.lineWidth = 2.4 * life;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius || 20, 0, TAU);
        ctx.stroke();
      }
    }
    ctx.restore();

    // Explosion rings (persist briefly).
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const e of ps.explosions || []) {
      if (e.age > 0.75) continue;
      const t = clamp(e.age / 0.75, 0, 1);
      const r = e.radius * (0.4 + t * 1.15);
      ctx.strokeStyle = `rgba(255, 192, 112, ${(1 - t) * 0.42})`;
      ctx.lineWidth = 3 * (1 - t);
      ctx.beginPath();
      ctx.arc(e.x, e.y, r, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();

    // Cash pickups.
    for (const c of ps.cashPickups || []) {
      if (!this.inView(c.x, c.y, 30)) continue;
      const bob = Math.sin(c.bob) * 3;
      ctx.save();
      ctx.translate(c.x, c.y - bob);
      ctx.fillStyle = '#9bd46d';
      ctx.font = '900 9px "Segoe UI", Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`$${c.amount}`, 0, 0);
      ctx.strokeStyle = 'rgba(40, 70, 36, 0.4)';
      ctx.lineWidth = 1;
      ctx.strokeRect(-12, -8, 24, 11);
      ctx.restore();
    }
  }

  paintMuzzleLight(game) {
    const ctx = this.ctx;
    const time = game.worldTime || 0;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of game.particles.particles) {
      if (p.type !== 'muzzle') continue;
      if (!this.inView(p.x, p.y, 70)) continue;
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 30 + Math.sin(time * 30) * 4);
      g.addColorStop(0, 'rgba(255, 242, 198, 0.18)');
      g.addColorStop(0.5, 'rgba(255, 192, 108, 0.06)');
      g.addColorStop(1, 'rgba(255, 160, 60, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(p.x - 38, p.y - 38, 76, 76);
    }
    ctx.restore();
  }

  paintObjectives(game) {
    if (game.state === 'title' || game.state === 'controls') return;
    const ctx = this.ctx;
    const time = game.worldTime || 0;

    const marker = game.missions?.availableMarker?.();
    if (marker && this.inView(marker.x, marker.y, 80)) {
      this.paintMissionMarker(ctx, marker.x, marker.y, Math.min(marker.radius, 52), time, true);
    }

    const target = game.missions?.active ? game.missions.currentTarget() : null;
    if (target && this.inView(target.x, target.y, 80)) {
      this.paintMissionMarker(ctx, target.x, target.y, Math.max(24, target.radius * 0.52), time, false);
    }

    for (const p of game.pickups?.pickups || []) {
      if (!p.active || !this.inView(p.x, p.y, 26)) continue;
      const bob = Math.sin(p.bob) * 3;
      ctx.save();
      ctx.translate(p.x, p.y + bob);
      const g = ctx.createRadialGradient(0, 0, 2, 0, 0, 17);
      g.addColorStop(0, alpha(p.def.color, 0.36));
      g.addColorStop(0.55, alpha(p.def.color, 0.1));
      g.addColorStop(1, alpha(p.def.color, 0));
      ctx.fillStyle = g;
      ctx.fillRect(-18, -18, 36, 36);
      ctx.fillStyle = p.def.color;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.lineWidth = 1;
      if (p.type === 'health') {
        ctx.fillRect(-7, -7, 14, 14);
        ctx.strokeRect(-7, -7, 14, 14);
        ctx.fillStyle = 'rgba(12, 30, 20, 0.8)';
        ctx.fillRect(-1.6, -4.6, 3.2, 9.2);
        ctx.fillRect(-4.6, -1.6, 9.2, 3.2);
      } else if (p.type === 'armor') {
        ctx.beginPath();
        ctx.moveTo(0, -8);
        ctx.lineTo(7, -5);
        ctx.lineTo(5.4, 3.5);
        ctx.lineTo(0, 8);
        ctx.lineTo(-5.4, 3.5);
        ctx.lineTo(-7, -5);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = 'rgba(12, 24, 40, 0.7)';
        ctx.fillRect(-1.4, -4, 2.8, 6);
      } else if (p.type === 'grenade') {
        ctx.beginPath();
        ctx.arc(0, 1, 5.5, 0, TAU);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = 'rgba(20, 32, 18, 0.8)';
        ctx.fillRect(-1.5, -6, 3, 3);
      } else if (p.type === 'cash') {
        ctx.fillRect(-8, -5, 16, 10);
        ctx.strokeRect(-8, -5, 16, 10);
        ctx.fillStyle = 'rgba(20, 40, 20, 0.8)';
        ctx.font = '900 8px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('$', 0, 3);
      } else {
        ctx.fillRect(-7, -4.5, 14, 9);
        ctx.strokeRect(-7, -4.5, 14, 9);
        ctx.fillStyle = 'rgba(20, 20, 16, 0.75)';
        for (let i = -4; i <= 4; i += 4) ctx.fillRect(i, -3, 2, 6);
      }
      ctx.restore();
    }

    for (const item of game.collectibles?.items || []) {
      if (item.found || !this.inView(item.x, item.y, 36)) continue;
      const bob = Math.sin(item.bob) * 4;
      ctx.save();
      ctx.translate(item.x, item.y + bob);
      const g = ctx.createRadialGradient(0, 0, 2, 0, 0, 24);
      g.addColorStop(0, alpha(item.color, 0.3));
      g.addColorStop(0.55, alpha(item.color, 0.08));
      g.addColorStop(1, alpha(item.color, 0));
      ctx.fillStyle = g;
      ctx.fillRect(-24, -24, 48, 48);
      ctx.rotate(Math.sin(item.bob * 0.55) * 0.15);
      ctx.fillStyle = 'rgba(20, 18, 24, 0.88)';
      pathRound(ctx, -11, -7, 22, 14, 2);
      ctx.fill();
      ctx.fillStyle = item.color;
      pathRound(ctx, -9, -5, 18, 10, 1.5);
      ctx.fill();
      ctx.fillStyle = 'rgba(20, 18, 24, 0.8)';
      ctx.beginPath();
      ctx.arc(-3.5, 0, 2.5, 0, TAU);
      ctx.arc(3.5, 0, 2.5, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(20, 18, 24, 0.7)';
      ctx.fillRect(-9, 4, 18, 1.4);
      ctx.restore();
    }

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
      ctx.font = '900 9px "Segoe UI", Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('REPAIR', garage.x, garage.y - 74);
      ctx.restore();
    }
  }

  paintMissionMarker(ctx, x, y, radius, time, available) {
    const pulse = 0.5 + 0.5 * Math.sin(time * 2.6);
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = `rgba(255, 209, 102, ${0.4 + pulse * 0.3})`;
    ctx.lineWidth = available ? 3.2 : 2.2;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = `rgba(255, 242, 196, ${0.15 + pulse * 0.1})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, radius * (1.1 + pulse * 0.06), 0, TAU);
    ctx.stroke();
    if (available) {
      const g = ctx.createLinearGradient(0, -70, 0, 0);
      g.addColorStop(0, 'rgba(255, 209, 102, 0)');
      g.addColorStop(1, 'rgba(255, 209, 102, 0.15)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(-11, 0);
      ctx.lineTo(-4, -70);
      ctx.lineTo(4, -70);
      ctx.lineTo(11, 0);
      ctx.closePath();
      ctx.fill();
      pathStar(ctx, 0, -9, 7 + pulse * 1.8);
      ctx.fillStyle = '#ffd166';
      ctx.fill();
    }
    ctx.restore();
  }

  // =================================================================
  // Weather and screen grade
  // =================================================================
  paintWorldRain(game) {
    const weather = game.weather;
    if (!weather || weather.intensity < 0.02) return;
    const ctx = this.ctx;
    const time = game.worldTime || 0;
    const count = Math.round(70 * weather.intensity);
    ctx.save();
    ctx.strokeStyle = `rgba(206, 232, 238, ${0.06 + weather.intensity * 0.11})`;
    ctx.lineWidth = 1;
    for (let i = 0; i < count; i += 1) {
      const x = this.view.x + ((i * 97 + time * 140) % Math.max(1, this.view.w));
      const y = this.view.y + ((i * 61 + time * 260) % Math.max(1, this.view.h));
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - 5, y + 16);
      ctx.stroke();
    }
    ctx.restore();
  }

  paintReticle(game) {
    const m = game.input?.mouse;
    const p = game.player;
    if (!m || !p) return;
    if (['title', 'paused', 'controls', 'photo', 'missionComplete', 'wasted', 'busted', 'ending'].includes(game.state)) return;
    const ctx = this.ctx;
    const spread = p.weapon?.spread ? 7 + p.weapon.spread * 130 : 8;
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 246, 222, 0.8)';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.arc(m.worldX, m.worldY, spread, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = p.weapon?.id === 'fists' ? 'rgba(255, 209, 102, 0.85)' : 'rgba(255, 246, 222, 0.9)';
    ctx.beginPath();
    ctx.arc(m.worldX, m.worldY, 1.7, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 246, 222, 0.42)';
    for (const a of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
      ctx.beginPath();
      ctx.moveTo(m.worldX + Math.cos(a) * (spread + 2), m.worldY + Math.sin(a) * (spread + 2));
      ctx.lineTo(m.worldX + Math.cos(a) * (spread + 6), m.worldY + Math.sin(a) * (spread + 6));
      ctx.stroke();
    }
    if (p.meleeCombo > 0 && p.comboTimer > 0 && p.weapon?.id === 'fists') {
      ctx.fillStyle = 'rgba(255, 209, 102, 0.85)';
      ctx.font = '900 9px "Segoe UI", Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(['', 'JAB', 'CROSS', 'FINISH'][p.meleeCombo] || '', m.worldX, m.worldY - 18);
    }
    ctx.restore();
  }

  paintGrade(game) {
    const ctx = this.ctx;
    const light = this.light;
    const w = game.weather;

    // Final tint is intentionally light: the heavy lifting is the world-space
    // ambient pass that runs before the lamps.
    const wash = ctx.createLinearGradient(0, 0, this.width, this.height);
    wash.addColorStop(0, css(light.sky, 0.02 + light.dark * 0.035));
    wash.addColorStop(0.55, css(light.ambient, 0.01 + light.dark * 0.02));
    wash.addColorStop(1, css(light.base, 0.015 + light.dark * 0.04));
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, this.width, this.height);

    // District neon haze at night.
    if (light.dark > 0.4) {
      const district = districtAt(game.player.x, game.player.y);
      const tint = district?.neon || '#6fe0e6';
      const g = ctx.createLinearGradient(0, this.height, this.width, 0);
      g.addColorStop(0, alpha(tint, 0.05 * light.dark));
      g.addColorStop(0.6, 'rgba(255, 111, 145, 0.02)');
      g.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, this.width, this.height);
    }

    // Golden hour warmth.
    if (light.golden > 0.15) {
      const g = ctx.createLinearGradient(0, this.height, this.width, 0);
      g.addColorStop(0, `rgba(255, 122, 76, ${light.golden * 0.20})`);
      g.addColorStop(0.6, `rgba(220, 100, 120, ${light.golden * 0.10})`);
      g.addColorStop(1, 'rgba(90, 60, 120, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, this.width, this.height);
    }

    // Sun / moon disc and bloom.
    const sx = this.width * light.sunX;
    const sy = this.height * light.sunY;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    if (light.day > 0.16) {
      const r = 26 + Math.sin((game.timeOfDay || 0) * TAU) * 4;
      const sun = ctx.createRadialGradient(sx, sy, 4, sx, sy, this.width * 0.62);
      sun.addColorStop(0, `rgba(255, 238, 188, ${0.28 * light.day})`);
      sun.addColorStop(0.16, `rgba(255, 206, 138, ${0.12 * light.day})`);
      sun.addColorStop(0.5, `rgba(255, 162, 110, ${0.04 * light.day})`);
      sun.addColorStop(1, 'rgba(255, 140, 100, 0)');
      ctx.fillStyle = sun;
      ctx.fillRect(0, 0, this.width, this.height);
      ctx.fillStyle = `rgba(255, 250, 222, ${0.14 * light.day})`;
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, TAU);
      ctx.fill();
    } else {
      const mx = this.width * 0.76;
      const my = this.height * 0.14;
      const moon = ctx.createRadialGradient(mx, my, 3, mx, my, 220);
      moon.addColorStop(0, 'rgba(204, 224, 255, 0.20)');
      moon.addColorStop(0.35, 'rgba(150, 184, 255, 0.06)');
      moon.addColorStop(1, 'rgba(120, 160, 255, 0)');
      ctx.fillStyle = moon;
      ctx.fillRect(0, 0, this.width, this.height);
      ctx.fillStyle = 'rgba(220, 234, 255, 0.22)';
      ctx.beginPath();
      ctx.arc(mx, my, 15, 0, TAU);
      ctx.fill();
    }

    // Stars.
    if (light.starAlpha > 0.02) {
      for (const star of this._stars) {
        const twinkle = 0.55 + 0.45 * Math.sin(star.phase + (game.worldTime || 0) * star.speed);
        ctx.fillStyle = `rgba(226, 238, 255, ${light.starAlpha * star.a * twinkle})`;
        ctx.fillRect(star.x * this.width, star.y * this.height * 0.55, star.size, star.size);
      }
    }
    ctx.restore();

    // Fog / haze / rain lens.
    if (w && (w.type === 'haze' || w.type === 'rain' || w.type === 'storm')) {
      const fog = w.type === 'storm' ? 0.09 : w.type === 'rain' ? 0.035 : 0.055;
      ctx.fillStyle = `rgba(214, 226, 228, ${fog})`;
      ctx.fillRect(0, 0, this.width, this.height);
      const time = game.worldTime || 0;
      ctx.strokeStyle = `rgba(200, 230, 240, ${0.035 + (w.intensity || 0) * 0.05})`;
      ctx.lineWidth = 1;
      for (const drop of this._rain) {
        const x = (drop.x * this.width + Math.sin(time * 0.5 + drop.phase) * 24) % this.width;
        const y = (drop.y * this.height + time * (220 + drop.speed * 160)) % this.height;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - drop.len * 0.4, y + drop.len);
        ctx.stroke();
      }
    }

    if (w?.wetness > 0.05) {
      ctx.fillStyle = `rgba(34, 78, 96, ${w.wetness * 0.048})`;
      ctx.fillRect(0, 0, this.width, this.height);
    }

    if (w?.flash > 0) {
      ctx.fillStyle = `rgba(220, 236, 255, ${Math.min(0.5, w.flash * 0.48)})`;
      ctx.fillRect(0, 0, this.width, this.height);
    }

    // Vignette.
    const vig = ctx.createRadialGradient(this.width / 2, this.height / 2, this.height * 0.36, this.width / 2, this.height / 2, this.width * 0.7);
    vig.addColorStop(0, 'rgba(8, 8, 14, 0)');
    vig.addColorStop(1, `rgba(8, 8, 14, ${0.34 + light.dark * 0.22})`);
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, this.width, this.height);

    // Fine raster texture.
    ctx.fillStyle = 'rgba(255, 255, 255, 0.012)';
    for (let y = 0; y < this.height; y += 4) ctx.fillRect(0, y, this.width, 1);
  }

  buildRainField() {
    const drops = [];
    for (let i = 0; i < 116; i += 1) {
      drops.push({
        x: ((i * 137 + 23) % 1000) / 1000,
        y: ((i * 271 + 61) % 1000) / 1000,
        len: 12 + (i % 7) * 3.2,
        speed: 0.5 + (i % 5) * 0.16,
        phase: i * 1.7,
      });
    }
    return drops;
  }

  buildStars() {
    const stars = [];
    for (let i = 0; i < 44; i += 1) {
      stars.push({
        x: ((i * 173 + 41) % 1000) / 1000,
        y: ((i * 89 + 17) % 1000) / 1000,
        size: i % 7 === 0 ? 2 : 1.3,
        a: 0.35 + (i % 5) * 0.12,
        speed: 0.4 + (i % 4) * 0.22,
        phase: i * 2.1,
      });
    }
    return stars;
  }
}
