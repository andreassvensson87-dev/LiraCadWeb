import test from "node:test";
import assert from "node:assert/strict";
import { ProjectStorage } from "../src/project-storage.js";
import { readDrawingFile } from "../src/file-import.js";
import { History } from "../src/history.js";
import { demoDocument, validDocument } from "../src/core.js";

const file = (name = "example.dwg") => ({
  name,
  size: 6,
  arrayBuffer: async () => new ArrayBuffer(6),
});
function workerFixture(action) {
  let terminated = 0,
    url;
  const worker = {
    terminate() {
      terminated++;
    },
    postMessage() {
      action(worker);
    },
  };
  return {
    worker,
    factory(value) {
      url = value;
      return worker;
    },
    get terminated() {
      return terminated;
    },
    get url() {
      return url;
    },
  };
}
test("import routes DWG, reports progress, validates results and terminates worker", async () => {
  const progress = [];
  const fixture = workerFixture((w) => {
    w.onmessage({ data: { progress: "Reading" } });
    w.onmessage({
      data: { result: { document: demoDocument(), report: [], count: 1 } },
    });
  });
  const result = await readDrawingFile(file(), {
    createWorker: fixture.factory,
    onProgress: (m) => progress.push(m),
  });
  assert.ok(validDocument(result.document));
  assert.ok(fixture.url.pathname.endsWith("/dwg-import-worker.js"));
  assert.equal(fixture.terminated, 1);
  assert.ok(progress.includes("Reading"));
});
test("failed, timed-out and unpostable imports always terminate workers", async () => {
  for (const action of [
    (w) => w.onerror(),
    (w) => w.onmessageerror(),
    () => {
      throw Error("Transfer failed");
    },
    (w) => w.onmessage({ data: { error: "Invalid DWG" } }),
    () => {},
  ]) {
    const fixture = workerFixture(action);
    await assert.rejects(
      readDrawingFile(file(), { createWorker: fixture.factory, timeout: 5 }),
    );
    assert.equal(fixture.terminated, 1);
  }
});
test("invalid imported document is rejected and project files need no worker", async () => {
  const fixture = workerFixture((w) =>
    w.onmessage({ data: { result: { document: {}, report: [] } } }),
  );
  await assert.rejects(
    readDrawingFile(file("test.dxf"), { createWorker: fixture.factory }),
    /Ogiltig/,
  );
  assert.ok(fixture.url.pathname.endsWith("/dxf-import-worker.js"));
  const result = await readDrawingFile(
    {
      name: "a.liracad",
      size: 1,
      text: async () => JSON.stringify(demoDocument()),
    },
    {
      createWorker: () => {
        throw Error("unexpected worker");
      },
    },
  );
  assert.ok(validDocument(result.document));
  assert.equal(result.imported, null);
  await assert.rejects(
    readDrawingFile({ name: "huge.dwg", size: 50e6 + 1 }),
    /stor/,
  );
});
test("storage distinguishes missing, corrupt and inaccessible drafts", () => {
  let raw = null;
  const storage = new ProjectStorage(() => ({ getItem: () => raw }));
  assert.deepEqual(storage.restore(validDocument), {
    document: null,
    error: false,
  });
  raw = "bad json";
  assert.equal(storage.restore(validDocument).error, true);
  raw = "{}";
  assert.equal(storage.restore(validDocument).error, true);
  raw = JSON.stringify(demoDocument());
  assert.ok(storage.restore(validDocument).document);
  assert.equal(
    new ProjectStorage(() => {
      throw Error("Denied");
    }).restore(validDocument).error,
    true,
  );
});
test("immediate save cancels a pending block draft and debounce saves latest document", async () => {
  const writes = [];
  const storage = new ProjectStorage(
    () => ({ setItem: (key, value) => writes.push(JSON.parse(value)) }),
    { delay: 5 },
  );
  storage.schedule(
    () => ({ name: "block draft" }),
    () => assert.fail("cancelled callback"),
  );
  storage.save({ name: "main document" });
  await new Promise((r) => setTimeout(r, 15));
  assert.deepEqual(writes, [{ name: "main document" }]);
  let current = { name: "earlier" };
  const done = new Promise((resolve) =>
    storage.schedule(() => current, resolve),
  );
  current = { name: "latest" };
  assert.equal(await done, null);
  assert.deepEqual(writes.at(-1), current);
});
test("storage reports quota failure to the caller", async () => {
  const storage = new ProjectStorage(
    () => ({
      setItem: () => {
        throw Error("Quota");
      },
    }),
    { delay: 0 },
  );
  const error = await new Promise((resolve) =>
    storage.schedule(() => ({}), resolve),
  );
  assert.equal(error.message, "Quota");
  assert.throws(() => storage.save({}), /Quota/);
});
test("history snapshots are isolated and a new edit discards redo", () => {
  const history = new History();
  const before = { entities: [] },
    after = { entities: [{ id: "a" }] };
  assert.equal(history.commit(before, before, "noop"), false);
  history.commit(before, after, "add");
  after.entities[0].id = "mutated";
  assert.deepEqual(history.undo(), before);
  const restored = history.redo();
  assert.equal(restored.entities[0].id, "a");
  restored.entities[0].id = "also mutated";
  history.undo();
  history.commit(before, { entities: [{ id: "b" }] }, "branch");
  assert.equal(history.redo(), null);
});
