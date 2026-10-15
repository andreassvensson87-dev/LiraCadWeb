const value = (record, code, fallback = 0) => Number(record.find(p => p[0] === code)?.[1] ?? fallback);
export function validTextColumns(c) {
  return c && [1,2].includes(c.type) && Number.isInteger(c.count) && c.count > 0 && c.count <= 100 &&
    Number.isFinite(c.width) && c.width > 0 && Number.isFinite(c.gutter) && c.gutter >= 0 &&
    typeof c.autoHeight === 'boolean' && typeof c.reversed === 'boolean' &&
    Array.isArray(c.heights) && c.heights.length <= 100 && c.heights.every(Number.isFinite);
}
export function readTextColumns(record, context = false) {
  const embedded = record.findIndex(p => p[0] === 101 && p[1] === 'Embedded Object');
  const legacy = record.findIndex(p=>p[0]===75);
  const data = embedded >= 0 ? record.slice(embedded + 1) : !context && legacy>=0 ? record.slice(legacy) : record;
  const modern = context || embedded >= 0;
  const type = value(data, modern ? 71 : 75);
  if (!type) return null;
  const count = value(data, modern ? 72 : 76), width = value(data, modern ? 44 : 48), gutter = value(data, modern ? 45 : 49);
  const heights = modern ? data.filter(p => p[0] === 46).map(p => Number(p[1])) : data.filter(p => p[0] === 50).slice(1).map(p => Number(p[1]));
  const autoHeight = !!value(data, modern ? 73 : 79), reversed = !!value(data, modern ? 74 : 78);
  if (type === 1 && !heights.length) heights.push(...Array.from({length: Math.min(100, Math.max(0,count))}, () => value(data, modern ? 41 : 46)));
  const result = { type, count, width, gutter, autoHeight, reversed, heights };
  return validTextColumns(result) ? result : null;
}
export function scaleTextColumns(c, widthScale, heightScale = widthScale) {
  return {...c,width:c.width*Math.abs(widthScale),gutter:c.gutter*Math.abs(widthScale),heights:c.heights.map(h=>h*Math.abs(heightScale))};
}

// Lines already contain measured runs. Lay them out in columns without losing
// overflow text; canvas, bounds, selection and SVG share these coordinates.
export function placeTextColumns(lines, c, spacing) {
  const advance = (a,b) => spacing(a,b);
  function place(limits, positions = false) {
    let column=0, y=0, previous=null;
    const used=Array(c.count).fill(0);
    for (const line of lines) {
      let nextY = previous ? y+advance(previous,line) : 0;
      if ((line.columnBreak || nextY+line.height > limits[column]+1e-8) && previous && column < c.count-1) {column++;previous=null;nextY=0;}
      y=nextY;
      if (positions) {line.column=c.reversed?c.count-1-column:column;line.y=y;}
      used[column]=Math.max(used[column], y+line.height);previous=line;
    }
    return used;
  }
  let total=0;
  for(let i=0;i<lines.length;i++) total=i?total+advance(lines[i-1],lines[i]):lines[i].height;
  total=Math.max(total,...lines.map(l=>l.height));
  let limits;
  if(c.autoHeight || !c.heights.some(h=>h>0)) {
    let low=Math.max(...lines.map(l=>l.height)), high=total;
    for(let i=0;i<32;i++){const mid=(low+high)/2;place(Array(c.count).fill(mid)).at(-1)>mid+1e-8?low=mid:high=mid;}
    limits=Array(c.count).fill(high);
  } else limits=Array.from({length:c.count},(_,i)=>c.heights[i]>0?c.heights[i]:total);
  const used=place(limits,true);
  return {height:Math.max(...used),width:c.count*c.width+(c.count-1)*c.gutter};
}
