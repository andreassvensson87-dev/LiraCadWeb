import test from "node:test";
import assert from "node:assert/strict";
import {
  dimensionChain,
  dimensionParts,
  extendDimensionChain,
} from "../src/dimensions.js";
import { validDocument, transformed, toDXF } from "../src/core.js";
import { grips, gripEntity } from "../src/grips.js";
const source = {
  id: "chain",
  type: "dimension",
  layer: "0",
  space: "model",
  height: 2.5,
  precision: 0,
};
const points = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 250, y: 20 },
  { x: 400, y: 0 },
];
const chain = () =>
  dimensionChain(source, points, { x: 0, y: -40 }, { x: 1, y: 0 });
const labels = (e) =>
  dimensionParts(e)
    .filter((p) => p.type === "text")
    .map((p) => p.text);
const document = (e) => ({
  version: 1,
  name: "chain",
  layers: [{ id: "0", name: "0", color: "#ffffff" }],
  entities: [e],
});

test("multiple picked points form one valid serializable chain with individual lengths", () => {
  const e = chain();
  assert.equal(e.id, "chain");
  assert.deepEqual(labels(e), ["100", "150", "150"]);
  assert.ok(validDocument(JSON.parse(JSON.stringify(document(e)))));
  assert.ok(toDXF(document(e)).includes("TEXT"));
  assert.equal(grips(e).length, 5);
  const lines = dimensionParts(e).filter((p) => p.type === "line");
  const sharedWitness = lines.filter(
    (p) => p.points[0].x === 100 && p.points[1].x === 100,
  );
  assert.equal(sharedWitness.length, 1);
});
test("inserting a point splits one interval without adding an entity or moving the baseline", () => {
  const e = chain();
  const next = extendDimensionChain(e, { x: 175, y: 10 });
  assert.equal(next.id, e.id);
  assert.deepEqual(labels(next), ["100", "75", "75", "150"]);
  assert.equal(next.points.at(-1).y, -40);
  assert.deepEqual(labels(e), ["100", "150", "150"]);
  assert.throws(
    () => extendDimensionChain(e, { x: 100, y: 60 }),
    /olika lägen/,
  );
});
test("placement grip moves entire dimension line and measurement grips update neighbors", () => {
  const e = chain();
  const moved = gripEntity(e, grips(e).at(-1), { x: 200, y: -80 });
  assert.deepEqual(moved.points.slice(0, -1), e.points.slice(0, -1));
  assert.deepEqual(labels(moved), labels(e));
  const changed = gripEntity(e, grips(e)[1], { x: 125, y: 0 });
  assert.deepEqual(labels(changed), ["125", "125", "150"]);
});
test("whole-chain transforms retain measurements and scale all labels together", () => {
  const e = chain();
  const moved = transformed(e, "MOVE", { x: 0, y: 0 }, { x: 20, y: 30 });
  assert.deepEqual(labels(moved), labels(e));
  const rotated = transformed(
    e,
    "ROTATE",
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    Math.PI / 4,
  );
  assert.deepEqual(labels(rotated), labels(e));
  assert.ok(validDocument(document(rotated)));
  const scaled = transformed(e, "SCALE", { x: 0, y: 0 }, { x: 0, y: 0 }, 2);
  assert.deepEqual(labels(scaled), ["200", "300", "300"]);
});
test("vertical and oblique chains sort measurements along their common axis", () => {
  const vertical = dimensionChain(
    source,
    [
      { x: 0, y: 200 },
      { x: 10, y: 0 },
      { x: 5, y: 100 },
    ],
    { x: 30, y: 0 },
    { x: 0, y: 1 },
  );
  assert.deepEqual(labels(vertical), ["100", "100"]);
  const oblique = dimensionChain(
    source,
    [
      { x: 0, y: 0 },
      { x: 30, y: 40 },
      { x: 60, y: 80 },
    ],
    { x: -8, y: 6 },
    { x: 0.6, y: 0.8 },
  );
  assert.deepEqual(labels(oblique), ["50", "50"]);
  assert.ok(validDocument(document(oblique)));
  assert.throws(
    () => dimensionChain(source, [points[0]], { x: 0, y: 10 }),
    /olika/,
  );
});
