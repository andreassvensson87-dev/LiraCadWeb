import test from "node:test";
import assert from "node:assert/strict";
import { importDXF, decodeDXF } from "../src/dxf-import.js";
import { toDXF, validDocument, demoDocument } from "../src/core.js";
import { createBlock, insertBlock } from "../src/blocks.js";
const layer = { id: "0", name: "0", color: "#ffffff", lineType: "DASHED" };
const drawing = (entities) => ({
  version: 1,
  name: "DXF",
  layers: [layer],
  entities,
});
const text = {
  id: "t",
  type: "text",
  layer: "0",
  point: { x: 10, y: 20 },
  height: 3,
  rotation: 0,
  text: "Åäö",
};
test("own exported geometry, layers, bulges and text import as editable entities", () => {
  const doc = drawing([
    {
      id: "l",
      type: "line",
      layer: "0",
      lineType: "CENTER",
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
    },
    {
      id: "p",
      type: "polyline",
      layer: "0",
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
      bulges: [1],
    },
    text,
    { ...text, id: "mt", text: "Rad 1\nRad 2" },
  ]);
  const result = importDXF(toDXF(doc));
  assert.ok(validDocument(result.document));
  assert.equal(result.count, 4);
  assert.equal(result.document.entities[0].lineType, "CENTER");
  assert.equal(result.document.layers[0].lineType, "DASHED");
  assert.equal(result.document.entities[1].bulges[0], 1);
  assert.equal(result.document.entities[2].text, "Åäö");
  assert.equal(result.document.entities[3].text, "Rad 1\nRad 2");
  assert.equal(result.document.entities[3].point.y, 23);
  assert.equal(result.document.entities[3].textAttachment, 1);
});
test("blocks retain definition sharing and per-instance attributes", () => {
  const b = createBlock(
    [{ ...text, attributeTag: "NAMN" }],
    "Stamp",
    { x: 5, y: 5 },
    "0",
  );
  const copy = insertBlock(b, { x: 100, y: 0 }, "0", "model");
  copy.values.NAMN = "Annat";
  const result = importDXF(toDXF(drawing([b, copy]))).document;
  assert.equal(result.blocks.length, 1);
  assert.equal(result.entities[1].values.NAMN, "Annat");
  assert.equal(
    result.entities[0].definition.id,
    result.entities[1].definition.id,
  );
});
test("layouts, viewports and dimensions roundtrip", () => {
  const d = drawing([
    {
      id: "dim",
      type: "dimension",
      layer: "0",
      kind: "linear",
      points: [
        { x: 0, y: 0 },
        { x: 20, y: 0 },
        { x: 0, y: 10 },
      ],
      axis: { x: 1, y: 0 },
      height: 2,
      precision: 0,
    },
    {
      id: "vp",
      type: "viewport",
      layer: "0",
      space: "paper",
      points: [
        { x: 5, y: 5 },
        { x: 100, y: 80 },
      ],
      viewCenter: { x: 10, y: 20 },
      viewScale: 0.5,
      locked: true,
    },
  ]);
  d.layouts = [{ id: "paper", name: "Ark", width: 210, height: 297 }];
  const result = importDXF(toDXF(d)).document;
  assert.equal(result.layouts[0].width, 210);
  assert.equal(
    result.entities.find((e) => e.type === "viewport").viewScale,
    0.5,
  );
  assert.equal(
    result.entities.find((e) => e.type === "dimension").kind,
    "linear",
  );
});
test("unsupported entities report explicitly and malformed files fail", () => {
  let source = toDXF(drawing([text]));
  source = source.replace(
    "0\nENDSEC\n0\nSECTION\n2\nOBJECTS",
    "0\nSPLINE\n8\n0\n0\nENDSEC\n0\nSECTION\n2\nOBJECTS",
  );
  assert.ok(
    importDXF(source).report.some((r) => r.message.startsWith("SPLINE:")),
  );
  assert.throws(() => importDXF("0\nSECTION\n2\nENTITIES"));
  assert.throws(() =>
    decodeDXF(new TextEncoder().encode("AutoCAD Binary DXF").buffer),
  );
  const utf = new TextEncoder().encode(toDXF(drawing([text])));
  assert.ok(decodeDXF(utf.buffer).includes("Åäö"));
});
test("demo DXF remains valid after import", () =>
  assert.ok(validDocument(importDXF(toDXF(demoDocument())).document)));

test("nested INSERT preserves composed translation and scale as editable geometry", () => {
  const pairs = [
    0,
    "SECTION",
    2,
    "BLOCKS",
    0,
    "BLOCK",
    2,
    "INNER",
    10,
    2,
    20,
    0,
    0,
    "LINE",
    8,
    "0",
    10,
    2,
    20,
    0,
    11,
    7,
    21,
    0,
    0,
    "ENDBLK",
    0,
    "BLOCK",
    2,
    "OUTER",
    10,
    0,
    20,
    0,
    0,
    "INSERT",
    2,
    "INNER",
    8,
    "0",
    10,
    10,
    20,
    20,
    41,
    2,
    42,
    2,
    0,
    "ENDBLK",
    0,
    "ENDSEC",
    0,
    "SECTION",
    2,
    "ENTITIES",
    0,
    "INSERT",
    2,
    "OUTER",
    8,
    "0",
    10,
    100,
    20,
    0,
    0,
    "ENDSEC",
    0,
    "EOF",
  ];
  const result = importDXF(pairs.join("\n") + "\n");
  assert.ok(validDocument(result.document));
  const instance = result.document.entities[0];
  assert.equal(instance.type, "block");
  assert.deepEqual(instance.definition.entities[0].points, [
    { x: 10, y: 20 },
    { x: 20, y: 20 },
  ]);
  assert.ok(result.report.some((r) => r.message.includes("Nästlat block")));
});
