import { definitions } from "../commands/command-catalog.js";
import { icons } from "./toolbar-icons.js";
import { toolbarGroups, toolbarLabels } from "./toolbar-groups.js";

export function installRibbon({ document }) {
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  for (const [category, groups] of Object.entries(toolbarGroups)) {
    const panel = $(`[data-tool-panel="${category}"]`);
    for (const { label: heading, commands } of groups) {
      const section = document.createElement("section");
      section.className = "toolbar-section";
      section.setAttribute("aria-label", heading);
      const title = document.createElement("h3");
      title.textContent = heading;
      section.append(title);
      for (const name of commands) {
        const [, label, alias] = definitions.find((d) => d[0] === name);
        const b = document.createElement("button");
        b.dataset.command = name;
        b.title = `${label} · ${alias}${name === "TRIM" ? " · Shift växlar funktion" : ""}`;
        b.innerHTML = `<span class="tool-icon"><svg viewBox="0 0 24 24" aria-hidden="true">${icons[name]}</svg></span><span>${toolbarLabels[name] || label}</span>`;
        section.append(b);
      }
      panel.append(section);
    }
  }

  const clipboard = document.createElement("section");
  clipboard.className = "toolbar-section";
  clipboard.setAttribute("aria-label", "Urklipp mellan ritningar");
  clipboard.innerHTML = '<h3>Urklipp</h3>';
  for (const [action, label, key, path] of [
    ["copy", "Kopiera till urklipp", "C", '<rect x="8" y="8" width="12" height="13"/><path d="M16 8V3H3v13h5"/>'],
    ["cut", "Klipp ut", "X", '<circle cx="6" cy="17" r="3"/><circle cx="18" cy="17" r="3"/><path d="m4 3 12 12M20 3 8 15"/>'],
    ["paste", "Klistra in", "V", '<path d="M8 5H4v16h16V5h-4"/><rect x="8" y="2" width="8" height="6"/>'],
  ]) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.clipboard = action;
    button.title = `${label} mellan ritningsflikar · Ctrl/⌘+${key}`;
    button.innerHTML = `<span class="tool-icon"><svg viewBox="0 0 24 24" aria-hidden="true">${path}</svg></span><span>${label}</span>`;
    clipboard.append(button);
  }
  $('[data-tool-panel="edit"]').prepend(clipboard);

  const tabs = $$("[data-ribbon]");
  const tablist = tabs[0].parentElement;
  tablist.setAttribute("role", "tablist");
  tablist.setAttribute("aria-label", "CAD-verktyg");
  for (const category of [
    "draw",
    "edit",
    "dimension",
    "block",
    "layout",
    "view",
  ])
    tablist.append(tabs.find((tab) => tab.dataset.ribbon === category));
  function activate(button, focus = false) {
    for (const tab of tabs) {
      const active = tab === button;
      tab.classList.toggle("active", active);
      tab.setAttribute("aria-selected", String(active));
      tab.setAttribute("aria-pressed", String(active));
      tab.tabIndex = active ? 0 : -1;
    }
    for (const panel of $$("[data-tool-panel]"))
      panel.hidden = panel.dataset.toolPanel !== button.dataset.ribbon;
    if (focus) button.focus();
  }
  for (const button of tabs) {
    const category = button.dataset.ribbon;
    const panel = $(`[data-tool-panel="${category}"]`);
    button.setAttribute("role", "tab");
    button.id = "ribbon-tab-" + category;
    panel.id ||= "ribbon-panel-" + category;
    button.setAttribute("aria-controls", panel.id);
    panel.setAttribute("role", "tabpanel");
    panel.setAttribute("aria-labelledby", button.id);
    button.onclick = () => activate(button);
    button.onkeydown = (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
        return;
      event.preventDefault();
      event.stopPropagation();
      const ordered = [...tablist.querySelectorAll("[data-ribbon]")],
        index = ordered.indexOf(button);
      const next =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? ordered.length - 1
            : (index + (event.key === "ArrowRight" ? 1 : -1) + ordered.length) %
              ordered.length;
      activate(ordered[next], true);
    };
  }
  for (const section of $$(".toolbar-section")) {
    const buttons = [...section.querySelectorAll("button")];
    buttons.forEach((button, index) => {
      button.style.gridColumn =
        index === 0 ? "1" : String(2 + Math.floor((index - 1) / 2));
      button.style.gridRow =
        index === 0 ? "1 / 3" : String(1 + ((index - 1) % 2));
    });
    buttons[0]?.classList.add("ribbon-large");
    section.append(section.querySelector("h3"));
  }
  const shortcuts = document.createElement("div");
  shortcuts.className = "tool-group ribbon-shortcuts";
  shortcuts.setAttribute("aria-label", "Vanliga verktyg");
  const section = document.createElement("section");
  section.className = "toolbar-section";
  for (const [name, label, path] of [
    ["SELECT", "Markera", "m5 3 14 10-7 1-3 7Z"],
    ["MOVE", "Flytta", null],
  ]) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.command = name;
    button.className = "ribbon-large";
    button.title = label;
    button.innerHTML = `<span class="tool-icon"><svg viewBox="0 0 24 24" aria-hidden="true">${path ? `<path d="${path}"/>` : icons.MOVE}</svg></span><span>${label}</span>`;
    section.append(button);
  }
  const title = document.createElement("h3");
  title.textContent = "Markering & placering";
  section.append(title);
  shortcuts.append(section);
  $(".ribbon").append(shortcuts);
  activate(tabs.find((button) => button.dataset.ribbon === "draw"));
}
