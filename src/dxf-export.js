import { evaluatedBlockEntities } from "./parametric-blocks.js";
import { annotationMetadata } from "./dxf-annotation.js";
import { add, mod } from "./geometry.js";
import { nativeFontName } from "./cad-fonts.js";
import { hatchPattern } from "./hatch-pattern.js";
import { lineTypes } from "./linetypes.js";
import {
  splitDimension,
  writeDimension,
  dimensionStyles,
} from "./dxf-dimensions.js";
import { dimensionParts } from "./dimensions.js";
import { blockParts } from "./blocks.js";
import { dxfLayouts } from "./dxf-layout.js";
import { needsMtext, mtextContent, textChunks, textLayout, textAlignment } from "./text.js";

export function toDXF(doc) {
  const customBlocks = [],
    definitions = new Map(),
    usedBlockNames = new Set(),
    styles = [];
  const nativeLineTypes = new Map();
  const lineTypeName = e => {
    if (e.lineType === "BYLAYER" || !e.linePattern || e.linePatternType !== e.lineType) return e.lineType;
    const key = JSON.stringify(e.linePattern);
    if (!nativeLineTypes.has(key)) nativeLineTypes.set(key, { name: `LIRA_LINE_${nativeLineTypes.size + 1}`, pattern: e.linePattern });
    return nativeLineTypes.get(key).name;
  };
  doc.layers.forEach(lineTypeName);
  const textStyles = new Map();
  const textStyleName = e => {
    const font = e.sourceFont || nativeFontName(e.font || "Arial") + ".ttf";
    if (!textStyles.has(font)) textStyles.set(font, `LIRA_TEXT_${textStyles.size + 1}`);
    return textStyles.get(font);
  };
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
          const properties={height:dim.height,precision:dim.precision||0,fontStyle:textStyleName(dim)};
          for(const key of ['arrowSize','extensionOffset','extensionOvershoot','textGap','measurementScale','dimensionPost','decimalSeparator','zeroSuppress'])properties[key]=dim[key];
          const key=JSON.stringify(properties);
          let style = styles.find(s=>s.key===key);
          if (!style) {
            style = {
              name: `LIRA_DIM_${styles.length + 1}`,
              ...properties,key,
            };
            styles.push(style);
          }
          return { ...dim, _dimBlock: blockName, _dimStyle: style.name };
        });
      if (e.type === "block") {
        for (const part of Object.values(e.attributeOverrides || {})) { textStyleName(part); lineTypeName(part); }
        const definition=e.definition.stretchParameters?.length?{...e.definition,entities:evaluatedBlockEntities({...e,attributeOverrides:{}})}:e.definition;
        const key = JSON.stringify([definition,e._externalReference?.path,e._externalReference?.kind]);
        if (!definitions.has(key)) {
          let blockName = e.definition.name;
          if (usedBlockNames.has(blockName.toLowerCase()))
            blockName += "_" + (definitions.size + 1);
          usedBlockNames.add(blockName.toLowerCase());
          definitions.set(key, blockName);
          customBlocks.push({
            blockName,
            flags: e._externalReference ? 4 | (e._externalReference.kind==='overlay'?8:0) : e.definition.entities.some((p) => p.attributeTag) ? 2 : 0,
            path: e._externalReference?.path,
            entities: prepare(definition.entities),
          });
        }
        return [{ ...e, _blockName: definitions.get(key) }];
      }
      lineTypeName(e);
      if (e.type === "text" || e.type === "leader") textStyleName(e);
      return [e];
    });
  const references=(doc.references || []).map(r=>({
    id:r.id,type:'block',layer:r.layer || doc.layers.find(l=>!l.referenceId)?.id || doc.layers[0].id,
    point:r.point,scale:r.scale,rotation:r.rotation,mirrored:r.mirrored,space:r.space || 'model',
    hidden:r.visible===false,values:{},_externalReference:r,
    definition:{id:r.id,name:r.name.replace(/\.[^.]+$/,'').replace(/[^\p{L}\p{N}_-]/gu,'_').slice(0,64)||'Xref',entities:[]},
  }));
  doc = { ...doc, entities: prepare([...doc.entities,...references]) };
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
  pair(9, "$INSBASE");
  point({x:0,y:0});
  pair(30, 0);
  pair(0, "ENDSEC");
  pair(0, "SECTION");
  pair(2, "TABLES");
  const lineTable = layouts.handle();
  pair(0, "TABLE");
  pair(2, "LTYPE");
  pair(5, lineTable);
  pair(330, "0");
  pair(100, "AcDbSymbolTable");
  pair(70, lineTypes.length + 2 + nativeLineTypes.size);
  for (const [id, label, pattern] of [
    ["BYLAYER", "ByLayer", []],
    ["BYBLOCK", "ByBlock", []],
    ...lineTypes,
    ...[...nativeLineTypes.values()].map(({ name, pattern }) => [name, name, pattern]),
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
    if(!(l.color.toLowerCase()==='#ffffff' && l.cadColor7!==false))pair(420, parseInt(l.color.slice(1), 16));
    pair(6, lineTypeName(l) || "CONTINUOUS");
    pair(290,l.plot===false?0:1);
    if (l.lineWeight != null) pair(370, Math.round(l.lineWeight * 100));
  }
  pair(0, "ENDTAB");
  pair(0,"TABLE");pair(2,"APPID");pair(5,layouts.handle());pair(100,"AcDbSymbolTable");pair(70,1);
  pair(0,"APPID");pair(5,layouts.handle());pair(100,"AcDbSymbolTableRecord");pair(100,"AcDbRegAppTableRecord");pair(2,"LIRA_ANNOTATION");pair(70,0);pair(0,"ENDTAB");
  const textStyleHandles=new Map();
  if (textStyles.size) {
    pair(0, "TABLE"); pair(2, "STYLE"); pair(5, layouts.handle()); pair(330, 0); pair(100, "AcDbSymbolTable"); pair(70, textStyles.size);
    for (const [font, name] of textStyles) {
      const handle=layouts.handle();textStyleHandles.set(name,handle);
      pair(0, "STYLE"); pair(5, handle); pair(100, "AcDbSymbolTableRecord"); pair(100, "AcDbTextStyleTableRecord");
      pair(2, name); pair(70, 0); pair(40, 0); pair(41, 1); pair(50, 0); pair(71, 0); pair(42, 2.5); pair(3, str(font)); pair(4, "");
    }
    pair(0, "ENDTAB");
  }
  if (styles.length) dimensionStyles(styles, pair, layouts.handle,textStyleHandles);
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
    if (e.lineType) pair(6, lineTypeName(e));
    if (e.lineScale != null) pair(48, e.lineScale);
    if (e.cadColor7 && e.color === "#ffffff") pair(62, 7);
    else if (e.color) pair(420, parseInt(e.color.slice(1), 16));
    else if (e.colorByBlock) pair(62, 0);
    if (e.hidden) pair(60, 1);
    if (e.lineWeight != null) pair(370, Math.round(e.lineWeight * 100));
    if (subclass) pair(100, subclass);
    return handle;
  };
  const writeText = (e) => {
    if (needsMtext(e)) {
      start("MTEXT", e, "AcDbMText");
      const r = e.rotation || 0;
      const top = -textLayout(e).top;
      point(e.textAttachment ? e.point : {
        x: e.point.x - Math.sin(r) * top,
        y: e.point.y + Math.cos(r) * top,
      });
      pair(30, 0);
      pair(40, e.height);
      pair(7, textStyleName(e));
      pair(41, e.textWidth || 0);
      pair(71, e.textAttachment || ["left", "center", "right"].indexOf(textAlignment(e)) + 1);
      pair(72, 1);
      if(e.textColumns){const c=e.textColumns;
        pair(75,c.type);pair(76,c.count);pair(78,c.reversed?1:0);pair(79,c.autoHeight?1:0);
        pair(48,c.width);pair(49,c.gutter);
        pair(50,c.heights.length);for(const h of c.heights)pair(50,h);
      }
      for (const [code, value] of textChunks(mtextContent(e)))
        pair(code, value);
      pair(11, Math.cos(r));
      pair(21, Math.sin(r));
      pair(31, 0);
      pair(73, e.lineSpacingStyle || 2);
      pair(44, (e.lineSpacing || 1.4) / (5 / 3));
    } else {
      start("TEXT", e, "AcDbText");
      point(e.point);
      pair(40, e.height);
      pair(1, str(e.text));
      pair(7, textStyleName(e));
      pair(41, e.widthFactor || 1);
      pair(51, (e.oblique || 0) * 180 / Math.PI);
      pair(71, (e.textMirrorX ? 2 : 0) | (e.textMirrorY ? 4 : 0));
      const h = e.textFitWidth ? 5 : { left: 0, center: 1, right: 2 }[e.textAlign] || 0;
      pair(72, h);
      if (h || (e.textVertical && e.textVertical !== "baseline")) {
        point(e.textFitWidth ? { x: e.point.x + Math.cos(e.rotation || 0) * e.textFitWidth, y: e.point.y + Math.sin(e.rotation || 0) * e.textFitWidth } : e.point, 11, 21); pair(31, 0);
      }
      pair(73, { baseline: 0, bottom: 1, middle: 2, top: 3 }[e.textVertical] || 0);
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
    pair(7, textStyleName(e)); pair(41, e.widthFactor || 1); pair(51, (e.oblique || 0) * 180 / Math.PI);
    pair(71, (e.textMirrorX ? 2 : 0) | (e.textMirrorY ? 4 : 0));
    pair(72, { left: 0, center: 1, right: 2 }[e.textAlign] || 0); point(e.point, 11, 21); pair(31, 0);
    pair(50, ((e.rotation || 0) * 180) / Math.PI);
    pair(100, type === "ATTDEF" ? "AcDbAttributeDefinition" : "AcDbAttribute");
    if (type === "ATTDEF") pair(3, e.attributeTag);
    pair(2, e.attributeTag);
    pair(70, e.hidden ? 1 : 0);
    pair(73, 0);
    pair(74, { baseline: 0, bottom: 1, middle: 2, top: 3 }[e.textVertical] || 0);
    pair(280, 0);
  };
  const writeAnnotation = e => {
    const metadata=structuredClone(annotationMetadata(e));if(!Object.keys(metadata).length)return;
    if(metadata.annotationVariants){
      metadata.annotationLayerNames=true;
      const names=part=>{if(part.layer)part.layer=doc.layers.find(l=>l.id===part.layer)?.name||part.layer;if(part.definition)part.definition.entities.forEach(names);if(part.dimensionGraphics)part.dimensionGraphics.forEach(names);if(part.attributeOverrides)Object.values(part.attributeOverrides).forEach(names);};
      metadata.annotationVariants.forEach(v=>names(v.entity));
    }
    pair(1001,"LIRA_ANNOTATION");const json=JSON.stringify(metadata);
    for(let i=0;i<json.length;i+=200)pair(1000,json.slice(i,i+200));
  };
  const writeEntity = (e) => {
    if (e.type === "dimension") {
      writeDimension(e, start, pair, point);
      writeAnnotation(e);
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
      writeAnnotation(e);
      for (const part of attributes)
        writeAttribute({ ...part, _owner: owner }, "ATTRIB");
      if (attributes.length) start("SEQEND", { ...e, _owner: owner }, null);
      return;
    }
    if (e.type === "text" && e.attributeTag) {
      writeAttribute(e, "ATTDEF");
      writeAnnotation(e);
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
      const rotation = e.viewRotation || 0;
      point({ x: Math.cos(rotation) * e.viewCenter.x + Math.sin(rotation) * e.viewCenter.y, y: -Math.sin(rotation) * e.viewCenter.x + Math.cos(rotation) * e.viewCenter.y }, 12, 22);
      pair(51, -rotation * 180 / Math.PI);
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
      pair(2, e.solid ? "SOLID" : str(e.patternName || "ANSI31"));
      pair(70, e.solid ? 1 : 0);
      pair(71, 0);
      pair(91, 1 + (e.holes?.length || 0));
      for (const loop of [e.points, ...(e.holes || [])]) {
        pair(92, 2); pair(72, 0); pair(73, 1); pair(93, loop.length);
        for (const p of loop) point(p); pair(97, 0);
      }
      pair(75, 0);
      pair(76, 1);
      if (!e.solid) {
      pair(52, 0);
      pair(41, 1);
      pair(77, 0);
      const pattern=hatchPattern(e);pair(78,pattern.length);
      for(const line of pattern){
        pair(53,line.angle*180/Math.PI);pair(43,line.base.x);pair(44,line.base.y);
        pair(45,line.offset.x);pair(46,line.offset.y);pair(79,line.dashes.length);
        for(const dash of line.dashes)pair(49,dash);
      }
      }
      pair(98, 0);
    }
    writeAnnotation(e);
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
