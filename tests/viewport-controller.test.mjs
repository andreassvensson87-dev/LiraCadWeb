import test from "node:test";
import assert from "node:assert/strict";
import { createViewportController } from "../src/app/viewport-controller.js";
import { createEditorState } from "../src/editor/editor-state.js";

test("closing the final file does not paint a zero-sized hidden drawing surface", () => {
  const state = createEditorState();
  let size = { width: 640, height: 480 },
    paints = 0;
  const frames = [],
    canvas = { width: 640, height: 480, getBoundingClientRect: () => size };
  // A queued frame can run after the canvas has been hidden by the empty workspace.
  const controller = createViewportController({
    state,
    canvas,
    ctx: {},
    syncViewport: () => {},
    textEditor: { active: false },
    requestFrame: (callback) => frames.push(callback),
    createResizeObserver: () => ({ observe() {} }),
    getPixelRatio: () => 1,
    getDocument: () => {
      paints++;
      throw Error("Hidden workspace must not render");
    },
  });
  controller.schedule();
  size = { width: 0, height: 0 };
  controller.resize();
  frames.shift()();
  assert.equal(paints, 0);
  assert.equal(canvas.width, 640);
  size = { width: 800, height: 600 };
  controller.resize();
  assert.equal(canvas.width, 800);
  assert.equal(canvas.height, 600);
  assert.equal(frames.length, 1);
});
