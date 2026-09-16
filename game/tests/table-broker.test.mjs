import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {createTable} from '../contracts/table-lifecycle.mjs';
import {TableBroker} from '../server/table-broker.mjs';

const base=()=>createTable({tableId:'table-one',seats:[{seatId:0,kind:'human',name:'Host',occupied:true},{seatId:1,kind:'human',name:'Friend'},{seatId:2,kind:'ai',name:'AI'}]});
const deck=id=>({id,validated:true,commander:'Chulane',snapshot:{cards:100}});

test('invite redemption is durable, single-use and authorizes only the claimed private seat',async()=>{
  let now=100,file=resolve(mkdtempSync(resolve(tmpdir(),'crankmagic-broker-')),'table.json'),seen=[];
  const table=base();table.seats[0].deckVersion='host-v1';table.seats[0].ready=true;table.seats[2].deckVersion='ai-v1';table.seats[2].ready=true;
  const resolveDeck=async(_member,input)=>input.deckVersion;
  let activeMatch;const broker=new TableBroker({file,table,clock:()=>now,resolveDeck,launch:async({matchId})=>(activeMatch=matchId),bridge:async(seat,op)=>{seen.push([seat,op]);return {viewerSeatId:seat,viewerPlayerId:seat};}});
  const issued=broker.invite(1),joined=await broker.join({...issued,invite:issued.invite,seatId:1});assert.equal(joined.seatId,1);await assert.rejects(broker.join({...issued,invite:issued.invite,seatId:1}));
  const member=await broker.authenticate(joined.capability);await broker.deck(member,{deckVersion:deck('friend-v1')});await broker.ready(member,{ready:true});await broker.beginCountdown();now+=5000;await broker.tick();await broker.processOutbox();
  assert.equal((await broker.view(member)).viewerSeatId,1);assert.deepEqual(seen,[[1,'view']]);
  const reloaded=new TableBroker({file,table,clock:()=>now,resolveDeck,bridge:async seat=>({viewerSeatId:seat,viewerPlayerId:seat})});assert.equal((await reloaded.authenticate(joined.capability)).seatId,1);
  const disk=readFileSync(file,'utf8');assert.ok(!disk.includes(issued.invite));assert.ok(!disk.includes(joined.capability));
});

test('deck readiness, countdown and launch outbox survive reload without duplicate engines',async()=>{
  let now=100,launches=0,file=resolve(mkdtempSync(resolve(tmpdir(),'crankmagic-outbox-')),'table.json');
  const table=base();table.seats[0].deckVersion='host-v1';table.seats[0].ready=true;table.seats[2].deckVersion='ai-v1';table.seats[2].ready=true;
  const resolveDeck=async(_member,input)=>input.deckVersion;let expectedMatch;
  let broker=new TableBroker({file,table,clock:()=>now,bridge:async()=>({}),resolveDeck,launch:async({matchId})=>{launches++;return expectedMatch=matchId;}}),invite=broker.invite(1),session=await broker.join({...invite,seatId:1});let member=await broker.authenticate(session.capability);
  await broker.deck(member,{deckVersion:deck('friend-v1')});await broker.ready(member,{ready:true});await broker.beginCountdown();now+=5000;await broker.tick();
  broker=new TableBroker({file,table:base(),clock:()=>now,bridge:async()=>({}),resolveDeck,launch:async({matchId})=>{launches++;return expectedMatch=matchId;}});assert.equal(await broker.processOutbox(),expectedMatch);assert.equal(await broker.processOutbox(),null);assert.equal(launches,1);assert.equal(broker.hostView().phase,'playing');
});

test('a launch marked running before a broker restart resumes the same persisted match command',async()=>{
  let now=0,launches=0,file=resolve(mkdtempSync(resolve(tmpdir(),'crankmagic-running-')),'table.json'),table=base();for(const seat of table.seats){seat.occupied=true;seat.connected=true;seat.deckVersion='deck-'+seat.seatId;seat.ready=true;}
  let broker=new TableBroker({file,table,clock:()=>now,bridge:async()=>({}),launch:async({matchId})=>matchId});await broker.beginCountdown();now=5000;await broker.tick();const saved=JSON.parse(readFileSync(file));saved.outbox[0].status='running';writeFileSync(file,JSON.stringify(saved));const expected=saved.outbox[0].matchId;
  broker=new TableBroker({file,table,clock:()=>now,bridge:async()=>({}),launch:async({matchId})=>{launches++;return matchId;}});assert.equal(await broker.processOutbox(),expected);assert.equal(launches,1);assert.equal(broker.hostView().matchId,expected);
});

test('client claimed validation and client supplied seat identities are rejected',async()=>{
  const file=resolve(mkdtempSync(resolve(tmpdir(),'crankmagic-authority-')),'table.json'),table=base();
  const broker=new TableBroker({file,table,bridge:async()=>({}),resolveDeck:async()=>{throw Error('Deck did not pass host validation');}}),invite=broker.invite(1),session=await broker.join({...invite,seatId:0}),member=await broker.authenticate(session.capability);
  await assert.rejects(broker.deck(member,{deckVersion:deck('forged')}),/host validation/);
  const activeFile=resolve(mkdtempSync(resolve(tmpdir(),'crankmagic-action-')),'table.json'),activeTable=base();activeTable.seats[0].deckVersion='host-v1';activeTable.seats[0].ready=true;activeTable.seats[2].deckVersion='ai-v1';activeTable.seats[2].ready=true;
  const active=new TableBroker({file:activeFile,table:activeTable,clock:()=>0,resolveDeck:async(_member,input)=>input.deckVersion,launch:async({matchId})=>matchId,bridge:async()=>({})}),activeInvite=active.invite(1),activeSession=await active.join({...activeInvite}),activeMember=await active.authenticate(activeSession.capability);
  await active.deck(activeMember,{deckVersion:deck('friend')});await active.ready(activeMember,{ready:true});await active.beginCountdown();await assert.rejects(active.tick(),/completed/);
  const delayed=new TableBroker({file:activeFile,table:activeTable,clock:()=>5000,resolveDeck:async(_member,input)=>input.deckVersion,launch:async({matchId})=>matchId,bridge:async()=>({})});await delayed.tick();await delayed.processOutbox();const delayedMember=await delayed.authenticate(activeSession.capability),delayedMatch=delayed.hostView().matchId;
  await assert.rejects(delayed.action(delayedMember,{matchId:delayedMatch,actionId:'one',seatId:0}),/Unknown action field/);
  await assert.rejects(delayed.action(delayedMember,{matchId:'match-one',actionId:'one',revision:1,kind:'ok'}),/Invalid action envelope/);
});

test('disconnect, reconnect, grace expiry and release rotate membership authorization',async()=>{
  let now=0,file=resolve(mkdtempSync(resolve(tmpdir(),'crankmagic-presence-')),'table.json'),broker=new TableBroker({file,table:base(),clock:()=>now,bridge:async()=>({})});
  const invite=broker.invite(1),session=await broker.join({...invite,seatId:1}),member=await broker.authenticate(session.capability);now=30000;await broker.disconnectExpired();assert.equal(broker.hostView().seats[1].connected,false);
  now=80000;await broker.heartbeat(member);assert.equal(broker.hostView().seats[1].connected,true);now=110000;await broker.disconnectExpired();now=170000;await broker.disconnectExpired();assert.equal(broker.hostView().seats[1].occupied,false);await assert.rejects(broker.authenticate(session.capability));
});
test('leaving an active game concedes only the authenticated engine seat and revokes it',async()=>{
  let now=0,file=resolve(mkdtempSync(resolve(tmpdir(),'crankmagic-concede-')),'table.json'),calls=[],table=base();table.seats[0].deckVersion='host';table.seats[0].ready=true;table.seats[2].deckVersion='ai';table.seats[2].ready=true;
  const broker=new TableBroker({file,table,clock:()=>now,resolveDeck:async(member)=>deck('human-'+member.seatId),bridge:async(seat,operation)=>{calls.push([seat,operation]);return {accepted:true};},launch:async({matchId})=>matchId});
  const invite=broker.invite(1),session=await broker.join(invite),member=await broker.authenticate(session.capability);await broker.deck(member,{});await broker.ready(member,{ready:true});await broker.beginCountdown();now=5000;await broker.tick();await broker.processOutbox();
  const result=await broker.exit(member);assert.equal(result.conceded,true);assert.deepEqual(calls,[[1,'concede']]);assert.equal(broker.hostView().seats[1].occupied,false);await assert.rejects(broker.authenticate(session.capability));
});

test('completed feedback is durable, scoped to the authenticated seat and tied to the match deck version',async()=>{
  let now=0,file=resolve(mkdtempSync(resolve(tmpdir(),'crankmagic-feedback-')),'table.json'),table=base();for(const seat of table.seats){seat.occupied=true;seat.connected=true;seat.deckVersion='deck-'+seat.seatId;seat.ready=true;}
  const report=async(seatId,matchId)=>({schema:'CrankMagicOnlineMatchReport@1',seatId,matchId});
  let broker=new TableBroker({file,table,clock:()=>now,bridge:async seat=>({viewerSeatId:seat,viewerPlayerId:seat}),launch:async({matchId})=>matchId,report});await broker.beginCountdown();now=5000;await broker.tick();await broker.processOutbox();const matchId=broker.hostView().matchId;await broker.complete(matchId);
  assert.equal((await broker.report({seatId:0})).seatId,0);
  const accepted=await broker.feedback({seatId:0},{matchId,rating:4,deckRating:3,experienceRating:5,notes:'Useful match.'});assert.equal(accepted.complete,false);assert.deepEqual(accepted.receivedSeatIds,[0]);
  broker=new TableBroker({file,table,clock:()=>now,bridge:async()=>({}),report});assert.equal((await broker.table({seatId:0})).feedbackReceived,true);
  const stored=JSON.parse(readFileSync(file));assert.equal(stored.feedback[0].deckVersion,'deck-0');assert.equal(stored.feedback[0].notes,'Useful match.');
  await assert.rejects(broker.feedback({seatId:0},{matchId:'wrong',rating:4,notes:''}),/Invalid/);
});
