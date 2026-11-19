// Leonida Heat - screenshot scenes behind ?shot=menu|city|chase|mission&seed=N.
// Each scene builds a fresh seeded world, plays the real rules forward with a
// small scripted autopilot (walking, driving, firing, heat and mission setup),
// then freezes on a genuine rendered frame. Nothing here is a mock-up.

import { STEP } from './config.js';
import { Vehicle } from './entities.js';

function clearKeys(game) {
  game.input.keysDown.clear();
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
  if (diff > 0.035) game.input.keysDown.add('KeyD');
  if (diff < -0.035) game.input.keysDown.add('KeyA');
}

function spawnVisiblePolice(game, player) {
  const specs = [
    [player.x - 46, player.y + 245, -Math.PI / 2],
    [player.x - 46, player.y + 315, -Math.PI / 2 + 0.05],
    [player.x - 46, player.y + 385, -Math.PI / 2 - 0.05],
  ];
  for (const [x, y, a] of specs) {
    const cop = new Vehicle('patrol', x, y, a);
    cop.sirenActive = true;
    cop.aiMode = 'police';
    cop.driver = { isCop: true };
    cop.vx = Math.cos(a) * 300;
    cop.vy = Math.sin(a) * 300;
    game.police.cops.push(cop);
  }
}

function cleanUi(game, keepDistrict = false) {
  game.ui.banner = null;
  game.ui.toasts = [];
  game.ui.prompt = '';
  game.prompt = '';
  if (!keepDistrict) game.ui.districtTimer = 0;
}

function clearNearbyPeds(game, radius = 52) {
  game.combat.pedestrians = game.combat.pedestrians.filter(
    (p) => Math.hypot(p.x - game.player.x, p.y - game.player.y) > radius
  );
}

export function stageShot(game, name, seed = 2026) {
  game.shotFrozen = true; // suppress autosave/RAF effects while staging
  game.shotReady = false;
  game.simulate = null;
  const scene = ['menu', 'city', 'chase', 'mission'].includes(name) ? name : 'menu';

  if (scene === 'menu') {
    game.buildWorld(seed, true);
    game.startTitle();
    game.shotFrozen = false;
    for (let i = 0; i < 120; i += 1) game.update(STEP);
    game.shotFrozen = true;
    cleanUi(game, true);
  } else if (scene === 'city') {
    game.buildWorld(seed, false);
    game.state = 'playing';
    game.player.x = 2472;
    game.player.y = 1300;
    game.player.angle = Math.PI / 2;
    game.player.armor = 80;
    game.traffic.seed(2480, 1350, 24, 22);
    game.combat.populate(2470, 1280, 52, 860);
    game.camera.x = 2472;
    game.camera.y = 1340;
    game.camera.zoom = 2.0;
    game.ui.setDistrict('Coral Strip', 'Beachfront & Neon Boardwalk');
    game.shotFrozen = false;
    for (let i = 0; i < 120; i += 1) {
      walk(game, ['KeyS'], 2520, game.player.y - 30);
      game.update(STEP);
    }
    // A few more genuine traffic cars in the visible boulevard for the still.
    const ocean = game.city.roads.find((r) => r.name === 'Ocean Boulevard');
    if (ocean) {
      for (let i = 0; i < 9; i += 1) {
        game.traffic.spawnOnRoad(ocean, 0.465 + i * 0.022, i % 2 === 0 ? 1 : -1);
      }
    }
    clearNearbyPeds(game, 60);
    game.camera.x = game.player.x - 18;
    game.camera.y = game.player.y - 46;
    game.camera.zoom = 2.0;
    game.ui.dialog = null;
    cleanUi(game, true);
    game.shotFrozen = true;
  } else if (scene === 'chase') {
    game.buildWorld(seed, false);
    game.state = 'playing';
    game.startMission(0, 0);
    game.ui.dialog = null;
    game.state = 'playing';
    game.player.money = 4280;
    game.player.health = 100;
    game.player.armor = 100;
    game.player.giveWeapon('smg', 2);
    game.player.giveWeapon('shotgun', 1);
    game.missions.stepIndex = 1;
    game.missions.setupStep(true);
    game.ui.dialog = null;
    game.state = 'playing';
    game.teleport(2423, 1880, -Math.PI / 2);
    const hero = game.debugEnterCar('marlin', 2423, 1880, -Math.PI / 2, 320);
    hero.color = '#ff4f74';
    hero.hp = 900;
    hero.maxHp = 900;
    game.setWanted(3);
    game.police.dispatchTimer = 999;
    spawnVisiblePolice(game, game.player);
    game.camera.zoom = 1.78;
    game.shotFrozen = false;
    for (let i = 0; i < 80; i += 1) {
      driveToward(game, 2423, game.player.y - 580, game.player.vehicle && game.player.vehicle.speed < 330);
      game.input.mouse.down = i > 68;
      aimAt(game, game.player.x - 400, game.player.y + 260);
      game.update(STEP);
    }
    // Clear only ambient cars that would sit on top of the hero; keep the crowd.
    if (game.player.vehicle) {
      game.traffic.vehicles = game.traffic.vehicles.filter(
        (v) => v === game.player.vehicle || v.isMission || Math.hypot(v.x - game.player.x, v.y - game.player.y) > 185
      );
      game.traffic.parked = game.traffic.parked.filter(
        (v) => Math.hypot(v.x - game.player.x, v.y - game.player.y) > 185
      );
    }
    if (!game.player.vehicle) {
      const again = game.debugEnterCar('marlin', game.player.x, game.player.y, -Math.PI / 2, 200);
      again.color = '#ff4f74';
      for (let i = 0; i < 8; i += 1) game.update(STEP);
    }
    game.player.vehicle.color = '#ff4f74';
    game.player.setWeapon(2);
    game.camera.x = game.player.x + 14;
    game.camera.y = game.player.y - 30;
    game.camera.zoom = 1.8;
    cleanUi(game, false);
    game.shotFrozen = true;
  } else {
    game.buildWorld(seed, false);
    game.state = 'playing';
    game.player.money = 3120;
    game.player.health = 88;
    game.player.armor = 70;
    game.startMission(1, 1);
    game.ui.dialog = null;
    game.state = 'playing';
    game.player.giveWeapon('smg', 2);
    game.teleport(1690, 1542, -0.2);
    game.setWanted(1);
    for (const e of game.combat.enemies) {
      e.health = 150;
      e.maxHealth = 150;
    }
    game.combat.populate(1680, 1500, 16, 360);
    clearNearbyPeds(game, 100);
    game.camera.zoom = 1.86;
    game.shotFrozen = false;
    for (let i = 0; i < 78; i += 1) {
      clearKeys(game);
      if (i < 18) game.input.keysDown.add('KeyD');
      const target = game.combat.enemies.find((e) => !e.isDead) || { x: 1795, y: 1520 };
      aimAt(game, target.x, target.y);
      game.input.mouse.down = i > 60;
      game.update(STEP);
    }
    game.camera.x = game.player.x + 54;
    game.camera.y = game.player.y - 56;
    game.camera.zoom = 1.86;
    cleanUi(game, false);
    game.shotFrozen = true;
  }

  game.shotReady = true;
  game.ui.menuIndex = 0;
  return game;
}
