// Leonida Heat - the five-mission story of Leo Calder and Maya Cruz.
// Every objective is reachable on foot or by car. Steps spawn their actors when
// they begin, keep a target for the map marker, and either complete, fail on a
// timer/target loss, or hand the fail screen back to the game when the player is
// wasted or busted.

import { Vehicle } from './entities.js';
import { Enemy } from './combat.js';

const CAST = {
  leo: 'Leo Calder',
  maya: 'Maya Cruz',
  crowe: 'Silas Crowe',
  dispatch: 'Costa Sol Dispatch',
};

const MISSIONS = [
  {
    id: 1,
    title: 'Neon Welcome',
    reward: 1000,
    intro: 'Maya has work, and the city has a car with your name on it.',
    steps: [
      {
        type: 'waypoint',
        text: 'Meet Maya at The Pelican Grill on the Coral Strip',
        target: { x: 2560, y: 1198, radius: 64 },
        dialog: { speaker: CAST.maya, text: 'Leo! Over here by the grill. Welcome to Costa Sol — the sun is free, everything else has a price.' },
      },
      {
        type: 'steal_vehicle',
        text: 'Steal the Marlin GT from Coral Valet',
        target: { x: 2560, y: 900, radius: 60 },
        vehicle: 'marlin',
        dialog: { speaker: CAST.maya, text: 'That Marlin GT at the valet is booked for a man who tips in threats. Take it to Rustline before he notices.' },
      },
      {
        type: 'deliver_vehicle',
        text: 'Deliver the Marlin GT to Rustline Chop Shop',
        target: { x: 350, y: 2570, radius: 78 },
        requireTargetVehicle: true,
        dialog: { speaker: CAST.leo, text: 'Clean paint, full tank. The Ironworks always pays on delivery.' },
      },
    ],
  },
  {
    id: 2,
    title: 'Repo Run',
    reward: 2500,
    intro: 'A loan shark parked the wrong car in the wrong plaza.',
    steps: [
      {
        type: 'waypoint',
        text: 'Meet Maya at Vantage Plaza',
        target: { x: 1750, y: 1480, radius: 72 },
        dialog: { speaker: CAST.maya, text: 'Three of Rourke’s boys are babysitting a Vipera in the plaza. The car is owed to us. The boys are not.' },
      },
      {
        type: 'clear_and_steal',
        text: 'Clear the guards and take the Vipera',
        target: { x: 1830, y: 1535, radius: 70 },
        vehicle: 'vipera',
        guards: 3,
        guardWeapon: 'pistol',
        dialog: { speaker: CAST.maya, text: 'I left something louder under the fountain. Try not to redecorate the whole plaza.' },
        grantWeapon: 'smg',
      },
      {
        type: 'deliver_vehicle',
        text: 'Deliver the Vipera to the Sabal Safehouse — 80 seconds',
        target: { x: 1330, y: 1428, radius: 72 },
        requireTargetVehicle: true,
        timeLimit: 80,
        dialog: { speaker: CAST.maya, text: 'Heat is on the car. Lose the tail if you can; just get it in the garage before the clock runs dry.' },
      },
    ],
  },
  {
    id: 3,
    title: 'Dockside Contraband',
    reward: 4500,
    intro: 'A briefcase at Pier 9 is worth more than the warehouse around it.',
    steps: [
      {
        type: 'waypoint',
        text: 'Reach Pier 9 in the Drydock Quarter',
        target: { x: 2250, y: 2600, radius: 76 },
        dialog: { speaker: CAST.maya, text: 'Crowe’s crew is unloading at Pier 9. The silver case goes to the safehouse — everything between you and it does not.' },
      },
      {
        type: 'eliminate',
        text: 'Take out the four dock guards',
        target: { x: 2250, y: 2570, radius: 90 },
        guards: 4,
        guardWeapon: 'smg',
        spawnAt: { x: 2250, y: 2570, spread: 105 },
        dialog: { speaker: CAST.leo, text: 'Four guards, one case. Simple arithmetic.' },
      },
      {
        type: 'collect',
        text: 'Grab the silver case from the loading bay',
        target: { x: 2250, y: 2585, radius: 52 },
        wanted: 2,
        dialog: { speaker: CAST.maya, text: 'That case is tagged. Every patrol on the docks just heard the alarm. Move!' },
      },
      {
        type: 'deliver',
        text: 'Escape the heat and reach the Sabal Safehouse — 100 seconds',
        target: { x: 1330, y: 1428, radius: 76 },
        timeLimit: 100,
        escape: true,
        dialog: { speaker: CAST.maya, text: 'Drop the case and the heat dies with it. Do not stop for anyone.' },
      },
    ],
  },
  {
    id: 4,
    title: 'Convoy Takedown',
    reward: 8000,
    intro: 'A armoured hauler is running diamonds across Grand Avenue.',
    steps: [
      {
        type: 'waypoint',
        text: 'Intercept the convoy on Grand Avenue',
        target: { x: 1450, y: 1400, radius: 90 },
        dialog: { speaker: CAST.maya, text: 'Armoured hauler, two escorts, diamonds in the back. Hit it before it reaches the bridge.' },
      },
      {
        type: 'destroy_convoy',
        text: 'Stop the armoured hauler before it escapes',
        target: { x: 1250, y: 1400, radius: 100 },
        vehicle: 'hauler',
        dialog: { speaker: CAST.leo, text: 'Big ugly van. Bigger payday.' },
      },
      {
        type: 'collect',
        text: 'Grab the diamond crate from the wreck',
        target: { x: 1250, y: 1400, radius: 60 },
        wanted: 3,
      },
      {
        type: 'deliver',
        text: 'Deliver the diamonds to Rustline — 110 seconds',
        target: { x: 350, y: 2570, radius: 80 },
        timeLimit: 110,
        escape: true,
        dialog: { speaker: CAST.maya, text: 'Three stars, Leo. The whole city is awake now. Get to the Ironworks.' },
      },
    ],
  },
  {
    id: 5,
    title: 'King of Costa Sol',
    reward: 20000,
    intro: 'Silas Crowe is done hiding behind his guards.',
    steps: [
      {
        type: 'waypoint',
        text: 'Storm the Crowe Estate on the north beach',
        target: { x: 2560, y: 720, radius: 84 },
        dialog: { speaker: CAST.maya, text: 'This is it, Leo. Crowe is behind that gate. I put a rifle and a vest in the dunes for you.' },
      },
      {
        type: 'boss_fight',
        text: 'Defeat Silas Crowe and his crew',
        target: { x: 2560, y: 600, radius: 110 },
        guards: 5,
        grantWeapon: 'rifle',
        dialog: { speaker: CAST.crowe, text: 'You think this city belongs to people like you? I built Costa Sol out of other people’s ruin.' },
        supply: true,
      },
      {
        type: 'deliver',
        text: 'Escape the four-star manhunt and reach the safehouse',
        target: { x: 1330, y: 1428, radius: 84 },
        timeLimit: 150,
        escape: true,
        wanted: 4,
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
    if (step.type === 'steal_vehicle' || step.type === 'clear_and_steal') {
      if (this.targetVehicle && !this.targetVehicle.isDestroyed) {
        return { x: this.targetVehicle.x, y: this.targetVehicle.y, radius: step.target.radius, label: step.text, mission: this.definition };
      }
    }
    if (step.type === 'destroy_convoy' && this.targetVehicle) {
      return { x: this.targetVehicle.x, y: this.targetVehicle.y, radius: step.target.radius, label: step.text, mission: this.definition };
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

  start(index = this.currentIndex) {
    if (index >= this.defs.length) return false;
    this.clearActors();
    this.currentIndex = index;
    this.stepIndex = 0;
    this.active = true;
    this.stepTimer = 0;
    this.stepTimeLimit = 0;
    this.collectPoint = null;
    this.convoyEscaped = false;
    this.pendingCollect = null;
    this.lastFailed = null;
    const def = this.definition;
    this.game.showMissionBanner(def, index);
    this.setupStep();
    this.game.autosave();
    return true;
  }

  resume(index, step) {
    if (index < 0 || index >= this.defs.length) return false;
    this.clearActors();
    this.currentIndex = index;
    this.stepIndex = Math.max(0, Math.min(this.defs[index].steps.length - 1, step));
    this.active = true;
    this.stepTimer = 0;
    this.collectPoint = null;
    this.convoyEscaped = false;
    this.setupStep(true);
    // If the save was made while handling the objective car, keep that car
    // reachable from the restored player position instead of stranding it.
    if (this.targetVehicle && (this.step?.type === 'deliver_vehicle' || this.step?.type === 'clear_and_steal')) {
      this.targetVehicle.x = this.game.player.x + 70;
      this.targetVehicle.y = this.game.player.y;
      this.targetVehicle.vx = 0;
      this.targetVehicle.vy = 0;
    }
    return true;
  }

  retry() {
    const index = this.lastFailed?.index ?? this.currentIndex;
    this.game.state = 'playing';
    this.start(index);
  }

  abandon() {
    this.clearActors();
    this.active = false;
    this.game.state = 'playing';
    this.game.ui.showToast('Mission dropped. The marker is still there when you are ready.', 'neutral', 3);
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
      if (!e || e.isDead) continue;
      const idx = this.game.combat.enemies.indexOf(e);
      if (idx >= 0) this.game.combat.enemies.splice(idx, 1);
    }
    this.entities = [];
    this.convoy = [];
    this.targetVehicle = null;
    this.collectPoint = null;
  }

  setupStep(resumed = false) {
    const step = this.step;
    if (!step) return;
    this.stepTimer = 0;
    this.stepTimeLimit = step.timeLimit || 0;
    this.collectPoint = null;
    this.stepTarget = step.target ? { ...step.target } : null;
    this.game.ui.objectiveHint = '';

    if (step.grantWeapon) {
      this.game.player.giveWeapon(step.grantWeapon, 2);
      if (step.grantWeapon === 'smg') this.game.ui.showToast('Maya slipped you a Tide SMG.', 'success', 2.6);
    }
    if (step.supply) {
      this.game.player.armor = Math.max(this.game.player.armor, 100);
      this.game.spawnPickup('health', 2510, 640);
      this.game.spawnPickup('armor', 2600, 640);
    }

    if (step.type === 'steal_vehicle') {
      this.spawnTargetVehicle(step);
    } else if (step.type === 'clear_and_steal') {
      this.spawnTargetVehicle(step);
      this.spawnGuards(step, step.target.x + 20, step.target.y - 36, step.guards || 3, step.guardWeapon || 'pistol');
      if (!resumed) this.game.ui.showToast('Guards are on the Vipera. Clear them out.', 'danger', 3);
    } else if (step.type === 'eliminate') {
      this.spawnGuards(step, step.spawnAt?.x ?? step.target.x, step.spawnAt?.y ?? step.target.y, step.guards || 4, step.guardWeapon || 'smg', step.spawnAt?.spread || 90);
    } else if (step.type === 'destroy_convoy') {
      this.spawnConvoy(step);
    } else if (step.type === 'boss_fight') {
      this.spawnBoss(step);
    } else if (step.type === 'collect') {
      let px = step.target.x;
      let py = step.target.y;
      if (this.pendingCollect) {
        px = this.pendingCollect.x;
        py = this.pendingCollect.y;
        this.pendingCollect = null;
      } else if (this.convoy.length && this.convoy[0].isDestroyed) {
        px = this.convoy[0].x;
        py = this.convoy[0].y;
      }
      this.collectPoint = { x: px, y: py };
      this.stepTarget = { x: px, y: py, radius: step.target.radius };
    }

    if (step.dialog && !resumed) {
      this.game.showDialog(step.dialog.speaker, step.dialog.text);
    }
    if (this.stepTimeLimit) {
      this.game.ui.showToast(`Timer started: ${this.stepTimeLimit}s`, 'warning', 2.2);
    }
  }

  spawnTargetVehicle(step) {
    const v = new Vehicle(step.vehicle || 'vipera', step.target.x, step.target.y, Math.PI / 2);
    v.isMission = true;
    v.aiMode = 'parked';
    v.driver = null;
    v.occupiedByCivilian = false;
    this.game.traffic.vehicles.push(v);
    this.targetVehicle = v;
    return v;
  }

  spawnGuards(step, x, y, count, weapon, spread = 70) {
    for (let i = 0; i < count; i += 1) {
      // Guards stand in the open in front of the objective (south half),
      // never inside the warehouse or estate behind it.
      const angle = 0.18 * Math.PI + (i / Math.max(1, count - 1)) * 0.64 * Math.PI;
      const gx = x + Math.cos(angle) * spread * (0.65 + Math.random() * 0.35);
      const gy = y + Math.abs(Math.sin(angle)) * spread * (0.5 + Math.random() * 0.5) + 8;
      const e = new Enemy(gx, gy, weapon);
      this.game.combat.enemies.push(e);
      this.entities.push(e);
    }
  }

  spawnConvoy(step) {
    const van = new Vehicle(step.vehicle || 'hauler', step.target.x, step.target.y, 0);
    van.isMission = true;
    van.aiMode = 'convoy';
    van.driver = { isConvoy: true };
    van.cruiseSpeed = 72;
    this.game.traffic.vehicles.push(van);
    this.targetVehicle = van;
    this.convoy.push(van);

    const escortA = new Vehicle('vipera', step.target.x - 70, step.target.y - 26, 0, '#20242c');
    const escortB = new Vehicle('vipera', step.target.x - 120, step.target.y + 26, 0, '#20242c');
    for (const e of [escortA, escortB]) {
      e.isMission = true;
      e.aiMode = 'convoy';
      e.driver = { isConvoy: true };
      e.cruiseSpeed = 68;
      this.game.traffic.vehicles.push(e);
      this.convoy.push(e);
    }
    this.game.ui.showToast('Convoy spotted — stop the hauler!', 'danger', 3);
  }

  spawnBoss(step) {
    const boss = new Enemy(step.target.x, step.target.y, 'rifle', true);
    this.game.combat.enemies.push(boss);
    this.entities.push(boss);
    const count = step.guards || 5;
    for (let i = 0; i < count; i += 1) {
      const gx = step.target.x - 120 + (i / (count - 1 || 1)) * 240;
      const gy = step.target.y + 35 + (i % 2) * 42;
      const guard = new Enemy(gx, gy, i % 2 === 0 ? 'smg' : 'pistol');
      this.game.combat.enemies.push(guard);
      this.entities.push(guard);
    }
    this.game.police.setWanted(2);
    this.game.ui.showToast('Crowe’s crew is dug in. Use the rifle.', 'danger', 3.4);
  }

  update(dt, player) {
    if (!this.active) return;
    const step = this.step;
    if (!step) return;

    if (this.stepTimeLimit > 0) {
      this.stepTimer += dt;
      if (this.stepTimer >= this.stepTimeLimit) {
        this.fail('The clock ran out.');
        return;
      }
    }

    // Moving convoy.
    if (step.type === 'destroy_convoy') {
      for (const v of this.convoy) {
        if (v === this.targetVehicle) {
          v.angle = 0;
          if (!v.isDestroyed) {
            v.vx = v.cruiseSpeed;
            v.vy = 0;
            v.x += v.vx * dt;
            if (v.x > 2310) this.convoyEscaped = true;
          }
        } else if (!v.isDestroyed) {
          const targetX = this.targetVehicle.x - 70;
          const targetY = this.targetVehicle.y + (v.y < 1400 ? -26 : 26);
          v.vx = (targetX - v.x) * 1.6;
          v.vy = (targetY - v.y) * 3.2;
          v.angle = Math.atan2(v.vy, v.vx) || 0;
        }
        v.update(dt, this.city, this.game.particles, this.game.audio);
      }
      if (this.convoyEscaped) {
        this.fail('The hauler escaped with the diamonds.');
        return;
      }
      if (this.targetVehicle && this.targetVehicle.isDestroyed) {
        this.pendingCollect = { x: this.targetVehicle.x, y: this.targetVehicle.y };
        this.game.ui.showToast('Hauler stopped. Grab the crate.', 'success', 3);
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
          this.game.ui.showToast('Vipera acquired — one star of heat.', 'warning', 2.6);
          this.advance();
        } else if (guardsDead && player.vehicle !== this.targetVehicle) {
          this.game.ui.objectiveHint = 'Guards down. Get in the Vipera.';
        }
        break;
      }
      case 'eliminate': {
        const allDead = this.entities.every((e) => !e || e.isDead);
        if (allDead) this.advance();
        break;
      }
      case 'collect':
        if (dist < target.radius) {
          if (step.wanted) this.game.police.setWanted(step.wanted);
          this.game.audio.playCash();
          this.game.ui.showToast(step.wanted ? 'Case secured — heat incoming!' : 'Crate secured.', step.wanted ? 'danger' : 'success', 2.8);
          this.advance();
        }
        break;
      case 'destroy_convoy':
        // Handled above through the moving convoy branch.
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
      case 'deliver': {
        if (dist < target.radius) {
          if (step.escape) this.game.police.clearWanted();
          this.advance();
        }
        break;
      }
      case 'boss_fight': {
        const boss = this.entities[0];
        const allDead = this.entities.every((e) => !e || e.isDead);
        if (allDead || (boss && boss.isDead)) {
          this.game.police.setWanted(4);
          this.advance();
        }
        break;
      }
      default:
        break;
    }
  }

  advance() {
    const def = this.definition;
    const finishedStep = this.stepIndex;
    this.stepIndex += 1;
    this.stepTimer = 0;
    this.stepTimeLimit = 0;

    // Vehicles spawned purely for the completed step stop being mission cars.
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

    if (this.stepIndex >= def.steps.length) {
      this.complete();
    } else {
      this.game.audio.playPickup();
      this.setupStep();
      void finishedStep;
    }
  }

  complete() {
    const def = this.definition;
    const reward = def.reward;
    this.active = false;
    this.completedCount = Math.max(this.completedCount, this.currentIndex + 1);
    this.game.player.money += reward;
    this.clearActors();
    this.currentIndex += 1;
    this.stepIndex = 0;
    this.game.onMissionComplete(def, reward);
  }

  fail(reason) {
    if (!this.active) return;
    this.active = false;
    this.lastFailed = { index: this.currentIndex, reason };
    this.clearActors();
    this.game.onMissionFailed(this.definition, reason);
  }

  failSilent(reason) {
    if (!this.active) return;
    this.active = false;
    this.lastFailed = { index: this.currentIndex, reason };
    this.clearActors();
  }
}
