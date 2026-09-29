import { dimensionParts } from "./dimensions.js";
import { pointsOf, polar, angle } from "./core.js";
import { spaceOf } from "./layout.js";
const escape = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[c],
  );
export function layoutSVG(doc, layout) {
  let serial = 0;
  const defs = [];
  const entity = (e) => {
    const layer = doc.layers.find((l) => l.id === e.layer);
    if (layer?.visible === false) return "";
    if (e.type === "dimension") return dimensionParts(e).map(entity).join("");
    const color = e.color || "#253b31";
    const stroke = `stroke="${escape(color)}" stroke-width="0.2" vector-effect="non-scaling-stroke" fill="none"`;
    if (e.type === "text")
      return `<g transform="translate(${e.point.x} ${e.point.y}) rotate(${((e.rotation || 0) * 180) / Math.PI}) scale(1 -1)"><text fill="${escape(color)}" font-family="${escape(e.font || "Arial")}" font-size="${e.height}" font-weight="${e.bold ? "bold" : "normal"}" font-style="${e.italic ? "italic" : "normal"}" text-decoration="${e.underline ? "underline" : "none"}">${e.text
        .split("\n")
        .map(
          (s, i) =>
            `<tspan x="0" y="${i * e.height * 1.4}">${escape(s)}</tspan>`,
        )
        .join("")}</text></g>`;
    if (e.type === "circle")
      return `<circle cx="${e.center.x}" cy="${e.center.y}" r="${e.radius}" ${stroke}/>`;
    if (e.type === "arc" && Math.abs(e.sweep) < Math.PI * 2 - 1e-8) {
      const a = polar(e.center, e.radius, e.start),
        b = polar(e.center, e.radius, e.start + e.sweep);
      return `<path d="M ${a.x} ${a.y} A ${e.radius} ${e.radius} 0 ${Math.abs(e.sweep) > Math.PI ? 1 : 0} ${e.sweep > 0 ? 1 : 0} ${b.x} ${b.y}" ${stroke}/>`;
    }
    if (e.type === "leader") {
      const h = e.height || 120,
        a = e.points[0],
        r = angle(a, e.points[1]),
        b = polar(a, h * 0.75, r - 0.32),
        c = polar(a, h * 0.75, r + 0.32);
      return (
        entity({ ...e, type: "polyline" }) +
        entity({
          ...e,
          type: "text",
          point: {
            x: e.points.at(-1).x + h / 3,
            y: e.points.at(-1).y + (h * 7) / 24,
          },
          rotation: 0,
        }) +
        `<path d="M ${a.x} ${a.y} L ${b.x} ${b.y} L ${c.x} ${c.y} Z" fill="${escape(color)}"/>`
      );
    }
    const pts = pointsOf(e);
    if (!pts.length) return "";
    const path = `M ${pts.map((p) => `${p.x} ${p.y}`).join(" L ")}${e.closed || e.type === "hatch" ? " Z" : ""}`;
    if (e.type === "hatch") {
      const id = `h${serial++}`,
        step = e.spacing;
      defs.push(
        `<pattern id="${id}" width="${step}" height="${step}" patternUnits="userSpaceOnUse" patternTransform="rotate(${((e.patternAngle ?? Math.PI / 4) * 180) / Math.PI})"><path d="M 0 0 H ${step}" ${stroke}/></pattern>`,
      );
      return `<path d="${path}" ${stroke.replace('fill="none"', `fill="url(#${id})"`)}/>`;
    }
    return `<path d="${path}" ${stroke}/>`;
  };
  const model = doc.entities
    .filter((e) => spaceOf(e) === "model")
    .map(entity)
    .join("");
  const viewports = doc.entities
    .filter(
      (e) =>
        e.type === "viewport" &&
        spaceOf(e) === layout.id &&
        doc.layers.find((l) => l.id === e.layer)?.visible !== false,
    )
    .map((v) => {
      const [a, b] = v.points,
        x = Math.min(a.x, b.x),
        y = Math.min(a.y, b.y),
        w = Math.abs(a.x - b.x),
        h = Math.abs(a.y - b.y),
        id = `v${serial++}`;
      defs.push(
        `<clipPath id="${id}"><rect x="${x}" y="${y}" width="${w}" height="${h}"/></clipPath>`,
      );
      return `<g clip-path="url(#${id})"><g transform="translate(${x + w / 2} ${y + h / 2}) scale(${v.viewScale}) translate(${-v.viewCenter.x} ${-v.viewCenter.y})">${model}</g></g>`;
    })
    .join("");
  const paper = doc.entities
    .filter((e) => spaceOf(e) === layout.id && e.type !== "viewport")
    .map(entity)
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${layout.width}mm" height="${layout.height}mm" viewBox="0 0 ${layout.width} ${layout.height}"><title>${escape(layout.name)}</title><defs>${defs.join("")}</defs><rect width="100%" height="100%" fill="white"/><g transform="translate(0 ${layout.height}) scale(1 -1)">${viewports}${paper}</g></svg>`;
}
