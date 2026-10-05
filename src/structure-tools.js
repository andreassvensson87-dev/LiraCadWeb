import { joinEntities, explodePolyline } from "./editing.js";
import { dimensionParts } from "./dimensions.js";
import { blockParts } from "./blocks.js";
import { uid } from "./values.js";
import { commandPrompt } from "./command-prompts.js";

export const structureTools = Object.fromEntries(["JOIN", "EXPLODE"].map((name) => [name, {
  create: () => ({ name, phase: "select", points: [] }),
  handle(state, event, context) {
    if (event.type !== "text") return { state };
    if (event.text.trim()) return { state, message: "Markera objekt och tryck Enter." };
    const sources = context.entities || [];
    try {
      if (!sources.length) throw Error(name === "JOIN" ? "Välj öppna linjer, bågar eller polylinjer." : "Välj polylinjer, block eller mått.");
      const entities = name === "JOIN" ? [joinEntities(sources)] : sources.flatMap((e) => {
        if (e.type === "dimension") return dimensionParts(e).map((part) => ({ ...part, id: uid() }));
        if (e.type === "block") return blockParts(e).map((part) => {
          const result = { ...part, id: uid() };
          delete result.attributeTag;
          delete result.attributeSchema;
          return result;
        });
        return explodePolyline(e);
      });
      return {
        state: null, selection: entities.map((e) => e.id),
        change: { kind: "editing", label: name === "JOIN" ? "Sammanfoga" : "Dela upp", replaceIds: sources.map((e) => e.id), entities },
      };
    } catch (error) { return { state, message: error.message }; }
  },
  preview: () => [],
  describe: (state) => ({ prompt: commandPrompt(state), properties: ["layer", "color", "lineType"] }),
}]));
