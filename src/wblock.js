import { transform } from './entity-transform.js';
import { sub } from './geometry.js';
import { blockTemplates } from './blocks.js';
import { validDocument } from './document.js';
import { toDXF } from './dxf-export.js';

export function wblockFileName(value) {
  const name=String(value??'').trim().replace(/\.dxf$/i,'');
  return /^[\p{L}\p{N}_. -]{1,120}$/u.test(name)&&!/[. ]$/.test(name)&&!/^\.+$/.test(name)&&!/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(name)?name:null;
}
// Extract an independent model-space drawing. Definitions stay local; only
// top-level insertion/geometry coordinates move to the chosen origin.
export function wblockDocument(source,{name,entityIds,definitionId,base={x:0,y:0}}) {
  name=wblockFileName(name);
  if(!name)throw Error('Ange ett filnamn utan sökväg eller specialtecken.');
  if(!Number.isFinite(base.x)||!Number.isFinite(base.y))throw Error('Ange en giltig baspunkt.');
  let entities;
  if(definitionId){
    const definition=blockTemplates(source).find(b=>b.definition.id===definitionId)?.definition;
    if(!definition)throw Error('Blockdefinitionen finns inte längre.');
    entities=definition.entities;
    base={x:0,y:0};
  }else{
    if(!Array.isArray(entityIds)||!entityIds.length||new Set(entityIds).size!==entityIds.length)throw Error('Välj objekt att exportera.');
    const byId=new Map(source.entities.map(e=>[e.id,e]));
    entities=entityIds.map(id=>byId.get(id));
    if(entities.some(e=>!e))throw Error('Ett valt objekt finns inte längre. Välj objekten igen.');
  }
  if(!entities.length)throw Error('Mallen innehåller inga objekt.');
  if(entities.some(e=>e.type==='viewport'))throw Error('Viewport-ramar kan inte ingå i WBLOCK. Välj ritobjekten i modellen.');
  const exported=entities.map(e=>({...transform(e,p=>sub(p,base)),space:'model'}));
  const usedLayers=new Set();
  const visit=e=>{usedLayers.add(e.layer);for(const part of e.definition?.entities||[])visit(part);for(const part of Object.values(e.attributeOverrides||{}))visit(part);for(const part of e.dimensionGraphics||[])visit(part);for(const v of e.annotationVariants||[])visit(v.entity);};
  exported.forEach(visit);
  // Layer 0 is the insertion-layer fallback in CAD block definitions.
  const layers=structuredClone(source.layers.filter(l=>usedLayers.has(l.id)||l.name==='0'));
  const result={version:1,name,layers,entities:exported};
  if(!validDocument(result))throw Error('Mallen kunde inte exporteras som en giltig ritning.');
  return result;
}
export function wblockDXF(source,request) {
  const document=wblockDocument(source,request);
  return {name:document.name+'.dxf',text:toDXF(document),type:'application/dxf',count:document.entities.length};
}
