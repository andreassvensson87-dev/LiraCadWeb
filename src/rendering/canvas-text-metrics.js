import { configureTextMetrics } from "../model/text-metrics.js";
import { displayFontFamily } from "../model/font-catalog.js";

// The host owns Canvas and font loading. Rendering, hit testing and export all
// receive one configured metric provider, reset when a browser font is loaded.
export function installTextMetrics({
  createContext = () =>
    typeof OffscreenCanvas !== "undefined"
      ? new OffscreenCanvas(1, 1).getContext("2d")
      : typeof document !== "undefined"
        ? document.createElement("canvas").getContext("2d")
        : null,
} = {}) {
  const context = createContext();
  if (!context) return false;
  const widths = new Map();
  function font(style) {
    context.font = `${style.italic ? "italic " : ""}${style.bold ? "bold " : ""}100px ${displayFontFamily(style, style.font || "Arial")}`;
  }
  configureTextMetrics({
    measure(text, style, height) {
      font(style);
      const key = context.font + "\0" + text;
      let width = widths.get(key);
      if (width == null) {
        width =
          context.measureText(text).width /
          (context.measureText("H").actualBoundingBoxAscent || 72);
        if (widths.size > 20000) widths.clear();
        widths.set(key, width);
      }
      return width * height;
    },
    emSize(style, height) {
      font(style);
      return (
        (height * 100) /
        (context.measureText("H").actualBoundingBoxAscent || 72)
      );
    },
  });
  return true;
}
