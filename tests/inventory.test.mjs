import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../src/inventory.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
const { storeFlower, inventorySlots, moveStack, takeInput } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const common = { id: 'normal' };

test('32 occupied slots still accept matching flowers into unfinished stacks', () => {
  const inventory = Array.from({ length: inventorySlots }, (_, index) => ({ flower: `flower-${index}`, quality: common, count: 1 }));
  assert.equal(storeFlower(inventory, 'flower-0', common), true);
  assert.equal(inventory[0].count, 2);
  assert.equal(inventory.length, 32);
  assert.equal(storeFlower(inventory, 'new-flower', common), false);
  assert.equal(storeFlower(inventory, 'flower-0', { id: 'rare' }), false);
  assert.equal(inventory.length, 32);
});

test('full stacks spill into a new slot until all 32 slots are filled', () => {
  const inventory = [{ flower: 'blue', quality: common, count: 100 }];
  assert.equal(storeFlower(inventory, 'blue', common), true);
  assert.deepEqual(inventory.map((stack) => stack.count), [100, 1]);
  while (inventory.length < 32) inventory.push({ flower: 'blue', quality: common, count: 100 });
  inventory[1].count = 100;
  assert.equal(storeFlower(inventory, 'blue', common), false);
  assert.equal(inventory.length, 32);
  assert.ok(inventory.every((stack) => stack.count === 100));
});

test('using the last item in a stack makes room for another species or quality', () => {
  const inventory = Array.from({ length: inventorySlots }, () => ({ flower: 'blue', quality: common, count: 100 }));
  inventory.splice(0, 1);
  assert.equal(storeFlower(inventory, 'yellow', { id: 'epic' }), true);
  assert.equal(inventory.length, 32);
  assert.equal(inventory[31].flower, 'yellow');
});

test('moving stacks preserves empty positions and reuses them when harvesting', () => {
  const slots = Array(32).fill(null);
  storeFlower(slots, 'blue', common);
  assert.equal(moveStack(slots, 0, slots, 20), true);
  assert.equal(slots[0], null);
  assert.equal(slots[20].flower, 'blue');
  storeFlower(slots, 'yellow', common);
  assert.equal(slots[0].flower, 'yellow');
  assert.equal(slots[20].flower, 'blue');
  assert.equal(slots.length, 32);
});

test('bag and four-slot buffers support bounded merges, swaps, and returning input', () => {
  const bag = Array(32).fill(null), buffer = Array(4).fill(null);
  bag[5] = { flower: 'blue', quality: common, count: 50 };
  buffer[0] = { flower: 'blue', quality: common, count: 80 };
  assert.equal(moveStack(bag, 5, buffer, 0), true);
  assert.equal(buffer[0].count, 100);
  assert.equal(bag[5].count, 30);
  assert.equal(moveStack(bag, 5, buffer, 0), false);
  buffer[1] = { flower: 'yellow', quality: { id: 'rare' }, count: 4 };
  assert.equal(moveStack(bag, 5, buffer, 1), true);
  assert.equal(bag[5].flower, 'yellow');
  assert.equal(buffer[1].count, 30);
  assert.equal(moveStack(buffer, 1, bag, 10), true);
  assert.equal(buffer[1], null);
  assert.equal(bag[10].count, 30);
  assert.equal(buffer.length, 4);
});

test('invalid or cancelled moves cannot lose or duplicate items', () => {
  const item = { flower: 'blue', quality: common, count: 12 };
  const slots = [item, null];
  assert.equal(moveStack(slots, 0, slots, 0), false);
  assert.equal(moveStack(slots, 0, slots, 4), false);
  assert.equal(moveStack(slots, 0, slots, -1), false);
  assert.equal(moveStack(slots, 1, slots, 0), false);
  assert.deepEqual(slots, [item, null]);
  assert.equal(item.count, 12);
});

test('machine input drains left to right, one flower at a time, without shifting slots', () => {
  const buffer = [null, { flower: 'yellow', quality: common, count: 2 }, null, { flower: 'blue', quality: { id: 'rare' }, count: 1 }];
  const first = takeInput(buffer);
  assert.equal(first.count, 1);
  assert.equal(first.flower, 'yellow');
  assert.equal(buffer[1].count, 1);
  assert.equal(takeInput(buffer).flower, 'yellow');
  assert.equal(buffer[1], null);
  assert.equal(buffer[3].flower, 'blue');
  assert.equal(takeInput(buffer).flower, 'blue');
  assert.deepEqual(buffer, [null, null, null, null]);
  assert.equal(takeInput(buffer), undefined);
});
