import test from "node:test";
import assert from "node:assert/strict";
import { wheelNavigation, commandSubmitKey } from "../src/navigation.js";
test("two-finger scroll pans both axes without changing zoom", () => {
  assert.deepEqual(
    wheelNavigation({ deltaX: 24, deltaY: -37, deltaMode: 0, ctrlKey: false }),
    { kind: "pan", dx: 24, dy: -37 },
  );
});
test("pinch zooms in both input modes; mouse wheel zooms with Ctrl released", () => {
  for (const device of ["trackpad", "mouse"]) {
    const result = wheelNavigation(
      { deltaX: 0, deltaY: -10, deltaMode: 0, ctrlKey: true },
      device,
    );
    assert.equal(result.kind, "zoom");
    assert.ok(result.factor > 1);
  }
  assert.ok(
    wheelNavigation(
      { deltaX: 0, deltaY: 3, deltaMode: 1, ctrlKey: false },
      "mouse",
    ).factor < 1,
  );
});
test("line and page wheel units normalize to pixels", () => {
  assert.deepEqual(wheelNavigation({ deltaX: 1, deltaY: 2, deltaMode: 1 }), {
    kind: "pan",
    dx: 16,
    dy: 32,
  });
  assert.deepEqual(
    wheelNavigation({ deltaX: 0, deltaY: 1, deltaMode: 2 }, "trackpad", 600),
    { kind: "pan", dx: 0, dy: 600 },
  );
});
test("Space confirms commands but preserves spaces in annotation text and ignores IME/repeat", () => {
  assert.equal(commandSubmitKey({ key: " " }), true);
  assert.equal(commandSubmitKey({ key: " " }, true), false);
  assert.equal(commandSubmitKey({ key: "Enter" }, true), true);
  assert.equal(commandSubmitKey({ key: " ", repeat: true }), false);
  assert.equal(commandSubmitKey({ key: "Enter", isComposing: true }), false);
  assert.equal(commandSubmitKey({ key: " ", ctrlKey: true }), false);
});
