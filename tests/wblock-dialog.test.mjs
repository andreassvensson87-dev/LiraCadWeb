import test from 'node:test';
import assert from 'node:assert/strict';
import { createWblockDialog, saveWblockFile } from '../src/wblock-dialog.js';

const file={name:'Mall.dxf',text:'DXF content',type:'application/dxf'};
test('WBLOCK saves to the chosen file and closes it; cancellation and write failures do not download a fallback',async()=>{
  const calls=[], writable={write:async text=>calls.push(text),close:async()=>calls.push('closed'),abort:async()=>calls.push('aborted')};
  const handle={createWritable:async()=>writable};
  await saveWblockFile(file,{pickFile:async name=>{assert.equal(name,file.name);return handle;},download:()=>assert.fail('Unexpected download')});
  assert.deepEqual(calls,[file.text,'closed']);
  const abort=Object.assign(Error('Cancelled'),{name:'AbortError'});
  await assert.rejects(saveWblockFile(file,{pickFile:async()=>{throw abort;},download:()=>assert.fail('Unexpected download')}),{name:'AbortError'});
  writable.write=async()=>{throw Error('Disk error');};
  await assert.rejects(saveWblockFile(file,{handle,download:()=>assert.fail('Unexpected download')}),/Disk error/);
  assert.equal(calls.at(-1),'aborted');
  const downloads=[];await saveWblockFile(file,{download:(...args)=>downloads.push(args)});
  assert.deepEqual(downloads,[[file.name,file.text,file.type]]);
});

function fixture(options={}) {
  const elements=new Map(), element=id=>{
    if(!elements.has(id))elements.set(id,{value:'',disabled:false,textContent:'',replaceChildren(...children){this.children=children;this.value=children[0]?.value||'';}});
    return elements.get(id);
  };
  const dialog={open:false,querySelector:element,showModal(){this.open=true;},close(){this.open=false;},addEventListener(){}};
  const doc={version:1,name:'Original',layers:[{id:'0',name:'0',color:'#ffffff'}],entities:[{id:'line',type:'line',layer:'0',points:[{x:10,y:20},{x:30,y:20}]}]};
  let selected=doc.entities;
  const calls=[], controller=createWblockDialog({document:{querySelector:()=>dialog,createElement:()=>({})},getDocument:()=>doc,getSelected:()=>selected,beginPick:kind=>calls.push(kind),endPick:()=>calls.push('returned'),download:()=>calls.push('download'),prepareChange:()=>()=>calls.push('changed'),notify:message=>calls.push(message),...options});
  const submit=()=>element('#wblock-form').onsubmit({preventDefault(){}});
  return {controller,dialog,element,calls,submit,select:entities=>{selected=entities;}};
}
test('WBLOCK dialog retains fields while picking origin and selection, and changes originals only after successful export',async()=>{
  const f=fixture();f.controller.open();assert(f.dialog.open);
  f.element('#wblock-filename').value='Detail';
  f.element('#wblock-pick-base').onclick();assert.equal(f.controller.picking,'base');assert(!f.dialog.open);
  f.controller.resume({x:10,y:20});assert(f.dialog.open);assert.equal(f.element('#wblock-x').value,'10');assert.equal(f.element('#wblock-filename').value,'Detail');
  f.element('#wblock-pick-objects').onclick();f.select([]);f.controller.resume();assert.equal(f.element('#wblock-object-count').textContent,'0 objekt valda');
  await f.submit();assert.match(f.element('#wblock-status').textContent,/Välj objekt/);assert(!f.calls.includes('download'));
  f.select([{id:'line'}]);f.element('#wblock-pick-objects').onclick();f.controller.resume();
  await f.submit();assert(!f.dialog.open);assert(f.calls.indexOf('download')<f.calls.indexOf('changed'));
});
test('cancelled native save keeps dialog and originals available for retry',async()=>{
  const f=fixture({pickFile:async()=>{throw Object.assign(Error('Cancelled'),{name:'AbortError'});}});
  f.controller.open();await f.submit();assert(f.dialog.open);assert.equal(f.element('#wblock-status').textContent,'Sparandet avbröts.');assert(!f.calls.includes('changed'));assert(!f.calls.includes('download'));
});
