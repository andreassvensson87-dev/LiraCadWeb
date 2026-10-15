import test from "node:test";
import assert from "node:assert/strict";
import {
  beginSelectionGesture,
  moveSelectionGesture,
  releaseSelectionGesture,
} from "../src/editor/selection-gesture.js";
import {
  grips,
  gripEntity,
  gripTargets,
  moveGripTargets,
} from "../src/model/grips.js";
import { bounds } from "../src/model/entity-geometry.js";
const p = (x, y) => ({ x, y });
test("empty click retains the first corner; a second click finishes a window with the original world point and direction", () => {
  const first = beginSelectionGesture(p(10, 10), p(100, 200)),
    pending = releaseSelectionGesture(first, p(10, 10), p(100, 200), null);
  assert.equal(pending.kind, "pending");
  const moved = moveSelectionGesture(pending.gesture, p(50, 70)),
    result = releaseSelectionGesture(
      { ...moved, phase: "finish" },
      p(50, 70),
      p(500, -400),
      "ignored",
    );
  assert.equal(result.kind, "rectangle");
  assert.equal(result.crossing, false);
  assert.deepEqual(result.region, {
    minX: 100,
    maxX: 500,
    minY: -400,
    maxY: 200,
  });
  assert.deepEqual(first.world, p(100, 200));
});
test("drag selection works in both directions, including missing move events; a clicked object selects immediately", () => {
  const first = beginSelectionGesture(p(80, 10), p(800, 100), true),
    result = releaseSelectionGesture(first, p(10, 80), p(100, -600), null);
  assert.equal(result.kind, "rectangle");
  assert.equal(result.crossing, true);
  assert.equal(result.shift, true);
  assert.deepEqual(
    releaseSelectionGesture(first, p(80, 10), p(800, 100), "line"),
    { kind: "click", id: "line", shift: true },
  );
});
test("block move grip stays near geometry with a distant imported insertion point and applies displacement without changing its definition", () => {
  const block = {
      id: "b",
      type: "block",
      layer: "0",
      point: p(0, 0),
      rotation: 0,
      scale: 1,
      definition: {
        id: "def",
        name: "Imported",
        entities: [
          {
            id: "poly",
            type: "polyline",
            layer: "0",
            closed: true,
            points: [
              p(10000, 20000),
              p(11000, 20000),
              p(11000, 20500),
              p(10000, 20500),
            ],
          },
        ],
      },
      values: {},
    },
    before = JSON.stringify(block),
    g = grips(block).find((g) => g.kind === "blockMove");
  assert.deepEqual(g.p, p(10500, 20250));
  const moved = gripEntity(block, g, p(10600, 20450));
  assert.deepEqual(moved.point, p(100, 200));
  assert.deepEqual(bounds(moved), {
    minX: 10100,
    maxX: 11100,
    minY: 20200,
    maxY: 20700,
  });
  assert.equal(JSON.stringify(block), before);
  assert.deepEqual(
    moveGripTargets(gripTargets([block], g.p), p(10600, 20450))[0].point,
    p(100, 200),
  );
});

test("a brief moving click retains the first corner instead of completing a tiny rectangle", () => {
  const first = {
    ...beginSelectionGesture(p(100, 100), p(1000, 2000), false, 100),
    hitId: null,
  };
  const moved = moveSelectionGesture(first, p(109, 102), 140);
  assert.equal(moved.moved, true);
  const released = releaseSelectionGesture(
    moved,
    p(110, 103),
    p(1100, 1970),
    "passing-object",
    160,
  );
  assert.equal(released.kind, "pending");
  assert.deepEqual(released.gesture.world, p(1000, 2000));
  const second = moveSelectionGesture(released.gesture, p(20, 180), 400);
  const result = releaseSelectionGesture(
    { ...second, phase: "finish" },
    p(20, 180),
    p(200, 1200),
    null,
    450,
  );
  assert.equal(result.kind, "rectangle");
  assert.equal(result.crossing, true);
  assert.deepEqual(result.region, {
    minX: 200,
    maxX: 1000,
    minY: 1200,
    maxY: 2000,
  });
});
test("a held drag completes but a fast first click never completes based on distance alone", () => {
  const first = beginSelectionGesture(p(100, 100), p(1000, 2000), true, 100);
  assert.equal(
    releaseSelectionGesture(first, p(109, 103), p(1090, 1970), null, 450).kind,
    "rectangle",
  );
  assert.equal(
    releaseSelectionGesture(first, p(400, 320), p(4000, -200), null, 220).kind,
    "pending",
  );
});
test("a moving click selects the object pressed, rather than an object crossed during release", () => {
  const first = {
    ...beginSelectionGesture(p(100, 100), p(1000, 2000), false, 100),
    hitId: "pressed",
  };
  assert.deepEqual(
    releaseSelectionGesture(first, p(109, 103), p(1090, 1970), "passed", 150),
    { kind: "click", id: "pressed", shift: false },
  );
});
