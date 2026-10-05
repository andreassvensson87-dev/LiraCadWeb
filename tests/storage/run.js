import { IndexedDBProjectStore } from '../../src/indexeddb-project-store.js';
import { ProjectStorage } from '../../src/project-storage.js';
import { demoDocument } from '../../src/demo-document.js';
import { validDocument } from '../../src/document.js';
const result=document.querySelector('#result'),button=document.querySelector('#run');
const assert=(condition,message)=>{if(!condition)throw Error(message);};
button.onclick=async()=>{
  button.disabled=true;result.textContent='Kör…';
  const store=new IndexedDBProjectStore(),scratchName='liracad-storage-test-'+crypto.randomUUID();
  const scratch=new IndexedDBProjectStore(()=>indexedDB,{name:scratchName});
  const savedKeys=['liracad-v1','liracad-navigation','liracad-v1-pending-additions'],legacy=savedKeys.map(key=>localStorage.getItem(key));
  let original,originalCheckpoint,backedUp=false,iframe,win,ui;
  const $=selector=>ui?.querySelector(selector);
  const wait=async predicate=>{const deadline=performance.now()+30000;while(!predicate()){if(performance.now()>deadline)throw Error('Timeout');await new Promise(resolve=>setTimeout(resolve,20));}};
  const mount=async reload=>{
    const loaded=new Promise(resolve=>iframe.onload=resolve);
    if(reload)iframe.contentWindow.location.reload();else {iframe.src='/';document.body.append(iframe);}
    await loaded;win=iframe.contentWindow;ui=iframe.contentDocument;
    await wait(()=>typeof $('#settings-button')?.onclick==='function');
  };
  try {
    original=await store.read();originalCheckpoint=store.checkpoint;backedUp=true;
    let raw=JSON.stringify(demoDocument());
    const migration=new ProjectStorage(scratch,{legacyStorage:()=>({getItem:()=>raw,removeItem:()=>{raw=null;}})});
    const migrated=await migration.restore(validDocument);
    assert(migrated.migrated&&raw===null,'Migrering misslyckades');
    await scratch.close();
    const reopened=new IndexedDBProjectStore(()=>indexedDB,{name:scratchName});
    assert(JSON.stringify(await reopened.read())===JSON.stringify(migrated.document),'Migrerat utkast ändrades');await reopened.close();
    iframe=document.createElement('iframe');await mount(false);
    $('#settings-button').click();$('#stress-count').value='100000';$('#generate-stress').click();
    await wait(()=>!$('#settings-dialog').open&&$('#save-state').textContent==='Autosparat lokalt');
    const persisted=await store.read();assert(persisted.entities.length===100000,'Autosparningen saknar objekt');
    const bytes=new Blob([JSON.stringify(persisted)]).size;
    const start=performance.now();await mount(true);
    assert($('#entity-count').textContent.startsWith('100000 '),'Omladdning återställde fel ritning');
    const reloaded=await store.read();assert(JSON.stringify(reloaded)===JSON.stringify(persisted),'Dokumentet ändrades efter omladdning');
    const reloadMs=performance.now()-start;
    const submit=text=>{const input=$('#command-input');input.value=text;input.dispatchEvent(new win.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));};
    submit('LINE');submit('0,0');submit('1000,0');submit('');
    await wait(()=>$('#save-state').textContent==='Autosparat lokalt');
    const edited=await store.read();assert(edited.entities.length===100001,'Nytt objekt autosparades inte');
    submit('UNDO');await wait(()=>$('#save-state').textContent==='Autosparat lokalt');
    assert((await store.read()).entities.length===100000,'Ångra autosparades inte');
    submit('LINE');submit('0,0');submit('2000,0');submit('');
    await mount(true); // pagehide must flush a change before the debounce fires
    assert($('#entity-count').textContent.startsWith('100001 '),'Snabb omladdning tappade senaste objektet');
    // Keep the full stress scene visible, but make just one line editable so
    // public Ctrl+A selects a small edit without inspecting hidden app state.
    const fixture={...persisted,layers:[{id:'recovery-edit',name:'Återställningsprov',color:'#ffffff',visible:true,locked:false},...persisted.layers.map(layer=>({...layer,locked:true}))],
      entities:persisted.entities.map((entity,i)=>i===0?{...entity,layer:'recovery-edit'}:entity)};
    const select=()=>{
      $('#canvas').dispatchEvent(new win.KeyboardEvent('keydown',{key:'a',ctrlKey:true,bubbles:true}));
      assert($('#selection-badge').textContent==='1','Testlinjen kunde inte markeras');
    };
    const move=()=>{select();submit('MOVE');submit('0,0');submit('1000,2000');};
    const immediate={};
    for(const action of ['move','rotate','erase','undo','redo']) {
      await wait(()=>!$('#save-state').textContent.startsWith('Sparar…'));iframe.remove();
      await store.write(fixture);await mount(false);
      if(action==='move')move();
      if(action==='rotate'){select();submit('ROTATE');submit('0,0');submit('90');}
      if(action==='erase'){select();submit('ERASE');}
      if(action==='undo'){move();submit('UNDO');}
      if(action==='redo'){move();submit('UNDO');submit('REDO');}
      const raw=localStorage.getItem('liracad-v1-pending-additions');
      assert(raw!==null,'Ändringsloggen saknas för '+action);
      assert(raw.length<4000,'En liten ändring skrev hela stresstritningen till loggen');
      await mount(true); // reload directly, without awaiting autosave
      const recovered=await store.read(),target=recovered.entities.find(e=>e.id===fixture.entities[0].id);
      if(action==='erase')assert(!target && JSON.stringify(recovered.entities)===JSON.stringify(fixture.entities.slice(1)),'Radering återställdes fel');
      else {
        assert(recovered.entities.length===100000 && target,'Återställning tappade objekt efter '+action);
        assert(JSON.stringify(recovered.entities.slice(1))===JSON.stringify(fixture.entities.slice(1)),'Oförändrade objekt ändrades efter '+action);
        if(action==='undo')assert(JSON.stringify(recovered)===JSON.stringify(fixture),'Ångra återställdes fel');
        if(action==='move'||action==='redo')assert(JSON.stringify(target.points)==='[{"x":1000,"y":2000},{"x":1300,"y":2200}]','Flytt/Gör om återställdes fel');
        if(action==='rotate')assert(Math.abs(target.points[1].x+200)<1e-8 && Math.abs(target.points[1].y-300)<1e-8,'Rotation återställdes fel');
      }
      immediate[action]=true;
    }
    result.textContent=JSON.stringify({migration:true,objects:100000,documentBytes:bytes,reloadMs:+reloadMs.toFixed(1),exactRestore:true,newObjectSaved:true,undoSaved:true,immediateReload:true,immediateEditReload:immediate,smallRecoveryLog:true},null,2);
  }catch(error){result.textContent=error.stack;}
  finally {
    if(iframe){await wait(()=>!$('#save-state')?.textContent.startsWith('Sparar…')).catch(()=>{});iframe.remove();}
    if(backedUp){if(original===undefined)await store.clear();else await store.write(original,originalCheckpoint || undefined);}
    savedKeys.forEach((key,i)=>legacy[i]===null?localStorage.removeItem(key):localStorage.setItem(key,legacy[i]));
    await store.close();await scratch.close();
    await new Promise((resolve,reject)=>{const request=indexedDB.deleteDatabase(scratchName);request.onsuccess=resolve;request.onerror=()=>reject(request.error);});
    button.disabled=false;
  }
};
