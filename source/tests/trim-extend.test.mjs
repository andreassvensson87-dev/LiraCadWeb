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
