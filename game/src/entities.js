/* LEONIDA HEAT 3D — entities: procedural low-poly characters, pedestrians,
   arcade vehicles and the player. Classic script, attaches to window.LH.
   Every model is built from cached primitives merged into a handful of draw
   calls; no image, font, audio or network asset is used. */
(function () {
  'use strict';

  window.LH = window.LH || {};

  var CFG = window.LH.CONFIG || {};
  var PCFG = CFG.PLAYER || {};
  var VCFG = CFG.VEHICLES || {};
  var WCFG = CFG.WEAPONS || {};
  var TAU = Math.PI * 2;

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function wrap(a) {
    a = (a + Math.PI) % TAU;
    if (a < 0) a += TAU;
    return a - Math.PI;
  }
  function dist2(ax, az, bx, bz) {
    var dx = ax - bx, dz = az - bz;
    return Math.sqrt(dx * dx + dz * dz);
  }
  function damp(cur, target, k, dt) { return cur + (target - cur) * (1 - Math.exp(-k * dt)); }
  function sh(hex, amount) {
    var raw = String(hex || '#888888').replace('#', '');
    if (raw.length === 3) raw = raw[0] + raw[0] + raw[1] + raw[1] + raw[2] + raw[2];
    var n = parseInt(raw, 16);
    if (!isFinite(n)) return hex;
    var r = clamp(((n >> 16) & 255) + amount, 0, 255);
    var g = clamp(((n >> 8) & 255) + amount, 0, 255);
    var b = clamp((n & 255) + amount, 0, 255);
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  /* ---------------------------------------------------------------- geometry */

  var PRIM = {};
  function nonIndexed(geo) {
    var out = geo.index ? geo.toNonIndexed() : geo;
    if (out !== geo) geo.dispose();
    return out;
  }
  function primBox() {
    if (!PRIM.box) PRIM.box = nonIndexed(new THREE.BoxGeometry(1, 1, 1));
    return PRIM.box;
  }
  function primCyl(seg) {
    var key = 'cyl' + (seg || 10);
    if (!PRIM[key]) PRIM[key] = nonIndexed(new THREE.CylinderGeometry(0.5, 0.5, 1, seg || 10, 1));
    return PRIM[key];
  }
  function primCylX(seg) {
    var key = 'cylx' + (seg || 14);
    if (!PRIM[key]) {
      var g = new THREE.CylinderGeometry(0.5, 0.5, 1, seg || 14, 1);
      g.rotateZ(Math.PI / 2);
      PRIM[key] = nonIndexed(g);
    }
    return PRIM[key];
  }
  function primIco(detail) {
    var key = 'ico' + (detail == null ? 1 : detail);
    if (!PRIM[key]) PRIM[key] = nonIndexed(new THREE.IcosahedronGeometry(1, detail == null ? 1 : detail));
    return PRIM[key];
  }
  function primDome() {
    if (!PRIM.dome) PRIM.dome = nonIndexed(new THREE.SphereGeometry(1, 9, 5, 0, TAU, 0, Math.PI * 0.55));
    return PRIM.dome;
  }
  function primCone() {
    if (!PRIM.cone) PRIM.cone = nonIndexed(new THREE.ConeGeometry(0.5, 1, 10, 1, true));
    return PRIM.cone;
  }
  function primPlane() {
    if (!PRIM.plane) PRIM.plane = nonIndexed(new THREE.PlaneGeometry(1, 1));
    return PRIM.plane;
  }
  function frustumGeo(wTop, dTop, wBot, dBot, h) {
    var hw = wBot / 2, hd = dBot / 2, tw = wTop / 2, td = dTop / 2, hh = h / 2;
    var v = [
      [-hw, -hh, -hd], [hw, -hh, -hd], [hw, -hh, hd], [-hw, -hh, hd],
      [-tw, hh, -td], [tw, hh, -td], [tw, hh, td], [-tw, hh, td]
    ];
    var quads = [
      [3, 2, 6, 7], [1, 0, 4, 5], [2, 1, 5, 6],
      [0, 3, 7, 4], [0, 1, 2, 3], [4, 7, 6, 5]
    ];
    var pos = [];
    for (var q = 0; q < quads.length; q++) {
      var f = quads[q];
      var a = v[f[0]], b = v[f[1]], c = v[f[2]], d = v[f[3]];
      pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
      pos.push(a[0], a[1], a[2], c[0], c[1], c[2], d[0], d[1], d[2]);
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    return g;
  }

  var TMP_MAT4 = new THREE.Matrix4();
  var TMP_MAT3 = new THREE.Matrix3();
  var TMP_QUAT = new THREE.Quaternion();
  var TMP_EULER = new THREE.Euler();
  var TMP_VEC = new THREE.Vector3();
  var TMP_SCALE = new THREE.Vector3();
  var TMP_COLOR = new THREE.Color();
  var TMP_VEC2 = new THREE.Vector3();
  var TMP_QUAT2 = new THREE.Quaternion();
  var TMP_EULER2 = new THREE.Euler();

  function GeoAccum() { this.p = []; this.n = []; this.c = []; }
  GeoAccum.prototype.add = function (geo, x, y, z, sx, sy, sz, rx, ry, rz, color) {
    TMP_MAT4.compose(
      TMP_VEC.set(x || 0, y || 0, z || 0),
      TMP_QUAT.setFromEuler(TMP_EULER.set(rx || 0, ry || 0, rz || 0)),
      TMP_SCALE.set(sx == null ? 1 : sx, sy == null ? 1 : sy, sz == null ? 1 : sz)
    );
    TMP_MAT3.getNormalMatrix(TMP_MAT4);
    var pos = geo.attributes.position.array;
    var nor = geo.attributes.normal ? geo.attributes.normal.array : null;
    TMP_COLOR.set(color == null ? '#b0b0b0' : color).convertSRGBToLinear();
    var cr = TMP_COLOR.r, cg = TMP_COLOR.g, cb = TMP_COLOR.b;
    var e = TMP_MAT4.elements, m = TMP_MAT3.elements;
    for (var i = 0; i < pos.length; i += 3) {
      var px = pos[i], py = pos[i + 1], pz = pos[i + 2];
      this.p.push(
        e[0] * px + e[4] * py + e[8] * pz + e[12],
        e[1] * px + e[5] * py + e[9] * pz + e[13],
        e[2] * px + e[6] * py + e[10] * pz + e[14]
      );
      if (nor) {
        var nx = nor[i], ny = nor[i + 1], nz = nor[i + 2];
        var tx = m[0] * nx + m[3] * ny + m[6] * nz;
        var ty = m[1] * nx + m[4] * ny + m[7] * nz;
        var tz = m[2] * nx + m[5] * ny + m[8] * nz;
        var ln = Math.sqrt(tx * tx + ty * ty + tz * tz) || 1;
        this.n.push(tx / ln, ty / ln, tz / ln);
      }
      this.c.push(cr, cg, cb);
    }
  };
  GeoAccum.prototype.build = function () {
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    if (this.n.length === this.p.length) g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    else g.computeVertexNormals();
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.computeBoundingSphere();
    return g;
  };

  var MATS = {};
  function charMat() {
    if (!MATS.char) MATS.char = new THREE.MeshStandardMaterial({
      vertexColors: true, flatShading: true, roughness: 0.78, metalness: 0.02
    });
    return MATS.char;
  }
  function carMat() {
    if (!MATS.car) MATS.car = new THREE.MeshStandardMaterial({
      vertexColors: true, flatShading: true, roughness: 0.44, metalness: 0.24
    });
    return MATS.car;
  }
  function rubberMat() {
    if (!MATS.rubber) MATS.rubber = new THREE.MeshStandardMaterial({
      vertexColors: true, flatShading: true, roughness: 0.9, metalness: 0.02
    });
    return MATS.rubber;
  }
  function glassMat() {
    if (!MATS.glass) {
      MATS.glass = new THREE.MeshStandardMaterial({
        color: 0x0d1c25, roughness: 0.18, metalness: 0.55, transparent: true, opacity: 0.93
      });
      MATS.glass.color.convertSRGBToLinear();
    }
    return MATS.glass;
  }
  function lightMat(color) {
    var key = 'l' + color;
    if (!MATS[key]) {
      MATS[key] = new THREE.MeshBasicMaterial({ color: color, toneMapped: false });
      MATS[key].color.convertSRGBToLinear();
    }
    return MATS[key];
  }
  function gunMat() {
    if (!MATS.gun) MATS.gun = new THREE.MeshStandardMaterial({
      color: 0x1b2026, roughness: 0.5, metalness: 0.55, flatShading: true
    });
    return MATS.gun;
  }

  /* -------------------------------------------------------------- characters */

  var HAIR_COLORS = ['#17151a', '#2a1712', '#3a2418', '#5a3a20', '#8a6a3c', '#c7a86a', '#d9d2c4'];
  var SHIRTS = ['#f2e7cf', '#1d5c64', '#c94a43', '#e8a54b', '#5a7d52', '#3e4a72', '#b05a7a', '#d8cdb8', '#2f4f4f'];
  var PANTS = ['#23262d', '#2c3a46', '#4a4238', '#1c2b34', '#5a5148', '#6d6f74'];
  var SKINS = ['#c98f6a', '#e0ad86', '#a96f4e', '#8a5a3c', '#6f4b34', '#f0c8a0'];
  var HAIR_STYLES = ['short', 'short', 'long', 'buzz', 'cap'];

  function buildCharacter(opts) {
    opts = opts || {};
    var scale = opts.scale || 1;
    var skin = opts.skin || '#c98f6a';
    var hair = opts.hair || '#1a1714';
    var shirt = opts.shirt || '#e9ddc6';
    var jacket = opts.jacket === false ? null : (opts.jacket || opts.jacketColor || '#1d5c64');
    var tie = opts.tie === false ? null : (opts.tie || '#a33b34');
    var pants = opts.pants || '#23262d';
    var shoes = opts.shoes || '#14161a';
    var hat = opts.hat || null;
    var hairStyle = opts.hairStyle || 'short';
    var heavy = opts.build === 'heavy';
    var bodyW = heavy ? 0.50 : 0.44;

    var root = new THREE.Group();
    root.name = 'character';
    var body = new THREE.Group();
    root.add(body);

    var skinDark = sh(skin, -20);
    var pantsDark = sh(pants, -16);
    var sleeve = jacket || shirt;

    /* torso pivot sits at the hips so the upper body can lean and twist */
    var torso = new THREE.Group();
    torso.position.y = 0.92;
    body.add(torso);
    var acc = new GeoAccum();
    acc.add(frustumGeo(bodyW, 0.25, bodyW * 0.82, 0.21, 0.56), 0, 0.29, 0, 1, 1, 1, 0, 0, 0, jacket || shirt);
    if (jacket) {
      acc.add(primBox(), 0, 0.33, 0.116, 0.19, 0.44, 0.022, 0, 0, 0, shirt);
      acc.add(primBox(), 0, 0.39, 0.128, 0.26, 0.20, 0.02, 0, 0, 0, sh(jacket, 12));
      if (opts.emblem) acc.add(primBox(), 0, 0.36, -0.128, 0.105, 0.075, 0.014, 0, 0, 0, '#f3c969');
      acc.add(primBox(), -0.15, 0.33, 0.118, 0.075, 0.30, 0.018, 0, 0, 0.30, sh(jacket, -14));
      acc.add(primBox(), 0.15, 0.33, 0.118, 0.075, 0.30, 0.018, 0, 0, -0.30, sh(jacket, -14));
      if (tie) {
        acc.add(primBox(), 0, 0.28, 0.137, 0.055, 0.25, 0.016, 0, 0, 0, tie);
        acc.add(primBox(), 0, 0.42, 0.137, 0.085, 0.07, 0.02, 0, 0, 0, sh(tie, 24));
      }
    } else {
      acc.add(primBox(), 0, 0.34, 0.118, 0.26, 0.16, 0.015, 0, 0, 0, sh(shirt, -12));
    }
    acc.add(primBox(), 0, 0.045, 0, bodyW * 0.9, 0.065, 0.225, 0, 0, 0, '#2a211c');
    acc.add(primBox(), 0, 0.06, 0.118, 0.075, 0.045, 0.025, 0, 0, 0, '#c9a15a');
    acc.add(primCyl(8), 0, 0.58, 0, 0.105, 0.10, 0.115, 0, 0, 0, skin);
    acc.add(primBox(), 0, 0.50, 0.015, bodyW * 0.72, 0.09, 0.20, 0, 0, 0, sh(jacket || shirt, -8));
    var torsoMesh = new THREE.Mesh(acc.build(), charMat());
    torsoMesh.castShadow = true;
    torso.add(torsoMesh);

    /* head, pivoting at the neck */
    var head = new THREE.Group();
    head.position.y = 0.59;
    torso.add(head);
    var hacc = new GeoAccum();
    hacc.add(primIco(1), 0, 0.10, 0.005, 0.158, 0.178, 0.165, 0, 0, 0, skin);
    hacc.add(primBox(), 0, 0.055, 0.155, 0.032, 0.042, 0.024, 0, 0, 0, sh(skin, 8));
    hacc.add(primBox(), -0.152, 0.09, 0, 0.024, 0.055, 0.035, 0, 0, 0, skinDark);
    hacc.add(primBox(), 0.152, 0.09, 0, 0.024, 0.055, 0.035, 0, 0, 0, skinDark);
    hacc.add(primBox(), -0.061, 0.116, 0.148, 0.045, 0.020, 0.012, 0, 0, 0, '#16171a');
    hacc.add(primBox(), 0.061, 0.116, 0.148, 0.045, 0.020, 0.012, 0, 0, 0, '#16171a');
    hacc.add(primBox(), -0.065, 0.152, 0.145, 0.058, 0.014, 0.012, 0, 0, 0.08, hair);
    hacc.add(primBox(), 0.065, 0.152, 0.145, 0.058, 0.014, 0.012, 0, 0, -0.08, hair);
    hacc.add(primBox(), 0, 0.028, 0.160, 0.052, 0.012, 0.012, 0, 0, 0, '#6f3a32');
    if (hairStyle === 'buzz') {
      hacc.add(primDome(), 0, 0.105, 0, 0.162, 0.150, 0.168, 0, 0, 0, hair);
    } else if (hairStyle === 'long') {
      hacc.add(primDome(), 0, 0.112, -0.002, 0.170, 0.168, 0.176, 0, 0, 0, hair);
      hacc.add(primBox(), 0, -0.03, -0.115, 0.27, 0.24, 0.10, 0, 0, 0, hair);
    } else if (hairStyle === 'cap') {
      hacc.add(primDome(), 0, 0.10, 0, 0.165, 0.140, 0.170, 0, 0, 0, hair);
    } else {
      hacc.add(primDome(), 0, 0.108, -0.002, 0.166, 0.155, 0.172, 0, 0, 0, hair);
      hacc.add(primBox(), 0, 0.065, -0.125, 0.26, 0.16, 0.075, 0, 0, 0, hair);
    }
    if (opts.beard) hacc.add(primBox(), 0, -0.015, 0.126, 0.22, 0.10, 0.075, 0, 0, 0, hair);
    if (hat) {
      var hatC = opts.hatColor || '#2b2620';
      hacc.add(primCyl(12), 0, 0.255, 0, 0.44, 0.022, 0.44, 0, 0, 0, hatC);
      hacc.add(primCyl(12), 0, 0.305, 0, 0.29, 0.12, 0.29, 0, 0, 0, hatC);
      hacc.add(primBox(), 0, 0.275, 0, 0.30, 0.035, 0.30, 0, 0, 0, sh(hatC, 24));
    }
    var headMesh = new THREE.Mesh(hacc.build(), charMat());
    headMesh.castShadow = true;
    head.add(headMesh);

    /* arms: shoulder pivots, geometry hangs down the local -Y axis */
    function makeArm(side) {
      var g = new THREE.Group();
      g.position.set(side * (bodyW * 0.5 + 0.012), 0.505, 0);
      torso.add(g);
      var a = new GeoAccum();
      a.add(primBox(), 0, -0.135, 0, 0.125, 0.29, 0.145, 0, 0, side * 0.04, sleeve);
      a.add(primBox(), 0, -0.30, 0.008, 0.108, 0.07, 0.13, 0, 0, 0, sh(sleeve, -16));
      a.add(primBox(), 0, -0.425, 0.012, 0.098, 0.25, 0.112, 0, 0, 0, jacket && opts.sleeves !== 'short' ? sleeve : skin);
      a.add(primBox(), 0, -0.575, 0.018, 0.088, 0.09, 0.10, 0, 0, 0, skin);
      var mesh = new THREE.Mesh(a.build(), charMat());
      mesh.castShadow = true;
      g.add(mesh);
      var hand = new THREE.Object3D();
      hand.position.set(0, -0.60, 0.02);
      g.add(hand);
      return { group: g, hand: hand };
    }
    var armL = makeArm(-1);
    var armR = makeArm(1);

    /* legs: hip pivots */
    function makeLeg(side) {
      var g = new THREE.Group();
      g.position.set(side * 0.105, 0.92, 0);
      body.add(g);
      var a = new GeoAccum();
      a.add(primBox(), 0, -0.215, 0, 0.16, 0.44, 0.18, 0, 0, 0, pants);
      a.add(primBox(), 0, -0.44, 0.005, 0.145, 0.05, 0.16, 0, 0, 0, pantsDark);
      a.add(primBox(), 0, -0.64, 0.01, 0.135, 0.38, 0.15, 0, 0, 0, pants);
      a.add(primBox(), 0, -0.845, 0.045, 0.145, 0.085, 0.27, 0, 0, 0, shoes);
      a.add(primBox(), 0, -0.872, 0.065, 0.15, 0.032, 0.26, 0, 0, 0, sh(shoes, 22));
      var mesh = new THREE.Mesh(a.build(), charMat());
      mesh.castShadow = true;
      g.add(mesh);
      return g;
    }
    var legL = makeLeg(-1);
    var legR = makeLeg(1);

    var character = {
      group: root,
      body: body,
      parts: {
        torso: torso, head: head,
        armL: armL.group, armR: armR.group, legL: legL, legR: legR,
        handL: armL.hand, handR: armR.hand
      },
      type: 'character',
      time: 0,
      walkPhase: 0,
      look: 0,
      _t: {
        alx: 0, alz: 0.05, arx: 0, arz: -0.05,
        llx: 0, lrx: 0, torsion: 0, lean: 0.02, bob: 0,
        headX: 0, bodyY: 0
      },
      geometries: [torsoMesh.geometry, headMesh.geometry,
        armL.group.children[0].geometry, armR.group.children[0].geometry,
        legL.children[0].geometry, legR.children[0].geometry],
      setPose: setCharacterPose,
      setLook: function (yaw) {
        this.look = clamp(yaw || 0, -1.05, 1.05);
        head.rotation.y = this.look;
      },
      setVisible: function (v) { root.visible = !!v; },
      dispose: function () {
        if (root.parent) root.parent.remove(root);
        for (var i = 0; i < this.geometries.length; i++) {
          if (this.geometries[i]) this.geometries[i].dispose();
        }
        this.geometries.length = 0;
      }
    };
    root.userData.character = character;
    root.scale.setScalar(scale);
    return character;
  }

  function setCharacterPose(t, speed, mode) {
    if (typeof t !== 'number' || !isFinite(t)) t = this.time;
    var dt = clamp(t - this.time, 0, 0.05);
    if (dt <= 0.00001) dt = 1 / 60;
    this.time = t;
    var sp = Math.max(0, speed || 0);
    var fast = sp > 4.7;
    var amt = clamp(sp / 8, 0, 1);
    this.walkPhase += sp * dt * 2.05;
    var ph = this.walkPhase;
    var idlePh = t * 1.9;
    var m = mode || (sp > 0.3 ? 'walk' : 'idle');

    var tll = 0, tlr = 0, tal = 0, tar = 0, talz = 0.06, tarz = -0.06;
    var lean = 0.025, twist = 0, bob = 0, bodyY = 0, headX = 0;

    if (m === 'walk' || m === 'run') {
      var amp = 0.32 + amt * 0.42;
      var swing = Math.sin(ph) * amp;
      tll = swing; tlr = -swing;
      tal = -swing * 0.82; tar = swing * 0.82;
      lean = 0.035 + amt * 0.16;
      twist = Math.sin(ph) * 0.10 * amt;
      bob = Math.abs(Math.sin(ph * 2)) * 0.028 * amt;
      talz = 0.09; tarz = -0.09;
      if (fast) { lean += 0.045; bob *= 1.25; }
    } else if (m === 'idle') {
      tll = Math.sin(idlePh) * 0.012;
      tlr = -tll;
      tal = Math.sin(idlePh * 0.8) * 0.03;
      tar = -Math.sin(idlePh * 0.8) * 0.03;
      lean = 0.02 + Math.sin(idlePh) * 0.008;
      bob = Math.sin(idlePh) * 0.004;
      headX = Math.sin(idlePh * 0.6) * 0.02;
    } else if (m === 'aim') {
      tal = -1.38; tar = -1.50;
      talz = -0.16; tarz = 0.10;
      lean = 0.06; twist = -0.17;
      tll = -0.08; tlr = 0.10;
      headX = -0.02;
    } else if (m === 'shoot') {
      tal = -1.42; tar = -1.56;
      talz = -0.15; tarz = 0.13;
      lean = 0.03; twist = -0.22;
      tll = -0.10; tlr = 0.12;
      headX = -0.04;
    } else if (m === 'crouch') {
      bodyY = -0.27;
      lean = 0.34; tll = -0.62; tlr = 0.48;
      tal = -0.55; tar = -0.62; talz = -0.20; tarz = 0.18;
      headX = 0.12;
    } else if (m === 'panic') {
      tal = -0.25; tar = -0.25; talz = -2.45; tarz = 2.45;
      lean = -0.08; twist = Math.sin(t * 7) * 0.12;
      tll = Math.sin(ph) * 0.4; tlr = -tll;
    } else if (m === 'drive') {
      tal = -1.12; tar = -1.12; talz = 0.18; tarz = -0.18;
      tll = -0.55; tlr = -0.55; bodyY = -0.28; lean = 0.12;
    } else if (m === 'dead') {
      talz = -1.2; tarz = 1.2; tll = 0.2; tlr = -0.2;
    }

    /* rotation.x negative swings a downward limb toward +Z (the facing side) */
    var k = 1 - Math.exp(-13 * dt);
    var p = this.parts;
    var ts = this._t;
    ts.llx = lerp(ts.llx, -tll, k);
    ts.lrx = lerp(ts.lrx, -tlr, k);
    ts.alx = lerp(ts.alx, tal, k);
    ts.arx = lerp(ts.arx, tar, k);
    ts.alz = lerp(ts.alz, talz, k);
    ts.arz = lerp(ts.arz, tarz, k);
    p.legL.rotation.x = ts.llx;
    p.legR.rotation.x = ts.lrx;
    p.armL.rotation.x = ts.alx;
    p.armR.rotation.x = ts.arx;
    p.armL.rotation.z = ts.alz;
    p.armR.rotation.z = ts.arz;
    ts.lean = lerp(ts.lean, lean, k);
    ts.torsion = lerp(ts.torsion, twist, k);
    ts.bob = lerp(ts.bob, bob, k);
    ts.bodyY = lerp(ts.bodyY, bodyY, k);
    ts.headX = lerp(ts.headX, headX, k);
    p.torso.rotation.x = ts.lean;
    p.torso.rotation.y = ts.torsion;
    p.head.rotation.x = ts.headX;
    this.body.position.y = ts.bob + ts.bodyY;
    return this;
  }

  var GUNS = {};
  function buildGun(kind) {
    var key = 'gun_' + (kind || 'pistol');
    if (GUNS[key]) return new THREE.Mesh(GUNS[key], gunMat());
    var a = new GeoAccum();
    var dark = '#232830', metal = '#4a5259';
    if (kind === 'shotgun' || kind === 'rifle') {
      var len = kind === 'rifle' ? 0.72 : 0.62;
      a.add(primBox(), 0, -0.20, 0, 0.05, len, 0.06, 0, 0, 0, metal);
      a.add(primBox(), 0, -0.05, 0.035, 0.065, 0.18, 0.11, 0, 0, 0, dark);
      a.add(primBox(), 0, 0.04, 0.025, 0.08, 0.16, 0.13, 0, 0, 0, '#6a4a2e');
      a.add(primBox(), 0, -0.30, -0.025, 0.04, 0.16, 0.04, 0, 0, 0, dark);
    } else if (kind === 'smg') {
      a.add(primBox(), 0, -0.16, 0, 0.055, 0.32, 0.075, 0, 0, 0, dark);
      a.add(primBox(), 0, -0.05, 0.035, 0.05, 0.13, 0.10, 0, 0, 0, metal);
      a.add(primBox(), 0, -0.22, 0.03, 0.045, 0.16, 0.06, 0, 0, 0, metal);
      a.add(primBox(), 0, 0.02, -0.04, 0.035, 0.15, 0.05, 0, 0, 0, dark);
    } else if (kind === 'fists') {
      return null;
    } else {
      a.add(primBox(), 0, -0.10, 0, 0.048, 0.22, 0.06, 0, 0, 0, metal);
      a.add(primBox(), 0, 0.006, 0.025, 0.055, 0.095, 0.095, 0, 0, 0, dark);
      a.add(primBox(), 0, -0.10, 0.035, 0.042, 0.16, 0.045, 0, 0, 0, dark);
    }
    var geo = a.build();
    var mesh = new THREE.Mesh(geo, gunMat());
    mesh.castShadow = true;
    GUNS[key] = geo;
    return mesh;
  }

  /* -------------------------------------------------------------------- ped */

  var FACTIONS = {
    civilian: { health: 55, speed: 1.35, panic: 5.4, aggro: 0, standoff: 0 },
    guard: { health: 85, speed: 3.9, panic: 0, aggro: 21, standoff: 6.5 },
    cop: { health: 100, speed: 4.5, panic: 0, aggro: 25, standoff: 7.0 },
    boss: { health: 260, speed: 4.2, panic: 0, aggro: 30, standoff: 5.0 }
  };

  function pedestrianLook(seed) {
    var r = LH.RNG ? LH.RNG('ped:' + seed) : null;
    var pick = function (arr) { return r ? r.pick(arr) : arr[Math.floor(Math.random() * arr.length)]; };
    var style = pick(HAIR_STYLES);
    return {
      skin: pick(SKINS),
      hair: pick(HAIR_COLORS),
      shirt: pick(SHIRTS),
      jacket: r && r.chance(0.55) ? pick(SHIRTS) : false,
      tie: r && r.chance(0.22),
      pants: pick(PANTS),
      shoes: pick(['#14161a', '#3a2c22', '#d8d2c2', '#22262b']),
      hairStyle: style,
      hat: style === 'cap' && r && r.chance(0.35) ? '#2b2620' : null,
      build: r && r.chance(0.18) ? 'heavy' : 'normal'
    };
  }

  function Ped(scene, world, opts) {
    opts = opts || {};
    this.scene = scene || null;
    this.world = world || null;
    this.faction = FACTIONS[opts.faction] ? opts.faction : 'civilian';
    var def = FACTIONS[this.faction];
    var look = opts.look || pedestrianLook(opts.seed == null ? Math.floor(Math.random() * 1e6) : opts.seed);
    var isUniform = this.faction !== 'civilian';
    if (isUniform) {
      look.jacket = this.faction === 'cop' ? '#1c2c44' : this.faction === 'boss' ? '#2a1f26' : '#3b3a30';
      look.shirt = this.faction === 'cop' ? '#d8dde2' : '#5c5748';
      look.pants = this.faction === 'cop' ? '#1a2230' : '#2a2822';
      look.tie = this.faction === 'cop';
      look.hat = this.faction === 'cop' ? '#111820' : null;
      look.hairStyle = 'buzz';
    }
    var scale = this.faction === 'boss' ? 1.1 : (opts.scale || (0.94 + Math.random() * 0.09));
    this.look = look;
    this.character = buildCharacter(look);
    this.character.group.scale.setScalar(scale);
    this.mesh = this.character.group;
    this.mesh.name = 'ped-' + this.faction;
    if (scene) scene.add(this.mesh);

    this.pos = this.mesh.position;
    var px = opts.x == null ? 0 : opts.x;
    var pz = opts.z == null ? 0 : opts.z;
    var gy = world && world.groundHeight ? world.groundHeight(px, pz) : 0;
    this.pos.set(px, gy, pz);
    this.yaw = opts.yaw || 0;
    this.mesh.rotation.y = this.yaw;

    this.health = def.health;
    this.maxHealth = def.health;
    this.speed = 0;
    this.alive = true;
    this.state = 'idle';
    this.time = Math.random() * 10;
    this.wanderAngle = this.yaw;
    this.wanderTimer = Math.random() * 2;
    this.panic = 0;
    this.deathTime = 0;
    this.healthShow = 0;
    this.thinkTimer = 0;
    this.shootTimer = 1 + Math.random();
    this.aimAt = null;
    this.onShoot = null;
    this.onDeath = null;
    this.showHealthBar = opts.healthBar !== false;
    this._bar = null;
    this._barFill = null;
    this._groundY = gy;
    this._avoidTimer = 0;
    this._threatX = 0;
    this._threatZ = 0;
    this._scale = scale;

    if (isUniform || opts.weapon) {
      this.gun = buildGun(opts.weapon || (this.faction === 'boss' ? 'smg' : 'pistol'));
      if (this.gun) {
        this.gun.position.set(0, -0.60, 0.02);
        this.character.parts.armR.add(this.gun);
        this.gun.visible = !!(isUniform || opts.weapon);
      }
    }
  }

  Ped.prototype.update = function (dt, player, world) {
    world = world || this.world;
    dt = clamp(dt || 0, 0, 0.06);
    this.time += dt;

    if (!this.alive) {
      this.deathTime += dt;
      var fall = clamp(this.deathTime * 3.2, 0, 1);
      this.mesh.rotation.z = this._fallSide * fall * 1.42;
      this.mesh.position.y = this._groundY + Math.sin(fall * Math.PI) * 0.12 - fall * 0.04;
      if (this.deathTime > 8 && this.mesh.visible) this.mesh.visible = false;
      if (this._bar) this._bar.visible = false;
      return;
    }

    var playerPos = player && player.pos ? player.pos : null;
    var pdist = playerPos ? dist2(this.pos.x, this.pos.z, playerPos.x, playerPos.z) : 999;
    var playerWanted = player && player.wanted ? player.wanted : 0;
    var def = FACTIONS[this.faction];
    var moveSpeed = 0;
    var pose = 'idle';
    var wantYaw = this.yaw;

    if (this.panic > 0) this.panic -= dt;

    if (this.faction === 'civilian') {
      if (this.panic > 0) {
        this.state = 'flee';
        var fx = this.pos.x - this._threatX;
        var fz = this.pos.z - this._threatZ;
        if (fx * fx + fz * fz < 0.01) { fx = Math.sin(this.yaw + Math.PI); fz = Math.cos(this.yaw + Math.PI); }
        wantYaw = Math.atan2(fx, fz);
        moveSpeed = def.panic;
        pose = 'panic';
      } else if (playerWanted > 0 && pdist < 16) {
        this.panic = 4.5;
        this._threatX = playerPos.x;
        this._threatZ = playerPos.z;
        this.state = 'flee';
      } else {
        this.state = 'wander';
        this.wanderTimer -= dt;
        if (this.wanderTimer <= 0) {
          this.wanderTimer = 2.2 + Math.random() * 3.6;
          this.wanderAngle += (Math.random() - 0.5) * 1.6;
          if (Math.random() < 0.22) this.wanderTimer = 0.8;
        }
        wantYaw = this.wanderAngle;
        moveSpeed = this.wanderTimer > 0.9 ? def.speed : 0;
        pose = moveSpeed > 0 ? 'walk' : 'idle';
      }
    } else {
      var armed = this.faction === 'cop' || this.faction === 'guard' || this.faction === 'boss';
      var hostile = pdist < def.aggro && (this.faction !== 'cop' || playerWanted > 0 || this.hostile);
      if (this.hostile) hostile = true;
      if (hostile && playerPos) {
        this.state = pdist > def.standoff + 1.5 ? 'chase' : 'combat';
        if (this.state === 'chase') {
          wantYaw = Math.atan2(playerPos.x - this.pos.x, playerPos.z - this.pos.z);
          moveSpeed = def.speed;
          pose = 'run';
        } else {
          wantYaw = Math.atan2(playerPos.x - this.pos.x, playerPos.z - this.pos.z);
          moveSpeed = 0;
          pose = 'aim';
          this.shootTimer -= dt;
          if (this.shootTimer <= 0) {
            this.shootTimer = 0.9 + Math.random() * 0.8;
            this.aimAt = playerPos;
            if (this.gun) this.gun.visible = true;
            if (typeof this.onShoot === 'function') {
              try { this.onShoot(this, player); } catch (e) { /* combat owns damage */ }
            }
          }
        }
        if (this.gun) this.gun.visible = true;
      } else {
        this.state = 'idle';
        this.shootTimer = Math.max(this.shootTimer, 0.65);
        if (this.gun && !armed) this.gun.visible = false;
        if (this.faction === 'boss') {
          this.wanderTimer -= dt;
          if (this.wanderTimer <= 0) {
            this.wanderTimer = 3 + Math.random() * 3;
            this.wanderAngle += (Math.random() - 0.5) * 1.4;
          }
          wantYaw = this.wanderAngle;
          moveSpeed = 0.9;
          pose = 'walk';
        }
        pose = moveSpeed > 0 ? 'walk' : 'idle';
      }
    }

    /* steer smoothly, then move with a short obstacle probe */
    if (moveSpeed > 0.05) {
      var turn = wrap(wantYaw - this.yaw);
      this.yaw += clamp(turn, -3.6 * dt, 3.6 * dt);
      this._avoidTimer -= dt;
      if (world && world.collideCircle && this._avoidTimer <= 0) {
        this._avoidTimer = 0.18;
        var probe = 1.35;
        var pr = world.collideCircle(this.pos.x + Math.sin(this.yaw) * probe, this.pos.z + Math.cos(this.yaw) * probe, 0.4);
        if (pr.hit) {
          var side = Math.sin(this.time * 2.1 + this.pos.x) > 0 ? 1 : -1;
          this.yaw += side * 0.9;
          wantYaw = this.yaw;
        }
      }
      var nx = this.pos.x + Math.sin(this.yaw) * moveSpeed * dt;
      var nz = this.pos.z + Math.cos(this.yaw) * moveSpeed * dt;
      if (world && world.collideCircle) {
        var res = world.collideCircle(nx, nz, 0.38);
        if (res.hit) this.yaw += (Math.sin(this.time * 3.3) > 0 ? 1 : -1) * 1.4;
        nx = res.x; nz = res.z;
      }
      this.pos.x = nx;
      this.pos.z = nz;
      this.speed = moveSpeed;
    } else {
      this.speed = 0;
    }
    var gy = world && world.groundHeight ? world.groundHeight(this.pos.x, this.pos.z) : 0;
    this._groundY = gy;
    this.pos.y = gy;
    this.mesh.rotation.y = this.yaw;
    this.mesh.rotation.z = 0;
    this.character.setPose(this.time, this.speed, pose);
    this.character.setLook(0);
    if (this.healthShow > 0) {
      this.healthShow -= dt;
      if (this.healthShow <= 0 && this._bar) this._bar.visible = false;
    }
    if (this._bar && this._bar.visible) this._updateBar();
  };

  Ped.prototype._updateBar = function () {
    if (!this._barFill) return;
    var ratio = clamp(this.health / this.maxHealth, 0, 1);
    this._barFill.scale.x = 1.04 * ratio;
    this._barFill.position.x = -0.52 + 0.52 * ratio;
    this._barFill.material.color.set(ratio > 0.55 ? 0x63e6a4 : ratio > 0.25 ? 0xf3c969 : 0xff4d55);
  };

  Ped.prototype._ensureBar = function () {
    if (this._bar) return;
    var bg = new THREE.Sprite(new THREE.SpriteMaterial({
      color: 0x070b11, transparent: true, opacity: 0.72, depthTest: false, depthWrite: false
    }));
    bg.scale.set(1.14, 0.135, 1);
    bg.position.set(0, 2.12 * this._scale, 0);
    bg.renderOrder = 4;
    var fill = new THREE.Sprite(new THREE.SpriteMaterial({
      color: 0x63e6a4, transparent: true, opacity: 0.96, depthTest: false, depthWrite: false
    }));
    fill.center.set(0, 0.5);
    fill.position.set(-0.52, 2.12 * this._scale, 0.01);
    fill.scale.set(1.04, 0.085, 1);
    fill.renderOrder = 5;
    this.mesh.add(bg);
    this.mesh.add(fill);
    this._bar = bg;
    this._barFill = fill;
  };

  Ped.prototype.damage = function (n, from) {
    if (!this.alive) return 0;
    var amount = Math.max(0, n || 0);
    this.health -= amount;
    if (from && from.pos) {
      this._threatX = from.pos.x;
      this._threatZ = from.pos.z;
    }
    if (this.faction === 'civilian' && from) this.panic = 7.5;
    if (this.faction !== 'civilian') this.hostile = true;
    if (this.showHealthBar) {
      this._ensureBar();
      this._bar.visible = true;
      this.healthShow = 3.2;
      this._updateBar();
    }
    if (this.health <= 0) {
      this.health = 0;
      this.die(from);
    }
    return amount;
  };

  Ped.prototype.die = function (from) {
    if (!this.alive) return;
    this.alive = false;
    this.state = 'dead';
    this.speed = 0;
    this.deathTime = 0;
    this._fallSide = (from && from.pos && from.pos.x > this.pos.x) ? 1 : -1;
    this.character.setPose(this.time, 0, 'dead');
    if (this._bar) this._bar.visible = false;
    if (typeof this.onDeath === 'function') {
      try { this.onDeath(this, from); } catch (e) { /* optional hook */ }
    }
  };

  Ped.prototype.flee = function (from) {
    if (!this.alive) return;
    if (from && from.pos) {
      this._threatX = from.pos.x;
      this._threatZ = from.pos.z;
    } else if (from && typeof from.x === 'number') {
      this._threatX = from.x;
      this._threatZ = from.z;
    }
    this.panic = 8;
    this.state = 'flee';
  };

  Ped.prototype.setPose = function (t, speed, mode) { this.character.setPose(t, speed, mode); };
  Ped.prototype.setVisible = function (v) { this.mesh.visible = !!v; };

  Ped.prototype.dispose = function () {
    if (this.mesh.parent) this.mesh.parent.remove(this.mesh);
    if (this._bar) {
      if (this._bar.material) this._bar.material.dispose();
      if (this._barFill && this._barFill.material) this._barFill.material.dispose();
    }
    this.character.dispose();
  };

  /* ---------------------------------------------------------------- vehicle */

  var DECAL = {};
  function textTexture(text, fg, bg, w, h, font) {
    var key = text + ':' + fg + ':' + bg + ':' + w + ':' + h;
    if (DECAL[key]) return DECAL[key];
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    var g = c.getContext('2d');
    if (bg) { g.fillStyle = bg; g.fillRect(0, 0, w, h); }
    g.fillStyle = fg;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = font || ('bold ' + Math.floor(h * 0.62) + 'px Arial, sans-serif');
    g.fillText(text, w / 2, h / 2 + 1);
    var tex = new THREE.CanvasTexture(c);
    if (THREE.sRGBEncoding) tex.encoding = THREE.sRGBEncoding;
    tex.needsUpdate = true;
    DECAL[key] = tex;
    return tex;
  }

  function wheelGeometry(r, w) {
    var key = 'wheel' + r.toFixed(2) + ':' + w.toFixed(2);
    if (DECAL[key]) return DECAL[key];
    var a = new GeoAccum();
    a.add(primCylX(14), 0, 0, 0, w, r * 2, r * 2, 0, 0, 0, '#14161a');
    a.add(primCylX(12), 0, 0, 0, w * 1.02, r * 1.06, r * 1.06, 0, 0, 0, '#2b3036');
    a.add(primCylX(10), 0, 0, 0, w * 1.06, r * 0.92, r * 0.92, 0, 0, 0, '#9aa1a5');
    for (var i = 0; i < 3; i++) {
      a.add(primBox(), 0, 0, 0, w * 1.08, r * 0.16, r * 1.5, (i / 3) * Math.PI, 0, 0, '#c9cdd0');
    }
    var g = a.build();
    DECAL[key] = g;
    return g;
  }

  function addBox(acc, x, y, z, sx, sy, sz, color, rx, ry, rz) {
    acc.add(primBox(), x, y, z, sx, sy, sz, rx || 0, ry || 0, rz || 0, color);
  }

  function Vehicle(scene, world, type, opts) {
    opts = opts || {};
    var def = VCFG[type] || VCFG.sedan || {
      id: 'sedan', label: 'SEDAN', maxSpeed: 33, accel: 9.4, brake: 19, grip: 7.2,
      mass: 1450, value: 8000, seats: 4, length: 4.55, width: 1.9, height: 1.42,
      wheelBase: 2.65, wheelRadius: 0.34, clearance: 0.3,
      colors: ['#c8c3b4', '#7c2d2a', '#2c4a57']
    };
    this.scene = scene || null;
    this.world = world || null;
    this.type = def.id || type || 'sedan';
    this.def = def;
    this.isPolice = !!def.isPolice || this.type === 'police';
    this.mesh = new THREE.Group();
    this.mesh.name = 'vehicle-' + this.type;
    this.pos = this.mesh.position;
    var x = opts.x == null ? 0 : opts.x;
    var z = opts.z == null ? 0 : opts.z;
    var gy = world && world.groundHeight ? world.groundHeight(x, z) : 0;
    this.pos.set(x, gy, z);
    this.heading = opts.heading || 0;
    this.mesh.rotation.y = this.heading;

    var palette = def.colors || ['#c8c3b4'];
    this.color = opts.color || (this.isPolice ? '#f2f0e6' : palette[Math.floor(Math.random() * palette.length)]);
    if (this.type === 'taxi') this.color = opts.color || '#f0c53c';

    this.maxHealth = opts.health || (def.armored ? 420 : this.isPolice ? 240 : 170);
    this.health = this.maxHealth;
    this.speed = 0;
    this.vx = 0;
    this.vz = 0;
    this.steer = 0;
    this.throttle = 0;
    this.brake = 0;
    this.yawRate = 0;
    this.wheelSpin = 0;
    this.wheelRadius = def.wheelRadius || 0.34;
    this.length = def.length || 4.55;
    this.width = def.width || 1.9;
    this.height = def.height || 1.42;
    this.occupiedBy = null;
    this.driver = null;
    this.aiTarget = opts.aiTarget || null;
    this.destroyed = false;
    this._time = Math.random() * 6;
    this._impact = 0;
    this._siren = 0;
    this._smokeBits = [];
    this._fxMats = [];
    this._collisionCooldown = 0;
    this._night = 0;

    this.seatOffset = new THREE.Vector3(-this.width * 0.21, 0.62, 0.12);
    this.exitOffset = new THREE.Vector3(-this.width * 0.5 - 0.62, 0.02, 0.2);
    this.doorOffset = this.exitOffset;

    this._buildMesh();
    if (scene) scene.add(this.mesh);
    this.setVisible(opts.visible !== false);
  }

  Vehicle.prototype._buildMesh = function () {
    var def = this.def;
    var type = this.type;
    var L = this.length, W = this.width, H = this.height;
    var r = this.wheelRadius;
    var low = (def.clearance || 0.3) + 0.09;
    var bodyTop = type === 'van' ? H * 0.45 : type === 'armored' ? H * 0.52 : type === 'sports' ? H * 0.68 : H * 0.65;
    var bodyH = Math.max(0.32, bodyTop - low);
    var cabinLen = type === 'van' ? L * 0.64 : type === 'armored' ? L * 0.42 : type === 'sports' ? L * 0.38 : type === 'coupe' ? L * 0.40 : L * 0.45;
    var cabinW = W * (type === 'van' ? 0.9 : type === 'armored' ? 0.9 : 0.81);
    var cabinH = Math.max(0.3, H - bodyTop - 0.01);
    var cabinZ = type === 'sports' ? -L * 0.06 : -L * 0.025;
    var bodyZ = 0;
    var dark = '#23262b';
    var chrome = '#b9bec1';
    var bodyAcc = new GeoAccum();
    var glassAcc = new GeoAccum();
    var trimAcc = new GeoAccum();

    /* lower chassis + main body with a little tumblehome */
    addBox(trimAcc, 0, low - 0.075, 0, W * 0.98, 0.16, L * 0.94, dark);
    bodyAcc.add(frustumGeo(W * 0.93, L * 0.93, W, L * 0.97, bodyH),
      0, low + bodyH / 2, bodyZ, 1, 1, 1, 0, 0, 0, this.color);
    addBox(bodyAcc, 0, low + bodyH - 0.035, 0, W * 0.95, 0.07, L * 0.97, sh(this.color, 10));

    /* hood and boot surfaces sit proud of the main box */
    var hoodLen = type === 'van' ? L * 0.24 : type === 'sports' ? L * 0.34 : L * 0.27;
    var bootLen = type === 'van' ? 0.1 : type === 'sports' ? L * 0.20 : L * 0.23;
    addBox(bodyAcc, 0, low + bodyH + 0.006, L * 0.5 - hoodLen * 0.5 - 0.06, W * 0.86, 0.055, hoodLen, sh(this.color, 8));
    addBox(bodyAcc, 0, low + bodyH + 0.006, -L * 0.5 + bootLen * 0.5 + 0.06, W * 0.86, 0.055, bootLen, sh(this.color, 5));

    if (type !== 'van') {
      /* dark glass greenhouse with a body-colour roof and pillars */
      glassAcc.add(frustumGeo(cabinW * 0.75, cabinLen * 0.6, cabinW, cabinLen, cabinH),
        0, bodyTop + cabinH / 2, cabinZ, 1, 1, 1, 0, 0, 0, '#0d1b23');
      addBox(bodyAcc, 0, bodyTop + cabinH + 0.002, cabinZ, cabinW * 0.77, 0.055, cabinLen * 0.62, sh(this.color, 12));
      var px = cabinW * 0.442;
      addBox(bodyAcc, -px, bodyTop + cabinH * 0.5, cabinZ + cabinLen * 0.40, 0.072, cabinH * 0.98, 0.085, sh(this.color, -12), -0.30, 0, -0.34);
      addBox(bodyAcc, px, bodyTop + cabinH * 0.5, cabinZ + cabinLen * 0.40, 0.072, cabinH * 0.98, 0.085, sh(this.color, -12), -0.30, 0, 0.34);
      addBox(bodyAcc, -px, bodyTop + cabinH * 0.5, cabinZ - cabinLen * 0.40, 0.072, cabinH * 0.98, 0.085, sh(this.color, -12), 0.34, 0, -0.34);
      addBox(bodyAcc, px, bodyTop + cabinH * 0.5, cabinZ - cabinLen * 0.40, 0.072, cabinH * 0.98, 0.085, sh(this.color, -12), 0.34, 0, 0.34);
      addBox(bodyAcc, -cabinW * 0.475, bodyTop + cabinH * 0.47, cabinZ, 0.045, cabinH * 0.88, 0.07, sh(this.color, -18), 0, 0, -0.34);
      addBox(bodyAcc, cabinW * 0.475, bodyTop + cabinH * 0.47, cabinZ, 0.045, cabinH * 0.88, 0.07, sh(this.color, -18), 0, 0, 0.34);
      addBox(bodyAcc, -cabinW * 0.505, bodyTop + 0.035, cabinZ, 0.035, 0.07, cabinLen * 0.96, sh(this.color, -6));
      addBox(bodyAcc, cabinW * 0.505, bodyTop + 0.035, cabinZ, 0.035, 0.07, cabinLen * 0.96, sh(this.color, -6));
      /* mirrors */
      addBox(bodyAcc, -W * 0.52, bodyTop + cabinH * 0.24, cabinZ + cabinLen * 0.4, 0.14, 0.09, 0.17, sh(this.color, -8));
      addBox(bodyAcc, W * 0.52, bodyTop + cabinH * 0.24, cabinZ + cabinLen * 0.4, 0.14, 0.09, 0.17, sh(this.color, -8));
    } else {
      /* van: tall cargo box with a stubby cab */
      addBox(bodyAcc, 0, bodyTop + cabinH * 0.48, cabinZ, cabinW, cabinH, cabinLen, this.color);
      addBox(bodyAcc, 0, low + bodyH * 0.5, L * 0.36, W * 0.99, bodyH * 0.9, L * 0.26, this.color);
      addBox(glassAcc, -cabinW * 0.5 - 0.01, bodyTop + cabinH * 0.6, L * 0.31, 0.025, cabinH * 0.42, L * 0.10, '#0e1c24');
      addBox(glassAcc, cabinW * 0.5 + 0.01, bodyTop + cabinH * 0.6, L * 0.31, 0.025, cabinH * 0.42, L * 0.10, '#0e1c24');
      addBox(glassAcc, 0, bodyTop + cabinH * 0.58, L * 0.435, cabinW * 0.72, cabinH * 0.40, 0.035, '#0e1c24', -0.16, 0, 0);
      addBox(bodyAcc, 0, bodyTop + cabinH * 0.02, -L * 0.5 + 0.09, 0.05, cabinH * 0.92, 0.05, sh(this.color, -24));
      addBox(bodyAcc, 0, bodyTop + cabinH * 0.02, -L * 0.5 + 0.07, cabinW * 0.92, 0.04, 0.04, sh(this.color, -18));
    }

    /* sport / coupe signature details */
    if (type === 'sports') {
      addBox(bodyAcc, 0, low + bodyH + cabinH + 0.12, -L * 0.34, W * 0.68, 0.045, 0.32, sh(this.color, -26));
      addBox(bodyAcc, -W * 0.24, low + bodyH + cabinH + 0.055, -L * 0.34, 0.06, 0.14, 0.07, dark);
      addBox(bodyAcc, W * 0.24, low + bodyH + cabinH + 0.055, -L * 0.34, 0.06, 0.14, 0.07, dark);
      addBox(trimAcc, 0, low - 0.005, L * 0.49, W * 0.94, 0.05, 0.24, dark);
      addBox(trimAcc, 0, low + bodyH * 0.4, -L * 0.48, W * 0.7, bodyH * 0.42, 0.06, dark);
    }
    if (type === 'coupe') {
      addBox(bodyAcc, 0, low + bodyH + 0.045, -L * 0.42, W * 0.62, 0.035, 0.2, sh(this.color, -18));
    }
    if (type === 'armored') {
      addBox(trimAcc, 0, low + bodyH * 0.5, L * 0.5, W * 0.9, bodyH * 0.68, 0.10, '#39423c');
      addBox(trimAcc, -W * 0.505, low + bodyH * 0.5, 0, 0.06, bodyH * 0.75, L * 0.58, '#3d453f');
      addBox(trimAcc, W * 0.505, low + bodyH * 0.5, 0, 0.06, bodyH * 0.75, L * 0.58, '#3d453f');
      addBox(trimAcc, 0, low + bodyH + 0.03, -L * 0.5 + 0.04, W * 0.86, 0.10, 0.08, '#2d3531');
      addBox(bodyAcc, 0, bodyTop + cabinH + 0.02, cabinZ - L * 0.04, 0.9, 0.07, 0.9, '#59635c');
      addBox(trimAcc, -W * 0.32, low + bodyH * 0.25, L * 0.5 + 0.04, 0.18, 0.18, 0.16, '#1a1e1c');
      addBox(trimAcc, W * 0.32, low + bodyH * 0.25, L * 0.5 + 0.04, 0.18, 0.18, 0.16, '#1a1e1c');
    }
    if (type === 'police') {
      addBox(bodyAcc, -W * 0.505, low + bodyH * 0.52, 0, 0.026, bodyH * 0.58, L * 0.44, '#151b26');
      addBox(bodyAcc, W * 0.505, low + bodyH * 0.52, 0, 0.026, bodyH * 0.58, L * 0.44, '#151b26');
      addBox(trimAcc, 0, low + 0.02, L * 0.5 + 0.07, W * 0.66, 0.11, 0.10, '#30353a');
      addBox(trimAcc, -W * 0.24, low + 0.11, L * 0.5 + 0.14, 0.07, 0.32, 0.07, '#30353a');
      addBox(trimAcc, W * 0.24, low + 0.11, L * 0.5 + 0.14, 0.07, 0.32, 0.07, '#30353a');
    }
    if (type === 'taxi') {
      addBox(bodyAcc, -W * 0.505, low + bodyH * 0.5, 0, 0.024, bodyH * 0.42, L * 0.5, '#2a2620');
      addBox(bodyAcc, W * 0.505, low + bodyH * 0.5, 0, 0.024, bodyH * 0.42, L * 0.5, '#2a2620');
      for (var ci = 0; ci < 4; ci++) {
        addBox(bodyAcc, -W * 0.505, low + bodyH * 0.42 + ci * 0.082, 0.55 - ci * 0.30, 0.03, 0.045, 0.15, '#f7ecd6');
        addBox(bodyAcc, W * 0.505, low + bodyH * 0.42 + ci * 0.082, 0.55 - ci * 0.30, 0.03, 0.045, 0.15, '#f7ecd6');
      }
    }

    /* bumpers, plates, grille, exhaust */
    addBox(trimAcc, 0, low + 0.1, L * 0.5 - 0.01, W * 1.0, 0.15, 0.16, type === 'sports' ? '#1d2226' : dark);
    addBox(trimAcc, 0, low + 0.1, -L * 0.5 + 0.01, W * 1.0, 0.15, 0.16, dark);
    addBox(trimAcc, -W * 0.5 + 0.04, low + 0.06, 0, 0.05, 0.13, L * 0.62, dark);
    addBox(trimAcc, W * 0.5 - 0.04, low + 0.06, 0, 0.05, 0.13, L * 0.62, dark);
    addBox(trimAcc, 0, low + bodyH * 0.44, L * 0.5 + 0.005, W * 0.3, 0.15, 0.04, '#171b1f');
    addBox(trimAcc, 0, low + 0.27, -L * 0.5 - 0.01, 0.42, 0.16, 0.025, '#e6dfcb');
    addBox(trimAcc, -W * 0.3, low + 0.035, -L * 0.5 - 0.015, 0.08, 0.08, 0.1, '#5b6166');
    if (type !== 'van' && type !== 'armored') {
      addBox(trimAcc, -W * 0.5 + 0.05, low + bodyH + 0.01, -L * 0.42, 0.03, 0.05, 0.25, chrome);
      addBox(trimAcc, W * 0.5 - 0.05, low + bodyH + 0.01, -L * 0.42, 0.03, 0.05, 0.25, chrome);
    }

    /* light clusters (kept separate so they can glow and toggle) */
    var headAcc = new GeoAccum();
    var tailAcc = new GeoAccum();
    var hy = low + bodyH * 0.62;
    addBox(headAcc, -W * 0.33, hy, L * 0.5 + 0.018, 0.34, 0.12, 0.05, '#ffe9bd');
    addBox(headAcc, W * 0.33, hy, L * 0.5 + 0.018, 0.34, 0.12, 0.05, '#ffe9bd');
    addBox(tailAcc, -W * 0.33, hy, -L * 0.5 - 0.018, 0.36, 0.11, 0.05, '#ff3a32');
    addBox(tailAcc, W * 0.33, hy, -L * 0.5 - 0.018, 0.36, 0.11, 0.05, '#ff3a32');

    var bodyGroup = new THREE.Group();
    this.bodyGroup = bodyGroup;
    this.mesh.add(bodyGroup);
    for (var ti = 0; ti < trimAcc.p.length; ti++) bodyAcc.p.push(trimAcc.p[ti]);
    for (var tn = 0; tn < trimAcc.n.length; tn++) bodyAcc.n.push(trimAcc.n[tn]);
    for (var tc = 0; tc < trimAcc.c.length; tc++) bodyAcc.c.push(trimAcc.c[tc]);
    var bodyMesh = new THREE.Mesh(bodyAcc.build(), carMat());
    bodyMesh.castShadow = true;
    bodyMesh.receiveShadow = true;
    bodyGroup.add(bodyMesh);
    var glassMesh = new THREE.Mesh(glassAcc.build(), glassMat());
    glassMesh.castShadow = false;
    bodyGroup.add(glassMesh);
    this.headlights = new THREE.Mesh(headAcc.build(), lightMat('#fff1c9'));
    this.headlights.castShadow = false;
    bodyGroup.add(this.headlights);
    this.taillights = new THREE.Mesh(tailAcc.build(), lightMat('#ff3a32'));
    this.taillights.castShadow = false;
    bodyGroup.add(this.taillights);
    this._brakeOn = false;

    var self = this;
    function sidePlane(texture, w, h, x, z, flip) {
      var g = new THREE.PlaneGeometry(w, h);
      var m = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false });
      var p = new THREE.Mesh(g, m);
      p.position.set(x, low + bodyH * 0.58, z);
      p.rotation.y = flip ? -Math.PI / 2 : Math.PI / 2;
      p.renderOrder = 2;
      bodyGroup.add(p);
      return p;
    }
    if (this.isPolice) {
      var policeTex = textTexture('POLICE', '#111820', null, 256, 64);
      sidePlane(policeTex, 1.65, 0.34, -W * 0.508, 0, true);
      sidePlane(policeTex, 1.65, 0.34, W * 0.508, 0, false);
      /* roof light bar */
      var barBase = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.07, 0.3), lightMat('#1b2028'));
      barBase.position.set(0, bodyTop + cabinH + 0.035, cabinZ - 0.1);
      bodyGroup.add(barBase);
      var redMat = lightMat('#ff2a24');
      var blueMat = lightMat('#2b7bff');
      this._lightRed = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.26), redMat);
      this._lightBlue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.26), blueMat);
      this._lightRed.position.set(-0.29, bodyTop + cabinH + 0.12, cabinZ - 0.1);
      this._lightBlue.position.set(0.29, bodyTop + cabinH + 0.12, cabinZ - 0.1);
      bodyGroup.add(this._lightRed);
      bodyGroup.add(this._lightBlue);
    }
    if (type === 'taxi') {
      var base = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.08, 0.32), lightMat('#1b2028'));
      base.position.set(0, bodyTop + cabinH + 0.05, cabinZ - 0.05);
      bodyGroup.add(base);
      var sign = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.2, 0.26), lightMat('#ffd75c'));
      sign.position.set(0, bodyTop + cabinH + 0.18, cabinZ - 0.05);
      bodyGroup.add(sign);
      var signTex = textTexture('TAXI', '#211c12', null, 128, 64);
      var sm = new THREE.MeshBasicMaterial({ map: signTex, transparent: true, toneMapped: false });
      var sp = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.16), sm);
      sp.position.set(0, bodyTop + cabinH + 0.18, cabinZ + 0.085);
      bodyGroup.add(sp);
    }

    /* wheels: one instanced mesh, four matrices updated each frame */
    var wg = wheelGeometry(r, 0.24);
    this.wheels = new THREE.InstancedMesh(wg, rubberMat(), 4);
    this.wheels.castShadow = true;
    this.wheels.frustumCulled = false;
    this.wheelOffsets = [
      { x: -W * 0.5 + 0.06, z: def.wheelBase * 0.5, front: true },
      { x: W * 0.5 - 0.06, z: def.wheelBase * 0.5, front: true },
      { x: -W * 0.5 + 0.06, z: -def.wheelBase * 0.5, front: false },
      { x: W * 0.5 - 0.06, z: -def.wheelBase * 0.5, front: false }
    ];
    this.mesh.add(this.wheels);
    this._updateWheels(0);

    /* nightly headlight cones */
    var coneMat = new THREE.MeshBasicMaterial({
      color: 0xffe6b0, transparent: true, opacity: 0.055,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false
    });
    this._coneMat = coneMat;
    this._lightCones = new THREE.Group();
    var coneGeo = primCone();
    var c1 = new THREE.Mesh(coneGeo, coneMat);
    c1.rotation.x = Math.PI / 2;
    c1.scale.set(1.9, 6.5, 1.9);
    c1.position.set(-W * 0.3, low + bodyH * 0.6, L * 0.5 + 3.1);
    var c2 = new THREE.Mesh(coneGeo, coneMat);
    c2.rotation.x = Math.PI / 2;
    c2.scale.set(1.9, 6.5, 1.9);
    c2.position.set(W * 0.3, low + bodyH * 0.6, L * 0.5 + 3.1);
    this._lightCones.add(c1);
    this._lightCones.add(c2);
    this._lightCones.visible = false;
    this.mesh.add(this._lightCones);

    /* damage fx are created lazily, they are per-car and cheap */
    this._bodyTop = bodyTop;
    this._cabinTop = bodyTop + cabinH;
    this._low = low;
    this._bodyH = bodyH;
  };

  Vehicle.prototype._updateWheels = function (dt) {
    if (!this.wheels) return;
    var steerAngle = clamp(this.steer, -1, 1) * 0.42;
    this.wheelSpin += this.speed / Math.max(0.1, this.wheelRadius) * dt;
    for (var i = 0; i < 4; i++) {
      var o = this.wheelOffsets[i];
      var yaw = o.front ? steerAngle : 0;
      TMP_EULER2.set(this.wheelSpin, yaw, 0, 'YXZ');
      TMP_QUAT2.setFromEuler(TMP_EULER2);
      TMP_MAT4.compose(
        TMP_VEC.set(o.x, this.wheelRadius, o.z),
        TMP_QUAT2,
        TMP_SCALE.set(1, 1, 1)
      );
      this.wheels.setMatrixAt(i, TMP_MAT4);
    }
    this.wheels.instanceMatrix.needsUpdate = true;
  };

  Vehicle.prototype.update = function (dt, ctl, others) {
    dt = clamp(dt || 0, 0, 0.06);
    this._time += dt;
    ctl = ctl || {};
    var def = this.def;
    var throttle = clamp(ctl.throttle || 0, 0, 1);
    var brake = clamp(ctl.brake || 0, 0, 1);
    var steerIn = clamp(ctl.steer || 0, -1, 1);
    var handbrake = !!ctl.handbrake;
    this.throttle = throttle;
    this.brake = brake;
    this.steer = damp(this.steer, steerIn, 10, dt);
    if (this.destroyed) { throttle = 0; brake = 0; handbrake = true; }

    var h = this.heading;
    var fx = Math.sin(h), fz = Math.cos(h);
    var rx = Math.cos(h), rz = -Math.sin(h);
    var vLong = this.vx * fx + this.vz * fz;
    var vLat = this.vx * rx + this.vz * rz;
    var maxSpeed = def.maxSpeed || 33;
    var accel = def.accel || 9.4;
    var maxReverse = maxSpeed * 0.36;

    if (throttle > 0) {
      if (vLong < -0.4) vLong += (def.brake || 19) * throttle * dt;
      else vLong += accel * throttle * (1 - clamp(vLong / maxSpeed, 0, 1) * 0.82) * dt;
    }
    if (brake > 0) {
      if (vLong > 0.5) vLong -= (def.brake || 19) * brake * dt;
      else vLong -= accel * 0.55 * brake * dt;
    }
    if (!throttle && !brake) vLong -= vLong * 0.72 * dt;
    if (handbrake) vLong -= vLong * 2.6 * dt;
    vLong -= Math.sign(vLong) * Math.min(Math.abs(vLong), (0.55 + Math.abs(vLong) * 0.035) * dt);
    vLong = clamp(vLong, -maxReverse, maxSpeed);

    var grip = handbrake ? 1.1 : (def.grip || 7.2);
    vLat *= Math.exp(-grip * dt);

    var speedAbs = Math.abs(vLong);
    var authority = clamp(1 - speedAbs / (maxSpeed * 1.75), 0.24, 1);
    var targetYaw = steerIn * 2.55 * authority * clamp(speedAbs / 2.4, 0, 1) * (vLong < 0 ? -1 : 1);
    if (handbrake) targetYaw *= 1.35;
    this.yawRate = damp(this.yawRate, targetYaw, 8, dt);
    this.heading = wrap(this.heading + this.yawRate * dt);
    this.mesh.rotation.y = this.heading;

    h = this.heading;
    fx = Math.sin(h); fz = Math.cos(h);
    rx = Math.cos(h); rz = -Math.sin(h);
    this.vx = fx * vLong + rx * vLat;
    this.vz = fz * vLong + rz * vLat;
    this.speed = vLong;

    var nx = this.pos.x + this.vx * dt;
    var nz = this.pos.z + this.vz * dt;
    var world = this.world;
    var hit = false;
    if (world && world.collideCircle) {
      var hw = this.width * 0.5 - 0.16;
      var hl = this.length * 0.5 - 0.30;
      var cos = Math.cos(h), sin = Math.sin(h);
      var pushX = 0, pushZ = 0, hits = 0;
      for (var ci = 0; ci < 4; ci++) {
        var lx = (ci === 0 || ci === 3) ? -hw : hw;
        var lz = (ci < 2) ? hl : -hl;
        var cx = nx + lx * cos + lz * sin;
        var cz = nz - lx * sin + lz * cos;
        var res = world.collideCircle(cx, cz, 0.34);
        if (res.hit) {
          pushX += res.x - cx;
          pushZ += res.z - cz;
          hits++;
        }
      }
      if (hits) {
        nx += pushX / hits;
        nz += pushZ / hits;
        hit = true;
        var impact = Math.sqrt(this.vx * this.vx + this.vz * this.vz);
        this.vx *= 0.48;
        this.vz *= 0.48;
        this.yawRate *= 0.55;
        this._impact = clamp(impact * 0.16, 0, 1);
        if (impact > 7 && this._collisionCooldown <= 0) {
          this._collisionCooldown = 0.3;
          this.damage(impact * 0.9);
        }
      }
    } else {
      if (nx < -500) { nx = -500; hit = true; }
      if (nx > 490) { nx = 490; hit = true; }
      if (nz < -490) { nz = -490; hit = true; }
      if (nz > 490) { nz = 490; hit = true; }
    }

    if (others && others.length) {
      this._collideVehicles(nx, nz, others);
      nx = this.pos.x;
      nz = this.pos.z;
    }
    this._collisionCooldown -= dt;

    this.pos.x = nx;
    this.pos.z = nz;
    var gy = world && world.groundHeight ? world.groundHeight(nx, nz) : 0;
    this.pos.y = gy;

    /* suspension, wheels, brake lights, damage */
    var speedRatio = clamp(Math.abs(this.speed) / maxSpeed, 0, 1);
    var bob = Math.sin(this._time * (7 + speedRatio * 9)) * (0.006 + speedRatio * 0.014);
    var accelPitch = (throttle - brake) * 0.018 + this._impact * -0.06;
    this._impact = damp(this._impact, 0, 5, dt);
    this.bodyGroup.position.y = bob;
    this.bodyGroup.rotation.x = damp(this.bodyGroup.rotation.x, accelPitch, 6, dt);
    this.bodyGroup.rotation.z = damp(this.bodyGroup.rotation.z, this.steer * speedRatio * 0.035, 6, dt);
    this._updateWheels(dt);

    var braking = brake > 0.05 || handbrake || (this.speed < 0);
    if (braking !== this._brakeOn) {
      this._brakeOn = braking;
      this.taillights.material = lightMat(braking ? '#ff2a24' : '#9b2420');
    }
    if (this.isPolice && !this.destroyed) {
      this._siren += dt * 9;
      var phase = Math.sin(this._siren) > 0;
      if (this._lightRed) this._lightRed.visible = phase;
      if (this._lightBlue) this._lightBlue.visible = !phase;
    }

    var night = (world && typeof world._night === 'number') ? world._night : 0;
    if (this._lightCones) this._lightCones.visible = night > 0.32 && !this.destroyed;
    if (this.headlights) this.headlights.visible = !this.destroyed;

    this._updateDamage(dt, speedRatio);

    if (typeof this.onSound === 'function' && Math.abs(this.speed) > 0.4) {
      try { this.onSound(this.speed, throttle); } catch (e) { /* audio hook */ }
    }
  };

  Vehicle.prototype._collideVehicles = function (nx, nz, others) {
    var myR = this.length * 0.34;
    for (var i = 0; i < others.length; i++) {
      var o = others[i];
      if (!o || o === this) continue;
      var dx = nx - o.pos.x;
      var dz = nz - o.pos.z;
      var d = Math.sqrt(dx * dx + dz * dz);
      var minD = myR + (o.length ? o.length * 0.34 : 1.6);
      if (d > 0.001 && d < minD) {
        var nxv = dx / d, nzv = dz / d;
        var push = (minD - d) * 0.55;
        nx += nxv * push;
        nz += nzv * push;
        var rel = this.vx * nxv + this.vz * nzv;
        if (rel < 0) {
          this.vx -= nxv * rel * 0.9;
          this.vz -= nzv * rel * 0.9;
        }
        this.vx *= 0.93;
        this.vz *= 0.93;
        if (this._collisionCooldown <= 0) {
          this._collisionCooldown = 0.35;
          this.damage(Math.abs(rel) * 0.6);
          if (typeof this.onImpact === 'function') { try { this.onImpact(Math.abs(rel)); } catch (e) { /* hook */ } }
        }
      }
    }
    this.pos.x = nx;
    this.pos.z = nz;
  };

  Vehicle.prototype._initDamageFx = function () {
    if (this._smokeBits.length) return;
    var self = this;
    for (var i = 0; i < 4; i++) {
      var m = new THREE.MeshBasicMaterial({
        color: i < 2 ? 0x30363a : 0x4a4f52,
        transparent: true, opacity: 0.32, depthWrite: false
      });
      var mesh = new THREE.Mesh(primIco(0), m);
      mesh.visible = false;
      this.bodyGroup.add(mesh);
      this._smokeBits.push({ mesh: mesh, phase: i * 0.9, mat: m });
      this._fxMats.push(m);
    }
    for (var f = 0; f < 3; f++) {
      var fm = new THREE.MeshBasicMaterial({
        color: f === 0 ? 0xffb03a : 0xff5a20, transparent: true, opacity: 0.8, depthWrite: false
      });
      var fl = new THREE.Mesh(primIco(0), fm);
      fl.visible = false;
      this.bodyGroup.add(fl);
      this._smokeBits.push({ mesh: fl, phase: 2 + f * 0.6, mat: fm, fire: true });
      this._fxMats.push(fm);
    }
    var flashMat = new THREE.MeshBasicMaterial({
      color: 0xffd27a, transparent: true, opacity: 0, depthWrite: false,
      blending: THREE.AdditiveBlending, toneMapped: false
    });
    var flash = new THREE.Mesh(primIco(1), flashMat);
    flash.visible = false;
    this.bodyGroup.add(flash);
    this._flash = flash;
    this._flashMat = flashMat;
    this._fxMats.push(flashMat);
    var charMat2 = new THREE.MeshBasicMaterial({ color: 0x151719, transparent: true, opacity: 0.72, depthWrite: false });
    var charMesh = new THREE.Mesh(new THREE.BoxGeometry(this.width * 0.98, this._bodyH * 0.9, this.length * 0.9), charMat2);
    charMesh.position.set(0, this._low + this._bodyH * 0.5, 0);
    charMesh.visible = false;
    this.bodyGroup.add(charMesh);
    this._charMesh = charMesh;
    this._fxMats.push(charMat2);
    this._fxGeos = [charMesh.geometry];
  };

  Vehicle.prototype._updateDamage = function (dt, speedRatio) {
    var ratio = clamp(this.health / this.maxHealth, 0, 1);
    var smoking = ratio < 0.6 || this._impact > 0.5;
    var burning = ratio < 0.28 || this.destroyed;
    if (!smoking && !burning) return;
    this._initDamageFx();
    var base = this._bodyTop || 1;
    var zz = this.length * 0.28;
    for (var i = 0; i < this._smokeBits.length; i++) {
      var b = this._smokeBits[i];
      var on = b.fire ? burning : smoking;
      b.mesh.visible = on;
      if (!on) continue;
      var ph = (this._time * (b.fire ? 2.2 : 0.8) + b.phase) % 1;
      var rise = b.fire ? 0.45 : 1.25;
      b.mesh.position.set(
        Math.sin(this._time * 2.1 + b.phase) * 0.16,
        base + 0.15 + ph * rise,
        zz - ph * 0.7 + (b.fire ? 0.1 : 0)
      );
      var sc = b.fire ? (0.14 + ph * 0.16) : (0.16 + ph * 0.36);
      b.mesh.scale.setScalar(sc);
      b.mat.opacity = (b.fire ? 0.85 : 0.34) * (1 - ph * 0.7);
    }
    if (this.destroyed && this._flash) {
      var ft = this._flashTime;
      if (ft > 0) {
        this._flashTime = Math.max(0, ft - dt);
        this._flash.visible = true;
        var s = 0.4 + (0.9 - this._flashTime) * 5;
        this._flash.scale.setScalar(s);
        this._flashMat.opacity = clamp(this._flashTime * 1.6, 0, 0.85);
      } else {
        this._flash.visible = false;
        this._flashMat.opacity = 0;
      }
    }
  };

  Vehicle.prototype.damage = function (n) {
    if (this.destroyed) return 0;
    var amount = Math.max(0, n || 0) * (this.def.armored ? 0.62 : 1);
    this.health -= amount;
    if (this.health <= 0) {
      this.health = 0;
      this.explode();
    }
    return amount;
  };

  Vehicle.prototype.explode = function () {
    if (this.destroyed) return;
    this.destroyed = true;
    this.health = 0;
    this.speed = 0;
    this.vx = 0;
    this.vz = 0;
    this.throttle = 0;
    this.brake = 1;
    this._flashTime = 0.9;
    this._initDamageFx();
    this._charMesh.visible = true;
    if (this.occupiedBy && this.occupiedBy.damage) this.occupiedBy.damage(45, 'explosion');
    if (typeof this.onExplode === 'function') { try { this.onExplode(this); } catch (e) { /* hook */ } }
  };

  Vehicle.prototype.repair = function () {
    this.health = this.maxHealth;
    this.destroyed = false;
    this.speed = 0;
    this.vx = 0;
    this.vz = 0;
    this._impact = 0;
    this._brakeOn = false;
    if (this._charMesh) this._charMesh.visible = false;
    if (this._flash) this._flash.visible = false;
    for (var i = 0; i < this._smokeBits.length; i++) this._smokeBits[i].mesh.visible = false;
    if (this.taillights) this.taillights.material = lightMat('#9b2420');
  };

  Vehicle.prototype.enter = function (actor) {
    if (this.destroyed) return false;
    if (this.occupiedBy && this.occupiedBy !== actor) {
      if (typeof this.occupiedBy.flee === 'function') this.occupiedBy.flee(actor);
    }
    this.occupiedBy = actor;
    this.driver = actor;
    if (actor) actor.vehicle = this;
    return true;
  };

  Vehicle.prototype.exit = function () {
    var actor = this.occupiedBy;
    this.occupiedBy = null;
    this.driver = null;
    if (actor && actor.vehicle === this) actor.vehicle = null;
    return this.exitWorld(TMP_VEC2).clone();
  };

  Vehicle.prototype.seatWorld = function (out) {
    var h = this.heading;
    var lx = this.seatOffset.x, lz = this.seatOffset.z;
    var v = out || new THREE.Vector3();
    v.set(
      this.pos.x + lx * Math.cos(h) + lz * Math.sin(h),
      this.pos.y + this.seatOffset.y,
      this.pos.z - lx * Math.sin(h) + lz * Math.cos(h)
    );
    return v;
  };

  Vehicle.prototype.exitWorld = function (out) {
    var h = this.heading;
    var lx = this.exitOffset.x, lz = this.exitOffset.z;
    var v = out || new THREE.Vector3();
    v.set(
      this.pos.x + lx * Math.cos(h) + lz * Math.sin(h),
      this.pos.y + (this.world && this.world.groundHeight ? this.world.groundHeight(this.pos.x + lx * Math.cos(h), this.pos.z - lx * Math.sin(h)) : 0),
      this.pos.z - lx * Math.sin(h) + lz * Math.cos(h)
    );
    return v;
  };

  Vehicle.prototype.aiUpdate = function (dt, targetPos, world) {
    if (!targetPos) return 0;
    if (world) this.world = world;
    var dx = targetPos.x - this.pos.x;
    var dz = targetPos.z - this.pos.z;
    var d = Math.sqrt(dx * dx + dz * dz);
    var desired = Math.atan2(dx, dz);
    var diff = wrap(desired - this.heading);
    var steer = clamp(diff * 1.7, -1, 1);
    var throttle = d > 10 ? 0.8 : d > 4 ? 0.35 : 0.0;
    var brake = 0;
    if (d < 8 && Math.abs(this.speed) > 5) brake = 0.7;
    if (Math.abs(diff) > 1.1 && Math.abs(this.speed) > 8) { throttle = 0.35; brake = 0.25; }
    this.update(dt, { throttle: throttle, brake: brake, steer: steer, handbrake: false }, this.aiVehicles || null);
    return d;
  };

  Vehicle.prototype.setVisible = function (v) {
    this.mesh.visible = !!v;
    if (!v && this._lightCones) this._lightCones.visible = false;
  };

  Vehicle.prototype.dispose = function () {
    if (this.mesh.parent) this.mesh.parent.remove(this.mesh);
    for (var i = 0; i < this._fxMats.length; i++) {
      if (this._fxMats[i]) this._fxMats[i].dispose();
    }
    if (this._fxGeos) for (var g = 0; g < this._fxGeos.length; g++) this._fxGeos[g].dispose();
    if (this._coneMat) this._coneMat.dispose();
    this._fxMats.length = 0;
  };

  /* ----------------------------------------------------------------- player */

  function freshWeapons() {
    var out = {};
    var start = PCFG.startWeapons || {};
    for (var id in WCFG) {
      if (!Object.prototype.hasOwnProperty.call(WCFG, id)) continue;
      var s = start[id] || {};
      var def = WCFG[id];
      out[id] = {
        owned: !!s.owned,
        ammo: s.ammo == null ? 0 : s.ammo,
        reserve: s.reserve == null ? (def.kind === 'melee' ? 0 : 0) : s.reserve
      };
    }
    for (var sid in start) {
      if (Object.prototype.hasOwnProperty.call(start, sid) && !out[sid]) {
        out[sid] = { owned: !!start[sid].owned, ammo: start[sid].ammo || 0, reserve: start[sid].reserve || 0 };
      }
    }
    return out;
  }

  function Player(scene, world) {
    this.scene = scene || null;
    this.world = world || null;
    this.pos = new THREE.Vector3();
    this.yaw = 0;
    this.health = PCFG.maxHealth || 100;
    this.maxHealth = PCFG.maxHealth || 100;
    this.armor = 0;
    this.maxArmor = PCFG.maxArmor || 100;
    this.money = PCFG.startMoney || 500;
    this.wanted = 0;
    this.vehicle = null;
    this.vehicles = null;
    this.preview = null;
    this.weapons = freshWeapons();
    this.currentWeapon = WCFG[PCFG.startWeapon] ? PCFG.startWeapon : 'pistol';
    this.dead = false;
    this.time = 0;
    this.moveSpeed = 0;
    this.speed = 0;
    this.aiming = false;
    this.sprinting = false;
    this.camMode = 'foot';
    this.recoilTime = 0;
    this.dodgeTime = 0;
    this.dodgeCooldown = 0;
    this.dodgeDirX = 0;
    this.dodgeDirZ = 1;
    this.stepDistance = 0;
    this.onFootstep = null;
    this.onShoot = null;
    this.onPrompt = null;
    this.autoShoot = true;
    this.prompt = '';
    this._lastPrompt = null;
    this._firePressed = false;
    this._seatTmp = new THREE.Vector3();
    this._exitTmp = new THREE.Vector3();
    this._ctl = { throttle: 0, brake: 0, steer: 0, handbrake: false };
    this._axisX = 0;
    this._axisY = 0;

    var spawn = (world && world.spawn) || (CFG.WORLD && CFG.WORLD.points && CFG.WORLD.points.spawn) || { x: 0, z: 0 };
    var sy = world && world.groundHeight ? world.groundHeight(spawn.x, spawn.z) : 0;
    this.pos.set(spawn.x, sy, spawn.z);
    this.yaw = typeof spawn.yaw === 'number' ? spawn.yaw : 0;

    var look = {
      skin: '#d39a72', hair: '#3c2a1c', shirt: '#f4ead4', jacket: '#2f8f8a',
      tie: '#b5433c', pants: '#2e3440', shoes: '#1a1c21', hairStyle: 'short',
      emblem: true
    };
    this.character = buildCharacter(look);
    this.mesh = this.character.group;
    this.mesh.name = 'player';
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.yaw;
    this.parts = this.character.parts;
    if (scene) scene.add(this.mesh);

    this.gun = buildGun('pistol');
    if (this.gun) {
      this.gun.position.set(0, -0.60, 0.02);
      this.parts.armR.add(this.gun);
      this.gun.visible = false;
    }
    this.character.setPose(0, 0, 'idle');
  }

  Player.prototype._nearestVehicle = function (maxDist) {
    var best = null;
    var bestD = maxDist;
    var list = this.vehicles;
    if ((!list || !list.length) && this.world && this.world.vehicles) list = this.world.vehicles;
    if (!list) return null;
    for (var i = 0; i < list.length; i++) {
      var v = list[i];
      if (!v || !v.pos || v.destroyed) continue;
      var d = dist2(this.pos.x, this.pos.z, v.pos.x, v.pos.z);
      if (d < bestD) { bestD = d; best = v; }
    }
    return best;
  };

  Player.prototype._setPrompt = function (text) {
    this.prompt = text || '';
    if (this._lastPrompt === this.prompt) return;
    this._lastPrompt = this.prompt;
    if (typeof this.onPrompt === 'function') {
      try { this.onPrompt(this.prompt); } catch (e) { /* hud hook */ }
    }
  };

  Player.prototype._clampStats = function () {
    this.health = clamp(this.health == null ? this.maxHealth : this.health, 0, this.maxHealth);
    this.armor = clamp(this.armor || 0, 0, this.maxArmor);
    this.wanted = clamp(Math.round(this.wanted || 0), 0, 5);
    this.money = Math.max(0, Math.round(this.money || 0));
    return this;
  };

  Player.prototype.update = function (dt, input, camYaw) {
    dt = clamp(dt || 0, 0, 0.05);
    this.time += dt;
    this.dodgeCooldown = Math.max(0, this.dodgeCooldown - dt);
    this.recoilTime = Math.max(0, this.recoilTime - dt);
    if (input && input.consume && input.consume('KeyE')) {
      if (this.vehicle) this.exit();
      else {
        var near = this._nearestVehicle(PCFG.enterRange || 3.2);
        if (near) this.enter(near);
      }
    }

    if (this.vehicle) this._updateVehicle(dt, input, camYaw);
    else this._updateFoot(dt, input, camYaw);
    this._clampStats();
    return this;
  };

  Player.prototype._readAxis = function (input) {
    var x = 0, y = 0;
    if (!input || !input.keys) { this._axisX = 0; this._axisY = 0; return; }
    var k = input.keys;
    if (k.KeyD || k.ArrowRight) x += 1;
    if (k.KeyA || k.ArrowLeft) x -= 1;
    if (k.KeyW || k.ArrowUp) y += 1;
    if (k.KeyS || k.ArrowDown) y -= 1;
    if (x !== 0 && y !== 0) { x *= 0.70710678; y *= 0.70710678; }
    this._axisX = x;
    this._axisY = y;
  };

  Player.prototype._updateFoot = function (dt, input, camYaw) {
    var cfg = PCFG;
    this.camMode = this.aiming ? 'aim' : 'foot';
    this._readAxis(input);
    var ax = this._axisX, ay = this._axisY;
    var moving = (ax * ax + ay * ay) > 0.0001;
    var sprint = !!(input && input.sprint && input.sprint()) && !this.aiming;
    this.aiming = !!(input && input.aiming && input.aiming());
    this.sprinting = sprint;
    if (this.aiming) this.camMode = 'aim';

    var dirX = Math.sin(camYaw || 0) * ay - Math.cos(camYaw || 0) * ax;
    var dirZ = Math.cos(camYaw || 0) * ay + Math.sin(camYaw || 0) * ax;
    var dl = Math.sqrt(dirX * dirX + dirZ * dirZ);
    if (dl > 0.0001) { dirX /= dl; dirZ /= dl; }

    if (input && input.consume && input.consume('Space') && this.dodgeCooldown <= 0 && this.dodgeTime <= 0) {
      var ddx = moving ? dirX : Math.sin(this.yaw);
      var ddz = moving ? dirZ : Math.cos(this.yaw);
      this.dodgeDirX = ddx; this.dodgeDirZ = ddz;
      this.dodgeTime = cfg.dodgeTime || 0.34;
      this.dodgeCooldown = cfg.dodgeCooldown || 0.85;
    }

    var sp = this.aiming ? (cfg.aimWalkSpeed || 2.4) : sprint ? (cfg.sprintSpeed || 8) : (cfg.walkSpeed || 4.2);
    if (this.dodgeTime > 0) {
      this.dodgeTime -= dt;
      dirX = this.dodgeDirX;
      dirZ = this.dodgeDirZ;
      sp = (cfg.dodgeSpeed || 11) * clamp(this.dodgeTime / (cfg.dodgeTime || 0.34), 0.35, 1);
      moving = true;
    }

    var targetYaw = this.aiming ? (camYaw || 0) : (moving ? Math.atan2(dirX, dirZ) : this.yaw);
    var turn = wrap(targetYaw - this.yaw);
    this.yaw += clamp(turn, -1, 1) * Math.min(1, (cfg.turnSpeed || 13) * dt);

    var vx = 0, vz = 0;
    if (moving) {
      vx = dirX * sp;
      vz = dirZ * sp;
      var nx = this.pos.x + vx * dt;
      var nz = this.pos.z + vz * dt;
      if (this.world && this.world.collideCircle) {
        var res = this.world.collideCircle(nx, nz, cfg.radius || 0.45);
        nx = res.x; nz = res.z;
      }
      if (nx < -510) nx = -510;
      if (nx > 497) nx = 497;
      if (nz < -497) nz = -497;
      if (nz > 497) nz = 497;
      this.moveSpeed = sp;
      this.speed = sp;
      var dist = dist2(this.pos.x, this.pos.z, nx, nz);
      this.pos.x = nx;
      this.pos.z = nz;
      this.stepDistance += dist;
      var stride = (cfg.footstepStride || 1.85) * (sprint ? 1.18 : 1);
      if (this.stepDistance >= stride) {
        this.stepDistance = 0;
        if (typeof this.onFootstep === 'function') {
          try { this.onFootstep(this.speed, sprint ? 'run' : 'walk'); } catch (e) { /* audio hook */ }
        }
      }
    } else {
      this.moveSpeed = damp(this.moveSpeed, 0, 12, dt);
      this.speed = 0;
    }

    var gy = this.world && this.world.groundHeight ? this.world.groundHeight(this.pos.x, this.pos.z) : 0;
    this.pos.y = gy;
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.yaw;
    this.mesh.visible = true;
    this.character.setLook(0);

    var mode = 'idle';
    if (this.recoilTime > 0) mode = 'shoot';
    else if (this.aiming) mode = 'aim';
    else if (this.moveSpeed > 0.3) mode = this.moveSpeed > 4.6 ? 'run' : 'walk';
    this.character.setPose(this.time, this.moveSpeed, mode);

    var blink = this.currentWeapon && this.currentWeapon !== 'fists';
    if (this.gun) this.gun.visible = !!blink && (this.aiming || this.recoilTime > 0);

    if (input && input.mouse && input.mouse.clicked) {
      this.triggerShoot();
      if (this.autoShoot && typeof this.onShoot === 'function') {
        try { this.onShoot(this, this.currentWeapon); } catch (e) { /* combat hook */ }
      }
    }

    var near = this._nearestVehicle(cfg.enterRange || 3.2);
    if (near) this._setPrompt('E — STEAL ' + (near.def && near.def.label ? near.def.label : 'VEHICLE'));
    else this._setPrompt('');
  };

  Player.prototype._updateVehicle = function (dt, input, camYaw) {
    var v = this.vehicle;
    if (!v) return;
    this.camMode = 'vehicle';
    var ctl = this._ctl;
    ctl.throttle = 0; ctl.brake = 0; ctl.steer = 0; ctl.handbrake = false;
    if (input && input.keys) {
      var k = input.keys;
      if (k.KeyW || k.ArrowUp) ctl.throttle = 1;
      if (k.KeyS || k.ArrowDown) ctl.brake = 1;
      if (k.KeyD || k.ArrowRight) ctl.steer += 1;
      if (k.KeyA || k.ArrowLeft) ctl.steer -= 1;
      if (k.Space) ctl.handbrake = true;
    }
    v.update(dt, ctl, this.vehicles);
    this.pos.copy(v.pos);
    this.yaw = v.heading;
    this.speed = Math.abs(v.speed);
    this.moveSpeed = this.speed;
    this.aiming = false;
    this.character.setPose(this.time, 0, 'drive');
    if (this.gun) this.gun.visible = false;
    this.mesh.visible = false;
    this._setPrompt('E — EXIT VEHICLE');
  };

  Player.prototype.enter = function (vehicle) {
    if (!vehicle || vehicle.destroyed || vehicle === this.vehicle) return false;
    if (vehicle.occupiedBy && vehicle.occupiedBy !== this) {
      var occ = vehicle.occupiedBy;
      if (typeof occ.flee === 'function') occ.flee(this);
      if (occ.mesh) occ.mesh.visible = false;
    }
    if (!vehicle.enter(this)) return false;
    this.vehicle = vehicle;
    this.pos.copy(vehicle.pos);
    this.yaw = vehicle.heading;
    this.mesh.visible = false;
    this.camMode = 'vehicle';
    return true;
  };

  Player.prototype.exit = function () {
    var v = this.vehicle;
    if (!v) return false;
    var p = v.exitWorld(this._exitTmp);
    v.exit();
    this.vehicle = null;
    this.camMode = 'foot';
    var x = p.x, z = p.z;
    if (this.world && this.world.collideCircle) {
      var res = this.world.collideCircle(x, z, PCFG.radius || 0.45);
      x = res.x; z = res.z;
    }
    var gy = this.world && this.world.groundHeight ? this.world.groundHeight(x, z) : 0;
    this.pos.set(x, gy, z);
    this.yaw = v.heading;
    this.mesh.visible = true;
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.yaw;
    this.speed = 0;
    this.moveSpeed = 0;
    return true;
  };

  Player.prototype.damage = function (n, kind) {
    var amount = Math.max(0, n || 0);
    if (this.armor > 0) {
      var absorbed = Math.min(this.armor, amount * 0.72);
      this.armor = Math.max(0, this.armor - absorbed);
      amount -= absorbed;
    }
    this.health = clamp(this.health - amount, 0, this.maxHealth);
    if (this.health <= 0) {
      this.dead = true;
      this.character.setPose(this.time, 0, 'dead');
      if (this.vehicle) this.exit();
    }
    return amount;
  };

  Player.prototype.heal = function (n) {
    this.health = clamp(this.health + Math.max(0, n || 0), 0, this.maxHealth);
    if (this.health > 0) this.dead = false;
    return this.health;
  };

  Player.prototype.giveArmor = function (n) {
    this.armor = clamp(this.armor + Math.max(0, n || 0), 0, this.maxArmor);
    return this.armor;
  };

  Player.prototype.addMoney = function (n) {
    this.money = Math.max(0, Math.round(this.money + (n || 0)));
    return this.money;
  };

  Player.prototype.setWanted = function (n) {
    this.wanted = clamp(Math.round(n || 0), 0, 5);
    return this.wanted;
  };

  Player.prototype.triggerShoot = function () {
    this.recoilTime = 0.16;
    if (this.gun) this.gun.visible = this.aiming || this.recoilTime > 0;
    return this.currentWeapon;
  };

  Player.prototype.aimRay = function () {
    var origin = new THREE.Vector3(this.pos.x, this.pos.y + (PCFG.eyeHeight || 1.7) * 0.92, this.pos.z);
    var dir = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    return new THREE.Ray(origin, dir);
  };

  Player.prototype.giveWeapon = function (id, ammo) {
    var def = WCFG[id];
    if (!def) return false;
    if (!this.weapons[id]) this.weapons[id] = { owned: false, ammo: 0, reserve: 0 };
    var w = this.weapons[id];
    w.owned = true;
    if (def.kind === 'melee') { w.ammo = 0; w.reserve = 0; return true; }
    if (ammo != null) w.ammo = Math.max(0, ammo);
    else if (!w.ammo) w.ammo = def.mag || 0;
    if (w.reserve == null) w.reserve = 0;
    return true;
  };

  Player.prototype.addAmmo = function (id, n) {
    var w = this.weapons[id];
    var def = WCFG[id];
    if (!w || !def || def.kind === 'melee') return false;
    w.reserve = clamp((w.reserve || 0) + Math.max(0, n || 0), 0, 999);
    return true;
  };

  Player.prototype.buyWeapon = function (id) {
    var def = WCFG[id];
    var w = this.weapons[id];
    if (!def || def.kind === 'melee' || (w && w.owned)) return false;
    if (this.money < def.price) return false;
    this.money -= def.price;
    this.giveWeapon(id, def.mag);
    this.weapons[id].reserve = def.reserve || 0;
    return true;
  };

  Player.prototype.buyAmmo = function (id) {
    var def = WCFG[id];
    var w = this.weapons[id];
    if (!def || !w || !w.owned || def.kind === 'melee') return false;
    if (this.money < def.ammoPrice) return false;
    this.money -= def.ammoPrice;
    this.addAmmo(id, def.mag);
    return true;
  };

  Player.prototype.cycleWeapon = function (dir) {
    var step = dir < 0 ? -1 : 1;
    var order = [];
    for (var id in WCFG) {
      if (Object.prototype.hasOwnProperty.call(WCFG, id)) order.push(id);
    }
    order.sort(function (a, b) { return (WCFG[a].slot || 0) - (WCFG[b].slot || 0); });
    var idx = order.indexOf(this.currentWeapon);
    for (var i = 0; i < order.length; i++) {
      idx = (idx + step + order.length) % order.length;
      var wid = order[idx];
      if (this.weapons[wid] && this.weapons[wid].owned) {
        this.currentWeapon = wid;
        if (this.gun) this.gun.visible = false;
        return this.currentWeapon;
      }
    }
    return this.currentWeapon;
  };

  Player.prototype.setVisible = function (v) {
    this.mesh.visible = !!v && !this.vehicle;
  };

  Player.prototype.syncPreview = function () {
    var p = this.preview;
    this._clampStats();
    if (!p) return;
    if (p.pos && p.pos.copy) p.pos.copy(this.pos);
    p.yaw = this.yaw;
    p.health = this.health;
    p.armor = this.armor;
    p.money = this.money;
    p.wanted = this.wanted;
    p.vehicle = this.vehicle;
    p.speed = this.vehicle ? Math.abs(this.vehicle.speed || 0) : this.speed;
    p.currentWeapon = this.currentWeapon;
    p.weapons = this.weapons;
  };

  Player.prototype.reset = function (x, z, yaw) {
    if (this.vehicle) this.exit();
    var px = x == null ? this.pos.x : x;
    var pz = z == null ? this.pos.z : z;
    var gy = this.world && this.world.groundHeight ? this.world.groundHeight(px, pz) : 0;
    this.pos.set(px, gy, pz);
    this.yaw = typeof yaw === 'number' ? yaw : this.yaw;
    this.health = this.maxHealth;
    this.armor = 0;
    this.money = PCFG.startMoney || 500;
    this.wanted = 0;
    this.weapons = freshWeapons();
    this.currentWeapon = WCFG[PCFG.startWeapon] ? PCFG.startWeapon : 'pistol';
    this.dead = false;
    this.speed = 0;
    this.moveSpeed = 0;
    this.dodgeTime = 0;
    this.dodgeCooldown = 0;
    this.character.setPose(this.time, 0, 'idle');
    this.mesh.visible = true;
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.yaw;
    this.syncPreview();
    return this;
  };

  Player.prototype.dispose = function () {
    if (this.mesh.parent) this.mesh.parent.remove(this.mesh);
    this.character.dispose();
    if (this.gun && this.gun.geometry) this.gun.geometry.dispose();
  };

  LH.buildCharacter = buildCharacter;
  LH.Ped = Ped;
  LH.Vehicle = Vehicle;
  LH.Player = Player;
}());
