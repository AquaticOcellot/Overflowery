import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../src/energy.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
const { advanceGeneration, fuelEnergyJoules, bufferCapacityJoules } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const charge = (tier = 0) => ({ totalJoules: fuelEnergyJoules(tier), remainingJoules: fuelEnergyJoules(tier) });

test('quality doubles fuel capacity and burn time without changing power', () => {
  for (let tier = 0; tier < 10; tier++) {
    const fuel = charge(tier);
    assert.equal(fuel.totalJoules, 2000 * 2 ** tier);
    assert.equal(advanceGeneration([fuel], 0, 1), 1000);
    assert.equal(fuel.remainingJoules, fuel.totalJoules - 1000);
  }
});

test('common fuel finishes in two seconds and cannot overproduce on a long frame', () => {
  const fuel = charge();
  assert.equal(advanceGeneration([fuel], 0, 0.5), 500);
  assert.equal(advanceGeneration([fuel], 500, 10), 2000);
  assert.equal(fuel.remainingJoules, 0);
});

test('full buffer pauses fuel and spending energy lets production resume', () => {
  const fuel = charge(9);
  assert.equal(advanceGeneration([fuel], bufferCapacityJoules, 60), 100000);
  assert.equal(fuel.remainingJoules, fuel.totalJoules);
  assert.equal(advanceGeneration([fuel], 99000, 2), 100000);
  assert.equal(fuel.remainingJoules, fuel.totalJoules - 1000);
});

test('multiple burners combine output and share limited space without losing fuel', () => {
  const fuels = [charge(), charge()];
  assert.equal(advanceGeneration(fuels, 0, 0.25), 500);
  assert.equal(advanceGeneration(fuels, 99500, 1), 100000);
  assert.deepEqual(fuels.map((fuel) => fuel.remainingJoules), [1500, 1500]);
});

test('fractional updates conserve energy through fuel exhaustion', () => {
  const fuels = [charge(), charge(1), charge(2)];
  let stored = 0;
  for (let frame = 0; frame < 1000; frame++) stored = advanceGeneration(fuels, stored, 1 / 60);
  assert.ok(Math.abs(stored - 14000) < 1e-7);
  assert.deepEqual(fuels.map((fuel) => fuel.remainingJoules), [0, 0, 0]);
});
