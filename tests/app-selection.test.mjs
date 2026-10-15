import test from "node:test";
import assert from "node:assert/strict";
import { createSelectionController } from "../src/editor/selection-controller.js";
import { createDocumentEditor } from "../src/editor/document-editor.js";
import { createEditorState } from "../src/editor/editor-state.js";
import { DocumentSession } from "../src/model/document-session.js";

import { rectSelect } from "../src/model/entity-geometry.js";

import { grips } from "../src/model/grips.js";

function app(initial) {
  const documentSession = new DocumentSession(
    initial || {
      version: 1,
      name: "Selection",
      layers: [{ id: "0", name: "0", color: "#ffffff" }],
      entities: [],
    },
  );
  let doc = documentSession.document;
  const state = createEditorState();
  state.camera.scale = 1;
  const visible = (entity) =>
    !entity.hidden &&
    entity.space !== "paper" &&
    doc.layers.find((layer) => layer.id === entity.layer)?.visible !== false;
  const editable = (entity) =>
    !entity._xrefId &&
    visible(entity) &&
    !doc.layers.find((layer) => layer.id === entity.layer)?.locked;
  const selection = createSelectionController({
    state,
    getDocument: () => doc,
    drawingSpace: () => "model",
    visible,
    editable,
  });
  const editor = createDocumentEditor({
    getSession: () => documentSession,
    onChange: ({ kind, previous, document: next }) => {
      doc = next;
      if (kind === "append")
        selection.append(
          previous,
          doc.entities.slice(previous.entities.length),
        );
      selection.rebuild();
    },
  });
  selection.rebuild();
  return {
    addEntities: (entities, label) => editor.append(label, entities),
    hit: selection.hit,
    selectedEntities: selection.selectedEntities,
    selection: state.selection,
    snapIndex: () => selection.snapIndex,
    entities: () => selection.entities,
    document: () => doc,
    index: () => selection.index,
    undo: editor.undo,
    redo: editor.redo,
  };
}

test("new lines are rectangle-selectable and expose click selection, properties and grips before reload", () => {
  const editor = app(),
    region = { minX: -1, maxX: 21, minY: -1, maxY: 11 };
  for (let i = 0; i < 2; i++) {
    const entity = {
      id: `line-${i}`,
      type: "line",
      layer: "0",
      points: [
        { x: 0, y: i * 10 },
        { x: 20, y: i * 10 },
      ],
    };
    editor.addEntities([entity], "Line");
    assert.equal(editor.hit({ x: 10, y: i * 10 })?.id, entity.id);
    assert.equal(
      editor.entities().filter((e) => rectSelect(e, region, false)).length,
      i + 1,
    );
    editor.selection.add(entity.id);
    assert.equal(editor.selectedEntities().length, i + 1);
    assert.equal(grips(editor.selectedEntities().at(-1)).length, 2);
    assert.deepEqual(editor.index().query(region, true), editor.entities());
  }
  editor.undo();
  assert.equal(editor.entities().length, 1);
  editor.redo();
  assert.equal(editor.entities().length, 2);
  editor.addEntities(
    [
      {
        id: "third",
        type: "line",
        layer: "0",
        points: [
          { x: 0, y: 5 },
          { x: 20, y: 5 },
        ],
      },
    ],
    "Line",
  );
  assert.equal(
    editor.entities().filter((e) => rectSelect(e, region, true)).length,
    3,
  );
  assert.deepEqual(editor.entities(), editor.document().entities);
});

test("references participate in snapping and fit geometry but cannot be picked or edited", () => {
  const line = {
    id: "source",
    type: "line",
    layer: "0",
    points: [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
    ],
  };
  const ref = {
    id: "ref",
    name: "Plan.dwg",
    path: "Plan.dwg",
    kind: "overlay",
    point: { x: 100, y: 200 },
    rotation: 0,
    scale: 1,
    fade: 60,
    geometry: [line],
  };
  const editor = app({
    version: 1,
    layers: [{ id: "0", name: "0", color: "#ffffff" }],
    entities: [],
    references: [ref],
  });
  assert.equal(editor.entities().length, 1);
  assert.equal(editor.hit({ x: 110, y: 200 }), null);
  assert.ok(editor.snapIndex().nearby({ x: 100, y: 200 }, 1).length);
  editor.selection.add(editor.entities()[0].id);
  assert.equal(editor.selectedEntities().length, 0);
  const disabled = app({
    version: 1,
    layers: [{ id: "0", name: "0", color: "#ffffff" }],
    entities: [],
    references: [{ ...ref, snap: false }],
  });
  assert.equal(disabled.snapIndex().nearby({ x: 100, y: 200 }, 1).length, 0);
  disabled.addEntities([{ ...line, id: "host" }], "Line");
  assert.equal(disabled.entities().length, 2);
});
