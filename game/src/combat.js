// Leonida Heat - violence, enemy crews and ballistic simulation.
// Rounds are swept segments, so a fast rifle shot cannot tunnel through a
// wall or a body. Enemies have archetypes, burst patterns, accuracy that
// falls off with range and movement, and a cover reflex. The player's
// shotgun fires a real pellet cone. Feedback is blood-free: hot hit flashes,
// sparks, dust and shell casings.

import { WEAPON_CONFIG, ENEMY_ARCHETYPES } from './config.js';
import { Pedestrian } from './entities.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

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

function archetypeFor(weaponType, isBoss) {
  if (isBoss) return ENEMY_ARCHETYPES.boss;
  if (weaponType === 'shotgun') return ENEMY_ARCHETYPES.shotgunner;
  if (weaponType === 'rifle') return ENEMY_ARCHETYPES.marksman;
  if (weaponType === 'smg') return ENEMY_ARCHETYPES.enforcer;
  return ENEMY_ARCHETYPES.street;
}

// =====================================================================
// Enemy
// =====================================================================
export class Enemy {
  constructor(x, y, weaponType = 'pistol', isBoss = false) {
    const archetype = archetypeFor(weaponType, isBoss);
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.angle = 0;
    this.weapon = WEAPON_CONFIG[weaponType] || WEAPON_CONFIG.pistol;
    this.archetype = archetype;
    this.health = isBoss ? 300 : archetype.health;
    this.maxHealth = this.health;
    this.isBoss = isBoss;
    this.isDead = false;
    this.deathTimer = 0;
    this.hitFlash = 0;
    this.fireTimer = 0.5 + Math.random() * 0.8;
    this.state = 'patrol';
    this.stateTimer = 0;
    this.radius = isBoss ? 16 : 14;
    this.moveSpeed = isBoss ? 148 : archetype.speed;
    this.color = isBoss ? '#e8b04a' : archetype.color;
    this.accuracy = archetype.accuracy;
    this.coverPoint = null;
    this.coverTimer = 0;
    this.lastSeen = null;
    this.reaction = archetype.reaction + Math.random() * 0.25;
    this.aimJitter = 0.04 + (1 - this.accuracy) * 0.14;
    this.burstLeft = 0;
    this.burstTimer = 0;
    this.strafeDir = Math.random() > 0.5 ? 1 : -1;
    this.strafeTimer = 0.8 + Math.random() * 1.4;
    this.crouched = false;
    this.perception = 0;
    this.name = archetype.name;
    this.isEnemy = true;
    this.moving = false;
    this.walkPhase = Math.random() * Math.PI * 2;
    this.facing = 0;
  }

  takeDamage(amount, particles, audio) {
    if (this.isDead) return;
    this.health -= amount;
    this.hitFlash = 1;
    this.perception = 1;
    if (particles) particles.spawnHit(this.x, this.y, 4);
    if (this.health <= 0) {
      this.isDead = true;
      this.state = 'dead';
      this.vx = 0;
      this.vy = 0;
      this.burstLeft = 0;
      if (particles) {
        particles.spawnHit(this.x, this.y, 12);
        particles.spawnCash(this.x, this.y, this.isBoss ? 700 : 55 + Math.floor(Math.random() * 70));
      }
      if (audio) audio.playBodyFall();
    } else if (this.health < this.maxHealth * 0.55 && this.state !== 'cover') {
      this.state = 'cover';
      this.coverTimer = 1.2 + Math.random() * 1.2;
      this.coverPoint = null;
    }
  }

  findCover(city, player) {
    let best = null;
    let bestScore = -Infinity;
    for (const col of city.getColliders(this.x, this.y, 260)) {
      if (col.type !== 'building') continue;
      const corners = [
        { x: col.x + col.w / 2 + 22, y: col.y - col.h / 2 - 22 },
        { x: col.x - col.w / 2 - 22, y: col.y - col.h / 2 - 22 },
        { x: col.x + col.w / 2 + 22, y: col.y + col.h / 2 + 22 },
        { x: col.x - col.w / 2 - 22, y: col.y + col.h / 2 + 22 },
      ];
      for (const c of corners) {
        if (city.pointBlocked(c.x, c.y, 14)) continue;
        const d = Math.hypot(c.x - this.x, c.y - this.y);
        if (d > 300) continue;
        const hiding = city.hasLineOfSight(c.x, c.y, player.x, player.y, 500) ? -80 : 120;
        const score = hiding - d * 0.25;
        if (score > bestScore) {
          bestScore = score;
          best = c;
        }
      }
    }
    return best;
  }

  shoot(combat, particles, audio, player) {
    const w = this.weapon;
    const dist = Math.hypot(player.x - this.x, player.y - this.y);
    const moving = Math.hypot(player.vx || 0, player.vy || 0) > 120 ? 0.16 : 0;
    const falloff = clamp(1 - dist / (w.range * 1.4), 0.25, 1);
    const spreadBase = (1 - this.accuracy) * 0.16 + this.aimJitter + moving;
    const pellets = w.pellets || 1;
    for (let i = 0; i < pellets; i += 1) {
      const spread = (Math.random() - 0.5) * spreadBase * 2;
      const a = this.angle + spread;
      const muzzleX = this.x + Math.cos(a) * 17;
      const muzzleY = this.y + Math.sin(a) * 17;
      const damageScale = 0.52 + falloff * 0.48;
      combat.fireBullet(muzzleX, muzzleY, a, { ...w, damage: w.damage * damageScale }, 'enemy');
      if (particles) particles.spawnMuzzle(muzzleX, muzzleY, a, w.id === 'shotgun' ? 12 : 6);
    }
    if (audio) audio.playGunshot(w.sound, 0.42);
  }

  update(dt, player, city, particles, audio, combat) {
    if (this.isDead) {
      this.deathTimer += dt;
      return;
    }
    this.hitFlash = Math.max(0, this.hitFlash - dt * 3);
    this.fireTimer -= dt;
    this.stateTimer -= dt;
    this.perception = Math.max(0, this.perception - dt * 0.6);
    this.strafeTimer -= dt;

    const dx = player.x - this.x;
    const dy = player.y - this.y;
    const dist = Math.hypot(dx, dy);
    const los = city.hasLineOfSight(this.x, this.y, player.x, player.y, 680);
    if (los && dist < 640) {
      this.lastSeen = { x: player.x, y: player.y };
      this.perception = 1;
    }
    this.angle = Math.atan2(dy, dx);

    let targetX = player.x;
    let targetY = player.y;
    let move = 0;

    if (this.state === 'cover' && this.coverTimer > 0) {
      this.coverTimer -= dt;
      if (!this.coverPoint) this.coverPoint = this.findCover(city, player);
      if (this.coverPoint) {
        targetX = this.coverPoint.x;
        targetY = this.coverPoint.y;
        move = Math.hypot(targetX - this.x, targetY - this.y) > 16 ? 1 : 0;
        if (move === 0) this.crouched = true;
      }
      if (this.coverTimer <= 0) {
        this.state = 'combat';
        this.crouched = false;
        this.fireTimer = Math.min(this.fireTimer, 0.2);
      }
    } else if ((los && dist < 580) || (this.lastSeen && dist < 660)) {
      this.state = 'combat';
      if (los) {
        const preferred = this.archetype.preferredRange;
        if (dist > preferred + 70) move = 1;
        else if (dist < preferred - 80) move = -0.8;
        else {
          move = 0.2;
          if (this.strafeTimer <= 0) {
            this.strafeTimer = 0.9 + Math.random() * 1.6;
            this.strafeDir *= -1;
          }
          targetX = player.x + Math.cos(this.angle + Math.PI / 2) * 62 * this.strafeDir;
          targetY = player.y + Math.sin(this.angle + Math.PI / 2) * 62 * this.strafeDir;
        }
      } else if (this.lastSeen) {
        targetX = this.lastSeen.x;
        targetY = this.lastSeen.y;
        move = 1;
        if (Math.hypot(targetX - this.x, targetY - this.y) < 22) this.lastSeen = null;
      }

      if (los && dist < this.weapon.range * 0.98) {
        this.reaction -= dt;
        if (this.reaction <= 0 && this.fireTimer <= 0) {
          const burst = this.isBoss ? 4 : this.weapon.burst || 1;
          this.burstLeft = burst;
          this.burstTimer = 0;
          this.fireTimer = this.isBoss ? 0.62 : Math.max(0.4, this.weapon.fireRate * 3.1);
          this.reaction = 0.18 + Math.random() * 0.3;
        }
      }
    } else {
      this.state = 'patrol';
      if (this.stateTimer <= 0) {
        this.stateTimer = 2 + Math.random() * 3;
        this.angle += (Math.random() - 0.5) * 1.4;
      }
      targetX = this.x + Math.cos(this.angle) * 64;
      targetY = this.y + Math.sin(this.angle) * 64;
      move = 0.32;
    }

    // Fire queued burst rounds.
    if (this.burstLeft > 0) {
      this.burstTimer -= dt;
      if (this.burstTimer <= 0 && los && dist < this.weapon.range) {
        this.shoot(combat, particles, audio, player);
        this.burstLeft -= 1;
        this.burstTimer = 0.1 + this.weapon.fireRate * 0.4;
      } else if (!los) {
        this.burstLeft = 0;
      }
    }

    if (move !== 0) {
      const mdx = targetX - this.x;
      const mdy = targetY - this.y;
      const md = Math.hypot(mdx, mdy) || 1;
      this.vx = (mdx / md) * this.moveSpeed * move;
      this.vy = (mdy / md) * this.moveSpeed * move;
      this.moving = true;
      this.walkPhase = (this.walkPhase + dt * 9) % (Math.PI * 2);
      this.facing = Math.atan2(this.vy, this.vx) > -Math.PI / 4 && Math.atan2(this.vy, this.vx) <= Math.PI / 4 ? 3 : Math.atan2(this.vy, this.vx) > Math.PI / 4 && Math.atan2(this.vy, this.vx) <= (Math.PI * 3) / 4 ? 0 : Math.atan2(this.vy, this.vx) > -(Math.PI * 3) / 4 && Math.atan2(this.vy, this.vx) <= -Math.PI / 4 ? 2 : 1;
    } else {
      this.vx *= Math.exp(-10 * dt);
      this.vy *= Math.exp(-10 * dt);
      this.moving = false;
    }

    const nx = this.x + this.vx * dt;
    const ny = this.y + this.vy * dt;
    const hit = city.collideCircle(nx, ny, this.radius);
    if (hit) {
      this.x += hit.x;
      this.y += hit.y;
    } else {
      this.x = clamp(nx, 20, city.width - 20);
      this.y = clamp(ny, 20, city.height - 20);
    }
  }
}

// =====================================================================
// Combat manager
// =====================================================================
export class CombatManager {
  constructor(city) {
    this.city = city;
    this.enemies = [];
    this.pedestrians = [];
    this.bullets = [];
    this.populationTimer = 0;
    this.pedSpawnRng = Math.random;
    this.lastGunfireNotify = 0;
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
      angle, speed, weapon, owner,
      travelled: 0,
      range: weapon.range || 500,
      damage: weapon.damage || 10,
      life: 1.4,
    });
  }

  handlePlayerAttack(player, input, police, particles, audio, game) {
    if (player.isReloading || player.isRolling || player.hotwire) return;
    if (player.fireCooldown > 0) return;
    const w = player.weapon;
    player.fireCooldown = w.fireRate;
    const aimAngle = Math.atan2(input.mouse.worldY - player.y, input.mouse.worldX - player.x);
    player.angle = aimAngle;

    if (w.id === 'fists') {
      if (audio) audio.playPunch();
      const reach = w.range;
      const px = player.x + Math.cos(player.angle) * reach;
      const py = player.y + Math.sin(player.angle) * reach;
      let hit = false;
      for (const ped of this.pedestrians) {
        if (!ped.isDead && Math.hypot(px - ped.x, py - ped.y) < 28) {
          ped.takeDamage(w.damage, particles, audio, player.angle);
          game.onCrime('assault', 1);
          hit = true;
          break;
        }
      }
      if (!hit) {
        for (const enemy of this.enemies) {
          if (!enemy.isDead && Math.hypot(px - enemy.x, py - enemy.y) < 34) {
            enemy.takeDamage(w.damage, particles, audio);
            enemy.vx += Math.cos(player.angle) * 90;
            enemy.vy += Math.sin(player.angle) * 90;
            hit = true;
            break;
          }
        }
      }
      if (!hit) {
        for (const cop of police.footCops || []) {
          if (cop.isDead) continue;
          if (Math.hypot(px - cop.x, py - cop.y) < 30) {
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
      let spread;
      if (pellets > 1) spread = (Math.random() - 0.5) * w.spread * 2;
      else spread = (Math.random() - 0.5) * w.spread * 2;
      const a = player.angle + spread;
      const muzzleX = player.x + Math.cos(player.angle) * 26;
      const muzzleY = player.y + Math.sin(player.angle) * 26;
      this.fireBullet(muzzleX, muzzleY, a, w, 'player');
    }
    particles.spawnMuzzle(player.x + Math.cos(player.angle) * 26, player.y + Math.sin(player.angle) * 26, player.angle, w.id === 'shotgun' ? 15 : 9);
    particles.spawnShell(player.x, player.y, player.angle);
    if (audio) audio.playGunshot(w.sound, 1);
    player.muzzleTimer = 0.07;
    game.camera.shake = Math.max(game.camera.shake, w.id === 'shotgun' ? 0.55 : w.id === 'rifle' ? 0.24 : 0.16);
    game.notifyGunfire(player.x, player.y);
    if (player.vehicle) {
      player.vehicle.vx -= Math.cos(player.angle) * w.recoil * 4;
      player.vehicle.vy -= Math.sin(player.angle) * w.recoil * 4;
    }
    if (mag.clip === 0 && mag.reserve > 0) player.reload(audio);
  }

  update(dt, player, traffic, police, particles, audio, game) {
    for (let i = this.enemies.length - 1; i >= 0; i -= 1) {
      const e = this.enemies[i];
      e.update(dt, player, this.city, particles, audio, this);
      if (e.isDead && e.deathTimer > 30) this.enemies.splice(i, 1);
    }

    // Pedestrian population.
    this.populationTimer -= dt;
    if (this.populationTimer <= 0 && !game.shotFrozen) {
      this.populationTimer = 1.5;
      const alive = this.pedestrians.filter((p) => !p.isDead).length;
      if (alive < 46) {
        const p = this.city.sidewalkPoint(player.x, player.y, 860, this.pedSpawnRng);
        const lane = {
          road: p.road,
          side: p.road.horizontal ? Math.sign(p.y - p.road.y1) : -Math.sign(p.x - p.road.x1),
          dir: p.road.horizontal ? p.road.dirX : p.road.dirY,
          angle: p.angle,
        };
        this.spawnPedestrianAt(p.x, p.y, { lane });
      }
      for (let i = this.pedestrians.length - 1; i >= 0; i -= 1) {
        const p = this.pedestrians[i];
        if (p.isDead && Math.hypot(p.x - player.x, p.y - player.y) > 1000) this.pedestrians.splice(i, 1);
      }
    }

    for (const p of this.pedestrians) p.update(dt, this.city, particles);

    // A fast car scatters pedestrians.
    if (this.populationTimer > 1.45) {
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
          if (ahead > 0 && ahead < 155 && side < 46) {
            p.reactToCar(v.x, v.y, v.angle);
            particles.spawnFootstep(p.x, p.y);
          }
        }
      }
    }

    // Bullets.
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
      const wallHit = this.city.raycast(b.px, b.py, b.x, b.y, 9);
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
          for (const cop of police.footCops || []) {
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
        } else if (player.isInVehicle && player.vehicle && segmentHitsCircle(b.px, b.py, b.x, b.y, player.vehicle.x, player.vehicle.y, 24)) {
          player.vehicle.takeDamage(dmg * 0.75, particles, audio);
          if (Math.random() < 0.32) player.takeDamage(dmg * 0.15, particles, audio, b.angle);
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
        for (const v of game.allVehicles()) {
          if (v.isDestroyed || v === player.vehicle) continue;
          const r = Math.max(v.width, v.length) * 0.4;
          if (segmentHitsCircle(b.px, b.py, b.x, b.y, v.x, v.y, r)) {
            v.takeDamage(dmg * 1.08, particles, audio);
            particles.spawnSparks(b.x, b.y, 5);
            consumed = true;
            break;
          }
        }
      }

      if (consumed) this.bullets.splice(i, 1);
    }

    // Running people over.
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

    // Explosion shockwaves.
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

    if (this.pedestrians.length > 90) this.pedestrians.splice(0, this.pedestrians.length - 90);
    void traffic;
  }
}
