import { annotationView, storeAnnotationView, createAnnotationView, plainAnnotationEntity, copyAnnotationView } from "./annotation-edit.js";
import { loadCadFonts } from "./cad-fonts.js";
import { cameraVector, screenPoint, worldPoint } from "./camera.js";
import { createLayoutInspector } from "./layout-inspector.js";
import { createBlockInspector } from "./block-inspector.js";
import { createGeneralInspector } from "./general-inspector.js";
import { createAppearanceInspector } from "./appearance-inspector.js";
import { createAttributeInspector } from "./attribute-inspector.js";
import { createEntityInspector } from "./entity-inspector.js";
import { definitions, aliases, transforms } from "./command-catalog.js";
import { icons } from "./toolbar-icons.js";
import { createLayerPanel } from "./layer-panel.js";
import { initializeLiraShell } from "./lira-shell.js";
import { Editor } from "./editor.js";
import { drawingTools } from "./drawing-tools.js";
import { stretchTools } from "./stretch-tools.js";
import { wblockTools } from "./wblock-tools.js";
import { transformTools, applyTransformChange } from "./transform-tools.js";
import { editingTools, applyEditingChange } from "./editing-tools.js";
import { cornerTools } from "./corner-tools.js";
import { vertexTools } from "./vertex-tools.js";
import { annotationTools } from "./annotation-tools.js";
import { utilityTools } from "./utility-tools.js";
import { blockTools } from "./block-tools.js";
import { viewportTools } from "./viewport-tools.js";
import { createTextEditor } from "./text-editor.js";
import { dimensionTools } from "./dimension-tools.js";
import { BlockEditSession } from "./block-edit-session.js";
import { structureTools } from "./structure-tools.js";
import { createSceneRenderer, gridSpacing, viewportClip } from "./scene-renderer.js";
import { commandPrompt } from "./command-prompts.js";
import { createInspectorControls } from "./inspector-controls.js";
document.addEventListener("pointerdown", (ev) => {
  document.querySelectorAll(".color-dropdown[open]").forEach((el) => {
    if (!el.contains(ev.target)) el.open = false;
  });
});
import { DocumentSession } from "./document-session.js";
import { copyDocumentSnapshot } from './document-snapshot.js';
import { createSettingsPanel } from "./settings-panel.js";
import { createDocumentWorkflow } from "./document-workflow.js";
import { ProjectStorage } from "./project-storage.js";
import { ProjectWorkspace } from "./project-workspace.js";
import {
  blockTemplates,
  blockParts,
  withAttributeText,
} from "./blocks.js";
import { setupPWA } from "./pwa.js";
import { createFileOpenQueue, setupFileLaunch } from "./file-launch.js";
import { layoutSVG } from "./plot.js";
import {
  spaceOf,
  viewportCamera,
  viewportFromCamera,
  viewportContains,
  fitViewportToEntities,
  recoverEmptyViewports,
  paperSnaps,
} from "./layout.js";
import { grips, gripTargets, moveGripTargets } from "./grips.js";
import { TrackingReferences } from "./tracking.js";
import { nearbySnaps, resolveSnap } from "./snapping.js";
import {createLocalSnapIndex} from './local-snapping.js';
import { createSpatialIndex } from "./spatial-index.js";
import { IndexedDBProjectStore } from './indexeddb-project-store.js';
import { wheelNavigation, commandSubmitKey } from "./navigation.js";
import { TAU, dist, add, sub, mul, angle, polar, number } from "./geometry.js";
import { clone, uid } from "./values.js";
import { pointsOf, bounds, drawingBounds, hitDistance, rectSelect } from "./entity-geometry.js";
import { transformed } from "./entity-transform.js";
import { validDocument } from "./document.js";
import { demoDocument } from "./demo-document.js";
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
let blockEditor = null;
let parameterEdit = null;
const projectWorkspace = new ProjectWorkspace({
  createStorage: id => new ProjectStorage(new IndexedDBProjectStore(undefined,{key:id}), {
    legacyStorage: id === 'current' ? () => localStorage : null,
    journalStorage: () => localStorage,
    key: id === 'current' ? 'liracad-v1' : 'liracad-'+id,
  }),
  metadata: () => localStorage, fallback: demoDocument,
  onError: error => {
    $('#save-state').textContent = 'Kunde inte spara projektflikar · spara till fil';
    $('#save-state').title = error.message;
  },
});
document.body.inert = true;
$('#save-state').textContent = 'Läser projekt…';
// Load before measuring restored text or building its spatial index.
const [initialProject] = await Promise.all([projectWorkspace.restore(), loadCadFonts()]);
let projectStorage = initialProject.storage;
const restored = initialProject.restored;
let documentSession = initialProject.session;
let doc = documentSession.document;
$('#save-state').textContent = initialProject.saveState;
$('#save-state').title = initialProject.saveError?.message || '';
document.body.inert = false;
const restoreError = restored.error;
let activeLayer = doc.layers[0].id,
  selection = new Set(),
  history = documentSession.history,
  tool = null,
  lastCommand = "LINE",
  cursor = { x: 0, y: 0 },
  rawCursor = { x: 0, y: 0 },
  mouse = { x: 0, y: 0 },
  snap = null,
  drag = null,
  space = false,
  spaceUsed = false,
  showGrid = true,
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
  snapCache = null,
  sceneIndex, indexedDocument, indexedSpace,
  editableIds = new Set();
let navigationDeadline = 0, navigationTimer;
function navigating() {
  navigationDeadline = performance.now() + 120;
  clearTimeout(navigationTimer);
  navigationTimer = setTimeout(schedule, 130);
}
let interactionEntities, interactionViewport;
let activeSpace = "model",
  activeViewportId = null,
  paperCamera = null;
const spaceCameras = new Map();
const drawingSpace = () => (activeViewportId ? "model" : activeSpace);
const currentViewport=()=>doc.entities.find(e=>e.id===activeViewportId);
const viewEntity=e=>spaceOf(e)==="model"?annotationView(e,currentViewport(),doc.layers):e;
const layerOf = (e) => doc.layers.find((l) => l.id === e.layer),
  visible = (e) =>
    !e.hidden && layerOf(e)?.visible !== false && spaceOf(e) === drawingSpace() && !(activeViewportId && doc.entities.find(v=>v.id===activeViewportId)?.frozenLayers?.includes(layerOf(e)?.name)),
  editable = (e) => visible(e) && !layerOf(e)?.locked;
const world = (p) => worldPoint(p, camera, width, height);
const screen = (p) => screenPoint(p, camera, width, height);

const svg = (n) =>
  `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.3">${icons[n] || icons.LINE}</svg>`;
const fmt = (n) =>
  Number(n.toFixed(2)).toLocaleString("sv-SE", { maximumFractionDigits: 2 });
const renderScene = createSceneRenderer({ ctx });
const { field, section, choice, action, colorFields } = createInspectorControls(
  {
    document,
    onInvalid: (message) => {
      log(message);
      renderInspector();
    },
  },
);
const generalProperties = createGeneralInspector({
  document, choice, colorFields,
  getContext: () => ({ doc, tool, es: selectedEntities(), activeLayer, creationColor, creationLineType }),
  changeProperty: (key, value, { source, hasTargets }) => {
    if (source) {
      source[key] = value;
      renderInspector();
      schedule();
    } else if (hasTargets)
      editSelected("Egenskap", (e) => ({ ...e, [key]: value }));
    else {
      if (key === "layer") {
        const layer = doc.layers.find((l) => l.id === value);
        if (layer.locked || layer.visible === false) {
          log("Välj ett synligt, olåst lager.");
          renderInspector();
          return;
        }
        activeLayer = value;
      }
      if (key === "color") creationColor = value;
      if (key === "lineType") creationLineType = value;
      renderInspector();
      renderLayers();
      schedule();
    }
  },
});
const appearanceFields = createAppearanceInspector({
  document, field, choice, action, log, refresh: renderInspector,
});
const { attributeValueField, attributeDefinitionFields, renderAttributeManager } = createAttributeInspector({
  document, field, choice, action, log, refresh: renderInspector, editSelected,
  getDocument: () => doc, isBlockEditor: () => Boolean(blockEditor),
  selectEntity: (id) => { cancel(); selection = new Set([id]); update(); },
});
const renderEntityProperties = createEntityInspector({
  field, choice, section, action, editSelected, refresh: renderInspector,
  attributeDefinitionFields, appearanceFields, enterViewport, fitViewport, beginTextEdit,
  getAnnotationScale:()=>currentViewport()?.annotationScale,
  createAnnotationVariant:entity=>{const source=doc.entities.find(e=>e.id===entity.id);if(source)replaceEntities("Skapa annotationsvariant",doc.entities.map(e=>e.id===source.id?createAnnotationView(e,currentViewport()):e));},
});
const renderLayoutProperties = createLayoutInspector({
  field, choice, section, action, getDocument: () => doc, commit, log,
  refresh: renderInspector, afterFormat: fit, afterRemove: () => { cancel(); fit(); },
  recoverViews:recoverLayoutViews,
});
const blockInspector = createBlockInspector({
  refresh:()=>{renderInspector();schedule();},
  field, section, action, startParameter:request=>{parameterEdit=request||null;try{start("BSTRETCH");}finally{parameterEdit=null;}}, getDocument: () => doc, commit, finishEdit: finishBlockEdit,
  renderAttributeManager, attributeValueField, editSelected, beginEdit: beginBlockEdit, beginAttributeEdit: beginAttributeTextEdit, erase,
});
const renderLayers = createLayerPanel({
  document,
  root: $("#layers-panel"),
  getDocument: () => doc,
  getActiveLayer: () => activeLayer,
  activateLayer: (id) => {
    activeLayer = id;
    renderLayers();
    renderInspector();
  },
  commit, cancel, log, field, choice, action,
});
const editor = new Editor({
  tools: { ...drawingTools, ...stretchTools, ...wblockTools, ...transformTools, ...editingTools, ...cornerTools, ...vertexTools, ...structureTools, ...dimensionTools, ...blockTools, ...viewportTools, ...annotationTools, ...utilityTools },
  getContext: () => ({
    entities: selectedEntities(),
    isBlockEditor:Boolean(blockEditor),stretchParameters:doc.stretchParameters||[],parameterEdit,
    creationDefaults,
    ...(tool && (Object.hasOwn(blockTools, tool.name)||tool.name==='WBLOCK') ? { templates: blockTemplates(doc) } : {}),
    ...(tool?.name === "MVIEW" ? { modelCenter: modelExtentsCenter(), activeViewportId } : {}),
    creation: { layer: activeLayer, space: drawingSpace(), color: creationColor, lineType: creationLineType, ...creationDefaults.dimension },
    ...(tool && ["OFFSET", "TRIM", "EXTEND", "FILLET", "CHAMFER", "PINSERT", "PDELETE", "STRETCH", "BSTRETCH", ...Object.keys(dimensionTools)].includes(tool.name) ? {
      editableEntities: (interactionEntities||doc.entities).filter(editable),
      hitEntity: ["TRIM", "EXTEND", "FILLET", "CHAMFER", ...Object.keys(dimensionTools)].includes(tool.name) ? hit(rawCursor) : null,
      pointer: rawCursor,
    } : {}),
  }),
  setSelection: (ids) => { selection = new Set(ids); },
  applyChange: (change) => {
    if(change.kind === "wblock") {
      documentWorkflow.exportWblock(change);
    } else if(change.kind === "blockParameter") {
      if(!blockEditor)throw Error("Öppna blockeditorn först.");
      commit(change.label,draft=>{const index=draft.stretchParameters?.findIndex(p=>p.id===change.parameter.id)??-1;if(index>=0)draft.stretchParameters[index]=change.parameter;else draft.stretchParameters=[...(draft.stretchParameters||[]),change.parameter];});
    } else if (change.kind === "editing") {
      applyObjectChange(change);
    } else if (change.operation) {
      const result = applyTransformChange(doc.entities, change);
      if(change.operation === 'COPY')addEntities(result.entities.slice(doc.entities.length),change.label);
      else replaceEntities(change.label,result.entities);
      selection = new Set(result.ids);
      update();
    } else {
      addEntities(
        change.entities.map(({ type, ...props }) => make(type, props)),
        change.label,
      );
    }
  },
  onEffect: (effect) => {
    if (effect.kind === "editText") beginTextEdit(effect.entity, effect.isNew);
    else if (effect.kind === "focusCommand") input.focus();
  },
  notify: log,
  onState: (state) => {
    if (tool?.phase !== state?.phase || (state?.name === "DIMCONTINUE" && (tool?.source !== state.source || tool?.end !== state.end))) clearTracking();
    tool = state;
  },
});
let textEditTarget = null;
const textEditor = createTextEditor({
  document, screen, getSize: () => ({ width, height }),
  getAvoidBounds: () => {
    const block = textEditTarget && doc.entities.find(e => e.id === textEditTarget.blockId);
    return block ? bounds(block) : null;
  },
  beforeBegin: () => { clearTracking(); editor.cancel(); tool = null; drag = null; snap = null; },
  applyChange: change => {
    if (!textEditTarget) return applyObjectChange(change);
    const source = doc.entities.find(e => e.id === textEditTarget.blockId);
    const block=source && viewEntity(source);
    if (!block || !editableIds.has(block.id) || block.definition.id !== textEditTarget.definitionId) throw Error("Blocket har ändrats eller kan inte längre redigeras.");
    applyObjectChange({ ...change, label: "Redigera blockattribut", replaceId: block.id, entities: [withAttributeText(block, textEditTarget.tag, change.entities[0])] });
  },
  afterFinish: ({ selection: ids }) => {
    textEditTarget = null;
    if (ids) selection = new Set(ids);
    update(); prompt(); canvas.focus();
  },
  refresh: () => { prompt(); schedule(); }, log,
});
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
  const r = drawingBounds(es);
  return { x: (r.minX + r.maxX) / 2, y: (r.minY + r.maxY) / 2 };
}
function syncViewport() {
  if (!activeViewportId) return;
  const i = doc.entities.findIndex((e) => e.id === activeViewportId),
    e = doc.entities[i];
  if (e && !e.locked) {
    const viewport=viewportFromCamera(e, camera, paperCamera, width, height);
    if(JSON.stringify(e)===JSON.stringify(viewport))return;
    doc=copyDocumentSnapshot({...doc,entities:doc.entities.map((entity,index)=>index===i?viewport:entity)});
    documentSession.document=doc;
    dirty=true;
    indexedDocument = null;
    persisted();
  }
}
function leaveViewport() {
  if (!activeViewportId) return;
  if (textEditor.active && !finishTextEdit(true)) return;
  syncViewport();
  activeViewportId = null;
  camera = paperCamera;
  paperCamera = null;
  setCreationMode("paper");
  cancel();
}
function enterViewport(e) {
  if(e.annotationScale)log(`Modellvy · annotationsskala 1:${e.annotationScale}. Ändringar av en skalvariant gäller denna annotationsskala.`);
  if (textEditor.active && !finishTextEdit(true)) return;
  cancel();
  paperCamera = { ...camera };
  activeViewportId = e.id;
  indexedSpace = null;
  setCreationMode("model");
  camera = viewportCamera(e, paperCamera, width, height);
  rebuild();
  renderSpaceControls();
  renderInspector();
  schedule();
}
function switchSpace(id) {
  if (blockEditor) return;
  if (textEditor.active && !finishTextEdit(true)) return;
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
  if (blockEditor) return;
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
  tabs.hidden = !!blockEditor;
  $("#new-layout").disabled = !!blockEditor;
  for (const id of ["new-file", "open-file", "demo-file", "export-dxf"])
    $("#" + id).disabled = !!blockEditor;
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
  $("#space-context").textContent = blockEditor
    ? "BLOCK · " + doc.name
    : activeViewportId
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
  return viewportClip(e, paperCamera, width, height);
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
function rebuild() {
  const space = drawingSpace();
  if (indexedDocument === doc && indexedSpace === space && interactionViewport===activeViewportId) return;
  interactionViewport=activeViewportId;
  interactionEntities=doc.entities.map(viewEntity).filter(Boolean);
  sceneIndex = sceneIndex ? sceneIndex.update(interactionEntities) : createSpatialIndex(interactionEntities, bounds);
  snapCache = snapCache ? snapCache.update(interactionEntities,sceneIndex) : createLocalSnapIndex(interactionEntities,{entityIndex:sceneIndex,eligible:visible});
  editableIds = new Set(interactionEntities.filter(editable).map(e => e.id));
  indexedDocument = doc;
  indexedSpace = space;
}
function persisted() {
  if (blockEditor) {
    $("#save-state").textContent = "Blockändringar ej sparade";
    return;
  }
  $("#save-state").textContent = "Sparar…";
  try { projectStorage.observe(doc); }
  catch(error){log('Tillfällig sparlogg kunde inte uppdateras: '+error.message);}
  if(projectStorage.journalError){
    $('#save-state').textContent='Sparar… · invänta autosparning';
    $('#save-state').title='Senaste ändringen kan återställas först när autosparningen är klar. '+projectStorage.journalError.message;
  }
  const entry = projectWorkspace.active;
  entry.saveState = $('#save-state').textContent;
  entry.saveError = projectStorage.journalError || null;
  projectStorage.schedule(
    () => entry.session.document,
    error => reportProjectSave(entry, error),
  );
  renderProjectTabs();
}
function reportProjectSave(entry, error) {
  entry.saveState = error ? 'Kunde inte autospara · spara till fil' : 'Autosparat lokalt';
  entry.saveError = error || null;
  if (projectWorkspace.active === entry && !blockEditor) {
    showProjectSaveState(entry);
    if (error) log('Lokal autosparning misslyckades. Använd Spara projekt.');
  }
  renderProjectTabs();
}
function reportLocalSave(error) { reportProjectSave(projectWorkspace.active,error); }
function showProjectSaveState(entry) {
  $('#save-state').textContent = projectWorkspace.manifestError && !entry.saveError
    ? 'Kunde inte spara projektflikar · spara till fil' : entry.saveState;
  $('#save-state').title = (entry.saveError || projectWorkspace.manifestError)?.message || '';
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
  rebuild();
  selection = new Set(
    [...selection].filter((id) => editableIds.has(id)),
  );
  $("#document-name").textContent = doc.name;
  renderProjectTabs();
  $("#entity-count").textContent = `${doc.entities.length} objekt · mm`;
  $("#selection-badge").textContent = selection.size;
  $("#undo").disabled = !history.past.length;
  $("#redo").disabled = !history.future.length;
  $("#layer-count").textContent = doc.layers.length;
  renderInspector();
  renderLayers();
  schedule();
}
function commit(label, fn) {
  const previousLayer = activeLayer;
  let changed;
  try {
    changed = documentSession.commit(label, (draft) => {
      // Compatibility adapter for existing callbacks during command migration.
      doc = draft;
      fn(draft);
      return doc;
    });
  } catch (error) {
    doc = documentSession.document;
    activeLayer = previousLayer;
    update();
    throw error;
  }
  doc = documentSession.document;
  if (changed) {
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
let creationColor = null,
  creationLineType = "BYLAYER";
function make(type, props) {
  return {
    id: uid(),
    type,
    layer: activeLayer,
    space: drawingSpace(),
    ...props,
    color: creationColor,
    lineType: creationLineType,
    ...creationDefaults[type],
  };
}
function selectedEntities() {
  if (!selection.size) return [];
  return (interactionEntities||doc.entities).filter((e) => selection.has(e.id) && editable(e));
}
function addEntities(es, label) {
  es=es.map(e=>{const source=e._annotationSource&&doc.entities.find(p=>p.id===e._annotationSource);return source?copyAnnotationView(source,e,currentViewport()):e;});
  const previous=doc;
  if (!documentSession.append(label,es)) return;
  doc=documentSession.document;
  const added=doc.entities.slice(previous.entities.length);
  if(!blockEditor){
    try { projectStorage.recordAddition(doc,added); }
    catch(error){log('Tillfällig sparlogg kunde inte uppdateras: '+error.message);}
  }
  if (!activeViewportId && indexedDocument===previous && indexedSpace===drawingSpace()) {
    sceneIndex=sceneIndex.append(added);
    snapCache.append(added,sceneIndex);
    for(const entity of added)if(editable(entity))editableIds.add(entity.id);
    indexedDocument=doc;
  }
  dirty=true;
  persisted();
  update();
}
function applyObjectChange(change) {
  if (change.replaceId === undefined && change.replaceIds === undefined && !change.definitions?.length) {
    return addEntities(change.entities,change.label);
  }
  if(!change.definitions?.length) {
    return replaceEntities(change.label,applyEditingChange(doc.entities,change));
  }
  commit(change.label,draft=>{
    draft.entities=applyEditingChange(draft.entities,change);
    if(change.definitions?.length)draft.blocks=[...(draft.blocks || []),...clone(change.definitions)];
  });
}
function replaceEntities(label, entities) {
  entities=entities.map(e=>{const source=e._annotationSource&&doc.entities.find(p=>p.id===e._annotationSource);return source&&e.id===source.id?storeAnnotationView(source,e):e._annotationSource?plainAnnotationEntity(e):e;});
  if(!documentSession.replaceEntities(label,entities))return;
  doc=documentSession.document;
  dirty=true;
  persisted();
  update();
}
function undo(redo = false) {
  if (textEditor.active && !finishTextEdit(true)) return;
  cancel(false);
  const d = redo ? documentSession.redo() : documentSession.undo();
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
  const es = (interactionEntities||doc.entities).filter(visible);
  const parameter=blockEditor&&blockInspector.getActiveParameter();
  if(parameter)es.push({type:'polyline',points:[parameter.start,parameter.end,{x:parameter.window.minX,y:parameter.window.minY},{x:parameter.window.maxX,y:parameter.window.maxY}]});
  if (!es.length) {
    camera = { x: 0, y: 0, scale: 0.1 };
    schedule();
    return;
  }
  const r = drawingBounds(es);
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
  if (textEditor.active) textEditor.position();
  dpr = devicePixelRatio || 1;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  schedule();
}
new ResizeObserver(resize).observe(canvas);
const gridStep = () => gridSpacing(camera.scale);
function render() {
  const gripPreviews = drag?.kind === "grip" ? moveGripTargets(drag.targets, cursor) : [];
  renderScene({
    doc, camera, paperCamera, width, height, dpr, activeSpace, activeViewportId,
    selection, hover, tool, cursor, mouse, showGrid, drag, trackAnchors, snap,
    previews: previewEntities(), gripPreviews,
    blockParameter:blockEditor?blockInspector.getActiveParameter():null,
    textReplacement: textEditPreview(),
    movedViewport: drag?.kind === "viewportMove" && drag.moved ? movedViewport() : null,
    previewTarget: tool && ["TRIM", "EXTEND"].includes(tool.name) && tool.phase === "trimPick" && editor.preview(cursor).length
      ? hit(rawCursor)?.id : null,
    editableIds, sceneIndex, interactionEntities, navigating: doc.entities.length > 2000 && performance.now() < navigationDeadline,
  });
  $("#zoom-level").textContent = `${Math.round(camera.scale * 1000)}%`;
}
function previewEntities() {
  return editor.preview(cursor).map((e) => ({ layer: activeLayer, ...e }));
}
function prompt() {
  if (!tool) {
    clearTracking();
    snap = null;
    $("#snap-feedback").textContent = "";
  }
  const s = editor.owns(tool)
    ? editor.describe().prompt
    : commandPrompt(tool);
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
  editor.cancel();
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
  if (textEditor.active && !finishTextEdit(true)) return;
  name = aliases[name.toUpperCase()] || name.toUpperCase();
  if (["MT", "MTEXT"].includes(name)) name = "TEXT";
  if (["BEDIT", "BE"].includes(name)) {
    beginBlockEdit(selectedEntities()[0]);
    return;
  }
  if (name === "BCLOSE" || name === "BSAVE") {
    finishBlockEdit(true);
    return;
  }
  if (name === "BCANCEL") {
    finishBlockEdit(false);
    return;
  }
  if (name === "BSTRETCH" && !blockEditor) {log("Öppna BEDIT först för att skapa en stretchparameter.");return;}
  if (blockEditor && ["BLOCK", "INSERT", "MVIEW", "DXF", "WBLOCK"].includes(name)) {
    log("Avsluta blockeditorn först.");
    return;
  }
  if(name==='WBLOCK'){
    clearTracking();tool={name};editor.start(name);lastCommand=name;input.value='';$("#suggestions").hidden=true;log("WBLOCK · Exportera mall som DXF.");prompt();update();return;
  }
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
  if (["BLOCK", "INSERT", "ATTDEF"].includes(name)) {
    if (
      name !== "ATTDEF" &&
      (doc.layers.find((l) => l.id === activeLayer)?.locked ||
        doc.layers.find((l) => l.id === activeLayer)?.visible === false)
    ) {
      log("Välj ett synligt, olåst lager först.");
      return;
    }
    clearTracking();
    if (
      name === "ATTDEF" &&
      (selectedEntities().length !== 1 || selectedEntities()[0].type !== "text")
    ) {
      log("Markera en text och kör ATTDEF för att ge den ett attributnamn.");
      return;
    }
    if (name === "INSERT" && !blockTemplates(doc).length) {
      log("Skapa först ett block med BLOCK.");
      return;
    }
    tool = { name, points: [], phase: "points" };
    editor.start(name);
    lastCommand = name;
    if (name === "INSERT")
      log(
        "Block: " +
          [...new Set(blockTemplates(doc).map((e) => e.definition.name))].join(
            ", ",
          ),
      );
    prompt();
    return;
  }
  if (name === "MVIEW" && (activeSpace === "model" || activeViewportId)) {
    log("Skapa viewports i layoutens pappersläge.");
    return;
  }
  if (Object.hasOwn(dimensionTools, name)) {
    const layer = doc.layers.find((l) => l.id === activeLayer);
    if (name !== "DIMCONTINUE" && (layer?.locked || layer?.visible === false)) {
      log("Välj ett synligt, olåst lager.");
      return;
    }
    clearTracking();
    input.value = "";
    lastCommand = name;
    editor.start(name);
    selection = new Set(tool.source ? [tool.source.id] : []);
    log(`${name} · Startat.`);
    prompt();
    update();
    return;
  }
  clearTracking();
  tool = { name, points: [], phase: "points" };
  lastCommand = name;
  input.value = "";
  $("#suggestions").hidden = true;
  const edit = transforms.includes(name) || ["ERASE", "OFFSET", "TRIM", "EXTEND", "FILLET", "CHAMFER", "PINSERT", "PDELETE", "JOIN", "EXPLODE", "STRETCH", "BSTRETCH"].includes(name);
  if (edit) {
    selection = new Set(
      [...selection].filter((id) => editableIds.has(id)),
    );
    if (!selection.size) tool.phase = "select";
    else if (name === "ERASE") {
      erase();
      return;
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
  if (editor.supports(name)) {
    editor.start(name);
    if (["JOIN", "EXPLODE"].includes(name) && selectedEntities().length)
      dispatchEditor({ type: "text", text: "" });
  }
  else editor.cancel();
  log(`${name} · ${tool?.phase === "select" ? "Välj objekt." : "Startat."}`);
  prompt();
  renderInspector();
  $("#selection-badge").textContent = selection.size;
}
function erase() {
  if (!selection.size) { start("ERASE"); return; }
  editor.start("ERASE");
  dispatchEditor({ type: "text", text: "" });
  prompt();
  update();
}
function dispatchEditor(event) {
  try {
    editor.dispatch(event);
    $("#selection-badge").textContent = selection.size;
  } catch (error) {
    log(error.message || "Ändringen kunde inte sparas.");
  }
}
function acceptPoint(p) {
  if (!editor.owns(tool)) return;
  dispatchEditor({ type: "point", point: p });
  prompt();
}
function submit(value) {
  const text = value.trim();
  if (text) {
    commandHistory.push(text);
    historyCursor = commandHistory.length;
  }
  input.value = "";
  $("#suggestions").hidden = true;
  if (!tool) { start(text || lastCommand); return; }
  dispatchEditor({ type: "text", text, cursor });
  prompt();
}
function hit(p) {
  let best = null,
    d = 8 / camera.scale;
  for (const e of sceneIndex.query({minX:p.x-d,maxX:p.x+d,minY:p.y-d,maxY:p.y+d}, true)) {
    if (!editable(e)) continue;
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
        (s) =>
          !drag.targets.some(
            (t) =>
              s.id === t.entity.id &&
              t.grips.some((g) => dist(s.p, g.p) < 1e-7),
          ),
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
  const started = textEditor.begin(isNew?entity:viewEntity(doc.entities.find(e=>e.id===entity.id)||entity)||entity, isNew);
  if (started) { textEditTarget = null; textEditor.position(); }
  return started;
}
function fitViewport(entity) {
  const model = doc.entities.filter(e => spaceOf(e) === "model" && !e.hidden && layerOf(e)?.visible !== false);
  const next = fitViewportToEntities(entity, model);
  if (!next) { log("Ingen synlig modellgeometri att anpassa vyn till."); return; }
  replaceEntities("Anpassa vy till modell", doc.entities.map(e => e.id === entity.id ? next : e));
}
function recoverLayoutViews(layoutId){
  const model=doc.entities.filter(e=>spaceOf(e)==='model' && !e.hidden && layerOf(e)?.visible!==false);
  const result=recoverEmptyViewports(doc.entities,layoutId,model);
  if(!result.count){log('Inga tomma vyer kunde återställas i detta ark.');return;}
  replaceEntities('Återställ tomma vyer',result.entities);
  log(`${result.count} tomma vyer visar nu en modellöversikt med standardskala. Justera detaljutsnittet via modellvyn och kontrollera arkets skaltexter/skalstockar.`);
}
function beginAttributeTextEdit(block, tag) {
  block = doc.entities.find(e => e.id === block.id) || block;
  if (!editableIds.has(block.id)) { log("Välj ett synligt, olåst block."); return false; }
  block=viewEntity(block)||block;
  const part = blockParts(block).find(p => p.attributeTag === tag);
  if (!part || part.hidden) { log("Attributet saknas eller är dolt."); return false; }
  const started = textEditor.begin(part);
  if (started) {
    textEditTarget = { blockId: block.id, definitionId: block.definition.id, tag };
    if (!activeViewportId && part.height * camera.scale < 12) {
      const b = bounds(block);
      camera = { x: (b.minX+b.maxX)/2, y: (b.minY+b.maxY)/2, scale: Math.min((width-100)/Math.max(b.maxX-b.minX,part.height), (height-100)/Math.max(b.maxY-b.minY,part.height)) };
    }
    textEditor.position();
    selection = new Set([block.id]); schedule();
  }
  return started;
}
function textEditPreview() {
  const entity = textEditor.preview();
  if (!entity) return null;
  if (!textEditTarget) return { originalId: textEditor.active.isNew ? null : entity.id, entity };
  const source = doc.entities.find(e => e.id === textEditTarget.blockId);
  const block=source && viewEntity(source);
  if (!block) return null;
  try { return { originalId: block.id, entity: withAttributeText(block, textEditTarget.tag, entity) }; }
  catch { return null; }
}
function finishTextEdit(save) {
  return textEditor.finish(save);
}
canvas.addEventListener("dblclick", (ev) => {
  if (tool || textEditor.active) return;
  moveCursor(ev);
  const e = hit(rawCursor);
  if (e?.type === "block") {
    let attribute = null, distance = 7 / camera.scale;
    for (const part of blockParts(e).filter(p => p.attributeTag && !p.hidden && layerOf(p)?.visible !== false)) {
      const d = hitDistance(part, rawCursor);
      if (d <= distance) { attribute = part; distance = d; }
    }
    if (attribute && beginAttributeTextEdit(e, attribute.attributeTag)) return;
    beginBlockEdit(e);
    return;
  }
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
      textEditor.active &&
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
  if (textEditor.active) {
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
    for (const e of interactionEntities||doc.entities) {
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
        targets: gripTargets(
          (interactionEntities||doc.entities).filter((e) => selection.has(e.id) && editable(e)),
          closest.g.p,
        ),
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
  if (tool && ["STRETCH","BSTRETCH"].includes(tool.name) && tool.phase === "window" && !tool.points.length) {
    drag={kind:"stretchWindow",start:{...mouse}};
    acceptPoint(rawCursor);schedule();return;
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
    navigating();
    const delta = cameraVector(camera, -(mouse.x - drag.start.x) / camera.scale, (mouse.y - drag.start.y) / camera.scale);
    camera.x = drag.camera.x + delta.x; camera.y = drag.camera.y + delta.y;
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
  if(drag.kind === "stretchWindow") {
    if(dist(mouse,drag.start)>4 && tool?.phase === "window")acceptPoint(rawCursor);
  } else if (drag.kind === "viewportMove") {
    if (dist(mouse, drag.start) > 4) {
      const e = movedViewport();
      replaceEntities("Flytta viewport",doc.entities.map((x) => (x.id === e.id ? e : x)));
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
        ids = (interactionEntities||doc.entities)
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
    const changed = moveGripTargets(drag.targets, cursor);
    const replacements = new Map(changed.map((e) => [e.id, e]));
    const entities = doc.entities.map((e) => replacements.get(e.id) || e);
    if (
      !validDocument({ ...doc, entities }) ||
      changed.some((e) => e.type === "line" && dist(...e.points) < 1e-8)
    )
      log("Greppen skulle ge ogiltig geometri.");
    else replaceEntities("Ändra grepp",entities);
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
    if (textEditor.active) return;
    if (
      activeViewportId &&
      doc.entities.find((e) => e.id === activeViewportId)?.locked
    )
      return;
    moveCursor(ev);
    const action = wheelNavigation(ev, $("#navigation-device").value, height);
    navigating();
    if (action.kind === "pan") {
      const delta = cameraVector(camera, action.dx / camera.scale, -action.dy / camera.scale);
      camera.x += delta.x; camera.y += delta.y;
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
  if ($("#help-dialog").open || $("#settings-dialog").open || textEditor.active) return;
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
function editSelected(label, fn) {
  commit(label, () => {
    doc.entities = doc.entities.map((e) =>
      selection.has(e.id) ? (()=>{const view=viewEntity(e),edited=fn(clone(view||e));return edited._annotationSource?storeAnnotationView(e,edited):edited;})() : e,
    );
  });
}
function creationInspector(root) {
  const source = tool.name === "DIMCONTINUE" ? tool.source : null;
  if (source) {
    appearanceFields(root, source, (key, value) => {
      source[key] = value;
      schedule();
    });
    return;
  }
  const type = tool.name.startsWith("DIM")
    ? "dimension"
    : { TEXT: "text", LEADER: "leader", HATCH: "hatch" }[tool.name];
  if (type)
    appearanceFields(
      root,
      { type, ...creationDefaults[type] },
      (key, value) => {
        creationDefaults[type][key] = value;
        schedule();
      },
    );
}
function renderInspector() {
  const root = $("#properties-panel");
  root.replaceChildren();
  generalProperties(root);
  if (blockEditor) blockInspector.renderEditor(root);
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
  const es = selectedEntities();
  if (!es.length) {
    if (activeSpace !== "model" && !activeViewportId)
      renderLayoutProperties(root, activeSpace);
    return;
  }
  if (es.length === 1 && es[0].type === "block") {
    blockInspector.renderInstance(root, es[0]);
    return;
  }
  if (es.length === 1) renderEntityProperties(root, es[0]);
  const b = document.createElement("button");
  b.className = "subtle-button";
  b.textContent = "Radera markerade";
  b.onclick = erase;
  root.append(b);
}
function panel(which) {
  if (which === "layers") {
    renderLayers();
    $("#layer-dialog").showModal();
  } else if ($("#layer-dialog").open) $("#layer-dialog").close();
}
$("#layers-tab").onclick = () => panel("layers");
$("#close-layers").onclick = () => $("#layer-dialog").close();
document.addEventListener("click", (ev) => {
  const b = ev.target.closest("[data-command]");
  if (b) start(b.dataset.command);
});
$("#fit-view").onclick = fit;
$("#toggle-grid").classList.toggle("active", showGrid);
$("#toggle-grid").setAttribute("aria-pressed", String(showGrid));
$("#toggle-grid").onclick = () => {
  showGrid = !showGrid;
  $("#toggle-grid").classList.toggle("active", showGrid);
  $("#toggle-grid").setAttribute("aria-pressed", String(showGrid));
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

function beginBlockEdit(entity) {
  if(entity?._annotationSource){entity=doc.entities.find(e=>e.id===entity.id)||entity;log("Blockeditorn redigerar den gemensamma grunddefinitionen för alla skalor. Textutseende på ett attribut ändrar den aktiva skalvarianten.");}
  if (blockEditor || entity?.type !== "block" || !editable(entity)) {
    log("Markera ett block som kan redigeras först.");
    return;
  }
  if (textEditor.active && !finishTextEdit(true)) return;
  syncViewport();
  projectStorage.cancel();
  projectStorage.save(doc).catch(error=>log('Huvudritningen kunde inte autosparas: '+error.message));
  blockEditor = new BlockEditSession(documentSession, entity.definition, {
    activeSpace, activeViewportId, paperCamera, camera, activeLayer, dirty,
    selection: [...selection],
  });
  documentSession = blockEditor.draft;
  doc = documentSession.document;
  history = documentSession.history;
  activeSpace = "model";
  activeViewportId = null;
  paperCamera = null;
  cancel();
  fit();
  panel("properties");
  log(
    "Blockeditor · redigera med ritverktygen · BSAVE sparar · BCANCEL avbryter.",
  );
}
function finishBlockEdit(save) {
  if (!blockEditor) return false;
  if (textEditor.active && !finishTextEdit(save)) return false;
  let result;
  try { result = blockEditor.finish(save); }
  catch (error) { log(error.message); return false; }
  const session = result.context;
  blockEditor = null;
  documentSession = result.documentSession;
  doc = documentSession.document;
  history = documentSession.history;
  activeSpace = session.activeSpace;
  activeViewportId = session.activeViewportId;
  paperCamera = session.paperCamera;
  camera = session.camera;
  activeLayer = session.activeLayer;
  dirty = session.dirty || result.changed;
  cancel();
  selection = new Set(session.selection);
  update();
  persisted();
  log(
    save
      ? "Blocket sparat. Alla instanser är uppdaterade."
      : "Blockredigering avbruten.",
  );
  return true;
}
window.addEventListener("pagehide", () => {
  captureProjectContext();
  projectWorkspace.flush().catch(() => {});
});
document.addEventListener('visibilitychange',()=>{
  if(document.hidden){ captureProjectContext(); projectWorkspace.flush().catch(()=>{}); }
});
window.addEventListener("beforeunload", (event) => {
  if (blockEditor) {
    event.preventDefault();
    event.returnValue = "";
  }
});

function captureProjectContext() {
  if (blockEditor) return;
  const entry = projectWorkspace.active;
  entry.context = {activeLayer,selection:[...selection],camera:{...camera},activeSpace,
    activeViewportId,paperCamera:paperCamera && {...paperCamera},
    spaceCameras:[...spaceCameras],dirty};
  projectWorkspace.persist();
}
function activateProject(entry) {
  projectWorkspace.activeId = entry.id;
  documentSession = entry.session;
  doc = documentSession.document;
  history = documentSession.history;
  projectStorage = entry.storage;
  const saved = entry.context || {};
  const validCamera = value => value && [value.x,value.y,value.scale].every(Number.isFinite) && value.scale > 0;
  activeLayer = doc.layers.some(layer => layer.id === saved.activeLayer) ? saved.activeLayer : doc.layers[0].id;
  selection = new Set(Array.isArray(saved.selection) ? saved.selection : []);
  activeSpace = saved.activeSpace || 'model';
  activeViewportId = saved.activeViewportId || null;
  camera = validCamera(saved.camera) ? {...saved.camera} : {x:0,y:0,scale:.075};
  paperCamera = validCamera(saved.paperCamera) ? {...saved.paperCamera} : null;
  spaceCameras.clear();
  if (Array.isArray(saved.spaceCameras)) for (const pair of saved.spaceCameras)
    if (Array.isArray(pair) && typeof pair[0] === 'string' && validCamera(pair[1])) spaceCameras.set(pair[0],{...pair[1]});
  dirty = !!saved.dirty;
  editor.cancel(); tool = null; drag = null; hover = null; snap = null;
  space = false; spaceUsed = false; clearTracking();
  input.value = ''; $('#suggestions').hidden = true; canvas.style.cursor = 'crosshair';
  clearTimeout(navigationTimer); navigationDeadline = 0;
  // Retain a single set of render/snap indexes, even with many open projects.
  sceneIndex = null; snapCache = null; indexedDocument = null; indexedSpace = null;
  update(); prompt();
  if (!entry.context) fit();
  projectWorkspace.persist();
  showProjectSaveState(entry);
}
function prepareProjectSwitch() {
  if (documentWorkflow.opening) { log('Vänta tills filen har öppnats.'); return false; }
  if (blockEditor) { log('Spara eller avbryt blockredigeringen innan du byter projekt.'); return false; }
  if (textEditor.active && !finishTextEdit(true)) return false;
  syncViewport();
  cancel(false);
  captureProjectContext();
  projectStorage.flush().catch(error => log('Projektet kunde inte autosparas: '+error.message));
  return true;
}
function switchProject(id) {
  if (id === projectWorkspace.activeId || !prepareProjectSwitch()) return;
  const entry = projectWorkspace.entries.find(entry => entry.id === id);
  if (entry) { activateProject(entry); canvas.focus(); }
}
function renderProjectTabs() {
  const tabs = $('#project-tabs');
  const signature = JSON.stringify([projectWorkspace.activeId,projectWorkspace.entries.map(entry =>
    [entry.id,entry.session.document.name,entry.saveState]),projectWorkspace.closed.map(entry => [entry.id,entry.name])]);
  if (tabs.dataset.state === signature) return;
  const focused = document.activeElement?.dataset.project;
  tabs.replaceChildren(...projectWorkspace.entries.map(entry => {
    const group = document.createElement('div'); group.className = 'project-tab'; group.setAttribute('role','presentation');
    const button = document.createElement('button'); button.type = 'button';
    button.id = 'tab-'+entry.id; button.dataset.project = entry.id;
    button.textContent = entry.session.document.name;
    button.title = entry.session.document.name+' · '+entry.saveState;
    button.setAttribute('role','tab'); button.setAttribute('aria-controls','canvas');
    button.setAttribute('aria-selected',String(entry.id === projectWorkspace.activeId));
    button.tabIndex = entry.id === projectWorkspace.activeId ? 0 : -1;
    button.onclick = () => switchProject(entry.id);
    const close = document.createElement('button'); close.type = 'button'; close.className = 'close-project';
    close.textContent = '×'; close.title = 'Stäng projektflik';
    close.setAttribute('aria-label','Stäng '+entry.session.document.name);
    close.disabled = projectWorkspace.entries.length === 1;
    close.onclick = async () => {
      if (!prepareProjectSwitch()) return;
      document.body.inert = true;
      try { if (await projectWorkspace.close(entry.id)) activateProject(projectWorkspace.active); }
      catch(error) { log('Kunde inte stänga projektfliken: '+error.message); }
      finally { document.body.inert = false; canvas.focus(); }
    };
    group.append(button,close); return group;
  }));
  canvas.setAttribute('aria-labelledby','tab-'+projectWorkspace.activeId);
  const reopen = $('#reopen-project');
  reopen.hidden = !projectWorkspace.closed.length;
  reopen.replaceChildren(new Option('Återöppna projekt…',''), ...projectWorkspace.closed.map(entry => new Option(entry.name,entry.id)));
  tabs.dataset.state = signature;
  if (focused) tabs.querySelector(`[data-project="${focused}"]`)?.focus();
}
$('#new-project-tab').onclick = () => $('#new-file').click();
$('#reopen-project').onchange = async event => {
  const id = event.target.value; event.target.value = '';
  if (!id || !prepareProjectSwitch()) return;
  document.body.inert = true;
  try { const entry = await projectWorkspace.reopen(id); if(entry)activateProject(entry); }
  catch(error) { log('Kunde inte återöppna projektet: '+error.message); }
  finally { document.body.inert = false; canvas.focus(); }
};
$('#project-tabs').onkeydown = event => {
  if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key) || !event.target.dataset.project) return;
  event.preventDefault(); event.stopPropagation();
  const entries = projectWorkspace.entries, index = entries.findIndex(entry => entry.id === event.target.dataset.project);
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? entries.length-1 :
    (index+(event.key === 'ArrowRight' ? 1 : -1)+entries.length)%entries.length;
  switchProject(entries[next].id);
  $(`#tab-${projectWorkspace.activeId}`).focus();
};

const documentWorkflow = createDocumentWorkflow({
  getDocument: () => doc,
  hasBlockEdit: () => Boolean(blockEditor),
  finishText: () => finishTextEdit(true),
  finishBlock: () => finishBlockEdit(true),
  hasPendingEdit: () => Boolean(tool || textEditor.active || drag),
  prepareOpen: () => { syncViewport(); cancel(false); },
  replaceDocument: (next, label) => {
    captureProjectContext();
    const entry = projectWorkspace.add(next);
    activateProject(entry);
    fit();
    entry.ready.then(() => {
      if (!entry.storage.pending) reportProjectSave(entry,entry.saveError);
      renderProjectTabs();
    });
  },
  syncView: syncViewport, download,
});
createSettingsPanel({
  document,
  getNavigation: () => $("#navigation-device").value,
  setNavigation: (value) => {
    $("#navigation-device").value = value;
    $("#navigation-device").dispatchEvent(new Event("change"));
  },
  getDocument: () => doc,
  canGenerate: () => !blockEditor && !documentWorkflow.opening,
  replaceDocument: documentWorkflow.replace, log,
});
function saveProject() {
  try {
    if (!documentWorkflow.save()) return;
    dirty = false;
    log("Projektfil sparad.");
  } catch (error) { log(`Kunde inte spara: ${error.message}`); }
}
function exportDxf() {
  try {
    if (!documentWorkflow.exportDXF()) return;
    log("DXF exporterad · block, attribut, bågpolylinjer och native mått bevaras.");
  } catch (error) { log(`Kunde inte exportera: ${error.message}`); }
}
$("#save-file").onclick = saveProject;
$("#export-dxf").onclick = exportDxf;
$("#open-file").onclick = () => $("#file-input").click();
$("#close-import").onclick = () => $("#import-dialog").close();
async function openDrawingFile(f) {
    const result = await documentWorkflow.open(f, {
      onProgress: log,
    });
    if (!result) return false;
    const { imported } = result;
    log(`Öppnat ${f.name}`);
    if (imported) {
      $("#import-dialog h2").textContent = /\.dwg$/i.test(f.name)
        ? "DWG-import"
        : "DXF-import";
      $("#import-summary").textContent =
        `${imported.count} objekt inlästa. ${imported.report.length ? "Följande avvikelser hittades:" : "Inga kända importavvikelser hittades."}`;
      $("#import-issues").replaceChildren(
        ...imported.report.map((item) => {
          const li = document.createElement("li");
          li.textContent = `${item.message} (${item.count})`;
          return li;
        }),
      );
      $("#import-dialog").showModal();
    }
}
const fileOpenQueue = createFileOpenQueue({
  openFile: openDrawingFile,
  canOpen: () => !blockEditor && !documentWorkflow.opening,
  onError: error => log(`Kunde inte öppna: ${error.message}`),
  onPending: count => {
    const button = $("#queued-files");
    button.hidden = count === 0;
    button.textContent = `Öppna väntande filer (${count})`;
    button.title = "Avsluta blockredigeringen och öppna filerna i nya projektflikar.";
  },
});
$("#queued-files").onclick = () => {
  if (blockEditor) log("Avsluta blockredigeringen först. Filerna finns kvar i kön.");
  else fileOpenQueue.resume();
};
$("#file-input").onchange = ev => {
  const files = Array.from(ev.target.files);
  ev.target.value = "";
  fileOpenQueue.enqueueFiles(files);
};
$("#new-file").onclick = () => {
  try {
    if (!documentWorkflow.replace({
      version: 1, name: "Namnlös ritning",
      layers: [{ id: uid(), name: "0", color: "#c3d6ce", visible: true, locked: false }],
      entities: [],
    }, "Ny ritning")) return;
    log("Ny ritning öppnad i en egen projektflik.");
  } catch (error) { log(error.message); }
};
$("#demo-file").onclick = () => {
  try {
    if (documentWorkflow.replace(demoDocument(), "Exempelritning")) log("Exempelritningen är öppnad.");
  } catch (error) { log(error.message); }
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
activateProject(initialProject);
if (!initialProject.context) fit();
prompt();
log(
  "LiraCAD 0.1 · Skriv ett kommando, välj ett verktyg eller öppna Snabbguide.",
);
if (restoreError)
  log("Det lokala utkastet kunde inte läsas och lämnas orört. Autosparning är pausad. Spara fortsatt arbete till fil.");
if (restored.migrationError)
  log('Det äldre utkastet har öppnats men kunde inte flyttas till den nya lagringen. Det gamla utkastet finns kvar.');
if(restored.recoveryError){
  log('Väntande objekttillägg återställdes men kunde inte autosparas. Återställningsloggen finns kvar. Spara projekt till fil.');
  persisted();
}

setupPWA(async () => {
  if (blockEditor)
    return "Spara eller avbryt blockredigeringen före uppdatering.";
  if (tool || drag)
    return "Avsluta eller avbryt pågående kommando före uppdatering.";
  if (textEditor.active && !finishTextEdit(true)) return "Spara eller avbryt textredigeringen före uppdatering.";
  syncViewport();
  document.body.inert = true;
  try { await projectStorage.save(doc,reportLocalSave); }
  finally { document.body.inert = false; }
});

initializeLiraShell();
const fileLaunchSupported = setupFileLaunch(fileOpenQueue);
$("#file-launch-status").textContent = fileLaunchSupported
  ? "Filöppning från operativsystemet stöds i den här webbläsaren. LiraCAD behöver vara installerad som app för att visas i Windows."
  : "Den här webbläsaren saknar filöppning från operativsystemet. Installera LiraCAD med Edge eller Chrome på Windows. Öppna projekt fungerar här.";

for (const [id, factor] of [["#zoom-out", 1 / 1.25], ["#zoom-in", 1.25]]) {
  $(id).onclick = () => {
    camera.scale = Math.max(0.000001, Math.min(10000, camera.scale * factor));
    schedule();
  };
}
