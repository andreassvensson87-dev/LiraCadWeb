import { clone, uid } from './values.js';
import { blockParts, createBlock } from './blocks.js';
import { transform } from './entity-transform.js';
import { spaceOf } from './layout.js';

export function referenceRows(doc) {
  const rows=[];
  function visit(refs,parent=null,depth=0,blocked=false){
    for(const reference of refs || []){
      const excluded=blocked || !!parent && reference.kind==='overlay';
      rows.push({reference,parent,depth,excluded});
      visit(reference.children,reference,depth+1,excluded);
    }
  }
  visit(doc.references);return rows;
}
export const findReference=(doc,id)=>referenceRows(doc).find(row=>row.reference.id===id)?.reference;
export const referenceStatus=r=>r.problem==='cycle'?'Cirkulär':r.problem==='ambiguous'?'Tvetydig':r.problem==='depth'?'För djup':!r.geometry?.length && !(r.sourceLoaded && r.children?.length)?'Saknas':r.loaded===false?'Urladdad':'Laddad';
export function referenceEntities(doc, {nested=false,fade=true}={}) {
  function visit(r,depth,root,path,snap){
    if(depth>16 || r.problem || r.loaded===false || r.visible===false || doc.layers.find(l=>l.id===r.layer)?.visible===false || (depth>0 || nested) && r.kind==='overlay')return [];
    const c=Math.cos(r.rotation),s=Math.sin(r.rotation),k=r.scale,flip=r.mirrored?-1:1;
    const parts=[...r.geometry.map((e,i)=>({...e,id:`xref:${path}:${i}`})),...(r.children||[]).flatMap(child=>visit(child,depth+1,root,`${path}:${child.id}`,snap && r.snap!==false))];
    return parts.map(e=>({...transform(e,p=>({x:r.point.x+k*(p.x*c-flip*p.y*s),y:r.point.y+k*(p.x*s+flip*p.y*c)}),{scale:k,rotation:r.rotation,mirror:!!r.mirrored}),space:r.space||'model',_xrefId:root.id,_xrefSnap:snap && r.snap!==false && e._xrefSnap!==false,_xrefOpacity:fade?1-root.fade/100:1}));
  }
  return (doc.references||[]).flatMap(r=>visit(r,0,r,r.id,true));
}
// Cache geometry in host coordinates before the reference's own transform. Source
// layer names are the durable reload key, so host overrides survive a reload.
export function loadReference(draft, source, file, existingId = null, now = Date.now(), {keepAmbiguousCache=false}={}) {
  let r = findReference(draft,existingId);
  if (existingId && !r) throw Error('Referensen finns inte längre.');
  if (!r) {
    r={id:uid(),name:file.name,path:file.name,kind:'overlay',point:{x:0,y:0},rotation:0,scale:1,fade:60,snap:true,visible:true,loaded:true,geometry:[]};
    (draft.references ||= []).push(r);
  }
  const sourceLayers = new Map(source.layers.map(l => [l.id,l]));
  const previousLayers=new Set(referenceRows({references:[r]}).flatMap(({reference})=>reference.geometry.map(e=>e.layer)));
  const model = source.entities.filter(e => spaceOf(e)==='model' && e.type!=='viewport');
  const geometry = model.flatMap(e => e.type==='block'?blockParts(e):[e]);
  if (!geometry.length && !source.references?.length) throw Error('Filen saknar tillgänglig modellgeometri. Länka dess saknade referenser i källritningen först.');
  if (geometry.length > 200000) throw Error('Referensen innehåller för många objekt (max 200 000).');
  const map = new Map();
  function mapLayer(id) {
    const src=sourceLayers.get(id);
    if(!src)throw Error('Referensen har ett okänt lager.');
    if(!map.has(id)) {
      let layer=draft.layers.find(l=>l.referenceId===r.id && l.sourceLayer===src.name);
      if(!layer){const suffix=`${r.name.replace(/\.[^.]+$/,'')} | ${src.name}`,matches=draft.layers.filter(l=>previousLayers.has(l.id) && (l.sourceLayer===suffix || l.sourceLayer?.endsWith(` | ${suffix}`)));if(matches.length===1)layer=matches[0];}
      if(!layer) {
        layer={...clone(src),id:uid(),name:`${file.name.replace(/\.[^.]+$/,'')} | ${src.name}`,locked:true,referenceId:r.id,sourceLayer:src.name};
        draft.layers.push(layer);
      }
      map.set(id,layer.id);
    }
    return map.get(id);
  }
  function remap(e) {
    e.id=uid();e.layer=mapLayer(e.layer);
    for(const key of ['space','attributeTag','attributeSchema','inheritLayer','colorByBlock','lineTypeByBlock','_xrefId','_xrefSnap','_xrefOpacity'])delete e[key];
    e.dimensionGraphics?.forEach(remap);
    e.annotationVariants?.forEach(v=>remap(v.entity));
    return e;
  }
  const base=source.insertionBase || {x:0,y:0};
  r.geometry=geometry.map(e=>remap(transform(e,p=>({x:p.x-base.x,y:p.y-base.y}))));
  const previous=r.children || [];
  function copyChild(child,old,parentBase) {
    const n={...clone(child),id:old?.id || uid(),geometry:child.geometry.map(e=>remap(clone(e))),point:{x:child.point.x-parentBase.x,y:child.point.y-parentBase.y}};
    if(child.layer)n.layer=mapLayer(child.layer);
    if(old){n.visible=old.visible;n.snap=old.snap;if(old.loaded===false)n.loaded=false;}
    if(old && (!child.problem || keepAmbiguousCache && child.problem==='ambiguous') && !child.sourceLoaded && !child.geometry.length && (old.geometry.length || old.sourceLoaded)){
      n.geometry=clone(old.geometry);n.children=clone(old.children || []);n.sourceLoaded=old.sourceLoaded;n.sourcePath=old.sourcePath;n.loadedAt=old.loadedAt;
      if(child.problem==='ambiguous')delete n.problem;
      return n;
    }
    n.children=(child.children || []).map((part,i)=>copyChild(part,old?.children?.[i]?.path===part.path?old.children[i]:null,{x:0,y:0}));
    return n;
  }
  r.children=(source.references || []).filter(child=>spaceOf(child)==='model').map((child,i)=>copyChild(child,previous[i]?.path===child.path?previous[i]:null,base));
  r.sourceLoaded=true;delete r.problem;
  r.path=existingId && r.path.split(/[\\/]/).at(-1)===file.name?r.path:(file.webkitRelativePath || file.name); r.name=file.name; r.loaded=true; r.loadedAt=now;
  return r;
}
export function detachReference(draft,id) {
  const removed=draft.references?.find(r=>r.id===id),removedIds=new Set(removed?referenceRows({references:[removed]}).map(row=>row.reference.id):[]);
  draft.references=(draft.references || []).filter(r=>r.id!==id);
  const used=new Set([...draft.entities,...referenceRows(draft).flatMap(row=>row.reference.geometry)].map(e=>e.layer));
  // Keep any layer reused by host entities or block definitions.
  for(const def of draft.blocks || [])for(const e of def.entities)used.add(e.layer);
  for(const {reference:r} of referenceRows(draft))if(r.layer)used.add(r.layer);
  for(const e of draft.entities)if(e.definition)for(const p of e.definition.entities)used.add(p.layer);
  draft.layers=draft.layers.filter(l=>!removedIds.has(l.referenceId) || used.has(l.id));
}
export function bindReference(draft,id,layer) {
  const r=draft.references?.find(r=>r.id===id);
  if(!r)throw Error('Läs in referensfilen före bindning.');
  if(!draft.layers.some(l=>l.id===layer))throw Error('Välj ett ritlager först.');
  const geometry=referenceEntities({...draft,references:[{...r,point:{x:0,y:0},rotation:0,scale:1,mirrored:false,visible:true,loaded:true}]},{fade:false}).map(e=>{const n={...e,id:uid()};for(const key of ['_xrefId','_xrefSnap','_xrefOpacity'])delete n[key];return n;});
  if(!geometry.length)throw Error('Läs in referensfilen före bindning.');
  let name=r.name.replace(/\.[^.]+$/,'').replace(/[^\p{L}\p{N}_-]/gu,'_').slice(0,45)||'Referens';
  const used=new Set([...(draft.blocks||[]),...draft.entities.filter(e=>e.type==='block').map(e=>e.definition)].map(d=>d.name.toLowerCase()));
  // Existing block contract allows 10 000 parts per definition.
  for(let start=0;start<geometry.length;start+=10000){
    let label=name, i=1;while(used.has(label.toLowerCase()))label=`${name}_${i++}`;used.add(label.toLowerCase());
    const block=createBlock(geometry.slice(start,start+10000),label,{x:0,y:0},layer,r.space || 'model');
    block.point=clone(r.point);block.scale=r.scale;block.rotation=r.rotation;block.mirrored=!!r.mirrored;
    draft.entities.push(block);(draft.blocks ||= []).push(block.definition);
  }
  const boundIds=new Set(referenceRows({references:[r]}).map(row=>row.reference.id));
  for(const l of draft.layers.filter(l=>boundIds.has(l.referenceId))){delete l.referenceId;delete l.sourceLayer;l.locked=false;}
  detachReference(draft,id);
}
