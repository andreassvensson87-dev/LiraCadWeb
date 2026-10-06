import { viewportEntities } from "./annotation-context.js";
import { textLayout, textEmSize, fontFamily } from "./text.js";
import { cadFontSvgStyle, usesIsoFont } from "./cad-fonts.js";
import { hatchSegments } from "./hatch-pattern.js";
import { linePattern } from "./linetypes.js";
import { blockParts } from "./blocks.js";
import { polylineParts, hasBulges } from "./polyline.js";
import { dimensionParts } from "./dimensions.js";
import { pointsOf } from "./entity-geometry.js";
import { polar, angle } from "./geometry.js";
import { spaceOf,viewportHasGeometry } from "./layout.js";
import { paperColor,paperLineWeight } from "./plot-style.js";
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
  let isoFont = false;
  const entity = (e,plotScale=1) => {
    const layer = doc.layers.find((l) => l.id === e.layer);
    if (e.hidden || layer?.visible === false || layer?.plot===false) return "";
    if (e.type === "block") return blockParts(e).map(p=>entity(p,plotScale)).join("");
    if (hasBulges(e)) return polylineParts(e).map(p=>entity(p,plotScale)).join("");
    if (e.type === "dimension") return dimensionParts(e).map(p=>entity(p,plotScale)).join("");
    const color = paperColor(e,layer,layout.monochrome);
    const dash = linePattern(e, layer).map(Math.abs).join(" ");
    const stroke = `${dash ? `stroke-dasharray="${dash}" ` : ""}stroke="${escape(color)}" stroke-width="${paperLineWeight(e,layer)/plotScale}" fill="none"`;
    if (e.type === "text") {
      const l = textLayout(e);
      isoFont ||= l.lines.some(line => line.runs.some(usesIsoFont));
      return `<g transform="translate(${e.point.x} ${e.point.y}) rotate(${((e.rotation || 0) * 180) / Math.PI}) scale(${l.fit * (e.textMirrorX ? -1 : 1)} ${e.textMirrorY ? 1 : -1})">${l.lines.flatMap(line => line.runs.map(run => `<text transform="translate(${l.x + line.x + run.x} ${l.y + line.y}) matrix(${run.widthFactor || 1} 0 ${-Math.tan(run.oblique || 0)} 1 0 0)" fill="${escape(paperColor({color:run.color||color,cadColor7:run.cadColor7},layer,layout.monochrome))}" font-family="${escape(fontFamily(run))}" font-size="${textEmSize(run, run.height)}" font-weight="${run.bold ? "bold" : "normal"}" font-style="${run.italic ? "italic" : "normal"}" text-decoration="${run.underline ? "underline" : "none"}" xml:space="preserve">${run.glyphs ? run.glyphs.map(g => `<tspan x="${g.x}">${escape(g.text)}</tspan>`).join("") : escape(run.text)}</text>`)).join("")}</g>`;
    }
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
        b = polar(a, (e.arrowSize ?? h * 0.75), r - 0.32),
        c = polar(a, (e.arrowSize ?? h * 0.75), r + 0.32);
      return (
        entity({ ...e, type: "polyline" },plotScale) +
        entity({
          ...e,
          type: "text",
          point: {
            x: e.points.at(-1).x + h / 3,
            y: e.points.at(-1).y + (h * 7) / 24,
          },
          rotation: 0,
        },plotScale) +
        `<path d="M ${a.x} ${a.y} L ${b.x} ${b.y} L ${c.x} ${c.y} Z" fill="${escape(color)}"/>`
      );
    }
    const pts = pointsOf(e);
    if (!pts.length) return "";
    const path = (e.holes?.length ? [pts, ...e.holes] : [pts]).map(pts => `M ${pts.map((p) => `${p.x} ${p.y}`).join(" L ")}${e.closed || e.type === "hatch" ? " Z" : ""}`).join(" ");
    if (e.type === "hatch") {
      if (e.solid) return `<path d="${path}" fill="${escape(color)}" fill-rule="evenodd"/>`;
      const id = `h${serial++}`;
      defs.push(`<clipPath id="${id}"><path d="${path}" clip-rule="evenodd"/></clipPath>`);
      const lines=hatchSegments(e).map(([a,b])=>`M ${a.x} ${a.y} L ${b.x} ${b.y}`).join(" ");
      return `<path clip-path="url(#${id})" d="${lines}" ${stroke.replace(/stroke-dasharray="[^"]*" /,"")} stroke-linecap="round"/>`;
    }
    return `<path d="${path}" ${stroke}/>`;
  };
  const modelEntities = doc.entities
    .filter((e) => spaceOf(e) === "model");
  const viewports = doc.entities
    .filter(
      (e) =>
        e.type === "viewport" && !e.hidden &&
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
      return `<g clip-path="url(#${id})"><g transform="translate(${x + w / 2} ${y + h / 2}) scale(${v.viewScale}) rotate(${-(v.viewRotation || 0) * 180 / Math.PI}) translate(${-v.viewCenter.x} ${-v.viewCenter.y})">${viewportEntities(modelEntities,v,doc.layers).filter(e=>viewportHasGeometry(v,[e])).map(e=>entity(e,v.viewScale)).join("")}</g></g>`;
    })
    .join("");
  const paper = doc.entities
    .filter((e) => spaceOf(e) === layout.id && e.type !== "viewport")
    .map(e=>entity(e))
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${layout.width}mm" height="${layout.height}mm" viewBox="0 0 ${layout.width} ${layout.height}"><title>${escape(layout.name)}</title><defs>${isoFont ? cadFontSvgStyle() : ""}${defs.join("")}</defs><rect width="100%" height="100%" fill="white"/><g transform="translate(0 ${layout.height}) scale(1 -1)">${viewports}${paper}</g></svg>`;
}
