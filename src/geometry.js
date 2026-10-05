// Pure coordinate and geometry operations; no document, format or UI dependencies.
export const TAU = Math.PI * 2;
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
