import { dist, parsePoint } from "./geometry.js";
import { clone } from "./values.js";
import { commandPrompt } from "./command-prompts.js";

function measure(state, p) {
  if (!state.points.length) return { state: { ...state, points: [clone(p)] } };
  const a = state.points[0];
  return { state: null, message: `Avstånd: ${dist(a, p).toFixed(2)} mm · ΔX: ${(p.x - a.x).toFixed(2)} mm · ΔY: ${(p.y - a.y).toFixed(2)} mm` };
}
export const utilityTools = {
  DIST: {
    create: () => ({ name: "DIST", points: [], phase: "points" }),
    handle(state, event) {
      if (event.type === "point") return measure(state, event.point);
      if (event.type !== "text") return { state };
      const p = parsePoint(event.text.trim(), state.points.at(-1), event.cursor);
      return p ? measure(state, p) : { state, message: "Ange en mätpunkt, t.ex. 100,200 eller @100,50." };
    },
    preview: (state, cursor) => state.points.length ? [{ type: "line", points: [state.points[0], cursor] }] : [],
    describe: (state) => ({ prompt: commandPrompt(state), properties: [] }),
  },
  PAN: {
    create: () => ({ name: "PAN", points: [], phase: "points" }),
    handle: (state, event) => event.type === "text" ? event.text.trim()
      ? { state, message: "Dra för att panorera · Enter eller Esc avslutar." } : { state: null } : { state },
    preview: () => [],
    describe: (state) => ({ prompt: commandPrompt(state), properties: [] }),
  },
  ERASE: {
    create: () => ({ name: "ERASE", points: [], phase: "select" }),
    handle(state, event, context) {
      if (event.type !== "text") return { state };
      if (event.text.trim()) return { state, message: "Välj objekt i ritytan och tryck Enter." };
      const sources = context.entities || [];
      return sources.length ? { state: null, selection: [], message: `${sources.length} objekt raderade.`,
        change: { kind: "editing", label: "Radera", replaceIds: sources.map((e) => e.id), entities: [] } }
        : { state, message: "Inga objekt valda." };
    },
    preview: () => [],
    describe: (state) => ({ prompt: commandPrompt(state), properties: ["layer", "color", "lineType"] }),
  },
};
