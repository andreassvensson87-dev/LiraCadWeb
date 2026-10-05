import { parsePoint } from "./geometry.js";
import { clone, uid } from "./values.js";
import { commandPrompt } from "./command-prompts.js";

const rectangle = (a, b) => [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }];
function point(state, p, context) {
  if (!state.points.length) return { state: { ...state, points: [clone(p)] } };
  const a = state.points[0];
  if (Math.abs(p.x - a.x) <= 1 || Math.abs(p.y - a.y) <= 1) return { state, message: "Viewporten behöver bredd och höjd större än 1 mm." };
  const { layer, space, color, lineType } = context.creation;
  const viewport = { id: uid(), type: "viewport", layer, space, color, lineType,
    points: [clone(a), clone(p)], viewCenter: clone(context.modelCenter), viewScale: 1 / 100, locked: true };
  return { state: null, selection: [viewport.id], change: { kind: "editing", label: "Viewport", entities: [viewport] } };
}
export const viewportTools = {
  MVIEW: {
    create: () => ({ name: "MVIEW", points: [], phase: "points" }),
    handle(state, event, context) {
      if (context.creation.space === "model" || context.activeViewportId) return { state, message: "Skapa viewports i layoutens pappersläge." };
      if (event.type === "point") return point(state, event.point, context);
      if (event.type !== "text") return { state };
      const p = parsePoint(event.text.trim(), state.points.at(-1), event.cursor);
      return p ? point(state, p, context) : { state, message: "Ange en punkt, t.ex. 100,200." };
    },
    preview: (state, cursor, context) => state.points.length ? [{ type: "polyline", points: rectangle(state.points[0], cursor), closed: true, layer: context.creation.layer }] : [],
    describe: (state) => ({ prompt: commandPrompt(state), properties: ["layer", "color", "lineType"] }),
  },
};
