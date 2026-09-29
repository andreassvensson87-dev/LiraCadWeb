import test from "node:test";
import assert from "node:assert/strict";
import { linePattern, resolvedLineType } from "../src/linetypes.js";
import { toDXF, validDocument } from "../src/core.js";
import { layoutSVG } from "../src/plot.js";
import { polylineParts } from "../src/polyline.js";
test("line types inherit layers and preserve explicit overrides through geometry and export", () => {
  const layer = { id: "0", name: "0", color: "#ffffff", lineType: "DASHED" };
  const e = {
    id: "1",
    type: "line",
    layer: "0",
    points: [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ],
    space: "paper",
  };
  assert.equal(resolvedLineType(e, layer), "DASHED");
  assert.deepEqual(linePattern({ ...e, lineType: "CONTINUOUS" }, layer), []);
  const doc = {
    version: 1,
    layers: [layer],
    entities: [e],
    layouts: [{ id: "paper", name: "Ark", width: 200, height: 100 }],
  };
  assert.ok(validDocument(doc));
  assert.ok(toDXF(doc).includes("DASHED"));
  assert.ok(layoutSVG(doc, doc.layouts[0]).includes('stroke-dasharray="8 4"'));
  e.lineType = "CENTER";
  assert.ok(toDXF(doc).includes("CENTER"));
  assert.equal(
    polylineParts({ ...e, type: "polyline", bulges: [1] })[0].lineType,
    "CENTER",
  );
  e.lineType = "unknown";
  assert.equal(validDocument(doc), false);
});
