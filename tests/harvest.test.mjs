import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';
const load = async path => {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
};
const { qualityProbabilities, rollQualityTier, randomGrowthDuration, HarvestJournal, initialGrowthTiming, overgrowthState, harvestMeasurement } = await load('../src/harvest.ts');
const { flowerSpecies, growthNiche, environmentQuality } = await load('../src/world.ts');
test('quality peak doubles geometric promotion chance, including higher tiers', () => {
  for (const p of [.1, .2]) {
    const chances = qualityProbabilities(p);
    assert.ok(Math.abs(chances.reduce((a,b) => a+b,0)-1) < 1e-12);
    for(let i=0;i<9;i++) assert.ok(Math.abs(chances[i] - (1-p)*p**i) < 1e-12);
  }
  assert.equal(qualityProbabilities(.2)[0], .8);
  assert.ok(Math.abs(qualityProbabilities(.2)[1]-.16)<1e-12);
  assert.ok(Math.abs(qualityProbabilities(.2)[2]-.032)<1e-12);
});
test('quality traits are separate, deterministic and peak at 2x', () => {
  for (const flower of flowerSpecies) {
    const peak=growthNiche(flower,123,'quality');
    assert.notDeepEqual(peak,growthNiche(flower,123));
    assert.deepEqual(peak,growthNiche(flower,123,'quality'));
    assert.notDeepEqual(peak,growthNiche(flower,124,'quality'));
    assert.equal(environmentQuality(flower,peak.elevation,peak.watering,123),2);
    assert.ok(environmentQuality(flower,0,0,123)>=1);
  }
});
test('growth duration and quality vary with sampled randomness', () => {
  assert.equal(randomGrowthDuration(()=>0),.85);
  assert.equal(randomGrowthDuration(()=>.5),1);
  assert.equal(randomGrowthDuration(()=>1),1.15);
  const roll = (jitter, draw) => { const values=[jitter,draw];return rollQualityTier(.1,2,()=>values.shift()); };
  assert.equal(roll(.5,.79),0);
  assert.equal(roll(.5,.81),1);
  assert.equal(roll(.5,.97),2);
  assert.equal(roll(0,.81),0);
  assert.equal(roll(1,.81),1);
});
test('journal records only observed bins, separates species and excludes boosts', () => {
  const journal=new HarvestJournal();
  assert.equal(journal.get('blue',5,4),undefined);
  journal.record({flower:'blue',elevation:.55,watering:.42,qualityTier:0,modified:false});
  journal.record({flower:'blue',elevation:.55,watering:.42,qualityTier:2,regrowthSeconds:6,modified:false});
  journal.record({flower:'blue',elevation:.55,watering:.42,qualityTier:1,regrowthSeconds:2,modified:true});
  assert.deepEqual(journal.get('blue',5,4),{count:3,qualities:[1,1,1,0,0,0,0,0,0,0],growthCount:2,growthSeconds:8});
  assert.deepEqual(journal.get('blue',5,4,true),{count:2,qualities:[1,0,1,0,0,0,0,0,0,0],growthCount:1,growthSeconds:6});
  assert.equal(journal.get('yellow',5,4),undefined);
  assert.equal(journal.get('blue',6,4),undefined);
  journal.record({flower:'blue',elevation:1,watering:1,qualityTier:0,modified:false});
  assert.equal(journal.get('blue',9,9).count,1);
});

test('first harvest includes the initial age for partial and already-ripe flowers', () => {
  const duration = 8;
  const partial = initialGrowthTiming(.25, 20, duration);
  assert.equal(partial.cycleStartedAt, 18);
  assert.equal(partial.readyAt, undefined);
  const ripeAt = 20 + (1 - .25) * duration;
  const ripe = initialGrowthTiming(1, 20, duration);
  assert.equal(ripe.readyAt - ripe.cycleStartedAt, duration);
  assert.equal(ripeAt - partial.cycleStartedAt, duration);
  const journal = new HarvestJournal();
  journal.record({ flower: 'blue', elevation: .5, watering: .4, qualityTier: 0, regrowthSeconds: ripe.readyAt - ripe.cycleStartedAt, modified: false });
  assert.equal(journal.get('blue', 5, 4).growthCount, 1);
  assert.equal(journal.get('blue', 5, 4).growthSeconds, duration);
});

test('overgrowth uses cubic additional stage times and quadratic harvest rolls', () => {
  assert.deepEqual(overgrowthState(0), {stage: 0, rolls: 0, progress: 0});
  assert.deepEqual(overgrowthState(.5), {stage: 0, rolls: 0, progress: .5});
  let threshold = 0;
  for (let stage = 1; stage <= 100; stage++) {
    threshold += stage ** 3;
    assert.deepEqual(overgrowthState(threshold), {stage, rolls: stage ** 2, progress: 0});
    assert.equal(overgrowthState(threshold - .001).stage, stage - 1);
    const halfway = overgrowthState(threshold + (stage + 1) ** 3 / 2);
    assert.equal(halfway.stage, stage);
    assert.equal(halfway.rolls, stage ** 2);
    assert.equal(halfway.progress, .5);
  }
});

test('field observations keep low-elevation land in its own bins', () => {
  const journal = new HarvestJournal();
  journal.record({flower: 'blue', elevation: .04, watering: .3, qualityTier: 0, regrowthSeconds: 8, modified: false});
  journal.record({flower: 'blue', elevation: .14, watering: .3, qualityTier: 1, regrowthSeconds: 6, modified: false});
  assert.equal(journal.get('blue', 0, 3).growthSeconds, 8);
  assert.equal(journal.get('blue', 1, 3).growthSeconds, 6);
  assert.equal(journal.get('blue', 2, 3), undefined);
});

test('field guide counts each overgrowth quality roll while growth counts one crop', () => {
  const journal = new HarvestJournal();
  const recordRoll = (qualityTier, first = false) => journal.record({flower: 'blue', elevation: .55, watering: .42,
    qualityTier, regrowthSeconds: first ? 8 : undefined, modified: false});
  // Partial collection: record four of nine rolls, then collect the remainder.
  [0, 0, 1, 0].forEach((tier, i) => recordRoll(tier, i === 0));
  assert.deepEqual(harvestMeasurement(journal.get('blue', 5, 4), 'quality'), {count: 4, unit: 'rolls', value: .25});
  [0, 0, 2, 0, 0].forEach(tier => recordRoll(tier));
  const stats = journal.get('blue', 5, 4);
  assert.deepEqual(harvestMeasurement(stats, 'quality'), {count: 9, unit: 'rolls', value: 2 / 9});
  assert.deepEqual(harvestMeasurement(stats, 'growth'), {count: 1, unit: 'cycle', value: 8});
  recordRoll(1, true);
  assert.equal(harvestMeasurement(journal.get('blue', 5, 4), 'quality').count, 10);
  assert.equal(harvestMeasurement(journal.get('blue', 5, 4), 'growth').count, 2);
});
