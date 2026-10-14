import { BlockEditSession } from "./block-edit-session.js";

export function createBlockController({
  model,
  log,
  editable,
  textEditor,
  finishTextEdit,
  syncViewport,
  state,
  cancel,
  fit,
  panel,
  update,
  persisted,
}) {
  function beginBlockEdit(entity) {
    if (entity?._annotationSource) {
      entity =
        model.document.entities.find((e) => e.id === entity.id) || entity;
      log(
        "Blockeditorn redigerar den gemensamma grunddefinitionen för alla skalor. Textutseende på ett attribut ändrar den aktiva skalvarianten.",
      );
    }
    if (model.blockEditor || entity?.type !== "block" || !editable(entity)) {
      log("Markera ett block som kan redigeras först.");
      return;
    }
    if (textEditor.active && !finishTextEdit(true)) return;
    syncViewport();
    model.storage.cancel();
    model.storage
      .save(model.document)
      .catch((error) =>
        log("Huvudritningen kunde inte autosparas: " + error.message),
      );
    model.blockEditor = new BlockEditSession(model.session, entity.definition, {
      activeSpace: state.activeSpace,
      activeViewportId: state.activeViewportId,
      paperCamera: state.paperCamera,
      camera: state.camera,
      activeLayer: model.activeLayer,
      dirty: model.dirty,
      selection: [...state.selection],
    });
    model.session = model.blockEditor.draft;
    model.document = model.session.document;
    model.history = model.session.history;
    state.activeSpace = "model";
    state.activeViewportId = null;
    state.paperCamera = null;
    cancel();
    fit();
    panel("properties");
    log(
      "Blockeditor · redigera med ritverktygen · BSAVE sparar · BCANCEL avbryter.",
    );
  }
  function finishBlockEdit(save) {
    if (!model.blockEditor) return false;
    if (textEditor.active && !finishTextEdit(save)) return false;
    let result;
    try {
      result = model.blockEditor.finish(save);
    } catch (error) {
      log(error.message);
      return false;
    }
    const session = result.context;
    model.blockEditor = null;
    model.session = result.documentSession;
    model.document = model.session.document;
    model.history = model.session.history;
    state.activeSpace = session.activeSpace;
    state.activeViewportId = session.activeViewportId;
    state.paperCamera = session.paperCamera;
    state.camera = session.camera;
    model.activeLayer = session.activeLayer;
    model.dirty = session.dirty || result.changed;
    cancel();
    state.selection = new Set(session.selection);
    update();
    persisted();
    log(
      save
        ? "Blocket sparat. Alla instanser är uppdaterade."
        : "Blockredigering avbruten.",
    );
    return true;
  }

  return { beginBlockEdit, finishBlockEdit };
}
