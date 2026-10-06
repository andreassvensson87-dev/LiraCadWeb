import { splinePoints, ellipsePoints, sampleCurve } from "./dxf-curves.js";
import { polylineParts } from "./polyline.js";
const get=(r,c,f=0)=>r.find(p=>p[0]===c)?.[1]??f;
const num=(r,c,f=0)=>Number(get(r,c,f));
const pt=(r,c=10)=>({x:num(r,c),y:num(r,c+10)});
const all=(r,c)=>r.filter(p=>p[0]===c).map(p=>Number(p[1]));
function vertices(r){const ps=[];for(const [c,v] of r){if(c===10)ps.push({x:Number(v),y:0});else if(c===20&&ps.length)ps.at(-1).y=Number(v);else if(c===42&&ps.length)ps.at(-1).bulge=Number(v);}return ps;}
export function readHatchPattern(r) {
  const start=r.findIndex(p=>p[0]===78), count=num(r,78), lines=[];
  if(start<0 || !count) return null;
  for(let i=start+1;i<r.length && lines.length<count;i++) if(r[i][0]===53) {
    let end=i+1;while(end<r.length && ![53,98].includes(r[end][0]))end++;
    const line=r.slice(i,end), dashes=all(line,49);
    if(dashes.length!==num(line,79))throw Error('Ogiltiga hatch-streck');
    lines.push({angle:num(line,53)*Math.PI/180,base:{x:num(line,43),y:num(line,44)},offset:{x:num(line,45),y:num(line,46)},dashes});
    i=end-1;
  }
  if(lines.length!==count || count>1000)throw Error('Ogiltigt hatchmönster');
  return lines;
}
export function hatchLoops(r) {
  const first=r.findIndex(p=>p[0]===91), last=r.findIndex((p,i)=>i>first&&p[0]===75), loops=[];
  const body=r.slice(first+1,last<0?undefined:last);
  for(let i=0;i<body.length;i++) if(body[i][0]===92){
    const flags=Number(body[i][1]);let end=i+1;while(end<body.length&&body[end][0]!==92)end++;
    const boundary=body.slice(i+1,end);i=end-1;
    if(flags&2){
      const start=boundary.findIndex(p=>p[0]===93), finish=boundary.findIndex((p,j)=>j>start&&p[0]===97);
      const vs=vertices(boundary.slice(start+1,finish<0?undefined:finish));
      const poly={type:'polyline',points:vs.map(({x,y})=>({x,y})),bulges:vs.map(v=>v.bulge||0),closed:true};
      const parts=polylineParts(poly);const points=[];
      for(const part of parts){if(part.type==='line')points.push(...part.points);else points.push(...sampleCurve(t=>({x:part.center.x+part.radius*Math.cos(part.start+t*part.sweep),y:part.center.y+part.radius*Math.sin(part.start+t*part.sweep)}),[0,0.25,0.5,0.75,1]));}
      loops.push(points.length?points:poly.points);
    } else {
      const count=num(boundary,93), points=[];let starts=[];
      for(let j=0;j<boundary.length;j++)if(boundary[j][0]===72)starts.push(j);
      if(starts.length!==count)throw Error('Ogiltiga hatch-gränser');
      for(let j=0;j<starts.length;j++){
        const edge=boundary.slice(starts[j],starts[j+1]??boundary.length),type=num(edge,72);
        let ps;
        if(type===1)ps=[pt(edge),pt(edge,11)];
        else if(type===2||type===3){
          const ccw=!!num(edge,73),start=num(edge,50)*Math.PI/180,end=num(edge,51)*Math.PI/180;
          ps=ellipsePoints(pt(edge),type===2?{x:num(edge,40),y:0}:pt(edge,11),type===2?1:num(edge,40),ccw?start:end,ccw?end:start);
          if(!ccw)ps.reverse();
        } else if(type===4)ps=splinePoints(vertices(edge),all(edge,40),num(edge,94),all(edge,42));
        else throw Error('Okänd hatch-gräns');
        points.push(...ps);
      }
      loops.push(points);
    }
  }
  for(let i=0;i<loops.length;i++){
    const same=(a,b)=>a.x===b.x && a.y===b.y;
    loops[i]=loops[i].filter((p,j,ps)=>!j || !same(p,ps[j-1]));
    if(loops[i].length>1 && same(loops[i][0],loops[i].at(-1)))loops[i].pop();
  }
  if(loops.length!==num(r,91)||loops.some(p=>p.length<3))throw Error('Ogiltiga hatch-gränser');
  return loops;
}
