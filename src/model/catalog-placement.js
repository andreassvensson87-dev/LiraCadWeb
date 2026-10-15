import { insertBlock } from "./blocks.js";
import { drawingBounds } from "./entity-geometry.js";

export function catalogAnchor(template, anchor = "center") {
  if (anchor === "base") return { x: 0, y: 0 };
  const b = drawingBounds(template.definition.entities);
  return {
    x: anchor.includes("left") ? b.minX : anchor.includes("right") ? b.maxX : (b.minX + b.maxX) / 2,
    y: anchor.includes("bottom") ? b.minY : anchor.includes("top") ? b.maxY : (b.minY + b.maxY) / 2,
  };
}

export function catalogInstance(template, point, creation, placement) {
  const anchor = catalogAnchor(template, placement.anchor);
  const rotation = placement.rotation;
  const block = insertBlock(template, {
    x: point.x - anchor.x * Math.cos(rotation) + anchor.y * Math.sin(rotation),
    y: point.y - anchor.x * Math.sin(rotation) - anchor.y * Math.cos(rotation),
  }, creation.layer, creation.space);
  return { ...block, rotation, color: creation.color, lineType: creation.lineType };
}
