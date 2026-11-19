// Leonida Heat v3 - packaging entrypoint.
// The game is the static game/ folder (Canvas 2D + Web Audio, no build, no
// network). This file validates the submission against the scorer's caps,
// checks that the four screenshots really are 1280 x 720, copies game/ and
// screenshots/, and writes dossier.json with buildDossier from the vendored
// library.
//
// Local run:
//   MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier, INDEX_HTML, INDEX_HTML_MAX_BYTES } from './vendor/makefun-game.ts';

const TITLE = 'Leonida Heat v3';

// The scorer's caps. Keep these exact: buildDossier refuses anything the
// grader would refuse, and the dossier must match byte for byte.
const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg']);
const here = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const gameDir = join(here, 'game');
const shotsDir = join(here, 'screenshots');
const SOURCE_EXTENSIONS = new Set(['.html', '.js', '.mjs', '.css', '.json']);

function fail(message: string): never {
  throw new Error(`${TITLE}: ${message}`);
}

function fileBytes(path: string): number {
  return statSync(path).size;
}

interface WalkEntry {
  path: string;
  rel: string;
  bytes: number;
  directory: boolean;
}

function walk(root: string): WalkEntry[] {
  const out: WalkEntry[] = [];
  const visit = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      const stats = lstatSync(path);
      if (stats.isSymbolicLink()) fail(`${relative(here, path)} is a symbolic link`);
      const rel = `game/${relative(gameDir, path).split('\\').join('/')}`;
      if (Buffer.byteLength(rel, 'utf8') > CAPS.game_path_max_bytes) fail(`${rel} has a path over the cap`);
      if (stats.isDirectory()) {
        out.push({ path, rel, bytes: 0, directory: true });
        visit(path);
      } else if (stats.isFile()) {
        out.push({ path, rel, bytes: stats.size, directory: false });
      } else {
        fail(`${rel} is not a regular file`);
      }
    }
  };
  visit(root);
  return out;
}

function validateGame(): { entries: number; files: number; bytes: number; sourceBytes: number } {
  if (!existsSync(gameDir) || !statSync(gameDir).isDirectory()) fail('game/ is missing');
  const index = join(gameDir, INDEX_HTML);
  if (!existsSync(index)) fail('game/index.html is missing');
  const indexBytes = fileBytes(index);
  if (indexBytes > INDEX_HTML_MAX_BYTES) fail(`game/index.html is ${indexBytes} bytes (cap ${INDEX_HTML_MAX_BYTES})`);

  const entries = walk(gameDir);
  let files = 0;
  let bytes = 0;
  let sourceBytes = 0;
  for (const entry of entries) {
    if (entry.directory) continue;
    files += 1;
    bytes += entry.bytes;
    if (SOURCE_EXTENSIONS.has(extname(entry.path).toLowerCase())) sourceBytes += entry.bytes;
  }
  if (entries.length > CAPS.game_max_files) fail(`game/ holds ${entries.length} entries (cap ${CAPS.game_max_files})`);
  if (bytes > CAPS.game_max_bytes) fail(`game/ holds ${bytes} bytes in ${files} files (cap ${CAPS.game_max_bytes})`);
  return { entries: entries.length, files, bytes, sourceBytes };
}

// Read a JPEG or PNG's pixel dimensions without any dependency.
function imageSize(path: string): { width: number; height: number; kind: string } {
  const data = readFileSync(path);
  if (data.length >= 24 && data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) {
    return { width: data.readUInt32BE(16), height: data.readUInt32BE(20), kind: 'png' };
  }
  if (data.length >= 4 && data[0] === 0xff && data[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < data.length) {
      if (data[offset] !== 0xff) { offset += 1; continue; }
      const marker = data[offset + 1];
      if (marker === 0xd8 || marker === 0xd9) { offset += 2; continue; }
      const length = data.readUInt16BE(offset + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { width: data.readUInt16BE(offset + 7), height: data.readUInt16BE(offset + 5), kind: 'jpeg' };
      }
      offset += 2 + length;
    }
    fail(`${relative(here, path)} looks like a JPEG but has no frame header`);
  }
  fail(`${relative(here, path)} is neither PNG nor JPEG`);
}

function validateScreenshots(): { files: number; bytes: number; names: string[] } {
  if (!existsSync(shotsDir)) fail('screenshots/ is missing');
  const names = readdirSync(shotsDir).filter((name) => IMAGE_EXTENSIONS.has(extname(name).toLowerCase())).sort();
  if (names.length < 3) fail(`screenshots/ has ${names.length} images; at least 3 are required`);
  if (names.length > CAPS.screenshots.max) fail(`screenshots/ has ${names.length} images; the cap is ${CAPS.screenshots.max}`);
  let bytes = 0;
  for (const name of names) {
    const path = join(shotsDir, name);
    const size = fileBytes(path);
    if (size > CAPS.screenshots.max_bytes) fail(`screenshots/${name} is ${size} bytes (cap ${CAPS.screenshots.max_bytes})`);
    const dims = imageSize(path);
    if (dims.width !== 1280 || dims.height !== 720) fail(`screenshots/${name} is ${dims.width}x${dims.height}, expected 1280x720`);
    bytes += size;
  }
  if (names[0] !== '1-chase.jpg') fail(`the cover frame should be 1-chase.jpg; found ${names[0]}`);
  return { files: names.length, bytes, names };
}

function freshCopy(from: string, to: string): void {
  rmSync(to, { recursive: true, force: true });
  cpSync(from, to, { recursive: true });
}

const gameStats = validateGame();
const shotStats = validateScreenshots();

mkdirSync(outputDir, { recursive: true });
freshCopy(gameDir, join(outputDir, 'game'));
freshCopy(shotsDir, join(outputDir, 'screenshots'));

const dossier = buildDossier(outputDir, CAPS);
writeFileSync(join(outputDir, 'dossier.json'), dossier);

const kib = (n: number) => `${(n / 1024).toFixed(1)} KiB`;
console.log(
  `${TITLE}: wrote ${outputDir}/game (${gameStats.entries} entries, ${gameStats.files} files, ` +
  `${kib(gameStats.bytes)}; ${kib(gameStats.sourceBytes)} source), ` +
  `${outputDir}/screenshots (${shotStats.files} frames, ${kib(shotStats.bytes)}) and dossier.json (${kib(dossier.length)}).`,
);
console.log(`${TITLE}: frames ${shotStats.names.join(', ')}`);
