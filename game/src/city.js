// Leonida Heat - Costa Sol city generation.
// 3200 x 3200 of beach, boulevards, towers, estates, docks and warehouses.
// This module owns the map, the static collision grid, road lookups,
// traffic-light state, parking bays and the skid-mark decal list.

import { MAP_CONFIG, DISTRICTS, districtAt } from './config.js';
import { mulberry32, pick, range } from './rng.js';

const X_ROADS = [400, 800, 1200, 1600, 2000, 2400];
const Y_ROADS = [350, 700, 1050, 1400, 1800, 2200, 2600, 2950];
const BLOCK_MARGIN = 22;

export class CityWorld {
  constructor(seed = 7) {
    this.seed = seed >>> 0;
    this.rng = mulberry32(this.seed || 1);
    this.width = MAP_CONFIG.width;
    this.height = MAP_CONFIG.height;
    this.cellSize = MAP_CONFIG.gridSize;
    this.cols = Math.ceil(this.width / this.cellSize);
    this.rows = Math.ceil(this.height / this.cellSize);

    this.roads = [];
    this.intersections = [];
    this.trafficLights = [];
    this.waterZones = [];
    this.beaches = [];
    this.buildings = [];
    this.blocks = [];
    this.props = [];
    this.palmTrees = [];
    this.streetlights = [];
    this.piers = [];
    this.parkingSpots = [];
    this.sandSpecks = [];
    this.roadPatches = [];
    this.roadCracks = [];
    this.foamDots = [];
    this.skidMarks = [];
    this.billboards = [];

    this.landmarks = {
      diner: { x: 2560, y: 1110, name: 'The Pelican Grill', contact: 'Maya' },
      valet: { x: 2560, y: 900, name: 'Coral Valet', contact: 'Maya' },
      chopShop: { x: 350, y: 2450, name: 'Rustline Chop Shop' },
      plaza: { x: 1750, y: 1450, name: 'Vantage Plaza' },
      safehouse: { x: 1330, y: 1310, name: 'Sabal Safehouse' },
      docks: { x: 2250, y: 2500, name: 'Pier 9 Warehouse' },
      compound: { x: 2560, y: 470, name: 'Crowe Estate' },
      hospital: { x: 1350, y: 1750, name: 'Costa Sol General' },
      policeStation: { x: 1650, y: 950, name: 'Costa Sol Police HQ' },
      boardwalk: { x: 2620, y: 1800, name: 'Coral Boardwalk' },
    };

    this.grid = new Array(this.cols * this.rows).fill(null).map(() => []);

    this.generate();
  }

  // -----------------------------------------------------------------
  // Spatial hash
  // -----------------------------------------------------------------
  getCellIndex(x, y) {
    const col = Math.max(0, Math.min(this.cols - 1, Math.floor(x / this.cellSize)));
    const row = Math.max(0, Math.min(this.rows - 1, Math.floor(y / this.cellSize)));
    return row * this.cols + col;
  }

  insertCollider(item) {
    const minCol = Math.max(0, Math.floor((item.x - item.w / 2) / this.cellSize));
    const maxCol = Math.min(this.cols - 1, Math.floor((item.x + item.w / 2) / this.cellSize));
    const minRow = Math.max(0, Math.floor((item.y - item.h / 2) / this.cellSize));
    const maxRow = Math.min(this.rows - 1, Math.floor((item.y + item.h / 2) / this.cellSize));
    for (let r = minRow; r <= maxRow; r += 1) {
      for (let c = minCol; c <= maxCol; c += 1) {
        this.grid[r * this.cols + c].push(item);
      }
    }
  }

  getColliders(x, y, radius) {
    const minCol = Math.max(0, Math.floor((x - radius) / this.cellSize));
    const maxCol = Math.min(this.cols - 1, Math.floor((x + radius) / this.cellSize));
    const minRow = Math.max(0, Math.floor((y - radius) / this.cellSize));
    const maxRow = Math.min(this.rows - 1, Math.floor((y + radius) / this.cellSize));
    const results = [];
    const seen = new Set();
    for (let r = minRow; r <= maxRow; r += 1) {
      for (let c = minCol; c <= maxCol; c += 1) {
        const cell = this.grid[r * this.cols + c];
        for (let i = 0; i < cell.length; i += 1) {
          const item = cell[i];
          if (!seen.has(item)) {
            seen.add(item);
            results.push(item);
          }
        }
      }
    }
    return results;
  }

  // -----------------------------------------------------------------
  // Generation
  // -----------------------------------------------------------------
  generate() {
    this.generateWaterAndBeaches();
    this.generateRoadNetwork();
    this.generateRoadDecoration();
    this.generateBlocks();
    this.generateBuildings();
    this.addLandmarkBuildings();
    this.generateFoliageAndProps();
    this.generateParkingSpots();
    this.generateSandSpecks();
    this.buildSpatialGrid();
  }

  generateWaterAndBeaches() {
    // The ocean fills the east edge; the sand runs from the boardwalk to the surf.
    this.waterZones.push({ x: 2960, y: 1600, w: 480, h: 3200, type: 'ocean' });
    this.beaches.push({ x: 2590, y: 1600, w: 260, h: 3200 });
    this.boardwalk = { x: 2470, y: 0, w: 60, h: 3200 };

    this.piers.push(
      { x: 2840, y: 730, w: 300, h: 42, name: 'Pelican Pier' },
      { x: 2840, y: 1660, w: 340, h: 46, name: 'Coral Boardwalk Pier' },
      { x: 2840, y: 2380, w: 260, h: 40, name: 'Drydock Pier' }
    );
  }

  generateRoadNetwork() {
    const major = [
      { x1: 2400, y1: 0, x2: 2400, y2: 3200, width: 92, lanes: 4, name: 'Ocean Boulevard' },
      { x1: 0, y1: 1400, x2: 2400, y2: 1400, width: 96, lanes: 4, name: 'Grand Avenue' },
      { x1: 1200, y1: 0, x2: 1200, y2: 3200, width: 88, lanes: 4, name: 'Meridian Expressway' },
      { x1: 1000, y1: 2200, x2: 2700, y2: 2200, width: 84, lanes: 4, name: 'Drydock Parkway' },
      { x1: 0, y1: 700, x2: 2400, y2: 700, width: 84, lanes: 4, name: 'Palmetto Way' },
    ];
    const minor = [
      { x1: 400, y1: 0, x2: 400, y2: 3200, width: 62, lanes: 2, name: 'Foundry Row' },
      { x1: 800, y1: 0, x2: 800, y2: 3200, width: 62, lanes: 2, name: 'Sabal Avenue' },
      { x1: 1600, y1: 0, x2: 1600, y2: 3200, width: 66, lanes: 2, name: 'Tarpon Street' },
      { x1: 2000, y1: 0, x2: 2000, y2: 3200, width: 66, lanes: 2, name: 'Quay Road' },
      { x1: 0, y1: 350, x2: 2400, y2: 350, width: 58, lanes: 2, name: 'Garden Loop' },
      { x1: 0, y1: 1050, x2: 2400, y2: 1050, width: 60, lanes: 2, name: 'Vantage Plaza' },
      { x1: 0, y1: 1800, x2: 2400, y2: 1800, width: 62, lanes: 2, name: 'Market Row' },
      { x1: 0, y1: 2600, x2: 2000, y2: 2600, width: 62, lanes: 2, name: 'Terminal Way' },
      { x1: 0, y1: 2950, x2: 2000, y2: 2950, width: 58, lanes: 2, name: 'Tidewater Road' },
    ];

    this.roads = [...major, ...minor].map((r) => ({
      ...r,
      horizontal: r.y1 === r.y2,
      dirX: Math.sign(r.x2 - r.x1),
      dirY: Math.sign(r.y2 - r.y1),
    }));

    const hRoads = this.roads.filter((r) => r.horizontal);
    const vRoads = this.roads.filter((r) => !r.horizontal);

    hRoads.forEach((hr) => {
      vRoads.forEach((vr) => {
        if (vr.x1 === vr.x2 && hr.y1 === hr.y2) {
          const inX = vr.x1 >= Math.min(hr.x1, hr.x2) && vr.x1 <= Math.max(hr.x1, hr.x2);
          const inY = hr.y1 >= Math.min(vr.y1, vr.y2) && hr.y1 <= Math.max(vr.y1, vr.y2);
          if (inX && inY) {
            const size = Math.max(hr.width, vr.width);
            const index = this.intersections.length;
            const light = {
              x: vr.x1 + vr.width / 2 + 16,
              y: hr.y1 - hr.width / 2 - 16,
              state: index % 3 === 0 ? 'red' : 'green',
              timer: (index % 7) * 0.83 + this.rng() * 0.9,
              greenFor: 4.6 + (index % 4) * 0.35,
              redFor: 4.8 + (index % 5) * 0.3,
              x0: vr.x1,
              y0: hr.y1,
            };
            this.intersections.push({
              x: vr.x1,
              y: hr.y1,
              size,
              hWidth: hr.width,
              vWidth: vr.width,
              horizontalName: hr.name,
              verticalName: vr.name,
              light,
            });
            this.trafficLights.push(light);
          }
        }
      });
    });
  }

  generateRoadDecoration() {
    for (const road of this.roads) {
      const len = Math.hypot(road.x2 - road.x1, road.y2 - road.y1);
      const count = Math.max(3, Math.floor(len / 260));
      for (let i = 0; i < count; i += 1) {
        const t = range(this.rng, 0.03, 0.97);
        const x = road.x1 + (road.x2 - road.x1) * t;
        const y = road.y1 + (road.y2 - road.y1) * t;
        if (this.nearIntersection(x, y, 90)) continue;
        const along = range(this.rng, 22, 86);
        const across = range(this.rng, 5, 18);
        this.roadPatches.push({
          x, y,
          w: road.horizontal ? along : across,
          h: road.horizontal ? across : along,
          angle: range(this.rng, -0.06, 0.06),
          light: this.rng() > 0.55,
          alpha: range(this.rng, 0.12, 0.28),
        });
      }
      const crackCount = Math.max(2, Math.floor(len / 520));
      for (let i = 0; i < crackCount; i += 1) {
        const t = range(this.rng, 0.05, 0.95);
        const x = road.x1 + (road.x2 - road.x1) * t;
        const y = road.y1 + (road.y2 - road.y1) * t;
        if (this.nearIntersection(x, y, 90)) continue;
        const points = [];
        let px = x;
        let py = y;
        const steps = 4 + Math.floor(this.rng() * 4);
        for (let s = 0; s < steps; s += 1) {
          points.push({ x: px, y: py });
          if (road.horizontal) {
            px += range(this.rng, -8, 8);
            py += range(this.rng, 8, 20) * (this.rng() > 0.5 ? 1 : -1);
          } else {
            px += range(this.rng, 8, 20) * (this.rng() > 0.5 ? 1 : -1);
            py += range(this.rng, -8, 8);
          }
        }
        this.roadCracks.push({ points, alpha: range(this.rng, 0.12, 0.24) });
      }
    }
  }

  generateBlocks() {
    const xs = [0, ...X_ROADS];
    const ys = [0, ...Y_ROADS, 3200];
    for (let xi = 0; xi < xs.length - 1; xi += 1) {
      for (let yi = 0; yi < ys.length - 1; yi += 1) {
        const xMin = xi === 0 ? xs[xi] : xs[xi] - 0;
        const xMax = xs[xi + 1];
        const yMin = ys[yi];
        const yMax = ys[yi + 1];
        const midX = (xMin + xMax) / 2;
        const midY = (yMin + yMax) / 2;
        if (xMin >= 2400) continue;
        const district = districtAt(midX, midY);
        this.blocks.push({
          x: (xMin + xMax) / 2,
          y: (yMin + yMax) / 2,
          xMin,
          xMax,
          yMin,
          yMax,
          w: xMax - xMin,
          h: yMax - yMin,
          district: district.id,
          lot: district.lot,
          kind: this.pickBlockKind(district.id, midX, midY),
        });
      }
    }
  }

  pickBlockKind(districtId, x, y) {
    const roll = this.rng();
    if (districtId === 'palmetto') return roll < 0.16 ? 'park' : 'estate';
    if (districtId === 'vantage') return roll < 0.1 ? 'plaza' : roll < 0.18 ? 'parking' : 'tower';
    if (districtId === 'ironworks') return roll < 0.2 ? 'parking' : 'industry';
    if (districtId === 'drydock') return roll < 0.18 ? 'parking' : 'containers';
    if (districtId === 'market_row') return roll < 0.2 ? 'park' : roll < 0.32 ? 'parking' : 'lowrise';
    if (districtId === 'coral_strip') return 'beach';
    return 'lowrise';
  }

  generateBuildings() {
    for (const block of this.blocks) {
      const xMin = block.xMin + 40;
      const xMax = block.xMax - 40;
      const yMin = block.yMin + 34;
      const yMax = block.yMax - 34;
      if (xMax - xMin < 50 || yMax - yMin < 50) continue;

      if (block.kind === 'park' || block.kind === 'parking' || block.kind === 'plaza') {
        block.open = true;
        continue;
      }

      if (block.kind === 'estate') {
        this.generateEstates(block, xMin, xMax, yMin, yMax);
      } else if (block.kind === 'tower') {
        this.generateTowers(block, xMin, xMax, yMin, yMax);
      } else if (block.kind === 'industry') {
        this.generateWarehouses(block, xMin, xMax, yMin, yMax);
      } else if (block.kind === 'containers') {
        this.generateContainers(block, xMin, xMax, yMin, yMax);
      } else {
        this.generateLowRises(block, xMin, xMax, yMin, yMax);
      }
    }
  }

  generateEstates(block, xMin, xMax, yMin, yMax) {
    const houseW = 78;
    const houseH = 68;
    for (let x = xMin + 8; x < xMax - houseW + 8; x += houseW + 52) {
      for (let y = yMin + 8; y < yMax - houseH + 8; y += houseH + 48) {
        if (this.rng() < 0.16) continue;
        const pastel = pick(this.rng, ['#f3ead9', '#f7d9cf', '#e7efe1', '#f6e7bd', '#e4dcef']);
        this.buildings.push({
          x: x + houseW / 2,
          y: y + houseH / 2,
          w: houseW,
          h: houseH,
          height: 16 + this.rng() * 8,
          color: pastel,
          roofColor: pick(this.rng, ['#c8664b', '#b95b48', '#d17a54', '#8f6b58']),
          type: 'house',
          hasPool: this.rng() > 0.55,
          windows: 2,
        });
      }
    }
    this.addBlockTrees(block);
  }

  generateTowers(block, xMin, xMax, yMin, yMax) {
    const bW = 112;
    const bH = 112;
    const neonBrands = ['MERIDIAN', 'SOLARIS', 'PELICAN AIR', 'CORAL BANK', 'TIDEWATER', 'MIRAGE'];
    let idx = 0;
    for (let x = xMin + 6; x < xMax - bW + 10; x += bW + 34) {
      for (let y = yMin + 6; y < yMax - bH + 10; y += bH + 34) {
        if (this.rng() < 0.12) continue;
        const height = 46 + Math.floor(this.rng() * 58);
        const material = this.rng();
        const glass = material < 0.45;
        const stone = material >= 0.45 && material < 0.75;
        const color = glass ? '#3b6476' : stone ? '#a89a86' : '#4a4652';
        const roofColor = glass ? '#2c4c5c' : stone ? '#8e8271' : '#37343f';
        this.buildings.push({
          x: x + bW / 2,
          y: y + bH / 2,
          w: bW,
          h: bH,
          height,
          color,
          roofColor,
          type: 'tower',
          glass,
          stone,
          neonText: this.rng() > 0.35 ? neonBrands[idx++ % neonBrands.length] : null,
          neonColor: this.rng() > 0.5 ? '#5ce1e6' : '#ff7fa5',
          hasHelipad: height > 82,
          hasRoofPool: stone && this.rng() > 0.7,
          windows: 6,
        });
      }
    }
  }

  generateWarehouses(block, xMin, xMax, yMin, yMax) {
    const w = xMax - xMin - 12;
    const h = Math.min(150, (yMax - yMin) / 2 - 12);
    for (let y = yMin + 8; y < yMax - h + 12; y += h + 40) {
      this.buildings.push({
        x: xMin + w / 2 + 6,
        y: y + h / 2,
        w: Math.max(90, w),
        h: Math.max(70, h),
        height: 22 + this.rng() * 8,
        color: pick(this.rng, ['#6d6a62', '#7b817f', '#82705e', '#606a6d']),
        roofColor: pick(this.rng, ['#4e4c46', '#555b59', '#66584b']),
        type: 'warehouse',
        stripeRoof: this.rng() > 0.5,
        windows: 3,
      });
    }
  }

  generateContainers(block, xMin, xMax, yMin, yMax) {
    const colors = ['#c94f43', '#3f7fa8', '#d99a35', '#4d8f68', '#8a5a9e', '#b9693f'];
    for (let x = xMin + 10; x < xMax - 52; x += 58) {
      for (let y = yMin + 10; y < yMax - 34; y += 42) {
        if (this.rng() < 0.3) continue;
        this.buildings.push({
          x: x + 22,
          y: y + 13,
          w: 46,
          h: 26,
          height: 12 + (this.rng() > 0.55 ? 12 : 0),
          color: pick(this.rng, colors),
          roofColor: '#343a40',
          type: 'container',
        });
      }
    }
  }

  generateLowRises(block, xMin, xMax, yMin, yMax) {
    const shades = ['#d6c3a7', '#c9a98f', '#bd8d78', '#d9cbb6', '#a9b6b2', '#cfb8a0'];
    const shopNames = ['CAFÉ BUENA', 'LIQUOR', 'LAUNDRY', 'TACOS', 'PAWN', 'SURF SHOP', 'DINER', 'BODEGA'];
    for (let x = xMin + 6; x < xMax - 86; x += 124) {
      for (let y = yMin + 8; y < yMax - 66; y += 118) {
        if (this.rng() < 0.2) continue;
        const w = 92 + this.rng() * 44;
        const h = 72 + this.rng() * 34;
        this.buildings.push({
          x: x + w / 2,
          y: y + h / 2,
          w,
          h,
          height: 18 + this.rng() * 20,
          color: pick(this.rng, shades),
          roofColor: pick(this.rng, ['#7a6654', '#6d6259', '#8b735f']),
          type: 'lowrise',
          neonText: this.rng() > 0.7 ? pick(this.rng, shopNames) : null,
          neonColor: pick(this.rng, ['#ff7fa5', '#5ce1e6', '#ffd166']),
          awning: this.rng() > 0.35,
          awningColor: pick(this.rng, ['#c45a5a', '#3e8585', '#c4953d', '#557ea3', '#a45b78']),
          windows: 3,
        });
      }
    }
  }

  addBlockTrees(block) {
    for (let i = 0; i < 4; i += 1) {
      this.palmTrees.push({
        x: range(this.rng, block.xMin + 50, block.xMax - 50),
        y: range(this.rng, block.yMin + 40, block.yMax - 40),
        size: range(this.rng, 18, 27),
      });
    }
  }

  // Knock a rectangular hole in the generated city for a landmark's forecourt.
  clearArea(x, y, w, h) {
    this.buildings = this.buildings.filter((b) => {
      const overlapX = Math.abs(b.x - x) < (b.w + w) / 2 + 12;
      const overlapY = Math.abs(b.y - y) < (b.h + h) / 2 + 12;
      return !(overlapX && overlapY);
    });
  }

  addLandmarkBuildings() {
    const L = this.landmarks;
    this.clearArea(L.diner.x, L.diner.y, 150, 130);
    this.clearArea(L.chopShop.x, L.chopShop.y, 230, 180);
    this.clearArea(L.safehouse.x, L.safehouse.y, 200, 160);
    this.clearArea(L.docks.x, L.docks.y, 240, 180);
    this.clearArea(L.compound.x, L.compound.y, 240, 190);
    this.clearArea(L.hospital.x, L.hospital.y, 210, 160);
    this.clearArea(L.policeStation.x, L.policeStation.y, 200, 160);
    this.clearArea(L.plaza.x, L.plaza.y, 260, 240);
    this.clearArea(L.valet.x, L.valet.y, 210, 170);

    this.buildings.push({
      x: L.diner.x, y: L.diner.y, w: 96, h: 74, height: 22,
      color: '#f7e3cf', roofColor: '#d96a57', type: 'landmark',
      neonText: 'PELICAN GRILL', neonColor: '#ff7f9e', awning: true, awningColor: '#cf6a6a', windows: 4,
    });
    this.buildings.push({
      x: L.chopShop.x, y: L.chopShop.y, w: 158, h: 104, height: 24,
      color: '#5c5a57', roofColor: '#3d3c3b', type: 'landmark',
      neonText: 'RUSTLINE', neonColor: '#ffb45c', windows: 2,
    });
    this.buildings.push({
      x: L.safehouse.x, y: L.safehouse.y, w: 128, h: 92, height: 26,
      color: '#cfae8c', roofColor: '#7e5f46', type: 'landmark',
      neonText: 'SABAL', neonColor: '#8fe3a5', windows: 4,
    });
    this.buildings.push({
      x: L.docks.x, y: L.docks.y, w: 168, h: 104, height: 30,
      color: '#586a70', roofColor: '#39494e', type: 'landmark',
      neonText: 'PIER 9', neonColor: '#59a9ff', windows: 3,
    });
    this.buildings.push({
      x: L.compound.x, y: L.compound.y, w: 152, h: 112, height: 52,
      color: '#3b4652', roofColor: '#252f38', type: 'landmark',
      neonText: 'CROWE ESTATE', neonColor: '#ffd166', hasHelipad: true, windows: 6,
    });
    this.buildings.push({
      x: L.hospital.x, y: L.hospital.y, w: 134, h: 96, height: 38,
      color: '#eef2f0', roofColor: '#c9d6d2', type: 'landmark',
      neonText: 'COSTA SOL GENERAL', neonColor: '#ff6f91', hasHelipad: true, windows: 5,
    });
    this.buildings.push({
      x: L.policeStation.x, y: L.policeStation.y, w: 128, h: 96, height: 34,
      color: '#d8e3ec', roofColor: '#5d89ad', type: 'landmark',
      neonText: 'POLICE HQ', neonColor: '#59a9ff', hasHelipad: true, windows: 5,
    });

    // Vantage Plaza: a paved open square with a fountain ring in the middle.
    this.props.push({ type: 'fountain', x: L.plaza.x - 55, y: L.plaza.y + 62, r: 38 });
    this.billboards.push(
      { x: 1760, y: 1390, text: 'VANTAGE', color: '#5ce1e6', angle: 0 },
      { x: 2260, y: 1040, text: 'MARABU NIGHTS', color: '#ff7fa5', angle: 0 },
      { x: 2010, y: 2260, text: 'DRYDOCK 9', color: '#59a9ff', angle: 0 },
      { x: 820, y: 1330, text: 'SOLAR COLA', color: '#ffd166', angle: 0 }
    );

    // A small forecourt for the valet.
    this.props.push({ type: 'valetSign', x: L.valet.x, y: L.valet.y - 60 });
  }

  generateFoliageAndProps() {
    // Ocean Boulevard palms, both curbs.
    for (let y = 50; y < 3150; y += 62) {
      this.palmTrees.push({ x: 2338 + this.rng() * 10, y: y + this.rng() * 8, size: 22 + this.rng() * 7 });
      this.palmTrees.push({ x: 2462 + this.rng() * 12, y: y + 22 + this.rng() * 8, size: 21 + this.rng() * 7 });
    }
    // Beach palms.
    for (let y = 60; y < 3140; y += 86) {
      this.palmTrees.push({ x: 2616 + this.rng() * 52, y: y + this.rng() * 30, size: 24 + this.rng() * 9 });
    }
    // Garden estates and market-row corners.
    for (let x = 70; x < 1060; x += 96) {
      for (let y = 70; y < 1400; y += 112) {
        if (this.rng() > 0.55) this.palmTrees.push({ x: x + this.rng() * 24, y: y + this.rng() * 24, size: 19 + this.rng() * 6 });
      }
    }
    for (let i = 0; i < 46; i += 1) {
      this.palmTrees.push({ x: range(this.rng, 60, 2380), y: range(this.rng, 60, 3140), size: range(this.rng, 18, 27) });
    }

    // Streetlights on every avenue.
    for (const x of X_ROADS) {
      for (let y = 70; y < 3140; y += 145) {
        if (y % 2 < 1) this.streetlights.push({ x: x - 58, y, color: '#ffe3a6', radius: 105 });
        this.streetlights.push({ x: x + 58, y: y + 70, color: '#ffe3a6', radius: 105 });
      }
    }
    for (const y of Y_ROADS) {
      for (let x = 70; x < 2380; x += 150) {
        this.streetlights.push({ x: x + 55, y: y - 52, color: '#ffe3a6', radius: 105 });
      }
    }

    // Boardwalk furniture, beach umbrellas, crates and planters.
    for (let y = 90; y < 3120; y += 118) {
      if (this.rng() > 0.5) this.props.push({ type: 'bench', x: 2504, y, angle: 0 });
      if (this.rng() > 0.58) this.props.push({ type: 'umbrella', x: 2630 + this.rng() * 70, y: y + 30, color: pick(this.rng, ['#ff7f9e', '#5ce1e6', '#ffd166', '#f4f1e8']) });
    }
    for (const block of this.blocks) {
      if (block.kind === 'industry' || block.kind === 'containers') {
        for (let i = 0; i < 5; i += 1) {
          this.props.push({
            type: this.rng() > 0.5 ? 'crate' : 'dumpster',
            x: range(this.rng, block.xMin + 20, block.xMax - 20),
            y: range(this.rng, block.yMin + 20, block.yMax - 20),
            angle: this.rng() * Math.PI,
          });
        }
      } else if (this.rng() > 0.55) {
        this.props.push({ type: 'planter', x: block.xMin + 26, y: block.yMin + 26, angle: 0 });
      }
    }

    // A few sidewalk vendors / news boxes for colour.
    for (let i = 0; i < 24; i += 1) {
      const road = pick(this.rng, this.roads);
      const t = range(this.rng, 0.1, 0.9);
      const side = this.rng() > 0.5 ? 1 : -1;
      if (road.horizontal) {
        this.props.push({ type: 'newsbox', x: road.x1 + (road.x2 - road.x1) * t, y: road.y1 + side * (road.width / 2 + 20), angle: 0 });
      }
    }
  }

  generateParkingSpots() {
    for (const road of this.roads) {
      const len = Math.hypot(road.x2 - road.x1, road.y2 - road.y1);
      const count = Math.floor(len / 210);
      for (let i = 1; i < count; i += 1) {
        const t = i / count;
        const side = i % 2 === 0 ? 1 : -1;
        let x;
        let y;
        let angle;
        if (road.horizontal) {
          x = road.x1 + (road.x2 - road.x1) * t;
          y = road.y1 + side * (road.width / 2 - 18);
          angle = side > 0 ? Math.PI : 0;
        } else {
          x = road.x1 - side * (road.width / 2 - 18);
          y = road.y1 + (road.y2 - road.y1) * t;
          angle = side > 0 ? Math.PI / 2 : -Math.PI / 2;
        }
        if (x < 30 || x > 2660 || y < 30 || y > 3170) continue;
        if (this.nearIntersection(x, y, 75)) continue;
        if (this.pointBlocked(x, y, 40)) continue;
        this.parkingSpots.push({ x, y, angle, occupied: false });
      }
    }
  }

  generateSandSpecks() {
    for (let i = 0; i < 320; i += 1) {
      this.sandSpecks.push({
        x: range(this.rng, 2500, 2718),
        y: range(this.rng, 10, 3190),
        r: range(this.rng, 0.6, 2.2),
        a: range(this.rng, 0.08, 0.22),
      });
    }
    for (let y = 4; y < 3200; y += 13) {
      const clusters = 1 + Math.floor(this.rng() * 3);
      for (let c = 0; c < clusters; c += 1) {
        this.foamDots.push({
          x: range(this.rng, 2700, 2726),
          y: y + range(this.rng, -6, 6),
          r: range(this.rng, 0.8, 2.6),
          a: range(this.rng, 0.18, 0.5),
        });
      }
    }
  }

  buildSpatialGrid() {
    for (const b of this.buildings) {
      this.insertCollider({ x: b.x, y: b.y, w: b.w, h: b.h, type: 'building', ref: b });
    }
    for (const w of this.waterZones) {
      this.insertCollider({ x: w.x, y: w.y, w: w.w, h: w.h, type: 'water', ref: w });
    }
  }

  // -----------------------------------------------------------------
  // Queries
  // -----------------------------------------------------------------
  nearIntersection(x, y, radius) {
    for (const i of this.intersections) {
      if (Math.abs(x - i.x) < radius && Math.abs(y - i.y) < radius) return true;
    }
    return false;
  }

  pointBlocked(x, y, radius = 10) {
    for (const col of this.getColliders(x, y, radius)) {
      if (col.type === 'building' && Math.abs(x - col.x) < col.w / 2 + radius && Math.abs(y - col.y) < col.h / 2 + radius) return true;
      if (col.type === 'water' && this.isWater(x, y)) return true;
    }
    return false;
  }

  isWater(x, y) {
    for (const w of this.waterZones) {
      if (Math.abs(x - w.x) < w.w / 2 && Math.abs(y - w.y) < w.h / 2) {
        for (const p of this.piers) {
          if (Math.abs(x - p.x) < p.w / 2 && Math.abs(y - p.y) < p.h / 2) return false;
        }
        return true;
      }
    }
    return false;
  }

  isBeach(x, y) {
    return x > 2500 && x < 2720;
  }

  // Circle-vs-axis-aligned-box collision. Returns null or a push vector.
  collideCircle(x, y, radius, options = {}) {
    const colliders = this.getColliders(x, y, radius + 4);
    let pushX = 0;
    let pushY = 0;
    let hit = null;
    for (const col of colliders) {
      if (col.type === 'water') {
        if (options.ignoreWater) continue;
        if (!this.isWater(x, y)) continue;
      }
      const halfW = col.w / 2;
      const halfH = col.h / 2;
      const nearestX = Math.max(col.x - halfW, Math.min(x, col.x + halfW));
      const nearestY = Math.max(col.y - halfH, Math.min(y, col.y + halfH));
      const dx = x - nearestX;
      const dy = y - nearestY;
      const d2 = dx * dx + dy * dy;
      if (d2 < radius * radius) {
        const d = Math.sqrt(d2) || 1;
        const overlap = radius - d;
        pushX += (dx / d) * overlap;
        pushY += (dy / d) * overlap;
        hit = col;
      }
    }
    if (!hit) return null;
    return { x: pushX, y: pushY, collider: hit };
  }

  // Segment collision used by bullets. Samples a little coarsely but is cheap
  // and returns the first wall or water hit.
  raycast(x1, y1, x2, y2, step = 18) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dist = Math.hypot(dx, dy);
    if (dist <= 0) return null;
    const steps = Math.ceil(dist / step);
    for (let s = 1; s <= steps; s += 1) {
      const curX = x1 + (dx * s) / steps;
      const curY = y1 + (dy * s) / steps;
      if (curX < 0 || curX > this.width || curY < 0 || curY > this.height) {
        return { x: curX, y: curY, dist: (s / steps) * dist, hitType: 'boundary' };
      }
      const colliders = this.getColliders(curX, curY, 6);
      for (const col of colliders) {
        if (col.type === 'building') {
          if (Math.abs(curX - col.x) < col.w / 2 && Math.abs(curY - col.y) < col.h / 2) {
            return { x: curX, y: curY, dist: (s / steps) * dist, hitType: 'building', ref: col.ref };
          }
        }
      }
    }
    return null;
  }

  hasLineOfSight(x1, y1, x2, y2, max = 750) {
    if (Math.hypot(x2 - x1, y2 - y1) > max) return false;
    const hit = this.raycast(x1, y1, x2, y2, 26);
    return !hit || hit.hitType !== 'building';
  }

  randomRoadPoint(centerX, centerY, minDist, maxDist, rng = this.rng) {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const road = pick(rng, this.roads);
      const t = range(rng, 0.05, 0.95);
      const x = road.x1 + (road.x2 - road.x1) * t;
      const y = road.y1 + (road.y2 - road.y1) * t;
      const d = Math.hypot(x - centerX, y - centerY);
      if (d >= minDist && d <= maxDist && x > 40 && x < 2660 && y > 40 && y < 3160) {
        return { x, y, angle: road.horizontal ? (road.dirX > 0 ? 0 : Math.PI) : (road.dirY > 0 ? Math.PI / 2 : -Math.PI / 2), road };
      }
    }
    return { x: Math.max(60, Math.min(2600, centerX + minDist)), y: Math.max(60, Math.min(3160, centerY)), angle: 0 };
  }

  sidewalkPoint(centerX, centerY, radius = 900, rng = this.rng) {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const road = pick(rng, this.roads);
      const t = range(rng, 0.02, 0.98);
      const side = rng() > 0.5 ? 1 : -1;
      let x;
      let y;
      let angle;
      if (road.horizontal) {
        x = road.x1 + (road.x2 - road.x1) * t;
        y = road.y1 + side * (road.width / 2 + 16);
        angle = road.dirX > 0 ? 0 : Math.PI;
      } else {
        x = road.x1 - side * (road.width / 2 + 16);
        y = road.y1 + (road.y2 - road.y1) * t;
        angle = road.dirY > 0 ? Math.PI / 2 : -Math.PI / 2;
      }
      if (Math.hypot(x - centerX, y - centerY) > radius) continue;
      if (x < 15 || x > 3180 || y < 15 || y > 3180) continue;
      if (this.pointBlocked(x, y, 12)) continue;
      return { x, y, angle, road };
    }
    return { x: centerX + 30, y: centerY + 30, angle: 0, road: this.roads[0] };
  }

  addSkidMark(x, y, angle, alpha = 0.5) {
    this.skidMarks.push({ x, y, angle, alpha, age: 0 });
    if (this.skidMarks.length > 480) this.skidMarks.shift();
  }

  update(dt, time) {
    for (const light of this.trafficLights) {
      light.timer += dt;
      if (light.state === 'green' && light.timer > light.greenFor) {
        light.state = 'red';
        light.timer = 0;
      } else if (light.state === 'red' && light.timer > light.redFor) {
        light.state = 'green';
        light.timer = 0;
      }
    }
    for (let i = this.skidMarks.length - 1; i >= 0; i -= 1) {
      const s = this.skidMarks[i];
      s.age += dt;
      if (s.age > 18) this.skidMarks.splice(i, 1);
    }
  }
}

export { DISTRICTS };
