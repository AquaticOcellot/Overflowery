import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../src/buildings.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
const { BuildingIndex, buildingSize, buildingTiles, burnerSettings } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const burner = (x = 0, y = 0, rotation = 0) => ({ x, y, kind: 'burner', rotation });

test('burner rotates between 3x2 and 2x3, covering exactly six tiles', () => {
  for (const rotation of [0, 1, 2, 3]) {
    assert.deepEqual(buildingSize('burner', rotation), rotation % 2 ? { width: 2, height: 3 } : { width: 3, height: 2 });
    assert.equal(buildingTiles(burner(-1, 15, rotation)).length, 6);
    assert.equal(new Set(buildingTiles(burner(-1, 15, rotation)).map((tile) => `${tile.x},${tile.y}`)).size, 6);
  }
  assert.deepEqual(buildingSize('generator', 1), { width: 1, height: 1 });
});

test('every covered tile selects one machine across signed coordinates and chunk boundaries', () => {
  const index = new BuildingIndex();
  const machine = burner(-1, 15, 1);
  assert.equal(index.place(machine, () => false), true);
  for (const tile of buildingTiles(machine)) assert.equal(index.at(tile), machine);
  assert.equal(index.buildings.size, 1);
  assert.equal(index.at({ x: 1, y: 15 }), undefined);
});

test('water, flowers or an existing building at any footprint cell reject placement atomically', () => {
  const index = new BuildingIndex();
  const original = { x: 2, y: 1, kind: 'generator', rotation: 0 };
  index.place(original, () => false);
  assert.equal(index.place(burner(), () => false), false);
  assert.equal(index.at({ x: 0, y: 0 }), undefined);
  assert.equal(index.at({ x: 2, y: 1 }), original);
  for (const blocked of buildingTiles(burner(10, 10))) {
    assert.equal(index.place(burner(10, 10), (tile) => tile.x === blocked.x && tile.y === blocked.y), false);
    assert.equal(index.buildings.size, 1);
  }
  assert.equal(index.place(burner(10, 10), () => false), true);
  assert.equal(index.place(burner(12, 11), () => false), false);
  assert.equal(index.buildings.size, 2);
});

test('placement rejects fractional coordinates and invalid rotation', () => {
  const index = new BuildingIndex();
  assert.equal(index.place(burner(0.5, 0), () => false), false);
  assert.equal(index.place(burner(0, 0, 9), () => false), false);
  assert.equal(index.buildings.size, 0);
});

test('small burners occupy one tile and coexist beside a large burner', () => {
  const index = new BuildingIndex();
  const large = burner(-1, -1);
  assert.equal(index.place(large, () => false), true);
  for (const rotation of [0, 1, 2, 3]) {
    assert.deepEqual(buildingSize('small-burner', rotation), {width: 1, height: 1});
  }
  const small = {x: 2, y: -1, kind: 'small-burner', rotation: 0};
  assert.equal(index.place(small, () => false), true);
  assert.equal(index.at({x: 2, y: -1}), small);
  assert.equal(index.at({x: 1, y: -1}), large);
  assert.equal(index.place({...small, rotation: 1}, () => false), false);
  assert.equal(index.place({...small, x: 3}, () => true), false);
});

test('small burner restores 1 kW with no efficiency bonus; large retains 3 kW output', () => {
  const small = burnerSettings('small-burner');
  const large = burnerSettings('burner');
  assert.equal(small.fuelWatts, 1000);
  assert.equal(small.heatMultiplier, 1);
  assert.equal(2000 / small.fuelWatts, 2);
  assert.equal(large.fuelWatts, 2000);
  assert.equal(large.fuelWatts * large.heatMultiplier, 3000);
});
