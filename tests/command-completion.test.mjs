import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { commandSuggestions, createCommandCompletion } from '../src/command-completion.js';
import { commandSubmitKey } from '../src/navigation.js';

const source = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
const keyHandler = source.slice(source.indexOf('input.addEventListener("keydown",'), source.indexOf('document.addEventListener("keydown",'));
function fixture() {
  const element = () => ({
    value: '', hidden: true, children: [], attrs: {}, handlers: {},
    classList: { toggle() {} },
    setAttribute(key, value) { this.attrs[key] = value; },
    removeAttribute(key) { delete this.attrs[key]; },
    append(...items) { this.children.push(...items); },
    replaceChildren(...items) { this.children = items; },
    addEventListener(key, fn) { this.handlers[key] = fn; }, focus() {},
  });
  const input = element(), popup = element(), calls = [], state = { tool: null, picking: false };
  popup.id = 'suggestions'; input.ownerDocument = { createElement: element };
  const completion = createCommandCompletion({ input, popup,
    enabled: () => !state.tool && !state.picking,
    submit: value => calls.push(value),
  });
  const submit = value => { calls.push(value); input.value = ''; popup.hidden = true; };
  const bind = new Function('input', 'commandCompletion', 'commandSubmitKey', 'submit', 'state', `
    let commandHistory=['LINE'], historyCursor=1;
    const tool=state.tool;
    ${keyHandler}
  `);
  const type = value => { input.value = value; input.handlers.input(); };
  const press = (key, extra = {}) => {
    bind(input, completion, commandSubmitKey, submit, state);
    const event = { key, preventDefault() {}, stopPropagation() {}, ...extra };
    input.handlers.keydown(event);
  };
  return { input, popup, calls, state, completion, type, press };
}

test('Enter and Space execute the displayed WBLOCK suggestion for w', () => {
  for (const key of ['Enter', ' ']) {
    const f = fixture(); f.type('w');
    assert.equal(f.popup.children[0].children[0].textContent, 'WBLOCK');
    f.press(key); assert.deepEqual(f.calls, ['WBLOCK']); assert(f.popup.hidden);
  }
});
test('exact aliases take priority over matching command names', () => {
  for (const [query, expected] of [['s','STRETCH'],['sc','SCALE'],['h','PAN'],['b','BLOCK'],['di','DIST'],['qsave','SAVE'],['mt','TEXT']]) {
    const f = fixture(); f.type(query); f.press('Enter'); assert.deepEqual(f.calls,[expected],query);
  }
  assert.deepEqual(commandSuggestions('does-not-exist'), []);
});
test('arrows choose suggestions before history, Tab completes the selected item and click executes it', () => {
  const f = fixture(); f.type('d'); f.press('ArrowDown');
  assert.equal(f.popup.children[1].attrs['aria-selected'], 'true');
  assert.equal(f.input.value, 'd');
  f.press('Tab'); assert.equal(f.input.value,'DIMALIGNED'); assert(f.popup.hidden);
  f.press('Enter'); assert.deepEqual(f.calls,['DIMALIGNED']);
  f.type('d'); f.press('ArrowUp'); f.press('Enter'); assert.equal(f.calls.at(-1),'DIMDIAMETER');
  f.type('w'); f.popup.children[0].onclick(); assert.equal(f.calls.at(-1),'WBLOCK');
  f.type(''); f.press('ArrowUp'); assert.equal(f.input.value,'LINE');
});
test('tool input, picking, unknown text and stale suggestions are never replaced by completion', () => {
  const f = fixture(); f.type('w'); f.state.tool = {phase:'text'};
  f.input.value='wood'; f.press(' '); assert.deepEqual(f.calls,[]);
  f.press('Enter'); assert.deepEqual(f.calls,['wood']);
  f.state.tool={phase:'points'}; f.type('100,200'); f.press('Enter'); assert.equal(f.calls.at(-1),'100,200');
  f.state.tool=null; f.state.picking=true; f.type('w'); assert(f.popup.hidden);
  f.press('Enter'); assert.equal(f.calls.at(-1),'w');
  f.state.picking=false; f.type('w'); f.input.value='nonsense'; f.press('Enter'); assert.equal(f.calls.at(-1),'nonsense');
  f.type('w'); f.press('Enter',{isComposing:true}); f.press('Enter',{repeat:true});
  assert.equal(f.calls.at(-1),'nonsense');
  f.completion.hide(); f.input.value=''; f.press('Enter'); assert.equal(f.calls.at(-1),'');
});
