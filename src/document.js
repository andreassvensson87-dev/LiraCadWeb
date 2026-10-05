import { TAU, dist } from "./geometry.js";
import { validLineType } from "./linetypes.js";
import { validAttributeSchema } from "./attributes.js";
import { validBlockName, validTag } from "./blocks.js";
import { hasBulges } from "./polyline.js";
import { validDimension } from "./dimensions.js";

// Project format validation. Import and editing use the same model contract.
// Leave editing headroom above the largest generated stress drawing (100 000).
export const MAX_DOCUMENT_ENTITIES = 200000;
export function validDocument(d) {
  if (
    !d ||
    d.version !== 1 ||
    !Array.isArray(d.entities) ||
    !Array.isArray(d.layers) ||
    !d.layers.length ||
    d.entities.length > MAX_DOCUMENT_ENTITIES
  )
    return false;
  if (
    d.layouts &&
    (!Array.isArray(d.layouts) ||
      new Set(d.layouts.map((l) => l?.id)).size !== d.layouts.length ||
      d.layouts.some(
        (l) =>
          !l ||
          typeof l.id !== "string" ||
          l.id === "model" ||
          typeof l.name !== "string" ||
          !Number.isFinite(l.width) ||
          !Number.isFinite(l.height) ||
          l.width <= 0 ||
          l.height <= 0,
      ))
  )
    return false;
  if (
    d.blocks != null &&
    (!Array.isArray(d.blocks) ||
      d.blocks.length > 10000 ||
      !validDocument({
        version: 1,
        layers: d.layers,
        entities: d.blocks.map((definition) => ({
          id: definition?.id,
          type: "block",
          layer: d.layers[0]?.id,
          point: { x: 0, y: 0 },
          scale: 1,
          rotation: 0,
          definition,
          values: {},
        })),
      }))
  )
    return false;
  const ids = new Set(),
    ls = new Set();
  for (const l of d.layers) {
    if (
      !l ||
      typeof l.id !== "string" ||
      ls.has(l.id) ||
      typeof l.name !== "string" ||
      !/^#[\da-f]{6}$/i.test(l.color)
    )
      return false;
    if (!validLineType(l.lineType) || l.lineType === "BYLAYER") return false;
    ls.add(l.id);
  }
  const pt = (p) =>
    p &&
    Number.isFinite(p.x) &&
    Number.isFinite(p.y) &&
    Math.abs(p.x) < 1e12 &&
    Math.abs(p.y) < 1e12;
  for (const e of d.entities) {
    if (
      !e ||
      typeof e.id !== "string" ||
      ids.has(e.id) ||
      !ls.has(e.layer) ||
      (e.color != null && !/^#[\da-f]{6}$/i.test(e.color)) ||
      ![
        "line",
        "polyline",
        "circle",
        "arc",
        "text",
        "leader",
        "hatch",
        "dimension",
        "viewport",
        "block",
      ].includes(e.type)
    )
      return false;
    if (!validLineType(e.lineType)) return false;
    ids.add(e.id);
    if (e.type === "block") {
      const def = e.definition;
      if (
        !pt(e.point) ||
        !Number.isFinite(e.rotation || 0) ||
        !Number.isFinite(e.scale) ||
        e.scale <= 0 ||
        !def ||
        typeof def.id !== "string" ||
        !validBlockName(def.name) ||
        !Array.isArray(def.entities) ||
        !def.entities.length ||
        def.entities.length > 10000 ||
        def.entities.some(
          (part) => !part || ["block", "viewport"].includes(part.type),
        ) ||
        !validDocument({
          version: 1,
          layers: d.layers,
          entities: def.entities,
        }) ||
        !e.values ||
        typeof e.values !== "object" ||
        Array.isArray(e.values) ||
        Object.values(e.values).some(
          (v) => typeof v !== "string" || /[\r\n]/.test(v),
        )
      )
        return false;
      const tags = def.entities
        .filter((part) => part.attributeTag)
        .map((part) => part.attributeTag);
      if (new Set(tags).size !== tags.length) return false;
    }
    if (!validAttributeSchema(e.attributeSchema)) return false;
    if (
      e.attributeTag != null &&
      (e.type !== "text" || !validTag(e.attributeTag) || /[\r\n]/.test(e.text))
    )
      return false;
    if (
      e.type === "polyline" &&
      e.bulges != null &&
      (!Array.isArray(e.bulges) ||
        e.bulges.length > e.points?.length ||
        e.bulges.some((b) => !Number.isFinite(b) || Math.abs(b) > 1e6))
    )
      return false;
    if (e.type === "dimension" && !validDimension(e, pt)) return false;
    if (
      e.space &&
      e.space !== "model" &&
      !(d.layouts || []).some((l) => l.id === e.space)
    )
      return false;
    if (
      e.type === "viewport" &&
      (!e.space ||
        e.space === "model" ||
        !Array.isArray(e.points) ||
        e.points.length !== 2 ||
        !e.points.every(pt) ||
        Math.abs(e.points[1].x - e.points[0].x) < 1e-8 ||
        Math.abs(e.points[1].y - e.points[0].y) < 1e-8 ||
        !pt(e.viewCenter) ||
        !Number.isFinite(e.viewScale) ||
        e.viewScale <= 0)
    )
      return false;
    if (
      ["line", "polyline", "leader", "hatch"].includes(e.type) &&
      (!Array.isArray(e.points) ||
        e.points.length < (["hatch"].includes(e.type) ? 3 : 2) ||
        !e.points.every(pt))
    )
      return false;
    if (e.type === "line" && e.points.length !== 2) return false;
    if (
      hasBulges(e) &&
      e.points.some(
        (p, i) =>
          (e.closed || i < e.points.length - 1) &&
          Math.abs(e.bulges?.[i] || 0) > 1e-12 &&
          dist(p, e.points[(i + 1) % e.points.length]) < 1e-8,
      )
    )
      return false;
    if (
      ["circle", "arc"].includes(e.type) &&
      (!pt(e.center) || !Number.isFinite(e.radius) || e.radius <= 0)
    )
      return false;
    if (
      e.type === "arc" &&
      (!Number.isFinite(e.start) ||
        !Number.isFinite(e.sweep) ||
        Math.abs(e.sweep) > TAU)
    )
      return false;
    if (
      ["text", "leader"].includes(e.type) &&
      (typeof e.text !== "string" ||
        !Number.isFinite(e.height) ||
        e.height <= 0)
    )
      return false;
    if (
      e.type === "text" &&
      (!pt(e.point) || !Number.isFinite(e.rotation || 0))
    )
      return false;
    if (e.type === "hatch" && (!Number.isFinite(e.spacing) || e.spacing <= 0))
      return false;
  }
  return true;
}
