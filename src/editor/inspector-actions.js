import { uid } from "../model/values.js";
import { spaceOf } from "../model/layout.js";
import { updateStretchParameter } from "../model/parametric-blocks.js";
import { createAnnotationView } from "../model/annotation-edit.js";

// Editing policies shared by inspector controls; UI submits values and intent.
export function createInspectorActions({
  model,
  commit,
  activateLayer,
  cancel,
  refresh,
  fit,
  currentViewport,
  replaceEntities,
  start,
}) {
  function editLayer(id, label, patch) {
    return commit(label, (draft) => {
      const layer = draft.layers.find((l) => l.id === id);
      if (!layer) throw Error("Lagret finns inte längre.");
      const change = typeof patch === "function" ? patch(layer) : patch;
      if (change.name != null) {
        const name = change.name.trim();
        if (
          !name ||
          draft.layers.some(
            (l) => l.id !== id && l.name.toLowerCase() === name.toLowerCase(),
          )
        )
          throw Error("Lagernamnet måste vara unikt.");
        change.name = name;
      }
      Object.assign(layer, change);
    });
  }
  function addLayer() {
    const id = uid();
    commit("Nytt lager", (draft) => {
      draft.layers.push({
        id,
        name: `Lager ${draft.layers.length + 1}`,
        color: "#9cd4b5",
        visible: true,
        locked: false,
      });
    });
    activateLayer(id);
  }
  function editLayout(id, label, patch) {
    commit(label, (draft) => {
      const layout = draft.layouts?.find((l) => l.id === id);
      if (!layout) throw Error("Layouten finns inte längre.");
      if (patch.name != null) {
        const name = patch.name.trim();
        if (
          !name ||
          name.toLowerCase() === "model" ||
          draft.layouts.some(
            (l) => l.id !== id && l.name.toLowerCase() === name.toLowerCase(),
          )
        )
          throw Error("Layoutnamnet måste vara unikt.");
        patch = { ...patch, name };
      }
      Object.assign(layout, patch);
    });
    if (patch.width != null || patch.height != null) fit();
  }
  function removeLayout(id) {
    commit("Ta bort layout", (draft) => {
      draft.entities = draft.entities.filter((e) => spaceOf(e) !== id);
      draft.layouts = draft.layouts.filter((l) => l.id !== id);
    });
    cancel();
    fit();
  }
  function editBlockName(value) {
    commit("Blocknamn", (draft) => {
      draft.name = value.trim();
    });
  }
  function editBlockBase(axis, value) {
    if (!["x", "y"].includes(axis) || !Number.isFinite(value)) return;
    commit("Baspunkt", (draft) => {
      draft.blockBase[axis] = value;
    });
  }
  function removeParameter(id) {
    commit("Ta bort stretchparameter", (draft) => {
      draft.stretchParameters = draft.stretchParameters.filter(
        (p) => p.id !== id,
      );
    });
  }
  function editParameter(id, patch) {
    commit("Ändra stretchparameter", (draft) => {
      draft.stretchParameters = updateStretchParameter(
        draft.stretchParameters,
        id,
        patch,
        draft.entities,
      );
    });
  }
  function annotationVariant(entity) {
    const source = model.document.entities.find((e) => e.id === entity.id);
    if (source)
      replaceEntities(
        "Skapa annotationsvariant",
        model.document.entities.map((e) =>
          e.id === source.id ? createAnnotationView(e, currentViewport()) : e,
        ),
      );
  }
  function startParameter(request) {
    model.parameterEdit = request || null;
    try {
      start("BSTRETCH");
    } finally {
      model.parameterEdit = null;
    }
  }
  // UI callbacks must report validation errors and retain the field for retry.
  const guarded =
    (fn) =>
    (...args) => {
      try {
        return fn(...args);
      } catch (error) {
        refresh(error.message);
      }
    };
  return Object.fromEntries(
    Object.entries({
      editLayer,
      addLayer,
      editLayout,
      removeLayout,
      editBlockName,
      editBlockBase,
      removeParameter,
      editParameter,
      annotationVariant,
      startParameter,
    }).map(([name, fn]) => [name, guarded(fn)]),
  );
}
