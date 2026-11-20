/* LEONIDA HEAT 3D — wanted level, pursuit units, roadblocks and the busted
   flow. Police cruisers use the shared Vehicle AI on the road graph; officers
   are LH.Ped cops with chase / strafe / shoot behaviour. Classic script. */
(function () {
  'use strict';   window.LH = window.LH || {};   var CFG = window.LH.CONFIG || {};   var PCFG = CFG.PLAYER || {};   var CREW = CFG.CREW || {};   var TAU = Math.PI * 2;   var MAX_UNITS = 7;   var MAX_COPS = 14;   function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }   function dist2(ax, az, bx, bz) {
    var dx = ax - bx, dz = az - bz;     return Math.sqrt(dx * dx + dz * dz);   }   function wrap(a) {
    a = (a + Math.PI) % TAU;     if (a < 0) a += TAU;     return a - Math.PI;   }   function Police(scene, world, rng) {
    this.scene = scene || null;     this.world = world || null;     this.rng = rng || (window.LH.RNG ? window.LH.RNG('costa-police') : null);     this.game = null;     this.wanted = 0;     this._heat = 0;     this.units = [];     this.cops = [];     this._spareUnits = [];     this._squadSeq = 2;     this.roadblock = {
      active: false, x: 0, z: 0, heading: 0,
      units: [], cones: [], officers: [], age: 0
    };     this.bustedMeter = 0;     this.heatTimer = 0;     this.dispatch = [];     this._time = 0;     this._spawnTimer = 0;     this._dispatchTimer = 0;     this._losTimer = 0;     this._seenLOS = false;     this._seen = false;     this._nearestUnitDist = 1e9;     this._lastSeen = { x: 0, z: 0 };
    this._siren = false;     this._bustCooldown = 0;     this._wastedCooldown = 0;     this._rbDelay = 0;     this._rbCooldown = 0;     this._rbGroup = null;     this._coneGeo = null;     this._coneMat = null;
    this._ctl = { throttle: 0, brake: 0, steer: 0, handbrake: false };     this._target = { x: 0, z: 0 };     this._tmpA = new THREE.Vector3();     this._tmpB = new THREE.Vector3();     this._shotHeatCd = 0;     this._pedHeatCd = 0;     this._carjackCd = 0;     this._lastToast = '';     this._lastToastAt = -10;   }   Police.prototype.attach = function (game) {
    this.game = game || null;     return this;   };   Police.prototype._toast = function (text, kind) {
    text = String(text || '').toUpperCase();     if (!text) return;     if (text === this._lastToast && this._time - this._lastToastAt < 1.2) return;     this._lastToast = text;     this._lastToastAt = this._time;     if (this.game && this.game.hud && this.game.hud.toast) {
      try { this.game.hud.toast(text, kind || 'danger'); } catch (e) { /* optional hud */ }     }   };   Police.prototype._syncWanted = function () {
    this.wanted = this._heat < 0.02 ? 0 : clamp(Math.ceil(this._heat - 1e-6), 0, 5);     var player = this.game && this.game.player;     if (player) player.wanted = this.wanted;     return this.wanted;   };   Police.prototype.addHeat = function (n, reason) {
    var amount = Number(n);     if (!isFinite(amount) || amount === 0) return this.wanted;     var before = this.wanted;     this._heat = clamp(this._heat + amount, 0, 5);     this._syncWanted();     this.heatTimer = 0;     if (this.game && this.game.player && this.game.player.pos) {
      this._lastSeen.x = this.game.player.pos.x;       this._lastSeen.z = this.game.player.pos.z;     }     if (this.wanted > before) {
      var why = reason ? String(reason).toUpperCase() : 'CRIME REPORTED';       this._toast('WANTED ' + this.wanted + ' · ' + why, 'danger');
    } else if (this.wanted < before) {
      this._toast('HEAT LOWERED · ' + this.wanted + ' STARS', 'info');     }     if (this.wanted <= 0 && before > 0) this.clear();     return this.wanted;   };   Police.prototype.setWanted = function (n) {
    var level = clamp(Math.round(Number(n) || 0), 0, 5);     var before = this.wanted;     this._heat = level;     this._syncWanted();     this.heatTimer = 0;     if (this.wanted > before) this._toast('WANTED ' + this.wanted, 'danger');     if (this.wanted <= 0) this.clear();     return this.wanted;   };   Police.prototype.clear = function () {
    this._heat = 0;     this._syncWanted();     this.heatTimer = 0;     this.bustedMeter = 0;     this._setBustedMeter(0);     this._removeUnits();     if (this.roadblock.active) this.clearRoadblock(false, true);     this._removeCops();     this._squadSeq = 2;     this._spawnTimer = 0;     this._rbDelay = 0;     this._rbCooldown = 0;     this._updateSiren();     return this;   };
  /* --------------------------------------------------------------- units -- */
  Police.prototype._unitMax = function () { if (this.wanted <= 0) return 0;     return Math.min(MAX_UNITS, 2 + this.wanted); };   Police.prototype._acquireUnit = function () {
    var unit = this._spareUnits.pop();     if (!unit) {
      if (!window.LH.Vehicle) return null;       unit = new window.LH.Vehicle(this.scene, this.world, 'police', {
        x: 0, z: 0, heading: 0, color: '#f2f0e6', visible: false
      });     }     unit.repair();     unit.aiVehicles = null;     unit.setVisible(true);     unit._pMeta = {
      state: 'pursue', deployTimer: 0, ramCd: 0, stuck: 0,
      lost: 0, lastX: unit.pos.x, lastZ: unit.pos.z
    };     this.units.push(unit);     unit._squadId = 2 + (this.units.length - 1) * 2;     this._squadSeq = unit._squadId + 2;     return unit;   };   Police.prototype._removeUnit = function (unit) {
    var idx = this.units.indexOf(unit);     if (idx >= 0) this.units.splice(idx, 1);     unit._pMeta = null;     unit.setVisible(false);     unit.speed = 0;     unit.vx = 0;     unit.vz = 0;     if (this._spareUnits.length < 10) this._spareUnits.push(unit);
    else if (unit.dispose) unit.dispose();   };   Police.prototype._removeUnits = function () {
    while (this.units.length) this._removeUnit(this.units[this.units.length - 1]);   };   Police.prototype._pointOnEdge = function (edge, t, out) {
    var dx = edge.bx - edge.ax;     var dz = edge.bz - edge.az;     var len = edge.length || Math.sqrt(dx * dx + dz * dz) || 1;     var nx = -dz / len;     var nz = dx / len;     var off = (edge.dir === -1 ? -1 : 1) * 2.2;     out = out || this._target;     out.x = edge.ax + dx * t + nx * off;
    out.z = edge.az + dz * t + nz * off;     out.heading = edge.heading;     return out;   };   Police.prototype._pickPursuitPose = function (player) {
    var graph = this.world && this.world.roadGraph;     if (!graph || !graph.edges || !graph.edges.length) return null;     var vehicle = player && player.vehicle;     var dir = vehicle && Math.abs(vehicle.speed || 0) > 2
      ? Math.atan2(vehicle.vx || 0, vehicle.vz || 0)
      : (player.yaw || 0);     var sx = Math.sin(dir);     var sz = Math.cos(dir);     var best = null;     var bestScore = -1e9;     for (var attempt = 0; attempt < 34; attempt++) {
      var edge = this.rng ? this.rng.pick(graph.edges) : graph.edges[Math.floor(Math.random() * graph.edges.length)];       var t = this.rng ? this.rng.range(0.12, 0.88) : 0.2 + Math.random() * 0.6;       var pose = this._pointOnEdge(edge, t, { x: 0, z: 0, heading: 0 });
      var d = dist2(pose.x, pose.z, player.pos.x, player.pos.z);       if (d < 70 || d > 285) continue;       var dot = (pose.x - player.pos.x) * sx + (pose.z - player.pos.z) * sz;       if (dot > -18) continue;
      var hit = this.world.collideCircle ? this.world.collideCircle(pose.x, pose.z, 2.1) : { hit: false };       if (hit.hit) continue;       var score = -Math.abs(d - 145) + Math.max(0, -dot) * 0.12;       if (score > bestScore) {
        bestScore = score;         best = { x: pose.x, z: pose.z, heading: pose.heading, edge: edge, t: t };       }     }     if (best) return best;     var bx = player.pos.x - sx * 145;
    var bz = player.pos.z - sz * 145;     var road = this.world.nearestRoad ? this.world.nearestRoad(bx, bz) : null;     if (road) {
      return {
        x: road.vertical ? road.x : bx,
        z: road.vertical ? bz : road.z,
        heading: road.heading || 0, edge: null, t: 0
      };     }     return { x: bx, z: bz, heading: dir, edge: null, t: 0 };
  };   Police.prototype._spawnUnit = function (player) {
    if (!player || !player.pos || this.wanted <= 0) return null;     var pose = this._pickPursuitPose(player);     if (!pose) return null;     var unit = this._acquireUnit();     if (!unit) return null;     unit.pos.set(pose.x, (this.world && this.world.groundHeight) ? this.world.groundHeight(pose.x, pose.z) : 0, pose.z);
    unit.heading = Math.atan2(player.pos.x - pose.x, player.pos.z - pose.z);     unit.mesh.rotation.y = unit.heading;     unit.speed = 0;     unit.vx = 0;     unit.vz = 0;     unit.repair();     unit.setVisible(true);     return unit;
  };
  /* --------------------------------------------------------------- cops --- */
  Police.prototype._createCop = function (x, z, yaw, health) {
    if (!window.LH.Ped || this.cops.length >= MAX_COPS) return null;     var self = this;     var cop = new window.LH.Ped(this.scene, this.world, {
      x: x, z: z, yaw: yaw || 0, faction: 'cop',
      seed: 'cop-' + Math.floor(this._time * 1000) + '-' + this.cops.length
    });     cop.hostile = true;     cop.showHealthBar = true;     cop.health = health || cop.maxHealth;     cop.maxHealth = health || cop.maxHealth;     cop.onShoot = function (c, p) { self._copShoot(c, p); };     cop.onDeath = function (c, from) { self._onCopDeath(c, from); };
    cop._strafeTimer = 0;     cop._strafeDir = this.rng && this.rng.chance(0.5) ? -1 : 1;     cop._lastShot = -10;     this.cops.push(cop);     return cop;   };   Police.prototype._removeCop = function (cop) {
    var idx = this.cops.indexOf(cop);     if (idx >= 0) this.cops.splice(idx, 1);     if (cop && cop.dispose) cop.dispose();   };   Police.prototype._removeCops = function () {
    while (this.cops.length) this._removeCop(this.cops[this.cops.length - 1]);   };   Police.prototype._onCopDeath = function (cop) {
    if (!cop || cop._reported) return;     cop._reported = true;     this.addHeat(2, 'OFFICER DOWN');   };   Police.prototype._copShoot = function (cop, player) {
    if (!cop || !cop.alive || !player || !player.pos || this.wanted <= 0) return;     if (player.dead) return;     var d = dist2(cop.pos.x, cop.pos.z, player.pos.x, player.pos.z);     if (d > 38) return;     if (this._time - (cop._lastShot || 0) < 0.72) return;     cop._lastShot = this._time;
    var from = this._tmpA.set(cop.pos.x, cop.pos.y + 1.45, cop.pos.z);     var to = this._tmpB.set(player.pos.x, player.pos.y + 1.15, player.pos.z);     if (this.game && this.game.combat && this.game.combat.tracer) {
      try { this.game.combat.tracer(from, to); } catch (e) { /* optional combat */ }     }     var dmg = 5 + (this.rng ? this.rng.range(0, 4) : Math.random() * 4);     if (d > 18) dmg *= 0.55;     if (player.vehicle) {
      player.vehicle.damage(dmg * 0.45);       player.damage(dmg * 0.35, 'police');     } else {
      player.damage(dmg, 'police');     }
    if (this.game && this.game.cameraController && this.game.cameraController.shake) {
      try { this.game.cameraController.shake(0.08); } catch (e) { /* optional camera */ }
    }
    if (this.game && this.game.traffic && this.game.traffic.panic) {
      this.game.traffic.panic(cop.pos, 22);
    }
  };
  Police.prototype._deployFrom = function (unit, player) {
    if (!unit || unit._pMeta.state === 'deployed') return;     unit._pMeta.state = 'deployed';
    var h = unit.heading;     var rx = Math.cos(h);
    var rz = -Math.sin(h);     for (var i = 0; i < 2; i++) {
      var side = i === 0 ? -1 : 1;       var x = unit.pos.x + rx * side * (unit.width * 0.62 + 0.55);
      var z = unit.pos.z + rz * side * (unit.width * 0.62 + 0.55);       if (this.world && this.world.collideCircle) {
        var res = this.world.collideCircle(x, z, 0.4);         x = res.x; z = res.z;
      }
      var cop = this._createCop(x, z, Math.atan2(player.pos.x - x, player.pos.z - z));       if (cop) {
        cop.flee({ x: x, z: z });         cop.panic = 0;
        cop.state = 'chase';
      }
    }
    unit.speed = 0;     unit.vx = 0;
    unit.vz = 0;
  };
  Police.prototype._closeForArrest = function (cop, player, dt) {
    if (!cop.alive || player.vehicle) return;     var dx = player.pos.x - cop.pos.x;
    var dz = player.pos.z - cop.pos.z;     var d = Math.sqrt(dx * dx + dz * dz);
    if (d < 1.7 || d > 9.5) return;     var step = Math.min(2.6 * dt, d - 1.55);
    if (step <= 0) return;     var nx = dx / (d || 1);
    var nz = dz / (d || 1);     var x = cop.pos.x + nx * step;
    var z = cop.pos.z + nz * step;     if (this.world && this.world.collideCircle) {
      var res = this.world.collideCircle(x, z, 0.38);       x = res.x; z = res.z;
    }
    cop.pos.x = x;     cop.pos.z = z;
    cop.mesh.position.copy(cop.pos);     cop.yaw = Math.atan2(dx, dz);
    cop.mesh.rotation.y = cop.yaw;     if (cop.character && cop.character.setPose) cop.character.setPose(cop.time, 2.2, 'walk');
  };
  Police.prototype._updateCops = function (dt, player) {
    for (var i = this.cops.length - 1; i >= 0; i--) {
      var cop = this.cops[i];       if (!cop) { this.cops.splice(i, 1); continue; }
      var d = dist2(cop.pos.x, cop.pos.z, player.pos.x, player.pos.z);       if (!cop.alive) {
        cop.update(dt, player, this.world);         if (cop.deathTime > 7.5) this._removeCop(cop);
        continue;
      }
      if (d > 320) { this._removeCop(cop); continue; }
      cop.hostile = true;       cop.update(dt, player, this.world);
      if (cop.alive) {
        this._closeForArrest(cop, player, dt);         if (cop.health < cop.maxHealth * 0.55 && cop.state === 'combat') {
          cop._strafeTimer -= dt;           if (cop._strafeTimer <= 0) {
            cop._strafeTimer = 1.8 + Math.random() * 1.4;             cop._strafeDir *= -1;
            var sx = Math.cos(cop.yaw) * cop._strafeDir * 0.9;             var sz = -Math.sin(cop.yaw) * cop._strafeDir * 0.9;
            var res = this.world.collideCircle ? this.world.collideCircle(cop.pos.x + sx, cop.pos.z + sz, 0.38) : { x: cop.pos.x + sx, z: cop.pos.z + sz };
            cop.pos.x = res.x;             cop.pos.z = res.z;
            cop.mesh.position.copy(cop.pos);
          }
        }
        cop.setVisible(d < 170);
      }
    }
  };
  /* ------------------------------------------------------------ roadblock -- */
  Police.prototype._makeCones = function () {
    if (!THREE) return [];     if (!this._coneGeo) this._coneGeo = new THREE.ConeGeometry(0.3, 0.7, 8, 1);
    if (!this._coneMat) {
      this._coneMat = new THREE.MeshStandardMaterial({
        color: 0xff6b2f, emissive: 0xff3a0a, emissiveIntensity: 0.35, roughness: 0.65
      });       if (this._coneMat.color) this._coneMat.color.convertSRGBToLinear();
    }
    var group = new THREE.Group();     group.name = 'roadblock-cones';
    var cones = [];     for (var i = 0; i < 7; i++) {
      var mesh = new THREE.Mesh(this._coneGeo, this._coneMat);       mesh.position.set((i - 3) * 2.1, 0.35, 0);
      mesh.castShadow = true;       group.add(mesh);
      cones.push(mesh);
    }
    return { group: group, cones: cones };
  };
  Police.prototype._buildRoadblock = function (player) {
    if (!player || !player.pos || this.roadblock.active) return false;     if (!window.LH.Vehicle || !window.LH.Ped) return false;
    var vehicle = player.vehicle;     var dir = vehicle && Math.abs(vehicle.speed || 0) > 2
      ? Math.atan2(vehicle.vx || 0, vehicle.vz || 0)
      : (player.yaw || 0);
    var ahead = 120 + (this.rng ? this.rng.range(0, 60) : Math.random() * 60);     var ax = player.pos.x + Math.sin(dir) * ahead;
    var az = player.pos.z + Math.cos(dir) * ahead;     var road = this.world && this.world.nearestRoad ? this.world.nearestRoad(ax, az) : null;
    var bx = ax;     var bz = az;
    var roadHeading = dir;     if (road) {
      roadHeading = road.heading || 0;       if (road.vertical) {
        bx = road.x;         bz = clamp(az, -455, 455);
      } else {
        bx = clamp(ax, -455, 455);         bz = road.z;
      }
    }
    if (dist2(bx, bz, player.pos.x, player.pos.z) < 80) return false;     var across = roadHeading + Math.PI / 2;
    var ux = Math.sin(across);     var uz = Math.cos(across);
    var units = [];     for (var i = 0; i < 2; i++) {
      var unit = this._acquireUnit();       if (!unit) break;
      this.units.pop();       unit._squadId = 0;
      var side = i === 0 ? -1 : 1;       var x = bx + ux * side * 3.1;
      var z = bz + uz * side * 3.1;       unit.pos.set(x, (this.world && this.world.groundHeight) ? this.world.groundHeight(x, z) : 0, z);
      unit.heading = across + side * 0.13;       unit.mesh.rotation.y = unit.heading;
      unit.speed = 0;       unit.vx = 0;
      unit.vz = 0;       unit.repair();
      unit.setVisible(true);       unit._pMeta = { state: 'roadblock', deployTimer: 0, ramCd: 0, stuck: 0, lost: 0, lastX: x, lastZ: z };
      units.push(unit);
    }
    var coneBuild = this.scene ? this._makeCones() : null;     if (coneBuild) {
      coneBuild.group.position.set(bx, 0, bz);       coneBuild.group.rotation.y = roadHeading;
      this.scene.add(coneBuild.group);       this._rbGroup = coneBuild.group;
    }
    var officers = [];     for (var o = 0; o < 3; o++) {
      var off = (o - 1) * 4.2;       var ox = bx + ux * off - Math.sin(roadHeading) * 4.5;
      var oz = bz + uz * off - Math.cos(roadHeading) * 4.5;       if (this.world && this.world.collideCircle) {
        var cr = this.world.collideCircle(ox, oz, 0.4);         ox = cr.x; oz = cr.z;
      }
      var cop = this._createCop(ox, oz, Math.atan2(player.pos.x - ox, player.pos.z - oz));       if (cop) officers.push(cop);
    }
    var rb = this.roadblock;     rb.active = true;
    rb.x = bx;     rb.z = bz;
    rb.heading = roadHeading;     rb.units = units;
    rb.cones = coneBuild ? coneBuild.cones : [];     rb.officers = officers;
    rb.age = 0;     this._rbDelay = 0;
    this._rbCooldown = 0;     this._toast('ROADBLOCK SET · ' + Math.round(dist2(bx, bz, player.pos.x, player.pos.z)) + ' M AHEAD', 'danger');
    return true;
  };
  Police.prototype.clearRoadblock = function (decoy, silent) {
    var rb = this.roadblock;     if (!rb.active) return false;
    for (var i = 0; i < rb.units.length; i++) {
      var unit = rb.units[i];       unit._pMeta = null;
      unit.setVisible(false);       unit.speed = 0;
      unit.vx = 0;       unit.vz = 0;
      if (this._spareUnits.length < 10) this._spareUnits.push(unit);
      else if (unit.dispose) unit.dispose();
    }
    for (var c = 0; c < rb.officers.length; c++) this._removeCop(rb.officers[c]);
    if (this._rbGroup && this._rbGroup.parent) this._rbGroup.parent.remove(this._rbGroup);
    this._rbGroup = null;
    rb.active = false;
    rb.units = [];
    rb.cones = [];
    rb.officers = [];
    rb.age = 0;
    this._rbCooldown = 25;
    this._rbDelay = 0;
    if (!silent) {
      this._toast(decoy ? 'MAYA DECOY · ROADBLOCK CLEARED · UNITS PULLED EAST' : 'ROADBLOCK CLEARED', decoy ? 'crew' : 'info');
    }
    return true;
  };
  Police.prototype._updateRoadblock = function (dt, player) {
    if (this.wanted < 3) {
      if (this.roadblock.active) this.clearRoadblock(false, true);
      this._rbDelay = 0;
      return;
    }
    if (this._rbCooldown > 0) this._rbCooldown = Math.max(0, this._rbCooldown - dt);
    if (!this.roadblock.active) {
      if (this._rbDelay <= 0) this._rbDelay = this.rng ? this.rng.range(3.5, 6) : 4.5;
      this._rbDelay -= dt;
      if (this._rbDelay <= 0 && this._rbCooldown <= 0) this._buildRoadblock(player);
      return;
    }
    var rb = this.roadblock;
    rb.age += dt;
    for (var i = 0; i < rb.units.length; i++) {
      var unit = rb.units[i];
      this._ctl.throttle = 0;
      this._ctl.brake = 0;
      this._ctl.handbrake = true;
      this._ctl.steer = 0;
      unit.update(dt, this._ctl, null);
    }
    if (rb.age > 55) this.clearRoadblock(false, true);
  };
  /* --------------------------------------------------------------- update -- */
  Police.prototype._segBox = function (ax, az, bx, bz, box) {
    var dx = bx - ax;
    var dz = bz - az;
    var tmin = 0;
    var tmax = 1;
    var p = [-dx, dx, -dz, dz];
    var q = [ax - box.minX, box.maxX - ax, az - box.minZ, box.maxZ - az];
    for (var i = 0; i < 4; i++) {
      if (Math.abs(p[i]) < 1e-6) {
        if (q[i] < 0) return false;
      } else {
        var r = q[i] / p[i];
        if (p[i] < 0) { if (r > tmax) return false; if (r > tmin) tmin = r; }
        else { if (r < tmin) return false; if (r < tmax) tmax = r; }
      }
    }
    return tmin <= tmax;
  };
  Police.prototype._hasLOS = function (ax, az, bx, bz) {
    var colliders = this.world && this.world.colliders;
    if (!colliders) return true;
    var minX = Math.min(ax, bx), maxX = Math.max(ax, bx);
    var minZ = Math.min(az, bz), maxZ = Math.max(az, bz);
    for (var i = 0; i < colliders.length; i++) {
      var c = colliders[i];
      if (c.maxX < minX || c.minX > maxX || c.maxZ < minZ || c.minZ > maxZ) continue;
      if (this._segBox(ax, az, bx, bz, c)) return false;
    }
    return true;
  };
  Police.prototype._computeSeen = function (player) {
    var best = 1e9;
    var bestX = 0;
    var bestZ = 0;
    var i;
    for (i = 0; i < this.units.length; i++) {
      var u = this.units[i];
      var d = dist2(player.pos.x, player.pos.z, u.pos.x, u.pos.z);
      if (d < best) { best = d; bestX = u.pos.x; bestZ = u.pos.z; }
    }
    for (i = 0; i < this.cops.length; i++) {
      var cop = this.cops[i];
      if (!cop.alive) continue;
      var cd = dist2(player.pos.x, player.pos.z, cop.pos.x, cop.pos.z);
      if (cd < best) { best = cd; bestX = cop.pos.x; bestZ = cop.pos.z; }
    }
    this._nearestUnitDist = best;
    if (best > 190) {
      this._seenLOS = false;
      return false;
    }
    if (best < 22) {
      this._seenLOS = true;
      return true;
    }
    if (this._losTimer <= 0) {
      this._losTimer = 0.22;
      this._seenLOS = this._hasLOS(bestX, bestZ, player.pos.x, player.pos.z);
    }
    return this._seenLOS;
  };
  Police.prototype._updateSiren = function () {
    var on = this.wanted > 0;
    if (on === this._siren) return;
    this._siren = on;
    if (this.game && this.game.audio && this.game.audio.siren) {
      try { this.game.audio.siren(on); } catch (e) { /* optional audio */ }
    }
  };
  Police.prototype._updateUnits = function (dt, player, traffic) {
    var pv = player.vehicle;
    for (var i = this.units.length - 1; i >= 0; i--) {
      var unit = this.units[i];
      if (!unit || unit.destroyed) {
        if (unit) this._removeUnit(unit);
        continue;
      }
      var meta = unit._pMeta || (unit._pMeta = { state: 'pursue', deployTimer: 0, ramCd: 0, stuck: 0, lost: 0, lastX: 0, lastZ: 0 });
      meta.ramCd = Math.max(0, meta.ramCd - dt);
      unit.aiVehicles = traffic && traffic.cars ? traffic.cars : null;
      var d = dist2(player.pos.x, player.pos.z, unit.pos.x, unit.pos.z);
      var tx = player.pos.x;
      var tz = player.pos.z;
      if (!this._seen && this.heatTimer > 2.2) {
        tx = this._lastSeen.x;
        tz = this._lastSeen.z;
      }
      if (pv && d < 26) {
        tx += (pv.vx || 0) * 0.35;
        tz += (pv.vz || 0) * 0.35;
      }
      this._target.x = tx;
      this._target.z = tz;
      if (!pv && d < 10) {
        this._ctl.throttle = 0;
        this._ctl.brake = 0;
        this._ctl.handbrake = true;
        this._ctl.steer = 0;
        unit.update(dt, this._ctl, unit.aiVehicles);
      } else {
        unit.aiUpdate(dt, this._target, this.world);
      }
      unit.setVisible(d < 320);
      if (pv && d < 4.5 && meta.ramCd <= 0) {
        var dx = pv.pos.x - unit.pos.x;
        var dz = pv.pos.z - unit.pos.z;
        var dd = Math.sqrt(dx * dx + dz * dz) || 1;
        var nx = dx / dd;
        var nz = dz / dd;
        pv.vx += nx * 5.5;
        pv.vz += nz * 5.5;
        pv.damage(4.5);
        unit.damage(2.5);
        meta.ramCd = 1.2;
      }
      if (Math.abs(unit.speed) < 0.35) meta.stuck += dt; else meta.stuck = 0;
      if (d > 390) meta.lost += dt; else meta.lost = 0;
      if (meta.lost > 7 || meta.stuck > 6) {
        this._removeUnit(unit);
        this._spawnTimer = Math.min(this._spawnTimer, 0.4);
      }
    }
  };
  Police.prototype._deployNear = function (player) {
    if (this.wanted < 2) return;
    var stopped = !player.vehicle || Math.abs(player.vehicle.speed || 0) < 2.5;
    if (!stopped) return;
    for (var i = 0; i < this.units.length; i++) {
      var unit = this.units[i];
      if (!unit || !unit._pMeta || unit._pMeta.state === 'deployed') continue;
      var d = dist2(player.pos.x, player.pos.z, unit.pos.x, unit.pos.z);
      if (d < 26 && this.cops.length < MAX_COPS) this._deployFrom(unit, player);
    }
  };
  Police.prototype._nearestCop = function (player) {
    var best = null;
    var bestD = 1e9;
    for (var i = 0; i < this.cops.length; i++) {
      var cop = this.cops[i];
      if (!cop || !cop.alive) continue;
      var d = dist2(player.pos.x, player.pos.z, cop.pos.x, cop.pos.z);
      if (d < bestD) { bestD = d; best = cop; }
    }
    this._nearestCopRef = best;
    return best;
  };
  Police.prototype._setBustedMeter = function (v) {
    this.bustedMeter = clamp(v || 0, 0, 1);
    if (this.game && this.game.setBustedMeter) {
      try { this.game.setBustedMeter(this.bustedMeter); } catch (e) { /* optional hud */ }
    }
  };
  Police.prototype._updateBusted = function (dt, player) {
    if (player.vehicle) {
      if (this.bustedMeter > 0) this._setBustedMeter(Math.max(0, this.bustedMeter - dt * 0.8));
      return;
    }
    if (this.wanted <= 0) {
      if (this.bustedMeter > 0) this._setBustedMeter(Math.max(0, this.bustedMeter - dt * 0.8));
      return;
    }
    var cop = this._nearestCop(player);
    var radius = PCFG.bustedRadius || 3.0;
    var inRange = false;
    if (cop) {
      var d = dist2(cop.pos.x, cop.pos.z, player.pos.x, player.pos.z);
      inRange = d <= radius + 0.45 && this._hasLOS(cop.pos.x, cop.pos.z, player.pos.x, player.pos.z);
    }
    var bustedTime = PCFG.bustedTime || 2.5;
    var next = this.bustedMeter;
    if (inRange) next += dt / bustedTime;
    else next -= dt * 0.55;
    this._setBustedMeter(next);
    if (this.bustedMeter >= 1 && this._bustCooldown <= 0) this._triggerBusted(player);
  };
  Police.prototype._triggerBusted = function (player) {
    if (this._bustCooldown > 0) return;
    this._bustCooldown = 3.5;
    var fine = PCFG.bustedFine || 250;
    var station = (this.world && (this.world.policeStation || (this.world.points && this.world.points.policeStation))) || { x: 250, z: 250 };
    if (player.vehicle && player.exit) player.exit();
    var sp = this.world && this.world.collideCircle ? this.world.collideCircle(station.x, station.z, 0.55) : station;
    var gy = this.world && this.world.groundHeight ? this.world.groundHeight(sp.x, sp.z) : 0;
    player.pos.set(sp.x, gy, sp.z);
    player.mesh.position.copy(player.pos);
    player.mesh.rotation.y = player.yaw || 0;
    player.mesh.visible = true;
    player.health = player.maxHealth || 100;
    player.armor = 0;
    player.dead = false;
    player.wanted = 0;
    player.money = Math.max(0, (player.money || 0) - fine);
    if (player.character && player.character.setPose) player.character.setPose(player.time || 0, 0, 'idle');
    if (this.game && this.game.cameraController) this.game.cameraController.initialised = false;
    this.clear();
    this._toast('BUSTED · $' + fine + ' FINE · POLICE STATION', 'danger');
    if (this.game && this.game.onBusted) {
      try { this.game.onBusted({ reason: 'BUSTED', fine: fine, location: station }); } catch (e) { /* game hook */ }
    } else if (this.game) {
      this.game.state = 'busted';
      this._bustCooldown = 0;
    }
    this._bustCooldown = 3.5;
  };
  Police.prototype._triggerWasted = function (player) {
    if (this._wastedCooldown > 0) return;
    this._wastedCooldown = 4;
    var fee = PCFG.hospitalFee || 150;
    var hospital = (this.world && (this.world.hospital || (this.world.points && this.world.points.hospital))) || { x: -250, z: 250 };
    if (player.vehicle && player.exit) player.exit();
    var hp = this.world && this.world.collideCircle ? this.world.collideCircle(hospital.x, hospital.z, 0.55) : hospital;
    var gy = this.world && this.world.groundHeight ? this.world.groundHeight(hp.x, hp.z) : 0;
    player.pos.set(hp.x, gy, hp.z);
    player.mesh.position.copy(player.pos);
    player.mesh.visible = true;
    player.health = PCFG.respawnHealth || 65;
    player.armor = 0;
    player.dead = false;
    player.wanted = 0;
    player.money = Math.max(0, (player.money || 0) - fee);
    if (player.character && player.character.setPose) player.character.setPose(player.time || 0, 0, 'idle');
    if (this.game && this.game.cameraController) this.game.cameraController.initialised = false;
    this.clear();
    this._toast('WASTED · $' + fee + ' HOSPITAL FEE', 'danger');
    if (this.game && this.game.onWasted) {
      try { this.game.onWasted({ reason: 'WASTED', fee: fee, location: hospital }); } catch (e) { /* game hook */ }
    } else if (this.game) {
      this.game.state = 'wasted';
      this._wastedCooldown = 0;
    }
  };
  Police.prototype.update = function (dt, player, traffic) {
    dt = clamp(dt || 0, 0, 0.05);
    this._time += dt;
    if (!player || !player.pos) return this;
    this._bustCooldown = Math.max(0, this._bustCooldown - dt);
    this._wastedCooldown = Math.max(0, this._wastedCooldown - dt);
    this._losTimer -= dt;
    this._shotHeatCd = Math.max(0, this._shotHeatCd - dt);
    this._pedHeatCd = Math.max(0, this._pedHeatCd - dt);
    this._carjackCd = Math.max(0, this._carjackCd - dt);
    this._syncWanted();
    if (player.health <= 0 && this._wastedCooldown <= 0) {
      this._triggerWasted(player);
      return this;
    }
    if (this.wanted <= 0) {
      this.heatTimer = 0;
      if (this.bustedMeter > 0) this._setBustedMeter(Math.max(0, this.bustedMeter - dt * 0.8));
      this._updateSiren();
      this._dispatchTimer -= dt;
      if (this._dispatchTimer <= 0) {
        this._dispatchTimer = 0.7;
        this.dispatch = this.dispatchRows(player, this.game && this.game.missions);
      }
      return this;
    }
    var seen = this._computeSeen(player);
    this._seen = seen;
    if (seen) {
      this.heatTimer = 0;
      this._lastSeen.x = player.pos.x;
      this._lastSeen.z = player.pos.z;
    } else {
      this.heatTimer += dt;
    }
    var delay = PCFG.hiddenDecayDelay || 7;
    if (!seen && this.heatTimer > delay) {
      var rate = PCFG.wantedDecay || 0.035;
      this._heat = Math.max(0, this._heat - rate * dt);
      var before = this.wanted;
      this._syncWanted();
      if (this.wanted < before) this._toast('HEAT COOLING · ' + this.wanted + ' STARS', 'info');
      if (this.wanted <= 0) { this.clear(); return this; }
    }
    var maxUnits = this._unitMax();
    this._spawnTimer -= dt;
    if (this.units.length < maxUnits && this._spawnTimer <= 0) {
      this._spawnUnit(player);
      this._spawnTimer = this.units.length < 2 ? 0.35 : 1.25;
    }
    this._updateUnits(dt, player, traffic);
    this._deployNear(player);
    this._updateCops(dt, player);
    this._updateRoadblock(dt, player);
    this._updateBusted(dt, player);
    this._updateSiren();
    this._dispatchTimer -= dt;
    if (this._dispatchTimer <= 0) {
      this._dispatchTimer = 0.7;
      this.dispatch = this.dispatchRows(player, this.game && this.game.missions);
    }
    return this;
  };
  /* -------------------------------------------------------------- dispatch -- */
  Police.prototype._activeMission = function (missions) {
    if (!missions) return null;
    if (missions.active && typeof missions.active === 'object') return missions.active;
    if (missions.current && typeof missions.current === 'object') return missions.current;
    if (missions.mission && typeof missions.mission === 'object') return missions.mission;
    if (missions.def && typeof missions.def === 'object') return missions.def;
    if (missions.index != null && (missions.list || CFG.MISSIONS)) {
      var list = missions.list || CFG.MISSIONS;
      return list[missions.index] || list[missions.index + 1] || null;
    }
    return null;
  };
  Police.prototype._crewReady = function (id) {
    var sources = [
      this.game && this.game.crewAbilities,
      this.game && this.game.abilities,
      this.game && this.game.crew,
      this.game && this.game.missions && this.game.missions.abilities,
      this.game && this.game.missions && this.game.missions.crew,
      this.game && this.game.missions && this.game.missions.cooldowns
    ];
    for (var i = 0; i < sources.length; i++) {
      var src = sources[i];
      if (!src) continue;
      var v = src[id];
      if (v == null && src.crew) v = src.crew[id];
      if (v == null) continue;
      if (typeof v === 'number') return v <= 0;
      if (typeof v === 'boolean') return v;
      if (typeof v === 'object') {
        if (v.ready != null) return !!v.ready;
        var cd = v.remaining != null ? v.remaining : (v.cooldown != null ? v.cooldown : v.timer);
        if (cd != null) return Number(cd) <= 0;
      }
    }
    return true;
  };
  Police.prototype.dispatchRows = function (player, missions) {
    var rows = [];
    var pos = player && player.pos ? player.pos : { x: 0, z: 0 };
    var nearest = null;
    var nearestD = 1e9;
    var i;
    for (i = 0; i < this.units.length; i++) {
      var unit = this.units[i];
      var d = dist2(pos.x, pos.z, unit.pos.x, unit.pos.z);
      if (d < nearestD) { nearestD = d; nearest = unit; }
    }
    if (!nearest && this.roadblock.active) {
      for (i = 0; i < this.roadblock.units.length; i++) {
        var ru = this.roadblock.units[i];
        var rd = dist2(pos.x, pos.z, ru.pos.x, ru.pos.z);
        if (rd < nearestD) { nearestD = rd; nearest = ru; }
      }
    }
    var status = 'CLEAR';
    if (this.wanted > 0) {
      if (!nearest) status = 'SEARCHING';
      else if (nearestD < 80) status = 'PURSUING';
      else status = 'EN ROUTE';
    }
    rows.push({
      unit: nearest ? 'SQUAD ' + (nearest._squadId || 2) : 'NO UNIT',
      dist: nearest ? Math.round(nearestD) : null,
      status: status,
      kind: 'police'
    });
    var rbDist = this.roadblock.active ? Math.round(dist2(pos.x, pos.z, this.roadblock.x, this.roadblock.z)) : null;
    rows.push({
      unit: 'ROADBLOCK',
      dist: rbDist,
      status: this.roadblock.active ? 'SET' : 'CLEAR',
      kind: 'roadblock'
    });
    var crewId = CREW.maya ? 'maya' : (CREW[Object.keys(CREW)[0]] && Object.keys(CREW)[0]);
    var crewName = crewId ? String(CREW[crewId].name || crewId).toUpperCase() : 'MAYA';
    var ready = crewId ? this._crewReady(crewId) : true;
    rows.push({
      unit: crewName,
      dist: null,
      status: ready ? 'READY' : 'COOLING',
      kind: 'crew'
    });
    var mission = this._activeMission(missions);
    var liveHeat = missions && (missions.heat != null ? missions.heat : (mission && mission.currentHeat != null ? mission.currentHeat : null));
    var heat = liveHeat != null ? liveHeat : mission
      ? (mission.heatOnComplete != null ? mission.heatOnComplete : (mission.heatOnStart || 0))
      : this.wanted;
    var heatN = Math.round(heat);
    rows.push({
      unit: (mission ? 'CASE HEAT ' : 'HEAT ') + heatN,
      dist: null,
      status: heatN >= 3 ? 'PURSUING' : heatN > 0 ? 'SEARCHING' : 'COOLING',
      kind: 'mission',
      heat: heatN
    });
    for (i = 0; i < rows.length; i++) {
      rows[i].distLabel = rows[i].dist == null ? '—' : rows[i].dist + ' M';
      rows[i].status = String(rows[i].status).toUpperCase();
    }
    this.dispatch = rows;
    return rows;
  };
  /* ----------------------------------------------------------- crime hooks -- */
  Police.prototype.notifyShot = function (pos) {
    if (!pos || this._shotHeatCd > 0) return;
    this._shotHeatCd = 2.8;
    var traffic = this.game && this.game.traffic;
    var near = false;
    if (traffic && traffic.peds) {
      for (var i = 0; i < traffic.peds.length; i++) {
        var ped = traffic.peds[i];
        if (ped && ped.alive && dist2(pos.x, pos.z, ped.pos.x, ped.pos.z) < 32) { near = true; break; }
      }
    }
    for (var c = 0; c < this.cops.length; c++) {
      if (dist2(pos.x, pos.z, this.cops[c].pos.x, this.cops[c].pos.z) < 32) { near = true; break; }
    }
    if (near || this.wanted > 0) {
      this.addHeat(1, 'DISCHARGE OF FIREARM');
      if (traffic && traffic.panic) traffic.panic(pos, 46);
    }
  };
  Police.prototype.notifyCarjack = function (vehicle, pos) {
    if (!pos || this._carjackCd > 0) return;
    this._carjackCd = 4;
    var inView = this.wanted > 0 || (this._nearestUnitDist < 70);
    for (var i = 0; i < this.cops.length; i++) {
      var cop = this.cops[i];
      if (cop && cop.alive && dist2(pos.x, pos.z, cop.pos.x, cop.pos.z) < 40 &&
        this._hasLOS(cop.pos.x, cop.pos.z, pos.x, pos.z)) { inView = true; break; }
    }
    if (inView) this.addHeat(1, 'CARJACKING IN VIEW');
  };
  Police.prototype.notifyPedHit = function (data) {
    if (!data || this._pedHeatCd > 0) return;
    this._pedHeatCd = 3.5;
    this.addHeat(2, 'HIT AND RUN');
    if (this.game && this.game.traffic && this.game.traffic.panic) {
      this.game.traffic.panic({ x: data.x, z: data.z }, 42);
    }
  };
  LH.Police = Police;
}());
