import test from "node:test";
import assert from "node:assert/strict";
import { continueDimension, dimensionParts } from "../src/dimensions.js";

const source = {
  id: "original",
  type: "dimension",
  kind: "linear",
  points: [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 50, y: 30 },
  ],
  axis: { x: 1, y: 0 },
  height: 2.5,
  precision: 1,
  layer: "dimensions",
  color: "#ff0000",
  space: "sheet",
  text: "override",
};
test("dimension chains retain baseline, style and actual witness points across segments", () => {
  const before = structuredClone(source);
  const first = continueDimension(source, { x: 180, y: 15 });
  const second = continueDimension(first, { x: 250, y: -10 });
  assert.deepEqual(source, before);
  for (const e of [first, second]) {
    assert.equal(e.layer, source.layer);
    assert.equal(e.space, source.space);
    assert.equal(e.color, source.color);
    assert.equal(e.height, source.height);
    assert.equal(e.precision, source.precision);
    assert.equal(e.id, undefined);
    assert.equal(e.text, undefined);
    assert.ok(dimensionParts(e)[2].points.every((p) => p.y === 30));
  }
  assert.deepEqual(first.points[1], { x: 180, y: 15 });
  assert.equal(dimensionParts(first).at(-1).text, "80.0");
  assert.equal(dimensionParts(second).at(-1).text, "70.0");
});
test("continuation supports either endpoint and vertical dimensions", () => {
  const left = continueDimension(source, { x: -40, y: 0 }, 0);
  assert.equal(dimensionParts(left).at(-1).text, "40.0");
  const vertical = {
    ...source,
    axis: { x: 0, y: 1 },
    points: [
      { x: 0, y: 0 },
      { x: 0, y: 100 },
      { x: 30, y: 50 },
    ],
  };
  const next = continueDimension(vertical, { x: 15, y: 180 });
  assert.equal(dimensionParts(next).at(-1).text, "80.0");
  assert.ok(dimensionParts(next)[2].points.every((p) => p.x === 30));
});
test("aligned chain keeps original angle and baseline with off-axis measurements", () => {
  const aligned = {
    ...source,
    kind: "aligned",
    points: [
      { x: 0, y: 0 },
      { x: 30, y: 40 },
      { x: -8, y: 6 },
    ],
  };
  const next = continueDimension(aligned, { x: 56, y: 83 });
  const baseline = dimensionParts(next)[2].points;
  for (const p of baseline)
    assert.ok(Math.abs(-0.8 * p.x + 0.6 * p.y - 10) < 1e-8);
  assert.equal(dimensionParts(next).at(-1).text, "50.0");
});
test("zero projected length and unsupported dimensions are rejected", () => {
  assert.throws(
    () => continueDimension(source, { x: 100, y: 200 }),
    /större än 0/,
  );
  assert.throws(
    () => continueDimension({ ...source, kind: "radius" }, { x: 20, y: 40 }),
    /linjärt/,
  );
});
