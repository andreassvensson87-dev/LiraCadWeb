import { readTextColumns } from "./text-columns.js";
import { readAnnotations } from "./dxf-annotation.js";
import { polylineParts } from "./polyline.js";
import { splinePoints, ellipsePoints, affineEntity } from "./dxf-curves.js";
import { hatchLoops, readHatchPattern } from "./dxf-hatch.js";
import { dimensionGraphicsState, dimensionParts } from "./dimensions.js";
import { usesIsoFont } from "./cad-fonts.js";
import { mleaderParts } from "./dxf-mleader.js";
import { cadFont, parseMtext } from "./dxf-text.js";
import { aciColors } from "./dxf-colors.js";
import { uid } from "./values.js";
import { validDocument } from "./document.js";
import { transform } from "./entity-transform.js";
import { sub, add, mul } from "./geometry.js";
import { blockParts, validBlockName, validTag } from "./blocks.js";
import { lineTypes, validLineType } from "./linetypes.js";
import { bounds } from "./entity-geometry.js";
const get = (r, c, f = "") => r.find((p) => p[0] === c)?.[1] ?? f;
const all = (r, c) => r.filter((p) => p[0] === c).map((p) => p[1]);
const num = (r, c, f = 0) => Number(get(r, c, f));
const pt = (r, c = 10) => ({ x: num(r, c), y: num(r, c + 10) });
const rad = (v) => (v * Math.PI) / 180;
const unicode = (s) =>
  s
    .replace(/\\U\+([\da-f]{4})/gi, (_, h) =>
      String.fromCharCode(parseInt(h, 16)),
    )
    .replace(/%%d/gi, "°")
    .replace(/%%p/gi, "±")
    .replace(/%%c/gi, "Ø");
function vertices(r) {
  const result = [];
  for (const [c, v] of r) {
    if (c === 10) result.push({ x: Number(v), y: 0, bulge: 0 });
    else if (result.length && c === 20) result.at(-1).y = Number(v);
    else if (result.length && c === 42) result.at(-1).bulge = Number(v);
  }
  return result;
}
export function decodeDXF(buffer) {
  const bytes = new Uint8Array(buffer);
  const head = new TextDecoder("windows-1252").decode(bytes.subarray(0, 8192));
  if (head.startsWith("AutoCAD Binary DXF"))
    throw Error("Binär DXF stöds inte ännu. Spara som ASCII DXF.");
  const version = head.match(/\$ACADVER\s+1\s+(AC\d+)/)?.[1];
  const cp = head.match(/\$DWGCODEPAGE\s+3\s+ANSI_(\d+)/)?.[1];
  const encoding =
    version && Number(version.slice(2)) >= 1021
      ? "utf-8"
      : cp
        ? `windows-${cp}`
        : "windows-1252";
  try {
    return new TextDecoder(encoding, { fatal: true }).decode(bytes);
  } catch {
    throw Error(
      `Kunde inte läsa filens teckenkodning (${encoding}). Spara som DXF 2007 eller senare.`,
    );
  }
}
export function importDXF(text, name = "Importerad ritning") {
  if (text.startsWith("AutoCAD Binary DXF"))
    throw Error("Binär DXF stöds inte ännu. Spara som ASCII DXF.");
  const lines = text.replace(/^\uFEFF/, "").split(/\r\n|\n|\r/);
  while (lines.at(-1) === "") lines.pop();
  if (lines.length % 2)
    throw Error("DXF-filen har ett ofullständigt kod/värde-par.");
  if (lines.length > 6000000)
    throw Error("DXF-filen innehåller för många poster.");
  const sections = new Map();
  let section = "",
    record = null;
  let eof = false;
  for (let i = 0; i < lines.length; i += 2) {
    if (!/^\s*\d+\s*$/.test(lines[i]))
      throw Error(`Ogiltig DXF-kod på rad ${i + 1}.`);
    const code = Number(lines[i]),
      value = lines[i + 1];
    if (code === 0 && value.trim() === "SECTION") {
      if (Number(lines[i + 2]) !== 2) throw Error("Ogiltig DXF-sektion.");
      section = lines[i + 3].trim();
      if (!sections.has(section)) sections.set(section, []);
      record = null;
      i += 2;
      continue;
    }
    if (code === 0 && value.trim() === "ENDSEC") {
      section = "";
      record = null;
      continue;
    }
    if (code === 0 && value.trim() === "EOF") {
      eof = true;
      break;
    }
    if (!section) continue;
    if (code === 0 || !record) {
      record = [];
      sections.get(section).push(record);
    }
    record.push([code, code === 0 ? value.trim() : value]);
  }
  if (!eof || !sections.has("ENTITIES"))
    throw Error(
      "Filen saknar ENTITIES eller EOF och är inte en komplett ASCII DXF.",
    );
  const issues = new Map();
  const warn = (message) => issues.set(message, (issues.get(message) || 0) + 1);
  const annotations = readAnnotations(sections, warn);
  const doc = {
    version: 1,
    name: name.replace(/\.dxf$/i, ""),
    layers: [],
    entities: [],
    layouts: [],
    blocks: [],
    references: [],
  };
  const tables = sections.get("TABLES") || [],
    objects = sections.get("OBJECTS") || [];
  const headerPairs = (sections.get("HEADER") || []).flat();
  const scaleIndex = headerPairs.findIndex(([c, v]) => c === 9 && v === "$LTSCALE");
  const globalLineScale = scaleIndex < 0 ? 1 : Number(headerPairs[scaleIndex + 1]?.[1]) || 1;
  const nativePatterns = new Map(tables.filter(r => get(r, 0) === "LTYPE" && !r.some(([c,v]) => c === 74 && Number(v) !== 0)).map(r => [get(r, 2).toUpperCase(), all(r, 49).map(Number)]));
  const nativeLine = r => {
    const name = get(r, 6, "BYLAYER").toUpperCase();
    const pattern = ["BYLAYER", "BYBLOCK"].includes(name) ? undefined : nativePatterns.get(name);
    return { ...(pattern ? { linePattern: pattern.map(v => v * globalLineScale), linePatternType: lt(r) } : {}), lineScale: num(r, 48, 1) };
  };
  const color = (r) => {
    if (get(r, 420) !== "")
      return "#" + num(r, 420).toString(16).padStart(6, "0").slice(-6);
    const index = Math.abs(num(r, 62, 256));
    if (index === 256) return undefined;
    if (index === 0) {
      return undefined;
    }
    if (index === 7) return "#ffffff";
    if (aciColors[index]) return aciColors[index];
    warn("Ogiltig ACI-färg ersattes med grått");
    return "#c0c0c0";
  };
  const lt = (r) => {
    const value = get(r, 6, "BYLAYER").toUpperCase();
    if (value === "BYBLOCK") return "BYLAYER";
    if (validLineType(value)) return value;
    const pattern = nativePatterns.get(value);
    if (pattern) {
      if (!pattern.length) return "CONTINUOUS";
      if (pattern.filter(v => v >= 0).length > 1) return "CENTER";
      if (pattern.some(v => v === 0)) return "DOTTED";
      return "DASHED";
    }
    warn(`Linjetyp ${value} ersattes med Enligt lager`);
    return "BYLAYER";
  };
  const textStyles = new Map(tables.filter(r => get(r, 0) === "STYLE").map(r => [get(r, 2).toUpperCase(), r]));
  function textStyle(r) {
    const style = textStyles.get(get(r, 7, "STANDARD").toUpperCase()) || tables.find(s => get(s, 0) === "STYLE" && get(s, 5) === get(r, 7)) || [];
    const file = get(style, 3, "Arial");
    const shx = /\.shx$/i.test(file) || /^(txt|simplex|romans|helv_mag)$/i.test(file);
    const fallback = /iso/i.test(file) ? "Arial Narrow" : "Arial";
    if (shx) warn(`SHX-typsnitt ${file} använder ${usesIsoFont({sourceFont:file})?'LiraCAD ISO':fallback} som reserv; originalnamnet bevaras`);
    else if (!/^arial(\.ttf)?$/i.test(file)) warn(`Typsnitt ${cadFont(file)} bevarat; ersättningsfont används om det inte finns lokalt`);
    return { font: shx ? fallback : cadFont(file), sourceFont: file, widthFactor: num(style, 41, 1), oblique: rad(num(style, 50)) };
  }
  const layerMap = new Map();
  function layer(name) {
    name = unicode(name || "0");
    if (!layerMap.has(name)) {
      const id = uid();
      doc.layers.push({
        id,
        name,
        color: "#c3d6ce",
        visible: true,
        locked: false,
      });
      layerMap.set(name, id);
    }
    return layerMap.get(name);
  }
  for (const r of tables.filter((r) => get(r, 0) === "LAYER")) {
    const id = layer(get(r, 2));
    const l = doc.layers.find((l) => l.id === id);
    Object.assign(l, {
      color: color(r) || "#ffffff",
      visible: num(r, 62, 7) >= 0 && !(num(r, 70) & 1),
      locked: !!(num(r, 70) & 4),
      plot:!!num(r,290,get(r,2).toUpperCase()==='DEFPOINTS'?0:1),
      cadColor7:get(r,420)==='' && Math.abs(num(r,62,7))===7,
      ...nativeLine(r),
      ...(num(r, 370, -1) >= 0 ? { lineWeight: num(r, 370) / 100 } : {}),
      lineType: lt(r) === "BYLAYER" ? "CONTINUOUS" : lt(r),
    });
  }
  if (!doc.layers.length) layer("0");
  const spaceMap = new Map(),
    ownerSpace = new Map(),
    paperTransforms = new Map();
  function space(name) {
    if (!name || name.toLowerCase() === "model") return "model";
    if (!spaceMap.has(name)) {
      const id = uid();
      doc.layouts.push({ id, name, width: 420, height: 297 });
      spaceMap.set(name, id);
    }
    return spaceMap.get(name);
  }
  for (const r of objects.filter((r) => get(r, 0) === "LAYOUT")) {
    const names = all(r, 1),
      name = names.at(-1);
    if (!name || name.toLowerCase() === "model") continue;
    const id = space(name);
    const l = doc.layouts.find((l) => l.id === id);
    if (num(r, 44) > 0 && num(r, 45) > 0) {
      l.width = num(r, 44);
      l.height = num(r, 45);
      if (num(r, 73) % 2) [l.width, l.height] = [l.height, l.width];
      // Our paper coordinates are physical mm. Native layouts can draw on A1
      // and plot at 1:2 on A3; scale only paper entities, never model geometry.
      const numerator = num(r, 142, 1), denominator = num(r, 143, 1);
      const factor = num(r, 70) & 16 ? num(r, 147, numerator / denominator) : numerator / denominator;
      const scale = factor * (num(r, 72, 1) === 0 ? 25.4 : 1);
      if (Number.isFinite(scale) && scale > 0 && num(r, 72, 1) !== 2) {
        const window = num(r, 74) === 4;
        paperTransforms.set(id, { scale, x: num(r, 46) + num(r, 40) - (window ? num(r, 48) * scale : 0), y: num(r, 47) + num(r, 41) - (window ? num(r, 49) * scale : 0) });
      } else warn(`Layout ${name}: utskriftsskalan kunde inte läsas; papperskoordinater behölls`);
    } else warn("Pappersformat saknades; A3 användes");
    ownerSpace.set(all(r, 330).at(-1), id);
  }
  const blocks = new Map();
  let block = null;
  for (const r of sections.get("BLOCKS") || []) {
    if (get(r, 0) === "BLOCK") {
      block = { header: r, records: [] };
      blocks.set(get(r, 2), block);
    } else if (get(r, 0) === "ENDBLK") block = null;
    else if (block) block.records.push(r);
  }
  const definitions = new Map(),
    building = new Set();
  const styles = new Map(
    tables.filter((r) => get(r, 0) === "DIMSTYLE").map((r) => [get(r, 2), r]),
  );
  function definition(name) {
    if (definitions.has(name)) return definitions.get(name);
    const b = blocks.get(name);
    if (b && num(b.header, 70) & 12) warn(`Extern referens ${name} (${get(b.header, 1)}) behöver tillhörande DWG-fil; laddas inte automatiskt`);
    if (!b) throw Error(`Blockdefinition ${name} saknas`);
    if (building.has(name)) throw Error("Cirkulära blockreferenser stöds inte");
    if (building.size >= 20) throw Error("För många nivåer av nästlade block");
    building.add(name);
    const entities = read(b.records, true);
    const base = pt(b.header);
    let safe =
      unicode(name)
        .replace(/[^\p{L}\p{N}_-]/gu, "_")
        .slice(0, 52) || "Block";
    if (!validBlockName(name)) warn(`Blocknamn ${name} ändrades till ${safe}`);
    if ([...definitions.values()].some((d) => d.name === safe))
      safe += "_" + definitions.size;
    const def = {
      id: uid(),
      name: safe,
      entities: entities.map((e) => {
        const n = transform(e, (p) => sub(p, base));
        delete n.space;
        return n;
      }),
    };
    building.delete(name);
    if (!def.entities.length) throw Error(`Block ${name} saknar stödda objekt`);
    const tags = def.entities
      .filter((e) => e.attributeTag)
      .map((e) => e.attributeTag);
    if (new Set(tags).size !== tags.length)
      throw Error("Dubblerade attributnamn i blocket");
    definitions.set(name, def);
    return def;
  }
  function convert(r, inBlock) {
    const type = get(r, 0);
    if (["SEQEND", "VERTEX"].includes(type)) return null;
    const common = {
      id: uid(),
      ...annotations(r),
      layer: layer(get(r, 8, "0")),
      color: color(r),
      cadColor7: get(r, 420) === "" && Math.abs(num(r, 62, 256)) === 7,
      colorByBlock: get(r, 420) === "" && num(r, 62, 256) === 0,
      lineTypeByBlock: get(r, 6).toUpperCase() === "BYBLOCK",
      ...(inBlock ? { inheritLayer: get(r, 8, "0") === "0" } : {}),
      lineType: lt(r),
      ...nativeLine(r),
      ...(num(r, 370, -1) >= 0 ? { lineWeight: num(r, 370) / 100 } : {}),
      space: inBlock
        ? "model"
        : get(r, 410)
          ? space(get(r, 410))
          : ownerSpace.get(get(r, 330)) ||
            (num(r, 67) ? space("Layout 1") : "model"),
    };
    if (type === "MULTILEADER" || type === "MLEADER") {
      warn("MULTILEADER importerades som redigerbara hänvisningar och separat text");
      return mleaderParts(r, text => ({ ...convert(text, inBlock), layer: common.layer, space: common.space, color: common.color }), common).map(e => ({ ...e, id: uid() }));
    }
    if (Math.abs(num(r, 210)) > 1e-8 || Math.abs(num(r, 220)) > 1e-8 || Math.abs(Math.abs(num(r, 230, 1)) - 1) > 1e-8)
      throw Error("Annan objektplan än XY stöds inte");
    if (
      r.some(
        ([c, v]) =>
          [30, 31, 32, 33, 34, 35, 38, 39].includes(c) && Number(v) !== 0,
      )
    )
      throw Error("3D/elevation/tjocklek stöds inte");
    if (num(r, 60)) common.hidden = true;

    if (type === "LINE")
      return { ...common, type: "line", points: [pt(r), pt(r, 11)] };
    if (type === "CIRCLE" || type === "ARC") {
      const start = rad(num(r, 50)),
        end = rad(num(r, 51));
      return {
        ...common,
        type: type.toLowerCase(),
        center: pt(r),
        radius: num(r, 40),
        ...(type === "ARC"
          ? {
              start,
              sweep:
                (((end - start) % (2 * Math.PI)) + 2 * Math.PI) %
                  (2 * Math.PI) || 2 * Math.PI,
            }
          : {}),
      };
    }
    if (type === "ELLIPSE") {
      warn("Ellips approximerades med polyline (tolerans 0,001 ritningsenhet)");
      const start = num(r, 41), end = num(r, 42, Math.PI * 2);
      return { ...common, type: "polyline", points: ellipsePoints(pt(r), pt(r, 11), num(r, 40), start, end, num(r, 230, 1) < 0 ? -1 : 1), closed: Math.abs(end - start - Math.PI * 2) < 1e-8 };
    }
    if (type === "SPLINE") {
      warn("Spline approximerades med polyline (tolerans 0,001 ritningsenhet)");
      return { ...common, type: "polyline", points: splinePoints(vertices(r), all(r, 40).map(Number), num(r, 71), all(r, 41).map(Number)), closed: !!(num(r, 70) & 1) };
    }
    if (type === "SOLID" || type === "TRACE") {
      const points = [pt(r), pt(r, 11), pt(r, 13), pt(r, 12)];
      if (points[2].x === points[3].x && points[2].y === points[3].y) points.splice(2, 1);
      return { ...common, type: "hatch", points, solid: true, spacing: 10 };
    }
    if (type === "LWPOLYLINE" || type === "POLYLINE") {
      if (type === "POLYLINE" && (num(r, 70) & 64)) {
        const vertices = r.children.filter(v => num(v, 70) & 64);
        if (vertices.some(v => Math.abs(num(v, 30)) > 1e-8)) throw Error("3D-mesh stöds inte");
        const result = [];
        for (const face of r.children.filter(v => !(num(v, 70) & 64))) {
          const indices = [71, 72, 73, 74].map(c => num(face, c)).filter(Boolean);
          if (indices.length < 3 || indices.some(i => !vertices[Math.abs(i) - 1])) throw Error("Ogiltiga mesh-index");
          for (let i = 0; i < indices.length; i++) if (indices[i] > 0) result.push({ ...common, id: uid(), type: "line", points: [pt(vertices[indices[i] - 1]), pt(vertices[Math.abs(indices[(i + 1) % indices.length]) - 1])] });
        }
        warn("Planar polyface-mesh importerades som synliga kanter");
        return result;
      }
      if (type === "POLYLINE" && num(r, 70) & (8 | 16))
        throw Error("3D-polyline/mesh stöds inte");
      if (type === "POLYLINE" && r.children.some((v) => num(v, 30) !== 0))
        throw Error("3D-vertex stöds inte");
      const vs = vertices(type === "POLYLINE" ? r.children.flat() : r);
      if (r.some(([c, v]) => [40, 41, 43].includes(c) && Number(v) !== 0))
        warn("Polylinebredd saknas i appen");
      return {
        ...common,
        type: "polyline",
        points: vs.map(({ x, y }) => ({ x, y })),
        bulges: vs.map((v) => v.bulge),
        closed: !!(num(r, 70) & 1),
      };
    }
    if (["TEXT", "MTEXT", "ATTDEF", "ATTRIB"].includes(type)) {
      const style = textStyle(r);
      const raw = type === "MTEXT" ? all(r, 3).join("") + get(r, 1) : get(r, 1);
      let value = type === "MTEXT" ? raw.replace(/%%d/gi, "°").replace(/%%p/gi, "±").replace(/%%c/gi, "Ø") : unicode(raw);
      const e = { ...common, ...style, type: "text", text: value, point: pt(r), height: num(r, 40, 2.5), rotation: rad(num(r, 50)) };
      if (type === "MTEXT") {
        e.rotation = num(r, 50);
        const directionIndex = r.findIndex(([c]) => c === 11), rotationIndex = r.findIndex(([c]) => c === 50);
        if (directionIndex > rotationIndex) e.rotation = Math.atan2(num(r, 21), num(r, 11));
        const parsed = parseMtext(value, { ...style, height: e.height });
        e.text = parsed.text;
        e.textRuns = parsed.runs.map(run => ({ ...run, ...(run.colorIndex === 7 ? { color: "#ffffff", cadColor7: true } : run.colorIndex != null && aciColors[run.colorIndex] ? { color: aciColors[run.colorIndex] } : {}) }));
        if (parsed.simplified) warn("Avancerad MTEXT-formatering (t.ex. staplade bråk eller stycken) förenklades");
        e.textAttachment = num(r, 71, 1);
        e.textWidth = Math.max(0, num(r, 41));
        e.lineSpacing = num(r, 44, 1) * 5 / 3;
        e.lineSpacingStyle = num(r, 73, 1);
        const columns = readTextColumns(r);
        if (columns) e.textColumns = columns;
        else if (num(r,75)>0 || r.some(p=>p[0]===101 && p[1]==='Embedded Object')) warn("MTEXT-kolumner saknar läsbar bredd eller antal; texten bevarades i en kolumn");
      } else {
        e.widthFactor = num(r, 41, style.widthFactor);
        e.oblique = rad(num(r, 51, style.oblique * 180 / Math.PI));
        const h = num(r, 72), v = num(r, type === "TEXT" ? 73 : 74);
        e.textAlign = ["left", "center", "right"][h] || (h === 4 ? "center" : "left");
        e.textVertical = ["baseline", "bottom", "middle", "top"][v] || "baseline";
        if (h === 4) e.textVertical = "middle";
        if ((h || v) && get(r, 11) !== "" && ![3, 5].includes(h)) e.point = pt(r, 11);
        if ([3, 5].includes(h) && get(r, 11) !== "") {
          const end = pt(r, 11); e.textFitWidth = Math.hypot(end.x - e.point.x, end.y - e.point.y);
          e.rotation = Math.atan2(end.y - e.point.y, end.x - e.point.x);
          if (h === 3) warn("TEXT Aligned: bredd bevarad; texthöjden kan avvika");
        }
        e.textMirrorX = !!(num(r, 71) & 2); e.textMirrorY = !!(num(r, 71) & 4);
      }
      if (type === "ATTDEF" || type === "ATTRIB") {
        const tag = unicode(get(r, 2)).toUpperCase();
        if (!validTag(tag)) throw Error("Attributnamnet stöds inte");
        if (!(num(r, 70) & 2)) e.attributeTag = tag;
        if (num(r, 70) & 1) e.hidden = true;
      }
      return annotations.textVariants(r,e);
    }
    if (type === "INSERT") {

      if (num(r, 70, 1) > 1 || num(r, 71, 1) > 1)
        throw Error("Blockmatriser stöds inte");
      const sx = num(r, 41, 1),
        sy = num(r, 42, 1);
      if (!sx || !sy) throw Error("Blockets skala är noll");
      const external = blocks.get(get(r,2));
      if (external && (num(external.header,70) & 12)) {
        if (inBlock) { warn(`Nästlad extern referens ${get(r,2)} behöver länkas i källritningen`); return null; }
        if (Math.abs(Math.abs(sy)-Math.abs(sx))>1e-8) throw Error('Olikformigt skalad extern referens stöds inte');
        const path=unicode(get(external.header,1)), blockName=unicode(get(r,2));
        const reference={id:uid(),name:path.split(/[\\/]/).at(-1)||blockName,path,kind:num(external.header,70)&8?'overlay':'attach',point:pt(r),scale:Math.abs(sx),rotation:rad(num(r,50))+(sx<0?Math.PI:0),mirrored:sx*sy<0,fade:60,snap:true,visible:!common.hidden,loaded:true,geometry:[],space:common.space,layer:common.layer};
        if(num(r,230,1)<0){reference.point.x=-reference.point.x;reference.rotation=Math.PI-reference.rotation;reference.mirrored=!reference.mirrored;}
        doc.references.push(reference);
        warn(`Extern referens ${blockName} (${path}) sparades som länk; välj Byt fil i Referenser för att läsa in den`);
        return null;
      }
      const def = definition(get(r, 2));
      if (Math.abs(Math.abs(sy) - Math.abs(sx)) > 1e-8) {
        warn("Olikformigt skalat block förenklades till redigerbar geometri");
        const annotationFallback=!!common.annotationContexts || def.entities.some(e=>e.annotationContexts?.length);
        if(annotationFallback)warn("Olikformigt skalat annotativt block: grundgeometrin bevarades utan skalvarianter");
        const geometry = def.entities.filter(e => !e.attributeTag).flatMap(e => e.type==='dimension'?dimensionParts(e):e.type === "polyline" && e.bulges?.some(Boolean) ? polylineParts(e) : [e]).map(e => ({ ...affineEntity(e, sx, sy, rad(num(r, 50)), pt(r)), id: uid(), space: common.space }));
        for (const a of r.attributes || []) { const e = convert(a, inBlock); delete e.attributeTag; geometry.push(e); }
        if(annotationFallback)for(const part of geometry){delete part.annotationContexts;delete part.annotationBase;part.annotative=true;}
        return geometry;
      }
      const attributeOverrides = {};
      const values = Object.fromEntries(
        def.entities
          .filter((e) => e.attributeTag)
          .map((e) => [e.attributeTag, e.text]),
      );
      for (const a of r.attributes || []) {
        const tag = unicode(get(a, 2)).toUpperCase();
        if (Object.hasOwn(values, tag)) {
          values[tag] = unicode(get(a, 1));
          const angle = rad(num(r, 50)) + (sx < 0 ? Math.PI : 0), insertion = pt(r), flip = sx * sy < 0 ? -1 : 1, k = Math.abs(sx);
          const attribute = convert(a, inBlock);
          attributeOverrides[tag] = transform(attribute, p => {
            const x = p.x - insertion.x, y = p.y - insertion.y;
            return { x: (x * Math.cos(angle) + y * Math.sin(angle)) / k, y: flip * (-x * Math.sin(angle) + y * Math.cos(angle)) / k };
          }, { scale: 1 / k, rotation: flip < 0 ? angle : -angle, mirror: flip < 0 });
          delete attributeOverrides[tag].space;
        }
        else warn("Attribut utan motsvarande definition utelämnades");
      }
      const instance = {
        ...common,
        type: "block",
        point: pt(r),
        scale: Math.abs(sx),
        mirrored: sx * sy < 0,
        rotation: rad(num(r, 50)) + (sx < 0 ? Math.PI : 0),
        definition: def,
        values,
        attributeOverrides,
      };
      if (inBlock) {
        warn("Nästlat block förenklades till geometri; attribut blev text");
        return blockParts(instance).map(part => {
          if(instance.annotationContexts){part.annotative=true;part.annotationContexts=structuredClone(instance.annotationContexts);part.annotationBase=structuredClone(instance.annotationBase);}
          part.id = uid(); delete part.attributeTag; delete part.attributeSchema; return part;
        });
      }
      return instance;
    }
    if (type === "DIMENSION") {
      const kind = num(r, 70) & 7,
        style = new Map(styles.get(get(r, 3)) || []);
      // ACAD/DSTYLE XData pairs override the named style for this dimension.
      let application='',override=-1;
      for(let i=0;i<r.length;i++){if(r[i][0]===1001)application=r[i][1];if(application==='ACAD' && r[i][0]===1000 && r[i][1]==='DSTYLE'){override=i;break;}}
      if(override>=0)for(let i=override+1;i<r.length;i++){
        if(r[i][0]===1002 && r[i][1]==='}')break;
        if(r[i][0]===1070 && r[i+1] && [1040,1070,1000,1005].includes(r[i+1][0])){style.set(Number(r[i][1]),r[++i][1]);}
      }
      const styleValue=(code,fallback)=>Number(style.get(code)??fallback), scale=styleValue(40,1)||1;
      const height=styleValue(140,2.5)*scale;
      const e = {
        ...common,
        type: "dimension",
        height,
        ...textStyle([[7,style.get(340)||'STANDARD']]),
        precision: Math.max(0,Math.min(6,styleValue(271,0))),
        arrowSize:styleValue(41,2.5)*scale,extensionOffset:styleValue(42,0.625)*scale,
        extensionOvershoot:styleValue(44,1.25)*scale,textGap:styleValue(147,0.625)*scale,
        measurementScale:styleValue(144,1),dimensionPost:style.get(3)||'<>',
        decimalSeparator:String.fromCharCode(styleValue(278,46)),zeroSuppress:styleValue(78,0),
        ...(num(r,70)&128 && get(r,11)!=='' ? {dimensionTextPoint:pt(r,11)} : {}),
        text: get(r, 1) === "<>" ? "" : get(r, 1),
      };
      const finish=dimension=>{
        const name=get(r,2), block=blocks.get(name);
        if(block)try{
          const def=definition(name),base=pt(block.header);
          const graphics=def.entities.flatMap(part=>part.type==='block'?blockParts(part):[part]).map(part=>({...transform(part,p=>add(p,base)),id:uid(),space:common.space}));
          if(graphics.length && graphics.every(p=>!['block','dimension','viewport'].includes(p.type))){dimension.dimensionGraphics=graphics;dimension.dimensionGraphicsState=dimensionGraphicsState(dimension);}
        }catch{warn('Måttblock kunde inte läsas; måttet återskapades från mätpunkter och måttstil');}
        if(!dimension.dimensionGraphics)warn('Mått återskapades från mätpunkter och måttstil; avancerad placering/pilform kan avvika');
        return annotations.dimensionVariants(r,dimension,name=>{
          const block=blocks.get(name);if(!block)return null;
          try{const def=definition(name),base=pt(block.header);return def.entities.flatMap(part=>part.type==='block'?blockParts(part):[part]).filter(part=>!['dimension','viewport'].includes(part.type)).map(part=>({...transform(part,p=>add(p,base)),id:uid(),space:common.space}));}catch{return null;}
        },dimensionGraphicsState);
      };
      if (kind === 0 || kind === 1)
        return finish({
          ...e,
          kind: kind === 0 ? "linear" : "aligned",
          points: [pt(r, 13), pt(r, 14), pt(r)],
          axis: { x: Math.cos(rad(num(r, 50))), y: Math.sin(rad(num(r, 50))) },
        });
      if (kind === 4 || kind === 3) {
        const a = pt(r),
          b = pt(r, 15),
          center = kind === 3 ? mul(add(a, b), 0.5) : a;
        return finish({
          ...e,
          kind: kind === 3 ? "diameter" : "radius",
          points: [center, b, pt(r, 11)],
        });
      }
      if (kind === 5)
        return finish({
          ...e,
          kind: "angular",
          points: [pt(r, 15), pt(r, 13), pt(r, 14), pt(r)],
        });
      if (get(r, 2) && blocks.has(get(r, 2))) {
        const name = get(r, 2), def = definition(name), base = pt(blocks.get(name).header);
        warn("Denna måttyp importerades som redigerbar geometri från sitt måttblock");
        return def.entities.map(part => ({ ...transform(part, p => add(p, base)), id: uid(), space: common.space }));
      }
      throw Error("Denna måttyp stöds inte och saknar måttblock");
    }
    if (type === "LEADER") {
      if (num(r, 72)) throw Error("Splineleader stöds inte");
      warn("Leader importerades utan koppling till sin text");
      return {
        ...common,
        type: "leader",
        points: vertices(r).map(({ x, y }) => ({ x, y })),
        text: "",
        height: 2.5,
      };
    }
    if (type === "HATCH") {
      const loops = hatchLoops(r);
      const pattern = num(r,70) ? null : readHatchPattern(r);
      if (!num(r,70) && !pattern) warn("Hatch saknar linjedefinition; parallella reservlinjer användes");
      const angle=pattern?.[0]?.angle ?? rad(num(r,52,45));
      const offset=pattern?.[0]?.offset;
      const spacing=offset ? Math.abs(-Math.sin(angle)*offset.x+Math.cos(angle)*offset.y) : 10;
      if(num(r,75)) warn("Hatch med alternativ ö-hantering visas med jämn/udda fyllning");
      return { ...common, type: "hatch", points: loops[0], holes: loops.slice(1), solid: !!num(r, 70), spacing: spacing || 10, patternAngle: angle, ...(pattern ? {hatchPattern:pattern,patternName:get(r,2)} : {}) };
    }
    if (type === "VIEWPORT") {
      if (num(r, 69) === 1) return null;
      if (common.space === "model") throw Error("Viewport utan layout");
      if (
        Math.abs(num(r, 16)) > 1e-8 ||
        Math.abs(num(r, 26)) > 1e-8 ||
        Math.abs(num(r, 36, 1) - 1) > 1e-8 ||
        (num(r, 90) & 1) ||
        get(r, 340)
      )
        throw Error("3D-, perspektiv- eller klippt viewport stöds inte");
      const p = pt(r), w = num(r, 40), h = num(r, 41), rotation = -rad(num(r, 51)), center = pt(r, 12), target = pt(r, 17);
      const viewCenter = { x: target.x + Math.cos(rotation) * center.x - Math.sin(rotation) * center.y, y: target.y + Math.sin(rotation) * center.x + Math.cos(rotation) * center.y };
      return {
        ...common,
        type: "viewport",
        points: [
          { x: p.x - w / 2, y: p.y - h / 2 },
          { x: p.x + w / 2, y: p.y + h / 2 },
        ],
        viewCenter,
        viewRotation: rotation,
        viewScale: h / num(r, 45),
        locked: !!(num(r, 90) & 16384),
      };
    }
    throw Error("Objekttypen stöds inte");
  }
  function read(records, inBlock = false) {
    const result = [];
    for (let i = 0; i < records.length; i++) {
      const r = records[i],
        type = get(r, 0);
      if (type === "POLYLINE") {
        r.children = [];
        while (get(records[i + 1] || [], 0) === "VERTEX")
          r.children.push(records[++i]);
      }
      if (type === "INSERT") {
        r.attributes = [];
        while (get(records[i + 1] || [], 0) === "ATTRIB")
          r.attributes.push(records[++i]);
      }
      try {
        let e = convert(r, inBlock);
        if (e && num(r, 230, 1) < 0 && ["INSERT", "TEXT", "ATTDEF", "ATTRIB", "CIRCLE", "ARC", "LWPOLYLINE", "POLYLINE", "HATCH", "SOLID", "TRACE"].includes(type)) {
          const flip = entity => transform(entity, p => ({ x: -p.x, y: p.y }), { mirror: true, rotation: Math.PI });
          e = Array.isArray(e) ? e.map(flip) : flip(e);
        }
        if (e) {
          const entities = Array.isArray(e) ? e : [e];
          for(const entity of entities)if(entity.annotationLayerNames){
            const remap=(part,space=entity.space)=>{if(part.layer)part.layer=layer(part.layer);if(part.space)part.space=space;if(part.definition)part.definition.entities.forEach(p=>remap(p,"model"));if(part.dimensionGraphics)part.dimensionGraphics.forEach(p=>remap(p,space));if(part.attributeOverrides)Object.values(part.attributeOverrides).forEach(p=>remap(p,"model"));};
            entity.annotationVariants?.forEach(v=>remap(v.entity));delete entity.annotationLayerNames;
          }
          if (!validDocument({ ...doc, blocks: [], entities }))
            throw Error("Ogiltig geometri eller egenskaper");
          result.push(...entities);
        }
      } catch (error) {
        warn(`${type}: ${error.message}`);
      }
    }
    return result;
  }
  doc.entities = read(sections.get("ENTITIES"));
  const handles = new Set(
    sections
      .get("ENTITIES")
      .map((r) => get(r, 5))
      .filter(Boolean),
  );
  for (const [name, b] of blocks)
    if (name.toLowerCase().startsWith("*paper_space")) {
      const target = ownerSpace.get(get(b.header, 330)) || space("Layout 1");
      const records = b.records
        .filter((r) => !get(r, 5) || !handles.has(get(r, 5)))
        .map((r) => [
          ...r,
          [410, doc.layouts.find((l) => l.id === target)?.name || "Layout 1"],
        ]);
      doc.entities.push(...read(records));
    }
  doc.blocks = [...definitions.values()];
  doc.entities = doc.entities.map(e => {
    const paper = paperTransforms.get(e.space);
    if (!paper || (Math.abs(paper.scale - 1) < 1e-10 && !paper.x && !paper.y)) return e;
    const n = transform(e, p => ({ x: p.x * paper.scale + paper.x, y: p.y * paper.scale + paper.y }), { scale: paper.scale });
    if (e.type === "viewport") n.viewScale = e.viewScale * paper.scale;
    return n;
  });
  const modelBounds = doc.entities.filter(e => (e.space || "model") === "model" && !e.hidden && doc.layers.find(l => l.id === e.layer)?.visible !== false).map(bounds);
  for (const e of doc.entities.filter(e => e.type === "viewport")) {
    const c = Math.cos(e.viewRotation || 0), s = Math.sin(e.viewRotation || 0);
    const halfWidth = Math.abs(e.points[1].x - e.points[0].x) / (2 * e.viewScale), halfHeight = Math.abs(e.points[1].y - e.points[0].y) / (2 * e.viewScale);
    const overlaps = modelBounds.some(b => {
      const corners = [[b.minX, b.minY], [b.maxX, b.minY], [b.maxX, b.maxY], [b.minX, b.maxY]].map(([x, y]) => ({ x: c * (x - e.viewCenter.x) + s * (y - e.viewCenter.y), y: -s * (x - e.viewCenter.x) + c * (y - e.viewCenter.y) }));
      return Math.min(...corners.map(p => p.x)) <= halfWidth && Math.max(...corners.map(p => p.x)) >= -halfWidth && Math.min(...corners.map(p => p.y)) <= halfHeight && Math.max(...corners.map(p => p.y)) >= -halfHeight;
    });
    if (!overlaps) warn(`Layout ${doc.layouts.find(l => l.id === e.space)?.name || ""}: viewportens sparade vy ligger utanför tillgänglig synlig modellgeometri; kontrollera originalritningens vy och externa referenser`);
  }
  const header = (sections.get("HEADER") || []).flat();
  const baseIndex=header.findIndex(([c,v])=>c===9 && v==='$INSBASE');
  if(baseIndex>=0){const values=[];for(let i=baseIndex+1;i<header.length && header[i][0]!==9;i++)values.push(header[i]);doc.insertionBase=pt(values);}
  for(const r of doc.references){const paper=paperTransforms.get(r.space);if(paper){r.point={x:r.point.x*paper.scale+paper.x,y:r.point.y*paper.scale+paper.y};r.scale*=paper.scale;}}
  const unitsIndex = header.findIndex(([c, v]) => c === 9 && v === "$INSUNITS");
  const units = unitsIndex < 0 ? 0 : Number(header[unitsIndex + 1]?.[1]);
  if (units !== 4)
    warn(
      `Ritningsenhet ${units || "ej angiven"}: koordinater behölls utan omräkning; appen visar mm`,
    );
  if (!validDocument(doc))
    throw Error("DXF-innehållet kunde inte omvandlas till en giltig ritning.");
  if (!doc.entities.length && !doc.references.length)
    throw Error(
      "Inga stödda objekt hittades. " +
        [...issues.keys()].slice(0, 6).join(" · "),
    );
  return {
    document: doc,
    report: [...issues].map(([message, count]) => ({ message, count })),
    count: doc.entities.length,
  };
}
