import { TrackingReferences } from "./tracking.js";
import { nearbySnaps } from "./snapping.js";
import { paperSnaps } from "./layout.js";
import { dist } from "./geometry.js";
import { resolveSnap } from "./snapping.js";

// Explicit callbacks connect this controller to the current application instance.
export function createCursorController({
  state,
  schedule,
  getSnapCache,
  getDocument,
  getPolarStep,
  readPointer,
  reportCursor,
  gridStep,
  world,
}) {
  const trackState = new TrackingReferences();
  function clearTracking() {
    trackState.clear();
    state.trackAnchors = [];
  }
  function acquireTrack(candidate) {
    if (!state.tracking || !state.osnap) {
      clearTracking();
      return;
    }
    const result = state.drag?.kind === "pan" ? null : candidate;
    const changed = trackState.update({
      candidate: result?.mode === "object" ? result.p : null,
      contacts: result?.guides?.map((g) => g.a) || [],
      now: performance.now(),
    });
    state.trackAnchors = trackState.points;
    if (changed) schedule();
  }
  // Expire references even when the pointer stops moving or leaves the viewport.
  const timer = setInterval(() => {
    if (trackState.pending || state.trackAnchors.length) {
      resolveCursor();
      schedule();
    }
  }, 100);
  function resolveCursor() {
    state.cursor = state.rawCursor;
    state.snap = null;
    const active =
      state.tool?.phase === "points" ||
      (state.tool?.name === "WBLOCK" && state.tool.phase === "dialogBase") ||
      (state.tool?.name === "OFFSET" && state.tool.phase === "distance") ||
      state.drag?.kind === "grip";
    const base =
      state.drag?.kind === "grip"
        ? state.drag.grip.p
        : state.tool?.points.at(-1);
    if (
      active &&
      state.drag?.kind !== "pan" &&
      state.mouse.x >= 0 &&
      state.mouse.y >= 0 &&
      state.mouse.x <= state.width &&
      state.mouse.y <= state.height
    ) {
      const tolerance = 11 / state.camera.scale;
      // All original geometry is eligible, including the current selection.
      // Preview geometry is never inserted in this index.
      let candidates = state.osnap
        ? nearbySnaps(getSnapCache(), state.rawCursor, tolerance)
        : [];
      if (
        state.osnap &&
        state.activeSpace !== "model" &&
        !state.activeViewportId
      ) {
        const paper = paperSnaps(
          getDocument().layouts.find((l) => l.id === state.activeSpace),
          state.rawCursor,
          tolerance,
        );
        // Continuous edge snaps must not steal nearby object endpoints.
        candidates.push(
          ...paper.filter(
            (s) => s.kind !== "Papperskant" || !candidates.length,
          ),
        );
      }
      if (state.drag?.kind === "grip")
        candidates = candidates.filter(
          (s) =>
            !state.drag.targets.some(
              (t) =>
                s.id === t.entity.id &&
                t.grips.some((g) => dist(s.p, g.p) < 1e-7),
            ),
        );
      const directional = !["ARC", "SCALE"].includes(state.tool?.name);
      const result = resolveSnap({
        raw: state.rawCursor,
        base: directional ? base : null,
        candidates,
        anchors: state.trackAnchors,
        tolerance,
        ortho: directional && state.ortho,
        polarEnabled: directional && state.polarEnabled,
        polarStep: getPolarStep(),
        track: state.tracking && state.osnap,
      });
      state.cursor = result.p;
      if (result.mode !== "free") state.snap = result;
      acquireTrack(state.snap);
    } else acquireTrack(null);
    if (state.gridSnap && !state.snap && active) {
      const step = gridStep() / 5;
      state.cursor = {
        x: Math.round(state.cursor.x / step) * step,
        y: Math.round(state.cursor.y / step) * step,
      };
    }
    reportCursor(state);
  }
  function moveCursor(ev) {
    state.mouse = readPointer(ev);
    state.rawCursor = world(state.mouse);
    resolveCursor();
  }

  return {
    clearTracking,
    acquireTrack,
    resolveCursor,
    moveCursor,
    dispose: () => clearInterval(timer),
  };
}
