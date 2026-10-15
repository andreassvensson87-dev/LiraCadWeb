import { blockTemplates, createBlock } from "../model/blocks.js";
import { spaceOf } from "../model/layout.js";
import { applyEditingChange } from "../tools/editing-tools.js";
import { validDocument } from "../model/document.js";

export function createWblockController({
  model,
  state,
  editor,
  clearTracking,
  log,
  update,
  prompt,
  getSelectionController,
  replaceEntities,
  applyObjectChange,
}) {
  function beginPick(kind) {
    editor.cancel();
    state.drag = null;
    clearTracking();
    state.tool = {
      name: "WBLOCK",
      phase: kind === "objects" ? "select" : "dialogBase",
      points: [],
    };
    log(
      kind === "objects"
        ? "WBLOCK · Markera objekt och tryck Enter."
        : "WBLOCK · Klicka på baspunkten eller ange X,Y. Esc återgår till dialogen.",
    );
    update();
  }
  function endPick() {
    editor.cancel();
    state.tool = null;
    state.drag = null;
    clearTracking();
    state.snap = null;
    prompt();
    update();
  }
  function prepareChange(request, action, blockName) {
    if (action === "retain") return null;
    const sources = model.document.entities.filter((e) =>
      request.entityIds.includes(e.id),
    );
    if (sources.some((e) => !getSelectionController().editableIds.has(e.id)))
      throw Error(
        "Originalobjekten måste vara synliga och olåsta för att ändras efter export.",
      );
    if (action === "delete")
      return () =>
        replaceEntities(
          "WBLOCK · Ta bort exporterade objekt",
          model.document.entities.filter(
            (e) => !request.entityIds.includes(e.id),
          ),
        );
    if (
      blockTemplates(model.document).some(
        (b) =>
          b.definition.name.toLowerCase() === blockName.trim().toLowerCase(),
      )
    )
      throw Error("Blocknamnet används redan.");
    if (new Set(sources.map(spaceOf)).size !== 1)
      throw Error(
        "Välj objekt i samma modell eller layout för att skapa ett block.",
      );
    const block = createBlock(
      sources,
      blockName.trim(),
      request.base,
      sources[0].layer,
      spaceOf(sources[0]),
    );
    const change = {
      kind: "editing",
      label: "WBLOCK · Omvandla till block",
      replaceIds: request.entityIds,
      entities: [block],
      definitions: [block.definition],
    };
    if (
      !validDocument({
        ...model.document,
        entities: applyEditingChange(model.document.entities, change),
        blocks: [...(model.document.blocks || []), block.definition],
      })
    )
      throw Error("Objekten kunde inte omvandlas till ett giltigt block.");
    return () => {
      applyObjectChange(change);
      state.selection = new Set([block.id]);
      update();
    };
  }
  return { beginPick, endPick, prepareChange };
}
