import test from "node:test";
import assert from "node:assert/strict";
import { createClipboardController } from "../src/editor/clipboard-controller.js";
import { createDocumentEditor } from "../src/editor/document-editor.js";
import { createDocumentContext } from "../src/editor/document-context.js";
import { DocumentSession } from "../src/model/document-session.js";
import { createBlock } from "../src/model/blocks.js";
import { installInputController } from "../src/ui/input-controller.js";
import { createToolContext } from "../src/editor/tool-context.js";

const line = (id = "line") => ({ id, type: "line", layer: "0", points: [{ x: 10, y: 20 }, { x: 100, y: 20 }] });
const drawing = (entities = []) => ({ version: 1, layers: [{ id: "0", name: "0", color: "#ffffff" }], entities });

test("keyboard adapter routes Ctrl/Cmd clipboard shortcuts and preserves text fields and dialogs", () => {
  const h = setup(), handlers = new Map();
  const element = () => ({ addEventListener() {}, setAttribute() {}, removeAttribute() {}, matches: () => false, closest: () => null });
  const input = { ...element(), matches: () => true };
  const controls = new Map();
  const $ = (selector) => {
    if (!controls.has(selector)) controls.set(selector, element());
    return controls.get(selector);
  };
  const workspace = { active: true }, textEditor = { active: false }, saves = [];
  installInputController({
    document: { addEventListener: (name, handler) => handlers.set(name, handler) },
    window: element(), canvas: element(), state: h.state, input, $, textEditor,
    projectWorkspace: workspace, wblockDialog: {}, clipboard: h.clipboard,
    saveProject: () => saves.push("save"), saveProjectAs: () => saves.push("as"),
  });
  function key(value, options = {}) {
    let prevented = false;
    handlers.get("keydown")({ key: value, ctrlKey: true, target: element(),
      preventDefault() { prevented = true; }, ...options });
    return prevented;
  }
  assert.equal(key("c"), true);
  assert.equal(key("s"), true);
  assert.deepEqual(saves, ["save"]);
  h.activate(h.second);
  assert.equal(key("v", { ctrlKey: false, metaKey: true }), true);
  assert.equal(h.second.document.entities.length, 0);
  h.place();
  assert.equal(h.second.document.entities.length, 1);
  h.state.selection = new Set(h.second.document.entities.map((e) => e.id));
  assert.equal(key("x"), true);
  assert.equal(h.second.document.entities.length, 0);
  assert.equal(key("v", { target: input }), false);
  assert.equal(key("v", { target: { ...element(), matches: () => true } }), false);
  assert.equal(key("v", { isComposing: true }), false);
  $("#help-dialog").open = true;
  assert.equal(key("v"), false);
  $("#help-dialog").open = false;
  textEditor.active = true;
  assert.equal(key("v"), false);
  textEditor.active = false;
  workspace.active = false;
  assert.equal(key("v"), false);
  assert.equal(h.second.document.entities.length, 0);
});
function setup(source = drawing([line()]), target = drawing()) {
  const first = new DocumentSession(source), second = new DocumentSession(target);
  let active = first;
  const model = { get document() { return active.document; } };
  const state = { selection: new Set(source.entities.map((e) => e.id)), activeSpace: "model" };
  const context = createDocumentContext({ model, state });
  const editor = createDocumentEditor({ getSession: () => active });
  const messages = [];
  const selectedEntities = () => model.document.entities.filter((e) => state.selection.has(e.id) && context.editable(e));
  const { editor: tools } = createToolContext({
    model, state, selectedEntities,
    getCreationDefaults: () => ({ dimension: {} }),
    catalogPlacementReason: () => "", drawingSpace: context.drawingSpace,
    getCreationColor: () => undefined, getCreationLineType: () => undefined,
    getClipboardController: () => clipboard,
    clearTracking: () => {}, log: (message) => messages.push(message),
  });
  const cancel = () => { tools.cancel(); state.tool = null; };
  const clipboard = createClipboardController({
    model, state, selectedEntities,
    drawingSpace: context.drawingSpace, getDocumentEditor: () => editor,
    cancel, update: () => {}, log: (message) => messages.push(message),
    startPlacement: (initial) => tools.start("PASTECLIP", initial),
  });
  const place = (point = tools.state.base) => tools.dispatch({ type: "point", point });
  return { first, second, state, editor, tools, clipboard, messages, cancel, place,
    paste(point) { if (!clipboard.paste()) return false; return place(point); },
    activate(session) { cancel(); active = session; state.selection.clear(); } };
}

test("copy survives project switches and repeated paste has independent IDs and history", () => {
  const h = setup();
  assert.equal(h.clipboard.copy(), true);
  assert.equal(h.first.history.past.length, 0);
  h.editor.commit("Edit after copy", (d) => { d.entities[0].points[0].x = 90; });
  h.activate(h.second);
  assert.equal(h.paste(), true);
  assert.deepEqual(h.second.document.entities[0].points, line().points);
  assert.notEqual(h.second.document.entities[0].id, "line");
  const pasted = h.second.document.entities[0].id;
  assert.deepEqual([...h.state.selection], [pasted]);
  assert.equal(h.paste(), true);
  assert.notEqual(h.second.document.entities[1].id, pasted);
  h.editor.undo();
  assert.equal(h.second.document.entities.length, 1);
  h.editor.undo();
  assert.equal(h.second.document.entities.length, 0);
  assert.equal(h.first.document.entities[0].points[0].x, 90);
  h.editor.redo();
  assert.equal(h.second.document.entities.length, 1);
});

test("cut is undoable in its source and does not remove unselected or locked objects", () => {
  const source = drawing([line(), { ...line("locked"), layer: "locked" }, line("other")]);
  source.layers.push({ id: "locked", name: "Locked", color: "#ffffff", locked: true });
  const h = setup(source);
  h.state.selection.delete("other");
  assert.equal(h.clipboard.cut(), true);
  assert.deepEqual(h.first.document.entities.map((e) => e.id), ["locked", "other"]);
  h.activate(h.second);
  assert.equal(h.paste(), true);
  assert.equal(h.second.document.entities.length, 1);
  h.activate(h.first);
  h.editor.undo();
  assert.equal(h.first.document.entities.length, 3);
  assert.equal(h.second.document.entities.length, 1);
});

test("layer and block name collisions preserve block content and isolate native identities", () => {
  const block = createBlock([line()], "Detail", { x: 5, y: 5 }, "0");
  block.dwgSource = { handle: "AA" };
  block.definition.dwgSource = { handle: "BB" };
  block.definition.entities[0].dwgSource = { handle: "CC" };
  const target = drawing([createBlock([line()], "Detail", { x: 0, y: 0 }, "0")]);
  target.layers[0].color = "#ff0000";
  const h = setup(drawing([block]), target);
  h.clipboard.copy();
  h.activate(h.second);
  assert.equal(h.paste(), true);
  const pasted = h.second.document.entities[1];
  assert.equal(pasted.definition.name, "Detail_2");
  assert.notEqual(pasted.definition.id, block.definition.id);
  assert.equal(pasted.dwgSource, undefined);
  assert.equal(pasted.definition.dwgSource, undefined);
  assert.equal(pasted.definition.entities[0].dwgSource, undefined);
  const layer = h.second.document.layers.find((l) => l.id === pasted.layer);
  assert.equal(layer.color, "#ffffff");
  assert.equal(layer.name, "0_2");
  assert.equal(pasted.definition.entities[0].layer, layer.id);
  h.paste();
  assert.equal(h.second.document.layers.length, 2);
  h.editor.undo();
  h.editor.undo();
  assert.equal(h.second.document.layers.length, 1);
  assert.equal(h.second.document.blocks, undefined);
});

test("empty selection does not overwrite clipboard and rejected paste leaves document and redo intact", () => {
  const h = setup();
  assert.equal(h.clipboard.paste(), false);
  h.clipboard.copy();
  h.state.selection.clear();
  assert.equal(h.clipboard.copy(), false);
  h.activate(h.second);
  h.editor.commit("Name", (d) => { d.name = "changed"; });
  h.editor.undo();
  const before = h.second.document;
  h.second.validate = () => false;
  assert.equal(h.clipboard.paste(), true);
  const placement = h.tools.state;
  assert.throws(() => h.place(), /ogiltig ritning/);
  assert.equal(h.tools.state, placement);
  assert.equal(h.second.document, before);
  assert.equal(h.second.history.future.length, 1);
  h.second.validate = () => true;
  assert.equal(h.place(), true);
});

test("paper objects paste into the current space and viewport frames require paper", () => {
  const viewport = { id: "vp", type: "viewport", layer: "0", space: "sheet", points: [{ x: 0, y: 0 }, { x: 100, y: 100 }], viewCenter: { x: 0, y: 0 }, viewScale: 1 };
  const source = { ...drawing([viewport]), layouts: [{ id: "sheet", name: "Sheet", width: 297, height: 210 }] };
  const target = { ...drawing(), layouts: [{ id: "target", name: "Target", width: 297, height: 210 }] };
  const h = setup(source, target);
  h.state.activeSpace = "sheet";
  assert.equal(h.clipboard.copy(), true);
  h.activate(h.second);
  h.state.activeSpace = "model";
  assert.equal(h.clipboard.paste(), false);
  assert.equal(h.second.history.past.length, 0);
  h.state.activeSpace = "target";
  assert.equal(h.paste(), true);
  assert.equal(h.second.document.entities[0].space, "target");
});

test("paste previews follow the placement point without publishing geometry, layers or history", () => {
  const source = drawing([line(), {
    id: "circle", type: "circle", layer: "0", center: { x: 30, y: 40 }, radius: 5,
  }]);
  source.layers[0].color = "#00ff00";
  const h = setup(source);
  h.clipboard.copy();
  h.activate(h.second);
  const before = h.second.document;
  assert.equal(h.clipboard.paste(), true);
  assert.deepEqual(h.tools.state.base, { x: 10, y: 20 });
  const preview = h.tools.preview({ x: 250, y: -100 });
  assert.deepEqual(preview[0].points, [{ x: 250, y: -100 }, { x: 340, y: -100 }]);
  assert.deepEqual(preview[1].center, { x: 270, y: -80 });
  assert.equal(preview[0].color, "#00ff00");
  preview[0].points[0].x = 900;
  assert.equal(h.tools.preview({ x: 250, y: -100 })[0].points[0].x, 250);
  assert.equal(h.second.document, before);
  assert.equal(h.second.history.past.length, 0);
  h.place({ x: 250, y: -100 });
  assert.equal(h.tools.state, null);
  assert.equal(h.state.tool, null);
  assert.deepEqual(h.second.document.entities[1].center, { x: 270, y: -80 });
  assert.equal(h.second.history.past.length, 1);
  assert.equal(h.first.document.entities[0].points[0].x, 10);
  h.editor.undo();
  assert.deepEqual(h.second.document, before);
  h.editor.redo();
  assert.deepEqual(h.second.document.entities[0].points[0], { x: 250, y: -100 });
});

test("cancel, command changes and project switches discard placement and preserve the clipboard and redo", () => {
  const h = setup();
  h.clipboard.copy();
  h.activate(h.second);
  h.paste();
  h.editor.undo();
  const before = h.second.document;
  h.clipboard.paste();
  h.tools.preview({ x: 1000, y: 2000 });
  h.cancel();
  assert.equal(h.second.document, before);
  assert.equal(h.second.history.future.length, 1);
  assert.deepEqual(h.tools.preview({ x: 1000, y: 2000 }), []);
  h.clipboard.paste();
  h.tools.start("LINE");
  assert.equal(h.tools.state.name, "LINE");
  assert.equal(h.second.document, before);
  h.clipboard.paste();
  h.activate(h.first);
  assert.equal(h.tools.dispatch({ type: "point", point: { x: 1000, y: 2000 } }), false);
  assert.equal(h.first.document.entities.length, 1);
  h.activate(h.second);
  h.clipboard.paste();
  h.tools.dispatch({ type: "text", text: "500,600", cursor: { x: 0, y: 0 } });
  assert.deepEqual(h.second.document.entities[0].points[0], { x: 500, y: 600 });
});

test("placed blocks translate their insertion only and retain local definition and attribute coordinates", () => {
  const block = createBlock([line()], "Detail", { x: 5, y: 5 }, "0");
  const h = setup(drawing([block]));
  h.clipboard.copy();
  h.activate(h.second);
  h.clipboard.paste();
  const before = structuredClone(h.tools.state);
  h.tools.dispatch({ type: "text", text: "invalid", cursor: { x: 0, y: 0 } });
  assert.deepEqual(h.tools.state, before);
  h.place({ x: 100, y: 200 });
  const result = h.second.document.entities[0];
  assert.deepEqual(result.point, { x: 95, y: 185 });
  assert.deepEqual(result.definition.entities[0].points, block.definition.entities[0].points);
});
