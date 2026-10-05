import test from "node:test";
import assert from "node:assert/strict";
import { Editor } from "../src/editor.js";
import { structureTools } from "../src/structure-tools.js";
import { applyEditingChange } from "../src/editing-tools.js";
import { createBlock } from "../src/blocks.js";
import { DocumentSession } from "../src/document-session.js";
import { demoDocument } from "../src/demo-document.js";
const a = { id: "a", type: "line", points: [{ x: 0, y: 0 }, { x: 10, y: 0 }], color: "#123456", lineType: "DASHED" };
const b = { ...a, id: "b", points: [{ x: 10, y: 0 }, { x: 10, y: 10 }] };
function setup(entities = [a, b], ids = ["a", "b"]) {
  const doc = demoDocument(); doc.entities = entities.map((e) => structuredClone({ space: "model", ...e, layer: doc.layers[0].id }));
  const session = new DocumentSession(doc), messages = []; let selection = ids, fail = false;
  const editor = new Editor({ tools: structureTools,
    getContext: () => ({ entities: session.document.entities.filter((e) => selection.includes(e.id)) }),
    setSelection: (ids) => { selection = ids; }, notify: (m) => messages.push(m),
    applyChange(change) { if (fail) throw Error("failed"); session.commit(change.label, (d) => { d.entities = applyEditingChange(d.entities, change); }); },
  });
  return { editor, session, messages, select(ids) { selection = ids; }, fail(v) { fail = v; }, get selection() { return selection; } };
}
const enter = (f, text = "") => f.editor.dispatch({ type: "text", text });
test("JOIN joins current selection atomically with style and reversible history", () => {
  const f = setup(), before = structuredClone(f.session.document); f.editor.start("JOIN"); enter(f);
  const after = structuredClone(f.session.document), joined = after.entities[0];
  assert.equal(joined.type, "polyline"); assert.equal(joined.points.length, 3);
  assert.equal(joined.color, a.color); assert.equal(joined.lineType, a.lineType);
  assert.deepEqual(f.selection, [joined.id]); assert.equal(f.editor.state, null);
  assert.equal(f.session.history.past.length, 1); assert.deepEqual(f.session.undo(), before); assert.deepEqual(f.session.redo(), after);
});
test("JOIN command-first waits for Enter, uses latest selection and rejects disconnected sources", () => {
  const f = setup([a, { ...b, id: "bad", points: [{ x: 20, y: 20 }, { x: 30, y: 30 }] }, b], []);
  f.editor.start("JOIN"); enter(f, "0,0"); enter(f); assert.equal(f.editor.state.phase, "select");
  f.select(["a", "bad"]); enter(f); assert.equal(f.session.history.past.length, 0);
  f.select(["a", "b"]); enter(f); assert.equal(f.editor.state, null); assert.equal(f.session.document.entities.length, 2);
});
test("EXPLODE processes polylines, block values and dimensions in one transaction", () => {
  const polyline = { ...a, id: "poly", type: "polyline", points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], closed: false };
  const block = createBlock([{ id: "text", type: "text", layer: "walls", point: { x: 0, y: 0 }, height: 2, text: "Default", attributeTag: "NAME" }], "Test", { x: 0, y: 0 }, "walls");
  block.id = "block"; block.values = { NAME: "Actual" };
  const dimension = { id: "dim", type: "dimension", kind: "aligned", points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 5 }], height: 2, precision: 0 };
  const f = setup([polyline, block, dimension], ["poly", "block", "dim"]), before = structuredClone(f.session.document);
  f.editor.start("EXPLODE"); enter(f); const after = structuredClone(f.session.document);
  assert.ok(after.entities.length > 3); assert.ok(after.entities.every((e) => !["polyline", "block", "dimension"].includes(e.type)));
  const value = after.entities.find((e) => e.type === "text" && e.text === "Actual");
  assert.ok(value); assert.equal(value.attributeTag, undefined); assert.equal(value.attributeSchema, undefined);
  assert.equal(new Set(after.entities.map((e) => e.id)).size, after.entities.length);
  assert.deepEqual(f.selection, after.entities.map((e) => e.id)); assert.equal(f.session.history.past.length, 1);
  assert.deepEqual(f.session.undo(), before); assert.deepEqual(f.session.redo(), after);
});
test("EXPLODE unsupported mixed selection cannot partially replace valid objects", () => {
  const poly = { ...a, id: "poly", type: "polyline", closed: false };
  const f = setup([poly, b], ["poly", "b"]), before = structuredClone(f.session.document);
  f.editor.start("EXPLODE"); enter(f); assert.deepEqual(f.session.document, before);
  assert.equal(f.editor.state.phase, "select"); assert.equal(f.session.history.past.length, 0);
  f.select(["poly"]); enter(f); assert.equal(f.editor.state, null);
});
test("structure failures retain selection/state; previews and cancel never alter history", () => {
  const f = setup(); f.editor.start("JOIN"); const state = structuredClone(f.editor.state);
  f.fail(true); assert.throws(() => enter(f), /failed/); assert.deepEqual(f.editor.state, state); assert.deepEqual(f.selection, ["a", "b"]);
  assert.deepEqual(f.editor.preview({ x: 0, y: 0 }), []); f.editor.cancel(); assert.equal(f.session.history.past.length, 0);
  f.fail(false); f.editor.start("JOIN"); enter(f); assert.equal(f.session.history.past.length, 1);
});
