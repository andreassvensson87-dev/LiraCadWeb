import { dimensionParts } from "./dimensions.js";
import { add, sub, mul, dist, angle, polar } from "./geometry.js";
import { textLayout } from "./text.js";
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
  const text = dimensionParts(e).find((p) => p.type === "text") || dimensionParts({...e,dimensionGraphics:undefined}).find(p=>p.type==='text');
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
  const layout=textLayout(text), x=(layout.x+layout.width/2)*layout.fit*(text.textMirrorX?-1:1), y=-(layout.top+layout.bottom)/2*(text.textMirrorY?-1:1), rotation=text.rotation||0;
  const center = e.dimensionTextPoint || add(text.point,{x:x*Math.cos(rotation)-y*Math.sin(rotation),y:x*Math.sin(rotation)+y*Math.cos(rotation)});
  point(center, 11, 21);
  pair(31, 0);
  pair(
    70,
    32 + (e.dimensionTextPoint?128:0) + { linear: 0, aligned: 1, diameter: 3, radius: 4, angular: 5 }[e.kind],
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
export function dimensionStyles(styles, pair, handle,textStyleHandles=new Map()) {
  const table = handle();
  pair(0, "TABLE");
  pair(2, "DIMSTYLE");
  pair(5, table);
  pair(330, "0");
  pair(100, "AcDbSymbolTable");
  pair(70, styles.length);
  pair(100, "AcDbDimStyleTable");
  pair(71, 0);
  for (const { name, height, precision,arrowSize,extensionOffset,extensionOvershoot,textGap,measurementScale,dimensionPost,decimalSeparator,zeroSuppress,fontStyle } of styles) {
    pair(0, "DIMSTYLE");
    pair(105, handle());
    pair(330, table);
    pair(100, "AcDbSymbolTableRecord");
    pair(100, "AcDbDimStyleTableRecord");
    pair(2, name);
    pair(70, 0);
    pair(40, 1);
    pair(41, arrowSize ?? height * 0.85);
    pair(42, extensionOffset ?? 0);
    pair(44, extensionOvershoot ?? height * 0.5);
    pair(140, height);
    pair(147, textGap ?? height * 0.45);
    pair(144, measurementScale ?? 1);
    pair(3,dimensionPost || '<>');pair(278,(decimalSeparator||'.').charCodeAt(0));pair(78,zeroSuppress||0);
    if(textStyleHandles.has(fontStyle))pair(340,textStyleHandles.get(fontStyle));
    pair(271, precision);
    pair(179, precision);
    pair(277, 2);
    pair(275, 0);
    pair(280, 0);
  }
  pair(0, "ENDTAB");
}
