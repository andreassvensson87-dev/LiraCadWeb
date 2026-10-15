import { dist } from "../model/geometry.js";

export function createCursorFeedback({ document, canvas }) {
  const feedback = document.querySelector("#snap-feedback");
  const coordinates = document.querySelector("#coordinates");
  const polarStep = document.querySelector("#polar-step");
  const format = (value) =>
    Number(value.toFixed(2)).toLocaleString("sv-SE", {
      maximumFractionDigits: 2,
    });
  return {
    getPolarStep: () => Number(polarStep.value),
    readPointer: (event) => {
      const rect = canvas.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    },
    render: ({ cursor, snap, trackAnchors }) => {
      feedback.textContent = snap
        ? `${snap.kind}${snap.mode === "object" && trackAnchors.some((p) => dist(p, snap.p) < 1e-7) ? " · referens fångad" : ""}`
        : trackAnchors.length
          ? `Track · ${trackAnchors.length} referenspunkter`
          : "";
      coordinates.textContent = `X ${format(cursor.x)}   Y ${format(cursor.y)}`;
    },
  };
}
