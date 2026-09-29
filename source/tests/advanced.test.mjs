import test from "node:test";
import assert from "node:assert/strict";
import {
  offset,
  dist,
  polar,
  validDocument,
  transformed,
  toDXF,
  hitDistance,
  bounds,
} from "../src/core.js";
import {
  joinEntities,
  explodePolyline,
  insertVertex,
  removeVertex,
  corner,
} from "../src/editing.js";
import { dimensionParts } from "../src/dimensions.js";
import { viewportCamera, viewportFromCamera } from "../src/layout.js";
import { layoutSVG } from "../src/plot.js";
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
const rect = {
  id: "p",
  layer: "0",
  type: "polyline",
  closed: true,
  points: [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ],
};
const line = (id, a, b) => ({ id, layer: "0", type: "line", points: [a, b] });
const doc = (entities) => ({
  version: 1,
  name: "Test",
  layers: [{ id: "0", name: "0", color: "#ffffff" }],
  entities,
});
test("closed polyline offset works inside/outside and for reversed winding", () => {
  for (const e of [rect, { ...rect, points: rect.points.toReversed() }]) {
    const inner = offset(e, 10, { x: 50, y: 50 }),
      outer = offset(e, 10, { x: 150, y: 50 });
    assert.deepEqual(bounds(inner), { minX: 10, minY: 10, maxX: 90, maxY: 90 });
    for (const [key, value] of Object.entries({
      minX: -10,
      minY: -10,
      maxX: 110,
      maxY: 110,
    }))
      near(bounds(outer)[key], value);
    assert.equal(offset(e, 60, { x: 50, y: 50 }), null);
  }
});
test("open polyline offsets adjoining edges with a shared intersection", () => {
  const e = { ...rect, closed: false, points: rect.points.slice(0, 3) };
  assert.deepEqual(offset(e, 10, { x: 50, y: 10 }).points, [
    { x: 0, y: 10 },
    { x: 90, y: 10 },
    { x: 90, y: 100 },
  ]);
});
test("explode/join reconstructs reversed, shuffled rectangle without losing style", () => {
  const es = explodePolyline({ ...rect, color: "#ff0000" });
  const joined = joinEntities([
    es[2],
    { ...es[0], points: es[0].points.toReversed() },
    es[3],
    es[1],
  ]);
  assert.equal(joined.closed, true);
  assert.equal(joined.points.length, 4);
  assert.equal(joined.color, "#ff0000");
  assert.deepEqual(bounds(joined), bounds(rect));
  assert.throws(() =>
    joinEntities([es[0], line("far", { x: 500, y: 0 }, { x: 600, y: 0 })]),
  );
});
test("polyline vertex insertion/removal is reversible and guards minimum size", () => {
  const e = insertVertex(rect, { x: 50, y: 0 });
  assert.equal(e.points.length, 5);
  assert.deepEqual(removeVertex(e, { x: 50, y: 0 }).points, rect.points);
  assert.throws(() =>
    removeVertex({ ...rect, points: rect.points.slice(0, 3) }, { x: 0, y: 0 }),
  );
});
test("fillet creates tangent quarter arc and keeps remote endpoints", () => {
  const a = line("a", { x: 0, y: 0 }, { x: 100, y: 0 }),
    b = line("b", { x: 0, y: 0 }, { x: 0, y: 100 });
  const r = corner(a, b, "FILLET", 10);
  assert.deepEqual(r.updated[0].points[1], a.points[1]);
  near(dist(r.bridge.center, r.updated[0].points[0]), 10);
  near(dist(r.bridge.center, r.updated[1].points[0]), 10);
  near(Math.abs(r.bridge.sweep), Math.PI / 2);
  near(r.bridge.center.x, 10);
  near(r.bridge.center.y, 10);
  assert.equal(corner(a, b, "FILLET", 0).bridge, null);
  assert.throws(() => corner(a, b, "FILLET", 200));
  const ch = corner(a, b, "CHAMFER", 10, 20);
  near(ch.bridge.points[0].x, 10);
  near(ch.bridge.points[1].y, 20);
});
test("all five dimension kinds have finite, selectable geometry and valid project data", () => {
  for (const kind of ["linear", "aligned", "radius", "diameter", "angular"]) {
    const e = {
      id: "d",
      type: "dimension",
      kind,
      layer: "0",
      height: 2.5,
      precision: 1,
      points:
        kind === "angular"
          ? [
              { x: 0, y: 0 },
              { x: 100, y: 0 },
              { x: 0, y: 100 },
              { x: 30, y: 30 },
            ]
          : [
              { x: 0, y: 0 },
              { x: 100, y: 0 },
              { x: 50, y: 20 },
            ],
    };
    const parts = dimensionParts(e);
    assert.ok(parts.some((p) => p.type === "text"));
    assert.ok(Number.isFinite(bounds(e).maxX));
    assert.ok(validDocument(doc([e])));
    const moved = transformed(e, "MOVE", { x: 0, y: 0 }, { x: 10, y: 20 });
    assert.deepEqual(moved.points[0], { x: 10, y: 20 });
    assert.equal(hitDistance(e, parts[0].points[0]), 0);
  }
});
test("dimension measurement follows grip points and rotation preserves linear measurement", () => {
  const e = {
    type: "dimension",
    kind: "linear",
    layer: "0",
    height: 2,
    axis: { x: 1, y: 0 },
    points: [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 50, y: 20 },
    ],
  };
  const rotated = transformed(e, "ROTATE", { x: 0, y: 0 }, null, Math.PI / 3);
  assert.equal(
    dimensionParts(rotated).find((p) => p.type === "text").text,
    "100",
  );
  assert.equal(
    dimensionParts({
      ...e,
      points: [
        { x: 0, y: 0 },
        { x: 120, y: 0 },
        { x: 50, y: 20 },
      ],
    }).find((p) => p.type === "text").text,
    "120",
  );
});
test("viewport camera conversion roundtrips with offset paper camera and arbitrary screen size", () => {
  const v = {
    type: "viewport",
    points: [
      { x: 15, y: 25 },
      { x: 405, y: 282 },
    ],
    viewCenter: { x: 4000, y: 2500 },
    viewScale: 0.02,
  };
  const paper = { x: 180, y: 150, scale: 2 };
  const camera = viewportCamera(v, paper, 900, 650);
  const result = viewportFromCamera(v, camera, paper, 900, 650);
  near(result.viewCenter.x, v.viewCenter.x);
  near(result.viewCenter.y, v.viewCenter.y);
  near(result.viewScale, v.viewScale);
});
test("layout export preserves paper/viewports and SVG clips model without duplicating it into project", () => {
  const layout = { id: "sheet", name: "A3", width: 420, height: 297 };
  const v = {
    id: "v",
    layer: "0",
    type: "viewport",
    space: "sheet",
    points: [
      { x: 10, y: 10 },
      { x: 410, y: 287 },
    ],
    viewCenter: { x: 0, y: 0 },
    viewScale: 0.02,
    locked: true,
  };
  const d = { ...doc([rect, v]), layouts: [layout] };
  assert.equal(validDocument(d), true);
  const svg = layoutSVG(d, layout);
  assert.match(svg, /clipPath/);
  assert.match(svg, /width="420mm"/);
  const dxf = toDXF(d);
  assert.match(dxf, /\nVIEWPORT\n/);
  assert.match(dxf, /\nLAYOUT\n/);
  assert.match(dxf, /410\nA3\n/);
  assert.equal(
    validDocument({ ...d, entities: [{ ...v, viewScale: 0 }] }),
    false,
  );
});
