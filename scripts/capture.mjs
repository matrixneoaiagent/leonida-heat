// Capture the four real game frames used as the entry's screenshots.
// Usage: node scripts/capture.mjs   (with `node serve.ts --port 8080` running)
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
const outDir = join(root, 'screenshots');
const base = process.env.GAME_URL || 'http://127.0.0.1:8080';
const seed = process.env.SHOT_SEED || '2026';

const scenes = [
  ['1-chase.jpg', 'chase'],
  ['2-city.jpg', 'city'],
  ['3-mission.jpg', 'mission'],
  ['4-menu.jpg', 'menu'],
];

const browser = await chromium.launch({
  executablePath: '/home/kozak/.local/bin/chromium',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
});

mkdirSync(outDir, { recursive: true });
for (const name of readdirSync(outDir)) {
  if (name.endsWith('.jpg')) unlinkSync(join(outDir, name));
}

const page = await browser.newPage({
  viewport: { width: 1280, height: 720 },
  deviceScaleFactor: 1,
});
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});

for (const [file, scene] of scenes) {
  await page.goto(`${base}/?shot=${scene}&seed=${seed}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__game && window.__game.shotReady, { timeout: 30000 });
  await page.waitForTimeout(550);
  const target = join(outDir, file);
  await page.screenshot({ type: 'jpeg', quality: 82, path: target });
  const bytes = statSync(target).size;
  console.log(`${file.padEnd(14)} ${scene.padEnd(8)} ${(bytes / 1024).toFixed(1)} KiB`);
  if (bytes >= 262144) throw new Error(`${file} is over the 256 KiB limit`);
}

await browser.close();
if (errors.length) {
  console.error('Browser errors:', errors);
  process.exitCode = 1;
} else {
  console.log('Captured four screenshots with no browser errors.');
}
