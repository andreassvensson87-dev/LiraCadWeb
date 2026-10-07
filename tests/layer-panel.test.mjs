import test from "node:test";
import assert from "node:assert/strict";
import { createLayerPanel } from "../src/layer-panel.js";
import { DocumentSession } from "../src/document-session.js";
class Element {
  children = [];
  attrs = {};
  setAttribute(key, value) { this.attrs[key] = value; }
  querySelector(selector) { return this.children.find(child => child.className === selector.slice(1)) || null; }
  append(...items) { this.children.push(...items); }
  replaceChildren(...items) { this.children = items; }
}
const rows = root => root.children[1].children[0].children[1].children;
const control = (row, column) => row.children[column].children[0];
function setup() {
  const session = new DocumentSession({ version: 1, name: "Drawing", entities: [],
    layers: [{ id: "0", name: "Walls", color: "#ffffff" }, { id: "1", name: "Details", color: "#000000" }] });
  let activeLayer = "0", cancelled = 0;
  const root = new Element(), messages = [];
  const render = createLayerPanel({
    document: { createElement: () => new Element() }, root,
    getDocument: () => session.document, getActiveLayer: () => activeLayer,
    activateLayer: (id) => { activeLayer = id; render(); },
    commit: (label, change) => { session.commit(label, change); render(); },
    cancel: () => { cancelled++; }, log: (m) => messages.push(m),
    field: (label, value, change) => ({ label, value, change }),
    choice: (label, value, options, change) => ({ label, value, options, change }),
    action: (label, onclick) => ({ label, onclick }),
  });
  render();
  return { root, session, render, messages, get activeLayer() { return activeLayer; }, get cancelled() { return cancelled; } };
}

test("layer callbacks edit current drafts by ID and preserve undo/redo", () => {
  const f = setup(), original = f.session.document;
  // Keep callbacks from a previous render: they must never mutate captured layers.
  const row = rows(f.root)[0];
  const color = control(row, 2).children[0], rename = control(row, 1),
    type = control(row, 3).children[1], eye = control(row, 4), lock = control(row, 5);
  rename.change("New walls");
  color.value = "#abcdef";
  color.onchange();
  type.change("DASHED");
  eye.onclick();
  lock.onclick();
  assert.equal(original.layers[0].name, "Walls");
  const layer = f.session.document.layers[0];
  assert.equal(layer.name, "New walls");
  assert.equal(layer.color, "#abcdef");
  assert.equal(layer.lineType, "DASHED");
  assert.equal(layer.visible, false);
  assert.equal(layer.locked, true);
  assert.equal(f.cancelled, 2);
  assert.equal(f.session.history.past.length, 5);
  f.session.undo();
  assert.equal(f.session.document.layers[0].locked, undefined);
  f.session.redo();
  assert.equal(f.session.document.layers[0].locked, true);
});

test("duplicate layer names are rejected and a new layer is activated after commit", () => {
  const f = setup();
  control(rows(f.root)[0], 1).change("Details");
  assert.match(f.messages.at(-1), /unikt/);
  assert.equal(f.session.history.past.length, 0);
  f.root.children[0].children[0].onclick();
  assert.equal(f.session.document.layers.length, 3);
  assert.equal(f.activeLayer, f.session.document.layers[2].id);
  assert.equal(f.session.history.past.length, 1);
});

test("compact layer table labels columns, activation and print state, and retains scrolling", () => {
  const f = setup();
  const table = f.root.children[1].children[0];
  assert.deepEqual(table.children[0].children[0].children.map(th => th.textContent),
    ["Aktivt", "Namn", "Färg", "Linjetyp", "Visa", "Lås", "Skriv ut"]);
  assert.equal(control(rows(f.root)[0], 0).attrs["aria-pressed"], "true");
  assert.equal(control(rows(f.root)[1], 0).attrs["aria-pressed"], "false");
  f.root.children[1].scrollTop = 120;
  const plot = control(rows(f.root)[1], 6);
  assert.equal(plot.checked, true);
  plot.checked = false;
  plot.onchange();
  assert.equal(f.session.document.layers[1].plot, false);
  assert.equal(f.root.children[1].scrollTop, 120);
  f.session.undo();
  f.render();
  assert.equal(control(rows(f.root)[1], 6).checked, true);
  control(rows(f.root)[1], 0).onclick();
  assert.equal(f.activeLayer, "1");
  assert.equal(f.root.children[2].textContent, "Aktivt lager: Details");
});
