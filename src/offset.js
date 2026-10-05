import { add, sub, dist } from "./geometry.js";
import { clone, uid } from "./values.js";
import { polylineOffset } from "./editing.js";

export function offset(e, d, p) {
  if (e.type === "polyline") return polylineOffset(e, d, p);
  const n = clone(e);
  n.id = uid();
  if (["circle", "arc"].includes(e.type)) {
    n.radius = e.radius + (dist(p, e.center) >= e.radius ? d : -d);
    return n.radius > 1e-8 ? n : null;
  }
  if (e.type === "line") {
    const [a, b] = e.points,
      v = sub(b, a),
      l = dist(a, b);
    if (l < 1e-8) return null;
    const side = v.x * (p.y - a.y) - v.y * (p.x - a.x) >= 0 ? 1 : -1;
    n.points = e.points.map((q) =>
      add(q, { x: (-v.y / l) * d * side, y: (v.x / l) * d * side }),
    );
    return n;
  }
  return null;
}
