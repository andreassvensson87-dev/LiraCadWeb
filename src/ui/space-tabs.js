export function createSpaceTabs({
  document,
  $,
  getBlockEditor,
  getDocument,
  state,
  switchSpace,
}) {
  function render() {
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

  return { render };
}
