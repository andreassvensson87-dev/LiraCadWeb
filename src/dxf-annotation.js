import { readTextColumns } from "./text-columns.js";
const get=(r,c,f='')=>r.find(p=>p[0]===c)?.[1]??f;
const num=(r,c,f=0)=>Number(get(r,c,f));
export const annotationMetadata=e=>Object.fromEntries(['annotationLayerNames','annotationVariants','annotative','annotationBase','annotationContexts','annotationScale','showAllAnnotations','frozenLayers'].filter(k=>e[k]!=null).map(k=>[k,e[k]]));
export function readAnnotations(sections,warn) {
  const records=[...sections.values()].flat(), byHandle=new Map(records.filter(r=>get(r,5)).map(r=>[get(r,5).trim(),r]));
  const dictionary=(r,name)=>{
    const i=r.findIndex(([c,v])=>c===3&&v===name);
    return i<0?[]:byHandle.get(r[i+1]?.[1].trim())||[];
  };
  const extension=r=>byHandle.get(get(r,360).trim())||[];
  const scale=r=>{const p=num(r,140),d=num(r,141);return p>0&&d>0&&Number.isFinite(d/p)?d/p:null;};
  const representation=r=>{
    const x=num(r,41,1),y=num(r,42,1);
    if(!x||!y||Math.abs(Math.abs(x)-Math.abs(y))>1e-8||num(r,30)!==0)return null;
    return {point:{x:num(r,10),y:num(r,20)},scale:Math.abs(x),rotation:num(r,50)*Math.PI/180+(x<0?Math.PI:0),mirrored:x*y<0};
  };
  const flag=r=>{
    const i=r.findIndex(([c,v])=>c===1001&&v==='AcadAnnotative');
    if(i<0)return false;
    const tail=r.slice(i+1),end=tail.findIndex(([c])=>c===1001);
    return Number((end<0?tail:tail.slice(0,end)).filter(([c])=>c===1070).at(-1)?.[1])===1;
  };
  const header=(sections.get("HEADER")||[]).flat(),allIndex=header.findIndex(([c,v])=>c===9&&v==="$ANNOALLVISIBLE");
  const showAll=allIndex<0?true:Number(header[allIndex+1]?.[1])!==0;
  let visibilityWarning=false;
  const hasContexts=records.some(r=>/^ACDB_(?:BLKREF|M?TEXT|ALDIM|ANGDIM|DMDIM|RADIM|RADIMLG|ORDDIM)OBJECTCONTEXTDATA(?:_CLASS)?$/.test(get(r,0)));
  const reader=r=>{
    // Our DXF extension preserves app contexts across exports. Other CAD readers
    // see the ordinary base entity, not native AutoCAD annotation dictionaries.
    const i=r.findIndex(([c,v])=>c===1001&&v==='LIRA_ANNOTATION');
    if(i>=0){let json='';for(const [c,v]of r.slice(i+1)){if(c===1001)break;if(c===1000)json+=v;}try{return annotationMetadata(JSON.parse(json));}catch{warn('Skalberoende LiraCAD-data kunde inte läsas');}}
    const result=flag(r)?{annotative:true}:{};
    const manager=dictionary(extension(r),'AcDbContextDataManager');
    const contexts=dictionary(manager,'ACDB_ANNOTATIONSCALES');
    const reps=contexts.filter(([c])=>c===350||c===360).map(([,h])=>byHandle.get(h.trim())||[]);
    if(reps.length)result.annotative=true;
    if(get(r,0)==='INSERT'){
      const supported=reps.filter(c=>/^ACDB_BLKREFOBJECTCONTEXTDATA(?:_CLASS)?$/.test(get(c,0))).map(c=>{const denominator=scale(byHandle.get(get(c,340).trim())||[]),rep=representation(c);return denominator&&rep?{denominator,...rep}:null;}).filter(Boolean);
      if(supported.length){result.annotationContexts=supported;result.annotationBase=representation(r);}
      if(reps.length!==supported.length)warn('Annotativt block: vissa skalvarianter kunde inte läsas; grundgeometrin bevarades');
    }
    if(result.annotative&&!result.annotationContexts&&get(r,0)!=="DIMENSION"&&!['TEXT','MTEXT','ATTRIB','ATTDEF'].includes(get(r,0)))warn('Annotativt objekt saknar läsbara skalvarianter; sparad geometri används utan antagen textskalning');
    if(get(r,0)==='VIEWPORT'){
      const info=dictionary(extension(r),'ASDK_XREC_ANNOTATION_SCALE_INFO');
      const denominator=scale(byHandle.get(get(info,340).trim())||[]);
      if(denominator){
        result.annotationScale=denominator;
        if(hasContexts){result.showAllAnnotations=showAll;
          if(allIndex<0&&!visibilityWarning){warn("Annotativa skalvarianter bevarades; originalets visning av ej matchande skalor saknas. Visa övriga skalvarianter är på och kan ändras för viewporten");visibilityWarning=true;}
        }
      }
      const frozen=r.filter(([c])=>c===331).map(([,h])=>get(byHandle.get(h.trim())||[],2)).filter(Boolean);
      if(frozen.length)result.frozenLayers=frozen;
    }
    return result;
  };
  reader.textVariants=(r,entity)=>{
    if(entity.annotationVariants?.length)return entity;
    const manager=dictionary(extension(r),'AcDbContextDataManager'),contexts=dictionary(manager,'ACDB_ANNOTATIONSCALES');
    const leaves=contexts.filter(([c])=>c===350||c===360).map(([,h])=>byHandle.get(h.trim())||[]);
    const relevant=leaves.filter(c=>/^ACDB_(?:M)?TEXTOBJECTCONTEXTDATA(?:_CLASS)?$/.test(get(c,0)));
    const defaults=relevant.filter(c=>num(c,290)===1),baseScale=defaults.length===1?scale(byHandle.get(get(defaults[0],340).trim())||[]):null;
    const variants=[];
    if(baseScale)for(const leaf of relevant){
      const denominator=scale(byHandle.get(get(leaf,340).trim())||[]);
      const marker=leaf.findIndex(([c,v])=>c===100 && /^AcDb(?:M)?TextObjectContextData$/.test(v));
      if(!denominator||marker<0)continue;
      const data=leaf.slice(marker+1),mtext=get(r,0)==='MTEXT';
      if(num(data,30)!==0 || mtext && num(data,31)!==0)continue;
      const mode=num(data,70),pointCode=!mtext && (mode!==0||entity.textVertical!=='baseline')?11:10;
      if(!mtext && ![0,1,2,4].includes(mode) || get(data,pointCode)==='' || get(data,pointCode+10)==='')continue;
      const variant={...structuredClone(entity),point:{x:num(data,pointCode),y:num(data,pointCode+10)},height:entity.height*denominator/baseScale};
      delete variant.annotationVariants;delete variant.annotationContexts;delete variant.annotationBase;
      if(mtext){if(mode<1||mode>9||get(data,11)===''||get(data,21)===''||get(data,40)==='')continue;variant.textAttachment=mode;variant.textWidth=num(data,40);variant.rotation=Math.atan2(num(data,21),num(data,11,1));const columns=readTextColumns(data,true);if(num(data,71)!==0&&!columns)continue;if(columns)variant.textColumns=columns;else delete variant.textColumns;}
      else {variant.rotation=num(data,50)*Math.PI/180;variant.textAlign=['left','center','right'][mode]||'center';if(mode===4)variant.textVertical='middle';}
      if(!Number.isFinite(variant.height)||variant.height<=0||!Number.isFinite(variant.point.x)||!Number.isFinite(variant.point.y)||!Number.isFinite(variant.rotation)||mtext&&(!Number.isFinite(variant.textWidth)||variant.textWidth<0))continue;
      if(variants.some(v=>v.denominator===denominator)||variants.length>=100)continue;
      variants.push({denominator,entity:variant});
    }
    if(variants.length){entity.annotative=true;entity.annotationVariants=variants;}
    if((entity.annotative || leaves.length) && variants.length!==leaves.length)warn('Annotativ text: skalvarianter utan läsbar placering och ursprungsskala bevaras som grundgeometri; justera per annotationsskala');
    if(entity.annotative&&!leaves.length)warn('Annotativt objekt saknar läsbara skalvarianter; sparad geometri används utan antagen textskalning');
    return entity;
  };
  reader.dimensionVariants=(r,entity,graphicsForBlock,graphicsState)=>{
    if(entity.annotationVariants?.length)return entity;
    const contexts=dictionary(dictionary(extension(r),'AcDbContextDataManager'),'ACDB_ANNOTATIONSCALES');
    const leaves=contexts.filter(([c])=>c===350||c===360).map(([,h])=>byHandle.get(h.trim())||[]);
    const relevant=leaves.filter(c=>/^ACDB_(?:ALDIM|ANGDIM|DMDIM|RADIM|RADIMLG|ORDDIM)OBJECTCONTEXTDATA(?:_CLASS)?$/.test(get(c,0)));
    const defaults=relevant.filter(c=>num(c,290)===1),baseScale=defaults.length===1?scale(byHandle.get(get(defaults[0],340).trim())||[]):null;
    const variants=[];
    if(baseScale)for(const leaf of relevant){
      const denominator=scale(byHandle.get(get(leaf,340).trim())||[]),reference=get(leaf,2),name=get(byHandle.get(reference)||[],2,reference);
      if(!denominator||variants.length>=100||variants.some(v=>v.denominator===denominator))continue;
      const graphics=graphicsForBlock(name);if(!graphics?.length)continue;
      const variant=structuredClone(entity),factor=denominator/baseScale;
      for(const key of ['height','arrowSize','extensionOffset','extensionOvershoot','textGap'])if(variant[key]!=null)variant[key]*=factor;
      if(['linear','aligned'].includes(variant.kind) && get(leaf,11)!=='' && get(leaf,21)!=='' && num(leaf,31)===0)variant.points[2]={x:num(leaf,11),y:num(leaf,21)};
      if(get(leaf,10)!==''&&get(leaf,20)!=='')variant.dimensionTextPoint={x:num(leaf,10),y:num(leaf,20)};
      variant.dimensionGraphics=graphics;variant.dimensionGraphicsState=graphicsState(variant);
      delete variant.annotationVariants;delete variant.annotationContexts;delete variant.annotationBase;
      variants.push({denominator,entity:variant});
    }
    if(variants.length){entity.annotative=true;entity.annotationVariants=variants;}
    if((entity.annotative||leaves.length)&&variants.length!==leaves.length)warn('Annotativt mått: skalvarianter utan läsbart måttblock och ursprungsskala bevaras som grundgeometri; justera per annotationsskala');
    if(entity.annotative&&!leaves.length)warn('Annotativt objekt saknar läsbara skalvarianter; sparad geometri används utan antagen textskalning');
    return entity;
  };
  return reader;
}
