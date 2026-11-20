// Capture the four real in-game screenshots with Playwright.
// Serve first:   node serve.ts --port 8080
// Then capture:  node scripts/capture.mjs
// Optional:      SHOT_DIR=.shots GAME_URL=http://127.0.0.1:8080 node scripts/capture.mjs

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'file:///tmp/opencode/identity_poc/node_modules/playwright-core/index.mjs';

const here = fileURLToPath(new URL('.', import.meta.url));
const repo = resolve(here, '..');
const shotDir = resolve(process.env.SHOT_DIR ?? join(repo, 'screenshots'));
const gameUrl = (process.env.GAME_URL ?? 'http://127.0.0.1:8080').replace(/\/+$/, '');
const chromiumPath = process.env.CHROMIUM_PATH ?? '/home/kozak/.local/bin/chromium';
const width = 1280;
const height = 720;
const quality = 82;
const minBytes = 12 * 1024;
const maxBytes = 256 * 1024;
const readyTimeout = 120000;

const shots = JSON.parse(readFileSync(join(repo, 'shots.json'), 'utf8'));

function jpegSize(bytes) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return null;
  let i = 2;
  while (i + 4 < bytes.length) {
    if (bytes[i] !== 0xff) {
      i++;
      continue;
    }
    while (i < bytes.length && bytes[i] === 0xff) i++;
    const marker = bytes[i++];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (marker === 0xd9 || marker === 0xda) break;
    if (i + 2 > bytes.length) break;
    const length = bytes.readUInt16BE(i);
    if (length < 2 || i + length > bytes.length) break;
    const startOfFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (startOfFrame) {
      return { width: bytes.readUInt16BE(i + 5), height: bytes.readUInt16BE(i + 3) };
    }
    i += length;
  }
  return null;
}

function kib(bytes) {
  return (bytes / 1024).toFixed(1) + ' KiB';
}

async function capture(name, query) {
  const browserErrors = [];
  let browser;
  let page;
  try {
    browser = await chromium.launch({
      executablePath: chromiumPath,
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=swiftshader', '--enable-webgl']
    });
    const context = await browser.newContext({
      viewport: { width, height },
      deviceScaleFactor: 1,
      bypassCSP: true
    });
    await context.addInitScript(() => {
      try {
        window.localStorage.clear();
      } catch (error) {
        /* storage may be unavailable before the origin exists */
      }
    });
    page = await context.newPage();
    page.on('pageerror', (error) => browserErrors.push('pageerror: ' + error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') browserErrors.push('console: ' + message.text());
    });
    page.on('requestfailed', (request) => {
      browserErrors.push('request failed: ' + request.url() + ' (' + (request.failure()?.errorText ?? 'unknown') + ')');
    });
    page.on('response', (response) => {
      if (response.status() >= 400) browserErrors.push('http ' + response.status() + ': ' + response.url());
    });

    const url = gameUrl + '/' + query;
    console.log(`capturing ${name}  ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => window.__game && window.__game.shotReady === true, null, {
      timeout: readyTimeout,
      polling: 100
    });
    await page.waitForTimeout(800);

    const path = join(shotDir, name);
    const data = await page.screenshot({ type: 'jpeg', quality, animations: 'disabled' });
    writeFileSync(path, data);

    const size = readFileSync(path);
    const facts = jpegSize(size);
    if (!facts) throw new Error(`${name} is not a JPEG screenshot`);
    if (facts.width !== width || facts.height !== height) {
      throw new Error(`${name} is ${facts.width}x${facts.height}, expected ${width}x${height}`);
    }
    if (size.length < minBytes || size.length > maxBytes) {
      throw new Error(`${name} is ${size.length} bytes, outside ${minBytes}-${maxBytes}`);
    }
    if (browserErrors.length > 0) {
      throw new Error(`${name} had browser errors:\n` + browserErrors.join('\n'));
    }
    console.log(`  ok  ${facts.width}x${facts.height}  ${kib(size.length)}`);
    return size.length;
  } finally {
    if (page) await page.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
  }
}

async function main() {
  mkdirSync(shotDir, { recursive: true });
  console.log(`output: ${shotDir}`);
  console.log(`game:   ${gameUrl}`);
  let total = 0;
  for (const shot of shots) {
    total += await capture(shot.name, shot.query);
  }
  console.log(`captured ${shots.length} frames, ${kib(total)} total`);
}

main().catch((error) => {
  console.error('capture failed: ' + (error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
});
