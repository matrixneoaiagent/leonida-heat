// Leonida Heat - versioned local saves.
// v2 adds settings, story flags and weather; v1 saves are migrated in place
// so a player who started before the quality pass keeps their city.

import { SAVE_KEY, SAVE_VERSION } from './config.js';

const LEGACY_KEYS = ['leonida-heat-save-v1'];

function clampNumber(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

export function migrateSave(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const version = Number(raw.version) || 1;
  if (version > SAVE_VERSION) return null;
  const player = raw.player && typeof raw.player === 'object' ? raw.player : {};
  const missions = raw.missions && typeof raw.missions === 'object' ? raw.missions : {};
  const settings = raw.settings && typeof raw.settings === 'object' ? raw.settings : {};
  const migrated = {
    version: SAVE_VERSION,
    savedAt: Number(raw.savedAt) || Date.now(),
    seed: (Number(raw.seed) >>> 0) || 2026,
    timeOfDay: clampNumber(raw.timeOfDay, 0.46, 0, 1),
    wanted: clampNumber(raw.wanted, 0, 0, 5),
    player: {
      x: clampNumber(player.x, 2360, 20, 3180),
      y: clampNumber(player.y, 1190, 20, 3180),
      angle: clampNumber(player.angle, -Math.PI / 2, -Math.PI * 4, Math.PI * 4),
      health: clampNumber(player.health, 100, 1, 100),
      armor: clampNumber(player.armor, 0, 0, 100),
      money: clampNumber(player.money, 500, 0, 9_999_999),
      score: clampNumber(player.score, 0, 0, 9_999_999),
      weaponIndex: clampNumber(player.weaponIndex, 1, 0, 4),
      ammo: player.ammo && typeof player.ammo === 'object' ? player.ammo : {},
    },
    missions: {
      currentIndex: clampNumber(missions.currentIndex, 0, 0, 4),
      completedCount: clampNumber(missions.completedCount, 0, 0, 5),
      active: !!missions.active,
      stepIndex: clampNumber(missions.stepIndex, 0, 0, 12),
    },
    settings: {
      muted: !!(settings.muted ?? raw.muted),
      station: clampNumber(settings.station ?? raw.station, 0, 0, 3),
    },
    flags: raw.flags && typeof raw.flags === 'object' ? { ...raw.flags } : {},
    weather: raw.weather && typeof raw.weather === 'object' ? raw.weather : null,
  };
  return migrated;
}

export function saveGame(data) {
  try {
    const payload = migrateSave({ ...data, version: SAVE_VERSION, savedAt: Date.now() }) || data;
    payload.version = SAVE_VERSION;
    payload.savedAt = Date.now();
    localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
    for (const key of LEGACY_KEYS) localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export function loadGame() {
  try {
    let raw = localStorage.getItem(SAVE_KEY);
    if (!raw) {
      // One-time lift of an old v1 slot.
      for (const key of LEGACY_KEYS) {
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
    return LEGACY_KEYS.some((key) => !!localStorage.getItem(key));
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
  };
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
    for (const key of LEGACY_KEYS) localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}
