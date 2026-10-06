// Picker and OS launches share one queue; importing a file never replaces a tab.
export function createFileOpenQueue({ openFile, canOpen = () => true, onError = () => {}, onPending = () => {} }) {
  const pending = [];
  let running = null;
  const update = () => onPending(pending.length);
  function resume() {
    if (running) return running;
    running = Promise.resolve().then(async () => {
      while (pending.length && canOpen()) {
        const next = pending[0];
        try {
          const file = await next();
          if (!/\.(dwg|dxf|liracad|json)$/i.test(file.name)) throw Error('Filtypen stöds inte. Välj DWG, DXF eller ett LiraCAD-projekt.');
          // A cancelled text edit leaves this file queued for an explicit retry.
          if (await openFile(file) === false) break;
        } catch (error) { onError(error); }
        pending.shift(); update();
      }
    }).finally(() => { running = null; update(); });
    return running;
  }
  function enqueue(readers) { pending.push(...readers); update(); return resume(); }
  return {
    enqueueFiles: files => enqueue(Array.from(files, file => () => file)),
    enqueueHandles: handles => enqueue(Array.from(handles, handle => () => handle.getFile())),
    resume,
    get pending() { return pending.length; },
  };
}

export function setupFileLaunch(queue, host = globalThis) {
  if (typeof host.launchQueue?.setConsumer !== 'function') return false;
  host.launchQueue.setConsumer(params => queue.enqueueHandles(params.files || []));
  return true;
}
