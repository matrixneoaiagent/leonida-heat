// Leonida Heat - deterministic staged scenes for the four screenshots.
// ?shot=menu|city|chase|mission&seed=2026 asks for a fresh seeded world,
// plays it forward with the game's own update loop and a tiny autopilot, then
// freezes on a real rendered frame and raises __game.shotReady.

import { STEP } from './config.js';
import { Vehicle } from './entities.js';

function clearKeys(game) {
  game.input.keysDown.clear();
  game.input.keysPressed.clear();
  game.input.mouse.down = false;
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
  if (!keepDistrict) game.ui.districtTimer = 0;
}

function clearNearbyPeds(game, x, y, radius = 52) {
  game.combat.pedestrians = game.combat.pedestrians.filter((p) => Math.hypot(p.x - x, p.y - y) > radius);
}

function stageCar(game, type, x, y, angle) {
  const car = new Vehicle(type, x, y, angle);
  car.aiMode = 'traffic';
  car.driver = { civilian: true };
  car.cruiseSpeed = 0;
  game.traffic.vehicles.push(car);
  return car;
}

function stagePed(game, x, y, a, extra = {}) {
  const ped = game.combat.spawnPedestrianAt(x, y, extra);
  ped.angle = a;
  ped.facing = a > -0.8 && a < 0.8 ? 3 : a > 2.2 || a < -2.2 ? 1 : a > 0 ? 0 : 2;
  ped.umbrella = false;
  return ped;
}

function freeze(game) {
  game.input.mouse.down = false;
  game.shotFrozen = true;
  game.shotReady = true;
  game.ui.menuIndex = 0;
}

export function stageShot(game, name, seed = 2026) {
  game.shotFrozen = true;
  game.shotReady = false;
  game.simulate = null;
  const scene = ['menu', 'city', 'chase', 'mission'].includes(name) ? name : 'menu';

  if (scene === 'menu') {
    game.buildWorld(seed, true);
    game.startTitle();
    game.timeOfDay = 0.58;
    game.todBase = 0.58;
    game.setWeather('clear', 0);
    game.shotFrozen = false;
    for (let i = 0; i < 110; i += 1) game.update(STEP);
    const ocean = game.city.roads.find((r) => r.name === 'Ocean Boulevard');
    if (ocean) {
      for (let i = 0; i < 5; i += 1) game.traffic.spawnOnRoad(ocean, 0.34 + i * 0.042, i % 2 === 0 ? 1 : -1);
    }
    game.state = 'title';
    cleanUi(game, true);
    freeze(game);
  } else if (scene === 'city') {
    game.buildWorld(seed, false);
    game.state = 'playing';
    game.timeOfDay = 0.4;
    game.todBase = 0.4;
    game.setWeather('clear', 0);
    game.weather.wind = 0.25;
    game.player.x = 2508;
    game.player.y = 1420;
    game.player.angle = -Math.PI / 2;
    game.player.armor = 80;
    game.player.money = 3180;
    game.player.score = 1280;
    game.traffic.seed(2460, 1260, 24, 22);
    game.combat.populate(2500, 1240, 56, 820);
    game.camera.x = 2494;
    game.camera.y = 1370;
    game.camera.zoom = 2.02;
    game.ui.setDistrict('Coral Strip', 'Beachfront & Neon Boardwalk');
    game.shotFrozen = false;
    for (let i = 0; i < 100; i += 1) {
      walk(game, ['KeyW'], 2524, game.player.y - 42);
      game.update(STEP);
    }
    // A clear day with traffic queuing along Ocean Boulevard and a crowd on
    // the boardwalk. Vehicles are posed after the walk so the hero stays
    // readable and nothing overlaps him.
    const camX = game.player.x - 14;
    const camY = game.player.y - 50;
    game.traffic.vehicles = game.traffic.vehicles.filter(
      (v) => Math.hypot(v.x - camX, v.y - camY) > 300,
    );
    stageCar(game, 'vipera', 2423, 915, -Math.PI / 2);
    stageCar(game, 'meridian', 2377, 959, Math.PI / 2);
    stageCar(game, 'marlin', 2423, 1019, -Math.PI / 2);
    stageCar(game, 'hauler', 2377, 1075, Math.PI / 2);
    stageCar(game, 'meridian', 2423, 1131, -Math.PI / 2);
    stageCar(game, 'boxer', 2377, 1179, Math.PI / 2);
    stageCar(game, 'wasp', 2377, 855, Math.PI / 2);
    game.traffic.parked = game.traffic.parked.filter(
      (v) => Math.hypot(v.x - camX, v.y - camY) > 240,
    );

    for (const p of game.combat.pedestrians) p.umbrella = false;
    clearNearbyPeds(game, game.player.x, game.player.y, 58);
    for (const spot of [
      { x: 2470, y: 999, a: 0.4 },
      { x: 2524, y: 1007, a: -2.6 },
      { x: 2566, y: 1043, a: -0.4 },
      { x: 2538, y: 1133, a: 2.6 },
      { x: 2590, y: 1071, a: 1.1 },
      { x: 2612, y: 1157, a: -1.8 },
      { x: 2478, y: 1173, a: 0.2 },
      { x: 2506, y: 943, a: 2.9 },
    ]) {
      stagePed(game, spot.x, spot.y, spot.a);
    }
    clearKeys(game);
    game.camera.x = game.player.x - 14;
    game.camera.y = game.player.y - 50;
    game.camera.zoom = 2.02;
    game.camera.shake = 0;
    game.ui.dialog = null;
    cleanUi(game, true);
    freeze(game);
  } else if (scene === 'chase') {
    game.buildWorld(seed, false);
    game.state = 'playing';
    game.timeOfDay = 0.73;
    game.todBase = 0.73;
    game.setWeather('rain', 0.62);
    game.weather.wetness = 0.82;
    game.startMission(0, 0);
    game.ui.dialog = null;
    game.state = 'playing';
    game.player.money = 4280;
    game.player.health = 100;
    game.player.armor = 100;
    game.player.score = 1450;
    game.player.giveWeapon('smg', 2);
    game.player.giveWeapon('shotgun', 1);
    game.setWanted(3);
    game.police.dispatchTimer = 9999;
    game.police.footDispatchTimer = 9999;
    game.police.roadblockTimer = 9999;
    game.police.cops = [];
    game.police.roadblocks = [];
    game.teleport(1880, 1376, Math.PI + 0.12);
    const hero = game.debugEnterCar('marlin', 1880, 1376, Math.PI + 0.12, 300);
    hero.color = '#ff4d6d';
    hero.hp = 900;
    hero.maxHp = 900;
    // Pose the job at its delivery objective so the on-screen card matches the
    // chase: the hero car is the Marlin and Rustline is the destination.
    game.missions.stepIndex = 2;
    game.missions.checkpointStep = 2;
    game.missions.setupStep(true);
    if (game.missions.targetVehicle && game.missions.targetVehicle !== hero) {
      const stale = game.missions.targetVehicle;
      const idx = game.traffic.vehicles.indexOf(stale);
      if (idx >= 0) game.traffic.vehicles.splice(idx, 1);
    }
    game.missions.targetVehicle = hero;
    game.missions.stepTarget = { x: 350, y: 2570, radius: 82 };
    game.ui.dialog = null;
    game.state = 'playing';
    game.police.lastKnown = { x: hero.x, y: hero.y };

    const copA = new Vehicle('patrol', 1975, 1376, Math.PI);
    const copB = new Vehicle('patrol', 2045, 1376, Math.PI);
    const copC = new Vehicle('interceptor', 1940, 1432, Math.PI);
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
      driveToward(game, 1880 - 620, 1376, hero.speed < 300);
      game.input.mouse.down = false;
      aimAt(game, hero.x - 260, hero.y + 420);
      game.update(STEP);
    }

    if (game.player.vehicle) {
      game.traffic.vehicles = game.traffic.vehicles.filter(
        (v) => v === game.player.vehicle || v.isMission || Math.hypot(v.x - game.player.x, v.y - game.player.y) > 200,
      );
      game.traffic.parked = game.traffic.parked.filter((v) => Math.hypot(v.x - game.player.x, v.y - game.player.y) > 200);
    }
    const car = game.player.vehicle;
    if (car) {
      car.x = 1880;
      car.y = 1376;
      car.angle = Math.PI + 0.13;
      car.vx = Math.cos(car.angle) * 315;
      car.vy = Math.sin(car.angle) * 315;
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
        { cop: copA, x: car.x + 72, y: car.y - 2, angle: Math.PI + 0.04 },
        { cop: copB, x: car.x + 142, y: car.y + 2, angle: Math.PI },
        { cop: copC, x: car.x + 96, y: car.y + 56, angle: Math.PI - 0.03 },
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
      for (let i = 1; i <= 18; i += 1) {
        const back = i * 10;
        const wobble = Math.sin(i * 0.6) * 5 + i * 2.6;
        const bx = car.x - fwdX * back + rightX * wobble;
        const by = car.y - fwdY * back + rightY * wobble;
        game.city.addSkidMark(bx + rightX * car.width * 0.34, by + rightY * car.width * 0.34, car.angle, 0.8 * (1 - i / 26));
        game.city.addSkidMark(bx - rightX * car.width * 0.34, by - rightY * car.width * 0.34, car.angle, 0.8 * (1 - i / 26));
      }
      for (let i = 0; i < 12; i += 1) {
        game.particles.spawnTyreSmoke(
          car.x - fwdX * (22 + i * 16) + rightX * (i % 2 ? 10 : -10),
          car.y - fwdY * (22 + i * 16) + rightY * (i % 2 ? 10 : -10),
          0.8,
        );
      }
      // Sirens in the rain: a couple of light streaks on the wet road.
      for (const cop of [copA, copB, copC]) {
        game.particles.spawnRainSplash(cop.x + 12, cop.y + 20);
      }
    }

    game.player.setWeapon(2);
    game.setWanted(3);
    game.police.searching = false;
    game.police.hasSight = true;
    game.police.cooldownTimer = 14;
    game.camera.x = 1880 - 52;
    game.camera.y = 1376;
    game.camera.zoom = 1.56;
    game.camera.shake = 0;
    game.ui.dialog = null;
    cleanUi(game, false);
    freeze(game);
  } else {
    // Mission: a plaza shootout at Vantage, staged with the mission's own
    // clear-and-steal objective, guards and objective car.
    game.buildWorld(seed, false);
    game.state = 'playing';
    game.timeOfDay = 0.64;
    game.todBase = 0.64;
    game.setWeather('clear', 0);
    game.weather.wetness = 0;
    game.player.money = 3120;
    game.player.health = 88;
    game.player.armor = 70;
    game.player.score = 2600;
    game.startMission(1, 1);
    game.ui.dialog = null;
    game.state = 'playing';
    game.player.giveWeapon('smg', 2);
    game.player.setWeapon(2);

    const car = game.missions.targetVehicle;
    if (car) {
      car.color = '#2f6bff';
      car.hp = car.maxHp;
      car.x = 1830;
      car.y = 1535;
      car.angle = Math.PI / 2;
    }
    game.teleport(1768, 1452, -Math.PI / 2 + 0.18);
    const guards = [...game.combat.enemies];
    const spots = [
      { x: 1820, y: 1470 },
      { x: 1742, y: 1492 },
      { x: 1802, y: 1412 },
      { x: 1872, y: 1440 },
    ];
    guards.forEach((g, i) => {
      const spot = spots[i % spots.length];
      g.x = spot.x;
      g.y = spot.y;
      g.health = i === 0 ? 150 : 420;
      g.maxHealth = i === 0 ? 150 : 420;
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
    game.traffic.seed(1780, 1460, 16, 16);
    game.traffic.parked = game.traffic.parked.filter((v) => Math.hypot(v.x - 1800, v.y - 1460) > 130);
    game.combat.populate(1790, 1460, 24, 340);
    for (const spot of [
      { x: 1902, y: 1502, a: -2.2 },
      { x: 1710, y: 1362, a: 0.4 },
      { x: 1862, y: 1360, a: 2.4 },
    ]) {
      const ped = game.combat.spawnPedestrianAt(spot.x, spot.y);
      ped.angle = spot.a;
      ped.facing = spot.a > 0 ? 0 : 2;
    }
    game.combat.pedestrians = game.combat.pedestrians.filter(
      (p) => Math.hypot(p.x - 1768, p.y - 1452) > 70 && Math.hypot(p.x - 1830, p.y - 1535) > 80,
    );
    game.camera.x = 1796;
    game.camera.y = 1472;
    game.camera.zoom = 1.98;
    game.shotFrozen = false;
    for (let i = 0; i < 130; i += 1) {
      clearKeys(game);
      const target = game.combat.enemies.find((e) => !e.isDead) || { x: 1820, y: 1470 };
      aimAt(game, target.x, target.y + 2);
      game.input.mouse.down = i > 30;
      game.update(STEP);
      if (i > 44) {
        const playerBullets = game.combat.bullets.some((b) => b.owner === 'player');
        const enemyBullets = game.combat.bullets.some((b) => b.owner === 'enemy');
        if (playerBullets && enemyBullets) break;
      }
    }
    game.player.health = Math.max(game.player.health, 62);
    game.player.x = 1768;
    game.player.y = 1452;
    game.player.angle = Math.atan2(1470 - 1452, 1820 - 1768);

    const px = game.player.x + Math.cos(game.player.angle) * 27;
    const py = game.player.y + Math.sin(game.player.angle) * 27;
    if (!game.combat.bullets.some((b) => b.owner === 'player')) {
      game.combat.fireBullet(px, py, game.player.angle, game.player.weapon, 'player');
    }
    game.player.muzzleTimer = 0.07;
    game.particles.spawnMuzzle(px, py, game.player.angle, 9);
    for (const g of guards) {
      if (!g || g.isDead) continue;
      g.angle = Math.atan2(game.player.y - g.y, game.player.x - g.x);
      if (!game.combat.bullets.some((b) => b.owner === 'enemy')) {
        game.combat.fireBullet(g.x + Math.cos(g.angle) * 18, g.y + Math.sin(g.angle) * 18, g.angle + 0.04, g.weapon, 'enemy');
      }
      game.particles.spawnMuzzle(g.x + Math.cos(g.angle) * 18, g.y + Math.sin(g.angle) * 18, g.angle, 7);
    }
    for (const b of game.combat.bullets) {
      b.px = b.x - Math.cos(b.angle) * 90;
      b.py = b.y - Math.sin(b.angle) * 90;
    }
    game.camera.x = 1796;
    game.camera.y = 1472;
    game.camera.zoom = 1.98;
    game.camera.shake = 0;
    game.setWanted(3);
    game.police.searching = false;
    game.police.hasSight = true;
    game.police.cooldownTimer = 14;
    game.police.lastKnown = { x: game.player.x, y: game.player.y };
    game.ui.dialog = null;
    cleanUi(game, false);
    freeze(game);
  }

  return game;
}
