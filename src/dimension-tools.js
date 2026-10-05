import { dist, angle, polar, sub, mul, parsePoint } from "./geometry.js";
import { dimensionChain, extendDimensionChain } from "./dimensions.js";
import { clone, uid } from "./values.js";
import { commandPrompt } from "./command-prompts.js";

const kinds = { DIMLINEAR: "linear", DIMALIGNED: "aligned", DIMANGULAR: "angular", DIMRADIUS: "radius", DIMDIAMETER: "diameter", DIMCONTINUE: "continue" };
const linear = (name) => ["DIMLINEAR", "DIMALIGNED"].includes(name);
const radial = (name) => ["DIMRADIUS", "DIMDIAMETER"].includes(name);
const chainSource = (entity) => entity?.type === "dimension" && ["linear", "aligned"].includes(entity.kind);
function sourceState(state, source, end = 1) {
  return { ...state, source: clone(source), end, phase: "chainPoints", points: [clone(source.points[end === 0 ? 0 : source.points.length - 2])] };
}
function entity(state, points, context) {
  return { id: uid(), type: "dimension", kind: kinds[state.name], points: clone(points), ...context.creation };
}
function chain(state, placement, context) {
  const [a, b] = state.points;
  const axis = state.name === "DIMALIGNED" ? mul(sub(b, a), 1 / dist(a, b))
    : placement.y > Math.max(...state.points.map((p) => p.y)) || placement.y < Math.min(...state.points.map((p) => p.y)) ? { x: 1, y: 0 } : { x: 0, y: 1 };
  return dimensionChain(entity(state, [], context), state.points, placement, axis);
}
function accepted(dimension, label, state = null, replaceId) {
  return { state, selection: [dimension.id], change: { kind: "editing", label, entities: [dimension], ...(replaceId ? { replaceId } : {}) } };
}
function point(state, p, context) {
  if (state.name === "DIMCONTINUE") {
    if (state.phase === "chainPick") {
      const source = context.hitEntity;
      if (!chainSource(source) || !(context.editableEntities || []).some((e) => e.id === source.id))
        return { state, message: "Välj ett linjärt eller riktat mått." };
      const pointer = context.pointer || p;
      return { state: sourceState(state, source, dist(pointer, source.points[0]) < dist(pointer, source.points[1]) ? 0 : 1), selection: [source.id] };
    }
    if (!(context.editableEntities || []).some((e) => e.id === state.source.id))
      return { state, message: "Måttets lager måste vara synligt och olåst." };
    const dimension = extendDimensionChain(state.source, p);
    return accepted(dimension, "Lägg till måttpunkt", sourceState(state, dimension), state.source.id);
  }
  if (linear(state.name)) {
    if (state.phase === "dimensionPlace") return accepted(chain(state, p, context), "Måttkedja");
    return state.points.some((q) => dist(q, p) < 1e-8)
      ? { state, message: "Mätpunkten är redan vald." }
      : { state: { ...state, points: [...state.points, clone(p)] } };
  }
  if (radial(state.name) && !state.points.length) {
    const source = context.hitEntity;
    return source && ["circle", "arc"].includes(source.type)
      ? { state: { ...state, points: [clone(source.center), polar(source.center, source.radius, angle(source.center, p))] } }
      : { state, message: "Välj cirkel eller båge." };
  }
  if (state.points.length && dist(state.points.at(-1), p) < 1e-8) return { state, message: "Välj en annan punkt." };
  const points = [...state.points, clone(p)];
  if (points.length < (state.name === "DIMANGULAR" ? 4 : 3)) return { state: { ...state, points } };
  if (state.name === "DIMANGULAR" && Math.abs(Math.sin(angle(points[0], points[1]) - angle(points[0], points[2]))) < 1e-8)
    return { state, message: "Välj olika vinkelriktningar." };
  return accepted(entity(state, points, context), "Måttsättning");
}
function handle(state, event, context) {
  try {
    if (event.type === "point") return point(state, event.point, context);
    if (event.type !== "text") return { state };
    const text = event.text.trim(), option = text.toUpperCase();
    if (linear(state.name) && !text) return state.points.length < 2
      ? { state, message: "Välj minst två mätpunkter." }
      : { state: { ...state, phase: "dimensionPlace" } };
    if (state.name === "DIMCONTINUE") {
      if (!text) return { state: null };
      if (["V", "VÄLJ"].includes(option)) return { state: { ...state, phase: "chainPick", points: [] }, selection: [] };
      if (["B", "BYT"].includes(option) && state.phase === "chainPoints") return { state: sourceState(state, state.source, 1 - state.end) };
      if (state.phase === "chainPick") return { state, message: "Klicka på ett linjärt eller riktat mått." };
    }
    const p = parsePoint(text, state.points.at(-1), event.cursor);
    return p ? point(state, p, context) : { state, message: "Ogiltig punkt. Ange t.ex. 100,200 eller @100,50." };
  } catch (error) { return { state, message: error.message }; }
}
function preview(state, cursor, context) {
  try {
    if (state.name === "DIMCONTINUE") return state.phase === "chainPoints" ? [extendDimensionChain(state.source, cursor)] : [];
    if (linear(state.name)) return state.phase === "dimensionPlace" ? [chain(state, cursor, context)]
      : state.points.length ? [{ type: "polyline", points: [...state.points, cursor], closed: false, layer: context.creation?.layer }] : [];
    return state.points.length === (state.name === "DIMANGULAR" ? 3 : 2) ? [entity(state, [...state.points, cursor], context)] : [];
  } catch { return []; }
}
export const dimensionTools = Object.fromEntries(Object.keys(kinds).map((name) => [name, {
  create(context) {
    const state = { name, phase: "points", points: [] }, sources = context.entities || [];
    if (name === "DIMCONTINUE") return sources.length === 1 && chainSource(sources[0]) ? sourceState(state, sources[0]) : { ...state, phase: "chainPick" };
    if (radial(name) && sources.length === 1 && ["circle", "arc"].includes(sources[0].type))
      state.points = [clone(sources[0].center), polar(sources[0].center, sources[0].radius, 0)];
    return state;
  },
  handle, preview,
  describe: (state) => ({ prompt: commandPrompt(state), properties: ["layer", "color", "lineType"] }),
}]));
