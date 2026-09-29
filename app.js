import { setupPWA } from "./pwa.js";
import { trimExtend } from "./trim-extend.js";
import { layoutSVG } from "./plot.js";
import {
  joinEntities,
  explodePolyline,
  insertVertex,
  removeVertex,
  corner,
} from "./editing.js";
import {
  dimensionParts,
  dimensionChain,
  extendDimensionChain,
} from "./dimensions.js";
import {
  spaceOf,
  viewportCamera,
  viewportFromCamera,
  viewportContains,
  paperSnaps,
} from "./layout.js";
import { grips, gripEntity } from "./grips.js";
import { textLines, textFont } from "./text.js";
import { TrackingReferences } from "./tracking.js";
import { createSnapIndex, nearbySnaps, resolveSnap } from "./snapping.js";
import { wheelNavigation, commandSubmitKey } from "./navigation.js";
import {
  TAU,
  clone,
  dist,
  add,
  sub,
  mul,
  angle,
  polar,
  uid,
  number,
  parsePoint,
  arcThrough,
  pointsOf,
  bounds,
  hitDistance,
  rectSelect,
  transformed,
  offset,
  History,
  validDocument,
  demoDocument,
  toDXF,
} from "./core.js";
const $ = (s) => document.querySelector(s),
  $$ = (s) => [...document.querySelectorAll(s)];
try {
  $("#navigation-device").value =
    localStorage.getItem("liracad-navigation") === "mouse"
      ? "mouse"
      : "trackpad";
} catch {}
$("#navigation-device").addEventListener("change", () => {
  try {
    localStorage.setItem("liracad-navigation", $("#navigation-device").value);
  } catch {}
});
const canvas = $("#canvas"),
  ctx = canvas.getContext("2d"),
  input = $("#command-input");
const icons = {
  TRIM: '<path d="M3 3v18M1 8h20M9 4l8 8m0-8-8 8"/>',
  EXTEND: '<path d="M21 3v18M3 12h18m-5-5 5 5-5 5"/>',
  LINE: '<path d="M4 20 20 4"/><path d="M2 18h4v4H2zM18 2h4v4h-4z"/>',
  PLINE:
    '<path d="m3 19 5-14 8 11 5-10"/><path d="M1 17h4v4H1zM19 4h4v4h-4z"/>',
  RECTANG: '<rect x="3" y="5" width="18" height="14"/>',
  CIRCLE: '<circle cx="12" cy="12" r="9"/><path d="M10 12h4m-2-2v4"/>',
  ARC: '<path d="M3 19A15 15 0 0 1 21 5"/><path d="M1 17h4v4H1zM19 3h4v4h-4z"/>',
  TEXT: '<path d="M4 5V3h16v2M12 3v18m-4 0h8"/>',
  LEADER: '<path d="m3 20 8-13h10M3 20l1-7 5 3z"/>',
  HATCH: '<path d="M3 3h18v18H3zM3 11l8-8M3 19 19 3M9 21 21 9M17 21l4-4"/>',
  MOVE: '<path d="M12 2v20M2 12h20M8 6l4-4 4 4M8 18l4 4 4-4M6 8l-4 4 4 4M18 8l4 4-4 4"/>',
  COPY: '<rect x="8" y="8" width="12" height="12"/><path d="M5 16H3V3h13v2"/>',
  ROTATE: '<path d="M4 9a8 8 0 1 1 0 6M3 3v6h6"/>',
  SCALE: '<path d="M3 13v8h8v-8zM3 9V3h18v18h-6M10 14 20 4m-6 0h6v6"/>',
  MIRROR: '<path d="M12 2v3m0 3v3m0 3v3m0 3v2M3 18V6l6 12zm18 0V6l-6 12z"/>',
  OFFSET: '<path d="M3 20 3 4h16M8 20V9h11M13 20v-6h6"/>',
  ERASE: '<path d="m4 15 9-11 8 7-8 10H10zM8 10l8 7M3 21h19"/>',
  JOIN: '<path d="M2 16h7l6-8h7M8 12l4 4m0-8 4 4"/>',
  EXPLODE: '<path d="M3 9V3h6m6 0h6v6m0 6v6h-6M9 21H3v-6M8 8l8 8m0-8-8 8"/>',
  PINSERT:
    '<path d="M2 19 10 10l12 9M16 3v8m-4-4h8"/><rect x="8" y="8" width="4" height="4"/>',
  PDELETE:
    '<path d="M2 19 10 10l12 9M12 5h9"/><rect x="8" y="8" width="4" height="4"/>',
  FILLET: '<path d="M3 21V12a9 9 0 0 1 9-9h9"/>',
  CHAMFER: '<path d="M3 21V12l9-9h9"/>',
  DIMCONTINUE:
    '<path d="M2 4v16m10-16v16m10-16v16M2 8h20M5 5 2 8l3 3m4-6 3 3-3 3m6-6-3 3 3 3m4-6 3 3-3 3"/>',
  DIMLINEAR:
    '<path d="M3 4v16m18-16v16M3 8h18M6 5 3 8l3 3m12-6 3 3-3 3M3 18h18"/>',
  DIMALIGNED: '<path d="m3 15 14-12M7 21 21 9M5 16l14-12M5 12v4h4m6-12h4v4"/>',
  DIMANGULAR: '<path d="M3 3v18h18M3 8a13 13 0 0 1 13 13m-3-4 3 4 2-5"/>',
  DIMRADIUS: '<circle cx="12" cy="12" r="9"/><path d="m12 12 7-6m-5 0h5v5"/>',
  DIMDIAMETER:
    '<circle cx="12" cy="12" r="9"/><path d="M5 19 19 5m-5 0h5v5M5 14v5h5"/>',
};
const definitions = [
  ["LINE", "Linje", "L"],
  ["PLINE", "Polylinje", "PL"],
  ["RECTANG", "Rektangel", "REC"],
  ["CIRCLE", "Cirkel", "C"],
  ["ARC", "Båge", "A"],
  ["TEXT", "Text", "T"],
  ["LEADER", "Leader", "LE"],
  ["HATCH", "Hatch", "HA"],
  ["MOVE", "Flytta", "M"],
  ["COPY", "Kopiera", "CO"],
  ["ROTATE", "Rotera", "RO"],
  ["SCALE", "Skala", "SC"],
  ["MIRROR", "Spegla", "MI"],
  ["OFFSET", "Offset", "O"],
  ["ERASE", "Radera", "E"],
  ["JOIN", "Sammanfoga", "J"],
  ["EXPLODE", "Dela upp", "X"],
  ["PINSERT", "Lägg till hörn", "PI"],
  ["PDELETE", "Ta bort hörn", "PD"],
  ["FILLET", "Avrunda hörn", "F"],
  ["CHAMFER", "Fasa hörn", "CHA"],
  ["DIMLINEAR", "Linjärt mått", "DLI"],
  ["DIMALIGNED", "Riktat mått", "DAL"],
  ["DIMANGULAR", "Vinkelmått", "DAN"],
  ["DIMRADIUS", "Radiemått", "DRA"],
  ["DIMDIAMETER", "Diametermått", "DDI"],
  ["DIMCONTINUE", "Kedjemått", "DCO"],
  ["TRIM", "Trimma", "TR"],
  ["EXTEND", "Förläng", "EX"],
  ["MVIEW", "Skapa viewport", "MV"],
];
const aliases = Object.fromEntries(
  definitions.flatMap(([name, , a]) => [
    [name, name],
    [a, name],
  ]),
);
Object.assign(aliases, {
  SELECT: "SELECT",
  ESC: "SELECT",
  Z: "ZOOM",
  ZOOM: "ZOOM",
  H: "PAN",
  PAN: "PAN",
  DI: "DIST",
  DIST: "DIST",
  U: "UNDO",
  UNDO: "UNDO",
  REDO: "REDO",
  SAVE: "SAVE",
  QSAVE: "SAVE",
  DXF: "DXF",
  HELP: "HELP",
  "?": "HELP",
});
for (const [i, [name, label, a]] of definitions
  .filter((d) => d[0] !== "MVIEW")
  .entries()) {
  const b = document.createElement("button");
  b.dataset.command = name;
  b.title = `${label} · ${a}`;
  b.innerHTML = `<span class="tool-icon"><svg viewBox="0 0 24 24">${icons[name]}</svg></span><span>${label}</span>`;
  $(
    i < 8
      ? "#draw-tools"
      : name.startsWith("DIM")
        ? "#dimension-buttons"
        : "#edit-tools",
  ).append(b);
}
let inlineEdit = null;
let doc = demoDocument(),
  restoreError = false;
try {
  const d = JSON.parse(localStorage.getItem("liracad-v1"));
  if (validDocument(d)) doc = d;
} catch {
  restoreError = true;
}
let activeLayer = doc.layers[0].id,
  selection = new Set(),
  history = new History(),
  tool = null,
  lastCommand = "LINE",
  cursor = { x: 0, y: 0 },
  rawCursor = { x: 0, y: 0 },
  mouse = { x: 0, y: 0 },
  snap = null,
  drag = null,
  space = false,
  spaceUsed = false,
  showGrid = false,
  osnap = true,
  ortho = false,
  polarEnabled = true,
  tracking = true,
  trackAnchors = [],
  gridSnap = false,
  hover = null,
  dirty = false;
let commandHistory = [],
  historyCursor = 0;
let width = 1,
  height = 1,
  dpr = 1,
  camera = { x: 0, y: 0, scale: 0.075 },
  drawPending = false,
  savingTimer = null,
  snapCache = { points: [], edges: [] };
let activeSpace = "model",
  activeViewportId = null,
  paperCamera = null;
const spaceCameras = new Map();
const drawingSpace = () => (activeViewportId ? "model" : activeSpace);
const transforms = ["MOVE", "COPY", "ROTATE", "SCALE", "MIRROR"];
const layerOf = (e) => doc.layers.find((l) => l.id === e.layer),
  visible = (e) =>
    layerOf(e)?.visible !== false && spaceOf(e) === drawingSpace(),
  editable = (e) => visible(e) && !layerOf(e)?.locked;
const world = (p) => ({
  x: (p.x - width / 2) / camera.scale + camera.x,
  y: (height / 2 - p.y) / camera.scale + camera.y,
});
const screen = (p) => ({
  x: (p.x - camera.x) * camera.scale + width / 2,
  y: height / 2 - (p.y - camera.y) * camera.scale,
});
const svg = (n) =>
  `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.3">${icons[n] || icons.LINE}</svg>`;
const fmt = (n) =>
  Number(n.toFixed(2)).toLocaleString("sv-SE", { maximumFractionDigits: 2 });
function log(s) {
  const el = document.createElement("div");
  el.textContent = s;
  el.className = "recent";
  $("#command-log .recent")?.classList.remove("recent");
  $("#command-log").append(el);
  while ($("#command-log").children.length > 50)
    $("#command-log").firstChild.remove();
  $("#command-log").scrollTop = 1e9;
}
function schedule() {
  if (!drawPending) {
    drawPending = true;
    requestAnimationFrame(() => {
      drawPending = false;
      render();
    });
  }
}
function modelExtentsCenter() {
  const es = doc.entities.filter((e) => spaceOf(e) === "model");
  if (!es.length) return { x: 0, y: 0 };
  const bs = es.map(bounds);
  return {
    x:
      (Math.min(...bs.map((b) => b.minX)) +
        Math.max(...bs.map((b) => b.maxX))) /
      2,
    y:
      (Math.min(...bs.map((b) => b.minY)) +
        Math.max(...bs.map((b) => b.maxY))) /
      2,
  };
}
function syncViewport() {
  if (!activeViewportId) return;
  const i = doc.entities.findIndex((e) => e.id === activeViewportId),
    e = doc.entities[i];
  if (e && !e.locked) {
    doc.entities[i] = viewportFromCamera(e, camera, paperCamera, width, height);
    persisted();
  }
}
function leaveViewport() {
  if (!activeViewportId) return;
  if (inlineEdit) finishTextEdit(true);
  syncViewport();
  activeViewportId = null;
  camera = paperCamera;
  paperCamera = null;
  setCreationMode("paper");
  cancel();
}
function enterViewport(e) {
  if (inlineEdit) finishTextEdit(true);
  cancel();
  paperCamera = { ...camera };
  activeViewportId = e.id;
  setCreationMode("model");
  camera = viewportCamera(e, paperCamera, width, height);
  rebuild();
  renderSpaceControls();
  renderInspector();
  schedule();
}
function switchSpace(id) {
  if (inlineEdit) finishTextEdit(true);
  if (activeViewportId) leaveViewport();
  spaceCameras.set(activeSpace, { ...camera });
  activeSpace = id;
  cancel();
  if (spaceCameras.has(id)) camera = { ...spaceCameras.get(id) };
  else fit();
  setCreationMode(id === "model" ? "model" : "paper");
  update();
}
function createLayout() {
  const id = uid();
  let number = (doc.layouts?.length || 0) + 1;
  while (doc.layouts?.some((l) => l.name.toLowerCase() === `layout ${number}`))
    number++;
  commit("Ny layout", () => {
    (doc.layouts ||= []).push({
      id,
      name: `Layout ${number}`,
      width: 420,
      height: 297,
    });
  });
  switchSpace(id);
}
function renderSpaceControls() {
  const tabs = $("#space-tabs");
  const spaces = [
    ["model", "Model"],
    ...(doc.layouts || []).map((l) => [l.id, l.name]),
  ];
  if (tabs.dataset.spaces !== JSON.stringify(spaces)) {
    tabs.replaceChildren(
      ...spaces.map(([id, name]) => {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.space = id;
        button.textContent = name;
        button.setAttribute("role", "tab");
        button.onclick = () => switchSpace(id);
        return button;
      }),
    );
    tabs.dataset.spaces = JSON.stringify(spaces);
  }
  for (const button of tabs.children) {
    const active = button.dataset.space === activeSpace;
    button.setAttribute("aria-selected", String(active));
    button.tabIndex = active ? 0 : -1;
  }
  $("#viewport-create").disabled =
    activeSpace === "model" || !!activeViewportId;
  $("#paper-space").disabled = !activeViewportId;
  $("#space-context").textContent = activeViewportId
    ? "MODEL via viewport"
    : activeSpace === "model"
      ? "MODEL"
      : "PAPPER · mm";
  $("#export-sheet").disabled = activeSpace === "model";
}
function paperPoint(pixel) {
  const cam = paperCamera || camera;
  return {
    x: (pixel.x - width / 2) / cam.scale + cam.x,
    y: (height / 2 - pixel.y) / cam.scale + cam.y,
  };
}
function activeClip() {
  const e = doc.entities.find((e) => e.id === activeViewportId);
  if (!e) return null;
  const saved = camera;
  camera = paperCamera;
  const a = screen(e.points[0]),
    b = screen(e.points[1]);
  camera = saved;
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(a.x - b.x),
    h: Math.abs(a.y - b.y),
  };
}
function inActiveViewport(pixel) {
  const r = activeClip();
  return (
    !r ||
    (pixel.x >= r.x &&
      pixel.x <= r.x + r.w &&
      pixel.y >= r.y &&
      pixel.y <= r.y + r.h)
  );
}
function paintEntities(space, onPaper = false, interactive = true) {
  let previewTarget = null;
  if (
    interactive &&
    space === drawingSpace() &&
    ["TRIM", "EXTEND"].includes(tool?.name) &&
    tool.phase === "trimPick"
  ) {
    const e = hit(rawCursor);
    try {
      trimExtend(
        e,
        doc.entities.filter(
          (x) => tool.boundaryIds.includes(x.id) && editable(x),
        ),
        rawCursor,
        tool.name,
      );
      previewTarget = e.id;
    } catch {}
  }
  const tl = world({ x: 0, y: 0 }),
    br = world({ x: width, y: height });
  for (const e of doc.entities) {
    if (
      e.id === previewTarget ||
      spaceOf(e) !== space ||
      layerOf(e)?.visible === false ||
      e.type === "viewport"
    )
      continue;
    const b = bounds(e);
    if (b.maxX < tl.x || b.minX > br.x || b.maxY < br.y || b.minY > tl.y)
      continue;
    const selected = interactive && selection.has(e.id);
    const color = selected
      ? onPaper
        ? "#137c59"
        : "#95efc4"
      : interactive && hover === e.id
        ? onPaper
          ? "#35836b"
          : "#e3f4d7"
        : e.color || (onPaper ? "#34473f" : layerOf(e).color);
    drawEntity(e, color, selected);
  }
}
function paintLayout() {
  const saved = camera,
    base = paperCamera || camera,
    l = doc.layouts.find((l) => l.id === activeSpace);
  camera = base;
  const a = screen({ x: 0, y: l.height }),
    b = screen({ x: l.width, y: 0 });
  ctx.fillStyle = "#fdfdf9";
  ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
  for (const original of doc.entities.filter(
    (e) =>
      e.type === "viewport" &&
      spaceOf(e) === activeSpace &&
      layerOf(e)?.visible !== false,
  )) {
    const v =
      drag?.kind === "viewportMove" &&
      drag.entity.id === original.id &&
      drag.moved
        ? movedViewport()
        : drag?.kind === "grip" && drag.entity.id === original.id
          ? gripEntity(drag.entity, drag.grip, cursor)
          : original;
    camera = base;
    const a = screen(v.points[0]),
      b = screen(v.points[1]);
    ctx.save();
    ctx.beginPath();
    ctx.rect(
      Math.min(a.x, b.x),
      Math.min(a.y, b.y),
      Math.abs(a.x - b.x),
      Math.abs(a.y - b.y),
    );
    ctx.clip();
    camera =
      activeViewportId === v.id
        ? saved
        : viewportCamera(v, base, width, height);
    paintEntities("model", true, activeViewportId === v.id);
    ctx.restore();
    camera = base;
    drawEntity(
      v,
      activeViewportId === v.id
        ? "#147b60"
        : selection.has(v.id)
          ? "#147b60"
          : "#84978c",
      selection.has(v.id),
    );
  }
  camera = base;
  paintEntities(activeSpace, true, !activeViewportId);
  camera = saved;
}
function rebuild() {
  snapCache = createSnapIndex(doc.entities.filter(visible));
}
function persisted() {
  clearTimeout(savingTimer);
  $("#save-state").textContent = "Sparar…";
  savingTimer = setTimeout(() => {
    try {
      localStorage.setItem("liracad-v1", JSON.stringify(doc));
      $("#save-state").textContent = "Autosparat lokalt";
    } catch {
      $("#save-state").textContent = "Spara projekt till fil";
      log("Lokal autosparning misslyckades. Använd Spara projekt.");
    }
  }, 350);
}
function update() {
  if (
    activeSpace !== "model" &&
    !doc.layouts?.some((l) => l.id === activeSpace)
  ) {
    activeSpace = "model";
    activeViewportId = null;
    paperCamera = null;
  }
  if (
    activeViewportId &&
    !doc.entities.some((e) => e.id === activeViewportId)
  ) {
    activeViewportId = null;
    camera = paperCamera || camera;
    paperCamera = null;
  }
  setCreationMode(drawingSpace() === "model" ? "model" : "paper");
  renderSpaceControls();
  selection = new Set(
    [...selection].filter((id) =>
      doc.entities.some((e) => e.id === id && editable(e)),
    ),
  );
  $("#document-name").textContent = doc.name;
  $("#entity-count").textContent = `${doc.entities.length} objekt · mm`;
  $("#selection-badge").textContent = selection.size;
  $("#undo").disabled = !history.past.length;
  $("#redo").disabled = !history.future.length;
  $("#layer-count").textContent = doc.layers.length;
  renderInspector();
  renderLayers();
  rebuild();
  schedule();
}
function commit(label, fn) {
  const before = clone(doc);
  fn();
  if (history.commit(before, doc, label)) {
    dirty = true;
    persisted();
  }
  update();
}
const creationDefaults = {
  text: { height: 150, rotation: 0, font: "Arial" },
  leader: { height: 120, font: "Arial" },
  hatch: { spacing: 120, patternAngle: Math.PI / 4 },
  dimension: { height: 120, precision: 0 },
};
let creationMode = "model";
const creationPresets = {
  model: clone(creationDefaults),
  paper: {
    text: { height: 2.5, rotation: 0, font: "Arial" },
    leader: { height: 2.5, font: "Arial" },
    hatch: { spacing: 2, patternAngle: Math.PI / 4 },
    dimension: { height: 2.5, precision: 0 },
  },
};
function setCreationMode(mode) {
  if (mode === creationMode) return;
  creationPresets[creationMode] = clone(creationDefaults);
  creationMode = mode;
  Object.assign(creationDefaults, clone(creationPresets[mode]));
}
let creationColor = null;
function make(type, props) {
  return {
    id: uid(),
    type,
    layer: activeLayer,
    space: drawingSpace(),
    ...props,
    color: creationColor,
    ...creationDefaults[type],
  };
}
const advancedNames = new Set([
  "TRIM",
  "EXTEND",
  "JOIN",
  "EXPLODE",
  "PINSERT",
  "PDELETE",
  "FILLET",
  "CHAMFER",
  "DIMCONTINUE",
  "DIMLINEAR",
  "DIMALIGNED",
  "DIMANGULAR",
  "DIMRADIUS",
  "DIMDIAMETER",
  "MVIEW",
]);
let cornerSize = 0,
  chamferSize = 100;
function selectedEntities() {
  return doc.entities.filter((e) => selection.has(e.id) && editable(e));
}
function replaceEntities(originals, replacements, label) {
  const ids = new Set(originals.map((e) => e.id));
  commit(label, () => {
    doc.entities = doc.entities.filter((e) => !ids.has(e.id));
    doc.entities.push(...replacements);
  });
  selection = new Set(replacements.map((e) => e.id));
  tool = null;
  prompt();
  update();
}
function prepareAdvancedSelection() {
  const es = selectedEntities();
  try {
    if (["TRIM", "EXTEND"].includes(tool.name)) {
      const boundaries = (
        es.length ? es : doc.entities.filter(editable)
      ).filter((e) => ["line", "polyline", "arc", "circle"].includes(e.type));
      if (!boundaries.length)
        throw Error(
          "Välj linjer, polylinjer, bågar eller cirklar som gränser.",
        );
      tool.boundaryIds = boundaries.map((e) => e.id);
      tool.phase = "trimPick";
      selection = new Set(tool.boundaryIds);
    }
    if (tool.name === "JOIN") {
      replaceEntities(es, [joinEntities(es)], "Sammanfoga");
      return;
    }
    if (tool.name === "EXPLODE") {
      if (!es.length) throw Error("Välj polylinjer eller mått.");
      replaceEntities(
        es,
        es.flatMap((e) =>
          e.type === "dimension"
            ? dimensionParts(e).map((p) => ({ ...p, id: uid() }))
            : explodePolyline(e),
        ),
        "Dela upp",
      );
      return;
    }
    if (["PINSERT", "PDELETE"].includes(tool.name)) {
      if (es.length !== 1 || es[0].type !== "polyline")
        throw Error("Välj exakt en polylinje.");
      tool.entityId = es[0].id;
      tool.phase = "points";
    }
  } catch (e) {
    log(e.message);
    tool.phase = "select";
  }
  prompt();
  update();
}
function startAdvanced(name) {
  if (!advancedNames.has(name)) return false;
  if (name === "MVIEW" && (activeSpace === "model" || activeViewportId)) {
    log("Skapa viewports i layoutens pappersläge.");
    return true;
  }
  if (
    ((name.startsWith("DIM") && name !== "DIMCONTINUE") || name === "MVIEW") &&
    (doc.layers.find((l) => l.id === activeLayer)?.locked ||
      doc.layers.find((l) => l.id === activeLayer)?.visible === false)
  ) {
    log("Välj ett synligt, olåst lager.");
    return true;
  }
  clearTracking();
  input.value = "";
  lastCommand = name;
  tool = { name, points: [], phase: "points" };
  if (
    ["TRIM", "EXTEND", "JOIN", "EXPLODE", "PINSERT", "PDELETE"].includes(name)
  ) {
    tool.phase = "select";
    if (selection.size && !["TRIM", "EXTEND"].includes(name))
      prepareAdvancedSelection();
  } else if (["FILLET", "CHAMFER"].includes(name)) {
    tool.phase = "cornerSize";
    tool.candidates = selectedEntities().filter((e) => e.type === "line");
    tool.value = name === "FILLET" ? cornerSize : chamferSize;
  } else if (name === "DIMCONTINUE") {
    const es = selectedEntities();
    if (
      es.length === 1 &&
      es[0].type === "dimension" &&
      ["linear", "aligned"].includes(es[0].kind)
    )
      setChainSource(es[0]);
    else {
      selection.clear();
      tool.phase = "chainPick";
    }
  } else if (["DIMRADIUS", "DIMDIAMETER"].includes(name)) {
    const es = selectedEntities();
    if (es.length === 1 && ["circle", "arc"].includes(es[0].type))
      tool.points = [clone(es[0].center), polar(es[0].center, es[0].radius, 0)];
    selection.clear();
  } else selection.clear();
  log(`${name} · Startat.`);
  prompt();
  update();
  return true;
}
function setChainSource(entity, end = 1) {
  tool.source = clone(entity);
  tool.end = end;
  tool.points = [
    clone(entity.points[end === 0 ? 0 : entity.points.length - 2]),
  ];
  tool.phase = "chainPoints";
  selection = new Set([entity.id]);
  clearTracking();
}
function advancedPrompt() {
  if (!tool || !advancedNames.has(tool.name)) return null;
  const n = tool.name,
    p = tool.points.length;
  if (["TRIM", "EXTEND"].includes(n))
    return tool.phase === "select"
      ? "Välj gränser · Enter fortsätter (inga val = alla)"
      : n === "TRIM"
        ? "Klicka delen som ska bort · Enter avslutar"
        : "Klicka nära änden som ska förlängas · Enter avslutar";
  if (n === "DIMCONTINUE")
    return tool.phase === "chainPick"
      ? "Välj en måttkedja eller ett linjärt mått · Enter avslutar"
      : "Lägg till mätpunkt · [Byt ände/Välj mått] · Enter avslutar";
  if (["DIMLINEAR", "DIMALIGNED"].includes(n))
    return tool.phase === "dimensionPlace"
      ? "Placera hela måttlinjen"
      : p
        ? `Ange nästa mätpunkt · ${p} valda · Enter placerar måttlinjen`
        : "Ange första mätpunkten";
  if (tool.phase === "select") return "Välj objekt · Enter fortsätter";
  if (tool.phase === "cornerSize")
    return n === "FILLET"
      ? `Ange radie <${cornerSize}> · 0 ger skarpt hörn`
      : `Ange fasavstånd <${chamferSize}> eller två avstånd: 100,200`;
  if (["FILLET", "CHAMFER"].includes(n))
    return tool.first
      ? "Välj andra linjen på sidan som ska behållas"
      : "Välj första linjen på sidan som ska behållas";
  if (n === "PINSERT") return "Klicka ny hörnpunkt vid önskat segment";
  if (n === "PDELETE") return "Klicka hörnpunkten som ska tas bort";
  if (n === "MVIEW")
    return p
      ? "Ange viewportens motsatta hörn"
      : "Ange viewportens första hörn";
  if (n === "DIMANGULAR")
    return [
      "Ange vinkelns spets",
      "Ange första riktningen",
      "Ange andra riktningen",
      "Placera vinkelmåttet",
    ][p];
  if (["DIMRADIUS", "DIMDIAMETER"].includes(n))
    return p ? "Placera måtttexten" : "Välj cirkel eller båge";
  return [
    "Ange första måttpunkten",
    "Ange andra måttpunkten",
    "Placera måttlinjen",
  ][p];
}
function dimensionEntity(points) {
  const kinds = {
    DIMLINEAR: "linear",
    DIMALIGNED: "aligned",
    DIMANGULAR: "angular",
    DIMRADIUS: "radius",
    DIMDIAMETER: "diameter",
  };
  const kind = kinds[tool.name];
  const e = make("dimension", {
    kind,
    points: clone(points),
    height: drawingSpace() === "model" ? 120 : 2.5,
    precision: 0,
  });
  if (kind === "linear") {
    const [a, b, c] = points;
    e.axis =
      c.y > Math.max(a.y, b.y) || c.y < Math.min(a.y, b.y)
        ? { x: 1, y: 0 }
        : { x: 0, y: 1 };
  }
  return e;
}
function newDimensionChain(placement) {
  const points = tool.points;
  const [a, b] = points;
  const axis =
    tool.name === "DIMALIGNED"
      ? mul(sub(b, a), 1 / dist(a, b))
      : placement.y > Math.max(...points.map((p) => p.y)) ||
          placement.y < Math.min(...points.map((p) => p.y))
        ? { x: 1, y: 0 }
        : { x: 0, y: 1 };
  return dimensionChain(make("dimension", {}), points, placement, axis);
}
function applyCorner(second, pick) {
  try {
    const first = doc.entities.find((e) => e.id === tool.first.id);
    const result = corner(
      first,
      second,
      tool.name,
      tool.value,
      tool.value2 ?? tool.value,
      tool.first.pick,
      pick,
    );
    replaceEntities(
      [first, second],
      [...result.updated, ...(result.bridge ? [result.bridge] : [])],
      tool.name,
    );
  } catch (e) {
    log(e.message);
  }
}
function advancedSubmit(s) {
  if (!tool || !advancedNames.has(tool.name)) return false;
  if (["TRIM", "EXTEND"].includes(tool.name) && tool.phase === "trimPick") {
    if (!s) {
      tool = null;
      selection.clear();
      prompt();
      update();
    } else log("Klicka på objektet i ritytan · Enter avslutar.");
    return true;
  }
  if (["DIMLINEAR", "DIMALIGNED"].includes(tool.name) && !s) {
    if (tool.points.length < 2) log("Välj minst två mätpunkter.");
    else {
      tool.phase = "dimensionPlace";
      clearTracking();
      prompt();
      schedule();
    }
    return true;
  }
  if (tool.name === "DIMCONTINUE") {
    if (!s) {
      tool = null;
      prompt();
      update();
      return true;
    }
    const option = s.toUpperCase();
    if (["V", "VÄLJ"].includes(option)) {
      tool.phase = "chainPick";
      tool.points = [];
      selection.clear();
      clearTracking();
      prompt();
      update();
      return true;
    }
    if (["B", "BYT"].includes(option) && tool.phase === "chainPoints") {
      setChainSource(tool.source, 1 - tool.end);
      prompt();
      update();
      return true;
    }
    if (tool.phase === "chainPick") {
      log("Klicka på ett linjärt eller riktat mått.");
      return true;
    }
    return false;
  }
  if (tool.phase === "select") {
    if (s) log("Markera objekt och tryck Enter.");
    else prepareAdvancedSelection();
    return true;
  }
  if (tool.phase === "cornerSize") {
    const values = s ? s.split(",").map(number) : [tool.value];
    if (
      values.length > 2 ||
      values.some((v) => v === null || v < 0) ||
      (tool.name === "FILLET" && values.length !== 1)
    ) {
      log("Ange giltiga positiva mått eller 0.");
      return true;
    }
    tool.value = values[0];
    tool.value2 = values[1] ?? values[0];
    if (tool.name === "FILLET") cornerSize = tool.value;
    else chamferSize = tool.value;
    tool.phase = "cornerPick";
    if (tool.candidates.length === 2) {
      tool.first = { id: tool.candidates[0].id };
      applyCorner(tool.candidates[1]);
    }
    prompt();
    return true;
  }
  return false;
}
function advancedPoint(p) {
  if (!tool || !advancedNames.has(tool.name)) return false;
  const n = tool.name;
  if (["TRIM", "EXTEND"].includes(n)) {
    const e = hit(rawCursor);
    try {
      const replacements = trimExtend(
        e,
        doc.entities.filter(
          (x) => tool.boundaryIds.includes(x.id) && editable(x),
        ),
        rawCursor,
        n,
      );
      commit(n === "TRIM" ? "Trimma" : "Förläng", () => {
        const index = doc.entities.findIndex((x) => x.id === e.id);
        doc.entities.splice(index, 1, ...replacements);
        if (tool.boundaryIds.includes(e.id)) {
          tool.boundaryIds = tool.boundaryIds
            .filter((id) => id !== e.id)
            .concat(replacements.map((x) => x.id));
          selection = new Set(tool.boundaryIds);
        }
      });
      update();
    } catch (error) {
      log(error.message);
    }
    prompt();
    return true;
  }
  if (n === "DIMCONTINUE") {
    if (tool.phase === "chainPick") {
      const e = hit(rawCursor);
      if (
        !e ||
        e.type !== "dimension" ||
        !["linear", "aligned"].includes(e.kind)
      ) {
        log("Välj ett linjärt eller riktat mått.");
        return true;
      }
      setChainSource(
        e,
        dist(rawCursor, e.points[0]) < dist(rawCursor, e.points[1]) ? 0 : 1,
      );
    } else {
      try {
        const entity = {
          ...extendDimensionChain(tool.source, p),
          id: tool.source.id,
        };
        const layer = doc.layers.find((l) => l.id === entity.layer);
        if (!layer || layer.locked || layer.visible === false)
          throw Error("Måttets lager måste vara synligt och olåst.");
        commit("Lägg till måttpunkt", () => {
          doc.entities = doc.entities.map((e) =>
            e.id === entity.id ? entity : e,
          );
        });
        setChainSource(entity);
      } catch (error) {
        log(error.message);
      }
    }
    prompt();
    update();
    return true;
  }
  if (tool.phase === "cornerSize") return true;
  if (["FILLET", "CHAMFER"].includes(n)) {
    const e = hit(rawCursor);
    if (!e || e.type !== "line") {
      log("Välj en rak linje.");
      return true;
    }
    if (!tool.first) tool.first = { id: e.id, pick: clone(p) };
    else applyCorner(e, p);
    prompt();
    return true;
  }
  if (["PINSERT", "PDELETE"].includes(n)) {
    const e = doc.entities.find((e) => e.id === tool.entityId);
    try {
      replaceEntities(
        [e],
        [n === "PINSERT" ? insertVertex(e, p) : removeVertex(e, p)],
        "Ändra polylinje",
      );
    } catch (error) {
      log(error.message);
    }
    return true;
  }
  if (n === "MVIEW") {
    if (!tool.points.length) tool.points.push(p);
    else if (
      Math.abs(p.x - tool.points[0].x) > 1 &&
      Math.abs(p.y - tool.points[0].y) > 1
    ) {
      const viewport = make("viewport", {
        points: [tool.points[0], p],
        viewCenter: modelExtentsCenter(),
        viewScale: 1 / 100,
        locked: true,
      });
      addEntities([viewport], "Viewport");
      tool = null;
      selection = new Set([viewport.id]);
      update();
    }
    prompt();
    return true;
  }
  if (["DIMLINEAR", "DIMALIGNED"].includes(n)) {
    if (tool.phase !== "dimensionPlace") {
      if (tool.points.some((q) => dist(q, p) < 1e-8)) {
        log("Mätpunkten är redan vald.");
        return true;
      }
      tool.points.push(clone(p));
    } else {
      try {
        const entity = newDimensionChain(p);
        addEntities([entity], "Måttkedja");
        tool = null;
        selection = new Set([entity.id]);
        update();
      } catch (error) {
        log(error.message);
      }
    }
    prompt();
    schedule();
    return true;
  }
  if (n.startsWith("DIM")) {
    if (["DIMRADIUS", "DIMDIAMETER"].includes(n) && !tool.points.length) {
      const e = hit(rawCursor);
      if (!e || !["circle", "arc"].includes(e.type)) {
        log("Välj cirkel eller båge.");
        return true;
      }
      tool.points = [
        clone(e.center),
        polar(e.center, e.radius, angle(e.center, p)),
      ];
      prompt();
      return true;
    }
    if (tool.points.length && dist(tool.points.at(-1), p) < 1e-8) {
      log("Välj en annan punkt.");
      return true;
    }
    tool.points.push(clone(p));
    const count = n === "DIMANGULAR" ? 4 : 3;
    if (tool.points.length === count) {
      const entity = dimensionEntity(tool.points);
      if (
        n === "DIMANGULAR" &&
        Math.abs(
          Math.sin(
            angle(tool.points[0], tool.points[1]) -
              angle(tool.points[0], tool.points[2]),
          ),
        ) < 1e-8
      ) {
        tool.points.pop();
        log("Välj olika vinkelriktningar.");
        return true;
      }
      addEntities([entity], "Måttsättning");
      tool = null;
      selection = new Set([entity.id]);
      update();
    }
    prompt();
    return true;
  }
  return false;
}
function advancedPreview() {
  if (!tool || !advancedNames.has(tool.name)) return null;
  if (["TRIM", "EXTEND"].includes(tool.name)) {
    if (tool.phase !== "trimPick") return null;
    try {
      return trimExtend(
        hit(rawCursor),
        doc.entities.filter(
          (e) => tool.boundaryIds.includes(e.id) && editable(e),
        ),
        rawCursor,
        tool.name,
      );
    } catch {
      return null;
    }
  }
  if (["DIMLINEAR", "DIMALIGNED"].includes(tool.name)) {
    if (tool.phase === "dimensionPlace") {
      try {
        return [newDimensionChain(cursor)];
      } catch {
        return null;
      }
    }
    return tool.points.length
      ? [
          {
            type: "polyline",
            points: [...tool.points, cursor],
            closed: false,
            layer: activeLayer,
          },
        ]
      : null;
  }
  if (tool.name === "DIMCONTINUE") {
    if (tool.phase !== "chainPoints") return null;
    try {
      return [extendDimensionChain(tool.source, cursor)];
    } catch {
      return null;
    }
  }
  if (tool.name === "MVIEW" && tool.points.length)
    return [
      {
        type: "polyline",
        points: rectangle(tool.points[0], cursor),
        closed: true,
        layer: activeLayer,
      },
    ];
  if (
    tool.name.startsWith("DIM") &&
    tool.points.length === (tool.name === "DIMANGULAR" ? 3 : 2)
  )
    return [dimensionEntity([...tool.points, cursor])];
  if (["FILLET", "CHAMFER"].includes(tool.name) && tool.first) {
    const first = doc.entities.find((e) => e.id === tool.first.id),
      second = hit(rawCursor);
    if (second && second.type === "line" && first.id !== second.id)
      try {
        const r = corner(
          first,
          second,
          tool.name,
          tool.value,
          tool.value2,
          tool.first.pick,
          cursor,
        );
        return [...r.updated, ...(r.bridge ? [r.bridge] : [])];
      } catch {}
  }
  return [];
}
function addEntities(es, label) {
  commit(label, () => doc.entities.push(...es));
}
function undo(redo = false) {
  cancel(false);
  const d = redo ? history.redo() : history.undo();
  if (d) {
    doc = d;
    if (!doc.layers.some((l) => l.id === activeLayer))
      activeLayer = doc.layers[0].id;
    selection.clear();
    persisted();
    update();
    log(redo ? "Gör om." : "Ångrat.");
  }
}
function fit() {
  if (
    activeViewportId &&
    doc.entities.find((e) => e.id === activeViewportId)?.locked
  ) {
    log("Lås upp viewporten för att ändra vyn.");
    return;
  }
  if (activeSpace !== "model" && !activeViewportId) {
    const l = doc.layouts.find((l) => l.id === activeSpace);
    camera = {
      x: l.width / 2,
      y: l.height / 2,
      scale: Math.max(
        0.01,
        Math.min((width - 50) / l.width, (height - 50) / l.height),
      ),
    };
    schedule();
    return;
  }
  const es = doc.entities.filter(visible);
  if (!es.length) {
    camera = { x: 0, y: 0, scale: 0.1 };
    schedule();
    return;
  }
  const bs = es.map(bounds),
    r = {
      minX: Math.min(...bs.map((b) => b.minX)),
      maxX: Math.max(...bs.map((b) => b.maxX)),
      minY: Math.min(...bs.map((b) => b.minY)),
      maxY: Math.max(...bs.map((b) => b.maxY)),
    };
  camera = {
    x: (r.minX + r.maxX) / 2,
    y: (r.minY + r.maxY) / 2,
    scale: Math.min(
      (width - 145) / Math.max(r.maxX - r.minX, 500),
      (height - 90) / Math.max(r.maxY - r.minY, 500),
    ),
  };
  camera.scale = Math.max(0.000001, camera.scale);
  schedule();
}
function resize() {
  syncViewport();
  const r = canvas.getBoundingClientRect();
  width = r.width;
  height = r.height;
  if (activeViewportId) {
    const v = doc.entities.find((e) => e.id === activeViewportId);
    if (v) camera = viewportCamera(v, paperCamera, width, height);
  }
  if (inlineEdit) positionTextEditor();
  dpr = devicePixelRatio || 1;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  schedule();
}
new ResizeObserver(resize).observe(canvas);
function path(points, close = false) {
  ctx.beginPath();
  points.forEach((p, i) => {
    const s = screen(p);
    i ? ctx.lineTo(s.x, s.y) : ctx.moveTo(s.x, s.y);
  });
  if (close) ctx.closePath();
}
function drawEntity(e, color, selected = false, preview = false) {
  if (e.type === "dimension") {
    for (const part of dimensionParts(e))
      drawEntity(part, color, selected, preview);
    return;
  }
  if (e.type === "viewport") {
    drawEntity(
      { ...e, type: "polyline", points: pointsOf(e), closed: true },
      color,
      selected,
      preview,
    );
    return;
  }
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = selected ? 1.8 : 1.15;
  ctx.setLineDash(preview ? [6, 4] : []);
  if (e.type === "circle" || e.type === "arc") {
    const c = screen(e.center);
    ctx.beginPath();
    ctx.arc(
      c.x,
      c.y,
      e.radius * camera.scale,
      e.type === "arc" ? -e.start : 0,
      e.type === "arc" ? -(e.start + e.sweep) : TAU,
      e.type === "arc" && e.sweep > 0,
    );
    ctx.stroke();
  } else if (e.type === "text") {
    const p = screen(e.point);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(-(e.rotation || 0));
    const size = e.height * camera.scale;
    ctx.font = `${e.italic ? "italic " : ""}${e.bold ? "bold " : ""}${size}px "${textFont(e)}"`;
    textLines(e.text).forEach((line, i) => {
      const y = i * size * 1.4;
      ctx.fillText(line, 0, y);
      if (e.underline) {
        ctx.beginPath();
        ctx.lineWidth = Math.max(1, size / 16);
        ctx.moveTo(0, y + size * 0.15);
        ctx.lineTo(ctx.measureText(line).width, y + size * 0.15);
        ctx.stroke();
      }
    });
    ctx.restore();
  } else {
    path(e.points, e.closed || e.type === "hatch");
    if (e.type === "hatch") {
      ctx.save();
      ctx.globalAlpha = 0.075;
      ctx.fill();
      ctx.restore();
      ctx.save();
      ctx.clip();
      const b = bounds(e),
        a = screen({ x: b.minX, y: b.maxY }),
        z = screen({ x: b.maxX, y: b.minY }),
        step = Math.max(5, e.spacing * camera.scale),
        extent = Math.hypot(z.x - a.x, z.y - a.y);
      ctx.translate((a.x + z.x) / 2, (a.y + z.y) / 2);
      ctx.rotate(-(e.patternAngle ?? Math.PI / 4));
      ctx.globalAlpha = 0.6;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      for (let y = -extent; y < extent; y += step) {
        ctx.moveTo(-extent, y);
        ctx.lineTo(extent, y);
      }
      ctx.stroke();
      ctx.restore();
      path(e.points, true);
      ctx.stroke();
    } else ctx.stroke();
    if (e.type === "leader") {
      const a = screen(e.points[0]),
        b = screen(e.points[1]),
        ang = Math.atan2(b.y - a.y, b.x - a.x),
        size = Math.max(
          2,
          Math.min(14, (e.height || 120) * 0.75 * camera.scale),
        );
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(
        a.x + size * Math.cos(ang - 0.32),
        a.y + size * Math.sin(ang - 0.32),
      );
      ctx.lineTo(
        a.x + size * Math.cos(ang + 0.32),
        a.y + size * Math.sin(ang + 0.32),
      );
      ctx.closePath();
      ctx.fill();
      if (e.text)
        drawEntity(
          {
            ...e,
            type: "text",
            point: add(e.points.at(-1), {
              x: (e.height || 120) / 3,
              y: ((e.height || 120) * 7) / 24,
            }),
            text: e.text,
            height: e.height || 120,
          },
          color,
          false,
          preview,
        );
    }
  }
  ctx.setLineDash([]);
}
function gridStep() {
  const target = 65 / camera.scale,
    pow = 10 ** Math.floor(Math.log10(target));
  return [1, 2, 5, 10].map((n) => n * pow).find((n) => n >= target) || pow * 10;
}
function render() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = activeSpace === "model" ? "#17292e" : "#dce1e3";
  ctx.fillRect(0, 0, width, height);
  const step = gridStep(),
    tl = world({ x: 0, y: 0 }),
    br = world({ x: width, y: height });
  if (showGrid) {
    ctx.fillStyle = "#2e474a";
    for (let x = Math.ceil(tl.x / step) * step; x < br.x; x += step)
      for (let y = Math.ceil(br.y / step) * step; y < tl.y; y += step) {
        const p = screen({ x, y });
        ctx.fillRect(p.x, p.y, 1, 1);
      }
  }
  if (activeSpace === "model") paintEntities("model");
  else paintLayout();
  ctx.save();
  if (activeViewportId) {
    const r = activeClip();
    if (r) {
      ctx.beginPath();
      ctx.rect(r.x, r.y, r.w, r.h);
      ctx.clip();
    }
  }
  if (!tool) {
    for (const e of doc.entities.filter(
      (e) => selection.has(e.id) && editable(e),
    ))
      for (const g of grips(e)) {
        const p = screen(
          drag?.kind === "viewportMove" && drag.entity.id === e.id && drag.moved
            ? movedViewport().points[g.i]
            : g.p,
        );
        ctx.fillStyle = "#17292e";
        ctx.strokeStyle = "#8ee8b8";
        ctx.lineWidth = 1;
        ctx.fillRect(p.x - 3, p.y - 3, 6, 6);
        ctx.strokeRect(p.x - 3, p.y - 3, 6, 6);
      }
  }
  for (const e of previewEntities()) drawEntity(e, "#8ae4b6", false, true);
  if (drag?.kind === "grip") {
    drawEntity(
      gripEntity(drag.entity, drag.grip, cursor),
      "#a0f3c7",
      true,
      true,
    );
  }
  if (drag?.kind === "select" && drag.moved) {
    const a = drag.start,
      b = mouse,
      cross = b.x < a.x;
    ctx.fillStyle = cross ? "#54c69419" : "#68bfff19";
    ctx.strokeStyle = cross ? "#70cfa4" : "#7ebddd";
    ctx.lineWidth = 1;
    ctx.setLineDash(cross ? [5, 3] : []);
    ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
    ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
    ctx.setLineDash([]);
  }
  if (tool?.points?.length) {
    ctx.lineWidth = 0.8;
    ctx.strokeStyle = "#8db7a980";
    ctx.setLineDash([3, 4]);
    if (
      transforms.includes(tool.name) ||
      ["CIRCLE", "DIST"].includes(tool.name)
    ) {
      path([tool.points[0], cursor]);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }
  const lightSurface = activeSpace !== "model";
  const snapColor = lightSurface ? "#0057b8" : "#ffe66b";
  const snapOutline = lightSurface ? "#ffffff" : "#102026";
  for (const anchor of trackAnchors) {
    const p = screen(anchor);
    ctx.strokeStyle = snapOutline;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(p.x - 5, p.y);
    ctx.lineTo(p.x + 5, p.y);
    ctx.moveTo(p.x, p.y - 5);
    ctx.lineTo(p.x, p.y + 5);
    ctx.stroke();
    ctx.strokeStyle = snapColor;
    ctx.lineWidth = 1.8;
    ctx.stroke();
  }
  if (snap?.guides?.length) {
    ctx.strokeStyle = lightSurface
      ? snap.mode === "track"
        ? "#0057b8"
        : "#007454"
      : snap.mode === "track"
        ? "#ffe66b"
        : "#67cda9";
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    for (const guide of snap.guides) {
      path([guide.a, guide.b]);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }
  if (snap) {
    const p = screen(snap.p);
    ctx.strokeStyle = snapOutline;
    ctx.lineWidth = 5;
    ctx.strokeRect(p.x - 6, p.y - 6, 12, 12);
    ctx.strokeStyle = snapColor;
    ctx.lineWidth = 2;
    ctx.strokeRect(p.x - 6, p.y - 6, 12, 12);
  }
  if (
    tool &&
    tool.phase !== "select" &&
    mouse.x > 0 &&
    mouse.x < width &&
    mouse.y > 0 &&
    mouse.y < height
  ) {
    const p = screen(cursor);
    ctx.strokeStyle = lightSurface ? "#34566e" : "#badac3";
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(p.x - 17, p.y);
    ctx.lineTo(p.x - 5, p.y);
    ctx.moveTo(p.x + 5, p.y);
    ctx.lineTo(p.x + 17, p.y);
    ctx.moveTo(p.x, p.y - 17);
    ctx.lineTo(p.x, p.y - 5);
    ctx.moveTo(p.x, p.y + 5);
    ctx.lineTo(p.x, p.y + 17);
    ctx.stroke();
  }

  ctx.restore();
  $("#zoom-level").textContent = `${Math.round(camera.scale * 1000)}%`;
}
function previewEntities() {
  if (!tool || tool.phase === "select" || tool.phase === "text") return [];
  const extra = advancedPreview();
  if (extra) return extra;
  const p = tool.points || [],
    q = cursor,
    n = tool.name,
    layer = activeLayer;
  if (n === "LINE" && p.length)
    return [{ type: "line", points: [p.at(-1), q], layer }];
  if (["PLINE", "HATCH"].includes(n) && p.length)
    return [
      {
        type: "polyline",
        points: [...p, q],
        closed: n === "HATCH" && p.length > 1,
        layer,
      },
    ];
  if (n === "RECTANG" && p.length)
    return [
      { type: "polyline", points: rectangle(p[0], q), closed: true, layer },
    ];
  if (n === "CIRCLE" && p.length)
    return [{ type: "circle", center: p[0], radius: dist(p[0], q), layer }];
  if (n === "ARC" && p.length === 2) {
    const a = arcThrough(p[0], p[1], q);
    return a ? [{ type: "arc", ...a, layer }] : [];
  }
  if (n === "ARC" && p.length === 1)
    return [{ type: "line", points: [p[0], q], layer }];
  if (n === "LEADER" && p.length)
    return [
      { type: "leader", points: [...p, q], text: "", height: 120, layer },
    ];
  if (transforms.includes(n) && p.length) {
    let val = n === "SCALE" ? Math.max(0.001, dist(p[0], q) / 1000) : undefined;
    return doc.entities
      .filter((e) => selection.has(e.id))
      .map((e) => transformed(e, n, p[0], q, val));
  }
  if (n === "OFFSET" && tool.phase === "distance" && p.length)
    return [{ type: "line", points: [p[0], q], layer }];
  if (n === "OFFSET" && tool.phase === "side") {
    return doc.entities
      .filter((e) => selection.has(e.id))
      .map((e) => offset(e, tool.value, q))
      .filter(Boolean);
  }
  return [];
}
const rectangle = (a, b) => [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }];
function prompt() {
  if (!tool) {
    clearTracking();
    snap = null;
    $("#snap-feedback").textContent = "";
  }
  let s = "";
  if (tool) {
    const n = tool.name,
      p = tool.points.length;
    if (tool.phase === "select") s = "Välj objekt · Enter fortsätter";
    else if (tool.phase === "text") s = "Skriv text och tryck Enter";
    else if (n === "LINE" || n === "PLINE")
      s = p
        ? "Nästa punkt eller längd · Enter avslutar"
        : "Ange första punkten";
    else if (n === "RECTANG")
      s = p ? "Ange motsatt hörn" : "Ange första hörnet";
    else if (n === "CIRCLE") s = p ? "Ange radie eller klicka" : "Ange centrum";
    else if (n === "ARC")
      s = [
        "Ange bågens startpunkt",
        "Ange en punkt på bågen",
        "Ange bågens slutpunkt",
      ][p];
    else if (n === "TEXT") s = "Ange textens insättningspunkt";
    else if (n === "LEADER")
      s = ["Ange pilspets", "Ange brytpunkt", "Ange textplacering"][p];
    else if (n === "HATCH")
      s = p
        ? "Nästa hörn · Enter sluter ytan"
        : "Ange första hörnet för skraffering";
    else if (n === "MOVE" || n === "COPY")
      s = p ? "Ange målpunkt eller avstånd" : "Ange baspunkt";
    else if (n === "ROTATE")
      s = p
        ? "Ange vinkel i grader eller klicka riktning"
        : "Ange rotationscentrum";
    else if (n === "SCALE")
      s = p
        ? "Ange skalfaktor · mus: 1 000 mm = 1×"
        : "Ange skalningens baspunkt";
    else if (n === "MIRROR")
      s = p
        ? "Ange spegelaxelns andra punkt"
        : "Ange spegelaxelns första punkt";
    else if (n === "OFFSET")
      s =
        tool.phase === "distance"
          ? p
            ? "Ange mätningens slutpunkt eller skriv avstånd"
            : "Ange avstånd i mm eller mätningens startpunkt"
          : "Klicka på sidan för kopian";
    else if (n === "DIST")
      s = p ? "Ange mätningens slutpunkt" : "Ange mätningens startpunkt";
    else if (n === "PAN") s = "Dra för att panorera · Esc avslutar";
  }

  s = advancedPrompt() || s;
  $("#command-label").textContent = tool ? tool.name : "Kommando";
  input.placeholder = s || "Skriv ett kommando…";
  $("#status-mode").textContent = tool
    ? definitions.find((d) => d[0] === tool.name)?.[1] || tool.name
    : "Redo";
  $$("[data-command]").forEach((b) => {
    b.classList.toggle("active", b.dataset.command === tool?.name);
    b.classList.toggle(
      "selected",
      b.dataset.command === (tool?.name || "SELECT"),
    );
  });
  canvas.style.cursor = tool?.name === "PAN" ? "grab" : "crosshair";
  renderInspector();
  schedule();
}
function cancel(clear = true) {
  canvas.style.cursor = "crosshair";
  clearTracking();
  tool = null;
  snap = null;
  drag = null;
  input.value = "";
  $("#suggestions").hidden = true;
  if (clear) selection.clear();
  prompt();
  update();
}
function start(name) {
  if (inlineEdit) finishTextEdit(true);
  name = aliases[name.toUpperCase()] || name.toUpperCase();
  if (["MT", "MTEXT"].includes(name)) name = "TEXT";
  if (name === "MODEL") {
    switchSpace("model");
    return;
  }
  if (name === "PSPACE") {
    leaveViewport();
    return;
  }
  if (name === "SELECT") {
    cancel();
    return;
  }
  if (name === "ZOOM") {
    fit();
    return;
  }
  if (name === "UNDO" || name === "REDO") {
    undo(name === "REDO");
    return;
  }
  if (name === "SAVE") {
    saveProject();
    return;
  }
  if (name === "DXF") {
    exportDxf();
    return;
  }
  if (name === "HELP") {
    $("#help-dialog").showModal();
    return;
  }
  if (
    !definitions.some((d) => d[0] === name) &&
    !["DIST", "PAN"].includes(name)
  ) {
    log(`Okänt kommando: ${name}`);
    return;
  }
  if (startAdvanced(name)) return;
  clearTracking();
  tool = { name, points: [], phase: "points" };
  lastCommand = name;
  input.value = "";
  $("#suggestions").hidden = true;
  const edit = transforms.includes(name) || ["ERASE", "OFFSET"].includes(name);
  if (edit) {
    selection = new Set(
      [...selection].filter((id) =>
        doc.entities.some((e) => e.id === id && editable(e)),
      ),
    );
    if (!selection.size) tool.phase = "select";
    else if (name === "ERASE") {
      erase();
      return;
    } else if (name === "OFFSET") {
      if (!offsetSelection()) return;
      tool.phase = "distance";
    }
  } else if (!["PAN", "DIST"].includes(name)) {
    if (
      doc.layers.find((l) => l.id === activeLayer)?.locked ||
      doc.layers.find((l) => l.id === activeLayer)?.visible === false
    ) {
      log("Aktivt lager är låst eller dolt. Välj ett synligt, olåst lager.");
      tool = null;
      prompt();
      return;
    }
    selection.clear();
  }
  log(`${name} · ${tool.phase === "select" ? "Välj objekt." : "Startat."}`);
  prompt();
  renderInspector();
  $("#selection-badge").textContent = selection.size;
}
function offsetSelection() {
  const es = doc.entities.filter((e) => selection.has(e.id));
  if (
    !es.length ||
    !es.every((e) => ["line", "circle", "arc", "polyline"].includes(e.type))
  ) {
    log("OFFSET: välj en eller flera linjer, polylinjer, cirklar eller bågar.");
    tool.phase = "select";
    prompt();
    return false;
  }
  return true;
}
function erase() {
  if (!selection.size) {
    start("ERASE");
    return;
  }
  const n = selection.size;
  commit(
    "Radera",
    () => (doc.entities = doc.entities.filter((e) => !selection.has(e.id))),
  );
  cancel();
  log(`${n} objekt raderade.`);
}
function finishTransform(target, value) {
  const n = tool.name,
    b = tool.points[0];
  if (
    ["ROTATE", "MIRROR"].includes(n) &&
    selectedEntities().some((e) => e.type === "viewport")
  ) {
    log(
      "Rektangulära viewports kan flyttas och skalas, men inte roteras eller speglas.",
    );
    return;
  }
  if (n === "MIRROR" && dist(b, target) < 1e-7) {
    log("Spegelaxeln behöver två olika punkter.");
    return;
  }
  if (n === "SCALE" && !(value > 0)) {
    log("Skalfaktorn måste vara större än 0.");
    return;
  }
  let ids = [];
  commit(n, () => {
    const edited = doc.entities
      .filter((e) => selection.has(e.id))
      .map((e) => {
        const t = transformed(e, n, b, target, value);
        if (n === "COPY") t.id = uid();
        ids.push(t.id);
        return t;
      });
    doc.entities =
      n === "COPY"
        ? [...doc.entities, ...edited]
        : doc.entities.map((e) => edited.find((t) => t.id === e.id) || e);
  });
  selection = new Set(ids);
  tool = null;
  prompt();
  update();
  log(`${n} · ${ids.length} objekt.`);
}
function acceptPoint(p) {
  if (!tool) return;
  const n = tool.name,
    ps = tool.points;
  if (
    tool.phase === "select" ||
    tool.phase === "text" ||
    (tool.phase === "distance" && n !== "OFFSET")
  )
    return;
  if (advancedPoint(p)) return;
  if (transforms.includes(n)) {
    if (!ps.length) ps.push(p);
    else {
      finishTransform(
        p,
        n === "ROTATE"
          ? angle(ps[0], p)
          : n === "SCALE"
            ? dist(ps[0], p) / 1000
            : undefined,
      );
      return;
    }
  } else if (n === "LINE") {
    if (ps.length) {
      if (dist(ps.at(-1), p) < 1e-8) return;
      addEntities([make("line", { points: [ps.at(-1), p] })], "Linje");
    }
    ps.push(p);
  } else if (n === "PLINE" || n === "HATCH") {
    if (!ps.length || dist(ps.at(-1), p) > 1e-8) ps.push(p);
  } else if (n === "RECTANG") {
    if (!ps.length) ps.push(p);
    else if (Math.abs(p.x - ps[0].x) > 1e-8 && Math.abs(p.y - ps[0].y) > 1e-8) {
      addEntities(
        [make("polyline", { points: rectangle(ps[0], p), closed: true })],
        "Rektangel",
      );
      tool = null;
    }
  } else if (n === "CIRCLE") {
    if (!ps.length) ps.push(p);
    else {
      const r = dist(ps[0], p);
      if (r < 1e-8) return;
      addEntities([make("circle", { center: ps[0], radius: r })], "Cirkel");
      tool = null;
    }
  } else if (n === "ARC") {
    if (ps.length < 2) ps.push(p);
    else {
      const a = arcThrough(ps[0], ps[1], p);
      if (!a) {
        log("Punkterna ligger på en rät linje. Välj en annan slutpunkt.");
        return;
      }
      addEntities([make("arc", a)], "Båge");
      tool = null;
    }
  } else if (n === "TEXT") {
    const entity = make("text", {
      point: p,
      text: "",
      height: 150,
      rotation: 0,
    });
    tool = null;
    beginTextEdit(entity, true);
  } else if (n === "LEADER") {
    ps.push(p);
    if (ps.length === 3) {
      tool.phase = "text";
      input.focus();
    }
  } else if (n === "OFFSET") {
    if (tool.phase === "distance") {
      if (!ps.length) ps.push({ ...p });
      else {
        const measured = dist(ps[0], p);
        if (measured < 1e-8) {
          log("Mätpunkterna måste vara olika.");
          return;
        }
        tool.value = measured;
        tool.points = [];
        tool.phase = "side";
        clearTracking();
        log(`Offsetavstånd: ${fmt(measured)} mm · välj sida.`);
      }
      prompt();
      return;
    }
    const es = doc.entities.filter((e) => selection.has(e.id));
    const d = tool.value;
    const copies = es.map((e) => offset(e, d, p));
    if (copies.some((e) => !e)) {
      log(
        "Avståndet är för stort inåt. Välj utsidan eller ett mindre avstånd.",
      );
      return;
    }
    addEntities(copies, "Offset");
    selection = new Set(copies.map((e) => e.id));
    tool = null;
    update();
  } else if (n === "DIST") {
    if (!ps.length) ps.push(p);
    else {
      log(
        `Avstånd ${fmt(dist(ps[0], p))} mm · ΔX ${fmt(p.x - ps[0].x)} · ΔY ${fmt(p.y - ps[0].y)}`,
      );
      tool = null;
    }
  }
  prompt();
}
function submit(value) {
  const s = value.trim();
  if (s) {
    commandHistory.push(s);
    historyCursor = commandHistory.length;
  }
  input.value = "";
  $("#suggestions").hidden = true;
  if (!tool) {
    if (s) start(s);
    else start(lastCommand);
    return;
  }
  if (advancedSubmit(s)) return;
  if (tool.phase === "text") {
    if (!s) {
      log("Ange en text.");
      return;
    }
    addEntities(
      [
        tool.name === "TEXT"
          ? make("text", {
              point: tool.points[0],
              text: s,
              height: 150,
              rotation: 0,
            })
          : make("leader", { points: tool.points, text: s, height: 120 }),
      ],
      tool.name,
    );
    tool = null;
    prompt();
    return;
  }
  if (tool.phase === "select") {
    if (s) {
      log("Välj objekt i ritytan och tryck Enter.");
      return;
    }
    if (!selection.size) {
      log("Inga objekt valda.");
      return;
    }
    if (tool.name === "ERASE") {
      erase();
      return;
    }
    if (tool.name === "OFFSET") {
      if (!offsetSelection()) return;
      tool.phase = "distance";
    } else tool.phase = "points";
    prompt();
    return;
  }
  if (!s) {
    if (["PLINE", "HATCH"].includes(tool.name)) {
      const min = tool.name === "HATCH" ? 3 : 2;
      if (tool.points.length < min) {
        log(`Ange minst ${min} punkter.`);
        return;
      }
      addEntities(
        [
          make(tool.name === "HATCH" ? "hatch" : "polyline", {
            points: tool.points,
            closed: tool.name === "HATCH",
            spacing: 120,
          }),
        ],
        tool.name,
      );
    } else if (!["LINE", "PAN"].includes(tool.name)) {
      log("Ange ett värde eller en punkt.");
      return;
    }
    tool = null;
    prompt();
    return;
  }
  if (tool.phase === "distance") {
    const n = number(s);
    if (n === null || n <= 0) {
      log("Ange ett positivt avstånd.");
      return;
    }
    tool.value = n;
    tool.points = [];
    clearTracking();
    tool.phase = "side";
    prompt();
    return;
  }
  if (tool.points.length && ["ROTATE", "SCALE"].includes(tool.name)) {
    const n = number(s);
    if (n === null) {
      log("Ange ett giltigt tal.");
      return;
    }
    finishTransform(cursor, tool.name === "ROTATE" ? (n * Math.PI) / 180 : n);
    return;
  }
  if (tool.name === "CIRCLE" && tool.points.length) {
    const n = number(s);
    if (n !== null) {
      if (n <= 0) {
        log("Radien måste vara positiv.");
        return;
      }
      acceptPoint(add(tool.points[0], { x: n, y: 0 }));
      return;
    }
  }
  if (["PLINE", "HATCH"].includes(tool.name) && s.toUpperCase() === "C") {
    if (tool.points.length < 3) {
      log("Minst tre punkter krävs.");
      return;
    }
    addEntities(
      [
        make(tool.name === "HATCH" ? "hatch" : "polyline", {
          points: tool.points,
          closed: true,
          spacing: 120,
        }),
      ],
      tool.name,
    );
    tool = null;
    prompt();
    return;
  }
  const p = parsePoint(s, tool.points.at(-1), cursor);
  if (p) acceptPoint(p);
  else
    log(
      "Ogiltig inmatning. Punkt: 100,200 · relativt: @100,50 · polärt: @500<45.",
    );
}
function hit(p) {
  let best = null,
    d = 8 / camera.scale;
  for (const e of doc.entities) {
    if (!editable(e)) continue;
    const b = bounds(e);
    if (
      p.x < b.minX - d ||
      p.x > b.maxX + d ||
      p.y < b.minY - d ||
      p.y > b.maxY + d
    )
      continue;
    const h = hitDistance(e, p);
    if (h <= d) {
      best = e;
      d = h;
    }
  }
  return best;
}
const trackState = new TrackingReferences();
function clearTracking() {
  trackState.clear();
  trackAnchors = [];
}
function acquireTrack(candidate) {
  if (!tracking || !osnap) {
    clearTracking();
    return;
  }
  const result = drag?.kind === "pan" ? null : candidate;
  const changed = trackState.update({
    candidate: result?.mode === "object" ? result.p : null,
    contacts: result?.guides?.map((g) => g.a) || [],
    now: performance.now(),
  });
  trackAnchors = trackState.points;
  if (changed) schedule();
}
// Expire references even when the pointer stops moving or leaves the viewport.
setInterval(() => {
  if (trackState.pending || trackAnchors.length) {
    resolveCursor();
    schedule();
  }
}, 100);
function resolveCursor() {
  cursor = rawCursor;
  snap = null;
  const active =
    tool?.phase === "points" ||
    (tool?.name === "OFFSET" && tool.phase === "distance") ||
    drag?.kind === "grip";
  const base = drag?.kind === "grip" ? drag.grip.p : tool?.points.at(-1);
  if (
    active &&
    drag?.kind !== "pan" &&
    mouse.x >= 0 &&
    mouse.y >= 0 &&
    mouse.x <= width &&
    mouse.y <= height
  ) {
    const tolerance = 11 / camera.scale;
    // All original geometry is eligible, including the current selection.
    // Preview geometry is never inserted in this index.
    let candidates = osnap ? nearbySnaps(snapCache, rawCursor, tolerance) : [];
    if (osnap && activeSpace !== "model" && !activeViewportId) {
      const paper = paperSnaps(
        doc.layouts.find((l) => l.id === activeSpace),
        rawCursor,
        tolerance,
      );
      // Continuous edge snaps must not steal nearby object endpoints.
      candidates.push(
        ...paper.filter((s) => s.kind !== "Papperskant" || !candidates.length),
      );
    }
    if (drag?.kind === "grip")
      candidates = candidates.filter(
        (s) => !(s.id === drag.entity.id && dist(s.p, drag.grip.p) < 1e-7),
      );
    const directional = !["ARC", "SCALE"].includes(tool?.name);
    const result = resolveSnap({
      raw: rawCursor,
      base: directional ? base : null,
      candidates,
      anchors: trackAnchors,
      tolerance,
      ortho: directional && ortho,
      polarEnabled: directional && polarEnabled,
      polarStep: Number($("#polar-step").value),
      track: tracking && osnap,
    });
    cursor = result.p;
    if (result.mode !== "free") snap = result;
    acquireTrack(snap);
  } else acquireTrack(null);
  if (gridSnap && !snap && active) {
    const step = gridStep() / 5;
    cursor = {
      x: Math.round(cursor.x / step) * step,
      y: Math.round(cursor.y / step) * step,
    };
  }
  $("#snap-feedback").textContent = snap
    ? `${snap.kind}${snap.mode === "object" && trackAnchors.some((p) => dist(p, snap.p) < 1e-7) ? " · referens fångad" : ""}`
    : trackAnchors.length
      ? `Track · ${trackAnchors.length} referenspunkter`
      : "";
  $("#coordinates").textContent = `X ${fmt(cursor.x)}   Y ${fmt(cursor.y)}`;
}
function moveCursor(ev) {
  const r = canvas.getBoundingClientRect();
  mouse = { x: ev.clientX - r.left, y: ev.clientY - r.top };
  rawCursor = world(mouse);
  resolveCursor();
}
function beginTextEdit(entity, isNew = false) {
  clearTracking();
  tool = null;
  drag = null;
  snap = null;
  inlineEdit = { entity: clone(entity), isNew };
  const box = $("#text-editor"),
    area = $("#inline-text");
  area.value = entity.text;
  box.hidden = false;
  $("#text-font").value = textFont(entity);
  for (const key of ["bold", "italic", "underline"])
    $("#text-" + key).setAttribute(
      "aria-pressed",
      String(Boolean(entity[key])),
    );
  positionTextEditor();
  styleTextEditor();
  prompt();
  schedule();
  area.focus();
  area.setSelectionRange(area.value.length, area.value.length);
}
function positionTextEditor() {
  if (!inlineEdit) return;
  const e = inlineEdit.entity,
    p = screen(
      e.type === "text"
        ? e.point
        : add(e.points.at(-1), {
            x: (e.height || 120) / 3,
            y: ((e.height || 120) * 7) / 24,
          }),
    ),
    box = $("#text-editor");
  box.style.left = Math.max(8, Math.min(width - 340, p.x)) + "px";
  box.style.top = Math.max(8, Math.min(height - 230, p.y - 65)) + "px";
}
function styleTextEditor() {
  const e = inlineEdit.entity,
    area = $("#inline-text");
  area.style.fontFamily = textFont(e);
  area.style.fontWeight = e.bold ? "700" : "400";
  area.style.fontStyle = e.italic ? "italic" : "normal";
  area.style.textDecoration = e.underline ? "underline" : "none";
}
function finishTextEdit(save) {
  if (!inlineEdit) return;
  const current = inlineEdit,
    e = {
      ...current.entity,
      text: $("#inline-text").value.replace(/\r\n?/g, "\n"),
    };
  inlineEdit = null;
  $("#text-editor").hidden = true;
  if (save) {
    if (e.text.trim()) {
      commit(current.isNew ? "Skapa text" : "Redigera text", () => {
        if (current.isNew) doc.entities.push(e);
        else doc.entities = doc.entities.map((x) => (x.id === e.id ? e : x));
      });
      selection = new Set([e.id]);
    } else if (!current.isNew)
      log("Tom text sparades inte. Använd Radera för att ta bort objektet.");
  }
  update();
  prompt();
  canvas.focus();
}
$("#inline-text").addEventListener("keydown", (ev) => {
  ev.stopPropagation();
  if (ev.isComposing) return;
  if (ev.key === "Escape") {
    ev.preventDefault();
    finishTextEdit(false);
  } else if (ev.key === "Enter" && (ev.ctrlKey || ev.metaKey)) {
    ev.preventDefault();
    finishTextEdit(true);
  }
});
for (const key of ["bold", "italic", "underline"])
  $("#text-" + key).onclick = () => {
    if (!inlineEdit) return;
    inlineEdit.entity[key] = !inlineEdit.entity[key];
    $("#text-" + key).setAttribute(
      "aria-pressed",
      String(inlineEdit.entity[key]),
    );
    styleTextEditor();
    $("#inline-text").focus();
  };
$("#text-editor").addEventListener("keydown", (ev) => {
  if (ev.isComposing) return;
  if (ev.key === "Escape") {
    ev.preventDefault();
    ev.stopPropagation();
    finishTextEdit(false);
  } else if (ev.key === "Enter" && (ev.ctrlKey || ev.metaKey)) {
    ev.preventDefault();
    ev.stopPropagation();
    finishTextEdit(true);
  }
});
$("#text-font").onchange = () => {
  if (inlineEdit) {
    inlineEdit.entity.font = $("#text-font").value;
    styleTextEditor();
  }
};
$("#text-apply").onclick = () => finishTextEdit(true);
$("#text-cancel").onclick = () => finishTextEdit(false);
canvas.addEventListener("dblclick", (ev) => {
  if (tool || inlineEdit) return;
  moveCursor(ev);
  const e = hit(rawCursor);
  if (e && ["text", "leader"].includes(e.type)) {
    beginTextEdit(e);
    return;
  }
  if (activeSpace !== "model" && !activeViewportId) {
    const p = paperPoint(mouse),
      vp = doc.entities.findLast(
        (e) =>
          e.type === "viewport" &&
          spaceOf(e) === activeSpace &&
          layerOf(e)?.visible !== false &&
          viewportContains(e, p),
      );
    if (vp) enterViewport(vp);
  }
});
document.addEventListener(
  "pointerdown",
  (ev) => {
    if (
      inlineEdit &&
      !$("#text-editor").contains(ev.target) &&
      ev.target !== canvas
    )
      finishTextEdit(true);
  },
  true,
);
function movedViewport() {
  return transformed(drag.entity, "MOVE", drag.world, rawCursor);
}
canvas.addEventListener("pointerdown", (ev) => {
  if (ev.button === 2) return;
  if (inlineEdit) {
    finishTextEdit(true);
    return;
  }
  moveCursor(ev);
  if (activeViewportId && !inActiveViewport(mouse)) {
    leaveViewport();
    return;
  }
  canvas.setPointerCapture(ev.pointerId);
  input.blur();
  if (ev.button === 1 || space || tool?.name === "PAN") {
    ev.preventDefault();
    spaceUsed = true;
    if (
      activeViewportId &&
      doc.entities.find((e) => e.id === activeViewportId)?.locked
    )
      return;
    drag = { kind: "pan", start: mouse, camera: { ...camera } };
    canvas.style.cursor = "grabbing";
    return;
  }
  if (!tool) {
    let closest = null,
      distance = 8;
    for (const e of doc.entities) {
      if (!selection.has(e.id) || !editable(e)) continue;
      for (const g of grips(e)) {
        const d = dist(screen(g.p), mouse);
        if (d < distance) {
          closest = { e, g };
          distance = d;
        }
      }
    }
    if (closest) {
      drag = {
        kind: "grip",
        entity: clone(closest.e),
        grip: closest.g,
        start: { ...mouse },
      };
      return;
    }
  }
  if (!tool && !ev.shiftKey && activeSpace !== "model" && !activeViewportId) {
    const e = hit(rawCursor);
    if (e?.type === "viewport") {
      selection = new Set([e.id]);
      drag = {
        kind: "viewportMove",
        entity: clone(e),
        world: { ...rawCursor },
        start: { ...mouse },
        moved: false,
      };
      canvas.style.cursor = "grabbing";
      update();
      return;
    }
  }
  if (tool && tool.phase !== "select") {
    acceptPoint(cursor);
    schedule();
    return;
  }
  drag = {
    kind: "select",
    start: { ...mouse },
    world: rawCursor,
    shift: ev.shiftKey,
    moved: false,
  };
});
// Suppress native middle-button autoscroll/paste without affecting CAD pan.
for (const name of ["mousedown", "auxclick"]) {
  canvas.addEventListener(name, (ev) => {
    if (ev.button === 1) ev.preventDefault();
  });
}
canvas.addEventListener("pointermove", (ev) => {
  moveCursor(ev);
  if (drag?.kind === "pan") {
    camera.x = drag.camera.x - (mouse.x - drag.start.x) / camera.scale;
    camera.y = drag.camera.y + (mouse.y - drag.start.y) / camera.scale;
  } else if (["select", "viewportMove"].includes(drag?.kind))
    drag.moved = dist(mouse, drag.start) > 4;
  else if (!tool && !drag) {
    const e = hit(rawCursor);
    hover = e?.id || null;
    canvas.style.cursor =
      e?.type === "viewport" && !activeViewportId ? "grab" : "crosshair";
  }
  schedule();
});
canvas.addEventListener("pointerup", (ev) => {
  if (!drag) return;
  moveCursor(ev);
  if (drag.kind === "viewportMove") {
    if (dist(mouse, drag.start) > 4) {
      const e = movedViewport();
      commit("Flytta viewport", () => {
        doc.entities = doc.entities.map((x) => (x.id === e.id ? e : x));
      });
    }
  } else if (drag.kind === "select") {
    if (drag.moved) {
      const a = drag.world,
        b = rawCursor,
        r = {
          minX: Math.min(a.x, b.x),
          maxX: Math.max(a.x, b.x),
          minY: Math.min(a.y, b.y),
          maxY: Math.max(a.y, b.y),
        },
        ids = doc.entities
          .filter(
            (e) => editable(e) && rectSelect(e, r, mouse.x < drag.start.x),
          )
          .map((e) => e.id);
      if (!drag.shift) selection.clear();
      ids.forEach((id) => selection.add(id));
    } else {
      const e = hit(rawCursor);
      if (!drag.shift) selection.clear();
      if (e) {
        if (drag.shift && selection.has(e.id)) selection.delete(e.id);
        else selection.add(e.id);
      }
    }
  } else if (drag.kind === "grip" && dist(mouse, drag.start) > 4) {
    const e = gripEntity(drag.entity, drag.grip, cursor);
    if (
      !validDocument({
        ...doc,
        entities: doc.entities.map((x) => (x.id === e.id ? e : x)),
      }) ||
      (e.type === "line" && dist(...e.points) < 1e-8)
    )
      log("Greppet skulle ge ogiltig geometri.");
    else
      commit(
        "Ändra grepp",
        () => (doc.entities = doc.entities.map((x) => (x.id === e.id ? e : x))),
      );
  }
  syncViewport();
  drag = null;
  canvas.style.cursor = tool?.name === "PAN" ? "grab" : "crosshair";
  update();
});
canvas.addEventListener("pointercancel", () => {
  drag = null;
  canvas.style.cursor = "crosshair";
  schedule();
});
canvas.addEventListener("contextmenu", (ev) => {
  ev.preventDefault();
  submit("");
});
canvas.addEventListener(
  "wheel",
  (ev) => {
    ev.preventDefault();
    if (inlineEdit) return;
    if (
      activeViewportId &&
      doc.entities.find((e) => e.id === activeViewportId)?.locked
    )
      return;
    moveCursor(ev);
    const action = wheelNavigation(ev, $("#navigation-device").value, height);
    if (action.kind === "pan") {
      camera.x += action.dx / camera.scale;
      camera.y -= action.dy / camera.scale;
    } else {
      const before = world(mouse);
      camera.scale = Math.max(
        1e-7,
        Math.min(10000, camera.scale * action.factor),
      );
      const after = world(mouse);
      camera.x += before.x - after.x;
      camera.y += before.y - after.y;
    }
    syncViewport();
    // Keep preview and snap at the new world position after navigation.
    moveCursor(ev);
    if (drag?.kind === "pan") {
      drag.start = { ...mouse };
      drag.camera = { ...camera };
    }
    schedule();
  },
  { passive: false },
);
canvas.addEventListener("pointerleave", () => {
  hover = null;
  acquireTrack(null);
  if (!drag) {
    snap = null;
    mouse = { x: -1, y: -1 };
  }
  schedule();
});
input.addEventListener("input", () => {
  const v = input.value.trim().toUpperCase();
  if (tool || !v) {
    $("#suggestions").hidden = true;
    return;
  }
  const list = definitions
    .filter(([n, , a]) => n.startsWith(v) || a.startsWith(v))
    .slice(0, 5);
  $("#suggestions").replaceChildren();
  for (const [n, l] of list) {
    const b = document.createElement("button");
    b.innerHTML = `<b>${n}</b><span>${l}</span>`;
    b.onclick = () => start(n);
    $("#suggestions").append(b);
  }
  $("#suggestions").hidden = !list.length;
});
input.addEventListener("keydown", (ev) => {
  if (ev.isComposing) return;
  if (["ArrowUp", "ArrowDown"].includes(ev.key) && commandHistory.length) {
    ev.preventDefault();
    historyCursor = Math.max(
      0,
      Math.min(
        commandHistory.length,
        historyCursor + (ev.key === "ArrowUp" ? -1 : 1),
      ),
    );
    input.value = commandHistory[historyCursor] || "";
    $("#suggestions").hidden = true;
  }
  if (commandSubmitKey(ev, tool?.phase === "text")) {
    ev.preventDefault();
    ev.stopPropagation();
    submit(input.value);
  }
  // Holding Space must not insert spaces or submit several command steps.
  if (
    ev.key === " " &&
    tool?.phase !== "text" &&
    !ev.ctrlKey &&
    !ev.metaKey &&
    !ev.altKey
  )
    ev.preventDefault();
  if (ev.key === "Tab" && !$("#suggestions").hidden) {
    ev.preventDefault();
    const b = $("#suggestions button b");
    if (b) {
      input.value = b.textContent;
      $("#suggestions").hidden = true;
    }
  }
});
document.addEventListener("keydown", (ev) => {
  const editing = ev.target.matches(
    "input,select,textarea,[contenteditable=true]",
  );
  if ($("#help-dialog").open || inlineEdit) return;
  if (ev.isComposing) return;
  if (ev.key === "Escape") {
    ev.preventDefault();
    if (editing && ev.target !== input) ev.target.blur();
    cancel();
    return;
  }
  if (editing && ev.target !== input) return;
  const mod = ev.metaKey || ev.ctrlKey;
  if (mod && ev.key.toLowerCase() === "z") {
    ev.preventDefault();
    undo(ev.shiftKey);
    return;
  }
  if (mod && ev.key.toLowerCase() === "y") {
    ev.preventDefault();
    undo(true);
    return;
  }
  if (mod && ev.key.toLowerCase() === "s") {
    ev.preventDefault();
    saveProject();
    return;
  }
  if (mod && ev.key.toLowerCase() === "a" && ev.target !== input) {
    ev.preventDefault();
    selection = new Set(doc.entities.filter(editable).map((e) => e.id));
    update();
    return;
  }
  if (["F3", "F8", "F10", "F11"].includes(ev.key)) {
    ev.preventDefault();
    toggle({ F3: "snap", F8: "ortho", F10: "polar", F11: "track" }[ev.key]);
    return;
  }
  if (editing) return;
  if (ev.target.closest("button") && ["Enter", " "].includes(ev.key)) return;
  if (["Delete", "Backspace"].includes(ev.key)) {
    ev.preventDefault();
    if (selection.size) erase();
    return;
  }
  if (ev.key === "Enter") {
    ev.preventDefault();
    submit("");
    return;
  }
  if (ev.code === "Space") {
    ev.preventDefault();
    if (!ev.repeat) {
      space = true;
      spaceUsed = false;
    }
    return;
  }
  if (!mod && !ev.altKey && ev.key.length === 1) {
    ev.preventDefault();
    input.focus();
    input.value += ev.key;
    input.dispatchEvent(new Event("input"));
  }
});
document.addEventListener("keyup", (ev) => {
  if (ev.code === "Space") {
    const shouldSubmit = space && !spaceUsed;
    space = false;
    if (shouldSubmit) submit("");
  }
});
window.addEventListener("blur", () => {
  space = false;
  drag = null;
  mouse = { x: -1, y: -1 };
  acquireTrack(null);
  schedule();
});
function toggle(kind) {
  if (kind === "snap") osnap = !osnap;
  if (kind === "ortho") {
    ortho = !ortho;
    if (ortho) polarEnabled = false;
  }
  if (kind === "polar") {
    polarEnabled = !polarEnabled;
    if (polarEnabled) ortho = false;
  }
  if (kind === "track") tracking = !tracking;
  if (!tracking || !osnap) clearTracking();
  if (kind === "gridSnap") gridSnap = !gridSnap;
  $("#snap-toggle").classList.toggle("on", osnap);
  $("#ortho-toggle").classList.toggle("on", ortho);
  $("#polar-toggle").classList.toggle("on", polarEnabled);
  $("#track-toggle").classList.toggle("on", tracking);
  $("#grid-snap-toggle").classList.toggle("on", gridSnap);
  resolveCursor();
  schedule();
}
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
      log("Ogiltigt värde.");
      renderInspector();
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
  el.append(h);
  return el;
}
function layerSelect(onChange, value) {
  const label = document.createElement("label");
  label.className = "field";
  label.textContent = "Lager";
  const select = document.createElement("select");
  if (value === "") {
    const o = document.createElement("option");
    o.textContent = "Blandat";
    o.value = "";
    select.append(o);
  }
  for (const l of doc.layers) {
    const o = document.createElement("option");
    o.value = l.id;
    o.textContent = l.name + (l.locked ? " · låst" : "");
    select.append(o);
  }
  select.value = value;
  select.onchange = () => onChange(select.value);
  label.append(select);
  return label;
}
function editSelected(label, fn) {
  commit(label, () => {
    doc.entities = doc.entities.map((e) =>
      selection.has(e.id) ? fn(clone(e)) : e,
    );
  });
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
document.addEventListener("pointerdown", (ev) => {
  document.querySelectorAll(".color-dropdown[open]").forEach((el) => {
    if (!el.contains(ev.target)) el.open = false;
  });
});
function appearanceFields(root, e, change) {
  const positive = (key, value) => {
    if (value > 0) change(key, value);
    else {
      log("Värdet måste vara större än noll.");
      renderInspector();
    }
  };
  if (e.type === "dimension") {
    root.append(field("Texthöjd", e.height, (v) => positive("height", v)));
    root.append(
      choice(
        "Decimaler",
        e.precision || 0,
        [0, 1, 2, 3].map((v) => [v, String(v)]),
        (v) => change("precision", Number(v)),
      ),
    );
  }
  if (["text", "leader"].includes(e.type)) {
    root.append(field("Texthöjd", e.height, (v) => positive("height", v)));
    root.append(
      choice(
        "Typsnitt",
        textFont(e),
        ["Arial", "Georgia", "Courier New"].map((x) => [x, x]),
        (v) => change("font", v),
      ),
    );
    const formats = document.createElement("div");
    formats.className = "format-buttons";
    for (const [key, label, glyph] of [
      ["bold", "Fetstil", "B"],
      ["italic", "Kursiv", "I"],
      ["underline", "Understrykning", "U"],
    ]) {
      const button = action(glyph, () => {
        const value = button.getAttribute("aria-pressed") !== "true";
        change(key, value);
        button.setAttribute("aria-pressed", String(value));
      });
      button.setAttribute("aria-label", label);
      button.setAttribute("aria-pressed", String(!!e[key]));
      formats.append(button);
    }
    root.append(formats);
  }
  if (e.type === "hatch") {
    root.append(
      field("Linjeavstånd", e.spacing, (v) => positive("spacing", v)),
    );
    root.append(
      field(
        "Mönstervinkel °",
        ((e.patternAngle ?? Math.PI / 4) * 180) / Math.PI,
        (v) => change("patternAngle", (v * Math.PI) / 180),
      ),
    );
  }
}
function creationInspector(root) {
  if (tool.name === "DIMCONTINUE") {
    const heading = section("SKAPA / Kedjemått");
    if (tool.source && tool.phase === "chainPoints") {
      const source = tool.source;
      heading.append(
        layerSelect((value) => {
          const layer = doc.layers.find((l) => l.id === value);
          if (layer.locked || layer.visible === false) {
            log("Välj ett synligt, olåst lager.");
            renderInspector();
            return;
          }
          source.layer = value;
          schedule();
        }, source.layer),
      );
      appearanceFields(heading, { ...source, text: "" }, (key, value) => {
        source[key] = value;
        schedule();
      });
      colorFields(
        heading,
        source.color,
        doc.layers.find((l) => l.id === source.layer)?.color,
        (value) => {
          source.color = value;
          renderInspector();
          schedule();
        },
      );
    }
    root.append(heading);
    return;
  }
  const heading = section(
    "SKAPA / " +
      (definitions.find((d) => d[0] === tool.name)?.[1] || tool.name),
  );
  heading.append(
    layerSelect((v) => {
      const layer = doc.layers.find((l) => l.id === v);
      if (layer.locked || layer.visible === false) {
        log("Välj ett synligt, olåst lager.");
        renderInspector();
        return;
      }
      activeLayer = v;
      renderLayers();
    }, activeLayer),
  );
  const type = tool.name.startsWith("DIM")
    ? "dimension"
    : { TEXT: "text", LEADER: "leader", HATCH: "hatch" }[tool.name];
  if (type)
    appearanceFields(
      heading,
      { type, ...creationDefaults[type] },
      (key, value) => {
        creationDefaults[type][key] = value;
        schedule();
      },
    );
  colorFields(
    heading,
    creationColor,
    doc.layers.find((l) => l.id === activeLayer)?.color,
    (value) => {
      creationColor = value;
      renderInspector();
    },
  );
  root.append(heading);
}
function renderInspector() {
  const root = $("#properties-panel");
  root.replaceChildren();
  if (
    tool &&
    !transforms.includes(tool.name) &&
    ![
      "ERASE",
      "OFFSET",
      "JOIN",
      "EXPLODE",
      "PINSERT",
      "PDELETE",
      "FILLET",
      "CHAMFER",
    ].includes(tool.name)
  ) {
    creationInspector(root);
    return;
  }
  const es = doc.entities.filter((e) => selection.has(e.id));
  if (!es.length) {
    root.append(
      layerSelect((v) => {
        activeLayer = v;
        renderLayers();
        renderInspector();
      }, activeLayer),
    );
    colorFields(
      root,
      creationColor,
      doc.layers.find((l) => l.id === activeLayer)?.color,
      (value) => {
        creationColor = value;
        renderInspector();
      },
    );
    if (activeSpace !== "model" && !activeViewportId) {
      const l = doc.layouts.find((l) => l.id === activeSpace),
        sec = section("PAPPER");
      sec.append(
        field(
          "Namn",
          l.name,
          (v) => {
            if (
              v.trim() &&
              v.trim().toLowerCase() !== "model" &&
              !doc.layouts.some(
                (other) =>
                  other.id !== l.id &&
                  other.name.toLowerCase() === v.trim().toLowerCase(),
              )
            )
              commit("Layoutnamn", () => (l.name = v.trim()));
            else {
              log("Layoutnamnet måste vara unikt.");
              renderInspector();
            }
          },
          "text",
        ),
      );
      sec.append(
        choice(
          "Format",
          `${l.width}x${l.height}`,
          [
            ["420x297", "A3 liggande"],
            ["297x420", "A3 stående"],
            ["297x210", "A4 liggande"],
            ["210x297", "A4 stående"],
          ],
          (v) => {
            commit("Pappersformat", () => {
              [l.width, l.height] = v.split("x").map(Number);
            });
            fit();
          },
        ),
      );
      sec.append(
        action("Ta bort layout", () => {
          const id = l.id;
          commit("Ta bort layout", () => {
            doc.entities = doc.entities.filter((e) => spaceOf(e) !== id);
            doc.layouts = doc.layouts.filter((x) => x.id !== id);
          });
          cancel();
          fit();
        }),
      );
      root.append(sec);
    }
    return;
  }
  const e = es[0],
    def = definitions.find(
      (d) => d[0] === (e.type === "polyline" ? "PLINE" : e.type.toUpperCase()),
    ),
    head = document.createElement("div");
  head.className = "property-type";
  head.innerHTML = `<div class="entity-symbol">${svg(def?.[0] || "LINE")}</div><div><strong>${es.length > 1 ? `${es.length} objekt` : def?.[1] || { dimension: e.chain ? "Måttkedja" : "Mått", viewport: "Viewport" }[e.type] || e.type}</strong><br><span>${es.length > 1 ? "Gemensamma egenskaper" : "Redigerbart objekt"}</span></div>`;
  root.append(head);
  root.append(
    layerSelect(
      (v) => {
        if (v) editSelected("Ändra lager", (x) => ({ ...x, layer: v }));
      },
      es.every((x) => x.layer === e.layer) ? e.layer : "",
    ),
  );
  const sameColor = es.every((x) => (x.color || null) === (e.color || null));
  colorFields(root, sameColor ? e.color : "mixed", layerOf(e).color, (value) =>
    editSelected("Färg", (n) => ({ ...n, color: value })),
  );
  if (es.length === 1) {
    const geo = section("OBJEKTEGENSKAPER");
    const edit = (label, fn) => editSelected(label, fn);
    if (e.type === "dimension" && !e.chain) {
      geo.append(
        field(
          "Textöverskrivning",
          e.text || "",
          (v) => edit("Måtttext", (n) => ({ ...n, text: v })),
          "text",
        ),
      );
    }
    if (e.type === "viewport") {
      geo.append(
        field("Skala 1:", 1 / e.viewScale, (v) => {
          if (v > 0) edit("Viewportskala", (n) => ({ ...n, viewScale: 1 / v }));
          else renderInspector();
        }),
      );
      geo.append(
        choice(
          "Låst vy",
          e.locked !== false,
          [
            ["true", "Ja"],
            ["false", "Nej"],
          ],
          (v) => edit("Viewportlås", (n) => ({ ...n, locked: v === "true" })),
        ),
      );
      geo.append(action("Aktivera modellvy", () => enterViewport(e)));
    }
    if (e.type === "polyline")
      geo.append(
        choice(
          "Sluten",
          !!e.closed,
          [
            ["true", "Ja"],
            ["false", "Nej"],
          ],
          (v) => edit("Sluten kontur", (n) => ({ ...n, closed: v === "true" })),
        ),
      );
    if (["text", "leader"].includes(e.type))
      geo.append(action("Redigera text på canvas", () => beginTextEdit(e)));
    appearanceFields(geo, e, (key, value) =>
      edit("Egenskap", (n) => ({ ...n, [key]: value })),
    );
    if (geo.children.length > 1) root.append(geo);
  } else {
    const p = document.createElement("p");
    p.className = "muted";
    p.textContent =
      "Flytta, kopiera, rotera och skala hela markeringen med verktygen ovan.";
    root.append(p);
  }
  const b = document.createElement("button");
  b.className = "subtle-button";
  b.textContent = "Radera markerade";
  b.onclick = erase;
  root.append(b);
}
function renderLayers() {
  const root = $("#layers-panel");
  root.replaceChildren();
  for (const l of doc.layers) {
    const row = document.createElement("div");
    row.className = "layer-row" + (l.id === activeLayer ? " current" : "");
    const color = document.createElement("input");
    color.type = "color";
    color.value = l.color;
    color.title = "Lagerfärg";
    color.onchange = () => commit("Lagerfärg", () => (l.color = color.value));
    const name = document.createElement("strong");
    name.textContent = l.name;
    name.title = "Gör till aktivt lager";
    name.style.cursor = "pointer";
    name.onclick = () => {
      activeLayer = l.id;
      renderLayers();
      renderInspector();
    };
    const eye = document.createElement("button");
    eye.textContent = l.visible === false ? "○" : "◉";
    eye.title = l.visible === false ? "Visa lager" : "Dölj lager";
    eye.onclick = () => {
      cancel(false);
      commit("Lagersynlighet", () => (l.visible = l.visible === false));
    };
    const lock = document.createElement("button");
    lock.textContent = l.locked ? "▣" : "▢";
    lock.title = l.locked ? "Lås upp lager" : "Lås lager";
    lock.onclick = () => {
      cancel(false);
      commit("Lås lager", () => (l.locked = !l.locked));
    };
    row.append(color, name, eye, lock);
    root.append(row);
  }
  const b = document.createElement("button");
  b.className = "subtle-button";
  b.textContent = "+ Nytt lager";
  b.onclick = () => {
    commit("Nytt lager", () => {
      activeLayer = uid();
      doc.layers.push({
        id: activeLayer,
        name: `Lager ${doc.layers.length + 1}`,
        color: "#9cd4b5",
        visible: true,
        locked: false,
      });
    });
  };
  root.append(b);
}
function panel(which) {
  $("#properties-panel").hidden = which !== "properties";
  $("#layers-panel").hidden = which !== "layers";
  $$("[data-panel]").forEach((b) =>
    b.classList.toggle("active", b.dataset.panel === which),
  );
}
$$("[data-panel]").forEach((b) => (b.onclick = () => panel(b.dataset.panel)));
$("#layers-tab").onclick = () => panel("layers");
document.addEventListener("click", (ev) => {
  const b = ev.target.closest("[data-command]");
  if (b) start(b.dataset.command);
});
$("#fit-view").onclick = fit;
$("#toggle-grid").onclick = () => {
  showGrid = !showGrid;
  $("#toggle-grid").classList.toggle("active", showGrid);
  schedule();
};
$("#snap-toggle").onclick = () => toggle("snap");
$("#ortho-toggle").onclick = () => toggle("ortho");
$("#polar-toggle").onclick = () => toggle("polar");
$("#track-toggle").onclick = () => toggle("track");
$("#polar-step").onchange = () => {
  resolveCursor();
  schedule();
};
$("#grid-snap-toggle").onclick = () => toggle("gridSnap");
$("#undo").onclick = () => undo();
$("#redo").onclick = () => undo(true);
function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type })),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function saveProject() {
  download(
    `${doc.name}.liracad`,
    JSON.stringify(doc, null, 2),
    "application/json",
  );
  dirty = false;
  log("Projektfil sparad.");
}
function exportDxf() {
  download(`${doc.name}.dxf`, toDXF(doc), "application/dxf");
  log(
    "DXF exporterad · layouter och viewports bevaras. Mått exporteras som linjer/bågar/text.",
  );
}
$("#save-file").onclick = saveProject;
$("#export-dxf").onclick = exportDxf;
$("#open-file").onclick = () => $("#file-input").click();
$("#file-input").onchange = async (ev) => {
  const f = ev.target.files[0];
  if (!f) return;
  try {
    if (f.size > 50e6) throw Error("Filen är för stor (max 50 MB).");
    const d = JSON.parse(await f.text());
    if (!validDocument(d)) throw Error("Ogiltig projektfil.");
    commit("Öppna projekt", () => {
      doc = d;
      activeLayer = d.layers[0].id;
    });
    activeSpace = "model";
    activeViewportId = null;
    paperCamera = null;
    cancel();
    fit();
    log(`Öppnat ${f.name}`);
  } catch (e) {
    log(`Kunde inte öppna: ${e.message}`);
  }
  ev.target.value = "";
};
$("#new-file").onclick = () => {
  commit("Ny ritning", () => {
    doc = {
      version: 1,
      name: "Namnlös ritning",
      layers: [
        {
          id: uid(),
          name: "0",
          color: "#c3d6ce",
          visible: true,
          locked: false,
        },
      ],
      entities: [],
    };
    activeLayer = doc.layers[0].id;
  });
  cancel();
  fit();
  log("Ny ritning. Den föregående kan återställas med Ångra.");
};
$("#demo-file").onclick = () => {
  commit("Exempelritning", () => {
    doc = demoDocument();
    activeLayer = doc.layers[0].id;
  });
  cancel();
  fit();
  log("Exempelritningen är öppnad.");
};
$("#help-button").onclick = () => $("#help-dialog").showModal();
$("#close-help").onclick = $("#start-drawing").onclick = () =>
  $("#help-dialog").close();
for (const button of $$("[data-ribbon]")) {
  button.onclick = () => {
    for (const tab of $$("[data-ribbon]")) {
      const active = tab === button;
      tab.classList.toggle("active", active);
      tab.setAttribute("aria-pressed", String(active));
    }
    for (const panel of $$("[data-tool-panel]"))
      panel.hidden = panel.dataset.toolPanel !== button.dataset.ribbon;
  };
}
$("#space-tabs").onkeydown = (event) => {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  event.stopPropagation();
  const buttons = [...$("#space-tabs").children];
  const index = buttons.indexOf(document.activeElement);
  const next =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? buttons.length - 1
        : (index + (event.key === "ArrowRight" ? 1 : -1) + buttons.length) %
          buttons.length;
  buttons[next].click();
  buttons[next].focus();
};
$("#new-layout").onclick = createLayout;
$("#paper-space").onclick = leaveViewport;
$("#export-sheet").onclick = () => {
  syncViewport();
  const l = doc.layouts.find((l) => l.id === activeSpace);
  if (l) download(`${l.name}.svg`, layoutSVG(doc, l), "image/svg+xml");
};
resize();
update();
fit();
prompt();
log(
  "LiraCAD 0.1 · Skriv ett kommando, välj ett verktyg eller öppna Snabbguide.",
);
if (restoreError)
  log("Det lokala utkastet kunde inte läsas. Exempelritningen har öppnats.");

setupPWA(() => {
  if (tool || drag) return "Avsluta eller avbryt pågående kommando före uppdatering.";
  if (inlineEdit) finishTextEdit(true);
  syncViewport();
  localStorage.setItem("liracad-v1", JSON.stringify(doc));
});
