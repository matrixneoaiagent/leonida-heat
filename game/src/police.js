// Leonida Heat v3 - the heat ladder.
// Cruisers chase by sight and try to pit the player; foot officers deploy,
// sweep a search grid and use cover; roadblocks appear at three stars. Losing
// line of sight starts a search and a slow cool-down that drops one star at a
// time. Standing still while an officer closes in fills the busted meter.

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
    this.facing = 0;
    this.health = 68;
    this.maxHealth = 68;
    this.isDead = false;
    this.fireTimer = 0.8 + Math.random();
    this.hitFlash = 0;
    this.radius = 13;
    this.speed = 160;
    this.isCop = true;
    this.searchPhase = Math.random() * Math.PI * 2;
    this.state = 'chase';
    this.walkPhase = Math.random() * Math.PI * 2;
    this.moving = false;
    this.aimTimer = 0;
    this.coverTimer = 0;
    this.coverPoint = null;
    this.crouched = false;
    this.name = 'Patrol Officer';
    this.lastSeen = null;
  }

  takeDamage(amount, particles, audio) {
    if (this.isDead) return;
    this.health -= amount;
    this.hitFlash = 1;
    if (particles) particles.spawnHit(this.x, this.y, 4);
    if (this.health <= 0) {
      this.isDead = true;
      this.vx = 0;
      this.vy = 0;
      if (particles) particles.spawnCash(this.x, this.y, 70 + Math.floor(Math.random() * 70));
      if (audio) audio.playBodyFall();
    } else if (this.health < this.maxHealth * 0.5) {
      this.state = 'cover';
      this.coverTimer = 1.6;
      this.coverPoint = null;
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
    this.evasion = 0;
    this.searchCenter = null;
    this.searchRadius = 0;
    this.alertPulse = 0;
    this.response = 'CLEAR';
    this.spawnedThisResponse = 0;
    this.sirensUp = false;
    this.pursuitTime = 0;
  }

  get level() {
    return WANTED_CONFIG.levels[this.wantedStars] || WANTED_CONFIG.levels[0];
  }

  setWanted(stars) {
    const next = Math.max(0, Math.min(5, Math.round(stars)));
    const previous = this.wantedStars;
    if (next > previous) {
      this.cooldownTimer = WANTED_CONFIG.cooldownTime;
      this.searching = false;
      this.dispatchTimer = Math.min(this.dispatchTimer, 1.2);
      this.footDispatchTimer = Math.min(this.footDispatchTimer, 2);
      this.alertPulse = 1;
      this.response = WANTED_CONFIG.levels[next].response;
      this.pursuitTime = 0;
    }
    this.wantedStars = next;
    if (next === 0) this.clearWanted();
    if (next > previous) this.flash = 1;
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
    this.evasion = 0;
    this.lastKnown = null;
    this.response = 'CLEAR';
    this.sirensUp = false;
    for (const c of this.cops) c.sirenActive = false;
    for (const c of this.roadblocks) c.sirenActive = false;
  }

  witnessedCarjack(x, y) {
    for (const c of this.cops) {
      if (Math.hypot(c.x - x, c.y - y) < 470 && this.city.seesPoint(c.x, c.y, c.angle, x, y, 470, 1.25)) return true;
    }
    for (const f of this.footCops) {
      if (!f.isDead && Math.hypot(f.x - x, f.y - y) < 370 && this.city.seesPoint(f.x, f.y, f.angle, x, y, 370, 1.25)) return true;
    }
    return false;
  }

  officerCanSee(unit, player, radius, cone = 1.2) {
    return this.city.seesPoint(unit.x, unit.y, unit.angle, player.x, player.y, radius, cone);
  }

  update(dt, player, particleSys, audio, game) {
    this.flash = Math.max(0, this.flash - dt);
    this.alertPulse = Math.max(0, this.alertPulse - dt);
    if (this.wantedStars <= 0) {
      this.bustedProgress = Math.max(0, this.bustedProgress - dt * 3);
      for (let i = this.cops.length - 1; i >= 0; i -= 1) {
        const c = this.cops[i];
        c.sirenActive = false;
        c.update(dt, this.city, particleSys, audio, { wetness: game?.weather?.wetness || 0 });
        if (Math.hypot(c.x - player.x, c.y - player.y) > 1100) this.cops.splice(i, 1);
      }
      this.footCops = this.footCops.filter((f) => !f.isDead || Math.hypot(f.x - player.x, f.y - player.y) < 1200);
      for (const b of this.roadblocks) b.update(dt, this.city, particleSys, audio);
      this.roadblocks = this.roadblocks.filter((b) => Math.hypot(b.x - player.x, b.y - player.y) < 1300);
      if (audio) audio.setPoliceSiren(false, 0);
      this.sirensUp = false;
      return;
    }

    const cfg = this.level;
    this.pursuitTime += dt;

    let sight = false;
    let nearestDist = Infinity;
    for (const c of this.cops) {
      const d = Math.hypot(c.x - player.x, c.y - player.y);
      nearestDist = Math.min(nearestDist, d);
      if (this.officerCanSee(c, player, 760, 1.35)) {
        sight = true;
        break;
      }
    }
    if (!sight) {
      for (const f of this.footCops) {
        if (f.isDead) continue;
        const d = Math.hypot(f.x - player.x, f.y - player.y);
        nearestDist = Math.min(nearestDist, d);
        if (this.officerCanSee(f, player, 560, 1.25)) {
          sight = true;
          break;
        }
      }
    }
    this.hasSight = sight;
    if (sight) {
      this.lastKnown = { x: player.x, y: player.y };
      this.searching = false;
      this.evasion = 0;
      this.cooldownTimer = WANTED_CONFIG.cooldownTime;
      this.searchCenter = { x: player.x, y: player.y };
      this.searchRadius = 130;
    } else {
      this.searching = true;
      const hiddenBonus = nearestDist > 700 ? 2.2 : nearestDist > 420 ? 1.35 : 1;
      this.evasion = Math.min(1, this.evasion + dt * 0.08);
      this.cooldownTimer -= dt * hiddenBonus;
      if (this.cooldownTimer <= 0) {
        const next = this.wantedStars - 1;
        this.wantedStars = next;
        this.cooldownTimer = WANTED_CONFIG.perStarDecay;
        this.searchRadius = Math.max(90, this.searchRadius - 60);
        if (game?.ui) {
          game.ui.showToast(
            next === 0 ? 'Heat cleared. Keep your head down.' : `Search is cooling - ${next} star${next === 1 ? '' : 's'} left.`,
            next === 0 ? 'success' : 'neutral',
            2.8,
          );
        }
        if (next === 0) {
          this.clearWanted();
          return;
        }
        this.response = WANTED_CONFIG.levels[next].response;
      }
    }

    this.sirensUp = this.wantedStars > 0;
    if (audio) audio.setPoliceSiren(true, this.wantedStars);
    if (this.wantedStars >= 2 && sight) this.bustedArmed = true;

    this.dispatchTimer -= dt;
    const liveCops = this.cops.filter((c) => !c.isDestroyed).length;
    if (this.dispatchTimer <= 0 && liveCops < cfg.maxCops) {
      this.dispatchTimer = cfg.dispatchInterval;
      this.spawnCruiser(player);
    }

    this.footDispatchTimer -= dt;
    const liveFoot = this.footCops.filter((f) => !f.isDead).length;
    if (this.footDispatchTimer <= 0 && liveFoot < cfg.maxFoot) {
      this.footDispatchTimer = this.wantedStars >= 4 ? 4.5 : 7;
      this.deployTimer += 1;
      if (!player.isInVehicle || this.deployTimer % 2 === 0) this.spawnFootCop(player);
    }

    for (let i = this.cops.length - 1; i >= 0; i -= 1) {
      const cop = this.cops[i];
      if (cop.isDestroyed) {
        this.cops.splice(i, 1);
        continue;
      }
      cop.sirenActive = true;
      this.pursue(cop, player, dt, particleSys, audio, game, sight);
      cop.update(dt, this.city, particleSys, audio, { wetness: game?.weather?.wetness || 0 });
      if (Math.hypot(cop.x - player.x, cop.y - player.y) > 1950) this.cops.splice(i, 1);
      if (sight && player.isInVehicle && player.vehicle && Math.hypot(cop.x - player.x, cop.y - player.y) < 76) {
        const impact = Math.hypot(cop.vx - player.vehicle.vx, cop.vy - player.vehicle.vy);
        if (impact > 175) {
          player.vehicle.takeDamage(impact * 0.022, particleSys, audio);
          game.camera.shake = Math.max(game.camera.shake, 0.5);
        }
      }
    }

    this.roadblockTimer -= dt;
    if (cfg.roadblocks && this.roadblockTimer <= 0 && this.roadblocks.filter((b) => !b.isDestroyed).length < 4) {
      this.roadblockTimer = this.wantedStars >= 4 ? 9 : 13;
      this.spawnRoadblock(player);
    }
    for (const block of this.roadblocks) {
      block.sirenActive = true;
      block.update(dt, this.city, particleSys, audio);
    }
    this.roadblocks = this.roadblocks.filter((b) => Math.hypot(b.x - player.x, b.y - player.y) < 1600);

    this.updateFootCops(dt, player, sight, game, particleSys, audio, cfg);
    this.updateBusted(dt, player, game);
  }

  updateFootCops(dt, player, sight, game, particles, audio, cfg) {
    for (const cop of this.footCops) {
      if (cop.isDead) continue;
      cop.hitFlash = Math.max(0, cop.hitFlash - dt * 3);
      const dist = Math.hypot(player.x - cop.x, player.y - cop.y);
      const los = this.city.hasLineOfSight(cop.x, cop.y, player.x, player.y, 560);

      if (cop.state === 'cover' && cop.coverTimer > 0) {
        cop.coverTimer -= dt;
        if (!cop.coverPoint) cop.coverPoint = this.findCover(cop, player);
        if (cop.coverPoint) {
          const dx = cop.coverPoint.x - cop.x;
          const dy = cop.coverPoint.y - cop.y;
          const d = Math.hypot(dx, dy);
          if (d > 12) {
            cop.vx = (dx / d) * cop.speed * 0.9;
            cop.vy = (dy / d) * cop.speed * 0.9;
            cop.moving = true;
            cop.walkPhase += dt * 11;
          } else {
            cop.vx = 0;
            cop.vy = 0;
            cop.moving = false;
            cop.crouched = true;
          }
        }
        if (cop.coverTimer <= 0) {
          cop.state = 'chase';
          cop.crouched = false;
          cop.coverPoint = null;
        }
      } else {
        let targetX = player.x;
        let targetY = player.y;
        if (!los && this.lastKnown) {
          const dk = Math.hypot(this.lastKnown.x - cop.x, this.lastKnown.y - cop.y);
          if (dk < 52) {
            targetX = this.lastKnown.x + Math.cos(cop.searchPhase + this.cooldownTimer * 0.4) * 95;
            targetY = this.lastKnown.y + Math.sin(cop.searchPhase + this.cooldownTimer * 0.4) * 95;
          } else {
            targetX = this.lastKnown.x;
            targetY = this.lastKnown.y;
          }
        }
        const dx = targetX - cop.x;
        const dy = targetY - cop.y;
        const d = Math.hypot(dx, dy);
        cop.angle = Math.atan2(dy, dx);
        cop.facing = cop.angle > -Math.PI / 4 && cop.angle <= Math.PI / 4 ? 3 : cop.angle > Math.PI / 4 && cop.angle <= (Math.PI * 3) / 4 ? 0 : cop.angle > -(Math.PI * 3) / 4 && cop.angle <= -Math.PI / 4 ? 2 : 1;
        if (d > 46 && d < 780) {
          const speed = cop.speed + this.wantedStars * 9;
          cop.vx = (dx / d) * speed;
          cop.vy = (dy / d) * speed;
          cop.moving = true;
          cop.walkPhase += dt * 11;
        } else {
          cop.vx *= Math.exp(-10 * dt);
          cop.vy *= Math.exp(-10 * dt);
          cop.moving = false;
        }
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
      const canShoot = cfg.enforcersFire && sight && los && dist < 390 && cop.fireTimer <= 0;
      if (canShoot) {
        const aim = Math.atan2(player.y - cop.y, player.x - cop.x);
        const spread = 0.06 + dist / 6000 + (player.isInVehicle ? 0.05 : 0);
        const shots = this.wantedStars >= 4 ? 2 : 1;
        for (let s = 0; s < shots; s += 1) {
          const a = aim + (Math.random() - 0.5) * spread * 2;
          game.combat.fireBullet(cop.x + Math.cos(a) * 17, cop.y + Math.sin(a) * 17, a, { speed: 1120, damage: 12, range: 390 }, 'cop');
          if (particles) particles.spawnMuzzle(cop.x + Math.cos(a) * 17, cop.y + Math.sin(a) * 17, a, 6);
        }
        if (audio) audio.playGunshot('pistol', 0.46);
        cop.fireTimer = 1.45 + Math.random() * 0.9;
      }
    }
    this.footCops = this.footCops.filter((f) => !f.isDead || Math.hypot(f.x - player.x, f.y - player.y) < 1400);
  }

  findCover(cop, player) {
    let best = null;
    let bestScore = -Infinity;
    for (const col of this.city.getColliders(cop.x, cop.y, 220)) {
      if (col.type !== 'building') continue;
      const corners = [
        { x: col.x + col.w / 2 + 20, y: col.y - col.h / 2 - 20 },
        { x: col.x - col.w / 2 - 20, y: col.y - col.h / 2 - 20 },
        { x: col.x + col.w / 2 + 20, y: col.y + col.h / 2 + 20 },
        { x: col.x - col.w / 2 - 20, y: col.y + col.h / 2 + 20 },
      ];
      for (const c of corners) {
        if (this.city.pointBlocked(c.x, c.y, 14)) continue;
        const d = Math.hypot(c.x - cop.x, c.y - cop.y);
        if (d > 260) continue;
        const hiding = this.city.hasLineOfSight(c.x, c.y, player.x, player.y, 500) ? -90 : 120;
        const score = hiding - d * 0.3;
        if (score > bestScore) {
          bestScore = score;
          best = c;
        }
      }
    }
    return best;
  }

  updateBusted(dt, player, game) {
    const playerSpeed = player.isInVehicle && player.vehicle
      ? Math.hypot(player.vehicle.vx, player.vehicle.vy)
      : Math.hypot(player.vx, player.vy);
    let closeCop = false;
    for (const c of this.cops) {
      if (Math.hypot(c.x - player.x, c.y - player.y) < 80) { closeCop = true; break; }
    }
    if (!closeCop) {
      for (const f of this.footCops) {
        if (!f.isDead && Math.hypot(f.x - player.x, f.y - player.y) < 66) { closeCop = true; break; }
      }
    }
    if (closeCop && playerSpeed < 32 && this.wantedStars > 0) {
      this.bustedProgress += dt;
      if (this.bustedProgress > WANTED_CONFIG.bustedTime && !game.bustedTriggered) game.onBusted();
    } else {
      this.bustedProgress = Math.max(0, this.bustedProgress - dt * 1.7);
    }
  }

  pursue(cop, player, dt, particles, audio, game, sight = true) {
    let targetX = player.x;
    let targetY = player.y;
    if (!sight) {
      if (!this.lastKnown) {
        cop.steer(Math.sin((this.flash + cop.odometer * 0.01) * 2) * 0.5);
        cop.accelerate(0.3, dt);
        return;
      }
      const lk = this.lastKnown;
      const d = Math.hypot(lk.x - cop.x, lk.y - cop.y);
      if (d < 115) {
        const sweep = (cop.searchPhase || 0) + this.cooldownTimer * 0.35;
        targetX = lk.x + Math.cos(sweep) * 205;
        targetY = lk.y + Math.sin(sweep) * 205;
      } else {
        targetX = lk.x;
        targetY = lk.y;
      }
    }
    const dx = targetX - cop.x;
    const dy = targetY - cop.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 1320) {
      cop.steer(0);
      cop.accelerate(0.55, dt);
      return;
    }
    const lead = sight && player.isInVehicle ? 0.28 : 0.1;
    const aimX = sight ? player.x + (player.vx || 0) * lead : targetX;
    const aimY = sight ? player.y + (player.vy || 0) * lead : targetY;
    const desired = Math.atan2(aimY - cop.y, aimX - cop.x);
    let diff = desired - cop.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    cop.steer(Math.max(-1, Math.min(1, diff * 2.7)));

    if (dist > 126) {
      cop.accelerate(sight && this.wantedStars >= 4 ? 1 : 0.78, dt);
    } else {
      cop.brake(1, dt);
      cop.accelerate(0.22, dt);
    }
    if (sight && player.isInVehicle && dist < 70) {
      cop.accelerate(1, dt);
      player.vehicle.takeDamage((this.wantedStars >= 3 ? 26 : 12) * dt, particles, audio);
      game.camera.shake = Math.max(game.camera.shake, 0.18);
    }

    const cfg = this.level;
    if (sight && cfg.enforcersFire && dist < 420 && this.city.hasLineOfSight(cop.x, cop.y, player.x, player.y, 420)) {
      cop.fireTimer = (cop.fireTimer || 0) - dt;
      if (cop.fireTimer <= 0) {
        cop.fireTimer = 1.1 + Math.random() * 0.9;
        const aim = Math.atan2(player.y - cop.y, player.x - cop.x);
        const shots = this.wantedStars >= 3 ? 3 : 2;
        for (let i = 0; i < shots; i += 1) {
          const a = aim + (Math.random() - 0.5) * 0.1;
          game.combat.fireBullet(cop.x + Math.cos(a) * 30, cop.y + Math.sin(a) * 30, a, { speed: 1160, damage: 11, range: 440 }, 'cop');
          if (particles) particles.spawnMuzzle(cop.x + Math.cos(a) * 30, cop.y + Math.sin(a) * 30, a, 7);
        }
        if (audio) audio.playGunshot('smg', 0.4);
      }
    }
  }

  spawnCruiser(player) {
    let point = this.city.randomRoadPoint(player.x, player.y, 500, 900, this.rng);
    if (Math.hypot(point.x - player.x, point.y - player.y) < 380) {
      point = this.city.randomRoadPoint(player.x, player.y, 380, 1050, this.rng);
    }
    const type = this.wantedStars >= 4 && this.rng() > 0.45 ? 'interceptor' : 'patrol';
    const cop = new Vehicle(type, point.x, point.y, point.angle + Math.PI);
    cop.sirenActive = true;
    cop.aiMode = 'police';
    cop.cruiseSpeed = 300;
    cop.driver = { isCop: true };
    cop.searchPhase = this.rng() * Math.PI * 2;
    this.cops.push(cop);
    this.lastKnown = { x: player.x, y: player.y };
    this.spawnedThisResponse += 1;
    return cop;
  }

  spawnFootCop(player) {
    const point = this.city.sidewalkPoint(player.x, player.y, 640, this.rng);
    if (Math.hypot(point.x - player.x, point.y - player.y) < 180) {
      point.x += 150;
      point.y += 85;
    }
    const cop = new FootCop(point.x, point.y);
    this.footCops.push(cop);
    return cop;
  }

  spawnRoadblock(player) {
    const a = player.isInVehicle && player.vehicle ? player.vehicle.angle : Math.atan2(player.vy, player.vx);
    const dist = 470;
    const x = player.x + Math.cos(a) * dist;
    const y = player.y + Math.sin(a) * dist;
    if (x < 80 || x > 2650 || y < 80 || y > 3150) return;
    if (this.city.pointBlocked(x, y, 60)) return;
    const perp = a + Math.PI / 2;
    const count = this.wantedStars >= 4 ? 3 : 2;
    for (let i = 0; i < count; i += 1) {
      const offset = (i - (count - 1) / 2) * 52;
      const bx = x + Math.cos(perp) * offset;
      const by = y + Math.sin(perp) * offset;
      const car = new Vehicle(this.wantedStars >= 4 && i === 0 ? 'interceptor' : 'patrol', bx, by, perp);
      car.sirenActive = true;
      car.aiMode = 'roadblock';
      car.driver = { isCop: true };
      this.roadblocks.push(car);
    }
    this.roadblocks = this.roadblocks.slice(-6);
    this.lastKnown = { x, y };
    this.alertPulse = 1;
  }

  searchCone(unit) {
    return {
      x: unit.x,
      y: unit.y,
      angle: unit.angle,
      radius: unit.isCop ? 240 : 190,
      spread: 0.55,
    };
  }

  reset() {
    this.cops = [];
    this.footCops = [];
    this.roadblocks = [];
    this.clearWanted();
  }
}

export { range };
