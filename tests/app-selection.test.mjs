import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DocumentSession } from '../src/document-session.js';
import { createSpatialIndex } from '../src/spatial-index.js';
import { createLocalSnapIndex } from '../src/local-snapping.js';
import { bounds, rectSelect, hitDistance } from '../src/entity-geometry.js';
import { grips } from '../src/grips.js';

// Exercise the app's actual mutation and interaction functions without its DOM.
const source = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
const section = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
function app() {
  const documentSession = new DocumentSession({version:1,name:'Selection',layers:[{id:'0',name:'0',color:'#ffffff'}],entities:[]});
  return new Function('documentSession', 'createSpatialIndex', 'createLocalSnapIndex', 'bounds', 'hitDistance', `
    let doc=documentSession.document, sceneIndex, snapCache, indexedDocument, indexedSpace,
      interactionEntities, interactionViewport, activeViewportId=null, editableIds=new Set(), dirty=false;
    const selection=new Set(), camera={scale:1}, blockEditor=null;
    const drawingSpace=()=> 'model', viewEntity=e=>e, currentViewport=()=>null;
    const visible=e=>!e.hidden && e.space!=='paper' && doc.layers.find(l=>l.id===e.layer)?.visible!==false;
    const editable=e=>visible(e) && !doc.layers.find(l=>l.id===e.layer)?.locked;
    const projectStorage={recordAddition(){}}, persisted=()=>{}, log=()=>{}, update=()=>rebuild();
    ${section('function rebuild() {', 'function persisted() {')}
    ${section('function selectedEntities() {', 'function applyObjectChange(change) {')}
    ${section('function hit(p) {', 'const trackState =')}
    rebuild();
    return {addEntities,hit,selectedEntities,selection,
      entities:()=>interactionEntities,document:()=>doc,index:()=>sceneIndex,
      undo(){doc=documentSession.undo();update();},redo(){doc=documentSession.redo();update();}};
  `)(documentSession, createSpatialIndex, createLocalSnapIndex, bounds, hitDistance);
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
