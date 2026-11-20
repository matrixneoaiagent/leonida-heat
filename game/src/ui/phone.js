// Leonida Heat v5 - the in-game phone.
//
// TAB opens a canvas-drawn handset that pauses the simulation: home status, an
// activities list for the three side jobs and three street races, Maya's
// message thread, a district map with blips, and settings for radio, mute and
// camera zoom. Mouse and keyboard both drive the same button registry.

import { RADIO_STATIONS, WEATHER_CONFIG, districtAt, GAME_VERSION } from '../config.js';

const TAU = Math.PI * 2;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const BODY = '"Trebuchet MS", "Segoe UI", Arial, sans-serif';
const DISPLAY = '"Arial Black", "Segoe UI Black", Impact, sans-serif';
const MONO = '"Consolas", "Courier New", monospace';

const C = {
  ink: '#fff3dc',
  dim: 'rgba(255, 243, 220, 0.58)',
  faint: 'rgba(255, 243, 220, 0.3)',
  gold: '#ffcf5c',
  coral: '#ff7d6e',
  mint: '#7ee0b0',
  cyan: '#6fe0e6',
  pink: '#ff8fb1',
  panel: 'rgba(12, 16, 22, 0.96)',
  screen: '#0c1118',
  line: 'rgba(255, 220, 160, 0.2)',
  lineHot: 'rgba(255, 207, 92, 0.6)',
};

const TABS = [
  { id: 'home', label: 'HOME' },
  { id: 'activities', label: 'ACTIVITIES' },
  { id: 'maya', label: 'MAYA' },
  { id: 'map', label: 'MAP' },
  { id: 'settings', label: 'SETTINGS' },
];

function panelPath(ctx, x, y, w, h, r = 12) {
  const radius = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
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

function star(ctx, x, y, r) {
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

export class Phone {
  constructor(game) {
    this.game = game;
    this.isOpen = false;
    this.tab = 0;
    this.selected = 0;
    this.buttons = [];
    this.messagesRead = 0;
    this.notice = 0;
    this.zoomSetting = 2.0;
    this.time = 0;
  }

  get open() {
    return this.isOpen;
  }

  openPhone() {
    if (this.isOpen) return;
    this.isOpen = true;
    this.notice = 0;
    this.selected = 0;
    this.game.enterMode('phone');
    this.game.audio?.setTireScreech?.(0);
  }

  closePhone() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.game.enterMode('playing');
    const input = this.game.input;
    if (input) {
      input.keysPressed?.delete('Tab');
      input.mouse.clicked = false;
    }
  }

  toggle() {
    if (this.isOpen) this.closePhone();
    else this.openPhone();
  }

  // -----------------------------------------------------------------
  // Actions
  // -----------------------------------------------------------------
  actions(game) {
    const out = [];
    if (this.tab === 0) {
      out.push({ label: 'ACTIVITIES', action: 'tab:activities' });
      out.push({ label: 'MESSAGE MAYA', action: 'tab:maya' });
      out.push({ label: 'OPEN MAP', action: 'tab:map' });
    } else if (this.tab === 1) {
      for (const def of game.jobs?.defs || []) {
        const running = game.jobs?.active && game.jobs.id === def.id;
        const blocked = !!game.races?.active || (game.jobs?.active && !running);
        out.push({
          label: running ? 'ACTIVE' : 'START JOB',
          action: `job:${def.id}`,
          disabled: running || blocked,
          sub: def.name,
        });
      }
      for (const def of game.races?.defs || []) {
        const running = game.races?.active && game.races.id === def.id;
        const blocked = !!game.jobs?.active || (game.races?.active && !running);
        out.push({
          label: running ? 'RACING' : 'START RACE',
          action: `race:${def.id}`,
          disabled: running || blocked,
          sub: def.name,
        });
      }
    } else if (this.tab === 2) {
      out.push({ label: 'REPLY "ON IT"', action: 'tab:activities' });
      out.push({ label: 'MARK READ', action: 'read' });
    } else if (this.tab === 3) {
      out.push({ label: 'BACK TO HOME', action: 'tab:home' });
    } else if (this.tab === 4) {
      for (let i = 0; i < RADIO_STATIONS.length; i += 1) {
        out.push({ label: RADIO_STATIONS[i].name, action: `radio:${i}`, disabled: i === (game.audio?.stationIndex ?? 0) });
      }
      out.push({ label: game.audio?.muted ? 'UNMUTE SOUND' : 'MUTE SOUND', action: 'mute' });
      for (const z of [2.3, 2.0, 1.7]) {
        out.push({ label: `ZOOM ${z.toFixed(1)}x`, action: `zoom:${z}`, disabled: Math.abs(this.zoomSetting - z) < 0.01 });
      }
    }
    return out;
  }

  invoke(action, game) {
    if (!action) return;
    if (action.startsWith('tab:')) {
      const id = action.slice(4);
      const idx = TABS.findIndex((t) => t.id === id);
      if (idx >= 0) {
        this.tab = idx;
        this.selected = 0;
      }
      return;
    }
    if (action.startsWith('job:')) {
      const id = action.slice(4);
      this.closePhone();
      if (!game.jobs.start(id)) {
        game.ui.showToast('That shift could not start.', 'warning', 2);
      }
      return;
    }
    if (action.startsWith('race:')) {
      const id = action.slice(5);
      this.closePhone();
      if (!game.races.start(id)) {
        game.ui.showToast('That race could not start.', 'warning', 2);
      }
      return;
    }
    if (action.startsWith('radio:')) {
      const index = clamp(Number(action.slice(6)) || 0, 0, RADIO_STATIONS.length - 1);
      game.audio?.setStation?.(index);
      if (game.audio) game.audio.stationIndex = index;
      game.music?.setStation?.(index);
      game.ui.radioVisible = 2.4;
      this.notice = 2;
      return;
    }
    if (action === 'mute') {
      game.audio?.toggleMute?.();
      this.notice = 1.8;
      return;
    }
    if (action.startsWith('zoom:')) {
      this.zoomSetting = Number(action.slice(5)) || 2;
      game.camera.zoomBias = this.zoomSetting / 2.0;
      game.camera.zoom = this.zoomSetting;
      this.notice = 1.6;
      return;
    }
    if (action === 'read') {
      this.messagesRead = this.messageThread(game).length;
      this.notice = 1.4;
    }
  }

  // -----------------------------------------------------------------
  // Update
  // -----------------------------------------------------------------
  update(dt, game) {
    this.time += dt;
    this.notice = Math.max(0, this.notice - dt);
    const input = game.input;
    if (!input) return;

    if (input.wasPressed('Tab') || input.pause) {
      input.keysPressed.delete('Tab');
      input.keysPressed.delete('Escape');
      input.keysPressed.delete('KeyP');
      this.closePhone();
      return;
    }
    for (let i = 0; i < 5; i += 1) {
      if (input.wasPressed(`Digit${i + 1}`)) {
        this.tab = i;
        this.selected = 0;
        input.keysPressed.delete(`Digit${i + 1}`);
      }
    }
    if (input.wasPressed('ArrowRight') || input.wasPressed('KeyD')) {
      this.tab = (this.tab + 1) % TABS.length;
      this.selected = 0;
      input.keysPressed.delete('ArrowRight');
      input.keysPressed.delete('KeyD');
    }
    if (input.wasPressed('ArrowLeft') || input.wasPressed('KeyA')) {
      this.tab = (this.tab + TABS.length - 1) % TABS.length;
      this.selected = 0;
      input.keysPressed.delete('ArrowLeft');
      input.keysPressed.delete('KeyA');
    }

    const actions = this.actions(game);
    if (input.wasPressed('ArrowDown') || input.wasPressed('KeyS')) {
      if (actions.length) this.selected = (this.selected + 1) % actions.length;
      input.keysPressed.delete('ArrowDown');
      input.keysPressed.delete('KeyS');
    }
    if (input.wasPressed('ArrowUp') || input.wasPressed('KeyW')) {
      if (actions.length) this.selected = (this.selected + actions.length - 1) % actions.length;
      input.keysPressed.delete('ArrowUp');
      input.keysPressed.delete('KeyW');
    }

    if (input.mouse.clicked) {
      const hit = this.hitButton(input.mouse.x, input.mouse.y);
      if (hit) {
        input.mouse.clicked = false;
        this.invoke(hit.action, game);
        return;
      }
    }
    if (input.wasPressed('Enter') || input.wasPressed('Space')) {
      const action = actions[Math.min(this.selected, actions.length - 1)];
      input.keysPressed.delete('Enter');
      input.keysPressed.delete('Space');
      if (action && !action.disabled) this.invoke(action.action, game);
    }
  }

  hitButton(x, y) {
    for (const b of this.buttons) {
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b;
    }
    return null;
  }

  // -----------------------------------------------------------------
  // Messages
  // -----------------------------------------------------------------
  messageThread(game) {
    const missions = game.missions;
    const done = missions?.completedCount || 0;
    const activeJob = game.jobs?.active ? game.jobs.definition?.name : null;
    const activeRace = game.races?.active ? game.races.definition?.name : null;
    const out = [
      { text: 'New number, same trouble. The phone is yours now - TAB opens it.', from: 'maya' },
    ];
    if (done === 0) {
      out.push({ text: 'Start with the gold marker on Ocean. Sunset Valet, red Marlin. Do not scratch it.', from: 'maya' });
    } else {
      const beats = [
        'The valet car made it to Rustline. You have a future in parking.',
        'Rourke is still crying about the plaza. Good. The Vipera is ours.',
        'The dock case is in the wind. Half the city is looking for it, none of them found you.',
        'The diamonds are clean. Rustline did not ask questions, which is why we use them.',
        'Crowe is done. The table is ours. Take the night off, Leo. Or take a shift.',
      ];
      for (let i = 0; i < done; i += 1) out.push({ text: beats[i] || beats[beats.length - 1], from: 'maya' });
    }
    if (activeJob) out.push({ text: `${activeJob} is live on the board. Keep the clock in sight.`, from: 'maya' });
    if (activeRace) out.push({ text: `${activeRace} is rolling. Rivals do not lift, so neither do you.`, from: 'maya' });
    const police = game.police?.wantedStars || 0;
    if (police >= 3) out.push({ text: `${police} stars, Leo. Lose the tail before you call me back.`, from: 'maya' });
    else if (police > 0) out.push({ text: 'A patrol is sniffing around. Keep it quiet for a minute.', from: 'maya' });
    if ((game.jobs?.completed?.taxi || 0) + (game.jobs?.completed?.vigilante || 0) + (game.jobs?.completed?.paramedic || 0) > 0) {
      out.push({ text: 'Dispatch says the side work is paying. Keep the meter running.', from: 'maya' });
    }
    if ((game.races?.completed && Object.keys(game.races.completed).length) > 0) {
      out.push({ text: 'Heard you were racing on Grand. I hope the paint is still ours.', from: 'maya' });
    }
    out.push({ text: 'Radio is yours. Settings has the stations, the mute and the camera.', from: 'maya' });
    return out.slice(-8);
  }

  // -----------------------------------------------------------------
  // Draw
  // -----------------------------------------------------------------
  draw(ctx, game) {
    this.buttons = [];
    const x = 264;
    const y = 58;
    const w = 752;
    const h = 604;
    ctx.save();
    ctx.fillStyle = 'rgba(4, 7, 11, 0.72)';
    ctx.fillRect(0, 0, 1280, 720);

    // Handset shell.
    ctx.fillStyle = '#080b10';
    panelPath(ctx, x - 10, y - 10, w + 20, h + 20, 34);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 220, 160, 0.24)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.fillStyle = C.screen;
    panelPath(ctx, x, y, w, h, 26);
    ctx.fill();
    ctx.strokeStyle = 'rgba(111, 224, 230, 0.18)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Notch and status bar.
    ctx.fillStyle = '#05070a';
    panelPath(ctx, x + w / 2 - 48, y + 6, 96, 16, 8);
    ctx.fill();
    ctx.font = `800 10px ${MONO}`;
    ctx.fillStyle = C.dim;
    ctx.textAlign = 'left';
    ctx.fillText('LEONIDA', x + 22, y + 22);
    ctx.textAlign = 'right';
    ctx.fillStyle = C.ink;
    ctx.fillText(`${clockText(game.timeOfDay)}  ${WEATHER_CONFIG.labels[game.weather?.type || 'clear'] || 'CLEAR'}`, x + w - 64, y + 22);
    // Battery.
    ctx.strokeStyle = C.faint;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + w - 52, y + 14, 22, 10);
    ctx.fillStyle = C.mint;
    ctx.fillRect(x + w - 51, y + 15, 15, 8);
    ctx.fillRect(x + w - 29, y + 17, 2, 4);

    this.drawTabs(ctx, game, x, y + 34, w);

    if (this.tab === 0) this.drawHome(ctx, game, x, y + 86, w, h - 96);
    else if (this.tab === 1) this.drawActivities(ctx, game, x, y + 86, w, h - 96);
    else if (this.tab === 2) this.drawMessages(ctx, game, x, y + 86, w, h - 96);
    else if (this.tab === 3) this.drawMap(ctx, game, x, y + 86, w, h - 96);
    else this.drawSettings(ctx, game, x, y + 86, w, h - 96);

    if (this.notice > 0) {
      ctx.globalAlpha = clamp(this.notice, 0, 1);
      ctx.fillStyle = 'rgba(126, 224, 176, 0.14)';
      panelPath(ctx, x + w / 2 - 90, y + h - 42, 180, 24, 7);
      ctx.fill();
      ctx.font = `800 9px ${BODY}`;
      ctx.fillStyle = C.mint;
      ctx.textAlign = 'center';
      ctx.fillText('SETTING APPLIED', x + w / 2, y + h - 26);
      ctx.globalAlpha = 1;
    }

    ctx.font = `800 8px ${BODY}`;
    ctx.fillStyle = C.faint;
    ctx.textAlign = 'left';
    ctx.fillText(`TAB CLOSE  ·  ← → TABS  ·  ↑ ↓ SELECT  ·  ENTER START  ·  BUILD ${GAME_VERSION}`, x + 20, y + h - 10);
    ctx.restore();
  }

  drawTabs(ctx, game, x, y, w) {
    const tabW = (w - 32) / TABS.length;
    TABS.forEach((tab, i) => {
      const bx = x + 16 + i * tabW;
      const active = i === this.tab;
      ctx.fillStyle = active ? 'rgba(255, 207, 92, 0.14)' : 'transparent';
      panelPath(ctx, bx + 2, y, tabW - 4, 30, 7);
      ctx.fill();
      ctx.font = `900 9px ${BODY}`;
      ctx.fillStyle = active ? C.gold : C.faint;
      ctx.textAlign = 'center';
      ctx.fillText(tab.label, bx + tabW / 2, y + 19);
      if (i === 2) {
        const unread = Math.max(0, this.messageThread(game).length - this.messagesRead);
        if (unread > 0) {
          ctx.fillStyle = C.pink;
          ctx.beginPath();
          ctx.arc(bx + tabW - 24, y + 9, 4.5, 0, TAU);
          ctx.fill();
        }
      }
      ctx.strokeStyle = active ? C.lineHot : 'rgba(255, 220, 160, 0.08)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(bx + 8, y + 32);
      ctx.lineTo(bx + tabW - 8, y + 32);
      ctx.stroke();
    });
  }

  drawHome(ctx, game, x, y, w, h) {
    const p = game.player;
    const district = districtAt(p.x, p.y);
    ctx.textAlign = 'left';
    ctx.font = `900 10px ${BODY}`;
    ctx.fillStyle = C.pink;
    ctx.fillText('COSTA SOL  //  HOME', x + 28, y + 18);
    ctx.font = `900 64px ${DISPLAY}`;
    ctx.fillStyle = C.ink;
    ctx.fillText(clockText(game.timeOfDay), x + 24, y + 88);
    ctx.font = `700 12px ${BODY}`;
    ctx.fillStyle = C.dim;
    ctx.fillText(`${district.name} · ${WEATHER_CONFIG.labels[game.weather?.type || 'clear'] || 'CLEAR'} · Leo Calder`, x + 28, y + 110);

    const cards = [
      { label: 'WALLET', value: money(p.money), color: C.gold },
      { label: 'HEAT', value: `${game.police?.wantedStars || 0} / 5`, color: (game.police?.wantedStars || 0) > 0 ? C.coral : C.mint },
      { label: 'REP', value: Math.round(p.score || 0).toLocaleString('en-US'), color: C.mint },
      { label: 'JOBS DONE', value: `${game.missions?.completedCount || 0} / 5`, color: C.cyan },
    ];
    cards.forEach((card, i) => {
      const cx = x + 26 + (i % 2) * 318;
      const cy = y + 136 + Math.floor(i / 2) * 80;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.035)';
      panelPath(ctx, cx, cy, 296, 64, 10);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 220, 160, 0.12)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.font = `900 9px ${BODY}`;
      ctx.fillStyle = C.faint;
      ctx.fillText(card.label, cx + 16, cy + 20);
      ctx.font = `900 26px ${card.label === 'WALLET' ? DISPLAY : MONO}`;
      ctx.fillStyle = card.color;
      ctx.fillText(card.value, cx + 16, cy + 50);
    });

    // Wanted stars.
    for (let i = 0; i < 5; i += 1) {
      star(ctx, x + 46 + i * 22, y + 300, 8);
      ctx.fillStyle = i < (game.police?.wantedStars || 0) ? C.gold : 'rgba(255, 243, 220, 0.12)';
      ctx.fill();
    }

    // Latest message preview.
    const thread = this.messageThread(game);
    const last = thread[thread.length - 1];
    ctx.fillStyle = 'rgba(255, 143, 177, 0.08)';
    panelPath(ctx, x + 26, y + 326, 620, 72, 10);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 143, 177, 0.3)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = C.pink;
    ctx.beginPath();
    ctx.arc(x + 50, y + 352, 13, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#181420';
    ctx.font = `900 11px ${BODY}`;
    ctx.textAlign = 'center';
    ctx.fillText('M', x + 50, y + 356);
    ctx.textAlign = 'left';
    ctx.font = `900 9px ${BODY}`;
    ctx.fillStyle = C.pink;
    ctx.fillText('MAYA CRUZ', x + 72, y + 346);
    ctx.font = `700 11px ${BODY}`;
    ctx.fillStyle = C.ink;
    const lines = wrapLines(ctx, last?.text || '', 548).slice(0, 2);
    lines.forEach((line, i) => ctx.fillText(line, x + 72, y + 363 + i * 15));

    // Quick actions.
    const actions = this.actions(game);
    actions.forEach((action, i) => {
      this.drawButton(ctx, x + 26 + i * 212, y + 420, 198, 48, action.label, action, i);
    });
  }

  drawActivities(ctx, game, x, y, w, h) {
    ctx.textAlign = 'left';
    ctx.font = `900 10px ${BODY}`;
    ctx.fillStyle = C.cyan;
    ctx.fillText('SIDE WORK', x + 26, y + 18);
    ctx.fillStyle = C.faint;
    ctx.font = `700 11px ${BODY}`;
    ctx.fillText('Jobs and races run beside the story. Starting one keeps the other board locked.', x + 26, y + 36);

    const jobs = game.jobs?.defs || [];
    const races = game.races?.defs || [];
    const actions = this.actions(game);
    const colW = (w - 68) / 2;
    const rows = Math.max(jobs.length, races.length);
    for (let i = 0; i < rows; i += 1) {
      const cy = y + 46 + i * 150;
      const job = jobs[i];
      const race = races[i];
      if (job) {
        this.drawActivityRow(ctx, x + 26, cy, colW, job, game, actions[i], i, false);
      }
      if (race) {
        this.drawActivityRow(ctx, x + 42 + colW, cy, colW, race, game, actions[jobs.length + i], jobs.length + i, true);
      }
    }
    void h;
  }

  drawActivityRow(ctx, x, y, w, def, game, action, index, isRace) {
    const color = def.color || C.gold;
    const running = isRace
      ? game.races?.active && game.races.id === def.id
      : game.jobs?.active && game.jobs.id === def.id;
    const completed = isRace ? (game.races?.completed?.[def.id] || 0) : (game.jobs?.completed?.[def.id] || 0);
    const best = isRace ? game.races?.bestTimes?.[def.id] : null;
    ctx.fillStyle = running ? 'rgba(255, 207, 92, 0.11)' : 'rgba(255, 255, 255, 0.032)';
    panelPath(ctx, x, y, w, 140, 10);
    ctx.fill();
    ctx.strokeStyle = running ? color : 'rgba(255, 220, 160, 0.13)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.fillRect(x, y + 12, 4, 34);
    ctx.textAlign = 'left';
    ctx.font = `900 14px ${BODY}`;
    ctx.fillStyle = C.ink;
    ctx.fillText(def.name, x + 16, y + 27);
    ctx.font = `800 8px ${BODY}`;
    ctx.fillStyle = color;
    ctx.fillText(isRace ? `STREET RACE · ${def.laps > 1 ? `${def.laps} LAPS` : 'SPRINT'}` : `SIDE JOB · ${Math.round(def.duration)}s`, x + 16, y + 42);
    ctx.font = `700 10.5px ${BODY}`;
    ctx.fillStyle = C.dim;
    const lines = wrapLines(ctx, def.description, w - 34).slice(0, 2);
    lines.forEach((line, i) => ctx.fillText(line, x + 16, y + 60 + i * 14));
    ctx.font = `800 8px ${BODY}`;
    ctx.fillStyle = C.faint;
    const stat = completed > 0 ? `DONE ${completed}${best ? ` · BEST ${best.toFixed(2)}s` : ''}` : 'NOT COMPLETED';
    ctx.fillText(stat, x + 16, y + 88);
    if (action) this.drawButton(ctx, x + 14, y + 98, w - 28, 30, action.label, action, index);
  }

  drawMessages(ctx, game, x, y, w, h) {
    ctx.textAlign = 'left';
    ctx.font = `900 10px ${BODY}`;
    ctx.fillStyle = C.pink;
    ctx.fillText('MAYA CRUZ', x + 26, y + 18);
    ctx.font = `700 10px ${BODY}`;
    ctx.fillStyle = C.faint;
    ctx.fillText('Encrypted thread · she checks in when the city moves', x + 26, y + 34);

    const thread = this.messageThread(game);
    let cy = y + 48;
    const lineH = 46;
    for (const msg of thread.slice(-8)) {
      const isMaya = msg.from === 'maya';
      const bx = isMaya ? x + 26 : x + w - 360;
      const bw = 330;
      ctx.fillStyle = isMaya ? 'rgba(255, 143, 177, 0.11)' : 'rgba(111, 224, 230, 0.09)';
      panelPath(ctx, bx, cy, bw, lineH, 9);
      ctx.fill();
      ctx.strokeStyle = isMaya ? 'rgba(255, 143, 177, 0.28)' : 'rgba(111, 224, 230, 0.24)';
      ctx.lineWidth = 1;
      ctx.stroke();
      if (isMaya) {
        ctx.fillStyle = C.pink;
        ctx.beginPath();
        ctx.arc(bx + 16, cy + 15, 8, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#181420';
        ctx.font = `900 8px ${BODY}`;
        ctx.textAlign = 'center';
        ctx.fillText('M', bx + 16, cy + 18);
        ctx.textAlign = 'left';
      }
      ctx.font = `700 10.5px ${BODY}`;
      ctx.fillStyle = C.ink;
      const lines = wrapLines(ctx, msg.text, bw - 44).slice(0, 2);
      lines.forEach((line, i) => ctx.fillText(line, bx + 30, cy + 19 + i * 14));
      cy += lineH + 8;
    }
    const actions = this.actions(game);
    actions.forEach((action, i) => {
      this.drawButton(ctx, x + 26 + i * 230, y + h - 148, 214, 34, action.label, action, i);
    });
    this.messagesRead = Math.max(this.messagesRead, thread.length);
  }

  drawMap(ctx, game, x, y, w, h) {
    ctx.textAlign = 'left';
    ctx.font = `900 10px ${BODY}`;
    ctx.fillStyle = C.mint;
    ctx.fillText('COSTA SOL  //  DISTRICT MAP', x + 26, y + 18);
    const district = districtAt(game.player.x, game.player.y);
    ctx.font = `700 11px ${BODY}`;
    ctx.fillStyle = C.dim;
    ctx.fillText(`${district.name} · ${district.sub}`, x + 26, y + 36);

    const map = game.ui?.ensureMap?.(game);
    const size = 344;
    const mx = x + 24;
    const my = y + 52;
    ctx.fillStyle = '#0a1117';
    panelPath(ctx, mx, my, size, size, 10);
    ctx.fill();
    ctx.strokeStyle = 'rgba(111, 224, 230, 0.28)';
    ctx.lineWidth = 1;
    ctx.stroke();
    if (map) {
      ctx.save();
      panelPath(ctx, mx + 3, my + 3, size - 6, size - 6, 8);
      ctx.clip();
      ctx.drawImage(map, 0, 0, 512, 512, mx + 3, my + 3, size - 6, size - 6);
      const scale = (size - 6) / 3200;
      const px = mx + 3 + game.player.x * scale;
      const py = my + 3 + game.player.y * scale;
      ctx.fillStyle = C.ink;
      ctx.beginPath();
      ctx.arc(px, py, 4.5, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(10, 12, 18, 0.9)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      const blips = [];
      for (const marker of game.jobs?.markers?.() || []) blips.push({ ...marker, color: marker.color });
      for (const marker of game.races?.markers?.() || []) blips.push({ ...marker, color: marker.color });
      const target = game.jobs?.active ? game.jobs.currentTarget() : game.races?.active ? game.races.currentTarget() : null;
      if (target) blips.push({ ...target, color: C.gold });
      for (const cop of game.police?.cops || []) blips.push({ x: cop.x, y: cop.y, color: '#ff5d6c' });
      for (const blip of blips) {
        const bx = mx + 3 + blip.x * scale;
        const by = my + 3 + blip.y * scale;
        ctx.fillStyle = blip.color || C.gold;
        ctx.beginPath();
        ctx.arc(bx, by, 3.2, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = 'rgba(8, 12, 18, 0.7)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.restore();
    }

    // District legend at the right.
    const lx = mx + size + 28;
    ctx.font = `900 9px ${BODY}`;
    ctx.fillStyle = C.faint;
    ctx.fillText('DISTRICTS', lx, my + 16);
    const districts = game.districtList || [];
    districts.forEach((d, i) => {
      const ry = my + 34 + i * 34;
      ctx.fillStyle = d.neon;
      ctx.fillRect(lx, ry - 7, 3, 14);
      ctx.font = `900 11px ${BODY}`;
      ctx.fillStyle = d.id === district.id ? C.ink : C.dim;
      ctx.fillText(d.name, lx + 12, ry);
      ctx.font = `700 9px ${BODY}`;
      ctx.fillStyle = C.faint;
      ctx.fillText(d.sub, lx + 12, ry + 13);
    });
    ctx.font = `800 9px ${BODY}`;
    ctx.fillStyle = C.faint;
    ctx.fillText('GOLD  ACTIVE TARGET   ·   CORAL  PATROL', lx, my + 270);
    ctx.fillStyle = C.gold;
    ctx.beginPath();
    ctx.arc(lx + 2, my + 292, 4, 0, TAU);
    ctx.fill();
    ctx.fillStyle = C.coral;
    ctx.beginPath();
    ctx.arc(lx + 152, my + 292, 4, 0, TAU);
    ctx.fill();
    void h;
  }

  drawSettings(ctx, game, x, y, w, h) {
    ctx.textAlign = 'left';
    ctx.font = `900 10px ${BODY}`;
    ctx.fillStyle = C.gold;
    ctx.fillText('SETTINGS', x + 26, y + 18);
    ctx.font = `700 11px ${BODY}`;
    ctx.fillStyle = C.dim;
    ctx.fillText('Radio, sound and camera. Changes apply immediately and save with the game.', x + 26, y + 36);

    const actions = this.actions(game);
    let index = 0;
    const current = game.audio?.stationIndex ?? 0;
    ctx.font = `900 9px ${BODY}`;
    ctx.fillStyle = C.faint;
    ctx.fillText('RADIO STATION', x + 26, y + 66);
    for (let i = 0; i < RADIO_STATIONS.length; i += 1) {
      const station = RADIO_STATIONS[i];
      const action = actions[index++];
      const bx = x + 26;
      const by = y + 76 + i * 44;
      ctx.fillStyle = i === current ? 'rgba(255, 207, 92, 0.12)' : 'rgba(255, 255, 255, 0.03)';
      panelPath(ctx, bx, by, 330, 36, 7);
      ctx.fill();
      ctx.strokeStyle = i === current ? station.color : 'rgba(255, 220, 160, 0.1)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = station.color;
      ctx.beginPath();
      ctx.arc(bx + 20, by + 18, 9, 0, TAU);
      ctx.fill();
      ctx.font = `800 10px ${BODY}`;
      ctx.fillStyle = C.ink;
      ctx.fillText(station.name, bx + 38, by + 16);
      ctx.font = `700 8px ${BODY}`;
      ctx.fillStyle = C.faint;
      ctx.fillText(station.genre, bx + 38, by + 28);
      if (action) this.drawButton(ctx, bx + 236, by + 5, 88, 26, i === current ? 'ON AIR' : 'TUNE', action, index - 1);
    }

    const muteAction = actions[index++];
    const muteY = y + 262;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
    panelPath(ctx, x + 26, muteY, 330, 46, 8);
    ctx.fill();
    ctx.font = `900 11px ${BODY}`;
    ctx.fillStyle = C.ink;
    ctx.fillText('SOUND', x + 42, muteY + 19);
    ctx.font = `700 9px ${BODY}`;
    ctx.fillStyle = C.faint;
    ctx.fillText(game.audio?.muted ? 'Muted - horns, engines and radio are off' : 'Engines, sirens, radio and weather are live', x + 42, muteY + 34);
    if (muteAction) this.drawButton(ctx, x + 26 + 232, muteY + 7, 92, 30, game.audio?.muted ? 'UNMUTE' : 'MUTE', muteAction, index - 1);

    ctx.font = `900 9px ${BODY}`;
    ctx.fillStyle = C.faint;
    ctx.fillText('CAMERA ZOOM', x + 400, y + 66);
    const zoomActions = actions.slice(index);
    zoomActions.forEach((action, i) => {
      const by = y + 78 + i * 48;
      const value = action.action.slice(5);
      const active = Math.abs(this.zoomSetting - Number(value)) < 0.01;
      ctx.fillStyle = active ? 'rgba(111, 224, 230, 0.12)' : 'rgba(255, 255, 255, 0.03)';
      panelPath(ctx, x + 400, by, 296, 38, 7);
      ctx.fill();
      ctx.strokeStyle = active ? C.cyan : 'rgba(255, 220, 160, 0.1)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.font = `800 11px ${BODY}`;
      ctx.fillStyle = active ? C.cyan : C.dim;
      ctx.fillText(action.label, x + 416, by + 23);
      if (active) {
        ctx.textAlign = 'right';
        ctx.font = `900 8px ${BODY}`;
        ctx.fillStyle = C.cyan;
        ctx.fillText('ACTIVE', x + 680, by + 23);
        ctx.textAlign = 'left';
      }
      const fake = { x: x + 400, y: by, w: 296, h: 38, action: action.action, disabled: false };
      this.buttons.push(fake);
    });

    ctx.font = `800 9px ${BODY}`;
    ctx.fillStyle = C.faint;
    ctx.fillText('ZOOM IS A CAMERA BIAS. THE CAR STILL LEADS THE FRAME AT SPEED.', x + 400, y + 242);

    // Small note card.
    ctx.fillStyle = 'rgba(255, 207, 92, 0.07)';
    panelPath(ctx, x + 400, y + 262, 296, 92, 9);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 207, 92, 0.22)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.font = `900 9px ${BODY}`;
    ctx.fillStyle = C.gold;
    ctx.fillText('SAVED WITH THE CITY', x + 416, y + 282);
    ctx.font = `700 10px ${BODY}`;
    ctx.fillStyle = C.dim;
    wrapLines(ctx, 'Station, mute, zoom, side jobs and race progress all survive a save and load.', 264)
      .slice(0, 3)
      .forEach((line, i) => ctx.fillText(line, x + 416, y + 300 + i * 14));
    void h;
  }

  drawButton(ctx, x, y, w, h, label, action, index) {
    const mouse = this.game?.input?.mouse || { x: -1, y: -1 };
    const hover = mouse.x >= x && mouse.x <= x + w && mouse.y >= y && mouse.y <= y + h;
    const selected = this.selected === index;
    const disabled = !!action?.disabled;
    this.buttons.push({ x, y, w, h, action: action?.action, disabled });
    const active = (hover || selected) && !disabled;
    ctx.save();
    ctx.fillStyle = disabled ? 'rgba(20, 24, 30, 0.6)' : active ? C.gold : 'rgba(16, 20, 27, 0.92)';
    panelPath(ctx, x, y, w, h, 6);
    ctx.fill();
    ctx.strokeStyle = disabled ? 'rgba(255, 243, 220, 0.1)' : active ? 'rgba(255, 226, 160, 0.9)' : C.line;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.textAlign = 'left';
    ctx.font = `900 ${h < 40 ? 10 : 12}px ${BODY}`;
    ctx.fillStyle = disabled ? 'rgba(255, 243, 220, 0.26)' : active ? '#171310' : C.ink;
    ctx.fillText(label, x + 12, y + h / 2 + 4);
    if (action?.sub) {
      ctx.font = `700 8px ${BODY}`;
      ctx.fillStyle = active ? 'rgba(23, 19, 16, 0.6)' : C.faint;
      ctx.textAlign = 'right';
      ctx.fillText(action.sub, x + w - 10, y + h / 2 + 4);
      ctx.textAlign = 'left';
    }
    ctx.restore();
  }

  serialize() {
    return {
      tab: this.tab,
      messagesRead: this.messagesRead,
      zoom: this.zoomSetting,
    };
  }

  restore(data = {}) {
    this.tab = clamp(Number(data.tab) || 0, 0, TABS.length - 1);
    this.messagesRead = Math.max(0, Number(data.messagesRead) || 0);
    const zoom = Number(data.zoom);
    if (Number.isFinite(zoom) && zoom > 0.8 && zoom < 3.2) this.zoomSetting = zoom;
    this.isOpen = false;
    this.selected = 0;
    this.buttons = [];
    if (this.game?.camera) this.game.camera.zoomBias = this.zoomSetting / 2.0;
  }

  reset() {
    this.isOpen = false;
    this.tab = 0;
    this.selected = 0;
    this.buttons = [];
    this.messagesRead = 0;
    this.notice = 0;
    this.zoomSetting = 2.0;
  }
}

export { TABS };
