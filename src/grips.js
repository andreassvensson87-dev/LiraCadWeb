import { parameterGrips, moveParameterGrip } from "./parametric-blocks.js";
import { bounds } from "./entity-geometry.js";
import { polylineParts, hasBulges } from "./polyline.js";
import { clone } from "./values.js";
import { polar, dist, arcThrough } from "./geometry.js";
import { textLayout, textAlignment, applyTextProperty } from "./text.js";

export function grips(e) {
  if (hasBulges(e))
    return [
      ...e.points.map((p, i) => ({ p, i, kind: "point" })),
      ...polylineParts(e).flatMap((part, i) =>
        part.type === "arc"
          ? [
              {
                p: polar(part.center, part.radius, part.start + part.sweep / 2),
                i,
                kind: "bulge",
              },
            ]
          : [],
      ),
    ];
  if (
    ["line", "polyline", "hatch", "leader", "dimension", "viewport"].includes(
      e.type,
    )
  )
    return e.points.map((p, i) => ({ p, i, kind: "point" }));
  if (e.type === "text") {
    if (e.attributeTag) return [{ p: e.point, kind: "text" }];
    const l = textLayout({ ...e, height: e.height || 120 }), align = textAlignment(e);
    const x = (align === "right" ? l.x : l.x + l.width / l.fit) * l.fit * (e.textMirrorX ? -1 : 1);
    const y = -(l.top + l.bottom) / 2 * (e.textMirrorY ? -1 : 1), r = e.rotation || 0;
    return [{ p: e.point, kind: "text" }, { p: { x: e.point.x + x * Math.cos(r) - y * Math.sin(r), y: e.point.y + x * Math.sin(r) + y * Math.cos(r) }, kind: "textWidth" }];
  }
  if (e.type === "block") {
    const b=bounds(e),center={x:(b.minX+b.maxX)/2,y:(b.minY+b.maxY)/2};
    const parameters=parameterGrips(e);
    return [{p:e.point,kind:'text'},...(dist(center,e.point)>1e-7&&!parameters.some(g=>dist(g.p,center)<1e-7)?[{p:center,kind:'blockMove'}]:[]),...parameters];
  }
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
  if(g.kind==='blockMove')return {...clone(e),point:{x:e.point.x+p.x-g.p.x,y:e.point.y+p.y-g.p.y}};
  if (g.kind === "blockStretch") {try{return moveParameterGrip(e,g.parameterId,p);}catch{return e;}}
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
  if (g.kind === "bulge") {
    const arc = arcThrough(
      e.points[g.i],
      p,
      e.points[(g.i + 1) % e.points.length],
    );
    n.bulges ||= [];
    n.bulges[g.i] = arc ? Math.tan(arc.sweep / 4) : 0;
  }
  if (g.kind === "center") n.center = p;
  if (g.kind === "radius") n.radius = Math.max(0.001, dist(n.center, p));
  if (g.kind === "text") n.point = p;
  if (g.kind === "textWidth") {
    const r = e.rotation || 0, dx = p.x - e.point.x, dy = p.y - e.point.y;
    const x = (dx * Math.cos(r) + dy * Math.sin(r)) * (e.textMirrorX ? -1 : 1), align = textAlignment(e);
    Object.assign(n,applyTextProperty(n,"textWidth", Math.max(0.01, x * (align === "right" ? -1 : align === "center" ? 2 : 1))));
    delete n.textFitWidth;
  }
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

// Group geometrically coincident grips, not merely nearby screen handles.
export function gripTargets(entities, point) {
  return entities.flatMap((entity) => {
    const matching = grips(entity).filter((g) => dist(g.p, point) < 1e-7);
    return matching.length ? [{ entity: clone(entity), grips: matching }] : [];
  });
}

export function moveGripTargets(targets, point) {
  return targets.map(({ entity, grips: handles }) =>
    handles.reduce(
      (result, handle) => gripEntity(result, handle, point),
      entity,
    ),
  );
}
