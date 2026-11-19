// Leonida Heat v3 - street pickups and hidden mixtapes.
// Health, armor, ammo and cash crates sit at real landmarks and return after
// a cooldown. Twelve mixtapes are hidden around Costa Sol; each one pings the
// HUD counter, and collecting the full album pays a city bonus.

import { COLLECTIBLE_CONFIG } from './config.js';

export const PICKUP_DEFS = {
  health: { color: '#66e39a', label: 'Health', amount: 45, cooldown: 42, icon: 'cross', radius: 36 },
  armor: { color: '#6fb7ff', label: 'Armor', amount: 50, cooldown: 42, icon: 'shield', radius: 36 },
  smg: { color: '#ffd166', label: 'Tide SMG ammo', amount: 2, cooldown: 62, icon: 'ammo', radius: 37 },
  shotgun: { color: '#ff9c6b', label: 'Shotgun shells', amount: 2, cooldown: 62, icon: 'ammo', radius: 37 },
  rifle: { color: '#ff7f9e', label: 'Rifle rounds', amount: 2, cooldown: 72, icon: 'ammo', radius: 37 },
  grenade: { color: '#b5e36b', label: 'Grenade', amount: 1, cooldown: 70, icon: 'grenade', radius: 35 },
  cash: { color: '#9bd46d', label: 'Cash drop', amount: 130, cooldown: 78, icon: 'cash', radius: 34 },
};

export class PickupManager {
  constructor(city) {
    this.city = city;
    this.pickups = [];
    this.seed();
  }

  seed() {
    const L = this.city.landmarks;
    this.add('health', L.hospital.x + 88, L.hospital.y + 78);
    this.add('health', L.diner.x - 88, L.diner.y + 64);
    this.add('health', L.plaza.x + 98, L.plaza.y - 68);
    this.add('health', L.boardwalk.x + 22, L.boardwalk.y + 40);
    this.add('health', L.garage.x + 82, L.garage.y + 70);
    this.add('armor', L.policeStation.x + 82, L.policeStation.y + 76);
    this.add('armor', L.docks.x - 106, L.docks.y + 72);
    this.add('armor', L.compound.x + 114, L.compound.y + 76);
    this.add('armor', L.safehouse.x - 90, L.safehouse.y + 60);
    this.add('smg', L.plaza.x - 84, L.plaza.y - 64);
    this.add('shotgun', L.docks.x + 98, L.docks.y + 82);
    this.add('rifle', L.compound.x - 120, L.compound.y + 80);
    this.add('smg', L.chopShop.x + 120, L.chopShop.y + 74);
    this.add('shotgun', L.chopShop.x - 110, L.chopShop.y - 40);
    this.add('grenade', L.garage.x - 92, L.garage.y - 48);
    this.add('grenade', L.docks.x + 20, L.docks.y - 96);
    this.add('cash', L.marina.x + 74, L.marina.y - 64);
    this.add('cash', L.boardwalk.x + 70, L.boardwalk.y - 260);
    this.add('cash', L.park.x + 40, L.park.y + 60);
    this.add('health', 2360, 1160);
    this.add('armor', 2360, 2160);
    this.add('smg', 1880, 2180);
    this.add('cash', 760, 600);
    this.add('rifle', 1400, 1650);
  }

  add(type, x, y) {
    const def = PICKUP_DEFS[type];
    if (!def) return null;
    const pickup = { type, x, y, active: true, cooldown: 0, def, bob: Math.random() * 6, age: 0 };
    this.pickups.push(pickup);
    return pickup;
  }

  remove(type, x, y) {
    this.pickups = this.pickups.filter((p) => !(p.type === type && Math.abs(p.x - x) < 4 && Math.abs(p.y - y) < 4));
  }

  update(dt, player, game) {
    for (const p of this.pickups) {
      p.bob += dt * 3;
      p.age += dt;
      if (!p.active) {
        p.cooldown -= dt;
        if (p.cooldown <= 0) p.active = true;
        continue;
      }
      if (player.health <= 0) continue;
      if (Math.hypot(player.x - p.x, player.y - p.y) > p.def.radius) continue;

      let consumed = false;
      if (p.type === 'health') {
        if (player.health >= player.maxHealth) continue;
        player.heal(p.def.amount);
        consumed = true;
      } else if (p.type === 'armor') {
        if (player.armor >= player.maxArmor) continue;
        player.addArmor(p.def.amount);
        consumed = true;
      } else if (p.type === 'cash') {
        player.money += p.def.amount;
        player.score += 10;
        game.audio.playCash();
        consumed = true;
      } else if (p.type === 'grenade') {
        if (player.grenades >= player.maxGrenades) continue;
        player.addGrenades(p.def.amount);
        consumed = true;
      } else {
        const mag = player.ammo[p.type];
        if (!mag) continue;
        const before = mag.reserve;
        player.giveWeapon(p.type, p.def.amount);
        if (mag.reserve === before && mag.clip >= 1) continue;
        consumed = true;
      }
      if (!consumed) continue;
      p.active = false;
      p.cooldown = p.def.cooldown;
      game.audio.playPickup();
      game.ui.showToast(`${p.def.label} picked up`, 'success', 1.8);
    }
  }

  nearest(player) {
    let best = null;
    let bestD = Infinity;
    for (const p of this.pickups) {
      if (!p.active) continue;
      const d = Math.hypot(p.x - player.x, p.y - player.y);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return best ? { pickup: best, distance: bestD } : null;
  }
}

export class CollectibleManager {
  constructor(city) {
    this.city = city;
    this.items = [];
    this.foundCount = 0;
    this.total = COLLECTIBLE_CONFIG.total;
    this.rewarded = false;
    this.seed();
  }

  seed() {
    const spots = this.city.collectibleSpots || [];
    this.items = [];
    for (let i = 0; i < Math.min(this.total, spots.length || this.total); i += 1) {
      const spot = spots[i] || { x: 2524 + i * 18, y: 1500, name: `Tape ${i + 1}` };
      this.items.push({
        id: `tape-${i + 1}`,
        index: i,
        x: spot.x,
        y: spot.y,
        name: spot.name || `Tape ${i + 1}`,
        found: false,
        bob: i * 0.7,
        color: COLLECTIBLE_CONFIG.colors[i % COLLECTIBLE_CONFIG.colors.length],
      });
    }
    this.foundCount = 0;
    this.rewarded = false;
  }

  restore(foundIds = [], rewarded = false) {
    const set = new Set((foundIds || []).map(String));
    for (const item of this.items) item.found = set.has(item.id);
    this.foundCount = this.items.filter((i) => i.found).length;
    this.rewarded = !!rewarded || this.foundCount >= this.total;
  }

  foundIds() {
    return this.items.filter((i) => i.found).map((i) => i.id);
  }

  update(dt, player, game) {
    for (const item of this.items) {
      if (item.found) continue;
      item.bob += dt * 2.4;
      if (Math.hypot(player.x - item.x, player.y - item.y) > COLLECTIBLE_CONFIG.radius) continue;
      item.found = true;
      this.foundCount += 1;
      player.money += 40;
      player.score += 25;
      game.audio.playPickup();
      game.ui.showToast(`Mixtape ${this.foundCount}/${this.total}: ${item.name}`, 'success', 2.6);
      game.showCollectibleRing?.(item);
      if (this.foundCount >= this.total && !this.rewarded) {
        this.rewarded = true;
        player.money += COLLECTIBLE_CONFIG.reward;
        player.score += COLLECTIBLE_CONFIG.score;
        game.onAllCollectibles?.(COLLECTIBLE_CONFIG.reward);
      }
      game.autosave?.();
    }
  }
}
