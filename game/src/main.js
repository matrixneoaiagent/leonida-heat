// Leonida Heat - browser entry.
// A single module boot: build the game, honour ?shot= (fresh seeded world,
// scripted play, frozen frame), expose the test handle, and start the loop.

import { Game } from './game.js';
import { stageShot } from './shots.js';

const canvas = document.getElementById('gameCanvas');
const game = new Game(canvas);

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number(params.get('seed') || 2026) || 2026;

if (shot) stageShot(game, shot, seed);

const handle = game.debugHandle();
Object.defineProperty(handle, 'shotReady', { get: () => game.shotReady, enumerable: true });
Object.defineProperty(handle, 'frameTimes', { get: () => game.frameTimes, enumerable: true });
Object.defineProperty(handle, 'state', { get: () => game.state, enumerable: true });
window.__game = handle;
window.leonidaHeat = game;
window.__leonida = {
  title: 'Leonida Heat',
  stage: (name, s = seed) => stageShot(game, name, s),
};

game.start();
