import { createBlock, insertBlock, validBlockName, validTag } from "./blocks.js";
import { parsePoint } from "./geometry.js";
import { clone } from "./values.js";
import { commandPrompt } from "./command-prompts.js";
import { catalogInstance } from "./catalog-placement.js";

const templates = (context) => context.templates || [];
const named = (context, name) => templates(context).find((e) => e.definition.name.toLowerCase() === name.toLowerCase());
const acceptedTemplate = (state, context) => templates(context).find(e => e.definition.id === state.template.definition.id)
  || (state.catalog?.standard ? { ...state.template, definition: { ...state.template.definition,
    entities: state.template.definition.entities.map(e => ({ ...e, layer: context.creation.layer })) } } : null);
function point(state, p, context) {
  if (state.phase !== "points") return { state };
  const { layer, space, color, lineType } = context.creation;
  if (state.name === "BLOCK") {
    if (named(context, state.blockName)) throw Error("Blocknamnet används redan.");
    const sources = context.entities || [];
    const block = createBlock(sources, state.blockName, p, layer, space);
    return { state: null, selection: [block.id], change: {
      kind: "editing", label: "Skapa block", replaceIds: sources.map((e) => e.id),
      entities: [block], definitions: [block.definition],
    } };
  }
  // Resolve the accepted definition again: the preview snapshot cannot overwrite a newer definition.
  if (state.catalog && context.catalogPlacementReason) throw Error(context.catalogPlacementReason);
  const template = acceptedTemplate(state, context);
  if (!template) throw Error("Blocket finns inte längre.");
  const block = state.catalog ? catalogInstance(template, p, context.creation, state.catalog)
    : { ...insertBlock(template, p, layer, space), color, lineType };
  const definitions = state.catalog?.standard && !templates(context).some(e => e.definition.id === template.definition.id)
    ? [template.definition] : undefined;
  if (definitions && named(context, template.definition.name)) throw Error("Blocknamnet används redan. Byt namn på det befintliga blocket först.");
  return { state: null, selection: [block.id], change: { kind: "editing", label: state.catalog ? "Placera katalogdetalj" : "Infoga block", entities: [block], ...(definitions ? { definitions } : {}) } };
}
function handle(state, event, context) {
  try {
    if (event.type === "catalog" && state.name === "INSERT") {
      if (context.catalogPlacementReason) throw Error(context.catalogPlacementReason);
      if (!event.template?.definition?.entities?.length || !Number.isFinite(event.rotation)) throw Error("Ogiltig katalogdetalj.");
      return { state: { ...state, phase: "points", template: clone(event.template),
        catalog: { standard: !!event.standard, rotation: event.rotation, anchor: event.anchor, label: event.label } }, selection: [] };
    }
    if (event.type === "point") return point(state, event.point, context);
    if (event.type !== "text") return { state };
    const text = event.text.trim(), sources = context.entities || [];
    if (state.phase === "select") return sources.length && !text
      ? { state: { ...state, phase: "blockName" } }
      : { state, message: "Välj objekt först och tryck Enter." };
    if (state.phase === "blockName") {
      return !validBlockName(text) || named(context, text)
        ? { state, message: "Ange ett unikt blocknamn med bokstäver, siffror, _ eller -." }
        : { state: { ...state, blockName: text, phase: "points" } };
    }
    if (state.phase === "insertName") {
      const template = named(context, text);
      return template ? { state: { ...state, template: clone(template), phase: "points" }, selection: [] }
        : { state, message: "Blocknamnet finns inte i ritningen." };
    }
    if (state.phase === "attributeName") {
      if (sources.length !== 1 || sources[0].type !== "text") throw Error("Markera en text och kör ATTDEF för att ge den ett attributnamn.");
      if (/[\r\n]/.test(sources[0].text)) throw Error("Attribut stöder en textrad i denna version.");
      const tag = text.toUpperCase();
      if (!validTag(tag)) throw Error("Använd A–Z, 0–9 och _, börja med bokstav.");
      return { state: null, selection: [sources[0].id], change: {
        kind: "editing", label: "Attributdefinition", replaceId: sources[0].id,
        entities: [{ ...sources[0], attributeTag: tag }],
      } };
    }
    const p = parsePoint(text, state.points.at(-1), event.cursor);
    return p ? point(state, p, context) : { state, message: "Ange en punkt, t.ex. 100,200." };
  } catch (error) { return { state, message: error.message }; }
}
export const blockTools = Object.fromEntries(["BLOCK", "INSERT", "ATTDEF"].map((name) => [name, {
  create: (context) => ({ name, points: [], phase: name === "BLOCK" ? context.entities?.length ? "blockName" : "select" : name === "INSERT" ? "insertName" : "attributeName" }),
  handle,
  preview(state, cursor, context) {
    if (state.name !== "INSERT" || state.phase !== "points") return [];
    if (state.catalog && context.catalogPlacementReason) return [];
    const template = acceptedTemplate(state, context);
    const { layer, space, color, lineType } = context.creation;
    return template ? [state.catalog ? catalogInstance(template, cursor, context.creation, state.catalog)
      : { ...insertBlock(template, cursor, layer, space), color, lineType }] : [];
  },
  describe: (state) => ({ prompt: commandPrompt(state), properties: ["layer", "color", "lineType"] }),
}]));
