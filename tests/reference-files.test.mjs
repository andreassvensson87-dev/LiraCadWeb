import test from 'node:test';
import assert from 'node:assert/strict';
import {referencePath,matchReferenceFile,resolveReferenceFiles} from '../src/reference-files.js';
import {referenceEntities,referenceRows,findReference,referenceStatus,detachReference,bindReference} from '../src/references.js';
import {validDocument} from '../src/document.js';
import {DocumentSession} from '../src/document-session.js';
import {blockParts} from '../src/blocks.js';
const layer={id:'0',name:'0',color:'#ffffff'};
const drawing=(refs=[],own=true)=>({version:1,layers:[structuredClone(layer)],entities:own?[{id:'line',type:'line',layer:'0',points:[{x:0,y:0},{x:10,y:0}]}]:[],references:refs});
const ref=(name,props={})=>({id:name,name,path:name,kind:'attach',point:{x:0,y:0},rotation:0,scale:1,fade:60,loaded:true,geometry:[],...props});
const file=(path,doc)=>({name:path.split('/').at(-1),webkitRelativePath:path,doc});
const readFile=async f=>({document:f.doc});
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} ≠ ${b}`);

test('matches relative folder paths before basenames and refuses ambiguous duplicate names',()=>{
  const files=[file('Project/Arch/Plan.dwg',drawing()),file('Project/Steel/Plan.dwg',drawing())];
  assert.equal(referencePath('a\\b/../C.DWG'),'a/c.dwg');
  assert.equal(matchReferenceFile('../Arch/Plan.dwg',files,'Project/Steel/Main.dwg').file,files[0]);
  assert.equal(matchReferenceFile('Plan.dwg',files).ambiguous,true);
  assert.equal(matchReferenceFile('Missing.dwg',files).file,undefined);
  assert.equal(matchReferenceFile('C:\\old\\Plan.dwg',[files[0]]).file,files[0]);
});
test('resolves several missing placements atomically, parses each file once, and persists/undoes the tree',async()=>{
  const original=drawing([ref('A.dwg'),ref('B.dwg'),ref('A2',{path:'A.dwg',point:{x:50,y:0}})]),session=new DocumentSession(original),calls=new Map();
  const a=file('A.dwg',drawing([ref('Child.dwg',{point:{x:20,y:0}})])),b=file('B.dwg',drawing()),child=file('Child.dwg',drawing());
  const result=await resolveReferenceFiles(session.document,[a,b,child],{readFile:async f=>{calls.set(f,(calls.get(f)||0)+1);return readFile(f);}});
  assert.equal(result.loaded,5);assert.equal(result.missing,0);assert.ok(validDocument(result.document));assert.equal(calls.get(a),1);assert.equal(calls.get(child),1);
  assert.equal(referenceRows(result.document).length,5);assert.equal(referenceEntities(result.document).length,5);
  assert.equal(session.document.references[0].geometry.length,0);
  session.commit('Batch',()=>result.document);assert.ok(validDocument(JSON.parse(JSON.stringify(session.document))));
  session.undo();assert.equal(session.document.references[0].geometry.length,0);session.redo();assert.equal(referenceRows(session.document).length,5);
});
test('selecting an entire package links only roots and composes rotation, scale and reflection at each level',async()=>{
  const a=file('Project/A.dwg',drawing([ref('B.dwg',{point:{x:100,y:0},rotation:Math.PI/2,scale:2,mirrored:true})]));
  const b=file('Project/B.dwg',drawing([ref('C.dwg',{point:{x:20,y:0},scale:3})]));
  const c=file('Project/C.dwg',drawing());
  const result=await resolveReferenceFiles(drawing([],false),[c,b,a],{readFile,linkNew:true});
  assert.equal(result.document.references.length,1);assert.equal(result.document.references[0].name,'A.dwg');assert.equal(referenceRows(result.document).length,3);
  const r=result.document.references[0];r.point={x:10,y:20};r.scale=2;r.rotation=Math.PI/2;
  const entities=referenceEntities(result.document);assert.equal(entities.length,3);
  near(entities[2].points[0].x,-70);near(entities[2].points[0].y,220);near(entities[2].points[1].x,-190);near(entities[2].points[1].y,220);
  assert.ok(validDocument(result.document));
});
test('nested overlays are retained in the tree and excluded from displayed/bound geometry',async()=>{
  const a=file('A.dwg',drawing([ref('B.dwg',{kind:'overlay'})])),b=file('B.dwg',drawing([ref('C.dwg')])),c=file('C.dwg',drawing());
  const result=await resolveReferenceFiles(drawing([],false),[a,b,c],{readFile,linkNew:true});
  assert.equal(referenceRows(result.document).length,3);assert.equal(referenceRows(result.document)[1].excluded,true);assert.equal(referenceRows(result.document)[2].excluded,true);assert.equal(referenceEntities(result.document).length,1);
  bindReference(result.document,result.document.references[0].id,'0');assert.equal(blockParts(result.document.entities[0]).length,1);assert.ok(validDocument(result.document));
});
test('reference-only intermediate files load and missing descendants can be resolved in a later batch',async()=>{
  const a=file('A.dwg',drawing([ref('B.dwg')],false));
  let result=await resolveReferenceFiles(drawing([],false),[a],{readFile,linkNew:true});
  assert.equal(referenceStatus(result.document.references[0]),'Laddad');assert.equal(result.missing,1);assert.equal(referenceEntities(result.document).length,0);
  const childId=result.document.references[0].children[0].id;
  result=await resolveReferenceFiles(result.document,[file('B.dwg',drawing())],{readFile});
  assert.equal(result.missing,0);assert.equal(referenceEntities(result.document).length,1);assert.ok(findReference(result.document,childId).geometry.length);
  detachReference(result.document,result.document.references[0].id);assert.equal(result.document.layers.length,1);
});
test('circular files stop at the repeated path and incomplete branches remain visible in the tree',async()=>{
  const a=file('A.dwg',drawing([ref('B.dwg')])),b=file('B.dwg',drawing([ref('A.dwg')]));
  const result=await resolveReferenceFiles(drawing([],false),[a,b],{readFile,linkNew:true});
  assert.ok(result.messages.some(m=>m.includes('Cirkulär')));assert.equal(referenceRows(result.document).length,3);assert.equal(referenceRows(result.document).at(-1).reference.problem,'cycle');assert.equal(referenceStatus(referenceRows(result.document).at(-1).reference),'Cirkulär');assert.equal(referenceEntities(result.document).length,2);assert.ok(validDocument(result.document));
});
test('ambiguous matches stay unresolved and import failures leave the original document untouched',async()=>{
  const original=drawing([ref('Plan.dwg')]),before=JSON.stringify(original);
  const result=await resolveReferenceFiles(original,[file('A/Plan.dwg',drawing()),file('B/Plan.dwg',drawing())],{readFile});
  assert.equal(result.document.references[0].problem,'ambiguous');assert.equal(referenceEntities(result.document).length,0);assert.equal(JSON.stringify(original),before);
  await assert.rejects(resolveReferenceFiles(original,[file('Plan.dwg',drawing())],{readFile:async()=>{throw Error('Broken');}}),/Broken/);
  assert.equal(JSON.stringify(original),before);
});
test('recursive validation rejects excessive nesting and duplicated tree node ids',()=>{
  const doc=drawing([ref('root')]);doc.references[0].children=[ref('root')];assert.equal(validDocument(doc),false);
  let r=doc.references[0];r.children=[];for(let i=0;i<17;i++){r.children=[ref(`n${i}`)];r=r.children[0];}assert.equal(validDocument(doc),false);
});

test('choosing a project folder does not attach its current host file back into itself',async()=>{
  const host=drawing([ref('B.dwg')]);host.sourcePath='A.dwg';
  const a=file('Project/A.dwg',host),b=file('Project/B.dwg',drawing());
  const result=await resolveReferenceFiles(host,[a,b],{readFile,linkNew:true});
  assert.equal(result.document.references.length,1);assert.equal(result.document.references[0].name,'B.dwg');assert.equal(result.loaded,1);
});
test('reloading a parent keeps cached child geometry and overrides when child files were not selected',async()=>{
  const a=file('A.dwg',drawing([ref('B.dwg')])),b=file('B.dwg',drawing());
  let result=await resolveReferenceFiles(drawing([],false),[a,b],{readFile,linkNew:true,now:123});
  const root=result.document.references[0],child=root.children[0];child.snap=false;child.visible=false;
  a.doc.references[0].point={x:500,y:0};
  result=await resolveReferenceFiles(result.document,[a],{readFile,targetId:root.id,now:456});
  const reloaded=result.document.references[0].children[0];assert.equal(reloaded.id,child.id);assert.equal(reloaded.geometry.length,1);assert.equal(reloaded.loadedAt,123);assert.equal(reloaded.point.x,500);assert.equal(reloaded.snap,false);assert.equal(reloaded.visible,false);assert.ok(validDocument(result.document));
});

test('reload all refreshes loaded trees and repeated placements once per file while preserving host overrides',async()=>{
  const a=file('Project/A.dwg',drawing([ref('B.dwg')])),b=file('Project/B.dwg',drawing());
  let result=await resolveReferenceFiles(drawing([ref('A.dwg'),ref('Second',{path:'A.dwg'})]),[a,b],{readFile,now:123});
  const original=result.document,root=original.references[0],child=root.children[0];
  Object.assign(root,{point:{x:100,y:200},rotation:1,scale:3,kind:'attach',fade:25,visible:false,snap:false,loaded:false});
  Object.assign(child,{visible:false,snap:false,loaded:false});
  const owned=original.layers.find(l=>l.referenceId===root.id);Object.assign(owned,{color:'#abcdef',visible:false,locked:false});
  const before=JSON.stringify(original),calls=new Map();
  a.doc.entities[0].points[1].x=20;b.doc.entities[0].points[1].x=30;
  result=await resolveReferenceFiles(original,[a,b,file('Unrelated.dwg',drawing())],{readFile:async f=>{calls.set(f,(calls.get(f)||0)+1);return readFile(f);},reloadAll:true,now:456});
  assert.equal(result.loaded,4);assert.equal(calls.get(a),1);assert.equal(calls.get(b),1);assert.equal(calls.size,2);assert.equal(result.document.references.length,2);
  const next=result.document.references[0];assert.equal(next.geometry[0].points[1].x,20);assert.equal(next.children[0].geometry[0].points[1].x,30);
  for(const key of ['point','rotation','scale','kind','fade','visible','snap','loaded'])assert.deepEqual(next[key],root[key]);
  for(const key of ['visible','snap','loaded'])assert.equal(next.children[0][key],child[key]);
  assert.deepEqual(result.document.layers.find(l=>l.id===owned.id),owned);assert.equal(JSON.stringify(original),before);assert.ok(validDocument(result.document));
  const session=new DocumentSession(original);session.commit('Reload all',()=>result.document);session.undo();assert.deepEqual(session.document,original);session.redo();assert.equal(session.document.references[0].geometry[0].points[1].x,20);
});
test('reload all updates children independently when their parent file is absent and reports retained copies',async()=>{
  const a=file('A.dwg',drawing([ref('B.dwg')])),b=file('B.dwg',drawing());
  let result=await resolveReferenceFiles(drawing([],false),[a,b],{readFile,linkNew:true,now:123});
  const root=result.document.references[0];root.children[0].loaded=false;b.doc.entities[0].points[1].x=80;
  const oldLayerId=root.children[0].geometry[0].layer,oldLayer=result.document.layers.find(l=>l.id===oldLayerId);Object.assign(oldLayer,{color:'#abcdef',visible:false,locked:false});
  result=await resolveReferenceFiles(result.document,[b],{readFile,reloadAll:true,now:456});
  assert.equal(result.loaded,1);assert.deepEqual(result.notFound,['A.dwg']);assert.equal(result.document.references[0].loadedAt,123);
  assert.equal(result.document.references[0].children[0].geometry[0].points[1].x,80);assert.equal(result.document.references[0].children[0].loaded,false);
  assert.equal(result.document.references[0].children[0].geometry[0].layer,oldLayerId);assert.deepEqual(result.document.layers.find(l=>l.id===oldLayerId),oldLayer);
  assert.ok(result.messages.some(m=>m.includes('Uppdaterad: B.dwg')));assert.ok(result.messages.some(m=>m.includes('Ingen vald fil matchar: A.dwg')));
});
test('reload all keeps cached ambiguous children visible and reports duplicates without replacing root copies',async()=>{
  const a=file('A.dwg',drawing([ref('B.dwg')])),b=file('B.dwg',drawing());
  let result=await resolveReferenceFiles(drawing([],false),[a,b],{readFile,linkNew:true,now:123});
  result=await resolveReferenceFiles(result.document,[a,file('X/B.dwg',drawing()),file('Y/B.dwg',drawing())],{readFile,reloadAll:true,now:456});
  assert.equal(result.loaded,1);assert.deepEqual(result.ambiguous,['B.dwg']);assert.equal(result.missing,0);assert.equal(referenceEntities(result.document).length,2);assert.equal(result.document.references[0].children[0].loadedAt,123);
  const before=JSON.stringify(result.document);
  result=await resolveReferenceFiles(result.document,[file('X/A.dwg',drawing()),file('Y/A.dwg',drawing())],{readFile,reloadAll:true,now:789});
  assert.equal(result.loaded,0);assert.deepEqual(result.ambiguous,['A.dwg']);assert.equal(JSON.stringify(result.document),before);
});
test('a failed reload all leaves every original reference untouched',async()=>{
  const a=file('A.dwg',drawing()),b=file('B.dwg',drawing());
  const initial=await resolveReferenceFiles(drawing([ref('A.dwg'),ref('B.dwg')]),[a,b],{readFile,now:123}),before=JSON.stringify(initial.document);
  a.doc.entities[0].points[1].x=99;
  await assert.rejects(resolveReferenceFiles(initial.document,[a,b],{readFile:async f=>{if(f===b)throw Error('Unreadable B');return readFile(f);},reloadAll:true,now:456}),/Unreadable B/);
  assert.equal(JSON.stringify(initial.document),before);
});
test('reload all reaches a selected grandchild through a retained intermediate cache after reloading the root',async()=>{
  const a=file('A.dwg',drawing([ref('B.dwg')])),b=file('B.dwg',drawing([ref('C.dwg')])),c=file('C.dwg',drawing());
  let result=await resolveReferenceFiles(drawing([],false),[a,b,c],{readFile,linkNew:true,now:123});
  c.doc.entities[0].points[1].x=70;
  result=await resolveReferenceFiles(result.document,[a,c],{readFile,reloadAll:true,now:456});
  assert.equal(result.loaded,2);assert.deepEqual(result.notFound,['B.dwg']);assert.equal(result.document.references[0].children[0].children[0].geometry[0].points[1].x,70);assert.ok(validDocument(result.document));
});
