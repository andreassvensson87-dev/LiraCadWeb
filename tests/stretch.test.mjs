import test from 'node:test';import assert from 'node:assert/strict';
import {stretchWindow,stretchTarget,stretchEntity} from '../src/stretch.js';import {stretchTools} from '../src/stretch-tools.js';
import {annotationView,storeAnnotationView} from '../src/annotation-edit.js';
import {withParameterValue,parameterGrips,moveParameterGrip,blockWorldPoint} from '../src/parametric-blocks.js';
import {blockParts,withAttributeText,insertBlock} from '../src/blocks.js';import {validDocument} from '../src/document.js';import {DocumentSession} from '../src/document-session.js';import {BlockEditSession} from '../src/block-edit-session.js';import {grips,gripEntity} from '../src/grips.js';import {toDXF} from '../src/dxf-export.js';import {importDXF} from '../src/dxf-import.js';import {Editor} from '../src/editor.js';
const layers=[{id:'0',name:'0',color:'#ffffff',visible:true,locked:false}],line=(id,a,b)=>({id,type:'line',layer:'0',points:[a,b]}),rect=stretchWindow({x:85,y:-10},{x:110,y:60}),delta={x:50,y:0};
function block(){const entities=[line('bottom',{x:0,y:0},{x:100,y:0}),line('top',{x:0,y:50},{x:100,y:50}),line('right',{x:100,y:0},{x:100,y:50}),line('inner',{x:90,y:0},{x:90,y:50})];const parameter={id:'width',name:'Bredd',start:{x:0,y:0},end:{x:100,y:0},window:rect,targets:entities.map(e=>stretchTarget(e,rect))};return {id:'b',type:'block',layer:'0',point:{x:0,y:0},scale:1,rotation:0,definition:{id:'def',name:'Window',entities,stretchParameters:[parameter]},values:{}};}
const documentOf=entities=>({version:1,name:'Stretch',layers,entities});
test('crossing stretch moves selected vertices and whole enclosed geometry without scaling width, style or inputs',()=>{
 const poly={id:'p',type:'polyline',layer:'0',points:[{x:0,y:0},{x:100,y:0},{x:100,y:50},{x:0,y:50}],closed:true,bulges:[0,0,0,0],lineWeight:0.25},before=JSON.stringify(poly),changed=stretchEntity(poly,stretchTarget(poly,rect),delta);
 assert.deepEqual(changed.points,[{x:0,y:0},{x:150,y:0},{x:150,y:50},{x:0,y:50}]);assert.equal(changed.lineWeight,0.25);assert.equal(JSON.stringify(poly),before);
 const circle={id:'c',type:'circle',layer:'0',center:{x:100,y:20},radius:5};assert.equal(stretchEntity(circle,stretchTarget(circle,rect),delta).radius,5);assert.equal(stretchTarget({...circle,radius:30},rect),null);
});
test('hatch holes and arc endpoints stretch while degenerate geometry is rejected',()=>{
 const hatch={id:'h',type:'hatch',layer:'0',points:[{x:0,y:0},{x:100,y:0},{x:100,y:50},{x:0,y:50}],holes:[[{x:20,y:10},{x:90,y:10},{x:90,y:40},{x:20,y:40}]]};const changed=stretchEntity(hatch,stretchTarget(hatch,rect),delta);assert.equal(changed.holes[0][1].x,140);assert.equal(changed.holes[0][0].x,20);
 const arc={id:'a',type:'arc',layer:'0',center:{x:50,y:0},radius:50,start:0,sweep:Math.PI};const result=stretchEntity(arc,stretchTarget(arc,rect),delta);assert(result.radius>50);assert(validDocument(documentOf([result])));
 const e=line('l',{x:0,y:0},{x:100,y:0});assert.throws(()=>stretchEntity(e,stretchTarget(e,rect),{x:-100,y:0}),/utan längd/);
});
test('block parameter changes only one instance and retains frame thickness, entity IDs and the definition',()=>{
 const source=block(),before=JSON.stringify(source),changed=withParameterValue(source,'width',160),parts=blockParts(changed);
 assert.equal(parts[0].points[0].x,0);assert.equal(parts[0].points[1].x,160);assert.equal(parts[2].points[0].x-parts[3].points[0].x,10);assert.equal(JSON.stringify(source),before);assert.equal(blockParts(source)[2].points[0].x,100);
 assert(validDocument(documentOf([changed])));assert.equal(insertBlock(changed,{x:0,y:0},'0','model').parameterValues.width,undefined);
});
test('parameter grips work in rotated, scaled and mirrored coordinates and off-axis dragging is projected onto the length axis',()=>{
 const source={...block(),point:{x:300,y:400},rotation:Math.PI/2,scale:2,mirrored:true},g=parameterGrips(source)[0],target=blockWorldPoint(source,{x:170,y:30}),changed=moveParameterGrip(source,'width',target);assert.equal(changed.parameterValues.width,170);
 assert(grips(source).some(g=>g.kind==='blockStretch'));assert.equal(gripEntity(source,g,target).parameterValues.width,170);assert.deepEqual(blockParts(changed)[2].points[0],blockWorldPoint(changed,{x:170,y:0}));
});
test('parameters and instance values survive project save, autosave snapshots and undo/redo; malformed targets are rejected',()=>{
 const session=new DocumentSession(documentOf([block()]));session.commit('Width',draft=>{draft.entities[0]=withParameterValue(draft.entities[0],'width',160);});const saved=JSON.parse(JSON.stringify(session.document));assert(validDocument(saved));assert.equal(blockParts(saved.entities[0])[2].points[0].x,160);
 session.undo();assert.equal(blockParts(session.document.entities[0])[2].points[0].x,100);session.redo();assert.equal(blockParts(session.document.entities[0])[2].points[0].x,160);
 const bad=block();bad.definition.stretchParameters[0].targets[0].indices=[500];assert(!validDocument(documentOf([bad])));assert.throws(()=>withParameterValue(block(),'missing',100));assert.throws(()=>withParameterValue(block(),'width',-5));
});
test('block editor preserves parameter identities and basepoint translation; cancel leaves parent untouched',()=>{
 const parent=new DocumentSession(documentOf([withParameterValue(block(),'width',160)])),edit=new BlockEditSession(parent,block().definition);edit.draft.commit('Base',draft=>{draft.blockBase={x:10,y:5};});edit.finish(true);
 const changed=parent.document.entities[0];assert.equal(changed.parameterValues.width,160);assert.equal(changed.definition.stretchParameters[0].start.x,-10);assert.equal(blockParts(changed)[2].points[0].x,150);
 const before=JSON.stringify(parent.document),cancel=new BlockEditSession(parent,changed.definition);cancel.draft.commit('Remove',draft=>{draft.stretchParameters=[];});cancel.finish(false);assert.equal(JSON.stringify(parent.document),before);
});
test('text attribute overrides are stored before parameter displacement and move once with the stretched block',()=>{
 const source=block(),text={id:'attr',type:'text',layer:'0',attributeTag:'NAME',text:'Default',point:{x:100,y:30},height:5,rotation:0};source.definition.entities.push(text);source.definition.stretchParameters[0].targets.push(stretchTarget(text,rect));source.values.NAME='Value';const stretched=withParameterValue(source,'width',160),world=blockParts(stretched).find(e=>e.attributeTag);const edited=withAttributeText(stretched,'NAME',{...world,text:'Changed',height:8});assert.equal(edited.attributeOverrides.NAME.point.x,100);assert.equal(blockParts(edited).find(e=>e.attributeTag).point.x,160);assert.equal(edited.values.NAME,'Changed');
});
test('DXF bakes each smart-block instance length into separate static block geometry',()=>{
 const a=block(),b={...withParameterValue(block(),'width',160),id:'b2',point:{x:300,y:0}};const result=importDXF(toDXF(documentOf([a,b]))).document;assert(validDocument(result));const parts=result.entities.filter(e=>e.type==='block').map(blockParts);assert.equal(Math.max(...parts[0].flatMap(e=>e.points.map(p=>p.x))),100);assert.equal(Math.max(...parts[1].flatMap(e=>e.points.map(p=>p.x))),460);
});
test('model stretch updates stored annotation-scale geometry without mutating the original variants',()=>{
 const source=line('annotated',{x:0,y:0},{x:100,y:0});source.annotationVariants=[{denominator:50,entity:line('annotated',{x:0,y:5},{x:100,y:5})}];const changed=stretchEntity(source,stretchTarget(source,rect),delta);
 assert.equal(changed.annotationVariants[0].entity.points[1].x,150);assert.equal(source.annotationVariants[0].entity.points[1].x,100);assert(validDocument(documentOf([changed])));
});
test('block length is shared across annotation scales while variant placement remains independent',()=>{
 const source=block(),variant={...block(),point:{x:300,y:0},scale:2};source.annotationVariants=[{denominator:50,entity:variant}];const view=annotationView(source,{annotationScale:50}),edited=withParameterValue(view,'width',160),stored=storeAnnotationView(source,edited);
 assert.equal(blockParts(stored)[2].points[0].x,160);assert.equal(blockParts(annotationView(stored,{annotationScale:50}))[2].points[0].x,620);assert.equal(stored.point.x,0);assert(validDocument(documentOf([stored])));
});
test('STRETCH command uses an immutable preview and one accepted transaction; BSTRETCH creates a parameter only in BEDIT',()=>{
 const e=line('l',{x:0,y:0},{x:100,y:0}),context={entities:[],editableEntities:[e]},changes=[],editor=new Editor({tools:stretchTools,getContext:()=>context,applyChange:c=>changes.push(c)});editor.start('STRETCH');for(const p of [{x:85,y:-10},{x:110,y:60},{x:0,y:0}])editor.dispatch({type:'point',point:p});assert.equal(editor.preview({x:50,y:0})[0].points[1].x,150);assert.equal(e.points[1].x,100);editor.dispatch({type:'text',text:'@50,0',cursor:{x:0,y:0}});assert.equal(changes.length,1);assert.equal(changes[0].entities[0].points[1].x,150);assert.equal(editor.state,null);
 const t=stretchTools.BSTRETCH,state=t.create();assert.match(t.handle(state,{type:'text',text:'Width'},context).message,/BEDIT/);let s=t.handle(state,{type:'text',text:'Width'},{...context,isBlockEditor:true}).state;for(const p of [{x:0,y:0},{x:100,y:0},{x:85,y:-10}])s=t.handle(s,{type:'point',point:p},{...context,isBlockEditor:true}).state;const result=t.handle(s,{type:'point',point:{x:110,y:60}},{...context,isBlockEditor:true});assert.equal(result.change.kind,'blockParameter');assert.equal(result.change.parameter.targets.length,1);
});
