export function cardGridMetrics({width,height,matWidth,zoom=100,lands=false}) {
  const gap=5,label=lands?0:16,ratio=680/488;
  const compact=Math.max(12,Math.min((width-gap*5)/6,((height-gap*2)/3-label)/ratio));
  const normal=Math.min(lands?125:240,matWidth*(lands?.09:.19));
  const scale=Math.max(32,Math.min(140,Number(zoom)||100));
  const cardWidth=Math.max(12,compact+(Math.max(compact,normal)-compact)*(scale-32)/68);
  const columns=scale===32?6:Math.max(1,Math.min(6,Math.floor((width+gap)/(cardWidth+gap))));
  const rows=Math.max(1,Math.min(3,Math.floor((height+gap)/(cardWidth*ratio+label+gap))));
  return {cardWidth,columns,rows,capacity:columns*rows};
}

export function arrangeCardGroups(groups,capacity) {
  const manual=groups.filter(g=>g.manual).length,available=Math.max(1,capacity-manual);
  const count=groups.reduce((n,g)=>n+(g.manual?0:g.cards.length),0),chunk=count>available?Math.ceil(count/available):1;
  return groups.flatMap(group=>{
    if(group.manual)return [{...group,stacked:true}];
    const result=[];
    for(let i=0;i<group.cards.length;i+=chunk)result.push({...group,cards:group.cards.slice(i,i+chunk),stacked:chunk>1,showLabel:i===0});
    return result;
  });
}
