import test from "node:test";
import assert from "node:assert/strict";
import { paperSnaps } from "../src/layout.js";
test("paper corners and midpoints take priority over continuous edge snaps", () => {
  for (const layout of [
    { width: 420, height: 297 },
    { width: 210, height: 297 },
  ]) {
    assert.deepEqual(paperSnaps(layout, { x: 1, y: -1 }, 3)[0].p, {
      x: 0,
      y: 0,
    });
    assert.deepEqual(
      paperSnaps(layout, { x: layout.width - 1, y: layout.height + 1 }, 3)[0].p,
      { x: layout.width, y: layout.height },
    );
    assert.deepEqual(
      paperSnaps(layout, { x: layout.width / 2 + 1, y: 1 }, 3)[0].p,
      { x: layout.width / 2, y: 0 },
    );
  }
});
test("edge snaps stay on the finite page boundary and obey tolerance", () => {
  const page = { width: 420, height: 297 };
  assert.deepEqual(paperSnaps(page, { x: 45, y: 298 }, 2)[0].p, {
    x: 45,
    y: 297,
  });
  assert.deepEqual(paperSnaps(page, { x: -1, y: 65 }, 2)[0].p, { x: 0, y: 65 });
  assert.deepEqual(paperSnaps(page, { x: 100, y: 100 }, 2), []);
  assert.deepEqual(paperSnaps(page, { x: 450, y: 0 }, 2), []);
  assert.deepEqual(paperSnaps(null, { x: 0, y: 0 }, 2), []);
});
