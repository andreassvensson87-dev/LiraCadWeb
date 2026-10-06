import { cameraVector } from "./camera.js";
import { bounds } from "./entity-geometry.js";
export const viewportScales=[1,2,5,10,20,25,40,50,100,200,250,500,1000];
export function viewportHasGeometry(v,entities){
  const c=Math.cos(v.viewRotation||0),s=Math.sin(v.viewRotation||0),hw=Math.abs(v.points[1].x-v.points[0].x)/v.viewScale/2,hh=Math.abs(v.points[1].y-v.points[0].y)/v.viewScale/2;
  return entities.some(e=>{const b=bounds(e),ps=[[b.minX,b.minY],[b.maxX,b.minY],[b.maxX,b.maxY],[b.minX,b.maxY]].map(([x,y])=>({x:c*(x-v.viewCenter.x)+s*(y-v.viewCenter.y),y:-s*(x-v.viewCenter.x)+c*(y-v.viewCenter.y)}));return Math.min(...ps.map(p=>p.x))<=hw && Math.max(...ps.map(p=>p.x))>=-hw && Math.min(...ps.map(p=>p.y))<=hh && Math.max(...ps.map(p=>p.y))>=-hh;});
}
export function recoverEmptyViewports(entities,layoutId,model){
  let count=0;
  const result=entities.map(e=>{
    if(e.type!=='viewport' || spaceOf(e)!==layoutId || e.hidden || viewportHasGeometry(e,model))return e;
    const next=fitViewportToEntities(e,model);if(!next)return e;
    const denominator=viewportScales.find(n=>n>=1/next.viewScale) || Math.ceil(1/next.viewScale/1000)*1000;
    count++;return {...next,viewScale:1/denominator};
  });
  return {entities:result,count};
}
export function fitViewportToEntities(viewport, entities) {
  if (!entities.length) return null;
  const r = viewport.viewRotation || 0, c = Math.cos(r), s = Math.sin(r);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const e of entities) {
    const b = bounds(e);
    for (const [x,y] of [[b.minX,b.minY],[b.maxX,b.minY],[b.maxX,b.maxY],[b.minX,b.maxY]]) {
      const u = c*x+s*y, v = -s*x+c*y;
      minX = Math.min(minX,u); maxX = Math.max(maxX,u); minY = Math.min(minY,v); maxY = Math.max(maxY,v);
    }
  }
  if (![minX,minY,maxX,maxY].every(Number.isFinite)) return null;
  const x = (minX+maxX)/2, y = (minY+maxY)/2;
  return { ...viewport, viewCenter: { x:c*x-s*y, y:s*x+c*y }, viewScale: 0.9*Math.min(Math.abs(viewport.points[1].x-viewport.points[0].x)/Math.max(maxX-minX,1), Math.abs(viewport.points[1].y-viewport.points[0].y)/Math.max(maxY-minY,1)) };
}
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
  const rotation = viewport.viewRotation || 0;
  const offset = cameraVector({ rotation }, (width / 2 - cx) / scale, (cy - height / 2) / scale);
  return { x: viewport.viewCenter.x + offset.x, y: viewport.viewCenter.y + offset.y, scale, ...(rotation ? { rotation } : {}) };
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
  const offset = cameraVector(camera, (cx - width / 2) / camera.scale, (height / 2 - cy) / camera.scale);
  return {
    ...viewport,
    viewRotation: camera.rotation || 0,
    viewScale: camera.scale / paperCamera.scale,
    viewCenter: {
      x: camera.x + offset.x,
      y: camera.y + offset.y,
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
