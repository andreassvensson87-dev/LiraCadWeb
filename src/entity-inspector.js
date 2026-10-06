import { applyTextProperty } from "./text.js";
import { viewportScales } from "./layout.js";
export function createEntityInspector({ field, choice, section, action, editSelected, refresh, attributeDefinitionFields, appearanceFields, enterViewport, fitViewport, beginTextEdit, getAnnotationScale, createAnnotationVariant }) {
  return function render(root, e) {
    const geo = section("");
    const edit = (label, fn) => editSelected(label, fn);
    if(["text","dimension"].includes(e.type) && getAnnotationScale?.() && createAnnotationVariant && !e._annotationSource)geo.append(action(`Skapa variant för 1:${getAnnotationScale()}`,()=>createAnnotationVariant(e)));
    if (e.type === "text" && e.attributeTag) attributeDefinitionFields(geo, e);

    if (e.type === "dimension" && !e.chain) {
      geo.append(
        field(
          "Textöverskrivning",
          e.text || "",
          (v) => edit("Måtttext", (n) => ({ ...n, text: v })),
          "text",
        ),
      );
    }
    if (e.type === "viewport") {
      const denominator=Number((1/e.viewScale).toPrecision(10));
      geo.append(choice("Standardskala",String(denominator),[...new Set([denominator,...viewportScales])].map(n=>[String(n),`1:${n}`]),v=>edit("Viewportskala",n=>({...n,viewScale:1/Number(v)}))));
      geo.append(field("Annotationsskala 1:",e.annotationScale || denominator,v=>{if(v>0)edit("Annotationsskala",n=>({...n,annotationScale:v}));else refresh();}));
      geo.append(choice("Visa övriga skalvarianter",String(e.showAllAnnotations!==false),[["true","Ja"],["false","Nej"]],v=>edit("Annotationsvisning",n=>({...n,showAllAnnotations:v==="true"}))));
      geo.append(field("Vyrotation °",Number(((e.viewRotation||0)*180/Math.PI).toPrecision(10)),v=>edit("Vyrotation",n=>({...n,viewRotation:v*Math.PI/180}))));
      for(const axis of ['x','y'])geo.append(field(`Modellcentrum ${axis.toUpperCase()}`,e.viewCenter[axis],v=>edit("Vycentrum",n=>({...n,viewCenter:{...n.viewCenter,[axis]:v}}))));
      geo.append(
        field("Skala 1:", 1 / e.viewScale, (v) => {
          if (v > 0) edit("Viewportskala", (n) => ({ ...n, viewScale: 1 / v }));
          else refresh();
        }),
      );
      geo.append(
        choice(
          "Låst vy",
          e.locked !== false,
          [
            ["true", "Ja"],
            ["false", "Nej"],
          ],
          (v) => edit("Viewportlås", (n) => ({ ...n, locked: v === "true" })),
        ),
      );
      geo.append(action("Aktivera modellvy", () => enterViewport(e)));
      if (fitViewport) geo.append(action("Anpassa vy till modell", () => fitViewport(e)));
    }
    if (e.type === "polyline")
      geo.append(
        choice(
          "Sluten",
          !!e.closed,
          [
            ["true", "Ja"],
            ["false", "Nej"],
          ],
          (v) => edit("Sluten kontur", (n) => ({ ...n, closed: v === "true" })),
        ),
      );
    if (["text", "leader"].includes(e.type))
      geo.append(action("Redigera text på canvas", () => beginTextEdit(e)));
    appearanceFields(geo, e, (key, value) =>
      edit("Egenskap", (n) => applyTextProperty(n, key, value)),
    );
    if (geo.children.length) root.append(geo);
  };
}
