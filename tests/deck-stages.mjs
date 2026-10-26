/* A DECK'S STAGE AND BOX DECKS (Rob, 2026-10-23: the Decks requirements' §2, §6 and Q1, Q2, Q7; docs/card-states.md).
 *
 *   1. The stage, at its edges: 99 seats is Building and 100 is Defined, locked or not (Q7); the commander counts as a
 *      seat; Boxed is Defined with Final + Substitute = 100, and a Boxed deck is Defined too.
 *   2. Substitute · Loading (Q1): a Bench copy chosen to stand in for a Reserved seat -- not free, not in the box, not
 *      counted toward the hundred until boxed; one per seat; cleared with its command or with its deck.
 *   3. Rob's worked example: 100 seats, 65 owned (10 of them stand-ins) and 35 to buy, 5 of those sitting in another
 *      deck's box. Box choice 1 boxes 55, choice 2 65, choice 3 70; the deck stays Defined throughout; the donor loses
 *      the 5, its seats go back to Reserved · To buy and it drops from Boxed to Defined (Q2). One batch, one undo.
 *   4. Two selected decks never box one copy twice, and a choice that adds nothing has nothing to do.
 *   5. Deck sets and favorites: sets are short names on the deck; deleting a deck drops it from favorites.
 */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),M=require('../collection-model.js');
let checks=0;const eq=(a,b,m)=>{checks++;assert.deepEqual(a,b,m);},ok=(c,m)=>{checks++;assert.ok(c,m);},refuses=(f,re)=>{checks++;assert.throws(f,re);};
let serial=0;const run=(s,c)=>M.apply(s,{id:'op'+(++serial),at:'2026-10-23T12:00:00.000Z',...c}).state;
const card=n=>({id:'card:'+n,name:n,verified:true,commander:true,legalities:{commander:'legal'},colorIdentity:[],typeLine:'Legendary Creature'});
const names=(p,n)=>Array.from({length:n},(_,i)=>`${p}${i+1}`);
const make=(s,id,list,extra={})=>run(s,{type:'createDeck',deckId:id,name:id,commanders:['card:'+list[0]],cards:list.map(card),slots:list.map(n=>({cardId:'card:'+n,quantity:1})),...extra});
const own=(s,list)=>run(s,{type:'importLots',batchId:'b'+(++serial),cards:list.map(card),lots:list.map(n=>({cardId:'card:'+n,quantity:1,source:'owned'}))});
const st=(s,id)=>M.deckStatus(s,M.deck(s,id));
const lotOf=(s,n)=>s.lots.find(l=>l.cardId==='card:'+n);
const slotOf=(s,id,n)=>M.deck(s,id).slots.find(r=>r.cardId==='card:'+n);

/* 1. The stage. */
{let s=M.empty();s=make(s,'d99',names('C',99));s=make(s,'d100',names('C',100));
  eq([st(s,'d99').onList,st(s,'d99').stage,st(s,'d99').boxed],[99,'building',false],'99 seats is Building');
  eq([st(s,'d100').onList,st(s,'d100').stage,st(s,'d100').boxed],[100,'defined',false],'100 seats is Defined, as a draft: Lock list is not needed (Q7)');
  /* A commander kept out of the main list is still one of the hundred (the seats Play reads). */
  s=run(s,{type:'createDeck',deckId:'lead',name:'lead',commanders:['card:Lead'],cards:[card('Lead'),...names('C',99).map(card)],slots:names('C',99).map(n=>({cardId:'card:'+n,quantity:1}))});
  eq([st(s,'lead').onList,st(s,'lead').stage],[100,'defined'],'the commander is a seat even when not in the main list');
  /* Boxed: 99 Final and 1 Substitute, all owned and in the box. */
  let b=own(s,names('C',99));b=run(b,{type:'finalize',deckId:'d100'});b=run(b,{type:'bulk',op:'place',deckId:'d100',confirmed:true,lotIds:b.lots.filter(l=>l.allocation?.deckId==='d100').map(l=>l.id)});
  eq([st(b,'d100').final,st(b,'d100').deckTotal,st(b,'d100').boxed],[99,99,false],'99 in the box is not Boxed');
  b=own(b,['Spare']);b=run(b,{type:'place',lotId:lotOf(b,'Spare').id,deckId:'d100',asStandIn:true,standInFor:slotOf(b,'d100','C100').id});
  eq([st(b,'d100').substitute,st(b,'d100').deckTotal,st(b,'d100').stage,st(b,'d100').boxed],[1,100,'defined',true],'99 Final and a Substitute: Boxed, and still Defined');
  eq(M.formatOf(M.deck(b,'d100')).size,100,'every deck reads as Commander, of 100');
}

/* 2 and 3. Rob's worked example. D1: A1..A55 owned and its own (Loading), B1..B10 to buy with stand-ins S1..S10 chosen,
   X1..X5 its own copies sitting in D2's box, T1..T30 to buy. D2: F1..F95 in its box, and X1..X5 standing in there for
   Y1..Y5, which it has to buy -- so D2 is Boxed. */
const example=()=>{let s=M.empty();
  s=make(s,'D1',[...names('A',55),...names('B',10),...names('X',5),...names('T',30)]);
  s=make(s,'D2',[...names('F',95),...names('Y',5)]);
  s=own(s,[...names('A',55),...names('X',5),...names('F',95),...names('S',10)]);
  s=run(s,{type:'finalize',deckId:'D1'});s=run(s,{type:'finalize',deckId:'D2'});
  s=run(s,{type:'bulk',op:'place',deckId:'D2',confirmed:true,lotIds:s.lots.filter(l=>l.allocation?.deckId==='D2').map(l=>l.id)});
  for(const [i,x] of names('X',5).entries())s=run(s,{type:'place',lotId:lotOf(s,x).id,deckId:'D2',asStandIn:true,standInFor:slotOf(s,'D2','Y'+(i+1)).id,confirmed:true});
  for(const [i,x] of names('S',10).entries())s=run(s,{type:'standIn',lotId:lotOf(s,x).id,deckId:'D1',slotId:slotOf(s,'D1','B'+(i+1)).id});
  return s;};
{const s=example(),d1=st(s,'D1'),d2=st(s,'D2');
  eq([d1.stage,d1.boxed,d1.loading,d1.substituteLoading,d1.reserved.from,d1.reserved.buy,d1.deckTotal],['defined',false,55,10,5,40,0],'D1: Defined, 55 Loading, 10 stand-ins waiting, 5 in D2, 40 to buy');
  eq([d2.stage,d2.boxed,d2.final,d2.substitute],['defined',true,95,5],'D2: Boxed, 95 Final and 5 Substitutes');
  /* Substitute · Loading: the copy's status, and what it is not. */
  const read=M.stateReader(s),sub=read({...lotOf(s,'S1'),kind:'lot'});
  eq([sub.use,sub.play,sub.inBox,sub.deckId,sub.holds],['substitute','loading',false,'D1','card:B1'],'a chosen stand-in is a Substitute · Loading');
  eq(M.stateNote(sub,x=>x.replace('card:','')),'Loading · stands in for B1');eq(M.placeLabel(sub),'Loading');
  ok(!M.seats(s).free.has('card:S1'),'a chosen stand-in is not a free copy');
  refuses(()=>run(s,{type:'standIn',lotId:lotOf(s,'S1').id,deckId:'D1',slotId:slotOf(s,'D1','B2').id}),/Choose an owned copy on the Bench/);
  let t=own(s,['Extra']);refuses(()=>run(t,{type:'standIn',lotId:lotOf(t,'Extra').id,deckId:'D1',slotId:slotOf(t,'D1','B1').id}),/B1's seat is already filled or held/);
  refuses(()=>run(t,{type:'standIn',lotId:lotOf(t,'Extra').id,deckId:'D1',slotId:slotOf(t,'D1','A1').id}),/A1's seat is already filled or held/);
  t=run(s,{type:'clearStandIn',lotId:lotOf(s,'S1').id});eq([st(t,'D1').substituteLoading,M.seats(t).free.has('card:S1')],[9,true],'cleared, it is a free Bench copy again');
  t=run(s,{type:'deleteDeck',deckId:'D1',confirmed:true});ok(!t.lots.some(l=>l.chosenFor),'deleting the deck clears its stand-ins');
  /* Ready to add's one tap: a single place puts a stand-in in, and it is a Substitute holding its seat from then on. */
  t=run(s,{type:'place',lotId:lotOf(s,'S1').id,deckId:'D1',asStandIn:true,standInFor:lotOf(s,'S1').chosenFor.slotId,confirmed:true});
  const s1=lotOf(t,'S1');eq([s1.chosenFor,s1.standInFor,s1.location.kind,st(t,'D1').substitute,st(t,'D1').substituteLoading],[undefined,slotOf(t,'D1','B1').id,'deck',1,9],'one place boxes a stand-in as the Substitute for its seat');
  /* The three choices (BOX-2, BOX-3). */
  const p=[1,2,3].map(c=>M.boxPlan(s,['D1'],c));
  eq(p.map(x=>x.total),[55,65,70],'choice 1 boxes 55, choice 2 65, choice 3 70');
  eq(p.map(x=>x.decks[0].inBoxAfter),[55,65,70],'and the box totals');
  eq(p.map(x=>100-x.decks[0].inBoxAfter),[45,35,30],'leaving 45, 35 and 30 seats with nothing in the box');
  eq(p.map(x=>x.decks[0].stageAfter),['Defined','Defined','Defined'],'D1 stays Defined throughout');
  eq([p[0].donors,p[1].donors.length],[[],0],'only choice 3 takes from another deck');
  eq(p[2].donors.map(x=>[x.deckId,x.cards.length,x.stageBefore,x.stageAfter]),[['D2',5,'Boxed','Defined']],'choice 3 names D2, its 5 cards and its drop to Defined (BOX-4)');
  eq(p[2].command.type,'batch','one batch, so one undo');
  for(const x of p[2].command.commands)ok(x.type==='bulk'&&x.op==='place','every move is a place, as Ready to add makes (BOX-5)');
  /* Applied. */
  const after=M.apply(s,{id:'box',at:'2026-10-23T13:00:00.000Z',...p[2].command}).state,a1=st(after,'D1'),a2=st(after,'D2');
  eq([a1.final,a1.substitute,a1.deckTotal,a1.loading,a1.substituteLoading,a1.reserved.buy,a1.stage,a1.boxed],[60,10,70,0,0,40,'defined',false],'D1 after: 70 in the box; 40 still to buy, 10 of them with a Substitute holding the seat; Defined');
  eq([a2.deckTotal,a2.boxed,a2.stage,a2.reserved.buy],[95,false,'defined',5],'D2 after: its 5 seats back to Reserved · To buy, Defined (Q2)');
  ok(!after.lots.some(l=>l.chosenFor),'the stand-ins are in the box now');
  ok(M.deck(after,'D1').status==='final'&&!after.lots.some(l=>l.source!=='owned'&&l.allocation),'nothing bought, ordered or locked by boxing (BOX-9)');
  eq(M.boxPlan(after,['D1'],3).total,0,'boxed, there is nothing left to box (BOX-6)');
}
/* 4. Two decks, one copy: never boxed twice. A copy stands in for one deck only, and a deck's own copy is its own, so
   the planner can only meet a copy twice if the same deck is asked twice; the order given decides. */
{const s=example(),p=M.boxPlan(s,['D1','D2','D1'],3);
  eq(p.total,70,'D1 asked twice still boxes 70');ok(p.waiting.length===70&&p.waiting.every(w=>w.keptBy==='D1'),'and the second ask is told it waits on the first');
  const ids=p.command.commands.flatMap(x=>x.lotIds);eq(new Set(ids).size,ids.length,'no copy is moved twice');
  eq(M.boxPlan(s,['D2'],3).total,0,'D2 has nothing to box');
}
/* 5. Sets and favorites. */
{let s=M.empty();s=make(s,'x',['One']);s=make(s,'y',['Two']);
  s=run(s,{type:'editDeck',deckId:'x',sets:['S0',' G1 ','S0','']});eq(M.deck(s,'x').sets,['S0','G1'],'sets are short names, trimmed, once each');
  refuses(()=>run(s,{type:'editDeck',deckId:'x',sets:Array.from({length:21},(_,i)=>'S'+i)}),/at most 20 sets/);
  const bad=M.clone(s);bad.decks[0].sets=['x'.repeat(41)];refuses(()=>M.validate(bad),/A deck set is a short name/);
  s=run(s,{type:'preferences',values:{favoriteDecks:['x','y','share:abc']}});s=run(s,{type:'deleteDeck',deckId:'x',confirmed:true});
  eq(s.preferences.favoriteDecks,['y','share:abc'],'a deleted deck drops out of favorites; a shared deck\'s stays');
  const badPref=M.clone(s);badPref.preferences.favoriteDecks=[1];refuses(()=>M.validate(badPref),/Invalid saved view preference/);
}
/* 6. The shell and Choose a commander first (the Decks requirements' SHL-2, FMT-1 to FMT-3, CRD-8). */
{let s=M.empty();s=run(s,{type:'createDeck',deckId:'shell',name:'New deck',commanders:[],slots:[]});
  const shell=M.deck(s,'shell');eq([shell.commanders,shell.slots,st(s,'shell').stage,M.formatOf(shell).id],[[],[],'building','commander'],'a shell is a valid deck: no commander, no cards, Building, Commander');
  s=own(s,['Lead','Other']);
  refuses(()=>run(s,{type:'target',deckId:'shell',cardId:'card:Other',quantity:1}),/Choose a commander first\.$/);
  refuses(()=>run(s,{type:'editDeck',deckId:'shell',slots:[{cardId:'card:Other',quantity:1}]}),/Choose a commander first\.$/);
  refuses(()=>run(s,{type:'assign',deckId:'shell',cardId:'card:Other',lotId:lotOf(s,'Other').id}),/Choose a commander first\.$/);
  refuses(()=>run(s,{type:'createDeck',name:'No lead',cards:[card('Third')],slots:[{cardId:'card:Third',quantity:1}]}),/Choose a commander first\.$/);
  refuses(()=>run(s,{type:'createDeck',name:'Odd',format:'modern'}),/Choose a format this app knows/);
  s=run(s,{type:'editDeck',deckId:'shell',commanders:['card:Lead'],slots:[{cardId:'card:Lead',quantity:1}]});
  eq(M.deck(s,'shell').slots.length,1,'the commander alone is accepted');
  s=run(s,{type:'target',deckId:'shell',cardId:'card:Other',quantity:1});eq(M.deck(s,'shell').slots.length,2,'and then other cards are');
  s=run(s,{type:'editDeck',deckId:'shell',slots:[{cardId:'card:Lead',quantity:1},{cardId:'card:Other',quantity:1,seat:{role:'ramp',label:'ramp, 1-3 mana',mv:[1,3]}}]});
  eq(M.deck(s,'shell').slots.find(r=>r.cardId==='card:Other').seat,{role:'ramp',label:'ramp, 1-3 mana',mv:[1,3]},'a seat keeps its slot definition');
}
/* The vocabulary About Deck Building reads. */
eq(M.STAGES.map(x=>x.label),['Building','Defined','Boxed','Playable']);
eq(M.LADDER.map(x=>x.label),['Watch','To buy','To Buy · Ordered','Own','Upgrade','Reserved','Loading','Substitute','Final']);
console.log(`deck-stages: ${checks} checks passed; Building at 99, Defined at 100, Boxed at a full box, and Rob's example boxing 55, 65 and 70.`);
