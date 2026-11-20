/* LEONIDA HEAT 3D — HUD presentation layer.
   Owns every DOM panel, the live minimap, the weapon wheel, menus and overlays.
   Classic script. Attaches LH.HUD. Everything degrades to a safe no-op when a
   subsystem (player, police, missions, combat) is missing. */
(function () {
  'use strict';

  window.LH = window.LH || {};

  var CFG = window.LH.CONFIG || {};
  var WCFG = CFG.WEAPONS || {};
  var HUDCFG = CFG.HUD || {};
  var CREW = CFG.CREW || {};
  var TAU = Math.PI * 2;

  var PLAYER_NAME = 'LEO CALDER';

  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  function pad(n) {
    return n < 10 ? '0' + n : String(n);
  }

  function formatMoney(n) {
    var s = String(Math.max(0, Math.round(n || 0)));
    return s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function formatTime(seconds) {
    var total = Math.max(0, Math.round(seconds || 0));
    return pad(Math.floor(total / 60)) + ':' + pad(total % 60);
  }

  function parseTime(label) {
    var m = String(label == null ? '' : label).match(/^(\d+):(\d+)$/);
    if (!m) return null;
    return Number(m[1]) * 60 + Number(m[2]);
  }

  function $(id) {
    return document.getElementById(id);
  }

  function setText(el, text) {
    if (!el) return;
    var value = text == null ? '' : String(text);
    if (el.textContent !== value) el.textContent = value;
  }

  function setWidth(el, pct) {
    if (!el) return;
    var value = clamp(pct, 0, 100).toFixed(1) + '%';
    if (el.style.width !== value) el.style.width = value;
  }

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

  function speakerColor(name) {
    var n = String(name || '').toUpperCase();
    if (n.indexOf('MAYA') >= 0) return '#f3c969';
    if (n.indexOf('DEZ') >= 0) return '#28e0d0';
    if (n.indexOf('ROOK') >= 0) return '#63e6a4';
    if (n.indexOf('MARISOL') >= 0) return '#ff2d95';
    if (n.indexOf('CROWE') >= 0) return '#ff4d55';
    if (n.indexOf('POLICE') >= 0 || n.indexOf('DISPATCH') >= 0) return '#5cb7ff';
    return '#ff6f61';
  }

  var HUD_IDS = [
    'hud', 'hud-vitals', 'hud-wanted', 'health-fill', 'armor-fill',
    'health-value', 'armor-value', 'money', 'money-delta', 'player-name',
    'player-district', 'district-chip', 'wanted-stars', 'clock', 'day-count',
    'weather', 'pursuit', 'mission-card', 'mission-giver', 'mission-timer',
    'mission-title', 'mission-objective', 'mission-progress-fill', 'dispatch-rows',
    'objective-arrow', 'minimap-wrap', 'minimap', 'minimap-district',
    'minimap-coords', 'mix-tape-count', 'weapon-panel', 'weapon-icon',
    'weapon-name', 'weapon-ammo', 'weapon-reserve', 'weapon-slot', 'crew-chips',
    'crew-maya', 'crew-dez', 'crew-rook', 'speedo', 'speed-value', 'speed-fill',
    'gear-value', 'crosshair', 'prompt', 'toast-feed', 'busted-meter',
    'busted-fill', 'busted-pct', 'busted-title', 'dialogue', 'dialogue-portrait',
    'dialogue-speaker', 'dialogue-text', 'mission-banner', 'banner-kicker',
    'banner-title', 'banner-sub', 'autosave', 'fps-meter', 'stats-overlay',
    'stats-text', 'title-screen', 'pause-screen', 'weapon-wheel', 'briefing',
    'result-screen', 'help-screen', 'credits-screen', 'wheel-mode',
    'wheel-title', 'wheel-money', 'wheel-ring', 'wheel-selected',
    'wheel-selected-ammo', 'wheel-damage-value', 'wheel-damage-fill',
    'wheel-hint', 'briefing-portrait', 'briefing-kicker', 'briefing-title',
    'briefing-giver', 'briefing-role', 'briefing-lines', 'briefing-objectives',
    'briefing-reward', 'briefing-time', 'briefing-heat', 'result-kicker',
    'result-title', 'result-rank', 'result-stats', 'result-message',
    'btn-result-retry', 'btn-result-continue', 'pause-sub', 'title-best',
    'btn-continue'
  ];

  /* ================================ HUD ================================ */

  function HUD(game) {
    this.game = game || {};
    this.screen = 'title';
    this.time = 0;

    this.el = {};
    for (var i = 0; i < HUD_IDS.length; i++) {
      this.el[HUD_IDS[i]] = $(HUD_IDS[i]);
    }
    this.screens = {
      title: this.el['title-screen'],
      pause: this.el['pause-screen'],
      wheel: this.el['weapon-wheel'],
      briefing: this.el.briefing,
      result: this.el['result-screen'],
      help: this.el['help-screen'],
      credits: this.el['credits-screen']
    };

    this.moneyShown = 0;
    this._moneyTarget = 0;
    this._moneyDelta = 0;
    this._moneyDeltaUntil = 0;
    this._moneyDirty = true;

    this._healthShown = 100;
    this._healthGhost = 100;
    this._healthGhostDelay = 0;
    this._armorShown = 0;
    this._armorGhost = 0;
    this._lastHealth = 100;
    this._lastArmor = 0;

    this._lastWanted = -1;
    this._wantedPulseUntil = 0;
    this._starDecayUntil = 0;
    this._lastPursuit = '';
    this._lastClock = '';
    this._lastDay = '';
    this._lastWeather = '';
    this._lastDistrict = '';

    this._mission = null;
    this._missionTitle = '';
    this._missionGiver = '';
    this._missionObjective = '';
    this._missionTimerLabel = '';
    this._missionRows = [];
    this._missionRowsSig = '';
    this._dispatchAccum = 0;
    this._dispatchAt = -10;
    this._freeRoamCard = false;

    this._lastWeapon = '';
    this._lastWeaponName = '';
    this._lastAmmo = '';
    this._lastReserve = '';
    this._lastCrewSig = '';
    this._lastSlot = -1;
    this._lastCrosshair = '';
    this._lastSpeed = '';
    this._lastGear = '';
    this._lastPrompt = '';
    this._lastFps = -1;
    this._lastMapDistrict = '';

    this._toastTimers = [];
    this._dialogueUntil = 0;
    this._bannerKind = '';
    this._bannerUntil = 0;
    this._hitMarkerUntil = 0;
    this._firingUntil = 0;
    this._muzzleUntil = 0;
    this._combatHooked = null;

    this._wheel = {
      open: false,
      mode: 'wheel',
      selected: 'pistol',
      slots: [],
      lastMoney: -1
    };

    this._mapCtx = null;
    this._mapBase = null;
    this._mapBaseW = 0;
    this._mapBaseH = 0;
    this._mapBasePPM = 2;
    this._mapBounds = { minX: -760, maxX: 520, minZ: -540, maxZ: 540 };
    this._mapSize = 220;
    this._mapPx = 440;
    this._mapAccum = 0;
    this._arrowAccum = 0;
    this._mapTime = 0;

    this._injectStyles();
    this._setupVitals();
    this._setupMinimap();
    this._setupWeapon();
    this._setupWheel();
    this._setupMisc();
    this._bindKeys();
    this._syncTitleSave();
    this.setScreen('title');
  }

  /* ----------------------------- static chrome ---------------------------- */

  HUD.prototype._injectStyles = function () {
    if ($('hud-stage7-style')) return;
    var style = document.createElement('style');
    style.id = 'hud-stage7-style';
    style.textContent = [
      /* smoother damage ghost layered under the real bar */
      '.bar-track{position:relative}',
      '.bar-ghost{position:absolute;left:0;top:0;bottom:0;width:100%;background:rgba(255,238,214,0.55);transition:width .38s ease .08s;pointer-events:none}',
      '.vital-row.armor-off{display:none}',
      '#money.pop{animation:money-pop .22s ease}',
      '@keyframes money-pop{50%{transform:scale(1.05);filter:brightness(1.3)}}',
      /* clock weather icon, CSS only */
      '#weather{gap:6px}',
      '.weather-icon{position:relative;display:inline-block;width:13px;height:13px;flex:0 0 13px}',
      '.weather-icon.clear{background:radial-gradient(circle,#ffd782 0 44%,transparent 46%)}',
      '.weather-icon.clear::before{content:"";position:absolute;inset:-2px;border-radius:50%;border:1px dotted rgba(255,215,130,.55)}',
      '.weather-icon.haze::before{content:"";position:absolute;left:0;right:0;top:2px;height:1px;background:#c9c0a9;box-shadow:0 4px 0 #c9c0a9,0 8px 0 #c9c0a9;opacity:.85}',
      '.weather-icon.rain::before{content:"";position:absolute;left:2px;right:2px;top:1px;height:5px;border-radius:4px;background:#9fc3d6}',
      '.weather-icon.rain::after{content:"";position:absolute;left:3px;top:7px;width:1px;height:5px;background:#5cb7ff;box-shadow:4px 0 0 #5cb7ff,8px 0 0 #5cb7ff;transform:skewX(-18deg)}',
      /* mission card keeps a tight footprint so the minimap never collides */
      '#mission-card{max-height:206px;overflow:hidden}',
      '#dispatch-table td{padding:3.5px 0}',
      '#dispatch-table tr.r-roadblock td{color:#f3c969}',
      '#dispatch-table tr.r-roadblock td:first-child{color:#ffb347}',
      '#dispatch-table tr.r-crew td{color:#63e6a4}',
      '#dispatch-table tr.r-police td{color:#8ecbff}',
      '#dispatch-table tr.r-police td:last-child{color:#5cb7ff}',
      '#dispatch-table tr.r-mission td{color:#dbe3e8}',
      /* objective arrow label */
      '#objective-arrow{width:52px;height:52px;margin:-26px 0 0 -26px}',
      '#objective-arrow span{font-size:30px;line-height:1}',
      '#objective-arrow em{position:absolute;left:50%;top:40px;transform:translateX(-50%);font-style:normal;font-size:9px;font-weight:800;letter-spacing:.1em;color:#f3c969;white-space:nowrap;text-shadow:0 1px 3px #000;background:rgba(7,12,18,.82);border:1px solid rgba(243,201,105,.4);padding:2px 5px}',
      '#objective-arrow.edge em{color:#ffb08a;border-color:rgba(255,111,97,.5)}',
      '.star.pulse{animation:star-pulse .45s ease 2}',
      '.star.decay{animation:star-decay .6s ease}',
      '@keyframes star-decay{50%{filter:grayscale(1) brightness(2.2);transform:scale(.82)}}',
      /* weapon slot pips */
      '#weapon-pips{display:flex;gap:3px;justify-content:flex-end;margin-left:auto;margin-right:8px}',
      '#weapon-pips i{width:16px;height:4px;background:rgba(255,255,255,.16)}',
      '#weapon-pips i.owned{background:#5cb7ff}',
      '#weapon-pips i.active{background:#ff6f61;box-shadow:0 0 7px rgba(255,111,97,.9)}',
      '#weapon-panel.reloading #weapon-ammo{color:#f3c969}',
      '#weapon-panel .weapon-head{gap:4px}',
      /* wheel cards: radial layout with description and damage */
      '#weapon-wheel{transition-duration:.18s}',
      '.wheel-ring::before{content:"";position:absolute;left:50%;top:50%;width:360px;height:360px;margin:-180px 0 0 -180px;border:1px dashed rgba(255,255,255,.1);border-radius:50%;pointer-events:none}',
      '.wheel-slot{width:188px;padding:8px 10px 9px;grid-template-areas:"key check" "name name" "ammo price" "desc desc" "dmg dmg";grid-template-columns:1fr auto;row-gap:2px}',
      '.slot-desc{grid-area:desc;font-size:7px;font-weight:600;letter-spacing:.04em;line-height:1.25;color:#9fb0ba;text-transform:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.slot-dmg{grid-area:dmg;height:3px;margin-top:2px;background:rgba(255,255,255,.1)}',
      '.slot-dmg i{display:block;height:100%;width:20%;background:linear-gradient(90deg,#28e0d0,#f3c969,#ff6f61)}',
      '.slot-check{grid-area:check;justify-self:end;font-size:10px;font-weight:900;color:#63e6a4;line-height:1;opacity:0}',
      '.wheel-slot.owned .slot-check{opacity:1}',
      '.wheel-slot.active .slot-check{color:#f3c969}',
      '#wheel-action{display:block;margin-top:3px;font-size:9px;font-weight:800;letter-spacing:.12em;color:#f3c969;font-variant-numeric:tabular-nums}',
      '#wheel-action.buy{color:#ff6f61}',
      '#weapon-wheel.shop #wheel-title{color:#f3c969}',
      '#weapon-wheel.shop .wheel-center{border-color:rgba(243,201,105,.6)}',
      /* clear feedback marks */
      '#hitmarker{position:absolute;left:50%;top:50%;width:26px;height:26px;margin:-13px 0 0 -13px;opacity:0;pointer-events:none;transition:opacity .08s}',
      '#hitmarker.show{opacity:1}',
      '#hitmarker i{position:absolute;width:9px;height:2px;background:#fff;box-shadow:0 0 4px #000}',
      '#hitmarker i:nth-child(1){left:2px;top:4px;transform:rotate(45deg)}',
      '#hitmarker i:nth-child(2){right:2px;top:4px;transform:rotate(-45deg)}',
      '#hitmarker i:nth-child(3){left:2px;bottom:4px;transform:rotate(-45deg)}',
      '#hitmarker i:nth-child(4){right:2px;bottom:4px;transform:rotate(45deg)}',
      '#crosshair.firing{transform:scale(1.42);opacity:1}',
      '#crosshair.aiming{transform:scale(.8)}',
      '#crosshair.aiming.firing{transform:scale(1.08)}',
      /* screens settle fast; reduced motion still wins below */
      '.screen{transition-duration:.18s}',
      /* save chip */
      '#autosave{column-gap:7px}',
      '#autosave.saving{color:#f3c969;border-color:rgba(243,201,105,.4)}',
      '#autosave .save-dot{flex:0 0 5px}',
      '.save-spin{width:9px;height:9px;border:1px solid rgba(243,201,105,.35);border-top-color:#f3c969;border-radius:50%;animation:save-spin .7s linear infinite}',
      '@keyframes save-spin{to{transform:rotate(360deg)}}',
      /* title control hint and a couple of title refinements */
      '.title-controls{margin-top:14px;font-size:7.5px;font-weight:700;letter-spacing:.13em;color:rgba(145,161,173,.85);border-top:1px solid rgba(255,255,255,.08);padding-top:9px}',
      '.title-controls b{color:#28e0d0;font-weight:800}',
      /* banner overlays for busted / wasted */
      '#mission-banner.busted{background:radial-gradient(ellipse at 50% 0%,rgba(255,77,85,.28),transparent 66%),linear-gradient(160deg,rgba(24,6,9,.96),rgba(10,4,7,.86))}',
      '#mission-banner.busted #banner-kicker{color:#ff4d55}',
      '#mission-banner.wasted #banner-kicker{color:#ff4d55}',
      '#mission-banner.wasted #banner-title{color:#ffb08a}',
      /* maps pop; this panel is the anchor of the screenshot */
      '.map-frame{box-shadow:inset 0 0 0 1px rgba(0,0,0,.7),0 0 26px rgba(0,0,0,.35)}',
      '.map-head #minimap-district{color:#f7ecd6;letter-spacing:.14em}',
      /* red timer must read at a glance */
      '#mission-timer.urgent{color:#ff4d55;text-shadow:0 0 10px rgba(255,77,85,.5)}',
      '@media (max-height:760px){',
      '.wheel-wrap{padding:14px 24px 12px}',
      '#wheel-ring{height:404px}',
      '#wheel-slot-pistol,#wheel-slot-rifle{top:103px}',
      '#wheel-slot-smg{bottom:18px}',
      '.wheel-center{width:186px;height:186px}',
      '#wheel-slot .slot-desc{font-size:6.5px}',
      '.title-controls{margin-top:10px;padding-top:7px}',
      '}',
      '@media (prefers-reduced-motion:reduce){',
      '.bar-ghost,.screen,#crosshair{transition-duration:.001ms!important}',
      '}'
    ].join('\n');
    document.head.appendChild(style);
  };

  HUD.prototype._setupVitals = function () {
    var healthFill = this.el['health-fill'];
    var armorFill = this.el['armor-fill'];
    this.healthRow = healthFill && healthFill.parentNode ? healthFill.parentNode.parentNode : null;
    this.armorRow = armorFill && armorFill.parentNode ? armorFill.parentNode.parentNode : null;

    if (healthFill && healthFill.parentNode) {
      var ghost = document.createElement('div');
      ghost.className = 'bar-ghost';
      ghost.id = 'health-ghost';
      healthFill.parentNode.insertBefore(ghost, healthFill);
      this.healthGhost = ghost;
    }
    if (armorFill && armorFill.parentNode) {
      var armorGhost = document.createElement('div');
      armorGhost.className = 'bar-ghost';
      armorGhost.id = 'armor-ghost';
      armorFill.parentNode.insertBefore(armorGhost, armorFill);
      this.armorGhost = armorGhost;
    }
  };

  HUD.prototype._setupMinimap = function () {
    var canvas = this.el.minimap;
    if (!canvas || !canvas.getContext) return;
    canvas.width = this._mapPx;
    canvas.height = this._mapPx;
    this._mapCtx = canvas.getContext('2d');
    if (this._mapCtx && this._mapCtx.imageSmoothingEnabled !== undefined) {
      this._mapCtx.imageSmoothingEnabled = true;
    }
  };

  HUD.prototype._setupWeapon = function () {
    var head = this.el['weapon-panel'] && this.el['weapon-panel'].querySelector('.weapon-head');
    if (head && !$('weapon-pips')) {
      var pips = document.createElement('div');
      pips.id = 'weapon-pips';
      for (var i = 0; i < 5; i++) {
        var pip = document.createElement('i');
        pip.setAttribute('data-slot', String(i + 1));
        pips.appendChild(pip);
      }
      head.appendChild(pips);
    }
    this._drawWeaponIcon('pistol');
  };

  HUD.prototype._setupWheel = function () {
    var wheel = this.el['weapon-wheel'];
    if (!wheel) return;
    var self = this;
    var slots = wheel.querySelectorAll('.wheel-slot');
    for (var i = 0; i < slots.length; i++) {
      var slot = slots[i];
      var id = slot.getAttribute('data-weapon');
      if (!id) continue;
      this._wheel.slots.push(id);

      var def = WCFG[id] || {};
      if (!slot.querySelector('.slot-check')) {
        var check = document.createElement('span');
        check.className = 'slot-check';
        check.textContent = '✓';
        slot.appendChild(check);
      }
      if (!slot.querySelector('.slot-desc')) {
        var desc = document.createElement('span');
        desc.className = 'slot-desc';
        desc.textContent = def.description || '';
        slot.appendChild(desc);
      }
      if (!slot.querySelector('.slot-dmg')) {
        var dmg = document.createElement('div');
        dmg.className = 'slot-dmg';
        dmg.innerHTML = '<i></i>';
        slot.appendChild(dmg);
      }

      slot.addEventListener('mouseenter', function (ev) {
        var el = ev.currentTarget;
        self.wheelSelect(el.getAttribute('data-weapon'));
      });
      slot.addEventListener('click', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        self.wheelClick(ev.currentTarget.getAttribute('data-weapon'));
      });
    }

    var tbody = this.el['dispatch-rows'];
    if (tbody && window.MutationObserver && !this._dispatchObserver) {
      this._dispatchObserver = new MutationObserver(function () { self._decorateRows(); });
      this._dispatchObserver.observe(tbody, { childList: true });
    }

    var center = wheel.querySelector('.wheel-center');
    if (center && !$('wheel-action')) {
      var action = document.createElement('span');
      action.id = 'wheel-action';
      action.textContent = 'ENTER BUY';
      center.appendChild(action);
    }

    wheel.addEventListener('click', function (ev) {
      if (ev.target === wheel) {
        if (self.game && self.game.closeWheel) self.game.closeWheel();
        else self.closeWheel();
      }
    });
  };

  HUD.prototype._setupMisc = function () {
    var hud = this.el.hud;
    if (hud && !$('hitmarker')) {
      var mark = document.createElement('div');
      mark.id = 'hitmarker';
      mark.setAttribute('aria-hidden', 'true');
      mark.innerHTML = '<i></i><i></i><i></i><i></i>';
      hud.appendChild(mark);
    }

    var arrow = this.el['objective-arrow'];
    if (arrow && !arrow.querySelector('em')) {
      var dist = document.createElement('em');
      dist.id = 'objective-dist';
      arrow.appendChild(dist);
    }

    var title = this.el['title-screen'];
    if (title && !$('title-controls')) {
      var brand = title.querySelector('.title-brand');
      if (brand) {
        var controls = document.createElement('div');
        controls.id = 'title-controls';
        controls.className = 'title-controls';
        controls.innerHTML = '<b>WASD</b> MOVE · <b>MOUSE</b> LOOK / AIM · <b>E</b> ENTER · <b>Q</b> WEAPONS · <b>ESC</b> PAUSE';
        brand.appendChild(controls);
      }
    }

    var weather = this.el.weather;
    if (weather) {
      weather.innerHTML = '<i class="weather-icon haze" id="weather-icon"></i><span id="weather-label">HAZE</span>';
      this.el['weather-icon'] = $('weather-icon');
      this.el['weather-label'] = $('weather-label');
    }
  };

  HUD.prototype._bindKeys = function () {
    var self = this;
    this._onKey = function (ev) {
      var code = ev.code || '';
      if (self.screen === 'result' && (code === 'Enter' || code === 'NumpadEnter' || code === 'Space')) {
        var contBtn = self.el['btn-result-continue'];
        var retryBtn = self.el['btn-result-retry'];
        var primary = contBtn && !contBtn.hidden ? contBtn : retryBtn;
        if (primary && !primary.hidden) {
          ev.preventDefault();
          primary.click();
        }
        return;
      }
      if (self.screen === 'pause' && (code === 'Enter' || code === 'NumpadEnter')) {
        ev.preventDefault();
        var resume = $('btn-resume');
        if (resume) resume.click();
        return;
      }
      if ((self.screen === 'help' || self.screen === 'credits') && (code === 'Enter' || code === 'NumpadEnter')) {
        ev.preventDefault();
        var close = self.screen === 'help' ? $('btn-help-close') : $('btn-credits-close');
        if (close) close.click();
        return;
      }
      if (self.screen !== 'wheel' || !self._wheel.open) return;
      /* Escape, Q and Tab belong to the game shell so a single press cannot
         both close the wheel and open the pause menu. */
      if (code === 'Enter' || code === 'NumpadEnter') {
        ev.preventDefault();
        self.wheelConfirm();
        return;
      }
      if (/^(Digit|Numpad)[1-5]$/.test(code)) {
        ev.preventDefault();
        var slot = Number(code.slice(-1));
        var id = self._slotWeapon(slot);
        if (id) {
          self.wheelSelect(id);
          if (self._owns(id) && self.game.combat && self.game.combat.setWeapon) {
            self.game.combat.setWeapon(id);
          }
        }
      }
    };
    window.addEventListener('keydown', this._onKey, false);
  };

  HUD.prototype._slotWeapon = function (slot) {
    var ids = this._wheel.slots;
    for (var i = 0; i < ids.length; i++) {
      if ((WCFG[ids[i]] && WCFG[ids[i]].slot) === slot) return ids[i];
    }
    return ids[slot - 1] || null;
  };

  HUD.prototype._owns = function (id) {
    var p = this._player();
    if (!p || !p.weapons) return false;
    if (id === 'fists') return true;
    return !!(p.weapons[id] && p.weapons[id].owned);
  };

  /* ------------------------------- lifecycle ------------------------------ */

  HUD.prototype.setScreen = function (name) {
    name = name || 'hud';
    if (name === 'hud' && this._wheel.open) this.closeWheel();
    this.screen = name;
    for (var key in this.screens) {
      if (!Object.prototype.hasOwnProperty.call(this.screens, key)) continue;
      var s = this.screens[key];
      if (!s) continue;
      var open = key === name;
      if (s.classList.contains('is-open') !== open) s.classList.toggle('is-open', open);
      var aria = open ? 'false' : 'true';
      if (s.getAttribute('aria-hidden') !== aria) s.setAttribute('aria-hidden', aria);
    }
    var body = document.body;
    if (body) body.classList.toggle('is-title', name === 'title');
    if (name !== 'hud' && this._bannerKind && this._bannerKind !== 'overlay') {
      this._hideBanner();
    }
    if (name === 'pause') this._syncPause();
    if (name === 'title') this._syncTitleSave();
    if (name === 'result') {
      /* result screen replaces the in-world card focus */
      var card = this.el['mission-card'];
      if (card) card.hidden = true;
    }
  };

  HUD.prototype._syncPause = function () {
    var g = this.game || {};
    var sub = this.el['pause-sub'];
    if (sub) {
      var clock = g.clock || {};
      sub.textContent = 'COSTA SOL · ' + this._clockLabel() + ' · ' + String(clock.weather || 'clear').toUpperCase();
    }
  };

  HUD.prototype._syncTitleSave = function () {
    var has = false;
    try {
      has = !!window.localStorage.getItem((CFG.SAVE_KEY) || 'leonida-heat-3d.save.v6');
    } catch (e) {
      has = false;
    }
    var cont = this.el['btn-continue'];
    if (cont) cont.disabled = !has;
    var best = this.el['title-best'];
    if (best) best.textContent = has ? 'SAVE DATA FOUND · CONTINUE AVAILABLE' : 'NO SAVE DATA';
    var day = this.el['day-count'];
    if (day) day.textContent = pad((this.game.clock && this.game.clock.day) || 1);
  };

  /* ------------------------------- helpers -------------------------------- */

  HUD.prototype._player = function () {
    return this.game.player || this.game.preview || null;
  };

  HUD.prototype._police = function () {
    return this.game.police || null;
  };

  HUD.prototype._missions = function () {
    return this.game.missions || null;
  };

  HUD.prototype._clockLabel = function () {
    var g = this.game;
    if (g && g.getClockLabel) return g.getClockLabel();
    var c = (g && g.clock) || {};
    var total = ((c.minutes || 1080) % 1440 + 1440) % 1440;
    return pad(Math.floor(total / 60)) + ':' + pad(Math.floor(total % 60));
  };

  HUD.prototype._hookCombat = function () {
    var combat = this.game.combat;
    if (!combat || this._combatHooked === combat) return;
    this._combatHooked = combat;
    var self = this;

    function healthOf() {
      var total = 0;
      var list = combat.enemies || [];
      for (var i = 0; i < list.length; i++) {
        if (list[i] && list[i].alive) total += list[i].health || 0;
      }
      return total;
    }

    if (typeof combat.fire === 'function') {
      var fire = combat.fire;
      combat.fire = function () {
        var before = healthOf();
        var result = fire.apply(this, arguments);
        if (result) {
          self._firingUntil = self.time + 0.16;
          self._muzzleUntil = self.time + 0.09;
          if (healthOf() < before) self._hitMarkerUntil = self.time + 0.24;
        }
        return result;
      };
    }
    if (typeof combat.melee === 'function') {
      var melee = combat.melee;
      combat.melee = function () {
        var before = healthOf();
        var result = melee.apply(this, arguments);
        if (result && result.hit) {
          self._firingUntil = self.time + 0.16;
          self._hitMarkerUntil = self.time + 0.24;
        }
        return result;
      };
    }
  };

  /* =============================== UPDATE =============================== */

  HUD.prototype.update = function (dt) {
    dt = clamp(dt || 0, 0, 0.1);
    this.time += dt;
    this._hookCombat();

    var g = this.game;
    var p = this._player();
    if (!p) return;

    this._updateVitals(dt, p);
    this._updateMoney(dt, p);
    this._updateWanted(dt, p);
    this._updateClockWeather();
    this._updateLocation(p);
    this._updateCrosshair(p);
    this._updateWeapon(p);
    this._updateCrew();
    this._updateSpeedo(p);
    this._updateMission(dt);
    this._updateBusted(dt);
    this._updateFeedback();

    this._arrowAccum += dt;
    if (this._arrowAccum >= 0.1) {
      this._arrowAccum = 0;
      this._updateObjectiveArrow(p);
    }

    this._mapAccum += dt;
    if (this._mapAccum >= 0.05) {
      this._mapAccum = 0;
      this.renderMinimap(g.world, p, g.police, g.missions);
    }

    this._updateFps();
    if (this._dialogueUntil && this.time > this._dialogueUntil) {
      this._dialogueUntil = 0;
      this.hideDialogue();
    }
    if (this._bannerUntil && this.time > this._bannerUntil) {
      this._bannerUntil = 0;
      this._hideBanner();
    }
  };

  HUD.prototype._updateVitals = function (dt, p) {
    var maxHealth = p.maxHealth || (CFG.PLAYER && CFG.PLAYER.maxHealth) || 100;
    var maxArmor = p.maxArmor || (CFG.PLAYER && CFG.PLAYER.maxArmor) || 100;
    var health = clamp(p.health == null ? maxHealth : p.health, 0, maxHealth);
    var armor = clamp(p.armor || 0, 0, maxArmor);
    var hPct = health / Math.max(1, maxHealth) * 100;
    var aPct = armor / Math.max(1, maxArmor) * 100;

    this._lastHealth = health;
    this._lastArmor = armor;

    /* health number and bar snap; the ghost drains behind it */
    if (this.el['health-fill']) {
      setWidth(this.el['health-fill'], hPct);
      this.el['health-fill'].classList.toggle('low', hPct <= 25);
    }
    setText(this.el['health-value'], Math.round(health));

    if (hPct < this._healthGhost) {
      if (this._healthGhostDelay > 0) this._healthGhostDelay -= dt;
      else this._healthGhost = Math.max(hPct, this._healthGhost - dt * 34);
    } else {
      this._healthGhost = hPct;
      this._healthGhostDelay = 0.32;
    }
    setWidth(this.healthGhost, this._healthGhost);

    var showArmor = armor > 0.4 || this._armorGhost > 0.6;
    if (this.armorRow) this.armorRow.classList.toggle('armor-off', !showArmor);
    if (this.el['armor-fill']) setWidth(this.el['armor-fill'], aPct);
    setText(this.el['armor-value'], Math.round(armor));
    if (aPct < this._armorGhost) this._armorGhost = Math.max(aPct, this._armorGhost - dt * 42);
    else this._armorGhost = aPct;
    setWidth(this.armorGhost, this._armorGhost);

    var name = this.el['player-name'];
    if (name && name.textContent !== PLAYER_NAME) name.textContent = PLAYER_NAME;
  };

  HUD.prototype._updateMoney = function (dt, p) {
    var target = Math.max(0, p.money || 0);
    if (this._moneyTarget !== target) {
      var diff = target - this._moneyTarget;
      if (this._moneyTarget !== 0 && diff !== 0) {
        this._moneyDelta = diff;
        this._moneyDeltaUntil = this.time + 1.6;
        var delta = this.el['money-delta'];
        if (delta) {
          delta.textContent = (diff > 0 ? '+$' : '-$') + formatMoney(Math.abs(diff));
          delta.classList.toggle('negative', diff < 0);
          delta.classList.add('show');
        }
        var moneyEl = this.el.money;
        if (moneyEl) {
          moneyEl.classList.remove('pop');
          void moneyEl.offsetWidth;
          moneyEl.classList.add('pop');
        }
      }
      this._moneyTarget = target;
    }

    if (Math.abs(target - this.moneyShown) < 1) {
      this.moneyShown = target;
    } else {
      var speed = Math.max(11, (HUDCFG.moneyCountSpeed) || 12);
      this.moneyShown += (target - this.moneyShown) * Math.min(1, dt * speed);
    }
    var shown = Math.round(this.moneyShown);
    if (this._moneyDirty || shown !== this._lastMoneyShown) {
      this._moneyDirty = false;
      this._lastMoneyShown = shown;
      setText(this.el.money, formatMoney(shown));
    }

    var deltaEl = this.el['money-delta'];
    if (deltaEl && this._moneyDeltaUntil && this.time > this._moneyDeltaUntil) {
      this._moneyDeltaUntil = 0;
      deltaEl.classList.remove('show');
    }
  };

  HUD.prototype._updateWanted = function (dt, p) {
    var police = this._police();
    var wanted = Math.round(police && police.wanted != null ? police.wanted : (p.wanted || 0));
    wanted = clamp(wanted, 0, 5);

    if (wanted !== this._lastWanted) {
      if (this._lastWanted >= 0) {
        if (wanted > this._lastWanted) this._wantedPulseUntil = this.time + 0.7;
        else if (wanted < this._lastWanted) this._starDecayUntil = this.time + 0.7;
      }
      this._lastWanted = wanted;
      var stars = this.el['wanted-stars'] ? this.el['wanted-stars'].querySelectorAll('.star') : [];
      for (var i = 0; i < stars.length; i++) {
        var lit = i < wanted;
        stars[i].classList.toggle('lit', lit);
        stars[i].classList.toggle('hot', lit && wanted >= 3);
      }
      var strip = document.querySelectorAll('#heat-strip span');
      for (var j = 0; j < strip.length; j++) strip[j].classList.toggle('on', j < wanted);
    }

    var pulse = this.time < this._wantedPulseUntil;
    var decay = this.time < this._starDecayUntil;
    var starsAll = this.el['wanted-stars'] ? this.el['wanted-stars'].querySelectorAll('.star') : [];
    for (var k = 0; k < starsAll.length; k++) {
      starsAll[k].classList.toggle('pulse', pulse);
      starsAll[k].classList.toggle('decay', decay);
    }

    var pursuit = this.el.pursuit;
    if (pursuit) {
      var label;
      var roadblock = police && police.roadblock && police.roadblock.active;
      if (wanted <= 0) label = 'NO UNITS';
      else if (roadblock) label = 'ROADBLOCK SET';
      else if (wanted >= 4) label = wanted + ' UNITS PURSUING · CRITICAL';
      else if (wanted === 1) label = '1 UNIT PURSUING';
      else label = wanted + ' UNITS PURSUING';
      if (label !== this._lastPursuit) {
        this._lastPursuit = label;
        var dot = '<span class="pursuit-dot"></span>';
        pursuit.innerHTML = dot + label;
      }
      pursuit.classList.toggle('hot', wanted >= 2 && wanted < 4);
      pursuit.classList.toggle('critical', wanted >= 4 || !!roadblock);
    }
  };

  HUD.prototype._updateClockWeather = function () {
    var g = this.game;
    var clock = g.clock || {};
    var label = this._clockLabel();
    if (label !== this._lastClock) {
      this._lastClock = label;
      setText(this.el.clock, label);
    }
    var day = pad(clock.day || 1);
    if (day !== this._lastDay) {
      this._lastDay = day;
      setText(this.el['day-count'], day);
    }
    var weather = String(clock.weather || 'clear').toLowerCase();
    if (weather !== this._lastWeather) {
      this._lastWeather = weather;
      setText(this.el['weather-label'], weather === 'rain' ? 'RAIN' : weather === 'haze' ? 'HAZE' : 'CLEAR');
      var icon = this.el['weather-icon'];
      if (icon) icon.className = 'weather-icon ' + (weather === 'rain' ? 'rain' : weather === 'haze' ? 'haze' : 'clear');
    }
  };

  HUD.prototype._updateLocation = function (p) {
    var g = this.game;
    var district = 'COSTA SOL';
    if (g.world && g.world.districtAt) {
      try { district = String(g.world.districtAt(p.pos.x, p.pos.z) || 'COSTA SOL').toUpperCase(); }
      catch (e) { district = 'COSTA SOL'; }
    }
    if (district !== this._lastDistrict) {
      this._lastDistrict = district;
      setText(this.el['minimap-district'], district);
      setText(this.el['player-district'], district + ' · COSTA SOL');
      setText(this.el['district-chip'], district);
    }
    var coords = this.el['minimap-coords'];
    if (coords) {
      var text = 'X ' + Math.round(p.pos.x) + ' · Z ' + Math.round(p.pos.z);
      if (coords.textContent !== text) coords.textContent = text;
    }
    var tapes = this.el['mix-tape-count'];
    if (tapes) {
      var owned = (g.collectibles && g.collectibles.length) || 0;
      setText(tapes, 'MIX TAPES ' + owned + '/10');
    }
  };

  HUD.prototype._updateCrosshair = function (p) {
    var cross = this.el.crosshair;
    if (!cross) return;
    var input = this.game.input;
    var aiming = !!(input && input.aiming && input.aiming());
    var firing = !!(input && input.mouse && input.mouse.down) || this.time < this._firingUntil;
    var state = (aiming ? 'a' : '') + (firing ? 'f' : '');
    if (state !== this._lastCrosshair) {
      this._lastCrosshair = state;
      cross.classList.toggle('aiming', aiming);
      cross.classList.toggle('firing', firing);
    }

    var mark = $('hitmarker');
    if (mark) mark.classList.toggle('show', this.time < this._hitMarkerUntil);
  };

  HUD.prototype._updateWeapon = function (p) {
    var panel = this.el['weapon-panel'];
    if (!panel) return;
    var id = p.currentWeapon || 'pistol';
    var def = WCFG[id] || {};
    var state = (p.weapons && p.weapons[id]) || { owned: id === 'fists', ammo: 0, reserve: 0 };
    var melee = def.kind === 'melee';

    if (id !== this._lastWeapon) {
      this._lastWeapon = id;
      this._drawWeaponIcon(id);
    }

    var name = def.name || String(id).toUpperCase();
    if (name !== this._lastWeaponName) {
      this._lastWeaponName = name;
      setText(this.el['weapon-name'], name);
    }

    var ammo = melee ? '∞' : String(state.ammo || 0);
    var reserve = melee ? 'MELEE' : String(state.reserve || 0);
    if (ammo !== this._lastAmmo) {
      this._lastAmmo = ammo;
      setText(this.el['weapon-ammo'], ammo);
    }
    if (reserve !== this._lastReserve) {
      this._lastReserve = reserve;
      setText(this.el['weapon-reserve'], reserve);
    }

    var empty = !melee && (state.ammo || 0) <= 0;
    panel.classList.toggle('empty', empty);
    panel.classList.toggle('reloading', !!(this.game.combat && this.game.combat.reloadTimer > 0));

    var slot = def.slot || 1;
    setText(this.el['weapon-slot'], slot + ' / 5');

    var pips = this.el['weapon-pips'] ? this.el['weapon-pips'].children : [];
    for (var i = 0; i < pips.length; i++) {
      var wid = this._slotWeapon(i + 1);
      var owned = wid ? this._owns(wid) : false;
      pips[i].classList.toggle('owned', owned);
      pips[i].classList.toggle('active', wid === id);
    }

    var mix = this.game.combat ? this.game.combat.reloadTimer : 0;
    if (mix > 0) panel.classList.add('reloading');
    else panel.classList.remove('reloading');
  };

  HUD.prototype._updateCrew = function () {
    var g = this.game;
    var abilities = (g.missions && (g.missions.abilities || g.missions.crew)) || g.crewAbilities || g.crew || null;
    var sig = '';
    var ids = ['maya', 'dez', 'rook'];
    for (var i = 0; i < ids.length; i++) {
      var id = ids[i];
      var a = abilities && abilities[id];
      var remaining = 0;
      var ready = true;
      if (typeof a === 'number') {
        remaining = Math.max(0, a);
        ready = remaining <= 0;
      } else if (a && typeof a === 'object') {
        remaining = Math.max(0, a.remaining || 0);
        ready = a.ready != null ? !!a.ready : remaining <= 0;
      }
      sig += id + ':' + Math.ceil(remaining) + ':' + (ready ? 1 : 0) + ';';
      var chip = this.el['crew-' + id];
      if (!chip) continue;
      var state = chip.querySelector('.crew-state');
      if (state) setText(state, ready ? 'READY' : Math.ceil(remaining) + 'S');
      chip.classList.toggle('ready', ready);
      chip.classList.toggle('cooling', !ready);
      var cool = $('crew-' + id + '-cool');
      if (cool) {
        var total = (CREW[id] && CREW[id].cooldown) || 40;
        setWidth(cool, ready ? 0 : remaining / total * 100);
      }
    }
    if (sig !== this._lastCrewSig) this._lastCrewSig = sig;
  };

  HUD.prototype._updateSpeedo = function (p) {
    var vehicle = p.vehicle || null;
    var speedo = this.el.speedo;
    if (!speedo) return;
    var on = !!vehicle;
    if (speedo.hidden === on) speedo.hidden = !on;
    if (!vehicle) return;
    var kmh = Math.round(Math.abs(vehicle.speed || 0) * 3.6);
    var label = ('00' + kmh).slice(-3);
    if (label !== this._lastSpeed) {
      this._lastSpeed = label;
      setText(this.el['speed-value'], label);
      setWidth(this.el['speed-fill'], kmh / 210 * 100);
    }
    var gear = kmh < 1 ? 'P' : kmh < 28 ? '1' : kmh < 55 ? '2' : kmh < 85 ? '3' : kmh < 120 ? '4' : kmh < 160 ? '5' : '6';
    if (gear !== this._lastGear) {
      this._lastGear = gear;
      setText(this.el['gear-value'], gear);
    }
  };

  /* ------------------------------- mission -------------------------------- */

  HUD.prototype._updateMission = function (dt) {
    var g = this.game;
    var missions = g.missions;
    var police = g.police;

    this._dispatchAccum += dt;
    if (missions && missions.active) {
      if (this._freeRoamCard) {
        this._freeRoamCard = false;
        if (missions._hudSig === '') this._mission = null;
      }
      if (this._dispatchAccum >= 0.25) {
        this._dispatchAccum = 0;
        var rows = [];
        if (missions.dispatchRows) {
          try { rows = missions.dispatchRows() || []; } catch (e) { rows = []; }
        } else if (police && police.dispatchRows) {
          try { rows = police.dispatchRows(this._player(), missions) || []; } catch (e) { rows = []; }
        }
        this.setDispatch(rows);
      }
      return;
    }

    var wanted = Math.round((police && police.wanted) || (this._player() && this._player().wanted) || 0);
    if (wanted > 0) {
      this._freeRoamCard = true;
      if (this._dispatchAccum >= 0.25) {
        this._dispatchAccum = 0;
        var live = [];
        if (police && police.dispatchRows) {
          try { live = police.dispatchRows(this._player(), missions) || []; } catch (e) { live = []; }
        }
        this.setMission('CITY PURSUIT', 'Lose the units or reach a safehouse', '', live, {
          giver: 'COSTA SOL PD',
          progress: clamp(wanted / 5 * 100, 0, 100),
          freeRoam: true
        });
      }
      return;
    }

    if (this._freeRoamCard) {
      this._freeRoamCard = false;
      this.setMission(null);
    }
  };

  HUD.prototype.setMission = function (mission, objective, timer, rows, extra) {
    if (mission && typeof mission === 'object' && objective === undefined) {
      var payload = mission;
      extra = payload;
      mission = payload.title || (payload.mission && payload.mission.title) || '';
      objective = payload.objective || '';
      timer = payload.timer || (payload.timerSeconds != null ? formatTime(payload.timerSeconds) : '');
      rows = payload.rows || [];
    }

    var card = this.el['mission-card'];
    if (mission == null || mission === '') {
      this._mission = null;
      this._missionTitle = '';
      if (card) card.hidden = true;
      this._missionRows = [];
      this._missionRowsSig = '';
      return;
    }

    var title = typeof mission === 'string' ? mission : (mission.title || '');
    var m = (typeof mission === 'object') ? mission : null;
    this._mission = m;
    this._missionTitle = title;
    this._missionGiver = (extra && extra.giver) || (m && m.giver) || (this.game.missions && this.game.missions.active && this.game.missions.active.giver) || 'DISPATCH';
    this._missionObjective = objective || '';
    this._missionTimerLabel = typeof timer === 'number' ? formatTime(timer) : String(timer || '');

    if (card) card.hidden = false;
    setText(this.el['mission-title'], title);
    setText(this.el['mission-giver'], this._missionGiver);
    setText(this.el['mission-objective'], this._missionObjective);

    var label = this._missionTimerLabel;
    if (!label && this.game.missions && this.game.missions.timerTotal > 0) {
      label = formatTime(this.game.missions.timer);
    }
    setText(this.el['mission-timer'], label || '--:--');
    var seconds = parseTime(label);
    var urgent = seconds != null && seconds <= 15;
    if (this.el['mission-timer']) this.el['mission-timer'].classList.toggle('urgent', urgent);

    var progress = extra && extra.progress;
    if (progress == null) {
      if (this.game.missions && this.game.missions.active) {
        var active = this.game.missions.active;
        var steps = (active.steps && active.steps.length) || 1;
        progress = (this.game.missions.stepIndex || 0) / steps * 100;
      } else {
        progress = 0;
      }
    }
    setWidth(this.el['mission-progress-fill'], progress);

    if (rows) this.setDispatch(rows, true);
  };

  HUD.prototype.setDispatch = function (rows, force) {
    if (!rows || !rows.length) rows = [];
    var sig = '';
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i] || {};
      sig += (r.unit || '') + '|' + (r.distLabel || r.dist || '') + '|' + (r.status || '') + '|' + (r.kind || '') + ';';
    }
    this._decorateRows();
    var now = this.time;
    if (!force && sig === this._missionRowsSig && now - this._dispatchAt < 1.2) return;
    if (!force && now - this._dispatchAt < 0.24) return;
    this._dispatchAt = now;
    this._missionRows = rows;
    this._missionRowsSig = sig;

    var tbody = this.el['dispatch-rows'];
    if (!tbody) return;
    var limit = Math.min(rows.length, 4);
    while (tbody.children.length > limit) tbody.removeChild(tbody.lastChild);
    for (var j = 0; j < limit; j++) {
      var row = rows[j] || {};
      var tr = tbody.children[j];
      if (!tr) {
        tr = document.createElement('tr');
        tr.innerHTML = '<td></td><td></td><td></td>';
        tbody.appendChild(tr);
      }
      var unit = String(row.unit || 'UNIT').toUpperCase();
      var dist = row.distLabel || (row.dist == null ? '—' : row.dist + ' M');
      var status = String(row.status || '').toUpperCase();
      setText(tr.children[0], unit);
      setText(tr.children[1], dist);
      setText(tr.children[2], status);

      var kind = String(row.kind || '').toLowerCase();
      var crew = kind === 'crew' || (row.crew != null);
      var roadblock = kind === 'roadblock' || unit.indexOf('ROADBLOCK') >= 0 || status === 'SET';
      var police = kind === 'police' || unit.indexOf('SQUAD') >= 0 || unit.indexOf('CRUISER') >= 0;
      tr.className = crew ? 'r-crew' : roadblock ? 'r-roadblock' : police ? 'r-police' : 'r-mission';
      if (crew) tr.children[2].className = 'st-crew';
      else if (roadblock) tr.children[2].className = 'st-live';
      else tr.children[2].className = '';
    }
  };

  HUD.prototype._decorateRows = function () {
    var tbody = this.el['dispatch-rows'];
    if (!tbody) return;
    for (var i = 0; i < tbody.children.length; i++) {
      var tr = tbody.children[i];
      if (!tr || tr.children.length < 3) continue;
      var unit = String(tr.children[0].textContent || '').toUpperCase();
      var status = String(tr.children[2].textContent || '').toUpperCase();
      var crew = unit === 'MAYA' || unit === 'DEZ' || unit === 'ROOK' ||
        status === 'X' || status === 'C' || status === 'V';
      var roadblock = unit.indexOf('ROADBLOCK') >= 0 || status === 'SET';
      var police = unit.indexOf('SQUAD') >= 0 || unit.indexOf('CRUISER') >= 0 ||
        unit.indexOf('UNIT') >= 0 || unit.indexOf('HEAT') >= 0;
      tr.className = crew ? 'r-crew' : roadblock ? 'r-roadblock' : police ? 'r-police' : 'r-mission';
      if (crew) tr.children[2].className = 'st-crew';
      else if (roadblock) tr.children[2].className = 'st-live';
      else if (tr.children[2].className === 'st-crew' || tr.children[2].className === 'st-live') {
        tr.children[2].className = '';
      }
    }
  };

  HUD.prototype._updateObjectiveArrow = function (p) {
    var target = this._objectiveTarget();
    var arrow = this.el['objective-arrow'];
    if (!target || !arrow) {
      if (arrow) arrow.classList.remove('visible');
      return;
    }
    var dx = target.x - p.pos.x;
    var dz = target.z - p.pos.z;
    var dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < 12) {
      arrow.classList.remove('visible');
      return;
    }
    var targetAngle = Math.atan2(dx, dz);
    var camYaw = this.game.cameraController ? this.game.cameraController.yaw : (p.yaw || 0);
    var rel = targetAngle - camYaw;
    rel = ((rel + Math.PI) % TAU + TAU) % TAU - Math.PI;

    var x = Math.sin(rel);
    var y = -Math.cos(rel);
    var edge = Math.abs(rel) > 0.72;
    var cx = 50 + x * 41;
    var cy = 50 + y * 38;
    arrow.style.left = clamp(cx, 3, 97) + '%';
    arrow.style.top = clamp(cy, 10, 90) + '%';
    arrow.classList.add('visible');
    arrow.classList.toggle('edge', edge);
    var glyph = arrow.querySelector('span');
    if (glyph) glyph.style.transform = 'rotate(' + (rel * 180 / Math.PI) + 'deg)';
    setText(arrow.querySelector('em'), Math.round(dist) + ' M');
    this.setObjectiveArrow(target, dist, rel);
  };

  HUD.prototype.setObjectiveArrow = function (target, dist, rel) {
    var arrow = this.el['objective-arrow'];
    if (!arrow) return;
    if (!target) {
      arrow.classList.remove('visible');
      return;
    }
    arrow.classList.add('visible');
    if (dist != null) setText(arrow.querySelector('em'), Math.round(dist) + ' M');
    if (rel != null) {
      arrow.style.left = clamp(50 + Math.sin(rel) * 41, 3, 97) + '%';
      arrow.style.top = clamp(50 - Math.cos(rel) * 38, 10, 90) + '%';
    }
  };

  HUD.prototype._objectiveTarget = function () {
    var g = this.game;
    var missions = g.missions;
    if (missions) {
      if (missions.active && missions._step) {
        var step = missions._step();
        if (step && step.target) return { x: step.target.x, z: step.target.z, label: step.text };
      }
      if (missions.marker && missions.marker.visible) {
        return { x: missions.marker.position.x, z: missions.marker.position.z, label: 'MISSION' };
      }
      if (missions.list && missions.list.length) {
        var next = missions.list[missions.index];
        if (next && next.marker) return { x: next.marker.x, z: next.marker.z, label: next.title };
      }
    }
    var police = g.police;
    var wanted = (police && police.wanted) || (this._player() && this._player().wanted) || 0;
    if (wanted > 0 && g.world && g.world.missionPoints && g.world.missionPoints.safehouse) {
      var safe = g.world.missionPoints.safehouse;
      return { x: safe.x, z: safe.z, label: 'SAFEHOUSE' };
    }
    return null;
  };

  /* -------------------------------- feedback ------------------------------- */

  HUD.prototype._updateFeedback = function () {
    var mark = $('hitmarker');
    if (mark) mark.classList.toggle('show', this.time < this._hitMarkerUntil);
    if (this._bannerKind === 'overlay' && this._bannerUntil && this.time > this._bannerUntil) {
      this._bannerUntil = 0;
      this._hideBanner();
    }
  };

  HUD.prototype.setBustedMeter = function (value) {
    var v = clamp(value || 0, 0, 1);
    var meter = $('busted-meter');
    if (!meter) return;
    if (v <= 0.002) {
      meter.hidden = true;
      return;
    }
    meter.hidden = false;
    setWidth($('busted-fill'), v * 100);
    setText($('busted-pct'), Math.round(v * 100) + '%');
    setText($('busted-title'), 'BUSTED');
  };

  HUD.prototype._updateBusted = function (dt) {
    var police = this._police();
    if (!police) return;
    var v = police.bustedMeter || 0;
    if (v > 0.002) this.setBustedMeter(v);
    else {
      var meter = $('busted-meter');
      if (meter && !meter.hidden) meter.hidden = true;
    }
  };

  /* -------------------------------- messages ------------------------------- */

  HUD.prototype.toast = function (text, kind) {
    var feed = this.el['toast-feed'];
    if (!feed) return;
    kind = kind || 'info';
    if (kind === 'cash') kind = 'cash';
    var item = document.createElement('div');
    item.className = 'toast ' + kind;
    var icons = { cash: '$', danger: '!', crew: '+', mission: '★', info: 'i', heat: '!' };
    var icon = document.createElement('span');
    icon.className = 'toast-icon';
    icon.textContent = icons[kind] || 'i';
    var copy = document.createElement('span');
    copy.className = 'toast-text';
    copy.textContent = String(text || '').toUpperCase();
    item.appendChild(icon);
    item.appendChild(copy);
    feed.appendChild(item);
    while (feed.children.length > ((HUDCFG.maxToasts) || 4)) {
      feed.removeChild(feed.firstChild);
    }
    var life = ((HUDCFG.toastLife) || 3.6) * 1000;
    var close = function () {
      if (!item.parentNode) return;
      item.classList.add('out');
      setTimeout(function () {
        if (item.parentNode) item.parentNode.removeChild(item);
      }, 300);
    };
    var timer = setTimeout(close, life);
    this._toastTimers.push(timer);
    if (this._toastTimers.length > 20) this._toastTimers.shift();
  };

  HUD.prototype.setPrompt = function (text) {
    var el = this.el.prompt;
    if (!el) return;
    if (!text) {
      if (!el.hidden) el.hidden = true;
      this._lastPrompt = '';
      return;
    }
    var key = 'E';
    var label = String(text);
    var match = label.match(/^([A-Z0-9])\s*[—\-:]\s*(.+)$/);
    if (match) {
      key = match[1];
      label = match[2];
    }
    label = label.toUpperCase();
    var sig = key + '|' + label;
    if (sig === this._lastPrompt && !el.hidden) return;
    this._lastPrompt = sig;
    var b = el.querySelector('b');
    var span = el.querySelector('span');
    if (b) b.textContent = key;
    if (span) span.textContent = label;
    el.hidden = false;
  };

  HUD.prototype.dialogue = function (speaker, text) {
    var panel = this.el.dialogue;
    if (!panel) return;
    var name = String(speaker || 'DISPATCH').toUpperCase();
    setText(this.el['dialogue-speaker'], name);
    setText(this.el['dialogue-text'], text || '');
    var portrait = this.el['dialogue-portrait'];
    if (portrait) {
      var accent = speakerColor(name);
      portrait.style.borderColor = accent;
      portrait.style.background =
        'radial-gradient(circle at 50% 30%, ' + accent + '33 0 28%, transparent 30%),' +
        'radial-gradient(circle at 50% 100%, ' + accent + '55 0 46%, transparent 48%),' +
        'linear-gradient(160deg, #15333c, #1a1018)';
    }
    panel.hidden = false;
    this._dialogueUntil = this.time + 7;
  };

  HUD.prototype.hideDialogue = function () {
    var panel = this.el.dialogue;
    if (panel) panel.hidden = true;
    this._dialogueUntil = 0;
  };

  HUD.prototype._banner = function (kicker, title, sub, kind) {
    var banner = this.el['mission-banner'];
    if (!banner) return;
    setText(this.el['banner-kicker'], kicker);
    setText(this.el['banner-title'], title);
    setText(this.el['banner-sub'], sub);
    banner.hidden = false;
    banner.classList.toggle('fail', kind === 'fail' || kind === 'busted' || kind === 'wasted');
    banner.classList.toggle('busted', kind === 'busted');
    banner.classList.toggle('wasted', kind === 'wasted');
    this._bannerKind = kind || 'overlay';
  };

  HUD.prototype._hideBanner = function () {
    var banner = this.el['mission-banner'];
    if (banner) {
      banner.hidden = true;
      banner.classList.remove('busted', 'wasted', 'fail');
    }
    this._bannerKind = '';
  };

  HUD.prototype.showBusted = function (data) {
    data = data || {};
    this._banner('COSTA SOL PD', 'BUSTED', '$' + (data.fine || (CFG.PLAYER && CFG.PLAYER.bustedFine) || 250) + ' FINE · RELEASED AT THE PRECINCT', 'busted');
    this._bannerUntil = this.time + 3.2;
    this.screen = 'hud';
    if (this.game.input && this.game.input.exitLock) this.game.input.exitLock();
  };

  HUD.prototype.showWasted = function (data) {
    data = data || {};
    this._banner('COSTA SOL GENERAL', 'WASTED', '$' + (data.fee || (CFG.PLAYER && CFG.PLAYER.hospitalFee) || 150) + ' HOSPITAL FEE', 'wasted');
    this._bannerUntil = this.time + 3.2;
    this.screen = 'hud';
    if (this.game.input && this.game.input.exitLock) this.game.input.exitLock();
  };

  HUD.prototype.hideBusted = function () {
    this._hideBanner();
  };

  HUD.prototype.saveToast = function () {
    var el = this.el.autosave;
    if (!el) return;
    el.hidden = false;
    el.classList.add('saving');
    el.innerHTML = '<span class="save-spin"></span>SAVING';
    clearTimeout(this._saveTimer);
    var self = this;
    this._saveTimer = setTimeout(function () {
      if (!self.el.autosave) return;
      self.el.autosave.classList.remove('saving');
      self.el.autosave.innerHTML = '<span class="save-dot"></span>AUTOSAVED';
      self._saveTimer = setTimeout(function () {
        if (self.el.autosave) self.el.autosave.hidden = true;
      }, 1500);
    }, 650);
  };

  HUD.prototype.setClock = function (clock) {
    if (!clock) clock = this.game.clock || {};
    var label = this.game.getClockLabel ? this.game.getClockLabel() : this._clockLabel();
    setText(this.el.clock, label);
    setText(this.el['day-count'], pad(clock.day || 1));
    this._lastWeather = '';
  };

  HUD.prototype.setWanted = function (n) {
    var p = this._player();
    if (p) p.wanted = clamp(Math.round(n || 0), 0, 5);
    this._lastWanted = -1;
  };

  HUD.prototype.setSpeedo = function (vehicle) {
    var p = this._player();
    if (p) p.vehicle = vehicle == null ? null : vehicle;
  };

  HUD.prototype.setCrew = function (abilities) {
    if (!abilities) return;
    this._lastCrewSig = '';
  };

  HUD.prototype.autoSave = function () {
    this.saveToast();
  };

  /* -------------------------------- briefing ------------------------------- */

  HUD.prototype.showBriefing = function (mission) {
    if (!mission) return;
    setText(this.el['briefing-kicker'], 'MISSION ' + pad(mission.index || 1) + ' · ' + String(mission.district || 'COSTA SOL'));
    setText(this.el['briefing-title'], mission.title || '');
    setText(this.el['briefing-giver'], mission.giver || '');
    setText(this.el['briefing-role'], mission.role || 'CONTACT');
    setText(this.el['briefing-reward'], '$' + formatMoney(mission.reward || 0));
    setText(this.el['briefing-time'], mission.timer ? mission.timer + ' SEC' : 'NONE');
    setText(this.el['briefing-heat'], 'LEVEL ' + (mission.heatOnStart || 0));

    var lines = this.el['briefing-lines'];
    if (lines) {
      lines.innerHTML = '';
      var script = (mission.briefing || []).slice(0, 3);
      for (var i = 0; i < script.length; i++) {
        var p = document.createElement('p');
        p.textContent = script[i];
        lines.appendChild(p);
      }
    }

    var objs = this.el['briefing-objectives'];
    if (objs) {
      objs.innerHTML = '';
      var steps = (mission.steps || []).slice(0, 4);
      for (var s = 0; s < steps.length; s++) {
        var row = document.createElement('div');
        row.className = 'objective-line';
        var num = document.createElement('b');
        num.textContent = pad(s + 1);
        var copy = document.createElement('span');
        copy.textContent = steps[s].text;
        row.appendChild(num);
        row.appendChild(copy);
        objs.appendChild(row);
      }
    }

    this._drawPortrait(mission);
    this.setScreen('briefing');
  };

  HUD.prototype._drawPortrait = function (m) {
    var canvas = this.el['briefing-portrait'];
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
    ctx.ellipse(cx, headY, headR, headR * 1.18, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = shade(skin, -18);
    ctx.beginPath();
    ctx.ellipse(cx, headY + headR * 0.2, headR * 0.86, headR * 0.9, 0, 0, Math.PI);
    ctx.fill();

    ctx.fillStyle = hair;
    ctx.beginPath();
    ctx.ellipse(cx, headY - headR * 0.42, headR * 1.02, headR * 0.62, 0, Math.PI, TAU);
    ctx.fill();
    ctx.fillRect(cx - headR * 1.02, headY - headR * 0.46, headR * 0.18, headR * 1.06);
    ctx.fillRect(cx + headR * 0.84, headY - headR * 0.46, headR * 0.18, headR * 1.06);

    ctx.fillStyle = 'rgba(20,10,8,0.85)';
    ctx.beginPath();
    ctx.ellipse(cx - headR * 0.38, headY + headR * 0.02, headR * 0.115, headR * 0.075, 0, 0, TAU);
    ctx.ellipse(cx + headR * 0.38, headY + headR * 0.02, headR * 0.115, headR * 0.075, 0, 0, TAU);
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

  HUD.prototype.hideBriefing = function () {
    this.setScreen('hud');
  };

  HUD.prototype.hide = function () {
    this.setScreen('hud');
  };

  /* --------------------------------- result -------------------------------- */

  HUD.prototype.showResult = function (win, data) {
    data = data || {};
    var screen = this.el['result-screen'];
    if (screen) {
      screen.classList.toggle('failed', !win);
      screen.classList.add('is-open');
      screen.setAttribute('aria-hidden', 'false');
    }
    setText(this.el['result-kicker'], win ? 'MISSION COMPLETE' : 'MISSION FAILED');
    setText(this.el['result-title'], data.title || 'COSTA SOL');
    setText(this.el['result-rank'], win ? (data.rank || 'A') : 'F');
    setText(this.el['result-message'], data.message || (win ? 'The city pays out. For now.' : data.reason || 'Try again.'));

    var stats = this.el['result-stats'];
    if (stats) {
      stats.innerHTML = '';
      var rows = [
        ['PAYOUT', win ? '$' + formatMoney(data.reward || 0) : '$0'],
        ['TIME', data.time || '00:00'],
        ['HEAT', (data.heat || 0) + ' ★']
      ];
      for (var i = 0; i < rows.length; i++) {
        var div = document.createElement('div');
        var micro = document.createElement('span');
        micro.className = 'micro';
        micro.textContent = rows[i][0];
        var value = document.createElement('b');
        value.textContent = rows[i][1];
        div.appendChild(micro);
        div.appendChild(value);
        stats.appendChild(div);
      }
    }

    var retry = this.el['btn-result-retry'];
    if (retry) retry.hidden = !!win;
    var cont = this.el['btn-result-continue'];
    if (cont) cont.hidden = !win;

    this.screen = 'result';
    this._banner(win ? 'MISSION COMPLETE' : 'MISSION FAILED', data.title || 'COSTA SOL', win
      ? '$' + formatMoney(data.reward || 0) + ' · ' + (data.time || '00:00') + ' · RANK ' + (data.rank || 'A')
      : (data.reason || data.message || 'TRY AGAIN'), win ? 'mission' : 'fail');
    this._bannerUntil = this.time + 2.4;
    this._missionRows = [];
  };

  /* ------------------------------ weapon wheel ----------------------------- */

  HUD.prototype.openWheel = function (mode) {
    if (!this.el['weapon-wheel']) return;
    this._wheel.open = true;
    this._wheel.mode = mode === 'shop' ? 'shop' : 'wheel';
    var p = this._player();
    this._wheel.selected = (p && p.currentWeapon) || 'pistol';
    if (this._wheel.mode === 'shop') {
      setText(this.el['wheel-mode'], 'AMMU-NATION · SHOP');
      setText(this.el['wheel-title'], 'AMMU-NATION');
    } else {
      setText(this.el['wheel-mode'], 'ARMORY · FREE ROAM');
      setText(this.el['wheel-title'], 'WEAPON WHEEL');
    }
    this.el['weapon-wheel'].classList.toggle('shop', this._wheel.mode === 'shop');
    this._refreshWheel(true);
    this.setScreen('wheel');
  };

  HUD.prototype.closeWheel = function () {
    this._wheel.open = false;
    this.setScreen('hud');
  };

  HUD.prototype.wheelSelect = function (id) {
    if (!this._wheel.open || !id || !WCFG[id]) return;
    this._wheel.selected = id;
    this._refreshWheel(false);
  };

  HUD.prototype.wheelClick = function (id) {
    if (!id || !WCFG[id]) return;
    this._wheel.selected = id;
    var owns = this._owns(id);
    if (!owns) {
      this._buySelected(false);
      return;
    }
    if (this.game.combat && this.game.combat.setWeapon) {
      if (this.game.combat.setWeapon(id)) {
        if (this.game.audio && this.game.audio.ui) this.game.audio.ui();
        this._refreshWheel(false);
      }
    }
  };

  HUD.prototype.wheelConfirm = function () {
    if (!this._wheel.open) return;
    this._buySelected(true);
  };

  HUD.prototype._buySelected = function (allowEquip) {
    var id = this._wheel.selected;
    var def = WCFG[id];
    if (!def || !this._wheel.open) return;
    var combat = this.game.combat;
    var p = this._player();
    if (id === 'fists') {
      if (allowEquip && combat && combat.setWeapon) combat.setWeapon('fists');
      this._refreshWheel(false);
      return;
    }
    var state = p && p.weapons && p.weapons[id];
    var owns = !!(state && state.owned);

    if (!owns) {
      if (combat && combat.buy) {
        var result = combat.buy(id, 'weapon');
        this._wheelResult(result);
      } else if (p && p.buyWeapon) {
        var ok = p.buyWeapon(id);
        this._wheelResult({ ok: ok, reason: ok ? 'PURCHASED' : 'NOT ENOUGH CASH', price: def.price });
      }
      this._refreshWheel(true);
      return;
    }

    if (def.kind === 'melee') {
      if (combat && combat.setWeapon) combat.setWeapon('fists');
      this._refreshWheel(false);
      return;
    }

    if (combat && combat.buy) {
      var ammo = combat.buy(id, 'ammo');
      this._wheelResult(ammo);
    }
    this._refreshWheel(true);
  };

  HUD.prototype._wheelResult = function (result) {
    if (!result) return;
    if (result.ok) {
      /* LH.Combat already emits the itemised purchase toast. */
      if (this.game.audio && this.game.audio.pickup) this.game.audio.pickup();
      return;
    }
    this.toast(result.reason || 'PURCHASE FAILED', 'danger');
    if (this.game.audio && this.game.audio.ui) this.game.audio.ui('deny');
  };

  HUD.prototype._refreshWheel = function (full) {
    var p = this._player();
    if (!p) return;
    var money = Math.max(0, p.money || 0);
    if (full || money !== this._wheel.lastMoney) {
      this._wheel.lastMoney = money;
      setText(this.el['wheel-money'], '$' + formatMoney(money));
    }

    var id = this._wheel.selected;
    var def = WCFG[id] || {};
    var state = (p.weapons && p.weapons[id]) || { owned: id === 'fists', ammo: 0, reserve: 0 };

    var defs = this._wheel.slots;
    for (var i = 0; i < defs.length; i++) {
      var wid = defs[i];
      var wdef = WCFG[wid] || {};
      var wstate = (p.weapons && p.weapons[wid]) || { owned: wid === 'fists', ammo: 0, reserve: 0 };
      var slot = $('wheel-slot-' + wid);
      if (!slot) continue;
      var owned = !!wstate.owned || wid === 'fists';
      slot.classList.toggle('owned', owned);
      slot.classList.toggle('locked', !owned);
      slot.classList.toggle('active', wid === id);
      var ammo = slot.querySelector('.slot-ammo');
      var price = slot.querySelector('.slot-price');
      var desc = slot.querySelector('.slot-desc');
      var dmgFill = slot.querySelector('.slot-dmg i');
      if (ammo) ammo.textContent = wdef.kind === 'melee' ? 'MELEE' : (wstate.ammo || 0) + ' / ' + (wstate.reserve || 0);
      if (price) price.textContent = owned ? (wdef.kind === 'melee' ? 'EQUIPPED' : 'OWNED') : '$' + formatMoney(wdef.price || 0);
      if (desc) desc.textContent = wdef.description || '';
      if (dmgFill) {
        var dmg = (wdef.damage || 0) * (wdef.pellets || 1);
        dmgFill.style.width = clamp(dmg / 90 * 100, 8, 100) + '%';
      }
    }

    setText(this.el['wheel-selected'], def.name || String(id).toUpperCase());
    setText(this.el['wheel-selected-ammo'], def.kind === 'melee' ? 'MELEE' : (state.ammo || 0) + ' / ' + (state.reserve || 0));
    var dmg = (def.damage || 0) * (def.pellets || 1);
    setText(this.el['wheel-damage-value'], String(dmg));
    setWidth(this.el['wheel-damage-fill'], dmg / 90 * 100);

    var owns = !!state.owned || id === 'fists';
    var action = $('wheel-action');
    if (action) {
      if (def.kind === 'melee') {
        action.textContent = owns ? 'EQUIPPED · FREE' : '$0';
        action.classList.remove('buy');
      } else if (!owns) {
        action.textContent = 'ENTER BUY · $' + formatMoney(def.price || 0);
        action.classList.add('buy');
      } else {
        action.textContent = 'ENTER AMMO · $' + formatMoney(def.ammoPrice || 0);
        action.classList.remove('buy');
      }
    }

    var hint = this.el['wheel-hint'];
    if (hint) {
      hint.textContent = this._wheel.mode === 'shop'
        ? 'ENTER BUY AMMO · CLICK EQUIP · Q / ESC LEAVE SHOP'
        : 'ENTER BUY · CLICK EQUIP · Q OR ESC TO CLOSE · 1—5 SELECT';
    }
  };

  HUD.prototype._drawWeaponIcon = function (weaponId) {
    var canvas = this.el['weapon-icon'];
    if (!canvas || !canvas.getContext) return;
    var ctx = canvas.getContext('2d');
    var w = canvas.width;
    var h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.fillStyle = 'rgba(247,236,214,0.94)';
    ctx.strokeStyle = 'rgba(40,224,208,0.7)';
    ctx.lineWidth = 1.5;
    if (weaponId === 'fists') {
      ctx.beginPath();
      ctx.arc(0, 0, 11, 0, TAU);
      ctx.stroke();
      ctx.fillRect(-10, -4, 20, 9);
      ctx.fillRect(-14, -6, 4, 6);
    } else if (weaponId === 'shotgun') {
      ctx.fillRect(-38, -3, 62, 6);
      ctx.fillRect(10, -1, 30, 4);
      ctx.beginPath();
      ctx.moveTo(-38, 3);
      ctx.lineTo(-26, 3);
      ctx.lineTo(-33, 14);
      ctx.lineTo(-46, 14);
      ctx.closePath();
      ctx.fill();
      ctx.strokeRect(-4, -7, 16, 5);
      ctx.fillRect(-12, 3, 8, 4);
    } else if (weaponId === 'rifle') {
      ctx.fillRect(-42, -3, 74, 5);
      ctx.fillRect(12, -1, 30, 3);
      ctx.beginPath();
      ctx.moveTo(-42, 2);
      ctx.lineTo(-30, 2);
      ctx.lineTo(-38, 14);
      ctx.lineTo(-48, 14);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(-10, 2, 7, 11);
      ctx.strokeRect(2, 3, 20, 5);
      ctx.fillRect(-2, -8, 12, 5);
    } else if (weaponId === 'smg') {
      ctx.fillRect(-30, -4, 52, 8);
      ctx.fillRect(22, -1, 16, 3);
      ctx.fillRect(-20, 4, 7, 13);
      ctx.fillRect(-2, 4, 6, 11);
      ctx.fillRect(-4, -8, 8, 4);
    } else {
      ctx.fillRect(-26, -5, 44, 9);
      ctx.fillRect(18, -2, 12, 4);
      ctx.beginPath();
      ctx.moveTo(-26, -5);
      ctx.lineTo(-12, -5);
      ctx.lineTo(-16, -15);
      ctx.lineTo(-28, -15);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(-10, 4, 8, 12);
      ctx.fillRect(-26, 3, 8, 4);
    }
    ctx.restore();
  };

  /* -------------------------------- minimap -------------------------------- */

  HUD.prototype._ensureMapBase = function (world) {
    if (this._mapBase || !world || !document.createElement) return;
    var bounds = this._mapBounds;
    var ppm = this._mapBasePPM;
    var width = Math.ceil((bounds.maxX - bounds.minX) * ppm);
    var height = Math.ceil((bounds.maxZ - bounds.minZ) * ppm);
    var canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    var ctx = canvas.getContext('2d');
    if (!ctx) return;
    this._mapBase = canvas;
    this._mapBaseW = width;
    this._mapBaseH = height;

    var bx = function (x) { return (x - bounds.minX) * ppm; };
    var bz = function (z) { return (z - bounds.minZ) * ppm; };
    var bw = function (w) { return w * ppm; };

    /* ocean, beach and land */
    ctx.fillStyle = '#06202c';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#0b4050';
    ctx.fillRect(bx(-520), 0, bw(60), height);
    ctx.fillStyle = '#d7bf8d';
    ctx.fillRect(bx(-460), 0, bw(60), height);
    ctx.fillStyle = '#2b363d';
    ctx.fillRect(bx(-400), 0, bw(900), height);
    /* blocks first, then roads, then building footprints */
    var worldBlocks = world.blocks || [];
    var i;
    var lot = (CFG.WORLD && CFG.WORLD.lotSize) || 76;
    for (i = 0; i < worldBlocks.length; i++) {
      var b = worldBlocks[i];
      var type = b.type || 'lot';
      var color = '#2d363d';
      if (type === 'park') color = '#326f49';
      else if (type === 'plaza') color = '#5b5345';
      else if (type === 'promenade') color = '#8e846e';
      else if (type === 'estate') color = '#70265e';
      else if (type === 'police') color = '#31506e';
      else if (type === 'hospital') color = '#5b3741';
      else if (type === 'garage') color = '#41484d';
      else if (type === 'ammu' || type === 'safehouse' || type === 'helipad') color = '#4c4a43';
      ctx.fillStyle = color;
      ctx.fillRect(bx(b.cx - lot / 2), bz(b.cz - lot / 2), bw(lot), bw(lot));
    }

    /* roads: pale bands with a dashed centre line */
    var roads = world.roads || {};
    var xs = roads.x || (CFG.WORLD && CFG.WORLD.roadsX) || [];
    var zs = roads.z || (CFG.WORLD && CFG.WORLD.roadsZ) || [];
    var half = ((CFG.WORLD && CFG.WORLD.roadHalfWidth) || 8) * 2;
    ctx.strokeStyle = '#ddd4bf';
    ctx.lineWidth = Math.max(3, bw(half));
    ctx.lineCap = 'butt';
    for (i = 0; i < xs.length; i++) {
      ctx.beginPath();
      ctx.moveTo(bx(xs[i]), bz(-500));
      ctx.lineTo(bx(xs[i]), bz(500));
      ctx.stroke();
    }
    for (i = 0; i < zs.length; i++) {
      ctx.beginPath();
      ctx.moveTo(bx(-500), bz(zs[i]));
      ctx.lineTo(bx(500), bz(zs[i]));
      ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(250,244,224,0.7)';
    ctx.lineWidth = Math.max(1, bw(1.1));
    ctx.setLineDash([Math.max(3, bw(6)), Math.max(3, bw(5))]);
    for (i = 0; i < xs.length; i++) {
      ctx.beginPath();
      ctx.moveTo(bx(xs[i]), bz(-500));
      ctx.lineTo(bx(xs[i]), bz(500));
      ctx.stroke();
    }
    for (i = 0; i < zs.length; i++) {
      ctx.beginPath();
      ctx.moveTo(bx(-500), bz(zs[i]));
      ctx.lineTo(bx(500), bz(zs[i]));
      ctx.stroke();
    }
    ctx.setLineDash([]);

    /* building footprints, brighter with height */
    var buildings = world.buildings || [];
    for (i = 0; i < buildings.length; i++) {
      var build = buildings[i];
      if (!build || build.maxX == null) continue;
      var h = build.h || build.height || 8;
      var light = clamp(84 + h * 0.5, 84, 150);
      ctx.fillStyle = 'rgb(' + Math.round(light) + ',' + Math.round(light + 9) + ',' + Math.round(light + 14) + ')';
      ctx.fillRect(bx(build.minX), bz(build.minZ), bw(build.maxX - build.minX), bw(build.maxZ - build.minZ));
      ctx.strokeStyle = 'rgba(14,22,28,0.7)';
      ctx.lineWidth = 1;
      ctx.strokeRect(bx(build.minX) + 0.5, bz(build.minZ) + 0.5, bw(build.maxX - build.minX) - 1, bw(build.maxZ - build.minZ) - 1);
    }

    /* pier and marina docks */
    ctx.fillStyle = '#a37e52';
    ctx.fillRect(bx(-700), bz(292), bw(240), bw(16));
    ctx.fillStyle = '#8b6a45';
    for (i = 0; i < 5; i++) {
      ctx.fillRect(bx(-535), bz(-270 + i * 40), bw(72), bw(4));
    }

    /* plaza fountain and estate glow */
    ctx.fillStyle = '#2a7f86';
    ctx.beginPath();
    ctx.arc(bx(50), bz(50), bw(6), 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,45,149,0.9)';
    ctx.lineWidth = Math.max(1.5, bw(1.2));
    ctx.strokeRect(bx(311), bz(-389), bw(78), bw(78));

    /* faint district labels live on the map itself for orientation */
    ctx.font = '700 ' + Math.max(7, bw(6)) + 'px "Arial Narrow", Arial, sans-serif';
    ctx.fillStyle = 'rgba(247,236,214,0.55)';
    ctx.textAlign = 'center';
    ctx.fillText('PLAZA SOL', bx(50), bz(50) + bw(18));
    ctx.fillText('DOWNTOWN', bx(210), bz(-120));
    ctx.fillText('CROWE', bx(350), bz(-350));
    ctx.fillText('PIER', bx(-600), bz(300) - bw(12));
  };

  HUD.prototype.renderMinimap = function (world, player, police, missions) {
    var ctx = this._mapCtx;
    if (!ctx) return;
    world = world || this.game.world;
    player = player || this._player();
    police = police || this.game.police;
    missions = missions || this.game.missions;
    var S = this._mapPx;
    var view = (HUDCFG.minimapScale) || 900;
    var px = player && player.pos ? player.pos.x : 0;
    var pz = player && player.pos ? player.pos.z : 0;
    var scale = S / view;

    ctx.clearRect(0, 0, S, S);
    ctx.fillStyle = '#0a1418';
    ctx.fillRect(0, 0, S, S);

    if (!this._mapBase && world) this._ensureMapBase(world);
    if (this._mapBase) {
      var bounds = this._mapBounds;
      var ppm = this._mapBasePPM;
      var srcW = (bounds.maxX - bounds.minX) * ppm;
      var srcH = (bounds.maxZ - bounds.minZ) * ppm;
      var fx = (px - bounds.minX) * ppm - view / 2 * ppm;
      var fy = (pz - bounds.minZ) * ppm - view / 2 * ppm;
      var sx = Math.max(0, fx);
      var sy = Math.max(0, fy);
      var sx2 = Math.min(srcW, fx + view * ppm);
      var sy2 = Math.min(srcH, fy + view * ppm);
      if (sx2 > sx && sy2 > sy) {
        /* source pixels -> canvas pixels: the crop is view metres wide, not
           canvas pixels wide, so this factor is smaller than the blip scale */
        var srcScale = S / (view * ppm);
        var dx = (sx - fx) * srcScale;
        var dy = (sy - fy) * srcScale;
        var dw = (sx2 - sx) * srcScale;
        var dh = (sy2 - sy) * srcScale;
        ctx.drawImage(this._mapBase, sx, sy, sx2 - sx, sy2 - sy, dx, dy, dw, dh);
      }
    }

    var toMapX = function (x) { return S / 2 + (x - px) * scale; };
    var toMapY = function (z) { return S / 2 + (z - pz) * scale; };
    var now = this._mapTime || this.time;

    /* district grid tint for depth */
    ctx.strokeStyle = 'rgba(255,255,255,0.035)';
    ctx.lineWidth = 1;
    var gridStep = 100 * scale;
    var gridOffX = (S / 2 - px * scale) % gridStep;
    var gridOffY = (S / 2 - pz * scale) % gridStep;
    var gx;
    for (gx = gridOffX; gx < S; gx += gridStep) {
      ctx.beginPath();
      ctx.moveTo(gx, 0);
      ctx.lineTo(gx, S);
      ctx.stroke();
    }
    for (gx = gridOffY; gx < S; gx += gridStep) {
      ctx.beginPath();
      ctx.moveTo(0, gx);
      ctx.lineTo(S, gx);
      ctx.stroke();
    }

    /* police units, roadblock and officers */
    var i;
    var pulse = 0.5 + 0.5 * Math.sin(now * 6);
    if (police) {
      var units = police.units || [];
      for (i = 0; i < units.length; i++) {
        var u = units[i];
        if (!u || !u.pos) continue;
        var ux = toMapX(u.pos.x);
        var uy = toMapY(u.pos.z);
        var siren = Math.sin(now * 9 + i * 1.7) > 0;
        ctx.fillStyle = siren ? '#ff4d55' : '#5cb7ff';
        ctx.beginPath();
        ctx.arc(ux, uy, 5 + pulse * 1.4, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      var cops = police.cops || [];
      for (i = 0; i < cops.length; i++) {
        var cop = cops[i];
        if (!cop || !cop.pos || !cop.alive) continue;
        ctx.fillStyle = '#ff8a7a';
        ctx.fillRect(toMapX(cop.pos.x) - 1.6, toMapY(cop.pos.z) - 1.6, 3.2, 3.2);
      }
      var rb = police.roadblock;
      if (rb && rb.active) {
        var rx = toMapX(rb.x);
        var ry = toMapY(rb.z);
        ctx.strokeStyle = 'rgba(243,201,105,' + (0.5 + pulse * 0.5) + ')';
        ctx.lineWidth = 2;
        ctx.strokeRect(rx - 9, ry - 9, 18, 18);
        ctx.fillStyle = '#f3c969';
        ctx.fillRect(rx - 7, ry - 3, 14, 6);
        ctx.fillStyle = 'rgba(243,201,105,0.13)';
        ctx.beginPath();
        ctx.arc(rx, ry, 22 + pulse * 7, 0, TAU);
        ctx.fill();
      }
    }

    /* crew support dots only from real crew positions */
    var crew = this._crewPositions(missions);
    for (i = 0; i < crew.length; i++) {
      var cr = crew[i];
      ctx.fillStyle = '#63e6a4';
      ctx.beginPath();
      ctx.arc(toMapX(cr.x), toMapY(cr.z), 6, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(4,12,10,0.8)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    /* objective / mission marker: yellow diamond with ring */
    var target = this._objectiveTarget();
    if (target) {
      var tx = toMapX(target.x);
      var ty = toMapY(target.z);
      var clamped = tx > 4 && tx < S - 4 && ty > 4 && ty < S - 4;
      if (clamped) {
        ctx.fillStyle = '#f3c969';
        ctx.beginPath();
        ctx.moveTo(tx, ty - 9);
        ctx.lineTo(tx + 9, ty);
        ctx.lineTo(tx, ty + 9);
        ctx.lineTo(tx - 9, ty);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(243,201,105,' + (0.28 + pulse * 0.35) + ')';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(tx, ty, 12 + pulse * 4, 0, TAU);
        ctx.stroke();
      } else {
        var ang = Math.atan2(ty - S / 2, tx - S / 2);
        var ex = S / 2 + Math.cos(ang) * (S / 2 - 5);
        var ey = S / 2 + Math.sin(ang) * (S / 2 - 5);
        ctx.fillStyle = '#f3c969';
        ctx.beginPath();
        ctx.moveTo(ex + Math.cos(ang) * 6, ey + Math.sin(ang) * 6);
        ctx.lineTo(ex + Math.cos(ang + 2.5) * 6, ey + Math.sin(ang + 2.5) * 6);
        ctx.lineTo(ex + Math.cos(ang - 2.5) * 6, ey + Math.sin(ang - 2.5) * 6);
        ctx.closePath();
        ctx.fill();
      }
    }

    /* player: white triangle pointing along yaw */
    var yaw = player ? (player.yaw || 0) : 0;
    ctx.save();
    ctx.translate(S / 2, S / 2);
    ctx.rotate(Math.PI - yaw);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = 'rgba(6,14,18,0.9)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -12);
    ctx.lineTo(8.5, 8);
    ctx.lineTo(0, 5);
    ctx.lineTo(-8.5, 8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    /* center dot helps read the heading */
    ctx.fillStyle = 'rgba(4,10,14,0.85)';
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, 2, 0, TAU);
    ctx.fill();
  };

  HUD.prototype._crewPositions = function (missions) {
    var g = this.game;
    var list = [];
    var sources = [
      g.crewPositions,
      missions && missions.crewPositions,
      g.missions && g.missions.crewPositions
    ];
    for (var s = 0; s < sources.length; s++) {
      var src = sources[s];
      if (!src) continue;
      for (var key in src) {
        if (!Object.prototype.hasOwnProperty.call(src, key)) continue;
        var v = src[key];
        if (v && typeof v.x === 'number' && typeof v.z === 'number') list.push(v);
      }
      if (list.length) return list;
    }
    var actors = missions && missions.actors;
    if (actors && actors.peds) {
      for (var i = 0; i < actors.peds.length; i++) {
        var ped = actors.peds[i];
        if (ped && ped.faction === 'crew' && ped.pos) list.push(ped.pos);
      }
    }
    return list;
  };

  HUD.prototype.setMapDistrict = function (name) {
    setText(this.el['minimap-district'], name || 'COSTA SOL');
  };

  /* ---------------------------------- stats ------------------------------- */

  HUD.prototype._updateFps = function () {
    var meter = this.el['fps-meter'];
    if (!meter || meter.hidden) return;
    var fps = Math.round((this.game.perf && this.game.perf.fps) || 0);
    if (fps === this._lastFps) return;
    this._lastFps = fps;
    setText(meter, fps + ' FPS');
  };

  HUD.prototype.destroy = function () {
    for (var i = 0; i < this._toastTimers.length; i++) clearTimeout(this._toastTimers[i]);
    this._toastTimers.length = 0;
    clearTimeout(this._saveTimer);
    if (this._dispatchObserver) this._dispatchObserver.disconnect();
    if (this._onKey) window.removeEventListener('keydown', this._onKey, false);
    var style = $('hud-stage7-style');
    if (style && style.parentNode) style.parentNode.removeChild(style);
  };

  LH.HUD = HUD;
}());
