import test from 'node:test';import assert from 'node:assert/strict';
import {stretchTarget,stretchWindow} from '../src/stretch.js';import {withParameterValue,updateStretchParameter,moveParameterGrip,blockWorldPoint} from '../src/parametric-blocks.js';import {blockParts} from '../src/blocks.js';import {parameterDisplay} from '../src/block-parameter-overlay.js';import {validDocument} from '../src/document.js';import {DocumentSession} from '../src/document-session.js';import {BlockEditSession} from '../src/block-edit-session.js';import {stretchTools} from '../src/stretch-tools.js';
export function windowBlock(){
 const loop=(id,x1,y1,x2,y2)=>({id,type:'polyline',layer:'0',closed:true,points:[{x:x1,y:y1},{x:x2,y:y1},{x:x2,y:y2},{x:x1,y:y2}]}),entities=[loop('outer',0,0,1000,800),loop('inner',100,100,900,700)];
 const parameter=(id,name,end,a,b,minLength,maxLength)=>{const window=stretchWindow(a,b);return {id,name,start:{x:0,y:0},end,window,targets:entities.map(e=>stretchTarget(e,window)),minLength,maxLength,step:100};};
 return {id:'b',type:'block',layer:'0',point:{x:0,y:0},scale:1,rotation:0,values:{},definition:{id:'def',name:'Fönster',entities,stretchParameters:[parameter('width','Bredd',{x:1000,y:0},{x:850,y:-100},{x:1100,y:900},600,2000),parameter('height','Höjd',{x:0,y:800},{x:-100,y:650},{x:1100,y:900},400,1800)]}};
}
const doc=b=>({version:1,name:'Fönster',layers:[{id:'0',name:'0',color:'#ffffff'}],entities:[b]});
test('width and height constraints preserve all four frame thicknesses and the other instance',()=>{
 const source=windowBlock(),changed=withParameterValue(withParameterValue(source,'width',1460),'height',1240),[outer,inner]=blockParts(changed);assert.deepEqual(changed.parameterValues,{width:1500,height:1200});assert.equal(outer.points[1].x,1500);assert.equal(outer.points[2].y,1200);
 for(let i=0;i<4;i++){assert.equal(Math.abs(outer.points[i].x-inner.points[i].x),100);assert.equal(Math.abs(outer.points[i].y-inner.points[i].y),100);}assert.equal(blockParts(source)[0].points[1].x,1000);assert(validDocument(doc(changed)));
 assert.equal(withParameterValue(source,'width',3000).parameterValues.width,2000);assert.equal(withParameterValue(source,'width',10).parameterValues.width,600);
});
test('steps anchored at the base length respect non-aligned bounds in mirrored rotated grip coordinates',()=>{
 const source=windowBlock();Object.assign(source,{point:{x:30,y:60},scale:2,rotation:Math.PI/3,mirrored:true});Object.assign(source.definition.stretchParameters[0],{minLength:650,maxLength:1950});
 assert.equal(moveParameterGrip(source,'width',blockWorldPoint(source,{x:600,y:10})).parameterValues.width,700);assert.equal(moveParameterGrip(source,'width',blockWorldPoint(source,{x:2100,y:10})).parameterValues.width,1900);
 const bad=withParameterValue(source,'width',1600);bad.parameterValues.width=1650;assert(!validDocument(doc(bad)));bad.parameterValues.width=500;assert(!validDocument(doc(bad)));
});
test('editing a stretch window recalculates targets atomically and display separates moved objects from stretched vertices',()=>{
 const b=windowBlock(),p=b.definition.stretchParameters[0],parts=[...b.definition.entities,{id:'line',type:'line',layer:'0',points:[{x:900,y:20},{x:950,y:20}]}],before=JSON.stringify(p);
 const parameters=updateStretchParameter(b.definition.stretchParameters,p.id,{window:stretchWindow({x:880,y:-10},{x:1050,y:810})},parts);const display=parameterDisplay(parameters[0],parts);assert.equal(display.markers.filter(m=>m.mode==='move').length,2);assert.equal(display.markers.filter(m=>m.mode==='stretch').length,4);assert.equal(display.axis[1].x,1000);assert.equal(JSON.stringify(p),before);
 assert.throws(()=>updateStretchParameter(parameters,p.id,{window:stretchWindow({x:4000,y:0},{x:5000,y:100})},parts));assert.throws(()=>updateStretchParameter(parameters,p.id,{minLength:1100},parts));assert.throws(()=>updateStretchParameter(parameters,p.id,{step:-10},parts));
});
test('BEDIT save normalizes existing instance values to changed constraints in one undoable update; cancel retains the original',()=>{
 const session=new DocumentSession(doc(withParameterValue(windowBlock(),'width',1800))),before=JSON.stringify(session.document),edit=new BlockEditSession(session,session.document.entities[0].definition);
 edit.draft.commit('Bounds',d=>{d.stretchParameters=updateStretchParameter(d.stretchParameters,'width',{maxLength:1400,step:200},d.entities);});edit.finish(true);assert.equal(session.document.entities[0].parameterValues.width,1400);assert(validDocument(JSON.parse(JSON.stringify(session.document))));session.undo();assert.equal(JSON.stringify(session.document),before);session.redo();assert.equal(session.document.entities[0].parameterValues.width,1400);
 const cancel=new BlockEditSession(session,session.document.entities[0].definition);cancel.draft.commit('Step',d=>{d.stretchParameters[0].step=100;});cancel.finish(false);assert.equal(session.document.entities[0].definition.stretchParameters[0].step,200);
});
test('axis and window picking replace the same parameter and retain its constraints; preview remains transient',()=>{
 const b=windowBlock(),ctx={isBlockEditor:true,stretchParameters:b.definition.stretchParameters,editableEntities:b.definition.entities,parameterEdit:{id:'width',part:'axis'}},tool=stretchTools.BSTRETCH;let s=tool.create(ctx);s=tool.handle(s,{type:'point',point:{x:0,y:-50}},ctx).state;assert.equal(tool.preview(s,{x:1000,y:-50})[0].type,'line');let change=tool.handle(s,{type:'point',point:{x:1000,y:-50}},ctx).change;assert.equal(change.parameter.id,'width');assert.equal(change.parameter.step,100);assert.equal(change.parameter.start.y,-50);
 ctx.parameterEdit.part='window';s=tool.create(ctx);s=tool.handle(s,{type:'point',point:{x:880,y:-50}},ctx).state;change=tool.handle(s,{type:'point',point:{x:1100,y:850}},ctx).change;assert.equal(change.parameter.id,'width');assert.equal(change.parameter.maxLength,2000);assert.equal(change.parameter.targets.length,2);
});
