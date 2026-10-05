import test from "node:test";
import assert from "node:assert/strict";
import { Editor } from "../src/editor.js";
import { cornerTools } from "../src/corner-tools.js";
import { vertexTools } from "../src/vertex-tools.js";
import { applyEditingChange } from "../src/editing-tools.js";
import { DocumentSession } from "../src/document-session.js";
import { demoDocument } from "../src/demo-document.js";
const line = (id, points) => ({ id, type: "line", points, color: "#123456", lineType: "DASHED", space: "model" });
const a = line("a", [{ x: 0, y: 0 }, { x: 100, y: 0 }]);
const b = line("b", [{ x: 0, y: 0 }, { x: 0, y: 100 }]);
const polyline = { ...a, type: "polyline", points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }], closed: false };
function setup(entities = [a, b], selection = ["a", "b"]) {
  const doc = demoDocument(); doc.entities = entities.map((e) => structuredClone({ ...e, layer: doc.layers[0].id }));
  const session = new DocumentSession(doc), messages = [];
  let selected = selection, hitId = null, allowed = doc.entities.map((e) => e.id), failed = false;
  const editor = new Editor({
    tools: { ...cornerTools, ...vertexTools },
    getContext: () => ({
      entities: session.document.entities.filter((e) => selected.includes(e.id) && allowed.includes(e.id)),
      editableEntities: session.document.entities.filter((e) => allowed.includes(e.id)),
      hitEntity: session.document.entities.find((e) => e.id === hitId && allowed.includes(e.id)),
    }),
    setSelection: (ids) => { selected = ids; }, notify: (m) => messages.push(m),
    applyChange(change) {
      if (failed) throw Error("transaction failed");
      session.commit(change.label, (d) => { d.entities = applyEditingChange(d.entities, change); });
    },
  });
  return { editor, session, messages, select(ids) { selected = ids; }, hit(id) { hitId = id; }, allow(ids) { allowed = ids; }, fail(v) { failed = v; }, get selected() { return selected; } };
}
const text = (f, text) => f.editor.dispatch({ type: "text", text, cursor: { x: 0, y: 50 } });
const point = (f, x, y) => f.editor.dispatch({ type: "point", point: { x, y } });

test("FILLET and CHAMFER preselection commit full result once and undo/redo preserves styles", () => {
  for (const name of ["FILLET", "CHAMFER"]) {
    const f = setup(), before = structuredClone(f.session.document); f.editor.start(name);
    text(f, name === "FILLET" ? "10" : "10,20");
    const after = structuredClone(f.session.document);
    assert.equal(after.entities.length, 3); assert.equal(f.editor.state, null);
    assert.deepEqual(f.selected, after.entities.map((e) => e.id));
    assert.equal(after.entities[2].type, name === "FILLET" ? "arc" : "line");
    for (const e of after.entities.slice(0, 2)) {
      for (const key of ["layer", "space", "color", "lineType"]) assert.equal(e[key], before.entities[0][key]);
    }
    assert.equal(f.session.history.past.length, 1);
    assert.deepEqual(f.session.undo(), before); assert.deepEqual(f.session.redo(), after);
  }
});
test("corner measures accept zero, remember first distance independently, and reject invalid values", () => {
  const f = setup(); f.editor.start("FILLET");
  for (const input of ["-1", "NaN", "Infinity", "1,2", "1,2,3", ","]) {
    text(f, input); assert.equal(f.editor.state.phase, "cornerSize");
  }
  text(f, "0"); assert.equal(f.session.document.entities.length, 2);
  f.editor.start("CHAMFER"); text(f, "10,20"); f.editor.start("CHAMFER");
  assert.match(f.editor.describe().prompt, /<10>/); assert.equal(f.editor.state.value, 10);
  f.editor.start("FILLET"); assert.match(f.editor.describe().prompt, /<0>/);
  f.editor.cancel(); assert.equal(f.session.history.past.length, 1);
});
test("corner clicked picking uses hit identity and chosen side; previews/cancel never commit", () => {
  const crossing = line("a", [{ x: -100, y: 0 }, { x: 100, y: 0 }]);
  const f = setup([crossing, b], []); f.editor.start("CHAMFER");
  point(f, 10, 0); assert.equal(f.editor.state.phase, "cornerSize"); text(f, "10,20");
  f.hit(null); point(f, 10, 0); assert.match(f.messages.at(-1), /rak linje/);
  f.hit("a"); point(f, -50, 0); const state = structuredClone(f.editor.state);
  f.hit("a"); assert.deepEqual(f.editor.preview({ x: 0, y: 50 }), []);
  point(f, 50, 0); assert.match(f.messages.at(-1), /olika/);
  f.hit("b"); const preview = f.editor.preview({ x: 0, y: 50 });
  assert.equal(preview.length, 3); assert.deepEqual(f.editor.state, state);
  assert.equal(f.session.history.past.length, 0);
  text(f, "0,50"); assert.equal(f.editor.state, null);
  assert.deepEqual(f.session.document.entities[0].points, [{ x: -100, y: 0 }, { x: -10, y: 0 }]);
  assert.equal(f.session.history.past.length, 1);
  f.editor.start("FILLET"); f.editor.cancel(); assert.equal(f.session.history.past.length, 1);
});
test("corner geometry errors keep first choice and allow choosing a different second line", () => {
  const parallel = line("parallel", [{ x: 0, y: 10 }, { x: 100, y: 10 }]);
  const f = setup([a, b, parallel], []); f.editor.start("FILLET"); text(f, "10"); f.hit("a"); point(f, 50, 0);
  f.hit("parallel"); point(f, 50, 10); assert.match(f.messages.at(-1), /parallella/);
  assert.equal(f.editor.state.first.id, "a"); assert.equal(f.session.history.past.length, 0);
  f.hit("b"); point(f, 0, 50); assert.equal(f.editor.state, null);
});
test("preselected corners read current geometry and reject missing or locked sources", () => {
  const f = setup(); f.editor.start("FILLET"); f.session.commit("style", (d) => { d.entities[0].color = "#abcdef"; });
  text(f, "1000"); assert.match(f.messages.at(-1), /för stort/);
  assert.equal(f.editor.state.phase, "cornerPick"); f.editor.cancel(); f.editor.start("FILLET");
  f.allow(["b"]); text(f, "10"); assert.match(f.messages.at(-1), /Objektvalet/);
  assert.equal(f.session.document.entities.length, 2);
  f.allow(["a", "b"]); f.hit("b"); point(f, 0, 50);
  assert.equal(f.session.document.entities[0].color, "#abcdef");
});
test("corner transaction failure leaves input, selection and defaults unchanged for retry", () => {
  const f = setup(); f.editor.start("FILLET"); const state = structuredClone(f.editor.state), before = structuredClone(f.session.document);
  f.fail(true); assert.throws(() => text(f, "10"), /transaction failed/);
  assert.deepEqual(f.editor.state, state); assert.deepEqual(f.selected, ["a", "b"]);
  assert.equal(f.editor.defaults.FILLET, undefined); assert.deepEqual(f.session.document, before);
  f.fail(false); text(f, "10"); assert.equal(f.editor.defaults.FILLET.value, 10);
});
test("vertex preselection accepts exact input, preserves properties and ends after one edit", () => {
  for (const name of ["PINSERT", "PDELETE"]) {
    const f = setup([polyline], ["a"]), before = structuredClone(f.session.document);
    f.editor.start(name); text(f, name === "PINSERT" ? "50,20" : "100,0");
    const after = structuredClone(f.session.document);
    assert.equal(after.entities[0].points.length, name === "PINSERT" ? 4 : 2);
    for (const key of ["layer", "space", "color", "lineType", "id"]) assert.equal(after.entities[0][key], before.entities[0][key]);
    assert.equal(f.editor.state, null); assert.deepEqual(f.selected, ["a"]);
    assert.deepEqual(f.session.undo(), before); assert.deepEqual(f.session.redo(), after);
  }
});
test("vertex command-first selection requires exactly one polyline and Enter", () => {
  const f = setup([polyline, b], []); f.editor.start("PINSERT"); point(f, 50, 20); text(f, "50,20");
  assert.equal(f.editor.state.phase, "select"); f.select(["a", "b"]); text(f, ""); assert.match(f.messages.at(-1), /exakt en/);
  f.select(["b"]); text(f, ""); assert.equal(f.editor.state.phase, "select");
  f.select(["a"]); text(f, ""); text(f, "junk"); assert.equal(f.editor.state.phase, "points");
  point(f, 50, 20); assert.equal(f.session.document.entities[1].id, "a");
  assert.equal(f.session.history.past.length, 1);
});
test("vertex geometry guards preserve draft and allow corrected input", () => {
  const f = setup([polyline], ["a"]); f.editor.start("PINSERT"); point(f, 0, 0);
  assert.match(f.messages.at(-1), /sammanfaller/); assert.equal(f.session.history.past.length, 0);
  point(f, 50, 20); assert.equal(f.editor.state, null);
  const g = setup([a], ["a"]); g.editor.start("PDELETE"); assert.equal(g.editor.state.phase, "select");
  for (const entity of [{ ...polyline, points: a.points }, { ...polyline, closed: true }, { ...polyline, bulges: [0.5, 0] }]) {
    const h = setup([entity], ["a"]); h.editor.start("PDELETE"); point(h, 0, 0);
    assert.equal(h.editor.state.phase, "points"); assert.equal(h.session.history.past.length, 0);
  }
});
test("vertex source loss and failed validation keep input available without history changes", () => {
  const f = setup([polyline], ["a"]); f.editor.start("PINSERT"); f.allow([]); point(f, 50, 20);
  assert.match(f.messages.at(-1), /Objektvalet/); f.allow(["a"]);
  const state = structuredClone(f.editor.state); assert.throws(() => text(f, "10000000000000,0"), /ogiltig ritning/);
  assert.deepEqual(f.editor.state, state); assert.deepEqual(f.selected, ["a"]);
  assert.equal(f.session.history.past.length, 0); f.editor.cancel();
  assert.deepEqual(f.editor.preview({ x: 50, y: 20 }), []);
});
