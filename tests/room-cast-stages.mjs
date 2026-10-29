/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
import assert from "node:assert/strict";
import {isDeepStrictEqual} from "node:util";
import {memoryStorage,createMatchStore} from "../game/engine/storage.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {startRoom,openRoom,basicCards,leastAnswer} from "../game/room/room.mjs";
import {replayMatch,replayTape} from "../game/room/replay.mjs";
let checks=0,serial=0;
const eq=(a,b,m)=>{assert.ok(isDeepStrictEqual(a,b),m);checks++;};
const ok=(a,m)=>{assert.ok(a,m);checks++;};
const index=loadCardIndex();
const cards=name=>name==="Helper"?{types:["Creature"],manaCost:"{0}",power:1,toughness:3}
  :name==="Target"?{types:["Creature"],manaCost:"{0}",power:3,toughness:3}:index.definition(name)??basicCards(name);
const storage=memoryStorage(),matchId="cast-stages",store=createMatchStore(storage,matchId);
let room=await startRoom({storage,cards,matchId,seed:"modal-stages",pod:{passAfterCast:true,pooledTaps:true,sourceChoices:true,seats:[
  {seatId:"p0",name:"A",pilot:"human",commander:[],cards:Array.from({length:60},(_,n)=>n%4===0?"Getaway Glamer":n%4===1?"Helper":"Plains")},
  {seatId:"p1",name:"B",pilot:"human",commander:[],cards:Array.from({length:60},(_,n)=>n%3===0?"Target":"Plains")} ]}});
const see=()=>room.view(room.waitingOn);
const request=(v,extra)=>({kind:"answer",actionId:`00000000-0000-4000-8000-${String(++serial).padStart(12,"0")}`,revision:v.revision,choiceId:v.decision.id,...extra});
const take=(v,extra)=>room.act(v.seatId,request(v,extra));
async function until(stop){
  for(let n=0;n<1400;n++){
    const v=see();if(stop(v))return v;
    const own=v.state.players[v.seat],creature=own.zones.Battlefield.cards.some(c=>c.types.includes("Creature"));
    const option=v.decision.options.find(o=>o.act==="play-land")
      ??(!creature?v.decision.options.find(o=>o.act==="cast"&&["Helper","Target"].includes(o.label)):null)
      ??v.decision.options.find(o=>o.act==="pass")??v.decision.options.find(o=>/keep/i.test(o.label));
    await take(v,option?{indices:[option.index]}:leastAnswer(v.decision));
  }
  throw new Error("native room never reached its actual modal cast");
}
let view=await until(v=>v.seatId==="p0"&&v.state.players[0].zones.Battlefield.cards.filter(c=>c.types.includes("Land")).length>=5
  &&v.state.players.every(p=>p.zones.Battlefield.cards.some(c=>c.types.includes("Creature")))&&v.decision.options.some(o=>o.label==="Getaway Glamer"));
const original=await store.latestCheckpoint(),history=structuredClone(view.history),journal=await store.readJournal();
const pending=JSON.parse(await storage.get(`room/${matchId}`)).pendingActions;
const initialIndex=pending.findIndex(a=>a.kind==="cast"&&a.label==="Getaway Glamer"&&a.modes.length===1);
ok(initialIndex>=0,"the real room offers a single-mode variant from which to begin the physical card draft");
ok(view.decision.options[initialIndex].castStages?.actionId,"the private native offer advertises a stable staged action ID");
const entryId=view.decision.options[initialIndex].castStages.actionId;
const begin=request(view,{indices:[initialIndex],staged:true});await room.act("p0",begin);
view=see();eq([view.decision.stage,view.decision.castStage.actionId],["modes",entryId],"staged:true begins modes rather than silently committing the chosen old variant");
eq((await store.latestCheckpoint()).state,original.state,"beginning the real draft changes no engine state or resource");
eq(room.view("p1").decision,null,"opponents receive no private cast draft");
const transaction=view.decision.castStage.transactionId,modeIds=view.decision.modeChoices.map(m=>m.id);
room=await openRoom({storage,cards,matchId});view=see();
eq([view.decision.stage,view.decision.castStage.transactionId],["modes",transaction],"the actual saved room reloads its mode stage and stable transaction");
const invalid=request(view,{indices:[99999]});await assert.rejects(()=>room.act("p0",invalid),/invalid/i);checks++;
eq((await store.latestCheckpoint()).state,original.state,"invalid modes consume nothing");
let both=view.decision.options.find(o=>o.modeIndices.join(",")==="0,1");
ok(both,"the initial one-mode variant did not lock the actual room to one mode");
await take(view,{indices:[both.index]});view=see();
eq([view.decision.stage,view.decision.modeId],["targets",modeIds[0]],"first selected mode gets its own target stage");
const firstQuestion=view.decision.id;
const ownId=view.state.players[0].zones.Battlefield.cards.find(c=>c.name==="Helper").cardId;
const otherId=view.state.players[1].zones.Battlefield.cards.find(c=>c.name==="Target").cardId;
await take(view,{indices:[view.decision.options.find(o=>o.target.id===ownId).index]});view=see();
eq([view.decision.stage,view.decision.modeId],["targets",modeIds[1]],"second selected mode targets separately");
const staleTarget=request(view,{indices:[0]});
await take(view,{back:true});view=see();
eq([view.decision.modeId,view.decision.castStage.transactionId],[modeIds[0],transaction],"Back returns to the first mode target with the same transaction");
ok(view.decision.id!==firstQuestion,"Back issues a new question identity");
await assert.rejects(()=>room.act("p0",staleTarget),/changed|expired|refreshed/i);checks++;
await take(view,{back:true});view=see();eq(view.decision.stage,"modes","Back reaches the initial mode stage");
const cancel=request(view,{cancel:true});cancel.kind="cancel";await room.act("p0",cancel);
const canceled=await store.latestCheckpoint();
eq(canceled.state,original.state,"precommit Cancel preserves the entire original native engine state");
eq(canceled.rng,original.rng,"mode/target/Back/Cancel consumes no random numbers");
eq(await store.readJournal(),journal,"the uncommitted draft appends no game journal events");
eq(see().history,history,"the uncommitted draft preserves public history");
const fingerprint=room.fingerprint();await room.act("p0",cancel);eq(room.fingerprint(),fingerprint,"accepted Cancel retry is idempotent");
view=see();const next=view.decision.options.find(o=>o.label==="Getaway Glamer");await take(view,{indices:[next.index],staged:true});
view=see();await take(view,{indices:[view.decision.options.find(o=>o.modeIndices.join(",")==="0,1").index]});
for(const id of [ownId,otherId]){view=see();await take(view,{indices:[view.decision.options.find(o=>o.target.id===id).index]});}
view=see();eq(view.decision.stage,"payment","both actual targets finish before Pay is offered");
eq(view.decision.options[0].costs.additional,"{1}{2}","actual spree additional costs are both shown at Pay");
room=await openRoom({storage,cards,matchId});view=see();
const pay=request(view,{indices:[0]});await room.act("p0",pay);
let funding=0;
for(let n=0;n<8&&see().decision.cost;n++){
  funding++;
  view=see();eq(view.decision.stage,"payment","the real native funding question stays linked to the payment stage");
  ok(!view.decision.castStage.canBack,"native funding retains its committed-boundary Back policy");
  await take(view,leastAnswer(view.decision));
}
view=see();
ok(funding>0,"Pay reaches a real native source-funding choice rather than a synthetic draft-only payment");
eq(view.state.stack.length,1,"one real native spell is on the stack after payment");
const after=await store.latestCheckpoint(),entry=after.state.stack[0];
eq([entry.modes,entry.targets],[[0,1],[{kind:"object",id:ownId},{kind:"object",id:otherId}]],"the real stack entry carries both selected modes and their independent targets");
eq(after.state.zones.battlefield.filter(id=>after.state.objects[id].card==="Plains"&&after.state.objects[id].controller===0&&after.state.objects[id].tapped).length,4,"exactly four real Plains paid the white plus both spree costs");
const casts=(await store.readJournal()).filter(e=>e.kind==="GameEventSpellAbilityCast"&&e.data.fields.card.name==="Getaway Glamer");
eq(casts.length,1,"the input stages commit exactly one actual Getaway Glamer cast");
const committed=room.fingerprint();await room.act("p0",pay);eq(room.fingerprint(),committed,"repeating accepted Pay never repeats payment or the spell");
ok((await replayMatch({storage,cards,matchId})).same,"the actual staged draft, Back, Cancel, reload and Pay replay to identical native state and journal");
console.log(`room-cast-stages: ${checks} checks; actual staged spree cast, saved Back/Cancel and native payment exactly once`);
