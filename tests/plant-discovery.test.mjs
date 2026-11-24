import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTS} from './load-ts.mjs';
const {ChunkWorld,chunkCoordinate}=await loadTS(new URL('../src/world.ts',import.meta.url));
const {PlantMovement}=await loadTS(new URL('../src/plant-movement.ts',import.meta.url));
const {relocatePlants}=await loadTS(new URL('../src/plant-relocation.ts',import.meta.url));
const key=p=>`${p.x},${p.y}`;

test('cross of four distant species fills using real chunk generation and hydration',()=>{
  const world=new ChunkWorld(),plants=new Map(),hydrated=new Set();let uid=0;
  function hydrate(chunk){
    if(hydrated.has(key(chunk)))return;hydrated.add(key(chunk));
    for(const tile of chunk.tiles)if(tile.flower&&!plants.has(key(tile)))plants.set(key(tile),{...tile,id:tile.flower,uid:++uid});
  }
  for(let y=-1;y<=1;y++)for(let x=-1;x<=1;x++)hydrate(world.getChunk(x,y));
  // The visible area starts with only yellow, as in the reported arrangement.
  for(const [k,p]of plants)if(p.id!=='yellow'){plants.delete(k);world.getTile(p.x,p.y).flower=undefined;}
  const center=[...plants.values()].find(p=>p.id==='yellow');assert.ok(center);
  const targets=new Map();
  for(let offset=-5;offset<=5;offset++){
    for(const [dx,dy,flower]of [[offset,-1,'purple'],[offset,0,'yellow'],[offset,1,'blue'],[0,offset,'red'],[1,offset,'red']]){
      const p={x:center.x+dx,y:center.y+dy},tile=world.getTile(p.x,p.y);
      if(tile.terrain!=='land')continue;
      targets.set(key(p),{...p,flower});plants.delete(key(p));tile.flower=undefined;
    }
  }
  const movement=new PlantMovement({plants:()=>plants.values(),at:p=>{hydrate(world.getChunk(chunkCoordinate(p.x),chunkCoordinate(p.y)));return plants.get(key(p));},walkable:p=>world.getTile(p.x,p.y).terrain==='land',discover:p=>hydrate(world.getChunk(p.x,p.y)),resetCycle:p=>{p.growth=0;},relocate:moves=>relocatePlants(moves,plants,world)},targets);
  const filled=()=>[...targets.values()].filter(t=>plants.get(key(t))?.id===t.flower).length;
  for(let frame=0;frame<1800&&filled()<targets.size;frame++){
    movement.beginFrame();for(const p of movement.activePlants())p.growth=1;movement.step();
  }
  assert.equal(filled(),targets.size,`only ${filled()}/${targets.size} filled; ${plants.size} plants, ${world.chunks.size} chunks, ${movement.reservations.byPlant.size} requests; missing ${JSON.stringify([...targets.values()].filter(t=>plants.get(key(t))?.id!==t.flower).map(t=>t.flower))}; candidates ${JSON.stringify([...plants.values()].reduce((a,p)=>(a[p.id]=(a[p.id]??0)+1,a),{}))}; excluded ${movement.unreachable.size}; bounds ${JSON.stringify([...movement.discoveryBounds])}`);
});
