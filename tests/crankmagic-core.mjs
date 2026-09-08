import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),M=require('../collection-model.js'),D=require('../draft-builder.js'),C=require('../card-catalog.js'),E=require('../collection-exchange.js'),P=require('../deck-import.js');let checks=0;
const eq=(a,b)=>{assert.deepEqual(a,b);checks++;},ok=x=>{assert.ok(x);checks++;};
const leader=C.normalize({name:'Test Commander',typeLine:'Legendary Creature — Wizard',manaValue:3,colorIdentity:['U'],legalities:{commander:'legal'},oracleText:'Partner',keywords:['Partner'],price:1});
const basic=C.normalize({name:'Island',typeLine:'Basic Land — Island',colorIdentity:['U'],legalities:{commander:'legal'},oracleText:'{T}: Add {U}.',price:.1});
const pool=Array.from({length:130},(_,i)=>C.normalize({name:'Fixture '+i,typeLine:i%4===0?'Artifact':'Creature',manaValue:i%5+1,colorIdentity:['U'],legalities:{commander:'legal'},oracleText:i%3===0?'Draw two cards.':i%3===1?'Destroy target creature.':'{T}: Add {U}.',price:1}));
let definition=M.defaultDefinition(),built=D.build({commanders:[leader],cards:[leader,basic,...pool],definition});eq(built.slots.reduce((n,r)=>n+r.quantity,0),100);ok(built.method.includes('not simulated'));eq(built.slots.find(r=>r.cardId===basic.id).quantity,36);
// A price cap of zero starves every candidate -- but not the commander. It was chosen by
// name before any limit existed, so it is the one card a cap may never refuse; a deck of
// the commander alone is the honest result, and the issue says why nothing else fitted.
const zero=D.build({commanders:[leader],cards:[leader,basic,...pool],definition:{...definition,budget:0}});eq(zero.slots.length,1);eq(zero.slots[0].cardId,leader.id);ok(zero.issues.some(x=>x.includes('No limit was relaxed')&&x.includes('$0')));
// And an owned-only pool with nothing owned says so in words a reader can act on.
const starved=D.build({commanders:[leader],cards:[leader,basic,...pool],definition,benchOnly:true,available:{}});eq(starved.slots.length,1);ok(starved.issues.some(x=>/library holds none/.test(x)&&/All legal catalog cards/.test(x)));
const unavailable=D.build({commanders:[leader],cards:[leader,basic,...pool],definition,benchOnly:true,available:{[leader.id]:1,[basic.id]:50,[pool[0].id]:1}});eq(unavailable.slots.reduce((n,r)=>n+r.quantity,0),38);ok(unavailable.issues.length);
const unknown=D.build({commanders:[leader],cards:[leader,basic,{...pool[0],price:null}],definition:{...definition,perCardCap:2}});ok(!unknown.slots.some(r=>r.cardId===pool[0].id));
let state=M.empty(),n=0;const run=(type,args={})=>state=M.apply(state,{type,id:'core'+(++n),...args}).state;
run('batch',{commands:[{type:'cards',cards:[leader,basic,...pool]},{type:'createDeck',deckId:'deckA',name:'A',commanders:[leader.id],slots:[{cardId:leader.id,quantity:1},{cardId:basic.id,quantity:98},{cardId:pool[0].id,quantity:1}]}]});eq(state.revision,1);run('finalize',{deckId:'deckA'});eq(M.counters(state).owned,0);run('acquire',{lot:{id:'option-copy',cardId:pool[1].id,quantity:1,source:'owned'}});const target=state.decks[0].slots.find(r=>r.cardId===pool[0].id);run('option',{deckId:'deckA',replaces:target.id,option:{cardId:pool[1].id,quantity:1,purpose:'upgrade'},reserve:true});const option=state.decks[0].slots.find(r=>r.purpose==='upgrade');eq(state.lots[0].allocation.slotId,option.id);run('acceptOption',{deckId:'deckA',slotId:option.id});eq(state.lots[0].allocation.slotId,target.id);eq(M.counters(state).owned,1);eq(state.decks[0].slots.filter(r=>r.purpose==='main').reduce((n,r)=>n+r.quantity,0),100);eq(state.decks[0].slots.length,3);
const prior=structuredClone(state);assert.throws(()=>run('batch',{commands:[{type:'acquire',lot:{cardId:basic.id,quantity:3}},{type:'acquire',lot:{cardId:basic.id,quantity:-1}}]}));eq(state,prior);
assert.throws(()=>run('editDeck',{deckId:'deckA',commanders:[pool[1].id]}),/reviewed commander/);checks++;
run('acquire',{lot:{id:'incoming1',cardId:basic.id,quantity:1,source:'incoming'}});ok(M.eligibility(state,state.lots.find(l=>l.id==='incoming1'),{includeIncoming:true}).eligible);
const comma=E.parse('1 Chulane, Teller of Tales\n1 Sol Ring',{deckParser:P});eq(comma.rows[0].name,'Chulane, Teller of Tales');eq(comma.rows.length,2);
const exact=E.parse('Card name,Quantity,Printing ID,Signed,Altered\nSol Ring,2,printuuid,true,false');eq(exact.rows[0].printing.id,'printuuid');eq(exact.rows[0].printing.signed,true);eq(exact.rows[0].printing.altered,false);
// Unknown prices and newly accepted alternatives cannot silently relax caps.
run('editDeck',{deckId:'deckA',definition:{...definition,budget:1}});
assert.throws(()=>run('swap',{deckId:'deckA',slotId:target.id,cardId:pool[2].id}),/exceeds/);checks++;
run('editDeck',{deckId:'deckA',definition});
const supplemental=C.normalize({name:'Test transcription',typeLine:'Artifact',verified:false,legalities:{commander:'unverified'}});
run('acquire',{cards:[supplemental],lot:{id:'manual-copy',cardId:supplemental.id,quantity:2,printing:{set:'tst',collector:'007',finish:'foil'}}});
run('createGroup',{groupId:'manual-group',name:'Transcribed cards'});
run('groupEntries',{groupId:'manual-group',entries:[{cardId:supplemental.id,quantity:1}]});
const ownedBefore=M.counters(state).owned;
run('verifyIdentity',{cardId:supplemental.id,card:pool[4],confirmed:true});
eq(M.counters(state).owned,ownedBefore);eq(M.lot(state,'manual-copy').printing.collector,'007');eq(M.lot(state,'manual-copy').cardId,pool[4].id);eq(state.groups[0].entries[0].cardId,pool[4].id);
run('createGroup',{groupId:'destination-group',name:'Destination'});
run('moveGroupEntries',{from:'manual-group',to:'destination-group',entryIds:[state.groups[0].entries[0].id]});
eq(state.groups[0].entries.length,0);eq(state.groups[1].entries.length,1);eq(M.counters(state).owned,ownedBefore);
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
