import test from "node:test";
import assert from "node:assert/strict";
import { createCursorController } from "../src/editor/cursor-controller.js";
import { createEditorState } from "../src/editor/editor-state.js";
import { createCommandController } from "../src/editor/command-controller.js";
import { createLocalSnapIndex } from "../src/editor/local-snapping.js";

function fixture({ osnap = true, gridSnap = false, picking = "base" } = {}) {
  const entities = [
    {
      id: "line",
      type: "line",
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
    },
    { id: "circle", type: "circle", center: { x: 200, y: 50 }, radius: 20 },
    {
      id: "vertical",
      type: "line",
      points: [
        { x: 25, y: -50 },
        { x: 25, y: 50 },
      ],
    },
  ];
  const cache = createLocalSnapIndex(entities);
  const state = createEditorState();
  Object.assign(state, {
    tool: {
      name: "WBLOCK",
      phase: picking === "base" ? "dialogBase" : "select",
      points: [],
    },
    osnap,
    gridSnap,
    polarEnabled: false,
    tracking: false,
    camera: { scale: 2 },
    mouse: { x: 20, y: 20 },
    width: 500,
    height: 500,
  });
  let accepted = null,
    feedback = "";
  const wblockDialog = { picking, resume: (point) => (accepted = point) };
  const cursor = createCursorController({
    state,
    schedule: () => {},
    getSnapCache: () => cache,
    getDocument: () => ({ entities }),
    getPolarStep: () => 45,
    gridStep: () => 50,
    reportCursor: (value) => {
      feedback = value.snap?.kind || "";
    },
  });
  // This fixture advances the cursor explicitly, so it needs no live expiry timer.
  cursor.dispose();
  const commands = createCommandController({
    state,
    wblockDialog,
    editor: { owns: () => false },
  });
  return {
    move(point) {
      state.rawCursor = point;
      cursor.resolveCursor();
      return { cursor: state.cursor, snap: state.snap, feedback };
    },
    click() {
      commands.acceptPoint(state.cursor);
      return accepted;
    },
  };
}

test("WBLOCK base picker snaps to endpoints, midpoints, centers and intersections and accepts the snapped point", () => {
  const f = fixture();
  for (const [raw, expected] of [
    [
      { x: 98, y: 2 },
      { x: 100, y: 0 },
    ],
    [
      { x: 49, y: 2 },
      { x: 50, y: 0 },
    ],
    [
      { x: 201, y: 52 },
      { x: 200, y: 50 },
    ],
    [
      { x: 26, y: 2 },
      { x: 25, y: 0 },
    ],
  ]) {
    const result = f.move(raw);
    assert.equal(result.snap?.mode, "object");
    assert.deepEqual(result.cursor, expected);
    assert.ok(result.feedback);
    assert.deepEqual(f.click(), expected);
  }
});
test("WBLOCK base picker respects disabled OSNAP and optional grid snap", () => {
  const f = fixture({ osnap: false }),
    raw = { x: 98, y: 2 };
  assert.deepEqual(f.move(raw).cursor, raw);
  assert.deepEqual(f.click(), raw);
  const grid = fixture({ osnap: false, gridSnap: true });
  assert.deepEqual(grid.move(raw).cursor, { x: 100, y: 0 });
  assert.deepEqual(grid.click(), { x: 100, y: 0 });
});
test("WBLOCK object selection does not activate point snapping", () => {
  const f = fixture({ picking: "objects" }),
    raw = { x: 98, y: 2 };
  const result = f.move(raw);
  assert.equal(result.snap, null);
  assert.deepEqual(result.cursor, raw);
});
