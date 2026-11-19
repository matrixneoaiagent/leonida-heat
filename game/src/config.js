// Leonida Heat - game configuration and authored data.
// The city, cast, vehicles, districts and radio stations below are original
// inventions for this game. Everything is plain data so the systems stay small.

export const GAME_TITLE = 'Leonida Heat';
export const GAME_SUBTITLE = 'A Costa Sol Crime Story';
export const SAVE_KEY = 'leonida-heat-save-v1';
export const STEP = 1 / 60;

export const MAP_CONFIG = {
  width: 3200,
  height: 3200,
  gridSize: 100,
};

// ---------------------------------------------------------------
// Districts (drawn and announced as the player moves through them)
// ---------------------------------------------------------------
export const DISTRICTS = [
  {
    id: 'coral_strip',
    name: 'Coral Strip',
    sub: 'Beachfront & Neon Boardwalk',
    bounds: { minX: 2320, minY: 0, maxX: 3200, maxY: 3200 },
    ambient: '#ffe8d8',
    neon: '#ff6f91',
    lot: '#e9cfa8',
  },
  {
    id: 'vantage',
    name: 'Vantage Heights',
    sub: 'Towers & Financial Plazas',
    bounds: { minX: 1100, minY: 600, maxX: 2320, maxY: 2150 },
    ambient: '#e3f4ff',
    neon: '#5ce1e6',
    lot: '#c9c2b2',
  },
  {
    id: 'palmetto',
    name: 'Palmetto Gardens',
    sub: 'Estates & Manicured Lawns',
    bounds: { minX: 0, minY: 0, maxX: 1100, maxY: 1500 },
    ambient: '#eefbe9',
    neon: '#8fe3a5',
    lot: '#93b47f',
  },
  {
    id: 'drydock',
    name: 'Drydock Quarter',
    sub: 'Piers & Cargo Terminals',
    bounds: { minX: 1800, minY: 2100, maxX: 3200, maxY: 3200 },
    ambient: '#e7f0fb',
    neon: '#59a9ff',
    lot: '#b3aa9b',
  },
  {
    id: 'ironworks',
    name: 'Ironworks',
    sub: 'Warehouses & Chop Shops',
    bounds: { minX: 0, minY: 1500, maxX: 1100, maxY: 3200 },
    ambient: '#fbf1e1',
    neon: '#ffb45c',
    lot: '#b8a48d',
  },
  {
    id: 'market_row',
    name: 'Market Row',
    sub: 'Low Rises & Late Diners',
    bounds: { minX: 1100, minY: 2150, maxX: 1900, maxY: 3200 },
    ambient: '#fff1e6',
    neon: '#ffcf5c',
    lot: '#c6b49d',
  },
];

export function districtAt(x, y) {
  for (const d of DISTRICTS) {
    const b = d.bounds;
    if (x >= b.minX && x < b.maxX && y >= b.minY && y < b.maxY) return d;
  }
  return DISTRICTS[1];
}

// ---------------------------------------------------------------
// Vehicles. Speeds are world pixels per second. A car is ~56 px long,
// so at the usual camera zoom it reads at roughly 90-120 px on screen.
// ---------------------------------------------------------------
export const VEHICLE_TYPES = {
  marlin: {
    id: 'marlin',
    name: 'Marlin GT',
    klass: 'sports',
    width: 30,
    length: 58,
    topSpeed: 530,
    reverseSpeed: 190,
    accel: 390,
    brake: 4.6,
    turnSpeed: 3.1,
    grip: 5.2,
    driftGrip: 1.5,
    mass: 1180,
    maxHp: 130,
    colors: ['#ff5f7e', '#39d8d0', '#ffd23f', '#f4f1e8', '#ff7a3c'],
    stripe: true,
    engineNote: 1.25,
  },
  vipera: {
    id: 'vipera',
    name: 'Vipera',
    klass: 'muscle',
    width: 32,
    length: 60,
    topSpeed: 490,
    reverseSpeed: 180,
    accel: 420,
    brake: 4.2,
    turnSpeed: 2.7,
    grip: 4.4,
    driftGrip: 1.15,
    mass: 1460,
    maxHp: 150,
    colors: ['#2f6bff', '#b4233a', '#22222b', '#6d3fa8'],
    stripe: true,
    engineNote: 0.95,
  },
  meridian: {
    id: 'meridian',
    name: 'Meridian Sedan',
    klass: 'sedan',
    width: 31,
    length: 56,
    topSpeed: 390,
    reverseSpeed: 150,
    accel: 300,
    brake: 4.8,
    turnSpeed: 2.8,
    grip: 5.6,
    driftGrip: 2.0,
    mass: 1360,
    maxHp: 120,
    colors: ['#6f8ea3', '#3c4b57', '#9b7a63', '#4c5f6a', '#c8cdd2'],
    stripe: false,
    engineNote: 0.8,
  },
  patrol: {
    id: 'patrol',
    name: 'Patrol Cruiser',
    klass: 'police',
    width: 32,
    length: 60,
    topSpeed: 470,
    reverseSpeed: 170,
    accel: 390,
    brake: 5.0,
    turnSpeed: 3.0,
    grip: 5.0,
    driftGrip: 1.6,
    mass: 1620,
    maxHp: 190,
    isPolice: true,
    colors: ['#f2f4f6'],
    stripe: false,
    engineNote: 0.9,
  },
  hauler: {
    id: 'hauler',
    name: 'Dock Hauler',
    klass: 'van',
    width: 34,
    length: 66,
    topSpeed: 310,
    reverseSpeed: 130,
    accel: 230,
    brake: 3.5,
    turnSpeed: 2.1,
    grip: 5.8,
    driftGrip: 2.6,
    mass: 2400,
    maxHp: 260,
    colors: ['#d5d9dd', '#aeb6bc', '#8e99a1', '#c46b2f'],
    stripe: false,
    engineNote: 0.65,
  },
  wasp: {
    id: 'wasp',
    name: 'Wasp Bike',
    klass: 'bike',
    width: 15,
    length: 38,
    topSpeed: 520,
    reverseSpeed: 90,
    accel: 470,
    brake: 5.4,
    turnSpeed: 3.6,
    grip: 4.8,
    driftGrip: 1.0,
    mass: 390,
    maxHp: 75,
    colors: ['#ff3e57', '#24d98a', '#ffbf3f', '#8f4cff'],
    stripe: false,
    engineNote: 1.45,
  },
};

export const VEHICLE_IDS = Object.keys(VEHICLE_TYPES);
export const CIVILIAN_VEHICLES = ['marlin', 'vipera', 'meridian', 'meridian', 'meridian', 'hauler', 'wasp'];

// ---------------------------------------------------------------
// Weapons
// ---------------------------------------------------------------
export const WEAPON_CONFIG = {
  fists: {
    id: 'fists',
    name: 'Fists',
    damage: 18,
    range: 50,
    fireRate: 0.34,
    clipSize: Infinity,
    maxReserve: Infinity,
    spread: 0,
    speed: 0,
    recoil: 0,
    sound: 'punch',
    tint: '#e8c39a',
  },
  pistol: {
    id: 'pistol',
    name: '9mm Sidearm',
    damage: 26,
    range: 470,
    fireRate: 0.24,
    reloadTime: 1.15,
    clipSize: 15,
    maxReserve: 120,
    spread: 0.035,
    speed: 1150,
    recoil: 2,
    sound: 'pistol',
    tint: '#cfd6dd',
  },
  smg: {
    id: 'smg',
    name: 'Tide SMG',
    damage: 19,
    range: 430,
    fireRate: 0.09,
    reloadTime: 1.45,
    clipSize: 30,
    maxReserve: 210,
    spread: 0.105,
    speed: 1250,
    recoil: 1.5,
    sound: 'smg',
    tint: '#b7c0c9',
  },
  shotgun: {
    id: 'shotgun',
    name: 'Breakwater Shotgun',
    damage: 16,
    pellets: 6,
    range: 340,
    fireRate: 0.8,
    reloadTime: 1.9,
    clipSize: 8,
    maxReserve: 48,
    spread: 0.2,
    speed: 1000,
    recoil: 5,
    sound: 'shotgun',
    tint: '#d8b98f',
  },
  rifle: {
    id: 'rifle',
    name: 'Ranger Rifle',
    damage: 34,
    range: 580,
    fireRate: 0.12,
    reloadTime: 1.6,
    clipSize: 30,
    maxReserve: 180,
    spread: 0.045,
    speed: 1400,
    recoil: 2.4,
    sound: 'rifle',
    tint: '#9ca7b0',
  },
};

export const WEAPON_ORDER = ['fists', 'pistol', 'smg', 'shotgun', 'rifle'];

// ---------------------------------------------------------------
// Wanted levels
// ---------------------------------------------------------------
export const WANTED_CONFIG = {
  levels: [
    { stars: 0, maxCops: 0, maxFoot: 0, aggressive: false, dispatchInterval: 0, enforcersFire: false },
    { stars: 1, maxCops: 1, maxFoot: 2, aggressive: false, dispatchInterval: 9, enforcersFire: false },
    { stars: 2, maxCops: 3, maxFoot: 3, aggressive: true, dispatchInterval: 7, enforcersFire: true },
    { stars: 3, maxCops: 4, maxFoot: 4, aggressive: true, dispatchInterval: 6, enforcersFire: true, roadblocks: true },
    { stars: 4, maxCops: 6, maxFoot: 5, aggressive: true, dispatchInterval: 4.5, enforcersFire: true, roadblocks: true },
    { stars: 5, maxCops: 8, maxFoot: 7, aggressive: true, dispatchInterval: 3.2, enforcersFire: true, roadblocks: true, manhunt: true },
  ],
  cooldownTime: 15, // seconds out of sight before the heat drops a star
  perStarDecay: 9,
  bustedFine: 500,
  wastedFee: 500,
};

export const PHYSICS_CONFIG = {
  playerWalkSpeed: 205,
  playerSprintSpeed: 345,
  playerRollSpeed: 430,
  playerRollDuration: 0.42,
  playerRadius: 15,
  carFriction: 0.55,
  skidDecay: 26,
};

// ---------------------------------------------------------------
// Palette
// ---------------------------------------------------------------
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
  sand: '#efd3a0',
  waterDeep: '#1f6d83',
  waterShallow: '#49b6bd',
  foam: '#d8f5f2',
  gold: '#ffd166',
  pink: '#ff6f91',
  cyan: '#58e0e8',
  uiPanel: 'rgba(20, 17, 28, 0.82)',
};

export const RADIO_STATIONS = [
  { id: 'sunset', name: 'SUNSET STATIC 98.4', genre: 'Neon Synthwave', bpm: 112 },
  { id: 'coral', name: 'CORAL BASS RADIO', genre: 'Coastal Trap', bpm: 136 },
  { id: 'tidepool', name: 'TIDEPOOL LOUNGE', genre: 'Late Beach Chords', bpm: 80 },
  { id: 'off', name: 'RADIO OFF', genre: '—', bpm: 0 },
];

export const TIME_OF_DAY = {
  // Warm late afternoon, drifting slowly into a violet dusk.
  start: 0.46,
  cycleSeconds: 420,
};
