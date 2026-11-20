/* LEONIDA HEAT 3D — game shell: renderer, scene, loop, state machine, save.
   Stage 1 boots a staged scene and the complete HUD surface; later stages plug
   World / Player / Traffic / Police / Combat / Missions into the same shell. */
(function () {
  'use strict';

  window.LH = window.LH || {};

  var CFG = window.LH.CONFIG || {};
  var PAL = (CFG.PALETTE) || {};

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function noop() {}
  function $(id) { return document.getElementById(id); }
  function pad(n) { return n < 10 ? '0' + n : String(n); }
  function formatMoney(n) {
    var s = String(Math.max(0, Math.round(n)));
    return s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
  function hexColor(hex) {
    try { return new THREE.Color(hex); } catch (e) { return new THREE.Color(0x112233); }
  }

  /* ================================ HUD STUB ================================ */
  /* Replaced automatically by LH.HUD once hud.js is present. It still fills the
     contractual DOM so the shell is complete and legible on its own. */
  function HudStub(game) {
    this.game = game;
    this.screen = 'title';
    this.el = {};
    this.toasts = [];
    this.moneyShown = 0;
    this._toastTimers = [];
    this._mapCtx = null;
    var ids = [
      'title-screen', 'pause-screen', 'weapon-wheel', 'briefing', 'result-screen',
      'help-screen', 'credits-screen', 'mission-card', 'minimap', 'weapon-icon',
      'toast-feed', 'prompt', 'busted-meter', 'dialogue', 'mission-banner',
      'speedo', 'crosshair', 'objective-arrow', 'stats-overlay', 'fps-meter',
      'hud'
    ];
    for (var i = 0; i < ids.length; i++) this.el[ids[i]] = $(ids[i]);
    this.screens = {
      title: this.el['title-screen'],
      pause: this.el['pause-screen'],
      wheel: this.el['weapon-wheel'],
      briefing: this.el['briefing'],
      result: this.el['result-screen'],
      help: this.el['help-screen'],
      credits: this.el['credits-screen']
    };
    var mm = this.el.minimap;
    if (mm && mm.getContext) this._mapCtx = mm.getContext('2d');
    this._lastIcon = 'pistol';
    this._drawWeaponIcon('pistol');
  }

  HudStub.prototype.setScreen = function (name) {
    name = name || 'hud';
    this.screen = name;
    for (var key in this.screens) {
      var s = this.screens[key];
      if (!s) continue;
      var open = key === name;
      s.classList.toggle('is-open', open);
      s.setAttribute('aria-hidden', open ? 'false' : 'true');
    }
    if (name === 'hud') {
      var hud = this.el.hud;
      if (hud) hud.style.opacity = '';
    }
  };

  HudStub.prototype.setPrompt = function (text) {
    var el = this.el.prompt;
    if (!el) return;
    if (!text) { el.hidden = true; return; }
    var key = 'E';
    var label = String(text);
    var m = label.match(/^([A-Z0-9])\s*[—\-]\s*(.+)$/);
    if (m) { key = m[1]; label = m[2]; }
    var b = el.querySelector('b');
    var span = el.querySelector('span');
    if (b) b.textContent = key;
    if (span) span.textContent = label.toUpperCase();
    el.hidden = false;
  };

  HudStub.prototype.toast = function (text, kind) {
    var feed = this.el['toast-feed'];
    if (!feed) return;
    kind = kind || 'info';
    var item = document.createElement('div');
    item.className = 'toast ' + kind;
    var glyph = kind === 'cash' ? '$' : kind === 'danger' ? '!' : kind === 'crew' ? '+' : kind === 'mission' ? '★' : 'i';
    item.innerHTML = '<span class="toast-icon">' + glyph + '</span><span class="toast-text"></span>';
    item.querySelector('.toast-text').textContent = text;
    feed.appendChild(item);
    var life = (CFG.HUD && CFG.HUD.toastLife) || 3.6;
    var timer = setTimeout(function () {
      item.classList.add('out');
      setTimeout(function () { if (item.parentNode) item.parentNode.removeChild(item); }, 320);
    }, life * 1000);
    this._toastTimers.push(timer);
    while (feed.children.length > ((CFG.HUD && CFG.HUD.maxToasts) || 4)) {
      feed.removeChild(feed.firstChild);
    }
  };

  HudStub.prototype.showBriefing = function (m) {
    if (!m) return;
    var set = function (id, text) { var e = $(id); if (e) e.textContent = text; };
    set('briefing-kicker', 'MISSION ' + pad(m.index || 1) + ' · ' + (m.district || ''));
    set('briefing-title', m.title || '');
    set('briefing-giver', m.giver || '');
    set('briefing-role', m.role || '');
    set('briefing-reward', '$' + formatMoney(m.reward || 0));
    set('briefing-time', m.timer ? m.timer + ' SEC' : 'NONE');
    set('briefing-heat', 'LEVEL ' + (m.heatOnStart || 0));
    var lines = $('briefing-lines');
    if (lines) {
      lines.innerHTML = '';
      (m.briefing || []).forEach(function (line) {
        var p = document.createElement('p');
        p.textContent = line;
        lines.appendChild(p);
      });
    }
    var objs = $('briefing-objectives');
    if (objs) {
      objs.innerHTML = '';
      (m.steps || []).slice(0, 4).forEach(function (step, i) {
        var row = document.createElement('div');
        row.className = 'objective-line';
        row.innerHTML = '<b>' + pad(i + 1) + '</b><span></span>';
        row.querySelector('span').textContent = step.text;
        objs.appendChild(row);
      });
    }
    this._drawPortrait(m);
    this.setScreen('briefing');
  };

  HudStub.prototype._drawPortrait = function (m) {
    var canvas = $('briefing-portrait');
    if (!canvas || !canvas.getContext) return;
    var ctx = canvas.getContext('2d');
    var w = canvas.width;
    var h = canvas.height;
    var pal = m.portrait || {};
    var skin = pal.skin || '#c98f6a';
    var hair = pal.hair || '#17151a';
    var shirt = pal.shirt || '#1d5c64';
    var accent = pal.accent || '#f3c969';
    var tie = pal.tie || '#a33b34';

    var bg = ctx.createLinearGradient(0, 0, w, h);
    bg.addColorStop(0, '#162c34');
    bg.addColorStop(1, '#091016');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = 'rgba(255,255,255,0.045)';
    ctx.fillRect(18, 18, w - 36, h - 36);
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.strokeRect(18.5, 18.5, w - 37, h - 37);

    var cx = w * 0.5;
    var headY = h * 0.36;
    var headR = w * 0.205;

    ctx.fillStyle = shade(skin, -22);
    ctx.beginPath();
    ctx.ellipse(cx, h * 0.84, w * 0.43, h * 0.30, 0, Math.PI, 0);
    ctx.fill();

    var torso = ctx.createLinearGradient(0, h * 0.62, 0, h);
    torso.addColorStop(0, shirt);
    torso.addColorStop(1, shade(shirt, -30));
    ctx.fillStyle = torso;
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.43, h);
    ctx.lineTo(cx - w * 0.35, h * 0.63);
    ctx.quadraticCurveTo(cx, h * 0.52, cx + w * 0.35, h * 0.63);
    ctx.lineTo(cx + w * 0.43, h);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = skin;
    ctx.fillRect(cx - w * 0.09, headY + headR * 0.72, w * 0.18, h * 0.16);

    ctx.beginPath();
    ctx.ellipse(cx, headY, headR, headR * 1.18, 0, 0, Math.PI * 2);
    ctx.fillStyle = skin;
    ctx.fill();

    ctx.fillStyle = shade(skin, -18);
    ctx.beginPath();
    ctx.ellipse(cx, headY + headR * 0.2, headR * 0.86, headR * 0.9, 0, 0, Math.PI);
    ctx.fill();

    ctx.fillStyle = hair;
    ctx.beginPath();
    ctx.ellipse(cx, headY - headR * 0.42, headR * 1.02, headR * 0.62, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(cx - headR * 1.02, headY - headR * 0.46, headR * 0.18, headR * 1.06);
    ctx.fillRect(cx + headR * 0.84, headY - headR * 0.46, headR * 0.18, headR * 1.06);

    ctx.fillStyle = 'rgba(20,10,8,0.85)';
    ctx.beginPath();
    ctx.ellipse(cx - headR * 0.38, headY + headR * 0.02, headR * 0.115, headR * 0.075, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + headR * 0.38, headY + headR * 0.02, headR * 0.115, headR * 0.075, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = shade(hair, 18);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - headR * 0.62, headY - headR * 0.22);
    ctx.lineTo(cx - headR * 0.2, headY - headR * 0.29);
    ctx.moveTo(cx + headR * 0.2, headY - headR * 0.29);
    ctx.lineTo(cx + headR * 0.62, headY - headR * 0.22);
    ctx.stroke();

    ctx.strokeStyle = shade(skin, -38);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx, headY + headR * 0.06);
    ctx.lineTo(cx - headR * 0.07, headY + headR * 0.4);
    ctx.lineTo(cx + headR * 0.04, headY + headR * 0.43);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(70,25,22,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - headR * 0.3, headY + headR * 0.66);
    ctx.quadraticCurveTo(cx, headY + headR * 0.78, cx + headR * 0.3, headY + headR * 0.66);
    ctx.stroke();

    ctx.fillStyle = shade(shirt, 24);
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.17, h * 0.63);
    ctx.lineTo(cx, h * 0.73);
    ctx.lineTo(cx + w * 0.17, h * 0.63);
    ctx.lineTo(cx, h * 0.68);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = tie;
    ctx.beginPath();
    ctx.moveTo(cx, h * 0.69);
    ctx.lineTo(cx + w * 0.035, h * 0.74);
    ctx.lineTo(cx, h * 0.92);
    ctx.lineTo(cx - w * 0.035, h * 0.74);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = accent;
    ctx.fillRect(cx - w * 0.012, h * 0.69, w * 0.024, h * 0.06);

    var vig = ctx.createRadialGradient(cx, h * 0.45, w * 0.18, cx, h * 0.45, w * 0.72);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    for (var y = 0; y < h; y += 4) ctx.fillRect(0, y, w, 1);
  };

  function shade(hex, amount) {
    var raw = String(hex || '#888888').replace('#', '');
    if (raw.length === 3) raw = raw[0] + raw[0] + raw[1] + raw[1] + raw[2] + raw[2];
    var n = parseInt(raw, 16);
    if (!isFinite(n)) return hex;
    var r = clamp(((n >> 16) & 255) + amount, 0, 255);
    var g = clamp(((n >> 8) & 255) + amount, 0, 255);
    var b = clamp((n & 255) + amount, 0, 255);
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  HudStub.prototype.hide = function () { this.setScreen('hud'); };

  HudStub.prototype.showResult = function (win, data) {
    data = data || {};
    var screen = this.el['result-screen'];
    if (screen) {
      screen.classList.toggle('failed', !win);
      screen.classList.add('is-open');
      screen.setAttribute('aria-hidden', 'false');
    }
    var set = function (id, text) { var e = $(id); if (e) e.textContent = text; };
    set('result-kicker', win ? 'MISSION COMPLETE' : 'MISSION FAILED');
    set('result-title', data.title || 'COSTA SOL');
    set('result-rank', win ? (data.rank || 'A') : 'F');
    set('result-message', data.message || (win ? 'The city pays out. For now.' : data.reason || 'Try again.'));
    var stats = $('result-stats');
    if (stats) {
      stats.innerHTML = '';
      var rows = [
        ['PAYOUT', win ? '$' + formatMoney(data.reward || 0) : '$0'],
        ['TIME', data.time || '00:00'],
        ['HEAT', (data.heat || 0) + ' ★']
      ];
      rows.forEach(function (r) {
        var d = document.createElement('div');
        d.innerHTML = '<span class="micro">' + r[0] + '</span><b></b>';
        d.querySelector('b').textContent = r[1];
        stats.appendChild(d);
      });
    }
    var retry = $('btn-result-retry');
    if (retry) retry.hidden = !!win;
    var cont = $('btn-result-continue');
    if (cont) cont.hidden = !win;
    this.screen = 'result';
  };

  HudStub.prototype.openWheel = function (mode) {
    this.setScreen('wheel');
    var modeEl = $('wheel-mode');
    if (modeEl) modeEl.textContent = mode === 'shop' ? 'AMMU-NATION · SHOP' : 'ARMORY · FREE ROAM';
    var p = this.game.player || this.game.preview;
    if (!p) return;
    var wm = $('wheel-money');
    if (wm) wm.textContent = '$' + formatMoney(p.money || 0);
    var defs = CFG.WEAPONS || {};
    var current = p.currentWeapon || 'pistol';
    var selectedName = '';
    var selectedAmmo = '';
    for (var id in defs) {
      var def = defs[id];
      var slot = $('wheel-slot-' + id);
      var state = (p.weapons && p.weapons[id]) || { owned: false, ammo: 0, reserve: 0 };
      if (slot) {
        slot.classList.toggle('owned', !!state.owned);
        slot.classList.toggle('locked', !state.owned);
        slot.classList.toggle('active', id === current);
        var ammo = slot.querySelector('.slot-ammo');
        var price = slot.querySelector('.slot-price');
        if (ammo) ammo.textContent = def.kind === 'melee' ? 'MELEE' : (state.ammo || 0) + ' / ' + (state.reserve || 0);
        if (price) price.textContent = state.owned ? (def.kind === 'melee' ? 'EQUIPPED' : 'OWNED') : '$' + formatMoney(def.price);
      }
      if (id === current) {
        selectedName = def.name;
        selectedAmmo = def.kind === 'melee' ? 'MELEE' : (state.ammo || 0) + ' / ' + (state.reserve || 0);
      }
    }
    var sel = $('wheel-selected');
    if (sel) sel.textContent = selectedName || 'PISTOL';
    var selAmmo = $('wheel-selected-ammo');
    if (selAmmo) selAmmo.textContent = selectedAmmo || '12 / 96';
    var dmg = (defs[current] && defs[current].damage) || 24;
    var dmgVal = $('wheel-damage-value');
    if (dmgVal) dmgVal.textContent = String(dmg * ((defs[current] && defs[current].pellets) || 1));
    var dmgFill = $('wheel-damage-fill');
    if (dmgFill) dmgFill.style.width = clamp(dmg / 50 * 100, 8, 100) + '%';
  };

  HudStub.prototype.closeWheel = function () { this.setScreen('hud'); };

  HudStub.prototype._drawWeaponIcon = function (weaponId) {
    var canvas = this.el['weapon-icon'];
    if (!canvas || !canvas.getContext) return;
    var ctx = canvas.getContext('2d');
    var w = canvas.width;
    var h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.fillStyle = 'rgba(247,236,214,0.92)';
    ctx.strokeStyle = 'rgba(40,224,208,0.75)';
    ctx.lineWidth = 1.5;
    if (weaponId === 'fists') {
      ctx.beginPath();
      ctx.arc(0, 0, 11, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillRect(-10, -4, 20, 9);
    } else if (weaponId === 'shotgun') {
      ctx.fillRect(-38, -3, 62, 6);
      ctx.fillRect(10, -1, 30, 4);
      ctx.beginPath();
      ctx.moveTo(-38, 3); ctx.lineTo(-26, 3); ctx.lineTo(-33, 14); ctx.lineTo(-46, 14);
      ctx.closePath(); ctx.fill();
      ctx.strokeRect(-4, -7, 16, 5);
    } else if (weaponId === 'rifle') {
      ctx.fillRect(-42, -3, 74, 5);
      ctx.fillRect(12, -1, 30, 3);
      ctx.beginPath();
      ctx.moveTo(-42, 2); ctx.lineTo(-30, 2); ctx.lineTo(-38, 14); ctx.lineTo(-48, 14);
      ctx.closePath(); ctx.fill();
      ctx.fillRect(-10, 2, 7, 11);
      ctx.strokeRect(2, 3, 20, 5);
    } else if (weaponId === 'smg') {
      ctx.fillRect(-30, -4, 52, 8);
      ctx.fillRect(22, -1, 16, 3);
      ctx.fillRect(-20, 4, 7, 13);
      ctx.fillRect(-2, 4, 6, 11);
    } else {
      ctx.fillRect(-26, -5, 44, 9);
      ctx.fillRect(18, -2, 12, 4);
      ctx.beginPath();
      ctx.moveTo(-26, -5); ctx.lineTo(-12, -5); ctx.lineTo(-16, -15); ctx.lineTo(-28, -15);
      ctx.closePath(); ctx.fill();
      ctx.fillRect(-10, 4, 8, 12);
    }
    ctx.restore();
  };

  HudStub.prototype.update = function (dt) {
    var g = this.game;
    var p = g.player || g.preview;
    if (!p) return;

    var health = p.health == null ? 100 : p.health;
    var armor = p.armor || 0;
    var hf = $('health-fill');
    var af = $('armor-fill');
    var hv = $('health-value');
    var av = $('armor-value');
    if (hf) {
      hf.style.width = clamp(health, 0, 100) + '%';
      hf.classList.toggle('low', health <= 25);
    }
    if (af) af.style.width = clamp(armor, 0, 100) + '%';
    if (hv) hv.textContent = String(Math.round(Math.max(0, health)));
    if (av) av.textContent = String(Math.round(Math.max(0, armor)));

    var targetMoney = p.money == null ? 0 : p.money;
    if (!this.moneyShown) this.moneyShown = targetMoney;
    var diff = targetMoney - this.moneyShown;
    if (Math.abs(diff) < 1) this.moneyShown = targetMoney;
    else this.moneyShown += diff * Math.min(1, dt * (CFG.HUD ? CFG.HUD.moneyCountSpeed : 8));
    var moneyEl = $('money');
    if (moneyEl) moneyEl.textContent = formatMoney(this.moneyShown);

    var wanted = Math.round(p.wanted || (g.police && g.police.wanted) || 0);
    var stars = document.querySelectorAll('#wanted-stars .star');
    for (var i = 0; i < stars.length; i++) {
      var lit = i < wanted;
      stars[i].classList.toggle('lit', lit);
      stars[i].classList.toggle('hot', lit && wanted >= 3);
    }
    var heat = document.querySelectorAll('#heat-strip span');
    for (var j = 0; j < heat.length; j++) heat[j].classList.toggle('on', j < wanted);

    var clockEl = $('clock');
    if (clockEl) clockEl.textContent = g.getClockLabel();
    var weatherEl = $('weather');
    if (weatherEl) weatherEl.innerHTML = '<span class="weather-dot"></span>' + String(g.clock.weather || '').toUpperCase();
    var dayEl = $('day-count');
    if (dayEl) dayEl.textContent = pad(g.clock.day || 1);

    var pursuit = $('pursuit');
    if (pursuit) {
      var label = wanted === 0 ? 'NO UNITS' : wanted === 1 ? '1 UNIT PURSUING' : wanted + ' UNITS PURSUING';
      if (g.police && g.police.roadblock && g.police.roadblock.active) label = 'ROADBLOCK SET';
      pursuit.innerHTML = '<span class="pursuit-dot"></span>' + label;
      pursuit.classList.toggle('hot', wanted >= 2 && wanted < 4);
      pursuit.classList.toggle('critical', wanted >= 4);
    }

    var district = g.world && g.world.districtAt ? g.world.districtAt(p.pos.x, p.pos.z) : 'OCEAN DRIVE';
    var dEl = $('minimap-district');
    if (dEl) dEl.textContent = district;
    var pdEl = $('player-district');
    if (pdEl) pdEl.textContent = district + ' · COSTA SOL';
    var chipEl = $('district-chip');
    if (chipEl) chipEl.textContent = district;
    var coords = $('minimap-coords');
    if (coords) coords.textContent = 'X ' + Math.round(p.pos.x) + ' · Z ' + Math.round(p.pos.z);

    var cross = $('crosshair');
    if (cross && g.input) cross.classList.toggle('aiming', !!g.input.aiming());

    var vehicle = p.vehicle || null;
    var speedo = $('speedo');
    if (speedo) speedo.hidden = !vehicle;
    if (vehicle) {
      var kmh = Math.round(Math.abs(vehicle.speed || 0) * 3.6);
      var sv = $('speed-value');
      if (sv) sv.textContent = ('00' + kmh).slice(-3);
      var sf = $('speed-fill');
      if (sf) sf.style.width = clamp(kmh / 190 * 100, 0, 100) + '%';
      var gear = kmh < 1 ? 'P' : kmh < 30 ? '1' : kmh < 60 ? '2' : kmh < 100 ? '3' : kmh < 140 ? '4' : '5';
      var gv = $('gear-value');
      if (gv) gv.textContent = gear;
    }

    var w = p.weapons && p.currentWeapon && p.weapons[p.currentWeapon];
    if (w) {
      var def = (CFG.WEAPONS || {})[p.currentWeapon] || {};
      var nameEl = $('weapon-name');
      if (nameEl) nameEl.textContent = def.name || String(p.currentWeapon).toUpperCase();
      var ammoEl = $('weapon-ammo');
      var reserveEl = $('weapon-reserve');
      if (ammoEl) ammoEl.textContent = def.kind === 'melee' ? '∞' : String(w.ammo || 0);
      if (reserveEl) reserveEl.textContent = def.kind === 'melee' ? 'MELEE' : String(w.reserve || 0);
      if (this._lastIcon !== p.currentWeapon) {
        this._lastIcon = p.currentWeapon;
        this._drawWeaponIcon(p.currentWeapon);
      }
    }

    this._renderMinimap(p, wanted);

    if (g.perf && g.perf.fps) {
      var fpsEl = $('fps-meter');
      if (fpsEl && !fpsEl.hidden) fpsEl.textContent = Math.round(g.perf.fps) + ' FPS';
    }
  };

  HudStub.prototype._renderMinimap = function (p, wanted) {
    var ctx = this._mapCtx;
    if (!ctx) return;
    var size = 220;
    var half = size / 2;
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = '#0a1418';
    ctx.fillRect(0, 0, size, size);

    ctx.fillStyle = 'rgba(20,86,94,0.55)';
    ctx.fillRect(0, 0, 34, size);
    ctx.fillStyle = 'rgba(232,214,174,0.22)';
    ctx.fillRect(30, 0, 7, size);

    ctx.strokeStyle = 'rgba(185,173,152,0.18)';
    ctx.lineWidth = 8;
    for (var gx = 34; gx < size; gx += 27) {
      ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, size); ctx.stroke();
    }
    for (var gz = 8; gz < size; gz += 27) {
      ctx.beginPath(); ctx.moveTo(0, gz); ctx.lineTo(size, gz); ctx.stroke();
    }

    var pulse = 0.55 + Math.sin(this.game.time * 3) * 0.2;
    ctx.fillStyle = 'rgba(243,201,105,' + pulse + ')';
    ctx.beginPath(); ctx.arc(half + 42, half - 52, 4, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(243,201,105,0.4)';
    ctx.beginPath(); ctx.arc(half + 42, half - 52, 8, 0, Math.PI * 2); ctx.stroke();

    if (wanted > 0) {
      ctx.fillStyle = '#ff4d55';
      ctx.beginPath(); ctx.arc(half - 34, half - 24, 3.5, 0, Math.PI * 2); ctx.fill();
    }

    ctx.save();
    ctx.translate(half, half);
    var yaw = this.game.cameraController ? this.game.cameraController.yaw : 0;
    ctx.rotate(-yaw);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -8); ctx.lineTo(5.5, 6); ctx.lineTo(0, 3); ctx.lineTo(-5.5, 6);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  };

  HudStub.prototype.renderMinimap = function () {
    var p = this.game.player || this.game.preview;
    if (p) this._renderMinimap(p, Math.round(p.wanted || 0));
  };

  HudStub.prototype.destroy = function () {
    for (var i = 0; i < this._toastTimers.length; i++) clearTimeout(this._toastTimers[i]);
    this._toastTimers.length = 0;
  };

  /* ================================= GAME ================================= */

  function Game(canvas) {
    var self = this;
    this.canvas = canvas || $('gameCanvas');
    this.params = (function () {
      try { return new URLSearchParams(window.location.search || ''); }
      catch (e) { return { get: function () { return null; }, has: function () { return false; } }; }
    }());

    var seedParam = this.params.get('seed');
    this.seed = seedParam != null && seedParam !== '' ? Number(seedParam) || 1 : 1;
    this.rng = LH.RNG ? LH.RNG(this.seed) : null;

    this.state = 'boot';
    this.time = 0;
    this.lastTime = 0;
    this.frame = 0;
    this.shotName = this.params.get('shot');
    this.shotReady = false;
    this._shotFrozen = false;
    this.shots = null;

    this.perf = { fps: 0, draws: 0, tris: 0, ms: 0, frames: 0 };
    this._perfAccum = 0;
    this._perfFrames = 0;
    this._statsVisible = this.params.get('stats') === '1';
    this._autosaveAccum = 0;
    this._lastVehicle = null;
    this._pixelRatioIndex = 0;
    this._pixelRatio = Math.min(window.devicePixelRatio || 1, (CFG.QUALITY && CFG.QUALITY.pixelRatioCap) || 1.5);
    this._qualityFastTime = 0;
    this._qualitySlowTime = 0;
    this._qualityCheck = 0;
    this._crewFallback = { maya: 0, dez: 0, rook: 0 };
    this.collectibles = [];
    this.pickups = [];
    this.tapes = [];
    this.rain = null;

    this.clock = {
      minutes: (CFG.CLOCK && CFG.CLOCK.startMinutes) || 1080,
      day: (CFG.CLOCK && CFG.CLOCK.startDay) || 1,
      weather: (CFG.CLOCK && CFG.CLOCK.startWeather) || 'clear',
      weatherTimer: 0,
      elapsed: 0
    };
    this._weatherMax = 180;
    this._resetWeatherTimer();

    this.settings = this._loadSettings();

    this.world = null;
    this.traffic = null;
    this.police = null;
    this.combat = null;
    this.missions = null;
    this.player = null;

    this.preview = {
      pos: new THREE.Vector3(
        (CFG.WORLD && CFG.WORLD.points.spawn.x) || 0,
        0,
        (CFG.WORLD && CFG.WORLD.points.spawn.z) || 0
      ),
      yaw: 0,
      speed: 0,
      health: 100,
      armor: 0,
      money: (CFG.PLAYER && CFG.PLAYER.startMoney) || 500,
      wanted: 0,
      vehicle: null,
      currentWeapon: (CFG.PLAYER && CFG.PLAYER.startWeapon) || 'pistol',
      weapons: {
        fists: { owned: true, ammo: 0, reserve: 0 },
        pistol: { owned: true, ammo: 12, reserve: 96 },
        smg: { owned: false, ammo: 0, reserve: 0 },
        shotgun: { owned: false, ammo: 0, reserve: 0 },
        rifle: { owned: false, ammo: 0, reserve: 0 }
      }
    };

    this._initRenderer();
    this._initScene();
    this._initLights();
    this._buildTempWorld();

    this.hud = LH.HUD ? new LH.HUD(this) : new HudStub(this);
    this.input = LH.Input ? new LH.Input(this.canvas) : null;
    this.audio = LH.Audio ? new LH.Audio() : this._makeSilentAudio();
    this.cameraController = LH.ThirdPersonCamera ? new LH.ThirdPersonCamera(this.camera, this.world) : null;

    if (this.cameraController) {
      this.cameraController.yaw = this.preview.yaw;
      this.cameraController.initialised = false;
    }

    this._buildPlayer();
    this._buildTrafficAndPolice();
    this._buildCombat();
    this._buildMissions();
    this._buildPickups();
    this._buildCollectibles();
    this._buildRain();

    this._bindUI();
    this._initStats();
    this._applySettings();

    if (this.shotName && LH.Shots) {
      try {
        this.state = 'play';
        document.body.classList.remove('is-title');
        this.hud.setScreen('hud');
        this.shots = new LH.Shots(this);
        this.shots.setup(this.shotName);
        this.state = 'play';
        this.shotReady = !!this.shots.ready;
      } catch (err) {
        console.warn('[Leonida] shot setup failed', err);
        this.shots = null;
        this.shotReady = false;
        this.showTitle();
      }
    }

    if (this.state === 'boot') this.showTitle();
    this._applySky();

    this._loop = function (ts) { self._tick(ts); };
    this._raf = requestAnimationFrame(this._loop);
  }

  Game.prototype._initRenderer = function () {
    var cap = (CFG.QUALITY && CFG.QUALITY.pixelRatioCap) || 1.5;
    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        antialias: true,
        powerPreference: 'high-performance',
        alpha: false,
        stencil: false
      });
    } catch (err) {
      console.error('[Leonida] WebGL unavailable', err);
      this.renderer = null;
      return;
    }
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, cap));
    this.renderer.setSize(window.innerWidth || 1280, window.innerHeight || 720, false);
    this.renderer.shadowMap.enabled = this.settings.quality !== 'low';
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    if ('outputEncoding' in this.renderer && THREE.sRGBEncoding) this.renderer.outputEncoding = THREE.sRGBEncoding;
    if (THREE.ACESFilmicToneMapping) {
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.06;
    }
    this.renderer.setClearColor(0x152430, 1);
  };

  Game.prototype._initScene = function () {
    this.scene = new THREE.Scene();
    this.scene.background = hexColor(PAL.night || '#0b1424');
    this.scene.fog = new THREE.Fog(PAL.night || '#0b1424', 80, 520);

    this.camera = new THREE.PerspectiveCamera(
      62,
      (window.innerWidth || 1280) / (window.innerHeight || 720),
      0.1,
      1400
    );
    this.camera.position.set(0, 6, -18);
    this.camera.lookAt(0, 2, 0);

    this._skyTop = hexColor('#1a3547');
    this._skyBottom = hexColor('#f0a072');
    this._fogColor = hexColor('#9aa4a8');
    this._sunColor = hexColor('#ffd2a0');
    this._tmpColor = hexColor('#ffffff');
    this._nightCol = hexColor(PAL.night || '#0b1424');
    this._duskCol = hexColor('#3d2a44');
    this._dayCol = hexColor('#8fd3e8');
    this._fogTint = hexColor('#a8b7bc');
    this._titleTarget = new THREE.Vector3(0, 0, 0);
  };

  Game.prototype._initLights = function () {
    this.hemi = new THREE.HemisphereLight(0x9fd7e8, 0x4a3a2e, 0.72);
    this.scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(0xffd2a0, 1.5);
    this.sun.position.set(120, 180, -90);
    this.sun.castShadow = this.settings.quality !== 'low';
    var shadowSize = this.settings.quality === 'low'
      ? ((CFG.QUALITY && CFG.QUALITY.shadowsLow) || 1024)
      : ((CFG.QUALITY && CFG.QUALITY.shadowsHigh) || 2048);
    this.sun.shadow.mapSize.set(shadowSize, shadowSize);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 420;
    var box = (CFG.WORLD && CFG.WORLD.shadowBox) || 160;
    this.sun.shadow.camera.left = -box / 2;
    this.sun.shadow.camera.right = box / 2;
    this.sun.shadow.camera.top = box / 2;
    this.sun.shadow.camera.bottom = -box / 2;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.025;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    this.fill = new THREE.DirectionalLight(0x6fd5d0, 0.24);
    this.fill.position.set(-90, 50, 120);
    this.scene.add(this.fill);

    this.scene.add(new THREE.AmbientLight(0x40505c, 0.32));
  };

  Game.prototype._buildTempWorld = function () {
    this.world = null;
    this.tempWorld = null;
    this.tempGround = null;

    if (LH.World) {
      try {
        var wrng = (this.rng && this.rng.fork) ? this.rng.fork('world') : (LH.RNG ? LH.RNG(String(this.seed) + ':world') : null);
        this.world = new LH.World(this.scene, wrng);
        if (this.world.group && !this.world.group.parent) this.scene.add(this.world.group);
        if (this.world.spawn) {
          var sp = this.world.spawn;
          var sy = this.world.groundHeight ? this.world.groundHeight(sp.x, sp.z) : 0;
          this.preview.pos.set(sp.x, sy, sp.z);
          if (typeof sp.yaw === 'number') this.preview.yaw = sp.yaw;
        }
        if (this.world.setNight) this.world.setNight(0.4);
        return;
      } catch (err) {
        console.warn('[Leonida] world build failed, using fallback', err);
        this.world = null;
      }
    }

    this._buildFallbackWorld();
  };

  Game.prototype._buildFallbackWorld = function () {
    var group = new THREE.Group();
    group.name = 'temp-world';

    var groundGeo = new THREE.PlaneGeometry(1500, 1500);
    var groundMat = new THREE.MeshStandardMaterial({
      color: 0x27333a,
      roughness: 0.96,
      metalness: 0.02
    });
    var ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0;
    ground.receiveShadow = true;
    group.add(ground);

    var grid = new THREE.GridHelper(1000, 100, 0x4f6b72, 0x33474f);
    grid.position.y = 0.012;
    if (grid.material) {
      grid.material.transparent = true;
      grid.material.opacity = 0.24;
      grid.material.depthWrite = false;
    }
    group.add(grid);

    var stripGeo = new THREE.PlaneGeometry(60, 1200);
    var stripMat = new THREE.MeshStandardMaterial({ color: 0xe4cf9f, roughness: 1 });
    var beach = new THREE.Mesh(stripGeo, stripMat);
    beach.rotation.x = -Math.PI / 2;
    beach.position.set(-490, 0.025, 0);
    beach.receiveShadow = true;
    group.add(beach);

    var waterGeo = new THREE.PlaneGeometry(700, 1200);
    var waterMat = new THREE.MeshStandardMaterial({
      color: 0x0b4f5c,
      roughness: 0.25,
      metalness: 0.15,
      transparent: true,
      opacity: 0.94
    });
    var water = new THREE.Mesh(waterGeo, waterMat);
    water.rotation.x = -Math.PI / 2;
    water.position.set(-870, 0.04, 0);
    group.add(water);

    this.scene.add(group);
    this.tempWorld = group;
    this.tempGround = ground;
  };

  /* ------------------------------ player / demo ------------------------------ */

  Game.prototype._buildPlayer = function () {
    if (!window.LH.Player) return;
    var self = this;
    try {
      this.player = new LH.Player(this.scene, this.world);
      var sp = (this.world && this.world.spawn) ||
        (CFG.WORLD && CFG.WORLD.points && CFG.WORLD.points.spawn) || { x: 0, z: 0 };
      var sy = (this.world && this.world.groundHeight) ? this.world.groundHeight(sp.x, sp.z) : 0;
      this.player.pos.set(sp.x, sy, sp.z);
      if (typeof sp.yaw === 'number') this.player.yaw = sp.yaw;
      this.player.mesh.position.copy(this.player.pos);
      this.player.mesh.rotation.y = this.player.yaw;
      this.player.preview = this.preview;
      this.player.onFootstep = function () {
        if (self.audio && self.audio.footstep) self.audio.footstep();
      };
      this.player.onPrompt = function (text) {
        if (self.hud && self.hud.setPrompt) self.hud.setPrompt(text);
      };
      if (this.previewMesh) this.previewMesh.visible = false;

      this.demoVehicles = [];
      this._demoPlacements = [];
      if (window.LH.Vehicle) {
        var slots = [
          { type: 'sports', x: sp.x - 2.8, z: sp.z + 1.0, heading: -0.035, color: '#ff6f61' },
          { type: 'sedan', x: sp.x - 14.8, z: sp.z + 9.6, heading: Math.PI + 0.02, color: '#2c4a57' }
        ];
        for (var i = 0; i < slots.length; i++) {
          var slot = slots[i];
          var car = new LH.Vehicle(this.scene, this.world, slot.type, {
            x: slot.x, z: slot.z, heading: slot.heading, color: slot.color
          });
          car.onSound = function (speed, throttle) {
            if (self.audio && self.audio.engine) self.audio.engine(speed, throttle);
          };
          this.demoVehicles.push(car);
          this._demoPlacements.push({
            car: car, x: slot.x, z: slot.z, heading: slot.heading
          });
        }
      }
      this.player.vehicles = this.demoVehicles;
      this.player.syncPreview();
    } catch (err) {
      console.warn('[Leonida] player build failed', err);
      this.player = null;
    }
  };

  /* ------------------------------ free roam pickups ------------------------------ */

  Game.prototype._pickupMaterial = function (color, emissive) {
    return new THREE.MeshStandardMaterial({
      color: color,
      emissive: emissive || color,
      emissiveIntensity: 0.55,
      roughness: 0.48,
      metalness: 0.28
    });
  };

  Game.prototype._buildPickups = function () {
    if (!this.scene || !window.THREE) return;
    var defs = [
      { kind: 'cash', x: -372, z: 204 },
      { kind: 'cash', x: -296, z: 24 },
      { kind: 'cash', x: 48, z: 40 },
      { kind: 'cash', x: 146, z: -62 },
      { kind: 'cash', x: 398, z: 56 },
      { kind: 'cash', x: -444, z: 296 },
      { kind: 'health', x: -384, z: 232 },
      { kind: 'health', x: -430, z: 172 },
      { kind: 'health', x: 246, z: 242 },
      { kind: 'armor', x: 350, z: -334 },
      { kind: 'armor', x: 50, z: -146 },
      { kind: 'armor', x: 46, z: -46 }
    ];
    this._pickupMats = {
      cash: this._pickupMaterial(0x2f9e5c, 0x1d6f3f),
      health: this._pickupMaterial(0xe84e57, 0xb52834),
      armor: this._pickupMaterial(0x49b6d8, 0x24798e)
    };
    this.pickups = [];
    for (var i = 0; i < defs.length; i++) {
      var def = defs[i];
      var group = new THREE.Group();
      group.name = 'pickup-' + def.kind + '-' + i;
      if (def.kind === 'cash') {
        for (var s = 0; s < 3; s++) {
          var bill = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.08, 0.32), this._pickupMats.cash);
          bill.position.y = s * 0.09;
          bill.rotation.y = s * 0.16;
          group.add(bill);
        }
      } else if (def.kind === 'health') {
        var hMat = this._pickupMats.health;
        var barA = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.2, 0.2), hMat);
        var barB = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.62, 0.2), hMat);
        group.add(barA);
        group.add(barB);
      } else {
        var shield = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.18, 10), this._pickupMats.armor);
        shield.rotation.x = Math.PI / 2;
        group.add(shield);
        var boss = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), this._pickupMats.armor);
        boss.position.z = 0.14;
        group.add(boss);
      }
      var gy = this.world && this.world.groundHeight ? this.world.groundHeight(def.x, def.z) : 0;
      group.position.set(def.x, gy + 1.05, def.z);
      group.traverse(function (child) { if (child.isMesh) child.castShadow = false; });
      this.scene.add(group);
      this.pickups.push({
        kind: def.kind,
        x: def.x,
        z: def.z,
        y: gy + 1.05,
        group: group,
        active: true,
        respawnAt: 0,
        phase: i * 0.7
      });
    }
  };

  Game.prototype._resetPickups = function () {
    for (var i = 0; i < this.pickups.length; i++) {
      var pickup = this.pickups[i];
      pickup.active = true;
      pickup.respawnAt = 0;
      pickup.group.visible = true;
    }
  };

  Game.prototype._buildCollectibles = function () {
    if (!this.scene || !window.THREE) return;
    var spots = [
      { x: -452, z: 338 },
      { x: -430, z: 44 },
      { x: -390, z: -148 },
      { x: -248, z: 84 },
      { x: -60, z: -238 },
      { x: 96, z: 96 },
      { x: 182, z: -272 },
      { x: 344, z: -320 },
      { x: 438, z: -188 },
      { x: 398, z: 268 }
    ];
    var shellMat = new THREE.MeshStandardMaterial({
      color: 0x20313c,
      emissive: 0x0d6f78,
      emissiveIntensity: 0.8,
      roughness: 0.35,
      metalness: 0.55
    });
    var reelMat = new THREE.MeshStandardMaterial({
      color: 0xf3c969,
      emissive: 0xf3c969,
      emissiveIntensity: 0.85,
      roughness: 0.3,
      metalness: 0.4
    });
    this.tapes = [];
    for (var i = 0; i < spots.length; i++) {
      var spot = spots[i];
      var group = new THREE.Group();
      group.name = 'mixtape-' + i;
      var shell = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.14, 0.46), shellMat);
      group.add(shell);
      var reelGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.05, 8);
      for (var r = 0; r < 2; r++) {
        var reel = new THREE.Mesh(reelGeo, reelMat);
        reel.rotation.x = Math.PI / 2;
        reel.position.set(-0.16 + r * 0.32, 0.09, 0);
        group.add(reel);
      }
      var gy = this.world && this.world.groundHeight ? this.world.groundHeight(spot.x, spot.z) : 0;
      group.position.set(spot.x, gy + 1.15, spot.z);
      group.traverse(function (child) { if (child.isMesh) child.castShadow = false; });
      this.scene.add(group);
      this.tapes.push({ index: i, x: spot.x, z: spot.z, y: gy + 1.15, group: group, phase: i * 0.55 });
    }
    this.collectibles = [];
  };

  Game.prototype._syncCollectibles = function () {
    for (var i = 0; i < this.tapes.length; i++) {
      var tape = this.tapes[i];
      tape.group.visible = this.collectibles.indexOf(tape.index) < 0;
    }
  };

  Game.prototype._collectPickup = function (pickup) {
    var player = this.player;
    if (!player || !pickup || !pickup.active) return false;
    if (pickup.kind === 'cash') {
      player.addMoney(150);
      if (this.hud && this.hud.toast) this.hud.toast('CASH PICKUP · +$150', 'cash');
    } else if (pickup.kind === 'health') {
      player.heal(35);
      if (this.hud && this.hud.toast) this.hud.toast('HEALTH PICKUP · +35', 'info');
    } else {
      player.giveArmor(35);
      if (this.hud && this.hud.toast) this.hud.toast('ARMOR PICKUP · +35', 'info');
    }
    pickup.active = false;
    pickup.group.visible = false;
    pickup.respawnAt = this.time + 60;
    return true;
  };

  Game.prototype._collectTape = function (tape) {
    if (!tape || this.collectibles.indexOf(tape.index) >= 0) return false;
    this.collectibles.push(tape.index);
    tape.group.visible = false;
    var player = this.player;
    if (player) player.addMoney(500);
    if (this.hud && this.hud.toast) this.hud.toast('MIX TAPE ' + this.collectibles.length + '/10 · +$500', 'mission');
    if (this.collectibles.length >= 10) {
      if (player) player.addMoney(2500);
      if (this.hud && this.hud.toast) this.hud.toast('ALL MIX TAPES · +$2,500 BONUS', 'cash');
    }
    return true;
  };

  Game.prototype._updatePickups = function (dt) {
    var player = this.player;
    if (!player || !player.pos) return;
    var i;
    for (i = 0; i < this.pickups.length; i++) {
      var pickup = this.pickups[i];
      if (!pickup.active) {
        if (this.time >= pickup.respawnAt) {
          pickup.active = true;
          pickup.group.visible = true;
        }
        continue;
      }
      pickup.phase += dt * 1.8;
      pickup.group.rotation.y += dt * 1.4;
      pickup.group.position.y = pickup.y + Math.sin(pickup.phase) * 0.14;
      var dx = player.pos.x - pickup.x;
      var dz = player.pos.z - pickup.z;
      if (dx * dx + dz * dz <= 2.25) this._collectPickup(pickup);
    }
    for (i = 0; i < this.tapes.length; i++) {
      var tape = this.tapes[i];
      if (this.collectibles.indexOf(tape.index) >= 0) continue;
      tape.phase += dt * 1.5;
      tape.group.rotation.y += dt * 1.2;
      tape.group.position.y = tape.y + Math.sin(tape.phase) * 0.16;
      var tdx = player.pos.x - tape.x;
      var tdz = player.pos.z - tape.z;
      if (tdx * tdx + tdz * tdz <= 2.56) this._collectTape(tape);
    }
  };

  Game.prototype._buildRain = function () {
    if (!this.scene || !window.THREE) return;
    var count = 260;
    var positions = new Float32Array(count * 3);
    var speeds = new Float32Array(count);
    for (var i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 56;
      positions[i * 3 + 1] = Math.random() * 16 + 1;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 56;
      speeds[i] = 15 + Math.random() * 10;
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    var mat = new THREE.PointsMaterial({
      color: 0xbcd9e8,
      size: 0.075,
      transparent: true,
      opacity: 0.62,
      depthWrite: false,
      sizeAttenuation: true
    });
    var points = new THREE.Points(geo, mat);
    points.name = 'rain';
    points.frustumCulled = false;
    points.visible = false;
    this.scene.add(points);
    this.rain = { points: points, positions: positions, speeds: speeds, count: count, material: mat };
  };

  Game.prototype._updateRain = function (dt) {
    if (!this.rain) return;
    var wet = this.clock.weather === 'rain' && this.state === 'play';
    this.rain.points.visible = wet;
    if (!wet) return;
    var player = this.player || this.preview;
    var arr = this.rain.positions;
    var speeds = this.rain.speeds;
    for (var i = 0; i < this.rain.count; i++) {
      arr[i * 3 + 1] -= speeds[i] * dt;
      if (arr[i * 3 + 1] < 0.25) {
        arr[i * 3 + 1] = 15 + Math.random() * 4;
        arr[i * 3] = (Math.random() - 0.5) * 56;
        arr[i * 3 + 2] = (Math.random() - 0.5) * 56;
      }
    }
    this.rain.points.geometry.attributes.position.needsUpdate = true;
    if (player && player.pos) this.rain.points.position.set(player.pos.x, 0, player.pos.z);
  };

  /* --------------------------- ambient + police --------------------------- */

  Game.prototype._buildCombat = function () {
    if (!window.LH.Combat || !this.player) return;
    var self = this;
    try {
      this.combat = new LH.Combat(this.scene, this.camera, this.player, this.audio);
      this.combat.attach(this);
      this.player.combat = this.combat;

      var baseFire = this.combat.fire.bind(this.combat);
      this.combat.fire = function () {
        var fired = baseFire();
        if (fired && !self.shotName && self.player && typeof self.player.onShoot === 'function') {
          try { self.player.onShoot(self.player, self.combat.currentWeapon); } catch (e) { /* heat is optional */ }
        }
        return fired;
      };

      /* mission kills: chain the combat death hook without replacing its own
         heat / cleanup work, so wave and boss objectives see every death. */
      var spawnEnemy = this.combat.spawnEnemy.bind(this.combat);
      this.combat.spawnEnemy = function (opts) {
        var enemy = spawnEnemy(opts);
        if (enemy) {
          var baseDeath = enemy.onDeath;
          enemy.onDeath = function (ped, from) {
            if (typeof baseDeath === 'function') {
              try { baseDeath.call(this, ped, from); } catch (e) { /* combat owns cleanup */ }
            }
            if (self.missions && self.missions.notifyKill) {
              try { self.missions.notifyKill(ped); } catch (e) { /* optional missions */ }
            }
          };
        }
        return enemy;
      };

      /* melee swings: combat only targets its own enemy list, so missions get a
         chance to resolve a punch against a stationary story actor too. */
      var melee = this.combat.melee.bind(this.combat);
      this.combat.melee = function () {
        var before = self.combat.lastMelee;
        var result = melee();
        if (self.missions && self.missions.notifyMelee && self.combat.lastMelee !== before) {
          try { self.missions.notifyMelee(null); } catch (e) { /* optional missions */ }
        }
        return result;
      };
    } catch (err) {
      console.warn('[Leonida] combat build failed', err);
      this.combat = null;
    }
  };

  Game.prototype._buildMissions = function () {
    if (!window.LH.Missions || !this.player) return;
    try {
      this.missions = new LH.Missions(this);
    } catch (err) {
      console.warn('[Leonida] missions build failed', err);
      this.missions = null;
    }
  };

  Game.prototype._buildTrafficAndPolice = function () {
    if (!this.world || !this.player) return;
    var self = this;
    this._vehiclePool = [];

    if (window.LH.Traffic) {
      try {
        var trng = (this.rng && this.rng.fork) ? this.rng.fork('traffic') : (LH.RNG ? LH.RNG(String(this.seed) + ':traffic') : null);
        this.traffic = new LH.Traffic(this.scene, this.world, trng);
      } catch (err) {
        console.warn('[Leonida] traffic build failed', err);
        this.traffic = null;
      }
    }

    if (window.LH.Police) {
      try {
        var prng = (this.rng && this.rng.fork) ? this.rng.fork('police') : (LH.RNG ? LH.RNG(String(this.seed) + ':police') : null);
        this.police = new LH.Police(this.scene, this.world, prng);
        this.police.attach(this);
        var copShoot = this.police._copShoot.bind(this.police);
        this.police._copShoot = function (cop, player) {
          if (self.missions && self.missions.isCopStunned && self.missions.isCopStunned(cop)) return;
          return copShoot(cop, player);
        };
      } catch (err) {
        console.warn('[Leonida] police build failed', err);
        this.police = null;
      }
    }

    this._refreshVehiclePool();
    this._hookCrimeHooks();
  };

  Game.prototype._refreshVehiclePool = function () {
    var pool = this._vehiclePool;
    if (!pool) {
      pool = this._vehiclePool = [];
    }
    pool.length = 0;
    var i;
    if (this.demoVehicles) {
      for (i = 0; i < this.demoVehicles.length; i++) pool.push(this.demoVehicles[i]);
    }
    if (this.traffic && this.traffic.cars) {
      for (i = 0; i < this.traffic.cars.length; i++) pool.push(this.traffic.cars[i]);
    }
    if (this.police) {
      for (i = 0; i < this.police.units.length; i++) pool.push(this.police.units[i]);
      if (this.police.roadblock && this.police.roadblock.units) {
        for (i = 0; i < this.police.roadblock.units.length; i++) pool.push(this.police.roadblock.units[i]);
      }
    }
    if (this.player) this.player.vehicles = pool;
    return pool;
  };

  Game.prototype._hookCrimeHooks = function () {
    var self = this;
    if (this.traffic) {
      this.traffic.onPedHit = function (data) {
        if (self.police && self.police.notifyPedHit) self.police.notifyPedHit(data);
      };
    }
    var player = this.player;
    if (!player) return;

    var baseNearest = player._nearestVehicle;
    player._nearestVehicle = function (maxDist) {
      var base = baseNearest.call(this, maxDist);
      if (self.traffic && self.traffic.nearestCar) {
        var hit = self.traffic.nearestCar(this.pos, maxDist);
        if (hit && hit.vehicle) {
          var baseDist = base ? Math.sqrt((this.pos.x - base.pos.x) * (this.pos.x - base.pos.x) + (this.pos.z - base.pos.z) * (this.pos.z - base.pos.z)) : 1e9;
          if (hit.dist < baseDist) return hit.vehicle;
        }
      }
      return base;
    };

    var baseEnter = player.enter;
    player.enter = function (vehicle) {
      if (vehicle && vehicle.occupiedBy && vehicle.occupiedBy !== this && self.traffic && self.traffic.ejectDriver) {
        self.traffic.ejectDriver(vehicle, this.pos);
      }
      if (vehicle && vehicle._traffic && self.police && self.police.notifyCarjack) {
        self.police.notifyCarjack(vehicle, this.pos);
      }
      return baseEnter.call(this, vehicle);
    };

    var baseShoot = player.onShoot;
    player.onShoot = function (p, weapon) {
      if (typeof baseShoot === 'function') {
        try { baseShoot.call(this, p, weapon); } catch (e) { /* optional combat */ }
      }
      if (self.police && self.police.notifyShot) {
        self.police.notifyShot((p && p.pos) || this.pos);
      } else if (self.police && self.police.addHeat) {
        self.police.addHeat(1, weapon === 'fists' ? 'ASSAULT' : 'SHOTS FIRED');
      }
      if (self.traffic && self.traffic.panic) {
        self.traffic.panic((p && p.pos) || this.pos, 25);
      }
    };

    player.onCrime = function (kind, data) {
      if (!self.police) return;
      if (kind === 'shoot' && self.police.notifyShot) self.police.notifyShot((data && data.pos) || this.pos);
      else if (kind === 'ped' && self.police.notifyPedHit) self.police.notifyPedHit(data || { x: this.pos.x, z: this.pos.z });
      else if (kind === 'carjack' && self.police.notifyCarjack) self.police.notifyCarjack(data, this.pos);
      else if (self.police.addHeat) self.police.addHeat(1, String(kind || 'CRIME').replace(/_/g, ' '));
    };
  };

  Game.prototype.onBusted = function (data) {
    data = data || {};
    var p = this.player;
    if (!p) return false;
    var fine = data.fine != null ? data.fine : ((CFG.PLAYER && CFG.PLAYER.bustedFine) || 250);
    var station = (this.world && (this.world.policeStation || (this.world.points && this.world.points.policeStation))) || { x: 250, z: 250 };
    var dx = p.pos.x - station.x;
    var dz = p.pos.z - station.z;
    var alreadyThere = dx * dx + dz * dz < 64;
    var oldCar = p.vehicle || this._lastVehicle;
    if (p.vehicle && p.exit) {
      try { p.exit(); } catch (e) { p.vehicle = null; }
    }
    if (this.police) {
      this.police.clear();
      this.police.setWanted(0);
    }
    p.setWanted(0);
    if (!alreadyThere) p.money = Math.max(0, (p.money || 0) - fine);
    this._parkVehicle(oldCar, station);
    var spot = (this.world && this.world.collideCircle) ? this.world.collideCircle(station.x, station.z, 0.55) : station;
    var gy = (this.world && this.world.groundHeight) ? this.world.groundHeight(spot.x, spot.z) : 0;
    p.pos.set(spot.x, gy, spot.z);
    p.yaw = 0;
    p.health = (CFG.PLAYER && CFG.PLAYER.respawnHealth) || 65;
    p.armor = 0;
    p.dead = false;
    p.mesh.visible = true;
    p.mesh.position.copy(p.pos);
    p.mesh.rotation.y = p.yaw;
    if (p.character && p.character.setPose) p.character.setPose(p.time || 0, 0, 'idle');
    p.syncPreview();
    if (this.cameraController) this.cameraController.initialised = false;

    if (this.missions && this.missions.active && this.missions.fail) {
      try { this.missions.fail('Busted'); } catch (e) { /* optional missions */ }
    }

    this.state = 'busted';
    this._overlayUntil = this.time + 3;
    if (this.input && this.input.exitLock) this.input.exitLock();
    if (this.hud && this.hud.setScreen) this.hud.setScreen('hud');
    if (this.hud && this.hud.showBusted) {
      try { this.hud.showBusted({ reason: 'BUSTED', fine: fine, location: station }); } catch (e) { /* optional hud */ }
    } else {
      this._showOverlayBanner('BUSTED', 'COSTA SOL PD', '$' + fine + ' FINE · RELEASED AT THE STATION', 'fail');
    }
    if (this.hud && this.hud.toast) this.hud.toast('BUSTED · $' + fine + ' FINE', 'danger');
    if (this.hud && this.hud.setPrompt) this.hud.setPrompt('');
    this.setBustedMeter(0);
    return true;
  };

  Game.prototype.onWasted = function (data) {
    data = data || {};
    var p = this.player;
    if (!p) return false;
    var fee = data.fee != null ? data.fee : ((CFG.PLAYER && CFG.PLAYER.hospitalFee) || 150);
    var hospital = (this.world && (this.world.hospital || (this.world.points && this.world.points.hospital))) || { x: -250, z: 250 };
    var dx = p.pos.x - hospital.x;
    var dz = p.pos.z - hospital.z;
    var alreadyThere = dx * dx + dz * dz < 64;
    var oldCar = p.vehicle || this._lastVehicle;
    if (p.vehicle && p.exit) {
      try { p.exit(); } catch (e) { p.vehicle = null; }
    }
    if (this.police) {
      this.police.clear();
      this.police.setWanted(0);
    }
    p.setWanted(0);
    if (!alreadyThere) p.money = Math.max(0, (p.money || 0) - fee);
    this._parkVehicle(oldCar, hospital);
    var spot = (this.world && this.world.collideCircle) ? this.world.collideCircle(hospital.x, hospital.z, 0.55) : hospital;
    var gy = (this.world && this.world.groundHeight) ? this.world.groundHeight(spot.x, spot.z) : 0;
    p.pos.set(spot.x, gy, spot.z);
    p.yaw = 0;
    p.health = (CFG.PLAYER && CFG.PLAYER.respawnHealth) || 65;
    p.armor = 0;
    p.dead = false;
    p.mesh.visible = true;
    p.mesh.position.copy(p.pos);
    p.mesh.rotation.y = p.yaw;
    if (p.character && p.character.setPose) p.character.setPose(p.time || 0, 0, 'idle');
    p.syncPreview();
    if (this.cameraController) this.cameraController.initialised = false;

    if (this.missions && this.missions.active && this.missions.fail) {
      try { this.missions.fail('Wasted'); } catch (e) { /* optional missions */ }
    }

    this.state = 'wasted';
    this._overlayUntil = this.time + 3;
    if (this.input && this.input.exitLock) this.input.exitLock();
    if (this.hud && this.hud.setScreen) this.hud.setScreen('hud');
    if (this.hud && this.hud.showWasted) {
      try { this.hud.showWasted({ reason: 'WASTED', fee: fee, location: hospital }); } catch (e) { /* optional hud */ }
    } else {
      this._showOverlayBanner('WASTED', 'COSTA SOL GENERAL', '$' + fee + ' HOSPITAL FEE', 'fail');
    }
    if (this.hud && this.hud.toast) this.hud.toast('WASTED · $' + fee + ' HOSPITAL FEE', 'danger');
    if (this.hud && this.hud.setPrompt) this.hud.setPrompt('');
    this.setBustedMeter(0);
    return true;
  };

  Game.prototype._parkVehicle = function (vehicle, near) {
    if (!vehicle) return;
    if (vehicle.repair) {
      try { vehicle.repair(); } catch (e) { /* vehicle already gone */ }
    }
    vehicle.speed = 0;
    vehicle.vx = 0;
    vehicle.vz = 0;
    if (vehicle.setVisible) vehicle.setVisible(false);
    else if (vehicle.mesh) vehicle.mesh.visible = false;
    if (near && vehicle.pos) {
      vehicle.pos.set(near.x + 6, 0, near.z + 6);
      if (vehicle.mesh) vehicle.mesh.position.copy(vehicle.pos);
    }
    this._lastVehicle = null;
  };

  Game.prototype._showOverlayBanner = function (kicker, title, sub, kind) {
    var banner = $('mission-banner');
    if (!banner) return;
    var set = function (id, text) { var el = $(id); if (el) el.textContent = text; };
    set('banner-kicker', kicker);
    set('banner-title', title);
    set('banner-sub', sub);
    banner.classList.toggle('fail', kind === 'fail');
    banner.hidden = false;
    this._overlayBanner = banner;
  };

  Game.prototype._endOverlay = function () {
    if (this.missions && this.missions.active && this.missions.failed) {
      try { this.missions.abort(); } catch (e) { /* optional missions */ }
    }
    this.state = 'play';
    this._overlayUntil = 0;
    if (this._overlayBanner) {
      this._overlayBanner.hidden = true;
      this._overlayBanner = null;
    }
    if (this.hud && this.hud.hideBusted) {
      try { this.hud.hideBusted(); } catch (e) { /* optional hud */ }
    }
    if (this.hud && this.hud.setScreen) this.hud.setScreen('hud');
    if (this.player) {
      this.player.dead = false;
      this.player.mesh.visible = !this.player.vehicle;
      if (this.player.syncPreview) this.player.syncPreview();
    }
    if (this.cameraController) this.cameraController.initialised = false;
    this._autosaveAccum = 0;
    this.lastTime = 0;
  };

  Game.prototype.setBustedMeter = function (value) {
    var v = clamp(value || 0, 0, 1);
    var meter = $('busted-meter');
    if (!meter) return;
    if (v <= 0.002) {
      meter.hidden = true;
      return;
    }
    meter.hidden = false;
    var fill = $('busted-fill');
    var pct = $('busted-pct');
    var title = $('busted-title');
    if (title) title.textContent = 'BUSTED';
    if (fill) fill.style.width = (v * 100).toFixed(0) + '%';
    if (pct) pct.textContent = Math.round(v * 100) + '%';
  };

  Game.prototype._resetDemoVehicles = function () {
    if (!this._demoPlacements) return;
    for (var i = 0; i < this._demoPlacements.length; i++) {
      var p = this._demoPlacements[i];
      var car = p.car;
      if (!car) continue;
      if (car.occupiedBy && car.occupiedBy !== this.player) car.occupiedBy = null;
      car.driver = null;
      car.repair();
      car.pos.set(p.x, (this.world && this.world.groundHeight) ? this.world.groundHeight(p.x, p.z) : 0, p.z);
      car.heading = p.heading;
      car.mesh.rotation.y = p.heading;
      car.speed = 0;
      car.vx = 0;
      car.vz = 0;
      car.setVisible(true);
    }
  };

  Game.prototype._makeSilentAudio = function () {
    return {
      unlock: noop, setMuted: noop, shot: noop, siren: noop,
      engine: noop, impact: noop, footstep: noop, ui: noop,
      missionSting: noop, update: noop, muted: true
    };
  };

  /* ------------------------------- settings ------------------------------- */

  Game.prototype._loadSettings = function () {
    var fallback = { muted: false, quality: 'high' };
    try {
      var raw = window.localStorage.getItem((CFG.SETTINGS_KEY) || 'leonida-heat-3d.settings.v6');
      if (!raw) return fallback;
      var parsed = JSON.parse(raw);
      return {
        muted: !!parsed.muted,
        quality: parsed.quality === 'low' ? 'low' : 'high'
      };
    } catch (e) {
      return fallback;
    }
  };

  Game.prototype._saveSettings = function () {
    try {
      window.localStorage.setItem((CFG.SETTINGS_KEY) || 'leonida-heat-3d.settings.v6', JSON.stringify(this.settings));
    } catch (e) { /* storage may be blocked; the game still runs */ }
  };

  Game.prototype._applySettings = function () {
    if (this.audio && this.audio.setMuted) this.audio.setMuted(this.settings.muted);
    var muteBtn = $('btn-mute');
    if (muteBtn) muteBtn.innerHTML = '<span class="menu-num">04</span>AUDIO: ' + (this.settings.muted ? 'OFF' : 'ON');
    var qBtn = $('btn-quality');
    if (qBtn) qBtn.innerHTML = '<span class="menu-num">05</span>SHADOWS: ' + (this.settings.quality === 'low' ? 'LOW' : 'HIGH');
    this.setQuality(this.settings.quality, true);
  };

  Game.prototype.setMuted = function (muted) {
    this.settings.muted = !!muted;
    if (this.audio && this.audio.setMuted) this.audio.setMuted(this.settings.muted);
    if (this.audio && this.audio.unlock) this.audio.unlock();
    this._saveSettings();
    var btn = $('btn-mute');
    if (btn) btn.innerHTML = '<span class="menu-num">04</span>AUDIO: ' + (this.settings.muted ? 'OFF' : 'ON');
    return this.settings.muted;
  };

  Game.prototype.setQuality = function (quality, silent) {
    this.settings.quality = quality === 'low' ? 'low' : 'high';
    var low = this.settings.quality === 'low';
    if (this.renderer) this.renderer.shadowMap.enabled = !low;
    if (this.sun) {
      this.sun.castShadow = !low;
      var size = low
        ? ((CFG.QUALITY && CFG.QUALITY.shadowsLow) || 1024)
        : ((CFG.QUALITY && CFG.QUALITY.shadowsHigh) || 2048);
      if (this.sun.shadow.mapSize.x !== size) {
        this.sun.shadow.mapSize.set(size, size);
        if (this.sun.shadow.map) {
          this.sun.shadow.map.dispose();
          this.sun.shadow.map = null;
        }
      }
    }
    var btn = $('btn-quality');
    if (btn) btn.innerHTML = '<span class="menu-num">05</span>SHADOWS: ' + (low ? 'LOW' : 'HIGH');
    if (!silent) this._saveSettings();
  };

  Game.prototype.toggleQuality = function () {
    this.setQuality(this.settings.quality === 'high' ? 'low' : 'high');
    if (this.hud && this.hud.toast) this.hud.toast('SHADOWS ' + (this.settings.quality === 'high' ? 'HIGH' : 'LOW'), 'info');
  };

  Game.prototype._setShadowSize = function (size) {
    if (!this.sun || !this.sun.shadow) return;
    if (this.sun.shadow.mapSize.x === size) return;
    this.sun.shadow.mapSize.set(size, size);
    if (this.sun.shadow.map) {
      this.sun.shadow.map.dispose();
      this.sun.shadow.map = null;
    }
  };

  Game.prototype._applyPixelRatio = function () {
    if (!this.renderer) return;
    var cap = (CFG.QUALITY && CFG.QUALITY.pixelRatioCap) || 1.5;
    var capRatio = Math.min(window.devicePixelRatio || 1, cap);
    var ladder = [1.5, 1.25, 1.0, 0.85];
    var want = ladder[Math.min(this._pixelRatioIndex, ladder.length - 1)];
    this._pixelRatio = Math.max(0.7, Math.min(capRatio, want));
    this.renderer.setPixelRatio(this._pixelRatio);
  };

  Game.prototype._adaptiveQuality = function (frameDt) {
    if (!this.renderer) return;
    var fps = this.perf.fps;
    this._qualityCheck += frameDt;
    if (fps < 48 && this._qualityCheck >= 2) {
      this._qualityCheck = 0;
      this._qualitySlowTime = 0;
      if (this._pixelRatioIndex < 3) {
        this._pixelRatioIndex += 1;
        this._applyPixelRatio();
      }
      if (this._pixelRatioIndex >= 2) this._setShadowSize(1024);
    } else if (fps > 58) {
      this._qualitySlowTime += frameDt;
      if (this._qualitySlowTime >= 5) {
        this._qualitySlowTime = 0;
        if (this._pixelRatioIndex > 0) {
          this._pixelRatioIndex -= 1;
          this._applyPixelRatio();
        } else if (this.settings.quality !== 'low') {
          this._setShadowSize((CFG.QUALITY && CFG.QUALITY.shadowsHigh) || 2048);
        }
      }
    } else {
      this._qualitySlowTime = 0;
    }
  };

  /* ------------------------------- DOM / UI ------------------------------- */

  Game.prototype._bindUI = function () {
    var self = this;
    function on(id, fn) {
      var el = $(id);
      if (el) el.addEventListener('click', function (ev) {
        ev.preventDefault();
        if (self.audio && self.audio.unlock) self.audio.unlock();
        if (self.audio && self.audio.ui) self.audio.ui();
        fn(ev);
      });
    }

    on('btn-new-game', function () { self.newGame(); });
    on('btn-continue', function () { if (!self.load()) self.newGame(); });
    on('btn-how-to-play', function () { self.openHelp(); });
    on('btn-credits', function () { self.openCredits(); });
    on('btn-credits-close', function () { self.closeHelp(); });
    on('btn-help-close', function () { self.closeHelp(); });

    on('btn-resume', function () { self.resume(); });
    on('btn-save', function () { self.save(); });
    on('btn-restart', function () { self.resume(); self.newGame(); });
    on('btn-mute', function () { self.setMuted(!self.settings.muted); });
    on('btn-quality', function () { self.toggleQuality(); });
    on('btn-quit', function () { self.quitToTitle(); });

    on('btn-briefing-start', function () { self.beginMission(); });
    on('btn-result-continue', function () { self.continueAfterResult(); });
    on('btn-result-retry', function () { self.retryMission(); });

    var wheel = $('weapon-wheel');
    if (wheel) {
      if (!this.hud || !this.hud.wheelClick) {
        wheel.addEventListener('click', function (ev) {
          if (ev.target === wheel) self.closeWheel();
        });
        wheel.querySelectorAll('.wheel-slot').forEach(function (slot) {
          slot.addEventListener('click', function () {
            if (self.combat && self.combat.setWeapon) self.combat.setWeapon(slot.dataset.weapon);
          });
        });
      }
    }

    var canvas = this.canvas;
    if (canvas) {
      canvas.addEventListener('click', function () {
        if (self.audio && self.audio.unlock) self.audio.unlock();
        if (self.state === 'play' && self.input) self.input.requestLock();
      });
      canvas.addEventListener('dblclick', function () {
        self.toggleFullscreen();
      });
    }

    var cont = $('btn-continue');
    var hasSave = false;
    try { hasSave = !!window.localStorage.getItem((CFG.SAVE_KEY) || 'leonida-heat-3d.save.v6'); } catch (e) { hasSave = false; }
    if (cont) cont.disabled = !hasSave;
    var best = $('title-best');
    if (best) best.textContent = hasSave ? 'SAVE DATA FOUND · CONTINUE AVAILABLE' : 'NO SAVE DATA';
  };

  Game.prototype.openHelp = function () {
    if (this.state === 'help' || this.state === 'credits') return;
    this._helpReturn = this.state === 'title' || this.state === 'boot' ? 'title' : this.state;
    this.state = 'help';
    if (this.input) this.input.exitLock();
    this.hud.setScreen('help');
  };

  Game.prototype.openCredits = function () {
    if (this.state === 'help' || this.state === 'credits') return;
    this._helpReturn = this.state === 'title' || this.state === 'boot' ? 'title' : this.state;
    this.state = 'credits';
    if (this.input) this.input.exitLock();
    this.hud.setScreen('credits');
  };

  Game.prototype.closeHelp = function () {
    var back = this._helpReturn || 'title';
    this._helpReturn = null;
    if (back === 'title' || back === 'boot') {
      this.showTitle();
    } else if (back === 'paused') {
      this.state = 'paused';
      this.hud.setScreen('pause');
    } else {
      this.state = 'play';
      this.hud.setScreen('hud');
    }
  };

  Game.prototype.showTitle = function () {
    this.state = 'title';
    this.shotReady = false;
    if (this.input) this.input.exitLock();
    if (this.hud) this.hud.setScreen('title');
    document.body.classList.add('is-title');
    var cont = $('btn-continue');
    var has = false;
    try { has = !!window.localStorage.getItem((CFG.SAVE_KEY) || 'leonida-heat-3d.save.v6'); } catch (e) { has = false; }
    if (cont) cont.disabled = !has;
    var best = $('title-best');
    if (best) best.textContent = has ? 'SAVE DATA FOUND · CONTINUE AVAILABLE' : 'NO SAVE DATA';
  };

  Game.prototype.start = function () {
    this.state = 'play';
    document.body.classList.remove('is-title');
    if (this.hud) {
      this.hud.setScreen('hud');
      if ('moneyShown' in this.hud) this.hud.moneyShown = (this.player || this.preview).money || 0;
    }
    if (this.audio && this.audio.unlock) this.audio.unlock();
    if (this.cameraController) this.cameraController.initialised = false;
    this.lastTime = 0;
  };

  Game.prototype.newGame = function () {
    if (!this.traffic || !this.police) this._buildTrafficAndPolice();
    if (!this.combat) this._buildCombat();
    if (!this.missions) this._buildMissions();
    this.clock.minutes = (CFG.CLOCK && CFG.CLOCK.startMinutes) || 1080;
    this.clock.day = (CFG.CLOCK && CFG.CLOCK.startDay) || 1;
    this.clock.weather = (CFG.CLOCK && CFG.CLOCK.startWeather) || 'clear';
    this.clock.elapsed = 0;
    this.clock.weatherTimer = 0;
    this._resetWeatherTimer();

    var spawn = (this.world && this.world.spawn) || (CFG.WORLD && CFG.WORLD.points.spawn) || { x: 0, z: 0 };
    var spawnY = (this.world && this.world.groundHeight) ? this.world.groundHeight(spawn.x, spawn.z) : 0;
    this.preview.pos.set(spawn.x, spawnY, spawn.z);
    if (this.cameraController) {
      this.cameraController.yaw = this.preview.yaw;
      this.cameraController.initialised = false;
    }
    this.preview.health = (CFG.PLAYER && CFG.PLAYER.maxHealth) || 100;
    this.preview.armor = 0;
    this.preview.money = (CFG.PLAYER && CFG.PLAYER.startMoney) || 500;
    this.preview.wanted = 0;
    this.preview.vehicle = null;

    this.collectibles = [];
    this._resetPickups();
    this._syncCollectibles();
    this._lastVehicle = null;
    this._autosaveAccum = 0;
    this._overlayUntil = 0;
    this._crewFallback = { maya: 0, dez: 0, rook: 0 };
    if (this._overlayBanner) {
      this._overlayBanner.hidden = true;
      this._overlayBanner = null;
    }

    if (this.player) {
      this.player.preview = this.preview;
      this.player.reset(spawn.x, spawn.z, (typeof spawn.yaw === 'number') ? spawn.yaw : this.preview.yaw);
      this.player.vehicles = this._vehiclePool || this.demoVehicles || null;
      this._resetDemoVehicles();
    }
    if (this.combat) {
      this.combat.clearEnemies();
      this.combat.setWeapon(this.player ? this.player.currentWeapon : 'pistol');
      this.combat.refill();
      this.combat.reloadTimer = 0;
    }
    if (this.police) {
      this.police.clear();
      this.police.setWanted(0);
    }
    if (this.missions) {
      if (this.missions.active || this.missions.briefing) this.missions.abort();
      this.missions.reset();
    }
    if (this.traffic) {
      if (this.traffic.spawnAround) this.traffic.spawnAround(this.player ? this.player.pos : spawn);
    }
    this._refreshVehiclePool();

    if (this.hud && this.hud.setScreen) this.hud.setScreen('hud');
    if (this.hud && this.hud.hideBusted) this.hud.hideBusted();
    this.start();
    if (this.hud && this.hud.toast) this.hud.toast('WELCOME TO COSTA SOL · OCEAN DRIVE', 'mission');
    this._applySky();
    this.save(true);
    return true;
  };

  Game.prototype._corruptSave = function () {
    if (this.hud && this.hud.toast) this.hud.toast('SAVE DATA CORRUPT · FRESH START', 'danger');
    try {
      window.localStorage.removeItem((CFG.SAVE_KEY) || 'leonida-heat-3d.save.v6');
    } catch (e) { /* storage may be blocked */ }
    this.newGame();
    return true;
  };

  Game.prototype.load = function () {
    var raw = null;
    try { raw = window.localStorage.getItem((CFG.SAVE_KEY) || 'leonida-heat-3d.save.v6'); } catch (e) { raw = null; }
    if (!raw) return false;
    var data;
    try { data = JSON.parse(raw); } catch (e) { return this._corruptSave(); }
    if (!data || typeof data !== 'object' || data.version !== (CFG.VERSION || 6)) return this._corruptSave();

    var px = data.position && isFinite(data.position.x) ? Number(data.position.x) : null;
    var pz = data.position && isFinite(data.position.z) ? Number(data.position.z) : null;
    if (px === null || pz === null || !isFinite(px) || !isFinite(pz)) return this._corruptSave();

    this.preview.pos.set(px, 0, pz);
    if (typeof data.money === 'number') this.preview.money = data.money;
    if (typeof data.health === 'number') this.preview.health = data.health;
    if (typeof data.armor === 'number') this.preview.armor = data.armor;
    if (typeof data.wanted === 'number') this.preview.wanted = data.wanted;
    if (data.weapons) this.preview.weapons = data.weapons;
    if (typeof data.currentWeapon === 'string') this.preview.currentWeapon = data.currentWeapon;

    if (this.player) {
      this.player.preview = this.preview;
      this.player.reset(px, pz, typeof data.yaw === 'number' && isFinite(data.yaw) ? data.yaw : this.player.yaw);
      if (typeof data.health === 'number' && isFinite(data.health)) this.player.health = clamp(data.health, 0, this.player.maxHealth);
      if (typeof data.armor === 'number' && isFinite(data.armor)) this.player.armor = clamp(data.armor, 0, this.player.maxArmor);
      if (typeof data.money === 'number' && isFinite(data.money)) this.player.money = Math.max(0, data.money);
      if (typeof data.wanted === 'number' && isFinite(data.wanted)) this.player.setWanted(data.wanted);
      if (data.weapons && typeof data.weapons === 'object') {
        var clean = {};
        var start = (CFG.PLAYER && CFG.PLAYER.startWeapons) || {};
        for (var wid in start) {
          if (!Object.prototype.hasOwnProperty.call(start, wid)) continue;
          clean[wid] = { owned: !!start[wid].owned, ammo: start[wid].ammo || 0, reserve: start[wid].reserve || 0 };
        }
        for (var oid in data.weapons) {
          if (!Object.prototype.hasOwnProperty.call(data.weapons, oid)) continue;
          var sw = data.weapons[oid];
          if (!sw || typeof sw !== 'object') continue;
          clean[oid] = {
            owned: !!sw.owned,
            ammo: Math.max(0, Math.round(Number(sw.ammo) || 0)),
            reserve: Math.max(0, Math.round(Number(sw.reserve) || 0))
          };
        }
        this.player.weapons = clean;
      }
      if (typeof data.currentWeapon === 'string' && this.player.weapons[data.currentWeapon]) {
        this.player.currentWeapon = data.currentWeapon;
      }
      this.player.vehicles = this._vehiclePool || this.demoVehicles || null;
      this.player.syncPreview();
    }
    if (this.police) {
      this.police.clear();
      if (typeof data.wanted === 'number' && data.wanted > 0) this.police.setWanted(data.wanted);
    }
    if (this.missions && this.missions.loadState) {
      var progress = data.missionProgress || {
        index: typeof data.missionIndex === 'number' ? data.missionIndex : 0,
        completed: data.missionCompleted
      };
      try { this.missions.loadState(progress); } catch (e) { /* keep a fresh mission state */ }
    }
    this.collectibles = [];
    if (Object.prototype.toString.call(data.collectibles) === '[object Array]') {
      for (var c = 0; c < data.collectibles.length; c++) {
        var id = Math.round(Number(data.collectibles[c]));
        if (isFinite(id) && id >= 0 && id < 10 && this.collectibles.indexOf(id) < 0) this.collectibles.push(id);
      }
    }
    this._syncCollectibles();
    this._resetPickups();
    this._lastVehicle = null;
    this._autosaveAccum = 0;
    if (this.combat) {
      this.combat.clearEnemies();
      this.combat.setWeapon(this.player ? this.player.currentWeapon : 'pistol');
    }
    if (this.traffic && this.traffic.spawnAround) this.traffic.spawnAround(this.player ? this.player.pos : this.preview.pos);
    this._refreshVehiclePool();
    if (data.clock) {
      if (isFinite(data.clock.minutes)) this.clock.minutes = Number(data.clock.minutes);
      if (isFinite(data.clock.day)) this.clock.day = Math.max(1, Math.round(Number(data.clock.day)));
      this.clock.weather = data.clock.weather === 'rain' || data.clock.weather === 'haze' ? data.clock.weather : 'clear';
      this.clock.weatherTimer = 0;
    }

    if (this.cameraController) this.cameraController.initialised = false;
    this.start();
    if (this.hud && this.hud.toast) this.hud.toast('SAVE LOADED · COSTA SOL REMEMBERS', 'cash');
    this._applySky();
    return true;
  };

  Game.prototype.save = function (silent) {
    var p = this.player || this.preview;
    var progress = this.missions && this.missions.saveState ? this.missions.saveState() : null;
    var data = {
      version: CFG.VERSION || 6,
      timestamp: Date.now(),
      savedAt: Date.now(),
      position: { x: Math.round(p.pos.x * 100) / 100, y: p.pos.y || 0, z: Math.round(p.pos.z * 100) / 100 },
      yaw: p.yaw || 0,
      money: Math.round(p.money || 0),
      health: Math.round(p.health == null ? 100 : p.health),
      armor: Math.round(p.armor || 0),
      wanted: Math.round((this.police && this.police.wanted) || p.wanted || 0),
      weapons: p.weapons || this.preview.weapons,
      currentWeapon: p.currentWeapon || 'pistol',
      missionIndex: this.missions && typeof this.missions.index === 'number' ? this.missions.index : 0,
      missionCompleted: this.missions && this.missions.completed ? this.missions.completed.slice() : [],
      missionProgress: progress,
      collectibles: (this.collectibles || []).slice(),
      clock: {
        minutes: this.clock.minutes,
        day: this.clock.day,
        weather: this.clock.weather
      }
    };
    try {
      window.localStorage.setItem((CFG.SAVE_KEY) || 'leonida-heat-3d.save.v6', JSON.stringify(data));
      this._autosavePulse();
      if (!silent && this.hud && this.hud.toast) this.hud.toast('GAME SAVED', 'cash');
      var cont = $('btn-continue');
      if (cont) cont.disabled = false;
      return true;
    } catch (e) {
      if (this.hud && this.hud.toast) this.hud.toast('SAVE UNAVAILABLE', 'danger');
      return false;
    }
  };

  Game.prototype._autosavePulse = function () {
    if (this.hud && this.hud.saveToast) {
      this.hud.saveToast();
      return;
    }
    var el = $('autosave');
    if (!el) return;
    el.hidden = false;
    clearTimeout(this._autosaveTimer);
    var self = this;
    this._autosaveTimer = setTimeout(function () { el.hidden = true; }, 1800);
  };

  Game.prototype.autosave = function () { return this.save(); };

  Game.prototype.togglePause = function () {
    if (this.state === 'play') {
      this.state = 'paused';
      if (this.input) this.input.exitLock();
      if (this.hud) this.hud.setScreen('pause');
      var sub = $('pause-sub');
      if (sub) sub.textContent = 'COSTA SOL · ' + this.getClockLabel() + ' · ' + String(this.clock.weather).toUpperCase();
    } else if (this.state === 'paused') {
      this.resume();
    }
  };

  Game.prototype.resume = function () {
    if (this.state === 'title') return;
    this.state = 'play';
    if (this.hud) this.hud.setScreen('hud');
  };

  /* X / C / V all funnel through this single entry point so a mission, the
     HUD or a future phone app can trigger the same cooldown-checked crew move. */
  Game.prototype.onCrewAbility = function (id) {
    if (this.state !== 'play' && this.state !== 'wheel') return false;
    if (this.missions && this.missions.useCrew) return this.missions.useCrew(id);
    return this._crewFallbackAbility(id);
  };

  Game.prototype._crewFallbackAbility = function (id) {
    var cd = this._crewFallback || { maya: 0, dez: 0, rook: 0 };
    if ((cd[id] || 0) > 0) {
      if (this.hud && this.hud.toast) this.hud.toast(String(id).toUpperCase() + ' COOLING · ' + Math.ceil(cd[id]) + ' S', 'info');
      return false;
    }
    var p = this.player;
    var used = false;
    if (id === 'maya') {
      if (this.police && this.police.roadblock && this.police.roadblock.active) {
        this.police.clearRoadblock(true, false);
        used = true;
      }
      if (this.police && this.police.wanted > 0) {
        this.police.setWanted(this.police.wanted - 1);
        used = true;
      }
      if (this.hud && this.hud.toast) this.hud.toast(used ? 'MAYA DECOY · HEAT PULLED EAST' : 'MAYA · NO UNITS TO FOOL', 'crew');
    } else if (id === 'dez') {
      if (p && p.vehicle && p.vehicle.repair) {
        p.vehicle.repair();
        used = true;
        if (this.hud && this.hud.toast) this.hud.toast('DEZ REPAIR · VEHICLE PATCHED', 'crew');
      } else if (this.hud && this.hud.toast) {
        this.hud.toast('DEZ · NO VEHICLE TO REPAIR', 'info');
      }
    } else if (id === 'rook') {
      var n = 0;
      if (this.police && this.police.cops) {
        for (var i = 0; i < this.police.cops.length; i++) {
          var cop = this.police.cops[i];
          if (!cop || !cop.alive || !cop.pos || !p) continue;
          var dx = cop.pos.x - p.pos.x;
          var dz = cop.pos.z - p.pos.z;
          if (dx * dx + dz * dz > 400) continue;
          cop.stunUntil = this.time + 6;
          cop.hostile = false;
          n++;
        }
      }
      used = n > 0;
      if (this.hud && this.hud.toast) this.hud.toast(n ? 'ROOK BACKUP · ' + n + ' STUNNED' : 'ROOK · NO OFFICERS IN RANGE', n ? 'crew' : 'info');
    }
    if (used) {
      cd[id] = (CFG.CREW && CFG.CREW[id] && CFG.CREW[id].cooldown) || 40;
      this._crewFallback = cd;
      if (this.hud && this.hud.setCrew) this.hud.setCrew(cd);
    }
    return used;
  };

  Game.prototype._updateCrewFallback = function (dt) {
    if (!this._crewFallback) return;
    var changed = false;
    for (var id in this._crewFallback) {
      if (!Object.prototype.hasOwnProperty.call(this._crewFallback, id)) continue;
      if (this._crewFallback[id] > 0) {
        this._crewFallback[id] = Math.max(0, this._crewFallback[id] - dt);
        changed = true;
      }
    }
    if (changed && this.hud && this.hud.setCrew) this.hud.setCrew(this._crewFallback);
  };

  /* ------------------------------ interaction ------------------------------ */

  Game.prototype._nearestPickup = function (maxDist) {
    var p = this.player;
    if (!p || !p.pos) return null;
    var best = null;
    var bestD = maxDist == null ? 1.5 : maxDist;
    for (var i = 0; i < this.pickups.length; i++) {
      var pickup = this.pickups[i];
      if (!pickup.active) continue;
      var dx = p.pos.x - pickup.x;
      var dz = p.pos.z - pickup.z;
      var d = Math.sqrt(dx * dx + dz * dz);
      if (d < bestD) { bestD = d; best = pickup; }
    }
    return best;
  };

  Game.prototype._nearestTape = function (maxDist) {
    var p = this.player;
    if (!p || !p.pos) return null;
    var best = null;
    var bestD = maxDist == null ? 1.6 : maxDist;
    for (var i = 0; i < this.tapes.length; i++) {
      var tape = this.tapes[i];
      if (this.collectibles.indexOf(tape.index) >= 0) continue;
      var dx = p.pos.x - tape.x;
      var dz = p.pos.z - tape.z;
      var d = Math.sqrt(dx * dx + dz * dz);
      if (d < bestD) { bestD = d; best = tape; }
    }
    return best;
  };

  Game.prototype._nearestCar = function (maxDist) {
    var p = this.player;
    if (!p || !p.pos) return null;
    var best = null;
    var bestD = maxDist == null ? 3.2 : maxDist;
    var i;
    if (this.traffic && this.traffic.cars) {
      for (i = 0; i < this.traffic.cars.length; i++) {
        var car = this.traffic.cars[i];
        if (!car || car.destroyed || !car.pos) continue;
        var dx = car.pos.x - p.pos.x;
        var dz = car.pos.z - p.pos.z;
        var d = Math.sqrt(dx * dx + dz * dz);
        if (d < bestD) { bestD = d; best = car; }
      }
    }
    var list = this._vehiclePool || this.demoVehicles || [];
    for (i = 0; i < list.length; i++) {
      var v = list[i];
      if (!v || v.destroyed || !v.pos) continue;
      var vx = v.pos.x - p.pos.x;
      var vz = v.pos.z - p.pos.z;
      var vd = Math.sqrt(vx * vx + vz * vz);
      if (vd < bestD) { bestD = vd; best = v; }
    }
    return best;
  };

  Game.prototype._tryInteract = function () {
    if (this.state !== 'play') return false;
    var p = this.player;
    if (!p) return false;
    if (this.missions && this.missions.wantsE && this.missions.wantsE()) {
      return this.missions.handleE();
    }
    var pickup = this._nearestPickup(1.5);
    if (pickup) return this._collectPickup(pickup);
    var tape = this._nearestTape(1.6);
    if (tape) return this._collectTape(tape);
    if (p.vehicle) {
      p.exit();
      return true;
    }
    var car = this._nearestCar(3.2);
    if (!car) return false;
    if (car.occupiedBy && car.occupiedBy !== p && this.traffic && this.traffic.ejectDriver) {
      this.traffic.ejectDriver(car, p.pos);
      if (this.police && this.police.notifyCarjack) this.police.notifyCarjack(car, p.pos);
    }
    return p.enter(car);
  };

  Game.prototype._updateInteractionPrompt = function () {
    if (!this.hud || !this.hud.setPrompt || !this.player) return;
    if (this.state !== 'play') return;
    if (this.missions && this.missions.wantsE && this.missions.wantsE()) return;
    var pickup = this._nearestPickup(1.5);
    if (pickup) {
      var label = pickup.kind === 'cash' ? 'COLLECT CASH' : pickup.kind === 'health' ? 'COLLECT HEALTH' : 'COLLECT ARMOR';
      this.hud.setPrompt('E — ' + label);
      return;
    }
    var tape = this._nearestTape(1.6);
    if (tape) {
      this.hud.setPrompt('E — PICK UP MIXTAPE');
      return;
    }
    if (this.player.vehicle) {
      this.hud.setPrompt('E — EXIT VEHICLE');
      return;
    }
    var car = this._nearestCar(3.2);
    if (!car) {
      this.hud.setPrompt('');
      return;
    }
    this.hud.setPrompt(car.occupiedBy ? 'E — STEAL VEHICLE' : 'E — ENTER VEHICLE');
  };

  Game.prototype.quitToTitle = function () {
    if (this.missions && this.missions.active) this.missions.fail('Abandoned');
    if (this.input) this.input.exitLock();
    this.showTitle();
  };

  Game.prototype.openWheel = function (mode) {
    if (this.state !== 'play') return;
    this.state = 'wheel';
    if (this.input) this.input.exitLock();
    if (this.hud) {
      if (this.hud.openWheel) this.hud.openWheel(mode || 'wheel');
      else this.hud.setScreen('wheel');
    }
  };

  Game.prototype.closeWheel = function () {
    if (this.state !== 'wheel') return;
    this.state = 'play';
    if (this.hud) {
      if (this.hud.closeWheel) this.hud.closeWheel();
      else this.hud.setScreen('hud');
    }
  };

  Game.prototype.beginMission = function () {
    if (this.state === 'briefing' || this.state === 'title') {
      this.state = 'play';
      if (this.hud) this.hud.setScreen('hud');
      if (this.missions && this.missions.begin) this.missions.begin();
    }
  };

  Game.prototype.continueAfterResult = function () {
    if (this.hud) this.hud.setScreen('hud');
    this.state = 'play';
    if (this.missions && this.missions.next) this.missions.next();
  };

  Game.prototype.retryMission = function () {
    if (this.hud) this.hud.setScreen('hud');
    this.state = 'play';
    if (this.missions && this.missions.retry) this.missions.retry();
  };

  Game.prototype.showBriefing = function (mission) {
    this.state = 'briefing';
    if (this.input) this.input.exitLock();
    if (this.hud) this.hud.showBriefing(mission);
  };

  Game.prototype.showResult = function (win, data) {
    this.state = 'result';
    if (this.hud) this.hud.showResult(win, data);
  };

  Game.prototype.toggleFullscreen = function () {
    try {
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen();
      } else if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    } catch (e) { /* fullscreen can be denied */ }
  };

  /* ------------------------------- input ------------------------------- */

  Game.prototype._handleInput = function () {
    var input = this.input;
    if (!input) return;

    if (this.audio && this.audio.unlock && !this.audio.unlocked && (input.anyKey || input.mouse.clicked)) {
      this.audio.unlock();
    }

    if (input.consume('KeyM')) this.setMuted(!this.settings.muted);

    if (input.consume('KeyF')) this.toggleFullscreen();

    if (this.state === 'play') {
      if (input.consume('KeyE')) this._tryInteract();
      if (input.consume('KeyX')) this.onCrewAbility('maya');
      if (input.consume('KeyC')) this.onCrewAbility('dez');
      if (input.consume('KeyV')) this.onCrewAbility('rook');
    }

    if (input.consume('Escape')) {
      if (this.state === 'wheel') this.closeWheel();
      else if (this.state === 'help' || this.state === 'credits') this.closeHelp();
      else if (this.state === 'play') this.togglePause();
      else if (this.state === 'paused') this.resume();
      else if (this.state === 'briefing' || this.state === 'result' || this.state === 'busted' || this.state === 'wasted') {
        /* the briefing/result/overlay owns the screen; Escape must not skip it */
      } else if (this.state === 'title') { /* stay on title */ }
    }

    if (input.consume('KeyH')) {
      if (this.state === 'help') this.closeHelp();
      else if (this.state === 'play' || this.state === 'paused' || this.state === 'title') this.openHelp();
    }

    if (input.consume('KeyQ')) {
      if (this.state === 'play') this.openWheel('wheel');
      else if (this.state === 'wheel') this.closeWheel();
    }

    if (input.consume('Tab')) {
      if (this.state === 'play' && this.hud && this.hud.toast) this.hud.toast('MAP LOCKED · FOLLOW THE YELLOW MARKER', 'info');
      else if (this.state === 'wheel') this.closeWheel();
    }

    if (this.state === 'title') {
      if (input.consume('Enter') || input.consume('NumpadEnter')) this.newGame();
    }

    if (this.state === 'briefing' && (input.consume('Space') || input.consume('Enter'))) {
      this.beginMission();
    }

    if (this.state === 'wheel' && input.consume('Space')) this.closeWheel();
  };

  /* -------------------------------- clock -------------------------------- */

  Game.prototype._resetWeatherTimer = function () {
    var c = CFG.CLOCK || {};
    var min = c.weatherChangeMin || 150;
    var max = c.weatherChangeMax || 260;
    this.clock.weatherTimer = 0;
    this._weatherMax = min + Math.random() * Math.max(1, max - min);
    if (this.rng) this._weatherMax = this.rng.range(min, max);
  };

  Game.prototype.getClockLabel = function () {
    var total = ((this.clock.minutes % 1440) + 1440) % 1440;
    var h = Math.floor(total / 60);
    var m = Math.floor(total % 60);
    return pad(h) + ':' + pad(m);
  };

  Game.prototype._advanceClock = function (dt) {
    var dayLength = (CFG.CLOCK && CFG.CLOCK.dayLength) || 720;
    this.clock.elapsed += dt;
    this.clock.minutes += dt * (1440 / dayLength);
    while (this.clock.minutes >= 1440) {
      this.clock.minutes -= 1440;
      this.clock.day += 1;
    }

    this.clock.weatherTimer += dt;
    if (this.clock.weatherTimer >= this._weatherMax) {
      var list = (CFG.CLOCK && CFG.CLOCK.weathers) || ['clear', 'haze', 'rain'];
      var options = list.filter(function (w) { return w !== this.clock.weather; }, this);
      this.clock.weather = this.rng ? this.rng.pick(options) : options[0];
      this.clock.weatherTimer = 0;
      this._resetWeatherTimer();
      if (this.hud && this.hud.toast) this.hud.toast('WEATHER · ' + String(this.clock.weather).toUpperCase(), 'info');
    }
  };

  Game.prototype._skyPhase = function () {
    var m = ((this.clock.minutes % 1440) + 1440) % 1440;
    var dawn = ((CFG.CLOCK && CFG.CLOCK.dawn) || 5.5) * 60;
    var day = ((CFG.CLOCK && CFG.CLOCK.day) || 7.5) * 60;
    var dusk = ((CFG.CLOCK && CFG.CLOCK.dusk) || 18) * 60;
    var night = ((CFG.CLOCK && CFG.CLOCK.night) || 20.5) * 60;
    var blend = function (a, b, t) { return a + (b - a) * clamp(t, 0, 1); };

    if (m < dawn) return { night: 1, sun: 0.16, warm: 0 };
    if (m < day) return { night: 1 - (m - dawn) / (day - dawn), sun: 0.18 + (m - dawn) / (day - dawn) * 0.85, warm: 1 };
    if (m < dusk) {
      var t = (m - day) / (dusk - day);
      return { night: 0, sun: 1.0 + Math.sin(t * Math.PI) * 0.12, warm: 0.2 };
    }
    if (m < night) {
      var d = (m - dusk) / (night - dusk);
      return { night: d, sun: 1.0 - d * 0.82, warm: 1 };
    }
    return { night: 1, sun: 0.16, warm: 0 };
  };

  Game.prototype._applySky = function () {
    if (!this.scene) return;
    var p = this._skyPhase();
    var nightCol = this._nightCol;
    var duskCol = this._duskCol;
    var dayCol = this._dayCol;
    var fogCol = this._fogColor;

    this._tmpColor.copy(dayCol).lerp(duskCol, clamp(p.warm, 0, 1)).lerp(nightCol, clamp(p.night, 0, 1));
    this.scene.background.copy(this._tmpColor);
    fogCol.copy(this._tmpColor).lerp(this._fogTint, 0.18);
    this.scene.fog.color.copy(fogCol);

    var weather = this.clock.weather;
    var baseNear = (CFG.WORLD && CFG.WORLD.fogNear) || 80;
    var baseFar = (CFG.WORLD && CFG.WORLD.fogFar) || 520;
    if (weather === 'rain') baseFar = (CFG.CLOCK && CFG.CLOCK.rainFog) || 300;
    else if (weather === 'haze') baseFar = (CFG.CLOCK && CFG.CLOCK.hazeFog) || 470;
    else baseFar = (CFG.CLOCK && CFG.CLOCK.clearFog) || 620;
    this.scene.fog.near = baseNear * (0.75 + (1 - p.night) * 0.25);
    this.scene.fog.far = baseFar * (1 - p.night * 0.42);

    if (this.sun) {
      this._sunColor.setHex(p.warm > 0.5 ? 0xffb27a : 0xffe6bd);
      this.sun.color.copy(this._sunColor);
      this.sun.intensity = p.sun * 1.72;
      var angle = ((this.clock.minutes / 1440) * Math.PI * 2) - Math.PI / 2;
      this.sun.position.set(Math.cos(angle) * 180, Math.max(28, Math.sin(angle) * 220 + 90), Math.sin(angle * 0.7) * 160);
      if (this.player || this.preview) {
        var tp = (this.player || this.preview).pos;
        this.sun.target.position.set(tp.x, 0, tp.z);
        this.sun.position.x += tp.x;
        this.sun.position.z += tp.z;
      }
    }
    if (this.hemi) {
      this.hemi.intensity = 0.38 + (1 - p.night) * 0.42;
      this.hemi.color.setHex(p.night > 0.5 ? 0x3f5a75 : 0x9fd7e8);
    }
    if (this.renderer) {
      var fog = this.scene.fog;
      this.renderer.setClearColor(this.scene.background, 1);
      if (fog && fog.far) this.renderer.toneMappingExposure = 0.9 + (1 - p.night) * 0.18;
    }
    if (this.world && this.world.setNight) {
      try { this.world.setNight(p.night); } catch (e) { /* world may not be ready */ }
    }
  };

  /* -------------------------------- loop -------------------------------- */

  Game.prototype._tick = function (ts) {
    this._raf = requestAnimationFrame(this._loop);
    if (this.shotName && (this.shotReady || this._shotFrozen)) {
      this.render();
      return;
    }
    if (!this.lastTime) this.lastTime = ts;
    var raw = (ts - this.lastTime) / 1000;
    this.lastTime = ts;
    if (!isFinite(raw) || raw < 0) raw = 0;
    var dt = Math.min(raw, 0.05);

    this._handleInput();
    this.update(dt);
    this.render();

    if (this.input) this.input.endFrame();

    this._perfAccum += raw;
    this._perfFrames++;
    if (this._perfAccum >= 0.5) {
      this.perf.fps = this._perfFrames / this._perfAccum;
      this.perf.ms = (this._perfAccum / this._perfFrames) * 1000;
      this._perfAccum = 0;
      this._perfFrames = 0;
      this._updateStats();
      this._adaptiveQuality(raw);
    }
  };

  Game.prototype.update = function (dt) {
    dt = clamp(dt || 0, 0, 0.05);
    if (this.shotName && this.shotReady) return;
    if (this.shotName && this._shotFrozen) return;
    this.time += dt;
    this.frame++;

    if (this.state === 'busted' || this.state === 'wasted') {
      if (!this._overlayUntil || this.time >= this._overlayUntil) this._endOverlay();
      if (this.cameraController && this.player) this.cameraController.update(dt, this.player, 'foot', null);
      if (this.hud && this.hud.update) this.hud.update(dt);
      return;
    }

    if (this.state === 'play') {
      this._advanceClock(dt);
      this._applySky();
      this._updatePickups(dt);
      this._updateRain(dt);
      this._updateCrewFallback(dt);
      this._autosaveAccum += dt;
      if (this._autosaveAccum >= 30) {
        this._autosaveAccum = 0;
        this.save(true);
      }
    }

    if (this.shots && this.shots.update) {
      try { this.shots.update(dt); } catch (e) { /* shot module guards itself */ }
    }

    var active = this.player || this.preview;
    if (this.state === 'title') {
      if (this.cameraController) {
        this._titleTarget.set(0, 0, 0);
        this.cameraController.update(dt, { pos: this._titleTarget, yaw: this.cameraController.yaw }, 'title', null);
      }
      this._applySky();
    } else if (this.state === 'play' || this.state === 'wheel') {
      if (this.cameraController) {
        var mode = active.vehicle ? 'vehicle' : 'foot';
        if (this.state === 'play' && this.input && this.input.aiming()) mode = 'aim';
        this.cameraController.update(dt, active, mode, this.state === 'play' ? this.input : null);
      }
    }

    if (this._vehiclePool) this._refreshVehiclePool();
    if (this.world && this.world.update && this.state === 'play') {
      try { this.world.update(dt, active.pos); } catch (e) { /* modular */ }
    }
    if (this.player && this.player.update && this.state === 'play') {
      try { this.player.update(dt, this.input, this.cameraController ? this.cameraController.yaw : 0); } catch (e) { /* modular */ }
      if (this.player.syncPreview) this.player.syncPreview();
      if (this.player.vehicle) this._lastVehicle = this.player.vehicle;
      if (this._updateInteractionPrompt) this._updateInteractionPrompt();
    }
    if (this.traffic && this.traffic.update && this.state === 'play') {
      try { this.traffic.update(dt, this.player || this.preview, this.police); } catch (e) { /* modular */ }
    }
    if (this.police && this.police.update && this.state === 'play') {
      try { this.police.update(dt, this.player || this.preview, this.traffic); } catch (e) { /* modular */ }
    }
    if (this.combat && this.combat.update && this.state === 'play') {
      try { this.combat.update(dt, this.input); } catch (e) { /* modular */ }
    }
    if (this.missions && this.missions.update && this.state === 'play') {
      try { this.missions.update(dt); } catch (e) { /* modular */ }
    }

    if (this.audio && this.audio.update) {
      var speed = active.vehicle ? Math.abs(active.vehicle.speed || 0) : 0;
      this.audio.update(dt, this.police ? this.police.wanted || 0 : 0, speed);
    }

    if (this.hud && this.hud.update) this.hud.update(dt);
  };

  Game.prototype.render = function () {
    if (!this.renderer || !this.scene || !this.camera) return;
    this.renderer.render(this.scene, this.camera);
    if (this.renderer.info && this.renderer.info.render) {
      this.perf.draws = this.renderer.info.render.calls;
      this.perf.tris = this.renderer.info.render.triangles;
    }
  };

  Game.prototype.resize = function () {
    var w = window.innerWidth || 1280;
    var h = window.innerHeight || 720;
    if (this.renderer) {
      this._applyPixelRatio();
      this.renderer.setSize(w, h, false);
    }
    if (this.camera) {
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
  };

  /* -------------------------------- stats -------------------------------- */

  Game.prototype._initStats = function () {
    var overlay = $('stats-overlay');
    var meter = $('fps-meter');
    if (this._statsVisible) {
      if (overlay) overlay.hidden = false;
      if (meter) meter.hidden = false;
    }
  };

  Game.prototype._updateStats = function () {
    var overlay = $('stats-overlay');
    if (!overlay || overlay.hidden) return;
    var text = $('stats-text');
    if (!text) return;
    text.textContent =
      'fps        ' + this.perf.fps.toFixed(1) + '\n' +
      'frame      ' + this.perf.ms.toFixed(2) + ' ms\n' +
      'draw calls ' + this.perf.draws + '\n' +
      'triangles  ' + formatMoney(this.perf.tris) + '\n' +
      'state      ' + this.state + '\n' +
      'clock      ' + this.getClockLabel() + ' · day ' + this.clock.day + ' · ' + this.clock.weather;
  };

  Game.prototype.destroy = function () {
    if (this._raf) cancelAnimationFrame(this._raf);
    if (this.input && this.input.destroy) this.input.destroy();
    if (this.hud && this.hud.destroy) this.hud.destroy();
    if (this.audio && this.audio.destroy) this.audio.destroy();
    if (this.renderer) this.renderer.dispose();
  };

  LH.Game = Game;
  LH.HudFallback = HudStub;
}());
