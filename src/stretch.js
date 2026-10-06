import { add, polar, dist, arcThrough, onArc } from './geometry.js';
import { transform } from './entity-transform.js';
export const stretchWindow = (a,b) => ({minX:Math.min(a.x,b.x),maxX:Math.max(a.x,b.x),minY:Math.min(a.y,b.y),maxY:Math.max(a.y,b.y)});
export const inStretchWindow = (p,r) => p.x>=r.minX-1e-8 && p.x<=r.maxX+1e-8 && p.y>=r.minY-1e-8 && p.y<=r.maxY+1e-8;
export function stretchTarget(e,r) {
  if(e.type==='viewport')return null;
  if(e.point)return inStretchWindow(e.point,r)?{entityId:e.id,mode:'move'}:null;
  if(e.type==='circle')return [{x:e.center.x-e.radius,y:e.center.y-e.radius},{x:e.center.x+e.radius,y:e.center.y+e.radius}].every(p=>inStretchWindow(p,r))?{entityId:e.id,mode:'move'}:null;
  if(e.type==='arc'){
    const ends=[polar(e.center,e.radius,e.start),polar(e.center,e.radius,e.start+e.sweep)];
    const all=[...ends,...[0,1,2,3].filter(i=>onArc(e,i*Math.PI/2)).map(i=>polar(e.center,e.radius,i*Math.PI/2))];
    if(all.every(p=>inStretchWindow(p,r)))return {entityId:e.id,mode:'move'};
    const indices=ends.flatMap((p,i)=>inStretchWindow(p,r)?[i]:[]);
    return indices.length?{entityId:e.id,mode:'arc',indices}:null;
  }
  if(!e.points)return null;
  const indices=e.points.flatMap((p,i)=>inStretchWindow(p,r)?[i]:[]);
  const holes=(e.holes||[]).map(loop=>loop.flatMap((p,i)=>inStretchWindow(p,r)?[i]:[]));
  if(!indices.length&&!holes.some(l=>l.length))return null;
  if(indices.length===e.points.length&&holes.every((l,i)=>l.length===e.holes[i].length))return {entityId:e.id,mode:'move'};
  return {entityId:e.id,mode:'points',indices,holes};
}
export function stretchEntity(e,target,delta) {
  if(target.mode==='move')return transform(e,p=>add(p,delta));
  const n=structuredClone(e);
  if(target.mode==='arc'){
    const points=[0,0.5,1].map(t=>polar(e.center,e.radius,e.start+t*e.sweep));
    target.indices.forEach(i=>{points[i*2]=add(points[i*2],delta);});
    const arc=arcThrough(...points);if(!arc)throw Error('Sträckningen skulle ge en rak eller ogiltig båge.');
    Object.assign(n,arc);
  }else{
    target.indices.forEach(i=>{n.points[i]=add(n.points[i],delta);});
    target.holes?.forEach((indices,h)=>indices.forEach(i=>{n.holes[h][i]=add(n.holes[h][i],delta);}));
    if(n.type==='line'&&dist(...n.points)<1e-8)throw Error('Sträckningen skulle ge en linje utan längd.');
    delete n.dimensionGraphics;delete n.dimensionGraphicsState;
  }
  if(e.annotationVariants)n.annotationVariants=e.annotationVariants.map(v=>({...v,entity:stretchEntity(v.entity,target,delta)}));
  return n;
}
