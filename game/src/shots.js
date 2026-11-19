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
    const ocean = game.city.roads.find((r) => r.name === 'Ocean Boulevard');
    if (ocean) {
      for (let i = 0; i < 5; i += 1) {
        game.traffic.spawnOnRoad(ocean, 0.34 + i * 0.042, i % 2 === 0 ? 1 : -1);
      }
    }
    cleanUi(game, true);
  } else if (scene === 'city') {
    game.buildWorld(seed, false);
    game.state = 'playing';
    game.player.x = 2508;
    game.player.y = 1420;
    game.player.angle = -Math.PI / 2;
    game.player.armor = 80;
    game.traffic.seed(2460, 1260, 24, 22);
    game.combat.populate(2500, 1240, 54, 820);
    game.camera.x = 2494;
    game.camera.y = 1370;
    game.camera.zoom = 2.02;
    game.ui.setDistrict('Coral Strip', 'Beachfront & Neon Boardwalk');
    game.shotFrozen = false;
    for (let i = 0; i < 72; i += 1) {
      walk(game, ['KeyW'], 2524, game.player.y - 42);
      game.update(STEP);
    }
    // More real traffic on the boulevard for the still.
    const ocean = game.city.roads.find((r) => r.name === 'Ocean Boulevard');
    if (ocean) {
      for (let i = 0; i < 6; i += 1) {
        game.traffic.spawnOnRoad(ocean, 0.31 + i * 0.036, i % 2 === 0 ? 1 : -1);
      }
    }
    for (const spot of [
      { x: 2532, y: 1306, a: -1.6 },
      { x: 2544, y: 1192, a: 1.2 },
      { x: 2470, y: 1248, a: -2.4 },
      { x: 2590, y: 1284, a: 2.1 },
    ]) {
      const ped = game.combat.spawnPedestrianAt(spot.x, spot.y);
      ped.angle = spot.a;
      ped.umbrella = spot.x > 2530;
    }
    clearNearbyPeds(game, 54);
    game.camera.x = game.player.x - 14;
    game.camera.y = game.player.y - 50;
    game.camera.zoom = 2.02;
    game.camera.shake = 0;
    game.ui.dialog = null;
    cleanUi(game, true);
    game.shotFrozen = true;
  } else if (scene === 'chase') {
    game.buildWorld(seed, false);
    game.state = 'playing';
    game.startMission(0, 0);
    game.missions.stepIndex = 1;
    game.missions.setupStep(true);
    game.ui.dialog = null;
    game.state = 'playing';
    game.player.money = 4280;
    game.player.health = 100;
    game.player.armor = 100;
    game.player.giveWeapon('smg', 2);
    game.player.giveWeapon('shotgun', 1);
    game.teleport(2375, 1810, -Math.PI / 2 + 0.12);
    const hero = game.debugEnterCar('marlin', 2375, 1810, -Math.PI / 2 + 0.12, 300);
    hero.color = '#ff4d6d';
    hero.hp = 900;
    hero.maxHp = 900;
    game.setWanted(3);
    game.police.dispatchTimer = 9999;
    game.police.footDispatchTimer = 9999;
    game.police.roadblockTimer = 9999;
    game.police.cops = [];
    game.police.roadblocks = [];
    game.police.lastKnown = { x: hero.x, y: hero.y };

    const copA = new Vehicle('patrol', 2375, 1950, -Math.PI / 2);
    const copB = new Vehicle('patrol', 2375, 2030, -Math.PI / 2);
    const copC = new Vehicle('patrol', 2423, 1900, -Math.PI / 2);
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
    for (let i = 0; i < 55; i += 1) {
      driveToward(game, 2375, hero.y - 620, hero.speed < 300);
      game.input.mouse.down = false;
      aimAt(game, hero.x - 420, hero.y + 260);
      game.update(STEP);
    }

    // Tidy the still: remove only cars on top of the hero, then pose the
    // pursuit cleanly behind and beside him.
    if (game.player.vehicle) {
      game.traffic.vehicles = game.traffic.vehicles.filter(
        (v) => v === game.player.vehicle || v.isMission || Math.hypot(v.x - game.player.x, v.y - game.player.y) > 200
      );
      game.traffic.parked = game.traffic.parked.filter(
        (v) => Math.hypot(v.x - game.player.x, v.y - game.player.y) > 200
      );
    }
    const car = game.player.vehicle;
    if (car) {
      car.x = 2375;
      car.y = 1578;
      car.angle = -Math.PI / 2 + 0.13;
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
        { cop: copA, x: car.x - 1, y: car.y + 64, angle: -Math.PI / 2 + 0.04 },
        { cop: copB, x: car.x + 1, y: car.y + 128, angle: -Math.PI / 2 },
        { cop: copC, x: car.x + 49, y: car.y + 92, angle: -Math.PI / 2 - 0.03 },
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

      // Skid marks and tyre smoke from the hero's drift, through the real API.
      const fwdX = Math.cos(car.angle);
      const fwdY = Math.sin(car.angle);
      const rightX = -fwdY;
      const rightY = fwdX;
      for (let i = 1; i <= 16; i += 1) {
        const back = i * 10;
        const wobble = Math.sin(i * 0.6) * 5 + i * 2.6;
        const bx = car.x - fwdX * back + rightX * wobble;
        const by = car.y - fwdY * back + rightY * wobble;
        game.city.addSkidMark(bx + rightX * car.width * 0.34, by + rightY * car.width * 0.34, car.angle, 0.75 * (1 - i / 24));
        game.city.addSkidMark(bx - rightX * car.width * 0.34, by - rightY * car.width * 0.34, car.angle, 0.75 * (1 - i / 24));
      }
      const rearX = car.x - fwdX * car.length * 0.36;
      const rearY = car.y - fwdY * car.length * 0.36;
      for (let i = 0; i < 10; i += 1) {
        game.particles.spawnTyreSmoke(rearX + rightX * (i % 2 ? car.width * 0.34 : -car.width * 0.34), rearY + rightY * (i % 2 ? car.width * 0.34 : -car.width * 0.34));
      }
      for (let i = 0; i < 7; i += 1) {
        game.particles.spawnTyreSmoke(
          car.x - fwdX * (26 + i * 17) + rightX * (i % 2 ? 10 : -10),
          car.y - fwdY * (26 + i * 17) + rightY * (i % 2 ? 10 : -10)
        );
      }

      // Two pedestrians throw themselves clear of the swerving car.
      const divers = [
        { x: car.x + 96, y: car.y + 28, a: 0.08 },
        { x: car.x + 108, y: car.y + 102, a: -0.15 },
      ];
      for (const d of divers) {
        const ped = game.combat.spawnPedestrianAt(d.x, d.y);
        ped.state = 'flee';
        ped.panicTimer = 5;
        ped.speed = 210;
        ped.angle = d.a;
        ped.vx = Math.cos(d.a) * 200;
        ped.vy = Math.sin(d.a) * 200;
        ped.diving = true;
        game.particles.spawnFootstep(ped.x, ped.y);
      }
    }

    game.player.setWeapon(2);
    game.camera.x = 2375 + 6;
    game.camera.y = 1578 - 52;
    game.camera.zoom = 1.56;
    game.camera.shake = 0;
    game.ui.dialog = null;
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
    game.player.setWeapon(2);

    // Stage the repo shootout on the Coral Strip boardwalk by the Pelican Grill.
    const car = game.missions.targetVehicle;
    if (car) {
      car.x = 2520;
      car.y = 1250;
      car.angle = Math.PI / 2;
      car.vx = 0;
      car.vy = 0;
      car.color = '#2f6bff';
    }
    game.teleport(2508, 1355, -Math.PI / 2 + 0.12);
    const guards = [...game.combat.enemies];
    const guardSpots = [
      { x: 2570, y: 1315 },
      { x: 2484, y: 1318 },
      { x: 2548, y: 1230 },
    ];
    guards.forEach((g, i) => {
      const spot = guardSpots[i % guardSpots.length];
      g.x = spot.x;
      g.y = spot.y;
      g.health = i === 2 ? 160 : 420;
      g.maxHealth = i === 2 ? 160 : 420;
      g.moveSpeed = 0;
      g.state = 'combat';
      g.fireTimer = 0.3 + i * 0.2;
      g.reaction = 0;
      g.lastSeen = { x: game.player.x, y: game.player.y };
    });
    if (guards[2]) guards[2].takeDamage(999, game.particles, game.audio);
    game.setWanted(2);
    game.police.dispatchTimer = 9999;
    game.police.footDispatchTimer = 9999;
    game.police.roadblockTimer = 9999;
    game.police.cops = [];
    game.police.roadblocks = [];
    game.police.searching = true;

    game.traffic.seed(2430, 1280, 18, 18);
    game.combat.populate(2480, 1260, 26, 360);
    for (const spot of [
      { x: 2562, y: 1302, a: -2.2 },
      { x: 2452, y: 1174, a: 0.4 },
      { x: 2596, y: 1250, a: 2.4 },
    ]) {
      const ped = game.combat.spawnPedestrianAt(spot.x, spot.y);
      ped.angle = spot.a;
    }
    game.combat.pedestrians = game.combat.pedestrians.filter(
      (p) => Math.hypot(p.x - 2570, p.y - 1315) > 46 && Math.hypot(p.x - 2484, p.y - 1318) > 46 && Math.hypot(p.x - 2508, p.y - 1355) > 50
    );
    game.camera.x = 2500;
    game.camera.y = 1268;
    game.camera.zoom = 1.95;
    game.shotFrozen = false;
    for (let i = 0; i < 120; i += 1) {
      clearKeys(game);
      const target = game.combat.enemies.find((e) => !e.isDead && e !== guards[2]) || { x: 2570, y: 1315 };
      aimAt(game, target.x, target.y + 2);
      game.input.mouse.down = i > 34;
      game.update(STEP);
      if (i > 40) {
        const playerBullets = game.combat.bullets.some((b) => b.owner === 'player');
        const enemyBullets = game.combat.bullets.some((b) => b.owner === 'enemy');
        if (playerBullets && enemyBullets) break;
      }
    }
    if (game.player.health < 45) game.player.health = 72;
    game.player.x = 2508;
    game.player.y = 1355;
    game.player.angle = Math.atan2(1315 - 1355, 2570 - 2508);
    // Make the exchange readable in a single held frame: real bullets and
    // muzzle particles from the player and the two surviving guards.
    const px = game.player.x + Math.cos(game.player.angle) * 27;
    const py = game.player.y + Math.sin(game.player.angle) * 27;
    if (!game.combat.bullets.some((b) => b.owner === 'player')) {
      game.combat.fireBullet(px, py, game.player.angle, game.player.weapon, 'player');
    }
    game.player.muzzleTimer = 0.06;
    game.particles.spawnMuzzle(px, py, game.player.angle, 8);
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
    game.camera.x = 2500;
    game.camera.y = 1268;
    game.camera.zoom = 1.95;
    game.camera.shake = 0;
    cleanUi(game, false);
    game.shotFrozen = true;
  }

  game.shotReady = true;
  game.ui.menuIndex = 0;
  return game;
}
