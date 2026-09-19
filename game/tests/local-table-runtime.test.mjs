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
  // Remaining on /play is presence even after the lobby heartbeat stops.
  for(let second=15;second<=135;second+=15){now=second*1000;await runtime.guest.view(member);assert.equal(runtime.view().seats[1].connected,true);}
  assert.equal((await runtime.guest.authenticate(session.capability)).seatId,1);
  // Closing that tab still allows the normal disconnect/release policy to run.
  now+=31000;await runtime.poll();assert.equal(runtime.view().seats[1].connected,false);
});

test('unanimous rematch keeps capabilities and prior deck versions while clearing readiness',async t=>{
  let now=0,matchId,engine={status:'idle'};
  const runtime=createLocalTableRuntime({directory:resolve(mkdtempSync(resolve(tmpdir(),'crankmagic-rematch-')),'tables'),lobby:lobby(),clock:()=>now,status:()=>engine,bridge:async seat=>({viewerSeatId:seat,viewerPlayerId:seat}),launch:async pod=>{matchId=pod.matchId;engine={status:'playing',matchId};},resolveGuestDeck:async member=>({id:member.seatId?'guest-deck-v1':'host-deck-v2',validated:true,commander:member.seatId?'Guest Commander':'New Host Commander',snapshot:prepared(member.seatId,'human',member.seatId?'Friend':'Host')})});
  t.after(()=>runtime.close());const invitation=runtime.invite(1),session=await runtime.guest.join(invitation),member=await runtime.guest.authenticate(session.capability);
  await runtime.guest.deck(member,{});await runtime.ready(true);await runtime.guest.ready(member,{ready:true});now=11000;await runtime.poll();await runtime.broker.complete(matchId);
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
  const first=createLocalTableRuntime(options),invitation=first.invite(1),session=await first.guest.join(invitation),member=await first.guest.authenticate(session.capability);await first.guest.deck(member,{});await first.ready(true);await first.guest.ready(member,{ready:true});now=11000;await first.poll();assert.equal(first.view().phase,'playing');const matchId=first.view().matchId;first.close();
  const restored=restoreLocalTableRuntime({...options,lobby:undefined});t.after(()=>restored.close());assert.ok(restored);assert.deepEqual(restored.armPilots(),[{seatId:2}]);assert.equal(armed.at(-1).matchId,matchId);assert.equal(armed.at(-1).seats[1].seatId,1);
});

/* Force Prompt is the host's lever for an AI that has stopped moving, and it reached only the solo
 * runner: on a lobby table -- the one shape with other people sitting at it -- it answered that no
 * API-controlled AI was running, however stuck the seat was. The table runtime carries its own
 * pilots, so it has to be able to prompt them. */
test('the host can prompt a stuck AI seat at a multiplayer table',async t=>{
  let now=0,engine={status:'idle'};const nudged=[];
  const runtime=createLocalTableRuntime({directory:resolve(mkdtempSync(resolve(tmpdir(),'crankmagic-nudge-')),'tables'),
    lobby:lobby(),clock:()=>now,status:()=>engine,bridge:async seat=>({viewerSeatId:seat}),
    launch:async pod=>{engine={status:'playing',matchId:pod.matchId};},
    createPilots:()=>({stop(){},status(){return [{seatId:2}];},nudge(seatId){nudged.push(seatId);return {prompted:1,waitingForForge:0};}}),
    resolveGuestDeck:async member=>({id:'guest-deck-v1',validated:true,commander:'Guest Commander',snapshot:prepared(member.seatId,'human','Friend')})});
  t.after(()=>runtime.close());

  // Before a match is running there are no pilots, and saying so is the honest answer.
  assert.throws(()=>runtime.nudge(2),/No API-controlled AI player is running at this table/);

  const invite=runtime.invite(1),session=await runtime.guest.join(invite),member=await runtime.guest.authenticate(session.capability);
  await runtime.guest.deck(member,{source:'upload'});await runtime.ready(true);await runtime.guest.ready(member,{ready:true});
  now=11000;await runtime.poll();await runtime.poll();
  assert.equal(runtime.view().phase,'playing');

  assert.deepEqual(runtime.nudge(2),{prompted:1,waitingForForge:0});
  assert.deepEqual(nudged,[2],'the named seat is the seat prompted');
  runtime.nudge(null);
  assert.deepEqual(nudged,[2,null],'no seat named prompts every running pilot');
});

/* A player who declines the rematch gives up the seat, and the session that seat was holding has
 * to die with it -- the host is about to invite somebody else into that chair. */
test('declining a rematch releases the seat and revokes its session',async t=>{
  let now=0,matchId,engine={status:'idle'};
  const runtime=createLocalTableRuntime({directory:resolve(mkdtempSync(resolve(tmpdir(),'crankmagic-decline-')),'tables'),
    lobby:lobby(),clock:()=>now,status:()=>engine,bridge:async seat=>({viewerSeatId:seat}),
    launch:async pod=>{matchId=pod.matchId;engine={status:'playing',matchId};},
    resolveGuestDeck:async member=>({id:'guest-deck-v1',validated:true,commander:'Guest Commander',snapshot:prepared(member.seatId,'human','Friend')})});
  t.after(()=>runtime.close());
  const invite=runtime.invite(1),session=await runtime.guest.join(invite),member=await runtime.guest.authenticate(session.capability);
  await runtime.guest.deck(member,{});await runtime.ready(true);await runtime.guest.ready(member,{ready:true});
  now=11000;await runtime.poll();await runtime.broker.complete(matchId);

  await runtime.guest.rematch(member,{accept:false});
  assert.equal(runtime.view().phase,'rematch','the host has not answered yet');
  await runtime.rematch(true);

  const table=runtime.view();
  assert.equal(table.phase,'selecting','one No no longer holds the table');
  assert.equal(table.seats[1].occupied,false,'the declining seat is free for the host to re-invite');
  assert.equal(table.seats[0].occupied,true);
  await assert.rejects(()=>runtime.guest.authenticate(session.capability),/Invalid seat session/,
    'the released seat must not still answer to its old capability');
});

test('a player who never answers is counted out by the deadline, not waited on forever',async t=>{
  let now=0,matchId,engine={status:'idle'};
  const runtime=createLocalTableRuntime({directory:resolve(mkdtempSync(resolve(tmpdir(),'crankmagic-silent-')),'tables'),
    lobby:lobby(),clock:()=>now,status:()=>engine,bridge:async seat=>({viewerSeatId:seat}),
    launch:async pod=>{matchId=pod.matchId;engine={status:'playing',matchId};},
    resolveGuestDeck:async member=>({id:'guest-deck-v1',validated:true,commander:'Guest Commander',snapshot:prepared(member.seatId,'human','Friend')})});
  t.after(()=>runtime.close());
  const invite=runtime.invite(1),session=await runtime.guest.join(invite),member=await runtime.guest.authenticate(session.capability);
  await runtime.guest.deck(member,{});await runtime.ready(true);await runtime.guest.ready(member,{ready:true});
  now=11000;await runtime.poll();await runtime.broker.complete(matchId);

  await runtime.rematch(true);                       // the host wants another game
  assert.equal(runtime.view().phase,'rematch','and waits, for now, on the seat that has not answered');
  now+=60000;await runtime.poll();
  assert.equal(runtime.view().phase,'rematch','a minute is not long enough to count somebody out');

  now+=61000;await runtime.poll();
  assert.equal(runtime.view().phase,'selecting','past the grace period the game goes on without them');
  assert.equal(runtime.view().seats[1].occupied,false);
});

/* Forge takes tens of seconds to come up. The countdown used to start it at zero, so the players
 * watched ten seconds of numbers and then an indeterminate blank screen. The boot and the countdown
 * now run together, and exactly one match is spawned between them. */
test('the engine boots during the countdown, not after it',async t=>{
  let now=0,engine={status:'idle'};const spawnedAt=[],spawnedMatches=[];
  const runtime=createLocalTableRuntime({directory:resolve(mkdtempSync(resolve(tmpdir(),'crankmagic-prelaunch-')),'tables'),
    lobby:lobby(),clock:()=>now,status:()=>engine,bridge:async seat=>({viewerSeatId:seat}),
    launch:async pod=>{spawnedAt.push(now);spawnedMatches.push(pod.matchId);engine={status:'starting',matchId:pod.matchId};},
    resolveGuestDeck:async member=>({id:'guest-deck-v1',validated:true,commander:'Guest Commander',snapshot:prepared(member.seatId,'human','Friend')})});
  t.after(()=>runtime.close());
  const invite=runtime.invite(1),session=await runtime.guest.join(invite),member=await runtime.guest.authenticate(session.capability);
  await runtime.guest.deck(member,{source:'upload'});await runtime.ready(true);await runtime.guest.ready(member,{ready:true});

  const table=runtime.view();
  assert.equal(table.phase,'countdown');
  assert.equal(table.countdownAt,10000,'ten seconds, as specified');
  await new Promise(r=>setImmediate(r));   // the spawn is deliberately not awaited by start()
  assert.equal(spawnedAt.length,1,'Forge was asked to start while the countdown was still running');
  assert.equal(spawnedAt[0],0,'at countdown entry, not at its end');

  // Forge comes up mid-countdown; the table still waits for the clock before anyone is seated.
  engine={status:'ready',matchId:spawnedMatches[0]};
  now=5000;await runtime.poll();
  assert.equal(runtime.view().phase,'countdown','a fast engine does not cut the countdown short');

  now=10000;await runtime.poll();await runtime.poll();
  assert.equal(runtime.view().phase,'playing');
  assert.equal(spawnedAt.length,1,'the launch recognised the engine it had already started');
  assert.equal(runtime.view().matchId,spawnedMatches[0],'and it is the same match');
});

/* "Not ready yet" with no name on it is the lobby's least useful sentence. The host should be able
 * to see which seat is holding the table, and everyone should be reading the same answer. */
test('readiness names who the table is waiting on, and the launch stops being a blank screen',async t=>{
  let now=0,engine={status:'idle'};
  const runtime=createLocalTableRuntime({directory:resolve(mkdtempSync(resolve(tmpdir(),'crankmagic-readiness-')),'tables'),
    lobby:lobby(),clock:()=>now,status:()=>engine,bridge:async seat=>({viewerSeatId:seat}),
    launch:async pod=>{engine={status:'starting',matchId:pod.matchId};},
    resolveGuestDeck:async member=>({id:'guest-deck-v1',validated:true,commander:'Guest Commander',snapshot:prepared(member.seatId,'human','Friend')})});
  t.after(()=>runtime.close());

  let r=runtime.readiness();
  assert.equal(r.ok,false);
  assert.equal(r.seats[1].claimed,false,'the guest has not arrived');
  assert.ok(!r.waitingOn.some(x=>x.startsWith('Friend')),'an empty chair is not somebody to wait on');
  assert.deepEqual(r.table,[],'the host and the AI seat already make a playable two');
  assert.equal(r.seats[0].blocking,'not ready','the host is what the table is waiting on so far');

  const invite=runtime.invite(1),session=await runtime.guest.join(invite),member=await runtime.guest.authenticate(session.capability);
  r=runtime.readiness();
  assert.equal(r.seats[1].blocking,'no validated deck');
  assert.ok(r.waitingOn.some(x=>x.includes('no validated deck')),'and it says so by name');

  await runtime.guest.deck(member,{source:'upload'});
  assert.equal(runtime.readiness().seats[1].blocking,'not ready');
  await runtime.ready(true);
  assert.deepEqual(runtime.readiness().waitingOn.map(x=>x.split(' (')[1]),['not ready)'],'only the guest is left');

  await runtime.guest.ready(member,{ready:true});
  await new Promise(r2=>setImmediate(r2));
  assert.equal(runtime.readiness().launch.stage,'engine-spawned','the engine is already coming up during the countdown');

  engine={status:'ready',matchId:runtime.readiness().launch.matchId};
  now=10000;await runtime.poll();await runtime.poll();
  assert.equal(runtime.view().phase,'playing');
  assert.equal(runtime.readiness().launch.stage,'seated');

  // The same answer reaches the guest, so nobody is reading a different story on their own screen.
  assert.equal((await runtime.guest.table(member)).readiness.launch.stage,'seated');
});

test('a launch that fails says so instead of going quiet', async t=>{
  let now=0,engine={status:'idle'};
  const runtime=createLocalTableRuntime({directory:resolve(mkdtempSync(resolve(tmpdir(),'crankmagic-launchfail-')),'tables'),
    lobby:lobby(),clock:()=>now,status:()=>engine,bridge:async seat=>({viewerSeatId:seat}),
    launch:async()=>{throw Error('Forge could not open the card database');},
    resolveGuestDeck:async member=>({id:'guest-deck-v1',validated:true,commander:'Guest Commander',snapshot:prepared(member.seatId,'human','Friend')})});
  t.after(()=>runtime.close());
  const invite=runtime.invite(1),session=await runtime.guest.join(invite),member=await runtime.guest.authenticate(session.capability);
  await runtime.guest.deck(member,{source:'upload'});await runtime.ready(true);await runtime.guest.ready(member,{ready:true});
  await new Promise(r=>setImmediate(r));
  const progress=runtime.readiness().launch;
  assert.equal(progress.stage,'failed');
  assert.match(progress.error,/card database/,'the reason travels with the failure');
});
