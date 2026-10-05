import {
  polylineParts,
  hasBulges,
  pathVertices,
  reversePath,
} from "./polyline.js";
import {
  add,
  sub,
  mul,
  dist,
  angle,
  polar,
  mod,
  segmentDistance,
  inside,
  intersection,
} from "./geometry.js";
import { clone, uid } from "./values.js";
const cross = (a, b) => a.x * b.y - a.y * b.x;
export function infiniteIntersection(a, b, c, d) {
  const v = sub(b, a),
    w = sub(d, c),
    den = cross(v, w);
  if (Math.abs(den) < 1e-10 * Math.max(1, dist(a, b) * dist(c, d))) return null;
  return add(a, mul(v, cross(sub(c, a), w) / den));
}
export function polylineOffset(e, d, p) {
  if (hasBulges(e)) return null;
  const pts = e.points,
    count = pts.length - (e.closed ? 0 : 1);
  if (!(d > 0) || count < 1) return null;
  const edges = Array.from({ length: count }, (_, i) => [
    pts[i],
    pts[(i + 1) % pts.length],
  ]);
  if (edges.some(([a, b]) => dist(a, b) < 1e-8)) return null;
  const nearest = edges.reduce(
    (best, edge) =>
      segmentDistance(p, ...edge) < segmentDistance(p, ...best) ? edge : best,
    edges[0],
  );
  let side =
    cross(sub(nearest[1], nearest[0]), sub(p, nearest[0])) >= 0 ? 1 : -1;
  const area = pts.reduce(
    (sum, a, i) => sum + cross(a, pts[(i + 1) % pts.length]),
    0,
  );
  if (e.closed) side = (inside(p, pts) ? 1 : -1) * (area > 0 ? 1 : -1);
  const shifted = edges.map(([a, b]) => {
    const v = sub(b, a),
      n = mul({ x: -v.y, y: v.x }, (d * side) / dist(a, b));
    return [add(a, n), add(b, n)];
  });
  const result = [];
  for (let i = 0; i < pts.length; i++) {
    if (!e.closed && i === 0) {
      result.push(shifted[0][0]);
      continue;
    }
    if (!e.closed && i === pts.length - 1) {
      result.push(shifted.at(-1)[1]);
      continue;
    }
    const prev = shifted[(i - 1 + count) % count],
      next = shifted[i % count];
    const hit = infiniteIntersection(...prev, ...next);
    if (hit) {
      if (dist(hit, pts[i]) > d * 1000) return null;
      result.push(hit);
    } else if (dist(prev[1], next[0]) < 1e-6) result.push(next[0]);
    else return null;
  }
  // Reject collapsed/reversed edges and self-crossing contours instead of corrupting the drawing.
  for (let i = 0; i < count; i++) {
    const v = sub(result[(i + 1) % result.length], result[i]),
      old = sub(...[edges[i][1], edges[i][0]]);
    if (v.x * old.x + v.y * old.y <= 1e-8) return null;
    for (let j = i + 2; j < count; j++) {
      if (e.closed && i === 0 && j === count - 1) continue;
      if (
        intersection(
          result[i],
          result[(i + 1) % result.length],
          result[j],
          result[(j + 1) % result.length],
        )
      )
        return null;
    }
  }
  return { ...clone(e), id: uid(), points: result };
}
export function joinEntities(entities, tolerance = 1e-6) {
  if (
    entities.length < 2 ||
    entities.some(
      (e) =>
        !["line", "polyline", "arc"].includes(e.type) ||
        e.closed ||
        (e.type === "arc" && Math.abs(e.sweep) >= Math.PI * 2 - 1e-8),
    )
  )
    throw Error("Välj öppna linjer, bågar eller polylinjer.");
  if (
    entities.some(
      (e) => (e.space || "model") !== (entities[0].space || "model"),
    )
  )
    throw Error("Objekten måste finnas i samma utrymme.");
  let path = pathVertices(entities[0]);
  const remaining = entities.slice(1).map(pathVertices);
  while (remaining.length) {
    let found = false;
    for (let i = 0; i < remaining.length; i++) {
      let q = remaining[i];
      if (dist(path.points.at(-1), q.points[0]) <= tolerance) {
      } else if (dist(path.points.at(-1), q.points.at(-1)) <= tolerance)
        q = reversePath(q);
      else if (dist(path.points[0], q.points.at(-1)) <= tolerance) {
        path = {
          points: [...q.points.slice(0, -1), ...path.points],
          bulges: [...q.bulges, ...path.bulges],
        };
        remaining.splice(i, 1);
        found = true;
        break;
      } else if (dist(path.points[0], q.points[0]) <= tolerance) {
        q = reversePath(q);
        path = {
          points: [...q.points.slice(0, -1), ...path.points],
          bulges: [...q.bulges, ...path.bulges],
        };
        remaining.splice(i, 1);
        found = true;
        break;
      } else continue;
      path.points.push(...q.points.slice(1));
      path.bulges.push(...q.bulges);
      remaining.splice(i, 1);
      found = true;
      break;
    }
    if (!found)
      throw Error("Ändpunkterna måste mötas i en sammanhängande kedja.");
  }
  const closed = dist(path.points[0], path.points.at(-1)) <= tolerance;
  if (closed) path.points.pop();
  if (path.points.length < 2) throw Error("Konturen är för kort.");
  return {
    id: uid(),
    layer: entities[0].layer,
    color: entities[0].color,
    lineType: entities[0].lineType,
    space: entities[0].space,
    type: "polyline",
    closed,
    ...path,
  };
}
export function explodePolyline(e) {
  if (e.type !== "polyline") throw Error("Välj polylinjer, block eller mått.");
  return polylineParts(e).map((part) => ({ ...part, id: uid() }));
}
export function insertVertex(e, p) {
  if (hasBulges(e))
    throw Error("Dela upp polylinjen med X före hörnredigering av bågsegment.");
  const n = clone(e);
  let best = Infinity,
    index = 0;
  for (let i = 0; i < n.points.length - (n.closed ? 0 : 1); i++) {
    const d = segmentDistance(
      p,
      n.points[i],
      n.points[(i + 1) % n.points.length],
    );
    if (d < best) {
      best = d;
      index = i;
    }
  }
  if (n.points.some((q) => dist(p, q) < 1e-8))
    throw Error("Punkten sammanfaller med ett befintligt hörn.");
  delete n.bulges;
  n.points.splice(index + 1, 0, p);
  return n;
}
export function removeVertex(e, p) {
  if (hasBulges(e))
    throw Error("Dela upp polylinjen med X före hörnredigering av bågsegment.");
  if (e.points.length <= (e.closed ? 3 : 2))
    throw Error("Konturen behöver fler hörn för att ta bort ett.");
  const n = clone(e),
    i = n.points.reduce(
      (best, q, j) => (dist(p, q) < dist(p, n.points[best]) ? j : best),
      0,
    );
  delete n.bulges;
  n.points.splice(i, 1);
  return n;
}
export function corner(
  e1,
  e2,
  kind,
  size,
  size2 = size,
  pick1 = null,
  pick2 = null,
) {
  if (e1.type !== "line" || e2.type !== "line" || e1.id === e2.id)
    throw Error("Välj två olika raka linjer.");
  if (size < 0 || size2 < 0 || !Number.isFinite(size + size2))
    throw Error("Ange ett mått som är noll eller positivt.");
  const v = infiniteIntersection(...e1.points, ...e2.points);
  if (!v) throw Error("Linjerna är parallella.");
  const ray = (e, pick) => {
    let i = dist(e.points[0], v) > dist(e.points[1], v) ? 0 : 1;
    if (pick && dist(pick, v) > 1e-6) {
      const dir = sub(pick, v);
      i = e.points.reduce((best, q, j) => {
        const a = sub(q, v),
          b = sub(e.points[best], v);
        return a.x * dir.x + a.y * dir.y > b.x * dir.x + b.y * dir.y ? j : best;
      }, 0);
    }
    const length = dist(e.points[i], v);
    if (length < 1e-8) throw Error("Linjen saknar längd.");
    return { i, unit: mul(sub(e.points[i], v), 1 / length), length };
  };
  const a = ray(e1, pick1),
    b = ray(e2, pick2),
    theta = Math.acos(
      Math.max(-1, Math.min(1, a.unit.x * b.unit.x + a.unit.y * b.unit.y)),
    );
  if (theta < 1e-6 || Math.PI - theta < 1e-6)
    throw Error("Hörnvinkeln är ogiltig.");
  const t1 = kind === "FILLET" ? size / Math.tan(theta / 2) : size,
    t2 = kind === "FILLET" ? t1 : size2;
  if (t1 >= a.length - 1e-8 || t2 >= b.length - 1e-8)
    throw Error("Måttet är för stort för linjerna.");
  const q1 = add(v, mul(a.unit, t1)),
    q2 = add(v, mul(b.unit, t2));
  const n1 = clone(e1),
    n2 = clone(e2);
  n1.points[1 - a.i] = q1;
  n2.points[1 - b.i] = q2;
  let bridge = null;
  if (kind === "FILLET" && size > 1e-8) {
    const bisector = add(a.unit, b.unit),
      center = add(
        v,
        mul(
          bisector,
          size / Math.sin(theta / 2) / Math.hypot(bisector.x, bisector.y),
        ),
      );
    const start = angle(center, q1);
    let sweep = mod(angle(center, q2) - start);
    if (sweep > Math.PI) sweep -= Math.PI * 2;
    bridge = {
      id: uid(),
      type: "arc",
      layer: e1.layer,
      color: e1.color,
      space: e1.space,
      center,
      radius: size,
      start,
      sweep,
    };
  } else if (dist(q1, q2) > 1e-8)
    bridge = { ...clone(e1), id: uid(), points: [q1, q2] };
  return { updated: [n1, n2], bridge };
}
