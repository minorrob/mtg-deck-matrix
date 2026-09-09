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
// WHERE A COPY PHYSICALLY IS, in bulk: reserved is not sleeved, and the deck goes into its
// box a tick at a time from the Collection rather than by a button on the deck page.
run('createDeck',{deckId:'box',name:'Boxed',commanders:['leader'],slots:[{id:'cmdb',cardId:'leader',quantity:1},{id:'landsb',cardId:'land',quantity:98},{id:'rockb',cardId:'ring',quantity:1}]});
run('finalize',{deckId:'box'});
run('acquire',{lot:{id:'boxleader',cardId:'leader',quantity:1}});
run('acquire',{lot:{id:'boxlands',cardId:'land',quantity:98,printing:{set:'unf'}}});
run('acquire',{lot:{id:'boxring',cardId:'ring',quantity:1,printing:{set:'unf'}}});
run('fulfill',{deckId:'box'});
const boxed=()=>M.readiness(s,M.deck(s,'box'));
assert.equal(boxed().owned,100,'Buying the hundred covers the hundred');assert.equal(boxed().placed,0,'A reservation is not a physical move');checks+=2;
assert.equal(boxed().ready,true,'Ready means you own the hundred, not that you confirmed it card by card');checks++;
const reservedForBox=s.lots.filter(l=>l.allocation?.deckId==='box').map(l=>l.id);
run('bulk',{op:'place',deckId:'box',lotIds:reservedForBox,confirmed:true});
assert.equal(boxed().placed,100,'Ticked copies go into the box together');assert.equal(boxed().boxed,true);checks+=2;
run('bulk',{op:'bench',lotIds:reservedForBox,confirmed:true});
assert.equal(boxed().placed,0,'And come back out the same way');assert.equal(boxed().owned,100,'Which releases no reservation');checks+=2;
// A copy reserved for one deck cannot be filed into another deck's box by a stray tick.
run('acquire',{lot:{id:'stray',cardId:'stone',quantity:1,printing:{set:'stray'}}});
expectFailure('bulk',{op:'place',deckId:'box',lotIds:['stray'],confirmed:true},/not reserved for/);
run('archive',{deckId:'box'});expectFailure('bulk',{op:'place',deckId:'box',lotIds:reservedForBox,confirmed:true},/Archived/);

// A BATCH IS ONE CHANGE. Eleven cards marked received after a convention is one errand,
// and it has to be one receipt and one undo -- and all-or-nothing, because a batch that
// applied to six of eleven records leaves a state nobody asked for and nobody can see.
run('createDeck',{deckId:'lots',name:'Batch',commanders:['leader'],slots:[{id:'cmdl',cardId:'leader',quantity:1},{id:'landsl',cardId:'land',quantity:98},{id:'rockl',cardId:'ring',quantity:1}]});
run('finalize',{deckId:'lots'});
run('acquire',{lot:{id:'b1',cardId:'ring',quantity:2,source:'ordered',printing:{set:'mh3'}}});
run('acquire',{lot:{id:'b2',cardId:'stone',quantity:1,source:'ordered',printing:{set:'mh3'}}});
run('acquire',{lot:{id:'b3',cardId:'land',quantity:4,source:'wanted',printing:{set:'mh3'}}});
const ordered=M.counters(s).ordered,wanted=M.counters(s).wanted,ownedBefore=M.counters(s).owned;
run('bulk',{op:'source',source:'owned',lotIds:['b1','b2','b3']});
assert.equal(M.counters(s).owned,ownedBefore+7,'Every ticked record, whatever it was, is owned now');
assert.equal(M.counters(s).ordered,ordered-3);assert.equal(M.counters(s).wanted,wanted-4);checks+=3;
assert.equal(M.lot(s,'b1').location.kind,'bench','A received copy lands on the bench, not in a deck');checks++;
// All or nothing: one unknown record in the list and the whole batch is refused.
expectFailure('bulk',{op:'source',source:'owned',lotIds:['b1','nope']},/no longer exists/);
expectFailure('bulk',{op:'source',source:'owned',lotIds:['b1','b1']},/twice/);
expectFailure('bulk',{op:'source',source:'owned',lotIds:[]},/at least one/);
expectFailure('bulk',{op:'teleport',lotIds:['b1']},/Unknown bulk operation/);
// The single-record guards still hold inside a batch: an owned copy leaving owned, and a
// reservation being released, each need the same confirmation they need on their own.
run('fulfill',{deckId:'lots'});
assert.ok(s.lots.some(l=>l.allocation?.deckId==='lots'),'The batch-received copies filled the new deck');checks++;
const reserved=s.lots.filter(l=>l.allocation?.deckId==='lots').map(l=>l.id);
expectFailure('bulk',{op:'release',lotIds:reserved},/confirm/);
run('bulk',{op:'release',lotIds:reserved,confirmed:true});
assert.equal(s.lots.filter(l=>l.allocation?.deckId==='lots').length,0,'Released every ticked reservation');
assert.equal(M.counters(s).owned,ownedBefore+7,'Releasing a reservation unowns nothing');checks+=2;
run('bulk',{op:'offer',offer:'available',lotIds:['b1','b2'],confirmed:true});
assert.equal(M.lot(s,'b1').offer,'available');assert.equal(M.lot(s,'b2').offer,'available');checks+=2;
run('bulk',{op:'bench',box:'Long box 3',lotIds:['b1','b2'],confirmed:true});
assert.equal(M.lot(s,'b1').location.box,'Long box 3');checks++;
expectFailure('bulk',{op:'source',source:'nonsense',lotIds:['b1'],confirmed:true},/Owned, Ordered/);

// A DECK CAN BE ATTACHED TO A COLLECTION GROUP, and the attachment has to mean something
// or it is a field that lies. It breaks the tie when two copies could fill one requirement,
// it survives being changed and cleared, and it cannot outlive the group it points at.
run('createGroup',{groupId:'shelf',name:'Bench box'});
run('createDeck',{deckId:'tie',name:'Tie break',commanders:['leader'],slots:[{id:'cmdt',cardId:'leader',quantity:1},{id:'landst',cardId:'land',quantity:98},{id:'rockt',cardId:'ring',quantity:1}],groupId:'shelf'});
assert.equal(M.deck(s,'tie').groupId,'shelf','A deck created with a group keeps it');checks++;
expectFailure('createDeck',{deckId:'bad',name:'No such group',commanders:['leader'],slots:[{cardId:'leader',quantity:1}],groupId:'ghost'},/Collection group not found/);
run('acquire',{lot:{id:'loose',cardId:'stone',quantity:1,printing:{set:'zzz'}}});
run('acquire',{lot:{id:'filed',cardId:'stone',quantity:1,printing:{set:'zzz'}},groupId:'shelf'});
run('editDeck',{deckId:'tie',slots:[{id:'cmdt',cardId:'leader',quantity:1},{id:'landst',cardId:'land',quantity:98},{id:'rockt',cardId:'stone',quantity:1}]});
run('finalize',{deckId:'tie'});
assert.equal(M.lot(s,'filed').allocation?.deckId,'tie','The copy filed under the deck\u2019s group is reserved first');
assert.equal(M.lot(s,'loose').allocation,null,'and the identical loose copy is left alone');checks+=2;
run('editDeck',{deckId:'tie',groupId:null});assert.equal(M.deck(s,'tie').groupId,null,'The attachment can be cleared');checks++;
run('editDeck',{deckId:'tie',groupId:'shelf'});
run('deleteGroup',{groupId:'shelf'});
assert.equal(M.deck(s,'tie').groupId,null,'Deleting a group cannot leave a deck pointing at nothing');checks++;
M.validate(s);checks++;

// A DECK'S GROUP IS THE DECK. Made with it, named after it, carrying its cards by being its
// group rather than by holding a second copy of the list.
run('createDeck',{deckId:'own',name:'Goblins go wide',commanders:['leader'],slots:[{id:'c1',cardId:'leader',quantity:1},{id:'l1',cardId:'land',quantity:98},{id:'r1',cardId:'ring',quantity:1}]});
const ownGroup=M.deck(s,'own').groupId;
assert.ok(ownGroup,'A new deck arrives with a collection group');
assert.equal(s.groups.find(g=>g.id===ownGroup).name,'Goblins go wide','named after the deck');checks+=2;
run('editDeck',{deckId:'own',name:'Goblins, wider'});
assert.equal(s.groups.find(g=>g.id===ownGroup).name,'Goblins, wider','and follows the deck when it is renamed');checks++;
run('finalize',{deckId:'own'});
const inOwn=M.projection(s).filter(r=>r.groupIds.includes(ownGroup));
assert.ok(inOwn.length,'The deck\u2019s cards report the deck\u2019s group');
assert.ok(inOwn.every(r=>r.deckId==='own'),'and only this deck\u2019s cards do');
assert.equal(inOwn.reduce((n,r)=>n+r.quantity,0),100,'all hundred of them, owned or still To buy');checks+=3;
assert.equal(s.groups.find(g=>g.id===ownGroup).entries.length,0,'stored once, in the deck, not copied into the group');checks++;
// Opting out, and naming an existing group instead.
run('createDeck',{deckId:'bare',name:'No group',commanders:['leader'],slots:[{cardId:'leader',quantity:1}],groupId:null});
assert.equal(M.deck(s,'bare').groupId,null,'groupId null opts out deliberately');checks++;
run('createGroup',{groupId:'shared',name:'Shared shelf'});
run('createDeck',{deckId:'joins',name:'Joins one',commanders:['leader'],slots:[{cardId:'leader',quantity:1}],groupId:'shared'});
assert.equal(M.deck(s,'joins').groupId,'shared','an existing group can be named instead');checks++;
// The group made with a deck goes when the deck goes; a shared one stays.
run('archive',{deckId:'own'});run('deleteDeck',{deckId:'own',confirmed:true});
assert.equal(s.groups.some(g=>g.id===ownGroup),false,'A deck\u2019s own group leaves with it');checks++;
run('groupLots',{groupId:'shared',lotIds:[s.lots[0].id]});
run('archive',{deckId:'joins'});run('deleteDeck',{deckId:'joins',confirmed:true});
assert.equal(s.groups.some(g=>g.id==='shared'),true,'A group holding copies of its own stays');checks++;
M.validate(s);checks++;

console.log(`collection-model: ${checks} checks passed; planned cards never become owned without acquisition.`);
