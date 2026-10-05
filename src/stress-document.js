import { uid } from "./values.js";

function object(index, columns, pattern) {
  const x = (index % columns) * 500, y = Math.floor(index / columns) * 500;
  const type = pattern === "lines" ? 0 : index % 5;
  const base = { id: uid(), layer: `stress-${index % 3}`, space: "model" };
  if (type === 0) return { ...base, type: "line", points: [{ x, y }, { x: x + 300, y: y + 200 }] };
  if (type === 1) return { ...base, type: "circle", center: { x: x + 150, y: y + 150 }, radius: 120 };
  if (type === 2) return { ...base, type: "arc", center: { x: x + 150, y: y + 150 }, radius: 120, start: 0, sweep: Math.PI * 1.5 };
  if (type === 3) return { ...base, type: "polyline", points: [{ x, y }, { x: x + 300, y }, { x: x + 300, y: y + 300 }, { x, y: y + 300 }], closed: true };
  return { ...base, type: "text", point: { x, y }, text: `Objekt ${index + 1}`, height: 70, rotation: 0 };
}

// Yield between batches so generation progress and the modal remain responsive.
export async function stressDocument(count, { pattern = "mixed", onProgress = () => {}, yieldControl = () => new Promise((resolve) => setTimeout(resolve, 0)) } = {}) {
  if (!Number.isInteger(count) || count < 1 || count > 100000) throw Error("Välj mellan 1 och 100 000 objekt.");
  if (!["mixed", "lines"].includes(pattern)) throw Error("Ogiltigt objektval.");
  const entities = [], columns = Math.ceil(Math.sqrt(count));
  for (let start = 0; start < count; start += 2000) {
    const end = Math.min(count, start + 2000);
    for (let index = start; index < end; index++) entities.push(object(index, columns, pattern));
    onProgress(end, count);
    await yieldControl();
  }
  return { version: 1, name: `Stresstest ${count} ${pattern === "lines" ? "linjer" : "blandade objekt"}`,
    layers: ["#c3d6ce", "#71bba5", "#b3c4ab"].map((color, index) => ({ id: `stress-${index}`, name: `Testlager ${index + 1}`, color, visible: true, locked: false })), entities };
}
