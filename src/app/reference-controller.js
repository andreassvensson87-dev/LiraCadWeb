import {
  detachReference,
  bindReference,
  findReference,
} from "../model/references.js";
import { resolveReferenceFiles } from "../io/reference-files.js";
import { readDrawingFile } from "../io/file-import.js";

export function createReferenceController({
  projectWorkspace,
  model,
  getTextEditor,
  finishTextEdit,
  cancel,
  pickReferenceFiles,
  log,
  state,
  commit,
}) {
  function referenceReason() {
    return !projectWorkspace.active
      ? "Öppna eller skapa en ritning först."
      : model.blockEditor
        ? "Avsluta blockeditorn först."
        : "";
  }
  async function readReference(
    id = null,
    { folder = false, resolveOnly = false, reloadAll = false } = {},
  ) {
    try {
      const reason = referenceReason();
      if (reason) throw Error(reason);
      if (getTextEditor().active && !finishTextEdit(true)) return;
      cancel(false);
      const previous = model.document,
        projectId = projectWorkspace.activeId;
      const files = await pickReferenceFiles({ folder, multiple: !id });
      if (!files.length) return;
      const result = await resolveReferenceFiles(previous, files, {
        readFile: readDrawingFile,
        linkNew: !id && !resolveOnly && !reloadAll,
        reloadAll,
        targetId: id,
        onProgress: log,
      });
      if (
        model.document !== previous ||
        projectWorkspace.activeId !== projectId ||
        model.blockEditor ||
        state.tool ||
        getTextEditor().active
      )
        throw Error(
          "Ritningen ändrades medan referenserna lästes. Försök igen.",
        );
      if (result.loaded || !reloadAll)
        commit(
          reloadAll
            ? "Ladda om alla referenser"
            : id
              ? "Ladda om referens"
              : "Länka referensfiler",
          () => result.document,
        );
      log(
        `${result.loaded} ${reloadAll ? (result.loaded === 1 ? "referens uppdaterad" : "referenser uppdaterade") : result.loaded === 1 ? "referens inläst" : "referenser inlästa"}${reloadAll && result.notFound.length ? ` · ${result.notFound.length} filer saknas i urvalet` : ""}${reloadAll && result.ambiguous.length ? ` · ${result.ambiguous.length} tvetydiga länkar` : ""}${result.missing ? ` · ${result.missing} länkar behöver lösas` : ""}.`,
      );
      for (const message of result.messages) log(message);
    } catch (error) {
      if (error.name !== "AbortError") log(error.message);
    }
  }
  function change(id, patch, label) {
    try {
      if (referenceReason()) throw Error(referenceReason());
      commit(label, (draft) => {
        const r = findReference(draft, id);
        if (!r) throw Error("Referensen finns inte längre.");
        Object.assign(r, patch);
      });
    } catch (error) {
      log(error.message);
    }
  }
  function detach(id) {
    if (referenceReason()) {
      log(referenceReason());
      return;
    }
    commit("Ta bort referens", (draft) => {
      detachReference(draft, id);
      if (!draft.layers.some((l) => l.id === model.activeLayer))
        model.activeLayer = draft.layers[0].id;
    });
  }
  function bind(id) {
    try {
      if (referenceReason()) throw Error(referenceReason());
      commit("Bind referens", (draft) =>
        bindReference(draft, id, model.activeLayer),
      );
      log("Referensen är nu ett lokalt block.");
    } catch (error) {
      log(error.message);
    }
  }
  return { referenceReason, readReference, change, detach, bind };
}
