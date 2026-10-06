import { parsePoint } from './geometry.js';
import { wblockFileName } from './wblock.js';
function exportChange(s,base){return {state:null,change:{kind:'wblock',name:s.fileName,definitionId:s.definitionId,entityIds:s.entityIds,base},message:'WBLOCK · mallen exporterad som DXF.'};}
const prompt=s=>s.phase==='source'?'WBLOCK · O = markerade objekt (Enter) · B = blockdefinition':s.phase==='select'?'Välj objekt till mallen och tryck Enter':s.phase==='blockName'?'Ange blocknamn · '+s.blockNames.join(', '):s.phase==='fileName'?`Mallens filnamn · Enter = ${s.defaultName}.dxf`:'Välj mallens baspunkt eller ange koordinater · Enter = 0,0';
export const wblockTools={WBLOCK:{
 create:(ctx={})=>({name:'WBLOCK',phase:'source',points:[],blockNames:(ctx.templates||[]).map(b=>b.definition.name)}),
 handle(s,event,ctx){
  if(event.type==='point')return s.phase==='base'?exportChange(s,event.point):{state:s};
  if(event.type!=='text')return {state:s};
  const text=event.text.trim();
  if(s.phase==='select'&&text)return {state:s,message:'Välj objekt i ritytan och tryck Enter.'};
  if(s.phase==='source'){
    if(['B','BLOCK'].includes(text.toUpperCase()))return {state:{...s,phase:'blockName'}};
    if(!['','O','OBJEKT'].includes(text.toUpperCase()))return {state:s,message:'Välj O för markerade objekt eller B för en blockdefinition.'};
    s={...s,phase:'select'};
  }
  if(s.phase==='select'){
    const entities=ctx.entities||[];
    if(!entities.length)return {state:s,message:'Välj objekt i ritytan och tryck Enter.'};
    if(entities.some(e=>e.type==='viewport'))return {state:s,message:'Välj ritobjekt utan viewport-ramar.'};
    return {state:{...s,phase:'fileName',entityIds:entities.map(e=>e.id),defaultName:entities.length===1&&entities[0].type==='block'?wblockFileName(entities[0].definition.name)||'Mall':'Mall'}};
  }
  if(s.phase==='blockName'){
    const definition=(ctx.templates||[]).find(b=>b.definition.name.toLowerCase()===text.toLowerCase())?.definition;
    return definition?{state:{...s,phase:'fileName',definitionId:definition.id,defaultName:wblockFileName(definition.name)||'Mall'}}:{state:s,message:'Blocknamnet finns inte i ritningen.'};
  }
  if(s.phase==='fileName'){
    const fileName=wblockFileName(text||s.defaultName);
    if(!fileName)return {state:s,message:'Ange ett filnamn utan sökväg eller specialtecken.'};
    const next={...s,fileName,phase:'base'};
    return s.definitionId?exportChange(next,{x:0,y:0}):{state:next};
  }
  const base=text?parsePoint(text,null,event.cursor):{x:0,y:0};
  return base?exportChange(s,base):{state:s,message:'Ange en baspunkt, t.ex. 100,200.'};
 },
 preview:()=>[],
 describe:s=>({prompt:prompt(s),properties:[]}),
}};
