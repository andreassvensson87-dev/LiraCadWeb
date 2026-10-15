import { spaceOf } from "../model/layout.js";
import { annotationView } from "../model/annotation-edit.js";
import { screenPoint, worldPoint } from "../model/camera.js";

// Resolves the active drawing representation once for tools, selection, snapping
// and property edits. Visibility and editability are editor rules, not UI rules.
export function createDocumentContext({ model, state }) {
  const drawingSpace = () =>
    state.activeViewportId ? "model" : state.activeSpace;
  const currentViewport = () =>
    model.document.entities.find((e) => e.id === state.activeViewportId);
  const viewEntity = (e) =>
    spaceOf(e) === "model"
      ? annotationView(e, currentViewport(), model.document.layers)
      : e;
  const layerOf = (e) => model.document.layers.find((l) => l.id === e.layer),
    visible = (e) =>
      !e.hidden &&
      layerOf(e)?.visible !== false &&
      spaceOf(e) === drawingSpace() &&
      !(
        state.activeViewportId &&
        model.document.entities
          .find((v) => v.id === state.activeViewportId)
          ?.frozenLayers?.includes(layerOf(e)?.name)
      ),
    editable = (e) => !e._xrefId && visible(e) && !layerOf(e)?.locked;
  const world = (p) => worldPoint(p, state.camera, state.width, state.height);
  const screen = (p) => screenPoint(p, state.camera, state.width, state.height);

  return {
    drawingSpace,
    currentViewport,
    viewEntity,
    layerOf,
    visible,
    editable,
    world,
    screen,
  };
}
