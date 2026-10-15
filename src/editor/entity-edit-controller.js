import { copyAnnotationView } from "../model/annotation-edit.js";
import { applyEditingChange } from "../tools/editing-tools.js";
import { clone } from "../model/values.js";
import { storeAnnotationView } from "../model/annotation-edit.js";
import { plainAnnotationEntity } from "../model/annotation-edit.js";
import { spaceOf } from "../model/layout.js";
import { fitViewportToEntities } from "../model/layout.js";
import { recoverEmptyViewports } from "../model/layout.js";

export function createEntityEditController({
  model,
  getDocumentEditor,
  update,
  currentViewport,
  layerOf,
  log,
  state,
  viewEntity,
}) {
  function commit(label, edit) {
    const previousLayer = model.activeLayer;
    try {
      const changed = getDocumentEditor().commit(label, edit);
      if (!changed) update();
      return changed;
    } catch (error) {
      model.activeLayer = previousLayer;
      update();
      throw error;
    }
  }
  function addEntities(es, label) {
    const entities = es.map((e) => {
      const source =
        e._annotationSource &&
        model.document.entities.find((p) => p.id === e._annotationSource);
      return source ? copyAnnotationView(source, e, currentViewport()) : e;
    });
    return getDocumentEditor().append(label, entities);
  }
  function applyObjectChange(change) {
    if (
      change.replaceId === undefined &&
      change.replaceIds === undefined &&
      !change.definitions?.length
    ) {
      return addEntities(change.entities, change.label);
    }
    if (!change.definitions?.length) {
      return replaceEntities(
        change.label,
        applyEditingChange(model.document.entities, change),
      );
    }
    commit(change.label, (draft) => {
      draft.entities = applyEditingChange(draft.entities, change);
      if (change.definitions?.length)
        draft.blocks = [...(draft.blocks || []), ...clone(change.definitions)];
    });
  }
  function replaceEntities(label, entities) {
    entities = entities.map((e) => {
      const source =
        e._annotationSource &&
        model.document.entities.find((p) => p.id === e._annotationSource);
      return source && e.id === source.id
        ? storeAnnotationView(source, e)
        : e._annotationSource
          ? plainAnnotationEntity(e)
          : e;
    });
    return getDocumentEditor().replaceEntities(label, entities);
  }
  function fitViewport(entity) {
    const modelEntities = model.document.entities.filter(
      (e) =>
        spaceOf(e) === "model" && !e.hidden && layerOf(e)?.visible !== false,
    );
    const next = fitViewportToEntities(entity, modelEntities);
    if (!next) {
      log("Ingen synlig modellgeometri att anpassa vyn till.");
      return;
    }
    replaceEntities(
      "Anpassa vy till modell",
      model.document.entities.map((e) => (e.id === entity.id ? next : e)),
    );
  }
  function recoverLayoutViews(layoutId) {
    const modelEntities = model.document.entities.filter(
      (e) =>
        spaceOf(e) === "model" && !e.hidden && layerOf(e)?.visible !== false,
    );
    const result = recoverEmptyViewports(
      model.document.entities,
      layoutId,
      modelEntities,
    );
    if (!result.count) {
      log("Inga tomma vyer kunde återställas i detta ark.");
      return;
    }
    replaceEntities("Återställ tomma vyer", result.entities);
    log(
      `${result.count} tomma vyer visar nu en modellöversikt med standardskala. Justera detaljutsnittet via modellvyn och kontrollera arkets skaltexter/skalstockar.`,
    );
  }
  function editSelected(label, fn) {
    commit(label, (draft) => {
      draft.entities = draft.entities.map((e) =>
        state.selection.has(e.id)
          ? (() => {
              const view = viewEntity(e),
                edited = fn(clone(view || e));
              return edited._annotationSource
                ? storeAnnotationView(e, edited)
                : edited;
            })()
          : e,
      );
    });
  }
  return {
    commit,
    addEntities,
    applyObjectChange,
    replaceEntities,
    editSelected,
    fitViewport,
    recoverLayoutViews,
  };
}
