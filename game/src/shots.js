// Leonida Heat v3 - deterministic staged scenes for the four screenshots.
// ?shot=menu|city|chase|mission&seed=2026 asks for a fresh seeded world,
// plays it forward with the game's own update loop and a tiny autopilot, poses
// the final frame, freezes the simulation and raises __game.shotReady.
// Nothing here is a mock frame: every pixel comes from the live game.

import { STEP } from './config.js';
import { Vehicle } from './entities.js';

function clearKeys(game) {
  game.input.keysDown.clear();
  game.input.keysPressed.clear();
  game.input.mouse.down = false;
  game.input.mouse.clicked = false;
}

function aimAt(game, wx, wy) {
  const cam = game.camera;
  game.input.mouse.x = 640 + (wx - cam.x) * cam.zoom;
  game.input.mouse.y = 360 + (wy - cam.y) * cam.zoom;
  game.input.updateWorldMouse(cam);
}

function walk(game, dirs, aimX, aimY) {
  clearKeys(game);
  for (const d of dirs) game.input.keysDown.add(d);
  aimAt(game, aimX, aimY);
}

function driveToward(game, tx, ty, throttle = true) {
  const v = game.player.vehicle;
  if (!v) return;
  clearKeys(game);
  if (throttle) game.input.keysDown.add('KeyW');
  const desired = Math.atan2(ty - v.y, tx - v.x);
  let diff = desired - v.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  if (diff > 0.04) game.input.keysDown.add('KeyD');
  if (diff < -0.04) game.input.keysDown.add('KeyA');
}

function cleanUi(game, keepDistrict = false) {
  game.ui.banner = null;
  game.ui.toasts = [];
  game.ui.prompt = '';
  game.prompt = '';
  game.ui.dialog = null;
  if (!keepDistrict) game.ui.districtTimer = 0;
}

function clearNearbyPeds(game, x, y, radius = 52) {
  game.combat.pedestrians = game.combat.pedestrians.filter((p) => Math.hypot(p.x - x, p.y - y) > radius);
}

function stageCar(game, type, x, y, angle, color = null) {
  const car = new Vehicle(type, x, y, angle, color);
  car.aiMode = 'traffic';
  car.driver = { civilian: true };
  car.cruiseSpeed = 0;
  car.headlightsOn = true;
  game.traffic.vehicles.push(car);
  return car;
}

function stagePed(game, x, y, a, extra = {}) {
  const ped = game.combat.spawnPedestrianAt(x, y, extra);
  ped.angle = a;
  ped.facing = a > -0.8 && a < 0.8 ? 3 : a > 2.2 || a < -2.2 ? 1 : a > 0 ? 0 : 2;
  ped.umbrella = !!extra.umbrella;
  return ped;
}

function freeze(game) {
  game.input.mouse.down = false;
  game.input.keysDown.clear();
  game.shotStaging = false;
  game.shotFrozen = true;
  game.shotReady = true;
  game.ui.menuIndex = 0;
}

function setClock(game, t) {
  game.sessionTime = 0;
  game.timeOfDay = t;
  game.todBase = t;
}

export function stageShot(game, name, seed = 2026) {
  game.shotFrozen = true;
  game.shotStaging = true;
  game.shotReady = false;
  game.simulate = null;
  const scene = ['menu', 'city', 'chase', 'mission'].includes(name) ? name : 'menu';

  if (scene === 'menu') {
    game.buildWorld(seed, true);
    game.startTitle();
    setClock(game, 0.73);
    game.setWeather('haze', 0.05);
    game.weather.wind = 0.5;
    game.state = 'title';
    game.camera.x = 2460;
    game.camera.y = 1290;
    game.camera.zoom = 1.72;
    game.titleAnchor = { x: 2460, y: 1290 };
    game.shotFrozen = false;
    for (let i = 0; i < 120; i += 1) game.update(STEP);
    const ocean = game.city.roads.find((r) => r.name === 'Ocean Boulevard');
    if (ocean) {
      for (let i = 0; i < 6; i += 1) {
        const car = game.traffic.spawnOnRoad(ocean, 0.34 + i * 0.045, i % 2 === 0 ? 1 : -1);
        if (car) car.headlightsOn = true;
      }
    }
    for (const spot of [
      { x: 2520, y: 1510, a: -1.4 },
      { x: 2538, y: 1560, a: 1.6 },
      { x: 2510, y: 1610, a: -0.2 },
      { x: 2640, y: 1440, a: 2.5 },
    ]) {
      stagePed(game, spot.x, spot.y, spot.a, { umbrella: true });
    }
    game.camera.x = 2460;
    game.camera.y = 1290;
    game.camera.zoom = 1.72;
    game.camera.shake = 0;
    game.state = 'title';
    cleanUi(game, true);
    freeze(game);
  } else if (scene === 'city') {
    game.buildWorld(seed, false);
    game.state = 'playing';
    setClock(game, 0.7);
    game.setWeather('clear', 0);
    game.weather.wind = 0.32;
    game.player.x = 2522;
    game.player.y = 1440;
    game.player.angle = -Math.PI / 2;
    game.player.armor = 80;
    game.player.money = 4180;
    game.player.score = 2160;
    game.player.giveWeapon('pistol', 1);
    game.player.setWeapon(1);
    game.traffic.seed(2460, 1320, 26, 24);
    game.combat.populate(2500, 1360, 58, 820);
    game.camera.x = 2512;
    game.camera.y = 1410;
    game.camera.zoom = 2.02;
    game.ui.setDistrict('Coral Strip', 'Beachfront & Neon Boardwalk');
    game.shotFrozen = false;
    for (let i = 0; i < 45; i += 1) {
      walk(game, ['KeyW'], 2524, game.player.y - 42);
      game.update(STEP);
    }
    const camX = game.player.x - 12;
    const camY = game.player.y - 58;
    game.traffic.vehicles = game.traffic.vehicles.filter((v) => Math.hypot(v.x - camX, v.y - camY) > 300);
    stageCar(game, 'vipera', 2423, 1210, -Math.PI / 2);
    stageCar(game, 'meridian', 2377, 1258, Math.PI / 2);
    stageCar(game, 'marlin', 2423, 1322, -Math.PI / 2, '#ff5f7e');
    stageCar(game, 'cabrio', 2377, 1382, Math.PI / 2, '#ffe2b8');
    stageCar(game, 'hauler', 2423, 1442, -Math.PI / 2, '#c46b2f');
    stageCar(game, 'boxer', 2377, 1504, Math.PI / 2);
    stageCar(game, 'wasp', 2377, 1152, Math.PI / 2, '#24d98a');
    stageCar(game, 'meridian', 2423, 1568, -Math.PI / 2, '#6f8ea3');
    game.traffic.parked = game.traffic.parked.filter((v) => Math.hypot(v.x - camX, v.y - camY) > 250);
    for (const p of game.combat.pedestrians) p.umbrella = false;
    clearNearbyPeds(game, game.player.x, game.player.y, 58);
    for (const spot of [
      { x: 2504, y: 1340, a: 0.4 },
      { x: 2538, y: 1310, a: -2.7 },
      { x: 2500, y: 1402, a: 2.8 },
      { x: 2538, y: 1270, a: -0.4 },
      { x: 2620, y: 1300, a: 1.2 },
      { x: 2660, y: 1430, a: -1.7 },
      { x: 2512, y: 1168, a: 0.2 },
      { x: 2600, y: 1180, a: 2.6 },
    ]) {
      stagePed(game, spot.x, spot.y, spot.a);
    }
    clearKeys(game);
    game.camera.x = game.player.x - 12;
    game.camera.y = game.player.y - 58;
    game.camera.zoom = 2.02;
    game.camera.shake = 0;
    game.ui.dialog = null;
    cleanUi(game, true);
    freeze(game);
  } else if (scene === 'chase') {
    game.buildWorld(seed, false);
    game.state = 'playing';
    setClock(game, 0.845);
    game.setWeather('rain', 0.78);
    game.weather.wetness = 0.9;
    game.weather.wind = 0.62;
    game.startMission(0, 2);
    game.ui.dialog = null;
    game.state = 'playing';
    game.player.money = 5280;
    game.player.health = 100;
    game.player.armor = 100;
    game.player.score = 3450;
    game.player.giveWeapon('smg', 2);
    game.player.giveWeapon('shotgun', 1);
    game.player.setWeapon(2);
    game.setWanted(3);
    game.police.dispatchTimer = 9999;
    game.police.footDispatchTimer = 9999;
    game.police.roadblockTimer = 9999;
    game.police.cops = [];
    game.police.roadblocks = [];
    game.teleport(1850, 1376, Math.PI + 0.08);
    const hero = game.debugEnterCar('marlin', 1850, 1376, Math.PI + 0.08, 322);
    hero.color = '#ff4d6d';
    hero.hp = 900;
    hero.maxHp = 900;
    hero.stuntCooldown = 1;
    // Point the job card at Rustline: the hero car is the delivery car.
    if (game.missions.targetVehicle && game.missions.targetVehicle !== hero) {
      const stale = game.missions.targetVehicle;
      const idx = game.traffic.vehicles.indexOf(stale);
      if (idx >= 0) game.traffic.vehicles.splice(idx, 1);
    }
    game.missions.targetVehicle = hero;
    game.missions.stepTarget = { x: 350, y: 2570, radius: 82 };
    game.missions.stepTimer = 18;
    game.missions.checkpointStep = 2;
    game.ui.dialog = null;
    game.state = 'playing';
    game.police.lastKnown = { x: hero.x, y: hero.y };

    const copA = new Vehicle('patrol', 1955, 1376, Math.PI);
    const copB = new Vehicle('patrol', 2030, 1376, Math.PI);
    const copC = new Vehicle('interceptor', 1990, 1440, Math.PI);
    for (const cop of [copA, copB, copC]) {
      cop.sirenActive = true;
      cop.sirenPhase = cop === copB;
      cop.aiMode = 'police';
      cop.driver = { isCop: true };
      cop.hp = 240;
      game.police.cops.push(cop);
    }
    game.camera.zoom = 1.56;
    game.shotFrozen = false;
    for (let i = 0; i < 58; i += 1) {
      driveToward(game, 1850 - 620, 1376, hero.speed < 300);
      game.input.mouse.down = false;
      aimAt(game, hero.x - 260, hero.y + 420);
      game.update(STEP);
    }

    if (game.player.vehicle) {
      game.traffic.vehicles = game.traffic.vehicles.filter(
        (v) => v === game.player.vehicle || v.isMission || Math.hypot(v.x - game.player.x, v.y - game.player.y) > 210,
      );
      game.traffic.parked = game.traffic.parked.filter((v) => Math.hypot(v.x - game.player.x, v.y - game.player.y) > 210);
    }
    const car = game.player.vehicle;
    if (car) {
      car.x = 1840;
      car.y = 1376;
      car.angle = Math.PI + 0.12;
      car.vx = Math.cos(car.angle) * 318;
      car.vy = Math.sin(car.angle) * 318;
      car.color = '#ff4d6d';
      car.hp = 900;
      car.maxHp = 900;
      car.sirenActive = false;
      game.player.x = car.x;
      game.player.y = car.y;
      game.player.vx = car.vx;
      game.player.vy = car.vy;
      game.player.angle = car.angle;

      const layout = [
        { cop: copA, x: car.x + 74, y: car.y - 2, angle: Math.PI + 0.04 },
        { cop: copB, x: car.x + 146, y: car.y + 2, angle: Math.PI },
        { cop: copC, x: car.x + 100, y: car.y + 58, angle: Math.PI - 0.03 },
      ];
      for (let i = 0; i < layout.length; i += 1) {
        const item = layout[i];
        const cop = item.cop;
        cop.x = item.x;
        cop.y = item.y;
        cop.angle = item.angle;
        cop.vx = Math.cos(item.angle) * (340 + i * 8);
        cop.vy = Math.sin(item.angle) * (340 + i * 8);
        cop.hp = 240;
        cop.sirenActive = true;
        cop.sirenPhase = i % 2 === 0;
        cop.aiMode = 'police';
        cop.driver = { isCop: true };
      }
      game.police.cops = [copA, copB, copC];
      game.police.hasSight = true;
      game.police.searching = false;
      game.police.lastKnown = { x: car.x, y: car.y };

      const fwdX = Math.cos(car.angle);
      const fwdY = Math.sin(car.angle);
      const rightX = -fwdY;
      const rightY = fwdX;
      for (let i = 1; i <= 20; i += 1) {
        const back = i * 10;
        const wobble = Math.sin(i * 0.6) * 5 + i * 2.6;
        const bx = car.x - fwdX * back + rightX * wobble;
        const by = car.y - fwdY * back + rightY * wobble;
        game.city.addSkidMark(bx + rightX * car.width * 0.34, by + rightY * car.width * 0.34, car.angle, 0.85 * (1 - i / 28));
        game.city.addSkidMark(bx - rightX * car.width * 0.34, by - rightY * car.width * 0.34, car.angle, 0.85 * (1 - i / 28));
      }
      for (let i = 0; i < 14; i += 1) {
        game.particles.spawnTyreSmoke(
          car.x - fwdX * (22 + i * 16) + rightX * (i % 2 ? 10 : -10),
          car.y - fwdY * (22 + i * 16) + rightY * (i % 2 ? 10 : -10),
          0.8,
        );
      }
      for (const cop of [copA, copB, copC]) {
        game.particles.spawnRainSplash(cop.x + 12, cop.y + 20);
        game.particles.spawnRainSplash(cop.x - 18, cop.y - 8);
      }
    }

    game.player.setWeapon(2);
    game.setWanted(3);
    game.police.searching = false;
    game.police.hasSight = true;
    game.police.cooldownTimer = 15;
    game.camera.x = 1800;
    game.camera.y = 1376;
    game.camera.zoom = 1.56;
    game.camera.shake = 0;
    game.ui.dialog = null;
    game.ui.setDistrict('Vantage Heights', 'Grand Avenue · Night Pursuit');
    cleanUi(game, true);
    game.ui.showToast('WANTED 3 · ROADBLOCK AHEAD', 'danger', 3);
    freeze(game);
  } else {
    game.buildWorld(seed, false);
    game.state = 'playing';
    setClock(game, 0.756);
    game.setWeather('clear', 0);
    game.weather.wetness = 0.05;
    game.player.money = 4120;
    game.player.health = 92;
    game.player.armor = 74;
    game.player.score = 4880;
    game.startMission(1, 1);
    game.ui.dialog = null;
    game.state = 'playing';
    game.player.giveWeapon('smg', 2);
    game.player.setWeapon(2);
    game.player.grenades = 3;

    const car = game.missions.targetVehicle;
    if (car) {
      car.color = '#2f6bff';
      car.hp = car.maxHp;
      car.x = 1840;
      car.y = 1556;
      car.angle = Math.PI / 2;
    }
    game.teleport(1702, 1446, -Math.PI / 2 + 0.14);
    const guards = [...game.combat.enemies];
    const spots = [
      { x: 1798, y: 1458 },
      { x: 1736, y: 1498 },
      { x: 1846, y: 1376 },
      { x: 1870, y: 1440 },
    ];
    guards.forEach((g, i) => {
      const spot = spots[i % spots.length];
      g.x = spot.x;
      g.y = spot.y;
      g.health = i === 0 ? 170 : 460;
      g.maxHealth = g.health;
      g.moveSpeed = 0;
      g.state = 'combat';
      g.fireTimer = 0.3 + i * 0.2;
      g.reaction = 0;
      g.lastSeen = { x: game.player.x, y: game.player.y };
      g.angle = Math.atan2(game.player.y - g.y, game.player.x - g.x);
    });
    if (guards[0]) guards[0].takeDamage(999, game.particles, game.audio);
    game.setWanted(2);
    game.police.dispatchTimer = 9999;
    game.police.footDispatchTimer = 9999;
    game.police.roadblockTimer = 9999;
    game.police.cops = [];
    game.police.roadblocks = [];
    game.police.searching = true;
    game.traffic.seed(1780, 1460, 18, 18);
    game.traffic.parked = game.traffic.parked.filter((v) => Math.hypot(v.x - 1800, v.y - 1460) > 140);
    game.combat.populate(1790, 1460, 26, 340);
    for (const spot of [
      { x: 1920, y: 1510, a: -2.2 },
      { x: 1690, y: 1360, a: 0.4 },
      { x: 1870, y: 1358, a: 2.4 },
    ]) {
      const ped = game.combat.spawnPedestrianAt(spot.x, spot.y);
      ped.angle = spot.a;
      ped.facing = spot.a > 0 ? 0 : 2;
    }
    game.combat.pedestrians = game.combat.pedestrians.filter(
      (p) => Math.hypot(p.x - 1702, p.y - 1446) > 72 && Math.hypot(p.x - 1840, p.y - 1556) > 84,
    );
    game.camera.x = 1778;
    game.camera.y = 1472;
    game.camera.zoom = 1.98;
    game.shotFrozen = false;
    for (let i = 0; i < 92; i += 1) {
      clearKeys(game);
      const target = game.combat.enemies.find((e) => !e.isDead) || { x: 1798, y: 1458 };
      aimAt(game, target.x, target.y + 2);
      game.input.mouse.down = i > 34;
      game.update(STEP);
      if (i === 60) {
        game.combat.throwGrenade(1750, 1410, 0.4, 'player', 0.8);
      }
    }
    for (const g of guards) {
      if (!g || g.isDead) continue;
      g.health = Math.max(70, g.health);
      g.state = 'combat';
      g.x = Math.max(1740, Math.min(1860, g.x));
      g.y = Math.max(1400, Math.min(1510, g.y));
      g.angle = Math.atan2(game.player.y - g.y, game.player.x - g.x);
    }
    game.player.health = Math.max(game.player.health, 68);
    game.player.x = 1702;
    game.player.y = 1446;
    game.player.angle = Math.atan2(1458 - 1446, 1798 - 1702);

    const px = game.player.x + Math.cos(game.player.angle) * 27;
    const py = game.player.y + Math.sin(game.player.angle) * 27;
    if (!game.combat.bullets.some((b) => b.owner === 'player')) {
      game.combat.fireBullet(px, py, game.player.angle, game.player.weapon, 'player');
    }
    game.player.muzzleTimer = 0.07;
    game.particles.spawnMuzzle(px, py, game.player.angle, 12);
    for (const g of guards) {
      if (!g || g.isDead) continue;
      g.angle = Math.atan2(game.player.y - g.y, game.player.x - g.x);
      if (!game.combat.bullets.some((b) => b.owner === 'enemy')) {
        game.combat.fireBullet(g.x + Math.cos(g.angle) * 18, g.y + Math.sin(g.angle) * 18, g.angle + 0.04, g.weapon, 'enemy');
      }
      game.particles.spawnMuzzle(g.x + Math.cos(g.angle) * 18, g.y + Math.sin(g.angle) * 18, g.angle, 9);
    }
    // The money shot: a frag is mid-air, both sides have tracers out, and a
    // guard has just taken a hit by the fountain.
    game.particles.spawnSparks(1808, 1408, 7, 0.75);
    game.particles.spawnHit(1808, 1410, 7, -1.0);
    game.particles.spawnDust(1812, 1392, 2, 6);
    game.particles.spawnShell(game.player.x, game.player.y, game.player.angle);
    game.particles.spawnGlass(1840, 1500, 6, 1.2);
    game.combat.fireBullet(1760, 1428, -0.18, { speed: 1200, damage: 0, range: 200 }, 'player');
    game.combat.fireBullet(1758, 1434, 0.28, { speed: 1200, damage: 0, range: 200 }, 'player');
    for (const b of game.combat.bullets) {
      if (b.owner === 'player' && Math.random() < 0.5) {
        b.px = b.x - Math.cos(b.angle) * 120;
        b.py = b.y - Math.sin(b.angle) * 120;
      }
    }
    game.combat.grenades = [{
      id: 99,
      x: 1748, y: 1418, z: 58, vx: 40, vy: 60, vz: 20,
      fuse: 1.2, owner: 'player', bounces: 0, spin: 1.4, radius: 132,
    }];
    game.particles.spawnSmoke(1750, 1414, 'rgba(70, 68, 74, 0.5)', 2, 10, 18);
    game.camera.x = 1778;
    game.camera.y = 1472;
    game.camera.zoom = 1.98;
    game.camera.shake = 0;
    game.setWanted(3);
    game.police.searching = false;
    game.police.hasSight = true;
    game.police.cooldownTimer = 15;
    game.police.lastKnown = { x: game.player.x, y: game.player.y };
    game.ui.dialog = null;
    game.ui.setDistrict('Vantage Heights', 'Vantage Plaza · Shots Fired');
    cleanUi(game, true);
    game.ui.showToast('Guards on the Vipera - clear them out', 'danger', 3);
    game.ui.showToast('Grenade out · watch the fountain', 'warning', 2.5);
    freeze(game);
  }

  return game;
}
