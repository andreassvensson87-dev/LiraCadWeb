import { annotationEntity } from './annotation-context.js';
import { transformed } from './entity-transform.js';
import { clone } from './values.js';
const metadata=['annotationVariants','annotationContexts','annotationBase','_annotationScale','_annotationSource'];
export function plainAnnotationEntity(entity){
 const e=clone(entity);for(const key of metadata)delete e[key];
 if(e.definition)e.definition.entities=e.definition.entities.map(plainAnnotationEntity);
 return e;
}
export function hasAnnotationView(e){return !!(e.annotationVariants?.length||e.annotationContexts?.length||e.type==='block'&&e.definition.entities.some(hasAnnotationView));}
export function annotationView(e,viewport,layers=[]){
 if(!viewport?.annotationScale)return e;
 const variant=e.annotationVariants?.find(v=>Math.abs(v.denominator/viewport.annotationScale-1)<1e-8);
 let view=variant?{...clone(variant.entity),id:e.id,layer:e.layer,space:e.space}:annotationEntity(e,viewport);
 if(!view)return null;
 if(view.type==='block'){
  const parts=view.definition.entities.filter(p=>!viewport.frozenLayers?.includes(layers.find(l=>l.id===(p.inheritLayer?e.layer:p.layer))?.name)).map(p=>annotationView(p,viewport,layers)).filter(Boolean);
  if(!parts.length)return null;
  if(parts.some((p,i)=>p!==view.definition.entities[i])||parts.length!==view.definition.entities.length)view={...view,definition:{...view.definition,entities:parts}};
 }
 for(const key of ['hidden','color','lineType','lineWeight','cadColor7','inheritLayer','_xrefId','_xrefSnap','_xrefOpacity']){if(key in e)view={...view,[key]:e[key]};else if(key in view){view={...view};delete view[key];}}
 if(!hasAnnotationView(e))return view;
 // Content belongs to the object; placement and appearance belong to the scale.
 if(e.type==='text'||e.type==='dimension'){const changed=view.text!==e.text;view={...view,text:e.text};if(changed)delete view.textRuns;}
 if(e.type==='block')view={...view,values:e.values,parameterValues:e.parameterValues};
 return {...plainAnnotationEntity(view),_annotationScale:viewport.annotationScale,_annotationSource:e.id};
}
export function storeAnnotationView(source,edited,denominator=edited._annotationScale){
 if(!denominator||source.type!==edited.type)return plainAnnotationEntity(edited);
 const entity=plainAnnotationEntity(edited);
 const variants=(source.annotationVariants||[]).filter(v=>Math.abs(v.denominator/denominator-1)>=1e-8);
 const result={...clone(source),annotative:true,annotationVariants:[...variants,{denominator,entity}]};
 // Preserve shared content and layer changes across all views.
 for(const key of ['text','values','parameterValues','layer','color','lineType','lineWeight'])if(key in edited)result[key]=clone(edited[key]);
 if(source.text!==edited.text && ['text','dimension'].includes(source.type)){
   delete result.textRuns;
   for(const variant of result.annotationVariants){variant.entity.text=edited.text;delete variant.entity.textRuns;}
 }
 if(source.type==='dimension' && source.points && edited.points){
   result.points=source.points.map((p,i)=>i<2?clone(edited.points[i]):p);
   for(const variant of result.annotationVariants)variant.entity.points=variant.entity.points.map((p,i)=>i<2?clone(edited.points[i]):p);
 }
 return result;
}
export function createAnnotationView(source,viewport){
 if(!viewport?.annotationScale)throw Error('Ange en annotationsskala för viewporten först.');
 return storeAnnotationView(source,annotationView(source,viewport)||source,viewport.annotationScale);
}

export function copyAnnotationView(source,edited,viewport){
 const view=annotationView(source,viewport),origin=view?.point||view?.center||view?.points?.[0],target=edited.point||edited.center||edited.points?.[0];
 if(!origin||!target||source.type!==edited.type)return plainAnnotationEntity(edited);
 const result=transformed(source,'MOVE',origin,target);result.id=edited.id;return result;
}
