import test from "node:test";
import assert from "node:assert/strict";
import { mtextContent, textChunks } from "../src/text.js";
import { bounds, toDXF, demoDocument, hitDistance } from "../src/core.js";
test("multiline bounds and hit testing include lower lines", () => {
  const e = {
    type: "text",
    point: { x: 0, y: 0 },
    text: "Top\nBottom",
    height: 100,
    rotation: 0,
  };
  assert.equal(bounds(e).minY, -140);
  assert.equal(hitDistance(e, { x: 50, y: -100 }), 0);
});
test("MTEXT escapes literal codes, braces, Unicode and paragraph breaks", () => {
  const s = mtextContent({
    text: "A{B}\\P\nÅ",
    bold: true,
    italic: true,
    underline: true,
  });
  assert.ok(s.includes("b1|i1;"));
  assert.ok(s.includes("A\\{B\\}\\\\P\\PÅ"));
  assert.ok(s.includes("\\L"));
});
test("long MTEXT strings split into DXF 3 and final 1 groups without loss", () => {
  const s = "x".repeat(751),
    chunks = textChunks(s);
  assert.deepEqual(
    chunks.map((x) => x[0]),
    [3, 3, 3, 1],
  );
  assert.equal(chunks.map((x) => x[1]).join(""), s);
});
test("plain single line remains TEXT; rich/multiline exports MTEXT", () => {
  const d = demoDocument();
  d.entities = [
    {
      id: "t",
      layer: d.layers[0].id,
      type: "text",
      point: { x: 0, y: 0 },
      height: 100,
      rotation: Math.PI / 2,
      text: "One\nTwo",
      bold: true,
    },
  ];
  const s = toDXF(d);
  assert.ok(s.includes("0\nMTEXT\n"));
  assert.ok(s.includes("AcDbMText"));
  assert.ok(s.includes("One\\PTwo"));
  d.entities[0].text = "One";
  delete d.entities[0].bold;
  assert.ok(toDXF(d).includes("0\nTEXT\n"));
});
