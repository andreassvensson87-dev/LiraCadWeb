import { polar } from './geometry.js';
export function parameterDisplay(parameter,entities) {
  const r=parameter.window,parts=new Map(entities.map(e=>[e.id,e]));
  const markers=parameter.targets.flatMap(t=>{
    const e=parts.get(t.entityId);if(!e)return [];
    const mode=t.mode==='move'?'move':'stretch';
    let points;
    if(t.mode==='arc')points=t.indices.map(i=>polar(e.center,e.radius,e.start+i*e.sweep));
    else if(t.mode==='points')points=[...t.indices.map(i=>e.points[i]),...(t.holes||[]).flatMap((indices,h)=>indices.map(i=>e.holes[h][i]))];
    else points=e.point?[e.point]:e.points?[...e.points,...(e.holes||[]).flat()]:[e.center];
    return points.filter(Boolean).map(point=>({point,mode}));
  });
  return {name:parameter.name,axis:[parameter.start,parameter.end],window:[{x:r.minX,y:r.minY},{x:r.maxX,y:r.minY},{x:r.maxX,y:r.maxY},{x:r.minX,y:r.maxY}],markers};
}
export function drawBlockParameterOverlay(ctx,parameter,entities,screen) {
  if(!parameter)return;
  const d=parameterDisplay(parameter,entities),axis=d.axis.map(screen),window=d.window.map(screen);
  ctx.save();ctx.lineWidth=1.5;ctx.strokeStyle='#7ebddd';ctx.fillStyle='#68bfff10';ctx.setLineDash([6,4]);
  ctx.beginPath();window.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.fill();ctx.stroke();
  ctx.setLineDash([]);ctx.beginPath();ctx.moveTo(axis[0].x,axis[0].y);ctx.lineTo(axis[1].x,axis[1].y);ctx.stroke();
  const angle=Math.atan2(axis[1].y-axis[0].y,axis[1].x-axis[0].x),end=axis[1];
  ctx.beginPath();ctx.moveTo(end.x-10*Math.cos(angle-0.45),end.y-10*Math.sin(angle-0.45));ctx.lineTo(end.x,end.y);ctx.lineTo(end.x-10*Math.cos(angle+0.45),end.y-10*Math.sin(angle+0.45));ctx.stroke();
  ctx.strokeRect(axis[0].x-4,axis[0].y-4,8,8);ctx.font='12px system-ui';ctx.fillStyle='#7ebddd';ctx.fillText(d.name,(axis[0].x+end.x)/2+8,(axis[0].y+end.y)/2-10);
  for(const marker of d.markers){const p=screen(marker.point);ctx.fillStyle=marker.mode==='move'?'#8ee8b8':'#ffc078';ctx.fillRect(p.x-3,p.y-3,6,6);}
  ctx.restore();
}
