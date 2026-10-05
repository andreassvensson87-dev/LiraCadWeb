import { aciColors } from "./dxf-colors.js";
import { uid } from "./values.js";
import { validDocument } from "./document.js";
import { transform } from "./entity-transform.js";
import { sub, add, mul } from "./geometry.js";
import { blockParts, validBlockName, validTag } from "./blocks.js";
import { lineTypes, validLineType } from "./linetypes.js";
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
  const doc = {
    version: 1,
    name: name.replace(/\.dxf$/i, ""),
    layers: [],
    entities: [],
    layouts: [],
    blocks: [],
  };
  const tables = sections.get("TABLES") || [],
    objects = sections.get("OBJECTS") || [];
  const color = (r) => {
    if (get(r, 420) !== "")
      return "#" + num(r, 420).toString(16).padStart(6, "0").slice(-6);
    const index = Math.abs(num(r, 62, 256));
    if (index === 256) return undefined;
    if (index === 0) {
      warn("Färg BYBLOCK tolkades som Enligt lager");
      return undefined;
    }
    if (index === 7) return "#ffffff";
    if (aciColors[index]) return aciColors[index];
    warn("Ogiltig ACI-färg ersattes med grått");
    return "#c0c0c0";
  };
  const lt = (r) => {
    const value = get(r, 6, "BYLAYER").toUpperCase();
    if (validLineType(value)) return value;
    warn(`Linjetyp ${value} ersattes med Enligt lager`);
    return "BYLAYER";
  };
  for (const r of tables.filter((r) => get(r, 0) === "LTYPE")) {
    const name = get(r, 2).toUpperCase(),
      known = lineTypes.find(([id]) => id === name);
    if (
      known &&
      JSON.stringify(all(r, 49).map(Number)) !== JSON.stringify(known[2])
    )
      warn(`Linjemönster ${name} ersattes med appens standardmönster`);
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
      lineType: lt(r) === "BYLAYER" ? "CONTINUOUS" : lt(r),
    });
  }
  if (!doc.layers.length) layer("0");
  const spaceMap = new Map(),
    ownerSpace = new Map();
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
    if (["SEQEND", "VERTEX", "ATTRIB"].includes(type)) return null;
    if (num(r, 210) !== 0 || num(r, 220) !== 0 || num(r, 230, 1) !== 1)
      throw Error("Annan objektplan än XY stöds inte");
    if (
      r.some(
        ([c, v]) =>
          [30, 31, 32, 33, 34, 35, 38, 39].includes(c) && Number(v) !== 0,
      )
    )
      throw Error("3D/elevation/tjocklek stöds inte");
    const common = {
      id: uid(),
      layer: layer(get(r, 8, "0")),
      color: color(r),
      lineType: lt(r),
      space: inBlock
        ? "model"
        : get(r, 410)
          ? space(get(r, 410))
          : ownerSpace.get(get(r, 330)) ||
            (num(r, 67) ? space("Layout 1") : "model"),
    };
    if (num(r, 60)) warn("Osynligt objekt importerades synligt");
    if (num(r,48,1)!==1) warn("Objektets linjetypsskala stöds inte");
    if (num(r,370,-1)>=0) warn("Objektets linjevikt stöds inte");
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
    if (type === "LWPOLYLINE" || type === "POLYLINE") {
      if (type === "POLYLINE" && num(r, 70) & (8 | 16 | 64))
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
    if (["TEXT", "MTEXT", "ATTDEF"].includes(type)) {
      let value = unicode(
        type === "MTEXT" ? all(r, 3).join("") + get(r, 1) : get(r, 1),
      );
      let rotation = rad(num(r, 50)),
        point = pt(r),
        height = num(r, 40, 2.5);
      if (type === "MTEXT") {
        rotation = num(r, 50);
        if (get(r, 11) !== "") rotation = Math.atan2(num(r, 21), num(r, 11));
        if (/\\[A-OQ-TV-Za-oq-tv-z]/.test(value) || /[{}]/.test(value))
          warn("MTEXT-formattering förenklades");
        value = value
          .replace(/\\P/g, "\n")
          .replace(/\\~/g, " ")
          .replace(/\\[A-Za-z][^;]*;/g, "")
          .replace(/\\[LlOoKk]/g, "")
          .replace(/[{}]/g, "")
          .replace(/\\\\/g, "\\");
        point = {
          x: point.x + Math.sin(rotation) * height,
          y: point.y - Math.cos(rotation) * height,
        };
        if (num(r, 71, 1) !== 1 || num(r, 41) > 0)
          warn("MTEXT-justering eller radbrytning kan avvika");
      } else if (num(r, 72) || num(r, 73) || num(r, 74))
        warn("Textjustering förenklades till vänster baslinje");
      if (get(r, 7, "STANDARD") !== "STANDARD")
        warn("Textstil ersattes med Arial");
      if (num(r, 51) || (num(r, 41, 1) !== 1 && type !== "MTEXT"))
        warn("Textens breddfaktor eller lutning förenklades");
      const e = {
        ...common,
        type: "text",
        text: value,
        point,
        height,
        rotation,
        font: "Arial",
      };
      if (type === "ATTDEF") {
        const tag = get(r, 2).toUpperCase();
        if (!validTag(tag)) throw Error("Attributnamnet stöds inte");
        if (!(num(r, 70) & 2)) e.attributeTag = tag;
        if (num(r, 70) & 1)
          warn("Osynlig attributdefinition importerades synligt");
      }
      return e;
    }
    if (type === "INSERT") {

      if (num(r, 70, 1) > 1 || num(r, 71, 1) > 1)
        throw Error("Blockmatriser stöds inte");
      const sx = num(r, 41, 1),
        sy = num(r, 42, 1);
      if (sx <= 0 || Math.abs(Math.abs(sy) - sx) > 1e-8)
        throw Error("Olikformig eller negativ X-skala på block stöds inte");
      const def = definition(get(r, 2));
      const values = Object.fromEntries(
        def.entities
          .filter((e) => e.attributeTag)
          .map((e) => [e.attributeTag, e.text]),
      );
      for (const a of r.attributes || []) {
        const tag = get(a, 2).toUpperCase();
        if (Object.hasOwn(values, tag)) values[tag] = unicode(get(a, 1));
        else warn("Attribut utan motsvarande definition utelämnades");
      }
      const instance = {
        ...common,
        type: "block",
        point: pt(r),
        scale: sx,
        mirrored: sy < 0,
        rotation: rad(num(r, 50)),
        definition: def,
        values,
      };
      if (inBlock) {
        warn("Nästlat block förenklades till geometri; attribut blev text");
        return blockParts(instance).map(part => {
          part.id = uid(); delete part.attributeTag; delete part.attributeSchema; return part;
        });
      }
      return instance;
    }
    if (type === "DIMENSION") {
      warn(
        "Mått återskapades med appens måttstil; utseende och textplacering kan avvika",
      );
      const kind = num(r, 70) & 7,
        style = styles.get(get(r, 3)) || [],
        height = num(style, 140, 2.5) * num(style, 40, 1);
      const e = {
        ...common,
        type: "dimension",
        height,
        precision: num(style, 271, 0),
        text: get(r, 1) === "<>" ? "" : get(r, 1),
      };
      if (kind === 0 || kind === 1)
        return {
          ...e,
          kind: kind === 0 ? "linear" : "aligned",
          points: [pt(r, 13), pt(r, 14), pt(r)],
          axis: { x: Math.cos(rad(num(r, 50))), y: Math.sin(rad(num(r, 50))) },
        };
      if (kind === 4 || kind === 3) {
        const a = pt(r),
          b = pt(r, 15),
          center = kind === 3 ? mul(add(a, b), 0.5) : a;
        return {
          ...e,
          kind: kind === 3 ? "diameter" : "radius",
          points: [center, b, pt(r, 11)],
        };
      }
      if (kind === 5)
        return {
          ...e,
          kind: "angular",
          points: [pt(r, 15), pt(r, 13), pt(r, 14), pt(r)],
        };
      throw Error("Denna måttyp stöds inte");
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
      if (num(r, 91) !== 1 || !(num(r, 92) & 2) || num(r, 72))
        throw Error("Hatch med hål eller kurvade gränser stöds inte");
      if (num(r, 70)) throw Error("Solid hatch stöds inte");
      const start = r.findIndex(([c]) => c === 93),
        end = r.findIndex(([c], i) => i > start && c === 97);
      const boundary = r.slice(start + 1, end < 0 ? undefined : end);
      warn("Hatchmönstret förenklades till parallella linjer");
      return {
        ...common,
        type: "hatch",
        points: vertices(boundary).map(({ x, y }) => ({ x, y })),
        spacing: Math.hypot(num(r, 45), num(r, 46)) || 10,
        patternAngle: rad(num(r, 53, num(r, 52, 45))),
      };
    }
    if (type === "VIEWPORT") {
      if (num(r, 69) === 1) return null;
      if (common.space === "model") throw Error("Viewport utan layout");
      if (
        num(r, 51) ||
        num(r, 16) ||
        num(r, 26) ||
        num(r, 36, 1) !== 1 ||
        get(r, 340)
      )
        throw Error("Roterad, 3D- eller klippt viewport stöds inte");
      const p = pt(r),
        w = num(r, 40),
        h = num(r, 41);
      return {
        ...common,
        type: "viewport",
        points: [
          { x: p.x - w / 2, y: p.y - h / 2 },
          { x: p.x + w / 2, y: p.y + h / 2 },
        ],
        viewCenter: pt(r, 12),
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
        const e = convert(r, inBlock);
        if (e) {
          const entities = Array.isArray(e) ? e : [e];
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
  const header = (sections.get("HEADER") || []).flat();
  const unitsIndex = header.findIndex(([c, v]) => c === 9 && v === "$INSUNITS");
  const units = unitsIndex < 0 ? 0 : Number(header[unitsIndex + 1]?.[1]);
  if (units !== 4)
    warn(
      `Ritningsenhet ${units || "ej angiven"}: koordinater behölls utan omräkning; appen visar mm`,
    );
  if (!validDocument(doc))
    throw Error("DXF-innehållet kunde inte omvandlas till en giltig ritning.");
  if (!doc.entities.length)
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
