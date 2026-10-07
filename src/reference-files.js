import {clone} from './values.js';
import {loadReference, referenceRows, findReference} from './references.js';
export function referencePath(path) {
  const parts=[];
  for(const part of String(path).replace(/\\/g,'/').split('/')){
    if(!part || part==='.')continue;
    if(part==='..' && parts.length && parts.at(-1)!=='..')parts.pop();else parts.push(part);
  }
  return parts.join('/').toLocaleLowerCase('en-US');
}
const filePath=file=>file.webkitRelativePath || file.name;
export function matchReferenceFile(path,files,parentPath='') {
  const requested=referencePath(path),parent=referencePath(parentPath).split('/').slice(0,-1).join('/');
  const relative=referencePath(parent?`${parent}/${path}`:path);
  const exact=files.filter(f=>[requested,relative].includes(referencePath(filePath(f))));
  if(exact.length===1)return {file:exact[0]};
  if(exact.length>1)return {ambiguous:true};
  const suffix=files.filter(f=>referencePath(filePath(f)).endsWith(`/${relative}`) || referencePath(filePath(f)).endsWith(`/${requested}`));
  if(suffix.length===1)return {file:suffix[0]};
  if(suffix.length>1)return {ambiguous:true};
  const basename=requested.split('/').at(-1),matches=files.filter(f=>referencePath(f.name)===basename);
  return matches.length===1?{file:matches[0]}:matches.length>1?{ambiguous:true}:{};
}

// Build a complete draft before publishing it. A selected file is parsed once,
// even when multiple placements refer to it. No automatic filesystem access.
export async function resolveReferenceFiles(document,files,{readFile,linkNew=false,reloadAll=false,targetId=null,now=Date.now(),onProgress=()=>{}}={}) {
  const draft=clone(document),cache=new Map(),used=new Set(),messages=[];
  let loaded=0;
  const updated=new Set(),notFound=[],ambiguous=[];
  const selected=Array.from(files).filter(f=>/\.(dwg|dxf|liracad)$/i.test(f.name));
  if(!selected.length)throw Error('Välj DWG-, DXF- eller LiraCAD-filer.');
  function read(file){
    if(!cache.has(file))cache.set(file,Promise.resolve(readFile(file,{onProgress})).then(result=>{for(const issue of result.imported?.report || [])if(!/Extern referens .*sparades som länk/.test(issue.message))messages.push(`${file.name}: ${issue.message}`);return result.document;}));
    return cache.get(file);
  }
  async function source(file,ancestors=[],depth=0){
    const key=referencePath(filePath(file));
    if(ancestors.includes(key))return {problem:'cycle'};
    if(depth>=16)return {problem:'depth'};
    used.add(file);
    const doc=clone(await read(file));
    for(const {reference:r,parent,depth:treeDepth} of referenceRows(doc)){
      if(!findReference(doc,r.id))continue;
      const match=matchReferenceFile(r.path,selected,parent?.sourcePath || filePath(file));
      if(match.ambiguous){r.problem='ambiguous';if(reloadAll)ambiguous.push(r.path);messages.push(`Flera filer matchar ${r.path}; välj filen manuellt.`);continue;}
      if(!match.file)continue;
      const chain=[...ancestors,key];let ancestor=parent;
      while(ancestor){if(ancestor.sourcePath)chain.push(referencePath(filePath(matchReferenceFile(ancestor.sourcePath,selected).file || {name:ancestor.sourcePath})));ancestor=referenceRows(doc).find(row=>row.reference.id===ancestor.id)?.parent;}
      const child=await source(match.file,chain,depth+treeDepth+1);
      if(child.problem){r.problem=child.problem;r.geometry=[];r.children=[];r.sourceLoaded=false;messages.push(`${child.problem==='cycle'?'Cirkulär länk stoppad':'För djup referenskedja'}: ${[...ancestors,key,referencePath(filePath(match.file))].join(' → ')}`);continue;}
      loadReference(doc,child.document,match.file,r.id,now,{keepAmbiguousCache:reloadAll});loaded++;r.sourcePath=filePath(match.file);
    }
    return {document:doc};
  }
  async function apply(r,file){
    const ancestors=[];
    let row=r && referenceRows(draft).find(row=>row.reference.id===r.id);
    while(row?.parent){if(row.parent.sourcePath)ancestors.unshift(referencePath(filePath(matchReferenceFile(row.parent.sourcePath,selected).file || {name:row.parent.sourcePath})));row=referenceRows(draft).find(p=>p.reference.id===row.parent.id);}
    const result=await source(file,ancestors,ancestors.length);
    if(result.problem)throw Error('Referensen kunde inte läsas.');
    const accepted=loadReference(draft,result.document,file,r?.id,now,{keepAmbiguousCache:reloadAll});accepted.sourcePath=filePath(file);loaded++;
  }
  if(reloadAll){
    async function refresh(r,parentPath){
      if(r.problem==='cycle' || r.problem==='depth')return;
      if(updated.has(r.id)){for(const child of r.children || [])await refresh(child,r.sourcePath || parentPath);return;}
      const match=matchReferenceFile(r.path,selected,parentPath);
      if(match.ambiguous){ambiguous.push(r.path);messages.push(`Flera filer matchar ${r.path}; den sparade kopian behålls. Välj Byt fil.`);}
      else if(match.file){
        const wasLoaded=r.loaded;
        await apply(r,match.file);r.loaded=wasLoaded;
        for(const {reference:child} of referenceRows({references:[r]})){
          if(child.loadedAt===now && !child.problem && matchReferenceFile(child.sourcePath || child.path,selected).file)updated.add(child.id);
          else if(child.problem==='ambiguous')ambiguous.push(child.path);
        }
      }else notFound.push(r.path);
      for(const child of r.children || [])await refresh(child,r.sourcePath || parentPath);
    }
    for(const r of draft.references || [])await refresh(r,draft.sourcePath || '');
    loaded=updated.size;
    for(const {reference:r} of referenceRows(draft))if(updated.has(r.id))messages.push(`Uppdaterad: ${r.path}`);
    for(const path of new Set(notFound))messages.push(`Ingen vald fil matchar: ${path}. Den sparade kopian behålls.`);
  }
  else if(targetId){const r=findReference(draft,targetId);if(!r)throw Error('Referensen finns inte längre.');await apply(r,selected[0]);}
  else {
    for(const {reference:r,parent} of referenceRows(draft)){
      if((r.geometry.length || r.sourceLoaded) && !r.problem)continue;
      const match=matchReferenceFile(r.path,selected,parent?.sourcePath || draft.sourcePath || '');
      if(match.ambiguous){r.problem='ambiguous';messages.push(`Flera filer matchar ${r.path}; välj Byt fil för att lösa länken.`);}
      else if(match.file)await apply(r,match.file);
    }
    if(linkNew){
      const dependencies=new Set();
      for(const file of selected){
        const doc=await read(file);
        for(const {reference:r} of referenceRows(doc)){const match=matchReferenceFile(r.path,selected,filePath(file));if(match.file)dependencies.add(match.file);}
      }
      const hostFile=draft.sourcePath && matchReferenceFile(draft.sourcePath,selected).file;
      const roots=selected.filter(f=>f!==hostFile && !used.has(f) && !dependencies.has(f));
      if(!roots.length && !used.size){const first=selected.find(f=>f!==hostFile);if(first)roots.push(first);}
      for(const file of roots)await apply(null,file);
    }
  }
  return {document:draft,loaded,messages,notFound:[...new Set(notFound)],ambiguous:[...new Set(ambiguous)],missing:referenceRows(draft).filter(({reference:r})=>!r.geometry.length && !r.sourceLoaded || r.problem).length};
}
