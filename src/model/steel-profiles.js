import { steelProfileRows, steelProfileSource } from "./steel-profile-data.js";

export { steelProfileSource };
export const steelProfiles = Object.entries(steelProfileRows).flatMap(([family, rows]) =>
  rows.map(([size, h, b, t, d, r, tip]) => ({
    id: `tibnor-2023-${family.toLowerCase()}-${size}`,
    name: `${family} ${size}`, family, size, h, b, t, d, r, tip,
  })),
);

// Trim each corner by the tangent distance and represent its circular fillet
// with a DXF-compatible bulge. Concave roots have negative bulges.
function roundedSection(vertices, radii) {
  const points = [], bulges = [];
  vertices.forEach((p, i) => {
    const a = vertices[(i + vertices.length - 1) % vertices.length];
    const b = vertices[(i + 1) % vertices.length];
    const before = Math.hypot(p.x - a.x, p.y - a.y);
    const after = Math.hypot(b.x - p.x, b.y - p.y);
    const u = { x: (p.x - a.x) / before, y: (p.y - a.y) / before };
    const v = { x: (b.x - p.x) / after, y: (b.y - p.y) / after };
    const turn = Math.atan2(u.x * v.y - u.y * v.x, u.x * v.x + u.y * v.y);
    const trim = (radii[i] || 0) * Math.tan(Math.abs(turn) / 2);
    if (!trim) { points.push(p); bulges.push(0); return; }
    points.push({ x: p.x - u.x * trim, y: p.y - u.y * trim });
    bulges.push(Math.tan(turn / 4));
    points.push({ x: p.x + v.x * trim, y: p.y + v.y * trim });
    bulges.push(0);
  });
  return { points, bulges, closed: true };
}

export function profileSection(profile) {
  const { h, b, t, d, r, tip, family } = profile;
  const H = h / 2, B = b / 2, D = d / 2;
  const p = (x, y) => ({ x, y });
  if (family === "UPE" || family === "UNP") {
    const slope = family === "UNP" ? (h <= 300 ? 0.08 : 0.05) : 0;
    const reference = h <= 300 ? b / 2 : (b + d) / 2;
    const thickness = x => t + slope * (reference - x);
    return roundedSection([
      p(-B, -H), p(B, -H), p(B, -H + thickness(b)),
      p(-B + d, -H + thickness(d)), p(-B + d, H - thickness(d)),
      p(B, H - thickness(b)), p(B, H), p(-B, H),
    ], [0, 0, tip, r, r, tip, 0, 0]);
  }
  return roundedSection([
    p(-B, -H), p(B, -H), p(B, -H + t), p(D, -H + t),
    p(D, H - t), p(B, H - t), p(B, H), p(-B, H),
    p(-B, H - t), p(-D, H - t), p(-D, -H + t), p(-B, -H + t),
  ], [0, 0, 0, r, r, 0, 0, 0, 0, r, r, 0]);
}

export function profileTemplate(profile, layer) {
  return {
    type: "block", point: { x: 0, y: 0 }, rotation: 0, scale: 1,
    mirrored: false, values: {},
    definition: {
      id: profile.id, name: profile.name.replaceAll(" ", "_"),
      entities: [{
        id: `${profile.id}-section`, type: "polyline", layer,
        inheritLayer: true, colorByBlock: true, lineTypeByBlock: true,
        ...profileSection(profile),
      }],
    },
  };
}
