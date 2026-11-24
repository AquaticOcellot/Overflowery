export const chunkSize = 64;
export const defaultWorldSeed = 731942;
export const waterLevel = 0.2;
export const flowerSpecies = ['blue', 'yellow', 'purple', 'red'] as const;
export type WorldFlower = typeof flowerSpecies[number];
export type WorldTile = { x: number; y: number; elevation: number; watering: number; terrain: 'land' | 'water'; shade: number; grass: boolean; flower?: WorldFlower; growth: number };
export type WorldChunk = { x: number; y: number; tiles: WorldTile[] };

export function chunkCoordinate(tile: number) { return Math.floor(tile / chunkSize); }
export const chunkKey = (x: number, y: number) => `${x},${y}`;

// Coordinate hashing keeps generation independent of exploration order and Math.random.
function noise(x: number, y: number, seed: number) {
  let value = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ seed;
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}

const gradients = [[1, 0], [-1, 0], [0, 1], [0, -1],
  [Math.SQRT1_2, Math.SQRT1_2], [-Math.SQRT1_2, Math.SQRT1_2],
  [Math.SQRT1_2, -Math.SQRT1_2], [-Math.SQRT1_2, -Math.SQRT1_2]];

function perlinNoise(x: number, y: number, scale: number, seed: number) {
  const sx = x / scale, sy = y / scale;
  const gx = Math.floor(sx), gy = Math.floor(sy);
  const fx = sx - gx, fy = sy - gy;
  const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
  const dot = (dx: number, dy: number) => {
    const gradient = gradients[Math.floor(noise(gx + dx, gy + dy, seed) * gradients.length)];
    return gradient[0] * (fx - dx) + gradient[1] * (fy - dy);
  };
  const u = fade(fx), v = fade(fy);
  const top = dot(0, 0) * (1 - u) + dot(1, 0) * u;
  const bottom = dot(0, 1) * (1 - u) + dot(1, 1) * u;
  return Math.max(0, Math.min(1, 0.5 + (top * (1 - v) + bottom * v) * Math.SQRT1_2));
}

export const isWater = (elevation: number, globalMoisture: number) => elevation < waterLevel && globalMoisture > 0.5;

export function globalMoistureAt(x: number, y: number, seed = defaultWorldSeed) {
  return perlinNoise(x - 137.3, y + 83.7, 32, seed + 0x6d2b79f5);
}

export function isWaterAt(x: number, y: number, seed = defaultWorldSeed) {
  return isWater(elevationAt(x, y, seed), globalMoistureAt(x, y, seed));
}

export function elevationAt(x: number, y: number, seed = defaultWorldSeed) {
  const natural = perlinNoise(x + 13.7, y - 29.3, 24, seed);
  // Keep the starting area on raised ground.
  const starterRise = 0.25 * Math.max(0, 1 - Math.max(0, Math.hypot(x, y) - 13) / 10);
  return Math.max(natural, starterRise);
}

const species = flowerSpecies;
const baseSpreads = {
  blue: [0.10, 0.13], yellow: [0.13, 0.11], purple: [0.12, 0.10], red: [0.115, 0.115],
} as const;
type GrowthNiche = Readonly<{ elevation: number; watering: number; elevationSpread: number; wateringSpread: number }>;
const nicheCache = new Map<string, Readonly<Record<WorldFlower, GrowthNiche>>>();

// Exposed for simulation tools; never surfaced in the player UI.
export function growthNiche(flower: WorldFlower, seed = defaultWorldSeed, purpose: 'growth' | 'quality' = 'growth'): GrowthNiche {
  const cacheKey = `${seed}:${purpose}`;
  let niches = nicheCache.get(cacheKey);
  if (!niches) {
    const traitSeed = seed + (purpose === 'quality' ? 0x51f15e : 0);
    const generated = species.map((id, index) => {
      const elevation = 0.24 + noise(index, 11, traitSeed + 101) * 0.6;
      // Preferences target the visible watering level, independently of elevation.
      const watering = 0.20 + noise(index, 23, traitSeed + 103) * 0.6;
      return {
        id, elevation, watering,
        elevationSpread: baseSpreads[id][0] * (1.5 + noise(index, 37, traitSeed + 107)),
        wateringSpread: baseSpreads[id][1] * (1.5 + noise(index, 47, traitSeed + 109)),
      };
    });
    const originalWidth = species.reduce((sum, id) => sum + baseSpreads[id][0] + baseSpreads[id][1], 0);
    const generatedWidth = generated.reduce((sum, niche) => sum + niche.elevationSpread + niche.wateringSpread, 0);
    const scale = 2 * originalWidth / generatedWidth;
    niches = Object.freeze(Object.fromEntries(generated.map(({ id, ...niche }) => [id, Object.freeze({
      ...niche, elevationSpread: niche.elevationSpread * scale, wateringSpread: niche.wateringSpread * scale,
    })])) as Record<WorldFlower, GrowthNiche>);
    nicheCache.set(cacheKey, niches);
  }
  return niches[flower];
}

export function environmentQuality(flower: WorldFlower, elevation: number, watering: number, seed = defaultWorldSeed) {
  const niche = growthNiche(flower, seed, 'quality');
  const distance = ((elevation - niche.elevation) / niche.elevationSpread) ** 2 + ((watering - niche.watering) / niche.wateringSpread) ** 2;
  return 1 + Math.exp(-0.5 * distance);
}

export function environmentGrowth(flower: WorldFlower, elevation: number, watering: number, seed = defaultWorldSeed) {
  const niche = growthNiche(flower, seed);
  const heightDistance = (elevation - niche.elevation) / niche.elevationSpread;
  const wateringDistance = (watering - niche.watering) / niche.wateringSpread;
  return 1 + 2 * Math.exp(-0.5 * (heightDistance ** 2 + wateringDistance ** 2));
}

export const wateringRadius = 16;

// Sample a padded area directly so results never depend on explored neighbors.
function chunkWatering(cx: number, cy: number, seed: number) {
  const size = chunkSize + wateringRadius * 2;
  const distances = new Int16Array(size * size).fill(-1);
  const queue: number[] = [];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    if (!isWaterAt(cx * chunkSize + x - wateringRadius, cy * chunkSize + y - wateringRadius, seed)) continue;
    const index = y * size + x;
    distances[index] = 0;
    queue.push(index);
  }
  for (let head = 0; head < queue.length; head++) {
    const index = queue[head], x = index % size, y = Math.floor(index / size);
    if (distances[index] >= wateringRadius) continue;
    for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
      const next = ny * size + nx;
      if (distances[next] >= 0) continue;
      distances[next] = distances[index] + 1;
      queue.push(next);
    }
  }
  return (x: number, y: number) => {
    const distance = distances[(y + wateringRadius) * size + x + wateringRadius];
    return distance < 0 ? 0 : Math.max(0, 1 - distance / wateringRadius);
  };
}

const patchSpacing = 32;

// Patch metadata is coordinate-seeded so large patches cross chunk seams intact.
export function wildFlowerPatch(px: number, py: number, seed = defaultWorldSeed) {
  if (noise(px, py, seed + 2) < 0.55) return;
  return {
    x: px * patchSpacing + 4 + noise(px, py, seed + 3) * 24,
    y: py * patchSpacing + 4 + noise(px, py, seed + 4) * 24,
    radius: 4 + noise(px, py, seed + 5) * 3,
    flower: species[Math.floor(noise(px, py, seed + 7) * species.length)],
  };
}

function flowerAt(x: number, y: number, seed: number): WorldFlower | undefined {
  // Keep only the central building clearing; all flowers use wild generation.
  if (Math.abs(x) <= 1 && Math.abs(y) <= 1) return;
  const gx = Math.floor(x / patchSpacing), gy = Math.floor(y / patchSpacing);
  for (let py = gy - 1; py <= gy + 1; py++) for (let px = gx - 1; px <= gx + 1; px++) {
    const patch = wildFlowerPatch(px, py, seed);
    if (!patch) continue;
    const distance = Math.hypot(x - patch.x, y - patch.y) / patch.radius;
    if (distance >= 1) continue;
    // Dense inner third, then a smooth fade to scattered flowers at the rim.
    const fade = Math.max(0, (distance - 0.35) / 0.65);
    const density = 0.92 * (1 - fade * fade * (3 - 2 * fade));
    if (noise(x, y, seed + 6) < density) return patch.flower;
  }
}

function blendColor(from: number, to: number, amount: number) {
  const t = Math.max(0, Math.min(1, amount));
  const channel = (shift: number) => Math.round(((from >> shift) & 255) * (1 - t) + ((to >> shift) & 255) * t);
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

function landColor(elevation: number, watering: number) {
  elevation = Math.round(elevation * 10) / 10;
  watering = Math.round(watering * 10) / 10;
  const stops = [
    [0.2, 0x405e38], [0.42, 0x576f43], [0.58, 0x79674a],
    [0.74, 0x9d8a70], [0.86, 0xc3c4b8], [1, 0xeeeFE7],
  ];
  let color = stops[stops.length - 1][1];
  for (let i = 1; i < stops.length; i++) {
    if (elevation <= stops[i][0]) {
      color = blendColor(stops[i - 1][1], stops[i][1], (elevation - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0]));
      break;
    }
  }
  // Preserve the pale mountain silhouette while making wet lowlands dark and lush.
  const lowland = Math.max(0, Math.min(1, (0.88 - elevation) / 0.28));
  const wetness = Math.max(0, Math.min(1, (watering - 0.5) / 0.35));
  color = blendColor(color, 0x244d3d, wetness * 0.8 * lowland);
  return blendColor(color, 0x958150, Math.max(0, (0.4 - watering) / 0.4) * 0.35 * lowland);
}

export function generateChunk(cx: number, cy: number, seed = defaultWorldSeed): WorldChunk {
  const tiles: WorldTile[] = [];
  const waterPalette = [0x102b3a, 0x15394a, 0x1d4858];
  const wateringAt = chunkWatering(cx, cy, seed);
  for (let ly = 0; ly < chunkSize; ly++) for (let lx = 0; lx < chunkSize; lx++) {
    const x = cx * chunkSize + lx, y = cy * chunkSize + ly;
    const elevation = elevationAt(x, y, seed);
    const watering = wateringAt(lx, ly);
    const water = watering === 1;
    tiles.push({
      x, y, elevation, watering, terrain: water ? 'water' : 'land',
      shade: water ? waterPalette[Math.min(2, Math.floor(elevation / waterLevel * 3))] : landColor(elevation, watering),
      grass: !water && noise(x, y, seed + 8) > 0.9,
      flower: water ? undefined : flowerAt(x, y, seed),
      growth: noise(x, y, seed + 9) > 0.65 ? 1 : 0.3 + noise(x, y, seed + 10) * 0.6,
    });
  }
  return { x: cx, y: cy, tiles };
}

export function viewChunkBounds(x: number, y: number, width: number, height: number, cellSize: number, padding = 1) {
  return {
    minX: chunkCoordinate(Math.floor((x - width / 2) / cellSize + 0.5)) - padding,
    maxX: chunkCoordinate(Math.floor((x + width / 2) / cellSize + 0.5)) + padding,
    minY: chunkCoordinate(Math.floor((y - height / 2) / cellSize + 0.5)) - padding,
    maxY: chunkCoordinate(Math.floor((y + height / 2) / cellSize + 0.5)) + padding,
  };
}

export class ChunkWorld {
  readonly chunks = new Map<string, WorldChunk>();
  constructor(readonly seed = defaultWorldSeed) {}

  getChunk(x: number, y: number) {
    const key = chunkKey(x, y);
    let chunk = this.chunks.get(key);
    if (!chunk) { chunk = generateChunk(x, y, this.seed); this.chunks.set(key, chunk); }
    return chunk;
  }

  getTile(x: number, y: number) {
    const cx = chunkCoordinate(x), cy = chunkCoordinate(y);
    return this.getChunk(cx, cy).tiles[(y - cy * chunkSize) * chunkSize + x - cx * chunkSize];
  }

  ensureView(x: number, y: number, width: number, height: number, cellSize: number) {
    const bounds = viewChunkBounds(x, y, width, height, cellSize);
    const chunks: WorldChunk[] = [];
    for (let cy = bounds.minY; cy <= bounds.maxY; cy++) for (let cx = bounds.minX; cx <= bounds.maxX; cx++) chunks.push(this.getChunk(cx, cy));
    return chunks;
  }
}
