// Leonida Heat - the game director.
// A small state machine (title, playing, paused, controls, dialogue, mission
// complete/failed, wasted, busted, ending) owns the fixed-step loop, the
// smoothed speed-look-ahead camera, weather, interaction prompts, heat
// reactions, mission callbacks, autosave, respawn and the debug/screenshot
// handles used by the test harness.

import {
  TIME_OF_DAY, STEP, VEHICLE_TYPES, WANTED_CONFIG, GAME_TITLE, DISTRICTS, districtAt,
  WEATHER_CONFIG, PHYSICS_CONFIG, ECONOMY,
} from './config.js';
import { CityWorld } from './city.js';
import { ParticleSystem, Player, Vehicle } from './entities.js';
import { TrafficManager } from './traffic.js';
import { PoliceManager } from './police.js';
import { CombatManager } from './combat.js';
import { MissionManager } from './missions.js';
import { PickupManager } from './pickups.js';
import { InputManager } from './input.js';
import { SoundEngine } from './audio.js';
import { HUD } from './hud.js';
import { Renderer } from './renderer.js';
import { saveGame as persist, loadGame as restore, hasSave } from './save.js';
import { mulberry32, seedFrom, pick } from './rng.js';

const CAM_CLAMP = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const WORLD = 3200;

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
    this.camera = { x: 2540, y: 1240, zoom: 1.9, baseZoom: 1.9, shake: 0 };
    this.lastFrame = 0;
    this.accumulator = 0;
    this.running = false;
    this.shotFrozen = false;
    this.shotReady = false;
    this.frameTimes = [];
    this.bustedTriggered = false;
    this.wastedTriggered = false;
    this.missionComplete = null;
    this.missionFailed = null;
    this.saveNotice = 0;
    this.prompt = '';
    this.dialogueReturn = 'playing';
    this.controlsReturn = 'title';
    this.pendingFail = null;
    this.titleAnchor = { x: 2530, y: 1280 };
    this.titleDrift = 0;
    this.crimeCooldown = 0;
    this.districtId = null;
    this.debug = {};
    this.seed = 2026;
    this.weatherRng = mulberry32(2026);
    this.weather = { type: 'clear', intensity: 0, wetness: 0, wind: 0.3, flash: 0, timer: 80, next: 'clear' };
    this.simulate = null;
    this.handle = null;
    this.buildWorld(this.seed, true);
    this.startTitle();
  }

  // =================================================================
  // World construction
  // =================================================================
  buildWorld(seed, title = false) {
    this.seed = seed >>> 0;
    this.city = new CityWorld(this.seed);
    this.rng = mulberry32(this.seed ^ 0x9e3779b9);
    this.particles = new ParticleSystem();
    this.player = new Player(2360, 1190);
    this.player.angle = 0;
    this.player.money = ECONOMY.startingCash;
    this.player.score = 0;
    this.traffic = new TrafficManager(this.city, this.rng);
    this.police = new PoliceManager(this.city, this.rng);
    this.combat = new CombatManager(this.city);
    this.combat.setPedestrianRng(this.rng);
    this.pickups = new PickupManager(this.city);
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
    this.timeOfDay = TIME_OF_DAY.start;
    this.todBase = TIME_OF_DAY.start;
    this.sessionTime = 0;
    this.crimeCooldown = 0;
    this.weatherRng = mulberry32((this.seed ^ 0x51ed270b) >>> 0);
    this.weather = {
      type: 'clear',
      intensity: 0,
      wetness: 0,
      wind: 0.25 + this.weatherRng() * 0.4,
      flash: 0,
      timer: 60 + this.weatherRng() * 50,
      next: pick(this.weatherRng, WEATHER_CONFIG.types),
    };

    if (title) {
      this.traffic.seed(2340, 1320, 26, 22);
      this.combat.populate(2340, 1300, 48, 900);
      this.camera.x = 2220;
      this.camera.y = 1270;
      this.camera.zoom = 1.9;
      this.titleAnchor = { x: 2220, y: 1270 };
    } else {
      this.traffic.seed(this.player.x, this.player.y, 18, 18);
      this.combat.populate(this.player.x, this.player.y, 42, 900);
      this.camera.x = this.player.x + 80;
      this.camera.y = this.player.y;
      this.camera.zoom = 2.02;
      this.ui.setDistrict('Coral Strip', 'Beachfront & Neon Boardwalk');
    }
    this.ui.displayedMoney = this.player.money;
    this.ui.displayedHealth = this.player.health;
    this.ui.displayedArmor = this.player.armor;
    this.ui.toasts = [];
    this.ui.dialog = null;
    this.ui.banner = null;
    this.ui.objectiveHint = '';
    this.ui.menuIndex = 0;
    this.ui.prompt = '';
    this.audio.setRain(0);
    this.audio.setMusicIntensity(0);
  }

  hasSaveFile() {
    return hasSave();
  }

  // =================================================================
  // States
  // =================================================================
  startTitle(seed = null) {
    if (seed !== null) this.buildWorld(seed, true);
    this.state = 'title';
    this.stateTimer = 0;
    this.ui.menuIndex = 0;
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
    const s = seed === null ? (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0 : seed;
    this.buildWorld(s, false);
    this.state = 'playing';
    this.stateTimer = 0;
    this.ui.displayedMoney = this.player.money;
    this.ui.menuIndex = 0;
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
    const data = restore();
    if (!data) {
      if (!silent) this.ui.showToast('No save found.', 'warning', 2);
      return false;
    }
    this.buildWorld(data.seed || 1, false);
    const p = data.player || {};
    this.player.x = p.x ?? 2360;
    this.player.y = p.y ?? 1190;
    this.player.angle = p.angle ?? 0;
    this.player.health = p.health ?? 100;
    this.player.armor = p.armor ?? 25;
    this.player.money = p.money ?? 500;
    this.player.score = p.score ?? 0;
    this.player.currentWeaponIndex = Math.max(0, Math.min(4, p.weaponIndex ?? 1));
    if (p.ammo) {
      for (const key of Object.keys(this.player.ammo)) {
        if (p.ammo[key]) this.player.ammo[key] = { ...this.player.ammo[key], ...p.ammo[key] };
      }
    }
    this.timeOfDay = data.timeOfDay ?? TIME_OF_DAY.start;
    this.todBase = Math.min(0.9, this.timeOfDay);
    this.sessionTime = 0;
    if (data.weather) this.weather = { ...this.weather, ...data.weather, flash: 0 };
    const ms = data.missions || {};
    this.missions.currentIndex = Math.min(4, ms.currentIndex ?? 0);
    this.missions.completedCount = ms.completedCount ?? 0;
    this.missions.checkpointStep = ms.stepIndex ?? 0;
    if (ms.active && this.missions.currentIndex < this.missions.defs.length) {
      this.missions.resume(this.missions.currentIndex, ms.stepIndex ?? 0);
    }
    this.police.setWanted(data.wanted || 0);
    this.audio.setMuted(!!data.settings?.muted);
    this.audio.setStation(data.settings?.station ?? 0);
    this.traffic.seed(this.player.x, this.player.y, 18, 18);
    this.combat.populate(this.player.x, this.player.y, 42, 900);
    this.state = 'playing';
    this.ui.displayedMoney = this.player.money;
    this.ui.displayedHealth = this.player.health;
    this.ui.displayedArmor = this.player.armor;
    this.camera.x = this.player.x;
    this.camera.y = this.player.y;
    this.camera.zoom = 2.02;
    this.input.updateWorldMouse(this.camera);
    this.ui.setDistrict('Costa Sol', 'Welcome back');
    this.ui.showToast('Save loaded. The city kept your seat warm.', 'success', 3);
    return true;
  }

  autosave() {
    if (this.shotFrozen) return;
    const p = this.player;
    if (!p) return;
    const ok = persist({
      version: 2,
      seed: this.seed,
      timeOfDay: this.timeOfDay,
      weather: { ...this.weather, flash: 0 },
      player: {
        x: p.x, y: p.y, angle: p.angle,
        health: p.health, armor: p.armor, money: p.money, score: p.score,
        weaponIndex: p.currentWeaponIndex,
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
      flags: { endingSeen: this.missions.completedCount >= 5 },
    });
    if (ok) this.saveNotice = 2.2;
  }

  // =================================================================
  // Loop
  // =================================================================
  start() {
    this.running = true;
    this.lastFrame = performance.now();
    requestAnimationFrame((t) => this.frame(t));
  }

  frame(ts) {
    if (!this.running) return;
    const dt = Math.min(0.1, Math.max(0, (ts - this.lastFrame) / 1000));
    this.lastFrame = ts;
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
    requestAnimationFrame((t) => this.frame(t));
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

    const mouseStates = ['playing', 'dialogue', 'paused', 'missionComplete', 'missionFailed', 'wasted', 'busted'];
    if (mouseStates.includes(this.state)) this.input.updateWorldMouse(this.camera);

    switch (this.state) {
      case 'title':
        this.updateTitle(dt);
        this.handleMenuInput();
        break;
      case 'controls':
        this.updateAmbient(dt);
        this.handleControlsInput();
        break;
      case 'playing':
        this.updatePlaying(dt);
        break;
      case 'dialogue':
        this.stateTimer += dt;
        this.updateAmbientFrozen(dt);
        if (this.stateTimer > 0.35 && (this.input.confirm || this.input.mouse.clicked || this.input.wasPressed('KeyE'))) {
          this.dismissDialog();
        } else if (this.stateTimer > 10) {
          this.dismissDialog();
        }
        break;
      case 'paused':
        this.saveNotice = Math.max(0, this.saveNotice - dt);
        this.handlePauseInput(dt);
        break;
      case 'missionComplete':
        this.stateTimer += dt;
        this.updateAmbientFrozen(dt);
        if (this.input.confirm || this.input.mouse.clicked) this.continueAfterMission();
        else if (this.stateTimer > 8) this.continueAfterMission();
        break;
      case 'missionFailed':
        this.updateAmbientFrozen(dt);
        this.handleMissionFailedInput();
        break;
      case 'wasted':
      case 'busted':
        this.stateTimer += dt;
        this.updateAmbientFrozen(dt);
        if (this.stateTimer >= this.stateDuration) this.finishRespawn();
        break;
      case 'ending':
        this.updateAmbient(dt);
        this.handleEndingInput();
        break;
      default:
        break;
    }

    if (this.state === 'playing' || this.state === 'dialogue' || this.state === 'title' || this.state === 'ending' || this.state === 'missionComplete') {
      this.updateWeather(dt);
    }
    this.updateCamera(dt);
    this.ui.update(dt, this);
    this.updateDistrict();
    if (this.state === 'playing' || this.state === 'dialogue') {
      this.prompt = this.computePrompt();
      this.ui.prompt = this.prompt;
    } else {
      this.prompt = '';
      this.ui.prompt = '';
    }
  }

  updatePlaying(dt) {
    if (this.input.pause) {
      this.consumePress('Escape', 'KeyP');
      this.state = 'paused';
      this.ui.menuIndex = 0;
      this.audio.setTireScreech(0);
      return;
    }
    this.timeOfDay = Math.min(0.9, (this.todBase ?? TIME_OF_DAY.start) + (this.sessionTime / 900) * 0.42);
    this.city.update(dt, this.worldTime);
    this.tickHotwire(dt);

    if (this.player.isInVehicle && !this.player.hotwire) {
      this.drivePlayerVehicle(dt);
    } else if (!this.player.hotwire) {
      this.player.update(dt, this.input, this.city, this.particles, this.audio);

      const slot = this.input.weaponSlot;
      if (slot >= 0) this.player.setWeapon(slot);
      const wheel = this.input.cycleWeapon;
      if (wheel !== 0) {
        this.player.cycleWeapon(wheel);
        this.input.mouse.wheel = 0;
      }
      if (this.input.reload) this.player.reload(this.audio);

      if (this.input.mouse.down) this.combat.handlePlayerAttack(this.player, this.input, this.police, this.particles, this.audio, this);
      if (this.input.enterVehicle) this.interact();
      if (this.state !== 'playing') return;
    }

    this.missions.update(dt, this.player);
    this.traffic.update(dt, this.player, this.particles, this.audio, this.police);
    this.police.update(dt, this.player, this.particles, this.audio, this);
    this.combat.update(dt, this.player, this.traffic, this.police, this.particles, this.audio, this);
    this.pickups.update(dt, this.player, this);
    this.resolveVehicleCollisions(dt);
    this.particles.update(dt);
    this.updateHeatMusic();

    if (this.player.isInVehicle && this.player.vehicle) {
      const v = this.player.vehicle;
      const ratio = Math.min(1, Math.abs(v.speed) / (v.config.topSpeed || 1));
      this.audio.updateEngine(ratio, this.input.forward, this.input.backward);
      this.audio.setTireScreech(v.skidIntensity);
      if (v.isDestroyed) this.traffic.exitVehicle(this.player, this.city, this.audio, this.ui);
    } else {
      this.audio.setTireScreech(0);
      this.audio.stopEngine();
    }

    if (this.player.health <= 0 && this.state === 'playing') this.onWasted();
  }

  updateHeatMusic() {
    const stars = this.police.wantedStars;
    const mission = this.missions.active ? 1 : 0;
    this.audio.setMusicIntensity(stars >= 4 ? 3 : stars >= 2 ? 2 : stars > 0 ? 1 : mission ? 1 : 0);
  }

  updateAmbient(dt) {
    this.city.update(dt, this.worldTime);
    this.traffic.update(dt, this.player, this.particles, this.audio, this.police);
    for (const p of this.combat.pedestrians) p.update(dt, this.city, this.particles);
    this.particles.update(dt);
  }

  updateAmbientFrozen(dt) {
    this.particles.update(dt);
    this.audio.setTireScreech(0);
  }

  updateTitle(dt) {
    this.timeOfDay = Math.min(0.82, TIME_OF_DAY.start + (this.worldTime / 900) * 0.3);
    this.titleDrift += dt * 0.12;
    this.city.update(dt, this.worldTime);
    this.traffic.update(dt, this.player, this.particles, this.audio, this.police);
    for (const p of this.combat.pedestrians) p.update(dt, this.city, this.particles);
    this.particles.update(dt);
  }

  // =================================================================
  // Driving and interaction
  // =================================================================
  drivePlayerVehicle(dt) {
    const v = this.player.vehicle;
    if (!v || v.isDestroyed) return;
    this.player.tickTimers(dt);
    const forward = this.input.forward;
    const back = this.input.backward;
    const steer = (this.input.right ? 1 : 0) - (this.input.left ? 1 : 0);
    v.handbrake = this.input.handbrake;
    v.steer(steer);
    if (forward) v.accelerate(1, dt);
    else if (back) {
      if (v.speed > 40) v.brake(0.9, dt);
      else v.accelerate(-0.75, dt);
    }
    if (this.input.handbrake) v.brake(0.55, dt);
    if (this.input.horn) {
      this.consumePress('KeyH');
      this.audio.playHorn(0.8);
    }
    v.update(dt, this.city, this.particles, this.audio);
    this.player.x = v.x;
    this.player.y = v.y;
    this.player.angle = v.angle;
    this.player.vx = v.vx;
    this.player.vy = v.vy;
    if (v.impactPulse > 0.2) this.camera.shake = Math.max(this.camera.shake, v.impactPulse * 0.55);

    if (this.input.mouse.down) this.combat.handlePlayerAttack(this.player, this.input, this.police, this.particles, this.audio, this);
    if (this.input.reload) this.player.reload(this.audio);
    const slot = this.input.weaponSlot;
    if (slot >= 0) this.player.setWeapon(slot);
    const wheel = this.input.cycleWeapon;
    if (wheel !== 0) {
      this.player.cycleWeapon(wheel);
      this.input.mouse.wheel = 0;
    }
    if (this.input.enterVehicle) this.interact();
  }

  tickHotwire(dt) {
    const h = this.player.hotwire;
    if (!h) return;
    this.player.tickTimers(dt);
    const v = h.vehicle;
    if (!v || v.isDestroyed) {
      this.player.hotwire = null;
      this.ui.showToast('Hotwire failed — the car is wrecked.', 'danger', 2);
      return;
    }
    v.brake(1, dt);
    h.timer -= dt;
    if (h.timer <= 0) {
      const side = v.angle + Math.PI / 2;
      const ped = this.combat.spawnPedestrianAt(v.x + Math.cos(side) * 34, v.y + Math.sin(side) * 34);
      ped.fleeFrom(v.x, v.y);
      ped.speed = 175;
      ped.state = 'flee';
      ped.panicTimer = 5;
      v.driver = null;
      v.occupiedByCivilian = false;
      this.traffic.completeEnter(this.player, v, this.audio, this.ui, this.police);
      this.ui.showToast('Carjacked!', 'warning', 2.2);
      this.camera.shake = Math.max(this.camera.shake, 0.28);
    }
  }

  interact() {
    this.consumePress('KeyE', 'KeyF');
    const p = this.player;
    if (p.hotwire) return;
    if (p.isInVehicle) {
      this.traffic.exitVehicle(p, this.city, this.audio, this.ui);
      return;
    }
    const marker = this.missions.availableMarker();
    if (marker && Math.hypot(p.x - marker.x, p.y - marker.y) < marker.radius + 46) {
      this.missions.start(marker.index);
      return;
    }
    const vehicle = this.traffic.findNearestVehicle(p.x, p.y, 80);
    if (vehicle) {
      const speed = Math.hypot(vehicle.vx, vehicle.vy);
      const maxJackSpeed = vehicle.occupiedByCivilian ? 270 : 330;
      if (speed > maxJackSpeed) {
        this.ui.showToast('Too fast — slow the car down.', 'warning', 2);
        return;
      }
      this.traffic.enterVehicle(p, vehicle, this.audio, this.ui, this.police);
      return;
    }
    let nearestPed = null;
    let pd = 50;
    for (const ped of this.combat.pedestrians) {
      if (ped.isDead || ped.robbed) continue;
      const d = Math.hypot(p.x - ped.x, p.y - ped.y);
      if (d < pd) {
        pd = d;
        nearestPed = ped;
      }
    }
    if (nearestPed) {
      nearestPed.robbed = true;
      const cash = ECONOMY.robberyMin + Math.floor(Math.random() * (ECONOMY.robberyMax - ECONOMY.robberyMin));
      p.money += cash;
      p.score += 15;
      nearestPed.fleeFrom(p.x, p.y);
      this.audio.playCash();
      this.ui.showToast(`Robbed ${cash}. Somebody is calling it in.`, 'warning', 2.8);
      this.onCrime('robbery', 1);
    }
  }

  resolveVehicleCollisions(dt) {
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
        const aMass = a.config.mass;
        const bMass = b.config.mass;
        const total = aMass + bMass;
        a.x -= nx * overlap * (bMass / total);
        a.y -= ny * overlap * (bMass / total);
        b.x += nx * overlap * (aMass / total);
        b.y += ny * overlap * (aMass / total);
        const rel = Math.hypot(a.vx - b.vx, a.vy - b.vy);
        if (rel > 90) {
          const push = rel * 0.32;
          a.vx -= nx * push * (bMass / total);
          a.vy -= ny * push * (bMass / total);
          b.vx += nx * push * (aMass / total);
          b.vy += ny * push * (aMass / total);
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
        if (Math.hypot(v.x - this.player.x, v.y - this.player.y) < Math.max(v.width, v.length) * 0.5 + this.player.radius * 0.5) {
          this.player.takeDamage(55, this.particles, this.audio, Math.atan2(v.vy, v.vx));
          this.onPlayerHurt();
          this.camera.shake = Math.max(this.camera.shake, 0.7);
        }
      }
    }
    void dt;
  }

  allVehicles() {
    return [...this.traffic.vehicles, ...this.traffic.parked, ...this.police.cops, ...this.police.roadblocks];
  }

  // =================================================================
  // Events
  // =================================================================
  onCrime(kind, severity = 1) {
    if (this.state !== 'playing') return;
    const prev = this.police.wantedStars;
    let add = 0;
    if (kind === 'cop') add = 2;
    else if (kind === 'vehicular') add = 2;
    else if (kind === 'carjack') add = 1;
    else if (kind === 'robbery') add = 1;
    else if (kind === 'assault') add = 1;
    else if (kind === 'gunfire') add = 1;
    if (this.police.wantedStars === 0) {
      this.police.setWanted(Math.min(5, Math.max(1, add || severity)));
    } else if (kind === 'cop') {
      this.police.raiseWanted(1);
    } else if (this.crimeCooldown <= 0 && add > 0) {
      this.police.raiseWanted(1);
    }
    if (this.police.wantedStars > prev && this.crimeCooldown <= 0) {
      this.crimeCooldown = 4;
      this.ui.showToast(`WANTED — ${this.police.wantedStars} star${this.police.wantedStars === 1 ? '' : 's'}`, 'danger', 2.4);
      this.audio.playSirenChirp(this.police.wantedStars);
    }
  }

  notifyGunfire(x, y) {
    for (const p of this.combat.pedestrians) {
      if (!p.isDead) p.panic(x, y, 400);
    }
    this.traffic.panicAt(x, y, 360);
    let witness = this.police.witnessedCarjack(x, y);
    if (!witness) {
      for (const p of this.combat.pedestrians) {
        if (!p.isDead && Math.hypot(p.x - x, p.y - y) < 300) {
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

  showDialog(speaker, text) {
    this.ui.showDialog(speaker, text);
    this.dialogueReturn = 'playing';
    this.state = 'dialogue';
    this.stateTimer = 0;
    this.audio.playPickup();
  }

  dismissDialog() {
    this.ui.dialog = null;
    this.state = this.dialogueReturn || 'playing';
    this.stateTimer = 0;
    this.input.keysPressed.delete('Space');
    this.input.keysPressed.delete('Enter');
    this.input.keysPressed.delete('KeyE');
    this.input.keysPressed.delete('KeyF');
    this.input.mouse.clicked = false;
  }

  showMissionBanner(def, index) {
    this.ui.showMissionBanner(def, index);
  }

  onMissionComplete(def, reward) {
    const final = def.id === this.missions.defs.length || this.missions.completedCount >= this.missions.defs.length;
    this.missionComplete = { def, reward, final };
    this.missionFailed = null;
    this.state = 'missionComplete';
    this.stateTimer = 0;
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
      this.state = 'ending';
      this.stateTimer = 0;
      this.ui.menuIndex = 0;
      this.audio.playMissionPass();
      this.autosave();
    } else {
      this.state = 'playing';
      this.stateTimer = 0;
      this.ui.menuIndex = 0;
      this.missionComplete = null;
      if (this.missions.currentIndex < this.missions.defs.length) {
        this.ui.showToast(`Next marker: ${this.missions.defs[this.missions.currentIndex].title}`, 'neutral', 3.4);
      }
    }
  }

  onMissionFailed(def, reason) {
    this.missionFailed = { def, reason };
    this.state = 'missionFailed';
    this.audio.playMissionFail();
    this.audio.setPoliceSiren(false, 0);
    this.ui.menuIndex = 0;
    this.ui.banner = null;
    this.ui.toasts = [];
    this.ui.objectiveHint = '';
    this.input.mouse.clicked = false;
  }

  onWasted() {
    if (this.wastedTriggered || this.state === 'wasted' || this.state === 'busted') return;
    this.wastedTriggered = true;
    this.state = 'wasted';
    this.stateTimer = 0;
    this.stateDuration = 3.4;
    this.ui.banner = null;
    this.ui.toasts = [];
    this.audio.setPoliceSiren(false, 0);
    this.audio.stopEngine();
    if (this.missions.active) {
      this.pendingFail = { index: this.missions.currentIndex, reason: 'You were wasted.' };
      this.missions.failSilent('You were wasted.');
    }
    if (this.player.isInVehicle) {
      const v = this.player.vehicle;
      v.driver = null;
      v.isPlayerVehicle = false;
      v.aiMode = 'parked';
      this.player.vehicle = null;
    }
    const fee = WANTED_CONFIG.wastedFee;
    this.player.money = Math.max(0, this.player.money - fee);
    this.player.health = 0;
    this.police.clearWanted();
  }

  onBusted() {
    if (this.bustedTriggered || this.state === 'busted' || this.state === 'wasted') return;
    if (this.player.health <= 0) return;
    this.bustedTriggered = true;
    this.state = 'busted';
    this.stateTimer = 0;
    this.stateDuration = 3.4;
    this.ui.banner = null;
    this.ui.toasts = [];
    this.audio.setPoliceSiren(false, 0);
    this.audio.stopEngine();
    if (this.missions.active) {
      this.pendingFail = { index: this.missions.currentIndex, reason: 'You were busted.' };
      this.missions.failSilent('You were busted.');
    }
    if (this.player.isInVehicle) {
      const v = this.player.vehicle;
      v.driver = null;
      v.isPlayerVehicle = false;
      v.aiMode = 'parked';
      this.player.vehicle = null;
    }
    const fee = WANTED_CONFIG.bustedFine;
    this.player.money = Math.max(0, this.player.money - fee);
    this.player.health = Math.max(1, this.player.health);
    this.police.clearWanted();
  }

  finishRespawn() {
    const busted = this.state === 'busted';
    const point = busted
      ? { x: this.city.landmarks.policeStation.x, y: this.city.landmarks.policeStation.y + 106 }
      : { x: this.city.landmarks.hospital.x, y: this.city.landmarks.hospital.y + 106 };
    this.player.x = point.x;
    this.player.y = point.y;
    this.player.vx = 0;
    this.player.vy = 0;
    this.player.health = this.player.maxHealth;
    this.player.armor = busted ? 50 : 0;
    this.player.isRolling = false;
    this.player.hotwire = null;
    if (busted) {
      this.player.ammo.smg.reserve = 0;
      this.player.ammo.shotgun.reserve = 0;
      this.player.ammo.rifle.reserve = 0;
    }
    this.player.vehicle = null;
    this.police.reset();
    this.bustedTriggered = false;
    this.wastedTriggered = false;
    this.camera.x = point.x;
    this.camera.y = point.y;
    this.camera.shake = 0;
    this.ui.setDistrict(busted ? 'Vantage Heights' : 'Market Row', busted ? 'Costa Sol Police HQ' : 'Costa Sol General');
    this.ui.showToast(busted ? `Released with a $${WANTED_CONFIG.bustedFine} fine.` : `Patched up. Hospital bill $${WANTED_CONFIG.wastedFee}.`, 'warning', 3.4);
    if (this.pendingFail) {
      const def = this.missions.defs[this.pendingFail.index];
      this.missionFailed = { def, reason: this.pendingFail.reason };
      this.missions.lastFailed = { index: this.pendingFail.index, step: this.missions.checkpointStep, reason: this.pendingFail.reason };
      this.pendingFail = null;
      this.state = 'missionFailed';
      this.audio.playMissionFail();
    } else {
      this.state = 'playing';
    }
    this.stateTimer = 0;
    this.autosave();
  }

  // =================================================================
  // Weather
  // =================================================================
  updateWeather(dt) {
    const w = this.weather;
    w.timer -= dt;
    if (w.timer <= 0) {
      w.next = pick(this.weatherRng, WEATHER_CONFIG.types);
      w.timer = WEATHER_CONFIG.minSeconds + this.weatherRng() * (WEATHER_CONFIG.maxSeconds - WEATHER_CONFIG.minSeconds);
      w.type = w.next;
      w.wind = 0.2 + this.weatherRng() * 0.6;
      if (w.type === 'storm') w.timer *= 0.72;
    }
    const targetIntensity = WEATHER_CONFIG.rainIntensity[w.type] || 0;
    w.intensity += (targetIntensity - w.intensity) * Math.min(1, dt * 0.35);
    if (w.type === 'rain' || w.type === 'storm') {
      w.wetness = Math.min(1, w.wetness + dt * WEATHER_CONFIG.wetnessRise * (0.5 + w.intensity));
      if (w.type === 'storm' && w.flash <= 0 && this.weatherRng() < dt * 0.09) {
        w.flash = 1;
        this.audio.playThunder();
        this.camera.shake = Math.max(this.camera.shake, 0.25);
      }
    } else {
      w.wetness = Math.max(0, w.wetness - dt * WEATHER_CONFIG.wetnessDry);
    }
    w.flash = Math.max(0, w.flash - dt * 2.6);
    this.audio.setRain((w.type === 'rain' || w.type === 'storm') ? w.intensity : 0);
    if ((w.type === 'rain' || w.type === 'storm') && this.state === 'playing' && Math.random() < dt * 12 * w.intensity) {
      const x = this.camera.x + (Math.random() - 0.5) * (1280 / this.camera.zoom);
      const y = this.camera.y + (Math.random() - 0.5) * (720 / this.camera.zoom);
      this.particles.spawnRainSplash(x, y);
    }
  }

  setWeather(type, intensity = null) {
    if (!this.weather) return;
    this.weather.type = type;
    this.weather.intensity = intensity ?? (WEATHER_CONFIG.rainIntensity[type] || 0);
    this.weather.timer = 90;
    if (type === 'rain' || type === 'storm') this.weather.wetness = Math.max(this.weather.wetness, type === 'storm' ? 0.85 : 0.55);
    else this.weather.wetness = Math.max(0, this.weather.wetness - 0.2);
  }

  // =================================================================
  // Camera and district
  // =================================================================
  updateCamera(dt) {
    const cam = this.camera;
    let tx;
    let ty;
    let zoomTarget;
    if (this.state === 'title') {
      const t = this.titleDrift;
      tx = this.titleAnchor.x + Math.sin(t) * 38;
      ty = this.titleAnchor.y + Math.cos(t * 0.8) * 46;
      zoomTarget = 1.92;
    } else {
      const focus = this.player.isInVehicle && this.player.vehicle ? this.player.vehicle : this.player;
      const speed = this.player.isInVehicle && this.player.vehicle
        ? Math.hypot(this.player.vehicle.vx, this.player.vehicle.vy)
        : Math.hypot(this.player.vx, this.player.vy);
      const lead = this.player.isInVehicle ? 0.24 : 0.07;
      tx = focus.x + this.player.vx * lead;
      ty = focus.y + this.player.vy * lead;
      if (!this.player.isInVehicle) {
        const mx = this.input.mouse.worldX - focus.x;
        const my = this.input.mouse.worldY - focus.y;
        const md = Math.hypot(mx, my);
        if (md > 4) {
          tx += (mx / md) * 28;
          ty += (my / md) * 28;
        }
      }
      const ratio = Math.min(1, speed / 520);
      zoomTarget = 2.04 - ratio * 0.38;
      if (['wasted', 'busted'].includes(this.state)) zoomTarget = 1.72;
    }
    const halfW = 1280 / 2 / zoomTarget;
    const halfH = 720 / 2 / zoomTarget;
    tx = CAM_CLAMP(tx, halfW, WORLD - halfW);
    ty = CAM_CLAMP(ty, halfH, WORLD - halfH);
    const k = 1 - Math.exp(-dt * 6.2);
    cam.x += (tx - cam.x) * k;
    cam.y += (ty - cam.y) * k;
    cam.zoom += (zoomTarget - cam.zoom) * (1 - Math.exp(-dt * 3.2));
    cam.shake *= Math.exp(-dt * 6.5);
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
  // Prompts
  // =================================================================
  computePrompt() {
    const p = this.player;
    if (p.hotwire) return 'HOTWIRING…';
    if (p.isInVehicle) return `E / F   EXIT ${p.vehicle.config.name.toUpperCase()}`;
    const marker = this.missions.availableMarker();
    if (marker && Math.hypot(p.x - marker.x, p.y - marker.y) < marker.radius + 46) {
      return `START JOB — ${marker.mission.title.toUpperCase()}`;
    }
    const v = this.traffic.findNearestVehicle(p.x, p.y, 80);
    if (v) return v.occupiedByCivilian ? `CARJACK ${v.config.name.toUpperCase()}` : `STEAL ${v.config.name.toUpperCase()}`;
    for (const ped of this.combat.pedestrians) {
      if (!ped.isDead && !ped.robbed && Math.hypot(p.x - ped.x, p.y - ped.y) < 50) return 'ROB PEDESTRIAN';
    }
    if (p.isReloading) return 'RELOADING…';
    return '';
  }

  // =================================================================
  // Menus
  // =================================================================
  consumePress(...codes) {
    for (const c of codes) this.input.keysPressed.delete(c);
  }

  handleMenuInput() {
    const buttons = this.ui.buttons.filter((b) => !b.disabled);
    if (!buttons.length) return;
    if (this.input.wasPressed('ArrowDown') || this.input.wasPressed('KeyS')) {
      this.ui.menuIndex = (this.ui.menuIndex + 1) % buttons.length;
      this.consumePress('ArrowDown', 'KeyS');
    }
    if (this.input.wasPressed('ArrowUp') || this.input.wasPressed('KeyW')) {
      this.ui.menuIndex = (this.ui.menuIndex - 1 + buttons.length) % buttons.length;
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
      if (!this.loadSave()) this.ui.showToast('No save yet — start a new game.', 'warning', 2.4);
    } else if (action === 'controls') {
      this.controlsReturn = 'title';
      this.state = 'controls';
      this.ui.menuIndex = 0;
    } else if (action === 'back') {
      this.state = this.controlsReturn;
      this.ui.menuIndex = 0;
    }
  }

  handleControlsInput() {
    if (this.input.pause || this.input.wasPressed('Enter') || this.input.wasPressed('Escape')) {
      this.consumePress('Escape', 'Enter');
      this.state = this.controlsReturn;
      this.ui.menuIndex = 0;
      return;
    }
    if (this.input.mouse.clicked) {
      const action = this.ui.hitButton(this.input.mouse.x, this.input.mouse.y);
      if (action) {
        this.input.mouse.clicked = false;
        this.state = this.controlsReturn;
        this.ui.menuIndex = 0;
      }
    }
  }

  handlePauseInput(dt) {
    if (this.input.pause) {
      this.consumePress('Escape', 'KeyP');
      this.state = 'playing';
      return;
    }
    const buttons = this.ui.buttons.filter((b) => !b.disabled);
    if (!buttons.length) return;
    if (this.input.wasPressed('ArrowDown') || this.input.wasPressed('KeyS')) {
      this.ui.menuIndex = (this.ui.menuIndex + 1) % buttons.length;
      this.consumePress('ArrowDown', 'KeyS');
    }
    if (this.input.wasPressed('ArrowUp') || this.input.wasPressed('KeyW')) {
      this.ui.menuIndex = (this.ui.menuIndex - 1 + buttons.length) % buttons.length;
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
      this.state = 'controls';
      this.ui.menuIndex = 0;
    } else if (action === 'title') {
      this.autosave();
      this.state = 'title';
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
        if (action === 'retry') this.missions.retry();
        else if (action === 'abandon') this.missions.abandon();
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

  handleEndingInput() {
    if (this.input.mouse.clicked) {
      const action = this.ui.hitButton(this.input.mouse.x, this.input.mouse.y);
      if (action === 'title') {
        this.input.mouse.clicked = false;
        this.state = 'title';
        this.titleAnchor = { x: this.player.x, y: this.player.y };
        this.ui.menuIndex = 0;
      }
    }
    if (this.input.wasPressed('Enter') || this.input.wasPressed('Space') || this.input.wasPressed('Escape')) {
      this.consumePress('Enter', 'Space', 'Escape');
      this.state = 'title';
      this.titleAnchor = { x: this.player.x, y: this.player.y };
      this.ui.menuIndex = 0;
    }
  }

  // =================================================================
  // Render
  // =================================================================
  render() {
    this.renderer.render(this);
    const hudStates = ['playing', 'dialogue', 'paused', 'missionComplete', 'missionFailed', 'wasted', 'busted'];
    if (hudStates.includes(this.state)) {
      this.ui.drawHUD(this.ctx, this);
      if ((this.state === 'playing' || this.state === 'dialogue') && this.player.hitFlash > 0.03) {
        const ctx = this.ctx;
        const grad = ctx.createRadialGradient(640, 360, 240, 640, 360, 780);
        grad.addColorStop(0, 'rgba(160, 20, 30, 0)');
        grad.addColorStop(1, `rgba(160, 20, 30, ${this.player.hitFlash * 0.32})`);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 1280, 720);
      }
    }
    this.ui.drawScreens(this.ctx, this);
  }

  // =================================================================
  // Debug and screenshots
  // =================================================================
  setWanted(n) {
    this.police.setWanted(n);
  }

  startMission(index = 0, step = 0) {
    if (index < 0 || index >= this.missions.defs.length) return false;
    this.state = 'playing';
    const started = this.missions.start(index);
    if (!started) return false;
    if (step > 0) {
      this.missions.stepIndex = Math.min(step, this.missions.defs[index].steps.length - 1);
      this.missions.checkpointStep = this.missions.stepIndex;
      this.missions.setupStep(true);
    }
    this.ui.dialog = null;
    this.state = 'playing';
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
      setWanted: (n) => game.setWanted(n),
      startMission: (i, s = 0) => game.startMission(i, s),
      get state() { return game.state; },
      get shotReady() { return game.shotReady; },
      get frameTimes() { return game.frameTimes; },
    };
  }

  // Developer convenience: used by tests and the URL helper.
  snapshot() {
    return {
      state: this.state,
      seed: this.seed,
      player: { x: Math.round(this.player.x), y: Math.round(this.player.y), health: this.player.health, money: this.player.money },
      wanted: this.police.wantedStars,
      mission: this.missions.active ? this.missions.currentIndex : null,
      weather: this.weather.type,
      traffic: this.traffic.vehicles.length,
      peds: this.combat.pedestrians.length,
      enemies: this.combat.enemies.length,
    };
  }

  static titleForSeed(seed) {
    return `${GAME_TITLE} · ${seedFrom(String(seed)) % 997}`;
  }
}
