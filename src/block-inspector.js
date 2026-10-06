import { parameterValue, withParameterValue, updateStretchParameter } from "./parametric-blocks.js";
import { sortedAttributes } from "./attributes.js";

export function createBlockInspector({ field, section, action, getDocument, commit, finishEdit, renderAttributeManager, attributeValueField, editSelected, beginEdit, beginAttributeEdit, erase, startParameter, refresh=()=>{} }) {
  let activeParameterId=null;
  const getActiveParameter=()=>getDocument().stretchParameters?.find(p=>p.id===activeParameterId)||getDocument().stretchParameters?.[0];
  function renderEditor(root) {
    const doc = getDocument(), panel = section("BLOCKEDITOR");
    panel.append(field("Blocknamn", doc.name, (value) => {
      commit("Blocknamn", (draft) => { draft.name = value.trim(); });
    }, "text"));
    for (const axis of ["x", "y"])
      panel.append(field("Baspunkt " + axis.toUpperCase(), doc.blockBase[axis], (value) => {
        if (Number.isFinite(value)) commit("Baspunkt", (draft) => { draft.blockBase[axis] = value; });
      }));
    if(startParameter)panel.append(action("Lägg till stretchparameter",()=>startParameter()));
    for(const p of doc.stretchParameters||[])panel.append(action(`Visa stretch · ${p.name}`,()=>{activeParameterId=p.id;refresh();}),action(`Ta bort stretch · ${p.name}`,()=>commit("Ta bort stretchparameter",draft=>{draft.stretchParameters=draft.stretchParameters.filter(v=>v.id!==p.id);})));
    panel.append(action("Spara block", () => finishEdit(true)), action("Avbryt blockredigering", () => finishEdit(false)));
    root.append(panel);
    const p=getActiveParameter();
    if(p){
      const settings=section("STRETCH · "+p.name),change=patch=>commit("Ändra stretchparameter",draft=>{draft.stretchParameters=updateStretchParameter(draft.stretchParameters,p.id,patch,draft.entities);});
      settings.append(field("Parameternamn",p.name,name=>change({name:name.trim()}),"text"));
      if(startParameter)settings.append(action("Välj längdaxel i ritningen",()=>startParameter({id:p.id,part:'axis'})),action("Välj sträckruta i ritningen",()=>startParameter({id:p.id,part:'window'})));
      for(const [key,label,fallback] of [["minLength","Minsta längd",0.01],["maxLength","Största längd",1e9],["step","Längdsteg · 0 = fritt",0]])settings.append(field(label,p[key]??fallback,value=>change({[key]:value})));
      for(const [key,label] of [["start","Fast start"],["end","Axelslut"]])for(const axis of ["x","y"])settings.append(field(label+" "+axis.toUpperCase(),p[key][axis],value=>change({[key]:{...getActiveParameter()[key],[axis]:value}})));
      for(const [key,label] of [["minX","Ruta vänster"],["maxX","Ruta höger"],["minY","Ruta nedre"],["maxY","Ruta övre"]])settings.append(field(label,p.window[key],value=>change({window:{...getActiveParameter().window,[key]:value}})));
      const moving=p.targets.filter(t=>t.mode==="move").length;
      settings.append(`Grönt: ${moving} objekt flyttas. Orange: ${p.targets.length-moving} objekt sträcks. Längdsteg utgår från grundlängden.`);
      root.append(settings);
    }
    renderAttributeManager(root);
  }
  function renderInstance(root, block) {
    const panel = section(block.definition.name);
    for(const p of block.definition.stretchParameters||[])panel.append(field(p.name+" · mm i blocket",parameterValue(block,p),value=>editSelected("Blockparameter · "+p.name,e=>withParameterValue(e,p.id,value))));
    for (const part of sortedAttributes(block.definition.entities)) {
      attributeValueField(panel, part, block.values?.[part.attributeTag] ?? part.text, (value) => {
        editSelected("Blockattribut", (entity) => ({ ...entity, values: { ...entity.values, [part.attributeTag]: value } }));
      });
      if (beginAttributeEdit) panel.append(action("Textutseende · " + (part.attributeSchema?.label || part.attributeTag), () => beginAttributeEdit(block, part.attributeTag)));
    }
    panel.append(action("Redigera block", () => beginEdit(block)));
    root.append(panel, action("Radera markerade", erase));
  }
  return { renderEditor, renderInstance, getActiveParameter };
}
