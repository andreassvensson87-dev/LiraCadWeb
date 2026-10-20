export function createWorkspaceBindings({
  document,
  newDrawing,
  openDemo,
  exportSheet,
  zoom,
  toggleGrid,
  $,
  initialProject,
  panel,
  start,
  fit,
  state,
  schedule,
  toggle,
  resolveCursor,
  undo,
  saveProject,
  exportDxf,
  model,
  log,
  getFileOpenQueue,
  createLayout,
  leaveViewport,
  clipboard,
}) {
  $("#navigation-device").addEventListener("change", () => {
    try {
      localStorage.setItem("liracad-navigation", $("#navigation-device").value);
    } catch {}
  });
  $("#save-state").textContent = "Läser projekt…";
  $("#save-state").textContent = initialProject?.saveState || "";
  $("#save-state").title = initialProject?.saveError?.message || "";
  $("#layers-tab").onclick = () => panel("layers");
  $("#close-layers").onclick = () => $("#layer-dialog").close();
  document.addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-command]");
    if (b) start(b.dataset.command);
    const clipboardButton = ev.target.closest("[data-clipboard]");
    if (clipboardButton) clipboard[clipboardButton.dataset.clipboard]();
  });
  $("#fit-view").onclick = fit;
  $("#toggle-grid").classList.toggle("active", state.showGrid);
  $("#toggle-grid").setAttribute("aria-pressed", String(state.showGrid));
  $("#toggle-grid").onclick = () => {
    toggleGrid();
    $("#toggle-grid").classList.toggle("active", state.showGrid);
    $("#toggle-grid").setAttribute("aria-pressed", String(state.showGrid));
    schedule();
  };
  $("#snap-toggle").onclick = () => toggle("snap");
  $("#ortho-toggle").onclick = () => toggle("ortho");
  $("#polar-toggle").onclick = () => toggle("polar");
  $("#track-toggle").onclick = () => toggle("track");
  $("#polar-step").onchange = () => {
    resolveCursor();
    schedule();
  };
  $("#grid-snap-toggle").onclick = () => toggle("gridSnap");
  $("#undo").onclick = () => undo();
  $("#redo").onclick = () => undo(true);
  $("#save-file").onclick = saveProject;
  $("#export-dxf").onclick = exportDxf;
  $("#open-file").onclick = () => $("#file-input").click();
  $("#queued-files").onclick = () => {
    if (model.blockEditor)
      log("Avsluta blockredigeringen först. Filerna finns kvar i kön.");
    else getFileOpenQueue().resume();
  };
  $("#file-input").onchange = (ev) => {
    const files = Array.from(ev.target.files);
    ev.target.value = "";
    getFileOpenQueue().enqueueFiles(files);
  };
  $("#new-file").onclick = newDrawing;
  $("#demo-file").onclick = openDemo;
  $("#help-button").onclick = () => $("#help-dialog").showModal();
  $("#close-help").onclick = $("#start-drawing").onclick = () =>
    $("#help-dialog").close();
  $("#space-tabs").onkeydown = (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    const buttons = [...$("#space-tabs").children];
    const index = buttons.indexOf(document.activeElement);
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? buttons.length - 1
          : (index + (event.key === "ArrowRight" ? 1 : -1) + buttons.length) %
            buttons.length;
    buttons[next].click();
    buttons[next].focus();
  };
  $("#new-layout").onclick = createLayout;
  $("#paper-space").onclick = leaveViewport;
  $("#export-sheet").onclick = exportSheet;
  for (const [id, factor] of [
    ["#zoom-out", 1 / 1.25],
    ["#zoom-in", 1.25],
  ]) {
    $(id).onclick = () => zoom(factor);
  }
  return {};
}
