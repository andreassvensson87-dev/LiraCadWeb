import { createSceneRenderer } from "../rendering/scene-renderer.js";
import { drawingBounds } from "../model/entity-geometry.js";
import { viewportCamera } from "../model/layout.js";
import { gridSpacing } from "../model/view-geometry.js";
import { moveGripTargets } from "../model/grips.js";

export function createViewportController({
  ctx,
  state,
  getDocument,
  log,
  getInteractionEntities,
  visible,
  getBlockEditor,
  blockInspector,
  syncViewport,
  canvas,
  textEditor,
  previewEntities,
  textEditPreview,
  movedViewport,
  editor,
  hit,
  getEditableIds,
  getSceneIndex,
  reportZoom = () => {},
  requestFrame = (callback) => requestAnimationFrame(callback),
  createResizeObserver = (callback) => new ResizeObserver(callback),
  getPixelRatio = () => devicePixelRatio || 1,
}) {
  let drawPending = false;
  const renderScene = createSceneRenderer({ ctx });
  let navigationDeadline = 0,
    navigationTimer;
  function navigating() {
    navigationDeadline = performance.now() + 120;
    clearTimeout(navigationTimer);
    navigationTimer = setTimeout(schedule, 130);
  }
  function schedule() {
    if (!drawPending) {
      drawPending = true;
      requestFrame(() => {
        drawPending = false;
        render();
      });
    }
  }
  function fit() {
    if (
      state.activeViewportId &&
      getDocument().entities.find((e) => e.id === state.activeViewportId)
        ?.locked
    ) {
      log("Lås upp viewporten för att ändra vyn.");
      return;
    }
    if (state.activeSpace !== "model" && !state.activeViewportId) {
      const l = getDocument().layouts.find((l) => l.id === state.activeSpace);
      state.camera = {
        x: l.width / 2,
        y: l.height / 2,
        scale: Math.max(
          0.01,
          Math.min(
            (state.width - 50) / l.width,
            (state.height - 50) / l.height,
          ),
        ),
      };
      schedule();
      return;
    }
    const es = (getInteractionEntities() || getDocument().entities).filter(
      visible,
    );
    const parameter = getBlockEditor() && blockInspector.getActiveParameter();
    if (parameter)
      es.push({
        type: "polyline",
        points: [
          parameter.start,
          parameter.end,
          { x: parameter.window.minX, y: parameter.window.minY },
          { x: parameter.window.maxX, y: parameter.window.maxY },
        ],
      });
    if (!es.length) {
      state.camera = { x: 0, y: 0, scale: 0.1 };
      schedule();
      return;
    }
    const r = drawingBounds(es);
    state.camera = {
      x: (r.minX + r.maxX) / 2,
      y: (r.minY + r.maxY) / 2,
      scale: Math.min(
        (state.width - 145) / Math.max(r.maxX - r.minX, 500),
        (state.height - 90) / Math.max(r.maxY - r.minY, 500),
      ),
    };
    state.camera.scale = Math.max(0.000001, state.camera.scale);
    schedule();
  }
  function resize() {
    syncViewport();
    const r = canvas.getBoundingClientRect();
    state.width = r.width;
    state.height = r.height;
    if (state.width <= 0 || state.height <= 0) return;
    if (state.activeViewportId) {
      const v = getDocument().entities.find(
        (e) => e.id === state.activeViewportId,
      );
      if (v)
        state.camera = viewportCamera(
          v,
          state.paperCamera,
          state.width,
          state.height,
        );
    }
    if (textEditor.active) textEditor.position();
    state.dpr = getPixelRatio();
    canvas.width = state.width * state.dpr;
    canvas.height = state.height * state.dpr;
    schedule();
  }
  createResizeObserver(resize).observe(canvas);
  const gridStep = () => gridSpacing(state.camera.scale);
  function render() {
    if (state.width <= 0 || state.height <= 0) return;
    const gripPreviews =
      state.drag?.kind === "grip"
        ? moveGripTargets(state.drag.targets, state.cursor)
        : [];
    renderScene({
      doc: {
        ...getDocument(),
        entities: getInteractionEntities() || getDocument().entities,
      },
      camera: state.camera,
      paperCamera: state.paperCamera,
      width: state.width,
      height: state.height,
      dpr: state.dpr,
      activeSpace: state.activeSpace,
      activeViewportId: state.activeViewportId,
      selection: state.selection,
      hover: state.hover,
      tool: state.tool,
      cursor: state.cursor,
      mouse: state.mouse,
      showGrid: state.showGrid,
      drag: state.drag,
      trackAnchors: state.trackAnchors,
      snap: state.snap,
      previews: previewEntities(),
      gripPreviews,
      blockParameter: getBlockEditor()
        ? blockInspector.getActiveParameter()
        : null,
      textReplacement: textEditPreview(),
      movedViewport:
        state.drag?.kind === "viewportMove" && state.drag.moved
          ? movedViewport()
          : null,
      previewTargets:
        state.tool?.sweep?.changes.map((change) => change.id) || [],
      previewTarget:
        !state.tool?.sweep &&
        state.tool &&
        ["TRIM", "EXTEND"].includes(state.tool.name) &&
        state.tool.phase === "trimPick" &&
        editor.preview(state.cursor).length
          ? hit(state.rawCursor)?.id
          : null,
      editableIds: getEditableIds(),
      sceneIndex: getSceneIndex(),
      interactionEntities: getInteractionEntities(),
      navigating:
        getDocument().entities.length > 2000 &&
        performance.now() < navigationDeadline,
    });
    reportZoom(state.camera.scale);
  }

  return {
    schedule,
    navigating,
    fit,
    resize,
    gridStep,
    resetNavigation: () => {
      clearTimeout(navigationTimer);
      navigationDeadline = 0;
    },
  };
}
