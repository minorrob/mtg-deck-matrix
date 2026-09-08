// Counterexamples to the old plan-equals-owned model, and conservation through
// real user operations. Expected totals come from receipts, not UI projections.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),M=require('../collection-model.js');
let s=M.empty(),serial=0,checks=0;
function run(type,args={}){const before=JSON.stringify(s),result=M.apply(s,{type,id:'test'+(++serial),at:'2026-09-07T00:00:00Z',...args});assert.equal(JSON.stringify(s),before,'Pure operation');s=result.state;checks++;return result;}
function expectFailure(type,args,pattern){const before=JSON.stringify(s);assert.throws(()=>run(type,args),pattern);assert.equal(JSON.stringify(s),before);checks++;}
const cards=[{id:'leader',name:'Leader',typeLine:'Legendary Creature — Wizard',commander:true,verified:true,colorIdentity:[],legalities:{commander:'legal'}},{id:'land',name:'Wastes',typeLine:'Basic Land',verified:true,colorIdentity:[],legalities:{commander:'legal'}},{id:'ring',name:'Sol Ring',typeLine:'Artifact',verified:true,colorIdentity:[],legalities:{commander:'legal'}},{id:'stone',name:'Mind Stone',typeLine:'Artifact',verified:true,colorIdentity:[],legalities:{commander:'legal'}}];
run('cards',{cards});
for(let i=1;i<=5;i++){run('createDeck',{deckId:'d'+i,name:'Deck '+i,commanders:['leader'],slots:[{id:'cmd'+i,cardId:'leader',quantity:1},{id:'lands'+i,cardId:'land',quantity:98},{id:'rock'+i,cardId:'ring',quantity:1}]});run('finalize',{deckId:'d'+i});}
assert.deepEqual(M.counters(s),{owned:0,ordered:0,incoming:0,wanted:0,toBuy:500,inDeck:0,sellTrade:0});checks++;
run('acquire',{lot:{id:'rings',cardId:'ring',quantity:3,printing:{set:'cmm',finish:'nonfoil'}}});
for(let i=1;i<=5;i++)run('fulfill',{deckId:'d'+i});
assert.equal(M.counters(s).owned,3);assert.equal(M.counters(s).toBuy,497);assert.equal(s.lots.filter(l=>l.allocation).length,3);checks+=3;
run('acquire',{lot:{id:'order',cardId:'ring',quantity:1,source:'ordered'},deckId:'d4',slotId:'rock4'});
run('source',{lotId:'order',source:'owned'});assert.equal(M.counters(s).owned,4);assert.equal(M.readiness(s,M.deck(s,'d4')).placed,0);checks+=2;
run('place',{lotId:'order',deckId:'d4'});assert.equal(M.counters(s).inDeck,1);checks++;
expectFailure('source',{lotId:'order',source:'ordered'},/confirm/);
run('source',{lotId:'order',source:'ordered',confirmed:true});assert.equal(M.counters(s).owned,3);assert.equal(M.counters(s).ordered,1);assert.equal(M.counters(s).inDeck,0);checks+=3;
run('source',{lotId:'order',source:'owned'});run('place',{lotId:'order',deckId:'d4'});
run('swap',{deckId:'d4',slotId:'rock4',cardId:'stone'});assert.equal(M.lot(s,'order').allocation.deckId,'d5','Released owned copy fills the other To buy commitment');assert.equal(M.lot(s,'order').location.deckId,'d4','A reservation is not a physical move');assert.equal(M.counters(s).owned,4);checks+=3;
run('lock',{deckId:'d5',locked:true});assert.equal(M.eligibility(s,M.lot(s,'order'),{includeInDeck:true,includeReserved:true}).eligible,false);checks++;
expectFailure('allocate',{lotId:'order',deckId:'d4',slotId:'rock4'},/confirm/);
run('archive',{deckId:'d5'});assert.equal(M.lot(s,'order').allocation,null);assert.equal(M.lot(s,'order').location.deckId,'d4');checks+=2;
expectFailure('place',{lotId:'order',deckId:'d5',confirmed:true},/Archived/);
run('acquire',{lot:{id:'bench',cardId:'land',quantity:5,printing:{finish:'foil'}}});run('offer',{lotId:'bench',quantity:2,offer:'available'});assert.equal(M.counters(s).owned,9);assert.equal(M.counters(s).sellTrade,2);checks+=2;
const offered=s.lots.find(l=>l.offer==='available');run('dispose',{lotId:offered.id,quantity:1,reason:'sale'});assert.equal(M.counters(s).owned,8);assert.equal(M.counters(s).sellTrade,1);checks+=2;
run('createGroup',{groupId:'group1',name:'Trade binder'});run('groupLots',{groupId:'group1',lotIds:['bench']});run('groupEntries',{groupId:'group1',entries:[{cardId:'ring',quantity:100}]});assert.equal(M.counters(s).owned,8);checks++;
run('deleteGroup',{groupId:'group1'});assert.equal(M.counters(s).owned,8);checks++;
const owned=M.counters(s).owned;run('importLots',{batchId:'csv1',lots:[{cardId:'ring',quantity:2,printing:{set:'cmm'}},{cardId:'ring',quantity:1,printing:{set:'lcc'}}]});run('importLots',{batchId:'csv1',lots:[{cardId:'ring',quantity:2}]});assert.equal(M.counters(s).owned,owned+3);assert.equal(s.lots.filter(l=>l.cardId==='ring'&&!l.allocation).length,3);checks+=2;
expectFailure('acquire',{lot:{cardId:'ring',quantity:1.5}},/whole number/);expectFailure('acquire',{lot:{cardId:'ring',quantity:'bad'}},/whole number/);
run('option',{deckId:'d1',replaces:'rock1',option:{cardId:'stone',quantity:1,purpose:'upgrade'},reserve:false});const option=M.deck(s,'d1').slots.find(r=>r.purpose==='upgrade');assert.equal(M.projection(s).some(r=>r.slotId===option.id),false,'Suggestions do not create purchase requirements');checks++;
expectFailure('option',{deckId:'d1',replaces:'rock1',option:{cardId:'stone',quantity:1,purpose:'bracket',targetBracket:4},reserve:true},/outside/);
expectFailure('spreadsheetEdits',{baseRevision:s.revision-1,edits:[]},/changed/);
const invalid=structuredClone(s);invalid.lots.push({...invalid.lots[0]});assert.throws(()=>M.validate(invalid),/Duplicate/);checks++;
run('createDeck',{deckId:'short',name:'Incomplete',commanders:['leader'],slots:[{cardId:'leader',quantity:1}]});expectFailure('finalize',{deckId:'short'},/100/);
console.log(`collection-model: ${checks} checks passed; planned cards never become owned without acquisition.`);
