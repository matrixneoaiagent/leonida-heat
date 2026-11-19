// Leonida Heat - procedural sound.
// Everything is synthesized at runtime with Web Audio: weapon reports,
// impacts, engines, tires, sirens, rain and an adaptive radio bed with three
// original stations. No samples, no network, no external libraries.

import { RADIO_STATIONS } from './config.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.sfx = null;
    this.radio = null;
    this.rainGain = null;
    this.initialized = false;
    this.muted = false;
    this.volume = 0.72;

    this.engineOsc = null;
    this.engineSub = null;
    this.engineFilter = null;
    this.engineGain = null;
    this.engineRunning = false;

    this.sirenOsc = null;
    this.sirenLfo = null;
    this.sirenLfoGain = null;
    this.sirenGain = null;
    this.sirenActive = false;

    this.tireSource = null;
    this.tireFilter = null;
    this.tireGain = null;

    this.noiseBuffer = null;
    this.stationIndex = 0;
    this.step = 0;
    this.nextNoteTime = 0;
    this.radioTimer = null;
    this.started = false;
    this.musicTension = 0;
    this.rainLevel = 0;
    this.lastSirenStar = 1;
  }

  stations() {
    return RADIO_STATIONS;
  }

  get currentStation() {
    return RADIO_STATIONS[this.stationIndex] || RADIO_STATIONS[0];
  }

  init() {
    if (this.initialized) {
      this.resume();
      return;
    }
    try {
      const Ctx = typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext) : null;
      if (!Ctx) return;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : this.volume;
      this.master.connect(this.ctx.destination);

      this.sfx = this.ctx.createGain();
      this.sfx.gain.value = 1;
      this.sfx.connect(this.master);

      this.radio = this.ctx.createGain();
      this.radio.gain.value = 0.55;
      this.radio.connect(this.master);

      this.noiseBuffer = this.makeNoise(1.2);
      this.setupEngine();
      this.setupSiren();
      this.setupTire();
      this.setupRain();
      this.initialized = true;
      this.started = true;
      this.nextNoteTime = this.ctx.currentTime + 0.08;
      this.radioTimer = setInterval(() => this.scheduleRadio(), 40);
      this.setStation(this.stationIndex);
      this.resume();
    } catch {
      this.initialized = false;
    }
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  toggleMute() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  setMuted(value) {
    this.muted = !!value;
    if (this.master && this.ctx) {
      this.master.gain.cancelScheduledValues(this.ctx.currentTime);
      this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, 0.03);
    }
  }

  makeNoise(seconds = 1) {
    const length = Math.max(1, Math.floor(this.ctx.sampleRate * seconds));
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i += 1) {
      const white = Math.random() * 2 - 1;
      last = last * 0.72 + white * 0.28;
      data[i] = last;
    }
    return buffer;
  }

  // -------------------------------------------------------------
  // Continuous voices
  // -------------------------------------------------------------
  setupEngine() {
    if (!this.ctx) return;
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 62;
    this.engineSub = this.ctx.createOscillator();
    this.engineSub.type = 'square';
    this.engineSub.frequency.value = 31;
    this.engineFilter = this.ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 280;
    this.engineFilter.Q.value = 1.4;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(this.engineFilter);
    this.engineSub.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.sfx);
    this.engineOsc.start();
    this.engineSub.start();
  }

  startEngine(note = 1) {
    if (!this.ctx || !this.engineGain) return;
    this.engineRunning = true;
    this.engineNote = note;
    const t = this.ctx.currentTime;
    this.engineGain.gain.cancelScheduledValues(t);
    this.engineGain.gain.setTargetAtTime(0.075, t, 0.06);
    this.engineOsc.frequency.setTargetAtTime(54 * note, t, 0.1);
    this.engineSub.frequency.setTargetAtTime(27 * note, t, 0.1);
  }

  stopEngine() {
    if (!this.ctx || !this.engineGain) return;
    this.engineRunning = false;
    const t = this.ctx.currentTime;
    this.engineGain.gain.setTargetAtTime(0.0001, t, 0.08);
  }

  updateEngine(speedRatio, accelerating, braking) {
    if (!this.ctx || !this.engineGain || !this.engineRunning) return;
    const ratio = clamp(speedRatio, 0, 1);
    const t = this.ctx.currentTime;
    const note = this.engineNote || 1;
    const target = (40 + ratio * 86 + (accelerating ? 12 : 0) - (braking ? 8 : 0)) * note;
    this.engineOsc.frequency.setTargetAtTime(target, t, 0.08);
    this.engineSub.frequency.setTargetAtTime(target * 0.5, t, 0.08);
    this.engineFilter.frequency.setTargetAtTime(220 + ratio * 900, t, 0.1);
    this.engineGain.gain.setTargetAtTime(0.05 + ratio * 0.06, t, 0.1);
  }

  setupSiren() {
    if (!this.ctx) return;
    this.sirenOsc = this.ctx.createOscillator();
    this.sirenOsc.type = 'triangle';
    this.sirenOsc.frequency.value = 560;
    this.sirenLfo = this.ctx.createOscillator();
    this.sirenLfo.type = 'sine';
    this.sirenLfo.frequency.value = 0.55;
    this.sirenLfoGain = this.ctx.createGain();
    this.sirenLfoGain.gain.value = 120;
    this.sirenLfo.connect(this.sirenLfoGain);
    this.sirenLfoGain.connect(this.sirenOsc.frequency);
    this.sirenGain = this.ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenOsc.connect(this.sirenGain);
    this.sirenGain.connect(this.sfx);
    this.sirenOsc.start();
    this.sirenLfo.start();
  }

  setPoliceSiren(active, stars = 1) {
    this.sirenActive = !!active;
    if (!this.ctx || !this.sirenGain || !this.sirenOsc) return;
    const t = this.ctx.currentTime;
    const level = active ? clamp(0.018 + stars * 0.011, 0.02, 0.085) : 0.0001;
    this.sirenGain.gain.setTargetAtTime(level, t, 0.3);
    this.sirenOsc.frequency.setTargetAtTime(440 + stars * 42, t, 0.3);
    if (active) this.lastSirenStar = stars;
  }

  setupTire() {
    if (!this.ctx) return;
    this.tireSource = this.ctx.createBufferSource();
    this.tireSource.buffer = this.noiseBuffer;
    this.tireSource.loop = true;
    this.tireFilter = this.ctx.createBiquadFilter();
    this.tireFilter.type = 'bandpass';
    this.tireFilter.frequency.value = 2100;
    this.tireFilter.Q.value = 5;
    this.tireGain = this.ctx.createGain();
    this.tireGain.gain.value = 0;
    this.tireSource.connect(this.tireFilter);
    this.tireFilter.connect(this.tireGain);
    this.tireGain.connect(this.sfx);
    this.tireSource.start();
  }

  setTireScreech(intensity) {
    if (!this.ctx || !this.tireGain) return;
    const t = this.ctx.currentTime;
    this.tireGain.gain.setTargetAtTime(clamp(intensity, 0, 1) * 0.1, t, 0.05);
    this.tireFilter.frequency.setTargetAtTime(1700 + intensity * 1400, t, 0.08);
  }

  setupRain() {
    if (!this.ctx) return;
    const source = this.ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    source.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1300;
    this.rainGain = this.ctx.createGain();
    this.rainGain.gain.value = 0;
    source.connect(filter);
    filter.connect(this.rainGain);
    this.rainGain.connect(this.sfx);
    source.start();
  }

  setRain(intensity) {
    this.rainLevel = intensity;
    if (!this.ctx || !this.rainGain) return;
    this.rainGain.gain.setTargetAtTime(clamp(intensity, 0, 1) * 0.075, this.ctx.currentTime, 0.6);
  }

  setMusicIntensity(value) {
    this.musicTension = clamp(value, 0, 3);
  }

  // -------------------------------------------------------------
  // One-shots
  // -------------------------------------------------------------
  envGain(vol, attack, decay) {
    const g = this.ctx.createGain();
    const t = this.ctx.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    return g;
  }

  noiseBurst(duration, vol, type = 'lowpass', freq = 1800, q = 1) {
    if (!this.ctx) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const gain = this.envGain(vol, 0.004, duration);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfx);
    const t = this.ctx.currentTime;
    src.start(t, Math.random() * 0.2);
    src.stop(t + duration + 0.03);
  }

  tone(freq, duration, vol, type = 'sine', slideTo = null, when = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + duration);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(g);
    g.connect(this.sfx);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  playGunshot(kind = 'pistol', volume = 1) {
    if (!this.ctx) return;
    const v = clamp(volume, 0, 1.5);
    const table = {
      pistol: [0.2, 0.55, 1700, 720],
      smg: [0.12, 0.42, 2400, 950],
      shotgun: [0.38, 0.72, 950, 410],
      rifle: [0.26, 0.62, 2000, 600],
    };
    const [dur, vol, hi, low] = table[kind] || table.pistol;
    this.noiseBurst(dur, vol * v, 'bandpass', hi, 0.8);
    this.tone(low, dur * 1.2, 0.16 * v, 'square', low * 0.4);
    this.tone(low * 2.2, dur * 0.5, 0.06 * v, 'sawtooth', low * 0.6);
  }

  playExplosion() {
    if (!this.ctx) return;
    this.noiseBurst(0.9, 0.88, 'lowpass', 700, 1);
    this.tone(62, 0.9, 0.32, 'sine', 24);
    this.tone(95, 0.5, 0.18, 'sawtooth', 30);
    this.noiseBurst(0.25, 0.45, 'highpass', 2200, 0.6);
  }

  playPunch() {
    this.tone(90, 0.11, 0.2, 'sine', 45);
    this.noiseBurst(0.07, 0.18, 'lowpass', 600, 1);
  }

  playReload() {
    this.noiseBurst(0.05, 0.1, 'highpass', 3200, 1);
    this.tone(540, 0.045, 0.05, 'square', 300);
    setTimeout(() => {
      this.noiseBurst(0.06, 0.12, 'highpass', 2600, 1);
      this.tone(380, 0.05, 0.06, 'square', 220);
    }, 180);
    setTimeout(() => this.tone(720, 0.05, 0.05, 'square', 520), 420);
  }

  playCash() {
    const notes = [880, 1174, 1568];
    notes.forEach((f, i) => this.tone(f, 0.12, 0.055, 'triangle', f * 1.02, i * 0.055));
    this.noiseBurst(0.08, 0.04, 'highpass', 5200, 1);
  }

  playPickup() {
    this.tone(660, 0.08, 0.06, 'triangle', 880);
    setTimeout(() => this.tone(990, 0.14, 0.055, 'triangle', 1320), 80);
  }

  playMissionPass() {
    const chords = [392, 493.9, 587.3, 784];
    chords.forEach((f, i) => this.tone(f, 0.55, 0.07, 'triangle', f, i * 0.11));
    setTimeout(() => {
      [523.3, 659.3, 784, 1046.5].forEach((f, i) => this.tone(f, 0.7, 0.06, 'sine', f, i * 0.08));
    }, 480);
  }

  playMissionFail() {
    [392, 349.2, 293.7, 220].forEach((f, i) => this.tone(f, 0.42, 0.075, 'sawtooth', f * 0.84, i * 0.2));
    this.tone(110, 1.1, 0.1, 'sine', 55, 0.5);
  }

  playHorn(volume = 1) {
    if (!this.ctx) return;
    const v = clamp(volume, 0, 1);
    this.tone(330, 0.42, 0.09 * v, 'square', 330);
    this.tone(412, 0.42, 0.075 * v, 'square', 412);
    this.tone(165, 0.42, 0.05 * v, 'sawtooth', 165);
  }

  playFootstep() {
    this.noiseBurst(0.05, 0.035 + Math.random() * 0.02, 'lowpass', 500 + Math.random() * 400, 0.9);
  }

  playHurt() {
    this.tone(180, 0.18, 0.1, 'sawtooth', 90);
    this.noiseBurst(0.12, 0.075, 'lowpass', 900, 0.8);
  }

  playImpact() {
    this.noiseBurst(0.09, 0.11, 'bandpass', 2400, 1.4);
    this.tone(160, 0.1, 0.06, 'square', 80);
  }

  playBodyFall() {
    this.tone(74, 0.22, 0.13, 'sine', 38);
    this.noiseBurst(0.18, 0.08, 'lowpass', 420, 0.9);
  }

  playHotwire() {
    this.noiseBurst(0.3, 0.08, 'bandpass', 1600, 2);
    this.tone(140, 0.18, 0.06, 'sawtooth', 95);
    setTimeout(() => this.noiseBurst(0.2, 0.06, 'bandpass', 2200, 2), 300);
    setTimeout(() => this.tone(420, 0.08, 0.04, 'square', 660), 520);
  }

  playSplash() {
    this.noiseBurst(0.35, 0.09, 'lowpass', 1100, 0.8);
    this.tone(220, 0.2, 0.03, 'sine', 120);
  }

  playScrape() {
    this.noiseBurst(0.2, 0.09, 'bandpass', 3200, 3);
  }

  playThunder() {
    this.noiseBurst(1.4, 0.5, 'lowpass', 500, 0.7);
    this.tone(48, 1.3, 0.18, 'sine', 22);
  }

  // -------------------------------------------------------------
  // Radio bed
  // -------------------------------------------------------------
  cycleStation() {
    this.setStation((this.stationIndex + 1) % RADIO_STATIONS.length);
    return this.currentStation;
  }

  setStation(index) {
    this.stationIndex = ((index % RADIO_STATIONS.length) + RADIO_STATIONS.length) % RADIO_STATIONS.length;
    const station = this.currentStation;
    if (!this.ctx || !this.radio) return;
    const t = this.ctx.currentTime;
    this.radio.gain.cancelScheduledValues(t);
    this.radio.gain.setTargetAtTime(station.id === 'off' ? 0.0001 : 0.52, t, 0.08);
    this.nextNoteTime = t + 0.12;
    this.step = 0;
    if (station.id !== 'off') {
      this.scheduleNoise(t, 0.09, 0.025, 3800);
      this.scheduleVoice('triangle', 660, t, 0.05, 0.018, 1200);
    }
  }

  scheduleRadio() {
    if (!this.ctx || !this.initialized || this.muted || this.currentStation.id === 'off') return;
    if (this.ctx.state !== 'running') return;
    const station = this.currentStation;
    const stepDur = 60 / Math.max(60, station.bpm) / 2;
    while (this.nextNoteTime < this.ctx.currentTime + 0.2) {
      this.scheduleStep(station, this.step, this.nextNoteTime, stepDur);
      this.step += 1;
      this.nextNoteTime += stepDur;
    }
  }

  scheduleStep(station, step, t, stepDur) {
    if (station.id === 'sunset') {
      const bass = [110, 110, 130.8, 146.8, 110, 110, 164.8, 146.8];
      const b = bass[step % 8];
      this.scheduleVoice('sawtooth', b, t, 0.16, 0.08, 520);
      if (step % 4 === 0) this.scheduleKick(t, 0.18);
      if (step % 8 === 4) this.scheduleNoise(t, 0.11, 0.07, 1800);
      if (step % 2 === 0) this.scheduleNoise(t, 0.03, 0.022, 6200);
      if (step % 32 === 0) {
        [220, 261.6, 329.6, 392].forEach((f) => this.scheduleVoice('triangle', f, t, 2.4, 0.025, 900));
      }
      if (this.musicTension >= 1 && step % 8 === 2) this.scheduleVoice('sawtooth', b * 2, t, 0.1, 0.022, 1400);
      if (this.musicTension >= 2 && step % 8 === 6) this.scheduleKick(t, 0.12);
    } else if (station.id === 'coral') {
      const subs = [55, 55, 61.7, 49];
      if (step % 16 === 0 || step % 16 === 7) {
        const f = subs[Math.floor(step / 16) % subs.length];
        this.schedule808(f, t, 0.5, 0.19);
      }
      if (step % 2 === 0) this.scheduleNoise(t, 0.026, step % 4 === 0 ? 0.04 : 0.022, 7200);
      if (step % 8 === 4) this.scheduleNoise(t, 0.1, 0.07, 1500);
      if (step % 16 === 12) this.scheduleVoice('triangle', 440, t, 0.18, 0.04, 2400);
      if (step % 32 === 16) this.scheduleVoice('sawtooth', 329.6, t, 0.4, 0.022, 600);
      if (this.musicTension >= 1 && step % 4 === 2) this.scheduleVoice('square', 220, t, 0.08, 0.014, 1800);
      if (this.musicTension >= 2 && step % 16 === 8) this.scheduleKick(t, 0.15);
    } else if (station.id === 'tidepool') {
      const chords = [
        [293.7, 370, 440, 554.4],
        [370, 440, 554.4, 659.3],
        [246.9, 293.7, 370, 440],
        [392, 493.9, 587.3, 659.3],
      ];
      if (step % 16 === 0) {
        const chord = chords[Math.floor(step / 16) % 4];
        chord.forEach((f, i) => this.scheduleVoice('sine', f, t + i * 0.02, 3.2, 0.03, 1200));
      }
      if (step % 4 === 0) this.scheduleVoice('triangle', 73.4, t, 0.5, 0.045, 300);
      if (step % 8 === 2) this.scheduleNoise(t, 0.06, 0.02, 4800);
      if (this.musicTension >= 1 && step % 8 === 6) this.scheduleVoice('triangle', 587.3, t, 0.3, 0.018, 2200);
      if (this.musicTension >= 2 && step % 16 === 0) this.scheduleNoise(t, 0.35, 0.035, 900);
    }
    void stepDur;
  }

  scheduleVoice(type, freq, start, duration, vol, filterFreq = 1800) {
    if (!this.ctx || !this.radio) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.radio);
    osc.start(start);
    osc.stop(start + duration + 0.03);
  }

  scheduleNoise(start, duration, vol, filterFreq) {
    if (!this.ctx || !this.radio) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(Math.max(0.0002, vol), start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.radio);
    src.start(start, Math.random() * 0.2);
    src.stop(start + duration + 0.02);
  }

  scheduleKick(start, vol) {
    if (!this.ctx || !this.radio) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, start);
    osc.frequency.exponentialRampToValueAtTime(42, start + 0.16);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.22);
    osc.connect(gain);
    gain.connect(this.radio);
    osc.start(start);
    osc.stop(start + 0.24);
  }

  schedule808(freq, start, duration, vol) {
    if (!this.ctx || !this.radio) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq * 1.5, start);
    osc.frequency.exponentialRampToValueAtTime(freq, start + 0.3);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain);
    gain.connect(this.radio);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }

  playSirenChirp(stars = 1) {
    if (!this.ctx) return;
    this.tone(520 + stars * 40, 0.18, 0.05, 'triangle', 760 + stars * 40);
    this.tone(600 + stars * 30, 0.16, 0.035, 'square', 460, 0.2);
  }

  playDoor() {
    this.noiseBurst(0.09, 0.08, 'bandpass', 900, 2);
    this.tone(120, 0.12, 0.05, 'square', 70);
  }

  dispose() {
    if (this.radioTimer) clearInterval(this.radioTimer);
    this.radioTimer = null;
    if (this.ctx) {
      try {
        this.ctx.close();
      } catch {
        // Closing an already-closed context is harmless.
      }
    }
    this.ctx = null;
    this.initialized = false;
  }

}
