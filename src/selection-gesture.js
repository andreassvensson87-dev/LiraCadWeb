import { dist } from './geometry.js';
export function beginSelectionGesture(pixel,world,shift=false) {
  return {kind:'select',start:{...pixel},world:{...world},shift,moved:false,phase:'pressed'};
}
export function moveSelectionGesture(gesture,pixel) {
  return {...gesture,moved:gesture.moved||dist(pixel,gesture.start)>4};
}
export function releaseSelectionGesture(gesture,pixel,world,hitId) {
  if(gesture.moved||dist(pixel,gesture.start)>4||gesture.phase==='finish')return {kind:'rectangle',shift:gesture.shift,crossing:pixel.x<gesture.start.x,region:{minX:Math.min(gesture.world.x,world.x),maxX:Math.max(gesture.world.x,world.x),minY:Math.min(gesture.world.y,world.y),maxY:Math.max(gesture.world.y,world.y)}};
  if(hitId)return {kind:'click',id:hitId,shift:gesture.shift};
  return {kind:'pending',gesture:{...gesture,phase:'corner'}};
}
