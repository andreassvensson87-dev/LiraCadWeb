import { clone, uid } from "../model/values.js";

// Defaults belong to an editing context, never to a document or UI field.
export function createCreationSettings({ getLayer, drawingSpace }) {
  const presets = {
    model: {
      text: { height: 150, rotation: 0, font: "Arial" },
      leader: { height: 120, font: "Arial" },
      hatch: { spacing: 120, patternAngle: Math.PI / 4 },
      dimension: { height: 120, precision: 0 },
    },
    paper: {
      text: { height: 2.5, rotation: 0, font: "Arial" },
      leader: { height: 2.5, font: "Arial" },
      hatch: { spacing: 2, patternAngle: Math.PI / 4 },
      dimension: { height: 2.5, precision: 0 },
    },
  };
  let mode = "model";
  const settings = {
    defaults: clone(presets.model),
    color: null,
    lineType: "BYLAYER",
    setMode(next) {
      if (next === mode) return;
      if (!presets[next]) throw Error("Okänd ritmiljö.");
      presets[mode] = clone(settings.defaults);
      mode = next;
      Object.assign(settings.defaults, clone(presets[mode]));
    },
    make(type, props) {
      return {
        id: uid(),
        type,
        layer: getLayer(),
        space: drawingSpace(),
        ...props,
        color: settings.color,
        lineType: settings.lineType,
        ...settings.defaults[type],
      };
    },
  };
  return settings;
}
