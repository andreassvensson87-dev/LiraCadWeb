export const paperLineWeight=(e,layer)=>Math.max(0.05,e.lineWeight??layer?.lineWeight??0.2);
export function paperColor(e,layer,monochrome=false){
  if(monochrome)return '#000000';
  const color=e.color||layer?.color||'#000000';
  return color.toLowerCase()==='#ffffff' && (e.color?e.cadColor7:layer?.cadColor7!==false)?'#000000':color;
}
