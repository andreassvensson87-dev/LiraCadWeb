import { scaleTextColumns } from "./text-columns.js";
// Approximate native curves with editable 2D polylines at a bounded tolerance.
export function sampleCurve(fn, breaks, tolerance = 0.001) {
  const points = [], maxPoints = 8192;
  const distance = (p, a, b) => {
    const dx = b.x - a.x, dy = b.y - a.y, t = Math.max(0, Math.min(1, ((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy || 1)));
    return Math.hypot(p.x-a.x-t*dx, p.y-a.y-t*dy);
  };
  function segment(a, b, pa, pb, depth) {
    const mid = (a+b)/2, pm = fn(mid);
    const error = Math.max(distance(pm,pa,pb),distance(fn((3*a+b)/4),pa,pb),distance(fn((a+3*b)/4),pa,pb));
    if (error > tolerance && depth < 16) { segment(a,mid,pa,pm,depth+1); segment(mid,b,pm,pb,depth+1); }
    else { if (points.length >= maxPoints) throw Error("Kurvan kräver för många segment"); points.push(pb); }
  }
  points.push(fn(breaks[0]));
  for (let i=1;i<breaks.length;i++) segment(breaks[i-1],breaks[i],fn(breaks[i-1]),fn(breaks[i]),0);
  if (points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y))) throw Error("Ogiltig kurvgeometri");
  return points;
}
export function splinePoints(control, knots, degree, weights = []) {
  if (!Number.isInteger(degree) || degree < 1 || degree > 10 || control.length <= degree || knots.length !== control.length + degree + 1 || knots.some((v,i)=>!Number.isFinite(v)||(i && v<knots[i-1])) || (weights.length && (weights.length!==control.length || weights.some(v=>!Number.isFinite(v)||v<=0)))) throw Error("Ogiltiga spline-kontrollpunkter, vikter eller knutar");
  const first = knots[degree], last = knots[control.length];
  if (!(last>first)) throw Error("Spline saknar parameterintervall");
  function at(t) {
    let span = control.length-1;
    if (t<last) { span=degree; while(span<control.length-1 && t>=knots[span+1]) span++; }
    const d = Array.from({length:degree+1},(_,j)=>{
      const i=span-degree+j,w=weights[i]??1; return {x:control[i].x*w,y:control[i].y*w,w};
    });
    for(let r=1;r<=degree;r++) for(let j=degree;j>=r;j--){
      const i=span-degree+j, den=knots[i+degree-r+1]-knots[i], a=den ? (t-knots[i])/den : 0;
      d[j]={x:(1-a)*d[j-1].x+a*d[j].x,y:(1-a)*d[j-1].y+a*d[j].y,w:(1-a)*d[j-1].w+a*d[j].w};
    }
    return {x:d[degree].x/d[degree].w,y:d[degree].y/d[degree].w};
  }
  return sampleCurve(at,[...new Set(knots.slice(degree,control.length+1))]);
}
export function ellipsePoints(center, major, ratio, start=0, end=Math.PI*2, normal=1) {
  if (!(ratio>0 && ratio<=1+1e-8) || Math.hypot(major.x,major.y)<1e-12) throw Error("Ogiltig ellips");
  if (end<=start) end+=Math.PI*2;
  const fn = t=>({x:center.x+major.x*Math.cos(t)-normal*major.y*ratio*Math.sin(t),y:center.y+major.y*Math.cos(t)+normal*major.x*ratio*Math.sin(t)});
  return sampleCurve(fn,Array.from({length:5},(_,i)=>start+(end-start)*i/4));
}

export function affineEntity(entity, sx, sy, rotation, point) {
  const e = structuredClone(entity), c = Math.cos(rotation), s = Math.sin(rotation);
  const map = p => ({x:point.x+c*sx*p.x-s*sy*p.y,y:point.y+s*sx*p.x+c*sy*p.y});
  if (e.type === 'circle' || e.type === 'arc') {
    const start=e.start||0, sweep=e.type==='circle'?Math.PI*2:e.sweep;
    e.points=sampleCurve(t=>map({x:e.center.x+e.radius*Math.cos(start+t*sweep),y:e.center.y+e.radius*Math.sin(start+t*sweep)}),[0,0.25,0.5,0.75,1]);
    e.closed=e.type==='circle';e.type='polyline';delete e.center;delete e.radius;
  } else if(e.points) e.points=e.points.map(map);
  if(e.holes)e.holes=e.holes.map(loop=>loop.map(map));
  if(e.point)e.point=map(e.point);
  if(e.type==='text'){
    const a=entity.rotation||0, vx={x:sx*Math.cos(a),y:sy*Math.sin(a)}, vy={x:-sx*Math.sin(a),y:sy*Math.cos(a)};
    const widthScale=Math.hypot(vx.x,vx.y),heightScale=Math.abs(sx*sy)/widthScale;
    e.rotation=rotation+Math.atan2(vx.y,vx.x);e.height*=heightScale;
    e.widthFactor=(e.widthFactor||1)*widthScale/heightScale;
    if(e.textRuns)e.textRuns=e.textRuns.map(run=>({...run,widthFactor:(run.widthFactor||entity.widthFactor||1)*widthScale/heightScale}));
    if(e.textWidth)e.textWidth*=widthScale;
    if(e.textColumns)e.textColumns=scaleTextColumns(e.textColumns,widthScale,heightScale);
    if(e.textFitWidth)e.textFitWidth*=widthScale;
    e.oblique=Math.atan((Math.tan(entity.oblique||0)*widthScale+(vx.x*vy.x+vx.y*vy.y)/widthScale)/heightScale);
    if(sx*sy<0)e.textMirrorY=!e.textMirrorY;
  } else if(e.height)e.height*=Math.sqrt(Math.abs(sx*sy));
  if(e.spacing)e.spacing*=Math.sqrt(Math.abs(sx*sy));
  if(e.hatchPattern){
    e.hatchPattern=e.hatchPattern.map(l=>{
      const v={x:sx*Math.cos(l.angle),y:sy*Math.sin(l.angle)},scale=Math.hypot(v.x,v.y),origin=map({x:0,y:0}),offset=map(l.offset);
      return {...l,angle:rotation+Math.atan2(v.y,v.x),base:map(l.base),offset:{x:offset.x-origin.x,y:offset.y-origin.y},dashes:l.dashes.map(d=>d*scale)};
    });
    const first=e.hatchPattern[0];e.patternAngle=first.angle;e.spacing=Math.abs(-Math.sin(first.angle)*first.offset.x+Math.cos(first.angle)*first.offset.y)||e.spacing;
  }
  return e;
}
