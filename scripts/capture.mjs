// Capture the four real game frames used as the entry's screenshots.
// Usage (with `node serve.ts --port 8080` running):
//   node scripts/capture.mjs
// Development frames can go elsewhere:
//   SHOT_DIR=/tmp/opencode/gta6-shots-check node scripts/capture.mjs
//
// Each scene is ?shot=...&seed=...: a fresh seeded world played forward by the
// game's own rules, not a mock. Output is exactly four 1280x720 JPEGs at
// quality 82, named so 1-chase.jpg is the cover.

import { mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('/tmp/opencode/identity_poc/node_modules/playwright-core');

const root = fileURLToPath(new URL('..', import.meta.url));
const outDir = process.env.SHOT_DIR || join(root, 'screenshots');
const base = process.env.GAME_URL || 'http://127.0.0.1:8080';
const seed = process.env.SHOT_SEED || '2026';
const maxBytes = 262144;

const scenes = [
  ['1-chase.jpg', 'chase'],
  ['2-city.jpg', 'city'],
  ['3-mission.jpg', 'mission'],
  ['4-menu.jpg', 'menu'],
];

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/home/kozak/.local/bin/chromium',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
});

mkdirSync(outDir, { recursive: true });
for (const name of readdirSync(outDir)) {
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) unlinkSync(join(outDir, name));
}

const page = await browser.newPage({
  viewport: { width: 1280, height: 720 },
  deviceScaleFactor: 1,
});
const errors = [];
page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(`console: ${message.text()}`);
});
page.on('requestfailed', (request) => errors.push(`requestfailed: ${request.url()} ${request.failure()?.errorText ?? ''}`));
page.on('response', (response) => {
  if (response.status() >= 400) errors.push(`http ${response.status()}: ${response.url()}`);
});

const results = [];
for (const [file, scene] of scenes) {
  const started = Date.now();
  await page.goto(`${base}/?shot=${scene}&seed=${seed}`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!(window.__game && window.__game.shotReady), { timeout: 30000 });
  await page.waitForTimeout(500);
  const size = await page.evaluate(() => ({
    width: document.getElementById('gameCanvas')?.width,
    height: document.getElementById('gameCanvas')?.height,
  }));
  if (size.width !== 1280 || size.height !== 720) throw new Error(`canvas is ${size.width}x${size.height}, expected 1280x720`);
  const target = join(outDir, file);
  await page.screenshot({ type: 'jpeg', quality: 82, path: target });
  const bytes = statSync(target).size;
  results.push({ file, scene, bytes, ms: Date.now() - started });
  console.log(`${file.padEnd(14)} ${scene.padEnd(8)} ${(bytes / 1024).toFixed(1)} KiB  ${Date.now() - started}ms`);
  if (bytes >= maxBytes) throw new Error(`${file} is over the 256 KiB limit`);
  if (bytes < 12000) throw new Error(`${file} looks empty (${bytes} bytes)`);
}

await browser.close();

if (results.length !== 4) {
  console.error(`Expected 4 frames, captured ${results.length}.`);
  process.exitCode = 1;
} else if (errors.length) {
  console.error('Browser errors:\n' + errors.join('\n'));
  process.exitCode = 1;
} else {
  const total = results.reduce((sum, item) => sum + item.bytes, 0);
  console.log(`Captured four screenshots (${(total / 1024).toFixed(1)} KiB total) with no browser errors.`);
}
