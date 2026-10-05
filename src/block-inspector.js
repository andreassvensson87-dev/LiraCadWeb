import { sortedAttributes } from "./attributes.js";

export function createBlockInspector({ field, section, action, getDocument, commit, finishEdit, renderAttributeManager, attributeValueField, editSelected, beginEdit, erase }) {
  function renderEditor(root) {
    const doc = getDocument(), panel = section("BLOCKEDITOR");
    panel.append(field("Blocknamn", doc.name, (value) => {
      commit("Blocknamn", (draft) => { draft.name = value.trim(); });
    }, "text"));
    for (const axis of ["x", "y"])
      panel.append(field("Baspunkt " + axis.toUpperCase(), doc.blockBase[axis], (value) => {
        if (Number.isFinite(value)) commit("Baspunkt", (draft) => { draft.blockBase[axis] = value; });
      }));
    panel.append(action("Spara block", () => finishEdit(true)), action("Avbryt blockredigering", () => finishEdit(false)));
    root.append(panel);
    renderAttributeManager(root);
  }
  function renderInstance(root, block) {
    const panel = section(block.definition.name);
    for (const part of sortedAttributes(block.definition.entities))
      attributeValueField(panel, part, block.values?.[part.attributeTag] ?? part.text, (value) => {
        editSelected("Blockattribut", (entity) => ({ ...entity, values: { ...entity.values, [part.attributeTag]: value } }));
      });
    panel.append(action("Redigera block", () => beginEdit(block)));
    root.append(panel, action("Radera markerade", erase));
  }
  return { renderEditor, renderInstance };
}
