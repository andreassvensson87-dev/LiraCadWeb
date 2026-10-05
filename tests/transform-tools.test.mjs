import test from "node:test";
import assert from "node:assert/strict";
import { Editor } from "../src/editor.js";
import { transformTools, applyTransformChange } from "../src/transform-tools.js";
import { drawingTools } from "../src/drawing-tools.js";
import { History } from "../src/history.js";
import { createBlock, blockParts } from "../src/blocks.js";
import { dimensionChain, dimensionParts } from "../src/dimensions.js";
import { validDocument } from "../src/core.js";

const line = (id, layer = "walls") => ({
  id, layer, type: "line", points: [{ x: 5, y: 10 }, { x: 15, y: 20 }],
  color: "#123456", lineType: "DASHED", space: "layout-1",
});
function setup(entities = [line("a"), line("b", "details")], preselect = ["a", "b"]) {
  let doc = { entities: structuredClone(entities) };
  let selection = new Set(preselect);
  let serial = 0;
  const history = new History(), messages = [];
  const editor = new Editor({
    tools: { ...drawingTools, ...transformTools },
    getContext: () => ({ entities: doc.entities.filter((e) => selection.has(e.id)) }),
    applyChange(change) {
      const before = structuredClone(doc);
      const result = applyTransformChange(doc.entities, change, () => `copy-${++serial}`);
      doc.entities = result.entities;
      selection = new Set(result.ids);
      history.commit(before, doc, change.label);
    },
    notify: (m) => messages.push(m),
  });
  return {
    editor, history, messages,
    get doc() { return doc; },
    get selection() { return selection; },
    select(ids) { selection = new Set(ids); },
    undo() { doc = history.undo(); },
    redo() { doc = history.redo(); },
  };
}
const point = (e, x, y) => e.dispatch({ type: "point", point: { x, y } });
const text = (e, text, cursor = { x: 100, y: 0 }) =>
  e.dispatch({ type: "text", text, cursor });

test("MOVE preselection uses exact relative displacement and one undo transaction", () => {
  const f = setup(), before = structuredClone(f.doc);
  f.editor.start("MOVE");
  assert.match(f.editor.describe().prompt, /baspunkt/);
  text(f.editor, "100,200");
  assert.match(f.editor.describe().prompt, /målpunkt/);
  text(f.editor, "@25,-5");
  assert.equal(f.editor.state, null);
  assert.equal(f.doc.entities.length, 2);
  assert.deepEqual(f.doc.entities[0], { ...before.entities[0], points: [{ x: 30, y: 5 }, { x: 40, y: 15 }] });
  assert.equal(f.doc.entities[1].layer, "details");
  assert.deepEqual([...f.selection], ["a", "b"]);
  assert.equal(f.history.past.length, 1);
  const after = structuredClone(f.doc);
  f.undo();
  assert.deepEqual(f.doc, before);
  f.redo();
  assert.deepEqual(f.doc, after);
});

test("COPY keeps originals and properties, assigns fresh IDs and selects only copies", () => {
  const f = setup(), before = structuredClone(f.doc);
  f.editor.start("COPY");
  point(f.editor, 0, 0);
  point(f.editor, 10, 20);
  assert.deepEqual(f.doc.entities.slice(0, 2), before.entities);
  assert.deepEqual(f.doc.entities[2], { ...before.entities[0], id: "copy-1", points: [{ x: 15, y: 30 }, { x: 25, y: 40 }] });
  assert.equal(f.doc.entities[3].layer, "details");
  assert.deepEqual([...f.selection], ["copy-1", "copy-2"]);
  assert.equal(new Set(f.doc.entities.map((e) => e.id)).size, 4);
  assert.equal(f.history.past.length, 1);
  const after = structuredClone(f.doc);
  f.undo();
  assert.deepEqual(f.doc, before);
  f.redo();
  assert.deepEqual(f.doc, after);
});

test("command-first selection rejects typed coordinates, waits for Enter and uses latest choice", () => {
  for (const name of ["MOVE", "COPY"]) {
    const f = setup(undefined, []);
    f.editor.start(name);
    assert.equal(f.editor.state.phase, "select");
    point(f.editor, 0, 0);
    assert.deepEqual(f.editor.state.points, []);
    text(f.editor, "0,0");
    assert.match(f.messages.at(-1), /Välj objekt/);
    text(f.editor, "");
    assert.match(f.messages.at(-1), /Inga objekt/);
    f.select(["a"]);
    f.select(["b"]);
    text(f.editor, "");
    assert.equal(f.editor.state.phase, "points");
    assert.deepEqual(f.editor.state.ids, ["b"]);
    point(f.editor, 0, 0);
    text(f.editor, "@10,0");
    assert.deepEqual(f.doc.entities[0], line("a"));
    assert.equal(f.history.past.length, 1);
  }
});

test("preview is transient, isolated and retains each object's own layer", () => {
  for (const name of ["MOVE", "COPY"]) {
    const f = setup(), before = structuredClone(f.doc);
    f.editor.start(name);
    assert.deepEqual(f.editor.preview({ x: 10, y: 20 }), []);
    point(f.editor, 0, 0);
    const preview = f.editor.preview({ x: 10, y: 20 });
    assert.deepEqual(preview[0].points[0], { x: 15, y: 30 });
    assert.equal(preview[1].layer, "details");
    preview[0].points[0].x = 99;
    assert.deepEqual(f.doc, before);
    assert.equal(f.history.past.length, 0);
    f.editor.cancel();
    assert.deepEqual(f.editor.preview({ x: 10, y: 20 }), []);
    assert.deepEqual(f.doc, before);
    f.editor.start(name);
    point(f.editor, 0, 0);
    f.editor.start("LINE");
    assert.deepEqual(f.editor.state.points, []);
    assert.deepEqual(f.doc, before);
  }
});

test("current inspector changes are retained by preview and completion", () => {
  const f = setup();
  f.editor.start("MOVE");
  point(f.editor, 0, 0);
  f.doc.entities[0].color = "#abcdef";
  f.doc.entities[0].points[0].x = 50;
  assert.equal(f.editor.preview({ x: 10, y: 0 })[0].color, "#abcdef");
  text(f.editor, "@10,0");
  assert.equal(f.doc.entities[0].color, "#abcdef");
  assert.equal(f.doc.entities[0].points[0].x, 60);
});

test("empty and invalid point input does not advance or commit", () => {
  const f = setup();
  f.editor.start("MOVE");
  text(f.editor, "");
  text(f.editor, "invalid");
  assert.deepEqual(f.editor.state.points, []);
  point(f.editor, 0, 0);
  text(f.editor, "");
  text(f.editor, "invalid");
  assert.equal(f.editor.state.points.length, 1);
  assert.equal(f.history.past.length, 0);
  assert.equal(f.messages.length, 4);
});

test("polar and directed distance input work for MOVE and COPY", () => {
  for (const name of ["MOVE", "COPY"]) {
    for (const value of ["@20<90", "20"]) {
      const f = setup([line("a")], ["a"]);
      f.editor.start(name);
      point(f.editor, 0, 0);
      text(f.editor, value, { x: 0, y: 10 });
      const moved = f.doc.entities.at(-1);
      assert.ok(Math.abs(moved.points[0].x - 5) < 1e-8);
      assert.ok(Math.abs(moved.points[0].y - 30) < 1e-8);
    }
  }
});

test("disappearing or no-longer-editable selected objects prevent partial completion", () => {
  const f = setup();
  f.editor.start("MOVE");
  point(f.editor, 0, 0);
  f.select(["a"]);
  text(f.editor, "@10,0");
  assert.match(f.messages.at(-1), /Objektvalet har ändrats/);
  assert.equal(f.history.past.length, 0);
  assert.equal(f.editor.state.points.length, 1);
});

test("transaction failure retains base point and source selection", () => {
  for (const name of ["MOVE", "COPY"]) {
    const editor = new Editor({
      tools: transformTools, getContext: () => ({ entities: [line("a")] }),
      applyChange() { throw Error("failed"); },
    });
    editor.start(name);
    point(editor, 0, 0);
    const before = structuredClone(editor.state);
    assert.throws(() => text(editor, "@10,0"), /failed/);
    assert.deepEqual(editor.state, before);
  }
});

test("blocks, dimensions, bulges and viewports retain their data through MOVE/COPY", () => {
  const entities = [
    { id: "block", type: "block", point: { x: 10, y: 20 }, scale: 2, rotation: 0.5,
      definitionId: "definition", attributes: { NUMMER: "A1" }, layer: "walls", space: "model" },
    { id: "arc", type: "polyline", points: [{ x: 0, y: 0 }, { x: 10, y: 0 }], bulges: [1], layer: "walls", space: "model" },
    { id: "dim", type: "dimension", kind: "linear", points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 5 }], height: 2.5, layer: "walls", space: "model" },
    { id: "vp", type: "viewport", center: { x: 10, y: 10 }, width: 100, height: 50,
      viewCenter: { x: 1000, y: 2000 }, viewHeight: 500, layer: "walls", space: "layout-1" },
  ];
  for (const name of ["MOVE", "COPY"]) {
    const f = setup(entities, entities.map((e) => e.id));
    f.editor.start(name);
    point(f.editor, 0, 0);
    point(f.editor, 20, 30);
    const result = f.doc.entities.slice(-4);
    assert.deepEqual(result[0].point, { x: 30, y: 50 });
    assert.deepEqual(result[0].attributes, { NUMMER: "A1" });
    assert.equal(result[0].definitionId, "definition");
    assert.equal(result[0].rotation, 0.5);
    assert.deepEqual(result[1].bulges, [1]);
    assert.deepEqual(result[2].points[2], { x: 20, y: 35 });
    assert.deepEqual(result[3].center, { x: 30, y: 40 });
    assert.deepEqual(result[3].viewCenter, entities[3].viewCenter);
    assert.deepEqual(entities[0].point, { x: 10, y: 20 });
  }
});

const advancedTransforms = ["ROTATE", "SCALE", "MIRROR"];
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);

test("ROTATE accepts degrees and a clicked direction around the chosen center", () => {
  for (const typed of [true, false]) {
    const f = setup();
    f.editor.start("ROTATE");
    point(f.editor, 5, 10);
    assert.match(f.editor.describe().prompt, /vinkel/);
    if (typed) text(f.editor, "90");
    else point(f.editor, 5, 20);
    near(f.doc.entities[0].points[0].x, 5);
    near(f.doc.entities[0].points[0].y, 10);
    near(f.doc.entities[0].points[1].x, -5);
    near(f.doc.entities[0].points[1].y, 20);
    assert.equal(f.editor.state, null);
    assert.equal(f.history.past.length, 1);
  }
});

test("ROTATE accepts negative angles, decimal comma and zero", () => {
  for (const value of ["-90", "22,5", "0"]) {
    const f = setup();
    f.editor.start("ROTATE");
    point(f.editor, 5, 10);
    text(f.editor, value);
    const radians = Number(value.replace(",", ".")) * Math.PI / 180;
    near(f.doc.entities[0].points[1].x, 5 + 10 * Math.cos(radians) - 10 * Math.sin(radians));
    near(f.doc.entities[0].points[1].y, 10 + 10 * Math.sin(radians) + 10 * Math.cos(radians));
    assert.equal(f.editor.state, null);
  }
});

test("SCALE accepts a factor or 1000 mm per factor from the base point", () => {
  for (const typed of [true, false]) {
    const f = setup();
    f.editor.start("SCALE");
    point(f.editor, 5, 10);
    if (typed) text(f.editor, "2");
    else point(f.editor, 2005, 10);
    assert.deepEqual(f.doc.entities[0].points, [{ x: 5, y: 10 }, { x: 25, y: 30 }]);
    assert.equal(f.history.past.length, 1);
    assert.equal(f.editor.state, null);
  }
});

test("MIRROR accepts an exact relative axis and preserves object identities", () => {
  const f = setup();
  f.editor.start("MIRROR");
  text(f.editor, "0,0");
  assert.match(f.editor.describe().prompt, /andra punkt/);
  text(f.editor, "@0,100");
  near(f.doc.entities[0].points[0].x, -5);
  near(f.doc.entities[0].points[0].y, 10);
  near(f.doc.entities[0].points[1].x, -15);
  near(f.doc.entities[0].points[1].y, 20);
  assert.deepEqual([...f.selection], ["a", "b"]);
  assert.equal(f.doc.entities.length, 2);
});

test("advanced transforms wait for selection, commit once, preserve style and undo/redo", () => {
  for (const name of advancedTransforms) {
    const f = setup(undefined, []), before = structuredClone(f.doc);
    f.editor.start(name);
    point(f.editor, 0, 0);
    assert.deepEqual(f.editor.state.points, []);
    text(f.editor, "");
    assert.match(f.messages.at(-1), /Inga objekt/);
    f.select(["a", "b"]);
    text(f.editor, "");
    point(f.editor, 0, 0);
    point(f.editor, 1000, 1000);
    assert.equal(f.editor.state, null);
    assert.equal(f.history.past.length, 1);
    const after = structuredClone(f.doc);
    for (let i = 0; i < 2; i++)
      for (const key of ["id", "layer", "color", "lineType", "space"])
        assert.equal(after.entities[i][key], before.entities[i][key]);
    f.undo();
    assert.deepEqual(f.doc, before);
    f.redo();
    assert.deepEqual(f.doc, after);
  }
});

test("advanced previews are transient and cancel/switch never change geometry", () => {
  for (const name of advancedTransforms) {
    const f = setup(), before = structuredClone(f.doc);
    f.editor.start(name);
    point(f.editor, 0, 0);
    const preview = f.editor.preview({ x: 0, y: 2000 });
    assert.equal(preview.length, 2);
    assert.equal(preview[1].layer, "details");
    preview[0].points[0].x = 999;
    assert.deepEqual(f.doc, before);
    f.editor.cancel();
    assert.deepEqual(f.editor.preview({ x: 0, y: 2000 }), []);
    f.editor.start(name);
    point(f.editor, 0, 0);
    f.editor.start("MOVE");
    assert.deepEqual(f.editor.state.points, []);
    assert.equal(f.history.past.length, 0);
  }
});

test("invalid scales and degenerate mirror axes keep the base point without committing", () => {
  const f = setup();
  f.editor.start("SCALE");
  point(f.editor, 0, 0);
  for (const value of ["0", "-2", "Infinity", "invalid", ""]) {
    text(f.editor, value);
    assert.equal(f.editor.state.points.length, 1);
    assert.equal(f.history.past.length, 0);
  }
  point(f.editor, 0, 0);
  assert.match(f.messages.at(-1), /större än 0/);
  const preview = f.editor.preview({ x: 0, y: 0 });
  assert.ok(preview[0].points[1].x > 0);
  text(f.editor, "0,5");
  near(f.doc.entities[0].points[1].x, 7.5);
  f.editor.start("MIRROR");
  point(f.editor, 0, 0);
  point(f.editor, 0, 0);
  assert.match(f.messages.at(-1), /två olika punkter/);
  assert.equal(f.editor.state.points.length, 1);
  assert.deepEqual(f.editor.preview({ x: 0, y: 0 }), []);
  point(f.editor, 0, 1);
  assert.equal(f.editor.state, null);
});

test("ROTATE and SCALE reject invalid numeric input and retain their base points", () => {
  for (const name of ["ROTATE", "SCALE"]) {
    const f = setup();
    f.editor.start(name);
    point(f.editor, 0, 0);
    text(f.editor, "@10,0");
    assert.match(f.messages.at(-1), /giltigt tal/);
    assert.equal(f.editor.state.points.length, 1);
    assert.equal(f.history.past.length, 0);
  }
});

test("mixed viewport selections cannot rotate or mirror but can scale on paper", () => {
  const viewport = { id: "v", type: "viewport", layer: "walls", space: "layout-1",
    points: [{ x: 10, y: 20 }, { x: 110, y: 70 }],
    viewCenter: { x: 1000, y: 2000 }, viewScale: 0.1, locked: false };
  for (const name of ["ROTATE", "MIRROR"]) {
    const f = setup([line("a"), viewport], ["a", "v"]), before = structuredClone(f.doc);
    f.editor.start(name);
    point(f.editor, 0, 0);
    assert.deepEqual(f.editor.preview({ x: 0, y: 1000 }), []);
    point(f.editor, 0, 1000);
    assert.match(f.messages.at(-1), /viewports/);
    assert.equal(f.history.past.length, 0);
    assert.deepEqual(f.doc, before);
    assert.equal(f.editor.state.points.length, 1);
  }
  const f = setup([viewport], ["v"]);
  f.editor.start("SCALE");
  point(f.editor, 0, 0);
  text(f.editor, "2");
  assert.deepEqual(f.doc.entities[0].points, [{ x: 20, y: 40 }, { x: 220, y: 140 }]);
  assert.deepEqual(f.doc.entities[0].viewCenter, viewport.viewCenter);
  assert.equal(f.doc.entities[0].viewScale, 0.1);
});

test("advanced transaction failure retains state for retry", () => {
  for (const name of advancedTransforms) {
    const editor = new Editor({
      tools: transformTools, getContext: () => ({ entities: [line("a")] }),
      applyChange() { throw Error("failed"); },
    });
    editor.start(name);
    point(editor, 0, 0);
    const before = structuredClone(editor.state);
    assert.throws(() => point(editor, 0, 1000), /failed/);
    assert.deepEqual(editor.state, before);
  }
});

test("advanced transforms preserve real block definitions/values, dimension chains and curved paths", () => {
  const block = createBlock([
    { id: "bl", type: "line", layer: "walls", points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] },
    { id: "at", type: "text", layer: "walls", point: { x: 0, y: 2 },
      height: 1, rotation: 0, text: "Default", attributeTag: "NUMMER" },
  ], "Door", { x: 0, y: 0 }, "walls");
  block.values.NUMMER = "Custom";
  const chain = dimensionChain({ id: "d", layer: "walls", height: 2.5, precision: 0 },
    [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 250, y: 0 }],
    { x: 0, y: -40 }, { x: 1, y: 0 });
  const arc = { id: "p", type: "polyline", layer: "walls", closed: false,
    points: [{ x: 0, y: 0 }, { x: 10, y: 0 }], bulges: [1] };
  for (const name of advancedTransforms) {
    const f = setup([block, chain, arc], [block.id, "d", "p"]);
    f.editor.start(name);
    point(f.editor, 0, 0);
    if (name === "ROTATE") text(f.editor, "90");
    else if (name === "SCALE") text(f.editor, "2");
    else point(f.editor, 0, 1000);
    const [b, d, p] = f.doc.entities;
    assert.deepEqual(b.definition, block.definition);
    assert.deepEqual(b.values, { NUMMER: "Custom" });
    assert.equal(blockParts(b).find((part) => part.type === "text").text, "Custom");
    if (name === "ROTATE") near(b.rotation, Math.PI / 2);
    if (name === "SCALE") assert.equal(b.scale, 2);
    if (name === "MIRROR") assert.equal(b.mirrored, true);
    assert.deepEqual(dimensionParts(d).filter((part) => part.type === "text").map((part) => part.text),
      name === "SCALE" ? ["200", "300"] : ["100", "150"]);
    assert.deepEqual(p.bulges, name === "MIRROR" ? [-1] : [1]);
    assert.ok(validDocument({ version: 1, name: "test", layers: [
      { id: "walls", name: "walls", color: "#ffffff" },
    ], entities: f.doc.entities }));
  }
});
