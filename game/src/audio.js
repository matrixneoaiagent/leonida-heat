// Leonida Heat - procedural Web Audio engine.
// No samples and no network: an original radio bed (three invented stations),
// engine and tyre voices tied to the car, a rising siren, and synthesized
// weapon, impact, cash and mission stingers.

import { RADIO_STATIONS } from './config.js';

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.sfx = null;
    this.radio = null;
    this.initialized = false;
    this.muted = false;
    this.volume = 0.75;

    this.engineOsc = null;
    this.engineSub = null;
    this.engineFilter = null;
    this.engineGain = null;
    this.engineRunning = false;

    this.sirenOsc = null;
    this.sirenLfo = null;
    this.sirenLfoGain = null;
    this.sirenGain = null;

    this.tireSource = null;
    this.tireFilter = null;
    this.tireGain = null;

    this.stationIndex = 0;
    this.step = 0;
    this.nextNoteTime = 0;
    this.radioTimer = null;
    this.noiseBuffer = null;
    this.started = false;
  }

  stations() {
    return RADIO_STATIONS;
  }

  get currentStation() {
    return RADIO_STATIONS[this.stationIndex];
  }

  init() {
    if (this.initialized) {
      this.resume();
      return;
    }
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : this.volume;
      this.master.connect(this.ctx.destination);

      this.sfx = this.ctx.createGain();
      this.sfx.gain.value = 0.9;
      this.sfx.connect(this.master);

      this.radio = this.ctx.createGain();
      this.radio.gain.value = 0.26;
      this.radio.connect(this.master);

      this.noiseBuffer = this.makeNoise(1.4);
      this.setupEngine();
      this.setupSiren();
      this.setupTyre();
      this.initialized = true;
      this.started = true;
      this.nextNoteTime = this.ctx.currentTime + 0.2;
      this.radioTimer = setInterval(() => this.scheduleRadio(), 45);
    } catch (error) {
      this.initialized = false;
    }
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  toggleMute() {
    this.muted = !this.muted;
    this.resume();
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, 0.04);
    }
    return this.muted;
  }

  setMuted(value) {
    this.muted = !!value;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, 0.04);
  }

  makeNoise(seconds) {
    const length = Math.floor(this.ctx.sampleRate * seconds);
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  // -------------------------------------------------------------
  // Continuous voices
  // -------------------------------------------------------------
  setupEngine() {
    const ctx = this.ctx;
    this.engineOsc = ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    this.engineSub = ctx.createOscillator();
    this.engineSub.type = 'square';
    this.engineSub.frequency.value = 27;

    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 220;
    this.engineFilter.Q.value = 3.2;

    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;

    this.engineOsc.connect(this.engineFilter);
    this.engineSub.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.sfx);
    this.engineOsc.start();
    this.engineSub.start();
  }

  setupSiren() {
    const ctx = this.ctx;
    this.sirenOsc = ctx.createOscillator();
    this.sirenOsc.type = 'triangle';
    this.sirenOsc.frequency.value = 760;
    this.sirenLfo = ctx.createOscillator();
    this.sirenLfo.type = 'sine';
    this.sirenLfo.frequency.value = 1.7;
    this.sirenLfoGain = ctx.createGain();
    this.sirenLfoGain.gain.value = 240;
    this.sirenLfo.connect(this.sirenLfoGain);
    this.sirenLfoGain.connect(this.sirenOsc.frequency);
    this.sirenGain = ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenOsc.connect(this.sirenGain);
    this.sirenGain.connect(this.sfx);
    this.sirenOsc.start();
    this.sirenLfo.start();
  }

  setupTyre() {
    const ctx = this.ctx;
    const source = ctx.createBufferSource();
    source.buffer = this.makeNoise(2);
    source.loop = true;
    this.tireFilter = ctx.createBiquadFilter();
    this.tireFilter.type = 'bandpass';
    this.tireFilter.frequency.value = 1750;
    this.tireFilter.Q.value = 5;
    this.tireGain = ctx.createGain();
    this.tireGain.gain.value = 0;
    source.connect(this.tireFilter);
    this.tireFilter.connect(this.tireGain);
    this.tireGain.connect(this.sfx);
    source.start();
    this.tireSource = source;
  }

  startEngine(note = 1) {
    this.resume();
    if (!this.engineGain) return;
    this.engineRunning = true;
    this.engineNote = note;
    const t = this.ctx.currentTime;
    this.engineGain.gain.setTargetAtTime(0.08, t, 0.08);
  }

  stopEngine() {
    this.engineRunning = false;
    if (this.engineGain && this.ctx) this.engineGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.12);
  }

  updateEngine(speedRatio, accelerating, braking) {
    if (!this.initialized || !this.engineGain || this.muted) return;
    if (!this.engineRunning) {
      this.engineGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
      return;
    }
    const t = this.ctx.currentTime;
    const note = this.engineNote || 1;
    const pitch = (44 + speedRatio * 150 + (accelerating ? 22 : 0)) * note;
    const cutoff = 180 + speedRatio * 720 + (accelerating ? 220 : 0);
    this.engineOsc.frequency.setTargetAtTime(pitch, t, 0.06);
    this.engineSub.frequency.setTargetAtTime(pitch * 0.5, t, 0.06);
    this.engineFilter.frequency.setTargetAtTime(cutoff, t, 0.08);
    this.engineGain.gain.setTargetAtTime(0.05 + speedRatio * 0.1, t, 0.06);
  }

  setTireScreech(intensity) {
    if (!this.initialized || !this.tireGain || this.muted) return;
    const t = this.ctx.currentTime;
    this.tireGain.gain.setTargetAtTime(Math.min(0.16, intensity * 0.22), t, 0.05);
    this.tireFilter.frequency.setTargetAtTime(1500 + intensity * 1200, t, 0.08);
  }

  setPoliceSiren(active, stars = 1) {
    this.sirenActive = active;
    if (!this.initialized || !this.sirenGain || this.muted) return;
    const t = this.ctx.currentTime;
    const level = Math.max(1, stars);
    this.sirenGain.gain.setTargetAtTime(active ? 0.06 + level * 0.022 : 0, t, 0.16);
    this.sirenOsc.frequency.setTargetAtTime(690 + level * 46, t, 0.2);
    this.sirenLfo.frequency.setTargetAtTime(1.5 + level * 0.28, t, 0.2);
    this.sirenLfoGain.gain.setTargetAtTime(210 + level * 24, t, 0.2);
  }

  // -------------------------------------------------------------
  // One-shot voices
  // -------------------------------------------------------------
  envGain(vol, attack, decay) {
    const g = this.ctx.createGain();
    const t = this.ctx.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    return g;
  }

  noiseBurst(duration, vol, type, freq, q = 1) {
    if (!this.initialized || this.muted) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const gain = this.envGain(vol, 0.005, duration);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfx);
    src.start();
    src.stop(ctx.currentTime + duration + 0.05);
  }

  tone(freq, duration, vol, type = 'sine', slideTo = null, when = 0) {
    if (!this.initialized || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(gain);
    gain.connect(this.sfx);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  playGunshot(kind = 'pistol', volume = 1) {
    this.resume();
    if (!this.initialized) return;
    if (kind === 'shotgun') {
      this.noiseBurst(0.2, 0.34 * volume, 'lowpass', 1500);
      this.tone(120, 0.18, 0.35 * volume, 'sine', 40);
    } else if (kind === 'rifle') {
      this.noiseBurst(0.09, 0.28 * volume, 'bandpass', 3400, 0.9);
      this.tone(180, 0.1, 0.28 * volume, 'square', 60);
    } else if (kind === 'smg') {
      this.noiseBurst(0.06, 0.2 * volume, 'bandpass', 2800, 1.1);
      this.tone(200, 0.06, 0.18 * volume, 'triangle', 80);
    } else {
      this.noiseBurst(0.08, 0.24 * volume, 'bandpass', 2300, 1);
      this.tone(160, 0.08, 0.24 * volume, 'sine', 70);
    }
  }

  playExplosion() {
    this.resume();
    if (!this.initialized) return;
    this.noiseBurst(0.9, 0.5, 'lowpass', 900, 0.7);
    this.tone(90, 0.7, 0.5, 'sine', 26);
    this.tone(56, 0.9, 0.3, 'triangle', 20);
  }

  playPunch() {
    this.resume();
    this.tone(150, 0.09, 0.28, 'triangle', 48);
    this.noiseBurst(0.04, 0.12, 'bandpass', 700, 2);
  }

  playReload() {
    this.resume();
    if (!this.initialized) return;
    this.tone(1250, 0.03, 0.1, 'square');
    this.tone(760, 0.035, 0.11, 'square', null, 0.16);
    this.tone(1500, 0.025, 0.08, 'square', null, 0.32);
  }

  playCash() {
    this.resume();
    if (!this.initialized) return;
    [880, 1174, 1568].forEach((f, i) => this.tone(f, 0.18, 0.15, 'sine', null, i * 0.055));
  }

  playPickup() {
    this.resume();
    this.tone(620, 0.12, 0.16, 'triangle', 880);
    this.tone(1180, 0.16, 0.12, 'sine', null, 0.08);
  }

  playMissionPass() {
    this.resume();
    if (!this.initialized) return;
    [523, 659, 784, 1047, 1319].forEach((f, i) => {
      this.tone(f, 0.5, 0.14, 'sawtooth', null, i * 0.075);
    });
  }

  playMissionFail() {
    this.resume();
    if (!this.initialized) return;
    [392, 330, 262].forEach((f, i) => this.tone(f, 0.45, 0.18, 'triangle', null, i * 0.13));
    this.tone(110, 0.8, 0.2, 'sine', 55, 0.1);
  }

  playHorn(volume = 1) {
    this.resume();
    if (!this.initialized) return;
    this.tone(415, 0.24, 0.12 * volume, 'triangle');
    this.tone(523, 0.24, 0.1 * volume, 'triangle');
  }

  playFootstep() {
    if (!this.initialized) return;
    this.noiseBurst(0.035, 0.03, 'lowpass', 500, 1);
  }

  playHurt() {
    if (!this.initialized) return;
    this.tone(220, 0.08, 0.1, 'sawtooth', 130);
  }

  playImpact() {
    if (!this.initialized) return;
    this.noiseBurst(0.04, 0.07, 'highpass', 1800, 1);
  }

  playBodyFall() {
    if (!this.initialized) return;
    this.noiseBurst(0.12, 0.1, 'lowpass', 300, 1);
    this.tone(80, 0.12, 0.12, 'sine', 40);
  }

  playHotwire() {
    this.resume();
    if (!this.initialized) return;
    this.noiseBurst(0.08, 0.1, 'bandpass', 1400, 3);
    this.tone(90, 0.15, 0.1, 'square', 55, 0.1);
  }

  playSplash() {
    if (!this.initialized) return;
    this.noiseBurst(0.16, 0.08, 'bandpass', 1200, 0.8);
  }

  // -------------------------------------------------------------
  // Radio
  // -------------------------------------------------------------
  cycleStation() {
    this.resume();
    this.stationIndex = (this.stationIndex + 1) % RADIO_STATIONS.length;
    this.step = 0;
    if (this.ctx) this.nextNoteTime = this.ctx.currentTime + 0.08;
    return this.currentStation;
  }

  setStation(index) {
    this.resume();
    this.stationIndex = Math.max(0, Math.min(RADIO_STATIONS.length - 1, index));
    this.step = 0;
    return this.currentStation;
  }

  scheduleRadio() {
    if (!this.initialized || !this.ctx) return;
    const station = this.currentStation;
    if (station.id === 'off' || this.muted) {
      this.nextNoteTime = this.ctx.currentTime + 0.08;
      return;
    }
    if (this.nextNoteTime < this.ctx.currentTime - 0.5) {
      this.nextNoteTime = this.ctx.currentTime + 0.05;
    }
    const ahead = 0.16;
    while (this.nextNoteTime < this.ctx.currentTime + ahead) {
      this.scheduleStep(station, this.step, this.nextNoteTime);
      const beat = 60 / station.bpm / 4;
      this.nextNoteTime += beat;
      this.step = (this.step + 1) % 64;
    }
  }

  radioVoice(type, freq, start, duration, vol, filterFreq = 1800) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(filterFreq, start);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(vol, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.radio);
    osc.start(start);
    osc.stop(start + duration + 0.03);
  }

  radioNoise(start, duration, vol, filterFreq) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = filterFreq;
    filter.Q.value = 0.8;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.radio);
    src.start(start);
    src.stop(start + duration + 0.02);
  }

  radioKick(start, vol) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, start);
    osc.frequency.exponentialRampToValueAtTime(42, start + 0.2);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.24);
    osc.connect(gain);
    gain.connect(this.radio);
    osc.start(start);
    osc.stop(start + 0.26);
  }

  scheduleStep(station, step, t) {
    if (station.id === 'sunset') {
      // Neon synthwave: driving octave bass, minor pad, gated beat.
      const bass = [110, 110, 130.8, 146.8, 110, 110, 164.8, 146.8];
      const b = bass[step % 8];
      this.radioVoice('sawtooth', b, t, 0.16, 0.09, 520);
      if (step % 4 === 0) this.radioKick(t, 0.2);
      if (step % 8 === 4) this.radioNoise(t, 0.11, 0.09, 1800);
      if (step % 2 === 0) this.radioNoise(t, 0.035, 0.035, 6200);
      if (step % 32 === 0) {
        const chord = [220, 261.6, 329.6, 392];
        chord.forEach((f) => this.radioVoice('triangle', f, t, 2.4, 0.03, 900));
      }
    } else if (station.id === 'coral') {
      // Coastal trap: gliding 808, skittering hats, minor pluck.
      const subs = [55, 55, 61.7, 49];
      if (step % 16 === 0 || step % 16 === 7) {
        const f = subs[Math.floor(step / 16) % subs.length];
        const ctx = this.ctx;
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(f * 1.5, t);
        osc.frequency.exponentialRampToValueAtTime(f, t + 0.3);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.22, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
        osc.connect(g);
        g.connect(this.radio);
        osc.start(t);
        osc.stop(t + 0.52);
      }
      if (step % 2 === 0) this.radioNoise(t, 0.028, step % 4 === 0 ? 0.05 : 0.026, 7200);
      if (step % 8 === 4) this.radioNoise(t, 0.1, 0.09, 1500);
      if (step % 16 === 12) this.radioVoice('triangle', 440, t, 0.18, 0.05, 2400);
      if (step % 32 === 16) this.radioVoice('sawtooth', 329.6, t, 0.4, 0.025, 600);
    } else if (station.id === 'tidepool') {
      // Late beach chords with a soft electric-piano feel.
      const chords = [
        [293.7, 370, 440, 554.4],
        [370, 440, 554.4, 659.3],
        [246.9, 293.7, 370, 440],
        [392, 493.9, 587.3, 659.3],
      ];
      if (step % 16 === 0) {
        const chord = chords[Math.floor(step / 16) % 4];
        chord.forEach((f, i) => this.radioVoice('sine', f, t + i * 0.02, 3.2, 0.035, 1200));
      }
      if (step % 4 === 0) this.radioVoice('triangle', 73.4, t, 0.5, 0.05, 300);
      if (step % 8 === 2) this.radioNoise(t, 0.06, 0.024, 4800);
    }
  }
}
