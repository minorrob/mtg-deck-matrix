/* ONE CARD SIZE ON THE MAT, ALWAYS. Rob, 2026-09-24: "Every card on the play mat should be exactly
   the same size, always. The size of the commander card ... is correct proportions to mat size."
   So the width is not chosen here. It is the commander's -- the card that fits the Command frame,
   measured in review.mjs (alignToPiles) -- and this only works out how a zone of a given size holds
   cards of that width.

   A fanned group shows one whole card and, above it, the name strip of each card beneath it, 0.24 of
   a card's width tall (online.css, .card-fan). So how deep a fan can go before it would cross the
   zone's bottom edge is known from the zone's height alone. */
export const CARD_RATIO=680/488,FAN_STRIP=.24,GRID_GAP=5,GROUP_LABEL=16;

export function cardGridMetrics({width,height,cardWidth,lands=false}) {
  const w=Math.max(12,cardWidth),label=lands?0:GROUP_LABEL,card=w*CARD_RATIO;
  const columns=Math.max(1,Math.floor((width+GRID_GAP)/(w+GRID_GAP)));
  const rows=Math.max(1,Math.floor((height+GRID_GAP)/(card+label+GRID_GAP)));
  const maxStack=Math.max(1,Math.floor((height-label-card)/(w*FAN_STRIP))+1);
  return {cardWidth:w,columns,rows,capacity:columns*rows,maxStack};
}

/* HOW A ZONE LAYS OUT ITS GROUPS, AND NOTHING EVER GOES BELOW ITS BOTTOM EDGE.
 *
 * Rob, 2026-09-24, of a second row drawn outside the battlefield: "those in a second+ row pushed
 * below the battlefield bottom boundary should rearrange into a single row with the side-to-side
 * scroll bar".
 *
 * If every card fits the rows the zone holds, every card stands on its own and they wrap. Otherwise
 * it is ONE row: groups fan only as deep as the height allows, and whatever is past the zone's right
 * edge is reached by scrolling sideways. The scroll bar lives in the zone's bottom padding
 * (review.mjs), so the row gives up height to it only where the bar is thicker than the padding. */
export function planZone({width,height,cardWidth,lands=false,groups,scrollbar=0}) {
  const grid=cardGridMetrics({width,height,cardWidth,lands});
  const items=groups.reduce((n,g)=>n+(g.manual?1:g.cards.length),0);
  if(items<=grid.capacity)return {...grid,singleRow:false,groups:arrangeCardGroups(groups,grid.capacity)};
  /* `scrollbar` is whatever part of the bar the bottom padding cannot hold -- none on a Focus-sized
     board, a few pixels on the four-up's small ones -- and the row gives up that much height. */
  const row=cardGridMetrics({width,height:height-scrollbar,cardWidth,lands});
  return {...row,rows:1,capacity:row.columns,singleRow:true,groups:arrangeCardGroups(groups,row.columns,row.maxStack)};
}

export function arrangeCardGroups(groups,capacity,maxStack=Infinity) {
  const manual=groups.filter(g=>g.manual).length,available=Math.max(1,capacity-manual);
  const automatic=groups.filter(g=>!g.manual&&g.cards.length);
  const count=automatic.reduce((n,g)=>n+g.cards.length,0);
  const items=chunk=>automatic.reduce((n,g)=>n+Math.ceil(g.cards.length/chunk),0);
  /* Each group rounds up on its own, so a depth worked out from the total can still leave more items
     than there is room for: 14 cards in six groups at five columns came out as eight, and the ones
     past the fifth wrapped onto a row below the battlefield. So go deeper until they fit -- but never
     deeper than a fan the zone can hold, and never past the point where each group is already one
     fan, because deeper than that only hides cards without saving any room. */
  const cap=Math.max(1,Math.floor(maxStack));
  let chunk=Math.min(cap,count>available?Math.ceil(count/available):1);
  while(chunk<cap&&items(chunk)>available&&items(chunk)>automatic.length)chunk++;
  return splitGroups(groups,chunk);
}

/* A group too big for one fan splits EVENLY -- five cards at a depth of four are three and two, never
   four and a stray one -- because a lone card beside a stack reads as a different group. */
function splitGroups(groups,chunk){
  return groups.flatMap(group=>{
    if(group.manual)return [{...group,stacked:true}];
    const pieces=Math.ceil(group.cards.length/chunk),result=[];
    for(let i=0,at=0;i<pieces;i+=1){
      const size=Math.ceil((group.cards.length-at)/(pieces-i));
      result.push({...group,cards:group.cards.slice(at,at+size),stacked:chunk>1,showLabel:i===0});
      at+=size;
    }
    return result;
  });
}

/* TWO LANES ON THE BATTLEFIELD: creatures along the first row, everything else along the second.
 *
 * Rob, 2026-09-24: "Is it possible to set board cards that are supposed to be in row 2 of the
 * battlefield skipping columns where row 1 pushes down over row 2 (e.g. Goblin Tokens stack in this
 * screenshot), but putting cards in the second row where a card space is available (e.g. Skirk
 * Prospector, below that card, then the next below Sol Ring (though sol ring would go to second row as
 * it's not a creature)?"
 *
 * So a first-row fan deeper than one card reaches into the second row and takes its column; a single
 * card leaves the slot under it free, and the second row fills those slots left to right before it
 * opens columns of its own past the end of the first. Depth is the shallowest that fits the width, as
 * everywhere else; past the deepest the zone allows, the lanes scroll sideways.
 *
 * A SECOND-ROW LABEL SITS OVER THE FOOT OF THE CARD ABOVE IT (online.css, .lane-second). At the
 * commander's size two cards and two labels were about ten pixels taller than the battlefield, so the
 * second row's label gives up its own line and overlaps the artist credit of the card above instead,
 * clear of that card's power and toughness on the right.
 *
 * Returns null when there is no second row to lay out -- one lane is empty, or the zone is too short
 * for two rows -- and the caller keeps planZone's one-lane layout. */
export function planLanes({width,height,cardWidth,top,bottom,scrollbar=0}) {
  if(!top.length||!bottom.length)return null;
  const w=Math.max(12,cardWidth),card=w*CARD_RATIO,strip=w*FAN_STRIP,h=height-scrollbar;
  const slot=GROUP_LABEL+card,second=slot+GRID_GAP;
  const deepestTop=Math.max(1,Math.floor((h-slot)/strip)+1);
  const deepestBottom=Math.floor((h-second-card)/strip)+1;
  if(deepestBottom<1)return null;
  const columns=Math.max(1,Math.floor((width+GRID_GAP)/(w+GRID_GAP)));
  let best=null;
  for(let chunk=1;chunk<=deepestTop;chunk+=1){
    const layout=placeLanes(splitGroups(top,chunk),splitGroups(bottom,Math.min(chunk,deepestBottom)));
    if(!best||layout.columns<best.columns)best=layout;
    if(layout.columns<=columns){best=layout;break;}
  }
  return {...best,cardWidth:w,slot,lanes:true,available:columns,scroll:best.columns>columns};
}
function placeLanes(tops,bottoms){
  const free=tops.map(t=>t.cards.length===1&&!t.manual);
  const groups=tops.map((t,i)=>({...t,gridColumn:i+1,gridRow:free[i]?'1':'1 / span 2'}));
  let column=0;
  for(const b of bottoms){
    while(column<free.length&&!free[column])column+=1;
    if(column===free.length)free.push(true);
    groups.push({...b,gridColumn:column+1,gridRow:'2'});
    free[column]=false;column+=1;
  }
  return {groups,columns:Math.max(free.length,1)};
}
