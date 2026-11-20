// Leonida Heat v5 - street races.
//
// Three checkpoint races with a lit start gate, a 3-2-1 countdown, ordered
// checkpoints, sprint or two-lap formats, two rival cars with light
// rubber-banding, place-based prize money and a results card. The module owns
// its vehicles, timers and save block; the director calls update(), status(),
// currentTarget(), drawWorld(), drawOverlay() and serialize()/restore().

import { Vehicle } from '../entities.js';

const TAU = Math.PI * 2;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

const M = (x, y) => ({ x, y });

export const STREET_RACES = [
  {
    id: 'grand_sprint',
    name: 'Grand Avenue Sprint',
    short: 'GRAND SPRINT',
    color: '#ffcf5c',
    start: { x: 1460, y: 1400, angle: 0, radius: 58 },
    laps: 1,
    timeLimit: 185,
    prizes: [2200, 1400, 700],
    description: 'A single flat-out sprint from Grand Avenue to Palmetto and back through Vantage.',
    route: [
      M(1900, 1400), M(2400, 1400), M(2400, 1050), M(2400, 700), M(2000, 700),
      M(1600, 700), M(1200, 700), M(1200, 1050), M(1200, 1400), M(1460, 1400),
    ],
  },
  {
    id: 'ocean_loop',
    name: 'Ocean Loop',
    short: 'OCEAN LOOP',
    color: '#6fe0e6',
    start: { x: 2400, y: 2100, angle: -Math.PI / 2, radius: 58 },
    laps: 2,
    timeLimit: 265,
    prizes: [2800, 1700, 900],
    description: 'Two laps around the beachside block. Brake late, draft the rivals, mind the crosswalks.',
    route: [
      M(2400, 1800), M(2400, 1400), M(2400, 1050), M(2400, 700), M(2000, 700),
      M(1600, 700), M(1200, 700), M(1200, 1050), M(1200, 1400), M(1200, 1800),
      M(1200, 2200), M(1600, 2200), M(2000, 2200), M(2400, 2200), M(2400, 2100),
    ],
  },
  {
    id: 'drydock_circuit',
    name: 'Drydock Circuit',
    short: 'DRYDOCK',
    color: '#ff8fb1',
    start: { x: 620, y: 2600, angle: 0, radius: 58 },
    laps: 1,
    timeLimit: 205,
    prizes: [3200, 1900, 1000],
    description: 'Terminal Way and Drydock Parkway form a tight industrial rectangle. No room for mistakes.',
    route: [
      M(1000, 2600), M(1600, 2600), M(2000, 2600), M(2000, 2200), M(1600, 2200),
      M(1200, 2200), M(800, 2200), M(400, 2200), M(400, 2600), M(620, 2600),
    ],
  },
];

function formatTime(seconds) {
  const s = Math.max(0, Number(seconds) || 0);
  const m = Math.floor(s / 60);
  const rest = s - m * 60;
  return `${m}:${rest.toFixed(2).padStart(5, '0')}`;
}

export class RaceManager {
  constructor(city, game) {
    this.city = city;
    this.game = game;
    this.defs = STREET_RACES;
    this.active = false;
    this.id = null;
    this.phase = 'idle';
    this.locked = false;
    this.countdown = 0;
    this.countdownText = '';
    this.raceTime = 0;
    this.lap = 1;
    this.next = 0;
    this.rivals = [];
    this.route = [];
    this.result = null;
    this.results = [];
    this.playerPlace = 0;
    this.completed = {};
    this.bestTimes = {};
    this.startCar = null;
    this._beeped = 0;
  }

  get definition() {
    return this.defs.find((d) => d.id === this.id) || null;
  }

  get resultOpen() {
    return !!this.result && this.result.timer > 0;
  }

  status() {
    if (!this.active) return { active: false, id: null };
    const def = this.definition;
    const total = this.route.length || 1;
    return {
      active: true,
      id: this.id,
      name: def?.name || 'Street Race',
      short: def?.short || 'RACE',
      color: def?.color || '#6fe0e6',
      phase: this.phase,
      countdown: this.countdownText,
      locked: this.locked,
      timer: def ? Math.max(0, def.timeLimit - this.raceTime) : 0,
      elapsed: this.raceTime,
      lap: this.lap,
      laps: def?.laps || 1,
      checkpoint: this.next + 1,
      checkpoints: total,
      place: this.playerPlace,
      rivals: this.rivals.map((r) => ({ finished: r.finished, time: r.time })),
    };
  }

  currentTarget() {
    if (!this.active) return null;
    if (this.phase === 'countdown') {
      return { x: this.definition.start.x, y: this.definition.start.y, radius: 60, label: 'Start line', color: this.definition.color };
    }
    const point = this.route[this.next];
    if (!point) return null;
    return { x: point.x, y: point.y, radius: 62, label: 'Checkpoint', color: this.definition?.color || '#6fe0e6' };
  }

  markers() {
    return this.defs.map((def) => ({
      ...def.start, id: def.id, name: def.name, color: def.color, kind: 'race',
    }));
  }

  // -----------------------------------------------------------------
  // Start / finish
  // -----------------------------------------------------------------
  start(id, restored = null) {
    if (this.active) return false;
    if (this.game?.jobs?.active) {
      this.game.ui.showToast('Finish the side job first.', 'warning', 2.2);
      return false;
    }
    const def = this.defs.find((d) => d.id === id);
    if (!def) return false;
    this.cleanup();
    this.active = true;
    this.id = id;
    this.route = def.route.map((p) => ({ ...p }));
    this.phase = 'countdown';
    this.locked = true;
    this.countdown = 3.4;
    this.countdownText = '3';
    this.raceTime = 0;
    this.lap = 1;
    this.next = 0;
    this.playerPlace = 0;
    this.result = null;
    this.results = [];
    this._beeped = 0;

    if (restored) {
      this.active = false;
      this.restore({ active: restored, completed: this.completed, bestTimes: this.bestTimes });
    } else {
      this.placePlayerAtGate(def);
      this.spawnRivals(def);
      this.game.ui.showToast(`${def.name}: 3, 2, 1...`, 'warning', 2.8);
      this.game.audio?.playPickup?.();
    }
    this.game.autosave?.();
    return true;
  }

  placePlayerAtGate(def) {
    const p = this.game.player;
    let car = p.vehicle;
    if (!car || car.isDestroyed) {
      car = new Vehicle('marlin', def.start.x, def.start.y, def.start.angle, '#f4f1e8');
      car.aiMode = 'player';
      car.driver = p;
      car.isPlayerVehicle = true;
      car.occupiedByCivilian = false;
      car.isMission = true;
      car.headlightsOn = true;
      this.game.traffic.vehicles.push(car);
      p.vehicle = car;
      this.game.audio?.startEngine?.(car.config.engineNote);
    }
    car.x = def.start.x;
    car.y = def.start.y;
    car.angle = def.start.angle;
    car.vx = 0;
    car.vy = 0;
    car.hp = Math.max(car.hp, car.maxHp * 0.72);
    p.x = car.x;
    p.y = car.y;
    p.angle = car.angle;
    p.vx = 0;
    p.vy = 0;
    this.startCar = car;
    this.game.camera.x = car.x;
    this.game.camera.y = car.y;
  }

  spawnRivals(def) {
    const rivals = [
      { color: '#ff4d6d', offset: -74, side: -46, skill: 1.0 },
      { color: '#2f6bff', offset: -134, side: 46, skill: 0.96 },
    ];
    for (const spec of rivals) {
      const nx = Math.cos(def.start.angle);
      const ny = Math.sin(def.start.angle);
      const rx = -ny;
      const ry = nx;
      const x = def.start.x + nx * spec.offset + rx * spec.side;
      const y = def.start.y + ny * spec.offset + ry * spec.side;
      const car = new Vehicle('vipera', x, y, def.start.angle, spec.color);
      car.isMission = true;
      car.aiMode = 'race';
      car.driver = { isRival: true };
      car.occupiedByCivilian = false;
      car.headlightsOn = true;
      car.hp = 900;
      car.maxHp = 900;
      car.cruiseSpeed = 320;
      this.game.traffic.vehicles.push(car);
      this.rivals.push({
        car,
        next: 0,
        lap: 1,
        skill: spec.skill,
        finished: false,
        time: 0,
        stuck: 0,
        lastX: x,
        lastY: y,
      });
    }
  }

  update(dt, player) {
    if (this.result) {
      this.result.timer -= dt;
      if (this.result.timer <= 0) this.result = null;
      else if (this.result.timer < this.result.max - 0.35) {
        const input = this.game.input;
        if (input?.confirm || input?.mouse?.clicked) {
          this.result = null;
          input.keysPressed?.delete('Enter');
          input.keysPressed?.delete('Space');
          if (input.mouse) input.mouse.clicked = false;
        }
      }
    }
    if (!this.active) return;
    const def = this.definition;

    if (this.phase === 'countdown') {
      this.countdown -= dt;
      const n = Math.ceil(this.countdown);
      this.countdownText = this.countdown > 0 ? String(Math.max(1, Math.min(3, n))) : 'GO!';
      const beep = Math.max(0, 3 - Math.floor(this.countdown));
      if (beep !== this._beeped && this.countdown > 0) {
        this._beeped = beep;
        this.game.audio?.playPickup?.();
      }
      if (this.countdown <= 0) {
        this.phase = 'running';
        this.locked = false;
        this.countdownText = '';
        this.game.audio?.playMissionPass?.();
        this.game.ui.showToast('GO!', 'success', 1.2);
      }
      return;
    }

    if (this.phase !== 'running') return;
    this.raceTime += dt;
    if (this.raceTime >= def.timeLimit) {
      this.fail('The race clock ran out.');
      return;
    }

    this.updatePlayerProgress(player);
    this.updateRivals(dt, player);
  }

  updatePlayerProgress(player) {
    const point = this.route[this.next];
    if (!point) return;
    if (Math.hypot(player.x - point.x, player.y - point.y) > 64) return;
    this.next += 1;
    this.game.audio?.playPickup?.();
    if (this.next >= this.route.length) {
      if (this.lap < this.definition.laps) {
        this.lap += 1;
        this.next = 0;
        this.game.ui.showToast(`Lap ${this.lap} of ${this.definition.laps}.`, 'success', 2);
      } else {
        this.finishPlayer();
      }
    } else {
      this.game.player.score += 12;
    }
  }

  updateRivals(dt, player) {
    const def = this.definition;
    const playerScore = (this.lap - 1) * this.route.length + this.next;
    for (const r of this.rivals) {
      if (r.finished) {
        r.car.brake(0.4, dt);
        r.car.update(dt, this.city, this.game.particles, this.game.audio, { wetness: this.game.wetness || 0 });
        continue;
      }
      const target = this.route[r.next] || this.route[0];
      if (!target) continue;
      const rivalScore = (r.lap - 1) * this.route.length + r.next;
      const behind = playerScore - rivalScore;
      const rubber = behind > 1 ? 1.14 : behind < -1 ? 0.90 : 1;
      const distance = Math.hypot(target.x - r.car.x, target.y - r.car.y);
      const desired = Math.atan2(target.y - r.car.y, target.x - r.car.x);
      let diff = desired - r.car.angle;
      while (diff > Math.PI) diff -= TAU;
      while (diff < -Math.PI) diff += TAU;
      r.car.angle += clamp(diff, -2.9 * dt, 2.9 * dt);
      const speed = clamp(326 * r.skill * rubber, 240, 470);
      r.car.vx = Math.cos(r.car.angle) * speed;
      r.car.vy = Math.sin(r.car.angle) * speed;
      r.car.update(dt, this.city, this.game.particles, this.game.audio, { wetness: this.game.wetness || 0 });

      if (Math.hypot(r.car.x - r.lastX, r.car.y - r.lastY) < 8) r.stuck += dt;
      else r.stuck = 0;
      r.lastX = r.car.x;
      r.lastY = r.car.y;
      if (r.stuck > 2.4 || distance < 70) {
        if (distance < 70) {
          r.next += 1;
          if (r.next >= this.route.length) {
            if (r.lap < def.laps) {
              r.lap += 1;
              r.next = 0;
            } else {
              r.finished = true;
              r.time = this.raceTime;
              this.game.ui.showToast('A rival crossed the line.', 'warning', 2);
            }
          }
        } else {
          const point = this.route[r.next] || this.route[0];
          r.car.x = point.x;
          r.car.y = point.y;
        }
        r.stuck = 0;
      }
    }
  }

  finishPlayer() {
    if (!this.active) return;
    const def = this.definition;
    const ahead = this.rivals.filter((r) => r.finished).length;
    const place = ahead + 1;
    const prize = def.prizes[Math.min(def.prizes.length - 1, place - 1)] || 0;
    this.playerPlace = place;
    this.active = false;
    this.phase = 'finished';
    this.locked = false;
    this.game.player.money += prize;
    this.game.player.score += 300 + (4 - place) * 120;
    this.game.stats.jobs = (this.game.stats.jobs || 0) + 1;
    this.completed[this.id] = (this.completed[this.id] || 0) + 1;
    if (!this.bestTimes[this.id] || this.raceTime < this.bestTimes[this.id]) this.bestTimes[this.id] = this.raceTime;
    this.result = {
      kind: 'success',
      title: def.name,
      verdict: place === 1 ? 'RACE WON' : `${place}${place === 2 ? 'ND' : 'RD'} PLACE`,
      color: place === 1 ? '#ffcf5c' : '#6fe0e6',
      cash: prize,
      lines: [`Time ${formatTime(this.raceTime)}`, place === 1 ? 'Clean lights, clean win.' : 'The rivals will remember this.'],
      timer: 9,
      max: 9,
    };
    this.game.ui.showToast(`${def.name}: ${place === 1 ? 'win' : `${place}${place === 2 ? 'nd' : 'rd'} place`} · +$${prize.toLocaleString('en-US')}`, place === 1 ? 'success' : 'neutral', 4);
    this.game.audio?.playMissionPass?.();
    this.clearCars();
    this.game.autosave?.();
  }

  fail(reason) {
    if (!this.active) return;
    const def = this.definition;
    this.active = false;
    this.phase = 'failed';
    this.locked = false;
    this.result = {
      kind: 'fail',
      title: def?.name || 'Street Race',
      verdict: 'DID NOT FINISH',
      color: '#ff7d86',
      cash: 0,
      lines: [reason || 'The clock ran out.', `Checkpoint ${this.next + 1} of ${this.route.length}`],
      timer: 8,
      max: 8,
    };
    this.game.ui.showToast(`${def?.name || 'Race'} ended: ${reason || 'time up'}`, 'danger', 3.4);
    this.game.audio?.playMissionFail?.();
    this.clearCars();
    this.game.autosave?.();
  }

  abort(reason) {
    if (!this.active) return;
    this.active = false;
    this.locked = false;
    this.phase = 'failed';
    this.clearCars();
    this.result = {
      kind: 'fail',
      title: this.definition?.name || 'Street Race',
      verdict: 'RACE OVER',
      color: '#ff7d86',
      cash: 0,
      lines: [reason || 'You went down.'],
      timer: 5,
      max: 5,
    };
  }

  clearCars() {
    for (const r of this.rivals) {
      if (!r.car) continue;
      r.car.isMission = false;
      if (r.car !== this.game.player?.vehicle) {
        r.car.aiMode = 'parked';
        r.car.driver = null;
      }
    }
    this.rivals = [];
    if (this.startCar && this.startCar !== this.game.player?.vehicle) this.startCar.isMission = false;
  }

  cleanup() {
    this.clearCars();
    this.startCar = null;
  }

  // -----------------------------------------------------------------
  // Presentation
  // -----------------------------------------------------------------
  drawWorld(ctx, game) {
    const time = game.worldTime || 0;
    if (!this.active) {
      // Faint start-gate ring near the player keeps the gates discoverable.
      if (this.game?.jobs?.active) return;
      for (const def of this.defs) {
        const d = Math.hypot(game.player.x - def.start.x, game.player.y - def.start.y);
        if (d > 460) continue;
        this.drawGate(ctx, def, 0.24);
      }
      return;
    }
    const def = this.definition;
    if (this.phase === 'countdown') this.drawGate(ctx, def, 0.9);

    // Ordered checkpoints: the next one is hot, the rest stay faint.
    for (let i = this.next; i < this.route.length; i += 1) {
      const point = this.route[i];
      const activePoint = i === this.next;
      const pulse = 0.5 + 0.5 * Math.sin(time * 3.4 + i);
      ctx.save();
      ctx.translate(point.x, point.y);
      ctx.strokeStyle = def.color;
      ctx.globalAlpha = activePoint ? 0.62 + pulse * 0.3 : 0.12;
      ctx.lineWidth = activePoint ? 3.2 : 1.4;
      ctx.beginPath();
      ctx.arc(0, 0, activePoint ? 58 : 34, 0, TAU);
      ctx.stroke();
      if (activePoint) {
        ctx.globalAlpha = 0.24;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(0, 0, 66 + pulse * 5, 0, TAU);
        ctx.stroke();
      }
      ctx.restore();
    }

    for (const r of this.rivals) {
      if (!r.car || r.car.isDestroyed) continue;
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = r.car.color;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(r.car.x, r.car.y, 30, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }
  }

  drawGate(ctx, def, alpha) {
    const checks = 8;
    ctx.save();
    ctx.translate(def.start.x, def.start.y);
    ctx.rotate(def.start.angle);
    ctx.globalAlpha = alpha;
    // Two posts and a checker banner across the road.
    ctx.fillStyle = '#e7e1d4';
    ctx.fillRect(-26, -44, 5, 88);
    ctx.fillRect(30, -44, 5, 88);
    const cell = 10;
    for (let row = 0; row < 2; row += 1) {
      for (let i = 0; i < checks; i += 1) {
        ctx.fillStyle = (i + row) % 2 === 0 ? '#f6f2e8' : '#1b1a20';
        ctx.fillRect(24 + i * cell - 72, -38 + row * 8, cell, 8);
      }
    }
    ctx.strokeStyle = def.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-26, -44);
    ctx.lineTo(-26, 44);
    ctx.moveTo(30, -44);
    ctx.lineTo(30, 44);
    ctx.stroke();
    ctx.restore();
  }

  drawOverlay(ctx, game) {
    // Countdown and results live above the world but under the phone.
    if (this.active && this.locked) {
      const text = this.countdownText || '3';
      const isGo = text === 'GO!';
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = '900 116px "Arial Black", Arial, sans-serif';
      ctx.fillStyle = isGo ? '#7ee0b0' : '#ffcf5c';
      ctx.shadowColor = isGo ? 'rgba(126,224,176,0.7)' : 'rgba(255,207,92,0.7)';
      ctx.shadowBlur = 26;
      ctx.fillText(text, 640, 330);
      ctx.shadowBlur = 0;
      ctx.font = '900 13px "Trebuchet MS", Arial, sans-serif';
      ctx.fillStyle = 'rgba(255,243,220,0.8)';
      ctx.fillText(`${this.definition.name.toUpperCase()}  ·  ${this.definition.laps > 1 ? `${this.definition.laps} LAPS` : 'SPRINT'}`, 640, 370);
      ctx.restore();
      return;
    }
    if (this.result) {
      const r = this.result;
      const fade = clamp((r.max - r.timer) / 0.35, 0, 1) * clamp(r.timer / 0.6, 0, 1);
      const x = 430;
      const y = 248;
      const w = 420;
      const h = 164;
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.fillStyle = 'rgba(9, 12, 18, 0.94)';
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x, y, w, h, 12);
      else ctx.rect(x, y, w, h);
      ctx.fill();
      ctx.strokeStyle = r.color;
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.fillStyle = r.color;
      ctx.fillRect(x, y, 5, h);
      ctx.textAlign = 'left';
      ctx.font = '900 9px "Trebuchet MS", Arial, sans-serif';
      ctx.fillStyle = r.color;
      ctx.fillText(r.kind === 'success' ? 'STREET RACE · PAYOUT' : 'STREET RACE · CLOSED', x + 24, y + 24);
      ctx.font = '900 26px "Arial Black", Arial, sans-serif';
      ctx.fillStyle = '#fff3dc';
      ctx.fillText(r.verdict, x + 24, y + 54);
      ctx.font = '800 12px "Trebuchet MS", Arial, sans-serif';
      ctx.fillStyle = 'rgba(255, 243, 220, 0.72)';
      ctx.fillText(r.title, x + 24, y + 73);
      let ly = y + 95;
      for (const line of r.lines.slice(0, 2)) {
        ctx.font = '700 11px "Trebuchet MS", Arial, sans-serif';
        ctx.fillStyle = 'rgba(255, 243, 220, 0.62)';
        ctx.fillText(line, x + 24, ly);
        ly += 16;
      }
      ctx.textAlign = 'right';
      ctx.font = '900 24px "Consolas", monospace';
      ctx.fillStyle = '#ffcf5c';
      ctx.fillText(`+ $${r.cash.toLocaleString('en-US')}`, x + w - 22, y + 56);
      ctx.font = '800 8px "Trebuchet MS", Arial, sans-serif';
      ctx.fillStyle = 'rgba(255, 243, 220, 0.4)';
      ctx.fillText('ENTER / CLICK TO CLOSE', x + w - 22, y + h - 14);
      ctx.restore();
    }
    void game;
  }

  // -----------------------------------------------------------------
  // Persistence
  // -----------------------------------------------------------------
  serialize() {
    const data = { completed: { ...this.completed }, bestTimes: { ...this.bestTimes } };
    if (!this.active) return data;
    data.active = {
      id: this.id,
      phase: this.phase,
      countdown: this.countdown,
      raceTime: this.raceTime,
      lap: this.lap,
      next: this.next,
      playerPlace: this.playerPlace,
      car: this.startCar && this.startCar === this.game.player?.vehicle
        ? { x: this.startCar.x, y: this.startCar.y, angle: this.startCar.angle, hp: this.startCar.hp, color: this.startCar.color }
        : null,
      rivals: this.rivals.map((r) => ({
        x: r.car?.x || 0,
        y: r.car?.y || 0,
        angle: r.car?.angle || 0,
        next: r.next,
        lap: r.lap,
        skill: r.skill,
        finished: r.finished,
        time: r.time,
        color: r.car?.color || '#ff4d6d',
      })),
    };
    return data;
  }

  restore(data) {
    if (!data || typeof data !== 'object') return;
    if (data.completed) {
      for (const key of Object.keys(data.completed)) {
        this.completed[key] = Math.max(this.completed[key] || 0, Number(data.completed[key]) || 0);
      }
    }
    if (data.bestTimes) {
      for (const key of Object.keys(data.bestTimes)) {
        const value = Number(data.bestTimes[key]);
        if (Number.isFinite(value)) this.bestTimes[key] = value;
      }
    }
    if (!data.active || !this.defs.some((d) => d.id === data.active.id)) return;
    const active = data.active;
    const def = this.defs.find((d) => d.id === active.id);
    this.cleanup();
    this.active = true;
    this.id = active.id;
    this.route = def.route.map((p) => ({ ...p }));
    this.phase = active.phase === 'running' ? 'running' : 'countdown';
    this.locked = this.phase === 'countdown';
    this.countdown = Math.max(0, Number(active.countdown) || 3.2);
    this.countdownText = this.phase === 'countdown' ? '3' : '';
    this.raceTime = Math.max(0, Number(active.raceTime) || 0);
    this.lap = clamp(Number(active.lap) || 1, 1, def.laps);
    this.next = clamp(Number(active.next) || 0, 0, this.route.length - 1);
    this.playerPlace = 0;
    this.result = null;
    this.results = [];

    // Put the player back on their bike, or in a fresh race car.
    this.placePlayerAtGate(def);
    if (active.car && this.game.player.vehicle) {
      const car = this.game.player.vehicle;
      car.x = Number(active.car.x) || def.start.x;
      car.y = Number(active.car.y) || def.start.y;
      car.angle = Number(active.car.angle) || def.start.angle;
      car.vx = 0;
      car.vy = 0;
      car.hp = Math.max(1, Number(active.car.hp) || car.maxHp);
      this.game.player.x = car.x;
      this.game.player.y = car.y;
      this.game.player.angle = car.angle;
      this.game.camera.x = car.x;
      this.game.camera.y = car.y;
    }
    for (const src of active.rivals || []) {
      const car = new Vehicle('vipera', src.x || def.start.x, src.y || def.start.y, src.angle || 0, src.color || '#ff4d6d');
      car.isMission = true;
      car.aiMode = 'race';
      car.driver = { isRival: true };
      car.hp = 900;
      car.maxHp = 900;
      this.game.traffic.vehicles.push(car);
      this.rivals.push({
        car,
        next: clamp(Number(src.next) || 0, 0, this.route.length - 1),
        lap: clamp(Number(src.lap) || 1, 1, def.laps),
        skill: Number(src.skill) || 1,
        finished: !!src.finished,
        time: Number(src.time) || 0,
        stuck: 0,
        lastX: car.x,
        lastY: car.y,
      });
    }
    this.game.ui.showToast(`${def.name} resumed.`, 'neutral', 2.4);
  }

  reset() {
    this.cleanup();
    this.active = false;
    this.id = null;
    this.phase = 'idle';
    this.locked = false;
    this.result = null;
    this.route = [];
    this.rivals = [];
    this.raceTime = 0;
    this.next = 0;
    this.lap = 1;
  }
}

export { formatTime };
