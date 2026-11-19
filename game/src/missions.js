// Leonida Heat v3 - the five-job story of Leo Calder and Maya Cruz.
// New beats this pass: a wet valet handoff, a plaza rescue that turns into a
// timed delivery, a marina case drop, an escorted armoured haul and a final
// estate siege with a grenade-throwing boss. Every job opens on a short
// speaker-named briefing and checkpoints at each step.

import { Vehicle } from './entities.js';
import { Enemy } from './combat.js';

const CAST = {
  leo: 'Leo Calder',
  maya: 'Maya Cruz',
  crowe: 'Silas Crowe',
  dispatch: 'Costa Sol Dispatch',
  rourke: 'Dess Rourke',
  valet: 'Valet Captain',
};

const MISSIONS = [
  {
    id: 1,
    title: 'Sunset Valet',
    reward: 1600,
    intro: 'A valet ticket, a red Marlin, and a buyer with no patience.',
    briefing: [
      { speaker: CAST.maya, portrait: 'maya', text: 'Leo. Pelican Grill, west patio. The city looks expensive because it is. That is why we take things.' },
      { speaker: CAST.leo, portrait: 'leo', text: 'You called me out of bed for a valet stand?' },
      { speaker: CAST.maya, portrait: 'maya', text: 'I called you because the owner tips in threats. Red Marlin, keys in the console. Do not let him tip you.' },
    ],
    steps: [
      {
        type: 'waypoint',
        text: 'Meet Maya at The Pelican Grill on the Coral Strip',
        target: { x: 2560, y: 1198, radius: 66 },
        dialog: { speaker: CAST.maya, text: 'Over here by the grill. Keep the engine warm; Rustline closes at midnight.' },
      },
      {
        type: 'steal_vehicle',
        text: 'Take the red Marlin GT from Coral Valet',
        target: { x: 2560, y: 900, radius: 64 },
        vehicle: 'marlin',
        dialog: { speaker: CAST.leo, text: 'Clean paint, full tank. The owner is going to miss this one.' },
      },
      {
        type: 'deliver_vehicle',
        text: 'Deliver the Marlin to Rustline - 72 seconds',
        target: { x: 350, y: 2570, radius: 84 },
        requireTargetVehicle: true,
        timeLimit: 72,
        wantedOnStart: 1,
        vehicle: 'marlin',
        dialog: { speaker: CAST.maya, text: 'A patrol picked up the plate. Lose the tail if you can, but get it behind the garage door.' },
      },
    ],
  },
  {
    id: 2,
    title: 'Plaza Debt',
    reward: 3800,
    intro: 'Rourke parked the wrong car in the wrong plaza.',
    briefing: [
      { speaker: CAST.maya, portrait: 'maya', text: 'Rourke has four boys babysitting a blue Vipera by the Vantage fountain. The car is owed to us.' },
      { speaker: CAST.leo, portrait: 'leo', text: 'And the boys?' },
      { speaker: CAST.maya, portrait: 'maya', text: 'A rounding error. I left something louder under the fountain. Try not to redecorate the whole plaza.' },
    ],
    steps: [
      {
        type: 'waypoint',
        text: 'Meet Maya at Vantage Plaza',
        target: { x: 1750, y: 1482, radius: 72 },
        dialog: { speaker: CAST.maya, text: 'Fountain, north side. They have the car keys and no imagination.' },
      },
      {
        type: 'clear_and_steal',
        text: 'Clear the guards and take the Vipera',
        target: { x: 1830, y: 1535, radius: 74 },
        vehicle: 'vipera',
        guards: 4,
        guardWeapon: 'pistol',
        grantWeapon: 'smg',
        dialog: { speaker: CAST.maya, text: 'I slipped a Tide SMG under the fountain. Four guards, one car, no witnesses.' },
      },
      {
        type: 'deliver_vehicle',
        text: 'Deliver the Vipera to Sabal Safehouse - 85 seconds',
        target: { x: 1330, y: 1418, radius: 74 },
        requireTargetVehicle: true,
        timeLimit: 85,
        wantedOnStart: 2,
        vehicle: 'vipera',
        dialog: { speaker: CAST.maya, text: 'The plate is hot now. The safehouse door is open; do not stop for lights.' },
      },
    ],
  },
  {
    id: 3,
    title: 'Tidewater Score',
    reward: 5600,
    intro: 'A silver case at Pier 9 is worth more than the warehouse around it.',
    briefing: [
      { speaker: CAST.maya, portrait: 'maya', text: 'Crowe is unloading at Pier 9. Silver case, cold storage, five men who know how to use the dark.' },
      { speaker: CAST.leo, portrait: 'leo', text: 'Five guards, one case. Simple arithmetic.' },
      { speaker: CAST.maya, portrait: 'maya', text: 'The case is tagged. The moment you lift it, every patrol on the docks hears the alarm. Bring it to the marina.' },
    ],
    steps: [
      {
        type: 'waypoint',
        text: 'Reach Pier 9 in the Drydock Quarter',
        target: { x: 2250, y: 2600, radius: 78 },
        dialog: { speaker: CAST.maya, text: 'Loading bay is south of the containers. Watch the catwalk.' },
      },
      {
        type: 'eliminate',
        text: 'Take out the five dock guards',
        target: { x: 2250, y: 2565, radius: 100 },
        guards: 5,
        guardWeapon: 'smg',
        spawnAt: { x: 2250, y: 2565, spread: 118 },
        dialog: { speaker: CAST.leo, text: 'Four guards, one case. Simple arithmetic. Five if I count the one on the crane.' },
      },
      {
        type: 'collect',
        text: 'Grab the silver case from the loading bay',
        target: { x: 2250, y: 2585, radius: 54 },
        wanted: 2,
        dialog: { speaker: CAST.maya, text: 'That case is tagged. Every patrol on the docks just heard the alarm. Move!' },
      },
      {
        type: 'deliver',
        text: 'Reach the Quay Marina and drop the case - 95 seconds',
        target: { x: 2690, y: 2260, radius: 82 },
        timeLimit: 95,
        escape: true,
        dialog: { speaker: CAST.maya, text: 'The boat is tied at the arm. Drop the case and the heat dies with it. Do not stop for anyone.' },
      },
    ],
  },
  {
    id: 4,
    title: 'Armoured Run',
    reward: 9500,
    intro: 'A hauler full of stones is running Grand Avenue with two escorts.',
    briefing: [
      { speaker: CAST.dispatch, portrait: 'dispatch', text: 'Armoured hauler, two escorts, diamonds in the back. It reaches the east bridge in four minutes.' },
      { speaker: CAST.maya, portrait: 'maya', text: 'Hit it on Grand Avenue before it reaches Ocean. The crate goes to Rustline; the escorts are your problem.' },
      { speaker: CAST.leo, portrait: 'leo', text: 'Big ugly van. Bigger payday.' },
    ],
    steps: [
      {
        type: 'waypoint',
        text: 'Intercept the convoy on Grand Avenue',
        target: { x: 1480, y: 1400, radius: 92 },
        dialog: { speaker: CAST.maya, text: 'They are rolling east. Pin the hauler before the bridge and the escorts will scatter.' },
      },
      {
        type: 'destroy_convoy',
        text: 'Stop the armoured hauler before it escapes',
        target: { x: 1500, y: 1400, radius: 110 },
        vehicle: 'hauler',
        timeLimit: 70,
        dialog: { speaker: CAST.leo, text: 'Big ugly van, bigger payday. Let us see what the bumper is worth.' },
      },
      {
        type: 'collect',
        text: 'Grab the diamond crate from the wreck',
        target: { x: 1500, y: 1400, radius: 64 },
        wanted: 3,
        dialog: { speaker: CAST.maya, text: 'Crate is in the cab. Three stars and a city full of mirrors. Go.' },
      },
      {
        type: 'deliver',
        text: 'Deliver the diamonds to Rustline - 105 seconds',
        target: { x: 350, y: 2570, radius: 84 },
        timeLimit: 105,
        escape: true,
        dialog: { speaker: CAST.maya, text: 'The whole city is awake now. Get to the Ironworks.' },
      },
    ],
  },
  {
    id: 5,
    title: "Crowe's Table",
    reward: 26000,
    intro: 'Silas Crowe is done hiding behind his guards.',
    briefing: [
      { speaker: CAST.maya, portrait: 'maya', text: 'This is it. Crowe is behind that gate. I put a rifle and a vest in the dunes for you.' },
      { speaker: CAST.crowe, portrait: 'crowe', text: 'You think this city belongs to people like you? I built Costa Sol out of other people’s ruin.' },
      { speaker: CAST.leo, portrait: 'leo', text: 'Then you will not mind if we take the table.' },
    ],
    steps: [
      {
        type: 'waypoint',
        text: 'Storm the Crowe Estate on the north beach',
        target: { x: 2560, y: 730, radius: 86 },
        dialog: { speaker: CAST.maya, text: 'Front gate, then the forecourt. Keep moving; his crew likes crossfire.' },
      },
      {
        type: 'defend',
        text: 'Hold the estate forecourt for 36 seconds',
        target: { x: 2560, y: 610, radius: 160 },
        duration: 36,
        guards: 4,
        guardWeapon: 'smg',
        waves: 2,
        grantWeapon: 'rifle',
        wantedOnStart: 2,
        dialog: { speaker: CAST.crowe, text: 'You think this city belongs to people like you? Come inside, Calder. I will show you what the view is worth.' },
      },
      {
        type: 'boss_fight',
        text: 'Defeat Silas Crowe and his crew',
        target: { x: 2560, y: 680, radius: 120 },
        guards: 5,
        grantWeapon: 'rifle',
        supply: true,
        wantedOnStart: 3,
        dialog: { speaker: CAST.crowe, text: 'I built this city out of other people’s ruin. You will not take the table.' },
      },
      {
        type: 'deliver',
        text: 'Escape the manhunt and reach the Sabal Safehouse - 140 seconds',
        target: { x: 1330, y: 1418, radius: 86 },
        timeLimit: 140,
        escape: true,
        wantedOnStart: 4,
        dialog: { speaker: CAST.maya, text: 'Crowe is down. Do not stop now. The safehouse and the whole city are waiting.' },
      },
    ],
  },
];

export class MissionManager {
  constructor(city, game) {
    this.city = city;
    this.game = game;
    this.defs = MISSIONS;
    this.currentIndex = 0;
    this.stepIndex = 0;
    this.checkpointStep = 0;
    this.active = false;
    this.completedCount = 0;
    this.stepTimer = 0;
    this.stepTimeLimit = 0;
    this.targetVehicle = null;
    this.entities = [];
    this.convoy = [];
    this.convoyEscaped = false;
    this.lastFailed = null;
    this.banner = null;
    this.stepTarget = null;
    this.collectPoint = null;
    this.courierRoute = null;
    this.courierIndex = 0;
    this.boss = null;
    this.defend = null;
    this.briefingShown = false;
    this.checkpointNotice = '';
  }

  get definition() {
    return this.defs[this.currentIndex] || null;
  }

  get step() {
    if (!this.active || !this.definition) return null;
    return this.definition.steps[this.stepIndex] || null;
  }

  get allComplete() {
    return this.completedCount >= this.defs.length;
  }

  availableMarker() {
    if (this.active || this.currentIndex >= this.defs.length) return null;
    const def = this.defs[this.currentIndex];
    const step = def.steps[0];
    if (!step || !step.target) return null;
    return {
      x: step.target.x,
      y: step.target.y,
      radius: step.target.radius + 16,
      label: def.title,
      index: this.currentIndex,
      mission: def,
      available: true,
    };
  }

  currentTarget() {
    if (!this.active) return null;
    const step = this.step;
    if (!step) return null;
    if ((step.type === 'steal_vehicle' || step.type === 'clear_and_steal' || step.type === 'destroy_convoy' || step.type === 'chase_vehicle') && this.targetVehicle && !this.targetVehicle.isDestroyed) {
      return { x: this.targetVehicle.x, y: this.targetVehicle.y, radius: step.target.radius, label: step.text, mission: this.definition };
    }
    if (step.type === 'deliver_vehicle' && step.requireTargetVehicle && this.targetVehicle && !this.targetVehicle.isDestroyed) {
      if (this.game.player?.vehicle === this.targetVehicle) {
        return { ...step.target, label: step.text, mission: this.definition };
      }
      return { x: this.targetVehicle.x, y: this.targetVehicle.y, radius: step.target.radius, label: step.text, mission: this.definition };
    }
    if (step.type === 'boss_fight' && this.boss && !this.boss.isDead) {
      return { x: this.boss.x, y: this.boss.y, radius: step.target.radius, label: step.text, mission: this.definition };
    }
    if (step.type === 'collect' && this.collectPoint) {
      return { x: this.collectPoint.x, y: this.collectPoint.y, radius: step.target.radius, label: step.text, mission: this.definition };
    }
    if (step.target) return { ...step.target, label: step.text, mission: this.definition };
    return null;
  }

  canStartNear(x, y) {
    const marker = this.availableMarker();
    return marker && Math.hypot(marker.x - x, marker.y - y) < marker.radius + 40;
  }

  start(index = this.currentIndex, options = {}) {
    return this.startFrom(index, 0, false, options);
  }

  startFrom(index, step = 0, retry = false, options = {}) {
    if (index < 0 || index >= this.defs.length) return false;
    this.clearActors();
    this.currentIndex = index;
    this.stepIndex = clampInt(step, 0, this.defs[index].steps.length - 1);
    this.checkpointStep = this.stepIndex;
    this.active = true;
    this.stepTimer = 0;
    this.stepTimeLimit = 0;
    this.collectPoint = null;
    this.convoyEscaped = false;
    this.lastFailed = null;
    this.defend = null;
    this.boss = null;
    this.game.police.setWanted(0);
    this.game.state = 'playing';
    if (!retry) this.game.showMissionBanner(this.definition, index);
    this.setupStep(retry);
    if (!retry && !options.silent) {
      this.game.beginMissionBriefing(this.definition);
    }
    this.game.autosave();
    return true;
  }

  resume(index, step) {
    return this.startFrom(index, step, true, { silent: true });
  }

  retry() {
    const index = this.lastFailed?.index ?? this.currentIndex;
    const step = this.lastFailed?.step ?? this.checkpointStep;
    this.game.state = 'playing';
    this.game.player.health = Math.max(60, this.game.player.health);
    this.game.player.armor = Math.max(30, this.game.player.armor);
    this.game.police.clearWanted();
    this.startFrom(index, step, true, { silent: true });
    this.game.ui.showToast('Checkpoint retry. Stay sharp.', 'warning', 2.4);
  }

  abandon() {
    this.clearActors();
    this.active = false;
    this.game.state = 'playing';
    this.game.ui.showToast('Job dropped. The marker is still there when you are ready.', 'neutral', 3);
    this.game.autosave();
  }

  clearActors() {
    for (const v of [...this.convoy, this.targetVehicle]) {
      if (!v) continue;
      v.isMission = false;
      if (v !== this.game.player?.vehicle) {
        const idx = this.game.traffic.vehicles.indexOf(v);
        if (idx >= 0) this.game.traffic.vehicles.splice(idx, 1);
      }
    }
    for (const e of this.entities) {
      if (!e) continue;
      const idx = this.game.combat.enemies.indexOf(e);
      if (idx >= 0) this.game.combat.enemies.splice(idx, 1);
    }
    this.entities = [];
    this.convoy = [];
    this.targetVehicle = null;
    this.collectPoint = null;
    this.courierRoute = null;
    this.courierIndex = 0;
    this.boss = null;
    this.defend = null;
  }

  setupStep(resumed = false) {
    const step = this.step;
    if (!step) return;
    this.stepTimer = 0;
    this.stepTimeLimit = step.timeLimit || 0;
    this.collectPoint = null;
    this.stepTarget = step.target ? { ...step.target } : null;
    this.game.ui.objectiveHint = '';
    this.defend = null;
    this.boss = null;
    this.checkpointNotice = '';

    if (step.grantWeapon) {
      this.game.player.giveWeapon(step.grantWeapon, 2);
      if (!resumed) {
        const label = step.grantWeapon === 'smg' ? 'Tide SMG' : step.grantWeapon === 'rifle' ? 'Ranger Rifle' : step.grantWeapon;
        this.game.ui.showToast(`Maya slipped you a ${label}.`, 'success', 2.5);
      }
    }
    if (step.supply) {
      this.game.player.armor = Math.max(this.game.player.armor, 100);
      this.game.player.grenades = Math.max(this.game.player.grenades, 3);
      this.game.spawnPickup('health', 2500, 640);
      this.game.spawnPickup('armor', 2610, 640);
      this.game.spawnPickup('grenade', 2540, 700);
    }
    if (step.wantedOnStart) this.game.police.setWanted(step.wantedOnStart);

    if (step.type === 'steal_vehicle') {
      this.spawnTargetVehicle(step);
    } else if (step.type === 'clear_and_steal') {
      this.spawnTargetVehicle(step);
      this.spawnGuards(step.target.x + 20, step.target.y - 34, step.guards || 3, step.guardWeapon || 'pistol', 76);
      if (!resumed) this.game.ui.showToast('Guards are on the car. Clear them out.', 'danger', 3);
    } else if (step.type === 'eliminate') {
      this.spawnGuards(step.spawnAt?.x ?? step.target.x, step.spawnAt?.y ?? step.target.y, step.guards || 4, step.guardWeapon || 'smg', step.spawnAt?.spread || 100);
    } else if (step.type === 'destroy_convoy') {
      this.spawnConvoy(step, resumed);
    } else if (step.type === 'boss_fight') {
      this.spawnBoss(step);
    } else if (step.type === 'chase_vehicle') {
      this.spawnCourier(step);
    } else if (step.type === 'collect') {
      let px = step.target.x;
      let py = step.target.y;
      if (this.convoy.length && this.convoy[0]?.isDestroyed) {
        px = this.convoy[0].x;
        py = this.convoy[0].y;
      }
      this.collectPoint = { x: px, y: py };
      this.stepTarget = { x: px, y: py, radius: step.target.radius };
    } else if (step.type === 'defend') {
      this.defend = {
        elapsed: 0,
        waveTimer: 1.4,
        wavesSpawned: 0,
        waves: step.waves || 2,
        leaveTimer: 0,
      };
      this.spawnGuards(step.target.x, step.target.y - 90, 2, step.guardWeapon || 'smg', 80);
    } else if (step.type === 'deliver_vehicle' && step.requireTargetVehicle && !this.targetVehicle) {
      this.spawnTargetVehicle({ ...step, target: { x: this.game.player.x + 90, y: this.game.player.y, radius: step.target.radius } });
    }

    if (step.dialog && !resumed) this.game.showChatter(step.dialog.speaker, step.dialog.text, 5.5);
    if (this.stepTimeLimit) this.game.ui.showToast(`Timer started: ${this.stepTimeLimit}s`, 'warning', 2.2);
  }

  spawnTargetVehicle(step) {
    const v = new Vehicle(step.vehicle || 'vipera', step.target.x, step.target.y, Math.PI / 2);
    v.isMission = true;
    v.aiMode = 'parked';
    v.driver = null;
    v.occupiedByCivilian = false;
    v.maxHp *= 1.35;
    v.hp = v.maxHp;
    this.game.traffic.vehicles.push(v);
    this.targetVehicle = v;
    return v;
  }

  spawnCourier(step) {
    const v = new Vehicle(step.vehicle || 'vipera', step.target.x, step.target.y, 0.2);
    v.isMission = true;
    v.aiMode = 'courier';
    v.driver = { isCourier: true };
    v.occupiedByCivilian = false;
    v.maxHp = 220;
    v.hp = 220;
    v.cruiseSpeed = 250;
    this.game.traffic.vehicles.push(v);
    this.targetVehicle = v;
    this.courierRoute = [
      { x: step.target.x + 420, y: step.target.y - 70 },
      { x: 2240, y: 760 },
      { x: 2240, y: 2600 },
    ];
    this.courierIndex = 0;
    return v;
  }

  spawnGuards(x, y, count, weapon, spread = 80) {
    for (let i = 0; i < count; i += 1) {
      const angle = 0.12 * Math.PI + (i / Math.max(1, count - 1)) * 0.76 * Math.PI;
      let gx = x + Math.cos(angle) * spread * (0.7 + Math.random() * 0.5);
      let gy = y + Math.abs(Math.sin(angle)) * spread * (0.55 + Math.random() * 0.5) + 8;
      if (this.city.pointBlocked(gx, gy, 18)) {
        gx = x + (Math.random() - 0.5) * spread * 1.8;
        gy = y + Math.abs(Math.sin(angle)) * spread * 0.6 + 30;
      }
      const e = new Enemy(gx, gy, weapon);
      if (i === 0) e.squadRole = 'flank';
      if (i === 1) e.squadRole = 'cover';
      this.game.combat.enemies.push(e);
      this.entities.push(e);
    }
  }

  spawnConvoy(step, resumed = false) {
    const startX = resumed ? Math.max(step.target.x, this.game.player.x - 240) : step.target.x;
    const van = new Vehicle(step.vehicle || 'hauler', startX, step.target.y, 0);
    van.isMission = true;
    van.aiMode = 'convoy';
    van.driver = { isConvoy: true };
    van.cruiseSpeed = 96;
    van.maxHp = 360;
    van.hp = 360;
    this.game.traffic.vehicles.push(van);
    this.targetVehicle = van;
    this.convoy.push(van);

    const escortA = new Vehicle('vipera', startX - 80, step.target.y - 30, 0, '#20242c');
    const escortB = new Vehicle('vipera', startX - 145, step.target.y + 30, 0, '#20242c');
    for (const e of [escortA, escortB]) {
      e.isMission = true;
      e.aiMode = 'convoy';
      e.driver = { isConvoy: true };
      e.cruiseSpeed = 94;
      e.maxHp = 180;
      e.hp = 180;
      this.game.traffic.vehicles.push(e);
      this.convoy.push(e);
    }
    if (!resumed) this.game.ui.showToast('Convoy spotted - stop the hauler!', 'danger', 3);
  }

  spawnBoss(step) {
    const boss = new Enemy(step.target.x, step.target.y, 'rifle', true);
    this.game.combat.enemies.push(boss);
    this.entities.push(boss);
    this.boss = boss;
    const count = step.guards || 4;
    for (let i = 0; i < count; i += 1) {
      const gx = step.target.x - 110 + (i / Math.max(1, count - 1)) * 220;
      const gy = step.target.y + 34 + (i % 2) * 40;
      const guard = new Enemy(gx, gy, i % 2 === 0 ? 'smg' : 'shotgun');
      guard.squadRole = i % 3 === 0 ? 'flank' : 'press';
      this.game.combat.enemies.push(guard);
      this.entities.push(guard);
    }
    this.game.police.setWanted(step.wantedOnStart || 2);
    this.game.ui.showToast('Crowe’s crew is dug in. Use the rifle.', 'danger', 3.4);
  }

  update(dt, player) {
    if (!this.active) return;
    const step = this.step;
    if (!step) return;

    this.stepTimer += dt;
    if (this.stepTimeLimit > 0 && this.stepTimer >= this.stepTimeLimit) {
      this.fail('The clock ran out.');
      return;
    }

    if (step.type === 'destroy_convoy') {
      for (const v of this.convoy) {
        if (v === this.targetVehicle) {
          if (!v.isDestroyed) {
            v.angle = 0;
            v.vx = v.cruiseSpeed;
            v.vy = 0;
            v.x += v.vx * dt;
            if (v.x > 2320) this.convoyEscaped = true;
          }
        } else if (!v.isDestroyed) {
          const targetX = this.targetVehicle.x - 80;
          const targetY = this.targetVehicle.y + (v.y < 1400 ? -30 : 30);
          v.vx = (targetX - v.x) * 1.8;
          v.vy = (targetY - v.y) * 3.4;
          v.angle = Math.atan2(v.vy, v.vx) || 0;
        }
        v.update(dt, this.city, this.game.particles, this.game.audio, { wetness: this.game.weather?.wetness || 0 });
      }
      if (this.convoyEscaped) {
        this.fail('The hauler escaped with the diamonds.');
        return;
      }
      if (this.targetVehicle && this.targetVehicle.isDestroyed) {
        const wreckX = this.targetVehicle.x;
        const wreckY = this.targetVehicle.y;
        this.game.ui.showToast('Hauler stopped. Grab the crate.', 'success', 3);
        this.advance();
        if (this.step?.type === 'collect') {
          this.collectPoint = { x: wreckX, y: wreckY };
          this.stepTarget = { x: wreckX, y: wreckY, radius: this.step.target.radius };
        }
        return;
      }
    }

    if (step.type === 'chase_vehicle' && this.targetVehicle) {
      const v = this.targetVehicle;
      if (v.isDestroyed) {
        this.game.ui.showToast('Courier stopped.', 'success', 2.6);
        this.advance();
        return;
      }
      if (this.courierRoute && this.courierRoute[this.courierIndex]) {
        const target = this.courierRoute[this.courierIndex];
        const desired = Math.atan2(target.y - v.y, target.x - v.x);
        let diff = desired - v.angle;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        v.angle += Math.max(-2.4 * dt, Math.min(2.4 * dt, diff));
        v.vx = Math.cos(v.angle) * 275;
        v.vy = Math.sin(v.angle) * 275;
        v.update(dt, this.city, this.game.particles, this.game.audio);
        if (Math.hypot(target.x - v.x, target.y - v.y) < 80) {
          this.courierIndex += 1;
          if (this.courierIndex >= this.courierRoute.length) {
            this.fail('The courier got away with the ledger.');
            return;
          }
        }
      }
    }

    if (step.type === 'defend' && this.defend) {
      const d = this.defend;
      d.elapsed += dt;
      d.waveTimer -= dt;
      const dist = Math.hypot(player.x - step.target.x, player.y - step.target.y);
      if (dist > 330) {
        d.leaveTimer += dt;
        this.game.ui.objectiveHint = `Return to the forecourt - ${Math.max(0, 8 - Math.floor(d.leaveTimer))}s`;
        if (d.leaveTimer > 8) {
          this.fail('You abandoned the forecourt.');
          return;
        }
      } else {
        d.leaveTimer = Math.max(0, d.leaveTimer - dt * 1.5);
        this.game.ui.objectiveHint = `Hold - ${Math.ceil(step.duration - d.elapsed)}s`;
      }
      if (d.waveTimer <= 0 && d.wavesSpawned < d.waves) {
        d.waveTimer = 10.5;
        d.wavesSpawned += 1;
        const count = step.guards || 3;
        this.spawnGuards(step.target.x, step.target.y - 100, count, step.guardWeapon || 'smg', 105);
        this.game.ui.showToast(`Wave ${d.wavesSpawned} of ${d.waves} incoming.`, 'danger', 2.4);
      }
      if (d.elapsed >= step.duration) {
        this.game.ui.showToast('Forecourt held. Crowe is inside.', 'success', 3);
        this.advance();
        return;
      }
    }

    const target = this.stepTarget || step.target;
    if (!target) return;
    const dist = Math.hypot(player.x - target.x, player.y - target.y);

    if ((step.type === 'steal_vehicle' || step.type === 'clear_and_steal' || (step.type === 'deliver_vehicle' && step.requireTargetVehicle))
      && this.targetVehicle && this.targetVehicle.isDestroyed && player.vehicle !== this.targetVehicle) {
      this.fail('The car was destroyed.');
      return;
    }

    switch (step.type) {
      case 'waypoint':
        if (dist < target.radius) this.advance();
        break;
      case 'steal_vehicle':
        if (this.targetVehicle && player.vehicle === this.targetVehicle) this.advance();
        break;
      case 'clear_and_steal': {
        const guardsDead = this.entities.every((e) => !e || e.isDead);
        if (guardsDead && this.targetVehicle && player.vehicle === this.targetVehicle) {
          this.game.police.setWanted(1);
          this.game.ui.showToast('Vipera acquired - one star of heat.', 'warning', 2.6);
          this.advance();
        } else if (guardsDead && player.vehicle !== this.targetVehicle && this.stepIndex === 1) {
          this.game.ui.objectiveHint = 'Guards down. Get in the Vipera.';
        }
        break;
      }
      case 'eliminate':
        if (this.entities.length > 0 && this.entities.every((e) => !e || e.isDead)) this.advance();
        break;
      case 'collect':
        if (dist < target.radius) {
          if (step.wanted) this.game.police.setWanted(step.wanted);
          this.game.audio.playCash();
          this.game.ui.showToast(step.wanted ? 'Case secured - heat incoming!' : 'Crate secured.', step.wanted ? 'danger' : 'success', 2.8);
          this.advance();
        }
        break;
      case 'destroy_convoy':
      case 'chase_vehicle':
      case 'defend':
        break;
      case 'deliver_vehicle':
        if (dist < target.radius) {
          if (step.requireTargetVehicle && player.vehicle !== this.targetVehicle) {
            this.game.ui.objectiveHint = `Bring the ${this.targetVehicle?.config?.name || 'target car'} to the marker.`;
          } else {
            this.advance();
          }
        }
        break;
      case 'deliver':
        if (dist < target.radius) {
          if (step.escape) this.game.police.clearWanted();
          this.advance();
        }
        break;
      case 'boss_fight':
        if (this.boss && this.boss.isDead) {
          this.game.police.setWanted(4);
          this.advance();
        }
        break;
      default:
        break;
    }
  }

  advance() {
    const def = this.definition;
    if (!def) return;
    this.stepIndex += 1;
    this.stepTimer = 0;
    this.stepTimeLimit = 0;
    this.checkpointStep = Math.min(this.stepIndex, def.steps.length - 1);
    this.game.ui.objectiveHint = '';

    for (const v of [...this.convoy]) {
      if (v !== this.game.player.vehicle) v.isMission = false;
    }
    this.convoy = [];
    for (const e of this.entities) {
      if (!e) continue;
      const idx = this.game.combat.enemies.indexOf(e);
      if (idx >= 0 && e.isDead) this.game.combat.enemies.splice(idx, 1);
    }
    this.entities = [];
    this.targetVehicle = this.game.player.vehicle && this.targetVehicle === this.game.player.vehicle ? this.targetVehicle : null;
    this.boss = null;
    this.defend = null;

    if (this.stepIndex >= def.steps.length) {
      this.complete();
    } else {
      this.game.audio.playPickup();
      this.game.ui.showToast(`Checkpoint - step ${this.stepIndex + 1} of ${def.steps.length}.`, 'success', 2.2);
      this.setupStep();
      this.game.autosave();
    }
  }

  complete() {
    const def = this.definition;
    const reward = def.reward;
    this.active = false;
    this.completedCount = Math.max(this.completedCount, this.currentIndex + 1);
    this.game.player.money += reward;
    this.game.player.score += 450 + this.currentIndex * 260;
    this.clearActors();
    this.currentIndex += 1;
    this.stepIndex = 0;
    this.checkpointStep = 0;
    this.game.onMissionComplete(def, reward);
  }

  fail(reason) {
    if (!this.active) return;
    this.active = false;
    this.lastFailed = { index: this.currentIndex, step: this.checkpointStep, reason };
    this.clearActors();
    this.game.onMissionFailed(this.definition, reason);
  }

  failSilent(reason) {
    if (!this.active) return;
    this.active = false;
    this.lastFailed = { index: this.currentIndex, step: this.checkpointStep, reason };
    this.clearActors();
  }
}

function clampInt(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.round(n)));
}

export { CAST, MISSIONS };
