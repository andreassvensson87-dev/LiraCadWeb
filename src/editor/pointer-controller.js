import { blockParts } from "../model/blocks.js";
import { hitDistance } from "../model/entity-geometry.js";
import { spaceOf } from "../model/layout.js";
import { viewportContains } from "../model/layout.js";
import { transformed } from "../model/entity-transform.js";
import { grips } from "../model/grips.js";
import { dist } from "../model/geometry.js";
import { gripTargets } from "../model/grips.js";
import { clone } from "../model/values.js";
import { beginSelectionGesture } from "./selection-gesture.js";
import { cameraVector } from "../model/camera.js";
import { moveSelectionGesture } from "./selection-gesture.js";
import { releaseSelectionGesture } from "./selection-gesture.js";
import { rectSelect } from "../model/entity-geometry.js";
import { moveGripTargets } from "../model/grips.js";
import { validDocument } from "../model/document.js";
import { wheelNavigation } from "./navigation.js";

// CAD gestures and geometry edits; the input adapter supplies pointer samples
// and presentation effects. No DOM, browser settings or file storage.
export function createPointerController({
  state,
  textEditor,
  moveCursor,
  hit,
  layerOf,
  beginAttributeTextEdit,
  beginBlockEdit,
  beginTextEdit,
  paperPoint,
  getDocument,
  enterViewport,
  finishTextEdit,
  setTrimShift,
  inActiveViewport,
  leaveViewport,
  capturePointer,
  blurCommand,
  setCursor,
  schedule,
  getInteractionEntities,
  editable,
  screen,
  update,
  acceptPoint,
  dispatchEditor,
  prompt,
  navigating,
  replaceEntities,
  log,
  syncViewport,
  getNavigationMode,
  world,
  acquireTrack,
}) {
  function dblclick(ev) {
    if (state.tool || textEditor.active) return;
    moveCursor(ev);
    const e = hit(state.rawCursor);
    if (e?.type === "block") {
      let attribute = null,
        distance = 7 / state.camera.scale;
      for (const part of blockParts(e).filter(
        (p) => p.attributeTag && !p.hidden && layerOf(p)?.visible !== false,
      )) {
        const d = hitDistance(part, state.rawCursor);
        if (d <= distance) {
          attribute = part;
          distance = d;
        }
      }
      if (attribute && beginAttributeTextEdit(e, attribute.attributeTag))
        return;
      beginBlockEdit(e);
      return;
    }
    if (e && ["text", "leader"].includes(e.type)) {
      beginTextEdit(e);
      return;
    }
    if (state.activeSpace !== "model" && !state.activeViewportId) {
      const p = paperPoint(state.mouse),
        vp = getDocument().entities.findLast(
          (e) =>
            e.type === "viewport" &&
            spaceOf(e) === state.activeSpace &&
            layerOf(e)?.visible !== false &&
            viewportContains(e, p),
        );
      if (vp) enterViewport(vp);
    }
  }
  function movedViewport() {
    return transformed(
      state.drag.entity,
      "MOVE",
      state.drag.world,
      state.rawCursor,
    );
  }
  function pointerdown(ev) {
    if (ev.button === 2) return;
    if (textEditor.active) {
      finishTextEdit(true);
      return;
    }
    setTrimShift(ev.shiftKey);
    moveCursor(ev);
    if (state.activeViewportId && !inActiveViewport(state.mouse)) {
      leaveViewport();
      return;
    }
    capturePointer(ev.pointerId);
    blurCommand();
    if (ev.button === 1 || state.space || state.tool?.name === "PAN") {
      ev.preventDefault();
      state.spaceUsed = true;
      if (
        state.activeViewportId &&
        getDocument().entities.find((e) => e.id === state.activeViewportId)
          ?.locked
      )
        return;
      state.drag = {
        kind: "pan",
        start: state.mouse,
        camera: { ...state.camera },
      };
      setCursor("grabbing");
      return;
    }
    if (state.drag?.kind === "select" && state.drag.phase === "corner") {
      state.drag = { ...state.drag, phase: "finish" };
      schedule();
      return;
    }
    if (!state.tool) {
      let closest = null,
        distance = 8;
      for (const e of getInteractionEntities() || getDocument().entities) {
        if (!state.selection.has(e.id) || !editable(e)) continue;
        for (const g of grips(e)) {
          const d = dist(screen(g.p), state.mouse);
          if (d < distance) {
            closest = { e, g };
            distance = d;
          }
        }
      }
      if (closest) {
        state.drag = {
          kind: "grip",
          targets: gripTargets(
            (getInteractionEntities() || getDocument().entities).filter(
              (e) => state.selection.has(e.id) && editable(e),
            ),
            closest.g.p,
          ),
          grip: closest.g,
          start: { ...state.mouse },
        };
        return;
      }
    }
    if (
      !state.tool &&
      !ev.shiftKey &&
      state.activeSpace !== "model" &&
      !state.activeViewportId
    ) {
      const e = hit(state.rawCursor);
      if (e?.type === "viewport") {
        state.selection = new Set([e.id]);
        state.drag = {
          kind: "viewportMove",
          entity: clone(e),
          world: { ...state.rawCursor },
          start: { ...state.mouse },
          moved: false,
        };
        setCursor("grabbing");
        update();
        return;
      }
    }
    if (
      state.tool &&
      ["STRETCH", "BSTRETCH"].includes(state.tool.name) &&
      state.tool.phase === "window" &&
      !state.tool.points.length
    ) {
      state.drag = { kind: "stretchWindow", start: { ...state.mouse } };
      acceptPoint(state.rawCursor);
      schedule();
      return;
    }
    if (state.tool && ["TRIM", "EXTEND"].includes(state.tool.name)) {
      state.drag = { kind: "trimSweep", pointerId: ev.pointerId };
      dispatchEditor({ type: "sweepStart" });
      prompt();
      schedule();
      return;
    }
    if (state.tool && state.tool.phase !== "select") {
      acceptPoint(state.cursor);
      schedule();
      return;
    }
    state.drag = beginSelectionGesture(
      state.mouse,
      state.rawCursor,
      ev.shiftKey,
      ev.timeStamp,
    );
    state.drag.hitId = hit(state.rawCursor)?.id || null;
  }
  function pointermove(ev) {
    setTrimShift(ev.shiftKey);
    moveCursor(ev);
    if (state.drag?.kind === "pan") {
      navigating();
      const delta = cameraVector(
        state.camera,
        -(state.mouse.x - state.drag.start.x) / state.camera.scale,
        (state.mouse.y - state.drag.start.y) / state.camera.scale,
      );
      state.camera.x = state.drag.camera.x + delta.x;
      state.camera.y = state.drag.camera.y + delta.y;
    } else if (state.drag?.kind === "trimSweep")
      dispatchEditor({ type: "sweepMove" });
    else if (state.drag?.kind === "select")
      state.drag = moveSelectionGesture(state.drag, state.mouse, ev.timeStamp);
    else if (state.drag?.kind === "viewportMove")
      state.drag.moved = dist(state.mouse, state.drag.start) > 4;
    else if (!state.tool && !state.drag) {
      const e = hit(state.rawCursor);
      state.hover = e?.id || null;
      setCursor(
        e?.type === "viewport" && !state.activeViewportId
          ? "grab"
          : "crosshair",
      );
    }
    schedule();
  }
  function pointerup(ev) {
    if (!state.drag) return;
    // Between clicks, only a new pointerdown can arm completion.
    if (state.drag.kind === "select" && state.drag.phase === "corner") return;
    moveCursor(ev);
    if (state.drag.kind === "trimSweep") {
      setTrimShift(ev.shiftKey);
      dispatchEditor({ type: "sweepEnd" });
      // A rejected commit must not leave a staged preview behind.
      if (state.tool?.sweep) dispatchEditor({ type: "sweepCancel" });
      prompt();
    } else if (state.drag.kind === "stretchWindow") {
      if (
        dist(state.mouse, state.drag.start) > 4 &&
        state.tool?.phase === "window"
      )
        acceptPoint(state.rawCursor);
    } else if (state.drag.kind === "viewportMove") {
      if (dist(state.mouse, state.drag.start) > 4) {
        const e = movedViewport();
        replaceEntities(
          "Flytta viewport",
          getDocument().entities.map((x) => (x.id === e.id ? e : x)),
        );
      }
    } else if (state.drag.kind === "select") {
      const action = releaseSelectionGesture(
        state.drag,
        state.mouse,
        state.rawCursor,
        state.drag.moved || state.drag.phase === "finish"
          ? null
          : hit(state.rawCursor)?.id,
        ev.timeStamp,
      );
      if (action.kind === "pending") {
        state.drag = action.gesture;
        if (!state.drag.shift) state.selection.clear();
        log("Markering · Ange motsatt hörn eller Esc.");
        update();
        return;
      }
      if (action.kind === "rectangle") {
        const r = action.region,
          ids = (getInteractionEntities() || getDocument().entities)
            .filter((e) => editable(e) && rectSelect(e, r, action.crossing))
            .map((e) => e.id);
        if (!action.shift) state.selection.clear();
        ids.forEach((id) => state.selection.add(id));
      } else {
        if (!action.shift) state.selection.clear();
        if (action.shift && state.selection.has(action.id))
          state.selection.delete(action.id);
        else state.selection.add(action.id);
      }
    } else if (
      state.drag.kind === "grip" &&
      dist(state.mouse, state.drag.start) > 4
    ) {
      const changed = moveGripTargets(state.drag.targets, state.cursor);
      const replacements = new Map(changed.map((e) => [e.id, e]));
      const entities = getDocument().entities.map(
        (e) => replacements.get(e.id) || e,
      );
      if (
        !validDocument({ ...getDocument(), entities }) ||
        changed.some((e) => e.type === "line" && dist(...e.points) < 1e-8)
      )
        log("Greppen skulle ge ogiltig geometri.");
      else replaceEntities("Ändra grepp", entities);
    }
    syncViewport();
    state.drag = null;
    setCursor(state.tool?.name === "PAN" ? "grab" : "crosshair");
    update();
  }
  function cancelTrimSweep() {
    if (state.tool?.sweep) dispatchEditor({ type: "sweepCancel" });
  }
  function lostpointercapture() {
    if (state.drag?.kind !== "trimSweep") return;
    cancelTrimSweep();
    state.drag = null;
    schedule();
  }
  function pointercancel() {
    cancelTrimSweep();
    state.drag = null;
    setCursor("crosshair");
    schedule();
  }
  function wheel(ev) {
    ev.preventDefault();
    if (textEditor.active) return;
    if (
      state.activeViewportId &&
      getDocument().entities.find((e) => e.id === state.activeViewportId)
        ?.locked
    )
      return;
    moveCursor(ev);
    const action = wheelNavigation(ev, getNavigationMode(), state.height);
    navigating();
    if (action.kind === "pan") {
      const delta = cameraVector(
        state.camera,
        action.dx / state.camera.scale,
        -action.dy / state.camera.scale,
      );
      state.camera.x += delta.x;
      state.camera.y += delta.y;
    } else {
      const before = world(state.mouse);
      state.camera.scale = Math.max(
        1e-7,
        Math.min(10000, state.camera.scale * action.factor),
      );
      const after = world(state.mouse);
      state.camera.x += before.x - after.x;
      state.camera.y += before.y - after.y;
    }
    syncViewport();
    // Keep preview and snap at the new world position after navigation.
    moveCursor(ev);
    if (state.drag?.kind === "pan") {
      state.drag.start = { ...state.mouse };
      state.drag.camera = { ...state.camera };
    }
    schedule();
  }
  function pointerleave() {
    state.hover = null;
    acquireTrack(null);
    if (!state.drag) {
      state.snap = null;
      state.mouse = { x: -1, y: -1 };
    }
    schedule();
  }
  return {
    dblclick,
    pointerdown,
    pointermove,
    pointerup,
    lostpointercapture,
    pointercancel,
    wheel,
    pointerleave,
    movedViewport,
    cancelTrimSweep,
  };
}
