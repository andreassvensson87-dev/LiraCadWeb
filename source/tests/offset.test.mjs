import test from "node:test";
import assert from "node:assert/strict";
import { offset, dist } from "../src/core.js";
test("two measurement points define offset distance independently of the source", () => {
  const e = {
    type: "line",
    points: [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ],
  };
  const measured = dist({ x: 100, y: 100 }, { x: 103, y: 104 });
  assert.equal(measured, 5);
  assert.deepEqual(offset(e, measured, { x: 20, y: -1 }).points, [
    { x: 0, y: -5 },
    { x: 10, y: -5 },
  ]);
});
test("arc and circle clicked offsets preserve geometry and reject collapsed radii", () => {
  for (const type of ["circle", "arc"]) {
    const e = {
      type,
      center: { x: 0, y: 0 },
      radius: 10,
      start: 0.5,
      sweep: -1,
    };
    const p = { x: 15, y: 0 };
    const copy = offset(e, dist({ x: 0, y: 0 }, { x: 3, y: 4 }), p);
    assert.equal(copy.radius, 15);
    assert.equal(copy.start, e.start);
    assert.equal(copy.sweep, e.sweep);
    assert.equal(offset(e, 10, { x: 0, y: 0 }), null);
    assert.equal(e.radius, 10);
  }
});
