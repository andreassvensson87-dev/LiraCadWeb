// Coordinates journaling and autosave for the originating project, even when
// another tab becomes active before its asynchronous save completes.
export function createSaveController({
  projectWorkspace,
  model,
  reportStatus,
  log,
  renderProjectTabs,
}) {
  function showProjectSaveState(entry) {
    const error = entry.saveError || projectWorkspace.manifestError;
    reportStatus(
      projectWorkspace.manifestError && !entry.saveError
        ? "Kunde inte spara projektflikar · spara till fil"
        : entry.saveState,
      error?.message || "",
    );
  }
  function reportProjectSave(entry, error) {
    if (!entry) return;
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
  function persisted() {
    const entry = projectWorkspace.active;
    if (!entry) return;
    if (model.blockEditor) {
      reportStatus("Blockändringar ej sparade");
      return;
    }
    try {
      model.storage.observe(model.document);
    } catch (error) {
      log("Tillfällig sparlogg kunde inte uppdateras: " + error.message);
    }
    entry.saveError = model.storage.journalError || null;
    entry.saveState = entry.saveError
      ? "Sparar… · invänta autosparning"
      : "Sparar…";
    reportStatus(
      entry.saveState,
      entry.saveError
        ? "Senaste ändringen kan återställas först när autosparningen är klar. " +
            entry.saveError.message
        : "",
    );
    model.storage.schedule(
      () => entry.session.document,
      (error) => reportProjectSave(entry, error),
    );
    renderProjectTabs();
  }
  return {
    persisted,
    reportProjectSave,
    reportLocalSave: (error) =>
      reportProjectSave(projectWorkspace.active, error),
    showProjectSaveState,
  };
}
