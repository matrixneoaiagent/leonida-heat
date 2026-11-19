// Leonida Heat - canvas renderer.
// A warm top-down Costa Sol: layered ground, asphalt with lane paint and
// crosswalks, extruded buildings with lit facades and rooftop signs, sand,
// animated surf, palms, streetlights, skid marks, shadows, and all the actors.

import { PALETTE, districtAt } from './config.js';

const TAU = Math.PI * 2;

function rr(ctx, x, y, w, h, r) {
  const radius = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function starPath(ctx, x, y, r, points = 5) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i += 1) {
    const rad = i % 2 === 0 ? r : r * 0.45;
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
    this.ctx = canvas.getContext('2d');
    this.width = canvas.width;
    this.height = canvas.height;
    this.view = { x: 0, y: 0, w: 0, h: 0 };
    this.frame = 0;
  }

  render(game) {
    const ctx = this.ctx;
    const cam = game.camera;
    this.frame += 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#65755f';
    ctx.fillRect(0, 0, this.width, this.height);

    const shakeX = (Math.random() - 0.5) * cam.shake * 26;
    const shakeY = (Math.random() - 0.5) * cam.shake * 26;
    ctx.save();
    ctx.translate(this.width / 2 + shakeX, this.height / 2 + shakeY);
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-cam.x, -cam.y);

    const halfW = this.width / 2 / cam.zoom;
    const halfH = this.height / 2 / cam.zoom;
    this.view = { x: cam.x - halfW, y: cam.y - halfH, w: cam.x + halfW, h: cam.y + halfH };

    const staticLayer = this.ensureStaticLayer(game);
    const sx = Math.max(0, Math.floor(this.view.x));
    const sy = Math.max(0, Math.floor(this.view.y));
    const sw = Math.min(3200 - sx, Math.ceil(this.view.w - sx) + 2);
    const sh = Math.min(3200 - sy, Math.ceil(this.view.h - sy) + 2);
    if (sw > 0 && sh > 0) ctx.drawImage(staticLayer, sx, sy, sw, sh, sx, sy, sw, sh);

    this.drawWaterAnimation(game);
    this.drawTrafficLights(game);
    this.drawSkidMarks(game);
    this.drawGroundDecals(game);
    this.drawPickups(game);
    this.drawMissionMarkers(game, false);
    this.drawEntityShadows(game);
    this.drawEntities(game);
    this.drawBullets(game);
    this.drawParticles(game);
    this.drawMissionMarkers(game, true);
    this.drawReticle(game);
    ctx.restore();

    this.drawAtmosphere(game);
  }

  ensureStaticLayer(game) {
    if (this.staticLayer && this.staticLayer.city === game.city) return this.staticLayer.canvas;
    const canvas = document.createElement('canvas');
    canvas.width = 3200;
    canvas.height = 3200;
    const ctx = canvas.getContext('2d');
    const savedCtx = this.ctx;
    const savedView = this.view;
    this.ctx = ctx;
    this.view = { x: 0, y: 0, w: 3200, h: 3200 };
    this.baking = true;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#65755f';
    ctx.fillRect(0, 0, 3200, 3200);
    this.drawWater(game, false);
    this.drawBeach(game);
    this.drawBlocks(game);
    this.drawRoads(game);
    this.drawRoadMarkings(game);
    this.drawProps(game);
    this.drawBuildings(game);
    this.drawPalms(game);
    this.drawStreetLights(game);
    this.baking = false;
    this.ctx = savedCtx;
    this.view = savedView;
    this.staticLayer = { city: game.city, canvas };
    return canvas;
  }

  inView(x, y, pad = 80) {
    const v = this.view;
    return x > v.x - pad && x < v.w + pad && y > v.y - pad && y < v.h + pad;
  }

  // -------------------------------------------------------------
  // Ground layers
  // -------------------------------------------------------------
  drawWater(game, animated = true) {
    const ctx = this.ctx;
    const v = this.view;
    if (v.w < 2710) return;
    const x0 = 2712;
    const grad = ctx.createLinearGradient(x0, 0, 3200, 0);
    grad.addColorStop(0, '#4bb9bd');
    grad.addColorStop(0.2, '#2d91a5');
    grad.addColorStop(0.65, '#1d6d85');
    grad.addColorStop(1, '#135166');
    ctx.fillStyle = grad;
    ctx.fillRect(x0, 0, 3200 - x0, 3200);

    if (animated) {
      this.drawWaterAnimation(game);
      return;
    }

    // Piers are part of the static map.
    for (const p of game.city.piers) {
      const left = p.x - p.w / 2;
      const top = p.y - p.h / 2;
      ctx.fillStyle = 'rgba(12, 40, 48, 0.32)';
      rr(ctx, left + 6, top + 10, p.w, p.h, 3);
      ctx.fill();
      ctx.fillStyle = '#b88f63';
      rr(ctx, left, top, p.w, p.h, 3);
      ctx.fill();
      ctx.strokeStyle = 'rgba(86, 57, 34, 0.4)';
      ctx.lineWidth = 1.4;
      for (let x = left + 6; x < left + p.w; x += 12) {
        ctx.beginPath();
        ctx.moveTo(x, top + 2);
        ctx.lineTo(x, top + p.h - 2);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.fillRect(left + 2, top + 2, p.w - 4, 3);
    }
  }

  drawWaterAnimation(game) {
    const ctx = this.ctx;
    const v = this.view;
    if (v.w < 2710) return;
    const yStart = Math.max(0, Math.floor(v.y / 18) * 18 - 40);
    const yEnd = Math.min(3200, v.h + 40);
    ctx.save();
    ctx.strokeStyle = 'rgba(224, 249, 244, 0.8)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    for (let y = yStart; y <= yEnd; y += 18) {
      const x = 2718 + Math.sin(y * 0.025 + game.worldTime * 1.3) * 7 + Math.sin(y * 0.08 + game.worldTime * 2.1) * 2;
      if (y === yStart) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(190, 240, 238, 0.3)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let y = yStart; y <= yEnd; y += 16) {
      const x = 2710 + Math.sin(y * 0.03 + game.worldTime * 1.5 + 1) * 9;
      if (y === yStart) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    ctx.strokeStyle = 'rgba(203, 246, 245, 0.18)';
    ctx.lineWidth = 1.5;
    const waveStart = Math.max(0, Math.floor(v.y / 60) * 60);
    const waveEnd = Math.min(3200, v.h + 60);
    for (let y = waveStart; y < waveEnd; y += 54) {
      const offset = Math.sin(y * 0.04 + game.worldTime * 1.8) * 16;
      const xFrom = Math.max(2740, v.x - 40);
      const xTo = Math.min(3200, v.w + 40);
      ctx.beginPath();
      for (let x = xFrom; x < xTo; x += 28) {
        const wy = y + Math.sin(x * 0.02 + game.worldTime * 2 + y * 0.01) * 4 + offset * 0.3;
        if (x === xFrom) ctx.moveTo(x, wy);
        else ctx.lineTo(x, wy);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  drawBeach(game) {
    const ctx = this.ctx;
    if (this.view.w < 2480) return;
    const grad = ctx.createLinearGradient(2480, 0, 2730, 0);
    grad.addColorStop(0, '#dcc29a');
    grad.addColorStop(0.35, '#f3d7a7');
    grad.addColorStop(0.85, '#f7e1b7');
    grad.addColorStop(1, '#e7c48f');
    ctx.fillStyle = grad;
    ctx.fillRect(2480, 0, 242, 3200);

    // Boardwalk planks.
    ctx.fillStyle = '#c99a6b';
    ctx.fillRect(2494, 0, 58, 3200);
    ctx.strokeStyle = 'rgba(120, 78, 47, 0.35)';
    ctx.lineWidth = 1.2;
    const yStart = Math.max(0, Math.floor(this.view.y / 14) * 14);
    for (let y = yStart; y < Math.min(3200, this.view.h + 20); y += 14) {
      ctx.beginPath();
      ctx.moveTo(2494, y);
      ctx.lineTo(2552, y);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255, 241, 216, 0.18)';
    ctx.fillRect(2494, 0, 3, 3200);
    ctx.fillRect(2549, 0, 3, 3200);

    // Sand speckles.
    for (const s of game.city.sandSpecks) {
      if (!this.inView(s.x, s.y, 20)) continue;
      ctx.fillStyle = `rgba(122, 91, 54, ${s.a})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, TAU);
      ctx.fill();
    }

    // Towels and umbrellas read as tiny bright rectangles from above.
    for (let i = 0; i < 22; i += 1) {
      const x = 2568 + ((i * 37) % 120);
      const y = 120 + i * 137 + Math.sin(i) * 30;
      if (!this.inView(x, y, 40)) continue;
      ctx.fillStyle = i % 3 === 0 ? '#ff9db0' : i % 3 === 1 ? '#7ee0e6' : '#ffd166';
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.sin(i) * 0.5);
      rr(ctx, -12, -5, 24, 10, 2);
      ctx.fill();
      ctx.restore();
    }
  }

  drawBlocks(game) {
    const ctx = this.ctx;
    for (const block of game.city.blocks) {
      if (!this.inView(block.x, block.y, Math.max(block.w, block.h))) continue;
      const left = block.xMin + 2;
      const top = block.yMin + 2;
      const w = block.w - 4;
      const h = block.h - 4;
      ctx.fillStyle = PALETTE.sidewalk;
      ctx.fillRect(left, top, w, h);

      // Paving seams on the sidewalk ring.
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

      // Curb shading on the road-facing edge.
      ctx.fillStyle = 'rgba(106, 92, 72, 0.2)';
      ctx.fillRect(left, top, w, 5);
      ctx.fillRect(left, top, 5, h);

      const inner = 30;
      const ix = left + inner;
      const iy = top + inner;
      const iw = w - inner * 2;
      const ih = h - inner * 2;
      if (iw <= 0 || ih <= 0) continue;

      if (block.kind === 'park') {
        ctx.fillStyle = '#84a873';
        ctx.fillRect(ix, iy, iw, ih);
        ctx.fillStyle = 'rgba(218, 205, 172, 0.7)';
        ctx.fillRect(ix + iw / 2 - 8, iy, 16, ih);
        ctx.beginPath();
        ctx.arc(block.x, block.y, Math.min(iw, ih) * 0.28, 0, TAU);
        ctx.fillStyle = 'rgba(205, 190, 152, 0.8)';
        ctx.fill();
      } else if (block.kind === 'parking') {
        ctx.fillStyle = '#5e5a5f';
        ctx.fillRect(ix, iy, iw, ih);
        ctx.strokeStyle = 'rgba(232, 226, 208, 0.38)';
        ctx.lineWidth = 1.4;
        for (let x = ix + 12; x < ix + iw - 8; x += 28) {
          ctx.beginPath();
          ctx.moveTo(x, iy + 8);
          ctx.lineTo(x, iy + ih - 8);
          ctx.stroke();
        }
      } else if (block.kind === 'plaza') {
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
      } else {
        const d = districtAt(block.x, block.y);
        ctx.fillStyle = block.lot || d.lot;
        ctx.fillRect(ix, iy, iw, ih);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.fillRect(ix, iy, iw, 3);
      }
      ctx.strokeStyle = 'rgba(90, 78, 62, 0.25)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(ix + 0.5, iy + 0.5, iw - 1, ih - 1);
    }
  }

  drawRoads(game) {
    const ctx = this.ctx;
    for (const road of game.city.roads) {
      if (road.horizontal) {
        if (road.y1 < this.view.y - 120 || road.y1 > this.view.h + 120) continue;
      } else if (road.x1 < this.view.x - 120 || road.x1 > this.view.w + 120) continue;
      const x = road.horizontal ? Math.min(road.x1, road.x2) : road.x1 - road.width / 2;
      const y = road.horizontal ? road.y1 - road.width / 2 : Math.min(road.y1, road.y2);
      const w = road.horizontal ? Math.abs(road.x2 - road.x1) : road.width;
      const h = road.horizontal ? road.width : Math.abs(road.y2 - road.y1);
      const grad = road.horizontal
        ? ctx.createLinearGradient(0, y, 0, y + h)
        : ctx.createLinearGradient(x, 0, x + w, 0);
      grad.addColorStop(0, '#57515a');
      grad.addColorStop(0.5, '#4b454e');
      grad.addColorStop(1, '#56505a');
      ctx.fillStyle = grad;
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = 'rgba(236, 225, 198, 0.14)';
      if (road.horizontal) {
        ctx.fillRect(x, y, w, 2);
        ctx.fillRect(x, y + h - 2, w, 2);
      } else {
        ctx.fillRect(x, y, 2, h);
        ctx.fillRect(x + w - 2, y, 2, h);
      }
      // Tar repair streaks.
      ctx.strokeStyle = 'rgba(38, 34, 40, 0.4)';
      ctx.lineWidth = 3;
      for (let i = 0; i < 3; i += 1) {
        const seed = (road.horizontal ? road.x1 + i * 811 : road.y1 + i * 977) % 300;
        ctx.beginPath();
        if (road.horizontal) {
          const sx = x + ((seed * 7 + i * 311) % Math.max(1, w));
          ctx.moveTo(sx, y + 10 + i * 10);
          ctx.lineTo(sx + 90, y + 18 + i * 12);
        } else {
          const sy = y + ((seed * 7 + i * 311) % Math.max(1, h));
          ctx.moveTo(x + 10 + i * 10, sy);
          ctx.lineTo(x + 18 + i * 12, sy + 90);
        }
        ctx.stroke();
      }
    }

    // Intersection pads cover the joins cleanly.
    for (const inter of game.city.intersections) {
      if (!this.inView(inter.x, inter.y, 120)) continue;
      const w = Math.max(inter.hWidth, inter.vWidth);
      ctx.fillStyle = '#4b454e';
      ctx.fillRect(inter.x - inter.vWidth / 2, inter.y - inter.hWidth / 2, inter.vWidth, inter.hWidth);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
      ctx.fillRect(inter.x - inter.vWidth / 2, inter.y - inter.hWidth / 2, inter.vWidth, 2);
      void w;
    }
  }

  drawRoadMarkings(game) {
    const ctx = this.ctx;
    const cache = this.getMarkingCache(game.city);
    // Dashed lane paint, precomputed once per city and culled each frame.
    for (const dash of cache.dashes) {
      if (!this.inView(dash.x, dash.y, 30)) continue;
      ctx.fillStyle = dash.yellow ? 'rgba(236, 195, 78, 0.78)' : 'rgba(240, 238, 228, 0.52)';
      ctx.fillRect(dash.x - dash.w / 2, dash.y - dash.h / 2, dash.w, dash.h);
    }

    // Crosswalks and stop bars at visible intersections.
    for (const inter of game.city.intersections) {
      if (!this.inView(inter.x, inter.y, 160)) continue;
      this.drawCrosswalk(inter, 'north');
      this.drawCrosswalk(inter, 'south');
      this.drawCrosswalk(inter, 'west');
      this.drawCrosswalk(inter, 'east');
    }
  }

  drawTrafficLights(game) {
    const ctx = this.ctx;
    const green = 'rgba(84, 240, 139, 0.16)';
    const red = 'rgba(255, 79, 97, 0.16)';
    for (const light of game.city.trafficLights) {
      if (!this.inView(light.x, light.y, 40)) continue;
      const isGreen = light.state === 'green';
      const x = light.x;
      const y = light.y;
      ctx.fillStyle = 'rgba(16, 14, 20, 0.28)';
      ctx.beginPath();
      ctx.ellipse(x + 5, y + 6, 5, 3, 0.5, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#33303a';
      ctx.fillRect(x - 2, y - 2, 4, 18);
      ctx.fillStyle = '#202027';
      rr(ctx, x - 5, y - 12, 10, 14, 3);
      ctx.fill();
      ctx.fillStyle = isGreen ? '#54f08b' : '#ff4f61';
      ctx.beginPath();
      ctx.arc(x, isGreen ? y - 5 : y - 9, 2.6, 0, TAU);
      ctx.fill();
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = isGreen ? green : red;
      ctx.beginPath();
      ctx.arc(x, isGreen ? y - 5 : y - 9, 12, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }

  getMarkingCache(city) {
    if (this.markingCity === city) return this.markingCache;
    const dashes = [];
    for (const road of city.roads) {
      const major = road.lanes >= 4;
      const x0 = Math.min(road.x1, road.x2);
      const x1 = Math.max(road.x1, road.x2);
      const y0 = Math.min(road.y1, road.y2);
      const y1 = Math.max(road.y1, road.y2);
      if (road.horizontal) {
        const step = major ? 44 : 38;
        const dashLen = major ? 26 : 17;
        for (let x = x0 + 20; x < x1; x += step) {
          if (city.nearIntersection(x, road.y1, 82)) continue;
          if (major) {
            for (const off of [-2.4, 2.4]) dashes.push({ x, y: road.y1 + off, w: dashLen, h: 2.2, yellow: true });
            for (const off of [-road.width / 4, road.width / 4]) dashes.push({ x, y: road.y1 + off, w: 18, h: 1.8, yellow: false });
          } else {
            dashes.push({ x, y: road.y1, w: 16, h: 2, yellow: false });
          }
        }
      } else {
        const step = major ? 44 : 38;
        const dashLen = major ? 26 : 17;
        for (let y = y0 + 20; y < y1; y += step) {
          if (city.nearIntersection(road.x1, y, 82)) continue;
          if (major) {
            for (const off of [-2.4, 2.4]) dashes.push({ x: road.x1 + off, y, w: 2.2, h: dashLen, yellow: true });
            for (const off of [-road.width / 4, road.width / 4]) dashes.push({ x: road.x1 + off, y, w: 1.8, h: 18, yellow: false });
          } else {
            dashes.push({ x: road.x1, y, w: 2, h: 16, yellow: false });
          }
        }
      }
    }
    this.markingCity = city;
    this.markingCache = { dashes };
    return this.markingCache;
  }

  drawCrosswalk(inter, side) {
    const ctx = this.ctx;
    const w = inter.vWidth;
    const h = inter.hWidth;
    const stripe = 'rgba(236, 231, 218, 0.72)';
    ctx.save();
    ctx.fillStyle = stripe;
    if (side === 'north' || side === 'south') {
      const y = side === 'north' ? inter.y - h / 2 - 34 : inter.y + h / 2 + 8;
      for (let i = 0; i < 7; i += 1) {
        ctx.fillRect(inter.x - w / 2 + 8 + i * ((w - 16) / 7), y, (w - 16) / 7 - 4, 24);
      }
      ctx.fillStyle = 'rgba(236, 231, 218, 0.5)';
      const sy = side === 'north' ? inter.y - h / 2 - 42 : inter.y + h / 2 + 38;
      ctx.fillRect(inter.x - w / 2 + 6, sy, w - 12, 3);
    } else {
      const x = side === 'west' ? inter.x - w / 2 - 34 : inter.x + w / 2 + 8;
      for (let i = 0; i < 7; i += 1) {
        ctx.fillRect(x, inter.y - h / 2 + 8 + i * ((h - 16) / 7), 24, (h - 16) / 7 - 4);
      }
      ctx.fillStyle = 'rgba(236, 231, 218, 0.5)';
      const sx = side === 'west' ? inter.x - w / 2 - 42 : inter.x + w / 2 + 38;
      ctx.fillRect(sx, inter.y - h / 2 + 6, 3, h - 12);
    }
    ctx.restore();
  }

  drawSkidMarks(game) {
    const ctx = this.ctx;
    for (const skid of game.city.skidMarks) {
      if (!this.inView(skid.x, skid.y, 20)) continue;
      const fade = Math.min(1, skid.alpha * (1 - skid.age / 18));
      if (fade <= 0.02) continue;
      ctx.save();
      ctx.translate(skid.x, skid.y);
      ctx.rotate(skid.angle);
      ctx.fillStyle = `rgba(24, 21, 26, ${fade * 0.6})`;
      rr(ctx, -5, -1.6, 10, 3.2, 1.6);
      ctx.fill();
      ctx.restore();
    }
  }

  drawProps(game) {
    const ctx = this.ctx;
    for (const p of game.city.props) {
      if (!this.inView(p.x, p.y, 90)) continue;
      if (p.type === 'bench') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.fillStyle = 'rgba(37, 29, 22, 0.24)';
        ctx.fillRect(-16, 5, 32, 6);
        ctx.fillStyle = '#9a6c45';
        rr(ctx, -17, -5, 34, 10, 2);
        ctx.fill();
        ctx.fillStyle = '#6d4b30';
        ctx.fillRect(-15, -1, 30, 2);
        ctx.restore();
      } else if (p.type === 'umbrella') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.fillStyle = 'rgba(30, 30, 30, 0.16)';
        ctx.beginPath();
        ctx.ellipse(6, 8, 20, 8, 0.3, 0, TAU);
        ctx.fill();
        ctx.fillStyle = p.color || '#ff7f9e';
        ctx.beginPath();
        ctx.arc(0, 0, 17, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.55)';
        ctx.lineWidth = 1.2;
        for (let i = 0; i < 6; i += 1) {
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(Math.cos((i / 6) * TAU) * 17, Math.sin((i / 6) * TAU) * 17);
          ctx.stroke();
        }
        ctx.fillStyle = '#f4e9d8';
        ctx.beginPath();
        ctx.arc(0, 0, 3, 0, TAU);
        ctx.fill();
        ctx.restore();
      } else if (p.type === 'crate') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.fillStyle = 'rgba(30, 24, 18, 0.2)';
        ctx.fillRect(-8, 5, 20, 10);
        ctx.fillStyle = '#8c6a45';
        ctx.fillRect(-10, -9, 20, 19);
        ctx.strokeStyle = 'rgba(60, 42, 26, 0.45)';
        ctx.strokeRect(-10, -9, 20, 19);
        ctx.restore();
      } else if (p.type === 'dumpster') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.fillStyle = 'rgba(30, 30, 30, 0.2)';
        ctx.fillRect(-15, 8, 34, 10);
        ctx.fillStyle = '#3f6b57';
        rr(ctx, -17, -10, 34, 20, 3);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.fillRect(-14, -7, 28, 4);
        ctx.restore();
      } else if (p.type === 'planter') {
        ctx.fillStyle = '#8b7a63';
        ctx.fillRect(p.x - 9, p.y - 9, 18, 18);
        ctx.fillStyle = '#5f8a58';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 8, 0, TAU);
        ctx.fill();
      } else if (p.type === 'newsbox') {
        ctx.fillStyle = '#c14d4a';
        ctx.fillRect(p.x - 6, p.y - 8, 12, 16);
        ctx.fillStyle = '#f3e7d0';
        ctx.fillRect(p.x - 4, p.y - 5, 8, 7);
      } else if (p.type === 'fountain') {
        const t = game.worldTime;
        ctx.fillStyle = '#c5bca9';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#3f97a6';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r - 8, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = 'rgba(205, 246, 246, 0.7)';
        ctx.lineWidth = 2;
        for (let i = 0; i < 4; i += 1) {
          const a = t * 0.7 + i * 1.6;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 14 + i * 5 + Math.sin(t + i) * 2, a, a + 1.3);
          ctx.stroke();
        }
        ctx.fillStyle = '#e9e2d1';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 6, 0, TAU);
        ctx.fill();
      } else if (p.type === 'valetSign') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.fillStyle = 'rgba(25, 20, 24, 0.2)';
        ctx.fillRect(-14, 13, 34, 8);
        ctx.fillStyle = '#f4efe4';
        ctx.fillRect(-18, -18, 36, 30);
        ctx.fillStyle = '#2e2b36';
        ctx.font = 'bold 8px "Segoe UI", Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('VALET', 0, -4);
        ctx.fillStyle = '#ffb45c';
        ctx.fillRect(-18, -18, 36, 5);
        ctx.fillStyle = '#6b6155';
        ctx.fillRect(-2, 12, 4, 12);
        ctx.restore();
      }
    }
  }

  drawBuildings(game) {
    const ctx = this.ctx;
    const list = game.city.buildings.filter((b) => this.inView(b.x, b.y, Math.max(b.w, b.h) + 60));
    list.sort((a, b) => a.y + a.h / 2 - (b.y + b.h / 2));
    for (const b of list) this.drawBuilding(b, game);
  }

  drawBuilding(b, game) {
    const ctx = this.ctx;
    const lift = Math.min(28, 6 + b.height * 0.22);
    const left = b.x - b.w / 2;
    const top = b.y - b.h / 2;
    const roofX = left - lift * 0.25;
    const roofY = top - lift * 0.8;

    // Long afternoon shadow to the south-east.
    ctx.fillStyle = 'rgba(34, 25, 38, 0.22)';
    rr(ctx, left + lift * 0.55 + 4, top + lift * 0.8 + 4, b.w, b.h, 2);
    ctx.fill();

    // Facade / extruded sides.
    ctx.fillStyle = this.shade(b.color, -0.34);
    ctx.beginPath();
    ctx.moveTo(left, top + b.h);
    ctx.lineTo(roofX, roofY + b.h);
    ctx.lineTo(roofX + b.w, roofY + b.h);
    ctx.lineTo(left + b.w, top + b.h);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = this.shade(b.color, -0.48);
    ctx.beginPath();
    ctx.moveTo(left + b.w, top);
    ctx.lineTo(roofX + b.w, roofY);
    ctx.lineTo(roofX + b.w, roofY + b.h);
    ctx.lineTo(left + b.w, top + b.h);
    ctx.closePath();
    ctx.fill();

    // Facade windows.
    if (b.windows) {
      const cols = b.windows;
      const rows = Math.max(2, Math.floor(b.height / 14));
      ctx.fillStyle = 'rgba(255, 214, 150, 0.5)';
      const stepX = b.w / (cols + 1);
      const stepY = b.h / (rows + 1);
      for (let r = 0; r < rows; r += 1) {
        for (let c = 0; c < cols; c += 1) {
          const wx = left + stepX * (c + 1) - 3;
          const wy = top + stepY * (r + 1) - 1;
          ctx.fillRect(wx, wy, 5, 3);
        }
      }
    }

    // Roof.
    const roofGrad = ctx.createLinearGradient(roofX, roofY, roofX + b.w, roofY + b.h);
    roofGrad.addColorStop(0, this.shade(b.roofColor, 0.16));
    roofGrad.addColorStop(1, this.shade(b.roofColor, -0.06));
    ctx.fillStyle = roofGrad;
    rr(ctx, roofX, roofY, b.w, b.h, b.type === 'container' ? 1 : 2.5);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 240, 210, 0.2)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Parapet and roof shading.
    ctx.strokeStyle = this.shade(b.roofColor, 0.3);
    ctx.lineWidth = 2;
    ctx.strokeRect(roofX + 3, roofY + 3, b.w - 6, b.h - 6);
    ctx.fillStyle = 'rgba(18, 14, 22, 0.14)';
    ctx.fillRect(roofX + b.w * 0.62, roofY + 4, b.w * 0.34, b.h * 0.3);

    if (b.type === 'container') {
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 1;
      for (let x = roofX + 4; x < roofX + b.w - 3; x += 5) {
        ctx.beginPath();
        ctx.moveTo(x, roofY + 2);
        ctx.lineTo(x, roofY + b.h - 2);
        ctx.stroke();
      }
    } else if (b.type === 'house') {
      ctx.fillStyle = 'rgba(120, 40, 30, 0.22)';
      ctx.fillRect(roofX + 4, roofY + 4, b.w - 8, b.h - 8);
      ctx.strokeStyle = 'rgba(255, 230, 200, 0.22)';
      ctx.beginPath();
      ctx.moveTo(roofX + b.w / 2, roofY + 4);
      ctx.lineTo(roofX + b.w / 2, roofY + b.h - 4);
      ctx.stroke();
      if (b.hasPool) {
        ctx.fillStyle = '#4fc3cf';
        ctx.beginPath();
        ctx.ellipse(roofX + b.w + 20, roofY + b.h / 2, 15, 9, 0, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = 'rgba(240, 250, 245, 0.5)';
        ctx.stroke();
      }
    } else if (b.hasHelipad) {
      ctx.strokeStyle = 'rgba(245, 240, 225, 0.6)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(roofX + b.w - 26, roofY + b.h - 26, 14, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = 'rgba(245, 240, 225, 0.65)';
      ctx.font = 'bold 10px "Segoe UI", Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('H', roofX + b.w - 26, roofY + b.h - 22);
    }

    if (b.type === 'warehouse') {
      ctx.strokeStyle = 'rgba(0,0,0,0.22)';
      ctx.lineWidth = 1;
      for (let x = roofX + 8; x < roofX + b.w - 8; x += 14) {
        ctx.beginPath();
        ctx.moveTo(x, roofY + 3);
        ctx.lineTo(x, roofY + b.h - 3);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(220, 225, 225, 0.16)';
      ctx.fillRect(roofX + b.w * 0.1, roofY + b.h * 0.2, b.w * 0.3, b.h * 0.16);
    }

    if (b.type === 'tower') {
      // Raised roof panel, mechanical boxes and a hint of rooftop life.
      ctx.strokeStyle = b.glass ? 'rgba(158, 230, 240, 0.28)' : 'rgba(255, 244, 220, 0.3)';
      ctx.lineWidth = 1.4;
      ctx.strokeRect(roofX + 8.5, roofY + 8.5, b.w - 17, b.h - 17);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.07)';
      ctx.fillRect(roofX + 12, roofY + 12, b.w - 24, 5);
      ctx.fillStyle = 'rgba(26, 22, 32, 0.28)';
      ctx.fillRect(roofX + b.w * 0.58, roofY + b.h * 0.6, 26, 19);
      ctx.fillStyle = 'rgba(218, 226, 226, 0.32)';
      ctx.fillRect(roofX + b.w * 0.58 + 2, roofY + b.h * 0.6 + 2, 22, 4);
      ctx.fillStyle = 'rgba(255, 214, 140, 0.3)';
      ctx.fillRect(roofX + b.w * 0.18, roofY + b.h * 0.72, 12, 8);
      if (b.glass) {
        ctx.fillStyle = 'rgba(144, 226, 240, 0.16)';
        ctx.fillRect(roofX + 14, roofY + b.h * 0.36, b.w * 0.24, b.h * 0.2);
        ctx.strokeStyle = 'rgba(144, 226, 240, 0.28)';
        ctx.strokeRect(roofX + 14, roofY + b.h * 0.36, b.w * 0.24, b.h * 0.2);
      }
      if (b.hasRoofPool) {
        ctx.fillStyle = '#4fc3cf';
        rr(ctx, roofX + b.w * 0.62, roofY + 16, b.w * 0.24, b.h * 0.2, 3);
        ctx.fill();
        ctx.strokeStyle = 'rgba(240, 252, 250, 0.5)';
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
    }

    // A rooftop AC unit or two.
    if (b.type !== 'container' && b.type !== 'house') {
      ctx.fillStyle = 'rgba(70, 72, 76, 0.75)';
      const acx = roofX + b.w * 0.2;
      const acy = roofY + b.h * 0.22;
      ctx.fillRect(acx, acy, 14, 10);
      ctx.fillStyle = 'rgba(210, 210, 205, 0.35)';
      ctx.fillRect(acx + 2, acy + 2, 10, 2);
    }

    // Neon roof sign.
    if (b.neonText) {
      const neon = b.neonColor || '#ff7f9e';
      const fontSize = b.type === 'landmark' ? 9 : 7;
      ctx.save();
      ctx.font = `800 ${fontSize}px "Segoe UI", Arial, sans-serif`;
      const textW = ctx.measureText(b.neonText).width;
      const px = roofX + b.w / 2;
      const py = roofY + (b.type === 'landmark' ? b.h * 0.28 : 14);
      ctx.fillStyle = 'rgba(22, 18, 28, 0.82)';
      rr(ctx, px - textW / 2 - 6, py - fontSize + 1, textW + 12, fontSize + 8, 2);
      ctx.fill();
      ctx.shadowColor = neon;
      ctx.shadowBlur = 12;
      ctx.fillStyle = neon;
      ctx.textAlign = 'center';
      ctx.fillText(b.neonText, px, py + 1);
      ctx.shadowBlur = 0;
      ctx.restore();
    }

    if (b.awning) {
      ctx.fillStyle = '#e26d75';
      ctx.fillRect(roofX + 6, roofY + b.h - 3, b.w - 12, 3);
    }

    // Landmark glow ring.
    if (b.type === 'landmark') {
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 214, 120, 0.28)';
      ctx.lineWidth = 1.4;
      ctx.setLineDash([5, 6]);
      ctx.strokeRect(roofX - 3, roofY - 3, b.w + 6, b.h + 6);
      ctx.restore();
    }
    void game;
  }

  drawPalms(game) {
    const ctx = this.ctx;
    const time = game.worldTime;
    for (const palm of game.city.palmTrees) {
      if (!this.inView(palm.x, palm.y, 60)) continue;
      const s = palm.size / 22;
      ctx.save();
      ctx.translate(palm.x, palm.y);
      // Shadow.
      ctx.fillStyle = 'rgba(28, 24, 20, 0.2)';
      ctx.beginPath();
      ctx.ellipse(10 * s, 15 * s, 20 * s, 7 * s, 0.5, 0, TAU);
      ctx.fill();
      // Trunk.
      ctx.strokeStyle = '#8a623f';
      ctx.lineWidth = 4 * s;
      ctx.beginPath();
      ctx.moveTo(0, 8 * s);
      ctx.quadraticCurveTo(-2 * s, -8 * s, 3 * s, -18 * s);
      ctx.stroke();
      // Fronds: curved, drooping and feathered.
      const sway = Math.sin(time * 0.7 + palm.x * 0.01) * 0.1;
      for (let i = 0; i < 8; i += 1) {
        const a = (i / 8) * TAU + sway;
        const len = (22 + (i % 3) * 4) * s;
        const droop = 7 * s;
        const tipX = 3 * s + Math.cos(a) * len;
        const tipY = -17 * s + Math.sin(a) * (len * 0.55) + droop;
        const ctrlX = 3 * s + Math.cos(a) * len * 0.55;
        const ctrlY = -20 * s + Math.sin(a) * len * 0.34;
        ctx.strokeStyle = i % 2 === 0 ? '#3c7c4a' : '#4f935c';
        ctx.lineWidth = 2.6 * s;
        ctx.beginPath();
        ctx.moveTo(3 * s, -17 * s);
        ctx.quadraticCurveTo(ctrlX, ctrlY, tipX, tipY);
        ctx.stroke();
        // Leaflets along the spine.
        ctx.strokeStyle = 'rgba(166, 212, 146, 0.5)';
        ctx.lineWidth = 1.1 * s;
        for (let k = 0.45; k <= 0.92; k += 0.16) {
          const px = 3 * s + (tipX - 3 * s) * k;
          const py = -17 * s + (tipY + 17 * s) * k + Math.sin(k * 3) * 1.2;
          const leaf = 4.2 * s * (1 - k * 0.3);
          const da = a + Math.PI / 2;
          ctx.beginPath();
          ctx.moveTo(px - Math.cos(da) * leaf, py - Math.sin(da) * leaf);
          ctx.lineTo(px + Math.cos(da) * leaf, py + Math.sin(da) * leaf);
          ctx.stroke();
        }
      }
      ctx.fillStyle = '#2e623d';
      ctx.beginPath();
      ctx.arc(3 * s, -17 * s, 3.4 * s, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }

  drawStreetLights(game) {
    const ctx = this.ctx;
    const night = Math.max(0, (game.timeOfDay - 0.5) / 0.5);
    for (const light of game.city.streetlights) {
      if (!this.inView(light.x, light.y, 80)) continue;
      ctx.save();
      ctx.translate(light.x, light.y);
      ctx.fillStyle = 'rgba(30, 26, 22, 0.18)';
      ctx.beginPath();
      ctx.ellipse(5, 8, 9, 4, 0.4, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#3c3940';
      ctx.fillRect(-1.4, -14, 2.8, 26);
      ctx.fillStyle = '#5a555d';
      ctx.fillRect(-1.4, -14, 2.8, 3);
      ctx.fillStyle = '#222027';
      rr(ctx, -5.5, -20, 11, 7, 2);
      ctx.fill();
      ctx.fillStyle = `rgba(255, 225, 168, ${0.55 + night * 0.4})`;
      ctx.beginPath();
      ctx.arc(0, -16, 3.2, 0, TAU);
      ctx.fill();
      ctx.globalCompositeOperation = 'lighter';
      const glow = ctx.createRadialGradient(0, -16, 2, 0, -16, light.radius * 0.55);
      glow.addColorStop(0, `rgba(255, 226, 164, ${0.2 + night * 0.22})`);
      glow.addColorStop(1, 'rgba(255, 226, 164, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(0, -16, light.radius * 0.55, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }

  drawGroundDecals(game) {
    const ctx = this.ctx;
    for (const d of game.particles.bloodDecals) {
      if (!this.inView(d.x, d.y, 30)) continue;
      ctx.fillStyle = `rgba(102, 16, 24, ${Math.max(0, d.alpha) * 0.55})`;
      ctx.beginPath();
      ctx.ellipse(d.x, d.y, d.r, d.r * 0.6, 0, 0, TAU);
      ctx.fill();
    }
    for (const c of game.particles.cashPickups) {
      if (!this.inView(c.x, c.y, 30)) continue;
      const bob = Math.sin(c.bob) * 2;
      ctx.save();
      ctx.translate(c.x, c.y + bob);
      ctx.fillStyle = 'rgba(20, 50, 32, 0.25)';
      ctx.beginPath();
      ctx.ellipse(0, 8, 9, 4, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#5ecf83';
      rr(ctx, -8, -6, 16, 12, 2);
      ctx.fill();
      ctx.fillStyle = '#e9fff0';
      ctx.font = 'bold 8px "Segoe UI", Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('$', 0, 3);
      ctx.restore();
    }
  }

  drawPickups(game) {
    const ctx = this.ctx;
    for (const p of game.pickups.pickups) {
      if (!p.active || !this.inView(p.x, p.y, 40)) continue;
      const bob = Math.sin(p.bob) * 2;
      ctx.save();
      ctx.translate(p.x, p.y + bob);
      ctx.globalCompositeOperation = 'lighter';
      const glow = ctx.createRadialGradient(0, 0, 2, 0, 0, 24);
      glow.addColorStop(0, `${p.def.color}66`);
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(0, 0, 24, 0, TAU);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = p.def.color;
      if (p.type === 'health' || p.type === 'armor') {
        rr(ctx, -7, -7, 14, 14, 3);
        ctx.fill();
        ctx.fillStyle = '#1b1a22';
        if (p.type === 'health') {
          ctx.fillRect(-1.6, -4, 3.2, 8);
          ctx.fillRect(-4, -1.6, 8, 3.2);
        } else {
          ctx.beginPath();
          ctx.moveTo(0, -4.5);
          ctx.lineTo(4.5, 0);
          ctx.lineTo(0, 4.5);
          ctx.lineTo(-4.5, 0);
          ctx.closePath();
          ctx.fill();
        }
      } else {
        ctx.fillRect(-7, -4, 14, 8);
        ctx.fillStyle = '#2a2630';
        ctx.fillRect(-4, -2, 8, 4);
      }
      ctx.restore();
    }
  }

  drawMissionMarkers(game, above) {
    const ctx = this.ctx;
    const marker = game.missions.currentTarget() || game.missions.availableMarker();
    if (!marker) return;
    if (!this.inView(marker.x, marker.y, 100)) return;
    if (!above) {
      // Ground disc with a pulsing ring.
      const pulse = 0.5 + Math.sin(game.worldTime * 3) * 0.5;
      ctx.save();
      ctx.fillStyle = 'rgba(255, 209, 102, 0.12)';
      ctx.beginPath();
      ctx.arc(marker.x, marker.y, 30 + pulse * 6, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = `rgba(255, 209, 102, ${0.5 + pulse * 0.3})`;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 7]);
      ctx.beginPath();
      ctx.arc(marker.x, marker.y, 32 + pulse * 5, game.worldTime, game.worldTime + TAU);
      ctx.stroke();
      ctx.restore();
    } else {
      // Beam and floating diamond.
      const pulse = 0.5 + Math.sin(game.worldTime * 3.2) * 0.5;
      const height = 58 + pulse * 8;
      ctx.save();
      const grad = ctx.createLinearGradient(0, marker.y - height, 0, marker.y);
      grad.addColorStop(0, 'rgba(255, 209, 102, 0)');
      grad.addColorStop(0.7, 'rgba(255, 209, 102, 0.24)');
      grad.addColorStop(1, 'rgba(255, 209, 102, 0.5)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(marker.x - 9, marker.y - height);
      ctx.lineTo(marker.x - 2, marker.y);
      ctx.lineTo(marker.x + 2, marker.y);
      ctx.lineTo(marker.x + 9, marker.y - height);
      ctx.closePath();
      ctx.fill();
      ctx.translate(marker.x, marker.y - height - 12);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = '#ffd166';
      ctx.shadowColor = '#ffd166';
      ctx.shadowBlur = 14;
      ctx.fillRect(-8, -8, 16, 16);
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#2c2434';
      ctx.fillRect(-3.5, -3.5, 7, 7);
      ctx.restore();
    }
  }

  drawEntityShadows(game) {
    const ctx = this.ctx;
    ctx.save();
    for (const v of game.allVehicles()) {
      if (!this.inView(v.x, v.y, 90) || v.isDestroyed) continue;
      if (v === game.player.vehicle) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const glow = ctx.createRadialGradient(v.x, v.y, 4, v.x, v.y, 48);
        glow.addColorStop(0, 'rgba(120, 244, 244, 0.3)');
        glow.addColorStop(1, 'rgba(120, 244, 244, 0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.ellipse(v.x, v.y, 52, 37, v.angle, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
      ctx.save();
      ctx.translate(v.x + 7, v.y + 9);
      ctx.rotate(v.angle);
      ctx.fillStyle = 'rgba(26, 20, 30, 0.24)';
      rr(ctx, -v.length / 2, -v.width / 2, v.length, v.width, 6);
      ctx.fill();
      ctx.restore();
    }
    const actors = [...game.combat.pedestrians, ...game.combat.enemies, ...game.police.footCops];
    if (!game.player.isInVehicle) actors.push(game.player);
    for (const a of actors) {
      if (a.isDead || !this.inView(a.x, a.y, 40)) continue;
      ctx.fillStyle = 'rgba(26, 20, 30, 0.22)';
      ctx.beginPath();
      ctx.ellipse(a.x + 4, a.y + 7, 10, 5.5, 0.3, 0, TAU);
      ctx.fill();
    }
    if (!game.player.isInVehicle && game.player.health > 0 && this.inView(game.player.x, game.player.y, 40)) {
      ctx.strokeStyle = 'rgba(122, 238, 238, 0.38)';
      ctx.lineWidth = 1.4;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.arc(game.player.x, game.player.y + 2, 21, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
  }

  drawEntities(game) {
    const drawables = [];
    for (const v of game.allVehicles()) {
      if (!this.inView(v.x, v.y, 90)) continue;
      drawables.push({ y: v.y, kind: 'vehicle', ref: v });
    }
    for (const p of game.combat.pedestrians) {
      if (!this.inView(p.x, p.y, 50)) continue;
      drawables.push({ y: p.y, kind: 'ped', ref: p });
    }
    for (const e of game.combat.enemies) {
      if (!this.inView(e.x, e.y, 50)) continue;
      drawables.push({ y: e.y, kind: 'enemy', ref: e });
    }
    for (const c of game.police.footCops) {
      if (!this.inView(c.x, c.y, 50)) continue;
      drawables.push({ y: c.y, kind: 'cop', ref: c });
    }
    if (!game.player.isInVehicle) drawables.push({ y: game.player.y, kind: 'player', ref: game.player });
    drawables.sort((a, b) => a.y - b.y);
    for (const d of drawables) {
      if (d.kind === 'vehicle') this.drawVehicle(d.ref, game);
      else if (d.kind === 'ped') this.drawPedestrian(d.ref);
      else if (d.kind === 'enemy') this.drawEnemy(d.ref);
      else if (d.kind === 'cop') this.drawCop(d.ref);
      else this.drawPlayer(d.ref, game);
    }
  }

  drawVehicle(v, game) {
    const ctx = this.ctx;
    const w = v.width;
    const l = v.length;
    ctx.save();
    ctx.translate(v.x, v.y);
    ctx.rotate(v.angle);

    // Body.
    const bodyGrad = ctx.createLinearGradient(0, -w / 2, 0, w / 2);
    bodyGrad.addColorStop(0, this.shade(v.color, 0.22));
    bodyGrad.addColorStop(0.55, v.color);
    bodyGrad.addColorStop(1, this.shade(v.color, -0.28));
    ctx.fillStyle = bodyGrad;
    rr(ctx, -l / 2, -w / 2, l, w, Math.min(7, w * 0.28));
    ctx.fill();
    ctx.strokeStyle = 'rgba(20, 16, 24, 0.4)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // Tyres.
    ctx.fillStyle = '#1b1a20';
    const wheelX = l * 0.3;
    const wheelY = w / 2 - 1.5;
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        rr(ctx, sx * wheelX - 4, sy * wheelY - 3, 8, 5, 1.5);
        ctx.fill();
      }
    }

    // Roof / cabin and glass.
    ctx.fillStyle = this.shade(v.color, -0.4);
    rr(ctx, -l * 0.16, -w * 0.33, l * 0.36, w * 0.66, 3);
    ctx.fill();
    ctx.fillStyle = 'rgba(164, 219, 229, 0.72)';
    rr(ctx, -l * 0.11, -w * 0.27, l * 0.18, w * 0.54, 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(40, 48, 58, 0.5)';
    rr(ctx, l * 0.1, -w * 0.25, l * 0.08, w * 0.5, 1.5);
    ctx.fill();

    // Racing stripe.
    if (v.config.stripe) {
      ctx.fillStyle = 'rgba(245, 240, 225, 0.85)';
      ctx.fillRect(-l * 0.4, -w * 0.14, l * 0.7, w * 0.08);
      ctx.fillRect(-l * 0.4, w * 0.06, l * 0.7, w * 0.08);
    }

    // Headlights and tail lights.
    ctx.fillStyle = 'rgba(255, 240, 185, 0.95)';
    rr(ctx, l / 2 - 4, -w * 0.36, 3, 5, 1);
    ctx.fill();
    rr(ctx, l / 2 - 4, w * 0.25, 3, 5, 1);
    ctx.fill();
    ctx.fillStyle = v.brakeLightsOn ? 'rgba(255, 70, 80, 1)' : 'rgba(190, 46, 54, 0.8)';
    rr(ctx, -l / 2 + 1, -w * 0.35, 2.4, 4.5, 1);
    ctx.fill();
    rr(ctx, -l / 2 + 1, w * 0.25, 2.4, 4.5, 1);
    ctx.fill();

    if (v.isPolice) this.drawPoliceLivery(v, l, w, game);
    if (v.isDestroyed) {
      ctx.fillStyle = 'rgba(22, 20, 24, 0.7)';
      rr(ctx, -l / 2, -w / 2, l, w, 5);
      ctx.fill();
      ctx.fillStyle = 'rgba(120, 100, 84, 0.5)';
      ctx.fillRect(-l * 0.2, -w * 0.2, l * 0.3, w * 0.4);
    } else if (v.hp < v.maxHp * 0.55) {
      ctx.fillStyle = 'rgba(38, 32, 36, 0.35)';
      ctx.beginPath();
      ctx.ellipse(-l * 0.2, w * 0.18, 8, 4, 0.4, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  drawPoliceLivery(v, l, w, game) {
    const ctx = this.ctx;
    ctx.fillStyle = '#1d2f52';
    ctx.fillRect(-l * 0.34, -w / 2 + 2, l * 0.6, 4);
    ctx.fillRect(-l * 0.34, w / 2 - 6, l * 0.6, 4);
    ctx.fillStyle = '#f3d34a';
    ctx.fillRect(-l * 0.06, -w / 2 + 2, 8, 4);
    ctx.fillRect(-l * 0.06, w / 2 - 6, 8, 4);
    // Light bar.
    const flash = v.sirenPhase;
    ctx.fillStyle = flash ? '#ff4a5e' : '#3f6fff';
    rr(ctx, -4 + l * 0.04, -w * 0.24, 5, w * 0.48, 2);
    ctx.fill();
    ctx.fillStyle = flash ? '#3f6fff' : '#ff4a5e';
    rr(ctx, -10 + l * 0.04, -w * 0.24, 5, w * 0.48, 2);
    ctx.fill();
    if (v.sirenActive) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = flash ? 'rgba(255, 74, 94, 0.18)' : 'rgba(63, 111, 255, 0.18)';
      ctx.beginPath();
      ctx.arc(l * 0.04, 0, 34, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
    void game;
  }

  drawPedestrian(p) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(p.x, p.y);
    if (p.isDead) {
      ctx.rotate(p.deadAngle);
      ctx.fillStyle = 'rgba(50, 40, 44, 0.55)';
      ctx.beginPath();
      ctx.ellipse(0, 0, 15, 9, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = p.shirt;
      rr(ctx, -12, -5, 24, 10, 4);
      ctx.fill();
      ctx.fillStyle = p.skin;
      ctx.beginPath();
      ctx.arc(-12, 0, 5, 0, TAU);
      ctx.fill();
      ctx.restore();
      return;
    }
    ctx.rotate(p.angle);
    const bob = Math.sin(p.bob) * 1.2;
    // Legs.
    ctx.strokeStyle = p.pants;
    ctx.lineWidth = 4.4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-2, -3);
    ctx.lineTo(-2 + bob, -8);
    ctx.moveTo(-2, 3);
    ctx.lineTo(-2 - bob, 8);
    ctx.stroke();
    // Torso.
    ctx.fillStyle = p.shirt;
    rr(ctx, -8, -6, 14, 12, 5);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(-7, -5, 2, 10);
    // Arms.
    ctx.strokeStyle = p.skin;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-1, -5);
    ctx.lineTo(3, -8 - bob * 0.4);
    ctx.moveTo(-1, 5);
    ctx.lineTo(3, 8 + bob * 0.4);
    ctx.stroke();
    // Head.
    ctx.fillStyle = p.skin;
    ctx.beginPath();
    ctx.arc(4, 0, 5, 0, TAU);
    ctx.fill();
    ctx.fillStyle = p.hair;
    ctx.beginPath();
    ctx.arc(2.6, 0, 4.8, Math.PI * 0.55, Math.PI * 1.45);
    ctx.fill();
    if (p.hat) {
      ctx.fillStyle = '#e7e1d2';
      ctx.beginPath();
      ctx.arc(3, 0, 5.6, Math.PI, TAU);
      ctx.fill();
    }
    // Bag.
    if (p.bag) {
      ctx.fillStyle = '#8e5c3a';
      rr(ctx, -6, 3, 6, 7, 2);
      ctx.fill();
    }
    // Umbrella.
    if (p.umbrella) {
      const canopy = p.shirt === '#f4f1e8' ? '#e86f8a' : '#4fbcc4';
      ctx.fillStyle = 'rgba(30, 26, 32, 0.18)';
      ctx.beginPath();
      ctx.ellipse(2, 4, 11, 5, 0.2, 0, TAU);
      ctx.fill();
      ctx.fillStyle = canopy;
      ctx.beginPath();
      ctx.arc(0, 0, 12, Math.PI, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 245, 230, 0.55)';
      ctx.lineWidth = 0.9;
      for (let i = 0; i < 3; i += 1) {
        const a = Math.PI + (i + 1) * (Math.PI / 4);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * 12, Math.sin(a) * 12);
        ctx.stroke();
      }
      ctx.strokeStyle = '#cbb9a1';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, 12);
      ctx.stroke();
    }
    if (p.hitFlash > 0) {
      ctx.fillStyle = `rgba(255, 80, 90, ${p.hitFlash * 0.5})`;
      ctx.beginPath();
      ctx.arc(0, 0, 12, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  drawEnemy(e) {
    const ctx = this.ctx;
    if (e.isDead) {
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.rotate(e.angle);
      ctx.fillStyle = 'rgba(60, 20, 26, 0.45)';
      ctx.beginPath();
      ctx.ellipse(0, 0, 16, 9, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = e.isBoss ? '#8a6a2f' : '#6b2f2d';
      rr(ctx, -12, -6, 24, 12, 4);
      ctx.fill();
      ctx.restore();
      return;
    }
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(e.angle);
    ctx.strokeStyle = '#2a2428';
    ctx.lineWidth = 4.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-2, -3);
    ctx.lineTo(-6, -7);
    ctx.moveTo(-2, 3);
    ctx.lineTo(-6, 7);
    ctx.stroke();
    ctx.fillStyle = e.isBoss ? '#d9a63e' : e.color;
    rr(ctx, -7, -6.5, 14, 13, 5);
    ctx.fill();
    ctx.fillStyle = 'rgba(245, 240, 230, 0.3)';
    ctx.fillRect(-5, -5, 3, 10);
    ctx.strokeStyle = '#2c262a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, -5);
    ctx.lineTo(8, -5);
    ctx.moveTo(0, 5);
    ctx.lineTo(8, 5);
    ctx.stroke();
    // Weapon.
    ctx.fillStyle = '#25232a';
    ctx.fillRect(6, -1.5, 11, 3);
    ctx.fillStyle = '#4b4850';
    ctx.fillRect(10, -2.6, 4, 1.6);
    // Head.
    ctx.fillStyle = e.isBoss ? '#e0c9a2' : '#d7a77e';
    ctx.beginPath();
    ctx.arc(3, 0, 5.4, 0, TAU);
    ctx.fill();
    if (e.isBoss) {
      ctx.fillStyle = '#1f1c22';
      ctx.beginPath();
      ctx.arc(2, 0, 5.6, Math.PI, TAU);
      ctx.fill();
    }
    if (e.hitFlash > 0) {
      ctx.fillStyle = `rgba(255, 245, 235, ${e.hitFlash * 0.7})`;
      ctx.beginPath();
      ctx.arc(0, 0, 13, 0, TAU);
      ctx.fill();
    }
    ctx.restore();

    // Health bar once hurt.
    if (e.health < e.maxHealth) {
      const w = e.isBoss ? 52 : 26;
      const x = e.x - w / 2;
      const y = e.y - (e.isBoss ? 34 : 22);
      ctx.fillStyle = 'rgba(18, 16, 22, 0.7)';
      ctx.fillRect(x - 1, y - 1, w + 2, 5);
      ctx.fillStyle = e.isBoss ? '#ffb44e' : '#ff5b62';
      ctx.fillRect(x, y, (e.health / e.maxHealth) * w, 3);
    }
  }

  drawCop(c) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(c.x, c.y);
    if (c.isDead) {
      ctx.rotate(0.7);
      ctx.fillStyle = 'rgba(30, 40, 60, 0.5)';
      rr(ctx, -12, -6, 24, 12, 4);
      ctx.fill();
      ctx.restore();
      return;
    }
    ctx.rotate(c.angle);
    ctx.strokeStyle = '#1e2638';
    ctx.lineWidth = 4.4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-2, -3);
    ctx.lineTo(-7, -7);
    ctx.moveTo(-2, 3);
    ctx.lineTo(-7, 7);
    ctx.stroke();
    ctx.fillStyle = '#2f4a78';
    rr(ctx, -7, -6.5, 14, 13, 5);
    ctx.fill();
    ctx.fillStyle = '#dfe8f5';
    ctx.fillRect(-3, -1.5, 5, 1.2);
    ctx.fillStyle = '#1b1c24';
    ctx.fillRect(6, -1.4, 12, 2.8);
    ctx.fillStyle = '#e0b48c';
    ctx.beginPath();
    ctx.arc(3, 0, 5.2, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#24304a';
    ctx.beginPath();
    ctx.arc(2, 0, 5.6, Math.PI * 0.5, Math.PI * 1.5);
    ctx.fill();
    ctx.fillStyle = '#dbe9ff';
    ctx.fillRect(0, -6, 8, 2);
    ctx.restore();
    if (c.hitFlash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${c.hitFlash * 0.6})`;
      ctx.beginPath();
      ctx.arc(c.x, c.y, 14, 0, TAU);
      ctx.fill();
    }
  }

  drawPlayer(p, game) {
    const ctx = this.ctx;
    if (p.health <= 0) return;
    ctx.save();
    ctx.translate(p.x, p.y);
    if (p.isRolling) {
      ctx.rotate(p.rollAngle + game.worldTime * 12);
      ctx.fillStyle = '#e4dccd';
      ctx.beginPath();
      ctx.arc(0, 0, 12, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#283449';
      ctx.beginPath();
      ctx.arc(0, 0, 12, 0, Math.PI);
      ctx.fill();
      ctx.restore();
      return;
    }
    ctx.rotate(p.angle);
    const bob = p.moving ? Math.sin(p.walkCycle) * 2.2 : 0;
    // Legs.
    ctx.strokeStyle = '#384a63';
    ctx.lineWidth = 4.8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-3, -3);
    ctx.lineTo(-3 + bob, -8);
    ctx.moveTo(-3, 3);
    ctx.lineTo(-3 - bob, 8);
    ctx.stroke();
    // Jacket / torso.
    ctx.fillStyle = '#2f8f93';
    rr(ctx, -9, -7, 15, 14, 5);
    ctx.fill();
    ctx.strokeStyle = 'rgba(236, 250, 245, 0.55)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#1d2a38';
    rr(ctx, -9, -7, 5, 14, 3);
    ctx.fill();
    // Arms and weapon.
    const w = p.weapon;
    if (w.id !== 'fists') {
      ctx.strokeStyle = '#2f8f93';
      ctx.lineWidth = 3.4;
      ctx.beginPath();
      ctx.moveTo(1, -4);
      ctx.lineTo(8, -3);
      ctx.moveTo(1, 4);
      ctx.lineTo(8, 3);
      ctx.stroke();
      ctx.fillStyle = '#24222a';
      if (w.id === 'shotgun' || w.id === 'rifle') {
        ctx.fillRect(6, -1.4, 20, 2.8);
        ctx.fillStyle = w.tint;
        ctx.fillRect(8, -1.9, 10, 1.2);
        ctx.fillStyle = '#5a3c28';
        ctx.fillRect(4, -1.6, 4, 3.4);
      } else if (w.id === 'smg') {
        ctx.fillRect(6, -1.6, 13, 3.2);
        ctx.fillRect(9, 1, 3, 5);
      } else {
        ctx.fillRect(6, -1.4, 9, 2.8);
        ctx.fillRect(7, 1, 2.4, 3.4);
      }
    } else {
      ctx.strokeStyle = '#2f8f93';
      ctx.lineWidth = 3.8;
      ctx.beginPath();
      ctx.moveTo(1, -5);
      ctx.lineTo(8, -2);
      ctx.moveTo(1, 5);
      ctx.lineTo(8, 2);
      ctx.stroke();
      ctx.fillStyle = '#d7a77e';
      ctx.beginPath();
      ctx.arc(9, -2, 2.4, 0, TAU);
      ctx.arc(9, 2, 2.4, 0, TAU);
      ctx.fill();
    }
    // Head.
    ctx.fillStyle = '#d9a77d';
    ctx.beginPath();
    ctx.arc(3, 0, 5.8, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#1f1a20';
    ctx.beginPath();
    ctx.arc(1.8, 0, 5.9, Math.PI * 0.55, Math.PI * 1.45);
    ctx.fill();
    // Muzzle flash.
    if (p.muzzleTimer > 0) {
      ctx.save();
      ctx.translate(26, 0);
      ctx.fillStyle = 'rgba(255, 225, 140, 0.9)';
      starPath(ctx, 0, 0, 9 + Math.random() * 4, 5);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
    if (p.hitFlash > 0) {
      ctx.fillStyle = `rgba(255, 90, 90, ${p.hitFlash * 0.28})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 18, 0, TAU);
      ctx.fill();
    }
    // Small cyan chevron so the hero reads apart from the crowd.
    ctx.save();
    ctx.translate(p.x, p.y - 32);
    ctx.fillStyle = 'rgba(12, 18, 24, 0.55)';
    ctx.beginPath();
    ctx.moveTo(-7, -5);
    ctx.lineTo(7, -5);
    ctx.lineTo(0, 5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#7aeeee';
    ctx.beginPath();
    ctx.moveTo(-5, -6);
    ctx.lineTo(5, -6);
    ctx.lineTo(0, 2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    if (p.hotwire) {
      const progress = 1 - p.hotwire.timer / p.hotwire.total;
      ctx.strokeStyle = 'rgba(14, 12, 18, 0.6)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(p.x, p.y - 30, 13, 0, TAU);
      ctx.stroke();
      ctx.strokeStyle = '#ffd166';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(p.x, p.y - 30, 13, -Math.PI / 2, -Math.PI / 2 + progress * TAU);
      ctx.stroke();
    }
  }

  drawBullets(game) {
    const ctx = this.ctx;
    for (const b of game.combat.bullets) {
      if (!this.inView(b.x, b.y, 60)) continue;
      const isPlayer = b.owner === 'player';
      const color = isPlayer ? 'rgba(255, 226, 130, 0.9)' : b.owner === 'cop' ? 'rgba(140, 190, 255, 0.9)' : 'rgba(255, 120, 110, 0.9)';
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = isPlayer ? 2 : 1.6;
      ctx.shadowColor = color;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.moveTo(b.px, b.py);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.fillStyle = '#fff8e8';
      ctx.beginPath();
      ctx.arc(b.x, b.y, 1.9, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }

  drawParticles(game) {
    const ctx = this.ctx;
    for (const p of game.particles.particles) {
      if (!this.inView(p.x, p.y, 80)) continue;
      const alpha = Math.max(0, Math.min(1, p.life));
      if (p.type === 'spark') {
        ctx.fillStyle = p.color;
        ctx.globalAlpha = alpha;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      } else if (p.type === 'blood_drop') {
        ctx.fillStyle = `rgba(148, 25, 33, ${alpha})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, TAU);
        ctx.fill();
      } else if (p.type === 'smoke') {
        ctx.fillStyle = p.color;
        ctx.globalAlpha = alpha * 0.55;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1.2 - alpha * 0.4), 0, TAU);
        ctx.fill();
      } else if (p.type === 'fire' || p.type === 'explosion_fire') {
        ctx.globalAlpha = alpha;
        const g = ctx.createRadialGradient(p.x, p.y, 1, p.x, p.y, p.size);
        g.addColorStop(0, '#ffe9a8');
        g.addColorStop(0.5, p.color);
        g.addColorStop(1, 'rgba(255, 70, 20, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, TAU);
        ctx.fill();
      } else if (p.type === 'shockwave') {
        ctx.strokeStyle = `rgba(255, 210, 140, ${alpha * 0.7})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, TAU);
        ctx.stroke();
      } else if (p.type === 'muzzle') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = '#ffe9a8';
        starPath(ctx, 0, 0, p.size + Math.random() * 3, 6);
        ctx.fill();
        ctx.restore();
      } else if (p.type === 'dust') {
        ctx.fillStyle = `rgba(206, 190, 164, ${alpha * 0.4})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, TAU);
        ctx.fill();
      } else if (p.type === 'casing') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.spin);
        ctx.fillStyle = `rgba(228, 190, 96, ${alpha})`;
        ctx.fillRect(-1.6, -0.8, 3.2, 1.6);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }
    ctx.globalAlpha = 1;
  }

  drawReticle(game) {
    if (game.state !== 'playing' || game.player.isInVehicle) return;
    const ctx = this.ctx;
    const x = game.input.mouse.worldX;
    const y = game.input.mouse.worldY;
    if (!this.inView(x, y, 40)) return;
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 240, 210, 0.68)';
    ctx.lineWidth = 1.3;
    const r = game.player.weapon.id === 'fists' ? 6 : 8;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - r - 4, y);
    ctx.lineTo(x - r + 1, y);
    ctx.moveTo(x + r - 1, y);
    ctx.lineTo(x + r + 4, y);
    ctx.moveTo(x, y - r - 4);
    ctx.lineTo(x, y - r + 1);
    ctx.moveTo(x, y + r - 1);
    ctx.lineTo(x, y + r + 4);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255, 220, 150, 0.9)';
    ctx.beginPath();
    ctx.arc(x, y, 1.1, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  drawAtmosphere(game) {
    const ctx = this.ctx;
    const tod = game.timeOfDay;
    const key = Math.round(tod * 50);
    if (!this.atmoCanvas || this.atmoKey !== key) {
      this.atmoKey = key;
      const c = document.createElement('canvas');
      c.width = this.width;
      c.height = this.height;
      const a = c.getContext('2d');
      const sun = a.createLinearGradient(0, 0, this.width, this.height);
      sun.addColorStop(0, `rgba(255, 186, 110, ${0.09 + (1 - tod) * 0.04})`);
      sun.addColorStop(0.55, 'rgba(255, 150, 120, 0.03)');
      sun.addColorStop(1, `rgba(90, 50, 120, ${Math.max(0, (tod - 0.5)) * 0.16})`);
      a.fillStyle = sun;
      a.fillRect(0, 0, this.width, this.height);
      if (tod > 0.62) {
        a.fillStyle = `rgba(48, 32, 80, ${Math.min(0.22, (tod - 0.62) * 0.45)})`;
        a.fillRect(0, 0, this.width, this.height);
      }
      const vignette = a.createRadialGradient(
        this.width / 2, this.height / 2, this.height * 0.36,
        this.width / 2, this.height / 2, this.height * 0.98
      );
      vignette.addColorStop(0, 'rgba(20, 12, 26, 0)');
      vignette.addColorStop(1, 'rgba(18, 10, 22, 0.24)');
      a.fillStyle = vignette;
      a.fillRect(0, 0, this.width, this.height);
      this.atmoCanvas = c;
    }
    ctx.drawImage(this.atmoCanvas, 0, 0);
  }

  shade(hex, amount) {
    const c = hex.replace('#', '');
    const num = parseInt(c.length === 3 ? c.split('').map((x) => x + x).join('') : c, 16);
    let r = (num >> 16) & 255;
    let g = (num >> 8) & 255;
    let b = num & 255;
    if (amount >= 0) {
      r += (255 - r) * amount;
      g += (255 - g) * amount;
      b += (255 - b) * amount;
    } else {
      r *= 1 + amount;
      g *= 1 + amount;
      b *= 1 + amount;
    }
    return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
  }
}
