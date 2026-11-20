/* LEONIDA HEAT 3D — static game data.
   Classic script. Attaches LH.CONFIG to the global namespace. */
(function () {
  'use strict';

  window.LH = window.LH || {};

  var PALETTE = {
    ink: '#070b11',
    night: '#0b1424',
    ocean: '#0b4f5c',
    oceanDeep: '#062c38',
    oceanShallow: '#1a8f96',
    sand: '#e8d6ae',
    sandDark: '#c9b184',
    asphalt: '#2a2d33',
    asphaltLight: '#3b3f47',
    sidewalk: '#b9ad98',
    cream: '#f7ecd6',
    coral: '#ff6f61',
    coralDeep: '#c94a43',
    magenta: '#ff2d95',
    cyan: '#28e0d0',
    teal: '#0f7b78',
    gold: '#f3c969',
    green: '#63e6a4',
    red: '#ff4d55',
    blue: '#5cb7ff',
    white: '#f4f1e8',
    muted: '#91a1ad',
    grass: '#5b8f5a',
    grassDark: '#3f6c46',
    palm: '#2f6b45',
    trunk: '#7a5a3c',
    roof: '#6f6257',
    window: '#1a3340',
    windowLit: '#ffc978',
    neonPink: '#ff5db1',
    neonCyan: '#54fff0'
  };

  function range(from, to, step) {
    var out = [];
    for (var v = from; v <= to + 0.0001; v += step) out.push(Math.round(v * 1000) / 1000);
    return out;
  }

  var WORLD = {
    name: 'COSTA SOL',
    size: 1000,
    half: 500,
    minX: -500,
    maxX: 500,
    minZ: -500,
    maxZ: 500,

    gridMin: -400,
    gridMax: 400,
    gridStep: 100,
    roadCount: 9,
    roadsX: range(-400, 400, 100),
    roadsZ: range(-400, 400, 100),
    roadHalfWidth: 8,
    sidewalkWidth: 4,
    blockSize: 84,
    lotSize: 76,
    laneWidth: 4,
    crosswalkWidth: 5,

    beachX: -460,
    waterX: -520,
    seaLevel: -0.35,
    beachWidth: 60,
    oceanFloor: -8,

    eyeHeight: 1.7,
    playerRadius: 0.45,
    markerHeight: 2.5,
    markerRadius: 1.9,
    spawnRadius: 310,
    trafficDespawnRadius: 420,

    fogNear: 80,
    fogFar: 520,
    shadowBox: 160,
    sunDistance: 260,
    maxPeds: 26,
    maxTraffic: 18,

    points: {
      spawn: { x: -382, z: 218, label: 'OCEAN DRIVE' },
      marina: { x: -438, z: -180, label: 'MARINA' },
      marinaSlip: { x: -438, z: -180, label: 'SLIP 9' },
      oceanHotel: { x: -414, z: 180, label: 'OCEAN HOTEL' },
      plazaSol: { x: 50, z: 50, label: 'PLAZA SOL' },
      debtorOne: { x: 28, z: 66, label: 'DEBTOR' },
      debtorTwo: { x: 74, z: 26, label: 'DEBTOR' },
      pier: { x: -452, z: 300, label: 'THE PIER' },
      pierCase: { x: -444, z: 312, label: 'THE CASE' },
      boatRamp: { x: -452, z: 372, label: 'BOAT RAMP' },
      ringRoad: { x: 400, z: -100, label: 'RING ROAD' },
      convoyRoadblock: { x: 400, z: 60, label: 'ROADBLOCK' },
      garage: { x: 150, z: -50, label: 'DEZ GARAGE' },
      estate: { x: 350, z: -350, label: 'CROWE ESTATE' },
      estateGate: { x: 330, z: -330, label: 'ESTATE GATE' },
      estateCourtyard: { x: 360, z: -360, label: 'COURTYARD' },
      estateCaptain: { x: 386, z: -386, label: 'CAPTAIN' },
      escapePoint: { x: -350, z: -350, label: 'ESCAPE' },
      policeStation: { x: 250, z: 250, label: 'POLICE STATION' },
      hospital: { x: -250, z: 250, label: 'HOSPITAL' },
      ammuNation: { x: 50, z: -150, label: 'AMMU-NATION' },
      safehouse: { x: -50, z: 150, label: 'SAFEHOUSE' },
      helipad: { x: 350, z: 150, label: 'HELIPAD' }
    },

    districts: [
      { id: 'marina', name: 'MARINA', minX: -460, maxX: -300, minZ: -260, maxZ: -80 },
      { id: 'ocean', name: 'OCEAN DRIVE', minX: -460, maxX: -300, minZ: -80, maxZ: 260 },
      { id: 'pier', name: 'THE PIER', minX: -460, maxX: -300, minZ: 260, maxZ: 460 },
      { id: 'plaza', name: 'PLAZA SOL', minX: -100, maxX: 120, minZ: -60, maxZ: 120 },
      { id: 'downtown', name: 'DOWNTOWN', minX: 120, maxX: 300, minZ: -300, maxZ: 100 },
      { id: 'estate', name: 'CROWE ESTATE', minX: 300, maxX: 460, minZ: -460, maxZ: -260 },
      { id: 'garage', name: 'DEZ GARAGE', minX: 100, maxX: 220, minZ: -120, maxZ: 20 },
      { id: 'southside', name: 'SOUTHSIDE', minX: -300, maxX: 100, minZ: 200, maxZ: 460 },
      { id: 'northside', name: 'NORTHSIDE', minX: -300, maxX: 100, minZ: -460, maxZ: -200 }
    ]
  };

  var PLAYER = {
    maxHealth: 100,
    maxArmor: 100,
    startMoney: 500,
    walkSpeed: 4.2,
    sprintSpeed: 8.0,
    aimWalkSpeed: 2.4,
    dodgeSpeed: 11.0,
    dodgeTime: 0.34,
    dodgeCooldown: 0.85,
    radius: 0.45,
    eyeHeight: 1.7,
    turnSpeed: 13,
    interactionRange: 3.2,
    enterRange: 3.2,
    footstepStride: 1.85,
    aimFov: 46,
    meleeComboWindow: 0.9,
    respawnHealth: 65,
    respawnArmor: 0,
    bustedFine: 250,
    hospitalFee: 150,
    startWeapons: {
      fists: { owned: true, ammo: 0 },
      pistol: { owned: true, ammo: 12, reserve: 96 },
      smg: { owned: false, ammo: 0, reserve: 0 },
      shotgun: { owned: false, ammo: 0, reserve: 0 },
      rifle: { owned: false, ammo: 0, reserve: 0 }
    },
    startWeapon: 'pistol',
    wantedDecay: 0.035,
    hiddenDecayDelay: 7.0,
    bustedTime: 2.5,
    bustedRadius: 3.0
  };

  var VEHICLES = {
    sedan: {
      id: 'sedan', label: 'SEDAN', maxSpeed: 33, accel: 9.4, brake: 19, grip: 7.2,
      mass: 1450, value: 8000, seats: 4, length: 4.55, width: 1.9, height: 1.42,
      wheelBase: 2.65, wheelRadius: 0.34, clearance: 0.3,
      colors: ['#c8c3b4', '#7c2d2a', '#2c4a57', '#334d3c', '#8d7a5c', '#24262b']
    },
    coupe: {
      id: 'coupe', label: 'COUPE', maxSpeed: 38, accel: 11.2, brake: 21, grip: 8.0,
      mass: 1280, value: 14000, seats: 2, length: 4.35, width: 1.86, height: 1.28,
      wheelBase: 2.55, wheelRadius: 0.33, clearance: 0.26,
      colors: ['#d8d2c2', '#1f5a63', '#a33b34', '#c9a15a', '#2b2f3a']
    },
    van: {
      id: 'van', label: 'VAN', maxSpeed: 26, accel: 6.4, brake: 15, grip: 6.0,
      mass: 2200, value: 11000, seats: 3, length: 5.3, width: 2.05, height: 2.25,
      wheelBase: 3.1, wheelRadius: 0.38, clearance: 0.36,
      colors: ['#e6e0cf', '#5d6b72', '#8b5a3c', '#31504d']
    },
    taxi: {
      id: 'taxi', label: 'TAXI', maxSpeed: 34, accel: 9.6, brake: 18, grip: 7.4,
      mass: 1500, value: 9500, seats: 4, length: 4.7, width: 1.92, height: 1.5,
      wheelBase: 2.72, wheelRadius: 0.34, clearance: 0.3,
      colors: ['#f0c53c', '#e0b32e', '#f5d35c']
    },
    police: {
      id: 'police', label: 'POLICE CRUISER', maxSpeed: 41, accel: 12.4, brake: 24, grip: 8.6,
      mass: 1650, value: 32000, seats: 4, length: 4.75, width: 1.98, height: 1.5,
      wheelBase: 2.75, wheelRadius: 0.35, clearance: 0.3, isPolice: true,
      colors: ['#f2f0e6', '#1a2230']
    },
    armored: {
      id: 'armored', label: 'ARMORED TRUCK', maxSpeed: 24, accel: 5.6, brake: 16, grip: 6.6,
      mass: 3900, value: 60000, seats: 2, length: 6.2, width: 2.3, height: 2.8,
      wheelBase: 3.6, wheelRadius: 0.46, clearance: 0.5, armored: true,
      colors: ['#6f7a70', '#4c5651', '#8d958b']
    },
    sports: {
      id: 'sports', label: 'SERATA GT', maxSpeed: 46, accel: 15.0, brake: 26, grip: 9.2,
      mass: 1120, value: 145000, seats: 2, length: 4.25, width: 1.92, height: 1.16,
      wheelBase: 2.5, wheelRadius: 0.33, clearance: 0.22,
      colors: ['#ff6f61', '#f4efe2', '#1b3d4a', '#ff2d95', '#f3c969', '#202228']
    }
  };

  var WEAPONS = {
    fists: {
      id: 'fists', slot: 1, name: 'FISTS', kind: 'melee', icon: 'fist',
      damage: 18, fireRate: 1.7, spread: 0, range: 1.9, mag: 0, reserve: 0,
      price: 0, ammoPrice: 0, pellets: 1, auto: false, recoil: 0.02, shake: 0.12,
      description: 'A working-class argument.'
    },
    pistol: {
      id: 'pistol', slot: 2, name: 'PISTOL', kind: 'pistol', icon: 'pistol',
      damage: 24, fireRate: 4.2, spread: 0.012, range: 55, mag: 12, reserve: 96,
      price: 450, ammoPrice: 45, pellets: 1, auto: false, recoil: 0.055, shake: 0.28,
      description: 'Reliable. Quiet enough for the marina.'
    },
    smg: {
      id: 'smg', slot: 3, name: 'SMG', kind: 'smg', icon: 'smg',
      damage: 15, fireRate: 10.5, spread: 0.03, range: 46, mag: 30, reserve: 180,
      price: 1250, ammoPrice: 90, pellets: 1, auto: true, recoil: 0.04, shake: 0.22,
      description: 'Thirty reasons to leave the block.'
    },
    shotgun: {
      id: 'shotgun', slot: 4, name: 'SHOTGUN', kind: 'shotgun', icon: 'shotgun',
      damage: 11, fireRate: 1.15, spread: 0.075, range: 24, mag: 6, reserve: 36,
      price: 1800, ammoPrice: 140, pellets: 8, auto: false, recoil: 0.16, shake: 0.62,
      description: 'Negotiation with a wide blast radius.'
    },
    rifle: {
      id: 'rifle', slot: 5, name: 'RIFLE', kind: 'rifle', icon: 'rifle',
      damage: 42, fireRate: 2.2, spread: 0.006, range: 120, mag: 20, reserve: 100,
      price: 3200, ammoPrice: 180, pellets: 1, auto: false, recoil: 0.11, shake: 0.48,
      description: 'For estate work and long driveways.'
    }
  };

  var CREW = {
    maya: {
      id: 'maya', name: 'MAYA', key: 'KeyX', keyLabel: 'X', cooldown: 40,
      ability: 'DECOY', description: 'Clears roadblocks and burns one wanted star.'
    },
    dez: {
      id: 'dez', name: 'DEZ', key: 'KeyC', keyLabel: 'C', cooldown: 50,
      ability: 'REPAIR', description: 'Patches the current vehicle to full health.'
    },
    rook: {
      id: 'rook', name: 'ROOK', key: 'KeyV', keyLabel: 'V', cooldown: 45,
      ability: 'BACKUP', description: 'Stuns every officer within twenty metres.'
    }
  };

  var MISSIONS = [
    {
      id: 'valet-run',
      index: 1,
      title: 'VALET RUN',
      giver: 'VINNIE SALTA',
      role: 'MARINA BOSS',
      district: 'THE MARINA',
      marker: { x: -438, z: -180 },
      portrait: { skin: '#c98f6a', hair: '#17151a', shirt: '#1d5c64', accent: '#f3c969', tie: '#a33b34' },
      briefing: [
        'You are late, Calder. The Serata is sitting at slip nine with the keys in it.',
        'Ocean Hotel, front drive, ninety seconds. The valet there owes me a favour and you owe me everything.',
        'Use the minimap. Yellow is the drop. Do not bring the cops to my marina.'
      ],
      steps: [
        { id: 'reach-car', text: 'Get to the Serata at Marina Slip 9', kind: 'goto', target: { x: -438, z: -180 }, radius: 9 },
        { id: 'steal-car', text: 'Steal the sports car', kind: 'enter', target: { x: -438, z: -180 }, radius: 5, vehicle: 'sports' },
        { id: 'deliver', text: 'Deliver the Serata to the Ocean Hotel', kind: 'deliver', target: { x: -414, z: 180 }, radius: 10, vehicle: 'sports' }
      ],
      dispatch: [
        { unit: 'VINNIE', status: 'ON COMMS', dist: false },
        { unit: 'HOTEL VALET', status: 'WAITING', dist: true },
        { unit: 'CRUISER 4', status: 'PATROL', dist: true }
      ],
      timer: 90,
      reward: 1500,
      heatOnStart: 0,
      heatOnComplete: 0,
      failReasons: ['The Serata was destroyed', 'Time expired'],
      dialogue: [
        { at: 0, speaker: 'VINNIE', text: 'Ninety seconds, Calder. I am timing you.' },
        { at: 8, speaker: 'MAYA', text: 'Nice car. Try not to redecorate it on the seawall.' },
        { at: 45, speaker: 'VINNIE', text: 'Hotel is watching. Keep it clean.' },
        { at: 82, speaker: 'MAYA', text: 'You are cutting it close, Leo.' }
      ],
      rankCuts: { s: 45, a: 62, b: 78 },
      next: 'plaza-debt'
    },
    {
      id: 'plaza-debt',
      index: 2,
      title: 'PLAZA DEBT',
      giver: 'MARISOL',
      role: 'PLAZA FIXER',
      district: 'PLAZA SOL',
      marker: { x: 50, z: 50 },
      portrait: { skin: '#a96f4e', hair: '#2a1712', shirt: '#7c1f46', accent: '#ff2d95', tie: '#f3c969' },
      briefing: [
        'Two men owe Plaza Sol money and both think the plaza makes them invisible.',
        'Rico is by the fountain. Tavo is under the arcade. No guns — I want them walking and talking to their friends.',
        'The noise will bring two stars. Lose them before you come back to me.'
      ],
      steps: [
        { id: 'debtor-one', text: 'Intimidate Rico by the fountain', kind: 'melee', target: { x: 28, z: 66 }, radius: 4, count: 3 },
        { id: 'debtor-two', text: 'Intimidate Tavo under the arcade', kind: 'melee', target: { x: 74, z: 26 }, radius: 4, count: 3 },
        { id: 'lose-heat', text: 'Lose the 2-star response', kind: 'evade', radius: 0 }
      ],
      dispatch: [
        { unit: 'SQUAD 2', status: 'EN ROUTE', dist: true, heat: 2 },
        { unit: 'SQUAD 4', status: 'SEARCHING', dist: true, heat: 2 },
        { unit: 'MAYA', status: 'READY', dist: false, crew: 'maya' }
      ],
      timer: 240,
      reward: 2200,
      heatOnStart: 0,
      heatOnComplete: 2,
      failReasons: ['Marisol lost patience', 'You were busted'],
      dialogue: [
        { at: 0, speaker: 'MARISOL', text: 'Rico first. The fountain. Make it loud enough for Tavo to hear.' },
        { at: 18, speaker: 'MARISOL', text: 'Good. Now the arcade. Do not break the tile, it is imported.' },
        { at: 42, speaker: 'MAYA', text: 'Two cruisers just turned onto the plaza. Time to go.' },
        { at: 70, speaker: 'MARISOL', text: 'Lose them, Leo. I do not bail out tourists.' }
      ],
      rankCuts: { s: 75, a: 115, b: 165 },
      next: 'pier-heist'
    },
    {
      id: 'pier-heist',
      index: 3,
      title: 'PIER HEIST',
      giver: 'ROOK',
      role: 'CREW · MUSCLE',
      district: 'THE PIER',
      marker: { x: -452, z: 300 },
      portrait: { skin: '#6f4b34', hair: '#0e0d10', shirt: '#2c3d2f', accent: '#28e0d0', tie: '#1a1a1a' },
      briefing: [
        'The case is on the pier, and the pier belongs to Crowe tonight. Two guard teams, maybe more.',
        'Take the case and hold the deck. I will keep the boat ramp clear; you keep breathing.',
        'Crowe hears about this, the whole city goes hot. That is a problem for tomorrow.'
      ],
      steps: [
        { id: 'reach-pier', text: 'Reach the pier', kind: 'goto', target: { x: -452, z: 300 }, radius: 12 },
        { id: 'take-case', text: 'Take the case', kind: 'interact', target: { x: -444, z: 312 }, radius: 3 },
        { id: 'wave-one', text: 'Survive the first guard wave', kind: 'survive', count: 3, target: { x: -444, z: 312 } },
        { id: 'wave-two', text: 'Survive the second guard wave', kind: 'survive', count: 4, target: { x: -444, z: 312 } },
        { id: 'escape', text: 'Escape by the boat ramp', kind: 'goto', target: { x: -452, z: 372 }, radius: 8 }
      ],
      dispatch: [
        { unit: 'ROOK', status: 'COVERING RAMP', dist: true, crew: 'rook' },
        { unit: 'GUARDS A', status: 'HOLDING', dist: true },
        { unit: 'GUARDS B', status: 'INBOUND', dist: true }
      ],
      timer: 240,
      reward: 4000,
      heatOnStart: 1,
      heatOnComplete: 3,
      failReasons: ['The case was lost', 'You went down on the pier'],
      dialogue: [
        { at: 0, speaker: 'ROOK', text: 'Case is at the end of the pier. Do not stop for the view.' },
        { at: 20, speaker: 'ROOK', text: 'First wave moving. Use the crates, not your face.' },
        { at: 55, speaker: 'ROOK', text: 'Second team coming from the boathouse. I see four.' },
        { at: 95, speaker: 'ROOK', text: 'Ramp is clear. Move, move, move.' }
      ],
      rankCuts: { s: 95, a: 150, b: 210 },
      next: 'convoy'
    },
    {
      id: 'convoy',
      index: 4,
      title: 'CONVOY',
      giver: 'MAYA',
      role: 'CREW · WHEELS',
      district: 'RING ROAD',
      marker: { x: 400, z: -100 },
      portrait: { skin: '#e0ad86', hair: '#5a1f2a', shirt: '#203b4a', accent: '#ff6f61', tie: '#f3c969' },
      briefing: [
        'Armored truck is running the ring road alone. Crowe got cheap on the escort.',
        'Hijack it, then keep it moving. They will throw a roadblock ahead of you — that is what I am for.',
        'Hit X and my decoy pulls the units east. Deliver the truck to Dez and we all get paid.'
      ],
      steps: [
        { id: 'reach-truck', text: 'Reach the armored truck on the ring road', kind: 'goto', target: { x: 400, z: -100 }, radius: 15 },
        { id: 'hijack', text: 'Hijack the armored truck', kind: 'enter', target: { x: 400, z: -100 }, radius: 6, vehicle: 'armored' },
        { id: 'run-ring', text: 'Run the ring road south', kind: 'drive', target: { x: 400, z: 60 }, radius: 18 },
        { id: 'roadblock', text: 'Use Maya’s decoy on the roadblock', kind: 'ability', crew: 'maya', target: { x: 400, z: 60 }, radius: 40 },
        { id: 'deliver-truck', text: 'Deliver the truck to Dez Garage', kind: 'deliver', target: { x: 150, z: -50 }, radius: 12, vehicle: 'armored' }
      ],
      dispatch: [
        { unit: 'SQUAD 2', status: 'EN ROUTE', dist: true, heat: 3 },
        { unit: 'ROADBLOCK', status: 'SET', dist: true, target: 'convoyRoadblock' },
        { unit: 'MAYA', status: 'READY', dist: false, crew: 'maya' }
      ],
      timer: 210,
      reward: 6500,
      heatOnStart: 3,
      heatOnComplete: 3,
      failReasons: ['The truck was destroyed', 'The truck was recovered by police'],
      dialogue: [
        { at: 0, speaker: 'MAYA', text: 'Truck is yours. Try not to trade paint with the whole department.' },
        { at: 18, speaker: 'MAYA', text: 'Roadblock forming ahead. Keep your foot down.' },
        { at: 25, speaker: 'MAYA', text: 'Say the word. X. I will pull them east.' },
        { at: 60, speaker: 'DEZ', text: 'Garage doors are open. Bring it in hot if you have to.' }
      ],
      rankCuts: { s: 90, a: 140, b: 190 },
      next: 'estate-siege'
    },
    {
      id: 'estate-siege',
      index: 5,
      title: 'ESTATE SIEGE',
      giver: 'DEZ',
      role: 'CREW · WHEELS',
      district: 'CROWE ESTATE',
      marker: { x: 350, z: -350 },
      portrait: { skin: '#8a5a3c', hair: '#23211f', shirt: '#3a2f2a', accent: '#f3c969', tie: '#0f7b78' },
      briefing: [
        'Crowe is at the estate with his captain and more guns than sense. This is the last door in the city.',
        'Clear the courtyard, put the captain down, and get out before the response closes the gate.',
        'Rook is on the wall. Dez keeps the engine warm. Nobody gets left behind tonight.'
      ],
      steps: [
        { id: 'infiltrate', text: 'Infiltrate Crowe’s estate', kind: 'goto', target: { x: 330, z: -330 }, radius: 12 },
        { id: 'courtyard', text: 'Clear the courtyard', kind: 'eliminate', count: 6, target: { x: 360, z: -360 } },
        { id: 'captain', text: 'Defeat Crowe’s captain', kind: 'boss', target: { x: 386, z: -386 } },
        { id: 'escape', text: 'Escape the estate', kind: 'goto', target: { x: -350, z: -350 }, radius: 18 }
      ],
      dispatch: [
        { unit: 'SQUAD 6', status: 'INBOUND', dist: true, heat: 5 },
        { unit: 'ROOK', status: 'ON THE WALL', dist: true, crew: 'rook' },
        { unit: 'DEZ', status: 'ENGINE WARM', dist: false, crew: 'dez' }
      ],
      timer: 300,
      reward: 12000,
      heatOnStart: 4,
      heatOnComplete: 5,
      failReasons: ['You went down at the estate', 'Crowe’s captain survived'],
      dialogue: [
        { at: 0, speaker: 'ROOK', text: 'Gate is thin. Courtyard is not. Clear it slow.' },
        { at: 30, speaker: 'DEZ', text: 'Captain is in the back. Big coat, bigger ego.' },
        { at: 65, speaker: 'CROWE', text: 'You should have stayed on the beach, Calder.' },
        { at: 100, speaker: 'MAYA', text: 'Response is closing the gate. Time to disappear.' }
      ],
      rankCuts: { s: 130, a: 200, b: 265 },
      next: null
    }
  ];

  var CLOCK = {
    dayLength: 720,
    startMinutes: 18 * 60 + 12,
    startDay: 1,
    startWeather: 'haze',
    weathers: ['clear', 'haze', 'rain'],
    weatherChangeMin: 150,
    weatherChangeMax: 260,
    dawn: 5.5,
    day: 7.5,
    dusk: 18.0,
    night: 20.5,
    rainFog: 300,
    hazeFog: 470,
    clearFog: 620
  };

  var SAVE_KEY = 'leonida-heat-3d.save.v6';
  var SETTINGS_KEY = 'leonida-heat-3d.settings.v6';

  LH.CONFIG = {
    VERSION: 6,
    SAVE_KEY: SAVE_KEY,
    SETTINGS_KEY: SETTINGS_KEY,
    WORLD: WORLD,
    PLAYER: PLAYER,
    VEHICLES: VEHICLES,
    WEAPONS: WEAPONS,
    CREW: CREW,
    MISSIONS: MISSIONS,
    PALETTE: PALETTE,
    CLOCK: CLOCK,
    CAMERA: {
      fov: 62,
      aimFov: 46,
      vehicleFov: 68,
      maxFov: 78,
      distance: 5.5,
      height: 2.4,
      vehicleDistance: 7.4,
      vehicleHeight: 3.3,
      aimDistance: 3.1,
      shoulder: 0.62,
      aimShoulder: 0.8,
      minPitch: -0.55,
      maxPitch: 0.85,
      sensitivity: 0.0022,
      followLag: 9.5,
      lookLag: 13,
      collisionPad: 0.45,
      minDistance: 1.4,
      sway: 0.035
    },
    HUD: {
      minimapScale: 900,
      minimapRadius: 110,
      toastLife: 3.6,
      maxToasts: 4,
      moneyCountSpeed: 8,
      dispatchRange: 1500
    },
    QUALITY: {
      shadowsHigh: 2048,
      shadowsLow: 1024,
      pixelRatioCap: 1.5,
      particleCap: 300
    }
  };
}());
