/* LEONIDA HEAT 3D — ambient traffic and sidewalk pedestrians.
   Cars follow directed lane edges on world.roadGraph with cheap car-following,
   crossing pauses and off-screen respawns. Pedestrians loop block perimeters,
   cross at corners, flee gunfire and are replaced when they wander too far.
   Classic script; attaches LH.Traffic to the global namespace. */
(function () {
  'use strict';   window.LH = window.LH || {};   var CFG = window.LH.CONFIG || {};   var WCFG = CFG.WORLD || {};   var VCFG = CFG.VEHICLES || {};   var TAU = Math.PI * 2;   var CAR_COUNT = 18;   var PED_COUNT = 20;   var SIDEWALK_OFF = 39.5;   var AMBIENT_TYPES = ['sedan', 'sedan', 'coupe', 'van', 'taxi', 'sports', 'sedan', 'coupe'];   function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }   function dist2(ax, az, bx, bz) {
    var dx = ax - bx, dz = az - bz;     return Math.sqrt(dx * dx + dz * dz);   }   function wrap(a) {
    a = (a + Math.PI) % TAU;     if (a < 0) a += TAU;     return a - Math.PI;   }   function Traffic(scene, world, rng) {
    this.scene = scene || null;     this.world = world || null;     this.rng = rng || (window.LH.RNG ? window.LH.RNG('costa-traffic') : null);     this.cars = [];     this.peds = [];     this.drivers = [];     this.onPedHit = null;     this._time = 0;     this._near = [];     this._tmpVec = new THREE.Vector3();
    this._tmpPose = { x: 0, z: 0, heading: 0 };     this._tmpThreat = { x: 0, z: 0 };     this._outgoing = [];     this._playerHitCd = 0;     this._buildOutgoing();     var anchor = (world && world.spawn) || { x: 0, z: 0 };
    for (var i = 0; i < CAR_COUNT; i++) this._addCar(i);     for (var p = 0; p < PED_COUNT; p++) this._addPed(p);     this.spawnAround(anchor);   }   Traffic.prototype._rand = function (a, b) {
    return this.rng ? this.rng.range(a, b) : a + Math.random() * (b - a);   };   Traffic.prototype._chance = function (p) {
    return this.rng ? this.rng.chance(p) : Math.random() < p;   };   Traffic.prototype._pick = function (arr) {
    return this.rng ? this.rng.pick(arr) : arr[Math.floor(Math.random() * arr.length)];   };   Traffic.prototype._buildOutgoing = function () {
    var graph = this.world && this.world.roadGraph;     if (!graph || !graph.edges) return;     for (var i = 0; i < graph.nodes.length; i++) this._outgoing[i] = [];     for (var e = 0; e < graph.edges.length; e++) {
      var edge = graph.edges[e];       if (this._outgoing[edge.a]) this._outgoing[edge.a].push(edge);     }
  };   Traffic.prototype._pointOnEdge = function (edge, d, out) {
    var res = out || this._tmpPose;     var dx = edge.bx - edge.ax;     var dz = edge.bz - edge.az;     var len = edge.length || Math.sqrt(dx * dx + dz * dz) || 1;     var t = clamp(d / len, 0, 1);     var nx = -dz / len;
    var nz = dx / len;     var off = (edge.dir === -1 ? -1 : 1) * 2.2;     res.x = edge.ax + dx * t + nx * off;     res.z = edge.az + dz * t + nz * off;     res.heading = edge.heading;     return res;
  };   Traffic.prototype._pickRoadPose = function (cx, cz, minD, maxD, behindDir) {
    var graph = this.world && this.world.roadGraph;     if (!graph || !graph.edges || !graph.edges.length) {
      return { x: cx, z: cz, heading: 0, edge: null, progress: 0 };     }
    var fallback = null;     var avoid = this.cars;     for (var attempt = 0; attempt < 40; attempt++) {
      var edge = this._pick(graph.edges);       var t = this._rand(0.12, 0.88);
      var pose = this._pointOnEdge(edge, edge.length * t, { x: 0, z: 0, heading: 0 });       var d = dist2(pose.x, pose.z, cx, cz);
      if (!fallback) fallback = { x: pose.x, z: pose.z, heading: pose.heading, edge: edge, progress: edge.length * t };       if (d < minD || d > maxD) continue;
      if (behindDir) {
        var dot = (pose.x - cx) * Math.sin(behindDir) + (pose.z - cz) * Math.cos(behindDir);         if (dot > -35) continue;
      }
      var hit = this.world && this.world.collideCircle ? this.world.collideCircle(pose.x, pose.z, 1.45) : { hit: false };       if (hit.hit) continue;
      var clear = true;       for (var i = 0; i < avoid.length; i++) {
        var other = avoid[i];         if (!other || other === null || other.pos === undefined) continue;
        if (dist2(pose.x, pose.z, other.pos.x, other.pos.z) < 9) { clear = false; break; }
      }
      if (!clear) continue;       return { x: pose.x, z: pose.z, heading: pose.heading, edge: edge, progress: edge.length * t };
    }
    return fallback;
  };
  Traffic.prototype._addCar = function (index) {
    var type = this._pick(AMBIENT_TYPES);     var def = VCFG[type] || VCFG.sedan || {};
    var colors = def.colors || ['#c8c3b4'];     var color = colors[index % colors.length];     var car = new window.LH.Vehicle(this.scene, this.world, type, {
      x: 0, z: 0, heading: 0, color: color, visible: false
    });     car.aiVehicles = null;     car._traffic = {
      edge: null, nextEdge: null, progress: 0, stopNode: -1,
      stopTimer: 0, gap: 99, stuck: 0, panic: 0, respawn: 0, laneJitter: this._rand(-0.28, 0.28)
    };     this.cars.push(car);     var driver = new window.LH.Ped(this.scene, this.world, {
      x: 0, z: 0, yaw: 0, faction: 'civilian',
      seed: 'driver-' + index + '-' + this._rand(1, 1e6)
    });     driver.setVisible(false);     driver._trafficDriver = true;     car.enter(driver);
    this.drivers.push(driver);     return car;
  };
  Traffic.prototype._addPed = function (index) {
    var ped = new window.LH.Ped(this.scene, this.world, {
      x: 0, z: 0, yaw: this._rand(0, TAU), faction: 'civilian',
      seed: 'sidewalk-' + index + '-' + this._rand(1, 1e6)
    });     ped._loop = { block: null, corner: 0, dir: this._chance(0.5) ? 1 : -1, crossing: 0, nextBlock: null, tx: 0, tz: 0, stuck: 0 };
    ped.showHealthBar = false;     this.peds.push(ped);
    return ped;
  };
  Traffic.prototype._placeCar = function (car, center, minD, maxD, behindDir) {
    if (!car || !center) return false;     if (car.occupiedBy && car.occupiedBy !== car.driver) return false;
    var pose = this._pickRoadPose(center.x, center.z, minD, maxD, behindDir);     if (!pose) return false;
    if (dist2(pose.x, pose.z, center.x, center.z) < 12) return false;
    if (this.world && this.world.collideCircle && this.world.collideCircle(pose.x, pose.z, 1.2).hit) return false;
    car.pos.set(pose.x, (this.world && this.world.groundHeight) ? this.world.groundHeight(pose.x, pose.z) : 0, pose.z);     car.heading = pose.heading;
    car.mesh.rotation.y = pose.heading;     car.speed = 0;
    car.vx = 0;     car.vz = 0;
    car.yawRate = 0;     car.steer = 0;
    car.repair();     car.setVisible(true);
    var t = car._traffic;     t.edge = pose.edge;
    t.nextEdge = null;     t.progress = pose.progress || 0;
    t.stopNode = -1;     t.stopTimer = 0;
    t.stuck = 0;     t.respawn = 0;
    if (car.driver) {
      car.driver.pos.copy(car.pos);       car.driver.mesh.position.copy(car.pos);
      car.driver.setVisible(false);
    }
    return true;
  };
  Traffic.prototype._placePed = function (ped, center, minD, maxD) {
    var blocks = this.world && this.world.blocks;     if (!blocks || !blocks.length) return false;
    for (var attempt = 0; attempt < 32; attempt++) {
      var block = this._pick(blocks);       var sx = this._chance(0.5) ? -1 : 1;
      var sz = this._chance(0.5) ? -1 : 1;       var x = block.cx + sx * SIDEWALK_OFF;
      var z = block.cz + sz * SIDEWALK_OFF;       var d = dist2(x, z, center.x, center.z);
      if (d < minD || d > maxD) continue;       var hit = this.world.collideCircle ? this.world.collideCircle(x, z, 0.45) : { hit: false };
      if (hit.hit) continue;       ped.pos.set(x, (this.world.groundHeight ? this.world.groundHeight(x, z) : 0), z);
      ped.mesh.position.copy(ped.pos);       ped.yaw = Math.atan2(block.cx - x, block.cz - z);
      ped.mesh.rotation.y = ped.yaw;       ped.alive = true;
      ped.health = ped.maxHealth;       ped.deathTime = 0;
      ped.panic = 0;       ped.speed = 0;
      ped.mesh.rotation.z = 0;       ped.setVisible(true);
      var loop = ped._loop;       loop.block = block;
      loop.corner = sx < 0 ? (sz < 0 ? 3 : 0) : (sz < 0 ? 2 : 1);       loop.crossing = 0;
      loop.nextBlock = null;       loop.stuck = 0;
      return true;
    }
    var fb = this._pick(blocks) || blocks[0];     var fx = fb.cx + SIDEWALK_OFF;
    var fz = fb.cz + SIDEWALK_OFF;     var fixed = this.world.collideCircle ? this.world.collideCircle(fx, fz, 0.45) : { x: fx, z: fz };
    ped.pos.set(fixed.x, 0, fixed.z);     ped.mesh.position.copy(ped.pos);
    ped.setVisible(true);     ped._loop.block = fb;
    return false;
  };
  Traffic.prototype.spawnAround = function (pos) {
    var anchor = pos && pos.pos ? pos.pos : (pos || (this.world && this.world.spawn) || { x: 0, z: 0 });     var i;
    for (i = 0; i < this.cars.length; i++) {
      var car = this.cars[i];       if (car.occupiedBy && car.occupiedBy !== car.driver) continue;
      this._placeCar(car, anchor, 28, 230, null);
    }
    for (i = 0; i < this.peds.length; i++) this._placePed(this.peds[i], anchor, 10, 120);     return this;
  };
  Traffic.prototype._chooseNext = function (edge) {
    var graph = this.world && this.world.roadGraph;     if (!graph) return null;
    var list = this._outgoing[edge.b];     if (!list || !list.length) return null;
    var best = null;     var total = 0;
    var weights = [];     for (var i = 0; i < list.length; i++) {
      var e = list[i];       if (e.b === edge.a) { weights.push(0); continue; }
      var straight = Math.abs(wrap(e.heading - edge.heading));       var w = straight < 0.35 ? 3.2 : 1;
      weights.push(w);       total += w;
    }
    if (total <= 0) return this._pick(list);     var roll = this._rand(0, total);
    for (var j = 0; j < list.length; j++) {
      if (!weights[j]) continue;       roll -= weights[j];
      if (roll <= 0) { best = list[j]; break; }
    }
    return best || list[0];
  };
  Traffic.prototype._advanceEdge = function (car) {
    var t = car._traffic;
    if (!t.nextEdge) t.nextEdge = this._chooseNext(t.edge);
    if (!t.nextEdge) {
      t.nextEdge = this._pick(this.world.roadGraph.edges);
    }
    t.edge = t.nextEdge;
    t.nextEdge = null;
    t.progress = 0;
    t.stopNode = -1;
    return t.edge;
  };
  Traffic.prototype._laneTarget = function (car, out) {
    var t = car._traffic;
    if (!t.edge) {
      var pose = this._pickRoadPose(car.pos.x, car.pos.z, 0, 500, null);
      t.edge = pose.edge;
      t.progress = pose.progress || 0;
    }
    var edge = t.edge;
    var dx = edge.bx - edge.ax;
    var dz = edge.bz - edge.az;
    var len = edge.length || 1;
    var s = ((car.pos.x - edge.ax) * dx + (car.pos.z - edge.az) * dz) / len;
    if (s >= len - 0.9) {
      this._advanceEdge(car);
      return this._laneTarget(car, out);
    }
    t.progress = clamp(s, 0, len);
    if (s > len - 18 && t.stopNode !== edge.b) {
      t.stopNode = edge.b;
      if (this._chance(0.34)) t.stopTimer = this._rand(0.45, 1.05);
    }
    if (s > len - 13 && !t.nextEdge) t.nextEdge = this._chooseNext(edge);
    var look = 9 + Math.abs(car.speed) * 0.48;
    if (s < len - 12 || !t.nextEdge) {
      this._pointOnEdge(edge, Math.min(len - 0.4, s + look), out);
    } else {
      this._pointOnEdge(t.nextEdge, 7 + Math.abs(car.speed) * 0.3, out);
    }
    out.x += car._traffic.laneJitter;
    return out;
  };
  Traffic.prototype._gapAhead = function (car) {
    var fx = Math.sin(car.heading);
    var fz = Math.cos(car.heading);
    var rx = Math.cos(car.heading);
    var rz = -Math.sin(car.heading);
    var minGap = 99;
    for (var i = 0; i < this.cars.length; i++) {
      var other = this.cars[i];
      if (!other || other === car || other.destroyed) continue;
      var dx = other.pos.x - car.pos.x;
      var dz = other.pos.z - car.pos.z;
      var ahead = dx * fx + dz * fz;
      if (ahead < 1 || ahead > 22) continue;
      if (Math.abs(dx * rx + dz * rz) > 2.8) continue;
      var gap = ahead - (car.length + other.length) * 0.45;
      if (gap < minGap) minGap = gap;
    }
    car._traffic.gap = minGap;
    return minGap;
  };
  Traffic.prototype._drive = function (car, dt, target) {
    var t = car._traffic;
    if (t.stopTimer > 0) {
      t.stopTimer -= dt;
      var desired = Math.atan2(target.x - car.pos.x, target.z - car.pos.z);
      var steerStop = clamp(wrap(desired - car.heading) * 1.7, -1, 1);
      car.update(dt, { throttle: 0, brake: 1, steer: steerStop, handbrake: false }, null);
      return;
    }
    var gap = this._gapAhead(car);
    var scale = 1;
    if (gap < 12) scale = clamp((gap - 2.2) / 9.8, 0, 1);
    if (t.panic > 0) {
      t.panic -= dt;
      if (gap > 16) scale = 1;
    }
    if (scale > 0.96) {
      car.aiUpdate(dt, target, this.world);
      return;
    }
    var dx = target.x - car.pos.x;
    var dz = target.z - car.pos.z;
    var dist = Math.sqrt(dx * dx + dz * dz);
    var desired = Math.atan2(dx, dz);
    var diff = wrap(desired - car.heading);
    var steer = clamp(diff * 1.7, -1, 1);
    var throttle = dist > 3 ? 0.55 * scale : 0;
    var brake = gap < 4 ? 1 : (scale < 0.2 ? 0.7 : 0.12);
    if (Math.abs(diff) > 1.15 && Math.abs(car.speed) > 8) { throttle = 0.15; brake = 0.3; }
    car.update(dt, { throttle: throttle, brake: brake, steer: steer, handbrake: false }, null);
  };
  Traffic.prototype.update = function (dt, player, police) {
    dt = clamp(dt || 0, 0, 0.05);
    this._time += dt;
    if (!player || !player.pos) return;
    var px = player.pos.x;
    var pz = player.pos.z;
    var pv = player.vehicle || null;
    var wanted = Math.max((police && police.wanted) || 0, player.wanted || 0);
    var near = this._near;
    near.length = 0;
    this._playerHitCd = Math.max(0, this._playerHitCd - dt);
    var i;
    for (i = 0; i < this.cars.length; i++) {
      var car = this.cars[i];
      if (!car) continue;
      var t = car._traffic;
      var d = dist2(px, pz, car.pos.x, car.pos.z);
      if (car.destroyed) {
        t.respawn += dt;
        if (car.occupiedBy !== player && t.respawn > 4.5) this._placeCar(car, player.pos, 120, 320, null);
        continue;
      }
      if (d > 420) {
        this._placeCar(car, player.pos, 120, 320, null);
        d = dist2(px, pz, car.pos.x, car.pos.z);
      }
      if (car.occupiedBy === player) {
        car.setVisible(true);
        continue;
      }
      if (d < 40) near.push(car);
      if (wanted > 0 && d < 45) t.panic = Math.max(t.panic, 1.2);
      var target = this._laneTarget(car, this._tmpPose);
      this._drive(car, dt, target);
      if (car.driver && car.driver.mesh && !car.driver.mesh.visible) {
        var seat = car.seatWorld(this._tmpVec);
        car.driver.pos.copy(seat);
        car.driver.mesh.position.copy(seat);
        car.driver.yaw = car.heading;
      }
      car.setVisible(d < 260);
      if (Math.abs(car.speed) < 0.25) t.stuck += dt; else t.stuck = 0;
      if (t.stuck > 6.5) {
        this._placeCar(car, player.pos, 100, 300, null);
      }
    }
    for (i = 0; i < this.peds.length; i++) {
      var ped = this.peds[i];
      if (!ped) continue;
      var pd = dist2(px, pz, ped.pos.x, ped.pos.z);
      if ((!ped.alive && ped.deathTime > 7) || pd > 285) {
        this._respawnPed(i, player.pos);
        continue;
      }
      if (ped.alive && ped.panic <= 0) this._steerPed(ped);
      ped.update(dt, player, this.world);
      ped.setVisible(pd < 170 || ped.panic > 0);
    }
    this._collideCars(player, pv);
    return this;
  };
  Traffic.prototype._steerPed = function (ped) {
    var loop = ped._loop;
    if (!loop) { loop = ped._loop = { block: null, corner: 0, dir: 1, crossing: 0, nextBlock: null, tx: 0, tz: 0, stuck: 0 }; }
    if (!loop.block) {
      var blocks = this.world && this.world.blocks;
      if (!blocks || !blocks.length) return;
      loop.block = this._pick(blocks);
      loop.corner = this.rng ? this.rng.int(0, 3) : 0;
    }
    var tx;
    var tz;
    if (loop.crossing && loop.nextBlock) {
      tx = loop.tx;
      tz = loop.tz;
      if (dist2(ped.pos.x, ped.pos.z, tx, tz) < 2.0) {
        loop.block = loop.nextBlock;
        loop.nextBlock = null;
        loop.crossing = 0;
        loop.corner = Math.abs(ped.pos.x - loop.block.cx) > SIDEWALK_OFF * 0.55 ? 0 : 1;
      }
    } else {
      var corner = loop.corner;
      tx = loop.block.cx + (corner === 0 || corner === 3 ? -SIDEWALK_OFF : SIDEWALK_OFF);
      tz = loop.block.cz + (corner < 2 ? -SIDEWALK_OFF : SIDEWALK_OFF);
      if (dist2(ped.pos.x, ped.pos.z, tx, tz) < 2.1) {
        loop.corner = (loop.corner + loop.dir + 4) % 4;
        if (this._chance(0.07)) {
          var axis = this._chance(0.5) ? 'x' : 'z';
          var sign = this._chance(0.5) ? 1 : -1;
          var ix = loop.block.ix + (axis === 'x' ? sign : 0);
          var iz = loop.block.iz + (axis === 'z' ? sign : 0);
          var blocks2 = this.world && this.world.blocks;
          if (blocks2) {
            for (var b = 0; b < blocks2.length; b++) {
              if (blocks2[b].ix === ix && blocks2[b].iz === iz) {
                loop.nextBlock = blocks2[b];
                loop.crossing = 1;
                loop.tx = loop.nextBlock.cx + (axis === 'x' ? -sign * SIDEWALK_OFF : (ped.pos.x > loop.nextBlock.cx ? SIDEWALK_OFF : -SIDEWALK_OFF));
                loop.tz = loop.nextBlock.cz + (axis === 'z' ? -sign * SIDEWALK_OFF : (ped.pos.z > loop.nextBlock.cz ? SIDEWALK_OFF : -SIDEWALK_OFF));
                tx = loop.tx;
                tz = loop.tz;
                break;
              }
            }
          }
        }
      }
    }
    var d = dist2(ped.pos.x, ped.pos.z, tx, tz);
    if (d > 0.4) {
      ped.wanderAngle = Math.atan2(tx - ped.pos.x, tz - ped.pos.z);
      ped.wanderTimer = 3;
    }
    if (ped.speed < 0.05) loop.stuck += 0.016; else loop.stuck = 0;
    if (loop.stuck > 4) {
      loop.crossing = 0;
      loop.nextBlock = null;
      loop.stuck = 0;
      loop.corner = (loop.corner + 1) % 4;
    }
  };
  Traffic.prototype._respawnPed = function (index, center) {
    var old = this.peds[index];
    var block = old && old._loop ? old._loop.block : null;
    var fresh = new window.LH.Ped(this.scene, this.world, {
      x: 0, z: 0, yaw: this._rand(0, TAU), faction: 'civilian',
      seed: 'sidewalk-r' + index + '-' + this._rand(1, 1e6)
    });
    fresh._loop = {
      block: block, corner: this.rng ? this.rng.int(0, 3) : 0,
      dir: this._chance(0.5) ? 1 : -1, crossing: 0, nextBlock: null, tx: 0, tz: 0, stuck: 0
    };
    fresh.showHealthBar = false;
    if (old && old.dispose) old.dispose();
    this.peds[index] = fresh;
    this._placePed(fresh, center, 12, 120);
  };
  Traffic.prototype._collideCars = function (player, playerVehicle) {
    var near = this._near;
    var i, j;
    for (i = 0; i < near.length; i++) {
      var a = near[i];
      for (j = i + 1; j < near.length; j++) {
        var b = near[j];
        var dx = b.pos.x - a.pos.x;
        var dz = b.pos.z - a.pos.z;
        var d = Math.sqrt(dx * dx + dz * dz);
        var minD = (a.length + b.length) * 0.34;
        if (d > 0.01 && d < minD) {
          var nx = dx / d;
          var nz = dz / d;
          var push = (minD - d) * 0.5;
          a.pos.x -= nx * push; a.pos.z -= nz * push;
          b.pos.x += nx * push; b.pos.z += nz * push;
          var rel = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
          if (rel > 0) {
            a.vx -= nx * rel * 0.35; a.vz -= nz * rel * 0.35;
            b.vx += nx * rel * 0.35; b.vz += nz * rel * 0.35;
          }
        }
      }
      if (playerVehicle && playerVehicle !== a) {
        var vdx = playerVehicle.pos.x - a.pos.x;
        var vdz = playerVehicle.pos.z - a.pos.z;
        var vd = Math.sqrt(vdx * vdx + vdz * vdz);
        var vmin = (playerVehicle.length + a.length) * 0.35;
        if (vd > 0.01 && vd < vmin) {
          var vnx = vdx / vd;
          var vnz = vdz / vd;
          var overlap = vmin - vd;
          a.pos.x -= vnx * overlap * 0.62;
          a.pos.z -= vnz * overlap * 0.62;
          playerVehicle.pos.x += vnx * overlap * 0.38;
          playerVehicle.pos.z += vnz * overlap * 0.38;
          var approach = (playerVehicle.vx - a.vx) * vnx + (playerVehicle.vz - a.vz) * vnz;
          if (approach < 0) {
            playerVehicle.vx -= vnx * approach * 0.55;
            playerVehicle.vz -= vnz * approach * 0.55;
            a.vx += vnx * approach * 0.45;
            a.vz += vnz * approach * 0.45;
            playerVehicle.damage(Math.abs(approach) * 0.5);
            a.damage(Math.abs(approach) * 0.35);
          }
        }
      }
      if (playerVehicle && Math.abs(a.speed) > 5.5) {
        for (var p = 0; p < this.peds.length; p++) {
          var ped = this.peds[p];
          if (!ped || !ped.alive) continue;
          if (dist2(a.pos.x, a.pos.z, ped.pos.x, ped.pos.z) < 2.4) {
            ped.damage(24 + Math.abs(a.speed) * 2.2, { pos: playerVehicle.pos });
            ped.flee({ pos: playerVehicle.pos });
            if (typeof this.onPedHit === 'function') {
              try { this.onPedHit({ x: ped.pos.x, z: ped.pos.z, vehicle: playerVehicle }); } catch (e) { /* crime hook */ }
            }
          }
        }
      }
      if (player && !playerVehicle && Math.abs(a.speed) > 4.5) {
        var pdx = player.pos.x - a.pos.x;
        var pdz = player.pos.z - a.pos.z;
        var pd = Math.sqrt(pdx * pdx + pdz * pdz);
        if (pd < 1.55) {
          var pnx = pdx / (pd || 1);
          var pnz = pdz / (pd || 1);
          player.pos.x += pnx * 0.55;
          player.pos.z += pnz * 0.55;
          if (this._playerHitCd <= 0) {
            this._playerHitCd = 1.1;
            player.damage(Math.min(22, Math.abs(a.speed) * 0.7), 'car');
          }
        }
      }
    }
  };
  Traffic.prototype.nearestCar = function (pos, maxDist) {
    if (!pos) return null;
    var best = null;
    var bestD = maxDist == null ? 1e9 : maxDist;
    for (var i = 0; i < this.cars.length; i++) {
      var car = this.cars[i];
      if (!car || car.destroyed) continue;
      var d = dist2(pos.x, pos.z, car.pos.x, car.pos.z);
      if (d < bestD) { bestD = d; best = car; }
    }
    if (!best) return null;
    return { vehicle: best, dist: bestD };
  };
  Traffic.prototype.counts = function () {
    var alive = 0, moving = 0, i;
    for (i = 0; i < this.peds.length; i++) if (this.peds[i] && this.peds[i].alive) alive++;
    for (i = 0; i < this.cars.length; i++) if (this.cars[i] && Math.abs(this.cars[i].speed) > 1) moving++;
    return { cars: this.cars.length, movingCars: moving, peds: this.peds.length, alivePeds: alive };
  };
  Traffic.prototype.panic = function (pos, radius) {
    if (!pos) return;
    var r = radius == null ? 38 : radius;
    var threat = this._tmpThreat;
    threat.x = pos.x;
    threat.z = pos.z;
    for (var i = 0; i < this.peds.length; i++) {
      var ped = this.peds[i];
      if (!ped || !ped.alive) continue;
      if (dist2(pos.x, pos.z, ped.pos.x, ped.pos.z) <= r) ped.flee(threat);
    }
    for (var c = 0; c < this.cars.length; c++) {
      var car = this.cars[c];
      if (!car || car.destroyed) continue;
      if (dist2(pos.x, pos.z, car.pos.x, car.pos.z) <= r) car._traffic.panic = 2.5;
    }
    return this;
  };
  Traffic.prototype.ejectDriver = function (vehicle, playerPos) {
    if (!vehicle) return null;
    var driver = vehicle.occupiedBy || vehicle.driver;
    if (!driver) return null;
    vehicle.occupiedBy = null;
    vehicle.driver = null;
    if (driver.vehicle === vehicle) driver.vehicle = null;
    var exit = vehicle.exitWorld ? vehicle.exitWorld(this._tmpVec) : this._tmpVec;
    driver.pos.set(exit.x, (this.world && this.world.groundHeight) ? this.world.groundHeight(exit.x, exit.z) : 0, exit.z);
    driver.mesh.position.copy(driver.pos);
    driver.mesh.rotation.z = 0;
    driver.alive = true;
    if (driver.health == null || driver.health <= 0) driver.health = driver.maxHealth || 55;
    driver.setVisible(true);
    if (playerPos) driver.flee({ pos: { x: playerPos.x, z: playerPos.z } });
    if (this.peds.indexOf(driver) < 0) {
      if (this.peds.length < PED_COUNT) this.peds.push(driver);
      else {
        var far = this.peds[0];
        this.peds[0] = driver;
        if (far && far.dispose) far.dispose();
      }
    }
    if (driver._loop) {
      driver._loop.block = null;
      driver._loop.crossing = 0;
    } else {
      driver._loop = { block: null, corner: 0, dir: 1, crossing: 0, nextBlock: null, tx: 0, tz: 0, stuck: 0 };
    }
    return driver;
  };
  LH.Traffic = Traffic;
}());
