import { definitions } from "./command-catalog.js";
import { commandPrompt } from "./command-prompts.js";

// Command labels, active buttons and input belong to presentation.
export function createCommandFeedback({
  document,
  state,
  editor,
  clearTracking,
  renderInspector,
  schedule,
}) {
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const input = $("#command-input"),
    canvas = $("#canvas");
  function prompt() {
    if (!state.tool) {
      clearTracking();
      state.snap = null;
      $("#snap-feedback").textContent = "";
    }
    const s = editor.owns(state.tool)
      ? editor.describe().prompt
      : commandPrompt(state.tool);
    $("#command-label").textContent = state.tool ? state.tool.name : "Kommando";
    input.placeholder = s || "Skriv ett kommando…";
    $("#status-mode").textContent = state.tool?.catalog
      ? `Placera ${state.tool.catalog.label}`
      : state.tool
        ? state.tool.name === "EXTEND"
          ? "Trimma / Förläng"
          : definitions.find((d) => d[0] === state.tool.name)?.[1] ||
            state.tool.name
        : "Redo";
    const toolbarCommand =
      state.tool?.name === "EXTEND" ? "TRIM" : state.tool?.name;
    $$("[data-command]").forEach((b) => {
      b.classList.toggle("active", b.dataset.command === toolbarCommand);
      b.classList.toggle(
        "selected",
        b.dataset.command === (toolbarCommand || "SELECT"),
      );
    });
    canvas.style.cursor = state.tool?.name === "PAN" ? "grab" : "crosshair";
    renderInspector();
    schedule();
  }

  function clearCommandInput() {
    input.value = "";
    $("#suggestions").hidden = true;
  }
  function showSelection() {
    $("#selection-badge").textContent = state.selection.size;
  }
  return {
    prompt,
    clearCommandInput,
    showSelection,
    showHelp: () => $("#help-dialog").showModal(),
  };
}
