import test from "node:test";
import assert from "node:assert/strict";
import {
  arcThrough,
  polar,
  dist,
  parsePoint,
  transformed,
  offset,
  rectSelect,
  History,
  demoDocument,
  validDocument,
  toDXF,
  pointsOf,
  hitDistance,
} from "../src/core.js";
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
test("arc through three points preserves geometry and direction at survey coordinates", () => {
  for (const k of [0, 6500000]) {
    const a = { x: k + 1, y: k },
      b = { x: k, y: k + 1 },
      c = { x: k - 1, y: k };
    const arc = arcThrough(a, b, c);
    near(arc.radius, 1);
    near(arc.sweep, Math.PI);
    near(dist(polar(arc.center, arc.radius, arc.start), a), 0);
    assert.equal(arcThrough(a, a, c), null);
    const reverse = arcThrough(c, b, a);
    near(reverse.sweep, -Math.PI);
    assert.ok(pointsOf({ type: "arc", ...arc }).length > 10);
  }
});
test("coordinate parser supports absolute, relative, polar and directed length", () => {
  assert.deepEqual(parsePoint("100,200"), { x: 100, y: 200 });
  assert.deepEqual(parsePoint("@10,-20", { x: 5, y: 8 }), { x: 15, y: -12 });
  const p = parsePoint("@100<90", { x: 5, y: 8 });
  near(p.x, 5);
  near(p.y, 108);
  assert.deepEqual(parsePoint("50", { x: 0, y: 0 }, { x: 100, y: 0 }), {
    x: 50,
    y: 0,
  });
  assert.equal(parsePoint("@1,2"), null);
  assert.equal(parsePoint("NaN,2"), null);
});
test("mirror keeps arc endpoints and reverses its orientation", () => {
  const e = {
    type: "arc",
    center: { x: 0, y: 0 },
    radius: 10,
    start: 0,
    sweep: Math.PI / 2,
  };
  const t = transformed(e, "MIRROR", { x: 0, y: 0 }, { x: 10, y: 0 });
  near(t.sweep, -Math.PI / 2);
  near(hitDistance(t, { x: 0, y: -10 }), 0);
  assert.ok(hitDistance(t, { x: 0, y: 10 }) > 10);
});
test("move, scale and rotate preserve appropriate dimensions", () => {
  const e = { type: "circle", center: { x: 10, y: 0 }, radius: 5 };
  const t = transformed(e, "ROTATE", { x: 0, y: 0 }, null, Math.PI / 2);
  near(t.center.y, 10);
  near(t.radius, 5);
  const s = transformed(e, "SCALE", { x: 0, y: 0 }, null, 2);
  near(s.radius, 10);
  near(s.center.x, 20);
  assert.deepEqual(
    transformed(e, "MOVE", { x: 0, y: 0 }, { x: 4, y: 6 }).center,
    { x: 14, y: 6 },
  );
});
test("offset chooses side and rejects collapsing circles", () => {
  const e = {
    type: "line",
    points: [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ],
  };
  near(offset(e, 5, { x: 0, y: -3 }).points[0].y, -5);
  assert.equal(
    offset({ type: "circle", center: { x: 0, y: 0 }, radius: 5 }, 6, {
      x: 0,
      y: 0,
    }),
    null,
  );
});
test("window versus crossing selection and empty interior of a circle", () => {
  const e = {
      type: "line",
      points: [
        { x: -10, y: 0 },
        { x: 10, y: 0 },
      ],
    },
    r = { minX: -1, minY: -1, maxX: 1, maxY: 1 };
  assert.equal(rectSelect(e, r, false), false);
  assert.equal(rectSelect(e, r, true), true);
  assert.equal(
    rectSelect({ type: "circle", center: { x: 0, y: 0 }, radius: 10 }, r, true),
    false,
  );
});
test("undo and redo restore transactions, new edits invalidate redo", () => {
  const h = new History();
  h.commit({ x: 1 }, { x: 2 }, "move");
  assert.deepEqual(h.undo(), { x: 1 });
  assert.deepEqual(h.redo(), { x: 2 });
  h.undo();
  h.commit({ x: 1 }, { x: 3 }, "edit");
  assert.equal(h.redo(), null);
});
test("demo contains all requested types and DXF export has native entities", () => {
  const d = demoDocument();
  assert.ok(validDocument(d));
  for (const type of ["line", "circle", "arc", "text", "leader", "hatch"])
    assert.ok(d.entities.some((e) => e.type === type));
  const s = toDXF(d);
  for (const type of ["LINE", "CIRCLE", "ARC", "TEXT", "LEADER", "HATCH"])
    assert.ok(s.includes(`0\n${type}\n`));
  assert.ok(s.includes("9\n$INSUNITS\n70\n4"));
  assert.ok(s.endsWith("0\nEOF\n"));
});
test("project validation rejects missing layers, invalid radii and duplicate IDs", () => {
  const d = demoDocument();
  d.entities[0].layer = "missing";
  assert.equal(validDocument(d), false);
  const b = demoDocument();
  b.entities.push(b.entities[0]);
  assert.equal(validDocument(b), false);
  const c = demoDocument();
  c.entities.find((e) => e.type === "circle").radius = -1;
  assert.equal(validDocument(c), false);
});
