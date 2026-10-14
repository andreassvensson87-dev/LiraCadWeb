import { drawingTools } from "./drawing-tools.js";
import { stretchTools } from "./stretch-tools.js";
import { wblockTools } from "./wblock-tools.js";
import { transformTools } from "./transform-tools.js";
import { editingTools } from "./editing-tools.js";
import { cornerTools } from "./corner-tools.js";
import { vertexTools } from "./vertex-tools.js";
import { structureTools } from "./structure-tools.js";
import { dimensionTools } from "./dimension-tools.js";
import { blockTools } from "./block-tools.js";
import { viewportTools } from "./viewport-tools.js";
import { annotationTools } from "./annotation-tools.js";
import { utilityTools } from "./utility-tools.js";

// Tools depend on isolated context, never on UI or storage.
export function createEditorTools() {
  return {
    ...drawingTools,
    ...stretchTools,
    ...wblockTools,
    ...transformTools,
    ...editingTools,
    ...cornerTools,
    ...vertexTools,
    ...structureTools,
    ...dimensionTools,
    ...blockTools,
    ...viewportTools,
    ...annotationTools,
    ...utilityTools,
  };
}
