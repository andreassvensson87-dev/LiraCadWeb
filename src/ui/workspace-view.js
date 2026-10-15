export function createWorkspaceView({
  document,
  $,
  renderLayers,
  projectWorkspace,
  $$,
  model,
  input,
  canvas,
}) {
  async function pickReferenceFiles({ folder = false, multiple = true } = {}) {
    return new Promise((resolve) => {
      const picker = document.createElement("input");
      picker.type = "file";
      picker.accept = ".dwg,.dxf,.liracad";
      picker.multiple = multiple;
      picker.hidden = true;
      if (folder) picker.setAttribute("webkitdirectory", "");
      const finish = () => {
        const files = [...picker.files];
        picker.remove();
        resolve(files);
      };
      picker.onchange = finish;
      picker.oncancel = () => {
        picker.remove();
        resolve([]);
      };
      document.body.append(picker);
      picker.click();
    });
  }
  function log(s) {
    const el = document.createElement("div");
    el.textContent = s;
    el.className = "recent";
    $("#command-log .recent")?.classList.remove("recent");
    $("#command-log").append(el);
    while ($("#command-log").children.length > 50)
      $("#command-log").firstChild.remove();
    $("#command-log").scrollTop = 1e9;
  }
  function panel(which) {
    if (which === "layers") {
      renderLayers();
      $("#layer-dialog").showModal();
    } else if ($("#layer-dialog").open) $("#layer-dialog").close();
  }
  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type })),
      a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function renderWorkspaceState() {
    const empty = !projectWorkspace.active;
    document.body.classList.toggle("workspace-empty", empty);
    $("#empty-workspace").hidden = !empty;
    for (const element of $$(
      "#canvas, .tabs, .ribbon, main > aside, .drawing-tabs, .command-panel, body > footer",
    ))
      element.inert = empty;
    $("#save-file").disabled = empty;
    $("#export-dxf").disabled = empty || !!model.blockEditor;
    input.disabled = empty;
    if (empty) {
      $("#undo").disabled = true;
      $("#redo").disabled = true;
      $("#document-name").textContent = "Ingen ritning öppen";
      $("#save-state").textContent = "";
      $("#save-state").title = "";
    }
  }
  function focusWorkspace() {
    (projectWorkspace.active ? canvas : $("#empty-new")).focus();
  }
  function renderToggles(next) {
    for (const [id, key] of [
      ["snap-toggle", "osnap"],
      ["ortho-toggle", "ortho"],
      ["polar-toggle", "polarEnabled"],
      ["track-toggle", "tracking"],
      ["grid-snap-toggle", "gridSnap"],
    ])
      $("#" + id).classList.toggle("on", next[key]);
  }
  function renderDocumentInfo(state) {
    $("#document-name").textContent = model.document.name;
    $("#entity-count").textContent =
      `${model.document.entities.length} objekt · mm`;
    $("#selection-badge").textContent = state.selection.size;
    $("#undo").disabled = !model.history.past.length;
    $("#redo").disabled = !model.history.future.length;
    $("#layer-count").textContent = `${model.document.layers.length} lager`;
  }
  return {
    renderDocumentInfo,
    renderToggles,
    log,
    renderWorkspaceState,
    focusWorkspace,
    panel,
    download,
    pickReferenceFiles,
  };
}
