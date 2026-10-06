const frame=document.querySelector('#app'),result=document.querySelector('#result');
const pause=()=>new Promise(resolve=>setTimeout(resolve,25));
async function wait(check) {
  const end=performance.now()+15000;
  while(performance.now()<end){if(check())return;await pause();}
  throw Error('Appen blev inte klar i tid.');
}
const app=()=>frame.contentDocument;
const query=selector=>app().querySelector(selector);
const tabs=()=>[...app().querySelectorAll('#project-tabs [role="tab"]')];
const count=()=>Number(query('#entity-count').textContent.split(' ')[0]);
function assert(condition,message){if(!condition)throw Error(message);}
function command(text) {
  const input=query('#command-input');input.value=text;
  input.dispatchEvent(new frame.contentWindow.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
}
function click(selector){query(selector).click();}
document.querySelector('#run').onclick=async()=>{
  const button=document.querySelector('#run');button.disabled=true;const passed=[];
  result.textContent='Kör…';
  try {
    if(!location.hostname.startsWith('workspace-') || !location.hostname.endsWith('.localhost'))throw Error('Använd en separat workspace-*.localhost-testadress.');
    await wait(()=>query('#project-tabs [role="tab"]') && !app().body.inert);
    assert(tabs().length===1,'Använd en ny testadress med en enda startflik.');
    const baseline=count(),first=tabs()[0].dataset.project;
    const canvasRect=query('#canvas').getBoundingClientRect(),barRect=query('.project-bar').getBoundingClientRect();
    assert(barRect.bottom<=canvasRect.top+1,'Projektflikarna ska ligga ovanför canvasen.');
    click('#new-project-tab');await wait(()=>tabs().length===2 && query('#save-state').textContent==='Autosparat lokalt');
    const second=tabs()[1].dataset.project;
    assert(count()===0,'Ny flik ska ha en tom ritning.');
    command('LINE');command('0,0');command('1000,1000');command('');
    assert(count()===1,'Linjen ska endast finnas i andra projektet.');
    tabs()[0].click();assert(count()===baseline,'Första projektets geometri ska bevaras.');
    assert(query('#undo').disabled,'Andra flikens historik ska inte påverka första.');
    tabs()[1].click();click('#undo');assert(count()===0,'Andra projektet ska ha sin egen Ångra.');
    click('#redo');assert(count()===1,'Gör om ska bevaras vid flikbyte.');
    click('#zoom-out');await pause();
    const zoom=query('#zoom-level').textContent;
    tabs()[0].click();tabs()[1].click();await pause();
    assert(query('#zoom-level').textContent===zoom,'Andra projektets zoom ska bevaras vid flikbyte.');
    click('#new-layout');
    const layout=query('#space-tabs [aria-selected="true"]').textContent;
    tabs()[0].click();tabs()[1].click();
    assert(query('#space-tabs [aria-selected="true"]').textContent===layout,'Layouten ska bevaras per projekt.');
    passed.push('Separata ritningar, kameravy, layout och Ångra/Gör om');
    const layer='file-layer',document={version:1,name:'Öppnad projektfil',layers:[{id:layer,name:'0',color:'#c3d6ce',visible:true,locked:false}],entities:[
      {id:'file-line-1',type:'line',layer,points:[{x:0,y:0},{x:100,y:100}]},
      {id:'file-line-2',type:'line',layer,points:[{x:100,y:0},{x:0,y:100}]},
    ]};
    const transfer=new frame.contentWindow.DataTransfer();
    transfer.items.add(new frame.contentWindow.File([JSON.stringify(document)],'Öppnad projektfil.liracad',{type:'application/json'}));
    query('#file-input').files=transfer.files;query('#file-input').dispatchEvent(new frame.contentWindow.Event('change',{bubbles:true}));
    await wait(()=>tabs().length===3 && count()===2 && query('#save-state').textContent==='Autosparat lokalt');
    const file=tabs()[2].dataset.project;
    assert(tabs()[0].dataset.project===first && tabs()[1].dataset.project===second,'Filöppning får inte ersätta befintliga flikar.');
    passed.push('Filöppning skapar en tredje projektflik');
    click('#demo-file');await wait(()=>tabs().length===4 && query('#save-state').textContent==='Autosparat lokalt');
    assert(count()===baseline,'Exempelprojekt ska öppnas separat.');
    tabs()[2].click();click('#project-tabs .project-tab:nth-child(3) .close-project');
    await wait(()=>tabs().length===3 && !app().body.inert);
    const reopen=query('#reopen-project');reopen.value=file;reopen.dispatchEvent(new frame.contentWindow.Event('change',{bubbles:true}));
    await wait(()=>tabs().length===4 && count()===2 && !app().body.inert);
    passed.push('Stängd flik kan återöppnas utan förlorad geometri');
    frame.contentWindow.location.reload();
    await wait(()=>query('#project-tabs [role="tab"]') && tabs().length===4 && !app().body.inert);
    assert(query('#project-tabs [aria-selected="true"]').dataset.project===file,'Aktiv flik ska återställas.');
    assert(count()===2,'Öppnad fil ska återställas efter omladdning.');
    query('[data-project="'+second+'"]').click();assert(count()===1,'Andra flikens ändring ska återställas.');
    query('[data-project="'+first+'"]').click();assert(count()===baseline,'Startprojektet ska vara bevarat efter omladdning.');
    query('[data-project="'+file+'"]').click();
    passed.push('Alla projekt och aktiv flik återställs efter omladdning');
    result.textContent='GODKÄNT\n'+passed.map(text=>'✓ '+text).join('\n')+'\n4 projektflikar · startprojektet bevarat';
  } catch(error){result.textContent='FEL: '+error.message+'\n'+passed.join('\n');}
  finally{button.disabled=false;}
};
