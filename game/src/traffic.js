// Leonida Heat - ambient traffic, parked cars and carjacking.
// Cars keep to the right-hand lane, stop for red lights and for the car in
// front, and are replaced when they drift out of the player's bubble.

import { Vehicle } from './entities.js';
import { CIVILIAN_VEHICLES, VEHICLE_TYPES } from './config.js';
import { pick, range } from './rng.js';

export class TrafficManager {
  constructor(city, rng = Math.random) {
    this.city = city;
    this.rng = rng;
    this.vehicles = [];
    this.parked = [];
    this.maxTraffic = 26;
    this.maxParked = 30;
    this.spawnTimer = 0;
    this.honkCooldown = 0;
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
    if (this.vehicles.some((v) => Math.hypot(v.x - p.x, v.y - p.y) < 112)) return null;
    const id = archetype || pick(this.rng, CIVILIAN_VEHICLES);
    const car = new Vehicle(id, p.x, p.y, p.angle);
    car.aiMode = 'traffic';
    car.road = road;
    car.direction = direction;
    car.cruiseSpeed = 150 + this.rng() * 110;
    car.laneProgress = progress;
    car.driver = { isCivilian: true };
    car.occupiedByCivilian = true;
    this.vehicles.push(car);
    return car;
  }

  seed(centerX, centerY, trafficCount = 14, parkedCount = 12) {
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
      for (let i = 0; i < 5 && spawned < trafficCount; i += 1) {
        const dir = this.rng() > 0.5 ? 1 : -1;
        const progress = Math.max(0.06, Math.min(0.94, base + range(this.rng, -0.2, 0.2)));
        const car = this.spawnOnRoad(road, progress, dir);
        if (car && Math.hypot(car.x - centerX, car.y - centerY) < 1300) spawned += 1;
      }
    }

    // Fill visible parking bays with parked cars.
    const spots = this.city.parkingSpots
      .map((spot) => ({ spot, d: Math.hypot(spot.x - centerX, spot.y - centerY) }))
      .sort((a, b) => a.d - b.d);
    for (const { spot } of spots) {
      if (this.parked.length >= parkedCount) break;
      if (spot.occupied) continue;
      if (Math.hypot(spot.x - centerX, spot.y - centerY) > 1150) continue;
      spot.occupied = true;
      const id = pick(this.rng, ['meridian', 'meridian', 'marlin', 'vipera', 'hauler', 'wasp']);
      const car = new Vehicle(id, spot.x, spot.y, spot.angle);
      car.aiMode = 'parked';
      car.spot = spot;
      this.parked.push(car);
    }
  }

  maintain(player) {
    if (this.vehicles.length < this.maxTraffic) {
      const point = this.city.randomRoadPoint(player.x, player.y, 620, 1100, this.rng);
      const road = point.road;
      if (road) {
        const dir = this.rng() > 0.5 ? 1 : -1;
        this.spawnOnRoad(road, range(this.rng, 0.1, 0.9), dir);
      }
    }
    for (let i = this.vehicles.length - 1; i >= 0; i -= 1) {
      const v = this.vehicles[i];
      if (v === player.vehicle || v.isMission) continue;
      if (Math.hypot(v.x - player.x, v.y - player.y) > 1650) {
        this.vehicles.splice(i, 1);
      }
    }
  }

  update(dt, player, particleSys, audio, police) {
    this.spawnTimer += dt;
    this.honkCooldown -= dt;
    if (this.spawnTimer > 1.1) {
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
      if (v === player.vehicle) {
        continue;
      }
      if (player.hotwire && player.hotwire.vehicle === v) {
        v.brake(1, dt);
        v.update(dt, this.city, particleSys, audio);
        continue;
      }
      if (!v.driver || v.aiMode === 'parked') {
        v.brake(0.4, dt);
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

  driveCivilian(v, dt, player, audio, police) {
    const fx = Math.cos(v.angle);
    const fy = Math.sin(v.angle);
    let brake = false;
    let emergency = 0;
    let redDist = Infinity;
    let aheadRef = null;
    let aheadDist = Infinity;

    // Keep a clean gap to the vehicle ahead.
    for (const other of this.vehicles) {
      if (other === v || other.isDestroyed) continue;
      const dx = other.x - v.x;
      const dy = other.y - v.y;
      const forwardDist = dx * fx + dy * fy;
      const sideDist = Math.abs(-dx * fy + dy * fx);
      if (forwardDist > 0 && forwardDist < 118 && sideDist < 30) {
        brake = true;
        emergency = Math.max(emergency, forwardDist < 86 ? 2 : 1);
        aheadRef = other;
        aheadDist = forwardDist;
        break;
      }
    }
    if (player.isInVehicle && player.vehicle && !player.vehicle.isDestroyed) {
      const dx = player.vehicle.x - v.x;
      const dy = player.vehicle.y - v.y;
      const fd = dx * fx + dy * fy;
      const sd = Math.abs(-dx * fy + dy * fx);
      if (fd > 0 && fd < 122 && sd < 30) {
        brake = true;
        emergency = Math.max(emergency, fd < 90 ? 2 : 1);
        aheadRef = player.vehicle;
        aheadDist = fd;
      }
    }

    // Red light: stop before the crosswalk, never on it. The shared light at
    // each intersection is staggered when the city is generated.
    if (v.road) {
      for (const inter of this.city.intersections) {
        const light = inter.light;
        if (!light || light.state !== 'red') continue;
        let stopDist = 0;
        let d = 0;
        const nose = v.length / 2 + 66;
        if (v.road.horizontal) {
          if (Math.abs(inter.y - v.road.y1) > 2) continue;
          if (v.direction > 0) {
            stopDist = inter.x - inter.vWidth / 2 - nose;
            d = stopDist - v.x;
          } else {
            stopDist = inter.x + inter.vWidth / 2 + nose;
            d = v.x - stopDist;
          }
        } else {
          if (Math.abs(inter.x - v.road.x1) > 2) continue;
          if (v.direction > 0) {
            stopDist = inter.y - inter.hWidth / 2 - nose;
            d = stopDist - v.y;
          } else {
            stopDist = inter.y + inter.hWidth / 2 + nose;
            d = v.y - stopDist;
          }
        }
        if (d > 0 && d < 150) {
          redDist = Math.min(redDist, d);
          break;
        }
        if (d <= 0 && d > -160) {
          // Already crossing; clear the junction rather than stopping in it.
          break;
        }
      }
    }

    // Keep to the lane towards a point ahead.
    if (v.road) {
      const ahead = 110;
      let tx = v.x + fx * ahead;
      let ty = v.y + fy * ahead;
      if (v.road.horizontal) ty = v.road.y1 + v.direction * (v.road.width / 4);
      else tx = v.road.x1 - v.direction * (v.road.width / 4);
      const desired = Math.atan2(ty - v.y, tx - v.x);
      let diff = desired - v.angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      v.steer(Math.max(-1, Math.min(1, diff * 2.6)));
    } else {
      v.steer(0);
    }

    // A stopped queue keeps at least a bumper's gap, never overlapping.
    if (aheadRef) {
      const minGap = (v.length + aheadRef.length) / 2 + 32;
      if (aheadDist < minGap) {
        const overlap = minGap - aheadDist;
        v.x -= fx * overlap;
        v.y -= fy * overlap;
        v.vx *= 0.2;
        v.vy *= 0.2;
      }
    }

    if (redDist < Infinity && !aheadRef) {
      // Creep up to the line instead of stopping a bus length early.
      const cap = Math.max(0, redDist * 1.9 - 4);
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
      if (v.honkTimer > 2.8 && this.honkCooldown <= 0) {
        this.honkCooldown = 1.3;
        if (audio) audio.playHorn(0.25);
        v.honkTimer = 0;
      }
    } else {
      v.honkTimer = 0;
      const factor = Math.min(1, v.cruiseSpeed / 300);
      v.accelerate(factor, dt);
    }

    // If a pedestrian has wandered into the road, slow gently; the game's
    // pedestrian update owns panic, this only keeps room.
    // Out of the play area: quietly remove on the next maintenance pass.
    if (v.x < 10 || v.x > this.city.width - 10 || v.y < 10 || v.y > this.city.height - 10) {
      v.despawnTimer += dt;
      if (v.despawnTimer > 2) v.hp = 1;
    }
  }

  findNearestVehicle(x, y, maxDist = 72) {
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
      player.hotwire = { vehicle, timer: 1.15, total: 1.15 };
      if (ui) ui.showToast('Hotwiring — keep still!', 'warning', 1.4);
      if (audio) audio.playHotwire();
      vehicle.alarm = 1;
      return true;
    }
    this.completeEnter(player, vehicle, audio, ui, police);
    return true;
  }

  completeEnter(player, vehicle, audio, ui, police) {
    vehicle.driver = player;
    vehicle.isPlayerVehicle = true;
    vehicle.aiMode = 'player';
    vehicle.occupiedByCivilian = false;
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
    const exitDist = v.width * 0.7 + 22;
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
