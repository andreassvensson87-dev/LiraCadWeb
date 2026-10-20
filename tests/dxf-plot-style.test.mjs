import test from "node:test";
import assert from "node:assert/strict";
import { toDXF } from "../src/io/dxf-export.js";
import { importDXF } from "../src/io/dxf-import.js";

function records(text) {
  const lines = text.trimEnd().split(/\r?\n/), result = [];
  for (let i = 0; i < lines.length; i += 2) {
    const pair = [Number(lines[i]), lines[i + 1]];
    if (pair[0] === 0) result.push([]);
    result.at(-1).push(pair);
  }
  return result;
}
const value = (record, code) => record.find(([c]) => c === code)?.[1];
const entries = (record) => new Map(record.flatMap(([code, name], i) => code === 3 ? [[name, record[i + 1][1]]] : []));

test("DXF layers reference the owned Normal plot style, including the default and nonplot layers", () => {
  const doc = { version: 1, name: "Plot style regression", layers: [{ id: "0", name: "0", color: "#ffffff", lineType: "CONTINUOUS" }], entities: [
    { id: "line", type: "line", layer: "0", points: [{ x: 1, y: 2 }, { x: 3, y: 4 }] },
  ] };
  doc.layers.push({ id: "nonplot", name: "Nonplot", color: "#ffffff", lineType: "CONTINUOUS", plot: false, locked: true });
  const before = structuredClone(doc), text = toDXF(doc), all = records(text);
  const objects = new Map(all.filter((r) => value(r, 5)).map((r) => [value(r, 5), r]));
  assert.equal(objects.size, all.filter((r) => value(r, 5)).length, "Handles must be unique");
  const root = all.find((r) => value(r, 0) === "DICTIONARY" && value(r, 330) === "0");
  const dictionary = objects.get(entries(root).get("ACAD_PLOTSTYLENAME"));
  assert.equal(value(dictionary, 0), "ACDBDICTIONARYWDFLT");
  assert.equal(value(dictionary, 330), value(root, 5));
  const normal = objects.get(entries(dictionary).get("Normal"));
  assert.equal(value(normal, 0), "ACDBPLACEHOLDER");
  assert.equal(value(normal, 330), value(dictionary, 5));
  assert.equal(value(dictionary, 340), value(normal, 5));
  const layers = all.filter((r) => value(r, 0) === "LAYER");
  assert.equal(layers.length, doc.layers.length);
  for (const layer of layers) assert.equal(value(layer, 390), value(normal, 5), `Missing PlotStyleName on ${value(layer, 2)}`);
  for (const name of ["ACDBDICTIONARYWDFLT", "ACDBPLACEHOLDER"]) {
    assert.equal(all.filter((r) => value(r, 0) === "CLASS" && value(r, 1) === name).length, 1);
  }
  assert.equal(value(layers.at(-1), 290), "0");
  assert.equal(value(layers.at(-1), 70), "4");
  assert.deepEqual(doc, before);
  const roundtrip = importDXF(text).document;
  assert.equal(roundtrip.entities.length, doc.entities.length);
  assert.equal(roundtrip.layers.find((l) => l.name === "Nonplot").plot, false);
});
