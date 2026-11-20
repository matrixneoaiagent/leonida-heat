// End-to-end v5 verification: staged scenes, every new system, save/load,
// pause and controls. Run with the dev server up: node scripts/verify-v5.mjs
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('/tmp/opencode/identity_poc/node_modules/playwright-core');
const base = process.env.GAME_URL || 'http://127.0.0.1:8080';

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/home/kozak/.local/bin/chromium',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--force-device-scale-factor=1'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
const results = [];
function ok(name, condition, detail = '') {
  results.push({ name, pass: !!condition, detail });
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
}

// 1. Every staged scene.
for (const shot of ['menu', 'city', 'chase', 'mission']) {
  await page.goto(`${base}/?shot=${shot}&seed=2026`, { waitUntil: 'load' });
  try {
    await page.waitForFunction(() => !!(window.__game && window.__game.shotReady), { timeout: 30000 });
    const info = await page.evaluate(() => ({ state: window.__game.state, canvas: [document.getElementById('gameCanvas').width, document.getElementById('gameCanvas').height] }));
    ok(`shot ${shot}`, info.canvas[0] === 1280 && info.canvas[1] === 720, info.state);
  } catch {
    ok(`shot ${shot}`, false, 'no shotReady');
  }
}

// 2. Live game systems.
await page.goto(`${base}/`, { waitUntil: 'load' });
await page.waitForFunction(() => !!window.leonidaHeat);
const flow = await page.evaluate(() => {
  const g = window.leonidaHeat;
  const out = {};
  const step = (n = 1) => { for (let i = 0; i < n; i += 1) g.update(1 / 60); };
  const check = (name, value) => { out[name] = value; };
  g.newGame(2026);
  check('state', g.state);
  check('hasSystems', !!(g.jobs && g.races && g.phone && g.music));

  // Walk.
  const x0 = g.player.x;
  g.input.keysDown.add('KeyW');
  step(50);
  g.input.keysDown.clear();
  check('walked', Math.hypot(g.player.x - x0, g.player.y - 1180) > 4);

  // Drive.
  g.debugEnterCar('marlin', 2400, 1376, 0, 0);
  g.input.keysDown.add('KeyW');
  step(80);
  g.input.keysDown.clear();
  check('driveSpeed', Math.abs(g.player.vehicle?.speed || 0) > 40);

  // Fire and grenade.
  g.player.giveWeapon('smg', 2);
  g.player.setWeapon(2);
  g.player.vehicle = null;
  g.player.isInVehicle = false;
  g.player.fireCooldown = 0;
  g.player.isReloading = false;
  g.combat.bullets.length = 0;
  g.input.mouse.down = true;
  g.combat.handlePlayerAttack(g.player, g.input, g.police, g.particles, g.audio, g);
  g.input.mouse.down = false;
  check('firedBullets', g.combat.bullets.length > 0);
  const frags = g.player.grenades;
  g.throwFrag();
  step(4);
  check('grenade', g.player.grenades === Math.max(0, frags - 1) && g.combat.grenades.length >= 0);

  // Phone pauses the simulation and all tabs draw.
  const t0 = g.worldTime;
  g.phone.openPhone();
  step(3);
  check('phoneState', g.state === 'phone');
  check('phonePaused', Math.abs(g.worldTime - t0) < 1e-6);
  for (let i = 0; i < 5; i += 1) {
    g.phone.tab = i;
    g.phone.selected = 0;
    g.render();
  }
  check('phoneTabs', g.phone.tab === 4);
  g.phone.tab = 1;
  g.phone.invoke('job:paramedic', g);
  check('phoneStartsJob', g.state === 'playing' && g.jobs.active && g.jobs.id === 'paramedic');
  g.jobs.abort('phone test');
  g.jobs.result = null;
  g.phone.openPhone();
  g.phone.tab = 1;
  g.phone.invoke('race:ocean_loop', g);
  check('phoneStartsRace', g.state === 'playing' && g.races.active && g.races.id === 'ocean_loop');
  g.races.abort('phone test');
  g.races.result = null;
  g.phone.closePhone();
  step(2);
  check('phoneClosed', g.state === 'playing');

  // Real TAB key opens and closes the phone.
  g.input.keysPressed.add('Tab');
  g.update(1 / 60);
  check('phoneTabOpen', g.state === 'phone');
  g.input.keysPressed.add('Tab');
  g.update(1 / 60);
  check('phoneTabClose', g.state === 'playing');

  // Mouse click on the activities start button.
  g.phone.openPhone();
  g.phone.tab = 1;
  g.render();
  const taxiButton = g.phone.buttons.find((b) => b.action === 'job:taxi');
  if (taxiButton) {
    g.input.mouse.x = taxiButton.x + taxiButton.w / 2;
    g.input.mouse.y = taxiButton.y + taxiButton.h / 2;
    g.input.mouse.clicked = true;
    g.phone.update(1 / 60, g);
  }
  check('phoneMouseStart', !!taxiButton && g.jobs.active && g.jobs.id === 'taxi');
  g.jobs.abort('mouse test');
  g.jobs.result = null;
  g.phone.closePhone();
  g.state = 'playing';

  // Taxi: three fares through the real pickup/drop-off flow.
  check('taxiStart', g.jobs.start('taxi'));
  const cab = g.jobs.vehicle;
  g.player.vehicle = cab;
  g.player.isInVehicle = true;
  g.player.x = cab.x;
  g.player.y = cab.y;
  step(2);
  check('taxiPickupPhase', g.jobs.phase === 'pickup');
  for (let fare = 0; fare < 3; fare += 1) {
    if (g.jobs.phase === 'pickup') {
      g.player.x = g.jobs.pickup.x; g.player.y = g.jobs.pickup.y;
      g.jobs.vehicle.x = g.player.x; g.jobs.vehicle.y = g.player.y;
      step(2);
    }
    if (g.jobs.phase === 'dropoff') {
      g.player.x = g.jobs.dropoff.x; g.player.y = g.jobs.dropoff.y;
      g.jobs.vehicle.x = g.player.x; g.jobs.vehicle.y = g.player.y;
      step(2);
    }
  }
  check('taxiComplete', !g.jobs.active && g.jobs.result?.kind === 'success');
  check('taxiPaid', g.player.money > 750);
  g.jobs.result = null;

  // Vigilante: stop the suspect.
  g.player.vehicle = null;
  g.player.isInVehicle = false;
  check('vigStart', g.jobs.start('vigilante'));
  g.jobs.suspect.hp = 0;
  g.jobs.suspect.isDestroyed = true;
  step(2);
  check('vigComplete', !g.jobs.active && g.jobs.result?.kind === 'success');
  g.jobs.result = null;

  // Paramedic: reach all three patients.
  check('medicStart', g.jobs.start('paramedic'));
  for (let i = 0; i < 3 && g.jobs.active; i += 1) {
    g.player.x = g.jobs.target.x; g.player.y = g.jobs.target.y;
    step(2);
  }
  check('medicComplete', !g.jobs.active && g.jobs.result?.kind === 'success');
  g.jobs.result = null;

  // Fail path: a patient clock expires.
  check('failJobStart', g.jobs.start('paramedic'));
  g.jobs.patientTimer = 0.01;
  step(2);
  check('jobFail', !g.jobs.active && g.jobs.result?.kind === 'fail' && /patient/i.test(g.jobs.result.lines[0] || ''));
  g.jobs.result = null;

  // Grand Avenue Sprint: countdown then all checkpoints.
  check('raceStart', g.races.start('grand_sprint'));
  g.races.countdown = 0.01;
  step(2);
  check('raceRunning', g.races.phase === 'running');
  for (let i = 0; i < 80 && g.races.active; i += 1) {
    const p = g.races.currentTarget();
    if (p) {
      g.player.x = p.x; g.player.y = p.y;
      if (g.player.vehicle) { g.player.vehicle.x = p.x; g.player.vehicle.y = p.y; }
    }
    step(1);
  }
  check('raceComplete', !g.races.active && g.races.result?.kind === 'success');
  check('racePlace', g.races.playerPlace === 1);
  g.races.result = null;

  // Fail path: the race clock expires.
  check('failRaceStart', g.races.start('drydock_circuit'));
  g.races.countdown = 0.01;
  step(2);
  g.races.raceTime = g.races.definition.timeLimit + 1;
  step(2);
  check('raceFail', !g.races.active && g.races.result?.kind === 'fail');
  g.races.result = null;

  // Other two races start and abort cleanly.
  check('oceanStart', g.races.start('ocean_loop'));
  g.races.abort('test');
  check('drydockStart', g.races.start('drydock_circuit'));
  g.races.abort('test');
  g.races.result = null;

  // Save/load with an active side job.
  g.jobs.start('paramedic');
  g.autosave();
  const savedTimer = g.jobs.timer;
  g.player.money = 12345;
  check('load', g.loadSave());
  check('loadJob', g.jobs.active && g.jobs.id === 'paramedic');
  check('loadTimer', Math.abs(g.jobs.timer - savedTimer) < 1.5);
  check('loadMoney', g.player.money !== 12345);

  // Pause / save / resume and controls screen.
  g.state = 'playing';
  g.input.keysPressed.add('Escape');
  g.update(1 / 60);
  check('paused', g.state === 'paused');
  g.handlePauseAction('save');
  check('pausedSave', g.hasSaveFile());
  g.handlePauseAction('resume');
  check('resumed', g.state === 'playing');
  g.enterMode('controls');
  g.render();
  check('controls', g.state === 'controls');
  g.state = 'playing';
  return out;
});
for (const [name, pass] of Object.entries(flow)) {
  if (name === 'state' || name === 'walked' || name === 'driveSpeed' || name.endsWith('Start') || name === 'hasSystems' || name === 'phoneState' || name === 'phonePaused' || name === 'phoneTabs' || name === 'phoneClosed' || name === 'phoneStartsJob' || name === 'phoneStartsRace' || name === 'phoneTabOpen' || name === 'phoneTabClose' || name === 'phoneMouseStart' || name === 'taxiPickupPhase' || name === 'taxiComplete' || name === 'taxiPaid' || name === 'vigComplete' || name === 'medicComplete' || name === 'raceStart' || name === 'raceRunning' || name === 'raceComplete' || name === 'racePlace' || name === 'failJobStart' || name === 'jobFail' || name === 'failRaceStart' || name === 'raceFail' || name === 'load' || name === 'loadJob' || name === 'loadTimer' || name === 'loadMoney' || name === 'paused' || name === 'pausedSave' || name === 'resumed' || name === 'controls' || name === 'firedBullets' || name === 'grenade') {
    ok(name, pass, typeof pass === 'boolean' ? '' : String(pass));
  }
}

await browser.close();
const failed = results.filter((r) => !r.pass);
if (errors.length) console.log('BROWSER ERRORS\n' + errors.join('\n'));
console.log(`\n${results.length - failed.length}/${results.length} checks passed${errors.length ? `, ${errors.length} browser errors` : ', no browser errors'}`);
if (failed.length || errors.length) process.exitCode = 1;
