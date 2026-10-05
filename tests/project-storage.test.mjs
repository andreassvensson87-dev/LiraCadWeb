import test from 'node:test';
import assert from 'node:assert/strict';
import { ProjectStorage } from '../src/project-storage.js';
import { IndexedDBProjectStore } from '../src/indexeddb-project-store.js';
import { demoDocument } from '../src/demo-document.js';
import { validDocument } from '../src/document.js';
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
function fixture() {
  let record,raw=JSON.stringify(demoDocument());
  const store={read:async()=>structuredClone(record),write:async doc=>{record=structuredClone(doc);}};
  const legacy={getItem:()=>raw,removeItem:()=>{raw=null;}};
  return {store,legacy,storage:new ProjectStorage(store,{legacyStorage:()=>legacy}),raw:()=>raw,record:()=>record};
}
test('migration removes the legacy draft only after a committed write and prefers IndexedDB on later starts',async()=>{
  const f=fixture(),gate=deferred(),write=f.store.write;
  f.store.write=async doc=>{await gate.promise;await write(doc);};
  const migration=f.storage.restore(validDocument);await tick();assert.ok(f.raw());assert.equal(f.record(),undefined);
  gate.resolve();const restored=await migration;
  assert.equal(restored.migrated,true);assert.equal(f.raw(),null);assert.deepEqual(f.record(),restored.document);
  const next=new ProjectStorage(f.store,{legacyStorage:()=>({getItem:()=>{throw Error('legacy must not be read');}})});
  assert.deepEqual((await next.restore(validDocument)).document,restored.document);
});
test('failed migration retains the intact legacy draft and can be retried',async()=>{
  const f=fixture(),raw=f.raw(),write=f.store.write;
  f.store.write=async()=>{throw Error('Quota');};
  const restored=await f.storage.restore(validDocument);
  assert.ok(restored.document);assert.equal(restored.error,false);assert.equal(restored.migrationError.message,'Quota');assert.equal(f.raw(),raw);
  f.store.write=write;assert.equal((await f.storage.restore(validDocument)).migrated,true);assert.equal(f.raw(),null);
});
test('unreadable drafts are never overwritten by a fallback document',async()=>{
  const f=fixture();f.store.read=async()=>({version:1,entities:[]});
  assert.equal((await f.storage.restore(validDocument)).error,true);
  await assert.rejects(f.storage.save(demoDocument()),/pausad/);assert.equal(f.record(),undefined);assert.ok(f.raw());
});
test('overlapping saves are ordered and only the latest revision reports completion',async()=>{
  const gate=deferred(),writes=[],feedback=[];
  const storage=new ProjectStorage({write:async doc=>{writes.push(doc.name);if(doc.name==='old')await gate.promise;}},{delay:10000});
  const first=storage.save({name:'old'},error=>feedback.push(['old',error]));await tick();
  storage.schedule(()=>({name:'latest'}),error=>feedback.push(['latest',error]));
  const last=storage.flush();await tick();assert.deepEqual(writes,['old']);
  gate.resolve();await Promise.all([first,last]);assert.deepEqual(writes,['old','latest']);assert.deepEqual(feedback,[['latest',null]]);
});
test('flush saves pending edits immediately and a failed write does not poison the next write',async()=>{
  let fail=true,record;const feedback=[];
  const storage=new ProjectStorage({write:async doc=>{if(fail)throw Error('Denied');record=doc;}},{delay:10000});
  storage.schedule(()=>({name:'first'}),error=>feedback.push(error));await assert.rejects(storage.flush(),/Denied/);
  fail=false;storage.schedule(()=>({name:'second'}),error=>feedback.push(error));await storage.flush();
  assert.equal(record.name,'second');assert.equal(feedback[0].message,'Denied');assert.equal(feedback[1],null);
});
function adapterFixture() {
  let opened=0;const request={},operation={},transaction={abort(){this.onabort();},objectStore(){return {put(){return operation;},get(){return operation;}};}};
  const db={objectStoreNames:{contains:()=>true},transaction:()=>transaction,closed:false,close(){this.closed=true;}};
  const store=new IndexedDBProjectStore(()=>({open(){opened++;return request;}}));
  return {store,request,operation,transaction,db,opened:()=>opened};
}
test('IndexedDB write waits for transaction commit and rejects a later abort',async()=>{
  const f=adapterFixture();let saved=false;
  const save=f.store.write({name:'draft'}).then(()=>{saved=true;});
  f.request.result=f.db;f.request.onsuccess();await tick();
  f.operation.onsuccess();await tick();assert.equal(saved,false);
  f.transaction.error=Error('Quota');f.transaction.onabort();await assert.rejects(save,/Quota/);
  const second=f.store.write({name:'retry'});await tick();f.operation.onsuccess();f.transaction.oncomplete();await second;
  assert.equal(f.opened(),1);await f.store.close();assert.equal(f.db.closed,true);
});
test('blocked opens reject promptly and close a late connection',async()=>{
  const f=adapterFixture(),open=f.store.open();f.request.onblocked();await assert.rejects(open,/blockeras/);
  f.request.result=f.db;f.request.onsuccess();assert.equal(f.db.closed,true);
});
test('unavailable IndexedDB reports failure',async()=>{
  const store=new IndexedDBProjectStore(()=>undefined);await assert.rejects(store.read(),/inte tillgängligt/);
});
function journalFixture() {
  let document=demoDocument();const entries=new Map();
  const store={checkpoint:'base',read:async()=>structuredClone(document),write:async (value,revision=crypto.randomUUID())=>{document=structuredClone(value);store.checkpoint=revision;}};
  const journal={getItem:key=>entries.get(key)??null,setItem:(key,value)=>entries.set(key,value),removeItem:key=>entries.delete(key)};
  const storage=()=>new ProjectStorage(store,{journalStorage:()=>journal});
  const addition=id=>({id,type:'line',layer:document.layers[0].id,points:[{x:0,y:0},{x:100,y:0}]});
  return {store,journal,storage,addition,entries};
}
test('pending additions recover after reload and committed additions are not applied twice',async()=>{
  const f=journalFixture(),s=f.storage(),before=(await s.restore(validDocument)).document;await s.initialize(before);
  const extra=f.addition('pending'),next={...before,entities:[...before.entities,extra]};s.recordAddition(next,[extra]);
  const restored=await f.storage().restore(validDocument);
  assert.equal(restored.recovered,true);assert.deepEqual(restored.document,next);assert.equal(f.entries.size,0);
  const another=f.addition('already-saved'),after={...next,entities:[...next.entities,another]};
  const current=f.storage();await current.initialize(next);current.recordAddition(after,[another]);
  const raw=f.journal.getItem(current.journalKey);await current.save(after);
  f.journal.setItem(current.journalKey,raw); // page closed after commit, before log cleanup
  assert.deepEqual((await f.storage().restore(validDocument)).document,after);
});
test('recovery failure keeps the log and still opens the valid recovered document',async()=>{
  const f=journalFixture(),s=f.storage(),before=(await s.restore(validDocument)).document;await s.initialize(before);
  const extra=f.addition('recover'),next={...before,entities:[...before.entities,extra]};s.recordAddition(next,[extra]);
  const write=f.store.write;f.store.write=async()=>{throw Error('Quota');};
  const restored=await f.storage().restore(validDocument);
  assert.deepEqual(restored.document,next);assert.equal(restored.recoveryError.message,'Quota');assert.equal(f.entries.size,1);
  f.store.write=write;assert.deepEqual((await f.storage().restore(validDocument)).document,next);assert.equal(f.entries.size,0);
});
test('foreign or incomplete recovery logs cannot overwrite another draft',async()=>{
  const f=journalFixture(),before=await f.store.read();
  for(const log of [{base:'foreign',records:[]},{base:'base',records:[{before:'wrong',after:'next',entities:[f.addition('bad')]}]}]){
    f.journal.setItem('liracad-v1-pending-additions',JSON.stringify(log));const s=f.storage();
    assert.equal((await s.restore(validDocument)).error,true);await assert.rejects(s.save(demoDocument()),/pausad/);
    assert.deepEqual(await f.store.read(),before);assert.equal(f.entries.size,1);
  }
});
test('log cleanup failure does not hide a committed save or duplicate recovered entities',async()=>{
  const f=journalFixture(),s=f.storage(),before=(await s.restore(validDocument)).document;await s.initialize(before);
  const extra=f.addition('cleanup'),next={...before,entities:[...before.entities,extra]};s.recordAddition(next,[extra]);
  f.journal.removeItem=()=>{throw Error('Denied');};let saved;
  await s.save(next,error=>{saved=error;});assert.equal(saved,null);assert.equal(f.entries.size,1);
  assert.deepEqual((await f.storage().restore(validDocument)).document,next);
  assert.deepEqual((await f.storage().restore(validDocument)).document,next);
});

test('mixed addition, move, rotation, removal, undo and redo recover as one exact document',async()=>{
  const f=journalFixture(),s=f.storage(),before=(await s.restore(validDocument)).document;await s.initialize(before);
  const extra=f.addition('chain'),added={...before,entities:[...before.entities,extra]};s.recordAddition(added,[extra]);
  const moved={...added,entities:added.entities.map(e=>e.id===extra.id?{...e,points:[{x:30,y:40},{x:130,y:40}]}:e)};s.observe(moved);
  const rotated={...moved,entities:moved.entities.map(e=>e.id===extra.id?{...e,points:[{x:-40,y:30},{x:-40,y:130}]}:e)};s.observe(rotated);
  s.observe(before);s.observe(rotated);s.observe(before); // remove, undo, redo
  s.observe({...before,name:'Efter'});
  const recovered=await f.storage().restore(validDocument);
  assert.equal(recovered.recovered,true);assert.deepEqual(recovered.document,{...before,name:'Efter'});assert.equal(f.entries.size,0);
});
test('a committed prefix is skipped while later edits and undo remain recoverable',async()=>{
  const f=journalFixture(),s=f.storage(),before=(await s.restore(validDocument)).document;await s.initialize(before);
  const moved={...before,entities:before.entities.map((e,i)=>i===0?{...e,color:'#123456'}:e)};
  s.observe(moved);const first=s.documentRevision;
  s.observe(before);s.observe({...moved,name:'Latest'});
  const raw=f.journal.getItem(s.journalKey);await f.store.write(moved,first);
  const restored=await f.storage().restore(validDocument);
  assert.deepEqual(restored.document,{...moved,name:'Latest'});
  f.journal.setItem(s.journalKey,raw);
  assert.deepEqual((await f.storage().restore(validDocument)).document,{...moved,name:'Latest'});
});
test('queued save cleanup retains newer recovery records and failure can be retried',async()=>{
  const f=journalFixture(),s=f.storage(),before=(await s.restore(validDocument)).document;await s.initialize(before);
  const gate=deferred(),write=f.store.write;
  f.store.write=async(value,revision)=>{await gate.promise;await write(value,revision);};
  const first={...before,name:'First'};s.observe(first);const saving=s.save(first);await tick();
  const latest={...first,name:'Latest'};s.observe(latest);gate.resolve();await saving;
  assert.equal(JSON.parse(f.journal.getItem(s.journalKey)).records.length,1);
  f.store.write=async()=>{throw Error('Quota');};
  const recovered=await f.storage().restore(validDocument);assert.deepEqual(recovered.document,latest);assert.ok(recovered.recoveryError);
  f.store.write=write;assert.deepEqual((await f.storage().restore(validDocument)).document,latest);
});
test('invalid patch recovery leaves the database and recovery log intact',async()=>{
  const f=journalFixture(),before=await f.store.read(),s=f.storage();
  f.journal.setItem(s.journalKey,JSON.stringify({base:'base',records:[{before:'base',after:'next',patch:{remove:['missing'],upsert:[],place:[],set:{},unset:[]}}]}));
  assert.equal((await s.restore(validDocument)).error,true);assert.deepEqual(await f.store.read(),before);assert.equal(f.entries.size,1);
  await assert.rejects(s.save(before),/pausad/);
});
test('journal quota failure retains the earlier log and full autosave clears the failure',async()=>{
  const f=journalFixture(),s=f.storage(),before=(await s.restore(validDocument)).document;await s.initialize(before);
  const first={...before,name:'First'};s.observe(first);const raw=f.journal.getItem(s.journalKey);
  const set=f.journal.setItem;f.journal.setItem=()=>{throw Error('Quota');};
  const latest={...before,name:'Latest'};assert.throws(()=>s.observe(latest),/Quota/);
  assert.equal(f.journal.getItem(s.journalKey),raw);assert.equal(s.journalError.message,'Quota');
  await s.save(latest);assert.equal(s.journalError,null);assert.deepEqual(await f.store.read(),latest);assert.equal(f.entries.size,0);
  f.journal.setItem=set;
});

test('unknown journal versions and cyclic checkpoints cannot overwrite a draft',async()=>{
  const f=journalFixture(),before=await f.store.read();
  for(const log of [{version:3,base:'base',records:[]},{base:'base',records:[{before:'base',after:'next',entities:[]},{before:'next',after:'base',entities:[]}]}]) {
    const s=f.storage();f.journal.setItem(s.journalKey,JSON.stringify(log));
    assert.equal((await s.restore(validDocument)).error,true);assert.deepEqual(await f.store.read(),before);assert.equal(f.entries.size,1);
  }
});
