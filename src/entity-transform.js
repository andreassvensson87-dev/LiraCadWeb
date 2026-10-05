import { add, sub, mul, dist, angle, polar } from "./geometry.js";
import { clone } from "./values.js";

// Pure entity transformations. Stable IDs and style are preserved.
export function transform(
  e,
  fn,
  { scale = 1, rotation = 0, mirror = false } = {},
) {
  const n = clone(e);
  if (n.points) n.points = n.points.map(fn);
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
  if (n.spacing) n.spacing *= Math.abs(scale);
  if (n.type === "hatch")
    n.patternAngle = mirror
      ? rotation - (n.patternAngle ?? Math.PI / 4)
      : (n.patternAngle ?? Math.PI / 4) + rotation;
  if (n.type === "arc") {
    const end = fn(polar(e.center, e.radius, e.start));
    n.start = angle(n.center, end);
    if (mirror) n.sweep = -n.sweep;
  }
  if (n.type === "text")
    n.rotation = mirror
      ? rotation - (n.rotation || 0)
      : (n.rotation || 0) + rotation;
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
