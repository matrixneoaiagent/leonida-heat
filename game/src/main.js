/* LEONIDA HEAT 3D — boot. */
(function () {
  'use strict';

  function fatal(message, detail) {
    var box = document.createElement('div');
    box.id = 'fatal-error';
    box.style.cssText = 'position:fixed;inset:0;z-index:9999;display:grid;place-items:center;padding:40px;background:#070b11;color:#f7ecd6;font-family:Arial Narrow,Arial,sans-serif;text-align:center';
    var inner = document.createElement('div');
    inner.style.cssText = 'max-width:560px;border:1px solid rgba(255,111,97,.5);padding:28px;background:rgba(10,17,24,.9)';
    inner.innerHTML = '<div style="font-size:10px;letter-spacing:.3em;color:#ff6f61">LEONIDA HEAT 3D</div>' +
      '<h1 style="font-family:Impact,Arial Black,sans-serif;font-weight:400;letter-spacing:.05em;font-size:42px;margin:8px 0 12px">UNABLE TO START</h1>' +
      '<p style="font-size:13px;line-height:1.6;color:#b9c5cc;margin:0 0 14px"></p>' +
      '<p style="font-family:Consolas,monospace;font-size:10px;color:#7f909a;margin:0"></p>';
    inner.querySelector('p').textContent = message;
    inner.querySelectorAll('p')[1].textContent = detail || '';
    box.appendChild(inner);
    document.body.appendChild(box);
  }

  function boot() {
    var canvas = document.getElementById('gameCanvas');
    if (!canvas) {
      fatal('The game canvas is missing from the page.');
      return;
    }
    if (!window.THREE) {
      fatal('Three.js did not load.', 'Expected vendor/three.min.js to define the global THREE.');
      return;
    }
    if (!window.LH || !LH.Game) {
      fatal('The game modules did not load.', 'Check that every classic script in index.html is present.');
      return;
    }

    var game;
    try {
      game = new LH.Game(canvas);
    } catch (err) {
      console.error('[Leonida] boot failed', err);
      fatal('The game could not initialise.', String(err && err.message ? err.message : err));
      return;
    }

    window.__game = game;
    window.__game.shotReady = false;

    if (game.state === 'title') game.showTitle();

    window.addEventListener('resize', function () {
      game.resize();
    }, { passive: true });

    window.addEventListener('orientationchange', function () {
      setTimeout(function () { game.resize(); }, 120);
    }, { passive: true });

    document.addEventListener('visibilitychange', function () {
      game.lastTime = 0;
      if (document.hidden && game.state === 'play') {
        game.togglePause();
      }
    });

    var unlocked = false;
    function unlockAudio() {
      if (unlocked) return;
      unlocked = true;
      if (game.audio && game.audio.unlock) {
        try { game.audio.unlock(); } catch (e) { /* audio is optional */ }
      }
      window.removeEventListener('pointerdown', unlockAudio, true);
      window.removeEventListener('keydown', unlockAudio, true);
    }
    window.addEventListener('pointerdown', unlockAudio, true);
    window.addEventListener('keydown', unlockAudio, true);

    canvas.addEventListener('click', function () {
      if (game.state === 'play' && game.input) game.input.requestLock();
    });

    window.addEventListener('error', function (event) {
      if (event && event.message) console.warn('[Leonida] runtime error:', event.message);
    });

    if (game.shotName) {
      document.body.classList.add('is-shot');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
}());
