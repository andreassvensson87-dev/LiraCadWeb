import { createInspectorControls } from "./inspector-controls.js";
import { createGeneralInspector } from "./general-inspector.js";
import { createAppearanceInspector } from "./appearance-inspector.js";
import { createAttributeInspector } from "./attribute-inspector.js";
import { createEntityInspector } from "./entity-inspector.js";

import { createLayoutInspector } from "./layout-inspector.js";
import { createBlockInspector } from "./block-inspector.js";
import { createLayerPanel } from "./layer-panel.js";

export function createInspectorComposition({
  document,
  actions,
  changeProperty,
  activateLayer,
  log,
  renderInspector,
  model,
  state,
  selectedEntities,
  getCreation,
  schedule,
  editSelected,
  cancel,
  update,
  enterViewport,
  fitViewport,
  beginTextEdit,
  currentViewport,
  recoverLayoutViews,
  finishBlockEdit,
  beginBlockEdit,
  erase,
  $,
}) {
  const { field, section, choice, action, colorFields } =
    createInspectorControls({
      document,
      onInvalid: (message) => {
        log(message);
        renderInspector();
      },
    });
  const generalProperties = createGeneralInspector({
    document,
    choice,
    colorFields,
    section,
    getContext: () => ({
      doc: model.document,
      tool: state.tool,
      es: selectedEntities(),
      activeLayer: model.activeLayer,
      creationColor: getCreation().color,
      creationLineType: getCreation().lineType,
    }),
    changeProperty,
  });
  const appearanceFields = createAppearanceInspector({
    document,
    field,
    choice,
    action,
    log,
    refresh: renderInspector,
  });
  const {
    attributeValueField,
    attributeDefinitionFields,
    renderAttributeManager,
  } = createAttributeInspector({
    document,
    field,
    choice,
    action,
    log,
    refresh: renderInspector,
    editSelected,
    getDocument: () => model.document,
    isBlockEditor: () => Boolean(model.blockEditor),
    selectEntity: (id) => {
      cancel();
      state.selection = new Set([id]);
      update();
    },
  });
  const renderEntityProperties = createEntityInspector({
    field,
    choice,
    section,
    action,
    editSelected,
    refresh: renderInspector,
    attributeDefinitionFields,
    appearanceFields,
    enterViewport,
    fitViewport,
    beginTextEdit,
    getAnnotationScale: () => currentViewport()?.annotationScale,
    createAnnotationVariant: actions.annotationVariant,
  });
  const renderLayoutProperties = createLayoutInspector({
    field,
    choice,
    section,
    action,
    getDocument: () => model.document,
    editLayout: actions.editLayout,
    removeLayout: actions.removeLayout,
    recoverViews: recoverLayoutViews,
  });
  const blockInspector = createBlockInspector({
    refresh: () => {
      renderInspector();
      schedule();
    },
    field,
    section,
    action,
    startParameter: actions.startParameter,
    getDocument: () => model.document,
    editBlockName: actions.editBlockName,
    editBlockBase: actions.editBlockBase,
    removeParameter: actions.removeParameter,
    editParameter: actions.editParameter,
    finishEdit: finishBlockEdit,
    document,
    renderAttributeManager,
    attributeValueField,
    editSelected,
    beginEdit: beginBlockEdit,
    renderGeneralProperties: generalProperties,
    erase,
  });
  const renderLayers = createLayerPanel({
    document,
    root: $("#layers-panel"),
    getDocument: () => model.document,
    getActiveLayer: () => model.activeLayer,
    activateLayer,
    editLayer: actions.editLayer,
    addLayer: actions.addLayer,
    cancel,
    log,
    field,
    choice,
    action,
  });
  return {
    generalProperties,
    appearanceFields,
    renderEntityProperties,
    renderLayoutProperties,
    blockInspector,
    renderLayers,
  };
}
