import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../src/roots.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
const { RootNetwork, createUtilityNetworks, storedPower, spendPower, rootStats, rootKey, growWithHeat, growWithNutrients, placePaidRoot, advanceProducer } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const a = { x: 1, y: 1 }, b = { x: 2, y: 1 }, c = { x: 3, y: 1 };
const energySource = await readFile(new URL('../src/energy.ts', import.meta.url), 'utf8');
const energyCode = ts.transpileModule(energySource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { advanceGenerator } = await import(`data:text/javascript;base64,${Buffer.from(energyCode).toString('base64')}`);

test('generator uses only local heat and its own capacity, with no global reservoir', () => {
  const heat = new RootNetwork(5,5);
  const {power} = createUtilityNetworks(5,5);
  power.bindFootprint([b],10000);
  advanceProducer(heat,a,2000,1000,1);
  assert.equal(advanceGenerator(heat.amount(b),power.amount(b),1).heatUsed,0);
  heat.connect(a,b);heat.advance(1);
  const available=heat.amount(b);
  power.add(b,10000);
  assert.equal(advanceGenerator(available,power.amount(b),1).heatUsed,0);
  power.consume(b,1000);
  const result=advanceGenerator(available,power.amount(b),1);
  heat.consume(b,result.heatUsed);power.add(b,result.heatUsed);
  assert.ok(result.heatUsed>0 && result.heatUsed<=1000);
  assert.equal(heat.amount(b),0);
  assert.ok(power.amount(b)<=10000);
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
  assert.equal(stacks.length, 2);
  assert.equal(stacks[1], null);
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

test('large burner consumes 2 kJ fuel per second and produces 3 kJ heat', () => {
  const net = new RootNetwork();
  const tiles = Array.from({ length: 6 }, (_, index) => ({ x: index % 3, y: Math.floor(index / 3) }));
  net.bindFootprint(tiles);
  assert.equal(advanceProducer(net, tiles[0], 4000, 2000, 0.5, 1.5), 3000);
  assert.equal(net.amount(tiles[0]), 1500);
  assert.equal(advanceProducer(net, tiles[0], 3000, 2000, 5, 1.5), 0);
  assert.equal(net.amount(tiles[0]), 6000);
});

test('efficient burner respects storage limits and consumes only the fuel needed to fill available space', () => {
  const net = new RootNetwork();
  const tile = { x: 0, y: 0 };
  net.add(tile, 3850);
  assert.equal(advanceProducer(net, tile, 2000, 2000, 1, 1.5), 1900);
  assert.equal(net.amount(tile), 4000);
  assert.equal(advanceProducer(net, tile, 1900, 2000, 1, 1.5), 1900);
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

test('five levels have substantial throughput gains and resource-specific thresholds', () => {
  for (const kind of ['heat', 'nutrient']) {
    const base = kind === 'heat' ? 1000 : 4;
    const root = { a, b, kind, transported: 0 };
    for (const [index, threshold] of [0, 0.25, 2, 8, 24].entries()) {
      root.transported = threshold * base;
      const stats = rootStats(root);
      assert.equal(stats.level, index + 1);
      assert.equal(stats.throughput, base * [0.05, 0.15, 0.4, 1, 2.5][index]);
      assert.equal(stats.progress, index === 4 ? 1 : 0);
    }
    root.transported = base * 10000;
    assert.equal(rootStats(root).level, 5);
    assert.equal(rootStats(root).untilNext, 0);
  }
});

test('only actual transferred resources award experience; idle links do not level', () => {
  const net = new RootNetwork(5, 5, 'nutrient');
  net.connect(a, b);
  const root = net.roots.get(rootKey(a, b));
  net.advance(30);
  assert.equal(root.transported, 0);
  net.add(a, 20);
  net.add(b, 20);
  net.advance(10);
  assert.equal(root.transported, 0);
  net.consume(b, 20);
  net.advance(1);
  assert.ok(root.transported > 0 && root.transported <= 0.2);
  assert.ok(Math.abs(root.transported - net.stored.get('2,1')) < 1e-9);
});

test('sustained flow levels links automatically, increasing delivered throughput', () => {
  for (const kind of ['heat', 'nutrient']) {
    const net = new RootNetwork(5, 5, kind);
    net.connect(a, b);
    const root = net.roots.get(rootKey(a, b));
    const initialRate = rootStats(root).throughput;
    for (let frame = 0; frame < 2000; frame++) {
      net.add(a, net.capacity(a));
      net.consume(b, net.capacity(b));
      net.advance(0.05);
    }
    assert.equal(rootStats(root).level, 5);
    assert.equal(rootStats(root).throughput, initialRate * 50);
  }
});

test('reconnecting preserves growth; uprooting and rebuilding creates a new level-one link', () => {
  const net = new RootNetwork(5, 5);
  net.connect(a, b);
  const root = net.roots.get(rootKey(a, b));
  root.transported = 8000;
  net.connect(b, a);
  assert.equal(net.roots.get(rootKey(a, b)), root);
  assert.equal(rootStats(root).level, 4);
  net.remove(a, b);
  net.connect(a, b);
  assert.equal(rootStats(net.roots.get(rootKey(a, b))).level, 1);
});

test('unbounded networks connect across zero and positive/negative chunk boundaries', () => {
  const net = new RootNetwork();
  for (const x of [-17, -16, -1, 0, 15, 16, 10000]) {
    assert.equal(net.connect({ x, y: -25 }, { x: x + 1, y: -25 }), true);
  }
  assert.equal(net.connect({ x: 0.5, y: 0 }, { x: 1.5, y: 0 }), false);
  assert.equal(net.connect({ x: -1, y: 0 }, { x: 0, y: 1 }), false);
  net.add({ x: -1, y: -25 }, 1000);
  net.advance(1);
  assert.ok(net.stored.get('0,-25') > 0);
});

test('equal-fill nutrients flow downhill while equal-fill heat rises', () => {
  for (const kind of ['nutrient', 'heat']) {
    const net = new RootNetwork(5, 5, kind, (tile) => tile.x === 1 ? 0.6 : 0.4);
    net.connect(a, b);
    const half = net.capacity(a) / 2;
    net.add(a, half);
    net.add(b, half);
    net.advance(0.05);
    if (kind === 'nutrient') assert.ok(net.stored.get('2,1') > half);
    else assert.ok(net.stored.get('1,1') > net.stored.get('2,1')); // Both tiles also lose heat to ambient cooling.
    assert.ok(net.roots.get(rootKey(a, b)).transported > 0);
  }
});

test('gravity favors the expected direction but pressure can overcome gentle slopes', () => {
  for (const kind of ['nutrient', 'heat']) {
    const delivered = [];
    for (const slope of [-0.02, 0, 0.02]) {
      const net = new RootNetwork(5, 5, kind, (tile) => 0.5 + (tile.x === 1 ? slope : 0));
      net.connect(a, b);
      net.add(a, net.capacity(a) / 2);
      net.advance(0.05);
      delivered.push(net.stored.get('2,1') ?? 0);
    }
    assert.ok(delivered.every((value) => value > 0));
    if (kind === 'nutrient') assert.ok(delivered[0] < delivered[1] && delivered[1] < delivered[2]);
    else assert.ok(delivered[0] > delivered[1] && delivered[1] > delivered[2]);
  }
});

test('gravity cannot create resources, overflow storage, or award experience to empty roots', () => {
  for (const kind of ['nutrient', 'heat']) {
    const net = new RootNetwork(5, 5, kind, (tile) => tile.x / 4);
    net.connect(a, b);
    net.connect(b, c);
    net.advance(1);
    assert.equal(net.roots.get(rootKey(a, b)).transported, 0);
    net.add(a, net.capacity(a));
    const initial = net.capacity(a);
    net.advance(10);
    const values = [...net.stored.values()];
    assert.ok(values.every((value) => value >= 0 && value <= initial));
    const total = values.reduce((sum, value) => sum + value, 0);
    if (kind === 'nutrient') assert.ok(Math.abs(total - initial) < 1e-8);
    else assert.ok(total < initial);
  }
});

test('soil efficiency changes growth without exceeding heat/nutrient consumption rates', () => {
  const dry = growWithHeat(0, 1, 1000, 0.4);
  const ideal = growWithHeat(0, 1, 1000, 1.3);
  assert.ok(ideal.growth > dry.growth);
  assert.equal(ideal.heatUsed, 100);
  assert.ok(growWithNutrients(0, 1, 20, 1.3).nutrientsUsed <= 1);
  assert.equal(growWithHeat(1, 1, 1000, 1.3).heatUsed, 0);
  assert.equal(growWithNutrients(1, 1, 20, 1.3).nutrientsUsed, 0);
});

test('multi-tile heat storage shares all six ports without duplicating existing resources', () => {
  const net = new RootNetwork();
  const tiles = Array.from({ length: 6 }, (_, index) => ({ x: index % 3, y: Math.floor(index / 3) }));
  net.add(tiles[0], 1000);
  net.add(tiles[5], 2000);
  assert.equal(net.bindFootprint(tiles), true);
  for (const tile of tiles) { assert.equal(net.capacity(tile), 24000); assert.equal(net.amount(tile), 3000); }
  assert.equal([...net.stored.values()].reduce((sum, value) => sum + value, 0), 3000);
  assert.equal(net.consume(tiles[5], 500), 500);
  assert.equal(net.amount(tiles[0]), 2500);
  assert.equal(net.bindFootprint([tiles[0], { x: 9, y: 9 }]), false);
  assert.equal(net.bindFootprint([{ x: NaN, y: 0 }]), false);
  assert.equal(net.amount(tiles[0]), 2500);
});

test('roots attached to non-anchor machine tiles receive heat, while internal links do not earn experience', () => {
  const net = new RootNetwork();
  net.bindFootprint([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }]);
  net.connect({ x: 2, y: 1 }, { x: 3, y: 1 });
  net.connect({ x: 0, y: 0 }, { x: 1, y: 0 });
  net.add({ x: 0, y: 0 }, 24000);
  net.advance(1);
  assert.ok(net.amount({ x: 3, y: 1 }) > 0);
  assert.equal(net.roots.get(rootKey({ x: 0, y: 0 }, { x: 1, y: 0 })).transported, 0);
  assert.ok([...net.stored.values()].reduce((sum, value) => sum + value, 0) < 24000);
});

test('several machine ports cannot overdraw or overflow one shared reservoir', () => {
  const net = new RootNetwork(Infinity, Infinity, 'nutrient');
  const first = { x: 0, y: 0 }, second = { x: 1, y: 0 };
  net.bindFootprint([first, second]);
  net.connect(first, { x: -1, y: 0 });
  net.connect(second, { x: 2, y: 0 });
  net.add(first, 40);
  for (const root of net.roots.values()) root.transported = 96;
  net.advance(20);
  const values = [...net.stored.values()];
  assert.ok(values.every((value) => value >= 0));
  assert.ok(Math.abs(values.reduce((sum, value) => sum + value, 0) - 40) < 1e-8);
  assert.ok(net.amount(first) <= 40);
  assert.ok(net.amount({ x: -1, y: 0 }) <= 20);
  assert.ok(net.amount({ x: 2, y: 0 }) <= 20);
});

test('overgrowth continues consuming heat and nutrients beyond ordinary maturity', () => {
  const heated = growWithHeat(9, 12, 1200, 1, Infinity);
  assert.equal(heated.growth, 11);
  assert.equal(heated.heatUsed, 1200);
  const fed = growWithNutrients(heated.growth, 12, 12, 1, Infinity);
  assert.equal(fed.growth, 12);
  assert.equal(fed.nutrientsUsed, 12);
  const passive = growWithHeat(1, 120, 0, 1, Infinity);
  assert.equal(passive.growth, 11);
});

test('cyan roots require manual payment of 1, 2, 4, 8, 16 Common flowers and cap at level five', () => {
  const {power,water}=createUtilityNetworks(5,5);
  const stacks=[{quality:{id:'rare'},count:50},{quality:{id:'normal'},count:1},{quality:{id:'normal'},count:5},{quality:{id:'normal'},count:25}];
  for(let level=1;level<=5;level++) {
    assert.equal(placePaidRoot(power,a,b,stacks),level===1?'placed':'upgraded');
    assert.equal(rootStats(power.roots.get(rootKey(a,b))).level,level);
    assert.equal(rootStats(water.roots.get(rootKey(a,b))).level,level);
    const remaining=stacks.reduce((sum,s)=>sum+(s?.quality.id==='normal'?s.count:0),0);
    assert.equal(remaining,31-(2**level-1));
  }
  assert.equal(placePaidRoot(power,b,a,stacks),'existing');
  assert.equal(stacks[0].count,50);
  assert.equal(power.roots.size,1);
  assert.equal(water.roots,power.roots);
});

test('an unaffordable cyan upgrade cannot partially charge inventory or change level', () => {
  const {power}=createUtilityNetworks(5,5);
  power.connect(a,b);
  const stacks=[{quality:{id:'normal'},count:1},{quality:{id:'uncommon'},count:100}];
  const before=structuredClone(stacks);
  assert.equal(placePaidRoot(power,b,a,stacks),'unaffordable');
  assert.deepEqual(stacks,before);
  assert.equal(rootStats(power.roots.get(rootKey(a,b))).level,1);
});

test('cyan channels keep water and power independent, water lossless and power 20x less lossy than heat', () => {
  const {power,water}=createUtilityNetworks(5,5);
  const heat=new RootNetwork(5,5);
  power.connect(a,b);heat.connect(a,b);
  power.add(a,4000);water.add(a,20);heat.add(a,4000);
  power.advance(10);water.advance(10);heat.advance(10);
  const sum=net=>[...net.stored.values()].reduce((x,y)=>x+y,0);
  assert.ok(Math.abs(sum(water)-20)<1e-9);
  assert.ok(Math.abs(sum(power)-4000*Math.exp(-.001*10))<1e-6);
  assert.ok(Math.abs(sum(heat)-4000*Math.exp(-.02*10))<1e-6);
  assert.equal(water.capacity(a),20);assert.equal(power.capacity(a),4000);
  assert.ok(water.amount(b)>0 && power.amount(b)>0);
  const saved=water.amount(b);
  power.consume(b,100);
  assert.equal(water.amount(b),saved);
});

test('neither transported power nor water automatically upgrades cyan roots', () => {
  const {power,water}=createUtilityNetworks(5,5);
  power.connect(a,b);
  const root=power.roots.get(rootKey(a,b));
  root.transported=1e9;
  power.add(a,4000);water.add(a,20);
  assert.deepEqual(power.advance(30),[]);
  assert.deepEqual(water.advance(30),[]);
  assert.equal(rootStats(root).level,1);
  assert.equal(rootStats(root).upgradeCost,2);
  assert.equal(rootStats(root).throughput,50);
  assert.equal(power.remove(a,b),true);
  assert.equal(water.roots.size,0);
});

test('generator storage is local, preserves existing power, and research spends only actual stored power', () => {
  const {power,water}=createUtilityNetworks(5,5);
  power.add(a,500);
  power.bindFootprint([a],10000);power.bindFootprint([b],10000);
  assert.equal(power.amount(a),500);
  assert.equal(power.capacity(a),10000);
  assert.equal(water.capacity(a),20);
  power.add(a,6000);power.add(b,9500);
  assert.equal(storedPower(power),16000);
  assert.equal(spendPower(power,17000),false);
  assert.equal(storedPower(power),16000);
  assert.equal(spendPower(power,16000),true);
  assert.equal(storedPower(power),0);
  assert.equal(spendPower(power,1),false);
  assert.equal(spendPower(power,-1),false);
});

test('cyan channels have no gravity bias and produce no water on their own', () => {
  const {power,water}=createUtilityNetworks(5,5,tile=>tile.x/5);
  power.connect(a,b);
  power.add(a,1000);power.add(b,1000);
  water.advance(60);
  assert.equal(water.amount(a)+water.amount(b),0);
  const beforeA=power.amount(a),beforeB=power.amount(b);
  power.advance(1);
  assert.ok(Math.abs(power.amount(a)/beforeA-power.amount(b)/beforeB)<1e-10);
});
