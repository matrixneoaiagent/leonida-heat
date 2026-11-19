# Leonida Heat

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/matrixneoaiagent/leonida-heat/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/matrixneoaiagent/leonida-heat/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**Leonida Heat** is an original top-down open-world crime game set in **Costa Sol**, a sun-bleached coastal city of six districts. You play Leo Calder, a wheelman working for Maya Cruz. Steal a valet car, clear a plaza debt, rob a pier, stop an armoured convoy and finally take Crowe's estate — then keep the city as a free-roam playground.

Everything is generated in the browser with Canvas 2D and Web Audio. There are no external images, fonts, libraries, audio files, network calls or build steps. The city, cast, cars, interface, art and soundtrack are all original and all in `game/`.

## The v2 quality pass

Version 2 rebuilds the engine core rather than skinning it:

- **Renderer** — cached full-detail and far city layers per zoom, soft actor shadows, warm/cool ambient light, night neon pools, animated palm fronds, shoreline foam and ocean swell, painted crosswalks and lane detail, wet-road reflections and rain, tyre marks, muzzle flashes, sparks, dust and smoke. Cars are drawn from per-type silhouettes; pedestrians have four-direction walk cycles.
- **City** — deterministic blocks and lots, estate gardens, downtown towers, industrial sheds, container yards, alleys, parks, a beach, a pier, a marina and a ring highway, with named roads, POIs, landmarks, collision shapes and spawn points.
- **HUD** — smoothed health and armor with damage ghosts, animated cash/score, pulsing wanted stars and a status line, a real panned minimap (districts, roads, coast, objectives, police, POIs, north marker, heading arrow), weapon/ammo card, fading notification feed, radio widget, objective arrow, interaction prompt and all front-end screens.
- **Game director** — a clean state machine, speed-look-ahead camera, weather system, interaction prompts, crime and heat reactions, mission callbacks, checkpoints, autosave, dialogue, respawn and debug hooks.
- **Missions** — five rewritten jobs with new beats, dialogue, fail conditions, timers, checkpoints and a complete story arc.
- **Systems** — lane-following traffic with junction yielding and panic, police search cones and escalating response, enemy archetypes with accuracy falloff, bursts and cover, procedural SFX plus adaptive radio layers, versioned saves with v1 migration, and deterministic staged screenshot scenes.

## Controls

| Key | Action |
| --- | --- |
| **W A S D / arrows** | Walk, drive, steer |
| **Shift** | Sprint on foot |
| **Mouse** | Aim |
| **Left click** | Fire the current weapon |
| **R** | Reload |
| **1–5 / mouse wheel** | Switch weapon |
| **E or F** | Enter, exit or carjack a vehicle |
| **E** | Talk, rob a pedestrian, start a job |
| **Space** | Dodge roll on foot, handbrake in a car |
| **H** | Horn |
| **Q** | Change radio station |
| **M** | Mute |
| **Esc / P** | Pause and save |

Walk into the gold marker and press **E** to start the next job. Pause to save; jobs also autosave at checkpoints.

## Run it

```sh
node serve.ts
```

Open <http://localhost:8080> in a desktop browser. The canvas is fixed at 1280×720 and letterboxed responsively. Audio begins after the first click or key press (browser autoplay rules).

### Screenshots

With the dev server running:

```sh
node scripts/capture.mjs
```

This stages four deterministic scenes through the game's own rules and writes exactly four 1280×720 JPEGs under `screenshots/`, cover first:

1. `1-chase.jpg` — the cover: a rain-slicked night pursuit on Ocean Boulevard.
2. `2-city.jpg` — the Coral Strip on a warm afternoon.
3. `3-mission.jpg` — the Vantage Plaza shootout.
4. `4-menu.jpg` — the title screen over live traffic.

Set `SHOT_DIR=/tmp/somewhere` to write development frames elsewhere. The staged scenes are also directly playable:

```
/?shot=menu|city|chase|mission&seed=2026
```

Each builds a fresh seeded world, plays it forward deterministically, freezes it, and sets `window.__game.shotReady = true`.

## Testing and debug hooks

`game/src/main.js` exposes:

- `window.__game` — getters `world`, `player`, `police`, `missions`, `traffic`, `combat`, `game`, `state`, `shotReady`, `frameTimes`; functions `setWanted(n)` and `startMission(i, s)`.
- `window.leonidaHeat` — the game instance.
- `window.__leonida` — `{ title, version, stage, snapshot, setWanted, startMission, fps }`.

Useful smoke test in the browser console:

```js
const g = window.leonidaHeat;
g.newGame(2026);
g.debugEnterCar('marlin', g.player.x, g.player.y, 0, 120);
g.setWanted(3);
g.startMission(1, 1);
console.log(g.snapshot());
```

## Packaging

`main.ts` validates the submission caps, copies `game/` and `screenshots/`, and writes `dossier.json` with `buildDossier` from `vendor/makefun-game.ts`:

```sh
MAKEFUN_OUTPUT_DIR=out node main.ts
```

The caps are text 163840 bytes, four screenshots at 262144 bytes each, 993 game entries, 50331648 game bytes and 1000-byte game paths.

## Architecture

```
game/
  index.html        page shell, loading state, accessibility labels
  styles.css        letterbox, loading and error presentation
  src/
    main.js         boot, resize, focus, error banner, debug handles
    game.js         director/state machine, camera, weather, saves
    city.js         seeded Costa Sol generation and collision
    renderer.js     cached city layers, actor depth pass, lighting, weather
    hud.js          HUD, minimap, menus and overlays
    missions.js     five-job story and objective manager
    entities.js     player, vehicles, pedestrians, particles
    traffic.js      civilian lane AI, yielding, panic, recycling
    police.js       cruisers, foot officers, search, roadblocks, heat
    combat.js       bullets, enemy archetypes, cover, damage
    audio.js        procedural SFX and adaptive radio music
    pickups.js      health, armor, ammo and cash spawns
    save.js         versioned localStorage saves and v1 migration
    input.js        keyboard, mouse, pointer capture
    rng.js          deterministic random helpers
    config.js       districts, vehicles, weapons, economics, palette
    shots.js        deterministic staged screenshot scenes
```

The world is seeded: `?seed=2026` always builds the same streets, lots, props, traffic tables and screenshots. Simulation runs at a fixed 1/60 s step with a render loop that can be frozen for deterministic capture.

## Originality

All names, places, characters, vehicles, radio stations, dialogue, art and music in this repository are invented for this game. No third-party assets, fonts, brands, maps or code are included. There are no runtime network requests.

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
