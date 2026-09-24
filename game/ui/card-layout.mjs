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

/* THE ORDER A ZONE'S GROUPS ARE LAID OUT IN. The battlefield puts creatures first -- its rule 2,
   below -- then mana rocks, artifacts, enchantments, other tokens and the rest; a group the
   player made goes with its creatures if it has any. Lands put basics first in W U B R G order, then
   the rest as they arrived. Within a rank, the order the engine lists them. */
const GROUP_RANK={Creatures:0,'Mana dorks':1,Tokens:2,'Mana rocks':10,Artifacts:11,Enchantments:12,'Other tokens':13,Other:14};
const BASIC_ORDER=['Plains','Island','Swamp','Mountain','Forest','Wastes'];
export function orderGroups(zoneName,groups){
  const creature=g=>g.cards.some(c=>/Creature/.test((c.typeLine||'').split('\u2014')[0]));
  const rank=zoneName==='Lands'
    ?g=>{if(!g.basic)return 100;const at=BASIC_ORDER.findIndex(b=>g.label.includes(b));return at<0?50:at;}
    :g=>g.manual?(creature(g)?5:15):(GROUP_RANK[g.label]??14);
  return groups.map((g,i)=>({g,i})).sort((a,b)=>rank(a.g)-rank(b.g)||a.i-b.i).map(x=>x.g);
}

/* THE BATTLEFIELD'S RULES, WHEN IT HAS ROOM FOR TWO ROWS.
 *
 * Rob, 2026-09-24, after a first version that kept creatures and the rest in separate rows and so
 * left cells empty: "The creature cards should be on the first row, only going to the second row once
 * the first row is full in the visible pane. You have empty spots next to the Goblin token stack on
 * row 1 (above row 2 cards). Think through how the mechanics of the battleground should be designed
 * to support the flexibility. And perhaps articulate to me the rules that govern that space."
 *
 *   1. READING ORDER. Row 1 fills left to right across the visible width, then row 2 left to right.
 *      No cell stays empty while a card further along the order has a place, and nothing goes past
 *      the visible right edge while a visible cell is free.
 *   2. CREATURES FIRST. The caller orders the groups -- creatures, mana creatures, creature tokens,
 *      then mana rocks, artifacts, enchantments, other tokens, the rest -- so creatures take the first
 *      cells and everything else the cells after them.
 *   3. A CELL HOLDS ONE CARD. A stack is taller than a row, so it takes its whole column; a single
 *      card leaves the cell beneath it for the next card in the order.
 *   4. STACK ONLY AS DEEP AS YOU MUST. Every card stands alone if the visible cells can hold them;
 *      otherwise groups stack, evenly, only as deep as it takes to fit. A group that reaches the
 *      second row stands its cards up one per cell there, because a second-row cell holds one card.
 *   5. SCROLL ONLY WHEN THE CARDS DO NOT FIT. Past the deepest stacks the zone allows, the grid
 *      continues beyond the right edge a column at a time -- a stack takes one, single cards pair up
 *      top and bottom -- and the zone scrolls sideways.
 *
 * A second-row card's group label sits over the foot of the card above it (online.css, .lane-second):
 * at the commander's size two cards and two labels were about ten pixels taller than the battlefield.
 *
 * Returns null when the zone is too short for a second row -- the four-up's small boards -- and the
 * caller keeps planZone's one row, in the same creatures-first order. */
export function planTwoRows({width,height,cardWidth,groups,scrollbar=0}) {
  if(!groups.length)return null;
  const w=Math.max(12,cardWidth),card=w*CARD_RATIO,strip=w*FAN_STRIP,h=height-scrollbar;
  const slot=GROUP_LABEL+card;
  if(slot+GRID_GAP+card>h)return null;
  const deepest=Math.max(1,Math.floor((h-slot)/strip)+1);
  const visible=Math.max(1,Math.floor((width+GRID_GAP)/(w+GRID_GAP)));
  let best=null;
  for(let chunk=1;chunk<=deepest;chunk+=1){
    const layout=flowTwoRows(splitGroups(groups,chunk),visible);
    if(!layout.overflow){best=layout;break;}
    if(!best||layout.columns<best.columns||(layout.columns===best.columns&&layout.groups.length<best.groups.length))best=layout;
  }
  return {...best,cardWidth:w,slot,twoRows:true,available:visible,scroll:best.columns>visible};
}
function flowTwoRows(pieces,visible){
  const groups=[],below=[],rest=[];
  const isStack=p=>p.manual||p.cards.length>1;
  let i=0,column=0;
  /* Rule 1: row 1, across the visible width. A stack claims the cell below it too (rule 3). */
  for(;i<pieces.length&&column<visible;i+=1,column+=1){
    const p=pieces[i];
    groups.push({...p,gridColumn:column+1,gridRow:isStack(p)?'1 / span 2':'1'});
    below[column]=!isStack(p);
  }
  /* Row 2: one card per free cell, left to right, in the same order (rule 4). */
  let cell=0;
  for(;i<pieces.length;i+=1){
    const p=pieces[i];
    if(p.manual){rest.push(p);continue;}
    const loose=[];
    p.cards.forEach((card,k)=>{
      while(cell<column&&!below[cell])cell+=1;
      if(cell<column){groups.push({...p,cards:[card],stacked:false,showLabel:k===0&&p.showLabel!==false,gridColumn:cell+1,gridRow:'2'});below[cell]=false;cell+=1;}
      else loose.push(card);
    });
    if(loose.length)rest.push({...p,cards:loose,showLabel:loose.length===p.cards.length&&p.showLabel!==false});
  }
  /* Rule 5: past the edge, a column at a time. */
  let open=false;
  for(const p of rest){
    if(isStack(p)){if(open){column+=1;open=false;}groups.push({...p,gridColumn:column+1,gridRow:'1 / span 2'});column+=1;}
    else if(!open){groups.push({...p,gridColumn:column+1,gridRow:'1'});open=true;}
    else{groups.push({...p,gridColumn:column+1,gridRow:'2'});open=false;column+=1;}
  }
  if(open)column+=1;
  return {groups,columns:Math.max(1,column),overflow:rest.length};
}

/* LANDS: ONE ROW, AND BASICS IN PILES. Rob, 2026-09-24: "can we stack basic mana cards in the Land
 * section, then when 1 is tapped that single card in the stack tilts slightly". The caller makes one
 * group per basic land name and one per other land. A pile overlaps sideways -- a slice of every card
 * shows, so each is still its own card to click and a tapped one tilts where it lies, without moving
 * the others -- and is PILE_SLICE of a card wider per card after the first. The lands zone is one card
 * tall, so a row is all it holds; past its width it scrolls. */
export const PILE_SLICE=.22;
export function planLandRow({width,cardWidth,groups}) {
  const w=Math.max(12,cardWidth);
  const total=groups.reduce((n,g)=>n+w+(g.cards.length-1)*w*PILE_SLICE,0)+GRID_GAP*Math.max(0,groups.length-1);
  return {groups:groups.map(g=>({...g,stacked:false,pile:g.cards.length>1})),columns:groups.length,rows:1,capacity:groups.length,maxStack:1,
    singleRow:true,cardWidth:w,scroll:total>width};
}
