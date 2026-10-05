import test from "node:test";
import assert from "node:assert/strict";
import { Editor } from "../src/editor.js";
import { drawingTools } from "../src/drawing-tools.js";
import { History } from "../src/history.js";
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

test("RECTANG rejects flat rectangles, previews and commits exact relative corners", () => {
  const { editor, changes, messages } = setup();
  editor.start("RECTANG");
  assert.match(editor.describe().prompt, /första hörnet/);
  text(editor, "5,10");
  assert.match(editor.describe().prompt, /motsatt hörn/);
  text(editor, "@0,20");
  text(editor, "");
  text(editor, "invalid");
  assert.equal(changes.length, 0);
  assert.equal(editor.state.points.length, 1);
  assert.equal(messages.length, 2);
  const preview = editor.preview({ x: 25, y: 40 });
  preview[0].points[0].x = 99;
  assert.equal(editor.state.points[0].x, 5);
  text(editor, "@20,30");
  assert.deepEqual(changes[0].entities[0], {
    type: "polyline", closed: true,
    points: [{ x: 5, y: 10 }, { x: 25, y: 10 }, { x: 25, y: 40 }, { x: 5, y: 40 }],
  });
  assert.equal(editor.state, null);
});

test("PLINE mixes lines and arcs, rejects collinear arcs and ends as one object", () => {
  const { editor, changes, messages } = setup();
  editor.start("PLINE");
  text(editor, "0,0");
  text(editor, "@10,0");
  text(editor, "a");
  text(editor, "15,5");
  assert.match(editor.describe().prompt, /slutpunkt/);
  text(editor, "20,10");
  assert.equal(editor.state.points.length, 2);
  assert.match(messages.at(-1), /rät linje/);
  const preview = editor.preview({ x: 20, y: 0 });
  assert.equal(preview[1].type, "arc");
  preview[0].points[0].x = 99;
  assert.equal(editor.state.points[0].x, 0);
  text(editor, "20,0");
  const bulge = editor.state.bulges[1];
  assert.ok(Math.abs(bulge) > 0);
  text(editor, "l");
  text(editor, "@0,10");
  assert.equal(changes.length, 0);
  text(editor, "");
  assert.equal(editor.state, null);
  assert.equal(changes.length, 1);
  assert.deepEqual(changes[0].entities[0].bulges, [0, bulge, 0]);
  assert.equal(changes[0].entities[0].closed, false);
});

test("PLINE U removes pending midpoint then segment, L discards pending arc", () => {
  const { editor, changes, messages } = setup();
  editor.start("PLINE");
  text(editor, "u");
  text(editor, "");
  assert.match(messages.at(-1), /minst 2/);
  point(editor, 0, 0);
  point(editor, 10, 0);
  point(editor, 10, 0);
  assert.equal(editor.state.points.length, 2);
  text(editor, "a");
  point(editor, 10, 0);
  assert.equal(editor.state.arcMid, null);
  point(editor, 15, 5);
  text(editor, "");
  assert.match(messages.at(-1), /slutpunkt/);
  assert.equal(changes.length, 0);
  text(editor, "u");
  assert.equal(editor.state.arcMid, null);
  assert.equal(editor.state.points.length, 2);
  point(editor, 15, 5);
  point(editor, 20, 0);
  text(editor, "u");
  assert.equal(editor.state.points.length, 2);
  assert.deepEqual(editor.state.bulges, [0]);
  point(editor, 15, 5);
  text(editor, "l");
  assert.equal(editor.state.arcMid, null);
  point(editor, 10, 10);
  text(editor, "c");
  assert.deepEqual(changes[0].entities[0].bulges, [0, 0]);
  assert.equal(changes[0].entities[0].closed, true);
});

test("PLINE requires three vertices to close and closes arc path with a straight edge", () => {
  const { editor, changes, messages } = setup();
  editor.start("PLINE");
  point(editor, 0, 0);
  point(editor, 10, 0);
  text(editor, "c");
  assert.match(messages.at(-1), /minst tre/);
  assert.equal(changes.length, 0);
  text(editor, "a");
  point(editor, 15, 5);
  point(editor, 10, 10);
  text(editor, "c");
  const entity = changes[0].entities[0];
  assert.equal(entity.closed, true);
  assert.equal(entity.points.length, 3);
  assert.ok(Math.abs(entity.bulges[1]) > 0);
  assert.equal(entity.bulges[2] || 0, 0);
});

test("RECTANG and PLINE cancellation and switching discard unfinished geometry", () => {
  const { editor, changes } = setup();
  editor.start("RECTANG");
  point(editor, 0, 0);
  editor.cancel();
  assert.deepEqual(editor.preview({ x: 10, y: 10 }), []);
  editor.start("PLINE");
  point(editor, 0, 0);
  point(editor, 10, 0);
  text(editor, "a");
  point(editor, 15, 5);
  editor.start("RECTANG");
  assert.deepEqual(editor.state.points, []);
  editor.cancel();
  assert.equal(changes.length, 0);
});

test("new drawing tools preserve input if the document transaction fails", () => {
  for (const name of ["RECTANG", "PLINE"]) {
    const editor = new Editor({ tools: drawingTools, applyChange() { throw Error("failed"); } });
    editor.start(name);
    point(editor, 0, 0);
    if (name === "PLINE") point(editor, 10, 10);
    const before = structuredClone(editor.state);
    assert.throws(() => name === "PLINE" ? text(editor, "") : point(editor, 10, 10), /failed/);
    assert.deepEqual(editor.state, before);
  }
});

test("RECTANG and mixed PLINE commit through history and undo/redo as whole objects", () => {
  for (const name of ["RECTANG", "PLINE"]) {
    const history = new History();
    let doc = { entities: [] };
    const editor = new Editor({
      tools: drawingTools,
      applyChange(change) {
        const before = structuredClone(doc);
        doc.entities.push(...change.entities.map((entity) => ({
          ...entity, id: "new-object", layer: "walls", color: "#123456",
          lineType: "DASHED", space: "layout-1",
        })));
        history.commit(before, doc, change.label);
      },
    });
    editor.start(name);
    point(editor, 0, 0);
    point(editor, 10, 10);
    if (name === "PLINE") {
      text(editor, "a");
      point(editor, 15, 15);
      point(editor, 20, 10);
      text(editor, "c");
    }
    const completed = structuredClone(doc);
    assert.equal(history.past.length, 1);
    assert.equal(doc.entities.length, 1);
    assert.equal(doc.entities[0].space, "layout-1");
    doc = history.undo();
    assert.deepEqual(doc.entities, []);
    doc = history.redo();
    assert.deepEqual(doc, completed);
    assert.equal(editor.state, null);
  }
});
