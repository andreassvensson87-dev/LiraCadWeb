import test from "node:test";
import assert from "node:assert/strict";
import { polylineParts } from "../src/polyline.js";
import { createBlock, blockParts, insertBlock } from "../src/blocks.js";
import { joinEntities, explodePolyline } from "../src/editing.js";
import { createSnapIndex, nearbySnaps } from "../src/snapping.js";
import {
  bounds,
  hitDistance,
  snapPoints,
  transformed,
  validDocument,
  toDXF,
  dist,
} from "../src/core.js";
import { dimensionChain } from "../src/dimensions.js";
const doc = (entities) => ({
  version: 1,
  name: "Object test",
  layers: [{ id: "0", name: "0", color: "#ffffff" }],
  entities,
});
const poly = {
  id: "p",
  type: "polyline",
  layer: "0",
  points: [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 20, y: 0 },
  ],
  bulges: [1, 0],
  closed: false,
};
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
test("bulge geometry retains arc hit testing, midpoints and exact intersections", () => {
  const [arc] = polylineParts(poly);
  near(arc.radius, 5);
  near(arc.sweep, Math.PI);
  near(hitDistance(poly, { x: 5, y: -5 }), 0);
  near(bounds(poly).minY, -5);
  assert.ok(
    snapPoints(poly).some(
      (s) => s.kind === "Mittpunkt" && dist(s.p, { x: 5, y: -5 }) < 1e-7,
    ),
  );
  const index = createSnapIndex([
    poly,
    {
      id: "cross",
      type: "line",
      points: [
        { x: 5, y: -10 },
        { x: 5, y: 0 },
      ],
    },
  ]);
  assert.ok(
    nearbySnaps(index, { x: 5, y: -5 }, 0.1).some(
      (s) => s.kind === "Skärning" && dist(s.p, { x: 5, y: -5 }) < 1e-7,
    ),
  );
  const mirrored = transformed(poly, "MIRROR", { x: 0, y: 0 }, { x: 10, y: 0 });
  near(mirrored.bulges[0], -1);
  near(bounds(mirrored).maxY, 5);
});
test("explode and join preserve reversed arcs instead of flattening them", () => {
  const parts = explodePolyline(poly);
  assert.equal(parts[0].type, "arc");
  const joined = joinEntities([parts[1], parts[0]]);
  near(hitDistance(joined, { x: 5, y: -5 }), 0);
  assert.ok(
    joined.bulges.some(
      (b) => Math.abs(b) === 1 || Math.abs(Math.abs(b) - 1) < 1e-8,
    ),
  );
  assert.ok(validDocument(doc([joined])));
  assert.match(toDXF(doc([joined])), /42\n-?0?\.?9*1?\d*\n/);
});
test("blocks preserve individual attribute values, transformations and JSON roundtrip", () => {
  const tag = {
    id: "tag",
    type: "text",
    layer: "0",
    point: { x: 3, y: 2 },
    height: 2,
    rotation: 0,
    text: "A1",
    attributeTag: "NUMBER",
  };
  const block = createBlock([poly, tag], "Door", { x: 0, y: 0 }, "0");
  const copy = insertBlock(block, { x: 50, y: 10 }, "0", "model");
  copy.values.NUMBER = "A2";
  assert.equal(blockParts(block).find((e) => e.type === "text").text, "A1");
  assert.equal(blockParts(copy).find((e) => e.type === "text").text, "A2");
  const moved = transformed(copy, "ROTATE", { x: 0, y: 0 }, null, Math.PI / 2);
  near(hitDistance(moved, { x: -5, y: 55 }), 0);
  assert.ok(validDocument(JSON.parse(JSON.stringify(doc([block, copy])))));
  assert.equal(
    validDocument(
      doc([
        { ...block, definition: { ...block.definition, entities: [block] } },
      ]),
    ),
    false,
  );
  const dxf = toDXF(doc([block, copy]));
  assert.equal((dxf.match(/\nINSERT\n/g) || []).length, 2);
  assert.equal((dxf.match(/\nATTDEF\n/g) || []).length, 1);
  assert.equal((dxf.match(/\nATTRIB\n/g) || []).length, 2);
  assert.match(dxf, /1\nA2\n/);
});
test("DXF exports native dimensions and a unique anonymous picture block per chain segment", () => {
  const chain = dimensionChain(
    { id: "d", layer: "0", height: 2.5, precision: 1 },
    [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 25, y: 0 },
    ],
    { x: 0, y: 5 },
    { x: 1, y: 0 },
  );
  const dxf = toDXF(doc([chain]));
  assert.equal((dxf.match(/\nDIMENSION\n/g) || []).length, 2);
  assert.match(dxf, /AcDbRotatedDimension/);
  assert.match(dxf, /\nDIMSTYLE\n/);
  assert.match(dxf, /2\n\*D1\n/);
  assert.match(dxf, /2\n\*D2\n/);
  assert.match(dxf, /1\n<>\n/);
});

test("arc midpoint grip changes curvature while keeping both endpoints", async () => {
  const { grips, gripEntity } = await import("../src/grips.js");
  const handle = grips(poly).find((g) => g.kind === "bulge");
  const changed = gripEntity(poly, handle, { x: 5, y: -2 });
  assert.deepEqual(changed.points, poly.points);
  near(hitDistance(changed, { x: 5, y: -2 }), 0);
  assert.ok(validDocument(doc([changed])));
});
test("block library survives deletion of all instances and new insertion uses default attributes", async () => {
  const { blockTemplates } = await import("../src/blocks.js");
  const block = createBlock(
    [
      {
        id: "t",
        type: "text",
        layer: "0",
        point: { x: 0, y: 0 },
        height: 2,
        text: "Default",
        attributeTag: "TAG",
      },
    ],
    "Reusable",
    { x: 0, y: 0 },
    "0",
  );
  const d = { ...doc([]), blocks: [block.definition] };
  assert.ok(validDocument(JSON.parse(JSON.stringify(d))));
  const templates = blockTemplates(d);
  assert.equal(templates.length, 1);
  const first = insertBlock(templates[0], { x: 10, y: 20 }, "0", "model");
  first.values.TAG = "Changed";
  const second = insertBlock(first, { x: 30, y: 40 }, "0", "model");
  assert.equal(second.values.TAG, "Default");
  assert.match(toDXF(d), /2\nReusable\n/);
  assert.equal(
    validDocument({
      ...d,
      blocks: [{ ...block.definition, entities: [first] }],
    }),
    false,
  );
});
