import { validTextColumns, placeTextColumns } from "./text-columns.js";
import { displayFontFamily, fontRevision, nativeFontName } from "./cad-fonts.js";
export const textLines = (text) =>
  String(text).replace(/\r\n?/g, "\n").split("\n");
export const textFont = (e) =>
  validFont(e.font) ? e.font : "Arial";
export const needsMtext = (e) =>
  e.textColumns != null || e.textAttachment != null || textLines(e.text).length > 1 || e.bold || e.italic || e.underline || (e.tracking != null && e.tracking !== 1) || e.textWidth > 0 || e.paragraphAlign != null || (e.font && e.textAlign == null);
export const textAlignment = e => e.textAttachment ? ["left", "center", "right"][(e.textAttachment - 1) % 3] : e.textAlign || "left";
export const textVerticalAnchor = e => e.textAttachment ? ["top", "middle", "bottom"][Math.floor((e.textAttachment - 1) / 3)] : e.textVertical || "baseline";
export function textSpanValue(e, key, fallback = 1) {
  const values = e.textRuns?.map(r => r[key] ?? e[key] ?? fallback);
  return values?.length && values.every(v => v === values[0]) ? values[0] : e[key] ?? fallback;
}
const escapeMtext = (text) => String(text).replace(/\r\n?/g, "\n").replace(/\\/g, "\\\\").replace(/\{/g, "\\{").replace(/\}/g, "\\}").replace(/\n/g, "\\P").replace(/\f/g, "\\N");
export function mtextContent(e) {
  const format = (style, text) => {
    let controls = /\.shx$/i.test(e.sourceFont || "") && !style.font ? "" : `\\f${nativeFontName(textFont({ ...e, ...style }))}|b${style.bold ?? e.bold ? 1 : 0}|i${style.italic ?? e.italic ? 1 : 0};`;
    if (style.heightScale) controls += `\\H${style.heightScale}x;`;
    if (style.widthFactor || e.widthFactor) controls += `\\W${style.widthFactor || e.widthFactor};`;
    if (style.tracking != null || e.tracking != null) controls += `\\T${style.tracking ?? e.tracking};`;
    const align = style.paragraphAlign || e.paragraphAlign || (!e.textAttachment && e.textAlign);
    if (align) controls += `\\pxq${{left:"l",center:"c",right:"r"}[align]};`;
    if (style.oblique || e.oblique) controls += `\\Q${((style.oblique || e.oblique) * 180) / Math.PI};`;
    if (style.cadColor7 && style.color === "#ffffff") controls += "\\C7;";
    else if (style.color) controls += `\\c${parseInt(style.color.slice(1), 16)};`;
    return `{${controls}${style.underline ?? e.underline ? "\\L" : ""}${escapeMtext(text)}${style.underline ?? e.underline ? "\\l" : ""}}`;
  };
  if (e.textRuns?.map(r => r.text).join("") === e.text) return e.textRuns.map(r => format(r, r.text)).join("");
  return format({}, e.text);
}
export function textChunks(text) {
  const chars = Array.from(text),
    chunks = [];
  while (chars.length >= 250) chunks.push([3, chars.splice(0, 250).join("")]);
  chunks.push([1, chars.join("")]);
  return chunks;
}

export const validFont = (font) => typeof font === "string" && /^[\p{L}\p{N} _.+-]{1,100}$/u.test(font);
export const fontFamily = (e) => displayFontFamily(e, textFont(e));
let measuring;
const widths = new Map();
function measure(text, style, height) {
  if (!measuring && typeof OffscreenCanvas !== "undefined") measuring = new OffscreenCanvas(1, 1).getContext("2d");
  if (!measuring && typeof document !== "undefined") measuring = document.createElement("canvas").getContext("2d");
  if (!measuring) return text.length * height * 0.65;
  // CAD height describes capital letters; use a fixed large em to avoid rounding
  // and measure the actual font's capital height rather than treating mm as px.
  measuring.font = `${style.italic ? "italic " : ""}${style.bold ? "bold " : ""}100px ${fontFamily(style)}`;
  const key = fontRevision + "\0" + measuring.font + "\0" + text;
  let width = widths.get(key);
  if (width == null) {
    const cap = measuring.measureText("H").actualBoundingBoxAscent || 72;
    width = measuring.measureText(text).width / cap;
    if (widths.size > 20000) widths.clear(); widths.set(key, width);
  }
  return width * height;
}
export function textEmSize(style, height) {
  measure("H", style, height);
  return measuring ? height * 100 / (measuring.measureText("H").actualBoundingBoxAscent || 72) : height / 0.72;
}
const segmenter = typeof Intl.Segmenter === "function" ? new Intl.Segmenter(undefined, { granularity: "grapheme" }) : null;
function trackedGlyphs(text, style, height) {
  const chars = segmenter ? Array.from(segmenter.segment(text), s => s.segment) : Array.from(text);
  let x = 0, tail = 0;
  const glyphs = chars.map((text, i) => {
    const glyph = { text, x }, width = measure(text, style, height);
    const advance = i + 1 < chars.length ? measure(text + chars[i + 1], style, height) - measure(chars[i + 1], style, height) : width;
    x += advance * style.tracking; tail = width * (style.tracking - 1);
    return glyph;
  });
  return { glyphs, width: x - tail, tail };
}
// Shared by canvas, SVG and hit testing. All positions are local, with Y down.
export function textLayout(e) {
  const source = e.textRuns?.map(r => r.text).join("") === e.text ? e.textRuns : [{ text: e.text }];
  const lines = [{ runs: [], width: 0, height: e.height }];
  const columns = validTextColumns(e.textColumns) ? e.textColumns : null;
  const wrap = columns ? columns.width : e.textWidth > 0 ? e.textWidth : Infinity;
  for (const run of source) {
    const style = { ...e, ...run, ...(run.font ? { sourceFont: run.sourceFont || run.font } : {}) }, height = e.height * (run.heightScale || 1);
    const factor = run.widthFactor || e.widthFactor || 1;
    const tokens = String(run.text).split(/([\n\f]|[ \t]+|[^ \t\n\f]+)/).filter(Boolean);
    for (let token of tokens) {
      if (token === "\n" || token === "\f") { lines.push({ runs: [], width: 0, height: e.height, ...(token === "\f" ? {columnBreak:true} : {}) }); continue; }
      const tracked = style.tracking != null && style.tracking !== 1 ? trackedGlyphs(token, style, height) : null;
      let line = lines.at(-1), width = (tracked?.width ?? measure(token, style, height)) * factor;
      if (line.width && line.width + (line.tail || 0) + width > wrap && !/^\s+$/.test(token)) {
        lines.push({ runs: [], width: 0, height: e.height }); line = lines.at(-1);
      }
      // Keep words intact. A column narrower than a single word may overflow.
      if (!line.width && lines.length > 1 && /^\s+$/.test(token)) continue;
      const x = line.width + (line.tail || 0);
      line.runs.push({ ...style, text: token, x, height, width, widthFactor: factor, ...(tracked ? { glyphs: tracked.glyphs } : {}) });
      line.width = x + width; line.tail = (tracked?.tail || 0) * factor; line.height = Math.max(line.height, height);
      line.align = style.paragraphAlign || e.paragraphAlign || (!e.textAttachment && e.textAlign) || "left";
    }
  }
  const width = Math.max(0, ...lines.map(l => l.width));
  let baseline = 0;
  for (let i = 0; i < lines.length; i++) {
    if (i) baseline += e.lineSpacingStyle === 2 ? e.height * (e.lineSpacing || 1.4) : Math.max(e.height, lines[i - 1].height, lines[i].height) * (e.lineSpacing || 1.4);
    lines[i].y = baseline;
  }
  const spacing = (a,b) => e.lineSpacingStyle === 2 ? e.height*(e.lineSpacing||1.4) : Math.max(e.height,a.height,b.height)*(e.lineSpacing||1.4);
  const columnBox = columns ? placeTextColumns(lines,columns,spacing) : null;
  const top = columns ? 0 : -lines[0].height, bottom = columnBox ? columnBox.height : baseline;
  if (columns) for (const line of lines) line.y += line.height;
  const attachment = e.textAttachment;
  const align = attachment ? ["left", "center", "right"][(attachment - 1) % 3] : e.textAlign || "left";
  const vertical = attachment ? ["top", "middle", "bottom"][Math.floor((attachment - 1) / 3)] : e.textVertical || "baseline";
  const boxWidth = columnBox ? columnBox.width : e.textWidth || width;
  const lineWidth = columns ? columns.width : boxWidth;
  for (const line of lines) line.x = (line.column || 0)*(columns ? columns.width+columns.gutter : 0) + (line.align === "center" ? (lineWidth-line.width)/2 : line.align === "right" ? lineWidth-line.width : 0);
  const x = align === "center" ? -boxWidth / 2 : align === "right" ? -boxWidth : 0;
  const y = vertical === "top" ? -top : vertical === "middle" ? -(top + bottom) / 2 : vertical === "bottom" ? -bottom : 0;
  const fit = e.textFitWidth && width ? e.textFitWidth / width : 1;
  return { lines, x, y, width: boxWidth * fit, top: top + y, bottom: bottom + y, fit };
}

export function applyTextProperty(entity, key, value) {
  const result = { ...entity, [key]: value };
  if (key === "textColumns" && value) result.textWidth=value.count*value.width+(value.count-1)*value.gutter;
  if (key === "textWidth" && entity.textColumns) {
    const c=entity.textColumns,width=Math.max(0.01,(value-(c.count-1)*c.gutter)/c.count);
    result.textColumns={...c,width};result.textWidth=c.count*width+(c.count-1)*c.gutter;
  }
  if (["font", "bold", "italic", "underline"].includes(key)) delete result.textRuns;
  if (key === "font") delete result.sourceFont;
  if (["tracking", "widthFactor"].includes(key) && result.textRuns) result.textRuns = result.textRuns.map(r => { const n = {...r}; delete n[key]; return n; });
  if (key === "textAlign") {
    if (entity.textAttachment) result.textAttachment = Math.floor((entity.textAttachment - 1) / 3) * 3 + ["left", "center", "right"].indexOf(value) + 1;
    result.paragraphAlign = value;
    if (result.textRuns) result.textRuns = result.textRuns.map(r => { const n = {...r}; delete n.paragraphAlign; return n; });
  }
  if (key === "textVertical" && entity.textAttachment) {
    if (value === "baseline") { result.textAlign = textAlignment(entity); delete result.textAttachment; }
    else result.textAttachment = ["top", "middle", "bottom"].indexOf(value) * 3 + ["left", "center", "right"].indexOf(textAlignment(entity)) + 1;
  }
  if (["tracking", "widthFactor", "textAlign", "textWidth"].includes(key)) delete result.textFitWidth;
  return result;
}
