/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
/* New saved-room fixtures, not Commander/pod acceptance: actual native Scepter prefix and donated Shalai setup. */
import assert from "node:assert/strict";
import {memoryStorage,createMatchStore} from "../game/engine/storage.mjs";
import {createJournal,hashState} from "../game/engine/journal.mjs";
import {createRng} from "../game/engine/rng.mjs";
import {createController} from "../game/engine/controller.mjs";
import {addObject} from "../game/engine/state/index.mjs";
import {awaitingChoice} from "../game/engine/rules/turn.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {concede} from "../game/engine/rules/sba.mjs";
import {keywordsOf} from "../game/engine/rules/layers.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {openRoom,basicCards,seatPilot,questionKey,ROOM_SCHEMA,ROOM_PROTOCOL} from "../game/room/room.mjs";
let checks=0,serial=0;
const eq=(a,b,m)=>{assert.deepEqual(a,b,m);checks++;},ok=(a,m)=>{assert.ok(a,m);checks++;};
const index=loadCardIndex(),cards=n=>index.definition(n)??basicCards(n),at=(seat,zone,...cards)=>({seat,zone,cards});
const request=(v,a)=>({kind:"answer",actionId:`00000000-0000-4000-8000-${String(++serial).padStart(12,"0")}`,revision:v.revision,choiceId:v.decision.id,...a});
async function fixture({donated=true,level="human",standing=false}={}){
 const result=runScenario({name:"native saved Scepter freshness",seats:3,setup:[at(0,"battlefield",...Array(4).fill("Wastes"),"Cankerbloom"),at(1,"battlefield","Cankerbloom"),at(0,"hand","Isochron Scepter","Boros Charm")],
  steps:[{tap:"Wastes"},{tap:"Wastes"},{cast:"Isochron Scepter"},{resolve:true},{resolve:true},{choose:["Boros Charm"]},{tap:"Wastes"},{tap:"Wastes"},{activate:"Isochron Scepter"}]},index.definition);
 const state=result.state,events=[...result.events];
 /* Valid donated-controller setup, not a claim that a separate layer-two controller route is repaired. */
 if(donated)addObject(state,{...cards("Shalai, Voice of Plenty"),card:"Shalai, Voice of Plenty",owner:2,controller:1},"battlefield");
 for(let n=0;n<4&&!state.awaiting;n++)events.push(...passPriority(state).events);
 const choice=awaitingChoice(state),target=state.zones.battlefield.find(id=>state.objects[id].card==="Cankerbloom"&&state.objects[id].owner===1);
 assert.ok(choice&&state.awaiting?.effect==="play","fixture must stop at the real initial Scepter play question");
 const storage=memoryStorage(),matchId=state.matchId,seed="native-room-refresh",store=createMatchStore(storage,matchId),journal=createJournal({matchId,seed}),rng=createRng(seed),controller=createController();controller.offer(choice);
 for(const event of events)journal.write(event.kind,event.data);
 const seats=[{seatId:"p0",name:"Rob",pilot:level==="human"?"human":"house",...(level!=="human"&&level!=="house"?{level}:{}),cards:[],commander:[]},{seatId:"p1",name:"Maya",pilot:"human",cards:[],commander:[]},{seatId:"p2",name:"Trey",pilot:"human",cards:[],commander:[]}];
 await store.saveMatch({seed,pod:{seats}});await store.appendEvents(journal.events());await store.saveCheckpoint(journal.checkpoint(state,rng.checkpoint()));
 let run={};
 if(standing){
  const future=structuredClone(state);concede(future,2);const next=awaitingChoice(future);
  /* Legacy semantic-key collision: an old answer has the same display-key bucket as the newly offered question.
     The complete old native identity/signature must still prevent its valid-looking index from being retagged. */
  run={0:{key:"fixture-run",left:1,answers:{[questionKey(next)]:{indices:[0],choiceId:choice.id,questionSignature:hashState(choice)}}}};
 }
 await storage.put(`room/${matchId}`,JSON.stringify({schema:ROOM_SCHEMA,protocol:ROOM_PROTOCOL,matchId,sequence:journal.checkpoint(state,rng.checkpoint()).sequence,seats,pendingSeat:0,pendingActions:null,controller:controller.checkpoint(),receipts:[],leaving:[],departures:{},ended:null,history:[],refusals:{total:0,since:0,first:[]},...(standing?{resolveAll:true,standing:run}:{}),events:[],eventsMark:0,eventsFloor:-1}));
 return {storage,store,matchId,target,choice,state};
}
{
 const {storage,store,matchId,target,choice}=await fixture();let room=await openRoom({storage,cards,matchId}),v=room.view("p0");
 const original=await store.latestCheckpoint(),copyIds=[...new Set(original.state.awaiting.choices.map(a=>a.objectId))];
 ok(!original.state.awaiting.choices.some(a=>a.modes?.[0]===2&&a.targets?.some(t=>t.id===target)),"real donated Shalai initially protects Maya's Cankerbloom from Boros Charm");
 const begin=request(v,{indices:[v.decision.options.find(o=>o.refinementStages).index],staged:true});await room.act("p0",begin);v=room.view("p0");
 const stale=request(v,{indices:[0]});await room.leave("p2","conceded");v=room.view("p0");
 ok(v.decision.id!==choice.id,"owner departure reoffers the original effect-play question with a new native identity");
 const refreshed=await store.latestCheckpoint();ok(refreshed.state.awaiting.choices.some(a=>a.modes?.[0]===2&&a.targets?.some(t=>t.id===target)),"removing the donated Shalai exposes the newly legal surviving Cankerbloom target");
 eq([...new Set(refreshed.state.awaiting.choices.map(a=>a.objectId))],copyIds,"native refresh retains the original copied card pool instead of making a new copy");
 eq(JSON.parse(await storage.get(`room/${matchId}`)).refinement,undefined,"native refresh discards only stale private references");
 const unchanged=room.fingerprint();await assert.rejects(()=>room.act("p0",stale),/expired|changed/i);checks++;eq(room.fingerprint(),unchanged,"old private indices cannot answer a newly legal native generation");
 await room.act("p0",begin);eq(room.fingerprint(),unchanged,"an accepted old opening retry cannot recreate the withdrawn child");
 room=await openRoom({storage,cards,matchId});v=room.view("p0");eq(v.decision.id,awaitingChoice(refreshed.state).id,"JSON reload keeps the authoritative native generation");
 await room.act("p0",request(v,{indices:[v.decision.options.find(o=>o.refinementStages).index],staged:true}));v=room.view("p0");
 await room.act("p0",request(v,{indices:[v.decision.options.find(o=>o.modeIndices.join(",")==="2").index]}));v=room.view("p0");
 await room.act("p0",request(v,{indices:[v.decision.options.find(o=>o.target?.id===target).index]}));v=room.view("p0");
 const final=request(v,{indices:[0]});await room.act("p0",final);const done=await store.latestCheckpoint();
 eq([done.state.stack.at(-1).name,done.state.stack.at(-1).modes,done.state.stack.at(-1).targets[0].id],["Boros Charm",[2],target],"private confirmation enters the original native cast handler with its new legal target");
 const once=room.fingerprint();await room.act("p0",final);eq(room.fingerprint(),once,"accepted fresh-generation confirmation retry never casts again");
 for(let n=0;n<2;n++){v=room.view(room.waitingOn);const pass=v.decision.options.find(o=>o.act==="pass");ok(pass,"the actual copied spell remains on the stack for normal priority");await room.act(v.seatId,request(v,{indices:[pass.index]}));}
 ok(keywordsOf((await store.latestCheckpoint()).state,target).includes("double strike"),"the actual native Boros effect gives the newly legal surviving creature double strike");
 eq((await store.readJournal()).filter(e=>e.kind==="GameEventSpellAbilityCast"&&e.data.fields.card.name==="Boros Charm").length,1,"the native event journal records exactly one copied Boros cast");
}
{
 const {storage,store,matchId,choice}=await fixture({standing:true}),room=await openRoom({storage,cards,matchId});await room.leave("p2","conceded");
 const next=await store.latestCheckpoint();ok(next.state.awaiting?.effect==="play","a standing answer from the old generation leaves the new native question pending");
 ok(room.view("p0").decision.id!==choice.id,"the standing run reprompts for the actual refreshed generation");
 eq(next.state.stack.length,0,"the old standing index cannot silently cast or retarget a newly offered variant");
 eq(room.refusals.total,0,"clearing an unbound standing answer does not conceal a refused pilot input");
}
for(const level of ["house","easy","normal"]){
 const {storage,store,matchId,choice}=await fixture({level}),seen=[];
 const pilot=args=>{const base=seatPilot(args);return {...base,answer(view,q){seen.push(structuredClone(q));return base.answer(view,q);}};};
 const room=await openRoom({storage,cards,matchId,pilot});await room.leave("p2","conceded");
 ok(seen.some(q=>q.id!==choice.id&&q.id.startsWith("play:")),`${level}: actual house pilot answers the newly derived native generation`);
 eq(room.refusals.total,0,`${level}: a current-generation pilot answer commits without stale-ID refusal or fallback`);
 ok((await store.latestCheckpoint()).state.awaiting?.effect!=="play",`${level}: the native handler consumes the current effect-play question`);
 const before=room.fingerprint();await assert.rejects(()=>room.leave("p2","conceded"),/already left/i);checks++;eq(room.fingerprint(),before,`${level}: repeated departure cannot repeat the native answer`);
 const reopened=await openRoom({storage,cards,matchId,pilot});eq(reopened.fingerprint(),before,`${level}: JSON reload does not repeat a house answer or generation refresh`);
}
console.log(`room-effect-play-refresh: ${checks} checks; native target generations, donated Shalai, private/standing expiry and current house/easy/normal answers`);
