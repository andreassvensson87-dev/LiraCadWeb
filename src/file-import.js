import { validDocument } from "./document.js";

// Returns data only: replacing the current drawing and showing reports belong to UI.
export async function readDrawingFile(file, options = {}) {
  if (file.size > 50e6) throw Error("Filen är för stor (max 50 MB).");
  const cad = /\.(dwg|dxf)$/i.test(file.name);
  const dwg = /\.dwg$/i.test(file.name);
  if (cad) options.onProgress?.(dwg ? "Öppnar DWG lokalt…" : "Läser DXF…");
  const imported = cad ? await readCAD(file, options) : null;
  const document = imported ? imported.document : JSON.parse(await file.text());
  if (!validDocument(document)) throw Error("Ogiltig projektfil.");
  return { document, imported };
}

async function readCAD(
  file,
  {
    onProgress = () => {},
    createWorker = (url) => new Worker(url, { type: "module" }),
    timeout = 60000,
  } = {},
) {
  const buffer = await file.arrayBuffer();
  const dwg = /\.dwg$/i.test(file.name);
  const format = dwg ? "DWG" : "DXF";
  return new Promise((resolve, reject) => {
    const worker = createWorker(
      new URL(
        dwg ? "./dwg-import-worker.js" : "./dxf-import-worker.js",
        import.meta.url,
      ),
    );
    let settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      worker.terminate();
      error ? reject(error) : resolve(result);
    };
    const timer = setTimeout(
      () => finish(Error(`${format}-importen tog för lång tid.`)),
      timeout,
    );
    worker.onmessage = ({ data }) => {
      if (settled) return;
      if (data.progress) {
        onProgress(data.progress);
        return;
      }
      finish(data.error ? Error(data.error) : null, data.result);
    };
    worker.onerror = () =>
      finish(Error(`${format}-importen kunde inte startas.`));
    worker.onmessageerror = () =>
      finish(Error(`${format}-importen gav ett oläsbart resultat.`));
    try {
      worker.postMessage({ buffer, name: file.name }, [buffer]);
    } catch (error) {
      finish(error);
    }
  });
}
