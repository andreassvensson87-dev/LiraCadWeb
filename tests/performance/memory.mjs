import {createLocalSnapIndex} from '../../src/local-snapping.js';
import {DocumentSession} from '../../src/document-session.js';
import {stressDocument} from '../../src/stress-document.js';
import {createSpatialIndex} from '../../src/spatial-index.js';
import {nearbySnaps} from '../../src/snapping.js';
import {bounds} from '../../src/entity-geometry.js';
if(!global.gc)throw Error('Kör minnesprovet med node --expose-gc tests/performance/memory.mjs.');
const samples=[];
async function sample(stage,snap=null){await new Promise(resolve=>setImmediate(resolve));global.gc();await new Promise(resolve=>setImmediate(resolve));global.gc();const m=process.memoryUsage();samples.push({stage,heapMiB:+(m.heapUsed/1048576).toFixed(1),rssMiB:+(m.rss/1048576).toFixed(1),...(snap?{cache:snap.cacheStats()}:{})});}
async function runAudit(){
await sample('baseline');
let generated=await stressDocument(100000,{yieldControl:()=>Promise.resolve()});await sample('generated document');
let session=new DocumentSession(generated);generated=null;await sample('owned document');
let scene=createSpatialIndex(session.document.entities,bounds);await sample('scene index');
let snap=createLocalSnapIndex(session.document.entities,{entityIndex:scene});await sample('snap indexes',snap);
let peak=0,totalCandidates=0;
for(let batch=0;batch<20;batch++){
 for(let i=0;i<1000;i++)totalCandidates+=nearbySnaps(snap,{x:79000+(i%100),y:79000},11).length;
 peak=Math.max(peak,process.memoryUsage().heapUsed/1048576);
}
await sample('after 20000 local snap queries',snap);
for(let i=0;i<2000;i++)totalCandidates+=nearbySnaps(snap,{x:79000+i%100,y:79000},11/.003).length;
await sample('after 2000 overview snap queries',snap);
for(let i=0;i<100;i++){
 const entities=[...session.document.entities];const e=entities[0];entities[0]={...e,points:e.points.map(p=>({x:p.x+10,y:p.y+20}))};
 session.replaceEntities('Move',entities);scene=scene.update(session.document.entities);snap.update(session.document.entities,scene);
 if([9,39,79,99].includes(i))await sample('after '+(i+1)+' small edits');
}
for(let i=0;i<100;i++){
 const entities=[...session.document.entities];const e=entities[0];entities[0]={...e,points:e.points.map(p=>({x:p.x+10,y:p.y+20}))};
 session.replaceEntities('Move',entities);scene=scene.update(session.document.entities);snap.update(session.document.entities,scene);
}
await sample('after 200 small edits (80 history entries)');
for(let i=0;i<80;i++){session.undo();scene=scene.update(session.document.entities);snap.update(session.document.entities,scene);}
await sample('after 80 undo');
session.history.past=[];session.history.future=[];await sample('history cleared');
session=null;scene=null;snap=null;await sample('document and indexes released');
return {objects:100000,totalCandidates,localSnapTransientPeakMiB:+peak.toFixed(1)};
}
const report=await runAudit();
await sample('after benchmark scope ended');
console.log(JSON.stringify({...report,samples},null,2));
