import { drawingTools } from "../tools/drawing-tools.js";
import { stretchTools } from "../tools/stretch-tools.js";
import { wblockTools } from "../tools/wblock-tools.js";
import { transformTools } from "../tools/transform-tools.js";
import { editingTools } from "../tools/editing-tools.js";
import { cornerTools } from "../tools/corner-tools.js";
import { vertexTools } from "../tools/vertex-tools.js";
import { structureTools } from "../tools/structure-tools.js";
import { dimensionTools } from "../tools/dimension-tools.js";
import { blockTools } from "../tools/block-tools.js";
import { viewportTools } from "../tools/viewport-tools.js";
import { annotationTools } from "../tools/annotation-tools.js";
import { utilityTools } from "../tools/utility-tools.js";

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
