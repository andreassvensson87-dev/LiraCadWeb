export function watchAppUpdate(
  registration,
  button,
  status,
  beforeUpdate = async () => {},
) {
  let approved = false;
  const show = () => {
    button.hidden = !registration.waiting;
  };
  button.textContent = "Uppdatera appen";
  button.classList.add("lira-update");
  button.title = "En ny version är hämtad och klar att installeras";
  show();
  const watch = () =>
    registration.installing?.addEventListener("statechange", show);
  watch();
  registration.addEventListener("updatefound", watch);
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (approved) location.reload();
  });
  navigator.serviceWorker.addEventListener("message", (event) => {
    if (event.data?.type !== "UPDATE_BLOCKED") return;
    approved = false;
    button.disabled = false;
    status.textContent = "Stäng appens andra fönster och försök igen.";
  });
  button.onclick = async () => {
    if (!registration.waiting || button.disabled) return;
    button.disabled = true;
    try {
      const reason = await beforeUpdate();
      if (reason) {
        status.textContent = reason;
        button.disabled = false;
        return;
      }
      approved = true;
      status.textContent = "Uppdaterar …";
      registration.waiting.postMessage({ type: "ACTIVATE_UPDATE" });
    } catch {
      approved = false;
      button.disabled = false;
      status.textContent =
        "Kunde inte förbereda uppdateringen. Spara arbetet och försök igen.";
    }
  };
  const check = () => {
    if (!document.hidden) registration.update().catch(() => {});
  };
  window.addEventListener("focus", check);
  document.addEventListener("visibilitychange", check);
  setInterval(check, 15 * 60 * 1000);
}
