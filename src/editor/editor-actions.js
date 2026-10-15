import { viewportFromCamera } from "../model/layout.js";

export function createEditorActions({
  projectWorkspace,
  model,
  drawingSpace,
  currentViewport,
  state,
  getDocumentEditor,
  getTextEditor,
  finishTextEdit,
  cancel,
  update,
  log,
  editor,
  dispatchEditor,
  prompt,
  schedule,
  clearTracking,
  focusCanvas,
  reportToggles,
  resolveCursor,
}) {
  function catalogPlacementReason() {
    if (!projectWorkspace.active) return "Öppna eller skapa en ritning först.";
    if (model.blockEditor) return "Avsluta blockeditorn först.";
    if (drawingSpace() !== "model")
      return "Växla till Model för att placera en detalj.";
    const layer = model.document.layers.find((l) => l.id === model.activeLayer);
    return !layer || layer.locked || layer.visible === false
      ? "Välj ett synligt, olåst lager först."
      : "";
  }
  function syncViewport() {
    const entity = currentViewport();
    if (!entity || entity.locked || !state.paperCamera) return;
    getDocumentEditor().updateViewportView(
      entity.id,
      viewportFromCamera(
        entity,
        state.camera,
        state.paperCamera,
        state.width,
        state.height,
      ),
    );
  }
  function undo(redo = false) {
    if (getTextEditor().active && !finishTextEdit(true)) return;
    cancel(false);
    const d = redo ? getDocumentEditor().redo() : getDocumentEditor().undo();
    if (d) {
      if (!model.document.layers.some((l) => l.id === model.activeLayer))
        model.activeLayer = model.document.layers[0].id;
      state.selection.clear();
      update();
      log(redo ? "Gör om." : "Ångrat.");
    }
  }
  function setTrimShift(value) {
    if (state.trimShift === !!value) return;
    state.trimShift = !!value;
    if (
      editor.owns(state.tool) &&
      ["TRIM", "EXTEND"].includes(state.tool.name)
    ) {
      dispatchEditor({ type: "modifier", shift: state.trimShift });
      prompt();
      schedule();
    }
  }
  function toggle(kind) {
    if (kind === "snap") state.osnap = !state.osnap;
    if (kind === "ortho") {
      state.ortho = !state.ortho;
      if (state.ortho) state.polarEnabled = false;
    }
    if (kind === "polar") {
      state.polarEnabled = !state.polarEnabled;
      if (state.polarEnabled) state.ortho = false;
    }
    if (kind === "track") state.tracking = !state.tracking;
    if (!state.tracking || !state.osnap) clearTracking();
    if (kind === "gridSnap") state.gridSnap = !state.gridSnap;
    reportToggles(state);
    resolveCursor();
    schedule();
  }
  function zoom(factor) {
    if (getTextEditor().active) return;
    if (currentViewport()?.locked) {
      log("Lås upp viewporten för att ändra vyn.");
      return;
    }
    state.camera.scale = Math.max(
      1e-7,
      Math.min(10000, state.camera.scale * factor),
    );
    syncViewport();
    resolveCursor();
    schedule();
  }
  function toggleGrid() {
    state.showGrid = !state.showGrid;
    schedule();
  }
  function placeCatalog(placement) {
    const reason = catalogPlacementReason();
    if (reason) {
      log(reason);
      return;
    }
    if (getTextEditor().active && !finishTextEdit(true)) return;
    cancel(false);
    editor.start("INSERT");
    editor.dispatch({ type: "catalog", ...placement });
    state.lastCommand = "INSERT";
    prompt();
    focusCanvas();
  }
  return {
    placeCatalog,
    zoom,
    toggleGrid,
    undo,
    setTrimShift,
    toggle,
    syncViewport,
    catalogPlacementReason,
  };
}
