import { dimensionParts } from "./dimensions.js";
import { add, sub, mul, dist, angle, polar } from "./core.js";
export function splitDimension(e) {
  if (!e.chain) return [e];
  const points = e.points
    .slice(0, -1)
    .sort((a, b) => (a.x - b.x) * e.axis.x + (a.y - b.y) * e.axis.y);
  return points
    .slice(1)
    .map((p, i) => ({
      ...e,
      chain: false,
      points: [points[i], p, e.points.at(-1)],
    }));
}
export function writeDimension(e, start, pair, point) {
  const [a, b, c, d] = e.points;
  const text = dimensionParts(e).find((p) => p.type === "text");
  let definition = c;
  if (e.kind === "linear" || e.kind === "aligned") {
    const u =
      e.kind === "aligned"
        ? mul(sub(b, a), 1 / dist(a, b))
        : e.axis || { x: 1, y: 0 };
    const n = { x: -u.y, y: u.x };
    definition = add(b, mul(n, (c.x - b.x) * n.x + (c.y - b.y) * n.y));
  } else if (e.kind === "radius") definition = a;
  else if (e.kind === "diameter")
    definition = polar(a, dist(a, b), angle(a, c) + Math.PI);
  else if (e.kind === "angular") definition = d;
  start("DIMENSION", e, "AcDbDimension");
  pair(2, e._dimBlock);
  point(definition);
  pair(30, 0);
  const center = add(
    text.point,
    polar(
      { x: 0, y: 0 },
      text.text.length * text.height * 0.325,
      text.rotation || 0,
    ),
  );
  point(center, 11, 21);
  pair(31, 0);
  pair(
    70,
    32 + { linear: 0, aligned: 1, diameter: 3, radius: 4, angular: 5 }[e.kind],
  );
  pair(71, 5);
  pair(1, e.text || "<>");
  pair(3, e._dimStyle);
  if (e.kind === "linear" || e.kind === "aligned") {
    pair(100, "AcDbAlignedDimension");
    point(a, 13, 23);
    pair(33, 0);
    point(b, 14, 24);
    pair(34, 0);
    if (e.kind === "linear") {
      pair(50, (Math.atan2(e.axis?.y || 0, e.axis?.x ?? 1) * 180) / Math.PI);
      pair(100, "AcDbRotatedDimension");
    }
  } else if (e.kind === "radius" || e.kind === "diameter") {
    pair(
      100,
      e.kind === "radius" ? "AcDbRadialDimension" : "AcDbDiametricDimension",
    );
    point(polar(a, dist(a, b), angle(a, c)), 15, 25);
    pair(35, 0);
    pair(40, Math.max(0, dist(a, c) - dist(a, b)));
  } else {
    pair(100, "AcDb3PointAngularDimension");
    const reverse = dimensionParts(e).find((p) => p.type === "arc")?.sweep < 0;
    point(reverse ? c : b, 13, 23);
    pair(33, 0);
    point(reverse ? b : c, 14, 24);
    pair(34, 0);
    point(a, 15, 25);
    pair(35, 0);
  }
}
export function dimensionStyles(styles, pair, handle) {
  const table = handle();
  pair(0, "TABLE");
  pair(2, "DIMSTYLE");
  pair(5, table);
  pair(330, "0");
  pair(100, "AcDbSymbolTable");
  pair(70, styles.length);
  pair(100, "AcDbDimStyleTable");
  pair(71, 0);
  for (const { name, height, precision } of styles) {
    pair(0, "DIMSTYLE");
    pair(105, handle());
    pair(330, table);
    pair(100, "AcDbSymbolTableRecord");
    pair(100, "AcDbDimStyleTableRecord");
    pair(2, name);
    pair(70, 0);
    pair(40, 1);
    pair(41, height * 0.85);
    pair(42, 0);
    pair(44, height * 0.5);
    pair(140, height);
    pair(147, height * 0.45);
    pair(271, precision);
    pair(179, precision);
    pair(277, 2);
    pair(275, 0);
    pair(280, 0);
  }
  pair(0, "ENDTAB");
}
