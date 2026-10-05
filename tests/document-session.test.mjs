import test from "node:test";
import assert from "node:assert/strict";
import { DocumentSession } from "../src/document-session.js";

const fixture = () => ({
  version: 1, name: "Drawing",
  layers: [{ id: "0", name: "0", color: "#ffffff" }], entities: [],
});
const line = () => ({ id: "a", type: "line", layer: "0", points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] });

test("session accepts isolated valid drafts and records one reversible transaction", () => {
  const initial = fixture(), session = new DocumentSession(initial);
  initial.name = "outside";
  let draft;
  assert.equal(session.commit("Line", (d) => { draft = d; d.entities.push(line()); }), true);
  draft.entities[0].points[0].x = 99;
  assert.equal(session.document.name, "Drawing");
  assert.equal(session.document.entities[0].points[0].x, 0);
  assert.equal(session.history.past.length, 1);
  assert.deepEqual(session.undo(), fixture());
  assert.equal(session.document.entities.length, 0);
  assert.equal(session.redo().entities.length, 1);
});

test("invalid and throwing edits preserve document and redo history", () => {
  const session = new DocumentSession(fixture());
  session.commit("Line", (d) => { d.entities.push(line()); });
  session.undo();
  const original = structuredClone(session.document);
  for (const change of [
    (d) => { d.entities.push({ ...line(), layer: "missing" }); },
    (d) => { d.layers[0].color = "invalid"; },
    (d) => { d.entities.push(line()); throw Error("failed"); },
  ]) {
    assert.throws(() => session.commit("Invalid", change));
    assert.deepEqual(session.document, original);
    assert.equal(session.history.past.length, 0);
    assert.equal(session.history.future.length, 1);
  }
  assert.equal(session.redo().entities.length, 1);
});

test("no-op edits preserve redo; replacements are validated and isolated", () => {
  const session = new DocumentSession(fixture());
  session.commit("Line", (d) => { d.entities.push(line()); });
  session.undo();
  assert.equal(session.commit("No-op", () => {}), false);
  assert.equal(session.history.future.length, 1);
  const replacement = { ...fixture(), name: "Imported" };
  session.commit("Open", () => replacement);
  replacement.name = "outside";
  assert.equal(session.document.name, "Imported");
  assert.equal(session.history.future.length, 0);
  assert.throws(() => session.commit("Invalid open", () => ({})), /ogiltig/);
});

test("nested transactions fail atomically and later edits still work", () => {
  const session = new DocumentSession(fixture());
  assert.throws(() => session.commit("Outer", (d) => {
    d.name = "Changed";
    session.commit("Inner", () => {});
  }), /pågår/);
  assert.deepEqual(session.document, fixture());
  assert.equal(session.history.past.length, 0);
  session.commit("After", (d) => { d.name = "After"; });
  assert.equal(session.document.name, "After");
});

test("block drafts use independent sessions and parent history stays intact", () => {
  const parent = new DocumentSession(fixture());
  parent.commit("Line", (d) => { d.entities.push(line()); });
  const draft = new DocumentSession(parent.document);
  draft.commit("Edit block", (d) => { d.entities[0].points[1].x = 50; });
  assert.equal(parent.document.entities[0].points[1].x, 10);
  assert.equal(parent.history.past.length, 1);
  parent.commit("Save block", () => draft.document);
  assert.equal(parent.document.entities[0].points[1].x, 50);
  parent.undo();
  assert.equal(parent.document.entities[0].points[1].x, 10);
});

test("history navigation cannot run inside a transaction", () => {
  const session = new DocumentSession(fixture());
  session.commit("Line", (d) => { d.entities.push(line()); });
  const before = structuredClone(session.document);
  for (const action of [() => session.undo(), () => session.redo()]) {
    assert.throws(() => session.commit("Nested history", (d) => {
      d.name = "Changed";
      action();
    }), /pågår/);
    assert.deepEqual(session.document, before);
    assert.equal(session.history.past.length, 1);
  }
});
test('append shares immutable geometry while isolating input, arrays, metadata and history', () => {
  const initial=fixture();initial.entities.push(line());
  const session=new DocumentSession(initial),before=session.document,original=before.entities[0];
  const extra={...line(),id:'b'};
  assert.equal(session.append('Add',[extra]),true);
  assert.equal(session.document.entities[0],original);
  assert.notEqual(session.document.entities,before.entities);
  assert.throws(()=>{original.points[0].x=99;},TypeError);
  extra.points[0].x=50;
  before.entities.length=0;before.layers[0].name='outside';
  assert.equal(session.document.entities[1].points[0].x,0);
  assert.equal(session.document.layers[0].name,'0');
  session.document.layers[0].name='current metadata';
  assert.deepEqual(session.undo(),initial);
  assert.equal(session.redo().entities.length,2);
  assert.equal(session.document.layers[0].name,'0');
  session.commit('Move',d=>{d.entities[1].points[0].x=5;});
  assert.equal(session.document.entities[1].points[0].x,5);
  session.undo();assert.equal(session.document.entities[1].points[0].x,0);
  session.undo();assert.equal(session.document.entities.length,1);
  session.redo();assert.equal(session.document.entities.length,2);
});
test('append failures and empty additions preserve accepted document and redo', () => {
  const session=new DocumentSession(fixture());session.append('Add',[line()]);session.undo();
  const before=session.document;
  assert.equal(session.append('Empty',[]),false);
  for(const additions of [[{...line(),layer:'missing'}],[line(),line()]]) {
    assert.throws(()=>session.append('Invalid',additions),/ogiltig/);
    assert.equal(session.document,before);assert.equal(session.history.future.length,1);
  }
  assert.throws(()=>session.commit('Nested',()=>session.append('Inner',[line()])),/pågår/);
  assert.equal(session.history.future.length,1);
  session.redo();assert.equal(session.document.entities.length,1);
});

test('entity replacements preserve geometry ownership, order and reversible edit chains', () => {
  const initial=fixture();initial.entities=[line(),{...line(),id:'b'}];
  const session=new DocumentSession(initial),original=session.document.entities[1];
  const moved={...session.document.entities[0],points:[{x:5,y:10},{x:15,y:10}]};
  session.replaceEntities('Move',[moved,original]);
  moved.points[0].x=999;
  assert.equal(session.document.entities[0].points[0].x,5);
  assert.equal(session.document.entities[1],original);
  const movedSnapshot=structuredClone(session.document);
  session.replaceEntities('Rotate',[{...session.document.entities[0],points:[{x:-10,y:5},{x:-10,y:15}]},original]);
  const rotatedSnapshot=structuredClone(session.document);
  session.replaceEntities('Delete',[original]);
  assert.deepEqual(session.undo(),rotatedSnapshot);
  assert.deepEqual(session.undo(),movedSnapshot);
  assert.deepEqual(session.undo(),initial);
  session.document.layers[0].name='outside';session.document.entities.pop();
  assert.deepEqual(session.redo(),movedSnapshot);
  assert.deepEqual(session.redo(),rotatedSnapshot);
  assert.equal(session.redo().entities.length,1);
});
test('equivalent, invalid and nested replacements preserve document and redo', () => {
  const initial=fixture();initial.entities=[line()];
  const session=new DocumentSession(initial);
  session.replaceEntities('Delete',[]);session.undo();
  const before=session.document;
  assert.equal(session.replaceEntities('Same',[...before.entities]),false);
  assert.equal(session.replaceEntities('Equivalent',structuredClone(before.entities)),false);
  assert.equal(session.history.future.length,1);
  for(const entities of [[{...line(),layer:'missing'}],[line(),line()]]) {
    assert.throws(()=>session.replaceEntities('Bad',entities),/ogiltig/);
    assert.equal(session.document,before);assert.equal(session.history.future.length,1);
  }
  assert.throws(()=>session.commit('Nested',()=>session.replaceEntities('Inner',[])),/pågår/);
  assert.equal(session.history.future.length,1);
});
