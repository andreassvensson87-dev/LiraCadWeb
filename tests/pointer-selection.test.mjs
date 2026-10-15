import test from "node:test";
import assert from "node:assert/strict";
import { createPointerController } from "../src/editor/pointer-controller.js";
import { createEditorState } from "../src/editor/editor-state.js";
const line = (id, a, b, props = {}) => ({
  id,
  type: "line",
  layer: "0",
  points: [a, b],
  ...props,
});
const p = (x, y) => ({ x, y });
function fixture(entities, hit = () => null) {
  const state = createEditorState(),
    painted = [];
  const doc = {
    version: 1,
    name: "Test",
    layers: [{ id: "0", name: "0", color: "#ffffff" }],
    entities,
  };
  const before = structuredClone(doc),
    noop = () => {};
  const pointer = createPointerController({
    state,
    textEditor: { active: null },
    moveCursor: (event) => {
      state.mouse = { ...event.point };
      state.rawCursor = { ...event.point };
      state.cursor = { ...event.point };
    },
    hit,
    getDocument: () => doc,
    getInteractionEntities: () => doc.entities,
    editable: (e) => !e.hidden && !e._xrefId,
    screen: (p) => p,
    capturePointer: noop,
    blurCommand: noop,
    setCursor: noop,
    setTrimShift: noop,
    schedule: () => painted.push(structuredClone(state.drag)),
    update: noop,
    syncViewport: noop,
    log: noop,
  });
  const event = (x, y, timeStamp, extra = {}) => ({
    point: p(x, y),
    timeStamp,
    button: 0,
    pointerId: 1,
    shiftKey: false,
    ...extra,
  });
  return { pointer, state, doc, before, painted, event };
}
test("pointer controller keeps a moving first click pending, paints its rectangle during movement, and completes on the second click", () => {
  const f = fixture([
    line("inside", p(120, 120), p(140, 140)),
    line("outside", p(250, 250), p(270, 270)),
    line("reference", p(120, 120), p(130, 130), { _xrefId: "ref" }),
  ]);
  f.pointer.pointerdown(f.event(100, 100, 100));
  f.pointer.pointermove(f.event(109, 102, 140));
  f.pointer.pointerup(f.event(110, 103, 160));
  assert.equal(f.state.drag.phase, "corner");
  assert.equal(f.state.selection.size, 0);
  f.pointer.pointermove(f.event(180, 180, 180));
  assert.equal(f.painted.at(-1).kind, "select");
  assert.equal(f.painted.at(-1).moved, true);
  assert.deepEqual(f.state.drag.world, p(100, 100));
  f.pointer.pointerdown(f.event(180, 180, 200));
  f.pointer.pointerup(f.event(180, 180, 220));
  assert.equal(f.state.drag, null);
  assert.deepEqual([...f.state.selection], ["inside"]);
  assert.deepEqual(f.doc, f.before);
});
test("dragging still selects right-to-left crossing geometry and preserves shift additions", () => {
  const f = fixture([
    line("crossed", p(50, 125), p(150, 125)),
    line("retained", p(400, 400), p(450, 450)),
  ]);
  f.state.selection.add("retained");
  f.pointer.pointerdown(f.event(180, 180, 100, { shiftKey: true }));
  f.pointer.pointermove(f.event(100, 100, 130, { shiftKey: true }));
  assert.equal(f.painted.at(-1).moved, true);
  f.pointer.pointerup(f.event(100, 100, 450, { shiftKey: true }));
  assert.deepEqual([...f.state.selection], ["retained", "crossed"]);
  assert.equal(f.state.drag, null);
  assert.deepEqual(f.doc, f.before);
});
test("click selection uses the object at pointerdown when the mouse continues moving", () => {
  const a = line("pressed", p(100, 100), p(100, 150)),
    b = line("passed", p(109, 100), p(109, 150));
  const f = fixture([a, b], (point) => (point.x <= 104 ? a : b));
  f.pointer.pointerdown(f.event(100, 110, 100));
  f.pointer.pointermove(f.event(109, 110, 120));
  f.pointer.pointerup(f.event(109, 110, 150));
  assert.deepEqual([...f.state.selection], ["pressed"]);
  assert.equal(f.state.drag, null);
});

test("a fast first click with large movement keeps its window alive until the second pointerdown", () => {
  const f = fixture([line("inside", p(120, 120), p(140, 140))]);
  f.pointer.pointermove(f.event(90, 90, 90));
  f.pointer.pointerdown(f.event(100, 100, 100));
  f.pointer.pointermove(f.event(300, 280, 150));
  assert.equal(f.painted.at(-1).moved, true);
  f.pointer.pointerup(f.event(350, 320, 220));
  assert.equal(f.state.drag.phase, "corner");
  assert.deepEqual(f.state.drag.start, p(100, 100));
  assert.equal(f.state.selection.size, 0);
  f.pointer.pointermove(f.event(200, 200, 240));
  assert.equal(f.painted.at(-1).moved, true);
  f.pointer.pointerup(f.event(200, 200, 250));
  assert.equal(f.state.drag.phase, "corner");
  f.pointer.pointerdown(f.event(200, 200, 270));
  f.pointer.pointerup(f.event(200, 200, 290));
  assert.equal(f.state.drag, null);
  assert.deepEqual([...f.state.selection], ["inside"]);
  assert.deepEqual(f.doc, f.before);
});
