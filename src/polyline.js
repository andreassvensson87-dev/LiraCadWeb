import { add, sub, mul, dist, angle, polar } from "./core.js";
export const hasBulges = (e) =>
  e.type === "polyline" && (e.bulges || []).some((b) => Math.abs(b) > 1e-12);
export function polylineParts(e) {
  return Array.from(
    { length: e.points.length - (e.closed ? 0 : 1) },
    (_, i) => {
      const a = e.points[i],
        b = e.points[(i + 1) % e.points.length],
        bulge = e.bulges?.[i] || 0;
      const common = {
        id: e.id,
        layer: e.layer,
        color: e.color,
        lineType: e.lineType,
        space: e.space,
      };
      if (Math.abs(bulge) < 1e-12 || dist(a, b) < 1e-10)
        return { ...common, type: "line", points: [a, b] };
      const v = sub(b, a),
        center = add(
          mul(add(a, b), 0.5),
          mul({ x: -v.y, y: v.x }, (1 - bulge * bulge) / (4 * bulge)),
        );
      return {
        ...common,
        type: "arc",
        center,
        radius: dist(a, center),
        start: angle(center, a),
        sweep: 4 * Math.atan(bulge),
      };
    },
  );
}
export function pathVertices(e) {
  if (e.type === "line")
    return { points: structuredClone(e.points), bulges: [0] };
  if (e.type === "arc")
    return {
      points: [
        polar(e.center, e.radius, e.start),
        polar(e.center, e.radius, e.start + e.sweep),
      ],
      bulges: [Math.tan(e.sweep / 4)],
    };
  return {
    points: structuredClone(e.points),
    bulges: e.points.slice(1).map((_, i) => e.bulges?.[i] || 0),
  };
}
export function reversePath(path) {
  return {
    points: path.points.slice().reverse(),
    bulges: path.bulges
      .slice()
      .reverse()
      .map((b) => -b),
  };
}
