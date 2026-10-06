import { readDrawingFile } from "./file-import.js";
import { validDocument } from "./document.js";
import { toDXF } from "./dxf-export.js";
import { wblockDXF } from "./wblock.js";

// Coordinates accepted documents and file operations; UI and storage are injected.
export function createDocumentWorkflow({
  getDocument, hasBlockEdit, finishText, finishBlock, prepareOpen, hasPendingEdit,
  replaceDocument, syncView, download, readFile = readDrawingFile,
}) {
  let opening = false;
  function replace(document, label) {
    if (hasBlockEdit()) throw Error("Avsluta blockeditorn först.");
    if (!validDocument(document)) throw Error("Ogiltig projektfil.");
    if (!finishText()) return false;
    prepareOpen();
    replaceDocument(document, label);
    return true;
  }
  async function open(file, options) {
    if (opening) throw Error("En fil håller redan på att öppnas.");
    if (hasBlockEdit()) throw Error("Avsluta blockeditorn först.");
    if (!finishText()) return null;
    prepareOpen();
    const previous = getDocument();
    opening = true;
    try {
      const result = await readFile(file, options);
      if (hasBlockEdit() || hasPendingEdit() || getDocument() !== previous)
        throw Error("Ritningen eller redigeringen ändrades medan filen lästes. Öppna filen igen.");
      if (!validDocument(result.document)) throw Error("Ogiltig projektfil.");
      replaceDocument(result.document, "Öppna projekt");
      return result;
    } finally { opening = false; }
  }
  function save() {
    if (!finishText()) return false;
    if (hasBlockEdit() && !finishBlock()) return false;
    syncView();
    const document = getDocument();
    download(`${document.name}.liracad`, JSON.stringify(document, null, 2), "application/json");
    return true;
  }
  function exportDXF() {
    if (hasBlockEdit()) throw Error("Spara eller avbryt blockredigeringen först.");
    if (!finishText()) return false;
    syncView();
    const document = getDocument();
    download(`${document.name}.dxf`, toDXF(document), "application/dxf");
    return true;
  }
  function exportWblock(request) {
    if(hasBlockEdit())throw Error("Spara eller avbryt blockredigeringen först.");
    if(!finishText())throw Error("Avsluta textredigeringen innan mallen exporteras.");
    const file=wblockDXF(getDocument(),request);
    download(file.name,file.text,file.type);
    return file.count;
  }
  return { open, replace, save, exportDXF, exportWblock, get opening() { return opening; } };
}
