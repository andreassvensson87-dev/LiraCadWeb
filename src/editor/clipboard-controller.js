import { clone, uid } from "../model/values.js";
import { transformed } from "../model/entity-transform.js";

// One clipboard per application, independent of the active project/session.
export function createClipboardController({
  model, state, selectedEntities, drawingSpace, getDocumentEditor,
  cancel, update, log,
  prepare = () => true,
  startPlacement,
}) {
  let clipboard = null;

  function copy(cut = false) {
    if (!prepare()) return false;
    const ids = new Set(selectedEntities().map((e) => e.id));
    const entities = model.document.entities.filter((e) => ids.has(e.id));
    if (!entities.length) {
      log("Markera objekt att kopiera eller klippa ut först.");
      return false;
    }
    const next = clone({ entities, layers: model.document.layers });
    try {
      if (cut && !getDocumentEditor().replaceEntities(
        "Klipp ut objekt", model.document.entities.filter((e) => !ids.has(e.id)),
      )) return false;
    } catch (error) {
      log(error.message);
      return false;
    }
    clipboard = next;
    if (cut) {
      cancel(false);
      state.selection.clear();
    }
    update();
    log(`${entities.length} objekt ${cut ? "utklippta" : "kopierade"}. Byt flik och klistra in med Ctrl/⌘+V.`);
    return true;
  }

  function paste() {
    if (!prepare()) return false;
    if (!clipboard) {
      log("Urklippet är tomt. Kopiera objekt med Ctrl/⌘+C först.");
      return false;
    }
    const space = drawingSpace();
    if (space === "model" && clipboard.entities.some((e) => e.type === "viewport")) {
      log("Viewport-ramar kan bara klistras in i en layout.");
      return false;
    }
    cancel(false);
    startPlacement({ clipboard: clone(clipboard), space });
    update();
    return true;
  }

  function place({ clipboard: contents, base, point, space }) {
    if (drawingSpace() !== space) throw Error("Ritutrymmet har ändrats. Starta inklistringen igen.");
    let pasted;
    const changed = getDocumentEditor().commit("Klistra in objekt", (draft) => {
      const layers = new Map(), definitions = new Map();
      const names = new Set([
        ...(draft.blocks || []).map((d) => d.name),
        ...draft.entities.filter((e) => e.definition).map((e) => e.definition.name),
      ]);
      function uniqueName(name, used) {
        let result = name, n = 2;
        while (used.has(result)) {
          const suffix = `_${n++}`;
          result = name.slice(0, 64 - suffix.length) + suffix;
        }
        used.add(result);
        return result;
      }
      function layer(id) {
        if (layers.has(id)) return layers.get(id);
        const source = contents.layers.find((l) => l.id === id);
        if (!source) throw Error("Ett kopierat lager saknas.");
        // Reuse only an equivalent, editable layer; conflicting styles get
        // their own layer so BYLAYER appearance survives the transfer.
        const style = (l) => JSON.stringify(Object.entries(l)
          .filter(([key]) => !["id", "name", "visible", "locked", "dwgSource", "referenceId"].includes(key))
          .sort(([a], [b]) => a.localeCompare(b)));
        let target = draft.layers.find((l) =>
          (l.name === source.name || l.name.startsWith(source.name + "_")) &&
          !l.locked && l.visible !== false && style(l) === style(source));
        if (!target) {
          target = { ...clone(source), id: uid(), visible: true, locked: false };
          delete target.dwgSource;
          delete target.referenceId;
          target.name = uniqueName(source.name, new Set(draft.layers.map((l) => l.name)));
          draft.layers.push(target);
        }
        layers.set(id, target.id);
        return target.id;
      }
      function remap(entity) {
        const sourceLayer = entity.layer;
        entity.layer = layer(sourceLayer);
        delete entity.dwgSource;
        delete entity.dwgBoundInsert;
        delete entity._dwgOwner;
        delete entity._annotationSource;
        for (const part of entity.dimensionGraphics || []) remap(part);
        for (const part of Object.values(entity.attributeOverrides || {})) remap(part);
        for (const variant of entity.annotationVariants || []) {
          variant.entity.layer = sourceLayer;
          remap(variant.entity);
          variant.entity.space = entity.space || "model";
        }
        if (entity.definition) {
          const originalId = entity.definition.id;
          if (!definitions.has(originalId)) {
            const definition = entity.definition;
            definition.id = uid();
            definition.name = uniqueName(definition.name, names);
            delete definition.dwgSource;
            delete definition.dwgBinding;
            definition.entities.forEach(remap);
            // Local part IDs remain stable for stretch/attribute references.
            definitions.set(originalId, definition);
          }
          entity.definition = definitions.get(originalId);
        }
        return entity;
      }
      pasted = contents.entities.map((source) => {
        const e = transformed(source, "MOVE", base, point);
        e.space = space;
        const entity = remap(e);
        entity.id = uid();
        entity.space = space;
        return entity;
      });
      draft.entities.push(...pasted);
      if (definitions.size) draft.blocks = [...(draft.blocks || []), ...definitions.values()];
    });
    if (!changed) throw Error("Objekten kunde inte klistras in.");
    state.selection = new Set(pasted.map((e) => e.id));
    update();
    log(`${pasted.length} objekt inklistrade.`);
    return true;
  }
  return { copy: () => copy(), cut: () => copy(true), paste, place };
}
