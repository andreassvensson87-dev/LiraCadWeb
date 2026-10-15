// Compatibility facade for existing callers. Internal modules import their owners directly.
export * from "./model/geometry.js";
export * from "./model/values.js";
export * from "./model/entity-geometry.js";
export * from "./model/entity-transform.js";
export * from "./model/offset.js";
export * from "./model/document.js";
export * from "./examples/demo-document.js";
export { History } from "./model/history.js";
export { toDXF } from "./io/dxf-export.js";
