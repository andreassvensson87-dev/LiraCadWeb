import { Editor } from "./editor.js";
import { createEditorTools } from "./tool-registry.js";
import { blockTools } from "../tools/block-tools.js";
import { blockTemplates } from "../model/blocks.js";
import { dimensionTools } from "../tools/dimension-tools.js";
import { blockParts } from "../model/blocks.js";
import { applyTransformChange } from "../tools/transform-tools.js";
import { updateToolState } from "./editor-state.js";

export function createToolContext({
  selectedEntities,
  model,
  getCreationDefaults,
  state,
  catalogPlacementReason,
  modelExtentsCenter,
  drawingSpace,
  getCreationColor,
  getCreationLineType,
  getSelectionController,
  editable,
  visible,
  hit,
  getDocumentWorkflow,
  getClipboardController,
  commit,
  applyObjectChange,
  addEntities,
  replaceEntities,
  update,
  make,
  beginTextEdit,
  focusCommand,
  log,
  clearTracking,
}) {
  const editor = new Editor({
    tools: createEditorTools(),
    getContext: () => ({
      entities: selectedEntities(),
      isBlockEditor: Boolean(model.blockEditor),
      stretchParameters: model.document.stretchParameters || [],
      parameterEdit: model.parameterEdit,
      creationDefaults: getCreationDefaults(),
      ...(state.tool &&
      (Object.hasOwn(blockTools, state.tool.name) ||
        state.tool.name === "WBLOCK")
        ? { templates: blockTemplates(model.document) }
        : {}),
      catalogPlacementReason: catalogPlacementReason(),
      ...(state.tool?.name === "MVIEW"
        ? {
            modelCenter: modelExtentsCenter(),
            activeViewportId: state.activeViewportId,
          }
        : {}),
      creation: {
        layer: model.activeLayer,
        space: drawingSpace(),
        color: getCreationColor(),
        lineType: getCreationLineType(),
        ...getCreationDefaults().dimension,
      },
      ...(state.tool &&
      [
        "OFFSET",
        "TRIM",
        "EXTEND",
        "FILLET",
        "CHAMFER",
        "PINSERT",
        "PDELETE",
        "STRETCH",
        "BSTRETCH",
        ...Object.keys(dimensionTools),
      ].includes(state.tool.name)
        ? {
            editableEntities: (
              getSelectionController().entities || model.document.entities
            ).filter(editable),
            ...(["TRIM", "EXTEND"].includes(state.tool.name)
              ? {
                  shift: state.trimShift,
                  boundaryEntities: (
                    getSelectionController().entities || model.document.entities
                  )
                    .filter(visible)
                    .flatMap((e) =>
                      e.type === "block" ? blockParts(e).filter(visible) : [e],
                    ),
                }
              : {}),
            hitEntity: [
              "TRIM",
              "EXTEND",
              "FILLET",
              "CHAMFER",
              ...Object.keys(dimensionTools),
            ].includes(state.tool.name)
              ? hit(state.rawCursor)
              : null,
            pointer: state.rawCursor,
          }
        : {}),
    }),
    setSelection: (ids) => {
      state.selection = new Set(ids);
    },
    applyChange: (change) => {
      if (change.kind === "clipboard") {
        getClipboardController().place(change);
      } else if (change.kind === "wblock") {
        getDocumentWorkflow().exportWblock(change);
      } else if (change.kind === "blockParameter") {
        if (!model.blockEditor) throw Error("Öppna blockeditorn först.");
        commit(change.label, (draft) => {
          const index =
            draft.stretchParameters?.findIndex(
              (p) => p.id === change.parameter.id,
            ) ?? -1;
          if (index >= 0) draft.stretchParameters[index] = change.parameter;
          else
            draft.stretchParameters = [
              ...(draft.stretchParameters || []),
              change.parameter,
            ];
        });
      } else if (change.kind === "editing") {
        applyObjectChange(change);
      } else if (change.operation) {
        const result = applyTransformChange(model.document.entities, change);
        if (change.operation === "COPY")
          addEntities(
            result.entities.slice(model.document.entities.length),
            change.label,
          );
        else replaceEntities(change.label, result.entities);
        state.selection = new Set(result.ids);
        update();
      } else {
        addEntities(
          change.entities.map(({ type, ...props }) => make(type, props)),
          change.label,
        );
      }
    },
    onEffect: (effect) => {
      if (effect.kind === "editText")
        beginTextEdit(effect.entity, effect.isNew);
      else if (effect.kind === "focusCommand") focusCommand();
    },
    notify: log,
    onState: (nextState) => updateToolState(state, nextState, clearTracking),
  });
  return { editor };
}
