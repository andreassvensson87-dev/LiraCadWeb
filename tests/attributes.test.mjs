import test from "node:test";
import assert from "node:assert/strict";
import {
  attributeOptions,
  attributeSchema,
  validAttributeSchema,
  sortedAttributes,
  validAttributeDate,
} from "../src/attributes.js";
import {
  createBlock,
  insertBlock,
  updateBlockDefinition,
} from "../src/blocks.js";
import { validDocument, toDXF } from "../src/core.js";
const layer = { id: "0", name: "0", color: "#ffffff" };
const part = {
  id: "att",
  type: "text",
  layer: "0",
  point: { x: 0, y: 0 },
  height: 2,
  rotation: 0,
  attributeTag: "HANDLING",
  text: "Förslagshandling",
  attributeSchema: {
    label: "Handlingstyp",
    type: "choice",
    options: ["Förslagshandling", "Bygghandling"],
    order: 1,
    allowCustom: true,
  },
};
test("attribute schemas are backward compatible, bounded and ordered", () => {
  assert.equal(attributeSchema({ attributeTag: "OLD" }).type, "text");
  assert.ok(validAttributeSchema(undefined));
  assert.ok(validAttributeSchema(part.attributeSchema));
  assert.deepEqual(attributeOptions(" A\nB\n A\n\n"), ["A", "B"]);
  assert.equal(
    validAttributeSchema({ ...part.attributeSchema, options: ["A", "A"] }),
    false,
  );
  assert.equal(
    validAttributeSchema({ ...part.attributeSchema, type: "unknown" }),
    false,
  );
  assert.equal(
    validAttributeSchema({ ...part.attributeSchema, options: ["A\nB"] }),
    false,
  );
  assert.deepEqual(
    sortedAttributes([
      part,
      {
        ...part,
        id: "first",
        attributeSchema: { ...part.attributeSchema, order: 0 },
      },
    ]).map((p) => p.id),
    ["first", "att"],
  );
});
test("attribute definitions survive project save and block edits; instance choices stay independent and export as text", () => {
  const block = createBlock([part], "Title", { x: 0, y: 0 }, "0");
  const copy = insertBlock(block, { x: 20, y: 0 }, "0", "model");
  copy.values.HANDLING = "Bygghandling";
  const doc = {
    version: 1,
    name: "Attributes",
    layers: [layer],
    entities: [block, copy],
  };
  assert.ok(validDocument(doc));
  const restored = JSON.parse(JSON.stringify(doc));
  assert.deepEqual(
    restored.entities[0].definition.entities[0].attributeSchema,
    part.attributeSchema,
  );
  const draft = {
    name: "Title",
    layers: [layer],
    entities: [
      {
        ...part,
        attributeSchema: {
          ...part.attributeSchema,
          options: ["Relationshandling"],
        },
      },
    ],
  };
  const updated = updateBlockDefinition(restored, block.definition.id, draft);
  assert.equal(updated.entities[0].values.HANDLING, "Förslagshandling");
  assert.equal(updated.entities[1].values.HANDLING, "Bygghandling");
  assert.ok(toDXF(updated).includes("Bygghandling"));
  assert.equal(
    validDocument({
      ...doc,
      entities: [{ ...part, attributeSchema: { type: "bad" } }],
    }),
    false,
  );
});
test("date fields accept real calendar dates and empty values only", () => {
  for (const date of ["", "2024-02-29", "2026-09-29"])
    assert.ok(validAttributeDate(date));
  for (const date of ["2025-02-29", "2026-13-01", "tomorrow", "2026-02-30"])
    assert.equal(validAttributeDate(date), false);
});
