import { createPointerController } from "../editor/pointer-controller.js";
import { installCommandInput } from "./command-input.js";

// Explicit callbacks connect this controller to the current application instance.
export function installInputController({
  document,
  window,
  canvas,
  state,
  textEditor,
  moveCursor,
  hit,
  layerOf,
  beginAttributeTextEdit,
  beginBlockEdit,
  beginTextEdit,
  paperPoint,
  getDocument,
  enterViewport,
  $,
  finishTextEdit,
  setTrimShift,
  inActiveViewport,
  leaveViewport,
  input,
  schedule,
  getInteractionEntities,
  editable,
  screen,
  update,
  acceptPoint,
  dispatchEditor,
  prompt,
  navigating,
  replaceEntities,
  log,
  syncViewport,
  submit,
  world,
  acquireTrack,
  wblockDialog,
  projectWorkspace,
  cancel,
  undo,
  saveProject,
  toggle,
  erase,
  clipboard,
}) {
  const pointer = createPointerController({
    state,
    textEditor,
    moveCursor,
    hit,
    layerOf,
    beginAttributeTextEdit,
    beginBlockEdit,
    beginTextEdit,
    paperPoint,
    getDocument,
    enterViewport,
    finishTextEdit,
    setTrimShift,
    inActiveViewport,
    leaveViewport,
    capturePointer: (id) => canvas.setPointerCapture(id),
    blurCommand: () => input.blur(),
    setCursor: (value) => {
      canvas.style.cursor = value;
    },
    schedule,
    getInteractionEntities,
    editable,
    screen,
    update,
    acceptPoint,
    dispatchEditor,
    prompt,
    navigating,
    replaceEntities,
    log,
    syncViewport,
    getNavigationMode: () => $("#navigation-device").value,
    world,
    acquireTrack,
  });

  canvas.addEventListener("dblclick", pointer.dblclick);
  document.addEventListener(
    "pointerdown",
    (ev) => {
      if (
        textEditor.active &&
        !$("#text-editor").contains(ev.target) &&
        ev.target !== canvas
      )
        finishTextEdit(true);
    },
    true,
  );
  function movedViewport(...args) {
    return pointer.movedViewport(...args);
  }
  canvas.addEventListener("pointerdown", pointer.pointerdown);
  // Suppress native middle-button autoscroll/paste without affecting CAD pan.
  for (const name of ["mousedown", "auxclick"]) {
    canvas.addEventListener(name, (ev) => {
      if (ev.button === 1) ev.preventDefault();
    });
  }
  canvas.addEventListener("pointermove", pointer.pointermove);
  canvas.addEventListener("pointerup", pointer.pointerup);
  function cancelTrimSweep(...args) {
    return pointer.cancelTrimSweep(...args);
  }
  canvas.addEventListener("lostpointercapture", pointer.lostpointercapture);
  canvas.addEventListener("pointercancel", pointer.pointercancel);
  canvas.addEventListener("contextmenu", (ev) => {
    ev.preventDefault();
    submit("");
  });
  canvas.addEventListener("wheel", pointer.wheel, { passive: false });
  canvas.addEventListener("pointerleave", pointer.pointerleave);
  const commandCompletion = installCommandInput({
    input,
    popup: $("#suggestions"),
    state,
    submit,
    isPicking: () => Boolean(wblockDialog.picking),
  });
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Shift") setTrimShift(true);
    if (!projectWorkspace.active) return;
    const editing = ev.target.matches(
      "input,select,textarea,[contenteditable=true]",
    );
    if (
      $("#help-dialog").open ||
      $("#settings-dialog").open ||
      $("#wblock-dialog").open ||
      textEditor.active
    )
      return;
    if (ev.isComposing) return;
    if (ev.key === "Escape") {
      ev.preventDefault();
      if (wblockDialog.picking) {
        wblockDialog.resume();
        return;
      }
      if (editing && ev.target !== input) ev.target.blur();
      cancel();
      return;
    }
    if (editing && ev.target !== input) return;
    const mod = ev.metaKey || ev.ctrlKey;
    if (mod && !ev.altKey && !editing && ["c", "x", "v"].includes(ev.key.toLowerCase())) {
      ev.preventDefault();
      if (!ev.repeat) clipboard[{ c: "copy", x: "cut", v: "paste" }[ev.key.toLowerCase()]]();
      return;
    }
    if (mod && ev.key.toLowerCase() === "z") {
      ev.preventDefault();
      undo(ev.shiftKey);
      return;
    }
    if (mod && ev.key.toLowerCase() === "y") {
      ev.preventDefault();
      undo(true);
      return;
    }
    if (mod && ev.key.toLowerCase() === "s") {
      ev.preventDefault();
      saveProject();
      return;
    }
    if (mod && ev.key.toLowerCase() === "a" && ev.target !== input) {
      ev.preventDefault();
      state.selection = new Set(
        getDocument()
          .entities.filter(editable)
          .map((e) => e.id),
      );
      update();
      return;
    }
    if (["F3", "F8", "F10", "F11"].includes(ev.key)) {
      ev.preventDefault();
      toggle({ F3: "snap", F8: "ortho", F10: "polar", F11: "track" }[ev.key]);
      return;
    }
    if (editing) return;
    if (ev.target.closest("button") && ["Enter", " "].includes(ev.key)) return;
    if (["Delete", "Backspace"].includes(ev.key)) {
      ev.preventDefault();
      if (state.selection.size) erase();
      return;
    }
    if (ev.key === "Enter") {
      ev.preventDefault();
      submit("");
      return;
    }
    if (ev.code === "Space") {
      ev.preventDefault();
      if (!ev.repeat) {
        state.space = true;
        state.spaceUsed = false;
      }
      return;
    }
    if (!mod && !ev.altKey && ev.key.length === 1) {
      ev.preventDefault();
      input.focus();
      input.value += ev.key;
      input.dispatchEvent(new Event("input"));
    }
  });
  document.addEventListener("keyup", (ev) => {
    if (ev.key === "Shift") setTrimShift(false);
    if (ev.code === "Space") {
      const shouldSubmit = state.space && !state.spaceUsed;
      state.space = false;
      if (shouldSubmit) submit("");
    }
  });
  window.addEventListener("blur", () => {
    cancelTrimSweep();
    setTrimShift(false);
    state.space = false;
    state.drag = null;
    state.mouse = { x: -1, y: -1 };
    acquireTrack(null);
    schedule();
  });

  return { commandCompletion, movedViewport };
}
