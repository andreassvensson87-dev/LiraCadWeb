import test from 'node:test';
import assert from 'node:assert/strict';
import {loadReference, referenceEntities, referenceStatus, detachReference, bindReference} from '../src/references.js';
import {validDocument} from '../src/document.js';
import {DocumentSession} from '../src/document-session.js';
import {toDXF} from '../src/dxf-export.js';
import {importDXF} from '../src/dxf-import.js';
import {blockParts,createBlock} from '../src/blocks.js';
import {dimensionGraphicsState} from '../src/dimensions.js';
import {annotationView} from '../src/annotation-edit.js';
import {viewportEntities} from '../src/annotation-context.js';
import {layoutSVG} from '../src/plot.js';
const layer={id:'0',name:'0',color:'#ffffff'};
const line={id:'line',type:'line',layer:'0',points:[{x:0,y:0},{x:100,y:0}]};
const drawing=(entities=[])=>({version:1,name:'Test',layers:[structuredClone(layer)],entities});
const source=()=>drawing([structuredClone(line)]);
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} ≠ ${b}`);

test('attach caches isolated geometry, registers namespaced layers, and undo/redo restores entire reference',()=>{
  const session=new DocumentSession(drawing()),src=source(),before=structuredClone(src);
  session.commit('Länka',d=>{loadReference(d,src,{name:'Plan.dwg'},null,123);});
  assert.equal(session.document.entities.length,0);
  const r=session.document.references[0];assert.equal(referenceStatus(r),'Laddad');
  assert.equal(session.document.layers[1].name,'Plan | 0');assert.equal(session.document.layers[1].locked,true);
  assert.deepEqual(src,before);src.entities[0].points[0].x=999;
  assert.equal(r.geometry[0].points[0].x,0);
  session.undo();assert.equal(session.document.references,undefined);assert.equal(session.document.layers.length,1);
  session.redo();assert.ok(validDocument(session.document));assert.equal(session.document.references[0].loadedAt,123);
  const saved=JSON.parse(JSON.stringify(session.document));assert.ok(validDocument(saved));assert.equal(referenceEntities(saved).length,1);
});
test('reload preserves placement, relative path, and host layer overrides while replacing source geometry',()=>{
  const doc=drawing(),r=loadReference(doc,source(),{name:'Plan.dwg'},null,123);
  r.path='../Referenser/Plan.dwg';r.point={x:20,y:40};r.rotation=Math.PI/2;r.scale=2;r.fade=30;r.kind='attach';
  const layer=doc.layers[1];layer.visible=false;layer.color='#aa0000';
  const src=source();src.entities[0].points[1].x=200;
  loadReference(doc,src,{name:'Plan.dwg'},r.id,456);
  assert.equal(doc.references.length,1);assert.equal(doc.layers.length,2);assert.equal(r.path,'../Referenser/Plan.dwg');assert.equal(r.loadedAt,456);
  assert.equal(layer.visible,false);assert.equal(layer.color,'#aa0000');assert.equal(r.geometry[0].points[1].x,200);
  assert.equal(r.fade,30);assert.equal(r.kind,'attach');
  const rendered=referenceEntities(doc)[0];close(rendered.points[1].x,20);close(rendered.points[1].y,440);assert.equal(rendered._xrefOpacity,.7);
  r.snap=false;assert.equal(referenceEntities(doc)[0]._xrefSnap,false);
  r.loaded=false;assert.equal(referenceStatus(r),'Urladdad');assert.equal(referenceEntities(doc).length,0);
  r.loaded=true;r.visible=false;assert.equal(referenceEntities(doc).length,0);
  const session=new DocumentSession(doc),saved=JSON.stringify(session.document);assert.throws(()=>session.commit('Misslyckad omladdning',d=>loadReference(d,drawing(),{name:'Broken.dwg'},r.id)),/saknar/);assert.equal(JSON.stringify(session.document),saved);
});
test('block parts flatten with unique IDs, source insertion base and nested attachment semantics',()=>{
  const src=source();src.insertionBase={x:10,y:20};src.entities.push(createBlock([{...line,id:'part'}],'B',{x:0,y:0},'0'));
  const underlay=loadReference(src,source(),{name:'Underlag.dwg'});underlay.kind='overlay';
  const attached=loadReference(src,source(),{name:'Stomme.dwg'});attached.kind='attach';attached.point={x:500,y:0};
  const host=drawing();const r=loadReference(host,src,{name:'Plan.dwg'});
  assert.equal(r.geometry.length,2);assert.equal(r.children.length,2);assert.equal(new Set(r.geometry.map(e=>e.id)).size,2);
  assert.ok(r.geometry.every(e=>e.type!=='block'));assert.equal(r.geometry[0].points[0].x,-10);assert.equal(referenceEntities(host)[2].points[0].x,490);
  assert.equal(r.geometry[0].points[0].y,-20);assert.ok(validDocument(host));
});
test('detach removes reference layers safely; bind retains transform and creates an editable block with collision-free name',()=>{
  const doc=drawing(),r=loadReference(doc,source(),{name:'Plan.dwg'});r.rotation=Math.PI/2;r.point={x:10,y:20};r.scale=2;r.mirrored=true;
  doc.blocks=[createBlock([line],'Plan',{x:0,y:0},'0').definition];
  const geometry=referenceEntities(doc,{fade:false})[0];bindReference(doc,r.id,'0');
  assert.equal(doc.references.length,0);assert.equal(doc.entities[0].definition.name,'Plan_1');assert.ok(validDocument(doc));
  const part=blockParts(doc.entities[0])[0];assert.deepEqual(part.points,geometry.points);assert.equal(doc.layers[1].locked,false);assert.equal(doc.layers[1].referenceId,undefined);
  const ref=loadReference(doc,source(),{name:'Other.dwg'});detachReference(doc,ref.id);assert.ok(validDocument(doc));assert.equal(doc.layers.length,2);
});
test('DXF stores true xref flags, file path and INSERT transform, including reference-only documents',()=>{
  for(const kind of ['attach','overlay']){
    const doc=drawing(),r=loadReference(doc,source(),{name:'Plan.dwg'});r.path='../Ref/Plan.dwg';r.kind=kind;r.point={x:123,y:456};r.rotation=Math.PI/3;r.scale=2;r.mirrored=true;
    const text=toDXF(doc);assert.ok(text.includes('../Ref/Plan.dwg'));
    const result=importDXF(text).document;assert.equal(result.entities.length,0);assert.equal(result.references.length,1);assert.ok(validDocument(result));
    const imported=result.references[0];assert.equal(imported.kind,kind);assert.equal(imported.path,r.path);assert.deepEqual(imported.point,r.point);assert.equal(imported.scale,2);close(imported.rotation,r.rotation);assert.equal(imported.mirrored,true);assert.equal(referenceStatus(imported),'Saknas');
    assert.equal(result.blocks.length,0);loadReference(result,source(),{name:'Plan.dwg'},imported.id);assert.equal(referenceEntities(result).length,1);
  }
});
test('validation rejects malformed reference metadata/geometry and keeps missing refs valid',()=>{
  const doc=drawing(),r=loadReference(doc,source(),{name:'Plan.dwg'});
  for(const patch of [{scale:0},{rotation:Infinity},{fade:101},{snap:'yes'},{path:'bad\npath'},{geometry:[{...line,layer:'absent'}]},{layer:'absent'},{geometry:[{type:'block'}]},{point:{x:NaN,y:0}}]){
    assert.equal(validDocument({...doc,references:[{...r,...patch}]}),false,JSON.stringify(patch));
  }
  assert.equal(validDocument({...doc,references:[r,r]}),false);
  const missing={...r,geometry:[],loaded:false};assert.equal(referenceStatus(missing),'Saknas');assert.ok(validDocument({...doc,references:[missing]}));
});
test('layout plotting includes visible references in viewports but excludes unloaded references',()=>{
  const doc=drawing(),r=loadReference(doc,source(),{name:'Plan.dwg'});r.point={x:123,y:456};
  const layout={id:'paper',name:'Paper',width:200,height:100};doc.layouts=[layout];
  doc.entities=[{id:'v',type:'viewport',layer:'0',space:'paper',points:[{x:0,y:0},{x:200,y:100}],viewCenter:{x:173,y:456},viewScale:.5}];
  const svg=layoutSVG(doc,layout);assert.ok(svg.includes('M 123 456 L 223 456'));
  r.loaded=false;assert.ok(!layoutSVG(doc,layout).includes('M 123 456 L 223 456'));
});

test('annotation variants and native dimension graphics keep valid remapped layers',()=>{
  const src=source();src.layers.push({id:'dim',name:'Mått',color:'#ff0000'});
  const text={id:'text',type:'text',layer:'dim',point:{x:10,y:20},height:2,text:'Mått',rotation:0};
  text.annotationVariants=[{denominator:50,entity:{...text,id:'variant',point:{x:100,y:200}}}];
  src.entities.push(text);
  const dim={id:'dim-entity',type:'dimension',layer:'0',kind:'aligned',points:[{x:0,y:0},{x:100,y:0},{x:0,y:20}],height:2,dimensionGraphics:[{...line,id:'graphic',layer:'dim'}]};
  dim.dimensionGraphicsState=dimensionGraphicsState(dim);src.entities.push(dim);
  const host=drawing();const r=loadReference(host,src,{name:'Plan.dwg'});
  assert.ok(validDocument(host));assert.notEqual(r.geometry[1].annotationVariants[0].entity.layer,'dim');
  assert.notEqual(r.geometry[2].dimensionGraphics[0].layer,'dim');
  const rendered=referenceEntities(host)[1],view=annotationView(rendered,{annotationScale:50},host.layers);
  assert.equal(view._xrefId,r.id);assert.equal(view._xrefOpacity,.4);assert.equal(view._xrefSnap,true);
  const paper=viewportEntities([rendered],{annotationScale:50},host.layers)[0];assert.equal(paper._xrefId,r.id);assert.equal(paper._xrefOpacity,.4);

});
