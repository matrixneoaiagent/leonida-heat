// Leonida Heat v3 - the heads-up display and front end.
// Drawn on the same 1280 x 720 canvas as the world: damage-ghosted health,
// armor, cash/score, heat stars and status, a panned minimap with coast,
// districts, roads, POIs, police and objectives, a live clock and weather
// line, weapon/ammo + grenades, mission banner with steps and timers,
// notification feed, radio, objective arrow, prompts, the mixtape counter and
// every screen from the title to the ending. Dialogue carries portraits.

import {
  GAME_TITLE, GAME_SUBTITLE, GAME_VERSION, PALETTE, WEAPON_CONFIG, WANTED_CONFIG,
  RADIO_STATIONS, COLLECTIBLE_CONFIG, WEATHER_CONFIG, districtAt,
} from './config.js';

const FONT = '"Segoe UI", "Helvetica Neue", Arial, sans-serif';
const MONO = '"Consolas", "SFMono-Regular", "Menlo", monospace';
const TAU = Math.PI * 2;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

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

function starPath(ctx, x, y, r) {
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

function moneyText(value) {
  return `$${Math.round(value).toLocaleString('en-US')}`;
}

function clockText(t) {
  const value = ((t % 1) + 1) % 1;
  const hours = Math.floor(value * 24);
  const minutes = Math.floor((value * 24 - hours) * 60);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function weatherLabel(game) {
  const type = game.weather?.type || 'clear';
  return WEATHER_CONFIG.labels[type] || 'CLEAR';
}

function phaseLabel(t) {
  if (t >= 0.205 && t < 0.305) return 'DAWN';
  if (t >= 0.305 && t < 0.655) return 'DAY';
  if (t >= 0.655 && t < 0.775) return 'DUSK';
  return 'NIGHT';
}

function hashString(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

export class HUD {
  constructor() {
    this.toasts = [];
    this.dialog = null;
    this.dialogTimer = 0;
    this.banner = null;
    this.district = null;
    this.districtTimer = 0;
    this.displayedMoney = 750;
    this.moneyFlash = 0;
    this.displayedHealth = 100;
    this.displayedArmor = 25;
    this.healthGhost = 100;
    this.armorGhost = 25;
    this.damageFlash = 0;
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
    this.mapCanvas = null;
    this.mapCity = null;
    this.toastRise = 0;
    this.collectibleFlash = 0;
    this.stunt = null;
    this.stuntTimer = 0;
    this.chatter = null;
    this.chatterTimer = 0;
  }

  showToast(text, type = 'neutral', duration = 2.6) {
    this.toasts.push({ text, type, timer: duration, max: duration, born: this.titleTime, offset: this.toastRise });
    this.toastRise += 1;
    if (this.toasts.length > 5) this.toasts.shift();
  }

  showChatter(speaker, text, duration = 5) {
    this.chatter = { speaker, text };
    this.chatterTimer = duration;
  }

  showDialog(speaker, text, portrait = null) {
    this.dialog = { speaker, text, portrait: portrait || speaker.toLowerCase() };
    this.dialogTimer = 0;
  }

  showMissionBanner(def, index) {
    this.banner = {
      title: def.title,
      index,
      total: def.steps?.length || 0,
      step: 1,
      text: def.steps?.[0]?.text || def.intro || '',
      timer: 4.6,
      max: 4.6,
    };
  }

  showStunt(label, cash, air) {
    this.stunt = { label, cash, air };
    this.stuntTimer = 3.6;
  }

  setDistrict(name, sub) {
    this.district = { name, sub };
    this.districtTimer = 4.2;
  }

  update(dt, game) {
    this.titleTime += dt;
    for (let i = this.toasts.length - 1; i >= 0; i -= 1) {
      this.toasts[i].timer -= dt;
      if (this.toasts[i].timer <= 0) this.toasts.splice(i, 1);
    }
    if (this.banner) {
      this.banner.timer -= dt;
      const step = game.missions?.active ? game.missions.step : null;
      if (step) {
        this.banner.step = (game.missions.stepIndex || 0) + 1;
        this.banner.text = step.text || '';
      }
      if (this.banner.timer <= 0) this.banner = null;
    }
    if (this.districtTimer > 0) this.districtTimer -= dt;
    if (this.dialog) this.dialogTimer += dt;
    if (this.stuntTimer > 0) {
      this.stuntTimer -= dt;
      if (this.stuntTimer <= 0) this.stunt = null;
    }
    if (this.chatterTimer > 0) {
      this.chatterTimer -= dt;
      if (this.chatterTimer <= 0) this.chatter = null;
    }

    const p = game.player;
    if (p) {
      const target = p.money;
      const diff = target - this.displayedMoney;
      if (Math.abs(diff) > 0.5) {
        this.displayedMoney += diff * Math.min(1, dt * 6.5);
        this.moneyFlash = Math.min(1, this.moneyFlash + dt * 2.2);
      } else {
        this.displayedMoney = target;
      }
      const healthTarget = p.health;
      const armorTarget = p.armor;
      this.displayedHealth += (healthTarget - this.displayedHealth) * Math.min(1, dt * 8.5);
      this.displayedArmor += (armorTarget - this.displayedArmor) * Math.min(1, dt * 8.5);
      // Ghost bars catch up slowly, leaving a readable red/blue trail.
      if (this.healthGhost < healthTarget) this.healthGhost += (healthTarget - this.healthGhost) * Math.min(1, dt * 3);
      else this.healthGhost += (healthTarget - this.healthGhost) * Math.min(1, dt * 0.9);
      if (this.armorGhost < armorTarget) this.armorGhost += (armorTarget - this.armorGhost) * Math.min(1, dt * 3);
      else this.armorGhost += (armorTarget - this.armorGhost) * Math.min(1, dt * 0.9);
      if (healthTarget < this.healthGhost - 0.5) this.damageFlash = Math.min(1, this.damageFlash + dt * 7);
    }
    this.moneyFlash = Math.max(0, this.moneyFlash - dt * 1.4);
    this.damageFlash = Math.max(0, this.damageFlash - dt * 1.9);
    this.radioVisible = Math.max(0, this.radioVisible - dt);
    this.mutedNotice = Math.max(0, this.mutedNotice - dt);
    this.toastRise = Math.max(0, this.toastRise - dt * 1.6);
    this.collectibleFlash = Math.max(0, this.collectibleFlash - dt * 1.2);

    const stars = game.police?.wantedStars || 0;
    if (stars !== this.lastWanted) {
      this.lastWanted = stars;
      if (stars > 0) this.starFlash = 1;
    }
    this.starFlash = Math.max(0, this.starFlash - dt * 1.8);
  }

  // =================================================================
  // HUD
  // =================================================================
  drawHUD(ctx, game) {
    if (['paused', 'wasted', 'busted', 'missionComplete', 'missionFailed'].includes(game.state)) {
      this.drawStats(ctx, game);
      this.drawMinimap(ctx, game);
      if (game.state === 'paused') this.drawWeapon(ctx, game);
      return;
    }
    this.drawStats(ctx, game);
    this.drawMinimap(ctx, game);
    this.drawWeapon(ctx, game);
    this.drawObjective(ctx, game);
    this.drawDistrict(ctx, game);
    this.drawToasts(ctx, game);
    this.drawRadio(ctx, game);
    this.drawWanted(ctx, game);
    this.drawObjectiveArrow(ctx, game);
    this.drawChatter(ctx, game);
    if (!this.banner) this.drawPrompt(ctx, game);
    this.drawBustedMeter(ctx, game);
    this.drawStunt(ctx, game);
    if (this.banner) this.drawMissionBanner(ctx, game);
  }

  drawChatter(ctx, game) {
    if (!this.chatter || game.state !== 'playing') return;
    const alpha = clamp(this.chatterTimer / 0.5, 0, 1);
    const x = 296;
    const y = 544;
    const w = 688;
    const h = 66;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(12, 10, 18, 0.88)';
    rr(ctx, x, y, w, h, 9);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 209, 102, 0.28)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#ff9db0';
    ctx.beginPath();
    ctx.arc(x + 22, y + 21, 10, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#1b1520';
    ctx.font = `900 10px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(String(this.chatter.speaker || '?').slice(0, 1).toUpperCase(), x + 22, y + 25);
    ctx.textAlign = 'left';
    ctx.font = `900 10px ${FONT}`;
    ctx.fillStyle = '#ff9db0';
    ctx.fillText(String(this.chatter.speaker).toUpperCase(), x + 40, y + 19);
    ctx.font = `600 13px ${FONT}`;
    ctx.fillStyle = '#f6efe2';
    const lines = wrap(ctx, this.chatter.text, w - 70).slice(0, 2);
    lines.forEach((line, i) => ctx.fillText(line, x + 40, y + 37 + i * 17));
    ctx.restore();
  }

  drawStats(ctx, game) {
    const p = game.player;
    const x = 22;
    const y = 16;
    const w = 324;
    const h = 196;
    ctx.save();
    ctx.fillStyle = 'rgba(16, 14, 24, 0.84)';
    rr(ctx, x, y, w, h, 14);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 214, 150, 0.2)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = 'rgba(255, 209, 102, 0.075)';
    rr(ctx, x + 1, y + 1, w - 2, 32, 12);
    ctx.fill();
    ctx.fillStyle = '#ff6f91';
    ctx.fillRect(x, y + 16, 4, 20);

    ctx.font = `800 10px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(246, 239, 226, 0.5)';
    ctx.fillText('LEO CALDER  ·  COSTA SOL', x + 18, y + 21);

    ctx.font = `900 27px ${FONT}`;
    ctx.fillStyle = this.moneyFlash > 0.03 ? '#c9ffb7' : '#ffd166';
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = 6;
    ctx.fillText(moneyText(this.displayedMoney), x + 18, y + 56);
    ctx.shadowBlur = 0;
    ctx.font = `800 8px ${FONT}`;
    ctx.fillStyle = 'rgba(246, 239, 226, 0.46)';
    ctx.fillText('CASH', x + 19, y + 68);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#8fe3a3';
    ctx.font = `900 16px ${FONT}`;
    ctx.fillText(`${Math.round(p.score || 0).toLocaleString('en-US')}`, x + w - 18, y + 49);
    ctx.font = `800 8px ${FONT}`;
    ctx.fillStyle = 'rgba(143, 227, 163, 0.6)';
    ctx.fillText('SCORE', x + w - 18, y + 63);

    // Health and its ghost.
    ctx.textAlign = 'left';
    ctx.font = `800 9px ${FONT}`;
    ctx.fillStyle = 'rgba(246, 239, 226, 0.64)';
    ctx.fillText('HEALTH', x + 18, y + 87);
    const hx = x + 76;
    const hw = w - 126;
    ctx.fillStyle = 'rgba(8, 8, 14, 0.74)';
    rr(ctx, hx, y + 77, hw, 13, 6);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 92, 96, 0.44)';
    rr(ctx, hx, y + 77, Math.max(0, hw * clamp(this.healthGhost / p.maxHealth, 0, 1)), 13, 6);
    ctx.fill();
    const hp = clamp(this.displayedHealth / p.maxHealth, 0, 1);
    const low = p.health / p.maxHealth < 0.3;
    const hg = ctx.createLinearGradient(hx, 0, hx + hw, 0);
    if (low) {
      hg.addColorStop(0, '#ff4f5f');
      hg.addColorStop(1, '#ff9a62');
    } else {
      hg.addColorStop(0, '#48c98a');
      hg.addColorStop(0.65, '#9fe06a');
      hg.addColorStop(1, '#e7e36a');
    }
    ctx.fillStyle = hg;
    rr(ctx, hx, y + 77, Math.max(3, hw * hp), 13, 6);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.24)';
    rr(ctx, hx, y + 78, Math.max(3, hw * hp), 4, 3);
    ctx.fill();
    if (low) {
      const pulse = 0.35 + 0.35 * Math.sin(this.titleTime * 8);
      ctx.strokeStyle = `rgba(255, 90, 100, ${pulse})`;
      ctx.lineWidth = 1.5;
      rr(ctx, hx - 1, y + 76, hw + 2, 15, 7);
      ctx.stroke();
    }
    ctx.font = `900 10px ${FONT}`;
    ctx.fillStyle = '#f6efe2';
    ctx.textAlign = 'right';
    ctx.fillText(`${Math.ceil(p.health)}`, x + w - 18, y + 87);

    // Armor and its ghost.
    ctx.textAlign = 'left';
    ctx.font = `800 9px ${FONT}`;
    ctx.fillStyle = 'rgba(246, 239, 226, 0.54)';
    ctx.fillText('ARMOR', x + 18, y + 111);
    ctx.fillStyle = 'rgba(8, 8, 14, 0.74)';
    rr(ctx, hx, y + 102, hw, 8, 4);
    ctx.fill();
    ctx.fillStyle = 'rgba(111, 183, 255, 0.3)';
    rr(ctx, hx, y + 102, Math.max(0, hw * clamp(this.armorGhost / p.maxArmor, 0, 1)), 8, 4);
    ctx.fill();
    ctx.fillStyle = '#6fb7ff';
    rr(ctx, hx, y + 102, Math.max(0, hw * clamp(this.displayedArmor / p.maxArmor, 0, 1)), 8, 4);
    ctx.fill();
    ctx.font = `900 9px ${FONT}`;
    ctx.fillStyle = 'rgba(246, 239, 226, 0.52)';
    ctx.textAlign = 'right';
    ctx.fillText(`${Math.ceil(p.armor)}`, x + w - 18, y + 110);

    // Wanted stars and the collectible / grenade strip, inside the card.
    ctx.strokeStyle = 'rgba(255, 214, 150, 0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 18, y + 130);
    ctx.lineTo(x + w - 18, y + 130);
    ctx.stroke();
    this.drawStars(ctx, x + 21, y + 158, game.police?.wantedStars || 0);
    const col = game.collectibles;
    const found = col?.foundCount ?? 0;
    const total = col?.total ?? COLLECTIBLE_CONFIG.total;
    ctx.textAlign = 'left';
    ctx.font = `800 9px ${FONT}`;
    ctx.fillStyle = 'rgba(246, 239, 226, 0.5)';
    ctx.fillText('MIXTAPES', x + 21, y + 186);
    ctx.fillStyle = '#ffcf5c';
    ctx.font = `900 10px ${FONT}`;
    ctx.fillText(`${found}/${total}`, x + 78, y + 186);
    for (let i = 0; i < total; i += 1) {
      const px = x + 118 + i * 9;
      ctx.fillStyle = i < found ? '#ffcf5c' : 'rgba(255,255,255,0.14)';
      ctx.fillRect(px, y + 178, 5, 9);
      ctx.fillStyle = i < found ? 'rgba(30,24,16,0.6)' : 'transparent';
      ctx.fillRect(px + 1, y + 181, 3, 2);
    }
    ctx.textAlign = 'right';
    ctx.font = `800 9px ${FONT}`;
    ctx.fillStyle = p.grenades > 0 ? '#b5e36b' : 'rgba(246,239,226,0.35)';
    ctx.fillText(`GRENADES ${p.grenades}/${p.maxGrenades}`, x + w - 18, y + 186);

    if (this.damageFlash > 0.02) {
      ctx.strokeStyle = `rgba(255, 80, 80, ${this.damageFlash * 0.65})`;
      ctx.lineWidth = 2;
      rr(ctx, x - 1, y - 1, w + 2, h + 2, 15);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawStars(ctx, x, y, stars) {
    const pulse = 1 + Math.max(0, this.starFlash) * 0.25 + Math.sin(this.titleTime * 6) * (stars > 0 ? 0.035 : 0);
    ctx.save();
    for (let i = 0; i < 5; i += 1) {
      starPath(ctx, x + i * 21, y, 8 * (i < stars ? pulse : 1));
      if (i < stars) {
        ctx.fillStyle = '#ffd166';
        ctx.shadowColor = 'rgba(255, 190, 80, 0.65)';
        ctx.shadowBlur = 8;
        ctx.fill();
        ctx.shadowBlur = 0;
      } else {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.13)';
        ctx.fill();
      }
    }
    ctx.restore();
  }

  drawWanted(ctx, game) {
    const stars = game.police?.wantedStars || 0;
    if (stars <= 0) return;
    const cfg = WANTED_CONFIG.levels[stars];
    const searching = game.police.searching;
    const line = searching ? 'SEARCHING - BREAK LINE OF SIGHT' : cfg.response;
    const y = 232;
    ctx.save();
    const pulse = 0.55 + 0.45 * Math.sin(this.titleTime * 5);
    ctx.fillStyle = searching ? `rgba(255, 92, 96, ${0.1 + pulse * 0.1})` : 'rgba(255, 209, 102, 0.1)';
    rr(ctx, 22, y, 324, 22, 6);
    ctx.fill();
    ctx.strokeStyle = searching ? 'rgba(255, 92, 96, 0.55)' : 'rgba(255, 209, 102, 0.45)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.font = `900 10px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillStyle = searching ? '#ff8b91' : '#ffd166';
    ctx.fillText(`WANTED ${stars}  ·  ${line}`, 34, y + 15);
    if (searching) {
      const cool = clamp(1 - (game.police.cooldownTimer || 0) / WANTED_CONFIG.cooldownTime, 0, 1);
      ctx.fillStyle = 'rgba(255, 92, 96, 0.2)';
      rr(ctx, 34, y + 18, 300, 3, 1.5);
      ctx.fill();
      ctx.fillStyle = '#ff8b91';
      rr(ctx, 34, y + 18, 300 * cool, 3, 1.5);
      ctx.fill();
    }
    ctx.restore();
  }

  drawMinimap(ctx, game) {
    const size = 236;
    const x = 1280 - 22 - size;
    const y = 18;
    const pad = 8;
    const inner = size - pad * 2;
    const cx = x + size / 2;
    const cy = y + size / 2;
    const player = game.player;
    const radiusWorld = 880;
    const scale = inner / (radiusWorld * 2);

    ctx.save();
    ctx.fillStyle = 'rgba(8, 13, 19, 0.94)';
    rr(ctx, x, y, size, size, 14);
    ctx.fill();
    ctx.strokeStyle = 'rgba(214, 232, 240, 0.36)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255, 209, 102, 0.42)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 12; i += 1) {
      const a = (i / 12) * TAU;
      const r1 = size / 2 - 2;
      const r2 = r1 - (i % 3 === 0 ? 8 : 4);
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      ctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
      ctx.stroke();
    }

    ctx.save();
    rr(ctx, x + pad, y + pad, inner, inner, 8);
    ctx.clip();
    ctx.translate(cx, cy);

    const map = this.ensureMap(game);
    ctx.drawImage(
      map,
      (player.x / 3200) * 512 - (radiusWorld / 3200) * 512,
      (player.y / 3200) * 512 - (radiusWorld / 3200) * 512,
      (radiusWorld * 2 / 3200) * 512,
      (radiusWorld * 2 / 3200) * 512,
      -inner / 2, -inner / 2, inner, inner,
    );

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.035)';
    ctx.lineWidth = 1;
    for (let g = -inner / 2; g <= inner / 2; g += 26) {
      ctx.beginPath();
      ctx.moveTo(g, -inner / 2);
      ctx.lineTo(g, inner / 2);
      ctx.moveTo(-inner / 2, g);
      ctx.lineTo(inner / 2, g);
      ctx.stroke();
    }

    // Puddles of light in the streets.
    ctx.fillStyle = 'rgba(255, 209, 102, 0.09)';
    for (const p of game.pickups?.pickups || []) {
      if (p.active) this.blip(ctx, (p.x - player.x) * scale, (p.y - player.y) * scale, 1.5, p.def.color, false);
    }

    // Mixtapes.
    for (const item of game.collectibles?.items || []) {
      if (item.found) continue;
      const px = (item.x - player.x) * scale;
      const py = (item.y - player.y) * scale;
      if (Math.abs(px) > inner / 2 - 6 || Math.abs(py) > inner / 2 - 6) continue;
      ctx.fillStyle = item.color;
      ctx.fillRect(px - 1.5, py - 1.5, 3, 3);
    }

    // Garages.
    for (const g of game.city.garages || []) {
      const px = (g.x - player.x) * scale;
      const py = (g.y - player.y) * scale;
      if (Math.abs(px) > inner / 2 - 6 || Math.abs(py) > inner / 2 - 6) continue;
      ctx.fillStyle = '#ffb45c';
      ctx.fillRect(px - 2, py - 2, 4, 4);
    }

    // Police.
    for (const cop of game.police?.cops || []) {
      this.blip(ctx, (cop.x - player.x) * scale, (cop.y - player.y) * scale, 3.2, cop.sirenPhase ? '#5aa8ff' : '#ff5d6c', true);
    }
    for (const cop of game.police?.footCops || []) {
      if (!cop.isDead) this.blip(ctx, (cop.x - player.x) * scale, (cop.y - player.y) * scale, 2.4, '#5aa8ff', false);
    }

    // POIs, nearest nine.
    const pois = (game.city.pois || [])
      .map((p) => ({ p, d: Math.hypot(p.x - player.x, p.y - player.y) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 9);
    for (const { p } of pois) {
      const px = (p.x - player.x) * scale;
      const py = (p.y - player.y) * scale;
      if (Math.abs(px) > inner / 2 - 6 || Math.abs(py) > inner / 2 - 6) continue;
      this.drawPoiIcon(ctx, px, py, p.type);
    }

    // Objective.
    const marker = game.missions?.availableMarker?.();
    const target = marker || (game.missions?.active ? game.missions.currentTarget() : null);
    if (target) {
      let px = (target.x - player.x) * scale;
      let py = (target.y - player.y) * scale;
      const max = inner / 2 - 8;
      const d = Math.hypot(px, py);
      if (d > max) {
        px = (px / d) * max;
        py = (py / d) * max;
      }
      const pulse = 0.7 + 0.3 * Math.sin(this.titleTime * 4);
      ctx.fillStyle = '#ffd166';
      ctx.strokeStyle = 'rgba(30, 24, 16, 0.85)';
      ctx.lineWidth = 1.5;
      starPath(ctx, px, py, 6 * pulse);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = 'rgba(255, 209, 102, 0.18)';
      ctx.beginPath();
      ctx.arc(px, py, 10 * pulse, 0, TAU);
      ctx.fill();
    }

    // Player heading arrow.
    ctx.save();
    ctx.rotate(player.angle + Math.PI / 2);
    ctx.fillStyle = '#f6efe2';
    ctx.strokeStyle = 'rgba(12, 12, 18, 0.8)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(6, 7);
    ctx.lineTo(0, 4);
    ctx.lineTo(-6, 7);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // North marker.
    ctx.fillStyle = '#ffd166';
    ctx.font = `900 11px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('N', 0, -inner / 2 + 16);
    ctx.beginPath();
    ctx.moveTo(0, -inner / 2 + 8);
    ctx.lineTo(4, -inner / 2 + 2);
    ctx.lineTo(-4, -inner / 2 + 2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Frame labels.
    ctx.fillStyle = 'rgba(8, 13, 19, 0.78)';
    rr(ctx, x + pad + 4, y + size - 28, 96, 18, 6);
    ctx.fill();
    ctx.font = `900 9px ${FONT}`;
    ctx.fillStyle = '#f6efe2';
    ctx.textAlign = 'left';
    const d = districtAt(player.x, player.y);
    ctx.fillText(d.short, x + pad + 12, y + size - 16);
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(246, 239, 226, 0.6)';
    ctx.fillText('LIVE', x + size - 12, y + size - 16);

    // Clock + weather beneath the map.
    const boxY = y + size + 8;
    ctx.fillStyle = 'rgba(14, 12, 20, 0.84)';
    rr(ctx, x, boxY, size, 44, 10);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 209, 102, 0.16)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.textAlign = 'left';
    ctx.font = `900 17px ${MONO}`;
    ctx.fillStyle = '#ffe6b5';
    ctx.fillText(clockText(game.timeOfDay), x + 14, boxY + 21);
    ctx.font = `800 8px ${FONT}`;
    ctx.fillStyle = 'rgba(246, 239, 226, 0.45)';
    ctx.fillText(`${phaseLabel(game.timeOfDay)}  ·  COSTA SOL`, x + 14, boxY + 34);
    const wType = game.weather?.type || 'clear';
    const wColor = wType === 'storm' ? '#9db8ff' : wType === 'rain' ? '#87d6e8' : wType === 'haze' ? '#e8cfa0' : '#ffd166';
    ctx.textAlign = 'right';
    ctx.font = `900 11px ${FONT}`;
    ctx.fillStyle = wColor;
    ctx.fillText(weatherLabel(game), x + size - 14, boxY + 19);
    ctx.font = `700 8px ${FONT}`;
    ctx.fillStyle = 'rgba(246, 239, 226, 0.46)';
    const temp = wType === 'storm' ? '24°' : wType === 'rain' ? '25°' : wType === 'haze' ? '31°' : '29°';
    ctx.fillText(`${temp}  ·  ${Math.round((game.weather?.wetness || 0) * 100)}% WET`, x + size - 14, boxY + 33);
    ctx.restore();
  }

  ensureMap(game) {
    if (this.mapCity === game.city && this.mapCanvas) return this.mapCanvas;
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const s = size / 3200;
    ctx.fillStyle = '#1a2228';
    ctx.fillRect(0, 0, size, size);

    for (const block of game.city.blocks) {
      const dist = districtAt(block.x, block.y);
      ctx.fillStyle = dist.map;
      ctx.fillRect(block.xMin * s, block.yMin * s, block.w * s, block.h * s);
      ctx.strokeStyle = 'rgba(222, 210, 184, 0.14)';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(block.xMin * s, block.yMin * s, block.w * s, block.h * s);
      if (block.kind === 'park') {
        ctx.fillStyle = 'rgba(86, 126, 74, 0.9)';
        ctx.fillRect(block.xMin * s + 2, block.yMin * s + 2, block.w * s - 4, block.h * s - 4);
      }
    }

    ctx.fillStyle = '#174b62';
    ctx.fillRect(2712 * s, 0, (3200 - 2712) * s, size);
    ctx.fillStyle = '#2a7085';
    ctx.fillRect(2820 * s, 0, (3200 - 2820) * s, size);
    ctx.fillStyle = '#d9c293';
    ctx.fillRect(2480 * s, 0, 232 * s, size);
    ctx.fillStyle = '#bf9463';
    ctx.fillRect(2494 * s, 0, 58 * s, size);

    for (const road of game.city.roads) {
      ctx.strokeStyle = road.kind === 'highway' ? '#f0e5ca' : '#dcd2bd';
      ctx.lineWidth = Math.max(1.2, road.width * s * 0.92);
      ctx.beginPath();
      ctx.moveTo(road.x1 * s, road.y1 * s);
      ctx.lineTo(road.x2 * s, road.y2 * s);
      ctx.stroke();
    }
    for (const pier of game.city.piers) {
      ctx.fillStyle = '#b88f63';
      ctx.fillRect((pier.x - pier.w / 2) * s, (pier.y - pier.h / 2) * s, pier.w * s, pier.h * s);
    }
    ctx.strokeStyle = 'rgba(235, 253, 250, 0.8)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(2712 * s, 0);
    ctx.lineTo(2712 * s, size);
    ctx.stroke();

    this.mapCanvas = canvas;
    this.mapCity = game.city;
    return canvas;
  }

  blip(ctx, x, y, r, color, ring) {
    const inner = 110;
    if (Math.abs(x) > inner || Math.abs(y) > inner) return;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
    if (ring) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  drawPoiIcon(ctx, x, y, type) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = 'rgba(240, 232, 214, 0.76)';
    if (type === 'cross' || type === 'hospital') {
      ctx.fillRect(-1.5, -4, 3, 8);
      ctx.fillRect(-4, -1.5, 8, 3);
    } else if (type === 'shield' || type === 'police') {
      ctx.beginPath();
      ctx.moveTo(0, -4);
      ctx.lineTo(3.5, -2);
      ctx.lineTo(2.5, 3);
      ctx.lineTo(0, 4.5);
      ctx.lineTo(-2.5, 3);
      ctx.lineTo(-3.5, -2);
      ctx.closePath();
      ctx.fill();
    } else if (type === 'home' || type === 'safehouse') {
      ctx.beginPath();
      ctx.moveTo(0, -4);
      ctx.lineTo(4, 0);
      ctx.lineTo(2.6, 0);
      ctx.lineTo(2.6, 4);
      ctx.lineTo(-2.6, 4);
      ctx.lineTo(-2.6, 0);
      ctx.lineTo(-4, 0);
      ctx.closePath();
      ctx.fill();
    } else if (type === 'tree') {
      ctx.beginPath();
      ctx.arc(0, -1, 3.2, 0, TAU);
      ctx.fill();
      ctx.fillRect(-0.7, 1, 1.4, 3);
    } else if (type === 'anchor' || type === 'wave') {
      ctx.strokeStyle = 'rgba(240, 232, 214, 0.76)';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.arc(0, -2, 2.5, 0, TAU);
      ctx.moveTo(0, 0.5);
      ctx.lineTo(0, 4);
      ctx.moveTo(-3, 2);
      ctx.quadraticCurveTo(0, 6, 3, 2);
      ctx.stroke();
    } else if (type === 'car') {
      ctx.fillRect(-3.5, -2, 7, 4);
      ctx.fillStyle = '#2a2a2a';
      ctx.fillRect(-2.2, -3, 4.4, 1.5);
    } else if (type === 'fuel') {
      ctx.fillRect(-2.5, -4, 5, 8);
      ctx.fillStyle = '#2a2a2a';
      ctx.fillRect(-1, -2, 2, 4);
    } else if (type === 'wrench') {
      ctx.strokeStyle = 'rgba(240, 232, 214, 0.8)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(0, -2, 2, 0.4, Math.PI * 1.8);
      ctx.moveTo(1, -1);
      ctx.lineTo(3, 4);
      ctx.stroke();
    } else if (type === 'crate' || type === 'diner' || type === 'shop') {
      ctx.fillRect(-3, -3, 6, 6);
      ctx.strokeStyle = 'rgba(42, 38, 32, 0.7)';
      ctx.lineWidth = 1;
      ctx.strokeRect(-3, -3, 6, 6);
    } else {
      ctx.beginPath();
      ctx.arc(0, 0, 2.6, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  drawWeapon(ctx, game) {
    const p = game.player;
    const w = p.weapon;
    const x = 1280 - 24 - 268;
    const y = 720 - 24 - 114;
    const cardW = 268;
    const cardH = 114;
    const mag = p.ammo[w.id];
    ctx.save();
    ctx.fillStyle = 'rgba(16, 14, 22, 0.88)';
    rr(ctx, x, y, cardW, cardH, 12);
    ctx.fill();
    ctx.strokeStyle = PALETTE.uiLine;
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.font = `800 9px ${FONT}`;
    ctx.fillStyle = 'rgba(246, 239, 226, 0.48)';
    ctx.textAlign = 'left';
    ctx.fillText('WEAPON', x + 16, y + 19);
    ctx.font = `900 17px ${FONT}`;
    ctx.fillStyle = '#f6efe2';
    ctx.fillText(w.name.toUpperCase(), x + 16, y + 41);

    ctx.save();
    ctx.translate(x + 38, y + 72);
    ctx.fillStyle = w.tint || '#cfd6dd';
    if (w.id === 'fists') {
      ctx.beginPath();
      ctx.arc(0, 0, 8, 0, TAU);
      ctx.fill();
    } else if (w.id === 'shotgun') {
      ctx.fillRect(-14, -2.5, 32, 5);
      ctx.fillStyle = '#7b5d40';
      ctx.fillRect(-14, -3, 9, 6);
    } else if (w.id === 'smg') {
      ctx.fillRect(-12, -3, 24, 6);
      ctx.fillRect(-2, 2, 5, 9);
      ctx.fillRect(-8, 2, 4, 7);
    } else if (w.id === 'rifle') {
      ctx.fillRect(-16, -2, 36, 4);
      ctx.fillRect(-2, 1, 6, 6);
      ctx.fillStyle = '#5b4a3a';
      ctx.fillRect(-16, -2.5, 8, 5);
    } else {
      ctx.fillRect(-8, -3, 18, 6);
      ctx.fillRect(-6, 2, 5, 7);
    }
    ctx.restore();

    ctx.textAlign = 'right';
    if (Number.isFinite(w.clipSize)) {
      ctx.font = `900 27px ${FONT}`;
      ctx.fillStyle = mag && mag.clip > 0 ? '#ffd166' : '#ff6b6b';
      ctx.fillText(`${mag?.clip ?? 0}`, x + cardW - 54, y + 51);
      ctx.font = `800 14px ${FONT}`;
      ctx.fillStyle = 'rgba(246, 239, 226, 0.55)';
      ctx.fillText(`/ ${mag?.reserve ?? 0}`, x + cardW - 16, y + 51);
      if (mag && mag.clip > 0) {
        const pips = Math.min(15, mag.clip);
        for (let i = 0; i < pips; i += 1) {
          ctx.fillStyle = 'rgba(255, 209, 102, 0.78)';
          ctx.fillRect(x + 92 + i * 9, y + 62, 4, 12);
        }
      }
    } else {
      ctx.font = `900 22px ${FONT}`;
      ctx.fillStyle = '#ffd166';
      ctx.fillText('∞', x + cardW - 20, y + 51);
    }

    ctx.textAlign = 'left';
    ctx.font = `900 10px ${FONT}`;
    ctx.fillStyle = '#b5e36b';
    ctx.fillText(`GRENADES  ${p.grenades}/${p.maxGrenades}`, x + 16, y + 98);
    ctx.font = `700 9px ${FONT}`;
    ctx.fillStyle = 'rgba(246, 239, 226, 0.35)';
    ctx.textAlign = 'right';
    ctx.fillText('1-5 / WHEEL  ·  R  ·  G THROW', x + cardW - 16, y + 98);

    if (p.isReloading) {
      const progress = 1 - clamp(p.reloadTimer / (w.reloadTime || 1), 0, 1);
      ctx.fillStyle = 'rgba(8, 8, 14, 0.7)';
      rr(ctx, x + 16, y + 104, cardW - 32, 5, 2.5);
      ctx.fill();
      ctx.fillStyle = '#8fe3a3';
      rr(ctx, x + 16, y + 104, (cardW - 32) * progress, 5, 2.5);
      ctx.fill();
    }
    ctx.restore();
  }

  drawObjective(ctx, game) {
    const missions = game.missions;
    const x = 22;
    const y = 262;
    const w = 342;
    if (!missions?.active) {
      // Free-roam card: the next job and the album.
      const marker = missions?.availableMarker?.();
      if (!marker) return;
      ctx.save();
      ctx.fillStyle = 'rgba(16, 14, 22, 0.78)';
      rr(ctx, x, y, w, 74, 11);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 209, 102, 0.22)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = '#ffd166';
      ctx.fillRect(x, y, 4, 74);
      ctx.font = `900 10px ${FONT}`;
      ctx.fillStyle = 'rgba(255, 209, 102, 0.7)';
      ctx.textAlign = 'left';
      ctx.fillText(`NEXT JOB  ·  ${marker.mission.title.toUpperCase()}`, x + 16, y + 20);
      ctx.font = `700 13px ${FONT}`;
      ctx.fillStyle = '#f6efe2';
      const lines = wrap(ctx, marker.mission.intro || 'Find the gold marker.', w - 34).slice(0, 2);
      lines.forEach((line, i) => ctx.fillText(line, x + 16, y + 41 + i * 17));
      ctx.restore();
      return;
    }
    const step = missions.step;
    if (!step) return;
    const def = missions.definition;
    const timer = missions.stepTimeLimit > 0 ? Math.max(0, missions.stepTimeLimit - missions.stepTimer) : null;
    ctx.save();
    ctx.fillStyle = 'rgba(16, 14, 22, 0.84)';
    rr(ctx, x, y, w, timer !== null ? 118 : 104, 11);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 209, 102, 0.28)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#ffd166';
    ctx.fillRect(x, y, 4, timer !== null ? 118 : 104);
    ctx.font = `900 9px ${FONT}`;
    ctx.fillStyle = 'rgba(255, 209, 102, 0.72)';
    ctx.textAlign = 'left';
    ctx.fillText(`JOB ${missions.currentIndex + 1} / 5  ·  ${def.title.toUpperCase()}`, x + 16, y + 20);
    ctx.font = `700 13px ${FONT}`;
    ctx.fillStyle = '#f6efe2';
    const lines = wrap(ctx, step.text, w - 34).slice(0, 2);
    lines.forEach((line, i) => ctx.fillText(line, x + 16, y + 41 + i * 17));
    const total = def.steps.length;
    for (let i = 0; i < total; i += 1) {
      const px = x + 16 + i * 24;
      ctx.fillStyle = i < missions.stepIndex ? '#8fe3a3' : i === missions.stepIndex ? '#ffd166' : 'rgba(255,255,255,0.14)';
      rr(ctx, px, y + 76, 16, 5, 2.5);
      ctx.fill();
    }
    if (timer !== null) {
      ctx.font = `900 13px ${MONO}`;
      ctx.fillStyle = timer < 15 ? '#ff6b6b' : '#ffd166';
      ctx.textAlign = 'right';
      ctx.fillText(`${Math.ceil(timer)}s`, x + w - 16, y + 92);
      ctx.fillStyle = 'rgba(255, 92, 96, 0.18)';
      rr(ctx, x + 16, y + 100, w - 32, 4, 2);
      ctx.fill();
      const frac = clamp(timer / Math.max(1, missions.stepTimeLimit), 0, 1);
      ctx.fillStyle = timer < 15 ? '#ff6b6b' : '#ffd166';
      rr(ctx, x + 16, y + 100, (w - 32) * frac, 4, 2);
      ctx.fill();
    }
    if (this.objectiveHint) {
      ctx.font = `700 10px ${FONT}`;
      ctx.fillStyle = '#8fe3a3';
      ctx.textAlign = 'left';
      ctx.fillText(this.objectiveHint, x + 16, y + (timer !== null ? 116 : 96));
    }
    ctx.restore();
  }

  drawDistrict(ctx, game) {
    if (!this.district || this.districtTimer <= 0) return;
    const alpha = clamp(this.districtTimer / 1.1, 0, 1);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.textAlign = 'center';
    ctx.font = `900 11px ${FONT}`;
    ctx.fillStyle = '#ffd166';
    ctx.fillText('COSTA SOL', 640, 52);
    ctx.font = `900 30px ${FONT}`;
    ctx.fillStyle = '#f6efe2';
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 10;
    ctx.fillText(this.district.name.toUpperCase(), 640, 84);
    ctx.shadowBlur = 0;
    ctx.font = `700 12px ${FONT}`;
    ctx.fillStyle = 'rgba(246, 239, 226, 0.64)';
    ctx.fillText(this.district.sub, 640, 104);
    ctx.restore();
  }

  drawToasts(ctx, game) {
    let y = 302;
    for (const toast of this.toasts) {
      const fadeIn = clamp((toast.max - toast.timer) / 0.22, 0, 1);
      const fadeOut = clamp(toast.timer / 0.6, 0, 1);
      const alpha = fadeIn * fadeOut;
      const colors = {
        neutral: ['rgba(16, 14, 22, 0.9)', '#f6efe2', 'rgba(255,255,255,0.2)'],
        success: ['rgba(16, 34, 24, 0.92)', '#8fe3a3', 'rgba(143,227,163,0.4)'],
        warning: ['rgba(38, 28, 12, 0.92)', '#ffd166', 'rgba(255,209,102,0.4)'],
        danger: ['rgba(42, 14, 18, 0.92)', '#ff8b91', 'rgba(255,92,96,0.48)'],
      };
      const [bg, ink, line] = colors[toast.type] || colors.neutral;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = `700 12px ${FONT}`;
      const width = Math.min(332, ctx.measureText(toast.text).width + 36);
      const x = 1280 - 22 - width;
      const shift = (1 - fadeIn) * 18;
      ctx.fillStyle = bg;
      rr(ctx, x + shift, y, width, 32, 8);
      ctx.fill();
      ctx.strokeStyle = line;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = ink;
      ctx.textAlign = 'left';
      ctx.fillText(toast.text, x + 14 + shift, y + 21);
      ctx.restore();
      y += 39;
    }
    void game;
  }

  drawRadio(ctx, game) {
    const visible = this.radioVisible > 0 || game.state === 'playing';
    if (!visible) return;
    const station = RADIO_STATIONS[game.audio?.stationIndex ?? 0];
    if (!station) return;
    const x = 22;
    const y = 720 - 24 - 62;
    const alpha = this.radioVisible > 0 ? clamp(this.radioVisible / 0.5, 0, 1) : 0.72;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(14, 12, 20, 0.78)';
    rr(ctx, x, y, 300, 62, 10);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 209, 102, 0.2)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = station.color;
    ctx.beginPath();
    ctx.arc(x + 24, y + 31, 14, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#15131b';
    ctx.font = `900 11px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('FM', x + 24, y + 35);
    ctx.textAlign = 'left';
    ctx.font = `900 12px ${FONT}`;
    ctx.fillStyle = '#f6efe2';
    ctx.fillText(station.name, x + 46, y + 22);
    ctx.font = `700 10px ${FONT}`;
    ctx.fillStyle = 'rgba(246, 239, 226, 0.55)';
    ctx.fillText(`${station.genre}  ·  Q TO CHANGE`, x + 46, y + 39);
    for (let i = 0; i < 5; i += 1) {
      const h = 3 + Math.abs(Math.sin(this.titleTime * (3 + i * 0.7) + i)) * 13;
      ctx.fillStyle = station.color;
      ctx.globalAlpha = alpha * 0.8;
      ctx.fillRect(x + 254 + i * 7, y + 44 - h, 4, h);
    }
    ctx.restore();
  }

  drawPrompt(ctx, game) {
    const prompt = this.prompt || game.prompt;
    if (!prompt) return;
    ctx.save();
    ctx.font = `800 13px ${FONT}`;
    const width = Math.min(560, ctx.measureText(prompt).width + 60);
    const x = 640 - width / 2;
    const y = 720 - 98;
    ctx.fillStyle = 'rgba(12, 11, 18, 0.92)';
    rr(ctx, x, y, width, 36, 9);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 209, 102, 0.4)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#ffd166';
    ctx.beginPath();
    ctx.arc(x + 20, y + 18, 10, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#17141b';
    ctx.font = `900 11px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('E', x + 20, y + 22);
    ctx.textAlign = 'left';
    ctx.font = `800 13px ${FONT}`;
    ctx.fillStyle = '#f6efe2';
    ctx.fillText(prompt, x + 38, y + 23);
    ctx.restore();
  }

  drawObjectiveArrow(ctx, game) {
    const target = game.missions?.active ? game.missions.currentTarget() : (game.missions?.availableMarker?.() || null);
    if (!target) return;
    const p = game.player;
    const dx = target.x - p.x;
    const dy = target.y - p.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 70) return;
    const angle = Math.atan2(dy, dx);
    const pulse = 0.7 + 0.3 * Math.sin(this.titleTime * 4);
    const ringX = 640 + Math.cos(angle) * 236;
    const ringY = 360 + Math.sin(angle) * 236;
    ctx.save();
    ctx.translate(ringX, ringY);
    ctx.rotate(angle);
    ctx.fillStyle = `rgba(255, 209, 102, ${0.8 * pulse})`;
    ctx.beginPath();
    ctx.moveTo(15, 0);
    ctx.lineTo(-7, -8);
    ctx.lineTo(-2, 0);
    ctx.lineTo(-7, 8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.font = `900 10px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255, 226, 165, 0.8)';
    ctx.fillText(`${Math.round(dist / 10)} m`, ringX, ringY + 24);
    ctx.restore();
  }

  drawBustedMeter(ctx, game) {
    const progress = game.police?.bustedProgress || 0;
    if (progress <= 0.02) return;
    const w = 220;
    const x = 640 - w / 2;
    const y = 574;
    ctx.save();
    ctx.fillStyle = 'rgba(8, 10, 18, 0.86)';
    rr(ctx, x, y, w, 28, 7);
    ctx.fill();
    ctx.strokeStyle = 'rgba(90, 168, 255, 0.5)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = 'rgba(90, 168, 255, 0.9)';
    rr(ctx, x + 4, y + 19, (w - 8) * clamp(progress / 1.35, 0, 1), 5, 2.5);
    ctx.fill();
    ctx.font = `900 10px ${FONT}`;
    ctx.fillStyle = '#d8e8ff';
    ctx.textAlign = 'center';
    ctx.fillText('BUSTED - KEEP MOVING', 640, y + 14);
    ctx.restore();
  }

  drawStunt(ctx, game) {
    if (!this.stunt) return;
    const t = this.stuntTimer;
    const fade = clamp((3.6 - t) / 0.25, 0, 1) * clamp(t / 0.5, 0, 1);
    ctx.save();
    ctx.globalAlpha = fade;
    const x = 640;
    const y = 138;
    ctx.translate(x, y);
    ctx.rotate(-0.04);
    ctx.fillStyle = 'rgba(12, 10, 18, 0.9)';
    rr(ctx, -190, -34, 380, 74, 10);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 209, 102, 0.6)';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.fillStyle = '#ffd166';
    ctx.font = `900 13px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(this.stunt.label || 'STUNT', 0, -12);
    ctx.font = `900 30px ${FONT}`;
    ctx.fillStyle = '#f6efe2';
    ctx.fillText(`+ ${moneyText(this.stunt.cash)}`, 0, 20);
    ctx.font = `800 9px ${FONT}`;
    ctx.fillStyle = 'rgba(246, 239, 226, 0.6)';
    ctx.fillText(`${this.stunt.air.toFixed(2)}s AIR  ·  CLEAN LANDING`, 0, 34);
    ctx.restore();
    void game;
  }

  drawMissionBanner(ctx, game) {
    const b = this.banner;
    const t = b.timer;
    const fadeIn = clamp((b.max - t) / 0.35, 0, 1);
    const fadeOut = clamp(t / 0.45, 0, 1);
    const alpha = fadeIn * fadeOut;
    const y = 136;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(10, 9, 16, 0.9)';
    rr(ctx, 352, y, 576, 108, 12);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 209, 102, 0.48)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.fillStyle = '#ffd166';
    ctx.fillRect(352, y, 6, 108);
    ctx.font = `900 10px ${FONT}`;
    ctx.fillStyle = '#ff9db0';
    ctx.textAlign = 'left';
    ctx.fillText(`MISSION ${b.index + 1}  ·  COSTA SOL`, 380, y + 22);
    ctx.font = `900 26px ${FONT}`;
    ctx.fillStyle = '#f6efe2';
    ctx.fillText(b.title.toUpperCase(), 380, y + 51);
    ctx.font = `700 13px ${FONT}`;
    ctx.fillStyle = 'rgba(246, 239, 226, 0.78)';
    const line = wrap(ctx, b.text, 510)[0] || '';
    ctx.fillText(line, 380, y + 73);
    const total = Math.max(1, b.total);
    for (let i = 0; i < total; i += 1) {
      ctx.fillStyle = i + 1 <= b.step ? '#8fe3a3' : 'rgba(255,255,255,0.14)';
      rr(ctx, 380 + i * 30, y + 86, 20, 4, 2);
      ctx.fill();
    }
    ctx.textAlign = 'right';
    ctx.font = `800 10px ${FONT}`;
    ctx.fillStyle = '#ffd166';
    ctx.fillText(`STEP ${b.step} / ${b.total}`, 908, y + 90);
    if (game.missions?.active && game.missions.stepTimeLimit > 0) {
      const left = Math.max(0, game.missions.stepTimeLimit - game.missions.stepTimer);
      ctx.fillStyle = left < 15 ? '#ff6b6b' : '#ffd166';
      ctx.fillText(`${Math.ceil(left)}s`, 908, y + 22);
    }
    ctx.restore();
  }

  // =================================================================
  // Screens
  // =================================================================
  drawScreens(ctx, game) {
    this.buttons = [];
    switch (game.state) {
      case 'title': this.drawTitle(ctx, game); break;
      case 'controls': this.drawControls(ctx, game); break;
      case 'paused': this.drawPause(ctx, game); break;
      case 'dialogue': this.drawDialogue(ctx, game); break;
      case 'missionComplete': this.drawMissionComplete(ctx, game); break;
      case 'missionFailed': this.drawMissionFailed(ctx, game); break;
      case 'wasted': this.drawWasted(ctx, game, 'WASTED', '#ff5d6c', 'The hospital patched you up.'); break;
      case 'busted': this.drawWasted(ctx, game, 'BUSTED', '#6fb7ff', 'The precinct booked you.'); break;
      case 'ending': this.drawEnding(ctx, game); break;
      default: break;
    }
  }

  dim(ctx, alpha = 0.5) {
    ctx.fillStyle = `rgba(8, 7, 13, ${alpha})`;
    ctx.fillRect(0, 0, 1280, 720);
  }

  drawButton(ctx, game, x, y, w, h, label, action, opts = {}) {
    const hover = game.input.mouse.x >= x && game.input.mouse.x <= x + w && game.input.mouse.y >= y && game.input.mouse.y <= y + h;
    const selected = this.menuIndex === (opts.index ?? 0);
    const disabled = !!opts.disabled;
    this.buttons.push({ x, y, w, h, action, disabled });
    ctx.save();
    const active = (hover || selected) && !disabled;
    ctx.fillStyle = active ? 'rgba(255, 209, 102, 0.96)' : 'rgba(18, 15, 24, 0.86)';
    rr(ctx, x, y, w, h, 7);
    ctx.fill();
    if (!active) {
      ctx.strokeStyle = 'rgba(255, 220, 160, 0.26)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
    ctx.textAlign = 'left';
    ctx.font = `900 19px ${FONT}`;
    ctx.fillStyle = disabled ? 'rgba(255,255,255,0.24)' : active ? '#1b1620' : '#f2eadb';
    ctx.fillText(label, x + 22, y + h / 2 + 7);
    if (opts.sub) {
      ctx.font = `700 9px ${FONT}`;
      ctx.fillStyle = active ? 'rgba(27,22,32,0.63)' : 'rgba(246,239,226,0.38)';
      ctx.fillText(opts.sub, x + 23, y + h / 2 + 22);
    }
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
    this.dim(ctx, 0.02);
    const panel = ctx.createLinearGradient(0, 0, 860, 0);
    panel.addColorStop(0, 'rgba(9, 7, 15, 0.97)');
    panel.addColorStop(0.5, 'rgba(9, 7, 15, 0.82)');
    panel.addColorStop(1, 'rgba(9, 7, 15, 0)');
    ctx.fillStyle = panel;
    ctx.fillRect(0, 0, 880, 720);
    const bottom = ctx.createLinearGradient(0, 470, 0, 720);
    bottom.addColorStop(0, 'rgba(8, 7, 14, 0)');
    bottom.addColorStop(1, 'rgba(8, 7, 14, 0.94)');
    ctx.fillStyle = bottom;
    ctx.fillRect(0, 470, 1280, 250);

    // Sun / neon halo.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const sun = ctx.createRadialGradient(186, 250, 8, 186, 250, 214);
    sun.addColorStop(0, 'rgba(255, 170, 120, 0.4)');
    sun.addColorStop(0.5, 'rgba(255, 110, 140, 0.15)');
    sun.addColorStop(1, 'rgba(255, 110, 140, 0)');
    ctx.fillStyle = sun;
    ctx.fillRect(0, 20, 480, 480);
    ctx.restore();
    ctx.strokeStyle = 'rgba(255, 205, 140, 0.28)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(186, 250, 128, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(186, 250, 142, 0.3, 1.2);
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.font = `800 11px ${FONT}`;
    ctx.fillStyle = '#ff9db0';
    ctx.fillText(`COSTA SOL  //  A CRIME STORY  //  V${GAME_VERSION}`, 92, 120);

    const line1 = ctx.createLinearGradient(88, 300, 520, 160);
    line1.addColorStop(0, '#ffe4b0');
    line1.addColorStop(0.5, '#ffb37b');
    line1.addColorStop(1, '#ff7f9e');
    ctx.font = `900 84px ${FONT}`;
    ctx.fillStyle = line1;
    ctx.shadowColor = 'rgba(255, 120, 130, 0.45)';
    ctx.shadowBlur = 26;
    ctx.fillText('LEONIDA', 86, 254);
    ctx.shadowBlur = 0;
    const line2 = ctx.createLinearGradient(88, 380, 430, 300);
    line2.addColorStop(0, '#ffcf6b');
    line2.addColorStop(0.55, '#ff7b62');
    line2.addColorStop(1, '#e8445f');
    ctx.font = `900 116px ${FONT}`;
    ctx.fillStyle = line2;
    ctx.shadowColor = 'rgba(230, 50, 80, 0.52)';
    ctx.shadowBlur = 30;
    ctx.fillText('HEAT', 92, 362);
    ctx.shadowBlur = 0;
    ctx.font = `800 19px ${FONT}`;
    ctx.fillStyle = 'rgba(255, 240, 220, 0.86)';
    ctx.fillText(GAME_SUBTITLE.toUpperCase(), 96, 400);
    ctx.font = `600 13px ${FONT}`;
    ctx.fillStyle = 'rgba(255, 238, 214, 0.58)';
    ctx.fillText('Drive the coast. Rob the row. Take the estate.', 96, 424);

    const hasSave = game.hasSaveFile();
    const actions = [
      { label: 'NEW GAME', action: 'new', sub: 'A fresh seeded Costa Sol' },
      { label: 'CONTINUE', action: 'continue', disabled: !hasSave, sub: hasSave ? 'Load the last autosave' : 'No save yet' },
      { label: 'CONTROLS', action: 'controls', sub: 'Keys, guns and the heat ladder' },
    ];
    actions.forEach((a, i) => this.drawButton(ctx, game, 92, 470 + i * 64, 300, 54, a.label, a.action, { index: i, disabled: a.disabled, sub: a.sub }));

    // Save summary card.
    const summary = game.saveSummary?.();
    if (summary) {
      ctx.font = `800 10px ${FONT}`;
      ctx.fillStyle = 'rgba(255, 238, 214, 0.44)';
      ctx.fillText(`LAST SAVE  ·  ${moneyText(summary.money)}  ·  ${summary.missions}/5 JOBS  ·  ${summary.collectibles}/12 MIXTAPES`, 96, 678);
    }

    ctx.font = `700 12px ${FONT}`;
    ctx.fillStyle = 'rgba(255, 238, 214, 0.62)';
    ctx.textAlign = 'center';
    ctx.fillText('WASD move · MOUSE aim · E enter · G grenade · SPACE handbrake · R reload · T map · ESC pause', 640, 700);
    if (this.mutedNotice > 0) {
      ctx.fillStyle = game.audio?.muted ? '#ffd166' : '#8fe3a3';
      ctx.font = `800 13px ${FONT}`;
      ctx.fillText(game.audio?.muted ? 'SOUND MUTED' : 'SOUND ON', 640, 680);
    }
    ctx.textAlign = 'right';
    ctx.font = `700 10px ${FONT}`;
    ctx.fillStyle = 'rgba(255, 238, 214, 0.36)';
    ctx.fillText('ORIGINAL CITY · ORIGINAL SOUND · OFFLINE', 1260, 698);
  }

  drawControls(ctx, game) {
    this.dim(ctx, 0.74);
    this.panel(ctx, 640, 358, 990, 620, 'CONTROLS');
    ctx.save();
    ctx.textAlign = 'left';
    const left = [
      ['W A S D / ARROWS', 'Walk, drive, steer'],
      ['SHIFT', 'Sprint on foot'],
      ['SPACE', 'Dodge roll / handbrake'],
      ['MOUSE', 'Aim at the cursor'],
      ['LEFT CLICK', 'Fire / melee combo'],
      ['G', 'Throw a frag grenade'],
      ['R', 'Reload'],
      ['1 – 5 / WHEEL', 'Switch weapon'],
      ['E or F', 'Enter / exit a car'],
      ['E', 'Carjack, rob, repair, start a job'],
    ];
    const right = [
      ['M', 'Mute / unmute'],
      ['Q', 'Cycle radio station'],
      ['H', 'Horn'],
      ['T', 'Map overlay'],
      ['GOLD MARKER', 'Start the next mission'],
      ['RAMPS', 'Hit them fast for airtime and cash'],
      ['MIXTAPES', 'Twelve hidden tapes pay a city bonus'],
      ['GARAGES', 'Repair a smoking car for cash'],
      ['STOPPED + COP', 'You will be BUSTED'],
      ['PAUSE → SAVE', 'Manual save; missions autosave'],
    ];
    let y = 170;
    for (const [key, desc] of left) {
      ctx.font = `900 12px ${FONT}`;
      ctx.fillStyle = '#ffd166';
      ctx.fillText(key, 190, y);
      ctx.font = `600 14px ${FONT}`;
      ctx.fillStyle = 'rgba(244, 236, 224, 0.88)';
      ctx.fillText(desc, 190, y + 17);
      y += 40;
    }
    y = 170;
    for (const [key, desc] of right) {
      ctx.font = `900 12px ${FONT}`;
      ctx.fillStyle = '#8fe3a3';
      ctx.fillText(key, 664, y);
      ctx.font = `600 14px ${FONT}`;
      ctx.fillStyle = 'rgba(244, 236, 224, 0.88)';
      ctx.fillText(desc, 664, y + 17);
      y += 40;
    }
    ctx.restore();
    this.drawButton(ctx, game, 520, 606, 240, 42, 'BACK', 'back', { index: 0 });
  }

  drawPause(ctx, game) {
    this.dim(ctx, 0.68);
    this.panel(ctx, 640, 350, 570, 574, 'PAUSED');
    const items = [
      ['RESUME', 'resume'],
      ['SAVE GAME', 'save'],
      ['LOAD GAME', 'load'],
      ['CONTROLS', 'controls'],
      ['QUIT TO TITLE', 'title'],
    ];
    items.forEach(([label, action], i) => {
      this.drawButton(ctx, game, 405, 230 + i * 58, 470, 44, label, action, { index: i });
    });
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = `700 12px ${FONT}`;
    ctx.fillStyle = 'rgba(255, 238, 214, 0.62)';
    const col = game.collectibles?.foundCount ?? 0;
    ctx.fillText(`SOUND ${game.audio?.muted ? 'OFF' : 'ON'}  ·  M to mute  ·  ${game.missions.completedCount}/5 jobs  ·  ${col}/12 mixtapes`, 640, 568);
    if (game.saveNotice && game.saveNotice > 0) {
      ctx.font = `800 14px ${FONT}`;
      ctx.fillStyle = '#8fe3a3';
      ctx.fillText('GAME SAVED', 640, 594);
    }
    ctx.font = `700 11px ${FONT}`;
    ctx.fillStyle = 'rgba(255, 238, 214, 0.4)';
    ctx.fillText(`CLOCK ${clockText(game.timeOfDay)}  ·  ${weatherLabel(game)}  ·  SEED ${game.seed}`, 640, 614);
    ctx.restore();
  }

  drawPortrait(ctx, x, y, w, h, speaker, portraitId) {
    const id = String(portraitId || speaker || '').toLowerCase();
    const seed = hashString(id);
    const skin = id.includes('maya') ? '#c98d63' : id.includes('crowe') ? '#b58d70' : id.includes('dispatch') ? '#8f6a52' : '#d9a87c';
    const hair = id.includes('crowe') ? '#cfc8bd' : id.includes('maya') ? '#1f1717' : id.includes('dispatch') ? '#31291f' : '#2a1e18';
    const jacket = id.includes('maya') ? '#c4486b' : id.includes('crowe') ? '#222a36' : id.includes('dispatch') ? '#2f4e68' : '#a8533e';
    ctx.save();
    ctx.fillStyle = 'rgba(255, 209, 102, 0.1)';
    rr(ctx, x, y, w, h, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 209, 102, 0.35)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.save();
    rr(ctx, x + 2, y + 2, w - 4, h - 4, 7);
    ctx.clip();
    const bg = ctx.createLinearGradient(x, y, x, y + h);
    bg.addColorStop(0, id.includes('crowe') ? '#3a2c25' : '#26323a');
    bg.addColorStop(1, '#121019');
    ctx.fillStyle = bg;
    ctx.fillRect(x, y, w, h);
    // Shoulders.
    ctx.fillStyle = jacket;
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h + 6, w * 0.52, h * 0.34, 0, Math.PI, TAU);
    ctx.fill();
    // Head.
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h * 0.51, w * 0.23, h * 0.27, 0, 0, TAU);
    ctx.fill();
    // Hair.
    ctx.fillStyle = hair;
    ctx.beginPath();
    ctx.arc(x + w / 2, y + h * 0.46, w * 0.25, Math.PI * 0.92, Math.PI * 2.08);
    ctx.fill();
    if (id.includes('maya')) {
      ctx.fillRect(x + w * 0.24, y + h * 0.45, w * 0.08, h * 0.28);
      ctx.fillRect(x + w * 0.68, y + h * 0.45, w * 0.08, h * 0.28);
    }
    if (id.includes('dispatch')) {
      ctx.strokeStyle = '#8fd3ea';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x + w / 2, y + h * 0.46, w * 0.25, Math.PI * 0.9, Math.PI * 2.1);
      ctx.stroke();
      ctx.fillStyle = '#8fd3ea';
      ctx.fillRect(x + w * 0.22, y + h * 0.44, 4, 9);
    }
    // Face marks.
    ctx.fillStyle = 'rgba(30, 22, 20, 0.85)';
    ctx.fillRect(x + w * 0.42, y + h * 0.5, 2.5, 2.5);
    ctx.fillRect(x + w * 0.56, y + h * 0.5, 2.5, 2.5);
    ctx.fillStyle = 'rgba(120, 70, 60, 0.7)';
    ctx.fillRect(x + w * 0.46, y + h * 0.62, w * 0.09, 1.5);
    // Vignette.
    const vig = ctx.createRadialGradient(x + w / 2, y + h / 2, w * 0.2, x + w / 2, y + h / 2, w * 0.7);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.5)');
    ctx.fillStyle = vig;
    ctx.fillRect(x, y, w, h);
    ctx.restore();
    ctx.restore();
    void seed;
  }

  drawDialogue(ctx, game) {
    const d = this.dialog;
    if (!d) return;
    this.dim(ctx, 0.2);
    const x = 186;
    const y = 498;
    const w = 908;
    const h = 186;
    ctx.save();
    ctx.fillStyle = 'rgba(12, 10, 18, 0.96)';
    rr(ctx, x, y, w, h, 13);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 209, 102, 0.5)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.fillStyle = '#ffd166';
    ctx.fillRect(x, y, 5, h);
    this.drawPortrait(ctx, x + 18, y + 18, 96, 116, d.speaker, d.portrait);
    ctx.textAlign = 'left';
    ctx.font = `900 17px ${FONT}`;
    ctx.fillStyle = '#ff9db0';
    ctx.fillText(String(d.speaker).toUpperCase(), x + 134, y + 38);
    ctx.font = `600 20px ${FONT}`;
    ctx.fillStyle = '#f6efe2';
    const lines = wrap(ctx, d.text, w - 180);
    let ty = y + 72;
    for (const line of lines.slice(0, 4)) {
      ctx.fillText(line, x + 134, ty);
      ty += 27;
    }
    ctx.font = `700 10px ${FONT}`;
    ctx.fillStyle = 'rgba(255, 238, 214, 0.46)';
    ctx.textAlign = 'right';
    ctx.fillText('SPACE / CLICK TO CONTINUE', x + w - 24, y + h - 18);
    ctx.fillStyle = 'rgba(255, 209, 102, 0.12)';
    rr(ctx, x + 134, y + h - 42, w - 170, 3, 1.5);
    ctx.fill();
    const seq = game.dialogueTotal > 1 ? (game.dialogueIndex + 1) / game.dialogueTotal : 1;
    ctx.fillStyle = '#ffd166';
    rr(ctx, x + 134, y + h - 42, (w - 170) * seq, 3, 1.5);
    ctx.fill();
    ctx.restore();
  }

  drawMissionComplete(ctx, game) {
    this.dim(ctx, 0.62);
    const info = game.missionComplete;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = `900 11px ${FONT}`;
    ctx.fillStyle = '#8fe3a3';
    ctx.fillText('COSTA SOL HOLDS ITS BREATH', 640, 184);
    ctx.font = `900 68px ${FONT}`;
    ctx.fillStyle = '#ffe6b5';
    ctx.shadowColor = 'rgba(255, 190, 100, 0.5)';
    ctx.shadowBlur = 26;
    ctx.fillText('MISSION PASSED', 640, 264);
    ctx.shadowBlur = 0;
    ctx.font = `800 26px ${FONT}`;
    ctx.fillStyle = '#ff9db0';
    ctx.fillText((info?.def?.title || 'THE JOB').toUpperCase(), 640, 310);
    ctx.font = `900 19px ${FONT}`;
    ctx.fillStyle = 'rgba(246, 239, 226, 0.8)';
    ctx.fillText(`JOB ${info?.def?.id || 1} OF 5`, 640, 344);
    ctx.font = `900 46px ${FONT}`;
    ctx.fillStyle = '#ffd166';
    ctx.fillText(`+ ${moneyText(info?.reward || 0)}`, 640, 410);
    ctx.font = `600 14px ${FONT}`;
    ctx.fillStyle = 'rgba(246, 239, 226, 0.75)';
    ctx.fillText(info?.final ? 'The city is yours. One last ride awaits.' : 'Autosaved. The next marker is on your map.', 640, 446);
    const col = game.collectibles?.foundCount ?? 0;
    ctx.font = `700 11px ${FONT}`;
    ctx.fillStyle = 'rgba(255, 238, 214, 0.44)';
    ctx.fillText(`${col}/12 MIXTAPES  ·  ${game.stuntsCount || 0} CLEAN STUNTS  ·  ${moneyText(game.player.money)}`, 640, 470);
    ctx.restore();
    this.drawButton(ctx, game, 520, 500, 240, 46, info?.final ? 'FINALE' : 'CONTINUE', 'continue', { index: 0 });
  }

  drawMissionFailed(ctx, game) {
    this.dim(ctx, 0.7);
    const info = game.missionFailed;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = `900 11px ${FONT}`;
    ctx.fillStyle = '#ff9db0';
    ctx.fillText('THE JOB WENT SIDEWAYS', 640, 190);
    ctx.font = `900 66px ${FONT}`;
    ctx.fillStyle = '#ff5d6c';
    ctx.shadowColor = 'rgba(180, 30, 50, 0.55)';
    ctx.shadowBlur = 24;
    ctx.fillText('MISSION FAILED', 640, 258);
    ctx.shadowBlur = 0;
    ctx.font = `800 24px ${FONT}`;
    ctx.fillStyle = '#ffe6b5';
    ctx.fillText((info?.def?.title || 'THE JOB').toUpperCase(), 640, 304);
    ctx.font = `600 18px ${FONT}`;
    ctx.fillStyle = 'rgba(246, 239, 226, 0.86)';
    ctx.fillText(info?.reason || 'The job went sideways.', 640, 346);
    ctx.restore();
    this.drawButton(ctx, game, 390, 408, 240, 48, 'RETRY', 'retry', { index: 0 });
    this.drawButton(ctx, game, 650, 408, 240, 48, 'DROP JOB', 'abandon', { index: 1 });
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = `700 12px ${FONT}`;
    ctx.fillStyle = 'rgba(255, 238, 214, 0.5)';
    ctx.fillText('ENTER retries from the last checkpoint · ESC drops the job', 640, 490);
    ctx.restore();
  }

  drawWasted(ctx, game, word, color, subtitle) {
    ctx.save();
    const grad = ctx.createRadialGradient(640, 360, 60, 640, 360, 760);
    grad.addColorStop(0, 'rgba(16, 10, 16, 0.5)');
    grad.addColorStop(1, word === 'WASTED' ? 'rgba(70, 8, 18, 0.88)' : 'rgba(8, 24, 56, 0.88)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1280, 720);
    ctx.textAlign = 'center';
    ctx.font = `900 108px ${FONT}`;
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 30;
    ctx.fillText(word, 640, 330);
    ctx.shadowBlur = 0;
    ctx.font = `800 20px ${FONT}`;
    ctx.fillStyle = '#f6efe2';
    const fee = word === 'WASTED' ? WANTED_CONFIG.wastedFee : WANTED_CONFIG.bustedFine;
    ctx.fillText(`${subtitle} Fee ${moneyText(fee)}.`, 640, 384);
    ctx.font = `600 15px ${FONT}`;
    ctx.fillStyle = 'rgba(246, 239, 226, 0.7)';
    ctx.fillText(word === 'WASTED' ? 'Costa Sol General will take you back at the hospital.' : 'Costa Sol PD will release you outside headquarters.', 640, 414);
    const remaining = Math.max(0, 1 - game.stateTimer / game.stateDuration);
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    rr(ctx, 490, 458, 300, 8, 4);
    ctx.fill();
    ctx.fillStyle = color;
    rr(ctx, 490, 458, 300 * remaining, 8, 4);
    ctx.fill();
    if (game.missions?.active) {
      ctx.font = `700 12px ${FONT}`;
      ctx.fillStyle = 'rgba(246, 239, 226, 0.55)';
      ctx.fillText('The current job will fail.', 640, 494);
    }
    ctx.restore();
  }

  drawEnding(ctx, game) {
    this.dim(ctx, 0.62);
    const grad = ctx.createLinearGradient(0, 0, 1280, 720);
    grad.addColorStop(0, 'rgba(80, 30, 60, 0.28)');
    grad.addColorStop(1, 'rgba(10, 8, 18, 0.72)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1280, 720);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = `900 11px ${FONT}`;
    ctx.fillStyle = '#ff9db0';
    ctx.fillText('THE COSTA SOL STORY', 640, 160);
    ctx.font = `900 74px ${FONT}`;
    ctx.fillStyle = '#ffe6b5';
    ctx.shadowColor = 'rgba(255, 180, 100, 0.5)';
    ctx.shadowBlur = 30;
    ctx.fillText('THE CITY IS YOURS', 640, 252);
    ctx.shadowBlur = 0;
    ctx.font = `600 18px ${FONT}`;
    ctx.fillStyle = 'rgba(246, 239, 226, 0.88)';
    ctx.fillText('Silas Crowe is finished. Maya has the ledger. The sun is still warm.', 640, 298);
    ctx.font = `800 22px ${FONT}`;
    ctx.fillStyle = '#ffd166';
    const col = game.collectibles?.foundCount ?? 0;
    ctx.fillText(`JOBS ${game.missions.completedCount}/5   ·   CASH ${moneyText(game.player.money)}   ·   TAPES ${col}/12`, 640, 348);
    ctx.font = `700 13px ${FONT}`;
    ctx.fillStyle = 'rgba(246, 239, 226, 0.62)';
    ctx.fillText(`Clean stunts landed: ${game.stuntsCount || 0}  ·  Best air: ${(game.bestStunt || 0).toFixed(2)}s`, 640, 382);
    ctx.fillText('Thank you for playing Leonida Heat.', 640, 408);
    ctx.textAlign = 'right';
    ctx.font = `700 10px ${FONT}`;
    ctx.fillStyle = 'rgba(255, 238, 214, 0.35)';
    ctx.fillText('An original city, cast, soundtrack and engine.', 1230, 694);
    ctx.restore();
    this.drawButton(ctx, game, 510, 454, 260, 48, 'RETURN TO TITLE', 'title', { index: 0 });
  }

  panel(ctx, cx, cy, w, h, title) {
    ctx.save();
    ctx.fillStyle = 'rgba(14, 12, 20, 0.95)';
    rr(ctx, cx - w / 2, cy - h / 2, w, h, 13);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 209, 102, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = '#ffd166';
    ctx.fillRect(cx - w / 2, cy - h / 2, 6, h);
    ctx.font = `900 28px ${FONT}`;
    ctx.fillStyle = '#ffe6b5';
    ctx.textAlign = 'left';
    ctx.fillText(title, cx - w / 2 + 46, cy - h / 2 + 54);
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
    this.menuIndex = (index + delta + buttons.length) % buttons.length;
    void game;
  }
}

export function weaponLabel(id) {
  return WEAPON_CONFIG[id]?.name || id;
}

export const UI_FONT = FONT;
