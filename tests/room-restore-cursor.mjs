/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
/* Restore follows journal.sequence (the last written ID), without replaying an old public event on eventless inputs. */
import assert from "node:assert/strict";
import {memoryStorage,createMatchStore} from "../game/engine/storage.mjs";
import {startRoom,openRoom,basicCards,leastAnswer,ROOM_SCHEMA,ROOM_PROTOCOL} from "../game/room/room.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {replayMatch} from "../game/room/replay.mjs";
import {createState} from "../game/engine/state/index.mjs";
import {createJournal} from "../game/engine/journal.mjs";
import {createRng} from "../game/engine/rng.mjs";
import {createController} from "../game/engine/controller.mjs";
let checks=0,serial=0;
const eq=(a,b,m)=>{assert.deepEqual(a,b,m);checks++;},ok=(a,m)=>{assert.ok(a,m);checks++;};
const index=loadCardIndex(),cards=n=>index.definition(n)??basicCards(n),storage=memoryStorage(),matchId="restore-cursor",store=createMatchStore(storage,matchId);
let room=await startRoom({storage,cards,matchId,seed:"restore-cursor",pod:{sourceChoices:true,passEmpty:true,pooledTaps:true,seats:[
 {seatId:"p0",name:"Rob",pilot:"human",commander:[],cards:Array.from({length:60},(_,n)=>["Forest","Island","Forest","Cankerbloom"][n%4])},
 {seatId:"p1",name:"Maya",pilot:"human",commander:[],cards:Array.from({length:60},(_,n)=>n%4===0?"Sol Ring":"Forest")} ]}});
const request=(v,a)=>({kind:"answer",actionId:`00000000-0000-4000-8000-${String(++serial).padStart(12,"0")}`,revision:v.revision,choiceId:v.decision.id,...a});
let v;
for(let n=0;n<1600;n++){
 v=room.view(room.waitingOn);const field=v.state.players[v.seat].zones.Battlefield.cards;
 const ready=v.seat===0&&field.filter(c=>c.types.includes("Land")).length>=4&&field.some(c=>c.name==="Cankerbloom")&&v.state.players[1].zones.Battlefield.cards.some(c=>c.name==="Sol Ring");
 if(ready&&v.state.players[0].mana.some(m=>m.color==="G")&&v.decision.options.some(o=>o.actionStages))break;
 let option=v.decision.options.find(o=>/keep/i.test(o.label))??v.decision.options.find(o=>o.act==="play-land");
 if(ready&&!option)option=v.decision.options.find(o=>o.act==="activate-mana"&&o.label==="Forest");
 if(!option&&!field.some(c=>c.name===(v.seat===0?"Cankerbloom":"Sol Ring")))option=v.decision.options.find(o=>o.act==="cast"&&o.label===(v.seat===0?"Cankerbloom":"Sol Ring"));
 option??=v.decision.options.find(o=>o.act==="pass");await room.act(v.seatId,request(v,option?{indices:[option.index]}:leastAnswer(v.decision)));
}
const before=await store.latestCheckpoint(),journal=await store.readJournal(),record=JSON.parse(await storage.get(`room/${matchId}`));
ok(room.watch().events.some(e=>e.kind==="tap"),"the actual previous input has a real public land-tap event");
room=await openRoom({storage,cards,matchId});v=room.view("p0");const begin=request(v,{indices:[v.decision.options.find(o=>o.actionStages).index],staged:true});await room.act("p0",begin);
eq(room.watch().events,[],"after restore, an eventless accepted draft input must not re-emit the prior land tap");
eq(room.view("p0").events,[],"the actor's default event batch is empty too");eq(room.view("p1").events,[],"the opponent receives no stale event");
eq((await store.latestCheckpoint()).state,before.state,"cursor repair changes no actual native game fact");eq(await store.readJournal(),journal,"no native event is removed, renumbered or invented");
let saved=JSON.parse(await storage.get(`room/${matchId}`));eq(saved.events,record.events,"all retained public events remain intact");eq(saved.eventsFloor??-1,record.eventsFloor??-1,"the existing retained-event floor is preserved");eq(saved.eventsMark,before.sequence+1,"an eventless input begins strictly after the last written journal ID");
const unchanged=await storage.get(`room/${matchId}`);v=room.view("p0");await assert.rejects(()=>room.act("p0",request(v,{indices:[99999]})),/Invalid selection/i);checks++;
eq(await storage.get(`room/${matchId}`),unchanged,"a refused input changes no cursor, record or receipt");eq(room.watch().events,[],"a refusal re-emits nothing");
const fp=room.fingerprint();await room.act("p0",begin);eq(room.fingerprint(),fp,"an accepted eventless retry consumes no input or events");eq(room.watch().events,[],"an accepted retry re-emits nothing");
room=await openRoom({storage,cards,matchId});eq(room.watch().events,[],"JSON reload preserves the empty last batch");v=room.view("p0");const cancel=request(v,{kind:"cancel",indices:[]});await room.act("p0",cancel);eq(room.watch().events,[],"eventless private Cancel after reload re-emits nothing");
room=await openRoom({storage,cards,matchId});await room.act("p0",cancel);eq(room.watch().events,[],"Cancel retry after another JSON reload re-emits nothing");
v=room.view("p0");const tap=v.decision.options.find(o=>o.act==="activate-mana");ok(tap,"another actual land can make the next event");await room.act("p0",request(v,{indices:[tap.index]}));
const next=room.watch().events,newRows=(await store.readJournal()).slice(journal.length);ok(next.length>0,"the next real native input still delivers its public event");
eq(newRows[0].eventId,`event:${before.sequence+1}`,"normal post-restore writes retain the original journal's next sequential ID");
eq(new Set(next.map(e=>e.eventId)).size,next.length,"no event is duplicated within its delivered batch");ok(next.every(e=>Number(e.eventId.slice(6))>before.sequence),"every next-batch event is actually new");
eq(room.watch({after:next.at(-1).eventId}).events,[],"the explicit cursor observes the next delivery exactly once");
room=await openRoom({storage,cards,matchId});v=room.view("p0");await room.act("p0",request(v,{indices:[v.decision.options.find(o=>o.actionStages).index],staged:true}));
eq(room.watch().events,[],"the next event is not replayed by a later eventless input after reload");ok((await replayMatch({storage,cards,matchId})).same,"normal engine state and the journal still replay exactly");
/* A fresh native checkpoint before its first event. No journal is reset and no historical event is discarded. */
{
 const storage=memoryStorage(),matchId="cursor-zero",seed="cursor-zero",seats=[{seatId:"p0",name:"Rob",pilot:"human",cards:[],commander:[]},{seatId:"p1",name:"Maya",pilot:"human",cards:[],commander:[]}];
 const state=createState({matchId,seed,players:seats.map(s=>({name:s.name}))}),journal=createJournal({matchId,seed}),rng=createRng(seed),store=createMatchStore(storage,matchId);
 await store.saveMatch({pod:{seats},seed});await store.saveCheckpoint(journal.checkpoint(state,rng.checkpoint()));
 await storage.put(`room/${matchId}`,JSON.stringify({schema:ROOM_SCHEMA,protocol:ROOM_PROTOCOL,matchId,sequence:0,seats,pendingSeat:null,pendingActions:null,controller:createController().checkpoint(),receipts:[],leaving:[],departures:{},ended:null,history:[],refusals:{total:0,since:0,first:[]},events:[],eventsMark:0,eventsFloor:-1}));
 const room=await openRoom({storage,matchId});eq(room.watch().events,[],"empty journal zero restores with no phantom event");await room.end("p0");
 const saved=JSON.parse(await storage.get(`room/${matchId}`));eq(room.watch({after:"event:0"}).events,[],"the empty journal cursor delivers no phantom first event");eq(room.watch({after:"event:0"}).eventsReset,undefined,"a valid empty-journal cursor does not force a reset");eq(saved.eventsFloor??-1,-1,"empty retention floor stays unchanged");eq((await store.latestCheckpoint()).sequence,0,"ending this fresh fixture does not create or reset journal facts");eq(await store.readJournal(),[],"the zero-event journal stays empty");
}
console.log(`room-restore-cursor: ${checks} checks; default batches after restore, accepted/refused/retried/Cancel inputs, next delivery, empty journal and retained stream`);
