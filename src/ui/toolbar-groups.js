// Explicit placement keeps new commands from silently landing in the wrong menu.
export const toolbarGroups = {
  draw: [
    {label:'Geometri',commands:['LINE','PLINE','RECTANG','CIRCLE','ARC']},
    {label:'Text & skraffering',commands:['TEXT','LEADER','HATCH']},
  ],
  edit: [
    {label:'Placering',commands:['MOVE','COPY','ROTATE','SCALE','MIRROR']},
    {label:'Forma',commands:['STRETCH','OFFSET','TRIM','FILLET','CHAMFER']},
    {label:'Objekt & hörn',commands:['JOIN','PINSERT','PDELETE','ERASE']},
  ],
  block: [
    {label:'Skapa & infoga',commands:['BLOCK','INSERT']},
    {label:'Redigera block',commands:['BEDIT','BSTRETCH','ATTDEF','EXPLODE']},
    {label:'Exportera',commands:['WBLOCK']},
  ],
  dimension: [
    {label:'Längd & vinkel',commands:['DIMLINEAR','DIMALIGNED','DIMANGULAR','DIMCONTINUE']},
    {label:'Cirkel & båge',commands:['DIMRADIUS','DIMDIAMETER']},
  ],
};
export const toolbarLabels = {BSTRETCH:'Stretchparameter',WBLOCK:'Exportera mall',ATTDEF:'Attributdefinition',LEADER:'Hänvisning',HATCH:'Skraffering'};
