import { definitions, aliases } from './command-catalog.js';

const commands = [...definitions, ...[
  ['SELECT', 'Markera'], ['ZOOM', 'Visa hela ritningen'], ['PAN', 'Panorera'],
  ['DIST', 'Mät avstånd'], ['UNDO', 'Ångra'], ['REDO', 'Gör om'],
  ['SAVE', 'Spara projekt'], ['DXF', 'Exportera DXF'], ['HELP', 'Hjälp'],
  ['MODEL', 'Modell'], ['PSPACE', 'Lämna viewport'],
  ['BCLOSE', 'Spara och stäng blockeditor'], ['BSAVE', 'Spara block'],
  ['BCANCEL', 'Avbryt blockredigering'],
].map(([name, label]) => [name, label, ''])];

export function commandSuggestions(value) {
  const query = value.trim().toUpperCase();
  if (!query) return [];
  const exact = aliases[query] || (['MT', 'MTEXT'].includes(query) ? 'TEXT' : query);
  const matches = commands.filter(([name, , alias]) => name.startsWith(query) ||
    (alias && alias.startsWith(query)) || Object.entries(aliases).some(([key, target]) =>
      target === name && key.startsWith(query)) || name === exact);
  return [...matches.filter(([name]) => name === exact),
    ...matches.filter(([name]) => name !== exact)].slice(0, 5);
}

// Completion only applies while choosing a command, never to a tool's input.
export function createCommandCompletion({ input, popup, enabled, submit }) {
  let list = [], selected = 0, query = '';
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-controls', popup.id);
  popup.setAttribute('role', 'listbox');
  popup.setAttribute('aria-label', 'Kommandoförslag');
  function hide() {
    popup.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  }
  function highlight() {
    [...popup.children].forEach((button, index) => {
      button.classList.toggle('active', index === selected);
      button.setAttribute('aria-selected', String(index === selected));
    });
    input.setAttribute('aria-expanded', 'true');
    input.setAttribute('aria-activedescendant', `${popup.id}-${selected}`);
  }
  function refresh() {
    query = input.value;
    list = enabled() ? commandSuggestions(query) : [];
    selected = 0;
    popup.replaceChildren();
    if (!list.length) { hide(); return; }
    list.forEach(([name, label], index) => {
      const button = input.ownerDocument.createElement('button');
      button.type = 'button'; button.id = `${popup.id}-${index}`;
      button.setAttribute('role', 'option'); button.tabIndex = -1;
      const title = input.ownerDocument.createElement('b'); title.textContent = name;
      const description = input.ownerDocument.createElement('span'); description.textContent = label;
      button.append(title, description);
      button.onmousedown = event => event.preventDefault();
      button.onclick = () => { hide(); submit(name); input.focus(); };
      popup.append(button);
    });
    popup.hidden = false; highlight();
  }
  function active() { return enabled() && !popup.hidden && list.length && query === input.value; }
  function navigate(event) {
    if (!active() || event.isComposing) return false;
    if (event.key === 'Tab') {
      event.preventDefault(); input.value = list[selected][0]; hide(); return true;
    }
    if (!['ArrowUp', 'ArrowDown'].includes(event.key)) return false;
    event.preventDefault();
    selected = (selected + (event.key === 'ArrowUp' ? -1 : 1) + list.length) % list.length;
    highlight(); return true;
  }
  input.addEventListener('input', refresh);
  input.addEventListener('blur', hide);
  hide();
  return { navigate, hide, resolve: () => active() ? list[selected][0] : input.value };
}
