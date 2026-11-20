// Leonida Heat 3D — packaging entrypoint (Node 22 standard library only).
// Validates game/ and screenshots/ against the bounty caps, copies both to
// $MAKEFUN_OUTPUT_DIR (default /output), then writes dossier.json with the
// vendored make.fun library. Run locally with:
//   MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DossierError, INDEX_HTML_MAX_BYTES, buildDossier, readGameTree } from './vendor/makefun-game.ts';

const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};
const MIN_SHOTS = 3;
const SHOT_WIDTH = 1280;
const SHOT_HEIGHT = 720;

const here = fileURLToPath(new URL('.', import.meta.url));
const gameDir = join(here, 'game');
const shotsDir = join(here, 'screenshots');
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const outGame = join(out, 'game');
const outShots = join(out, 'screenshots');
const outDossier = join(out, 'dossier.json');

function fail(message) {
  console.error('Leonida Heat 3D packaging failed: ' + message);
  process.exitCode = 1;
}

function kib(bytes) {
  return (bytes / 1024).toFixed(1) + ' KiB';
}

function pngSize(bytes) {
  if (bytes.length < 24) return null;
  if (bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47) return null;
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function jpegSize(bytes) {
  if (bytes.length < 4) return null;
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return null;
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

function imageFacts(bytes) {
  const png = pngSize(bytes);
  if (png) return { type: 'PNG', width: png.width, height: png.height };
  const jpeg = jpegSize(bytes);
  if (jpeg) return { type: 'JPEG', width: jpeg.width, height: jpeg.height };
  return null;
}

function validateScreenshots() {
  let entries;
  try {
    entries = readdirSync(shotsDir, { withFileTypes: true });
  } catch {
    throw new Error('screenshots/ is missing: add 3 or 4 PNG or JPEG frames, the first by name the cover');
  }
  const files = entries.filter((entry) => entry.isFile() && !entry.name.startsWith('.')).map((entry) => entry.name).sort();
  if (files.length < MIN_SHOTS || files.length > CAPS.screenshots.max) {
    throw new Error(`screenshots/ holds ${files.length} files: the entry needs ${MIN_SHOTS} to ${CAPS.screenshots.max} images`);
  }
  const shots = [];
  for (const name of files) {
    const path = join(shotsDir, name);
    const size = statSync(path).size;
    if (size > CAPS.screenshots.max_bytes) {
      throw new Error(`screenshots/${name} is ${size} bytes, over the ${CAPS.screenshots.max_bytes}-byte cap`);
    }
    const bytes = readFileSync(path);
    const facts = imageFacts(bytes);
    if (!facts) throw new Error(`screenshots/${name} is neither a PNG nor a JPEG`);
    if (facts.width !== SHOT_WIDTH || facts.height !== SHOT_HEIGHT) {
      throw new Error(`screenshots/${name} is ${facts.width}x${facts.height}: every frame must be exactly ${SHOT_WIDTH}x${SHOT_HEIGHT}`);
    }
    shots.push({ name, type: facts.type, size, width: facts.width, height: facts.height });
  }
  return shots;
}

function validateGame() {
  try {
    const tree = readGameTree(gameDir, CAPS);
    const index = tree.files.find((file) => file.path === 'index.html');
    if (!index) throw new Error('game/index.html is missing');
    if (index.bytes > INDEX_HTML_MAX_BYTES) {
      throw new Error(`game/index.html is ${index.bytes} bytes, over the ${INDEX_HTML_MAX_BYTES}-byte cap`);
    }
    return tree;
  } catch (error) {
    if (error instanceof DossierError) throw new Error(error.message);
    throw error;
  }
}

function main() {
  if (!process.version.startsWith('v2')) {
    console.warn('warning: Node 22 or newer is expected; running on ' + process.version);
  }

  const tree = validateGame();
  const shots = validateScreenshots();
  const files = tree.files.length;
  const directories = tree.directories.length;

  rmSync(outGame, { recursive: true, force: true });
  rmSync(outShots, { recursive: true, force: true });
  rmSync(outDossier, { force: true });
  mkdirSync(out, { recursive: true });
  cpSync(gameDir, outGame, { recursive: true });
  cpSync(shotsDir, outShots, { recursive: true });

  const dossier = buildDossier(out, CAPS);
  writeFileSync(outDossier, dossier);

  console.log('Leonida Heat 3D — packaging complete');
  console.log('output:      ' + out);
  console.log(`game:        ${tree.count} entries (${files} files, ${directories} directories), ${kib(tree.totalBytes)}`);
  console.log(`index.html:  ${tree.files.find((file) => file.path === 'index.html').bytes} bytes`);
  console.log(`screenshots: ${shots.length} frames, ${kib(shots.reduce((sum, shot) => sum + shot.size, 0))} total`);
  for (const shot of shots) {
    console.log(`  ${shot.name}  ${shot.type}  ${shot.width}x${shot.height}  ${kib(shot.size)}`);
  }
  console.log('cover:       ' + shots[0].name);
  console.log(`dossier:     ${kib(dossier.length)} (text cap ${CAPS.text_max_bytes} bytes)`);
}

try {
  main();
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
