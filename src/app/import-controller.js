import { uid } from "../model/values.js";
import { demoDocument } from "../examples/demo-document.js";
import { layoutSVG } from "../rendering/plot.js";

export function createImportController({
  state,
  syncViewport,
  download,
  projectWorkspace,
  getDocumentWorkflow,
  model,
  log,
  getImportDialog,
}) {
  function saveProject() {
    if (!projectWorkspace.active) return;
    try {
      if (!getDocumentWorkflow().save()) return;
      model.dirty = false;
      log("Projektfil sparad.");
    } catch (error) {
      log(`Kunde inte spara: ${error.message}`);
    }
  }
  function exportDxf() {
    if (!projectWorkspace.active) return;
    try {
      if (!getDocumentWorkflow().exportDXF()) return;
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
      const result = await getDocumentWorkflow().open(f, {
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
      if (result.imported) getImportDialog().show(session(result));
    } catch (error) {
      record("error", error.message, error.stack);
      if (cad) getImportDialog().show(session(null, error));
      throw error;
    }
  }
  function newDrawing() {
    try {
      if (
        getDocumentWorkflow().replace(
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
        log("Ny ritning öppnad i en egen projektflik.");
    } catch (error) {
      log(error.message);
    }
  }
  function openDemo() {
    try {
      if (getDocumentWorkflow().replace(demoDocument(), "Exempelritning"))
        log("Exempelritningen är öppnad.");
    } catch (error) {
      log(error.message);
    }
  }
  function exportSheet() {
    syncViewport();
    const layout = model.document.layouts?.find(
      (l) => l.id === state.activeSpace,
    );
    if (layout)
      download(
        `${layout.name}.svg`,
        layoutSVG(model.document, layout),
        "image/svg+xml",
      );
  }
  return {
    newDrawing,
    openDemo,
    exportSheet,
    saveProject,
    exportDxf,
    openDrawingFile,
  };
}
