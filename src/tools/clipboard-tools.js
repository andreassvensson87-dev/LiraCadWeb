import { parsePoint } from "../model/geometry.js";
import { transformed } from "../model/entity-transform.js";
import { drawingBounds } from "../model/entity-geometry.js";

// Placement owns only isolated clipboard data. Preview never changes a document.
export const clipboardTools = {
  PASTECLIP: {
    create({ clipboard, space }) {
      const bounds = drawingBounds(clipboard.entities);
      return {
        name: "PASTECLIP", phase: "points", points: [], clipboard, space,
        base: { x: bounds.minX, y: bounds.minY },
      };
    },
    handle(state, event) {
      let point;
      if (event.type === "point") point = event.point;
      else if (event.type === "text") point = parsePoint(event.text.trim(), state.base, event.cursor);
      else return { state };
      if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y))
        return { state, message: "Klicka en insättningspunkt eller ange koordinater, t.ex. 100,200. Esc avbryter." };
      return {
        state: null,
        change: { kind: "clipboard", clipboard: state.clipboard, base: state.base, point, space: state.space },
      };
    },
    preview(state, cursor) {
      const layers = new Map(state.clipboard.layers.map((layer) => [layer.id, layer]));
      function style(entity) {
        const layer = layers.get(entity.layer);
        entity.color ??= layer?.color;
        if (!entity.lineType || entity.lineType === "BYLAYER") {
          entity.lineType = layer?.lineType;
          entity.linePattern = layer?.linePattern;
        }
        entity.lineWeight ??= layer?.lineWeight;
        entity.definition?.entities.forEach(style);
        entity.dimensionGraphics?.forEach(style);
        Object.values(entity.attributeOverrides || {}).forEach(style);
        entity.annotationVariants?.forEach((variant) => style(variant.entity));
        return entity;
      }
      return state.clipboard.entities.map((e) => ({
        ...style(transformed(e, "MOVE", state.base, cursor)), space: state.space,
      }));
    },
    describe: () => ({
      label: "Klistra in",
      prompt: "Klistra in · Klicka eller ange insättningspunkt · Nedre vänstra hörnet följer pekaren · Esc avbryter",
      properties: [],
    }),
  },
};
