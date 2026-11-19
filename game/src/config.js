// Leonida Heat - the shared rulebook.
// A single authored source for the city layout, the cast of cars, the guns,
// the heat ladder, the economy and the palette. Systems import from here so
// a tuning change lands everywhere at once. All places, people, brands and
// stations are invented for this game.

export const GAME_TITLE = 'Leonida Heat';
export const GAME_SUBTITLE = 'A Costa Sol Crime Story';
export const GAME_VERSION = '2.0.0';
export const SAVE_KEY = 'leonida-heat-save-v2';
export const SAVE_VERSION = 2;
export const STEP = 1 / 60;

export const MAP_CONFIG = {
  width: 3200,
  height: 3200,
  gridSize: 100,
  oceanLine: 2720,
  sandLine: 2480,
  boardwalkLine: 2494,
};

// ---------------------------------------------------------------------------
// Districts. Bounds overlap deliberately in a couple of seams; districtAt
// returns the first match, and the list order is the tie-breaker.
// ---------------------------------------------------------------------------
export const DISTRICTS = [
  {
    id: 'coral_strip',
    name: 'Coral Strip',
    sub: 'Beachfront & Neon Boardwalk',
    short: 'CORAL',
    bounds: { minX: 2320, minY: 0, maxX: 3200, maxY: 3200 },
    ambient: '#ffe8d8',
    neon: '#ff6f91',
    lot: '#e7cda6',
    map: '#5c3b4d',
    character: 'beach',
    density: 0.55,
  },
  {
    id: 'vantage',
    name: 'Vantage Heights',
    sub: 'Towers & Financial Plazas',
    short: 'VANTAGE',
    bounds: { minX: 1100, minY: 600, maxX: 2320, maxY: 2150 },
    ambient: '#e3f4ff',
    neon: '#5ce1e6',
    lot: '#c6c0b2',
    map: '#37424d',
    character: 'downtown',
    density: 0.85,
  },
  {
    id: 'palmetto',
    name: 'Palmetto Gardens',
    sub: 'Estates & Manicured Lawns',
    short: 'PALMETTO',
    bounds: { minX: 0, minY: 0, maxX: 1100, maxY: 1500 },
    ambient: '#eefbe9',
    neon: '#8fe3a5',
    lot: '#93b47f',
    map: '#39492f',
    character: 'estates',
    density: 0.45,
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
    density: 0.5,
  },
  {
    id: 'ironworks',
    name: 'Ironworks',
    sub: 'Warehouses & Chop Shops',
    short: 'IRONWORKS',
    bounds: { minX: 0, minY: 1500, maxX: 1100, maxY: 3200 },
    ambient: '#fbf1e1',
    neon: '#ffb45c',
    lot: '#b8a48d',
    map: '#4a3d34',
    character: 'industry',
    density: 0.55,
  },
  {
    id: 'market_row',
    name: 'Market Row',
    sub: 'Low Rises & Late Diners',
    short: 'MARKET',
    bounds: { minX: 1100, minY: 2150, maxX: 1900, maxY: 3200 },
    ambient: '#fff1e6',
    neon: '#ffcf5c',
    lot: '#c6b49d',
    map: '#4a4036',
    character: 'market',
    density: 0.7,
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
// Vehicles. Physics is arcade but reads like a car: accel and top speed in
// world px/s, grip as a lateral damping rate, mass in kilograms-ish. `art`
// tells the renderer which silhouette to build.
// ---------------------------------------------------------------------------
export const VEHICLE_TYPES = {
  marlin: {
    id: 'marlin',
    name: 'Marlin GT',
    klass: 'sports',
    width: 30,
    length: 58,
    topSpeed: 540,
    reverseSpeed: 195,
    accel: 400,
    brake: 4.7,
    turnSpeed: 3.15,
    grip: 5.4,
    driftGrip: 1.45,
    mass: 1180,
    maxHp: 130,
    colors: ['#ff5f7e', '#39d8d0', '#ffd23f', '#f4f1e8', '#ff7a3c'],
    stripe: true,
    engineNote: 1.25,
    art: { body: 'sports', nose: 0.36, tail: 0.3, roof: 0.42, spoiler: true, scoop: false, lights: 'slit' },
  },
  vipera: {
    id: 'vipera',
    name: 'Vipera',
    klass: 'muscle',
    width: 33,
    length: 61,
    topSpeed: 500,
    reverseSpeed: 182,
    accel: 430,
    brake: 4.2,
    turnSpeed: 2.65,
    grip: 4.3,
    driftGrip: 1.05,
    mass: 1480,
    maxHp: 152,
    colors: ['#2f6bff', '#b4233a', '#22222b', '#6d3fa8'],
    stripe: true,
    engineNote: 0.92,
    art: { body: 'muscle', nose: 0.34, tail: 0.34, roof: 0.34, spoiler: true, scoop: true, lights: 'round' },
  },
  meridian: {
    id: 'meridian',
    name: 'Meridian Sedan',
    klass: 'sedan',
    width: 31,
    length: 56,
    topSpeed: 385,
    reverseSpeed: 148,
    accel: 295,
    brake: 4.9,
    turnSpeed: 2.75,
    grip: 5.7,
    driftGrip: 1.95,
    mass: 1370,
    maxHp: 124,
    colors: ['#6f8ea3', '#3c4b57', '#9b7a63', '#4c5f6a', '#c8cdd2', '#8c5b47'],
    stripe: false,
    engineNote: 0.8,
    art: { body: 'sedan', nose: 0.3, tail: 0.3, roof: 0.4, spoiler: false, scoop: false, lights: 'block' },
  },
  patrol: {
    id: 'patrol',
    name: 'Patrol Cruiser',
    klass: 'police',
    width: 32,
    length: 60,
    topSpeed: 480,
    reverseSpeed: 172,
    accel: 400,
    brake: 5.1,
    turnSpeed: 3.0,
    grip: 5.0,
    driftGrip: 1.6,
    mass: 1660,
    maxHp: 195,
    isPolice: true,
    colors: ['#eef1f3'],
    stripe: false,
    engineNote: 0.88,
    art: { body: 'police', nose: 0.3, tail: 0.3, roof: 0.38, spoiler: false, scoop: false, lights: 'block', lightbar: true },
  },
  interceptor: {
    id: 'interceptor',
    name: 'Ranger Interceptor',
    klass: 'police',
    width: 35,
    length: 64,
    topSpeed: 535,
    reverseSpeed: 180,
    accel: 455,
    brake: 5.2,
    turnSpeed: 3.0,
    grip: 5.1,
    driftGrip: 1.55,
    mass: 1880,
    maxHp: 240,
    isPolice: true,
    colors: ['#1d2733'],
    stripe: false,
    engineNote: 0.78,
    art: { body: 'suv', nose: 0.28, tail: 0.28, roof: 0.5, spoiler: false, scoop: false, lights: 'bar', lightbar: true },
  },
  hauler: {
    id: 'hauler',
    name: 'Dock Hauler',
    klass: 'van',
    width: 35,
    length: 68,
    topSpeed: 305,
    reverseSpeed: 128,
    accel: 225,
    brake: 3.4,
    turnSpeed: 2.0,
    grip: 5.9,
    driftGrip: 2.5,
    mass: 2500,
    maxHp: 280,
    colors: ['#d5d9dd', '#aeb6bc', '#8e99a1', '#c46b2f', '#555b60'],
    stripe: false,
    engineNote: 0.62,
    art: { body: 'van', nose: 0.2, tail: 0.16, roof: 0.62, spoiler: false, scoop: false, lights: 'block' },
  },
  wasp: {
    id: 'wasp',
    name: 'Wasp Bike',
    klass: 'bike',
    width: 16,
    length: 40,
    topSpeed: 520,
    reverseSpeed: 88,
    accel: 480,
    brake: 5.5,
    turnSpeed: 3.7,
    grip: 4.7,
    driftGrip: 0.95,
    mass: 395,
    maxHp: 76,
    colors: ['#ff3e57', '#24d98a', '#ffbf3f', '#8f4cff'],
    stripe: false,
    engineNote: 1.45,
    art: { body: 'bike', nose: 0.34, tail: 0.26, roof: 0.2, spoiler: false, scoop: false, lights: 'round' },
  },
  boxer: {
    id: 'boxer',
    name: 'Boxer Utility',
    klass: 'van',
    width: 33,
    length: 62,
    topSpeed: 330,
    reverseSpeed: 132,
    accel: 245,
    brake: 3.8,
    turnSpeed: 2.2,
    grip: 5.6,
    driftGrip: 2.3,
    mass: 2100,
    maxHp: 230,
    colors: ['#6b7f63', '#8d6b4a', '#4c5c6e', '#a9a49a'],
    stripe: false,
    engineNote: 0.7,
    art: { body: 'box', nose: 0.24, tail: 0.2, roof: 0.58, spoiler: false, scoop: false, lights: 'block' },
  },
};

export const VEHICLE_IDS = Object.keys(VEHICLE_TYPES);
export const CIVILIAN_VEHICLES = [
  'meridian', 'meridian', 'meridian', 'marlin', 'vipera', 'hauler', 'wasp', 'boxer', 'boxer',
];

// ---------------------------------------------------------------------------
// Weapons. `burst` and `accuracy` are read by enemy AI; `pellets`/`spread`
// make the shotgun a real cone weapon for both sides.
// ---------------------------------------------------------------------------
export const WEAPON_CONFIG = {
  fists: {
    id: 'fists',
    name: 'Fists',
    damage: 20,
    range: 52,
    fireRate: 0.32,
    clipSize: Infinity,
    maxReserve: Infinity,
    spread: 0,
    speed: 0,
    recoil: 0,
    sound: 'punch',
    tint: '#e8c39a',
    melee: true,
    burst: 0,
  },
  pistol: {
    id: 'pistol',
    name: '9mm Sidearm',
    damage: 27,
    range: 470,
    fireRate: 0.23,
    reloadTime: 1.1,
    clipSize: 15,
    maxReserve: 120,
    spread: 0.03,
    speed: 1180,
    recoil: 2,
    sound: 'pistol',
    tint: '#cfd6dd',
    accuracy: 0.72,
    burst: 1,
  },
  smg: {
    id: 'smg',
    name: 'Tide SMG',
    damage: 18,
    range: 430,
    fireRate: 0.085,
    reloadTime: 1.4,
    clipSize: 30,
    maxReserve: 240,
    spread: 0.09,
    speed: 1260,
    recoil: 1.3,
    sound: 'smg',
    tint: '#b7c0c9',
    accuracy: 0.62,
    burst: 3,
  },
  shotgun: {
    id: 'shotgun',
    name: 'Breakwater Shotgun',
    damage: 15,
    pellets: 7,
    range: 350,
    fireRate: 0.78,
    reloadTime: 1.85,
    clipSize: 8,
    maxReserve: 48,
    spread: 0.23,
    speed: 1000,
    recoil: 5,
    sound: 'shotgun',
    tint: '#d8b98f',
    accuracy: 0.55,
    burst: 1,
  },
  rifle: {
    id: 'rifle',
    name: 'Ranger Rifle',
    damage: 35,
    range: 590,
    fireRate: 0.115,
    reloadTime: 1.55,
    clipSize: 30,
    maxReserve: 180,
    spread: 0.04,
    speed: 1420,
    recoil: 2.5,
    sound: 'rifle',
    tint: '#9ca7b0',
    accuracy: 0.86,
    burst: 2,
  },
};

export const WEAPON_ORDER = ['fists', 'pistol', 'smg', 'shotgun', 'rifle'];

// ---------------------------------------------------------------------------
// The heat ladder. Each level changes dispatch cadence, aggression and the
// tools available to the response.
// ---------------------------------------------------------------------------
export const WANTED_CONFIG = {
  levels: [
    { stars: 0, maxCops: 0, maxFoot: 0, aggressive: false, dispatchInterval: 0, enforcersFire: false, response: 'CLEAR' },
    { stars: 1, maxCops: 1, maxFoot: 2, aggressive: false, dispatchInterval: 9, enforcersFire: false, response: 'PATROL EYES' },
    { stars: 2, maxCops: 3, maxFoot: 3, aggressive: true, dispatchInterval: 7, enforcersFire: true, response: 'PURSUIT' },
    { stars: 3, maxCops: 4, maxFoot: 4, aggressive: true, dispatchInterval: 5.5, enforcersFire: true, roadblocks: true, response: 'ROADBLOCK' },
    { stars: 4, maxCops: 6, maxFoot: 5, aggressive: true, dispatchInterval: 4.2, enforcersFire: true, roadblocks: true, interceptors: true, response: 'RANGER SWEEP' },
    { stars: 5, maxCops: 8, maxFoot: 7, aggressive: true, dispatchInterval: 3.1, enforcersFire: true, roadblocks: true, manhunt: true, interceptors: true, response: 'CITY MANHUNT' },
  ],
  cooldownTime: 14,
  perStarDecay: 8.5,
  bustedFine: 500,
  wastedFee: 500,
  searchRadius: 520,
};

export const PHYSICS_CONFIG = {
  playerWalkSpeed: 205,
  playerSprintSpeed: 345,
  playerRollSpeed: 440,
  playerRollDuration: 0.4,
  playerRadius: 15,
  carFriction: 0.55,
  skidDecay: 26,
  rainGripLoss: 0.12,
  trafficCruiseMin: 145,
  trafficCruiseMax: 255,
};

// ---------------------------------------------------------------------------
// Palette. Warm daylight, cool shade, hot neon.
// ---------------------------------------------------------------------------
export const PALETTE = {
  sun: '#ffd9a0',
  sunDeep: '#ff9a62',
  dusk: '#5d3f77',
  night: '#1a1930',
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
  uiPanel: 'rgba(20, 17, 28, 0.82)',
  uiInk: '#f6efe2',
  uiDim: 'rgba(246, 239, 226, 0.62)',
  uiLine: 'rgba(255, 214, 150, 0.28)',
};

export const RADIO_STATIONS = [
  { id: 'sunset', name: 'SUNSET STATIC 98.4', genre: 'Neon Synthwave', bpm: 112, color: '#ff7f9e' },
  { id: 'coral', name: 'CORAL BASS RADIO', genre: 'Coastal Trap', bpm: 136, color: '#5ce1e6' },
  { id: 'tidepool', name: 'TIDEPOOL LOUNGE', genre: 'Late Beach Chords', bpm: 80, color: '#ffd166' },
  { id: 'off', name: 'RADIO OFF', genre: '—', bpm: 0, color: '#8b93a0' },
];

export const TIME_OF_DAY = {
  // Warm late afternoon drifting into violet dusk and neon night.
  start: 0.46,
  cycleSeconds: 420,
  nightStart: 0.56,
  nightFull: 0.72,
};

// Weather is a small state machine owned by the game. Rain wets the roads and
// enables reflective puddles; the renderer reads `game.weather`.
export const WEATHER_CONFIG = {
  types: ['clear', 'clear', 'clear', 'haze', 'rain', 'rain', 'storm'],
  minSeconds: 55,
  maxSeconds: 140,
  wetnessRise: 1 / 35,
  wetnessDry: 1 / 90,
  rainIntensity: { clear: 0, haze: 0, rain: 0.55, storm: 1 },
};

// Enemy archetypes used by combat.js and authored missions.
export const ENEMY_ARCHETYPES = {
  street: { id: 'street', name: 'Street Thug', health: 62, speed: 112, accuracy: 0.55, reaction: 0.4, burst: 1, color: '#c9463f', preferredRange: 190 },
  enforcer: { id: 'enforcer', name: 'Crew Enforcer', health: 92, speed: 126, accuracy: 0.68, reaction: 0.3, burst: 3, color: '#b8402f', preferredRange: 240 },
  shotgunner: { id: 'shotgunner', name: 'Breakwater Gunner', health: 118, speed: 104, accuracy: 0.5, reaction: 0.42, burst: 1, color: '#8d4a2c', preferredRange: 140 },
  marksman: { id: 'marksman', name: 'Ridge Marksman', health: 78, speed: 96, accuracy: 0.86, reaction: 0.5, burst: 2, color: '#6e3b61', preferredRange: 360 },
  boss: { id: 'boss', name: 'Boss', health: 280, speed: 146, accuracy: 0.8, reaction: 0.22, burst: 4, color: '#e8b04a', preferredRange: 220 },
};

export const ECONOMY = {
  startingCash: 500,
  missionBonusStep: 175,
  robberyMin: 24,
  robberyMax: 92,
  hospitalFee: 500,
  impoundFee: 500,
  killScore: 25,
  missionScore: 400,
};
