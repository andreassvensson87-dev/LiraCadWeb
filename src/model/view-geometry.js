export function gridSpacing(scale) {
  const target = 65 / scale,
    power = 10 ** Math.floor(Math.log10(target));
  return (
    [1, 2, 5, 10].map((n) => n * power).find((n) => n >= target) || power * 10
  );
}
export function viewportClip(viewport, camera, width, height) {
  const points = viewport.points.map((p) => ({
    x: (p.x - camera.x) * camera.scale + width / 2,
    y: height / 2 - (p.y - camera.y) * camera.scale,
  }));
  const [a, b] = points;
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(a.x - b.x),
    h: Math.abs(a.y - b.y),
  };
}
