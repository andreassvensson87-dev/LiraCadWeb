// Keep the source font in the document. This family is only a display fallback.
export const CAD_ISO_FONT = "LiraCAD ISO";
export const nativeFontName = (font) =>
  font === CAD_ISO_FONT ? "osifont" : font;
export function usesIsoFont(e) {
  const name = String(e.sourceFont || e.font || "")
    .split(/[\\/]/)
    .at(-1)
    .replace(/\.(ttf|shx)$/i, "");
  return (
    /^(osifont|isocp|isocpeur|isocp2|isocp3|isoct|isocteur|isoct2|isoct3)$/i.test(
      name,
    ) || e.font === CAD_ISO_FONT
  );
}
export function displayFontFamily(e, font) {
  if (!usesIsoFont(e)) return `"${font}", Arial, sans-serif`;
  // SHX is not a browser font: the importer previously assigned Arial Narrow.
  const shx = /\.shx$/i.test(e.sourceFont || "");
  return `${shx ? "" : `"${font}", `}"${CAD_ISO_FONT}", "Arial Narrow", Arial, sans-serif`;
}
