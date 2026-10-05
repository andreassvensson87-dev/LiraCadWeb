import {DocumentSession} from '../../src/document-session.js';
import {stressDocument} from '../../src/stress-document.js';
import {createSpatialIndex} from '../../src/spatial-index.js';
import {nearbySnaps} from '../../src/snapping.js';
import {createLocalSnapIndex} from '../../src/local-snapping.js';
import {bounds} from '../../src/entity-geometry.js';
import {applyTransformChange} from '../../src/transform-tools.js';
import {transformed} from '../../src/entity-transform.js';
import {applyEditingChange} from '../../src/editing-tools.js';
import {IndexedDBProjectStore} from '../../src/indexeddb-project-store.js';
const button=document.querySelector('#edit-run'),output=document.querySelector('#edit-result');
button.onclick=async()=>{
  button.disabled=true;output.textContent='Mäter redigering, historik och sparning…';
  const name='liracad-edit-test-'+crypto.randomUUID(),store=new IndexedDBProjectStore(undefined,{name});
  try {
    const session=new DocumentSession(await stressDocument(100000));
    let scene=createSpatialIndex(session.document.entities,bounds),snap=createLocalSnapIndex(session.document.entities,{entityIndex:scene});
    const initial=JSON.stringify(session.document),times={};
    const check=(condition,message)=>{if(!condition)throw Error(message);};
    const measure=(name,action)=>{
      const start=performance.now();action();const transaction=performance.now()-start,indexStart=performance.now();
      scene=scene.update(session.document.entities);snap.update(session.document.entities,scene);
      times[name]={transactionMs:+transaction.toFixed(1),indexMs:+(performance.now()-indexStart).toFixed(1)};
    };
    const change=(operation,target,value)=>{
      const entity=session.document.entities[0];
      const change={operation,entities:[transformed(entity,operation,{x:0,y:0},target,value)]};
      session.replaceEntities(operation,applyTransformChange(session.document.entities,change).entities);
    };
    measure('move',()=>change('MOVE',{x:1000,y:2000}));
    check(JSON.stringify(session.document.entities[0].points)==='[{"x":1000,"y":2000},{"x":1300,"y":2200}]','Flytt gav fel geometri');
    measure('rotate',()=>change('ROTATE',{x:0,y:0},Math.PI/2));
    const rotated=JSON.stringify(session.document),entity=session.document.entities[0],point=entity.points[0];
    check(Math.abs(point.x+2000)<1e-8 && Math.abs(point.y-1000)<1e-8,'Rotation gav fel geometri');
    check(scene.query(bounds(entity),true).includes(entity),'Flyttat objekt saknas i index');
    check(nearbySnaps(snap,point,.01).some(s=>s.id===entity.id),'Flyttat objekt saknas i snap');
    measure('delete',()=>session.replaceEntities('Radera',applyEditingChange(session.document.entities,{replaceIds:[entity.id],entities:[]})));
    check(session.document.entities.length===99999,'Radering misslyckades');
    check(!nearbySnaps(snap,point,.01).some(s=>s.id===entity.id),'Raderat objekt ligger kvar i snap');
    measure('undo',()=>session.undo());check(JSON.stringify(session.document)===rotated,'Ångra radering gav fel dokument');
    measure('redo',()=>session.redo());check(session.document.entities.length===99999,'Gör om radering misslyckades');
    measure('undoDelete',()=>session.undo());measure('undoRotate',()=>session.undo());measure('undoMove',()=>session.undo());
    check(JSON.stringify(session.document)===initial,'Ångra hela kedjan gav fel dokument');
    session.redo();session.redo();
    const expected=JSON.stringify(session.document),saveStart=performance.now();await store.write(session.document);
    const saveMs=performance.now()-saveStart;await store.close();
    check(JSON.stringify(await store.read())===expected,'Sparning/återöppning tappade ändringar');
    const labels={move:'Flytt',rotate:'Rotation',delete:'Radering',undo:'Ångra',redo:'Gör om',undoDelete:'Ångra radering',undoRotate:'Ångra rotation',undoMove:'Ångra flytt'};
    output.textContent=['100 000 objekt · tid i ms','Åtgärd              Dokument    Index    Totalt',
      ...Object.entries(times).map(([name,time])=>labels[name].padEnd(20)+String(time.transactionMs).padStart(8)+String(time.indexMs).padStart(9)+String(+(time.transactionMs+time.indexMs).toFixed(1)).padStart(10)),
      '', 'Godkänt: geometri, snap, Ångra/Gör om och sparning/återöppning.',`Sparning till IndexedDB: ${saveMs.toFixed(1)} ms.`].join('\n');
  }catch(error){output.textContent=error.stack;}
  finally {
    await store.close();await new Promise((resolve,reject)=>{const request=indexedDB.deleteDatabase(name);request.onsuccess=resolve;request.onerror=()=>reject(request.error);});
    button.disabled=false;
  }
};
