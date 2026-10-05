import { dist, arcThrough, parsePoint, number, add } from "./geometry.js";
import { commandPrompt } from "./command-prompts.js";

const labels = {
  LINE: "Linje",
  CIRCLE: "Cirkel",
  ARC: "Båge",
  RECTANG: "Rektangel",
  PLINE: "Polylinje",
};
const rectangle = (a, b) => [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }];
function finishPolyline(state, closed) {
  const min = closed ? 3 : 2;
  if (state.points.length < min)
    return {
      state,
      message: closed
        ? "Ange minst tre hörn före slutning."
        : "Ange minst 2 punkter.",
    };
  return {
    state: null,
    change: {
      label: closed ? labels.PLINE : "PLINE",
      entities: [{
        type: "polyline",
        points: state.points,
        bulges: state.bulges || [],
        closed,
        ...(!closed ? { spacing: 120 } : {}),
      }],
    },
  };
}
function point(state, p) {
  const ps = state.points;
  const next = { ...state, points: [...ps, { ...p }] };
  const change = (entity) => ({
    label: labels[state.name],
    entities: [entity],
  });
  if (state.name === "RECTANG" && ps.length) {
    return Math.abs(p.x - ps[0].x) > 1e-8 && Math.abs(p.y - ps[0].y) > 1e-8
      ? {
          state: null,
          change: change({
            type: "polyline", points: rectangle(ps[0], p), closed: true,
          }),
        }
      : { state };
  }
  if (state.name === "PLINE") {
    if (ps.length && state.arcMode) {
      if (!state.arcMid)
        return dist(ps.at(-1), p) > 1e-8
          ? { state: { ...state, arcMid: { ...p } } }
          : { state };
      const arc = arcThrough(ps.at(-1), state.arcMid, p);
      return arc
        ? {
            state: {
              ...next,
              bulges: [...(state.bulges || []), Math.tan(arc.sweep / 4)],
              arcMid: null,
            },
          }
        : {
            state,
            message: "Bågens tre punkter får inte ligga på en rät linje.",
          };
    }
    if (ps.length && dist(ps.at(-1), p) <= 1e-8) return { state };
    return {
      state: { ...next, bulges: ps.length ? [...(state.bulges || []), 0] : [] },
    };
  }
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
  if (state.name === "PLINE") {
    const option = text.toUpperCase();
    if (["A", "L"].includes(option))
      return { state: { ...state, arcMode: option === "A", arcMid: null } };
    if (option === "U")
      return {
        state: state.arcMid
          ? { ...state, arcMid: null }
          : {
              ...state,
              points: state.points.slice(0, -1),
              bulges: (state.bulges || []).slice(0, -1),
            },
      };
    if (option === "C") return finishPolyline(state, true);
    if (!text)
      return state.arcMid
        ? {
            state,
            message: "Ange bågens slutpunkt eller U för att ångra mellanpunkten.",
          }
        : finishPolyline(state, false);
  }
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
  if (state.name === "RECTANG")
    return [{ type: "polyline", points: rectangle(ps[0], cursor), closed: true }];
  if (state.name === "PLINE") {
    const base = { type: "polyline", points: ps, bulges: state.bulges || [] };
    if (state.arcMode && state.arcMid) {
      const arc = arcThrough(ps.at(-1), state.arcMid, cursor);
      return [base, ...(arc ? [{ type: "arc", ...arc }] : [])];
    }
    return [base, { type: "line", points: [ps.at(-1), cursor] }];
  }
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
