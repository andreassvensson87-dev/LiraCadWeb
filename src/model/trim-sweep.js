import { trimExtend, trimSweepCrossings } from "./trim-extend.js";
const supported = e => ["line", "polyline", "circle", "arc"].includes(e.type);

export function beginTrimSweep(context, mode) {
  const sweep = {
    previous: context.pointer,
    entities: (context.editableEntities || []).filter(supported),
    boundaries: (context.boundaryEntities || context.editableEntities || []).filter(supported),
    changes: [], error: null,
  };
  const source = sweep.entities.find(e => e.id === context.hitEntity?.id);
  if (source) apply(sweep, source, context.pointer, mode);
  return sweep;
}
function apply(sweep, source, point, mode) {
  if (sweep.changes.some(change => change.id === source.id)) return;
  try {
    const entities = trimExtend(source, sweep.boundaries, point, mode);
    sweep.changes.push({ id: source.id, entities });
    sweep.error = null;
  } catch (error) { sweep.error = error.message; }
}
export function moveTrimSweep(previous, point, mode) {
  const sweep = { ...previous, changes: [...previous.changes], previous: point };
  for (const hit of trimSweepCrossings(sweep.entities, previous.previous, point))
    apply(sweep, hit.entity, hit.point, mode);
  return sweep;
}
export const trimSweepPreview = sweep => sweep.changes.flatMap(change => change.entities);
export function trimSweepChange(sweep) {
  return sweep.changes.length ? {
    kind: "editing", label: "Trimma / Förläng · svep",
    replaceIds: sweep.changes.map(change => change.id), entities: trimSweepPreview(sweep),
  } : null;
}
