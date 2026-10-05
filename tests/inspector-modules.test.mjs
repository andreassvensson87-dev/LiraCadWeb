import test from "node:test";
import assert from "node:assert/strict";
import { createGeneralInspector } from "../src/general-inspector.js";
import { createAppearanceInspector } from "../src/appearance-inspector.js";
import { createAttributeInspector } from "../src/attribute-inspector.js";
import { createEntityInspector } from "../src/entity-inspector.js";
import { createLayoutInspector } from "../src/layout-inspector.js";
import { createBlockInspector } from "../src/block-inspector.js";
import { DocumentSession } from "../src/document-session.js";
class Element {
  children = []; attrs = {}; classList = { add() {} };
  append(...items) { this.children.push(...items); }
  setAttribute(k, v) { this.attrs[k] = v; }
  getAttribute(k) { return this.attrs[k]; }
}
const controls = {
  document: { createElement: () => new Element() },
  field: (label, value, change) => Object.assign(new Element(), { label, value, change }),
  choice: (label, value, options, change) => Object.assign(new Element(), { label, value, options, change }),
  action: (label, onclick) => Object.assign(new Element(), { label, onclick }),
  section: () => new Element(),
};
test("general inspector distinguishes mixed selection, creation defaults and dimension source", () => {
  const layers = [{ id: "a", name: "A", color: "#ffffff" }, { id: "b", name: "B", color: "#000000" }];
  let context = { doc: { layers }, tool: null, es: [{ layer: "a", lineType: "DASHED" }, { layer: "b", lineType: "CONTINUOUS" }], activeLayer: "a", creationColor: null, creationLineType: "BYLAYER" };
  const changes = [], colors = [];
  const render = createGeneralInspector({ ...controls, getContext: () => context,
    colorFields: (root, color) => colors.push(color), changeProperty: (...args) => changes.push(args),
  });
  const root = new Element(); render(root);
  const group = root.children[0], select = group.children[0].children[0], lineType = group.children[1];
  assert.equal(select.value, ""); assert.equal(lineType.value, "mixed");
  lineType.change("DASHED"); assert.deepEqual(changes.at(-1), ["lineType", "DASHED", { source: null, hasTargets: true }]);
  context = { ...context, es: [], tool: { name: "TEXT" } }; const creation = new Element(); render(creation);
  assert.equal(creation.children[0].children[1].value, "BYLAYER");
  const source = { layer: "b", lineType: "DASHED", color: "#abcdef" };
  context = { ...context, tool: { name: "DIMCONTINUE", source } }; const chain = new Element(); render(chain);
  chain.children[0].children[1].change("CONTINUOUS"); assert.equal(changes.at(-1)[2].source, source);
  assert.equal(colors.at(-1), "#abcdef");
});
test("appearance inspector guards positive sizes and exposes text styles without mutating input", () => {
  const messages = [], changes = []; let refreshed = 0;
  const render = createAppearanceInspector({ ...controls, log: (m) => messages.push(m), refresh: () => refreshed++ });
  const entity = { type: "text", text: "A", height: 10, font: "Arial", bold: false }, before = structuredClone(entity), root = new Element();
  render(root, entity, (...args) => changes.push(args));
  root.children[0].change(0); assert.equal(changes.length, 0); assert.equal(refreshed, 1);
  root.children[0].change(12); root.children[1].change("Georgia"); root.children[2].children[0].onclick();
  assert.deepEqual(changes, [["height", 12], ["font", "Georgia"], ["bold", true]]); assert.deepEqual(entity, before);
  assert.match(messages[0], /större än noll/);
});
test("attribute callbacks check current document for duplicate tags and preserve instance value choices", () => {
  let doc = { entities: [{ id: "a", type: "text", text: "Default", attributeTag: "A" }] };
  const edits = [], messages = [];
  const fields = createAttributeInspector({ ...controls, getDocument: () => doc, isBlockEditor: () => true,
    editSelected: (label, fn) => edits.push(fn(structuredClone(doc.entities[0]))), log: (m) => messages.push(m), refresh() {}, selectEntity() {},
  });
  const root = new Element(); fields.attributeDefinitionFields(root, doc.entities[0]);
  doc = { entities: [...doc.entities, { id: "b", type: "text", attributeTag: "B" }] };
  root.children[0].change("B"); assert.equal(edits.length, 0); assert.match(messages.at(-1), /unikt/);
  root.children[0].change("C"); assert.equal(edits[0].attributeTag, "C");
  const choices = new Element(), values = [];
  fields.attributeValueField(choices, { attributeTag: "CHOICE", attributeSchema: { type: "choice", options: ["One", "Two"], allowCustom: false } }, "Legacy", (v) => values.push(v));
  assert.equal(choices.children[0].options[0][1], "Legacy"); choices.children[0].change("2"); assert.deepEqual(values, ["Two"]);
});
test("entity inspector sends viewport changes through document transactions", () => {
  const session = new DocumentSession({ version: 1, name: "Test", layers: [{ id: "0", name: "A", color: "#ffffff" }], layouts: [{ id: "paper", name: "Layout", width: 420, height: 297 }], entities: [{ id: "v", type: "viewport", layer: "0", space: "paper", points: [{ x: 0, y: 0 }, { x: 100, y: 100 }], viewCenter: { x: 0, y: 0 }, viewScale: 0.01, locked: true }] });
  const before = session.document, render = createEntityInspector({ ...controls,
    editSelected: (label, fn) => session.commit(label, (d) => { d.entities = d.entities.map(fn); }),
    refresh() {}, attributeDefinitionFields() {}, appearanceFields() {}, enterViewport() {}, beginTextEdit() {},
  });
  const root = new Element(); render(root, before.entities[0]); root.children[0].children[0].change(50);
  assert.equal(session.document.entities[0].viewScale, 0.02); assert.equal(before.entities[0].viewScale, 0.01);
  session.undo(); assert.deepEqual(session.document, before);
});
test("layout callbacks look up draft by identity, validate names and undo removal with its paper objects", () => {
  const session = new DocumentSession({ version: 1, name: "Test", layers: [{ id: "0", name: "A", color: "#ffffff" }], layouts: [{ id: "paper", name: "Paper", width: 420, height: 297 }, { id: "other", name: "Other", width: 420, height: 297 }], entities: [
    { id: "model", type: "line", layer: "0", points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] },
    { id: "paper-line", type: "line", layer: "0", space: "paper", points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] },
  ] });
  const original = session.document, root = new Element(), messages = []; let formats = 0, removed = 0;
  createLayoutInspector({ ...controls, getDocument: () => session.document,
    commit: (label, change) => session.commit(label, change), log: (m) => messages.push(m), refresh() {}, afterFormat: () => formats++, afterRemove: () => removed++,
  })(root, "paper");
  const [name, format, remove] = root.children[0].children;
  for (const value of ["", "Model", "other"]) name.change(value);
  assert.equal(messages.length, 3); assert.equal(session.history.past.length, 0);
  name.change("Renamed"); format.change("297x210");
  assert.equal(original.layouts[0].name, "Paper"); assert.equal(original.layouts[0].width, 420);
  assert.equal(session.document.layouts[0].name, "Renamed"); assert.equal(formats, 1);
  const beforeRemove = structuredClone(session.document); remove.onclick();
  assert.equal(removed, 1); assert.equal(session.document.layouts.length, 1); assert.deepEqual(session.document.entities.map((e) => e.id), ["model"]);
  assert.deepEqual(session.undo(), beforeRemove); session.undo(); session.undo(); assert.deepEqual(session.document, original);
});
test("invalid layout format leaves document intact and does not run post-commit navigation", () => {
  const session = new DocumentSession({ version: 1, name: "Test", layers: [{ id: "0", name: "A", color: "#ffffff" }], layouts: [{ id: "paper", name: "Paper", width: 420, height: 297 }], entities: [] });
  const original = session.document, root = new Element(); let fitted = 0;
  createLayoutInspector({ ...controls, getDocument: () => session.document, commit: (label, change) => session.commit(label, change), log() {}, refresh() {}, afterFormat: () => fitted++, afterRemove() {} })(root, "paper");
  assert.throws(() => root.children[0].children[1].change("0x210"), /ogiltig ritning/);
  assert.equal(fitted, 0); assert.deepEqual(session.document, original);
});
test("block editor fields edit isolated drafts and save/cancel actions are injected", () => {
  const session = new DocumentSession({ version: 1, name: "Block", blockBase: { x: 0, y: 0 }, layers: [{ id: "0", name: "A", color: "#ffffff" }], entities: [] });
  const before = session.document, root = new Element(), actions = [];
  const render = createBlockInspector({ ...controls, getDocument: () => session.document,
    commit: (label, change) => session.commit(label, change), finishEdit: (save) => actions.push(save), renderAttributeManager() {}, attributeValueField() {}, editSelected() {}, beginEdit() {}, erase() {},
  });
  render.renderEditor(root); const [name, x, y, save, cancel] = root.children[0].children;
  name.change("NewBlock"); x.change(20); y.change(-10); x.change(NaN);
  assert.deepEqual(session.document.blockBase, { x: 20, y: -10 }); assert.equal(before.name, "Block"); assert.equal(session.history.past.length, 3);
  save.onclick(); cancel.onclick(); assert.deepEqual(actions, [true, false]);
  session.undo(); session.undo(); session.undo(); assert.deepEqual(session.document, before);
});
