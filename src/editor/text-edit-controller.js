import { bounds } from "../model/entity-geometry.js";
import { withAttributeText } from "../model/blocks.js";
import { blockParts } from "../model/blocks.js";

export function createTextEditController({
  createSurface,
  screen,
  state,
  model,
  clearTracking,
  editor,
  applyObjectChange,
  viewEntity,
  getSelectionController,
  update,
  prompt,
  focusCanvas,
  schedule,
  log,
}) {
  let textEditTarget = null;
  const textEditor = createSurface({
    screen,
    getSize: () => ({ width: state.width, height: state.height }),
    getAvoidBounds: () => {
      const block =
        textEditTarget &&
        model.document.entities.find((e) => e.id === textEditTarget.blockId);
      return block ? bounds(block) : null;
    },
    beforeBegin: () => {
      clearTracking();
      editor.cancel();
      state.tool = null;
      state.drag = null;
      state.snap = null;
    },
    applyChange: (change) => {
      if (!textEditTarget) return applyObjectChange(change);
      const source = model.document.entities.find(
        (e) => e.id === textEditTarget.blockId,
      );
      const block = source && viewEntity(source);
      if (
        !block ||
        !getSelectionController().editableIds.has(block.id) ||
        block.definition.id !== textEditTarget.definitionId
      )
        throw Error("Blocket har ändrats eller kan inte längre redigeras.");
      applyObjectChange({
        ...change,
        label: "Redigera blockattribut",
        replaceId: block.id,
        entities: [
          withAttributeText(block, textEditTarget.tag, change.entities[0]),
        ],
      });
    },
    afterFinish: ({ selection: ids }) => {
      textEditTarget = null;
      if (ids) state.selection = new Set(ids);
      update();
      prompt();
      focusCanvas();
    },
    refresh: () => {
      prompt();
      schedule();
    },
    log,
  });
  function beginTextEdit(entity, isNew = false) {
    const started = textEditor.begin(
      isNew
        ? entity
        : viewEntity(
            model.document.entities.find((e) => e.id === entity.id) || entity,
          ) || entity,
      isNew,
    );
    if (started) {
      textEditTarget = null;
      textEditor.position();
    }
    return started;
  }
  function beginAttributeTextEdit(block, tag) {
    block = model.document.entities.find((e) => e.id === block.id) || block;
    if (!getSelectionController().editableIds.has(block.id)) {
      log("Välj ett synligt, olåst block.");
      return false;
    }
    block = viewEntity(block) || block;
    const part = blockParts(block).find((p) => p.attributeTag === tag);
    if (!part || part.hidden) {
      log("Attributet saknas eller är dolt.");
      return false;
    }
    const started = textEditor.begin(part);
    if (started) {
      textEditTarget = {
        blockId: block.id,
        definitionId: block.definition.id,
        tag,
      };
      if (!state.activeViewportId && part.height * state.camera.scale < 12) {
        const b = bounds(block);
        state.camera = {
          x: (b.minX + b.maxX) / 2,
          y: (b.minY + b.maxY) / 2,
          scale: Math.min(
            (state.width - 100) / Math.max(b.maxX - b.minX, part.height),
            (state.height - 100) / Math.max(b.maxY - b.minY, part.height),
          ),
        };
      }
      textEditor.position();
      state.selection = new Set([block.id]);
      schedule();
    }
    return started;
  }
  function textEditPreview() {
    const entity = textEditor.preview();
    if (!entity) return null;
    if (!textEditTarget)
      return { originalId: textEditor.active.isNew ? null : entity.id, entity };
    const source = model.document.entities.find(
      (e) => e.id === textEditTarget.blockId,
    );
    const block = source && viewEntity(source);
    if (!block) return null;
    try {
      return {
        originalId: block.id,
        entity: withAttributeText(block, textEditTarget.tag, entity),
      };
    } catch {
      return null;
    }
  }
  function finishTextEdit(save) {
    return textEditor.finish(save);
  }
  return {
    textEditor,
    beginTextEdit,
    beginAttributeTextEdit,
    textEditPreview,
    finishTextEdit,
  };
}
