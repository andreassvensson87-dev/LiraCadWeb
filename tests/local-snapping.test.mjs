import test from 'node:test';
import assert from 'node:assert/strict';
import {createLocalSnapIndex} from '../src/local-snapping.js';
import {createSnapIndex,nearbySnaps,resolveSnap} from '../src/snapping.js';
import {createSpatialIndex} from '../src/spatial-index.js';
import {bounds} from '../src/entity-geometry.js';
import {stressDocument} from '../src/stress-document.js';
const line=(id,a,b)=>({id,type:'line',points:[a,b]});
const local=(entities,options={})=>createLocalSnapIndex(entities,{entityIndex:createSpatialIndex(entities,bounds),...options});

test('local snapping preserves exhaustive candidate order at local and overview scales',async()=>{
  const entities=(await stressDocument(1000)).entities,expected=createSnapIndex(entities);
  for(const useDrawingIndex of [false,true]) {
    const index=useDrawingIndex?local(entities):createLocalSnapIndex(entities);
    for(const tolerance of [0,11,150,1200,100000])for(let i=0;i<20;i++) {
      const point={x:i*451,y:i*233};
      assert.deepEqual(nearbySnaps(index,point,tolerance),nearbySnaps(expected,point,tolerance));
    }
    assert.ok(index.cacheStats().objects<=512);assert.ok(index.cacheStats().primitives<=8192);
  }
});
test('offscreen long edges, arc centers and remote block insertion anchors remain eligible',()=>{
  const entities=[line('horizontal',{x:-1e6,y:0},{x:1e6,y:0}),line('vertical',{x:0,y:-1e6},{x:0,y:1e6}),
    {id:'arc',type:'arc',center:{x:10,y:20},radius:50,start:0,sweep:Math.PI/4},
    {id:'block',type:'block',point:{x:1000,y:2000},scale:2,rotation:.4,definition:{entities:[line('part',{x:1000,y:1000},{x:1100,y:1000}),{type:'arc',center:{x:2000,y:1000},radius:20,start:.2,sweep:.1}]}},
    {id:'bulge',type:'polyline',points:[{x:50,y:50},{x:100,y:50}],bulges:[1],closed:false}];
  const index=local(entities),expected=createSnapIndex(entities);
  const anchors=expected.points.map(s=>s.p);
  for(const point of [{x:0,y:0},...anchors])for(const tolerance of [0,.001,20])assert.deepEqual(nearbySnaps(index,point,tolerance),nearbySnaps(expected,point,tolerance));
  assert.ok(nearbySnaps(index,{x:0,y:0},.01).some(s=>s.kind==='Skärning'));
  assert.ok(nearbySnaps(index,{x:10,y:20},.01).some(s=>s.id==='arc'&&s.kind==='Centrum'));
  assert.ok(nearbySnaps(index,{x:1000,y:2000},.01).some(s=>s.id==='block'&&s.kind==='Insättning'));
});
test('warm region reuse and bounded LRU eviction do not change snap results',async()=>{
  const entities=(await stressDocument(1000,{pattern:'lines'})).entities,index=local(entities,{maxCachedObjects:16,maxCachedPrimitives:64}),expected=createSnapIndex(entities);
  const point={x:0,y:0};nearbySnaps(index,point,11);const builds=index.cacheStats().builds;
  nearbySnaps(index,{x:1,y:1},11);assert.equal(index.cacheStats().builds,builds);
  for(let i=0;i<entities.length;i+=5) {
    const p=entities[i].points[0];assert.deepEqual(nearbySnaps(index,p,11),nearbySnaps(expected,p,11));
    const stats=index.cacheStats();assert.ok(stats.objects<=16);assert.ok(stats.primitives<=64);assert.ok(stats.preparedObjects<=16);assert.ok(stats.preparedPrimitives<=64);
  }
  assert.ok(index.cacheStats().evictions>0);
  assert.deepEqual(nearbySnaps(index,point,11),nearbySnaps(expected,point,11));
  const broad=nearbySnaps(index,{x:0,y:0},1e6);assert.equal(broad.length,3000);assert.equal(index.cacheStats().preparedPrimitives,0);
});
test('oversized entities retain only a bounded local window and no full geometry cache',()=>{
  const entity={id:'large',type:'polyline',points:Array.from({length:10000},(_,i)=>({x:i*100,y:0})),closed:false};
  const index=local([entity],{maxCachedObjects:8,maxCachedPrimitives:32}),expected=createSnapIndex([entity]);
  assert.deepEqual(nearbySnaps(index,{x:0,y:0},11),nearbySnaps(expected,{x:0,y:0},11));
  const stats=index.cacheStats();assert.equal(stats.objects,0);assert.equal(stats.primitives,0);assert.ok(stats.preparedPrimitives<=32);
  nearbySnaps(index,{x:1,y:0},11);assert.equal(index.cacheStats().builds,stats.builds);
});
test('append, replacement, deletion, ordering, visibility and undo invalidate the local window',()=>{
  const initial=[line('a',{x:-10,y:0},{x:10,y:0}),line('b',{x:0,y:-10},{x:0,y:10})];
  let entities=initial,scene=createSpatialIndex(entities,bounds),enabled=true;
  const index=createLocalSnapIndex(entities,{entityIndex:scene,eligible:e=>enabled||e.id!=='b'});
  const check=()=>assert.deepEqual(nearbySnaps(index,{x:0,y:0},30),nearbySnaps(createSnapIndex(entities.filter(e=>enabled||e.id!=='b')),{x:0,y:0},30));
  check();const added={id:'c',type:'circle',center:{x:0,y:0},radius:5};entities=[...entities,added];scene=scene.append([added]);index.append([added],scene);check();
  for(const next of [[{...entities[0],points:[{x:100,y:0},{x:120,y:0}]},...entities.slice(1)],entities.slice(1),[entities[2],entities[0],entities[1]],initial,[]]) {
    entities=next;scene=scene.update(entities);index.update(entities,scene);check();
    assert.equal(index.cacheStats().preparedObjects<=entities.length,true);
  }
  entities=initial;scene=scene.update(entities);enabled=false;index.update(entities,scene);check();
  enabled=true;index.update(entities,scene);check();
  const candidates=nearbySnaps(index,{x:0,y:0},30),chosen=resolveSnap({raw:{x:0,y:0},candidates,tolerance:30});
  assert.equal(chosen.id,'a');
});
test('layer/paper-like eligibility does not generate snap geometry for excluded objects',()=>{
  const entities=[line('model',{x:0,y:0},{x:100,y:0}),line('paper',{x:0,y:0},{x:0,y:100})];
  const index=local(entities,{eligible:e=>e.id==='paper'});
  const candidates=nearbySnaps(index,{x:0,y:0},11);assert.ok(candidates.every(s=>s.id==='paper'));assert.equal(index.cacheStats().builds,1);
});

test('dimension anchors, multiline text, viewport and leader snaps match the full index',()=>{
  const entities=[{id:'dimension',type:'dimension',kind:'linear',axis:{x:1,y:0},height:5,points:[{x:0,y:0},{x:100,y:0},{x:-500,y:1000}]},
    {id:'text',type:'text',point:{x:1000,y:1000},text:'Första\nAndra',height:20,rotation:Math.PI/4},
    {id:'viewport',type:'viewport',points:[{x:2000,y:1000},{x:2200,y:1200}]},
    {id:'leader',type:'leader',points:[{x:2500,y:1000},{x:2700,y:1100}],text:'Anteckning',height:20}];
  const index=local(entities),expected=createSnapIndex(entities);
  for(const point of expected.points.map(s=>s.p))for(const tolerance of [0,.01,100])assert.deepEqual(nearbySnaps(index,point,tolerance),nearbySnaps(expected,point,tolerance));
  assert.ok(nearbySnaps(index,{x:-500,y:1000},.01).some(s=>s.id==='dimension'));
});
test('numerical padding at long edge endpoints preserves exact snap candidates',()=>{
  const entities=[line('long',{x:0,y:0},{x:1e9,y:0}),line('end',{x:1e9+.25,y:-100},{x:1e9+.25,y:100}),
    ...Array.from({length:80},(_,i)=>line('near-'+i,{x:1e9-10+i/10,y:-10},{x:1e9-10+i/10,y:10}))];
  const index=local(entities),expected=createSnapIndex(entities);
  for(const tolerance of [0,.1,.3,100])assert.deepEqual(nearbySnaps(index,{x:1e9+.25,y:0},tolerance),nearbySnaps(expected,{x:1e9+.25,y:0},tolerance));
});
