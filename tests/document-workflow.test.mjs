import test from "node:test";
import assert from "node:assert/strict";
import { createDocumentWorkflow } from "../src/document-workflow.js";
import { DocumentSession } from "../src/document-session.js";
import { TextEditSession } from "../src/text-edit-session.js";
import { ProjectStorage } from "../src/project-storage.js";
import { Editor } from "../src/editor.js";
import { transformTools, applyTransformChange } from "../src/transform-tools.js";
import { applyEditingChange } from "../src/editing-tools.js";
import { demoDocument } from "../src/demo-document.js";
import { validDocument } from "../src/document.js";
import { readDrawingFile } from "../src/file-import.js";
import { importDXF, decodeDXF } from "../src/dxf-import.js";

const project = (document, name = "Test.liracad") => ({ name, size: 100, text: async () => JSON.stringify(document) });
function harness(options = {}) {
  const session = new DocumentSession(demoDocument()), downloads = [], labels = [];
  let textAccepted = true, block = false, pending = false, prepared = 0;
  const workflow = createDocumentWorkflow({
    getDocument: () => session.document,
    hasBlockEdit: () => block, finishText: () => textAccepted, finishBlock: () => { block = false; return true; },
    hasPendingEdit: () => pending, prepareOpen: () => { prepared++; pending = false; },
    replaceDocument: (document, label) => { labels.push(label); session.commit(label, () => document); },
    syncView() {}, download: (name, text, type) => downloads.push({ name, text, type }), ...options,
  });
  return { session, workflow, downloads, labels, textAccepted: (value) => { textAccepted = value; }, block: (value) => { block = value; }, pending: (value) => { pending = value; }, prepared: () => prepared };
}
test("open → editor change → undo/redo → save → reopen → DXF preserves accepted geometry and project state", async () => {
  const h = harness(), initial = demoDocument(); initial.name = "Stabilitetsprov";
  initial.layouts = [{ id: "paper", name: "Layout 1", width: 420, height: 297 }];
  initial.entities.push({ id: "viewport", type: "viewport", layer: initial.layers[0].id, space: "paper", points: [{ x: 10, y: 10 }, { x: 100, y: 80 }], viewCenter: { x: 0, y: 0 }, viewScale: 0.01, locked: true });
  await h.workflow.open(project(initial));
  const source = h.session.document.entities.find((e) => e.type === "line"), before = structuredClone(source);
  const editor = new Editor({ tools: transformTools,
    getContext: () => ({ entities: h.session.document.entities.filter((e) => e.id === source.id) }),
    applyChange: (change) => h.session.commit(change.label, (d) => { d.entities = applyTransformChange(d.entities, change).entities; }),
  });
  editor.start("MOVE"); editor.dispatch({ type: "point", point: { x: 0, y: 0 } }); editor.dispatch({ type: "text", text: "@100,50" });
  assert.deepEqual(h.session.document.entities.find((e) => e.id === source.id).points[0], { x: before.points[0].x + 100, y: before.points[0].y + 50 });
  h.session.undo(); assert.deepEqual(h.session.document.entities.find((e) => e.id === source.id), before);
  h.session.redo(); const accepted = structuredClone(h.session.document);
  assert.equal(h.workflow.save(), true); const saved = h.downloads.at(-1);
  assert.deepEqual(JSON.parse(saved.text), accepted); assert.equal(saved.type, "application/json");
  const reopened = new DocumentSession((await readDrawingFile(project(JSON.parse(saved.text)))).document);
  assert.deepEqual(reopened.document, accepted);
  let raw;
  const storage = new ProjectStorage({write:async value=>{raw=structuredClone(value);},read:async()=>raw});
  await storage.save(reopened.document); assert.deepEqual((await storage.restore(validDocument)).document, accepted);
  assert.equal(h.workflow.exportDXF(), true); const exported = h.downloads.at(-1);
  const parsed = importDXF(exported.text, "Roundtrip"); assert.ok(validDocument(parsed.document));
  const moved = h.session.document.entities.find((e) => e.id === source.id);
  assert.ok(parsed.document.entities.some((e) => e.type === "line" && JSON.stringify(e.points) === JSON.stringify(moved.points)));
  assert.deepEqual(h.session.document, accepted); // serialization/export must not mutate accepted state
  // DXF exports leader text as a separate TEXT entity; the importer reports this loss of association.
  assert.equal(parsed.document.entities.length, accepted.entities.length + accepted.entities.filter((e) => e.type === "leader").length);
  assert.ok(parsed.report.some((item) => item.message.includes("Leader")));
  assert.equal(parsed.document.layouts.length, 1);
  assert.ok(parsed.document.entities.some((e) => e.type === "viewport" && e.viewScale === 0.01));
});
test("a rejected text draft blocks save/export/open/replace without downloads or document changes", async () => {
  const h = harness(), original = structuredClone(h.session.document); h.textAccepted(false);
  assert.equal(h.workflow.save(), false); assert.equal(h.workflow.exportDXF(), false);
  assert.equal(await h.workflow.open(project(demoDocument())), null);
  assert.equal(h.workflow.replace(demoDocument(), "Replace"), false);
  assert.deepEqual(h.session.document, original); assert.equal(h.session.history.past.length, 0);
  assert.equal(h.prepared(), 0); assert.equal(h.downloads.length, 0);
});
test("text draft is accepted before serialization and rejection retains it", () => {
  const session = new DocumentSession(demoDocument()), source = session.document.entities.find((e) => e.type === "text");
  const draft = new TextEditSession(source), downloads = [];
  const workflow = createDocumentWorkflow({ getDocument: () => session.document, hasBlockEdit: () => false,
    finishText: () => {
      if (draft.closed) return true;
      draft.finish(true, "Saved text", (change) => session.commit(change.label, (d) => { d.entities = applyEditingChange(d.entities, change); })); return true;
    }, syncView() {}, download: (_, text) => downloads.push(text),
  });
  workflow.save(); assert.equal(JSON.parse(downloads[0]).entities.find((e) => e.id === source.id).text, "Saved text");
  assert.equal(session.history.past.length, 1); session.undo(); assert.equal(session.document.entities.find((e) => e.id === source.id).text, source.text);
});
test("slow imports cannot overwrite edits or newly started commands, and can be retried", async () => {
  for (const change of ["document", "pending", "block"]) {
    let resolve; const h = harness({ readFile: () => new Promise((r) => { resolve = r; }) });
    const opening = h.workflow.open(project(demoDocument())); assert.equal(h.workflow.opening, true);
    await assert.rejects(h.workflow.open(project(demoDocument())), /redan/);
    if (change === "document") h.session.commit("During read", (d) => { d.name = "Keep change"; });
    else if (change === "pending") h.pending(true); else h.block(true);
    const accepted = structuredClone(h.session.document);
    resolve({ document: demoDocument(), imported: null }); await assert.rejects(opening, /ändrades/);
    assert.deepEqual(h.session.document, accepted); assert.equal(h.workflow.opening, false); assert.equal(h.labels.length, 0);
    h.block(false); h.pending(false); const retry = h.workflow.open(project(demoDocument())); resolve({ document: demoDocument(), imported: null });
    assert.ok(await retry); assert.equal(h.workflow.opening, false);
  }
});
test("failed import and invalid replacement preserve accepted document and redo", async () => {
  const h = harness(); h.session.commit("Name", (d) => { d.name = "Other"; }); h.session.undo();
  const original = structuredClone(h.session.document);
  await assert.rejects(h.workflow.open({ name: "broken.liracad", size: 10, text: async () => "{" }));
  assert.throws(() => h.workflow.replace({}, "Bad"), /Ogiltig/);
  assert.deepEqual(h.session.document, original); assert.equal(h.session.history.future.length, 1); assert.equal(h.workflow.opening, false);
});
test("DXF workflow uses import worker contract and reports deviations", async () => {
  const h = harness(); h.workflow.exportDXF(); const dxf = h.downloads[0].text;
  const bytes = new TextEncoder().encode(dxf); let terminated = false;
  const result = await h.workflow.open({ name: "Workflow.dxf", size: bytes.byteLength, arrayBuffer: async () => bytes.buffer }, {
    createWorker: () => ({ terminate: () => { terminated = true; }, postMessage({ buffer, name }) {
      this.onmessage({ data: { result: importDXF(decodeDXF(buffer), name) } });
    } }),
  });
  assert.equal(terminated, true); assert.ok(validDocument(h.session.document)); assert.ok(Array.isArray(result.imported.report));
  assert.equal(h.labels.at(-1), "Öppna projekt");
});
test("block sessions must finish before project save; export and replacement retain the draft", async () => {
  const h = harness(); h.block(true);
  assert.throws(() => h.workflow.exportDXF(), /blockredigeringen/);
  assert.throws(() => h.workflow.replace(demoDocument(), "Replace"), /blockeditorn/);
  await assert.rejects(h.workflow.open(project(demoDocument())), /blockeditorn/);
  assert.equal(h.downloads.length, 0); assert.equal(h.workflow.save(), true); assert.equal(h.downloads.length, 1);
});
