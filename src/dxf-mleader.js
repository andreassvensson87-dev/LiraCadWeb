// MLEADER contains nested records. Identical group codes have different meanings
// in context, leader and leader-line scopes; never scan it as a flat TEXT entity.
export function mleaderParts(record, makeText, common) {
  const get=(r,c,f=0)=>r.find(p=>p[0]===c)?.[1]??f, num=(r,c,f=0)=>Number(get(r,c,f));
  const pt=(r,c=10)=>({x:num(r,c),y:num(r,c+10)});
  const start=record.findIndex(([c,v])=>c===300&&v==='CONTEXT_DATA{');
  if(start<0)throw Error('MULTILEADER saknar kontext');
  let firstLeader=record.findIndex(([c,v],i)=>i>start&&c===302&&v==='LEADER{');
  const context=record.slice(start+1,firstLeader<0?record.findIndex(([c])=>c===301):firstLeader);
  if(num(context,296))throw Error('MULTILEADER med blockinnehåll stöds inte');
  if(Math.abs(num(context,11))>1e-8||Math.abs(num(context,21))>1e-8||Math.abs(num(context,31,1)-1)>1e-8)throw Error('MULTILEADER utanför XY-planet stöds inte');
  const entities=[],height=num(context,41,2.5);
  if(num(context,290)) entities.push(makeText([
    [0,'MTEXT'],[1,get(context,304,'')],[10,num(context,12)],[20,num(context,22)],[40,height],[41,num(context,43)],
    [71,num(context,171,1)],[44,num(context,45,1)],[73,num(context,170,1)],[11,num(context,13,1)],[21,num(context,23)],
    [7,get(context,340,'')],
  ]));
  for(let i=start+1;i<record.length;i++)if(record[i][0]===302){
    const leaderStart=i+1;let end=leaderStart;while(end<record.length&&record[end][0]!==303)end++;
    const leader=record.slice(leaderStart,end), lineStart=leader.findIndex(([c,v])=>c===304&&v==='LEADER_LINE{');
    const head=leader.slice(0,lineStart<0?undefined:lineStart),landing=pt(head),direction=pt(head,11);
    for(let j=0;j<leader.length;j++)if(leader[j][0]===304&&leader[j][1]==='LEADER_LINE{'){
      let stop=j+1;while(stop<leader.length&&leader[stop][0]!==305)stop++;
      const points=[];for(const [c,v] of leader.slice(j+1,stop)){if(c===10)points.push({x:Number(v),y:0});if(c===20&&points.length)points.at(-1).y=Number(v);}
      points.push(landing);
      if(num(head,291)){const length=num(head,40);points.push({x:landing.x+direction.x*length,y:landing.y+direction.y*length});}
      if(points.length>=2)entities.push({...common,type:'leader',points,text:'',height,arrowSize:num(context,140,height*0.75)});
      j=stop;
    }
    i=end;
  }
  if(!entities.length)throw Error('MULTILEADER saknar läsbart innehåll');
  return entities;
}
