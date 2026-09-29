export const textLines = (text) =>
  String(text).replace(/\r\n?/g, "\n").split("\n");
export const textFont = (e) =>
  ["Arial", "Georgia", "Courier New"].includes(e.font) ? e.font : "Arial";
export const needsMtext = (e) =>
  textLines(e.text).length > 1 || e.bold || e.italic || e.underline || e.font;
export function mtextContent(e) {
  const escaped = String(e.text)
    .replace(/\r\n?/g, "\n")
    .replace(/\\/g, "\\\\")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}")
    .replace(/\n/g, "\\P");
  return `{\\f${textFont(e)}|b${e.bold ? 1 : 0}|i${e.italic ? 1 : 0};${e.underline ? "\\L" : ""}${escaped}${e.underline ? "\\l" : ""}}`;
}
export function textChunks(text) {
  const chars = Array.from(text),
    chunks = [];
  while (chars.length >= 250) chunks.push([3, chars.splice(0, 250).join("")]);
  chunks.push([1, chars.join("")]);
  return chunks;
}
