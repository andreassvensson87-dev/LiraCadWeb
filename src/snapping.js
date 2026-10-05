import { blockParts } from "./blocks.js";
import { polylineParts, hasBulges } from "./polyline.js";
import { dist, sub, add, mul, polar, angle, onArc, intersection } from "./geometry.js";
import { snapPoints, segments } from "./entity-geometry.js";
import { createSpatialIndex } from "./spatial-index.js";
const cross = (a, b) => a.x * b.y - a.y * b.x;
const dot = (a, b) => a.x * b.x + a.y * b.y;
const edgePadding = e => 1e-8 + Math.max(e.maxX-e.minX,e.maxY-e.minY)*1e-9;
const paddedEdge = e => {
  const pad=edgePadding(e);
  return {minX:e.minX-pad,maxX:e.maxX+pad,minY:e.minY-pad,maxY:e.maxY+pad};
};
const pointOn = (shape, p) =>
  shape.type !== "arc" || onArc(shape, angle(shape.center, p));
function lineCircle(a, b, circle) {
  const v = sub(b, a),
    q = sub(a, circle.center),
    aa = dot(v, v);
  if (aa < 1e-16) return [];
  const bb = 2 * dot(v, q),
    cc = dot(q, q) - circle.radius ** 2,
    d = bb * bb - 4 * aa * cc;
  if (d < -1e-8 * aa) return [];
  return [
    ...new Set([
      (-bb - Math.sqrt(Math.max(0, d))) / (2 * aa),
      (-bb + Math.sqrt(Math.max(0, d))) / (2 * aa),
    ]),
  ]
    .filter((t) => t >= -1e-9 && t <= 1 + 1e-9)
    .map((t) => add(a, mul(v, t)))
    .filter((p) => pointOn(circle, p));
}
function circles(a, b) {
  const d = dist(a.center, b.center);
  if (
    d < 1e-9 ||
    d > a.radius + b.radius + 1e-8 ||
    d < Math.abs(a.radius - b.radius) - 1e-8
  )
    return [];
  const x = (a.radius * a.radius - b.radius * b.radius + d * d) / (2 * d),
    h = Math.sqrt(Math.max(0, a.radius * a.radius - x * x)),
    v = mul(sub(b.center, a.center), 1 / d),
    p = add(a.center, mul(v, x)),
    n = { x: -v.y * h, y: v.x * h };
  return [add(p, n), sub(p, n)].filter((p) => pointOn(a, p) && pointOn(b, p));
}
export function collectSnapGeometry(entities) {
  const points = [],
    edges = [];
  for (const e of entities) {
    points.push(...snapPoints(e).map((p) => ({ ...p, id: e.id })));
    if (e.type === "block" || hasBulges(e)) {
      const nested = collectSnapGeometry(
        e.type === "block" ? blockParts(e) : polylineParts(e),
      );
      edges.push(...nested.edges.map((edge) => ({ ...edge, id: e.id })));
      continue;
    }
    if (["circle", "arc"].includes(e.type))
      edges.push({
        ...e,
        minX: e.center.x - e.radius,
        maxX: e.center.x + e.radius,
        minY: e.center.y - e.radius,
        maxY: e.center.y + e.radius,
      });
    else if (e.type !== "text")
      for (const [a, b] of segments(e))
        edges.push({
          id: e.id,
          type: "segment",
          a,
          b,
          minX: Math.min(a.x, b.x),
          maxX: Math.max(a.x, b.x),
          minY: Math.min(a.y, b.y),
          maxY: Math.max(a.y, b.y),
        });
  }
  return { points, edges };
}
export function createSnapIndex(entities) {
  const geometry=new WeakMap(),points=[],edges=[];
  for(const entity of entities) {
    const group=collectSnapGeometry([entity]);geometry.set(entity,group);
    points.push(...group.points);edges.push(...group.edges);
  }
  edges.forEach((edge,i)=>edge.order=i);
  return { points, edges, geometry,
    pointIndex: createSpatialIndex(points, s => ({minX:s.p.x,maxX:s.p.x,minY:s.p.y,maxY:s.p.y})),
    edgeIndex: createSpatialIndex(edges, paddedEdge),
    edgeOrder: {get:edge=>edge.order},nativeOrder:true,
  };
}
export function appendSnapIndex(index, entities) {
  const geometry=index.geometry,points=[],edges=[];
  for(const entity of entities) {
    const group=collectSnapGeometry([entity]);geometry.set(entity,group);
    points.push(...group.points);edges.push(...group.edges);
  }
  edges.forEach((edge,i)=>edge.order=index.edges.length+i);
  const allEdges=[...index.edges,...edges];
  return {points:[...index.points,...points],edges:allEdges,geometry,
    pointIndex:index.pointIndex.append(points),edgeIndex:index.edgeIndex.append(edges),
    nativeOrder:index.nativeOrder,edgeOrder:index.nativeOrder?index.edgeOrder:new Map(allEdges.map((edge,i)=>[edge,i]))};
}
// Accepted entities are immutable: reuse their snap geometry and update tree
// branches only for actual replacements. Reassemble arrays in document order.
export function updateSnapIndex(index, entities) {
  if(!index.geometry)return createSnapIndex(entities);
  const geometry=index.geometry,points=[],edges=[];
  for(const entity of entities) {
    let group=index.geometry.get(entity);
    if(!group){
      group=collectSnapGeometry([entity]);
      group.edges.forEach((edge,i)=>edge.order=edges.length+i);
    }
    geometry.set(entity,group);points.push(...group.points);edges.push(...group.edges);
  }
  const nativeOrder=edges.every((edge,i)=>edge.order===i);
  return {geometry,points,edges,pointIndex:index.pointIndex.update(points),edgeIndex:index.edgeIndex.update(edges),
    nativeOrder,edgeOrder:nativeOrder?{get:edge=>edge.order}:new Map(edges.map((edge,i)=>[edge,i]))};
}
export function nearbySnaps(index, p, tolerance) {
  if(index.nearby)return index.nearby(p,tolerance);
  const box = {minX:p.x-tolerance,maxX:p.x+tolerance,minY:p.y-tolerance,maxY:p.y+tolerance};
  const candidates = (index.pointIndex?.query(box, true) || index.points).filter((s) => dist(s.p, p) <= tolerance);
  const edges = (index.edgeIndex?.query(box, true) || index.edges).filter(
    (e) =>
      p.x >= e.minX - tolerance &&
      p.x <= e.maxX + tolerance &&
      p.y >= e.minY - tolerance &&
      p.y <= e.maxY + tolerance,
  );
  for (let i = 0; i < edges.length; i++) {
    const a = edges[i];
    // At overview scales the cursor covers thousands of edges. Only compare
    // pairs whose bounding boxes overlap, instead of every nearby edge pair.
    const padded = paddedEdge(a);
    const others = edges.length > 64 && index.edgeIndex && index.edgeOrder
      ? index.edgeIndex.query({minX:Math.max(padded.minX,box.minX),maxX:Math.min(padded.maxX,box.maxX),minY:Math.max(padded.minY,box.minY),maxY:Math.min(padded.maxY,box.maxY)},true)
        .filter(b=>index.edgeOrder.get(b)>index.edgeOrder.get(a))
      : edges.slice(i+1);
    for (const b of others) {
      const pad=edgePadding(a)+edgePadding(b);
      if (a.maxX+pad < b.minX || a.minX-pad > b.maxX || a.maxY+pad < b.minY || a.minY-pad > b.maxY) continue;
      let hits = [];
      if (a.type === "segment" && b.type === "segment") {
        const q = intersection(a.a, a.b, b.a, b.b);
        if (q) hits = [q];
      } else if (a.type === "segment") hits = lineCircle(a.a, a.b, b);
      else if (b.type === "segment") hits = lineCircle(b.a, b.b, a);
      else hits = circles(a, b);
      for (const q of hits)
        if (dist(q, p) <= tolerance)
          candidates.push({ p: q, kind: "Skärning", id: a.id });
    }
  }
  return candidates;
}
export function resolveSnap({
  raw,
  base,
  candidates = [],
  anchors = [],
  tolerance,
  ortho = false,
  polarEnabled = false,
  polarStep = 45,
  track = false,
}) {
  const axis = base
    ? Math.abs(raw.x - base.x) >= Math.abs(raw.y - base.y)
      ? { x: 1, y: 0 }
      : { x: 0, y: 1 }
    : null;
  const allowed = (p) =>
    !ortho || !base || Math.abs(cross(sub(p, base), axis)) < 1e-7;
  let exact, nearest = Infinity;
  for (const candidate of candidates) {
    if (!allowed(candidate.p)) continue;
    const distance = dist(raw,candidate.p);
    if (distance < nearest) { exact = candidate; nearest = distance; }
  }
  if (exact) return { ...exact, mode: "object", guides: [] };
  const rays = [];
  if (track)
    for (const a of anchors)
      for (const v of [
        { x: 1, y: 0 },
        { x: 0, y: 1 },
      ])
        rays.push({ origin: a, v, kind: "Track" });
  if (base && (ortho || polarEnabled)) {
    const step = ((ortho ? 90 : polarStep) * Math.PI) / 180,
      ang = Math.round(angle(base, raw) / step) * step;
    rays.push({
      origin: base,
      v: { x: Math.cos(ang), y: Math.sin(ang) },
      kind: ortho
        ? "Ortho"
        : `Polar ${((Math.round((ang * 180) / Math.PI) % 360) + 360) % 360}°`,
      positive: !ortho,
      force: ortho,
    });
  }
  const choices = [];
  for (const ray of rays) {
    const t = dot(sub(raw, ray.origin), ray.v),
      p = add(ray.origin, mul(ray.v, t)),
      d = dist(raw, p);
    if (
      (!ray.positive || t >= 0) &&
      (d <= tolerance || ray.force) &&
      allowed(p)
    )
      choices.push({
        p,
        kind: ray.kind,
        mode: ray.kind === "Track" ? "track" : "polar",
        guides: [{ a: ray.origin, b: p }],
        score: d,
      });
  }
  for (let i = 0; i < rays.length; i++)
    for (let j = i + 1; j < rays.length; j++) {
      const a = rays[i],
        b = rays[j],
        den = cross(a.v, b.v);
      if (Math.abs(den) < 1e-8) continue;
      const t = cross(sub(b.origin, a.origin), b.v) / den,
        p = add(a.origin, mul(a.v, t));
      if (
        (a.positive && t < 0) ||
        (b.positive && dot(sub(p, b.origin), b.v) < 0) ||
        dist(raw, p) > tolerance ||
        !allowed(p) ||
        dist(a.origin, b.origin) < 1e-8
      )
        continue;
      choices.push({
        p,
        kind: "Track · skärning",
        mode: "track",
        guides: [
          { a: a.origin, b: p },
          { a: b.origin, b: p },
        ],
        score: dist(raw, p) - tolerance,
      });
    }
  choices.sort((a, b) => a.score - b.score);
  return choices[0] || { p: raw, kind: "", mode: "free", guides: [] };
}
