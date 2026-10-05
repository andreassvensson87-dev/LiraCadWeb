import { spaceOf } from "./layout.js";

export function createLayoutInspector({ field, choice, section, action, getDocument, commit, log, refresh, afterFormat, afterRemove }) {
  return function render(root, layoutId) {
    const layout = getDocument().layouts?.find((l) => l.id === layoutId);
    if (!layout) return;
    const panel = section("PAPPER");
    panel.append(field("Namn", layout.name, (value) => {
      const name = value.trim();
      if (!name || name.toLowerCase() === "model" || getDocument().layouts.some((l) => l.id !== layoutId && l.name.toLowerCase() === name.toLowerCase())) {
        log("Layoutnamnet måste vara unikt."); refresh(); return;
      }
      commit("Layoutnamn", (draft) => {
        const current = draft.layouts.find((l) => l.id === layoutId);
        if (!current) throw Error("Layouten finns inte längre.");
        current.name = name;
      });
    }, "text"));
    panel.append(choice("Format", `${layout.width}x${layout.height}`, [
      ["420x297", "A3 liggande"], ["297x420", "A3 stående"],
      ["297x210", "A4 liggande"], ["210x297", "A4 stående"],
    ], (value) => {
      commit("Pappersformat", (draft) => {
        const current = draft.layouts.find((l) => l.id === layoutId);
        if (!current) throw Error("Layouten finns inte längre.");
        [current.width, current.height] = value.split("x").map(Number);
      });
      afterFormat();
    }));
    panel.append(action("Ta bort layout", () => {
      commit("Ta bort layout", (draft) => {
        draft.entities = draft.entities.filter((e) => spaceOf(e) !== layoutId);
        draft.layouts = draft.layouts.filter((l) => l.id !== layoutId);
      });
      afterRemove();
    }));
    root.append(panel);
  };
}
