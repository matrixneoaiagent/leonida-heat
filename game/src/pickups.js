// Leonida Heat - pickups. Small glowing pickups for health, armor and the
// heavier weapons, spread across the districts and respawning on a timer.

export const PICKUP_DEFS = {
  health: { color: '#66e39a', label: 'Health', amount: 40, cooldown: 50 },
  armor: { color: '#6fb7ff', label: 'Armor', amount: 50, cooldown: 50 },
  smg: { color: '#ffd166', label: 'Tide SMG ammo', amount: 2, cooldown: 70 },
  shotgun: { color: '#ff9c6b', label: 'Shotgun ammo', amount: 2, cooldown: 70 },
  rifle: { color: '#ff7f9e', label: 'Rifle ammo', amount: 2, cooldown: 80 },
};

export class PickupManager {
  constructor(city) {
    this.city = city;
    this.pickups = [];
    this.seed();
  }

  seed() {
    const L = this.city.landmarks;
    this.add('health', L.hospital.x + 86, L.hospital.y + 76);
    this.add('health', L.diner.x - 86, L.diner.y + 62);
    this.add('health', L.plaza.x + 96, L.plaza.y - 66);
    this.add('armor', L.policeStation.x + 80, L.policeStation.y + 74);
    this.add('armor', L.docks.x - 104, L.docks.y + 70);
    this.add('armor', L.compound.x + 112, L.compound.y + 74);
    this.add('smg', L.plaza.x - 82, L.plaza.y - 62);
    this.add('shotgun', L.docks.x + 96, L.docks.y + 80);
    this.add('rifle', L.compound.x - 118, L.compound.y + 78);
    this.add('smg', L.chopShop.x + 118, L.chopShop.y + 72);
    this.add('health', 2360, 1160);
    this.add('armor', 2360, 2160);
  }

  add(type, x, y) {
    const def = PICKUP_DEFS[type];
    if (!def) return;
    this.pickups.push({ type, x, y, active: true, cooldown: 0, def, bob: Math.random() * 6 });
  }

  update(dt, player, game) {
    for (const p of this.pickups) {
      p.bob += dt * 3;
      if (!p.active) {
        p.cooldown -= dt;
        if (p.cooldown <= 0) p.active = true;
        continue;
      }
      if (player.health <= 0) continue;
      if (Math.hypot(player.x - p.x, player.y - p.y) > 34) continue;
      if (p.type === 'health') {
        if (player.health >= player.maxHealth) continue;
        player.health = Math.min(player.maxHealth, player.health + p.def.amount);
      } else if (p.type === 'armor') {
        if (player.armor >= player.maxArmor) continue;
        player.armor = Math.min(player.maxArmor, player.armor + p.def.amount);
      } else {
        const before = player.ammo[p.type].reserve;
        player.giveWeapon(p.type, p.def.amount);
        if (player.ammo[p.type].reserve === before && player.ammo[p.type].clip >= 1) continue;
      }
      p.active = false;
      p.cooldown = p.def.cooldown;
      game.audio.playPickup();
      game.ui.showToast(`${p.def.label} picked up`, 'success', 1.8);
    }
  }
}
