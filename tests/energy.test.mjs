import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../src/energy.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
const { advanceGenerator, fuelEnergyJoules, generatorCapacityJoules } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

test('quality still doubles flower fuel energy', () => {
  for (let tier=0;tier<10;tier++) assert.equal(fuelEnergyJoules(tier),2000*2**tier);
});

test('generator converts local heat at 1 kW, capped by actual available heat', () => {
  assert.deepEqual(advanceGenerator(2000,0,.5),{heatUsed:500,storedJoules:500});
  assert.deepEqual(advanceGenerator(250,500,10),{heatUsed:250,storedJoules:750});
  assert.deepEqual(advanceGenerator(0,500,1),{heatUsed:0,storedJoules:500});
});

test('each generator has exactly 10 kJ capacity and pauses without consuming heat', () => {
  assert.equal(generatorCapacityJoules,10000);
  assert.deepEqual(advanceGenerator(20000,0,60),{heatUsed:10000,storedJoules:10000});
  assert.deepEqual(advanceGenerator(2000,10000,60),{heatUsed:0,storedJoules:10000});
  assert.deepEqual(advanceGenerator(2000,9900,1),{heatUsed:100,storedJoules:10000});
});

test('generators keep independent reservoirs and resume when local power is spent', () => {
  assert.equal(advanceGenerator(2000,10000,1).heatUsed,0);
  assert.equal(advanceGenerator(2000,0,1).heatUsed,1000);
  assert.equal(advanceGenerator(2000,9000,1).heatUsed,1000);
});

test('fractional generation conserves heat through a full reservoir and subsequent spending', () => {
  let heat=14000,stored=0,spent=0;
  for(let frame=0;frame<1200;frame++) {
    if(frame===700) { stored-=4000;spent+=4000; }
    const next=advanceGenerator(heat,stored,1/60);
    heat-=next.heatUsed;stored=next.storedJoules;
  }
  assert.ok(Math.abs(heat+stored+spent-14000)<1e-7);
  assert.ok(Math.abs(stored-10000)<1e-7);
  assert.ok(Math.abs(heat)<1e-7);
});
