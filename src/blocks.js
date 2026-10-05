import { clone, uid } from "./values.js";
import { transform } from "./entity-transform.js";
import { sub, add } from "./geometry.js";
export const validBlockName = (s) =>
  typeof s === "string" && /^[\p{L}\p{N}_-]{1,64}$/u.test(s);
export const validTag = (s) =>
  typeof s === "string" && /^[A-Z_][A-Z0-9_]{0,63}$/.test(s);
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
  return e.definition.entities.map((part) => {
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
    if (e.color) n.color = e.color;
    if (e.lineType && e.lineType !== "BYLAYER") n.lineType = e.lineType;
    return n;
  });
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
    return { ...e, definition: clone(definition), values };
  });
  return result;
}
