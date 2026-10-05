import { textFont } from "./text.js";

export function createAppearanceInspector({ document, field, choice, action, log, refresh }) {
  function render(root, e, change) {
    const positive = (key, value) => {
      if (value > 0) change(key, value);
      else {
        log("Värdet måste vara större än noll.");
        refresh();
      }
    };
    if (e.type === "dimension") {
      root.append(field("Texthöjd", e.height, (v) => positive("height", v)));
      root.append(
        choice(
          "Decimaler",
          e.precision || 0,
          [0, 1, 2, 3].map((v) => [v, String(v)]),
          (v) => change("precision", Number(v)),
        ),
      );
    }
    if (["text", "leader"].includes(e.type)) {
      root.append(field("Texthöjd", e.height, (v) => positive("height", v)));
      root.append(
        choice(
          "Typsnitt",
          textFont(e),
          ["Arial", "Georgia", "Courier New"].map((x) => [x, x]),
          (v) => change("font", v),
        ),
      );
      const formats = document.createElement("div");
      formats.className = "format-buttons";
      for (const [key, label, glyph] of [
        ["bold", "Fetstil", "B"],
        ["italic", "Kursiv", "I"],
        ["underline", "Understrykning", "U"],
      ]) {
        const button = action(glyph, () => {
          const value = button.getAttribute("aria-pressed") !== "true";
          change(key, value);
          button.setAttribute("aria-pressed", String(value));
        });
        button.setAttribute("aria-label", label);
        button.setAttribute("aria-pressed", String(!!e[key]));
        formats.append(button);
      }
      root.append(formats);
    }
    if (e.type === "hatch") {
      root.append(
        field("Linjeavstånd", e.spacing, (v) => positive("spacing", v)),
      );
      root.append(
        field(
          "Mönstervinkel °",
          ((e.patternAngle ?? Math.PI / 4) * 180) / Math.PI,
          (v) => change("patternAngle", (v * Math.PI) / 180),
        ),
      );
    }
  }
  return render;
}
