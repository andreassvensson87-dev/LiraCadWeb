import { textFont, textAlignment, textVerticalAnchor, textSpanValue } from "./text.js";

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
          [...new Set([textFont(e), "Arial", "LiraCAD ISO", "Georgia", "Courier New"])].map((x) => [x, x]),
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
      root.append(choice("Justering", textAlignment(e), [["left", "Vänster"], ["center", "Centrerad"], ["right", "Höger"]], v => change("textAlign", v)));
      if (e.type === "text") {
        root.append(choice("Fästpunkt lodrätt", textVerticalAnchor(e), [["baseline", "Baslinje"], ["top", "Överkant"], ["middle", "Mitt"], ["bottom", "Underkant"]], v => change("textVertical", v)));
        root.append(field("Rotation °", (e.rotation || 0) * 180 / Math.PI, v => change("rotation", v * Math.PI / 180)));
      }
      const range = (key, v, min, max) => {
        if (Number.isFinite(v) && v >= min && v <= max) change(key, v);
        else { log(`Ange ett värde mellan ${min} och ${max}.`); refresh(); }
      };
      root.append(field("Radavstånd ×", (e.lineSpacing || 1.4) / (5 / 3), v => {
        if (Number.isFinite(v) && v >= 0.25 && v <= 4) change("lineSpacing", v * 5 / 3);
        else { log("Radavståndet måste vara mellan 0,25 och 4 gånger standardavståndet."); refresh(); }
      }));
      root.append(choice("Radavståndstyp", e.lineSpacingStyle || 2, [[1, "Minst"], [2, "Exakt"]], v => change("lineSpacingStyle", Number(v))));
      root.append(field("Teckenavstånd ×", textSpanValue(e, "tracking"), v => range("tracking", v, 0.75, 4)));
      root.append(field("Breddfaktor ×", textSpanValue(e, "widthFactor"), v => positive("widthFactor", v)));
      if (e.type === "text") root.append(field("Textbredd · mm", e.textWidth || 0, v => range("textWidth", v, 0, 1000000)));
    }
    if (e.type === "text" && e.textColumns) {
      const c=e.textColumns;
      const column = (key,value) => change("textColumns",{...c,[key]:value});
      root.append(field("Antal kolumner",c.count,v=>{if(Number.isInteger(v)&&v>=1&&v<=100)column("count",v);else{log("Välj 1–100 kolumner.");refresh();}}));
      root.append(field("Kolumnbredd · mm",c.width,v=>{if(v>0)column("width",v);}));
      root.append(field("Kolumnmellanrum · mm",c.gutter,v=>{if(v>=0)column("gutter",v);}));
      root.append(choice("Kolumnordning",String(c.reversed),[["false","Vänster till höger"],["true","Höger till vänster"]],v=>column("reversed",v==="true")));
      root.append(choice("Kolumnhöjd",String(c.autoHeight),[["true","Fördela automatiskt"],["false","Sparade höjder"]],v=>column("autoHeight",v==="true")));
      if(!c.autoHeight)root.append(field("Höjd för alla kolumner · mm",Math.max(0,...c.heights),v=>{if(v>0)column("heights",Array(c.count).fill(v));}));
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
