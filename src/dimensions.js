import { add, sub, mul, dist, angle, polar, mod } from "./geometry.js";
export function dimensionChain(source, measurements, placement, axis) {
  const u = axis || source.axis || { x: 1, y: 0 };
  const projection = (p) => p.x * u.x + p.y * u.y;
  const ordered = measurements
    .map((p) => ({ ...p }))
    .sort((a, b) => projection(a) - projection(b));
  if (
    ordered.length < 2 ||
    ordered.some(
      (p, i) => i && projection(p) - projection(ordered[i - 1]) < 1e-8,
    )
  )
    throw Error("Mätpunkterna måste ge olika lägen längs måttlinjen.");
  const result = structuredClone(source);
  delete result.text;
  const middle = (projection(ordered[0]) + projection(ordered.at(-1))) / 2;
  const handle = add(placement, mul(u, middle - projection(placement)));
  return {
    ...result,
    type: "dimension",
    kind: "linear",
    chain: true,
    axis: { ...u },
    points: [...ordered, handle],
  };
}
export function extendDimensionChain(source, point) {
  const axis =
    source.kind === "aligned"
      ? mul(
          sub(source.points[1], source.points[0]),
          1 / dist(source.points[0], source.points[1]),
        )
      : source.axis;
  return dimensionChain(
    source,
    [...source.points.slice(0, -1), point],
    source.points.at(-1),
    axis,
  );
}
// A continuation keeps the original dimension line even for off-axis picks.
export function continueDimension(source, point, end = 1) {
  if (
    source?.type !== "dimension" ||
    !["linear", "aligned"].includes(source.kind)
  )
    throw Error("Välj ett linjärt eller riktat mått.");
  const [a, b, placement] = source.points;
  const axis =
    source.kind === "aligned"
      ? mul(sub(b, a), 1 / dist(a, b))
      : source.axis || { x: 1, y: 0 };
  const start = source.points[end];
  const delta = sub(point, start);
  if (Math.abs(delta.x * axis.x + delta.y * axis.y) < 1e-8)
    throw Error("Nästa punkt måste ge ett mått större än 0.");
  const result = structuredClone(source);
  delete result.id;
  delete result.text;
  return {
    ...result,
    kind: "linear",
    axis: { ...axis },
    points: [{ ...start }, { ...point }, { ...placement }],
  };
}
export function dimensionParts(e) {
  if (e.chain) {
    const points = e.points
      .slice(0, -1)
      .sort((a, b) => (a.x - b.x) * e.axis.x + (a.y - b.y) * e.axis.y);
    const parts = [];
    const lines = new Set();
    for (let i = 1; i < points.length; i++) {
      for (const part of dimensionParts({
        ...e,
        chain: false,
        points: [points[i - 1], points[i], e.points.at(-1)],
      })) {
        if (part.type === "line") {
          const key = part.points
            .map((p) => `${p.x},${p.y}`)
            .sort()
            .join(";");
          if (lines.has(key)) continue;
          lines.add(key);
        }
        parts.push(part);
      }
    }
    return parts;
  }
  const parts = [],
    h = e.height || 2.5,
    precision = e.precision ?? 0,
    p = e.points;
  const line = (a, b) => parts.push({ type: "line", points: [a, b] });
  const label = (at, text, rotation = 0) =>
    parts.push({
      type: "text",
      point: at,
      text,
      height: h,
      rotation,
      font: "Arial",
    });
  const arrow = (tip, toward) => {
    const a = angle(tip, toward);
    line(tip, polar(tip, h * 0.85, a + 0.35));
    line(tip, polar(tip, h * 0.85, a - 0.35));
  };
  const number = (v) => v.toFixed(precision);
  if (["linear", "aligned"].includes(e.kind)) {
    const [a, b, c] = p;
    let u =
      e.kind === "aligned"
        ? mul(sub(b, a), 1 / (dist(a, b) || 1))
        : e.axis || { x: 1, y: 0 };
    const n = { x: -u.y, y: u.x },
      dot = (q, r) => q.x * r.x + q.y * r.y;
    const x = add(a, mul(n, dot(sub(c, a), n))),
      y = add(b, mul(n, dot(sub(c, b), n)));
    line(a, add(x, mul(n, h * 0.5 * Math.sign(dot(sub(x, a), n) || 1))));
    line(b, add(y, mul(n, h * 0.5 * Math.sign(dot(sub(y, b), n) || 1))));
    line(x, y);
    arrow(x, y);
    arrow(y, x);
    let r = Math.atan2(u.y, u.x);
    if (r > Math.PI / 2 || r < -Math.PI / 2) r += Math.PI;
    label(
      add(mul(add(x, y), 0.5), mul(n, h * 0.45)),
      e.text || number(Math.abs(dot(sub(b, a), u))),
      r,
    );
  } else if (["radius", "diameter"].includes(e.kind)) {
    const [center, rim, at] = p,
      r = dist(center, rim),
      edge = polar(center, r, angle(center, at));
    const from =
      e.kind === "diameter"
        ? polar(center, r, angle(center, at) + Math.PI)
        : center;
    line(from, edge);
    line(edge, at);
    arrow(edge, center);
    if (e.kind === "diameter") arrow(from, center);
    label(
      add(at, { x: h * 0.4, y: h * 0.4 }),
      e.text ||
        `${e.kind === "radius" ? "R" : "Ø"}${number(r * (e.kind === "diameter" ? 2 : 1))}`,
    );
  } else if (e.kind === "angular") {
    const [center, a, b, at] = p,
      r = dist(center, at),
      start = angle(center, a);
    let sweep = mod(angle(center, b) - start);
    if (mod(angle(center, at) - start) > sweep) sweep -= Math.PI * 2;
    const q1 = polar(center, r, start),
      q2 = polar(center, r, start + sweep);
    line(center, q1);
    line(center, q2);
    parts.push({ type: "arc", center, radius: r, start, sweep });
    arrow(q1, polar(center, r, start + Math.sign(sweep) * 0.1));
    arrow(q2, polar(center, r, start + sweep - Math.sign(sweep) * 0.1));
    label(
      polar(center, r + h * 0.5, start + sweep / 2),
      e.text || `${number((Math.abs(sweep) * 180) / Math.PI)}°`,
    );
  }
  return parts.map((part) => ({
    ...part,
    layer: e.layer,
    color: e.color,
    lineType: e.lineType,
    space: e.space,
  }));
}
export function validDimension(e, pt) {
  const count = e.kind === "angular" ? 4 : 3;
  return (
    ["linear", "aligned", "radius", "diameter", "angular"].includes(e.kind) &&
    (e.text == null || typeof e.text === "string") &&
    Array.isArray(e.points) &&
    (e.chain
      ? e.kind === "linear" && !!e.axis && e.points.length >= 3
      : e.points.length === count) &&
    (e.chain == null || typeof e.chain === "boolean") &&
    e.points.every(pt) &&
    (!e.chain ||
      e.points
        .slice(0, -1)
        .map((p) => p.x * e.axis.x + p.y * e.axis.y)
        .sort((a, b) => a - b)
        .every((v, i, values) => !i || v - values[i - 1] > 1e-8)) &&
    dist(e.points[0], e.points[1]) > 1e-8 &&
    (e.kind !== "angular" ||
      (dist(e.points[0], e.points[2]) > 1e-8 &&
        dist(e.points[0], e.points[3]) > 1e-8)) &&
    Number.isFinite(e.height) &&
    e.height > 0 &&
    Number.isInteger(e.precision ?? 0) &&
    (e.precision ?? 0) >= 0 &&
    (e.precision ?? 0) <= 6 &&
    (!e.axis ||
      (pt(e.axis) && Math.abs(Math.hypot(e.axis.x, e.axis.y) - 1) < 1e-6))
  );
}
