import { parsePoint, number, angle, dist } from "./geometry.js";
import { transformed } from "./entity-transform.js";
import { uid } from "./values.js";
import { commandPrompt } from "./command-prompts.js";

function sources(state, context) {
  const ids = new Set(state.ids);
  return (context.entities || []).filter((e) => ids.has(e.id));
}
function restriction(state, entities, target, value) {
  if (["ROTATE", "MIRROR"].includes(state.name) &&
      entities.some((e) => e.type === "viewport"))
    return "Rektangulära viewports kan flyttas och skalas, men inte roteras eller speglas.";
  if (state.name === "MIRROR" && dist(state.points[0], target) < 1e-7)
    return "Spegelaxeln behöver två olika punkter.";
  if (state.name === "SCALE" && !(value > 0))
    return "Skalfaktorn måste vara större än 0.";
  return null;
}
function handle(state, event, context) {
  if (state.phase === "select") {
    if (event.type !== "text") return { state };
    if (event.text.trim())
      return { state, message: "Välj objekt i ritytan och tryck Enter." };
    const ids = (context.entities || []).map((e) => e.id);
    return ids.length
      ? { state: { ...state, ids, phase: "points" } }
      : { state, message: "Inga objekt valda." };
  }
  let p = event.point, value;
  if (event.type === "text") {
    const text = event.text.trim();
    if (!text) return { state, message: "Ange ett värde eller en punkt." };
    if (state.points.length && ["ROTATE", "SCALE"].includes(state.name)) {
      value = number(text);
      if (value === null) return { state, message: "Ange ett giltigt tal." };
      if (state.name === "ROTATE") value = value * Math.PI / 180;
      p = event.cursor;
    } else p = parsePoint(text, state.points[0], event.cursor);
    if (!p && value === undefined)
      return {
        state,
        message: "Ogiltig inmatning. Punkt: 100,200 · relativt: @100,50 · polärt: @500<45.",
      };
  }
  if (!state.points.length)
    return { state: { ...state, points: [{ ...p }] } };
  if (value === undefined) {
    if (state.name === "ROTATE") value = angle(state.points[0], p);
    if (state.name === "SCALE") value = dist(state.points[0], p) / 1000;
  }
  const entities = sources(state, context);
  if (!entities.length || entities.length !== state.ids.length)
    return { state, message: "Objektvalet har ändrats. Avbryt och välj objekt igen." };
  const message = restriction(state, entities, p, value);
  if (message) return { state, message };
  return {
    state: null,
    change: {
      operation: state.name,
      label: state.name,
      entities: entities.map((e) => transformed(e, state.name, state.points[0], p, value)),
    },
    message: `${state.name} · ${entities.length} objekt.`,
  };
}
export const transformTools = Object.fromEntries(
  ["MOVE", "COPY", "ROTATE", "SCALE", "MIRROR"].map((name) => [name, {
    create: (context) => {
      const ids = (context.entities || []).map((e) => e.id);
      return { name, points: [], ids, phase: ids.length ? "points" : "select" };
    },
    handle,
    preview: (state, cursor, context) => {
      if (!state.points.length) return [];
      const entities = sources(state, context);
      const value = name === "SCALE"
        ? Math.max(0.001, dist(state.points[0], cursor) / 1000)
        : undefined;
      if (restriction(state, entities, cursor, value)) return [];
      return entities.map((e) => transformed(e, name, state.points[0], cursor, value));
    },
    describe: (state) => ({
      prompt: commandPrompt(state),
      properties: ["layer", "color", "lineType"],
    }),
  }]),
);

// Apply the tool's result without creation defaults; MOVE preserves identity,
// COPY assigns fresh identities while retaining layer, space, style and block data.
export function applyTransformChange(entities, change, createId = uid) {
  const edited = structuredClone(change.entities);
  if (change.operation === "COPY")
    edited.forEach((e) => {
      e.id = createId();
    });
  const replacements = new Map(edited.map((e) => [e.id, e]));
  return {
    entities: change.operation === "COPY"
      ? [...entities, ...edited]
      : entities.map((e) => replacements.get(e.id) || e),
    ids: edited.map((e) => e.id),
  };
}
