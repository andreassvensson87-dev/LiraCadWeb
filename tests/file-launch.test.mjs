import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFileOpenQueue, setupFileLaunch, setupFileDrop } from '../src/file-launch.js';

test('Windows manifest registers DWG and DXF within root and subdirectory scope', () => {
 const manifest=JSON.parse(readFileSync(new URL('../manifest.webmanifest',import.meta.url)));
 for(const root of ['https://example.org/','https://example.org/LiraCadWeb/']) {
  const scope=new URL(manifest.scope,root), handler=manifest.file_handlers[0];
  assert(new URL(handler.action,root).href.startsWith(scope.href));
  assert.deepEqual(Object.values(handler.accept).flat().sort(),['.dwg','.dxf']);
  assert.equal(handler.launch_type,'single-client');
 }
 assert.equal(manifest.launch_handler.client_mode,'focus-existing');
});
test('OS launches during an import queue files in order and continue after unreadable handles', async () => {
 let consumer, release; const firstWait=new Promise(r=>release=r),opened=[],errors=[];
 const queue=createFileOpenQueue({openFile:async file=>{opened.push(file.name);if(file.name==='one.dwg')await firstWait;},onError:e=>errors.push(e.message)});
 assert(setupFileLaunch(queue,{launchQueue:{setConsumer:fn=>consumer=fn}}));
 const a=consumer({files:[{getFile:async()=>({name:'one.dwg'})}]});
 await new Promise(r=>setImmediate(r));
 const b=consumer({files:[{getFile:async()=>{throw Error('File access denied');}},{getFile:async()=>({name:'two.DXF'})}]});
 release();await Promise.all([a,b]);assert.deepEqual(opened,['one.dwg','two.DXF']);assert.deepEqual(errors,['File access denied']);assert.equal(queue.pending,0);
});
test('blocked workspace and cancelled text edit retain launched files for retry', async () => {
 let ready=false,cancel=true;const opened=[],counts=[];
 const queue=createFileOpenQueue({canOpen:()=>ready,onPending:n=>counts.push(n),openFile:async f=>{if(cancel)return false;opened.push(f.name);}});
 await queue.enqueueFiles([{name:'a.dwg'},{name:'b.dxf'}]);assert.equal(queue.pending,2);
 ready=true;await queue.resume();assert.equal(queue.pending,2);
 cancel=false;await queue.resume();assert.deepEqual(opened,['a.dwg','b.dxf']);assert.equal(counts.at(-1),0);
});
test('unsupported file launch API and normal non-file startup leave workspace alone', async () => {
 const opened=[];const queue=createFileOpenQueue({openFile:async f=>opened.push(f.name)});
 assert.equal(setupFileLaunch(queue,{}),false);let consume;setupFileLaunch(queue,{launchQueue:{setConsumer:f=>consume=f}});
 await consume({});assert.deepEqual(opened,[]);
});

function drag(target, type, files = [], types = ['Files'], relatedTarget = {}) {
 const event = new Event(type, { cancelable: true });
 event.dataTransfer = { types, files, dropEffect: 'none' };
 event.relatedTarget = relatedTarget;
 target.dispatchEvent(event);
 return event;
}
test('dropped files use the open queue, prevent browser navigation and survive a blocked editor', async () => {
 const target = new EventTarget(), host = new EventTarget(), opened = [], errors = [], active = [];
 let ready = false;
 const queue = createFileOpenQueue({ canOpen:()=>ready, openFile:async file=>opened.push(file.name), onError:error=>errors.push(error.message) });
 const dispose = setupFileDrop(queue, {target,host,onActive:value=>active.push(value)});
 drag(target,'dragenter'); drag(target,'dragenter'); drag(target,'dragleave');
 assert.equal(active.at(-1),true);
 const over = drag(target,'dragover'); assert(over.defaultPrevented); assert.equal(over.dataTransfer.dropEffect,'copy');
 const drop = drag(target,'drop',[{name:'a.dwg'},{name:'bad.exe'},{name:'b.DXF'}]);
 assert(drop.defaultPrevented); assert.equal(active.at(-1),false);
 await queue.resume(); assert.equal(queue.pending,3); assert.deepEqual(opened,[]);
 ready=true; await queue.resume(); assert.deepEqual(opened,['a.dwg','b.DXF']); assert.equal(errors.length,1);
 dispose(); assert.equal(drag(target,'drop',[{name:'c.dwg'}]).defaultPrevented,false);
});
test('text drags remain untouched and cancelled file drags hide the hint', () => {
 const target=new EventTarget(),host=new EventTarget(),active=[];
 setupFileDrop({enqueueFiles(){throw Error('unexpected file');}},{target,host,onActive:value=>active.push(value)});
 assert.equal(drag(target,'dragover',[],['text/plain']).defaultPrevented,false);
 assert.equal(drag(target,'drop',[],['text/plain']).defaultPrevented,false);
 assert.deepEqual(active,[]);
 drag(target,'dragenter'); drag(target,'dragleave',[],[],null); assert.equal(active.at(-1),false);
 drag(target,'dragenter'); host.dispatchEvent(new Event('blur')); assert.equal(active.at(-1),false);
});
