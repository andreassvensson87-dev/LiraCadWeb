// DXF text controls are parsed as data. Braces scope formatting, not content.
export function cadFont(file = "Arial") {
  const name = file.split(/[\\/]/).at(-1).replace(/\.(ttf|otf|shx)$/i, "");
  return /^[\p{L}\p{N} _.+-]{1,100}$/u.test(name) ? name : "Arial";
}
export function parseMtext(source, defaults = {}) {
  const runs = [], stack = []; let style = {}, buffer = "", simplified = false;
  const flush = () => { if (buffer) runs.push({ ...style, text: buffer }); buffer = ""; };
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (c === "{") { flush(); stack.push({ ...style }); continue; }
    if (c === "}") { flush(); style = stack.pop() || style; continue; }
    if (c !== "\\") { buffer += c; continue; }
    const code = source[++i];
    if (code == null) { buffer += "\\"; break; }
    if ("\\{}".includes(code)) { buffer += code; continue; }
    if (code === "N") { buffer += "\f"; continue; }
    if (code === "P") { buffer += "\n"; continue; }
    if (code === "~") { buffer += "\u00a0"; continue; }
    if (code === "U" && source[i + 1] === "+") {
      const hex = source.slice(i + 2, i + 6);
      if (/^[\da-f]{4}$/i.test(hex)) { buffer += String.fromCharCode(parseInt(hex, 16)); i += 5; continue; }
    }
    if (/[LlOoKk]/.test(code)) { flush(); if (/[Ll]/.test(code)) style.underline = code === "L"; else simplified = true; continue; }
    const end = source.indexOf(";", i + 1);
    if (end < 0) { buffer += "\\" + code; continue; }
    const value = source.slice(i + 1, end); i = end;
    flush();
    if (/[fF]/.test(code)) {
      const [font, ...flags] = value.split("|"); style.font = cadFont(font);
      for (const flag of flags) { if (/^b[01]$/.test(flag)) style.bold = flag === "b1"; if (/^i[01]$/.test(flag)) style.italic = flag === "i1"; }
    } else if (code === "H") {
      const h = parseFloat(value); if (h > 0 && Number.isFinite(h)) style.heightScale = /x$/i.test(value) ? h : h / (defaults.height || 1);
    } else if (code === "W") {
      const w = parseFloat(value); if (w > 0 && Number.isFinite(w)) style.widthFactor = w;
    } else if (code === "T") {
      const t = parseFloat(value) * (/x$/i.test(value) ? style.tracking || defaults.tracking || 1 : 1);
      if (t >= 0.75 && t <= 4) style.tracking = t; else simplified = true;
    } else if (code === "p") {
      const align = value.match(/q([lcr])/);
      if (align) style.paragraphAlign = { l: "left", c: "center", r: "right" }[align[1]];
      if (value.replace(/x|q[lcr]|,/g, "")) simplified = true;
    } else if (code === "Q") {
      const q = Number(value); if (Number.isFinite(q)) style.oblique = q * Math.PI / 180;
    } else if (code === "C") {
      const index = Number(value); style.colorIndex = index;
    } else if (code === "c") {
      const n = Number(value); if (Number.isInteger(n) && n >= 0 && n <= 0xffffff) style.color = "#" + n.toString(16).padStart(6, "0");
    } else if (code === "S") { buffer += value.replace(/\^\s*/g, "/").replace(/#/g, "/"); simplified = true; }
    else if (code !== "A") simplified = true;
  }
  flush();
  return { text: runs.map(r => r.text).join(""), runs, simplified };
}
