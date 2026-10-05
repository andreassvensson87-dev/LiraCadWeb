import test from "node:test";
import assert from "node:assert/strict";
import { stressDocument } from "../src/stress-document.js";
import { validDocument, MAX_DOCUMENT_ENTITIES } from "../src/document.js";
import { drawingBounds } from "../src/entity-geometry.js";
import { createSettingsPanel } from "../src/settings-panel.js";
import { DocumentSession } from "../src/document-session.js";

for (const count of [1000, 10000, 100000]) test(`stress generator produces ${count} valid objects and finite extents`, async () => {
  let yields = 0, progress = [];
  const doc = await stressDocument(count, { yieldControl: async () => { yields++; }, onProgress: (done) => progress.push(done) });
  assert.equal(doc.entities.length, count); assert.ok(validDocument(doc));
  assert.equal(new Set(doc.entities.map((e) => e.id)).size, count);
  assert.deepEqual(new Set(doc.entities.map((e) => e.type)), new Set(["line", "circle", "arc", "polyline", "text"]));
  assert.equal(progress.at(-1), count); assert.equal(yields, Math.ceil(count / 2000));
  assert.ok(Object.values(drawingBounds(doc.entities)).every(Number.isFinite));
  if (count === 100000) {
    doc.entities.push({id:'new-line',type:'line',layer:doc.layers[0].id,points:[{x:0,y:0},{x:1000,y:0}]});
    assert.ok(validDocument(doc),'largest stress drawing must allow adding objects');
    assert.equal(validDocument({...doc,entities:new Array(MAX_DOCUMENT_ENTITIES+1)}),false);
  }
});
test("line-only generation and input validation", async () => {
  const doc = await stressDocument(1000, { pattern: "lines", yieldControl: async () => {} });
  assert.ok(doc.entities.every((e) => e.type === "line"));
  for (const count of [0, -1, 1.5, 100001, NaN, "1000"]) await assert.rejects(stressDocument(count));
  await assert.rejects(stressDocument(1000, { pattern: "unknown" }));
});
test("settings generation replaces one document and undo restores the previous drawing", async () => {
  class Element {
    value = ""; textContent = ""; disabled = false; open = false; handlers = {};
    showModal() { this.open = true; } close() { this.open = false; }
    addEventListener(name, handler) { this.handlers[name] = handler; }
  }
  const elements = Object.fromEntries(["settings-dialog", "generation-status", "generate-example", "generate-stress", "stress-count", "stress-pattern", "close-settings", "settings-navigation", "settings-button"].map((id) => [id, new Element()]));
  elements["stress-count"].value = "1000"; elements["stress-pattern"].value = "lines";
  const initial = { version: 1, name: "Original", layers: [{ id: "0", name: "0", color: "#ffffff" }], entities: [] };
  const session = new DocumentSession(initial); let navigation = "trackpad", allowed = true, accepted = true;
  createSettingsPanel({ document: { querySelector: (s) => elements[s.slice(1)] }, getNavigation: () => navigation,
    setNavigation: (value) => { navigation = value; }, getDocument: () => session.document, canGenerate: () => allowed,
    replaceDocument: (doc, label) => accepted && session.commit(label, () => doc), log() {},
  });
  elements["settings-button"].onclick(); assert.equal(elements["settings-dialog"].open, true);
  elements["settings-navigation"].value = "mouse"; elements["settings-navigation"].onchange(); assert.equal(navigation, "mouse");
  await elements["generate-stress"].onclick(); assert.equal(session.document.entities.length, 1000);
  assert.equal(elements["settings-dialog"].open, false); assert.equal(session.history.past.length, 1);
  session.undo(); assert.deepEqual(session.document, initial);
  allowed = false; elements["settings-button"].onclick(); await elements["generate-example"].onclick(); assert.deepEqual(session.document, initial);
  allowed = true; accepted = false; await elements["generate-example"].onclick(); assert.equal(elements["settings-dialog"].open, true);
  assert.match(elements["generation-status"].textContent, /textredigeringen/); assert.equal(elements["generate-example"].disabled, false);
  accepted = true; await elements["generate-example"].onclick(); assert.ok(session.document.entities.length > 0);
});
