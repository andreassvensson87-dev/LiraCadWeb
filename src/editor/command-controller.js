import { definitions } from "../commands/command-catalog.js";
import { aliases } from "../commands/command-catalog.js";
import { blockTemplates } from "../model/blocks.js";
import { dimensionTools } from "../tools/dimension-tools.js";
import { transforms } from "../commands/command-catalog.js";
import { parsePoint } from "../model/geometry.js";

// Explicit callbacks connect this controller to the current application instance.
export function createCommandController({
  editor,
  state,
  getActiveLayer,
  clearTracking,
  prompt,
  clearCommandInput,
  showSelection,
  showHelp,
  renderInspector,
  schedule,
  wblockDialog,
  update,
  projectWorkspace,
  textEditor,
  finishTextEdit,
  beginBlockEdit,
  selectedEntities,
  finishBlockEdit,
  getBlockEditor,
  log,
  switchSpace,
  leaveViewport,
  fit,
  undo,
  saveProject,
  exportDxf,
  getDocument,
  getEditableIds,
}) {
  function previewEntities() {
    return editor
      .preview(state.cursor)
      .map((e) => ({ layer: getActiveLayer(), ...e }));
  }
  function cancel(clear = true) {
    wblockDialog.dismiss();
    editor.cancel();
    clearTracking();
    state.tool = null;
    state.snap = null;
    state.drag = null;
    clearCommandInput();

    if (clear) state.selection.clear();
    prompt();
    update();
  }
  function start(name) {
    if (!projectWorkspace.active) return;
    state.drag = null;
    if (textEditor.active && !finishTextEdit(true)) return;
    name = aliases[name.toUpperCase()] || name.toUpperCase();
    if (["MT", "MTEXT"].includes(name)) name = "TEXT";
    if (name !== "WBLOCK") wblockDialog.dismiss();
    if (["BEDIT", "BE"].includes(name)) {
      beginBlockEdit(selectedEntities()[0]);
      return;
    }
    if (name === "BCLOSE" || name === "BSAVE") {
      finishBlockEdit(true);
      return;
    }
    if (name === "BCANCEL") {
      finishBlockEdit(false);
      return;
    }
    if (name === "BSTRETCH" && !getBlockEditor()) {
      log("Öppna BEDIT först för att skapa en stretchparameter.");
      return;
    }
    if (
      getBlockEditor() &&
      ["BLOCK", "INSERT", "MVIEW", "DXF", "WBLOCK"].includes(name)
    ) {
      log("Avsluta blockeditorn först.");
      return;
    }
    if (name === "WBLOCK") {
      cancel(false);
      state.lastCommand = name;
      wblockDialog.open();
      return;
    }
    if (name === "MODEL") {
      switchSpace("model");
      return;
    }
    if (name === "PSPACE") {
      leaveViewport();
      return;
    }
    if (name === "SELECT") {
      cancel();
      return;
    }
    if (name === "ZOOM") {
      fit();
      return;
    }
    if (name === "UNDO" || name === "REDO") {
      undo(name === "REDO");
      return;
    }
    if (name === "SAVE") {
      saveProject();
      return;
    }
    if (name === "DXF") {
      exportDxf();
      return;
    }
    if (name === "HELP") {
      showHelp();
      return;
    }
    if (
      !definitions.some((d) => d[0] === name) &&
      !["DIST", "PAN"].includes(name)
    ) {
      log(`Okänt kommando: ${name}`);
      return;
    }
    if (["BLOCK", "INSERT", "ATTDEF"].includes(name)) {
      if (
        name !== "ATTDEF" &&
        (getDocument().layers.find((l) => l.id === getActiveLayer())?.locked ||
          getDocument().layers.find((l) => l.id === getActiveLayer())
            ?.visible === false)
      ) {
        log("Välj ett synligt, olåst lager först.");
        return;
      }
      clearTracking();
      if (
        name === "ATTDEF" &&
        (selectedEntities().length !== 1 ||
          selectedEntities()[0].type !== "text")
      ) {
        log("Markera en text och kör ATTDEF för att ge den ett attributnamn.");
        return;
      }
      if (name === "INSERT" && !blockTemplates(getDocument()).length) {
        log("Skapa först ett block med BLOCK.");
        return;
      }
      state.tool = { name, points: [], phase: "points" };
      editor.start(name);
      state.lastCommand = name;
      if (name === "INSERT")
        log(
          "Block: " +
            [
              ...new Set(
                blockTemplates(getDocument()).map((e) => e.definition.name),
              ),
            ].join(", "),
        );
      prompt();
      return;
    }
    if (
      name === "MVIEW" &&
      (state.activeSpace === "model" || state.activeViewportId)
    ) {
      log("Skapa viewports i layoutens pappersläge.");
      return;
    }
    if (Object.hasOwn(dimensionTools, name)) {
      const layer = getDocument().layers.find((l) => l.id === getActiveLayer());
      if (
        name !== "DIMCONTINUE" &&
        (layer?.locked || layer?.visible === false)
      ) {
        log("Välj ett synligt, olåst lager.");
        return;
      }
      clearTracking();
      clearCommandInput();
      state.lastCommand = name;
      editor.start(name);
      state.selection = new Set(
        state.tool.source ? [state.tool.source.id] : [],
      );
      log(`${name} · Startat.`);
      prompt();
      update();
      return;
    }
    clearTracking();
    state.tool = { name, points: [], phase: "points" };
    state.lastCommand = name;
    clearCommandInput();

    const edit =
      transforms.includes(name) ||
      [
        "ERASE",
        "OFFSET",
        "TRIM",
        "EXTEND",
        "FILLET",
        "CHAMFER",
        "PINSERT",
        "PDELETE",
        "JOIN",
        "EXPLODE",
        "STRETCH",
        "BSTRETCH",
      ].includes(name);
    if (edit) {
      state.selection = new Set(
        [...state.selection].filter((id) => getEditableIds().has(id)),
      );
      if (!state.selection.size) state.tool.phase = "select";
      else if (name === "ERASE") {
        erase();
        return;
      }
    } else if (!["PAN", "DIST"].includes(name)) {
      if (
        getDocument().layers.find((l) => l.id === getActiveLayer())?.locked ||
        getDocument().layers.find((l) => l.id === getActiveLayer())?.visible ===
          false
      ) {
        log("Aktivt lager är låst eller dolt. Välj ett synligt, olåst lager.");
        state.tool = null;
        prompt();
        return;
      }
      state.selection.clear();
    }
    if (editor.supports(name)) {
      editor.start(name);
      if (["TRIM", "EXTEND"].includes(name)) state.selection.clear();
      if (["JOIN", "EXPLODE"].includes(name) && selectedEntities().length)
        dispatchEditor({ type: "text", text: "" });
    } else editor.cancel();
    log(
      `${name} · ${state.tool?.phase === "select" ? "Välj objekt." : "Startat."}`,
    );
    prompt();
    renderInspector();
    showSelection();
  }
  function erase() {
    if (!state.selection.size) {
      start("ERASE");
      return;
    }
    editor.start("ERASE");
    dispatchEditor({ type: "text", text: "" });
    prompt();
    update();
  }
  function dispatchEditor(event) {
    try {
      editor.dispatch(event);
      showSelection();
    } catch (error) {
      log(error.message || "Ändringen kunde inte sparas.");
    }
  }
  function acceptPoint(p) {
    if (wblockDialog.picking === "base") {
      wblockDialog.resume(p);
      return;
    }
    if (!editor.owns(state.tool)) return;
    dispatchEditor({ type: "point", point: p });
    prompt();
  }
  function submit(value) {
    if (!projectWorkspace.active) return;
    const text = value.trim();
    if (wblockDialog.picking) {
      clearCommandInput();
      if (wblockDialog.picking === "objects") {
        if (!text) wblockDialog.resume();
        else
          log("Markera objekten och tryck Enter för att återgå till WBLOCK.");
      } else {
        const point = text
          ? parsePoint(text, null, state.cursor)
          : { x: 0, y: 0 };
        if (point) wblockDialog.resume(point);
        else log("Ange en baspunkt, t.ex. 100,200.");
      }
      return;
    }
    if (text) {
      state.commandHistory.push(text);
      state.historyCursor = state.commandHistory.length;
    }
    clearCommandInput();

    if (!state.tool) {
      start(text || state.lastCommand);
      return;
    }
    dispatchEditor({ type: "text", text, cursor: state.cursor });
    prompt();
  }

  return {
    previewEntities,
    cancel,
    start,
    erase,
    dispatchEditor,
    acceptPoint,
    submit,
  };
}
