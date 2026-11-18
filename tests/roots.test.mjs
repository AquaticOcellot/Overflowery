import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../src/roots.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
const { RootNetwork, growWithHeat, growWithNutrients, placePaidRoot, advanceProducer } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const a = { x: 1, y: 1 }, b = { x: 2, y: 1 }, c = { x: 3, y: 1 };
const energySource = await readFile(new URL('../src/energy.ts', import.meta.url), 'utf8');
const energyCode = ts.transpileModule(energySource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { advanceGeneration } = await import(`data:text/javascript;base64,${Buffer.from(energyCode).toString('base64')}`);

test('generator draws only available local heat and consumes none at a full electric buffer', () => {
  const net = new RootNetwork(5, 5);
  advanceProducer(net, a, 2000, 1000, 1);
  // An isolated generator has no heat, even while an unrelated burner is active.
  const isolated = [{ totalJoules: 0, remainingJoules: 0 }];
  assert.equal(advanceGeneration(isolated, 0, 1), 0);
  net.connect(a, b);
  net.advance(1);
  const available = net.stored.get('2,1');
  const charges = [{ totalJoules: available, remainingJoules: available }];
  assert.equal(advanceGeneration(charges, 100000, 1), 100000);
  assert.equal(charges[0].remainingJoules, available);
  const produced = advanceGeneration(charges, 0, 1);
  const consumed = net.consume(b, available - charges[0].remainingJoules);
  assert.ok(produced > 0 && produced <= 1000);
  assert.equal(produced, consumed);
  assert.equal(net.stored.get('2,1'), 0);
});

test('only adjacent in-bounds orthogonal links; reversed links replace rather than duplicate', () => {
  const net = new RootNetwork(5, 5);
  assert.equal(net.connect(a, { x: 2, y: 2 }, 'heat'), false);
  assert.equal(net.connect(a, a, 'heat'), false);
  assert.equal(net.connect(a, c, 'heat'), false);
  assert.equal(net.connect({ x: 0, y: 0 }, { x: -1, y: 0 }, 'heat'), false);
  assert.equal(net.connect(a, b, 'heat'), true);
  assert.equal(net.connect(b, a, 'heat'), true);
  assert.equal(net.roots.size, 1);
  assert.equal([...net.roots.values()][0].kind, 'heat');
});

test('heat travels along mixed root paths and stops at a removed connection', () => {
  const net = new RootNetwork(5, 5);
  net.connect(a, b, 'heat');
  net.connect(b, c, 'heat');
  net.add(a, 4000);
  net.advance(1);
  assert.ok(net.stored.get('2,1') > 0);
  assert.ok(net.stored.get('3,1') > 0);
  net.remove(b, c);
  const before = net.stored.get('3,1');
  net.advance(1);
  assert.ok(net.stored.get('3,1') < before);
  assert.equal(net.stored.get('2,2'), undefined);
});

test('heat and nutrient roots overlap but cannot exchange resources', () => {
  const heat = new RootNetwork(5, 5);
  const nutrients = new RootNetwork(5, 5, 'nutrient');
  heat.connect(a, b);
  nutrients.connect(a, b);
  assert.equal(heat.connect(b, c, 'nutrient'), false);
  heat.add(a, 2000);
  heat.advance(1);
  nutrients.advance(1);
  assert.equal(nutrients.stored.get('2,1') ?? 0, 0);
  nutrients.add(a, 8);
  nutrients.advance(1);
  assert.ok(nutrients.stored.get('2,1') > 0);
  assert.ok(Math.abs([...nutrients.stored.values()].reduce((sum, value) => sum + value, 0) - 8) < 1e-8);
  assert.equal(nutrients.capacity(a), 20);
  nutrients.remove(a, b);
  assert.equal(heat.roots.size, 1);
});

test('new links cost one Common flower; invalid, duplicate and unaffordable links are safe', () => {
  const net = new RootNetwork(5, 5);
  const stacks = [{ quality: { id: 'rare' }, count: 4 }, { quality: { id: 'normal' }, count: 1 }];
  assert.equal(placePaidRoot(net, a, c, stacks), 'invalid');
  assert.equal(stacks[1].count, 1);
  assert.equal(placePaidRoot(net, a, b, stacks), 'placed');
  assert.equal(stacks.length, 1);
  assert.equal(stacks[0].count, 4);
  assert.equal(placePaidRoot(net, b, a, stacks), 'existing');
  assert.equal(placePaidRoot(net, b, c, stacks), 'unaffordable');
  assert.equal(net.roots.size, 1);
  assert.equal(stacks[0].count, 4);
});

test('burner produces only heat and pauses on full tile without consuming fuel', () => {
  const net = new RootNetwork(5, 5);
  assert.equal(advanceProducer(net, a, 2000, 1000, 1), 1000);
  assert.equal(net.stored.get('1,1'), 1000);
  net.add(a, 3000);
  assert.equal(advanceProducer(net, a, 1000, 1000, 1), 1000);
  net.consume(a, 500);
  assert.equal(advanceProducer(net, a, 1000, 1000, 1), 500);
});

test('composter produces eight nutrients in four seconds and pauses without wasting its flower', () => {
  const net = new RootNetwork(5, 5, 'nutrient');
  assert.equal(advanceProducer(net, a, 8, 2, 4), 0);
  assert.equal(net.stored.get('1,1'), 8);
  net.add(a, 12);
  assert.equal(advanceProducer(net, a, 8, 2, 10), 8);
  net.consume(a, 3);
  assert.equal(advanceProducer(net, a, 8, 2, 10), 5);
});

test('nutrients accelerate growing flowers and mature flowers consume nothing', () => {
  const growth = growWithHeat(0, 1, 1000);
  const fed = growWithNutrients(growth.growth, 1, 8);
  assert.equal(fed.growth, 0.25);
  assert.equal(fed.nutrientsUsed, 1);
  assert.deepEqual(growWithNutrients(1, 1, 8), { growth: 1, nutrientsUsed: 0 });
  assert.deepEqual(growWithNutrients(0, 1, 0), { growth: 0, nutrientsUsed: 0 });
});

test('branching and long steps cannot create heat or exceed tile capacity', () => {
  const net = new RootNetwork(5, 5);
  for (const tile of [b, { x: 0, y: 1 }, { x: 1, y: 0 }, { x: 1, y: 2 }]) net.connect(a, tile, 'heat');
  net.add(a, 100000);
  assert.equal(net.stored.get('1,1'), 4000);
  net.advance(20);
  assert.ok([...net.stored.values()].reduce((sum, heat) => sum + heat, 0) < 4000);
  for (const heat of net.stored.values()) assert.ok(heat >= 0 && heat <= 4000);
});

test('growth consumes only useful heat, doubles speed at most and works without heat', () => {
  assert.equal(growWithHeat(0, 1, 0).growth, 1 / 12);
  const warm = growWithHeat(0, 1, 1000);
  assert.equal(warm.growth, 1 / 6);
  assert.equal(warm.heatUsed, 100);
  assert.deepEqual(growWithHeat(1, 1, 1000), { growth: 1, heatUsed: 0 });
  assert.ok(growWithHeat(0.99, 1, 1000).heatUsed < 1e-8);
  const net = new RootNetwork(5, 5);
  net.add(a, 20);
  assert.equal(net.consume(a, 100), 20);
  assert.equal(net.stored.get('1,1'), 0);
});

test('network evolution is independent of edge insertion order', () => {
  const nets = [new RootNetwork(5, 5), new RootNetwork(5, 5)];
  const edges = [[a, b], [b, c], [b, { x: 2, y: 2 }]];
  edges.forEach(([from, to]) => nets[0].connect(from, to, 'heat'));
  [...edges].reverse().forEach(([from, to]) => nets[1].connect(from, to, 'heat'));
  for (const net of nets) { net.add(a, 3000); net.advance(2); }
  for (const [key, heat] of nets[0].stored) assert.ok(Math.abs(heat - nets[1].stored.get(key)) < 1e-8);
});
