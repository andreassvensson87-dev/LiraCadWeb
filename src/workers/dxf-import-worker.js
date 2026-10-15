import { installTextMetrics } from "../rendering/canvas-text-metrics.js";
import { decodeDXF, importDXF } from "../io/dxf-import.js";
installTextMetrics();
self.onmessage = ({ data }) => {
  try {
    self.postMessage({ result: importDXF(decodeDXF(data.buffer), data.name) });
  } catch (error) {
    self.postMessage({ error: error.message });
  }
};
