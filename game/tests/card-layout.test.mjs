import test from 'node:test';
import assert from 'node:assert/strict';
import {cardGridMetrics,arrangeCardGroups,planZone,planLanes,CARD_RATIO,FAN_STRIP,GROUP_LABEL} from '../ui/card-layout.mjs';

/* A fan's height: one whole card, a name strip for each card above it, and the group's label. */
const fanHeight=(cards,w,label=GROUP_LABEL)=>label+w*CARD_RATIO+(cards-1)*w*FAN_STRIP;
const group=(label,n,from=0)=>({label,cards:Array.from({length:n},(_,i)=>({cardId:from+i}))});

/* Rob's board of 2026-09-24, measured in Focus at 1920x1080: the commander's 188px card in a
   battlefield whose inside (after the 10pt padding) is 1007 x 534. Fourteen cards in six groups. */
const ROB={width:1007,height:534,cardWidth:188};
const robGroups=()=>[group('Creatures',4,0),group('Mana dorks',1,10),group('Tokens',5,20),group('Mana rocks',1,30),group('Artifacts',1,40),group('Enchantments',2,50)];

test('the card width is the one it is given, at every zone size',()=>{
  for(const cardWidth of [34,96,188]){
    const m=cardGridMetrics({width:1000,height:500,cardWidth});
    assert.equal(m.cardWidth,cardWidth,'the zone never picks its own card size');
  }
});

test('the deepest fan fits the zone and one card deeper would not',()=>{
  for(const [height,cardWidth] of [[534,188],[155,58],[300,120]]){
    const m=cardGridMetrics({width:1000,height,cardWidth});
    assert.ok(fanHeight(m.maxStack,cardWidth)<=height+.01,`a fan of ${m.maxStack} fits ${height}px`);
    if(m.maxStack>1||fanHeight(1,cardWidth)<=height)assert.ok(fanHeight(m.maxStack+1,cardWidth)>height,`a fan of ${m.maxStack+1} would cross the edge`);
  }
});

test("Rob's board: one row, nothing below the battlefield, the rest a sideways scroll",()=>{
  const plan=planZone({...ROB,groups:robGroups()});
  assert.equal(plan.singleRow,true,'fourteen cards do not fit the one row of five the zone holds');
  assert.equal(plan.rows,1);
  assert.deepEqual(plan.groups.flatMap(g=>g.cards).map(c=>c.cardId).sort((a,b)=>a-b),robGroups().flatMap(g=>g.cards).map(c=>c.cardId),'every card is still drawn, once');
  for(const g of plan.groups)assert.ok(fanHeight(g.cards.length,ROB.cardWidth)<=ROB.height+.01,`${g.label} (${g.cards.length} deep) fits the battlefield's height`);
  assert.equal(plan.groups.length,6,'each group one fan: deeper cannot save any more room');
  assert.ok(plan.groups.length>plan.columns,'six fans in five columns is what the scroll bar is for');
});

test('a board that fits keeps every card on its own, wrapped inside the rows the zone holds',()=>{
  const plan=planZone({width:1007,height:700,cardWidth:188,groups:[group('Creatures',3),group('Artifacts',4,10)]});
  assert.equal(plan.singleRow,false);
  assert.ok(plan.groups.every(g=>g.cards.length===1&&!g.stacked),'no stacking when there is room');
  assert.ok(plan.groups.length<=plan.capacity,'and never more cards than the rows hold');
});

test('stacking goes only as deep as it must, and never deeper than the zone allows',()=>{
  /* THE BUG THIS REPLACES: the depth was worked out from the total, and each group rounded up on its
     own, so fourteen cards in six groups at five columns came out as eight items and three of them
     wrapped onto a row below the battlefield. */
  const five=arrangeCardGroups(robGroups(),5);
  assert.ok(five.length<=6,`came out as ${five.length} items; the groups alone are six`);
  const seven=arrangeCardGroups(robGroups(),7);
  assert.ok(seven.length<=7,`came out as ${seven.length} items in room for seven`);
  const shallow=arrangeCardGroups(robGroups(),5,2);
  assert.ok(shallow.every(g=>g.cards.length<=2),'a zone that holds a fan of two gets fans of two');
});

test('space controls automatic stacking without losing identities or manual groups',()=>{
  const cards=Array.from({length:18},(_,cardId)=>({cardId}));
  const groups=[{label:'Creatures',cards:cards.slice(0,10)},{label:'Artifacts',cards:cards.slice(10)}];
  const compact=arrangeCardGroups(groups,18);assert.equal(compact.length,18);assert.ok(compact.every(g=>!g.stacked));
  const crowded=arrangeCardGroups(groups,3);assert.deepEqual(crowded.flatMap(g=>g.cards),cards);assert.ok(crowded.some(g=>g.stacked));
  assert.ok(crowded.length<=3,'the crowded arrangement fits the room it was given');
  assert.equal(arrangeCardGroups([{manual:true,cards}],18).length,1);
  assert.equal(arrangeCardGroups([{manual:true,cards},{cards:[{cardId:20},{cardId:21}]}],3).length,3);
});

test('no arrangement ever puts a fan deeper than the zone can hold',()=>{
  let seed=7;const next=()=>(seed=(seed*1103515245+12345)%2147483648)/2147483648;
  for(let run=0;run<200;run++){
    const groups=Array.from({length:1+Math.floor(next()*7)},(_,i)=>group('g'+i,1+Math.floor(next()*12),i*100));
    const width=300+next()*1200,height=150+next()*500,cardWidth=40+next()*160;
    const plan=planZone({width,height,cardWidth,groups});
    const depth=Math.max(...plan.groups.map(g=>g.cards.length));
    if(plan.singleRow)assert.ok(depth<=plan.maxStack,`run ${run}: a fan of ${depth} in a zone that holds ${plan.maxStack}`);
    else assert.ok(plan.groups.length<=plan.capacity&&depth===1,`run ${run}: the wrapped layout must fit and stand every card alone`);
  }
});

test('a scrolling row gives the scroll bar the height the padding cannot hold',()=>{
  /* Narrow enough that the fans are as deep as the height allows, so the reserve is what decides. */
  const groups=[group('Creatures',30),group('Tokens',30,100)];
  for(const scrollbar of [0,7,12]){
    const plan=planZone({width:80,height:120,cardWidth:32,groups,scrollbar});
    assert.equal(plan.singleRow,true);
    const depth=Math.max(...plan.groups.map(g=>g.cards.length));
    assert.ok(fanHeight(depth,32)+scrollbar<=120+.01,`a fan of ${depth} plus a ${scrollbar}px bar fits 120px`);
  }
});

/* TWO LANES (planLanes). Rob, 2026-09-24: row-2 cards skip the columns a deep row-1 stack reaches down
   into, and take the slot under a single card. His board, at the default Focus pane: 159.2px cards in a
   battlefield 880 x 470 inside its padding. */
const lanesBoard=()=>({top:[group('Creatures',4,0),group('Mana dorks',1,10),group('Tokens',5,20)],
  bottom:[group('Mana rocks',1,30),group('Artifacts',1,40),group('Enchantments',2,50)]});
test("Rob's board in two lanes: Sol Ring under Skirk Prospector, nothing under the token stack",()=>{
  const {top,bottom}=lanesBoard(),plan=planLanes({width:880,height:470,cardWidth:159.2,top,bottom});
  assert.ok(plan,'two rows fit once the second row\'s label overlaps the card above');
  const at=label=>plan.groups.filter(g=>g.label===label);
  assert.deepEqual(at('Mana dorks').map(g=>[g.gridColumn,g.gridRow]),[[2,'1']],'Skirk Prospector is a single card in row 1');
  assert.deepEqual(at('Mana rocks').map(g=>[g.gridColumn,g.gridRow]),[[2,'2']],'so Sol Ring takes the slot under it');
  assert.equal(at('Tokens').length,1,'all five tokens stay one stack');
  assert.equal(at('Tokens')[0].gridRow,'1 / span 2','and the stack reaches into row 2, taking its column');
  assert.deepEqual(at('Artifacts').map(g=>[g.gridColumn,g.gridRow]),[[4,'2']],'the next second-row card goes past the token column');
});
test('no column holds a deep first-row stack and a second-row card, and every second-row card fits',()=>{
  let seed=11;const next=()=>(seed=(seed*1103515245+12345)%2147483648)/2147483648;
  for(let run=0;run<200;run++){
    const make=(n,from)=>Array.from({length:n},(_,i)=>group('g'+from+i,1+Math.floor(next()*7),(from+i)*100));
    const cardWidth=60+next()*140,height=cardWidth*CARD_RATIO*2+GROUP_LABEL+40+next()*200,width=300+next()*1200;
    const plan=planLanes({width,height,cardWidth,top:make(1+Math.floor(next()*4),0),bottom:make(1+Math.floor(next()*4),10)});
    if(!plan)continue;
    const spanning=new Set(plan.groups.filter(g=>g.gridRow==='1 / span 2').map(g=>g.gridColumn));
    for(const g of plan.groups.filter(g=>g.gridRow==='2')){
      assert.ok(!spanning.has(g.gridColumn),`run ${run}: a second-row card under a stack that reaches into row 2`);
      const second=GROUP_LABEL+cardWidth*CARD_RATIO+5;
      assert.ok(second+cardWidth*CARD_RATIO+(g.cards.length-1)*cardWidth*FAN_STRIP<=height+.01,`run ${run}: a second-row fan of ${g.cards.length} crosses the bottom`);
    }
  }
});
test('two lanes only when there are two kinds of card and room for two rows',()=>{
  const {top,bottom}=lanesBoard();
  assert.equal(planLanes({width:880,height:470,cardWidth:159.2,top,bottom:[]}),null,'creatures alone keep the one-lane layout');
  assert.equal(planLanes({width:880,height:470,cardWidth:159.2,top:[],bottom}),null,'and so does everything else alone');
  assert.equal(planLanes({width:880,height:300,cardWidth:159.2,top,bottom}),null,'a zone shorter than two cards has no second row');
});
test('a group that has to split, splits evenly',()=>{
  const parts=arrangeCardGroups([group('Tokens',5)],1,4).map(g=>g.cards.length);
  assert.deepEqual(parts,[3,2],'five at a depth of four is three and two, not four and a stray one');
});
