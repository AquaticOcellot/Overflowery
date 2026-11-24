import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../src/world.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
const { flowerSpecies, chunkSize, ChunkWorld, generateChunk, chunkCoordinate, chunkKey, viewChunkBounds, elevationAt, isWater, isWaterAt, globalMoistureAt, wateringRadius, environmentGrowth, growthNiche, wildFlowerPatch } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

test('negative tile coordinates map to the correct 64x64 chunks', () => {
  for (const [tile, expected] of [[0, 0], [chunkSize - 1, 0], [chunkSize, 1], [-1, -1], [-chunkSize, -1], [-chunkSize - 1, -2]]) assert.equal(chunkCoordinate(tile), expected);
});

test('every chunk has the expected unique global tiles with no overlap at negative seams', () => {
  const keys = new Set();
  for (const cx of [-1, 0, 1]) for (const cy of [-1, 0, 1]) {
    const chunk = generateChunk(cx, cy);
    assert.equal(chunk.tiles.length, chunkSize ** 2);
    for (const tile of chunk.tiles) {
      assert.equal(chunkCoordinate(tile.x), cx);
      assert.equal(chunkCoordinate(tile.y), cy);
      const key = `${tile.x},${tile.y}`;
      assert.equal(keys.has(key), false);
      keys.add(key);
    }
  }
  assert.equal(keys.size, 9 * chunkSize ** 2);
});

test('generation is reproducible and independent of exploration order', () => {
  const first = new ChunkWorld(123), second = new ChunkWorld(123);
  first.getChunk(0, 0);
  first.getChunk(25, -39);
  second.getChunk(25, -39);
  second.getChunk(0, 0);
  assert.deepEqual(first.getChunk(25, -39), second.getChunk(25, -39));
  assert.deepEqual(first.getChunk(0, 0), second.getChunk(0, 0));
  assert.notDeepEqual(generateChunk(25, -39, 123), generateChunk(25, -39, 124));
});

test('origin retains a building clearing without guaranteed starter species', () => {
  const world = new ChunkWorld();
  const chunks = world.ensureView(0, 0, 960, 960, 48);
  const tiles = chunks.flatMap((chunk) => chunk.tiles);
  assert.equal(tiles.find((tile) => tile.x === 0 && tile.y === 0).flower, undefined);
  const species = new Set(tiles.filter((tile) => Math.hypot(tile.x, tile.y) < 13 && tile.flower).map((tile) => tile.flower));
  assert.ok(species.size < 5);
  for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) assert.equal(world.getTile(x, y).flower, undefined);
});

test('view generation includes a one-chunk border, expands on zoom-out, and caches revisits', () => {
  const world = new ChunkWorld();
  const bounds = viewChunkBounds(0, 0, 960, 540, 48);
  assert.ok(bounds.minX * chunkSize <= -10 - chunkSize);
  assert.ok((bounds.maxX + 1) * chunkSize >= 10 + chunkSize);
  const initial = world.ensureView(0, 0, 960, 540, 48);
  const count = world.chunks.size;
  const original = world.getChunk(0, 0);
  world.ensureView(0, 0, 960, 540, 48);
  assert.equal(world.chunks.size, count);
  world.ensureView(-5000, 8000, 960, 540, 48);
  assert.ok(world.chunks.size > count);
  assert.equal(world.getChunk(0, 0), original);
  const wider = world.ensureView(0, 0, 9600, 5400, 48);
  assert.ok(wider.length > initial.length);
  assert.equal(world.chunks.get(chunkKey(0, 0)), original);
});

test('water requires both strictly low elevation and strictly high watering', () => {
  assert.equal(isWater(0, 1), true);
  assert.equal(isWater(.199999, .500001), true);
  assert.equal(isWater(.2, 1), false);
  assert.equal(isWater(0, .5), false);
  assert.equal(isWater(0, .499999), false);
  assert.equal(isWater(1, 1), false);
});

test('only wet low terrain becomes water; both layers agree across chunk seams', () => {
  let waterCount = 0, landCount = 0;
  for (let cy = -4; cy <= 4; cy++) for (let cx = -4; cx <= 4; cx++) {
    for (const tile of generateChunk(cx, cy).tiles) {
      assert.equal(tile.elevation, elevationAt(tile.x, tile.y));
      assert.equal('moisture' in tile, false);
      assert.ok(tile.watering >= 0 && tile.watering <= 1);
      assert.equal(tile.terrain === 'water', tile.elevation < 0.2 && globalMoistureAt(tile.x, tile.y) > .5);
      assert.equal(tile.terrain === 'water', isWaterAt(tile.x, tile.y));
      if (tile.terrain === 'water') {
        waterCount++;
        assert.equal(tile.flower, undefined);
        assert.equal(tile.grass, false);
      } else landCount++;
    }
  }
  assert.ok(waterCount > 0);
  assert.ok(landCount > 0);
});

test('tile lookup supports signed coordinates and the starter clearing stays dry for different seeds', () => {
  for (const seed of [0, 1, 123, 731942]) {
    const world = new ChunkWorld(seed);
    assert.equal(world.getTile(0, 0).terrain, 'land');
    for (const x of [-17, -16, -1, 0, 15, 16]) {
      const tile = world.getTile(x, -17);
      assert.equal(tile.x, x);
      assert.equal(tile.y, -17);
      assert.equal(tile.elevation, elevationAt(x, -17, seed));
    }
  }
});

test('hidden global moisture and elevation still independently determine water', () => {
  let lowDry = 0, lowWet = 0, highDry = 0, highWet = 0;
  for (let y = -256; y <= 256; y += 4) for (let x = -256; x <= 256; x += 4) {
    const elevation = elevationAt(x, y), watering = globalMoistureAt(x, y);
    assert.ok(elevation >= 0 && elevation <= 1);
    assert.ok(watering >= 0 && watering <= 1);
    if (elevation < .2) { if (watering > .5) lowWet++; else lowDry++; }
    if (elevation > .7) { if (watering > .6) highWet++; if (watering < .4) highDry++; }
  }
  assert.ok(lowDry > 0 && lowWet > 0 && highDry > 0 && highWet > 0);
  assert.equal(globalMoistureAt(-17, 16, 123), globalMoistureAt(-17, 16, 123));
  assert.notEqual(globalMoistureAt(-17, 16, 123), globalMoistureAt(-17, 16, 124));
});

test('both noise layers remain smooth across positive and negative chunk seams', () => {
  for (const sample of [elevationAt, globalMoistureAt]) for (const x of [-32, -16, 0, 16, 32]) {
    for (let y = -64; y <= 64; y += 3) {
      assert.ok(Math.abs(sample(x - .001, y) - sample(x + .001, y)) < .001);
      assert.ok(Math.abs(sample(y, x - .001) - sample(y, x + .001)) < .001);
    }
  }
});

test('each species has a distinct two-dimensional sweet spot with a 3x peak', () => {
  const peaks = flowerSpecies.map((flower) => { const niche = growthNiche(flower); return [flower, niche.elevation, niche.watering]; });
  for (const [flower, elevation, watering] of peaks) {
    assert.equal(environmentGrowth(flower, elevation, watering), 3);
    assert.ok(environmentGrowth(flower, elevation + 0.1, watering) < 3);
    assert.ok(environmentGrowth(flower, elevation, watering - 0.1) < 3);
    for (const [other] of peaks) if (other !== flower) assert.ok(environmentGrowth(other, elevation, watering) < 3);
  }
});

test('environment bonus falls smoothly with distance on both axes and diagonally', () => {
  for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [-1, 1]]) {
    let previous = 3;
    for (const distance of [0.02, 0.05, 0.1, 0.2]) {
      const niche = growthNiche('yellow');
      const value = environmentGrowth('yellow', niche.elevation + dx * distance, niche.watering + dy * distance);
      assert.ok(value < previous);
      assert.ok(value >= 1 && value <= 3);
      previous = value;
    }
  }
});

test('all environment combinations stay between normal speed and 3x speed', () => {
  for (const flower of flowerSpecies) {
    for (let elevation = 0.2; elevation <= 1; elevation += 0.05) {
      for (let watering = 0; watering <= 1; watering += 0.05) {
        const value = environmentGrowth(flower, elevation, watering);
        assert.ok(Number.isFinite(value) && value >= 1 && value <= 3);
        assert.equal(value, environmentGrowth(flower, elevation, watering));
      }
    }
  }
  const niche = growthNiche('blue');
  assert.ok(environmentGrowth('blue', niche.elevation + niche.elevationSpread * 5, niche.watering) < 1.001);
});

test('niches are seed-derived, reproducible, and retain 3x peaks for every species', () => {
  for (const flower of flowerSpecies) {
    const first = growthNiche(flower, 123), second = growthNiche(flower, 124);
    assert.deepEqual(growthNiche(flower, 123), first);
    assert.notEqual(first.elevation, second.elevation);
    assert.notEqual(first.watering, second.watering);
    assert.equal(environmentGrowth(flower, first.elevation, first.watering, 123), 3);
    assert.ok(environmentGrowth(flower, first.elevation, first.watering, 124) < 3);
    assert.ok(Object.isFrozen(first));
  }
});

test('seeded spreads average exactly twice the previous widths and keep optima on land', () => {
  for (let seed = 0; seed < 100; seed++) {
    let width = 0;
    for (const flower of flowerSpecies) {
      const niche = growthNiche(flower, seed);
      width += niche.elevationSpread + niche.wateringSpread;
      assert.ok(niche.elevation >= 0.24 && niche.elevation <= 0.84);
      assert.ok(niche.watering > 0 && niche.watering < 1);
      assert.ok(niche.elevationSpread > 0 && niche.wateringSpread > 0);
    }
    assert.ok(Math.abs(width / (flowerSpecies.length * 2) - 0.23) < 1e-12);
  }
});


test('wild patches are sparse, compact, reproducible and feathered at their edges', () => {
  const world = new ChunkWorld();
  let patches = 0, core = 0, coreFlowers = 0, edge = 0, edgeFlowers = 0;
  for (let py = 4; py < 14; py++) for (let px = 4; px < 14; px++) {
    const patch = wildFlowerPatch(px, py);
    assert.deepEqual(patch, wildFlowerPatch(px, py));
    if (!patch) continue;
    patches++;
    assert.ok(patch.radius >= 4 && patch.radius < 7);
    for (let y = Math.ceil(patch.y - patch.radius); y <= patch.y + patch.radius; y++) {
      for (let x = Math.ceil(patch.x - patch.radius); x <= patch.x + patch.radius; x++) {
        const distance = Math.hypot(x - patch.x, y - patch.y) / patch.radius;
        if (distance >= 1 || (distance > .35 && distance < .85)) continue;
        const tile = world.getTile(x, y);
        if (tile.terrain === 'water') continue;
        if (distance <= .35) { core++; coreFlowers += Number(tile.flower === patch.flower); }
        else { edge++; edgeFlowers += Number(tile.flower === patch.flower); }
      }
    }
  }
  // About 45 patches per 102,400 tiles, versus ~462 with the previous spacing.
  assert.ok(patches >= 30 && patches <= 60);
  assert.ok(core > 100 && edge > 300);
  assert.ok(coreFlowers / core > .8);
  assert.ok(edgeFlowers / edge < .2);
});

test('watering measures nearest actual water across chunk boundaries and fades to zero', () => {
  const world = new ChunkWorld();
  let dry = 0, watered = 0, water = 0;
  let waterTile;
  for (let y = -128; y <= 128 && !waterTile; y++) for (let x = -128; x <= 128; x++) {
    if (isWaterAt(x, y)) { waterTile = world.getTile(x, y); break; }
  }
  assert.ok(waterTile);
  assert.equal(waterTile.watering, 1);
  water++;
  const wetChunk = [chunkCoordinate(waterTile.x), chunkCoordinate(waterTile.y)];
  for (const [cx, cy] of [wetChunk, [-4, -3], [-2, 3], [3, -2], [4, 4]]) {
    for (const tile of world.getChunk(cx, cy).tiles.filter(t => t.x % chunkSize === 0 || t.y % chunkSize === 0)) {
      let nearest = wateringRadius;
      for (let dy = -wateringRadius; dy <= wateringRadius; dy++) for (let dx = -wateringRadius; dx <= wateringRadius; dx++) {
        const distance = Math.abs(dx) + Math.abs(dy);
        if (distance < nearest && isWaterAt(tile.x + dx, tile.y + dy)) nearest = distance;
      }
      assert.equal(tile.watering, 1 - nearest / wateringRadius);
      if (tile.terrain === 'water') { water++; assert.equal(tile.watering, 1); }
      else if (tile.watering > 0) watered++;
      else dry++;
    }
  }
  assert.ok(dry > 0 && watered > 0 && water > 0);
});

test('all four active flower species generate actual plants in wild patches', () => {
  const world=new ChunkWorld();
  const seen=new Set();
  for(let py=4;py<16;py++) for(let px=4;px<16;px++) {
    const patch=wildFlowerPatch(px,py);
    if(!patch || seen.has(patch.flower)) continue;
    for(let y=Math.floor(patch.y)-2;y<=patch.y+2;y++) for(let x=Math.floor(patch.x)-2;x<=patch.x+2;x++) {
      const tile=world.getTile(x,y);
      if(tile.flower===patch.flower) seen.add(tile.flower);
    }
  }
  assert.deepEqual(seen,new Set(flowerSpecies));
});
