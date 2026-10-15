import { transforms } from "../commands/command-catalog.js";
// Inspector presentation reads context and emits edits through injected actions.
export function createInspectorController({
  document,
  state,
  $,
  detailCatalog,
  referencePanel,
  resize,
  selectedEntities,
  generalProperties,
  getBlockEditor,
  blockInspector,
  renderLayoutProperties,
  renderEntityProperties,
  appearanceFields,
  creationDefaults,
  schedule,
  erase,
}) {
  let inspectorMode = "properties";
  function showInspector(mode) {
    inspectorMode = mode;
    document.body.classList.toggle("catalog-open", mode !== "properties");
    for (const name of ["properties", "catalog", "references"]) {
      const active = mode === name,
        tab = $(`#${name}-tab`);
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
      $(`#${name}-panel`).hidden = !active;
    }
    $(".inspector-header h1").textContent =
      mode === "references"
        ? "Referenser"
        : mode === "catalog"
          ? "Detaljkatalog"
          : "Egenskaper";
    $("#selection-badge").hidden = mode !== "properties";
    renderInspector();
    resize();
  }
  for (const name of ["properties", "catalog", "references"]) {
    const tab = $(`#${name}-tab`);
    tab.onclick = () => showInspector(name);
    tab.onkeydown = (event) => {
      if (
        ![
          "ArrowLeft",
          "ArrowRight",
          "ArrowUp",
          "ArrowDown",
          "Home",
          "End",
        ].includes(event.key)
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      const names = ["properties", "catalog", "references"],
        index = names.indexOf(name);
      const target =
        event.key === "Home"
          ? names[0]
          : event.key === "End"
            ? names.at(-1)
            : names[
                (index +
                  (["ArrowRight", "ArrowDown"].includes(event.key) ? 1 : 2)) %
                  names.length
              ];
      showInspector(target);
      $(`#${target}-tab`).focus();
    };
  }

  function creationInspector(root) {
    const source = state.tool.name === "DIMCONTINUE" ? state.tool.source : null;
    if (source) {
      appearanceFields(root, source, (key, value) => {
        source[key] = value;
        schedule();
      });
      return;
    }
    const type = state.tool.name.startsWith("DIM")
      ? "dimension"
      : { TEXT: "text", LEADER: "leader", HATCH: "hatch" }[state.tool.name];
    if (type)
      appearanceFields(
        root,
        { type, ...creationDefaults[type] },
        (key, value) => {
          creationDefaults[type][key] = value;
          schedule();
        },
      );
  }
  function renderInspector() {
    if (inspectorMode === "catalog") {
      detailCatalog.refresh();
      return;
    }
    if (inspectorMode === "references") {
      referencePanel.refresh();
      return;
    }
    const root = $("#properties-panel");
    root.replaceChildren();
    const es = selectedEntities();
    const names = {
      line: "Linje",
      polyline: "Polylinje",
      circle: "Cirkel",
      arc: "Båge",
      text: "Text",
      leader: "Hänvisning",
      hatch: "Skraffering",
      dimension: "Mått",
      block: "Block",
      viewport: "Viewport",
    };
    $(".inspector-header h1").textContent =
      es.length === 1
        ? names[es[0].type] || "Egenskaper"
        : es.length > 1
          ? "Flera objekt"
          : "Egenskaper";
    $("#selection-badge").textContent = es.length
      ? `${es.length} ${es.length === 1 ? "vald" : "valda"}`
      : "Nya objekt";
    const creating =
      state.tool &&
      !transforms.includes(state.tool.name) &&
      ![
        "ERASE",
        "OFFSET",
        "JOIN",
        "EXPLODE",
        "PINSERT",
        "PDELETE",
        "FILLET",
        "CHAMFER",
      ].includes(state.tool.name);
    if (
      getBlockEditor() ||
      creating ||
      es.length !== 1 ||
      es[0].type !== "block"
    )
      generalProperties(root);
    if (getBlockEditor()) blockInspector.renderEditor(root);
    if (
      state.tool &&
      !transforms.includes(state.tool.name) &&
      ![
        "ERASE",
        "OFFSET",
        "JOIN",
        "EXPLODE",
        "PINSERT",
        "PDELETE",
        "FILLET",
        "CHAMFER",
      ].includes(state.tool.name)
    ) {
      creationInspector(root);
      return;
    }
    if (!es.length) {
      if (state.activeSpace !== "model" && !state.activeViewportId)
        renderLayoutProperties(root, state.activeSpace);
      return;
    }
    if (es.length === 1 && es[0].type === "block") {
      blockInspector.renderInstance(root, es[0]);
      return;
    }
    if (es.length === 1) renderEntityProperties(root, es[0]);
    const b = document.createElement("button");
    b.className = "subtle-button";
    b.textContent = "Radera markerade";
    b.onclick = erase;
    root.append(b);
  }

  return { show: showInspector, render: renderInspector };
}
