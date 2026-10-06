import test from "node:test";
import assert from "node:assert/strict";
import { usesIsoFont, displayFontFamily } from "../src/cad-fonts.js";
import { textLayout, applyTextProperty, mtextContent } from "../src/text.js";
import { toDXF } from "../src/dxf-export.js";
import { importDXF } from "../src/dxf-import.js";

test("ISO fallback preserves local TrueType priority and recognizes only known CAD families", () => {
  assert.equal(displayFontFamily({font:"isocpeur",sourceFont:"C:\\fonts\\ISOCPEUR.TTF"}, "isocpeur"), '"isocpeur", "LiraCAD ISO", "Arial Narrow", Arial, sans-serif');
  assert.equal(displayFontFamily({font:"Arial Narrow",sourceFont:"isocp.shx"}, "Arial Narrow"), '"LiraCAD ISO", "Arial Narrow", Arial, sans-serif');
  for (const sourceFont of ["simplex.shx","romans.shx","my-isometric.ttf","helv_mag"]) assert.equal(usesIsoFont({sourceFont}), false);
  assert.equal(usesIsoFont({font:"LiraCAD ISO"}), true);
});

test("explicit ISO choice exports the actual font name and renders as ISO on reimport", () => {
  const e={id:"font",type:"text",layer:"0",point:{x:0,y:0},height:5,text:"ÅÄÖ",font:"LiraCAD ISO"};
  const dxf=toDXF({entities:[e],layers:[{id:"0",name:"0",color:"#ffffff",lineType:"CONTINUOUS"}]});
  assert.match(dxf,/osifont\.ttf/);
  assert.doesNotMatch(dxf,/LiraCAD ISO/);
  const text=importDXF(dxf).document.entities.find(e=>e.type==="text");
  assert.equal(usesIsoFont(text),true);
  assert.equal(text.text,"ÅÄÖ");
});

test("inline TrueType font overrides an inherited SHX family without changing native font metadata", () => {
  const text = {type:"text",text:"AB",height:5,font:"Arial Narrow",sourceFont:"isocp.shx",textRuns:[{text:"A"},{text:"B",font:"Georgia"}]};
  const before = structuredClone(text), runs = textLayout(text).lines[0].runs;
  assert.equal(usesIsoFont(runs[0]), true);
  assert.equal(usesIsoFont(runs[1]), false);
  assert.equal(runs[1].sourceFont, "Georgia");
  assert.deepEqual(text, before);
  assert.doesNotMatch(mtextContent(text), /LiraCAD ISO/);
  assert.equal(usesIsoFont(applyTextProperty(text,"font","Georgia")), false);
});
