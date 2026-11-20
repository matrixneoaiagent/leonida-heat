/* LEONIDA HEAT 3D — Costa Sol world.
   Builds the 1000 x 1000 m city on LH.CONFIG.WORLD: procedural top-down ground
   texture, raised blocks and kerbs, instanced buildings with canvas facades,
   palms, street furniture, parks, estate, marina, pier, ocean swell, colliders,
   a lane road graph and a pre-rendered minimap. No external assets. */
(function () {
  'use strict';

  window.LH = window.LH || {};

  var CFG = (window.LH.CONFIG && window.LH.CONFIG.WORLD) || {};
  var PAL = (window.LH.CONFIG && window.LH.CONFIG.PALETTE) || {};
  var TAU = Math.PI * 2;
  var HALF = CFG.half || 500;
  var ROAD_HALF = CFG.roadHalfWidth || 8;
  var SIDEWALK = CFG.sidewalkWidth || 4;
  var BLOCK = CFG.blockSize || 84;
  var LOT = CFG.lotSize || 76;
  var ROAD_X = CFG.roadsX || [-400, -300, -200, -100, 0, 100, 200, 300, 400];
  var ROAD_Z = CFG.roadsZ || [-400, -300, -200, -100, 0, 100, 200, 300, 400];
  var BEACH_X = CFG.beachX || -460;
  var PIER_Z = 300;

  var C = {
    asphalt: '#2b2e33',
    asphaltEdge: '#24272b',
    sidewalk: '#b9ad98',
    sidewalkDark: '#a29783',
    lot: '#877e70',
    park: '#5b8f5a',
    plaza: '#c6b79c',
    estate: '#4f7a4a',
    water: '#0b4f5c',
    waterDeep: '#062c38',
    sand: '#e8d6ae',
    sandDark: '#c9b184',
    wood: '#7b5f3e',
    white: '#f4f1e8'
  };

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function norm(y) { return ((y + Math.PI) % TAU + TAU) % TAU - Math.PI; }
  function keyOf(cx, cz) { return (cx | 0) + ',' + (cz | 0); }

  function rgba(hex, alpha) {
    var h = String(hex || '#000').replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    if (!isFinite(n)) n = 0;
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + alpha + ')';
  }

  function makeCanvas(w, h) {
    var c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }

  function seeded(seed) {
    var r = window.LH.RNG ? window.LH.RNG(seed) : null;
    if (r) return function () { return r.next(); };
    return Math.random;
  }

  function canvasTexture(canvas, opts) {
    opts = opts || {};
    var t = new THREE.CanvasTexture(canvas);
    if (THREE.sRGBEncoding) t.encoding = THREE.sRGBEncoding;
    t.wrapS = opts.clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
    t.wrapT = opts.clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
    if (opts.repeat) t.repeat.set(opts.repeat[0], opts.repeat[1]);
    t.anisotropy = 4;
    t.needsUpdate = true;
    return t;
  }

  /* ============================ FACADE TEXTURES =========================== */

  var FACADES = [
    { key: 'coral', wall: '#de8770', trim: '#f7e7cf', frame: '#7d443c', glass: '#24414c', awning: '#1a7f78', floors: 4, cols: 5, lit: 0.2, shop: true },
    { key: 'cream', wall: '#efdfc2', trim: '#fff8e8', frame: '#8b7355', glass: '#2b4d57', awning: '#c94a43', floors: 4, cols: 6, lit: 0.18, shop: true },
    { key: 'deco', wall: '#f0c5a1', trim: '#fff6e8', frame: '#8f5f55', glass: '#224451', awning: '#b23b63', floors: 7, cols: 6, lit: 0.24, shop: true, deco: true },
    { key: 'tower', wall: '#244851', trim: '#9fc9c4', frame: '#1d3a45', glass: '#173a4a', awning: '#28e0d0', floors: 16, cols: 9, lit: 0.3, shop: false, tower: true },
    { key: 'brick', wall: '#b9815f', trim: '#e8d8bd', frame: '#6c4a37', glass: '#2b3d3f', awning: '#f3c969', floors: 3, cols: 5, lit: 0.16, shop: true },
    { key: 'white', wall: '#e8eee6', trim: '#ffffff', frame: '#8b9a94', glass: '#2a515c', awning: '#2f7fa0', floors: 4, cols: 5, lit: 0.2, shop: true }
  ];

  function makeFacade(def) {
    var S = 512;
    var canvas = makeCanvas(S, S);
    var g = canvas.getContext('2d');
    var glow = makeCanvas(S, S);
    var gg = glow.getContext('2d');
    var rand = seeded('facade-' + def.key);

    g.fillStyle = def.wall;
    g.fillRect(0, 0, S, S);
    gg.fillStyle = '#000';
    gg.fillRect(0, 0, S, S);

    for (var n = 0; n < 1500; n++) {
      var a = rand() * 0.055;
      g.fillStyle = rand() < 0.55 ? 'rgba(255,255,255,' + a.toFixed(3) + ')' : 'rgba(0,0,0,' + (a * 0.7).toFixed(3) + ')';
      g.fillRect(rand() * S, rand() * S, 2 + rand() * 11, 1 + rand() * 2);
    }

    var shopH = def.shop ? 94 : 0;
    var top = 22;
    var usable = S - shopH - top - 10;
    var floorH = usable / def.floors;
    var margin = 28;
    var cellW = (S - margin * 2) / def.cols;

    g.fillStyle = def.trim;
    g.fillRect(0, 0, S, 10);
    g.fillRect(0, 10, S, 4);
    g.fillStyle = rgba(def.frame, 0.22);
    g.fillRect(0, 14, S, 8);

    if (def.deco) {
      for (var d = 0; d < def.cols + 1; d++) {
        var dx = margin + d * cellW;
        g.fillStyle = rgba(def.trim, 0.5);
        g.fillRect(dx - 2, 18, 4, S - shopH - 26);
      }
    }
    if (def.tower) {
      g.fillStyle = rgba(def.trim, 0.16);
      for (var tf = 0; tf <= def.floors; tf++) {
        g.fillRect(0, top + tf * floorH, S, Math.max(1, floorH * 0.11));
      }
    }

    for (var f = 0; f < def.floors; f++) {
      var fy = top + f * floorH;
      g.fillStyle = rgba(def.trim, 0.42);
      g.fillRect(0, fy + floorH - 3, S, 3);
      for (var c = 0; c < def.cols; c++) {
        var wx = margin + c * cellW + cellW * 0.22;
        var wy = fy + floorH * 0.34;
        var ww = cellW * 0.56;
        var wh = floorH * 0.48;
        if (wh < 3) wh = 3;
        g.fillStyle = def.frame;
        g.fillRect(wx - 2, wy - 2, ww + 4, wh + 4);
        var grd = g.createLinearGradient(wx, wy, wx + ww, wy + wh);
        var lit = rand() < def.lit;
        if (lit) {
          grd.addColorStop(0, '#ffd79a');
          grd.addColorStop(0.55, '#ffbd72');
          grd.addColorStop(1, '#d88b4d');
        } else {
          grd.addColorStop(0, '#7fa2a6');
          grd.addColorStop(0.35, def.glass);
          grd.addColorStop(1, '#122c35');
        }
        g.fillStyle = grd;
        g.fillRect(wx, wy, ww, wh);
        if (lit) {
          gg.fillStyle = rand() < 0.6 ? '#ffd08a' : '#ffedc0';
          gg.fillRect(wx, wy, ww, wh);
        }
        g.fillStyle = rgba(def.frame, 0.7);
        g.fillRect(wx + ww * 0.5, wy, 1, wh);
        g.fillStyle = def.trim;
        g.fillRect(wx - 4, wy + wh + 2, ww + 8, 2);
        if (def.tower) {
          g.fillStyle = rgba('#bfe6df', 0.52);
          g.fillRect(wx + ww * 0.18, wy, 2, wh);
        }
        if (def.deco && rand() < 0.35) {
          gg.fillStyle = rgba('#ff7ac0', 0.16);
          gg.fillRect(wx, wy, ww, wh);
        }
      }
    }

    if (def.shop) {
      var sy = S - shopH;
      g.fillStyle = rgba(def.trim, 0.9);
      g.fillRect(0, sy - 5, S, 5);
      g.fillStyle = '#1b2326';
      g.fillRect(0, sy - 34, S, 28);
      var bx = 14;
      while (bx < S - 20) {
        var bw = 34 + rand() * 62;
        g.fillStyle = rand() < 0.5 ? def.awning : rgba(def.trim, 0.82);
        g.fillRect(bx, sy - 31, bw, 20);
        g.fillStyle = 'rgba(20,25,28,0.78)';
        for (var b = 0; b < 4; b++) g.fillRect(bx + 6 + b * (bw / 5), sy - 26, bw / 10, 3);
        bx += bw + 10;
      }
      for (var st = 0; st < 22; st++) {
        g.fillStyle = st % 2 === 0 ? def.awning : 'rgba(245,240,228,0.82)';
        g.fillRect(st * (S / 22), sy - 2, S / 22, 18);
      }
      var glass = g.createLinearGradient(0, sy + 16, 0, S);
      glass.addColorStop(0, '#6f949a');
      glass.addColorStop(0.25, '#284a53');
      glass.addColorStop(1, '#142d35');
      g.fillStyle = glass;
      g.fillRect(0, sy + 16, S, shopH - 16);
      g.fillStyle = 'rgba(15,30,34,0.85)';
      for (var m = 0; m < 8; m++) g.fillRect(m * (S / 8), sy + 16, 4, shopH - 16);
      g.fillStyle = rgba(def.trim, 0.75);
      g.fillRect(0, S - 6, S, 6);
      gg.fillStyle = rgba('#ffc978', 0.32);
      gg.fillRect(0, sy + 18, S, 12);
    }

    if (def.deco) {
      g.fillStyle = '#ff5db1';
      g.fillRect(0, S - shopH - 12, S, 4);
      g.fillStyle = '#f7e7cf';
      g.fillRect(0, S - shopH - 18, S, 2);
      gg.fillStyle = '#ff5db1';
      gg.fillRect(0, S - shopH - 12, S, 4);
    }
    if (def.tower) {
      g.fillStyle = rgba('#9fc9c4', 0.28);
      g.fillRect(0, S - 10, S, 10);
    }

    return {
      map: canvasTexture(canvas, { clamp: true }),
      glow: canvasTexture(glow, { clamp: true })
    };
  }

  function makeNoiseTexture(base, dark, light, size, lines) {
    var c = makeCanvas(size, size);
    var g = c.getContext('2d');
    var rand = seeded('noise-' + base);
    g.fillStyle = base;
    g.fillRect(0, 0, size, size);
    for (var i = 0; i < size * 7; i++) {
      g.fillStyle = rand() < 0.5 ? rgba(dark, 0.1 + rand() * 0.12) : rgba(light, 0.06 + rand() * 0.1);
      g.fillRect(rand() * size, rand() * size, 1 + rand() * 4, 1 + rand() * 3);
    }
    if (lines) {
      g.strokeStyle = rgba(dark, 0.2);
      g.lineWidth = 1;
      for (var y = 0; y <= size; y += size / 8) {
        g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(size, y + 0.5); g.stroke();
      }
      for (var x = 0; x <= size; x += size / 4) {
        g.beginPath(); g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, size); g.stroke();
      }
    }
    return c;
  }

  function makeSignCanvas(title, subtitle, opts) {
    opts = opts || {};
    var W = opts.width || 512;
    var H = opts.height || 256;
    var c = makeCanvas(W, H);
    var g = c.getContext('2d');
    var bg = g.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, opts.bg || '#0d1a20');
    bg.addColorStop(1, opts.bg2 || '#071015');
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);

    g.strokeStyle = opts.accent || '#28e0d0';
    g.lineWidth = 6;
    g.strokeRect(8, 8, W - 16, H - 16);
    g.strokeStyle = 'rgba(255,255,255,0.16)';
    g.lineWidth = 2;
    g.strokeRect(18, 18, W - 36, H - 36);

    for (var i = 0; i < 18; i++) {
      g.fillStyle = rgba(opts.accent || '#28e0d0', 0.08);
      g.fillRect(0, 26 + i * 12, W, 1);
    }
    g.fillStyle = opts.accent || '#28e0d0';
    g.fillRect(22, 22, 8, H - 44);
    g.fillStyle = rgba(opts.accent || '#28e0d0', 0.18);
    g.fillRect(W - 66, 22, 44, H - 44);

    var titleSize = opts.titleSize || Math.min(84, 560 / Math.max(4, String(title).length));
    g.font = '900 ' + titleSize + 'px Impact, "Arial Narrow", Arial, sans-serif';
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    g.fillStyle = 'rgba(0,0,0,0.55)';
    g.fillText(String(title), 40, H * 0.43 + 4);
    g.fillStyle = opts.fg || '#f7ecd6';
    g.fillText(String(title), 36, H * 0.43);
    if (subtitle) {
      g.font = '700 ' + (opts.subSize || 24) + 'px "Arial Narrow", Arial, sans-serif';
      g.fillStyle = opts.sub || '#8fd3e8';
      g.fillText(String(subtitle), 40, H * 0.72);
    }
    g.fillStyle = rgba('#ffffff', 0.5);
    g.fillRect(40, H * 0.83, W * 0.32, 2);
    g.font = '700 16px Consolas, monospace';
    g.fillStyle = 'rgba(247,236,214,0.55)';
    g.fillText(opts.footer || 'COSTA SOL · LEONIDA', 40, H * 0.9);
    return c;
  }

  function makeAdCanvas(kind) {
    var W = 640;
    var H = 320;
    var c = makeCanvas(W, H);
    var g = c.getContext('2d');
    var rand = seeded('ad-' + kind);

    if (kind === 'serata') {
      var sky = g.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, '#12242e');
      sky.addColorStop(0.55, '#4a2734');
      sky.addColorStop(1, '#120f16');
      g.fillStyle = sky;
      g.fillRect(0, 0, W, H);
      g.fillStyle = '#ff6f61';
      g.beginPath(); g.arc(W * 0.74, H * 0.32, 56, 0, TAU); g.fill();
      g.fillStyle = '#ff2d95';
      g.fillRect(0, H * 0.58, W, 5);
      // stylised car
      g.fillStyle = '#f4efe2';
      g.beginPath();
      g.moveTo(120, 246); g.lineTo(160, 206); g.lineTo(280, 196); g.lineTo(360, 214);
      g.lineTo(430, 216); g.lineTo(474, 244); g.closePath(); g.fill();
      g.fillStyle = '#1b3d4a';
      g.beginPath(); g.moveTo(172, 208); g.lineTo(272, 202); g.lineTo(318, 218); g.lineTo(168, 220); g.closePath(); g.fill();
      g.fillStyle = '#121418';
      g.beginPath(); g.arc(186, 250, 26, 0, TAU); g.fill();
      g.beginPath(); g.arc(410, 250, 26, 0, TAU); g.fill();
      g.fillStyle = '#f3c969';
      g.fillRect(462, 226, 16, 8);
      g.font = '900 90px Impact, "Arial Narrow", Arial, sans-serif';
      g.fillStyle = '#f7ecd6';
      g.fillText('SERATA', 34, 110);
      g.font = '900 48px Impact, "Arial Narrow", Arial, sans-serif';
      g.fillStyle = '#ff6f61';
      g.fillText('GT', 350, 108);
      g.font = '700 20px "Arial Narrow", Arial, sans-serif';
      g.fillStyle = '#8fd3e8';
      g.fillText('0–100 IN 3.9 · FEEL THE HEAT', 36, 148);
      g.fillStyle = 'rgba(255,255,255,0.2)';
      g.fillRect(34, 160, 240, 2);
    } else if (kind === 'tourism') {
      var sun = g.createRadialGradient(W * 0.5, H * 0.58, 10, W * 0.5, H * 0.58, 210);
      sun.addColorStop(0, '#ffcf87');
      sun.addColorStop(0.4, '#ff8a63');
      sun.addColorStop(1, '#7e2c55');
      g.fillStyle = sun;
      g.fillRect(0, 0, W, H);
      g.fillStyle = '#0b4f5c';
      g.beginPath(); g.moveTo(0, H); g.lineTo(0, 214); g.lineTo(W, 176); g.lineTo(W, H); g.closePath(); g.fill();
      g.fillStyle = 'rgba(40,224,208,0.35)';
      for (var w = 0; w < 8; w++) g.fillRect(0, 214 + w * 12, W, 2);
      g.fillStyle = '#10242a';
      for (var p = 0; p < 5; p++) {
        var px = 66 + p * 118;
        g.fillRect(px, 150, 7, 92);
        for (var f = 0; f < 5; f++) {
          g.save();
          g.translate(px + 3, 150);
          g.rotate(-0.9 + f * 0.44);
          g.beginPath(); g.ellipse(34, 0, 42, 7, 0, 0, TAU); g.fill();
          g.restore();
        }
      }
      g.font = '900 88px Impact, "Arial Narrow", Arial, sans-serif';
      g.fillStyle = '#f7ecd6';
      g.fillText('COSTA', 32, 86);
      g.fillStyle = '#12242a';
      g.fillText('SOL', 32, 164);
      g.font = '700 22px "Arial Narrow", Arial, sans-serif';
      g.fillStyle = '#f7ecd6';
      g.fillText('STAY ANOTHER NIGHT', 36, 202);
      g.fillStyle = '#f3c969';
      g.fillRect(34, 214, 200, 4);
    } else {
      g.fillStyle = '#0a0f14';
      g.fillRect(0, 0, W, H);
      for (var t = 0; t < 26; t++) {
        var bw2 = 22 + rand() * 46;
        var bh = 40 + rand() * 190;
        var bx2 = 34 + t * 22;
        g.fillStyle = t % 3 === 0 ? '#1c343d' : '#14262d';
        g.fillRect(bx2, H - 34 - bh, bw2, bh);
        g.fillStyle = 'rgba(243,201,105,' + (0.18 + rand() * 0.5) + ')';
        for (var wy = H - 40 - bh; wy < H - 46; wy += 13) g.fillRect(bx2 + 4, wy, bw2 - 8, 3);
      }
      g.fillStyle = '#071015';
      g.fillRect(0, H - 40, W, 40);
      g.font = '900 92px Impact, "Arial Narrow", Arial, sans-serif';
      g.fillStyle = '#f3c969';
      g.fillText('CROWE', 32, 92);
      g.font = '900 44px Impact, "Arial Narrow", Arial, sans-serif';
      g.fillStyle = '#f7ecd6';
      g.fillText('TOWERS', 34, 144);
      g.font = '700 20px "Arial Narrow", Arial, sans-serif';
      g.fillStyle = '#8fd3e8';
      g.fillText('OWN THE SKYLINE · 555-CROWE', 36, 180);
      g.fillStyle = '#ff2d95';
      g.fillRect(34, 194, 260, 4);
    }
    g.strokeStyle = 'rgba(255,255,255,0.18)';
    g.lineWidth = 4;
    g.strokeRect(5, 5, W - 10, H - 10);
    return c;
  }

  function makeSignalCanvas() {
    var c = makeCanvas(64, 160);
    var g = c.getContext('2d');
    g.fillStyle = '#171c1f';
    g.fillRect(0, 0, 64, 160);
    g.strokeStyle = '#3a4145';
    g.lineWidth = 4;
    g.strokeRect(3, 3, 58, 154);
    var cols = ['#ff4d55', '#f3c969', '#63e6a4'];
    for (var i = 0; i < 3; i++) {
      g.fillStyle = cols[i];
      g.beginPath();
      g.arc(32, 30 + i * 50, 17, 0, TAU);
      g.fill();
      var gr = g.createRadialGradient(32, 30 + i * 50, 3, 32, 30 + i * 50, 17);
      gr.addColorStop(0, 'rgba(255,255,255,0.7)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.beginPath();
      g.arc(32, 30 + i * 50, 17, 0, TAU);
      g.fill();
    }
    return c;
  }

  function makeHelipadCanvas() {
    var c = makeCanvas(256, 256);
    var g = c.getContext('2d');
    g.clearRect(0, 0, 256, 256);
    g.fillStyle = '#4a4d50';
    g.beginPath(); g.arc(128, 128, 122, 0, TAU); g.fill();
    g.strokeStyle = '#f3c969';
    g.lineWidth = 8;
    g.beginPath(); g.arc(128, 128, 108, 0, TAU); g.stroke();
    g.fillStyle = '#f3c969';
    g.font = '900 124px Impact, Arial Black, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('H', 128, 136);
    return c;
  }

  function makeSunCanvas() {
    var c = makeCanvas(256, 256);
    var g = c.getContext('2d');
    var gr = g.createRadialGradient(128, 128, 8, 128, 128, 126);
    gr.addColorStop(0, 'rgba(255,246,220,1)');
    gr.addColorStop(0.22, 'rgba(255,214,150,0.95)');
    gr.addColorStop(0.52, 'rgba(255,150,96,0.42)');
    gr.addColorStop(1, 'rgba(255,110,80,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 256, 256);
    return c;
  }

  function makeParkCanvas(kind) {
    var S = 512;
    var c = makeCanvas(S, S);
    var g = c.getContext('2d');
    var rand = seeded('park-' + kind);
    g.fillStyle = '#588a55';
    g.fillRect(0, 0, S, S);
    for (var i = 0; i < 5200; i++) {
      g.fillStyle = rand() < 0.5 ? 'rgba(38,78,44,0.28)' : 'rgba(130,172,102,0.22)';
      g.fillRect(rand() * S, rand() * S, 2 + rand() * 9, 1 + rand() * 4);
    }
    // winding path
    g.strokeStyle = '#cbbd9e';
    g.lineWidth = 32;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(54, 436);
    g.bezierCurveTo(150, 340, 180, 240, 250, 180);
    g.bezierCurveTo(330, 114, 392, 160, 464, 78);
    g.stroke();
    g.strokeStyle = '#b8a98b';
    g.lineWidth = 24;
    g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.2)';
    g.lineWidth = 2;
    g.stroke();

    if (kind === 0) {
      g.fillStyle = '#2f6c6f';
      g.beginPath(); g.ellipse(330, 330, 92, 60, -0.24, 0, TAU); g.fill();
      g.strokeStyle = '#d8cba8';
      g.lineWidth = 8;
      g.stroke();
      g.fillStyle = 'rgba(120,220,215,0.28)';
      g.beginPath(); g.ellipse(314, 316, 58, 26, -0.2, 0, TAU); g.fill();
    } else {
      g.fillStyle = '#8bb06f';
      g.beginPath(); g.arc(128, 128, 54, 0, TAU); g.fill();
      g.fillStyle = '#f3c969';
      g.beginPath(); g.arc(128, 128, 34, 0, TAU); g.fill();
      g.fillStyle = '#c94a43';
      for (var f = 0; f < 24; f++) {
        var a = f / 24 * TAU;
        g.beginPath(); g.arc(128 + Math.cos(a) * 44, 128 + Math.sin(a) * 44, 5, 0, TAU); g.fill();
      }
      g.fillStyle = '#cbbd9e';
      g.fillRect(300, 300, 120, 90);
      g.strokeStyle = '#9f9278';
      g.lineWidth = 3;
      for (var l = 0; l < 5; l++) {
        g.beginPath(); g.moveTo(308, 312 + l * 18); g.lineTo(412, 312 + l * 18); g.stroke();
      }
    }
    g.fillStyle = 'rgba(30,60,35,0.22)';
    for (var d = 0; d < 16; d++) {
      g.beginPath(); g.arc(rand() * S, rand() * S, 6 + rand() * 18, 0, TAU); g.fill();
    }
    g.strokeStyle = 'rgba(240,228,200,0.32)';
    g.lineWidth = 3;
    g.strokeRect(4, 4, S - 8, S - 8);
    return c;
  }

  function makePlazaCanvas(kind) {
    var S = 512;
    var c = makeCanvas(S, S);
    var g = c.getContext('2d');
    var rand = seeded('plaza-floor-' + kind);
    var promenade = kind === 'promenade';
    var tiles = promenade ? 28 : 20;
    g.fillStyle = '#bdae93';
    g.fillRect(0, 0, S, S);
    var tile = S / tiles;
    for (var y = 0; y < tiles; y++) {
      for (var x = 0; x < tiles; x++) {
        g.fillStyle = (x + y) % 2 === 0 ? '#cbbda3' : '#b2a288';
        g.fillRect(x * tile, y * tile, tile, tile);
      }
    }
    g.strokeStyle = 'rgba(120,106,86,0.28)';
    g.lineWidth = 1;
    for (var i = 0; i <= tiles; i++) {
      g.beginPath(); g.moveTo(i * tile, 0); g.lineTo(i * tile, S); g.stroke();
      g.beginPath(); g.moveTo(0, i * tile); g.lineTo(S, i * tile); g.stroke();
    }
    if (promenade) {
      g.fillStyle = '#c9bda5';
      g.fillRect(S * 0.39, 0, S * 0.22, S);
      g.strokeStyle = 'rgba(110,96,74,0.4)';
      g.lineWidth = 4;
      g.beginPath(); g.moveTo(S * 0.39, 0); g.lineTo(S * 0.39, S); g.stroke();
      g.beginPath(); g.moveTo(S * 0.61, 0); g.lineTo(S * 0.61, S); g.stroke();
      g.fillStyle = '#6f8d5a';
      for (var b = 0; b < 4; b++) {
        g.fillRect(S * 0.08, S * (0.12 + b * 0.21), S * 0.2, S * 0.085);
        g.fillRect(S * 0.72, S * (0.12 + b * 0.21), S * 0.2, S * 0.085);
      }
      g.strokeStyle = 'rgba(250,245,230,0.35)';
      g.lineWidth = 2;
      g.strokeRect(S * 0.08, S * 0.08, S * 0.84, S * 0.84);
    } else {
      g.strokeStyle = '#8f7f64';
      g.lineWidth = 12;
      g.beginPath(); g.arc(S / 2, S / 2, 142, 0, TAU); g.stroke();
      g.strokeStyle = '#a99879';
      g.lineWidth = 4;
      g.beginPath(); g.arc(S / 2, S / 2, 172, 0, TAU); g.stroke();
      for (var k = 0; k < 8; k++) {
        var a = k / 8 * TAU;
        g.strokeStyle = 'rgba(143,127,100,0.4)';
        g.lineWidth = 10;
        g.beginPath();
        g.moveTo(S / 2 + Math.cos(a) * 180, S / 2 + Math.sin(a) * 180);
        g.lineTo(S / 2 + Math.cos(a) * 236, S / 2 + Math.sin(a) * 236);
        g.stroke();
      }
      g.fillStyle = '#6f8d5a';
      for (var p = 0; p < 4; p++) {
        g.fillRect(52 + p * 118, 52, 62, 34);
        g.fillRect(52 + p * 118, S - 86, 62, 34);
      }
    }
    for (var n = 0; n < 1200; n++) {
      g.fillStyle = rand() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(80,60,40,0.05)';
      g.fillRect(rand() * S, rand() * S, 2, 2);
    }
    return c;
  }

  function makeEstateCanvas() {
    var S = 512;
    var c = makeCanvas(S, S);
    var g = c.getContext('2d');
    var rand = seeded('estate-lawn');
    g.fillStyle = '#507c4a';
    g.fillRect(0, 0, S, S);
    for (var i = 0; i < 5000; i++) {
      g.fillStyle = rand() < 0.5 ? 'rgba(35,70,42,0.3)' : 'rgba(128,170,106,0.22)';
      g.fillRect(rand() * S, rand() * S, 2 + rand() * 8, 1 + rand() * 3);
    }
    g.fillStyle = '#cbbd9e';
    g.fillRect(200, 400, 112, 112);
    g.fillRect(240, 150, 32, 260);
    g.fillStyle = '#b6a78a';
    g.fillRect(205, 405, 102, 102);
    g.strokeStyle = 'rgba(255,255,255,0.22)';
    g.lineWidth = 2;
    for (var l = 0; l < 6; l++) {
      g.beginPath(); g.moveTo(210, 414 + l * 16); g.lineTo(302, 414 + l * 16); g.stroke();
    }
    // pool
    g.fillStyle = '#2a7f86';
    g.fillRect(312, 330, 116, 54);
    g.strokeStyle = '#e3d8bb';
    g.lineWidth = 7;
    g.strokeRect(312, 330, 116, 54);
    g.fillStyle = 'rgba(160,240,236,0.28)';
    for (var p = 0; p < 5; p++) g.fillRect(320, 338 + p * 9, 98, 2);
    g.strokeStyle = '#8f7f64';
    g.lineWidth = 8;
    g.strokeRect(12, 12, S - 24, S - 24);
    return c;
  }

  /* ================================ WORLD ================================ */

  function World(scene, rng) {
    this.scene = scene || null;
    this.rng = rng || (window.LH.RNG ? window.LH.RNG('costa-sol-world') : null);
    this.group = new THREE.Group();
    this.group.name = 'costa-sol';

    this.buildings = [];
    this.props = [];
    this.colliders = [];
    this.blocks = [];
    this.palms = [];
    this._batches = {};
    this._roofs = [];
    this._parapets = [];
    this._roofBoxes = [];
    this._tanks = [];
    this._antennas = [];
    this._awnings = [];
    this._neonStrips = [];
    this._lampSpots = [];
    this._lampArms = [];
    this._palmFronds = [];
    this._walls = [];
    this._parkLamps = [];
    this._windowMats = [];
    this._signMats = [];

    this._time = 0;
    this._night = 0.4;
    this._nightTarget = 0.4;
    this._fogNight = new THREE.Color(0x241d33).convertSRGBToLinear();
    this._bgNight = new THREE.Color(0x171e2e).convertSRGBToLinear();
    this._fogTmp = new THREE.Color();
    this._bgTmp = new THREE.Color();
    this._waterDeepDay = new THREE.Color(0x073846);
    this._waterDeepNight = new THREE.Color(0x03141f);
    this._waterShallowDay = new THREE.Color(0x1a9096);
    this._waterShallowNight = new THREE.Color(0x0a4450);
    this._sunWarm = new THREE.Color(0xffd9a0);
    this._sunCool = new THREE.Color(0xbcd8ff);

    this._palmUniform = { value: 0 };
    this._mat4 = new THREE.Matrix4();
    this._quat = new THREE.Quaternion();
    this._euler = new THREE.Euler();
    this._vec3 = new THREE.Vector3();
    this._scale3 = new THREE.Vector3();
    this._color = new THREE.Color();
    this._poseTmp = { x: 0, z: 0, heading: 0 };

    var points = CFG.points || {};
    this.points = points;
    var spawnCfg = points.spawn || { x: -382, z: 218 };
    this.spawn = { x: spawnCfg.x - 8, z: spawnCfg.z, yaw: 0.05 };
    this.policeStation = points.policeStation || { x: 250, z: 250, label: 'POLICE STATION' };
    this.hospital = points.hospital || { x: -250, z: 250, label: 'HOSPITAL' };
    this.garage = points.garage || { x: 150, z: -50, label: 'DEZ GARAGE' };
    this.beachX = BEACH_X;
    this.waterX = CFG.waterX || -520;
    this.roads = { x: ROAD_X.slice(), z: ROAD_Z.slice(), halfWidth: ROAD_HALF, sidewalk: SIDEWALK };
    this.missionPoints = {};
    this._keepClear = [];
    for (var pk in points) {
      if (!Object.prototype.hasOwnProperty.call(points, pk)) continue;
      var pp = points[pk];
      this.missionPoints[pk] = { x: pp.x, z: pp.z, label: pp.label || pk.toUpperCase() };
      this._keepClear.push({ x: pp.x, z: pp.z, r: 4.5 });
    }

    this._makeMaterials();
    this._planBlocks();
    this._buildCityTexture();
    this._buildGround();
    this._buildOcean();
    this._buildBlockSurfaces();
    this._buildRoadDetails();
    this._buildBuildings();
    this._buildOceanHotels();
    this._buildCivicBuildings();
    this._buildEstate();
    this._buildMarina();
    this._buildPier();
    this._flushBuildingBatches();
    this._buildParks();
    this._buildPalms();
    this._buildStreetProps();
    this._buildBeach();
    this._buildBillboards();
    this._buildGantries();
    this._buildPointSigns();
    this._buildSunSprite();
    this._buildRoadGraph();
    this._buildMinimap();
    this.colliders = this.buildings.concat(this.props);
    this.setNight(0.4);
  }

  /* ------------------------------- materials ------------------------------ */

  World.prototype._makeMaterials = function () {
    var mats = {};
    this._facadeDefs = {};
    for (var i = 0; i < FACADES.length; i++) {
      var def = FACADES[i];
      var texs = makeFacade(def);
      var mat = new THREE.MeshStandardMaterial({
        map: texs.map,
        emissiveMap: texs.glow,
        emissive: 0xffb570,
        emissiveIntensity: 0,
        roughness: 0.88,
        metalness: 0.025
      });
      this._windowMats.push(mat);
      mats[def.key] = mat;
      this._facadeDefs[def.key] = def;
      this._batches[def.key] = { list: [], material: mat };
    }

    this._tex = {
      sidewalk: canvasTexture(makeNoiseTexture('#b7ab96', '#8b7f6d', '#d8cdb8', 256, true), { repeat: [18, 18] }),
      lot: canvasTexture(makeNoiseTexture('#9a907e', '#72695b', '#b8ae9c', 256), { repeat: [4, 4] }),
      grass: canvasTexture(makeNoiseTexture('#578a54', '#355e3a', '#7fae6a', 256), { repeat: [3, 3] }),
      sand: canvasTexture(makeNoiseTexture('#ddc79b', '#b79f70', '#f0e2c2', 256), { repeat: [6, 42] }),
      wood: canvasTexture(makeNoiseTexture('#8a6a44', '#5f4529', '#b08c5e', 256), { repeat: [2, 18] }),
      plank: canvasTexture(makeNoiseTexture('#93714a', '#63472c', '#b99468', 256, true), { repeat: [3, 10] }),
      parkA: canvasTexture(makeParkCanvas(0), { clamp: true }),
      parkB: canvasTexture(makeParkCanvas(1), { clamp: true }),
      plaza: canvasTexture(makePlazaCanvas('plaza'), { clamp: true }),
      promenade: canvasTexture(makePlazaCanvas('promenade'), { clamp: true }),
      estate: canvasTexture(makeEstateCanvas(), { clamp: true }),
      helipad: canvasTexture(makeHelipadCanvas(), { clamp: true }),
      signal: canvasTexture(makeSignalCanvas(), { clamp: true }),
      sun: canvasTexture(makeSunCanvas(), { clamp: true })
    };

    mats.sidewalk = new THREE.MeshStandardMaterial({ map: this._tex.sidewalk, roughness: 0.96, metalness: 0.01 });
    mats.lot = new THREE.MeshStandardMaterial({ map: this._tex.lot, color: 0xffffff, roughness: 0.95, metalness: 0.01 });
    mats.concrete = new THREE.MeshStandardMaterial({ color: 0xc2b6a1, roughness: 0.92 });
    mats.trim = new THREE.MeshStandardMaterial({ color: 0xe5d9c2, roughness: 0.9 });
    mats.roof = new THREE.MeshStandardMaterial({ color: 0x5e554a, roughness: 0.96 });
    mats.dark = new THREE.MeshStandardMaterial({ color: 0x22282c, roughness: 0.88 });
    mats.metal = new THREE.MeshStandardMaterial({ color: 0x59656a, roughness: 0.55, metalness: 0.45 });
    mats.tank = new THREE.MeshStandardMaterial({ color: 0x6b5a48, roughness: 0.85 });
    mats.trunk = new THREE.MeshStandardMaterial({ color: 0x8a6a48, roughness: 0.96 });
    mats.leaf = new THREE.MeshStandardMaterial({ color: 0x2f6b45, roughness: 0.88, side: THREE.DoubleSide });
    mats.benchWood = new THREE.MeshStandardMaterial({ color: 0x8a5f3b, roughness: 0.9 });
    mats.wood = new THREE.MeshStandardMaterial({ map: this._tex.wood, roughness: 0.92 });
    mats.plank = new THREE.MeshStandardMaterial({ map: this._tex.plank, roughness: 0.94 });
    mats.sand = new THREE.MeshStandardMaterial({ map: this._tex.sand, roughness: 1, metalness: 0 });
    mats.lamp = new THREE.MeshStandardMaterial({
      color: 0xd8d2c0, emissive: 0xffd9a0, emissiveIntensity: 0, roughness: 0.6, metalness: 0.3
    });
    mats.lampGlow = new THREE.PointsMaterial({
      map: this._tex.sun, color: 0xffd9a0, size: 1.5, sizeAttenuation: true,
      transparent: true, opacity: 0, depthWrite: false,
      blending: THREE.AdditiveBlending, toneMapped: false, alphaTest: 0.02
    });
    mats.neon = new THREE.MeshStandardMaterial({
      color: 0xff5db1, emissive: 0xff2d95, emissiveIntensity: 0.4, roughness: 0.4
    });
    mats.awning = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, map: this._stripeTexture() });
    mats.waterBasin = new THREE.MeshStandardMaterial({ color: 0x1a8f96, roughness: 0.25, metalness: 0.15 });
    mats.pool = new THREE.MeshStandardMaterial({ color: 0x2a9ba0, roughness: 0.2, metalness: 0.18 });
    mats.hedge = new THREE.MeshStandardMaterial({ color: 0x2f6a3c, roughness: 0.95 });
    mats.red = new THREE.MeshStandardMaterial({ color: 0xc94a43, roughness: 0.7 });
    mats.bin = new THREE.MeshStandardMaterial({ color: 0x31504d, roughness: 0.85 });
    mats.shelter = new THREE.MeshStandardMaterial({ color: 0x6a7a7d, roughness: 0.7, metalness: 0.25 });
    mats.umbrella = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, side: THREE.DoubleSide });
    mats.towel = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, side: THREE.DoubleSide });
    mats.pier = new THREE.MeshStandardMaterial({ map: this._tex.plank, roughness: 0.95 });
    mats.yellow = new THREE.MeshStandardMaterial({ color: 0xf3c969, roughness: 0.7 });
    for (var mk in mats) {
      if (!Object.prototype.hasOwnProperty.call(mats, mk)) continue;
      var mm = mats[mk];
      if (!mm) continue;
      if (mm.color) mm.color.convertSRGBToLinear();
      if (mm.emissive) mm.emissive.convertSRGBToLinear();
    }
    this._mats = mats;
  };

  World.prototype._stripeTexture = function () {
    var c = makeCanvas(128, 64);
    var g = c.getContext('2d');
    for (var i = 0; i < 8; i++) {
      g.fillStyle = i % 2 === 0 ? '#f4efe2' : '#2f8c86';
      g.fillRect(i * 16, 0, 16, 64);
    }
    g.fillStyle = 'rgba(0,0,0,0.18)';
    g.fillRect(0, 58, 128, 6);
    return canvasTexture(c, { repeat: [3, 1] });
  };

  /* -------------------------------- blocks -------------------------------- */

  World.prototype._planBlocks = function () {
    var special = {
      '-50,150': 'safehouse',
      '50,50': 'plaza',
      '150,-50': 'garage',
      '50,-150': 'ammu',
      '250,250': 'police',
      '-250,250': 'hospital',
      '350,-350': 'estate',
      '350,150': 'helipad',
      '-150,50': 'park',
      '150,50': 'park',
      '-50,-250': 'park',
      '-250,-350': 'park',
      '-350,250': 'promenade',
      '-350,-350': 'park'
    };
    this._blockTypes = special;
    var i, j;
    for (j = 0; j < 8; j++) {
      for (i = 0; i < 8; i++) {
        var cx = -350 + i * 100;
        var cz = -350 + j * 100;
        var type = special[keyOf(cx, cz)] || 'lot';
        this.blocks.push({
          cx: cx, cz: cz, ix: i, iz: j, type: type,
          variant: (i + j) % 2
        });
      }
    }
  };

  World.prototype._lotColor = function (type) {
    switch (type) {
      case 'park': return C.park;
      case 'plaza': return C.plaza;
      case 'promenade': return '#bdaf96';
      case 'estate': return C.estate;
      case 'police': return '#7c8085';
      case 'hospital': return '#a8a196';
      case 'garage': return '#54565a';
      case 'ammu': return '#a39984';
      case 'safehouse': return '#a49a86';
      case 'helipad': return '#4a4d50';
      default: return C.lot;
    }
  };

  /* ---------------------------- ground texture ---------------------------- */

  World.prototype._buildCityTexture = function () {
    var S = 2048;
    var c = makeCanvas(S, S);
    var g = c.getContext('2d');
    var rand = seeded('city-texture');
    var X = function (x) { return (x + HALF) / (HALF * 2) * S; };
    var Z = function (z) { return (z + HALF) / (HALF * 2) * S; };
    var W = function (w) { return w / (HALF * 2) * S; };

    g.fillStyle = '#8d8475';
    g.fillRect(0, 0, S, S);

    // ocean
    var ocean = g.createLinearGradient(0, 0, X(-460), 0);
    ocean.addColorStop(0, '#062c38');
    ocean.addColorStop(0.65, '#0b4f5c');
    ocean.addColorStop(1, '#1a7f84');
    g.fillStyle = ocean;
    g.fillRect(0, 0, X(-460), S);
    g.strokeStyle = 'rgba(160,240,232,0.16)';
    g.lineWidth = 2;
    for (var wv = 0; wv < 60; wv++) {
      var wy = rand() * S;
      var wx = rand() * X(-470);
      g.beginPath();
      g.moveTo(wx, wy);
      g.quadraticCurveTo(wx + 30, wy - 6, wx + 70, wy);
      g.stroke();
    }

    // beach
    var sand = g.createLinearGradient(X(-520), 0, X(-460), 0);
    sand.addColorStop(0, '#c9b184');
    sand.addColorStop(0.45, '#e8d6ae');
    sand.addColorStop(1, '#efe0bd');
    g.fillStyle = sand;
    g.fillRect(X(-520), 0, X(-460) - X(-520), S);
    for (var s = 0; s < 2400; s++) {
      g.fillStyle = rand() < 0.5 ? 'rgba(160,132,86,0.14)' : 'rgba(255,248,225,0.2)';
      g.fillRect(X(-520) + rand() * (X(-460) - X(-520)), rand() * S, 2, 2);
    }
    g.strokeStyle = 'rgba(160,132,86,0.2)';
    g.lineWidth = 1;
    for (var r = 0; r < 40; r++) {
      var ry = rand() * S;
      g.beginPath(); g.moveTo(X(-518), ry); g.bezierCurveTo(X(-500), ry + 20, X(-480), ry - 20, X(-461), ry + 6); g.stroke();
    }

    // promenade
    g.fillStyle = '#b3a891';
    g.fillRect(X(-460), 0, X(-408) - X(-460), S);
    g.fillStyle = '#8a6a44';
    g.fillRect(X(-460), 0, X(-454) - X(-460), S);
    g.fillStyle = 'rgba(30,40,40,0.12)';
    for (var bx = -456; bx < -408; bx += 7) g.fillRect(X(bx), 0, 2, S);

    // lots and sidewalks
    for (var bi = 0; bi < this.blocks.length; bi++) {
      var b = this.blocks[bi];
      var sx = X(b.cx - BLOCK / 2);
      var sz = Z(b.cz - BLOCK / 2);
      var ss = W(BLOCK);
      g.fillStyle = C.sidewalk;
      g.fillRect(sx, sz, ss, ss);
      g.strokeStyle = 'rgba(100,88,70,0.28)';
      g.lineWidth = 1;
      for (var gx = 0; gx <= 21; gx++) {
        g.beginPath(); g.moveTo(sx + gx * ss / 21, sz); g.lineTo(sx + gx * ss / 21, sz + ss); g.stroke();
      }
      for (var gz = 0; gz <= 21; gz++) {
        g.beginPath(); g.moveTo(sx, sz + gz * ss / 21); g.lineTo(sx + ss, sz + gz * ss / 21); g.stroke();
      }
      var lx = X(b.cx - LOT / 2);
      var lz = Z(b.cz - LOT / 2);
      var ls = W(LOT);
      g.fillStyle = this._lotColor(b.type);
      g.fillRect(lx, lz, ls, ls);
      if (b.type === 'park') {
        g.fillStyle = 'rgba(48,88,52,0.5)';
        for (var pt = 0; pt < 26; pt++) {
          g.beginPath();
          g.arc(lx + rand() * ls, lz + rand() * ls, 3 + rand() * 12, 0, TAU);
          g.fill();
        }
      } else if (b.type === 'plaza') {
        g.strokeStyle = 'rgba(120,105,80,0.5)';
        g.lineWidth = 2;
        g.beginPath(); g.arc(lx + ls / 2, lz + ls / 2, ls * 0.24, 0, TAU); g.stroke();
      } else if (b.type === 'estate') {
        g.fillStyle = '#2a7f86';
        g.fillRect(lx + ls * 0.58, lz + ls * 0.62, ls * 0.2, ls * 0.1);
      } else if (b.type === 'garage' || b.type === 'helipad') {
        g.strokeStyle = 'rgba(235,230,210,0.25)';
        g.lineWidth = 2;
        for (var pk = 0; pk < 6; pk++) {
          g.beginPath();
          g.moveTo(lx + 8, lz + 12 + pk * 10);
          g.lineTo(lx + ls * 0.45, lz + 12 + pk * 10);
          g.stroke();
        }
      }
    }

    // roads
    g.fillStyle = C.asphalt;
    var ri;
    for (ri = 0; ri < ROAD_X.length; ri++) {
      g.fillRect(X(ROAD_X[ri] - ROAD_HALF), 0, W(ROAD_HALF * 2), S);
    }
    for (ri = 0; ri < ROAD_Z.length; ri++) {
      g.fillRect(0, Z(ROAD_Z[ri] - ROAD_HALF), S, W(ROAD_HALF * 2));
    }
    for (var n = 0; n < 6000; n++) {
      g.fillStyle = rand() < 0.5 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.05)';
      var nx = X(-408) + rand() * (S - X(-408));
      var nz = rand() * S;
      g.fillRect(nx, nz, 2, 2);
    }

    // road markings (subtle; crisp 3D dashes sit above)
    g.strokeStyle = 'rgba(240,238,224,0.5)';
    g.lineWidth = 1.5;
    g.setLineDash([8, 10]);
    for (ri = 0; ri < ROAD_X.length; ri++) {
      g.beginPath();
      g.moveTo(X(ROAD_X[ri]), 0);
      g.lineTo(X(ROAD_X[ri]), S);
      g.stroke();
    }
    for (ri = 0; ri < ROAD_Z.length; ri++) {
      g.beginPath();
      g.moveTo(0, Z(ROAD_Z[ri]));
      g.lineTo(S, Z(ROAD_Z[ri]));
      g.stroke();
    }
    g.setLineDash([]);
    for (var xi = 0; xi < ROAD_X.length; xi++) {
      for (var zi = 0; zi < ROAD_Z.length; zi++) {
        var rx = ROAD_X[xi];
        var rz = ROAD_Z[zi];
        g.fillStyle = 'rgba(240,238,224,0.38)';
        for (var cb = 0; cb < 8; cb++) {
          g.fillRect(X(rx - 7 + cb * 1.8), Z(rz - 13.5), W(1), W(4.5));
          g.fillRect(X(rx - 7 + cb * 1.8), Z(rz + 9), W(1), W(4.5));
          g.fillRect(X(rx - 13.5), Z(rz - 7 + cb * 1.8), W(4.5), W(1));
          g.fillRect(X(rx + 9), Z(rz - 7 + cb * 1.8), W(4.5), W(1));
        }
      }
    }

    // pier deck in the texture
    g.fillStyle = '#7b5f3e';
    g.fillRect(X(-690), Z(PIER_Z - 8), W(225), W(16));
    g.strokeStyle = 'rgba(30,20,12,0.3)';
    g.lineWidth = 1;
    for (var pd = 0; pd < 70; pd++) {
      g.beginPath();
      g.moveTo(X(-690 + pd * 3.2), Z(PIER_Z - 8));
      g.lineTo(X(-690 + pd * 3.2), Z(PIER_Z + 8));
      g.stroke();
    }

    // plaza + estate details at texture level
    for (var pi = 0; pi < this.blocks.length; pi++) {
      var pb = this.blocks[pi];
      if (pb.type !== 'plaza' && pb.type !== 'estate' && pb.type !== 'park') continue;
      var ox = X(pb.cx - LOT / 2);
      var oz = Z(pb.cz - LOT / 2);
      var os = W(LOT);
      if (pb.type === 'plaza') {
        g.strokeStyle = 'rgba(120,102,74,0.55)';
        g.lineWidth = 3;
        g.beginPath(); g.arc(ox + os / 2, oz + os / 2, os * 0.18, 0, TAU); g.stroke();
        g.strokeStyle = 'rgba(120,102,74,0.3)';
        g.beginPath(); g.arc(ox + os / 2, oz + os / 2, os * 0.32, 0, TAU); g.stroke();
      } else if (pb.type === 'estate') {
        g.strokeStyle = 'rgba(225,215,190,0.4)';
        g.lineWidth = 3;
        g.strokeRect(ox + 8, oz + 8, os - 16, os - 16);
      }
    }

    g.fillStyle = 'rgba(20,20,20,0.05)';
    for (var stain = 0; stain < 300; stain++) {
      g.beginPath();
      g.arc(X(-400) + rand() * (S - X(-400)), rand() * S, 2 + rand() * 18, 0, TAU);
      g.fill();
    }

    this._cityTexture = canvasTexture(c, { clamp: true });
    this._cityTexRepeat = { repeat: [960 / 1000, 1], offset: [0.04, 0] };
  };

  World.prototype._buildGround = function () {
    var groundMat = new THREE.MeshStandardMaterial({
      map: this._cityTexture,
      roughness: 0.97,
      metalness: 0.0,
      color: 0xffffff
    });
    this._cityTexture.repeat.set(0.96, 1);
    this._cityTexture.offset.set(0.04, 0);
    var geo = new THREE.PlaneGeometry(960, 1000);
    geo.rotateX(-Math.PI / 2);
    var ground = new THREE.Mesh(geo, groundMat);
    ground.position.set(20, 0, 0);
    ground.receiveShadow = true;
    this.group.add(ground);

    // sloped beach skirt (60 m from the seawall to the waterline)
    var bgeo = new THREE.PlaneGeometry(60, 1000, 10, 1);
    bgeo.rotateX(-Math.PI / 2);
    var pos = bgeo.attributes.position;
    for (var i = 0; i < pos.count; i++) {
      var lx = pos.getX(i);
      var lz = pos.getZ(i);
      var worldX = lx - 490;
      var t = (worldX + 520) / 60;
      pos.setY(i, 0.02 - 0.64 * t + Math.sin(lz * 0.07) * 0.012);
    }
    bgeo.computeVertexNormals();
    var beach = new THREE.Mesh(bgeo, this._mats.sand);
    beach.position.set(-490, 0, 0);
    beach.receiveShadow = true;
    this.group.add(beach);

    // wooden boardwalk along the sand
    var bwGeo = new THREE.PlaneGeometry(7, 470);
    bwGeo.rotateX(-Math.PI / 2);
    var boardwalk = new THREE.Mesh(bwGeo, this._mats.plank);
    boardwalk.position.set(-466, 0.045, 100);
    boardwalk.receiveShadow = true;
    this.group.add(boardwalk);
  };

  /* --------------------------------- ocean -------------------------------- */

  World.prototype._buildOcean = function () {
    var uniforms = {
      uTime: { value: 0 },
      uDeep: { value: this._waterDeepDay.clone() },
      uShallow: { value: this._waterShallowDay.clone() },
      uFoam: { value: new THREE.Color(0xe6fbf4) },
      uSunColor: { value: new THREE.Color(0xffd9a0) },
      uSunDir: { value: new THREE.Vector3(-0.55, 0.66, 0.36).normalize() },
      uFogColor: { value: new THREE.Color(0x9aa4a8) },
      uFogNear: { value: 80 },
      uFogFar: { value: 520 },
      uNight: { value: 0.4 }
    };
    this._oceanU = uniforms;

    var vs = [
      'uniform float uTime;',
      'varying vec3 vWorld;',
      'varying vec3 vNrm;',
      'varying float vH;',
      'void main() {',
      '  vec3 p = position;',
      '  float h = sin(p.x*0.055 + uTime*0.9)*0.19 + sin(p.y*0.085 - uTime*1.1)*0.13 + sin((p.x+p.y)*0.028 + uTime*0.65)*0.10;',
      '  p.z += h;',
      '  float dx = cos(p.x*0.055 + uTime*0.9)*0.01045 + cos((p.x+p.y)*0.028 + uTime*0.65)*0.0028;',
      '  float dy = cos(p.y*0.085 - uTime*1.1)*0.01105 + cos((p.x+p.y)*0.028 + uTime*0.65)*0.0028;',
      '  vNrm = normalize(mat3(modelMatrix) * vec3(-dx, -dy, 1.0));',
      '  vec4 wp = modelMatrix * vec4(p, 1.0);',
      '  vWorld = wp.xyz;',
      '  vH = h;',
      '  gl_Position = projectionMatrix * viewMatrix * wp;',
      '}'
    ].join('\n');

    var fs = [
      'precision highp float;',
      'uniform vec3 uDeep;',
      'uniform vec3 uShallow;',
      'uniform vec3 uFoam;',
      'uniform vec3 uSunColor;',
      'uniform vec3 uSunDir;',
      'uniform vec3 uFogColor;',
      'uniform float uTime;',
      'uniform float uNight;',
      'uniform float uFogNear;',
      'uniform float uFogFar;',
      'varying vec3 vWorld;',
      'varying vec3 vNrm;',
      'varying float vH;',
      'void main() {',
      '  vec3 n = normalize(vNrm);',
      '  vec3 viewDir = normalize(cameraPosition - vWorld);',
      '  vec3 sunDir = normalize(uSunDir);',
      '  float diff = max(dot(n, sunDir), 0.0);',
      '  vec3 hv = normalize(sunDir + viewDir);',
      '  float spec = pow(max(dot(n, hv), 0.0), 110.0);',
      '  float fres = pow(1.0 - max(dot(n, viewDir), 0.0), 3.0);',
      '  vec3 col = mix(uDeep, uShallow, clamp(vH*1.8 + 0.5, 0.0, 1.0));',
      '  col = mix(col, uShallow * 1.24, diff * 0.4);',
      '  col += uSunColor * spec * 2.1;',
      '  col = mix(col, uShallow + vec3(0.09), fres * 0.55);',
      '  float shoreBand = smoothstep(-538.0, -518.0, vWorld.x) * (1.0 - smoothstep(-508.0, -492.0, vWorld.x));',
      '  float bands = sin(vWorld.z*0.17 + uTime*1.35 + sin(vWorld.x*0.12 + uTime*0.4)*2.4);',
      '  float foam = smoothstep(0.46, 0.94, bands) * shoreBand;',
      '  float crest = smoothstep(0.28, 0.42, vH) * 0.16;',
      '  float streak = smoothstep(0.86, 1.0, sin(vWorld.x*0.075 + vWorld.z*0.032 + uTime*0.5)) * 0.07;',
      '  col = mix(col, uFoam, clamp(foam * 0.95 + crest + streak, 0.0, 1.0));',
      '  float depthT = smoothstep(-540.0, -1120.0, vWorld.x);',
      '  col = mix(col, uDeep * 0.5, depthT * 0.62);',
      '  float fog = smoothstep(uFogNear, uFogFar, length(cameraPosition - vWorld));',
      '  col = mix(col, uFogColor, fog);',
      '  gl_FragColor = vec4(col, 1.0);',
      '}'
    ].join('\n');

    var geo = new THREE.PlaneGeometry(1040, 1400, 56, 56);
    var mat = new THREE.ShaderMaterial({
      uniforms: uniforms,
      vertexShader: vs,
      fragmentShader: fs,
      side: THREE.FrontSide,
      fog: false
    });
    var ocean = new THREE.Mesh(geo, mat);
    ocean.rotation.x = -Math.PI / 2;
    ocean.position.set(-980, -0.62, 0);
    ocean.renderOrder = -1;
    this.group.add(ocean);
    this._ocean = ocean;
  };

  /* ------------------------------ block surfaces ------------------------- */

  World.prototype._buildBlockSurfaces = function () {
    var i, b;
    var slabGeo = new THREE.BoxGeometry(1, 1, 1);
    var slab = new THREE.InstancedMesh(slabGeo, this._mats.sidewalk, this.blocks.length);
    slab.receiveShadow = true;
    slab.frustumCulled = false;
    for (i = 0; i < this.blocks.length; i++) {
      b = this.blocks[i];
      this._setInstance(slab, i, b.cx, 0.05, b.cz, BLOCK, 0.1, BLOCK, 0);
    }
    slab.instanceMatrix.needsUpdate = true;
    slab.name = 'block-slabs';
    this.group.add(slab);

    var lotGeo = new THREE.PlaneGeometry(LOT, LOT);
    lotGeo.rotateX(-Math.PI / 2);
    var lotMat = this._mats.lot;
    var lots = new THREE.InstancedMesh(lotGeo, lotMat, this.blocks.length);
    lots.receiveShadow = true;
    lots.frustumCulled = false;
    for (i = 0; i < this.blocks.length; i++) {
      b = this.blocks[i];
      this._setInstance(lots, i, b.cx, 0.106, b.cz, 1, 1, 1, 0);
      this._color.set(this._lotColor(b.type)).convertSRGBToLinear();
      lots.setColorAt(i, this._color);
    }
    lots.instanceMatrix.needsUpdate = true;
    if (lots.instanceColor) lots.instanceColor.needsUpdate = true;
    lots.name = 'block-lots';
    this.group.add(lots);

    // park and plaza overlays
    var overlayGeo = new THREE.PlaneGeometry(LOT - 1, LOT - 1);
    overlayGeo.rotateX(-Math.PI / 2);
    var parkA = [];
    var parkB = [];
    var plazas = [];
    var promenades = [];
    var estates = [];
    var helipads = [];
    for (i = 0; i < this.blocks.length; i++) {
      b = this.blocks[i];
      if (b.type === 'park') (b.variant ? parkA : parkB).push(b);
      else if (b.type === 'plaza') plazas.push(b);
      else if (b.type === 'promenade') promenades.push(b);
      else if (b.type === 'estate') estates.push(b);
      else if (b.type === 'helipad') helipads.push(b);
    }
    this._makeOverlay(overlayGeo, this._tex.parkA, parkA, 0.126);
    this._makeOverlay(overlayGeo, this._tex.parkB, parkB, 0.126);
    this._makeOverlay(overlayGeo, this._tex.plaza, plazas, 0.127);
    this._makeOverlay(overlayGeo, this._tex.promenade, promenades, 0.127);
    this._makeOverlay(overlayGeo, this._tex.estate, estates, 0.126);
    if (helipads.length) {
      var padGeo = new THREE.CircleGeometry(13, 32);
      padGeo.rotateX(-Math.PI / 2);
      var padMat = new THREE.MeshBasicMaterial({ map: this._tex.helipad, transparent: true, toneMapped: false });
      for (i = 0; i < helipads.length; i++) {
        var pad = new THREE.Mesh(padGeo, padMat);
        pad.position.set(helipads[i].cx, 0.132, helipads[i].cz);
        this.group.add(pad);
      }
    }
  };

  World.prototype._makeOverlay = function (geo, tex, list, y) {
    if (!list.length) return;
    var mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, metalness: 0 });
    var mesh = new THREE.InstancedMesh(geo, mat, list.length);
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    for (var i = 0; i < list.length; i++) {
      this._setInstance(mesh, i, list[i].cx, y, list[i].cz, 1, 1, 1, 0);
    }
    mesh.instanceMatrix.needsUpdate = true;
    this.group.add(mesh);
  };

  /* ----------------------------- road markings --------------------------- */

  World.prototype._buildRoadDetails = function () {
    var i, j, x, z;
    var markGeo = new THREE.PlaneGeometry(1, 1);
    markGeo.rotateX(-Math.PI / 2);
    var markMat = new THREE.MeshStandardMaterial({
      color: 0xe9e3cf, roughness: 0.85, metalness: 0.02,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1
    });

    var dashCount = 0;
    for (i = 0; i < ROAD_X.length; i++) {
      for (z = -440; z <= 440; z += 12) dashCount++;
    }
    for (i = 0; i < ROAD_Z.length; i++) {
      for (x = -440; x <= 440; x += 12) dashCount++;
    }
    var dashes = new THREE.InstancedMesh(markGeo, markMat, dashCount);
    dashes.frustumCulled = false;
    dashes.receiveShadow = true;
    var di = 0;
    for (i = 0; i < ROAD_X.length; i++) {
      for (z = -440; z <= 440; z += 12) {
        this._setInstance(dashes, di++, ROAD_X[i], 0.021, z, 0.16, 1, 4.2, 0);
      }
    }
    for (i = 0; i < ROAD_Z.length; i++) {
      for (x = -440; x <= 440; x += 12) {
        this._setInstance(dashes, di++, x, 0.021, ROAD_Z[i], 4.2, 1, 0.16, 0);
      }
    }
    dashes.instanceMatrix.needsUpdate = true;
    this.group.add(dashes);

    var perCross = 8;
    var crosses = new THREE.InstancedMesh(
      markGeo,
      new THREE.MeshStandardMaterial({
        color: 0xf1ecda, roughness: 0.8, metalness: 0.01,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2
      }),
      ROAD_X.length * ROAD_Z.length * 4 * perCross
    );
    crosses.frustumCulled = false;
    crosses.receiveShadow = true;
    var ci = 0;
    for (i = 0; i < ROAD_X.length; i++) {
      for (j = 0; j < ROAD_Z.length; j++) {
        x = ROAD_X[i];
        z = ROAD_Z[j];
        for (var k = 0; k < perCross; k++) {
          var off = -6.4 + k * 1.82;
          this._setInstance(crosses, ci++, x + off, 0.024, z - 13.2, 0.9, 1, 4.4, 0);
          this._setInstance(crosses, ci++, x + off, 0.024, z + 13.2, 0.9, 1, 4.4, 0);
          this._setInstance(crosses, ci++, x - 13.2, 0.024, z + off, 4.4, 1, 0.9, 0);
          this._setInstance(crosses, ci++, x + 13.2, 0.024, z + off, 4.4, 1, 0.9, 0);
        }
      }
    }
    crosses.instanceMatrix.needsUpdate = true;
    this.group.add(crosses);

    var segs = [[-500, -408]];
    for (i = 0; i < 8; i++) segs.push([-400 + i * 100 + 8, -300 + i * 100 - 8]);
    segs.push([408, 500]);
    var kerbGeo = new THREE.BoxGeometry(1, 1, 1);
    var kerbMat = new THREE.MeshStandardMaterial({ color: 0xc9bda6, roughness: 0.9 });
    var kerbs = new THREE.InstancedMesh(kerbGeo, kerbMat, ROAD_X.length * segs.length * 2 * 2);
    kerbs.frustumCulled = false;
    kerbs.receiveShadow = true;
    var ki = 0;
    for (i = 0; i < ROAD_X.length; i++) {
      for (j = 0; j < segs.length; j++) {
        var len = segs[j][1] - segs[j][0];
        if (len <= 0.5) continue;
        var mid = (segs[j][0] + segs[j][1]) / 2;
        this._setInstance(kerbs, ki++, ROAD_X[i] - 8.15, 0.1, mid, 0.28, 0.2, len, 0);
        this._setInstance(kerbs, ki++, ROAD_X[i] + 8.15, 0.1, mid, 0.28, 0.2, len, 0);
      }
    }
    for (i = 0; i < ROAD_Z.length; i++) {
      for (j = 0; j < segs.length; j++) {
        len = segs[j][1] - segs[j][0];
        if (len <= 0.5) continue;
        mid = (segs[j][0] + segs[j][1]) / 2;
        this._setInstance(kerbs, ki++, mid, 0.1, ROAD_Z[i] - 8.15, len, 0.2, 0.28, 0);
        this._setInstance(kerbs, ki++, mid, 0.1, ROAD_Z[i] + 8.15, len, 0.2, 0.28, 0);
      }
    }
    kerbs.count = ki;
    kerbs.instanceMatrix.needsUpdate = true;
    this.group.add(kerbs);
  };

  /* ------------------------------- buildings ----------------------------- */

  World.prototype._setInstance = function (mesh, i, x, y, z, sx, sy, sz, ry, rz) {
    this._euler.set(rz || 0, ry || 0, 0, 'YXZ');
    this._quat.setFromEuler(this._euler);
    this._mat4.compose(this._vec3.set(x, y, z), this._quat, this._scale3.set(sx, sy, sz));
    mesh.setMatrixAt(i, this._mat4);
  };

  World.prototype._pick = function (arr) {
    if (!arr || !arr.length) return undefined;
    if (this.rng) return this.rng.pick(arr);
    return arr[Math.floor(Math.random() * arr.length)];
  };

  World.prototype._range = function (a, b) {
    return this.rng ? this.rng.range(a, b) : a + Math.random() * (b - a);
  };

  World.prototype._chance = function (p) {
    return this.rng ? this.rng.chance(p) : Math.random() < p;
  };

  World.prototype._addBuilding = function (cx, cz, w, d, h, style, baseY, opts) {
    opts = opts || {};
    baseY = baseY == null ? 0.1 : baseY;
    var batch = this._batches[style] || this._batches.coral;
    var tint = 0.86 + this._range(0, 0.16);
    batch.list.push({ x: cx, z: cz, w: w, d: d, h: h, baseY: baseY, tint: tint });
    this.buildings.push({
      minX: cx - w / 2, maxX: cx + w / 2,
      minZ: cz - d / 2, maxZ: cz + d / 2,
      h: baseY + h, cx: cx, cz: cz, w: w, d: d
    });
    this._roofs.push({ x: cx, z: cz, w: w, d: d, y: baseY + h });
    var top = baseY + h;
    if (opts.parapet !== false && h > 5) {
      this._parapets.push({ x: cx, y: top, z: cz - d / 2 + 0.16, sx: w, sz: 0.32 });
      this._parapets.push({ x: cx, y: top, z: cz + d / 2 - 0.16, sx: w, sz: 0.32 });
      this._parapets.push({ x: cx - w / 2 + 0.16, y: top, z: cz, sx: 0.32, sz: d });
      this._parapets.push({ x: cx + w / 2 - 0.16, y: top, z: cz, sx: 0.32, sz: d });
    }
    if (opts.rooftop !== false) {
      var rn = h > 24 ? (this._chance(0.8) ? 2 : 1) : (this._chance(0.55) ? 1 : 0);
      for (var r = 0; r < rn; r++) {
        var rw = this._range(2.4, Math.min(7.5, w * 0.45));
        var rd = this._range(2.0, Math.min(6.5, d * 0.45));
        this._roofBoxes.push({
          x: cx + this._range(-w * 0.22, w * 0.22),
          z: cz + this._range(-d * 0.22, d * 0.22),
          y: top + 0.7,
          sx: rw, sy: 1.4, sz: rd
        });
      }
    }
    if (h > 16 && this._chance(0.4)) {
      this._tanks.push({ x: cx + this._range(-w * 0.2, w * 0.2), z: cz + this._range(-d * 0.2, d * 0.2), y: top + 1.4, s: this._range(1.4, 2.4) });
    }
    if (h > 55 && this._chance(0.75)) {
      this._antennas.push({ x: cx + this._range(-w * 0.18, w * 0.18), z: cz + this._range(-d * 0.18, d * 0.18), y: top, s: this._range(8, 20) });
    }
  };

  World.prototype._hitsKeepClear = function (cx, cz, w, d) {
    for (var i = 0; i < this._keepClear.length; i++) {
      var k = this._keepClear[i];
      if (k.x > cx - w / 2 - k.r && k.x < cx + w / 2 + k.r && k.z > cz - d / 2 - k.r && k.z < cz + d / 2 + k.r) return true;
    }
    return false;
  };

  World.prototype._styleFor = function (h, ocean) {
    if (h >= 38) return 'tower';
    if (ocean) return h > 24 ? 'deco' : (this._chance(0.6) ? 'deco' : 'coral');
    if (h >= 20) return this._chance(0.55) ? 'deco' : (this._chance(0.5) ? 'cream' : 'white');
    return this._pick(['coral', 'brick', 'cream', 'white']);
  };

  World.prototype._buildBuildings = function () {
    for (var i = 0; i < this.blocks.length; i++) {
      var b = this.blocks[i];
      if (b.type === 'lot') this._fillRegularBlock(b);
    }
  };

  World.prototype._fillRegularBlock = function (block) {
    var downtown = block.cx >= 120 && block.cx <= 280 && block.cz >= -280 && block.cz <= 80;
    var oceanfront = block.cx <= -300;
    var south = block.cz >= 150;
    var parcels = [[-19, -19], [19, -19], [-19, 19], [19, 19]];
    parcels = this.rng ? this.rng.shuffle(parcels) : parcels;
    var count = downtown ? 2 : (this._chance(0.6) ? 3 : 4);
    for (var i = 0; i < count; i++) {
      var p = parcels[i];
      var cx = block.cx + p[0] + this._range(-1.8, 1.8);
      var cz = block.cz + p[1] + this._range(-1.8, 1.8);
      var maxF = downtown ? 34 : 31;
      var w = this._range(downtown ? 26 : 18, maxF);
      var d = this._range(downtown ? 24 : 18, maxF);
      var h;
      if (downtown) h = this._range(42, 104);
      else if (oceanfront) h = this._range(9, 24);
      else if (south) h = this._range(7, 15);
      else h = this._range(11, 33);
      if (downtown && i === 0 && h < 62) h = this._range(62, 100);
      if (this._hitsKeepClear(cx, cz, w, d)) continue;
      this._addBuilding(cx, cz, w, d, h, this._styleFor(h, oceanfront), 0.1, {});
    }
  };

  World.prototype._flushBuildingBatches = function () {
    var geo = new THREE.BoxGeometry(1, 1, 1);
    for (var key in this._batches) {
      if (!Object.prototype.hasOwnProperty.call(this._batches, key)) continue;
      var batch = this._batches[key];
      if (!batch.list.length) continue;
      var mesh = new THREE.InstancedMesh(geo, batch.material, batch.list.length);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      mesh.name = 'buildings-' + key;
      for (var i = 0; i < batch.list.length; i++) {
        var it = batch.list[i];
        this._setInstance(mesh, i, it.x, it.baseY + it.h / 2, it.z, it.w, it.h, it.d, 0);
        this._color.setRGB(it.tint, it.tint, it.tint).convertSRGBToLinear();
        mesh.setColorAt(i, this._color);
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      this.group.add(mesh);
    }

    var roofGeo = new THREE.PlaneGeometry(1, 1);
    roofGeo.rotateX(-Math.PI / 2);
    var roofs = new THREE.InstancedMesh(roofGeo, this._mats.roof, this._roofs.length);
    roofs.frustumCulled = false;
    roofs.receiveShadow = true;
    for (var r = 0; r < this._roofs.length; r++) {
      var rf = this._roofs[r];
      this._setInstance(roofs, r, rf.x, rf.y + 0.01, rf.z, rf.w * 0.99, 1, rf.d * 0.99, 0);
    }
    roofs.instanceMatrix.needsUpdate = true;
    this.group.add(roofs);

    var parapetGeo = new THREE.BoxGeometry(1, 1, 1);
    var parapets = new THREE.InstancedMesh(parapetGeo, this._mats.trim, this._parapets.length);
    parapets.castShadow = true;
    parapets.receiveShadow = true;
    parapets.frustumCulled = false;
    for (var p = 0; p < this._parapets.length; p++) {
      var pp = this._parapets[p];
      this._setInstance(parapets, p, pp.x, pp.y + 0.32, pp.z, pp.sx, 0.72, pp.sz, 0);
    }
    parapets.instanceMatrix.needsUpdate = true;
    this.group.add(parapets);

    var boxGeo = new THREE.BoxGeometry(1, 1, 1);
    var boxes = new THREE.InstancedMesh(boxGeo, this._mats.metal, this._roofBoxes.length);
    boxes.castShadow = true;
    boxes.receiveShadow = true;
    boxes.frustumCulled = false;
    for (var b = 0; b < this._roofBoxes.length; b++) {
      var rb = this._roofBoxes[b];
      this._setInstance(boxes, b, rb.x, rb.y, rb.z, rb.sx, rb.sy, rb.sz, 0);
    }
    boxes.instanceMatrix.needsUpdate = true;
    this.group.add(boxes);

    if (this._tanks.length) {
      var tankGeo = new THREE.CylinderGeometry(1, 1, 1, 8);
      var tanks = new THREE.InstancedMesh(tankGeo, this._mats.tank, this._tanks.length);
      tanks.castShadow = true;
      tanks.receiveShadow = true;
      tanks.frustumCulled = false;
      for (var t = 0; t < this._tanks.length; t++) {
        var tk = this._tanks[t];
        this._setInstance(tanks, t, tk.x, tk.y, tk.z, tk.s, tk.s * 1.6, tk.s, 0);
      }
      tanks.instanceMatrix.needsUpdate = true;
      this.group.add(tanks);
    }

    if (this._antennas.length) {
      var antGeo = new THREE.CylinderGeometry(1, 1, 1, 5);
      var ants = new THREE.InstancedMesh(antGeo, this._mats.metal, this._antennas.length);
      ants.frustumCulled = false;
      for (var a = 0; a < this._antennas.length; a++) {
        var an = this._antennas[a];
        this._setInstance(ants, a, an.x, an.y + an.s / 2, an.z, 0.09, an.s, 0.09, 0);
      }
      ants.instanceMatrix.needsUpdate = true;
      this.group.add(ants);
    }
  };

  World.prototype._buildOceanHotels = function () {
    var self = this;
    var zs = [-40, 0, 40, 80, 120, 160, 200, 240];
    for (var i = 0; i < zs.length; i++) {
      var z = zs[i];
      var w = this._range(24, 31);
      var d = this._range(19, 25);
      var h = this._range(14, 34);
      this._addBuilding(-436, z, w, d, h, this._styleFor(h, true), 0.1, { parapet: true });
      this._awnings.push({ x: -436 + w / 2 + 0.6, z: z, y: 3.5, d: d * 0.72 });
      this._neonStrips.push({ x: -436 + w / 2 + 0.18, z: z, y: h + 0.6, d: d * 0.9 });
      var face = -436 + w / 2 + 0.3;
      if (z === 200) this._addSign(makeSignCanvas('OCEAN', 'HOTEL · 180', {
        width: 256, height: 512, accent: '#ff2d95', titleSize: 76, subSize: 20
      }), face, 12, z, 4.6, 9.2, Math.PI / 2);
      if (z === 80) this._addSign(makeSignCanvas('NEON', 'PALMS', {
        width: 256, height: 512, accent: '#28e0d0', titleSize: 72, subSize: 22
      }), face, 10, z, 4.2, 8.4, Math.PI / 2);
    }
    var awningGeo = new THREE.BoxGeometry(1, 1, 1);
    var awnings = new THREE.InstancedMesh(awningGeo, this._mats.awning, this._awnings.length);
    awnings.castShadow = true;
    awnings.frustumCulled = false;
    for (var a = 0; a < this._awnings.length; a++) {
      var aw = this._awnings[a];
      this._setInstance(awnings, a, aw.x, aw.y, aw.z, 2.2, 0.16, aw.d, 0);
    }
    awnings.instanceMatrix.needsUpdate = true;
    this.group.add(awnings);

    var neonMat = this._mats.neon;
    this._neonMat = neonMat;
    var neon = new THREE.InstancedMesh(awningGeo, neonMat, this._neonStrips.length);
    neon.frustumCulled = false;
    for (var n = 0; n < this._neonStrips.length; n++) {
      var ns = this._neonStrips[n];
      this._setInstance(neon, n, ns.x, ns.y, ns.z, 0.28, 0.22, ns.d, 0);
    }
    neon.instanceMatrix.needsUpdate = true;
    this.group.add(neon);
  };

  World.prototype._addSign = function (canvas, x, y, z, w, h, ry) {
    var tex = canvasTexture(canvas, { clamp: true });
    var mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, side: THREE.FrontSide });
    this._signMats.push(mat);
    var mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    mesh.position.set(x, y, z);
    mesh.rotation.y = ry || 0;
    this.group.add(mesh);
    return mesh;
  };

  World.prototype._buildCivicBuildings = function () {
    var self = this;
    // police station
    this._addBuilding(250, 266, 36, 22, 14, 'white', 0.1, {});
    this._addSign(makeSignCanvas('CSPD', 'COSTA SOL POLICE · 12TH PRECINCT', {
      width: 512, height: 192, accent: '#5cb7ff', titleSize: 74
    }), 250, 11, 254.8, 13, 4.9, Math.PI);
    this._addCivicLight(250, 8.2, 253.6, 0x5cb7ff);
    // hospital
    this._addBuilding(-250, 266, 40, 24, 20, 'white', 0.1, {});
    this._addSign(makeSignCanvas('COSTA SOL', 'GENERAL HOSPITAL · EMERGENCY', {
      width: 512, height: 192, accent: '#ff4d55', titleSize: 56
    }), -250, 15, 253.8, 15, 5.6, Math.PI);
    // garage
    this._addBuilding(150, -66, 34, 20, 8, 'brick', 0.1, {});
    this._addSign(makeSignCanvas('DEZ GARAGE', 'MECHANIC · OPEN LATE', {
      width: 512, height: 192, accent: '#f3c969', titleSize: 70
    }), 150, 6.6, -55.8, 15, 5.6, 0);
    this._garageDoors(150, -55.9, 34, 20);
    // ammu-nation
    this._addBuilding(50, -164, 26, 18, 9, 'cream', 0.1, {});
    this._addSign(makeSignCanvas('AMMU-NATION', 'ARMS · AMMO · NO QUESTIONS', {
      width: 512, height: 192, accent: '#ff6f61', titleSize: 62
    }), 50, 7, -154.8, 12, 4.5, 0);
    // safehouse
    this._addBuilding(-50, 164, 22, 18, 9, 'coral', 0.1, {});
    this._addSign(makeSignCanvas('SAFEHOUSE', 'CALDER · NO VACANCY', {
      width: 512, height: 192, accent: '#63e6a4', titleSize: 66
    }), -50, 6.4, 154.8, 10, 3.7, Math.PI);
    // helipad office
    this._addBuilding(326, 172, 20, 15, 8, 'white', 0.1, {});
    this._helipadProps(350, 150);
    // civic filler blocks around them
  };

  World.prototype._addCivicLight = function (x, y, z, color) {
    var mat = new THREE.MeshStandardMaterial({ color: color, emissive: color, emissiveIntensity: 1.2, roughness: 0.4 });
    var mesh = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.3, 0.7), mat);
    mesh.position.set(x, y, z);
    this.group.add(mesh);
  };

  World.prototype._garageDoors = function (x, z, w, d) {
    var mat = new THREE.MeshStandardMaterial({ color: 0x3a4144, roughness: 0.75, metalness: 0.35 });
    for (var i = 0; i < 2; i++) {
      var door = new THREE.Mesh(new THREE.BoxGeometry(11, 5.2, 0.24), mat);
      door.position.set(x - 8 + i * 16, 2.7, z);
      this.group.add(door);
      var frame = new THREE.Mesh(new THREE.BoxGeometry(11.6, 0.35, 0.4), this._mats.yellow);
      frame.position.set(x - 8 + i * 16, 5.35, z + 0.02);
      this.group.add(frame);
    }
  };

  World.prototype._helipadProps = function (x, z) {
    var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 6, 5), this._mats.metal);
    pole.position.set(x + 16, 3.1, z - 16);
    this.group.add(pole);
    var cone = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.4, 8), new THREE.MeshStandardMaterial({ color: 0xff6f61, roughness: 0.8 }));
    cone.position.set(x + 16, 5.6, z - 16);
    cone.rotation.z = 1.2;
    this.group.add(cone);
  };

  /* -------------------------------- estate -------------------------------- */

  World.prototype._buildEstate = function () {
    this._addBuilding(360, -372, 36, 18, 13, 'cream', 0.1, {});
    this._addBuilding(384, -366, 12, 13, 9, 'cream', 0.1, {});
    this._addBuilding(336, -366, 10, 13, 9, 'cream', 0.1, {});
    // pool
    var pool = new THREE.Mesh(new THREE.PlaneGeometry(18, 10), this._mats.pool);
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(360, 0.145, -345);
    this.group.add(pool);
    var frame = new THREE.Mesh(new THREE.BoxGeometry(20, 0.3, 12), this._mats.trim);
    frame.position.set(360, 0.08, -345);
    this.group.add(frame);
    // courtyard fountain
    var basin = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.6, 0.7, 12), this._mats.trim);
    basin.position.set(360, 0.45, -334);
    this.group.add(basin);
    var water = new THREE.Mesh(new THREE.CylinderGeometry(2.8, 2.8, 0.12, 12), this._mats.waterBasin);
    water.position.set(360, 0.82, -334);
    this.group.add(water);
    // walls
    this._addWall(311, -389, 389, -389, 3.2);
    this._addWall(311, -311, 322, -311, 3.2);
    this._addWall(338, -311, 389, -311, 3.2);
    this._addWall(311, -389, 311, -311, 3.2);
    this._addWall(389, -389, 389, -311, 3.2);
    var gateL = new THREE.Mesh(new THREE.BoxGeometry(2.2, 4.8, 2.2), this._mats.concrete);
    gateL.position.set(322, 2.5, -311);
    this.group.add(gateL);
    var gateR = gateL.clone();
    gateR.position.x = 338;
    this.group.add(gateR);
    this._addSign(makeSignCanvas('CROWE ESTATE', 'PRIVATE · NO TRESPASSING', {
      width: 512, height: 192, accent: '#f3c969', titleSize: 62
    }), 330, 5.2, -310.2, 13, 4.9, 0);
    // hedges
    var hedgeGeo = new THREE.BoxGeometry(1, 1, 1);
    var hedges = new THREE.InstancedMesh(hedgeGeo, this._mats.hedge, 14);
    hedges.castShadow = true;
    var hi = 0;
    for (var i = 0; i < 7; i++) {
      this._setInstance(hedges, hi++, 316 + i * 20, 0.9, -380, 12, 1.6, 1.2, 0);
      this._setInstance(hedges, hi++, 316 + i * 20, 0.9, -320, 12, 1.6, 1.2, 0);
    }
    hedges.count = hi;
    hedges.instanceMatrix.needsUpdate = true;
    this.group.add(hedges);
    // palms inside the compound
    this._addPalm(320, -376, 0.13, 1.15);
    this._addPalm(400, -376, 0.13, 1.05);
    this._addPalm(320, -322, 0.13, 1.1);
    this._addPalm(400, -322, 0.13, 1.2);
    var wallMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), this._mats.concrete, this._walls.length);
    wallMesh.castShadow = true;
    wallMesh.receiveShadow = true;
    wallMesh.frustumCulled = false;
    for (var w = 0; w < this._walls.length; w++) {
      var wl = this._walls[w];
      this._setInstance(wallMesh, w, (wl.x1 + wl.x2) / 2, 1.7, (wl.z1 + wl.z2) / 2,
        Math.max(0.6, Math.abs(wl.x2 - wl.x1)), 3.2, Math.max(0.6, Math.abs(wl.z2 - wl.z1)), 0);
    }
    wallMesh.instanceMatrix.needsUpdate = true;
    this.group.add(wallMesh);
  };

  World.prototype._addWall = function (x1, z1, x2, z2, h) {
    this._walls.push({ x1: x1, z1: z1, x2: x2, z2: z2 });
    var pad = 0.35;
    this.props.push({
      minX: Math.min(x1, x2) - pad, maxX: Math.max(x1, x2) + pad,
      minZ: Math.min(z1, z2) - pad, maxZ: Math.max(z1, z2) + pad,
      h: h, kind: 'wall'
    });
    if (h) this._wallHeight = h;
  };

  /* -------------------------------- marina -------------------------------- */

  World.prototype._buildMarina = function () {
    // sheds north and south of the mission point, leaving the quay clear
    this._addBuilding(-441, -248, 24, 16, 6.5, 'white', 0.1, { rooftop: false });
    this._addBuilding(-438, -132, 26, 15, 7, 'brick', 0.1, { rooftop: false });
    this._addBuilding(-445, -304, 18, 12, 5.5, 'white', 0.1, { rooftop: false });

    var dockMat = this._mats.plank;
    var dockGeo = new THREE.BoxGeometry(1, 1, 1);
    var docks = new THREE.InstancedMesh(dockGeo, dockMat, 5);
    var dz = [-268, -228, -188, -148, -108];
    for (var i = 0; i < dz.length; i++) {
      this._setInstance(docks, i, -500, 0.55, dz[i], 70, 0.25, 4.2, 0);
    }
    docks.instanceMatrix.needsUpdate = true;
    docks.receiveShadow = true;
    this.group.add(docks);

    var pileGeo = new THREE.CylinderGeometry(0.22, 0.26, 1, 6);
    var piles = new THREE.InstancedMesh(pileGeo, this._mats.wood, 5 * 5 * 2);
    var pi = 0;
    for (var d = 0; d < dz.length; d++) {
      for (var p = 0; p < 5; p++) {
        this._setInstance(piles, pi++, -468 - p * 15, 0.05, dz[d] - 1.7, 1, 1.2, 1, 0);
        this._setInstance(piles, pi++, -468 - p * 15, 0.05, dz[d] + 1.7, 1, 1.2, 1, 0);
      }
    }
    piles.instanceMatrix.needsUpdate = true;
    this.group.add(piles);

    // moored hulls
    var hullMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.58, metalness: 0.08 });
    var hulls = new THREE.InstancedMesh(new THREE.BoxGeometry(3.1, 1.1, 8.2), hullMat, 3);
    var cabins = new THREE.InstancedMesh(new THREE.BoxGeometry(2.2, 1.2, 3.1), hullMat, 3);
    hulls.frustumCulled = false;
    cabins.frustumCulled = false;
    for (var b = 0; b < 3; b++) {
      this._setInstance(hulls, b, -520 - b * 3, 0.45, dz[b + 1], 1, 1, 1, 0.08 * (b - 1));
      this._setInstance(cabins, b, -520 - b * 3, 1.35, dz[b + 1] + 1.3, 1, 1, 1, 0);
      this._color.set(b === 1 ? '#27454c' : '#f1eee2').convertSRGBToLinear();
      hulls.setColorAt(b, this._color);
      cabins.setColorAt(b, this._color);
    }
    hulls.instanceMatrix.needsUpdate = true;
    cabins.instanceMatrix.needsUpdate = true;
    if (hulls.instanceColor) hulls.instanceColor.needsUpdate = true;
    if (cabins.instanceColor) cabins.instanceColor.needsUpdate = true;
    this.group.add(hulls);
    this.group.add(cabins);

    this._addSign(makeSignCanvas('COSTA SOL MARINA', 'SLIPS 1–24 · FUEL · BAIT', {
      width: 512, height: 160, accent: '#28e0d0', titleSize: 52
    }), -452, 6.8, -180, 13, 4.1, Math.PI / 2);
    var postMat = this._mats.metal;
    for (var s = 0; s < 2; s++) {
      var post = new THREE.Mesh(new THREE.BoxGeometry(0.3, 7, 0.3), postMat);
      post.position.set(-452, 3.5, -186 + s * 12);
      this.group.add(post);
    }
  };

  /* --------------------------------- pier --------------------------------- */

  World.prototype._buildPier = function () {
    var deck = new THREE.Mesh(new THREE.BoxGeometry(215, 0.55, 16), this._mats.pier);
    deck.position.set(-585, 1.9, PIER_Z);
    deck.receiveShadow = true;
    deck.castShadow = true;
    this.group.add(deck);

    var endPad = new THREE.Mesh(new THREE.BoxGeometry(34, 0.55, 32), this._mats.pier);
    endPad.position.set(-686, 1.9, PIER_Z);
    endPad.receiveShadow = true;
    this.group.add(endPad);

    var pileGeo = new THREE.CylinderGeometry(0.34, 0.4, 1, 6);
    var piles = new THREE.InstancedMesh(pileGeo, this._mats.wood, 96);
    piles.frustumCulled = false;
    var pi = 0;
    for (var i = 0; i < 2; i++) {
      for (var p = 0; p < 26; p++) {
        this._setInstance(piles, pi++, -482 - p * 8, -1.4, PIER_Z - 7 + i * 14, 1, 7.4, 1, 0);
      }
    }
    for (var j = 0; j < 4; j++) {
      this._setInstance(piles, pi++, -700, -1.4, PIER_Z - 14 + j * 9, 1, 7.4, 1, 0);
      this._setInstance(piles, pi++, -672, -1.4, PIER_Z - 14 + j * 9, 1, 7.4, 1, 0);
    }
    piles.count = pi;
    piles.instanceMatrix.needsUpdate = true;
    this.group.add(piles);

    // railings
    var railGeo = new THREE.BoxGeometry(1, 1, 1);
    var railMat = this._mats.wood;
    var posts = new THREE.InstancedMesh(railGeo, railMat, 106);
    posts.frustumCulled = false;
    var ri = 0;
    for (var r = 0; r < 2; r++) {
      for (var q = 0; q < 53; q++) {
        this._setInstance(posts, ri++, -480 - q * 4, 2.8, PIER_Z - 8 + r * 16, 0.18, 1.4, 0.18, 0);
      }
    }
    posts.count = ri;
    posts.instanceMatrix.needsUpdate = true;
    this.group.add(posts);
    for (var side = 0; side < 2; side++) {
      var rail = new THREE.Mesh(new THREE.BoxGeometry(212, 0.16, 0.2), railMat);
      rail.position.set(-585, 3.25, PIER_Z - 8 + side * 16);
      this.group.add(rail);
    }

    // pier sheds
    this._addBuilding(-545, PIER_Z - 1, 16, 10, 5.5, 'white', 1.9, { parapet: false, rooftop: false });
    this._addBuilding(-620, PIER_Z + 2, 12, 9, 4.6, 'brick', 1.9, { parapet: false, rooftop: false });

    // pier lamps
    for (var l = 0; l < 6; l++) {
      this._lampSpots.push({ x: -500 - l * 26, z: PIER_Z + 6.6, base: 2.18, ry: 0 });
      this._lampSpots.push({ x: -500 - l * 26, z: PIER_Z - 6.6, base: 2.18, ry: Math.PI });
    }

    // ferris wheel on the end pad
    this._buildFerrisWheel(-688, PIER_Z);

    this._addSign(makeSignCanvas('OCEAN PIER', 'CASE · FERRIS · BAIT & TACKLE', {
      width: 640, height: 176, accent: '#ff2d95', titleSize: 62, subSize: 22
    }), -467, 6.4, PIER_Z, 17, 4.7, Math.PI / 2);
    var archMat = this._mats.metal;
    for (var a = 0; a < 2; a++) {
      var arch = new THREE.Mesh(new THREE.BoxGeometry(0.42, 7.2, 0.42), archMat);
      arch.position.set(-467, 3.6, PIER_Z - 8 + a * 16);
      this.group.add(arch);
    }
  };

  World.prototype._buildFerrisWheel = function (x, z) {
    var g = this.group;
    var wheel = new THREE.Group();
    wheel.position.set(x, 15.5, z);
    var rim = new THREE.Mesh(new THREE.TorusGeometry(13, 0.32, 6, 28), this._mats.metal);
    rim.rotation.y = Math.PI / 2;
    wheel.add(rim);
    var rim2 = new THREE.Mesh(new THREE.TorusGeometry(11.4, 0.18, 5, 24), this._mats.neon);
    rim2.rotation.y = Math.PI / 2;
    wheel.add(rim2);
    var spokeGeo = new THREE.BoxGeometry(0.14, 1, 0.14);
    var spokes = new THREE.InstancedMesh(spokeGeo, this._mats.metal, 16);
    for (var i = 0; i < 16; i++) {
      this._setInstance(spokes, i, 0, 0, 0, 1, 24.6, 1, 0, i / 16 * TAU);
    }
    spokes.instanceMatrix.needsUpdate = true;
    wheel.add(spokes);
    var gondGeo = new THREE.BoxGeometry(1.5, 1.4, 1.2);
    var gond = new THREE.InstancedMesh(gondGeo, this._mats.neon, 16);
    for (var d = 0; d < 16; d++) {
      var a = d / 16 * TAU;
      this._setInstance(gond, d, 0, Math.cos(a) * 13.2, Math.sin(a) * 13.2, 1, 1, 1, 0);
    }
    gond.instanceMatrix.needsUpdate = true;
    wheel.add(gond);
    var hub = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 1.6, 10), this._mats.metal);
    hub.rotation.z = Math.PI / 2;
    wheel.add(hub);
    g.add(wheel);
    for (var s = 0; s < 2; s++) {
      var leg = new THREE.Mesh(new THREE.BoxGeometry(0.8, 18, 0.8), this._mats.metal);
      leg.position.set(x, 11, z - 11 + s * 22);
      leg.rotation.x = s === 0 ? 0.24 : -0.24;
      g.add(leg);
    }
  };

  /* --------------------------------- parks -------------------------------- */

  World.prototype._buildParks = function () {
    // fountain in Plaza Sol (offset so the mission point stays clear)
    var fx = 50;
    var fz = 70;
    var base = new THREE.Mesh(new THREE.CylinderGeometry(6.2, 6.8, 0.8, 16), this._mats.trim);
    base.position.set(fx, 0.5, fz);
    this.group.add(base);
    var water = new THREE.Mesh(new THREE.CylinderGeometry(5.5, 5.5, 0.18, 16), this._mats.waterBasin);
    water.position.set(fx, 0.94, fz);
    this.group.add(water);
    var stem = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.15, 3.2, 10), this._mats.trim);
    stem.position.set(fx, 2.5, fz);
    this.group.add(stem);
    var bowl = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 1.6, 0.5, 12), this._mats.trim);
    bowl.position.set(fx, 4.2, fz);
    this.group.add(bowl);
    this.props.push({ minX: fx - 6.8, maxX: fx + 6.8, minZ: fz - 6.8, maxZ: fz + 6.8, h: 5, kind: 'fountain' });

    // plaza sign
    this._addSign(makeSignCanvas('PLAZA SOL', 'COSTA SOL · EST. 1954', {
      width: 512, height: 176, accent: '#f3c969', titleSize: 70
    }), 50, 4.8, 86, 12, 4.1, 0);
    for (var s = 0; s < 2; s++) {
      var post = new THREE.Mesh(new THREE.BoxGeometry(0.3, 5.2, 0.3), this._mats.metal);
      post.position.set(50, 2.6, 85.8);
      post.position.x = 44 + s * 12;
      this.group.add(post);
    }

    // benches
    var benchSeats = [];
    var benchBacks = [];
    var benchLegs = [];
    var self = this;
    function bench(x, z, yaw) {
      var nx = Math.sin(yaw);
      var nz = Math.cos(yaw);
      benchSeats.push({ x: x, z: z, yaw: yaw });
      benchBacks.push({ x: x - nx * 0.36, z: z - nz * 0.36, yaw: yaw });
      benchLegs.push({ x: x + Math.sin(yaw) * 0.7, z: z + Math.cos(yaw) * 0.7, yaw: yaw });
      benchLegs.push({ x: x - Math.sin(yaw) * 0.7, z: z - Math.cos(yaw) * 0.7, yaw: yaw });
    }
    for (var p = 0; p < this.blocks.length; p++) {
      var b = this.blocks[p];
      if (b.type === 'park') {
        for (var i = 0; i < 7; i++) {
          var a = i / 7 * TAU + 0.4;
          bench(b.cx + Math.cos(a) * 25, b.cz + Math.sin(a) * 25, -a + Math.PI / 2);
        }
      } else if (b.type === 'plaza') {
        for (var q = 0; q < 10; q++) {
          var aa = q / 10 * TAU;
          bench(b.cx + Math.cos(aa) * 13, b.cz + Math.sin(aa) * 13, -aa + Math.PI / 2);
        }
      } else if (b.type === 'estate') {
        for (var e = 0; e < 4; e++) {
          bench(340 + e * 13, -334, Math.PI);
        }
      } else if (b.type === 'promenade') {
        for (var pm = 0; pm < 3; pm++) {
          bench(b.cx - 9.5, b.cz - 22 + pm * 20, Math.PI / 2);
          bench(b.cx + 9.5, b.cz - 22 + pm * 20, -Math.PI / 2);
        }
      }
    }
    this._buildBenches(benchSeats, benchBacks, benchLegs);

    var promHedges = [];
    for (var hb = 0; hb < this.blocks.length; hb++) {
      if (this.blocks[hb].type !== 'promenade') continue;
      var hcx = this.blocks[hb].cx;
      var hcz = this.blocks[hb].cz;
      var rows = [-25.3, -9.5, 6.2, 22.5];
      for (var hr = 0; hr < rows.length; hr++) {
        promHedges.push({ x: hcx - 24, z: hcz + rows[hr] });
        promHedges.push({ x: hcx + 24, z: hcz + rows[hr] });
      }
    }
    if (promHedges.length) {
      var hedgeGeo = new THREE.BoxGeometry(1, 1, 1);
      var hedgeMesh = new THREE.InstancedMesh(hedgeGeo, this._mats.hedge, promHedges.length);
      hedgeMesh.castShadow = true;
      hedgeMesh.receiveShadow = true;
      hedgeMesh.frustumCulled = false;
      for (var ph = 0; ph < promHedges.length; ph++) {
        this._setInstance(hedgeMesh, ph, promHedges[ph].x, 0.42, promHedges[ph].z, 14.0, 0.64, 3.0, 0);
        this.props.push({ minX: promHedges[ph].x - 7.0, maxX: promHedges[ph].x + 7.0, minZ: promHedges[ph].z - 1.5, maxZ: promHedges[ph].z + 1.5, h: 0.8, kind: 'hedge' });
      }
      hedgeMesh.instanceMatrix.needsUpdate = true;
      this.group.add(hedgeMesh);
    }

    // park trees
    var trees = [];
    for (var t = 0; t < this.blocks.length; t++) {
      var tb = this.blocks[t];
      if (tb.type !== 'park' && tb.type !== 'plaza' && tb.type !== 'estate' && tb.type !== 'promenade') continue;
      var count = tb.type === 'park' ? 6 : 3;
      for (var k = 0; k < count; k++) {
        var tx = tb.cx + this._range(-30, 30);
        var tz = tb.cz + this._range(-30, 30);
        if (Math.abs(tx - 50) < 10 && Math.abs(tz - 70) < 10) continue;
        if (this._blockedAt(tx, tz, 2)) continue;
        trees.push({ x: tx, z: tz, s: this._range(0.8, 1.35) });
      }
    }
    this._buildTrees(trees);
  };

  World.prototype._buildBenches = function (seats, backs, legs) {
    var woodGeo = new THREE.BoxGeometry(1, 1, 1);
    var seatMesh = new THREE.InstancedMesh(woodGeo, this._mats.benchWood, seats.length);
    var backMesh = new THREE.InstancedMesh(woodGeo, this._mats.benchWood, backs.length);
    var legMesh = new THREE.InstancedMesh(woodGeo, this._mats.dark, legs.length);
    seatMesh.castShadow = true;
    backMesh.castShadow = true;
    var i;
    for (i = 0; i < seats.length; i++) {
      this._setInstance(seatMesh, i, seats[i].x, 0.62, seats[i].z, 2.1, 0.14, 0.62, seats[i].yaw);
    }
    for (i = 0; i < backs.length; i++) {
      this._setInstance(backMesh, i, backs[i].x, 1.02, backs[i].z, 2.1, 0.66, 0.12, backs[i].yaw);
    }
    for (i = 0; i < legs.length; i++) {
      this._setInstance(legMesh, i, legs[i].x, 0.3, legs[i].z, 0.12, 0.6, 0.5, legs[i].yaw);
    }
    seatMesh.instanceMatrix.needsUpdate = true;
    backMesh.instanceMatrix.needsUpdate = true;
    legMesh.instanceMatrix.needsUpdate = true;
    this.group.add(seatMesh);
    this.group.add(backMesh);
    this.group.add(legMesh);
  };

  World.prototype._buildTrees = function (trees) {
    if (!trees.length) return;
    var trunkGeo = new THREE.CylinderGeometry(0.22, 0.34, 1, 5);
    var canopyGeo = new THREE.SphereGeometry(1, 6, 5);
    var trunks = new THREE.InstancedMesh(trunkGeo, this._mats.trunk, trees.length);
    var canopies = new THREE.InstancedMesh(canopyGeo, this._mats.hedge, trees.length);
    trunks.castShadow = true;
    canopies.castShadow = true;
    for (var i = 0; i < trees.length; i++) {
      var t = trees[i];
      this._setInstance(trunks, i, t.x, 0.1 + 1.7 * t.s, t.z, 1, 3.4 * t.s, 1, 0);
      this._setInstance(canopies, i, t.x, 0.1 + 4.2 * t.s, t.z, 3.1 * t.s, 2.2 * t.s, 3.1 * t.s, 0);
      this._color.setHSL(0.29 + this._range(0, 0.035), 0.42, 0.28 + this._range(0, 0.1)).convertSRGBToLinear();
      canopies.setColorAt(i, this._color);
    }
    trunks.instanceMatrix.needsUpdate = true;
    canopies.instanceMatrix.needsUpdate = true;
    if (canopies.instanceColor) canopies.instanceColor.needsUpdate = true;
    this.group.add(trunks);
    this.group.add(canopies);
  };

  /* --------------------------------- palms -------------------------------- */

  World.prototype._palmAt = function (x, z, baseY, scale) {
    var sx = x - this.spawn.x;
    var sz = z - this.spawn.z;
    if (sx * sx + sz * sz < 81) return;
    this.palms.push({ x: x, z: z, base: baseY, s: scale || 1 });
    this.props.push({
      minX: x - 0.38, maxX: x + 0.38, minZ: z - 0.38, maxZ: z + 0.38,
      h: (baseY || 0) + 8, kind: 'palm'
    });
  };

  World.prototype._addPalm = function (x, z, baseY, scale) { this._palmAt(x, z, baseY, scale); };

  World.prototype._buildPalms = function () {
    var i;
    // Ocean Drive promenade
    for (var z = -430; z <= 440; z += 23) {
      if (z > PIER_Z - 16 && z < PIER_Z + 16) continue;
      this._palmAt(-456.5, z + this._range(-2, 2), 0.03, this._range(0.9, 1.25));
    }
    // east sidewalk of Ocean Drive
    for (var z2 = -420; z2 <= 440; z2 += 29) {
      this._palmAt(-385.5, z2 + this._range(-2, 2), 0.11, this._range(0.85, 1.2));
    }
    // beach clusters
    for (i = 0; i < 16; i++) {
      var bx = this._range(-500, -470);
      var bz = this._range(-430, 430);
      if (bz > PIER_Z - 22 && bz < PIER_Z + 22) continue;
      this._palmAt(bx, bz, this.groundHeight(bx, bz) + 0.02, this._range(0.85, 1.2));
    }
    // park + plaza palms
    for (i = 0; i < this.blocks.length; i++) {
      var b = this.blocks[i];
      if (b.type === 'park') {
        for (var k = 0; k < 7; k++) {
          var px = b.cx + this._range(-31, 31);
          var pz = b.cz + this._range(-31, 31);
          if (this._blockedAt(px, pz, 1.2)) continue;
          this._palmAt(px, pz, 0.13, this._range(0.9, 1.25));
        }
      } else if (b.type === 'plaza') {
        for (var q = 0; q < 8; q++) {
          var aa = q / 8 * TAU + 0.2;
          var qx = b.cx + Math.cos(aa) * 29;
          var qz = b.cz + Math.sin(aa) * 29;
          if (Math.abs(qx - 50) < 8 && Math.abs(qz - 70) < 8) continue;
          this._palmAt(qx, qz, 0.13, this._range(0.95, 1.2));
        }
      } else if (b.type === 'estate') {
        for (var e = 0; e < 5; e++) {
          this._palmAt(320 + e * 19, -390 + 4, 0.13, this._range(0.9, 1.15));
        }
      } else if (b.type === 'promenade') {
        for (var pm = 0; pm < 7; pm++) {
          var pma = pm / 7 * TAU + 0.5;
          this._palmAt(b.cx + Math.cos(pma) * 31, b.cz + Math.sin(pma) * 31, 0.13, this._range(0.95, 1.2));
        }
      }
    }
    // downtown boulevard
    for (i = 0; i < 14; i++) {
      var dz = -240 + i * 26;
      this._palmAt(309 + this._range(-1, 1), dz, 0.11, this._range(0.85, 1.1));
    }

    var trunkGeo = new THREE.CylinderGeometry(0.16, 0.3, 1, 5);
    trunkGeo.translate(0, 0.5, 0);
    var trunks = new THREE.InstancedMesh(trunkGeo, this._mats.trunk, this.palms.length);
    trunks.castShadow = true;
    trunks.receiveShadow = true;
    trunks.frustumCulled = false;

    var frondGeo = this._makeFrondGeometry();
    var frondMat = this._mats.leaf;
    var self = this;
    frondMat.onBeforeCompile = function (shader) {
      shader.uniforms.uTime = self._palmUniform;
      shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n' +
        'float swayPhase = instanceMatrix[3].x * 0.21 + instanceMatrix[3].z * 0.17;\n' +
        'transformed.z += sin(uTime * 1.2 + swayPhase) * transformed.x * transformed.x * 0.006;\n' +
        'transformed.y += cos(uTime * 0.9 + swayPhase) * transformed.x * transformed.x * 0.004;'
      );
    };
    frondMat.customProgramCacheKey = function () { return 'costa-palm-frond'; };

    var frondsPer = 9;
    var fronds = new THREE.InstancedMesh(frondGeo, frondMat, this.palms.length * frondsPer);
    fronds.castShadow = true;
    fronds.frustumCulled = false;
    var fi = 0;
    for (i = 0; i < this.palms.length; i++) {
      var p = this.palms[i];
      var h = 6.4 * p.s;
      this._setInstance(trunks, i, p.x, p.base, p.z, p.s, h, p.s, 0);
      this._color.setHSL(0.08, 0.34, 0.4 + this._range(0, 0.08)).convertSRGBToLinear();
      trunks.setColorAt(i, this._color);
      for (var f = 0; f < frondsPer; f++) {
        var yaw = f / frondsPer * TAU + this._range(-0.16, 0.16);
        var tilt = this._range(-0.24, 0.42);
        this._euler.set(tilt, yaw, 0, 'YXZ');
        this._quat.setFromEuler(this._euler);
        this._mat4.compose(
          this._vec3.set(p.x, p.base + h, p.z),
          this._quat,
          this._scale3.set(p.s, p.s, p.s)
        );
        fronds.setMatrixAt(fi++, this._mat4);
      }
    }
    trunks.instanceMatrix.needsUpdate = true;
    if (trunks.instanceColor) trunks.instanceColor.needsUpdate = true;
    fronds.instanceMatrix.needsUpdate = true;
    this.group.add(trunks);
    this.group.add(fronds);
  };

  World.prototype._makeFrondGeometry = function () {
    var seg = 4;
    var len = 4.4;
    var pos = [];
    var idx = [];
    for (var i = 0; i <= seg; i++) {
      var t = i / seg;
      var x = t * len;
      var y = -1.5 * t * t;
      var w = (1 - t) * 0.36 + 0.025;
      pos.push(x, y, -w, x, y + 0.05, w);
    }
    for (var s = 0; s < seg; s++) {
      var a = s * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
  };

  /* ------------------------------- furniture ------------------------------ */

  World.prototype._blockedAt = function (x, z, pad) {
    pad = pad || 0;
    for (var i = 0; i < this.buildings.length; i++) {
      var b = this.buildings[i];
      if (x > b.minX - pad && x < b.maxX + pad && z > b.minZ - pad && z < b.maxZ + pad) return true;
    }
    return false;
  };

  World.prototype._buildStreetProps = function () {
    var i;
    // Street lights along Ocean Drive and the main boulevards
    for (var z = -450; z <= 450; z += 34) {
      if (z > PIER_Z - 12 && z < PIER_Z + 12) continue;
      this._lampSpots.push({ x: -389, z: z, base: 0.11, ry: Math.PI });
    }
    var crossRoads = [-400, -200, 0, 200, 400];
    for (var ci = 0; ci < crossRoads.length; ci++) {
      for (var x = -300; x <= 300; x += 70) {
        this._lampSpots.push({ x: x, z: crossRoads[ci] + 10.5, base: 0.11, ry: 0 });
      }
    }
    var vertRoads = [-200, 0, 200];
    for (var vi = 0; vi < vertRoads.length; vi++) {
      for (var z2 = -300; z2 <= 300; z2 += 72) {
        this._lampSpots.push({ x: vertRoads[vi] + 10.5, z: z2, base: 0.11, ry: Math.PI / 2 });
      }
    }
    // plaza lamps
    for (i = 0; i < 6; i++) {
      var a = i / 6 * TAU;
      this._lampSpots.push({ x: 50 + Math.cos(a) * 20, z: 50 + Math.sin(a) * 20, base: 0.14, ry: -a });
    }
    // park lamps
    for (i = 0; i < this.blocks.length; i++) {
      if (this.blocks[i].type !== 'park') continue;
      this._lampSpots.push({ x: this.blocks[i].cx - 22, z: this.blocks[i].cz, base: 0.14, ry: 0 });
      this._lampSpots.push({ x: this.blocks[i].cx + 22, z: this.blocks[i].cz, base: 0.14, ry: Math.PI });
    }

    var poleGeo = new THREE.CylinderGeometry(0.09, 0.13, 1, 6);
    poleGeo.translate(0, 0.5, 0);
    var poles = new THREE.InstancedMesh(poleGeo, this._mats.metal, this._lampSpots.length);
    poles.castShadow = true;
    poles.frustumCulled = false;
    var arms = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), this._mats.metal, this._lampSpots.length);
    arms.frustumCulled = false;
    var heads = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), this._mats.lamp, this._lampSpots.length);
    heads.frustumCulled = false;
    var glowPositions = new Float32Array(this._lampSpots.length * 3);
    var top = 6.9;
    for (i = 0; i < this._lampSpots.length; i++) {
      var L = this._lampSpots[i];
      var nx = Math.sin(L.ry);
      var nz = Math.cos(L.ry);
      this._setInstance(poles, i, L.x, L.base, L.z, 1, top, 1, 0);
      this._setInstance(arms, i, L.x + nx * 1.0, L.base + top - 0.15, L.z + nz * 1.0, 2.1, 0.12, 0.12, L.ry);
      this._setInstance(heads, i, L.x + nx * 1.95, L.base + top - 0.2, L.z + nz * 1.95, 0.8, 0.24, 0.34, L.ry);
      glowPositions[i * 3] = L.x + nx * 1.95;
      glowPositions[i * 3 + 1] = L.base + top - 0.24;
      glowPositions[i * 3 + 2] = L.z + nz * 1.95;
    }
    poles.instanceMatrix.needsUpdate = true;
    arms.instanceMatrix.needsUpdate = true;
    heads.instanceMatrix.needsUpdate = true;
    this.group.add(poles);
    this.group.add(arms);
    this.group.add(heads);
    var glowGeo = new THREE.BufferGeometry();
    glowGeo.setAttribute('position', new THREE.BufferAttribute(glowPositions, 3));
    var glows = new THREE.Points(glowGeo, this._mats.lampGlow);
    glows.frustumCulled = false;
    glows.visible = false;
    this.group.add(glows);
    this._lampGlowMesh = glows;

    // traffic signals at twelve intersections
    var nodeInts = [[1, 1], [1, 3], [1, 5], [3, 1], [3, 3], [3, 5], [5, 1], [5, 3], [5, 5], [7, 5], [1, 7], [7, 1]];
    var sigPoles = [];
    var sigHeads = [];
    var sigFaces = [];
    for (i = 0; i < nodeInts.length; i++) {
      var rx = ROAD_X[nodeInts[i][0]];
      var rz = ROAD_Z[nodeInts[i][1]];
      for (var corner = 0; corner < 2; corner++) {
        var sx = rx + (corner === 0 ? 10.4 : -10.4);
        var sz = rz + (corner === 0 ? 10.4 : -10.4);
        var yaw = Math.atan2(rx - sx, rz - sz);
        sigPoles.push({ x: sx, z: sz, yaw: yaw });
        sigHeads.push({ x: sx, z: sz, yaw: yaw });
        sigFaces.push({ x: sx, z: sz, yaw: yaw });
      }
    }
    var sp = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.1, 0.12, 1, 6), this._mats.metal, sigPoles.length);
    sp.frustumCulled = false;
    var sh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), this._mats.dark, sigHeads.length);
    sh.frustumCulled = false;
    var sigMat = new THREE.MeshBasicMaterial({ map: this._tex.signal, toneMapped: false });
    var sf = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.5, 1.2), sigMat, sigFaces.length);
    sf.frustumCulled = false;
    for (i = 0; i < sigPoles.length; i++) {
      var S = sigPoles[i];
      this._setInstance(sp, i, S.x, 0.11, S.z, 1, 4.4, 1, 0);
      this._setInstance(sh, i, S.x, 4.35, S.z, 0.52, 1.3, 0.42, S.yaw);
      var fx = S.x + Math.sin(S.yaw) * 0.24;
      var fz = S.z + Math.cos(S.yaw) * 0.24;
      this._setInstance(sf, i, fx, 4.35, fz, 1, 1, 1, S.yaw);
      this.props.push({ minX: S.x - 0.25, maxX: S.x + 0.25, minZ: S.z - 0.25, maxZ: S.z + 0.25, h: 5, kind: 'signal' });
    }
    sp.instanceMatrix.needsUpdate = true;
    sh.instanceMatrix.needsUpdate = true;
    sf.instanceMatrix.needsUpdate = true;
    this.group.add(sp);
    this.group.add(sh);
    this.group.add(sf);

    // hydrants
    var hyd = [];
    var bins = [];
    for (i = 0; i < this.blocks.length; i += 3) {
      var b = this.blocks[i];
      hyd.push({ x: b.cx - 40, z: b.cz - 40 });
      bins.push({ x: b.cx + 40, z: b.cz + 40 });
      bins.push({ x: b.cx - 40, z: b.cz + 40 });
    }
    var hGeo = new THREE.CylinderGeometry(0.17, 0.2, 0.85, 6);
    var hMesh = new THREE.InstancedMesh(hGeo, this._mats.red, hyd.length);
    hMesh.castShadow = true;
    hMesh.frustumCulled = false;
    var capGeo = new THREE.SphereGeometry(0.2, 6, 4);
    var capMesh = new THREE.InstancedMesh(capGeo, this._mats.red, hyd.length);
    capMesh.frustumCulled = false;
    for (i = 0; i < hyd.length; i++) {
      this._setInstance(hMesh, i, hyd[i].x, 0.45, hyd[i].z, 1, 1, 1, 0);
      this._setInstance(capMesh, i, hyd[i].x, 0.9, hyd[i].z, 1, 1, 1, 0);
      this.props.push({ minX: hyd[i].x - 0.3, maxX: hyd[i].x + 0.3, minZ: hyd[i].z - 0.3, maxZ: hyd[i].z + 0.3, h: 1, kind: 'hydrant' });
    }
    hMesh.instanceMatrix.needsUpdate = true;
    capMesh.instanceMatrix.needsUpdate = true;
    this.group.add(hMesh);
    this.group.add(capMesh);

    var bGeo = new THREE.CylinderGeometry(0.3, 0.24, 0.95, 7);
    var bMesh = new THREE.InstancedMesh(bGeo, this._mats.bin, bins.length);
    bMesh.castShadow = true;
    bMesh.frustumCulled = false;
    for (i = 0; i < bins.length; i++) {
      this._setInstance(bMesh, i, bins[i].x, 0.55, bins[i].z, 1, 1, 1, 0);
    }
    bMesh.instanceMatrix.needsUpdate = true;
    this.group.add(bMesh);

    this._buildBusStops();
  };

  World.prototype._buildBusStops = function () {
    var stops = [
      { x: -388, z: -120, ry: Math.PI / 2 },
      { x: 388, z: 200, ry: -Math.PI / 2 },
      { x: 100, z: 388, ry: 0 },
      { x: -200, z: -388, ry: Math.PI },
      { x: 388, z: -300, ry: -Math.PI / 2 }
    ];
    var frameGeo = new THREE.BoxGeometry(1, 1, 1);
    var posts = new THREE.InstancedMesh(frameGeo, this._mats.metal, stops.length * 4);
    var roofs = new THREE.InstancedMesh(frameGeo, this._mats.shelter, stops.length);
    var benches = new THREE.InstancedMesh(frameGeo, this._mats.benchWood, stops.length);
    var adTex = canvasTexture(makeSignCanvas('COSTA SOL TRANSIT', 'NEXT BUS · 6 MIN', {
      width: 256, height: 384, accent: '#28e0d0', titleSize: 38, subSize: 18
    }), { clamp: true });
    var adMat = new THREE.MeshBasicMaterial({ map: adTex, toneMapped: false });
    var ads = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.3, 2.0), adMat, stops.length);
    ads.frustumCulled = false;
    var pi = 0;
    for (var i = 0; i < stops.length; i++) {
      var s = stops[i];
      var sx = Math.sin(s.ry);
      var sz = Math.cos(s.ry);
      for (var p = 0; p < 4; p++) {
        var ox = p < 2 ? -1.9 : 1.9;
        var oz = (p % 2 === 0 ? -1.5 : 1.5);
        this._setInstance(posts, pi++, s.x + Math.cos(s.ry) * ox + sx * oz, 1.4, s.z - Math.sin(s.ry) * ox + sz * oz, 0.09, 2.7, 0.09, 0);
      }
      this._setInstance(roofs, i, s.x, 2.78, s.z, 4.3, 0.14, 1.8, s.ry);
      this._setInstance(benches, i, s.x, 0.55, s.z + sz * 0.7, 2.6, 0.14, 0.55, s.ry);
      this._setInstance(ads, i, s.x + sx * 1.1, 1.55, s.z + sz * 1.1, 1, 1, 1, s.ry);
      this.props.push({ minX: s.x - 2.4, maxX: s.x + 2.4, minZ: s.z - 1.8, maxZ: s.z + 1.8, h: 2.9, kind: 'shelter' });
    }
    posts.instanceMatrix.needsUpdate = true;
    roofs.instanceMatrix.needsUpdate = true;
    benches.instanceMatrix.needsUpdate = true;
    ads.instanceMatrix.needsUpdate = true;
    this.group.add(posts);
    this.group.add(roofs);
    this.group.add(benches);
    this.group.add(ads);
  };

  /* -------------------------------- beach --------------------------------- */

  World.prototype._buildBeach = function () {
    var i;
    var umbrellaPoles = [];
    var umbrellaTops = [];
    var loungers = [];
    var towels = [];
    var umbCols = ['#ff6f61', '#28e0d0', '#f3c969', '#f4efe2', '#ff5db1'];
    for (i = 0; i < 26; i++) {
      var x = this._range(-501, -468);
      var z = this._range(-220, 440);
      if (z > PIER_Z - 18 && z < PIER_Z + 18) continue;
      if (x > -492 && z > 130 && z < 166) continue;
      var y = this.groundHeight(x, z);
      umbrellaPoles.push({ x: x, z: z, y: y });
      umbrellaTops.push({ x: x, z: z, y: y + 2.25, c: umbCols[i % umbCols.length] });
      var la = this._range(0, TAU);
      loungers.push({ x: x + Math.cos(la) * 1.7, z: z + Math.sin(la) * 1.7, y: this.groundHeight(x, z), yaw: la });
      loungers.push({ x: x + Math.cos(la) * 3.0, z: z + Math.sin(la) * 3.0, y: this.groundHeight(x, z), yaw: la });
      towels.push({ x: x + Math.cos(la + 1.4) * 2.4, z: z + Math.sin(la + 1.4) * 2.4, c: umbCols[(i + 2) % umbCols.length] });
    }
    var poleGeo = new THREE.CylinderGeometry(0.06, 0.08, 1, 5);
    var poles = new THREE.InstancedMesh(poleGeo, this._mats.metal, umbrellaPoles.length);
    var coneGeo = new THREE.ConeGeometry(1.9, 0.62, 8);
    var tops = new THREE.InstancedMesh(coneGeo, this._mats.umbrella, umbrellaTops.length);
    tops.castShadow = true;
    for (i = 0; i < umbrellaPoles.length; i++) {
      var u = umbrellaPoles[i];
      this._setInstance(poles, i, u.x, u.y + 1.2, u.z, 1, 2.4, 1, 0);
      var t = umbrellaTops[i];
      this._setInstance(tops, i, t.x, t.y, t.z, 1, 1, 1, this._range(0, TAU));
      this._color.set(t.c).convertSRGBToLinear();
      tops.setColorAt(i, this._color);
    }
    poles.instanceMatrix.needsUpdate = true;
    tops.instanceMatrix.needsUpdate = true;
    if (tops.instanceColor) tops.instanceColor.needsUpdate = true;
    this.group.add(poles);
    this.group.add(tops);

    var loungeGeo = new THREE.BoxGeometry(0.78, 0.2, 1.95);
    var loungeMesh = new THREE.InstancedMesh(loungeGeo, this._mats.umbrella, loungers.length);
    loungeMesh.castShadow = true;
    loungeMesh.frustumCulled = false;
    for (i = 0; i < loungers.length; i++) {
      var l = loungers[i];
      this._setInstance(loungeMesh, i, l.x, l.y + 0.32, l.z, 1, 1, 1, l.yaw);
      this._color.set(i % 3 === 0 ? '#f4efe2' : '#d8d2c2').convertSRGBToLinear();
      loungeMesh.setColorAt(i, this._color);
    }
    loungeMesh.instanceMatrix.needsUpdate = true;
    if (loungeMesh.instanceColor) loungeMesh.instanceColor.needsUpdate = true;
    this.group.add(loungeMesh);

    var towelGeo = new THREE.PlaneGeometry(1.5, 0.95);
    towelGeo.rotateX(-Math.PI / 2);
    var towelMesh = new THREE.InstancedMesh(towelGeo, this._mats.towel, towels.length);
    towelMesh.frustumCulled = false;
    for (i = 0; i < towels.length; i++) {
      var tw = towels[i];
      this._setInstance(towelMesh, i, tw.x, this.groundHeight(tw.x, tw.z) + 0.035, tw.z, 1, 1, 1, this._range(0, TAU));
      this._color.set(tw.c).convertSRGBToLinear();
      towelMesh.setColorAt(i, this._color);
    }
    towelMesh.instanceMatrix.needsUpdate = true;
    if (towelMesh.instanceColor) towelMesh.instanceColor.needsUpdate = true;
    this.group.add(towelMesh);

    this._buildLifeguardTower(-488, 148);
    this._buildBeachCourt(-487, 32);
  };

  World.prototype._buildBeachCourt = function (x, z) {
    var y = this.groundHeight(x, z);
    var postMat = this._mats.metal;
    for (var s = -1; s <= 1; s += 2) {
      var post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 2.5, 5), postMat);
      post.position.set(x, y + 1.25, z + s * 4.2);
      this.group.add(post);
    }
    var netCanvas = makeCanvas(128, 64);
    var ng = netCanvas.getContext('2d');
    ng.clearRect(0, 0, 128, 64);
    ng.strokeStyle = 'rgba(245,240,225,0.8)';
    ng.lineWidth = 1;
    for (var i = 0; i <= 16; i++) {
      ng.beginPath(); ng.moveTo(i * 8, 0); ng.lineTo(i * 8, 64); ng.stroke();
    }
    for (var j = 0; j <= 8; j++) {
      ng.beginPath(); ng.moveTo(0, j * 8); ng.lineTo(128, j * 8); ng.stroke();
    }
    var netTex = canvasTexture(netCanvas, { clamp: true });
    var net = new THREE.Mesh(new THREE.PlaneGeometry(8.2, 1.15), new THREE.MeshBasicMaterial({
      map: netTex, transparent: true, side: THREE.DoubleSide, depthWrite: false, toneMapped: false
    }));
    net.position.set(x, y + 2.1, z);
    net.rotation.y = Math.PI / 2;
    this.group.add(net);
    this.props.push({ minX: x - 0.2, maxX: x + 0.2, minZ: z - 4.3, maxZ: z + 4.3, h: 2.5, kind: 'net' });
  };

  World.prototype._buildLifeguardTower = function (x, z) {
    var y = this.groundHeight(x, z);
    var deck = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.35, 5.2), this._mats.pier);
    deck.position.set(x, y + 2.3, z);
    deck.castShadow = true;
    this.group.add(deck);
    for (var i = 0; i < 4; i++) {
      var post = new THREE.Mesh(new THREE.BoxGeometry(0.28, 2.3, 0.28), this._mats.wood);
      post.position.set(x + (i < 2 ? -2.3 : 2.3), y + 1.15, z + (i % 2 === 0 ? -2.1 : 2.1));
      this.group.add(post);
    }
    var hut = new THREE.Mesh(new THREE.BoxGeometry(4.6, 2.5, 4.2), this._mats.concrete);
    hut.position.set(x, y + 3.75, z);
    hut.castShadow = true;
    this.group.add(hut);
    var roof = new THREE.Mesh(new THREE.ConeGeometry(4.3, 1.5, 4), this._mats.yellow);
    roof.position.set(x, y + 5.7, z);
    roof.rotation.y = Math.PI / 4;
    this.group.add(roof);
    var ramp = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 7.4), this._mats.plank);
    ramp.rotation.x = -Math.PI / 2;
    ramp.rotation.z = 0;
    ramp.position.set(x, y + 1.25, z + 6.0);
    ramp.rotation.x = -Math.PI / 2 + 0.28;
    this.group.add(ramp);
    var flagPole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 5, 5), this._mats.metal);
    flagPole.position.set(x + 2.9, y + 5, z - 2.2);
    this.group.add(flagPole);
    var flag = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.0), new THREE.MeshStandardMaterial({ color: 0xc94a43, side: THREE.DoubleSide }));
    flag.position.set(x + 3.8, y + 7.0, z - 2.2);
    flag.rotation.y = 0.4;
    this.group.add(flag);
    this.props.push({ minX: x - 3.1, maxX: x + 3.1, minZ: z - 2.9, maxZ: z + 2.9, h: 6, kind: 'lifeguard' });
  };

  /* ------------------------------- billboards ----------------------------- */

  World.prototype._buildBillboards = function () {
    var ads = [
      { x: 447, z: -90, ry: -Math.PI / 2, kind: 'serata' },
      { x: 447, z: 250, ry: -Math.PI / 2, kind: 'tourism' },
      { x: -446, z: 404, ry: Math.PI / 2, kind: 'crowe' }
    ];
    var panelMat = [];
    var panelGeo = new THREE.PlaneGeometry(15, 7.5);
    var boxGeo = new THREE.BoxGeometry(1, 1, 1);
    var frames = new THREE.InstancedMesh(boxGeo, this._mats.metal, ads.length);
    var posts = new THREE.InstancedMesh(boxGeo, this._mats.dark, ads.length * 2);
    frames.castShadow = true;
    posts.castShadow = true;
    frames.frustumCulled = false;
    posts.frustumCulled = false;
    var pi = 0;
    for (var i = 0; i < ads.length; i++) {
      var a = ads[i];
      var tex = canvasTexture(makeAdCanvas(a.kind), { clamp: true });
      var mat = new THREE.MeshStandardMaterial({
        map: tex, emissiveMap: tex, emissive: 0xffffff,
        emissiveIntensity: 0.14, roughness: 0.75, metalness: 0.02
      });
      panelMat.push(mat);
      var nx = Math.sin(a.ry);
      var nz = Math.cos(a.ry);
      var rx = Math.cos(a.ry);
      var rz = -Math.sin(a.ry);
      var panel = new THREE.Mesh(panelGeo, mat);
      panel.position.set(a.x + nx * 0.26, 10.5, a.z + nz * 0.26);
      panel.rotation.y = a.ry;
      this.group.add(panel);
      this._setInstance(frames, i, a.x, 10.5, a.z, 15.9, 8.4, 0.32, a.ry);
      for (var p = -1; p <= 1; p += 2) {
        this._setInstance(posts, pi++, a.x + rx * p * 5.2, 5.25, a.z + rz * p * 5.2, 0.42, 10.5, 0.42, 0);
      }
      this.props.push({ minX: a.x - 2, maxX: a.x + 2, minZ: a.z - 8, maxZ: a.z + 8, h: 14, kind: 'billboard' });
    }
    frames.instanceMatrix.needsUpdate = true;
    posts.instanceMatrix.needsUpdate = true;
    this.group.add(frames);
    this.group.add(posts);
    this._billboardMats = panelMat;
  };

  World.prototype._buildGantries = function () {
    var gantry = function (x, z, text) {
      var mat = this._mats.metal;
      for (var i = -1; i <= 1; i += 2) {
        var post = new THREE.Mesh(new THREE.BoxGeometry(0.55, 7.2, 0.55), mat);
        post.position.set(x + i * 15.5, 3.6, z);
        post.castShadow = true;
        this.group.add(post);
      }
      var beam = new THREE.Mesh(new THREE.BoxGeometry(32, 0.7, 0.7), mat);
      beam.position.set(x, 7.2, z);
      this.group.add(beam);
      this._addSign(makeSignCanvas(text, 'KEEP LEFT · COSTA SOL', {
        width: 640, height: 192, accent: '#f3c969', titleSize: 58
      }), x, 8.2, z + 0.4, 17, 5.1, 0);
    };
    gantry.call(this, 400, 62, 'RING ROAD 95');
    gantry.call(this, -400, -160, 'OCEAN DRIVE');
  };

  /* -------------------------------- signage ------------------------------- */

  World.prototype._buildPointSigns = function () {
    // ground plaques at world-service points, leaving mission markers to missions.js
    var defs = [
      { p: 'marina', label: 'MARINA', color: '#28e0d0' },
      { p: 'oceanHotel', label: 'OCEAN HOTEL', color: '#ff2d95' },
      { p: 'plazaSol', label: 'PLAZA SOL', color: '#f3c969' },
      { p: 'pier', label: 'THE PIER', color: '#ff6f61' },
      { p: 'estateGate', label: 'ESTATE GATE', color: '#f3c969' },
      { p: 'garage', label: 'DEZ GARAGE', color: '#63e6a4' },
      { p: 'policeStation', label: 'CSPD', color: '#5cb7ff' },
      { p: 'hospital', label: 'HOSPITAL', color: '#ff4d55' },
      { p: 'ammuNation', label: 'AMMU-NATION', color: '#ff6f61' },
      { p: 'safehouse', label: 'SAFEHOUSE', color: '#63e6a4' }
    ];
    var ringGeo = new THREE.RingGeometry(2.2, 2.7, 24);
    ringGeo.rotateX(-Math.PI / 2);
    var mat = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.4,
      side: THREE.DoubleSide, depthWrite: false, toneMapped: false
    });
    var rings = new THREE.InstancedMesh(ringGeo, mat, defs.length);
    rings.frustumCulled = false;
    rings.renderOrder = 2;
    var ri = 0;
    for (var i = 0; i < defs.length; i++) {
      var d = defs[i];
      var pt = this.points[d.p];
      if (!pt) continue;
      this._setInstance(rings, ri, pt.x, 0.17, pt.z, 1, 1, 1, 0);
      this._color.set(d.color).convertSRGBToLinear();
      rings.setColorAt(ri, this._color);
      ri++;
    }
    rings.count = ri;
    rings.instanceMatrix.needsUpdate = true;
    if (rings.instanceColor) rings.instanceColor.needsUpdate = true;
    this.group.add(rings);
  };

  World.prototype._buildSunSprite = function () {
    var mat = new THREE.SpriteMaterial({
      map: this._tex.sun, color: 0xffd9a0, transparent: true,
      opacity: 0.56, depthWrite: false, fog: false, toneMapped: false
    });
    var sprite = new THREE.Sprite(mat);
    sprite.position.set(-760, 128, 160);
    sprite.scale.set(190, 190, 1);
    this._sunSprite = sprite;
    this._sunMat = mat;
    this.group.add(sprite);
  };

  /* ------------------------------- road graph ----------------------------- */

  World.prototype._buildRoadGraph = function () {
    var nodes = [];
    var edges = [];
    var xi, zi, id;
    for (zi = 0; zi < ROAD_Z.length; zi++) {
      for (xi = 0; xi < ROAD_X.length; xi++) {
        id = zi * ROAD_X.length + xi;
        nodes.push({ id: id, xi: xi, zi: zi, x: ROAD_X[xi], z: ROAD_Z[zi] });
      }
    }
    function addPair(a, b) {
      var ax = a.x, az = a.z, bx = b.x, bz = b.z;
      var len = Math.sqrt((bx - ax) * (bx - ax) + (bz - az) * (bz - az));
      var h1 = Math.atan2(bx - ax, bz - az);
      edges.push({ a: a.id, b: b.id, ax: ax, az: az, bx: bx, bz: bz, dir: 1, lane: 2.2, length: len, heading: h1 });
      edges.push({ a: b.id, b: a.id, ax: bx, az: bz, bx: ax, bz: az, dir: -1, lane: 2.2, length: len, heading: norm(h1 + Math.PI) });
      a.links = a.links || [];
      b.links = b.links || [];
      a.links.push(b.id);
      b.links.push(a.id);
    }
    for (zi = 0; zi < ROAD_Z.length; zi++) {
      for (xi = 0; xi < ROAD_X.length; xi++) {
        id = zi * ROAD_X.length + xi;
        if (xi + 1 < ROAD_X.length) addPair(nodes[id], nodes[id + 1]);
        if (zi + 1 < ROAD_Z.length) addPair(nodes[id], nodes[id + ROAD_X.length]);
      }
    }
    this.roadGraph = { nodes: nodes, edges: edges };
  };

  World.prototype.lanePoint = function (a, b, dir, out) {
    if (typeof a === 'number') a = this.roadGraph.nodes[a];
    if (typeof b === 'number') b = this.roadGraph.nodes[b];
    if (!a || !b) {
      out = out || {};
      out.x = 0; out.z = 0; out.heading = 0;
      return out;
    }
    var dx = b.x - a.x;
    var dz = b.z - a.z;
    var len = Math.sqrt(dx * dx + dz * dz) || 1;
    var rx = -dz / len;
    var rz = dx / len;
    var off = (dir === -1 ? -1 : 1) * 2.2;
    var res = out || {};
    res.x = (a.x + b.x) * 0.5 + rx * off;
    res.z = (a.z + b.z) * 0.5 + rz * off;
    res.heading = Math.atan2(dx * (dir === -1 ? -1 : 1), dz * (dir === -1 ? -1 : 1));
    return res;
  };

  World.prototype.randomRoadPose = function (rng) {
    var r = rng || this.rng;
    if (!this.roadGraph || !this.roadGraph.edges.length) return { x: 0, z: 0, heading: 0 };
    var edge = r ? r.pick(this.roadGraph.edges) : this.roadGraph.edges[Math.floor(Math.random() * this.roadGraph.edges.length)];
    var t = r ? r.range(0.2, 0.8) : 0.2 + Math.random() * 0.6;
    var a = this.roadGraph.nodes[edge.a];
    var b = this.roadGraph.nodes[edge.b];
    var dx = b.x - a.x;
    var dz = b.z - a.z;
    var len = Math.sqrt(dx * dx + dz * dz) || 1;
    var rx = -dz / len;
    var rz = dx / len;
    var off = 2.2 * (edge.dir === -1 ? -1 : 1);
    var p = {
      x: a.x + dx * t + rx * off,
      z: a.z + dz * t + rz * off,
      heading: edge.heading,
      edge: edge,
      nodeA: a,
      nodeB: b,
      dir: edge.dir
    };
    if (r) p.speed = r.range(8, 15);
    return p;
  };

  World.prototype.nearestRoad = function (x, z, out) {
    var res = out || {};
    var bestX = 1e9;
    var bestXi = 0;
    var i;
    for (i = 0; i < ROAD_X.length; i++) {
      var dx = Math.abs(x - ROAD_X[i]);
      if (dx < bestX) { bestX = dx; bestXi = i; }
    }
    var bestZ = 1e9;
    var bestZi = 0;
    for (i = 0; i < ROAD_Z.length; i++) {
      var dz = Math.abs(z - ROAD_Z[i]);
      if (dz < bestZ) { bestZ = dz; bestZi = i; }
    }
    if (bestX <= bestZ) {
      res.x = ROAD_X[bestXi];
      res.z = z;
      res.dist = bestX;
      res.vertical = true;
      res.index = bestXi;
      res.crossIndex = bestZi;
      res.heading = 0;
    } else {
      res.x = x;
      res.z = ROAD_Z[bestZi];
      res.dist = bestZ;
      res.vertical = false;
      res.index = bestZi;
      res.crossIndex = bestXi;
      res.heading = Math.PI / 2;
    }
    return res;
  };

  World.prototype.isOnRoad = function (x, z) {
    if (x < -460 || x > 500 || z < -500 || z > 500) return false;
    var i;
    for (i = 0; i < ROAD_X.length; i++) {
      if (Math.abs(x - ROAD_X[i]) <= ROAD_HALF) return true;
    }
    for (i = 0; i < ROAD_Z.length; i++) {
      if (Math.abs(z - ROAD_Z[i]) <= ROAD_HALF) return true;
    }
    return false;
  };

  World.prototype.districtAt = function (x, z) {
    var list = (window.LH.CONFIG && window.LH.CONFIG.WORLD && window.LH.CONFIG.WORLD.districts) || [];
    for (var i = 0; i < list.length; i++) {
      var d = list[i];
      if (x >= d.minX && x <= d.maxX && z >= d.minZ && z <= d.maxZ) return d.name;
    }
    if (x < BEACH_X) return 'COSTA BEACH';
    if (x > 300 && z < -260) return 'CROWE ESTATE';
    if (z > 200) return 'SOUTHSIDE';
    if (z < -200) return 'NORTHSIDE';
    if (x > 100) return 'DOWNTOWN';
    return 'COSTA SOL';
  };

  World.prototype.groundHeight = function (x, z) {
    if (x >= BEACH_X) return 0;
    var t = clamp((BEACH_X - x) / 60, 0, 1);
    return 0.02 - 0.64 * t + Math.sin(z * 0.07) * 0.012 * t;
  };

  World.prototype.collideCircle = function (x, z, r) {
    r = r || 0.45;
    var hit = false;
    var list = this.colliders;
    for (var pass = 0; pass < 2; pass++) {
      for (var i = 0; i < list.length; i++) {
        var b = list[i];
        var minX = b.minX - r;
        var maxX = b.maxX + r;
        var minZ = b.minZ - r;
        var maxZ = b.maxZ + r;
        if (x <= minX || x >= maxX || z <= minZ || z >= maxZ) continue;
        var dx1 = x - minX;
        var dx2 = maxX - x;
        var dz1 = z - minZ;
        var dz2 = maxZ - z;
        var m = dx1;
        var axis = 0;
        if (dx2 < m) { m = dx2; axis = 1; }
        if (dz1 < m) { m = dz1; axis = 2; }
        if (dz2 < m) { m = dz2; axis = 3; }
        if (axis === 0) x = minX;
        else if (axis === 1) x = maxX;
        else if (axis === 2) z = minZ;
        else z = maxZ;
        hit = true;
      }
    }
    if (x < -510) { x = -510; hit = true; }
    if (x > 497) { x = 497; hit = true; }
    if (z < -497) { z = -497; hit = true; }
    if (z > 497) { z = 497; hit = true; }
    return { x: x, z: z, hit: hit };
  };

  /* ------------------------------- minimap -------------------------------- */

  World.prototype._buildMinimap = function () {
    var S = 512;
    var c = makeCanvas(S, S);
    var g = c.getContext('2d');
    var X = function (x) { return (x + HALF) / (HALF * 2) * S; };
    var Z = function (z) { return (z + HALF) / (HALF * 2) * S; };
    var W = function (w) { return w / (HALF * 2) * S; };
    var i;

    g.fillStyle = '#08131a';
    g.fillRect(0, 0, S, S);

    var sea = g.createLinearGradient(0, 0, X(-460), 0);
    sea.addColorStop(0, '#062733');
    sea.addColorStop(1, '#0d4b58');
    g.fillStyle = sea;
    g.fillRect(0, 0, X(-460), S);
    g.fillStyle = '#15262b';
    g.fillRect(X(-460), 0, S - X(-460), S);

    g.fillStyle = '#7d6c4d';
    g.fillRect(X(-520), 0, X(-460) - X(-520), S);
    g.fillStyle = '#9c8a63';
    g.fillRect(X(-505), 0, X(-460) - X(-505), S);

    for (i = 0; i < this.blocks.length; i++) {
      var b = this.blocks[i];
      var col = '#1f2f33';
      if (b.type === 'park') col = '#2f5a3d';
      else if (b.type === 'plaza' || b.type === 'promenade') col = '#5a5140';
      else if (b.type === 'estate') col = '#2e4a35';
      else if (b.type === 'police') col = '#2f4a63';
      else if (b.type === 'hospital') col = '#573438';
      else if (b.type === 'garage') col = '#3b4145';
      g.fillStyle = col;
      g.fillRect(X(b.cx - LOT / 2), Z(b.cz - LOT / 2), W(LOT), W(LOT));
    }

    g.strokeStyle = '#d8d2c0';
    g.lineWidth = Math.max(5, W(ROAD_HALF * 2));
    for (i = 0; i < ROAD_X.length; i++) {
      g.beginPath();
      g.moveTo(X(ROAD_X[i]), 0);
      g.lineTo(X(ROAD_X[i]), S);
      g.stroke();
    }
    for (i = 0; i < ROAD_Z.length; i++) {
      g.beginPath();
      g.moveTo(0, Z(ROAD_Z[i]));
      g.lineTo(S, Z(ROAD_Z[i]));
      g.stroke();
    }

    // ring road emphasis
    g.strokeStyle = 'rgba(243,201,105,0.7)';
    g.lineWidth = 2;
    g.strokeRect(X(-409), Z(-409), W(818), W(818));

    // pier (the long deck runs off the western edge of the city map)
    g.fillStyle = '#8a6a44';
    g.fillRect(0, Z(PIER_Z - 8), X(-460), W(16));
    g.fillStyle = '#a97f4d';
    g.beginPath(); g.arc(10, Z(PIER_Z), W(15), 0, TAU); g.fill();

    // marina docks
    g.fillStyle = '#8a6a44';
    for (var d = 0; d < 5; d++) {
      g.fillRect(X(-535), Z(-268 + d * 40 - 1.8), W(70), W(3.6));
    }

    // estate outline
    g.strokeStyle = '#f3c969';
    g.lineWidth = 2;
    g.strokeRect(X(311), Z(-389), W(78), W(78));

    // labels
    g.font = '700 10px "Arial Narrow", Arial, sans-serif';
    g.fillStyle = 'rgba(247,236,214,0.72)';
    g.textAlign = 'left';
    g.fillText('OCEAN DRIVE', 8, Z(230));
    g.fillText('MARINA', 8, Z(-200));
    g.fillText('PIER', 8, Z(PIER_Z - 16));
    g.textAlign = 'center';
    g.fillText('PLAZA SOL', X(50), Z(50));
    g.fillText('DOWNTOWN', X(200), Z(-120));
    g.fillText('CROWE ESTATE', X(350), Z(-350));
    g.fillText('SOUTHSIDE', X(-100), Z(330));

    // frame
    g.strokeStyle = 'rgba(255,255,255,0.12)';
    g.lineWidth = 2;
    g.strokeRect(1, 1, S - 2, S - 2);

    this.minimap = c;
  };

  /* -------------------------------- runtime ------------------------------- */

  World.prototype.setNight = function (t) {
    t = clamp(t == null ? 0 : t, 0, 1);
    this._night = t;
    this._nightTarget = t;
    var i;
    for (i = 0; i < this._windowMats.length; i++) {
      this._windowMats[i].emissiveIntensity = t * 0.95;
    }
    if (this._mats && this._mats.lamp) this._mats.lamp.emissiveIntensity = t * 2.6;
    if (this._mats && this._mats.lampGlow) this._mats.lampGlow.opacity = t * 0.5;
    if (this._lampGlowMesh) this._lampGlowMesh.visible = t > 0.03;
    if (this._neonMat) this._neonMat.emissiveIntensity = 0.25 + t * 2.4;
    if (this._mats && this._mats.neon) this._mats.neon.emissiveIntensity = 0.25 + t * 2.4;
    if (this._billboardMats) {
      for (i = 0; i < this._billboardMats.length; i++) {
        this._billboardMats[i].emissiveIntensity = 0.1 + t * 0.55;
      }
    }
    if (this._oceanU) {
      this._oceanU.uNight.value = t;
      this._oceanU.uDeep.value.copy(this._waterDeepDay).lerp(this._waterDeepNight, t);
      this._oceanU.uShallow.value.copy(this._waterShallowDay).lerp(this._waterShallowNight, t);
      this._oceanU.uSunColor.value.copy(this._sunWarm).lerp(this._sunCool, t * 0.8);
    }
    if (this._sunMat) {
      this._sunMat.color.copy(this._sunWarm).lerp(this._sunCool, t);
      this._sunMat.opacity = 0.56 - t * 0.28;
    }
    if (this.scene) {
      if (this.scene.fog && this.scene.fog.color) {
        this._fogTmp.copy(this.scene.fog.color).lerp(this._fogNight, t * 0.42);
        this.scene.fog.color.copy(this._fogTmp);
      }
      if (this.scene.background && this.scene.background.isColor) {
        this._bgTmp.copy(this.scene.background).lerp(this._bgNight, t * 0.24);
        this.scene.background.copy(this._bgTmp);
      }
    }
  };

  World.prototype.update = function (dt, playerPos) {
    dt = clamp(dt || 0, 0, 0.1);
    this._time += dt;
    if (this._oceanU) {
      this._oceanU.uTime.value = this._time;
      if (this.scene && this.scene.fog) {
        this._oceanU.uFogColor.value.copy(this.scene.fog.color);
        this._oceanU.uFogNear.value = this.scene.fog.near;
        this._oceanU.uFogFar.value = this.scene.fog.far;
      }
    }
    this._palmUniform.value = this._time;
    var n = this._night;
    if (this._lampGlowMesh && n > 0.03) {
      this._mats.lampGlow.opacity = n * (0.46 + 0.08 * Math.sin(this._time * 2.7));
    }
    if (this._neonMat) {
      var flick = 0.9 + 0.1 * Math.sin(this._time * 3.1) + 0.03 * Math.sin(this._time * 11.3);
      this._neonMat.emissiveIntensity = (0.25 + n * 2.4) * flick;
    }
    if (this._mats && this._mats.neon) {
      this._mats.neon.emissiveIntensity = 0.25 + n * 2.4;
    }
  };

  LH.World = World;
}());
