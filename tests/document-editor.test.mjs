import test from "node:test";
import assert from "node:assert/strict";
import { DocumentSession } from "../src/document-session.js";
import { createDocumentEditor } from "../src/document-editor.js";
import { createEditorState, updateToolState } from "../src/editor-state.js";
import { changeEntityGeometry } from "../src/entity-properties.js";

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

test("edits use the current file/block session and only notify after accepted changes", () => {
  const first = new DocumentSession(drawing("First")),
    second = new DocumentSession(drawing("Second"));
  let active = first;
  const events = [];
  const editor = createDocumentEditor({
    getSession: () => active,
    onChange: (event) => events.push(event),
  });
  editor.commit("Name", (draft) => {
    draft.name = "Changed";
  });
  assert.equal(first.document.name, "Changed");
  active = second;
  editor.commit("Name", (draft) => {
    draft.name = "Second changed";
  });
  assert.equal(first.document.name, "Changed");
  assert.equal(second.document.name, "Second changed");
  editor.undo();
  assert.equal(second.document.name, "Second");
  const before = second.document,
    redo = second.history.future.length,
    count = events.length;
  assert.throws(() =>
    editor.commit("Invalid", (draft) => {
      draft.layers = [];
    }),
  );
  assert.equal(second.document, before);
  assert.equal(second.history.future.length, redo);
  assert.equal(events.length, count);
  editor.commit("Same", () => {});
  assert.equal(events.length, count);
  editor.redo();
  assert.equal(second.document.name, "Second changed");
  assert.deepEqual(
    events.map((event) => event.kind),
    ["commit", "commit", "undo", "redo"],
  );
});

test("geometry edits preserve identity, are undoable and reject collapsed lines without losing redo", () => {
  const session = new DocumentSession(drawing("Geometry"));
  const editor = createDocumentEditor({ getSession: () => session });
  editor.commit("Endpoint", (draft) => {
    draft.entities[0] = changeEntityGeometry(
      draft.entities[0],
      "points.1.x",
      200,
    );
  });
  assert.equal(session.document.entities[0].id, "line");
  assert.equal(session.document.entities[0].points[1].x, 200);
  editor.undo();
  const before = session.document;
  assert.throws(
    () =>
      editor.commit("Collapsed", (draft) => {
        draft.entities[0] = changeEntityGeometry(
          draft.entities[0],
          "points.1.x",
          0,
        );
      }),
    /ändpunkter/,
  );
  assert.equal(session.document, before);
  editor.redo();
  assert.equal(session.document.entities[0].points[1].x, 200);
});

test("editor state is local to an application instance and contains no document snapshot", () => {
  const a = createEditorState(),
    b = createEditorState();
  a.selection.add("line");
  a.camera.scale = 2;
  a.commandHistory.push("LINE");
  assert.equal(b.selection.size, 0);
  assert.equal(b.camera.scale, 0.075);
  assert.deepEqual(b.commandHistory, []);
  assert.equal(Object.hasOwn(a, "document"), false);
});

test("tool completion clears transient state without replacing the editor state", () => {
  const state = createEditorState();
  let resets = 0;
  const clear = () => {
    resets++;
    state.trackAnchors = [];
  };
  updateToolState(state, { name: "LINE", phase: "points", points: [] }, clear);
  state.trackAnchors = [{ x: 0, y: 0 }];
  updateToolState(state, null, clear);
  assert.equal(state.tool, null);
  assert.deepEqual(state.trackAnchors, []);
  assert.equal(resets, 2);
  assert.ok(state.selection instanceof Set);
});
