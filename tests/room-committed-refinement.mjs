/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
/* Actual saved-card native rooms. Repeated setup decks are bounded fixture evidence, not Commander-load acceptance. */
import assert from "node:assert/strict";
import {isDeepStrictEqual} from "node:util";
import {memoryStorage,createMatchStore} from "../game/engine/storage.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {startRoom,openRoom,basicCards,leastAnswer} from "../game/room/room.mjs";
import {replayMatch,replayTape} from "../game/room/replay.mjs";
let checks=0,serial=0;
const eq=(a,b,m)=>{assert.ok(isDeepStrictEqual(a,b),m);checks++;},ok=(a,m)=>{assert.ok(a,m);checks++;};
const index=loadCardIndex(),cards=n=>index.definition(n)??basicCards(n);
const request=(v,a)=>({kind:"answer",actionId:`00000000-0000-4000-8000-${String(++serial).padStart(12,"0")}`,revision:v.revision,choiceId:v.decision.id,...a});
async function prepare(kind){
 const storage=memoryStorage(),matchId=`committed-${kind}`,store=createMatchStore(storage,matchId);
 const patterns={ao:["Plains","Plains","Forest","Ao, the Dawn Sky","Cankerbloom","Getaway Glamer"],shadrix:["Plains","Swamp","Plains","Shadrix Silverquill","Swamp","Plains"],scepter:["Wastes","Wastes","Isochron Scepter","Boros Charm","Wastes","Wastes"]};
 let room=await startRoom({storage,cards,matchId,seed:`native-${kind}`,pod:{sourceChoices:true,passEmpty:true,passStack:false,passAfterCast:true,pooledTaps:true,seats:[
  {seatId:"p0",name:"Rob",pilot:"human",commander:[],cards:Array.from({length:60},(_,n)=>patterns[kind][n%6])},
  {seatId:"p1",name:"Maya",pilot:"human",commander:[],cards:Array(60).fill("Forest")} ]}});
 for(let n=0;n<2200;n++){
  const v=room.view(room.waitingOn),d=v.decision,field=v.state.players[0].zones.Battlefield.cards;
  if(v.seat===0&&(kind==="scepter"?d.options.some(o=>o.refinementStages?.kind==="effect-cast"):d.refinementStages?.kind==="trigger"))return {storage,store,matchId,room};
  let option=d.options.find(o=>/keep/i.test(o.label))??d.options.find(o=>o.act==="play-land");
  if(!option&&v.seat===0){
   if(kind==="ao"){
    if(!field.some(c=>c.name==="Ao, the Dawn Sky"))option=d.options.find(o=>o.act==="cast"&&o.label==="Ao, the Dawn Sky");
    else if(!field.some(c=>c.name==="Cankerbloom"))option=d.options.find(o=>o.act==="cast"&&o.label==="Cankerbloom");
    else{
     const record=JSON.parse(await storage.get(`room/${matchId}`)),ao=field.find(c=>c.name==="Ao, the Dawn Sky").cardId;
     const at=record.pendingActions?.findIndex(a=>a.kind==="cast"&&a.label==="Getaway Glamer"&&a.modes?.join(",")==="1"&&a.targets?.some(t=>t.id===ao));
     if(at>=0)option=d.options[at];
    }
   }else if(kind==="shadrix"){
    if(!field.some(c=>c.name==="Shadrix Silverquill"))option=d.options.find(o=>o.act==="cast"&&o.label==="Shadrix Silverquill");
   }else{
    if(!field.some(c=>c.name==="Isochron Scepter"))option=d.options.find(o=>o.act==="cast"&&o.label==="Isochron Scepter");
    option??=d.options.find(o=>o.label==="Boros Charm"&&!o.act);
    if(!option&&v.state.players[0].zones.Exile.cards.some(c=>c.name==="Boros Charm")){
     option=d.options.find(o=>o.act==="activate"&&o.label==="Isochron Scepter")??d.options.find(o=>o.act==="activate-mana"&&o.label==="Wastes");
    }
   }
  }
  option??=d.options.find(o=>o.act==="pass");await room.act(v.seatId,request(v,option?{indices:[option.index]}:leastAnswer(d)));
 }
 throw new Error(`actual ${kind} room did not reach its committed modal question`);
}
for(const kind of ["ao","shadrix","scepter"]){
 const {storage,store,matchId}=await prepare(kind);let room=await openRoom({storage,cards,matchId}),v=room.view("p0");
 const nativeRecord=JSON.parse(await storage.get(`room/${matchId}`)),nativePending=structuredClone(nativeRecord.controller.pending),point=await store.latestCheckpoint(),journal=await store.readJournal(),history=structuredClone(v.history);
 const baseTape=await store.readTape(),meta=await store.loadMatch();
 if(kind==="ao"){eq(point.state.stack[0].cardId,null,"actual Ao has departed before its native modal question");ok(point.state.stack[0].lastKnown,"actual departed Ao keeps native LKI");}
 const plain=view=>{const value=structuredClone(view);delete value.revision;return value;},after=`event:${point.sequence}`;
 const watcher=plain(room.watch({after})),opponent=plain(room.view("p1",{after}));
 const pick=v.decision.options.find(o=>o.refinementStages),start=request(v,{indices:[pick.index],staged:true});await room.act("p0",start);v=room.view("p0");
 eq(v.decision.stage,"modes",`${kind}: committed child opens modes without answering the native question`);
 eq(JSON.parse(await storage.get(`room/${matchId}`)).controller.pending,nativePending,`${kind}: the saved main controller question stays byte-identical`);
 eq(JSON.parse(await storage.get(`room/${matchId}`)).controller.answered,null,`${kind}: no synthetic native answer was stored`);
 eq((await store.latestCheckpoint()).state,point.state,`${kind}: child opening changes no committed engine fact`);
 assert.deepEqual(plain(room.watch({after})),watcher,`${kind}: watcher sees no private child selections`);checks++;
 eq(plain(room.view("p1",{after})),opponent,`${kind}: the opponent view remains unchanged except revision`);
 const unchanged=await storage.get(`room/${matchId}`),invalid=request(v,{back:true,indices:[0]});
 await assert.rejects(()=>room.act("p0",invalid),/Back|boundary/i);checks++;eq(await storage.get(`room/${matchId}`),unchanged,`${kind}: forged Back rejects without revision/cache/question changes`);
 await assert.rejects(()=>room.act("p1",request(v,{indices:[0]})),/not your decision/i);checks++;
 await assert.rejects(()=>room.act("p0",request(v,{choiceId:"wrong-child",indices:[0]})),/expired/i);checks++;
 const cancel=request(v,{kind:"cancel",indices:[]});await room.act("p0",cancel);v=room.view("p0");
 eq(v.decision.id,nativePending.id,`${kind}: child Cancel reveals the still-live original question`);ok(/still pending.*No priority/i.test(v.decision.guidance),`${kind}: native pending guidance explains child close`);
 eq((await store.latestCheckpoint()).state,point.state,`${kind}: Cancel preserves the entire committed native state`);eq((await store.latestCheckpoint()).rng,point.rng,`${kind}: Cancel preserves native RNG`);
 eq(await store.readJournal(),journal,`${kind}: child Cancel cannot erase or add prefix journal facts`);eq(v.history,history,`${kind}: history retains the actual committed prefix`);
 const canceled=room.fingerprint();await room.act("p0",cancel);eq(room.fingerprint(),canceled,`${kind}: accepted child Cancel retry stays idempotent after child expiry`);
 await assert.rejects(()=>room.act("p0",{...cancel,indices:[0]}),/reused with different content/i);checks++;
 room=await openRoom({storage,cards,matchId});v=room.view("p0");ok(v.decision.guidance,`${kind}: close guidance survives reload alongside the original native question`);
 await room.act("p0",request(v,{indices:[v.decision.options.find(o=>o.refinementStages).index],staged:true}));v=room.view("p0");
 const modes=kind==="ao"?[1]:kind==="shadrix"?[0,1]:[0];await room.act("p0",request(v,{indices:[v.decision.options.find(o=>o.modeIndices.join(",")===modes.join(",")).index]}));
 for(let n=0;n<5;n++){
  v=room.view("p0");if(v.decision.stage!=="targets")break;
  const index=kind==="shadrix"?v.decision.options.find(o=>o.target.id===(n===0?0:1)).index:v.decision.options.find(o=>o.target.id===1).index;
  const before=room.fingerprint();ok(room.check("p0",{choiceId:v.decision.id,indices:[index]}).ok,`${kind}: read-only child target validation uses a legal native variant`);eq(room.fingerprint(),before,`${kind}: check consumes no state or input`);
  await room.act("p0",request(v,{indices:[index]}));
 }
 v=room.view("p0");eq(v.decision.stage,"confirm",`${kind}: selected modes/targets confirm through the original native handler`);
 const sidecar=JSON.parse(await storage.get(`room/${matchId}`)).refinement,replayed=memoryStorage();
 await replayTape({matchId,pod:meta.pod,seed:meta.seed,tape:await store.readTape(),cards,storage:replayed});eq(JSON.parse(await replayed.get(`room/${matchId}`)).refinement,sidecar,`${kind}: accepted child selections replay exactly as references, without a native snapshot`);
 eq(JSON.parse(await storage.get(`room/${matchId}`)).controller.pending,nativePending,`${kind}: the original native question remains unchanged through every child stage`);
 room=await openRoom({storage,cards,matchId});v=room.view("p0");const confirm=request(v,{indices:[0]});await room.act("p0",confirm);
 const result=await store.latestCheckpoint();eq(result.state.awaiting,null,`${kind}: one final confirmation completes the original native question`);
 if(kind==="scepter")eq(result.state.stack.at(-1).modes,[0],"actual Scepter effect casts the selected Boros mode once");else eq(result.state.stack[0].modes,modes,`${kind}: the actual native trigger retains selected modes`);
 const fingerprint=room.fingerprint();await room.act("p0",confirm);eq(room.fingerprint(),fingerprint,`${kind}: final accepted retry cannot invoke the native handler twice`);
 ok((await replayMatch({storage,cards,matchId})).same,`${kind}: original question, child close/reload/selection and final native continuation replay exactly`);
 /* Source/actor departure uses the actual leave path, never a sidecar restoration of saved engine state. */
 const departingStorage=memoryStorage(),departing=await replayTape({matchId,pod:meta.pod,seed:meta.seed,tape:baseTape,cards,storage:departingStorage});let dv=departing.view("p0");
 await departing.act("p0",request(dv,{indices:[dv.decision.options.find(o=>o.refinementStages).index],staged:true}));dv=departing.view("p0");const late=request(dv,{kind:"cancel",indices:[]});
 await departing.leave("p0","conceded");eq(JSON.parse(await departingStorage.get(`room/${matchId}`)).refinement,undefined,`${kind}: actor departure discards only child references`);
 const left=departing.fingerprint();await assert.rejects(()=>departing.act("p0",late),/over|not your|expired/i);checks++;eq(departing.fingerprint(),left,`${kind}: late child Cancel cannot resurrect the departed actor or original source`);
}
console.log(`room-committed-refinement: ${checks} checks; actual Ao/Shadrix/Scepter, live mandatory questions, private close/reload/replay and native confirmation once`);
