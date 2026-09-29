export function setupPWA(saveBeforeUpdate) {
  const install = document.querySelector("#install-app");
  const update = document.querySelector("#update-app");
  const status = document.querySelector("#pwa-status");
  let installPrompt,
    registration,
    approved = false;
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installPrompt = event;
    install.hidden = false;
  });
  install.onclick = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null;
    install.hidden = true;
  };
  window.addEventListener("appinstalled", () => {
    install.hidden = true;
  });
  if (!("serviceWorker" in navigator)) return;
  // Keep the ordinary local development page free from release caching.
  if (
    ["127.0.0.1", "localhost"].includes(location.hostname) &&
    location.pathname === "/"
  )
    return;
  const showUpdate = () => {
    update.hidden = !registration?.waiting;
  };
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (approved) location.reload();
  });
  navigator.serviceWorker.addEventListener("message", (event) => {
    if (event.data?.type === "UPDATE_BLOCKED") {
      approved = false;
      update.disabled = false;
      status.textContent = "Stäng andra LiraCAD-fönster och försök igen.";
    }
  });
  update.onclick = async () => {
    try {
      const message = saveBeforeUpdate();
      if (message) { status.textContent = message; return; }
      approved = true;
      update.disabled = true;
      registration.waiting?.postMessage({ type: "ACTIVATE_UPDATE" });
    } catch {
      approved = false;
      update.disabled = false;
      status.textContent =
        "Kunde inte spara lokalt. Spara projekt till fil innan uppdatering.";
    }
  };
  navigator.serviceWorker
    .register("./sw.js", { updateViaCache: "none" })
    .then((reg) => {
      registration = reg;
      showUpdate();
      reg.addEventListener("updatefound", () => {
        reg.installing?.addEventListener("statechange", showUpdate);
      });
      window.addEventListener("focus", () => reg.update().catch(() => {}));
    })
    .catch(() => {
      status.textContent = "Offlinefunktion är inte tillgänglig.";
    });
}
