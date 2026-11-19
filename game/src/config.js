// Leonida Heat v3 - the shared rulebook.
// Every tunable that matters lives here: the city plan, the car roster, the
// guns and grenade, the heat ladder, the economy, the 24-hour clock, weather
// and the stunt/collectible rewards. Systems import this file directly, so a
// tuning pass lands everywhere at once. All names, places, cars, stations and
// people are invented for this game.

export const GAME_TITLE = 'Leonida Heat';
export const GAME_SUBTITLE = 'A Costa Sol Crime Story';
export const GAME_VERSION = '3.0.0';
export const SAVE_KEY = 'leonida-heat-save-v3';
export const SAVE_VERSION = 3;
export const LEGACY_SAVE_KEYS = ['leonida-heat-save-v2', 'leonida-heat-save-v1'];
export const STEP = 1 / 60;

export const MAP_CONFIG = {
  width: 3200,
  height: 3200,
  gridSize: 100,
  oceanLine: 2712,
  sandLine: 2480,
  boardwalkLine: 2494,
};

// ---------------------------------------------------------------------------
// Six districts. Bounds overlap on purpose at the seams; districtAt returns
// the first match, so the order is the tie-breaker.
// ---------------------------------------------------------------------------
export const DISTRICTS = [
  {
    id: 'coral_strip',
    name: 'Coral Strip',
    sub: 'Beachfront & Neon Boardwalk',
    short: 'CORAL',
    bounds: { minX: 2320, minY: 0, maxX: 3200, maxY: 3200 },
    ambient: '#ffe6d2',
    neon: '#ff6f91',
    lot: '#e7cda6',
    map: '#5c3b4d',
    character: 'beach',
    density: 0.52,
    tint: 'rgba(255, 128, 118, 0.06)',
  },
  {
    id: 'vantage',
    name: 'Vantage Heights',
    sub: 'Towers & Financial Plazas',
    short: 'VANTAGE',
    bounds: { minX: 1080, minY: 620, maxX: 2320, maxY: 2140 },
    ambient: '#e3f4ff',
    neon: '#5ce1e6',
    lot: '#c6c0b2',
    map: '#37424d',
    character: 'downtown',
    density: 0.9,
    tint: 'rgba(92, 225, 230, 0.045)',
  },
  {
    id: 'palmetto',
    name: 'Palmetto Gardens',
    sub: 'Estates & Manicured Lawns',
    short: 'PALMETTO',
    bounds: { minX: 0, minY: 0, maxX: 1080, maxY: 1420 },
    ambient: '#eefbe9',
    neon: '#8fe3a5',
    lot: '#93b47f',
    map: '#39492f',
    character: 'estates',
    density: 0.42,
    tint: 'rgba(143, 227, 165, 0.045)',
  },
  {
    id: 'drydock',
    name: 'Drydock Quarter',
    sub: 'Piers & Cargo Terminals',
    short: 'DRYDOCK',
    bounds: { minX: 1800, minY: 2100, maxX: 3200, maxY: 3200 },
    ambient: '#e7f0fb',
    neon: '#59a9ff',
    lot: '#b3aa9b',
    map: '#3a4148',
    character: 'docks',
    density: 0.48,
    tint: 'rgba(89, 169, 255, 0.04)',
  },
  {
    id: 'ironworks',
    name: 'Ironworks',
    sub: 'Warehouses & Chop Shops',
    short: 'IRONWORKS',
    bounds: { minX: 0, minY: 1420, maxX: 1080, maxY: 3200 },
    ambient: '#fbf1e1',
    neon: '#ffb45c',
    lot: '#b8a48d',
    map: '#4a3d34',
    character: 'industry',
    density: 0.55,
    tint: 'rgba(255, 180, 92, 0.04)',
  },
  {
    id: 'market_row',
    name: 'Market Row',
    sub: 'Low Rises & Late Diners',
    short: 'MARKET',
    bounds: { minX: 1080, minY: 2140, maxX: 1800, maxY: 3200 },
    ambient: '#fff1e6',
    neon: '#ffcf5c',
    lot: '#c6b49d',
    map: '#4a4036',
    character: 'market',
    density: 0.74,
    tint: 'rgba(255, 207, 92, 0.05)',
  },
];

export function districtAt(x, y) {
  for (const d of DISTRICTS) {
    const b = d.bounds;
    if (x >= b.minX && x < b.maxX && y >= b.minY && y < b.maxY) return d;
  }
  return DISTRICTS[1];
}

// ---------------------------------------------------------------------------
// Vehicles. Physics is arcade, but the numbers read like a car: px/s, mass in
// kilograms, lateral grip as a damping rate. `art` drives the renderer's
// silhouette and damage model. `notes` are the engine's sustained voices.
// ---------------------------------------------------------------------------
export const VEHICLE_TYPES = {
  marlin: {
    id: 'marlin', name: 'Marlin GT', klass: 'sports',
    width: 29, length: 58, topSpeed: 552, reverseSpeed: 190, accel: 420,
    brake: 4.9, turnSpeed: 3.2, grip: 5.3, driftGrip: 1.35, mass: 1160,
    maxHp: 132, colors: ['#ff5f7e', '#39d8d0', '#ffd23f', '#f4f1e8', '#ff7a3c'],
    stripe: true, engineNote: 1.28, exhaust: 0.9,
    art: { body: 'sports', nose: 0.3, tail: 0.3, roof: 0.4, spoiler: true, scoop: false, lights: 'slit' },
  },
  vipera: {
    id: 'vipera', name: 'Vipera', klass: 'muscle',
    width: 33, length: 62, topSpeed: 505, reverseSpeed: 178, accel: 445,
    brake: 4.3, turnSpeed: 2.7, grip: 4.2, driftGrip: 1.0, mass: 1510,
    maxHp: 156, colors: ['#2f6bff', '#b4233a', '#22222b', '#6d3fa8'],
    stripe: true, engineNote: 0.92, exhaust: 1.1,
    art: { body: 'muscle', nose: 0.3, tail: 0.32, roof: 0.33, spoiler: true, scoop: true, lights: 'round' },
  },
  meridian: {
    id: 'meridian', name: 'Meridian Sedan', klass: 'sedan',
    width: 31, length: 57, topSpeed: 392, reverseSpeed: 146, accel: 305,
    brake: 5.0, turnSpeed: 2.8, grip: 5.7, driftGrip: 1.9, mass: 1390,
    maxHp: 126, colors: ['#6f8ea3', '#3c4b57', '#9b7a63', '#4c5f6a', '#c8cdd2', '#8c5b47'],
    stripe: false, engineNote: 0.8, exhaust: 0.5,
    art: { body: 'sedan', nose: 0.26, tail: 0.28, roof: 0.4, spoiler: false, scoop: false, lights: 'block' },
  },
  patrol: {
    id: 'patrol', name: 'Patrol Cruiser', klass: 'police',
    width: 32, length: 60, topSpeed: 486, reverseSpeed: 170, accel: 414,
    brake: 5.2, turnSpeed: 3.0, grip: 5.0, driftGrip: 1.55, mass: 1680,
    maxHp: 208, isPolice: true, colors: ['#eef1f3'], stripe: false, engineNote: 0.9, exhaust: 0.7,
    art: { body: 'police', nose: 0.26, tail: 0.28, roof: 0.38, spoiler: false, scoop: false, lights: 'block', lightbar: true },
  },
  interceptor: {
    id: 'interceptor', name: 'Ranger Interceptor', klass: 'police',
    width: 35, length: 65, topSpeed: 540, reverseSpeed: 176, accel: 468,
    brake: 5.3, turnSpeed: 3.0, grip: 5.1, driftGrip: 1.5, mass: 1900,
    maxHp: 250, isPolice: true, colors: ['#1d2733'], stripe: false, engineNote: 0.76, exhaust: 1.2,
    art: { body: 'suv', nose: 0.24, tail: 0.26, roof: 0.5, spoiler: false, scoop: false, lights: 'bar', lightbar: true },
  },
  hauler: {
    id: 'hauler', name: 'Dock Hauler', klass: 'truck',
    width: 35, length: 70, topSpeed: 312, reverseSpeed: 122, accel: 232,
    brake: 3.4, turnSpeed: 2.0, grip: 5.8, driftGrip: 2.5, mass: 2550,
    maxHp: 290, colors: ['#d5d9dd', '#aeb6bc', '#8e99a1', '#c46b2f', '#555b60'],
    stripe: false, engineNote: 0.6, exhaust: 1.4,
    art: { body: 'van', nose: 0.16, tail: 0.14, roof: 0.64, spoiler: false, scoop: false, lights: 'block' },
  },
  wasp: {
    id: 'wasp', name: 'Wasp Bike', klass: 'bike',
    width: 16, length: 42, topSpeed: 526, reverseSpeed: 86, accel: 492,
    brake: 5.6, turnSpeed: 3.8, grip: 4.6, driftGrip: 0.9, mass: 390,
    maxHp: 74, colors: ['#ff3e57', '#24d98a', '#ffbf3f', '#8f4cff'],
    stripe: false, engineNote: 1.5, exhaust: 0.7,
    art: { body: 'bike', nose: 0.3, tail: 0.24, roof: 0.2, spoiler: false, scoop: false, lights: 'round' },
  },
  boxer: {
    id: 'boxer', name: 'Boxer Utility', klass: 'truck',
    width: 33, length: 63, topSpeed: 336, reverseSpeed: 128, accel: 252,
    brake: 3.9, turnSpeed: 2.2, grip: 5.5, driftGrip: 2.2, mass: 2150,
    maxHp: 236, colors: ['#6b7f63', '#8d6b4a', '#4c5c6e', '#a9a49a'],
    stripe: false, engineNote: 0.7, exhaust: 0.9,
    art: { body: 'box', nose: 0.2, tail: 0.18, roof: 0.58, spoiler: false, scoop: false, lights: 'block' },
  },
  cabrio: {
    id: 'cabrio', name: 'Sunline Cabrio', klass: 'sports',
    width: 31, length: 58, topSpeed: 462, reverseSpeed: 158, accel: 366,
    brake: 4.8, turnSpeed: 3.0, grip: 5.0, driftGrip: 1.5, mass: 1290,
    maxHp: 118, colors: ['#ffe2b8', '#ff8fb1', '#7fd8e8', '#f4f1e8'],
    stripe: false, engineNote: 1.05, exhaust: 0.7,
    art: { body: 'sports', nose: 0.3, tail: 0.28, roof: 0.05, spoiler: false, scoop: false, lights: 'slit', open: true },
  },
};

export const VEHICLE_IDS = Object.keys(VEHICLE_TYPES);
export const CIVILIAN_VEHICLES = [
  'meridian', 'meridian', 'meridian', 'marlin', 'vipera', 'hauler', 'wasp', 'boxer', 'boxer', 'cabrio',
];

// ---------------------------------------------------------------------------
// Weapons. `fists` is a three-hit combo; grenades are a separate throwable
// with a real fuse, arc and blast radius.
// ---------------------------------------------------------------------------
export const WEAPON_CONFIG = {
  fists: {
    id: 'fists', name: 'Fists', damage: 18, range: 54, fireRate: 0.28,
    clipSize: Infinity, maxReserve: Infinity, spread: 0, speed: 0, recoil: 0,
    sound: 'punch', tint: '#e8c39a', melee: true, burst: 0,
    comboDamage: [16, 19, 34], comboKnockback: [70, 90, 190],
  },
  pistol: {
    id: 'pistol', name: '9mm Sidearm', damage: 27, range: 480, fireRate: 0.22,
    reloadTime: 1.05, clipSize: 15, maxReserve: 120, spread: 0.028, speed: 1200,
    recoil: 2, sound: 'pistol', tint: '#cfd6dd', accuracy: 0.74, burst: 1,
  },
  smg: {
    id: 'smg', name: 'Tide SMG', damage: 18, range: 438, fireRate: 0.082,
    reloadTime: 1.35, clipSize: 30, maxReserve: 240, spread: 0.085, speed: 1280,
    recoil: 1.2, sound: 'smg', tint: '#b7c0c9', accuracy: 0.63, burst: 3,
  },
  shotgun: {
    id: 'shotgun', name: 'Breakwater 12g', damage: 14, pellets: 7, range: 356,
    fireRate: 0.76, reloadTime: 1.8, clipSize: 8, maxReserve: 48, spread: 0.24,
    speed: 1010, recoil: 5, sound: 'shotgun', tint: '#d8b98f', accuracy: 0.55, burst: 1,
  },
  rifle: {
    id: 'rifle', name: 'Ranger Rifle', damage: 35, range: 600, fireRate: 0.112,
    reloadTime: 1.5, clipSize: 30, maxReserve: 180, spread: 0.038, speed: 1450,
    recoil: 2.5, sound: 'rifle', tint: '#9ca7b0', accuracy: 0.87, burst: 2,
  },
};

export const WEAPON_ORDER = ['fists', 'pistol', 'smg', 'shotgun', 'rifle'];

export const GRENADE_CONFIG = {
  id: 'grenade',
  name: 'Frag Grenade',
  fuse: 1.55,
  throwSpeed: 470,
  radius: 132,
  damage: 118,
  vehicleDamage: 190,
  maxCount: 6,
  bounces: 2,
  cooldown: 0.9,
};

// ---------------------------------------------------------------------------
// Heat. Each star buys the response more units, more aggression and more
// tools: roadblocks, interceptors, and finally a city-wide manhunt.
// ---------------------------------------------------------------------------
export const WANTED_CONFIG = {
  levels: [
    { stars: 0, maxCops: 0, maxFoot: 0, aggressive: false, dispatchInterval: 0, enforcersFire: false, response: 'CLEAR' },
    { stars: 1, maxCops: 1, maxFoot: 2, aggressive: false, dispatchInterval: 9, enforcersFire: false, response: 'PATROL EYES' },
    { stars: 2, maxCops: 3, maxFoot: 3, aggressive: true, dispatchInterval: 7, enforcersFire: true, response: 'PURSUIT' },
    { stars: 3, maxCops: 4, maxFoot: 5, aggressive: true, dispatchInterval: 5.6, enforcersFire: true, roadblocks: true, response: 'ROADBLOCK' },
    { stars: 4, maxCops: 6, maxFoot: 6, aggressive: true, dispatchInterval: 4.3, enforcersFire: true, roadblocks: true, interceptors: true, response: 'RANGER SWEEP' },
    { stars: 5, maxCops: 8, maxFoot: 8, aggressive: true, dispatchInterval: 3.2, enforcersFire: true, roadblocks: true, manhunt: true, interceptors: true, response: 'CITY MANHUNT' },
  ],
  cooldownTime: 15,
  perStarDecay: 8,
  bustedFine: 450,
  wastedFee: 400,
  searchRadius: 540,
  bustedTime: 1.35,
};

export const PHYSICS_CONFIG = {
  playerWalkSpeed: 148,
  playerSprintSpeed: 258,
  playerAccel: 1500,
  playerRollSpeed: 430,
  playerRollDuration: 0.38,
  playerRollCooldown: 0.72,
  playerRadius: 14,
  carFriction: 0.52,
  skidDecay: 28,
  rainGripLoss: 0.18,
  trafficCruiseMin: 140,
  trafficCruiseMax: 252,
  meleeComboWindow: 1.15,
  stuntMinSpeed: 255,
  stuntGravity: 760,
};

// Stunt ramps: airtime, rewards and the HUD banner timing.
export const STUNT_CONFIG = {
  minSpeed: 255,
  maxAir: 1.9,
  cashPerSecond: 95,
  cleanBonus: 280,
  cooldown: 0.8,
  bannerTime: 3.6,
  label: 'STUNT',
};

// A dozen hidden mixtapes. Finding all twelve pays a city bonus.
export const COLLECTIBLE_CONFIG = {
  total: 12,
  label: 'Lost Mixtapes',
  short: 'MIXTAPES',
  reward: 2500,
  score: 400,
  radius: 34,
  colors: ['#ffcf5c', '#ff7f9e', '#5ce1e6', '#8fe3a3'],
};

export const GARAGE_CONFIG = {
  repairCost: 300,
  fullRepairCost: 520,
  radius: 86,
  label: 'RUSTLINE GARAGE',
};

// ---------------------------------------------------------------------------
// Palette. Sun-bleached coast by day, electric neon by night.
// ---------------------------------------------------------------------------
export const PALETTE = {
  sun: '#ffd9a0',
  sunDeep: '#ff9a62',
  dawn: '#ffb0b8',
  dusk: '#6a4478',
  night: '#14172e',
  road: '#4c4750',
  roadEdge: '#5c5660',
  sidewalk: '#d9c9ae',
  sidewalkDark: '#c3b294',
  grass: '#8fae7a',
  grassDeep: '#6d8d62',
  sand: '#efd3a0',
  waterDeep: '#1f6d83',
  waterShallow: '#49b6bd',
  foam: '#d8f5f2',
  gold: '#ffd166',
  pink: '#ff6f91',
  cyan: '#58e0e8',
  mint: '#8fe3a3',
  blue: '#6fb7ff',
  danger: '#ff5d6c',
  uiPanel: 'rgba(18, 16, 26, 0.84)',
  uiInk: '#f6efe2',
  uiDim: 'rgba(246, 239, 226, 0.6)',
  uiLine: 'rgba(255, 214, 150, 0.28)',
};

export const RADIO_STATIONS = [
  { id: 'sunset', name: 'SUNSET STATIC 98.4', genre: 'Neon Synthwave', bpm: 112, color: '#ff7f9e' },
  { id: 'coral', name: 'CORAL BASS RADIO', genre: 'Coastal Trap', bpm: 136, color: '#5ce1e6' },
  { id: 'tidepool', name: 'TIDEPOOL LOUNGE', genre: 'Late Beach Chords', bpm: 80, color: '#ffd166' },
  { id: 'off', name: 'RADIO OFF', genre: '—', bpm: 0, color: '#8b93a0' },
];

// 24-hour clock. timeOfDay runs 0..1 (0 = midnight, 0.5 = noon). The full
// cycle is deliberately long: a session sees the sun move, not spin.
export const TIME_OF_DAY = {
  start: 0.685,
  cycleSeconds: 720,
  dawnStart: 0.205,
  dawnEnd: 0.295,
  duskStart: 0.655,
  duskEnd: 0.765,
  nightStart: 0.78,
  nightEnd: 0.19,
};

export const WEATHER_CONFIG = {
  types: ['clear', 'clear', 'clear', 'haze', 'rain', 'rain', 'storm'],
  minSeconds: 52,
  maxSeconds: 132,
  wetnessRise: 1 / 32,
  wetnessDry: 1 / 85,
  rainIntensity: { clear: 0, haze: 0.04, rain: 0.62, storm: 1 },
  fog: { clear: 0, haze: 0.16, rain: 0.24, storm: 0.4 },
  grip: { clear: 0, haze: 0.01, rain: 0.14, storm: 0.22 },
  labels: { clear: 'CLEAR', haze: 'HAZE', rain: 'RAIN', storm: 'STORM' },
};

export const ENEMY_ARCHETYPES = {
  street: { id: 'street', name: 'Street Thug', health: 66, speed: 116, accuracy: 0.55, reaction: 0.4, burst: 1, color: '#c9463f', preferredRange: 190, flank: 0.5, cover: 0.5 },
  enforcer: { id: 'enforcer', name: 'Crew Enforcer', health: 96, speed: 132, accuracy: 0.68, reaction: 0.3, burst: 3, color: '#b8402f', preferredRange: 240, flank: 0.8, cover: 0.8 },
  shotgunner: { id: 'shotgunner', name: 'Breakwater Gunner', health: 124, speed: 108, accuracy: 0.5, reaction: 0.42, burst: 1, color: '#8d4a2c', preferredRange: 136, flank: 0.65, cover: 0.35 },
  marksman: { id: 'marksman', name: 'Ridge Marksman', health: 82, speed: 98, accuracy: 0.87, reaction: 0.5, burst: 2, color: '#6e3b61', preferredRange: 362, flank: 0.4, cover: 1 },
  boss: { id: 'boss', name: 'Silas Crowe', health: 330, speed: 142, accuracy: 0.82, reaction: 0.22, burst: 4, color: '#e8b04a', preferredRange: 220, flank: 1, cover: 1, grenade: 7 },
};

export const ECONOMY = {
  startingCash: 750,
  missionBonusStep: 200,
  robberyMin: 26,
  robberyMax: 96,
  hospitalFee: 400,
  impoundFee: 350,
  killScore: 25,
  missionScore: 450,
  repairCost: 300,
  stuntScore: 60,
};
