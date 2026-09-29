import { number } from "./core.js";
// Reusable controls emit callbacks; document mutations belong to their caller.
export function createInspectorControls({ document, onInvalid }) {
  function field(label, value, change, type = "number") {
    const wrapper = document.createElement("label");
    wrapper.className = "field";
    const text = document.createElement("span");
    text.textContent = label;
    wrapper.append(text);
    const el = document.createElement(
      type === "multiline" ? "textarea" : "input",
    );
    if (type !== "multiline") el.type = type;
    else el.rows = 4;
    if (type === "number") el.step = "any";
    el.value = value;
    wrapper.append(el);
    let accepted = String(value);
    const apply = () => {
      if (el.value === accepted) return;
      const v = type === "number" ? number(el.value) : el.value;
      if (v === null) {
        onInvalid("Ogiltigt värde.");
        return;
      }
      accepted = el.value;
      change(v);
    };
    el.onchange = apply;
    el.onblur = apply;
    el.onkeydown = (ev) => {
      if (
        ev.key === "Enter" &&
        (type !== "multiline" || ev.ctrlKey || ev.metaKey)
      ) {
        ev.preventDefault();
        apply();
        el.blur();
      }
      if (ev.key === "Escape") {
        ev.stopPropagation();
        el.value = accepted;
        el.blur();
      }
    };
    return wrapper;
  }
  function section(title) {
    const el = document.createElement("div");
    el.className = "inspector-section";
    const h = document.createElement("div");
    h.className = "section-title";
    h.textContent = title;
    if (title) el.append(h);
    return el;
  }

  function choice(label, value, options, change) {
    const wrap = document.createElement("label");
    wrap.className = "field";
    const title = document.createElement("span");
    title.textContent = label;
    const select = document.createElement("select");
    for (const [value, label] of options) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      select.append(option);
    }
    select.value = String(value);
    select.onchange = () => change(select.value);
    wrap.append(title, select);
    return wrap;
  }
  function action(label, fn) {
    const button = document.createElement("button");
    button.className = "subtle-button";
    button.textContent = label;
    button.onclick = fn;
    return button;
  }
  const standardColors = [
    ["Röd", "#ff0000"],
    ["Orange", "#ff8000"],
    ["Gul", "#ffff00"],
    ["Grön", "#00cc00"],
    ["Cyan", "#00ffff"],
    ["Blå", "#0000ff"],
    ["Magenta", "#ff00ff"],
    ["Vit", "#ffffff"],
    ["Grå", "#808080"],
    ["Svart", "#000000"],
  ];
  function colorFields(root, value, layerColor, change) {
    const standard = standardColors.find(
      ([, color]) => color === value?.toLowerCase(),
    );
    const selected =
      value === "mixed"
        ? "mixed"
        : !value
          ? "layer"
          : standard
            ? standard[1]
            : "custom";
    const custom = document.createElement("div");
    custom.hidden = selected !== "custom";
    custom.append(
      field(
        "Egen kulör",
        value && value !== "mixed" ? value : layerColor || "#ffffff",
        change,
        "color",
      ),
    );
    const row = document.createElement("div");
    row.className = "field";
    const label = document.createElement("span");
    label.textContent = "Färg";
    const dropdown = document.createElement("details");
    dropdown.className = "color-dropdown";
    const trigger = document.createElement("summary");
    trigger.setAttribute("aria-label", "Färg");
    const menu = document.createElement("div");
    menu.className = "color-menu";
    const entries = [
      ...(value === "mixed" ? [["mixed", "Blandat", null]] : []),
      ["layer", "Enligt lager", layerColor],
      ...standardColors.map(([name, color]) => [color, name, color]),
      ["custom", "Egen kulör…", selected === "custom" ? value : null],
    ];
    const contents = (element, name, color) => {
      const swatch = document.createElement("span");
      swatch.className = "dropdown-swatch";
      if (color) swatch.style.background = color;
      swatch.setAttribute("aria-hidden", "true");
      const text = document.createElement("span");
      text.textContent = name;
      element.append(swatch, text);
    };
    const current = entries.find(([key]) => key === selected);
    contents(trigger, current[1], current[2]);
    for (const [key, name, color] of entries) {
      const button = document.createElement("button");
      button.type = "button";
      button.setAttribute("aria-pressed", String(key === selected));
      contents(button, name, color);
      button.onclick = () => {
        dropdown.open = false;
        if (key === "custom") {
          custom.hidden = false;
          custom.querySelector("input").focus();
          return;
        }
        if (key !== "mixed") change(key === "layer" ? null : key);
      };
      menu.append(button);
    }
    dropdown.onkeydown = (ev) => {
      ev.stopPropagation();
      if (ev.key === "Escape") {
        ev.preventDefault();
        dropdown.open = false;
        trigger.focus();
      }
      if (["ArrowDown", "ArrowUp"].includes(ev.key)) {
        ev.preventDefault();
        dropdown.open = true;
        const buttons = [...menu.querySelectorAll("button")];
        const index = buttons.indexOf(document.activeElement);
        buttons[
          (index + (ev.key === "ArrowDown" ? 1 : -1) + buttons.length) %
            buttons.length
        ].focus();
      }
    };
    dropdown.append(trigger, menu);
    row.append(label, dropdown);
    root.append(row, custom);
  }

  return { field, section, choice, action, colorFields };
}
