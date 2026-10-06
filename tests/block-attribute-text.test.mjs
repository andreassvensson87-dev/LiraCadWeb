import test from 'node:test';
import assert from 'node:assert/strict';
import {createBlock,blockParts,withAttributeText} from '../src/blocks.js';
import {DocumentSession} from '../src/document-session.js';
import {validDocument} from '../src/document.js';
import {toDXF} from '../src/dxf-export.js';
import {importDXF} from '../src/dxf-import.js';
import {fitViewportToEntities} from '../src/layout.js';
const attribute={id:'a',type:'text',layer:'0',point:{x:12,y:24},height:2,text:'Original',attributeTag:'TAG',font:'Arial',widthFactor:0.8,rotation:0.2};
const template=createBlock([attribute],'Stamp',{x:0,y:0},'0');
const doc=entities=>({version:1,name:'Test',layers:[{id:'0',name:'Text',color:'#ffffff'}],entities});
for(const mirrored of [false,true])test(`instance text changes preserve block-local placement and other instances, mirror=${mirrored}`,()=>{
 const block={...template,point:{x:100,y:200},rotation:0.7,scale:3,mirrored};const before=structuredClone(block),part=blockParts(block)[0];
 const changed=withAttributeText(block,'TAG',{...part,text:'Edited',height:12,widthFactor:0.6,font:'Georgia',tracking:1.2});
 const shown=blockParts(changed)[0];assert.deepEqual(shown.point,part.point);assert.equal(shown.height,12);assert.ok(Math.abs(shown.rotation-part.rotation)<1e-8);assert.equal(shown.font,'Georgia');assert.equal(shown.text,'Edited');assert.equal(shown.textMirrorY,part.textMirrorY);assert.equal(shown.tracking,1.2);
 assert.ok(Math.abs(changed.attributeOverrides.TAG.point.x-12)<1e-8);assert.ok(Math.abs(changed.attributeOverrides.TAG.point.y-24)<1e-8);assert.equal(changed.attributeOverrides.TAG.height,4);assert.deepEqual(block,before);assert.deepEqual(changed.definition,block.definition);
 const second={...template,id:'second'};assert.equal(blockParts(second)[0].text,'Original');assert.ok(validDocument(doc([changed,second])));
 const session=new DocumentSession(doc([block,second]));session.commit('Attribut',d=>{d.entities[0]=changed});assert.equal(session.history.past.length,1);session.undo();assert.deepEqual(session.document.entities[0],block);session.redo();assert.equal(blockParts(session.document.entities[0])[0].text,'Edited');
 const roundtrip=importDXF(toDXF(doc([changed]))).document;const native=blockParts(roundtrip.entities[0])[0];assert.equal(native.text,'Edited');assert.equal(native.font,'Georgia');assert.equal(native.height,12);assert.equal(native.widthFactor,0.6);assert.ok(Math.hypot(native.point.x-shown.point.x,native.point.y-shown.point.y)<1e-8);
});
test('two attribute overrides keep distinct IDs and reject missing targets',()=>{
 const b=createBlock([attribute,{...attribute,id:'b',attributeTag:'OTHER',point:{x:20,y:20}}],'Two',{x:0,y:0},'0');let changed=b;
 for(const tag of ['TAG','OTHER']){const p=blockParts(changed).find(p=>p.attributeTag===tag);changed=withAttributeText(changed,tag,{...p,text:''});}
 assert.ok(validDocument(doc([changed])));assert.notEqual(changed.attributeOverrides.TAG.id,changed.attributeOverrides.OTHER.id);assert.throws(()=>withAttributeText(changed,'MISSING',attribute),/inte längre/);
});
test('fitting a rotated viewport includes distant model geometry while keeping its paper rectangle',()=>{
 const v={type:'viewport',points:[{x:10,y:20},{x:110,y:70}],viewCenter:{x:0,y:0},viewScale:1,viewRotation:Math.PI/2,locked:true};const entities=[{type:'line',points:[{x:-170000,y:-30000},{x:-160000,y:-20000}]}];
 const fit=fitViewportToEntities(v,entities);assert.deepEqual(fit.points,v.points);assert.deepEqual(fit.viewCenter,{x:-165000,y:-25000});assert.ok(Math.abs(fit.viewScale-0.0045)<1e-10);assert.equal(fit.locked,true);assert.deepEqual(v.viewCenter,{x:0,y:0});assert.equal(fitViewportToEntities(v,[]),null);
});
