import { decodeDXF, importDXF } from "./dxf-import.js";
self.onmessage = ({ data }) => {
  try {
    self.postMessage({ result: importDXF(decodeDXF(data.buffer), data.name) });
  } catch (error) {
    self.postMessage({ error: error.message });
  }
};
