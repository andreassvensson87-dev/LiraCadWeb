import test from "node:test";
import assert from "node:assert/strict";
import { trimExtend } from "../src/trim-extend.js";
const p = (x, y) => ({ x, y }),
  line = (id, a, b) => ({ id, type: "line", layer: "0", points: [a, b] });
const target = line("t", p(0, 0), p(10, 0));
const bounds = [line("a", p(3, -10), p(3, 10)), line("b", p(7, -10), p(7, 10))];
test("trim removes clicked interval and splits line preserving style", () => {
  const result = trimExtend(target, bounds, p(5, 0), "TRIM");
  assert.deepEqual(
    result.map((e) => e.points),
    [
      [p(0, 0), p(3, 0)],
      [p(7, 0), p(10, 0)],
    ],
  );
  assert.notEqual(result[0].id, result[1].id);
  assert.equal(result[1].layer, "0");
  assert.deepEqual(trimExtend(target, bounds, p(1, 0), "TRIM")[0].points, [
    p(3, 0),
    p(10, 0),
  ]);
  assert.deepEqual(target.points, [p(0, 0), p(10, 0)]);
});
test("extend uses nearest forward boundary and respects finite edges", () => {
  const boundaries = [
    line("a", p(20, -2), p(20, 2)),
    line("b", p(15, -2), p(15, 2)),
  ];
  assert.deepEqual(
    trimExtend(target, boundaries, p(9, 0), "EXTEND")[0].points,
    [p(0, 0), p(15, 0)],
  );
  assert.throws(() =>
    trimExtend(target, [line("a", p(15, 2), p(15, 4))], p(9, 0), "EXTEND"),
  );
  assert.throws(() => trimExtend(target, boundaries, p(1, 0), "EXTEND"));
});
test("circle boundaries cut line and extend endpoints", () => {
  const c = { id: "c", type: "circle", center: p(5, 0), radius: 2 };
  assert.deepEqual(
    trimExtend(target, [c], p(5, 0), "TRIM").map((e) => e.points),
    [
      [p(0, 0), p(3, 0)],
      [p(7, 0), p(10, 0)],
    ],
  );
  const short = line("s", p(0, 0), p(1, 0));
  assert.deepEqual(trimExtend(short, [c], p(1, 0), "EXTEND")[0].points, [
    p(0, 0),
    p(3, 0),
  ]);
});
test("closed polyline opens around removed edge section retaining other corners", () => {
  const rect = {
    id: "r",
    type: "polyline",
    closed: true,
    points: [p(0, 0), p(10, 0), p(10, 10), p(0, 10)],
  };
  const result = trimExtend(rect, bounds, p(5, 0), "TRIM");
  assert.equal(result.length, 1);
  assert.equal(result[0].closed, false);
  assert.deepEqual(result[0].points, [
    p(7, 0),
    p(10, 0),
    p(10, 10),
    p(0, 10),
    p(0, 0),
    p(3, 0),
  ]);
  assert.throws(() => trimExtend(rect, bounds, p(0, 0), "EXTEND"));
});
test("open polyline trim preserves vertices and extend changes only terminal vertex", () => {
  const e = { id: "p", type: "polyline", points: [p(0, 0), p(5, 0), p(5, 5)] };
  assert.deepEqual(
    trimExtend(e, [line("b", p(0, 8), p(10, 8))], p(5, 5), "EXTEND")[0].points,
    [p(0, 0), p(5, 0), p(5, 8)],
  );
  assert.deepEqual(trimExtend(e, [bounds[0]], p(0, 0), "TRIM")[0].points, [
    p(3, 0),
    p(5, 0),
    p(5, 5),
  ]);
});
test("arc trim and extension retain direction and reject boundary outside finite segment", () => {
  for (const sign of [1, -1]) {
    const e = {
      id: "arc",
      type: "arc",
      center: p(0, 0),
      radius: 10,
      start: 0,
      sweep: (sign * Math.PI) / 2,
    };
    const cut = line("b", p(5, -20), p(5, 20));
    const result = trimExtend(e, [cut], p(10, 0), "TRIM")[0];
    assert.ok(Math.abs(result.start - (sign * Math.PI) / 3) < 1e-7);
    assert.ok(Math.abs(result.sweep - (sign * Math.PI) / 6) < 1e-7);
    const extended = trimExtend(
      e,
      [line("c", p(-5, -20), p(-5, 20))],
      p(0, sign * 10),
      "EXTEND",
    )[0];
    assert.ok(Math.abs(extended.sweep - (sign * 2 * Math.PI) / 3) < 1e-7);
    assert.throws(() =>
      trimExtend(
        e,
        [line("c", p(-5, 30), p(-5, 40))],
        p(0, sign * 10),
        "EXTEND",
      ),
    );
  }
});
test("no intersection, self boundaries and unsupported objects do not mutate", () => {
  assert.throws(() => trimExtend(target, [target], p(5, 0), "TRIM"));
  assert.throws(() =>
    trimExtend(target, [line("a", p(0, 1), p(10, 1))], p(5, 0), "TRIM"),
  );
  assert.throws(() => trimExtend({ type: "text" }, bounds, p(0, 0), "TRIM"));
});

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`);
test("circle trim removes clicked interval across the angle seam and preserves identity and style", () => {
  const circle = { id: "circle", type: "circle", center: p(0, 0), radius: 10, layer: "steel", color: "#ff0000", lineType: "DASHED" };
  const before = structuredClone(circle), boundary = line("cut", p(5, -20), p(5, 20));
  const [arc] = trimExtend(circle, [boundary], p(10, 0), "TRIM");
  assert.equal(arc.type, "arc"); near(arc.start, Math.PI / 3); near(arc.sweep, Math.PI * 4 / 3);
  for (const key of ["id", "radius", "layer", "color", "lineType"]) assert.equal(arc[key], circle[key]);
  assert.deepEqual(arc.center, circle.center); assert.deepEqual(circle, before);
  const [other] = trimExtend(circle, [boundary], p(-10, 0), "TRIM");
  near(other.start, Math.PI * 5 / 3); near(other.sweep, Math.PI * 2 / 3);
  assert.throws(() => trimExtend(circle, [boundary], p(10, 0), "EXTEND"), /saknar ändar/);
});
test("circle requires two distinct finite intersections and uses neighboring cuts", () => {
  const circle = { id: "c", type: "circle", center: p(0, 0), radius: 10 };
  for (const bound of [line("tangent", p(10, -20), p(10, 20)), line("short", p(0, 0), p(20, 0)), line("miss", p(0, 20), p(0, 30))])
    assert.throws(() => trimExtend(circle, [bound], p(10, 0), "TRIM"));
  const [arc] = trimExtend(circle, [line("h", p(-20, 0), p(20, 0)), line("v", p(0, -20), p(0, 20))], p(7, 7), "TRIM");
  near(arc.start, Math.PI / 2); near(arc.sweep, Math.PI * 1.5);
});

import { polylineParts } from "../src/polyline.js";
import { polar } from "../src/geometry.js";
const curvedPath = sign => ({ id: "poly", type: "polyline", points: [p(10, 0), p(0, sign * 10)], bulges: [sign * Math.tan(Math.PI / 8)] });
test("curved polyline trim retains exact circular geometry in both directions", () => {
  for (const sign of [1, -1]) {
    const poly = curvedPath(sign), before = structuredClone(poly);
    const [result] = trimExtend(poly, [line("cut", p(5, -20), p(5, 20))], p(10, 0), "TRIM");
    assert.equal(result.type, "polyline"); assert.equal(result.bulges.length, result.points.length - 1);
    const [arc] = polylineParts(result);
    near(arc.radius, 10); near(arc.center.x, 0); near(arc.center.y, 0);
    near(arc.start, sign * Math.PI / 3); near(arc.sweep, sign * Math.PI / 6);
    assert.deepEqual(poly, before);
    assert.throws(() => trimExtend(poly, [line("miss", p(5, 20), p(5, 30))], p(10, 0), "TRIM"));
  }
});
test("mixed polyline split retains bulges on the correct fragments", () => {
  const poly = { ...curvedPath(1), points: [p(10, 0), p(0, 10), p(-10, 10)], bulges: [Math.tan(Math.PI / 8), 0] };
  const results = trimExtend(poly, [line("a", p(8, -20), p(8, 20)), line("b", p(4, -20), p(4, 20))], polar(p(0, 0), 10, Math.PI / 4), "TRIM");
  assert.equal(results.length, 2); assert.notEqual(results[0].id, results[1].id);
  for (const result of results) {
    const [arc] = polylineParts(result); near(arc.radius, 10);
    assert.equal(result.bulges.length, result.points.length - 1);
  }
  assert.equal(polylineParts(results[1]).at(-1).type, "line");
  assert.deepEqual(results[1].points.at(-1), p(-10, 10));
});
test("closed curved path opens with correct bulges across closing seam", () => {
  const poly = { id: "closed", type: "polyline", closed: true, points: [p(10, 0), p(-10, 0)], bulges: [1, 1] };
  const [result] = trimExtend(poly, [line("cut", p(5, -20), p(5, 20))], p(10, 0), "TRIM");
  assert.equal(result.closed, false); assert.equal(result.bulges.length, result.points.length - 1);
  const parts = polylineParts(result); near(parts.reduce((sum, arc) => sum + arc.sweep, 0), Math.PI * 4 / 3);
  for (const arc of parts) { near(arc.radius, 10); near(arc.center.x, 0); near(arc.center.y, 0); }
});
test("curved terminal segments extend along their circle at either end", () => {
  for (const sign of [1, -1]) {
    const poly = curvedPath(sign);
    for (const first of [true, false]) {
      const bound = first ? line("cut", p(-20, -sign * 5), p(20, -sign * 5)) : line("cut", p(-5, -20), p(-5, 20));
      const [result] = trimExtend(poly, [bound], poly.points[first ? 0 : 1], "EXTEND");
      const [arc] = polylineParts(result);
      near(arc.radius, 10); near(arc.center.x, 0); near(arc.center.y, 0); near(arc.sweep, sign * Math.PI * 2 / 3);
      assert.deepEqual(result.points[first ? 1 : 0], poly.points[first ? 1 : 0]);
    }
  }
});
test("straight endpoint extension keeps preceding curve intact", () => {
  const poly = { ...curvedPath(1), points: [p(10, 0), p(0, 10), p(-10, 10)], bulges: [Math.tan(Math.PI / 8), 0] };
  const [result] = trimExtend(poly, [line("cut", p(-15, 0), p(-15, 20))], p(-10, 10), "EXTEND");
  assert.deepEqual(result.bulges, poly.bulges); assert.deepEqual(result.points.at(-1), p(-15, 10));
});

import { demoDocument } from "../src/demo-document.js";
import { validDocument } from "../src/document.js";
import { toDXF } from "../src/dxf-export.js";
import { importDXF } from "../src/dxf-import.js";
test("trimmed circle and curved polyline remain valid editable geometry after DXF round trip", () => {
  const doc = demoDocument(), cut = line("cut", p(5, -20), p(5, 20));
  const circle = { id: "circle", type: "circle", center: p(0, 0), radius: 10 };
  doc.entities = [...trimExtend(circle, [cut], p(10, 0), "TRIM"), ...trimExtend(curvedPath(-1), [cut], p(10, 0), "TRIM")]
    .map(e => ({ ...e, layer: doc.layers[0].id, space: "model" }));
  assert.equal(validDocument(doc), true);
  const after = importDXF(toDXF(doc)).document;
  assert.equal(validDocument(after), true);
  assert.equal(after.entities[0].type, "arc"); near(after.entities[0].sweep, Math.PI * 4 / 3);
  const [part] = polylineParts(after.entities[1]); near(part.radius, 10); near(part.sweep, -Math.PI / 6);
});
