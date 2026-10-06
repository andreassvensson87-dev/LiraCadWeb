import { validStretchParameters, validParameterValues, evaluatedBlockEntities } from "./parametric-blocks.js";
import { validTextColumns } from "./text-columns.js";
import { validAnnotation } from "./annotation-context.js";
import { validFont } from "./text.js";
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
  if(!validStretchParameters(d.stretchParameters,d.entities))return false;
  if(d.layouts?.some(l=>l.monochrome!=null && typeof l.monochrome!=='boolean'))return false;
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
    if (l.linePattern != null && (!Array.isArray(l.linePattern) || l.linePattern.length > 100 || l.linePattern.some(v => !Number.isFinite(v)))) return false;
    if (l.lineWeight != null && (!Number.isFinite(l.lineWeight) || l.lineWeight < 0 || l.lineWeight > 100)) return false;
    if(l.plot!=null && typeof l.plot!=='boolean')return false;
    if(l.cadColor7!=null && typeof l.cadColor7!=='boolean')return false;
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
    if (!validAnnotation(e, pt)) return false;
    if(e.annotationVariants!=null){
      const variants=e.annotationVariants;
      if(!Array.isArray(variants)||variants.length>100||new Set(variants.map(v=>v?.denominator)).size!==variants.length||variants.some(v=>!v||!Number.isFinite(v.denominator)||v.denominator<=0||!v.entity||v.entity.type!==e.type||v.entity.annotationVariants!=null||v.entity.annotationContexts!=null||v.entity.annotationBase!=null||!validDocument({version:1,layers:d.layers,layouts:d.layouts,entities:[{...v.entity,id:e.id,layer:e.layer,space:e.space}]})))return false;
    }
    if (!validLineType(e.lineType)) return false;
    if (e.lineScale != null && (!Number.isFinite(e.lineScale) || e.lineScale <= 0)) return false;
    if (e.linePattern != null && (!Array.isArray(e.linePattern) || e.linePattern.length > 100 || e.linePattern.some(v => !Number.isFinite(v)))) return false;
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
      if(!validStretchParameters(def.stretchParameters,def.entities)||!validParameterValues(e.parameterValues,def.stretchParameters))return false;
      if(e.parameterValues && Object.keys(e.parameterValues).length)try{
        if(!validDocument({version:1,layers:d.layers,entities:evaluatedBlockEntities(e)}))return false;
      }catch{return false;}
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
    if(e.dimensionGraphics!=null && (e.type!=="dimension" || !Array.isArray(e.dimensionGraphics) || !e.dimensionGraphics.length || e.dimensionGraphics.length>10000 || e.dimensionGraphics.some(p=>!p || ['block','dimension','viewport'].includes(p.type)) || typeof e.dimensionGraphicsState!=='string' || e.dimensionGraphicsState.length>100000 || !validDocument({version:1,layers:d.layers,entities:e.dimensionGraphics})))return false;
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
    if (e.hidden != null && typeof e.hidden !== "boolean") return false;
    if (e.lineWeight != null && (!Number.isFinite(e.lineWeight) || e.lineWeight < 0 || e.lineWeight > 100)) return false;
    if (e.viewRotation != null && (e.type !== "viewport" || !Number.isFinite(e.viewRotation))) return false;
    if (e.type === "hatch" && e.holes != null && (!Array.isArray(e.holes) || e.holes.length > 1000 || e.holes.some(loop => !Array.isArray(loop) || loop.length < 3 || loop.length > 20000 || !loop.every(pt)))) return false;
    if (e.type === "text" || e.type === "dimension") {
      if (e.textColumns != null && (e.type !== "text" || !validTextColumns(e.textColumns))) return false;
      if (e.font != null && !validFont(e.font)) return false;
      for (const key of ["textWidth", "textFitWidth", "lineSpacing", "widthFactor"]) if (e[key] != null && (!Number.isFinite(e[key]) || e[key] < 0 || (key !== "textWidth" && !e[key]))) return false;
      if (e.oblique != null && (!Number.isFinite(e.oblique) || Math.abs(e.oblique) >= Math.PI / 2)) return false;
      if (e.textAttachment != null && (!Number.isInteger(e.textAttachment) || e.textAttachment < 1 || e.textAttachment > 9)) return false;
      if (e.textAlign != null && !["left", "center", "right"].includes(e.textAlign)) return false;
      if (e.textVertical != null && !["baseline", "bottom", "middle", "top"].includes(e.textVertical)) return false;
      if (e.paragraphAlign != null && !["left", "center", "right"].includes(e.paragraphAlign)) return false;
      if (e.tracking != null && (!Number.isFinite(e.tracking) || e.tracking < 0.75 || e.tracking > 4)) return false;
      if (Array.isArray(e.textRuns) && e.textRuns.some(r => (r?.tracking != null && (!Number.isFinite(r.tracking) || r.tracking < 0.75 || r.tracking > 4)) || (r?.paragraphAlign != null && !["left", "center", "right"].includes(r.paragraphAlign)))) return false;
      if (e.textRuns != null && (!Array.isArray(e.textRuns) || e.textRuns.length > 20000 || e.textRuns.some(r => !r || typeof r.text !== "string" || (r.font != null && !validFont(r.font)) || (r.color != null && !/^#[\da-f]{6}$/i.test(r.color)) || ["heightScale", "widthFactor"].some(k => r[k] != null && (!Number.isFinite(r[k]) || r[k] <= 0)) || (r.oblique != null && (!Number.isFinite(r.oblique) || Math.abs(r.oblique) >= Math.PI/2))))) return false;
    }
    if (e.attributeOverrides != null) {
      if (e.type !== "block" || typeof e.attributeOverrides !== "object" || Array.isArray(e.attributeOverrides)) return false;
      const parts = Object.values(e.attributeOverrides);
      if (parts.some(p => p?.type !== "text") || !validDocument({ version: 1, layers: d.layers, entities: parts })) return false;
    }
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
    if(e.hatchPattern!=null && (e.type!=="hatch" || !Array.isArray(e.hatchPattern) || !e.hatchPattern.length || e.hatchPattern.length>1000 || e.hatchPattern.some(l=>!l || !Number.isFinite(l.angle) || !pt(l.base) || !pt(l.offset) || !Array.isArray(l.dashes) || l.dashes.length>100 || l.dashes.some(d=>!Number.isFinite(d)))))return false;
    if(e.patternName!=null && (typeof e.patternName!=="string" || e.patternName.length>100))return false;
  }
  return true;
}
