// Leonida Heat - HUD and front end, drawn on the same canvas as the world.
// Large, high-contrast type so everything still reads at contact-sheet size:
// health/armor, animated money, wanted stars, weapon and ammo, objectives,
// district entry, prompts, dialogue, a real minimap, and every screen state.

import { GAME_TITLE, GAME_SUBTITLE, PALETTE, WEAPON_CONFIG } from './config.js';

const FONT = '"Segoe UI", "Helvetica Neue", Arial, sans-serif';

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

function star(ctx, x, y, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const rad = i % 2 === 0 ? r : r * 0.44;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const px = x + Math.cos(a) * rad;
    const py = y + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function wrap(ctx, text, maxWidth) {
  const words = String(text).split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export class HUD {
  constructor() {
    this.toasts = [];
    this.dialog = null;
    this.dialogTimer = 0;
    this.banner = null;
    this.district = null;
    this.districtTimer = 0;
    this.displayedMoney = 500;
    this.moneyFlash = 0;
    this.buttons = [];
    this.menuIndex = 0;
    this.objectiveHint = '';
    this.prompt = '';
    this.radioVisible = 0;
    this.endingTimer = 0;
    this.mutedNotice = 0;
    this.titleTime = 0;
    this.lastWanted = 0;
    this.starFlash = 0;
  }

  showToast(text, type = 'neutral', duration = 2.6) {
    this.toasts.push({ text, type, timer: duration, max: duration });
    if (this.toasts.length > 3) this.toasts.shift();
  }

  showDialog(speaker, text) {
    this.dialog = { speaker, text };
    this.dialogTimer = 0;
  }

  showMissionBanner(def, index) {
    this.banner = { title: def.title, index: index + 1, timer: 3.4, max: 3.4 };
  }

  setDistrict(name, sub) {
    this.district = { name, sub };
    this.districtTimer = 3.8;
  }

  update(dt, game) {
    this.titleTime += dt;
    for (let i = this.toasts.length - 1; i >= 0; i -= 1) {
      this.toasts[i].timer -= dt;
      if (this.toasts[i].timer <= 0) this.toasts.splice(i, 1);
    }
    if (this.banner) {
      this.banner.timer -= dt;
      if (this.banner.timer <= 0) this.banner = null;
    }
    if (this.districtTimer > 0) this.districtTimer -= dt;
    if (this.dialog) this.dialogTimer += dt;

    const target = game.player.money;
    if (Math.abs(this.displayedMoney - target) > 0.6) {
      const diff = target - this.displayedMoney;
      this.displayedMoney += diff * Math.min(1, dt * 6);
      this.moneyFlash = Math.min(1, this.moneyFlash + dt * 2);
    } else {
      this.displayedMoney = target;
    }
    this.moneyFlash = Math.max(0, this.moneyFlash - dt * 1.4);
    this.radioVisible = Math.max(0, this.radioVisible - dt);
    this.mutedNotice = Math.max(0, this.mutedNotice - dt);

    if (game.police.wantedStars !== this.lastWanted) {
      this.lastWanted = game.police.wantedStars;
      if (this.lastWanted > 0) this.starFlash = 1;
    }
    this.starFlash = Math.max(0, this.starFlash - dt * 2);
  }

  // -------------------------------------------------------------
  // HUD
  // -------------------------------------------------------------
  drawHUD(ctx, game) {
    if (game.state === 'paused' || game.state === 'wasted' || game.state === 'busted') {
      this.drawStats(ctx, game);
      return;
    }
    this.drawStats(ctx, game);
    this.drawMinimap(ctx, game);
    this.drawWeapon(ctx, game);
    this.drawObjective(ctx, game);
    this.drawDistrict(ctx, game);
    this.drawToasts(ctx, game);
    if (!this.banner) this.drawPrompt(ctx, game);
    this.drawRadio(ctx, game);
    this.drawBustedMeter(ctx, game);
    if (this.banner) this.drawMissionBanner(ctx, game);
  }

  drawStats(ctx, game) {
    const p = game.player;
    ctx.save();
    ctx.fillStyle = PALETTE.uiPanel;
    rr(ctx, 22, 20, 286, 118, 12);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 214, 150, 0.25)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.font = `800 17px ${FONT}`;
    ctx.fillStyle = '#f3ead8';
    ctx.textAlign = 'left';
    ctx.fillText('HEALTH', 38, 44);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = `700 16px ${FONT}`;
    ctx.textAlign = 'right';
    ctx.fillText(`${Math.ceil(p.health)}`, 292, 44);

    // Health bar.
    ctx.fillStyle = 'rgba(12, 10, 18, 0.8)';
    rr(ctx, 38, 51, 254, 14, 7);
    ctx.fill();
    const hg = ctx.createLinearGradient(38, 0, 292, 0);
    hg.addColorStop(0, '#ff6b6b');
    hg.addColorStop(0.65, '#ff9f5a');
    hg.addColorStop(1, '#7be3a3');
    ctx.fillStyle = hg;
    rr(ctx, 38, 51, Math.max(6, 254 * (p.health / p.maxHealth)), 14, 7);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.24)';
    rr(ctx, 38, 52, Math.max(6, 254 * (p.health / p.maxHealth)), 4, 3);
    ctx.fill();

    ctx.font = `800 14px ${FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.textAlign = 'left';
    ctx.fillText('ARMOR', 38, 88);
    ctx.fillStyle = 'rgba(12, 10, 18, 0.8)';
    rr(ctx, 94, 78, 198, 10, 5);
    ctx.fill();
    ctx.fillStyle = '#6fb7ff';
    rr(ctx, 94, 78, Math.max(3, 198 * (p.armor / p.maxArmor)), 10, 5);
    ctx.fill();

    // Money.
    const moneyColor = this.moneyFlash > 0.03 ? '#b9ffb1' : '#ffd166';
    ctx.font = `900 30px ${FONT}`;
    ctx.fillStyle = moneyColor;
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = 4;
    ctx.fillText(`$${Math.round(this.displayedMoney).toLocaleString('en-US')}`, 38, 122);
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  drawMinimap(ctx, game) {
    const size = 188;
    const x = 1280 - 24 - size;
    const y = 22;
    const inner = 8;
    const mapSize = size - inner * 2;
    const scale = mapSize / 3200;
    ctx.save();
    ctx.fillStyle = 'rgba(9, 13, 20, 0.94)';
    rr(ctx, x, y, size, size, 12);
    ctx.fill();
    ctx.strokeStyle = 'rgba(214, 232, 240, 0.42)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.save();
    rr(ctx, x + inner, y + inner, mapSize, mapSize, 7);
    ctx.clip();
    ctx.translate(x + inner, y + inner);
    ctx.fillStyle = '#0f1720';
    ctx.fillRect(0, 0, mapSize, mapSize);

    // Clear blue ocean, light sand and boardwalk.
    ctx.fillStyle = '#1d6f9e';
    ctx.fillRect(2712 * scale, 0, (3200 - 2712) * scale, mapSize);
    ctx.fillStyle = '#2b8cba';
    ctx.fillRect(2880 * scale, 0, (3200 - 2880) * scale, mapSize);
    ctx.fillStyle = '#e3cb9a';
    ctx.fillRect(2490 * scale, 0, 222 * scale, mapSize);
    ctx.fillStyle = '#c69a68';
    ctx.fillRect(2494 * scale, 0, 58 * scale, mapSize);

    // Dark city blocks with a light sidewalk edge.
    for (const b of game.city.blocks) {
      ctx.fillStyle = '#28333d';
      ctx.fillRect(b.xMin * scale, b.yMin * scale, b.w * scale, b.h * scale);
      ctx.strokeStyle = 'rgba(214, 203, 176, 0.34)';
      ctx.lineWidth = 0.8;
      ctx.strokeRect(b.xMin * scale + 0.4, b.yMin * scale + 0.4, b.w * scale - 0.8, b.h * scale - 0.8);
    }

    // Lighter road grid on the dark blocks.
    ctx.strokeStyle = '#ece2cc';
    for (const r of game.city.roads) {
      ctx.lineWidth = Math.max(1.8, (r.width * scale) * 0.85);
      ctx.beginPath();
      ctx.moveTo(r.x1 * scale, r.y1 * scale);
      ctx.lineTo(r.x2 * scale, r.y2 * scale);
      ctx.stroke();
    }

    // Faint traffic.
    ctx.fillStyle = 'rgba(255, 255, 255, 0.24)';
    for (const v of game.traffic.vehicles) {
      if (v.isMission) continue;
      ctx.beginPath();
      ctx.arc(v.x * scale, v.y * scale, 1, 0, Math.PI * 2);
      ctx.fill();
    }

    // Police in red.
    for (const c of game.police.cops) {
      ctx.fillStyle = '#ff3548';
      ctx.shadowColor = '#ff3548';
      ctx.shadowBlur = 5;
      ctx.beginPath();
      ctx.arc(c.x * scale, c.y * scale, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.1;
      ctx.stroke();
    }
    for (const c of game.police.footCops) {
      if (c.isDead) continue;
      ctx.fillStyle = '#ff3548';
      ctx.beginPath();
      ctx.arc(c.x * scale, c.y * scale, 2.9, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 0.7;
      ctx.stroke();
    }

    // Pulsing gold mission diamond.
    const marker = game.missions.currentTarget() || game.missions.availableMarker();
    if (marker) {
      const pulse = 0.5 + Math.sin(this.titleTime * 4) * 0.5;
      ctx.save();
      ctx.translate(marker.x * scale, marker.y * scale);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = '#ffd166';
      ctx.shadowColor = '#ffd166';
      ctx.shadowBlur = 7 + pulse * 6;
      const d = 5 + pulse * 2.5;
      ctx.fillRect(-d, -d, d * 2, d * 2);
      ctx.strokeStyle = '#6b4c10';
      ctx.lineWidth = 1;
      ctx.strokeRect(-d, -d, d * 2, d * 2);
      ctx.restore();
    }

    // White-outlined player arrow.
    const px = game.player.x * scale;
    const py = game.player.y * scale;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(game.player.isInVehicle ? game.player.vehicle.angle : game.player.angle);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#11151c';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(9.5, 0);
    ctx.lineTo(-6, 6);
    ctx.lineTo(-2.6, 0);
    ctx.lineTo(-6, -6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Faint view frame.
    ctx.strokeStyle = 'rgba(255, 240, 210, 0.2)';
    ctx.lineWidth = 1.2;
    const vx = game.camera.x * scale;
    const vy = game.camera.y * scale;
    const vw = (1280 / game.camera.zoom) * scale * 0.5;
    const vh = (720 / game.camera.zoom) * scale * 0.5;
    ctx.strokeRect(vx - vw, vy - vh, vw * 2, vh * 2);

    // Compass north.
    ctx.save();
    ctx.font = `900 10px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(9, 13, 20, 0.68)';
    ctx.beginPath();
    ctx.arc(mapSize / 2, 12, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f4ecd8';
    ctx.fillText('N', mapSize / 2, 15.5);
    ctx.restore();
    ctx.restore();

    // One clean wanted panel under the minimap, same right margin.
    const stars = game.police.wantedStars;
    const panelY = y + size + 10;
    const panelH = 64;
    const pursuit = stars > 0 && game.police.hasSight;
    const pulse = 0.5 + Math.sin(this.titleTime * 2.4) * 0.5;
    ctx.fillStyle = 'rgba(9, 13, 20, 0.9)';
    rr(ctx, x, panelY, size, panelH, 9);
    ctx.fill();
    ctx.strokeStyle = stars >= 4 ? `rgba(255, 64, 84, ${0.45 + pulse * 0.3})` : 'rgba(214, 232, 240, 0.22)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.font = `800 11px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(244, 236, 216, 0.68)';
    ctx.fillText('WANTED', x + 12, panelY + 19);

    const starStart = x + 90;
    const starGap = 18.5;
    for (let i = 0; i < 5; i += 1) {
      const cx = starStart + i * starGap;
      ctx.save();
      if (i < stars) {
        const glow = 0.78 + pulse * 0.22;
        ctx.fillStyle = `rgba(255, 210, 92, ${glow})`;
        ctx.shadowColor = stars >= 4 ? '#ff3b52' : '#ffb347';
        ctx.shadowBlur = stars >= 4 ? 14 + pulse * 8 : 7 + pulse * 4;
        star(ctx, cx, panelY + 16, 9.2);
        ctx.fill();
      } else {
        ctx.strokeStyle = 'rgba(255, 240, 210, 0.28)';
        ctx.lineWidth = 1.3;
        star(ctx, cx, panelY + 16, 9.2);
        ctx.stroke();
      }
      ctx.restore();
    }

    let status = 'NO HEAT';
    let statusColor = 'rgba(244, 236, 216, 0.5)';
    if (stars > 0) {
      if (pursuit) {
        status = 'PURSUIT';
        statusColor = '#ff8c96';
      } else if (game.police.searching) {
        const cooling = game.police.cooldownTimer <= 10;
        status = cooling ? 'EVADING' : 'SEARCHING';
        statusColor = cooling ? '#8fe3a3' : '#9fd6ff';
      } else {
        status = 'PURSUIT';
        statusColor = '#ff8c96';
      }
    }
    ctx.font = `800 11px ${FONT}`;
    ctx.fillStyle = statusColor;
    ctx.fillText(status, x + 12, panelY + 47);
    if (stars >= 4) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(255, 47, 70, ${0.08 + pulse * 0.08})`;
      rr(ctx, x - 3, panelY - 3, size + 6, panelH + 6, 11);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  drawWeapon(ctx, game) {
    const p = game.player;
    const w = p.weapon;
    const boxW = 286;
    const boxH = 92;
    const x = 1280 - 24 - boxW;
    const y = 720 - 24 - boxH;
    ctx.save();
    ctx.fillStyle = PALETTE.uiPanel;
    rr(ctx, x, y, boxW, boxH, 12);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 214, 150, 0.22)';
    ctx.stroke();

    // Weapon silhouette.
    ctx.save();
    ctx.translate(x + 58, y + 48);
    ctx.rotate(-0.18);
    ctx.fillStyle = w.id === 'fists' ? '#e8c39a' : '#cfd6dd';
    if (w.id === 'fists') {
      ctx.beginPath();
      ctx.arc(0, 0, 17, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#c89a72';
      for (let i = -1; i <= 1; i += 1) {
        ctx.beginPath();
        ctx.arc(i * 7, -3, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (w.id === 'shotgun' || w.id === 'rifle') {
      ctx.fillRect(-30, -4, 62, 8);
      ctx.fillStyle = '#76502f';
      ctx.fillRect(-32, -2, 12, 12);
      ctx.fillStyle = '#40424a';
      ctx.fillRect(-14, 4, 10, 12);
      if (w.id === 'rifle') ctx.fillRect(2, -8, 12, 4);
    } else if (w.id === 'smg') {
      ctx.fillRect(-22, -5, 44, 10);
      ctx.fillRect(-6, 5, 10, 20);
      ctx.fillRect(10, -7, 6, 3);
    } else {
      ctx.fillRect(-16, -5, 34, 10);
      ctx.fillRect(-8, 5, 10, 18);
    }
    ctx.restore();

    ctx.textAlign = 'left';
    ctx.font = `800 18px ${FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,0.82)';
    ctx.fillText(w.name.toUpperCase(), x + 104, y + 27);
    const mag = p.ammo[w.id];
    ctx.font = `900 34px ${FONT}`;
    ctx.fillStyle = p.isReloading ? '#ffb45c' : '#f4ead6';
    if (!Number.isFinite(w.clipSize)) {
      ctx.fillText('READY', x + 104, y + 66);
    } else {
      ctx.fillText(`${mag.clip}`, x + 104, y + 66);
      ctx.font = `700 18px ${FONT}`;
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillText(`/ ${mag.reserve}`, x + 104 + ctx.measureText(`${mag.clip}`).width + 52, y + 64);
      if (p.isReloading) {
        ctx.font = `800 13px ${FONT}`;
        ctx.fillStyle = '#ffb45c';
        ctx.fillText('RELOADING', x + 104, y + 84);
      }
    }
    ctx.textAlign = 'right';
    ctx.font = `800 13px ${FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText(`${p.currentWeaponIndex + 1}/5`, x + boxW - 18, y + 82);
    ctx.restore();
  }

  drawObjective(ctx, game) {
    const mission = game.missions;
    let title = '';
    let body = '';
    let timerText = '';
    let accent = '#ffd166';
    if (mission.active && mission.definition) {
      title = `MISSION ${mission.definition.id}: ${mission.definition.title}`;
      body = mission.step ? mission.step.text : '';
      if (mission.stepTimeLimit > 0) {
        const left = Math.max(0, mission.stepTimeLimit - mission.stepTimer);
        timerText = `${Math.ceil(left)}s`;
        accent = left < 15 ? '#ff6b6b' : '#ffd166';
      }
    } else if (mission.currentIndex < mission.defs.length) {
      const def = mission.defs[mission.currentIndex];
      title = `NEXT: ${def.title}`;
      body = `Find the gold marker and meet your contact.`;
      accent = '#8fe3a3';
    } else {
      title = 'THE CITY IS YOURS';
      body = 'Every score is settled. Enjoy the sunset.';
      accent = '#ffd166';
    }

    ctx.save();
    ctx.fillStyle = PALETTE.uiPanel;
    const boxW = 360;
    ctx.font = `700 20px ${FONT}`;
    const lines = wrap(ctx, body, boxW - 38);
    ctx.font = `700 14px ${FONT}`;
    const hintLines = this.objectiveHint ? wrap(ctx, this.objectiveHint, boxW - 38) : [];
    const boxH = 54 + lines.length * 25 + hintLines.length * 19 + (mission.active ? 18 : 0);
    rr(ctx, 22, 154, boxW, boxH, 11);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 214, 150, 0.18)';
    ctx.stroke();

    ctx.fillStyle = accent;
    ctx.fillRect(22, 154, 4, boxH);
    ctx.font = `800 15px ${FONT}`;
    ctx.fillStyle = accent;
    ctx.textAlign = 'left';
    ctx.fillText(title.toUpperCase(), 40, 178);
    if (mission.active) {
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillText(`STEP ${mission.stepIndex + 1}/${mission.definition.steps.length}`, 40, 196);
      if (timerText) {
        ctx.font = `900 22px ${FONT}`;
        ctx.fillStyle = accent;
        ctx.textAlign = 'right';
        ctx.fillText(timerText, 22 + boxW - 16, 196);
        ctx.textAlign = 'left';
      }
    }
    ctx.font = `700 20px ${FONT}`;
    ctx.fillStyle = '#f2eadb';
    let ty = mission.active ? 224 : 203;
    for (const line of lines) {
      ctx.fillText(line, 40, ty);
      ty += 25;
    }
    if (hintLines.length) {
      ctx.font = `700 14px ${FONT}`;
      ctx.fillStyle = 'rgba(255, 220, 150, 0.8)';
      for (const line of hintLines) {
        ctx.fillText(line, 40, ty);
        ty += 19;
      }
    }
    ctx.restore();
  }

  drawDistrict(ctx, game) {
    if (!this.district || this.districtTimer <= 0) return;
    const alpha = Math.min(1, this.districtTimer / 0.7) * Math.min(1, (3.8 - this.districtTimer) / 0.4 + 0.2);
    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.textAlign = 'center';
    ctx.font = `900 30px ${FONT}`;
    ctx.fillStyle = 'rgba(10, 8, 16, 0.55)';
    ctx.fillText(this.district.name.toUpperCase(), 641, 58);
    ctx.fillStyle = '#ffe8c2';
    ctx.fillText(this.district.name.toUpperCase(), 640, 56);
    ctx.font = `700 14px ${FONT}`;
    ctx.fillStyle = 'rgba(255, 236, 205, 0.8)';
    ctx.fillText(this.district.sub.toUpperCase(), 640, 78);
    ctx.restore();
  }

  drawToasts(ctx, game) {
    let y = 100;
    for (const t of this.toasts) {
      const alpha = Math.min(1, t.timer / 0.35) * Math.min(1, (t.max - t.timer) / 0.15);
      const color = t.type === 'danger' ? '#ff6b6b' : t.type === 'success' ? '#8fe3a3' : t.type === 'warning' ? '#ffb45c' : '#f0e8da';
      ctx.save();
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.font = `800 18px ${FONT}`;
      const w = Math.min(600, ctx.measureText(t.text).width + 38);
      ctx.fillStyle = 'rgba(16, 14, 22, 0.84)';
      rr(ctx, 640 - w / 2, y, w, 34, 8);
      ctx.fill();
      ctx.fillStyle = color;
      ctx.fillRect(640 - w / 2 + 3, y + 8, 3, 18);
      ctx.textAlign = 'center';
      ctx.fillStyle = color;
      ctx.fillText(t.text, 640 + 4, y + 23);
      ctx.restore();
      y += 42;
    }
    void game;
  }

  drawPrompt(ctx, game) {
    const prompt = game.prompt;
    if (!prompt) return;
    ctx.save();
    ctx.font = `800 19px ${FONT}`;
    const w = Math.min(640, ctx.measureText(prompt).width + 54);
    const y = 720 - 132;
    ctx.fillStyle = 'rgba(14, 12, 20, 0.86)';
    rr(ctx, 640 - w / 2, y, w, 40, 9);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 214, 150, 0.35)';
    ctx.stroke();
    ctx.fillStyle = '#ffd166';
    ctx.textAlign = 'center';
    ctx.fillText(prompt, 640, y + 26);
    ctx.restore();
  }

  drawRadio(ctx, game) {
    if (this.radioVisible <= 0 && game.state === 'playing' && game.audio.currentStation.id !== 'off') {
      // Keep a compact permanent station chip; the large notice appears on changes.
    }
    if (this.radioVisible > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, this.radioVisible / 0.4);
      ctx.fillStyle = 'rgba(14, 12, 20, 0.8)';
      rr(ctx, 22, 610, 300, 54, 10);
      ctx.fill();
      ctx.font = `800 13px ${FONT}`;
      ctx.fillStyle = '#ff9db0';
      ctx.fillText('ON AIR', 38, 630);
      ctx.font = `800 19px ${FONT}`;
      ctx.fillStyle = '#f2eadb';
      ctx.fillText(game.audio.currentStation.name, 38, 652);
      ctx.restore();
    }
  }

  drawBustedMeter(ctx, game) {
    const progress = game.police.bustedProgress;
    if (progress <= 0.01) return;
    const w = 300;
    const x = 640 - w / 2;
    const y = 570;
    ctx.save();
    ctx.fillStyle = 'rgba(14, 12, 20, 0.88)';
    rr(ctx, x, y, w, 48, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(120, 180, 255, 0.5)';
    ctx.stroke();
    ctx.font = `900 20px ${FONT}`;
    ctx.fillStyle = '#8fc6ff';
    ctx.textAlign = 'center';
    ctx.fillText('BUSTED', 640, y + 23);
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    rr(ctx, x + 20, y + 31, w - 40, 8, 4);
    ctx.fill();
    ctx.fillStyle = '#8fc6ff';
    rr(ctx, x + 20, y + 31, (w - 40) * Math.min(1, progress / 1.25), 8, 4);
    ctx.fill();
    ctx.restore();
  }

  drawMissionBanner(ctx, game) {
    const b = this.banner;
    if (!b) return;
    const t = Math.min(1, (b.max - b.timer) / 0.4) * Math.min(1, b.timer / 0.4);
    ctx.save();
    ctx.globalAlpha = Math.max(0, t);
    ctx.fillStyle = 'rgba(12, 10, 18, 0.82)';
    rr(ctx, 330, 610, 620, 84, 6);
    ctx.fill();
    ctx.fillStyle = '#ffd166';
    ctx.fillRect(330, 610, 5, 84);
    ctx.textAlign = 'center';
    ctx.font = `900 34px ${FONT}`;
    ctx.fillStyle = '#ffe6b5';
    ctx.fillText(b.title.toUpperCase(), 640, 650);
    ctx.font = `800 15px ${FONT}`;
    ctx.fillStyle = '#ff9db0';
    ctx.fillText(`MISSION ${b.index}`, 640, 676);
    ctx.restore();
    void game;
  }

  // -------------------------------------------------------------
  // Screens
  // -------------------------------------------------------------
  drawScreens(ctx, game) {
    this.buttons = [];
    switch (game.state) {
      case 'title':
        this.drawTitle(ctx, game);
        break;
      case 'controls':
        this.drawControls(ctx, game);
        break;
      case 'paused':
        this.drawPause(ctx, game);
        break;
      case 'dialogue':
        this.drawDialogue(ctx, game);
        break;
      case 'missionComplete':
        this.drawMissionComplete(ctx, game);
        break;
      case 'missionFailed':
        this.drawMissionFailed(ctx, game);
        break;
      case 'wasted':
        this.drawWasted(ctx, game, 'WASTED', '#b3343f', 'The hospital patched you up. Fee');
        break;
      case 'busted':
        this.drawWasted(ctx, game, 'BUSTED', '#3b6ea5', 'The precinct booked you. Fine');
        break;
      case 'ending':
        this.drawEnding(ctx, game);
        break;
      default:
        break;
    }
  }

  dim(ctx, alpha = 0.5) {
    ctx.fillStyle = `rgba(10, 8, 16, ${alpha})`;
    ctx.fillRect(0, 0, 1280, 720);
  }

  drawButton(ctx, game, x, y, w, h, label, action, opts = {}) {
    const hover = game.input.mouse.x >= x && game.input.mouse.x <= x + w && game.input.mouse.y >= y && game.input.mouse.y <= y + h;
    const selected = this.menuIndex === (opts.index ?? 0);
    const disabled = !!opts.disabled;
    this.buttons.push({ x, y, w, h, action, disabled });
    ctx.save();
    const active = (hover || selected) && !disabled;
    ctx.fillStyle = active ? 'rgba(255, 209, 102, 0.94)' : 'rgba(18, 15, 24, 0.8)';
    rr(ctx, x, y, w, h, 7);
    ctx.fill();
    if (!active) {
      ctx.strokeStyle = 'rgba(255, 220, 160, 0.28)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
    ctx.textAlign = 'left';
    ctx.font = `900 21px ${FONT}`;
    ctx.fillStyle = disabled ? 'rgba(255,255,255,0.26)' : active ? '#1b1620' : '#f2eadb';
    ctx.fillText(label, x + 22, y + h / 2 + 7);
    if (active && !disabled) {
      ctx.beginPath();
      ctx.moveTo(x + w - 30, y + h / 2 - 5);
      ctx.lineTo(x + w - 18, y + h / 2);
      ctx.lineTo(x + w - 30, y + h / 2 + 5);
      ctx.closePath();
      ctx.fillStyle = '#1b1620';
      ctx.fill();
    }
    ctx.restore();
  }

  drawTitle(ctx, game) {
    this.dim(ctx, 0.06);
    const grad = ctx.createLinearGradient(0, 0, 900, 0);
    grad.addColorStop(0, 'rgba(12, 9, 18, 0.97)');
    grad.addColorStop(0.52, 'rgba(12, 9, 18, 0.8)');
    grad.addColorStop(1, 'rgba(12, 9, 18, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1280, 720);
    const focus = ctx.createRadialGradient(320, 350, 60, 320, 350, 520);
    focus.addColorStop(0, 'rgba(10, 8, 16, 0.34)');
    focus.addColorStop(0.6, 'rgba(10, 8, 16, 0.2)');
    focus.addColorStop(1, 'rgba(10, 8, 16, 0)');
    ctx.fillStyle = focus;
    ctx.fillRect(0, 0, 900, 720);
    const bottom = ctx.createLinearGradient(0, 480, 0, 720);
    bottom.addColorStop(0, 'rgba(10, 8, 16, 0)');
    bottom.addColorStop(1, 'rgba(10, 8, 16, 0.92)');
    ctx.fillStyle = bottom;
    ctx.fillRect(0, 480, 1280, 240);

    // Sun disc behind the logo.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const sun = ctx.createRadialGradient(168, 244, 10, 168, 244, 180);
    sun.addColorStop(0, 'rgba(255, 170, 120, 0.35)');
    sun.addColorStop(0.55, 'rgba(255, 110, 140, 0.13)');
    sun.addColorStop(1, 'rgba(255, 110, 140, 0)');
    ctx.fillStyle = sun;
    ctx.fillRect(0, 60, 420, 420);
    ctx.restore();
    ctx.strokeStyle = 'rgba(255, 205, 140, 0.3)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(168, 244, 128, 0, Math.PI * 2);
    ctx.stroke();

    ctx.save();
    ctx.textAlign = 'left';
    ctx.font = `800 13px ${FONT}`;
    ctx.fillStyle = '#ff9db0';
    ctx.fillText('COSTA SOL  //  A CRIME STORY', 96, 132);

    const logo1 = ctx.createLinearGradient(90, 300, 520, 160);
    logo1.addColorStop(0, '#ffe4b0');
    logo1.addColorStop(0.5, '#ffb37b');
    logo1.addColorStop(1, '#ff7f9e');
    ctx.font = `900 88px ${FONT}`;
    ctx.fillStyle = logo1;
    ctx.shadowColor = 'rgba(255, 120, 130, 0.45)';
    ctx.shadowBlur = 24;
    ctx.fillText('LEONIDA', 92, 260);
    ctx.shadowBlur = 0;
    const logo2 = ctx.createLinearGradient(90, 380, 420, 300);
    logo2.addColorStop(0, '#ffcf6b');
    logo2.addColorStop(0.55, '#ff7b62');
    logo2.addColorStop(1, '#e8445f');
    ctx.font = `900 118px ${FONT}`;
    ctx.fillStyle = logo2;
    ctx.shadowColor = 'rgba(230, 50, 80, 0.5)';
    ctx.shadowBlur = 28;
    ctx.fillText('HEAT', 96, 366);
    ctx.shadowBlur = 0;
    ctx.font = `700 21px ${FONT}`;
    ctx.fillStyle = 'rgba(255, 240, 220, 0.85)';
    ctx.fillText(GAME_SUBTITLE.toUpperCase(), 100, 404);
    ctx.restore();

    const hasSave = game.hasSaveFile();
    const actions = [
      { label: 'NEW GAME', action: 'new' },
      { label: 'CONTINUE', action: 'continue', disabled: !hasSave },
      { label: 'CONTROLS', action: 'controls' },
    ];
    actions.forEach((a, i) => {
      this.drawButton(ctx, game, 96, 452 + i * 62, 272, 48, a.label, a.action, { index: i, disabled: a.disabled });
    });

    ctx.save();
    ctx.font = `700 15px ${FONT}`;
    ctx.fillStyle = 'rgba(255, 238, 214, 0.66)';
    ctx.textAlign = 'center';
    ctx.fillText('WASD move · MOUSE aim · E enter / exit · SPACE handbrake · R reload · ESC pause', 640, 664);
    ctx.restore();

    if (this.mutedNotice > 0) {
      ctx.font = `800 15px ${FONT}`;
      ctx.fillStyle = '#ffd166';
      ctx.textAlign = 'center';
      ctx.fillText(game.audio.muted ? 'SOUND MUTED' : 'SOUND ON', 640, 690);
    }
  }

  drawControls(ctx, game) {
    this.dim(ctx, 0.7);
    this.panel(ctx, 640, 356, 950, 600, 'CONTROLS');
    ctx.save();
    ctx.textAlign = 'left';
    ctx.font = `800 17px ${FONT}`;
    const left = [
      ['W A S D / ARROWS', 'Walk, drive, steer'],
      ['SHIFT', 'Sprint on foot'],
      ['SPACE', 'Dodge roll / handbrake'],
      ['MOUSE', 'Aim at the cursor'],
      ['LEFT CLICK', 'Fire current weapon'],
      ['R', 'Reload'],
      ['1 – 5 / WHEEL', 'Switch weapon'],
      ['E or F', 'Enter / exit vehicle'],
      ['E', 'Rob a pedestrian / talk'],
      ['ESC', 'Pause'],
    ];
    const right = [
      ['M', 'Mute / unmute'],
      ['Q', 'Cycle radio station'],
      ['H', 'Horn'],
      ['WALK INTO GOLD MARKER', 'Start the next mission'],
      ['SPACE / CLICK', 'Dismiss dialogue'],
      ['ESC IN MENUS', 'Back'],
      ['POLICE', 'Break line of sight to cool heat'],
      ['STOPPED + COP CLOSE', 'You will be BUSTED'],
      ['THE CLOCK', 'Timed deliveries fail at zero'],
      ['SAVE', 'Pause → Save Game'],
    ];
    let y = 168;
    for (const [key, desc] of left) {
      ctx.font = `900 15px ${FONT}`;
      ctx.fillStyle = '#ffd166';
      ctx.fillText(key, 200, y);
      ctx.font = `600 16px ${FONT}`;
      ctx.fillStyle = 'rgba(244, 236, 224, 0.88)';
      ctx.fillText(desc, 200, y + 19);
      y += 43;
    }
    y = 168;
    for (const [key, desc] of right) {
      ctx.font = `900 15px ${FONT}`;
      ctx.fillStyle = '#8fe3a3';
      ctx.fillText(key, 670, y);
      ctx.font = `600 16px ${FONT}`;
      ctx.fillStyle = 'rgba(244, 236, 224, 0.88)';
      ctx.fillText(desc, 670, y + 19);
      y += 43;
    }
    ctx.restore();
    this.drawButton(ctx, game, 520, 600, 240, 42, 'BACK', 'back', { index: 0 });
  }

  drawPause(ctx, game) {
    this.dim(ctx, 0.62);
    this.panel(ctx, 640, 340, 540, 530, 'PAUSED');
    const items = [
      ['RESUME', 'resume'],
      ['SAVE GAME', 'save'],
      ['LOAD GAME', 'load'],
      ['CONTROLS', 'controls'],
      ['QUIT TO TITLE', 'title'],
    ];
    items.forEach(([label, action], i) => {
      this.drawButton(ctx, game, 420, 238 + i * 62, 440, 46, label, action, { index: i });
    });
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = `700 14px ${FONT}`;
    ctx.fillStyle = 'rgba(255, 238, 214, 0.6)';
    ctx.fillText(`SOUND ${game.audio.muted ? 'OFF' : 'ON'}   ·   M to mute`, 640, 570);
    if (game.saveNotice && game.saveNotice > 0) {
      ctx.font = `800 15px ${FONT}`;
      ctx.fillStyle = '#8fe3a3';
      ctx.fillText('GAME SAVED', 640, 592);
    }
    ctx.restore();
  }

  drawDialogue(ctx, game) {
    const d = this.dialog;
    if (!d) return;
    this.dim(ctx, 0.18);
    const x = 220;
    const y = 524;
    const w = 840;
    const h = 156;
    ctx.save();
    ctx.fillStyle = 'rgba(12, 10, 18, 0.94)';
    rr(ctx, x, y, w, h, 10);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 209, 102, 0.45)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.fillStyle = '#ffd166';
    ctx.fillRect(x, y, 5, h);
    ctx.font = `900 19px ${FONT}`;
    ctx.fillStyle = '#ff9db0';
    ctx.fillText(d.speaker.toUpperCase(), x + 30, y + 36);
    ctx.font = `600 22px ${FONT}`;
    ctx.fillStyle = '#f6efe2';
    const lines = wrap(ctx, d.text, w - 64);
    let ty = y + 72;
    for (const line of lines.slice(0, 4)) {
      ctx.fillText(line, x + 30, ty);
      ty += 29;
    }
    ctx.font = `700 13px ${FONT}`;
    ctx.fillStyle = 'rgba(255, 238, 214, 0.5)';
    ctx.textAlign = 'right';
    ctx.fillText('SPACE / CLICK TO CONTINUE', x + w - 24, y + h - 18);
    ctx.restore();
    void game;
  }

  drawMissionComplete(ctx, game) {
    this.dim(ctx, 0.58);
    const info = game.missionComplete;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = `900 15px ${FONT}`;
    ctx.fillStyle = '#8fe3a3';
    ctx.fillText('COSTA SOL HOLDS ITS BREATH', 640, 198);
    ctx.font = `900 74px ${FONT}`;
    ctx.fillStyle = '#ffe6b5';
    ctx.shadowColor = 'rgba(255, 190, 100, 0.5)';
    ctx.shadowBlur = 24;
    ctx.fillText('MISSION PASSED', 640, 280);
    ctx.shadowBlur = 0;
    ctx.font = `800 30px ${FONT}`;
    ctx.fillStyle = '#ff9db0';
    ctx.fillText(info?.def?.title?.toUpperCase() || 'MISSION', 640, 330);
    ctx.font = `900 48px ${FONT}`;
    ctx.fillStyle = '#ffd166';
    ctx.fillText(`+ $${(info?.reward || 0).toLocaleString('en-US')}`, 640, 408);
    ctx.font = `600 17px ${FONT}`;
    ctx.fillStyle = 'rgba(246, 239, 226, 0.8)';
    ctx.fillText(info?.final ? 'The city is yours. One last ride awaits.' : 'Autosaved. The next marker is on your map.', 640, 452);
    ctx.restore();
    if (info?.final) {
      this.drawButton(ctx, game, 520, 500, 240, 46, 'FINALE', 'continue', { index: 0 });
    } else {
      this.drawButton(ctx, game, 520, 500, 240, 46, 'CONTINUE', 'continue', { index: 0 });
    }
  }

  drawMissionFailed(ctx, game) {
    this.dim(ctx, 0.66);
    const info = game.missionFailed;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = `900 74px ${FONT}`;
    ctx.fillStyle = '#ff6b6b';
    ctx.shadowColor = 'rgba(180, 30, 50, 0.55)';
    ctx.shadowBlur = 22;
    ctx.fillText('MISSION FAILED', 640, 260);
    ctx.shadowBlur = 0;
    ctx.font = `800 26px ${FONT}`;
    ctx.fillStyle = '#ffe6b5';
    ctx.fillText(info?.def?.title?.toUpperCase() || 'THE JOB', 640, 306);
    ctx.font = `600 20px ${FONT}`;
    ctx.fillStyle = 'rgba(246, 239, 226, 0.86)';
    ctx.fillText(info?.reason || 'The job went sideways.', 640, 352);
    ctx.restore();
    this.drawButton(ctx, game, 390, 412, 240, 48, 'RETRY', 'retry', { index: 0 });
    this.drawButton(ctx, game, 650, 412, 240, 48, 'DROP MISSION', 'abandon', { index: 1 });
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = `700 14px ${FONT}`;
    ctx.fillStyle = 'rgba(255, 238, 214, 0.5)';
    ctx.fillText('ENTER retries · ESC drops the job and returns to free roam', 640, 492);
    ctx.restore();
  }

  drawWasted(ctx, game, word, color, subtitle) {
    ctx.save();
    const grad = ctx.createRadialGradient(640, 360, 60, 640, 360, 760);
    grad.addColorStop(0, `rgba(20, 10, 16, 0.5)`);
    grad.addColorStop(1, word === 'WASTED' ? 'rgba(70, 8, 18, 0.86)' : 'rgba(8, 24, 56, 0.86)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1280, 720);
    ctx.textAlign = 'center';
    ctx.font = `900 118px ${FONT}`;
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 28;
    ctx.fillText(word, 640, 334);
    ctx.shadowBlur = 0;
    ctx.font = `800 22px ${FONT}`;
    ctx.fillStyle = '#f6efe2';
    ctx.fillText(`${subtitle} $${word === 'WASTED' ? 500 : 500}`, 640, 388);
    ctx.font = `600 17px ${FONT}`;
    ctx.fillStyle = 'rgba(246, 239, 226, 0.7)';
    ctx.fillText(word === 'WASTED' ? 'Costa Sol General will take you back at the hospital.' : 'Costa Sol PD will release you outside headquarters.', 640, 418);
    const remaining = Math.max(0, 1 - game.stateTimer / game.stateDuration);
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    rr(ctx, 490, 462, 300, 8, 4);
    ctx.fill();
    ctx.fillStyle = color;
    rr(ctx, 490, 462, 300 * remaining, 8, 4);
    ctx.fill();
    ctx.restore();
  }

  drawEnding(ctx, game) {
    this.dim(ctx, 0.6);
    const grad = ctx.createLinearGradient(0, 0, 1280, 720);
    grad.addColorStop(0, 'rgba(80, 30, 60, 0.3)');
    grad.addColorStop(1, 'rgba(10, 8, 18, 0.7)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1280, 720);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = `900 15px ${FONT}`;
    ctx.fillStyle = '#ff9db0';
    ctx.fillText('THE COSTA SOL STORY', 640, 172);
    ctx.font = `900 82px ${FONT}`;
    ctx.fillStyle = '#ffe6b5';
    ctx.shadowColor = 'rgba(255, 180, 100, 0.5)';
    ctx.shadowBlur = 30;
    ctx.fillText('THE CITY IS YOURS', 640, 268);
    ctx.shadowBlur = 0;
    ctx.font = `600 21px ${FONT}`;
    ctx.fillStyle = 'rgba(246, 239, 226, 0.88)';
    ctx.fillText('Silas Crowe is finished. Maya has the ledger. The sun is still warm.', 640, 316);
    ctx.font = `800 24px ${FONT}`;
    ctx.fillStyle = '#ffd166';
    ctx.fillText(`MISSIONS ${game.missions.completedCount}/5    ·    CASH $${game.player.money.toLocaleString('en-US')}`, 640, 366);
    ctx.font = `600 16px ${FONT}`;
    ctx.fillStyle = 'rgba(246, 239, 226, 0.65)';
    ctx.fillText('Thank you for playing Leonida Heat.', 640, 402);
    ctx.restore();
    this.drawButton(ctx, game, 510, 470, 260, 48, 'RETURN TO TITLE', 'title', { index: 0 });
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = `700 14px ${FONT}`;
    ctx.fillStyle = 'rgba(255, 238, 214, 0.5)';
    ctx.fillText('Free roam is still open from Continue.', 640, 552);
    ctx.restore();
  }

  panel(ctx, cx, cy, w, h, title) {
    ctx.save();
    ctx.fillStyle = 'rgba(14, 12, 20, 0.94)';
    rr(ctx, cx - w / 2, cy - h / 2, w, h, 12);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 209, 102, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = '#ffd166';
    ctx.fillRect(cx - w / 2, cy - h / 2, 6, h);
    ctx.font = `900 30px ${FONT}`;
    ctx.fillStyle = '#ffe6b5';
    ctx.textAlign = 'left';
    ctx.fillText(title, cx - w / 2 + 48, cy - h / 2 + 56);
    ctx.restore();
  }

  hitButton(x, y) {
    for (const b of this.buttons) {
      if (b.disabled) continue;
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b.action;
    }
    return null;
  }

  buttonCount() {
    return this.buttons.filter((b) => !b.disabled).length;
  }

  moveMenu(delta, game) {
    const buttons = this.buttons.filter((b) => !b.disabled);
    if (!buttons.length) return;
    let index = this.menuIndex;
    if (index >= buttons.length) index = 0;
    index = (index + delta + buttons.length) % buttons.length;
    this.menuIndex = index;
    void game;
  }
}

export function weaponLabel(id) {
  return WEAPON_CONFIG[id]?.name || id;
}

export const UI_FONT = FONT;
