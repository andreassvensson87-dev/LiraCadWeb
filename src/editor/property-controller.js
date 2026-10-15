export function createPropertyController({
  model,
  creation,
  state,
  editSelected,
  refresh,
  renderLayers,
  schedule,
  log,
}) {
  function changeProperty(key, value, { source, hasTargets }) {
    if (source) {
      source[key] = value;
      refresh();
      schedule();
    } else if (hasTargets)
      editSelected("Egenskap", (e) => ({ ...e, [key]: value }));
    else {
      if (key === "layer") {
        const layer = model.document.layers.find((l) => l.id === value);
        if (!layer || layer.locked || layer.visible === false) {
          log("Välj ett synligt, olåst lager.");
          refresh();
          return;
        }
        model.activeLayer = value;
      }
      if (key === "color") creation.color = value;
      if (key === "lineType") creation.lineType = value;
      refresh();
      renderLayers();
      schedule();
    }
  }
  function activateLayer(id) {
    const layer = model.document.layers.find((l) => l.id === id);
    if (!layer) return;
    model.activeLayer = id;
    renderLayers();
    refresh();
  }
  return { changeProperty, activateLayer };
}
