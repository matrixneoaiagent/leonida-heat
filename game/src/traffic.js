// Leonida Heat - ambient traffic.
// Civilian cars keep to the right-hand lane, brake for the car ahead, obey
// signal heads, yield when a junction is occupied, honk when stuck and
// scatter when gunfire starts. Spawning and recycling happen outside the
// player's bubble so the street never visibly pops.

import { Vehicle } from './entities.js';
import { CIVILIAN_VEHICLES, PHYSICS_CONFIG } from './config.js';
import { pick, range } from './rng.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export class TrafficManager {
  constructor(city, rng = Math.random) {
    this.city = city;
    this.rng = rng;
    this.vehicles = [];
    this.parked = [];
    this.maxTraffic = 28;
    this.maxParked = 34;
    this.spawnTimer = 0;
    this.honkCooldown = 0;
    this.panic = 0;
    this.lastPanic = { x: 0, y: 0, r: 0 };
  }

  lanePoint(road, progress, direction) {
    if (road.horizontal) {
      const y = road.y1 + direction * (road.width / 4);
      return { x: road.x1 + (road.x2 - road.x1) * progress, y, angle: direction > 0 ? 0 : Math.PI };
    }
    const x = road.x1 - direction * (road.width / 4);
    return { x, y: road.y1 + (road.y2 - road.y1) * progress, angle: direction > 0 ? Math.PI / 2 : -Math.PI / 2 };
  }

  spawnOnRoad(road, progress, direction, archetype = null) {
    const p = this.lanePoint(road, progress, direction);
    if (p.x < 30 || p.x > 2660 || p.y < 30 || p.y > 3170) return null;
    if (this.city.pointBlocked(p.x, p.y, 26)) return null;
    if (this.vehicles.some((v) => Math.hypot(v.x - p.x, v.y - p.y) < 118)) return null;
    const id = archetype || pick(this.rng, CIVILIAN_VEHICLES);
    const car = new Vehicle(id, p.x, p.y, p.angle);
    car.aiMode = 'traffic';
    car.road = road;
    car.direction = direction;
    car.cruiseSpeed = range(this.rng, PHYSICS_CONFIG.trafficCruiseMin, PHYSICS_CONFIG.trafficCruiseMax);
    car.laneProgress = progress;
    car.driver = { isCivilian: true };
    car.occupiedByCivilian = true;
    car.stuckTimer = 0;
    this.vehicles.push(car);
    return car;
  }

  seed(centerX, centerY, trafficCount = 16, parkedCount = 16) {
    const nearby = this.city.roads
      .map((road) => {
        const mx = (road.x1 + road.x2) / 2;
        const my = (road.y1 + road.y2) / 2;
        return { road, d: Math.hypot(mx - centerX, my - centerY) };
      })
      .sort((a, b) => a.d - b.d);
    let spawned = 0;
    for (const entry of nearby) {
      if (spawned >= trafficCount) break;
      const road = entry.road;
      const base = road.horizontal
        ? (centerX - road.x1) / (road.x2 - road.x1 || 1)
        : (centerY - road.y1) / (road.y2 - road.y1 || 1);
      for (let i = 0; i < 6 && spawned < trafficCount; i += 1) {
        const dir = this.rng() > 0.5 ? 1 : -1;
        const progress = clamp(base + range(this.rng, -0.24, 0.24), 0.06, 0.94);
        const car = this.spawnOnRoad(road, progress, dir);
        if (car && Math.hypot(car.x - centerX, car.y - centerY) < 1350) spawned += 1;
      }
    }

    const spots = this.city.parkingSpots
      .map((spot) => ({ spot, d: Math.hypot(spot.x - centerX, spot.y - centerY) }))
      .sort((a, b) => a.d - b.d);
    for (const { spot } of spots) {
      if (this.parked.length >= parkedCount) break;
      if (spot.occupied) continue;
      if (Math.hypot(spot.x - centerX, spot.y - centerY) > 1150) continue;
      spot.occupied = true;
      const id = pick(this.rng, ['meridian', 'meridian', 'marlin', 'vipera', 'hauler', 'wasp', 'boxer']);
      const car = new Vehicle(id, spot.x, spot.y, spot.angle);
      car.aiMode = 'parked';
      car.spot = spot;
      this.parked.push(car);
    }
  }

  maintain(player) {
    if (this.vehicles.length < this.maxTraffic) {
      const point = this.city.randomRoadPoint(player.x, player.y, 640, 1250, this.rng);
      if (point.road) {
        const dir = this.rng() > 0.5 ? 1 : -1;
        this.spawnOnRoad(point.road, range(this.rng, 0.08, 0.92), dir);
      }
    }
    for (let i = this.vehicles.length - 1; i >= 0; i -= 1) {
      const v = this.vehicles[i];
      if (v === player.vehicle || v.isMission) continue;
      const d = Math.hypot(v.x - player.x, v.y - player.y);
      if (d > 1750 || (v.isDestroyed && d > 800)) this.vehicles.splice(i, 1);
      else if (!v.driver && v.aiMode === 'parked' && d > 1200 && !v.isPlayerVehicle) this.vehicles.splice(i, 1);
    }
    for (let i = this.parked.length - 1; i >= 0; i -= 1) {
      const v = this.parked[i];
      if (v === player.vehicle) continue;
      if (Math.hypot(v.x - player.x, v.y - player.y) > 2200 && !v.isMission) {
        if (v.spot) v.spot.occupied = false;
        this.parked.splice(i, 1);
      }
    }
    // Refill a bay or two near the player.
    if (this.parked.length < this.maxParked) {
      const spot = this.city.parkingSpots.find((s) => !s.occupied && Math.hypot(s.x - player.x, s.y - player.y) < 1000 && !this.parked.some((p) => p.spot === s));
      if (spot) {
        spot.occupied = true;
        const id = pick(this.rng, ['meridian', 'meridian', 'marlin', 'vipera', 'hauler', 'boxer']);
        const car = new Vehicle(id, spot.x, spot.y, spot.angle);
        car.aiMode = 'parked';
        car.spot = spot;
        this.parked.push(car);
      }
    }
  }

  update(dt, player, particleSys, audio, police) {
    this.spawnTimer += dt;
    this.honkCooldown -= dt;
    this.panic = Math.max(0, this.panic - dt);
    if (this.spawnTimer > 1.05) {
      this.spawnTimer = 0;
      this.maintain(player);
    }

    for (let i = this.vehicles.length - 1; i >= 0; i -= 1) {
      const v = this.vehicles[i];
      if (v.isMission && v !== player.vehicle) continue;
      if (v.isDestroyed) {
        v.update(dt, this.city, particleSys, audio);
        if (Math.hypot(v.x - player.x, v.y - player.y) > 900) this.vehicles.splice(i, 1);
        continue;
      }
      if (v === player.vehicle) continue;
      if (player.hotwire && player.hotwire.vehicle === v) {
        v.brake(1, dt);
        v.update(dt, this.city, particleSys, audio);
        continue;
      }
      if (!v.driver || v.aiMode === 'parked' || v.aiMode === 'roadblock') {
        v.brake(0.45, dt);
        v.update(dt, this.city, particleSys, audio);
        continue;
      }
      this.driveCivilian(v, dt, player, audio, police);
      v.update(dt, this.city, particleSys, audio);
    }

    for (const v of this.parked) {
      if (v === player.vehicle) continue;
      if (player.hotwire && player.hotwire.vehicle === v) {
        v.brake(1, dt);
        v.update(dt, this.city, particleSys, audio);
      }
    }
  }

  // A gunshot or a crash sends nearby traffic into a short panic.
  panicAt(x, y, radius = 340) {
    this.panic = 4;
    this.lastPanic = { x, y, r: radius };
    for (const v of this.vehicles) {
      if (!v.driver || v.isDestroyed) continue;
      if (Math.hypot(v.x - x, v.y - y) < radius) {
        v.panic = 3.5 + this.rng() * 2.5;
        v.cruiseSpeed = Math.max(v.cruiseSpeed, 280);
      }
    }
  }

  driveCivilian(v, dt, player, audio, police) {
    const fx = Math.cos(v.angle);
    const fy = Math.sin(v.angle);
    let brake = false;
    let emergency = 0;
    let redDist = Infinity;
    let aheadRef = null;
    let aheadDist = Infinity;
    let blockedByCar = false;

    for (const other of this.vehicles) {
      if (other === v || other.isDestroyed) continue;
      const dx = other.x - v.x;
      const dy = other.y - v.y;
      const forwardDist = dx * fx + dy * fy;
      const sideDist = Math.abs(-dx * fy + dy * fx);
      if (forwardDist > 0 && forwardDist < 135 && sideDist < 34) {
        brake = true;
        emergency = Math.max(emergency, forwardDist < 95 ? 2 : 1);
        aheadRef = other;
        aheadDist = forwardDist;
        blockedByCar = true;
        break;
      }
    }
    if (player.isInVehicle && player.vehicle && !player.vehicle.isDestroyed) {
      const dx = player.vehicle.x - v.x;
      const dy = player.vehicle.y - v.y;
      const fd = dx * fx + dy * fy;
      const sd = Math.abs(-dx * fy + dy * fx);
      if (fd > 0 && fd < 142 && sd < 36) {
        brake = true;
        emergency = Math.max(emergency, fd < 96 ? 2 : 1);
        aheadRef = player.vehicle;
        aheadDist = fd;
        blockedByCar = true;
      }
    }

    // Signal obedience and junction yielding.
    if (v.road) {
      for (const inter of this.city.intersections) {
        const light = inter.light;
        if (!light) continue;
        let stopDist = 0;
        let d = 0;
        const nose = v.length / 2 + 68;
        if (v.road.horizontal) {
          if (Math.abs(inter.y - v.road.y1) > 3) continue;
          if (v.direction > 0) {
            stopDist = inter.x - inter.vWidth / 2 - nose;
            d = stopDist - v.x;
          } else {
            stopDist = inter.x + inter.vWidth / 2 + nose;
            d = v.x - stopDist;
          }
        } else {
          if (Math.abs(inter.x - v.road.x1) > 3) continue;
          if (v.direction > 0) {
            stopDist = inter.y - inter.hWidth / 2 - nose;
            d = stopDist - v.y;
          } else {
            stopDist = inter.y + inter.hWidth / 2 + nose;
            d = v.y - stopDist;
          }
        }
        if (d > 0 && d < 165) {
          if (light.state === 'red') redDist = Math.min(redDist, d);
          // Yield to a car already in the box unless we are already inside.
          const inBox = Math.abs(v.x - inter.x) < inter.vWidth / 2 + 8 && Math.abs(v.y - inter.y) < inter.hWidth / 2 + 8;
          if (!inBox && d < 95 && this.junctionOccupied(inter, v)) redDist = Math.min(redDist, d);
          break;
        }
      }
    }

    // Lane target a little ahead of the nose.
    if (v.road) {
      const ahead = 116;
      let tx = v.x + fx * ahead;
      let ty = v.y + fy * ahead;
      if (v.road.horizontal) ty = v.road.y1 + v.direction * (v.road.width / 4);
      else tx = v.road.x1 - v.direction * (v.road.width / 4);
      const desired = Math.atan2(ty - v.y, tx - v.x);
      let diff = desired - v.angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      let steer = clamp(diff * 2.8, -1, 1);
      // A little panic swerve.
      if (v.panic > 0) steer += Math.sin(v.odometer * 0.05) * 0.18;
      v.steer(steer);
    } else {
      v.steer(0);
    }

    const progress = v.road
      ? (v.road.horizontal
        ? (v.x - v.road.x1) / (v.road.x2 - v.road.x1 || 1)
        : (v.y - v.road.y1) / (v.road.y2 - v.road.y1 || 1))
      : 0.5;
    v.laneProgress = progress;
    // Turn around at the end of the block rather than driving off the map.
    if (v.road && (progress > 0.985 || progress < 0.015)) {
      v.direction *= -1;
      v.vx *= 0.65;
      v.vy *= 0.65;
      v.laneProgress = clamp(progress, 0.02, 0.98);
    }

    if (aheadRef) {
      const minGap = (v.length + aheadRef.length) / 2 + 34;
      if (aheadDist < minGap) {
        const overlap = minGap - aheadDist;
        v.x -= fx * overlap;
        v.y -= fy * overlap;
        v.vx *= 0.2;
        v.vy *= 0.2;
      }
    }

    if (redDist < Infinity && !aheadRef) {
      const cap = Math.max(0, redDist * 1.9 - 5);
      if (v.speed > cap) {
        const f = v.speed;
        if (f > cap) {
          v.vx -= fx * (f - cap);
          v.vy -= fy * (f - cap);
        }
        v.brake(0.7, dt);
      } else if (redDist > 8) {
        v.accelerate(0.16, dt);
      } else {
        v.vx *= Math.exp(-9 * dt);
        v.vy *= Math.exp(-9 * dt);
      }
      v.honkTimer = 0;
    } else if (brake) {
      v.brake(emergency === 2 ? 1 : 0.8, dt);
      if (emergency === 2) {
        v.vx *= Math.exp(-7 * dt);
        v.vy *= Math.exp(-7 * dt);
      }
      v.honkTimer += dt;
      if (blockedByCar && v.honkTimer > 2.6 && this.honkCooldown <= 0) {
        this.honkCooldown = 1.2;
        if (audio) audio.playHorn(0.22);
        v.honkTimer = 0;
      }
    } else {
      v.honkTimer = 0;
      const factor = v.panic > 0 ? 1 : Math.min(1, v.cruiseSpeed / 300);
      v.accelerate(factor, dt);
    }

    // Stuck detection: nudge around a blocked box after a while.
    if (Math.hypot(v.x - v.lastX, v.y - v.lastY) < 1.2 && v.speed < 8) v.stuckTimer += dt;
    else v.stuckTimer = 0;
    if (v.stuckTimer > 7) {
      v.stuckTimer = 0;
      v.brake(1, dt);
      v.angle += (this.rng() - 0.5) * 0.8;
    }

    if (v.x < 10 || v.x > this.city.width - 10 || v.y < 10 || v.y > this.city.height - 10) {
      v.despawnTimer += dt;
      if (v.despawnTimer > 2) v.hp = 1;
    }
    void police;
  }

  junctionOccupied(inter, self) {
    for (const other of this.vehicles) {
      if (other === self || other.isDestroyed) continue;
      if (Math.abs(other.x - inter.x) < inter.vWidth / 2 + 10 && Math.abs(other.y - inter.y) < inter.hWidth / 2 + 10) return true;
    }
    return false;
  }

  findNearestVehicle(x, y, maxDist = 76) {
    let best = null;
    let bestD = maxDist;
    for (const v of [...this.vehicles, ...this.parked]) {
      if (v.isDestroyed) continue;
      const d = Math.hypot(v.x - x, v.y - y);
      if (d < bestD) {
        bestD = d;
        best = v;
      }
    }
    return best;
  }

  enterVehicle(player, vehicle, audio, ui, police) {
    if (!vehicle || vehicle.isDestroyed) return false;
    if (vehicle.occupiedByCivilian) {
      player.hotwire = { vehicle, timer: 1.05, total: 1.05 };
      if (ui) ui.showToast('Hotwiring — keep still!', 'warning', 1.4);
      if (audio) audio.playHotwire();
      vehicle.alarm = 1.2;
      return true;
    }
    this.completeEnter(player, vehicle, audio, ui, police);
    return true;
  }

  completeEnter(player, vehicle, audio, ui, police) {
    const parkedIndex = this.parked.indexOf(vehicle);
    if (parkedIndex >= 0) {
      this.parked.splice(parkedIndex, 1);
      if (vehicle.spot) vehicle.spot.occupied = false;
    }
    if (!this.vehicles.includes(vehicle)) this.vehicles.push(vehicle);
    vehicle.driver = player;
    vehicle.isPlayerVehicle = true;
    vehicle.aiMode = 'player';
    vehicle.occupiedByCivilian = false;
    vehicle.brakeLightsOn = false;
    player.vehicle = vehicle;
    player.x = vehicle.x;
    player.y = vehicle.y;
    player.vx = 0;
    player.vy = 0;
    player.hotwire = null;
    if (audio) audio.startEngine(vehicle.config.engineNote);
    if (ui) ui.showToast(`Stole ${vehicle.config.name}`, 'success', 1.6);
    if (police && police.witnessedCarjack(vehicle.x, vehicle.y)) {
      police.raiseWanted(1);
      if (ui) ui.showToast('A patrol saw the carjack!', 'danger', 2.2);
    }
  }

  ejectDriver(vehicle, particles, audio) {
    const angle = vehicle.angle + Math.PI / 2;
    const ped = {
      x: vehicle.x + Math.cos(angle) * 34,
      y: vehicle.y + Math.sin(angle) * 34,
      fleeFrom() {},
    };
    vehicle.driver = null;
    vehicle.occupiedByCivilian = false;
    if (particles) particles.spawnFootstep(ped.x, ped.y);
    if (audio) audio.playHorn(0.6);
    return ped;
  }

  exitVehicle(player, city, audio, ui) {
    const v = player.vehicle;
    if (!v) return;
    const exitDist = v.width * 0.7 + 23;
    let best = null;
    for (const side of [1, -1, 0]) {
      const nx = v.x - Math.sin(v.angle) * exitDist * side + Math.cos(v.angle) * (side === 0 ? -v.length * 0.55 : 0);
      const ny = v.y + Math.cos(v.angle) * exitDist * side + Math.sin(v.angle) * (side === 0 ? -v.length * 0.55 : 0);
      if (!city.pointBlocked(nx, ny, player.radius + 2)) {
        best = { x: nx, y: ny };
        break;
      }
    }
    if (!best) best = { x: v.x - Math.sin(v.angle) * exitDist, y: v.y + Math.cos(v.angle) * exitDist };
    v.driver = null;
    v.isPlayerVehicle = false;
    v.aiMode = 'parked';
    v.occupiedByCivilian = false;
    v.vx *= 0.2;
    v.vy *= 0.2;
    player.vehicle = null;
    player.x = best.x;
    player.y = best.y;
    player.vx = v.vx * 0.3;
    player.vy = v.vy * 0.3;
    player.hotwire = null;
    if (audio) audio.stopEngine();
    if (ui) ui.showToast('On foot', 'neutral', 1.1);
  }
}
