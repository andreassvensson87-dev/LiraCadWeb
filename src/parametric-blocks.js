import { stretchEntity, stretchTarget } from './stretch.js';
import { add, sub, mul, dist } from './geometry.js';
const point=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y);
export const validParameterName = s => typeof s==='string' && /^[\p{L}\p{N}_ -]{1,64}$/u.test(s) && s.trim()===s && !!s.trim();
export function validStretchParameters(parameters,entities) {
  if(parameters==null)return true;
  if(!Array.isArray(parameters)||parameters.length>20)return false;
  const ids=new Set(),names=new Set(),parts=new Map(entities.map(e=>[e.id,e]));
  return parameters.every(p=>{
    if(!p||typeof p.id!=='string'||ids.has(p.id)||!validParameterName(p.name)||names.has(p.name.toLowerCase())||!point(p.start)||!point(p.end)||dist(p.start,p.end)<0.01||!p.window||!['minX','minY','maxX','maxY'].every(k=>Number.isFinite(p.window[k]))||p.window.minX>=p.window.maxX||p.window.minY>=p.window.maxY||!Array.isArray(p.targets)||!p.targets.length||p.targets.length>10000)return false;
    if(!validParameterLimits(p))return false;
    ids.add(p.id);names.add(p.name.toLowerCase());const targetIds=new Set();
    return p.targets.every(t=>{
      const e=parts.get(t.entityId);if(!e||e.type==='viewport'||targetIds.has(t.entityId))return false;targetIds.add(t.entityId);
      if(t.mode==='move')return true;
      const valid=(list,n)=>Array.isArray(list)&&new Set(list).size===list.length&&list.every(i=>Number.isInteger(i)&&i>=0&&i<n);
      if(t.mode==='arc')return e.type==='arc'&&valid(t.indices,2)&&t.indices.length>0;
      return t.mode==='points'&&Array.isArray(e.points)&&valid(t.indices,e.points.length)&&Array.isArray(t.holes)&&t.holes.length===(e.holes||[]).length&&t.holes.every((indices,h)=>valid(indices,e.holes[h].length))&&(t.indices.length>0||t.holes.some(l=>l.length));
    });
  });
}
export function validParameterValues(values,parameters=[]) {
  return values==null || typeof values==='object'&&!Array.isArray(values)&&Object.entries(values).every(([id,v])=>{const p=parameters.find(p=>p.id===id);return p&&Number.isFinite(v)&&Math.abs(v-constrainedParameterValue(p,v))<=1e-7;});
}
export function validParameterLimits(p) {
  const length=dist(p.start,p.end),min=p.minLength??0.01,max=p.maxLength??1e9,step=p.step??0;
  return Number.isFinite(length)&&length>=min&&length<=max&&Number.isFinite(min)&&min>=0.01&&Number.isFinite(max)&&max<=1e9&&min<=max&&Number.isFinite(step)&&step>=0&&step<=1e9;
}
// Steps are anchored at the definition's length, so its original geometry is always allowed.
export function constrainedParameterValue(p,value) {
  const min=p.minLength??0.01,max=p.maxLength??1e9,step=p.step??0,base=dist(p.start,p.end);
  if(!Number.isFinite(value))throw Error('Ange en ändlig blocklängd.');
  if(!step)return Math.max(min,Math.min(max,value));
  const first=Math.ceil((min-base)/step-1e-10),last=Math.floor((max-base)/step+1e-10);
  return base+Math.max(first,Math.min(last,Math.round((value-base)/step)))*step;
}
export function updateStretchParameter(parameters,id,patch,entities) {
  const result=structuredClone(parameters),p=result.find(p=>p.id===id);
  if(!p)throw Error('Stretchparametern finns inte längre.');
  Object.assign(p,structuredClone(patch));
  if(patch.window)p.targets=entities.map(e=>stretchTarget(e,p.window)).filter(Boolean);
  if(!validStretchParameters(result,entities))throw Error('Kontrollera namn, axel och sträckruta. Grundlängden måste ligga mellan minsta och största längd; steg är 0 för fri längd.');
  return result;
}
export const parameterValue=(block,p)=>block.parameterValues?.[p.id]??dist(p.start,p.end);
export function evaluatedBlockEntities(block) {
  let parts=block.definition.entities.map(p=>block.attributeOverrides?.[p.attributeTag]||p);
  for(const p of block.definition.stretchParameters||[]){
    const length=dist(p.start,p.end),delta=mul(sub(p.end,p.start),(parameterValue(block,p)-length)/length),targets=new Map(p.targets.map(t=>[t.entityId,t]));
    if(Math.abs(parameterValue(block,p)-length)<1e-8)continue;
    parts=parts.map(e=>targets.has(e.id)?stretchEntity(e,targets.get(e.id),delta):e);
  }
  return parts;
}
export function withParameterValue(block,id,value) {
  const p=block.definition.stretchParameters?.find(p=>p.id===id);
  if(!p)throw Error('Stretchparametern finns inte längre.');
  if(value<0.01||value>1e9)throw Error('Blocklängden måste vara 0,01–1 000 000 000 mm.');
  const result={...block,parameterValues:{...block.parameterValues,[id]:constrainedParameterValue(p,value)}};
  if(!validParameterValues(result.parameterValues,block.definition.stretchParameters))throw Error('Blocklängden måste vara 0,01–1 000 000 000 mm.');
  evaluatedBlockEntities(result);return result;
}
export function blockLocalPoint(block,world) {
  const r=block.rotation||0,k=block.scale||1,flip=block.mirrored?-1:1,p=sub(world,block.point);
  return {x:(Math.cos(r)*p.x+Math.sin(r)*p.y)/k,y:flip*(-Math.sin(r)*p.x+Math.cos(r)*p.y)/k};
}
export function blockWorldPoint(block,p) {
  const r=block.rotation||0,k=block.scale||1,flip=block.mirrored?-1:1;
  return add(block.point,{x:k*(p.x*Math.cos(r)-flip*p.y*Math.sin(r)),y:k*(p.x*Math.sin(r)+flip*p.y*Math.cos(r))});
}
export function parameterGrips(block) {
  return (block.definition.stretchParameters||[]).map(p=>({kind:'blockStretch',parameterId:p.id,p:blockWorldPoint(block,add(p.start,mul(sub(p.end,p.start),parameterValue(block,p)/dist(p.start,p.end))))}));
}
export function moveParameterGrip(block,id,world) {
  const p=block.definition.stretchParameters.find(p=>p.id===id),local=blockLocalPoint(block,world),axis=mul(sub(p.end,p.start),1/dist(p.start,p.end)),v=sub(local,p.start);
  return withParameterValue(block,id,Math.max(0.01,v.x*axis.x+v.y*axis.y));
}
export function shiftParameters(parameters,base) {
  return (parameters||[]).map(p=>({...structuredClone(p),start:sub(p.start,base),end:sub(p.end,base),window:{minX:p.window.minX-base.x,maxX:p.window.maxX-base.x,minY:p.window.minY-base.y,maxY:p.window.maxY-base.y}}));
}

export function parameterOffset(block,id) {
  return (block.definition.stretchParameters||[]).reduce((offset,p)=>p.targets.some(t=>t.entityId===id&&t.mode==='move')?add(offset,mul(sub(p.end,p.start),(parameterValue(block,p)-dist(p.start,p.end))/dist(p.start,p.end))):offset,{x:0,y:0});
}
