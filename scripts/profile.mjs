// Headless frame profile: average FPS plus split update/render costs.
// Usage (server running on 8080): node scripts/profile.mjs [label] [city|chase|mission|night]
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('/tmp/opencode/identity_poc/node_modules/playwright-core');
const base = process.env.GAME_URL || 'http://127.0.0.1:8080';
const label = process.argv[2] || 'run';
const scene = process.argv[3] || 'city';

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/home/kozak/.local/bin/chromium',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--force-device-scale-factor=1'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(base + '/', { waitUntil: 'load' });
await page.waitForFunction(() => !!(window.leonidaHeat && window.leonidaHeat.player));
await page.evaluate((scene) => {
  const g = window.leonidaHeat;
  g.newGame(2026);
  g.teleport(2520, 1400, -Math.PI / 2);
  g.ui.toasts = [];
  g.police.setWanted(2);
  if (scene === 'chase') {
    g.timeOfDay = 0.845; g.todBase = 0.845; g.sessionTime = 0;
    g.setWeather('rain', 0.78); g.weather.wetness = 0.9;
    g.teleport(1850, 1376, Math.PI + 0.08);
    g.debugEnterCar('marlin', 1850, 1376, Math.PI + 0.08, 260);
    g.camera.zoom = 1.56;
  } else if (scene === 'mission') {
    g.timeOfDay = 0.756; g.todBase = 0.756; g.sessionTime = 0;
    g.teleport(1778, 1472, 0);
    g.setWanted(3);
    g.player.giveWeapon('smg', 2);
    for (let i = 0; i < 90; i += 1) g.update(1 / 60);
  } else if (scene === 'night') {
    g.timeOfDay = 0.845; g.todBase = 0.845; g.sessionTime = 0;
    g.setWeather('clear', 0);
    g.teleport(2500, 1400, -Math.PI / 2);
  }
  window.__perf = { update: 0, render: 0, frames: 0 };
  const up = g.update.bind(g);
  const re = g.render.bind(g);
  g.update = (dt) => { const t = performance.now(); up(dt); window.__perf.update += performance.now() - t; };
  g.render = () => { const t = performance.now(); re(); window.__perf.render += performance.now() - t; window.__perf.frames += 1; };
}, scene);
await page.waitForTimeout(6500);
const result = await page.evaluate(() => {
  const times = window.leonidaHeat.frameTimes.slice(-200);
  const avg = times.reduce((a, b) => a + b, 0) / Math.max(1, times.length);
  const p = window.__perf;
  return {
    frames: p.frames,
    fps: avg > 0 ? 1 / avg : 0,
    updateMs: p.update / Math.max(1, p.frames),
    renderMs: p.render / Math.max(1, p.frames),
    frameMs: avg * 1000,
  };
});
await browser.close();
console.log(`${label} [${scene}]: ${result.fps.toFixed(1)} fps · frame ${result.frameMs.toFixed(1)} ms · update ${result.updateMs.toFixed(2)} ms · render ${result.renderMs.toFixed(2)} ms · ${result.frames} frames`);
if (errors.length) console.error('errors:', errors.slice(0, 8));
