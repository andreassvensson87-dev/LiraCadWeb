import { DocumentSession } from "./document-session.js";

export function createProjectController({
  model,
  projectWorkspace,
  state,
  spaceCameras,
  editor,
  wblockDialog,
  clearTracking,
  emptyDocument,
  selectionController,
  rebuild,
  hideCompletion,
  input,
  viewportController,
  update,
  $,
  canvas,
  resize,
  prompt,
  fit,
  showProjectSaveState,
  documentWorkflow,
  log,
  textEditor,
  finishTextEdit,
  syncViewport,
  cancel,
}) {
  function captureProjectContext() {
    if (model.blockEditor) return;
    const entry = projectWorkspace.active;
    if (!entry) return;
    entry.context = {
      activeLayer: model.activeLayer,
      selection: [...state.selection],
      camera: { ...state.camera },
      activeSpace: state.activeSpace,
      activeViewportId: state.activeViewportId,
      paperCamera: state.paperCamera && { ...state.paperCamera },
      spaceCameras: [...spaceCameras],
      dirty: model.dirty,
    };
    projectWorkspace.persist();
  }
  function activateProject(entry) {
    if (!entry) {
      editor.cancel();
      wblockDialog.dismiss();
      state.tool = null;
      state.drag = null;
      state.hover = null;
      state.snap = null;
      state.selection.clear();
      clearTracking();
      state.space = false;
      state.spaceUsed = false;
      model.dirty = false;
      model.session = new DocumentSession(emptyDocument());
      model.document = model.session.document;
      model.history = model.session.history;
      model.storage = null;
      model.activeLayer = model.document.layers[0].id;
      state.activeSpace = "model";
      state.activeViewportId = null;
      state.paperCamera = null;
      spaceCameras.clear();
      selectionController.clear();
      rebuild();
      hideCompletion();
      input.value = "";
      viewportController.resetNavigation();
      update();
      return;
    }
    projectWorkspace.activeId = entry.id;
    model.session = entry.session;
    model.document = model.session.document;
    model.history = model.session.history;
    model.storage = entry.storage;
    const saved = entry.context || {};
    const validCamera = (value) =>
      value &&
      [value.x, value.y, value.scale].every(Number.isFinite) &&
      value.scale > 0;
    model.activeLayer = model.document.layers.some(
      (layer) => layer.id === saved.activeLayer,
    )
      ? saved.activeLayer
      : model.document.layers[0].id;
    state.selection = new Set(
      Array.isArray(saved.selection) ? saved.selection : [],
    );
    state.activeSpace = saved.activeSpace || "model";
    state.activeViewportId = saved.activeViewportId || null;
    state.camera = validCamera(saved.camera)
      ? { ...saved.camera }
      : { x: 0, y: 0, scale: 0.075 };
    state.paperCamera = validCamera(saved.paperCamera)
      ? { ...saved.paperCamera }
      : null;
    spaceCameras.clear();
    if (Array.isArray(saved.spaceCameras))
      for (const pair of saved.spaceCameras)
        if (
          Array.isArray(pair) &&
          typeof pair[0] === "string" &&
          validCamera(pair[1])
        )
          spaceCameras.set(pair[0], { ...pair[1] });
    model.dirty = !!saved.dirty;
    editor.cancel();
    state.tool = null;
    state.drag = null;
    state.hover = null;
    state.snap = null;
    state.space = false;
    state.spaceUsed = false;
    clearTracking();
    input.value = "";
    $("#suggestions").hidden = true;
    canvas.style.cursor = "crosshair";
    viewportController.resetNavigation();
    // Retain a single set of render/snap indexes, even with many open projects.
    selectionController.clear();
    update();
    resize();
    prompt();
    if (!entry.context) fit();
    projectWorkspace.persist();
    showProjectSaveState(entry);
  }
  function prepareProjectSwitch() {
    if (documentWorkflow.opening) {
      log("Vänta tills filen har öppnats.");
      return false;
    }
    if (model.blockEditor) {
      log("Spara eller avbryt blockredigeringen innan du byter projekt.");
      return false;
    }
    if (!projectWorkspace.active) return true;
    if (textEditor.active && !finishTextEdit(true)) return false;
    syncViewport();
    cancel(false);
    captureProjectContext();
    model.storage
      .flush()
      .catch((error) =>
        log("Projektet kunde inte autosparas: " + error.message),
      );
    return true;
  }
  function switchProject(id) {
    if (id === projectWorkspace.activeId || !prepareProjectSwitch()) return;
    const entry = projectWorkspace.entries.find((entry) => entry.id === id);
    if (entry) {
      activateProject(entry);
      canvas.focus();
    }
  }

  return {
    captureProjectContext,
    activateProject,
    prepareProjectSwitch,
    switchProject,
  };
}
