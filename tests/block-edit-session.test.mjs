import test from "node:test";
import assert from "node:assert/strict";
import { BlockEditSession } from "../src/block-edit-session.js";
import { DocumentSession } from "../src/document-session.js";
import { createBlock } from "../src/blocks.js";
import { validDocument } from "../src/document.js";

function fixture(options) {
  const block = createBlock([{ id: "line", type: "line", layer: "0", points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] }], "Test", { x: 0, y: 0 }, "0");
  const parent = new DocumentSession({ version: 1, name: "Drawing", layers: [{ id: "0", name: "0", color: "#ffffff" }], entities: [block, { ...structuredClone(block), id: "second", point: { x: 100, y: 0 } }] }, options);
  return { parent, definition: block.definition };
}
test("block draft is isolated; save updates every instance in one parent transaction", () => {
  const { parent, definition } = fixture(), original = structuredClone(parent.document);
  const context = { camera: { x: 4 }, selection: ["second"], dirty: false };
  const session = new BlockEditSession(parent, definition, context); context.camera.x = 9;
  session.draft.commit("Rename", (d) => { d.name = "Changed"; d.entities[0].points[1].x = 30; });
  assert.deepEqual(parent.document, original); assert.equal(session.document, parent.document);
  const result = session.finish(true);
  assert.equal(result.changed, true); assert.equal(result.context.camera.x, 4);
  assert.equal(parent.history.past.length, 1);
  for (const block of parent.document.entities) { assert.equal(block.definition.name, "Changed"); assert.equal(block.definition.entities[0].points[1].x, 30); }
  assert.equal(parent.document.entities[1].point.x, 100);
  parent.undo(); assert.deepEqual(parent.document, original); parent.redo(); assert.equal(parent.document.entities[0].definition.name, "Changed");
  assert.throws(() => session.finish(true), /redan/);
});
test("cancel discards draft and preserves parent redo", () => {
  const { parent, definition } = fixture(); parent.commit("Name", (d) => { d.name = "Another"; }); parent.undo();
  const original = structuredClone(parent.document), session = new BlockEditSession(parent, definition);
  session.draft.commit("Name", (d) => { d.name = "Discarded"; });
  assert.equal(session.finish(false).changed, false); assert.deepEqual(parent.document, original);
  assert.equal(parent.history.future.length, 1); assert.equal(parent.history.past.length, 0);
});
test("validation rejection retains draft and parent history until a successful retry", () => {
  let reject = false;
  const { parent, definition } = fixture({ validate: (d) => !reject && validDocument(d) });
  const original = structuredClone(parent.document), session = new BlockEditSession(parent, definition);
  session.draft.commit("Name", (d) => { d.name = "Changed"; }); reject = true;
  assert.throws(() => session.finish(true), /ogiltig/); assert.equal(session.closed, false);
  assert.equal(session.draft.document.name, "Changed"); assert.deepEqual(parent.document, original); assert.equal(parent.history.past.length, 0);
  reject = false; session.finish(true); assert.equal(parent.document.entities[0].definition.name, "Changed");
});
test("invalid block name retains an editable draft for correction or cancel", () => {
  const { parent, definition } = fixture(), session = new BlockEditSession(parent, definition);
  session.draft.commit("Name", (d) => { d.name = "invalid name"; });
  assert.throws(() => session.finish(true), /Blocknamn/); assert.equal(session.closed, false);
  session.draft.commit("Fix", (d) => { d.name = "Fixed"; }); session.finish(true);
  assert.equal(parent.document.entities[0].definition.name, "Fixed");
});
