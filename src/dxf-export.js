import { add, mod } from "./geometry.js";
import { lineTypes } from "./linetypes.js";
import {
  splitDimension,
  writeDimension,
  dimensionStyles,
} from "./dxf-dimensions.js";
import { dimensionParts } from "./dimensions.js";
import { blockParts } from "./blocks.js";
import { dxfLayouts } from "./dxf-layout.js";
import { needsMtext, mtextContent, textChunks } from "./text.js";

export function toDXF(doc) {
  const customBlocks = [],
    definitions = new Map(),
    usedBlockNames = new Set(),
    styles = [];
  const prepare = (entities) =>
    entities.flatMap((e) => {
      if (e.type === "dimension")
        return splitDimension(e).map((dim) => {
          const blockName = `*D${customBlocks.length + 1}`;
          customBlocks.push({
            blockName,
            flags: 1,
            entities: dimensionParts(dim),
          });
          let style = styles.find(
            (s) =>
              s.height === dim.height && s.precision === (dim.precision || 0),
          );
          if (!style) {
            style = {
              name: `LIRA_DIM_${styles.length + 1}`,
              height: dim.height,
              precision: dim.precision || 0,
            };
            styles.push(style);
          }
          return { ...dim, _dimBlock: blockName, _dimStyle: style.name };
        });
      if (e.type === "block") {
        const key = JSON.stringify(e.definition);
        if (!definitions.has(key)) {
          let blockName = e.definition.name;
          if (usedBlockNames.has(blockName.toLowerCase()))
            blockName += "_" + (definitions.size + 1);
          usedBlockNames.add(blockName.toLowerCase());
          definitions.set(key, blockName);
          customBlocks.push({
            blockName,
            flags: e.definition.entities.some((p) => p.attributeTag) ? 2 : 0,
            entities: prepare(e.definition.entities),
          });
        }
        return [{ ...e, _blockName: definitions.get(key) }];
      }
      return [e];
    });
  doc = { ...doc, entities: prepare(doc.entities) };
  prepare(
    (doc.blocks || []).map((definition) => ({ type: "block", definition })),
  );
  let out = [],
    sink = out;
  const extraBlocks = new Map();
  const pair = (c, v) => sink.push(String(c), String(v));
  const layouts = dxfLayouts(doc, pair, customBlocks);
  const point = (p, x = 10, y = 20) => {
    pair(x, p.x);
    pair(y, p.y);
  };
  const str = (s) => String(s).replace(/[\r\n]/g, " ");
  pair(0, "SECTION");
  pair(2, "HEADER");
  pair(9, "$ACADVER");
  pair(1, "AC1021");
  pair(9, "$INSUNITS");
  pair(70, 4);
  pair(0, "ENDSEC");
  pair(0, "SECTION");
  pair(2, "TABLES");
  const lineTable = layouts.handle();
  pair(0, "TABLE");
  pair(2, "LTYPE");
  pair(5, lineTable);
  pair(330, "0");
  pair(100, "AcDbSymbolTable");
  pair(70, lineTypes.length + 2);
  for (const [id, label, pattern] of [
    ["BYLAYER", "ByLayer", []],
    ["BYBLOCK", "ByBlock", []],
    ...lineTypes,
  ]) {
    pair(0, "LTYPE");
    pair(5, layouts.handle());
    pair(330, lineTable);
    pair(100, "AcDbSymbolTableRecord");
    pair(100, "AcDbLinetypeTableRecord");
    pair(2, id);
    pair(70, 0);
    pair(3, label);
    pair(72, 65);
    pair(73, pattern.length);
    pair(
      40,
      pattern.reduce((sum, v) => sum + Math.abs(v), 0),
    );
    for (const value of pattern) {
      pair(49, value);
      pair(74, 0);
    }
  }
  pair(0, "ENDTAB");
  pair(0, "TABLE");
  pair(2, "LAYER");
  pair(5, "10");
  pair(330, "0");
  pair(100, "AcDbSymbolTable");
  pair(70, doc.layers.length);
  for (const l of doc.layers) {
    pair(0, "LAYER");
    pair(5, layouts.handle());
    pair(330, "10");
    pair(100, "AcDbSymbolTableRecord");
    pair(100, "AcDbLayerTableRecord");
    pair(2, str(l.name));
    pair(70, l.locked ? 4 : 0);
    pair(62, l.visible === false ? -7 : 7);
    pair(420, parseInt(l.color.slice(1), 16));
    pair(6, l.lineType || "CONTINUOUS");
  }
  pair(0, "ENDTAB");
  if (styles.length) dimensionStyles(styles, pair, layouts.handle);
  layouts.tables();
  pair(0, "ENDSEC");
  const blocksInsert = out.length;
  pair(0, "SECTION");
  pair(2, "ENTITIES");
  const start = (type, e, subclass) => {
    pair(0, type);
    const handle = layouts.handle();
    pair(5, handle);
    pair(330, layouts.owner(e));
    pair(100, "AcDbEntity");
    pair(8, str(doc.layers.find((l) => l.id === e.layer)?.name || "0"));
    if (e.space && e.space !== "model") {
      pair(67, 1);
      pair(
        410,
        str(doc.layouts?.find((l) => l.id === e.space)?.name || "Layout1"),
      );
    }
    if (e.lineType) pair(6, e.lineType);
    if (e.color) pair(420, parseInt(e.color.slice(1), 16));
    if (subclass) pair(100, subclass);
    return handle;
  };
  const writeText = (e) => {
    if (needsMtext(e)) {
      start("MTEXT", e, "AcDbMText");
      const r = e.rotation || 0;
      point({
        x: e.point.x - Math.sin(r) * e.height,
        y: e.point.y + Math.cos(r) * e.height,
      });
      pair(30, 0);
      pair(40, e.height);
      pair(41, 0);
      pair(71, 1);
      pair(72, 1);
      for (const [code, value] of textChunks(mtextContent(e)))
        pair(code, value);
      pair(11, Math.cos(r));
      pair(21, Math.sin(r));
      pair(31, 0);
      pair(73, 2);
      pair(44, 1.4 / (5 / 3));
    } else {
      start("TEXT", e, "AcDbText");
      point(e.point);
      pair(40, e.height);
      pair(1, str(e.text));
      pair(50, ((e.rotation || 0) * 180) / Math.PI);
      pair(100, "AcDbText");
    }
  };
  let viewportId = 2;
  const writeAttribute = (e, type) => {
    start(type, e, "AcDbText");
    point(e.point);
    pair(30, 0);
    pair(40, e.height);
    pair(1, str(e.text));
    pair(50, ((e.rotation || 0) * 180) / Math.PI);
    pair(100, type === "ATTDEF" ? "AcDbAttributeDefinition" : "AcDbAttribute");
    if (type === "ATTDEF") pair(3, e.attributeTag);
    pair(2, e.attributeTag);
    pair(70, 0);
    pair(73, 0);
    pair(74, 0);
    pair(280, 0);
  };
  const writeEntity = (e) => {
    if (e.type === "dimension") {
      writeDimension(e, start, pair, point);
      return;
    }
    if (e.type === "block") {
      const attributes = blockParts(e).filter((p) => p.attributeTag);
      const owner = start("INSERT", e, "AcDbBlockReference");
      if (attributes.length) pair(66, 1);
      pair(2, e._blockName);
      point(e.point);
      pair(30, 0);
      pair(41, e.scale);
      pair(42, e.mirrored ? -e.scale : e.scale);
      pair(43, e.scale);
      pair(50, ((e.rotation || 0) * 180) / Math.PI);
      for (const part of attributes)
        writeAttribute({ ...part, _owner: owner }, "ATTRIB");
      if (attributes.length) start("SEQEND", { ...e, _owner: owner }, null);
      return;
    }
    if (e.type === "text" && e.attributeTag) {
      writeAttribute(e, "ATTDEF");
      return;
    }
    if (e.type === "viewport") {
      start("VIEWPORT", e, "AcDbViewport");
      const [a, b] = e.points,
        w = Math.abs(b.x - a.x),
        h = Math.abs(b.y - a.y);
      point({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
      pair(30, 0);
      pair(40, w);
      pair(41, h);
      pair(68, 1);
      pair(69, viewportId++);
      point(e.viewCenter, 12, 22);
      pair(16, 0);
      pair(26, 0);
      pair(36, 1);
      pair(17, 0);
      pair(27, 0);
      pair(37, 0);
      pair(45, h / e.viewScale);
      pair(51, 0);
      pair(90, e.locked !== false ? 16384 : 0);
    }
    if (e.type === "line") {
      start("LINE", e, "AcDbLine");
      point(e.points[0]);
      point(e.points[1], 11, 21);
    }
    if (e.type === "circle" || e.type === "arc") {
      start(e.type.toUpperCase(), e, "AcDbCircle");
      point(e.center);
      pair(40, e.radius);
      if (e.type === "arc") {
        pair(100, "AcDbArc");
        pair(
          50,
          (mod(e.sweep > 0 ? e.start : e.start + e.sweep) * 180) / Math.PI,
        );
        pair(
          51,
          (mod(e.sweep > 0 ? e.start + e.sweep : e.start) * 180) / Math.PI,
        );
      }
    }
    if (e.type === "polyline") {
      start("LWPOLYLINE", e, "AcDbPolyline");
      pair(90, e.points.length);
      pair(70, e.closed ? 1 : 0);
      e.points.forEach((p, i) => {
        point(p);
        if (e.bulges?.[i]) pair(42, e.bulges[i]);
      });
    }
    if (e.type === "text") writeText(e);
    if (e.type === "leader") {
      start("LEADER", e, "AcDbLeader");
      pair(3, "STANDARD");
      pair(71, 1);
      pair(72, 0);
      pair(73, 3);
      pair(74, 0);
      pair(75, 0);
      pair(76, e.points.length);
      for (const p of e.points) {
        point(p);
        pair(30, 0);
      }
      if (e.text) {
        writeText({
          ...e,
          type: "text",
          point: add(e.points.at(-1), {
            x: (e.height || 120) / 3,
            y: ((e.height || 120) * 7) / 24,
          }),
          rotation: 0,
        });
      }
    }
    if (e.type === "hatch") {
      start("HATCH", e, "AcDbHatch");
      point({ x: 0, y: 0 });
      pair(30, 0);
      pair(210, 0);
      pair(220, 0);
      pair(230, 1);
      pair(2, "ANSI31");
      pair(70, 0);
      pair(71, 0);
      pair(91, 1);
      pair(92, 2);
      pair(72, 0);
      pair(73, 1);
      pair(93, e.points.length);
      for (const p of e.points) point(p);
      pair(97, 0);
      pair(75, 0);
      pair(76, 1);
      pair(52, 0);
      pair(41, 1);
      pair(77, 0);
      pair(78, 1);
      pair(53, ((e.patternAngle ?? Math.PI / 4) * 180) / Math.PI);
      pair(43, 0);
      pair(44, 0);
      pair(45, -e.spacing * Math.sin(e.patternAngle ?? Math.PI / 4));
      pair(46, e.spacing * Math.cos(e.patternAngle ?? Math.PI / 4));
      pair(79, 0);
      pair(98, 0);
    }
  };
  for (const e of doc.entities) {
    const extra =
      e.space && (doc.layouts || []).findIndex((l) => l.id === e.space) > 0;
    if (extra && !extraBlocks.has(e.space)) extraBlocks.set(e.space, []);
    sink = extra ? extraBlocks.get(e.space) : out;
    writeEntity(e);
  }
  sink = out;
  pair(0, "ENDSEC");
  const blockData = [];
  sink = blockData;
  layouts.blocks((l) => {
    if (l.entities) {
      for (const e of l.entities)
        writeEntity({ ...e, space: undefined, _owner: l.record });
      return;
    }
    const data = extraBlocks.get(l.id);
    if (data) sink.push(...data);
  });
  out = [
    ...out.slice(0, blocksInsert),
    ...blockData,
    ...out.slice(blocksInsert),
  ];
  sink = out;
  layouts.objects();
  pair(0, "EOF");
  return out.join("\n") + "\n";
}
