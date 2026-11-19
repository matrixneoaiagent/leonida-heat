// Leonida Heat - deterministic randomness.
// The city, its traffic tables and the screenshot scenes all run from this
// little generator, so ?seed=2026 builds the same Costa Sol every load.

export function mulberry32(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Pick a member of a list with a supplied random source.
export function pick(rng, list) {
  if (!list || list.length === 0) return undefined;
  const index = Math.min(list.length - 1, Math.floor(rng() * list.length));
  return list[index];
}

export function range(rng, min, max) {
  return min + rng() * (max - min);
}

export function chance(rng, probability) {
  return rng() < probability;
}

// In-place Fisher-Yates using the supplied source.
export function shuffle(rng, list) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

// Roughly normal, useful for spawn jitter and camera wobble.
export function gaussian(rng, mean = 0, deviation = 1) {
  const u = Math.max(1e-6, rng());
  const v = rng();
  return mean + deviation * Math.sqrt(-2 * Math.log(u)) * Math.cos(Math.PI * 2 * v);
}

// Deterministic hash for tiny art decisions that need no stream.
export function hash2(x, y, salt = 0) {
  let h = Math.imul((x | 0) ^ 0x9e3779b9, 0x85ebca6b);
  h ^= Math.imul((y | 0) + 0x7f4a7c15, 0xc2b2ae35);
  h ^= Math.imul((salt | 0) + 0x165667b1, 0x27d4eb2f);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

// FNV-1a over a string, for seeds typed by a human.
export function seedFrom(text) {
  let h = 2166136261;
  const str = String(text);
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// A tiny 1D value-noise function for cloth, water and music parameter drift.
export function noise1(x, seed = 0) {
  const i = Math.floor(x);
  const f = x - i;
  const a = hash2(i, seed, 11);
  const b = hash2(i + 1, seed, 11);
  const t = f * f * (3 - 2 * f);
  return a + (b - a) * t;
}
