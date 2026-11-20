// Leonida Heat v5 - side jobs.
//
// Three self-contained shifts run beside the story: a taxi service, a
// vigilante pursuit and a paramedic round. Each owns its timer, targets,
// spawned vehicles, rewards, fail conditions, results card and a versioned
// save block. The director only calls update(), currentTarget(), drawWorld(),
// drawOverlay() and serialize()/restore().

import { Vehicle } from '../entities.js';

const TAU = Math.PI * 2;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export const SIDE_JOBS = [
  {
    id: 'taxi',
    name: 'Taxi Shift',
    short: 'TAXI',
    color: '#ffcf5c',
    marker: { x: 2524, y: 1746, radius: 54 },
    description: 'Three fares, one meter. Pick up and drop off before the shift clock runs dry.',
    duration: 205,
    reward: 1500,
  },
  {
    id: 'vigilante',
    name: 'Vigilante Shift',
    short: 'VIGILANTE',
    color: '#82b8ff',
    marker: { x: 1600, y: 1015, radius: 54 },
    description: 'A stolen Vipera is tearing up the city. Chase it down and stop the driver.',
    duration: 100,
    reward: 1650,
  },
  {
    id: 'paramedic',
    name: 'Paramedic Shift',
    short: 'PARAMEDIC',
    color: '#7ee0b0',
    marker: { x: 1200, y: 1746, radius: 54 },
    description: 'Three patients, three windows. Reach each marker before the patient clock hits zero.',
    duration: 125,
    reward: 1550,
  },
];

function roadPoint(city, x, y, min, max, rng = Math.random) {
  const p = city.randomRoadPoint(x, y, min, max, rng);
  if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) return { x: p.x, y: p.y, angle: p.angle || 0 };
  return { x: clamp(x + min, 80, 2620), y: clamp(y, 80, 3120), angle: 0 };
}

export class JobManager {
  constructor(city, game) {
    this.city = city;
    this.game = game;
    this.defs = SIDE_JOBS;
    this.active = false;
    this.id = null;
    this.phase = '';
    this.timer = 0;
    this.earned = 0;
    this.fares = 0;
    this.target = null;
    this.targetKind = '';
    this.pickup = null;
    this.dropoff = null;
    this.patientTimer = 0;
    this.patientMax = 32;
    this.patientIndex = 0;
    this.vehicle = null;
    this.suspect = null;
    this.suspectRoute = [];
    this.suspectIndex = 0;
    this.result = null;
    this.completed = { taxi: 0, vigilante: 0, paramedic: 0 };
    this._near = null;
    this._fareClock = 0;
  }

  // -----------------------------------------------------------------
  // Queries used by the director, HUD and phone.
  // -----------------------------------------------------------------
  get definition() {
    return this.defs.find((d) => d.id === this.id) || null;
  }

  get resultOpen() {
    return !!this.result && this.result.timer > 0;
  }

  status() {
    if (!this.active) return { active: false, id: null };
    const def = this.definition;
    const objective = this.phase === 'cab'
      ? 'Get in the marked cab'
      : this.phase === 'pickup'
        ? 'Pick up the passenger'
        : this.phase === 'dropoff'
          ? 'Drop the passenger at the marker'
          : this.phase === 'chase'
            ? 'Stop the fleeing Vipera'
            : this.phase === 'patient'
              ? 'Reach the patient'
              : 'On shift';
    return {
      active: true,
      id: this.id,
      name: def?.name || 'Side Job',
      short: def?.short || 'JOB',
      color: def?.color || '#ffcf5c',
      objective,
      timer: Math.max(0, this.timer),
      timerMax: def?.duration || 1,
      earned: this.earned,
      progress: this.id === 'taxi' ? `${this.fares}/3 FARES`
        : this.id === 'paramedic' ? `${this.patientIndex}/3 PATIENTS`
          : this.suspect?.isDestroyed ? 'SUSPECT STOPPED' : 'SUSPECT RUNNING',
      patientTimer: this.phase === 'patient' ? Math.max(0, this.patientTimer) : null,
      patientMax: this.patientMax,
    };
  }

  currentTarget() {
    if (!this.active) return null;
    if (this.phase === 'cab' && this.vehicle) {
      return { x: this.vehicle.x, y: this.vehicle.y, radius: 48, label: 'Taxi cab', color: '#ffcf5c' };
    }
    if (this.phase === 'chase' && this.suspect && !this.suspect.isDestroyed) {
      return { x: this.suspect.x, y: this.suspect.y, radius: 54, label: 'Fleeing suspect', color: '#82b8ff' };
    }
    if (this.target) {
      return { ...this.target, radius: this.target.radius || 48, color: this.definition?.color || '#ffcf5c' };
    }
    return null;
  }

  nearbyMarker(x, y) {
    if (this.active || this.game?.races?.active) return null;
    for (const def of this.defs) {
      if (Math.hypot(def.marker.x - x, def.marker.y - y) < def.marker.radius + 46) return def;
    }
    return null;
  }

  markers() {
    return this.defs.map((def) => ({ ...def.marker, id: def.id, name: def.name, color: def.color }));
  }

  // -----------------------------------------------------------------
  // Start / finish
  // -----------------------------------------------------------------
  start(id, restored = null) {
    if (this.active) return false;
    if (this.game?.races?.active) {
      this.game.ui.showToast('Finish the race first.', 'warning', 2.2);
      return false;
    }
    const def = this.defs.find((d) => d.id === id);
    if (!def) return false;
    this.cleanupVehicles();
    this.active = true;
    this.id = id;
    this.phase = '';
    this.timer = def.duration;
    this.earned = 0;
    this.fares = 0;
    this.target = null;
    this.pickup = null;
    this.dropoff = null;
    this.patientIndex = 0;
    this.patientTimer = 0;
    this.result = null;
    this._fareClock = 0;
    if (restored) this.applyRestore(restored);
    else if (id === 'taxi') this.startTaxi();
    else if (id === 'vigilante') this.startVigilante();
    else this.startParamedic();
    this.game.audio?.playPickup?.();
    this.game.ui.showToast(`${def.name} started. ${this.status().objective}.`, 'success', 3);
    this.game.autosave?.();
    return true;
  }

  startTaxi() {
    const p = this.game.player;
    const spot = this.findCarSpot(p.x, p.y);
    const cab = new Vehicle('meridian', spot.x, spot.y, spot.angle, '#ffd23f');
    cab.isMission = true;
    cab.aiMode = 'parked';
    cab.driver = null;
    cab.occupiedByCivilian = false;
    cab.headlightsOn = true;
    this.game.traffic.vehicles.push(cab);
    this.vehicle = cab;
    this.phase = 'cab';
    this.target = { x: cab.x, y: cab.y, radius: 48 };
    this.targetKind = 'cab';
    this.game.ui.showToast('Your cab is waiting. Get in and the fares start.', 'neutral', 2.8);
  }

  startVigilante() {
    const p = this.game.player;
    const spot = roadPoint(this.city, p.x, p.y, 420, 680);
    const suspect = new Vehicle('vipera', spot.x, spot.y, spot.angle, '#8d2434');
    suspect.isMission = true;
    suspect.aiMode = 'suspect';
    suspect.driver = { isSuspect: true };
    suspect.occupiedByCivilian = false;
    suspect.maxHp = 190;
    suspect.hp = 190;
    suspect.headlightsOn = true;
    this.game.traffic.vehicles.push(suspect);
    this.suspect = suspect;
    this.suspectIndex = 0;
    this.suspectRoute = [
      roadPoint(this.city, spot.x, spot.y, 380, 720),
      roadPoint(this.city, spot.x, spot.y, 520, 980),
      roadPoint(this.city, spot.x, spot.y, 620, 1100),
      roadPoint(this.city, spot.x, spot.y, 450, 900),
    ];
    this.phase = 'chase';
    this.target = { x: suspect.x, y: suspect.y, radius: 54 };
    this.targetKind = 'suspect';
    this.game.ui.showToast('Suspect spotted. Ram it, shoot it, stop it.', 'danger', 3);
    this.game.audio?.playSirenChirp?.(1);
  }

  startParamedic() {
    this.phase = 'patient';
    this.patientIndex = 0;
    this.patientTimer = this.patientMax;
    this.pickPatientTarget();
    this.game.ui.showToast('First patient is on the clock.', 'warning', 2.6);
  }

  pickPatientTarget() {
    const p = this.game.player;
    const spot = roadPoint(this.city, p.x, p.y, 260, 620);
    this.target = { x: spot.x, y: spot.y, radius: 46 };
    this.targetKind = 'patient';
  }

  complete() {
    if (!this.active) return;
    const def = this.definition;
    const bonus = def.reward;
    this.active = false;
    this.phase = '';
    this.game.player.money += bonus;
    this.game.player.score += 240;
    this.earned += bonus;
    this.completed[this.id] = (this.completed[this.id] || 0) + 1;
    this.game.stats.jobs = (this.game.stats.jobs || 0) + 1;
    this.cleanupVehicles();
    this.result = {
      kind: 'success',
      title: def.name,
      verdict: 'SHIFT COMPLETE',
      color: def.color || '#7ee0b0',
      cash: this.earned,
      lines: this.resultLines(),
      timer: 8.5,
      max: 8.5,
    };
    this.game.ui.showToast(`${def.name} complete · +$${this.earned.toLocaleString('en-US')}`, 'success', 4);
    this.game.audio?.playMissionPass?.();
    this.game.autosave?.();
  }

  fail(reason) {
    if (!this.active) return;
    const def = this.definition;
    this.active = false;
    this.phase = '';
    this.cleanupVehicles();
    this.result = {
      kind: 'fail',
      title: def?.name || 'Side Job',
      verdict: 'SHIFT FAILED',
      color: '#ff7d86',
      cash: 0,
      lines: [reason || 'The clock ran out.'],
      timer: 7.5,
      max: 7.5,
    };
    this.game.ui.showToast(`${def?.name || 'Side job'} failed: ${reason || 'time up'}`, 'danger', 3.4);
    this.game.audio?.playMissionFail?.();
    this.game.autosave?.();
  }

  abort(reason) {
    if (!this.active) return;
    this.active = false;
    this.phase = '';
    this.cleanupVehicles();
    this.result = {
      kind: 'fail',
      title: this.definition?.name || 'Side Job',
      verdict: 'SHIFT OVER',
      color: '#ff7d86',
      cash: 0,
      lines: [reason || 'You went down.'],
      timer: 5,
      max: 5,
    };
  }

  resultLines() {
    if (this.id === 'taxi') return [`${this.fares} fares delivered`, `Meter + tips paid out`];
    if (this.id === 'vigilante') return ['Suspect vehicle stopped', 'Dispatch logged the assist'];
    return [`${this.patientIndex} patients stabilised`, 'Costa Sol General says thanks'];
  }

  cleanupVehicles() {
    for (const v of [this.vehicle, this.suspect]) {
      if (!v) continue;
      v.isMission = false;
      if (v !== this.game.player?.vehicle) {
        v.aiMode = 'parked';
        v.driver = null;
        v.occupiedByCivilian = false;
      }
    }
    this.vehicle = null;
    this.suspect = null;
    this.suspectRoute = [];
  }

  // -----------------------------------------------------------------
  // Per-frame update
  // -----------------------------------------------------------------
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

    this.timer -= dt;
    if (this.timer <= 0) {
      this.fail('The shift clock hit zero.');
      return;
    }

    if (this.id === 'taxi') this.updateTaxi(dt, player);
    else if (this.id === 'vigilante') this.updateVigilante(dt, player);
    else this.updateParamedic(dt, player);
  }

  updateTaxi(dt, player) {
    const cab = this.vehicle;
    if (!cab || cab.isDestroyed) {
      this.fail('The cab was wrecked.');
      return;
    }
    if (this.phase === 'cab') {
      this.target = { x: cab.x, y: cab.y, radius: 48 };
      if (player.vehicle === cab) {
        this.beginFare();
      } else {
        this.game.ui.objectiveHint = 'The cab is marked on your map.';
      }
      return;
    }

    const p = player;
    const inCab = p.vehicle === cab;
    if (this.phase === 'pickup') {
      this.target = this.pickup;
      if (inCab && this.pickup && Math.hypot(p.x - this.pickup.x, p.y - this.pickup.y) < this.pickup.radius) {
        this.phase = 'dropoff';
        this._fareClock = 38;
        const p2 = roadPoint(this.city, this.pickup.x, this.pickup.y, 300, 760);
        this.dropoff = { x: p2.x, y: p2.y, radius: 54 };
        this.target = this.dropoff;
        this.game.ui.showToast('Fare aboard. Take them to the drop marker.', 'success', 2.6);
        this.game.audio?.playPickup?.();
      }
      return;
    }

    if (this.phase === 'dropoff') {
      this.target = this.dropoff;
      this._fareClock -= dt;
      if (this._fareClock <= 0) {
        this.fail('The passenger gave up waiting.');
        return;
      }
      if (inCab && this.dropoff && Math.hypot(p.x - this.dropoff.x, p.y - this.dropoff.y) < this.dropoff.radius) {
        this.fares += 1;
        const fare = 300 + Math.round(this._fareClock * 3.2);
        this.earned += fare;
        this.game.player.money += fare;
        this.game.player.score += 45;
        this.game.audio?.playCash?.();
        this.game.ui.showToast(`Fare ${this.fares}/3 paid $${fare}.`, 'success', 2.4);
        if (this.fares >= 3) this.complete();
        else this.beginFare();
      } else if (!inCab) {
        this.game.ui.objectiveHint = 'Get back in the cab with the passenger.';
      }
    }
  }

  beginFare() {
    const p = this.vehicle || this.game.player;
    const spot = roadPoint(this.city, p.x, p.y, 240, 600);
    this.pickup = { x: spot.x, y: spot.y, radius: 52 };
    this.target = this.pickup;
    this.phase = 'pickup';
    this._fareClock = 0;
    this.game.ui.showToast(`Fare ${this.fares + 1} of 3 is waiting at the pickup marker.`, 'neutral', 2.6);
  }

  updateVigilante(dt, player) {
    const suspect = this.suspect;
    if (!suspect) {
      this.fail('The suspect vanished.');
      return;
    }
    this.target = { x: suspect.x, y: suspect.y, radius: 54 };
    if (suspect.isDestroyed) {
      this.earned = this.definition.reward;
      this.complete();
      return;
    }

    // Drive the suspect along a loose route, faster when the player is close.
    const chaseDistance = Math.hypot(player.x - suspect.x, player.y - suspect.y);
    const target = this.suspectRoute[this.suspectIndex] || this.suspectRoute[0];
    if (target && Math.hypot(target.x - suspect.x, target.y - suspect.y) < 70) {
      this.suspectIndex = (this.suspectIndex + 1) % Math.max(1, this.suspectRoute.length);
    }
    const aim = this.suspectRoute[this.suspectIndex] || target;
    if (aim) {
      const desired = Math.atan2(aim.y - suspect.y, aim.x - suspect.x);
      let diff = desired - suspect.angle;
      while (diff > Math.PI) diff -= TAU;
      while (diff < -Math.PI) diff += TAU;
      const turn = clamp(diff, -2.5 * dt, 2.5 * dt);
      suspect.angle += turn;
      const speed = clamp(280 + (chaseDistance < 420 ? 55 : 0) + (suspect.hp < 100 ? 28 : 0), 240, 370);
      suspect.vx = Math.cos(suspect.angle) * speed;
      suspect.vy = Math.sin(suspect.angle) * speed;
    }
    suspect.x = clamp(suspect.x, 60, 2640);
    suspect.y = clamp(suspect.y, 60, 3140);
    suspect.update(dt, this.city, this.game.particles, this.game.audio, { wetness: this.game.weather?.wetness || 0 });

    if (suspect.speedAbs < 12) suspect.stuckTimer = (suspect.stuckTimer || 0) + dt;
    else suspect.stuckTimer = 0;
    if (suspect.stuckTimer > 2.2) {
      const next = this.suspectRoute[this.suspectIndex] || roadPoint(this.city, suspect.x, suspect.y, 200, 500);
      suspect.x = next.x;
      suspect.y = next.y;
      suspect.stuckTimer = 0;
    }
    this.game.ui.objectiveHint = `Suspect ${Math.round(chaseDistance / 10)} m away - stop the car.`;
  }

  updateParamedic(dt, player) {
    if (!this.target) this.pickPatientTarget();
    this.patientTimer -= dt;
    if (this.patientTimer <= 0) {
      this.fail('The patient timer expired.');
      return;
    }
    if (Math.hypot(player.x - this.target.x, player.y - this.target.y) < this.target.radius) {
      this.patientIndex += 1;
      const pay = 240 + Math.round(this.patientTimer * 8);
      this.earned += pay;
      this.game.player.money += pay;
      this.game.player.score += 40;
      this.game.audio?.playCash?.();
      this.game.ui.showToast(`Patient stabilised. +$${pay}.`, 'success', 2.4);
      if (this.patientIndex >= 3) {
        this.complete();
        return;
      }
      this.patientTimer = this.patientMax;
      this.pickPatientTarget();
    } else {
      this.game.ui.objectiveHint = `Patient ${this.patientIndex + 1}/3 - ${Math.ceil(this.patientTimer)}s left`;
    }
  }

  // -----------------------------------------------------------------
  // Presentation
  // -----------------------------------------------------------------
  drawWorld(ctx, game) {
    if (!this.active) return;
    const time = game.worldTime || 0;
    const target = this.currentTarget();
    const pulse = 0.68 + 0.32 * Math.sin(time * 4.2);
    if (target) {
      ctx.save();
      ctx.translate(target.x, target.y);
      ctx.strokeStyle = `${target.color || '#ffcf5c'}`;
      ctx.globalAlpha = 0.45 + pulse * 0.35;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, (target.radius || 48) * 0.78, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 0.2;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, (target.radius || 48) * (0.9 + pulse * 0.12), 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = target.color || '#ffcf5c';
      ctx.beginPath();
      ctx.moveTo(0, -18);
      ctx.lineTo(8, -6);
      ctx.lineTo(3, -6);
      ctx.lineTo(3, 8);
      ctx.lineTo(-3, 8);
      ctx.lineTo(-3, -6);
      ctx.lineTo(-8, -6);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // Available side job ranks.
    if (!this.active) {
      for (const def of this.defs) {
        const d = Math.hypot(game.player.x - def.marker.x, game.player.y - def.marker.y);
        if (d > 520) continue;
        ctx.save();
        ctx.translate(def.marker.x, def.marker.y);
        ctx.strokeStyle = def.color;
        ctx.globalAlpha = 0.18 + pulse * 0.2;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, def.marker.radius, 0, TAU);
        ctx.stroke();
        ctx.globalAlpha = 0.45;
        ctx.fillStyle = def.color;
        ctx.beginPath();
        ctx.arc(0, 0, 3.4, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
    }

    // Timer ring around the active target.
    if (this.id === 'paramedic' && target) {
      const frac = clamp(this.patientTimer / this.patientMax, 0, 1);
      ctx.save();
      ctx.translate(target.x, target.y);
      ctx.strokeStyle = frac < 0.3 ? '#ff7d86' : '#7ee0b0';
      ctx.lineWidth = 3;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.arc(0, 0, (target.radius || 46) + 7, -Math.PI / 2, -Math.PI / 2 + TAU * frac);
      ctx.stroke();
      ctx.restore();
    }
  }

  drawOverlay(ctx, game) {
    if (!this.result) return;
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
    ctx.roundRect ? ctx.roundRect(x, y, w, h, 12) : ctx.rect(x, y, w, h);
    ctx.fill();
    ctx.strokeStyle = r.color;
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.fillStyle = r.color;
    ctx.fillRect(x, y, 5, h);
    ctx.textAlign = 'left';
    ctx.font = '900 9px "Trebuchet MS", Arial, sans-serif';
    ctx.fillStyle = r.color;
    ctx.fillText(r.kind === 'success' ? 'SIDE JOB · PAID' : 'SIDE JOB · CLOSED', x + 24, y + 24);
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
    void game;
  }

  // -----------------------------------------------------------------
  // Persistence
  // -----------------------------------------------------------------
  serialize() {
    const data = { completed: { ...this.completed } };
    if (!this.active) return data;
    const cab = this.vehicle && !this.vehicle.isDestroyed
      ? { x: this.vehicle.x, y: this.vehicle.y, angle: this.vehicle.angle, hp: this.vehicle.hp, color: this.vehicle.color }
      : null;
    const suspect = this.suspect && !this.suspect.isDestroyed
      ? { x: this.suspect.x, y: this.suspect.y, angle: this.suspect.angle, hp: this.suspect.hp }
      : null;
    data.active = {
      id: this.id,
      phase: this.phase,
      timer: this.timer,
      fareClock: this._fareClock,
      earned: this.earned,
      fares: this.fares,
      patientIndex: this.patientIndex,
      patientTimer: this.patientTimer,
      pickup: this.pickup ? { ...this.pickup } : null,
      dropoff: this.dropoff ? { ...this.dropoff } : null,
      target: this.target ? { ...this.target } : null,
      cab,
      suspect,
    };
    return data;
  }

  restore(data) {
    if (!data || typeof data !== 'object') return;
    if (data.completed && typeof data.completed === 'object') {
      for (const id of Object.keys(this.completed)) {
        this.completed[id] = Math.max(this.completed[id] || 0, Number(data.completed[id]) || 0);
      }
    }
    if (!data.active || !this.defs.some((d) => d.id === data.active.id)) return;
    const active = data.active;
    const def = this.defs.find((d) => d.id === active.id);
    this.cleanupVehicles();
    this.active = true;
    this.id = active.id;
    this.phase = typeof active.phase === 'string' ? active.phase : 'cab';
    this.timer = clamp(Number(active.timer) || def.duration, 1, def.duration + 5);
    this.earned = Math.max(0, Number(active.earned) || 0);
    this.fares = clamp(Number(active.fares) || 0, 0, 3);
    this.patientIndex = clamp(Number(active.patientIndex) || 0, 0, 3);
    this.patientTimer = Math.max(1, Number(active.patientTimer) || this.patientMax);
    this.pickup = active.pickup ? { ...active.pickup } : null;
    this.dropoff = active.dropoff ? { ...active.dropoff } : null;
    this.target = active.target ? { ...active.target } : null;
    this._fareClock = Math.max(0, Number(active.fareClock) || 0);
    this.result = null;

    if (this.id === 'taxi') {
      const src = active.cab;
      const spot = src ? { x: src.x, y: src.y, angle: src.angle || 0 } : this.findCarSpot(this.game.player.x, this.game.player.y);
      const cab = new Vehicle('meridian', spot.x, spot.y, spot.angle || 0, src?.color || '#ffd23f');
      cab.isMission = true;
      cab.aiMode = 'parked';
      cab.headlightsOn = true;
      cab.hp = Math.max(1, src?.hp ?? cab.maxHp);
      this.game.traffic.vehicles.push(cab);
      this.vehicle = cab;
      if (this.phase === 'cab') this.target = { x: cab.x, y: cab.y, radius: 48 };
    } else if (this.id === 'vigilante') {
      const src = active.suspect;
      const spot = src ? { x: src.x, y: src.y } : roadPoint(this.city, this.game.player.x, this.game.player.y, 420, 680);
      const suspect = new Vehicle('vipera', spot.x, spot.y, src?.angle || 0, '#8d2434');
      suspect.isMission = true;
      suspect.aiMode = 'suspect';
      suspect.driver = { isSuspect: true };
      suspect.maxHp = 190;
      suspect.hp = Math.max(1, src?.hp ?? 190);
      this.game.traffic.vehicles.push(suspect);
      this.suspect = suspect;
      this.suspectIndex = 0;
      this.suspectRoute = [
        roadPoint(this.city, suspect.x, suspect.y, 380, 760),
        roadPoint(this.city, suspect.x, suspect.y, 520, 980),
        roadPoint(this.city, suspect.x, suspect.y, 450, 900),
      ];
      this.target = { x: suspect.x, y: suspect.y, radius: 54 };
    }
    this.game.ui.showToast(`${def.name} resumed.`, 'neutral', 2.4);
  }

  applyRestore(active) {
    // start() sets fresh defaults; restore() does the real work once the world
    // is fully built. This keeps the path identical for save and load.
    this.active = false;
    this.phase = '';
    this.restore({ active, completed: this.completed });
  }

  findCarSpot(x, y) {
    for (let i = 0; i < 12; i += 1) {
      const a = (i / 12) * TAU + 0.4;
      const cx = x + Math.cos(a) * 72;
      const cy = y + Math.sin(a) * 72;
      if (!this.city.pointBlocked(cx, cy, 26)) return { x: cx, y: cy, angle: a };
    }
    return { x: x + 60, y: y, angle: 0 };
  }

  reset() {
    this.cleanupVehicles();
    this.active = false;
    this.id = null;
    this.phase = '';
    this.result = null;
    this.target = null;
    this.pickup = null;
    this.dropoff = null;
    this.timer = 0;
    this.earned = 0;
    this.fares = 0;
    this.patientIndex = 0;
  }
}

export { roadPoint };
