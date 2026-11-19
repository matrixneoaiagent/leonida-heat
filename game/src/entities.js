// Leonida Heat - bodies, wheels and sparks.
// ParticleSystem is a small pooled effect bus. Vehicle is an arcade car with
// longitudinal/lateral grip and a drift handbrake. Player handles on-foot
// movement, weapon bookkeeping and four-direction animation state. Pedestrian
// walks, idles, crosses, panics, flees and reacts to violence.

import { VEHICLE_TYPES, WEAPON_CONFIG, PHYSICS_CONFIG, PALETTE } from './config.js';
import { hash2 } from './rng.js';

const TAU = Math.PI * 2;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function facingFromAngle(angle) {
  const a = Math.atan2(Math.sin(angle), Math.cos(angle));
  if (a > -Math.PI / 4 && a <= Math.PI / 4) return 3; // right
  if (a > Math.PI / 4 && a <= (Math.PI * 3) / 4) return 0; // down
  if (a > -(Math.PI * 3) / 4 && a <= -Math.PI / 4) return 2; // up
  return 1; // left
}

// ===========================================================================
// Particles
// ===========================================================================
export class ParticleSystem {
  constructor() {
    this.particles = [];
    this.scuffs = [];
    this.cashPickups = [];
    this.explosions = [];
    this.maxParticles = 720;
    this.time = 0;
  }

  add(p) {
    if (this.particles.length >= this.maxParticles) this.particles.shift();
    p.life = p.life ?? 1;
    p.decay = p.decay ?? 1.6;
    p.maxLife = p.maxLife ?? p.life;
    this.particles.push(p);
  }

  spawnSparks(x, y, count = 6, speed = 1) {
    for (let i = 0; i < count; i += 1) {
      const a = Math.random() * TAU;
      const s = (75 + Math.random() * 205) * speed;
      this.add({
        type: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: 0.46, decay: 2.7, size: 1.2 + Math.random() * 1.8,
        color: Math.random() > 0.45 ? '#ffe27a' : '#ff9c4a',
      });
    }
  }

  spawnHit(x, y, count = 5, dir = null) {
    // Blood-free impact feedback: a hot flash and a little dry dust.
    for (let i = 0; i < count; i += 1) {
      const a = dir === null ? Math.random() * TAU : dir + (Math.random() - 0.5) * 1.5;
      const s = 65 + Math.random() * 165;
      this.add({
        type: 'hit', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: 0.34, decay: 3.4, size: 3 + Math.random() * 4,
        color: Math.random() > 0.5 ? '#ffe9b5' : '#ffbd6d',
      });
    }
    this.add({
      type: 'dust', x, y, vx: 0, vy: 0, life: 0.5, decay: 2.2,
      size: 7 + Math.random() * 5, color: 'rgba(222, 210, 190, 0.5)',
    });
  }

  spawnBlood(x, y, count = 5, dir = null) {
    this.spawnHit(x, y, count, dir);
  }

  spawnDust(x, y, count = 1, size = 7, vx = 0, vy = 0) {
    for (let i = 0; i < count; i += 1) {
      this.add({
        type: 'dust',
        x: x + (Math.random() - 0.5) * 12,
        y: y + (Math.random() - 0.5) * 12,
        vx: vx + (Math.random() - 0.5) * 42,
        vy: vy + (Math.random() - 0.5) * 42,
        life: 0.75, decay: 1.4, size: size + Math.random() * 5,
        color: 'rgba(218, 205, 180, 0.5)',
      });
    }
  }

  spawnSmoke(x, y, color = 'rgba(180, 180, 185, 0.55)', count = 1, size = 8, rise = 22) {
    for (let i = 0; i < count; i += 1) {
      this.add({
        type: 'smoke',
        x: x + (Math.random() - 0.5) * 9,
        y: y + (Math.random() - 0.5) * 9,
        vx: (Math.random() - 0.5) * 26,
        vy: -rise - Math.random() * 20,
        life: 1, decay: 0.52 + Math.random() * 0.34, size, color,
      });
    }
  }

  spawnFire(x, y, count = 2, size = 10) {
    for (let i = 0; i < count; i += 1) {
      this.add({
        type: 'fire',
        x: x + (Math.random() - 0.5) * 11,
        y: y + (Math.random() - 0.5) * 11,
        vx: (Math.random() - 0.5) * 42,
        vy: -42 - Math.random() * 48,
        life: 0.8, decay: 1.7, size: size + Math.random() * 7,
        color: Math.random() > 0.48 ? '#ff5a1f' : '#ffc44d',
      });
    }
  }

  spawnExplosion(x, y) {
    this.explosions.push({ x, y, radius: 128, damage: 72, age: 0 });
    this.add({ type: 'shockwave', x, y, radius: 8, maxRadius: 148, life: 1, decay: 1.4 });
    for (let i = 0; i < 30; i += 1) {
      const a = Math.random() * TAU;
      const s = 90 + Math.random() * 340;
      this.add({
        type: 'explosion_fire', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: 1, decay: 1.05, size: 16 + Math.random() * 22,
        color: Math.random() > 0.4 ? '#ff4a12' : '#ffc23a',
      });
    }
    for (let i = 0; i < 24; i += 1) {
      const a = Math.random() * TAU;
      const s = 40 + Math.random() * 160;
      this.add({
        type: 'smoke', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 38,
        life: 1, decay: 0.34, size: 20 + Math.random() * 22,
        color: i % 3 === 0 ? 'rgba(62, 50, 54, 0.76)' : 'rgba(34, 30, 38, 0.62)',
      });
    }
    this.spawnSparks(x, y, 24, 1.7);
    this.spawnDust(x, y, 9, 18);
  }

  spawnMuzzle(x, y, angle, size = 10) {
    this.add({ type: 'muzzle', x, y, vx: 0, vy: 0, angle, life: 0.075, decay: 14, size });
    for (let i = 0; i < 4; i += 1) {
      const a = angle + (Math.random() - 0.5) * 0.8;
      this.add({
        type: 'spark', x, y, vx: Math.cos(a) * 300, vy: Math.sin(a) * 300,
        life: 0.17, decay: 6.2, size: 1.5, color: '#ffe9a8',
      });
    }
  }

  spawnShell(x, y, angle) {
    this.add({
      type: 'casing', x, y, vx: Math.cos(angle + 1.9) * 115, vy: Math.sin(angle + 1.9) * 115,
      life: 0.9, decay: 1.1, size: 2.2, spin: Math.random() * 6,
    });
  }

  spawnFootstep(x, y) {
    this.add({
      type: 'dust', x, y, vx: (Math.random() - 0.5) * 20, vy: (Math.random() - 0.5) * 20,
      life: 0.55, decay: 2.8, size: 3 + Math.random() * 2,
      color: 'rgba(226, 214, 192, 0.42)',
    });
  }

  spawnTyreSmoke(x, y, intensity = 1) {
    this.add({
      type: 'smoke', x, y,
      vx: (Math.random() - 0.5) * 44, vy: -16 - Math.random() * 24,
      life: 0.75, decay: 1.15, size: (8 + Math.random() * 9) * (0.6 + intensity * 0.5),
      color: 'rgba(235, 230, 222, 0.4)',
    });
  }

  spawnSplash(x, y) {
    for (let i = 0; i < 9; i += 1) {
      const a = Math.random() * TAU;
      this.add({
        type: 'splash', x, y, vx: Math.cos(a) * 120, vy: Math.sin(a) * 120,
        life: 0.5, decay: 2.5, size: 2 + Math.random() * 2, color: '#c8f2f3',
      });
    }
  }

  spawnRainSplash(x, y) {
    this.add({
      type: 'rain', x, y, vx: (Math.random() - 0.5) * 25, vy: 30,
      life: 0.28, decay: 3.6, size: 3 + Math.random() * 4, color: 'rgba(205, 235, 240, 0.5)',
    });
  }

  spawnCash(x, y, amount) {
    this.cashPickups.push({ x, y, amount, bob: Math.random() * 6, age: 0 });
    if (this.cashPickups.length > 26) this.cashPickups.shift();
  }

  spawnScuff(x, y, angle) {
    this.scuffs.push({ x, y, angle, life: 1 });
    if (this.scuffs.length > 80) this.scuffs.shift();
  }

  update(dt) {
    this.time += dt;
    for (let i = this.particles.length - 1; i >= 0; i -= 1) {
      const p = this.particles[i];
      p.life -= p.decay * dt;
      if (p.type === 'shockwave') {
        p.radius += (p.maxRadius - p.radius) * Math.min(1, dt * 9);
      } else if (p.type === 'muzzle') {
        // The flash holds for its very short life, then pops.
      } else {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= Math.exp(-1.7 * dt);
        p.vy = p.vy * Math.exp(-1.7 * dt) + (p.type === 'smoke' || p.type === 'fire' ? -16 * dt : 0);
        if (p.type === 'casing' || p.type === 'spark') p.vy += 120 * dt;
      }
      if (p.life <= 0) this.particles.splice(i, 1);
    }
    for (let i = this.scuffs.length - 1; i >= 0; i -= 1) {
      this.scuffs[i].life -= dt * 0.06;
      if (this.scuffs[i].life <= 0) this.scuffs.splice(i, 1);
    }
    for (const c of this.cashPickups) {
      c.bob += dt * 3;
      c.age += dt;
    }
    for (const e of this.explosions) e.age += dt;
  }

  drainExplosions() {
    const out = this.explosions.filter((e) => e.age <= 0.02);
    this.explosions = this.explosions.filter((e) => e.age > 0.02);
    return out;
  }
}

// ===========================================================================
// Vehicle
// ===========================================================================
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
    const palette = this.config.colors;
    this.color = color || palette[Math.floor(hash2(x, y, 7) * palette.length) % palette.length];
    this.isPolice = !!this.config.isPolice;

    this.hp = this.config.maxHp;
    this.maxHp = this.config.maxHp;
    this.driver = null;
    this.passengers = [];
    this.isDestroyed = false;
    this.isPlayerVehicle = false;
    this.isMission = false;
    this.aiMode = 'traffic';
    this.cruiseSpeed = PHYSICS_CONFIG.trafficCruiseMin + Math.random() * 90;
    this.despawnTimer = 0;
    this.stuckTimer = 0;
    this.lastX = x;
    this.lastY = y;

    this.sirenActive = this.isPolice;
    this.sirenFlash = 0;
    this.sirenPhase = Math.random() > 0.5;
    this.headlightsOn = true;
    this.brakeLightsOn = false;
    this.indicator = 0;

    this.skidIntensity = 0;
    this.skidTimer = 0;
    this.effectTimer = 0;
    this.impactTimer = 0;
    this.impactPulse = 0;
    this.honkTimer = 0;
    this.alarm = 0;
    this.occupiedByCivilian = false;
    this.lastDriverAngle = angle;
    this.odometer = 0;
    this.panic = 0;
    this.laneOffset = 0;
    this.turnCooldown = 0;
  }

  get isDrivable() {
    return !this.isDestroyed && this.hp > 0;
  }

  get speed() {
    return this.vx * Math.cos(this.angle) + this.vy * Math.sin(this.angle);
  }

  get speedAbs() {
    return Math.hypot(this.vx, this.vy);
  }

  accelerate(factor = 1, dt = 1 / 60) {
    if (!this.isDrivable) return;
    const fx = Math.cos(this.angle);
    const fy = Math.sin(this.angle);
    const boost = this.panic > 0 ? 1.12 : 1;
    const amount = this.config.accel * factor * boost * dt;
    this.vx += fx * amount;
    this.vy += fy * amount;
    const forward = this.vx * fx + this.vy * fy;
    const limit = factor >= 0 ? this.config.topSpeed * (this.panic > 0 ? 1.08 : 1) : this.config.reverseSpeed;
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
    const latX = this.vx - fx * forward;
    const latY = this.vy - fy * forward;
    const next = forward * Math.exp(-this.config.brake * intensity * dt);
    this.vx = fx * next + latX * Math.exp(-2.2 * dt);
    this.vy = fy * next + latY * Math.exp(-2.2 * dt);
  }

  steer(direction) {
    this.steerAngle = clamp(direction, -1, 1);
  }

  update(dt, city, particles, audio) {
    if (this.isDestroyed) {
      this.vx *= Math.exp(-7 * dt);
      this.vy *= Math.exp(-7 * dt);
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      return;
    }

    const fx = Math.cos(this.angle);
    const fy = Math.sin(this.angle);
    let forward = this.vx * fx + this.vy * fy;
    let lateral = -this.vx * fy + this.vy * fx;

    const speedFactor = Math.min(1, Math.abs(forward) / 130);
    if (this.handbrake) this.steerAngle *= 0.985;
    this.angle += this.steerAngle * this.config.turnSpeed * speedFactor * Math.sign(forward || 1) * dt;

    const grip = this.handbrake ? this.config.driftGrip : this.config.grip;
    lateral *= Math.exp(-grip * dt);
    forward *= Math.exp(-0.58 * dt);

    const nfx = Math.cos(this.angle);
    const nfy = Math.sin(this.angle);
    this.vx = nfx * forward - nfy * lateral;
    this.vy = nfy * forward + nfx * lateral;

    const slip = Math.abs(lateral);
    this.skidIntensity = clamp((slip - 26) / 105, 0, 1);
    if (this.skidIntensity > 0.05 && Math.abs(forward) > 42) {
      this.skidTimer += dt;
      if (this.skidTimer > 0.045) {
        const rearDist = -this.length * 0.34;
        const halfW = this.width * 0.34;
        const rx = -nfy;
        const ry = nfx;
        const x1 = this.x + nfx * rearDist + rx * halfW;
        const y1 = this.y + nfy * rearDist + ry * halfW;
        const x2 = this.x + nfx * rearDist - rx * halfW;
        const y2 = this.y + nfy * rearDist - ry * halfW;
        city.addSkidMark(x1, y1, this.angle, this.skidIntensity * 0.58);
        city.addSkidMark(x2, y2, this.angle, this.skidIntensity * 0.58);
        if (this.skidIntensity > 0.22) {
          particles.spawnTyreSmoke(x1, y1, this.skidIntensity);
          particles.spawnTyreSmoke(x2, y2, this.skidIntensity);
        }
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
      const len = Math.hypot(hit.x, hit.y) || 1;
      const ux = hit.x / len;
      const uy = hit.y / len;
      const into = this.vx * ux + this.vy * uy;
      if (into < 0) {
        this.vx -= ux * into * 1.55;
        this.vy -= uy * into * 1.55;
      }
      const impactSpeed = Math.abs(into);
      if (impactSpeed > 80 && this.impactTimer <= 0) {
        this.impactTimer = 0.26;
        this.impactPulse = Math.min(1, impactSpeed / 520);
        this.takeDamage(impactSpeed * 0.055, particles, audio);
        particles.spawnSparks(this.x + ux * radius, this.y + uy * radius, 7, 1.1);
        particles.spawnDust(this.x + ux * radius, this.y + uy * radius, 2, 6);
      }
      if (hit.collider.type === 'water') {
        this.vx *= 0.7;
        this.vy *= 0.7;
        if (Math.random() < 0.16) particles.spawnSplash(this.x, this.y);
      }
    } else {
      this.x = clamp(nextX, 20, city.width - 20);
      this.y = clamp(nextY, 20, city.height - 20);
    }

    this.impactTimer -= dt;
    this.impactPulse *= Math.exp(-4 * dt);
    this.odometer += Math.hypot(this.x - this.lastX, this.y - this.lastY);
    this.lastX = this.x;
    this.lastY = this.y;

    if (this.isPolice && this.sirenActive) {
      this.sirenFlash += dt;
      if (this.sirenFlash > 0.17) {
        this.sirenPhase = !this.sirenPhase;
        this.sirenFlash = 0;
      }
    }
    if (this.alarm > 0) this.alarm = Math.max(0, this.alarm - dt);
    if (this.panic > 0) this.panic = Math.max(0, this.panic - dt);

    this.effectTimer -= dt;
    if (this.effectTimer <= 0) {
      this.effectTimer = 0.11;
      const hx = this.x + nfx * this.length * 0.33;
      const hy = this.y + nfy * this.length * 0.33;
      if (this.hp < this.maxHp * 0.5) particles.spawnSmoke(hx, hy, 'rgba(185, 185, 190, 0.4)', 1, 7, 24);
      if (this.hp < this.maxHp * 0.24) {
        particles.spawnFire(hx, hy, 1, 8);
        particles.spawnSmoke(hx, hy, 'rgba(28, 26, 31, 0.7)', 1, 12, 34);
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
    if (this.driver && this.driver.takeDamage && this.driver.isPlayer !== false) {
      this.driver.takeDamage(120, particles, audio);
    }
  }
}

// ===========================================================================
// Player
// ===========================================================================
export class Player {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.angle = -Math.PI / 2;
    this.facing = 2;
    this.radius = PHYSICS_CONFIG.playerRadius;

    this.health = 100;
    this.maxHealth = 100;
    this.armor = 25;
    this.maxArmor = 100;
    this.money = 500;
    this.score = 0;

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
    this.walkPhase = 0;
    this.footstepTimer = 0;
    this.sprinting = false;
    this.moving = false;
    this.animState = 'idle';
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
      this.fireCooldown = Math.max(this.fireCooldown, 0.1);
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
    if (!mag) return;
    mag.reserve = Math.min(config.maxReserve, mag.reserve + config.clipSize * clips);
    if (mag.clip <= 0) mag.clip = Math.min(config.clipSize, mag.reserve);
    this.setWeapon(this.inventory.indexOf(id));
  }

  takeDamage(amount, particles, audio, dir = null) {
    if (this.isRolling || this.iFrames > 0 || this.health <= 0) return;
    this.iFrames = 0.26;
    this.hitFlash = 1;
    this.lastDamageAt = 0;
    if (particles) particles.spawnHit(this.x, this.y, 6, dir);
    if (this.armor > 0) {
      const absorbed = Math.min(this.armor, amount * 0.68);
      this.armor -= absorbed;
      this.health -= amount - absorbed;
    } else {
      this.health -= amount;
    }
    this.health = Math.max(0, this.health);
    if (audio && Math.random() > 0.35) audio.playHurt();
  }

  heal(amount) {
    this.health = Math.min(this.maxHealth, this.health + amount);
  }

  addArmor(amount) {
    this.armor = Math.min(this.maxArmor, this.armor + amount);
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
    this.animState = 'roll';
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

    if (this.isInVehicle) {
      this.x = this.vehicle.x;
      this.y = this.vehicle.y;
      this.angle = this.vehicle.angle;
      this.vx = this.vehicle.vx;
      this.vy = this.vehicle.vy;
      this.facing = facingFromAngle(this.angle);
      this.animState = 'drive';
      return;
    }
    if (this.hotwire) {
      this.animState = 'hotwire';
      return;
    }

    if (this.isRolling) {
      this.rollTimer -= dt;
      this.vx = Math.cos(this.rollAngle) * PHYSICS_CONFIG.playerRollSpeed;
      this.vy = Math.sin(this.rollAngle) * PHYSICS_CONFIG.playerRollSpeed;
      this.angle = this.rollAngle;
      this.facing = facingFromAngle(this.angle);
      if (particles && Math.random() < 0.55) particles.spawnFootstep(this.x, this.y);
      if (this.rollTimer <= 0) {
        this.isRolling = false;
        this.animState = 'idle';
      }
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
        const rate = this.sprinting ? 15 : 9.5;
        this.walkCycle += dt * rate;
        this.walkPhase = (this.walkPhase + dt * rate) % (Math.PI * 2);
        this.footstepTimer += dt;
        if (this.footstepTimer > (this.sprinting ? 0.2 : 0.31)) {
          if (particles) particles.spawnFootstep(this.x, this.y);
          this.footstepTimer = 0;
          if (audio) audio.playFootstep();
        }
        this.moving = true;
        this.animState = this.sprinting ? 'run' : 'walk';
      } else {
        this.vx *= Math.exp(-11 * dt);
        this.vy *= Math.exp(-11 * dt);
        this.moving = false;
        this.animState = this.isReloading ? 'reload' : 'idle';
      }
      this.angle = Math.atan2(input.mouse.worldY - this.y, input.mouse.worldX - this.x);
      const moveFacing = facingFromAngle(len > 0 ? Math.atan2(my, mx) : this.angle);
      this.facing = this.moving ? moveFacing : facingFromAngle(this.angle);
    }

    const nextX = this.x + this.vx * dt;
    const nextY = this.y + this.vy * dt;
    const hit = city.collideCircle(nextX, nextY, this.radius);
    if (hit) {
      this.x += hit.x;
      this.y += hit.y;
    } else {
      this.x = clamp(nextX, this.radius, city.width - this.radius);
      this.y = clamp(nextY, this.radius, city.height - this.radius);
    }

    for (let i = (particles?.cashPickups.length ?? 0) - 1; i >= 0; i -= 1) {
      const c = particles.cashPickups[i];
      if (Math.hypot(this.x - c.x, this.y - c.y) < 40) {
        this.money += c.amount;
        if (audio) audio.playCash();
        particles.cashPickups.splice(i, 1);
      }
    }
  }
}

// ===========================================================================
// Pedestrian
// ===========================================================================
const SHIRTS = ['#b45b67', '#4c8f94', '#b7a552', '#618668', '#b17a50', '#cfc7b8', '#3b3942', '#7d6c8f', '#d78b55'];
const PANTS = ['#3b4a63', '#556069', '#66513f', '#2c2c32', '#898887', '#455767', '#6b4e3d'];
const SKIN = ['#e2b58e', '#c99366', '#a87048', '#82563a', '#e6c3a2', '#f0c7a2'];

export class Pedestrian {
  constructor(x, y, rng = Math.random, lane = null) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.angle = lane ? lane.angle : rng() * TAU;
    this.facing = facingFromAngle(this.angle);
    this.lane = lane;
    this.speed = 52 + rng() * 26;
    this.baseSpeed = this.speed;
    this.health = 40;
    this.maxHealth = 40;
    this.isDead = false;
    this.state = 'walk';
    this.stateTimer = 2 + rng() * 3;
    this.crossTimer = 0;
    this.radius = 11;
    this.hitFlash = 0;
    this.reactTimer = 0;

    this.shirt = SHIRTS[Math.floor(rng() * SHIRTS.length)];
    this.pants = PANTS[Math.floor(rng() * PANTS.length)];
    this.skin = SKIN[Math.floor(rng() * SKIN.length)];
    this.hair = rng() > 0.5 ? '#2a211d' : '#6a4a2f';
    this.umbrella = rng() < 0.22;
    this.bag = !this.umbrella && rng() < 0.38;
    this.hat = rng() < 0.18;
    this.bob = rng() * 6;
    this.walkPhase = rng() * TAU;
    this.panicTimer = 0;
    this.deadAngle = 0;
    this.rng = rng;
    this.isPedestrian = true;
    this.robbed = false;
    this.isCop = false;
    this.speaking = 0;
  }

  takeDamage(amount, particles, audio, dir = null) {
    if (this.isDead) return;
    this.health -= amount;
    this.hitFlash = 1;
    if (particles) particles.spawnHit(this.x, this.y, 4, dir);
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
      particles.spawnHit(this.x, this.y, 12);
      particles.spawnCash(this.x, this.y, 15 + Math.floor(Math.random() * 65));
    }
  }

  fleeFrom(x, y) {
    if (this.isDead) return;
    this.state = 'flee';
    this.panicTimer = 4 + Math.random() * 3;
    this.speed = 145 + Math.random() * 45;
    this.angle = Math.atan2(this.y - y, this.x - x) + (Math.random() - 0.5) * 0.5;
    this.facing = facingFromAngle(this.angle);
    this.vx = Math.cos(this.angle) * this.speed;
    this.vy = Math.sin(this.angle) * this.speed;
  }

  panic(fromX, fromY, radius) {
    if (this.isDead) return;
    if (Math.hypot(this.x - fromX, this.y - fromY) < radius) this.fleeFrom(fromX, fromY);
  }

  reactToCar(carX, carY, carAngle) {
    if (this.isDead || this.state === 'flee') return;
    this.state = 'react';
    this.reactTimer = 0.55;
    this.angle = Math.atan2(this.y - carY, this.x - carX);
    this.facing = facingFromAngle(this.angle);
    this.vx = Math.cos(this.angle) * 120;
    this.vy = Math.sin(this.angle) * 120;
  }

  update(dt, city, particles) {
    this.hitFlash = Math.max(0, this.hitFlash - dt * 3);
    if (this.isDead) return;

    if (this.state === 'react') {
      this.reactTimer -= dt;
      if (this.reactTimer <= 0) this.fleeFrom(this.x - Math.cos(this.angle) * 20, this.y - Math.sin(this.angle) * 20);
    }

    if (this.state === 'flee') {
      this.panicTimer -= dt;
      this.speed = Math.max(this.speed - dt * 10, 72);
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
          if (this.nearSignal(city, 70) && Math.random() < 0.45) {
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
          if (this.nearSignal(city, 70) && Math.random() < 0.45) {
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
      this.x = clamp(nextX, 10, city.width - 10);
      this.y = clamp(nextY, 10, city.height - 10);
    }

    this.bob += dt * (this.state === 'flee' ? 12 : 6);
    this.walkPhase = (this.walkPhase + dt * (this.state === 'flee' ? 12 : 6.5)) % TAU;
    this.facing = facingFromAngle(this.state === 'flee' ? this.angle : (this.lane ? this.angle : this.angle));
    if (this.state === 'flee' && Math.random() < 0.03) particles.spawnFootstep(this.x, this.y);
  }

  nearSignal(city, radius) {
    for (const i of city.intersections) {
      if (Math.abs(this.x - i.x) < radius && Math.abs(this.y - i.y) < radius) return true;
    }
    return false;
  }
}

export { facingFromAngle, PALETTE };
