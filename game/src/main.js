// Leonida Heat v5 - browser entry.
// Boots the game, honours ?shot=name&seed=N (fresh seeded world, scripted
// play, frozen frame), wires the test handle, keeps the canvas focused and
// letterboxed, and surfaces any boot error in the page instead of a blank tab.

import { Game } from './game.js';
import { stageShot } from './shots.js';
import { GAME_VERSION } from './config.js';

const canvas = document.getElementById('gameCanvas');
const loading = document.getElementById('loading');
const errorBanner = document.getElementById('errorBanner');
const statusLine = document.getElementById('statusLine');

function showError(message) {
  if (!errorBanner) return;
  errorBanner.hidden = false;
  errorBanner.textContent = `Leonida Heat could not start: ${message}`;
  if (loading) loading.classList.add('hidden');
  if (statusLine) statusLine.textContent = 'Error';
}

window.addEventListener('error', (event) => showError(event.message || 'unknown error'));
window.addEventListener('unhandledrejection', (event) => showError(String(event.reason || 'unhandled promise')));

if (!canvas) {
  showError('the game canvas is missing.');
} else {
  const context = canvas.getContext('2d', { alpha: false, desynchronized: true });
  if (!context) {
    showError('Canvas 2D is not available. Try a current desktop browser.');
  } else {
    const game = new Game(canvas);
    const params = new URLSearchParams(window.location.search);
    const shot = params.get('shot');
    const seed = Number(params.get('seed') || 2026) || 2026;

    if (shot) {
      try {
        stageShot(game, shot, seed);
      } catch (error) {
        showError(error instanceof Error ? error.message : String(error));
      }
    }

    const handle = game.debugHandle();
    Object.defineProperty(handle, 'state', { get: () => game.state, enumerable: true });
    Object.defineProperty(handle, 'shotReady', { get: () => game.shotReady, enumerable: true });
    Object.defineProperty(handle, 'frameTimes', { get: () => game.frameTimes, enumerable: true });
    window.__game = handle;
    window.leonidaHeat = game;
    window.__leonida = {
      title: 'Leonida Heat',
      version: GAME_VERSION,
      stage: (name, s = seed) => stageShot(game, name, s),
      snapshot: () => game.snapshot(),
      setWanted: (n) => game.setWanted(n),
      startMission: (i, step = 0) => game.startMission(i, step),
      get fps() {
        const times = game.frameTimes;
        if (!times.length) return 0;
        const avg = times.reduce((a, b) => a + b, 0) / times.length;
        return avg > 0 ? Math.round(1 / avg) : 0;
      },
    };

    // Responsive letterboxing: the backing store stays 1280 x 720; the CSS
    // box is scaled to fit while preserving the 16:9 aspect exactly.
    function resize() {
      const availW = Math.max(320, window.innerWidth);
      const availH = Math.max(180, window.innerHeight);
      const scale = Math.min(availW / 1280, availH / 720);
      canvas.style.width = `${Math.floor(1280 * scale)}px`;
      canvas.style.height = `${Math.floor(720 * scale)}px`;
    }
    window.addEventListener('resize', resize);
    resize();

    function focusCanvas() {
      try {
        canvas.focus({ preventScroll: true });
      } catch {
        canvas.focus();
      }
    }
    canvas.addEventListener('pointerdown', focusCanvas);
    window.addEventListener('keydown', (event) => {
      if (!['Tab', 'F5', 'F12'].includes(event.code)) focusCanvas();
    }, { passive: true });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        game.input.releaseAll();
        if (game.state === 'playing') game.state = 'paused';
      }
    });

    game.start();
    focusCanvas();
    if (loading) loading.classList.add('hidden');
    document.body.classList.add('ready');
    document.body.dataset.version = GAME_VERSION;
    if (statusLine) statusLine.textContent = shot ? `Scene ready: ${shot}` : 'Costa Sol is open.';
  }
}
