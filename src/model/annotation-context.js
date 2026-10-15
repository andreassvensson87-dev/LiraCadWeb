import { blockParts } from "./blocks.js";
import { transform } from "./entity-transform.js";
// Annotation scale is independent of the viewport's physical plot scale.
// Resolve only stored representations; never invent missing text contexts.
export function annotationEntity(e, viewport) {
  const variant=e.annotationVariants?.find(v=>viewport?.annotationScale && Math.abs(v.denominator/viewport.annotationScale-1)<1e-8);
  if(variant){const result={...variant.entity,id:e.id,layer:e.layer,space:e.space,...(["text","dimension"].includes(e.type)?{text:e.text}:{}),...(e.type==="block"?{values:e.values,parameterValues:e.parameterValues}:{} )};if(variant.entity.text!==e.text)delete result.textRuns;for(const key of ["hidden","color","lineType","lineWeight","cadColor7","inheritLayer","_xrefId","_xrefSnap","_xrefOpacity"]){if(key in e)result[key]=e[key];else delete result[key];}return result;}
  if(e.annotationVariants?.length && !e.annotationContexts?.length && viewport?.showAllAnnotations===false)return null;
  const contexts = e.annotationContexts;
  if (!contexts?.length || !viewport?.annotationScale) return e;
  const context = contexts.find(c => Math.abs(c.denominator / viewport.annotationScale - 1) < 1e-8);
  if (!context) return viewport.showAllAnnotations === false ? null : e;
  const base = e.annotationBase;
  if(e.type!=="block"){
    const k=context.scale/base.scale,flip=context.mirrored!==base.mirrored?-1:1,angle=context.rotation-flip*base.rotation;
    const source={...e};delete source.annotationBase;delete source.annotationContexts;
    return transform(source,p=>{const x=p.x-base.point.x,y=p.y-base.point.y;return {x:context.point.x+k*(Math.cos(angle)*x-flip*Math.sin(angle)*y),y:context.point.y+k*(Math.sin(angle)*x+flip*Math.cos(angle)*y)};},{scale:k,rotation:angle,mirror:flip<0});
  }
  const k = e.scale / base.scale, flip = !!e.mirrored !== base.mirrored ? -1 : 1;
  const angle = (e.rotation || 0) - flip * base.rotation;
  // Move/rotate/scale edits to the instance apply to every stored representation.
  const dx=context.point.x-base.point.x,dy=context.point.y-base.point.y;
  return {...e,point:{x:e.point.x+k*(Math.cos(angle)*dx-flip*Math.sin(angle)*dy),y:e.point.y+k*(Math.sin(angle)*dx+flip*Math.cos(angle)*dy)},scale:k*context.scale,rotation:angle+flip*context.rotation,mirrored:flip<0?!context.mirrored:context.mirrored};
}
export function viewportEntities(entities, viewport, layers) {
  const frozen = new Set(viewport.frozenLayers || []);
  const layerNames = new Map(layers.map(l=>[l.id,l.name]));
  const visible=e=>!e.hidden&&!frozen.has(layerNames.get(e.layer));
  return entities.filter(visible).map(e=>annotationEntity(e,viewport)).filter(Boolean).flatMap(e=>e.type==="block" && (frozen.size || e.definition.entities.some(p=>p.annotationVariants?.length||p.annotationContexts?.length)) ? blockParts(e).map(p=>annotationEntity(p,viewport)).filter(Boolean) : [e]).filter(visible);
}
export function validAnnotation(e, pt) {
  if(e.annotative!=null && typeof e.annotative!=='boolean')return false;
  if(e.annotationScale!=null && (e.type!=='viewport'||!Number.isFinite(e.annotationScale)||e.annotationScale<=0))return false;
  if(e.showAllAnnotations!=null && (e.type!=='viewport'||typeof e.showAllAnnotations!=='boolean'))return false;
  if(e.frozenLayers!=null && (e.type!=='viewport'||!Array.isArray(e.frozenLayers)||e.frozenLayers.length>10000||e.frozenLayers.some(s=>typeof s!=='string'||s.length>1024)))return false;
  if(e.annotationContexts==null)return e.annotationBase==null;
  const representation = c=>c && pt(c.point)&&Number.isFinite(c.scale)&&c.scale>0&&Number.isFinite(c.rotation)&&typeof c.mirrored==='boolean';
  return e.type!=='viewport' && representation(e.annotationBase) && Array.isArray(e.annotationContexts) && e.annotationContexts.length>0 && e.annotationContexts.length<=1000 && e.annotationContexts.every(c=>representation(c)&&Number.isFinite(c.denominator)&&c.denominator>0);
}
