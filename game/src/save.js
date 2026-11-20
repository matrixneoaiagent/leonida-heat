// Leonida Heat v3 - versioned local saves.
// v3 adds the collectible album, the stunt log and the clock/weather block.
// v2 and v1 slots migrate in place so an old run keeps its city, money and
// story progress instead of silently vanishing.

import { SAVE_KEY, SAVE_VERSION, LEGACY_SAVE_KEYS, TIME_OF_DAY, ECONOMY } from './config.js';

function clampNumber(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function numberOr(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function ammoBlock(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const out = {};
  for (const id of ['pistol', 'smg', 'shotgun', 'rifle']) {
    const mag = source[id] && typeof source[id] === 'object' ? source[id] : {};
    out[id] = {
      clip: Math.max(0, Math.floor(numberOr(mag.clip, id === 'pistol' ? 15 : 0))),
      reserve: Math.max(0, Math.floor(numberOr(mag.reserve, id === 'pistol' ? 60 : 0))),
    };
  }
  return out;
}

export function migrateSave(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const version = Number(raw.version) || 1;
  if (version > SAVE_VERSION) return null;
  const player = raw.player && typeof raw.player === 'object' ? raw.player : {};
  const missions = raw.missions && typeof raw.missions === 'object' ? raw.missions : {};
  const settings = raw.settings && typeof raw.settings === 'object' ? raw.settings : {};
  const album = raw.collectibles && typeof raw.collectibles === 'object' ? raw.collectibles : {};
  const jobs = raw.jobs && typeof raw.jobs === 'object' ? raw.jobs : null;
  const races = raw.races && typeof raw.races === 'object' ? raw.races : null;
  const phone = raw.phone && typeof raw.phone === 'object' ? raw.phone : {};
  const found = Array.isArray(album.found)
    ? album.found.filter((id) => typeof id === 'string' || Number.isFinite(Number(id))).slice(0, 24)
    : [];
  return {
    version: SAVE_VERSION,
    savedAt: numberOr(raw.savedAt, Date.now()),
    seed: (Number(raw.seed) >>> 0) || 2026,
    timeOfDay: clampNumber(raw.timeOfDay, TIME_OF_DAY.start, 0, 1),
    wanted: clampNumber(raw.wanted, 0, 0, 5),
    weather: raw.weather && typeof raw.weather === 'object'
      ? {
        type: String(raw.weather.type || 'clear'),
        wetness: clampNumber(raw.weather.wetness, 0, 0, 1),
        timer: clampNumber(raw.weather.timer, 70, 1, 400),
      }
      : null,
    player: {
      x: clampNumber(player.x, 2360, 24, 3176),
      y: clampNumber(player.y, 1190, 24, 3176),
      angle: clampNumber(player.angle, 0, -Math.PI * 8, Math.PI * 8),
      health: clampNumber(player.health, 100, 1, 100),
      armor: clampNumber(player.armor, 20, 0, 100),
      money: clampNumber(player.money, ECONOMY.startingCash, 0, 9_999_999),
      score: clampNumber(player.score, 0, 0, 9_999_999),
      weaponIndex: clampNumber(player.weaponIndex, 1, 0, 4),
      grenades: clampNumber(player.grenades, 2, 0, 6),
      ammo: ammoBlock(player.ammo),
    },
    missions: {
      currentIndex: clampNumber(missions.currentIndex, 0, 0, 4),
      completedCount: clampNumber(missions.completedCount, 0, 0, 5),
      active: !!missions.active,
      stepIndex: clampNumber(missions.stepIndex, 0, 0, 12),
      checkpoint: clampNumber(missions.checkpoint, missions.stepIndex, 0, 12),
    },
    settings: {
      muted: !!(settings.muted ?? raw.muted),
      station: clampNumber(settings.station ?? raw.station, 0, 0, 3),
      zoom: clampNumber(settings.zoom ?? phone.zoom, 2, 0.8, 3.2),
    },
    jobs: jobs ? {
      completed: jobs.completed && typeof jobs.completed === 'object' ? { ...jobs.completed } : {},
      active: jobs.active && typeof jobs.active === 'object' ? { ...jobs.active } : null,
    } : null,
    races: races ? {
      completed: races.completed && typeof races.completed === 'object' ? { ...races.completed } : {},
      bestTimes: races.bestTimes && typeof races.bestTimes === 'object' ? { ...races.bestTimes } : {},
      active: races.active && typeof races.active === 'object' ? { ...races.active } : null,
    } : null,
    phone: {
      tab: clampNumber(phone.tab, 0, 0, 4),
      messagesRead: clampNumber(phone.messagesRead, 0, 0, 99),
      zoom: clampNumber(phone.zoom ?? settings.zoom, 2, 0.8, 3.2),
    },
    collectibles: {
      found,
      count: Math.max(found.length, clampNumber(album.count, found.length, 0, 12)),
      rewarded: !!album.rewarded,
    },
    stunts: {
      best: clampNumber(raw.stunts?.best, 0, 0, 999),
      count: clampNumber(raw.stunts?.count, 0, 0, 9999),
      cash: clampNumber(raw.stunts?.cash, 0, 0, 9_999_999),
    },
    stats: {
      kills: clampNumber(raw.stats?.kills, 0, 0, 999999),
      crimes: clampNumber(raw.stats?.crimes, 0, 0, 999999),
      jobs: clampNumber(raw.stats?.jobs, 0, 0, 99999),
      photos: clampNumber(raw.stats?.photos, 0, 0, 99999),
    },
    flags: raw.flags && typeof raw.flags === 'object' ? { ...raw.flags } : {},
  };
}

export function saveGame(data) {
  try {
    const payload = migrateSave({ ...data, version: SAVE_VERSION, savedAt: Date.now() });
    if (!payload) return false;
    payload.version = SAVE_VERSION;
    payload.savedAt = Date.now();
    localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
    for (const key of LEGACY_SAVE_KEYS) localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export function loadGame() {
  try {
    let raw = localStorage.getItem(SAVE_KEY);
    if (!raw) {
      for (const key of LEGACY_SAVE_KEYS) {
        raw = localStorage.getItem(key);
        if (raw) break;
      }
    }
    if (!raw) return null;
    return migrateSave(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function hasSave() {
  try {
    if (localStorage.getItem(SAVE_KEY)) return true;
    return LEGACY_SAVE_KEYS.some((key) => !!localStorage.getItem(key));
  } catch {
    return false;
  }
}

export function saveSummary() {
  const data = loadGame();
  if (!data) return null;
  return {
    savedAt: data.savedAt,
    money: data.player.money,
    missions: data.missions.completedCount,
    wanted: data.wanted,
    collectibles: data.collectibles.count,
    bestStunt: data.stunts.best,
  };
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
    for (const key of LEGACY_SAVE_KEYS) localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}
