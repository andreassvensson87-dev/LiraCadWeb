import test from 'node:test';
import assert from 'node:assert/strict';
import { ProjectWorkspace } from '../src/project-workspace.js';
import { ProjectStorage } from '../src/project-storage.js';
import { demoDocument } from '../src/demo-document.js';

function harness() {
  const values = new Map(), records = new Map(), errors = [];
  const metadata = {getItem:key=>values.get(key) ?? null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
  const createStorage = id => new ProjectStorage({
    checkpoint:null,
    async read() { const record=records.get(id);this.checkpoint=record?.revision;return record?.document; },
    async write(document,revision) { records.set(id,{document:structuredClone(document),revision});this.checkpoint=revision; },
    async close() {},
  },{journalStorage:()=>metadata,key:id==='current'?'liracad-v1':'liracad-'+id,delay:10000});
  const create = () => new ProjectWorkspace({createStorage,metadata:()=>metadata,fallback:demoDocument,onError:error=>errors.push(error)});
  return {create,records,values,errors,metadata};
}
test('existing single draft remains current; new projects have independent documents and histories',async()=>{
  const h=harness(),original=demoDocument();original.name='Min ritning';
  h.records.set('current',{document:original,revision:'baseline'});
  const workspace=h.create();await workspace.restore();
  const first=workspace.active;
  assert.equal(first.id,'current');assert.equal(first.session.document.name,'Min ritning');
  first.session.commit('Namn',doc=>{doc.name='Första';});
  const second=workspace.add({...original,name:'Andra'});await second.ready;
  second.session.commit('Radera',doc=>{doc.entities=[];});
  second.session.undo();assert.equal(second.session.document.entities.length,original.entities.length);
  workspace.activate(first.id);first.session.undo();
  assert.equal(first.session.document.name,'Min ritning');
  assert.equal(second.session.document.name,'Andra');
  assert.equal(second.session.history.future.length,1);
});
test('inactive debounced autosaves and recovery journals remain bound to their project',async()=>{
  const h=harness(),workspace=h.create();await workspace.restore();
  const first=workspace.active,second=workspace.add({...demoDocument(),name:'Andra'});await second.ready;
  first.session.commit('Namn',doc=>{doc.name='Första ändrad';});
  first.storage.observe(first.session.document);
  first.storage.schedule(()=>first.session.document,()=>{});
  second.session.commit('Namn',doc=>{doc.name='Andra ändrad';});second.storage.observe(second.session.document);
  assert.ok(h.values.has('liracad-v1-pending-additions'));
  assert.ok(h.values.has('liracad-'+second.id+'-pending-additions'));
  await workspace.flush();
  assert.equal(h.records.get('current').document.name,'Första ändrad');
  const reopened=h.create();await reopened.restore();
  assert.equal(reopened.active.session.document.name,'Andra ändrad');
  assert.equal(reopened.entries[0].session.document.name,'Första ändrad');
});
test('reload restores tab order, active project and camera without serializing large selections',async()=>{
  const h=harness(),workspace=h.create();await workspace.restore();
  const first=workspace.active,second=workspace.add({...demoDocument(),name:'Andra'});await second.ready;
  first.context={camera:{x:50,y:70,scale:2},selection:Array.from({length:100000},(_,i)=>'e'+i)};
  workspace.activate(first.id);
  assert.ok(h.values.get('liracad-workspace-v1').length<1000);
  const restored=h.create();await restored.restore();
  assert.deepEqual(restored.entries.map(e=>e.id),[first.id,second.id]);
  assert.equal(restored.activeId,first.id);
  assert.deepEqual(restored.active.context.camera,{x:50,y:70,scale:2});
  assert.equal(restored.active.context.selection,undefined);
});
test('closing saves latest document, releases session and lets the saved project reopen after reload',async()=>{
  const h=harness(),workspace=h.create();await workspace.restore();
  const first=workspace.active,second=workspace.add({...demoDocument(),name:'Andra'});await second.ready;
  second.session.commit('Radera',doc=>{doc.entities=[];});
  assert.equal(await workspace.close(second.id),true);
  assert.equal(workspace.activeId,first.id);assert.equal(workspace.entries.length,1);
  assert.equal(h.records.get(second.id).document.entities.length,0);
  assert.equal(await workspace.close(first.id),true);
  assert.equal(workspace.active,undefined);assert.equal(workspace.activeId,null);
  const restored=h.create();await restored.restore();
  assert.equal(restored.entries.length,0);assert.equal(restored.active,undefined);
  const reopened=await restored.reopen(second.id);
  assert.equal(restored.activeId,second.id);assert.equal(restored.closed.length,1);
  assert.equal(reopened.session.document.entities.length,0);
});
test('last project close preserves latest work and the empty workspace survives reload and new creation',async()=>{
  const h=harness(),workspace=h.create();await workspace.restore();
  const first=workspace.active;
  first.session.commit('Namn',doc=>{doc.name='Senaste arbetet';});
  first.context={camera:{x:20,y:30,scale:2}};
  await workspace.close(first.id);
  assert.equal(h.records.get(first.id).document.name,'Senaste arbetet');
  assert.deepEqual(JSON.parse(h.values.get('liracad-workspace-v1')).open,[]);
  const restored=h.create();assert.equal(await restored.restore(),undefined);
  const reopened=await restored.reopen(first.id);
  assert.equal(reopened.session.document.name,'Senaste arbetet');
  assert.deepEqual(reopened.context.camera,first.context.camera);
  await restored.close(first.id);
  const fresh=restored.add({...demoDocument(),name:'Ny ritning'});await fresh.ready;
  const reloaded=h.create();await reloaded.restore();
  assert.equal(reloaded.active.session.document.name,'Ny ritning');
  assert.equal(reloaded.closed[0].name,'Senaste arbetet');
});
test('failure to save the final project or its manifest keeps it open',async()=>{
  const h=harness(),workspace=h.create();await workspace.restore();const first=workspace.active;
  const write=first.storage.store.write;
  first.storage.store.write=async()=>{throw Error('Disk full');};
  await assert.rejects(workspace.close(first.id),/Disk full/);assert.equal(workspace.active,first);
  first.storage.store.write=write;
  h.metadata.setItem=()=>{throw Error('Quota');};
  await assert.rejects(workspace.close(first.id),/Quota/);
  assert.equal(workspace.active,first);assert.equal(workspace.entries.length,1);assert.equal(workspace.closed.length,0);
});
test('failed close leaves tab and session intact, including when manifest cannot be saved',async()=>{
  const h=harness(),workspace=h.create();await workspace.restore();
  const second=workspace.add(demoDocument());await second.ready;
  second.storage.store.write=async()=>{throw Error('Disk full');};
  await assert.rejects(workspace.close(second.id),/Disk full/);
  assert.equal(workspace.active,second);assert.equal(workspace.entries.length,2);
  second.storage.store.write=async()=>{};
  h.metadata.setItem=()=>{throw Error('Quota');};
  await assert.rejects(workspace.close(second.id),/Quota/);
  assert.equal(workspace.active,second);assert.equal(workspace.entries.length,2);assert.equal(workspace.closed.length,0);
});
test('unreadable draft and corrupt manifest are preserved without enabling overwrite',async()=>{
  const h=harness();h.records.set('current',{document:{broken:true},revision:'bad'});
  h.values.set('liracad-workspace-v1','{bad');
  const workspace=h.create();await workspace.restore();
  assert.equal(workspace.active.storage.writeAllowed,false);
  assert.equal(workspace.manifestAllowed,false);
  workspace.persist();assert.equal(h.values.get('liracad-workspace-v1'),'{bad');
  assert.deepEqual(h.records.get('current').document,{broken:true});
});
test('a newly opened tab is registered only after its initial document is durably saved',async()=>{
  const h=harness(),workspace=h.create();await workspace.restore();workspace.persist();
  const createStorage=workspace.createStorage;let finish;
  workspace.createStorage=id=>{
    const storage=createStorage(id),write=storage.store.write.bind(storage.store);
    storage.store.write=async(...args)=>{await new Promise(resolve=>{finish=resolve;});return write(...args);};return storage;
  };
  const next=workspace.add(demoDocument());workspace.persist();
  assert.equal(JSON.parse(h.values.get('liracad-workspace-v1')).open.length,1);
  await new Promise(resolve=>setImmediate(resolve));finish();await next.ready;
  assert.equal(JSON.parse(h.values.get('liracad-workspace-v1')).open.length,2);
  assert.ok(h.records.has(next.id));
});
