import {
  TAU,
  add,
  sub,
  mul,
  dist,
  angle,
  polar,
  onArc,
  segmentDistance,
  inside,
  intersection,
} from "./geometry.js";
import { blockParts } from "./blocks.js";
import { polylineParts, hasBulges } from "./polyline.js";
import { dimensionParts } from "./dimensions.js";
import { textLayout } from "./text.js";

// Derived geometry for drawing, selection and snapping. Never changes entities.
export function pointsOf(e) {
  if (e.type === "block") return blockParts(e).filter(p => !p.hidden).flatMap(pointsOf);
  if (hasBulges(e)) return polylineParts(e).flatMap(pointsOf);
  if (e.type === "dimension") return dimensionParts(e).flatMap(pointsOf);
  if (e.type === "viewport") {
    const [a, b] = e.points;
    return [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }];
  }
  if (e.type === "circle")
    return Array.from({ length: 96 }, (_, i) =>
      polar(e.center, e.radius, (i * TAU) / 96),
    );
  if (e.type === "arc") {
    const steps = Math.max(12, Math.ceil(Math.abs(e.sweep) * 24));
    return Array.from({ length: steps + 1 }, (_, i) =>
      polar(e.center, e.radius, e.start + (e.sweep * i) / steps),
    );
  }
  if (e.type === "text") {
    const layout = textLayout(e), x = layout.x * layout.fit, w = layout.width;
    const skew = Math.tan(e.oblique || 0) * (layout.bottom - layout.top);
    return [
      { x: x - Math.abs(skew), y: -layout.bottom },
      { x: x + w + Math.abs(skew), y: -layout.bottom },
      { x: x + w + Math.abs(skew), y: -layout.top },
      { x: x - Math.abs(skew), y: -layout.top },
    ].map((p) =>
      add(e.point, {
        x: p.x * (e.textMirrorX ? -1 : 1) * Math.cos(e.rotation || 0) - p.y * (e.textMirrorY ? -1 : 1) * Math.sin(e.rotation || 0),
        y: p.x * (e.textMirrorX ? -1 : 1) * Math.sin(e.rotation || 0) + p.y * (e.textMirrorY ? -1 : 1) * Math.cos(e.rotation || 0),
      }),
    );
  }
  return e.points || [];
}
export function drawingBounds(entities) {
  const result = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const entity of entities) {
    const b = bounds(entity);
    result.minX = Math.min(result.minX, b.minX);
    result.minY = Math.min(result.minY, b.minY);
    result.maxX = Math.max(result.maxX, b.maxX);
    result.maxY = Math.max(result.maxY, b.maxY);
  }
  return result;
}
export function bounds(e) {
  if (e.type === "block" || hasBulges(e)) {
    const bs = (e.type === "block" ? blockParts(e) : polylineParts(e)).map(
      bounds,
    );
    return {
      minX: Math.min(...bs.map((b) => b.minX)),
      minY: Math.min(...bs.map((b) => b.minY)),
      maxX: Math.max(...bs.map((b) => b.maxX)),
      maxY: Math.max(...bs.map((b) => b.maxY)),
    };
  }
  let p = e.type === "circle" || e.type === "arc" ? [] : e.type === "hatch" ? [e.points, ...(e.holes || [])].flat() : pointsOf(e);
  if (e.type === "circle")
    p = [
      sub(e.center, { x: e.radius, y: e.radius }),
      add(e.center, { x: e.radius, y: e.radius }),
    ];
  if (e.type === "arc")
    p = [
      polar(e.center, e.radius, e.start),
      polar(e.center, e.radius, e.start + e.sweep),
      ...[0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]
        .filter((a) => onArc(e, a))
        .map((a) => polar(e.center, e.radius, a)),
    ];
  if (e.type === "leader" && e.text) {
    const end = e.points.at(-1);
    p = [
      ...p,
      ...pointsOf({
        ...e,
        type: "text",
        point: add(end, {
          x: (e.height || 120) / 3,
          y: ((e.height || 120) * 7) / 24,
        }),
        text: e.text,
        height: e.height || 120,
      }),
    ];
  }
  return {
    minX: Math.min(...p.map((q) => q.x)),
    minY: Math.min(...p.map((q) => q.y)),
    maxX: Math.max(...p.map((q) => q.x)),
    maxY: Math.max(...p.map((q) => q.y)),
  };
}
export function hitDistance(e, p) {
  if (e.type === "block" || hasBulges(e))
    return Math.min(
      ...(e.type === "block" ? blockParts(e) : polylineParts(e)).map((part) =>
        hitDistance(part, p),
      ),
    );
  if (e.type === "dimension")
    return Math.min(...dimensionParts(e).map((part) => hitDistance(part, p)));
  if (e.type === "circle") return Math.abs(dist(p, e.center) - e.radius);
  if (e.type === "arc")
    return onArc(e, angle(e.center, p))
      ? Math.abs(dist(p, e.center) - e.radius)
      : Math.min(
          dist(p, polar(e.center, e.radius, e.start)),
          dist(p, polar(e.center, e.radius, e.start + e.sweep)),
        );
  const pts = pointsOf(e),
    closed =
      e.type === "hatch" ||
      e.type === "text" ||
      e.type === "viewport" ||
      e.closed;
  if (e.type === "text" && inside(p, pts)) return 0;
  if (e.type === "hatch" && [pts, ...(e.holes || [])].reduce((contains, loop) => inside(p, loop) ? !contains : contains, false)) return 0;
  let d = Infinity;
  for (const loop of e.holes || []) for (let i = 0; i < loop.length; i++) d = Math.min(d, segmentDistance(p, loop[i], loop[(i + 1) % loop.length]));
  for (let i = 1; i < pts.length; i++)
    d = Math.min(d, segmentDistance(p, pts[i - 1], pts[i]));
  if (closed && pts.length)
    d = Math.min(d, segmentDistance(p, pts.at(-1), pts[0]));
  if (e.type === "leader" && e.text)
    d = Math.min(
      d,
      hitDistance(
        {
          type: "text",
          point: add(e.points.at(-1), {
            x: (e.height || 120) / 3,
            y: ((e.height || 120) * 7) / 24,
          }),
          text: e.text,
          height: e.height || 120,
        },
        p,
      ),
    );
  return d;
}
export function segments(e) {
  if (e.type === "block") return blockParts(e).flatMap(segments);
  if (hasBulges(e)) return polylineParts(e).flatMap(segments);
  if (e.type === "dimension") return dimensionParts(e).flatMap(segments);
  const p = pointsOf(e),
    s = [];
  for (let i = 1; i < p.length; i++) s.push([p[i - 1], p[i]]);
  if (e.closed || ["circle", "hatch", "text", "viewport"].includes(e.type))
    s.push([p.at(-1), p[0]]);
  return s;
}
export function rectSelect(e, r, crossing) {
  const b = bounds(e);
  if (!crossing)
    return (
      b.minX >= r.minX &&
      b.maxX <= r.maxX &&
      b.minY >= r.minY &&
      b.maxY <= r.maxY
    );
  if (b.maxX < r.minX || b.minX > r.maxX || b.maxY < r.minY || b.minY > r.maxY)
    return false;
  const p = [
    { x: r.minX, y: r.minY },
    { x: r.maxX, y: r.minY },
    { x: r.maxX, y: r.maxY },
    { x: r.minX, y: r.maxY },
  ];
  if (
    pointsOf(e).some(
      (q) => q.x >= r.minX && q.x <= r.maxX && q.y >= r.minY && q.y <= r.maxY,
    )
  )
    return true;
  if (["hatch", "text"].includes(e.type) && inside(p[0], pointsOf(e)))
    return true;
  return segments(e).some(([a, b]) =>
    p.some((c, i) => intersection(a, b, c, p[(i + 1) % 4])),
  );
}
export function snapPoints(e) {
  if (e.type === "block")
    return [
      { p: e.point, kind: "Insättning" },
      ...blockParts(e).flatMap(snapPoints),
    ];
  if (hasBulges(e)) return polylineParts(e).flatMap(snapPoints);
  if (e.type === "dimension")
    return e.points.map((p) => ({ p, kind: "Måttpunkt" }));
  if (e.type === "viewport")
    return pointsOf(e).map((p) => ({ p, kind: "Ändpunkt" }));
  if (e.type === "circle")
    return [
      { p: e.center, kind: "Centrum" },
      ...[0, Math.PI / 2, Math.PI, Math.PI * 1.5].map((a) => ({
        p: polar(e.center, e.radius, a),
        kind: "Kvadrant",
      })),
    ];
  if (e.type === "arc")
    return [
      { p: e.center, kind: "Centrum" },
      { p: polar(e.center, e.radius, e.start), kind: "Ändpunkt" },
      { p: polar(e.center, e.radius, e.start + e.sweep), kind: "Ändpunkt" },
      {
        p: polar(e.center, e.radius, e.start + e.sweep / 2),
        kind: "Mittpunkt",
      },
    ];
  if (e.type === "text") return [{ p: e.point, kind: "Insättning" }];
  return [
    ...e.points.map((p) => ({ p, kind: "Ändpunkt" })),
    ...segments(e).map(([a, b]) => ({
      p: mul(add(a, b), 0.5),
      kind: "Mittpunkt",
    })),
  ];
}
