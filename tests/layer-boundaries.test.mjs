import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { sourceFiles } from "../scripts/source-files.mjs";

const root = new URL("../src/", import.meta.url);
const allowed = {
  model: ["model"],
  commands: ["commands"],
  tools: ["tools", "model", "commands"],
  editor: ["editor", "model", "commands", "tools"],
  rendering: ["rendering", "model", "commands"],
  io: ["io", "model"],
  storage: ["storage", "model"],
  examples: ["examples", "model"],
  ui: ["ui", "model", "editor", "commands", "rendering", "io", "examples"],
  workers: ["workers", "io", "rendering", "model", "vendor"],
  app: [
    "app",
    "model",
    "editor",
    "commands",
    "tools",
    "rendering",
    "io",
    "storage",
    "examples",
    "ui",
  ],
};
const layerOf = (file) => (file.includes("/") ? file.split("/")[0] : "app");

test("every owned source module has a recorded responsibility and only imports permitted layers", async () => {
  const files = (await sourceFiles(root)).filter((f) => f.endsWith(".js"));
  const inventory = JSON.parse(
    await readFile(
      new URL("../docs/module-responsibilities.json", import.meta.url),
      "utf8",
    ),
  );
  assert.deepEqual(Object.keys(inventory).sort(), files);
  const known = new Set(files),
    graph = new Map();
  for (const file of files) {
    assert.ok(inventory[file].responsibility.length > 10, file);
    assert.equal(inventory[file].layer, layerOf(file));
    const source = await readFile(new URL(file, root), "utf8");
    const imports = [
      ...source.matchAll(
        /(?:from\s*|import\s*\(?\s*)["'](\.\.?\/[^"']+\.js)["']/g,
      ),
    ].map((m) =>
      path.posix.normalize(path.posix.join(path.posix.dirname(file), m[1])),
    );
    for (const dependency of imports) {
      assert.ok(
        known.has(dependency) || dependency.startsWith("vendor/"),
        `${file}: missing ${dependency}`,
      );
      assert.ok(
        allowed[layerOf(file)].includes(layerOf(dependency)),
        `${file} cannot import ${dependency}`,
      );
      if (file !== "core.js") assert.notEqual(dependency, "core.js");
    }
    graph.set(
      file,
      imports.filter((f) => known.has(f)),
    );
    if (["model", "commands", "tools", "editor"].includes(layerOf(file)))
      assert.doesNotMatch(
        source,
        /\b(?:document|window)\.(?:querySelector|querySelectorAll|createElement|addEventListener|fonts)|\b(?:localStorage|indexedDB|OffscreenCanvas|FontFace|Worker)\b|\bfetch\s*\(/,
        file,
      );
  }
  const done = new Set(),
    active = new Set();
  function visit(file) {
    assert.ok(!active.has(file), `Dependency cycle at ${file}`);
    if (done.has(file)) return;
    active.add(file);
    graph.get(file).forEach(visit);
    active.delete(file);
    done.add(file);
  }
  files.forEach(visit);
});
