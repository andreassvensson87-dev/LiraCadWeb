import test from "node:test";
import assert from "node:assert/strict";
import { Editor } from "../src/editor.js";
import { blockTools } from "../src/block-tools.js";
import { viewportTools } from "../src/viewport-tools.js";
import { DocumentSession } from "../src/document-session.js";
import { applyEditingChange } from "../src/editing-tools.js";
import { blockTemplates, createBlock } from "../src/blocks.js";

const p = (x, y) => ({ x, y });
const line = { id: "line", type: "line", layer: "0", points: [p(0, 0), p(10, 0)], color: "#123456", lineType: "DASHED" };
function harness(entities = [line]) {
  const session = new DocumentSession({ version: 1, name: "Test", layers: [{ id: "0", name: "0", color: "#ffffff" }], entities,
    layouts: [{ id: "paper", name: "Layout", width: 420, height: 297 }] });
  let ids = entities.map((e) => e.id), fail = false;
  const messages = [], creation = { layer: "0", space: "model", color: "#abcdef", lineType: "DOTTED" };
  const context = () => ({ entities: session.document.entities.filter((e) => ids.includes(e.id)), templates: blockTemplates(session.document), creation, modelCenter: p(5, 10) });
  const editor = new Editor({ tools: { ...blockTools, ...viewportTools }, getContext: context,
    applyChange: (change) => { if (fail) throw Error("rejected"); session.commit(change.label, (d) => {
      d.entities = applyEditingChange(d.entities, change);
      if (change.definitions) d.blocks = [...(d.blocks || []), ...change.definitions];
    }); },
    setSelection: (value) => { ids = value; }, notify: (message) => messages.push(message),
  });
  return { editor, session, messages, creation, selection: () => ids, select: (value) => { ids = value; }, fail: (value) => { fail = value; },
    text: (text) => editor.dispatch({ type: "text", text, cursor: p(0, 0) }), point: (point) => editor.dispatch({ type: "point", point }) };
}
test("BLOCK replaces selected sources and registers definition atomically with undo/redo", () => {
  const h = harness(); h.editor.start("BLOCK"); assert.equal(h.editor.state.phase, "blockName");
  h.text("bad name"); assert.equal(h.editor.state.phase, "blockName"); h.text("Fixture");
  const state = h.editor.state; h.fail(true); assert.throws(() => h.point(p(5, 0)), /rejected/);
  assert.equal(h.editor.state, state); assert.deepEqual(h.selection(), ["line"]); assert.equal(h.session.document.blocks, undefined);
  h.fail(false); h.point(p(5, 0)); const block = h.session.document.entities[0];
  assert.equal(block.type, "block"); assert.equal(block.definition.entities[0].points[0].x, -5);
  assert.equal(block.definition.entities[0].color, line.color); assert.equal(h.session.document.blocks[0].id, block.definition.id);
  assert.deepEqual(h.selection(), [block.id]); assert.equal(h.session.history.past.length, 1);
  h.session.undo(); assert.deepEqual(h.session.document.entities, [line]); assert.equal(h.session.document.blocks, undefined);
  h.session.redo(); assert.deepEqual(h.session.document.entities[0], block);
});
test("BLOCK supports command-first selection and rejects unsupported/empty sources", () => {
  const h = harness(); h.select([]); h.editor.start("BLOCK"); h.text(""); assert.equal(h.editor.state.phase, "select");
  h.select(["line"]); h.text(""); h.text("Fixture"); h.select([]); h.point(p(0, 0)); assert.equal(h.editor.state.phase, "points");
  assert.equal(h.session.history.past.length, 0);
  const block = createBlock([line], "Existing", p(0, 0), "0"); h.session.commit("Add", (d) => { d.entities.push(block); });
  h.select([block.id]); h.point(p(0, 0)); assert.match(h.messages.at(-1), /nästlade/);
});
test("BLOCK rechecks uniqueness before commit", () => {
  const h = harness(); h.editor.start("BLOCK"); h.text("Fixture");
  h.session.commit("Concurrent definition", (d) => { d.blocks = [createBlock([line], "fixture", p(0, 0), "0").definition]; });
  h.point(p(0, 0)); assert.equal(h.editor.state.phase, "points"); assert.match(h.messages.at(-1), /redan/); assert.equal(h.session.document.entities[0].type, "line");
});
test("INSERT resolves case-insensitive name, current definition and defaults without mutating preview", () => {
  const block = createBlock([line], "Fixture", p(0, 0), "0"), h = harness([block]);
  h.editor.start("INSERT"); h.text("missing"); assert.equal(h.editor.state.phase, "insertName"); h.text("fixture"); assert.deepEqual(h.selection(), []);
  h.session.commit("Definition", (d) => { d.entities[0].definition.entities[0].points[1].x = 50; });
  const original = structuredClone(h.session.document), state = structuredClone(h.editor.state);
  assert.equal(h.editor.preview(p(20, 20))[0].definition.entities[0].points[1].x, 50);
  assert.deepEqual(h.session.document, original); assert.deepEqual(h.editor.state, state);
  h.point(p(20, 20)); const inserted = h.session.document.entities[1];
  assert.notEqual(inserted.id, block.id); assert.equal(inserted.definition.id, block.definition.id);
  assert.equal(inserted.color, h.creation.color); assert.equal(inserted.lineType, h.creation.lineType);
  assert.equal(inserted.definition.entities[0].points[1].x, 50); h.session.undo(); assert.equal(h.session.document.entities.length, 1);
});
test("INSERT keeps input if selected definition disappears", () => {
  const block = createBlock([line], "Fixture", p(0, 0), "0"), h = harness([block]);
  h.editor.start("INSERT"); h.text("Fixture"); h.session.commit("Remove", (d) => { d.entities = []; });
  h.point(p(10, 10)); assert.equal(h.editor.state.phase, "points"); assert.deepEqual(h.editor.preview(p(10, 10)), []);
  assert.match(h.messages.at(-1), /inte längre/);
});
test("ATTDEF validates selection, tag and single-line text before replacing source", () => {
  const text = { id: "text", type: "text", layer: "0", point: p(0, 0), height: 12, text: "A" }, h = harness([text]);
  h.editor.start("ATTDEF"); h.text("bad tag"); assert.equal(h.session.history.past.length, 0);
  h.text("number"); assert.equal(h.session.document.entities[0].attributeTag, "NUMBER"); assert.deepEqual(h.selection(), [text.id]);
  h.session.undo(); assert.equal(h.session.document.entities[0].attributeTag, undefined);
  h.session.commit("Multiline", (d) => { d.entities[0].text = "A\nB"; }); h.editor.start("ATTDEF"); h.text("TAG"); assert.match(h.messages.at(-1), /textrad/);
  h.select([]); h.text("TAG"); assert.match(h.messages.at(-1), /Markera/);
});
test("MVIEW requires paper, rejects degenerate bounds and commits locked viewport in one step", () => {
  const h = harness([]); h.editor.start("MVIEW"); h.point(p(10, 10)); assert.equal(h.editor.state.points.length, 0);
  h.creation.space = "paper"; h.text("10,10"); h.text("@0,20"); assert.equal(h.editor.state.points.length, 1);
  const state = structuredClone(h.editor.state); assert.equal(h.editor.preview(p(50, 40))[0].points.length, 4); assert.deepEqual(h.editor.state, state);
  h.fail(true); assert.throws(() => h.text("@40,30")); assert.equal(h.editor.state.points.length, 1);
  h.fail(false); h.text("@40,30"); const viewport = h.session.document.entities[0];
  assert.deepEqual(viewport.points, [p(10, 10), p(50, 40)]); assert.deepEqual(viewport.viewCenter, p(5, 10));
  assert.equal(viewport.locked, true); assert.equal(viewport.viewScale, 0.01); assert.equal(h.session.history.past.length, 1);
  h.session.undo(); assert.equal(h.session.document.entities.length, 0);
});
