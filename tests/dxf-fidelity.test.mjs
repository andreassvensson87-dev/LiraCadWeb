import test from 'node:test';
import assert from 'node:assert/strict';
import { importDXF } from '../src/dxf-import.js';
import { toDXF } from '../src/dxf-export.js';
import { parseMtext } from '../src/dxf-text.js';
import { textLayout, mtextContent } from '../src/text.js';
import { splinePoints, ellipsePoints } from '../src/dxf-curves.js';
import { validDocument } from '../src/document.js';
import { blockParts, validTag } from '../src/blocks.js';
import { bounds, hitDistance } from '../src/entity-geometry.js';
import { transform } from '../src/entity-transform.js';
import { layoutSVG } from '../src/plot.js';
import { linePattern } from '../src/linetypes.js';
const dxf = (entities, tables=[], blocks=[]) => [0,'SECTION',2,'TABLES',...tables,0,'ENDSEC',0,'SECTION',2,'BLOCKS',...blocks,0,'ENDSEC',0,'SECTION',2,'ENTITIES',...entities,0,'ENDSEC',0,'EOF'].join('\n')+'\n';
const imported = (...args) => importDXF(dxf(...args)).document;
const text = [0,'TEXT',8,'0',1,'AB',10,10,20,20,40,2];
const style = [0,'STYLE',2,'CAD',3,'isocpeur.ttf',41,0.8];
test('TEXT uses its second alignment point, baseline and width factor; survives DXF',()=>{
 const doc=imported([...text,11,100,21,200,72,2,73,3,41,0.75,51,12,7,'CAD'],style);
 const e=doc.entities[0];assert.deepEqual(e.point,{x:100,y:200});assert.equal(e.textAlign,'right');assert.equal(e.textVertical,'top');assert.equal(e.widthFactor,0.75);assert.equal(e.font,'isocpeur');
 const b=bounds(e);assert.equal(b.maxY,200);assert.ok(b.minX<100);
 const after=importDXF(toDXF(doc)).document.entities[0];assert.deepEqual(after.point,e.point);assert.equal(after.textAlign,'right');assert.equal(after.widthFactor,0.75);assert.equal(after.sourceFont,'isocpeur.ttf');
});
test('MTEXT preserves all nine attachments, column wrapping, spacing and rotation',()=>{
 for(let attachment=1;attachment<=9;attachment++){
  const doc=imported([0,'MTEXT',8,'0',1,'AA BB CC',10,10,20,20,40,2,41,4,71,attachment,44,1.2,73,2,50,0.4]);const e=doc.entities[0],l=textLayout(e);
  assert.equal(e.textAttachment,attachment);assert.equal(e.rotation,0.4);assert.ok(l.lines.length>1);assert.equal(e.lineSpacing,2);
  const after=importDXF(toDXF(doc)).document.entities[0];assert.equal(after.textWidth,4);assert.equal(after.lineSpacing,2);assert.deepEqual(after.point,e.point);assert.equal(after.textAttachment,attachment);
 }
});
test('MTEXT parses scoped formatting without eating content or literal escapes',()=>{
 const source='A {\\fGeorgia|b1|i1;B} C\\P\\S1#2; \\{x\\} \\U+00C5\\~D';const p=parseMtext(source);
 assert.equal(p.text,'A B C\n1/2 {x} Å\u00a0D');assert.equal(p.runs.find(r=>r.text==='B').bold,true);assert.equal(p.runs.at(-1).bold,undefined);assert.ok(p.simplified);
 const e={text:p.text,textRuns:p.runs,height:2,font:'Arial'};assert.equal(parseMtext(mtextContent(e)).text,p.text);
});
test('changing text ignores stale runs while unchanged text preserves styles',()=>{
 const e={text:'AB',height:2,textRuns:[{text:'A',bold:true},{text:'B',italic:true}]};assert.equal(textLayout(e).lines[0].runs[0].bold,true);
 assert.equal(textLayout({...e,text:'New'}).lines[0].runs[0].bold,undefined);
});
test('Swedish and numbered attribute tags keep values and per-instance placement',()=>{
 assert.ok(validTag('6.CON_INNEHÅLL_1'));
 const doc=imported([0,'INSERT',8,'0',2,'STAMP',10,100,20,200,41,2,42,2,50,90,0,'ATTRIB',8,'0',2,'CON_ÄNDRING',1,'Ändrad',10,100,20,220,40,6,72,2,74,3,11,110,21,230],[],[0,'BLOCK',2,'STAMP',10,0,20,0,0,'ATTDEF',8,'0',2,'CON_ÄNDRING',1,'Original',10,0,20,0,40,2,0,'ENDBLK']);
 const e=doc.entities[0],part=blockParts(e)[0];assert.equal(e.values.CON_ÄNDRING,'Ändrad');assert.deepEqual(part.point,{x:110,y:230});assert.equal(part.height,6);assert.equal(part.textAlign,'right');
 const moved=transform(e,p=>({x:p.x+5,y:p.y-10}));assert.deepEqual(blockParts(moved)[0].point,{x:115,y:220});
 const after=importDXF(toDXF(doc)).document;assert.equal(after.entities[0].values.CON_ÄNDRING,'Ändrad');assert.deepEqual(blockParts(after.entities[0])[0].point,part.point);
});
test('planar negative-Z INSERT applies OCS reflection without losing geometry',()=>{
 const doc=imported([0,'INSERT',8,'0',2,'B',10,-100,20,20,210,0,220,0,230,-1],[],[0,'BLOCK',2,'B',10,0,20,0,0,'LINE',8,'0',10,0,20,0,11,10,21,0,0,'ENDBLK']);
 const ps=blockParts(doc.entities[0])[0].points;assert.ok(Math.abs(ps[0].x-100)<1e-8);assert.ok(Math.abs(ps[1].x-90)<1e-8);
});
test('nonuniform block scales become editable geometry, including transformed circles',()=>{
 const doc=imported([0,'INSERT',8,'0',2,'B',10,10,20,20,41,2,42,3],[],[0,'BLOCK',2,'B',10,0,20,0,0,'CIRCLE',8,'0',10,0,20,0,40,1,0,'ENDBLK']);
 assert.equal(doc.entities[0].type,'polyline');const b=bounds(doc.entities[0]);assert.ok(Math.abs(b.maxX-12)<1e-8);assert.ok(Math.abs(b.maxY-23)<1e-8);
});
test('rational spline evaluation reproduces a quarter-circle instead of its control polygon',()=>{
 const ps=splinePoints([{x:1,y:0},{x:1,y:1},{x:0,y:1}],[0,0,0,1,1,1],2,[1,Math.SQRT1_2,1]);
 assert.ok(ps.length>10);assert.ok(ps.every(p=>Math.abs(Math.hypot(p.x,p.y)-1)<1e-8));assert.deepEqual(ps[0],{x:1,y:0});assert.deepEqual(ps.at(-1),{x:0,y:1});
 assert.throws(()=>splinePoints([{x:0,y:0}],[0,1],3));
});
test('ellipse endpoints and full ellipse extrema survive polyline approximation',()=>{
 const ps=ellipsePoints({x:10,y:20},{x:4,y:0},0.5,0,Math.PI/2);assert.deepEqual(ps[0],{x:14,y:20});assert.ok(Math.abs(ps.at(-1).x-10)<1e-8);assert.equal(ps.at(-1).y,22);
 const doc=imported([0,'ELLIPSE',8,'0',10,10,20,20,11,4,21,0,40,0.5,41,0,42,Math.PI*2]);assert.ok(validDocument(doc));assert.equal(doc.entities[0].closed,true);
});
test('solid hatch holes render with even-odd fill, transform and survive DXF',()=>{
 const loop=[92,2,72,0,73,1,93,4,10,0,20,0,10,10,20,0,10,10,20,10,10,0,20,10,97,0];
 const hole=[92,2,72,0,73,1,93,4,10,3,20,3,10,7,20,3,10,7,20,7,10,3,20,7,97,0];
 const doc=imported([0,'HATCH',8,'0',70,1,91,2,...loop,...hole,75,0]);const e=doc.entities[0];assert.equal(e.solid,true);assert.equal(hitDistance(e,{x:1,y:1}),0);assert.equal(hitDistance(e,{x:5,y:5}),2);
 assert.equal(importDXF(toDXF(doc)).document.entities[0].holes.length,1);assert.equal(transform(e,p=>({x:p.x+10,y:p.y})).holes[0][0].x,13);
 assert.match(layoutSVG(doc,{id:'model',name:'Test',width:20,height:20}),/fill-rule="evenodd"/);
});
test('hatch line edges and clockwise bulges retain their correct shape',()=>{
 const doc=imported([0,'HATCH',8,'0',70,1,91,1,92,1,93,3,72,1,10,0,20,0,11,10,21,0,72,1,10,10,20,0,11,0,21,10,72,1,10,0,20,10,11,0,21,0,97,0,75,0]);assert.equal(doc.entities[0].solid,true);assert.equal(bounds(doc.entities[0]).maxX,10);
 const curved=imported([0,'HATCH',8,'0',70,1,91,1,92,2,72,1,73,1,93,2,10,0,20,0,42,-1,10,2,20,0,42,0,97,0,75,0]);assert.ok(bounds(curved.entities[0]).maxY>0.99);
});
test('native dash pattern and per-entity scale survive export and use layer inheritance',()=>{
 const doc=imported([0,'LINE',8,'0',6,'SHORT',48,2,10,0,20,0,11,10,21,0],[0,'LTYPE',2,'SHORT',49,1,49,-0.25]);const e=doc.entities[0];assert.deepEqual(linePattern(e,doc.layers[0]),[2,-0.5]);
 const after=importDXF(toDXF(doc)).document;assert.deepEqual(linePattern(after.entities[0],after.layers[0]),[2,-0.5]);
});
test('hidden attribute definitions remain hidden after project and DXF roundtrips',()=>{
 const doc=imported([0,'ATTDEF',8,'0',2,'HIDDEN',1,'Secret',10,0,20,0,40,2,70,1]);assert.equal(doc.entities[0].hidden,true);assert.equal(importDXF(toDXF(doc)).document.entities[0].hidden,true);
});
test('nested MLEADER scopes do not mistake normals and scales for 3D coordinates',()=>{
 const doc=imported([0,'MULTILEADER',8,'0',300,'CONTEXT_DATA{',41,2,140,1,290,1,304,'IPE 330',11,0,21,0,31,1,12,20,22,10,13,1,23,0,171,1,302,'LEADER{',10,15,20,8,11,1,21,0,291,1,40,3,304,'LEADER_LINE{',10,0,20,0,30,0,305,'}',303,'}',301,'}',10,1,20,1,30,1]);
 assert.equal(doc.entities.length,2);assert.equal(doc.entities[0].text,'IPE 330');assert.deepEqual(doc.entities[1].points,[{x:0,y:0},{x:15,y:8},{x:18,y:8}]);
});
test('new presentation properties reject malformed imported project values',()=>{
 const doc=imported(text);for(const patch of [{textAttachment:99},{textWidth:NaN},{widthFactor:-1},{font:'bad"; url(x)'},{textRuns:[{text:'x',heightScale:Infinity}]},{linePattern:[NaN]},{holes:[[]]}]){
  const entity={...doc.entities[0],...patch};if(patch.holes)entity.type='hatch',entity.points=[{x:0,y:0},{x:1,y:0},{x:0,y:1}],entity.spacing=1;
  assert.equal(validDocument({...doc,entities:[entity]}),false);
 }
});

test('rotated viewport camera is invertible and keeps its paper center anchored',async()=>{
 const {viewportCamera,viewportFromCamera}=await import('../src/layout.js');const {screenPoint,worldPoint}=await import('../src/camera.js');
 const viewport={points:[{x:10,y:20},{x:110,y:70}],viewCenter:{x:1000,y:2000},viewScale:0.5,viewRotation:Math.PI/2};const paper={x:60,y:45,scale:2};
 const camera=viewportCamera(viewport,paper,1000,800),center=screenPoint(viewport.viewCenter,camera,1000,800);assert.deepEqual(center,{x:500,y:400});
 const world={x:1100,y:2100},back=worldPoint(screenPoint(world,camera,1000,800),camera,1000,800);assert.deepEqual(back,world);
 const after=viewportFromCamera(viewport,camera,paper,1000,800);assert.deepEqual(after.viewCenter,viewport.viewCenter);assert.equal(after.viewRotation,Math.PI/2);
});
test('DXF view center converts DCS and target into WCS and survives a rotated export',()=>{
 const doc=imported([0,'VIEWPORT',8,'0',410,'Sheet',69,2,10,50,20,50,40,100,41,50,45,100,12,10,22,20,17,100,27,200,51,90,16,0,26,0,36,1]);const e=doc.entities[0];
 assert.equal(e.viewCenter.x,120);assert.equal(e.viewCenter.y,190);assert.equal(e.viewRotation,-Math.PI/2);
 const after=importDXF(toDXF(doc)).document.entities[0];assert.ok(Math.abs(after.viewCenter.x-120)<1e-8);assert.ok(Math.abs(after.viewCenter.y-190)<1e-8);assert.equal(after.viewRotation,-Math.PI/2);
 assert.match(layoutSVG(doc,doc.layouts[0]),/rotate\(90\)/);
});
test('planar polyface retains visible edges and omits negative-index hidden edges',()=>{
 const doc=imported([0,'POLYLINE',8,'0',70,64,0,'VERTEX',70,192,10,0,20,0,30,0,0,'VERTEX',70,192,10,10,20,0,30,0,0,'VERTEX',70,192,10,0,20,10,30,0,0,'VERTEX',70,128,71,-1,72,2,73,3,0,'SEQEND']);
 assert.equal(doc.entities.length,2);assert.deepEqual(doc.entities[0].points,[{x:10,y:0},{x:0,y:10}]);
});
test('unsupported native dimension type retains its generated dimension graphics',()=>{
 const doc=imported([0,'DIMENSION',8,'0',2,'*D1',70,2,10,0,20,0],[],[0,'BLOCK',2,'*D1',10,0,20,0,...text,0,'LINE',8,'0',10,0,20,0,11,10,21,0,0,'ENDBLK']);
 assert.equal(doc.entities.length,2);assert.equal(doc.entities[0].text,'AB');assert.equal(doc.entities[1].type,'line');
});

test('MTEXT literal escaped Unicode controls remain literal after export',()=>{
 const doc=imported([0,'MTEXT',8,'0',1,'\\\\U+00C5',10,0,20,0,40,2,71,1]);assert.equal(doc.entities[0].text,'\\U+00C5');
 assert.equal(importDXF(toDXF(doc)).document.entities[0].text,'\\U+00C5');
});
test('ACI 7 is foreground ink on paper while true-color white stays white',()=>{
 const doc=imported([...text,62,7]);const e=doc.entities[0];assert.equal(e.cadColor7,true);
 assert.match(layoutSVG(doc,{id:'model',name:'Test',width:100,height:100}),/fill="#000000"/);
 const after=importDXF(toDXF(doc)).document.entities[0];assert.equal(after.cadColor7,true);
 const white=imported([...text,420,0xffffff]);assert.equal(white.entities[0].cadColor7,false);assert.match(layoutSVG(white,{id:'model',name:'Test',width:100,height:100}),/fill="#ffffff"/);
});

test('BYLAYER remains inherited when the DXF contains an empty ByLayer table record',()=>{
 const doc=imported([0,'LINE',8,'DASH',6,'ByLayer',48,2,10,0,20,0,11,10,21,0],[0,'LTYPE',2,'ByLayer',0,'LTYPE',2,'SHORT',49,1,49,-0.25,0,'LAYER',2,'DASH',6,'SHORT']);
 const after=importDXF(toDXF(doc)).document,e=after.entities[0],layer=after.layers.find(l=>l.id===e.layer);
 assert.equal(e.lineType,'BYLAYER');assert.deepEqual(linePattern(e,layer),[2,-0.5]);
});

const paperDXF = (entities, settings) => dxf(entities).replace('0\nEOF\n', [0,'SECTION',2,'OBJECTS',0,'LAYOUT',100,'AcDbPlotSettings',...settings,100,'AcDbLayout',1,'Sheet',330,'ABC',0,'ENDSEC',0,'EOF',''].join('\n'));
test('half-scale paper fits A3 while model coordinates and viewport target stay unchanged',()=>{
 const source=paperDXF([0,'LINE',8,'0',10,1000,20,2000,11,1100,21,2000,0,'TEXT',8,'0',410,'Sheet',1,'Stamp',10,800,20,100,40,5,0,'VIEWPORT',8,'0',410,'Sheet',69,2,10,300,20,440,40,240,41,200,45,10000,12,1050,22,2000],[44,420,45,297,46,-0.25,47,0,70,676,72,1,142,1,143,2]);
 const doc=importDXF(source).document, [line,text,v]=doc.entities;
 assert.deepEqual(line.points,[{x:1000,y:2000},{x:1100,y:2000}]);assert.deepEqual(text.point,{x:399.75,y:50});assert.equal(text.height,2.5);
 assert.deepEqual(v.points,[{x:89.75,y:170},{x:209.75,y:270}]);assert.equal(v.viewScale,0.01);assert.deepEqual(v.viewCenter,{x:1050,y:2000});
 const after=importDXF(toDXF(doc)).document;assert.deepEqual(after.entities[1].point,text.point);assert.equal(after.entities[2].viewScale,v.viewScale);assert.ok(validDocument(after));
});
test('paper uses standard scale, window origin and physical mm for inch plot settings',()=>{
 const source=paperDXF([0,'TEXT',8,'0',410,'Sheet',1,'Stamp',10,12,20,22,40,1],[44,215.9,45,279.4,46,3,47,4,40,2,41,5,70,16,72,0,73,1,74,4,48,10,49,20,147,0.5,142,1,143,99]);
 const doc=importDXF(source).document,e=doc.entities[0];assert.equal(doc.layouts[0].width,279.4);assert.equal(doc.layouts[0].height,215.9);assert.ok(Math.abs(e.point.x-30.4)<1e-8);assert.ok(Math.abs(e.point.y-34.4)<1e-8);assert.equal(e.height,12.7);
});
test('import reports saved empty viewport but accepts a rotated view covering model geometry',()=>{
 const entities=[0,'LINE',8,'0',10,1000,20,2000,11,1010,21,2000];
 const v=[0,'VIEWPORT',8,'0',410,'Sheet',69,2,10,100,20,100,40,100,41,100,45,100,51,90,12,-2000,22,1000];
 const inside=importDXF(dxf([...entities,...v]));assert.ok(!inside.report.some(r=>r.message.includes('sparade vy')));
 const outside=importDXF(dxf([...entities,...v,17,50000,27,50000]));assert.ok(outside.report.some(r=>r.message.includes('sparade vy')));assert.deepEqual(outside.document.entities[1].viewCenter,{x:51000,y:52000});
});

test('MTEXT tracking keeps glyphs unchanged while changing advances and survives DXF',()=>{
 const doc=imported([0,'MTEXT',8,'0',1,'{\\T2;AAA}',10,0,20,0,40,2,71,1]), e=doc.entities[0];
 const run=textLayout(e).lines[0].runs[0];assert.equal(run.glyphs.length,3);assert.equal(run.glyphs[1].x,2.6);assert.equal(run.glyphs[2].x,5.2);assert.ok(Math.abs(run.width-6.5)<1e-8);
 const after=importDXF(toDXF(doc)).document.entities[0];assert.equal(after.textRuns[0].tracking,2);assert.match(layoutSVG(doc,{id:'model',name:'Test',width:100,height:100}),/<tspan x="2.6">A<\/tspan>/);
 assert.equal(parseMtext('{\\T2;A{\\T0.75x;B}C}').runs[1].tracking,1.5);
});
test('text adjustment replaces only its matching span properties and preserves color',async()=>{
 const {applyTextProperty}=await import('../src/text.js');
 const e={type:'text',point:{x:0,y:0},text:'AB\nC',height:2,textAttachment:9,textWidth:10,textRuns:[{text:'AB\nC',tracking:2,widthFactor:0.8,paragraphAlign:'left',color:'#ff0000'}]};
 const tracking=applyTextProperty(e,'tracking',1.25);assert.equal(tracking.textRuns[0].tracking,undefined);assert.equal(tracking.textRuns[0].color,'#ff0000');
 const centered=applyTextProperty(tracking,'textAlign','center');assert.equal(centered.textAttachment,8);assert.equal(centered.textRuns[0].paragraphAlign,undefined);
 const l=textLayout(centered);assert.ok(l.lines[1].x>l.lines[0].x);assert.equal(l.x,-5);
 const doc=imported(text);doc.entities=[{...doc.entities[0],...centered}];const after=importDXF(toDXF(doc)).document.entities[0];assert.equal(after.textAttachment,8);assert.equal(after.textRuns[0].paragraphAlign,'center');assert.equal(after.textRuns[0].tracking,1.25);
});
test('adjusted multiline TEXT exports with the same rendered bounds and line alignment',async()=>{
 const {applyTextProperty}=await import('../src/text.js');
 const doc=imported([...text,1,'ignored']);let e={...doc.entities[0],text:'LONG\nA',lineSpacing:2.5,rotation:0.3};
 e=applyTextProperty(e,'textAlign','right');doc.entities=[e];const after=importDXF(toDXF(doc)).document.entities[0];
 const a=bounds(e),b=bounds(after);for(const key of ['minX','maxX','minY','maxY'])assert.ok(Math.abs(a[key]-b[key])<1e-8,`${key}: ${a[key]} != ${b[key]}`);
 assert.equal(after.lineSpacing,2.5);assert.equal(after.textRuns[0].paragraphAlign,'right');
});
test('tracking and paragraph alignment reject malformed project values',()=>{
 const doc=imported(text);for(const patch of [{tracking:NaN},{tracking:0.1},{tracking:5},{paragraphAlign:'spread'},{textRuns:[{text:'AB',tracking:Infinity}]}]) assert.equal(validDocument({...doc,entities:[{...doc.entities[0],...patch}]}),false);
});
