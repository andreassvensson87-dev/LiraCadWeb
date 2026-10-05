import {bounds} from './entity-geometry.js';
import {blockParts} from './blocks.js';
import {hasBulges,polylineParts} from './polyline.js';
import {createSpatialIndex} from './spatial-index.js';
import {collectSnapGeometry,nearbySnaps} from './snapping.js';

const special=e=>e.type==='arc'||e.type==='block'||e.type==='dimension'||hasBulges(e);
const overlaps=(a,b)=>a.minX<=b.maxX&&a.maxX>=b.minX&&a.minY<=b.maxY&&a.maxY>=b.minY;
const paddedEdge=e=>{const pad=1e-8+Math.max(e.maxX-e.minX,e.maxY-e.minY)*1e-9;return {minX:e.minX-pad,maxX:e.maxX+pad,minY:e.minY-pad,maxY:e.maxY+pad};};
function include(box,p){box.minX=Math.min(box.minX,p.x);box.maxX=Math.max(box.maxX,p.x);box.minY=Math.min(box.minY,p.y);box.maxY=Math.max(box.maxY,p.y);}
// Conservative bounds include centers/insertion anchors outside rendered geometry.
export function snapBounds(entity) {
  if(entity.type==='circle'||entity.type==='arc')return {minX:entity.center.x-entity.radius,maxX:entity.center.x+entity.radius,minY:entity.center.y-entity.radius,maxY:entity.center.y+entity.radius};
  if(entity.type==='block'||hasBulges(entity)) {
    const result={minX:Infinity,maxX:-Infinity,minY:Infinity,maxY:-Infinity};
    for(const part of entity.type==='block'?blockParts(entity):polylineParts(entity)) {
      const box=snapBounds(part);include(result,{x:box.minX,y:box.minY});include(result,{x:box.maxX,y:box.maxY});
    }
    if(entity.type==='block')include(result,entity.point);
    return result;
  }
  const result=bounds(entity);
  if(entity.type==='dimension')for(const p of entity.points)include(result,p);
  return result;
}

// Immutable accepted entities are the cache keys. The app supplies its drawing
// index; only special anchors need a supplemental tree. No global primitive list.
export function createLocalSnapIndex(entities,{entityIndex=null,eligible=()=>true,maxCachedObjects=512,maxCachedPrimitives=8192}={}) {
  if(!Number.isInteger(maxCachedObjects)||maxCachedObjects<0||!Number.isInteger(maxCachedPrimitives)||maxCachedPrimitives<0)throw Error('Ogiltig snap-cachegräns.');
  let shared=Boolean(entityIndex),source=entityIndex||createSpatialIndex(entities,snapBounds);
  let supplement=shared?createSpatialIndex(entities.filter(special),snapBounds):null;
  let order=new Map(entities.map((entity,i)=>[entity,i])),count=entities.length,prepared=null,region=null;
  const cache=new Map();let primitives=0,builds=0,hits=0,evictions=0;
  function remove(entity){const group=cache.get(entity);primitives-=group.points.length+group.edges.length;cache.delete(entity);}
  function geometry(entity) {
    let group=cache.get(entity);
    if(group){hits++;cache.delete(entity);cache.set(entity,group);return group;}
    builds++;group=collectSnapGeometry([entity]);const weight=group.points.length+group.edges.length;
    if(maxCachedObjects && weight<=maxCachedPrimitives) {
      while(cache.size && (cache.size>=maxCachedObjects||primitives+weight>maxCachedPrimitives)){remove(cache.keys().next().value);evictions++;}
      cache.set(entity,group);primitives+=weight;
    }
    return group;
  }
  function objects(box) {
    const found=source.query(box,true,1e-9);
    if(supplement){const unique=new Set(found);for(const entity of supplement.query(box,true,1e-9))unique.add(entity);return [...unique].filter(eligible).sort((a,b)=>order.get(a)-order.get(b));}
    return found.filter(eligible);
  }
  function prepare(box,nearby=objects(box)) {
    const points=[],edges=[];
    for(const entity of nearby) {
      const group=geometry(entity);
      for(const point of group.points)if(point.p.x>=box.minX&&point.p.x<=box.maxX&&point.p.y>=box.minY&&point.p.y<=box.maxY)points.push(point);
      for(const edge of group.edges)if(overlaps(paddedEdge(edge),box))edges.push(edge);
    }
    const index={points,edges};
    return {index,objects:nearby.length,primitives:points.length+edges.length};
  }
  const api={
    nearby(p,tolerance) {
      if(!Number.isFinite(p.x)||!Number.isFinite(p.y)||!Number.isFinite(tolerance)||tolerance<0)return [];
      const request={minX:p.x-tolerance,maxX:p.x+tolerance,minY:p.y-tolerance,maxY:p.y+tolerance};
      if(!region || request.minX<region.minX || request.maxX>region.maxX || request.minY<region.minY || request.maxY>region.maxY) {
        const radius=tolerance*1.5;
        const window={minX:p.x-radius,maxX:p.x+radius,minY:p.y-radius,maxY:p.y+radius};
        const found=objects(window);let next;
        if(found.length>maxCachedObjects){next=prepare(request);region=null;prepared=null;}
        else {
          next=prepare(window,found);
          if(next.primitives>maxCachedPrimitives){next=prepare(request);region=null;prepared=null;}
          else {region=window;prepared=next;}
        }
        if(next.index.edges.length>64){next.index.edgeIndex=createSpatialIndex(next.index.edges,paddedEdge);next.index.edgeOrder=new Map(next.index.edges.map((edge,i)=>[edge,i]));}
        // Very broad searches still return every candidate, but retain no oversized window.
        return nearbySnaps(next.index,p,tolerance);
      }
      return nearbySnaps(prepared.index,p,tolerance);
    },
    update(nextEntities,nextIndex=null) {
      if(Boolean(nextIndex)!==shared){shared=Boolean(nextIndex);source=nextIndex||createSpatialIndex(nextEntities,snapBounds);supplement=shared?createSpatialIndex(nextEntities.filter(special),snapBounds):null;}
      else {source=nextIndex||source.update(nextEntities);if(shared)supplement=supplement.update(nextEntities.filter(special));}
      order=new Map(nextEntities.map((entity,i)=>[entity,i]));count=nextEntities.length;
      for(const entity of cache.keys())if(!order.has(entity))remove(entity);
      prepared=null;region=null;return api;
    },
    append(added,nextIndex=null) {
      if(Boolean(nextIndex)!==shared)throw Error('Snap-indexets källa har ändrats.');
      source=nextIndex||source.append(added);if(shared)supplement=supplement.append(added.filter(special));
      for(const entity of added)order.set(entity,count++);
      prepared=null;region=null;return api;
    },
    cacheStats:()=>({objects:cache.size,primitives,preparedObjects:prepared?.objects||0,preparedPrimitives:prepared?.primitives||0,builds,hits,evictions}),
  };
  return api;
}
