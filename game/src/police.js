// Leonida Heat - the wanted system.
// Patrol cruisers and foot officers spawn off the player's bubble, pursue by
// line of sight, ram and (from two stars) shoot. When sight is broken the heat
// cools one star at a time. Standing still beside an officer fills the busted
// meter; the game owns the BUSTED screen and respawn.

import { Vehicle } from './entities.js';
import { WANTED_CONFIG } from './config.js';
import { range } from './rng.js';

let footCopId = 1;

export class FootCop {
  constructor(x, y) {
    this.id = footCopId++;
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.angle = 0;
    this.health = 55;
    this.maxHealth = 55;
    this.isDead = false;
    this.fireTimer = 0.8 + Math.random();
    this.hitFlash = 0;
    this.radius = 13;
    this.speed = 150;
    this.isCop = true;
    this.searchPhase = Math.random() * Math.PI * 2;
  }

  takeDamage(amount, particles, audio) {
    if (this.isDead) return;
    this.health -= amount;
    this.hitFlash = 1;
    if (particles) particles.spawnBlood(this.x, this.y, 4);
    if (this.health <= 0) {
      this.isDead = true;
      this.vx = 0;
      this.vy = 0;
      if (particles) particles.spawnCash(this.x, this.y, 60 + Math.floor(Math.random() * 60));
      if (audio) audio.playBodyFall();
    }
  }
}

export class PoliceManager {
  constructor(city, rng = Math.random) {
    this.city = city;
    this.rng = rng;
    this.wantedStars = 0;
    this.cops = [];
    this.footCops = [];
    this.roadblocks = [];
    this.dispatchTimer = 0;
    this.footDispatchTimer = 0;
    this.cooldownTimer = 0;
    this.searching = false;
    this.hasSight = false;
    this.bustedProgress = 0;
    this.bustedArmed = false;
    this.roadblockTimer = 0;
    this.lastKnown = null;
    this.deployTimer = 0;
    this.flash = 0;
  }

  setWanted(stars) {
    const next = Math.max(0, Math.min(5, Math.round(stars)));
    if (next > this.wantedStars) {
      this.cooldownTimer = WANTED_CONFIG.cooldownTime;
      this.searching = false;
      this.dispatchTimer = Math.min(this.dispatchTimer, 1.5);
    }
    this.wantedStars = next;
    if (next === 0) this.clearWanted();
  }

  raiseWanted(stars = 1) {
    if (stars <= 0) return;
    this.setWanted(this.wantedStars + stars);
    this.flash = 1;
  }

  clearWanted() {
    this.wantedStars = 0;
    this.searching = false;
    this.bustedProgress = 0;
    this.cooldownTimer = 0;
    for (const c of this.cops) c.sirenActive = false;
    for (const c of this.roadblocks) c.sirenActive = false;
  }

  witnessedCarjack(x, y) {
    for (const c of this.cops) {
      if (Math.hypot(c.x - x, c.y - y) < 460 && this.city.hasLineOfSight(c.x, c.y, x, y, 460)) return true;
    }
    for (const f of this.footCops) {
      if (!f.isDead && Math.hypot(f.x - x, f.y - y) < 360 && this.city.hasLineOfSight(f.x, f.y, x, y, 360)) return true;
    }
    return false;
  }

  update(dt, player, particleSys, audio, game) {
    this.flash = Math.max(0, this.flash - dt);
    if (this.wantedStars <= 0) {
      this.bustedProgress = Math.max(0, this.bustedProgress - dt * 3);
      for (let i = this.cops.length - 1; i >= 0; i -= 1) {
        const c = this.cops[i];
        c.sirenActive = false;
        c.update(dt, this.city, particleSys, audio);
        if (Math.hypot(c.x - player.x, c.y - player.y) > 1100) this.cops.splice(i, 1);
      }
      for (const f of this.footCops) f.isDead = f.isDead || Math.hypot(f.x - player.x, f.y - player.y) > 1300;
      this.footCops = this.footCops.filter((f) => !f.isDead || Math.hypot(f.x - player.x, f.y - player.y) < 1300);
      if (audio) audio.setPoliceSiren(false, 0);
      return;
    }

    const cfg = WANTED_CONFIG.levels[this.wantedStars];

    // Line of sight from any officer.
    let sight = false;
    for (const c of this.cops) {
      if (this.city.hasLineOfSight(c.x, c.y, player.x, player.y, 720)) {
        sight = true;
        break;
      }
    }
    if (!sight) {
      for (const f of this.footCops) {
        if (!f.isDead && this.city.hasLineOfSight(f.x, f.y, player.x, player.y, 560)) {
          sight = true;
          break;
        }
      }
    }
    this.hasSight = sight;
    if (sight) {
      this.lastKnown = { x: player.x, y: player.y };
      this.searching = false;
      this.cooldownTimer = WANTED_CONFIG.cooldownTime;
    } else {
      this.searching = true;
      this.cooldownTimer -= dt;
      if (this.cooldownTimer <= 0) {
        const next = this.wantedStars - 1;
        this.wantedStars = next;
        this.cooldownTimer = WANTED_CONFIG.perStarDecay;
        game.ui.showToast(next === 0 ? 'Heat cleared. Keep your head down.' : `Search is cooling — ${next} star${next === 1 ? '' : 's'} left.`, next === 0 ? 'success' : 'neutral', 2.6);
        if (next === 0) {
          this.clearWanted();
          return;
        }
      }
    }

    if (audio) audio.setPoliceSiren(true, this.wantedStars);

    // Dispatch cruisers.
    this.dispatchTimer -= dt;
    if (this.dispatchTimer <= 0 && this.cops.length < cfg.maxCops) {
      this.dispatchTimer = cfg.dispatchInterval;
      this.spawnCruiser(player);
    }

    // Foot officers: deploy from nearby stopped cruisers, and dispatch to a
    // player on foot so there is always someone to run the cordon.
    this.footDispatchTimer -= dt;
    if (this.footDispatchTimer <= 0 && this.footCops.filter((f) => !f.isDead).length < cfg.maxFoot) {
      this.footDispatchTimer = 7;
      this.deployTimer += 1;
      if (!player.isInVehicle || this.deployTimer % 2 === 0) {
        this.spawnFootCop(player);
      }
    }

    // Cruiser pursuit.
    for (let i = this.cops.length - 1; i >= 0; i -= 1) {
      const cop = this.cops[i];
      if (cop.isDestroyed) {
        if (particleSys) particleSys.spawnExplosion(cop.x, cop.y);
        this.cops.splice(i, 1);
        continue;
      }
      cop.sirenActive = true;
      this.pursue(cop, player, dt, particleSys, audio, game, sight);
      cop.update(dt, this.city, particleSys, audio);
      if (Math.hypot(cop.x - player.x, cop.y - player.y) > 1900) this.cops.splice(i, 1);
      if (sight && player.isInVehicle && player.vehicle && Math.hypot(cop.x - player.x, cop.y - player.y) < 70) {
        const impact = Math.hypot(cop.vx - player.vehicle.vx, cop.vy - player.vehicle.vy);
        if (impact > 180) {
          player.vehicle.takeDamage(impact * 0.02, particleSys, audio);
          game.camera.shake = Math.max(game.camera.shake, 0.5);
        }
      }
    }

    // Roadblocks at three stars and above.
    this.roadblockTimer -= dt;
    if (cfg.roadblocks && this.roadblockTimer <= 0 && this.roadblocks.length < 2) {
      this.roadblockTimer = 12;
      this.spawnRoadblock(player);
    }
    for (const block of this.roadblocks) {
      block.sirenActive = true;
      block.update(dt, this.city, particleSys, audio);
    }

    // Foot pursuit.
    for (const cop of this.footCops) {
      if (cop.isDead) continue;
      cop.hitFlash = Math.max(0, cop.hitFlash - dt * 3);
      const los = this.city.hasLineOfSight(cop.x, cop.y, player.x, player.y, 520);
      let targetX = player.x;
      let targetY = player.y;
      if (!los && this.lastKnown) {
        const dk = Math.hypot(this.lastKnown.x - cop.x, this.lastKnown.y - cop.y);
        if (dk < 55) {
          targetX = this.lastKnown.x + Math.cos(cop.searchPhase + this.cooldownTimer) * 80;
          targetY = this.lastKnown.y + Math.sin(cop.searchPhase + this.cooldownTimer) * 80;
        } else {
          targetX = this.lastKnown.x;
          targetY = this.lastKnown.y;
        }
      }
      const dx = targetX - cop.x;
      const dy = targetY - cop.y;
      const dist = Math.hypot(dx, dy);
      cop.angle = Math.atan2(dy, dx);
      if (dist > 44 && dist < 760) {
        const speed = cop.speed + this.wantedStars * 8;
        cop.vx = (dx / dist) * speed;
        cop.vy = (dy / dist) * speed;
      } else {
        cop.vx *= Math.exp(-10 * dt);
        cop.vy *= Math.exp(-10 * dt);
      }
      const nx = cop.x + cop.vx * dt;
      const ny = cop.y + cop.vy * dt;
      const hit = this.city.collideCircle(nx, ny, cop.radius);
      if (hit) {
        cop.x += hit.x;
        cop.y += hit.y;
      } else {
        cop.x = nx;
        cop.y = ny;
      }

      cop.fireTimer -= dt;
      if (cfg.enforcersFire && los && Math.hypot(player.x - cop.x, player.y - cop.y) < 360 && cop.fireTimer <= 0) {
        const shotAngle = cop.angle + (Math.random() - 0.5) * 0.12;
        game.combat.fireBullet(cop.x + Math.cos(shotAngle) * 16, cop.y + Math.sin(shotAngle) * 16, shotAngle, { speed: 1100, damage: 12, range: 380 }, 'cop');
        if (audio) audio.playGunshot('pistol', 0.5);
        if (particleSys) particleSys.spawnMuzzle(cop.x + Math.cos(shotAngle) * 16, cop.y + Math.sin(shotAngle) * 16, shotAngle, 6);
        cop.fireTimer = 1.5 + Math.random() * 0.8;
      }
    }
    this.footCops = this.footCops.filter((f) => !f.isDead || Math.hypot(f.x - player.x, f.y - player.y) < 1400);

    // Busted meter: slow player, officer close, line of sight.
    const playerSpeed = player.isInVehicle
      ? Math.hypot(player.vehicle.vx, player.vehicle.vy)
      : Math.hypot(player.vx, player.vy);
    let closeCop = false;
    for (const c of this.cops) {
      if (Math.hypot(c.x - player.x, c.y - player.y) < 78) { closeCop = true; break; }
    }
    if (!closeCop) {
      for (const f of this.footCops) {
        if (!f.isDead && Math.hypot(f.x - player.x, f.y - player.y) < 62) { closeCop = true; break; }
      }
    }
    const slow = playerSpeed < 30;
    if (closeCop && slow && this.wantedStars > 0) {
      this.bustedProgress += dt;
      if (this.bustedProgress > 1.25 && !game.bustedTriggered) {
        game.onBusted();
      }
    } else {
      this.bustedProgress = Math.max(0, this.bustedProgress - dt * 1.6);
    }
  }

  pursue(cop, player, dt, particles, audio, game, sight = true) {
    let targetX = player.x;
    let targetY = player.y;
    if (!sight) {
      // Search the last known position, then sweep the surrounding blocks.
      if (!this.lastKnown) {
        cop.steer((cop.searchPhase ? Math.sin(this.flash + cop.searchPhase) : 0) * 0.6);
        cop.accelerate(0.35, dt);
        return;
      }
      const lk = this.lastKnown;
      const d = Math.hypot(lk.x - cop.x, lk.y - cop.y);
      if (d < 110) {
        if (!cop.searchPhase) cop.searchPhase = Math.random() * Math.PI * 2;
        const sweep = cop.searchPhase + this.cooldownTimer * 0.35;
        targetX = lk.x + Math.cos(sweep) * 190;
        targetY = lk.y + Math.sin(sweep) * 190;
      } else {
        targetX = lk.x;
        targetY = lk.y;
      }
    }
    const dx = targetX - cop.x;
    const dy = targetY - cop.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 1300) {
      cop.steer(0);
      cop.accelerate(0.5, dt);
      return;
    }
    const lead = sight && player.isInVehicle ? 0.28 : 0.1;
    const aimX = sight ? player.x + (player.vx || 0) * lead : targetX;
    const aimY = sight ? player.y + (player.vy || 0) * lead : targetY;
    const desired = Math.atan2(aimY - cop.y, aimX - cop.x);
    let diff = desired - cop.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    cop.steer(Math.max(-1, Math.min(1, diff * 2.5)));

    if (dist > 120) {
      cop.accelerate(sight && this.wantedStars >= 4 ? 1 : 0.72, dt);
    } else {
      cop.brake(1, dt);
      cop.accelerate(0.2, dt);
    }
    if (sight && player.isInVehicle && dist < 60) {
      cop.accelerate(1, dt);
      player.vehicle.takeDamage((this.wantedStars >= 3 ? 26 : 12) * dt, particles, audio);
      game.camera.shake = Math.max(game.camera.shake, 0.18);
    }

    // Enforcers shooting from the cruiser at two stars and up.
    const cfg = WANTED_CONFIG.levels[this.wantedStars];
    if (sight && cfg.enforcersFire && dist < 400 && this.city.hasLineOfSight(cop.x, cop.y, player.x, player.y, 400)) {
      cop.fireTimer = (cop.fireTimer || 0) - dt;
      if (cop.fireTimer <= 0) {
        cop.fireTimer = 1.2 + Math.random() * 0.9;
        const shotAngle = Math.atan2(player.y - cop.y, player.x - cop.x) + (Math.random() - 0.5) * 0.1;
        game.combat.fireBullet(cop.x + Math.cos(shotAngle) * 30, cop.y + Math.sin(shotAngle) * 30, shotAngle, { speed: 1150, damage: 11, range: 420 }, 'cop');
        if (audio) audio.playGunshot('smg', 0.45);
        if (particles) particles.spawnMuzzle(cop.x + Math.cos(shotAngle) * 30, cop.y + Math.sin(shotAngle) * 30, shotAngle, 7);
      }
    }
  }

  spawnCruiser(player) {
    let point = this.city.randomRoadPoint(player.x, player.y, 480, 820, this.rng);
    if (Math.hypot(point.x - player.x, point.y - player.y) < 360) {
      point = this.city.randomRoadPoint(player.x, player.y, 360, 1000, this.rng);
    }
    const cop = new Vehicle('patrol', point.x, point.y, point.angle + Math.PI);
    cop.sirenActive = true;
    cop.aiMode = 'police';
    cop.cruiseSpeed = 300;
    cop.driver = { isCop: true };
    cop.searchPhase = this.rng() * Math.PI * 2;
    this.cops.push(cop);
    this.lastKnown = { x: player.x, y: player.y };
    return cop;
  }

  spawnFootCop(player) {
    const point = this.city.sidewalkPoint(player.x, player.y, 620, this.rng);
    if (Math.hypot(point.x - player.x, point.y - player.y) < 180) {
      point.x += 140;
      point.y += 80;
    }
    const cop = new FootCop(point.x, point.y);
    this.footCops.push(cop);
    return cop;
  }

  spawnRoadblock(player) {
    const speed = Math.hypot(player.vx, player.vy);
    const a = player.isInVehicle ? player.vehicle.angle : Math.atan2(player.vy, player.vx);
    const dist = 460;
    const x = player.x + Math.cos(a) * dist;
    const y = player.y + Math.sin(a) * dist;
    if (x < 80 || x > 2650 || y < 80 || y > 3150) return;
    if (this.city.pointBlocked(x, y, 60)) return;
    const perp = a + Math.PI / 2;
    for (let i = -1; i <= 1; i += 2) {
      const bx = x + Math.cos(perp) * 38 * i;
      const by = y + Math.sin(perp) * 38 * i;
      const car = new Vehicle('patrol', bx, by, perp);
      car.sirenActive = true;
      car.aiMode = 'roadblock';
      car.driver = { isCop: true };
      this.roadblocks.push(car);
    }
    this.roadblocks = this.roadblocks.slice(-4);
    this.lastKnown = { x, y };
  }
}
