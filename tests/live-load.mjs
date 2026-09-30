/* Load Live rebuilds a library from a hand-written file, through the model. */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {buildFile,bundledLookup} from '../tools/build-live-state.mjs';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {importWorkbook,newestWorkbook,same} from '../tools/build-live-load.mjs';
import {basename} from 'node:path';
const require=createRequire(import.meta.url),M=require('../collection-model.js'),C=require('../card-catalog.js'),L=require('../tools/live-load.js'),E=require('../collection-exchange.js');
let checks=0;const ok=v=>{assert.ok(v);checks++;},eq=(a,b)=>{assert.equal(a,b);checks++;};

const card=(name,extra={})=>C.normalize({name,typeLine:'Creature',colorIdentity:['R'],legalities:{commander:'legal'},oracleText:'Haste.',...extra});
const leader=card('Test Leader',{typeLine:'Legendary Creature — Goblin',commander:true});
const filler=Array.from({length:40},(_,i)=>card('Filler '+i));
const mountain=card('Mountain',{typeLine:'Land',colorIdentity:['R'],oracleText:''});// as the universe file knows it: no "Basic"
const upgrade=card('Shiny Upgrade'),planned=card('Planned Piece'),extra=card('Ordered Extra');
const pool=new Map([leader,...filler,mountain,upgrade,planned,extra].map(c=>[L.fold(c.name),c]));
const lookup=name=>pool.get(L.fold(name))||null;
const doc=()=>({format:L.FORMAT,version:1,savedAt:'2026-09-10T00:00:00Z',
  decks:[{id:'D1',name:'Goblins',commander:'Test Leader',definition:{baseBracket:3,bracketCeiling:3},cards:[['Test Leader',1],...filler.map(c=>[c.name,1]),['Mountain',59]],
    options:[{card:'Filler 7',why:'Weakest card in the list'},'Mountain'],planned:[{card:'Planned Piece',why:'Comes in for a land'},{card:'Ordered Extra',why:'Already on its way'}]}],
  owned:{inDeck:{D1:[['Test Leader',1],['Filler 0',1],['Mountain',40],['Shiny Upgrade',1]]},bench:[['Filler 1',2],['Mountain',30]]},
  ordered:[['Filler 2',1],['Ordered Extra',1,'D1']],
  buy:filler.slice(3).map(c=>[c.name,1,0.75]),
  upgrades:[{deck:'D1',card:'Shiny Upgrade',replaces:'Filler 4',tier:1,price:9.5,why:'Because.'}]});

// The file's shape is checked before any card is looked up.
assert.throws(()=>L.check({...doc(),format:'other'}),/Expected format/);checks++;
{const bad=doc();bad.decks[0].cards[0]=['Test Leader',2];assert.throws(()=>L.check(bad),/exactly 100|appear once/);checks++;}
{const bad=doc();bad.owned.inDeck.D9=[];assert.throws(()=>L.check(bad),/unknown deck D9/);checks++;}
{const bad=doc();bad.owned.bench.push(['Filler 1',1.5]);assert.throws(()=>L.check(bad),/quantity/);checks++;}
{const bad=doc();bad.decks[0].options.push('Shiny Upgrade');assert.throws(()=>L.check(bad),/not in the deck's hundred/);checks++;}
{const bad=doc();bad.decks[0].planned.push('Filler 3');assert.throws(()=>L.check(bad),/already in the deck's hundred/);checks++;}
{const bad=doc();bad.ordered.push(['Filler 2',1,'D9']);assert.throws(()=>L.check(bad),/unknown deck D9/);checks++;}
eq(L.names(doc()).length,45);// leader, 40 filler, Mountain, Shiny Upgrade, the two planned cards, and nothing counted twice

// A name the catalog cannot answer is fatal: no partial libraries.
{const missing=doc();missing.owned.bench.push(['Nonexistent Card',1]);assert.throws(()=>L.build(missing,{Model:M,lookup}),/could not be resolved: Nonexistent Card/);checks++;}

const {state,issues,summary}=L.build(doc(),{Model:M,lookup});
const slotOfCard=(d,cardId)=>d.slots.find(r=>r.cardId===cardId&&r.purpose==='main').id;
M.validate(state);checks++;
eq(issues.length,0);
const d=state.decks[0];eq(d.status,'final');eq(d.commanders[0],leader.id);
// a basic the universe knows only as "Land" was completed so 59 copies are legal
ok(/Basic Land/.test(state.cards[mountain.id].typeLine));
// in-box copies are located in the deck and reserved to their own slot
const inBox=state.lots.filter(l=>l.location?.kind==='deck'&&l.allocation);eq(inBox.reduce((n,l)=>n+l.quantity,0),42);ok(inBox.every(l=>l.allocation?.deckId===d.id));
// the copy in the physical deck that is not in the target stays in the physical deck as a substitute, unreserved
const stray=state.lots.find(l=>l.cardId===upgrade.id);eq(stray.location.kind,'deck');eq(stray.location.deckId,d.id);ok(/Substitute in D1/.test(stray.notes));eq(stray.allocation,null);eq(M.readiness(state,d).standIns,1);eq(M.projection(state).find(x=>x.recordId===stray.id).placement,'Substitute');
// bench and ordered copies are reserved for the shortfall, owned first; the spare bench copy stays free
const r=M.readiness(state,d);eq(r.target,100);eq(r.owned,42+1+19);eq(r.ordered,1);eq(r.toBuy,100-62-1);
const filler1=state.lots.filter(l=>l.cardId===filler[1].id);eq(filler1.length,2);eq(filler1.filter(l=>l.allocation).length,1);eq(filler1.find(l=>!l.allocation).quantity,1);
eq(state.lots.filter(l=>l.cardId===mountain.id&&l.source==='owned').reduce((n,l)=>n+l.quantity,0),70);
ok(state.lots.find(l=>l.source==='ordered').allocation);
// an upgrade for a card on the list is attached to the slot it replaces, uncommitted; no Upgrade Path group is filed
ok(!state.groups.some(g=>g.id===L.GROUP_UPGRADES));
const option=d.slots.find(s=>s.purpose==='upgrade');eq(option.cardId,upgrade.id);eq(option.committed,false);eq(option.tier,1);eq(option.why,'Because.');eq(option.price,9.5);eq(d.slots.find(s=>s.id===option.replaces).cardId,filler[4].id);
// the deck owns a group with a fixed id, and the app's one-time repair is told it has run
const own=state.groups.find(g=>g.id==='group:live:D1');eq(own.name,'Goblins');eq(d.groupId,own.id);eq(state.preferences.deckGroups,true);
// the two working lists: options are flags on main slots, with the reason; planned cards are
// entries in the deck's group -- unless a free copy exists, which is filed there instead
const flagged=d.slots.filter(r=>r.option);eq(flagged.length,2);ok(flagged.some(r=>r.cardId===filler[7].id&&r.optionWhy==='Weakest card in the list'));ok(flagged.some(r=>r.cardId===mountain.id&&r.optionWhy===''));
eq(own.entries.length,1);eq(own.entries[0].cardId,planned.id);eq(own.entries[0].notes,'Comes in for a land');
const filedExtra=state.lots.find(l=>l.cardId===extra.id);eq(filedExtra.source,'ordered');ok(filedExtra.groupIds.includes(own.id));eq(filedExtra.allocation,null);
eq(summary.options,2);eq(summary.planned,2);
// the shopping list: what the decks need is already To buy, as their needs, so none of it is filed twice;
// a list that says less is reported, and copies beyond the needs (a card no deck calls for) go on the To Buy list
const toBuy=state.groups.find(g=>g.id==='group:to-buy');eq(toBuy.entries.length,0);eq(summary.toBuyEntries,0);
ok(summary.toBuy===37);
{const short=doc();short.buy=[['Filler 3',1]];const out=L.build(short,{Model:M,lookup});ok(out.issues.some(x=>/still need/.test(x)));checks++;}
{const more=doc();more.buy.push(['Planned Piece',2,4],['Filler 5',1,0.75]);const out=L.build(more,{Model:M,lookup});
 eq(out.issues.length,0);
 const list=out.state.groups.find(g=>g.id==='group:to-buy').entries;
 eq(list.length,2);ok(list.some(r=>r.cardId===planned.id&&r.quantity===2&&r.notes==='$4.00 each'));ok(list.some(r=>r.cardId===filler[5].id&&r.quantity===1));
 const read=M.stateReader(out.state);ok(list.every(r=>{const st=read({...r,kind:'entry',groupId:'group:to-buy'});return st.stage==='buy'&&!st.deckId;}));}
/* WHICH SEAT A SUBSTITUTE HOLDS (Rob, 2026-09-26). An upgrade whose card is on the list and whose replaced card
   is a substitute in the box is that seat's need; the substitute's copy records the seat, one copy per upgrade,
   and a lot of two is split so each names its own. A replaced card not in the box is reported. */
{const seated=doc();seated.owned.inDeck.D1=seated.owned.inDeck.D1.map(([n,q])=>n==='Shiny Upgrade'?[n,2]:[n,q]);
 seated.upgrades.push({deck:'D1',card:'Filler 5',replaces:'Shiny Upgrade',tier:2,price:1,why:''},{deck:'D1',card:'Filler 6',replaces:'Shiny Upgrade',tier:2,price:1,why:''});
 const out=L.build(seated,{Model:M,lookup}),dk=out.state.decks[0];
 eq(out.issues.length,0);eq(out.summary.seatsRecorded,2);
 const subs=out.state.lots.filter(l=>l.cardId===upgrade.id);eq(subs.length,2);ok(subs.every(l=>l.quantity===1&&l.location.deckId===dk.id&&!l.allocation));
 eq(new Set(subs.map(l=>dk.slots.find(r=>r.id===l.standInFor)?.cardId)).size,2);ok(subs.some(l=>dk.slots.find(r=>r.id===l.standInFor).cardId===filler[5].id));
 ok(subs.every(l=>/holds the seat of Filler [56]/.test(l.notes)));
 M.validate(out.state);checks++;
 const rows=M.projection(out.state).filter(r=>r.cardId===upgrade.id);ok(rows.every(r=>r.standInFor));
 const ctx=M.seats(out.state).decks.get(dk.id);ok(ctx.held.has(slotOfCard(dk,filler[5].id))&&ctx.held.has(slotOfCard(dk,filler[6].id)));
 const bad=doc();bad.upgrades.push({deck:'D1',card:'Filler 5',replaces:'Ordered Extra'});ok(L.build(bad,{Model:M,lookup}).issues.some(x=>/Filler 5 \(D1\): "Ordered Extra" is in neither/.test(x)));checks++;}
eq(summary.readiness[0].deck,'Goblins');

/* WHAT WAS PAID IS NOT WHAT THE CARD COSTS. doc.paid carries the workbook's $ Each for the
   rows Trey owns -- the price he paid per copy -- and a market price is always the catalog's.
   So it must land on OWNED copies and nowhere else: an ordered copy has not been paid for,
   and a card with no figure gets none rather than $0, because missing data is not a free
   card. Before this was wired the builder stamped every lot `paid: null` and the workbook's
   figure was thrown away at import. */
{
  const d=doc();
  d.paid={'Test Leader':3.5,'Filler 0':0.25,'Filler 1':1.75,'Filler 2':9.99,'Mountain':0.1};
  const lots=L.build(d,{Model:M,lookup}).state.lots;
  const ownedFor=id=>lots.filter(l=>l.cardId===id&&l.source==='owned');
  ok(ownedFor(leader.id).length&&ownedFor(leader.id).every(l=>l.paid===3.5));
  ok(ownedFor(mountain.id).length&&ownedFor(mountain.id).every(l=>l.paid===0.1));
  ok(lots.filter(l=>Number.isFinite(l.paid)).every(l=>l.paidSource==='typed'&&l.paidAt));
  /* Filler 2 is ORDERED, and it is in doc.paid on purpose: being listed is not enough. */
  ok(lots.filter(l=>l.cardId===filler[2].id).every(l=>l.source!=='owned'&&l.paid===null));
  ok(lots.every(l=>l.source==='owned'||l.paid===null));
  /* Shiny Upgrade is owned but absent from doc.paid: no figure, not zero. */
  ok(ownedFor(upgrade.id).length&&ownedFor(upgrade.id).every(l=>l.paid===null));
}

// The committed file: every name resolves offline, every deck finalizes, the buy list
// agrees with the shortfalls the model derives. This is the check that guards a commit.
const real=await buildFile();
/* THE DECK COUNT COMES FROM THE FILE, NOT FROM A LITERAL. The workbook defines how many
   decks there are -- master_target's D<n>-T columns -- so a seventh is a workbook edit.
   What matters here is that every deck the file describes finalizes. */
const liveDoc=JSON.parse(await readFile(new URL('../data/live-load.json',import.meta.url),'utf8'));
eq(real.state.decks.length,liveDoc.decks.length);ok(real.state.decks.length>=6);
ok(real.state.decks.every(d=>d.status==='final'));
/* The six live decks name their mechanics now (filled from the catalog's reading, editable by
   hand in live-load.json), and the reading of D3's list says what its name says. */
ok(real.state.decks.every(d=>d.definition.mechanics.length>=2));
{const d3=real.state.decks.find(d=>/^D3/.test(d.name)),main=d3.slots.filter(r=>r.purpose==='main').map(r=>real.cardOf(r.cardId));ok(C.deckMechanics(main,real.cardOf(d3.commanders[0])).some(m=>/Proliferate|Counters/.test(m)));}
eq(real.issues.length,0);
/* The committed file carries what was paid too, on owned copies only. */
{const realPaid=real.state.lots.filter(l=>Number.isFinite(l.paid));
 ok(realPaid.length>500);
 ok(realPaid.every(l=>l.source==='owned'&&l.paidSource==='typed'));}
/* THE UPGRADE COUNT COMES FROM THE FILE. It was pinned at 71 when the workbook carried an
   Upgrade Path sheet of 67 rows plus four owned-swaps; the star schema's master_buy_upgrade
   names one row per temporary slot instead, so the number moves with the workbook. What is
   worth asserting is that every upgrade the file lists survived the build. */
ok(real.summary.owned>700&&real.summary.toBuy>0);
eq(real.summary.upgrades,liveDoc.upgrades.length);ok(real.summary.upgrades>0);
/* Every upgrade in the committed file is a seat a substitute holds (step 3b): each is recorded on its substitute,
   nothing is filed in an Upgrade Path group, and the To Buy list holds only what no deck needs -- none of it today. */
eq(real.summary.seatsRecorded,liveDoc.upgrades.length);
ok(!real.state.groups.some(g=>g.id===L.GROUP_UPGRADES));
eq(real.summary.toBuyEntries,0);
{const sat=M.projection(real.state).filter(r=>r.kind==='lot'&&r.standInFor);eq(sat.length,liveDoc.upgrades.length);
 for(const u of liveDoc.upgrades){const d=real.state.decks.find(d=>d.id==='deck:live:'+u.deck),r=d.slots.find(r=>r.id===sat.find(x=>x.location.deckId===d.id&&real.state.cards[x.cardId].name===u.replaces&&real.state.cards[x.standInForCardId]?.name===u.card)?.standInFor);
   ok(r&&r.committed,`${u.deck}: ${u.replaces} holds ${u.card}'s seat`);}}
/* AN UPGRADE COSTS WHAT THE CATALOG SAYS, LIKE THE BUY LIST. master_buy_upgrade carries a
   Price column, and on the short-term rows it is a round figure typed when the list was
   drafted -- Guardian Project at $3.50 against a catalog price of $15.05. The rule is one
   number per kind: Scryfall for what a card costs, the workbook's $ Each for what was paid.
   So every upgrade the file lists is priced as the catalog prices it wherever the catalog
   has a figure, and the workbook's number stands in only where it has none. */
/* Checked on a fresh build from the workbook, below, not on the committed file: the committed file's prices are the
   market's on the day it was built, and a price moving since is not a failure (Rob, 2026-09-28). */
ok(real.summary.options>=1&&real.summary.planned>=1);ok(real.state.decks.every(d=>d.groupId&&real.state.groups.some(g=>g.id===d.groupId)));
M.validate(real.state);checks++;
// and the committed saved state is that build, in the app's own backup format: it restores
// through the same checksum and schema checks a hand-picked backup file gets, and it has
// not drifted from the source file it was built from.
const saved=await E.readBackup(await readFile(new URL('../data/live-state.json',import.meta.url),'utf8'));
M.validate(saved.state);checks++;
eq(M.fingerprint(saved.state.decks[0]),M.fingerprint(real.state.decks[0]));
/* THE SEGMENTS ON THE LIVE FILE. These were pinned to Master v13's exact figures (72 in the
   box, 8 to pull, 4 ordered, 16 to buy); the workbook moves every one of them, so what is
   asserted here is the arithmetic that has to hold whatever the workbook says: the hundred
   is fully accounted for, the copies in the box plus the ones to pull cannot exceed it, and
   a deck that is short of cards costs something to finish. */
{const d3=saved.state.decks.find(d=>/^D3/.test(d.name)),r=M.readiness(saved.state,d3);
 ok(r.inBox>0&&r.inBox<=100,`D3 has ${r.inBox} of its hundred in the box`);
 ok(r.inBox+r.pullFromBench+r.pullFromOtherBox<=100,'a deck cannot need more copies than its hundred');
 ok(r.ordered>=0&&r.toBuy>=0&&r.standIns>=0&&r.remove>=0,'no segment is negative');
 ok(r.sleeved>=r.inBox,'everything reserved is at least what the box holds');
 ok(r.toBuy===0||r.costToFinish>0,'a deck with cards left to buy costs something to finish');}
assert.deepEqual(M.counters(saved.state),M.counters(real.state));checks++;
assert.deepEqual(saved.state.lots.map(l=>[l.cardId,l.quantity,l.source,l.allocation?.slotId||'',l.location?.kind||'']),real.state.lots.map(l=>[l.cardId,l.quantity,l.source,l.allocation?.slotId||'',l.location?.kind||'']));checks++;
eq(L.PASSWORD,'treycmload1');
/* v25: THE STAR TABLES FOLDED BACK INTO ONE WIDE SHEET (Rob, 2026-09-25). Trey's v25 has no
   master_main, master_target, master_actuals or master_decks: its Master sheet opens on "Card ID" and
   carries every column they did. The builder reads it through the same star path, and what it builds
   has to agree with the workbook's own totals row -- the Own, In Deck, In Bench, Buy Count and Ordered
   sums Excel computed, not this code. Needs openpyxl, like tests/generators.mjs's workbook check. */
{
  let python=true;try{execFileSync('python3',['-c','import openpyxl'],{stdio:'ignore'});}catch{python=false;}
  if(!python)console.log('live-load: the v25 and 2026-09-30 workbook checks are SKIPPED (no openpyxl)');
  else for(const book of ['data/source/Treys_MtG_Master_-_v25.xlsx','data/source/MtG_-_Master_-_2026-09-30.xlsx']){
    const rows=JSON.parse(execFileSync('python3',['tools/read-sheet-rows.py',book,'Master'],{encoding:'utf8',maxBuffer:1<<28}));
    const h=rows.findIndex(r=>r[0]==='Card ID'),H=rows[h],sums=rows[h-1],total=name=>Number(sums[H.indexOf(name)]);
    const {doc,built}=await importWorkbook(book,{prior:JSON.parse(await readFile(new URL('../data/live-load.json',import.meta.url),'utf8'))});
    const n=list=>list.reduce((a,r)=>a+r[1],0),boxes=Object.values(doc.owned.inDeck).reduce((a,l)=>a+n(l),0);
    eq(doc.decks.length,H.filter(x=>/^D\d+-T$/.test(String(x))).length);
    eq(doc.decks.map(d=>d.id).join(),'D1,D2,D3,D4,D5,D6,D7');
    eq(boxes,total('In Deck'));
    eq(n(doc.owned.bench),total('In Bench'));
    eq(boxes+n(doc.owned.bench),total('Own'));
    eq(n(doc.buy),total('Buy Count'));
    {const lookup=await bundledLookup();let priced=0;
     for(const u of doc.upgrades){const c=lookup(u.card),p=Number(c&&c.price);if(!(Number.isFinite(p)&&p>0))continue;priced++;
       ok(Math.abs(u.price-p)<0.005,`${u.deck} upgrade ${u.card} is priced ${u.price} by the build and ${p} by the catalog`);}
     ok(priced>=doc.upgrades.length*0.8,`only ${priced} of ${doc.upgrades.length} upgrades have a catalog price`);checks++;}
    eq(n(doc.ordered),total('Ordered'));
    eq(M.counters(built.state).owned,total('Own'));
    ok(doc.decks.every(d=>n(d.cards)===100));
  }
  /* 2026-09-30: THE MASTER SHEET ALONE (Rob's "MtG - Master - 9.30"). It has no deck_strategies and no
     master_buy_upgrade: each deck's id, commander, name and overview are carried from the committed file -- which
     v25's deck_strategies wrote (Rob: use v25's sheet if needed) -- and the upgrade pairings are the sheet's own
     Dn-Buy columns: a row's Dn-Buy names the id of the card the row's copy stands in for in deck n. */
  if(python){
    const book='data/source/MtG_-_Master_-_2026-09-30.xlsx',prior=JSON.parse(await readFile(new URL('../data/live-load.json',import.meta.url),'utf8'));
    eq(basename(await newestWorkbook()),basename(book));
    eq(liveDoc.workbook,basename(book));
    const {doc,notes}=await importWorkbook(book,{prior});
    for(const d of doc.decks){const p=prior.decks.find(x=>x.id===d.id);
      eq(d.commander,p.commander);eq(d.name,p.name);assert.deepEqual(d.strategy,p.strategy);checks++;}
    eq(doc.decks.find(d=>d.id==='D1').strategy.strategy.split('.')[0],'Lorehold spirit recursion');
    const master=JSON.parse(execFileSync('python3',['tools/read-sheet-rows.py',book,'Master'],{encoding:'utf8',maxBuffer:1<<28}));
    const mh=master.findIndex(r=>r[0]==='Card ID'),MH=master[mh],buyCells=master.slice(mh+1).flatMap(r=>MH.map((x,i)=>/^D\d+-Buy$/.test(String(x))&&r[i]!==null&&String(r[i]).trim()&&String(r[i]).trim()!=='0'?1:0)).reduce((a,b)=>a+b,0);
    eq(doc.upgrades.length,buyCells);ok(buyCells>100);
    ok(notes.some(x=>new RegExp(`^${buyCells} upgrade pairings read from the Master sheet's D1-Buy…D7-Buy columns`).test(x)));
    /* Rob's example: Negate holds Mystic Snake's seat in D2 (D2-Buy = c0967). */
    ok(doc.upgrades.some(u=>u.deck==='D2'&&u.card==='Mystic Snake'&&u.replaces==='Negate'));
    /* Each pairing is what Rob says it is: the card is in the deck's target, and the copy standing in is in its box. */
    {const count=(rows,name)=>(rows.find(r=>r[0]===name)||[,0])[1];
     ok(doc.upgrades.every(u=>count(doc.decks.find(d=>d.id===u.deck).cards,u.card)>0&&count(doc.owned.inDeck[u.deck],u.replaces)>0));}
    /* What was paid is history: the 9.30 Master's $ Each is the price to buy, so the committed figures for cards still
       owned are kept -- every one of them, and never a figure for a card no longer owned. */
    {const ownedNow=new Set([...Object.values(doc.owned.inDeck).flat(),...doc.owned.bench].map(r=>r[0]));
     const keep=Object.keys(prior.paid).filter(n=>ownedNow.has(n));
     ok(keep.length>700&&keep.every(n=>doc.paid[n]===prior.paid[n]));
     ok(Object.keys(doc.paid).every(n=>ownedNow.has(n)));}
  }
}
/* A PRICE MOVING IS NOT A CHANGE (Rob, 2026-09-28). --check compares the collection, not the market: a buy row's
   price or an upgrade's price may move and the file is still current; a count, a card, a paid figure may not. */
{const base={savedAt:'a',decks:[],owned:{inDeck:{},bench:[['Sol Ring',1]]},ordered:[],buy:[['Arcane Signet',2,1.25]],paid:{'Sol Ring':1.5},upgrades:[{deck:'D1',card:'Ring',price:3}]};
  const moved={...base,savedAt:'b',buy:[['Arcane Signet',2,1.9]],upgrades:[{deck:'D1',card:'Ring',price:4.2}]};
  ok(same(base,moved));
  ok(!same(base,{...moved,buy:[['Arcane Signet',3,1.9]]}));
  ok(!same(base,{...moved,paid:{'Sol Ring':2}}));
  ok(!same(base,{...moved,upgrades:[{deck:'D1',card:'Other',price:4.2}]}));
  ok(!same(base,{...moved,owned:{inDeck:{},bench:[['Sol Ring',2]]}}));}
/* W1: A CARD'S PRINTS. Each owned copy wears its print, the dearest in the deck box and the cheaper on the bench (Rob,
   2026-09-30); copies no print accounts for stay without one; a print carries its market value. */
{const d=doc();d.owned.bench.push(['Filler 0',1]);
  d.prints={'Filler 0':[{series:'Cheap Set',collector:'12',quantity:1,foil:false,artist:'An Artist',value:0.5},{series:'Dear Set',collector:'7',quantity:1,foil:true,artist:'An Artist',value:9}],
    'Mountain':[{series:'Old Set',collector:'250',quantity:2,foil:false,artist:'Another',value:0.2}]};
  const s2=L.build(d,{Model:M,lookup}).state,lotsOf=n=>s2.lots.filter(l=>s2.cards[l.cardId].name===n);
  const f0=lotsOf('Filler 0'),box=f0.find(l=>l.location.kind==='deck'),bench=f0.find(l=>l.location.kind==='bench');
  ok(box.printing.series==='Dear Set'&&box.printing.finish==='foil'&&box.value===9&&bench.printing.series==='Cheap Set'&&bench.value===0.5);// the dearest print is the deck's
  const mtn=lotsOf('Mountain'),printed=mtn.filter(l=>l.printing.series).reduce((n,l)=>n+l.quantity,0),blank=mtn.filter(l=>!l.printing.series).reduce((n,l)=>n+l.quantity,0);
  ok(printed===2&&blank===68&&mtn.filter(l=>l.printing.series).every(l=>l.location.kind==='deck'&&l.value===0.2));// two recorded, the rest left without a print
  eq(mtn.reduce((n,l)=>n+l.quantity,0),70);// splitting by print loses no copy
  ok(!('value' in lotsOf('Filler 1')[0])&&!('series' in lotsOf('Filler 1')[0].printing));// a card with no prints is as it was
  M.validate(s2);checks++;}
{const bad=doc();bad.prints={'Filler 0':[{series:'X',quantity:0}]};assert.throws(()=>L.check(bad),/invalid print/);checks++;}
{const bad=doc();bad.prints={'Filler 0':[{series:'X',quantity:1,value:-2}]};assert.throws(()=>L.check(bad),/invalid print/);checks++;}
/* The committed library, from MtG - Master - 9.30: both print groups read, and placed by Rob's rules. */
{const live=JSON.parse(await readFile(new URL('../data/live-load.json',import.meta.url),'utf8'));
  const owned=new Map();for(const rows of Object.values(live.owned.inDeck))for(const [n,q] of rows)owned.set(n,(owned.get(n)||0)+q);for(const [n,q] of live.owned.bench)owned.set(n,(owned.get(n)||0)+q);
  const prints=Object.entries(live.prints||{});
  ok(prints.length>=900&&prints.filter(([,l])=>l.length===2).length>=13);// every owned card's prints; thirteen with two
  ok(prints.filter(([,l])=>l.length===1).every(([n,l])=>l[0].quantity===owned.get(n)));// one print on a row: every copy is that print (Evolving Wilds: 5, its Quantity cell 1)
  eq(live.prints['Evolving Wilds'][0].quantity,5);
  const gift=live.prints['Generous Gift'].map(p=>p.value).sort((a,b)=>a-b).join(',');eq(gift,'0.72,5.24');
  const st=M.migrate(JSON.parse(await readFile(new URL('../data/live-state.json',import.meta.url),'utf8')).payload.state),lotsOf=n=>st.lots.filter(l=>st.cards[l.cardId].name===n);
  const giftBox=lotsOf('Generous Gift').find(l=>l.location.kind==='deck'),wayBox=lotsOf('Weathered Wayfarer').find(l=>l.location.kind==='deck');
  ok(giftBox.value===5.24&&giftBox.printing.series==='Secret Lair Drop'&&giftBox.printing.finish==='foil'&&lotsOf('Generous Gift').find(l=>l.location.kind==='bench').value===0.72);// the $5.24 foil is in D1's box
  ok(wayBox.value===17.39&&wayBox.location.deckId==='deck:live:D5');// the $17.39 Onslaught print is D5's
  const plains=lotsOf('Plains'),withPrint=plains.filter(l=>l.printing.series||l.printing.artist).reduce((n,l)=>n+l.quantity,0);
  ok(withPrint===2&&plains.reduce((n,l)=>n+l.quantity,0)===96);// two Plains recorded, ninety-four left blank
}
console.log(`live-load: ${checks} checks passed; the hand-written file rebuilds a validated library, and the committed file loads clean.`);
