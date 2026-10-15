// DXF pattern definitions are already scaled/rotated in drawing coordinates.
export function hatchPattern(e) {
  const angle = e.patternAngle ?? Math.PI / 4;
  if(!e.hatchPattern)return [{ angle, base: { x: 0, y: 0 }, offset: { x: -e.spacing * Math.sin(angle), y: e.spacing * Math.cos(angle) }, dashes: [] }];
  const first=e.hatchPattern[0], delta=angle-first.angle, spacing=Math.abs(-Math.sin(first.angle)*first.offset.x+Math.cos(first.angle)*first.offset.y);
  const scale=spacing>1e-10?e.spacing/spacing:1;
  if(Math.abs(delta)<1e-12 && Math.abs(scale-1)<1e-12)return e.hatchPattern;
  const vector=p=>({x:scale*(p.x*Math.cos(delta)-p.y*Math.sin(delta)),y:scale*(p.x*Math.sin(delta)+p.y*Math.cos(delta))});
  return e.hatchPattern.map(l=>{const base=vector({x:l.base.x-first.base.x,y:l.base.y-first.base.y});return {...l,angle:l.angle+delta,base:{x:first.base.x+base.x,y:first.base.y+base.y},offset:vector(l.offset),dashes:l.dashes.map(d=>d*scale)};});
}
export function hatchSegments(e, { limit = 30000, minSpacing = 0 } = {}) {
  const segments = [], box={minX:Infinity,minY:Infinity,maxX:-Infinity,maxY:-Infinity};
  for(const loop of [e.points,...(e.holes||[])])for(const p of loop){box.minX=Math.min(box.minX,p.x);box.maxX=Math.max(box.maxX,p.x);box.minY=Math.min(box.minY,p.y);box.maxY=Math.max(box.maxY,p.y);}
  const points=[{x:box.minX,y:box.minY},{x:box.maxX,y:box.minY},{x:box.maxX,y:box.maxY},{x:box.minX,y:box.maxY}];
  for (const family of hatchPattern(e)) {
    const u = { x: Math.cos(family.angle), y: Math.sin(family.angle) }, n = { x: -u.y, y: u.x };
    const dot = (p, v) => p.x * v.x + p.y * v.y;
    const ps = points.map(p => ({ x: dot({ x: p.x-family.base.x, y: p.y-family.base.y }, u), y: dot({ x: p.x-family.base.x, y: p.y-family.base.y }, n) }));
    const ymin = Math.min(...ps.map(p=>p.y)), ymax = Math.max(...ps.map(p=>p.y)), xmin = Math.min(...ps.map(p=>p.x)), xmax = Math.max(...ps.map(p=>p.x));
    const dy = dot(family.offset, n), dx = dot(family.offset, u);
    if (Math.abs(dy) < 1e-10) continue;
    const first = Math.ceil(Math.min(ymin/dy,ymax/dy)-1e-8), last = Math.floor(Math.max(ymin/dy,ymax/dy)+1e-8);
    if(!Number.isSafeInteger(first) || !Number.isSafeInteger(last))continue;
    const stride = Math.max(1,Math.ceil(minSpacing/Math.abs(dy)),Math.ceil((last-first+1)/limit));
    const emit = (row, a, b) => {
      const p = t => ({x:family.base.x+row*family.offset.x+t*u.x,y:family.base.y+row*family.offset.y+t*u.y});
      segments.push([p(a),p(b)]);
    };
    const period = family.dashes.reduce((sum,d)=>sum+Math.abs(d),0);
    if(family.dashes.length && family.dashes.every(d=>d<0))continue;
    for(let row=Math.ceil(first/stride)*stride;row<=last;row+=stride) {
      const lo=xmin-row*dx, hi=xmax-row*dx;
      if (!period) {if(!family.dashes.length)emit(row,lo,hi);else if(lo<=0 && hi>=0)emit(row,0,0);}
      else {
        let cycle=Math.floor(lo/period)*period;
        while(cycle<=hi) {
          let t=cycle;
          for(const dash of family.dashes) {
            const end=t+Math.abs(dash);
            if(dash>=0 && end>=lo && t<=hi) emit(row,Math.max(lo,t),Math.min(hi,end));
            t=end;
            if(segments.length>=limit) return segments;
          }
          const next=cycle+period;if(next<=cycle)return segments;cycle=next;
        }
      }
      if(segments.length>=limit) return segments;
    }
  }
  return segments;
}
