import test from "node:test";
import assert from "node:assert/strict";
import { createReferenceController } from "../src/app/reference-controller.js";
import { createActiveDocument } from "../src/editor/active-document.js";
import { DocumentSession } from "../src/model/document-session.js";
const drawing = (name) => ({
  version: 1,
  name,
  layers: [{ id: "0", name: "0", color: "#ffffff" }],
  entities: [
    {
      id: "line",
      type: "line",
      layer: "0",
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
    },
  ],
});
function fixture() {
  const model = createActiveDocument();
  model.session = new DocumentSession(drawing("Parent"));
  model.activeLayer = "0";
  const workspace = { active: {}, activeId: "parent" },
    state = { tool: null },
    messages = [];
  let complete;
  const file = {
    name: "Child.liracad",
    size: 100,
    text: () =>
      new Promise((resolve) => {
        complete = () => resolve(JSON.stringify(drawing("Child")));
      }),
  };
  const controller = createReferenceController({
    projectWorkspace: workspace,
    model,
    getTextEditor: () => ({ active: null }),
    finishTextEdit: () => true,
    cancel() {},
    pickReferenceFiles: async () => [file],
    log: (message) => messages.push(message),
    state,
    commit: (label, edit) => model.session.commit(label, edit),
  });
  return {
    model,
    workspace,
    state,
    messages,
    controller,
    finish: () => complete?.(),
  };
}

test("reference loading publishes one accepted transaction and leaves source geometry separate", async () => {
  const f = fixture();
  const read = f.controller.readReference();
  // Let the picker and reader reach their async boundary.
  await new Promise((resolve) => setImmediate(resolve));
  f.finish();
  await read;
  assert.equal(f.model.document.references.length, 1);
  assert.equal(f.model.document.entities.length, 1);
  assert.equal(f.model.history.past.length, 1);
  assert.match(f.messages[0], /1 referens inläst/);
});

test("a reference read completing after a project switch cannot change the new active session", async () => {
  const f = fixture(),
    parent = f.model.session,
    read = f.controller.readReference();
  await new Promise((resolve) => setImmediate(resolve));
  f.model.session = new DocumentSession(drawing("Other"));
  f.workspace.activeId = "other";
  const before = f.model.document;
  f.finish();
  await read;
  assert.equal(f.model.document, before);
  assert.equal(f.model.history.past.length, 0);
  assert.equal(parent.history.past.length, 0);
  assert.match(f.messages.at(-1), /ändrades medan referenserna lästes/);
});
