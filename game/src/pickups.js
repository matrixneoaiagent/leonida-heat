// Leonida Heat - the pickups scattered around Costa Sol.
// Health, armor, weapon crates and cash markers. Pickups are placed at real
// landmarks and parking spots, bob on a sine, and return after a cooldown so
// the city stays playable after a long session.

export const PICKUP_DEFS = {
  health: { color: '#66e39a', label: 'Health', amount: 45, cooldown: 45, icon: 'cross', radius: 36 },
  armor: { color: '#6fb7ff', label: 'Armor', amount: 50, cooldown: 45, icon: 'shield', radius: 36 },
  smg: { color: '#ffd166', label: 'Tide SMG ammo', amount: 2, cooldown: 65, icon: 'ammo', radius: 37 },
  shotgun: { color: '#ff9c6b', label: 'Shotgun shells', amount: 2, cooldown: 65, icon: 'ammo', radius: 37 },
  rifle: { color: '#ff7f9e', label: 'Rifle rounds', amount: 2, cooldown: 75, icon: 'ammo', radius: 37 },
  cash: { color: '#9bd46d', label: 'Cash drop', amount: 120, cooldown: 80, icon: 'cash', radius: 34 },
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
    this.add('armor', L.policeStation.x + 82, L.policeStation.y + 76);
    this.add('armor', L.docks.x - 106, L.docks.y + 72);
    this.add('armor', L.compound.x + 114, L.compound.y + 76);
    this.add('armor', L.safehouse.x - 90, L.safehouse.y + 60);
    this.add('smg', L.plaza.x - 84, L.plaza.y - 64);
    this.add('shotgun', L.docks.x + 98, L.docks.y + 82);
    this.add('rifle', L.compound.x - 120, L.compound.y + 80);
    this.add('smg', L.chopShop.x + 120, L.chopShop.y + 74);
    this.add('shotgun', L.chopShop.x - 110, L.chopShop.y - 40);
    this.add('cash', L.marina.x + 74, L.marina.y - 64);
    this.add('cash', L.boardwalk.x + 70, L.boardwalk.y - 260);
    this.add('health', 2360, 1160);
    this.add('armor', 2360, 2160);
    this.add('smg', 1880, 2180);
    this.add('cash', 760, 600);
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
