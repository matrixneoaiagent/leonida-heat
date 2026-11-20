// Leonida Heat v5 - adaptive procedural soundtrack.
//
// Four invented stations, each with its own scale, tempo, bass shape and pad
// colour. Layers enter with the heat level, station changes crossfade over a
// second and a half, and `pulse` exposes the beat envelope for the HUD meter.
// Everything is synthesized from the game's existing Web Audio context; there
// are no samples, files or network requests.

const TAU = Math.PI * 2;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

const STATIONS = [
  {
    id: 'sunset',
    root: 110,
    tempo: 108,
    scale: [0, 2, 3, 5, 7, 8, 10],
    pad: 'sawtooth',
    bass: 'triangle',
    lead: 'triangle',
    swing: 0.06,
    level: 0.13,
  },
  {
    id: 'coral',
    root: 82.41,
    tempo: 138,
    scale: [0, 3, 5, 6, 7, 10],
    pad: 'square',
    bass: 'sawtooth',
    lead: 'square',
    swing: 0,
    level: 0.10,
  },
  {
    id: 'tidepool',
    root: 130.81,
    tempo: 76,
    scale: [0, 2, 4, 7, 9, 11],
    pad: 'sine',
    bass: 'sine',
    lead: 'triangle',
    swing: 0.12,
    level: 0.15,
  },
  {
    id: 'off',
    root: 0,
    tempo: 0,
    scale: [0],
    pad: 'sine',
    bass: 'sine',
    lead: 'sine',
    swing: 0,
    level: 0,
  },
];

const freq = (root, semitone) => root * Math.pow(2, semitone / 12);

export class AdaptiveMusic {
  constructor(audio) {
    this.audio = audio || null;
    this.ctx = null;
    this.master = null;
    this.buses = [];
    this.stationIndex = 0;
    this.nextTime = 0;
    this.step = 0;
    this.beat = 0;
    this.bar = 0;
    this.pulse = 0;
    this.level = 0;
    this.intensity = 0;
    this.targetIntensity = 0;
    this.playing = false;
    this.crossfade = 1;
    this.attached = false;
    this._station = null;
    this._lastPulse = 0;
    this._noise = null;
  }

  // Called once when the audio context exists. We take over the radio bus: the
  // older oscillator scheduler is silenced and this module supplies the music.
  attach() {
    const audio = this.audio;
    if (!audio || !audio.ctx || !audio.radio || this.attached) return false;
    this.ctx = audio.ctx;
    audio.externalMusic = true;
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.0001;
    this.master.connect(audio.radio);
    for (let i = 0; i < 4; i += 1) {
      const bus = this.ctx.createGain();
      bus.gain.value = 0.0001;
      bus.connect(this.master);
      this.buses.push(bus);
    }
    this._noise = this.makeNoise(1.2);
    this.master.gain.setTargetAtTime(1, this.ctx.currentTime, 0.25);
    this.attached = true;
    this.playing = true;
    this.stationIndex = clamp(audio.stationIndex || 0, 0, 3);
    this.setStation(this.stationIndex, true);
    this.nextTime = this.ctx.currentTime + 0.06;
    return true;
  }

  makeNoise(seconds) {
    if (!this.ctx) return null;
    const length = Math.max(1, Math.floor(this.ctx.sampleRate * seconds));
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i += 1) {
      const white = Math.random() * 2 - 1;
      last = last * 0.82 + white * 0.18;
      data[i] = last;
    }
    return buffer;
  }

  setStation(index, immediate = false) {
    const next = clamp(index, 0, 3);
    if (next === this.stationIndex && this._station) return;
    const now = this.ctx?.currentTime || 0;
    this.stationIndex = next;
    this._station = STATIONS[next];
    this.step = 0;
    this.beat = 0;
    this.bar = 0;
    this.nextTime = now + 0.08;
    if (!this.ctx || !this.attached) return;
    const fade = immediate ? 0.06 : 1.45;
    for (let i = 0; i < this.buses.length; i += 1) {
      const bus = this.buses[i];
      bus.gain.cancelScheduledValues(now);
      bus.gain.setTargetAtTime(i === next ? 1 : 0.0001, now, fade / 3);
    }
    if (next === 3) {
      // Radio off: let the pads fade, no new notes are scheduled.
      this.nextTime = now + fade;
    }
  }

  setIntensity(value) {
    this.targetIntensity = clamp(Math.round(value), 0, 4);
  }

  update(dt, game) {
    const audio = this.audio;
    if (!audio || !audio.initialized) return;
    if (!this.attached && !this.attach()) return;
    if (audio.stationIndex !== this.stationIndex) this.setStation(audio.stationIndex);
    this.intensity += (this.targetIntensity - this.intensity) * Math.min(1, dt * 2.2);
    this.pulse = Math.max(0, this.pulse - dt * 3.4);
    this._lastPulse += dt;
    if (this.pulse < 0.02) this.pulse = 0;

    const station = this._station;
    if (!station || station.id === 'off' || audio.muted) return;
    if (audio.ctx.state !== 'running') return;
    if (audio.externalMusic !== true) return;
    if (this.nextTime < audio.ctx.currentTime) this.nextTime = audio.ctx.currentTime + 0.05;

    const stepDur = 60 / station.tempo / 2;
    const horizon = audio.ctx.currentTime + 0.18;
    let guard = 0;
    while (this.nextTime < horizon && guard < 16) {
      this.scheduleStep(station, this.step, this.nextTime, stepDur);
      this.nextTime += stepDur;
      this.step += 1;
      guard += 1;
    }
    void game;
  }

  scheduleStep(station, step, time, stepDur) {
    const bus = this.buses[this.stationIndex];
    if (!bus) return;
    const swing = station.swing ? (step % 2 === 0 ? station.swing : -station.swing) * stepDur * 0.5 : 0;
    const t = Math.max(this.ctx.currentTime, time + swing);
    const degree = step % station.scale.length;
    const octave = Math.floor(step / station.scale.length) % 3;
    const intensity = this.intensity;
    const beat = Math.floor(step / 2);
    if (step % 2 === 0) {
      this.beat = beat;
      this.bar = Math.floor(beat / 4);
      this.pulse = 1;
      this.level = 0.35 + intensity * 0.12;
    } else {
      this.pulse = Math.max(this.pulse, 0.34);
    }

    // Pad chord every bar. Always present: the city needs a bed.
    if (step % 8 === 0) {
      const root = freq(station.root, station.scale[0]) / 2;
      const chord = [0, 2, 4].map((i) => freq(root * 2, station.scale[(degree + i * 2) % station.scale.length]));
      for (const f of chord) this.voice(station.pad, f / 2, t, stepDur * 7.2, 0.026, 700, bus);
    }

    // Bass walks on the off-beats once the heat rises.
    if (intensity >= 1 && step % 2 === 0) {
      const f = freq(station.root, station.scale[(degree + 4) % station.scale.length]) / 2;
      this.voice(station.bass, f, t, stepDur * 1.7, 0.085, 260, bus);
    }

    // Kick and snare.
    if (intensity >= 2 && step % 4 === 0) this.kick(t, 0.22, bus);
    if (intensity >= 2 && step % 8 === 4) this.noiseHit(t, 0.05, 0.16, 2200, bus);
    if (intensity >= 3 && step % 2 === 1) this.noiseHit(t, 0.018, 0.08, 6400, bus);

    // Lead motif enters at three stars.
    if (intensity >= 3 && step % 4 === 2) {
      const f = freq(station.root * 2, station.scale[(degree + octave * 2) % station.scale.length]);
      this.voice(station.lead, f, t, stepDur * 1.4, 0.03, 2800, bus);
    }

    // A high shimmer at full heat.
    if (intensity >= 4 && step % 16 === 14) {
      const f = freq(station.root * 4, station.scale[(degree + 3) % station.scale.length]);
      this.voice('sine', f, t, stepDur * 3.2, 0.022, 4200, bus);
    }
  }

  voice(type, frequency, time, duration, gainValue, cutoff, bus) {
    if (!this.ctx || frequency <= 0) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = frequency;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    filter.Q.value = 0.8;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, gainValue), time + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(bus);
    osc.start(time);
    osc.stop(time + duration + 0.03);
  }

  kick(time, level, bus) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(92, time);
    osc.frequency.exponentialRampToValueAtTime(42, time + 0.18);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(level, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.24);
    osc.connect(gain);
    gain.connect(bus);
    osc.start(time);
    osc.stop(time + 0.26);
  }

  noiseHit(time, duration, level, cutoff, bus) {
    if (!this.ctx || !this._noise) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this._noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = cutoff;
    filter.Q.value = 0.9;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(level, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(bus);
    src.start(time);
    src.stop(time + duration + 0.02);
  }

  dispose() {
    this.playing = false;
    if (this.audio) this.audio.externalMusic = false;
    if (this.master) {
      try { this.master.disconnect(); } catch { /* already gone */ }
    }
    this.attached = false;
    this.buses = [];
  }
}

export { STATIONS, TAU };
