import { parameterValue, withParameterValue, updateStretchParameter } from "./parametric-blocks.js";
import { sortedAttributes } from "./attributes.js";

export function createBlockInspector({ document, field, section, action, getDocument, commit, finishEdit, renderAttributeManager, attributeValueField, editSelected, beginEdit, renderGeneralProperties, erase, startParameter, refresh=()=>{} }) {
  let activeParameterId=null;
  let instanceId=null,appearanceOpen=false;
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
    if(instanceId!==block.id){instanceId=block.id;appearanceOpen=false;}
    const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;};
    const panel=el('div',null,'block-instance'),header=el('header',null,'block-instance-header');
    header.append(el('span','Block','block-kind'),el('h2',block.definition.name));panel.append(header);
    const attributes=sortedAttributes(block.definition.entities);
    if(attributes.length){
      const values=section('Attribut');values.classList.add('block-values');
      values.append(el('span',String(attributes.length),'block-field-count'));
      for (const part of attributes) {
        const row=el('div');row.setAttribute('data-block-field',`attribute:${part.attributeTag}`);
        attributeValueField(row, part, block.values?.[part.attributeTag] ?? part.text, (value) => {
        const restoreSelect=document.activeElement?.tagName==='SELECT' && row.contains(document.activeElement);
        editSelected("Blockattribut", (entity) => ({ ...entity, values: { ...entity.values, [part.attributeTag]: value } }));
        if(restoreSelect)[...root.querySelectorAll('[data-block-field]')].find(n=>n.getAttribute('data-block-field')===`attribute:${part.attributeTag}`)?.querySelector('select,input')?.focus();
        });values.append(row);
      }
      values.append(el('p','Tab till nästa fält','block-field-hint'));panel.append(values);
    }
    if(block.definition.stretchParameters?.length){
      const parameters=section('Parametrar');
      for(const p of block.definition.stretchParameters){const row=field(p.name,parameterValue(block,p),value=>editSelected('Blockparameter · '+p.name,e=>withParameterValue(e,p.id,value)));row.classList.add('block-parameter-field');row.append(el('span','mm','block-unit'));row.setAttribute('data-block-field',`parameter:${p.id}`);parameters.append(row);}
      panel.append(parameters);
    }
    if(renderGeneralProperties){
      const appearance=el('details',null,'block-appearance'),summary=el('summary');appearance.open=appearanceOpen;
      const layer=getDocument().layers.find(l=>l.id===block.layer);
      summary.append(el('span','Lager och färg'),el('span',`${layer?.name || '—'} · ${block.color?'Egen färg':'Enligt lager'}`,'block-appearance-summary'));appearance.append(summary);
      appearance.ontoggle=()=>{if(appearance.isConnected)appearanceOpen=appearance.open;};renderGeneralProperties(appearance);panel.append(appearance);
    }
    const actions=el('div',null,'block-instance-actions'),edit=action('Redigera block',()=>beginEdit(block)),menu=el('details',null,'block-instance-menu'),more=el('summary','•••');more.setAttribute('aria-label','Fler blockåtgärder');menu.append(more,action('Radera markerade',erase));actions.append(edit,menu);panel.append(actions);
    // A value commit rebuilds the inspector. Explicitly restore the next field
    // after committing so Tab/Shift+Tab keeps moving through attribute values.
    panel.onkeydown=event=>{
      if(event.key!=='Tab' || !event.target.matches('input,select,textarea'))return;
      const current=event.target.closest('[data-block-field]');if(!current)return;
      const fields=[...panel.querySelectorAll('[data-block-field] input, [data-block-field] select, [data-block-field] textarea')],next=fields[fields.indexOf(event.target)+(event.shiftKey?-1:1)];
      if(!next){if(!event.shiftKey){event.preventDefault();if(event.target.matches('input,textarea'))event.target.onchange?.(event);event.target.blur();root.querySelector('.block-appearance > summary, .block-instance-actions button')?.focus();}return;}
      const nextRow=next.closest('[data-block-field]'),key=nextRow.getAttribute('data-block-field'),index=[...nextRow.querySelectorAll('input,select,textarea')].indexOf(next);event.preventDefault();
      if(event.target.matches('input,textarea'))event.target.onchange?.(event);
      event.target.blur();
      const target=[...root.querySelectorAll('[data-block-field]')].find(row=>row.getAttribute('data-block-field')===key)?.querySelectorAll('input,select,textarea')[index];target?.focus();
    };
    root.append(panel);
  }
  return { renderEditor, renderInstance, getActiveParameter };
}
