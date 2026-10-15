import { CAD_ISO_FONT } from "../model/font-catalog.js";
import { installTextMetrics } from "./canvas-text-metrics.js";
export * from "../model/font-catalog.js";
let embedded = "",
  loading;
export function loadCadFonts() {
  if (!loading)
    loading = (async () => {
      if (typeof FontFace === "undefined" || typeof document === "undefined")
        return false;
      try {
        const response = await fetch(
          new URL("../vendor/fonts/osifont/osifont.ttf", import.meta.url),
          { signal: AbortSignal.timeout(5000) },
        );
        if (!response.ok) return false;
        const bytes = await response.arrayBuffer();
        const face = await new FontFace(CAD_ISO_FONT, bytes).load();
        document.fonts.add(face);
        installTextMetrics();
        let binary = "";
        for (const byte of new Uint8Array(bytes))
          binary += String.fromCharCode(byte);
        embedded = btoa(binary);
        return true;
      } catch {
        return false;
      }
    })();
  return loading;
}
export function cadFontSvgStyle() {
  return embedded
    ? `<style>@font-face{font-family:'${CAD_ISO_FONT}';src:url(data:font/ttf;base64,${embedded}) format('truetype');}</style>`
    : "";
}
