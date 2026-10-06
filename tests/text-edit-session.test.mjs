import test from "node:test";
import assert from "node:assert/strict";
import { TextEditSession } from "../src/text-edit-session.js";
import { createTextEditor } from "../src/text-editor.js";
import { DocumentSession } from "../src/document-session.js";
import { applyEditingChange } from "../src/editing-tools.js";

const entity = { id: "text", type: "text", layer: "0", point: { x: 0, y: 0 }, height: 12, text: "Before" };
function fixture(isNew = false) {
  const parent = new DocumentSession({ version: 1, name: "Test", layers: [{ id: "0", name: "0", color: "#ffffff" }], entities: isNew ? [] : [entity] });
  const session = new TextEditSession(entity, isNew);
  const apply = (change) => parent.commit(change.label, (d) => { d.entities = applyEditingChange(d.entities, change); });
  return { parent, session, apply };
}
for (const isNew of [false, true]) test(`text ${isNew ? "creation" : "edit"} accepts isolated style and normalized multiline text in one reversible change`, () => {
  const { parent, session, apply } = fixture(isNew); session.entity.bold = true;
  const result = session.finish(true, "A\r\nB\rC", apply);
  assert.equal(parent.document.entities[0].text, "A\nB\nC"); assert.equal(parent.document.entities[0].bold, true);
  assert.deepEqual(result.selection, [entity.id]); assert.equal(parent.history.past.length, 1);
  parent.undo(); assert.equal(parent.document.entities.length, isNew ? 0 : 1);
  if (!isNew) assert.equal(parent.document.entities[0].text, "Before");
  assert.equal(session.closed, true); assert.throws(() => session.finish(true, "Again", apply), /redan/);
});
test("cancel and empty text leave accepted document and redo untouched", () => {
  for (const save of [false, true]) {
    const { parent, session, apply } = fixture(); parent.commit("Name", (d) => { d.name = "Other"; }); parent.undo();
    const original = structuredClone(parent.document); session.entity.font = "Georgia";
    const result = session.finish(save, "  ", apply);
    assert.deepEqual(parent.document, original); assert.equal(parent.history.future.length, 1); assert.equal(result.selection, undefined);
    if (save) assert.match(result.message, /Tom text/);
  }
});
test("invalid attribute text and transaction rejection retain draft for correction", () => {
  const { parent, session, apply } = fixture(); session.entity.attributeTag = "TAG";
  assert.throws(() => session.finish(true, "A\rB", apply), /textrad/); assert.equal(session.closed, false);
  assert.throws(() => session.finish(true, "Valid", () => { throw Error("rejected"); }), /rejected/); assert.equal(session.closed, false);
  session.finish(true, "Valid", apply); assert.equal(parent.document.entities[0].text, "Valid");
});
test("editing a removed object fails without inserting it again", () => {
  const { parent, session, apply } = fixture(); parent.commit("Remove", (d) => { d.entities = []; });
  assert.throws(() => session.finish(true, "Changed", apply), /inte längre/);
  assert.equal(session.closed, false); assert.equal(parent.document.entities.length, 0); assert.equal(parent.history.past.length, 1);
});
test("text presentation retains box on save failure and supports correction, composition and cancel", () => {
  class Element {
    options = [{ value: "Arial" }, { value: "Georgia" }, { value: "Courier New" }];
    querySelectorAll() { return []; }
    append(option) { this.options.push(option); }
    style = {}; attrs = {}; handlers = {}; hidden = true; value = "";
    setAttribute(k, v) { this.attrs[k] = v; }
    addEventListener(k, fn) { this.handlers[k] = fn; }
    focus() {} setSelectionRange() {}
  }
  const elements = Object.fromEntries(["text-editor", "text-target", "inline-text", "text-font", "text-bold", "text-italic", "text-underline", "text-apply", "text-cancel", "text-align", "text-vertical", "text-rotation", "text-height", "text-spacing", "text-spacing-style", "text-tracking", "text-width-factor", "text-width"].map((id) => [id, new Element()]));
  let fail = true, finished = 0; const errors = [];
  const view = createTextEditor({ document: { querySelector: (selector) => elements[selector.slice(1)], createElement: () => ({ dataset: {} }) }, screen: () => ({ x: 20, y: 20 }), getSize: () => ({ width: 900, height: 600 }),
    beforeBegin() {}, refresh() {}, log: (message) => errors.push(message),
    applyChange: () => { if (fail) throw Error("rejected"); }, afterFinish: () => { finished++; },
  });
  view.begin(entity); elements["inline-text"].value = "Changed";
  elements["text-bold"].onclick(); assert.equal(view.active.entity.bold, true); assert.equal(elements["inline-text"].style.fontWeight, "700");
  elements["text-align"].value = "right"; elements["text-align"].onchange();
  elements["text-spacing"].value = "1.2"; elements["text-spacing"].onchange();
  elements["text-tracking"].value = "1.5"; elements["text-tracking"].onchange();
  assert.equal(view.active.entity.textAlign, "right"); assert.equal(view.active.entity.lineSpacing, 2); assert.equal(view.active.entity.tracking, 1.5);
  elements["text-tracking"].value = "0.1"; elements["text-tracking"].onchange(); assert.equal(view.active.entity.tracking, 1.5);
  elements["text-apply"].onclick(); assert.equal(elements["text-editor"].hidden, false); assert.equal(view.active.closed, false); assert.equal(finished, 0);
  assert.equal(view.begin({ ...entity, id: "other" }), false); assert.equal(view.active.entity.id, entity.id);
  elements["inline-text"].handlers.keydown({ isComposing: true, key: "Escape", stopPropagation() {} }); assert.ok(view.active);
  fail = false; elements["text-apply"].onclick(); assert.equal(elements["text-editor"].hidden, true); assert.equal(view.active, null); assert.equal(finished, 1);
  view.begin(entity); elements["text-cancel"].onclick(); assert.equal(view.active, null); assert.equal(finished, 2);
});

test('live text drafts do not change accepted document or formatting until committed',()=>{
 const {parent,session,apply}=fixture();session.entity.textRuns=[{text:'Before',bold:true}];const before=structuredClone(parent.document);
 const draft=session.draft('Preview\r\nLine');assert.equal(draft.text,'Preview\nLine');assert.equal(draft.textRuns,undefined);draft.height=99;
 assert.equal(session.entity.height,12);assert.deepEqual(parent.document,before);assert.equal(parent.history.past.length,0);
 assert.equal(session.draft('Before').textRuns[0].bold,true);
 session.finish(false,'Preview',apply);assert.deepEqual(parent.document,before);assert.equal(parent.history.past.length,0);
});
test('empty attribute values can be accepted without deleting their text definition',()=>{
 const {session}=fixture();session.entity.attributeTag='TAG';let accepted;session.finish(true,'',change=>accepted=change.entities[0]);assert.equal(accepted.text,'');assert.equal(accepted.attributeTag,'TAG');
});
