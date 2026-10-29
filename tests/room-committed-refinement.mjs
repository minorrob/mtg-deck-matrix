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
 const patterns={ao:["Plains","Plains","Forest","Ao, the Dawn Sky","Cankerbloom","Getaway Glamer"],shadrix:["Plains","Swamp","Plains","Shadrix Silverquill","Swamp","Plains"],scepter:["Wastes","Forest","Isochron Scepter","Boros Charm","Cankerbloom","Wastes"],random:["Wastes","Forest","Wastes","Summon: Magus Sisters","Wastes","Forest"]};
 let room=await startRoom({storage,cards,matchId,seed:`native-${kind}`,pod:{sourceChoices:true,passEmpty:true,passStack:false,passAfterCast:true,pooledTaps:true,seats:[
  {seatId:"p0",name:"Rob",pilot:"human",commander:[],cards:Array.from({length:60},(_,n)=>patterns[kind][n%6])},
  {seatId:"p1",name:"Maya",pilot:"human",commander:[],cards:Array.from({length:60},(_,n)=>kind==="scepter"&&n%6===1?"Cankerbloom":"Forest")},
  ...(["shadrix","scepter"].includes(kind)?[{seatId:"p2",name:"Trey",pilot:"human",commander:[],cards:Array(60).fill("Forest")}]:[]) ]}});
 for(let n=0;n<2200;n++){
  const v=room.view(room.waitingOn),d=v.decision,field=v.state.players[0].zones.Battlefield.cards;
  if(v.seat===0&&(kind==="random"?d.id.startsWith("trigger-random:"):kind==="scepter"?d.options.some(o=>o.refinementStages?.kind==="effect-cast"):d.refinementStages?.kind==="trigger"))return {storage,store,matchId,room};
  let option=d.options.find(o=>/keep/i.test(o.label))??d.options.find(o=>o.act==="play-land");
  if(!option&&kind==="scepter"&&v.seat===1&&!v.state.players[1].zones.Battlefield.cards.some(c=>c.name==="Cankerbloom"))option=d.options.find(o=>o.act==="cast"&&o.label==="Cankerbloom");
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
   }else if(kind==="random"){
    if(!field.some(c=>c.name==="Summon: Magus Sisters"))option=d.options.find(o=>o.act==="cast"&&o.label==="Summon: Magus Sisters");
   }else{
    if(!field.some(c=>c.name==="Isochron Scepter"))option=d.options.find(o=>o.act==="cast"&&o.label==="Isochron Scepter");
    else if(!field.some(c=>c.name==="Cankerbloom"))option=d.options.find(o=>o.act==="cast"&&o.label==="Cankerbloom");
    option??=d.options.find(o=>o.label==="Boros Charm"&&!o.act);
    if(!option&&field.some(c=>c.name==="Cankerbloom")&&v.state.players[0].zones.Exile.cards.some(c=>c.name==="Boros Charm")){
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
 const detached=room.fingerprint();v.decision.options[0].modeIndices.push(999);eq(room.fingerprint(),detached,`${kind}: returned private mode arrays cannot mutate the live native choices`);v=room.view("p0");
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
 if(kind==="ao"){
  v=room.view("p0");await room.act("p0",request(v,{indices:[v.decision.options.find(o=>o.refinementStages).index],staged:true}));
  for(let n=0;n<130;n++){
   v=room.view("p0");await room.act("p0",request(v,{indices:[v.decision.options.find(o=>o.modeIndices[0]===1).index]}));
   v=room.view("p0");await room.act("p0",request(v,{back:true,indices:[]}));
  }
  v=room.view("p0");await room.act("p0",request(v,{kind:"cancel",indices:[]}));
  ok(!JSON.parse(await storage.get(`room/${matchId}`)).receipts.some(r=>r.actionId===cancel.actionId),"actual eventless inputs evict the old child receipt from the room's 256-entry window");
  room=await openRoom({storage,cards,matchId});const cached=room.fingerprint();
  await room.act("p0",cancel);eq(room.fingerprint(),cached,"the persistent controller receipt answers an own-seat retry after child expiry and room-cache eviction");
  await assert.rejects(()=>room.act("p1",cancel),/another seat/i);checks++;
  eq(room.fingerprint(),cached,"a foreign-seat cached retry cannot change or answer the still-live native question");
  eq(JSON.parse(await storage.get(`room/${matchId}`)).controller.pending,nativePending,"receipt cache pressure never replaces the original native question");
  eq((await store.latestCheckpoint()).state,point.state,"more than 256 private inputs still change no committed Ao facts");
 }
 room=await openRoom({storage,cards,matchId});v=room.view("p0");ok(v.decision.guidance,`${kind}: close guidance survives reload alongside the original native question`);
 await room.act("p0",request(v,{indices:[v.decision.options.find(o=>o.refinementStages).index],staged:true}));v=room.view("p0");
 const modes=kind==="ao"?[1]:kind==="shadrix"?[0,1]:[0];await room.act("p0",request(v,{indices:[v.decision.options.find(o=>o.modeIndices.join(",")===modes.join(",")).index]}));
 v=room.view("p0");const staleStage=request(v,{indices:[0]});await room.act("p0",request(v,{back:true,indices:[]}));v=room.view("p0");
 eq(v.decision.stage,"modes",`${kind}: Back edits only private mode/target selections`);eq(JSON.parse(await storage.get(`room/${matchId}`)).controller.pending,nativePending,`${kind}: Back cannot erase or replace the original native question`);
 await assert.rejects(()=>room.act("p0",staleStage),/expired|changed/i);checks++;
 await room.act("p0",request(v,{indices:[v.decision.options.find(o=>o.modeIndices.join(",")===modes.join(",")).index]}));
 let typedRequest=null;
 for(let n=0;n<5;n++){
  v=room.view("p0");if(v.decision.stage!=="targets")break;
  const index=kind==="shadrix"?v.decision.options.find(o=>o.target.id===(n===0?0:1)).index:v.decision.options.find(o=>o.target.id===1).index;
  const before=room.fingerprint();ok(room.check("p0",{choiceId:v.decision.id,indices:[index]}).ok,`${kind}: read-only child target validation uses a legal native variant`);eq(room.fingerprint(),before,`${kind}: check consumes no state or input`);
  typedRequest=request(v,{kind:"player",targetId:v.decision.options[index].target.id});await room.act("p0",typedRequest);
 }
 v=room.view("p0");eq(v.decision.stage,"confirm",`${kind}: selected modes/targets confirm through the original native handler`);
 const sidecar=JSON.parse(await storage.get(`room/${matchId}`)).refinement,replayed=memoryStorage();
 const replayedRoom=await replayTape({matchId,pod:meta.pod,seed:meta.seed,tape:await store.readTape(),cards,storage:replayed});eq(JSON.parse(await replayed.get(`room/${matchId}`)).refinement,sidecar,`${kind}: accepted child selections replay exactly as references, without a native snapshot`);
 const replayedPoint=replayedRoom.fingerprint();await replayedRoom.act("p0",cancel);eq(replayedRoom.fingerprint(),replayedPoint,`${kind}: the original raw Cancel retry stays idempotent after full tape replay`);
 if(typedRequest){await replayedRoom.act("p0",typedRequest);eq(replayedRoom.fingerprint(),replayedPoint,`${kind}: an accepted typed-player payload is still the same receipt after replay`);}
 eq(JSON.parse(await storage.get(`room/${matchId}`)).controller.pending,nativePending,`${kind}: the original native question remains unchanged through every child stage`);
 room=await openRoom({storage,cards,matchId});v=room.view("p0");const confirm=request(v,{indices:[0]});await room.act("p0",confirm);
 const result=await store.latestCheckpoint();eq(result.state.awaiting,null,`${kind}: one final confirmation completes the original native question`);
 if(kind==="scepter")eq(result.state.stack.at(-1).modes,[0],"actual Scepter effect casts the selected Boros mode once");else eq(result.state.stack[0].modes,modes,`${kind}: the actual native trigger retains selected modes`);
 if(kind==="ao"){
  const pv=room.view("p0"),pass=pv.decision.options.find(o=>o.act==="pass");ok(pass,"the native Ao ability remains on the stack for actual priority passing");await room.act("p0",request(pv,{indices:[pass.index]}));
  eq(room.waitingOn,"p1","actual priority now belongs to another seat, beyond the old child's lifetime");const otherPending=room.fingerprint();
  await room.act("p0",cancel);eq(room.fingerprint(),otherPending,"own cached child retry works before checking who holds the later native question");
  await assert.rejects(()=>room.act("p1",cancel),/another seat/i);checks++;eq(room.fingerprint(),otherPending,"a current other seat cannot claim the expired child's receipt");
 }
 const fingerprint=room.fingerprint();await room.act("p0",confirm);eq(room.fingerprint(),fingerprint,`${kind}: final accepted retry cannot invoke the native handler twice`);
 await assert.rejects(()=>room.act("p0",{...confirm,actionId:request(room.view(room.waitingOn),{}).actionId,revision:room.revision}),/expired|changed|not your/i);checks++;
 eq(room.fingerprint(),fingerprint,`${kind}: a new input carrying an expired child ID cannot answer a later original question`);
 ok((await replayMatch({storage,cards,matchId})).same,`${kind}: original question, child close/reload/selection and final native continuation replay exactly`);
 /* Source/actor departure uses the actual leave path, never a sidecar restoration of saved engine state. */
 const departingStorage=memoryStorage(),departing=await replayTape({matchId,pod:meta.pod,seed:meta.seed,tape:baseTape,cards,storage:departingStorage});let dv=departing.view("p0");
 await departing.act("p0",request(dv,{indices:[dv.decision.options.find(o=>o.refinementStages).index],staged:true}));dv=departing.view("p0");const late=request(dv,{kind:"cancel",indices:[]});
 await departing.leave("p0","conceded");eq(JSON.parse(await departingStorage.get(`room/${matchId}`)).refinement,undefined,`${kind}: actor departure discards only child references`);
 const left=departing.fingerprint();await assert.rejects(()=>departing.act("p0",late),/over|not your|expired/i);checks++;eq(departing.fingerprint(),left,`${kind}: late child Cancel cannot resurrect the departed actor or original source`);
 if(kind!=="ao"){
  const ds=memoryStorage(),decline=await replayTape({matchId,pod:meta.pod,seed:meta.seed,tape:baseTape,cards,storage:ds});let dv=decline.view("p0");
  await decline.act("p0",request(dv,{indices:[dv.decision.options.find(o=>o.refinementStages).index],staged:true}));dv=decline.view("p0");await decline.act("p0",request(dv,{kind:"cancel",indices:[]}));dv=decline.view("p0");
  const option=dv.decision.options.find(o=>o.label===(kind==="scepter"?"Don't cast":"Choose none"));ok(option,`${kind}: closing a child leaves the real native optional decline available`);
  await decline.act("p0",request(dv,{indices:[option.index]}));const dstore=createMatchStore(ds,matchId),result=await dstore.latestCheckpoint();
  eq(result.state.awaiting,null,`${kind}: explicit native decline completes the original handler`);eq(result.state.stack.length,0,`${kind}: original native ability/trigger actually leaves the stack`);
  if(kind==="scepter"){
   ok(result.state.zones.battlefield.some(id=>result.state.objects[id].card==="Isochron Scepter"&&result.state.objects[id].tapped),"Scepter decline keeps its committed activation tap paid");
   eq((await dstore.readJournal()).filter(e=>e.kind==="GameEventSpellAbilityCast"&&e.data.fields.card.name==="Boros Charm").length,0,"native Scepter decline never casts the copied card");
  }else eq(Object.values(result.state.objects).filter(o=>o.card==="Inkling").length,0,"native Shadrix choose-none creates no mode's token");
  ok((await replayMatch({storage:ds,cards,matchId})).same,`${kind}: child close then actual native optional decline replays exactly`);
 }
 if(kind==="shadrix"){
  const ts=memoryStorage(),targetRoom=await replayTape({matchId,pod:meta.pod,seed:meta.seed,tape:baseTape,cards,storage:ts});let tv=targetRoom.view("p0");const begin=request(tv,{indices:[tv.decision.options.find(o=>o.refinementStages).index],staged:true});await targetRoom.act("p0",begin);tv=targetRoom.view("p0");
  await targetRoom.act("p0",request(tv,{indices:[tv.decision.options.find(o=>o.modeIndices.join(",")==="0,1").index]}));tv=targetRoom.view("p0");await targetRoom.act("p0",request(tv,{indices:[tv.decision.options.find(o=>o.target.id===1).index]}));
  const old=request(targetRoom.view("p0"),{kind:"cancel",indices:[]});await targetRoom.leave("p1","conceded");
  const record=JSON.parse(await ts.get(`room/${matchId}`));eq(record.refinement,undefined,"actual target departure expires the child, not its native trigger");
  tv=targetRoom.view("p0");ok(tv.decision.options.every(o=>!(o.targets??[]).some(t=>t.id===1)),"the newly offered native variants exclude the departed player");
  const after=targetRoom.fingerprint();await assert.rejects(()=>targetRoom.act("p0",old),/expired|changed|Cancel/i);checks++;eq(targetRoom.fingerprint(),after,"stale child close cannot restore a departed target or its old native question");
  await targetRoom.act("p0",begin);eq(targetRoom.fingerprint(),after,"an accepted opening retry after target departure cannot resurrect its expired child");
  ok((await replayMatch({storage:ts,cards,matchId})).same,"actual target departure and child invalidation replay without an old-question restore");
 }
 if(kind==="scepter"){
  const ts=memoryStorage(),targetRoom=await replayTape({matchId,pod:meta.pod,seed:meta.seed,tape:baseTape,cards,storage:ts});let tv=targetRoom.view("p0");
  const oldNative=structuredClone(tv.decision),originalState=(await createMatchStore(ts,matchId).latestCheckpoint()).state;
  const victim=originalState.zones.battlefield.find(id=>originalState.objects[id].card==="Cankerbloom"&&originalState.objects[id].owner===1);
  ok(victim,"actual Maya casts a Cankerbloom before the native Scepter modal question");
  const begin=request(tv,{indices:[tv.decision.options.find(o=>o.refinementStages).index],staged:true});await targetRoom.act("p0",begin);tv=targetRoom.view("p0");
  await targetRoom.act("p0",request(tv,{indices:[tv.decision.options.find(o=>o.modeIndices.join(",")==="2").index]}));tv=targetRoom.view("p0");
  await targetRoom.act("p0",request(tv,{indices:[tv.decision.options.find(o=>o.target?.id===victim).index]}));
  const stale=request(targetRoom.view("p0"),{indices:[0]});await targetRoom.leave("p1","conceded");tv=targetRoom.view("p0");
  ok(tv.decision.id!==oldNative.id,"actual target-owner departure reoffers a new authoritative native effect-play generation");
  const fresh=(await createMatchStore(ts,matchId).latestCheckpoint()).state;
  ok(!fresh.awaiting.choices.some(a=>(a.targets??[]).some(t=>t?.kind==="object"&&t.id===victim)),"the original native cached choices no longer include the departed Boros target");
  ok(!fresh.players[0].lost&&!fresh.players[2].lost,"two actual seats continue after the target owner's departure");
  const saved=targetRoom.fingerprint();await assert.rejects(()=>targetRoom.act("p0",stale),/expired|changed/i);checks++;eq(targetRoom.fingerprint(),saved,"old private confirmation cannot submit an index to the fresh native generation");
  await targetRoom.act("p0",begin);eq(targetRoom.fingerprint(),saved,"accepted old opening retry never reopens the expired private child");
  const reloaded=await openRoom({storage:ts,cards,matchId});eq(reloaded.view("p0").decision.id,tv.decision.id,"native refreshed generation survives room reload without another reindex");
  ok((await replayMatch({storage:ts,cards,matchId})).same,"actual effect-cast target departure, native generation refresh and stale retry replay exactly");
 }
}
{
 const {storage,store,matchId}=await prepare("random");let room=await openRoom({storage,cards,matchId}),v=room.view("p0");
 const before=await store.latestCheckpoint(),record=await storage.get(`room/${matchId}`);
 ok(!v.decision.refinementStages,"the actual Magus room first asks its mandatory native roll");
 await assert.rejects(()=>room.act("p0",request(v,{indices:[0],staged:true})),/roll|native mode/i);checks++;
 eq(await storage.get(`room/${matchId}`),record,"refused private entry before the native roll changes no question or receipt");
 eq((await store.latestCheckpoint()).rng,before.rng,"refused private entry cannot consume the room RNG stream");
 await room.act("p0",request(v,{indices:[0]}));v=room.view("p0");
 const rolled=await store.latestCheckpoint(),entry=rolled.state.stack.find(e=>e.stackId===rolled.state.awaiting?.stackId);
 ok(rolled.rng.draws>before.rng.draws,"the native room handler commits the actual random roll");
 ok(Number.isInteger(entry?.randomMode),"the actual room saves its selected random mode on the stack");
 ok(entry.randomMode<2,"this actual room fixture rolled a mode with one mandatory native target");
 eq(v.decision.refinementStages.modeSelection,"locked","post-roll room refinement advertises locked modes only");
 const original=JSON.parse(await storage.get(`room/${matchId}`)).controller.pending;
 await room.act("p0",request(v,{indices:[0],staged:true}));v=room.view("p0");
 eq(v.decision.stage,"targets","the post-roll private child starts at the actual native targets");
 ok(!v.decision.refinement.canBack,"the first post-roll target cannot Back across a native random commitment");
 const locked=await storage.get(`room/${matchId}`);
 await assert.rejects(()=>room.act("p0",request(v,{back:true,indices:[0]})),/Back|boundary/i);checks++;
 eq(await storage.get(`room/${matchId}`),locked,"forged post-roll Back leaves native state, child and receipts unchanged");
 await room.act("p0",request(v,{kind:"cancel",indices:[]}));
 eq(JSON.parse(await storage.get(`room/${matchId}`)).controller.pending,original,"closing the post-roll child keeps the live forced native target question");
 eq((await store.latestCheckpoint()).rng,rolled.rng,"closing private targets cannot undo or repeat the native roll");
 room=await openRoom({storage,cards,matchId});v=room.view("p0");await room.act("p0",request(v,{indices:[0]}));
 const final=await store.latestCheckpoint();eq(final.state.stack.find(e=>e.stackId===entry.stackId).modes,[entry.randomMode],"the original native target handler keeps the rolled mode");
 eq(final.rng,rolled.rng,"the original native target answer never rolls again");
 ok((await replayMatch({storage,cards,matchId})).same,"native roll, refused Back, child close/reload and locked target continuation replay exactly");
}
console.log(`room-committed-refinement: ${checks} checks; actual Ao/Shadrix/Scepter/Magus, live mandatory questions, private close/reload/replay and native confirmation once`);
