// Leonida Heat - gunplay, enemy AI and vehicle violence.
// Bullets are simulated with swept segments so fast rifle rounds cannot skip
// through a wall or a body. Enemies patrol, chase, shoot, take cover when hurt
// and drop cash. Pedestrians are updated here too so reactions stay together.

import { WEAPON_CONFIG } from './config.js';
import { Pedestrian } from './entities.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export class Enemy {
  constructor(x, y, weaponType = 'pistol', isBoss = false) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.angle = 0;
    this.weapon = WEAPON_CONFIG[weaponType] || WEAPON_CONFIG.pistol;
    this.health = isBoss ? 260 : 70;
    this.maxHealth = this.health;
    this.isBoss = isBoss;
    this.isDead = false;
    this.deathTimer = 0;
    this.hitFlash = 0;
    this.fireTimer = 0.5 + Math.random();
    this.state = 'patrol';
    this.stateTimer = 0;
    this.radius = 14;
    this.moveSpeed = isBoss ? 150 : 118;
    this.color = isBoss ? '#e8b04a' : '#c9463f';
    this.coverPoint = null;
    this.coverTimer = 0;
    this.lastSeen = null;
    this.reaction = 0.25 + Math.random() * 0.35;
    this.aimJitter = 0.06 + Math.random() * 0.1;
  }

  takeDamage(amount, particles, audio) {
    if (this.isDead) return;
    this.health -= amount;
    this.hitFlash = 1;
    if (particles) particles.spawnBlood(this.x, this.y, 4);
    if (this.health <= 0) {
      this.isDead = true;
      this.state = 'dead';
      this.vx = 0;
      this.vy = 0;
      if (particles) particles.spawnCash(this.x, this.y, this.isBoss ? 600 : 70 + Math.floor(Math.random() * 60));
      if (audio) audio.playBodyFall();
    } else if (this.health < this.maxHealth * 0.5 && this.state !== 'cover') {
      this.state = 'cover';
      this.coverTimer = 1.4 + Math.random();
      this.coverPoint = null;
    }
  }

  findCover(city) {
    let best = null;
    let bestDist = 260;
    for (const col of city.getColliders(this.x, this.y, 230)) {
      if (col.type !== 'building') continue;
      const dx = this.x - col.x;
      const dy = this.y - col.y;
      const d = Math.hypot(dx, dy);
      if (d < bestDist) {
        bestDist = d;
        best = {
          x: col.x + Math.sign(dx || 1) * (col.w / 2 + 24),
          y: col.y + Math.sign(dy || 1) * (col.h / 2 + 24),
        };
      }
    }
    return best;
  }

  update(dt, player, city, particles, audio, combat) {
    if (this.isDead) {
      this.deathTimer += dt;
      return;
    }
    this.hitFlash = Math.max(0, this.hitFlash - dt * 3);
    this.fireTimer -= dt;
    this.stateTimer -= dt;

    const dx = player.x - this.x;
    const dy = player.y - this.y;
    const dist = Math.hypot(dx, dy);
    const los = city.hasLineOfSight(this.x, this.y, player.x, player.y, 620);
    if (los) this.lastSeen = { x: player.x, y: player.y };
    this.angle = Math.atan2(dy, dx);

    let targetX = player.x;
    let targetY = player.y;
    let move = 0;

    if (this.coverTimer > 0) {
      this.coverTimer -= dt;
      if (!this.coverPoint) this.coverPoint = this.findCover(city);
      if (this.coverPoint) {
        targetX = this.coverPoint.x;
        targetY = this.coverPoint.y;
        move = 1;
        if (Math.hypot(targetX - this.x, targetY - this.y) < 14) move = 0;
      }
      this.state = 'cover';
      if (this.coverTimer <= 0) this.state = 'combat';
    } else if ((los && dist < 560) || (this.lastSeen && dist < 620)) {
      this.state = 'combat';
      if (los) {
        if (dist > 235) move = 1;
        else if (dist < 120) move = -0.8;
        else {
          // Strafe while firing.
          targetX = player.x + Math.cos(this.angle + Math.PI / 2) * 60;
          targetY = player.y + Math.sin(this.angle + Math.PI / 2) * 60;
          move = 0.35;
        }
      } else if (this.lastSeen) {
        targetX = this.lastSeen.x;
        targetY = this.lastSeen.y;
        move = 1;
        if (Math.hypot(targetX - this.x, targetY - this.y) < 20) this.lastSeen = null;
      }

      if (los && dist < this.weapon.range * 0.95 && this.fireTimer <= 0) {
        // Reaction pause, then a burst with a little jitter.
        if (this.reaction <= 0) {
          const shots = this.isBoss ? 3 : 1;
          for (let i = 0; i < shots; i += 1) {
            const spread = (Math.random() - 0.5) * this.aimJitter * 2;
            const a = this.angle + spread;
            const muzzleX = this.x + Math.cos(a) * 20;
            const muzzleY = this.y + Math.sin(a) * 20;
            combat.fireBullet(muzzleX, muzzleY, a, this.weapon, 'enemy');
            if (audio) audio.playGunshot(this.weapon.sound, 0.55);
            if (particles) particles.spawnMuzzle(muzzleX, muzzleY, a, 7);
          }
          this.fireTimer = Math.max(0.32, this.weapon.fireRate * (this.isBoss ? 1.1 : 2.4));
          this.reaction = 0.15 + Math.random() * 0.4;
        } else {
          this.reaction -= dt;
        }
      }
    } else {
      this.state = 'patrol';
      if (this.stateTimer <= 0) {
        this.stateTimer = 2 + Math.random() * 3;
        this.angle += (Math.random() - 0.5) * 1.4;
      }
      targetX = this.x + Math.cos(this.angle) * 60;
      targetY = this.y + Math.sin(this.angle) * 60;
      move = 0.35;
    }

    if (move !== 0) {
      const mdx = targetX - this.x;
      const mdy = targetY - this.y;
      const md = Math.hypot(mdx, mdy) || 1;
      this.vx = (mdx / md) * this.moveSpeed * move;
      this.vy = (mdy / md) * this.moveSpeed * move;
    } else {
      this.vx *= Math.exp(-10 * dt);
      this.vy *= Math.exp(-10 * dt);
    }

    const nx = this.x + this.vx * dt;
    const ny = this.y + this.vy * dt;
    const hit = city.collideCircle(nx, ny, this.radius);
    if (hit) {
      this.x += hit.x;
      this.y += hit.y;
    } else {
      this.x = nx;
      this.y = ny;
    }
  }
}

export class CombatManager {
  constructor(city) {
    this.city = city;
    this.enemies = [];
    this.pedestrians = [];
    this.bullets = [];
    this.populationTimer = 0;
    this.pedSpawnRng = Math.random;
  }

  setPedestrianRng(rng) {
    this.pedSpawnRng = rng;
  }

  spawnPedestrianAt(x, y, extra = {}) {
    const rng = this.pedSpawnRng;
    const ped = new Pedestrian(x, y, rng, extra.lane || null);
    Object.assign(ped, extra);
    this.pedestrians.push(ped);
    return ped;
  }

  populate(centerX, centerY, count, radius = 900) {
    for (let i = 0; i < count; i += 1) {
      const p = this.city.sidewalkPoint(centerX, centerY, radius, this.pedSpawnRng);
      const lane = {
        road: p.road,
        side: p.road.horizontal ? Math.sign(p.y - p.road.y1) : -Math.sign(p.x - p.road.x1),
        dir: p.road.horizontal ? p.road.dirX : p.road.dirY,
        angle: p.angle,
      };
      this.spawnPedestrianAt(p.x, p.y, { lane });
    }
  }

  fireBullet(x, y, angle, weapon, owner) {
    const speed = weapon.speed || 1200;
    this.bullets.push({
      x, y, px: x, py: y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      angle,
      speed,
      weapon,
      owner,
      travelled: 0,
      range: weapon.range,
      damage: weapon.damage,
      life: 1.4,
    });
  }

  handlePlayerAttack(player, input, police, particles, audio, game) {
    if (player.isReloading || player.isRolling || player.hotwire) return;
    if (player.fireCooldown > 0) return;
    const w = player.weapon;
    player.fireCooldown = w.fireRate;

    if (w.id === 'fists') {
      if (audio) audio.playPunch();
      const reach = w.range;
      const px = player.x + Math.cos(player.angle) * reach;
      const py = player.y + Math.sin(player.angle) * reach;
      let hitSomething = false;
      for (const ped of this.pedestrians) {
        if (!ped.isDead && Math.hypot(px - ped.x, py - ped.y) < 28) {
          ped.takeDamage(w.damage, particles, audio, player.angle);
          hitSomething = true;
          game.onCrime('assault', 1);
          break;
        }
      }
      if (!hitSomething) {
        for (const enemy of this.enemies) {
          if (!enemy.isDead && Math.hypot(px - enemy.x, py - enemy.y) < 34) {
            enemy.takeDamage(w.damage, particles, audio);
            enemy.vx += Math.cos(player.angle) * 90;
            enemy.vy += Math.sin(player.angle) * 90;
            hitSomething = true;
            break;
          }
        }
      }
      if (!hitSomething) {
        for (const cop of police.footCops) {
          if (!cop.isDead && Math.hypot(px - cop.x, py - cop.y) < 30) {
            cop.takeDamage(w.damage, particles, audio);
            game.onCrime('cop', 2);
            break;
          }
        }
      }
      particles.spawnSparks(px, py, 2, 0.3);
      game.camera.shake = Math.max(game.camera.shake, 0.12);
      return;
    }

    const mag = player.ammo[w.id];
    if (!mag || mag.clip <= 0) {
      player.reload(audio);
      return;
    }
    mag.clip -= 1;
    const pellets = w.pellets || 1;
    for (let p = 0; p < pellets; p += 1) {
      const spread = (Math.random() - 0.5) * w.spread;
      const a = player.angle + spread;
      const muzzleX = player.x + Math.cos(player.angle) * 26;
      const muzzleY = player.y + Math.sin(player.angle) * 26;
      this.fireBullet(muzzleX, muzzleY, a, w, 'player');
    }
    particles.spawnMuzzle(player.x + Math.cos(player.angle) * 26, player.y + Math.sin(player.angle) * 26, player.angle, w.id === 'shotgun' ? 14 : 9);
    particles.spawnShell(player.x, player.y, player.angle);
    if (audio) audio.playGunshot(w.sound, 1);
    player.muzzleTimer = 0.06;
    game.camera.shake = Math.max(game.camera.shake, w.id === 'shotgun' ? 0.5 : 0.18);
    game.notifyGunfire(player.x, player.y);

    if (player.vehicle) {
      player.vx -= Math.cos(player.angle) * w.recoil * 5;
      player.vy -= Math.sin(player.angle) * w.recoil * 5;
    }
    if (mag.clip === 0 && mag.reserve > 0) player.reload(audio);
  }

  update(dt, player, traffic, police, particles, audio, game) {
    // Enemies.
    for (let i = this.enemies.length - 1; i >= 0; i -= 1) {
      const e = this.enemies[i];
      e.update(dt, player, this.city, particles, audio, this);
      if (e.isDead && e.deathTimer > 30) this.enemies.splice(i, 1);
    }

    // Pedestrian ambient population.
    this.populationTimer -= dt;
    if (this.populationTimer <= 0 && !game.shotFrozen) {
      this.populationTimer = 1.6;
      const alive = this.pedestrians.filter((p) => !p.isDead).length;
      if (alive < 44) {
        const p = this.city.sidewalkPoint(player.x, player.y, 850, this.pedSpawnRng);
        const lane = {
          road: p.road,
          side: p.road.horizontal ? Math.sign(p.y - p.road.y1) : -Math.sign(p.x - p.road.x1),
          dir: p.road.horizontal ? p.road.dirX : p.road.dirY,
          angle: p.angle,
        };
        this.spawnPedestrianAt(p.x, p.y, { lane });
      }
      // Remove far-away dead pedestrians.
      for (let i = this.pedestrians.length - 1; i >= 0; i -= 1) {
        const p = this.pedestrians[i];
        if (p.isDead && Math.hypot(p.x - player.x, p.y - player.y) > 1000) this.pedestrians.splice(i, 1);
      }
    }

    for (const p of this.pedestrians) {
      p.update(dt, this.city, particles);
    }

    // Pedestrians notice a car bearing down on them and scatter.
    if (this.populationTimer > 1.49) {
      for (const v of game.allVehicles()) {
        const speed = Math.hypot(v.vx, v.vy);
        if (speed < 210 || v.isDestroyed) continue;
        const fx = Math.cos(v.angle);
        const fy = Math.sin(v.angle);
        for (const p of this.pedestrians) {
          if (p.isDead || p.state === 'flee') continue;
          const dx = p.x - v.x;
          const dy = p.y - v.y;
          const ahead = dx * fx + dy * fy;
          const side = Math.abs(-dx * fy + dy * fx);
          if (ahead > 0 && ahead < 150 && side < 45) {
            p.fleeFrom(v.x, v.y);
            particles.spawnFootstep(p.x, p.y);
          }
        }
      }
    }

    // Bullets: move in short substeps, then resolve the first hit.
    for (let i = this.bullets.length - 1; i >= 0; i -= 1) {
      const b = this.bullets[i];
      b.px = b.x;
      b.py = b.y;
      const travel = b.speed * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.travelled += travel;
      b.life -= dt;
      if (b.travelled > b.range || b.life <= 0 || b.x < 0 || b.x > this.city.width || b.y < 0 || b.y > this.city.height) {
        this.bullets.splice(i, 1);
        continue;
      }

      let consumed = false;
      const wallHit = this.city.raycast(b.px, b.py, b.x, b.y, 10);
      if (wallHit && wallHit.hitType === 'building') {
        particles.spawnSparks(wallHit.x, wallHit.y, 5);
        if (audio) audio.playImpact();
        this.bullets.splice(i, 1);
        continue;
      }

      const falloff = clamp(1 - (b.travelled / b.range) * 0.42, 0.56, 1);
      const dmg = b.damage * falloff;

      if (b.owner === 'player') {
        for (const e of this.enemies) {
          if (e.isDead) continue;
          if (segmentHitsCircle(b.px, b.py, b.x, b.y, e.x, e.y, e.radius + 5)) {
            e.takeDamage(dmg, particles, audio);
            particles.spawnSparks(b.x, b.y, 3, 0.5);
            consumed = true;
            break;
          }
        }
        if (!consumed) {
          for (const p of this.pedestrians) {
            if (p.isDead) continue;
            if (segmentHitsCircle(b.px, b.py, b.x, b.y, p.x, p.y, p.radius + 4)) {
              p.takeDamage(dmg, particles, audio, b.angle);
              game.onCrime('assault', 1);
              consumed = true;
              break;
            }
          }
        }
        if (!consumed) {
          for (const cop of police.footCops) {
            if (cop.isDead) continue;
            if (segmentHitsCircle(b.px, b.py, b.x, b.y, cop.x, cop.y, 13)) {
              cop.takeDamage(dmg, particles, audio);
              game.onCrime('cop', 2);
              consumed = true;
              break;
            }
          }
        }
      } else {
        if (!player.isInVehicle && segmentHitsCircle(b.px, b.py, b.x, b.y, player.x, player.y, player.radius + 5)) {
          player.takeDamage(dmg, particles, audio, b.angle);
          game.onPlayerHurt();
          consumed = true;
        } else if (player.isInVehicle && segmentHitsCircle(b.px, b.py, b.x, b.y, player.vehicle.x, player.vehicle.y, 22)) {
          player.vehicle.takeDamage(dmg * 0.75, particles, audio);
          if (Math.random() < 0.3) player.takeDamage(dmg * 0.18, particles, audio, b.angle);
          game.onPlayerHurt();
          consumed = true;
        }
        if (!consumed) {
          for (const p of this.pedestrians) {
            if (p.isDead) continue;
            if (segmentHitsCircle(b.px, b.py, b.x, b.y, p.x, p.y, p.radius + 4)) {
              p.takeDamage(dmg, particles, audio, b.angle);
              consumed = true;
              break;
            }
          }
        }
      }

      if (!consumed) {
        const vehicles = game.allVehicles();
        for (const v of vehicles) {
          if (v.isDestroyed || v === player.vehicle) continue;
          const r = Math.max(v.width, v.length) * 0.4;
          if (segmentHitsCircle(b.px, b.py, b.x, b.y, v.x, v.y, r)) {
            v.takeDamage(dmg * 1.1, particles, audio);
            particles.spawnSparks(b.x, b.y, 5);
            if (b.owner === 'player') game.onCrime('gunfire', 1);
            consumed = true;
            break;
          }
        }
      }

      if (consumed) this.bullets.splice(i, 1);
    }

    // Player car running people over, plus any fast traffic doing the same.
    for (const v of game.allVehicles()) {
      const speed = Math.hypot(v.vx, v.vy);
      if (speed < 150 || v.isDestroyed) continue;
      const isPlayer = v === player.vehicle;
      for (const p of this.pedestrians) {
        if (p.isDead) continue;
        if (Math.hypot(v.x - p.x, v.y - p.y) < Math.max(v.width, v.length) * 0.52) {
          p.takeDamage(120, particles, audio, Math.atan2(v.vy, v.vx));
          p.fleeFrom(v.x, v.y);
          if (isPlayer) {
            game.onCrime('vehicular', 2);
            game.camera.shake = Math.max(game.camera.shake, 0.35);
          }
        }
      }
    }

    // Explosion shockwaves damage everyone nearby once.
    for (const boom of particles.drainExplosions()) {
      game.camera.shake = Math.max(game.camera.shake, 0.9);
      for (const e of this.enemies) {
        if (!e.isDead && Math.hypot(e.x - boom.x, e.y - boom.y) < boom.radius) e.takeDamage(boom.damage, particles, audio);
      }
      for (const p of this.pedestrians) {
        if (!p.isDead && Math.hypot(p.x - boom.x, p.y - boom.y) < boom.radius) p.takeDamage(110, particles, audio);
      }
      if (Math.hypot(player.x - boom.x, player.y - boom.y) < boom.radius) {
        player.takeDamage(boom.damage * 0.8, particles, audio);
        game.onPlayerHurt();
      }
      for (const v of game.allVehicles()) {
        if (!v.isDestroyed && v !== player.vehicle && Math.hypot(v.x - boom.x, v.y - boom.y) < boom.radius) {
          v.takeDamage(boom.damage * 1.3, particles, audio);
        }
      }
    }

    // Remove far dead enemies from mission lists only when safe; missions keep
    // their own references and only test isDead, so this is cosmetic culling.
    if (this.pedestrians.length > 80) this.pedestrians.splice(0, this.pedestrians.length - 80);
  }
}

function segmentHitsCircle(x1, y1, x2, y2, cx, cy, r) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const fx = x1 - cx;
  const fy = y1 - cy;
  const a = dx * dx + dy * dy;
  if (a === 0) return fx * fx + fy * fy <= r * r;
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - r * r;
  let disc = b * b - 4 * a * c;
  if (disc < 0) return false;
  disc = Math.sqrt(disc);
  const t1 = (-b - disc) / (2 * a);
  const t2 = (-b + disc) / (2 * a);
  return (t1 >= 0 && t1 <= 1) || (t2 >= 0 && t2 <= 1);
}
