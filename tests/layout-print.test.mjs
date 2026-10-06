import test from 'node:test';
import assert from 'node:assert/strict';
import {recoverEmptyViewports,viewportHasGeometry} from '../src/layout.js';
import {layoutSVG} from '../src/plot.js';
import {toDXF} from '../src/dxf-export.js';
import {importDXF} from '../src/dxf-import.js';
import {createEntityRenderer} from '../src/entity-renderer.js';
const line={id:'line',type:'line',layer:'0',points:[{x:0,y:0},{x:10000,y:2000}]};
const viewport=(id,scale,center)=>({id,type:'viewport',layer:'vp',space:'paper',points:[{x:0,y:0},{x:100,y:100}],viewScale:scale,viewCenter:center,locked:true,viewRotation:Math.PI/2});
const layers=[{id:'0',name:'0',color:'#ff0000',lineType:'CONTINUOUS',lineWeight:.5},{id:'vp',name:'Viewports',color:'#ffffff',lineType:'CONTINUOUS',plot:false}];
const layout={id:'paper',name:'Sheet',width:420,height:297};
test('empty-view recovery changes only empty views, keeps paper clipping/rotation/lock, uses fitting standard scale and is idempotent',()=>{
 const good=viewport('good',.01,{x:5000,y:1000}),bad=viewport('bad',.01,{x:500000,y:100000}),other={...bad,id:'other',space:'other'};
 const result=recoverEmptyViewports([line,good,bad,other],'paper',[line]);assert.equal(result.count,1);assert.equal(result.entities[1],good);assert.equal(result.entities[3],other);
 const recovered=result.entities[2];assert.equal(recovered.viewScale,1/200);assert.deepEqual(recovered.points,bad.points);assert.equal(recovered.viewRotation,bad.viewRotation);assert.equal(recovered.locked,true);assert.ok(viewportHasGeometry(recovered,[line]));
 assert.equal(recoverEmptyViewports(result.entities,'paper',[line]).count,0);assert.equal(recoverEmptyViewports([bad],'paper',[]).count,0);
});
test('SVG expresses physical mm lineweight at different viewport scales, respects plotting flags and colors',()=>{
 const v1=viewport('v1',.01,{x:0,y:0}),v2={...viewport('v2',.02,{x:0,y:0}),points:[{x:120,y:0},{x:220,y:100}]};
 const hidden={...line,id:'nonplot',layer:'vp',space:'paper',points:[{x:331,y:332},{x:333,y:334}]};
 const doc={version:1,layers,layouts:[layout],entities:[line,v1,v2,hidden,{...line,id:'paper',space:'paper'}]};
 const svg=layoutSVG(doc,layout);assert.match(svg,/width="420mm" height="297mm"/);assert.match(svg,/stroke-width="50"/);assert.match(svg,/stroke-width="25"/);assert.match(svg,/stroke-width="0.5"/);assert.doesNotMatch(svg,/vector-effect|331 332/);assert.match(svg,/stroke="#ff0000"/);
 const mono=layoutSVG(doc,{...layout,monochrome:true});assert.doesNotMatch(mono,/#ff0000/);assert.match(mono,/stroke="#000000"/);
 const roundtrip=importDXF(toDXF(doc)).document;assert.equal(roundtrip.layers.find(l=>l.name==='Viewports').plot,false);assert.equal(roundtrip.layers.find(l=>l.name==='0').lineWeight,.5);
});
test('paper canvas lineweight uses the paper camera, independent of model viewport magnification',()=>{
 const ctx=new Proxy({}, {get:(t,k)=>t[k]||(()=>{}),set:(t,k,v)=>(t[k]=v,true)});
 let scale=.02;
 const renderer=createEntityRenderer({ctx,screen:p=>p,getCamera:()=>({scale}),layerOf:()=>layers[0],paperScale:()=>4});
 renderer.drawEntity(line,'#ff0000');assert.equal(ctx.lineWidth,2);
 scale=.1;renderer.drawEntity(line,'#ff0000');assert.equal(ctx.lineWidth,2);
});
