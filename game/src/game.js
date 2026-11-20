// Leonida Heat v4 - the game director.
//
// One fixed-step loop drives a table of mode handlers. The director owns the
// world build (seeded city, traffic, people, police, jobs, pickups), a spring
// camera with speed lead and aim offset, a continuous 24-hour clock, a weather
// front that eases between states, the interaction resolver, the crime and
// mission callback flow, autosave/respawn, and the photo-mode side trip.
//
// Modes: title, controls, playing, dialogue, paused, missionComplete,
// missionFailed, wasted, busted, photo, ending. External systems (missions,
// shots, the test harness) may still set game.state directly; the handler table
// picks the new mode up on the next tick.

import {
  TIME_OF_DAY, STEP, VEHICLE_TYPES, WANTED_CONFIG, GAME_TITLE, DISTRICTS, districtAt,
  WEATHER_CONFIG, ECONOMY, STUNT_CONFIG, GARAGE_CONFIG, COLLECTIBLE_CONFIG,
} from './config.js';
import { CityWorld } from './city.js';
import { ParticleSystem, Player, Vehicle } from './entities.js';
import { TrafficManager } from './traffic.js';
import { PoliceManager } from './police.js';
import { CombatManager } from './combat.js';
import { MissionManager } from './missions.js';
import { PickupManager, CollectibleManager } from './pickups.js';
import { InputManager } from './input.js';
import { SoundEngine } from './audio.js';
import { HUD } from './hud.js';
import { Renderer } from './renderer.js';
import { saveGame as persistSave, loadGame as readSave, hasSave, saveSummary } from './save.js';
import { mulberry32, seedFrom, pick } from './rng.js';

const WORLD_SIZE = 3200;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, t) => a + (b - a) * t;

const PLAY_MODES = new Set(['playing', 'dialogue', 'photo']);
const HUD_MODES = new Set(['playing', 'dialogue', 'paused', 'missionComplete', 'missionFailed', 'wasted', 'busted']);
const MENU_MODES = new Set(['title', 'paused', 'missionFailed', 'ending']);

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.input = new InputManager(canvas);
    this.audio = new SoundEngine();
    this.ui = new HUD();
    this.renderer = new Renderer(canvas);

    this.state = 'title';
    this.stateTimer = 0;
    this.stateDuration = 0;
    this.worldTime = 0;
    this.sessionTime = 0;
    this.timeOfDay = TIME_OF_DAY.start;
    this.todBase = TIME_OF_DAY.start;

    this.camera = {
      x: 2540, y: 1240, zoom: 1.9, baseZoom: 1.9, shake: 0,
      leadX: 0, leadY: 0, aiming: false,
    };
    this.lastFrame = 0;
    this.accumulator = 0;
    this.running = false;
    this.frameTimes = [];

    this.shotFrozen = false;
    this.shotStaging = false;
    this.shotReady = false;
    this.bustedTriggered = false;
    this.wastedTriggered = false;
    this.missionComplete = null;
    this.missionFailed = null;
    this.pendingFail = null;
    this.saveNotice = 0;
    this.prompt = '';
    this.dialogueQueue = [];
    this.dialogueIndex = 0;
    this.dialogueTotal = 0;
    this.dialogueReturn = 'playing';
    this.controlsReturn = 'title';

    this.titleAnchor = { x: 2530, y: 1280 };
    this.titleDrift = 0;
    this.crimeCooldown = 0;
    this.districtId = null;

    this.seed = 2026;
    this.rng = mulberry32(this.seed);
    this.weatherRng = mulberry32(this.seed ^ 0x51ed270b);
    this.weather = this.freshWeather('clear', 0);
    this.simulate = null;
    this.handle = null;

    this.stunt = null;
    this.stuntsCount = 0;
    this.bestStunt = 0;
    this.stuntCash = 0;
    this.lastVehicle = null;
    this.stats = { kills: 0, crimes: 0, jobs: 0, photos: 0 };

    this.photoCount = 0;
    this.photo = { x: 2540, y: 1240, zoom: 1.9, photos: 0, flash: 0 };

    this.modes = {
      title: (dt) => this.modeTitle(dt),
      controls: (dt) => this.modeControls(dt),
      playing: (dt) => this.modePlaying(dt),
      dialogue: (dt) => this.modeDialogue(dt),
      paused: (dt) => this.modePaused(dt),
      missionComplete: (dt) => this.modeMissionComplete(dt),
      missionFailed: (dt) => this.modeMissionFailed(dt),
      wasted: (dt) => this.modeFate(dt),
      busted: (dt) => this.modeFate(dt),
      photo: (dt) => this.modePhoto(dt),
      ending: (dt) => this.modeEnding(dt),
    };

    this.buildWorld(this.seed, true);
    this.startTitle();
  }

  // =================================================================
  // World construction
  // =================================================================
  freshWeather(type, intensity) {
    return {
      type,
      intensity,
      targetIntensity: intensity,
      wetness: 0,
      wind: 0.32,
      targetWind: 0.32,
      windPhase: 0,
      gust: 0,
      flash: 0,
      timer: 70,
      next: type,
      front: 0,
    };
  }

  buildWorld(seed, title = false) {
    this.seed = seed >>> 0;
    this.city = new CityWorld(this.seed);
    this.rng = mulberry32(this.seed ^ 0x9e3779b9);
    this.particles = new ParticleSystem();
    this.player = new Player(2530, 1180);
    this.player.angle = 0;
    this.player.money = ECONOMY.startingCash;
    this.player.score = 0;
    this.player.grenades = 2;
    this.traffic = new TrafficManager(this.city, this.rng);
    this.police = new PoliceManager(this.city, this.rng);
    this.combat = new CombatManager(this.city);
    this.combat.setPedestrianRng(this.rng);
    this.pickups = new PickupManager(this.city);
    this.collectibles = new CollectibleManager(this.city);
    this.missions = new MissionManager(this.city, this);
    this.missions.currentIndex = 0;
    this.missions.active = false;

    this.bustedTriggered = false;
    this.wastedTriggered = false;
    this.missionComplete = null;
    this.missionFailed = null;
    this.pendingFail = null;
    this.districtId = null;
    this.worldTime = 0;
    this.sessionTime = 0;
    this.timeOfDay = TIME_OF_DAY.start;
    this.todBase = TIME_OF_DAY.start;
    this.crimeCooldown = 0;
    this.stunt = null;
    this.stuntsCount = 0;
    this.bestStunt = 0;
    this.stuntCash = 0;
    this.lastVehicle = null;
    this.dialogueQueue = [];
    this.dialogueIndex = 0;
    this.dialogueTotal = 0;
    this.photosThisRun = 0;
    this.photoCount = 0;
    this.photo = { x: 0, y: 0, zoom: 1.9, photos: 0, flash: 0 };
    this.stats = { kills: 0, crimes: 0, jobs: 0, photos: 0 };

    this.weatherRng = mulberry32((this.seed ^ 0x51ed270b) >>> 0);
    this.weather = this.freshWeather('clear', 0);
    this.weather.wind = 0.24 + this.weatherRng() * 0.42;
    this.weather.targetWind = this.weather.wind;
    this.weather.timer = 60 + this.weatherRng() * 50;
    this.weather.next = pick(this.weatherRng, WEATHER_CONFIG.types);

    if (title) {
      this.traffic.seed(2360, 1320, 28, 22);
      this.combat.populate(2400, 1300, 50, 900);
      this.camera.x = 2260;
      this.camera.y = 1280;
      this.camera.zoom = 1.9;
      this.camera.baseZoom = 1.9;
      this.titleAnchor = { x: 2260, y: 1280 };
    } else {
      this.traffic.seed(this.player.x, this.player.y, 20, 20);
      this.combat.populate(this.player.x, this.player.y, 44, 900);
      this.camera.x = this.player.x + 80;
      this.camera.y = this.player.y;
      this.camera.zoom = 2.02;
      this.camera.baseZoom = 2.02;
      this.ui.setDistrict('Coral Strip', 'Beachfront & Neon Boardwalk');
    }
    this.camera.shake = 0;

    this.ui.displayedMoney = this.player.money;
    this.ui.displayedHealth = this.player.health;
    this.ui.displayedArmor = this.player.armor;
    this.ui.healthGhost = this.player.health;
    this.ui.armorGhost = this.player.armor;
    this.ui.toasts = [];
    this.ui.dialog = null;
    this.ui.banner = null;
    this.ui.objectiveHint = '';
    this.ui.menuIndex = 0;
    this.ui.prompt = '';
    this.ui.photoFlash = 0;
    this.audio.setRain(0);
    this.audio.setWind(this.weather.wind);
    this.audio.setMusicIntensity(0);
  }

  hasSaveFile() {
    return hasSave();
  }

  saveSummary() {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (this.summaryCache !== undefined && now - (this.summaryAt || 0) < 2500) return this.summaryCache;
    this.summaryCache = saveSummary();
    this.summaryAt = now;
    return this.summaryCache;
  }

  // =================================================================
  // State machine
  // =================================================================
  enterMode(next, meta = {}) {
    this.state = next;
    this.stateTimer = 0;
    if (meta.duration !== undefined) this.stateDuration = meta.duration;
    this.ui.menuIndex = 0;
    if (next !== 'playing' && next !== 'dialogue' && next !== 'photo') {
      this.prompt = '';
      this.ui.prompt = '';
    }
    if (next === 'paused') this.audio.setTireScreech(0);
    if (next === 'photo') {
      this.audio.setTireScreech(0);
      this.audio.stopEngine();
    }
  }

  startTitle(seed = null) {
    if (seed !== null) this.buildWorld(seed, true);
    this.enterMode('title');
    this.ui.dialog = null;
    this.ui.banner = null;
    this.ui.toasts = [];
    this.ui.prompt = '';
    this.titleAnchor = { x: this.camera.x, y: this.camera.y };
    this.titleDrift = 0;
    this.audio.stationIndex = 0;
    this.audio.setMusicIntensity(0);
    this.audio.setPoliceSiren(false, 0);
    this.audio.stopEngine();
  }

  newGame(seed = null) {
    const chosen = seed === null
      ? (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0
      : seed >>> 0;
    this.buildWorld(chosen, false);
    this.enterMode('playing');
    this.ui.displayedMoney = this.player.money;
    this.ui.setDistrict('Coral Strip', 'Beachfront & Neon Boardwalk');
    this.camera.x = this.player.x;
    this.camera.y = this.player.y;
    this.input.updateWorldMouse(this.camera);
    if (this.input.anyGesture) {
      if (!this.audio.initialized) this.audio.init();
      else this.audio.resume();
      this.audio.setStation(0);
      this.audio.setMuted(false);
    }
    this.saveNotice = 0;
    this.ui.showToast('Costa Sol. Warm air, cold money. Find the gold marker.', 'neutral', 4);
    this.autosave();
  }

  loadSave(silent = false) {
    const data = readSave();
    if (!data) {
      if (!silent) this.ui.showToast('No save found.', 'warning', 2);
      return false;
    }
    this.buildWorld(data.seed || 1, false);
    const saved = data.player || {};
    const p = this.player;
    p.x = saved.x ?? 2530;
    p.y = saved.y ?? 1180;
    p.angle = saved.angle ?? 0;
    p.health = saved.health ?? 100;
    p.armor = saved.armor ?? 25;
    p.money = saved.money ?? ECONOMY.startingCash;
    p.score = saved.score ?? 0;
    p.grenades = saved.grenades ?? 2;
    p.currentWeaponIndex = clamp(saved.weaponIndex ?? 1, 0, 4);
    if (saved.ammo) {
      for (const key of Object.keys(p.ammo)) {
        if (saved.ammo[key]) p.ammo[key] = { ...p.ammo[key], ...saved.ammo[key] };
      }
    }
    this.timeOfDay = data.timeOfDay ?? TIME_OF_DAY.start;
    this.todBase = this.timeOfDay;
    this.sessionTime = 0;
    if (data.weather) {
      this.weather = { ...this.weather, ...data.weather, flash: 0 };
      this.weather.targetIntensity = WEATHER_CONFIG.rainIntensity[this.weather.type] || 0;
      this.weather.targetWind = this.weather.wind;
    }
    this.collectibles.restore(data.collectibles?.found || [], data.collectibles?.rewarded);
    this.stuntsCount = data.stunts?.count ?? 0;
    this.bestStunt = data.stunts?.best ?? 0;
    this.stuntCash = data.stunts?.cash ?? 0;
    this.stats = { kills: 0, crimes: 0, jobs: 0, photos: 0, ...(data.stats || {}) };
    this.photoCount = this.stats.photos || 0;
    const missions = data.missions || {};
    this.missions.currentIndex = clamp(missions.currentIndex ?? 0, 0, 4);
    this.missions.completedCount = missions.completedCount ?? 0;
    this.missions.checkpointStep = missions.checkpoint ?? missions.stepIndex ?? 0;
    if (missions.active && this.missions.currentIndex < this.missions.defs.length) {
      this.missions.resume(this.missions.currentIndex, missions.stepIndex ?? 0);
    }
    this.police.setWanted(data.wanted || 0);
    this.audio.setMuted(!!data.settings?.muted);
    this.audio.setStation(data.settings?.station ?? 0);

    this.traffic.seed(this.player.x, this.player.y, 20, 20);
    this.combat.populate(this.player.x, this.player.y, 44, 900);
    this.enterMode('playing');
    this.ui.displayedMoney = p.money;
    this.ui.displayedHealth = p.health;
    this.ui.displayedArmor = p.armor;
    this.ui.healthGhost = p.health;
    this.ui.armorGhost = p.armor;
    this.camera.x = p.x;
    this.camera.y = p.y;
    this.camera.zoom = 2.02;
    this.input.updateWorldMouse(this.camera);
    this.ui.setDistrict('Costa Sol', 'Welcome back');
    this.ui.showToast('Save loaded. The city kept your seat warm.', 'success', 3);
    this.summaryCache = undefined;
    return true;
  }

  autosave() {
    if (this.shotFrozen || this.shotStaging) return;
    const p = this.player;
    if (!p) return;
    const ok = persistSave({
      version: 3,
      seed: this.seed,
      timeOfDay: this.timeOfDay,
      weather: { ...this.weather, flash: 0 },
      player: {
        x: p.x, y: p.y, angle: p.angle,
        health: p.health, armor: p.armor, money: p.money, score: p.score,
        weaponIndex: p.currentWeaponIndex,
        grenades: p.grenades,
        ammo: {
          pistol: { ...p.ammo.pistol },
          smg: { ...p.ammo.smg },
          shotgun: { ...p.ammo.shotgun },
          rifle: { ...p.ammo.rifle },
        },
      },
      wanted: this.police.wantedStars,
      missions: {
        currentIndex: this.missions.currentIndex,
        completedCount: this.missions.completedCount,
        active: this.missions.active,
        stepIndex: this.missions.active ? this.missions.stepIndex : 0,
        checkpoint: this.missions.checkpointStep,
      },
      settings: { muted: this.audio.muted, station: this.audio.stationIndex },
      collectibles: {
        found: this.collectibles.foundIds(),
        count: this.collectibles.foundCount,
        rewarded: this.collectibles.rewarded,
      },
      stunts: { best: this.bestStunt, count: this.stuntsCount, cash: this.stuntCash },
      stats: { ...this.stats, photos: this.photoCount },
      flags: { endingSeen: this.missions.completedCount >= 5 },
    });
    if (ok) this.saveNotice = 2.2;
    this.summaryCache = undefined;
  }

  // =================================================================
  // Frame loop
  // =================================================================
  start() {
    this.running = true;
    this.lastFrame = performance.now();
    requestAnimationFrame((ts) => this.frame(ts));
  }

  frame(timestamp) {
    if (!this.running) return;
    const dt = Math.min(0.1, Math.max(0, (timestamp - this.lastFrame) / 1000));
    this.lastFrame = timestamp;
    if (this.frameTimes.length > 240) this.frameTimes.shift();
    this.frameTimes.push(dt);
    if (!this.shotFrozen) {
      this.accumulator += dt;
      let steps = 0;
      while (this.accumulator >= STEP && steps < 6) {
        this.update(STEP);
        this.accumulator -= STEP;
        steps += 1;
      }
      if (steps >= 6) this.accumulator = 0;
    }
    this.render();
    this.input.endFrame();
    requestAnimationFrame((ts) => this.frame(ts));
  }

  update(dt) {
    if (this.input.anyGesture) {
      if (!this.audio.initialized) {
        this.audio.init();
        this.audio.setStation(this.audio.stationIndex);
        this.ui.radioVisible = 2.6;
      } else if (this.audio.ctx && this.audio.ctx.state === 'suspended') {
        this.audio.resume();
      }
    }

    this.worldTime += dt;
    this.sessionTime += dt;
    this.crimeCooldown = Math.max(0, this.crimeCooldown - dt);
    this.updateClock();

    // Global keys.
    if (this.state !== 'photo') {
      if (this.input.mute) {
        this.consumePress('KeyM');
        this.audio.toggleMute();
        this.ui.mutedNotice = 1.8;
      }
      if (this.input.radio) {
        this.consumePress('KeyQ');
        const station = this.audio.cycleStation();
        this.ui.radioVisible = 3.2;
        this.ui.showToast(`Radio: ${station.name}`, 'neutral', 2.2);
      }
      if (this.input.mapToggle) {
        this.consumePress('KeyT');
        this.ui.showToast(`Clock ${this.clockLabel()} · ${WEATHER_CONFIG.labels[this.weather.type]} · minimap is always live`, 'neutral', 2.4);
      }
    }

    if (this.state === 'playing' && this.input.cameraZoom) {
      this.consumePress('KeyZ');
      this.enterPhoto();
    }

    if (PLAY_MODES.has(this.state) || MENU_MODES.has(this.state) || HUD_MODES.has(this.state)) {
      this.input.updateWorldMouse(this.camera);
    }

    const handler = this.modes[this.state];
    if (handler) handler(dt);

    if (['playing', 'dialogue', 'title', 'ending', 'missionComplete'].includes(this.state)) {
      this.updateWeather(dt);
    }
    this.updateCamera(dt);
    this.ui.update(dt, this);
    this.updateDistrict();

    if (this.state === 'playing' || this.state === 'dialogue') {
      this.prompt = this.computePrompt();
      this.ui.prompt = this.prompt;
    } else if (this.state !== 'photo') {
      this.prompt = '';
      this.ui.prompt = '';
    }
  }

  // =================================================================
  // Mode handlers
  // =================================================================
  modeTitle(dt) {
    this.titleDrift += dt * 0.12;
    this.city.update(dt, this.worldTime);
    this.traffic.update(dt, this.player, this.particles, this.audio, this.police, this);
    for (const ped of this.combat.pedestrians) ped.update(dt, this.city, this.particles);
    this.particles.update(dt);
    this.handleMenuInput();
  }

  modeControls(dt) {
    this.updateAmbient(dt);
    this.handleControlsInput();
  }

  modePlaying(dt) {
    if (this.input.pause) {
      this.consumePress('Escape', 'KeyP');
      this.enterMode('paused');
      return;
    }
    this.city.update(dt, this.worldTime);
    this.tickHotwire(dt);

    const p = this.player;
    if (p.isInVehicle && !p.hotwire) {
      this.drivePlayer(dt);
    } else if (!p.hotwire) {
      p.update(dt, this.input, this.city, this.particles, this.audio);

      const slot = this.input.weaponSlot;
      if (slot >= 0) p.setWeapon(slot);
      if (this.input.cycleWeapon !== 0) {
        p.cycleWeapon(this.input.cycleWeapon);
        this.input.mouse.wheel = 0;
      }
      if (this.input.reload) p.reload(this.audio);
      if (this.input.grenade) {
        this.consumePress('KeyG');
        this.throwFrag();
      }
      if (this.input.mouse.down) this.combat.handlePlayerAttack(p, this.input, this.police, this.particles, this.audio, this);
      if (this.input.enterVehicle) this.interact();
      if (this.state !== 'playing') return;
    }

    this.missions.update(dt, p);
    this.traffic.update(dt, p, this.particles, this.audio, this.police, this);
    this.police.update(dt, p, this.particles, this.audio, this);
    this.combat.update(dt, p, this.traffic, this.police, this.particles, this.audio, this);
    this.pickups.update(dt, p, this);
    this.collectibles.update(dt, p, this);
    this.resolveCarContacts();
    this.updateStunt(dt);
    this.particles.update(dt);
    this.updateHeatMusic();

    if (p.isInVehicle && p.vehicle) {
      const v = p.vehicle;
      const ratio = Math.min(1, Math.abs(v.speed) / (v.config.topSpeed || 1));
      const gear = 1 + Math.floor(ratio * 4);
      this.audio.updateEngine(ratio, this.input.forward, this.input.backward, gear);
      this.audio.setTireScreech(v.skidIntensity);
      if (v.isDestroyed) this.traffic.exitVehicle(p, this.city, this.audio, this.ui);
    } else {
      this.audio.setTireScreech(0);
      this.audio.stopEngine();
    }

    if (p.health <= 0 && this.state === 'playing') this.onWasted();
  }

  modeDialogue(dt) {
    this.stateTimer += dt;
    this.updateAmbientFrozen(dt);
    const advance = this.input.confirm || this.input.mouse.clicked || this.input.wasPressed('KeyE');
    if (this.stateTimer > 0.35 && advance) this.dismissDialog();
    else if (this.stateTimer > 12) this.dismissDialog();
  }

  modePaused(dt) {
    this.saveNotice = Math.max(0, this.saveNotice - dt);
    this.handlePauseInput(dt);
  }

  modeMissionComplete(dt) {
    this.stateTimer += dt;
    this.updateAmbientFrozen(dt);
    if (this.input.confirm || this.input.mouse.clicked) this.continueAfterMission();
    else if (this.stateTimer > 9) this.continueAfterMission();
  }

  modeMissionFailed(dt) {
    this.updateAmbientFrozen(dt);
    this.handleMissionFailedInput();
  }

  modeFate(dt) {
    this.stateTimer += dt;
    this.updateAmbientFrozen(dt);
    if (this.stateTimer >= this.stateDuration) this.finishRespawn();
  }

  modeEnding(dt) {
    this.updateAmbient(dt);
    this.handleEndingInput(dt);
  }

  modePhoto(dt) {
    const photo = this.photo;
    photo.cooldown = Math.max(0, (photo.cooldown || 0) - dt);
    const speed = (460 / Math.max(0.8, photo.zoom)) * dt;
    let dx = 0;
    let dy = 0;
    if (this.input.forward) dy -= 1;
    if (this.input.backward) dy += 1;
    if (this.input.left) dx -= 1;
    if (this.input.right) dx += 1;
    if (dx || dy) {
      const len = Math.hypot(dx, dy) || 1;
      photo.x += (dx / len) * speed;
      photo.y += (dy / len) * speed;
    }
    if (this.input.mouse.wheel) {
      photo.zoom = clamp(photo.zoom + this.input.mouse.wheel * 0.15, 0.85, 3.4);
      this.input.mouse.wheel = 0;
    }
    photo.x = clamp(photo.x, -120, WORLD_SIZE + 120);
    photo.y = clamp(photo.y, -120, WORLD_SIZE + 120);
    photo.flash = Math.max(0, photo.flash - dt * 2.6);

    if ((this.input.confirm || this.input.mouse.clicked) && photo.cooldown <= 0) {
      this.input.mouse.clicked = false;
      this.input.keysPressed.delete('Enter');
      this.input.keysPressed.delete('Space');
      this.capturePhoto();
      photo.cooldown = 0.4;
    }
    if (this.input.pause || this.input.wasPressed('KeyZ')) {
      this.consumePress('Escape', 'KeyP', 'KeyZ');
      this.exitPhoto();
    }
    if (this.ui) this.ui.photoFlash = photo.flash;
  }

  // =================================================================
  // Clock and weather
  // =================================================================
  updateClock() {
    const cycle = TIME_OF_DAY.cycleSeconds || 720;
    this.timeOfDay = ((this.todBase ?? TIME_OF_DAY.start) + this.sessionTime / cycle) % 1;
  }

  clockLabel() {
    const value = ((this.timeOfDay % 1) + 1) % 1;
    const hours = Math.floor(value * 24);
    const minutes = Math.floor((value * 24 - hours) * 60);
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }

  weatherLabel() {
    return WEATHER_CONFIG.labels[this.weather.type] || 'CLEAR';
  }

  updateWeather(dt) {
    const w = this.weather;
    if (!w) return;
    w.timer -= dt;
    w.windPhase = (w.windPhase || 0) + dt * 0.4;
    w.front = (w.front + dt * 0.02) % 1;

    if (w.timer <= 0) {
      w.next = pick(this.weatherRng, WEATHER_CONFIG.types);
      w.timer = WEATHER_CONFIG.minSeconds + this.weatherRng() * (WEATHER_CONFIG.maxSeconds - WEATHER_CONFIG.minSeconds);
      w.type = w.next;
      w.targetWind = 0.18 + this.weatherRng() * 0.65;
      if (w.type === 'storm') w.timer *= 0.72;
    }

    w.targetIntensity = WEATHER_CONFIG.rainIntensity[w.type] || 0;
    const ease = Math.min(1, dt * 0.32);
    w.intensity += (w.targetIntensity - w.intensity) * ease;
    w.wind += (w.targetWind - w.wind) * Math.min(1, dt * 0.22);
    w.gust = 0.5 + 0.5 * Math.sin((w.windPhase || 0) * 2.1);

    if (w.type === 'rain' || w.type === 'storm') {
      w.wetness = Math.min(1, w.wetness + dt * WEATHER_CONFIG.wetnessRise * (0.5 + w.intensity));
      if (w.type === 'storm' && w.flash <= 0 && !this.shotStaging && this.weatherRng() < dt * 0.09) {
        w.flash = 1;
        this.audio.playThunder();
        this.camera.shake = Math.max(this.camera.shake, 0.25);
      }
    } else {
      w.wetness = Math.max(0, w.wetness - dt * WEATHER_CONFIG.wetnessDry);
    }
    w.flash = Math.max(0, w.flash - dt * 2.6);

    this.audio.setRain((w.type === 'rain' || w.type === 'storm') ? w.intensity : 0);
    this.audio.setWind(w.wind + (w.type === 'storm' ? 0.3 : 0));

    if ((w.type === 'rain' || w.type === 'storm') && this.state === 'playing' && Math.random() < dt * 12 * w.intensity) {
      const x = this.camera.x + (Math.random() - 0.5) * (1280 / this.camera.zoom);
      const y = this.camera.y + (Math.random() - 0.5) * (720 / this.camera.zoom);
      this.particles.spawnRainSplash(x, y);
    }
  }

  setWeather(type, intensity = null) {
    if (!this.weather) return;
    this.weather.type = type;
    this.weather.next = type;
    this.weather.intensity = intensity ?? (WEATHER_CONFIG.rainIntensity[type] || 0);
    this.weather.targetIntensity = this.weather.intensity;
    this.weather.timer = 90;
    if (type === 'rain' || type === 'storm') {
      this.weather.wetness = Math.max(this.weather.wetness, type === 'storm' ? 0.85 : 0.55);
    } else {
      this.weather.wetness = Math.max(0, this.weather.wetness - 0.2);
    }
    this.audio.setRain(WEATHER_CONFIG.rainIntensity[type] || 0);
  }

  // =================================================================
  // Driving, interaction, stunts
  // =================================================================
  drivePlayer(dt) {
    const p = this.player;
    const v = p.vehicle;
    if (!v || v.isDestroyed) return;
    p.tickTimers(dt);
    const steer = (this.input.right ? 1 : 0) - (this.input.left ? 1 : 0);
    v.handbrake = this.input.handbrake;
    v.steer(steer);
    if (this.input.forward) v.accelerate(1, dt);
    else if (this.input.backward) {
      if (v.speed > 40) v.brake(0.9, dt);
      else v.accelerate(-0.75, dt);
    }
    if (this.input.handbrake) v.brake(0.55, dt);
    if (this.input.horn) {
      this.consumePress('KeyH');
      this.audio.playHorn(0.8);
    }
    v.update(dt, this.city, this.particles, this.audio, { wetness: this.weather.wetness });
    p.x = v.x;
    p.y = v.y;
    p.angle = v.angle;
    p.vx = v.vx;
    p.vy = v.vy;
    if (v.impactPulse > 0.2) this.camera.shake = Math.max(this.camera.shake, v.impactPulse * 0.55);

    if (this.input.grenade) {
      this.consumePress('KeyG');
      this.throwFrag();
    }
    if (this.input.mouse.down) this.combat.handlePlayerAttack(p, this.input, this.police, this.particles, this.audio, this);
    if (this.input.reload) p.reload(this.audio);
    const slot = this.input.weaponSlot;
    if (slot >= 0) p.setWeapon(slot);
    if (this.input.cycleWeapon !== 0) {
      p.cycleWeapon(this.input.cycleWeapon);
      this.input.mouse.wheel = 0;
    }
    if (this.input.enterVehicle) this.interact();
  }

  throwFrag() {
    if (this.combat.throwPlayerGrenade(this.player, this.audio)) {
      this.audio.playGrenadePin();
      this.ui.showToast('Frag out!', 'warning', 1.2);
      this.camera.shake = Math.max(this.camera.shake, 0.12);
    } else if (this.player.grenades <= 0) {
      this.ui.showToast('No grenades left.', 'warning', 1.4);
    }
  }

  tickHotwire(dt) {
    const p = this.player;
    const job = p.hotwire;
    if (!job) return;
    p.tickTimers(dt);
    const car = job.vehicle;
    if (!car || car.isDestroyed) {
      p.hotwire = null;
      this.ui.showToast('Hotwire failed - the car is wrecked.', 'danger', 2);
      return;
    }
    car.brake(1, dt);
    job.timer -= dt;
    if (job.timer > 0) return;

    const side = car.angle + Math.PI / 2;
    const driver = this.combat.spawnPedestrianAt(car.x + Math.cos(side) * 34, car.y + Math.sin(side) * 34);
    driver.fleeFrom(car.x, car.y);
    driver.speed = 175;
    driver.state = 'flee';
    driver.panicTimer = 5;
    car.driver = null;
    car.occupiedByCivilian = false;
    this.traffic.completeEnter(p, car, this.audio, this.ui, this.police);
    this.ui.showToast('Carjacked!', 'warning', 2.2);
    this.camera.shake = Math.max(this.camera.shake, 0.28);
  }

  describeInteraction() {
    const p = this.player;
    if (p.hotwire) return { kind: 'hotwire', label: 'HOTWIRING...' };
    if (p.isInVehicle && p.vehicle) {
      const garage = this.city.nearestGarage(p.x, p.y, GARAGE_CONFIG.radius);
      if (garage && (p.vehicle.hp < p.vehicle.maxHp || p.vehicle.isBurning)) {
        const cost = p.vehicle.hp < p.vehicle.maxHp * 0.4 || p.vehicle.isBurning
          ? GARAGE_CONFIG.fullRepairCost
          : GARAGE_CONFIG.repairCost;
        return { kind: 'repair', garage, label: `REPAIR ${p.vehicle.config.name.toUpperCase()} - $${cost}` };
      }
      return { kind: 'exit', label: `EXIT ${p.vehicle.config.name.toUpperCase()}` };
    }
    const marker = this.missions.availableMarker();
    if (marker && Math.hypot(p.x - marker.x, p.y - marker.y) < marker.radius + 46) {
      return { kind: 'job', marker, label: `START JOB - ${marker.mission.title.toUpperCase()}` };
    }
    const vehicle = this.traffic.findNearestVehicle(p.x, p.y, 80);
    if (vehicle) {
      return {
        kind: 'vehicle', vehicle,
        label: `${vehicle.occupiedByCivilian ? 'CARJACK' : 'STEAL'} ${vehicle.config.name.toUpperCase()}`,
      };
    }
    let nearPed = null;
    let nearDist = 50;
    for (const ped of this.combat.pedestrians) {
      if (ped.isDead || ped.robbed) continue;
      const d = Math.hypot(p.x - ped.x, p.y - ped.y);
      if (d < nearDist) {
        nearDist = d;
        nearPed = ped;
      }
    }
    if (nearPed) return { kind: 'rob', ped: nearPed, label: 'ROB PEDESTRIAN' };
    const garage = this.city.nearestGarage(p.x, p.y, GARAGE_CONFIG.radius);
    if (garage) return { kind: 'garage', garage, label: `GARAGE - ${garage.garage.name.toUpperCase()}` };
    if (p.isReloading) return { kind: 'reload', label: 'RELOADING...' };
    return { kind: 'none', label: '' };
  }

  interact() {
    this.consumePress('KeyE', 'KeyF');
    const p = this.player;
    if (p.hotwire) return;
    const target = this.describeInteraction();
    if (target.kind === 'repair') {
      this.repairAtGarage(target.garage);
      return;
    }
    if (target.kind === 'exit') {
      this.traffic.exitVehicle(p, this.city, this.audio, this.ui);
      return;
    }
    if (target.kind === 'job') {
      this.missions.start(target.marker.index);
      return;
    }
    if (target.kind === 'vehicle') {
      const car = target.vehicle;
      const speed = Math.hypot(car.vx, car.vy);
      const limit = car.occupiedByCivilian ? 270 : 330;
      if (speed > limit) {
        this.ui.showToast('Too fast - slow the car down.', 'warning', 2);
        return;
      }
      this.traffic.enterVehicle(p, car, this.audio, this.ui, this.police);
      return;
    }
    if (target.kind === 'rob') {
      const ped = target.ped;
      ped.robbed = true;
      const cash = ECONOMY.robberyMin + Math.floor(Math.random() * (ECONOMY.robberyMax - ECONOMY.robberyMin));
      p.money += cash;
      p.score += 15;
      ped.fleeFrom(p.x, p.y);
      this.audio.playCash();
      this.ui.showToast(`Robbed ${cash}. Somebody is calling it in.`, 'warning', 2.8);
      this.onCrime('robbery', 1);
    }
  }

  computePrompt() {
    return this.describeInteraction().label;
  }

  repairAtGarage(entry) {
    const p = this.player;
    const v = p.vehicle;
    if (!v) return;
    const full = v.hp <= 0 || v.isDestroyed || v.isBurning || v.hp < v.maxHp * 0.4;
    const cost = full ? GARAGE_CONFIG.fullRepairCost : GARAGE_CONFIG.repairCost;
    if (v.hp >= v.maxHp && !v.isBurning) {
      this.ui.showToast('That car is already clean.', 'neutral', 1.8);
      return;
    }
    if (p.money < cost) {
      this.ui.showToast(`Repair costs ${cost}. You are short.`, 'danger', 2.4);
      return;
    }
    p.money -= cost;
    v.repair(true);
    this.audio.playGarage();
    this.particles.spawnDust(v.x, v.y, 6, 8);
    this.ui.showToast(`${entry.garage.name}: repaired for $${cost}.`, 'success', 2.6);
    this.camera.shake = Math.max(this.camera.shake, 0.18);
    this.autosave();
  }

  updateStunt(dt) {
    const v = this.player.vehicle;
    if (this.stunt) {
      this.stunt.time += dt;
      const progress = clamp(this.stunt.time / this.stunt.target, 0, 1);
      if (v) v.airHeight = Math.sin(progress * Math.PI) * (18 + this.stunt.speed * 0.018);
      if (this.stunt.time >= this.stunt.target) {
        const air = this.stunt.time;
        if (v) {
          v.airborne = false;
          v.airHeight = 0;
          v.stuntCooldown = 1.4;
          this.particles.spawnStuntDust(v.x, v.y, v.angle);
        }
        if (v && !v.isDestroyed && !v.isBurning && this.player.health > 0) {
          const clean = air > 0.55;
          const cash = Math.round((clean ? STUNT_CONFIG.cleanBonus : 0) + air * STUNT_CONFIG.cashPerSecond + this.stunt.speed * 0.12);
          this.player.money += cash;
          this.player.score += STUNT_CONFIG.stuntScore;
          this.stuntsCount += 1;
          this.stuntCash += cash;
          this.bestStunt = Math.max(this.bestStunt, air);
          this.ui.showStunt(`${this.stunt.ramp?.name || 'STUNT'}${clean ? ' · CLEAN' : ''}`, cash, air);
          this.audio.playStunt();
          this.camera.shake = Math.max(this.camera.shake, 0.4);
          if (air > 1.25) this.ui.showToast('Big air! The city noticed.', 'success', 2.4);
        }
        this.stunt = null;
        return;
      }
    }
    if (!v || v.isDestroyed || v.isBurning) return;
    if (this.stunt || v.stuntCooldown > 0) return;
    const speed = Math.hypot(v.vx, v.vy);
    if (speed < STUNT_CONFIG.minSpeed) return;
    const ramp = this.city.rampAt(v.x, v.y, 46);
    if (!ramp) return;
    const dot = (v.vx * Math.cos(ramp.angle) + v.vy * Math.sin(ramp.angle)) / Math.max(1, speed);
    if (dot < 0.55) return;
    const target = clamp(speed / 360, 0.6, STUNT_CONFIG.maxAir);
    this.stunt = { time: 0, target, ramp, speed };
    v.airborne = true;
    v.airHeight = 0;
    v.stuntCooldown = 1.4;
    this.audio.playSplash();
    this.particles.spawnStuntDust(v.x, v.y, v.angle);
    this.camera.shake = Math.max(this.camera.shake, 0.32);
    this.ui.showToast(`${ramp.name} - hold the wheel!`, 'warning', 1.6);
  }

  resolveCarContacts() {
    const cars = this.allVehicles();
    for (let i = 0; i < cars.length; i += 1) {
      const a = cars[i];
      if (a.isDestroyed) continue;
      for (let j = i + 1; j < cars.length; j += 1) {
        const b = cars[j];
        if (b.isDestroyed) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy);
        const min = (a.length + b.length) * 0.27;
        if (dist <= 0 || dist >= min) continue;
        const nx = dx / dist;
        const ny = dy / dist;
        const overlap = min - dist;
        const total = a.config.mass + b.config.mass;
        a.x -= nx * overlap * (b.config.mass / total);
        a.y -= ny * overlap * (b.config.mass / total);
        b.x += nx * overlap * (a.config.mass / total);
        b.y += ny * overlap * (a.config.mass / total);
        const rel = Math.hypot(a.vx - b.vx, a.vy - b.vy);
        if (rel > 90) {
          const push = rel * 0.32;
          a.vx -= nx * push * (b.config.mass / total);
          a.vy -= ny * push * (b.config.mass / total);
          b.vx += nx * push * (a.config.mass / total);
          b.vy += ny * push * (a.config.mass / total);
          const damage = rel * 0.035;
          a.takeDamage(damage, this.particles, this.audio);
          b.takeDamage(damage, this.particles, this.audio);
          this.particles.spawnSparks((a.x + b.x) / 2, (a.y + b.y) / 2, 8);
          if (a === this.player.vehicle || b === this.player.vehicle) {
            this.camera.shake = Math.max(this.camera.shake, Math.min(0.8, rel / 500));
          }
        }
      }
    }

    if (!this.player.isInVehicle) {
      for (const v of cars) {
        if (v.isDestroyed) continue;
        const speed = Math.hypot(v.vx, v.vy);
        if (speed < 150) continue;
        const reach = Math.max(v.width, v.length) * 0.5 + this.player.radius * 0.5;
        if (Math.hypot(v.x - this.player.x, v.y - this.player.y) < reach) {
          this.player.takeDamage(55, this.particles, this.audio, Math.atan2(v.vy, v.vx));
          this.onPlayerHurt();
          this.camera.shake = Math.max(this.camera.shake, 0.7);
        }
      }
    }
  }

  allVehicles() {
    return [...this.traffic.vehicles, ...this.traffic.parked, ...this.police.cops, ...this.police.roadblocks];
  }

  // =================================================================
  // Ambient updates
  // =================================================================
  updateHeatMusic() {
    const stars = this.police.wantedStars;
    const mission = this.missions.active ? 1 : 0;
    this.audio.setMusicIntensity(stars >= 4 ? 3 : stars >= 2 ? 2 : stars > 0 ? 1 : mission ? 1 : 0);
  }

  updateAmbient(dt) {
    this.city.update(dt, this.worldTime);
    this.traffic.update(dt, this.player, this.particles, this.audio, this.police, this);
    for (const ped of this.combat.pedestrians) ped.update(dt, this.city, this.particles);
    this.particles.update(dt);
  }

  updateAmbientFrozen(dt) {
    this.particles.update(dt);
    this.audio.setTireScreech(0);
    if (this.weather?.flash > 0) this.weather.flash = Math.max(0, this.weather.flash - dt * 2.6);
  }

  // =================================================================
  // Crime and event flow
  // =================================================================
  onCrime(kind, severity = 1) {
    if (this.state !== 'playing') return;
    const before = this.police.wantedStars;
    let add = 0;
    if (kind === 'cop') add = 2;
    else if (kind === 'vehicular') add = 2;
    else if (kind === 'explosion') add = 2;
    else if (kind === 'carjack') add = 1;
    else if (kind === 'robbery') add = 1;
    else if (kind === 'assault') add = 1;
    else if (kind === 'gunfire') add = 1;
    this.stats.crimes += 1;

    if (this.police.wantedStars === 0) {
      this.police.setWanted(Math.min(5, Math.max(1, add || severity)));
    } else if (kind === 'cop' || kind === 'explosion') {
      this.police.raiseWanted(1);
    } else if (this.crimeCooldown <= 0 && add > 0) {
      this.police.raiseWanted(1);
    }

    if (this.police.wantedStars > before && this.crimeCooldown <= 0) {
      this.crimeCooldown = 4;
      this.ui.showToast(`WANTED - ${this.police.wantedStars} star${this.police.wantedStars === 1 ? '' : 's'}`, 'danger', 2.4);
      this.audio.playSirenChirp(this.police.wantedStars);
    }
  }

  notifyGunfire(x, y) {
    for (const ped of this.combat.pedestrians) {
      if (!ped.isDead) ped.panic(x, y, 400);
    }
    this.traffic.panicAt(x, y, 360);
    let witness = this.police.witnessedCarjack(x, y);
    if (!witness) {
      for (const ped of this.combat.pedestrians) {
        if (!ped.isDead && Math.hypot(ped.x - x, ped.y - y) < 300) {
          witness = true;
          break;
        }
      }
    }
    if (witness) this.onCrime('gunfire', 1);
  }

  onPlayerHurt() {
    this.camera.shake = Math.max(this.camera.shake, 0.25);
  }

  addShake(amount) {
    this.camera.shake = Math.max(this.camera.shake, amount);
  }

  spawnPickup(type, x, y) {
    this.pickups.add(type, x, y);
  }

  showCollectibleRing(item) {
    this.ui.collectibleFlash = 1;
    this.particles.spawnSparks(item.x, item.y, 18, 1.2);
    this.particles.spawnDust(item.x, item.y, 4, 8);
    this.audio.playCollectible();
    this.camera.shake = Math.max(this.camera.shake, 0.15);
  }

  onAllCollectibles(reward) {
    this.ui.showToast(`ALL ${COLLECTIBLE_CONFIG.total} MIXTAPES FOUND - city bonus $${reward}`, 'success', 5);
    this.ui.collectibleFlash = 1;
    this.audio.playMissionPass();
    this.autosave();
  }

  // =================================================================
  // Dialogue and mission callbacks
  // =================================================================
  showChatter(speaker, text, duration = 5) {
    this.ui.showChatter(speaker, text, Math.min(7, duration));
  }

  showDialog(speaker, text, portrait = null) {
    this.ui.showDialog(speaker, text, portrait);
    this.dialogueReturn = 'playing';
    this.enterMode('dialogue');
    this.audio.playPickup();
  }

  beginMissionBriefing(def) {
    const beats = Array.isArray(def.briefing) && def.briefing.length
      ? def.briefing
      : [{ speaker: 'Maya Cruz', text: def.intro || 'Find the marker and get to work.' }];
    this.dialogueQueue = beats.slice();
    this.dialogueIndex = 0;
    this.dialogueTotal = this.dialogueQueue.length;
    this.dialogueReturn = 'playing';
    this.applyDialogueBeat();
  }

  applyDialogueBeat() {
    const beat = this.dialogueQueue[this.dialogueIndex];
    if (!beat) {
      this.ui.dialog = null;
      this.state = this.dialogueReturn || 'playing';
      this.stateTimer = 0;
      this.ui.menuIndex = 0;
      return;
    }
    this.ui.showDialog(beat.speaker, beat.text, beat.portrait || null);
    this.state = 'dialogue';
    this.stateTimer = 0;
    this.audio.playPickup();
  }

  dismissDialog() {
    if (this.state !== 'dialogue') return;
    for (const code of ['Space', 'Enter', 'KeyE', 'KeyF']) this.input.keysPressed.delete(code);
    this.input.mouse.clicked = false;
    if (this.dialogueQueue.length && this.dialogueIndex < this.dialogueQueue.length - 1) {
      this.dialogueIndex += 1;
      this.applyDialogueBeat();
      return;
    }
    this.ui.dialog = null;
    this.dialogueQueue = [];
    this.dialogueIndex = 0;
    this.dialogueTotal = 0;
    this.state = this.dialogueReturn || 'playing';
    this.stateTimer = 0;
  }

  showMissionBanner(def, index) {
    this.ui.showMissionBanner(def, index);
  }

  onMissionComplete(def, reward) {
    const final = def.id === this.missions.defs.length || this.missions.completedCount >= this.missions.defs.length;
    this.stats.jobs += 1;
    this.missionComplete = { def, reward, final };
    this.missionFailed = null;
    this.enterMode('missionComplete');
    this.ui.banner = null;
    this.ui.toasts = [];
    this.ui.objectiveHint = '';
    this.audio.playMissionPass();
    this.audio.setPoliceSiren(false, 0);
    this.police.clearWanted();
    this.autosave();
  }

  continueAfterMission() {
    const wasFinal = this.missionComplete?.final;
    this.input.keysPressed.delete('Enter');
    this.input.keysPressed.delete('Space');
    this.input.mouse.clicked = false;
    if (wasFinal) {
      this.enterMode('ending');
      this.audio.playMissionPass();
      this.autosave();
      return;
    }
    this.enterMode('playing');
    this.missionComplete = null;
    if (this.missions.currentIndex < this.missions.defs.length) {
      this.ui.showToast(`Next marker: ${this.missions.defs[this.missions.currentIndex].title}`, 'neutral', 3.4);
    }
  }

  onMissionFailed(def, reason) {
    this.missionFailed = { def, reason };
    this.enterMode('missionFailed');
    this.audio.playMissionFail();
    this.audio.setPoliceSiren(false, 0);
    this.ui.banner = null;
    this.ui.toasts = [];
    this.ui.objectiveHint = '';
    this.input.mouse.clicked = false;
  }

  beginFate(kind) {
    const wasted = kind === 'wasted';
    if (wasted ? (this.wastedTriggered || this.state === 'wasted' || this.state === 'busted') : (this.bustedTriggered || this.state === 'busted' || this.state === 'wasted')) {
      return;
    }
    if (!wasted && this.player.health <= 0) return;
    if (wasted) this.wastedTriggered = true;
    else this.bustedTriggered = true;

    this.enterMode(wasted ? 'wasted' : 'busted', { duration: 3.7 });
    this.stateDuration = 3.7;
    this.ui.banner = null;
    this.ui.toasts = [];
    this.audio.setPoliceSiren(false, 0);
    this.audio.stopEngine();

    if (this.missions.active) {
      this.pendingFail = {
        index: this.missions.currentIndex,
        reason: wasted ? 'You were wasted.' : 'You were busted.',
      };
      this.missions.failSilent(wasted ? 'You were wasted.' : 'You were busted.');
    }
    if (this.player.isInVehicle) {
      const v = this.player.vehicle;
      this.lastVehicle = v;
      v.driver = null;
      v.isPlayerVehicle = false;
      v.aiMode = 'parked';
      this.player.vehicle = null;
    }
    if (wasted) {
      this.player.money = Math.max(0, this.player.money - WANTED_CONFIG.wastedFee);
      this.player.health = 0;
    } else {
      this.player.money = Math.max(0, this.player.money - WANTED_CONFIG.bustedFine);
      this.player.health = Math.max(1, this.player.health);
    }
    this.police.clearWanted();
  }

  onWasted() {
    this.beginFate('wasted');
  }

  onBusted() {
    this.beginFate('busted');
  }

  finishRespawn() {
    const busted = this.state === 'busted';
    const landmark = busted ? this.city.landmarks.policeStation : this.city.landmarks.hospital;
    const point = { x: landmark.x, y: landmark.y + 106 };
    const p = this.player;
    p.x = point.x;
    p.y = point.y;
    p.vx = 0;
    p.vy = 0;
    p.health = p.maxHealth;
    p.armor = busted ? 50 : 0;
    p.isRolling = false;
    p.hotwire = null;
    p.grenades = Math.max(p.grenades, 1);
    if (busted) {
      p.ammo.smg.reserve = 0;
      p.ammo.shotgun.reserve = 0;
      p.ammo.rifle.reserve = 0;
    }
    p.vehicle = null;

    if (this.lastVehicle) {
      const v = this.lastVehicle;
      v.repair(true);
      v.x = point.x + 64;
      v.y = point.y + 24;
      v.angle = 0;
      v.vx = 0;
      v.vy = 0;
      v.driver = null;
      v.isPlayerVehicle = false;
      v.aiMode = 'parked';
      const riding = this.traffic.vehicles.indexOf(v);
      if (riding >= 0) this.traffic.vehicles.splice(riding, 1);
      if (!this.traffic.parked.includes(v)) this.traffic.parked.push(v);
      this.ui.showToast('Your car was repaired and left outside.', 'success', 3);
      this.lastVehicle = null;
    }

    this.police.reset();
    this.bustedTriggered = false;
    this.wastedTriggered = false;
    this.camera.x = point.x;
    this.camera.y = point.y;
    this.camera.shake = 0;
    this.ui.setDistrict(
      busted ? 'Vantage Heights' : 'Market Row',
      busted ? 'Costa Sol Police HQ' : 'Costa Sol General',
    );
    this.ui.showToast(
      busted ? `Released with a $${WANTED_CONFIG.bustedFine} fine.` : `Patched up. Hospital bill $${WANTED_CONFIG.wastedFee}.`,
      'warning',
      3.4,
    );

    if (this.pendingFail) {
      const failed = this.pendingFail;
      const def = this.missions.defs[failed.index];
      this.missionFailed = { def, reason: failed.reason };
      this.missions.lastFailed = {
        index: failed.index,
        step: this.missions.checkpointStep,
        reason: failed.reason,
      };
      this.pendingFail = null;
      this.enterMode('missionFailed');
      this.audio.playMissionFail();
    } else {
      this.enterMode('playing');
    }
    this.autosave();
  }

  // =================================================================
  // Photo mode
  // =================================================================
  enterPhoto() {
    if (this.state !== 'playing') return;
    this.photo = {
      x: this.camera.x,
      y: this.camera.y,
      zoom: Math.max(1.2, this.camera.zoom),
      photos: this.photoCount,
      flash: 0,
      cooldown: 0,
    };
    this.photo.x = clamp(this.photo.x, 120, WORLD_SIZE - 120);
    this.photo.y = clamp(this.photo.y, 120, WORLD_SIZE - 120);
    this.enterMode('photo');
    this.ui.prompt = '';
    this.prompt = '';
  }

  capturePhoto() {
    this.photoCount += 1;
    this.stats.photos = this.photoCount;
    this.photo.photos = this.photoCount;
    this.photo.flash = 1;
    this.ui.photoFlash = 1;
    this.audio.playPickup();
    this.saveNotice = 0;
  }

  exitPhoto() {
    this.state = 'playing';
    this.stateTimer = 0;
    this.camera.x = clamp(this.photo.x, 200, WORLD_SIZE - 200);
    this.camera.y = clamp(this.photo.y, 200, WORLD_SIZE - 200);
    this.camera.zoom = this.photo.zoom;
    this.audio.setTireScreech(0);
    if (this.player.isInVehicle && this.player.vehicle) {
      this.audio.startEngine(this.player.vehicle.config.engineNote);
    }
    this.ui.showToast(`Photo mode closed · ${this.photoCount} shot${this.photoCount === 1 ? '' : 's'} in the roll.`, 'neutral', 2.4);
  }

  // =================================================================
  // Camera, district
  // =================================================================
  updateCamera(dt) {
    const cam = this.camera;
    if (this.state === 'photo') {
      const k = 1 - Math.exp(-dt * 10);
      cam.x += (this.photo.x - cam.x) * k;
      cam.y += (this.photo.y - cam.y) * k;
      cam.zoom += (this.photo.zoom - cam.zoom) * (1 - Math.exp(-dt * 7));
      cam.shake *= Math.exp(-dt * 8);
      if (cam.shake < 0.004) cam.shake = 0;
      return;
    }

    let targetX;
    let targetY;
    let targetZoom;
    if (this.state === 'title') {
      const t = this.titleDrift;
      targetX = this.titleAnchor.x + Math.sin(t) * 40;
      targetY = this.titleAnchor.y + Math.cos(t * 0.8) * 48;
      targetZoom = 1.92;
    } else {
      const inCar = this.player.isInVehicle && this.player.vehicle;
      const focus = inCar ? this.player.vehicle : this.player;
      const vx = inCar ? this.player.vehicle.vx : this.player.vx;
      const vy = inCar ? this.player.vehicle.vy : this.player.vy;
      const speed = Math.hypot(vx, vy);
      const lead = inCar ? 0.27 : 0.09;
      targetX = focus.x + vx * lead;
      targetY = focus.y + vy * lead;

      if (!inCar) {
        const mx = this.input.mouse.worldX - focus.x;
        const my = this.input.mouse.worldY - focus.y;
        const md = Math.hypot(mx, my);
        if (md > 6) {
          targetX += (mx / md) * 30;
          targetY += (my / md) * 30;
        }
      }
      const ratio = Math.min(1, speed / 540);
      targetZoom = 2.05 - ratio * 0.42;
      if (this.state === 'wasted' || this.state === 'busted') targetZoom = 1.72;
    }

    const halfW = 1280 / 2 / targetZoom;
    const halfH = 720 / 2 / targetZoom;
    targetX = clamp(targetX, Math.min(halfW, WORLD_SIZE / 2), WORLD_SIZE - Math.min(halfW, WORLD_SIZE / 2));
    targetY = clamp(targetY, Math.min(halfH, WORLD_SIZE / 2), WORLD_SIZE - Math.min(halfH, WORLD_SIZE / 2));

    const follow = 1 - Math.exp(-dt * 6.0);
    cam.x += (targetX - cam.x) * follow;
    cam.y += (targetY - cam.y) * follow;
    cam.zoom += (targetZoom - cam.zoom) * (1 - Math.exp(-dt * 3.1));
    cam.shake *= Math.exp(-dt * 6.4);
    if (cam.shake < 0.005) cam.shake = 0;
  }

  updateDistrict() {
    const d = this.districtAt(this.player.x, this.player.y);
    if (d && d.id !== this.districtId) {
      this.districtId = d.id;
      if (this.state === 'playing') this.ui.setDistrict(d.name, d.sub);
    }
  }

  districtAt(x, y) {
    return districtAt(x, y);
  }

  get districtList() {
    return DISTRICTS;
  }

  // =================================================================
  // Menu input
  // =================================================================
  consumePress(...codes) {
    for (const code of codes) this.input.keysPressed.delete(code);
  }

  usableButtons() {
    return this.ui.buttons.filter((button) => !button.disabled);
  }

  moveMenu(delta) {
    const buttons = this.usableButtons();
    if (!buttons.length) return;
    this.ui.menuIndex = (this.ui.menuIndex + delta + buttons.length) % buttons.length;
  }

  invokeButton(action) {
    if (!action) return;
    if (this.state === 'title' || this.state === 'controls') this.handleMenuAction(action);
    else if (this.state === 'paused') this.handlePauseAction(action);
    else if (this.state === 'missionFailed') this.handleFailedAction(action);
    else if (this.state === 'ending') this.handleEndingAction(action);
    else if (this.state === 'missionComplete' && action === 'continue') this.continueAfterMission();
  }

  handleMenuInput() {
    const buttons = this.usableButtons();
    if (!buttons.length) return;
    if (this.input.wasPressed('ArrowDown') || this.input.wasPressed('KeyS')) {
      this.moveMenu(1);
      this.consumePress('ArrowDown', 'KeyS');
    }
    if (this.input.wasPressed('ArrowUp') || this.input.wasPressed('KeyW')) {
      this.moveMenu(-1);
      this.consumePress('ArrowUp', 'KeyW');
    }
    if (this.input.mouse.clicked) {
      const action = this.ui.hitButton(this.input.mouse.x, this.input.mouse.y);
      if (action) {
        this.input.mouse.clicked = false;
        this.handleMenuAction(action);
        return;
      }
    }
    if (this.input.wasPressed('Enter') || this.input.wasPressed('Space')) {
      const action = buttons[Math.min(this.ui.menuIndex, buttons.length - 1)]?.action;
      this.consumePress('Enter', 'Space');
      if (action) this.handleMenuAction(action);
    }
    if (this.input.mute) this.ui.mutedNotice = 1.8;
    if (this.input.wasPressed('KeyC')) this.handleMenuAction('continue');
    void GAME_TITLE;
  }

  handleMenuAction(action) {
    if (action === 'new') {
      this.newGame(1 + Math.floor(Math.random() * 999999));
    } else if (action === 'continue') {
      if (!this.loadSave()) this.ui.showToast('No save yet - start a new game.', 'warning', 2.4);
    } else if (action === 'controls') {
      this.controlsReturn = 'title';
      this.enterMode('controls');
    } else if (action === 'back') {
      this.state = this.controlsReturn;
      this.stateTimer = 0;
      this.ui.menuIndex = 0;
    }
  }

  handleControlsInput() {
    if (this.input.pause || this.input.wasPressed('Enter') || this.input.wasPressed('Escape')) {
      this.consumePress('Escape', 'Enter');
      this.state = this.controlsReturn;
      this.stateTimer = 0;
      this.ui.menuIndex = 0;
      return;
    }
    if (this.input.mouse.clicked) {
      const action = this.ui.hitButton(this.input.mouse.x, this.input.mouse.y);
      if (action) {
        this.input.mouse.clicked = false;
        this.state = this.controlsReturn;
        this.stateTimer = 0;
        this.ui.menuIndex = 0;
      }
    }
  }

  handlePauseInput(dt) {
    if (this.input.pause) {
      this.consumePress('Escape', 'KeyP');
      this.state = 'playing';
      this.stateTimer = 0;
      return;
    }
    const buttons = this.usableButtons();
    if (!buttons.length) return;
    if (this.input.wasPressed('ArrowDown') || this.input.wasPressed('KeyS')) {
      this.moveMenu(1);
      this.consumePress('ArrowDown', 'KeyS');
    }
    if (this.input.wasPressed('ArrowUp') || this.input.wasPressed('KeyW')) {
      this.moveMenu(-1);
      this.consumePress('ArrowUp', 'KeyW');
    }
    if (this.input.mouse.clicked) {
      const action = this.ui.hitButton(this.input.mouse.x, this.input.mouse.y);
      if (action) {
        this.input.mouse.clicked = false;
        this.handlePauseAction(action);
        return;
      }
    }
    if (this.input.wasPressed('Enter') || this.input.wasPressed('Space')) {
      const action = buttons[Math.min(this.ui.menuIndex, buttons.length - 1)]?.action;
      this.consumePress('Enter', 'Space');
      if (action) this.handlePauseAction(action);
    }
    if (this.input.mute) this.ui.mutedNotice = 1.8;
    void dt;
  }

  handlePauseAction(action) {
    if (action === 'resume') this.state = 'playing';
    else if (action === 'save') {
      this.autosave();
      this.ui.showToast('Game saved.', 'success', 2.2);
    } else if (action === 'load') {
      if (!this.loadSave()) this.ui.showToast('No save found.', 'warning', 2.2);
    } else if (action === 'controls') {
      this.controlsReturn = 'paused';
      this.enterMode('controls');
    } else if (action === 'title') {
      this.autosave();
      this.state = 'title';
      this.stateTimer = 0;
      this.titleAnchor = { x: this.player.x, y: this.player.y };
      this.titleDrift = 0;
      this.ui.menuIndex = 0;
      this.audio.stopEngine();
    }
  }

  handleMissionFailedInput() {
    if (this.input.mouse.clicked) {
      const action = this.ui.hitButton(this.input.mouse.x, this.input.mouse.y);
      if (action) {
        this.input.mouse.clicked = false;
        this.handleFailedAction(action);
        return;
      }
    }
    if (this.input.wasPressed('Enter') || this.input.wasPressed('Space')) {
      this.consumePress('Enter', 'Space');
      this.missions.retry();
      return;
    }
    if (this.input.wasPressed('Escape')) {
      this.consumePress('Escape');
      this.missions.abandon();
    }
  }

  handleFailedAction(action) {
    if (action === 'retry') this.missions.retry();
    else if (action === 'abandon') this.missions.abandon();
  }

  handleEndingInput(dt) {
    if (this.input.mouse.clicked) {
      const action = this.ui.hitButton(this.input.mouse.x, this.input.mouse.y);
      if (action === 'title') {
        this.input.mouse.clicked = false;
        this.handleEndingAction('title');
      }
    }
    if (this.input.wasPressed('Enter') || this.input.wasPressed('Space') || this.input.wasPressed('Escape')) {
      this.consumePress('Enter', 'Space', 'Escape');
      this.handleEndingAction('title');
    }
    void dt;
  }

  handleEndingAction(action) {
    if (action !== 'title') return;
    this.state = 'title';
    this.stateTimer = 0;
    this.titleAnchor = { x: this.player.x, y: this.player.y };
    this.titleDrift = 0;
    this.ui.menuIndex = 0;
  }

  // =================================================================
  // Render
  // =================================================================
  render() {
    this.renderer.render(this);
    if (HUD_MODES.has(this.state)) {
      this.ui.drawHUD(this.ctx, this);
      if ((this.state === 'playing' || this.state === 'dialogue') && this.player.hitFlash > 0.03) {
        const ctx = this.ctx;
        const flash = ctx.createRadialGradient(640, 360, 220, 640, 360, 780);
        flash.addColorStop(0, 'rgba(160, 20, 30, 0)');
        flash.addColorStop(1, `rgba(160, 20, 30, ${this.player.hitFlash * 0.34})`);
        ctx.fillStyle = flash;
        ctx.fillRect(0, 0, 1280, 720);
      }
    }
    this.ui.drawScreens(this.ctx, this);
  }

  // =================================================================
  // Debug handles
  // =================================================================
  setWanted(n) {
    this.police.setWanted(n);
  }

  startMission(index = 0, step = 0) {
    if (index < 0 || index >= this.missions.defs.length) return false;
    this.state = 'playing';
    const started = this.missions.startFrom(index, Math.max(0, step), false, { silent: true });
    if (!started) return false;
    this.ui.dialog = null;
    this.state = 'playing';
    this.stateTimer = 0;
    return true;
  }

  teleport(x, y, angle = null) {
    this.player.x = x;
    this.player.y = y;
    this.player.vx = 0;
    this.player.vy = 0;
    if (angle !== null) this.player.angle = angle;
    this.camera.x = x;
    this.camera.y = y;
    this.input.updateWorldMouse(this.camera);
  }

  debugEnterCar(id, x, y, angle = 0, speed = 0) {
    const car = new Vehicle(VEHICLE_TYPES[id] ? id : 'marlin', x, y, angle);
    car.aiMode = 'player';
    car.driver = this.player;
    car.isPlayerVehicle = true;
    car.occupiedByCivilian = false;
    car.isMission = false;
    if (speed) {
      car.vx = Math.cos(angle) * speed;
      car.vy = Math.sin(angle) * speed;
    }
    this.traffic.vehicles.push(car);
    this.player.vehicle = car;
    this.player.x = x;
    this.player.y = y;
    this.camera.x = x;
    this.camera.y = y;
    this.audio.startEngine(car.config.engineNote);
    return car;
  }

  debugHandle() {
    const game = this;
    return {
      get world() { return game.city; },
      get player() { return game.player; },
      get police() { return game.police; },
      get missions() { return game.missions; },
      get traffic() { return game.traffic; },
      get combat() { return game.combat; },
      get game() { return game; },
      get collectibles() { return game.collectibles; },
      get photo() { return game.photo; },
      setWanted: (n) => game.setWanted(n),
      startMission: (i, s = 0) => game.startMission(i, s),
      get state() { return game.state; },
      get shotReady() { return game.shotReady; },
      get frameTimes() { return game.frameTimes; },
    };
  }

  snapshot() {
    return {
      state: this.state,
      seed: this.seed,
      clock: this.clockLabel(),
      weather: this.weather.type,
      wetness: Number(this.weather.wetness.toFixed(2)),
      player: {
        x: Math.round(this.player.x),
        y: Math.round(this.player.y),
        health: this.player.health,
        money: this.player.money,
        grenades: this.player.grenades,
      },
      wanted: this.police.wantedStars,
      mission: this.missions.active ? this.missions.currentIndex : null,
      traffic: this.traffic.vehicles.length,
      peds: this.combat.pedestrians.length,
      enemies: this.combat.enemies.length,
      collectibles: `${this.collectibles.foundCount}/${this.collectibles.total}`,
      stunts: this.stuntsCount,
      photos: this.photoCount,
    };
  }

  static titleForSeed(seed) {
    return `${GAME_TITLE} · ${seedFrom(String(seed)) % 997}`;
  }
}
