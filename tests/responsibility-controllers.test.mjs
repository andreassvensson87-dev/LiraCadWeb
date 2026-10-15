import test from "node:test";
import assert from "node:assert/strict";
import { DocumentSession } from "../src/model/document-session.js";
import { createDocumentEditor } from "../src/editor/document-editor.js";
import { createActiveDocument } from "../src/editor/active-document.js";
import { createCreationSettings } from "../src/editor/creation-settings.js";
import { createDocumentContext } from "../src/editor/document-context.js";
import { createEntityEditController } from "../src/editor/entity-edit-controller.js";
import { createSaveController } from "../src/app/save-controller.js";
import { createPointerController } from "../src/editor/pointer-controller.js";
import { createEditorState } from "../src/editor/editor-state.js";
import {
  configureTextMetrics,
  measureText,
} from "../src/model/text-metrics.js";
import { installTextMetrics } from "../src/rendering/canvas-text-metrics.js";

const line = {
  id: "line",
  type: "line",
  layer: "0",
  points: [
    { x: 0, y: 0 },
    { x: 1000, y: 0 },
  ],
};
const viewport = {
  id: "view",
  type: "viewport",
  layer: "0",
  space: "paper",
  points: [
    { x: 0, y: 0 },
    { x: 100, y: 100 },
  ],
  viewCenter: { x: 10000, y: 10000 },
  viewScale: 0.1,
};
const drawing = (entities) => ({
  version: 1,
  name: "Test",
  layers: [{ id: "0", name: "0", color: "#ffffff" }],
  layouts: [{ id: "paper", name: "Paper", width: 420, height: 297 }],
  entities: structuredClone(entities),
});
function editFixture(entities = [line, viewport]) {
  const model = createActiveDocument();
  model.session = new DocumentSession(drawing(entities));
  model.activeLayer = "0";
  const state = createEditorState();
  const context = createDocumentContext({ model, state });
  const notifications = [],
    documentEditor = createDocumentEditor({
      getSession: () => model.session,
      onChange: (event) => notifications.push(event),
    });
  const messages = [];
  const operations = createEntityEditController({
    model,
    state,
    getDocumentEditor: () => documentEditor,
    update() {},
    currentViewport: context.currentViewport,
    layerOf: context.layerOf,
    viewEntity: context.viewEntity,
    log: (message) => messages.push(message),
  });
  return {
    model,
    state,
    context,
    documentEditor,
    operations,
    notifications,
    messages,
  };
}

test("active document and history follow both project and isolated block sessions", () => {
  const f = editFixture([line]);
  const first = f.model.session;
  f.documentEditor.append("Line", []); // empty append creates no history
  f.model.session = new DocumentSession(drawing([]));
  assert.equal(f.model.document, f.model.session.document);
  assert.equal(f.model.history, f.model.session.history);
  assert.throws(() => {
    f.model.document = first.document;
  }, TypeError);
  f.documentEditor.append("New line", [line]);
  assert.equal(first.document.entities.length, 1);
  assert.equal(first.history.past.length, 0);
  assert.equal(f.model.history.past.length, 1);
});

test("saved viewport navigation validates atomically, cannot alter geometry, and preserves undo/redo stacks", () => {
  const f = editFixture();
  const original = f.model.document;
  f.documentEditor.append("Another line", [{ ...line, id: "second" }]);
  const history = f.model.history.past.length;
  assert.equal(
    f.documentEditor.updateViewportView("view", {
      viewCenter: { x: 500, y: 0 },
      viewScale: 0.2,
      viewRotation: 0,
      layer: "unknown",
      points: [],
    }),
    true,
  );
  const view = f.model.document.entities.find((e) => e.id === "view");
  assert.deepEqual(view.points, viewport.points);
  assert.equal(view.layer, "0");
  assert.equal(f.model.history.past.length, history);
  const accepted = f.model.document,
    events = f.notifications.length;
  assert.throws(
    () =>
      f.documentEditor.updateViewportView("view", {
        viewCenter: { x: 0, y: 0 },
        viewScale: -1,
      }),
    /ogiltig/,
  );
  assert.equal(f.model.document, accepted);
  assert.equal(f.notifications.length, events);
  assert.equal(f.documentEditor.updateViewportView("line", view), false);
  f.documentEditor.undo();
  assert.deepEqual(f.model.document, original);
  f.documentEditor.redo();
  assert.equal(f.model.document.entities.length, 3);
});

test("fit and recovery operate on the active document without shadowing model ownership", () => {
  const f = editFixture();
  const original = f.model.document;
  f.operations.fitViewport(f.model.document.entities[1]);
  assert.equal(f.model.document.entities[1].viewCenter.x, 500);
  assert.equal(f.model.history.past.length, 1);
  assert.equal(original.entities[1].viewCenter.x, 10000);
  f.documentEditor.undo();
  f.operations.recoverLayoutViews("paper");
  assert.equal(f.model.document.entities[1].viewCenter.x, 500);
  assert.equal(f.model.history.past.length, 1);
  assert.match(f.messages.at(-1), /1 tomma vyer/);
});

test("creation settings keep paper and model defaults separate without publishing a draft", () => {
  let space = "model",
    layer = "0";
  const creation = createCreationSettings({
    getLayer: () => layer,
    drawingSpace: () => space,
  });
  const stable = creation.defaults;
  creation.defaults.text.height = 200;
  creation.setMode("paper");
  space = "paper";
  layer = "paper-layer";
  assert.equal(
    creation.make("text", { point: { x: 0, y: 0 }, text: "Paper" }).height,
    2.5,
  );
  creation.defaults.text.height = 3;
  creation.setMode("model");
  space = "model";
  assert.equal(creation.defaults, stable);
  assert.equal(creation.defaults.text.height, 200);
  creation.setMode("paper");
  assert.equal(creation.defaults.text.height, 3);
});

test("asynchronous autosave reports to its originating tab and cannot overwrite another active tab status", () => {
  const callbacks = [],
    status = [];
  const storage = {
    observe() {},
    schedule(read, report) {
      callbacks.push({ read, report });
    },
  };
  const a = {
      session: new DocumentSession(drawing([line])),
      storage,
      saveState: "",
    },
    b = {
      session: new DocumentSession(drawing([])),
      storage,
      saveState: "Other status",
    };
  const workspace = { active: a };
  const model = { document: a.session.document, storage, blockEditor: null };
  const controller = createSaveController({
    model,
    projectWorkspace: workspace,
    reportStatus: (...args) => status.push(args),
    log() {},
    renderProjectTabs() {},
  });
  controller.persisted();
  workspace.active = b;
  const count = status.length;
  a.session.append("Late edit", [{ ...line, id: "late" }]);
  assert.equal(callbacks[0].read().entities.length, 2);
  callbacks[0].report(Error("Disk full"));
  assert.equal(status.length, count);
  assert.equal(b.saveState, "Other status");
  assert.match(a.saveState, /Kunde inte/);
});

test("pointer gesture applies grip changes through editor transactions and rejects degenerate geometry", () => {
  const f = editFixture([line]);
  f.state.camera = { x: 0, y: 0, scale: 1 };
  f.state.selection = new Set(["line"]);
  const noop = () => {},
    textEditor = { active: null };
  const pointer = createPointerController({
    state: f.state,
    textEditor,
    moveCursor: (event) => {
      f.state.mouse = { ...event.point };
      f.state.rawCursor = { ...event.point };
      f.state.cursor = { ...event.point };
    },
    hit: () => f.model.document.entities[0],
    layerOf: f.context.layerOf,
    getDocument: () => f.model.document,
    getInteractionEntities: () => f.model.document.entities,
    editable: () => true,
    screen: (p) => p,
    capturePointer: noop,
    blurCommand: noop,
    setCursor: noop,
    setTrimShift: noop,
    schedule: noop,
    update: noop,
    syncViewport: noop,
    replaceEntities: f.operations.replaceEntities,
    log: (message) => f.messages.push(message),
  });
  pointer.pointerdown({ button: 0, pointerId: 1, point: { x: 0, y: 0 } });
  assert.equal(f.state.drag.kind, "grip");
  pointer.pointerup({ point: { x: 100, y: 100 } });
  assert.deepEqual(f.model.document.entities[0].points[0], { x: 100, y: 100 });
  assert.equal(f.model.history.past.length, 1);
  f.documentEditor.undo();
  pointer.pointerdown({ button: 0, pointerId: 1, point: { x: 0, y: 0 } });
  pointer.pointerup({ point: { x: 1000, y: 0 } });
  assert.deepEqual(f.model.document.entities[0], line);
  assert.equal(f.model.history.past.length, 0);
  assert.match(f.messages.at(-1), /ogiltig/);
});

test("canvas text metrics are injected and renewed when font metrics change", () => {
  let factor = 0.5;
  const context = {
    font: "",
    measureText: (text) => ({
      width: text.length * 100 * factor,
      actualBoundingBoxAscent: 100,
    }),
  };
  assert.equal(installTextMetrics({ createContext: () => context }), true);
  assert.equal(measureText("CAD", { font: "Arial" }, 10), 15);
  factor = 0.8;
  installTextMetrics({ createContext: () => context });
  assert.equal(measureText("CAD", { font: "Arial" }, 10), 24);
  configureTextMetrics(null);
  assert.equal(measureText("CAD", {}, 10), 19.5);
});

test("locked viewport navigation creates neither a new snapshot nor an editor notification", () => {
  const f = editFixture([line, { ...viewport, locked: true }]);
  const before = f.model.document;
  assert.equal(
    f.documentEditor.updateViewportView("view", {
      viewCenter: { x: 0, y: 0 },
      viewScale: 1,
    }),
    false,
  );
  assert.equal(f.model.document, before);
  assert.equal(f.notifications.length, 0);
  assert.equal(f.model.history.past.length, 0);
});
