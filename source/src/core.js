import { dxfLayouts } from "./dxf-layout.js";
import { polylineOffset } from "./editing.js";
import { dimensionParts, validDimension } from "./dimensions.js";
import { textLines, needsMtext, mtextContent, textChunks } from "./text.js";
export const TAU = Math.PI * 2;
export const clone = (value) => structuredClone(value);
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
export const mul = (a, k) => ({ x: a.x * k, y: a.y * k });
export const angle = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
export const polar = (c, r, a) => ({
  x: c.x + r * Math.cos(a),
  y: c.y + r * Math.sin(a),
});
export const mod = (a) => ((a % TAU) + TAU) % TAU;
export const uid = () => globalThis.crypto.randomUUID();
export const number = (s) => {
  const t = String(s).trim().replace(",", ".");
  return t !== "" && Number.isFinite(Number(t)) ? Number(t) : null;
};
export function parsePoint(text, base, cursor) {
  let s = text.trim(),
    relative = s.startsWith("@");
  if (relative) s = s.slice(1);
  if (s.includes("<")) {
    const v = s.split("<").map(number);
    if (v.length !== 2 || v.includes(null) || (relative && !base)) return null;
    return polar(
      relative ? base : { x: 0, y: 0 },
      v[0],
      (v[1] * Math.PI) / 180,
    );
  }
  if (s.includes(",")) {
    const v = s.split(",").map(number);
    if (v.length !== 2 || v.includes(null) || (relative && !base)) return null;
    return add({ x: v[0], y: v[1] }, relative ? base : { x: 0, y: 0 });
  }
  const n = number(s);
  if (n === null || !base || !cursor) return null;
  return polar(base, n, angle(base, cursor));
}
export function arcThrough(a, b, c) {
  // Work near the origin for stability at large survey coordinates.
  const q = sub(b, a),
    r = sub(c, a),
    d = 2 * (q.x * r.y - q.y * r.x);
  if (
    Math.abs(d) <
    1e-10 * Math.max(1, Math.hypot(q.x, q.y) * Math.hypot(r.x, r.y))
  )
    return null;
  const q2 = q.x * q.x + q.y * q.y,
    r2 = r.x * r.x + r.y * r.y;
  const center = add(a, {
    x: (q2 * r.y - r2 * q.y) / d,
    y: (q.x * r2 - r.x * q2) / d,
  });
  const start = angle(center, a),
    end = angle(center, c),
    mid = angle(center, b),
    ccw = mod(end - start);
  return {
    center,
    radius: dist(center, a),
    start,
    sweep: mod(mid - start) <= ccw ? ccw : ccw - TAU,
  };
}
export function onArc(e, a) {
  return e.sweep >= 0
    ? mod(a - e.start) <= e.sweep + 1e-8
    : mod(e.start - a) <= -e.sweep + 1e-8;
}
export function pointsOf(e) {
  if (e.type === "dimension") return dimensionParts(e).flatMap(pointsOf);
  if (e.type === "viewport") {
    const [a, b] = e.points;
    return [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }];
  }
  if (e.type === "circle")
    return Array.from({ length: 96 }, (_, i) =>
      polar(e.center, e.radius, (i * TAU) / 96),
    );
  if (e.type === "arc") {
    const steps = Math.max(12, Math.ceil(Math.abs(e.sweep) * 24));
    return Array.from({ length: steps + 1 }, (_, i) =>
      polar(e.center, e.radius, e.start + (e.sweep * i) / steps),
    );
  }
  if (e.type === "text") {
    const lines = textLines(e.text),
      w = Math.max(1, ...lines.map((s) => s.length)) * e.height * 0.65,
      h = e.height,
      bottom = -(lines.length - 1) * h * 1.4;
    return [
      { x: 0, y: bottom },
      { x: w, y: bottom },
      { x: w, y: h },
      { x: 0, y: h },
    ].map((p) =>
      add(e.point, {
        x: p.x * Math.cos(e.rotation || 0) - p.y * Math.sin(e.rotation || 0),
        y: p.x * Math.sin(e.rotation || 0) + p.y * Math.cos(e.rotation || 0),
      }),
    );
  }
  return e.points || [];
}
export function bounds(e) {
  let p = pointsOf(e);
  if (e.type === "circle")
    p = [
      sub(e.center, { x: e.radius, y: e.radius }),
      add(e.center, { x: e.radius, y: e.radius }),
    ];
  if (e.type === "arc")
    p = [
      polar(e.center, e.radius, e.start),
      polar(e.center, e.radius, e.start + e.sweep),
      ...[0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]
        .filter((a) => onArc(e, a))
        .map((a) => polar(e.center, e.radius, a)),
    ];
  if (e.type === "leader" && e.text) {
    const end = e.points.at(-1);
    p = [
      ...p,
      ...pointsOf({
        ...e,
        type: "text",
        point: add(end, {
          x: (e.height || 120) / 3,
          y: ((e.height || 120) * 7) / 24,
        }),
        text: e.text,
        height: e.height || 120,
      }),
    ];
  }
  return {
    minX: Math.min(...p.map((q) => q.x)),
    minY: Math.min(...p.map((q) => q.y)),
    maxX: Math.max(...p.map((q) => q.x)),
    maxY: Math.max(...p.map((q) => q.y)),
  };
}
export function segmentDistance(p, a, b) {
  const v = sub(b, a),
    len = v.x * v.x + v.y * v.y;
  const t = len
    ? Math.max(0, Math.min(1, ((p.x - a.x) * v.x + (p.y - a.y) * v.y) / len))
    : 0;
  return dist(p, add(a, mul(v, t)));
}
export function inside(p, poly) {
  let yes = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i],
      b = poly[j];
    if (
      a.y > p.y !== b.y > p.y &&
      p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x
    )
      yes = !yes;
  }
  return yes;
}
export function hitDistance(e, p) {
  if (e.type === "dimension")
    return Math.min(...dimensionParts(e).map((part) => hitDistance(part, p)));
  if (e.type === "circle") return Math.abs(dist(p, e.center) - e.radius);
  if (e.type === "arc")
    return onArc(e, angle(e.center, p))
      ? Math.abs(dist(p, e.center) - e.radius)
      : Math.min(
          dist(p, polar(e.center, e.radius, e.start)),
          dist(p, polar(e.center, e.radius, e.start + e.sweep)),
        );
  const pts = pointsOf(e),
    closed =
      e.type === "hatch" ||
      e.type === "text" ||
      e.type === "viewport" ||
      e.closed;
  if ((e.type === "hatch" || e.type === "text") && inside(p, pts)) return 0;
  let d = Infinity;
  for (let i = 1; i < pts.length; i++)
    d = Math.min(d, segmentDistance(p, pts[i - 1], pts[i]));
  if (closed && pts.length)
    d = Math.min(d, segmentDistance(p, pts.at(-1), pts[0]));
  if (e.type === "leader" && e.text)
    d = Math.min(
      d,
      hitDistance(
        {
          type: "text",
          point: add(e.points.at(-1), {
            x: (e.height || 120) / 3,
            y: ((e.height || 120) * 7) / 24,
          }),
          text: e.text,
          height: e.height || 120,
        },
        p,
      ),
    );
  return d;
}
export function segments(e) {
  if (e.type === "dimension") return dimensionParts(e).flatMap(segments);
  const p = pointsOf(e),
    s = [];
  for (let i = 1; i < p.length; i++) s.push([p[i - 1], p[i]]);
  if (e.closed || ["circle", "hatch", "text", "viewport"].includes(e.type))
    s.push([p.at(-1), p[0]]);
  return s;
}
export function intersection(a, b, c, d) {
  const v = sub(b, a),
    w = sub(d, c),
    den = v.x * w.y - v.y * w.x;
  if (Math.abs(den) < 1e-9) return null;
  const q = sub(c, a),
    t = (q.x * w.y - q.y * w.x) / den,
    u = (q.x * v.y - q.y * v.x) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? add(a, mul(v, t)) : null;
}
export function rectSelect(e, r, crossing) {
  const b = bounds(e);
  if (!crossing)
    return (
      b.minX >= r.minX &&
      b.maxX <= r.maxX &&
      b.minY >= r.minY &&
      b.maxY <= r.maxY
    );
  if (b.maxX < r.minX || b.minX > r.maxX || b.maxY < r.minY || b.minY > r.maxY)
    return false;
  const p = [
    { x: r.minX, y: r.minY },
    { x: r.maxX, y: r.minY },
    { x: r.maxX, y: r.maxY },
    { x: r.minX, y: r.maxY },
  ];
  if (
    pointsOf(e).some(
      (q) => q.x >= r.minX && q.x <= r.maxX && q.y >= r.minY && q.y <= r.maxY,
    )
  )
    return true;
  if (["hatch", "text"].includes(e.type) && inside(p[0], pointsOf(e)))
    return true;
  return segments(e).some(([a, b]) =>
    p.some((c, i) => intersection(a, b, c, p[(i + 1) % 4])),
  );
}
export function snapPoints(e) {
  if (e.type === "dimension")
    return e.points.map((p) => ({ p, kind: "Måttpunkt" }));
  if (e.type === "viewport")
    return pointsOf(e).map((p) => ({ p, kind: "Ändpunkt" }));
  if (e.type === "circle")
    return [
      { p: e.center, kind: "Centrum" },
      ...[0, Math.PI / 2, Math.PI, Math.PI * 1.5].map((a) => ({
        p: polar(e.center, e.radius, a),
        kind: "Kvadrant",
      })),
    ];
  if (e.type === "arc")
    return [
      { p: e.center, kind: "Centrum" },
      { p: polar(e.center, e.radius, e.start), kind: "Ändpunkt" },
      { p: polar(e.center, e.radius, e.start + e.sweep), kind: "Ändpunkt" },
      {
        p: polar(e.center, e.radius, e.start + e.sweep / 2),
        kind: "Mittpunkt",
      },
    ];
  if (e.type === "text") return [{ p: e.point, kind: "Insättning" }];
  return [
    ...e.points.map((p) => ({ p, kind: "Ändpunkt" })),
    ...segments(e).map(([a, b]) => ({
      p: mul(add(a, b), 0.5),
      kind: "Mittpunkt",
    })),
  ];
}
export function transform(
  e,
  fn,
  { scale = 1, rotation = 0, mirror = false } = {},
) {
  const n = clone(e);
  if (n.points) n.points = n.points.map(fn);
  if (e.type === "dimension" && e.axis) {
    const a = fn(e.axis),
      o = fn({ x: 0, y: 0 }),
      v = sub(a, o),
      l = Math.hypot(v.x, v.y);
    n.axis = mul(v, 1 / l);
  }
  if (n.point) n.point = fn(n.point);
  if (n.center) {
    n.center = fn(n.center);
    n.radius *= Math.abs(scale);
  }
  if (n.height) n.height *= Math.abs(scale);
  if (n.spacing) n.spacing *= Math.abs(scale);
  if (n.type === "hatch")
    n.patternAngle = mirror
      ? rotation - (n.patternAngle ?? Math.PI / 4)
      : (n.patternAngle ?? Math.PI / 4) + rotation;
  if (n.type === "arc") {
    const end = fn(polar(e.center, e.radius, e.start));
    n.start = angle(n.center, end);
    if (mirror) n.sweep = -n.sweep;
  }
  if (n.type === "text")
    n.rotation = mirror
      ? rotation - (n.rotation || 0)
      : (n.rotation || 0) + rotation;
  return n;
}
export function transformed(e, kind, base, target, value) {
  if (kind === "MOVE" || kind === "COPY")
    return transform(e, (p) => add(p, sub(target, base)));
  if (kind === "ROTATE") {
    const a = value ?? angle(base, target),
      c = Math.cos(a),
      s = Math.sin(a);
    return transform(
      e,
      (p) => {
        const q = sub(p, base);
        return add(base, { x: q.x * c - q.y * s, y: q.x * s + q.y * c });
      },
      { rotation: a },
    );
  }
  if (kind === "SCALE") {
    const k = value ?? dist(base, target) / 1000;
    return transform(e, (p) => add(base, mul(sub(p, base), k)), { scale: k });
  }
  if (kind === "MIRROR") {
    const a = angle(base, target),
      c = Math.cos(2 * a),
      s = Math.sin(2 * a);
    return transform(
      e,
      (p) => {
        const q = sub(p, base);
        return add(base, { x: q.x * c + q.y * s, y: q.x * s - q.y * c });
      },
      { mirror: true, rotation: 2 * a },
    );
  }
  return clone(e);
}
export function offset(e, d, p) {
  if (e.type === "polyline") return polylineOffset(e, d, p);
  const n = clone(e);
  n.id = uid();
  if (["circle", "arc"].includes(e.type)) {
    n.radius = e.radius + (dist(p, e.center) >= e.radius ? d : -d);
    return n.radius > 1e-8 ? n : null;
  }
  if (e.type === "line") {
    const [a, b] = e.points,
      v = sub(b, a),
      l = dist(a, b);
    if (l < 1e-8) return null;
    const side = v.x * (p.y - a.y) - v.y * (p.x - a.x) >= 0 ? 1 : -1;
    n.points = e.points.map((q) =>
      add(q, { x: (-v.y / l) * d * side, y: (v.x / l) * d * side }),
    );
    return n;
  }
  return null;
}
export class History {
  constructor() {
    this.past = [];
    this.future = [];
  }
  commit(before, after, label) {
    if (JSON.stringify(before) === JSON.stringify(after)) return false;
    this.past.push({ before: clone(before), after: clone(after), label });
    if (this.past.length > 80) this.past.shift();
    this.future = [];
    return true;
  }
  undo() {
    const x = this.past.pop();
    if (!x) return null;
    this.future.push(x);
    return clone(x.before);
  }
  redo() {
    const x = this.future.pop();
    if (!x) return null;
    this.past.push(x);
    return clone(x.after);
  }
}
export function validDocument(d) {
  if (
    !d ||
    d.version !== 1 ||
    !Array.isArray(d.entities) ||
    !Array.isArray(d.layers) ||
    !d.layers.length ||
    d.entities.length > 100000
  )
    return false;
  if (
    d.layouts &&
    (!Array.isArray(d.layouts) ||
      new Set(d.layouts.map((l) => l?.id)).size !== d.layouts.length ||
      d.layouts.some(
        (l) =>
          !l ||
          typeof l.id !== "string" ||
          l.id === "model" ||
          typeof l.name !== "string" ||
          !Number.isFinite(l.width) ||
          !Number.isFinite(l.height) ||
          l.width <= 0 ||
          l.height <= 0,
      ))
  )
    return false;
  const ids = new Set(),
    ls = new Set();
  for (const l of d.layers) {
    if (
      !l ||
      typeof l.id !== "string" ||
      ls.has(l.id) ||
      typeof l.name !== "string" ||
      !/^#[\da-f]{6}$/i.test(l.color)
    )
      return false;
    ls.add(l.id);
  }
  const pt = (p) =>
    p &&
    Number.isFinite(p.x) &&
    Number.isFinite(p.y) &&
    Math.abs(p.x) < 1e12 &&
    Math.abs(p.y) < 1e12;
  for (const e of d.entities) {
    if (
      !e ||
      typeof e.id !== "string" ||
      ids.has(e.id) ||
      !ls.has(e.layer) ||
      (e.color != null && !/^#[\da-f]{6}$/i.test(e.color)) ||
      ![
        "line",
        "polyline",
        "circle",
        "arc",
        "text",
        "leader",
        "hatch",
        "dimension",
        "viewport",
      ].includes(e.type)
    )
      return false;
    ids.add(e.id);
    if (e.type === "dimension" && !validDimension(e, pt)) return false;
    if (
      e.space &&
      e.space !== "model" &&
      !(d.layouts || []).some((l) => l.id === e.space)
    )
      return false;
    if (
      e.type === "viewport" &&
      (!e.space ||
        e.space === "model" ||
        !Array.isArray(e.points) ||
        e.points.length !== 2 ||
        !e.points.every(pt) ||
        Math.abs(e.points[1].x - e.points[0].x) < 1e-8 ||
        Math.abs(e.points[1].y - e.points[0].y) < 1e-8 ||
        !pt(e.viewCenter) ||
        !Number.isFinite(e.viewScale) ||
        e.viewScale <= 0)
    )
      return false;
    if (
      ["line", "polyline", "leader", "hatch"].includes(e.type) &&
      (!Array.isArray(e.points) ||
        e.points.length < (["hatch"].includes(e.type) ? 3 : 2) ||
        !e.points.every(pt))
    )
      return false;
    if (e.type === "line" && e.points.length !== 2) return false;
    if (
      ["circle", "arc"].includes(e.type) &&
      (!pt(e.center) || !Number.isFinite(e.radius) || e.radius <= 0)
    )
      return false;
    if (
      e.type === "arc" &&
      (!Number.isFinite(e.start) ||
        !Number.isFinite(e.sweep) ||
        Math.abs(e.sweep) > TAU)
    )
      return false;
    if (
      ["text", "leader"].includes(e.type) &&
      (typeof e.text !== "string" ||
        !Number.isFinite(e.height) ||
        e.height <= 0)
    )
      return false;
    if (
      e.type === "text" &&
      (!pt(e.point) || !Number.isFinite(e.rotation || 0))
    )
      return false;
    if (e.type === "hatch" && (!Number.isFinite(e.spacing) || e.spacing <= 0))
      return false;
  }
  return true;
}
export function demoDocument() {
  const layers = [
    {
      id: "walls",
      name: "01 · Väggar",
      color: "#c3d6ce",
      visible: true,
      locked: false,
    },
    {
      id: "furniture",
      name: "02 · Inredning",
      color: "#71bba5",
      visible: true,
      locked: false,
    },
    {
      id: "notes",
      name: "03 · Annotation",
      color: "#b3c4ab",
      visible: true,
      locked: false,
    },
    {
      id: "hatch",
      name: "04 · Skraffering",
      color: "#688e88",
      visible: true,
      locked: false,
    },
  ];
  const entities = [];
  const put = (type, props, layer = "walls") =>
    entities.push({ id: uid(), type, layer, ...props });
  const line = (a, b, l) =>
    put(
      "line",
      {
        points: [
          { x: a[0], y: a[1] },
          { x: b[0], y: b[1] },
        ],
      },
      l,
    );
  const rect = (x, y, w, h, l) =>
    put(
      "polyline",
      {
        points: [
          { x, y },
          { x: x + w, y },
          { x: x + w, y: y + h },
          { x, y: y + h },
        ],
        closed: true,
      },
      l,
    );
  const text = (x, y, t, h = 120, l = "notes") =>
    put("text", { point: { x, y }, text: t, height: h, rotation: 0 }, l);
  const arc = (x, y, r, a, s) =>
    put(
      "arc",
      { center: { x, y }, radius: r, start: a, sweep: s },
      "furniture",
    );
  // Compact atelier plan, with every supported entity represented.
  rect(0, 0, 8000, 5400);
  rect(180, 180, 7640, 5040);
  rect(4800, 180, 150, 5040);
  put(
    "hatch",
    {
      points: [
        { x: 0, y: 0 },
        { x: 8000, y: 0 },
        { x: 8000, y: 180 },
        { x: 0, y: 180 },
      ],
      spacing: 120,
    },
    "hatch",
  );
  put(
    "hatch",
    {
      points: [
        { x: 0, y: 5220 },
        { x: 8000, y: 5220 },
        { x: 8000, y: 5400 },
        { x: 0, y: 5400 },
      ],
      spacing: 120,
    },
    "hatch",
  );
  put(
    "hatch",
    {
      points: [
        { x: 4800, y: 180 },
        { x: 4950, y: 180 },
        { x: 4950, y: 3400 },
        { x: 4800, y: 3400 },
      ],
      spacing: 120,
    },
    "hatch",
  );
  rect(780, 1000, 600, 2900, "furniture");
  for (let y = 1120; y < 3800; y += 650) rect(840, y, 480, 520, "furniture");
  rect(2050, 1700, 1800, 900, "furniture");
  for (const x of [2220, 3100]) {
    rect(x, 1320, 530, 320, "furniture");
    rect(x, 2670, 530, 320, "furniture");
  }
  put("circle", { center: { x: 6410, y: 3500 }, radius: 780 }, "furniture");
  for (const a of [0, Math.PI / 2, Math.PI, Math.PI * 1.5])
    put(
      "circle",
      { center: polar({ x: 6410, y: 3500 }, 1070, a), radius: 210 },
      "furniture",
    );
  rect(5350, 650, 1900, 570, "furniture");
  line([6300, 650], [6300, 1220], "furniture");
  arc(4800, 3550, 900, 0, Math.PI / 2);
  line([4800, 3550], [5700, 3550], "furniture");
  arc(650, 180, 900, 0, Math.PI / 2);
  line([650, 180], [650, 1080], "furniture");
  text(2100, 4230, "ATELJÉ", 210);
  text(2150, 3970, "25.0 m²", 115);
  text(5520, 1770, "MÖTESRUM", 160);
  text(5810, 1500, "14.5 m²", 105);
  text(0, 6300, "ATELJÉ / 01", 290);
  text(0, 5940, "EN PLATS FÖR NYA IDÉER", 100);
  put(
    "leader",
    {
      points: [
        { x: 7250, y: 1220 },
        { x: 8550, y: 1900 },
        { x: 9550, y: 1900 },
      ],
      text: "Fast inredning",
      height: 130,
    },
    "notes",
  );
  put(
    "leader",
    {
      points: [
        { x: 4930, y: 2750 },
        { x: 8500, y: 5600 },
        { x: 9600, y: 5600 },
      ],
      text: "Lättvägg 150 mm",
      height: 130,
    },
    "notes",
  );
  line([0, -650], [8000, -650], "notes");
  for (const x of [0, 8000]) {
    line([x, -180], [x, -900], "notes");
    line([x - 80, -730], [x + 80, -570], "notes");
  }
  text(3700, -560, "8 000", 130);
  text(0, -1470, "STUDIEPLAN", 125);
  text(0, -1720, "Rita vidare. Välj ett objekt eller skriv ett kommando.", 100);
  text(7750, -1630, "L / 01", 130);
  return { version: 1, name: "Ateljé — studieplan", layers, entities };
}
export function toDXF(doc) {
  doc = {
    ...doc,
    entities: doc.entities.flatMap((e) =>
      e.type === "dimension" ? dimensionParts(e) : [e],
    ),
  };
  let out = [],
    sink = out;
  const extraBlocks = new Map();
  const pair = (c, v) => sink.push(String(c), String(v));
  const layouts = dxfLayouts(doc, pair);
  const point = (p, x = 10, y = 20) => {
    pair(x, p.x);
    pair(y, p.y);
  };
  const str = (s) => String(s).replace(/[\r\n]/g, " ");
  pair(0, "SECTION");
  pair(2, "HEADER");
  pair(9, "$ACADVER");
  pair(1, "AC1021");
  pair(9, "$INSUNITS");
  pair(70, 4);
  pair(0, "ENDSEC");
  pair(0, "SECTION");
  pair(2, "TABLES");
  pair(0, "TABLE");
  pair(2, "LAYER");
  pair(5, "10");
  pair(330, "0");
  pair(100, "AcDbSymbolTable");
  pair(70, doc.layers.length);
  for (const l of doc.layers) {
    pair(0, "LAYER");
    pair(5, layouts.handle());
    pair(330, "10");
    pair(100, "AcDbSymbolTableRecord");
    pair(100, "AcDbLayerTableRecord");
    pair(2, str(l.name));
    pair(70, l.locked ? 4 : 0);
    pair(62, l.visible === false ? -7 : 7);
    pair(420, parseInt(l.color.slice(1), 16));
    pair(6, "CONTINUOUS");
  }
  pair(0, "ENDTAB");
  layouts.tables();
  pair(0, "ENDSEC");
  const blocksInsert = out.length;
  pair(0, "SECTION");
  pair(2, "ENTITIES");
  const start = (type, e, subclass) => {
    pair(0, type);
    pair(5, layouts.handle());
    pair(330, layouts.owner(e));
    pair(100, "AcDbEntity");
    pair(8, str(doc.layers.find((l) => l.id === e.layer)?.name || "0"));
    if (e.space && e.space !== "model") {
      pair(67, 1);
      pair(
        410,
        str(doc.layouts?.find((l) => l.id === e.space)?.name || "Layout1"),
      );
    }
    if (e.color) pair(420, parseInt(e.color.slice(1), 16));
    pair(100, subclass);
  };
  const writeText = (e) => {
    if (needsMtext(e)) {
      start("MTEXT", e, "AcDbMText");
      const r = e.rotation || 0;
      point({
        x: e.point.x - Math.sin(r) * e.height,
        y: e.point.y + Math.cos(r) * e.height,
      });
      pair(30, 0);
      pair(40, e.height);
      pair(41, 0);
      pair(71, 1);
      pair(72, 1);
      for (const [code, value] of textChunks(mtextContent(e)))
        pair(code, value);
      pair(11, Math.cos(r));
      pair(21, Math.sin(r));
      pair(31, 0);
      pair(73, 2);
      pair(44, 1.4 / (5 / 3));
    } else {
      start("TEXT", e, "AcDbText");
      point(e.point);
      pair(40, e.height);
      pair(1, str(e.text));
      pair(50, ((e.rotation || 0) * 180) / Math.PI);
      pair(100, "AcDbText");
    }
  };
  let viewportId = 2;
  for (const e of doc.entities) {
    const extra =
      e.space && (doc.layouts || []).findIndex((l) => l.id === e.space) > 0;
    if (extra && !extraBlocks.has(e.space)) extraBlocks.set(e.space, []);
    sink = extra ? extraBlocks.get(e.space) : out;
    if (e.type === "viewport") {
      start("VIEWPORT", e, "AcDbViewport");
      const [a, b] = e.points,
        w = Math.abs(b.x - a.x),
        h = Math.abs(b.y - a.y);
      point({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
      pair(30, 0);
      pair(40, w);
      pair(41, h);
      pair(68, 1);
      pair(69, viewportId++);
      point(e.viewCenter, 12, 22);
      pair(16, 0);
      pair(26, 0);
      pair(36, 1);
      pair(17, 0);
      pair(27, 0);
      pair(37, 0);
      pair(45, h / e.viewScale);
      pair(51, 0);
      pair(90, e.locked !== false ? 16384 : 0);
    }
    if (e.type === "line") {
      start("LINE", e, "AcDbLine");
      point(e.points[0]);
      point(e.points[1], 11, 21);
    }
    if (e.type === "circle" || e.type === "arc") {
      start(e.type.toUpperCase(), e, "AcDbCircle");
      point(e.center);
      pair(40, e.radius);
      if (e.type === "arc") {
        pair(100, "AcDbArc");
        pair(
          50,
          (mod(e.sweep > 0 ? e.start : e.start + e.sweep) * 180) / Math.PI,
        );
        pair(
          51,
          (mod(e.sweep > 0 ? e.start + e.sweep : e.start) * 180) / Math.PI,
        );
      }
    }
    if (e.type === "polyline") {
      start("LWPOLYLINE", e, "AcDbPolyline");
      pair(90, e.points.length);
      pair(70, e.closed ? 1 : 0);
      for (const p of e.points) point(p);
    }
    if (e.type === "text") writeText(e);
    if (e.type === "leader") {
      start("LEADER", e, "AcDbLeader");
      pair(3, "STANDARD");
      pair(71, 1);
      pair(72, 0);
      pair(73, 3);
      pair(74, 0);
      pair(75, 0);
      pair(76, e.points.length);
      for (const p of e.points) {
        point(p);
        pair(30, 0);
      }
      if (e.text) {
        writeText({
          ...e,
          type: "text",
          point: add(e.points.at(-1), {
            x: (e.height || 120) / 3,
            y: ((e.height || 120) * 7) / 24,
          }),
          rotation: 0,
        });
      }
    }
    if (e.type === "hatch") {
      start("HATCH", e, "AcDbHatch");
      point({ x: 0, y: 0 });
      pair(30, 0);
      pair(210, 0);
      pair(220, 0);
      pair(230, 1);
      pair(2, "ANSI31");
      pair(70, 0);
      pair(71, 0);
      pair(91, 1);
      pair(92, 2);
      pair(72, 0);
      pair(73, 1);
      pair(93, e.points.length);
      for (const p of e.points) point(p);
      pair(97, 0);
      pair(75, 0);
      pair(76, 1);
      pair(52, 0);
      pair(41, 1);
      pair(77, 0);
      pair(78, 1);
      pair(53, ((e.patternAngle ?? Math.PI / 4) * 180) / Math.PI);
      pair(43, 0);
      pair(44, 0);
      pair(45, -e.spacing * Math.sin(e.patternAngle ?? Math.PI / 4));
      pair(46, e.spacing * Math.cos(e.patternAngle ?? Math.PI / 4));
      pair(79, 0);
      pair(98, 0);
    }
  }
  sink = out;
  pair(0, "ENDSEC");
  const blockData = [];
  sink = blockData;
  layouts.blocks((l) => {
    const data = extraBlocks.get(l.id);
    if (data) sink.push(...data);
  });
  out = [
    ...out.slice(0, blocksInsert),
    ...blockData,
    ...out.slice(blocksInsert),
  ];
  sink = out;
  layouts.objects();
  pair(0, "EOF");
  return out.join("\n") + "\n";
}
