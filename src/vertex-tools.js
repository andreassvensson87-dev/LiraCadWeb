import { parsePoint } from "./geometry.js";
import { insertVertex, removeVertex } from "./editing.js";
import { commandPrompt } from "./command-prompts.js";

const selectedPolyline = (context) => context.entities?.length === 1 && context.entities[0].type === "polyline"
  ? context.entities[0] : null;
function handle(state, event, context) {
  if (state.phase === "select") {
    if (event.type !== "text") return { state };
    if (event.text.trim()) return { state, message: "Markera objekt och tryck Enter." };
    const entity = selectedPolyline(context);
    return entity ? { state: { ...state, entityId: entity.id, phase: "points" } }
      : { state, message: "Välj exakt en polylinje." };
  }
  const point = event.type === "text" ? parsePoint(event.text.trim(), undefined, event.cursor) : event.point;
  if (!point) return { state, message: "Ange en giltig hörnpunkt eller klicka i ritytan." };
  const entity = (context.editableEntities || []).find((e) => e.id === state.entityId);
  if (!entity || entity.type !== "polyline")
    return { state, message: "Objektvalet har ändrats. Avbryt och välj objekt igen." };
  try {
    const edited = state.name === "PINSERT" ? insertVertex(entity, point) : removeVertex(entity, point);
    return { state: null, selection: [edited.id], change: {
      kind: "editing", label: "Ändra polylinje", replaceIds: [entity.id], entities: [edited],
    } };
  } catch (error) { return { state, message: error.message }; }
}
export const vertexTools = Object.fromEntries(["PINSERT", "PDELETE"].map((name) => [name, {
  create(context) {
    const entity = selectedPolyline(context);
    return { name, points: [], phase: entity ? "points" : "select", entityId: entity?.id };
  },
  handle,
  // Preserve the existing direct-click workflow; no speculative vertex edits.
  preview: () => [],
  describe: (state) => ({ prompt: commandPrompt(state), properties: ["layer", "color", "lineType"] }),
}]));
