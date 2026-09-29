import test from "node:test";
import assert from "node:assert/strict";
import { Editor } from "../src/editor.js";
import { drawingTools } from "../src/drawing-tools.js";
function setup() {
  const changes = [],
    messages = [];
  const editor = new Editor({
    tools: drawingTools,
    applyChange: (c) => changes.push(c),
    notify: (m) => messages.push(m),
  });
  return { editor, changes, messages };
}
const point = (editor, x, y) =>
  editor.dispatch({ type: "point", point: { x, y } });
const text = (editor, text, cursor = { x: 100, y: 0 }) =>
  editor.dispatch({ type: "text", text, cursor });
test("LINE creates separate undoable segments and Enter finishes", () => {
  const { editor, changes } = setup();
  editor.start("LINE");
  point(editor, 0, 0);
  text(editor, "@10,0");
  text(editor, "@10,0");
  assert.equal(changes.length, 2);
  assert.deepEqual(changes[1].entities[0].points, [
    { x: 10, y: 0 },
    { x: 20, y: 0 },
  ]);
  text(editor, "");
  assert.equal(editor.state, null);
});
test("circle accepts typed radius and keeps state after invalid radius", () => {
  const { editor, changes, messages } = setup();
  editor.start("CIRCLE");
  point(editor, 5, 10);
  text(editor, "-1");
  assert.equal(changes.length, 0);
  assert.match(messages[0], /positiv/);
  text(editor, "25");
  assert.deepEqual(changes[0].entities[0], {
    type: "circle",
    center: { x: 5, y: 10 },
    radius: 25,
  });
  assert.equal(editor.state, null);
});
test("arc rejects collinear endpoint then completes with a valid one", () => {
  const { editor, changes, messages } = setup();
  editor.start("ARC");
  point(editor, 0, 0);
  point(editor, 5, 0);
  point(editor, 10, 0);
  assert.equal(changes.length, 0);
  assert.equal(editor.state.points.length, 2);
  assert.equal(messages.length, 1);
  point(editor, 5, 5);
  assert.equal(changes[0].entities[0].type, "arc");
  assert.equal(editor.state, null);
});
test("preview is transient, cancellation and switching do not add objects", () => {
  const { editor, changes } = setup();
  editor.start("CIRCLE");
  point(editor, 0, 0);
  const preview = editor.preview({ x: 10, y: 0 });
  preview[0].center.x = 99;
  assert.equal(editor.state.points[0].x, 0);
  assert.equal(changes.length, 0);
  editor.start("ARC");
  assert.equal(editor.state.points.length, 0);
  editor.cancel();
  assert.deepEqual(editor.preview({ x: 0, y: 0 }), []);
  assert.equal(editor.dispatch({ type: "text", text: "" }), false);
});
test("document transaction failure does not advance tool state", () => {
  const editor = new Editor({
    tools: drawingTools,
    applyChange: () => {
      throw Error("failed");
    },
  });
  editor.start("LINE");
  point(editor, 0, 0);
  assert.throws(() => point(editor, 10, 0), /failed/);
  assert.equal(editor.state.points.length, 1);
});
test("distance input follows cursor and duplicate line points do not commit", () => {
  const { editor, changes } = setup();
  editor.start("LINE");
  point(editor, 0, 0);
  point(editor, 0, 0);
  assert.equal(changes.length, 0);
  text(editor, "20", { x: 0, y: 10 });
  assert.ok(Math.abs(changes[0].entities[0].points[1].y - 20) < 1e-8);
  assert.deepEqual(editor.describe().properties, [
    "layer",
    "color",
    "lineType",
  ]);
});
