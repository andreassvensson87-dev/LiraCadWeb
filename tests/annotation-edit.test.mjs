import test from 'node:test';import assert from 'node:assert/strict';
import {annotationView,createAnnotationView,storeAnnotationView,copyAnnotationView} from '../src/annotation-edit.js';
import {annotationEntity,viewportEntities} from '../src/annotation-context.js';
import {transformed} from '../src/entity-transform.js';
import {validDocument} from '../src/document.js';
import {importDXF} from '../src/dxf-import.js';import {toDXF} from '../src/dxf-export.js';
import {createSpatialIndex} from '../src/spatial-index.js';import {bounds,hitDistance} from '../src/entity-geometry.js';import {grips,gripEntity} from '../src/grips.js';
const layers=[{id:'0',name:'0',color:'#ffffff',lineType:'CONTINUOUS'}];
const v={annotationScale:20,showAllAnnotations:true},other={annotationScale:50,showAllAnnotations:true};
const text={id:'t',type:'text',layer:'0',text:'Room',point:{x:0,y:0},height:100,rotation:0,font:'Arial',textAlign:'left',textVertical:'baseline'};
test('per-scale text edits preserve base and other scales, share content, validate and roundtrip without transient editor markers',()=>{
 const source=createAnnotationView(text,v),view=annotationView(source,v),edited=storeAnnotationView(source,{...view,height:40,point:{x:200,y:100},text:'Kitchen'});
 assert.equal(edited.height,100);assert.deepEqual(edited.point,text.point);assert.equal(annotationView(edited,v).height,40);assert.deepEqual(annotationView(edited,v).point,{x:200,y:100});assert.equal(annotationView(edited,other).height,100);assert.equal(annotationView(edited,other).text,'Kitchen');
 const doc={version:1,layers,entities:[edited]};assert.ok(validDocument(doc));assert.doesNotMatch(JSON.stringify(doc),/_annotationSource|_annotationScale/);
 const rt=importDXF(toDXF(doc)).document.entities[0];assert.equal(annotationEntity(rt,v).height,40);assert.deepEqual(annotationEntity(rt,v).point,{x:200,y:100});assert.equal(annotationEntity(rt,other).height,100);
});
test('resolved text placement is shared by hit testing, spatial queries and grips; grip edits change the active representation',()=>{
 const source=storeAnnotationView(text,{...text,point:{x:10000,y:10000},height:40},20),view=annotationView(source,v),index=createSpatialIndex([view],bounds);
 assert.deepEqual(index.query({minX:9999,minY:9999,maxX:10001,maxY:10001},true).map(e=>e.id),['t']);assert.equal(hitDistance(view,view.point),0);assert.deepEqual(grips(view)[0].p,view.point);
 const changed=storeAnnotationView(source,gripEntity(view,grips(view)[0],{x:11000,y:12000}));assert.deepEqual(annotationView(changed,v).point,{x:11000,y:12000});assert.deepEqual(annotationView(changed,other).point,text.point);
});
test('whole-model transforms and COPY retain annotation variants; temporary preview is isolated',()=>{
 const source=storeAnnotationView(text,{...text,point:{x:200,y:100},height:40},20),before=JSON.stringify(source),view=annotationView(source,v);
 const preview=transformed(view,'MOVE',{x:0,y:0},{x:10,y:20});assert.equal(JSON.stringify(source),before);
 const moved=transformed(source,'MOVE',{x:0,y:0},{x:10,y:20});assert.deepEqual(annotationView(moved,v).point,{x:210,y:120});assert.deepEqual(annotationView(moved,other).point,{x:10,y:20});
 const copy=copyAnnotationView(source,{...preview,id:'copy'},v);assert.equal(copy.id,'copy');assert.deepEqual(annotationView(copy,v).point,{x:210,y:120});assert.deepEqual(annotationView(copy,other).point,{x:10,y:20});assert.equal(JSON.stringify(source),before);
});
test('dimension text placement/style is scale-specific while measured endpoints remain shared',()=>{
 const d={id:'d',type:'dimension',kind:'aligned',layer:'0',points:[{x:0,y:0},{x:1000,y:0},{x:0,y:200}],height:100,precision:0},source=createAnnotationView(d,v),view=annotationView(source,v),edited=storeAnnotationView(source,{...view,height:40,dimensionTextPoint:{x:500,y:300},points:[{x:0,y:0},{x:1200,y:0},{x:0,y:250}]});
 assert.equal(annotationView(edited,v).height,40);assert.equal(annotationView(edited,other).height,100);assert.equal(annotationView(edited,v).points[2].y,250);assert.equal(annotationView(edited,other).points[2].y,200);assert.equal(annotationView(edited,other).points[1].x,1200);assert.ok(validDocument({version:1,layers,entities:[edited]}));
});
test('nested block geometry uses the same resolved shape in canvas interaction and layout export',()=>{
 const part=storeAnnotationView(text,{...text,point:{x:30,y:10},height:40},20),block={id:'b',type:'block',layer:'0',point:{x:100,y:200},scale:2,rotation:0,mirrored:false,values:{},definition:{id:'def',name:'Block',entities:[part]}};
 const view=annotationView(block,v),printed=viewportEntities([block],v,layers)[0];assert.equal(view.definition.entities[0].height,40);assert.equal(printed.height,80);assert.equal(hitDistance(view,printed.point),0);assert.deepEqual(grips(view)[0].p,block.point);
});
test('validation rejects recursive or duplicate annotation variants',()=>{
 const source=createAnnotationView(text,v);assert.equal(validDocument({version:1,layers,entities:[{...source,annotationVariants:[...source.annotationVariants,...source.annotationVariants]}]}),false);
 const bad={...source,annotationVariants:[{denominator:20,entity:source}]};assert.equal(validDocument({version:1,layers,entities:[bad]}),false);
});
const pairs=(...v)=>v.join('\n')+'\n';
function nativeText(defaultFlag=true){return pairs(0,'SECTION',2,'TABLES',0,'LAYER',2,'0',62,7,0,'ENDSEC',0,'SECTION',2,'ENTITIES',0,'TEXT',5,'T',360,'D1',8,'0',1,'Native',10,0,20,0,40,100,0,'ENDSEC',0,'SECTION',2,'OBJECTS',0,'DICTIONARY',5,'D1',3,'AcDbContextDataManager',360,'D2',0,'DICTIONARY',5,'D2',3,'ACDB_ANNOTATIONSCALES',350,'D3',0,'DICTIONARY',5,'D3',3,'*A1',350,'C50',3,'*A2',350,'C20',0,'SCALE',5,'S50',140,1,141,50,0,'SCALE',5,'S20',140,1,141,20,0,'ACDB_TEXTOBJECTCONTEXTDATA_CLASS',5,'C50',100,'AcDbObjectContextData',70,3,290,defaultFlag?1:0,100,'AcDbAnnotScaleObjectContextData',340,'S50',100,'AcDbTextObjectContextData',70,0,50,0,10,0,20,0,0,'ACDB_TEXTOBJECTCONTEXTDATA_CLASS',5,'C20',100,'AcDbObjectContextData',70,3,290,0,100,'AcDbAnnotScaleObjectContextData',340,'S20',100,'AcDbTextObjectContextData',70,2,50,90,10,100,20,100,11,200,21,300,0,'ENDSEC',0,'EOF');}
test('native DXF text contexts use explicit default scale, subtype alignment and rotation; missing source scale is warned without guessed height',()=>{
 const r=importDXF(nativeText()),e=r.document.entities[0],view=annotationView(e,v);assert.equal(r.count,1);assert.equal(view.height,40);assert.equal(view.rotation,Math.PI/2);assert.equal(view.textAlign,'right');assert.deepEqual(view.point,{x:200,y:300});assert.equal(annotationView(e,other).height,100);
 const missing=importDXF(nativeText(false));assert.equal(missing.count,1);assert.equal(missing.document.entities[0].annotationVariants,undefined);assert.ok(missing.report.some(r=>/ursprungsskala/.test(r.message)));
});
test('native dimension contexts preserve each available graphics block and keep measured endpoints',()=>{
 const raw=pairs(0,'SECTION',2,'TABLES',0,'LAYER',2,'0',62,7,0,'BLOCK_RECORD',5,'B50',2,'*D50',0,'BLOCK_RECORD',5,'B20',2,'*D20',0,'ENDSEC',0,'SECTION',2,'BLOCKS',0,'BLOCK',2,'*D50',10,0,20,0,0,'TEXT',8,'0',1,'1000',10,500,20,200,40,100,0,'ENDBLK',0,'BLOCK',2,'*D20',10,0,20,0,0,'TEXT',8,'0',1,'1000',10,600,20,300,40,40,0,'ENDBLK',0,'ENDSEC',0,'SECTION',2,'ENTITIES',0,'DIMENSION',5,'M',360,'D1',8,'0',70,1,2,'*D50',10,0,20,200,13,0,23,0,14,1000,24,0,0,'ENDSEC',0,'SECTION',2,'OBJECTS',0,'DICTIONARY',5,'D1',3,'AcDbContextDataManager',360,'D2',0,'DICTIONARY',5,'D2',3,'ACDB_ANNOTATIONSCALES',350,'D3',0,'DICTIONARY',5,'D3',3,'*A1',350,'C50',3,'*A2',350,'C20',0,'SCALE',5,'S50',140,1,141,50,0,'SCALE',5,'S20',140,1,141,20,0,'ACDB_ALDIMOBJECTCONTEXTDATA_CLASS',5,'C50',290,1,340,'S50',2,'B50',10,500,20,200,0,'ACDB_ALDIMOBJECTCONTEXTDATA_CLASS',5,'C20',290,0,340,'S20',2,'B20',10,600,20,300,0,'ENDSEC',0,'EOF');
 const r=importDXF(raw);assert.equal(r.count,1);const e=r.document.entities[0],view=annotationView(e,v);assert.equal(view.dimensionGraphics[0].height,40);assert.deepEqual(view.dimensionGraphics[0].point,{x:600,y:300});assert.deepEqual(view.points.slice(0,2),e.points.slice(0,2));assert.equal(annotationView(e,other).dimensionGraphics[0].height,100);
 const back=importDXF(toDXF(r.document)).document.entities[0];assert.deepEqual(annotationView(back,v).dimensionGraphics[0].point,{x:600,y:300});
});
test('MTEXT contexts retain scale-specific single and multiple column widths',()=>{
 function raw(columns){return pairs(0,'SECTION',2,'ENTITIES',0,'MTEXT',360,'D1',8,'0',1,'Column',10,0,20,0,40,100,41,200,71,1,0,'ENDSEC',0,'SECTION',2,'OBJECTS',0,'DICTIONARY',5,'D1',3,'AcDbContextDataManager',350,'D2',0,'DICTIONARY',5,'D2',3,'ACDB_ANNOTATIONSCALES',350,'D3',0,'DICTIONARY',5,'D3',3,'*A1',350,'C50',3,'*A2',350,'C20',0,'SCALE',5,'S50',140,1,141,50,0,'SCALE',5,'S20',140,1,141,20,...[50,20].flatMap(s=>[0,'ACDB_MTEXTOBJECTCONTEXTDATA_CLASS',5,'C'+s,100,'AcDbObjectContextData',70,4,290,s===50?1:0,100,'AcDbAnnotScaleObjectContextData',340,'S'+s,100,'AcDbMTextObjectContextData',70,1,10,s,20,10,30,0,11,1,21,0,31,0,40,s*4,71,2,72,columns,44,s*4,45,0,73,0,74,0,46,0]),0,'ENDSEC',0,'EOF');}
 const imported=importDXF(raw(1)),view=annotationView(imported.document.entities[0],v);assert.equal(view.textWidth,80);assert.equal(view.height,40);assert.deepEqual(view.point,{x:20,y:10});
 const multi=importDXF(raw(2));assert.equal(annotationView(multi.document.entities[0],v).textColumns.count,2);assert.equal(annotationView(multi.document.entities[0],v).textColumns.width,80);
});
