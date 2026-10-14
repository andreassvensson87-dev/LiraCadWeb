import { referenceEntities } from "./references.js";
import { spaceOf } from "./layout.js";
import { drawingBounds } from "./entity-geometry.js";
import { viewportCamera } from "./layout.js";
import { uid } from "./values.js";
import { viewportClip } from "./scene-renderer.js";

export function createLayoutController({
  getDocument,
  layerOf,
  state,
  textEditor,
  finishTextEdit,
  syncViewport,
  setCreationMode,
  cancel,
  log,
  invalidateSpace,
  rebuild,
  renderInspector,
  schedule,
  getBlockEditor,
  spaceCameras,
  fit,
  update,
  commit,
  $,
}) {
  function modelExtentsCenter() {
    const es = [
      ...referenceEntities(getDocument()),
      ...getDocument().entities,
    ].filter(
      (e) =>
        spaceOf(e) === "model" && !e.hidden && layerOf(e)?.visible !== false,
    );
    if (!es.length) return { x: 0, y: 0 };
    const r = drawingBounds(es);
    return { x: (r.minX + r.maxX) / 2, y: (r.minY + r.maxY) / 2 };
  }
  function leaveViewport() {
    if (!state.activeViewportId) return;
    if (textEditor.active && !finishTextEdit(true)) return;
    syncViewport();
    state.activeViewportId = null;
    state.camera = state.paperCamera;
    state.paperCamera = null;
    setCreationMode("paper");
    cancel();
  }
  function enterViewport(e) {
    if (e.annotationScale)
      log(
        `Modellvy · annotationsskala 1:${e.annotationScale}. Ändringar av en skalvariant gäller denna annotationsskala.`,
      );
    if (textEditor.active && !finishTextEdit(true)) return;
    cancel();
    state.paperCamera = { ...state.camera };
    state.activeViewportId = e.id;
    invalidateSpace();
    setCreationMode("model");
    state.camera = viewportCamera(
      e,
      state.paperCamera,
      state.width,
      state.height,
    );
    rebuild();
    renderSpaceControls();
    renderInspector();
    schedule();
  }
  function switchSpace(id) {
    if (getBlockEditor()) return;
    if (textEditor.active && !finishTextEdit(true)) return;
    if (state.activeViewportId) leaveViewport();
    spaceCameras.set(state.activeSpace, { ...state.camera });
    state.activeSpace = id;
    cancel();
    if (spaceCameras.has(id)) state.camera = { ...spaceCameras.get(id) };
    else fit();
    setCreationMode(id === "model" ? "model" : "paper");
    update();
  }
  function createLayout() {
    if (getBlockEditor()) return;
    const id = uid();
    let number = (getDocument().layouts?.length || 0) + 1;
    while (
      getDocument().layouts?.some(
        (l) => l.name.toLowerCase() === `layout ${number}`,
      )
    )
      number++;
    commit("Ny layout", (draft) => {
      (draft.layouts ||= []).push({
        id,
        name: `Layout ${number}`,
        width: 420,
        height: 297,
      });
    });
    switchSpace(id);
  }
  function renderSpaceControls() {
    const tabs = $("#space-tabs");
    tabs.hidden = !!getBlockEditor();
    $("#new-layout").disabled = !!getBlockEditor();
    for (const id of ["new-file", "open-file", "demo-file", "export-dxf"])
      $("#" + id).disabled = !!getBlockEditor();
    const spaces = [
      ["model", "Model"],
      ...(getDocument().layouts || []).map((l) => [l.id, l.name]),
    ];
    if (tabs.dataset.spaces !== JSON.stringify(spaces)) {
      tabs.replaceChildren(
        ...spaces.map(([id, name]) => {
          const button = document.createElement("button");
          button.type = "button";
          button.dataset.space = id;
          button.textContent = name;
          button.setAttribute("role", "tab");
          button.onclick = () => switchSpace(id);
          return button;
        }),
      );
      tabs.dataset.spaces = JSON.stringify(spaces);
    }
    for (const button of tabs.children) {
      const active = button.dataset.space === state.activeSpace;
      button.setAttribute("aria-selected", String(active));
      button.tabIndex = active ? 0 : -1;
    }
    $("#viewport-create").disabled =
      state.activeSpace === "model" || !!state.activeViewportId;
    $("#paper-space").disabled = !state.activeViewportId;
    $("#space-context").textContent = getBlockEditor()
      ? "BLOCK · " + getDocument().name
      : state.activeViewportId
        ? "MODEL via viewport"
        : state.activeSpace === "model"
          ? "MODEL"
          : "PAPPER · mm";
    $("#export-sheet").disabled = state.activeSpace === "model";
  }
  function paperPoint(pixel) {
    const cam = state.paperCamera || state.camera;
    return {
      x: (pixel.x - state.width / 2) / cam.scale + cam.x,
      y: (state.height / 2 - pixel.y) / cam.scale + cam.y,
    };
  }
  function activeClip() {
    const e = getDocument().entities.find(
      (e) => e.id === state.activeViewportId,
    );
    if (!e) return null;
    return viewportClip(e, state.paperCamera, state.width, state.height);
  }
  function inActiveViewport(pixel) {
    const r = activeClip();
    return (
      !r ||
      (pixel.x >= r.x &&
        pixel.x <= r.x + r.w &&
        pixel.y >= r.y &&
        pixel.y <= r.y + r.h)
    );
  }

  return {
    modelExtentsCenter,
    leaveViewport,
    enterViewport,
    switchSpace,
    createLayout,
    renderSpaceControls,
    paperPoint,
    activeClip,
    inActiveViewport,
  };
}
