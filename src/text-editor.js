import { TextEditSession } from "./text-edit-session.js";
import { textFont, fontFamily, textAlignment, textVerticalAnchor, textSpanValue, applyTextProperty } from "./text.js";
import { add } from "./geometry.js";
import { bounds } from "./entity-geometry.js";

// DOM presentation and keyboard handling; document changes are injected.
export function createTextEditor({ document, screen, getSize, getAvoidBounds, beforeBegin, applyChange, afterFinish, refresh, log }) {
  const $ = (selector) => document.querySelector(selector);
  const box = $("#text-editor"), area = $("#inline-text");
  let active = null;
  const displayValue = value => typeof value === "number" ? String(Number(value.toPrecision(10))) : String(value);
  const settings = [
    ["text-align", "textAlign", e => textAlignment(e), v => v],
    ["text-vertical", "textVertical", e => textVerticalAnchor(e), v => v],
    ["text-rotation", "rotation", e => (e.rotation || 0) * 180 / Math.PI, v => Number(v) * Math.PI / 180, -1e10, 1e10],
    ["text-height", "height", e => e.height, Number, 0.01, 1000000],
    ["text-spacing", "lineSpacing", e => (e.lineSpacing || 1.4) / (5 / 3), v => Number(v) * 5 / 3, 5 / 12, 20 / 3],
    ["text-spacing-style", "lineSpacingStyle", e => e.lineSpacingStyle || 2, Number],
    ["text-tracking", "tracking", e => textSpanValue(e, "tracking"), Number, 0.75, 4],
    ["text-width-factor", "widthFactor", e => textSpanValue(e, "widthFactor"), Number, 0.01, 1000],
    ["text-width", "textWidth", e => e.textWidth || 0, Number, 0, 1000000],
  ];
  function position() {
    if (!active) return;
    const e = active.entity, { width, height } = getSize();
    const point = e.type === "text" ? e.point : add(e.points.at(-1), {
      x: (e.height || 120) / 3, y: ((e.height || 120) * 7) / 24,
    });
    const p = screen(point), b = getAvoidBounds?.() || bounds({ ...e, type: "text", point });
    const corners = [[b.minX,b.minY],[b.maxX,b.minY],[b.maxX,b.maxY],[b.minX,b.maxY]].map(([x,y]) => screen({x,y}));
    const left = Math.min(...corners.map(p=>p.x)), right = Math.max(...corners.map(p=>p.x)), top = Math.min(...corners.map(p=>p.y)), bottom = Math.max(...corners.map(p=>p.y));
    const w = box.offsetWidth || 330, h = box.offsetHeight || 470;
    const candidates = [[right+16,p.y-65],[left-w-16,p.y-65],[p.x,bottom+16],[p.x,top-h-16]].map(([x,y]) => ({x:Math.max(8,Math.min(width-w-8,x)),y:Math.max(8,Math.min(height-h-8,y))}));
    const overlap = a => Math.max(0,Math.min(a.x+w,right)-Math.max(a.x,left))*Math.max(0,Math.min(a.y+h,bottom)-Math.max(a.y,top));
    const placement = candidates.reduce((best,a) => overlap(a)<overlap(best) ? a : best);
    box.style.left = placement.x + "px"; box.style.top = placement.y + "px";
  }
  function style() {
    const e = active.entity;
    area.style.fontFamily = fontFamily(e);
    area.style.fontWeight = e.bold ? "700" : "400";
    area.style.fontStyle = e.italic ? "italic" : "normal";
    area.style.textDecoration = e.underline ? "underline" : "none";
    area.style.textAlign = textAlignment(e);
    area.style.lineHeight = String(e.lineSpacing || 1.4);
    area.style.letterSpacing = ((textSpanValue(e, "tracking")) - 1) * 8 + "px";
  }
  function finish(save) {
    if (!active) return true;
    if (save) for (const [id] of settings) if (!$("#" + id).onchange()) return false;
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
    $("#text-target").textContent = (entity.attributeTag ? "Attribut · " + (entity.attributeSchema?.label || entity.attributeTag) : "Text") + (entity._annotationScale?` · 1:${entity._annotationScale}`:"");
    box.hidden = false;
    const fonts = $("#text-font");
    for (const option of fonts.querySelectorAll("[data-imported]")) option.remove();
    if (![...fonts.options].some(o => o.value === textFont(entity))) {
      const option = document.createElement("option"); option.value = option.textContent = textFont(entity); option.dataset.imported = "true"; fonts.append(option);
    }
    fonts.value = textFont(entity);
    for (const key of ["bold", "italic", "underline"])
      $("#text-" + key).setAttribute("aria-pressed", String(Boolean(entity[key])));
    for (const [id, , value] of settings) $("#" + id).value = displayValue(value(entity));
    $("#text-vertical").disabled = $("#text-rotation").disabled = entity.type !== "text";
    $("#text-width").disabled = entity.type !== "text" || !!entity.attributeTag;
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
  area.addEventListener("input", () => { if (active) refresh(); });
  box.addEventListener("keydown", keydown);
  for (const key of ["bold", "italic", "underline"])
    $("#text-" + key).onclick = () => {
      if (!active) return;
      delete active.entity.textRuns;
      active.entity[key] = !active.entity[key];
      $("#text-" + key).setAttribute("aria-pressed", String(active.entity[key]));
      style(); refresh(); area.focus();
    };
  $("#text-font").onchange = () => {
    if (!active) return;
    delete active.entity.textRuns; delete active.entity.sourceFont;
    active.entity.font = $("#text-font").value; style(); refresh();
  };
  for (const [id, key, current, convert, min, max] of settings) {
    const update = ({ live = false } = {}) => {
    if (!active) return true;
    const input = $("#" + id), value = convert(input.value);
    if (input.disabled) return true;
    if (input.value.trim() !== "" && value === convert(displayValue(current(active.entity)))) return true;
    if (min != null && (!Number.isFinite(value) || value < min || value > max || input.value.trim() === "")) {
      if (live) return false;
      log("Värdet ligger utanför det tillåtna intervallet."); input.value = displayValue(current(active.entity)); return false;
    }
    if (value !== convert(displayValue(current(active.entity)))) active.entity = applyTextProperty(active.entity, key, value);
    style(); refresh();
    return true;
    };
    $("#" + id).onchange = update;
    $("#" + id).addEventListener("input", () => update({ live: true }));
  }
  $("#text-apply").onclick = () => finish(true);
  $("#text-cancel").onclick = () => finish(false);
  return { get active() { return active; }, preview: () => active?.draft(area.value) || null, begin, finish, position };
}
