import { dist, number, parsePoint } from "./geometry.js";
import { offset } from "./offset.js";
import { hasBulges } from "./polyline.js";
import { trimExtend } from "./trim-extend.js";
import { beginTrimSweep, moveTrimSweep, trimSweepPreview, trimSweepChange } from "./trim-sweep.js";
import { commandPrompt } from "./command-prompts.js";

const supported = (e) => ["line", "polyline", "circle", "arc"].includes(e.type);
function offsetSelection(entities) {
  if (entities.some(hasBulges))
    return "OFFSET av polylinjer med bågar stöds inte ännu. Dela upp med X först.";
  if (!entities.length || !entities.every(supported))
    return "OFFSET: välj en eller flera linjer, polylinjer, cirklar eller bågar.";
  return null;
}
function offsetHandle(state, event, context) {
  if (state.phase === "select") {
    if (event.type !== "text") return { state };
    if (event.text.trim()) return { state, message: "Välj objekt i ritytan och tryck Enter." };
    const entities = context.entities || [], message = offsetSelection(entities);
    return message ? { state, message } : {
      state: { ...state, ids: entities.map((e) => e.id), phase: "distance" },
    };
  }
  if (state.phase === "distance") {
    if (event.type === "text") {
      const value = number(event.text.trim());
      return value !== null && value > 0
        ? { state: { ...state, value, points: [], phase: "side" } }
        : { state, message: "Ange ett positivt avstånd." };
    }
    if (!state.points.length) return { state: { ...state, points: [{ ...event.point }] } };
    const value = dist(state.points[0], event.point);
    return value >= 1e-8
      ? { state: { ...state, value, points: [], phase: "side" } }
      : { state, message: "Mätpunkterna måste vara olika." };
  }
  const p = event.type === "text" ? parsePoint(event.text.trim(), undefined, event.cursor) : event.point;
  if (!p) return { state, message: "Ange en giltig punkt på sidan för kopian." };
  const entities = (context.editableEntities || []).filter((e) => state.ids.includes(e.id));
  if (entities.length !== state.ids.length)
    return { state, message: "Objektvalet har ändrats. Avbryt och välj objekt igen." };
  const message = offsetSelection(entities);
  if (message) return { state, message };
  const copies = entities.map((e) => offset(e, state.value, p));
  if (copies.some((e) => !e)) return {
    state, message: "Avståndet är för stort inåt. Välj utsidan eller ett mindre avstånd.",
  };
  return { state: null, selection: [], change: { kind: "editing", label: "Offset", entities: copies } };
}
function trimResult(state, context) {
  const source=context.hitEntity;
  if(!source || !(context.editableEntities || []).some(e=>e.id===source.id))throw Error('Välj en redigerbar linje, cirkel, båge eller polylinje.');
  return trimExtend(context.hitEntity,
    (context.boundaryEntities || context.editableEntities || []).filter(supported),
    context.pointer, trimMode(state,context));
}
const trimMode=(state,context={})=>(Boolean(context.shift ?? state.shift) !== (state.name==='EXTEND'))?'EXTEND':'TRIM';
function trimHandle(state, event, context) {
  if(event.type==='modifier')return {state:{...state,shift:!!event.shift}};
  if (event.type === "sweepStart") return { state: { ...state, sweep: beginTrimSweep(context, trimMode(state, context)) } };
  if (event.type === "sweepCancel") { const { sweep, ...rest } = state; return { state: rest }; }
  if (["sweepMove", "sweepEnd"].includes(event.type) && state.sweep) {
    const sweep = moveTrimSweep(state.sweep, context.pointer, trimMode(state, context));
    if (event.type === "sweepMove") return { state: { ...state, sweep } };
    const { sweep: old, ...rest } = state;
    const change = trimSweepChange(sweep);
    return { state: rest, selection: [], ...(change ? { change } : { message: sweep.error || "Svepet träffade inget objekt som kunde ändras." }) };
  }
  if (event.type === "text") return event.text.trim()
    ? { state, message: "Klicka på objektet i ritytan · Enter avslutar." }
    : { state: null, selection: [] };
  try {
    const replacements = trimResult(state, context), id = context.hitEntity.id;
    return {
      state, selection: [],
      change: { kind: "editing", label: trimMode(state,context) === "TRIM" ? "Trimma" : "Förläng", replaceId: id, entities: replacements },
    };
  } catch (error) { return { state, message: error.message }; }
}
export const editingTools = {
  OFFSET: {
    create(context) {
      const entities = context.entities || [];
      return { name: "OFFSET", points: [], ids: entities.map((e) => e.id), phase: offsetSelection(entities) ? "select" : "distance" };
    },
    handle: offsetHandle,
    preview(state, cursor, context) {
      if (state.phase === "distance" && state.points.length)
        return [{ type: "line", points: [state.points[0], cursor] }];
      if (state.phase !== "side") return [];
      const entities = (context.editableEntities || []).filter((e) => state.ids.includes(e.id));
      if (entities.length !== state.ids.length || offsetSelection(entities)) return [];
      return entities.map((e) => offset(e, state.value, cursor)).filter(Boolean);
    },
    describe: (state) => ({ prompt: commandPrompt(state), properties: ["layer", "color", "lineType"] }),
  },
  ...Object.fromEntries(["TRIM", "EXTEND"].map((name) => [name, {
    create: context => ({ name, phase: "trimPick", points: [], shift:!!context.shift }),
    handle: trimHandle,
    preview(state, cursor, context) {
      if (state.phase !== "trimPick") return [];
      if (state.sweep) return trimSweepPreview(state.sweep);
      try { return trimResult(state, context); } catch { return []; }
    },
    describe: (state) => ({ prompt: commandPrompt(state), properties: ["layer", "color", "lineType"] }),
  }])),
};

export function applyEditingChange(entities, change) {
  const replacements = structuredClone(change.entities);
  if (change.replaceIds) {
    const ids = new Set(change.replaceIds);
    const existing=new Set(entities.map(e=>e.id));
    if ([...ids].some((id) => !existing.has(id)))
      throw Error("Objektet finns inte längre.");
    return [...entities.filter((e) => !ids.has(e.id)), ...replacements];
  }
  if (change.replaceId === undefined) return [...entities, ...replacements];
  if (!entities.some((e) => e.id === change.replaceId)) throw Error("Objektet finns inte längre.");
  return entities.flatMap((e) => e.id === change.replaceId ? replacements : [e]);
}
