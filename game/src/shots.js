/* LEONIDA HEAT 3D — deterministic screenshot scenes.
   Each scene composes the real world, traffic, police, combat and missions,
   advances the simulation by a fixed number of logic steps, then freezes with
   the camera and HUD exactly where the screenshot needs them. */
(function () {
  'use strict';

  window.LH = window.LH || {};

  var CFG = window.LH.CONFIG || {};
  var NAMES = ['hero', 'city', 'chase', 'mission'];
  var STEP = 1 / 60;
  var STEPS = 24;

  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  function pad(n) {
    return n < 10 ? '0' + n : String(n);
  }

  function Shots(game) {
    this.game = game || null;
    this.name = 'hero';
    this.ready = false;
    this.time = 0;
    this.staged = [];
  }

  Shots.prototype._player = function () {
    return this.game ? this.game.player : null;
  };

  Shots.prototype._car = function (type, x, z, heading, color) {
    var g = this.game;
    if (!g || !g.scene || !window.LH.Vehicle) return null;
    var opts = { x: x, z: z, heading: heading || 0 };
    if (color) opts.color = color;
    var car = new window.LH.Vehicle(g.scene, g.world, type, opts);
    car.owner = 'shot';
    this.staged.push(car);
    if (g.demoVehicles) g.demoVehicles.push(car);
    if (g._vehiclePool) g._vehiclePool.push(car);
    return car;
  };

  Shots.prototype._policeUnit = function (x, z, heading, speed) {
    var police = this.game.police;
    if (!police) return null;
    var unit = null;
    if (police._acquireUnit) unit = police._acquireUnit();
    if (!unit) unit = this._car('police', x, z, heading, '#f2f0e6');
    var gy = this.game.world && this.game.world.groundHeight ? this.game.world.groundHeight(x, z) : 0;
    unit.pos.set(x, gy, z);
    unit.heading = heading || 0;
    unit.mesh.rotation.y = unit.heading;
    unit.speed = speed || 0;
    unit.vx = Math.sin(unit.heading) * (speed || 0);
    unit.vz = Math.cos(unit.heading) * (speed || 0);
    unit.repair();
    unit.setVisible(true);
    unit._pMeta = {
      state: 'pursue', deployTimer: 0, ramCd: 0, stuck: 0, lost: 0,
      lastX: x, lastZ: z
    };
    return unit;
  };

  Shots.prototype._place = function (x, z, yaw) {
    var p = this._player();
    if (!p) return;
    var gy = this.game.world && this.game.world.groundHeight ? this.game.world.groundHeight(x, z) : 0;
    p.pos.set(x, gy, z);
    p.yaw = yaw == null ? p.yaw : yaw;
    p.mesh.position.copy(p.pos);
    p.mesh.rotation.y = p.yaw;
    p.mesh.visible = true;
    p.speed = 0;
    p.moveSpeed = 0;
    if (p.character && p.character.setPose) p.character.setPose(p.time || 0, 0, 'idle');
  };

  Shots.prototype._gun = function (id, ammo, reserve) {
    var p = this._player();
    if (!p) return;
    p.giveWeapon(id, ammo);
    if (reserve != null && p.weapons[id]) p.weapons[id].reserve = reserve;
    if (this.game.combat && this.game.combat.setWeapon) this.game.combat.setWeapon(id);
  };

  Shots.prototype._clearToasts = function () {
    var feed = document.getElementById('toast-feed');
    if (feed) feed.innerHTML = '';
  };

  Shots.prototype._hide = function (id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.style.setProperty('display', 'none', 'important');
    el.hidden = true;
  };

  Shots.prototype._hideObjectiveMarkers = function () {
    this._hide('objective-arrow');
    var missions = this.game ? this.game.missions : null;
    if (missions && missions.marker) missions.marker.visible = false;
    var scene = this.game ? this.game.scene : null;
    if (!scene) return;
    for (var i = 0; i < scene.children.length; i++) {
      var child = scene.children[i];
      if (child && child.name === 'mission-marker') child.visible = false;
    }
  };

  Shots.prototype._roofNear = function (x, z, minH, maxH) {
    var list = this.game && this.game.world && this.game.world.buildings ? this.game.world.buildings : [];
    var best = null;
    var bestScore = Infinity;
    for (var i = 0; i < list.length; i++) {
      var b = list[i];
      if (b.h < minH || b.h > maxH) continue;
      var dx = Math.max(b.minX - x, 0, x - b.maxX);
      var dz = Math.max(b.minZ - z, 0, z - b.maxZ);
      var score = dx * dx + dz * dz + Math.abs(b.cz - z) * 0.02;
      if (score < bestScore) {
        bestScore = score;
        best = b;
      }
    }
    return best;
  };

  Shots.prototype._clearTraffic = function (x, z, radius) {
    var traffic = this.game.traffic;
    if (!traffic) return;
    var i;
    var r2 = radius * radius;
    for (i = 0; i < (traffic.cars || []).length; i++) {
      var car = traffic.cars[i];
      if (!car || !car.pos) continue;
      var dx = car.pos.x - x;
      var dz = car.pos.z - z;
      if (dx * dx + dz * dz < r2) car.setVisible(false);
    }
    for (i = 0; i < (traffic.peds || []).length; i++) {
      var ped = traffic.peds[i];
      if (!ped || !ped.pos) continue;
      var px = ped.pos.x - x;
      var pz = ped.pos.z - z;
      if (px * px + pz * pz < r2) {
        ped.pos.x += (px >= 0 ? 1 : -1) * 40;
        ped.pos.z += (pz >= 0 ? 1 : -1) * 40;
        ped.mesh.position.copy(ped.pos);
      }
    }
  };

  Shots.prototype._setClock = function (minutes, weather) {
    var g = this.game;
    g.clock.minutes = minutes;
    g.clock.day = 1;
    g.clock.weather = weather || 'clear';
    g.clock.weatherTimer = 0;
    g.clock.elapsed = 0;
    g._weatherMax = 9999;
    g._applySky();
  };

  Shots.prototype._base = function () {
    var g = this.game;
    var p = g.player;
    g.state = 'play';
    document.body.classList.remove('is-title');
    if (g.input && g.input.clear) g.input.clear();
    if (g.hud) g.hud.setScreen('hud');
    if (g.police) g.police.clear();
    if (g.combat) {
      g.combat.clearEnemies();
      g.combat.reloadTimer = 0;
    }
    if (g.missions) {
      if (g.missions.active || g.missions.briefing) g.missions.abort();
      g.missions.reset();
    }
    g.collectibles = [];
    if (g._syncCollectibles) g._syncCollectibles();
    if (g._resetPickups) g._resetPickups();
    g._lastVehicle = null;
    g._autosaveAccum = 0;
    g._overlayUntil = 0;
    this._clearToasts();
    if (p) {
      p.reset(-388, 214, Math.PI);
      p.health = p.maxHealth || 100;
      p.armor = 50;
      p.money = 7250;
      p.wanted = 0;
      p.dead = false;
      p.setVisible(true);
      this._gun('pistol', 12, 96);
      this._gun('smg', 30, 120);
      this._gun('rifle', 30, 120);
      if (g.combat) g.combat.setWeapon('pistol');
    }
    if (g.cameraController) {
      g.cameraController.clearShot();
      g.cameraController.initialised = false;
      g.cameraController.fov = (CFG.CAMERA && CFG.CAMERA.fov) || 62;
    }
    if (g.camera) {
      g.camera.fov = (CFG.CAMERA && CFG.CAMERA.fov) || 62;
      g.camera.updateProjectionMatrix();
    }
    if (g.rain) g.rain.points.visible = false;
  };

  Shots.prototype._camera = function (pos, look, fov) {
    var g = this.game;
    if (!g.cameraController) return;
    g.cameraController.setShot(pos, look);
    g.cameraController.fov = fov || 56;
    if (g.camera) {
      g.camera.fov = fov || 56;
      g.camera.position.set(pos[0], pos[1], pos[2]);
      g.camera.lookAt(look[0], look[1], look[2]);
      g.camera.updateProjectionMatrix();
    }
  };

  /* ------------------------------------------------------------------ hero */

  Shots.prototype._hero = function () {
    var g = this.game;
    var p = g.player;
    this._setClock(1040, 'clear');
    this._place(-389.8, 214, Math.PI + 0.58);
    p.money = 7420;
    p.armor = 65;
    if (g.hud) {
      g.hud.moneyShown = p.money;
      g.hud._moneyTarget = p.money;
    }

    var sports = null;
    for (var i = 0; i < (g.demoVehicles || []).length; i++) {
      if (g.demoVehicles[i] && g.demoVehicles[i].type === 'sports') sports = g.demoVehicles[i];
    }
    if (!sports) sports = this._car('sports', -392.5, 208, 0.04, '#ff6f61');
    if (sports) {
      sports.pos.set(-392.6, 0, 208.5);
      sports.heading = 0.035;
      sports.speed = 0;
      sports.vx = 0;
      sports.vz = 0;
      sports.mesh.position.copy(sports.pos);
      sports.mesh.rotation.y = sports.heading;
      sports.repair();
      sports.setVisible(true);
    }

    this._clearTraffic(-388, 210, 12);

    if (g.missions) {
      g.missions.start(0);
      g.missions.begin();
      g.state = 'play';
      g.missions._syncMissionHud(true);
      if (g.hud && g.hud.setScreen) g.hud.setScreen('hud');
      if (g.missions._hideDialogue) g.missions._hideDialogue();
    }
    if (g.hud && g.hud.hideDialogue) g.hud.hideDialogue();
    this._policeUnit(-397, 122, Math.PI, 0);
    g.police.setWanted(2);
    if (g.hud && g.hud.setPrompt) g.hud.setPrompt('');

    this._camera([-388.6, 2.32, 219.5], [-389.6, 1.18, 208.8], 58);
  };

  /* ------------------------------------------------------------------ city */

  Shots.prototype._city = function () {
    var g = this.game;
    var p = g.player;
    this._setClock(1035, 'haze');
    g.collectibles = [0, 1, 2];
    if (g._syncCollectibles) g._syncCollectibles();
    var roof = this._roofNear(-430, 120, 18, 26) || this._roofNear(-430, 120, 8, 60);
    var top = roof ? roof.h : 24;
    var px = roof ? roof.maxX - 2.2 : -423;
    var pz = roof ? roof.cz + 1.5 : 120;
    this._place(px, pz, 2.85);
    p.pos.y = top + 0.16;
    p.mesh.position.copy(p.pos);
    p.money = 6140;
    p.armor = 30;
    if (p.vehicle) p.exit();
    p.mesh.visible = true;
    p.character.setPose(p.time || 0, 0, 'idle');
    if (g.police) {
      g.police.clear();
      g.police.setWanted(0);
    }
    if (g.hud && g.hud.setMission) g.hud.setMission(null);
    var camPos = [px - 1.9, top + 7.6, pz + 8.4];
    var look = [px + 8, top - 10.5, pz - 55];
    this.cityPose = { px: px, pz: pz, top: top, camPos: camPos, look: look };
    this._camera(camPos, look, 55);
  };

  /* ----------------------------------------------------------------- chase */

  Shots.prototype._chase = function () {
    var g = this.game;
    var p = g.player;
    this._setClock(1270, 'clear');
    if (p.vehicle) p.exit();

    var car = this._car('sports', 400, -30, 0, '#ff6f61');
    if (car) {
      car.pos.set(400, 0, -30);
      car.heading = 0;
      car.mesh.position.copy(car.pos);
      car.mesh.rotation.y = 0;
      p.enter(car);
      car.speed = 36;
      car.vx = 0;
      car.vz = 36;
      car.repair();
      car.setVisible(true);
    }
    this._clearTraffic(400, -20, 34);

    if (g.missions) {
      g.missions.start(3);
      g.missions.begin();
      g.state = 'play';
      g.missions.stepIndex = 3;
      g.missions._syncMissionHud(true);
      if (g.hud && g.hud.setScreen) g.hud.setScreen('hud');
    }
    g.police.setWanted(3);
    g.police._rbCooldown = 0;
    g.police._rbDelay = 0;
    if (g.police.roadblock.active) g.police.clearRoadblock(false, true);
    try { g.police._buildRoadblock(p); } catch (e) { /* roadblock is staged below when available */ }
    var rb = g.police.roadblock;
    if (rb && rb.active) {
      var rbTargetZ = 30;
      var dz = rbTargetZ - rb.z;
      rb.z = rbTargetZ;
      var j;
      for (j = 0; j < rb.units.length; j++) rb.units[j].pos.z += dz;
      for (j = 0; j < rb.officers.length; j++) {
        rb.officers[j].pos.z += dz;
        rb.officers[j].mesh.position.copy(rb.officers[j].pos);
      }
      if (g.police._rbGroup) g.police._rbGroup.position.z += dz;
    }

    this.chaseUnits = [
      this._policeUnit(391.5, -14, Math.PI + 0.08, 24),
      this._policeUnit(408.5, -14, Math.PI - 0.08, 24)
    ];
    this._clearTraffic(400, 30, 18);
    this._clearTraffic(400, -42, 24);
    if (g.hud && g.hud.setPrompt) g.hud.setPrompt('');
    this._camera([400, 4.0, -46], [400, 1.35, -5], 40);
  };

  /* --------------------------------------------------------------- mission */

  Shots.prototype._mission = function () {
    var g = this.game;
    var p = g.player;
    this._setClock(1350, 'clear');
    this._place(354.4, -352, 2.98);
    p.health = 96;
    p.armor = 70;
    p.money = 12840;
    this._gun('rifle', 30, 120);
    if (g.combat) g.combat.setWeapon('rifle');
    p.setVisible(true);

    var crateMat = new THREE.MeshStandardMaterial({
      color: 0x8f8878,
      roughness: 0.88,
      metalness: 0.04
    });
    var crate = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.15, 0.82), crateMat);
    crate.position.set(348.5, 0.58, -353.4);
    crate.castShadow = true;
    crate.receiveShadow = true;
    g.scene.add(crate);
    this.staged.push(crate);

    var hedgeMat = new THREE.MeshStandardMaterial({ color: 0x2f6a3c, roughness: 0.95 });
    var hedge = new THREE.Mesh(new THREE.BoxGeometry(17, 1.35, 0.9), hedgeMat);
    hedge.position.set(358, 0.72, -364.8);
    hedge.castShadow = true;
    hedge.receiveShadow = true;
    g.scene.add(hedge);
    this.staged.push(hedge);

    if (g.missions) {
      g.missions.start(4);
      g.missions.begin();
      g.state = 'play';
      g.missions.stepIndex = 2;
      g.missions._syncMissionHud(true);
      if (g.hud && g.hud.setScreen) g.hud.setScreen('hud');
    }
    g.police.setWanted(4);
    g.police.bustedMeter = 0;
    this._clearTraffic(360, -355, 26);

    var guards = [
      { x: 353.2, z: -360.5, yaw: 0.35 },
      { x: 365.5, z: -359, yaw: -0.42 }
    ];
    this.missionGuards = [];
    for (var i = 0; i < guards.length; i++) {
      var guard = g.combat.spawnEnemy({
        x: guards[i].x,
        z: guards[i].z,
        yaw: guards[i].yaw,
        faction: 'guard',
        health: 90,
        weapon: 'pistol',
        hostile: true,
        seed: 'shot-guard-' + i
      });
      if (guard && g.missions) {
        guard._missionRole = 'guard';
        g.missions.actors.enemies.push(guard);
        this.missionGuards.push(guard);
      }
    }
    var boss = g.combat.spawnEnemy({
      boss: true,
      x: 358,
      z: -359.2,
      yaw: 0,
      health: 220,
      weapon: 'smg',
      hostile: true,
      seed: 'shot-captain'
    });
    if (boss) {
      boss.name = 'CROWE CAPTAIN';
      boss._missionRole = 'boss';
      if (g.missions) {
        g.missions.actors.boss = boss;
        g.missions.actors.enemies.push(boss);
      }
      this.missionBoss = boss;
    }
    if (g.hud && g.hud.setPrompt) g.hud.setPrompt('');
    this._camera([353.0, 2.35, -345.4], [358.3, 1.25, -359.3], 50);
  };

  /* -------------------------------------------------------------- lifecycle */

  Shots.prototype.setup = function (name) {
    var g = this.game;
    this.name = NAMES.indexOf(name) >= 0 ? name : 'hero';
    this.ready = false;
    if (g) {
      g.shotName = this.name;
      g.shotReady = false;
    }
    window.__shot = this.name;
    this.staged = [];
    this._base();
    if (this.name === 'hero') this._hero();
    else if (this.name === 'city') this._city();
    else if (this.name === 'chase') this._chase();
    else this._mission();

    for (var i = 0; i < STEPS; i++) {
      g.update(STEP);
    }

    if (this.name === 'hero') {
      this._camera([-388.6, 2.32, 219.5], [-389.6, 1.18, 208.8], 58);
      if (g.missions) g.missions._syncMissionHud(true);
      if (g.hud && g.hud.hideDialogue) g.hud.hideDialogue();
    } else if (this.name === 'city') {
      var p = g.player;
      var c = this.cityPose;
      if (c) {
        p.pos.set(c.px, c.top + 0.16, c.pz);
        p.mesh.position.copy(p.pos);
        p.yaw = 2.85;
        p.mesh.rotation.y = p.yaw;
        p.mesh.visible = true;
        p.character.setPose(p.time || 0, 0, 'idle');
        this._camera(c.camPos, c.look, 55);
      }
    } else if (this.name === 'chase') {
      var car = g.player.vehicle;
      if (car) {
        car.pos.set(400, 0, -30);
        car.heading = 0;
        car.speed = 34;
        car.vx = 0;
        car.vz = 34;
        car.mesh.position.copy(car.pos);
        car.mesh.rotation.y = car.heading;
        car.setVisible(true);
        g.player.pos.copy(car.pos);
      }
      var cu = this.chaseUnits || [];
      if (cu[0]) {
        cu[0].pos.set(391.5, 0, -14);
        cu[0].heading = Math.PI + 0.08;
        cu[0].speed = 24;
        cu[0].vx = -1.9;
        cu[0].vz = -23.9;
        cu[0].mesh.position.copy(cu[0].pos);
        cu[0].mesh.rotation.y = cu[0].heading;
      }
      if (cu[1]) {
        cu[1].pos.set(408.5, 0, -14);
        cu[1].heading = Math.PI - 0.08;
        cu[1].speed = 24;
        cu[1].vx = 1.9;
        cu[1].vz = -23.9;
        cu[1].mesh.position.copy(cu[1].pos);
        cu[1].mesh.rotation.y = cu[1].heading;
      }
      this._camera([400, 4.0, -46], [400, 1.35, -5], 40);
      this._hide('prompt');
      this._hide('dialogue');
      this._clearToasts();
      this._clearTraffic(400, -42, 24);
      if (g.missions) g.missions._syncMissionHud(true);
    } else {
      g.player.health = 96;
      g.player.armor = 70;
      g.player.dead = false;
      g.player.pos.set(354.4, 0, -352);
      g.player.yaw = 2.98;
      g.player.mesh.position.copy(g.player.pos);
      g.player.mesh.rotation.y = g.player.yaw;
      if (this.missionBoss && this.missionBoss.alive !== false) {
        this.missionBoss.pos.set(358, 0, -359.2);
        this.missionBoss.yaw = 0;
        this.missionBoss.mesh.position.copy(this.missionBoss.pos);
        this.missionBoss.mesh.rotation.y = 0;
        this.missionBoss.health = Math.max(150, this.missionBoss.health || 220);
        if (this.missionBoss._updateBar) this.missionBoss._updateBar();
        if (this.missionBoss._bar) this.missionBoss._bar.visible = true;
        if (this.missionBoss._bar && this.missionBoss._barFill) {
          var ratio = this.missionBoss.health / Math.max(1, this.missionBoss.maxHealth);
          this.missionBoss._bar.scale.set(1.65, 0.2, 1);
          this.missionBoss._barFill.position.x = -0.825;
          this.missionBoss._barFill.scale.set(1.65 * ratio, 0.13, 1);
        }
      }
      var guards = this.missionGuards || [];
      if (guards[0]) {
        guards[0].pos.set(353.2, 0, -360.5);
        guards[0].yaw = 0.35;
        guards[0].mesh.position.copy(guards[0].pos);
        guards[0].mesh.rotation.y = guards[0].yaw;
      }
      if (guards[1]) {
        guards[1].pos.set(365.5, 0, -359);
        guards[1].yaw = -0.42;
        guards[1].mesh.position.copy(guards[1].pos);
        guards[1].mesh.rotation.y = guards[1].yaw;
      }
      g.police.bustedMeter = 0;
      this._hide('busted-meter');
      this._camera([353.0, 2.35, -345.4], [358.3, 1.25, -359.3], 50);
      if (g.missions) g.missions._syncMissionHud(true);
    }

    if (g.hud) {
      if (g.hud.moneyShown != null && g.player) {
        g.hud.moneyShown = g.player.money;
        g.hud._moneyTarget = g.player.money;
      }
      if (this.name === 'mission' && g.hud.dialogue) {
        g.hud.dialogue('CROWE', 'You brought a rifle to my house, Calder. I brought an army.');
      }
      g.hud.update(1 / 60);
    }

    if (this.name === 'mission' && g.combat) {
      g.combat.nextFire = 0;
      g.combat.reloadTimer = 0;
      try { g.combat.fire(); } catch (e) { /* the frame still works without a shot */ }
      if (g.hud) g.hud.update(1 / 60);
      if (g.hud && g.hud.dialogue) {
        g.hud.dialogue('CROWE', 'You brought a rifle to my house, Calder. I brought an army.');
      }
      this._hide('busted-meter');
      var objective = document.getElementById('mission-objective');
      if (objective) objective.textContent = "DEFEAT CROWE'S CAPTAIN";
    }

    this._hideObjectiveMarkers();
    if (this.name === 'mission') {
      this._hide('busted-meter');
      this._clearToasts();
    }

    if (g.render) {
      g.render();
      g.render();
    }
    this.ready = true;
    g._shotFrozen = true;
    g.shotReady = true;
    g.state = 'play';
    /* main.js clears the flag right after construction; restore it on the next
       task so the capture harness sees a fully composed, frozen frame. */
    window.setTimeout(function () {
      g.shotReady = true;
    }, 0);
  };

  Shots.prototype.update = function (dt) {
    this.time += dt || 0;
  };

  LH.Shots = Shots;
}());
