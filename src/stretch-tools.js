import { stretchWindow, stretchTarget, stretchEntity } from './stretch.js';
import { validParameterName } from './parametric-blocks.js';
import { parsePoint, sub, dist } from './geometry.js';
import { uid } from './values.js';
function prompt(s){
 if(s.phase==='parameterName')return 'Ange längdparameterns namn, t.ex. Bredd';
 if(s.phase==='axis')return s.points.length?'Ange längdparameterns slutpunkt':'Ange längdparameterns fasta startpunkt';
 if(s.phase==='window')return s.points.length?'Ange sträckrutans motsatta hörn':'Dra eller ange två hörn för sträckrutan';
 return s.points.length?'Ange målpunkt · relativt t.ex. @200,0':'Ange sträckningens baspunkt';
}
export const stretchTools=Object.fromEntries(['STRETCH','BSTRETCH'].map(name=>[name,{
 create:(ctx={})=>{
  const p=name==='BSTRETCH'&&ctx.stretchParameters?.find(p=>p.id===ctx.parameterEdit?.id);
  return p?{name,points:[],phase:ctx.parameterEdit.part,editing:p,parameterName:p.name,axis:[p.start,p.end]}:{name,points:[],phase:name==='BSTRETCH'?'parameterName':'window'};
 },
 handle(s,event,ctx){
  try{
   if(name==='BSTRETCH'&&!ctx.isBlockEditor)throw Error('Öppna BEDIT först för att skapa blockets längdparameter.');
   if(s.phase==='parameterName'){
    const text=event.text?.trim();if(!validParameterName(text)||(ctx.stretchParameters||[]).some(p=>p.name.toLowerCase()===text.toLowerCase()))return {state:s,message:'Ange ett unikt parameternamn (max 64 tecken).'};
    return {state:{...s,parameterName:text,phase:'axis',points:[]}};
   }
   const p=event.type==='point'?event.point:parsePoint(event.text,s.points.at(-1),event.cursor);
   if(!p)return {state:s,message:'Ange en punkt, t.ex. 100,200 eller @200,0.'};
   if(!s.points.length)return {state:{...s,points:[p]}};
   if(s.phase==='axis'){
    if(dist(s.points[0],p)<0.01)throw Error('Längdparametern behöver två olika punkter.');
    if(s.editing)return {state:null,change:{kind:'blockParameter',label:'Ändra längdaxel',parameter:{...s.editing,start:s.points[0],end:p}}};
    return {state:{...s,axis:[s.points[0],p],phase:'window',points:[]}};
   }
   if(s.phase==='window'){
    const window=stretchWindow(s.points[0],p);if(window.minX===window.maxX||window.minY===window.maxY)throw Error('Sträckrutan behöver bredd och höjd.');
    const entities=ctx.editableEntities||[],targets=entities.map(e=>stretchTarget(e,window)).filter(Boolean);
    if(!targets.length)throw Error('Inga ändpunkter eller flyttbara objekt i sträckrutan.');
    if(name==='BSTRETCH')return {state:null,change:{kind:'blockParameter',label:s.editing?'Ändra sträckruta':'Skapa stretchparameter',parameter:{...s.editing,id:s.editing?.id||uid(),name:s.parameterName,start:s.axis[0],end:s.axis[1],window,targets}},message:'Stretchparametern sparad i utkastet. Spara blocket och ändra längden med greppet eller Egenskaper.'};
    const selected=entities.filter(e=>targets.some(t=>t.entityId===e.id));
    return {state:{...s,phase:'displacement',points:[],targets,sources:structuredClone(selected)},selection:selected.map(e=>e.id)};
   }
   const delta=sub(p,s.points[0]);
   for(const source of s.sources)if(JSON.stringify((ctx.editableEntities||[]).find(e=>e.id===source.id))!==JSON.stringify(source))throw Error('Objektet ändrades. Avbryt och välj sträckrutan igen.');
   return {state:null,change:{operation:'STRETCH',label:'Sträck',entities:s.sources.map(e=>stretchEntity(e,s.targets.find(t=>t.entityId===e.id),delta))},message:`Sträck · ${s.sources.length} objekt.`};
  }catch(e){return {state:s,message:e.message};}
 },
 preview(s,cursor){
  if(s.phase==='axis'&&s.points.length)return [{type:'line',points:[s.points[0],cursor]}];
  if(s.phase==='window'&&s.points.length){const a=s.points[0],b=cursor;return [{type:'polyline',points:[a,{x:b.x,y:a.y},b,{x:a.x,y:b.y}],closed:true,lineType:'DASHED'}];}
  if(s.phase==='displacement'&&s.points.length)try{return s.sources.map(e=>stretchEntity(e,s.targets.find(t=>t.entityId===e.id),sub(cursor,s.points[0])));}catch{return [];}
  return [];
 },
 describe:s=>({prompt:prompt(s),properties:['layer','color','lineType']}),
}]));
