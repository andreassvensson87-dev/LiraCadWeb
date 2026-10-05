import test from 'node:test';
import assert from 'node:assert/strict';
import {createDocumentPatch,applyDocumentPatch} from '../src/document-journal.js';
const entity=id=>({id,type:'line',layer:'0',points:[{x:0,y:0},{x:100,y:0}]});
const doc=entities=>({version:1,name:'Ritning',layers:[{id:'0',name:'0',color:'#ffffff'}],entities});
const roundTrip=(before,after)=>{
  const original=structuredClone(before),patch=createDocumentPatch(before,after);
  const restored=patch?applyDocumentPatch(before,JSON.parse(JSON.stringify(patch))):before;
  assert.deepEqual(restored,after);assert.deepEqual(before,original);return patch;
};
test('journal patches round-trip geometry, deletion, middle insertion, metadata and document replacement',()=>{
  const before=doc(['a','b','c','d'].map(entity));
  const moved={...before.entities[1],points:[{x:10,y:20},{x:110,y:20}]};
  const states=[{...before,entities:[before.entities[0],moved,...before.entities.slice(2)]},
    {...before,entities:[before.entities[0],before.entities[3]]},
    {...before,entities:[before.entities[0],entity('new'),...before.entities.slice(1)]},
    {...before,name:'Efter',layouts:[{id:'layout',name:'Ark'}]},
    {...doc([entity('replacement')]),name:'Ny ritning'},
    doc([])];
  for(const after of states){roundTrip(before,after);roundTrip(after,before);}
  assert.equal(createDocumentPatch(before,structuredClone(before)),null);
  roundTrip({...before,layouts:[]},before);
});
function* permutations(items){if(!items.length){yield [];return;}for(let i=0;i<items.length;i++)for(const rest of permutations(items.filter((_,j)=>i!==j)))yield [items[i],...rest];}
test('ordering patches preserve every permutation, with additions, removal and changed contents',()=>{
  const before=doc(['a','b','c','d','e'].map(entity));
  for(const order of permutations(before.entities)) {
    roundTrip(before,{...before,entities:order});
    const after={...before,entities:[entity('new'),...order.filter(e=>e.id!=='c').map(e=>e.id==='b'?{...e,color:'#112233'}:e)]};
    roundTrip(before,after);roundTrip(after,before);
  }
});
test('a small edit in 100000 objects produces a small serializable recovery record',()=>{
  const before=doc(Array.from({length:100000},(_,i)=>entity(String(i))));
  const entities=[...before.entities];entities[50000]={...entities[50000],points:[{x:20,y:30},{x:120,y:30}]};
  const patch=roundTrip(before,{...before,entities});
  assert.ok(JSON.stringify(patch).length<500);
  const removed={...before,entities:before.entities.filter(e=>e.id!=='50000')};
  assert.ok(JSON.stringify(roundTrip(before,removed)).length<200);
  assert.ok(JSON.stringify(roundTrip(removed,before)).length<500);
});
test('malformed patches reject missing IDs, invalid ordering and incomplete additions',()=>{
  const before=doc([entity('a')]),empty={remove:[],upsert:[],place:[],set:{},unset:[]};
  for(const patch of [null,{...empty,remove:['missing']},{...empty,remove:['a','a']},
    {...empty,upsert:[entity('new')]},{...empty,place:[{id:'a',index:10}]},
    {...empty,place:[{id:'missing',index:0}]},{...empty,place:[{id:'a',index:0},{id:'a',index:1}]},
    {...empty,set:{entities:[]}},{...empty,unset:['entities']}])assert.throws(()=>applyDocumentPatch(before,patch),/ogiltig/);
});
