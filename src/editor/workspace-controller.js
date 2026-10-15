export function createWorkspaceController({
  model,
  state,
  projectWorkspace,
  renderWorkspaceState,
  renderProjectTabs,
  renderInspector,
  schedule,
  setCreationMode,
  drawingSpace,
  renderSpaceControls,
  rebuild,
  getSelectionController,
  renderDocumentInfo,
  renderLayers,
}) {
  function update() {
    renderWorkspaceState();
    if (!projectWorkspace.active) {
      renderProjectTabs();
      renderInspector();
      schedule();
      return;
    }
    if (
      state.activeSpace !== "model" &&
      !model.document.layouts?.some((l) => l.id === state.activeSpace)
    ) {
      state.activeSpace = "model";
      state.activeViewportId = null;
      state.paperCamera = null;
    }
    if (
      state.activeViewportId &&
      !model.document.entities.some((e) => e.id === state.activeViewportId)
    ) {
      state.activeViewportId = null;
      state.camera = state.paperCamera || state.camera;
      state.paperCamera = null;
    }
    setCreationMode(drawingSpace() === "model" ? "model" : "paper");
    renderSpaceControls();
    rebuild();
    state.selection = new Set(
      [...state.selection].filter((id) =>
        getSelectionController().editableIds.has(id),
      ),
    );
    renderDocumentInfo();
    renderProjectTabs();
    renderInspector();
    renderLayers();
    schedule();
  }
  return { update };
}
