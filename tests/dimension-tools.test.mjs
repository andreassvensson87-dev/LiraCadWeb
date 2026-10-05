import test from "node:test";
import assert from "node:assert/strict";
import { Editor } from "../src/editor.js";
import { dimensionTools } from "../src/dimension-tools.js";
import { DocumentSession } from "../src/document-session.js";
import { applyEditingChange } from "../src/editing-tools.js";

const p = (x, y) => ({ x, y });
function harness(entities = []) {
  const session = new DocumentSession({ version: 1, name: "Test", layers: [{ id: "0", name: "0", color: "#ffffff" }], entities });
  let selected = entities, editable = entities, hit = entities[0], selection = [], fail = false;
  const messages = [];
  const creation = { layer: "0", space: "model", height: 17, precision: 2, color: "#112233", lineType: "DASHED" };
  const editor = new Editor({ tools: dimensionTools,
    getContext: () => ({ entities: selected, editableEntities: editable, hitEntity: hit, pointer: p(0, 0), creation }),
    applyChange: (change) => { if (fail) throw Error("rejected"); session.commit(change.label, (d) => { d.entities = applyEditingChange(d.entities, change); }); editable = session.document.entities; },
    setSelection: (ids) => { selection = ids; }, notify: (message) => messages.push(message),
  });
  return { editor, session, messages, creation, point: (point) => editor.dispatch({ type: "point", point }), text: (text) => editor.dispatch({ type: "text", text, cursor: p(0, 0) }),
    select: (value) => { selected = value; }, hit: (value) => { hit = value; }, editable: (value) => { editable = value; }, fail: (value) => { fail = value; }, selection: () => selection };
}

for (const name of ["DIMLINEAR", "DIMALIGNED"]) test(`${name} creates one styled chain with relative input and reversible history`, () => {
  const h = harness(); h.editor.start(name);
  h.text(""); assert.match(h.messages.at(-1), /minst två/);
  h.text("0,0"); h.text("@10,10"); h.text("@10,10"); h.point(p(20, 20));
  assert.equal(h.editor.state.points.length, 3);
  h.text(""); const state = structuredClone(h.editor.state), document = structuredClone(h.session.document);
  assert.equal(h.editor.preview(p(10, 40))[0].type, "dimension");
  assert.deepEqual(h.editor.state, state); assert.deepEqual(h.session.document, document);
  h.point(p(10, 40));
  const dimension = h.session.document.entities[0];
  assert.equal(dimension.chain, true); assert.equal(dimension.points.length, 4);
  for (const [key, value] of Object.entries(h.creation)) assert.deepEqual(dimension[key], value);
  assert.deepEqual(h.selection(), [dimension.id]); assert.equal(h.editor.state, null);
  assert.equal(h.session.history.past.length, 1); h.session.undo(); assert.equal(h.session.document.entities.length, 0);
  h.session.redo(); assert.deepEqual(h.session.document.entities[0], dimension);
});

test("failed chain commit retains placement input and selection for retry", () => {
  const h = harness(); h.editor.start("DIMLINEAR"); h.point(p(0, 0)); h.point(p(10, 0)); h.text("");
  const state = h.editor.state; h.fail(true);
  assert.throws(() => h.point(p(5, 20)), /rejected/);
  assert.equal(h.editor.state, state); assert.deepEqual(h.selection(), []); assert.equal(h.session.history.past.length, 0);
  h.fail(false); h.point(p(5, 20)); assert.equal(h.session.document.entities.length, 1);
});

test("DIMCONTINUE keeps source ID, chosen end, pending style and reversible steps", () => {
  const h = harness(); h.editor.start("DIMLINEAR"); h.point(p(0, 0)); h.point(p(10, 0)); h.text(""); h.point(p(5, 20));
  const original = structuredClone(h.session.document.entities[0]); h.select([original]); h.editor.start("DIMCONTINUE");
  h.text("B"); assert.equal(h.editor.state.end, 0); assert.deepEqual(h.editor.state.points[0], p(0, 0));
  h.editor.state.source.height = 25; h.text("@-10,0");
  const dimension = h.session.document.entities[0];
  assert.equal(dimension.id, original.id); assert.equal(dimension.height, 25); assert.equal(dimension.points.length, 4);
  assert.equal(h.editor.state.end, 1); assert.equal(h.session.history.past.length, 2);
  h.editable([]); const state = h.editor.state; h.point(p(30, 0)); assert.equal(h.editor.state, state); assert.equal(h.session.history.past.length, 2);
  h.text("V"); assert.equal(h.editor.state.phase, "chainPick"); assert.deepEqual(h.selection(), []);
  h.hit(original); h.point(p(0, 0)); assert.equal(h.editor.state.phase, "chainPick");
  h.editable([dimension]); h.hit(dimension); h.point(p(0, 0)); assert.equal(h.editor.state.phase, "chainPoints");
  h.text(""); assert.equal(h.editor.state, null); assert.deepEqual(h.selection(), [original.id]);
  h.session.undo(); assert.deepEqual(h.session.document.entities[0], original);
});

for (const name of ["DIMRADIUS", "DIMDIAMETER"]) test(`${name} accepts preselection and clicked circles/arcs`, () => {
  const circle = { id: "circle", type: "circle", layer: "0", center: p(0, 0), radius: 10 };
  const h = harness([circle]); h.editor.start(name); assert.equal(h.editor.state.points.length, 2);
  h.point(p(20, 20)); assert.equal(h.session.document.entities[1].kind, name === "DIMRADIUS" ? "radius" : "diameter");
  h.select([]); h.editor.start(name); h.hit(null); h.point(p(10, 0)); assert.equal(h.editor.state.points.length, 0);
  h.hit({ ...circle, type: "arc" }); h.point(p(0, 10)); assert.ok(Math.abs(h.editor.state.points[1].y - 10) < 1e-8);
  h.fail(true); const state = h.editor.state; assert.throws(() => h.point(p(30, 30))); assert.equal(h.editor.state, state);
});

test("angular dimensions reject duplicate/collinear input and commit only after placement", () => {
  const h = harness(); h.editor.start("DIMANGULAR"); h.point(p(0, 0)); h.point(p(0, 0)); assert.equal(h.editor.state.points.length, 1);
  h.point(p(10, 0)); h.point(p(20, 0)); h.point(p(10, 10)); assert.equal(h.session.document.entities.length, 0);
  assert.equal(h.editor.state.points.length, 3);
  h.editor.cancel(); h.editor.start("DIMANGULAR"); h.point(p(0, 0)); h.point(p(10, 0)); h.point(p(0, 10));
  assert.equal(h.editor.preview(p(20, 20))[0].kind, "angular"); h.point(p(20, 20));
  assert.equal(h.session.document.entities[0].points.length, 4); assert.equal(h.session.history.past.length, 1);
});
