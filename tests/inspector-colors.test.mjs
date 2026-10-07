import test from "node:test";
import assert from "node:assert/strict";
import { createInspectorControls } from "../src/inspector-controls.js";
import { importDXF } from "../src/dxf-import.js";

class Element {
  children = [];
  attrs = {};
  style = {};
  append(...children) { this.children.push(...children); }
  setAttribute(key, value) { this.attrs[key] = value; }
  querySelector(tag) {
    for (const child of this.children) {
      if (child.tag === tag) return child;
      const nested = child.querySelector(tag);
      if (nested) return nested;
    }
    return null;
  }
  focus() { this.focused = true; }
}

function picker(value, layerColor = "#ffffff") {
  const changes = [];
  const document = { createElement: tag => Object.assign(new Element(), { tag }) };
  const { colorFields } = createInspectorControls({ document, onInvalid: assert.fail });
  const root = new Element();
  colorFields(root, value, layerColor, color => changes.push(color));
  const [row, custom] = root.children;
  const [trigger, menu] = row.children[1].children;
  return { custom, trigger, buttons: menu.children, changes };
}

const label = element => element.children[1].textContent;

test("every imported ACI color is recognized by the picker, including green and light gray", () => {
  const entities = Array.from({ length: 255 }, (_, i) =>
    `0\nLINE\n8\n0\n62\n${i + 1}\n10\n0\n20\n0\n11\n1\n21\n1\n`,
  ).join("");
  const { document } = importDXF(`0\nSECTION\n2\nENTITIES\n${entities}0\nENDSEC\n0\nEOF\n`);
  assert.equal(document.entities.length, 255);
  for (const entity of document.entities) {
    const { trigger, custom, buttons } = picker(entity.color.toUpperCase());
    assert.doesNotMatch(label(trigger), /Egen kulör/);
    assert.equal(custom.hidden, true);
    assert.equal(buttons.filter(button => button.attrs["aria-pressed"] === "true").length, 1);
  }
  assert.equal(label(picker(document.entities[2].color).trigger), "Grön (ACI 3)");
  assert.equal(label(picker(document.entities[8].color).trigger), "Ljusgrå (ACI 9)");
  assert.equal(label(picker(document.entities[29].color).trigger), "Orange (ACI 30)");
  // ACI 10 shares RGB with ACI 1; it has one unambiguous entry.
  assert.equal(label(picker(document.entities[9].color).trigger), "Röd (ACI 1)");
});

test("picker applies palette RGB values and retains layer, mixed and custom choices", () => {
  const colors = picker("#abcdef");
  assert.equal(label(colors.trigger), "Egen kulör…");
  assert.equal(colors.custom.hidden, false);
  colors.buttons.find(button => label(button) === "Grön (ACI 3)").onclick();
  colors.buttons.find(button => label(button) === "ACI 31").onclick();
  colors.buttons.find(button => label(button) === "Enligt lager").onclick();
  assert.deepEqual(colors.changes, ["#00ff00", "#ffbf7f", null]);
  const layer = picker(null, "#00ff00");
  assert.equal(label(layer.trigger), "Enligt lager");
  assert.equal(layer.trigger.children[0].style.background, "#00ff00");
  const mixed = picker("mixed");
  assert.equal(label(mixed.trigger), "Blandat");
  mixed.buttons[0].onclick();
  assert.deepEqual(mixed.changes, []);
  const standard = picker("#ff0000");
  standard.buttons.find(button => label(button) === "Egen kulör…").onclick();
  assert.equal(standard.custom.hidden, false);
  assert.equal(standard.custom.querySelector("input").focused, true);
});
