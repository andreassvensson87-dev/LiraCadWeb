import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createLocalSnapIndex } from '../src/local-snapping.js';
import { nearbySnaps, resolveSnap } from '../src/snapping.js';
import { dist } from '../src/geometry.js';

const source = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
const section = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
function fixture({ osnap = true, gridSnap = false, picking = 'base' } = {}) {
  const entities = [
    { id:'line', type:'line', points:[{x:0,y:0},{x:100,y:0}] },
    { id:'circle', type:'circle', center:{x:200,y:50}, radius:20 },
    { id:'vertical', type:'line', points:[{x:25,y:-50},{x:25,y:50}] },
  ];
  const cache = createLocalSnapIndex(entities);
  return new Function('snapCache','nearbySnaps','resolveSnap','dist','options',`
    let rawCursor, cursor, snap, drag=null;
    const tool={name:'WBLOCK',phase:options.picking==='base'?'dialogBase':'select',points:[]};
    const osnap=options.osnap,gridSnap=options.gridSnap,ortho=false,polarEnabled=false,tracking=false;
    const activeSpace='model',activeViewportId=null,trackAnchors=[],camera={scale:2},mouse={x:20,y:20},width=500,height=500;
    const elements={}, $=key=>elements[key] ||= {value:'45'},fmt=String,acquireTrack=()=>{},gridStep=()=>50;
    let accepted=null;
    const wblockDialog={picking:options.picking,resume:p=>accepted=p};
    ${section('function resolveCursor() {','function moveCursor(ev) {')}
    ${section('function acceptPoint(p) {','function submit(value) {')}
    return {move(p){rawCursor=p;resolveCursor();return {cursor,snap,feedback:$('#snap-feedback').textContent};},
      click(){acceptPoint(cursor);return accepted;}};
  `)(cache,nearbySnaps,resolveSnap,dist,{osnap,gridSnap,picking});
}

test('WBLOCK base picker snaps to endpoints, midpoints, centers and intersections and accepts the snapped point', () => {
  const f=fixture();
  for(const [raw,expected] of [
    [{x:98,y:2},{x:100,y:0}],
    [{x:49,y:2},{x:50,y:0}],
    [{x:201,y:52},{x:200,y:50}],
    [{x:26,y:2},{x:25,y:0}],
  ]) {
    const result=f.move(raw);
    assert.equal(result.snap?.mode,'object');assert.deepEqual(result.cursor,expected);
    assert.ok(result.feedback);assert.deepEqual(f.click(),expected);
  }
});
test('WBLOCK base picker respects disabled OSNAP and optional grid snap', () => {
  const f=fixture({osnap:false}),raw={x:98,y:2};
  assert.deepEqual(f.move(raw).cursor,raw);assert.deepEqual(f.click(),raw);
  const grid=fixture({osnap:false,gridSnap:true});
  assert.deepEqual(grid.move(raw).cursor,{x:100,y:0});assert.deepEqual(grid.click(),{x:100,y:0});
});
test('WBLOCK object selection does not activate point snapping', () => {
  const f=fixture({picking:'objects'}),raw={x:98,y:2};
  const result=f.move(raw);assert.equal(result.snap,null);assert.deepEqual(result.cursor,raw);
});
