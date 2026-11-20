/* LEONIDA HEAT 3D — story missions.
   Five data-driven missions with briefings, timed objectives, actors, dialogue,
   a live dispatch table and crew abilities. Classic script, attaches LH.Missions.

   The module owns mission-only actors and props but borrows the shared systems:
   LH.Vehicle for the Serata and the armored truck, LH.Ped for the debtors,
   LH.Combat for guard waves / bosses and LH.Police for heat and roadblocks. */
(function () {
  'use strict';

  window.LH = window.LH || {};

  var CFG = window.LH.CONFIG || {};
  var MISSION_DATA = CFG.MISSIONS || [];
  var CREW = CFG.CREW || {};
  var WORLD_CFG = CFG.WORLD || {};
  var POINTS = WORLD_CFG.points || {};
  var TAU = Math.PI * 2;

  var RANK_BONUS = { S: 1000, A: 500, B: 250, C: 0 };

  var MISSION_BEATS = {
    'valet-run': [
      'Car is right there. Go.',
      'That is the one. Do not stall it.',
      'Hotel drive, nice and easy.'
    ],
    'plaza-debt': [
      'Rico first. Make it count.',
      'Tavo heard that. He is next.',
      'Now lose the blue lights.'
    ],
    'pier-heist': [
      'Case is on the deck. Go.',
      'Got it. Here they come.',
      'Second team. Hold the pier.',
      'Ramp is clear. Move.'
    ],
    'convoy': [
      'There is the truck. Take it.',
      'Truck is yours. South, now.',
      'Roadblock ahead. X when ready.',
      'Garage is open. Bring it in.'
    ],
    'estate-siege': [
      'Courtyard. Clear it.',
      'Captain is in the back.',
      'Gate is closing. Get out.'
    ]
  };

  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  function dist2(ax, az, bx, bz) {
    var dx = ax - bx;
    var dz = az - bz;
    return Math.sqrt(dx * dx + dz * dz);
  }

  function pad(n) {
    return n < 10 ? '0' + n : String(n);
  }

  function formatTime(seconds) {
    var total = Math.max(0, Math.round(seconds || 0));
    var m = Math.floor(total / 60);
    var s = total % 60;
    return pad(m) + ':' + pad(s);
  }

  function formatMoney(n) {
    var s = String(Math.max(0, Math.round(n || 0)));
    return s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function point(name, fallback) {
    return POINTS[name] || fallback || { x: 0, z: 0 };
  }

  /* --------------------------------------------------------------- mission */

  function Missions(game) {
    this.game = game || {};
    this.list = MISSION_DATA.slice();
    this.index = 0;
    this.active = null;
    this.marker = null;
    this.briefing = false;
    this.dialogueQueue = [];
    this.timer = 0;
    this.timerTotal = 0;
    this.stepIndex = 0;
    this.counts = this._blankCounts();
    this.checkpoint = null;
    this.completed = [];
    this.rank = null;
    this.cleared = false;
    this.heat = 0;

    for (var c = 0; c < this.list.length; c++) this.completed.push(false);

    this.actors = {
      cars: [],
      peds: [],
      enemies: [],
      caseProp: null,
      boss: null,
      valetCar: null,
      truck: null
    };
    this.abilities = {
      maya: { id: 'maya', remaining: 0, cooldown: (CREW.maya && CREW.maya.cooldown) || 40, ready: true },
      dez: { id: 'dez', remaining: 0, cooldown: (CREW.dez && CREW.dez.cooldown) || 50, ready: true },
      rook: { id: 'rook', remaining: 0, cooldown: (CREW.rook && CREW.rook.cooldown) || 45, ready: true }
    };
    this.crew = this.abilities;

    this.elapsed = 0;
    this.failed = false;
    this.failReason = '';
    this._ending = false;
    this._cleanupPending = false;
    this._briefingMission = null;
    this._stepDelay = 0;
    this._hudAccum = 0;
    this._crewHudAccum = 0;
    this._time = 0;
    this._markerTime = 0;
    this._promptText = '';
    this._hudSig = '';
    this._lastMeleeNotify = -10;
    this._dialogueDisplay = 0;
    this._dialogueCurrent = null;
    this._shownDialogue = [];
    this._said = {};
    this._flags = {};
    this._mayaForStep = false;
    this._roadblockTriggered = false;
    this._roadblockRetry = 0;
    this._truckParked = false;
    this._spawnQueue = [];
    this._spawnTimer = 0;
    this._wave = null;
    this._markerGlyph = '';
    this._labelCache = {};
    this._matCache = {};

    this._buildMarker();
    this._buildCheckpoint();
    this._syncMarker();
    this._syncMissionHud(true);
    this._syncCrewHud();
  }

  /* ----------------------------------------------------------- small utils */

  Missions.prototype._blankCounts = function () {
    return {
      kills: 0,
      guards: 0,
      boss: 0,
      waves: 0,
      mayaDecoys: 0,
      melee: {}
    };
  };

  Missions.prototype._step = function () {
    if (!this.active || !this.active.steps) return null;
    return this.active.steps[this.stepIndex] || null;
  };

  Missions.prototype._player = function () {
    return this.game.player || this.game.preview || null;
  };

  Missions.prototype._police = function () {
    return this.game.police || null;
  };

  Missions.prototype._combat = function () {
    return this.game.combat || null;
  };

  Missions.prototype._hud = function () {
    return this.game.hud || null;
  };

  Missions.prototype._toast = function (text, kind) {
    var hud = this._hud();
    if (hud && hud.toast) {
      try { hud.toast(text, kind || 'mission'); } catch (e) { /* optional hud */ }
    }
  };

  Missions.prototype._prompt = function (text) {
    var hud = this._hud();
    if (!hud || !hud.setPrompt) return;
    try { hud.setPrompt(text || ''); } catch (e) { /* optional hud */ }
  };

  Missions.prototype._result = function (win, data) {
    if (typeof this.game.showResult === 'function') {
      this.game.showResult(win, data);
      return;
    }
    var hud = this._hud();
    if (hud && hud.showResult) {
      try { hud.showResult(win, data); } catch (e) { /* optional hud */ }
    }
    this.game.state = 'result';
  };

  Missions.prototype._setScreen = function (name) {
    var hud = this._hud();
    if (hud && hud.setScreen) {
      try { hud.setScreen(name); } catch (e) { /* optional hud */ }
    }
  };

  Missions.prototype._groundY = function (x, z) {
    var world = this.game.world;
    if (world && world.groundHeight) {
      try { return world.groundHeight(x, z); } catch (e) { return 0; }
    }
    return 0;
  };

  Missions.prototype._texture = function (text, fg, bg) {
    var key = String(text) + ':' + fg + ':' + bg;
    if (this._labelCache[key]) return this._labelCache[key];
    if (!window.THREE || !document.createElement) return null;
    var canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    var g = canvas.getContext('2d');
    if (!g) return null;
    if (bg) {
      g.fillStyle = bg;
      g.fillRect(0, 0, 256, 128);
    }
    g.fillStyle = fg || '#f3c969';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = 'bold 72px Arial, sans-serif';
    g.fillText(String(text || ''), 128, 68);
    var tex = new THREE.CanvasTexture(canvas);
    if (THREE.sRGBEncoding) tex.encoding = THREE.sRGBEncoding;
    tex.needsUpdate = true;
    this._labelCache[key] = tex;
    return tex;
  };

  /* ---------------------------------------------------------------- marker */

  Missions.prototype._buildMarker = function () {
    if (!window.THREE || !this.game.scene) return;
    var group = new THREE.Group();
    group.name = 'mission-marker';

    var cylMat = new THREE.MeshBasicMaterial({
      color: 0xf3c969,
      transparent: true,
      opacity: 0.16,
      side: THREE.DoubleSide,
      depthWrite: false,
      toneMapped: false
    });
    var cylGeo = new THREE.CylinderGeometry(1.35, 1.62, 2.5, 24, 1, true);
    var cyl = new THREE.Mesh(cylGeo, cylMat);
    cyl.position.y = 1.25;
    group.add(cyl);

    var ringMat = new THREE.MeshBasicMaterial({
      color: 0xffe3a0,
      transparent: true,
      opacity: 0.86,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false
    });
    var ringGeo = new THREE.TorusGeometry(1.9, 0.065, 8, 40);
    var ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.08;
    group.add(ring);

    var ring2 = new THREE.Mesh(ringGeo, ringMat);
    ring2.rotation.x = Math.PI / 2;
    ring2.position.y = 1.8;
    ring2.scale.setScalar(0.72);
    group.add(ring2);

    var spriteMat = new THREE.SpriteMaterial({
      map: this._texture('★', '#ffe3a0', null),
      transparent: true,
      depthWrite: false,
      toneMapped: false
    });
    var sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(1.65, 1.65, 1);
    sprite.position.y = 3.25;
    group.add(sprite);

    group.visible = false;
    this.game.scene.add(group);
    this.marker = group;
    this._markerMat = cylMat;
    this._markerRingMat = ringMat;
    this._markerRing = ring;
    this._markerRing2 = ring2;
    this._markerSprite = sprite;
    this._markerSpriteMat = spriteMat;
  };

  Missions.prototype._markerVisible = function () {
    return this.game.state === 'play' && !this.active && !this.briefing;
  };

  Missions.prototype._markerPoint = function () {
    if (this.cleared || this.index >= this.list.length) {
      return point('safehouse', { x: -50, z: 150 });
    }
    var m = this.list[this.index];
    return (m && m.marker) || point('safehouse', { x: -50, z: 150 });
  };

  Missions.prototype._syncMarker = function () {
    if (!this.marker) return;
    var p = this._markerPoint();
    this.marker.position.set(p.x, this._groundY(p.x, p.z), p.z);
    var label = (this.cleared || this.index >= this.list.length)
      ? '★'
      : String((this.list[this.index] && this.list[this.index].title) || '?').charAt(0);
    if (label !== this._markerGlyph) {
      this._markerGlyph = label;
      var tex = this._texture(label, '#ffe3a0', null);
      if (tex && this._markerSpriteMat) {
        this._markerSpriteMat.map = tex;
        this._markerSpriteMat.needsUpdate = true;
      }
    }
  };

  Missions.prototype._updateMarker = function (dt) {
    this._markerTime += dt;
    if (!this.marker) return;
    this.marker.visible = this._markerVisible();
    if (!this.marker.visible) return;
    var pulse = 0.5 + 0.5 * Math.sin(this._markerTime * 3.1);
    if (this._markerRing) {
      this._markerRing.scale.setScalar(1 + pulse * 0.10);
      this._markerRing.material.opacity = 0.55 + pulse * 0.35;
    }
    if (this._markerRing2) {
      this._markerRing2.scale.setScalar(0.68 + pulse * 0.06);
      this._markerRing2.material.opacity = 0.35 + pulse * 0.24;
    }
    if (this._markerMat) this._markerMat.opacity = 0.10 + pulse * 0.08;
    if (this._markerSprite) {
      this._markerSprite.position.y = 3.1 + Math.sin(this._markerTime * 2.2) * 0.12;
      this._markerSprite.material.rotation = Math.sin(this._markerTime * 0.8) * 0.03;
    }
    this.marker.rotation.y += dt * 0.55;
  };

  Missions.prototype._markerDistance = function () {
    var p = this._player();
    if (!p || !p.pos) return 1e9;
    var mp = this._markerPoint();
    return dist2(p.pos.x, p.pos.z, mp.x, mp.z);
  };

  /* ------------------------------------------------------------ checkpoint */

  Missions.prototype._buildCheckpoint = function () {
    if (!window.THREE || !this.game.scene) return;
    var group = new THREE.Group();
    group.name = 'mission-checkpoint';

    var ringMat = new THREE.MeshBasicMaterial({
      color: 0xf3c969,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false
    });
    var ring = new THREE.Mesh(new THREE.TorusGeometry(2.1, 0.07, 8, 40), ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.09;
    group.add(ring);

    var glowMat = new THREE.MeshBasicMaterial({
      color: 0xffe3a0,
      transparent: true,
      opacity: 0.10,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false
    });
    var glow = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.9, 2.1, 20, 1, true), glowMat);
    glow.position.y = 1.05;
    group.add(glow);

    group.visible = false;
    this.game.scene.add(group);
    this.checkpoint = group;
    this._checkpointRing = ring;
    this._checkpointGlow = glow;
    this._checkpointTime = 0;
  };

  Missions.prototype._syncCheckpoint = function () {
    if (!this.checkpoint) return;
    var step = this._step();
    var target = step && step.target;
    if (!this.active || !target || this._ending) {
      this.checkpoint.visible = false;
      return;
    }
    this.checkpoint.position.set(target.x, this._groundY(target.x, target.z), target.z);
    this.checkpoint.visible = true;
  };

  Missions.prototype._updateCheckpoint = function (dt) {
    if (!this.checkpoint || !this.checkpoint.visible) return;
    this._checkpointTime += dt;
    var p = 0.5 + 0.5 * Math.sin(this._checkpointTime * 2.6);
    if (this._checkpointRing) {
      this._checkpointRing.scale.setScalar(1 + p * 0.12);
      this._checkpointRing.material.opacity = 0.45 + p * 0.4;
    }
    if (this._checkpointGlow) this._checkpointGlow.material.opacity = 0.05 + p * 0.08;
    this.checkpoint.rotation.y += dt * 0.8;
  };

  /* --------------------------------------------------------------- briefing */

  Missions.prototype._resolveIndex = function (index) {
    if (typeof index === 'string') {
      for (var i = 0; i < this.list.length; i++) {
        if (this.list[i].id === index) return i;
      }
    }
    var n = Number(index);
    if (!isFinite(n)) n = this.index;
    n = Math.round(n);
    if (n < 0) n = 0;
    return clamp(n, 0, this.list.length);
  };

  Missions.prototype.start = function (index) {
    if (this.active || this.briefing) return false;
    var i = this._resolveIndex(index == null ? this.index : index);
    if (i >= this.list.length) {
      this.cleared = true;
      this._toast('CITY CLEARED · ALL FIVE JOBS DONE', 'mission');
      return false;
    }
    this.index = i;
    this._briefingMission = this.list[i];
    this.rank = null;
    this.failed = false;
    this.failReason = '';

    var hud = this._hud();
    if (hud && hud.showBriefing) {
      this.briefing = true;
      if (typeof this.game.showBriefing === 'function') {
        try { this.game.showBriefing(this._briefingMission); } catch (e) { this._showBriefingFallback(); }
      } else {
        try { hud.showBriefing(this._briefingMission); } catch (e) { this._showBriefingFallback(); }
        this.game.state = 'briefing';
      }
    } else {
      this.briefing = false;
      this._launch(i);
      return true;
    }
    if (this.game.input && this.game.input.exitLock) this.game.input.exitLock();
    if (this.marker) this.marker.visible = false;
    this._syncMarker();
    return true;
  };

  Missions.prototype._showBriefingFallback = function () {
    this.briefing = false;
    this.game.state = 'play';
    this._setScreen('hud');
    this._launch(this.index);
  };

  Missions.prototype.begin = function () {
    if (!this.briefing) {
      if (this.active) return false;
      if (this.list[this.index]) this._launch(this.index);
      return true;
    }
    var i = this._resolveIndex(this._briefingMission ? this._briefingMission.id : this.index);
    this.briefing = false;
    this._briefingMission = null;
    this._launch(i);
    return true;
  };

  Missions.prototype.cancelBriefing = function () {
    if (!this.briefing) return false;
    this.briefing = false;
    this._briefingMission = null;
    if (this.game.state === 'briefing') this.game.state = 'play';
    this._setScreen('hud');
    this._syncMarker();
    if (this.marker) this.marker.visible = false;
    return true;
  };

  /* ---------------------------------------------------------------- launch */

  Missions.prototype._launch = function (index) {
    var m = this.list[index];
    if (!m) return false;
    this._teardownMission();
    this.index = index;
    this.active = m;
    this.rank = null;
    this.failed = false;
    this.failReason = '';
    this._ending = false;
    this._cleanupPending = false;
    this.stepIndex = 0;
    this.timerTotal = m.timer || 0;
    this.timer = this.timerTotal;
    this.elapsed = 0;
    this.counts = this._blankCounts();
    this.dialogueQueue = [];
    this._shownDialogue = [];
    this._said = {};
    this._flags = {};
    this._stepDelay = 0.4;
    this._hudAccum = 0;
    this._lastMeleeNotify = -10;
    this._dialogueDisplay = 0;
    this._dialogueCurrent = null;
    this._mayaForStep = false;
    this._roadblockTriggered = false;
    this._roadblockRetry = 0;
    this._truckParked = false;
    this._spawnQueue = [];
    this._spawnTimer = 0;
    this._wave = null;

    var police = this._police();
    if (police && police.setWanted) police.setWanted(m.heatOnStart || 0);
    else if (this.game.player && this.game.player.setWanted) this.game.player.setWanted(m.heatOnStart || 0);
    this.heat = police ? police.wanted : (m.heatOnStart || 0);

    this._setupMission(m);
    this._enterStep(this._step());
    this._syncMarker();
    this._syncCheckpoint();
    this._syncMissionHud(true);
    this._toast('MISSION START · ' + m.title, 'mission');
    this._syncCrewHud();
    return true;
  };

  Missions.prototype._setupMission = function (m) {
    if (m.id === 'valet-run') {
      var slip = point('marinaSlip', m.marker);
      var car = this._findDemoSport(slip, 14);
      if (!car) car = this._spawnVehicle('sports', slip.x + 2.2, slip.z + 1.5, 0.25, '#ff6f61');
      if (car) {
        car.missionLocked = true;
        car.locked = true;
        this.actors.valetCar = car;
        this._toast('SERATA GT LOCATED AT SLIP 9', 'info');
      }
    } else if (m.id === 'plaza-debt') {
      var one = point('debtorOne', { x: 28, z: 66 });
      var two = point('debtorTwo', { x: 74, z: 26 });
      this._spawnDebtor(one.x, one.z, 'RICO', 'debtor-rico', 0.8);
      this._spawnDebtor(two.x, two.z, 'TAVO', 'debtor-tavo', -2.3);
      var combat = this._combat();
      if (combat && combat.setWeapon) combat.setWeapon('fists');
      if (combat && combat.refill) combat.refill();
      this._toast('FISTS ONLY · NO GUNS ON PLAZA SOL', 'info');
    } else if (m.id === 'pier-heist') {
      this._spawnCase(point('pierCase', { x: -444, z: 312 }));
    } else if (m.id === 'convoy') {
      var ring = point('ringRoad', { x: 400, z: -100 });
      this.actors.truck = this._spawnVehicle('armored', ring.x, ring.z - 58, 0, '#6f7a70');
      if (this.actors.truck) {
        this._truckParked = false;
        this._toast('ARMORED TRUCK ON THE RING ROAD', 'mission');
      }
    } else if (m.id === 'estate-siege') {
      var police = this._police();
      if (police && police.setWanted) police.setWanted(m.heatOnStart || 4);
    }
  };

  Missions.prototype._findDemoSport = function (near, radius) {
    var list = this.game.demoVehicles || [];
    for (var i = 0; i < list.length; i++) {
      var v = list[i];
      if (!v || v.destroyed || v.type !== 'sports') continue;
      if (dist2(v.pos.x, v.pos.z, near.x, near.z) <= radius) return v;
    }
    for (var a = 0; a < this.actors.cars.length; a++) {
      var c = this.actors.cars[a];
      if (c && c.type === 'sports' && !c.destroyed) return c;
    }
    return null;
  };

  Missions.prototype._spawnVehicle = function (type, x, z, heading, color) {
    if (!window.THREE || !window.LH.Vehicle || !this.game.scene) return null;
    var self = this;
    var car = new LH.Vehicle(this.game.scene, this.game.world, type, {
      x: x,
      z: z,
      heading: heading || 0,
      color: color
    });
    car.onSound = function (speed, throttle) {
      if (self.game.audio && self.game.audio.engine) self.game.audio.engine(speed, throttle);
    };
    if (this.game.demoVehicles) this.game.demoVehicles.push(car);
    if (this.game._vehiclePool) this.game._vehiclePool.push(car);
    this.actors.cars.push(car);
    return car;
  };

  Missions.prototype._spawnDebtor = function (x, z, name, seed, yaw) {
    if (!window.THREE || !window.LH.Ped || !this.game.scene) return null;
    var ped = new LH.Ped(this.game.scene, this.game.world, {
      x: x,
      z: z,
      yaw: yaw || 0,
      faction: 'civilian',
      seed: seed,
      healthBar: true
    });
    ped.health = 60;
    ped.maxHealth = 60;
    ped.isDebtor = true;
    ped.debtorName = name;
    ped.stationary = true;
    ped.update = function (dt) {
      this.time += dt;
      this.mesh.rotation.y = this.yaw;
      this.speed = 0;
      this.character.setPose(this.time, 0, 'idle');
      if (this._bar && this._bar.visible && this._updateBar) this._updateBar();
    };
    this._attachNameTag(ped, name);
    this.actors.peds.push(ped);
    return ped;
  };

  Missions.prototype._attachNameTag = function (ped, name) {
    if (!window.THREE || !ped || !ped.mesh) return;
    var tex = this._texture(name, '#ffe3a0', '#0b1424');
    if (!tex) return;
    var mat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false
    });
    var sprite = new THREE.Sprite(mat);
    sprite.scale.set(2.3, 1.15, 1);
    sprite.position.set(0, 2.42, 0);
    sprite.renderOrder = 6;
    ped.mesh.add(sprite);
    ped.nameSprite = sprite;
  };

  Missions.prototype._spawnCase = function (p) {
    if (!window.THREE || !this.game.scene) return null;
    var group = new THREE.Group();
    group.name = 'mission-case';
    var body = new THREE.Mesh(
      new THREE.BoxGeometry(0.62, 0.38, 0.20),
      new THREE.MeshStandardMaterial({ color: 0xf3c969, metalness: 0.5, roughness: 0.35 })
    );
    body.position.y = 0.45;
    body.castShadow = true;
    group.add(body);
    var handle = new THREE.Mesh(
      new THREE.TorusGeometry(0.13, 0.022, 6, 16, Math.PI),
      new THREE.MeshStandardMaterial({ color: 0x332a20, metalness: 0.6, roughness: 0.4 })
    );
    handle.position.y = 0.68;
    handle.rotation.x = Math.PI;
    group.add(handle);
    var ringMat = new THREE.MeshBasicMaterial({
      color: 0xffe3a0,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false
    });
    var ring = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.035, 8, 28), ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.06;
    group.add(ring);
    group.position.set(p.x, this._groundY(p.x, p.z), p.z);
    this.game.scene.add(group);
    this.actors.caseProp = group;
    this._caseRing = ring;
    this._casePoint = { x: p.x, z: p.z };
    return group;
  };

  Missions.prototype._clearCase = function () {
    var prop = this.actors.caseProp;
    if (!prop) return;
    if (prop.parent) prop.parent.remove(prop);
    this.actors.caseProp = null;
    this._caseRing = null;
  };

  /* ------------------------------------------------------------- step logic */

  Missions.prototype._enterStep = function (step) {
    if (!step) return;
    this._syncCheckpoint();
    this._syncMissionHud(true);
    if (step.kind === 'survive') {
      this._wave = {
        spawned: false,
        active: true,
        timer: 0.9,
        count: step.count || 3,
        enemies: []
      };
      this.counts.waves++;
    } else if (step.kind === 'eliminate') {
      this.counts.guards = 0;
      this._spawnQueue = this._courtyardSpawns(step.count || 6);
      this._spawnTimer = 0.2;
    } else if (step.kind === 'boss') {
      this._spawnBoss();
    } else if (step.kind === 'interact') {
      if (this.actors.caseProp) this.actors.caseProp.visible = true;
    } else if (step.kind === 'ability') {
      this._mayaForStep = false;
      this._ensureRoadblock();
    }
  };

  Missions.prototype._courtyardSpawns = function (count) {
    var center = point('estateCourtyard', { x: 360, z: -360 });
    var out = [];
    for (var i = 0; i < count; i++) {
      var a = (i / count) * TAU + 0.42;
      var r = 9.5 + (i % 3) * 2.6;
      var x = center.x + Math.sin(a) * r;
      var z = center.z + Math.cos(a) * r;
      var world = this.game.world;
      if (world && world.collideCircle) {
        var res = world.collideCircle(x, z, 0.55);
        x = res.x;
        z = res.z;
      }
      out.push({ x: x, z: z });
    }
    return out;
  };

  Missions.prototype._spawnBoss = function () {
    var combat = this._combat();
    if (!combat || !combat.spawnEnemy) return null;
    var p = point('estateCaptain', { x: 386, z: -386 });
    var boss = combat.spawnEnemy({
      boss: true,
      x: p.x,
      z: p.z,
      yaw: Math.PI,
      health: 220,
      weapon: 'smg',
      hostile: true,
      seed: 'estate-captain'
    });
    if (!boss) return null;
    boss._missionRole = 'boss';
    boss.name = 'CROWE CAPTAIN';
    this.actors.boss = boss;
    this.actors.enemies.push(boss);
    this._toast('CROWE CAPTAIN · 220 HP', 'danger');
    return boss;
  };

  Missions.prototype._spawnWave = function (step) {
    var combat = this._combat();
    if (!combat || !combat.spawnWave || !this._wave) return;
    var center = step.target || point('pierCase', { x: -444, z: 312 });
    var list = combat.spawnWave(this._wave.count, center, {
      faction: 'guard',
      health: 85,
      weapon: 'pistol',
      hostile: true,
      radius: 11
    });
    this._wave.enemies = list || [];
    this._wave.spawned = true;
    for (var i = 0; i < this._wave.enemies.length; i++) {
      this._wave.enemies[i]._missionRole = 'wave';
      this.actors.enemies.push(this._wave.enemies[i]);
    }
    this._toast('GUARD WAVE · ' + this._wave.enemies.length + ' HOSTILES', 'danger');
  };

  Missions.prototype._waveAlive = function () {
    if (!this._wave) return 0;
    var n = 0;
    for (var i = 0; i < this._wave.enemies.length; i++) {
      if (this._wave.enemies[i] && this._wave.enemies[i].alive) n++;
    }
    return n;
  };

  Missions.prototype._stepReady = function (step) {
    var player = this._player();
    if (!player || !player.pos) return false;
    var target = step.target;
    var radius = step.radius || 4;
    var d = target ? dist2(player.pos.x, player.pos.z, target.x, target.z) : 1e9;

    if (step.kind === 'goto') return d <= radius;
    if (step.kind === 'enter') {
      if (!player.vehicle) return false;
      if (step.vehicle && player.vehicle.type !== step.vehicle) return false;
      return true;
    }
    if (step.kind === 'deliver') {
      if (!player.vehicle) return false;
      if (step.vehicle && player.vehicle.type !== step.vehicle) return false;
      return d <= radius;
    }
    if (step.kind === 'drive') {
      if (!player.vehicle) return false;
      if (this.active && this.active.id === 'convoy' && player.vehicle.type !== 'armored') return false;
      return d <= radius + 8;
    }
    if (step.kind === 'melee') return (this.counts.melee[step.id] || 0) >= (step.count || 3);
    if (step.kind === 'evade') {
      var police = this._police();
      var wanted = police ? police.wanted : (player.wanted || 0);
      return wanted <= 0;
    }
    if (step.kind === 'interact') return !!this._flags['interact:' + step.id];
    if (step.kind === 'survive') {
      return !!(this._wave && this._wave.spawned && this._waveAlive() === 0);
    }
    if (step.kind === 'eliminate') {
      return this.counts.guards >= (step.count || 6) && this._spawnQueue.length === 0;
    }
    if (step.kind === 'boss') {
      return !!(this.actors.boss && !this.actors.boss.alive);
    }
    if (step.kind === 'ability') return !!this._mayaForStep;
    return target ? d <= radius : false;
  };

  Missions.prototype._advanceStep = function () {
    var step = this._step();
    if (!step) return;
    this._onStepDone(step);
    this.stepIndex++;
    this._stepDelay = 0.5;
    if (this.stepIndex >= (this.active.steps || []).length) {
      this.complete();
      return;
    }
    var next = this._step();
    this._toast('OBJECTIVE · ' + next.text, 'mission');
    var beats = MISSION_BEATS[this.active.id] || [];
    var beat = beats[this.stepIndex];
    if (beat) this._say(this.active.giver || 'DISPATCH', beat, 'beat:' + this.active.id + ':' + this.stepIndex);
    this._enterStep(next);
    this._syncCheckpoint();
    this._syncMissionHud(true);
  };

  Missions.prototype._onStepDone = function (step) {
    var police = this._police();
    if (step.id === 'debtor-one' && police && police.setWanted) {
      police.setWanted(2);
      this._toast('RICO TALKED · 2-STAR RESPONSE', 'danger');
    }
    if (step.id === 'run-ring') this._triggerConvoyRoadblock();
    if (step.id === 'captain' || step.kind === 'boss') {
      if (police && police.setWanted) police.setWanted(5);
      this._toast('CAPTAIN DOWN · 5-STAR RESPONSE', 'danger');
    }
  };

  Missions.prototype._evaluateStep = function (dt) {
    if (this._ending) return;
    if (this._stepDelay > 0) {
      this._stepDelay -= dt;
      return;
    }
    var step = this._step();
    if (!step) return;
    if (this._stepReady(step)) this._advanceStep();
  };

  /* ------------------------------------------------------------ interaction */

  Missions.prototype._nearInteract = function () {
    if (!this.active) return false;
    var step = this._step();
    if (!step || step.kind !== 'interact' || !step.target) return false;
    if (this._flags['interact:' + step.id]) return false;
    var p = this._player();
    if (!p || !p.pos) return false;
    var d = dist2(p.pos.x, p.pos.z, step.target.x, step.target.z);
    return d <= (step.radius || 3) + 1.4;
  };

  Missions.prototype.wantsE = function () {
    if (this.game.state !== 'play') return false;
    if (this.active) return this._nearInteract();
    if (this.briefing) return false;
    return this._markerDistance() <= 4;
  };

  Missions.prototype.handleE = function () {
    if (this.game.state !== 'play') return false;
    if (this.active) {
      if (this._nearInteract()) {
        this._takeCase();
        return true;
      }
      return false;
    }
    if (this.cleared || this.index >= this.list.length) {
      if (this._markerDistance() <= 4) {
        this._toast('CITY CLEARED · ALL FIVE JOBS DONE', 'mission');
        return true;
      }
      return false;
    }
    if (this._markerDistance() <= 4) {
      this.start(this.index);
      return true;
    }
    return false;
  };

  Missions.prototype._takeCase = function () {
    var step = this._step();
    if (!step) return false;
    this._flags['interact:' + step.id] = true;
    this._clearCase();
    this._toast('CASE SECURED · HOLD THE PIER', 'mission');
    this._stepDelay = 0.3;
    return true;
  };

  /* ------------------------------------------------------------ combat hooks */

  Missions.prototype.notifyMelee = function (target) {
    if (!this.active || this._ending) return false;
    var step = this._step();
    if (!step || step.kind !== 'melee') return false;
    if (this._time - this._lastMeleeNotify < 0.35) return false;
    var player = this._player();
    if (!player || !player.pos) return false;

    var ped = null;
    if (target && target.isDebtor) ped = target;
    if (!ped) ped = this._nearestDebtor(2.9);
    if (!ped || !ped.alive || ped._subdued) return false;
    if (step.target) {
      var d = dist2(ped.pos.x, ped.pos.z, step.target.x, step.target.z);
      if (d > (step.radius || 4) + 2.5) return false;
    }
    this._lastMeleeNotify = this._time;
    ped.damage(20, player);
    var id = step.id;
    this.counts.melee[id] = (this.counts.melee[id] || 0) + 1;
    var need = step.count || 3;
    if (this.counts.melee[id] >= need) {
      ped._subdued = true;
      if (ped.alive && ped.flee) ped.flee(player);
      this._toast('DEBTOR SUBDUED · ' + need + ' HITS', 'mission');
      this._stepDelay = 0.3;
    } else {
      this._toast('INTIMIDATE · ' + this.counts.melee[id] + ' / ' + need, 'info');
    }
    return true;
  };

  Missions.prototype._nearestDebtor = function (range) {
    var player = this._player();
    if (!player || !player.pos) return null;
    var best = null;
    var bestD = range;
    var fx = Math.sin(player.yaw || 0);
    var fz = Math.cos(player.yaw || 0);
    for (var i = 0; i < this.actors.peds.length; i++) {
      var ped = this.actors.peds[i];
      if (!ped || !ped.alive || !ped.isDebtor || ped._subdued) continue;
      var dx = ped.pos.x - player.pos.x;
      var dz = ped.pos.z - player.pos.z;
      var d = Math.sqrt(dx * dx + dz * dz);
      if (d > bestD) continue;
      if (d > 0.25 && (dx / d) * fx + (dz / d) * fz < 0.05) continue;
      bestD = d;
      best = ped;
    }
    return best;
  };

  Missions.prototype.notifyKill = function (enemy) {
    if (!this.active || !enemy) return false;
    if (this.actors.enemies.indexOf(enemy) < 0) return false;
    var role = enemy._missionRole;
    if (role === 'boss' || enemy.faction === 'boss') {
      this.counts.boss++;
      this._toast('CROWE CAPTAIN DOWN', 'mission');
    } else {
      this.counts.guards++;
      this.counts.kills++;
    }
    if (this._stepDelay > 0.25) this._stepDelay = 0.25;
    return true;
  };

  Missions.prototype.isCopStunned = function (cop) {
    return !!(cop && cop.stunUntil && this._time < cop.stunUntil);
  };

  /* ------------------------------------------------------------ crew powers */

  Missions.prototype.useCrew = function (id) {
    var ability = this.abilities[id];
    if (!ability) return false;
    if (ability.remaining > 0) {
      this._toast(String(id).toUpperCase() + ' COOLING · ' + Math.ceil(ability.remaining) + ' S', 'info');
      return false;
    }
    var ok = this.notifyAbility(id);
    if (!ok) return false;
    ability.remaining = ability.cooldown;
    ability.ready = false;
    this._syncCrewHud(true);
    return true;
  };

  Missions.prototype.notifyAbility = function (id) {
    var player = this._player();
    var police = this._police();
    if (id === 'maya') {
      var hadRoadblock = !!(police && police.roadblock && police.roadblock.active);
      if (police && police.clearRoadblock) police.clearRoadblock(true, true);
      var before = police ? police.wanted : (player ? player.wanted || 0 : 0);
      if (police && police.setWanted && before > 0) police.setWanted(before - 1);
      if (this.active) this.counts.mayaDecoys++;
      if (this.active && this._step() && this._step().kind === 'ability') this._mayaForStep = true;
      this._toast(hadRoadblock
        ? 'MAYA DECOY · ROADBLOCK CLEARED · -1 STAR'
        : (before > 0 ? 'MAYA DECOY · -1 STAR' : 'MAYA · NO UNITS TO FOOL'), 'crew');
      return true;
    }
    if (id === 'dez') {
      if (!player || !player.vehicle) {
        this._toast('DEZ · NO VEHICLE TO REPAIR', 'info');
        return false;
      }
      if (player.vehicle.repair) player.vehicle.repair();
      this._toast('DEZ REPAIR · ' + (player.vehicle.def && player.vehicle.def.label ? player.vehicle.def.label : 'VEHICLE') + ' PATCHED', 'crew');
      return true;
    }
    if (id === 'rook') {
      if (!player || !police || !police.cops) {
        this._toast('ROOK · NO OFFICERS IN RANGE', 'info');
        return false;
      }
      var n = 0;
      for (var i = 0; i < police.cops.length; i++) {
        var cop = police.cops[i];
        if (!cop || !cop.alive || !cop.pos) continue;
        if (dist2(cop.pos.x, cop.pos.z, player.pos.x, player.pos.z) > 20) continue;
        cop.stunUntil = this._time + 6;
        cop.hostile = false;
        cop.shootTimer = Math.max(cop.shootTimer || 0, 2.5);
        n++;
      }
      if (!n) {
        this._toast('ROOK · NO OFFICERS IN RANGE', 'info');
        return false;
      }
      this._toast('ROOK BACKUP · ' + n + ' OFFICER' + (n === 1 ? '' : 'S') + ' STUNNED', 'crew');
      return true;
    }
    return false;
  };

  Missions.prototype._tickCrew = function (dt) {
    var changed = false;
    for (var id in this.abilities) {
      if (!Object.prototype.hasOwnProperty.call(this.abilities, id)) continue;
      var a = this.abilities[id];
      if (a.remaining > 0) {
        a.remaining = Math.max(0, a.remaining - dt);
        if (a.remaining <= 0) {
          a.remaining = 0;
          a.ready = true;
          changed = true;
        }
      }
    }
    this._crewHudAccum += dt;
    if (changed || this._crewHudAccum >= 0.25) {
      this._crewHudAccum = 0;
      this._syncCrewHud();
    }
  };

  Missions.prototype._syncCrewHud = function (force) {
    for (var id in this.abilities) {
      if (!Object.prototype.hasOwnProperty.call(this.abilities, id)) continue;
      var a = this.abilities[id];
      var chip = document.getElementById('crew-' + id);
      if (!chip) continue;
      var state = chip.querySelector('.crew-state');
      var cool = document.getElementById('crew-' + id + '-cool');
      var ready = a.remaining <= 0;
      if (state) state.textContent = ready ? 'READY' : Math.ceil(a.remaining) + 'S';
      chip.classList.toggle('ready', ready);
      chip.classList.toggle('cooling', !ready);
      if (cool) cool.style.width = ready ? '0%' : clamp(a.remaining / Math.max(1, a.cooldown) * 100, 0, 100) + '%';
    }
  };

  /* ------------------------------------------------------------- convoy core */

  Missions.prototype._triggerConvoyRoadblock = function () {
    if (this._roadblockTriggered) return;
    this._roadblockTriggered = true;
    var police = this._police();
    if (!police) return;
    if (police.setWanted) police.setWanted(3);
    police._rbCooldown = 0;
    police._rbDelay = 0;
    if (police._buildRoadblock && this.game.player) {
      try { police._buildRoadblock(this.game.player); } catch (e) { /* police still auto-builds */ }
    }
    this._toast('3-STAR RESPONSE · ROADBLOCK AHEAD', 'danger');
  };

  Missions.prototype._ensureRoadblock = function () {
    var police = this._police();
    if (!police || !this.game.player) return false;
    if (police.roadblock && police.roadblock.active) return true;
    if (police.setWanted && police.wanted < 3) police.setWanted(3);
    if (police._rbCooldown) police._rbCooldown = 0;
    if (police._rbDelay !== undefined) police._rbDelay = 0;
    if (police._buildRoadblock) {
      try { return !!police._buildRoadblock(this.game.player); } catch (e) { return false; }
    }
    return false;
  };

  /* ------------------------------------------------------------------ actors */

  Missions.prototype._updateActors = function (dt) {
    var player = this._player();
    var m = this.active;
    if (!m) return;

    /* staggered courtyard spawns */
    if (this._spawnQueue.length) {
      this._spawnTimer -= dt;
      if (this._spawnTimer <= 0) {
        this._spawnTimer = 0.36;
        var spot = this._spawnQueue.shift();
        var combat = this._combat();
        if (combat && combat.spawnEnemy) {
          var guard = combat.spawnEnemy({
            x: spot.x,
            z: spot.z,
            faction: 'guard',
            health: 90,
            weapon: 'pistol',
            hostile: true,
            seed: 'estate-guard-' + this.counts.guards + '-' + this.stepIndex
          });
          if (guard) {
            guard._missionRole = 'guard';
            this.actors.enemies.push(guard);
          }
        }
      }
    }

    /* first / second guard wave */
    if (this._wave && this._wave.active && !this._wave.spawned) {
      this._wave.timer -= dt;
      if (this._wave.timer <= 0) {
        var step = this._step();
        if (step && step.kind === 'survive') this._spawnWave(step);
        else this._wave.active = false;
      }
    }

    /* armored truck patrols the ring road until the player gets close */
    var truck = this.actors.truck;
    if (truck && !truck.destroyed && !truck.occupiedBy && !this._truckParked) {
      var near = player && player.pos ? dist2(player.pos.x, player.pos.z, truck.pos.x, truck.pos.z) : 999;
      if (near < 26) {
        this._truckParked = true;
        truck.speed = 0;
        truck.vx = 0;
        truck.vz = 0;
      } else {
        truck.aiUpdate(dt, { x: 400, z: -40 }, this.game.world);
        if (dist2(truck.pos.x, truck.pos.z, 400, -40) < 6) {
          this._truckParked = true;
          truck.speed = 0;
        }
      }
    }

    /* case prop sparkle */
    if (this.actors.caseProp) {
      this.actors.caseProp.rotation.y += dt * 1.4;
      if (this._caseRing) {
        var cp = 0.5 + 0.5 * Math.sin(this._time * 2.8);
        this._caseRing.scale.setScalar(1 + cp * 0.2);
        this._caseRing.material.opacity = 0.45 + cp * 0.4;
      }
    }

    /* retry a stubborn roadblock while Maya's step is live */
    if (this._step() && this._step().kind === 'ability' && !this._mayaForStep) {
      var police = this._police();
      if (!police || !police.roadblock || !police.roadblock.active) {
        this._roadblockRetry -= dt;
        if (this._roadblockRetry <= 0) {
          this._roadblockRetry = 2.2;
          this._ensureRoadblock();
        }
      }
    }

    /* failure checks that belong to a specific mission */
    if (m.id === 'valet-run') {
      var car = this.actors.valetCar;
      if (car && car.destroyed) {
        this.fail('The Serata was destroyed');
        return;
      }
      if (car && player && player.vehicle === car) car.missionLocked = false;
    }
    if (m.id === 'convoy') {
      if (this.actors.truck && this.actors.truck.destroyed) {
        this.fail('The truck was destroyed');
        return;
      }
    }
    if (player && player.dead) {
      this.fail((m.failReasons && m.failReasons[0]) || 'You went down');
    }
  };

  /* --------------------------------------------------------------- dialogue */

  Missions.prototype._say = function (speaker, text, key) {
    if (!text) return;
    var id = key || (String(speaker) + ':' + String(text));
    if (this._said[id]) return;
    this._said[id] = true;
    this.dialogueQueue.push({ speaker: String(speaker || 'DISPATCH').toUpperCase(), text: String(text) });
  };

  Missions.prototype._updateDialogue = function (dt) {
    var hud = this._hud();
    if (this._dialogueDisplay > 0) {
      this._dialogueDisplay -= dt;
      if (this._dialogueDisplay <= 0) this._hideDialogue();
      return;
    }
    if (!this.dialogueQueue.length) return;
    var line = this.dialogueQueue.shift();
    this._dialogueCurrent = line;
    this._dialogueDisplay = 5;
    if (hud && hud.dialogue) {
      try { hud.dialogue(line.speaker, line.text); } catch (e) { /* optional hud */ }
    }
    var panel = document.getElementById('dialogue');
    if (panel) {
      panel.hidden = false;
      var speakerEl = document.getElementById('dialogue-speaker');
      var textEl = document.getElementById('dialogue-text');
      if (speakerEl) speakerEl.textContent = line.speaker;
      if (textEl) textEl.textContent = line.text;
    }
  };

  Missions.prototype._hideDialogue = function () {
    this._dialogueDisplay = 0;
    this._dialogueCurrent = null;
    var hud = this._hud();
    if (hud && hud.hideDialogue) {
      try { hud.hideDialogue(); } catch (e) { /* optional hud */ }
    }
    var panel = document.getElementById('dialogue');
    if (panel) panel.hidden = true;
  };

  Missions.prototype._clearDialogue = function () {
    this.dialogueQueue.length = 0;
    this._dialogueDisplay = 0;
    this._dialogueCurrent = null;
    this._hideDialogue();
  };

  Missions.prototype._queueScheduledDialogue = function () {
    if (!this.active || !this.active.dialogue) return;
    var beats = this.active.dialogue;
    for (var i = 0; i < beats.length; i++) {
      if (this._shownDialogue[i]) continue;
      if (this.elapsed + 0.001 < (beats[i].at || 0)) continue;
      this._shownDialogue[i] = true;
      this._say(beats[i].speaker, beats[i].text, 'sched:' + this.active.id + ':' + i);
    }
  };

  /* ------------------------------------------------------------ step prompts */

  Missions.prototype._updatePrompt = function () {
    var text = '';
    if (this.active && this._nearInteract()) text = 'E — TAKE THE CASE';
    else if (!this.active && this._markerVisible() && this._markerDistance() <= 4) {
      text = this.cleared || this.index >= this.list.length ? 'E — CITY CLEARED' : 'E — START MISSION';
    }
    if (text) {
      this._promptText = text;
      this._prompt(text);
      return;
    }
    if (this._promptText) {
      this._promptText = '';
      this._prompt('');
    }
  };

  /* ------------------------------------------------------------ dispatch HUD */

  Missions.prototype._nearestUnitDistance = function () {
    var p = this._player();
    if (!p || !p.pos) return null;
    var police = this._police();
    if (!police) return null;
    var best = null;
    var i;
    for (i = 0; i < (police.units || []).length; i++) {
      var u = police.units[i];
      var d = dist2(p.pos.x, p.pos.z, u.pos.x, u.pos.z);
      if (best == null || d < best) best = d;
    }
    var rb = police.roadblock;
    if (rb && rb.active) {
      for (i = 0; i < (rb.units || []).length; i++) {
        var ru = rb.units[i];
        var rd = dist2(p.pos.x, p.pos.z, ru.pos.x, ru.pos.z);
        if (best == null || rd < best) best = rd;
      }
    }
    return best == null ? null : Math.round(best);
  };

  Missions.prototype._nearestEnemyPoint = function () {
    var best = null;
    var bestD = 1e9;
    var p = this._player();
    if (!p || !p.pos) return null;
    for (var i = 0; i < this.actors.enemies.length; i++) {
      var e = this.actors.enemies[i];
      if (!e || !e.alive) continue;
      var d = dist2(p.pos.x, p.pos.z, e.pos.x, e.pos.z);
      if (d < bestD) { bestD = d; best = e; }
    }
    return best ? { x: best.pos.x, z: best.pos.z } : null;
  };

  Missions.prototype._dispatchPoint = function (row) {
    if (!row) return null;
    if (row.target) {
      if (row.target === 'convoyRoadblock') {
        var police = this._police();
        if (police && police.roadblock && police.roadblock.active) {
          return { x: police.roadblock.x, z: police.roadblock.z };
        }
      }
      var direct = POINTS[row.target];
      if (direct) return direct;
    }
    var unit = String(row.unit || '').toUpperCase();
    if (unit.indexOf('HOTEL') >= 0) return point('oceanHotel', { x: -414, z: 180 });
    if (unit.indexOf('GUARD') >= 0) {
      var enemy = this._nearestEnemyPoint();
      if (enemy) return enemy;
    }
    if (unit.indexOf('ROOK') >= 0) return point('boatRamp', { x: -452, z: 372 });
    if (unit.indexOf('VALET') >= 0) return point('oceanHotel', { x: -414, z: 180 });
    if (unit.indexOf('VINNIE') >= 0) return null;
    if (unit.indexOf('DEZ') >= 0) return point('garage', { x: 150, z: -50 });
    if (unit.indexOf('SQUAD') >= 0 || row.heat != null) {
      var nearest = this._nearestUnitPoint();
      if (nearest) return nearest;
      return null;
    }
    var step = this._step();
    return step && step.target ? step.target : null;
  };

  Missions.prototype._nearestUnitPoint = function () {
    var police = this._police();
    var p = this._player();
    if (!police || !p || !p.pos) return null;
    var best = null;
    var bestD = 1e9;
    var i;
    var lists = [police.units || []];
    if (police.roadblock && police.roadblock.active) lists.push(police.roadblock.units || []);
    for (var l = 0; l < lists.length; l++) {
      for (i = 0; i < lists[l].length; i++) {
        var u = lists[l][i];
        var d = dist2(p.pos.x, p.pos.z, u.pos.x, u.pos.z);
        if (d < bestD) { bestD = d; best = u; }
      }
    }
    return best ? { x: best.pos.x, z: best.pos.z } : null;
  };

  Missions.prototype.dispatchRows = function () {
    var p = this._player();
    var rows = [];
    var m = this.active;
    var police = this._police();
    var wanted = police ? police.wanted : (p ? p.wanted || 0 : 0);
    var px = p && p.pos ? p.pos.x : 0;
    var pz = p && p.pos ? p.pos.z : 0;

    if (m && m.dispatch) {
      for (var i = 0; i < m.dispatch.length; i++) {
        var d = m.dispatch[i];
        var row = {
          unit: String(d.unit || 'UNIT').toUpperCase(),
          dist: null,
          distLabel: '—',
          status: String(d.status || '').toUpperCase(),
          kind: 'mission'
        };
        if (d.crew) {
          var a = this.abilities[d.crew] || { remaining: 0 };
          var ready = a.remaining <= 0;
          row.distLabel = ready ? 'READY' : Math.ceil(a.remaining) + ' S';
          row.status = String((CREW[d.crew] && CREW[d.crew].keyLabel) || 'X').toUpperCase();
          row.kind = 'crew';
          row.crew = d.crew;
        } else if (d.target) {
          var pt = this._dispatchPoint(d);
          if (pt) {
            var dd = Math.round(dist2(px, pz, pt.x, pt.z));
            row.dist = dd;
            row.distLabel = dd + ' M';
          }
          if (d.target === 'convoyRoadblock') {
            row.status = police && police.roadblock && police.roadblock.active ? 'SET' : 'STAGING';
          }
        } else if (d.heat != null) {
          var nd = this._nearestUnitDistance();
          row.dist = nd;
          row.distLabel = nd == null ? '—' : nd + ' M';
          if (wanted <= 0) row.status = 'CLEAR';
          else if (nd != null && nd < 80) row.status = 'PURSUING';
          else row.status = 'EN ROUTE';
        } else if (d.dist) {
          var dp = this._dispatchPoint(d);
          if (dp) {
            var live = Math.round(dist2(px, pz, dp.x, dp.z));
            row.dist = live;
            row.distLabel = live + ' M';
          }
        }
        rows.push(row);
      }
    }

    if (police && police.dispatchRows) {
      var merged = [];
      try { merged = police.dispatchRows(p, this) || []; } catch (e) { merged = []; }
      for (var j = 0; j < merged.length && rows.length < 5; j++) {
        var pr = merged[j];
        var unit = String(pr.unit || 'UNIT').toUpperCase();
        var duplicate = false;
        for (var k = 0; k < rows.length; k++) {
          if (rows[k].unit === unit) { duplicate = true; break; }
        }
        if (duplicate) continue;
        rows.push({
          unit: unit,
          dist: pr.dist == null ? null : pr.dist,
          distLabel: pr.distLabel || (pr.dist == null ? '—' : pr.dist + ' M'),
          status: String(pr.status || '').toUpperCase(),
          kind: pr.kind || 'police',
          heat: pr.heat
        });
      }
    }

    while (rows.length < 3) {
      rows.push({
        unit: rows.length === 0 ? 'DISPATCH' : rows.length === 1 ? 'CASE' : 'CREW',
        dist: null,
        distLabel: rows.length === 1 ? 'ACTIVE' : '—',
        status: rows.length === 0 ? 'ONLINE' : rows.length === 1 ? 'LIVE' : 'READY',
        kind: 'mission'
      });
    }
    return rows;
  };

  Missions.prototype._objectiveText = function () {
    if (!this.active) return '';
    if (this._ending) {
      if (this.failed) return 'MISSION FAILED · ' + (this.failReason || 'ABORTED');
      return 'JOB COMPLETE · RANK ' + (this.rank || 'A');
    }
    var step = this._step();
    return step ? step.text : 'MISSION COMPLETE';
  };

  Missions.prototype._syncMissionHud = function (force) {
    var hud = this._hud();
    var card = document.getElementById('mission-card');
    if (!this.active) {
      if (hud && hud.setMission) {
        try { hud.setMission(null); } catch (e) { /* optional hud */ }
      }
      if (card) card.hidden = true;
      this._hudSig = '';
      return;
    }
    var m = this.active;
    var objective = this._objectiveText();
    var timerLabel = this.timerTotal > 0 ? formatTime(this.timer) : '--:--';
    var rows = this.dispatchRows();
    var rowSig = '';
    for (var i = 0; i < rows.length; i++) {
      rowSig += rows[i].unit + '|' + rows[i].distLabel + '|' + rows[i].status + ';';
    }
    var sig = m.id + '|' + objective + '|' + timerLabel + '|' + rowSig;
    if (!force && sig === this._hudSig) return;
    this._hudSig = sig;

    var progress = (this.stepIndex / Math.max(1, (m.steps || []).length)) * 100;
    if (this._ending) progress = this.failed ? 0 : 100;

    if (hud && hud.setMission) {
      var payload = {
        mission: m,
        title: m.title,
        giver: m.giver,
        objective: objective,
        timer: timerLabel,
        timerSeconds: this.timer,
        progress: progress,
        rows: rows,
        heat: this._police() ? this._police().wanted : 0
      };
      try {
        if (hud.setMission.length >= 2) hud.setMission(m.title, objective, timerLabel, rows);
        else hud.setMission(payload);
      } catch (e) { /* fall through to direct DOM */ }
    }

    if (card) card.hidden = false;
    var titleEl = document.getElementById('mission-title');
    var giverEl = document.getElementById('mission-giver');
    var timerEl = document.getElementById('mission-timer');
    var objEl = document.getElementById('mission-objective');
    var fillEl = document.getElementById('mission-progress-fill');
    if (titleEl) titleEl.textContent = m.title;
    if (giverEl) giverEl.textContent = m.giver || 'DISPATCH';
    if (timerEl) timerEl.textContent = timerLabel;
    if (objEl) objEl.textContent = objective;
    if (fillEl) fillEl.style.width = clamp(progress, 0, 100) + '%';

    var tbody = document.getElementById('dispatch-rows');
    if (tbody) {
      tbody.innerHTML = '';
      for (var r = 0; r < rows.length; r++) {
        var tr = document.createElement('tr');
        var tdUnit = document.createElement('td');
        var tdDist = document.createElement('td');
        var tdStatus = document.createElement('td');
        tdUnit.textContent = rows[r].unit;
        tdDist.textContent = rows[r].distLabel;
        tdStatus.textContent = rows[r].status;
        if (rows[r].kind === 'crew') tdStatus.className = 'st-crew';
        else if (rows[r].kind === 'roadblock' || rows[r].status === 'SET') tdStatus.className = 'st-live';
        tr.appendChild(tdUnit);
        tr.appendChild(tdDist);
        tr.appendChild(tdStatus);
        tbody.appendChild(tr);
      }
    }
  };

  /* ----------------------------------------------------------------- update */

  Missions.prototype.update = function (dt) {
    dt = clamp(dt || 0, 0, 0.05);
    this._time += dt;
    var livePol = this._police();
    this.heat = livePol ? livePol.wanted : 0;
    this._tickCrew(dt);
    this._updateMarker(dt);
    this._updateCheckpoint(dt);

    if (!this.active) {
      this._updatePrompt();
      return;
    }

    if (this._ending) {
      this._updatePrompt();
      return;
    }

    this.elapsed += dt;
    if (this.timerTotal > 0) {
      this.timer = Math.max(0, this.timer - dt);
      if (this.timer <= 0) {
        this.fail('Time expired');
        return;
      }
    }

    this._queueScheduledDialogue();
    this._updateDialogue(dt);
    this._updateActors(dt);
    if (this._ending) return;
    this._evaluateStep(dt);
    if (this._ending) return;
    this._updatePrompt();

    this._hudAccum += dt;
    if (this._hudAccum >= 0.18) {
      this._hudAccum = 0;
      this._syncMissionHud(false);
    }
  };

  /* -------------------------------------------------------------- outcomes */

  Missions.prototype._rankFor = function (m, seconds) {
    var cuts = m.rankCuts || { s: 60, a: 90, b: 140 };
    if (seconds <= cuts.s) return 'S';
    if (seconds <= cuts.a) return 'A';
    if (seconds <= cuts.b) return 'B';
    return 'C';
  };

  Missions.prototype.complete = function () {
    if (!this.active || this._ending) return false;
    var m = this.active;
    this._ending = true;
    this._cleanupPending = true;
    var time = this.elapsed;
    var rank = this._rankFor(m, time);
    this.rank = rank;
    var bonus = RANK_BONUS[rank] || 0;
    var payout = (m.reward || 0) + bonus;
    var player = this._player();
    if (player && player.addMoney) player.addMoney(payout);

    this.completed[this.index] = true;
    var nextIndex = Math.min(this.list.length, this.index + 1);
    this.index = nextIndex;
    this.cleared = this.index >= this.list.length;

    var police = this._police();
    var heat = m.heatOnComplete != null ? m.heatOnComplete : 0;
    if (police && police.setWanted) police.setWanted(heat);

    this._clearDialogue();
    this._syncCheckpoint();
    this._syncMissionHud(true);

    var data = {
      title: m.title,
      mission: m,
      rank: rank,
      reward: payout,
      baseReward: m.reward || 0,
      bonus: bonus,
      time: formatTime(time),
      seconds: Math.round(time),
      heat: heat,
      message: rank === 'S'
        ? 'Clean work. The city barely noticed until it was over.'
        : rank === 'A'
          ? 'The job is done and the money is moving.'
          : rank === 'B'
            ? 'Paid, but the clock was not on your side.'
            : 'Paid. Bruised. Still breathing.'
    };
    this._toast('MISSION COMPLETE · ' + rank + ' · $' + formatMoney(payout), 'cash');
    if (this.game.audio && this.game.audio.missionSting) {
      try { this.game.audio.missionSting(true); } catch (e) { /* optional audio */ }
    }
    this._result(true, data);
    this._setScreen('result');
    if (this.game.save) {
      try { this.game.save(); } catch (e) { /* save is best effort */ }
    }
    return true;
  };

  Missions.prototype.fail = function (reason) {
    if (!this.active || this._ending) return false;
    this._ending = true;
    this._cleanupPending = true;
    this.failed = true;
    this.failReason = reason || 'MISSION FAILED';
    var m = this.active;
    var police = this._police();
    this._clearDialogue();
    this._syncMissionHud(true);

    var data = {
      title: m.title,
      mission: m,
      rank: 'F',
      reward: 0,
      time: formatTime(this.elapsed),
      heat: police ? police.wanted : 0,
      reason: this.failReason,
      retry: true,
      message: this.failReason
    };
    this._toast('MISSION FAILED · ' + this.failReason, 'danger');
    if (this.game.audio && this.game.audio.missionSting) {
      try { this.game.audio.missionSting(false); } catch (e) { /* optional audio */ }
    }
    this._result(false, data);
    this._setScreen('result');
    return true;
  };

  Missions.prototype.next = function () {
    this._cleanupPending = false;
    this._teardownMission();
    this.active = null;
    this.briefing = false;
    this._ending = false;
    this.timer = 0;
    this.stepIndex = 0;
    this.rank = null;
    this._clearDialogue();
    this._prompt('');
    this._promptText = '';
    this._syncMissionHud(true);
    this._syncCheckpoint();
    this._syncMarker();
    if (this.cleared) {
      this._toast('CITY CLEARED · COSTA SOL IS YOURS', 'mission');
    } else if (this.list[this.index]) {
      this._toast('NEW MARKER · ' + this.list[this.index].title, 'mission');
    }
    return true;
  };

  Missions.prototype.retry = function () {
    if (!this.active) return false;
    var i = this.index;
    this._teardownMission();
    this.active = null;
    this._ending = false;
    this.failed = false;
    this.failReason = '';
    this._syncMissionHud(true);
    return this._launch(i);
  };

  Missions.prototype.abort = function () {
    if (!this.active && !this.briefing) return false;
    this._teardownMission();
    this.active = null;
    this.briefing = false;
    this._briefingMission = null;
    this._ending = false;
    this.failed = false;
    this.rank = null;
    this.timer = 0;
    this.stepIndex = 0;
    this._clearDialogue();
    this._prompt('');
    this._promptText = '';
    var police = this._police();
    if (police) {
      if (police.clearRoadblock) police.clearRoadblock(false, true);
      if (police.setWanted) police.setWanted(0);
    }
    this._syncMissionHud(true);
    this._syncCheckpoint();
    this._syncMarker();
    if (this.game.state !== 'play') {
      this.game.state = 'play';
      this._setScreen('hud');
    }
    return true;
  };

  Missions.prototype.reset = function (keepIndex) {
    this._teardownMission();
    this.active = null;
    this.briefing = false;
    this._briefingMission = null;
    this._ending = false;
    this.failed = false;
    this.rank = null;
    this.timer = 0;
    this.timerTotal = 0;
    this.stepIndex = 0;
    if (!keepIndex) this.index = 0;
    this.cleared = false;
    for (var i = 0; i < this.completed.length; i++) this.completed[i] = false;
    for (var id in this.abilities) {
      if (!Object.prototype.hasOwnProperty.call(this.abilities, id)) continue;
      this.abilities[id].remaining = 0;
      this.abilities[id].ready = true;
    }
    this._clearDialogue();
    this._prompt('');
    this._promptText = '';
    this._syncMissionHud(true);
    this._syncCheckpoint();
    this._syncMarker();
    this._syncCrewHud(true);
    return true;
  };

  /* --------------------------------------------------------------- teardown */

  Missions.prototype._teardownMission = function () {
    var player = this._player();
    var i;

    for (i = 0; i < this.actors.cars.length; i++) {
      var car = this.actors.cars[i];
      if (!car) continue;
      if (player && player.vehicle === car && player.exit) {
        try { player.exit(); } catch (e) { /* player may already be out */ }
      }
      if (this.game.demoVehicles) {
        var at = this.game.demoVehicles.indexOf(car);
        if (at >= 0) this.game.demoVehicles.splice(at, 1);
      }
      if (this.game._vehiclePool) {
        var at2 = this.game._vehiclePool.indexOf(car);
        if (at2 >= 0) this.game._vehiclePool.splice(at2, 1);
      }
      if (car.dispose) car.dispose();
    }
    this.actors.cars.length = 0;

    for (i = 0; i < this.actors.peds.length; i++) {
      var ped = this.actors.peds[i];
      if (ped && ped.dispose) ped.dispose();
    }
    this.actors.peds.length = 0;

    var combat = this._combat();
    if (combat) {
      for (i = 0; i < this.actors.enemies.length; i++) {
        var enemy = this.actors.enemies[i];
        if (!enemy) continue;
        if (combat.enemies) {
          var idx = combat.enemies.indexOf(enemy);
          if (idx >= 0 && combat._removeEnemy) {
            try { combat._removeEnemy(idx); } catch (e) { /* removed later */ }
          } else if (enemy.dispose) {
            enemy.dispose();
          }
        } else if (enemy.dispose) {
          enemy.dispose();
        }
      }
    }
    this.actors.enemies.length = 0;
    this.actors.boss = null;
    this.actors.valetCar = null;
    this.actors.truck = null;
    this._wave = null;
    this._spawnQueue.length = 0;
    this._clearCase();
    if (this.checkpoint) this.checkpoint.visible = false;
    return true;
  };

  /* ---------------------------------------------------------- save / load */

  Missions.prototype.saveState = function () {
    return {
      index: this.index,
      completed: this.completed.slice(),
      cleared: !!this.cleared,
      rank: this.rank || null
    };
  };

  Missions.prototype.loadState = function (data) {
    if (!data || typeof data !== 'object') return false;
    var index = Number(data.index);
    if (isFinite(index)) this.index = clamp(Math.round(index), 0, this.list.length);
    if (Object.prototype.toString.call(data.completed) === '[object Array]') {
      for (var i = 0; i < this.completed.length; i++) this.completed[i] = !!data.completed[i];
    }
    this.cleared = !!data.cleared || this.index >= this.list.length;
    if (typeof data.rank === 'string') this.rank = data.rank;
    this._syncMarker();
    this._syncMissionHud(true);
    return true;
  };

  LH.Missions = Missions;
}());
