/* LEONIDA HEAT 3D — deterministic seeded random helpers.
   LH.RNG(seed) returns the small helper surface used by world/traffic/missions. */
(function () {
  'use strict';

  window.LH = window.LH || {};

  function hashSeed(seed) {
    var str = String(seed == null ? 1 : seed);
    var h = 1779033703 ^ str.length;
    for (var i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return function () {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      h ^= h >>> 16;
      return h >>> 0;
    };
  }

  function mulberry32(state) {
    return function () {
      state |= 0;
      state = (state + 0x6d2b79f5) | 0;
      var t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /**
   * Seeded RNG. Accepts numbers or strings; every call returns a fresh stream
   * so two systems sharing a seed cannot accidentally consume each other.
   */
  LH.RNG = function RNG(seed) {
    var nextSeed = hashSeed(seed);
    var state = nextSeed();
    var rnd = mulberry32(state);
    var calls = 0;

    var api = {
      seed: seed == null ? 1 : seed,

      next: function () {
        calls++;
        return rnd();
      },

      range: function (a, b) {
        if (a === undefined) return api.next();
        if (b === undefined) { b = a; a = 0; }
        return a + (b - a) * api.next();
      },

      int: function (a, b) {
        if (b === undefined) { b = a; a = 0; }
        var lo = Math.ceil(Math.min(a, b));
        var hi = Math.floor(Math.max(a, b));
        return lo + Math.floor(api.next() * (hi - lo + 1));
      },

      pick: function (arr) {
        if (!arr || !arr.length) return undefined;
        return arr[Math.floor(api.next() * arr.length)];
      },

      chance: function (p) {
        return api.next() < (p == null ? 0.5 : p);
      },

      shuffle: function (arr) {
        if (!arr || arr.length < 2) return arr ? arr.slice() : [];
        var out = arr.slice();
        for (var i = out.length - 1; i > 0; i--) {
          var j = Math.floor(api.next() * (i + 1));
          var tmp = out[i];
          out[i] = out[j];
          out[j] = tmp;
        }
        return out;
      },

      sign: function () {
        return api.next() < 0.5 ? -1 : 1;
      },

      bool: function (p) {
        return api.chance(p);
      },

      weighted: function (items, weightOf) {
        if (!items || !items.length) return undefined;
        var total = 0;
        var weights = new Array(items.length);
        for (var i = 0; i < items.length; i++) {
          var w = weightOf ? weightOf(items[i], i) : (items[i] && items[i].weight) || 1;
          w = Math.max(0, Number(w) || 0);
          weights[i] = w;
          total += w;
        }
        if (total <= 0) return api.pick(items);
        var roll = api.next() * total;
        for (var j = 0; j < items.length; j++) {
          roll -= weights[j];
          if (roll <= 0) return items[j];
        }
        return items[items.length - 1];
      },

      gaussian: function (mean, deviation) {
        var u = 0;
        var v = 0;
        while (u === 0) u = api.next();
        while (v === 0) v = api.next();
        var n = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
        return (mean || 0) + n * (deviation == null ? 1 : deviation);
      },

      fork: function (label) {
        return LH.RNG(String(api.seed) + ':' + (label || calls) + ':' + calls);
      },

      calls: function () {
        return calls;
      },

      state: function () {
        return state >>> 0;
      }
    };

    return api;
  };

  /** Shared cosmetic randomness. Gameplay systems should keep their own streams. */
  LH.cosmeticRng = LH.RNG('leonida-cosmetic');
}());
