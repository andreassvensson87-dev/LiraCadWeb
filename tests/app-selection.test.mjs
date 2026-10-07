import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DocumentSession } from '../src/document-session.js';
import { createSpatialIndex } from '../src/spatial-index.js';
import { createLocalSnapIndex } from '../src/local-snapping.js';
import { bounds, rectSelect, hitDistance } from '../src/entity-geometry.js';
import { referenceEntities } from '../src/references.js';
import { grips } from '../src/grips.js';

// Exercise the app's actual mutation and interaction functions without its DOM.
const source = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
const section = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
function app(initial) {
  const documentSession = new DocumentSession(initial || {version:1,name:'Selection',layers:[{id:'0',name:'0',color:'#ffffff'}],entities:[]});
  return new Function('documentSession', 'createSpatialIndex', 'createLocalSnapIndex', 'bounds', 'hitDistance', 'referenceEntities', `
    let doc=documentSession.document, sceneIndex, snapCache, indexedDocument, indexedSpace,
      interactionEntities, interactionViewport, activeViewportId=null, editableIds=new Set(), dirty=false;
    const selection=new Set(), camera={scale:1}, blockEditor=null;
    const drawingSpace=()=> 'model', viewEntity=e=>e, currentViewport=()=>null;
    const visible=e=>!e.hidden && e.space!=='paper' && doc.layers.find(l=>l.id===e.layer)?.visible!==false;
    const editable=e=>!e._xrefId && visible(e) && !doc.layers.find(l=>l.id===e.layer)?.locked;
    const projectStorage={recordAddition(){}}, persisted=()=>{}, log=()=>{}, update=()=>rebuild();
    ${section('function rebuild() {', 'function persisted() {')}
    ${section('function selectedEntities() {', 'function applyObjectChange(change) {')}
    ${section('function hit(p) {', 'const trackState =')}
    rebuild();
    return {addEntities,hit,selectedEntities,selection,
      snapIndex:()=>snapCache,entities:()=>interactionEntities,document:()=>doc,index:()=>sceneIndex,
      undo(){doc=documentSession.undo();update();},redo(){doc=documentSession.redo();update();}};
  `)(documentSession, createSpatialIndex, createLocalSnapIndex, bounds, hitDistance, referenceEntities);
}

test('new lines are rectangle-selectable and expose click selection, properties and grips before reload', () => {
  const editor=app(), region={minX:-1,maxX:21,minY:-1,maxY:11};
  for (let i=0;i<2;i++) {
    const entity={id:`line-${i}`,type:'line',layer:'0',points:[{x:0,y:i*10},{x:20,y:i*10}]};
    editor.addEntities([entity],'Line');
    assert.equal(editor.hit({x:10,y:i*10})?.id,entity.id);
    assert.equal(editor.entities().filter(e=>rectSelect(e,region,false)).length,i+1);
    editor.selection.add(entity.id);
    assert.equal(editor.selectedEntities().length,i+1);
    assert.equal(grips(editor.selectedEntities().at(-1)).length,2);
    assert.deepEqual(editor.index().query(region,true),editor.entities());
  }
  editor.undo();
  assert.equal(editor.entities().length,1);
  editor.redo();
  assert.equal(editor.entities().length,2);
  editor.addEntities([{id:'third',type:'line',layer:'0',points:[{x:0,y:5},{x:20,y:5}]}],'Line');
  assert.equal(editor.entities().filter(e=>rectSelect(e,region,true)).length,3);
  assert.deepEqual(editor.entities(),editor.document().entities);
});

 test('references participate in snapping and fit geometry but cannot be picked or edited',()=>{
  const line={id:'source',type:'line',layer:'0',points:[{x:0,y:0},{x:20,y:0}]};
  const ref={id:'ref',name:'Plan.dwg',path:'Plan.dwg',kind:'overlay',point:{x:100,y:200},rotation:0,scale:1,fade:60,geometry:[line]};
  const editor=app({version:1,layers:[{id:'0',name:'0',color:'#ffffff'}],entities:[],references:[ref]});
  assert.equal(editor.entities().length,1);assert.equal(editor.hit({x:110,y:200}),null);
  assert.ok(editor.snapIndex().nearby({x:100,y:200},1).length);
  editor.selection.add(editor.entities()[0].id);assert.equal(editor.selectedEntities().length,0);
  const disabled=app({version:1,layers:[{id:'0',name:'0',color:'#ffffff'}],entities:[],references:[{...ref,snap:false}]});
  assert.equal(disabled.snapIndex().nearby({x:100,y:200},1).length,0);
  disabled.addEntities([{...line,id:'host'}],'Line');assert.equal(disabled.entities().length,2);
});
