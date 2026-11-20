/* LEONIDA HEAT 3D — procedural Web Audio.
   No audio files: every sound is a noise buffer, an oscillator or a filtered
   envelope built on demand. The context is created lazily on the first user
   gesture so browsers never block playback, and every public method is a safe
   no-op until unlock() has succeeded. */
(function () {
  'use strict';

  window.LH = window.LH || {};


  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  function noteFreq(semitonesFromA4) {
    return 440 * Math.pow(2, semitonesFromA4 / 12);
  }

  function Audio() {
    this.ctx = null;
    this.master = null;
    this.musicBus = null;
    this.sfxBus = null;
    this.compressor = null;
    this.ready = false;
    this.unlocked = false;
    this.muted = false;
    this.volume = 0.72;
    this.intensity = 0;
    this.targetIntensity = 0;
    this.station = 0;
    this._noise = null;
    this._musicTimer = null;
    this._nextStep = 0;
    this._step = 0;
    this._stepDur = 0.326;
    this._musicLevel = 0;
    this._engine = null;
    this._siren = null;
    this._lastEngineCall = -1;
    this._voiceCap = 26;
    this._voices = 0;
  }

  /* ------------------------------------------------------------- graph ---- */

  Audio.prototype._makeNoise = function () {
    var ctx = this.ctx;
    var len = Math.floor(ctx.sampleRate * 2);
    var buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    var data = buffer.getChannelData(0);
    var last = 0;
    for (var i = 0; i < len; i++) {
      var white = Math.random() * 2 - 1;
      last = last * 0.62 + white * 0.38;
      data[i] = last;
    }
    return buffer;
  };

  Audio.prototype._buildGraph = function () {
    var ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;

    this.compressor = ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -16;
    this.compressor.knee.value = 18;
    this.compressor.ratio.value = 4;
    this.compressor.attack.value = 0.004;
    this.compressor.release.value = 0.22;

    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = 0.9;
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = 0;

    this.sfxBus.connect(this.compressor);
    this.musicBus.connect(this.compressor);
    this.compressor.connect(this.master);
    this.master.connect(ctx.destination);

    this._noise = this._makeNoise();
    this.ready = true;
  };

  Audio.prototype.unlock = function () {
    if (!this.ctx) {
      var Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return false;
      try {
        this.ctx = new Ctor();
        this._buildGraph();
      } catch (err) {
        this.ctx = null;
        this.ready = false;
        return false;
      }
    }
    try {
      if (this.ctx.state === 'suspended' && this.ctx.resume) this.ctx.resume();
    } catch (err) { /* resume can be rejected */ }
    this.unlocked = true;
    this._startMusic();
    return true;
  };

  Audio.prototype.setMuted = function (muted) {
    this.muted = !!muted;
    if (!this.ready || !this.ctx) return this.muted;
    var now = this.ctx.currentTime;
    var value = this.muted ? 0 : this.volume;
    try {
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setTargetAtTime(value, now, 0.04);
    } catch (err) { /* context may be closing */ }
    return this.muted;
  };

  Audio.prototype._now = function () {
    return this.ctx ? this.ctx.currentTime : 0;
  };

  Audio.prototype._ok = function () {
    return !!(this.ready && this.ctx && !this.muted);
  };

  Audio.prototype._voice = function () {
    if (this._voices >= this._voiceCap) return false;
    this._voices++;
    return true;
  };

  Audio.prototype._gain = function (destination) {
    var g = this.ctx.createGain();
    g.gain.value = 0;
    g.connect(destination || this.sfxBus);
    return g;
  };

  Audio.prototype._noiseHit = function (time, dur, freq, q, peak, type) {
    if (!this._voice()) return null;
    var ctx = this.ctx;
    var src = ctx.createBufferSource();
    src.buffer = this._noise;
    src.loop = true;
    src.playbackRate.value = 0.9 + Math.random() * 0.24;
    var filter = ctx.createBiquadFilter();
    filter.type = type || 'lowpass';
    filter.frequency.setValueAtTime(freq, time);
    filter.Q.value = q || 0.7;
    var gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), time + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxBus);
    src.start(time);
    src.stop(time + dur + 0.03);
    var self = this;
    src.onended = function () {
      self._voices = Math.max(0, self._voices - 1);
      try { gain.disconnect(); } catch (err) { /* disconnected */ }
    };
    return gain;
  };

  Audio.prototype._tone = function (time, dur, f0, f1, peak, type, bus) {
    if (!this._voice()) return null;
    var ctx = this.ctx;
    var osc = ctx.createOscillator();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(Math.max(20, f0), time);
    if (f1 && f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), time + dur);
    var gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), time + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    osc.connect(gain);
    gain.connect(bus || this.sfxBus);
    osc.start(time);
    osc.stop(time + dur + 0.02);
    var self = this;
    osc.onended = function () {
      self._voices = Math.max(0, self._voices - 1);
      try { gain.disconnect(); } catch (err) { /* disconnected */ }
    };
    return osc;
  };

  /* ------------------------------------------------------------ weapons ---- */

  Audio.prototype.shot = function (kind) {
    if (!this._ok()) return;
    var t = this._now() + 0.002;
    var pitch = 0.92 + Math.random() * 0.16;
    if (kind === 'melee' || kind === 'fists') {
      this._noiseHit(t, 0.13, 900 * pitch, 1.6, 0.20, 'bandpass');
      this._tone(t, 0.10, 160 * pitch, 90, 0.10, 'triangle');
      return;
    }
    if (kind === 'smg') {
      this._noiseHit(t, 0.075, 2300 * pitch, 0.8, 0.34);
      this._tone(t, 0.07, 240 * pitch, 95, 0.16, 'square');
      return;
    }
    if (kind === 'shotgun') {
      this._noiseHit(t, 0.34, 1100 * pitch, 0.6, 0.68);
      this._tone(t, 0.26, 96 * pitch, 38, 0.30, 'sawtooth');
      return;
    }
    if (kind === 'rifle') {
      this._noiseHit(t, 0.20, 3200 * pitch, 0.9, 0.52);
      this._tone(t, 0.16, 170 * pitch, 62, 0.22, 'square');
      return;
    }
    this._noiseHit(t, 0.15, 2400 * pitch, 0.8, 0.46);
    this._tone(t, 0.10, 190 * pitch, 66, 0.19, 'triangle');
  };

  Audio.prototype.impact = function (strength) {
    if (!this._ok()) return;
    var s = clamp(strength == null ? 0.4 : strength, 0.05, 1);
    var t = this._now() + 0.001;
    this._noiseHit(t, 0.10 + s * 0.08, 460 + s * 500, 1.1, 0.11 + s * 0.2);
    this._tone(t, 0.09, 110 + s * 40, 48, 0.08 + s * 0.12, 'sine');
  };

  Audio.prototype.footstep = function () {
    if (!this._ok()) return;
    var t = this._now() + 0.001;
    var pitch = 0.9 + Math.random() * 0.24;
    this._noiseHit(t, 0.065, 520 * pitch, 1.5, 0.085, 'bandpass');
  };

  Audio.prototype.reload = function () {
    if (!this._ok()) return;
    var t = this._now() + 0.01;
    this._noiseHit(t, 0.045, 2600, 2.2, 0.20, 'bandpass');
    this._tone(t, 0.035, 780, 560, 0.06, 'square');
    this._noiseHit(t + 0.16, 0.05, 1900, 2.0, 0.18, 'bandpass');
    this._tone(t + 0.16, 0.04, 520, 380, 0.05, 'square');
  };

  Audio.prototype.ui = function (kind) {
    if (!this._ok()) return;
    var t = this._now() + 0.002;
    if (kind === 'deny' || kind === 'error') {
      this._tone(t, 0.12, 220, 140, 0.10, 'square');
      return;
    }
    var f = kind === 'back' ? 420 : kind === 'confirm' ? 880 : 660;
    this._tone(t, 0.06, f, f * 1.18, 0.075, 'sine');
  };

  Audio.prototype.pickup = function () {
    if (!this._ok()) return;
    var t = this._now() + 0.002;
    this._tone(t, 0.10, 660, 660, 0.09, 'triangle');
    this._tone(t + 0.085, 0.14, 990, 990, 0.08, 'triangle');
  };

  Audio.prototype.explosion = function () {
    if (!this._ok()) return;
    var t = this._now() + 0.002;
    this._noiseHit(t, 0.85, 900, 0.8, 0.85);
    this._tone(t, 0.70, 82, 26, 0.55, 'sine');
    this._noiseHit(t + 0.05, 1.10, 220, 0.5, 0.30);
  };

  Audio.prototype.horn = function () {
    if (!this._ok()) return;
    var t = this._now() + 0.002;
    this._tone(t, 0.38, noteFreq(-9), noteFreq(-9), 0.10, 'square');
    this._tone(t, 0.38, noteFreq(-5), noteFreq(-5), 0.08, 'square');
  };

  /* ---------------------------------------------------------- continuous --- */

  Audio.prototype.siren = function (on) {
    if (!this.ready || !this.ctx) return;
    var t = this._now();
    if (on && !this._siren) {
      var ctx = this.ctx;
      var osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = 760;
      var lfo = ctx.createOscillator();
      lfo.type = 'triangle';
      lfo.frequency.value = 1.65;
      var lfoGain = ctx.createGain();
      lfoGain.gain.value = 110;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      var filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 1600;
      var gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.035, t + 0.35);
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.sfxBus);
      osc.start(t);
      lfo.start(t);
      this._siren = { osc: osc, lfo: lfo, gain: gain, filter: filter, wanted: true };
      return;
    }
    if (!on && this._siren && this._siren.wanted) {
      var s = this._siren;
      s.wanted = false;
      try {
        s.gain.gain.cancelScheduledValues(t);
        s.gain.gain.setTargetAtTime(0.0001, t, 0.12);
        s.osc.stop(t + 0.9);
        s.lfo.stop(t + 0.9);
      } catch (err) { /* already stopped */ }
      var self = this;
      s.osc.onended = function () {
        try { s.gain.disconnect(); } catch (err) { /* disconnected */ }
        if (self._siren === s) self._siren = null;
      };
    }
  };

  Audio.prototype._makeEngine = function () {
    var ctx = this.ctx;
    var gain = ctx.createGain();
    gain.gain.value = 0.0001;
    var filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 380;
    filter.Q.value = 1.1;
    var oscA = ctx.createOscillator();
    oscA.type = 'sawtooth';
    oscA.frequency.value = 52;
    var oscB = ctx.createOscillator();
    oscB.type = 'square';
    oscB.frequency.value = 104;
    var gainB = ctx.createGain();
    gainB.gain.value = 0.35;
    var road = ctx.createBufferSource();
    road.buffer = this._noise;
    road.loop = true;
    road.playbackRate.value = 0.5;
    var roadFilter = ctx.createBiquadFilter();
    roadFilter.type = 'bandpass';
    roadFilter.frequency.value = 220;
    roadFilter.Q.value = 0.9;
    var roadGain = ctx.createGain();
    roadGain.gain.value = 0.05;
    oscA.connect(filter);
    oscB.connect(gainB);
    gainB.connect(filter);
    road.connect(roadFilter);
    roadFilter.connect(roadGain);
    roadGain.connect(gain);
    filter.connect(gain);
    gain.connect(this.sfxBus);
    oscA.start();
    oscB.start();
    road.start();
    this._engine = {
      gain: gain, filter: filter, oscA: oscA, oscB: oscB,
      roadGain: roadGain, road: road, started: this._now()
    };
  };

  Audio.prototype.engine = function (speed, throttle, kind) {
    if (!this._ok()) {
      if (this._engine) {
        try { this._engine.gain.gain.setTargetAtTime(0.0001, this._now(), 0.08); } catch (err) { /* gone */ }
      }
      return;
    }
    if (!this._engine) this._makeEngine();
    var e = this._engine;
    if (!e) return;
    var sp = Math.abs(Number(speed) || 0);
    var th = clamp(Number(throttle) || 0, 0, 1);
    var base = kind === 'sports' ? 72 : kind === 'van' ? 40 : kind === 'armored' ? 34 : 52;
    var rpm = base + sp * 2.7 + th * 16;
    var now = this._now();
    var targetGain = sp < 0.3 && th < 0.02 ? 0.0001 : 0.035 + clamp(sp / 46, 0, 1) * 0.055 + th * 0.025;
    try {
      e.oscA.frequency.setTargetAtTime(rpm, now, 0.06);
      e.oscB.frequency.setTargetAtTime(rpm * 2.01, now, 0.06);
      e.filter.frequency.setTargetAtTime(230 + sp * 24 + th * 380, now, 0.08);
      e.roadGain.gain.setTargetAtTime(sp < 0.4 ? 0.0001 : 0.02 + clamp(sp / 46, 0, 1) * 0.06, now, 0.1);
      e.gain.gain.setTargetAtTime(targetGain, now, 0.09);
    } catch (err) { /* context state race */ }
    this._lastEngineCall = now;
  };

  Audio.prototype.missionSting = function (win) {
    if (!this._ok()) return;
    var t = this._now() + 0.01;
    var notes = win
      ? [noteFreq(0), noteFreq(4), noteFreq(7), noteFreq(12)]
      : [noteFreq(-3), noteFreq(-7), noteFreq(-10), noteFreq(-15)];
    for (var i = 0; i < notes.length; i++) {
      this._tone(t + i * 0.13, win ? 0.42 : 0.5, notes[i], notes[i], win ? 0.09 : 0.10, 'triangle');
      this._tone(t + i * 0.13, win ? 0.40 : 0.46, notes[i] * 2, notes[i] * 2, 0.035, 'sine');
    }
  };

  /* --------------------------------------------------------------- music --- */

  var CHORDS = [
    [0, 3, 7], [8, 12, 15], [3, 7, 10], [10, 14, 17]
  ];
  var BASS = [0, 8, 3, 10];
  var LEAD = [12, 15, 19, 22, 24, 19, 15, 12];
  var STATIONS = [
    { root: 0, lead: 0, name: 'WAVE 88' },
    { root: -3, lead: 2, name: 'NIGHT DRIVE' },
    { root: 5, lead: 1, name: 'SOL FM' }
  ];

  Audio.prototype._pad = function (freqs, time, dur) {
    if (!this._voice()) return;
    var ctx = this.ctx;
    var gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(0.022 + this.intensity * 0.012, time + 0.55);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    gain.connect(this.musicBus);
    var oscs = [];
    for (var i = 0; i < freqs.length; i++) {
      var osc = ctx.createOscillator();
      osc.type = i === 0 ? 'triangle' : 'sine';
      osc.frequency.value = freqs[i];
      osc.detune.value = (i - 1) * 4;
      osc.connect(gain);
      osc.start(time);
      osc.stop(time + dur + 0.05);
      oscs.push(osc);
    }
    var self = this;
    oscs[0].onended = function () {
      self._voices = Math.max(0, self._voices - 1);
      try { gain.disconnect(); } catch (err) { /* disconnected */ }
    };
  };

  Audio.prototype._bassNote = function (freq, time) {
    if (!this._voice()) return;
    var ctx = this.ctx;
    var osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, time);
    var gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(0.075 + this.intensity * 0.05, time + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.30);
    osc.connect(gain);
    gain.connect(this.musicBus);
    osc.start(time);
    osc.stop(time + 0.34);
    var self = this;
    osc.onended = function () {
      self._voices = Math.max(0, self._voices - 1);
      try { gain.disconnect(); } catch (err) { /* disconnected */ }
    };
  };

  Audio.prototype._kick = function (time) {
    if (!this._voice()) return;
    var ctx = this.ctx;
    var osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(124, time);
    osc.frequency.exponentialRampToValueAtTime(42, time + 0.24);
    var gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(0.16 + this.intensity * 0.20, time + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.27);
    osc.connect(gain);
    gain.connect(this.musicBus);
    osc.start(time);
    osc.stop(time + 0.30);
    var self = this;
    osc.onended = function () {
      self._voices = Math.max(0, self._voices - 1);
      try { gain.disconnect(); } catch (err) { /* disconnected */ }
    };
  };

  Audio.prototype._hat = function (time, accent) {
    if (!this._voice()) return;
    var ctx = this.ctx;
    var src = ctx.createBufferSource();
    src.buffer = this._noise;
    src.playbackRate.value = 1.4;
    var filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 6800;
    var gain = ctx.createGain();
    var peak = (accent ? 0.045 : 0.024) + this.intensity * 0.02;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(peak, time + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.055);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.musicBus);
    src.start(time);
    src.stop(time + 0.07);
    var self = this;
    src.onended = function () {
      self._voices = Math.max(0, self._voices - 1);
      try { gain.disconnect(); } catch (err) { /* disconnected */ }
    };
  };

  Audio.prototype._leadNote = function (freq, time) {
    if (!this._voice()) return;
    var ctx = this.ctx;
    var osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, time);
    var gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(0.028 + this.intensity * 0.016, time + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.24);
    osc.connect(gain);
    gain.connect(this.musicBus);
    osc.start(time);
    osc.stop(time + 0.26);
    var self = this;
    osc.onended = function () {
      self._voices = Math.max(0, self._voices - 1);
      try { gain.disconnect(); } catch (err) { /* disconnected */ }
    };
  };

  Audio.prototype._scheduleStep = function (step, time) {
    var station = STATIONS[this.station % STATIONS.length];
    var bar = Math.floor(step / 8) % 4;
    var beatStep = step % 8;
    var root = station.root + BASS[bar];
    if (beatStep === 0 || beatStep === 4) this._kick(time);
    this._hat(time, beatStep % 2 === 0);
    if (beatStep === 0 || beatStep === 3 || beatStep === 6) {
      this._bassNote(noteFreq(root - 24), time);
    }
    if (beatStep === 0) {
      var chord = CHORDS[bar];
      var freqs = [];
      for (var i = 0; i < chord.length; i++) {
        freqs.push(noteFreq(station.root + chord[i] - 12));
      }
      this._pad(freqs, time, this._stepDur * 7.4);
    }
    if (this.intensity > 0.28 && beatStep === 2 + (bar % 2) * 2 && Math.random() < 0.55) {
      var mel = LEAD[(station.lead + step / 2) % LEAD.length | 0];
      this._leadNote(noteFreq(station.root + mel), time);
    }
  };

  Audio.prototype._startMusic = function () {
    if (!this.ctx || this._musicTimer) return;
    this._nextStep = this.ctx.currentTime + 0.12;
    this._step = 0;
    var self = this;
    this._musicTimer = setInterval(function () {
      if (!self.ctx || self.muted) return;
      var horizon = self.ctx.currentTime + 0.20;
      var guard = 0;
      while (self._nextStep < horizon && guard < 8) {
        self._scheduleStep(self._step, self._nextStep);
        self._step++;
        self._nextStep += self._stepDur;
        guard++;
      }
      if (self._nextStep < self.ctx.currentTime) self._nextStep = self.ctx.currentTime + 0.05;
    }, 45);
  };

  Audio.prototype.setIntensity = function (n) {
    this.targetIntensity = clamp(Number(n) || 0, 0, 1);
    return this.targetIntensity;
  };

  Audio.prototype.setStation = function (index) {
    this.station = Math.abs(Math.round(Number(index) || 0)) % STATIONS.length;
    return this.station;
  };

  Audio.prototype.update = function (dt, wanted, speed) {
    dt = clamp(Number(dt) || 0, 0, 0.1);
    var wantedLevel = clamp(Number(wanted) || 0, 0, 5);
    var fast = clamp((Number(speed) || 0) / 45, 0, 1);
    var target = clamp(wantedLevel / 5 * 0.82 + fast * 0.12, 0, 1);
    this.setIntensity(target);
    var k = 1 - Math.exp(-1.2 * dt);
    this.intensity += (this.targetIntensity - this.intensity) * k;
    if (!this.ready || !this.ctx) return;
    var now = this.ctx.currentTime;
    var level = 0.34 + this.intensity * 0.66;
    this._musicLevel += (level - this._musicLevel) * k;
    try {
      this.musicBus.gain.setTargetAtTime(0.55 * this._musicLevel, now, 0.25);
      this.sfxBus.gain.setTargetAtTime(0.9, now, 0.1);
      if (this._engine && now - this._lastEngineCall > 0.35) {
        this._engine.gain.gain.setTargetAtTime(0.0001, now, 0.10);
      }
      if (this._siren && !this._siren.wanted) {
        this._siren.gain.gain.setTargetAtTime(0.0001, now, 0.25);
      }
    } catch (err) { /* context closing */ }
  };

  Audio.prototype.destroy = function () {
    if (this._musicTimer) {
      clearInterval(this._musicTimer);
      this._musicTimer = null;
    }
    var nodes = [this._engine, this._siren];
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (!n) continue;
      try {
        if (n.osc) n.osc.stop();
        if (n.oscA) n.oscA.stop();
        if (n.oscB) n.oscB.stop();
        if (n.lfo) n.lfo.stop();
        if (n.road) n.road.stop();
      } catch (err) { /* already stopped */ }
    }
    this._engine = null;
    this._siren = null;
    if (this.ctx && this.ctx.close && this.ctx.state !== 'closed') {
      try { this.ctx.close(); } catch (err) { /* already closed */ }
    }
    this.ctx = null;
    this.ready = false;
    this.unlocked = false;
  };

  LH.Audio = Audio;
}());
