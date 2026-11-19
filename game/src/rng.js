// Leonida Heat v3 - deterministic randomness.
// One small, fast generator seeds the whole city, its traffic tables and the
// screenshot scenes. Nothing here touches Math.random, so ?seed=2026 rebuilds
// the same Costa Sol on every load and every frame of a staged capture.

export function mulberry32(seed) {
  let state = (seed >>> 0) || 0x9e3779b9;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A second, independent stream. Useful when two systems must not share a
// sequence (city art versus ambient traffic, for example).
export function splitmix32(seed) {
  let state = (seed >>> 0) || 0x85ebca6b;
  return function next() {
    state = (state + 0x9e3779b9) >>> 0;
    let z = state;
    z = Math.imul(z ^ (z >>> 16), 0x21f0aaad);
    z = Math.imul(z ^ (z >>> 15), 0x735a2d97);
    return ((z ^ (z >>> 15)) >>> 0) / 4294967296;
  };
}

export function pick(rng, list) {
  if (!list || list.length === 0) return undefined;
  return list[Math.min(list.length - 1, Math.floor(rng() * list.length))];
}

export function range(rng, min, max) {
  return min + rng() * (max - min);
}

export function rangeInt(rng, min, max) {
  return Math.floor(min + rng() * (max - min + 1));
}

export function chance(rng, probability) {
  return rng() < probability;
}

// A weighted pick from [{ value, weight }] or from parallel arrays.
export function weighted(rng, entries, weightOf = (e) => e.weight ?? 1) {
  let total = 0;
  for (const entry of entries) total += Math.max(0, weightOf(entry));
  if (total <= 0) return entries[0];
  let roll = rng() * total;
  for (const entry of entries) {
    roll -= Math.max(0, weightOf(entry));
    if (roll <= 0) return entry;
  }
  return entries[entries.length - 1];
}

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

export function gaussian(rng, mean = 0, deviation = 1) {
  const u = Math.max(1e-6, rng());
  const v = rng();
  return mean + deviation * Math.sqrt(-2 * Math.log(u)) * Math.cos(Math.PI * 2 * v);
}

// Deterministic hash for tiny art decisions that do not need a stream.
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

// Value noise for cloth, water and music parameter drift.
export function noise1(x, seed = 0) {
  const i = Math.floor(x);
  const f = x - i;
  const a = hash2(i, seed, 11);
  const b = hash2(i + 1, seed, 11);
  const t = f * f * (3 - 2 * f);
  return a + (b - a) * t;
}

export function noise2(x, y, seed = 0) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const tx = xf * xf * (3 - 2 * xf);
  const ty = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);
  const top = a + (b - a) * tx;
  const bottom = c + (d - c) * tx;
  return top + (bottom - top) * ty;
}
