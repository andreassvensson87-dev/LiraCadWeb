import { watchAppUpdate } from "./update-ui.js";
export function setupPWA(saveBeforeUpdate) {
  const install = document.querySelector("#install-app");
  const update = document.querySelector("#update-app");
  const status = document.querySelector("#pwa-status");
  let installPrompt;
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
  const host = location.hostname.replace(/\.$/, '');
  if (
    (["127.0.0.1", "localhost"].includes(host) || host.endsWith('.localhost')) &&
    location.pathname === "/"
  )
    return;
  navigator.serviceWorker
    .register("./sw.js", { updateViaCache: "none" })
    .then((reg) => {
      watchAppUpdate(reg, update, status, saveBeforeUpdate);
    })
    .catch(() => {
      status.textContent = "Offlinefunktion är inte tillgänglig.";
    });
}
