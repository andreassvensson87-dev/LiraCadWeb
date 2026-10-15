import { setupFileDrop } from "./ui/file-drop.js";
import { createInspectorActions } from "./editor/inspector-actions.js";
import { installTextMetrics } from "./rendering/canvas-text-metrics.js";
import { createWorkspaceController } from "./editor/workspace-controller.js";
import { createDocumentContext } from "./editor/document-context.js";
import { createWorkspaceBindings } from "./ui/workspace-bindings.js";
import { createWblockController } from "./editor/wblock-controller.js";
import { createPropertyController } from "./editor/property-controller.js";
import { createEditorActions } from "./editor/editor-actions.js";
import { createActiveDocument } from "./editor/active-document.js";
import { createSpaceTabs } from "./ui/space-tabs.js";
import { createWorkspaceView } from "./ui/workspace-view.js";
import { createTextEditController } from "./editor/text-edit-controller.js";
import { createReferenceController } from "./app/reference-controller.js";
import { createImportController } from "./app/import-controller.js";
import { createInspectorComposition } from "./ui/inspector-composition.js";
import { createCreationSettings } from "./editor/creation-settings.js";
import { createToolContext } from "./editor/tool-context.js";
import { createSaveController } from "./app/save-controller.js";
import { createEntityEditController } from "./editor/entity-edit-controller.js";
import { createProjectController } from "./app/project-controller.js";
import { createBlockController } from "./app/block-controller.js";
import { createSelectionController } from "./editor/selection-controller.js";
import { createLayoutController } from "./editor/layout-controller.js";
import { createViewportController } from "./app/viewport-controller.js";
import { createCursorFeedback } from "./ui/cursor-feedback.js";
import { createDocumentEditor } from "./editor/document-editor.js";
import { createCommandFeedback } from "./ui/command-feedback.js";

import { createProjectTabs } from "./ui/project-tabs.js";
import { createInspectorController } from "./ui/inspector-controller.js";
import { installRibbon } from "./ui/ribbon.js";
import { installInputController } from "./ui/input-controller.js";
import { createCommandController } from "./editor/command-controller.js";
import { createCursorController } from "./editor/cursor-controller.js";
import { createEditorState } from "./editor/editor-state.js";
import { createImportDialog } from "./ui/import-dialog.js";

import { loadCadFonts } from "./rendering/cad-fonts.js";

import { createReferencePanel } from "./ui/reference-panel.js";

import { createDetailCatalog } from "./ui/detail-catalog.js";
import { installCadShell } from "./ui/cad-shell.js";

import { createWblockDialog } from "./ui/wblock-dialog.js";

import { createTextEditor } from "./ui/text-editor.js";

import { DocumentSession } from "./model/document-session.js";

import { createSettingsPanel } from "./ui/settings-panel.js";
import { createDocumentWorkflow } from "./app/document-workflow.js";
import { ProjectStorage } from "./storage/project-storage.js";
import { ProjectWorkspace } from "./storage/project-workspace.js";

import { setupPWA } from "./ui/pwa.js";
import { createFileOpenQueue, setupFileLaunch } from "./io/file-launch.js";

import { IndexedDBProjectStore } from "./storage/indexeddb-project-store.js";

import { demoDocument } from "./examples/demo-document.js";

export async function createCadApplication() {
  const model = createActiveDocument();
  const state = createEditorState();
  const $ = (s) => document.querySelector(s),
    $$ = (s) => [...document.querySelectorAll(s)];
  try {
    $("#navigation-device").value =
      localStorage.getItem("liracad-navigation") === "mouse"
        ? "mouse"
        : "trackpad";
  } catch {}

  const canvas = $("#canvas"),
    ctx = canvas.getContext("2d"),
    input = $("#command-input");
  model.blockEditor = null;
  model.parameterEdit = null;

  const projectWorkspace = new ProjectWorkspace({
    createStorage: (id) =>
      new ProjectStorage(new IndexedDBProjectStore(undefined, { key: id }), {
        legacyStorage: id === "current" ? () => localStorage : null,
        journalStorage: () => localStorage,
        key: id === "current" ? "liracad-v1" : "liracad-" + id,
      }),
    metadata: () => localStorage,
    fallback: demoDocument,
    onError: (error) => {
      $("#save-state").textContent =
        "Kunde inte spara projektflikar · spara till fil";
      $("#save-state").title = error.message;
    },
  });
  document.body.inert = true;
  $("#save-state").textContent = "Läser projekt…";

  installTextMetrics();
  // Load before measuring restored text or building its spatial index.
  const [initialProject] = await Promise.all([
    projectWorkspace.restore(),
    loadCadFonts(),
  ]);
  const emptyDocument = () => ({
    version: 1,
    name: "",
    layers: [{ id: "0", name: "0", color: "#c3d6ce" }],
    entities: [],
  });
  model.storage = initialProject?.storage || null;
  const restored = initialProject?.restored || {};
  model.session =
    initialProject?.session || new DocumentSession(emptyDocument());

  document.body.inert = false;
  const restoreError = restored.error;
  model.activeLayer = model.document.layers[0].id;

  model.dirty = false;

  const spaceCameras = new Map();
  const {
    drawingSpace,
    currentViewport,
    viewEntity,
    layerOf,
    visible,
    editable,
    world,
    screen,
  } = createDocumentContext({ model, state });

  const creation = createCreationSettings({
    getLayer: () => model.activeLayer,
    drawingSpace,
  });
  const inspectorActions = createInspectorActions({
    model,
    commit,
    activateLayer: (id) => propertyController.activateLayer(id),
    cancel,
    refresh: (message) => {
      log(message);
      renderInspector();
    },
    fit,
    currentViewport,
    replaceEntities,
    start,
  });
  const propertyController = createPropertyController({
    model,
    creation,
    state,
    editSelected,
    refresh: renderInspector,
    renderLayers: () => renderLayers(),
    schedule,
    log,
  });

  const inspectorComposition = createInspectorComposition({
    document,
    actions: inspectorActions,
    changeProperty: (...args) => propertyController.changeProperty(...args),
    activateLayer: (id) => propertyController.activateLayer(id),
    log,
    renderInspector,
    model,
    state,
    selectedEntities,
    getCreation: () => creation,
    schedule,
    editSelected,
    cancel,
    update,
    enterViewport,
    fitViewport,
    beginTextEdit,
    currentViewport,
    recoverLayoutViews,
    finishBlockEdit,
    beginBlockEdit,
    erase,
    $,
  });
  const {
    generalProperties,
    appearanceFields,
    renderEntityProperties,
    renderLayoutProperties,
    blockInspector,
    renderLayers,
  } = inspectorComposition;

  const toolContext = createToolContext({
    selectedEntities,
    model,
    getCreationDefaults: () => creation.defaults,
    state,
    catalogPlacementReason,
    modelExtentsCenter,
    drawingSpace,
    getCreationColor: () => creation.color,
    getCreationLineType: () => creation.lineType,
    getSelectionController: () => selectionController,
    editable,
    visible,
    hit,
    getDocumentWorkflow: () => documentWorkflow,
    commit,
    applyObjectChange,
    addEntities,
    replaceEntities,
    update,
    make,
    beginTextEdit,
    focusCommand: () => input.focus(),
    log,
    clearTracking,
  });
  const { editor } = toolContext;

  const editorActions = createEditorActions({
    projectWorkspace,
    model,
    drawingSpace,
    currentViewport,
    state,
    getDocumentEditor: () => documentEditor,
    getTextEditor: () => textEditor,
    finishTextEdit,
    cancel,
    update,
    log,
    editor,
    dispatchEditor,
    prompt,
    schedule,
    clearTracking,
    focusCanvas: () => canvas.focus(),
    reportToggles: (next) => workspaceView.renderToggles(next),
    resolveCursor,
  });

  function undo(...args) {
    return editorActions.undo(...args);
  }
  function setTrimShift(...args) {
    return editorActions.setTrimShift(...args);
  }
  function toggle(...args) {
    return editorActions.toggle(...args);
  }
  function syncViewport(...args) {
    return editorActions.syncViewport(...args);
  }
  function catalogPlacementReason(...args) {
    return editorActions.catalogPlacementReason(...args);
  }
  const detailCatalog = createDetailCatalog({
    document,
    root: $("#catalog-panel"),
    getDocument: () => model.document,
    getProjectId: () => projectWorkspace.activeId,
    getLayer: () => model.activeLayer,
    getPlacementReason: catalogPlacementReason,
    storage: localStorage,
    place: (placement) => editorActions.placeCatalog(placement),
  });
  const referenceController = createReferenceController({
    projectWorkspace,
    model,
    getTextEditor: () => textEditor,
    finishTextEdit,
    cancel,
    pickReferenceFiles,
    log,
    state,
    commit,
  });

  function referenceReason(...args) {
    return referenceController.referenceReason(...args);
  }
  function readReference(...args) {
    return referenceController.readReference(...args);
  }
  const workspaceView = createWorkspaceView({
    document,
    $,
    renderLayers,
    projectWorkspace,
    $$,
    model,
    input,
    canvas,
  });

  function log(...args) {
    return workspaceView.log(...args);
  }
  function renderWorkspaceState(...args) {
    return workspaceView.renderWorkspaceState(...args);
  }
  function focusWorkspace(...args) {
    return workspaceView.focusWorkspace(...args);
  }
  function panel(...args) {
    return workspaceView.panel(...args);
  }
  function download(...args) {
    return workspaceView.download(...args);
  }
  function pickReferenceFiles(...args) {
    return workspaceView.pickReferenceFiles(...args);
  }

  const referencePanel = createReferencePanel({
    document,
    root: $("#references-panel"),
    getDocument: () => model.document,
    getProjectId: () => projectWorkspace.activeId,
    getReason: referenceReason,
    chooseFile: (id, options) => readReference(id, options),
    reload: (id) => readReference(id),
    change: referenceController.change,
    detach: referenceController.detach,
    bind: referenceController.bind,
  });
  function showInspector(mode) {
    inspectorController.show(mode);
  }
  function renderInspector() {
    inspectorController.render();
  }
  const textEditController = createTextEditController({
    createSurface: (options) => createTextEditor({ document, ...options }),
    screen,
    state,
    model,
    clearTracking,
    editor,
    applyObjectChange,
    viewEntity,
    getSelectionController: () => selectionController,
    update,
    prompt,
    focusCanvas: () => canvas.focus(),
    schedule,
    log,
  });
  const { textEditor } = textEditController;
  function beginTextEdit(...args) {
    return textEditController.beginTextEdit(...args);
  }
  function beginAttributeTextEdit(...args) {
    return textEditController.beginAttributeTextEdit(...args);
  }
  function textEditPreview(...args) {
    return textEditController.textEditPreview(...args);
  }
  function finishTextEdit(...args) {
    return textEditController.finishTextEdit(...args);
  }

  function modelExtentsCenter(...args) {
    return layoutController.modelExtentsCenter(...args);
  }
  function leaveViewport(...args) {
    return layoutController.leaveViewport(...args);
  }
  function enterViewport(...args) {
    return layoutController.enterViewport(...args);
  }
  function switchSpace(...args) {
    return layoutController.switchSpace(...args);
  }
  function createLayout(...args) {
    return layoutController.createLayout(...args);
  }
  function renderSpaceControls(...args) {
    return spaceTabs.render(...args);
  }
  function paperPoint(...args) {
    return layoutController.paperPoint(...args);
  }
  function activeClip(...args) {
    return layoutController.activeClip(...args);
  }
  function inActiveViewport(...args) {
    return layoutController.inActiveViewport(...args);
  }
  function schedule(...args) {
    return viewportController.schedule(...args);
  }
  function navigating(...args) {
    return viewportController.navigating(...args);
  }
  function fit(...args) {
    return viewportController.fit(...args);
  }
  function resize(...args) {
    return viewportController.resize(...args);
  }
  function gridStep(...args) {
    return viewportController.gridStep(...args);
  }
  function rebuild() {
    selectionController.rebuild();
  }
  const saveController = createSaveController({
    projectWorkspace,
    model,
    reportStatus: (text, title = "") => {
      $("#save-state").textContent = text;
      $("#save-state").title = title;
    },
    log,
    renderProjectTabs,
  });

  function persisted(...args) {
    return saveController.persisted(...args);
  }
  function reportProjectSave(...args) {
    return saveController.reportProjectSave(...args);
  }
  function reportLocalSave(...args) {
    return saveController.reportLocalSave(...args);
  }
  function showProjectSaveState(...args) {
    return saveController.showProjectSaveState(...args);
  }

  const workspaceController = createWorkspaceController({
    model,
    state,
    projectWorkspace,
    renderWorkspaceState,
    renderProjectTabs,
    renderInspector,
    schedule,
    setCreationMode,
    drawingSpace,
    renderSpaceControls,
    rebuild,
    getSelectionController: () => selectionController,
    renderDocumentInfo: () => workspaceView.renderDocumentInfo(state),
    renderLayers,
  });
  function update() {
    return workspaceController.update();
  }
  const entityEditController = createEntityEditController({
    model,
    getDocumentEditor: () => documentEditor,
    update,
    currentViewport,
    layerOf,
    log,
    state,
    viewEntity,
  });

  function commit(...args) {
    return entityEditController.commit(...args);
  }
  function addEntities(...args) {
    return entityEditController.addEntities(...args);
  }
  function applyObjectChange(...args) {
    return entityEditController.applyObjectChange(...args);
  }
  function replaceEntities(...args) {
    return entityEditController.replaceEntities(...args);
  }
  function editSelected(...args) {
    return entityEditController.editSelected(...args);
  }
  function fitViewport(...args) {
    return entityEditController.fitViewport(...args);
  }
  function recoverLayoutViews(...args) {
    return entityEditController.recoverLayoutViews(...args);
  }

  function setCreationMode(mode) {
    creation.setMode(mode);
  }
  function make(type, props) {
    return creation.make(type, props);
  }
  function selectedEntities() {
    return selectionController.selectedEntities();
  }

  function previewEntities(...args) {
    return commands.previewEntities(...args);
  }
  function prompt(...args) {
    return commandFeedback.prompt(...args);
  }
  function cancel(...args) {
    return commands.cancel(...args);
  }
  function start(...args) {
    return commands.start(...args);
  }
  function erase(...args) {
    return commands.erase(...args);
  }
  function dispatchEditor(...args) {
    return commands.dispatchEditor(...args);
  }
  function acceptPoint(...args) {
    return commands.acceptPoint(...args);
  }
  function submit(...args) {
    return commands.submit(...args);
  }
  function hit(point) {
    return selectionController.hit(point);
  }
  function clearTracking(...args) {
    return cursorController.clearTracking(...args);
  }
  function acquireTrack(...args) {
    return cursorController.acquireTrack(...args);
  }
  function resolveCursor(...args) {
    return cursorController.resolveCursor(...args);
  }
  function moveCursor(...args) {
    return cursorController.moveCursor(...args);
  }

  const wblockActions = createWblockController({
    model,
    state,
    editor,
    clearTracking,
    log,
    update,
    prompt,
    getSelectionController: () => selectionController,
    replaceEntities,
    applyObjectChange,
  });
  const wblockDialog = createWblockDialog({
    document,
    getDocument: () => model.document,
    getSelected: selectedEntities,
    download,
    notify: log,
    pickFile:
      typeof window.showSaveFilePicker === "function"
        ? (name) =>
            window.showSaveFilePicker({
              suggestedName: name,
              types: [
                {
                  description: "DXF-ritning",
                  accept: { "application/dxf": [".dxf"] },
                },
              ],
            })
        : null,
    beginPick: wblockActions.beginPick,
    endPick: wblockActions.endPick,
    prepareChange: wblockActions.prepareChange,
  });

  window.addEventListener("pagehide", () => {
    captureProjectContext();
    projectWorkspace.flush().catch(() => {});
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      captureProjectContext();
      projectWorkspace.flush().catch(() => {});
    }
  });
  window.addEventListener("beforeunload", (event) => {
    if (model.blockEditor) {
      event.preventDefault();
      event.returnValue = "";
    }
  });

  function captureProjectContext(...args) {
    return projectController.captureProjectContext(...args);
  }
  function activateProject(...args) {
    return projectController.activateProject(...args);
  }
  function prepareProjectSwitch(...args) {
    return projectController.prepareProjectSwitch(...args);
  }
  function switchProject(...args) {
    return projectController.switchProject(...args);
  }
  function beginBlockEdit(...args) {
    return blockController.beginBlockEdit(...args);
  }
  function finishBlockEdit(...args) {
    return blockController.finishBlockEdit(...args);
  }

  function renderProjectTabs() {
    projectTabs.render();
  }
  const documentWorkflow = createDocumentWorkflow({
    getDocument: () => model.document,
    hasBlockEdit: () => Boolean(model.blockEditor),
    finishText: () => finishTextEdit(true),
    finishBlock: () => finishBlockEdit(true),
    hasPendingEdit: () =>
      Boolean(state.tool || textEditor.active || state.drag),
    prepareOpen: () => {
      syncViewport();
      cancel(false);
    },
    replaceDocument: (next, label) => {
      captureProjectContext();
      const entry = projectWorkspace.add(next);
      activateProject(entry);
      fit();
      entry.ready.then(() => {
        if (!entry.storage.pending) reportProjectSave(entry, entry.saveError);
        renderProjectTabs();
      });
    },
    syncView: syncViewport,
    download,
  });
  createSettingsPanel({
    document,
    getNavigation: () => $("#navigation-device").value,
    setNavigation: (value) => {
      $("#navigation-device").value = value;
      $("#navigation-device").dispatchEvent(new Event("change"));
    },
    getDocument: () => model.document,
    canGenerate: () => !model.blockEditor && !documentWorkflow.opening,
    replaceDocument: documentWorkflow.replace,
    log,
  });
  const importController = createImportController({
    state,
    syncViewport,
    download,
    projectWorkspace,
    getDocumentWorkflow: () => documentWorkflow,
    model,
    log,
    getImportDialog: () => importDialog,
  });

  function saveProject(...args) {
    return importController.saveProject(...args);
  }
  function exportDxf(...args) {
    return importController.exportDxf(...args);
  }
  function openDrawingFile(...args) {
    return importController.openDrawingFile(...args);
  }

  const importDialog = createImportDialog({ document, download });

  const fileOpenQueue = createFileOpenQueue({
    openFile: openDrawingFile,
    canOpen: () => !model.blockEditor && !documentWorkflow.opening,
    onError: (error) => log(`Kunde inte öppna: ${error.message}`),
    onPending: (count) => {
      const button = $("#queued-files");
      button.hidden = count === 0;
      button.textContent = `Öppna väntande filer (${count})`;
      button.title =
        "Avsluta blockredigeringen och öppna filerna i nya projektflikar.";
    },
  });

  setupFileDrop(fileOpenQueue, {
    onActive: (active) => {
      $("#file-drop-hint").hidden = !active;
    },
  });

  const selectionController = createSelectionController({
    state,
    getDocument: () => model.document,
    drawingSpace,
    viewEntity,
    visible,
    editable,
  });
  const spaceTabs = createSpaceTabs({
    document,
    $,
    getBlockEditor: () => model.blockEditor,
    getDocument: () => model.document,
    state,
    switchSpace,
  });
  const layoutController = createLayoutController({
    getDocument: () => model.document,
    layerOf,
    state,
    textEditor,
    finishTextEdit,
    syncViewport,
    setCreationMode,
    cancel,
    log,
    invalidateSpace: () => selectionController.invalidate(),
    rebuild,
    renderInspector,
    schedule,
    getBlockEditor: () => model.blockEditor,
    spaceCameras,
    fit,
    update,
    commit,
    renderSpaceControls,
  });
  const viewportController = createViewportController({
    ctx,
    state,
    getDocument: () => model.document,
    log,
    getInteractionEntities: () => selectionController.entities,
    visible,
    getBlockEditor: () => model.blockEditor,
    blockInspector,
    syncViewport,
    canvas,
    textEditor,
    previewEntities,
    textEditPreview,
    movedViewport: () => movedViewport(),
    editor,
    hit,
    getEditableIds: () => selectionController.editableIds,
    getSceneIndex: () => selectionController.index,
    reportZoom: (scale) => {
      $("#zoom-level").textContent = `${Math.round(scale * 1000)}%`;
    },
  });
  const projectController = createProjectController({
    model,
    projectWorkspace,
    state,
    spaceCameras,
    editor,
    wblockDialog,
    clearTracking,
    emptyDocument,
    selectionController,
    rebuild,
    setBusy: (busy) => {
      document.body.inert = busy;
    },
    focusWorkspace,
    resetCommandSurface: () => {
      commandCompletion.hide();
      input.value = "";
      $("#suggestions").hidden = true;
      canvas.style.cursor = "crosshair";
    },
    viewportController,
    update,
    focusCanvas: () => canvas.focus(),
    resize,
    prompt,
    fit,
    showProjectSaveState,
    documentWorkflow,
    log,
    textEditor,
    finishTextEdit,
    syncViewport,
    cancel,
  });
  const blockController = createBlockController({
    model,
    log,
    editable,
    textEditor,
    finishTextEdit,
    syncViewport,
    state,
    cancel,
    fit,
    showProperties: () => showInspector("properties"),
    update,
    persisted,
  });
  const documentEditor = createDocumentEditor({
    getSession: () => model.session,
    onChange: ({ kind, previous, document: next }) => {
      if (kind === "append") {
        const added = model.document.entities.slice(previous.entities.length);
        if (!model.blockEditor) {
          try {
            model.storage.recordAddition(model.document, added);
          } catch (error) {
            log("Tillfällig sparlogg kunde inte uppdateras: " + error.message);
          }
        }
        selectionController.append(previous, added);
      }
      model.dirty = true;
      persisted();
      update();
    },
  });
  const projectTabs = createProjectTabs({
    document,
    projectWorkspace,
    switchProject,
    closeProject: (id) => projectController.closeProject(id),
    reopenProject: (id) => projectController.reopenProject(id),
    focusWorkspace,
  });
  const inspectorController = createInspectorController({
    document,
    state,
    $,
    detailCatalog,
    referencePanel,
    resize,
    selectedEntities,
    generalProperties,
    getBlockEditor: () => model.blockEditor,
    blockInspector,
    renderLayoutProperties,
    renderEntityProperties,
    appearanceFields,
    creationDefaults: creation.defaults,
    schedule,
    erase,
  });
  installRibbon({ document });
  installCadShell({ document, onResize: resize });
  const commandFeedback = createCommandFeedback({
    document,
    state,
    editor,
    clearTracking,
    renderInspector,
    schedule,
  });
  const commands = createCommandController({
    editor,
    state,
    getActiveLayer: () => model.activeLayer,
    clearTracking,
    prompt,
    clearCommandInput: commandFeedback.clearCommandInput,
    showSelection: commandFeedback.showSelection,
    showHelp: commandFeedback.showHelp,
    renderInspector,
    schedule,
    wblockDialog,
    update,
    projectWorkspace,
    textEditor,
    finishTextEdit,
    beginBlockEdit,
    selectedEntities,
    finishBlockEdit,
    getBlockEditor: () => model.blockEditor,
    log,
    switchSpace,
    leaveViewport,
    fit,
    undo,
    saveProject,
    exportDxf,
    getDocument: () => model.document,
    getEditableIds: () => selectionController.editableIds,
  });
  const cursorFeedback = createCursorFeedback({ document, canvas });
  const cursorController = createCursorController({
    state,
    schedule,
    getSnapCache: () => selectionController.snapIndex,
    getDocument: () => model.document,
    getPolarStep: cursorFeedback.getPolarStep,
    readPointer: cursorFeedback.readPointer,
    reportCursor: cursorFeedback.render,
    gridStep,
    world,
  });
  const { commandCompletion, movedViewport } = installInputController({
    document,
    window,
    canvas,
    state,
    textEditor,
    moveCursor,
    hit,
    layerOf,
    beginAttributeTextEdit,
    beginBlockEdit,
    beginTextEdit,
    paperPoint,
    getDocument: () => model.document,
    enterViewport,
    $: $,
    finishTextEdit,
    setTrimShift,
    inActiveViewport,
    leaveViewport,
    input,
    schedule,
    getInteractionEntities: () => selectionController.entities,
    editable,
    screen,
    update,
    acceptPoint,
    dispatchEditor,
    prompt,
    navigating,
    replaceEntities,
    log,
    syncViewport,
    submit,
    world,
    acquireTrack,
    wblockDialog,
    projectWorkspace,
    cancel,
    undo,
    saveProject,
    toggle,
    erase,
  });
  const workspaceBindings = createWorkspaceBindings({
    document,
    newDrawing: (...args) => importController.newDrawing(...args),
    openDemo: (...args) => importController.openDemo(...args),
    exportSheet: () => importController.exportSheet(),
    zoom: (factor) => editorActions.zoom(factor),
    toggleGrid: () => editorActions.toggleGrid(),
    $,
    initialProject,
    panel,
    start,
    fit,
    state,
    schedule,
    toggle,
    resolveCursor,
    undo,
    saveProject,
    exportDxf,
    model,
    log,
    getFileOpenQueue: () => fileOpenQueue,
    createLayout,
    leaveViewport,
  });
  resize();
  activateProject(initialProject);
  if (initialProject && !initialProject.context) fit();
  prompt();
  log(
    "LiraCAD 0.1 · Skriv ett kommando, välj ett verktyg eller öppna Snabbguide.",
  );
  if (restoreError)
    log(
      "Det lokala utkastet kunde inte läsas och lämnas orört. Autosparning är pausad. Spara fortsatt arbete till fil.",
    );
  if (restored.migrationError)
    log(
      "Det äldre utkastet har öppnats men kunde inte flyttas till den nya lagringen. Det gamla utkastet finns kvar.",
    );
  if (restored.recoveryError) {
    log(
      "Väntande objekttillägg återställdes men kunde inte autosparas. Återställningsloggen finns kvar. Spara projekt till fil.",
    );
    persisted();
  }

  setupPWA(async () => {
    if (!projectWorkspace.active) return;
    if (model.blockEditor)
      return "Spara eller avbryt blockredigeringen före uppdatering.";
    if (state.tool || state.drag)
      return "Avsluta eller avbryt pågående kommando före uppdatering.";
    if (textEditor.active && !finishTextEdit(true))
      return "Spara eller avbryt textredigeringen före uppdatering.";
    syncViewport();
    document.body.inert = true;
    try {
      await model.storage.save(model.document, reportLocalSave);
    } finally {
      document.body.inert = false;
    }
  });

  setupFileLaunch(fileOpenQueue);
}
