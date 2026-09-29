import test from "node:test";
import assert from "node:assert/strict";
import { createSnapIndex, nearbySnaps, resolveSnap } from "../src/snapping.js";
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
test("original entity endpoints remain eligible for all transform base and target points", () => {
  const index = createSnapIndex([
    {
      id: "selected",
      type: "line",
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
    },
  ]);
  for (const base of [undefined, { x: 50, y: 50 }]) {
    const raw = { x: 98, y: 2 },
      r = resolveSnap({
        raw,
        base,
        candidates: nearbySnaps(index, raw, 5),
        tolerance: 5,
        polarEnabled: true,
      });
    assert.equal(r.mode, "object");
    assert.deepEqual(r.p, { x: 100, y: 0 });
    assert.equal(r.id, "selected");
  }
});
test("exact line, circle and arc intersections", () => {
  const es = [
    {
      id: "l",
      type: "line",
      points: [
        { x: -20, y: 3 },
        { x: 20, y: 3 },
      ],
    },
    { id: "c", type: "circle", center: { x: 0, y: 0 }, radius: 5 },
  ];
  const hits = nearbySnaps(createSnapIndex(es), { x: 4, y: 3 }, 0.1);
  assert.ok(
    hits.some((s) => s.kind === "Skärning" && Math.abs(s.p.x - 4) < 1e-8),
  );
  es[1] = { ...es[1], type: "arc", start: Math.PI, sweep: Math.PI };
  assert.equal(nearbySnaps(createSnapIndex(es), { x: 4, y: 3 }, 0.1).length, 0);
});
test("polar projects onto 45 degree ray with pixel-derived tolerance", () => {
  const r = resolveSnap({
    raw: { x: 102, y: 98 },
    base: { x: 0, y: 0 },
    polarEnabled: true,
    polarStep: 45,
    tolerance: 5,
  });
  assert.equal(r.mode, "polar");
  near(r.p.x, 100);
  near(r.p.y, 100);
  assert.equal(
    resolveSnap({
      raw: { x: 100, y: 40 },
      base: { x: 0, y: 0 },
      polarEnabled: true,
      polarStep: 45,
      tolerance: 5,
    }).mode,
    "free",
  );
});
test("exact object snap outranks polar and track", () => {
  const r = resolveSnap({
    raw: { x: 101, y: 1 },
    base: { x: 0, y: 0 },
    polarEnabled: true,
    track: true,
    anchors: [{ x: 100, y: 50 }],
    candidates: [{ p: { x: 102, y: 2 }, kind: "Ändpunkt" }],
    tolerance: 5,
  });
  assert.deepEqual(r.p, { x: 102, y: 2 });
  assert.equal(r.mode, "object");
});
test("tracking projects from an acquired reference and crosses two references", () => {
  const a = { x: 20, y: 30 },
    b = { x: 100, y: 80 };
  const one = resolveSnap({
    raw: { x: 22, y: 100 },
    anchors: [a],
    track: true,
    tolerance: 5,
  });
  assert.deepEqual(one.p, { x: 20, y: 100 });
  const two = resolveSnap({
    raw: { x: 22, y: 79 },
    anchors: [a, b],
    track: true,
    tolerance: 5,
  });
  assert.deepEqual(two.p, { x: 20, y: 80 });
  assert.equal(two.guides.length, 2);
  assert.equal(
    resolveSnap({
      raw: { x: 22, y: 100 },
      anchors: [a],
      track: false,
      tolerance: 5,
    }).mode,
    "free",
  );
});
test("ortho constrains coordinates even when a nearby object is off-axis", () => {
  const r = resolveSnap({
    raw: { x: 100, y: 3 },
    base: { x: 0, y: 0 },
    ortho: true,
    candidates: [{ p: { x: 100, y: 3 } }],
    tolerance: 5,
  });
  near(r.p.y, 0);
});
