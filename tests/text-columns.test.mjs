import test from 'node:test';import assert from 'node:assert/strict';
import { textLayout, applyTextProperty } from '../src/text.js';
import { validDocument } from '../src/document.js';import { toDXF } from '../src/dxf-export.js';import { importDXF } from '../src/dxf-import.js';import { transformed } from '../src/entity-transform.js';import { layoutSVG } from '../src/plot.js';import { bounds } from '../src/entity-geometry.js';
const e={id:'t',layer:'0',type:'text',text:'AA\nBB\nCC\nDD',height:10,point:{x:100,y:100},rotation:0,textAttachment:1,textWidth:45,textColumns:{type:2,count:2,width:20,gutter:5,autoHeight:true,reversed:false,heights:[]}},doc={version:1,name:'Columns',layers:[{id:'0',name:'0',visible:true,color:'#ffffff'}],entities:[e]};
test('balanced columns share geometry between bounds, canvas layout and SVG; reversed flow changes positions',()=>{
 const layout=textLayout(e);assert.equal(layout.width,45);assert.deepEqual(layout.lines.map(l=>l.column),[0,0,1,1]);assert.equal(layout.lines[2].x,25);assert.equal(layout.lines[2].y,10);assert.equal(layout.bottom,24);
 assert.equal(bounds(e).maxX,145);assert.match(layoutSVG(doc,{id:'model',name:'Columns',width:200,height:200}),/translate\(25 10\)/);
 const reverse=textLayout({...e,textColumns:{...e.textColumns,reversed:true}});assert.deepEqual(reverse.lines.map(l=>l.column),[1,1,0,0]);
});
test('manual heights and explicit column breaks flow to the next column without dropping overflow text',()=>{
 const manual=textLayout({...e,textColumns:{...e.textColumns,autoHeight:false,heights:[10,10]}});assert.deepEqual(manual.lines.map(l=>l.column),[0,1,1,1]);assert.equal(manual.lines.flatMap(l=>l.runs).map(r=>r.text).join(''),'AABBCCDD');
 const explicit=textLayout({...e,text:'AA\fBB',textColumns:{...e.textColumns,autoHeight:false,heights:[100,100]}});assert.deepEqual(explicit.lines.map(l=>l.column),[0,1]);assert.equal(explicit.lines[1].y,10);
});
test('column settings, breaks, direction and heights survive native MTEXT export/import; malformed metadata is rejected',()=>{
 const input={...doc,entities:[{...e,text:'AA\fBB',rotation:Math.PI/2,textColumns:{...e.textColumns,autoHeight:false,heights:[10,20],reversed:true}}]};assert(validDocument(input));
 const exported=toDXF(input),result=importDXF(exported).document.entities[0];assert.deepEqual(result.textColumns,input.entities[0].textColumns);assert.equal(result.text,'AA\fBB');assert.equal(result.rotation,Math.PI/2);
 assert(!validDocument({...doc,entities:[{...e,textColumns:{...e.textColumns,count:100000}}]}));assert(!validDocument({...doc,entities:[{...e,textColumns:{...e.textColumns,width:0}}]}));
});
test('resizing and scaling column text update geometry and preserve total-width grips',()=>{
 const resized=applyTextProperty(e,'textWidth',65);assert.equal(resized.textColumns.width,30);assert.equal(textLayout(resized).width,65);
 const scaled=transformed(e,'SCALE',{x:0,y:0},{x:2000,y:0});assert.equal(scaled.textColumns.width,40);assert.equal(scaled.textColumns.gutter,10);assert.equal(textLayout(scaled).width,90);
});
