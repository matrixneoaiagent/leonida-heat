# Leonida Heat v3

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/matrixneoaiagent/leonida-heat/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/matrixneoaiagent/leonida-heat/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**Leonida Heat v3** is an original top-down open-world crime game set in **Costa Sol**, a sun-bleached coastal city of six districts. You play Leo Calder, a wheelman working for Maya Cruz. Steal a valet car, clear a plaza debt, rob a pier, stop an armoured convoy and finally take Crowe's estate, then keep the city as a free-roam playground.

Everything is generated in the browser with Canvas 2D and Web Audio. There are no external images, fonts, libraries, audio files, network calls or build steps. The city, cast, cars, interface, art and soundtrack are all original and all in `game/`.

## What v3 rebuilds

Version 3 re-authors the engine rather than reskinning it:

- **Renderer** — cached full-detail and far city layers, a real 24-hour light model (dawn, day, dusk and night ambient with warm sun, cool moonlight, neon and headlights), long moving shadows plus soft contact shadows, wet-road sheen and mirrored lights, neon bloom, animated ocean swell and shoreline foam, wind-driven palms, tyre marks, sparks, smoke, fire and muzzle flashes. Cars are drawn from per-type silhouettes with four damage states — scratches, broken glass, soot, flames and wrecks. Pedestrians have four-direction walk cycles.
- **City** — deterministic six-district generation with tower blocks, estate gardens, market low-rises, container yards, industrial sheds, sidewalks, crosswalks, alleys, parks and ponds, a beach, boardwalk, three piers, a marina, a ring highway, named roads, billboards, rooftop detail and shop signs. The city also owns **nine stunt ramps**, **twelve hidden mixtape spots**, three garages, POIs, collision shapes and spawn tables.
- **HUD** — damage-ghosted health and armor, animated cash/score, wanted stars and status, a live clock and weather line, a panned minimap (coast, districts, roads, POIs, police, garages, mixtapes, objectives, north and heading), mission banner with steps and timers, objective card, weapon/ammo and grenade count, notification feed, radio, interaction prompt, objective arrow, mixtape counter, and all front-end screens. Mission briefings show speaker names with procedural portraits.
- **Director** — a clean state machine, speed-look-ahead camera, 24-hour clock, autonomous weather transitions (clear, haze, rain, storm) that drive wetness, visibility and audio, interaction prompts, crime and heat reactions, mission callbacks and checkpoints, autosave, respawn, garage repair, stunt adjudication, collectible rewards and debug handles.
- **Missions** — five re-authored jobs with new beats, timed deliveries, marina drops, a convoy chase, an estate siege, a grenade-throwing boss, intro briefings, step dialogue, checkpoints, fail conditions and larger rewards.
- **Entities** — new arcade vehicle physics with a wet-grip penalty, staged damage (smoke → fire → explosion → repair), a three-hit melee combo, dodge roll, grenades, pedestrian reactions and a larger particle bus.
- **Systems** — lane-following traffic with signal obedience and panic, police search cones, roadblocks and a busted meter; enemies that flank, take cover and suppress; procedural SFX plus a four-station adaptive radio; versioned v3 saves with v2/v1 migration; deterministic staged screenshot scenes.

## New in this pass

- **Day/night clock** — the HUD clock, ambient colour, sun angle, shadow length, headlights and neon all follow the same simulation clock. The cycle is 12 minutes long.
- **Weather** — clear, haze, rain and storm arrive on their own timer. Rain wets the roads, changes grip, dims visibility, spawns splashes and changes the audio bed; storms flash and thunder.
- **Stunt jumps** — nine ramps around the city launch a fast car into a real airtime state, then pay cash and score for a clean landing with a **STUNT** banner.
- **Mixtapes** — twelve hidden cassettes, a HUD counter and a large city bonus when the album is complete.
- **Vehicle damage** — cars smoke, catch fire and explode; a lit wreck can be repaired at one of three garages, or your last car comes back repaired after a respawn.
- **Combat depth** — three-hit melee combo with a finisher, throwable frag grenades with bounce, fuse and blast radius, enemies that flank wide and dive for cover, and a boss who lobs grenades.
- **Mission intros** — each job opens on a speaker-named briefing with portraits, followed by short in-world dialogue beats.

## Controls

| Key | Action |
| --- | --- |
| **W A S D / arrows** | Walk, drive, steer |
| **Shift** | Sprint on foot |
| **Mouse** | Aim |
| **Left click** | Fire / melee combo |
| **G** | Throw a frag grenade |
| **R** | Reload |
| **1–5 / mouse wheel** | Switch weapon |
| **E or F** | Enter, exit or carjack a vehicle |
| **E** | Talk, rob, repair at a garage, start a job |
| **Space** | Dodge roll on foot, handbrake in a car |
| **H** | Horn |
| **Q** | Change radio station |
| **T** | Print the clock and weather |
| **M** | Mute |
| **Esc / P** | Pause and save |

Walk into the gold marker and press **E** to start the next job. Pause to save; jobs also autosave at checkpoints and when a mixtape is found.

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

1. `1-chase.jpg` — the cover: a rain-slicked night pursuit on Grand Avenue.
2. `2-city.jpg` — the Coral Strip in golden hour light.
3. `3-mission.jpg` — the Vantage Plaza shootout, with a grenade in the air.
4. `4-menu.jpg` — the title screen over live boardwalk traffic.

Set `SHOT_DIR=/tmp/somewhere` to write development frames elsewhere. The staged scenes are also directly playable:

```
/?shot=menu|city|chase|mission&seed=2026
```

Each builds a fresh seeded world, plays it forward deterministically, freezes it, and sets `window.__game.shotReady = true`.

## Testing and debug hooks

`game/src/main.js` exposes:

- `window.__game` — getters `world`, `player`, `police`, `missions`, `traffic`, `combat`, `collectibles`, `game`, `state`, `shotReady`, `frameTimes`; functions `setWanted(n)` and `startMission(i, s)`.
- `window.leonidaHeat` — the game instance.
- `window.__leonida` — `{ title, version, stage, snapshot, setWanted, startMission, fps }`.

Useful smoke test in the browser console:

```js
const g = window.leonidaHeat;
g.newGame(2026);
g.debugEnterCar('marlin', 2400, 1376, 0, 120);
g.setWanted(3);
g.startMission(1, 1);
console.log(g.snapshot());
```

`snapshot()` reports state, seed, clock, weather, wetness, player position/health/money/grenades, wanted, mission, traffic, pedestrians, enemies, mixtape count and stunt count.

## Packaging

`main.ts` validates the submission caps, checks every screenshot is a 1280×720 PNG/JPEG, copies `game/` and `screenshots/`, and writes `dossier.json` with `buildDossier` from `vendor/makefun-game.ts`:

```sh
MAKEFUN_OUTPUT_DIR=out node main.ts
```

The caps are text 163840 bytes, four screenshots at 262144 bytes each, 993 game entries, 50331648 game bytes and 1000-byte game paths.

## Architecture

```
game/
  index.html        page shell, loading state, accessibility labels
  styles.css        letterboxed arcade cabinet, loading and error presentation
  src/
    main.js         boot, resize, focus, error banner, debug handles
    config.js       districts, cars, weapons, heat, economy, clock, weather, rewards
    game.js         director/state machine, clock, weather, camera, stunts, saves
    city.js         seeded Costa Sol generation, ramps, mixtapes, collision
    renderer.js     cached city layers, day/night lighting, actors, weather
    hud.js          HUD, minimap, clock, menus, briefings and overlays
    missions.js     five-job story, briefings, objectives, checkpoints
    entities.js     player, vehicles, pedestrians, particles, damage model
    traffic.js      civilian lane AI, signal obedience, panic, recycling
    police.js       cruisers, foot officers, search, roadblocks, heat
    combat.js       bullets, grenades, melee combos, enemy squads, cover
    audio.js        procedural SFX and adaptive four-station radio
    pickups.js      health/armor/ammo/cash crates and hidden mixtapes
    save.js         versioned localStorage saves and v1/v2 migration
    input.js        keyboard, pointer capture, action bindings
    rng.js          deterministic random and noise helpers
    shots.js        deterministic staged screenshot scenes
```

The world is seeded: `?seed=2026` always builds the same streets, lots, props, traffic tables and screenshots. Simulation runs at a fixed 1/60 s step with a render loop that can be frozen for deterministic capture.

## Originality

All names, places, characters, vehicles, radio stations, dialogue, art and music in this repository are invented for this game. No third-party assets, fonts, brands, maps or code are included. There are no runtime network requests.

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
