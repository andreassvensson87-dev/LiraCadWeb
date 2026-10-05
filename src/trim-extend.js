import { polylineParts, hasBulges } from "./polyline.js";
import { add, sub, mul, dist, angle, polar, mod, onArc, segmentDistance } from "./geometry.js";
import { segments } from "./entity-geometry.js";
import { clone, uid } from "./values.js";
const EPS = 1e-7,
  TAU = Math.PI * 2;
const dot = (a, b) => a.x * b.x + a.y * b.y;
const cross = (a, b) => a.x * b.y - a.y * b.x;
const clamp = (x) => Math.max(0, Math.min(1, x));
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
function pathData(e) {
  let total = 0;
  const edges = segments(e).map(([a, b]) => {
    const start = total,
      length = dist(a, b);
    total += length;
    return { a, b, start, length, type: "segment" };
  });
  return { edges, total };
}
function nearestPosition(edges, p) {
  let best = Infinity,
    result = 0;
  for (const e of edges) {
    const d = segmentDistance(p, e.a, e.b);
    if (d < best) {
      best = d;
      result =
        e.start +
        clamp(dot(sub(p, e.a), sub(e.b, e.a)) / (e.length * e.length)) *
          e.length;
    }
  }
  return result;
}
function subpath(edges, from, to) {
  const points = [];
  for (const edge of edges) {
    const lo = Math.max(from, edge.start),
      hi = Math.min(to, edge.start + edge.length);
    if (hi - lo <= EPS) continue;
    const a = add(
      edge.a,
      mul(sub(edge.b, edge.a), (lo - edge.start) / edge.length),
    );
    const b = add(
      edge.a,
      mul(sub(edge.b, edge.a), (hi - edge.start) / edge.length),
    );
    if (!points.length || dist(points.at(-1), a) > EPS) points.push(a);
    points.push(b);
  }
  return points;
}
export function trimExtend(e, boundaries, p, mode) {
  if (e && hasBulges(e))
    throw Error("Dela upp bågpolylinjen med X före TRIM/EXTEND.");
  if (!e || !["line", "polyline", "arc"].includes(e.type))
    throw Error("Välj en linje, båge eller rak polylinje.");
  const limits = boundaries.filter((b) => b.id !== e.id).flatMap(shapes);
  if (!limits.length)
    throw Error("Välj en annan gräns än objektet som ska ändras.");
  const result = clone(e);
  if (mode === "EXTEND") {
    if (e.type === "polyline" && e.closed)
      throw Error("En sluten polylinje kan inte förlängas.");
    if (e.type === "arc") {
      const endPoint = polar(e.center, e.radius, e.start + e.sweep);
      const first =
        dist(p, polar(e.center, e.radius, e.start)) < dist(p, endPoint);
      const endpoint = first ? e.start : e.start + e.sweep,
        sign = Math.sign(e.sweep) * (first ? -1 : 1);
      const amounts = limits
        .flatMap((b) => intersections({ ...e, type: "circle" }, b))
        .map((q) => mod(sign * (angle(e.center, q) - endpoint)))
        .filter((t) => t > EPS && t < TAU - Math.abs(e.sweep) - EPS)
        .sort((a, b) => a - b);
      if (!amounts.length)
        throw Error("Ingen gräns i förlängningens riktning.");
      if (first) result.start -= Math.sign(e.sweep) * amounts[0];
      result.sweep += Math.sign(e.sweep) * amounts[0];
    } else {
      const pts = result.points,
        first = dist(p, pts[0]) < dist(p, pts.at(-1));
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
  if (e.type === "arc") {
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
        for (const q of intersections(edge, b)) {
          const t =
            dot(sub(q, edge.a), sub(edge.b, edge.a)) /
            (edge.length * edge.length);
          if (t >= -EPS && t <= 1 + EPS)
            cuts.push(edge.start + clamp(t) * edge.length);
        }
    cuts = cuts.filter((t) => e.closed || (t > EPS && t < total - EPS));
  }
  cuts = cuts
    .sort((a, b) => a - b)
    .filter((v, i, a) => !i || v - a[i - 1] > EPS);
  if (!cuts.length) throw Error("Ingen skärning med valda gränser.");
  let ranges;
  if (e.closed) {
    cuts = cuts
      .map((t) => (Math.abs(t - total) < EPS ? 0 : t))
      .sort((a, b) => a - b)
      .filter((v, i, a) => !i || v - a[i - 1] > EPS);
    if (cuts.length < 2)
      throw Error("En sluten polylinje behöver två skärningar.");
    const lo = cuts.findLast((t) => t <= position) ?? cuts.at(-1) - total;
    const hi = cuts.find((t) => t > position) ?? cuts[0] + total;
    const start = ((hi % total) + total) % total,
      end = ((lo % total) + total) % total;
    const points =
      start < end
        ? subpath(edges, start, end)
        : [...subpath(edges, start, total), ...subpath(edges, 0, end)];
    const clean = points.filter((q, i) => !i || dist(q, points[i - 1]) > EPS);
    return [{ ...result, points: clean, closed: false }];
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
      : { ...result, id: i ? uid() : e.id, points: subpath(edges, a, b) },
  );
}
