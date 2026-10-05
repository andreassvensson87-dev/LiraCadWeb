import { number, parsePoint } from "./geometry.js";
import { corner } from "./editing.js";
import { commandPrompt } from "./command-prompts.js";

function resultEntities(state, second, pick, context) {
  const first = (context.editableEntities || []).find((e) => e.id === state.first.id);
  second = (context.editableEntities || []).find((e) => e.id === second?.id);
  if (!first || !second) throw Error("Objektvalet har ändrats. Avbryt och välj objekt igen.");
  const result = corner(first, second, state.name, state.value, state.value2,
    state.first.pick, pick);
  return [...result.updated, ...(result.bridge ? [result.bridge] : [])];
}
function finish(state, second, pick, context) {
  try {
    const entities = resultEntities(state, second, pick, context);
    return {
      state: null, selection: entities.map((e) => e.id),
      change: { kind: "editing", label: state.name, replaceIds: [state.first.id, second.id], entities },
    };
  } catch (error) { return { state, message: error.message }; }
}
function handle(state, event, context) {
  if (state.phase === "cornerSize") {
    if (event.type !== "text") return { state };
    const text = event.text.trim(), values = text ? text.split(",").map(number) : [state.value];
    if (values.length > 2 || values.some((v) => v === null || v < 0) ||
        (state.name === "FILLET" && values.length !== 1))
      return { state, message: "Ange giltiga positiva mått eller 0." };
    const next = { ...state, value: values[0], value2: values[1] ?? values[0], phase: "cornerPick" };
    const defaults = { value: next.value };
    if (state.candidateIds.length !== 2) return { state: next, defaults };
    next.first = { id: state.candidateIds[0] };
    const second = (context.editableEntities || []).find((e) => e.id === state.candidateIds[1]);
    return { ...finish(next, second, undefined, context), defaults };
  }
  const pick = event.type === "text"
    ? parsePoint(event.text.trim(), undefined, event.cursor) : event.point;
  if (!pick) return { state, message: "Ange en giltig punkt eller välj en rak linje i ritytan." };
  const entity = context.hitEntity;
  if (!entity || entity.type !== "line") return { state, message: "Välj en rak linje." };
  if (!state.first) return { state: { ...state, first: { id: entity.id, pick: { ...pick } } } };
  return finish(state, entity, pick, context);
}
export const cornerTools = Object.fromEntries(["FILLET", "CHAMFER"].map((name) => [name, {
  create: (context) => ({
    name, phase: "cornerSize", points: [],
    candidateIds: (context.entities || []).filter((e) => e.type === "line").map((e) => e.id),
    value: context.defaults?.value ?? (name === "FILLET" ? 0 : 100),
  }),
  handle,
  preview(state, cursor, context) {
    if (state.phase !== "cornerPick" || !state.first) return [];
    try { return resultEntities(state, context.hitEntity, cursor, context); } catch { return []; }
  },
  describe: (state) => ({
    prompt: commandPrompt(state, { cornerSize: state.value, chamferSize: state.value }),
    properties: ["layer", "color", "lineType"],
  }),
}]));
