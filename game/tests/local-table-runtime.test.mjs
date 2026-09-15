import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {createLocalTableRuntime,restoreLocalTableRuntime} from '../server/local-table-runtime.mjs';

const prepared=(seatId,kind,name)=>({seatId,kind,name,engineController:kind==='human'?'browser':'native-ai',playmat:'runic-cube',playmatChoice:'runic-cube',deck:{gameplayHash:`deck-${seatId}`,commanders:[{name:`Commander ${seatId}`}],library:Array.from({length:99},(_,i)=>({name:`Card ${seatId}-${i}`}))},mechanics:{hash:`mechanics-${seatId}`,cards:[]},pilot:{kind:kind==='ai'?'forge-native':'human'}});
const lobby=()=>({schema:'CommanderLobbyPack@1',capturedAt:'2026-09-15T00:00:00.000Z',seed:123,settings:{bracket:3,maxCost:225,humans:2,ais:1,seats:[{seatId:0,kind:'human',name:'Host'},{seatId:1,kind:'human',name:'Friend'},{seatId:2,kind:'ai',name:'AI'}]},seats:[prepared(0,'human','Host'),prepared(2,'ai','AI')],reservedHumanSeats:[{seatId:1,name:'Friend'}]});

test('mixed lobby joins, validates its own deck, counts down once and routes its private view',async t=>{
  let now=100,launches=0,launchedPod,engine={status:'idle'};
  const runtime=createLocalTableRuntime({directory:resolve(mkdtempSync(resolve(tmpdir(),'crankmagic-runtime-')),'tables'),lobby:lobby(),clock:()=>now,status:()=>engine,
    bridge:async(seat,operation)=>({viewerSeatId:seat,viewerPlayerId:seat,operation}),
    launch:async pod=>{launches++;launchedPod=pod;engine={status:'playing',matchId:pod.matchId};},
    resolveGuestDeck:async member=>({id:'guest-deck-v1',validated:true,commander:'Guest Commander',snapshot:prepared(member.seatId,'human','Friend'),deckHash:'guest-deck',createdAt:'2026-09-15T00:00:00.000Z'})});
  t.after(()=>runtime.close());
  assert.equal(runtime.view().seats[0].ready,false);assert.equal(runtime.view().seats[2].ready,true);
  const invite=runtime.invite(1),session=await runtime.guest.join(invite),member=await runtime.guest.authenticate(session.capability);
  await runtime.guest.deck(member,{source:'upload'});await runtime.ready(true);await runtime.guest.ready(member,{ready:true});
  assert.equal(runtime.view().phase,'countdown');assert.equal(runtime.view().countdownAt,10100);
  now=10100;await runtime.poll();await runtime.poll();assert.equal(runtime.view().phase,'playing');assert.equal(launches,1);assert.equal(launchedPod.seats.length,3);assert.equal(launchedPod.seats[1].seatId,1);
  assert.equal((await runtime.guest.view(member)).viewerSeatId,1);
});

test('unanimous rematch keeps capabilities and prior deck versions while clearing readiness',async t=>{
  let now=0,matchId,engine={status:'idle'};
  const runtime=createLocalTableRuntime({directory:resolve(mkdtempSync(resolve(tmpdir(),'crankmagic-rematch-')),'tables'),lobby:lobby(),clock:()=>now,status:()=>engine,bridge:async seat=>({viewerSeatId:seat,viewerPlayerId:seat}),launch:async pod=>{matchId=pod.matchId;engine={status:'playing',matchId};},resolveGuestDeck:async member=>({id:member.seatId?'guest-deck-v1':'host-deck-v2',validated:true,commander:member.seatId?'Guest Commander':'New Host Commander',snapshot:prepared(member.seatId,'human',member.seatId?'Friend':'Host')})});
  t.after(()=>runtime.close());const invitation=runtime.invite(1),session=await runtime.guest.join(invitation),member=await runtime.guest.authenticate(session.capability);
  await runtime.guest.deck(member,{});await runtime.ready(true);await runtime.guest.ready(member,{ready:true});now=10000;await runtime.poll();await runtime.broker.complete(matchId);
  let value=await runtime.guest.rematch(member,{accept:true});assert.equal(value.table.phase,'rematch');assert.equal(value.table.seats[1].rematch,true);
  await runtime.broker.rematch({seatId:0},{accept:true});value=await runtime.guest.table(member);assert.equal(value.table.phase,'selecting');assert.equal(value.table.seats[1].deckVersion,'guest-deck-v1');assert.equal(value.table.seats[1].ready,false);assert.equal((await runtime.guest.authenticate(session.capability)).seatId,1);
  const hostDeck=await runtime.deck({source:'library'});assert.equal(hostDeck.table.seats[0].deckVersion,'host-deck-v2');assert.equal(hostDeck.table.seats[1].deckVersion,undefined);assert.equal(runtime.view().seats[1].deckVersion,'guest-deck-v1');
});

test('local table membership and private capabilities survive a host service restart',async t=>{
  const directory=resolve(mkdtempSync(resolve(tmpdir(),'crankmagic-restore-')),'tables'),options={directory,lobby:lobby(),bridge:async seat=>({viewerSeatId:seat,viewerPlayerId:seat}),launch:async()=>{},status:()=>({status:'idle'}),resolveGuestDeck:async member=>({id:'guest-deck-v1',validated:true,commander:'Guest Commander',snapshot:prepared(member.seatId,'human','Friend')})};
  const first=createLocalTableRuntime(options),invitation=first.invite(1),session=await first.guest.join(invitation);await first.guest.deck(await first.guest.authenticate(session.capability),{});first.close();
  const restored=restoreLocalTableRuntime({...options,lobby:undefined});t.after(()=>restored.close());assert.ok(restored);const member=await restored.guest.authenticate(session.capability);assert.equal(member.seatId,1);assert.equal(restored.view().seats[1].deckVersion,'guest-deck-v1');
});

test('an active table restores its exact launch pack and can rearm API pilots after key re-entry',async t=>{
  let now=0,engine={status:'idle'},armed=[];const directory=resolve(mkdtempSync(resolve(tmpdir(),'crankmagic-pilot-restore-')),'tables');
  const options={directory,lobby:lobby(),clock:()=>now,status:()=>engine,bridge:async seat=>({viewerSeatId:seat,viewerPlayerId:seat}),launch:async pod=>{engine={status:'playing',matchId:pod.matchId};},createPilots:pod=>{armed.push(pod);return {stop(){},status(){return [{seatId:2}]}};},resolveGuestDeck:async member=>({id:'guest-deck-v1',validated:true,commander:'Guest Commander',snapshot:prepared(member.seatId,'human','Friend')})};
  const first=createLocalTableRuntime(options),invitation=first.invite(1),session=await first.guest.join(invitation),member=await first.guest.authenticate(session.capability);await first.guest.deck(member,{});await first.ready(true);await first.guest.ready(member,{ready:true});now=10000;await first.poll();assert.equal(first.view().phase,'playing');const matchId=first.view().matchId;first.close();
  const restored=restoreLocalTableRuntime({...options,lobby:undefined});t.after(()=>restored.close());assert.ok(restored);assert.deepEqual(restored.armPilots(),[{seatId:2}]);assert.equal(armed.at(-1).matchId,matchId);assert.equal(armed.at(-1).seats[1].seatId,1);
});
