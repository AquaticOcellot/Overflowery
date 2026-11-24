import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTS} from './load-ts.mjs';
const {PlantMovement}=await loadTS(new URL('../src/plant-movement.ts',import.meta.url));
const {relocatePlants}=await loadTS(new URL('../src/plant-relocation.ts',import.meta.url));
const {chunkSize}=await loadTS(new URL('../src/world.ts',import.meta.url));
const key=p=>`${p.x},${p.y}`;
function simulation(entries,targets,{size=20,discover=()=>{}}={}){
  const plants=new Map(entries.map(([x,y,id],i)=>[`${x},${y}`,{uid:i+1,x,y,id,growth:0,watering:0,elevation:0}]));
  const tiles=new Map();
  const world={getTile(x,y){const k=`${x},${y}`;if(!tiles.has(k))tiles.set(k,{x,y,terrain:Math.abs(x)<=size&&Math.abs(y)<=size?'land':'water',flower:plants.get(k)?.id,growth:0,watering:0,elevation:0});return tiles.get(k);}};
  const designations=new Map(targets.map(([x,y,flower])=>[`${x},${y}`,{x,y,flower}]));
  let transactions=0,discoveries=0;
  const movement=new PlantMovement({plants:()=>plants.values(),at:p=>plants.get(key(p)),walkable:p=>world.getTile(p.x,p.y).terrain==='land',discover:p=>{discoveries++;discover(p,plants);},resetCycle:p=>{p.growth=0;},relocate:moves=>{for(const m of moves)assert.ok(m.plant.growth>=1);assert.ok(moves.length<=2);relocatePlants(moves,plants,world);transactions++;}},designations);
  function frame(grow=true,budgetMs=3){movement.beginFrame(1,budgetMs);movement.planTick();if(grow)for(const p of movement.activePlants())p.growth=1;for(let i=0;i<100;i++)movement.step();}
  const satisfied=()=>[...designations.values()].every(t=>plants.get(key(t))?.id===t.flower);
  return {plants,world,designations,movement,frame,satisfied,get transactions(){return transactions;},get discoveries(){return discoveries;}};
}

test('both swap participants must complete and spend their cycles',()=>{
  const s=simulation([[0,0,'blue'],[1,0,'red']],[[2,0,'blue']]);
  for(let i=0;i<20;i++)s.frame(false);
  const blue=[...s.plants.values()].find(p=>p.id==='blue'),red=[...s.plants.values()].find(p=>p.id==='red');
  blue.growth=1;s.frame(false);assert.equal(s.transactions,0);
  red.growth=1;s.frame(false);assert.equal(s.transactions,1);assert.equal(blue.x,1);assert.equal(red.x,0);assert.equal(blue.growth,0);assert.equal(red.growth,0);
});

test('pending harvests cannot be recruited or displaced',()=>{
  const s=simulation([[0,0,'blue'],[1,0,'red']],[[2,0,'blue']]);
  s.plants.get('1,0').harvest={qualities:[1]};
  for(let i=0;i<100;i++)s.frame();assert.equal(s.transactions,0);assert.equal(s.plants.get('1,0').id,'red');
  delete s.plants.get('1,0').harvest;
  for(let i=0;i<100&&!s.satisfied();i++)s.frame();assert.ok(s.satisfied());
});

test('wrong colors evacuate to acceptable soil and targets fill through dense blockers',()=>{
  const entries=[];for(let y=-3;y<=3;y++)for(let x=-3;x<=3;x++)entries.push([x,y,(x+y)%2?'red':'blue']);
  const targets=[];for(let y=-1;y<=1;y++)for(let x=-1;x<=1;x++)targets.push([x,y,'blue']);
  const s=simulation(entries,targets);
  for(let i=0;i<3000&&!s.satisfied();i++)s.frame();assert.ok(s.satisfied());
  assert.equal(s.plants.size,49);assert.equal(new Set([...s.plants.values()].map(p=>p.uid)).size,49);
  for(const [k,p]of s.plants)assert.equal(s.world.getTile(p.x,p.y).flower,p.id,k);
});

test('clearing reservations releases control without removing unrelated work',()=>{
  const s=simulation([[0,0,'blue'],[0,5,'red']],[[4,0,'blue'],[4,5,'red']]);
  for(let i=0;i<10;i++)s.frame(false);
  const red=s.movement.reservations.byDestination.get('4,5');assert.ok(red);
  s.designations.delete('4,0');s.movement.changed();
  assert.equal(s.movement.reservations.byDestination.get('4,5'),red);
  assert.ok(!s.movement.isControlled(s.plants.get('0,0')));
  for(let i=0;i<100&&!s.satisfied();i++)s.frame();assert.ok(s.satisfied());
});

test('movement continues past the former transaction limit within a shared time budget',()=>{
  const s=simulation([[0,0,'blue']],[[15,0,'blue']]);
  for(let i=0;i<10;i++)s.frame(false);
  s.movement.beginFrame(1,100);s.movement.planTick();const before=s.transactions;
  for(let i=0;i<100;i++){for(const p of s.movement.activePlants())p.growth=1;s.movement.step();}
  assert.ok(s.transactions-before>2);
});

test('mixed-color layouts converge without swap-back loops',()=>{
  for(let seed=1;seed<=100;seed++){
    let random=seed;const rand=()=>{random=(Math.imul(random,1664525)+1013904223)>>>0;return random/2**32;};
    const entries=[];for(let y=-3;y<=3;y++)for(let x=-3;x<=3;x++)if(rand()<.8)entries.push([x,y,['blue','red','yellow'][Math.floor(rand()*3)]]);
    entries.push([-4,0,'blue'],[-4,1,'red'],[-4,2,'yellow']);
    const targets=[];for(let y=-1;y<=1;y++)for(let x=-1;x<=1;x++)targets.push([x,y,['blue','red','yellow'][Math.floor(rand()*3)]]);
    const s=simulation(entries,targets);
    for(let i=0;i<2500&&!s.satisfied();i++)s.frame();
    assert.ok(s.satisfied(),`seed ${seed}: ${JSON.stringify([...s.movement.reservations.byPlant.values()])}`);
    for(let i=0;i<500;i++)s.frame();
    assert.ok(s.satisfied(),`seed ${seed} did not remain settled`);
    assert.equal(s.movement.reservations.byPlant.size,0,`seed ${seed} has unfinished tasks`);
    assert.equal(s.plants.size,entries.length);
  }
});

test('discovery is bounded and a newly generated closer plant wins the reservation',()=>{
  let added=false;
  const s=simulation([[18,0,'blue']],[[0,0,'blue']],{discover:(chunk,plants)=>{
    if(chunk.x===0&&chunk.y===0&&!added){plants.set('3,0',{uid:99,id:'blue',x:3,y:0,growth:0,watering:0,elevation:0});added=true;}
  }});
  for(let i=0;i<30;i++){const before=s.discoveries;s.frame(false);assert.ok(s.discoveries-before<=2);}
  assert.equal(s.movement.reservations.byDestination.get('0,0')?.plantUid,99);
});

test('missing species are discovered incrementally instead of blocking a frame',()=>{
  const s=simulation([],[[0,0,'blue']],{size:100,discover:(chunk,plants)=>{
    if(chunk.x===1&&chunk.y===0)plants.set(`${chunkSize},0`,{uid:1,id:'blue',x:chunkSize,y:0,growth:0,watering:0,elevation:0});
  }});
  for(let i=0;i<200&&!s.satisfied();i++){const before=s.discoveries;s.frame();assert.ok(s.discoveries-before<=2);}
  assert.ok(s.satisfied(), `not filled: ${JSON.stringify({ discoveries:s.discoveries, plants:[...s.plants].map(([k,p])=>({key:k,uid:p.uid,id:p.id,x:String(p.x),y:p.y})), jobs:[...s.movement.reservations.byPlant.values()], bounds:[...s.movement.discoveryBounds] })}`);
});

test('routes detour around water and buildings rather than replanning around flowers',()=>{
  const s=simulation([[-3,0,'blue'] ],[[3,0,'blue']]);
  for(let y=-2;y<=2;y++)s.world.getTile(0,y).terrain='water';
  for(let i=0;i<300&&!s.satisfied();i++)s.frame();assert.ok(s.satisfied());
  assert.equal(s.plants.size,1);
});

test('atomic relocation rejects an occupied destination without changing sources',()=>{
  const s=simulation([[0,0,'blue'],[1,0,'red']],[]);
  const blue=s.plants.get('0,0');
  assert.throws(()=>relocatePlants([{plant:blue,to:{x:1,y:0}}],s.plants,s.world),/Invalid/);
  assert.equal(s.plants.get('0,0'),blue);assert.equal(blue.x,0);assert.equal(s.world.getTile(0,0).flower,'blue');
});

test('repainting evacuation soil releases the incompatible destination claim',()=>{
  const s=simulation([[0,0,'red'],[3,0,'blue']],[[0,0,'blue']]);
  for(let i=0;i<30;i++)s.frame(false);
  const evacuation=[...s.movement.reservations.byPlant.values()].find(j=>j.kind==='evacuate');assert.ok(evacuation?.destination);
  const oldKey=key(evacuation.destination);
  s.designations.set(oldKey,{...evacuation.destination,flower:'blue'});s.movement.changed();
  assert.equal(evacuation.destination,undefined);assert.ok(!s.movement.reservations.byDestination.has(oldKey));
  for(let i=0;i<30;i++)s.frame(false);
  if(evacuation.destination)assert.notEqual(key(evacuation.destination),oldKey);
});

test('a nearby evacuating flower becomes the filler without restarting its cycle',()=>{
  const s=simulation([[0,0,'blue'],[8,0,'blue'],[0,8,'red']],[[0,0,'red'],[3,0,'blue']]);
  const blue=s.plants.get('0,0');
  let evacuation;
  for(let i=0;i<1000;i++){
    s.frame(false,1);
    const job=s.movement.reservations.byPlant.get(blue.uid);
    if(job?.kind==='evacuate'&&job.destination){evacuation=job;break;}
  }
  assert.ok(evacuation?.destination,'evacuation must have a reserved free tile first');
  const oldDestination=key(evacuation.destination);
  blue.growth=.6;
  for(let i=0;i<1000&&!s.movement.reservations.byDestination.has('3,0');i++)s.frame(false,1);
  const fill=s.movement.reservations.byDestination.get('3,0');
  assert.equal(fill?.plantUid,blue.uid,'nearby evacuee should beat the distant idle flower');
  assert.equal(fill.kind,'fill');
  assert.equal(fill.precedence,fill.ticket,'fill uses its own destination request precedence');
  assert.equal(blue.growth,.6,'changing destination must preserve completed growth');
  assert.ok(!s.movement.reservations.byDestination.has(oldDestination),'old evacuation claim must be released');
  assert.ok(!s.movement.reservations.byPlant.has(s.plants.get('8,0').uid),'distant flower remains available');
  for(let i=0;i<300&&!s.satisfied();i++)s.frame();
  assert.ok(s.satisfied());
});
