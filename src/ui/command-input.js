import { createCommandCompletion } from "./command-completion.js";
import { commandSubmitKey } from "../editor/navigation.js";

export function installCommandInput({
  input,
  popup,
  state,
  submit,
  isPicking,
}) {
  const commandCompletion = createCommandCompletion({
    input,
    popup,
    enabled: () => !state.tool && !isPicking(),
    submit,
  });
  input.addEventListener("keydown", (ev) => {
    if (ev.isComposing) return;
    if (commandCompletion.navigate(ev)) return;
    if (
      ["ArrowUp", "ArrowDown"].includes(ev.key) &&
      state.commandHistory.length
    ) {
      ev.preventDefault();
      state.historyCursor = Math.max(
        0,
        Math.min(
          state.commandHistory.length,
          state.historyCursor + (ev.key === "ArrowUp" ? -1 : 1),
        ),
      );
      input.value = state.commandHistory[state.historyCursor] || "";
      commandCompletion.hide();
    }
    if (commandSubmitKey(ev, state.tool?.phase === "text")) {
      ev.preventDefault();
      ev.stopPropagation();
      const value = commandCompletion.resolve();
      commandCompletion.hide();
      submit(value);
    }
    // Holding Space must not insert spaces or submit several command steps.
    if (
      ev.key === " " &&
      state.tool?.phase !== "text" &&
      !ev.ctrlKey &&
      !ev.metaKey &&
      !ev.altKey
    )
      ev.preventDefault();
  });

  return commandCompletion;
}
