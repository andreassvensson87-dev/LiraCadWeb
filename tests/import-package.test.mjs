import test from 'node:test';
import assert from 'node:assert/strict';
import { createImportPackage } from '../src/import-package.js';
import { readDrawingFile } from '../src/file-import.js';

async function entries(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer()), view = new DataView(bytes.buffer);
  const result = new Map();
  let offset = 0;
  while (view.getUint32(offset, true) === 0x04034b50) {
    const size = view.getUint32(offset + 18, true), length = view.getUint16(offset + 26, true);
    const name = new TextDecoder().decode(bytes.subarray(offset + 30, offset + 30 + length));
    const start = offset + 30 + length;
    result.set(name, bytes.slice(start, start + size)); offset = start + size;
  }
  assert.equal(view.getUint32(offset, true), 0x02014b50);
  assert.equal(view.getUint32(bytes.length - 22, true), 0x06054b50);
  return result;
}
const original = new Uint8Array([0, 255, 13, 10, 42]);
const session = {
  file: { name: 'Plan våning.dwg', arrayBuffer: async () => original.buffer },
  count: 0, issues: [], events: [{ level: 'error', message: 'DWG failed' }],
  startedAt: '2026-10-07T10:00:00Z', appVersion: '0.1.0', error: { message: 'DWG failed', stack: 'trace' },
};
test('failed import package preserves original bytes and diagnostics with UTF-8 names', async () => {
  const files = await entries(await createImportPackage(session));
  assert.deepEqual(files.get('original/Plan våning.dwg'), original);
  const log = JSON.parse(new TextDecoder().decode(files.get('importlogg.json')));
  assert.equal(log.error.stack, 'trace'); assert.equal(log.originalIncluded, true);
  assert.ok(new TextDecoder().decode(files.get('sammanfattning.txt')).includes('DWG failed'));
});
test('opting out does not read or include the original drawing', async () => {
  const files = await entries(await createImportPackage({ ...session, file: { name: 'private.dwg', arrayBuffer() { throw Error('must not read'); } } }, false));
  assert.equal(files.size, 2);
  assert.equal(JSON.parse(new TextDecoder().decode(files.get('importlogg.json'))).originalIncluded, false);
});
test('worker diagnostics are delivered before a failed import terminates', async () => {
  const received = []; let terminated = false;
  await assert.rejects(readDrawingFile({ name: 'broken.dwg', size: 6, arrayBuffer: async () => new ArrayBuffer(6) }, {
    onDiagnostic: event => received.push(event),
    createWorker: () => ({ terminate() { terminated = true; }, postMessage() {
      this.onmessage({ data: { diagnostic: { level: 'warn', message: 'unsupported entity' } } });
      this.onmessage({ data: { error: 'Invalid DWG' } });
    } }),
  }), /Invalid DWG/);
  assert.equal(received[0].message, 'unsupported entity'); assert.equal(terminated, true);
});
