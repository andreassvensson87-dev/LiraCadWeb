import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import * as core from "../src/core.js";
import * as geometry from "../src/geometry.js";
import { validDocument } from "../src/document.js";
import { transform } from "../src/entity-transform.js";
import { definitions, aliases, transforms } from "../src/command-catalog.js";
import { drawingTools } from "../src/drawing-tools.js";
import { stretchTools } from "../src/stretch-tools.js";
import { wblockTools } from "../src/wblock-tools.js";
import { transformTools } from "../src/transform-tools.js";
import { editingTools } from "../src/editing-tools.js";
import { cornerTools } from "../src/corner-tools.js";
import { vertexTools } from "../src/vertex-tools.js";
import { structureTools } from "../src/structure-tools.js";
import { dimensionTools } from "../src/dimension-tools.js";
import { blockTools } from "../src/block-tools.js";
import { viewportTools } from "../src/viewport-tools.js";
import { annotationTools } from "../src/annotation-tools.js";
import { utilityTools } from "../src/utility-tools.js";

const root = new URL("../src/", import.meta.url);
test("all interactive catalog commands have one tool owner; block session entry is handled by the shell", () => {
  const owners = new Map();
  for (const tools of [drawingTools, stretchTools, wblockTools, transformTools, editingTools, cornerTools, vertexTools, structureTools, dimensionTools, blockTools, viewportTools, annotationTools, utilityTools]) {
    for (const [name, tool] of Object.entries(tools)) {
      assert.ok(!owners.has(name), `Duplicate owner for ${name}`);
      owners.set(name, tool);
      for (const method of ["create", "handle", "preview", "describe"]) assert.equal(typeof tool[method], "function", `${name}.${method}`);
    }
  }
  for (const [name] of definitions) if (name !== "BEDIT") assert.ok(owners.has(name), `Missing tool owner for ${name}`);
  for (const name of ["DIST", "PAN"]) assert.ok(owners.has(name));
});
async function modules() {
  const files = (await readdir(root)).filter((f) => f.endsWith(".js"));
  return new Map(await Promise.all(files.map(async (f) => [f, await readFile(new URL(f, root), "utf8")])));
}

test("internal modules import their owners and form an acyclic dependency graph", async () => {
  const sources = await modules();
  const graph = new Map();
  for (const [file, source] of sources) {
    const refs = [...source.matchAll(/(?:from\s*|import\s*)["']\.\/([^"']+\.js)["']/g)].map((m) => m[1]);
    for (const ref of refs) {
      assert.ok(sources.has(ref), `${file} imports missing ${ref}`);
      if (file !== "core.js") assert.notEqual(ref, "core.js", `${file} depends on compatibility facade`);
    }
    graph.set(file, refs);
  }
  const visited = new Set(), active = new Set();
  function visit(file, path = []) {
    assert.ok(!active.has(file), `Circular dependency: ${[...path, file].join(" -> ")}`);
    if (visited.has(file)) return;
    active.add(file);
    for (const dep of graph.get(file)) visit(dep, [...path, file]);
    active.delete(file);
    visited.add(file);
  }
  for (const file of graph.keys()) visit(file);
});

test("geometry has no app/model/format dependencies and facade preserves public exports", async () => {
  const source = await readFile(new URL("geometry.js", root), "utf8");
  assert.doesNotMatch(source, /\bimport\b|\bdocument\.|\bwindow\.|\blocalStorage\b/);
  for (const [name, value] of Object.entries(geometry)) assert.equal(core[name], value);
  assert.equal(core.validDocument, validDocument);
  assert.equal(core.transform, transform);
});

test("command catalog has unique names/aliases and covers registered transformations", () => {
  assert.equal(new Set(definitions.map(([name]) => name)).size, definitions.length);
  assert.equal(new Set(definitions.map(([, , alias]) => alias)).size, definitions.length);
  for (const [name, , alias] of definitions) {
    assert.equal(aliases[name], name);
    assert.equal(aliases[alias], name);
  }
  for (const name of transforms) assert.ok(definitions.some(([n]) => n === name));
});
