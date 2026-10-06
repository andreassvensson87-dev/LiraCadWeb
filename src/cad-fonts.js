// Keep the source font in the document. This family is only a display fallback.
export const CAD_ISO_FONT = "LiraCAD ISO";
export const nativeFontName = font => font === CAD_ISO_FONT ? "osifont" : font;
export function usesIsoFont(e) {
  const name = String(e.sourceFont || e.font || "").split(/[\\/]/).at(-1).replace(/\.(ttf|shx)$/i, "");
  return /^(osifont|isocp|isocpeur|isocp2|isocp3|isoct|isocteur|isoct2|isoct3)$/i.test(name) || e.font === CAD_ISO_FONT;
}
export function displayFontFamily(e, font) {
  if (!usesIsoFont(e)) return `"${font}", Arial, sans-serif`;
  // SHX is not a browser font: the importer previously assigned Arial Narrow.
  const shx = /\.shx$/i.test(e.sourceFont || "");
  return `${shx ? "" : `"${font}", `}"${CAD_ISO_FONT}", "Arial Narrow", Arial, sans-serif`;
}
export let fontRevision = 0;
let embedded = "", loading;
export function loadCadFonts() {
  if (!loading) loading = (async () => {
    if (typeof FontFace === "undefined" || typeof document === "undefined") return false;
    try {
      const response = await fetch(new URL("./vendor/fonts/osifont/osifont.ttf", import.meta.url), { signal: AbortSignal.timeout(5000) });
      if (!response.ok) return false;
      const bytes = await response.arrayBuffer();
      const face = await new FontFace(CAD_ISO_FONT, bytes).load();
      document.fonts.add(face);
      fontRevision++;
      let binary = "";
      for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
      embedded = btoa(binary);
      return true;
    } catch { return false; }
  })();
  return loading;
}
export function cadFontSvgStyle() {
  return embedded ? `<style>@font-face{font-family:'${CAD_ISO_FONT}';src:url(data:font/ttf;base64,${embedded}) format('truetype');}</style>` : "";
}
