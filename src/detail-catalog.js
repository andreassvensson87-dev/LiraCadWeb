import { steelProfiles, profileTemplate, steelProfileSource } from "./steel-profiles.js";
import { blockTemplates } from "./blocks.js";
import { drawingBounds } from "./entity-geometry.js";
import { layoutSVG } from "./plot.js";
import { catalogInstance } from "./catalog-placement.js";

const favoriteKey = "liracad-detail-favorites-v1";
export function filterCatalog(items, { query = "", family, favoritesOnly = false, favorites = new Set() }) {
  const words = query.trim().toLocaleLowerCase("sv").split(/\s+/).filter(Boolean);
  return items.filter(item => (!family || words.length || item.family === family)
    && (!favoritesOnly || favorites.has(item.key))
    && words.every(word => item.name.toLocaleLowerCase("sv").includes(word)));
}

export function catalogPreview(template, rotation = 0, anchor = "center") {
  const instance = catalogInstance(template, { x: 0, y: 0 }, { layer: template.definition.entities[0].layer, space: "catalog-preview" }, { rotation, anchor });
  const b = drawingBounds([instance]);
  const padding = Math.max(b.maxX - b.minX, b.maxY - b.minY, 1) * 0.12;
  const width = Math.max(b.maxX - b.minX, 1) + padding * 2;
  const height = Math.max(b.maxY - b.minY, 1) + padding * 2;
  instance.point.x += padding - b.minX;
  instance.point.y += padding - b.minY;
  const layers = [...new Set(template.definition.entities.map(e => e.layer))].map(id => ({ id, color: "#283b32", visible: true, plot: true }));
  return layoutSVG({ entities: [instance], layers }, { id: "catalog-preview", name: template.definition.name, width, height, monochrome: true });
}

// Local browsing state is independent of drawing mutations. Templates are
// resolved by the placement tool again at the time the user clicks the model.
export function createDetailCatalog({ document, root, getDocument, getProjectId, getLayer, getPlacementReason, place, storage }) {
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  };
  const button = (name, click, className = "") => {
    const node = el("button", className, name);
    node.type = "button";
    node.onclick = click;
    return node;
  };
  let favorites;
  try {
    const saved = JSON.parse(storage?.getItem(favoriteKey) || "[]");
    favorites = new Set(Array.isArray(saved) ? saved.filter(v => typeof v === "string") : []);
  } catch { favorites = new Set(); }
  let category = "steel", family = "IPE", selected = null, favoritesOnly = false;
  let lastDocument, lastProject, lastLayer, lastReason;
  const search = el("input", "catalog-search");
  search.type = "search";
  search.placeholder = "Sök profil eller detalj…";
  search.setAttribute("aria-label", "Sök profil eller detalj");
  search.oninput = () => renderList();
  const categories = el("div", "catalog-categories");
  const steel = button("Stålprofiler", () => { category = "steel"; anchor.value = "center"; selected = null; list.scrollTop = 0; renderList(); });
  const own = button("Egna detaljer", () => { category = "own"; anchor.value = "base"; selected = null; list.scrollTop = 0; renderList(); });
  categories.append(steel, own);
  const families = el("div", "catalog-families");
  const familyButtons = [...new Set(steelProfiles.map(profile => profile.family))].map(name => {
    const node = button(name, () => { family = name; selected = null; search.value = ""; list.scrollTop = 0; renderList(); });
    const symbol = el("span", "catalog-family-symbol");
    symbol.innerHTML = `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="${name === "HEM" ? 4 : name === "HEB" ? 3 : 2}" aria-hidden="true"><path d="${name.startsWith("U") ? "M25 5H8v22h17" : name === "IPE" ? "M10 5h12M16 5v22M10 27h12" : "M5 5h22M16 5v22M5 27h22"}"/></svg>`;
    symbol.setAttribute("aria-hidden", "true");
    const label = el("span", "", name);
    node.replaceChildren(symbol, label);
    node.setAttribute("aria-label", name);
    families.append(node);
    return [name, node];
  });
  const list = el("div", "catalog-list");
  const source = el("div", "catalog-source");
  const preview = el("div", "catalog-preview");
  const settings = el("div", "catalog-settings");
  const select = (name, options) => {
    const label = el("label", "");
    label.append(el("span", "", name));
    const node = el("select", "");
    for (const [value, text] of options) {
      const option = el("option", "", text); option.value = value; node.append(option);
    }
    label.append(node); settings.append(label);
    node.onchange = renderPreview;
    return node;
  };
  const anchor = select("Insättningspunkt", [["center", "Centrum"], ["base", "Blockets baspunkt"],
    ["bottom-left", "Nedre vänster"], ["bottom-right", "Nedre höger"], ["top-left", "Övre vänster"], ["top-right", "Övre höger"]]);
  anchor.value = "center";
  const rotation = select("Rotation", [["0", "0°"], ["90", "90°"], ["180", "180°"], ["270", "270°"]]);
  rotation.value = "0";
  const insert = button("Placera i modell", () => {
    const item = items().find(item => item.key === selected);
    if (!item || getPlacementReason()) return;
    place({ template: template(item), standard: category === "steel", label: item.name,
      rotation: Number(rotation.value) * Math.PI / 180, anchor: anchor.value });
  }, "catalog-place");
  const hint = el("p", "catalog-hint");
  const favoriteToggle = button("☆ Favoriter", () => { favoritesOnly = !favoritesOnly; renderList(); }, "catalog-favorites");
  const browser = el("div", "catalog-browser");
  const selection = el("div", "catalog-selection");
  selection.append(list, preview);
  browser.append(search, categories, families, selection, source);
  const placementControls = el("div", "catalog-placement-controls");
  placementControls.append(settings, insert, hint, favoriteToggle);
  root.append(browser, placementControls);

  function items() {
    if (category === "steel") return steelProfiles.map(profile => ({ ...profile, key: profile.id }));
    return blockTemplates(getDocument()).filter(t => !steelProfiles.some(p => p.id === t.definition.id))
      .map(t => ({ key: `own:${getProjectId()}:${t.definition.id}`, name: t.definition.name, template: t }));
  }
  function template(item) { return item.template || profileTemplate(item, getLayer()); }
  function renderList() {
    steel.setAttribute("aria-pressed", String(category === "steel"));
    own.setAttribute("aria-pressed", String(category === "own"));
    families.hidden = category !== "steel";
    for (const [name, node] of familyButtons) node.setAttribute("aria-pressed", String(name === family));
    favoriteToggle.setAttribute("aria-pressed", String(favoritesOnly));
    favoriteToggle.textContent = `${favoritesOnly ? "★" : "☆"} Favoriter`;
    const previous = selected;
    const all = items(), visible = filterCatalog(all, { query: search.value, family: category === "steel" ? family : null, favoritesOnly, favorites });
    if (!visible.some(item => item.key === selected)) selected = visible.find(item => item.name === "IPE 200")?.key || visible[0]?.key || null;
    const scrollTop = list.scrollTop;
    list.replaceChildren();
    const heading = el("div", "catalog-list-heading", `${category === "steel" ? "Profil" : "Detalj"} · ${visible.length}`);
    list.append(heading);
    for (const item of visible) {
      const row = el("div", "catalog-item");
      const choose = button(item.name, () => { selected = item.key; renderList(); }, "catalog-item-name");
      choose.setAttribute("aria-pressed", String(selected === item.key));
      const favorite = button(favorites.has(item.key) ? "★" : "☆", () => {
        if (favorites.has(item.key)) favorites.delete(item.key); else favorites.add(item.key);
        try { storage?.setItem(favoriteKey, JSON.stringify([...favorites])); } catch { /* Browsing still works when storage is unavailable. */ }
        renderList();
      }, "catalog-star");
      favorite.setAttribute("aria-label", `Favorit: ${item.name}`);
      favorite.setAttribute("aria-pressed", String(favorites.has(item.key)));
      row.append(choose, favorite); list.append(row);
    }
    if (!visible.length) list.append(el("p", "catalog-empty", category === "own" && !all.length
      ? "Här visas ritningens block. Skapa en egen detalj med BLOCK." : "Inga detaljer matchar ditt val."));
    list.scrollTop = scrollTop;
    if (selected !== previous) {
      const row = list.querySelector('.catalog-item-name[aria-pressed="true"]')?.parentElement;
      if (row) list.scrollTop = Math.max(0, row.offsetTop - list.clientHeight / 2 + row.offsetHeight / 2);
    }
    source.replaceChildren();
    if (category === "steel") {
      const link = el("a", "", "Tibnor · Konstruktionstabeller 2023 ↗");
      link.href = steelProfileSource; link.target = "_blank"; link.rel = "noopener noreferrer"; source.append(link);
    } else source.textContent = "Block från den aktiva ritningen";
    renderPreview();
  }
  function renderPreview() {
    preview.replaceChildren();
    const item = items().find(item => item.key === selected);
    const reason = getPlacementReason();
    insert.disabled = !item || !!reason;
    settings.hidden = !item;
    hint.textContent = reason || "Klicka för att placera · Esc avbryter";
    if (!item) return;
    preview.append(el("strong", "", item.name), el("span", "catalog-preview-caption", category === "steel" ? "Tvärsnitt · mm · 1:1" : "Förhandsvisning · 1:1"));
    const graphic = el("div", "catalog-preview-graphic");
    graphic.innerHTML = catalogPreview(template(item), Number(rotation.value) * Math.PI / 180, anchor.value);
    preview.append(graphic);
    if (category === "steel") {
      const number = value => value.toLocaleString("sv-SE");
      preview.append(el("div", "catalog-dimensions", `h ${number(item.h)} · b ${number(item.b)} · t ${number(item.t)} · d ${number(item.d)} · R ${number(item.r)}${item.tip ? ` / ${number(item.tip)}` : ""} mm`));
    }
  }
  function refresh(force = false) {
    const doc = getDocument(), project = getProjectId(), layer = getLayer(), reason = getPlacementReason();
    if (force || doc !== lastDocument || project !== lastProject || layer !== lastLayer || reason !== lastReason) {
      if (project !== lastProject) selected = null;
      lastDocument = doc; lastProject = project; lastLayer = layer; lastReason = reason;
      renderList();
    }
  }
  return { refresh };
}
