import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTS } from './load-ts.mjs';
const {SimulationSpeed,simulationSteps}=await loadTS(new URL('../src/speed.ts',import.meta.url));
const {advanceConstruction,createConstruction}=await loadTS(new URL('../src/construction.ts',import.meta.url));

test('speed changes by factors of ten between 0.1x and 100x',()=>{
  const speed=new SimulationSpeed();
  assert.equal(speed.multiplier,1);
  speed.decrease();assert.equal(speed.multiplier,0.1);
  speed.decrease();assert.equal(speed.multiplier,0.1);
  speed.increase();assert.equal(speed.multiplier,1);
  speed.increase();assert.equal(speed.multiplier,10);
  speed.increase();assert.equal(speed.multiplier,100);
  speed.increase();assert.equal(speed.multiplier,100);
  speed.decrease();assert.equal(speed.multiplier,10);
  speed.decrease();assert.equal(speed.multiplier,1);
  speed.decrease();assert.equal(speed.multiplier,0.1);
});

test('fast-forward conserves elapsed simulation time in steps no longer than 50 ms',()=>{
  for(const real of [0,1/144,1/60,.1,1]) for(const multiplier of [.1,1,10,100]) {
    const {count,seconds}=simulationSteps(real,multiplier);
    assert.ok(seconds<=.05+1e-12);
    assert.ok(Math.abs(count*seconds-real*multiplier)<1e-10);
  }
});

test('accelerated construction consumes exactly ten materials and completes at ten simulated seconds',()=>{
  for(const multiplier of [.1,1,10,100]) {
    const state=createConstruction(10,10);
    const input=[{flower:'blue',quality:{id:'uncommon'},count:10},null,null,null];
    const {count,seconds}=simulationSteps(10/multiplier,multiplier);
    for(let i=0;i<count;i++) advanceConstruction(state,input,seconds);
    assert.ok(Math.abs(state.secondsBuilt-10)<1e-9);
    assert.equal(state.paidFlowers,10);
    assert.equal(input[0],null);
  }
});
