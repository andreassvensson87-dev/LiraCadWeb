import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

test('installation manifest bypasses old cache online and falls back offline', async () => {
  const scope = 'https://example.org/LiraCadWeb/';
  const handlers = {};
  const fresh = { ok: true, id: scope };
  const cached = { id: 'old' };
  let offline = false;
  let statusOk = true;
  const source = readFileSync(new URL('../dist/sw.js', import.meta.url), 'utf8');
  vm.runInNewContext(source, {
    URL,
    Response,
    self: {
      registration: { scope },
      addEventListener: (name, fn) => { handlers[name] = fn; },
    },
    caches: { open: async () => ({ match: async url => {
      assert.equal(url, scope + 'manifest.webmanifest');
      return cached;
    } }) },
    fetch: async (request, options) => {
      assert.equal(options.cache, 'no-store');
      if (offline) throw Error('Offline');
      return statusOk ? fresh : { ok: false };
    },
  });
  async function getManifest(suffix) {
    let result;
    handlers.fetch({ request: { method: 'GET', url: scope + 'manifest.webmanifest' + suffix },
      respondWith: promise => { result = promise; } });
    return result;
  }
  assert.equal(await getManifest(''), fresh);
  assert.equal(await getManifest('?v=identity-2'), fresh);
  offline = true;
  assert.equal(await getManifest('?v=identity-2'), cached);
  offline = false;
  statusOk = false;
  assert.equal(await getManifest(''), cached);
});
