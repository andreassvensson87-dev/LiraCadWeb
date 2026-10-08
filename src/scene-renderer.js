import { viewportEntities } from "./annotation-context.js";
import { drawBlockParameterOverlay } from "./block-parameter-overlay.js";
import { screenPoint, worldPoint } from "./camera.js";
import { createEntityRenderer } from "./entity-renderer.js";
import { bounds } from "./entity-geometry.js";
import { spaceOf, viewportCamera } from "./layout.js";
import { grips } from "./grips.js";
import { transforms } from "./command-catalog.js";
import { createSpatialIndex } from "./spatial-index.js";
import { paperColor } from "./plot-style.js";

export function gridSpacing(scale) {
  const target = 65 / scale, power = 10 ** Math.floor(Math.log10(target));
  return [1, 2, 5, 10].map((n) => n * power).find((n) => n >= target) || power * 10;
}
export function viewportClip(viewport, camera, width, height) {
  const points = viewport.points.map((p) => ({
    x: (p.x - camera.x) * camera.scale + width / 2,
    y: height / 2 - (p.y - camera.y) * camera.scale,
  }));
  const [a, b] = points;
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
}

// Synchronous painter: reads a frame, writes only the canvas, and owns the
// temporary camera used for clipped model views. It has no DOM or app globals.
export function createSceneRenderer({ ctx, createCanvas = (w,h) => typeof OffscreenCanvas === 'undefined' ? null : new OffscreenCanvas(w,h) }) {
  let paintingPaper = false;
  let frame, camera, layers, spatial, indexedEntities, background, backgroundKey, backgroundCamera;
  const layerOf = (e) => layers.get(e.layer);
  const drawingSpace = () => frame.activeViewportId ? "model" : frame.activeSpace;
  const screen = (p) => screenPoint(p, camera, frame.width, frame.height);
  const world = (p) => worldPoint(p, camera, frame.width, frame.height);
  const movedViewport = () => frame.movedViewport;
  const activeClip = () => {
    const viewport = frame.doc.entities.find((e) => e.id === frame.activeViewportId);
    return viewport ? viewportClip(viewport, frame.paperCamera, frame.width, frame.height) : null;
  };
  const { path, drawEntity } = createEntityRenderer({ ctx, screen, getCamera: () => camera, layerOf, foregroundColor: () => paintingPaper ? "#000000" : "#ffffff",paperScale:()=>paintingPaper?(frame.paperCamera||frame.camera).scale:null,monochrome:()=>paintingPaper && !!frame.doc.layouts.find(l=>l.id===frame.activeSpace)?.monochrome });
  function paintEntities(space, onPaper = false, interactive = true, additions = null, viewport = null) {
    paintingPaper = onPaper;
    const { doc, width, height, selection, hover } = frame;
    const previewTargets = new Set(interactive && space === drawingSpace() ? frame.previewTargets || [] : []);
    const previewTarget = interactive && space === drawingSpace() ? frame.previewTarget : null;
    const tl = world({ x: 0, y: 0 }),
      br = world({ x: width, y: height });
    const corners = [tl, br, world({ x: width, y: 0 }), world({ x: 0, y: height })];
    const region = { minX: Math.min(...corners.map(p => p.x)), maxX: Math.max(...corners.map(p => p.x)), minY: Math.min(...corners.map(p => p.y)), maxY: Math.max(...corners.map(p => p.y)) };
    const replacement = frame.textReplacement;
    let entities = additions || spatial.query(region, true);
    if(viewport){
      // Context positions can lie outside the base entity spatial bounds.
      const annotated=viewport.annotationScale?doc.entities.filter(e=>e.annotationVariants?.length || e.annotationContexts?.length || e.type==="block" && e.definition.entities.some(p=>p.annotationVariants?.length || p.annotationContexts?.length)):[];
      entities=viewportEntities([...new Map([...entities,...annotated].map(e=>[e.id,e])).values()],viewport,doc.layers);
    }
    for (const e of [...entities.filter(e => e.id !== replacement?.originalId), ...(replacement ? [replacement.entity] : [])]) {
      if (
        e.id === previewTarget || previewTargets.has(e.id) ||
        spaceOf(e) !== space ||
        layerOf(e)?.visible === false ||
        e.type === "viewport"
      )
        continue;
      const selected = interactive && selection.has(e.id);
      const color = selected
        ? onPaper
          ? "#137c59"
          : "#95efc4"
        : interactive && hover === e.id
          ? onPaper
            ? "#35836b"
            : "#e3f4d7"
          : onPaper ? paperColor(e,layerOf(e),frame.doc.layouts.find(l=>l.id===frame.activeSpace)?.monochrome) : e.color || layerOf(e).color;
      if (e._xrefOpacity != null) { ctx.save(); ctx.globalAlpha = (typeof ctx.globalAlpha === 'number' ? ctx.globalAlpha : 1) * e._xrefOpacity; drawEntity(e, color, selected); ctx.restore(); }
      else drawEntity(e, color, selected);
    }
  }
  function paintLayout() {
    const { doc, paperCamera, activeSpace, activeViewportId, width, height, drag, selection } = frame;
    const saved = camera,
      base = paperCamera || camera,
      l = doc.layouts.find((l) => l.id === activeSpace);
    camera = base;
    const a = screen({ x: 0, y: l.height }),
      b = screen({ x: l.width, y: 0 });
    ctx.fillStyle = "#fdfdf9";
    ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
    for (const original of doc.entities.filter(
      (e) =>
        e.type === "viewport" &&
        spaceOf(e) === activeSpace &&
        layerOf(e)?.visible !== false,
    )) {
      const v =
        drag?.kind === "viewportMove" &&
        drag.entity.id === original.id &&
        drag.moved
          ? movedViewport()
          : drag?.kind === "grip" &&
              drag.targets.some((t) => t.entity.id === original.id)
            ? frame.gripPreviews.find((e) => e.id === original.id)
            : original;
      camera = base;
      const a = screen(v.points[0]),
        b = screen(v.points[1]);
      ctx.save();
      ctx.beginPath();
      ctx.rect(
        Math.min(a.x, b.x),
        Math.min(a.y, b.y),
        Math.abs(a.x - b.x),
        Math.abs(a.y - b.y),
      );
      ctx.clip();
      camera =
        activeViewportId === v.id
          ? saved
          : viewportCamera(v, base, width, height);
      paintEntities("model", true, activeViewportId === v.id,activeViewportId===v.id?frame.interactionEntities:null,activeViewportId===v.id?null:v);
      ctx.restore();
      camera = base;
      drawEntity(
        v,
        activeViewportId === v.id
          ? "#147b60"
          : selection.has(v.id)
            ? "#147b60"
            : "#84978c",
        selection.has(v.id),
      );
    }
    camera = base;
    paintEntities(activeSpace, true, !activeViewportId);
    camera = saved;
  }
  function render(nextFrame) {
    frame = nextFrame;
    camera = frame.camera;
    layers = new Map(frame.doc.layers.map(l => [l.id,l]));
    if (frame.sceneIndex) spatial = frame.sceneIndex;
    else if (indexedEntities !== frame.doc.entities) {
      spatial = createSpatialIndex(frame.doc.entities, bounds);
      indexedEntities = frame.doc.entities;
    }
    const { doc, width, height, dpr, activeSpace, activeViewportId, selection, tool, cursor, mouse, showGrid, drag, trackAnchors, snap } = frame;
    try {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      const key = [spatial, JSON.stringify(doc.layers), camera.x, camera.y, camera.scale, width, height, dpr, showGrid, frame.hover, [...selection].join(','), frame.previewTarget, (frame.previewTargets || []).join(','), camera.rotation || 0, JSON.stringify(frame.textReplacement)];
      const stableScene = backgroundKey?.every((value,i)=>i >= 2 && i <= 4 || value === key[i]);
      const ratio = backgroundCamera ? camera.scale / backgroundCamera.scale : 1;
      const dx = backgroundCamera ? width/2*(1-ratio) + (backgroundCamera.x-camera.x)*camera.scale : 0;
      const dy = backgroundCamera ? height/2*(1-ratio) + (camera.y-backgroundCamera.y)*camera.scale : 0;
      const cached = activeSpace === 'model' && background && backgroundKey?.every((value,i)=>value === key[i]);
      const appended = activeSpace === 'model' && background && spatial.previous?.deref() === backgroundKey?.[0] && backgroundKey?.every((value,i)=>i===0 || value===key[i]);
      // Reproject the last exact image during an active gesture. The app always
      // requests an exact repaint when navigation settles; never persist this
      // temporary image as the new background (avoids accumulating blur).
      const navigating = activeSpace === 'model' && frame.navigating && background && stableScene && ratio >= .25 && ratio <= 4 && Math.abs(dx) < width && Math.abs(dy) < height;
      if (cached) ctx.drawImage(background,0,0,width,height);
      else if (appended) {
        ctx.drawImage(background,0,0,width,height);
        paintEntities('model',false,true,spatial.added);
        const cacheContext=background.getContext('2d');
        cacheContext.clearRect(0,0,background.width,background.height);
        cacheContext.drawImage(ctx.canvas,0,0);
        backgroundKey=key;
      }
      else if (navigating) {
        ctx.fillStyle = '#17292e'; ctx.fillRect(0,0,width,height);
        ctx.drawImage(background,dx,dy,width*ratio,height*ratio);
      }
      else {
      ctx.fillStyle = activeSpace === "model" ? "#17292e" : "#dce1e3";
      ctx.fillRect(0, 0, width, height);
      const step = gridSpacing(camera.scale),
        tl = world({ x: 0, y: 0 }),
        br = world({ x: width, y: height });
      if (showGrid && !camera.rotation) {
        ctx.save();
        ctx.strokeStyle = activeSpace === "model" ? "#3b535b" : "#aab5bc";
        ctx.lineWidth = 0.6;
        ctx.setLineDash([]);
        ctx.beginPath();
        for (let x = Math.ceil(tl.x / step) * step; x < br.x; x += step) {
          const p = screen({ x, y: 0 });
          ctx.moveTo(p.x, 0);
          ctx.lineTo(p.x, height);
        }
        for (let y = Math.ceil(br.y / step) * step; y < tl.y; y += step) {
          const p = screen({ x: 0, y });
          ctx.moveTo(0, p.y);
          ctx.lineTo(width, p.y);
        }
        ctx.stroke();
        ctx.restore();
      }
      if (activeSpace === "model") {
        // World axes stay visible without the grid and use screen-pixel widths.
        const origin = screen({ x: 0, y: 0 });
        const extent = Math.hypot(width, height) + Math.hypot(origin.x, origin.y);
        ctx.save();
        ctx.translate(origin.x, origin.y);
        ctx.rotate(-(camera.rotation || 0));
        ctx.fillStyle = "#425c63";
        ctx.fillRect(-extent, -0.4, extent * 2, 0.8);
        ctx.fillRect(-0.4, -extent, 0.8, extent * 2);
        ctx.restore();
      }
      if (activeSpace === "model") paintEntities("model");
      else paintLayout();
      if (activeSpace === 'model') {
        const w = Math.round(width*dpr), h = Math.round(height*dpr);
        if (!background || background.width !== w || background.height !== h) background = createCanvas(w,h);
        const cacheContext = background?.getContext('2d');
        if (cacheContext) { cacheContext.clearRect(0,0,w,h); cacheContext.drawImage(ctx.canvas,0,0); backgroundKey = key; backgroundCamera = {...camera}; }
      } else backgroundKey = null;
      }
      ctx.save();
      if (activeViewportId) {
        const r = activeClip();
        if (r) {
          ctx.beginPath();
          ctx.rect(r.x, r.y, r.w, r.h);
          ctx.clip();
        }
      }
      for (const r of doc.references || []) {
        if (r.geometry.length || r.sourceLoaded || r.visible===false || (r.space || 'model')!==drawingSpace() || layers.get(r.layer)?.visible===false) continue;
        const p=screen(r.point);
        ctx.save();ctx.strokeStyle='#e3ae56';ctx.fillStyle='#e3ae56';ctx.lineWidth=1;ctx.setLineDash([3,3]);
        ctx.strokeRect(p.x-8,p.y-8,16,16);ctx.font='11px system-ui';ctx.fillText(`${r.name} · Saknas`,p.x+13,p.y+4);ctx.restore();
      }
      if (!tool && !frame.textReplacement) {
        for (const e of (selection.size ? frame.interactionEntities||doc.entities : []).filter(
          (e) => selection.has(e.id) && frame.editableIds.has(e.id),
        ))
          for (const g of grips(e)) {
            const p = screen(
              drag?.kind === "viewportMove" && drag.entity.id === e.id && drag.moved
                ? movedViewport().points[g.i]
                : g.p,
            );
            ctx.fillStyle = "#17292e";
            ctx.strokeStyle = "#8ee8b8";
            ctx.lineWidth = 1;
            ctx.fillRect(p.x - 4, p.y - 4, 8, 8);
            ctx.strokeRect(p.x - 4, p.y - 4, 8, 8);
          }
      }
      for (const e of frame.previews) drawEntity(e, "#8ae4b6", false, true);
      drawBlockParameterOverlay(ctx,frame.blockParameter,frame.doc.entities,screen);
      if (drag?.kind === "grip") {
        for (const e of frame.gripPreviews)
          drawEntity(e, "#a0f3c7", true, true);
      }
      if (drag?.kind === "select" && drag.moved) {
        const a = drag.start,
          b = mouse,
          cross = b.x < a.x;
        ctx.fillStyle = cross ? "#54c69419" : "#68bfff19";
        ctx.strokeStyle = cross ? "#70cfa4" : "#7ebddd";
        ctx.lineWidth = 1;
        ctx.setLineDash(cross ? [5, 3] : []);
        ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
        ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
        ctx.setLineDash([]);
      }
      if (tool?.points?.length) {
        ctx.lineWidth = 0.8;
        ctx.strokeStyle = "#8db7a980";
        ctx.setLineDash([3, 4]);
        if (
          transforms.includes(tool.name) ||
          tool.name === "CIRCLE"
        ) {
          path([tool.points[0], cursor]);
          ctx.stroke();
        }
        ctx.setLineDash([]);
      }
      const lightSurface = activeSpace !== "model";
      const snapColor = lightSurface ? "#0057b8" : "#ffe66b";
      const snapOutline = lightSurface ? "#ffffff" : "#102026";
      for (const anchor of trackAnchors) {
        const p = screen(anchor);
        ctx.strokeStyle = snapOutline;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(p.x - 5, p.y);
        ctx.lineTo(p.x + 5, p.y);
        ctx.moveTo(p.x, p.y - 5);
        ctx.lineTo(p.x, p.y + 5);
        ctx.stroke();
        ctx.strokeStyle = snapColor;
        ctx.lineWidth = 1.8;
        ctx.stroke();
      }
      if (snap?.guides?.length) {
        ctx.strokeStyle = lightSurface
          ? snap.mode === "track"
            ? "#0057b8"
            : "#007454"
          : snap.mode === "track"
            ? "#ffe66b"
            : "#67cda9";
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 5]);
        for (const guide of snap.guides) {
          path([guide.a, guide.b]);
          ctx.stroke();
        }
        ctx.setLineDash([]);
      }
      if (snap) {
        const p = screen(snap.p);
        ctx.strokeStyle = snapOutline;
        ctx.lineWidth = 5;
        ctx.strokeRect(p.x - 6, p.y - 6, 12, 12);
        ctx.strokeStyle = snapColor;
        ctx.lineWidth = 2;
        ctx.strokeRect(p.x - 6, p.y - 6, 12, 12);
      }
      if (
        tool &&
        tool.phase !== "select" &&
        mouse.x > 0 &&
        mouse.x < width &&
        mouse.y > 0 &&
        mouse.y < height
      ) {
        const p = screen(cursor);
        ctx.strokeStyle = lightSurface ? "#34566e" : "#badac3";
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.moveTo(p.x - 17, p.y);
        ctx.lineTo(p.x - 5, p.y);
        ctx.moveTo(p.x + 5, p.y);
        ctx.lineTo(p.x + 17, p.y);
        ctx.moveTo(p.x, p.y - 17);
        ctx.lineTo(p.x, p.y - 5);
        ctx.moveTo(p.x, p.y + 5);
        ctx.lineTo(p.x, p.y + 17);
        ctx.stroke();
      }

      ctx.restore();
    } finally {
      camera = null;
      frame = null;
    }
  }
  return render;
}
