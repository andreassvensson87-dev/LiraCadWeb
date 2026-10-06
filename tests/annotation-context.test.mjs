import test from 'node:test';
import assert from 'node:assert/strict';
import {annotationEntity,viewportEntities} from '../src/annotation-context.js';
import {importDXF} from '../src/dxf-import.js';
import {toDXF} from '../src/dxf-export.js';
import {validDocument} from '../src/document.js';
import {transformed} from '../src/entity-transform.js';
import {layoutSVG} from '../src/plot.js';
const layers=[{id:'0',name:'0',color:'#ffffff',lineType:'CONTINUOUS'}];
const base={point:{x:0,y:0},scale:50,rotation:0,mirrored:false};
const contexts=[{...base,denominator:50},{point:{x:200,y:100},scale:20,rotation:Math.PI/2,mirrored:false,denominator:20}];
const text={id:'t',type:'text',layer:'0',point:{x:0,y:0},height:2,text:'Annotation',font:'Arial',textAlign:'left',textVertical:'baseline',rotation:0};
const block={id:'b',type:'block',layer:'0',point:{x:0,y:0},scale:50,rotation:0,mirrored:false,values:{},definition:{id:'def',name:'Annotation',entities:[text]},annotative:true,annotationBase:base,annotationContexts:contexts};
const viewport=(id,denominator)=>({id,type:'viewport',space:'paper',layer:'0',points:[{x:0,y:0},{x:100,y:100}],viewCenter:{x:0,y:0},viewScale:1/denominator,annotationScale:denominator});
const layout={id:'paper',name:'Sheet',width:420,height:297};
test('stored annotation contexts keep paper height across viewports and use their own insertion/rotation, independent of plot scale',()=>{
 const a=annotationEntity(block,viewport('a',20)),b=annotationEntity(block,viewport('b',50));
 assert.deepEqual(a.point,{x:200,y:100});assert.equal(a.rotation,Math.PI/2);
 assert.equal(text.height*a.scale/20,text.height*b.scale/50);
 const mixed={...viewport('a',20),viewScale:1/40};assert.equal(annotationEntity(block,mixed).scale,20);
 const ordinary={...text,height:100};assert.equal(annotationEntity(ordinary,mixed),ordinary);
 const d={version:1,layers,layouts:[layout],entities:[block,mixed,{...viewport('b',50),points:[{x:120,y:0},{x:220,y:100}]}]};
 const svg=layoutSVG(d,layout);const sizes=[...svg.matchAll(/font-size="([^"]+)"/g)].map(m=>Number(m[1]));assert.equal(sizes.length,2);assert.ok(Math.abs(sizes[0]/sizes[1]-.4)<1e-10);
});
test('missing matching contexts remain base geometry by default, explicit filter hides them and frozen layers are per viewport',()=>{
 const v=viewport('v',100);assert.equal(annotationEntity(block,v),block);assert.equal(annotationEntity(block,{...v,showAllAnnotations:false}),null);
 assert.deepEqual(viewportEntities([block,text],{...v,frozenLayers:['0']},layers),[]);
 assert.equal(viewportEntities([block,text],v,layers).length,2);
});
test('instance move/scale/mirror affects every representation without changing the source or other instances',()=>{
 const move=transformed(block,'MOVE',{x:0,y:0},{x:1000,y:500});assert.deepEqual(annotationEntity(move,viewport('v',20)).point,{x:1200,y:600});
 const bigger=transformed(block,'SCALE',{x:0,y:0},{x:0,y:0},2);assert.equal(annotationEntity(bigger,viewport('v',20)).scale,40);assert.deepEqual(annotationEntity(bigger,viewport('v',20)).point,{x:400,y:200});
 const mirror=transformed(block,'MIRROR',{x:0,y:0},{x:1,y:0});const resolved=annotationEntity(mirror,viewport('v',20));assert.equal(resolved.point.y,-100);assert.equal(resolved.rotation,-Math.PI/2);assert.equal(resolved.mirrored,true);
 assert.deepEqual(block.annotationContexts,contexts);assert.equal(block.scale,50);
});
const pairs=(...values)=>values.join('\n')+'\n';
const source=pairs(0,'SECTION',2,'TABLES',0,'LAYER',5,'L',2,'0',62,7,6,'CONTINUOUS',0,'ENDSEC',
 0,'SECTION',2,'BLOCKS',0,'BLOCK',2,'Inner',10,0,20,0,0,'TEXT',8,'0',1,'Annotation',10,0,20,0,40,2,0,'ENDBLK',
 0,'BLOCK',2,'Outer',10,0,20,0,0,'INSERT',5,'I',360,'D1',8,'0',2,'Inner',10,0,20,0,41,50,42,50,0,'ENDBLK',0,'ENDSEC',
 0,'SECTION',2,'ENTITIES',0,'INSERT',8,'0',2,'Outer',10,1000,20,500,41,2,42,2,0,'VIEWPORT',5,'V',360,'VD',8,'0',410,'Sheet',69,2,10,50,20,50,40,100,41,100,45,4000,331,'L',0,'ENDSEC',
 0,'SECTION',2,'OBJECTS',0,'DICTIONARY',5,'D1',3,'AcDbContextDataManager',360,'D2',0,'DICTIONARY',5,'D2',3,'ACDB_ANNOTATIONSCALES',350,'D3',0,'DICTIONARY',5,'D3',3,'*A1',350,'C1',
 0,'ACDB_BLKREFOBJECTCONTEXTDATA_CLASS',5,'C1',340,'S20',10,200,20,100,41,20,42,20,50,90,
 0,'SCALE',5,'S20',300,'misleading name',140,1,141,20,
 0,'DICTIONARY',5,'VD',3,'ASDK_XREC_ANNOTATION_SCALE_INFO',360,'VR',0,'XRECORD',5,'VR',340,'S20',0,'ENDSEC',0,'EOF');
test('native dictionary chains, scale units and nested block contexts survive import, project and LiraCAD DXF roundtrip',()=>{
 const r=importDXF(source),d=r.document,v=d.entities.find(e=>e.type==='viewport'),b=d.entities.find(e=>e.type==='block');
 assert.equal(v.annotationScale,20);assert.equal(v.viewScale,.025);assert.deepEqual(v.frozenLayers,['0']);assert.equal(b.definition.entities[0].annotationContexts[0].denominator,20);
 assert.ok(r.report.some(r=>/ej matchande/.test(r.message)));
 const noFreeze={...v,frozenLayers:[]},resolved=viewportEntities([b],noFreeze,d.layers)[0];
 assert.deepEqual(resolved.point,{x:1400,y:700});assert.equal(resolved.height,80);assert.equal(resolved.rotation,Math.PI/2);
 const moved=transformed(b,'MOVE',{x:0,y:0},{x:10,y:20});assert.deepEqual(viewportEntities([moved],noFreeze,d.layers)[0].point,{x:1410,y:720});
 const saved=JSON.parse(JSON.stringify(d));assert.ok(validDocument(saved));
 const back=importDXF(toDXF(saved)).document,bv=back.entities.find(e=>e.type==='viewport'),bb=back.entities.find(e=>e.type==='block');
 assert.deepEqual(bv.frozenLayers,['0']);assert.equal(bv.annotationScale,20);assert.deepEqual(viewportEntities([bb],{...bv,frozenLayers:[]},back.layers)[0].point,resolved.point);
});
test('actual entity annotation flags without contexts warn; an annotative style alone does not resize ordinary text',()=>{
 const raw=pairs(0,'SECTION',2,'TABLES',0,'LAYER',2,'0',62,7,0,'STYLE',2,'Annotative',3,'Arial.ttf',1001,'AcadAnnotative',1070,1,1070,1,0,'ENDSEC',0,'SECTION',2,'ENTITIES',0,'TEXT',8,'0',1,'Plain',10,0,20,0,40,100,7,'Annotative',0,'TEXT',8,'0',1,'Flagged',10,0,20,0,40,100,1001,'AcadAnnotative',1000,'AnnotativeData',1070,1,1070,1,0,'ENDSEC',0,'EOF');
 const r=importDXF(raw);assert.equal(r.count,2);assert.equal(r.document.entities[0].annotative,undefined);assert.equal(r.document.entities[1].annotative,true);assert.equal(r.document.entities[1].height,100);assert.ok(r.report.some(r=>/saknar läsbara skalvarianter/.test(r.message)));
});
test('project validation rejects broken annotation contexts and invalid scale controls',()=>{
 const d={version:1,layers,entities:[block]};assert.ok(validDocument(d));
 assert.equal(validDocument({...d,entities:[{...block,annotationBase:null}]}),false);
 assert.equal(validDocument({...d,entities:[{...block,annotationContexts:[{...contexts[0],denominator:0}]}]}),false);
 assert.equal(validDocument({...d,layouts:[layout],entities:[{...viewport('v',20),annotationScale:-1}]}),false);
});
