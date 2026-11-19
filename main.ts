// Leonida Heat - packaging entrypoint.
// The game is the static game/ folder (Canvas 2D + Web Audio, no build, no
// network). This file validates the submission against the scorer's caps,
// copies game/ and screenshots/, and writes dossier.json with buildDossier
// from the vendored library.
//
// Local run:
//   MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier, INDEX_HTML, INDEX_HTML_MAX_BYTES } from './vendor/makefun-game.ts';

const TITLE = 'Leonida Heat';

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

function fail(message: string): never {
  throw new Error(`${TITLE}: ${message}`);
}

function fileBytes(path: string): number {
  return statSync(path).size;
}

function walk(root: string, visit: (path: string, isDirectory: boolean) => void): void {
  for (const name of readdirSync(root)) {
    const path = join(root, name);
    const stats = statSync(path);
    visit(path, stats.isDirectory());
    if (stats.isDirectory()) walk(path, visit);
  }
}

function validateGame(): { files: number; bytes: number } {
  if (!existsSync(gameDir) || !statSync(gameDir).isDirectory()) fail('game/ is missing');
  const index = join(gameDir, INDEX_HTML);
  if (!existsSync(index)) fail('game/index.html is missing');
  const indexBytes = fileBytes(index);
  if (indexBytes > INDEX_HTML_MAX_BYTES) fail(`game/index.html is ${indexBytes} bytes (cap ${INDEX_HTML_MAX_BYTES})`);

  let files = 0;
  let bytes = 0;
  walk(gameDir, (path, isDirectory) => {
    const rel = `game/${relative(gameDir, path).split('\\').join('/')}`;
    if (Buffer.byteLength(rel, 'utf8') > CAPS.game_path_max_bytes) fail(`${rel} has a path over the cap`);
    if (isDirectory) {
      files += 1;
      return;
    }
    const stats = statSync(path);
    if (!stats.isFile()) fail(`${rel} is not a regular file`);
    files += 1;
    bytes += stats.size;
  });
  if (files > CAPS.game_max_files) fail(`game/ holds ${files} entries (cap ${CAPS.game_max_files})`);
  if (bytes > CAPS.game_max_bytes) fail(`game/ holds ${bytes} bytes (cap ${CAPS.game_max_bytes})`);
  return { files, bytes };
}

function validateScreenshots(): { files: number; bytes: number } {
  if (!existsSync(shotsDir)) fail('screenshots/ is missing');
  const names = readdirSync(shotsDir).filter((name) => IMAGE_EXTENSIONS.has(extname(name).toLowerCase()));
  if (names.length < 3) fail(`screenshots/ has ${names.length} images; at least 3 are required`);
  if (names.length > CAPS.screenshots.max) fail(`screenshots/ has ${names.length} images; the cap is ${CAPS.screenshots.max}`);
  let bytes = 0;
  for (const name of names) {
    const size = fileBytes(join(shotsDir, name));
    if (size > CAPS.screenshots.max_bytes) fail(`screenshots/${name} is ${size} bytes (cap ${CAPS.screenshots.max_bytes})`);
    bytes += size;
  }
  return { files: names.length, bytes };
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
  `${TITLE}: wrote ${outputDir}/game (${gameStats.files} entries, ${kib(gameStats.bytes)}), ` +
  `${outputDir}/screenshots (${shotStats.files} frames, ${kib(shotStats.bytes)}) and dossier.json (${kib(dossier.length)}).`,
);
