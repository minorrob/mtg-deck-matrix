/* Load Live rebuilds a library from a hand-written file, through the model. */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {buildFile} from '../tools/build-live-state.mjs';
import {readFile} from 'node:fs/promises';
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
M.validate(state);checks++;
eq(issues.length,0);
const d=state.decks[0];eq(d.status,'final');eq(d.commanders[0],leader.id);
// a basic the universe knows only as "Land" was completed so 59 copies are legal
ok(/Basic Land/.test(state.cards[mountain.id].typeLine));
// in-box copies are located in the deck and reserved to their own slot
const inBox=state.lots.filter(l=>l.location?.kind==='deck');eq(inBox.reduce((n,l)=>n+l.quantity,0),42);ok(inBox.every(l=>l.allocation?.deckId===d.id));
// the copy in the box that is not in the target goes to the bench with a note
const stray=state.lots.find(l=>l.cardId===upgrade.id);eq(stray.location.kind,'bench');ok(/move it to the bench/.test(stray.notes));eq(stray.allocation,null);
// bench and ordered copies are reserved for the shortfall, owned first; the spare bench copy stays free
const r=M.readiness(state,d);eq(r.target,100);eq(r.owned,42+1+19);eq(r.ordered,1);eq(r.toBuy,100-62-1);
const filler1=state.lots.filter(l=>l.cardId===filler[1].id);eq(filler1.length,2);eq(filler1.filter(l=>l.allocation).length,1);eq(filler1.find(l=>!l.allocation).quantity,1);
eq(state.lots.filter(l=>l.cardId===mountain.id&&l.source==='owned').reduce((n,l)=>n+l.quantity,0),70);
ok(state.lots.find(l=>l.source==='ordered').allocation);
// the upgrade is filed in its group AND attached to the slot it replaces, uncommitted
const g=state.groups.find(g=>g.id===L.GROUP_UPGRADES);eq(g.name,'Upgrade Path');eq(g.entries.length,1);ok(/replaces Filler 4 · tier 1 · \$9.50 · Because\./.test(g.entries[0].notes));
const option=d.slots.find(s=>s.purpose==='upgrade');eq(option.cardId,upgrade.id);eq(option.committed,false);eq(option.tier,1);eq(option.why,'Because.');eq(option.price,9.5);eq(d.slots.find(s=>s.id===option.replaces).cardId,filler[4].id);
// the deck owns a group with a fixed id, and the app's one-time repair is told it has run
const own=state.groups.find(g=>g.id==='group:live:D1');eq(own.name,'Goblins');eq(d.groupId,own.id);eq(state.preferences.deckGroups,true);
// the two working lists: options are flags on main slots, with the reason; planned cards are
// entries in the deck's group -- unless a free copy exists, which is filed there instead
const flagged=d.slots.filter(r=>r.option);eq(flagged.length,2);ok(flagged.some(r=>r.cardId===filler[7].id&&r.optionWhy==='Weakest card in the list'));ok(flagged.some(r=>r.cardId===mountain.id&&r.optionWhy===''));
eq(own.entries.length,1);eq(own.entries[0].cardId,planned.id);eq(own.entries[0].notes,'Comes in for a land');
const filedExtra=state.lots.find(l=>l.cardId===extra.id);eq(filedExtra.source,'ordered');ok(filedExtra.groupIds.includes(own.id));eq(filedExtra.allocation,null);
eq(summary.options,2);eq(summary.planned,2);
// the shopping list lands in To Buy with its price, and disagrees with the model out loud
const toBuy=state.groups.find(g=>g.id==='group:to-buy');eq(toBuy.entries.length,37);eq(toBuy.entries[0].notes,'$0.75 each');
ok(summary.toBuy===37);
{const short=doc();short.buy=[['Filler 3',1]];const out=L.build(short,{Model:M,lookup});ok(out.issues.some(x=>/still need/.test(x)));checks++;}
eq(summary.readiness[0].deck,'Goblins');

// The committed file: every name resolves offline, every deck finalizes, the buy list
// agrees with the shortfalls the model derives. This is the check that guards a commit.
const real=await buildFile();
eq(real.state.decks.length,6);ok(real.state.decks.every(d=>d.status==='final'));
/* The six live decks name their mechanics now (filled from the catalog's reading, editable by
   hand in live-load.json), and the reading of D3's list says what its name says. */
ok(real.state.decks.every(d=>d.definition.mechanics.length>=2));
{const d3=real.state.decks.find(d=>/^D3/.test(d.name)),main=d3.slots.filter(r=>r.purpose==='main').map(r=>real.state.cards[r.cardId]);ok(C.deckMechanics(main,real.state.cards[d3.commanders[0]]).some(m=>/Proliferate|Counters/.test(m)));}
eq(real.issues.length,0);
ok(real.summary.owned>700&&real.summary.toBuy>0&&real.summary.upgrades===67);
ok(real.summary.options>=1&&real.summary.planned>=1);ok(real.state.decks.every(d=>d.groupId&&real.state.groups.some(g=>g.id===d.groupId)));
M.validate(real.state);checks++;
// and the committed saved state is that build, in the app's own backup format: it restores
// through the same checksum and schema checks a hand-picked backup file gets, and it has
// not drifted from the source file it was built from.
const saved=await E.readBackup(await readFile(new URL('../data/live-state.json',import.meta.url),'utf8'));
M.validate(saved.state);checks++;
eq(M.fingerprint(saved.state.decks[0]),M.fingerprint(real.state.decks[0]));
// The segments on the live file (Master v13): D3 owns 80, 72 of them in its box, so 8 are to pull; 0 in the box are no longer on the list.
{const d3=saved.state.decks.find(d=>/^D3/.test(d.name)),r=M.readiness(saved.state,d3);eq(r.inBox,72);eq(r.pullFromBench+r.pullFromOtherBox,8);eq(r.ordered,4);eq(r.toBuy,16);eq(r.remove,0);ok(r.costToFinish>0);}
assert.deepEqual(M.counters(saved.state),M.counters(real.state));checks++;
assert.deepEqual(saved.state.lots.map(l=>[l.cardId,l.quantity,l.source,l.allocation?.slotId||'',l.location?.kind||'']),real.state.lots.map(l=>[l.cardId,l.quantity,l.source,l.allocation?.slotId||'',l.location?.kind||'']));checks++;
eq(L.PASSWORD,'treycmload1');
console.log(`live-load: ${checks} checks passed; the hand-written file rebuilds a validated library, and the committed file loads clean.`);
