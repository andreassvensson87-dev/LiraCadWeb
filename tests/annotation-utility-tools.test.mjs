import test from "node:test";
import assert from "node:assert/strict";
import { Editor } from "../src/editor.js";
import { annotationTools } from "../src/annotation-tools.js";
import { utilityTools } from "../src/utility-tools.js";
import { DocumentSession } from "../src/document-session.js";
import { applyEditingChange } from "../src/editing-tools.js";
import { TextEditSession } from "../src/text-edit-session.js";

const p = (x, y) => ({ x, y });
const line = { id: "line", type: "line", layer: "0", points: [p(0, 0), p(10, 0)] };
function harness(entities = []) {
  const session = new DocumentSession({ version: 1, name: "Test", layers: [{ id: "0", name: "0", color: "#ffffff" }], entities,
    layouts: [{ id: "paper", name: "Layout", width: 420, height: 297 }] });
  let ids = entities.map((e) => e.id), fail = false;
  const messages = [], effects = [];
  const context = { creation: { layer: "0", space: "model", color: "#abcdef", lineType: "DASHED" },
    creationDefaults: { text: { height: 175, font: "Georgia", rotation: 0 }, leader: { height: 140, font: "Georgia" }, hatch: { spacing: 100, patternAngle: 0.5 } } };
  const apply = (change) => { if (fail) throw Error("rejected"); session.commit(change.label, (d) => { d.entities = applyEditingChange(d.entities, change); }); };
  const editor = new Editor({ tools: { ...annotationTools, ...utilityTools }, getContext: () => ({ ...context, entities: session.document.entities.filter((e) => ids.includes(e.id)) }),
    applyChange: apply, setSelection: (value) => { ids = value; }, notify: (message) => messages.push(message),
    onEffect: (effect) => { effects.push(effect); assert.equal(editor.state?.phase || null, effect.kind === "focusCommand" ? "text" : null); },
  });
  return { editor, session, context, messages, effects, apply, selection: () => ids, select: (value) => { ids = value; }, fail: (value) => { fail = value; },
    point: (point) => editor.dispatch({ type: "point", point }), text: (text) => editor.dispatch({ type: "text", text, cursor: p(0, 0) }) };
}
test("TEXT requests an isolated text draft after ending command, without changing document/history", () => {
  const h = harness(); h.editor.start("TEXT"); h.text("bad"); assert.equal(h.effects.length, 0);
  h.text("100,200"); const effect = h.effects[0];
  assert.equal(effect.kind, "editText"); assert.equal(effect.isNew, true); assert.equal(h.editor.state, null);
  assert.deepEqual(effect.entity.point, p(100, 200)); assert.equal(effect.entity.text, ""); assert.equal(effect.entity.height, 175);
  assert.equal(effect.entity.font, "Georgia"); assert.equal(effect.entity.color, "#abcdef");
  assert.equal(h.session.document.entities.length, 0); assert.equal(h.session.history.past.length, 0);
  effect.entity.height = 20; assert.equal(h.context.creationDefaults.text.height, 175);
  const draft = new TextEditSession(effect.entity, true); draft.finish(true, "Text", h.apply);
  assert.equal(h.session.document.entities[0].text, "Text"); assert.equal(h.session.history.past.length, 1);
  h.session.undo(); assert.equal(h.session.document.entities.length, 0);
});
test("LEADER collects relative points, requests focus and saves spaced text in one transaction", () => {
  const h = harness(); h.editor.start("LEADER"); h.text("0,0"); h.text("@10,0");
  const state = structuredClone(h.editor.state); const preview = h.editor.preview(p(20, 10))[0];
  assert.equal(preview.height, 140); assert.equal(preview.font, "Georgia"); assert.deepEqual(h.editor.state, state);
  h.text("@10,10"); assert.equal(h.editor.state.phase, "text"); assert.equal(h.effects[0].kind, "focusCommand");
  h.point(p(99, 99)); assert.equal(h.editor.state.points.length, 3); assert.deepEqual(h.editor.preview(p(30, 30)), []);
  h.text(""); assert.equal(h.session.history.past.length, 0);
  h.text("  A label with spaces  "); const leader = h.session.document.entities[0];
  assert.deepEqual(leader.points, [p(0, 0), p(10, 0), p(20, 10)]); assert.equal(leader.text, "A label with spaces");
  assert.equal(leader.height, 140); assert.equal(h.editor.state, null); assert.equal(h.session.history.past.length, 1);
  h.session.undo(); assert.equal(h.session.document.entities.length, 0); h.session.redo(); assert.deepEqual(h.session.document.entities[0], leader);
});
test("failed LEADER completion preserves text phase, points and effects for retry", () => {
  const h = harness(); h.editor.start("LEADER"); for (const point of [p(0, 0), p(10, 0), p(20, 10)]) h.point(point);
  const state = h.editor.state; h.fail(true); assert.throws(() => h.text("Label"), /rejected/);
  assert.equal(h.editor.state, state); assert.equal(h.session.history.past.length, 0); assert.equal(h.effects.length, 1);
  h.fail(false); h.text("Label"); assert.equal(h.session.document.entities.length, 1);
});
for (const close of ["", "c"]) test(`HATCH closes with ${close || "Enter"}, rejects too few vertices and preserves appearance`, () => {
  const h = harness(); h.editor.start("HATCH"); h.point(p(0, 0)); h.point(p(0, 0)); assert.equal(h.editor.state.points.length, 1);
  h.text(close); assert.equal(h.session.history.past.length, 0); assert.match(h.messages.at(-1), /tre/);
  h.text("@10,0"); h.text("@0,10"); const state = structuredClone(h.editor.state);
  assert.equal(h.editor.preview(p(0, 10))[0].closed, true); assert.deepEqual(h.editor.state, state);
  h.text(close); const hatch = h.session.document.entities[0];
  assert.equal(hatch.closed, true); assert.equal(hatch.spacing, 100); assert.equal(hatch.patternAngle, 0.5);
  assert.deepEqual(hatch.points, [p(0, 0), p(10, 0), p(10, 10)]); assert.equal(h.session.history.past.length, 1);
  h.session.undo(); assert.equal(h.session.document.entities.length, 0);
});
test("HATCH failed commit retains all vertices; paper annotations use paper defaults", () => {
  const h = harness(); h.context.creation.space = "paper"; h.context.creationDefaults.hatch.spacing = 2;
  h.editor.start("HATCH"); for (const point of [p(0, 0), p(10, 0), p(10, 10)]) h.point(point);
  const state = h.editor.state; h.fail(true); assert.throws(() => h.text("C")); assert.equal(h.editor.state, state);
  h.fail(false); h.text("C"); assert.equal(h.session.document.entities[0].spacing, 2); assert.equal(h.session.document.entities[0].space, "paper");
  h.context.creationDefaults.text.height = 2.5; h.editor.start("TEXT"); h.point(p(10, 10)); assert.equal(h.effects[0].entity.height, 2.5);
});
test("DIST measures click/relative/polar points without document changes, selection changes or history", () => {
  const h = harness([line]); h.session.commit("Name", (d) => { d.name = "Other"; }); h.session.undo();
  const original = structuredClone(h.session.document);
  h.editor.start("DIST"); h.text(""); assert.equal(h.editor.state.points.length, 0);
  h.point(p(10, 10)); assert.deepEqual(h.editor.preview(p(13, 14))[0].points, [p(10, 10), p(13, 14)]);
  h.text("@3,4"); assert.equal(h.editor.state, null); assert.equal(h.messages.at(-1), "Avstånd: 5.00 mm · ΔX: 3.00 mm · ΔY: 4.00 mm");
  h.editor.start("DIST"); h.text("0,0"); h.text("@10<0"); assert.match(h.messages.at(-1), /10.00 mm/);
  assert.deepEqual(h.session.document, original); assert.deepEqual(h.selection(), [line.id]); assert.equal(h.session.history.future.length, 1); assert.equal(h.session.history.past.length, 0);
});
test("PAN command enters/exits without document changes and ignores point input", () => {
  const h = harness([line]); h.editor.start("PAN"); const state = h.editor.state;
  h.point(p(10, 20)); assert.equal(h.editor.state, state); h.text("bad"); assert.equal(h.editor.state, state);
  assert.deepEqual(h.editor.preview(p(20, 30)), []); h.text(""); assert.equal(h.editor.state, null);
  assert.deepEqual(h.selection(), [line.id]); assert.equal(h.session.history.past.length, 0);
});
test("ERASE supports preselection and command-first selection with atomic reversible deletion", () => {
  const h = harness([line]); h.select([]); h.editor.start("ERASE"); h.text(""); assert.match(h.messages.at(-1), /Inga/);
  h.select([line.id]); h.fail(true); const state = h.editor.state; assert.throws(() => h.text(""));
  assert.equal(h.editor.state, state); assert.deepEqual(h.selection(), [line.id]); assert.equal(h.session.document.entities.length, 1);
  h.fail(false); h.text(""); assert.deepEqual(h.selection(), []); assert.equal(h.editor.state, null); assert.equal(h.session.document.entities.length, 0);
  assert.match(h.messages.at(-1), /1 objekt/); h.session.undo(); assert.deepEqual(h.session.document.entities, [line]);
});
