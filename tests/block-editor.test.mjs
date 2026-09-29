import test from "node:test";
import assert from "node:assert/strict";
import {
  createBlock,
  insertBlock,
  updateBlockDefinition,
} from "../src/blocks.js";
import { clone, validDocument, History } from "../src/core.js";
const layer = { id: "0", name: "0", color: "#ffffff" };
function fixture() {
  const block = createBlock(
    [
      {
        id: "line",
        type: "line",
        layer: "0",
        points: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
        ],
      },
      {
        id: "text",
        type: "text",
        layer: "0",
        point: { x: 0, y: 2 },
        text: "Default",
        height: 1,
        rotation: 0,
        attributeTag: "NAME",
      },
    ],
    "Door",
    { x: 0, y: 0 },
    "0",
  );
  const other = insertBlock(block, { x: 100, y: 200 }, "0", "model");
  other.rotation = 1;
  other.scale = 2;
  other.mirrored = true;
  other.values.NAME = "Custom";
  const document = {
    version: 1,
    name: "Drawing",
    layers: [layer],
    entities: [block, other],
    blocks: [clone(block.definition)],
  };
  const draft = {
    version: 1,
    name: "Door2",
    layers: [layer],
    entities: clone(block.definition.entities),
    blockBase: { x: 1, y: 0 },
  };
  return { document, draft, id: block.definition.id };
}
test("block editing updates all references atomically and preserves transforms and renamed attribute values", () => {
  const { document, draft, id } = fixture();
  const before = clone(document);
  draft.entities[0].points[1].x = 20;
  draft.entities[1].attributeTag = "NUMBER";
  const result = updateBlockDefinition(document, id, draft);
  assert.deepEqual(document, before);
  assert.equal(result.entities[0].definition.entities[0].points[1].x, 19);
  assert.equal(result.entities[1].values.NUMBER, "Custom");
  for (const key of ["point", "rotation", "scale", "mirrored"])
    assert.deepEqual(result.entities[1][key], document.entities[1][key]);
  assert.equal(result.blocks[0].name, "Door2");
  assert.ok(validDocument(result));
  const history = new History();
  history.commit(document, result, "block");
  assert.deepEqual(history.undo(), document);
  assert.deepEqual(history.redo(), result);
});
test("invalid block edits leave original intact", () => {
  const { document, draft, id } = fixture();
  const before = clone(document);
  draft.entities.push(clone(draft.entities[1]));
  assert.throws(() => updateBlockDefinition(document, id, draft), /unika/);
  assert.deepEqual(document, before);
  draft.entities = [];
  assert.throws(() => updateBlockDefinition(document, id, draft));
});
test("new attributes receive defaults and removed attributes disappear", () => {
  const { document, draft, id } = fixture();
  draft.entities[1].id = "new";
  draft.entities[1].attributeTag = "NEW";
  const result = updateBlockDefinition(document, id, draft);
  assert.deepEqual(result.entities[1].values, { NEW: "Default" });
});
