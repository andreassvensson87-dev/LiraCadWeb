import { lineTypes } from "./linetypes.js";
import { uid } from "./values.js";

// Render from current data; mutations are sent to the document transaction owner.
export function createLayerPanel({
  document, root, getDocument, getActiveLayer, activateLayer,
  commit, cancel, log, field, choice, action,
}) {
  const edit = (id, label, patch) => commit(label, (draft) => {
    const layer = draft.layers.find((l) => l.id === id);
    if (!layer) throw Error("Lagret finns inte längre.");
    Object.assign(layer, typeof patch === "function" ? patch(layer) : patch);
  });
  return function renderLayers() {
    root.replaceChildren();
    for (const l of getDocument().layers) {
      const row = document.createElement("div");
      row.className = "layer-row" + (l.id === getActiveLayer() ? " current" : "");
      const color = document.createElement("input");
      color.type = "color";
      color.value = l.color;
      color.title = "Lagerfärg";
      color.onchange = () => edit(l.id, "Lagerfärg", { color: color.value });
      const eye = document.createElement("button");
      eye.textContent = l.visible === false ? "○" : "◉";
      eye.title = l.visible === false ? "Visa lager" : "Dölj lager";
      eye.onclick = () => {
        cancel(false);
        edit(l.id, "Lagersynlighet", (layer) => ({ visible: layer.visible === false }));
      };
      const lock = document.createElement("button");
      lock.textContent = l.locked ? "▣" : "▢";
      lock.title = l.locked ? "Lås upp lager" : "Lås lager";
      lock.onclick = () => {
        cancel(false);
        edit(l.id, "Lås lager", (layer) => ({ locked: !layer.locked }));
      };
      const lineType = choice("Linjetyp", l.lineType || "CONTINUOUS",
        lineTypes.map(([id, label]) => [id, label]),
        (v) => edit(l.id, "Lagerlinjetyp", { lineType: v }));
      const rename = field("Namn", l.name, (v) => {
        if (v.trim() && !getDocument().layers.some((other) =>
          other.id !== l.id && other.name.toLowerCase() === v.trim().toLowerCase()))
          edit(l.id, "Lagernamn", { name: v.trim() });
        else {
          log("Lagernamnet måste vara unikt.");
          renderLayers();
        }
      }, "text");
      const current = action(l.id === getActiveLayer() ? "Aktivt" : "Aktivera",
        () => activateLayer(l.id));
      row.append(color, rename, lineType, eye, lock, current);
      root.append(row);
    }
    const button = action("+ Nytt lager", () => {
      const id = uid();
      commit("Nytt lager", (draft) => {
        draft.layers.push({
          id, name: `Lager ${draft.layers.length + 1}`, color: "#9cd4b5",
          visible: true, locked: false,
        });
      });
      activateLayer(id);
    });
    root.append(button);
  };
}
