import { referenceEntities } from "../model/references.js";
import { bounds, hitDistance } from "../model/entity-geometry.js";
import { createSpatialIndex } from "../model/spatial-index.js";
import { createLocalSnapIndex } from "./local-snapping.js";

// Derived interaction geometry is not the document. Selection, hit testing and
// snapping read the same index, rebuilt on document, space or viewport changes.
export function createSelectionController({
  state,
  getDocument,
  drawingSpace,
  viewEntity = (entity) => entity,
  visible,
  editable,
}) {
  let sceneIndex, snapCache, indexedDocument, indexedSpace, interactionViewport;
  let entities = [],
    editableIds = new Set();
  function rebuild() {
    const doc = getDocument(),
      space = drawingSpace();
    if (
      indexedDocument === doc &&
      indexedSpace === space &&
      interactionViewport === state.activeViewportId
    )
      return;
    entities = [...referenceEntities(doc), ...doc.entities]
      .map(viewEntity)
      .filter(Boolean);
    sceneIndex = sceneIndex
      ? sceneIndex.update(entities)
      : createSpatialIndex(entities, bounds);
    snapCache = snapCache
      ? snapCache.update(entities, sceneIndex)
      : createLocalSnapIndex(entities, {
          entityIndex: sceneIndex,
          eligible: (entity) => visible(entity) && entity._xrefSnap !== false,
        });
    editableIds = new Set(entities.filter(editable).map((entity) => entity.id));
    indexedDocument = doc;
    indexedSpace = space;
    interactionViewport = state.activeViewportId;
  }
  function append(previous, added) {
    if (
      state.activeViewportId ||
      indexedDocument !== previous ||
      indexedSpace !== drawingSpace()
    )
      return;
    entities = entities.concat(added);
    sceneIndex = sceneIndex.append(added);
    snapCache.append(added, sceneIndex);
    for (const entity of added)
      if (editable(entity)) editableIds.add(entity.id);
    indexedDocument = getDocument();
  }
  function hit(point) {
    let best = null,
      distance = 7 / state.camera.scale;
    for (const entity of sceneIndex.query(
      {
        minX: point.x - distance,
        maxX: point.x + distance,
        minY: point.y - distance,
        maxY: point.y + distance,
      },
      true,
    )) {
      if (!editable(entity)) continue;
      const candidate = hitDistance(entity, point);
      if (candidate <= distance) {
        best = entity;
        distance = candidate;
      }
    }
    return best;
  }
  return {
    rebuild,
    append,
    hit,
    selectedEntities: () =>
      state.selection.size
        ? entities.filter(
            (entity) => state.selection.has(entity.id) && editable(entity),
          )
        : [],
    invalidate: () => {
      indexedDocument = null;
    },
    clear: () => {
      sceneIndex = null;
      snapCache = null;
      indexedDocument = null;
      indexedSpace = null;
      entities = [];
      editableIds = new Set();
    },
    get entities() {
      return entities;
    },
    get editableIds() {
      return editableIds;
    },
    get index() {
      return sceneIndex;
    },
    get snapIndex() {
      return snapCache;
    },
  };
}
