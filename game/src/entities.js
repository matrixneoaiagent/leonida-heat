// Leonida Heat - entities and their physics.
// ParticleSystem (decals, smoke, sparks, cash), Vehicle (arcade car physics
// in world pixels per second), Player (on foot and in cars) and Pedestrian
// (sidewalk walkers, crossers, panickers and robbery targets).

import { VEHICLE_TYPES, WEAPON_CONFIG, PHYSICS_CONFIG } from './config.js';

// =====================================================================
// Particles
// =====================================================================
export class ParticleSystem {
  constructor() {
    this.particles = [];
    this.bloodDecals = [];
    this.cashPickups = [];
    this.explosions = [];
    this.maxParticles = 520;
  }

  add(p) {
    if (this.particles.length >= this.maxParticles) this.particles.shift();
    p.life = p.life ?? 1;
    p.decay = p.decay ?? 1.6;
    this.particles.push(p);
  }

  spawnSparks(x, y, count = 6, speed = 1) {
    for (let i = 0; i < count; i += 1) {
      const a = Math.random() * Math.PI * 2;
      const s = (70 + Math.random() * 190) * speed;
      this.add({
        type: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: 0.5, decay: 2.4, size: 1.3 + Math.random() * 1.8,
        color: Math.random() > 0.45 ? '#ffe27a' : '#ff9c4a',
      });
    }
  }

  spawnBlood(x, y, count = 6, dir = null) {
    for (let i = 0; i < count; i += 1) {
      const a = dir === null ? Math.random() * Math.PI * 2 : dir + (Math.random() - 0.5) * 1.4;
      const s = 50 + Math.random() * 160;
      this.add({
        type: 'blood_drop', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: 0.55, decay: 2.2, size: 1.6 + Math.random() * 2.4,
      });
    }
    this.bloodDecals.push({ x: x + (Math.random() - 0.5) * 14, y: y + (Math.random() - 0.5) * 14, r: 7 + Math.random() * 10, alpha: 0.75 });
    if (this.bloodDecals.length > 130) this.bloodDecals.shift();
  }

  spawnSmoke(x, y, color = 'rgba(180, 180, 185, 0.55)', count = 1, size = 8, rise = 22) {
    for (let i = 0; i < count; i += 1) {
      this.add({
        type: 'smoke',
        x: x + (Math.random() - 0.5) * 8,
        y: y + (Math.random() - 0.5) * 8,
        vx: (Math.random() - 0.5) * 24,
        vy: -rise - Math.random() * 20,
        life: 1, decay: 0.55 + Math.random() * 0.4, size, color,
      });
    }
  }

  spawnFire(x, y, count = 2, size = 10) {
    for (let i = 0; i < count; i += 1) {
      this.add({
        type: 'fire',
        x: x + (Math.random() - 0.5) * 10,
        y: y + (Math.random() - 0.5) * 10,
        vx: (Math.random() - 0.5) * 40,
        vy: -40 - Math.random() * 40,
        life: 0.8, decay: 1.6, size: size + Math.random() * 6,
        color: Math.random() > 0.5 ? '#ff5a1f' : '#ffc44d',
      });
    }
  }

  spawnExplosion(x, y) {
    this.explosions.push({ x, y, radius: 120, damage: 70 });
    this.add({ type: 'shockwave', x, y, radius: 8, maxRadius: 135, life: 1, decay: 1.5 });
    for (let i = 0; i < 26; i += 1) {
      const a = Math.random() * Math.PI * 2;
      const s = 90 + Math.random() * 320;
      this.add({
        type: 'explosion_fire', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: 1, decay: 1.05, size: 16 + Math.random() * 20,
        color: Math.random() > 0.4 ? '#ff4a12' : '#ffc23a',
      });
    }
    for (let i = 0; i < 20; i += 1) {
      const a = Math.random() * Math.PI * 2;
      const s = 40 + Math.random() * 150;
      this.add({
        type: 'smoke', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 35,
        life: 1, decay: 0.4, size: 20 + Math.random() * 18, color: 'rgba(34, 30, 38, 0.72)',
      });
    }
    this.spawnSparks(x, y, 20, 1.6);
  }

  spawnMuzzle(x, y, angle, size = 10) {
    this.add({
      type: 'muzzle', x, y, vx: 0, vy: 0, angle, life: 0.07, decay: 14, size,
    });
    for (let i = 0; i < 3; i += 1) {
      const a = angle + (Math.random() - 0.5) * 0.7;
      this.add({
        type: 'spark', x, y, vx: Math.cos(a) * 260, vy: Math.sin(a) * 260,
        life: 0.18, decay: 6, size: 1.4, color: '#ffe9a8',
      });
    }
  }

  spawnShell(x, y, angle) {
    this.add({
      type: 'casing', x, y, vx: Math.cos(angle + 1.9) * 110, vy: Math.sin(angle + 1.9) * 110,
      life: 0.9, decay: 1.1, size: 2.2, spin: Math.random() * 6,
    });
  }

  spawnFootstep(x, y) {
    this.add({
      type: 'dust', x, y, vx: (Math.random() - 0.5) * 18, vy: (Math.random() - 0.5) * 18,
      life: 0.6, decay: 2.4, size: 3 + Math.random() * 2,
    });
  }

  spawnTyreSmoke(x, y) {
    this.add({
      type: 'smoke', x, y, vx: (Math.random() - 0.5) * 40, vy: -18 - Math.random() * 20,
      life: 0.8, decay: 1.2, size: 9 + Math.random() * 8, color: 'rgba(232, 228, 222, 0.42)',
    });
  }

  spawnSplash(x, y) {
    for (let i = 0; i < 8; i += 1) {
      const a = Math.random() * Math.PI * 2;
      this.add({
        type: 'spark', x, y, vx: Math.cos(a) * 110, vy: Math.sin(a) * 110,
        life: 0.5, decay: 2.4, size: 2, color: '#bdeef2',
      });
    }
  }

  spawnCash(x, y, amount) {
    this.cashPickups.push({ x, y, amount, bob: Math.random() * 6 });
    if (this.cashPickups.length > 24) this.cashPickups.shift();
  }

  update(dt) {
    for (let i = this.particles.length - 1; i >= 0; i -= 1) {
      const p = this.particles[i];
      p.life -= p.decay * dt;
      if (p.type === 'shockwave') {
        p.radius += (p.maxRadius - p.radius) * Math.min(1, dt * 9);
      } else if (p.type === 'muzzle') {
        // Held at the muzzle for a couple of frames.
      } else {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= Math.exp(-1.6 * dt);
        p.vy = p.vy * Math.exp(-1.6 * dt) + (p.type === 'smoke' || p.type === 'fire' ? -10 * dt : 0);
      }
      if (p.life <= 0) this.particles.splice(i, 1);
    }
    for (let i = this.bloodDecals.length - 1; i >= 0; i -= 1) {
      this.bloodDecals[i].alpha -= dt * 0.012;
      if (this.bloodDecals[i].alpha <= 0.04) this.bloodDecals.splice(i, 1);
    }
    for (const c of this.cashPickups) c.bob += dt * 3;
  }

  drainExplosions() {
    const out = this.explosions;
    this.explosions = [];
    return out;
  }
}

// =====================================================================
// Vehicle
// =====================================================================
export class Vehicle {
  constructor(archetypeId, x, y, angle = 0, color = null) {
    this.config = VEHICLE_TYPES[archetypeId] || VEHICLE_TYPES.meridian;
    this.id = this.config.id;
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.angle = angle;
    this.steerAngle = 0;
    this.handbrake = false;

    this.width = this.config.width;
    this.length = this.config.length;
    this.color = color || this.config.colors[Math.floor(Math.random() * this.config.colors.length)];
    this.isPolice = !!this.config.isPolice;

    this.hp = this.config.maxHp;
    this.maxHp = this.config.maxHp;
    this.driver = null;
    this.passengers = [];
    this.isDestroyed = false;
    this.isPlayerVehicle = false;
    this.isMission = false;
    this.aiMode = 'traffic'; // traffic | convoy | parked | police
    this.cruiseSpeed = 170 + Math.random() * 90;
    this.despawnTimer = 0;

    this.sirenActive = this.isPolice;
    this.sirenFlash = 0;
    this.sirenPhase = Math.random() > 0.5;
    this.headlightsOn = true;
    this.brakeLightsOn = false;

    this.skidIntensity = 0;
    this.skidTimer = 0;
    this.effectTimer = 0;
    this.impactTimer = 0;
    this.impactPulse = 0;
    this.honkTimer = 0;
    this.alarm = 0;
    this.occupiedByCivilian = false;
    this.lastDriverAngle = angle;
  }

  get isDrivable() {
    return !this.isDestroyed && this.hp > 0;
  }

  get speed() {
    return this.vx * Math.cos(this.angle) + this.vy * Math.sin(this.angle);
  }

  accelerate(factor = 1, dt = 1 / 60) {
    if (!this.isDrivable) return;
    const fx = Math.cos(this.angle);
    const fy = Math.sin(this.angle);
    const amount = this.config.accel * factor * dt;
    this.vx += fx * amount;
    this.vy += fy * amount;
    const forward = this.vx * fx + this.vy * fy;
    const limit = factor >= 0 ? this.config.topSpeed : this.config.reverseSpeed;
    if (factor >= 0 && forward > limit) {
      this.vx -= fx * (forward - limit);
      this.vy -= fy * (forward - limit);
    } else if (factor < 0 && forward < -limit) {
      this.vx -= fx * (forward + limit);
      this.vy -= fy * (forward + limit);
    }
    this.brakeLightsOn = factor < 0;
  }

  brake(intensity = 1, dt = 1 / 60) {
    if (!this.isDrivable) return;
    this.brakeLightsOn = true;
    const fx = Math.cos(this.angle);
    const fy = Math.sin(this.angle);
    const forward = this.vx * fx + this.vy * fy;
    const lateralX = this.vx - fx * forward;
    const lateralY = this.vy - fy * forward;
    const nextForward = forward * Math.exp(-this.config.brake * intensity * dt);
    this.vx = fx * nextForward + lateralX * Math.exp(-2 * dt);
    this.vy = fy * nextForward + lateralY * Math.exp(-2 * dt);
  }

  steer(direction) {
    this.steerAngle = Math.max(-1, Math.min(1, direction));
  }

  update(dt, city, particles, audio) {
    if (this.isDestroyed) {
      this.vx *= Math.exp(-6 * dt);
      this.vy *= Math.exp(-6 * dt);
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      return;
    }

    const fx = Math.cos(this.angle);
    const fy = Math.sin(this.angle);
    let forward = this.vx * fx + this.vy * fy;
    let lateral = -this.vx * fy + this.vy * fx;

    // Steering scales with speed and reverses when backing up.
    const speedFactor = Math.min(1, Math.abs(forward) / 135);
    if (this.handbrake) {
      this.steerAngle *= 0.985;
    }
    this.angle += this.steerAngle * this.config.turnSpeed * speedFactor * Math.sign(forward || 1) * dt;

    const grip = this.handbrake ? this.config.driftGrip : this.config.grip;
    lateral *= Math.exp(-grip * dt);
    forward *= Math.exp(-0.62 * dt);

    const nfx = Math.cos(this.angle);
    const nfy = Math.sin(this.angle);
    this.vx = nfx * forward - nfy * lateral;
    this.vy = nfy * forward + nfx * lateral;

    const slip = Math.abs(lateral);
    this.skidIntensity = Math.min(1, Math.max(0, (slip - 28) / 110));
    if (this.skidIntensity > 0.04 && Math.abs(forward) > 40) {
      this.skidTimer += dt;
      if (this.skidTimer > 0.045) {
        const rearDist = -this.length * 0.34;
        const halfW = this.width * 0.34;
        const rightX = -nfy;
        const rightY = nfx;
        const r1x = this.x + nfx * rearDist + rightX * halfW;
        const r1y = this.y + nfy * rearDist + rightY * halfW;
        const r2x = this.x + nfx * rearDist - rightX * halfW;
        const r2y = this.y + nfy * rearDist - rightY * halfW;
        city.addSkidMark(r1x, r1y, this.angle, this.skidIntensity * 0.55);
        city.addSkidMark(r2x, r2y, this.angle, this.skidIntensity * 0.55);
        particles.spawnTyreSmoke(r1x, r1y);
        particles.spawnTyreSmoke(r2x, r2y);
        this.skidTimer = 0;
      }
    }

    const nextX = this.x + this.vx * dt;
    const nextY = this.y + this.vy * dt;
    const radius = Math.max(13, Math.min(this.width, this.length) * 0.44);
    const hit = city.collideCircle(nextX, nextY, radius);

    if (hit) {
      this.x += hit.x;
      this.y += hit.y;
      const nx = hit.x || 0;
      const ny = hit.y || 0;
      const len = Math.hypot(nx, ny) || 1;
      const ux = nx / len;
      const uy = ny / len;
      const into = this.vx * ux + this.vy * uy;
      if (into < 0) {
        this.vx -= ux * into * 1.5;
        this.vy -= uy * into * 1.5;
      }
      const impactSpeed = Math.abs(into);
      if (impactSpeed > 80 && this.impactTimer <= 0) {
        this.impactTimer = 0.26;
        this.impactPulse = Math.min(1, impactSpeed / 520);
        this.takeDamage(impactSpeed * 0.055, particles, audio);
        particles.spawnSparks(this.x + ux * radius, this.y + uy * radius, 7, 1.1);
      }
      if (hit.collider.type === 'water') {
        this.vx *= 0.72;
        this.vy *= 0.72;
        if (Math.random() < 0.15) particles.spawnSplash(this.x, this.y);
      }
    } else {
      this.x = Math.max(20, Math.min(city.width - 20, nextX));
      this.y = Math.max(20, Math.min(city.height - 20, nextY));
    }

    this.impactTimer -= dt;
    this.impactPulse *= Math.exp(-4 * dt);

    if (this.isPolice && this.sirenActive) {
      this.sirenFlash += dt;
      if (this.sirenFlash > 0.18) {
        this.sirenPhase = !this.sirenPhase;
        this.sirenFlash = 0;
      }
    }

    // Damage symptoms, throttled so they do not swamp the particle pool.
    this.effectTimer -= dt;
    if (this.effectTimer <= 0) {
      this.effectTimer = 0.11;
      const hx = this.x + nfx * this.length * 0.33;
      const hy = this.y + nfy * this.length * 0.33;
      if (this.hp < this.maxHp * 0.5) particles.spawnSmoke(hx, hy, 'rgba(185, 185, 190, 0.45)', 1, 7, 24);
      if (this.hp < this.maxHp * 0.24) {
        particles.spawnFire(hx, hy, 1, 8);
        particles.spawnSmoke(hx, hy, 'rgba(28, 26, 31, 0.72)', 1, 12, 34);
      }
    }
  }

  takeDamage(amount, particles, audio) {
    if (this.isDestroyed || amount <= 0) return;
    this.hp -= amount;
    if (this.hp <= 0) this.explode(particles, audio);
  }

  explode(particles, audio) {
    if (this.isDestroyed) return;
    this.isDestroyed = true;
    this.hp = 0;
    this.color = '#232227';
    this.vx *= 0.2;
    this.vy *= 0.2;
    if (particles) particles.spawnExplosion(this.x, this.y);
    if (audio) audio.playExplosion();
    if (this.driver && this.driver.takeDamage && this.driver !== null && this.driver.isPlayer !== false) {
      this.driver.takeDamage(120, particles, audio);
    }
  }
}

// =====================================================================
// Player
// =====================================================================
export class Player {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.angle = -Math.PI / 2;
    this.radius = PHYSICS_CONFIG.playerRadius;

    this.health = 100;
    this.maxHealth = 100;
    this.armor = 50;
    this.maxArmor = 100;
    this.money = 500;

    this.inventory = ['fists', 'pistol', 'smg', 'shotgun', 'rifle'];
    this.currentWeaponIndex = 1;
    this.ammo = {
      fists: { clip: Infinity, reserve: Infinity },
      pistol: { clip: 15, reserve: 75 },
      smg: { clip: 30, reserve: 0 },
      shotgun: { clip: 8, reserve: 0 },
      rifle: { clip: 30, reserve: 0 },
    };
    this.reloadTimer = 0;
    this.isReloading = false;
    this.fireCooldown = 0;
    this.muzzleTimer = 0;
    this.iFrames = 0;
    this.hitFlash = 0;
    this.lastDamageAt = 0;

    this.vehicle = null;
    this.hotwire = null;
    this.isRolling = false;
    this.rollTimer = 0;
    this.rollAngle = 0;
    this.walkCycle = 0;
    this.footstepTimer = 0;
    this.sprinting = false;
    this.moving = false;
    this.isPlayer = true;
  }

  get weapon() {
    return WEAPON_CONFIG[this.inventory[this.currentWeaponIndex]];
  }

  get isInVehicle() {
    return this.vehicle !== null;
  }

  setWeapon(index) {
    if (index >= 0 && index < this.inventory.length) {
      this.currentWeaponIndex = index;
      this.isReloading = false;
      this.reloadTimer = 0;
      this.fireCooldown = Math.max(this.fireCooldown, 0.12);
    }
  }

  cycleWeapon(delta) {
    const n = this.inventory.length;
    this.setWeapon((this.currentWeaponIndex + delta + n) % n);
  }

  giveWeapon(id, clips = 2) {
    const config = WEAPON_CONFIG[id];
    if (!config) return;
    const mag = this.ammo[id];
    const add = config.clipSize * clips;
    mag.reserve = Math.min(config.maxReserve, mag.reserve + add);
    if (mag.clip <= 0) mag.clip = Math.min(config.clipSize, mag.reserve);
    this.setWeapon(this.inventory.indexOf(id));
  }

  takeDamage(amount, particles, audio, dir = null) {
    if (this.isRolling || this.iFrames > 0 || this.health <= 0) return;
    this.iFrames = 0.28;
    this.hitFlash = 1;
    if (particles) particles.spawnBlood(this.x, this.y, 6, dir);
    if (this.armor > 0) {
      const absorbed = Math.min(this.armor, amount * 0.68);
      this.armor -= absorbed;
      this.health -= amount - absorbed;
    } else {
      this.health -= amount;
    }
    this.health = Math.max(0, this.health);
    if (audio && Math.random() > 0.4) audio.playHurt();
  }

  reload(audio) {
    const w = this.weapon;
    if (!Number.isFinite(w.clipSize)) return;
    const mag = this.ammo[w.id];
    if (!mag || mag.clip >= w.clipSize || mag.reserve <= 0 || this.isReloading) return;
    this.isReloading = true;
    this.reloadTimer = w.reloadTime || 1.2;
    if (audio) audio.playReload();
  }

  finishReload() {
    const w = this.weapon;
    const mag = this.ammo[w.id];
    const needed = w.clipSize - mag.clip;
    const available = Math.min(needed, mag.reserve);
    mag.clip += available;
    mag.reserve -= available;
    this.isReloading = false;
    this.reloadTimer = 0;
  }

  startRoll(mx, my) {
    if (this.isRolling || this.isInVehicle) return;
    this.isRolling = true;
    this.rollTimer = PHYSICS_CONFIG.playerRollDuration;
    this.rollAngle = Math.atan2(my, mx);
  }

  tickTimers(dt) {
    this.iFrames = Math.max(0, this.iFrames - dt);
    this.hitFlash = Math.max(0, this.hitFlash - dt * 3);
    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    this.muzzleTimer = Math.max(0, this.muzzleTimer - dt);
    if (this.isReloading) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) this.finishReload();
    }
  }

  update(dt, input, city, particles, audio) {
    this.tickTimers(dt);

    if (this.hotwire) {
      return;
    }

    if (this.isInVehicle) {
      this.x = this.vehicle.x;
      this.y = this.vehicle.y;
      this.angle = this.vehicle.angle;
      this.vx = this.vehicle.vx;
      this.vy = this.vehicle.vy;
      return;
    }

    if (this.isRolling) {
      this.rollTimer -= dt;
      this.vx = Math.cos(this.rollAngle) * PHYSICS_CONFIG.playerRollSpeed;
      this.vy = Math.sin(this.rollAngle) * PHYSICS_CONFIG.playerRollSpeed;
      if (Math.random() < 0.55) particles.spawnFootstep(this.x, this.y);
      if (this.rollTimer <= 0) this.isRolling = false;
    } else {
      let mx = 0;
      let my = 0;
      if (input.forward) my -= 1;
      if (input.backward) my += 1;
      if (input.left) mx -= 1;
      if (input.right) mx += 1;
      const len = Math.hypot(mx, my);
      this.sprinting = len > 0 && input.sprint;
      if (len > 0) {
        mx /= len;
        my /= len;
        if (input.roll) {
          this.startRoll(mx, my);
          return;
        }
        const speed = this.sprinting ? PHYSICS_CONFIG.playerSprintSpeed : PHYSICS_CONFIG.playerWalkSpeed;
        this.vx = mx * speed;
        this.vy = my * speed;
        this.walkCycle += dt * (this.sprinting ? 15 : 9);
        this.footstepTimer += dt;
        if (this.footstepTimer > (this.sprinting ? 0.2 : 0.31)) {
          particles.spawnFootstep(this.x, this.y);
          this.footstepTimer = 0;
          if (audio) audio.playFootstep();
        }
        this.moving = true;
      } else {
        this.vx *= Math.exp(-11 * dt);
        this.vy *= Math.exp(-11 * dt);
        this.moving = false;
      }
      this.angle = Math.atan2(input.mouse.worldY - this.y, input.mouse.worldX - this.x);
    }

    const nextX = this.x + this.vx * dt;
    const nextY = this.y + this.vy * dt;
    const hit = city.collideCircle(nextX, nextY, this.radius);
    if (hit) {
      this.x += hit.x;
      this.y += hit.y;
    } else {
      this.x = Math.max(this.radius, Math.min(city.width - this.radius, nextX));
      this.y = Math.max(this.radius, Math.min(city.height - this.radius, nextY));
    }

    for (let i = particles.cashPickups.length - 1; i >= 0; i -= 1) {
      const c = particles.cashPickups[i];
      if (Math.hypot(this.x - c.x, this.y - c.y) < 38) {
        this.money += c.amount;
        if (audio) audio.playCash();
        particles.cashPickups.splice(i, 1);
      }
    }
  }
}

// =====================================================================
// Pedestrian
// =====================================================================
const SHIRTS = ['#b45b67', '#4c8f94', '#b7a552', '#618668', '#b17a50', '#cfc7b8', '#3b3942', '#7d6c8f'];
const PANTS = ['#3b4a63', '#556069', '#66513f', '#2c2c32', '#898887', '#455767'];
const SKIN = ['#e2b58e', '#c99366', '#a87048', '#82563a', '#e6c3a2'];

export class Pedestrian {
  constructor(x, y, rng = Math.random, lane = null) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.angle = lane ? lane.angle : rng() * Math.PI * 2;
    this.lane = lane;
    this.speed = 52 + rng() * 26;
    this.baseSpeed = this.speed;
    this.health = 38;
    this.maxHealth = 38;
    this.isDead = false;
    this.state = 'walk';
    this.stateTimer = 2 + rng() * 3;
    this.crossTimer = 0;
    this.radius = 11;
    this.hitFlash = 0;

    this.shirt = SHIRTS[Math.floor(rng() * SHIRTS.length)];
    this.pants = PANTS[Math.floor(rng() * PANTS.length)];
    this.skin = SKIN[Math.floor(rng() * SKIN.length)];
    this.hair = rng() > 0.5 ? '#2a211d' : '#6a4a2f';
    this.umbrella = rng() < 0.22;
    this.bag = !this.umbrella && rng() < 0.38;
    this.hat = rng() < 0.18;
    this.bob = rng() * 6;
    this.panicTimer = 0;
    this.deadAngle = 0;
    this.rng = rng;
    this.isPedestrian = true;
    this.robbed = false;
  }

  takeDamage(amount, particles, audio, dir = null) {
    if (this.isDead) return;
    this.health -= amount;
    this.hitFlash = 1;
    if (particles) particles.spawnBlood(this.x, this.y, 4, dir);
    if (this.health <= 0) {
      this.die(particles);
    } else {
      this.fleeFrom(this.x - Math.cos(this.angle), this.y - Math.sin(this.angle));
    }
  }

  die(particles) {
    if (this.isDead) return;
    this.isDead = true;
    this.state = 'dead';
    this.vx = 0;
    this.vy = 0;
    this.deadAngle = this.angle + Math.PI / 2 + (Math.random() - 0.5);
    if (particles) {
      particles.spawnBlood(this.x, this.y, 10);
      particles.spawnCash(this.x, this.y, 15 + Math.floor(Math.random() * 65));
    }
  }

  fleeFrom(x, y) {
    if (this.isDead) return;
    this.state = 'flee';
    this.panicTimer = 4 + Math.random() * 3;
    this.speed = 145 + Math.random() * 45;
    this.angle = Math.atan2(this.y - y, this.x - x) + (Math.random() - 0.5) * 0.5;
    this.vx = Math.cos(this.angle) * this.speed;
    this.vy = Math.sin(this.angle) * this.speed;
  }

  panic(fromX, fromY, radius) {
    if (this.isDead) return;
    if (Math.hypot(this.x - fromX, this.y - fromY) < radius) {
      this.fleeFrom(fromX, fromY);
    }
  }

  update(dt, city, particles) {
    this.hitFlash = Math.max(0, this.hitFlash - dt * 3);
    if (this.isDead) return;

    if (this.state === 'flee') {
      this.panicTimer -= dt;
      this.speed = Math.max(this.speed - dt * 10, 70);
      if (this.panicTimer <= 0) {
        this.state = 'walk';
        this.speed = this.baseSpeed;
        this.vx = 0;
        this.vy = 0;
      }
    } else if (this.state === 'cross') {
      this.crossTimer -= dt;
      if (this.crossTimer <= 0) {
        this.state = 'walk';
        if (this.lane) {
          if (this.lane.road.horizontal) {
            this.y = this.lane.road.y1 + this.lane.side * (this.lane.road.width / 2 + 16);
            this.angle = this.lane.dir > 0 ? 0 : Math.PI;
          } else {
            this.x = this.lane.road.x1 - this.lane.side * (this.lane.road.width / 2 + 16);
            this.angle = this.lane.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
          }
        }
      }
    } else if (this.lane) {
      this.stateTimer -= dt;
      const road = this.lane.road;
      if (road.horizontal) {
        this.y = road.y1 + this.lane.side * (road.width / 2 + 16);
        this.angle = this.lane.dir > 0 ? 0 : Math.PI;
        const lim = this.lane.dir > 0 ? Math.min(road.x2, 2660) : road.x1;
        if ((this.lane.dir > 0 && this.x > lim - 24) || (this.lane.dir < 0 && this.x < lim + 24) || this.stateTimer <= 0) {
          if (this.city_nearIntersection(city, 70) && Math.random() < 0.4) {
            this.state = 'cross';
            this.crossTimer = 2.1;
            this.lane.side = -this.lane.side;
            this.angle = this.lane.side > 0 ? Math.PI / 2 : -Math.PI / 2;
          } else {
            this.lane.dir *= -1;
            this.stateTimer = 3 + this.rng() * 5;
          }
        }
      } else {
        this.x = road.x1 - this.lane.side * (road.width / 2 + 16);
        this.angle = this.lane.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
        const lim = this.lane.dir > 0 ? 3170 : 30;
        if ((this.lane.dir > 0 && this.y > lim - 24) || (this.lane.dir < 0 && this.y < lim + 24) || this.stateTimer <= 0) {
          if (this.city_nearIntersection(city, 70) && Math.random() < 0.4) {
            this.state = 'cross';
            this.crossTimer = 2.1;
            this.lane.side = -this.lane.side;
            this.angle = this.lane.side > 0 ? 0 : Math.PI;
          } else {
            this.lane.dir *= -1;
            this.stateTimer = 3 + this.rng() * 5;
          }
        }
      }
      if (this.state === 'walk') {
        const dir = this.lane.dir;
        if (road.horizontal) {
          this.vx = dir * this.speed;
          this.vy = (road.y1 + this.lane.side * (road.width / 2 + 16) - this.y) * 4;
        } else {
          this.vy = dir * this.speed;
          this.vx = (road.x1 - this.lane.side * (road.width / 2 + 16) - this.x) * 4;
        }
      }
    }

    if (this.state === 'cross') {
      const speed = 58;
      this.vx = Math.cos(this.angle) * speed;
      this.vy = Math.sin(this.angle) * speed;
    } else if (this.state === 'flee') {
      this.vx = Math.cos(this.angle) * this.speed;
      this.vy = Math.sin(this.angle) * this.speed;
    }

    const nextX = this.x + this.vx * dt;
    const nextY = this.y + this.vy * dt;
    const hit = city.collideCircle(nextX, nextY, this.radius);
    if (hit) {
      this.x += hit.x;
      this.y += hit.y;
      if (this.state === 'flee') this.angle += 0.8 + (Math.random() - 0.5) * 0.6;
    } else {
      this.x = Math.max(10, Math.min(city.width - 10, nextX));
      this.y = Math.max(10, Math.min(city.height - 10, nextY));
    }

    this.bob += dt * (this.state === 'flee' ? 12 : 6);
    if (this.state === 'flee' && Math.random() < 0.03) {
      particles.spawnFootstep(this.x, this.y);
    }
  }

  city_nearIntersection(city, radius) {
    for (const i of city.intersections) {
      if (Math.hypot(this.x - i.x, this.y - i.y) < radius) return true;
    }
    return false;
  }
}
