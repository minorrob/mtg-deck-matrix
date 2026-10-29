/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
import assert from "node:assert/strict";
import {isDeepStrictEqual} from "node:util";
import {memoryStorage,createMatchStore} from "../game/engine/storage.mjs";
import {startRoom,openRoom,basicCards} from "../game/room/room.mjs";
import {replayMatch} from "../game/room/replay.mjs";
let checks=0,serial=0;
const eq=(a,b,m)=>{assert.ok(isDeepStrictEqual(a,b),m);checks++;};
const ok=(a,m)=>{assert.ok(a,m);checks++;};
const cards=name=>name==="Demand"?{types:["Sorcery"],manaCost:"{0}",spell:{id:"s",targets:[],effects:[{effect:"loseLife",who:"you",amount:2},{effect:"discard",count:1},{effect:"gainLife",who:"you",amount:1}]}}
  :name==="Division"?{types:["Sorcery"],manaCost:"{0}",spell:{id:"s",targets:[{what:"permanent",types:["Creature"],count:{min:2,max:2}}],divided:{target:0,total:3},effects:[{effect:"dealDamage",targets:{target:0},divided:0}]}}
  :name==="Helper"?{types:["Creature"],manaCost:"{0}",power:0,toughness:1}
  :name==="Convoke proposal"?{types:["Sorcery"],manaCost:"{1}",keywords:["Convoke"],spell:{id:"s",targets:[],effects:[{effect:"gainLife",who:"you",amount:1}]}}:basicCards(name);
let room;
const see=()=>room.view(room.waitingOn);
const request=(v,extra)=>({kind:"answer",actionId:`00000000-0000-4000-8000-${String(++serial).padStart(12,"0")}`,revision:v.revision,choiceId:v.decision.id,...extra});
const take=async(v,option)=>room.act(v.seatId,request(v,{indices:[option.index]}));
async function until(stop){
  for(let n=0;n<300;n++){
    const v=see();if(stop(v))return v;
    const helper=v.decision.options.find(o=>v.seatId==="p0"&&o.act==="cast"&&o.label==="Helper");
    await take(v,helper??v.decision.options.find(o=>o.act==="pass")??v.decision.options.find(o=>/keep/i.test(o.label))??v.decision.options[0]);
  }
  throw new Error("native room never reached the convoke proposal");
}
for(const undo of [false,true]){
const storage=memoryStorage(),matchId=`cancel-room-${undo}`,store=createMatchStore(storage,matchId);
room=await startRoom({storage,cards,matchId,seed:"cancel-room",pod:{passEmpty:true,passAfterCast:true,...(undo?{houseRules:{undoLastPlay:true}}:{}),seats:[0,1,2,3].map(i=>({seatId:`p${i}`,name:`P${i}`,pilot:"human",commander:[],cards:Array.from({length:60},(_,n)=>n%2?"Convoke proposal":"Helper")}))}});
let view=await until(v=>v.seatId==="p0"&&v.decision.options.some(o=>o.act==="cast"&&o.label==="Convoke proposal"));
const before=await store.latestCheckpoint(),history=structuredClone(view.history),journal=await store.readJournal();
await take(view,view.decision.options.find(o=>o.act==="cast"&&o.label==="Convoke proposal"));
view=see();eq([view.decision.cost,view.decision.cancellation?.kind],["convoke","abandon-action"],"the actual room offers Cancel only for the proven uncommitted cost stage");
ok(view.decision.cancellation.allowed,"the answering seat receives the additive cancellation permission");
eq(room.view("p1").decision,null,"another seat receives no private cancellation decision");
room=await openRoom({storage,cards,matchId});view=see();
ok(view.decision.cancellation.allowed,"a real saved room retains its proven reversible proposal");
const stale=request(view,{indices:[0]});
const cancel=request(view,{cancel:true,indices:[]});cancel.kind="cancel";
await room.act("p0",cancel);
const after=await store.latestCheckpoint();
eq(after.state,before.state,"native room Cancel restores the entire pre-proposal engine state and every resource");
eq(after.rng,before.rng,"Cancel consumes no random numbers");
eq(await store.readJournal(),journal,"Cancel neither removes nor appends committed game events");
eq(see().history,history,"Cancel preserves the table history");
eq(see().seatId,"p0","the same actor gets real priority again");
ok(!see().canUndo,"an abandoned proposal leaves no phantom completed cast to undo");
const fingerprint=room.fingerprint();
await room.act("p0",cancel);eq(room.fingerprint(),fingerprint,"a repeated accepted Cancel is idempotent");
await assert.rejects(()=>room.act("p0",stale),/changed|expired|refreshed|stale/i);checks++;
eq((await store.latestCheckpoint()).state,before.state,"a stale answer cannot cast or pay after Cancel");
ok((await replayMatch({storage,cards,matchId})).same,"the actual cancellation, reopen, accepted retry and stale refusal replay to the same native room and journal");
view=see();await take(view,view.decision.options.find(o=>o.act==="cast"&&o.label==="Convoke proposal"));
const departedCancel=request(see(),{cancel:true,indices:[]});departedCancel.kind="cancel";
await room.leave("p0","conceded");
eq(room.view("p1").state.players[0].health.status,"lost","actual room departure removes the proposal's actor and source cards");
ok(room.waitingOn!=="p0","the room gives the surviving seats their next decision");
const afterDeparture=room.fingerprint();
await assert.rejects(()=>room.act("p0",departedCancel),/not your|over|expired/i);checks++;
await room.act("p0",cancel);
eq(room.fingerprint(),afterDeparture,"neither a stale Cancel nor its old accepted receipt resurrects the departed actor or source");
ok((await replayMatch({storage,cards,matchId})).same,"the actor/source departure after the reopened proposal replays exactly");
}
const numericStorage=memoryStorage(),numericStore=createMatchStore(numericStorage,"numeric-cancel");
room=await startRoom({storage:numericStorage,cards,matchId:"numeric-cancel",seed:"cancel-room",pod:{passEmpty:true,passAfterCast:true,seats:[0,1].map(i=>({seatId:`p${i}`,name:`P${i}`,pilot:"human",commander:[],cards:Array.from({length:60},(_,n)=>n%2?"Division":"Helper")}))}});
let numericView=await until(v=>v.seatId==="p0"&&v.decision.options.some(o=>o.act==="cast"&&o.label==="Division"));
const numericBefore=await numericStore.latestCheckpoint(),numericJournal=await numericStore.readJournal();
await take(numericView,numericView.decision.options.find(o=>o.act==="cast"&&o.label==="Division"));
numericView=see();eq(numericView.decision.mode,"many","the actual room first asks for the two counted targets");
await room.act("p0",request(numericView,{indices:[0,1]}));
numericView=see();eq([numericView.decision.mode,numericView.decision.total,numericView.decision.cancellation.kind],["amount",3,"abandon-action"],"chosen targets lead to the real numeric payment/announcement stage");
room=await openRoom({storage:numericStorage,cards,matchId:"numeric-cancel"});
const numericCancel=request(see(),{});numericCancel.kind="cancel";
await room.act("p0",numericCancel);
const numericAfter=await numericStore.latestCheckpoint();
eq(numericAfter.state,numericBefore.state,"Cancel with no amounts abandons the reloaded numeric proposal and restores the full original state");
eq(numericAfter.rng,numericBefore.rng,"numeric Cancel consumes no random numbers");
eq(await numericStore.readJournal(),numericJournal,"announced targets never become committed journal events when numeric Cancel abandons the proposal");
ok((await replayMatch({storage:numericStorage,cards,matchId:"numeric-cancel"})).same,"target stage then numeric Cancel replays the actual room and journal");
const mandatoryStorage=memoryStorage(),mandatoryStore=createMatchStore(mandatoryStorage,"mandatory-cancel");
room=await startRoom({storage:mandatoryStorage,cards,matchId:"mandatory-cancel",seed:"mandatory",pod:{passEmpty:true,seats:[0,1].map(i=>({seatId:`p${i}`,name:`P${i}`,pilot:"human",commander:[],cards:Array(40).fill("Demand")}))}});
let view=await until(v=>v.seatId==="p0"&&v.decision.options.some(o=>o.act==="cast"&&o.label==="Demand"));
await take(view,view.decision.options.find(o=>o.act==="cast"&&o.label==="Demand"));
view=await until(v=>/^Discard 1 card/.test(v.decision.title));
eq([view.state.players[0].life,view.decision.cancellation.allowed],[38,false],"the real room retains its committed life-loss prefix and mandatory discard");
ok(/required|finish/i.test(view.decision.cancellation.reason),"the view explains how to continue the committed effect");
const mandatoryBefore=await mandatoryStore.latestCheckpoint(),mandatoryJournal=await mandatoryStore.readJournal(),mandatoryFingerprint=room.fingerprint();
const envelope=request(view,{cancel:true,indices:[]});envelope.kind="cancel";
await assert.rejects(()=>room.act("p0",envelope),/required|finish|cannot.*cancel/i);checks++;
await assert.rejects(()=>room.act("p0",request(see(),{cancel:true,indices:[]})),/required|finish|cannot.*cancel/i);checks++;
eq(await mandatoryStore.latestCheckpoint(),mandatoryBefore,"both Cancel wire forms preserve the full committed state and RNG checkpoint");
eq(await mandatoryStore.readJournal(),mandatoryJournal,"refused mandatory Cancel neither drops nor repeats the already committed prefix");
eq(room.fingerprint(),mandatoryFingerprint,"mandatory Cancel refuses without consuming a tape entry or advancing the room");
await take(see(),see().decision.options[0]);
eq(see().state.players[0].life,39,"the required answer still completes the following gain-life instruction exactly once");
ok((await replayMatch({storage:mandatoryStorage,cards,matchId:"mandatory-cancel"})).same,"mandatory refusal and its eventual valid answer replay exactly");
console.log(`room-cancel-decision: ${checks} checks; native cancel/reload/retry with full state, RNG and journal preservation`);
