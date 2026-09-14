// Counterexamples to the old plan-equals-owned model, and conservation through
// real user operations. Expected totals come from receipts, not UI projections.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url),M=require('../collection-model.js');
let s=M.empty(),serial=0,checks=0;
function run(type,args={}){const before=JSON.stringify(s),result=M.apply(s,{type,id:'test'+(++serial),at:'2026-09-07T00:00:00Z',...args});assert.equal(JSON.stringify(s),before,'Pure operation');s=result.state;checks++;return result;}
function expectFailure(type,args,pattern){const before=JSON.stringify(s);assert.throws(()=>run(type,args),pattern);assert.equal(JSON.stringify(s),before);checks++;}
const cards=[{id:'leader',name:'Leader',typeLine:'Legendary Creature — Wizard',commander:true,verified:true,colorIdentity:[],legalities:{commander:'legal'}},{id:'land',name:'Wastes',typeLine:'Basic Land',verified:true,colorIdentity:[],legalities:{commander:'legal'}},{id:'ring',name:'Sol Ring',typeLine:'Artifact',verified:true,colorIdentity:[],legalities:{commander:'legal'}},{id:'stone',name:'Mind Stone',typeLine:'Artifact',verified:true,colorIdentity:[],legalities:{commander:'legal'}}];
run('cards',{cards});
for(let i=1;i<=5;i++){run('createDeck',{deckId:'d'+i,name:'Deck '+i,commanders:['leader'],slots:[{id:'cmd'+i,cardId:'leader',quantity:1},{id:'lands'+i,cardId:'land',quantity:98},{id:'rock'+i,cardId:'ring',quantity:1}]});run('finalize',{deckId:'d'+i});}
assert.deepEqual(M.counters(s),{owned:0,ordered:0,watching:0,toBuy:500,inDeck:0,sellTrade:0});checks++;
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
run('option',{deckId:'d1',replaces:'rock1',option:{cardId:'stone',quantity:1,purpose:'upgrade',tier:2,why:'Untapped mana on turn two.'},reserve:false});const option=M.deck(s,'d1').slots.find(r=>r.purpose==='upgrade');assert.equal(option.tier,2);assert.equal(option.why,'Untapped mana on turn two.');checks+=2;assert.equal(M.projection(s).some(r=>r.slotId===option.id),false,'Suggestions do not create purchase requirements');checks++;
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
// THE SEGMENTS: the same hundred cut by where it is. Every existing key is untouched.
assert.equal(boxed().inBox,100);assert.equal(boxed().pullFromBench,0);assert.equal(boxed().pullFromOtherBox,0);assert.equal(boxed().remove,0);checks+=4;
run('bulk',{op:'bench',lotIds:reservedForBox,confirmed:true});
assert.equal(boxed().placed,0,'And come back out the same way');assert.equal(boxed().owned,100,'Which releases no reservation');checks+=2;
assert.equal(boxed().pullFromBench,100,'Benched copies are the ones to pull');assert.equal(boxed().inBox,0);checks+=2;
run('cards',{cards:[{id:'ring',name:'Sol Ring',typeLine:'Artifact',verified:true,colorIdentity:[],legalities:{commander:'legal'},price:2.5}]});
assert.equal(boxed().marketValue,2.5,'Market value prices the owned reserved copies the catalog can price');
assert.equal(boxed().costToFinish,0,'Nothing owed, nothing to finish');checks+=2;
const ringLot=s.lots.find(l=>l.allocation?.deckId==='box'&&l.cardId==='ring').id;
run('editLot',{lotId:ringLot,paid:1.25});assert.equal(boxed().paid,1.25,'Paid is summed per copy over reserved lots');checks++;
run('bulk',{op:'place',deckId:'box',lotIds:[ringLot],confirmed:true});assert.equal(boxed().inBox,1);checks++;
run('release',{lotId:ringLot,destination:'bench',confirmed:true});
assert.equal(boxed().remove,1,'A copy still in the physical deck after its reservation went is one to remove');
assert.equal(boxed().costToFinish,2.5,'and the slot it left costs money again');checks+=2;
run('allocate',{lotId:ringLot,deckId:'box',slotId:'rockb',confirmed:true});run('bulk',{op:'bench',lotIds:[ringLot],confirmed:true});assert.equal(boxed().remove,0);checks++;
// A copy reserved for one deck cannot be filed into another deck by a stray tick.
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
run('acquire',{lot:{id:'b3',cardId:'land',quantity:4,source:'watching',printing:{set:'mh3'}}});
const ordered=M.counters(s).ordered,wanted=M.counters(s).watching,ownedBefore=M.counters(s).owned;
run('bulk',{op:'source',source:'owned',lotIds:['b1','b2','b3']});
assert.equal(M.counters(s).owned,ownedBefore+7,'Every ticked record, whatever it was, is owned now');
assert.equal(M.counters(s).ordered,ordered-3);assert.equal(M.counters(s).watching,wanted-4);checks+=3;
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

// THE LADDER BELOW OWNED. Watching is a card you are keeping an eye on; Wanted is one you
// mean to buy. Neither is a copy: never eligible, never reservable -- and a reserved copy
// corrected down to either gives its deck the requirement back, box placement included.
run('cards',{cards:[{id:'gem',name:'Gem',typeLine:'Artifact',verified:true,colorIdentity:[],legalities:{commander:'legal'}}]});
run('createDeck',{deckId:'ladder',name:'Ladder',commanders:['leader'],slots:[{id:'cmdw',cardId:'leader',quantity:1},{id:'landsw',cardId:'land',quantity:98},{id:'gemw',cardId:'gem',quantity:1}]});
const ladderGroup=M.deck(s,'ladder').groupId;
run('acquire',{lot:{id:'eye',cardId:'gem',quantity:1,source:'watching'},groupId:ladderGroup});
assert.equal(M.counters(s).watching,1,'A watched card is counted as watched');
assert.equal(M.eligibility(s,M.lot(s,'eye')).eligible,false,'and is never eligible for a build');checks+=2;
run('finalize',{deckId:'ladder'});
assert.equal(M.lot(s,'eye').allocation,null,'Finalizing reserves no watched copy');
assert.equal(M.shortfall(s,M.deck(s,'ladder'),M.slot(s,'ladder','gemw')),1,'so the requirement is still To buy');checks+=2;
expectFailure('allocate',{lotId:'eye',deckId:'ladder',slotId:'gemw'},/not a copy/);
run('source',{lotId:'eye',source:'watching'});assert.equal(M.lot(s,'eye').source,'watching');checks++;
run('source',{lotId:'eye',source:'ordered'});run('allocate',{lotId:'eye',deckId:'ladder',slotId:'gemw'});
assert.equal(M.lot(s,'eye').allocation?.deckId,'ladder','An ordered copy can be reserved');checks++;
expectFailure('source',{lotId:'eye',source:'watching'},/confirm/);
run('source',{lotId:'eye',source:'watching',confirmed:true});
assert.equal(M.lot(s,'eye').allocation,null,'Dropping a reserved copy to Wanted releases the reservation');
assert.equal(M.shortfall(s,M.deck(s,'ladder'),M.slot(s,'ladder','gemw')),1,'and the deck wants the card again');checks+=2;
run('source',{lotId:'eye',source:'owned'});run('allocate',{lotId:'eye',deckId:'ladder',slotId:'gemw'});run('place',{lotId:'eye',deckId:'ladder'});
assert.equal(M.projection(s).find(r=>r.recordId==='eye').placement,'Physical deck');checks++;
expectFailure('bulk',{op:'source',source:'watching',lotIds:['eye']},/confirm/);
run('bulk',{op:'source',source:'watching',lotIds:['eye'],confirmed:true});
const eye=M.lot(s,'eye');assert.equal(eye.location,null,'Below Owned there is no box');assert.equal(eye.allocation,null,'and no reservation');assert.equal(eye.source,'watching');checks+=3;
expectFailure('source',{lotId:'eye',source:'sometime'},/Owned, Ordered/);

// A LIST BECOMES COPIES, AT A STATUS. The whole draft at once, filed with the deck; on a
// finalized deck only what is still owed, reserved to its slots; and never twice.
run('createDeck',{deckId:'sheet',name:'Sheet',commanders:['leader'],slots:[{id:'cmds',cardId:'leader',quantity:1},{id:'landss',cardId:'land',quantity:98},{id:'gems',cardId:'gem',quantity:1}]});
const sheetGroup=M.deck(s,'sheet').groupId,ownedBeforeSheet=M.counters(s).owned,orderedBeforeSheet=M.counters(s).ordered;
run('acquireSlots',{deckId:'sheet',slotIds:['landss','gems'],source:'owned'});
assert.equal(M.counters(s).owned,ownedBeforeSheet+99,'One copy record per chosen card, at the quantity the list asks for');
assert.equal(s.lots.filter(l=>l.groupIds.includes(sheetGroup)).length,2,'filed under the deck’s group');checks+=2;
expectFailure('acquireSlots',{deckId:'sheet',slotIds:['landss','gems'],source:'owned'},/already has copies/);
run('acquireSlots',{deckId:'sheet',source:'ordered'});
assert.equal(M.counters(s).ordered,orderedBeforeSheet+1,'Saying it for the whole list only records what the group does not already hold');
assert.equal(M.projection(s).filter(r=>r.kind==='lot'&&r.groupIds.includes(sheetGroup)).reduce((n,r)=>n+r.quantity,0),100,'the whole list is copies now, in the group');checks+=2;
run('finalize',{deckId:'sheet'});
const sheet=M.readiness(s,M.deck(s,'sheet'));
assert.equal(sheet.toBuy,0,'Finalizing reserves the filed copies');assert.equal(sheet.owned+sheet.ordered,100);checks+=2;
run('acquireSlots',{deckId:'sheet',slotIds:['gems'],source:'watching',quantities:{gems:2}});
assert.equal(M.counters(s).watching,3,'A count per slot is taken as given, even on a finalized deck');
assert.equal(s.lots.filter(l=>l.source==='watching'&&l.groupIds.includes(sheetGroup)&&!l.allocation).length,1,'and a watched copy is filed, not reserved');checks+=2;
run('createDeck',{deckId:'due',name:'Due',commanders:['leader'],slots:[{id:'cmdd',cardId:'leader',quantity:1},{id:'landsd',cardId:'land',quantity:98},{id:'gemd',cardId:'gem',quantity:1}]});run('finalize',{deckId:'due'});
assert.ok(M.readiness(s,M.deck(s,'due')).toBuy>0,'A fresh deck still owes cards');checks++;
run('acquireSlots',{deckId:'due',source:'ordered'});
assert.equal(M.readiness(s,M.deck(s,'due')).toBuy,0,'On a finalized deck the outstanding shortfall is what gets recorded, reserved to its slots');checks++;
expectFailure('acquireSlots',{deckId:'due',source:'owned'},/already has copies/);

// WHAT WAS PAID IS STAMPED WITH HOW WE KNOW. A one-tap Bought records the sheet price as
// paid, marked catalog; a receipt or a typed figure says so; clearing it clears the mark.
run('acquire',{lot:{id:'stamped',cardId:'gem',quantity:2,source:'watching',paid:null}});
assert.equal(M.lot(s,'stamped').paidSource,undefined);checks++;
run('source',{lotId:'stamped',source:'ordered',paid:3.5,paidSource:'catalog'});
assert.equal(M.lot(s,'stamped').paid,3.5);assert.equal(M.lot(s,'stamped').paidSource,'catalog');assert.ok(M.lot(s,'stamped').paidAt);checks+=3;
run('source',{lotId:'stamped',source:'owned',paid:9,paidSource:'catalog'});
assert.equal(M.lot(s,'stamped').paid,3.5,'A stamp never overwrites a figure already recorded');checks++;
run('editLot',{lotId:'stamped',paid:4,paidSource:'receipt'});assert.equal(M.lot(s,'stamped').paidSource,'receipt');checks++;
run('editLot',{lotId:'stamped',paid:null});assert.equal(M.lot(s,'stamped').paidSource,undefined);assert.equal(M.lot(s,'stamped').paidAt,undefined);checks+=2;
run('bulk',{op:'source',source:'ordered',lotIds:['stamped'],paidByLot:{stamped:1.1},paidSource:'catalog',confirmed:true});
assert.equal(M.lot(s,'stamped').paid,1.1);assert.equal(M.lot(s,'stamped').paidSource,'catalog');checks+=2;
expectFailure('editLot',{lotId:'stamped',paid:-1},/nonnegative/);
run('acquire',{lot:{id:'typed',cardId:'gem',quantity:1,paid:2}});assert.equal(M.lot(s,'typed').paidSource,'typed');checks++;

// AN ORDER IS ONE THING. Ticked copies and one dialog become one order record across the
// lots, shipping spread by copy, the sheet price stamped where nothing was paid; Arrived is
// one command over the order; a receipt corrects only the lines it names.
run('acquire',{lot:{id:'o1',cardId:'gem',quantity:2,source:'watching'}});run('acquire',{lot:{id:'o2',cardId:'ring',quantity:1,source:'watching',printing:{set:'ord'}}});run('acquire',{lot:{id:'o3',cardId:'stone',quantity:1,source:'watching',printing:{set:'ord'}}});
run('order',{lotIds:['o1','o2','o3'],order:{id:'order:test',vendor:'TCGplayer',ref:'#4242',expectedBy:'2026-09-20'},shipping:4,paidByLot:{o1:0.5,o2:1.5,o3:2},paidSource:'catalog'});
assert.equal(M.lot(s,'o1').source,'ordered');assert.equal(M.lot(s,'o1').order.id,'order:test');assert.equal(M.lot(s,'o1').order.shipShare,1,'Shipping is spread per copy: $4 over 4 copies');assert.equal(M.lot(s,'o1').paid,0.5);assert.equal(M.lot(s,'o1').paidSource,'catalog');checks+=5;
{const [o]=M.orders(s);assert.equal(o.copies,4);assert.equal(o.arrived,0);assert.equal(o.paid,0.5*2+1.5+2);assert.equal(o.shipping,4);assert.equal(o.vendor,'TCGplayer');checks+=5;}
expectFailure('order',{lotIds:[],order:{vendor:'x'}},/at least one/);
run('receipt',{lines:[{lotId:'o2',paid:1.75},{lotId:'o3',paid:2.25}]});
assert.equal(M.lot(s,'o2').paid,1.75);assert.equal(M.lot(s,'o2').paidSource,'receipt');assert.equal(M.lot(s,'o1').paid,0.5,'A receipt touches only the lines it names');checks+=3;
run('editOrder',{orderId:'order:test',order:{ref:'#4243'}});assert.equal(M.lot(s,'o3').order.ref,'#4243');assert.equal(M.lot(s,'o3').order.shipShare,1,'Editing the order keeps each line’s shipping share');checks+=2;
const beforeArrival=s.revision;run('orderArrived',{orderId:'order:test'});
assert.equal(s.revision,beforeArrival+1,'Arrived is one revision, so one undo');assert.ok(['o1','o2','o3'].every(id=>M.lot(s,id).source==='owned'&&M.lot(s,id).location.kind==='bench'));assert.equal(M.orders(s)[0].arrived,4);checks+=3;
expectFailure('orderArrived',{orderId:'order:test'},/already arrived/);
M.validate(s);checks++;

// A GAME CARRIES WHERE YOU FINISHED, IN WHAT POD, AT WHAT BRACKET, AND WHICH CARDS MATTERED.
run('game',{deckId:'d1',outcome:'win',playedAt:'2026-09-10',finish:1,pod:4,bracket:3,mvpCardId:'ring',deadCardId:'land',turns:9});
{const g=s.games[s.games.length-1];assert.equal(g.finish,1);assert.equal(g.pod,4);assert.equal(g.bracket,3);assert.equal(g.mvpCardId,'ring');assert.equal(g.at,'2026-09-10');checks+=5;}
expectFailure('game',{deckId:'d1',outcome:'loss',finish:5,pod:4},/place in the pod/);
expectFailure('game',{deckId:'d1',outcome:'loss',mvpCardId:'nope'},/Resolve the card/);
run('game',{deckId:'d1',outcome:'loss'});assert.equal(s.games[s.games.length-1].pod,null);checks++;

// A planned entry is fulfilled a few copies at a time.
run('createGroup',{groupId:'plans',name:'Plans'});run('groupEntries',{groupId:'plans',entries:[{cardId:'gem',quantity:3}]});
const planned=s.groups.find(g=>g.id==='plans').entries[0].id;
run('removeGroupEntries',{groupId:'plans',entryIds:[planned],quantity:1});assert.equal(s.groups.find(g=>g.id==='plans').entries[0].quantity,2);checks++;
expectFailure('removeGroupEntries',{groupId:'plans',entryIds:[planned],quantity:5},/exceeds/);
run('removeGroupEntries',{groupId:'plans',entryIds:[planned]});assert.equal(s.groups.find(g=>g.id==='plans').entries.length,0);checks++;
M.validate(s);checks++;


// THE TWO SLOT FLAGS. Pinned keeps a card whatever the Lab suggests; Option marks it as the
// first to come out when a swap is needed. They exclude each other, the flag moves no copy,
// and a card that is replaced takes its flag with it rather than handing it to the newcomer.
{
  run('flag',{deckId:'d1',slotId:'rock1',option:true,why:'Redundant with the Signet'});
  assert.equal(M.slot(s,'d1','rock1').option,true);assert.equal(M.slot(s,'d1','rock1').optionWhy,'Redundant with the Signet');checks+=2;
  assert.equal(M.projection(s).filter(r=>r.deckId==='d1'&&r.slotId==='rock1').every(r=>r.option===true),true,'Need rows for the slot carry the flag');checks++;
  run('pin',{deckId:'d1',slotId:'rock1',pinned:true});
  assert.equal(M.slot(s,'d1','rock1').option,false,'Pinning clears the option flag');assert.equal(M.slot(s,'d1','rock1').optionWhy,'');assert.equal(M.slot(s,'d1','rock1').pinned,true);checks+=3;
  run('flag',{deckId:'d1',slotId:'rock1',option:true});
  assert.equal(M.slot(s,'d1','rock1').pinned,false,'Flagging clears the pin');checks++;
  expectFailure('flag',{deckId:'d1',slotId:'nope',option:true},/slot/i);
  const before=JSON.stringify(s.lots);run('flag',{deckId:'d1',slotId:'rock1',option:false});assert.equal(JSON.stringify(s.lots),before,'A flag never touches a copy');assert.equal(M.slot(s,'d1','rock1').option,false);checks+=2;
  run('flag',{deckId:'d1',slotId:'rock1',option:true,why:'Going'});
  run('swap',{deckId:'d1',slotId:'rock1',cardId:'stone',cards:[]});
  assert.equal(M.slot(s,'d1','rock1').option,false,'The replacement does not inherit the flag');assert.equal(M.slot(s,'d1','rock1').cardId,'stone');checks+=2;
  run('swap',{deckId:'d1',slotId:'rock1',cardId:'ring',cards:[]});
}
// THE SPREADSHEET'S COMMANDS. target is how many of a card a deck LISTS; assign is how many
// copies are RESERVED to that slot and how many of those sit in the physical deck. A deck cell typed
// to 1 releases the copy from wherever it was, reserves it here and -- for the In box
// column -- puts it in this box; a copy taken from another deck stays physically in that
// deck until it is moved, which is what the other deck's pull sheet then says. The matrix
// is the sheet's numbers, and it never disagrees with readiness.
{
  const saved=s;s=M.empty();
  run('cards',{cards:[...cards,
    {id:'red',name:'Lightning Bolt',typeLine:'Instant',verified:true,colorIdentity:['R'],legalities:{commander:'legal'}},
    {id:'seven',name:'Seven Dwarves',typeLine:'Creature — Dwarf',verified:true,colorIdentity:[],oracleText:'A deck can have up to seven cards named Seven Dwarves.',legalities:{commander:'legal'}},
    {id:'rat',name:'Relentless Rats',typeLine:'Creature — Rat',verified:true,colorIdentity:[],oracleText:'A deck can have any number of cards named Relentless Rats.',legalities:{commander:'legal'}}]});
  assert.equal(M.maxCopies(s.cards.land),Infinity);assert.equal(M.maxCopies(s.cards.ring),1);assert.equal(M.maxCopies(s.cards.seven),7);assert.equal(M.maxCopies(s.cards.rat),Infinity);checks+=4;
  run('createDeck',{deckId:'A',name:'Deck A',commanders:['leader'],slots:[{id:'cmdA',cardId:'leader',quantity:1},{id:'landA',cardId:'land',quantity:97},{id:'ringA',cardId:'ring',quantity:1},{id:'stoneA',cardId:'stone',quantity:1}]});run('finalize',{deckId:'A'});
  run('createDeck',{deckId:'B',name:'Deck B',commanders:['leader'],slots:[{id:'cmdB',cardId:'leader',quantity:1},{id:'landB',cardId:'land',quantity:98},{id:'ringB',cardId:'ring',quantity:1}]});run('finalize',{deckId:'B'});
  run('createDeck',{deckId:'C',name:'Draft C',commanders:['leader'],slots:[{id:'cmdC',cardId:'leader',quantity:1},{id:'landC',cardId:'land',quantity:10}]});
  const cell=(cid,did)=>M.matrix(s).rows.find(r=>r.cardId===cid).perDeck[did],rowOf=cid=>M.matrix(s).rows.find(r=>r.cardId===cid);
  const agree=()=>{const m=M.matrix(s);for(const d of s.decks.filter(d=>!d.archived)){const r=M.readiness(s,d);assert.equal(m.totals[d.id].boxed,r.inBox,d.name+': the sheet\'s In box total is readiness\'s');assert.equal(m.totals[d.id].t,m.decks.find(x=>x.id===d.id).target);}assert.equal(m.toBuy,M.counters(s).toBuy,'the sheet\'s To buy is the library\'s');checks+=2;};
  {const m=M.matrix(s);assert.deepEqual(m.decks.map(d=>d.id),['A','B','C']);assert.equal(m.rows.length,4,'one row per card any deck lists');assert.deepEqual(m.totals.A,{t:100,a:0,boxed:0,sub:0,short:4});assert.equal(rowOf('ring').toBuy,2,'two final decks short one Sol Ring each');assert.equal(rowOf('land').toBuy,195,'a draft\'s list is not a purchase');assert.equal(m.own,0);checks+=6;agree();}
  // A free copy: the Assigned cell reserves it, the In box cell sleeves it.
  run('acquire',{lot:{id:'ring1',cardId:'ring',quantity:1}});
  {const p=M.plan(s,{cardId:'ring',column:'a',deckId:'A',value:1});assert.equal(p.command.type,'assign');assert.equal(p.review,true);assert.ok(p.notes.some(n=>/1 free copy is reserved to Deck A/.test(n)),p.notes.join(' | '));checks+=3;
   run(p.command.type,p.command);assert.deepEqual([cell('ring','A').a,cell('ring','A').boxed],[1,0]);assert.equal(M.readiness(s,M.deck(s,'A')).pullFromBench,1);checks+=2;agree();}
  {const p=M.plan(s,{cardId:'ring',column:'boxed',deckId:'A',value:1});assert.ok(p.notes.some(n=>/1 reserved copy goes into Deck A/.test(n)),p.notes.join(' | '));run(p.command.type,p.command);assert.equal(cell('ring','A').boxed,1);assert.equal(M.inDeck(s,M.lot(s,'ring1')),true);checks+=3;agree();}
  // Another deck's cell typed to 1 takes the copy: reserved here now, still in the other box
  // until it is moved, and never without a review.
  expectFailure('assign',{deckId:'B',cardId:'ring',assigned:1},/confirm/i);
  {const p=M.plan(s,{cardId:'ring',column:'a',deckId:'B',value:1});assert.ok(p.notes.some(n=>/1 copy comes from Deck A \(still in that physical deck until it is moved\)/.test(n)),p.notes.join(' | '));checks++;
   const r=run(p.command.type,p.command);assert.match(r.summary,/from Deck A/);const l=M.lot(s,'ring1');assert.equal(l.allocation.deckId,'B');assert.equal(l.location.deckId,'A','physically still in A');assert.equal(M.inDeck(s,l),false);
   assert.deepEqual([cell('ring','A').a,cell('ring','B').a,cell('ring','B').boxed],[0,1,0]);assert.equal(M.readiness(s,M.deck(s,'B')).pullFromOtherBox,1);assert.equal(M.readiness(s,M.deck(s,'A')).standIns,1,'the ring stands in A until B pulls it');checks+=7;agree();}
  {const p=M.plan(s,{cardId:'ring',column:'boxed',deckId:'B',value:1});run(p.command.type,p.command);assert.equal(M.lot(s,'ring1').location.deckId,'B');assert.equal(cell('ring','B').boxed,1);checks+=2;agree();}
  // Nothing in the library covers it: the sheet saying a copy is assigned records one owned.
  {const p=M.plan(s,{cardId:'stone',column:'a',deckId:'A',value:1});assert.ok(p.notes.some(n=>/recorded as newly owned/.test(n)));checks++;
   expectFailure('assign',{deckId:'A',cardId:'stone',assigned:1,acquire:false,confirmed:true},/No copy of Mind Stone/);
   const owned=M.counters(s).owned;const r=run(p.command.type,p.command);assert.match(r.summary,/1 recorded as newly owned/);assert.equal(M.counters(s).owned,owned+1);const l=s.lots.find(l=>l.cardId==='stone');assert.equal(l.allocation.slotId,'stoneA');assert.equal(l.notes,'Recorded from the spreadsheet');checks+=4;agree();}
  // Assigned falls: reservations go, the copy stays owned. Boxed falls: back to the bench.
  {run('assign',{deckId:'B',cardId:'ring',assigned:1,boxed:0,confirmed:true});assert.equal(M.lot(s,'ring1').location.kind,'bench');assert.equal(cell('ring','B').boxed,0);checks+=2;
   expectFailure('assign',{deckId:'B',cardId:'ring',assigned:0},/Review the reservations/);run('assign',{deckId:'B',cardId:'ring',assigned:0,confirmed:true});assert.equal(M.lot(s,'ring1').allocation,null);assert.equal(M.counters(s).owned,2);checks+=2;agree();}
  expectFailure('assign',{deckId:'B',cardId:'ring',assigned:2,confirmed:true},/lists 1 copy/);
  expectFailure('assign',{deckId:'B',cardId:'ring',assigned:1,boxed:2,confirmed:true},/Assign the copies before/);
  expectFailure('assign',{deckId:'C',cardId:'land',assigned:1,confirmed:true},/Finalize/);
  expectFailure('assign',{deckId:'A',cardId:'red',assigned:1,confirmed:true},/not in Deck A's list/);
  assert.equal(M.plan(s,{cardId:'land',column:'a',deckId:'C',value:1}).refused,'Draft C is a draft; finalize it, or set its target.');checks++;
  // TARGET: the copies rule, the colour identity and the commander are the limits; 100 is not.
  expectFailure('target',{deckId:'A',cardId:'ring',quantity:2,confirmed:true},/one copy/);
  expectFailure('target',{deckId:'A',cardId:'red',quantity:1,confirmed:true},/color identity/);
  expectFailure('target',{deckId:'A',cardId:'leader',quantity:0,confirmed:true},/commander/);
  expectFailure('target',{deckId:'A',cardId:'ring',quantity:1,confirmed:true},/already says/);
  assert.equal(M.plan(s,{cardId:'ring',column:'t',deckId:'A',value:2}).refused,'Sol Ring: a deck can carry one copy.');checks++;
  {const p=M.plan(s,{cardId:'stone',column:'t',deckId:'A',value:0});assert.equal(p.review,true,'removing a card that has copies asks first');assert.ok(p.notes.some(n=>/99 cards, not 100/.test(n)),p.notes.join(' | '));checks+=2;
   expectFailure('target',{deckId:'A',cardId:'stone',quantity:0},/Review the reservations/);
   const r=run('target',{deckId:'A',cardId:'stone',quantity:0,confirmed:true});assert.match(r.summary,/99 cards, not 100/);assert.equal(M.deck(s,'A').slots.some(x=>x.cardId==='stone'),false);assert.equal(s.lots.find(l=>l.cardId==='stone').allocation,null,'the copy is released, not deleted');assert.equal(M.deck(s,'A').status,'final');checks+=4;agree();}
  // Raising a finalized deck's target reserves the free copy; a second deck asking gets To buy.
  {run('target',{deckId:'B',cardId:'stone',quantity:1});assert.equal(cell('stone','B').a,1,'the freed Mind Stone is reserved to B on the spot');assert.equal(M.deck(s,'B').slots.filter(x=>x.purpose==='main').reduce((n,x)=>n+x.quantity,0),101);checks+=2;
   run('target',{deckId:'A',cardId:'stone',quantity:1});assert.deepEqual([cell('stone','A').a,rowOf('stone').toBuy],[0,1]);checks++;agree();}
  // Basics and "any number" cards take any count; "up to seven" takes seven and not eight.
  run('target',{deckId:'C',cardId:'land',quantity:5});assert.equal(M.slot(s,'C','landC').quantity,5);checks++;
  run('target',{deckId:'C',cardId:'land',quantity:0});assert.equal(M.deck(s,'C').slots.some(x=>x.cardId==='land'),false);checks++;
  run('target',{deckId:'C',cardId:'seven',quantity:7,confirmed:true});expectFailure('target',{deckId:'C',cardId:'seven',quantity:8,confirmed:true},/7 copies/);
  run('target',{deckId:'C',cardId:'rat',quantity:30});assert.equal(cell('rat','C').t,30);checks++;
  // A card the library has never seen comes in with the command, as the picker sends it.
  run('target',{deckId:'C',cardId:'gemx',quantity:1,cards:[{id:'gemx',name:'Fellwar Stone',typeLine:'Artifact',verified:true,colorIdentity:[],legalities:{commander:'legal'}}]});assert.equal(s.cards.gemx.name,'Fellwar Stone');checks++;
  // A deck cell typed where the list says 0: target first, then assign, one reviewed batch.
  {const p=M.plan(s,{cardId:'seven',column:'a',deckId:'A',value:2});assert.equal(p.command.type,'batch');assert.deepEqual(p.command.commands.map(c=>c.type),['target','assign']);assert.ok(p.notes.some(n=>/grows to 2 copies of Seven Dwarves \(it was not in the list\)/.test(n)));assert.ok(p.notes.some(n=>/2 copies are recorded as newly owned/.test(n)));checks+=4;
   assert.equal(M.plan(s,{cardId:'seven',column:'a',deckId:'A',value:8}).refused,'Seven Dwarves: a deck can carry 7 copies.');checks++;}
  // OWN and ORDERED across the row: raises record copies, falls take the free ones first
  // and say when a reserved or boxed copy has to go too.
  {let p=M.plan(s,{cardId:'ring',column:'own',value:3});assert.deepEqual([p.command.type,p.command.lot.quantity,p.review],['acquire',2,false]);run(p.command.type,p.command);assert.equal(rowOf('ring').own,3);checks+=2;
   run('assign',{deckId:'A',cardId:'ring',assigned:1,boxed:1,confirmed:true});
   p=M.plan(s,{cardId:'ring',column:'own',value:2});assert.equal(p.review,false,'a free copy goes first, no review');assert.equal(p.command.type,'dispose');run(p.command.type,p.command);assert.equal(rowOf('ring').own,2);assert.equal(cell('ring','A').boxed,1);checks+=4;
   p=M.plan(s,{cardId:'ring',column:'own',value:0});assert.equal(p.review,true);assert.ok(p.notes.some(n=>/1 reserved to Deck A and in its physical deck goes too/.test(n)),p.notes.join(' | '));run(p.command.type,p.command);assert.equal(rowOf('ring').own,0);assert.equal(M.counters(s).owned,1,'only the recorded Mind Stone is left');checks+=4;agree();
   p=M.plan(s,{cardId:'ring',column:'ordered',value:2});assert.deepEqual([p.command.type,p.command.lot.source],['acquire','ordered']);run(p.command.type,p.command);assert.equal(rowOf('ring').ordered,2);checks+=2;
   p=M.plan(s,{cardId:'ring',column:'ordered',value:0});assert.equal(p.command.type,'removePending');run(p.command.type,p.command);assert.equal(rowOf('ring').ordered,0);checks+=2;
   assert.deepEqual(M.plan(s,{cardId:'ring',column:'own',value:0}),{command:null,review:false,notes:['No change.']});assert.equal(M.plan(s,{cardId:'ring',column:'nope',value:1}).refused,'Unknown column.');checks+=2;}
  // A RAISED TARGET takes the copy from the other deck, reserved here, still there until
  // pulled; where nothing exists anywhere it is simply To buy.
  {run('acquire',{lot:{id:'ring2',cardId:'ring',quantity:1}});run('assign',{deckId:'B',cardId:'ring',assigned:1,boxed:1,confirmed:true});run('target',{deckId:'A',cardId:'ring',quantity:0,confirmed:true});
   const p=M.plan(s,{cardId:'ring',column:'t',deckId:'A',value:1});assert.equal(p.command.type,'batch');assert.deepEqual(p.command.commands.map(c=>[c.type,c.partial||false]),[['target',false],['assign',true]]);assert.equal(p.review,true);assert.ok(p.notes.some(n=>/1 copy comes from Deck B \(still in that physical deck until it is moved\)/.test(n)),p.notes.join(' | '));checks+=4;
   run('batch',p.command);assert.deepEqual([cell('ring','A').a,cell('ring','B').a,M.lot(s,'ring2').location.deckId],[1,0,'B']);assert.equal(M.readiness(s,M.deck(s,'B')).standIns,1,'B still holds it');checks+=2;agree();
   const q=M.plan(s,{cardId:'seven',column:'t',deckId:'B',value:1});assert.equal(q.command.type,'target');assert.equal(q.review,false);assert.ok(q.notes.some(n=>/1 copy stays To buy/.test(n)),q.notes.join(' | '));checks+=3;}
  // A card the library has never met rides in on the edit, and every command it plans carries the identity.
  {const novel={id:'novel',name:'Arcane Signet',typeLine:'Artifact',verified:true,colorIdentity:[],legalities:{commander:'legal'}};
   assert.throws(()=>M.plan(s,{cardId:'novel',column:'own',value:1}),/Resolve the card identity/);checks++;
   const p=M.plan(s,{cardId:'novel',card:novel,column:'boxed',deckId:'A',value:1});assert.equal(p.command.type,'acquire','not in the list: one copy recorded straight into the box as a substitute');assert.equal((p.command.cards||[]).length,1);checks+=2;
   run(p.command.type,p.command);assert.equal(s.cards.novel.name,'Arcane Signet');assert.deepEqual([cell('novel','A').t,cell('novel','A').boxed,cell('novel','A').sub],[0,0,1]);checks+=2;
   const q=M.plan(s,{cardId:'novel2',card:{...novel,id:'novel2',name:'Fellwar Stone'},column:'own',value:2});assert.equal(q.command.cards[0].name,'Fellwar Stone');run(q.command.type,q.command);assert.equal(rowOf('novel2').own,2);checks+=2;agree();}
  M.validate(s);checks++;
  s=saved;
}
// STAND-INS. A copy physically in a deck box that the list does not call for is a substitute:
// it fills a seat while the real card is bought or on its way. Nothing marks it; the pull
// sheet asks for it back when a real copy is ready (swapReady) or when the box holds more
// substitutes than the list has empty seats (surplus). A copy the list DOES call for is
// reserved on the way in, and a substitute already in the physical deck is the first copy reserved when
// the list grows to want it.
{
  const saved=s;s=M.empty();
  run('cards',{cards:[...cards,{id:'gem',name:'Fellwar Stone',typeLine:'Artifact',verified:true,colorIdentity:[],legalities:{commander:'legal'}}]});
  run('createDeck',{deckId:'A',name:'Deck A',commanders:['leader'],slots:[{id:'cmdA',cardId:'leader',quantity:1},{id:'landA',cardId:'land',quantity:97},{id:'ringA',cardId:'ring',quantity:1},{id:'stoneA',cardId:'stone',quantity:1}]});run('finalize',{deckId:'A'});
  run('createDeck',{deckId:'B',name:'Deck B',commanders:['leader'],slots:[{id:'cmdB',cardId:'leader',quantity:1},{id:'landB',cardId:'land',quantity:98},{id:'ringB',cardId:'ring',quantity:1}]});run('finalize',{deckId:'B'});
  run('createDeck',{deckId:'C',name:'Draft C',commanders:['leader'],slots:[{id:'cmdC',cardId:'leader',quantity:1}]});
  const A=()=>M.readiness(s,M.deck(s,'A')),B=()=>M.readiness(s,M.deck(s,'B'));
  run('acquire',{lot:{id:'g1',cardId:'gem',quantity:1}});
  expectFailure('place',{lotId:'g1',deckId:'A',quantity:1},/as a substitute/);
  expectFailure('place',{lotId:'g1',deckId:'C',quantity:1,asStandIn:true},/Finalize/);
  run('place',{lotId:'g1',deckId:'A',quantity:1,asStandIn:true});
  {const l=M.lot(s,'g1');assert.equal(l.location.deckId,'A');assert.equal(l.allocation,null);const r=A();assert.deepEqual([r.inBox,r.standIns,r.covered,r.surplus,r.swapReady,r.remove,r.sleeved,r.playable],[0,1,1,0,0,0,1,false]);checks+=3;
   const row=M.projection(s).find(x=>x.recordId==='g1');assert.equal(row.placement,'Substitute');assert.equal(row.standIn,true);assert.equal(row.standInDeckId,'A');assert.equal(row.physical,'Physical deck');checks+=4;
   const m=M.matrix(s),x=m.rows.find(x=>x.cardId==='gem');assert.deepEqual([x.own,x.inBox,x.subs,x.bench,x.perDeck.A.sub,x.perDeck.B.sub,m.totals.A.sub],[1,0,1,0,1,0,1]);checks++;}
  // A real copy arriving on the bench makes the substitute swappable; putting it in leaves the
  // substitute covering another empty seat.
  run('acquire',{lot:{id:'r1',cardId:'ring',quantity:1}});run('fulfill',{deckId:'A'});
  assert.deepEqual([A().pullFromBench,A().swapReady,A().remove],[1,1,1],'a reserved copy on the bench can take the substitute\'s seat');checks++;
  run('place',{lotId:'r1',deckId:'A',quantity:1});assert.deepEqual([A().inBox,A().standIns,A().swapReady,A().remove,A().sleeved],[1,1,0,0,2]);checks++;
  // The list grows to want a card already standing in: that copy is reserved where it sits.
  run('acquire',{lot:{id:'l97',cardId:'land',quantity:97}});run('fulfill',{deckId:'A'});run('bulk',{op:'place',deckId:'A',lotIds:['l97'],confirmed:true});
  run('acquire',{lot:{id:'l1',cardId:'land',quantity:1}});run('place',{lotId:'l1',deckId:'A',quantity:1,asStandIn:true});
  assert.deepEqual([A().inBox,A().standIns],[98,2],'a 98th Wastes is a substitute while the list says 97');checks++;
  run('target',{deckId:'A',cardId:'land',quantity:98});
  assert.deepEqual([A().inBox,A().standIns,M.lot(s,'l1').allocation?.deckId],[99,1,'A'],'the copy in the physical deck is the one reserved');checks++;
  // One seat still open (the list is 101 now): the substitute covers it. Every seat filled: the
  // substitute is surplus and asked out.
  run('acquire',{lot:{id:'s1',cardId:'stone',quantity:1}});run('fulfill',{deckId:'A'});run('place',{lotId:'s1',deckId:'A',quantity:1});
  {const r=A();assert.deepEqual([r.target,r.inBox,r.standIns,r.covered,r.surplus,r.remove,r.sleeved,r.playable,r.boxed],[101,100,1,1,0,0,101,true,false]);checks++;}
  run('acquire',{lot:{id:'ld',cardId:'leader',quantity:1}});run('fulfill',{deckId:'A'});run('place',{lotId:'ld',deckId:'A',quantity:1});
  {const r=A();assert.deepEqual([r.inBox,r.standIns,r.covered,r.surplus,r.swapReady,r.remove,r.sleeved,r.playable,r.boxed],[101,1,0,1,0,1,102,true,true]);checks++;}
  run('bulk',{op:'bench',lotIds:['g1'],confirmed:true});assert.deepEqual([A().standIns,A().remove,A().sleeved],[0,0,101]);checks++;
  // A copy on the bench that another deck's list calls for is reserved on the way into that
  // box, not left as a substitute; one it does not call for becomes a substitute through bulk too.
  run('acquire',{lot:{id:'r2',cardId:'ring',quantity:1}});expectFailure('bulk',{op:'place',deckId:'B',lotIds:['r2']},/not reserved for Deck B/);
  run('bulk',{op:'place',deckId:'B',lotIds:['r2'],asStandIn:true});assert.equal(M.lot(s,'r2').allocation?.slotId,'ringB','the list wanted it, so it is a real copy');assert.equal(B().inBox,1);checks+=2;
  run('bulk',{op:'place',deckId:'B',lotIds:['g1'],asStandIn:true});assert.deepEqual([M.lot(s,'g1').location.deckId,M.lot(s,'g1').allocation,B().standIns],['B',null,1]);checks++;
  {const m2=M.matrix(s),x=m2.rows.find(x=>x.cardId==='gem');assert.deepEqual([x.perDeck.A.sub,x.perDeck.B.sub,m2.totals.A.sub,m2.totals.B.sub,x.bench],[0,1,0,1,0]);checks++;}
  M.validate(s);checks++;
  s=saved;
}
// THE A COLUMN IS THE BOX. Typed on the spreadsheet, A is how many copies are physically in the
// deck: real copies up to the list's count, substitutes beyond it, all of them substitutes
// when the list does not name the card. Lowering takes substitutes out first; raising fills real
// seats first, then stands copies in from the bench, from other boxes, then newly recorded.
{
  const saved=s;s=M.empty();
  run('cards',{cards:[...cards,{id:'gem',name:'Fellwar Stone',typeLine:'Artifact',verified:true,colorIdentity:[],legalities:{commander:'legal'}}]});
  run('createDeck',{deckId:'A',name:'Deck A',commanders:['leader'],slots:[{id:'cmdA',cardId:'leader',quantity:1},{id:'landA',cardId:'land',quantity:97},{id:'ringA',cardId:'ring',quantity:1},{id:'stoneA',cardId:'stone',quantity:1}]});run('finalize',{deckId:'A'});
  run('createDeck',{deckId:'B',name:'Deck B',commanders:['leader'],slots:[{id:'cmdB',cardId:'leader',quantity:1},{id:'landB',cardId:'land',quantity:98},{id:'ringB',cardId:'ring',quantity:1}]});run('finalize',{deckId:'B'});
  const cell=(cid,did)=>M.matrix(s).rows.find(r=>r.cardId===cid).perDeck[did],rowOf=cid=>M.matrix(s).rows.find(r=>r.cardId===cid),A=()=>M.readiness(s,M.deck(s,'A'));
  // Not in the list: A typed to 1 stands a free copy in; no review, nothing reserved.
  run('acquire',{lot:{id:'g',cardId:'gem',quantity:2}});
  {const p=M.plan(s,{cardId:'gem',column:'boxed',deckId:'A',value:1});assert.deepEqual([p.command.type,p.command.asStandIn,p.review],['place',true,false]);assert.ok(p.notes.some(n=>/not in Deck A's list, so it is a substitute for a missing card/.test(n)),p.notes.join(' | '));checks+=2;
   run(p.command.type,p.command);assert.deepEqual([cell('gem','A').boxed,cell('gem','A').sub,rowOf('gem').bench,A().standIns],[0,1,1,1]);checks++;}
  // Above what exists: the last free copy, then a newly owned one recorded straight into the box.
  {const p=M.plan(s,{cardId:'gem',column:'boxed',deckId:'A',value:3});assert.deepEqual(p.command.commands.map(c=>c.type),['place','acquire']);assert.equal(p.command.commands[1].lot.location.deckId,'A');assert.equal(p.review,true);assert.ok(p.notes.some(n=>/1 copy is recorded as newly owned, straight into Deck A/.test(n)),p.notes.join(' | '));checks+=4;
   run('batch',p.command);assert.deepEqual([cell('gem','A').sub,rowOf('gem').own,rowOf('gem').bench,s.lots.filter(l=>l.cardId==='gem').length],[3,3,0,3],'the recorded copy is its own lot in the physical deck, not merged onto the bench');checks++;}
  // Lowering: substitutes go back to the bench.
  {const p=M.plan(s,{cardId:'gem',column:'boxed',deckId:'A',value:1});assert.ok(p.command.type==='batch'||p.command.type==='place');assert.ok(p.notes.some(n=>/2 substitutes of Fellwar Stone go back to the bench/.test(n)),p.notes.join(' | '));checks+=2;
   run(p.command.type,p.command);assert.deepEqual([cell('gem','A').sub,rowOf('gem').bench,A().standIns],[1,2,1]);checks++;}
  // In the list: real seats first, extras are substitutes; lowering benches substitutes before real copies.
  run('acquire',{lot:{id:'l',cardId:'land',quantity:97}});run('fulfill',{deckId:'A'});run('bulk',{op:'place',deckId:'A',lotIds:['l'],confirmed:true});
  {const p=M.plan(s,{cardId:'land',column:'boxed',deckId:'A',value:99});assert.equal(p.command.type,'acquire');assert.equal(p.command.lot.quantity,2);assert.ok(p.notes.some(n=>/The list wants 97; the extra 2 are substitutes/.test(n)),p.notes.join(' | '));checks+=3;
   run(p.command.type,p.command);assert.deepEqual([cell('land','A').boxed,cell('land','A').sub,A().inBox,A().standIns,A().sleeved],[97,2,97,3,100]);checks++;}
  {const p=M.plan(s,{cardId:'land',column:'boxed',deckId:'A',value:96});assert.deepEqual(p.command.commands.map(c=>c.type),['assign','place']);assert.ok(p.notes.some(n=>/1 copy comes out of the physical deck to the bench, still reserved/.test(n)));checks+=2;
   run('batch',p.command);assert.deepEqual([cell('land','A').boxed,cell('land','A').sub,A().pullFromBench,A().standIns],[96,0,1,1]);checks++;}
  // From another box: a substitute in B moves to A, still a substitute.
  run('bulk',{op:'place',deckId:'B',lotIds:[s.lots.find(l=>l.cardId==='gem'&&l.location?.kind==='bench').id],asStandIn:true,confirmed:true});
  {const p=M.plan(s,{cardId:'gem',column:'boxed',deckId:'A',value:3});assert.ok(p.notes.some(n=>/moves from Deck B/.test(n)),p.notes.join(' | '));assert.equal(p.review,true);checks+=2;
   run(p.command.type,p.command);assert.deepEqual([cell('gem','A').sub,cell('gem','B').sub],[3,0]);checks++;}
  assert.deepEqual(M.plan(s,{cardId:'gem',column:'boxed',deckId:'A',value:3}),{command:null,review:false,notes:['No change.']});checks++;
  M.validate(s);checks++;
  s=saved;
}
// REPORTS CARRY THEIR HUNDRED, and a hundred becomes a deck. A report filed with a list keeps
// it; a planned entry added from it keeps its note and counts as Watched; and creating a deck
// from the list, finalizing it and copying the report over it is one batch.
{
  const saved=s;s=M.empty();run('cards',{cards});
  run('createDeck',{deckId:'A',name:'Deck A',commanders:['leader'],slots:[{id:'cmdA',cardId:'leader',quantity:1},{id:'landA',cardId:'land',quantity:98},{id:'ringA',cardId:'ring',quantity:1}]});run('finalize',{deckId:'A'});
  const list=[{cardId:'leader',quantity:1},{cardId:'land',quantity:97},{cardId:'ring',quantity:1},{cardId:'stone',quantity:1}];
  run('report',{deckId:'A',report:{kind:'report',origin:'measured',protocol:'published',deckFingerprint:'fp-of-the-measured-list',metrics:{score:{value:50}},list,commanders:['leader'],sourceDeckId:'A'}});
  const r=s.reports[0];assert.deepEqual(r.list,list);assert.equal(r.sourceDeckId,'A');assert.equal(r.origin,'measured');checks+=3;
  const gid=M.deck(s,'A').groupId;
  run('groupEntries',{groupId:gid,cards:[cards.find(c=>c.id==='stone')],entries:[{cardId:'stone',quantity:1,notes:"Watched from the simulation of 2026-09-13: in the measured hundred, not in Deck A's list."}]});
  const g=s.groups.find(x=>x.id===gid);assert.equal(g.entries.length,1);assert.match(g.entries[0].notes,/Watched from the simulation/);assert.equal(M.readiness(s,M.deck(s,'A')).watched,1);assert.equal(M.counters(s).owned,0,'a planned card is not a copy');checks+=4;
  run('batch',{commands:[{type:'createDeck',deckId:'B',name:'Deck A · 50 pts',commanders:['leader'],cards:[],slots:list.map(x=>({...x,purpose:'main'})),definition:M.deck(s,'A').definition},{type:'finalize',deckId:'B'},{type:'report',deckId:'B',report:{...r,id:undefined,deckId:undefined,importedAt:undefined,spunOffFrom:{deckId:'A',reportId:r.id}}}]});
  const b=M.deck(s,'B');assert.equal(b.status,'final');assert.equal(b.slots.reduce((n,x)=>n+x.quantity,0),100);const copy=s.reports.find(x=>x.deckId==='B');assert.equal(copy.spunOffFrom.reportId,r.id);assert.equal(copy.origin,'measured');assert.notEqual(copy.id,r.id);assert.equal(M.deck(s,'A').status,'final');checks+=6;
  s=saved;
}
/* OWNED AGAINST WANTED (Rob, 14 September): the pair the Cards table's Ownership column and
   the Tabletop's stage caption both print. Held to the committed live library, where the
   answer is checkable by hand: a commander in its box is 1/1, a card still on the buy list
   is 0/1, and a card no list calls for wants nothing. */
{
  const live = JSON.parse(readFileSync(new URL("../data/live-state.json", import.meta.url), "utf8")).payload.state;
  const d = live.decks.find((x) => x.status === "final" && !x.archived);
  const commander = M.ownership(live, d.commanders[0], d.id);
  assert.deepEqual(commander, {owned: 1, wanted: 1}, `${d.name}: its commander is owned and wanted once`); checks++;
  /* Every main slot of every final deck: wanted is what the list asks, owned never exceeds it. */
  for (const deck of live.decks.filter((x) => x.status === "final" && !x.archived)) {
    const want = new Map();
    for (const r of deck.slots) if (r.purpose === "main") want.set(r.cardId, (want.get(r.cardId) || 0) + r.quantity);
    for (const [cardId, n] of want) {
      const o = M.ownership(live, cardId, deck.id);
      assert.equal(o.wanted, n, `${deck.name}: the list's own count for ${cardId}`);
      assert.ok(o.owned <= o.wanted, `${deck.name}: ${cardId} reads ${o.owned}/${o.wanted}, never more owned than wanted`);
    }
    checks++;
    /* What the deck still needs reads 0 owned of what it wants, which is the "0/1" on the stage. */
    const need = M.projection(live).find((r) => r.kind === "need" && r.deckId === deck.id);
    if (need) { const o = M.ownership(live, need.cardId, deck.id); assert.equal(o.owned, 0, `${deck.name}: a To buy card is owned none`); assert.ok(o.wanted >= 1); checks++; }
  }
  /* Without a deck the question is the library's: every deck's call, every owned copy. */
  const anyCard = d.slots.find((r) => r.purpose === "main").cardId;
  const all = M.ownership(live, anyCard, ""), one = M.ownership(live, anyCard, d.id);
  assert.ok(all.wanted >= one.wanted && all.owned >= one.owned, "the library's pair covers the deck's"); checks++;
  assert.deepEqual(M.ownership(live, "card:not-a-card", ""), {owned: 0, wanted: 0}, "a card nothing holds and no list wants"); checks++;
}
/* WATCHED, EXPANDED (Rob, 14 September; play-space plan §2.2): a card you are considering for a
   deck is one filed in that deck's collection group, reserving nothing and moving nothing —
   whether or not you own a copy. The category is a definition over the group mechanism that was
   already there, so what it must NOT do is move anything that is committed, and what it must not
   cost is a single status in the library as it stands. Both are asserted here. */
{
  let w = M.empty();
  const put = (type, args = {}) => { w = M.apply(w, {type, id: "watched" + (++serial), at: "2026-09-14T00:00:00Z", ...args}).state; };
  put("cards", {cards});
  put("createDeck", {deckId: "wd", name: "The watched deck", commanders: ["leader"],
    slots: [{id: "wcmd", cardId: "leader", quantity: 1}, {id: "wland", cardId: "land", quantity: 98}, {id: "wring", cardId: "ring", quantity: 1}]});
  put("finalize", {deckId: "wd"});
  const deck = M.deck(w, "wd");
  assert.ok(deck.groupId, "a deck owns a collection group"); checks++;

  /* Four copies of one card, each put in a different place, then all four filed in the deck's
     group. Only the free one is Watched; a reservation, a box and a physical deck each win. */
  put("acquire", {lot: {id: "free", cardId: "ring", quantity: 1}});
  put("acquire", {lot: {id: "held", cardId: "ring", quantity: 1, printing: {set: "a", finish: "nonfoil"}}, deckId: "wd", slotId: "wring"});
  put("acquire", {lot: {id: "boxed", cardId: "ring", quantity: 1, printing: {set: "b", finish: "nonfoil"}}});
  put("place", {lotId: "boxed", deckId: "wd", asStandIn: true});
  put("groupLots", {groupId: deck.groupId, lotIds: ["free", "held", "boxed"]});

  const by = Object.fromEntries(M.projection(w).filter((r) => r.kind === "lot").map((r) => [r.id, r]));
  assert.equal(M.statusOf(by.free), "Watched", "a free owned copy filed in the deck's group reads as Watched"); checks++;
  assert.equal(by.free.shortlistedFor, "wd", "and names the deck that shortlisted it"); checks++;
  assert.equal(M.statusOf(by.held), "Reserved", "a reservation is a commitment and still wins"); checks++;
  assert.equal(M.statusOf(by.boxed), "Substitute", "a copy in the box still wins"); checks++;
  assert.equal(by.held.shortlistedFor, "", "a committed copy is not a shortlist"); checks++;
  assert.equal(by.boxed.shortlistedFor, "", "nor is one in a box"); checks++;

  /* It reserves nothing and moves nothing: the deck's own progress is untouched. */
  const r = M.readiness(w, M.deck(w, "wd"));
  assert.equal(r.owned, 1, "only the reserved copy counts toward the hundred"); checks++;
  assert.ok(r.watched >= 1, "and the free one is counted as watched for the deck"); checks++;

  /* Moving it out of the deck's group takes the status back, and a group that belongs to no deck
     is not a shortlist — so Bench stays Bench. Nothing but the membership was ever written. */
  const before = JSON.stringify(w.lots.find((l) => l.id === "free"));
  put("createGroup", {groupId: "plain", name: "Just a group"});
  put("groupLots", {groupId: "plain", lotIds: ["free"], moveFrom: deck.groupId});
  const after = M.projection(w).find((x) => x.id === "free");
  assert.equal(M.statusOf(after), "Bench", "filed in a group that is not a deck's, it is a Bench copy again"); checks++;
  assert.equal(after.shortlistedFor, "", "and no deck has shortlisted it"); checks++;
  const strip = (t) => t.replace(/"groupIds":\[[^\]]*\]/, "G");
  assert.equal(strip(JSON.stringify(w.lots.find((l) => l.id === "free"))), strip(before),
    "nothing but its group membership ever changed"); checks++;
}

/* AND IT COSTS NOTHING ON THE DAY IT SHIPS. The live library's owned Bench rows sit in no deck
   group at all, so not one card changes status. If that ever stops being true the number below
   moves and this check says so, rather than a status quietly changing under Rob. */
{
  const live = JSON.parse(readFileSync(new URL("../data/live-state.json", import.meta.url), "utf8")).payload.state;
  const shortlisted = M.projection(live).filter((r) => r.shortlistedFor);
  assert.equal(shortlisted.length, 0,
    `the live library has ${shortlisted.length} owned copies shortlisted for a deck; it had 0 when Watched was expanded`); checks++;
}

console.log(`collection-model: ${checks} checks passed; planned cards never become owned without acquisition, and Watched covers a card you own.`);
