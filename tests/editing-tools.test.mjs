import test from "node:test";
import assert from "node:assert/strict";
import { Editor } from "../src/editor.js";
import { editingTools, applyEditingChange } from "../src/editing-tools.js";
import { DocumentSession } from "../src/document-session.js";
import { demoDocument } from "../src/demo-document.js";
const line = (id, a, b) => ({ id, layer: "walls", space: "model", type: "line", color: "#123456", lineType: "DASHED", points: [a, b] });
const target = line("target", { x: 0, y: 0 }, { x: 10, y: 0 });
const boundary = line("boundary", { x: 5, y: -10 }, { x: 5, y: 10 });
function setup(entities = [target, boundary], ids = []) {
  const doc = demoDocument();
  entities = entities.map((e) => ({ ...e, layer: doc.layers[0].id }));
  doc.entities = structuredClone(entities);
  const session = new DocumentSession(doc), messages = [];
  let selected = ids, pointer = { x: 8, y: 0 }, hitId = "target", allowed = entities.map((e) => e.id), fail = false,shift=false;
  const editor = new Editor({
    tools: editingTools,
    getContext: () => ({
      entities: session.document.entities.filter((e) => selected.includes(e.id) && allowed.includes(e.id)),
      editableEntities: session.document.entities.filter((e) => allowed.includes(e.id)),
      boundaryEntities:session.document.entities,shift,
      hitEntity: session.document.entities.find((e) => e.id === hitId && allowed.includes(e.id)), pointer,
    }),
    setSelection: (ids) => { selected = ids; },
    notify: (m) => messages.push(m),
    applyChange: (change) => {
      if (fail) throw Error("transaction failed");
      session.commit(change.label, (draft) => { draft.entities = applyEditingChange(draft.entities, change); });
    },
  });
  return { editor, session, messages,
    get selected() { return selected; }, select(ids) { selected = ids; },
    hit(id, point) { hitId = id; pointer = point; }, allow(ids) { allowed = ids; }, fail(value) { fail = value; }, shift(value){shift=value;editor.dispatch({type:'modifier',shift:value});},
  };
}
const text = (f, value) => f.editor.dispatch({ type: "text", text: value, cursor: { x: 0, y: 10 } });
const point = (f, x, y) => f.editor.dispatch({ type: "point", point: { x, y } });

test("OFFSET preserves styles and original, commits once and restores with undo/redo", () => {
  const f = setup([target], ["target"]), before = structuredClone(f.session.document);
  f.editor.start("OFFSET"); text(f, "2,5"); point(f, 0, 10);
  const after = structuredClone(f.session.document), copy = after.entities[1];
  assert.deepEqual(after.entities[0], before.entities[0]);
  assert.deepEqual(copy.points, [{ x: 0, y: 2.5 }, { x: 10, y: 2.5 }]);
  for (const key of ["layer", "space", "color", "lineType"]) assert.equal(copy[key], before.entities[0][key]);
  assert.notEqual(copy.id, "target"); assert.equal(f.editor.state, null); assert.deepEqual(f.selected, []);
  assert.equal(f.session.history.past.length, 1);
  assert.deepEqual(f.session.undo(), before); assert.deepEqual(f.session.redo(), after);
});
test("OFFSET command-first selection, measured distance and cancel keep previews out of history", () => {
  const f = setup([target]); f.editor.start("OFFSET"); point(f, 0, 0);
  assert.equal(f.editor.state.phase, "select"); text(f, "10"); f.select(["target"]); text(f, "");
  point(f, 0, 0); const state = structuredClone(f.editor.state);
  assert.equal(f.editor.preview({ x: 3, y: 4 })[0].type, "line");
  assert.deepEqual(f.editor.state, state); point(f, 0, 0); assert.equal(f.editor.state.phase, "distance");
  point(f, 3, 4); assert.equal(f.editor.state.value, 5);
  assert.equal(f.editor.preview({ x: 0, y: -10 })[0].points[0].y, -5);
  f.editor.cancel(); assert.deepEqual(f.editor.preview({ x: 0, y: 0 }), []);
  assert.equal(f.session.history.past.length, 0);
});
test("OFFSET rejects invalid distances, unsupported types and bulged polylines", () => {
  const f = setup([target], ["target"]); f.editor.start("OFFSET");
  for (const value of ["", "0", "-1", "NaN", "Infinity", "abc"]) {
    text(f, value); assert.equal(f.editor.state.phase, "distance");
  }
  const polyline = { ...target, type: "polyline", bulges: [0.5], closed: false };
  const g = setup([polyline], ["target"]); g.editor.start("OFFSET"); text(g, "");
  assert.equal(g.editor.state.phase, "select"); assert.match(g.messages.at(-1), /bågar/);
  const h = setup([{ id: "text", type: "text", point: { x: 0, y: 0 }, text: "A", height: 10 }], ["text"]);
  h.editor.start("OFFSET"); text(h, ""); assert.equal(h.editor.state.phase, "select");
});
test("OFFSET inward failure rejects entire mixed selection and permits correction", () => {
  const f = setup([target, { id: "circle", type: "circle", center: { x: 0, y: 0 }, radius: 2 }], ["target", "circle"]);
  f.editor.start("OFFSET"); text(f, "3"); point(f, 0, 1);
  assert.equal(f.session.document.entities.length, 2); assert.equal(f.editor.state.phase, "side");
  point(f, 0, 10); assert.equal(f.session.document.entities.length, 4);
});
test("OFFSET uses current geometry and rejects lost or locked sources", () => {
  const f = setup([target], ["target"]); f.editor.start("OFFSET"); text(f, "2");
  f.session.commit("style", (d) => { d.entities[0].color = "#abcdef"; });
  f.allow([]); point(f, 0, 10); assert.equal(f.editor.state.phase, "side");
  assert.deepEqual(f.editor.preview({ x: 0, y: 10 }), []);
  f.allow(["target"]); point(f, 0, 10); assert.equal(f.session.document.entities[1].color, "#abcdef");
});
test("TRIM starts immediately, uses raw hit point and commits only clicked geometry", () => {
  const f = setup(undefined, ["boundary"]); f.editor.start("TRIM");
  assert.equal(f.editor.state.phase, "trimPick");
  const before = structuredClone(f.session.document), state = structuredClone(f.editor.state);
  const preview = f.editor.preview({ x: 0, y: 999 });
  assert.deepEqual(preview[0].points, [{ x: 0, y: 0 }, { x: 5, y: 0 }]);
  assert.deepEqual(f.editor.state, state); assert.deepEqual(f.session.document, before);
  point(f, 0, 999); assert.equal(f.editor.state.phase, "trimPick");
  assert.deepEqual(f.session.document.entities[0].points, preview[0].points);
  assert.equal(f.session.history.past.length, 1); text(f, "junk"); assert.equal(f.editor.state.phase, "trimPick");
  text(f, ""); assert.equal(f.editor.state, null); assert.deepEqual(f.selected, []);
  const after = structuredClone(f.session.document); assert.deepEqual(f.session.undo(), before); assert.deepEqual(f.session.redo(), after);
});
test("TRIM uses automatic boundaries without highlighting them and rejects an empty hit", () => {
  const f = setup(); f.editor.start("TRIM"); point(f, 8, 0);
  assert.deepEqual(f.selected, []);
  assert.deepEqual(f.session.document.entities[1],{...boundary,layer:f.session.document.layers[0].id});
  f.hit(null, { x: 100, y: 100 }); point(f, 100, 100); assert.match(f.messages.at(-1), /Välj/);
  assert.equal(f.session.history.past.length, 1);
});
test("EXTEND shortcut starts directly and gives one undo transaction per click", () => {
  const short = { ...target, points: [{ x: 0, y: 0 }, { x: 2, y: 0 }] };
  const f = setup([short, boundary], ["boundary"]); f.editor.start("EXTEND");
  f.hit("target", { x: 2, y: 0 }); point(f, 100, 100);
  assert.deepEqual(f.session.document.entities[0].points, [{ x: 0, y: 0 }, { x: 5, y: 0 }]);
  assert.equal(f.editor.state.phase, "trimPick"); assert.equal(f.session.history.past.length, 1);
});
test("failed editing transactions preserve tool state and selection for retry", () => {
  for (const name of ["OFFSET", "TRIM", "EXTEND"]) {
    const short = name === "EXTEND" ? { ...target, points: [{ x: 0, y: 0 }, { x: 2, y: 0 }] } : target;
    const f = setup([short, boundary], [name === "OFFSET" ? "target" : "boundary"]);
    f.editor.start(name); if(name==='OFFSET')text(f,'2'); f.hit("target", { x: 8, y: 0 });
    const before = structuredClone(f.session.document), state = structuredClone(f.editor.state), selected = [...f.selected];
    f.fail(true); assert.throws(() => point(f, 0, 10), /transaction failed/);
    assert.deepEqual(f.editor.state, state); assert.deepEqual(f.selected, selected); assert.deepEqual(f.session.document, before);
    f.fail(false); point(f, 0, 10); assert.equal(f.session.history.past.length, 1);
  }
});
test("editing result insertion is isolated, ordered and rejects missing replacement identity", () => {
  const change = { replaceId: "target", entities: [{ ...target, id: "a" }, { ...target, id: "b" }] };
  const result = applyEditingChange([boundary, target], change);
  assert.deepEqual(result.map((e) => e.id), ["boundary", "a", "b"]);
  result[1].points[0].x = 999; assert.equal(change.entities[0].points[0].x, 0);
  assert.throws(() => applyEditingChange([boundary], change), /inte längre/);
});
test("TRIM reevaluates current split geometry across successive clicks", () => {
  const second = line("second", { x: 0, y: 5 }, { x: 10, y: 5 });
  const left = line("left", { x: 3, y: -10 }, { x: 3, y: 10 });
  const right = line("right", { x: 7, y: -10 }, { x: 7, y: 10 });
  const f = setup([target, second, left, right]); f.editor.start("TRIM");
  f.hit("target", { x: 5, y: 0 }); point(f, 5, 0);
  const pieces = f.session.document.entities.filter((e) => !["second", "left", "right"].includes(e.id));
  assert.equal(pieces.length, 2); assert.equal(new Set(f.selected).size, 0);
  f.hit("second", { x: 5, y: 5 }); point(f, 5, 5);
  assert.equal(f.session.history.past.length, 2); assert.equal(f.session.document.entities.length, 6);
  f.session.undo(); assert.equal(f.session.document.entities.length, 5);
  f.session.undo(); assert.equal(f.session.document.entities.length, 4);
});
test('Shift switches trim to nearest extension and releasing it restores trim without history for previews',()=>{
  const short={...target,points:[{x:0,y:0},{x:2,y:0}]},far={...boundary,id:'far',points:[{x:8,y:-10},{x:8,y:10}]};
  const f=setup([short,far,boundary]);f.editor.start('TRIM');f.hit('target',{x:2,y:0});
  assert.deepEqual(f.editor.preview({x:100,y:100}),[]);f.shift(true);
  assert.match(f.editor.describe().prompt,/Förläng:/);
  assert.deepEqual(f.editor.preview({x:100,y:100})[0].points,[{x:0,y:0},{x:5,y:0}]);assert.equal(f.session.history.past.length,0);
  point(f,2,0);assert.equal(f.session.document.entities[0].points[1].x,5);f.shift(false);assert.match(f.editor.describe().prompt,/Trimma:/);
  f.hit('boundary',{x:5,y:8});point(f,5,8);assert.equal(f.session.document.entities.find(e=>e.id==='boundary').points[1].y,0);assert.equal(f.session.history.past.length,2);
});
test('locked boundary remains eligible but locked target cannot be edited',()=>{
  const f=setup();f.allow(['target']);f.editor.start('TRIM');point(f,8,0);assert.equal(f.session.document.entities[0].points[1].x,5);
  f.hit('boundary',{x:5,y:9});assert.deepEqual(f.editor.preview({x:5,y:9}),[]);point(f,5,9);assert.equal(f.session.history.past.length,1);
});
test("OFFSET validation failure keeps distance, sources and redo until corrected", () => {
  const f = setup([target], ["target"]);
  f.session.commit("style", (d) => { d.entities[0].color = "#abcdef"; }); f.session.undo();
  f.editor.start("OFFSET"); text(f, "10000000000000");
  const state = structuredClone(f.editor.state), before = structuredClone(f.session.document);
  assert.throws(() => point(f, 0, 10), /ogiltig ritning/);
  assert.deepEqual(f.editor.state, state); assert.deepEqual(f.session.document, before);
  assert.equal(f.session.history.future.length, 1); assert.deepEqual(f.selected, ["target"]);
  f.editor.cancel(); f.editor.start("OFFSET"); text(f, "2"); point(f, 0, 10);
  assert.equal(f.session.document.entities.length, 2); assert.equal(f.session.history.future.length, 0);
});

test("circle trim preview becomes an arc and one commit supports undo and redo", () => {
  const circle = { id: "circle", type: "circle", center: { x: 0, y: 0 }, radius: 10, color: "#123456", space: "model" };
  const f = setup([circle, boundary]); const before = structuredClone(f.session.document);
  f.hit("circle", { x: 10, y: 0 }); f.editor.start("TRIM");
  assert.equal(f.editor.preview({ x: 10, y: 0 })[0].type, "arc");
  assert.deepEqual(f.session.document, before); assert.equal(f.session.history.past.length, 0);
  f.shift(true); assert.deepEqual(f.editor.preview({ x: 10, y: 0 }), []);
  point(f, 10, 0); assert.deepEqual(f.session.document, before);
  f.shift(false); point(f, 10, 0);
  const after = structuredClone(f.session.document);
  assert.equal(after.entities[0].type, "arc"); assert.deepEqual(after.entities[1], before.entities[1]);
  assert.equal(f.session.history.past.length, 1);
  assert.deepEqual(f.session.undo(), before); assert.deepEqual(f.session.redo(), after);
});

test("sweep stages multiple trims and commits once on release with undo and redo", () => {
  const targets = [0, 3, 6].map((y,i)=>line(`s${i}`, {x:0,y}, {x:10,y}));
  const f=setup([...targets,boundary]), before=structuredClone(f.session.document);
  f.hit(null,{x:8,y:-1});f.editor.start('TRIM');f.editor.dispatch({type:'sweepStart'});
  f.hit(null,{x:8,y:7});f.editor.dispatch({type:'sweepMove'});
  assert.equal(f.editor.preview({x:8,y:7}).length,3);
  assert.deepEqual(f.session.document,before);assert.equal(f.session.history.past.length,0);
  f.editor.dispatch({type:'sweepEnd'});
  assert.equal(f.session.history.past.length,1);assert.equal(f.editor.state.sweep,undefined);
  const after=structuredClone(f.session.document);
  for(const entity of after.entities.filter(e=>e.id!=='boundary'))assert.equal(entity.points[1].x,5);
  assert.deepEqual(f.session.undo(),before);assert.deepEqual(f.session.redo(),after);
});
test("click gesture commits on release while capture loss, escape and failed commit keep geometry intact", () => {
  const f=setup(), before=structuredClone(f.session.document);f.hit('target',{x:8,y:0});f.editor.start('TRIM');
  f.editor.dispatch({type:'sweepStart'});assert.equal(f.editor.preview({x:8,y:0}).length,1);
  f.editor.dispatch({type:'sweepCancel'});assert.deepEqual(f.session.document,before);assert.equal(f.editor.state.sweep,undefined);
  f.editor.dispatch({type:'sweepStart'});f.editor.cancel();assert.deepEqual(f.session.document,before);
  f.editor.start('TRIM');f.editor.dispatch({type:'sweepStart'});f.fail(true);
  assert.throws(()=>f.editor.dispatch({type:'sweepEnd'}),/transaction failed/);
  assert.deepEqual(f.session.document,before);assert.equal(f.session.history.past.length,0);
  f.editor.dispatch({type:'sweepCancel'});f.fail(false);
  f.editor.dispatch({type:'sweepStart'});f.editor.dispatch({type:'sweepEnd'});assert.equal(f.session.history.past.length,1);
});
