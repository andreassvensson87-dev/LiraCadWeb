import { dist, arcThrough, parsePoint, number, add } from "./core.js";
import { commandPrompt } from "./command-prompts.js";

const labels = { LINE: "Linje", CIRCLE: "Cirkel", ARC: "Båge" };
function point(state, p) {
  const ps = state.points;
  const next = { ...state, points: [...ps, { ...p }] };
  const change = (entity) => ({
    label: labels[state.name],
    entities: [entity],
  });
  if (state.name === "LINE") {
    if (ps.length && dist(ps.at(-1), p) < 1e-8) return { state };
    return {
      state: next,
      change: ps.length
        ? change({ type: "line", points: [ps.at(-1), p] })
        : null,
    };
  }
  if (state.name === "CIRCLE" && ps.length) {
    const radius = dist(ps[0], p);
    return radius < 1e-8
      ? { state }
      : {
          state: null,
          change: change({ type: "circle", center: ps[0], radius }),
        };
  }
  if (state.name === "ARC" && ps.length === 2) {
    const arc = arcThrough(ps[0], ps[1], p);
    return arc
      ? { state: null, change: change({ type: "arc", ...arc }) }
      : {
          state,
          message: "Punkterna ligger på en rät linje. Välj en annan slutpunkt.",
        };
  }
  return { state: next };
}
function input(state, event) {
  if (event.type === "point") return point(state, event.point);
  const text = event.text.trim();
  if (!text)
    return state.name === "LINE"
      ? { state: null }
      : { state, message: "Ange ett värde eller en punkt." };
  if (state.name === "CIRCLE" && state.points.length) {
    const radius = number(text);
    if (radius !== null)
      return radius <= 0
        ? { state, message: "Radien måste vara positiv." }
        : point(state, add(state.points[0], { x: radius, y: 0 }));
  }
  const p = parsePoint(text, state.points.at(-1), event.cursor);
  return p
    ? point(state, p)
    : {
        state,
        message:
          "Ogiltig inmatning. Punkt: 100,200 · relativt: @100,50 · polärt: @500<45.",
      };
}
function preview(state, cursor) {
  const ps = state.points;
  if (!ps.length) return [];
  if (state.name === "CIRCLE")
    return [{ type: "circle", center: ps[0], radius: dist(ps[0], cursor) }];
  if (state.name === "ARC" && ps.length === 2) {
    const arc = arcThrough(ps[0], ps[1], cursor);
    return arc ? [{ type: "arc", ...arc }] : [];
  }
  return [{ type: "line", points: [ps.at(-1), cursor] }];
}
// Tool protocol: create, handle, preview, describe. Tools never access DOM/document.
export const drawingTools = Object.fromEntries(
  Object.keys(labels).map((name) => [
    name,
    {
      create: () => ({ name, points: [], phase: "points" }),
      handle: input,
      preview,
      describe: (state) => ({
        prompt: commandPrompt(state),
        properties: ["layer", "color", "lineType"],
      }),
    },
  ]),
);
