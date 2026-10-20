export function watchAppUpdate(
  registration,
  button,
  status,
  beforeUpdate = async () => {},
  { checkButton, checkStatus, applyButton, environment = globalThis, timeoutMs = 30000 } = {},
) {
  const { navigator, location, document, window } = environment;
  let approved = false, applying = false, checking = false;
  const applyButtons = [button, applyButton].filter(Boolean);
  const message = (text) => {
    status.textContent = text;
    if (checkStatus) checkStatus.textContent = text;
  };
  const show = () => {
    for (const control of applyButtons) {
      control.hidden = !registration.waiting;
      control.disabled = applying;
    }
    if (registration.waiting && !applying && checkStatus)
      checkStatus.textContent = "En ny version är klar. Välj Uppdatera appen för att installera den.";
    else if (!applying && !checking && checkStatus?.textContent.startsWith("En ny version är klar."))
      checkStatus.textContent = "Sök efter en ny version av LiraCAD.";
  };
  for (const control of applyButtons) {
    control.textContent = "Uppdatera appen";
    control.title = "En ny version är hämtad och klar att installeras";
  }
  button.classList.add("lira-update");
  show();
  const watch = () => {
    show();
    registration.installing?.addEventListener("statechange", show);
  };
  watch();
  registration.addEventListener("updatefound", watch);
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (approved) location.reload();
  });
  navigator.serviceWorker.addEventListener("message", (event) => {
    if (event.data?.type !== "UPDATE_BLOCKED") return;
    approved = false;
    applying = false;
    show();
    message("Stäng appens andra fönster och försök igen.");
  });
  const apply = async () => {
    if (!registration.waiting || applying || checking) return;
    applying = true;
    show();
    try {
      const reason = await beforeUpdate();
      if (reason) {
        applying = false;
        show();
        message(reason);
        return;
      }
      approved = true;
      message("Uppdaterar …");
      registration.waiting.postMessage({ type: "ACTIVATE_UPDATE" });
    } catch {
      approved = false;
      applying = false;
      show();
      message("Kunde inte förbereda uppdateringen. Spara arbetet och försök igen.");
    }
  };
  for (const control of applyButtons) control.onclick = apply;

  const checkForUpdate = async () => {
    if (checking || applying) return;
    checking = true;
    if (checkButton) checkButton.disabled = true;
    if (checkStatus) checkStatus.textContent = "Söker efter uppdateringar …";
    let timer, stopped = false, cleanup = () => {};
    try {
      await Promise.race([
        (async () => {
          if (navigator.onLine === false) throw Error("offline");
          await registration.update();
          if (stopped) return;
          const worker = registration.installing;
          if (worker) {
            if (checkStatus) checkStatus.textContent = "Hämtar den nya versionen …";
            await new Promise((resolve, reject) => {
              const changed = () => {
                if (worker.state === "redundant") reject(Error("installation"));
                else if (["installed", "activating", "activated"].includes(worker.state)) resolve();
              };
              cleanup = () => worker.removeEventListener("statechange", changed);
              worker.addEventListener("statechange", changed);
              changed();
            });
          }
        })(),
        new Promise((_, reject) => { timer = environment.setTimeout(() => reject(Error("timeout")), timeoutMs); }),
      ]);
      show();
      if (checkStatus) checkStatus.textContent = registration.waiting
        ? "En ny version är klar. Välj Uppdatera appen för att installera den."
        : "Du har den senaste versionen.";
    } catch {
      if (checkStatus) checkStatus.textContent = "Kunde inte söka efter uppdateringar. Kontrollera internetanslutningen och försök igen.";
    } finally {
      stopped = true;
      cleanup();
      environment.clearTimeout(timer);
      checking = false;
      if (checkButton) checkButton.disabled = false;
    }
  };
  if (checkButton) {
    checkButton.disabled = false;
    checkButton.onclick = checkForUpdate;
  }
  const check = () => {
    if (!document.hidden && !checking && !applying) registration.update().catch(() => {});
  };
  window.addEventListener("focus", check);
  document.addEventListener("visibilitychange", check);
  environment.setInterval(check, 15 * 60 * 1000);
  return { checkForUpdate };
}
