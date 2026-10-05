import test from 'node:test';
import assert from 'node:assert/strict';
import { createSpatialIndex } from '../src/spatial-index.js';
import { bounds } from '../src/entity-geometry.js';
import { stressDocument } from '../src/stress-document.js';
import { createSnapIndex, appendSnapIndex, nearbySnaps } from '../src/snapping.js';
test('spatial queries agree with exhaustive bounds checks and retain source order', async () => {
  const doc = await stressDocument(1000), before=structuredClone(doc);
  const entities=[...doc.entities,{id:'long',type:'line',points:[{x:-1e6,y:-1e6},{x:1e6,y:1e6}]}];
  const index=createSpatialIndex(entities,bounds);
  for (let i=0;i<80;i++) {
    const x=i*271-5000,y=i*137-1000,box={minX:x,minY:y,maxX:x+1300,maxY:y+700};
    const expected=entities.filter(e=>{const b=bounds(e);return b.minX<=box.maxX&&b.maxX>=box.minX&&b.minY<=box.maxY&&b.maxY>=box.minY;});
    assert.deepEqual(index.query(box,true),expected);
  }
  assert.deepEqual(doc,before);assert.deepEqual(createSpatialIndex([]).query({minX:0,maxX:0,minY:0,maxY:0}),[]);
});
test('indexed snapping matches exhaustive snapping for mixed geometry and broad tolerances', async () => {
  const doc=await stressDocument(1000),index=createSnapIndex(doc.entities),linear={points:index.points,edges:index.edges};
  for (const tolerance of [11,150,1200]) for(let i=0;i<20;i++) {
    const p={x:i*451,y:i*233};
    assert.deepEqual(nearbySnaps(index,p,tolerance),nearbySnaps(linear,p,tolerance));
  }
});
test('very wide snap searches avoid comparing every disjoint edge pair', async () => {
  const doc=await stressDocument(10000,{pattern:'lines'}),index=createSnapIndex(doc.entities);
  let matches=0;const query=index.edgeIndex.query;
  index.edgeIndex.query=(...args)=>{const result=query(...args);matches+=result.length;return result;};
  const snaps=nearbySnaps(index,{x:25000,y:25000},100000);
  assert.equal(snaps.length,30000);
  assert.ok(matches<=20000,`returned ${matches} edges`);
  assert.equal(snaps.some(s=>s.kind==='Skärning'),false);
});
test('persistent additions split nodes without modifying earlier indexes or losing order', async () => {
  const entities=(await stressDocument(1000)).entities;
  const original=createSpatialIndex(entities.slice(0,20),bounds);
  let index=original;
  for(let offset=20;offset<entities.length;offset+=7)index=index.append(entities.slice(offset,offset+7));
  const all={minX:-1e6,maxX:1e6,minY:-1e6,maxY:1e6};
  assert.deepEqual(original.query(all,true),entities.slice(0,20));
  assert.deepEqual(index.query(all,true),entities);
  const rebuilt=createSpatialIndex(entities,bounds);
  for(let i=0;i<30;i++) {
    const box={minX:i*291,maxX:i*291+750,minY:i*97,maxY:i*97+500};
    assert.deepEqual(index.query(box,true),rebuilt.query(box,true));
  }
});
test('added snap geometry intersects existing geometry and preserves the old index', () => {
  const horizontal={id:'a',type:'line',points:[{x:-20,y:0},{x:20,y:0}]};
  const circle={id:'b',type:'circle',center:{x:0,y:0},radius:5};
  const original=createSnapIndex([horizontal]),appended=appendSnapIndex(original,[circle]);
  const p={x:5,y:0};
  assert.deepEqual(nearbySnaps(appended,p,.1),nearbySnaps(createSnapIndex([horizontal,circle]),p,.1));
  assert.ok(nearbySnaps(appended,p,.1).some(s=>s.kind==='Skärning'));
  assert.equal(nearbySnaps(original,p,.1).length,0);
});

test('persistent replacement, deletion, reordering and undo match complete scene and snap rebuilds', async () => {
  const initial=(await stressDocument(1000)).entities;
  let entities=initial,index=createSpatialIndex(entities,bounds),snap=createSnapIndex(entities);
  const old=index,oldSnap=snap;
  const {updateSnapIndex}=await import('../src/snapping.js');
  const changed=structuredClone(entities[0]);changed.points=changed.points.map(p=>({x:p.x+2000,y:p.y+1000}));
  for(const next of [
    [changed,...entities.slice(1)],
    entities.slice(3),
    [entities[9],...entities.filter((_,i)=>i!==9)],
    initial,
    [],
    [changed],
    initial,
  ]) {
    entities=next;index=index.update(entities);snap=updateSnapIndex(snap,entities);
    const rebuilt=createSpatialIndex(entities,bounds),rebuiltSnap=createSnapIndex(entities);
    for(let i=0;i<15;i++) {
      const p={x:i*337,y:i*241},box={minX:p.x-300,maxX:p.x+300,minY:p.y-300,maxY:p.y+300};
      assert.deepEqual(index.query(box,true),rebuilt.query(box,true));
      assert.deepEqual(nearbySnaps(snap,p,600),nearbySnaps(rebuiltSnap,p,600));
    }
  }
  const all={minX:-1e6,maxX:1e6,minY:-1e6,maxY:1e6};
  assert.deepEqual(old.query(all,true),initial);
  assert.deepEqual(nearbySnaps(oldSnap,{x:0,y:0},600),nearbySnaps(createSnapIndex(initial),{x:0,y:0},600));
  // Appends after an edit must retain the new ordering and previous snapshots.
  const appended=index.append([{...changed,id:'extra'}]);
  assert.deepEqual(appended.query(all,true),[...initial,{...changed,id:'extra'}]);
});
