export function createEntityInspector({ field, choice, section, action, editSelected, refresh, attributeDefinitionFields, appearanceFields, enterViewport, beginTextEdit }) {
  return function render(root, e) {
    const geo = section("");
    const edit = (label, fn) => editSelected(label, fn);
    if (e.type === "text" && e.attributeTag) attributeDefinitionFields(geo, e);

    if (e.type === "dimension" && !e.chain) {
      geo.append(
        field(
          "Textöverskrivning",
          e.text || "",
          (v) => edit("Måtttext", (n) => ({ ...n, text: v })),
          "text",
        ),
      );
    }
    if (e.type === "viewport") {
      geo.append(
        field("Skala 1:", 1 / e.viewScale, (v) => {
          if (v > 0) edit("Viewportskala", (n) => ({ ...n, viewScale: 1 / v }));
          else refresh();
        }),
      );
      geo.append(
        choice(
          "Låst vy",
          e.locked !== false,
          [
            ["true", "Ja"],
            ["false", "Nej"],
          ],
          (v) => edit("Viewportlås", (n) => ({ ...n, locked: v === "true" })),
        ),
      );
      geo.append(action("Aktivera modellvy", () => enterViewport(e)));
    }
    if (e.type === "polyline")
      geo.append(
        choice(
          "Sluten",
          !!e.closed,
          [
            ["true", "Ja"],
            ["false", "Nej"],
          ],
          (v) => edit("Sluten kontur", (n) => ({ ...n, closed: v === "true" })),
        ),
      );
    if (["text", "leader"].includes(e.type))
      geo.append(action("Redigera text på canvas", () => beginTextEdit(e)));
    appearanceFields(geo, e, (key, value) =>
      edit("Egenskap", (n) => ({ ...n, [key]: value })),
    );
    if (geo.children.length) root.append(geo);
  };
}
