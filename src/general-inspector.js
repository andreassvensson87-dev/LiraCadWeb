import { transforms } from "./command-catalog.js";
import { lineTypes } from "./linetypes.js";

export function createGeneralInspector({ document, choice, colorFields, getContext, changeProperty }) {
  function layerSelect(onChange, value) {
    const label = document.createElement("label");
    label.className = "field";
    label.textContent = "Lager";
    const select = document.createElement("select");
    if (value === "") {
      const o = document.createElement("option");
      o.textContent = "Blandat";
      o.value = "";
      select.append(o);
    }
    for (const l of getContext().doc.layers) {
      const o = document.createElement("option");
      o.value = l.id;
      o.textContent = l.name + (l.locked ? " · låst" : "");
      select.append(o);
    }
    select.value = value;
    select.onchange = () => onChange(select.value);
    label.append(select);
    return label;
  }
  function render(root) {
    const { doc, tool, es, activeLayer, creationColor, creationLineType } = getContext();
    const creating =
      tool &&
      !transforms.includes(tool.name) &&
      ![
        "ERASE",
        "OFFSET",
        "JOIN",
        "EXPLODE",
        "PINSERT",
        "PDELETE",
        "FILLET",
        "CHAMFER",
        "TRIM",
        "EXTEND",
      ].includes(tool.name);
    const source = tool?.name === "DIMCONTINUE" ? tool.source : null;
    const targets = source ? [source] : creating ? [] : es;
    const shared = (key, fallback) =>
      targets.length
        ? targets.every(
            (e) => (e[key] ?? fallback) === (targets[0][key] ?? fallback),
          )
          ? (targets[0][key] ?? fallback)
          : "mixed"
        : fallback;
    const change = (key, value) => changeProperty(key, value, { source, hasTargets: targets.length > 0 });
    const layer = shared("layer", activeLayer);
    const group = document.createElement("div");
    group.className = "general-properties";
    group.append(
      layerSelect((v) => change("layer", v), layer === "mixed" ? "" : layer),
    );
    colorFields(
      group,
      shared("color", targets.length ? null : creationColor),
      doc.layers.find((l) => l.id === layer)?.color,
      (v) => change("color", v),
    );
    const type = shared(
      "lineType",
      targets.length ? "BYLAYER" : creationLineType,
    );
    group.append(
      choice(
        "Linjetyp",
        type,
        [
          ...(type === "mixed" ? [["mixed", "Blandat"]] : []),
          ["BYLAYER", "Enligt lager"],
          ...lineTypes.map(([id, label]) => [id, label]),
        ],
        (v) => {
          if (v !== "mixed") change("lineType", v);
        },
      ),
    );
    root.append(group);
  }
  return render;
}
