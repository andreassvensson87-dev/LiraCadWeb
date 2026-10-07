import test from "node:test";
import assert from "node:assert/strict";
import { steelProfiles, profileSection, profileTemplate } from "../src/steel-profiles.js";
import { catalogAnchor, catalogInstance } from "../src/catalog-placement.js";
import { filterCatalog, catalogPreview } from "../src/detail-catalog.js";
import { bounds, pointsOf } from "../src/entity-geometry.js";
import { polylineParts } from "../src/polyline.js";
import { validDocument } from "../src/document.js";
import { Editor } from "../src/editor.js";
import { blockTools } from "../src/block-tools.js";
import { blockTemplates, createBlock } from "../src/blocks.js";
import { DocumentSession } from "../src/document-session.js";
import { applyEditingChange } from "../src/editing-tools.js";
import { toDXF } from "../src/dxf-export.js";
import { importDXF } from "../src/dxf-import.js";

const profile = name => steelProfiles.find(p => p.name === name);
const layers = [{ id: "0", name: "Steel", color: "#ffffff" }];
const close = (a, b, epsilon = 1e-7) => assert.ok(Math.abs(a - b) < epsilon, `${a} ≠ ${b}`);

test("all 121 sourced sections have nominal bounds, closed valid contours and circular fillets", () => {
  assert.equal(steelProfiles.length, 121);
  assert.equal(new Set(steelProfiles.map(p => p.id)).size, 121);
  for (const p of steelProfiles) {
    const template = profileTemplate(p, "0"), section = template.definition.entities[0];
    assert.ok(validDocument({ version: 1, layers, entities: [{ ...template, id: "test", layer: "0" }] }), p.name);
    assert.ok(section.closed);
    const b = bounds(section);
    close(b.maxX - b.minX, p.b);
    close(b.maxY - b.minY, p.h);
    const arcs = polylineParts(section).filter(e => e.type === "arc");
    assert.equal(arcs.length, 4, p.name);
    for (const arc of arcs) assert.ok([p.r, p.tip].some(r => Math.abs(r - arc.radius) < 1e-7), p.name);
    // Sample the exact contour and check for crossing edges, including tip fillets.
    const vertices = polylineParts(section).flatMap(e => pointsOf(e).slice(0, -1));
    const orient = (a, b, c) => (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
    for (let i = 0; i < vertices.length; i++) for (let j = i + 2; j < vertices.length; j++) {
      if (i === 0 && j === vertices.length - 1) continue;
      const a = vertices[i], b = vertices[(i+1)%vertices.length], c = vertices[j], d = vertices[(j+1)%vertices.length];
      assert.ok(!(orient(a,b,c)*orient(a,b,d) < -1e-8 && orient(c,d,a)*orient(c,d,b) < -1e-8), `${p.name}: crossing contour`);
    }
  }
  assert.equal(profile("HEA 200").h, 190); // The designation is not the actual height.
  const section = profileSection(profile("IPE 200"));
  let area = 0;
  for (const e of polylineParts({ type: "polyline", ...section })) {
    const pts = pointsOf(e), a = pts[0], b = pts.at(-1);
    area += (a.x * b.y - b.x * a.y) / 2;
    if (e.type === "arc") area += e.radius ** 2 * (e.sweep - Math.sin(e.sweep)) / 2;
  }
  close(area, 2848, 1); // Tibnor nominal area for IPE 200, mm².
});

test("UNP tapers follow their size-dependent slope and UPE remains parallel", () => {
  for (const name of ["UNP 200", "UNP 320", "UPE 200"]) {
    const p = profile(name), parts = polylineParts({ type: "polyline", ...profileSection(p) });
    const faces = parts.filter(e => e.type === "line" && e.points[0].x !== e.points[1].x && Math.abs(e.points[0].y) < p.h / 2 && Math.abs(e.points[1].y) < p.h / 2);
    assert.equal(faces.length, 2);
    const expected = p.family === "UPE" ? 0 : p.h <= 300 ? .08 : .05;
    for (const e of faces) close(Math.abs((e.points[1].y-e.points[0].y)/(e.points[1].x-e.points[0].x)), expected);
  }
});

test("catalog search spans families and favorite filtering uses scoped keys", () => {
  const items = steelProfiles.map(p => ({ ...p, key: p.id }));
  assert.deepEqual(filterCatalog(items, { family: "HEA", query: " ipe 200 " }).map(p => p.name), ["IPE 200"]);
  assert.equal(filterCatalog(items, { family: "HEA" }).length, 24);
  const favorites = new Set([profile("IPE 200").id]);
  assert.deepEqual(filterCatalog(items, { favoritesOnly: true, favorites }).map(p => p.name), ["IPE 200"]);
  assert.equal(filterCatalog(items, { query: "nonexistent" }).length, 0);
});

test("rotated insertion anchors coincide with the clicked model point at scale 1", () => {
  const template = profileTemplate(profile("IPE 200"), "0");
  for (const anchor of ["center", "base", "bottom-left", "bottom-right", "top-left", "top-right"]) {
    const local = catalogAnchor(template, anchor), rotation = Math.PI / 2;
    const instance = catalogInstance(template, { x: 123, y: 456 }, { layer: "0", space: "model" }, { anchor, rotation });
    close(instance.point.x + local.x*Math.cos(rotation) - local.y*Math.sin(rotation), 123);
    close(instance.point.y + local.x*Math.sin(rotation) + local.y*Math.cos(rotation), 456);
    assert.equal(instance.scale, 1);
  }
  const svg = catalogPreview(template, Math.PI / 2);
  assert.match(svg, /<svg/);
  assert.doesNotMatch(svg, /NaN|Infinity/);
});

function harness() {
  const session = new DocumentSession({ version: 1, name: "Catalog", layers, entities: [] });
  let reason = "", fail = false;
  const messages = [];
  const creation = { layer: "0", space: "model", color: "#ff0000", lineType: "BYLAYER" };
  const editor = new Editor({ tools: blockTools,
    getContext: () => ({ creation, templates: blockTemplates(session.document), catalogPlacementReason: reason }),
    notify: message => messages.push(message),
    applyChange: change => {
      if (fail) throw Error("failed commit");
      session.commit(change.label, draft => {
        draft.entities = applyEditingChange(draft.entities, change);
        if (change.definitions) draft.blocks = [...(draft.blocks || []), ...change.definitions];
      });
    },
  });
  const start = (template = profileTemplate(profile("IPE 200"), "0"), standard = true) => {
    editor.start("INSERT");
    editor.dispatch({ type: "catalog", template, label: "IPE 200", standard, rotation: Math.PI / 2, anchor: "bottom-left" });
  };
  return { session, editor, start, messages, creation, reason: value => reason = value, fail: value => fail = value };
}

test("catalog preview/cancellation leave the document intact, and placement with definition is one undo step", () => {
  const h = harness(), original = structuredClone(h.session.document);
  h.start();
  assert.equal(h.editor.state.phase, "points");
  assert.match(h.editor.describe().prompt, /IPE 200/);
  assert.equal(h.editor.preview({ x: 20, y: 30 })[0].color, "#ff0000");
  h.editor.cancel();
  assert.deepEqual(h.session.document, original);
  h.start(); const state = h.editor.state;
  h.fail(true);
  assert.throws(() => h.editor.dispatch({ type: "point", point: { x: 20, y: 30 } }), /failed commit/);
  assert.equal(h.editor.state, state);
  assert.deepEqual(h.session.document, original);
  h.fail(false);
  h.editor.dispatch({ type: "point", point: { x: 20, y: 30 } });
  assert.equal(h.session.document.blocks.length, 1);
  assert.equal(h.session.history.past.length, 1);
  assert.ok(validDocument(h.session.document));
  h.session.undo(); assert.deepEqual(h.session.document, original);
  h.session.redo();
  h.start(); h.editor.dispatch({ type: "point", point: { x: 40, y: 30 } });
  assert.equal(h.session.document.blocks.length, 1);
  assert.equal(h.session.document.entities.length, 2);
  const imported = importDXF(toDXF(h.session.document)).document;
  assert.ok(validDocument(imported));
  assert.ok(imported.entities.some(e => e.type === "block"));
});

test("placement rechecks editable model context and own detail identity, and resolves current geometry", () => {
  const h = harness(); h.start(); h.reason("Välj ett synligt, olåst lager först.");
  assert.deepEqual(h.editor.preview({ x: 0, y: 0 }), []);
  h.editor.dispatch({ type: "point", point: { x: 0, y: 0 } });
  assert.equal(h.session.document.entities.length, 0);
  assert.match(h.messages.at(-1), /olåst/);
  h.reason("");
  const own = createBlock([{ id: "line", type: "line", layer: "0", points: [{ x: 0, y: 0 }, { x: 10, y: 10 }] }], "Own", { x: 0, y: 0 }, "0");
  h.session.commit("Own", d => { d.blocks = [own.definition]; });
  h.start(own, false);
  h.session.commit("Edit definition", d => { d.blocks[0].entities[0].points[1].x = 100; });
  assert.equal(h.editor.preview({ x: 0, y: 0 })[0].definition.entities[0].points[1].x, 100);
  h.session.commit("Remove definition", d => { d.blocks = []; });
  assert.deepEqual(h.editor.preview({ x: 0, y: 0 }), []);
  h.editor.dispatch({ type: "point", point: { x: 0, y: 0 } });
  assert.match(h.messages.at(-1), /inte längre/);
});
