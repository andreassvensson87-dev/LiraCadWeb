import { dist, parsePoint } from "./geometry.js";
import { clone, uid } from "./values.js";
import { commandPrompt } from "./command-prompts.js";

function entity(type, props, context, withId = true) {
  const { layer, space, color, lineType } = context.creation;
  return { ...(withId ? { id: uid() } : {}), type, layer, space, color, lineType,
    ...props, ...context.creationDefaults?.[type] };
}
function finishHatch(state, context) {
  if (state.points.length < 3) return { state, message: "Minst tre punkter krävs." };
  return { state: null, change: { kind: "editing", label: "HATCH", entities: [
    entity("hatch", { points: clone(state.points), closed: true, spacing: 120 }, context),
  ] } };
}
function point(state, p, context) {
  if (state.phase === "text") return { state };
  if (state.name === "TEXT") return {
    state: null,
    effect: { kind: "editText", entity: entity("text", { point: clone(p), text: "", height: 150, rotation: 0 }, context), isNew: true },
  };
  if (state.name === "HATCH" && state.points.length && dist(state.points.at(-1), p) < 1e-8) return { state };
  const points = [...state.points, clone(p)];
  return state.name === "LEADER" && points.length === 3
    ? { state: { ...state, points, phase: "text" }, effect: { kind: "focusCommand" } }
    : { state: { ...state, points } };
}
function handle(state, event, context) {
  if (event.type === "point") return point(state, event.point, context);
  if (event.type !== "text") return { state };
  const text = event.text.trim();
  if (state.phase === "text") return text
    ? { state: null, change: { kind: "editing", label: "LEADER", entities: [
      entity("leader", { points: clone(state.points), text, height: 120 }, context),
    ] } }
    : { state, message: "Ange en text." };
  if (state.name === "HATCH" && (!text || text.toUpperCase() === "C")) return finishHatch(state, context);
  const p = parsePoint(text, state.points.at(-1), event.cursor);
  return p ? point(state, p, context) : { state, message: "Ogiltig punkt. Ange t.ex. 100,200 eller @100,50." };
}
function preview(state, cursor, context) {
  if (state.phase === "text" || !state.points.length) return [];
  if (state.name === "HATCH") return [{ type: "polyline", points: [...state.points, cursor], closed: state.points.length > 1 }];
  if (state.name === "LEADER") return [entity("leader", { points: [...state.points, cursor], text: "", height: 120 }, context, false)];
  return [];
}
export const annotationTools = Object.fromEntries(["TEXT", "LEADER", "HATCH"].map((name) => [name, {
  create: () => ({ name, points: [], phase: "points" }), handle, preview,
  describe: (state) => ({ prompt: commandPrompt(state), properties: ["layer", "color", "lineType"] }),
}]));
