// Serializable document differences. Keep unchanged geometry out of the small
// synchronous recovery log, including when history inserts objects in the middle.
const equal = (a,b) => a === b || JSON.stringify(a) === JSON.stringify(b);
const fail = () => { throw Error('Ändringsloggen är ogiltig.'); };

function stableIds(entries) {
  // Longest increasing subsequence of old positions: these entities need no move.
  const tails=[],previous=new Array(entries.length).fill(-1);
  for(let i=0;i<entries.length;i++) {
    let lo=0,hi=tails.length;
    while(lo<hi){const mid=(lo+hi)>>1;if(entries[tails[mid]].position<entries[i].position)lo=mid+1;else hi=mid;}
    if(lo)previous[i]=tails[lo-1];tails[lo]=i;
  }
  const ids=new Set();
  for(let i=tails.at(-1);i!==undefined && i!==-1;i=previous[i])ids.add(entries[i].id);
  return ids;
}
export function createDocumentPatch(before,after) {
  const set=Object.create(null),unset=[];
  for(const key of new Set([...Object.keys(before),...Object.keys(after)])) {
    if(key==='entities' || equal(before[key],after[key]))continue;
    if(after[key]===undefined)unset.push(key);else set[key]=after[key];
  }
  const a=before.entities,b=after.entities;
  let start=0,endA=a.length,endB=b.length;
  while(start<endA && start<endB && a[start]===b[start])start++;
  while(endA>start && endB>start && a[endA-1]===b[endB-1]){endA--;endB--;}
  const old=new Map(a.slice(start,endA).map((entity,i)=>[entity.id,{entity,position:i}]));
  const ids=new Set(),upsert=[],retained=[];let ordered=true,last=-1;
  for(let i=start;i<endB;i++) {
    const entity=b[i],existing=old.get(entity.id);ids.add(entity.id);
    if(!existing || !equal(existing.entity,entity))upsert.push(entity);
    if(existing){retained.push({id:entity.id,position:existing.position});if(existing.position<last)ordered=false;last=existing.position;}
  }
  const stable=ordered?new Set(retained.map(e=>e.id)):stableIds(retained);
  const remove=[...old.keys()].filter(id=>!ids.has(id));
  const place=[];
  for(let i=start;i<endB;i++)if(!stable.has(b[i].id))place.push({id:b[i].id,index:i});
  if(!remove.length&&!upsert.length&&!place.length&&!unset.length&&!Object.keys(set).length)return null;
  return {remove,upsert,place,set,unset};
}
export function applyDocumentPatch(document,patch) {
  if(!patch || !Array.isArray(patch.remove)||!Array.isArray(patch.upsert)||!Array.isArray(patch.place)||!Array.isArray(patch.unset)||!patch.set||typeof patch.set!=='object'||Array.isArray(patch.set))fail();
  if(Object.hasOwn(patch.set,'entities')||patch.unset.includes('entities')||patch.unset.some(key=>typeof key!=='string'))fail();
  const byId=new Map(document.entities.map(entity=>[entity.id,entity])),removed=new Set(),updated=new Set(),placed=new Set(),newIds=new Set();
  for(const id of patch.remove){if(typeof id!=='string'||removed.has(id)||!byId.has(id))fail();removed.add(id);}
  for(const entity of patch.upsert){if(!entity || typeof entity.id!=='string'||updated.has(entity.id)||removed.has(entity.id))fail();updated.add(entity.id);if(!byId.has(entity.id))newIds.add(entity.id);byId.set(entity.id,entity);}
  let last=-1;
  for(const item of patch.place){if(!item || typeof item.id!=='string'||!Number.isInteger(item.index)||item.index<=last||placed.has(item.id)||removed.has(item.id)||!byId.has(item.id))fail();placed.add(item.id);last=item.index;}
  const entities=document.entities.filter(e=>!removed.has(e.id)&&!placed.has(e.id)).map(e=>byId.get(e.id));
  // Merge placement positions in one pass instead of repeated large-array splices.
  const total=entities.length+patch.place.length,nextEntities=[];let cursor=0,placement=0;
  for(let i=0;i<total;i++) {
    if(patch.place[placement]?.index===i)nextEntities.push(byId.get(patch.place[placement++].id));
    else {if(cursor>=entities.length)fail();nextEntities.push(entities[cursor++]);}
  }
  if(placement!==patch.place.length || [...newIds].some(id=>!placed.has(id)))fail();
  const next={...document,...patch.set,entities:nextEntities};
  for(const key of patch.unset)delete next[key];
  return next;
}
