// Leonida Heat v3 - Costa Sol, generated.
// A deterministic 3200 x 3200 coastal city: a ring highway, six districts,
// tower blocks, estates, market low-rises, container yards, a working beach,
// three piers, a marina, alleys, parks, stunt ramps, garages and a dozen
// hidden mixtapes. The generator also owns the spatial collision hash, road
// furniture, skid marks and every spawn table used by the other systems.

import { MAP_CONFIG, DISTRICTS, districtAt, GARAGE_CONFIG } from './config.js';
import { mulberry32, pick, range, rangeInt, chance, hash2 } from './rng.js';

const BLOCK_GAP = 10;
const SIDEWALK = 26;

const X_CUTS = [0, 120, 400, 800, 1080, 1200, 1600, 1800, 2000, 2320, 2400, 2480, 3200];
const Y_CUTS = [0, 120, 350, 620, 700, 1050, 1400, 1800, 2140, 2200, 2600, 2950, 3080, 3200];

const SHOP_SIGNS = ['CAFÉ BUENA', 'LIQUOR', 'LAUNDRY', 'TACOS', 'PAWN', 'SURF SHOP', 'DINER', 'BODEGA', 'TIDE BAR', 'NAILS', 'RECORDS', 'PHARMACY', 'BAIT & ICE', 'CICADAS'];
const TOWER_SIGNS = ['MERIDIAN', 'SOLARIS', 'PELICAN AIR', 'CORAL BANK', 'TIDEWATER', 'MIRAGE', 'VANTAGE', 'SUNSET CO', 'AZURE', 'RIDGELINE'];
const ROOF_PROPS = ['ac', 'tank', 'vent', 'dish', 'solar', 'garden'];
const CONTAINER_COLORS = ['#c94f43', '#3f7fa8', '#d99a35', '#4d8f68', '#8a5a9e', '#b9693f', '#4f8b9a'];

function rectsOverlap(a, b, pad = 0) {
  return Math.abs(a.x - b.x) < (a.w + b.w) / 2 + pad && Math.abs(a.y - b.y) < (a.h + b.h) / 2 + pad;
}

function pointInRect(x, y, r) {
  return Math.abs(x - r.x) < r.w / 2 && Math.abs(y - r.y) < r.h / 2;
}

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
    this.blocks = [];
    this.lots = [];
    this.intersections = [];
    this.trafficLights = [];
    this.waterZones = [];
    this.beaches = [];
    this.buildings = [];
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
    this.puddles = [];
    this.parkAreas = [];
    this.alleys = [];
    this.ramps = [];
    this.collectibleSpots = [];
    this.garages = [];
    this.stuntRoutes = [];
    this.marina = { x: 2812, y: 2320, r: 190, name: 'Quay Marina' };
    this.pois = [];
    this.spawnPoints = [];

    this.landmarks = {
      diner: { x: 2560, y: 1080, name: 'The Pelican Grill', contact: 'Maya', icon: 'diner' },
      valet: { x: 2560, y: 880, name: 'Coral Valet', contact: 'Maya', icon: 'car' },
      chopShop: { x: 350, y: 2450, name: 'Rustline Chop Shop', icon: 'wrench' },
      garage: { x: 520, y: 2300, name: 'Rustline Garage', icon: 'wrench' },
      plaza: { x: 1760, y: 1460, name: 'Vantage Plaza', icon: 'star' },
      safehouse: { x: 1330, y: 1280, name: 'Sabal Safehouse', icon: 'home' },
      docks: { x: 2250, y: 2500, name: 'Pier 9 Warehouse', icon: 'crate' },
      compound: { x: 2560, y: 470, name: 'Crowe Estate', icon: 'crown' },
      hospital: { x: 1350, y: 1740, name: 'Costa Sol General', icon: 'cross' },
      policeStation: { x: 1650, y: 950, name: 'Costa Sol Police HQ', icon: 'shield' },
      boardwalk: { x: 2524, y: 1660, name: 'Coral Boardwalk', icon: 'wave' },
      marina: { x: 2812, y: 2320, name: 'Quay Marina', icon: 'anchor' },
      park: { x: 760, y: 560, name: 'Sabal Palms Park', icon: 'tree' },
    };

    this.grid = new Array(this.cols * this.rows).fill(null).map(() => []);
    this.generate();
  }

  // ------------------------------------------------------------------
  // Spatial hash
  // ------------------------------------------------------------------
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
      for (let c = minCol; c <= maxCol; c += 1) this.grid[r * this.cols + c].push(item);
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
          if (!seen.has(cell[i])) {
            seen.add(cell[i]);
            results.push(cell[i]);
          }
        }
      }
    }
    return results;
  }

  // ------------------------------------------------------------------
  // Generation
  // ------------------------------------------------------------------
  generate() {
    this.generateCoast();
    this.generateRoads();
    this.generateIntersections();
    this.generateBlocks();
    this.generateBuildings();
    this.addLandmarks();
    this.generateFoliage();
    this.generateParking();
    this.generateBeachDetail();
    this.generatePuddles();
    this.generateRamps();
    this.generateCollectibles();
    this.generateGarages();
    this.generatePois();
    this.buildSpatialGrid();
  }

  generateCoast() {
    this.waterZones.push({ x: 2960, y: 1600, w: 480, h: 3200, type: 'ocean' });
    this.beaches.push({ x: 2590, y: 1600, w: 260, h: 3200 });
    this.boardwalk = { x: 2494, y: 0, w: 58, h: 3200 };
    this.piers.push(
      { x: 2840, y: 780, w: 300, h: 46, name: 'Pelican Pier', boats: false },
      { x: 2840, y: 1660, w: 340, h: 48, name: 'Coral Boardwalk Pier', boats: true },
      { x: 2840, y: 2380, w: 270, h: 44, name: 'Drydock Pier', boats: false },
      { x: 2812, y: 2320, w: 210, h: 26, name: 'Quay Marina Dock', boats: true },
      { x: 2812, y: 2200, w: 156, h: 20, name: 'Quay Marina Arm', boats: true },
    );

    for (let i = 0; i < 7; i += 1) {
      const x = 2818 + (i % 2) * 86;
      const y = 2100 + i * 44;
      this.props.push({ type: 'boat', x, y, angle: Math.PI / 2 + (i % 3) * 0.06, color: pick(this.rng, ['#f4f1e8', '#5ce1e6', '#ff7f9e', '#ffd166']) });
    }
    for (let i = 0; i < 5; i += 1) {
      this.props.push({ type: 'lifeguard', x: 2652, y: 260 + i * 610, angle: 0 });
    }
  }

  generateRoads() {
    const major = [
      { x1: 2400, y1: 0, x2: 2400, y2: 3200, width: 92, lanes: 4, name: 'Ocean Boulevard', kind: 'arterial' },
      { x1: 0, y1: 1400, x2: 2400, y2: 1400, width: 96, lanes: 4, name: 'Grand Avenue', kind: 'arterial' },
      { x1: 1200, y1: 0, x2: 1200, y2: 3200, width: 88, lanes: 4, name: 'Meridian Expressway', kind: 'arterial' },
      { x1: 0, y1: 2200, x2: 2700, y2: 2200, width: 84, lanes: 4, name: 'Drydock Parkway', kind: 'arterial' },
      { x1: 0, y1: 700, x2: 2400, y2: 700, width: 84, lanes: 4, name: 'Palmetto Way', kind: 'arterial' },
      { x1: 120, y1: 120, x2: 120, y2: 3080, width: 70, lanes: 4, name: 'Bayshore Loop', kind: 'highway' },
      { x1: 0, y1: 120, x2: 2400, y2: 120, width: 66, lanes: 4, name: 'North Ring', kind: 'highway' },
      { x1: 0, y1: 3080, x2: 2400, y2: 3080, width: 70, lanes: 4, name: 'South Ring', kind: 'highway' },
    ];
    const minor = [
      { x1: 400, y1: 0, x2: 400, y2: 3200, width: 62, lanes: 2, name: 'Foundry Row' },
      { x1: 800, y1: 0, x2: 800, y2: 3200, width: 62, lanes: 2, name: 'Sabal Avenue' },
      { x1: 1600, y1: 0, x2: 1600, y2: 3200, width: 66, lanes: 2, name: 'Tarpon Street' },
      { x1: 2000, y1: 0, x2: 2000, y2: 3200, width: 66, lanes: 2, name: 'Quay Road' },
      { x1: 0, y1: 350, x2: 2400, y2: 350, width: 58, lanes: 2, name: 'Garden Loop' },
      { x1: 0, y1: 1050, x2: 2400, y2: 1050, width: 62, lanes: 2, name: 'Vantage Way' },
      { x1: 0, y1: 1800, x2: 2400, y2: 1800, width: 62, lanes: 2, name: 'Market Row' },
      { x1: 0, y1: 2600, x2: 2000, y2: 2600, width: 62, lanes: 2, name: 'Terminal Way' },
      { x1: 0, y1: 2950, x2: 2400, y2: 2950, width: 58, lanes: 2, name: 'Tidewater Road' },
    ];

    this.roads = [...major, ...minor].map((r) => ({
      ...r,
      horizontal: r.y1 === r.y2,
      dirX: Math.sign(r.x2 - r.x1),
      dirY: Math.sign(r.y2 - r.y1),
      half: r.width / 2,
    }));

    for (const road of this.roads) {
      const len = Math.hypot(road.x2 - road.x1, road.y2 - road.y1);
      const count = Math.max(3, Math.floor(len / 235));
      for (let i = 0; i < count; i += 1) {
        const t = range(this.rng, 0.03, 0.97);
        const x = road.x1 + (road.x2 - road.x1) * t;
        const y = road.y1 + (road.y2 - road.y1) * t;
        if (this.nearIntersection(x, y, 95)) continue;
        this.roadPatches.push({
          x, y,
          w: road.horizontal ? range(this.rng, 24, 90) : range(this.rng, 5, 19),
          h: road.horizontal ? range(this.rng, 5, 19) : range(this.rng, 24, 90),
          angle: range(this.rng, -0.05, 0.05),
          light: this.rng() > 0.55,
          alpha: range(this.rng, 0.08, 0.22),
        });
      }
      const cracks = Math.max(2, Math.floor(len / 500));
      for (let i = 0; i < cracks; i += 1) {
        const t = range(this.rng, 0.05, 0.95);
        let px = road.x1 + (road.x2 - road.x1) * t;
        let py = road.y1 + (road.y2 - road.y1) * t;
        if (this.nearIntersection(px, py, 95)) continue;
        const points = [];
        const steps = 4 + Math.floor(this.rng() * 4);
        for (let s = 0; s < steps; s += 1) {
          points.push({ x: px, y: py });
          if (road.horizontal) {
            px += range(this.rng, -9, 9);
            py += range(this.rng, 8, 22) * (this.rng() > 0.5 ? 1 : -1);
          } else {
            px += range(this.rng, 8, 22) * (this.rng() > 0.5 ? 1 : -1);
            py += range(this.rng, -9, 9);
          }
        }
        this.roadCracks.push({ points, alpha: range(this.rng, 0.08, 0.2) });
      }
    }
  }

  generateIntersections() {
    const hs = this.roads.filter((r) => r.horizontal);
    const vs = this.roads.filter((r) => !r.horizontal);
    let index = 0;
    for (const hr of hs) {
      for (const vr of vs) {
        const inX = vr.x1 >= Math.min(hr.x1, hr.x2) - 1 && vr.x1 <= Math.max(hr.x1, hr.x2) + 1;
        const inY = hr.y1 >= Math.min(vr.y1, vr.y2) - 1 && hr.y1 <= Math.max(vr.y1, vr.y2) + 1;
        if (!inX || !inY) continue;
        const size = Math.max(hr.width, vr.width);
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
        index += 1;
      }
    }
  }

  verticalHalf(x) {
    for (const r of this.roads) if (!r.horizontal && Math.abs(r.x1 - x) < 2) return r.half;
    return 0;
  }

  horizontalHalf(y) {
    for (const r of this.roads) if (r.horizontal && Math.abs(r.y1 - y) < 2) return r.half;
    return 0;
  }

  generateBlocks() {
    for (let xi = 0; xi < X_CUTS.length - 1; xi += 1) {
      for (let yi = 0; yi < Y_CUTS.length - 1; yi += 1) {
        const x0 = X_CUTS[xi];
        const x1 = X_CUTS[xi + 1];
        const y0 = Y_CUTS[yi];
        const y1 = Y_CUTS[yi + 1];
        if (x0 >= 2480) continue;
        if (y1 > 3200) continue;
        const left = this.verticalHalf(x0);
        const right = this.verticalHalf(x1);
        const top = this.horizontalHalf(y0);
        const bottom = this.horizontalHalf(y1);
        const xMin = x0 + left + BLOCK_GAP;
        const xMax = x1 - right - BLOCK_GAP;
        const yMin = y0 + top + BLOCK_GAP;
        const yMax = y1 - bottom - BLOCK_GAP;
        if (xMax - xMin < 52 || yMax - yMin < 52) continue;
        const midX = (xMin + xMax) / 2;
        const midY = (yMin + yMax) / 2;
        const district = districtAt(midX, midY);
        const kind = this.chooseBlockKind(district);
        const block = {
          x: midX, y: midY, xMin, xMax, yMin, yMax,
          w: xMax - xMin, h: yMax - yMin,
          district: district.id,
          lot: district.lot,
          kind,
          alley: this.rng() < (district.character === 'downtown' ? 0.48 : 0.26),
          seed: Math.floor(this.rng() * 1e9),
        };
        this.blocks.push(block);
        this.lots.push({
          x: midX, y: midY, xMin, xMax, yMin, yMax,
          w: xMax - xMin, h: yMax - yMin,
          district: district.id,
          kind,
          lot: district.lot,
          seed: block.seed,
        });
        if (block.alley && block.w > 150) {
          const vertical = this.rng() > 0.5;
          if (vertical) {
            const ax = xMin + (xMax - xMin) * range(this.rng, 0.3, 0.7);
            this.alleys.push({ x: ax, y: midY, w: 16, h: yMax - yMin, angle: Math.PI / 2 });
          } else {
            const ay = yMin + (yMax - yMin) * range(this.rng, 0.3, 0.7);
            this.alleys.push({ x: midX, y: ay, w: xMax - xMin, h: 15, angle: 0 });
          }
        }
      }
    }
  }

  chooseBlockKind(district) {
    const roll = this.rng();
    switch (district.character) {
      case 'estates':
        return roll < 0.58 ? 'estate' : roll < 0.82 ? 'park' : roll < 0.92 ? 'plaza' : 'parking';
      case 'downtown':
        return roll < 0.62 ? 'tower' : roll < 0.76 ? 'plaza' : roll < 0.9 ? 'parking' : 'lowrise';
      case 'industry':
        return roll < 0.5 ? 'industry' : roll < 0.7 ? 'parking' : roll < 0.85 ? 'containers' : 'park';
      case 'docks':
        return roll < 0.4 ? 'containers' : roll < 0.64 ? 'industry' : roll < 0.86 ? 'parking' : 'plaza';
      case 'market':
        return roll < 0.6 ? 'lowrise' : roll < 0.74 ? 'park' : roll < 0.9 ? 'parking' : 'plaza';
      case 'beach':
        return roll < 0.48 ? 'lowrise' : roll < 0.72 ? 'parking' : roll < 0.9 ? 'park' : 'plaza';
      default:
        return roll < 0.6 ? 'lowrise' : 'parking';
    }
  }

  generateBuildings() {
    for (const block of this.blocks) {
      const inset = SIDEWALK;
      const xMin = block.xMin + inset;
      const xMax = block.xMax - inset;
      const yMin = block.yMin + inset;
      const yMax = block.yMax - inset;
      if (xMax - xMin < 44 || yMax - yMin < 44) {
        block.open = true;
        continue;
      }
      if (block.kind === 'park' || block.kind === 'parking' || block.kind === 'plaza') {
        block.open = true;
        if (block.kind === 'park') {
          this.parkAreas.push({
            x: block.x, y: block.y, w: block.w, h: block.h, xMin, xMax, yMin, yMax,
            pond: this.rng() < 0.48,
            path: this.rng() > 0.32,
          });
          this.props.push({ type: 'fountain', x: block.x, y: block.y, r: Math.min(32, Math.min(block.w, block.h) * 0.18) });
        }
        if (block.kind === 'plaza') {
          this.props.push({ type: 'fountain', x: block.x, y: block.y, r: Math.min(30, Math.min(block.w, block.h) * 0.16) });
          this.props.push({ type: 'plazaRing', x: block.x, y: block.y, r: Math.min(70, Math.min(block.w, block.h) * 0.34) });
        }
        if (block.kind === 'parking') {
          for (let i = 0; i < 3; i += 1) {
            this.props.push({
              type: 'lamp', x: xMin + 20 + i * ((xMax - xMin - 40) / 2),
              y: yMax - 18, angle: 0,
            });
          }
        }
        continue;
      }

      const d = DISTRICTS.find((dist) => dist.id === block.district) || DISTRICTS[1];
      switch (block.kind) {
        case 'estate': this.buildEstates(block, xMin, xMax, yMin, yMax); break;
        case 'tower': this.buildTowers(block, xMin, xMax, yMin, yMax, d); break;
        case 'industry': this.buildWarehouses(block, xMin, xMax, yMin, yMax); break;
        case 'containers': this.buildContainers(block, xMin, xMax, yMin, yMax); break;
        default: this.buildLowRises(block, xMin, xMax, yMin, yMax, d); break;
      }
    }
  }

  pushBuilding(b) {
    for (const L of Object.values(this.landmarks)) {
      if (rectsOverlap(b, { x: L.x, y: L.y, w: 220, h: 190 }, 12)) return false;
    }
    for (const existing of this.buildings) {
      if (rectsOverlap(b, existing, 2)) return false;
    }
    this.buildings.push(b);
    return true;
  }

  decorateRoof(b, style) {
    const props = [];
    const count = 1 + Math.floor(this.rng() * 3);
    for (let i = 0; i < count; i += 1) {
      props.push({
        type: pick(this.rng, ROOF_PROPS),
        dx: range(this.rng, -b.w * 0.28, b.w * 0.28),
        dy: range(this.rng, -b.h * 0.28, b.h * 0.28),
        size: range(this.rng, 6, 14),
        rotate: range(this.rng, -0.4, 0.4),
      });
    }
    b.roofProps = props;
    b.style = style;
  }

  buildEstates(block, xMin, xMax, yMin, yMax) {
    const houseW = 76;
    const houseH = 66;
    for (let x = xMin + 8; x < xMax - houseW + 8; x += houseW + 46) {
      for (let y = yMin + 8; y < yMax - houseH + 8; y += houseH + 42) {
        if (this.rng() < 0.14) continue;
        const pastel = pick(this.rng, ['#f3ead9', '#f7d9cf', '#e7efe1', '#f6e7bd', '#e4dcef', '#f2e4d0']);
        const b = {
          x: x + houseW / 2, y: y + houseH / 2,
          w: houseW + range(this.rng, -8, 12), h: houseH + range(this.rng, -6, 10),
          height: 14 + this.rng() * 9,
          color: pastel,
          roofColor: pick(this.rng, ['#c8664b', '#b95b48', '#d17a54', '#8f6b58', '#a94f5a']),
          type: 'house',
          hasPool: this.rng() > 0.58,
          hasDriveway: this.rng() > 0.28,
          windows: 2,
          windowRows: 2,
          windowCols: 3,
          awning: this.rng() > 0.62,
          awningColor: pick(this.rng, ['#c45a5a', '#3e8585', '#c4953d', '#557ea3']),
          parapet: this.rng() > 0.5,
          garden: this.rng() > 0.22,
          door: true,
        };
        this.decorateRoof(b, 'house');
        this.pushBuilding(b);
      }
    }
    for (let i = 0; i < 3; i += 1) {
      this.palmTrees.push({
        x: range(this.rng, block.xMin + 40, block.xMax - 40),
        y: range(this.rng, block.yMin + 34, block.yMax - 34),
        size: range(this.rng, 19, 28),
      });
    }
  }

  buildTowers(block, xMin, xMax, yMin, yMax, district) {
    const bW = 104;
    const bH = 104;
    let idx = Math.floor(this.rng() * TOWER_SIGNS.length);
    for (let x = xMin + 4; x < xMax - bW + 12; x += bW + 26) {
      for (let y = yMin + 4; y < yMax - bH + 12; y += bH + 26) {
        if (this.rng() < 0.11) continue;
        const height = 46 + Math.floor(this.rng() * 74);
        const material = this.rng();
        const glass = material < 0.46;
        const stone = material >= 0.46 && material < 0.78;
        const b = {
          x: x + bW / 2, y: y + bH / 2,
          w: bW + range(this.rng, -8, 14), h: bH + range(this.rng, -8, 14),
          height,
          color: glass ? '#3b6476' : stone ? '#a89a86' : '#4a4652',
          roofColor: glass ? '#2c4c5c' : stone ? '#8e8271' : '#37343f',
          type: 'tower',
          glass, stone,
          neonText: this.rng() > 0.38 ? TOWER_SIGNS[idx++ % TOWER_SIGNS.length] : null,
          neonColor: this.rng() > 0.5 ? district.neon : '#ff7fa5',
          hasHelipad: height > 86 && this.rng() > 0.5,
          hasRoofPool: stone && this.rng() > 0.7,
          windows: 6,
          windowRows: 4 + Math.floor(height / 22),
          windowCols: 4,
          parapet: true,
          awning: false,
        };
        this.decorateRoof(b, glass ? 'tower' : 'stone');
        this.pushBuilding(b);
      }
    }
  }

  buildWarehouses(block, xMin, xMax, yMin, yMax) {
    const w = xMax - xMin - 12;
    const h = Math.min(146, (yMax - yMin) / 2 - 12);
    for (let y = yMin + 8; y < yMax - h + 12; y += h + 32) {
      const b = {
        x: xMin + w / 2 + 6, y: y + h / 2,
        w: Math.max(88, w), h: Math.max(64, h),
        height: 20 + this.rng() * 9,
        color: pick(this.rng, ['#6d6a62', '#7b817f', '#82705e', '#606a6d', '#766a5d']),
        roofColor: pick(this.rng, ['#4e4c46', '#555b59', '#66584b', '#5b5148']),
        type: 'warehouse',
        stripeRoof: this.rng() > 0.5,
        windows: 3,
        windowRows: 2,
        windowCols: 4,
        awning: false,
        parapet: false,
        rollerDoors: 1 + Math.floor(this.rng() * 3),
      };
      this.decorateRoof(b, 'industry');
      this.pushBuilding(b);
    }
  }

  buildContainers(block, xMin, xMax, yMin, yMax) {
    for (let x = xMin + 10; x < xMax - 52; x += 58) {
      for (let y = yMin + 10; y < yMax - 34; y += 42) {
        if (this.rng() < 0.3) continue;
        const b = {
          x: x + 22, y: y + 13, w: 46, h: 26,
          height: 10 + (this.rng() > 0.55 ? 12 : 0),
          color: pick(this.rng, CONTAINER_COLORS),
          roofColor: '#343a40',
          type: 'container',
          windows: 0, windowRows: 0, windowCols: 0,
          ribbed: true, parapet: false, awning: false,
        };
        this.buildings.push(b);
      }
    }
    for (let i = 0; i < 3; i += 1) {
      this.props.push({
        type: this.rng() > 0.5 ? 'crate' : 'dumpster',
        x: range(this.rng, xMin, xMax),
        y: range(this.rng, yMin, yMax),
        angle: this.rng() * Math.PI,
      });
    }
  }

  buildLowRises(block, xMin, xMax, yMin, yMax, district) {
    const shades = ['#d6c3a7', '#c9a98f', '#bd8d78', '#d9cbb6', '#a9b6b2', '#cfb8a0', '#b9a58c'];
    for (let x = xMin + 4; x < xMax - 80; x += 116) {
      for (let y = yMin + 6; y < yMax - 62; y += 108) {
        if (this.rng() < 0.18) continue;
        const w = 86 + this.rng() * 46;
        const h = 66 + this.rng() * 38;
        const sign = this.rng() > 0.26 ? pick(this.rng, SHOP_SIGNS) : null;
        const b = {
          x: x + w / 2, y: y + h / 2, w, h,
          height: 16 + this.rng() * 22,
          color: pick(this.rng, shades),
          roofColor: pick(this.rng, ['#7a6654', '#6d6259', '#8b735f', '#6f5b4e']),
          type: 'lowrise',
          neonText: sign,
          neonColor: this.rng() > 0.45 ? district.neon : pick(this.rng, ['#ff7fa5', '#5ce1e6', '#ffd166']),
          awning: this.rng() > 0.26,
          awningColor: pick(this.rng, ['#c45a5a', '#3e8585', '#c4953d', '#557ea3', '#a45b78']),
          windows: 3,
          windowRows: 2,
          windowCols: 2 + Math.floor(this.rng() * 2),
          parapet: true,
          shopWindows: 2 + Math.floor(this.rng() * 3),
          door: this.rng() > 0.25,
          garden: false,
        };
        this.decorateRoof(b, 'shop');
        this.pushBuilding(b);
      }
    }
  }

  clearArea(x, y, w, h) {
    this.buildings = this.buildings.filter((b) => !rectsOverlap(b, { x, y, w, h }, 14));
  }

  addLandmarks() {
    const L = this.landmarks;
    const clear = [
      [L.diner, 176, 146], [L.chopShop, 256, 194], [L.garage, 220, 180],
      [L.safehouse, 226, 176], [L.docks, 266, 196], [L.compound, 266, 216],
      [L.hospital, 236, 176], [L.policeStation, 226, 176], [L.plaza, 286, 256],
      [L.valet, 236, 186], [L.park, 266, 216],
    ];
    for (const [point, w, h] of clear) this.clearArea(point.x, point.y, w, h);

    this.buildings.push(
      {
        x: L.diner.x, y: L.diner.y, w: 104, h: 78, height: 23, color: '#f7e3cf',
        roofColor: '#d96a57', type: 'landmark', neonText: 'PELICAN GRILL', neonColor: '#ff7f9e',
        awning: true, awningColor: '#cf6a6a', windows: 4, windowRows: 2, windowCols: 3,
        parapet: true, style: 'diner', roofProps: [{ type: 'vent', dx: 20, dy: -12, size: 8, rotate: 0 }], door: true,
      },
      {
        x: L.chopShop.x, y: L.chopShop.y, w: 172, h: 112, height: 26, color: '#5c5a57',
        roofColor: '#3d3c3b', type: 'landmark', neonText: 'RUSTLINE', neonColor: '#ffb45c',
        windows: 2, windowRows: 1, windowCols: 3, awning: false, parapet: false,
        rollerDoors: 2, style: 'chop', roofProps: [{ type: 'tank', dx: -38, dy: 16, size: 12, rotate: 0 }],
      },
      {
        x: L.safehouse.x, y: L.safehouse.y, w: 136, h: 98, height: 27, color: '#cfae8c',
        roofColor: '#7e5f46', type: 'landmark', neonText: 'SABAL', neonColor: '#8fe3a5',
        windows: 4, windowRows: 2, windowCols: 3, awning: true, awningColor: '#6f8f72',
        parapet: true, style: 'house', garden: true, hasPool: true,
      },
      {
        x: L.docks.x, y: L.docks.y, w: 188, h: 116, height: 31, color: '#586a70',
        roofColor: '#39494e', type: 'landmark', neonText: 'PIER 9', neonColor: '#59a9ff',
        windows: 3, windowRows: 2, windowCols: 4, awning: false, parapet: false,
        rollerDoors: 3, style: 'dock', roofProps: [{ type: 'tank', dx: 44, dy: -24, size: 14, rotate: 0 }],
      },
      {
        x: L.compound.x, y: L.compound.y, w: 172, h: 126, height: 55, color: '#3b4652',
        roofColor: '#252f38', type: 'landmark', neonText: 'CROWE ESTATE', neonColor: '#ffd166',
        hasHelipad: true, windows: 6, windowRows: 4, windowCols: 5, awning: false,
        parapet: true, style: 'estate', hasRoofPool: true,
      },
      {
        x: L.hospital.x, y: L.hospital.y, w: 146, h: 104, height: 40, color: '#eef2f0',
        roofColor: '#c9d6d2', type: 'landmark', neonText: 'COSTA SOL GENERAL', neonColor: '#ff6f91',
        hasHelipad: true, windows: 5, windowRows: 4, windowCols: 5, awning: false,
        parapet: true, style: 'hospital',
      },
      {
        x: L.policeStation.x, y: L.policeStation.y, w: 140, h: 104, height: 36, color: '#d8e3ec',
        roofColor: '#5d89ad', type: 'landmark', neonText: 'POLICE HQ', neonColor: '#59a9ff',
        hasHelipad: true, windows: 5, windowRows: 3, windowCols: 4, awning: false,
        parapet: true, style: 'civic',
      },
      {
        x: L.garage.x, y: L.garage.y, w: 150, h: 96, height: 19, color: '#b7a58f',
        roofColor: '#5b4b3c', type: 'garage', neonText: 'RUSTLINE GARAGE', neonColor: '#ffb45c',
        windows: 2, windowRows: 1, windowCols: 3, awning: true, awningColor: '#9c5a3c',
        rollerDoors: 2, parapet: true, style: 'chop',
      },
    );

    this.props.push(
      { type: 'fountain', x: L.plaza.x - 55, y: L.plaza.y + 62, r: 38 },
      { type: 'valetSign', x: L.valet.x, y: L.valet.y - 62 },
      { type: 'statue', x: L.plaza.x + 10, y: L.plaza.y - 8, r: 22 },
      { type: 'gazebo', x: L.park.x, y: L.park.y - 60, r: 30 },
      { type: 'garageSign', x: L.garage.x + 74, y: L.garage.y + 58 },
    );
    this.billboards.push(
      { x: 1760, y: 1390, text: 'VANTAGE', color: '#5ce1e6', angle: 0 },
      { x: 2260, y: 1040, text: 'MARABU NIGHTS', color: '#ff7fa5', angle: 0 },
      { x: 2010, y: 2260, text: 'DRYDOCK 9', color: '#59a9ff', angle: 0 },
      { x: 820, y: 1330, text: 'SOLAR COLA', color: '#ffd166', angle: 0 },
      { x: 2360, y: 2520, text: 'CROWN HOTELS', color: '#ffb45c', angle: 0 },
      { x: 1450, y: 2300, text: 'TIDEWATER MARKET', color: '#ffcf5c', angle: 0 },
    );

    for (const [key, point] of Object.entries(L)) {
      this.pois.push({ x: point.x, y: point.y, name: point.name, type: point.icon || key, landmark: key });
      this.spawnPoints.push({ x: point.x + 70, y: point.y + 72, name: point.name });
    }
  }

  generateFoliage() {
    for (let y = 50; y < 3150; y += 62) {
      this.palmTrees.push({ x: 2338 + this.rng() * 10, y: y + this.rng() * 8, size: 22 + this.rng() * 7 });
      this.palmTrees.push({ x: 2462 + this.rng() * 12, y: y + 22 + this.rng() * 8, size: 21 + this.rng() * 7 });
    }
    for (let y = 60; y < 3140; y += 84) {
      this.palmTrees.push({ x: 2616 + this.rng() * 52, y: y + this.rng() * 30, size: 24 + this.rng() * 9 });
    }
    for (let x = 70; x < 1060; x += 92) {
      for (let y = 70; y < 1400; y += 106) {
        if (this.rng() > 0.52) this.palmTrees.push({ x: x + this.rng() * 24, y: y + this.rng() * 24, size: 18 + this.rng() * 7 });
      }
    }
    for (let i = 0; i < 52; i += 1) {
      this.palmTrees.push({ x: range(this.rng, 60, 2380), y: range(this.rng, 60, 3140), size: range(this.rng, 17, 28) });
    }

    for (const road of this.roads) {
      const step = road.kind === 'highway' ? 170 : 145;
      const len = Math.hypot(road.x2 - road.x1, road.y2 - road.y1);
      const count = Math.floor(len / step);
      for (let i = 0; i < count; i += 1) {
        const t = (i + 0.5) / count;
        const x = road.x1 + (road.x2 - road.x1) * t;
        const y = road.y1 + (road.y2 - road.y1) * t;
        if (this.nearIntersection(x, y, 62)) continue;
        if (road.horizontal) {
          this.streetlights.push({ x, y: y - road.half - 8, color: '#ffe3a6', radius: road.kind === 'highway' ? 135 : 108, tall: road.kind === 'highway' });
          if (road.width > 80) this.streetlights.push({ x: x + 40, y: y + road.half + 8, color: '#ffe3a6', radius: 104 });
        } else {
          this.streetlights.push({ x: x + road.half + 8, y, color: '#ffe3a6', radius: road.kind === 'highway' ? 135 : 108, tall: road.kind === 'highway' });
          if (road.width > 80) this.streetlights.push({ x: x - road.half - 8, y: y + 34, color: '#ffe3a6', radius: 104 });
        }
      }
    }

    for (let y = 90; y < 3120; y += 118) {
      if (this.rng() > 0.5) this.props.push({ type: 'bench', x: 2522, y, angle: 0 });
      if (this.rng() > 0.58) {
        this.props.push({
          type: 'umbrella', x: 2630 + this.rng() * 70, y: y + 30,
          color: pick(this.rng, ['#ff7f9e', '#5ce1e6', '#ffd166', '#f4f1e8']),
        });
      }
    }

    for (const block of this.blocks) {
      if (block.kind === 'industry' || block.kind === 'containers') {
        for (let i = 0; i < 4; i += 1) {
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
      if (block.district === 'market_row' && this.rng() > 0.4) {
        this.props.push({ type: 'stall', x: block.xMin + 40, y: block.yMax - 30, angle: 0 });
      }
    }
    for (let i = 0; i < 26; i += 1) {
      const road = pick(this.rng, this.roads);
      const t = range(this.rng, 0.1, 0.9);
      const side = this.rng() > 0.5 ? 1 : -1;
      if (road.horizontal) {
        this.props.push({
          type: 'newsbox', x: road.x1 + (road.x2 - road.x1) * t,
          y: road.y1 + side * (road.width / 2 + 20), angle: 0,
        });
      }
    }
  }

  generateParking() {
    for (const road of this.roads) {
      const len = Math.hypot(road.x2 - road.x1, road.y2 - road.y1);
      const count = Math.floor(len / 205);
      for (let i = 1; i < count; i += 1) {
        const t = i / count;
        const side = i % 2 === 0 ? 1 : -1;
        let x;
        let y;
        let angle;
        if (road.horizontal) {
          x = road.x1 + (road.x2 - road.x1) * t;
          y = road.y1 + side * (road.width / 2 - 17);
          angle = side > 0 ? Math.PI : 0;
        } else {
          x = road.x1 - side * (road.width / 2 - 17);
          y = road.y1 + (road.y2 - road.y1) * t;
          angle = side > 0 ? Math.PI / 2 : -Math.PI / 2;
        }
        if (x < 34 || x > 2652 || y < 34 || y > 3166) continue;
        if (this.nearIntersection(x, y, 76)) continue;
        if (this.pointBlocked(x, y, 40)) continue;
        this.parkingSpots.push({ x, y, angle, occupied: false });
      }
    }
  }

  generateBeachDetail() {
    for (let i = 0; i < 340; i += 1) {
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
    for (let i = 0; i < 26; i += 1) {
      this.props.push({
        type: 'towel',
        x: 2570 + this.rng() * 116,
        y: 100 + i * 122 + Math.sin(i) * 26,
        color: pick(this.rng, ['#ff9db0', '#7ee0e6', '#ffd166', '#f4f1e8', '#8fe3a3']),
        angle: Math.sin(i) * 0.6,
      });
    }
  }

  generatePuddles() {
    for (const road of this.roads) {
      const len = Math.hypot(road.x2 - road.x1, road.y2 - road.y1);
      const count = Math.floor(len / 260);
      for (let i = 0; i < count; i += 1) {
        const t = range(this.rng, 0.05, 0.95);
        const x = road.x1 + (road.x2 - road.x1) * t + (road.horizontal ? 0 : range(this.rng, -road.half * 0.5, road.half * 0.5));
        const y = road.y1 + (road.y2 - road.y1) * t + (road.horizontal ? range(this.rng, -road.half * 0.5, road.half * 0.5) : 0);
        if (this.nearIntersection(x, y, 40)) continue;
        this.puddles.push({
          x, y,
          rx: range(this.rng, 16, 54),
          ry: range(this.rng, 5, 18),
          angle: road.horizontal ? range(this.rng, -0.12, 0.12) : Math.PI / 2 + range(this.rng, -0.12, 0.12),
          alpha: range(this.rng, 0.14, 0.34),
          seed: this.rng() * 100,
        });
      }
    }
  }

  generateRamps() {
    const candidates = [
      { x: 1080, y: 1400, angle: 0, name: 'GRAND SLAM' },
      { x: 2400, y: 2020, angle: -Math.PI / 2, name: 'OCEAN AIR' },
      { x: 1200, y: 1860, angle: Math.PI / 2, name: 'MERIDIAN DROP' },
      { x: 600, y: 2200, angle: 0, name: 'DRYDOCK HOP' },
      { x: 2000, y: 2600, angle: Math.PI, name: 'TERMINAL LAUNCH' },
      { x: 2400, y: 640, angle: -Math.PI / 2, name: 'PELICAN LIFT' },
      { x: 760, y: 1400, angle: Math.PI, name: 'ESTATE JUMP' },
      { x: 1600, y: 1050, angle: 0, name: 'VANTAGE KICKER' },
      { x: 120, y: 1500, angle: Math.PI / 2, name: 'LOOP RAMP' },
    ];
    for (const c of candidates) {
      this.ramps.push({
        x: c.x,
        y: c.y,
        angle: c.angle,
        w: 58,
        h: 34,
        name: c.name,
        use: 0,
      });
    }
    this.stuntRoutes.push(
      { from: { x: 1500, y: 1400 }, to: { x: 2100, y: 1400 }, name: 'Grand Avenue run' },
      { from: { x: 2400, y: 2200 }, to: { x: 2400, y: 1600 }, name: 'Ocean Boulevard drop' },
      { from: { x: 900, y: 2200 }, to: { x: 2000, y: 2200 }, name: 'Drydock straight' },
    );
  }

  generateCollectibles() {
    const candidates = [
      { x: 2524, y: 1500, name: 'Boardwalk tape' },
      { x: 2960, y: 1660, name: 'Pier tape' },
      { x: 720, y: 600, name: 'Park tape' },
      { x: 2860, y: 2200, name: 'Marina tape' },
      { x: 1260, y: 1240, name: 'Safehouse tape' },
      { x: 1660, y: 1300, name: 'Plaza tape' },
      { x: 2320, y: 2480, name: 'Dock tape' },
      { x: 2580, y: 900, name: 'Beach tape' },
      { x: 2540, y: 600, name: 'Estate tape' },
      { x: 1520, y: 2260, name: 'Market tape' },
      { x: 500, y: 2700, name: 'Ironworks tape' },
      { x: 900, y: 3000, name: 'South Ring tape' },
      { x: 2050, y: 1880, name: 'Vantage tape' },
      { x: 300, y: 760, name: 'Garden tape' },
      { x: 2300, y: 660, name: 'Pelican tape' },
      { x: 1850, y: 2860, name: 'Drydock tape' },
    ];
    for (const c of candidates) {
      if (this.collectibleSpots.length >= 12) break;
      let spot = { x: c.x, y: c.y, name: c.name };
      if (this.pointBlocked(spot.x, spot.y, 20)) {
        const nudges = [[34, 0], [-34, 0], [0, 34], [0, -34], [52, 40], [-52, -40]];
        for (const [dx, dy] of nudges) {
          if (!this.pointBlocked(spot.x + dx, spot.y + dy, 20)) {
            spot = { x: spot.x + dx, y: spot.y + dy, name: spot.name };
            break;
          }
        }
      }
      if (this.pointBlocked(spot.x, spot.y, 20)) continue;
      this.collectibleSpots.push(spot);
    }
  }

  generateGarages() {
    this.garages = [
      { x: 520, y: 2380, name: 'Rustline Garage' },
      { x: 1400, y: 1650, name: 'Sabal Auto Works' },
      { x: 2330, y: 960, name: 'Coral Customs' },
    ];
  }

  generatePois() {
    const extra = [
      { x: 760, y: 560, name: 'Sabal Palms Park', type: 'tree' },
      { x: 2812, y: 2320, name: 'Quay Marina', type: 'anchor' },
      { x: 2050, y: 3050, name: 'Tidewater Market', type: 'shop' },
      { x: 560, y: 2950, name: 'South Ring Fuel', type: 'fuel' },
      { x: 1560, y: 470, name: 'North Ring Fuel', type: 'fuel' },
      { x: 2524, y: 1660, name: 'Coral Boardwalk', type: 'wave' },
      { x: 520, y: 2300, name: 'Rustline Garage', type: 'wrench' },
      { x: 1400, y: 1650, name: 'Sabal Auto Works', type: 'wrench' },
      { x: 2330, y: 960, name: 'Coral Customs', type: 'wrench' },
    ];
    for (const p of extra) if (!this.pois.some((q) => q.name === p.name)) this.pois.push(p);
    this.spawnPoints.push(
      { x: 2540, y: 1420, name: 'Coral Strip' },
      { x: 1760, y: 1500, name: 'Vantage Plaza' },
      { x: 340, y: 2500, name: 'Ironworks' },
      { x: 2300, y: 2460, name: 'Pier 9' },
      { x: 1380, y: 1360, name: 'Sabal Safehouse' },
      { x: 2524, y: 1700, name: 'Coral Boardwalk' },
      { x: 2200, y: 800, name: 'Pelican Pier' },
    );
  }

  buildSpatialGrid() {
    for (const b of this.buildings) {
      this.insertCollider({ x: b.x, y: b.y, w: b.w, h: b.h, type: 'building', ref: b });
    }
    for (const w of this.waterZones) {
      this.insertCollider({ x: w.x, y: w.y, w: w.w, h: w.h, type: 'water', ref: w });
    }
  }

  // ------------------------------------------------------------------
  // Queries
  // ------------------------------------------------------------------
  nearIntersection(x, y, radius) {
    for (const i of this.intersections) {
      if (Math.abs(x - i.x) < radius && Math.abs(y - i.y) < radius) return true;
    }
    return false;
  }

  buildingAt(x, y, radius = 10) {
    for (const b of this.buildings) {
      if (Math.abs(x - b.x) < b.w / 2 + radius && Math.abs(y - b.y) < b.h / 2 + radius) return b;
    }
    return null;
  }

  pointBlocked(x, y, radius = 10) {
    if (this.buildings.length > 0 && this.buildingAt(x, y, radius)) return true;
    if (this.isWater(x, y)) return true;
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
    return x > 2480 && x < 2720 && !this.isWater(x, y);
  }

  isRoad(x, y) {
    for (const r of this.roads) {
      if (r.horizontal && Math.abs(y - r.y1) < r.half) return r;
      if (!r.horizontal && Math.abs(x - r.x1) < r.half) return r;
    }
    return null;
  }

  // Nearest garage to a point, for the repair prompt.
  nearestGarage(x, y, radius = 140) {
    let best = null;
    let bestD = radius;
    for (const g of this.garages) {
      const d = Math.hypot(g.x - x, g.y - y);
      if (d < bestD) {
        bestD = d;
        best = g;
      }
    }
    return best ? { garage: best, distance: bestD, cost: GARAGE_CONFIG.repairCost } : null;
  }

  onClick() {
    return false;
  }

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
    const hit = this.raycast(x1, y1, x2, y2, 24);
    return !hit || hit.hitType !== 'building';
  }

  seesPoint(x, y, angle, tx, ty, radius = 520, cone = 1.15) {
    const dx = tx - x;
    const dy = ty - y;
    const d = Math.hypot(dx, dy);
    if (d > radius || d < 1) return d <= radius;
    const dot = Math.cos(angle) * (dx / d) + Math.sin(angle) * (dy / d);
    if (dot < Math.cos(cone) && d > 90) return false;
    return this.hasLineOfSight(x, y, tx, ty, radius);
  }

  randomRoadPoint(centerX, centerY, minDist, maxDist, rng = this.rng) {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const road = pick(rng, this.roads);
      const t = range(rng, 0.05, 0.95);
      const x = road.x1 + (road.x2 - road.x1) * t;
      const y = road.y1 + (road.y2 - road.y1) * t;
      const d = Math.hypot(x - centerX, y - centerY);
      if (d >= minDist && d <= maxDist && x > 40 && x < 2660 && y > 40 && y < 3160) {
        return {
          x, y,
          angle: road.horizontal ? (road.dirX > 0 ? 0 : Math.PI) : (road.dirY > 0 ? Math.PI / 2 : -Math.PI / 2),
          road,
        };
      }
    }
    return { x: Math.max(60, Math.min(2600, centerX + minDist)), y: Math.max(60, Math.min(3160, centerY)), angle: 0 };
  }

  sidewalkPoint(centerX, centerY, radius = 900, rng = this.rng) {
    for (let attempt = 0; attempt < 48; attempt += 1) {
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
      if (this.pointBlocked(x, y, 10)) continue;
      return { x, y, angle, road };
    }
    return { x: centerX + 30, y: centerY + 30, angle: 0, road: this.roads[0] };
  }

  lanePoint(road, t, direction) {
    if (road.horizontal) {
      return { x: road.x1 + (road.x2 - road.x1) * t, y: road.y1 + direction * (road.width / 4), angle: direction > 0 ? 0 : Math.PI };
    }
    return { x: road.x1 - direction * (road.width / 4), y: road.y1 + (road.y2 - road.y1) * t, angle: direction > 0 ? Math.PI / 2 : -Math.PI / 2 };
  }

  districtAt(x, y) {
    return districtAt(x, y);
  }

  addSkidMark(x, y, angle, alpha = 0.5) {
    this.skidMarks.push({ x, y, angle, alpha, age: 0 });
    if (this.skidMarks.length > 560) this.skidMarks.shift();
  }

  rampAt(x, y, radius = 40) {
    for (const ramp of this.ramps) {
      if (Math.hypot(ramp.x - x, ramp.y - y) < radius) return ramp;
    }
    return null;
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
      if (s.age > 24) this.skidMarks.splice(i, 1);
    }
    void time;
  }

  hash(x, y, salt = 0) {
    return hash2(x, y, salt + this.seed);
  }

  chance(p) {
    return chance(this.rng, p);
  }
}

export { DISTRICTS };
