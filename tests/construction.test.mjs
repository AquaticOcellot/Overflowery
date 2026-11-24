import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../src/construction.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
const { createConstruction, advanceConstruction, deliverMaterials, queuedMaterials } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const flowers = (count, quality = 'uncommon', flower = 'blue') => ({ count, quality: { id: quality }, flower });
const largeBurnerConstruction = () => createConstruction(10, 10);

test('four flowers fund exactly four seconds and 40% construction, then progress pauses', () => {
  const state = largeBurnerConstruction(), buffer = [flowers(4), null, null, null];
  assert.equal(advanceConstruction(state, buffer, 100), false);
  assert.equal(state.paidFlowers, 4);
  assert.equal(state.secondsBuilt, 4);
  assert.deepEqual(state.spentMaterials, [{ qualityId: 'uncommon', count: 4 }]);
  assert.equal(queuedMaterials(buffer), 0);
  advanceConstruction(state, buffer, 100);
  assert.equal(state.secondsBuilt, 4);
  buffer[2] = flowers(6, 'uncommon', 'yellow');
  assert.equal(advanceConstruction(state, buffer, 6), true);
  assert.equal(state.paidFlowers, 10);
  assert.equal(state.secondsBuilt, 10);
  assert.deepEqual(state.spentMaterials, [{ qualityId: 'uncommon', count: 10 }]);
});

test('with all materials available construction takes ten seconds, independent of tick size', () => {
  for (const dt of [0.05, 0.25, 1]) {
    const state = largeBurnerConstruction(), buffer = [flowers(10)];
    for (let time = 0; time < 9; time += dt) advanceConstruction(state, buffer, dt);
    assert.ok(state.secondsBuilt < 10);
    for (let i = 0; i < Math.ceil(2 / dt); i++) advanceConstruction(state, buffer, dt);
    assert.equal(state.secondsBuilt, 10);
    assert.equal(state.paidFlowers, 10);
    assert.equal(buffer[0], null);
  }
});

test('waiting without materials does not bank construction time', () => {
  const state = largeBurnerConstruction(), buffer = [null];
  advanceConstruction(state, buffer, 1000);
  buffer[0] = flowers(10);
  assert.equal(advanceConstruction(state, buffer, 0.5), false);
  assert.equal(state.paidFlowers, 1);
  assert.equal(state.secondsBuilt, 0.5);
  assert.deepEqual(state.spentMaterials, [{ qualityId: 'uncommon', count: 1 }]);
  assert.equal(buffer[0].count, 9);
});

test('only Uncommon flowers fund construction; other qualities remain untouched', () => {
  const state = largeBurnerConstruction(), buffer = [flowers(10, 'normal'), flowers(10, 'rare')];
  assert.equal(advanceConstruction(state, buffer, 20), false);
  assert.equal(state.secondsBuilt, 0);
  assert.equal(buffer[0].count, 10);
  assert.equal(buffer[1].count, 10);
});

test('delivery accepts only the missing material quantity and leaves excess in the bag', () => {
  const state = largeBurnerConstruction(), buffer = [null, null, null, null], bag = [flowers(100)];
  assert.equal(deliverMaterials(bag, 0, buffer, 2, state), true);
  assert.equal(bag[0].count, 90);
  assert.equal(buffer[2].count, 10);
  assert.equal(deliverMaterials(bag, 0, buffer, 0, state), false);
  assert.equal(bag[0].count, 90);
  assert.equal(advanceConstruction(state, buffer, 10), true);
  assert.equal(deliverMaterials(bag, 0, buffer, 1, state), false);
  assert.equal(advanceConstruction(state, buffer, 100), true);
  assert.equal(bag[0].count, 90);
});

test('partial delivery, withdrawal, and mixed species retain the exact ten-flower cost', () => {
  const state = largeBurnerConstruction(), buffer = [null, null, null, null], bag = [flowers(4), flowers(20, 'uncommon', 'yellow')];
  deliverMaterials(bag, 0, buffer, 0, state);
  advanceConstruction(state, buffer, 0.5);
  assert.equal(buffer[0].count, 3);
  buffer[0] = null; // Unused flowers can be withdrawn; the paid second remains available.
  advanceConstruction(state, buffer, 10);
  assert.equal(state.secondsBuilt, 1);
  assert.equal(deliverMaterials(bag, 1, buffer, 3, state), true);
  assert.equal(buffer[3].count, 9);
  assert.equal(bag[1].count, 11);
  assert.equal(advanceConstruction(state, buffer, 9), true);
  assert.equal(state.paidFlowers, 10);
});

test('invalid qualities and incompatible destination stacks reject delivery without swapping items', () => {
  const state = largeBurnerConstruction(), buffer = [flowers(1, 'uncommon', 'yellow')], bag = [flowers(10), flowers(10, 'rare')];
  assert.equal(deliverMaterials(bag, 0, buffer, 0, state), false);
  assert.equal(deliverMaterials(bag, 1, buffer, 0, state), false);
  assert.equal(buffer[0].flower, 'yellow');
  assert.equal(bag[0].count, 10);
  assert.equal(bag[1].count, 10);
});
