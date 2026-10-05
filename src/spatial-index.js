// Immutable bounding-volume tree. Update changed geometry, query on every
// camera/pointer move. Entries retain source order for painting and hit-test ties.
const overlaps = (a, b) => a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
function extent(entries) {
  const b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const e of entries) {
    b.minX = Math.min(b.minX, e.box.minX); b.minY = Math.min(b.minY, e.box.minY);
    b.maxX = Math.max(b.maxX, e.box.maxX); b.maxY = Math.max(b.maxY, e.box.maxY);
  }
  return b;
}
function pack(entries, leaf) {
  // Sort/tile/pack: sort once per level, rather than at every binary subtree.
  const side = Math.ceil(Math.sqrt(entries.length / 16));
  const sliceSize = Math.max(16, Math.ceil(entries.length / Math.max(1,side) / 16) * 16);
  entries.sort((a,b)=>a.cx-b.cx);
  const nodes=[];
  for(let start=0;start<entries.length;start+=sliceSize) {
    const slice=entries.slice(start,start+sliceSize).sort((a,b)=>a.cy-b.cy);
    for(let offset=0;offset<slice.length;offset+=16) {
      const group=slice.slice(offset,offset+16),box=extent(group);
      nodes.push({box,cx:box.minX/2+box.maxX/2,cy:box.minY/2+box.maxY/2,
        ...(leaf?{entries:group}:{children:group})});
    }
  }
  return nodes;
}
function build(entries) {
  if(!entries.length)return {box:extent([]),entries:[]};
  let nodes=pack(entries,true);
  while(nodes.length>1)nodes=pack(nodes,false);
  return nodes[0];
}
export function createSpatialIndex(items, getBounds = item => item) {
  const entry = (item,order) => {
    const box = getBounds(item);
    return { item, order, box, cx:box.minX/2+box.maxX/2, cy:box.minY/2+box.maxY/2 };
  };
  const node = (group,leaf) => {
    const box=extent(group);
    return {box,cx:box.minX/2+box.maxX/2,cy:box.minY/2+box.maxY/2,...(leaf?{entries:group}:{children:group})};
  };
  const area = box => Math.max(0,box.maxX-box.minX)*Math.max(0,box.maxY-box.minY);
  const insert = (root,value) => {
    const leaf=Boolean(root.entries);
    let group;
    if(leaf)group=[...root.entries,value];
    else {
      let best=0,cost=Infinity;
      for(let i=0;i<root.children.length;i++) {
        const child=root.children[i],growth=area(extent([child,value]))-area(child.box);
        if(growth<cost){cost=growth;best=i;}
      }
      group=[...root.children];group.splice(best,1,...insert(group[best],value));
    }
    return group.length<=16?[node(group,leaf)]:pack(group,leaf);
  };
  const remove = (root, item, box) => {
    if (!overlaps(root.box,box)) return root;
    if (root.entries) {
      const group=root.entries.filter(e=>e.item!==item);
      return group.length===root.entries.length?root:node(group,true);
    }
    const children=root.children.map(child=>remove(child,item,box));
    if(children.every((child,i)=>child===root.children[i]))return root;
    return node(children.filter(child=>child.entries?child.entries.length:child.children.length),false);
  };
  const make = (source,root,orders=null) => ({
    update(items) {
      if(items.length===source.length && items.every((item,i)=>item===source[i]))return this;
      const nextSource=[...items];
      let start=0,endBefore=source.length,endAfter=items.length;
      while(start<endBefore && start<endAfter && source[start]===items[start])start++;
      while(endBefore>start && endAfter>start && source[endBefore-1]===items[endAfter-1]){endBefore--;endAfter--;}
      const before=new Set(source.slice(start,endBefore)),after=new Set(items.slice(start,endAfter));
      const removed=source.slice(start,endBefore).filter(item=>!after.has(item)),added=items.slice(start,endAfter).filter(item=>!before.has(item));
      // Bulk edits still benefit from the balanced packed tree.
      if(removed.length+added.length>Math.max(64,source.length/10))return createSpatialIndex(items,getBounds);
      let next=root;
      for(const item of removed)next=remove(next,item,getBounds(item));
      while(next.children?.length===1)next=next.children[0];
      if(next.children?.length===0)next=build([]);
      const nextOrders=new Map(nextSource.map((item,i)=>[item,i]));
      for(const item of added) {
        const nodes=insert(next,entry(item,nextOrders.get(item)));
        next=nodes.length===1?nodes[0]:node(nodes,false);
      }
      return make(nextSource,next,nextOrders);
    },
    append(items) {
      if(!items.length)return this;
      let next=root;
      for(let i=0;i<items.length;i++) {
        const nodes=insert(next,entry(items[i],source.length+i));
        next=nodes.length===1?nodes[0]:node(nodes,false);
      }
      // Paint reuse must not retain every previous source array indefinitely.
      // Existing ranks stay valid; newly appended entries carry their own rank.
      return Object.assign(make([...source,...items],next,orders),{previous:new WeakRef(this),added:[...items]});
    },
    query(box, ordered = false, padding = 0) {
      // Optional numerical padding for snap geometry at very long edge ends.
      const matches=b=>{
        const pad=padding?1e-8+Math.max(b.maxX-b.minX,b.maxY-b.minY)*padding:0;
        return b.minX-pad<=box.maxX&&b.maxX+pad>=box.minX&&b.minY-pad<=box.maxY&&b.maxY+pad>=box.minY;
      };
      if (!source.length || !matches(root.box)) return [];
      if (box.minX <= root.box.minX && box.maxX >= root.box.maxX && box.minY <= root.box.minY && box.maxY >= root.box.maxY) return [...source];
      const found = [], visit = node => {
        if (!matches(node.box)) return;
        if (node.entries) { for (const entry of node.entries) if (matches(entry.box)) found.push(entry); }
        else for(const child of node.children)visit(child);
      };
      visit(root);
      if (ordered) found.sort((a,b)=>(orders?.get(a.item) ?? a.order)-(orders?.get(b.item) ?? b.order));
      return found.map(entry=>entry.item);
    },
  });
  const source=[...items];
  return make(source,build(source.map(entry)));
}
