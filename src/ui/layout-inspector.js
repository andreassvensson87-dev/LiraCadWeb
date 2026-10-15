export function createLayoutInspector({
  field,
  choice,
  section,
  action,
  getDocument,
  editLayout,
  removeLayout,
  recoverViews,
}) {
  return function render(root, id) {
    const layout = getDocument().layouts?.find((l) => l.id === id);
    if (!layout) return;
    const panel = section("PAPPER");
    panel.append(
      field(
        "Namn",
        layout.name,
        (name) => editLayout(id, "Layoutnamn", { name }),
        "text",
      ),
    );
    panel.append(
      choice(
        "Format",
        `${layout.width}x${layout.height}`,
        [
          ["841x594", "A1 liggande"],
          ["594x841", "A1 stående"],
          ["594x420", "A2 liggande"],
          ["420x594", "A2 stående"],
          ["420x297", "A3 liggande"],
          ["297x420", "A3 stående"],
          ["297x210", "A4 liggande"],
          ["210x297", "A4 stående"],
        ],
        (value) => {
          const [width, height] = value.split("x").map(Number);
          editLayout(id, "Pappersformat", { width, height });
        },
      ),
    );
    panel.append(
      choice(
        "Utskriftsfärg",
        !!layout.monochrome,
        [
          ["false", "Färg"],
          ["true", "Svartvitt"],
        ],
        (value) =>
          editLayout(id, "Utskriftsfärg", { monochrome: value === "true" }),
      ),
    );
    if (recoverViews)
      panel.append(action("Återställ tomma vyer", () => recoverViews(id)));
    panel.append(action("Ta bort layout", () => removeLayout(id)));
    root.append(panel);
  };
}
