import test from "node:test";
import assert from "node:assert/strict";
import {
  grips,
  gripEntity,
  gripTargets,
  moveGripTargets,
} from "../src/grips.js";
import { demoDocument, polar, dist } from "../src/core.js";

test("shared line endpoints move together without moving nearby grips or originals", () => {
  const entities = [
    {
      id: "a",
      type: "line",
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
    },
    {
      id: "b",
      type: "line",
      points: [
        { x: 0, y: 10 },
        { x: 0, y: 0 },
      ],
    },
    { id: "near", type: "text", point: { x: 0.01, y: 0 }, text: "near" },
  ];
  const before = structuredClone(entities);
  const targets = gripTargets(entities, { x: 0, y: 0 });
  assert.deepEqual(
    targets.map((t) => t.entity.id),
    ["a", "b"],
  );
  const moved = moveGripTargets(targets, { x: 2, y: 3 });
  assert.deepEqual(moved[0].points, [
    { x: 2, y: 3 },
    { x: 10, y: 0 },
  ]);
  assert.deepEqual(moved[1].points, [
    { x: 0, y: 10 },
    { x: 2, y: 3 },
  ]);
  assert.deepEqual(entities, before);
  assert.deepEqual(moveGripTargets(targets, { x: 4, y: 5 })[0].points[0], {
    x: 4,
    y: 5,
  });
});

test("coincident vertices within one polyline are updated in the same result", () => {
  const entity = {
    id: "p",
    type: "polyline",
    points: [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 0, y: 0 },
    ],
  };
  const moved = moveGripTargets(gripTargets([entity], entity.points[0]), {
    x: 3,
    y: 4,
  });
  assert.equal(moved.length, 1);
  assert.deepEqual(moved[0].points, [
    { x: 3, y: 4 },
    { x: 10, y: 0 },
    { x: 3, y: 4 },
  ]);
});

test("shared grips across line, circle and text retain their own editing semantics", () => {
  const entities = [
    {
      id: "l",
      type: "line",
      points: [
        { x: 5, y: 0 },
        { x: 20, y: 0 },
      ],
    },
    { id: "c", type: "circle", center: { x: 0, y: 0 }, radius: 5 },
    { id: "t", type: "text", point: { x: 5, y: 0 }, text: "A" },
  ];
  const moved = moveGripTargets(gripTargets(entities, { x: 5, y: 0 }), {
    x: 8,
    y: 0,
  });
  assert.equal(moved.length, 3);
  assert.deepEqual(moved[0].points[0], { x: 8, y: 0 });
  assert.equal(moved[1].radius, 8);
  assert.deepEqual(moved[1].center, { x: 0, y: 0 });
  assert.deepEqual(moved[2].point, { x: 8, y: 0 });
});

test("every supported demo object has editable grips", () => {
  for (const e of demoDocument().entities) assert.ok(grips(e).length, e.type);
});
test("text insertion grip preserves multiline text and formatting", () => {
  const e = { type: "text", point: { x: 0, y: 0 }, text: "A\nB", bold: true };
  const n = gripEntity(e, grips(e)[0], { x: 10, y: 20 });
  assert.deepEqual(n.point, { x: 10, y: 20 });
  assert.equal(n.text, e.text);
  assert.equal(n.bold, true);
  assert.deepEqual(e.point, { x: 0, y: 0 });
});
test("circle has center and four working radius grips", () => {
  const e = { type: "circle", center: { x: 0, y: 0 }, radius: 5 };
  assert.equal(grips(e).length, 5);
  for (const g of grips(e).slice(1))
    assert.equal(gripEntity(e, g, { x: 0, y: 12 }).radius, 12);
});
test("arc grip changes preserve the other two defining points for both directions", () => {
  for (const sweep of [Math.PI, -Math.PI]) {
    const e = {
      type: "arc",
      center: { x: 0, y: 0 },
      radius: 10,
      start: 0,
      sweep,
    };
    for (const g of grips(e).slice(1)) {
      const p = { x: g.p.x + 2, y: g.p.y + 1 };
      const n = gripEntity(e, g, p);
      for (const old of grips(e).slice(1)) {
        const expected = old.i === g.i ? p : old.p;
        assert.ok(Math.abs(dist(n.center, expected) - n.radius) < 1e-7);
      }
      assert.ok(
        dist(
          polar(n.center, n.radius, n.start),
          g.i === 0 ? p : grips(e)[1].p,
        ) < 1e-7,
      );
    }
  }
});

test("viewport corner resizing crops without moving the model on paper", async () => {
  const { viewportCamera } = await import("../src/layout.js");
  const e = {
    type: "viewport",
    points: [
      { x: 20, y: 30 },
      { x: 300, y: 200 },
    ],
    viewCenter: { x: 1200, y: 3400 },
    viewScale: 0.02,
    locked: true,
  };
  const paper = { x: 180, y: 120, scale: 2 };
  const before = viewportCamera(e, paper, 1000, 700);
  for (const i of [0, 1]) {
    for (const p of [
      { x: 60, y: 70 },
      { x: 350, y: 250 },
    ]) {
      const resized = gripEntity(e, grips(e)[i], p);
      const after = viewportCamera(resized, paper, 1000, 700);
      assert.ok(Math.abs(after.x - before.x) < 1e-8);
      assert.ok(Math.abs(after.y - before.y) < 1e-8);
      assert.equal(after.scale, before.scale);
      assert.equal(resized.locked, true);
      assert.deepEqual(resized.points[1 - i], e.points[1 - i]);
    }
  }
});
