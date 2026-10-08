import { createImportDialog } from "./import-dialog.js";
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
import { toolbarGroups, toolbarLabels } from "./toolbar-groups.js";
import { createCommandCompletion } from "./command-completion.js";
import { createLayerPanel } from "./layer-panel.js";
import { createReferencePanel } from "./reference-panel.js";
import { loadReference, referenceEntities, detachReference, bindReference, findReference } from "./references.js";
import { resolveReferenceFiles } from "./reference-files.js";
import { readDrawingFile } from "./file-import.js";
import { createDetailCatalog } from "./detail-catalog.js";
import { initializeLiraShell } from "./lira-shell.js";
import { Editor } from "./editor.js";
import { drawingTools } from "./drawing-tools.js";
import { stretchTools } from "./stretch-tools.js";
import { wblockTools } from "./wblock-tools.js";
import { createWblockDialog } from "./wblock-dialog.js";
import { beginSelectionGesture, moveSelectionGesture, releaseSelectionGesture } from "./selection-gesture.js";
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
  createBlock,
  blockParts,
  withAttributeText,
} from "./blocks.js";
import { setupPWA } from "./pwa.js";
import { createFileOpenQueue, setupFileLaunch, setupFileDrop } from "./file-launch.js";
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
import { TAU, dist, add, sub, mul, angle, polar, number, parsePoint } from "./geometry.js";
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
for (const [category, groups] of Object.entries(toolbarGroups)) {
  const panel=$(`[data-tool-panel="${category}"]`);
  for (const {label:heading,commands} of groups) {
    const section=document.createElement('section');section.className='toolbar-section';
    section.setAttribute('aria-label',heading);
    const title=document.createElement('h3');title.textContent=heading;section.append(title);
    for (const name of commands) {
      const [,label,alias]=definitions.find(d=>d[0]===name);
      const b=document.createElement('button');b.dataset.command=name;b.title=`${label} · ${alias}${name==='TRIM'?' · Shift växlar funktion':''}`;
      b.innerHTML=`<span class="tool-icon"><svg viewBox="0 0 24 24" aria-hidden="true">${icons[name]}</svg></span><span>${toolbarLabels[name]||label}</span>`;
      section.append(b);
    }
    panel.append(section);
  }
}
let blockEditor = null;
let parameterEdit = null;
let trimShift=false;
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
const emptyDocument = () => ({version:1,name:'',layers:[{id:'0',name:'0',color:'#c3d6ce'}],entities:[]});
let projectStorage = initialProject?.storage || null;
const restored = initialProject?.restored || {};
let documentSession = initialProject?.session || new DocumentSession(emptyDocument());
let doc = documentSession.document;
$('#save-state').textContent = initialProject?.saveState || '';
$('#save-state').title = initialProject?.saveError?.message || '';
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
  editable = (e) => !e._xrefId && visible(e) && !layerOf(e)?.locked;
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
  document, renderAttributeManager, attributeValueField, editSelected, beginEdit: beginBlockEdit, renderGeneralProperties:generalProperties, erase,
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
    catalogPlacementReason: catalogPlacementReason(),
    ...(tool?.name === "MVIEW" ? { modelCenter: modelExtentsCenter(), activeViewportId } : {}),
    creation: { layer: activeLayer, space: drawingSpace(), color: creationColor, lineType: creationLineType, ...creationDefaults.dimension },
    ...(tool && ["OFFSET", "TRIM", "EXTEND", "FILLET", "CHAMFER", "PINSERT", "PDELETE", "STRETCH", "BSTRETCH", ...Object.keys(dimensionTools)].includes(tool.name) ? {
      editableEntities: (interactionEntities||doc.entities).filter(editable),
      ...(["TRIM","EXTEND"].includes(tool.name)?{shift:trimShift,boundaryEntities:(interactionEntities||doc.entities).filter(visible).flatMap(e=>e.type==='block'?blockParts(e).filter(visible):[e])}:{}),
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
let inspectorMode = "properties";
function catalogPlacementReason() {
  if (!projectWorkspace.active) return "Öppna eller skapa en ritning först.";
  if (blockEditor) return "Avsluta blockeditorn först.";
  if (drawingSpace() !== "model") return "Växla till Model för att placera en detalj.";
  const layer = doc.layers.find(l => l.id === activeLayer);
  return !layer || layer.locked || layer.visible === false ? "Välj ett synligt, olåst lager först." : "";
}
const detailCatalog = createDetailCatalog({
  document, root: $("#catalog-panel"), getDocument: () => doc,
  getProjectId: () => projectWorkspace.activeId, getLayer: () => activeLayer,
  getPlacementReason: catalogPlacementReason, storage: localStorage,
  place: (placement) => {
    const reason = catalogPlacementReason();
    if (reason) { log(reason); return; }
    if (textEditor.active && !finishTextEdit(true)) return;
    cancel(false);
    editor.start("INSERT");
    editor.dispatch({ type: "catalog", ...placement });
    lastCommand = "INSERT";
    prompt(); canvas.focus();
  },
});
function referenceReason() {
  return !projectWorkspace.active ? "Öppna eller skapa en ritning först." : blockEditor ? "Avsluta blockeditorn först." : "";
}
async function pickReferenceFiles({folder=false,multiple=true}={}) {
  return new Promise(resolve=>{
    const picker=document.createElement('input');picker.type='file';picker.accept='.dwg,.dxf,.liracad';picker.multiple=multiple;picker.hidden=true;
    if(folder)picker.setAttribute('webkitdirectory','');
    const finish=()=>{const files=[...picker.files];picker.remove();resolve(files);};
    picker.onchange=finish;picker.oncancel=()=>{picker.remove();resolve([]);};
    document.body.append(picker);picker.click();
  });
}
async function readReference(id=null,{folder=false,resolveOnly=false,reloadAll=false}={}) {
  try {
    const reason=referenceReason();if(reason)throw Error(reason);
    if(textEditor.active && !finishTextEdit(true))return;
    cancel(false);
    const previous=doc,projectId=projectWorkspace.activeId;
    const files=await pickReferenceFiles({folder,multiple:!id});
    if(!files.length)return;
    const result=await resolveReferenceFiles(previous,files,{readFile:readDrawingFile,linkNew:!id && !resolveOnly && !reloadAll,reloadAll,targetId:id,onProgress:log});
    if(doc!==previous || projectWorkspace.activeId!==projectId || blockEditor || tool || textEditor.active)throw Error('Ritningen ändrades medan referenserna lästes. Försök igen.');
    if(result.loaded || !reloadAll)commit(reloadAll?'Ladda om alla referenser':id?'Ladda om referens':'Länka referensfiler',()=>{doc=result.document;});
    log(`${result.loaded} ${reloadAll?(result.loaded===1?'referens uppdaterad':'referenser uppdaterade'):(result.loaded===1?"referens inläst":"referenser inlästa")}${reloadAll && result.notFound.length?` · ${result.notFound.length} filer saknas i urvalet`:''}${reloadAll && result.ambiguous.length?` · ${result.ambiguous.length} tvetydiga länkar`:''}${result.missing?` · ${result.missing} länkar behöver lösas`:''}.`);
    for(const message of result.messages)log(message);
  } catch(error) {if(error.name!=='AbortError')log(error.message);}
}
const referencePanel=createReferencePanel({
  document,root:$('#references-panel'),getDocument:()=>doc,getProjectId:()=>projectWorkspace.activeId,getReason:referenceReason,
  chooseFile:(id,options)=>readReference(id,options),reload:id=>readReference(id),
  change:(id,patch,label)=>{try{if(referenceReason())throw Error(referenceReason());commit(label,draft=>{const r=findReference(draft,id);if(!r)throw Error('Referensen finns inte längre.');Object.assign(r,patch);});}catch(error){log(error.message);}},
  detach:id=>{if(referenceReason()){log(referenceReason());return;}commit('Ta bort referens',draft=>{detachReference(draft,id);if(!draft.layers.some(l=>l.id===activeLayer))activeLayer=draft.layers[0].id;});},
  bind:id=>{try{if(referenceReason())throw Error(referenceReason());commit('Bind referens',draft=>bindReference(draft,id,activeLayer));log('Referensen är nu ett lokalt block.');}catch(error){log(error.message);}},
});
function showInspector(mode) {
  inspectorMode = mode;
  document.body.classList.toggle("catalog-open", mode !== "properties");
  for (const name of ["properties", "catalog", "references"]) {
    const active = mode === name, tab = $(`#${name}-tab`);
    tab.setAttribute("aria-selected", String(active));
    tab.tabIndex = active ? 0 : -1;
    $(`#${name}-panel`).hidden = !active;
  }
  $(".inspector-header h1").textContent = mode === "references" ? "Referenser" : mode === "catalog" ? "Detaljkatalog" : "Egenskaper";
  $("#selection-badge").hidden = mode !== "properties";
  renderInspector(); resize();
}
for (const name of ["properties", "catalog", "references"]) {
  const tab = $(`#${name}-tab`);
  tab.onclick = () => showInspector(name);
  tab.onkeydown = event => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const names = ["properties", "catalog", "references"], index = names.indexOf(name);
    const target = event.key === "Home" ? names[0] : event.key === "End" ? names.at(-1) : names[(index + (event.key === "ArrowRight" ? 1 : 2)) % names.length];
    showInspector(target); $(`#${target}-tab`).focus();
  };
}
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
  const es = [...referenceEntities(doc),...doc.entities].filter((e) => spaceOf(e) === "model" && !e.hidden && layerOf(e)?.visible!==false);
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
  interactionEntities=[...referenceEntities(doc),...doc.entities].map(viewEntity).filter(Boolean);
  sceneIndex = sceneIndex ? sceneIndex.update(interactionEntities) : createSpatialIndex(interactionEntities, bounds);
  snapCache = snapCache ? snapCache.update(interactionEntities,sceneIndex) : createLocalSnapIndex(interactionEntities,{entityIndex:sceneIndex,eligible:e=>visible(e) && e._xrefSnap!==false});
  editableIds = new Set(interactionEntities.filter(editable).map(e => e.id));
  indexedDocument = doc;
  indexedSpace = space;
}
function persisted() {
  if (!projectWorkspace.active) return;
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
  renderWorkspaceState();
  if (!projectWorkspace.active) { renderProjectTabs(); renderInspector(); schedule(); return; }
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
  $("#layer-count").textContent = `${doc.layers.length} lager`;
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
    // Keep rectangle selection, properties and grips in sync with the indexes.
    interactionEntities=interactionEntities.concat(added);
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
    doc: {...doc, entities: interactionEntities || doc.entities}, camera, paperCamera, width, height, dpr, activeSpace, activeViewportId,
    selection, hover, tool, cursor, mouse, showGrid, drag, trackAnchors, snap,
    previews: previewEntities(), gripPreviews,
    blockParameter:blockEditor?blockInspector.getActiveParameter():null,
    textReplacement: textEditPreview(),
    movedViewport: drag?.kind === "viewportMove" && drag.moved ? movedViewport() : null,
    previewTargets: tool?.sweep?.changes.map(change=>change.id) || [],
    previewTarget: !tool?.sweep && tool && ["TRIM", "EXTEND"].includes(tool.name) && tool.phase === "trimPick" && editor.preview(cursor).length
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
  $("#status-mode").textContent = tool?.catalog ? `Placera ${tool.catalog.label}` : tool
    ? tool.name==='EXTEND'?'Trimma / Förläng':definitions.find((d) => d[0] === tool.name)?.[1] || tool.name
    : "Redo";
  const toolbarCommand=tool?.name==='EXTEND'?'TRIM':tool?.name;
  $$("[data-command]").forEach((b) => {
    b.classList.toggle("active", b.dataset.command === toolbarCommand);
    b.classList.toggle(
      "selected",
      b.dataset.command === (toolbarCommand || "SELECT"),
    );
  });
  canvas.style.cursor = tool?.name === "PAN" ? "grab" : "crosshair";
  renderInspector();
  schedule();
}
function cancel(clear = true) {
  wblockDialog.dismiss();
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
  if (!projectWorkspace.active) return;
  drag=null;
  if (textEditor.active && !finishTextEdit(true)) return;
  name = aliases[name.toUpperCase()] || name.toUpperCase();
  if (["MT", "MTEXT"].includes(name)) name = "TEXT";
  if (name !== 'WBLOCK') wblockDialog.dismiss();
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
    cancel(false);lastCommand=name;wblockDialog.open();return;
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
    if(['TRIM','EXTEND'].includes(name))selection.clear();
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
  if (wblockDialog.picking === 'base') { wblockDialog.resume(p); return; }
  if (!editor.owns(tool)) return;
  dispatchEditor({ type: "point", point: p });
  prompt();
}
function submit(value) {
  if (!projectWorkspace.active) return;
  const text = value.trim();
  if (wblockDialog.picking) {
    input.value='';
    if (wblockDialog.picking === 'objects') {
      if (!text) wblockDialog.resume();
      else log('Markera objekten och tryck Enter för att återgå till WBLOCK.');
    } else {
      const point=text?parsePoint(text,null,cursor):{x:0,y:0};
      if(point)wblockDialog.resume(point);else log('Ange en baspunkt, t.ex. 100,200.');
    }
    return;
  }
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
    (tool?.name === "WBLOCK" && tool.phase === "dialogBase") ||
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
  setTrimShift(ev.shiftKey);
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
  if(drag?.kind==='select'&&drag.phase==='corner'){
    drag={...drag,phase:'finish'};
    schedule();return;
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
  if (tool && ["TRIM", "EXTEND"].includes(tool.name)) {
    drag = { kind: "trimSweep", pointerId: ev.pointerId };
    dispatchEditor({ type: "sweepStart" });
    prompt(); schedule(); return;
  }
  if (tool && tool.phase !== "select") {
    acceptPoint(cursor);
    schedule();
    return;
  }
  drag = beginSelectionGesture(mouse,rawCursor,ev.shiftKey);
});
// Suppress native middle-button autoscroll/paste without affecting CAD pan.
for (const name of ["mousedown", "auxclick"]) {
  canvas.addEventListener(name, (ev) => {
    if (ev.button === 1) ev.preventDefault();
  });
}
canvas.addEventListener("pointermove", (ev) => {
  setTrimShift(ev.shiftKey);
  moveCursor(ev);
  if (drag?.kind === "pan") {
    navigating();
    const delta = cameraVector(camera, -(mouse.x - drag.start.x) / camera.scale, (mouse.y - drag.start.y) / camera.scale);
    camera.x = drag.camera.x + delta.x; camera.y = drag.camera.y + delta.y;
  } else if(drag?.kind==='trimSweep')dispatchEditor({type:"sweepMove"});
  else if(drag?.kind==='select')drag=moveSelectionGesture(drag,mouse);
  else if(drag?.kind==='viewportMove')drag.moved = dist(mouse, drag.start) > 4;
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
  if(drag.kind === "trimSweep") {
    setTrimShift(ev.shiftKey);
    dispatchEditor({ type: "sweepEnd" });
    // A rejected commit must not leave a staged preview behind.
    if (tool?.sweep) dispatchEditor({ type: "sweepCancel" });
    prompt();
  } else if(drag.kind === "stretchWindow") {
    if(dist(mouse,drag.start)>4 && tool?.phase === "window")acceptPoint(rawCursor);
  } else if (drag.kind === "viewportMove") {
    if (dist(mouse, drag.start) > 4) {
      const e = movedViewport();
      replaceEntities("Flytta viewport",doc.entities.map((x) => (x.id === e.id ? e : x)));
    }
  } else if (drag.kind === "select") {
    const action=releaseSelectionGesture(drag,mouse,rawCursor,drag.moved||drag.phase==='finish'?null:hit(rawCursor)?.id);
    if(action.kind==='pending'){
      drag=action.gesture;
      if(!drag.shift)selection.clear();
      log('Markering · Ange motsatt hörn eller Esc.');
      update();return;
    }
    if (action.kind==='rectangle') {
      const r=action.region,
        ids = (interactionEntities||doc.entities)
          .filter(
            (e) => editable(e) && rectSelect(e, r, action.crossing),
          )
          .map((e) => e.id);
      if (!action.shift) selection.clear();
      ids.forEach((id) => selection.add(id));
    } else {
      if (!action.shift) selection.clear();
      if (action.shift && selection.has(action.id)) selection.delete(action.id);
      else selection.add(action.id);
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
function cancelTrimSweep() {
  if (tool?.sweep) dispatchEditor({ type: "sweepCancel" });
}
canvas.addEventListener("lostpointercapture", () => {
  if(drag?.kind !== "trimSweep")return;
  cancelTrimSweep(); drag=null; schedule();
});
canvas.addEventListener("pointercancel", () => {
  cancelTrimSweep();
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
const commandCompletion = createCommandCompletion({
  input, popup: $("#suggestions"),
  enabled: () => !tool && !wblockDialog.picking,
  submit,
});
input.addEventListener("keydown", (ev) => {
  if (ev.isComposing) return;
  if (commandCompletion.navigate(ev)) return;
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
    commandCompletion.hide();
  }
  if (commandSubmitKey(ev, tool?.phase === "text")) {
    ev.preventDefault();
    ev.stopPropagation();
    const value = commandCompletion.resolve();
    commandCompletion.hide();
    submit(value);
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
});
document.addEventListener("keydown", (ev) => {
  if(ev.key==='Shift')setTrimShift(true);
  if (!projectWorkspace.active) return;
  const editing = ev.target.matches(
    "input,select,textarea,[contenteditable=true]",
  );
  if ($("#help-dialog").open || $("#settings-dialog").open || $("#wblock-dialog").open || textEditor.active) return;
  if (ev.isComposing) return;
  if (ev.key === "Escape") {
    ev.preventDefault();
    if (wblockDialog.picking) { wblockDialog.resume(); return; }
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
  if(ev.key==='Shift')setTrimShift(false);
  if (ev.code === "Space") {
    const shouldSubmit = space && !spaceUsed;
    space = false;
    if (shouldSubmit) submit("");
  }
});
window.addEventListener("blur", () => {
  cancelTrimSweep();
  setTrimShift(false);
  space = false;
  drag = null;
  mouse = { x: -1, y: -1 };
  acquireTrack(null);
  schedule();
});
function setTrimShift(value){
  if(trimShift===!!value)return;
  trimShift=!!value;
  if(editor.owns(tool) && ['TRIM','EXTEND'].includes(tool.name)){
    dispatchEditor({type:'modifier',shift:trimShift});prompt();schedule();
  }
}
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
  if (inspectorMode === "catalog") { detailCatalog.refresh(); return; }
  if (inspectorMode === "references") { referencePanel.refresh(); return; }
  const root = $("#properties-panel");
  root.replaceChildren();
  const es = selectedEntities();
  const creating=tool && !transforms.includes(tool.name) && !['ERASE','OFFSET','JOIN','EXPLODE','PINSERT','PDELETE','FILLET','CHAMFER'].includes(tool.name);
  if(blockEditor || creating || es.length!==1 || es[0].type!=='block')generalProperties(root);
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

const wblockDialog = createWblockDialog({
  document, getDocument:()=>doc, getSelected:selectedEntities, download, notify:log,
  pickFile:typeof window.showSaveFilePicker==='function' ? name=>window.showSaveFilePicker({suggestedName:name,types:[{description:'DXF-ritning',accept:{'application/dxf':['.dxf']}}]}) : null,
  beginPick:kind=>{
    editor.cancel();drag=null;clearTracking();
    tool={name:'WBLOCK',phase:kind==='objects'?'select':'dialogBase',points:[]};
    log(kind==='objects'?'WBLOCK · Markera objekt och tryck Enter.':'WBLOCK · Klicka på baspunkten eller ange X,Y. Esc återgår till dialogen.');
    update();
  },
  endPick:()=>{editor.cancel();tool=null;drag=null;clearTracking();snap=null;prompt();update();},
  prepareChange:(request,action,blockName)=>{
    if(action==='retain')return null;
    const sources=doc.entities.filter(e=>request.entityIds.includes(e.id));
    if(sources.some(e=>!editableIds.has(e.id)))throw Error('Originalobjekten måste vara synliga och olåsta för att ändras efter export.');
    if(action==='delete')return ()=>replaceEntities('WBLOCK · Ta bort exporterade objekt',doc.entities.filter(e=>!request.entityIds.includes(e.id)));
    if(blockTemplates(doc).some(b=>b.definition.name.toLowerCase()===blockName.trim().toLowerCase()))throw Error('Blocknamnet används redan.');
    if(new Set(sources.map(spaceOf)).size!==1)throw Error('Välj objekt i samma modell eller layout för att skapa ett block.');
    const block=createBlock(sources,blockName.trim(),request.base,sources[0].layer,spaceOf(sources[0]));
    const change={kind:'editing',label:'WBLOCK · Omvandla till block',replaceIds:request.entityIds,entities:[block],definitions:[block.definition]};
    if(!validDocument({...doc,entities:applyEditingChange(doc.entities,change),blocks:[...(doc.blocks||[]),block.definition]}))throw Error('Objekten kunde inte omvandlas till ett giltigt block.');
    return ()=>{applyObjectChange(change);selection=new Set([block.id]);update();};
  },
});

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
  if (!entry) return;
  entry.context = {activeLayer,selection:[...selection],camera:{...camera},activeSpace,
    activeViewportId,paperCamera:paperCamera && {...paperCamera},
    spaceCameras:[...spaceCameras],dirty};
  projectWorkspace.persist();
}
function activateProject(entry) {
  if (!entry) {
    editor.cancel(); wblockDialog.dismiss(); tool=null; drag=null; hover=null; snap=null;
    selection.clear(); clearTracking(); space=false; spaceUsed=false; dirty=false;
    documentSession=new DocumentSession(emptyDocument()); doc=documentSession.document;
    history=documentSession.history; projectStorage=null;
    activeLayer=doc.layers[0].id; activeSpace='model'; activeViewportId=null; paperCamera=null;
    spaceCameras.clear(); sceneIndex=null; snapCache=null; indexedDocument=null; indexedSpace=null;
    rebuild(); commandCompletion.hide(); input.value='';
    clearTimeout(navigationTimer); navigationDeadline=0;
    update(); return;
  }
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
  update(); resize(); prompt();
  if (!entry.context) fit();
  projectWorkspace.persist();
  showProjectSaveState(entry);
}
function prepareProjectSwitch() {
  if (documentWorkflow.opening) { log('Vänta tills filen har öppnats.'); return false; }
  if (blockEditor) { log('Spara eller avbryt blockredigeringen innan du byter projekt.'); return false; }
  if (!projectWorkspace.active) return true;
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
function renderWorkspaceState() {
  const empty = !projectWorkspace.active;
  document.body.classList.toggle('workspace-empty', empty);
  $('#empty-workspace').hidden = !empty;
  for (const element of $$('#canvas, .tabs, .ribbon, main > aside, .drawing-tabs, .command-panel, body > footer')) element.inert = empty;
  $('#save-file').disabled = empty;
  $('#export-dxf').disabled = empty || !!blockEditor;
  input.disabled = empty;
  if (empty) {
    $('#undo').disabled=true; $('#redo').disabled=true;
    $('#document-name').textContent='Ingen ritning öppen';
    $('#save-state').textContent=''; $('#save-state').title='';
  }
}
function focusWorkspace() {
  (projectWorkspace.active ? canvas : $('#empty-new')).focus();
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
    close.onclick = async () => {
      if (!prepareProjectSwitch()) return;
      document.body.inert = true;
      try { if (await projectWorkspace.close(entry.id)) activateProject(projectWorkspace.active); }
      catch(error) { log('Kunde inte stänga projektfliken: '+error.message); }
      finally { document.body.inert = false; focusWorkspace(); }
    };
    group.append(button,close); return group;
  }));
  if (projectWorkspace.active) canvas.setAttribute('aria-labelledby','tab-'+projectWorkspace.activeId);
  else canvas.removeAttribute('aria-labelledby');
  const reopen = $('#reopen-project');
  reopen.hidden = !projectWorkspace.closed.length;
  reopen.replaceChildren(new Option('Återöppna projekt…',''), ...projectWorkspace.closed.map(entry => new Option(entry.name,entry.id)));
  tabs.dataset.state = signature;
  if (focused) tabs.querySelector(`[data-project="${focused}"]`)?.focus();
}
$('#new-project-tab').onclick = () => $('#new-file').click();
$('#empty-new').onclick = () => { $('#new-file').click(); focusWorkspace(); };
$('#empty-open').onclick = () => $('#open-file').click();
$('#reopen-project').onchange = async event => {
  const id = event.target.value; event.target.value = '';
  if (!id || !prepareProjectSwitch()) return;
  document.body.inert = true;
  try { const entry = await projectWorkspace.reopen(id); if(entry)activateProject(entry); }
  catch(error) { log('Kunde inte återöppna projektet: '+error.message); }
  finally { document.body.inert = false; focusWorkspace(); }
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
  if (!projectWorkspace.active) return;
  try {
    if (!documentWorkflow.save()) return;
    dirty = false;
    log("Projektfil sparad.");
  } catch (error) { log(`Kunde inte spara: ${error.message}`); }
}
function exportDxf() {
  if (!projectWorkspace.active) return;
  try {
    if (!documentWorkflow.exportDXF()) return;
    log("DXF exporterad · block, attribut, bågpolylinjer och native mått bevaras.");
    if(doc.references?.length)log('Xref-länkar exporterade. Skicka med källfilerna. Referenser från DXF/LiraCAD behöver bindas eller sparas som DWG för AutoCAD.');
  } catch (error) { log(`Kunde inte exportera: ${error.message}`); }
}
$("#save-file").onclick = saveProject;
$("#export-dxf").onclick = exportDxf;
$("#open-file").onclick = () => $("#file-input").click();
const importDialog = createImportDialog({ document, download });
async function openDrawingFile(f) {
  const cad = /\.(dwg|dxf)$/i.test(f.name);
  const startedAt = new Date().toISOString(), started = performance.now();
  const events = [];
  const record = (level, message, details) => {
    if (events.length < 5000) events.push({ time: new Date().toISOString(), level, message, ...(details ? { details } : {}) });
  };
  const session = (result, error) => ({
    file: f, source: { name: f.name, size: f.size, lastModified: f.lastModified },
    startedAt, durationMs: Math.round(performance.now() - started), appVersion: '0.1.0',
    environment: { userAgent: navigator.userAgent, language: navigator.language },
    count: result?.imported?.count || 0, issues: result?.imported?.report || [],
    events, error: error ? { message: error.message, stack: error.stack } : null,
    limitations: ['DWG-läsaren returnerar högst 200 unika meddelanden.', 'Importloggens händelser begränsas till 5000.'],
  });
  try {
    const result = await documentWorkflow.open(f, {
      onProgress: message => { log(message); record('progress', message); },
      onDiagnostic: diagnostic => record(diagnostic.level || 'info', diagnostic.message, diagnostic.details),
    });
    if (!result) return false;
    log(`Öppnat ${f.name}`);
    if (result.imported) importDialog.show(session(result));
  } catch (error) {
    record('error', error.message, error.stack);
    if (cad) importDialog.show(session(null, error));
    throw error;
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
setupFileDrop(fileOpenQueue, {
  onActive: active => { $("#file-drop-hint").hidden = !active; },
});
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
if (initialProject && !initialProject.context) fit();
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
  if (!projectWorkspace.active) return;
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
