import test from "node:test";
import assert from "node:assert/strict";
import { watchAppUpdate } from "../src/ui/update-ui.js";

class Events extends EventTarget {
  emit(type, data) { const event = new Event(type); event.data = data; this.dispatchEvent(event); }
}
const control = () => ({ hidden: true, disabled: false, textContent: "", classList: { add() {} } });
function setup({ update = async () => {}, beforeUpdate = async () => {}, timeoutMs = 1000 } = {}) {
  const registration = Object.assign(new Events(), { waiting: null, installing: null, update });
  const serviceWorker = new Events(), checkButton = control(), checkStatus = control(), applyButton = control(), button = control(), status = control();
  let reloads = 0;
  const environment = { navigator: { serviceWorker, onLine: true }, location: { reload() { reloads++; } }, document: new Events(), window: new Events(), setTimeout, clearTimeout, setInterval() {} };
  const api = watchAppUpdate(registration, button, status, beforeUpdate, { checkButton, checkStatus, applyButton, environment, timeoutMs });
  return { registration, checkButton, checkStatus, applyButton, button, status, environment, serviceWorker, api, reloads: () => reloads };
}

test("manual update check reports latest version and prevents duplicate checks without reloading", async () => {
  let complete, count = 0;
  const ui = setup({ update: () => { count++; return new Promise(resolve => { complete = resolve; }); } });
  const pending = ui.checkButton.onclick();
  assert.equal(ui.checkButton.disabled, true);
  assert.match(ui.checkStatus.textContent, /Söker/);
  await ui.api.checkForUpdate(); assert.equal(count, 1);
  complete(); await pending;
  assert.match(ui.checkStatus.textContent, /senaste versionen/);
  assert.equal(ui.checkButton.disabled, false);
  assert.equal(ui.reloads(), 0);
});

test("a new worker must finish installing before it can be offered; activation uses the existing save guard", async () => {
  let saves = 0, sent = [];
  const ui = setup({ beforeUpdate: async () => { saves++; return "Avsluta kommandot först."; } });
  const worker = Object.assign(new Events(), { state: "installing", postMessage: m => sent.push(m) });
  ui.registration.update = async () => {
    ui.registration.installing = worker;
    ui.registration.emit("updatefound");
  };
  const pending = ui.api.checkForUpdate();
  await Promise.resolve(); await Promise.resolve();
  assert.match(ui.checkStatus.textContent, /Hämtar/);
  assert.equal(ui.applyButton.hidden, true);
  ui.registration.waiting = worker; ui.registration.installing = null; worker.state = "installed"; worker.emit("statechange");
  await pending;
  assert.match(ui.checkStatus.textContent, /En ny version/);
  assert.equal(ui.button.hidden, false); assert.equal(ui.applyButton.hidden, false);
  assert.equal(saves, 0); assert.equal(sent.length, 0);
  await ui.applyButton.onclick();
  assert.equal(saves, 1); assert.equal(sent.length, 0);
  assert.match(ui.checkStatus.textContent, /Avsluta kommandot/);
  assert.equal(ui.applyButton.disabled, false);
});

test("ready updates activate only after successful saving, and blocked windows allow retry", async () => {
  let saved = false, sent = [];
  const ui = setup({ beforeUpdate: async () => { saved = true; } });
  ui.registration.waiting = { postMessage(m) { assert.ok(saved); sent.push(m); } };
  await ui.checkButton.onclick();
  await ui.applyButton.onclick();
  assert.deepEqual(sent, [{ type: "ACTIVATE_UPDATE" }]);
  assert.equal(ui.applyButton.disabled, true);
  ui.serviceWorker.emit("message", { type: "UPDATE_BLOCKED" });
  assert.match(ui.checkStatus.textContent, /andra fönster/);
  assert.equal(ui.applyButton.disabled, false);
  ui.serviceWorker.emit("controllerchange"); assert.equal(ui.reloads(), 0);
  await ui.button.onclick();
  ui.serviceWorker.emit("controllerchange"); assert.equal(ui.reloads(), 1);
});

test("network, offline, install failure and timeout report failure rather than latest version and permit retry", async () => {
  for (const mode of ["network", "offline", "installation", "timeout"]) {
    const ui = setup({ timeoutMs: 5 });
    ui.registration.update = async () => {
      if (mode === "network") throw Error("network");
      if (mode === "timeout") return new Promise(() => {});
      if (mode === "installation") ui.registration.installing = Object.assign(new Events(), { state: "redundant" });
    };
    if (mode === "offline") ui.environment.navigator.onLine = false;
    await ui.api.checkForUpdate();
    assert.match(ui.checkStatus.textContent, /Kunde inte söka/);
    assert.equal(ui.checkButton.disabled, false);
    ui.environment.navigator.onLine = true;
    ui.registration.installing = null; ui.registration.update = async () => {};
    await ui.api.checkForUpdate();
    assert.match(ui.checkStatus.textContent, /senaste versionen/);
  }
});

test("save failure does not activate a waiting update", async () => {
  const ui = setup({ beforeUpdate: async () => { throw Error("storage full"); } });
  ui.registration.waiting = { postMessage() { assert.fail("Must not activate after failed save"); } };
  await ui.applyButton.onclick();
  assert.match(ui.checkStatus.textContent, /Spara arbetet/);
  assert.equal(ui.applyButton.disabled, false);
  ui.serviceWorker.emit("controllerchange"); assert.equal(ui.reloads(), 0);
});

test("first installation does not leave a stale available-update message after activation", () => {
  const ui = setup();
  const worker = Object.assign(new Events(), { state: "installing" });
  ui.registration.installing = worker; ui.registration.emit("updatefound");
  ui.registration.waiting = worker; worker.state = "installed"; worker.emit("statechange");
  ui.registration.waiting = null; worker.state = "activated"; worker.emit("statechange");
  assert.equal(ui.applyButton.hidden, true);
  assert.match(ui.checkStatus.textContent, /Sök efter en ny version/);
});
