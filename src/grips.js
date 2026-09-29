import { clone, polar, dist, arcThrough } from "./core.js";

export function grips(e) {
  if (
    ["line", "polyline", "hatch", "leader", "dimension", "viewport"].includes(
      e.type,
    )
  )
    return e.points.map((p, i) => ({ p, i, kind: "point" }));
  if (e.type === "text") return [{ p: e.point, kind: "text" }];
  if (e.type === "circle")
    return [
      { p: e.center, kind: "center" },
      ...[0, 1, 2, 3].map((i) => ({
        p: polar(e.center, e.radius, (i * Math.PI) / 2),
        kind: "radius",
      })),
    ];
  if (e.type === "arc")
    return [
      { p: e.center, kind: "center" },
      ...[0, 0.5, 1].map((t, i) => ({
        p: polar(e.center, e.radius, e.start + e.sweep * t),
        i,
        kind: "arc",
      })),
    ];
  return [];
}

export function gripEntity(e, g, p) {
  const n = clone(e);
  if (g.kind === "point") {
    n.points[g.i] = p;
    if (e.type === "viewport") {
      // Keep the model-to-paper mapping fixed while moving a clipping edge.
      n.viewCenter = {
        x: e.viewCenter.x + (p.x - e.points[g.i].x) / (2 * e.viewScale),
        y: e.viewCenter.y + (p.y - e.points[g.i].y) / (2 * e.viewScale),
      };
    }
  }
  if (g.kind === "center") n.center = p;
  if (g.kind === "radius") n.radius = Math.max(0.001, dist(n.center, p));
  if (g.kind === "text") n.point = p;
  if (g.kind === "arc") {
    const points = [0, 0.5, 1].map((t) =>
      polar(e.center, e.radius, e.start + e.sweep * t),
    );
    points[g.i] = p;
    const arc = arcThrough(...points);
    if (arc) Object.assign(n, arc);
  }
  return n;
}
