import { evaluatedBlockEntities, shiftParameters, parameterOffset, constrainedParameterValue } from "./parametric-blocks.js";
import { clone, uid } from "./values.js";
import { transform } from "./entity-transform.js";
import { sub, add } from "./geometry.js";
export const validBlockName = (s) =>
  typeof s === "string" && /^[\p{L}\p{N}_-]{1,64}$/u.test(s);
export const validTag = (s) =>
  typeof s === "string" && /^[\p{L}\p{N}_.-]{1,128}$/u.test(s);
export function createBlock(entities, name, base, layer, space = "model") {
  if (!validBlockName(name))
    throw Error("Blocknamn: använd bokstäver, siffror, _ eller - (max 64).");
  if (
    !entities.length ||
    entities.some((e) => ["viewport", "block"].includes(e.type))
  )
    throw Error(
      "Välj ritobjekt; nästlade block och viewports stöds inte ännu.",
    );
  const tags = entities
    .filter((e) => e.attributeTag)
    .map((e) => e.attributeTag);
  if (new Set(tags).size !== tags.length)
    throw Error("Attributnamnen måste vara unika i blocket.");
  return {
    id: uid(),
    type: "block",
    layer,
    space,
    point: { ...base },
    rotation: 0,
    scale: 1,
    mirrored: false,
    definition: {
      id: uid(),
      name,
      entities: entities.map((e) => {
        const n = transform(e, (p) => sub(p, base));
        delete n.space;
        return n;
      }),
    },
    values: Object.fromEntries(
      entities
        .filter((e) => e.attributeTag)
        .map((e) => [e.attributeTag, e.text]),
    ),
  };
}
export function blockParts(e) {
  const r = e.rotation || 0,
    k = e.scale || 1,
    flip = e.mirrored ? -1 : 1;
  return evaluatedBlockEntities(e).map((part) => {
    const n = transform(
      part,
      (p) =>
        add(e.point, {
          x: k * (p.x * Math.cos(r) - flip * p.y * Math.sin(r)),
          y: k * (p.x * Math.sin(r) + flip * p.y * Math.cos(r)),
        }),
      { scale: k, rotation: r, mirror: !!e.mirrored },
    );
    if (n.attributeTag) n.text = e.values?.[n.attributeTag] ?? n.text;
    n.space = e.space;
    n.id = e.id;
    if (part.inheritLayer) n.layer = e.layer;
    if (e.color && (part.colorByBlock || part.inheritLayer && !part.color || part.inheritLayer == null && !part.color)) { n.color = e.color; n.cadColor7 = e.cadColor7; }
    if (part.lineTypeByBlock) { n.lineType = e.lineType || "BYLAYER"; n.linePattern = e.linePattern; n.linePatternType = e.linePatternType; }
    if (e.lineType && e.lineType !== "BYLAYER") n.lineType = e.lineType;
    return n;
  });
}
// Text edits happen in world coordinates, but overrides belong to one block
// instance in block coordinates. The definition and other instances stay intact.
export function withAttributeText(block, tag, text) {
  const definition = block.definition.entities.find(p => p.attributeTag === tag);
  if (!definition || text.type !== "text" || text.attributeTag !== tag) throw Error("Blockattributet finns inte längre.");
  const source = block.attributeOverrides?.[tag] || definition;
  const r = block.rotation || 0, k = block.scale || 1, flip = block.mirrored ? -1 : 1;
  const local = transform(text, p => {
    const dx = p.x - block.point.x, dy = p.y - block.point.y;
    return { x: (Math.cos(r) * dx + Math.sin(r) * dy) / k, y: flip * (-Math.sin(r) * dx + Math.cos(r) * dy) / k };
  }, { scale: 1 / k, rotation: block.mirrored ? r : -r, mirror: !!block.mirrored });
  local.point=sub(local.point,parameterOffset(block,definition.id));
  Object.assign(local, { id: definition.id, layer: source.layer, color: source.color, cadColor7: source.cadColor7 });
  delete local.space;
  return { ...block, values: { ...block.values, [tag]: text.text }, attributeOverrides: { ...block.attributeOverrides, [tag]: local } };
}
export function insertBlock(template, point, layer, space) {
  return {
    ...clone(template),
    id: uid(),
    point: { ...point },
    layer,
    space,
    rotation: 0,
    scale: 1,
    mirrored: false,
    attributeOverrides: {},
    parameterValues: {},
    values: Object.fromEntries(
      template.definition.entities
        .filter((e) => e.attributeTag)
        .map((e) => [e.attributeTag, e.text]),
    ),
  };
}

export function blockTemplates(doc) {
  const definitions = new Map((doc.blocks || []).map((def) => [def.id, def]));
  for (const e of doc.entities)
    if (e.type === "block" && !definitions.has(e.definition.id))
      definitions.set(e.definition.id, e.definition);
  return [...definitions.values()].map((definition) => ({
    type: "block",
    definition,
    point: { x: 0, y: 0 },
    rotation: 0,
    scale: 1,
    mirrored: false,
    values: {},
  }));
}

// Build a new document atomically; the editor draft never mutates the drawing.
export function updateBlockDefinition(document, id, draft) {
  const original = blockTemplates(document).find(
    (e) => e.definition.id === id,
  )?.definition;
  if (!original) throw Error("Blocket finns inte längre.");
  if (
    blockTemplates(document).some(
      (e) =>
        e.definition.id !== id &&
        e.definition.name.toLowerCase() === draft.name.toLowerCase(),
    )
  )
    throw Error("Blocknamnet används redan.");
  const base = draft.blockBase || { x: 0, y: 0 };
  if (!Number.isFinite(base.x) || !Number.isFinite(base.y))
    throw Error("Ogiltig baspunkt.");
  const definition = createBlock(
    draft.entities,
    draft.name,
    base,
    draft.layers[0].id,
  ).definition;
  definition.id = id;
  if (draft.stretchParameters?.length) definition.stretchParameters=shiftParameters(draft.stretchParameters,base);
  const result = clone(document);
  result.layers = clone(draft.layers);
  result.blocks = blockTemplates(document).map((e) =>
    e.definition.id === id ? clone(definition) : clone(e.definition),
  );
  const previousTags = new Map(
    original.entities
      .filter((e) => e.attributeTag)
      .map((e) => [e.id, e.attributeTag]),
  );
  result.entities = result.entities.map((e) => {
    if (e.type !== "block" || e.definition.id !== id) return e;
    const values = Object.fromEntries(
      definition.entities
        .filter((p) => p.attributeTag)
        .map((p) => {
          const oldTag = previousTags.get(p.id);
          return [
            p.attributeTag,
            (oldTag && e.values?.[oldTag]) ??
              e.values?.[p.attributeTag] ??
              p.text,
          ];
        }),
    );
    return { ...e, definition: clone(definition), values, attributeOverrides: {}, parameterValues:Object.fromEntries(Object.entries(e.parameterValues||{}).filter(([id])=>definition.stretchParameters?.some(p=>p.id===id)).map(([id,value])=>[id,constrainedParameterValue(definition.stretchParameters.find(p=>p.id===id),value)])) };
  });
  return result;
}
