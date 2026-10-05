import { demoDocument } from "./demo-document.js";
import { stressDocument } from "./stress-document.js";

export function createSettingsPanel({ document, getNavigation, setNavigation, getDocument, canGenerate, replaceDocument, log }) {
  const $ = (selector) => document.querySelector(selector);
  const dialog = $("#settings-dialog"), status = $("#generation-status");
  const controls = ["#generate-example", "#generate-stress", "#stress-count", "#stress-pattern", "#close-settings"].map($);
  let busy = false;
  function open() {
    $("#settings-navigation").value = getNavigation();
    dialog.showModal();
  }
  async function generate(example) {
    if (busy) return;
    if (!canGenerate()) { status.textContent = "Avsluta blockredigering eller filöppning först."; return; }
    busy = true;
    controls.forEach((control) => { control.disabled = true; });
    status.textContent = "Genererar ritning…";
    const previous = getDocument();
    try {
      const next = example ? demoDocument() : await stressDocument(Number($("#stress-count").value), {
        pattern: $("#stress-pattern").value,
        onProgress: (done, count) => { status.textContent = `Genererar ${done.toLocaleString("sv-SE")} av ${count.toLocaleString("sv-SE")} objekt…`; },
      });
      if (!canGenerate() || previous !== getDocument()) throw Error("Ritningen ändrades. Försök igen.");
      if (!replaceDocument(next, example ? "Generera exempelritning" : "Generera stresstest")) {
        status.textContent = "Spara eller avbryt textredigeringen först.";
        return;
      }
      log(`${next.name} · ${next.entities.length.toLocaleString("sv-SE")} objekt genererade. Ångra återställer föregående ritning.`);
      status.textContent = "";
      dialog.close();
    } catch (error) { status.textContent = error.message; }
    finally { busy = false; controls.forEach((control) => { control.disabled = false; }); }
  }
  $("#settings-button").onclick = open;
  $("#close-settings").onclick = () => dialog.close();
  dialog.addEventListener("cancel", (event) => { if (busy) event.preventDefault(); });
  $("#settings-navigation").onchange = () => setNavigation($("#settings-navigation").value);
  $("#generate-example").onclick = () => generate(true);
  $("#generate-stress").onclick = () => generate(false);
  return { open };
}
