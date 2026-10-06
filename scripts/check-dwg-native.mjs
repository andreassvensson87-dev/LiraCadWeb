// Optional integration check: .NET 10 + the two public, unmodified DWG fixtures.
// Fixtures are downloaded separately and are not redistributed with the app.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { importDXF } from '../src/dxf-import.js';
import { toDXF } from '../src/dxf-export.js';
import { validDocument } from '../src/document.js';
import { annotationView } from '../src/annotation-edit.js';
await import('./prepare-dwg-source.mjs');
const fixtures = [
  { name: 'architectural_-_annotation_scaling_and_multileaders.dwg', hash: 'ddaca4e6e14a71a1af86a7f5f711ad51baf95aaaf807c39819d685cde0846d5d', text: 0, mtext: 5, count: 1407, variants: 5, dimensions: 28 },
  { name: 'acad-annotatn-end.dwg', hash: 'c4a5e4009053f1a250868e7028cddccd3a13b897bb8a8be82bb4ce864408d178', text: 23, mtext: 252, count: 251, variants: 27, dimensions: 10 },
];
const directory = path.resolve(process.argv[2] || 'artifacts/dwg-audit/native');
const output = path.resolve('artifacts/dwg-native-check');
await mkdir(output, { recursive: true });
function records(text) {
  const lines = text.trimEnd().split(/\r?\n/), result = [];
  for (let i = 0; i < lines.length; i += 2) {
    const code = Number(lines[i]), value = lines[i + 1];
    if (code === 0) result.push([]);
    if (result.length) result.at(-1).push([code, value]);
  }
  return result;
}
const get = (record, code) => record.find(p => p[0] === code)?.[1];
for (const fixture of fixtures) {
  const input = path.join(directory, fixture.name), dxf = path.join(output, fixture.name + '.dxf');
  assert.equal(createHash('sha256').update(await readFile(input)).digest('hex'), fixture.hash, 'Fixture changed');
  execFileSync(process.env.DOTNET || 'dotnet', ['run', '--project', 'tools/DwgFixtureProbe', '-c', 'Release', '--', input, dxf], { stdio: 'inherit' });
  const text = await readFile(dxf, 'utf8'), objects = records(text);
  const textContexts = objects.filter(r => get(r, 0) === 'ACDB_TEXTOBJECTCONTEXTDATA_CLASS');
  const mtextContexts = objects.filter(r => get(r, 0) === 'ACDB_MTEXTOBJECTCONTEXTDATA_CLASS');
  assert.equal(textContexts.length, fixture.text); assert.equal(mtextContexts.length, fixture.mtext);
  const messages = JSON.parse(await readFile(dxf + '.messages.json', 'utf8'));
  assert(!messages.some(m => /(?:Unlisted|not implemented).*?(?:TEXT|MTEXT)OBJECTCONTEXT/.test(m)));
  const doc = importDXF(text).document;
  assert(validDocument(doc)); assert.equal(doc.entities.length, fixture.count);
  const annotated = doc.entities.filter(e => e.type==='text' && e.annotationVariants);
  assert.equal(annotated.length, fixture.variants);
  for (const entity of annotated) for (const variant of entity.annotationVariants) {
    const view = annotationView(entity, { annotationScale: variant.denominator });
    assert.deepEqual(view.point, variant.entity.point); assert.equal(view.height, variant.entity.height);
  }
  const roundtrip = importDXF(toDXF(doc)).document;
  assert(validDocument(roundtrip));
  assert.deepEqual(roundtrip.entities.filter(e => e.type==='text' && e.annotationVariants).map(e => e.annotationVariants.map(v => [v.denominator, v.entity.point, v.entity.height])), annotated.map(e => e.annotationVariants.map(v => [v.denominator, v.entity.point, v.entity.height])));
  const dimensions=doc.entities.filter(e=>e.type==='dimension' && e.annotationVariants);
  assert.equal(dimensions.length,fixture.dimensions);
  assert.equal(objects.filter(r=>get(r,0)==='ACDB_ALDIMOBJECTCONTEXTDATA_CLASS').length,fixture.dimensions);
  assert(!messages.some(m=>/Unlisted.*ALDIMOBJECTCONTEXTDATA/.test(m)));
  assert(dimensions.every(e=>e.annotationVariants.every(v=>v.entity.dimensionGraphics?.length)));
  assert.equal(roundtrip.entities.filter(e=>e.type==='dimension'&&e.annotationVariants).length,fixture.dimensions);
  if (fixture.text) {
    const leaf = textContexts.find(r => get(r, 5) === '15AEA');
    const subclass = leaf.slice(leaf.findIndex(p => p[1] === 'AcDbTextObjectContextData') + 1);
    assert.equal(Number(get(subclass, 70)), 1);
    assert.equal(Number(get(subclass, 11)), 83.56524018660558);
    const centered = annotated.find(e => e.text === 'SECTION B-B');
    assert.equal(centered.annotationVariants[0].entity.textAlign, 'center');
    assert.equal(centered.annotationVariants[0].entity.point.x, Number(get(subclass, 11)));
    const column = mtextContexts.find(r => get(r, 5) === '1250B');
    assert.equal(Number(get(column, 71)), 2); assert.equal(Number(get(column, 72)), 1);
    assert.equal(Number(get(column, 46)), -0.0712923076923077);
  }
  console.log(`${fixture.name}: ${fixture.text} TEXT + ${fixture.mtext} MTEXT contexts; ${fixture.variants} editable text objects; round trip OK`);
}
