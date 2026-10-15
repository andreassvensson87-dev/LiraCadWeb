// Handle external files only; leave text dragging and in-app gestures alone.
export function setupFileDrop(queue, { target = globalThis.document, host = globalThis, onActive = () => {} } = {}) {
  let depth = 0;
  const isFile = event => Array.from(event.dataTransfer?.types || []).includes('Files');
  const reset = () => { depth = 0; onActive(false); };
  const handlers = {
    dragenter(event) {
      if (!isFile(event)) return;
      event.preventDefault(); depth++; onActive(true);
    },
    dragover(event) {
      if (!isFile(event)) return;
      event.preventDefault(); event.dataTransfer.dropEffect = 'copy';
    },
    dragleave(event) {
      if (!isFile(event) && !depth) return;
      depth = Math.max(0, depth - 1);
      if (!depth || event.relatedTarget === null) reset();
    },
    drop(event) {
      if (!isFile(event)) return;
      event.preventDefault();
      const files = Array.from(event.dataTransfer.files || []);
      reset();
      if (files.length) queue.enqueueFiles(files);
    },
    dragend: reset,
  };
  for (const [name, handler] of Object.entries(handlers)) target.addEventListener(name, handler, { capture: true });
  host.addEventListener('blur', reset);
  return () => {
    for (const [name, handler] of Object.entries(handlers)) target.removeEventListener(name, handler, { capture: true });
    host.removeEventListener('blur', reset); reset();
  };
}
