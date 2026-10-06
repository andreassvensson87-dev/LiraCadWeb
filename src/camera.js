export function cameraVector(camera, x, y) {
  const a = camera.rotation || 0, c = Math.cos(a), s = Math.sin(a);
  return { x: c*x-s*y, y: s*x+c*y };
}
export function screenPoint(p, camera, width, height) {
  const q=cameraVector({rotation:-(camera.rotation||0)},p.x-camera.x,p.y-camera.y);
  return {x:q.x*camera.scale+width/2,y:height/2-q.y*camera.scale};
}
export function worldPoint(p, camera, width, height) {
  const q=cameraVector(camera,(p.x-width/2)/camera.scale,(height/2-p.y)/camera.scale);
  return {x:q.x+camera.x,y:q.y+camera.y};
}
