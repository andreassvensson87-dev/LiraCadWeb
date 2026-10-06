import { scaleTextColumns } from "./text-columns.js";
import { add, sub, mul, dist, angle, polar } from "./geometry.js";
import { clone } from "./values.js";
import { dimensionGraphicsState, dimensionParts } from "./dimensions.js";

// Pure entity transformations. Stable IDs and style are preserved.
export function transform(
  e,
  fn,
  { scale = 1, rotation = 0, mirror = false } = {},
) {
  const n = clone(e);
  if(e.annotationVariants)n.annotationVariants=e.annotationVariants.map(v=>({...v,entity:transform(v.entity,fn,{scale,rotation,mirror})}));
  if(e.type!=="block" && e.annotationContexts){
    const map=c=>({...c,point:fn(c.point),scale:c.scale*Math.abs(scale),rotation:mirror?rotation-c.rotation:c.rotation+rotation,mirrored:mirror?!c.mirrored:c.mirrored});
    n.annotationBase=map(e.annotationBase);n.annotationContexts=e.annotationContexts.map(map);
  }
  const preserveDimension=e.dimensionGraphics && e.dimensionGraphicsState===dimensionGraphicsState(e);
  if (n.points) n.points = n.points.map(fn);
  if (n.holes) n.holes = n.holes.map(loop => loop.map(fn));
  if (n.arrowSize) n.arrowSize *= Math.abs(scale);
  if (n.type === "polyline" && mirror && n.bulges)
    n.bulges = n.bulges.map((b) => -b);
  if (n.type === "block") {
    n.scale = (e.scale || 1) * Math.abs(scale);
    n.rotation = mirror
      ? rotation - (e.rotation || 0)
      : (e.rotation || 0) + rotation;
    n.mirrored = mirror ? !e.mirrored : !!e.mirrored;
  }
  if (e.type === "dimension" && e.axis) {
    const a = fn(e.axis),
      o = fn({ x: 0, y: 0 }),
      v = sub(a, o),
      l = Math.hypot(v.x, v.y);
    n.axis = mul(v, 1 / l);
  }
  if (n.point) n.point = fn(n.point);
  if (n.center) {
    n.center = fn(n.center);
    n.radius *= Math.abs(scale);
  }
  if (n.height) n.height *= Math.abs(scale);
  if (n.textWidth) n.textWidth *= Math.abs(scale);
  if (n.textColumns) n.textColumns=scaleTextColumns(n.textColumns,scale);
  if (n.textFitWidth) n.textFitWidth *= Math.abs(scale);
  if (n.spacing) n.spacing *= Math.abs(scale);
  if(n.dimensionTextPoint)n.dimensionTextPoint=fn(n.dimensionTextPoint);
  if(n.type==='dimension')for(const key of ['extensionOffset','extensionOvershoot','textGap'])if(n[key]!=null)n[key]*=Math.abs(scale);
  if(preserveDimension){
    n.dimensionGraphics=e.dimensionGraphics.map(p=>transform(p,fn,{scale,rotation,mirror}));
    const oldLabel=dimensionParts({...e,dimensionGraphics:undefined}).find(p=>p.type==='text')?.text;
    const newLabel=dimensionParts({...n,dimensionGraphics:undefined}).find(p=>p.type==='text')?.text;
    let updated=oldLabel===newLabel || !oldLabel;
    if(!updated)for(const part of n.dimensionGraphics)if(part.type==='text' && part.text.trim()===oldLabel.trim()){
      part.text=part.text.replace(oldLabel.trim(),newLabel.trim());
      if(part.textRuns?.length===1)part.textRuns[0].text=part.text;else delete part.textRuns;
      updated=true;
    }
    // Unknown advanced numeric formatting must regenerate rather than show a stale value.
    if(updated)n.dimensionGraphicsState=dimensionGraphicsState(n);
  }
  if (n.type === "hatch")
    n.patternAngle = mirror
      ? rotation - (n.patternAngle ?? Math.PI / 4)
      : (n.patternAngle ?? Math.PI / 4) + rotation;
  if(n.hatchPattern)n.hatchPattern=n.hatchPattern.map(line=>({
    ...line,base:fn(line.base),offset:sub(fn(line.offset),fn({x:0,y:0})),
    angle:mirror?rotation-line.angle:line.angle+rotation,
    dashes:line.dashes.map(d=>d*Math.abs(scale)),
  }));
  if (n.type === "arc") {
    const end = fn(polar(e.center, e.radius, e.start));
    n.start = angle(n.center, end);
    if (mirror) n.sweep = -n.sweep;
  }
  if (n.type === "text") {
    if (mirror) n.textMirrorY = !e.textMirrorY;
    n.rotation = mirror
      ? rotation - (n.rotation || 0)
      : (n.rotation || 0) + rotation;
  }
  return n;
}
export function transformed(e, kind, base, target, value) {
  if (kind === "MOVE" || kind === "COPY")
    return transform(e, (p) => add(p, sub(target, base)));
  if (kind === "ROTATE") {
    const a = value ?? angle(base, target),
      c = Math.cos(a),
      s = Math.sin(a);
    return transform(
      e,
      (p) => {
        const q = sub(p, base);
        return add(base, { x: q.x * c - q.y * s, y: q.x * s + q.y * c });
      },
      { rotation: a },
    );
  }
  if (kind === "SCALE") {
    const k = value ?? dist(base, target) / 1000;
    return transform(e, (p) => add(base, mul(sub(p, base), k)), { scale: k });
  }
  if (kind === "MIRROR") {
    const a = angle(base, target),
      c = Math.cos(2 * a),
      s = Math.sin(2 * a);
    return transform(
      e,
      (p) => {
        const q = sub(p, base);
        return add(base, { x: q.x * c + q.y * s, y: q.x * s - q.y * c });
      },
      { mirror: true, rotation: 2 * a },
    );
  }
  return clone(e);
}
