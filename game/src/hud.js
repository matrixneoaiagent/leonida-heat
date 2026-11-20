// Leonida Heat v4 - interface layer.
//
// The HUD is built as a small set of "decks": a status deck (cash, health,
// armour, heat), a live map panel, a job card, a weapon card and a radio strip.
// Every deck is laid out for 1280x720 and kept clear of the safe area so the
// city keeps breathing behind it. Screens share one button registry that the
// game reads for keyboard and pointer navigation.
//
// Typography: a heavy display face for place names and verdicts, a humanist
// body face for dialogue, and a monospaced face for clocks and ammo. Colours
// lean on sun-bleached cream, citrus gold, coral and sea-glass mint.

import {
  GAME_TITLE, GAME_SUBTITLE, GAME_VERSION, WEAPON_CONFIG, WANTED_CONFIG,
  RADIO_STATIONS, COLLECTIBLE_CONFIG, WEATHER_CONFIG, districtAt,
} from './config.js';

const BODY = '"Trebuchet MS", "Segoe UI", Arial, sans-serif';
const DISPLAY = '"Arial Black", "Segoe UI Black", Impact, sans-serif';
const MONO = '"Consolas", "Courier New", monospace';
const TAU = Math.PI * 2;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

const C = {
  ink: '#fff3dc',
  dim: 'rgba(255, 243, 220, 0.56)',
  faint: 'rgba(255, 243, 220, 0.3)',
  gold: '#ffcf5c',
  coral: '#ff7d6e',
  mint: '#7ee0b0',
  cyan: '#6fe0e6',
  pink: '#ff8fb1',
  blue: '#82b8ff',
  panel: 'rgba(12, 16, 22, 0.87)',
  panelSolid: 'rgba(10, 13, 19, 0.95)',
  line: 'rgba(255, 220, 160, 0.24)',
  lineHot: 'rgba(255, 207, 92, 0.58)',
  shadow: 'rgba(0, 0, 0, 0.42)',
};

function panelPath(ctx, x, y, w, h, r = 10) {
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
    const rad = i % 2 === 0 ? r : r * 0.43;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const px = x + Math.cos(a) * rad;
    const py = y + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function wrapLines(ctx, text, maxWidth) {
  const words = String(text ?? '').split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    const probe = line ? `${line} ${word}` : word;
    if (ctx.measureText(probe).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = probe;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function money(value) {
  return `$${Math.round(value || 0).toLocaleString('en-US')}`;
}

function clockText(t) {
  const value = ((t ?? 0) % 1 + 1) % 1;
  const h = Math.floor(value * 24);
  const m = Math.floor((value * 24 - h) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function phaseOf(t) {
  if (t >= 0.205 && t < 0.305) return 'DAWN';
  if (t >= 0.305 && t < 0.63) return 'DAYLIGHT';
  if (t >= 0.63 && t < 0.78) return 'GOLDEN HOUR';
  return 'NIGHT';
}

function weatherName(game) {
  return WEATHER_CONFIG.labels[game.weather?.type || 'clear'] || 'CLEAR';
}

function tempFor(type) {
  return type === 'storm' ? '24°' : type === 'rain' ? '25°' : type === 'haze' ? '31°' : '29°';
}

function hashString(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

function arrowPath(ctx, size) {
  ctx.beginPath();
  ctx.moveTo(size, 0);
  ctx.lineTo(-size * 0.62, -size * 0.56);
  ctx.lineTo(-size * 0.28, 0);
  ctx.lineTo(-size * 0.62, size * 0.56);
  ctx.closePath();
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
    this.moneyPulse = 0;
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
    this.photoFlash = 0;
    this.shotCount = 0;
  }

  // =================================================================
  // Public feed
  // =================================================================
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
      total: def.steps?.length || 1,
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
    this.districtTimer = 4.4;
  }

  // =================================================================
  // Update
  // =================================================================
  update(dt, game) {
    this.titleTime += dt;
    for (let i = this.toasts.length - 1; i >= 0; i -= 1) {
      this.toasts[i].timer -= dt;
      if (this.toasts[i].timer <= 0) this.toasts.splice(i, 1);
    }
    if (this.banner) {
      this.banner.timer -= dt;
      if (game.missions?.active) {
        this.banner.step = (game.missions.stepIndex || 0) + 1;
        this.banner.text = game.missions.step?.text || this.banner.text;
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
      const cashDiff = p.money - this.displayedMoney;
      if (Math.abs(cashDiff) > 0.6) {
        this.displayedMoney += cashDiff * Math.min(1, dt * 6.2);
        this.moneyPulse = Math.min(1, this.moneyPulse + dt * 2.4);
      } else {
        this.displayedMoney = p.money;
      }
      this.displayedHealth += (p.health - this.displayedHealth) * Math.min(1, dt * 8.2);
      this.displayedArmor += (p.armor - this.displayedArmor) * Math.min(1, dt * 8.2);
      this.healthGhost += (p.health - this.healthGhost) * Math.min(1, dt * (p.health < this.healthGhost ? 0.85 : 3));
      this.armorGhost += (p.armor - this.armorGhost) * Math.min(1, dt * (p.armor < this.armorGhost ? 0.85 : 3));
      if (p.health < this.healthGhost - 0.5) this.damageFlash = Math.min(1, this.damageFlash + dt * 8);
    }
    this.moneyPulse = Math.max(0, this.moneyPulse - dt * 1.5);
    this.damageFlash = Math.max(0, this.damageFlash - dt * 2.0);
    this.radioVisible = Math.max(0, this.radioVisible - dt);
    this.mutedNotice = Math.max(0, this.mutedNotice - dt);
    this.toastRise = Math.max(0, this.toastRise - dt * 1.7);
    this.collectibleFlash = Math.max(0, this.collectibleFlash - dt * 1.1);
    this.photoFlash = Math.max(0, this.photoFlash - dt * 2.4);

    const stars = game.police?.wantedStars || 0;
    if (stars !== this.lastWanted) {
      this.lastWanted = stars;
      if (stars > 0) this.starFlash = 1;
    }
    this.starFlash = Math.max(0, this.starFlash - dt * 1.7);
  }

  // =================================================================
  // In-world HUD
  // =================================================================
  drawHUD(ctx, game) {
    if (game.state === 'photo') return;
    this.drawStatusDeck(ctx, game);
    this.drawHeatRail(ctx, game);
    this.drawMapPanel(ctx, game);
    if (game.state === 'dialogue') {
      // Let the conversation own the frame; keep only the readings that matter.
      return;
    }
    if (['paused', 'wasted', 'busted', 'missionComplete', 'missionFailed'].includes(game.state)) {
      if (game.state === 'paused') this.drawWeaponCard(ctx, game);
      return;
    }
    this.drawWeaponCard(ctx, game);
    this.drawJobCard(ctx, game);
    this.drawDistrictBanner(ctx, game);
    this.drawToastStack(ctx, game);
    this.drawRadioDeck(ctx, game);
    this.drawCompass(ctx, game);
    this.drawChatter(ctx, game);
    if (!this.banner) this.drawPromptBar(ctx, game);
    this.drawBustedGauge(ctx, game);
    this.drawStuntCard(ctx, game);
    if (this.banner) this.drawMissionBanner(ctx, game);
    if (this.collectibleFlash > 0) {
      const a = this.collectibleFlash * 0.1;
      ctx.fillStyle = `rgba(255, 207, 92, ${a})`;
      ctx.fillRect(0, 0, 1280, 720);
    }
  }

  // -----------------------------------------------------------------
  // Status deck (top-left)
  // -----------------------------------------------------------------
  drawStatusDeck(ctx, game) {
    const p = game.player;
    const x = 20;
    const y = 16;
    const w = 394;
    const h = 148;
    ctx.save();
    ctx.fillStyle = C.panel;
    panelPath(ctx, x, y, w, h, 12);
    ctx.fill();
    ctx.strokeStyle = C.line;
    ctx.lineWidth = 1;
    ctx.stroke();

    // Header strip.
    ctx.save();
    panelPath(ctx, x + 1, y + 1, w - 2, 30, 11);
    ctx.clip();
    ctx.fillStyle = 'rgba(255, 207, 92, 0.08)';
    ctx.fillRect(x, y, w, 30);
    ctx.restore();
    ctx.fillStyle = C.coral;
    ctx.fillRect(x, y + 10, 4, 20);
    ctx.font = `800 9px ${BODY}`;
    ctx.fillStyle = C.dim;
    ctx.textAlign = 'left';
    ctx.fillText('LEO CALDER  //  COSTA SOL', x + 16, y + 20);
    ctx.textAlign = 'right';
    ctx.fillStyle = C.faint;
    ctx.fillText(`SEED ${game.seed ?? '—'}`, x + w - 16, y + 20);

    // Cash.
    ctx.textAlign = 'left';
    ctx.font = `900 31px ${DISPLAY}`;
    ctx.fillStyle = this.moneyPulse > 0.05 ? C.mint : C.gold;
    ctx.shadowColor = C.shadow;
    ctx.shadowBlur = 6;
    ctx.fillText(money(this.displayedMoney), x + 16, y + 60);
    ctx.shadowBlur = 0;
    ctx.font = `800 8px ${BODY}`;
    ctx.fillStyle = C.faint;
    ctx.fillText('WALLET', x + 17, y + 72);

    // Score.
    ctx.textAlign = 'right';
    ctx.font = `900 17px ${MONO}`;
    ctx.fillStyle = C.mint;
    ctx.fillText(Math.round(p.score || 0).toLocaleString('en-US'), x + w - 16, y + 54);
    ctx.font = `800 8px ${BODY}`;
    ctx.fillStyle = 'rgba(126, 224, 176, 0.6)';
    ctx.fillText('REP', x + w - 16, y + 67);

    // Health.
    const barX = x + 82;
    const barW = w - 164;
    this.drawMeter(ctx, barX, y + 80, barW, 12, this.healthGhost / p.maxHealth, 'rgba(255, 96, 96, 0.38)');
    const hp = clamp(this.displayedHealth / p.maxHealth, 0, 1);
    const low = p.health / p.maxHealth < 0.3;
    const hg = ctx.createLinearGradient(barX, 0, barX + barW, 0);
    if (low) {
      hg.addColorStop(0, '#ff4b5e');
      hg.addColorStop(1, '#ffa15c');
    } else {
      hg.addColorStop(0, '#59cf95');
      hg.addColorStop(0.65, '#b5e36b');
      hg.addColorStop(1, '#f2df72');
    }
    this.drawMeter(ctx, barX, y + 80, barW, 12, hp, hg);
    ctx.font = `800 9px ${BODY}`;
    ctx.fillStyle = C.dim;
    ctx.textAlign = 'left';
    ctx.fillText('HEALTH', x + 16, y + 90);
    ctx.textAlign = 'right';
    ctx.font = `900 10px ${MONO}`;
    ctx.fillStyle = low ? '#ff8b91' : C.ink;
    ctx.fillText(`${Math.ceil(p.health)}`, x + w - 16, y + 90);
    if (low) {
      ctx.strokeStyle = `rgba(255, 90, 96, ${0.3 + 0.35 * Math.sin(this.titleTime * 8)})`;
      ctx.lineWidth = 1.4;
      panelPath(ctx, barX - 1, y + 79, barW + 2, 14, 7);
      ctx.stroke();
    }

    // Armour.
    this.drawMeter(ctx, barX, y + 103, barW, 8, this.armorGhost / p.maxArmor, 'rgba(111, 183, 255, 0.28)');
    this.drawMeter(ctx, barX, y + 103, barW, 8, clamp(this.displayedArmor / p.maxArmor, 0, 1), C.blue);
    ctx.font = `800 9px ${BODY}`;
    ctx.fillStyle = C.dim;
    ctx.textAlign = 'left';
    ctx.fillText('ARMOR', x + 16, y + 111);
    ctx.textAlign = 'right';
    ctx.font = `900 9px ${MONO}`;
    ctx.fillStyle = 'rgba(255, 243, 220, 0.56)';
    ctx.fillText(`${Math.ceil(p.armor)}`, x + w - 16, y + 111);

    // Bottom row: stars, mixtapes, grenades.
    ctx.strokeStyle = 'rgba(255, 220, 160, 0.11)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 16, y + 121);
    ctx.lineTo(x + w - 16, y + 121);
    ctx.stroke();
    this.drawStars(ctx, x + 16, y + 138, game.police?.wantedStars || 0);

    const found = game.collectibles?.foundCount ?? 0;
    const total = game.collectibles?.total ?? COLLECTIBLE_CONFIG.total;
    ctx.textAlign = 'left';
    ctx.font = `800 8px ${BODY}`;
    ctx.fillStyle = C.faint;
    ctx.fillText('TAPES', x + 132, y + 141);
    for (let i = 0; i < total; i += 1) {
      ctx.fillStyle = i < found ? C.gold : 'rgba(255, 243, 220, 0.12)';
      ctx.fillRect(x + 168 + i * 8, y + 133, 4, 8);
    }
    ctx.textAlign = 'right';
    ctx.font = `800 8px ${BODY}`;
    ctx.fillStyle = p.grenades > 0 ? C.mint : C.faint;
    ctx.fillText(`FRAGS ${p.grenades}/${p.maxGrenades}`, x + w - 16, y + 141);

    if (this.damageFlash > 0.02) {
      ctx.strokeStyle = `rgba(255, 86, 86, ${this.damageFlash * 0.6})`;
      ctx.lineWidth = 2;
      panelPath(ctx, x - 1, y - 1, w + 2, h + 2, 13);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawMeter(ctx, x, y, w, h, frac, fill) {
    ctx.fillStyle = 'rgba(6, 9, 14, 0.78)';
    panelPath(ctx, x, y, w, h, h / 2);
    ctx.fill();
    const width = Math.max(0, Math.min(1, frac || 0)) * w;
    if (width > 0.5) {
      ctx.fillStyle = fill;
      panelPath(ctx, x, y, width, h, h / 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
      panelPath(ctx, x + 1, y + 1, Math.max(1, width - 2), h * 0.33, h * 0.2);
      ctx.fill();
    }
  }

  drawStars(ctx, x, y, stars) {
    const pulse = 1 + Math.max(0, this.starFlash) * 0.3 + Math.sin(this.titleTime * 6) * (stars > 0 ? 0.03 : 0);
    for (let i = 0; i < 5; i += 1) {
      starPath(ctx, x + i * 18, y, 7.4 * (i < stars ? pulse : 1));
      if (i < stars) {
        ctx.fillStyle = C.gold;
        ctx.shadowColor = 'rgba(255, 200, 90, 0.7)';
        ctx.shadowBlur = 7;
        ctx.fill();
        ctx.shadowBlur = 0;
      } else {
        ctx.fillStyle = 'rgba(255, 243, 220, 0.13)';
        ctx.fill();
      }
    }
  }

  // -----------------------------------------------------------------
  // Heat rail (under the status deck)
  // -----------------------------------------------------------------
  drawHeatRail(ctx, game) {
    const stars = game.police?.wantedStars || 0;
    const searching = !!game.police?.searching;
    const x = 20;
    const y = 172;
    const w = 394;
    const h = 26;
    ctx.save();
    ctx.fillStyle = stars > 0
      ? (searching ? 'rgba(58, 16, 22, 0.9)' : 'rgba(48, 34, 10, 0.9)')
      : 'rgba(12, 16, 22, 0.6)';
    panelPath(ctx, x, y, w, h, 6);
    ctx.fill();
    ctx.strokeStyle = stars > 0 ? (searching ? 'rgba(255, 96, 104, 0.55)' : C.lineHot) : 'rgba(255, 220, 160, 0.12)';
    ctx.lineWidth = 1;
    ctx.stroke();

    const label = stars <= 0
      ? 'NO ACTIVE HEAT'
      : searching
        ? `SEARCHING · BREAK SIGHT`
        : (WANTED_CONFIG.levels[stars]?.response || 'HEAT');
    ctx.font = `900 9px ${BODY}`;
    ctx.textAlign = 'left';
    ctx.fillStyle = stars > 0 ? (searching ? '#ff8b91' : C.gold) : C.faint;
    ctx.fillText(`HEAT ${stars}  ·  ${label}`, x + 12, y + 16);

    // Segmented heat ladder on the right.
    for (let i = 0; i < 5; i += 1) {
      const sx = x + w - 12 - (5 - i) * 13;
      ctx.fillStyle = i < stars ? (searching ? '#ff6b74' : C.gold) : 'rgba(255, 243, 220, 0.14)';
      ctx.fillRect(sx, y + 9, 9, 8);
    }

    if (searching && stars > 0) {
      const progress = clamp(1 - (game.police.cooldownTimer || 0) / WANTED_CONFIG.cooldownTime, 0, 1);
      ctx.fillStyle = 'rgba(255, 96, 104, 0.18)';
      ctx.fillRect(x + 12, y + h - 5, w - 24, 3);
      ctx.fillStyle = '#ff7d86';
      ctx.fillRect(x + 12, y + h - 5, (w - 24) * progress, 3);
    }
    ctx.restore();
  }

  // -----------------------------------------------------------------
  // Map panel (top-right)
  // -----------------------------------------------------------------
  drawMapPanel(ctx, game) {
    const size = 220;
    const x = 1280 - 20 - size;
    const y = 16;
    const pad = 8;
    const inner = size - pad * 2;
    const cx = x + size / 2;
    const cy = y + size / 2;
    const player = game.player;
    const radiusWorld = 820;
    const scale = inner / (radiusWorld * 2);

    ctx.save();
    // Panel chrome.
    ctx.fillStyle = 'rgba(8, 13, 18, 0.95)';
    panelPath(ctx, x, y, size, size, 12);
    ctx.fill();
    ctx.strokeStyle = 'rgba(214, 236, 240, 0.34)';
    ctx.lineWidth = 1.3;
    ctx.stroke();

    // Compass ticks.
    ctx.strokeStyle = 'rgba(255, 207, 92, 0.38)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 12; i += 1) {
      const a = (i / 12) * TAU;
      const long = i % 3 === 0;
      const r1 = size / 2 - 3;
      const r2 = r1 - (long ? 8 : 4);
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      ctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
      ctx.stroke();
    }

    ctx.save();
    panelPath(ctx, x + pad, y + pad, inner, inner, 7);
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

    // Water shimmer over the bay edge.
    ctx.fillStyle = 'rgba(80, 200, 214, 0.08)';
    ctx.fillRect(inner / 2 - ((3200 - 2712) * scale), -inner / 2, 40, inner);

    // A soft radar sweep.
    const sweep = (this.titleTime * 0.55) % TAU;
    const sg = ctx.createLinearGradient(0, 0, Math.cos(sweep) * inner * 0.6, Math.sin(sweep) * inner * 0.6);
    sg.addColorStop(0, 'rgba(111, 224, 230, 0)');
    sg.addColorStop(1, 'rgba(111, 224, 230, 0.07)');
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, inner * 0.62, sweep - 0.35, sweep);
    ctx.closePath();
    ctx.fill();

    // Pickups.
    for (const p of game.pickups?.pickups || []) {
      if (!p.active) continue;
      const px = (p.x - player.x) * scale;
      const py = (p.y - player.y) * scale;
      if (Math.abs(px) > inner / 2 - 4 || Math.abs(py) > inner / 2 - 4) continue;
      ctx.fillStyle = p.def.color;
      ctx.fillRect(px - 1.4, py - 1.4, 2.8, 2.8);
    }

    // Mixtapes.
    for (const item of game.collectibles?.items || []) {
      if (item.found) continue;
      const px = (item.x - player.x) * scale;
      const py = (item.y - player.y) * scale;
      if (Math.abs(px) > inner / 2 - 5 || Math.abs(py) > inner / 2 - 5) continue;
      ctx.fillStyle = item.color;
      ctx.fillRect(px - 1.5, py - 1.5, 3, 3);
    }

    // Garages.
    for (const garage of game.city.garages || []) {
      const px = (garage.x - player.x) * scale;
      const py = (garage.y - player.y) * scale;
      if (Math.abs(px) > inner / 2 - 5 || Math.abs(py) > inner / 2 - 5) continue;
      ctx.fillStyle = '#ffb45c';
      ctx.fillRect(px - 2, py - 2, 4, 4);
    }

    // POIs, nearest six.
    const pois = (game.city.pois || [])
      .map((poi) => ({ poi, d: Math.hypot(poi.x - player.x, poi.y - player.y) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 6);
    for (const { poi } of pois) {
      const px = (poi.x - player.x) * scale;
      const py = (poi.y - player.y) * scale;
      if (Math.abs(px) > inner / 2 - 5 || Math.abs(py) > inner / 2 - 5) continue;
      this.drawPoiMark(ctx, px, py, poi.type);
    }

    // Police and search ring.
    if (game.police?.searchCenter && game.police.searchRadius > 0) {
      const sx = (game.police.searchCenter.x - player.x) * scale;
      const sy = (game.police.searchCenter.y - player.y) * scale;
      ctx.strokeStyle = 'rgba(255, 96, 104, 0.4)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(sx, sy, Math.max(10, game.police.searchRadius * scale), 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    for (const cop of game.police?.cops || []) {
      this.mapBlip(ctx, (cop.x - player.x) * scale, (cop.y - player.y) * scale, 3.1, cop.sirenPhase ? '#82b8ff' : '#ff5d6c', true);
    }
    for (const foot of game.police?.footCops || []) {
      if (!foot.isDead) this.mapBlip(ctx, (foot.x - player.x) * scale, (foot.y - player.y) * scale, 2.3, '#82b8ff', false);
    }

    // Objective.
    const target = game.missions?.active ? game.missions.currentTarget() : game.missions?.availableMarker?.();
    if (target) {
      let px = (target.x - player.x) * scale;
      let py = (target.y - player.y) * scale;
      const max = inner / 2 - 8;
      const d = Math.hypot(px, py);
      if (d > max) {
        px = (px / d) * max;
        py = (py / d) * max;
      }
      const pulse = 0.7 + 0.3 * Math.sin(this.titleTime * 4.2);
      ctx.fillStyle = C.gold;
      ctx.strokeStyle = 'rgba(28, 24, 16, 0.9)';
      ctx.lineWidth = 1.4;
      starPath(ctx, px, py, 5.6 * pulse);
      ctx.fill();
      ctx.stroke();
    }

    // Player arrow.
    ctx.save();
    ctx.rotate(player.angle + Math.PI / 2);
    ctx.fillStyle = C.ink;
    ctx.strokeStyle = 'rgba(10, 12, 18, 0.9)';
    ctx.lineWidth = 1.4;
    arrowPath(ctx, 7);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // North.
    ctx.fillStyle = C.gold;
    ctx.font = `900 10px ${BODY}`;
    ctx.textAlign = 'center';
    ctx.fillText('N', 0, -inner / 2 + 14);
    ctx.beginPath();
    ctx.moveTo(0, -inner / 2 + 6);
    ctx.lineTo(3.5, -inner / 2 + 1);
    ctx.lineTo(-3.5, -inner / 2 + 1);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Panel footer strip: district / live.
    ctx.fillStyle = 'rgba(8, 13, 18, 0.82)';
    panelPath(ctx, x + pad + 4, y + size - 27, 104, 17, 5);
    ctx.fill();
    ctx.font = `900 9px ${BODY}`;
    ctx.fillStyle = C.ink;
    ctx.textAlign = 'left';
    const d = districtAt(player.x, player.y);
    ctx.fillText(d.short, x + pad + 11, y + size - 15);
    ctx.textAlign = 'right';
    ctx.font = `800 8px ${BODY}`;
    ctx.fillStyle = 'rgba(255, 243, 220, 0.54)';
    ctx.fillText('LIVE', x + size - 12, y + size - 15);

    // Clock plate beneath the map.
    const boxY = y + size + 8;
    const boxH = 44;
    ctx.fillStyle = C.panel;
    panelPath(ctx, x, boxY, size, boxH, 9);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 220, 160, 0.16)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.textAlign = 'left';
    ctx.font = `900 18px ${MONO}`;
    ctx.fillStyle = '#ffe9bb';
    ctx.fillText(clockText(game.timeOfDay), x + 13, boxY + 21);
    ctx.font = `800 8px ${BODY}`;
    ctx.fillStyle = C.faint;
    ctx.fillText(`${phaseOf(game.timeOfDay)}  ·  COSTA SOL`, x + 13, boxY + 34);
    const wType = game.weather?.type || 'clear';
    const wColor = wType === 'storm' ? '#a8c2ff' : wType === 'rain' ? '#8fe0e8' : wType === 'haze' ? '#f0d5a4' : C.gold;
    ctx.textAlign = 'right';
    ctx.font = `900 11px ${BODY}`;
    ctx.fillStyle = wColor;
    ctx.fillText(weatherName(game), x + size - 13, boxY + 19);
    ctx.font = `800 8px ${BODY}`;
    ctx.fillStyle = C.faint;
    ctx.fillText(`${tempFor(wType)}  ·  ${Math.round((game.weather?.wetness || 0) * 100)}% WET`, x + size - 13, boxY + 33);
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

    // Land and water foundation.
    const land = ctx.createLinearGradient(0, 0, size, size);
    land.addColorStop(0, '#26302a');
    land.addColorStop(1, '#1d2624');
    ctx.fillStyle = land;
    ctx.fillRect(0, 0, size, size);

    for (const block of game.city.blocks) {
      const district = districtAt(block.x, block.y);
      ctx.fillStyle = district.map;
      ctx.fillRect(block.xMin * s, block.yMin * s, block.w * s, block.h * s);
      ctx.strokeStyle = 'rgba(225, 214, 188, 0.12)';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(block.xMin * s, block.yMin * s, block.w * s, block.h * s);
      if (block.kind === 'park') {
        ctx.fillStyle = 'rgba(92, 132, 80, 0.88)';
        ctx.fillRect(block.xMin * s + 2, block.yMin * s + 2, block.w * s - 4, block.h * s - 4);
      } else if (block.kind === 'parking') {
        ctx.fillStyle = 'rgba(88, 86, 92, 0.55)';
        ctx.fillRect(block.xMin * s + 2, block.yMin * s + 2, block.w * s - 4, block.h * s - 4);
      }
    }

    // Beach, boardwalk and bay.
    ctx.fillStyle = '#d9c293';
    ctx.fillRect(2480 * s, 0, 232 * s, size);
    ctx.fillStyle = '#bf9463';
    ctx.fillRect(2494 * s, 0, 58 * s, size);
    ctx.fillStyle = '#174b62';
    ctx.fillRect(2712 * s, 0, (3200 - 2712) * s, size);
    ctx.fillStyle = '#2c7c90';
    ctx.fillRect(2820 * s, 0, (3200 - 2820) * s, size);

    // Roads.
    for (const road of game.city.roads) {
      ctx.strokeStyle = road.kind === 'highway' ? '#f2e7cc' : '#dcd2bd';
      ctx.lineWidth = Math.max(1.2, road.width * s * 0.9);
      ctx.beginPath();
      ctx.moveTo(road.x1 * s, road.y1 * s);
      ctx.lineTo(road.x2 * s, road.y2 * s);
      ctx.stroke();
    }

    // Piers.
    for (const pier of game.city.piers) {
      ctx.fillStyle = '#b88f63';
      ctx.fillRect((pier.x - pier.w / 2) * s, (pier.y - pier.h / 2) * s, pier.w * s, pier.h * s);
    }

    // Shoreline.
    ctx.strokeStyle = 'rgba(238, 255, 251, 0.8)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(2712 * s, 0);
    ctx.lineTo(2712 * s, size);
    ctx.stroke();

    this.mapCanvas = canvas;
    this.mapCity = game.city;
    return canvas;
  }

  mapBlip(ctx, x, y, r, color, ring) {
    if (Math.abs(x) > 105 || Math.abs(y) > 105) return;
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

  drawPoiMark(ctx, x, y, type) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = 'rgba(242, 236, 218, 0.72)';
    if (type === 'cross' || type === 'hospital') {
      ctx.fillRect(-1.4, -4, 2.8, 8);
      ctx.fillRect(-4, -1.4, 8, 2.8);
    } else if (type === 'shield' || type === 'police') {
      ctx.beginPath();
      ctx.moveTo(0, -4);
      ctx.lineTo(3.2, -2);
      ctx.lineTo(2.4, 3);
      ctx.lineTo(0, 4.4);
      ctx.lineTo(-2.4, 3);
      ctx.lineTo(-3.2, -2);
      ctx.closePath();
      ctx.fill();
    } else if (type === 'home' || type === 'safehouse') {
      ctx.beginPath();
      ctx.moveTo(0, -4);
      ctx.lineTo(4, 0.5);
      ctx.lineTo(2.4, 0.5);
      ctx.lineTo(2.4, 4);
      ctx.lineTo(-2.4, 4);
      ctx.lineTo(-2.4, 0.5);
      ctx.lineTo(-4, 0.5);
      ctx.closePath();
      ctx.fill();
    } else if (type === 'wrench') {
      ctx.strokeStyle = 'rgba(242, 236, 218, 0.8)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(0, -2, 2, 0.4, Math.PI * 1.8);
      ctx.moveTo(1, -1);
      ctx.lineTo(3, 4);
      ctx.stroke();
    } else if (type === 'tree') {
      ctx.beginPath();
      ctx.arc(0, -1, 3, 0, TAU);
      ctx.fill();
      ctx.fillRect(-0.6, 1, 1.2, 3);
    } else {
      ctx.beginPath();
      ctx.arc(0, 0, 2.5, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  // -----------------------------------------------------------------
  // Weapon card (bottom-right)
  // -----------------------------------------------------------------
  drawWeaponCard(ctx, game) {
    const p = game.player;
    const weapon = p.weapon;
    const x = 974;
    const y = 584;
    const w = 286;
    const h = 116;
    const mag = p.ammo[weapon.id];
    ctx.save();
    ctx.fillStyle = C.panel;
    panelPath(ctx, x, y, w, h, 11);
    ctx.fill();
    ctx.strokeStyle = C.line;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = C.coral;
    ctx.fillRect(x + 8, y + 13, 3, 16);

    ctx.textAlign = 'left';
    ctx.font = `800 8px ${BODY}`;
    ctx.fillStyle = C.faint;
    ctx.fillText('CURRENT PIECE', x + 18, y + 20);
    ctx.font = `900 16px ${BODY}`;
    ctx.fillStyle = C.ink;
    ctx.fillText((weapon.name || weapon.id).toUpperCase(), x + 18, y + 40);

    // Weapon glyph.
    ctx.save();
    ctx.translate(x + 42, y + 71);
    ctx.fillStyle = weapon.tint || '#cfd6dd';
    if (weapon.id === 'fists') {
      ctx.beginPath();
      ctx.arc(0, 0, 8, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#b98d68';
      ctx.fillRect(-9, 5, 18, 4);
    } else if (weapon.id === 'shotgun') {
      ctx.fillRect(-16, -2.5, 34, 5);
      ctx.fillStyle = '#7b5d40';
      ctx.fillRect(-16, -3, 10, 6);
    } else if (weapon.id === 'smg') {
      ctx.fillRect(-13, -3, 26, 6);
      ctx.fillRect(-2, 2, 5, 9);
      ctx.fillRect(-10, 2, 4, 7);
    } else if (weapon.id === 'rifle') {
      ctx.fillRect(-17, -2, 38, 4);
      ctx.fillRect(-2, 1, 7, 6);
      ctx.fillStyle = '#5b4a3a';
      ctx.fillRect(-17, -2.6, 9, 5.2);
    } else {
      ctx.fillRect(-9, -3, 19, 6);
      ctx.fillRect(-6, 2, 5, 7);
    }
    ctx.restore();

    ctx.textAlign = 'right';
    if (Number.isFinite(weapon.clipSize)) {
      ctx.font = `900 28px ${MONO}`;
      ctx.fillStyle = mag && mag.clip > 0 ? C.gold : '#ff6b6b';
      ctx.fillText(`${mag?.clip ?? 0}`, x + w - 58, y + 48);
      ctx.font = `800 13px ${MONO}`;
      ctx.fillStyle = C.dim;
      ctx.fillText(`/ ${mag?.reserve ?? 0}`, x + w - 16, y + 48);
      if (mag?.clip > 0) {
        const pips = Math.min(16, mag.clip);
        for (let i = 0; i < pips; i += 1) {
          ctx.fillStyle = i < pips * 0.35 ? 'rgba(255, 125, 110, 0.7)' : 'rgba(255, 207, 92, 0.8)';
          ctx.fillRect(x + 88 + i * 8, y + 59, 3.5, 12);
        }
      }
    } else {
      ctx.font = `900 26px ${BODY}`;
      ctx.fillStyle = C.gold;
      ctx.fillText('∞', x + w - 22, y + 50);
    }

    ctx.textAlign = 'left';
    ctx.font = `900 9px ${BODY}`;
    ctx.fillStyle = p.grenades > 0 ? C.mint : C.faint;
    ctx.fillText(`FRAGS ${p.grenades}/${p.maxGrenades}`, x + 18, y + 100);
    ctx.textAlign = 'right';
    ctx.font = `800 8px ${BODY}`;
    ctx.fillStyle = C.faint;
    ctx.fillText('1-5 / WHEEL  ·  R  ·  G', x + w - 16, y + 100);

    if (p.isReloading) {
      const progress = 1 - clamp(p.reloadTimer / (weapon.reloadTime || 1), 0, 1);
      ctx.fillStyle = 'rgba(6, 9, 14, 0.8)';
      panelPath(ctx, x + 18, y + 106, w - 36, 4, 2);
      ctx.fill();
      ctx.fillStyle = C.mint;
      panelPath(ctx, x + 18, y + 106, (w - 36) * progress, 4, 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // -----------------------------------------------------------------
  // Job card (left, under heat)
  // -----------------------------------------------------------------
  drawJobCard(ctx, game) {
    const missions = game.missions;
    const x = 20;
    const y = 208;
    const w = 374;
    const active = !!missions?.active;
    const marker = missions?.availableMarker?.();
    if (!active && !marker) {
      // Free-roam card.
      ctx.save();
      ctx.fillStyle = 'rgba(12, 16, 22, 0.7)';
      panelPath(ctx, x, y, w, 62, 9);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 220, 160, 0.16)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = C.cyan;
      ctx.fillRect(x, y, 4, 62);
      ctx.textAlign = 'left';
      ctx.font = `900 9px ${BODY}`;
      ctx.fillStyle = C.cyan;
      ctx.fillText('FREE ROAM', x + 16, y + 18);
      ctx.font = `700 12px ${BODY}`;
      ctx.fillStyle = C.dim;
      const tapes = (game.collectibles?.total || 12) - (game.collectibles?.foundCount || 0);
      ctx.fillText(`Hit a ramp, find ${tapes} tapes, or wait for a call.`, x + 16, y + 38);
      ctx.restore();
      return;
    }

    const step = active ? missions.step : null;
    const def = active ? missions.definition : marker?.mission;
    const timer = active && missions.stepTimeLimit > 0 ? Math.max(0, missions.stepTimeLimit - missions.stepTimer) : null;
    const h = timer !== null ? 122 : 108;

    ctx.save();
    ctx.fillStyle = C.panel;
    panelPath(ctx, x, y, w, h, 9);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 207, 92, 0.24)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = C.gold;
    ctx.fillRect(x, y, 4, h);

    ctx.textAlign = 'left';
    ctx.font = `900 9px ${BODY}`;
    ctx.fillStyle = 'rgba(255, 207, 92, 0.78)';
    const kicker = active
      ? `JOB ${missions.currentIndex + 1}/${missions.defs.length}  ·  ${def.title.toUpperCase()}`
      : `NEXT JOB  ·  ${def.title.toUpperCase()}`;
    ctx.fillText(kicker, x + 16, y + 20);

    ctx.font = `700 12.5px ${BODY}`;
    ctx.fillStyle = C.ink;
    const text = active ? (step?.text || '') : (def.intro || 'Find the gold marker.');
    const lines = wrapLines(ctx, text, w - 34).slice(0, 2);
    lines.forEach((line, i) => ctx.fillText(line, x + 16, y + 42 + i * 17));

    if (active) {
      const total = def.steps.length;
      const pipsY = y + 76;
      for (let i = 0; i < total; i += 1) {
        ctx.fillStyle = i < missions.stepIndex ? C.mint : i === missions.stepIndex ? C.gold : 'rgba(255, 243, 220, 0.14)';
        panelPath(ctx, x + 16 + i * 25, pipsY, 17, 5, 2.5);
        ctx.fill();
      }
      ctx.textAlign = 'right';
      ctx.font = `800 8px ${BODY}`;
      ctx.fillStyle = C.faint;
      ctx.fillText(`STEP ${missions.stepIndex + 1} / ${total}`, x + w - 16, pipsY + 6);
    }

    if (timer !== null) {
      ctx.textAlign = 'right';
      ctx.font = `900 15px ${MONO}`;
      ctx.fillStyle = timer < 15 ? '#ff7d86' : C.gold;
      ctx.fillText(`${Math.ceil(timer)}s`, x + w - 16, y + 101);
      ctx.fillStyle = 'rgba(255, 96, 104, 0.16)';
      panelPath(ctx, x + 16, y + 108, w - 32, 4, 2);
      ctx.fill();
      const frac = clamp(timer / Math.max(1, missions.stepTimeLimit), 0, 1);
      ctx.fillStyle = timer < 15 ? '#ff7d86' : C.gold;
      panelPath(ctx, x + 16, y + 108, (w - 32) * frac, 4, 2);
      ctx.fill();
    }

    if (this.objectiveHint) {
      ctx.textAlign = 'left';
      ctx.font = `800 9px ${BODY}`;
      ctx.fillStyle = C.mint;
      ctx.fillText(this.objectiveHint, x + 16, y + (timer !== null ? 120 : 102));
    }
    ctx.restore();
  }

  // -----------------------------------------------------------------
  // District card, toasts, radio, prompt, compass
  // -----------------------------------------------------------------
  drawDistrictBanner(ctx, game) {
    if (!this.district || this.districtTimer <= 0) return;
    const alpha = clamp(this.districtTimer / 1.2, 0, 1);
    const slide = (1 - clamp((4.4 - this.districtTimer) / 0.5, 0, 1)) * 12;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.textAlign = 'center';
    ctx.font = `900 9px ${BODY}`;
    ctx.fillStyle = C.pink;
    ctx.fillText('COSTA SOL  //  DISTRICT', 640, 40 - slide);
    ctx.font = `900 31px ${DISPLAY}`;
    ctx.fillStyle = C.ink;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.65)';
    ctx.shadowBlur = 12;
    ctx.fillText(this.district.name.toUpperCase(), 640, 74 - slide);
    ctx.shadowBlur = 0;
    ctx.font = `700 12px ${BODY}`;
    ctx.fillStyle = 'rgba(255, 243, 220, 0.66)';
    ctx.fillText(this.district.sub, 640, 94 - slide);
    ctx.strokeStyle = 'rgba(255, 207, 92, 0.42)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(560, 104 - slide);
    ctx.lineTo(720, 104 - slide);
    ctx.stroke();
    ctx.restore();
    void game;
  }

  drawToastStack(ctx, game) {
    let y = 302;
    ctx.save();
    for (const toast of this.toasts) {
      const fadeIn = clamp((toast.max - toast.timer) / 0.22, 0, 1) || (toast.timer >= toast.max - 0.001 ? 1 : 0);
      const fadeOut = clamp(toast.timer / 0.6, 0, 1);
      const alpha = fadeIn * fadeOut;
      const palette = {
        neutral: ['rgba(12, 16, 22, 0.9)', C.ink, 'rgba(255, 243, 220, 0.24)'],
        success: ['rgba(12, 34, 26, 0.92)', C.mint, 'rgba(126, 224, 176, 0.42)'],
        warning: ['rgba(38, 28, 10, 0.92)', C.gold, 'rgba(255, 207, 92, 0.42)'],
        danger: ['rgba(42, 12, 16, 0.93)', '#ff8b91', 'rgba(255, 96, 104, 0.5)'],
      };
      const [bg, ink, line] = palette[toast.type] || palette.neutral;
      ctx.globalAlpha = alpha;
      ctx.font = `700 12px ${BODY}`;
      const width = Math.min(326, ctx.measureText(toast.text).width + 40);
      const x = 1280 - 20 - width;
      const shift = (1 - fadeIn) * 22;
      ctx.fillStyle = bg;
      panelPath(ctx, x + shift, y, width, 33, 7);
      ctx.fill();
      ctx.strokeStyle = line;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = ink;
      ctx.fillRect(x + shift, y + 7, 3, 19);
      ctx.textAlign = 'left';
      let label = String(toast.text);
      const room = width - 30;
      if (ctx.measureText(label).width > room) {
        while (label.length > 4 && ctx.measureText(`${label}…`).width > room) label = label.slice(0, -1);
        label = `${label.trimEnd()}…`;
      }
      ctx.fillText(label, x + 15 + shift, y + 21);
      y += 39;
    }
    ctx.restore();
    void game;
  }

  drawRadioDeck(ctx, game) {
    if (game.state !== 'playing' && game.state !== 'dialogue') return;
    const station = RADIO_STATIONS[game.audio?.stationIndex ?? 0];
    if (!station) return;
    const x = 20;
    const y = 642;
    const w = 300;
    const h = 58;
    const alpha = this.radioVisible > 0 ? clamp(this.radioVisible / 0.5, 0, 1) : 0.75;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(10, 13, 19, 0.8)';
    panelPath(ctx, x, y, w, h, 9);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 220, 160, 0.16)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = station.color;
    ctx.beginPath();
    ctx.arc(x + 23, y + 29, 13, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#131720';
    ctx.font = `900 10px ${BODY}`;
    ctx.textAlign = 'center';
    ctx.fillText('FM', x + 23, y + 33);
    ctx.textAlign = 'left';
    ctx.font = `900 11px ${BODY}`;
    ctx.fillStyle = C.ink;
    ctx.fillText(station.name, x + 44, y + 23);
    ctx.font = `700 9px ${BODY}`;
    ctx.fillStyle = C.faint;
    ctx.fillText(`${station.genre}  ·  Q TO TUNE`, x + 44, y + 39);
    for (let i = 0; i < 5; i += 1) {
      const bar = 3 + Math.abs(Math.sin(this.titleTime * (3 + i * 0.65) + i)) * 14;
      ctx.fillStyle = station.color;
      ctx.globalAlpha = alpha * 0.85;
      ctx.fillRect(x + 254 + i * 7, y + 44 - bar, 4, bar);
    }
    ctx.restore();
  }

  drawPromptBar(ctx, game) {
    const prompt = this.prompt || game.prompt;
    if (!prompt) return;
    ctx.save();
    ctx.font = `800 13px ${BODY}`;
    const width = Math.min(520, ctx.measureText(prompt).width + 64);
    const x = 640 - width / 2;
    const y = 662;
    ctx.fillStyle = 'rgba(10, 13, 19, 0.93)';
    panelPath(ctx, x, y, width, 38, 8);
    ctx.fill();
    ctx.strokeStyle = C.lineHot;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = C.gold;
    ctx.beginPath();
    ctx.arc(x + 20, y + 19, 10, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#131720';
    ctx.font = `900 11px ${BODY}`;
    ctx.textAlign = 'center';
    ctx.fillText('E', x + 20, y + 23);
    ctx.textAlign = 'left';
    ctx.font = `800 13px ${BODY}`;
    ctx.fillStyle = C.ink;
    ctx.fillText(prompt, x + 40, y + 24);
    ctx.restore();
  }

  drawCompass(ctx, game) {
    const target = game.missions?.active ? game.missions.currentTarget() : (game.missions?.availableMarker?.() || null);
    if (!target) return;
    const p = game.player;
    const dx = target.x - p.x;
    const dy = target.y - p.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 80) return;
    const angle = Math.atan2(dy, dx);
    const pulse = 0.72 + 0.28 * Math.sin(this.titleTime * 4);
    const cx = 640 + Math.cos(angle) * 226;
    const cy = 360 + Math.sin(angle) * 226;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = `rgba(255, 207, 92, ${0.16 * pulse})`;
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(0, 0, 14, 0, TAU);
    ctx.stroke();
    ctx.rotate(angle);
    ctx.fillStyle = `rgba(255, 207, 92, ${0.9 * pulse})`;
    arrowPath(ctx, 15);
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = `900 9px ${MONO}`;
    ctx.fillStyle = 'rgba(255, 231, 184, 0.82)';
    ctx.fillText(`${Math.round(dist / 10)} m`, cx, cy + 25);
    ctx.restore();
  }

  drawChatter(ctx, game) {
    if (!this.chatter || (game.state !== 'playing' && game.state !== 'dialogue')) return;
    const alpha = clamp(this.chatterTimer / 0.5, 0, 1);
    const x = 306;
    const y = 548;
    const w = 660;
    const h = 64;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(10, 13, 19, 0.9)';
    panelPath(ctx, x, y, w, h, 9);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 143, 177, 0.3)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = C.pink;
    ctx.beginPath();
    ctx.arc(x + 24, y + 22, 11, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#181420';
    ctx.font = `900 10px ${BODY}`;
    ctx.textAlign = 'center';
    ctx.fillText(String(this.chatter.speaker || '?').slice(0, 1).toUpperCase(), x + 24, y + 26);
    ctx.textAlign = 'left';
    ctx.font = `900 9px ${BODY}`;
    ctx.fillStyle = C.pink;
    ctx.fillText(String(this.chatter.speaker).toUpperCase(), x + 43, y + 19);
    ctx.font = `600 12.5px ${BODY}`;
    ctx.fillStyle = C.ink;
    const lines = wrapLines(ctx, this.chatter.text, w - 70).slice(0, 2);
    lines.forEach((line, i) => ctx.fillText(line, x + 43, y + 37 + i * 16));
    ctx.restore();
  }

  drawBustedGauge(ctx, game) {
    const progress = game.police?.bustedProgress || 0;
    if (progress <= 0.02) return;
    const w = 250;
    const x = 640 - w / 2;
    const y = 512;
    ctx.save();
    ctx.fillStyle = 'rgba(8, 12, 20, 0.9)';
    panelPath(ctx, x, y, w, 28, 7);
    ctx.fill();
    ctx.strokeStyle = 'rgba(130, 184, 255, 0.5)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = 'rgba(130, 184, 255, 0.9)';
    panelPath(ctx, x + 4, y + 19, (w - 8) * clamp(progress / 1.35, 0, 1), 5, 2.5);
    ctx.fill();
    ctx.font = `900 9px ${BODY}`;
    ctx.fillStyle = '#d8e8ff';
    ctx.textAlign = 'center';
    ctx.fillText('BUSTED  ·  KEEP MOVING', 640, y + 14);
    ctx.restore();
  }

  drawStuntCard(ctx, game) {
    if (!this.stunt) return;
    const t = this.stuntTimer;
    const fade = clamp((3.6 - t) / 0.25, 0, 1) * clamp(t / 0.5, 0, 1);
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.translate(640, 118);
    ctx.rotate(-0.035);
    ctx.fillStyle = 'rgba(10, 13, 19, 0.92)';
    panelPath(ctx, -192, -36, 384, 76, 9);
    ctx.fill();
    ctx.strokeStyle = C.lineHot;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = C.gold;
    ctx.fillRect(-192, -36, 5, 76);
    ctx.textAlign = 'center';
    ctx.font = `900 12px ${BODY}`;
    ctx.fillStyle = C.cyan;
    ctx.fillText(this.stunt.label || 'STUNT', 0, -13);
    ctx.font = `900 31px ${DISPLAY}`;
    ctx.fillStyle = C.ink;
    ctx.fillText(`+ ${money(this.stunt.cash)}`, 0, 19);
    ctx.font = `800 9px ${BODY}`;
    ctx.fillStyle = C.faint;
    ctx.fillText(`${Number(this.stunt.air || 0).toFixed(2)}s AIR  ·  CLEAN LANDING`, 0, 34);
    ctx.restore();
    void game;
  }

  drawMissionBanner(ctx, game) {
    const b = this.banner;
    const fadeIn = clamp((b.max - b.timer) / 0.35, 0, 1);
    const fadeOut = clamp(b.timer / 0.45, 0, 1);
    const alpha = fadeIn * fadeOut;
    const x = 414;
    const y = 126;
    const w = 572;
    const h = 104;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(9, 12, 18, 0.93)';
    panelPath(ctx, x, y, w, h, 10);
    ctx.fill();
    ctx.strokeStyle = C.lineHot;
    ctx.lineWidth = 1.3;
    ctx.stroke();
    ctx.fillStyle = C.gold;
    ctx.fillRect(x, y, 5, h);
    ctx.textAlign = 'left';
    ctx.font = `900 9px ${BODY}`;
    ctx.fillStyle = C.pink;
    ctx.fillText(`JOB ${b.index + 1}  ·  COSTA SOL`, x + 26, y + 21);
    ctx.font = `900 25px ${DISPLAY}`;
    ctx.fillStyle = C.ink;
    ctx.fillText(String(b.title).toUpperCase(), x + 26, y + 48);
    ctx.font = `700 12px ${BODY}`;
    ctx.fillStyle = C.dim;
    ctx.fillText(wrapLines(ctx, b.text, 480)[0] || '', x + 26, y + 68);
    const total = Math.max(1, b.total);
    for (let i = 0; i < total; i += 1) {
      ctx.fillStyle = i + 1 <= b.step ? C.mint : 'rgba(255, 243, 220, 0.14)';
      panelPath(ctx, x + 26 + i * 30, y + 82, 20, 4, 2);
      ctx.fill();
    }
    ctx.textAlign = 'right';
    ctx.font = `900 9px ${BODY}`;
    ctx.fillStyle = C.gold;
    ctx.fillText(`STEP ${b.step} / ${b.total}`, x + w - 22, y + 86);
    if (game.missions?.active && game.missions.stepTimeLimit > 0) {
      const left = Math.max(0, game.missions.stepTimeLimit - game.missions.stepTimer);
      ctx.fillStyle = left < 15 ? '#ff7d86' : C.gold;
      ctx.font = `900 12px ${MONO}`;
      ctx.fillText(`${Math.ceil(left)}s`, x + w - 22, y + 22);
    }
    ctx.restore();
  }

  // =================================================================
  // Screens
  // =================================================================
  drawScreens(ctx, game) {
    this.buttons = [];
    switch (game.state) {
      case 'title': this.drawTitleScreen(ctx, game); break;
      case 'controls': this.drawControlsScreen(ctx, game); break;
      case 'paused': this.drawPauseScreen(ctx, game); break;
      case 'dialogue': this.drawDialogueScreen(ctx, game); break;
      case 'missionComplete': this.drawMissionPassed(ctx, game); break;
      case 'missionFailed': this.drawMissionFailedScreen(ctx, game); break;
      case 'wasted': this.drawFateScreen(ctx, game, 'WASTED', '#ff5d6c', 'Costa Sol General patched you up.'); break;
      case 'busted': this.drawFateScreen(ctx, game, 'BUSTED', '#82b8ff', 'The precinct booked you.'); break;
      case 'photo': this.drawPhotoOverlay(ctx, game); break;
      case 'ending': this.drawEndingScreen(ctx, game); break;
      default: break;
    }
  }

  dim(ctx, opacity = 0.5) {
    ctx.fillStyle = `rgba(6, 9, 15, ${opacity})`;
    ctx.fillRect(0, 0, 1280, 720);
  }

  drawButton(ctx, game, x, y, w, h, label, action, opts = {}) {
    const mouse = game.input?.mouse || { x: -1, y: -1 };
    const hover = mouse.x >= x && mouse.x <= x + w && mouse.y >= y && mouse.y <= y + h;
    const selected = this.menuIndex === (opts.index ?? 0);
    const disabled = !!opts.disabled;
    this.buttons.push({ x, y, w, h, action, disabled });
    const active = (hover || selected) && !disabled;
    ctx.save();
    ctx.fillStyle = active ? C.gold : 'rgba(14, 18, 24, 0.88)';
    panelPath(ctx, x, y, w, h, 6);
    ctx.fill();
    ctx.strokeStyle = disabled ? 'rgba(255, 243, 220, 0.1)' : active ? 'rgba(255, 226, 160, 0.9)' : C.line;
    ctx.lineWidth = 1.1;
    ctx.stroke();
    if (active) {
      ctx.fillStyle = 'rgba(20, 16, 12, 0.22)';
      ctx.fillRect(x + 1, y + 1, 4, h - 2);
    }
    ctx.textAlign = 'left';
    ctx.font = `900 17px ${BODY}`;
    ctx.fillStyle = disabled ? 'rgba(255, 243, 220, 0.24)' : active ? '#171310' : C.ink;
    ctx.fillText(label, x + 20, y + h / 2 + (opts.sub ? 2 : 6));
    if (opts.sub) {
      ctx.font = `700 9px ${BODY}`;
      ctx.fillStyle = active ? 'rgba(23, 19, 16, 0.65)' : C.faint;
      ctx.fillText(opts.sub, x + 21, y + h / 2 + 17);
    }
    if (active) {
      ctx.fillStyle = '#171310';
      ctx.beginPath();
      ctx.moveTo(x + w - 28, y + h / 2 - 5);
      ctx.lineTo(x + w - 18, y + h / 2);
      ctx.lineTo(x + w - 28, y + h / 2 + 5);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  // -----------------------------------------------------------------
  // Title
  // -----------------------------------------------------------------
  drawTitleScreen(ctx, game) {
    this.dim(ctx, 0.03);
    // Left scrim.
    const left = ctx.createLinearGradient(0, 0, 760, 0);
    left.addColorStop(0, 'rgba(7, 10, 15, 0.96)');
    left.addColorStop(0.62, 'rgba(7, 10, 15, 0.72)');
    left.addColorStop(1, 'rgba(7, 10, 15, 0)');
    ctx.fillStyle = left;
    ctx.fillRect(0, 0, 800, 720);
    const bottom = ctx.createLinearGradient(0, 520, 0, 720);
    bottom.addColorStop(0, 'rgba(6, 9, 14, 0)');
    bottom.addColorStop(1, 'rgba(6, 9, 14, 0.92)');
    ctx.fillStyle = bottom;
    ctx.fillRect(0, 520, 1280, 200);

    // Halo behind the wordmark.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const halo = ctx.createRadialGradient(160, 222, 10, 160, 222, 250);
    halo.addColorStop(0, 'rgba(255, 156, 104, 0.32)');
    halo.addColorStop(0.42, 'rgba(255, 96, 132, 0.12)');
    halo.addColorStop(1, 'rgba(255, 96, 132, 0)');
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, 560, 520);
    ctx.restore();
    ctx.strokeStyle = 'rgba(255, 196, 128, 0.3)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(160, 222, 132, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(160, 222, 146, 0.35, 1.24);
    ctx.stroke();

    // Kicker.
    ctx.textAlign = 'left';
    ctx.font = `900 9px ${BODY}`;
    ctx.fillStyle = C.pink;
    ctx.fillText(`COSTA SOL  //  A CRIME STORY  //  BUILD ${GAME_VERSION}`, 78, 88);

    // Wordmark.
    ctx.save();
    ctx.font = `900 86px ${DISPLAY}`;
    ctx.fillStyle = 'rgba(255, 208, 156, 0.09)';
    ctx.fillText('LEONIDA', 83, 209);
    ctx.restore();
    const warm = ctx.createLinearGradient(70, 136, 520, 210);
    warm.addColorStop(0, '#fff0cb');
    warm.addColorStop(0.5, '#ffc07c');
    warm.addColorStop(1, '#ff8b7e');
    ctx.font = `900 86px ${DISPLAY}`;
    ctx.fillStyle = warm;
    ctx.shadowColor = 'rgba(255, 120, 110, 0.45)';
    ctx.shadowBlur = 20;
    ctx.fillText('LEONIDA', 78, 202);
    ctx.shadowBlur = 0;

    const hot = ctx.createLinearGradient(80, 300, 480, 218);
    hot.addColorStop(0, '#ffd166');
    hot.addColorStop(0.5, '#ff7d62');
    hot.addColorStop(1, '#e64a68');
    ctx.font = `900 118px ${DISPLAY}`;
    ctx.fillStyle = hot;
    ctx.shadowColor = 'rgba(220, 52, 80, 0.5)';
    ctx.shadowBlur = 24;
    ctx.fillText('HEAT', 86, 306);
    ctx.shadowBlur = 0;

    ctx.font = `800 18px ${BODY}`;
    ctx.fillStyle = 'rgba(255, 243, 220, 0.88)';
    ctx.fillText(GAME_SUBTITLE.toUpperCase(), 90, 342);
    ctx.font = `600 12px ${BODY}`;
    ctx.fillStyle = 'rgba(255, 243, 220, 0.56)';
    ctx.fillText('Drive the coast. Rob the row. Take the estate.', 90, 364);

    // Menu cards.
    const hasSave = game.hasSaveFile?.() ?? false;
    const items = [
      { label: 'NEW GAME', action: 'new', sub: 'A fresh seeded Costa Sol', disabled: false },
      { label: 'CONTINUE', action: 'continue', sub: hasSave ? 'Load the latest autosave' : 'No save on this machine', disabled: !hasSave },
      { label: 'CONTROLS', action: 'controls', sub: 'Keys, heat and photo mode', disabled: false },
    ];
    items.forEach((item, i) => {
      this.drawButton(ctx, game, 80, 414 + i * 58, 354, 50, item.label, item.action, {
        index: i, sub: item.sub, disabled: item.disabled,
      });
    });

    // City pulse card, right.
    ctx.save();
    ctx.fillStyle = 'rgba(9, 13, 19, 0.78)';
    panelPath(ctx, 900, 404, 306, 214, 10);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 220, 160, 0.2)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = C.cyan;
    ctx.fillRect(900, 420, 4, 40);
    ctx.textAlign = 'left';
    ctx.font = `900 9px ${BODY}`;
    ctx.fillStyle = C.cyan;
    ctx.fillText('CITY PULSE', 918, 420);
    ctx.font = `700 11px ${BODY}`;
    ctx.fillStyle = C.dim;
    ctx.fillText('Six districts, one long night.', 918, 438);
    const rows = [
      ['DISTRICTS', '06'],
      ['RADIO', '04'],
      ['JOBS', '05'],
      ['MIXTAPES', '12'],
      ['STUNT RAMPS', '09'],
    ];
    let rowY = 466;
    for (const [key, value] of rows) {
      ctx.font = `800 9px ${BODY}`;
      ctx.fillStyle = C.faint;
      ctx.fillText(key, 918, rowY);
      ctx.textAlign = 'right';
      ctx.font = `900 14px ${MONO}`;
      ctx.fillStyle = C.ink;
      ctx.fillText(value, 1188, rowY);
      ctx.textAlign = 'left';
      ctx.strokeStyle = 'rgba(255, 243, 220, 0.08)';
      ctx.beginPath();
      ctx.moveTo(918, rowY + 6);
      ctx.lineTo(1188, rowY + 6);
      ctx.stroke();
      rowY += 26;
    }
    ctx.restore();

    // Save summary.
    const summary = game.saveSummary?.();
    ctx.textAlign = 'left';
    ctx.font = `800 9px ${BODY}`;
    ctx.fillStyle = C.faint;
    if (summary) {
      ctx.fillText(`LAST SAVE  ·  ${money(summary.money)}  ·  ${summary.missions}/5 JOBS  ·  ${summary.collectibles}/12 TAPES`, 80, 636);
    } else {
      ctx.fillText('NO SAVE YET  ·  START WITH NEW GAME', 80, 636);
    }

    // Footer.
    ctx.textAlign = 'center';
    ctx.font = `700 11px ${BODY}`;
    ctx.fillStyle = 'rgba(255, 243, 220, 0.62)';
    ctx.fillText('WASD move · MOUSE aim · E enter · G frag · SPACE handbrake · Z photo · ESC pause', 640, 692);
    ctx.textAlign = 'right';
    ctx.font = `700 9px ${BODY}`;
    ctx.fillStyle = 'rgba(255, 243, 220, 0.35)';
    ctx.fillText('ORIGINAL CITY · ORIGINAL SOUND · OFFLINE', 1260, 692);
    if (this.mutedNotice > 0) {
      ctx.textAlign = 'center';
      ctx.font = `900 12px ${BODY}`;
      ctx.fillStyle = game.audio?.muted ? C.gold : C.mint;
      ctx.fillText(game.audio?.muted ? 'SOUND MUTED' : 'SOUND ON', 640, 670);
    }
    void GAME_TITLE;
  }

  // -----------------------------------------------------------------
  // Controls
  // -----------------------------------------------------------------
  drawControlsScreen(ctx, game) {
    this.dim(ctx, 0.76);
    ctx.save();
    ctx.fillStyle = C.panelSolid;
    panelPath(ctx, 78, 54, 1124, 560, 14);
    ctx.fill();
    ctx.strokeStyle = C.lineHot;
    ctx.lineWidth = 1.3;
    ctx.stroke();
    ctx.fillStyle = C.gold;
    ctx.fillRect(78, 54, 6, 560);

    ctx.textAlign = 'left';
    ctx.font = `900 10px ${BODY}`;
    ctx.fillStyle = C.pink;
    ctx.fillText('FIELD MANUAL', 116, 90);
    ctx.font = `900 30px ${DISPLAY}`;
    ctx.fillStyle = C.ink;
    ctx.fillText('CONTROLS & SURVIVAL', 114, 124);

    const columns = [
      {
        title: 'ON FOOT',
        color: C.gold,
        rows: [
          ['W A S D / ARROWS', 'Walk and steer'],
          ['SHIFT', 'Sprint'],
          ['SPACE', 'Dodge roll'],
          ['MOUSE', 'Aim at the cursor'],
          ['LEFT CLICK', 'Fire, or throw a melee combo'],
          ['R', 'Reload'],
          ['1–5 / WHEEL', 'Switch weapon'],
          ['G', 'Throw a frag grenade'],
        ],
      },
      {
        title: 'ON WHEELS',
        color: C.cyan,
        rows: [
          ['W / S', 'Throttle and brake'],
          ['A / D', 'Steer'],
          ['SPACE', 'Handbrake slide'],
          ['E or F', 'Enter, exit, carjack'],
          ['H', 'Horn'],
          ['E AT GARAGE', 'Repair for cash'],
        ],
      },
      {
        title: 'THE CITY',
        color: C.mint,
        rows: [
          ['Z', 'Photo mode (new)'],
          ['Q', 'Cycle radio station'],
          ['M', 'Mute / unmute'],
          ['T', 'Clock and weather report'],
          ['GOLD MARKER', 'Start the next job'],
          ['RAMPS', 'Hit them fast for airtime'],
          ['MIXTAPES', 'Find all twelve for a bonus'],
          ['PAUSE → SAVE', 'Manual save; jobs autosave'],
        ],
      },
    ];

    columns.forEach((column, ci) => {
      const x = 116 + ci * 358;
      ctx.font = `900 10px ${BODY}`;
      ctx.fillStyle = column.color;
      ctx.fillText(column.title, x, 166);
      ctx.strokeStyle = column.color;
      ctx.globalAlpha = 0.4;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, 174);
      ctx.lineTo(x + 300, 174);
      ctx.stroke();
      ctx.globalAlpha = 1;
      let y = 202;
      for (const [key, desc] of column.rows) {
        ctx.font = `900 10px ${BODY}`;
        ctx.fillStyle = column.color;
        ctx.fillText(key, x, y);
        ctx.font = `600 12px ${BODY}`;
        ctx.fillStyle = 'rgba(255, 243, 220, 0.8)';
        ctx.fillText(desc, x, y + 16);
        y += 42;
      }
    });

    // Photo mode explainer strip.
    ctx.fillStyle = 'rgba(111, 224, 230, 0.08)';
    panelPath(ctx, 114, 528, 1052, 40, 7);
    ctx.fill();
    ctx.strokeStyle = 'rgba(111, 224, 230, 0.3)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.font = `900 9px ${BODY}`;
    ctx.fillStyle = C.cyan;
    ctx.fillText('PHOTO MODE', 130, 543);
    ctx.font = `700 11px ${BODY}`;
    ctx.fillStyle = C.dim;
    ctx.fillText('Z opens a free camera. WASD pans, wheel zooms, ENTER takes the shot, Z or ESC returns to the street.', 130, 559);

    ctx.restore();
    this.drawButton(ctx, game, 540, 626, 200, 42, 'BACK', 'back', { index: 0 });
  }

  // -----------------------------------------------------------------
  // Pause
  // -----------------------------------------------------------------
  drawPauseScreen(ctx, game) {
    this.dim(ctx, 0.66);
    ctx.save();
    ctx.fillStyle = C.panelSolid;
    panelPath(ctx, 128, 86, 1024, 548, 14);
    ctx.fill();
    ctx.strokeStyle = C.lineHot;
    ctx.lineWidth = 1.3;
    ctx.stroke();
    ctx.fillStyle = C.gold;
    ctx.fillRect(128, 86, 6, 548);

    ctx.textAlign = 'left';
    ctx.font = `900 10px ${BODY}`;
    ctx.fillStyle = C.pink;
    ctx.fillText('PAUSED', 168, 124);
    ctx.font = `900 46px ${DISPLAY}`;
    ctx.fillStyle = C.ink;
    ctx.fillText('TAKE A BREATH', 164, 172);

    // Left menu.
    const items = [
      ['RESUME', 'resume'],
      ['SAVE GAME', 'save'],
      ['LOAD GAME', 'load'],
      ['CONTROLS', 'controls'],
      ['QUIT TO TITLE', 'title'],
    ];
    items.forEach(([label, action], i) => {
      this.drawButton(ctx, game, 168, 214 + i * 58, 460, 46, label, action, { index: i });
    });

    // Right status card.
    ctx.fillStyle = 'rgba(8, 12, 18, 0.72)';
    panelPath(ctx, 672, 214, 432, 292, 10);
    ctx.fill();
    ctx.strokeStyle = C.line;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.textAlign = 'left';
    ctx.font = `900 9px ${BODY}`;
    ctx.fillStyle = C.gold;
    ctx.fillText('SESSION FILE', 696, 240);
    const district = districtAt(game.player.x, game.player.y);
    const rows = [
      ['DISTRICT', district.name],
      ['CLOCK', `${clockText(game.timeOfDay)}  ·  ${weatherName(game)}`],
      ['WALLET', money(game.player.money)],
      ['HEAT', `${game.police?.wantedStars || 0} / 5`],
      ['JOBS DONE', `${game.missions?.completedCount || 0} / 5`],
      ['MIXTAPES', `${game.collectibles?.foundCount || 0} / 12`],
      ['STUNTS', `${game.stuntsCount || 0}  ·  best ${(game.bestStunt || 0).toFixed(2)}s`],
    ];
    let ry = 270;
    for (const [key, value] of rows) {
      ctx.font = `800 9px ${BODY}`;
      ctx.fillStyle = C.faint;
      ctx.fillText(key, 696, ry);
      ctx.textAlign = 'right';
      ctx.font = `800 11px ${BODY}`;
      ctx.fillStyle = C.ink;
      ctx.fillText(value, 1080, ry);
      ctx.textAlign = 'left';
      ctx.strokeStyle = 'rgba(255, 243, 220, 0.07)';
      ctx.beginPath();
      ctx.moveTo(696, ry + 7);
      ctx.lineTo(1080, ry + 7);
      ctx.stroke();
      ry += 31;
    }

    ctx.textAlign = 'center';
    ctx.font = `700 10px ${BODY}`;
    ctx.fillStyle = C.faint;
    ctx.fillText('ESC resumes  ·  M mutes  ·  jobs autosave at checkpoints', 640, 588);
    if (game.saveNotice && game.saveNotice > 0) {
      ctx.font = `900 13px ${BODY}`;
      ctx.fillStyle = C.mint;
      ctx.fillText('GAME SAVED', 640, 612);
    }
    ctx.restore();
  }

  // -----------------------------------------------------------------
  // Dialogue
  // -----------------------------------------------------------------
  drawDialogueScreen(ctx, game) {
    const d = this.dialog;
    if (!d) return;
    this.dim(ctx, 0.22);
    const x = 170;
    const y = 486;
    const w = 940;
    const h = 194;
    ctx.save();
    ctx.fillStyle = 'rgba(9, 12, 18, 0.97)';
    panelPath(ctx, x, y, w, h, 13);
    ctx.fill();
    ctx.strokeStyle = C.lineHot;
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.fillStyle = C.gold;
    ctx.fillRect(x, y, 6, h);

    this.drawPortrait(ctx, x + 18, y + 18, 100, 122, d.speaker, d.portrait);

    // Name tab.
    const name = String(d.speaker || 'UNKNOWN').toUpperCase();
    ctx.font = `900 12px ${BODY}`;
    const tabW = Math.max(150, ctx.measureText(name).width + 30);
    ctx.fillStyle = C.pink;
    panelPath(ctx, x + 136, y + 18, tabW, 24, 5);
    ctx.fill();
    ctx.fillStyle = '#181420';
    ctx.textAlign = 'left';
    ctx.fillText(name, x + 149, y + 35);

    ctx.font = `600 19px ${BODY}`;
    ctx.fillStyle = C.ink;
    const lines = wrapLines(ctx, d.text, w - 190);
    let ty = y + 74;
    for (const line of lines.slice(0, 5)) {
      ctx.fillText(line, x + 136, ty);
      ty += 26;
    }

    ctx.font = `800 9px ${BODY}`;
    ctx.fillStyle = C.faint;
    ctx.textAlign = 'right';
    ctx.fillText('SPACE / CLICK TO CONTINUE', x + w - 22, y + h - 18);
    ctx.fillStyle = 'rgba(255, 207, 92, 0.12)';
    panelPath(ctx, x + 136, y + h - 40, w - 170, 3, 1.5);
    ctx.fill();
    const seq = game.dialogueTotal > 1 ? (game.dialogueIndex + 1) / game.dialogueTotal : 1;
    ctx.fillStyle = C.gold;
    panelPath(ctx, x + 136, y + h - 40, (w - 170) * seq, 3, 1.5);
    ctx.fill();
    ctx.restore();
  }

  drawPortrait(ctx, x, y, w, h, speaker, portraitId) {
    const id = String(portraitId || speaker || '').toLowerCase();
    const variants = {
      maya: { skin: '#c98d63', hair: '#1d1416', shirt: '#c4486b', bg: '#2b2430', accent: '#ff8fb1' },
      leo: { skin: '#e0ad82', hair: '#2b211c', shirt: '#4a5d67', bg: '#1e2a30', accent: '#6fe0e6' },
      crowe: { skin: '#b58d70', hair: '#d8d2c6', shirt: '#252c36', bg: '#2e2621', accent: '#ffcf5c' },
      dispatch: { skin: '#8f6a52', hair: '#31291f', shirt: '#2f4e68', bg: '#1c2834', accent: '#82b8ff' },
      rourke: { skin: '#d0a077', hair: '#4b3527', shirt: '#7a4b38', bg: '#30221e', accent: '#ffb45c' },
      valet: { skin: '#d8ae86', hair: '#2a2420', shirt: '#8f2f3c', bg: '#2a1a22', accent: '#ffd166' },
    };
    const palette = variants[id.split(' ')[0]] || variants.leo;
    const seed = hashString(id);
    ctx.save();
    ctx.fillStyle = 'rgba(255, 207, 92, 0.1)';
    panelPath(ctx, x, y, w, h, 7);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 207, 92, 0.35)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.save();
    panelPath(ctx, x + 2, y + 2, w - 4, h - 4, 6);
    ctx.clip();
    const bg = ctx.createLinearGradient(x, y, x, y + h);
    bg.addColorStop(0, palette.bg);
    bg.addColorStop(1, '#0b0e14');
    ctx.fillStyle = bg;
    ctx.fillRect(x, y, w, h);
    // Back glow.
    ctx.fillStyle = alpha(palette.accent, 0.12);
    ctx.beginPath();
    ctx.arc(x + w * 0.5, y + h * 0.42, w * 0.44, 0, TAU);
    ctx.fill();

    // Shoulders.
    ctx.fillStyle = palette.shirt;
    ctx.beginPath();
    ctx.ellipse(x + w * 0.5, y + h + 8, w * 0.54, h * 0.38, 0, Math.PI, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.beginPath();
    ctx.ellipse(x + w * 0.5, y + h + 8, w * 0.54, h * 0.18, 0, Math.PI, TAU);
    ctx.fill();

    // Neck and head.
    ctx.fillStyle = palette.skin;
    ctx.fillRect(x + w * 0.42, y + h * 0.62, w * 0.16, h * 0.16);
    ctx.beginPath();
    ctx.ellipse(x + w * 0.5, y + h * 0.47, w * 0.22, h * 0.25, 0, 0, TAU);
    ctx.fill();

    // Hair shapes per character.
    ctx.fillStyle = palette.hair;
    if (id.includes('maya')) {
      ctx.beginPath();
      ctx.arc(x + w * 0.5, y + h * 0.42, w * 0.25, Math.PI * 0.92, Math.PI * 2.04);
      ctx.fill();
      ctx.fillRect(x + w * 0.25, y + h * 0.44, w * 0.07, h * 0.3);
      ctx.fillRect(x + w * 0.68, y + h * 0.44, w * 0.07, h * 0.3);
    } else if (id.includes('crowe')) {
      ctx.beginPath();
      ctx.arc(x + w * 0.5, y + h * 0.4, w * 0.24, Math.PI * 0.9, Math.PI * 2.06);
      ctx.fill();
      ctx.fillStyle = '#b9b2a5';
      ctx.fillRect(x + w * 0.36, y + h * 0.61, w * 0.28, h * 0.06);
    } else if (id.includes('dispatch')) {
      ctx.beginPath();
      ctx.arc(x + w * 0.5, y + h * 0.4, w * 0.23, Math.PI * 0.9, Math.PI * 2.06);
      ctx.fill();
      // Headset.
      ctx.strokeStyle = palette.accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x + w * 0.5, y + h * 0.42, w * 0.25, Math.PI * 0.85, Math.PI * 1.95);
      ctx.stroke();
      ctx.fillStyle = palette.accent;
      ctx.fillRect(x + w * 0.22, y + h * 0.42, 3, 9);
      ctx.fillRect(x + w * 0.73, y + h * 0.42, 3, 9);
    } else if (id.includes('rourke')) {
      ctx.fillStyle = '#2c2019';
      ctx.fillRect(x + w * 0.26, y + h * 0.29, w * 0.48, h * 0.1);
      ctx.fillStyle = palette.hair;
      ctx.beginPath();
      ctx.arc(x + w * 0.5, y + h * 0.4, w * 0.22, Math.PI * 0.95, Math.PI * 2.02);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(x + w * 0.5, y + h * 0.39, w * 0.23, Math.PI * 0.88, Math.PI * 2.05);
      ctx.fill();
      ctx.fillRect(x + w * 0.3, y + h * 0.36, w * 0.08, h * 0.1);
    }

    // Eyes, brows, mouth.
    ctx.fillStyle = 'rgba(28, 20, 18, 0.9)';
    ctx.fillRect(x + w * 0.41, y + h * 0.46, 2.4, 2.4);
    ctx.fillRect(x + w * 0.56, y + h * 0.46, 2.4, 2.4);
    ctx.fillStyle = 'rgba(80, 48, 42, 0.65)';
    ctx.fillRect(x + w * 0.45, y + h * 0.59, w * 0.1, 1.6);
    if (id.includes('leo')) {
      ctx.fillStyle = 'rgba(60, 44, 34, 0.28)';
      ctx.fillRect(x + w * 0.36, y + h * 0.53, w * 0.28, h * 0.07);
    }
    if (id.includes('maya')) {
      ctx.strokeStyle = palette.accent;
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.arc(x + w * 0.38, y + h * 0.58, 3, 0, TAU);
      ctx.arc(x + w * 0.61, y + h * 0.58, 3, 0, TAU);
      ctx.stroke();
    }
    if (id.includes('crowe')) {
      ctx.strokeStyle = 'rgba(190, 120, 100, 0.7)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x + w * 0.44, y + h * 0.36);
      ctx.lineTo(x + w * 0.52, y + h * 0.49);
      ctx.stroke();
    }

    // Vignette.
    const vig = ctx.createRadialGradient(x + w / 2, y + h / 2, w * 0.2, x + w / 2, y + h / 2, w * 0.75);
    vig.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vig.addColorStop(1, 'rgba(0, 0, 0, 0.52)');
    ctx.fillStyle = vig;
    ctx.fillRect(x, y, w, h);
    ctx.restore();
    ctx.restore();
    void seed;
  }

  // -----------------------------------------------------------------
  // Mission outcomes
  // -----------------------------------------------------------------
  drawMissionPassed(ctx, game) {
    this.dim(ctx, 0.64);
    const info = game.missionComplete;
    // Accent bars.
    ctx.save();
    ctx.fillStyle = 'rgba(126, 224, 176, 0.1)';
    ctx.fillRect(0, 176, 1280, 3);
    ctx.fillRect(0, 500, 1280, 1);
    ctx.textAlign = 'center';
    ctx.font = `900 10px ${BODY}`;
    ctx.fillStyle = C.mint;
    ctx.fillText('COSTA SOL HOLDS ITS BREATH', 640, 166);
    ctx.font = `900 66px ${DISPLAY}`;
    ctx.fillStyle = '#e8ffd9';
    ctx.shadowColor = 'rgba(140, 250, 190, 0.3)';
    ctx.shadowBlur = 14;
    ctx.fillText('JOB DONE', 640, 254);
    ctx.shadowBlur = 0;
    ctx.font = `900 24px ${BODY}`;
    ctx.fillStyle = C.pink;
    ctx.fillText((info?.def?.title || 'THE JOB').toUpperCase(), 640, 296);
    ctx.font = `800 11px ${BODY}`;
    ctx.fillStyle = C.faint;
    ctx.fillText(`JOB ${info?.def?.id || 1} OF 5`, 640, 318);
    ctx.font = `900 46px ${MONO}`;
    ctx.fillStyle = C.gold;
    ctx.fillText(`+ ${money(info?.reward || 0)}`, 640, 382);
    ctx.font = `600 13px ${BODY}`;
    ctx.fillStyle = 'rgba(255, 243, 220, 0.75)';
    ctx.fillText(info?.final ? 'The city is yours. One last ride awaits.' : 'Autosaved. The next marker is already on the map.', 640, 416);
    ctx.font = `800 10px ${BODY}`;
    ctx.fillStyle = C.faint;
    ctx.fillText(`${game.collectibles?.foundCount || 0}/12 TAPES  ·  ${game.stuntsCount || 0} CLEAN STUNTS  ·  ${money(game.player.money)}`, 640, 442);
    ctx.restore();
    this.drawButton(ctx, game, 520, 470, 240, 46, info?.final ? 'FINALE' : 'CONTINUE', 'continue', { index: 0 });
  }

  drawMissionFailedScreen(ctx, game) {
    this.dim(ctx, 0.72);
    const info = game.missionFailed;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = `900 10px ${BODY}`;
    ctx.fillStyle = C.pink;
    ctx.fillText('THE JOB WENT SIDEWAYS', 640, 176);
    ctx.font = `900 70px ${DISPLAY}`;
    ctx.fillStyle = '#ff6b72';
    ctx.shadowColor = 'rgba(190, 30, 50, 0.5)';
    ctx.shadowBlur = 22;
    ctx.fillText('JOB BLOWN', 640, 252);
    ctx.shadowBlur = 0;
    ctx.font = `900 22px ${BODY}`;
    ctx.fillStyle = '#ffe6b5';
    ctx.fillText((info?.def?.title || 'THE JOB').toUpperCase(), 640, 292);
    ctx.font = `600 16px ${BODY}`;
    ctx.fillStyle = 'rgba(255, 243, 220, 0.84)';
    ctx.fillText(info?.reason || 'The job went sideways.', 640, 326);
    ctx.font = `800 9px ${BODY}`;
    ctx.fillStyle = C.faint;
    ctx.fillText('CHECKPOINT RETRY RESTORES HEALTH, ARMOUR AND THE LAST STEP', 640, 352);
    ctx.restore();
    this.drawButton(ctx, game, 380, 392, 240, 48, 'RETRY', 'retry', { index: 0 });
    this.drawButton(ctx, game, 660, 392, 240, 48, 'DROP JOB', 'abandon', { index: 1 });
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = `700 11px ${BODY}`;
    ctx.fillStyle = C.faint;
    ctx.fillText('ENTER retries from the checkpoint  ·  ESC drops the job', 640, 472);
    ctx.restore();
  }

  drawFateScreen(ctx, game, word, color, line) {
    const busted = word === 'BUSTED';
    ctx.save();
    const grad = ctx.createRadialGradient(640, 340, 50, 640, 340, 760);
    grad.addColorStop(0, 'rgba(10, 14, 20, 0.55)');
    grad.addColorStop(1, busted ? 'rgba(6, 20, 48, 0.9)' : 'rgba(62, 8, 18, 0.9)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1280, 720);
    ctx.textAlign = 'center';
    ctx.font = `900 106px ${DISPLAY}`;
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 28;
    ctx.fillText(word, 640, 326);
    ctx.shadowBlur = 0;
    ctx.font = `800 18px ${BODY}`;
    ctx.fillStyle = C.ink;
    const fee = busted ? WANTED_CONFIG.bustedFine : WANTED_CONFIG.wastedFee;
    ctx.fillText(`${line} Fee ${money(fee)}.`, 640, 376);
    ctx.font = `600 14px ${BODY}`;
    ctx.fillStyle = 'rgba(255, 243, 220, 0.68)';
    ctx.fillText(
      busted ? 'Costa Sol PD releases you outside headquarters. Weapons are lighter.' : 'Costa Sol General will take you back at the hospital.',
      640,
      404,
    );
    const remaining = Math.max(0, 1 - game.stateTimer / game.stateDuration);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
    panelPath(ctx, 490, 442, 300, 8, 4);
    ctx.fill();
    ctx.fillStyle = color;
    panelPath(ctx, 490, 442, 300 * remaining, 8, 4);
    ctx.fill();
    if (game.missions?.active) {
      ctx.font = `700 11px ${BODY}`;
      ctx.fillStyle = 'rgba(255, 243, 220, 0.55)';
      ctx.fillText('The current job will fail.', 640, 478);
    }
    ctx.restore();
  }

  // -----------------------------------------------------------------
  // Photo mode
  // -----------------------------------------------------------------
  drawPhotoOverlay(ctx, game) {
    const photo = game.photo || {};
    const flash = this.photoFlash;
    ctx.save();
    // Subtle letterbox.
    ctx.fillStyle = 'rgba(4, 6, 10, 0.82)';
    ctx.fillRect(0, 0, 1280, 34);
    ctx.fillRect(0, 686, 1280, 34);

    // Viewfinder brackets.
    ctx.strokeStyle = 'rgba(255, 248, 226, 0.8)';
    ctx.lineWidth = 2;
    const m = 56;
    const arm = 34;
    for (const [x, y, dx, dy] of [[m, m, 1, 1], [1280 - m, m, -1, 1], [m, 720 - m, 1, -1], [1280 - m, 720 - m, -1, -1]]) {
      ctx.beginPath();
      ctx.moveTo(x + dx * arm, y);
      ctx.lineTo(x, y);
      ctx.lineTo(x, y + dy * arm);
      ctx.stroke();
    }
    // Centre focus mark.
    ctx.strokeStyle = 'rgba(255, 248, 226, 0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(640, 360, 26, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(640, 326); ctx.lineTo(640, 342);
    ctx.moveTo(640, 378); ctx.lineTo(640, 394);
    ctx.moveTo(606, 360); ctx.lineTo(622, 360);
    ctx.moveTo(658, 360); ctx.lineTo(674, 360);
    ctx.stroke();

    // Top strip.
    ctx.textAlign = 'left';
    ctx.font = `900 10px ${BODY}`;
    ctx.fillStyle = C.coral;
    ctx.fillText('PHOTO MODE', 74, 23);
    ctx.fillStyle = C.faint;
    ctx.font = `800 9px ${MONO}`;
    ctx.fillText(`${clockText(game.timeOfDay)}  ·  ${weatherName(game)}  ·  ${districtAt(game.player.x, game.player.y).short}`, 170, 23);
    ctx.textAlign = 'right';
    ctx.font = `800 9px ${BODY}`;
    ctx.fillStyle = C.dim;
    ctx.fillText(`${photo.photos || 0} ${photo.photos === 1 ? 'SHOT' : 'SHOTS'} TAKEN`, 1200, 23);

    // Bottom strip.
    ctx.textAlign = 'left';
    ctx.font = `800 10px ${BODY}`;
    ctx.fillStyle = C.dim;
    ctx.fillText('WASD PAN  ·  WHEEL ZOOM  ·  ENTER SHUTTER  ·  Z / ESC EXIT', 74, 706);
    ctx.textAlign = 'right';
    ctx.font = `900 11px ${MONO}`;
    ctx.fillStyle = C.gold;
    ctx.fillText(`ZOOM ${(photo.zoom || 1).toFixed(2)}x`, 1200, 706);

    // Shutter flash / focus pulse.
    if (flash > 0.02) {
      ctx.fillStyle = `rgba(255, 252, 240, ${flash * 0.85})`;
      ctx.fillRect(0, 0, 1280, 720);
    } else {
      const pulse = 0.25 + 0.25 * Math.sin(this.titleTime * 3);
      ctx.strokeStyle = `rgba(255, 207, 92, ${pulse * 0.35})`;
      ctx.lineWidth = 1;
      ctx.strokeRect(40, 44, 1200, 632);
    }
    ctx.restore();
  }

  // -----------------------------------------------------------------
  // Ending
  // -----------------------------------------------------------------
  drawEndingScreen(ctx, game) {
    this.dim(ctx, 0.6);
    const grad = ctx.createLinearGradient(0, 0, 1280, 720);
    grad.addColorStop(0, 'rgba(88, 36, 58, 0.3)');
    grad.addColorStop(1, 'rgba(8, 10, 18, 0.78)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1280, 720);

    // Golden arc.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const glow = ctx.createRadialGradient(640, 300, 10, 640, 300, 330);
    glow.addColorStop(0, 'rgba(255, 190, 110, 0.18)');
    glow.addColorStop(1, 'rgba(255, 150, 100, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(200, 0, 880, 620);
    ctx.restore();

    ctx.textAlign = 'center';
    ctx.font = `900 10px ${BODY}`;
    ctx.fillStyle = C.pink;
    ctx.fillText('THE COSTA SOL STORY', 640, 152);
    ctx.font = `900 68px ${DISPLAY}`;
    ctx.fillStyle = '#ffe9be';
    ctx.shadowColor = 'rgba(255, 190, 100, 0.5)';
    ctx.shadowBlur = 28;
    ctx.fillText('THE CITY IS YOURS', 640, 240);
    ctx.shadowBlur = 0;
    ctx.font = `600 16px ${BODY}`;
    ctx.fillStyle = 'rgba(255, 243, 220, 0.86)';
    ctx.fillText('Silas Crowe is finished. Maya has the ledger. The sun is still warm.', 640, 284);
    ctx.font = `800 20px ${BODY}`;
    ctx.fillStyle = C.gold;
    const tapes = game.collectibles?.foundCount || 0;
    ctx.fillText(`JOBS ${game.missions.completedCount}/5   ·   CASH ${money(game.player.money)}   ·   TAPES ${tapes}/12`, 640, 336);
    ctx.font = `700 12px ${BODY}`;
    ctx.fillStyle = 'rgba(255, 243, 220, 0.6)';
    ctx.fillText(`Clean stunts landed: ${game.stuntsCount || 0}  ·  Best air: ${(game.bestStunt || 0).toFixed(2)}s`, 640, 368);
    ctx.fillText('Thank you for playing Leonida Heat.', 640, 394);
    ctx.textAlign = 'right';
    ctx.font = `700 9px ${BODY}`;
    ctx.fillStyle = 'rgba(255, 243, 220, 0.35)';
    ctx.fillText('An original city, cast, soundtrack and engine.', 1230, 694);
    ctx.restore();
    this.drawButton(ctx, game, 510, 436, 260, 48, 'RETURN TO TITLE', 'title', { index: 0 });
  }

  // -----------------------------------------------------------------
  // Button plumbing
  // -----------------------------------------------------------------
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
    const usable = this.buttons.filter((b) => !b.disabled);
    if (!usable.length) return;
    this.menuIndex = (this.menuIndex + delta + usable.length) % usable.length;
    void game;
  }
}

function alpha(hex, a) {
  const value = hex.replace('#', '');
  const full = value.length === 3 ? value.split('').map((c) => c + c).join('') : value;
  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

export function weaponLabel(id) {
  return WEAPON_CONFIG[id]?.name || id;
}

export const UI_FONT = BODY;
