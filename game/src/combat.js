/* LEONIDA HEAT 3D — combat: weapons, hitscan, enemies, particles and tracers.
   Classic script. The module owns the player's gunplay and the enemy guards used
   by missions, while police officers borrow the tracer / damage helpers. */
(function () {
  'use strict';

  window.LH = window.LH || {};

  var CFG = window.LH.CONFIG || {};
  var WCFG = CFG.WEAPONS || {};
  var QCFG = CFG.QUALITY || {};
  var UP = new THREE.Vector3(0, 1, 0);

  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  function dist2(ax, az, bx, bz) {
    var dx = ax - bx;
    var dz = az - bz;
    return Math.sqrt(dx * dx + dz * dz);
  }

  function weaponOrder() {
    var order = [];
    for (var id in WCFG) {
      if (Object.prototype.hasOwnProperty.call(WCFG, id)) order.push(id);
    }
    order.sort(function (a, b) {
      return (WCFG[a].slot || 0) - (WCFG[b].slot || 0);
    });
    return order;
  }

  function Combat(scene, camera, player, audio) {
    this.scene = scene || null;
    this.camera = camera || null;
    this.player = player || null;
    this.audio = audio || null;
    this.game = null;
    this.world = player && player.world ? player.world : null;

    this.currentWeapon = player && player.currentWeapon ? player.currentWeapon : 'pistol';
    this.enemies = [];
    this.hitMeshes = [];
    this.time = 0;
    this.nextFire = 0;
    this.reloadTimer = 0;
    this.recoil = 0;
    this.combo = 0;
    this.lastMelee = -10;
    this.shotsFired = 0;

    this._prevSpace = false;
    this._hudSig = '';
    this._partCursor = 0;
    this._tracerCursor = 0;
    this._casingCursor = 0;
    this._flashLife = 0;

    this._raycaster = new THREE.Raycaster();
    this._ray = new THREE.Ray();
    this._box = new THREE.Box3();
    this._camOrigin = new THREE.Vector3();
    this._camDir = new THREE.Vector3(0, 0, -1);
    this._dir = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._up = new THREE.Vector3();
    this._muzzle = new THREE.Vector3();
    this._end = new THREE.Vector3();
    this._tmp = new THREE.Vector3();
    this._tmpB = new THREE.Vector3();
    this._tmpWall = new THREE.Vector3();
    this._color = new THREE.Color();
    this._vehicleMeshes = [];
    this._hitMat = new THREE.MeshBasicMaterial({ visible: false });
    this._sphereGeo = new THREE.SphereGeometry(1, 8, 6);

    this._initParticles();
    this._initTracers();
    this._initCasings();
    this._initFlash();
  }

  /* -------------------------------------------------------------- pools ---- */

  Combat.prototype._initParticles = function () {
    var cap = clamp(QCFG.particleCap || 300, 60, 600);
    this.particleCap = cap;
    this._pPos = new Float32Array(cap * 3);
    this._pCol = new Float32Array(cap * 3);
    this._pVel = new Float32Array(cap * 3);
    this._pBase = new Float32Array(cap * 3);
    this._pLife = new Float32Array(cap);
    this._pMax = new Float32Array(cap);
    this._pGrav = new Float32Array(cap);
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this._pPos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this._pCol, 3));
    geo.setDrawRange(0, cap);
    var mat = new THREE.PointsMaterial({
      size: 0.135,
      vertexColors: true,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      sizeAttenuation: true
    });
    this.particles = new THREE.Points(geo, mat);
    this.particles.frustumCulled = false;
    this.particles.renderOrder = 3;
    this._pGeo = geo;
    if (this.scene) this.scene.add(this.particles);
  };

  Combat.prototype._initTracers = function () {
    this._tracers = [];
    for (var i = 0; i < 16; i++) {
      var geo = new THREE.BufferGeometry();
      var pos = new Float32Array(6);
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setDrawRange(0, 2);
      var mat = new THREE.LineBasicMaterial({
        color: 0xffd27a,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false
      });
      var line = new THREE.Line(geo, mat);
      line.frustumCulled = false;
      line.visible = false;
      line.renderOrder = 3;
      if (this.scene) this.scene.add(line);
      this._tracers.push({ line: line, mat: mat, life: 0, max: 0.085, pos: pos });
    }
  };

  Combat.prototype._initCasings = function () {
    this._casings = [];
    var geo = new THREE.BoxGeometry(0.034, 0.034, 0.058);
    var mat = new THREE.MeshBasicMaterial({ color: 0xd8b062, toneMapped: false });
    for (var i = 0; i < 10; i++) {
      var mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      mesh.frustumCulled = false;
      if (this.scene) this.scene.add(mesh);
      this._casings.push({ mesh: mesh, vx: 0, vy: 0, vz: 0, life: 0, max: 1, spin: 0 });
    }
  };

  Combat.prototype._flashTexture = function () {
    if (this._flashTex) return this._flashTex;
    var canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    var g = canvas.getContext('2d');
    var grad = g.createRadialGradient(32, 32, 2, 32, 32, 31);
    grad.addColorStop(0, 'rgba(255,248,210,1)');
    grad.addColorStop(0.32, 'rgba(255,196,88,0.9)');
    grad.addColorStop(0.68, 'rgba(255,120,40,0.32)');
    grad.addColorStop(1, 'rgba(255,80,20,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    var tex = new THREE.CanvasTexture(canvas);
    if (THREE.sRGBEncoding) tex.encoding = THREE.sRGBEncoding;
    this._flashTex = tex;
    return tex;
  };

  Combat.prototype._initFlash = function () {
    this._flashLight = new THREE.PointLight(0xffc46a, 0, 9, 2);
    this._flashLight.castShadow = false;
    if (this.scene) this.scene.add(this._flashLight);
    var mat = new THREE.SpriteMaterial({
      map: this._flashTexture(),
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false
    });
    this._flashSprite = new THREE.Sprite(mat);
    this._flashSprite.scale.setScalar(0.62);
    this._flashSprite.visible = false;
    if (this.scene) this.scene.add(this._flashSprite);
    this._flashMat = mat;
  };

  /* --------------------------------------------------------- public hooks --- */

  Combat.prototype.attach = function (game) {
    this.game = game || null;
    if (game) {
      if (game.player) this.player = game.player;
      if (game.audio) this.audio = game.audio;
      this.world = game.world || (this.player && this.player.world) || this.world;
    }
    if (this.player && this.player.currentWeapon) this.currentWeapon = this.player.currentWeapon;
    return this;
  };

  Combat.prototype.definition = function () {
    return WCFG[this.currentWeapon] || WCFG.pistol || {
      id: 'pistol', slot: 2, name: 'PISTOL', kind: 'pistol', damage: 24, fireRate: 4.2,
      spread: 0.012, range: 55, mag: 12, reserve: 96, pellets: 1, auto: false,
      recoil: 0.055, shake: 0.28
    };
  };

  Combat.prototype.tracer = function (from, to, color) {
    if (!from || !to || !this._tracers) return;
    var slot = this._tracers[this._tracerCursor];
    this._tracerCursor = (this._tracerCursor + 1) % this._tracers.length;
    slot.pos[0] = from.x;
    slot.pos[1] = from.y;
    slot.pos[2] = from.z;
    slot.pos[3] = to.x;
    slot.pos[4] = to.y;
    slot.pos[5] = to.z;
    slot.line.geometry.attributes.position.needsUpdate = true;
    slot.mat.color.set(color || 0xffd27a);
    slot.mat.opacity = 0.9;
    slot.line.visible = true;
    slot.life = slot.max;
  };

  Combat.prototype.damagePlayer = function (n, kind) {
    var p = this.player;
    if (!p || p.dead) return 0;
    var amount = p.damage ? p.damage(n, kind || 'gunfire') : 0;
    if (this.game && this.game.cameraController && this.game.cameraController.shake) {
      this.game.cameraController.shake(0.11);
    }
    if (this.audio) this.audio.impact(0.45);
    return amount;
  };

  /* -------------------------------------------------------------- shooting -- */

  Combat.prototype._makeMuzzle = function () {
    var p = this.player;
    if (!p) return this._muzzle.set(0, 1.4, 0);
    var cam = this.camera;
    var fx;
    var fz;
    var yaw = this.game && this.game.cameraController
      ? this.game.cameraController.yaw
      : (p.yaw || 0);
    if (cam) {
      this._camDir.set(0, 0, -1).applyQuaternion(cam.quaternion);
      if (this.game && this.game.cameraController) {
        fx = Math.sin(yaw);
        fz = Math.cos(yaw);
      } else {
        fx = this._camDir.x;
        fz = this._camDir.z;
      }
    } else {
      fx = Math.sin(yaw);
      fz = Math.cos(yaw);
    }
    var len = Math.sqrt(fx * fx + fz * fz) || 1;
    fx /= len;
    fz /= len;
    var rx = fz;
    var rz = -fx;
    this._muzzle.set(
      p.pos.x + fx * 0.58 + rx * 0.20,
      p.pos.y + 1.36,
      p.pos.z + fz * 0.58 + rz * 0.20
    );
    return this._muzzle;
  };

  Combat.prototype._flashAt = function (pos) {
    this._flashLife = 0.04;
    this._flashLight.position.copy(pos);
    this._flashLight.intensity = 5.5;
    this._flashSprite.position.copy(pos);
    this._flashSprite.material.opacity = 0.95;
    this._flashSprite.visible = true;
    this._flashSprite.scale.setScalar(0.55 + Math.random() * 0.18);
    this._flashSprite.material.rotation = Math.random() * Math.PI;
  };

  Combat.prototype._ejectCasing = function () {
    var slot = this._casings[this._casingCursor];
    this._casingCursor = (this._casingCursor + 1) % this._casings.length;
    var p = this.player;
    var f = this._makeMuzzle();
    slot.mesh.position.set(f.x, f.y, f.z);
    slot.vx = (Math.random() - 0.5) * 1.6;
    slot.vy = 1.8 + Math.random() * 1.1;
    slot.vz = (Math.random() - 0.5) * 1.6;
    slot.life = 1.1;
    slot.max = 1.1;
    slot.spin = Math.random() * 12;
    slot.mesh.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    slot.mesh.scale.setScalar(1);
    slot.mesh.visible = true;
  };

  Combat.prototype.fire = function () {
    var p = this.player;
    if (!p || p.dead) return false;
    var def = this.definition();
    if (def.kind === 'melee') return this.melee();
    if (this.reloadTimer > 0) return false;
    if (this.time < this.nextFire) return false;
    var w = p.weapons && p.weapons[this.currentWeapon];
    if (!w || !w.owned) return false;
    if ((w.ammo || 0) <= 0) {
      if (this.audio) this.audio.ui('deny');
      this.reload();
      return false;
    }

    w.ammo -= 1;
    this.nextFire = this.time + 1 / Math.max(0.2, def.fireRate || 4);
    this.recoil = Math.min(1.6, this.recoil + (def.recoil || 0.05) * 2.1);
    this.shotsFired++;

    var muzzle = this._makeMuzzle().clone();
    var pellets = Math.max(1, def.pellets || 1);
    for (var i = 0; i < pellets; i++) this._tracePellet(def, muzzle);

    this._flashAt(muzzle);
    if (def.kind !== 'shotgun') this._ejectCasing();
    if (this.audio) this.audio.shot(def.kind);
    if (this.game && this.game.cameraController && this.game.cameraController.shake) {
      this.game.cameraController.shake(def.shake || 0.25);
    }
    if (p.triggerShoot) p.triggerShoot();
    this._syncHud();
    return true;
  };

  Combat.prototype._tracePellet = function (def, muzzle) {
    var cam = this.camera;
    var p = this.player;
    if (!cam || !p) return;
    this._camOrigin.setFromMatrixPosition(cam.matrixWorld);
    this._camDir.set(0, 0, -1).applyQuaternion(cam.quaternion).normalize();

    this._right.crossVectors(this._camDir, UP);
    if (this._right.lengthSq() < 0.0001) this._right.set(1, 0, 0);
    this._right.normalize();
    this._up.crossVectors(this._right, this._camDir).normalize();

    var spread = (def.spread || 0) + this.recoil * 0.008;
    var rx = (Math.random() * 2 - 1) * spread;
    var ry = (Math.random() * 2 - 1) * spread;
    this._dir.copy(this._camDir)
      .addScaledVector(this._right, rx)
      .addScaledVector(this._up, ry)
      .normalize();

    var range = def.range || 50;
    this._refreshVehicles();

    /* The camera orbits low and looks through the player with an 18 m
       look-ahead, so its raw centre ray dives into the pavement. Keep the
       camera's heading as the aim bearing and flatten its vertical component
       into a believable shoulder-fired trajectory from the gun. */
    var aimYaw = this.game && this.game.cameraController
      ? this.game.cameraController.yaw
      : Math.atan2(this._camDir.x, this._camDir.z);
    var hx = Math.sin(aimYaw);
    var hz = Math.cos(aimYaw);
    var hl = Math.sqrt(hx * hx + hz * hz) || 1;
    var vy = clamp(this._camDir.y * 1.2, -1.4, 1.4);
    this._dir.set((hx / hl) * 30 + this._right.x * rx * 30 + this._up.x * ry * 30,
      vy + this._up.y * ry * 30,
      (hz / hl) * 30 + this._right.z * rx * 30 + this._up.z * ry * 30).normalize();

    this._raycaster.set(muzzle, this._dir);
    this._raycaster.near = 0;
    this._raycaster.far = range;
    var enemyHits = this._raycaster.intersectObjects(this.hitMeshes, false);
    var vehicleHits = this._raycaster.intersectObjects(this._vehicleMeshes, true);
    var wallDist = this._wallDistance(muzzle, this._dir, range);

    var enemyHit = enemyHits.length ? enemyHits[0] : null;
    var vehicleHit = vehicleHits.length ? vehicleHits[0] : null;
    var vehicle = null;
    if (vehicleHit) vehicle = this._vehicleOf(vehicleHit.object);
    if (vehicle && p.vehicle === vehicle) {
      vehicleHit = null;
      vehicle = null;
    }
    var enemyDist = enemyHit ? enemyHit.distance : Infinity;
    var vehicleDist = vehicleHit ? vehicleHit.distance : Infinity;

    if (enemyHit && enemyDist <= wallDist && enemyDist <= range) {
      var enemy = enemyHit.object.userData.enemy;
      var head = !!enemyHit.object.userData.head;
      this._end.copy(enemyHit.point);
      if (enemy && enemy.alive) {
        var falloff = 1 - 0.42 * clamp(enemyDist / range, 0, 1);
        var dmg = (def.damage || 20) * falloff;
        if (head) dmg *= 2.2;
        enemy.damage(dmg, p);
        this._spark(this._end, head ? '#ffd27a' : '#ff6f61', head ? 8 : 5, 3.4, 0.4, -7);
        if (this.audio) this.audio.impact(head ? 0.55 : 0.35);
      }
      this.tracer(muzzle, this._end, this._tracerColor(def));
      return;
    }

    if (vehicleHit && vehicleDist <= wallDist && vehicleDist <= range) {
      this._end.copy(vehicleHit.point);
      if (vehicle && vehicle.damage) vehicle.damage((def.damage || 20) * 0.9);
      this._spark(this._end, '#ffb347', 5, 2.6, 0.35, -6);
      if (this.audio) this.audio.impact(0.2);
      this.tracer(muzzle, this._end, this._tracerColor(def));
      return;
    }

    if (wallDist < range) {
      this._end.copy(muzzle).addScaledVector(this._dir, wallDist);
      this._spark(this._end, '#c9c2ae', 4, 1.8, 0.45, -3);
      if (this.audio) this.audio.impact(0.18);
      this.tracer(muzzle, this._end, this._tracerColor(def));
      return;
    }

    this._end.copy(muzzle).addScaledVector(this._dir, range);
    if (this._dir.y < -0.01) {
      var tg = (muzzle.y - 0.03) / -this._dir.y;
      if (tg > 0 && tg < range) {
        this._end.copy(muzzle).addScaledVector(this._dir, tg);
        this._spark(this._end, '#c9c2ae', 3, 1.4, 0.35, -3);
      }
    }
    this.tracer(muzzle, this._end, this._tracerColor(def));
  };

  Combat.prototype._tracerColor = function (def) {
    if (def.kind === 'rifle') return 0xffe7a8;
    if (def.kind === 'smg') return 0xffc46a;
    if (def.kind === 'shotgun') return 0xffb070;
    return 0xffd27a;
  };

  Combat.prototype._wallDistance = function (origin, dir, maxDist) {
    var buildings = this.world && this.world.buildings;
    if (!buildings || !buildings.length) return Infinity;
    this._ray.origin.copy(origin);
    this._ray.direction.copy(dir);
    var best = Infinity;
    for (var i = 0; i < buildings.length; i++) {
      var b = buildings[i];
      if (!b) continue;
      if (b.minX > origin.x + maxDist && b.minZ > origin.z + maxDist) continue;
      this._box.min.set(b.minX, 0, b.minZ);
      this._box.max.set(b.maxX, b.h || 12, b.maxZ);
      var hit = this._ray.intersectBox(this._box, this._tmpWall);
      if (!hit) continue;
      var d = origin.distanceTo(hit);
      if (d > 0.02 && d < best && d < maxDist) best = d;
    }
    return best;
  };

  Combat.prototype._refreshVehicles = function () {
    var list = this._vehicleMeshes;
    list.length = 0;
    var sources = [];
    if (this.game) {
      if (this.game.traffic && this.game.traffic.cars) sources.push(this.game.traffic.cars);
      if (this.game.police && this.game.police.units) sources.push(this.game.police.units);
      if (this.game.demoVehicles) sources.push(this.game.demoVehicles);
    }
    if (this.player && this.player.vehicles) sources.push(this.player.vehicles);
    for (var s = 0; s < sources.length; s++) {
      var cars = sources[s];
      for (var i = 0; i < cars.length; i++) {
        var v = cars[i];
        if (!v || !v.mesh || v.destroyed) continue;
        v.mesh.userData.vehicle = v;
        if (list.indexOf(v.mesh) < 0) list.push(v.mesh);
      }
    }
  };

  Combat.prototype._vehicleOf = function (obj) {
    var node = obj;
    for (var i = 0; i < 6 && node; i++) {
      if (node.userData && node.userData.vehicle) return node.userData.vehicle;
      node = node.parent;
    }
    return null;
  };

  /* --------------------------------------------------------------- melee ---- */

  Combat.prototype.melee = function () {
    var p = this.player;
    if (!p || p.dead) return { hit: false, combo: 0 };
    var def = WCFG.fists || { damage: 18, fireRate: 1.7, range: 1.9, shake: 0.12 };
    if (this.time < this.nextFire) return { hit: false, combo: this.combo };
    var window = (CFG.PLAYER && CFG.PLAYER.meleeComboWindow) || 0.9;
    if (this.time - this.lastMelee <= window) this.combo = this.combo % 3 + 1;
    else this.combo = 1;
    this.lastMelee = this.time;
    this.nextFire = this.time + 1 / Math.max(0.4, def.fireRate || 1.7);

    var finisher = this.combo === 3;
    var damage = (def.damage || 18) * (finisher ? 1.85 : 1);
    var range = (def.range || 1.9) + 0.55;
    var fx = Math.sin(p.yaw || 0);
    var fz = Math.cos(p.yaw || 0);
    var best = null;
    var bestD = range;
    for (var i = 0; i < this.enemies.length; i++) {
      var e = this.enemies[i];
      if (!e || !e.alive) continue;
      var dx = e.pos.x - p.pos.x;
      var dz = e.pos.z - p.pos.z;
      var d = Math.sqrt(dx * dx + dz * dz);
      if (d > range) continue;
      if (d > 0.2 && (dx / d) * fx + (dz / d) * fz < 0.15) continue;
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    if (best) {
      best.damage(damage, p);
      var kx = best.pos.x - p.pos.x;
      var kz = best.pos.z - p.pos.z;
      var kl = Math.sqrt(kx * kx + kz * kz) || 1;
      var push = finisher ? 0.65 : 0.24;
      best.pos.x += (kx / kl) * push;
      best.pos.z += (kz / kl) * push;
      this._spark(this._tmp.set(best.pos.x, best.pos.y + 1.2, best.pos.z), '#ffe1b0', finisher ? 9 : 4, 2.4, 0.3, -5);
      if (this.audio) this.audio.impact(finisher ? 0.6 : 0.25);
    }
    if (this.audio) this.audio.shot('melee');
    if (this.game && this.game.cameraController && this.game.cameraController.shake) {
      this.game.cameraController.shake(finisher ? 0.4 : 0.14);
    }
    if (p.triggerShoot) p.triggerShoot();
    this._syncHud();
    return { hit: !!best, combo: this.combo, finisher: finisher };
  };

  /* -------------------------------------------------------------- enemies --- */

  Combat.prototype._addHitSpheres = function (ped) {
    var scale = ped._scale || 1;
    var meshes = [];
    var chest = new THREE.Mesh(this._sphereGeo, this._hitMat);
    chest.position.y = 1.12 * scale;
    chest.scale.setScalar(0.46 * scale);
    chest.userData.enemy = ped;
    chest.userData.head = false;
    ped.mesh.add(chest);
    meshes.push(chest);
    var head = new THREE.Mesh(this._sphereGeo, this._hitMat);
    head.position.y = 1.61 * scale;
    head.scale.setScalar(0.245 * scale);
    head.userData.enemy = ped;
    head.userData.head = true;
    ped.mesh.add(head);
    meshes.push(head);
    ped._hitMeshes = meshes;
    this.hitMeshes.push(chest, head);
  };

  Combat.prototype._styleHealthBar = function (ped) {
    if (!ped || !ped._ensureBar) return;
    ped._ensureBar();
    var boss = ped.faction === 'boss';
    ped._updateBar = function () {
      if (!this._barFill) return;
      var ratio = clamp(this.health / Math.max(1, this.maxHealth), 0, 1);
      this._barFill.scale.x = 1.04 * ratio;
      this._barFill.position.x = -0.52 + 0.52 * ratio;
      if (boss) this._barFill.material.color.set(ratio > 0.35 ? 0xf3c969 : 0xff8d3a);
      else this._barFill.material.color.set(ratio > 0.55 ? 0xff4d55 : ratio > 0.25 ? 0xff6b3a : 0xb52121);
    };
    ped._barFill.material.color.set(boss ? 0xf3c969 : 0xff4d55);
    if (boss) {
      ped._bar.visible = true;
      ped.healthShow = 9999;
    }
  };

  Combat.prototype.spawnEnemy = function (opts) {
    opts = opts || {};
    if (!window.LH || !window.LH.Ped) return null;
    var self = this;
    var faction = opts.boss ? 'boss' : (opts.faction || 'guard');
    var x = opts.x == null ? 0 : opts.x;
    var z = opts.z == null ? 0 : opts.z;
    var ped = new window.LH.Ped(this.scene, this.world, {
      x: x,
      z: z,
      yaw: opts.yaw == null ? Math.random() * Math.PI * 2 : opts.yaw,
      faction: faction,
      weapon: opts.weapon || (faction === 'boss' ? 'smg' : 'pistol'),
      seed: opts.seed == null ? 'guard-' + this.time + '-' + this.enemies.length : opts.seed,
      healthBar: true
    });
    if (!ped) return null;
    var baseHealth = opts.health || (faction === 'boss' ? 260 : faction === 'cop' ? 100 : 85);
    ped.health = baseHealth;
    ped.maxHealth = baseHealth;
    ped.hostile = !!opts.hostile;
    ped.home = { x: x, z: z };
    ped.guardPost = opts.guardPost || null;
    ped._combatShotCd = 0.4 + Math.random() * 0.5;
    ped._flankDir = Math.random() < 0.5 ? -1 : 1;
    ped._flankTimer = 0;
    ped._aiState = 'idle';
    ped.onShoot = function (enemy, target) { self._enemyShoot(enemy, target); };
    ped.onDeath = function (enemy, from) { self._enemyDeath(enemy, from); };
    this._addHitSpheres(ped);
    this._styleHealthBar(ped);
    this.enemies.push(ped);
    return ped;
  };

  Combat.prototype.spawnWave = function (n, center, opts) {
    opts = opts || {};
    var count = clamp(Math.round(n || 3), 1, 10);
    var cx = center && center.x != null ? center.x : (this.player ? this.player.pos.x : 0);
    var cz = center && center.z != null ? center.z : (this.player ? this.player.pos.z : 0);
    var radius = opts.radius == null ? 12 : opts.radius;
    var out = [];
    for (var i = 0; i < count; i++) {
      var a = (i / count) * Math.PI * 2 + Math.random() * 0.35;
      var r = radius * (0.72 + Math.random() * 0.4);
      var x = cx + Math.sin(a) * r;
      var z = cz + Math.cos(a) * r;
      if (this.world && this.world.collideCircle) {
        var res = this.world.collideCircle(x, z, 0.55);
        x = res.x;
        z = res.z;
      }
      var enemy = this.spawnEnemy({
        x: x,
        z: z,
        faction: opts.faction || 'guard',
        health: opts.health,
        weapon: opts.weapon,
        boss: !!opts.boss,
        guardPost: opts.guardPost,
        hostile: opts.hostile !== false,
        seed: 'wave-' + Math.floor(this.time * 100) + '-' + i
      });
      if (enemy) out.push(enemy);
    }
    return out;
  };

  Combat.prototype.debugSpawnGuards = function (count) {
    if (!this.player) return [];
    var dirX = Math.sin(this.player.yaw || 0);
    var dirZ = Math.cos(this.player.yaw || 0);
    if (this.camera) {
      this._camDir.set(0, 0, -1).applyQuaternion(this.camera.quaternion);
      var len = Math.sqrt(this._camDir.x * this._camDir.x + this._camDir.z * this._camDir.z) || 1;
      dirX = this._camDir.x / len;
      dirZ = this._camDir.z / len;
    }
    var center = { x: this.player.pos.x + dirX * 14, z: this.player.pos.z + dirZ * 14 };
    return this.spawnWave(count || 3, center, {
      faction: 'guard',
      health: 90,
      weapon: 'pistol',
      hostile: true,
      radius: 5
    });
  };

  Combat.prototype._enemyShoot = function (ped, target) {
    if (!ped || !ped.alive || !target || !target.pos || target.dead) return;
    if (ped._combatShotCd > 0) return;
    ped._combatShotCd = (ped.faction === 'boss' ? 0.52 : 0.9) + Math.random() * 0.55;
    var from = this._tmp.set(ped.pos.x, ped.pos.y + 1.42, ped.pos.z);
    var to = this._tmpB.set(target.pos.x, target.pos.y + 1.12, target.pos.z);
    var dx = to.x - from.x;
    var dz = to.z - from.z;
    var d = Math.sqrt(dx * dx + dz * dz);
    if (d > 42 || d < 0.3) return;
    var dir = this._dir.set(dx / d, (to.y - from.y) / d, dz / d);
    var wall = this._wallDistance(from, dir, d);
    if (wall < d - 0.7) return;
    this.tracer(from, to, ped.faction === 'boss' ? 0xffd27a : 0xff8a6a);
    this._spark(from, '#ffd27a', 2, 1.2, 0.16, 0);
    var base = ped.faction === 'boss' ? 8 : 5;
    var dmg = (base + Math.random() * 4) * (d > 20 ? 0.62 : 1);
    this.damagePlayer(dmg, ped.faction === 'boss' ? 'boss' : 'guard');
    if (this.audio) this.audio.shot(ped.faction === 'boss' ? 'smg' : 'pistol');
    if (target.vehicle) target.vehicle.damage(dmg * 0.45);
  };

  Combat.prototype._enemyDeath = function (ped) {
    if (!ped || ped._deathHandled) return;
    ped._deathHandled = true;
    if (ped._hitMeshes) {
      for (var h = 0; h < ped._hitMeshes.length; h++) {
        var mesh = ped._hitMeshes[h];
        mesh.userData.enemy = null;
        var at = this.hitMeshes.indexOf(mesh);
        if (at >= 0) this.hitMeshes.splice(at, 1);
      }
    }
    var police = this.game && this.game.police;
    if (police && police.addHeat) {
      police.addHeat(ped.faction === 'boss' ? 3 : 1, ped.faction === 'boss' ? 'BOSS DOWN' : 'GUARD DOWN');
    }
    this._spark(this._tmp.set(ped.pos.x, ped.pos.y + 1.1, ped.pos.z), '#ff6f61', 10, 2.2, 0.55, -8);
    if (this.audio) this.audio.impact(0.65);
  };

  Combat.prototype._removeEnemy = function (index) {
    var e = this.enemies[index];
    if (!e) return;
    if (e._hitMeshes) {
      for (var i = 0; i < e._hitMeshes.length; i++) {
        var idx = this.hitMeshes.indexOf(e._hitMeshes[i]);
        if (idx >= 0) this.hitMeshes.splice(idx, 1);
      }
    }
    if (e.dispose) e.dispose();
    this.enemies.splice(index, 1);
  };

  Combat.prototype.updateEnemies = function (dt, player) {
    dt = clamp(dt || 0, 0, 0.05);
    player = player || this.player;
    if (!player) return;
    for (var i = this.enemies.length - 1; i >= 0; i--) {
      var e = this.enemies[i];
      if (!e) {
        this.enemies.splice(i, 1);
        continue;
      }
      if (!e.alive) {
        if (e.mesh && e.mesh.visible) {
          if (e.update) e.update(dt, player, this.world);
          if (e.deathTime > 8 && e.mesh.visible) e.mesh.visible = false;
        }
        if (e.deathTime > 8.4) this._removeEnemy(i);
        continue;
      }
      var d = dist2(e.pos.x, e.pos.z, player.pos.x, player.pos.z);
      if (!e.hostile && d < (e.guardPost ? 34 : 24)) {
        e.hostile = true;
        e._aiState = 'alert';
        e.shootTimer = Math.max(e.shootTimer || 0, 0.35 + Math.random() * 0.45);
      }
      if (e.hostile) {
        if (d > 22) e._aiState = 'chase';
        else if (e.health < e.maxHealth * 0.4 && e.faction !== 'boss') e._aiState = 'flank';
        else if (d > 8) e._aiState = 'shoot';
        else e._aiState = 'cover';
      } else {
        e._aiState = 'idle';
      }
      if (e._combatShotCd > 0) e._combatShotCd -= dt;
      if (e.update) e.update(dt, player, this.world);

      if (e.alive && e._aiState === 'flank' && d > 3.5 && d < 26) {
        e._flankTimer -= dt;
        if (e._flankTimer <= 0) {
          e._flankTimer = 1.4 + Math.random() * 1.3;
          e._flankDir *= Math.random() < 0.35 ? -1 : 1;
        }
        var fx = player.pos.x - e.pos.x;
        var fz = player.pos.z - e.pos.z;
        var fl = Math.sqrt(fx * fx + fz * fz) || 1;
        var sx = (fz / fl) * e._flankDir;
        var sz = (-fx / fl) * e._flankDir;
        var nx = e.pos.x + sx * 2.4 * dt;
        var nz = e.pos.z + sz * 2.4 * dt;
        if (this.world && this.world.collideCircle) {
          var res = this.world.collideCircle(nx, nz, 0.38);
          nx = res.x;
          nz = res.z;
        }
        e.pos.x = nx;
        e.pos.z = nz;
        e.mesh.position.copy(e.pos);
      }
    }
  };

  Combat.prototype.aliveCount = function () {
    var n = 0;
    for (var i = 0; i < this.enemies.length; i++) {
      if (this.enemies[i] && this.enemies[i].alive) n++;
    }
    return n;
  };

  Combat.prototype.clearEnemies = function () {
    for (var i = this.enemies.length - 1; i >= 0; i--) this._removeEnemy(i);
    this.hitMeshes.length = 0;
  };

  /* ---------------------------------------------------------- transactions -- */

  Combat.prototype.reload = function () {
    var p = this.player;
    if (!p) return false;
    var def = this.definition();
    if (def.kind === 'melee') return false;
    var w = p.weapons && p.weapons[this.currentWeapon];
    if (!w || !w.owned || this.reloadTimer > 0) return false;
    if ((w.ammo || 0) >= (def.mag || 0)) return false;
    if ((w.reserve || 0) <= 0) return false;
    var duration = def.kind === 'shotgun' ? 1.9 : def.kind === 'rifle' ? 1.65 : 1.2;
    this.reloadTimer = duration;
    this._reloadWeapon = this.currentWeapon;
    if (this.audio) this.audio.reload();
    return true;
  };

  Combat.prototype._finishReload = function () {
    var id = this._reloadWeapon || this.currentWeapon;
    var def = WCFG[id];
    var w = this.player && this.player.weapons && this.player.weapons[id];
    if (!def || !w) return;
    var need = Math.max(0, (def.mag || 0) - (w.ammo || 0));
    var take = Math.min(need, w.reserve || 0);
    w.ammo = (w.ammo || 0) + take;
    w.reserve = Math.max(0, (w.reserve || 0) - take);
    this._reloadWeapon = null;
    if (this.audio) this.audio.ui('confirm');
    this._syncHud();
  };

  Combat.prototype.setWeapon = function (i) {
    var p = this.player;
    if (!p) return false;
    var id = null;
    if (typeof i === 'string' && WCFG[i]) id = i;
    else {
      var n = Math.round(Number(i));
      var order = weaponOrder();
      for (var k = 0; k < order.length; k++) {
        if ((WCFG[order[k]].slot || 0) === n) {
          id = order[k];
          break;
        }
      }
      if (!id && order[n - 1]) id = order[n - 1];
    }
    if (!id || !WCFG[id]) return false;
    var w = p.weapons && p.weapons[id];
    if (!w || !w.owned) {
      if (this.audio) this.audio.ui('deny');
      return false;
    }
    this.currentWeapon = id;
    p.currentWeapon = id;
    this.reloadTimer = 0;
    this.nextFire = this.time + 0.12;
    if (this.audio) this.audio.ui();
    this._syncHud();
    return true;
  };

  Combat.prototype.cycle = function (dir) {
    var p = this.player;
    if (!p) return this.currentWeapon;
    if (p.cycleWeapon) p.cycleWeapon(dir < 0 ? -1 : 1);
    this.currentWeapon = p.currentWeapon || this.currentWeapon;
    this.reloadTimer = 0;
    if (this.audio) this.audio.ui();
    this._syncHud();
    return this.currentWeapon;
  };

  Combat.prototype.buy = function (id, kind) {
    var p = this.player;
    if (!p) return { ok: false, reason: 'NO PLAYER' };
    if (typeof id === 'number') {
      var order = weaponOrder();
      id = order[id - 1];
    }
    var def = WCFG[id];
    if (!def || def.kind === 'melee') return { ok: false, reason: 'NOT FOR SALE' };
    kind = kind === 'ammo' ? 'ammo' : 'weapon';
    var state = p.weapons && p.weapons[id];
    if (kind === 'weapon') {
      if (state && state.owned) return { ok: false, reason: 'ALREADY OWNED' };
      if ((p.money || 0) < (def.price || 0)) return { ok: false, reason: 'NOT ENOUGH CASH' };
      var bought = p.buyWeapon ? p.buyWeapon(id) : false;
      if (!bought) return { ok: false, reason: 'NOT ENOUGH CASH' };
      this.setWeapon(id);
      if (this.audio) this.audio.pickup();
      if (this.game && this.game.hud && this.game.hud.toast) {
        this.game.hud.toast(def.name + ' PURCHASED · -$' + def.price, 'cash');
      }
      return { ok: true, reason: 'PURCHASED', id: id, price: def.price };
    }
    if (!state || !state.owned) return { ok: false, reason: 'WEAPON NOT OWNED' };
    if ((p.money || 0) < (def.ammoPrice || 0)) return { ok: false, reason: 'NOT ENOUGH CASH' };
    var ammoBought = p.buyAmmo ? p.buyAmmo(id) : false;
    if (!ammoBought) return { ok: false, reason: 'NOT ENOUGH CASH' };
    if (this.audio) this.audio.pickup();
    if (this.game && this.game.hud && this.game.hud.toast) {
      this.game.hud.toast(def.name + ' AMMO · -$' + def.ammoPrice, 'cash');
    }
    this._syncHud();
    return { ok: true, reason: 'AMMO PURCHASED', id: id, price: def.ammoPrice };
  };

  Combat.prototype.refill = function () {
    var p = this.player;
    if (!p || !p.weapons) return this;
    for (var id in p.weapons) {
      if (!Object.prototype.hasOwnProperty.call(p.weapons, id)) continue;
      var def = WCFG[id];
      var w = p.weapons[id];
      if (!def || !w || !w.owned || def.kind === 'melee') continue;
      w.ammo = def.mag || 0;
      w.reserve = def.reserve || 0;
    }
    if (this.audio) this.audio.pickup();
    this._syncHud();
    return this;
  };

  /* ---------------------------------------------------------------- frame --- */

  Combat.prototype._spark = function (pos, color, count, speed, life, gravity) {
    if (!pos || !this._pLife) return;
    this._color.set(color || '#ffd27a');
    var cr = this._color.r;
    var cg = this._color.g;
    var cb = this._color.b;
    for (var i = 0; i < count; i++) {
      var idx = this._partCursor;
      this._partCursor = (this._partCursor + 1) % this.particleCap;
      var o = idx * 3;
      var lf = life * (0.65 + Math.random() * 0.7);
      this._pPos[o] = pos.x + (Math.random() - 0.5) * 0.12;
      this._pPos[o + 1] = pos.y + (Math.random() - 0.5) * 0.12;
      this._pPos[o + 2] = pos.z + (Math.random() - 0.5) * 0.12;
      this._pVel[o] = (Math.random() - 0.5) * speed * 2;
      this._pVel[o + 1] = Math.random() * speed;
      this._pVel[o + 2] = (Math.random() - 0.5) * speed * 2;
      this._pBase[o] = cr;
      this._pBase[o + 1] = cg;
      this._pBase[o + 2] = cb;
      this._pLife[idx] = lf;
      this._pMax[idx] = lf;
      this._pGrav[idx] = gravity == null ? -7 : gravity;
    }
    this._pGeo.attributes.position.needsUpdate = true;
    this._pGeo.attributes.color.needsUpdate = true;
  };

  Combat.prototype._updateParticles = function (dt) {
    var pos = this._pPos;
    var col = this._pCol;
    var vel = this._pVel;
    var base = this._pBase;
    var life = this._pLife;
    var max = this._pMax;
    var grav = this._pGrav;
    for (var i = 0; i < this.particleCap; i++) {
      if (life[i] <= 0) {
        col[i * 3] = 0;
        col[i * 3 + 1] = 0;
        col[i * 3 + 2] = 0;
        continue;
      }
      life[i] -= dt;
      var o = i * 3;
      if (life[i] <= 0) {
        col[o] = 0;
        col[o + 1] = 0;
        col[o + 2] = 0;
        continue;
      }
      vel[o + 1] += grav[i] * dt;
      pos[o] += vel[o] * dt;
      pos[o + 1] += vel[o + 1] * dt;
      pos[o + 2] += vel[o + 2] * dt;
      if (pos[o + 1] < 0.04) {
        pos[o + 1] = 0.04;
        vel[o + 1] *= -0.28;
        vel[o] *= 0.6;
        vel[o + 2] *= 0.6;
      }
      var fade = life[i] / Math.max(0.001, max[i]);
      col[o] = base[o] * fade;
      col[o + 1] = base[o + 1] * fade;
      col[o + 2] = base[o + 2] * fade;
    }
    this._pGeo.attributes.position.needsUpdate = true;
    this._pGeo.attributes.color.needsUpdate = true;
  };

  Combat.prototype._updateFx = function (dt) {
    var i;
    for (i = 0; i < this._tracers.length; i++) {
      var t = this._tracers[i];
      if (t.life <= 0) continue;
      t.life -= dt;
      if (t.life <= 0) {
        t.line.visible = false;
        continue;
      }
      t.mat.opacity = 0.9 * (t.life / t.max);
    }
    if (this._flashLife > 0) {
      this._flashLife -= dt;
      var f = clamp(this._flashLife / 0.04, 0, 1);
      this._flashLight.intensity = 5.5 * f;
      this._flashMat.opacity = 0.95 * f;
      if (this._flashLife <= 0) {
        this._flashLight.intensity = 0;
        this._flashSprite.visible = false;
        this._flashMat.opacity = 0;
      }
    }
    for (i = 0; i < this._casings.length; i++) {
      var c = this._casings[i];
      if (c.life <= 0) continue;
      c.life -= dt;
      if (c.life <= 0) {
        c.mesh.visible = false;
        continue;
      }
      c.vy -= 9.8 * dt;
      c.mesh.position.x += c.vx * dt;
      c.mesh.position.y += c.vy * dt;
      c.mesh.position.z += c.vz * dt;
      if (c.mesh.position.y < 0.04) {
        c.mesh.position.y = 0.04;
        c.vy *= -0.35;
        c.vx *= 0.65;
        c.vz *= 0.65;
      }
      c.mesh.rotation.x += c.spin * dt;
      c.mesh.rotation.z += c.spin * 0.7 * dt;
      if (c.life < 0.22) c.mesh.scale.setScalar(c.life / 0.22);
    }
    this._updateParticles(dt);
  };

  Combat.prototype.update = function (dt, input) {
    dt = clamp(dt || 0, 0, 0.05);
    this.time += dt;
    this.recoil *= Math.exp(-7 * dt);
    if (this.reloadTimer > 0) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        this.reloadTimer = 0;
        this._finishReload();
      }
    }
    this._updateFx(dt);
    this.updateEnemies(dt, this.player);

    if (!this.game || this.game.state !== 'play') {
      this._syncHud();
      return;
    }
    if (!this.player || this.player.dead) {
      this._syncHud();
      return;
    }
    if (this.player.currentWeapon && this.player.currentWeapon !== this.currentWeapon) {
      this.currentWeapon = this.player.currentWeapon;
      this.reloadTimer = 0;
    }
    if (!input) {
      this._syncHud();
      return;
    }

    if (input.consume('Digit1')) this.setWeapon(1);
    if (input.consume('Digit2')) this.setWeapon(2);
    if (input.consume('Digit3')) this.setWeapon(3);
    if (input.consume('Digit4')) this.setWeapon(4);
    if (input.consume('Digit5')) this.setWeapon(5);
    if (input.consume('KeyR')) this.reload();

    var wheel = input.wheelDelta || 0;
    if (Math.abs(wheel) > 0) {
      input.wheelDelta = 0;
      if (input.mouse) input.mouse.wheel = 0;
      this.cycle(wheel > 0 ? 1 : -1);
    }

    if (input.mouse) {
      var down = !!input.mouse.down;
      var clicked = !!input.mouse.clicked;
      var def = this.definition();
      if (def.kind === 'melee') {
        if (clicked) this.melee();
      } else if (def.auto ? down : clicked) {
        this.fire();
      }
    }

    var space = !!(input.keys && input.keys.Space);
    if (space && !this._prevSpace && this.currentWeapon === 'fists') this.melee();
    this._prevSpace = space;

    this._syncHud();
  };

  Combat.prototype._syncHud = function () {
    var p = this.player;
    if (!p || !p.weapons) return;
    var def = WCFG[this.currentWeapon] || {};
    var w = p.weapons[this.currentWeapon] || { ammo: 0, reserve: 0 };
    var sig = this.currentWeapon + ':' + (w.ammo || 0) + ':' + (w.reserve || 0) + ':' + (this.reloadTimer > 0 ? 1 : 0);
    if (sig === this._hudSig) return;
    this._hudSig = sig;
    var nameEl = document.getElementById('weapon-name');
    var ammoEl = document.getElementById('weapon-ammo');
    var reserveEl = document.getElementById('weapon-reserve');
    var panel = document.getElementById('weapon-panel');
    if (nameEl) nameEl.textContent = def.name || String(this.currentWeapon).toUpperCase();
    if (ammoEl) ammoEl.textContent = def.kind === 'melee' ? '∞' : String(w.ammo || 0);
    if (reserveEl) reserveEl.textContent = def.kind === 'melee' ? 'MELEE' : String(w.reserve || 0);
    if (panel) panel.classList.toggle('reloading', this.reloadTimer > 0);
  };

  Combat.prototype.dispose = function () {
    this.clearEnemies();
    if (this.particles && this.particles.parent) this.particles.parent.remove(this.particles);
    if (this._pGeo) this._pGeo.dispose();
    for (var i = 0; i < this._tracers.length; i++) {
      var t = this._tracers[i];
      if (t.line.parent) t.line.parent.remove(t.line);
      t.line.geometry.dispose();
      t.mat.dispose();
    }
    for (var c = 0; c < this._casings.length; c++) {
      if (this._casings[c].mesh.parent) this._casings[c].mesh.parent.remove(this._casings[c].mesh);
    }
    if (this._flashLight && this._flashLight.parent) this._flashLight.parent.remove(this._flashLight);
    if (this._flashSprite && this._flashSprite.parent) this._flashSprite.parent.remove(this._flashSprite);
    if (this._flashTex) this._flashTex.dispose();
    if (this._sphereGeo) this._sphereGeo.dispose();
    if (this._hitMat) this._hitMat.dispose();
  };

  LH.Combat = Combat;
}());
