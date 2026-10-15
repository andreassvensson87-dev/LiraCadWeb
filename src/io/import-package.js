// ZIP with stored entries: preserves the original bytes without dependencies.
const encoder = new TextEncoder();
const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  for (let i = 0; i < 8; i++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  return value >>> 0;
});
export function zipFiles(files) {
  const parts = [], directory = [];
  let offset = 0, directorySize = 0;
  for (const file of files) {
    const name = encoder.encode(file.name);
    const bytes = typeof file.data === 'string' ? encoder.encode(file.data) : new Uint8Array(file.data);
    let crc = 0xffffffff;
    for (const byte of bytes) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 255];
    crc = (crc ^ 0xffffffff) >>> 0;
    const local = new Uint8Array(30 + name.length), l = new DataView(local.buffer);
    l.setUint32(0, 0x04034b50, true); l.setUint16(4, 20, true); l.setUint16(6, 0x800, true);
    l.setUint16(12, 33, true); // DOS date: 1980-01-01
    l.setUint32(14, crc, true); l.setUint32(18, bytes.length, true); l.setUint32(22, bytes.length, true);
    l.setUint16(26, name.length, true); local.set(name, 30);
    const central = new Uint8Array(46 + name.length), c = new DataView(central.buffer);
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true);
    c.setUint16(8, 0x800, true); c.setUint16(14, 33, true); c.setUint32(16, crc, true);
    c.setUint32(20, bytes.length, true); c.setUint32(24, bytes.length, true);
    c.setUint16(28, name.length, true); c.setUint32(42, offset, true); central.set(name, 46);
    parts.push(local, bytes); directory.push(central);
    offset += local.length + bytes.length; directorySize += central.length;
  }
  const end = new Uint8Array(22), e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
  e.setUint32(12, directorySize, true); e.setUint32(16, offset, true);
  return new Blob([...parts, ...directory, end], { type: 'application/zip' });
}

export async function createImportPackage(session, includeOriginal = true) {
  const { file, ...diagnostics } = session;
  const report = { ...diagnostics, originalIncluded: includeOriginal };
  const summary = [
    'LiraCAD — importrapport', file.name, session.error ? `Misslyckad import: ${session.error.message}` : `${session.count} objekt inlästa`,
    `Tidpunkt: ${session.startedAt}`, `Programversion: ${session.appVersion}`, '',
    ...session.issues.map(item => `${item.message} (${item.count})`), '',
    'Loggen innehåller meddelanden som importören har tillhandahållit. DWG-läsaren begränsar rapporten till 200 unika meddelanden.',
    'Externa referenser och typsnitt är inte inbäddade i paketet.',
  ].join('\n');
  const files = [{ name: 'importlogg.json', data: JSON.stringify(report, null, 2) }, { name: 'sammanfattning.txt', data: summary }];
  if (includeOriginal) files.push({ name: 'original/' + file.name.replaceAll(/[\\/]/g, '_'), data: await file.arrayBuffer() });
  return zipFiles(files);
}
