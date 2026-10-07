import { lineTypes } from "./linetypes.js";
import { uid } from "./values.js";
import { aciColors } from "./dxf-colors.js";

const colorNames = ["Röd", "Gul", "Grön", "Cyan", "Blå", "Magenta", "Vit", "Grå", "Ljusgrå"];
const icons = {
  current: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  inactive: '<circle cx="12" cy="12" r="9"/>',
  visible: '<path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6-10-6-10-6Z"/><circle cx="12" cy="12" r="3"/>',
  hidden: '<path d="M3 9c2-2 5-3 9-3 6 0 10 6 10 6a23 23 0 0 1-4 4M14 18c-7 1-12-6-12-6l3-4M3 21 21 3"/>',
  locked: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  unlocked: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0"/>',
};

function colorName(value) {
  const index = aciColors.indexOf(value.toLowerCase(), 1);
  return colorNames[index - 1] || (value.toLowerCase() === "#000000" ? "Svart" : index > 0 ? `ACI ${index}` : value.toUpperCase());
}

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
  const iconButton = (icon, label, pressed, onclick) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "layer-icon-button";
    button.title = label;
    button.setAttribute("aria-label", label);
    button.setAttribute("aria-pressed", String(pressed));
    button.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${icons[icon]}</svg>`;
    button.onclick = onclick;
    return button;
  };
  return function renderLayers() {
    const scrollTop = root.querySelector(".layer-table-scroll")?.scrollTop || 0;
    root.replaceChildren();
    const toolbar = document.createElement("div");
    toolbar.className = "layer-toolbar";
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
    toolbar.append(button);
    const scroll = document.createElement("div");
    scroll.className = "layer-table-scroll";
    const table = document.createElement("table");
    table.className = "layer-table";
    table.setAttribute("aria-label", "Lager");
    const head = document.createElement("thead");
    const headings = document.createElement("tr");
    for (const label of ["Aktivt", "Namn", "Färg", "Linjetyp", "Visa", "Lås", "Skriv ut"]) {
      const th = document.createElement("th");
      th.scope = "col";
      th.textContent = label;
      headings.append(th);
    }
    head.append(headings);
    const body = document.createElement("tbody");
    for (const l of getDocument().layers) {
      const row = document.createElement("tr");
      row.className = "layer-row" + (l.id === getActiveLayer() ? " current" : "");
      const color = document.createElement("input");
      color.type = "color";
      color.value = l.color;
      color.title = `Lagerfärg: ${l.name}`;
      color.setAttribute("aria-label", color.title);
      color.onchange = () => edit(l.id, "Lagerfärg", { color: color.value });
      const colorCell = document.createElement("div");
      colorCell.className = "layer-color-cell";
      const colorLabel = document.createElement("span");
      colorLabel.textContent = colorName(l.color);
      colorCell.append(color, colorLabel);
      const eye = iconButton(l.visible === false ? "hidden" : "visible", `${l.visible === false ? "Visa" : "Dölj"} lager: ${l.name}`, l.visible !== false, () => {
        cancel(false);
        edit(l.id, "Lagersynlighet", (layer) => ({ visible: layer.visible === false }));
      });
      const lock = iconButton(l.locked ? "locked" : "unlocked", `${l.locked ? "Lås upp" : "Lås"} lager: ${l.name}`, !!l.locked, () => {
        cancel(false);
        edit(l.id, "Lås lager", (layer) => ({ locked: !layer.locked }));
      });
      const lineType = choice(`Linjetyp: ${l.name}`, l.lineType || "CONTINUOUS",
        lineTypes.map(([id, label]) => [id, label]),
        (v) => edit(l.id, "Lagerlinjetyp", { lineType: v }));
      const lineCell = document.createElement("div");
      lineCell.className = "layer-line-cell";
      const sample = document.createElement("span");
      sample.className = `layer-line-sample line-${l.lineType || "CONTINUOUS"}`;
      sample.setAttribute("aria-hidden", "true");
      lineCell.append(sample, lineType);
      const rename = field(`Namn: ${l.name}`, l.name, (v) => {
        if (v.trim() && !getDocument().layers.some((other) =>
          other.id !== l.id && other.name.toLowerCase() === v.trim().toLowerCase()))
          edit(l.id, "Lagernamn", { name: v.trim() });
        else {
          log("Lagernamnet måste vara unikt.");
          renderLayers();
        }
      }, "text");
      const current = iconButton(l.id === getActiveLayer() ? "current" : "inactive", `Aktivera lager: ${l.name}`, l.id === getActiveLayer(),
        () => activateLayer(l.id));
      const plot = document.createElement("input");
      plot.type = "checkbox";
      plot.checked = l.plot !== false;
      plot.title = `Skriv ut lager: ${l.name}`;
      plot.setAttribute("aria-label", plot.title);
      plot.onchange = () => edit(l.id, "Lagerutskrift", { plot: plot.checked });
      for (const control of [current, rename, colorCell, lineCell, eye, lock, plot]) {
        const cell = document.createElement("td");
        cell.append(control);
        row.append(cell);
      }
      body.append(row);
    }
    table.append(head, body);
    scroll.append(table);
    const footer = document.createElement("div");
    footer.className = "layer-status";
    footer.textContent = `Aktivt lager: ${getDocument().layers.find(l => l.id === getActiveLayer())?.name || "—"}`;
    root.append(toolbar, scroll, footer);
    scroll.scrollTop = scrollTop;
  };
}
