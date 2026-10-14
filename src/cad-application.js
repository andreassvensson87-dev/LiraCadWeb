import { createProjectController } from "./project-controller.js";
import { createBlockController } from "./block-controller.js";
import { createSelectionController } from "./selection-controller.js";
import { createLayoutController } from "./layout-controller.js";
import { createViewportController } from "./viewport-controller.js";
import { createCursorFeedback } from "./cursor-feedback.js";
import { createDocumentEditor } from "./document-editor.js";
import { createCommandFeedback } from "./command-feedback.js";
import { createEditorTools } from "./tool-registry.js";
import { createProjectTabs } from "./project-tabs.js";
import { createInspectorController } from "./inspector-controller.js";
import { installRibbon } from "./ribbon.js";
import { installInputController } from "./input-controller.js";
import { createCommandController } from "./command-controller.js";
import { createCursorController } from "./cursor-controller.js";
import { createEditorState, updateToolState } from "./editor-state.js";
import { createImportDialog } from "./import-dialog.js";
import {
  annotationView,
  storeAnnotationView,
  createAnnotationView,
  plainAnnotationEntity,
  copyAnnotationView,
} from "./annotation-edit.js";
import { loadCadFonts } from "./cad-fonts.js";
import { screenPoint, worldPoint } from "./camera.js";
import { createLayoutInspector } from "./layout-inspector.js";
import { createBlockInspector } from "./block-inspector.js";
import { createGeneralInspector } from "./general-inspector.js";
import { createAppearanceInspector } from "./appearance-inspector.js";
import { createAttributeInspector } from "./attribute-inspector.js";
import { createEntityInspector } from "./entity-inspector.js";

import { icons } from "./toolbar-icons.js";

import { createLayerPanel } from "./layer-panel.js";
import { createReferencePanel } from "./reference-panel.js";
import { detachReference, bindReference, findReference } from "./references.js";
import { resolveReferenceFiles } from "./reference-files.js";
import { readDrawingFile } from "./file-import.js";
import { createDetailCatalog } from "./detail-catalog.js";
import { installCadShell } from "./cad-shell.js";
import { Editor } from "./editor.js";

import { createWblockDialog } from "./wblock-dialog.js";

import { applyTransformChange } from "./transform-tools.js";
import { applyEditingChange } from "./editing-tools.js";

import { blockTools } from "./block-tools.js";

import { createTextEditor } from "./text-editor.js";
import { dimensionTools } from "./dimension-tools.js";

import { createInspectorControls } from "./inspector-controls.js";
import { DocumentSession } from "./document-session.js";
import { copyDocumentSnapshot } from "./document-snapshot.js";
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
import {
  createFileOpenQueue,
  setupFileLaunch,
  setupFileDrop,
} from "./file-launch.js";
import { layoutSVG } from "./plot.js";
import {
  spaceOf,
  viewportFromCamera,
  fitViewportToEntities,
  recoverEmptyViewports,
} from "./layout.js";

import { IndexedDBProjectStore } from "./indexeddb-project-store.js";

import { clone, uid } from "./values.js";
import { bounds } from "./entity-geometry.js";

import { validDocument } from "./document.js";
import { demoDocument } from "./demo-document.js";

export async function createCadApplication() {
  const model = {};
  const state = createEditorState();
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
  model.document = model.session.document;
  $("#save-state").textContent = initialProject?.saveState || "";
  $("#save-state").title = initialProject?.saveError?.message || "";
  document.body.inert = false;
  const restoreError = restored.error;
  model.activeLayer = model.document.layers[0].id;
  model.history = model.session.history;
  model.dirty = false;

  const spaceCameras = new Map();
  const drawingSpace = () =>
    state.activeViewportId ? "model" : state.activeSpace;
  const currentViewport = () =>
    model.document.entities.find((e) => e.id === state.activeViewportId);
  const viewEntity = (e) =>
    spaceOf(e) === "model"
      ? annotationView(e, currentViewport(), model.document.layers)
      : e;
  const layerOf = (e) => model.document.layers.find((l) => l.id === e.layer),
    visible = (e) =>
      !e.hidden &&
      layerOf(e)?.visible !== false &&
      spaceOf(e) === drawingSpace() &&
      !(
        state.activeViewportId &&
        model.document.entities
          .find((v) => v.id === state.activeViewportId)
          ?.frozenLayers?.includes(layerOf(e)?.name)
      ),
    editable = (e) => !e._xrefId && visible(e) && !layerOf(e)?.locked;
  const world = (p) => worldPoint(p, state.camera, state.width, state.height);
  const screen = (p) => screenPoint(p, state.camera, state.width, state.height);

  const svg = (n) =>
    `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.3">${icons[n] || icons.LINE}</svg>`;
  const fmt = (n) =>
    Number(n.toFixed(2)).toLocaleString("sv-SE", { maximumFractionDigits: 2 });

  const { field, section, choice, action, colorFields } =
    createInspectorControls({
      document,
      onInvalid: (message) => {
        log(message);
        renderInspector();
      },
    });
  const generalProperties = createGeneralInspector({
    document,
    choice,
    colorFields,
    section,
    getContext: () => ({
      doc: model.document,
      tool: state.tool,
      es: selectedEntities(),
      activeLayer: model.activeLayer,
      creationColor,
      creationLineType,
    }),
    changeProperty: (key, value, { source, hasTargets }) => {
      if (source) {
        source[key] = value;
        renderInspector();
        schedule();
      } else if (hasTargets)
        editSelected("Egenskap", (e) => ({ ...e, [key]: value }));
      else {
        if (key === "layer") {
          const layer = model.document.layers.find((l) => l.id === value);
          if (layer.locked || layer.visible === false) {
            log("Välj ett synligt, olåst lager.");
            renderInspector();
            return;
          }
          model.activeLayer = value;
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
    document,
    field,
    choice,
    action,
    log,
    refresh: renderInspector,
  });
  const {
    attributeValueField,
    attributeDefinitionFields,
    renderAttributeManager,
  } = createAttributeInspector({
    document,
    field,
    choice,
    action,
    log,
    refresh: renderInspector,
    editSelected,
    getDocument: () => model.document,
    isBlockEditor: () => Boolean(model.blockEditor),
    selectEntity: (id) => {
      cancel();
      state.selection = new Set([id]);
      update();
    },
  });
  const renderEntityProperties = createEntityInspector({
    field,
    choice,
    section,
    action,
    editSelected,
    refresh: renderInspector,
    attributeDefinitionFields,
    appearanceFields,
    enterViewport,
    fitViewport,
    beginTextEdit,
    getAnnotationScale: () => currentViewport()?.annotationScale,
    createAnnotationVariant: (entity) => {
      const source = model.document.entities.find((e) => e.id === entity.id);
      if (source)
        replaceEntities(
          "Skapa annotationsvariant",
          model.document.entities.map((e) =>
            e.id === source.id ? createAnnotationView(e, currentViewport()) : e,
          ),
        );
    },
  });
  const renderLayoutProperties = createLayoutInspector({
    field,
    choice,
    section,
    action,
    getDocument: () => model.document,
    commit,
    log,
    refresh: renderInspector,
    afterFormat: fit,
    afterRemove: () => {
      cancel();
      fit();
    },
    recoverViews: recoverLayoutViews,
  });
  const blockInspector = createBlockInspector({
    refresh: () => {
      renderInspector();
      schedule();
    },
    field,
    section,
    action,
    startParameter: (request) => {
      model.parameterEdit = request || null;
      try {
        start("BSTRETCH");
      } finally {
        model.parameterEdit = null;
      }
    },
    getDocument: () => model.document,
    commit,
    finishEdit: finishBlockEdit,
    document,
    renderAttributeManager,
    attributeValueField,
    editSelected,
    beginEdit: beginBlockEdit,
    renderGeneralProperties: generalProperties,
    erase,
  });
  const renderLayers = createLayerPanel({
    document,
    root: $("#layers-panel"),
    getDocument: () => model.document,
    getActiveLayer: () => model.activeLayer,
    activateLayer: (id) => {
      model.activeLayer = id;
      renderLayers();
      renderInspector();
    },
    commit,
    cancel,
    log,
    field,
    choice,
    action,
  });
  const editor = new Editor({
    tools: createEditorTools(),
    getContext: () => ({
      entities: selectedEntities(),
      isBlockEditor: Boolean(model.blockEditor),
      stretchParameters: model.document.stretchParameters || [],
      parameterEdit: model.parameterEdit,
      creationDefaults,
      ...(state.tool &&
      (Object.hasOwn(blockTools, state.tool.name) ||
        state.tool.name === "WBLOCK")
        ? { templates: blockTemplates(model.document) }
        : {}),
      catalogPlacementReason: catalogPlacementReason(),
      ...(state.tool?.name === "MVIEW"
        ? {
            modelCenter: modelExtentsCenter(),
            activeViewportId: state.activeViewportId,
          }
        : {}),
      creation: {
        layer: model.activeLayer,
        space: drawingSpace(),
        color: creationColor,
        lineType: creationLineType,
        ...creationDefaults.dimension,
      },
      ...(state.tool &&
      [
        "OFFSET",
        "TRIM",
        "EXTEND",
        "FILLET",
        "CHAMFER",
        "PINSERT",
        "PDELETE",
        "STRETCH",
        "BSTRETCH",
        ...Object.keys(dimensionTools),
      ].includes(state.tool.name)
        ? {
            editableEntities: (
              selectionController.entities || model.document.entities
            ).filter(editable),
            ...(["TRIM", "EXTEND"].includes(state.tool.name)
              ? {
                  shift: state.trimShift,
                  boundaryEntities: (
                    selectionController.entities || model.document.entities
                  )
                    .filter(visible)
                    .flatMap((e) =>
                      e.type === "block" ? blockParts(e).filter(visible) : [e],
                    ),
                }
              : {}),
            hitEntity: [
              "TRIM",
              "EXTEND",
              "FILLET",
              "CHAMFER",
              ...Object.keys(dimensionTools),
            ].includes(state.tool.name)
              ? hit(state.rawCursor)
              : null,
            pointer: state.rawCursor,
          }
        : {}),
    }),
    setSelection: (ids) => {
      state.selection = new Set(ids);
    },
    applyChange: (change) => {
      if (change.kind === "wblock") {
        documentWorkflow.exportWblock(change);
      } else if (change.kind === "blockParameter") {
        if (!model.blockEditor) throw Error("Öppna blockeditorn först.");
        commit(change.label, (draft) => {
          const index =
            draft.stretchParameters?.findIndex(
              (p) => p.id === change.parameter.id,
            ) ?? -1;
          if (index >= 0) draft.stretchParameters[index] = change.parameter;
          else
            draft.stretchParameters = [
              ...(draft.stretchParameters || []),
              change.parameter,
            ];
        });
      } else if (change.kind === "editing") {
        applyObjectChange(change);
      } else if (change.operation) {
        const result = applyTransformChange(model.document.entities, change);
        if (change.operation === "COPY")
          addEntities(
            result.entities.slice(model.document.entities.length),
            change.label,
          );
        else replaceEntities(change.label, result.entities);
        state.selection = new Set(result.ids);
        update();
      } else {
        addEntities(
          change.entities.map(({ type, ...props }) => make(type, props)),
          change.label,
        );
      }
    },
    onEffect: (effect) => {
      if (effect.kind === "editText")
        beginTextEdit(effect.entity, effect.isNew);
      else if (effect.kind === "focusCommand") input.focus();
    },
    notify: log,
    onState: (nextState) => updateToolState(state, nextState, clearTracking),
  });

  function catalogPlacementReason() {
    if (!projectWorkspace.active) return "Öppna eller skapa en ritning först.";
    if (model.blockEditor) return "Avsluta blockeditorn först.";
    if (drawingSpace() !== "model")
      return "Växla till Model för att placera en detalj.";
    const layer = model.document.layers.find((l) => l.id === model.activeLayer);
    return !layer || layer.locked || layer.visible === false
      ? "Välj ett synligt, olåst lager först."
      : "";
  }
  const detailCatalog = createDetailCatalog({
    document,
    root: $("#catalog-panel"),
    getDocument: () => model.document,
    getProjectId: () => projectWorkspace.activeId,
    getLayer: () => model.activeLayer,
    getPlacementReason: catalogPlacementReason,
    storage: localStorage,
    place: (placement) => {
      const reason = catalogPlacementReason();
      if (reason) {
        log(reason);
        return;
      }
      if (textEditor.active && !finishTextEdit(true)) return;
      cancel(false);
      editor.start("INSERT");
      editor.dispatch({ type: "catalog", ...placement });
      state.lastCommand = "INSERT";
      prompt();
      canvas.focus();
    },
  });
  function referenceReason() {
    return !projectWorkspace.active
      ? "Öppna eller skapa en ritning först."
      : model.blockEditor
        ? "Avsluta blockeditorn först."
        : "";
  }
  async function pickReferenceFiles({ folder = false, multiple = true } = {}) {
    return new Promise((resolve) => {
      const picker = document.createElement("input");
      picker.type = "file";
      picker.accept = ".dwg,.dxf,.liracad";
      picker.multiple = multiple;
      picker.hidden = true;
      if (folder) picker.setAttribute("webkitdirectory", "");
      const finish = () => {
        const files = [...picker.files];
        picker.remove();
        resolve(files);
      };
      picker.onchange = finish;
      picker.oncancel = () => {
        picker.remove();
        resolve([]);
      };
      document.body.append(picker);
      picker.click();
    });
  }
  async function readReference(
    id = null,
    { folder = false, resolveOnly = false, reloadAll = false } = {},
  ) {
    try {
      const reason = referenceReason();
      if (reason) throw Error(reason);
      if (textEditor.active && !finishTextEdit(true)) return;
      cancel(false);
      const previous = model.document,
        projectId = projectWorkspace.activeId;
      const files = await pickReferenceFiles({ folder, multiple: !id });
      if (!files.length) return;
      const result = await resolveReferenceFiles(previous, files, {
        readFile: readDrawingFile,
        linkNew: !id && !resolveOnly && !reloadAll,
        reloadAll,
        targetId: id,
        onProgress: log,
      });
      if (
        model.document !== previous ||
        projectWorkspace.activeId !== projectId ||
        model.blockEditor ||
        state.tool ||
        textEditor.active
      )
        throw Error(
          "Ritningen ändrades medan referenserna lästes. Försök igen.",
        );
      if (result.loaded || !reloadAll)
        commit(
          reloadAll
            ? "Ladda om alla referenser"
            : id
              ? "Ladda om referens"
              : "Länka referensfiler",
          () => result.document,
        );
      log(
        `${result.loaded} ${reloadAll ? (result.loaded === 1 ? "referens uppdaterad" : "referenser uppdaterade") : result.loaded === 1 ? "referens inläst" : "referenser inlästa"}${reloadAll && result.notFound.length ? ` · ${result.notFound.length} filer saknas i urvalet` : ""}${reloadAll && result.ambiguous.length ? ` · ${result.ambiguous.length} tvetydiga länkar` : ""}${result.missing ? ` · ${result.missing} länkar behöver lösas` : ""}.`,
      );
      for (const message of result.messages) log(message);
    } catch (error) {
      if (error.name !== "AbortError") log(error.message);
    }
  }
  const referencePanel = createReferencePanel({
    document,
    root: $("#references-panel"),
    getDocument: () => model.document,
    getProjectId: () => projectWorkspace.activeId,
    getReason: referenceReason,
    chooseFile: (id, options) => readReference(id, options),
    reload: (id) => readReference(id),
    change: (id, patch, label) => {
      try {
        if (referenceReason()) throw Error(referenceReason());
        commit(label, (draft) => {
          const r = findReference(draft, id);
          if (!r) throw Error("Referensen finns inte längre.");
          Object.assign(r, patch);
        });
      } catch (error) {
        log(error.message);
      }
    },
    detach: (id) => {
      if (referenceReason()) {
        log(referenceReason());
        return;
      }
      commit("Ta bort referens", (draft) => {
        detachReference(draft, id);
        if (!draft.layers.some((l) => l.id === model.activeLayer))
          model.activeLayer = draft.layers[0].id;
      });
    },
    bind: (id) => {
      try {
        if (referenceReason()) throw Error(referenceReason());
        commit("Bind referens", (draft) =>
          bindReference(draft, id, model.activeLayer),
        );
        log("Referensen är nu ett lokalt block.");
      } catch (error) {
        log(error.message);
      }
    },
  });
  function showInspector(mode) {
    inspectorController.show(mode);
  }
  function renderInspector() {
    inspectorController.render();
  }
  let textEditTarget = null;
  const textEditor = createTextEditor({
    document,
    screen,
    getSize: () => ({ width: state.width, height: state.height }),
    getAvoidBounds: () => {
      const block =
        textEditTarget &&
        model.document.entities.find((e) => e.id === textEditTarget.blockId);
      return block ? bounds(block) : null;
    },
    beforeBegin: () => {
      clearTracking();
      editor.cancel();
      state.tool = null;
      state.drag = null;
      state.snap = null;
    },
    applyChange: (change) => {
      if (!textEditTarget) return applyObjectChange(change);
      const source = model.document.entities.find(
        (e) => e.id === textEditTarget.blockId,
      );
      const block = source && viewEntity(source);
      if (
        !block ||
        !selectionController.editableIds.has(block.id) ||
        block.definition.id !== textEditTarget.definitionId
      )
        throw Error("Blocket har ändrats eller kan inte längre redigeras.");
      applyObjectChange({
        ...change,
        label: "Redigera blockattribut",
        replaceId: block.id,
        entities: [
          withAttributeText(block, textEditTarget.tag, change.entities[0]),
        ],
      });
    },
    afterFinish: ({ selection: ids }) => {
      textEditTarget = null;
      if (ids) state.selection = new Set(ids);
      update();
      prompt();
      canvas.focus();
    },
    refresh: () => {
      prompt();
      schedule();
    },
    log,
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
  function syncViewport() {
    if (!state.activeViewportId) return;
    const i = model.document.entities.findIndex(
        (e) => e.id === state.activeViewportId,
      ),
      e = model.document.entities[i];
    if (e && !e.locked) {
      const viewport = viewportFromCamera(
        e,
        state.camera,
        state.paperCamera,
        state.width,
        state.height,
      );
      if (JSON.stringify(e) === JSON.stringify(viewport)) return;
      model.document = copyDocumentSnapshot({
        ...model.document,
        entities: model.document.entities.map((entity, index) =>
          index === i ? viewport : entity,
        ),
      });
      model.session.document = model.document;
      model.dirty = true;
      selectionController.invalidate();
      persisted();
    }
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
    return layoutController.renderSpaceControls(...args);
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
  function persisted() {
    if (!projectWorkspace.active) return;
    if (model.blockEditor) {
      $("#save-state").textContent = "Blockändringar ej sparade";
      return;
    }
    $("#save-state").textContent = "Sparar…";
    try {
      model.storage.observe(model.document);
    } catch (error) {
      log("Tillfällig sparlogg kunde inte uppdateras: " + error.message);
    }
    if (model.storage.journalError) {
      $("#save-state").textContent = "Sparar… · invänta autosparning";
      $("#save-state").title =
        "Senaste ändringen kan återställas först när autosparningen är klar. " +
        model.storage.journalError.message;
    }
    const entry = projectWorkspace.active;
    entry.saveState = $("#save-state").textContent;
    entry.saveError = model.storage.journalError || null;
    model.storage.schedule(
      () => entry.session.document,
      (error) => reportProjectSave(entry, error),
    );
    renderProjectTabs();
  }
  function reportProjectSave(entry, error) {
    entry.saveState = error
      ? "Kunde inte autospara · spara till fil"
      : "Autosparat lokalt";
    entry.saveError = error || null;
    if (projectWorkspace.active === entry && !model.blockEditor) {
      showProjectSaveState(entry);
      if (error) log("Lokal autosparning misslyckades. Använd Spara projekt.");
    }
    renderProjectTabs();
  }
  function reportLocalSave(error) {
    reportProjectSave(projectWorkspace.active, error);
  }
  function showProjectSaveState(entry) {
    $("#save-state").textContent =
      projectWorkspace.manifestError && !entry.saveError
        ? "Kunde inte spara projektflikar · spara till fil"
        : entry.saveState;
    $("#save-state").title =
      (entry.saveError || projectWorkspace.manifestError)?.message || "";
  }
  function update() {
    renderWorkspaceState();
    if (!projectWorkspace.active) {
      renderProjectTabs();
      renderInspector();
      schedule();
      return;
    }
    if (
      state.activeSpace !== "model" &&
      !model.document.layouts?.some((l) => l.id === state.activeSpace)
    ) {
      state.activeSpace = "model";
      state.activeViewportId = null;
      state.paperCamera = null;
    }
    if (
      state.activeViewportId &&
      !model.document.entities.some((e) => e.id === state.activeViewportId)
    ) {
      state.activeViewportId = null;
      state.camera = state.paperCamera || state.camera;
      state.paperCamera = null;
    }
    setCreationMode(drawingSpace() === "model" ? "model" : "paper");
    renderSpaceControls();
    rebuild();
    state.selection = new Set(
      [...state.selection].filter((id) =>
        selectionController.editableIds.has(id),
      ),
    );
    $("#document-name").textContent = model.document.name;
    renderProjectTabs();
    $("#entity-count").textContent =
      `${model.document.entities.length} objekt · mm`;
    $("#selection-badge").textContent = state.selection.size;
    $("#undo").disabled = !model.history.past.length;
    $("#redo").disabled = !model.history.future.length;
    $("#layer-count").textContent = `${model.document.layers.length} lager`;
    renderInspector();
    renderLayers();
    schedule();
  }
  function commit(label, edit) {
    const previousLayer = model.activeLayer;
    try {
      const changed = documentEditor.commit(label, edit);
      if (!changed) update();
      return changed;
    } catch (error) {
      model.activeLayer = previousLayer;
      update();
      throw error;
    }
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
      layer: model.activeLayer,
      space: drawingSpace(),
      ...props,
      color: creationColor,
      lineType: creationLineType,
      ...creationDefaults[type],
    };
  }
  function selectedEntities() {
    return selectionController.selectedEntities();
  }
  function addEntities(es, label) {
    const entities = es.map((e) => {
      const source =
        e._annotationSource &&
        model.document.entities.find((p) => p.id === e._annotationSource);
      return source ? copyAnnotationView(source, e, currentViewport()) : e;
    });
    return documentEditor.append(label, entities);
  }
  function applyObjectChange(change) {
    if (
      change.replaceId === undefined &&
      change.replaceIds === undefined &&
      !change.definitions?.length
    ) {
      return addEntities(change.entities, change.label);
    }
    if (!change.definitions?.length) {
      return replaceEntities(
        change.label,
        applyEditingChange(model.document.entities, change),
      );
    }
    commit(change.label, (draft) => {
      draft.entities = applyEditingChange(draft.entities, change);
      if (change.definitions?.length)
        draft.blocks = [...(draft.blocks || []), ...clone(change.definitions)];
    });
  }
  function replaceEntities(label, entities) {
    entities = entities.map((e) => {
      const source =
        e._annotationSource &&
        model.document.entities.find((p) => p.id === e._annotationSource);
      return source && e.id === source.id
        ? storeAnnotationView(source, e)
        : e._annotationSource
          ? plainAnnotationEntity(e)
          : e;
    });
    return documentEditor.replaceEntities(label, entities);
  }
  function undo(redo = false) {
    if (textEditor.active && !finishTextEdit(true)) return;
    cancel(false);
    const d = redo ? documentEditor.redo() : documentEditor.undo();
    if (d) {
      model.document = d;
      if (!model.document.layers.some((l) => l.id === model.activeLayer))
        model.activeLayer = model.document.layers[0].id;
      state.selection.clear();
      update();
      log(redo ? "Gör om." : "Ångrat.");
    }
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
  function beginTextEdit(entity, isNew = false) {
    const started = textEditor.begin(
      isNew
        ? entity
        : viewEntity(
            model.document.entities.find((e) => e.id === entity.id) || entity,
          ) || entity,
      isNew,
    );
    if (started) {
      textEditTarget = null;
      textEditor.position();
    }
    return started;
  }
  function fitViewport(entity) {
    const model = model.document.entities.filter(
      (e) =>
        spaceOf(e) === "model" && !e.hidden && layerOf(e)?.visible !== false,
    );
    const next = fitViewportToEntities(entity, model);
    if (!next) {
      log("Ingen synlig modellgeometri att anpassa vyn till.");
      return;
    }
    replaceEntities(
      "Anpassa vy till modell",
      model.document.entities.map((e) => (e.id === entity.id ? next : e)),
    );
  }
  function recoverLayoutViews(layoutId) {
    const model = model.document.entities.filter(
      (e) =>
        spaceOf(e) === "model" && !e.hidden && layerOf(e)?.visible !== false,
    );
    const result = recoverEmptyViewports(
      model.document.entities,
      layoutId,
      model,
    );
    if (!result.count) {
      log("Inga tomma vyer kunde återställas i detta ark.");
      return;
    }
    replaceEntities("Återställ tomma vyer", result.entities);
    log(
      `${result.count} tomma vyer visar nu en modellöversikt med standardskala. Justera detaljutsnittet via modellvyn och kontrollera arkets skaltexter/skalstockar.`,
    );
  }
  function beginAttributeTextEdit(block, tag) {
    block = model.document.entities.find((e) => e.id === block.id) || block;
    if (!selectionController.editableIds.has(block.id)) {
      log("Välj ett synligt, olåst block.");
      return false;
    }
    block = viewEntity(block) || block;
    const part = blockParts(block).find((p) => p.attributeTag === tag);
    if (!part || part.hidden) {
      log("Attributet saknas eller är dolt.");
      return false;
    }
    const started = textEditor.begin(part);
    if (started) {
      textEditTarget = {
        blockId: block.id,
        definitionId: block.definition.id,
        tag,
      };
      if (!state.activeViewportId && part.height * state.camera.scale < 12) {
        const b = bounds(block);
        state.camera = {
          x: (b.minX + b.maxX) / 2,
          y: (b.minY + b.maxY) / 2,
          scale: Math.min(
            (state.width - 100) / Math.max(b.maxX - b.minX, part.height),
            (state.height - 100) / Math.max(b.maxY - b.minY, part.height),
          ),
        };
      }
      textEditor.position();
      state.selection = new Set([block.id]);
      schedule();
    }
    return started;
  }
  function textEditPreview() {
    const entity = textEditor.preview();
    if (!entity) return null;
    if (!textEditTarget)
      return { originalId: textEditor.active.isNew ? null : entity.id, entity };
    const source = model.document.entities.find(
      (e) => e.id === textEditTarget.blockId,
    );
    const block = source && viewEntity(source);
    if (!block) return null;
    try {
      return {
        originalId: block.id,
        entity: withAttributeText(block, textEditTarget.tag, entity),
      };
    } catch {
      return null;
    }
  }
  function finishTextEdit(save) {
    return textEditor.finish(save);
  }
  function setTrimShift(value) {
    if (state.trimShift === !!value) return;
    state.trimShift = !!value;
    if (
      editor.owns(state.tool) &&
      ["TRIM", "EXTEND"].includes(state.tool.name)
    ) {
      dispatchEditor({ type: "modifier", shift: state.trimShift });
      prompt();
      schedule();
    }
  }
  function toggle(kind) {
    if (kind === "snap") state.osnap = !state.osnap;
    if (kind === "ortho") {
      state.ortho = !state.ortho;
      if (state.ortho) state.polarEnabled = false;
    }
    if (kind === "polar") {
      state.polarEnabled = !state.polarEnabled;
      if (state.polarEnabled) state.ortho = false;
    }
    if (kind === "track") state.tracking = !state.tracking;
    if (!state.tracking || !state.osnap) clearTracking();
    if (kind === "gridSnap") state.gridSnap = !state.gridSnap;
    $("#snap-toggle").classList.toggle("on", state.osnap);
    $("#ortho-toggle").classList.toggle("on", state.ortho);
    $("#polar-toggle").classList.toggle("on", state.polarEnabled);
    $("#track-toggle").classList.toggle("on", state.tracking);
    $("#grid-snap-toggle").classList.toggle("on", state.gridSnap);
    resolveCursor();
    schedule();
  }
  function editSelected(label, fn) {
    commit(label, (draft) => {
      draft.entities = draft.entities.map((e) =>
        state.selection.has(e.id)
          ? (() => {
              const view = viewEntity(e),
                edited = fn(clone(view || e));
              return edited._annotationSource
                ? storeAnnotationView(e, edited)
                : edited;
            })()
          : e,
      );
    });
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
  $("#toggle-grid").classList.toggle("active", state.showGrid);
  $("#toggle-grid").setAttribute("aria-pressed", String(state.showGrid));
  $("#toggle-grid").onclick = () => {
    state.showGrid = !state.showGrid;
    $("#toggle-grid").classList.toggle("active", state.showGrid);
    $("#toggle-grid").setAttribute("aria-pressed", String(state.showGrid));
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
    beginPick: (kind) => {
      editor.cancel();
      state.drag = null;
      clearTracking();
      state.tool = {
        name: "WBLOCK",
        phase: kind === "objects" ? "select" : "dialogBase",
        points: [],
      };
      log(
        kind === "objects"
          ? "WBLOCK · Markera objekt och tryck Enter."
          : "WBLOCK · Klicka på baspunkten eller ange X,Y. Esc återgår till dialogen.",
      );
      update();
    },
    endPick: () => {
      editor.cancel();
      state.tool = null;
      state.drag = null;
      clearTracking();
      state.snap = null;
      prompt();
      update();
    },
    prepareChange: (request, action, blockName) => {
      if (action === "retain") return null;
      const sources = model.document.entities.filter((e) =>
        request.entityIds.includes(e.id),
      );
      if (sources.some((e) => !selectionController.editableIds.has(e.id)))
        throw Error(
          "Originalobjekten måste vara synliga och olåsta för att ändras efter export.",
        );
      if (action === "delete")
        return () =>
          replaceEntities(
            "WBLOCK · Ta bort exporterade objekt",
            model.document.entities.filter(
              (e) => !request.entityIds.includes(e.id),
            ),
          );
      if (
        blockTemplates(model.document).some(
          (b) =>
            b.definition.name.toLowerCase() === blockName.trim().toLowerCase(),
        )
      )
        throw Error("Blocknamnet används redan.");
      if (new Set(sources.map(spaceOf)).size !== 1)
        throw Error(
          "Välj objekt i samma modell eller layout för att skapa ett block.",
        );
      const block = createBlock(
        sources,
        blockName.trim(),
        request.base,
        sources[0].layer,
        spaceOf(sources[0]),
      );
      const change = {
        kind: "editing",
        label: "WBLOCK · Omvandla till block",
        replaceIds: request.entityIds,
        entities: [block],
        definitions: [block.definition],
      };
      if (
        !validDocument({
          ...model.document,
          entities: applyEditingChange(model.document.entities, change),
          blocks: [...(model.document.blocks || []), block.definition],
        })
      )
        throw Error("Objekten kunde inte omvandlas till ett giltigt block.");
      return () => {
        applyObjectChange(change);
        state.selection = new Set([block.id]);
        update();
      };
    },
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
  function renderWorkspaceState() {
    const empty = !projectWorkspace.active;
    document.body.classList.toggle("workspace-empty", empty);
    $("#empty-workspace").hidden = !empty;
    for (const element of $$(
      "#canvas, .tabs, .ribbon, main > aside, .drawing-tabs, .command-panel, body > footer",
    ))
      element.inert = empty;
    $("#save-file").disabled = empty;
    $("#export-dxf").disabled = empty || !!model.blockEditor;
    input.disabled = empty;
    if (empty) {
      $("#undo").disabled = true;
      $("#redo").disabled = true;
      $("#document-name").textContent = "Ingen ritning öppen";
      $("#save-state").textContent = "";
      $("#save-state").title = "";
    }
  }
  function focusWorkspace() {
    (projectWorkspace.active ? canvas : $("#empty-new")).focus();
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
  function saveProject() {
    if (!projectWorkspace.active) return;
    try {
      if (!documentWorkflow.save()) return;
      model.dirty = false;
      log("Projektfil sparad.");
    } catch (error) {
      log(`Kunde inte spara: ${error.message}`);
    }
  }
  function exportDxf() {
    if (!projectWorkspace.active) return;
    try {
      if (!documentWorkflow.exportDXF()) return;
      log(
        "DXF exporterad · block, attribut, bågpolylinjer och native mått bevaras.",
      );
      if (model.document.references?.length)
        log(
          "Xref-länkar exporterade. Skicka med källfilerna. Referenser från DXF/LiraCAD behöver bindas eller sparas som DWG för AutoCAD.",
        );
    } catch (error) {
      log(`Kunde inte exportera: ${error.message}`);
    }
  }
  $("#save-file").onclick = saveProject;
  $("#export-dxf").onclick = exportDxf;
  $("#open-file").onclick = () => $("#file-input").click();
  const importDialog = createImportDialog({ document, download });
  async function openDrawingFile(f) {
    const cad = /\.(dwg|dxf)$/i.test(f.name);
    const startedAt = new Date().toISOString(),
      started = performance.now();
    const events = [];
    const record = (level, message, details) => {
      if (events.length < 5000)
        events.push({
          time: new Date().toISOString(),
          level,
          message,
          ...(details ? { details } : {}),
        });
    };
    const session = (result, error) => ({
      file: f,
      source: { name: f.name, size: f.size, lastModified: f.lastModified },
      startedAt,
      durationMs: Math.round(performance.now() - started),
      appVersion: "0.1.0",
      environment: {
        userAgent: navigator.userAgent,
        language: navigator.language,
      },
      count: result?.imported?.count || 0,
      issues: result?.imported?.report || [],
      events,
      error: error ? { message: error.message, stack: error.stack } : null,
      limitations: [
        "DWG-läsaren returnerar högst 200 unika meddelanden.",
        "Importloggens händelser begränsas till 5000.",
      ],
    });
    try {
      const result = await documentWorkflow.open(f, {
        onProgress: (message) => {
          log(message);
          record("progress", message);
        },
        onDiagnostic: (diagnostic) =>
          record(
            diagnostic.level || "info",
            diagnostic.message,
            diagnostic.details,
          ),
      });
      if (!result) return false;
      log(`Öppnat ${f.name}`);
      if (result.imported) importDialog.show(session(result));
    } catch (error) {
      record("error", error.message, error.stack);
      if (cad) importDialog.show(session(null, error));
      throw error;
    }
  }

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
  $("#queued-files").onclick = () => {
    if (model.blockEditor)
      log("Avsluta blockredigeringen först. Filerna finns kvar i kön.");
    else fileOpenQueue.resume();
  };
  setupFileDrop(fileOpenQueue, {
    onActive: (active) => {
      $("#file-drop-hint").hidden = !active;
    },
  });
  $("#file-input").onchange = (ev) => {
    const files = Array.from(ev.target.files);
    ev.target.value = "";
    fileOpenQueue.enqueueFiles(files);
  };
  $("#new-file").onclick = () => {
    try {
      if (
        !documentWorkflow.replace(
          {
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
          },
          "Ny ritning",
        )
      )
        return;
      log("Ny ritning öppnad i en egen projektflik.");
    } catch (error) {
      log(error.message);
    }
  };
  $("#demo-file").onclick = () => {
    try {
      if (documentWorkflow.replace(demoDocument(), "Exempelritning"))
        log("Exempelritningen är öppnad.");
    } catch (error) {
      log(error.message);
    }
  };
  $("#help-button").onclick = () => $("#help-dialog").showModal();
  $("#close-help").onclick = $("#start-drawing").onclick = () =>
    $("#help-dialog").close();
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
    const l = model.document.layouts.find((l) => l.id === state.activeSpace);
    if (l)
      download(`${l.name}.svg`, layoutSVG(model.document, l), "image/svg+xml");
  };
  const selectionController = createSelectionController({
    state,
    getDocument: () => model.document,
    drawingSpace,
    viewEntity,
    visible,
    editable,
  });
  const layoutController = createLayoutController({
    getDocument: () => model.document,
    layerOf: layerOf,
    state: state,
    textEditor: textEditor,
    finishTextEdit: finishTextEdit,
    syncViewport: syncViewport,
    setCreationMode: setCreationMode,
    cancel: cancel,
    log: log,
    invalidateSpace: () => selectionController.invalidate(),
    rebuild: rebuild,
    renderInspector: renderInspector,
    schedule: schedule,
    getBlockEditor: () => model.blockEditor,
    spaceCameras: spaceCameras,
    fit: fit,
    update: update,
    commit: commit,
    $: $,
    JSON: JSON,
  });
  const viewportController = createViewportController({
    ctx: ctx,
    state: state,
    getDocument: () => model.document,
    log: log,
    getInteractionEntities: () => selectionController.entities,
    visible: visible,
    getBlockEditor: () => model.blockEditor,
    blockInspector: blockInspector,
    syncViewport: syncViewport,
    canvas: canvas,
    textEditor: textEditor,
    previewEntities: previewEntities,
    textEditPreview: textEditPreview,
    movedViewport: () => movedViewport(),
    editor: editor,
    hit: hit,
    getEditableIds: () => selectionController.editableIds,
    getSceneIndex: () => selectionController.index,
    $: $,
  });
  const projectController = createProjectController({
    model: model,
    projectWorkspace: projectWorkspace,
    state: state,
    spaceCameras: spaceCameras,
    editor: editor,
    wblockDialog: wblockDialog,
    clearTracking: clearTracking,
    emptyDocument: emptyDocument,
    selectionController: selectionController,
    rebuild: rebuild,
    hideCompletion: () => commandCompletion.hide(),
    input: input,
    viewportController: viewportController,
    update: update,
    $: $,
    canvas: canvas,
    resize: resize,
    prompt: prompt,
    fit: fit,
    showProjectSaveState: showProjectSaveState,
    documentWorkflow: documentWorkflow,
    log: log,
    textEditor: textEditor,
    finishTextEdit: finishTextEdit,
    syncViewport: syncViewport,
    cancel: cancel,
  });
  const blockController = createBlockController({
    model: model,
    log: log,
    editable: editable,
    textEditor: textEditor,
    finishTextEdit: finishTextEdit,
    syncViewport: syncViewport,
    state: state,
    cancel: cancel,
    fit: fit,
    panel: panel,
    update: update,
    persisted: persisted,
  });
  const documentEditor = createDocumentEditor({
    getSession: () => model.session,
    onChange: ({ kind, previous, document: next }) => {
      model.document = next;
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
    prepareProjectSwitch,
    activateProject,
    log,
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
    creationDefaults,
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
    editor: editor,
    state: state,
    getActiveLayer: () => model.activeLayer,
    clearTracking: clearTracking,
    prompt,
    clearCommandInput: commandFeedback.clearCommandInput,
    showSelection: commandFeedback.showSelection,
    showHelp: commandFeedback.showHelp,
    renderInspector: renderInspector,
    schedule: schedule,
    wblockDialog: wblockDialog,
    update: update,
    projectWorkspace: projectWorkspace,
    textEditor: textEditor,
    finishTextEdit: finishTextEdit,
    beginBlockEdit: beginBlockEdit,
    selectedEntities: selectedEntities,
    finishBlockEdit: finishBlockEdit,
    getBlockEditor: () => model.blockEditor,
    log: log,
    switchSpace: switchSpace,
    leaveViewport: leaveViewport,
    fit: fit,
    undo: undo,
    saveProject: saveProject,
    exportDxf: exportDxf,
    getDocument: () => model.document,
    getEditableIds: () => selectionController.editableIds,
  });
  const cursorFeedback = createCursorFeedback({ document, canvas });
  const cursorController = createCursorController({
    state: state,
    schedule: schedule,
    getSnapCache: () => selectionController.snapIndex,
    getDocument: () => model.document,
    getPolarStep: cursorFeedback.getPolarStep,
    readPointer: cursorFeedback.readPointer,
    reportCursor: cursorFeedback.render,
    gridStep: gridStep,
    world: world,
  });
  const { commandCompletion, movedViewport } = installInputController({
    document,
    window,
    canvas: canvas,
    state: state,
    textEditor: textEditor,
    moveCursor: moveCursor,
    hit: hit,
    layerOf: layerOf,
    beginAttributeTextEdit: beginAttributeTextEdit,
    beginBlockEdit: beginBlockEdit,
    beginTextEdit: beginTextEdit,
    paperPoint: paperPoint,
    getDocument: () => model.document,
    enterViewport: enterViewport,
    $: $,
    finishTextEdit: finishTextEdit,
    setTrimShift: setTrimShift,
    inActiveViewport: inActiveViewport,
    leaveViewport: leaveViewport,
    input: input,
    schedule: schedule,
    getInteractionEntities: () => selectionController.entities,
    editable: editable,
    screen: screen,
    update: update,
    acceptPoint: acceptPoint,
    dispatchEditor: dispatchEditor,
    prompt: prompt,
    navigating: navigating,
    replaceEntities: replaceEntities,
    log: log,
    syncViewport: syncViewport,
    submit: submit,
    world: world,
    acquireTrack: acquireTrack,
    wblockDialog: wblockDialog,
    projectWorkspace: projectWorkspace,
    cancel: cancel,
    undo: undo,
    saveProject: saveProject,
    toggle: toggle,
    erase: erase,
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

  for (const [id, factor] of [
    ["#zoom-out", 1 / 1.25],
    ["#zoom-in", 1.25],
  ]) {
    $(id).onclick = () => {
      state.camera.scale = Math.max(
        0.000001,
        Math.min(10000, state.camera.scale * factor),
      );
      schedule();
    };
  }
}
