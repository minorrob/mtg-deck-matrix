import test from 'node:test';
import assert from 'node:assert/strict';
import {cardGridMetrics,arrangeCardGroups,planZone,planTwoRows,planLandRow,orderGroups,PILE_SLICE,CARD_RATIO,FAN_STRIP,GROUP_LABEL} from '../ui/card-layout.mjs';

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

/* THE BATTLEFIELD'S RULES (planTwoRows, orderGroups). Rob, 2026-09-24: "The creature cards should be
   on the first row, only going to the second row once the first row is full in the visible pane." His
   board at the default Focus pane: 159.2px cards in a battlefield 880 x 470 inside its padding. */
const typed=(label,n,from,type)=>({label,cards:Array.from({length:n},(_,i)=>({cardId:from+i,typeLine:type}))});
const robGroupsTyped=()=>[typed('Creatures',4,0,'Creature \u2014 Goblin'),typed('Mana dorks',1,10,'Creature \u2014 Goblin'),
  typed('Tokens',5,20,'Token Creature \u2014 Goblin'),typed('Mana rocks',1,30,'Artifact'),typed('Artifacts',1,40,'Artifact'),
  typed('Enchantments',2,50,'Enchantment')];
test("Rob's board: row 1 full across the pane, then row 2 in the cells under single cards",()=>{
  const plan=planTwoRows({width:880,height:470,cardWidth:159.2,groups:robGroupsTyped()});
  const cell=g=>[g.label,g.gridColumn,g.gridRow,g.cards.length];
  assert.deepEqual(plan.groups.filter(g=>g.gridRow!=='2').map(cell),
    [['Creatures',1,'1 / span 2',4],['Mana dorks',2,'1',1],['Tokens',3,'1 / span 2',5],['Mana rocks',4,'1',1],['Artifacts',5,'1',1]],
    'no empty cell in row 1: after the creatures come Sol Ring and Thornbite Staff, and the stacks take their columns');
  assert.deepEqual(plan.groups.filter(g=>g.gridRow==='2').map(cell),[['Enchantments',2,'2',1],['Enchantments',4,'2',1]],
    'the enchantments stand one per cell, under Skirk Prospector and under Sol Ring');
  assert.equal(plan.scroll,false,'and all of it fits the visible pane');
});
test('reading order holds for any board: row 1 before row 2, one card per cell, every card once',()=>{
  let seed=23;const next=()=>(seed=(seed*1103515245+12345)%2147483648)/2147483648;
  for(let run=0;run<300;run++){
    const groups=Array.from({length:1+Math.floor(next()*6)},(_,i)=>group('g'+i,1+Math.floor(next()*6),i*100));
    const cardWidth=60+next()*140,height=cardWidth*CARD_RATIO*2+GROUP_LABEL+10+next()*260,width=200+next()*1300;
    const plan=planTwoRows({width,height,cardWidth,groups});
    if(!plan)continue;
    const ids=plan.groups.flatMap(g=>g.cards.map(c=>c.cardId)).sort((a,b)=>a-b);
    assert.deepEqual(ids,groups.flatMap(g=>g.cards.map(c=>c.cardId)).sort((a,b)=>a-b),`run ${run}: every card exactly once`);
    const taken=new Set();
    for(const g of plan.groups){
      const rows=g.gridRow==='1 / span 2'?['1','2']:[g.gridRow];
      if(g.gridRow==='2')assert.equal(g.cards.length,1,`run ${run}: a second-row cell holds one card`);
      if(g.cards.length>1)assert.equal(g.gridRow,'1 / span 2',`run ${run}: a stack takes its whole column`);
      for(const r of rows){const key=g.gridColumn+':'+r;assert.ok(!taken.has(key),`run ${run}: two things in cell ${key}`);taken.add(key);}
    }
    const visibleSecond=plan.groups.some(g=>g.gridRow==='2'&&g.gridColumn<=plan.available);
    if(visibleSecond)for(let c=1;c<=plan.available;c++)assert.ok(taken.has(c+':1'),`run ${run}: row 2 used while row 1 cell ${c} is empty`);
    const order=[...plan.groups].sort((a,b)=>{const ov=x=>x.gridColumn>plan.available?1:0;const row=x=>x.gridRow==='2'?2:1;
      return ov(a)-ov(b)||(ov(a)?a.gridColumn-b.gridColumn||row(a)-row(b):row(a)-row(b)||a.gridColumn-b.gridColumn);});
    assert.deepEqual(order.flatMap(g=>g.cards.map(c=>c.cardId)),groups.flatMap(g=>g.cards.map(c=>c.cardId)),`run ${run}: cards appear in reading order`);
  }
});
test('creatures come first, whatever order the engine lists them in',()=>{
  const shuffled=[typed('Enchantments',1,1,'Enchantment'),typed('Tokens',2,2,'Token Creature \u2014 Goblin'),typed('Artifacts',1,4,'Artifact'),
    typed('Creatures',1,5,'Creature \u2014 Elf'),typed('Mana rocks',1,6,'Artifact'),typed('Mana dorks',1,7,'Creature \u2014 Elf')];
  assert.deepEqual(orderGroups('Battlefield',shuffled).map(g=>g.label),['Creatures','Mana dorks','Tokens','Mana rocks','Artifacts','Enchantments']);
  const lands=[{label:'Lands',cards:[{cardId:1}]},{label:'Mountain',basic:true,cards:[{cardId:2}]},{label:'Forest',basic:true,cards:[{cardId:3}]},{label:'Plains',basic:true,cards:[{cardId:4}]}];
  assert.deepEqual(orderGroups('Lands',lands).map(g=>g.label),['Plains','Mountain','Forest','Lands'],'basics first, in W U B R G order');
});
test('a battlefield too short for two rows keeps one',()=>{
  assert.equal(planTwoRows({width:880,height:300,cardWidth:159.2,groups:robGroupsTyped()}),null);
});
test('lands: a basic of one name is one pile, a slice of each card showing, and the row scrolls when it must',()=>{
  const mountains={label:'Mountain',basic:true,cards:[1,2,3,4,5].map(cardId=>({cardId}))},forge={label:'Lands',cards:[{cardId:6}]};
  const plan=planLandRow({width:880,cardWidth:159.2,groups:[mountains,forge]});
  assert.deepEqual(plan.groups.map(g=>[g.label,g.pile]),[['Mountain',true],['Lands',false]],'five Mountains, one pile');
  assert.equal(plan.scroll,false,'a pile of five is about two cards wide, so the row fits');
  assert.equal(planLandRow({width:300,cardWidth:159.2,groups:[mountains,forge]}).scroll,true,'and a row too wide for the zone scrolls');
  assert.ok(PILE_SLICE>0&&PILE_SLICE<.5,'a slice, not a card');
});
test('a group that has to split, splits evenly',()=>{
  const parts=arrangeCardGroups([group('Tokens',5)],1,4).map(g=>g.cards.length);
  assert.deepEqual(parts,[3,2],'five at a depth of four is three and two, not four and a stray one');
});
