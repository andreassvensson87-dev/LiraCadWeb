import { stressDocument } from '../../src/stress-document.js';
import { nearbySnaps } from '../../src/snapping.js';
import {createLocalSnapIndex} from '../../src/local-snapping.js';
import {createSpatialIndex} from '../../src/spatial-index.js';
import {bounds} from '../../src/entity-geometry.js';
import { createSceneRenderer } from '../../src/scene-renderer.js';
import { IndexedDBProjectStore } from '../../src/indexeddb-project-store.js';
const result = document.querySelector('#result'), button = document.querySelector('#run');
const measure = (run, count = 30) => {
  const times = [];
  for (let i = 0; i < count; i++) { const start = performance.now(); run(i); times.push(performance.now() - start); }
  times.sort((a,b)=>a-b);
  return { median: +times[Math.floor(count / 2)].toFixed(2), p95: +times[Math.floor(count * .95)].toFixed(2) };
};
button.onclick = async () => {
  button.disabled = true; result.textContent = 'Kör…';
  try {
    const doc = await stressDocument(100000),sceneIndex=createSpatialIndex(doc.entities,bounds),index=createLocalSnapIndex(doc.entities,{entityIndex:sceneIndex});
    const render = createSceneRenderer({ ctx: document.querySelector('canvas').getContext('2d') });
    const frame = { doc, camera: {x:79000,y:79000,scale:.003}, width:1000,height:600,dpr:1,activeSpace:'model',
      activeViewportId:null,selection:new Set(),hover:null,tool:null,cursor:{x:79000,y:79000},mouse:{x:500,y:300},showGrid:false,
      drag:null,trackAnchors:[],snap:null,previews:[],gripPreviews:[],editableIds:new Set(),sceneIndex };
    render(frame);
    const pan = measure(i=>{frame.camera={x:79000+i*500,y:79000,scale:.003};render(frame);});
    const zoom = measure(i=>{frame.camera={x:79000,y:79000,scale:.003*1.06**i};render(frame);});
    frame.camera={x:79000,y:79000,scale:.003};render(frame);frame.navigating=true;
    const interactivePan = measure(i=>{frame.camera={x:79000+i*500,y:79000,scale:.003};render(frame);});
    frame.navigating=false;frame.camera={x:79000,y:79000,scale:.003};render(frame);frame.navigating=true;
    const interactiveZoom = measure(i=>{frame.camera={x:79000,y:79000,scale:.003*1.03**i};render(frame);});
    frame.navigating=false;
    frame.camera={x:79000,y:79000,scale:1}; render(frame);
    const localPan = measure(i=>{frame.camera={x:79000+i*5,y:79000,scale:1};render(frame);});
    const snapLocal = measure(i=>nearbySnaps(index,{x:79000+i,y:79000},11),100);
    const snapOverview = measure(i=>nearbySnaps(index,{x:79000+i,y:79000},11/.003),30);
    frame.camera={x:79000,y:79000,scale:.003};render(frame);
    const preview = measure(i=>{frame.previews=[{id:'preview',layer:'stress-0',type:'line',points:[{x:79000,y:79000},{x:80000+i*10,y:80000}]}];render(frame);});
    result.textContent = JSON.stringify({objects:doc.entities.length,unit:'ms per operation',pan,zoom,interactivePan,interactiveZoom,localPan,snapLocal,snapOverview,preview,snapCache:index.cacheStats()},null,2);
  } catch(error) { result.textContent=error.stack; }
  finally {button.disabled=false;}
};

// Exercise the actual app's public DOM handlers in a separate frame. Keep the
// existing local draft byte-for-byte, even if a check throws or storage is full.
document.querySelector('#app-run').onclick = async () => {
  const output=document.querySelector('#app-result'), control=document.querySelector('#app-run');
  const keys=['liracad-v1','liracad-navigation','liracad-v1-pending-additions'], saved=keys.map(key=>localStorage.getItem(key));
  const store=new IndexedDBProjectStore(),savedDraft=await store.read(),savedCheckpoint=store.checkpoint;
  const iframe=document.createElement('iframe');iframe.style='width:1200px;height:700px;display:block';
  control.disabled=true;output.textContent='Kör appens interaktionstest…';
  try {
    const loaded=new Promise(resolve=>iframe.onload=resolve);iframe.src='/';document.body.append(iframe);await loaded;
    const win=iframe.contentWindow,ui=iframe.contentDocument,$=selector=>ui.querySelector(selector);
    const pause=()=>new Promise(resolve=>win.requestAnimationFrame(resolve));
    const wait=async predicate=>{const deadline=performance.now()+30000;while(!predicate()){if(performance.now()>deadline)throw Error('Timeout');await pause();}};
    await wait(()=>typeof $('#settings-button')?.onclick==='function');
    const initial=$('#entity-count').textContent;
    $('#settings-button').click();$('#stress-count').value='100000';$('#stress-pattern').value='mixed';$('#generate-stress').click();
    await wait(()=>!$('#settings-dialog').open);await pause();
    if(!$('#entity-count').textContent.startsWith('100000 '))throw Error('Genereringen misslyckades');
    const submit=text=>{$('#command-input').value=text;$('#command-input').dispatchEvent(new win.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));};
    $('#navigation-device').value='trackpad';$('#navigation-device').dispatchEvent(new win.Event('change'));
    submit('LINE');
    const canvas=$('#canvas'),rect=canvas.getBoundingClientRect();let snaps=0;const intervals=[];let previous;
    for(let i=0;i<60;i++) {
      const stamp=await new Promise(resolve=>win.requestAnimationFrame(resolve));
      if(previous&&i>3)intervals.push(stamp-previous);previous=stamp;
      const clientX=rect.left+rect.width*.5+Math.sin(i*.2)*100,clientY=rect.top+rect.height*.5+Math.cos(i*.2)*60;
      canvas.dispatchEvent(new win.PointerEvent('pointermove',{clientX,clientY,bubbles:true}));
      if($('#snap-feedback').textContent)snaps++;
      canvas.dispatchEvent(new win.WheelEvent('wheel',{clientX,clientY,deltaX:i<30?5:0,deltaY:i<30?2:Math.sin(i*.2)*8,ctrlKey:i>=30,bubbles:true,cancelable:true}));
    }
    await new Promise(resolve=>setTimeout(resolve,180));await pause();
    submit('0,0');const insertionStart=performance.now();submit('1000,0');const insertionMs=performance.now()-insertionStart;submit('');
    const insertionPaintMs=await new Promise(resolve=>win.requestAnimationFrame(()=>resolve(performance.now()-insertionStart)));
    if(!$('#entity-count').textContent.startsWith('100001 '))throw Error(`Nytt objekt: ${$('#entity-count').textContent}; ${$('#command-log').textContent}`);
    submit('UNDO');if(!$('#entity-count').textContent.startsWith('100000 '))throw Error('Ångra nytt objekt misslyckades');
    const confirmationMs={};
    const checkAndUndo=()=>{
      if(!$('#entity-count').textContent.startsWith('100001 '))throw Error('Nytt objekt saknas');
      submit('UNDO');if(!$('#entity-count').textContent.startsWith('100000 '))throw Error('Ångra nytt objekt misslyckades');
    };
    submit('CIRCLE');submit('0,0');let start=performance.now();submit('200');confirmationMs.circle=+(performance.now()-start).toFixed(2);checkAndUndo();
    submit('HATCH');submit('0,0');submit('1000,0');submit('1000,1000');start=performance.now();submit('');confirmationMs.hatch=+(performance.now()-start).toFixed(2);checkAndUndo();
    submit('TEXT');submit('0,0');$('#inline-text').value='Prestandaprov';start=performance.now();$('#text-apply').click();confirmationMs.text=+(performance.now()-start).toFixed(2);checkAndUndo();
    const selectAll=()=>canvas.dispatchEvent(new win.KeyboardEvent('keydown',{key:'a',ctrlKey:true,bubbles:true}));
    selectAll();submit('MOVE');submit('0,0');submit('1000,2000');
    await wait(()=>$('#save-state').textContent==='Autosparat lokalt');
    const moved=await store.read();
    if(moved.entities[0].points[0].x!==1000 || moved.entities[0].points[0].y!==2000)throw Error('Flytt sparade fel geometri');
    submit('UNDO');selectAll();submit('ROTATE');submit('0,0');submit('90');
    await wait(()=>$('#save-state').textContent==='Autosparat lokalt');
    const rotated=await store.read(),endpoint=rotated.entities[0].points[1];
    if(Math.abs(endpoint.x+200)>1e-8 || Math.abs(endpoint.y-300)>1e-8)throw Error('Rotation sparade fel geometri');
    submit('UNDO');
    // A large selection used to validate each ID by scanning the whole drawing.
    selectAll();
    if($('#selection-badge').textContent!=='100000')throw Error('Markera alla misslyckades');
    start=performance.now();submit('ERASE');const eraseAllMs=performance.now()-start;
    if(!$('#entity-count').textContent.startsWith('0 '))throw Error('Radera alla misslyckades');
    submit('UNDO');if(!$('#entity-count').textContent.startsWith('100000 '))throw Error('Ångra radering misslyckades');
    submit('REDO');if(!$('#entity-count').textContent.startsWith('0 '))throw Error('Gör om radering misslyckades');
    submit('UNDO');if(!$('#entity-count').textContent.startsWith('100000 '))throw Error('Ångra radering igen misslyckades');
    submit('UNDO');if($('#entity-count').textContent!==initial)throw Error('Ångra generering misslyckades');
    await wait(()=>$('#save-state').textContent==='Autosparat lokalt');
    intervals.sort((a,b)=>a-b);
    output.textContent=JSON.stringify({objects:100000,frames:60,snapFeedbackFrames:snaps,frameIntervalMedianMs:+intervals[Math.floor(intervals.length/2)].toFixed(2),frameIntervalP95Ms:+intervals[Math.floor(intervals.length*.95)].toFixed(2),insertionMs:+insertionMs.toFixed(2),insertionPaintMs:+insertionPaintMs.toFixed(2),confirmationMs,moveRotateSaved:true,eraseAllMs:+eraseAllMs.toFixed(2),eraseAllUndoRedo:true,newObject:true,undo:true,restored:initial},null,2);
  } catch(error){output.textContent=error.stack;}
  finally {
    const deadline=performance.now()+30000;
    while(iframe.contentDocument?.querySelector('#save-state')?.textContent.startsWith('Sparar…') && performance.now()<deadline)await new Promise(resolve=>setTimeout(resolve,50));
    iframe.remove();
    if(savedDraft===undefined)await store.clear();else await store.write(savedDraft,savedCheckpoint || undefined);
    await store.close();
    keys.forEach((key,i)=>saved[i]===null?localStorage.removeItem(key):localStorage.setItem(key,saved[i]));
    control.disabled=false;
  }
};
