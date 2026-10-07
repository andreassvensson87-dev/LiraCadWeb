import test from "node:test";
import assert from "node:assert/strict";
import { createEntityRenderer } from "../src/entity-renderer.js";
import { commandPrompt } from "../src/command-prompts.js";
import { createInspectorControls } from "../src/inspector-controls.js";

test("entity renderer uses current camera and preserves arc orientation", () => {
  let camera = { scale: 2 };
  const arcs = [],
    dash = [];
  const ctx = {
    beginPath() {},
    stroke() {},
    arc(...args) {
      arcs.push(args);
    },
    setLineDash(v) {
      dash.push(v);
    },
  };
  const painter = createEntityRenderer({
    ctx,
    screen: (p) => ({ x: p.x * camera.scale, y: -p.y * camera.scale }),
    getCamera: () => camera,
    layerOf: () => ({ lineType: "DASHED" }),
  });
  const entity = {
    type: "arc",
    center: { x: 3, y: 4 },
    radius: 5,
    start: 0.3,
    sweep: 1,
  };
  painter.drawEntity(entity, "red");
  assert.deepEqual(arcs[0], [6, -8, 10, -0.3, -1.3, true]);
  camera = { scale: 4 };
  painter.drawEntity(entity, "red", true, true);
  assert.equal(arcs[1][2], 20);
  assert.deepEqual(dash.at(-2), [6, 4]);
  assert.deepEqual(dash.at(-1), []);
  assert.equal(ctx.lineWidth, 1.8);
});
test("renderer skips hidden block parts without mutating definition", () => {
  let strokes = 0;
  const ctx = {
    beginPath() {},
    moveTo() {},
    lineTo() {},
    stroke() {
      strokes++;
    },
    setLineDash() {},
  };
  const painter = createEntityRenderer({
    ctx,
    screen: (p) => p,
    getCamera: () => ({ scale: 1 }),
    layerOf: (e) => ({ visible: e.layer !== "hidden", color: "#ffffff" }),
  });
  const block = {
    type: "block",
    point: { x: 0, y: 0 },
    scale: 1,
    rotation: 0,
    layer: "0",
    values: {},
    definition: {
      entities: [
        {
          id: "a",
          type: "line",
          layer: "hidden",
          points: [
            { x: 0, y: 0 },
            { x: 1, y: 1 },
          ],
        },
      ],
    },
  };
  const original = structuredClone(block);
  painter.drawEntity(block, "red");
  assert.equal(strokes, 0);
  assert.deepEqual(block, original);
});
test("command prompts reflect tool phases and current defaults", () => {
  assert.equal(commandPrompt(null), "");
  assert.match(
    commandPrompt({ name: "OFFSET", points: [], phase: "distance" }),
    /startpunkt/,
  );
  assert.match(
    commandPrompt({ name: "OFFSET", points: [{}], phase: "distance" }),
    /slutpunkt/,
  );
  assert.match(
    commandPrompt({
      name: "DIMLINEAR",
      points: [{}, {}],
      phase: "dimensionPlace",
    }),
    /hela måttlinjen/,
  );
  assert.match(
    commandPrompt({ name: "TRIM", points: [], phase: "trimPick" }),
    /Trimma:.*Shift.*förläng/,
  );
  assert.match(
    commandPrompt(
      { name: "FILLET", points: [], phase: "cornerSize" },
      { cornerSize: 25, chamferSize: 100 },
    ),
    /<25>/,
  );
});
// Small DOM adapter verifies control events without relying on browser globals.
const document = {
  createElement(tag) {
    return {
      tag,
      children: [],
      value: "",
      append(...nodes) {
        this.children.push(...nodes);
      },
      blur() {
        this.onblur?.();
      },
    };
  },
};
test("inspector applies once across change and blur, Escape restores accepted input", () => {
  const changes = [],
    errors = [];
  const { field } = createInspectorControls({
    document,
    onInvalid: (m) => errors.push(m),
  });
  const input = field("Height", 10, (v) => changes.push(v)).children[1];
  input.value = "20";
  input.onchange();
  input.onblur();
  assert.deepEqual(changes, [20]);
  input.value = "30";
  input.onkeydown({ key: "Escape", stopPropagation() {} });
  assert.equal(input.value, "20");
  assert.deepEqual(changes, [20]);
  input.value = "invalid";
  input.onchange();
  assert.equal(errors.length, 1);
  assert.deepEqual(changes, [20]);
});
test("inspector multiline Enter keeps editing; Ctrl Enter commits", () => {
  const changes = [];
  const { field } = createInspectorControls({ document, onInvalid() {} });
  const input = field("Text", "First", (v) => changes.push(v), "multiline")
    .children[1];
  input.value = "First\nSecond";
  input.onkeydown({ key: "Enter" });
  assert.deepEqual(changes, []);
  input.onkeydown({ key: "Enter", ctrlKey: true, preventDefault() {} });
  assert.deepEqual(changes, ["First\nSecond"]);
});

test("inspector keeps the accepted value when the document transaction rejects a change", () => {
  const errors = [];
  const { field } = createInspectorControls({ document, onInvalid: (m) => errors.push(m) });
  const input = field("X", 10, () => { throw Error("Ogiltig ritning"); }).children[1];
  input.value = "1000000000000000";
  input.onchange();
  assert.equal(input.value, "10");
  assert.deepEqual(errors, ["Ogiltig ritning"]);
  input.onblur();
  assert.equal(errors.length, 1);
});
