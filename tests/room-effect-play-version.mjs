/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
/* Versioned native effect-play choices: current live starts, exact older sourceChoices:true tape replay. */
import assert from "node:assert/strict";
import {readFileSync,writeFileSync} from "node:fs";
import {memoryStorage,createMatchStore} from "../game/engine/storage.mjs";
import {hashState} from "../game/engine/journal.mjs";
import {startRoom,openRoom,basicCards,leastAnswer} from "../game/room/room.mjs";
import {replayTape,replayMatch} from "../game/room/replay.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
let checks=0,serial=0;
const eq=(a,b,m)=>{assert.deepEqual(a,b,m);checks++;},ok=(a,m)=>{assert.ok(a,m);checks++;};
const index=loadCardIndex(),cards=n=>index.definition(n)??basicCards(n),fixture=new URL("./fixtures/effect-play-legacy-tape.json",import.meta.url);
const request=(v,a)=>({kind:"answer",actionId:`00000000-0000-4000-9000-${String(++serial).padStart(12,"0")}`,revision:v.revision,choiceId:v.decision.id,...a});
/* Capture once BEFORE the version implementation. A later run must not replace this historical proof. */
if(process.argv.includes("--capture-legacy")){
 const storage=memoryStorage(),matchId="legacy-effect-play",store=createMatchStore(storage,matchId),seed="legacy-effect-play",pod={sourceChoices:true,passEmpty:true,passAfterCast:true,pooledTaps:true,seats:[
  {seatId:"p0",name:"Rob",pilot:"human",commander:[],cards:Array.from({length:60},(_,n)=>["Wastes","Wastes","Isochron Scepter","Boros Charm","Wastes","Wastes"][n%6])},
  {seatId:"p1",name:"Maya",pilot:"human",commander:[],cards:Array(60).fill("Forest")} ]};
 const room=await startRoom({storage,cards,matchId,pod,seed});let observed=null;
 for(let n=0;n<1600;n++){
  const v=room.view(room.waitingOn),d=v.decision,field=v.state.players[0].zones.Battlefield.cards;
  if(v.seat===0&&d.id.startsWith("play:")){
   const point=await store.latestCheckpoint();assert.ok(!Object.hasOwn(point.state,"effectPlayVersion"),"capture must use the real pre-version state shape");
   assert.ok(!Object.hasOwn(point.state.awaiting,"playOrigin"),"capture must use the real pre-generation effect-play question");
   observed=d.id;const at=point.state.awaiting.choices.findIndex(a=>a.modes?.join(",")==="1");assert.ok(at>=0);
   await room.act("p0",request(v,{indices:[at]}));break;
  }
  let option=d.options.find(o=>/keep/i.test(o.label))??d.options.find(o=>o.act==="play-land");
  if(!option&&v.seat===0){
   if(!field.some(c=>c.name==="Isochron Scepter"))option=d.options.find(o=>o.act==="cast"&&o.label==="Isochron Scepter");
   option??=d.options.find(o=>o.label==="Boros Charm"&&!o.act);
   if(!option&&v.state.players[0].zones.Exile.cards.some(c=>c.name==="Boros Charm"))option=d.options.find(o=>o.act==="activate"&&o.label==="Isochron Scepter")??d.options.find(o=>o.act==="activate-mana"&&o.label==="Wastes");
  }
  option??=d.options.find(o=>o.act==="pass");await room.act(v.seatId,request(v,option?{indices:[option.index]}:leastAnswer(d)));
 }
 assert.ok(observed,"actual legacy room must reach and answer the real Scepter native play question");
 const meta=await store.loadMatch(),data={schema:"CrankHistoricalEffectPlayFixture@1",sourceCommit:"3bde4caa",matchId,seed,pod:meta.pod,nativeChoiceId:observed,tape:await store.readTape(),fingerprint:room.fingerprint(),journalHash:hashState(await store.readJournal())};
 writeFileSync(fixture,JSON.stringify(data,null,2)+"\n");console.log(`captured historical native effect-play fixture: ${data.tape.length} actual inputs, ${observed}`);
}else{
 const data=JSON.parse(readFileSync(fixture,"utf8")),storage=memoryStorage();
 eq(data.pod.sourceChoices,true,"the historical fixture already required explicit source choices before native play generations existed");
 ok(!Object.hasOwn(data.pod,"effectPlayVersion"),"historical replay preserves an absent version rather than rewriting it as zero");
 ok(data.tape.some(t=>t.answer?.choiceId===data.nativeChoiceId),"the historical tape contains the actual original native Scepter play ID");
 const old=await replayTape({...data,storage,cards}),store=createMatchStore(storage,data.matchId),point=await store.latestCheckpoint();
 eq(old.fingerprint(),data.fingerprint,"old sourceChoices:true tape reaches the exact pre-version native state and counters");
 eq(hashState(await store.readJournal()),data.journalHash,"the complete historical event journal retains its original IDs and contents");
 ok(!Object.hasOwn(point.state,"effectPlayVersion"),"replay does not add a version field to the historical state hash");
 ok((await replayMatch({storage,cards,matchId:data.matchId})).same,"the saved historical replay reopens and replays identically a second time");
 for(const version of [0,false,2]){
  await assert.rejects(()=>replayTape({...data,pod:{...data.pod,effectPlayVersion:version},cards}),/unsupported saved effect-play version/i);checks++;
 }
 for(const supplied of [undefined,0,false,2,1]){
  const storage=memoryStorage(),matchId=`live-version-${String(supplied)}`,pod={sourceChoices:true,...(supplied!==undefined?{effectPlayVersion:supplied}:{}),seats:data.pod.seats};
  let room=await startRoom({storage,cards,matchId,pod,seed:data.seed}),store=createMatchStore(storage,matchId);
  eq((await store.loadMatch()).pod.effectPlayVersion,1,`new live start forces the recorded current version despite supplied ${String(supplied)}`);
  eq((await store.latestCheckpoint()).state.effectPlayVersion,1,`new live native state requires the current version despite supplied ${String(supplied)}`);
  const view=room.view(room.waitingOn);await room.act(view.seatId,request(view,{indices:[view.decision.options.find(o=>/keep/i.test(o.label)).index]}));
  const before=room.fingerprint();room=await openRoom({storage,cards,matchId});eq(room.fingerprint(),before,"current-version saved native state survives JSON reload");
  ok((await replayMatch({storage,cards,matchId})).same,"current-version recorded pod/tape replays with its original state shape");
 }
 console.log(`room-effect-play-version: ${checks} checks; exact historical sourceChoices tape, current live version and rejected opt-out`);
}
