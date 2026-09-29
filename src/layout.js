export function spaceOf(e) {
  return e.space || "model";
}
export function paperSnaps(layout, point, tolerance) {
  if (!layout) return [];
  const { width: w, height: h } = layout;
  const corners = [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h },
    { x: 0, y: h },
  ];
  const midpoints = [
    { x: w / 2, y: 0 },
    { x: w, y: h / 2 },
    { x: w / 2, y: h },
    { x: 0, y: h / 2 },
  ];
  const near = (p) => Math.hypot(p.x - point.x, p.y - point.y) <= tolerance;
  const fixed = [
    ...corners.map((p) => ({ p, kind: "Pappershörn", id: "paper" })),
    ...midpoints.map((p) => ({
      p,
      kind: "Papperskant · mittpunkt",
      id: "paper",
    })),
  ].filter((s) => near(s.p));
  if (fixed.length) return fixed;
  const x = Math.max(0, Math.min(w, point.x));
  const y = Math.max(0, Math.min(h, point.y));
  return [
    { x, y: 0 },
    { x: w, y },
    { x, y: h },
    { x: 0, y },
  ]
    .filter(near)
    .map((p) => ({ p, kind: "Papperskant", id: "paper" }));
}
export function viewportCamera(viewport, paperCamera, width, height) {
  const [a, b] = viewport.points,
    paperCenter = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const cx = (paperCenter.x - paperCamera.x) * paperCamera.scale + width / 2;
  const cy = height / 2 - (paperCenter.y - paperCamera.y) * paperCamera.scale;
  const scale = paperCamera.scale * viewport.viewScale;
  return {
    x: viewport.viewCenter.x + (width / 2 - cx) / scale,
    y: viewport.viewCenter.y + (cy - height / 2) / scale,
    scale,
  };
}
export function viewportFromCamera(
  viewport,
  camera,
  paperCamera,
  width,
  height,
) {
  const [a, b] = viewport.points,
    px = (a.x + b.x) / 2,
    py = (a.y + b.y) / 2;
  const cx = (px - paperCamera.x) * paperCamera.scale + width / 2,
    cy = height / 2 - (py - paperCamera.y) * paperCamera.scale;
  return {
    ...viewport,
    viewScale: camera.scale / paperCamera.scale,
    viewCenter: {
      x: camera.x + (cx - width / 2) / camera.scale,
      y: camera.y + (height / 2 - cy) / camera.scale,
    },
  };
}
export function viewportContains(viewport, p) {
  const [a, b] = viewport.points;
  return (
    p.x >= Math.min(a.x, b.x) &&
    p.x <= Math.max(a.x, b.x) &&
    p.y >= Math.min(a.y, b.y) &&
    p.y <= Math.max(a.y, b.y)
  );
}
