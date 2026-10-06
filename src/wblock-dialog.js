import { blockTemplates } from './blocks.js';
import { wblockDXF, wblockFileName } from './wblock.js';
import { spaceOf } from './layout.js';

export async function saveWblockFile(file, { handle, pickFile, download }) {
  if (!handle && pickFile) handle = await pickFile(file.name);
  if (!handle) { download(file.name, file.text, file.type); return; }
  const writable = await handle.createWritable();
  try { await writable.write(file.text); await writable.close(); }
  catch (error) { try { await writable.abort(); } catch {} throw error; }
}

export function createWblockDialog({ document, getDocument, getSelected, beginPick, endPick, download, pickFile, prepareChange, notify }) {
  const dialog=document.querySelector('#wblock-dialog'), $=s=>dialog.querySelector(s);
  let ids=[], handle=null, picking=null, busy=false;
  const status=text=>{$('#wblock-status').textContent=text;};
  function refresh() {
    const source=$('#wblock-source').value, objects=source==='objects';
    $('#wblock-block').disabled=source!=='block';
    $('#wblock-pick-objects').disabled=!objects;
    $('#wblock-object-count').textContent=`${ids.length} objekt valda`;
    $('#wblock-base-fields').disabled=source==='block';
    $('#wblock-action').disabled=!objects;
    $('#wblock-block-name').disabled=!objects || $('#wblock-action').value!=='convert';
    $('#wblock-block-name-row').hidden=!objects || $('#wblock-action').value!=='convert';
  }
  function open() {
    ids=getSelected().map(e=>e.id); handle=null; picking=null;
    $('#wblock-source').value='objects'; $('#wblock-x').value='0'; $('#wblock-y').value='0';
    $('#wblock-action').value='retain'; $('#wblock-block-name').value='';
    const selected=getSelected();
    $('#wblock-filename').value=selected.length===1 && selected[0].type==='block' ? selected[0].definition.name : 'Mall';
    $('#wblock-block').replaceChildren(...blockTemplates(getDocument()).map(b=>{
      const option=document.createElement('option'); option.value=b.definition.id; option.textContent=b.definition.name; return option;
    }));
    $('#wblock-destination').textContent=pickFile?'Välj mapp i dialogen Spara som.':'Webbläsarens nedladdningsmapp. Aktivera ”Fråga var varje fil ska sparas” i webbläsaren för att välja mapp.';
    $('#wblock-browse').disabled=!pickFile;
    status('');refresh();dialog.showModal();
  }
  function pick(kind) { picking=kind; dialog.close(); beginPick(kind); }
  function resume(point) {
    if(!picking)return;
    if(picking==='base' && point){$('#wblock-x').value=String(point.x);$('#wblock-y').value=String(point.y);}
    if(picking==='objects')ids=getSelected().map(e=>e.id);
    picking=null;endPick();refresh();dialog.showModal();
  }
  $('#wblock-source').onchange=()=>{status('');refresh();};
  $('#wblock-action').onchange=refresh;
  $('#wblock-filename').oninput=()=>{handle=null;$('#wblock-destination').textContent=pickFile?'Välj mapp i dialogen Spara som.':'Webbläsarens nedladdningsmapp.';};
  $('#wblock-pick-base').onclick=()=>pick('base');
  $('#wblock-pick-objects').onclick=()=>pick('objects');
  $('#wblock-cancel').onclick=()=>dialog.close();
  $('#wblock-browse').onclick=async()=>{
    const name=wblockFileName($('#wblock-filename').value);
    if(!name){status('Ange ett giltigt filnamn.');return;}
    try {handle=await pickFile(name+'.dxf');$('#wblock-destination').textContent=`Vald fil: ${handle.name}`;status('');}
    catch(error){if(error.name!=='AbortError')status(error.message);}
  };
  dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
  $('#wblock-form').onsubmit=async event=>{
    event.preventDefault();if(busy)return;
    const source=getDocument(), mode=$('#wblock-source').value;
    const base={x:Number($('#wblock-x').value),y:Number($('#wblock-y').value)};
    const request={name:$('#wblock-filename').value,base,
      ...(mode==='block'?{definitionId:$('#wblock-block').value}:{entityIds:mode==='drawing'?source.entities.filter(e=>spaceOf(e)==='model' && e.type!=='viewport').map(e=>e.id):ids})};
    let file, apply;
    try {
      if(mode==='block' && !request.definitionId)throw Error('Välj en blockdefinition.');
      file=wblockDXF(source,request);
      apply=mode==='objects'?prepareChange(request,$('#wblock-action').value,$('#wblock-block-name').value):null;
    } catch(error){status(error.message);return;}
    busy=true;$('#wblock-save').disabled=true;$('#wblock-cancel').disabled=true;$('#wblock-browse').disabled=true;
    status('Sparar…');
    try {
      await saveWblockFile(file,{handle,pickFile,download});
      if(apply && getDocument()===source)apply();
      else if(apply)notify('Ritningen ändrades under exporten. Originalobjekten behölls.');
      dialog.close();notify(`WBLOCK · ${file.name} exporterad · ${file.count} objekt.`);
    } catch(error){status(error.name==='AbortError'?'Sparandet avbröts.':error.message);}
    finally {busy=false;$('#wblock-save').disabled=false;$('#wblock-cancel').disabled=false;$('#wblock-browse').disabled=!pickFile;}
  };
  return {open,resume,get picking(){return picking;},dismiss(){picking=null;if(dialog.open)dialog.close();}};
}
