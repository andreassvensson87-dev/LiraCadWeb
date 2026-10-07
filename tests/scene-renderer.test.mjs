import test from "node:test";
import assert from "node:assert/strict";
import { createSceneRenderer, viewportClip, gridSpacing } from "../src/scene-renderer.js";
import { viewportCamera } from "../src/layout.js";
import { createSpatialIndex } from '../src/spatial-index.js';
import { bounds } from '../src/entity-geometry.js';
const line = (id, points, props = {}) => ({ id, layer: "visible", type: "line", points, ...props });
function canvas() {
  const calls = [], stack = []; let state = {};
  const ctx = new Proxy({}, {
    set(target, name, value) { state[name] = value; return true; },
    get(target, name) {
      if (name === "save") return () => { stack.push({ ...state }); calls.push(["save"]); };
      if (name === "restore") return () => { state = stack.pop() || {}; calls.push(["restore"]); };
      return (...args) => { calls.push([name, ...args, { ...state }]); };
    },
  });
  return { ctx, calls, stack };
}
function frame(entities = []) {
  return { doc: { layers: [{ id: "visible", color: "#ffffff" }, { id: "hidden", visible: false }], entities, layouts: [{ id: "paper", name: "Paper", width: 200, height: 100 }] },
    camera: { x: 0, y: 0, scale: 1 }, paperCamera: null, width: 400, height: 300, dpr: 2,
    activeSpace: "model", activeViewportId: null, selection: new Set(), hover: null, tool: null,
    cursor: { x: 0, y: 0 }, mouse: { x: -1, y: -1 }, showGrid: false, drag: null, trackAnchors: [], snap: null,
    previews: [], gripPreviews: [], movedViewport: null, previewTarget: null, editableIds: new Set(),
  };
}
test("scene culls hidden/offscreen/wrong-space geometry and reads camera per frame", () => {
  const visible = line("v", [{ x: 0, y: 0 }, { x: 10, y: 0 }]);
  const f = frame([visible, { ...visible, id: "hidden", layer: "hidden" }, { ...visible, id: "paper", space: "paper" }, line("far", [{ x: 1000, y: 0 }, { x: 1010, y: 0 }])]);
  const before = structuredClone(f), c = canvas(), render = createSceneRenderer(c);
  render(f); assert.equal(c.calls.filter(([name]) => name === "stroke").length, 1);
  assert.ok(c.calls.some(([name, x, y]) => name === "moveTo" && x === 200 && y === 150));
  assert.deepEqual(f, before); assert.equal(c.stack.length, 0);
  c.calls.length = 0; render({ ...f, camera: { x: 10, y: 0, scale: 2 } });
  assert.ok(c.calls.some(([name, x, y]) => name === "moveTo" && x === 180 && y === 150));
});
test("scene suppresses trim original and paints transient previews without touching document", () => {
  const f = frame([line("target", [{ x: 0, y: 0 }, { x: 10, y: 0 }])]);
  f.previewTarget = "target"; f.previews = [line("preview", [{ x: 0, y: 0 }, { x: 5, y: 0 }])];
  const before = structuredClone(f), c = canvas(); createSceneRenderer(c)(f);
  assert.equal(c.calls.filter(([name]) => name === "stroke").length, 1);
  assert.deepEqual(f, before); assert.equal(c.stack.length, 0);
});
test("paper view clips model entities in each viewport while keeping app cameras unchanged", () => {
  const model = line("model", [{ x: 0, y: 0 }, { x: 10, y: 0 }]);
  const viewport = { id: "viewport", type: "viewport", layer: "visible", space: "paper", points: [{ x: 10, y: 10 }, { x: 90, y: 90 }], viewCenter: { x: 0, y: 0 }, viewScale: 1 };
  const second = { ...viewport, id: "second", points: [{ x: 110, y: 10 }, { x: 190, y: 90 }] };
  const f = frame([model, viewport, second]); f.activeSpace = "paper"; f.camera = { x: 100, y: 50, scale: 1 };
  const before = structuredClone(f), c = canvas(); createSceneRenderer(c)(f);
  assert.equal(c.calls.filter(([name]) => name === "clip").length, 2);
  assert.ok(c.calls.some(([name, x, y]) => name === "moveTo" && x === 150 && y === 150));
  assert.ok(c.calls.some(([name, x, y]) => name === "moveTo" && x === 250 && y === 150));
  assert.deepEqual(f, before); assert.equal(c.stack.length, 0);
  const active = { ...f, activeViewportId: "viewport", paperCamera: f.camera, camera: viewportCamera(viewport, f.camera, f.width, f.height) };
  const activeBefore = structuredClone(active); createSceneRenderer(c)(active);
  assert.deepEqual(active, activeBefore); assert.equal(c.stack.length, 0);
});
test("scene paints moved viewport and grip overlays from supplied previews", () => {
  const viewport = { id: "viewport", type: "viewport", layer: "visible", space: "paper", points: [{ x: 10, y: 10 }, { x: 90, y: 90 }], viewCenter: { x: 0, y: 0 }, viewScale: 1 };
  const f = frame([viewport]); f.activeSpace = "paper"; f.camera = { x: 100, y: 50, scale: 1 };
  f.drag = { kind: "viewportMove", entity: viewport, moved: true }; f.movedViewport = { ...viewport, points: [{ x: 20, y: 10 }, { x: 100, y: 90 }] };
  const c = canvas(), render = createSceneRenderer(c); render(f);
  assert.ok(c.calls.some(([name, x, y, w, h]) => name === "rect" && x === 120 && y === 110 && w === 80 && h === 80));
  f.drag = { kind: "grip", targets: [{ entity: viewport }] }; f.gripPreviews = [f.movedViewport];
  render(f); assert.equal(c.stack.length, 0);
});
test("viewport clipping and grid spacing remain consistent across scale and corner order", () => {
  const viewport = { points: [{ x: 10, y: 20 }, { x: 30, y: 40 }] };
  assert.deepEqual(viewportClip(viewport, { x: 0, y: 0, scale: 2 }, 100, 100), { x: 70, y: -30, w: 40, h: 40 });
  assert.deepEqual(viewportClip({ points: [...viewport.points].reverse() }, { x: 0, y: 0, scale: 2 }, 100, 100), { x: 70, y: -30, w: 40, h: 40 });
  assert.equal(gridSpacing(1), 100); assert.equal(gridSpacing(0.1), 1000); assert.equal(gridSpacing(10), 10);
});
test('background cache reuses geometry for previews and reprojects navigation until exact repaint', () => {
  const c=canvas();let copies=0;
  const image={width:400,height:300,getContext:()=>({clearRect(){},drawImage(){copies++;}})};
  const render=createSceneRenderer({ctx:c.ctx,createCanvas:(w,h)=>{image.width=w;image.height=h;return image;}});
  const f=frame([line('a',[{x:0,y:0},{x:10,y:0}])]);
  render(f);assert.equal(copies,1);
  c.calls.length=0;f.previews=[line('preview',[{x:0,y:0},{x:5,y:5}])];render(f);
  assert.equal(copies,1);assert.equal(c.calls.filter(([name])=>name==='stroke').length,1);
  assert.ok(c.calls.some(([name])=>name==='drawImage'));
  c.calls.length=0;f.previews=[];f.camera={x:10,y:0,scale:2};f.navigating=true;render(f);
  assert.equal(copies,1);assert.equal(c.calls.filter(([name])=>name==='stroke').length,0);
  assert.ok(c.calls.some(([name,img,x,y,w,h])=>name==='drawImage'&&x===-220&&y===-150&&w===800&&h===600));
  f.navigating=false;render(f);assert.equal(copies,2);
  f.selection.add('a');render(f);assert.equal(copies,3);
  f.doc={...f.doc,entities:[...f.doc.entities,line('new',[{x:0,y:0},{x:20,y:20}])]};render(f);assert.equal(copies,4);
  f.showGrid=true;render(f);assert.equal(copies,5);
  f.doc.layers=[{id:'visible',visible:false}];render(f);assert.equal(copies,6);
});
test('append paints only new geometry over the cached background and invalidates on layer changes', () => {
  const c=canvas(),image={width:0,height:0,getContext:()=>({clearRect(){},drawImage(){}})};
  const render=createSceneRenderer({ctx:c.ctx,createCanvas:(w,h)=>{image.width=w;image.height=h;return image;}});
  const f=frame([line('a',[{x:0,y:0},{x:10,y:0}])]);f.sceneIndex=createSpatialIndex(f.doc.entities,bounds);render(f);
  const added=line('b',[{x:0,y:10},{x:10,y:10}]);
  f.doc={...f.doc,layers:structuredClone(f.doc.layers),entities:[...f.doc.entities,added]};f.sceneIndex=f.sceneIndex.append([added]);
  c.calls.length=0;render(f);
  assert.equal(c.calls.filter(([name])=>name==='stroke').length,1);
  assert.ok(c.calls.some(([name])=>name==='drawImage'));
  c.calls.length=0;render(f);assert.equal(c.calls.filter(([name])=>name==='stroke').length,0);
  const third=line('c',[{x:0,y:20},{x:10,y:20}]);
  f.doc={...f.doc,layers:[{id:'visible',color:'#123456'}],entities:[...f.doc.entities,third]};f.sceneIndex=f.sceneIndex.append([third]);
  c.calls.length=0;render(f);assert.equal(c.calls.filter(([name])=>name==='stroke').length,3);
});

test('live text replacement draws only the draft, including when moved outside the spatial query',()=>{
 const original={id:'text',type:'text',layer:'visible',point:{x:10000,y:0},height:12,text:'Old'};
 const f=frame([original]),before=structuredClone(f.doc),c=canvas(),render=createSceneRenderer(c);
 f.textReplacement={originalId:'text',entity:{...original,point:{x:0,y:0},text:'Draft'}};render(f);
 assert.ok(c.calls.some(([name,text])=>name==='fillText'&&text==='Draft'));assert.ok(!c.calls.some(([name,text])=>name==='fillText'&&text==='Old'));assert.deepEqual(f.doc,before);
 c.calls.length=0;f.textReplacement=null;render(f);assert.ok(!c.calls.some(([name])=>name==='fillText'));
});
test('paper and clipped model views render transient text without changing the document',()=>{
 const text={id:'text',type:'text',layer:'visible',point:{x:0,y:0},height:12,text:'Old'};
 const viewport={id:'vp',type:'viewport',layer:'visible',space:'paper',points:[{x:10,y:10},{x:100,y:90}],viewCenter:{x:0,y:0},viewScale:1};
 for(const space of ['model','paper']){
  const e={...text,space};const f=frame([e,viewport]);f.activeSpace='paper';f.textReplacement={originalId:'text',entity:{...e,text:'Draft'}};
  const c=canvas();createSceneRenderer(c)(f);assert.equal(c.calls.filter(([name,text])=>name==='fillText'&&text==='Draft').length,1);assert.equal(c.calls.filter(([name,text])=>name==='fillText'&&text==='Old').length,0);
 }
});

test('reference geometry is faded independently of host objects and canvas alpha is restored',()=>{
  const ref=line('xref',[{x:0,y:0},{x:10,y:0}],{_xrefOpacity:.4,_xrefId:'reference'});
  const own=line('own',[{x:0,y:10},{x:10,y:10}]);
  const c=canvas();c.ctx.globalAlpha=1;createSceneRenderer(c)(frame([ref,own]));
  const strokes=c.calls.filter(([name])=>name==='stroke');assert.equal(strokes[0].at(-1).globalAlpha,.4);assert.equal(strokes[1].at(-1).globalAlpha,1);assert.equal(c.stack.length,0);
});

test('sweep hides all staged originals and invalidates the background cache as targets change',()=>{
 const c=canvas();let copies=0;
 const image={width:400,height:300,getContext:()=>({clearRect(){},drawImage(){copies++;}})};
 const render=createSceneRenderer({ctx:c.ctx,createCanvas:()=>image});
 const f=frame([line('a',[{x:0,y:0},{x:10,y:0}]),line('b',[{x:0,y:10},{x:10,y:10}])]);
 render(f);assert.equal(copies,1);
 f.previewTargets=['a'];f.previews=[line('a',[{x:0,y:0},{x:5,y:0}])];
 c.calls.length=0;render(f);assert.equal(copies,2);assert.equal(c.calls.filter(([name])=>name==='stroke').length,2);
 f.previewTargets=['a','b'];f.previews.push(line('b',[{x:0,y:10},{x:5,y:10}]));
 c.calls.length=0;render(f);assert.equal(copies,3);assert.equal(c.calls.filter(([name])=>name==='stroke').length,2);
 f.previewTargets=[];f.previews=[];
 c.calls.length=0;render(f);assert.equal(copies,4);assert.equal(c.calls.filter(([name])=>name==='stroke').length,2);
});
