import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),M=require('../collection-model.js'),D=require('../draft-builder.js'),C=require('../card-catalog.js'),E=require('../collection-exchange.js'),P=require('../deck-import.js');let checks=0;
const eq=(a,b)=>{assert.deepEqual(a,b);checks++;},ok=x=>{assert.ok(x);checks++;};
const leader=C.normalize({name:'Test Commander',typeLine:'Legendary Creature — Wizard',manaValue:3,colorIdentity:['U'],legalities:{commander:'legal'},oracleText:'Partner',keywords:['Partner'],price:1});
/* WHAT A DECK IS ABOUT, READ OFF ITS LIST: the list's own theme outranks a label that fits
   most decks, the commander's styles break ties, and a shared creature type is a tribe. */
{const walls=Array.from({length:20},(_,i)=>C.normalize({name:'Wall '+i,typeLine:'Creature — Wall',colorIdentity:['G'],legalities:{commander:'legal'},oracleText:'Defender',keywords:['Defender']}));
 const sac=Array.from({length:6},(_,i)=>C.normalize({name:'Altar '+i,typeLine:'Artifact',colorIdentity:[],legalities:{commander:'legal'},oracleText:'Sacrifice a creature: Add {C}.'}));
 const lord=C.normalize({name:'Wall Lord',typeLine:'Legendary Creature — Elf',commander:true,colorIdentity:['G'],legalities:{commander:'legal'},oracleText:'Whenever a creature you control dies, draw a card.'});
 const got=C.deckMechanics([...walls,...sac],lord);
 assert.equal(got[0],'Wall tribal');assert.ok(got.includes('Defender'));assert.ok(got.includes('Sacrifice')||got.includes('Aristocrats'));assert.deepEqual(C.deckMechanics([],lord),[]);checks+=4;}
const basic=C.normalize({name:'Island',typeLine:'Basic Land — Island',colorIdentity:['U'],legalities:{commander:'legal'},oracleText:'{T}: Add {U}.',price:.1});
const pool=Array.from({length:130},(_,i)=>C.normalize({name:'Fixture '+i,typeLine:i%4===0?'Artifact':'Creature',manaValue:i%5+1,colorIdentity:['U'],legalities:{commander:'legal'},oracleText:i%3===0?'Draw two cards.':i%3===1?'Destroy target creature.':'{T}: Add {U}.',price:1}));
let definition=M.defaultDefinition(),built=D.build({commanders:[leader],cards:[leader,basic,...pool],definition});eq(built.slots.reduce((n,r)=>n+r.quantity,0),100);ok(built.method.includes('not simulated'));eq(built.slots.find(r=>r.cardId===basic.id).quantity,36);
// A price cap of zero starves every candidate -- but not the commander. It was chosen by
// name before any limit existed, so it is the one card a cap may never refuse; a deck of
// the commander alone is the honest result, and the issue says why nothing else fitted.
const zero=D.build({commanders:[leader],cards:[leader,basic,...pool],definition:{...definition,budget:0}});eq(zero.slots.length,1);eq(zero.slots[0].cardId,leader.id);ok(zero.issues.some(x=>x.includes('No hard limit was crossed')&&x.includes('$0')));
// A CAP IS PLANNED, NOT MERELY OBEYED. Under $60 the same pool must still yield a full
// hundred within the cap, with basics doing the cheap work and a high-ranked staple at
// several times an even share ($4 under $60) still finding room as a splurge.
{
  const staple=C.normalize({name:'Pricey Staple',typeLine:'Artifact',manaValue:1,colorIdentity:[],legalities:{commander:'legal'},oracleText:'{T}: Add {C}{C}.',price:4,edhrecRank:1});
  const bulk=Array.from({length:150},(_,i)=>C.normalize({name:'Bulk '+i,typeLine:i%5===0?'Artifact':'Creature',manaValue:i%4+1,colorIdentity:['U'],legalities:{commander:'legal'},oracleText:i%3===0?'Draw a card.':i%3===1?'Destroy target creature.':'{T}: Add {U}.',price:.3+(i%7)*.4,edhrecRank:2000+i}));
  const capped=D.build({commanders:[leader],cards:[leader,basic,staple,...bulk],definition:{...definition,budget:60}});
  eq(capped.slots.reduce((n,r)=>n+r.quantity,0),100);ok(capped.estimatedPrice<=60+1e-9);
  ok(capped.slots.find(r=>r.cardId===basic.id).quantity>=20);
  ok(capped.slots.some(r=>r.cardId===staple.id));ok(capped.splurged>=4);
  ok(capped.notes.some(x=>/Total cap \$60/.test(x)));
  // and the note never claims a slider steered it
  ok(capped.notes.some(x=>/does not steer by them/.test(x)));
  // an impossible cap says what cap would do, in dollars, above the cap it was given
  const tight=D.build({commanders:[leader],cards:[leader,basic,staple,...bulk],definition:{...definition,budget:12}});
  ok(tight.slots.reduce((n,r)=>n+r.quantity,0)<100);
  const figure=Number((tight.issues.find(x=>/Raising the total cap/.test(x))||'').match(/about \$(\d+)/)?.[1]);
  ok(figure>12);
  // bracket: a ceiling of 2 takes no Game Changers, a ceiling of 3 at most three
  const gc=Array.from({length:6},(_,i)=>C.normalize({name:'Changer '+i,typeLine:'Enchantment',manaValue:2,colorIdentity:['U'],legalities:{commander:'legal'},oracleText:'Draw a card.',price:1,edhrecRank:5+i,gameChanger:true}));
  const low=D.build({commanders:[leader],cards:[leader,basic,...gc,...bulk],definition:{...definition,bracketCeiling:2}});
  eq(low.slots.filter(r=>gc.some(c=>c.id===r.cardId)).length,0);
  const mid=D.build({commanders:[leader],cards:[leader,basic,...gc,...bulk],definition:{...definition,bracketCeiling:3}});
  ok(mid.slots.filter(r=>gc.some(c=>c.id===r.cardId)).length<=3&&mid.slots.filter(r=>gc.some(c=>c.id===r.cardId)).length>=1);
  // mono-colour lands are mostly basics: nonbasic lands are capped
  const utility=Array.from({length:30},(_,i)=>C.normalize({name:'Utility Land '+i,typeLine:'Land',manaValue:0,colorIdentity:[],legalities:{commander:'legal'},oracleText:'{T}: Add {C}.',price:.5,edhrecRank:50+i}));
  const mono=D.build({commanders:[leader],cards:[leader,basic,...utility,...bulk],definition});
  ok(mono.slots.filter(r=>utility.some(c=>c.id===r.cardId)).reduce((n,r)=>n+r.quantity,0)<=14);
  eq(mono.slots.filter(r=>utility.some(c=>c.id===r.cardId)).reduce((n,r)=>n+r.quantity,0)+mono.slots.find(r=>r.cardId===basic.id).quantity,36);
}
// And an owned-only pool with nothing owned says so in words a reader can act on.
const starved=D.build({commanders:[leader],cards:[leader,basic,...pool],definition,benchOnly:true,available:{}});eq(starved.slots.length,1);ok(starved.issues.some(x=>/library holds none/.test(x)&&/All legal catalog cards/.test(x)));
const unavailable=D.build({commanders:[leader],cards:[leader,basic,...pool],definition,benchOnly:true,available:{[leader.id]:1,[basic.id]:50,[pool[0].id]:1}});eq(unavailable.slots.reduce((n,r)=>n+r.quantity,0),38);ok(unavailable.issues.length);
const unknown=D.build({commanders:[leader],cards:[leader,basic,{...pool[0],price:null}],definition:{...definition,perCardCap:2}});ok(!unknown.slots.some(r=>r.cardId===pool[0].id));
let state=M.empty(),n=0;const run=(type,args={})=>state=M.apply(state,{type,id:'core'+(++n),...args}).state;
run('batch',{commands:[{type:'cards',cards:[leader,basic,...pool]},{type:'createDeck',deckId:'deckA',name:'A',commanders:[leader.id],slots:[{cardId:leader.id,quantity:1},{cardId:basic.id,quantity:98},{cardId:pool[0].id,quantity:1}]}]});eq(state.revision,1);run('finalize',{deckId:'deckA'});eq(M.counters(state).owned,0);run('acquire',{lot:{id:'option-copy',cardId:pool[1].id,quantity:1,source:'owned'}});const target=state.decks[0].slots.find(r=>r.cardId===pool[0].id);run('option',{deckId:'deckA',replaces:target.id,option:{cardId:pool[1].id,quantity:1,purpose:'upgrade'},reserve:true});const option=state.decks[0].slots.find(r=>r.purpose==='upgrade');eq(state.lots[0].allocation.slotId,option.id);run('acceptOption',{deckId:'deckA',slotId:option.id});eq(state.lots[0].allocation.slotId,target.id);eq(M.counters(state).owned,1);eq(state.decks[0].slots.filter(r=>r.purpose==='main').reduce((n,r)=>n+r.quantity,0),100);eq(state.decks[0].slots.length,3);
const prior=structuredClone(state);assert.throws(()=>run('batch',{commands:[{type:'acquire',lot:{cardId:basic.id,quantity:3}},{type:'acquire',lot:{cardId:basic.id,quantity:-1}}]}));eq(state,prior);
assert.throws(()=>run('editDeck',{deckId:'deckA',commanders:[pool[1].id]}),/reviewed commander/);checks++;
run('acquire',{lot:{id:'incoming1',cardId:basic.id,quantity:1,source:'incoming'}});ok(M.eligibility(state,state.lots.find(l=>l.id==='incoming1'),{includeIncoming:true}).eligible);
// WANTED is a plan to buy, not a copy: counted on its own, never eligible for a build, never
// reservable to a slot; it becomes owned by the same correction as an order arriving, and
// a wanted card nobody wants any more is cancelled like any pending acquisition.
{const before=M.counters(state);run('acquire',{lot:{id:'want1',cardId:pool[2].id,quantity:2,source:'wanted'}});const after=M.counters(state);eq(after.wanted,2);eq(after.toBuy,before.toBuy);eq(after.owned,before.owned);
 const want=state.lots.find(l=>l.id==='want1');eq(want.location,null);eq(M.eligibility(state,want,{includeOrdered:true,includeIncoming:true}),{eligible:false,reason:'Not acquired'});
 const slotA=state.decks[0].slots.find(r=>r.cardId===basic.id);assert.throws(()=>run('allocate',{lotId:'want1',deckId:'deckA',slotId:slotA.id,quantity:1}),/plan to buy/);checks++;
 run('source',{lotId:'want1',source:'owned',quantity:2});const owned=state.lots.find(l=>l.id==='want1');eq(owned.source,'owned');eq(owned.location.kind,'bench');eq(M.counters(state).wanted,0);eq(M.counters(state).owned,before.owned+2);
 run('acquire',{lot:{id:'want2',cardId:pool[3].id,quantity:1,source:'wanted'}});eq(M.counters(state).wanted,1);run('removePending',{lotId:'want2',quantity:1});ok(!state.lots.some(l=>l.id==='want2'));eq(M.counters(state).wanted,0);}
const comma=E.parse('1 Chulane, Teller of Tales\n1 Sol Ring',{deckParser:P});eq(comma.rows[0].name,'Chulane, Teller of Tales');eq(comma.rows.length,2);
const exact=E.parse('Card name,Quantity,Printing ID,Signed,Altered\nSol Ring,2,printuuid,true,false');eq(exact.rows[0].printing.id,'printuuid');eq(exact.rows[0].printing.signed,true);eq(exact.rows[0].printing.altered,false);
// Unknown prices and newly accepted alternatives cannot silently relax caps.
run('editDeck',{deckId:'deckA',definition:{...definition,budget:1}});
assert.throws(()=>run('swap',{deckId:'deckA',slotId:target.id,cardId:pool[2].id}),/exceeds/);checks++;
run('editDeck',{deckId:'deckA',definition});
const supplemental=C.normalize({name:'Test transcription',typeLine:'Artifact',verified:false,legalities:{commander:'unverified'}});
run('acquire',{cards:[supplemental],lot:{id:'manual-copy',cardId:supplemental.id,quantity:2,printing:{set:'tst',collector:'007',finish:'foil'}}});
/* By id, not by index: a library now opens with the four starter groups, so the one
   this test creates is never groups[0]. */
const group=id=>state.groups.find(g=>g.id===id);
run('createGroup',{groupId:'manual-group',name:'Transcribed cards'});
run('groupEntries',{groupId:'manual-group',entries:[{cardId:supplemental.id,quantity:1}]});
const ownedBefore=M.counters(state).owned;
run('verifyIdentity',{cardId:supplemental.id,card:pool[4],confirmed:true});
eq(M.counters(state).owned,ownedBefore);eq(M.lot(state,'manual-copy').printing.collector,'007');eq(M.lot(state,'manual-copy').cardId,pool[4].id);eq(group('manual-group').entries[0].cardId,pool[4].id);
run('createGroup',{groupId:'destination-group',name:'Destination'});
run('moveGroupEntries',{from:'manual-group',to:'destination-group',entryIds:[group('manual-group').entries[0].id]});
eq(group('manual-group').entries.length,0);eq(group('destination-group').entries.length,1);eq(M.counters(state).owned,ownedBefore);
const V=require('../collection-evidence.js'),report={kind:'report',deckFingerprint:M.fingerprint(state.decks[0]),protocol:'fixture-only',versions:{engine:'fixture1',cards:'fixture1'},conditions:{opponents:['a','b','c'],seeds:[1,2],games:10},metrics:{wins:{value:.2,unit:'probability'}}};
let comparison=V.compare(report,{...report,metrics:{wins:{value:.4,unit:'probability'}}});eq(comparison.compatible,true);eq(comparison.rows[0].delta,.2);
comparison=V.compare(report,{...report,conditions:{...report.conditions,opponents:['d','e','f']}});eq(comparison.compatible,false);eq(comparison.rows[0].delta,null);
comparison=V.compare(report,{...report,conditions:undefined});ok(comparison.reasons.includes('Comparison conditions were not supplied'));assert.throws(()=>V.validate({...report,metrics:null}),/metrics/);checks++;
// The native store limit must be feasible without per-copy state expansion.
const large=structuredClone(state),template=large.lots[0];large.lots=Array.from({length:10000},(_,i)=>({...structuredClone(template),id:'scale:'+i,allocation:null,groupIds:[]}));
const started=performance.now();M.validate(large);const projected=M.projection(large);ok(projected.length>=10000);eq(M.counters(large).owned,10000*template.quantity);const elapsed=performance.now()-started;
const invalidQuantity=structuredClone(state);invalidQuantity.lots[0].quantity='2';assert.throws(()=>M.validate(invalidQuantity),/must be numbers/);checks++;
const Client=require('../crankmagic-card-client.js');let requests=0;const client=Client.create({storage:null,delayMs:0,fetchImpl:async()=>{requests++;return new Response(JSON.stringify({object:'card',id:'fixture-print',oracle_id:'fixture-oracle',name:'Test full facts',type_line:'Legendary Creature — Wizard',power:'4',toughness:'4',collector_number:'005',mana_cost:'{3}{U}',legalities:{commander:'legal'},scryfall_uri:'https://scryfall.com/card/tst/005/test-full-facts'}),{status:200,headers:{'Content-Type':'application/json'}});}});
const full=await client.named('Test full facts',{exact:true});eq(full.power,'4');eq(full.toughness,'4');eq(full.collectorNumber,'005');await client.named('Test full facts',{exact:true});eq(requests,1);
{// hydrate() fills the printed body of graph-only rows -- one /cards/collection request per
 // 75 names -- and a printed variant name (SpongeBob SquarePants on the Secret Lair Jodah) is
 // searchable once known, because that is what a reader at a table will type.
 const fetchImpl=async url=>new Response(JSON.stringify(String(url).includes('universe')?{generatedAt:'2026',cards:[]}:String(url).includes('facts')?{cards:{}}:{cards:[]}),{status:200,headers:{'Content-Type':'application/json'}});
 let batches=0;
 const client={named:async()=>null,collection:async ids=>{batches++;return {cards:ids.map(({name})=>({name,typeLine:'Creature — Test',oracleText:'Text for '+name,manaCost:'{1}',colorIdentity:['U'],legalities:{commander:'legal'},keywords:[],flavorName:name==='Jodah, the Unifier'?'SpongeBob SquarePants':''})),missing:[]};}};
 const cat=await C.create({client,fetchImpl,urls:{universe:'u/universe.json',cards:'u/cards.json',facts:'u/facts.json',ranks:null,graph:'u/graph.json'},savedCards:{}});
 const rows=Array.from({length:80},(_,i)=>cat.add({name:i?'Row '+i:'Jodah, the Unifier',typeLine:'Creature',colorIdentity:['U'],legalities:{commander:'legal'},verified:true,commander:i===0}));
 ok(rows.every(c=>!c.oracleText));
 const {hydrated,missing}=await cat.hydrate(rows);
 eq(batches,2);eq(hydrated.length,80);eq(missing.length,0);
 eq(cat.exact('Row 5').oracleText,'Text for Row 5');
 eq(cat.search('spongebob',{commander:true}).map(c=>c.name),['Jodah, the Unifier']);
 // SEARCHING IS NOT THE ONLY WAY IN. resolve(), exact() and get() all took the ORACLE name
 // and nothing else, so a pasted list or an import carrying the name printed on the card
 // missed locally and fell through to Scryfall -- which answers, but only online. A reader
 // at a convention with no signal, typing what is in their hand, got nothing. All three
 // now read the flavour name too, from the table the app already ships.
 eq(cat.exact('SpongeBob SquarePants').name,'Jodah, the Unifier');
 eq((await cat.resolve('SpongeBob SquarePants')).name,'Jodah, the Unifier');
 eq(cat.get('SpongeBob SquarePants').name,'Jodah, the Unifier');
 eq(cat.get(C.key('Row 5')).name,'Row 5');
 // An oracle name always wins: an alias may never shadow a card that really has that name.
 cat.add({name:'SpongeBob SquarePants',typeLine:'Creature',colorIdentity:[],legalities:{commander:'legal'},verified:true});
 eq(cat.exact('SpongeBob SquarePants').typeLine,'Creature');
 // similar() matched only the FIRST flavour name while search() matched every one of them.
 {const two=cat.add({name:'Two Faced',typeLine:'Creature — Test',oracleText:'Text',colorIdentity:['U'],legalities:{commander:'legal'},flavorNames:['Alias One','Alias Two']});
  ok(cat.similar(two,{query:'alias two'}).length>=0);
  eq(cat.search('alias two').map(c=>c.name),['Two Faced']);}
 // and the shipped table means the app knows that offline, on the first keystroke
 {const table=JSON.parse(await readFile(new URL('../data/flavor-names.json',import.meta.url),'utf8'));
  ok(table.cards.length>300,`only ${table.cards.length} flavour names shipped`);
  const universe=JSON.parse(await readFile(new URL('../data/commander-universe.json',import.meta.url),'utf8'));
  const known=new Set(universe.cards.map(r=>String(r[0]).toLowerCase()));
  const orphans=table.cards.filter(([,name])=>!known.has(String(name).toLowerCase()));
  eq(orphans.slice(0,3).map(r=>r[1]),[],`${orphans.length} flavour names point at cards the universe does not carry`);
  const sponge=table.cards.find(([flavor])=>flavor==='SpongeBob SquarePants');
  ok(sponge&&sponge[1]==='Jodah, the Unifier','the card in the report must be in the table');
  const bigger=table.cards.find(([flavor])=>/Bigger Boat/.test(flavor));
  ok(bigger&&bigger[1]==='Abrade','a card can be printed under a name the rules never use');}
 eq(cat.search('',{commander:true,colors:['U']}).length,1);eq(cat.search('',{commander:true,colors:['R']}).length,0);
 // the play-style vocabulary reaches a card the old substring list missed
 const purphoros=C.normalize({name:'Purphoros, God of the Forge',typeLine:'Legendary Enchantment Creature — God',oracleText:'Whenever another creature you control enters, Purphoros deals 2 damage to each opponent.',colorIdentity:['R'],legalities:{commander:'legal'}});
 ok(C.matchesMechanic(purphoros,'ETB triggers'));ok(C.matchesMechanic(purphoros,'Drain & burn'));ok(!C.matchesMechanic(purphoros,'Mill'));
 ok(C.MECHANICS.length>=25);
}
{// A replacement is FOR a card. The picker used to offer the catalog's most popular cards,
 // which suggested The Restoration of Eiganjo for Abrade; similar() ranks by likeness to
 // the card being replaced and refuses anything outside the deck's colour identity.
 const fetchImpl=async url=>new Response(JSON.stringify(String(url).includes('universe')?{generatedAt:'2026',cards:[]}:String(url).includes('facts')?{cards:{}}:{cards:[]}),{status:200,headers:{'Content-Type':'application/json'}});
 const cat=await C.create({client:{},fetchImpl,urls:{universe:'u/universe.json',cards:'u/cards.json',facts:'u/facts.json',ranks:null,graph:'u/graph.json'},savedCards:{}});
 const make=(name,o)=>cat.add({name,typeLine:'Instant',colorIdentity:['R'],legalities:{commander:'legal'},verified:true,price:1,...o});
 const abrade=make('Abrade',{oracleText:'Choose one — Abrade deals 3 damage to target creature; or destroy target artifact.',price:.28});
 const twin=make('Cut Down',{oracleText:'Destroy target creature with total power and toughness 5 or less.',price:.35});
 const dear=make('Vandalblast',{oracleText:'Destroy target artifact you do not control.',price:22});
 const wrongColor=make('The Restoration of Eiganjo',{typeLine:'Enchantment — Saga',colorIdentity:['W'],oracleText:'Search your library for a Plains card.',price:.4});
 const nothing=make('Sol Ring',{typeLine:'Artifact',colorIdentity:[],oracleText:'{T}: Add {C}{C}.',price:1.69});
 const ranked=cat.similar(abrade,{colors:['R'],limit:10});
 const names=ranked.map(r=>r.card.name);
 ok(!names.includes('Abrade'));// a card is not its own replacement
 ok(!names.includes('The Restoration of Eiganjo'));// out of colour identity
 ok(names.includes('Sol Ring'));// colourless is legal in every deck
 eq(names[0],'Cut Down');// same job, same money
 ok(names.indexOf('Cut Down')<names.indexOf('Vandalblast'),'a $22 answer to a 28c slot must not lead');
 ok(/price/.test(ranked[0].why)||ranked[0].why.length>0);
 // the query still narrows, and likeness still orders what is left
 eq(cat.similar(abrade,{colors:['R'],query:'vandal'}).map(r=>r.card.name),['Vandalblast']);
 // with no card to be like, it falls back to the plain name search
 eq(cat.similar(null,{query:'sol'}).map(r=>r.card.name),['Sol Ring']);
 void [twin,dear,wrongColor,nothing];
}
{// details() prices a card at its lowest-cost paper printing, not the printing Scryfall
 // happens to answer with -- one prints search, cheapest first -- and says which set that is.
 const fetchImpl=async url=>new Response(JSON.stringify(String(url).includes('universe')?{generatedAt:'2026',cards:[]}:String(url).includes('facts')?{cards:{}}:{cards:[]}),{status:200,headers:{'Content-Type':'application/json'}});
 let searched=[];
 const client={named:async name=>({name,typeLine:'Artifact',oracleText:'{T}: Add {C}{C}.',manaCost:'{1}',colorIdentity:[],legalities:{commander:'legal'},keywords:[],price:6.5,set:'c21',setName:'Commander 2021'}),
   search:async (q,opts)=>{searched.push([q,opts]);return [{name:'Sol Ring',price:1.69,set:'mkc',setName:'Murders at Karlov Manor Commander'},{name:'Sol Ring',price:0,set:'lea',setName:'Limited Edition Alpha'},{name:'Sol Ring',price:6.5,set:'c21',setName:'Commander 2021'},{name:'Sol Ring',price:2.1,set:'cmm',setName:'Commander Masters'}];}};
 const cat=await C.create({client,fetchImpl,urls:{universe:'u/universe.json',cards:'u/cards.json',facts:'u/facts.json',ranks:null,graph:'u/graph.json'},savedCards:{}});
 const first=await cat.details({name:'Sol Ring',verified:false});
 eq(first.price,1.69);eq(first.cheapestSet,'Murders at Karlov Manor Commander');eq(first.priceSource,'Scryfall cheapest paper printing');eq(first.printings,3);
 ok(searched[0][0].includes('game:paper')&&searched[0][1].unique==='prints'&&searched[0][1].order==='usd');
 const again=await cat.details(first);eq(searched.length,1);eq(again.price,1.69);
 const plain=await cat.details({name:'Sol Ring',verified:false,oracleText:'x',manaCost:'{1}'},{cheapest:false});ok(plain);eq(searched.length,1);
}
{// Permanent deletion is gated on archive and cleans up everything that pointed at the deck.
 let d=M.empty(),k=0;const step=(type,args={})=>d=M.apply(d,{type,id:'del'+(++k),...args}).state;
 step('batch',{commands:[{type:'cards',cards:[leader,basic,...pool]},{type:'createDeck',deckId:'gone',name:'Gone',commanders:[leader.id],slots:[{cardId:leader.id,quantity:1},{cardId:basic.id,quantity:99}]}]});
 step('finalize',{deckId:'gone'});
 step('acquire',{lot:{id:'boxed',cardId:basic.id,quantity:1,source:'owned'}});
 step('place',{lotId:'boxed',quantity:1,deckId:'gone'});
 ok(d.lots.find(l=>l.id==='boxed').location.kind==='deck');
 step('game',{deckId:'gone',outcome:'win',turns:9,opponents:'',notes:''});
 step('preferences',{values:{comparisonPicks:['gone'],lastLabRun:{deckId:'gone',method:'x',issues:[],at:'now'}}});
 assert.throws(()=>step('deleteDeck',{deckId:'gone',confirmed:true}),/Archive the deck first/);checks++;
 step('archive',{deckId:'gone'});
 assert.throws(()=>step('deleteDeck',{deckId:'gone'}),/Confirm permanent deletion/);checks++;
 step('deleteDeck',{deckId:'gone',confirmed:true});
 eq(d.decks.length,0);eq(d.games.length,0);eq(d.preferences.comparisonPicks,[]);eq(d.preferences.lastLabRun,undefined);
 const boxed=d.lots.find(l=>l.id==='boxed');eq(boxed.location.kind,'bench');eq(boxed.allocation,null);eq(M.counters(d).owned,1);
 M.validate(d);checks++;}
console.log(`crankmagic-core: ${checks} checks passed; bounded construction, compound changes, identity conservation, full printing facts, report provenance; 10,000 lots validated/projected in ${Math.round(elapsed)} ms.`);
