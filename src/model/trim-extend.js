import { polylineParts, hasBulges } from "./polyline.js";
import { add, sub, mul, dist, angle, polar, mod, onArc, segmentDistance } from "./geometry.js";
import { segments } from "./entity-geometry.js";
import { clone, uid } from "./values.js";
const EPS = 1e-7,
  TAU = Math.PI * 2;
const dot = (a, b) => a.x * b.x + a.y * b.y;
const cross = (a, b) => a.x * b.y - a.y * b.x;
const shapes = (e) =>
  hasBulges(e)
    ? polylineParts(e).flatMap(shapes)
    : ["circle", "arc"].includes(e.type)
      ? [e]
      : segments(e).map(([a, b]) => ({ type: "segment", a, b }));
function intersections(a, b) {
  if (a.type !== "segment" && b.type === "segment")
    return intersections(b, a).filter(
      (p) => segmentDistance(p, b.a, b.b) < EPS,
    );
  let hits = [];
  if (a.type === "segment" && b.type === "segment") {
    const v = sub(a.b, a.a),
      w = sub(b.b, b.a),
      den = cross(v, w);
    if (Math.abs(den) < 1e-12 * Math.max(1, dist(a.a, a.b) * dist(b.a, b.b)))
      return [];
    const t = cross(sub(b.a, a.a), w) / den,
      u = cross(sub(b.a, a.a), v) / den;
    if (u >= -EPS && u <= 1 + EPS) hits = [add(a.a, mul(v, t))];
  } else if (a.type === "segment") {
    const v = sub(a.b, a.a),
      q = sub(a.a, b.center),
      aa = dot(v, v),
      bb = 2 * dot(q, v),
      cc = dot(q, q) - b.radius * b.radius;
    const d = bb * bb - 4 * aa * cc;
    if (aa > EPS * EPS && d >= 0)
      hits = [
        (-bb - Math.sqrt(d)) / (2 * aa),
        (-bb + Math.sqrt(d)) / (2 * aa),
      ].map((t) => add(a.a, mul(v, t)));
  } else {
    const d = dist(a.center, b.center);
    if (
      d < EPS ||
      d > a.radius + b.radius + EPS ||
      d < Math.abs(a.radius - b.radius) - EPS
    )
      return [];
    const x = (a.radius * a.radius - b.radius * b.radius + d * d) / (2 * d),
      h = Math.sqrt(Math.max(0, a.radius * a.radius - x * x));
    const u = mul(sub(b.center, a.center), 1 / d),
      c = add(a.center, mul(u, x)),
      n = { x: -u.y * h, y: u.x * h };
    hits = [add(c, n), sub(c, n)];
  }
  return hits.filter((p) => b.type !== "arc" || onArc(b, angle(b.center, p)));
}
function pointAt(edge, t) {
  return edge.type === "arc"
    ? polar(edge.center, edge.radius, edge.startAngle + Math.sign(edge.sweep) * t / edge.radius)
    : add(edge.a, mul(sub(edge.b, edge.a), t / edge.length));
}
function edgePosition(edge, p) {
  if (edge.type !== "arc") return dot(sub(p, edge.a), sub(edge.b, edge.a)) / edge.length;
  const t = mod(Math.sign(edge.sweep) * (angle(edge.center, p) - edge.startAngle)) * edge.radius;
  // atan2 can put the start point just below zero after a round trip.
  return edge.radius * TAU - t < EPS ? 0 : t;
}
function pathData(e) {
  let total = 0;
  const parts = e.type === "polyline" ? polylineParts(e) : [e];
  const edges = parts.map((part) => {
    const edge = part.type === "arc"
      ? { ...part, startAngle: part.start, length: part.radius * Math.abs(part.sweep) }
      : { type: "segment", a: part.points[0], b: part.points[1], length: dist(...part.points) };
    edge.start = total;
    total += edge.length;
    return edge;
  }).filter(edge => edge.length > EPS);
  return { edges, total };
}
function nearestPosition(edges, p) {
  let best = Infinity, result = 0;
  for (const edge of edges) {
    let t = edgePosition(edge, p);
    if (edge.type === "arc" && t > edge.length)
      t = dist(p, pointAt(edge, 0)) < dist(p, pointAt(edge, edge.length)) ? 0 : edge.length;
    else t = Math.max(0, Math.min(edge.length, t));
    const d = dist(p, pointAt(edge, t));
    if (d < best) { best = d; result = edge.start + t; }
  }
  return result;
}
function subpath(edges, from, to) {
  const parts = [];
  for (const edge of edges) {
    const lo = Math.max(from, edge.start), hi = Math.min(to, edge.start + edge.length);
    if (hi - lo <= EPS) continue;
    parts.push({ a: pointAt(edge, lo - edge.start), b: pointAt(edge, hi - edge.start),
      bulge: edge.type === "arc" ? Math.tan(Math.sign(edge.sweep) * (hi - lo) / edge.radius / 4) : 0 });
  }
  return parts;
}
function withPath(result, parts) {
  const points = [parts[0].a, ...parts.map(part => part.b)];
  const path = { ...result, points };
  if (result.type === "polyline" && (result.bulges || parts.some(part => part.bulge)))
    path.bulges = parts.map(part => part.bulge);
  return path;
}
function extendArc(e, limits, first) {
  const endpoint = first ? e.start : e.start + e.sweep,
    sign = Math.sign(e.sweep) * (first ? -1 : 1);
  const amounts = limits.flatMap(b => intersections({ ...e, type: "circle" }, b))
    .map(q => mod(sign * (angle(e.center, q) - endpoint)))
    .filter(t => t > EPS && t < TAU - Math.abs(e.sweep) - EPS).sort((a, b) => a - b);
  if (!amounts.length) throw Error("Ingen gräns i förlängningens riktning.");
  return { ...e, start: e.start - (first ? Math.sign(e.sweep) * amounts[0] : 0),
    sweep: e.sweep + Math.sign(e.sweep) * amounts[0] };
}
export function trimExtend(e, boundaries, p, mode) {
  if (!e || !["line", "polyline", "arc", "circle"].includes(e.type))
    throw Error("Välj en linje, cirkel, båge eller polylinje.");
  const limits = boundaries.filter((b) => b.id !== e.id).flatMap(shapes);
  if (!limits.length)
    throw Error("Ingen synlig gräns att trimma eller förlänga mot.");
  const result = clone(e);
  if (mode === "EXTEND") {
    if (e.type === "polyline" && e.closed)
      throw Error("En sluten polylinje kan inte förlängas.");
    if (e.type === "circle") throw Error("En cirkel saknar ändar och kan inte förlängas. Trimma den till en båge först.");
    if (e.type === "arc") {
      return [extendArc(e, limits, dist(p, polar(e.center, e.radius, e.start)) < dist(p, polar(e.center, e.radius, e.start + e.sweep)))];
    } else {
      const pts = result.points,
        first = dist(p, pts[0]) < dist(p, pts.at(-1));
      const parts = e.type === "polyline" ? polylineParts(e) : [];
      const terminal = first ? parts[0] : parts.at(-1);
      if (terminal?.type === "arc") {
        const arc = extendArc(terminal, limits, first);
        pts[first ? 0 : pts.length - 1] = polar(arc.center, arc.radius, first ? arc.start : arc.start + arc.sweep);
        result.bulges = parts.map((part, i) => i === (first ? 0 : parts.length - 1)
          ? Math.tan(arc.sweep / 4) : (e.bulges?.[i] || 0));
        return [result];
      }
      const i = first ? 0 : pts.length - 1,
        j = first ? 1 : pts.length - 2;
      const v = sub(pts[i], pts[j]),
        length = dist(pts[i], pts[j]);
      const ray = { type: "segment", a: pts[j], b: pts[i] };
      const hits = limits
        .flatMap((b) => intersections(ray, b))
        .map((q) => ({ q, t: dot(sub(q, pts[i]), v) / length }))
        .filter((h) => h.t > EPS)
        .sort((a, b) => a.t - b.t);
      if (!hits.length) throw Error("Ingen gräns i förlängningens riktning.");
      pts[i] = hits[0].q;
    }
    return [result];
  }
  let cuts = [],
    total,
    position,
    edges;
  if (e.type === "circle") {
    total = TAU;
    cuts = limits.flatMap(b => intersections(e, b)).map(q => mod(angle(e.center, q)));
    position = mod(angle(e.center, p));
  } else if (e.type === "arc") {
    total = Math.abs(e.sweep);
    const param = (q) =>
      mod(Math.sign(e.sweep) * (angle(e.center, q) - e.start));
    cuts = limits
      .flatMap((b) => intersections({ ...e, type: "circle" }, b))
      .map(param)
      .filter((t) => t > EPS && t < total - EPS);
    position = param(p);
    if (position > total)
      position =
        dist(p, polar(e.center, e.radius, e.start)) <
        dist(p, polar(e.center, e.radius, e.start + e.sweep))
          ? 0
          : total;
  } else {
    ({ edges, total } = pathData(e));
    position = nearestPosition(edges, p);
    for (const edge of edges)
      for (const b of limits)
        for (const q of intersections(edge.type === "arc" ? { ...edge, type: "circle" } : edge, b)) {
          const t = edgePosition(edge, q);
          if (t >= -EPS && t <= edge.length + EPS)
            cuts.push(edge.start + Math.max(0, Math.min(edge.length, t)));
        }
    cuts = cuts.filter((t) => e.closed || (t > EPS && t < total - EPS));
  }
  cuts = cuts
    .sort((a, b) => a - b)
    .filter((v, i, a) => !i || v - a[i - 1] > EPS);
  if (!cuts.length) throw Error("Ingen skärning med synliga gränser.");
  let ranges;
  if (e.closed || e.type === "circle") {
    cuts = cuts
      .map((t) => (Math.abs(t - total) < EPS ? 0 : t))
      .sort((a, b) => a - b)
      .filter((v, i, a) => !i || v - a[i - 1] > EPS);
    if (cuts.length < 2)
      throw Error("En cirkel eller sluten polylinje behöver två skärningar.");
    const lo = cuts.findLast((t) => t <= position) ?? cuts.at(-1) - total;
    const hi = cuts.find((t) => t > position) ?? cuts[0] + total;
    const start = ((hi % total) + total) % total,
      end = ((lo % total) + total) % total;
    if (e.type === "circle")
      return [{ ...result, type: "arc", start, sweep: total - (hi - lo) }];
    const parts = start < end ? subpath(edges, start, end)
      : [...subpath(edges, start, total), ...subpath(edges, 0, end)];
    return [withPath({ ...result, closed: false }, parts)];
  }
  const lo = cuts.findLast((t) => t <= position) ?? 0,
    hi = cuts.find((t) => t > position) ?? total;
  ranges = [
    [0, lo],
    [hi, total],
  ].filter(([a, b]) => b - a > EPS);
  return ranges.map(([a, b], i) =>
    e.type === "arc"
      ? {
          ...result,
          id: i ? uid() : e.id,
          start: e.start + Math.sign(e.sweep) * a,
          sweep: Math.sign(e.sweep) * (b - a),
        }
      : withPath({ ...result, id: i ? uid() : e.id }, subpath(edges, a, b)),
  );
}

// Exact crossings keep fast pointer moves from skipping narrow lines or arcs.
export function trimSweepCrossings(entities, from, to) {
  if (dist(from, to) < EPS) return [];
  const stroke = { type: "segment", a: from, b: to }, length = dist(from, to);
  const hits = [];
  for (const entity of entities) {
    for (const shape of shapes(entity)) {
      for (const point of intersections(stroke, shape)) {
        const t = dot(sub(point, from), sub(to, from)) / (length * length);
        if (t >= -EPS && t <= 1 + EPS) hits.push({ entity, point, t });
      }
    }
  }
  return hits.sort((a, b) => a.t - b.t);
}
