import { TextEditSession } from "./text-edit-session.js";
import { textFont } from "./text.js";
import { add } from "./geometry.js";

// DOM presentation and keyboard handling; document changes are injected.
export function createTextEditor({ document, screen, getSize, beforeBegin, applyChange, afterFinish, refresh, log }) {
  const $ = (selector) => document.querySelector(selector);
  const box = $("#text-editor"), area = $("#inline-text");
  let active = null;
  function position() {
    if (!active) return;
    const e = active.entity, { width, height } = getSize();
    const p = screen(e.type === "text" ? e.point : add(e.points.at(-1), {
      x: (e.height || 120) / 3, y: ((e.height || 120) * 7) / 24,
    }));
    box.style.left = Math.max(8, Math.min(width - 340, p.x)) + "px";
    box.style.top = Math.max(8, Math.min(height - 230, p.y - 65)) + "px";
  }
  function style() {
    const e = active.entity;
    area.style.fontFamily = textFont(e);
    area.style.fontWeight = e.bold ? "700" : "400";
    area.style.fontStyle = e.italic ? "italic" : "normal";
    area.style.textDecoration = e.underline ? "underline" : "none";
  }
  function finish(save) {
    if (!active) return true;
    let result;
    try { result = active.finish(save, area.value, applyChange); }
    catch (error) { log(error.message); return false; }
    active = null;
    box.hidden = true;
    if (result.message) log(result.message);
    afterFinish(result);
    return true;
  }
  function begin(entity, isNew = false) {
    if (active && !finish(true)) return false;
    beforeBegin();
    active = new TextEditSession(entity, isNew);
    area.value = entity.text;
    box.hidden = false;
    $("#text-font").value = textFont(entity);
    for (const key of ["bold", "italic", "underline"])
      $("#text-" + key).setAttribute("aria-pressed", String(Boolean(entity[key])));
    position(); style(); refresh();
    area.focus(); area.setSelectionRange(area.value.length, area.value.length);
    return true;
  }
  function keydown(ev) {
    if (ev.isComposing) return;
    if (ev.key === "Escape" || (ev.key === "Enter" && (ev.ctrlKey || ev.metaKey))) {
      ev.preventDefault(); ev.stopPropagation(); finish(ev.key !== "Escape");
    }
  }
  area.addEventListener("keydown", (ev) => { ev.stopPropagation(); keydown(ev); });
  box.addEventListener("keydown", keydown);
  for (const key of ["bold", "italic", "underline"])
    $("#text-" + key).onclick = () => {
      if (!active) return;
      active.entity[key] = !active.entity[key];
      $("#text-" + key).setAttribute("aria-pressed", String(active.entity[key]));
      style(); area.focus();
    };
  $("#text-font").onchange = () => {
    if (!active) return;
    active.entity.font = $("#text-font").value; style();
  };
  $("#text-apply").onclick = () => finish(true);
  $("#text-cancel").onclick = () => finish(false);
  return { get active() { return active; }, begin, finish, position };
}
