/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
/* Native saved-room setup for a proposed Play regression. Not a pod/deck-load acceptance fixture. */
import assert from "node:assert/strict";
import {createState,addObject} from "../../../../game/engine/state/index.mjs";
import {createJournal} from "../../../../game/engine/journal.mjs";
import {createRng} from "../../../../game/engine/rng.mjs";
import {createController} from "../../../../game/engine/controller.mjs";
import {beginGame,advance,awaitingChoice} from "../../../../game/engine/rules/turn.mjs";
import {passPriority} from "../../../../game/engine/rules/priority.mjs";
import {memoryStorage,createMatchStore} from "../../../../game/engine/storage.mjs";
import {loadCardIndex} from "../../../../game/tools/engine-cards.mjs";
import {openRoom,basicCards,ROOM_SCHEMA,ROOM_PROTOCOL} from "../../../../game/room/room.mjs";
const index=loadCardIndex();export const cards=name=>index.definition(name)??basicCards(name);
let serial=0;
export const request=(v,answer)=>({kind:"answer",actionId:`00000000-0000-4000-8001-${String(++serial).padStart(12,"0")}`,revision:v.revision,choiceId:v.decision.id,...answer});
export async function snoopRoom(){
 const matchId="snoop-browser-native",seed="snoop-browser-native",seats=[{seatId:"p0",name:"Rob",pilot:"human",cards:[],commander:[]},{seatId:"p1",name:"Maya",pilot:"human",cards:[],commander:[]}];
 const state=createState({matchId,seed,players:seats.map(s=>({name:s.name})),sourceChoices:true,effectPlayVersion:1,drawBeat:true,skipFirstDraw:false});
 const put=(seat,zone,name)=>addObject(state,{...cards(name),card:name,owner:seat,controller:seat},zone,zone==="battlefield"?null:seat);
 const snoop=put(0,"battlefield","Conspicuous Snoop");for(let n=0;n<3;n++)put(0,"battlefield","Mountain");put(0,"hand","Lightning Bolt");
 const first=put(0,"library","Mogg Fanatic"),second=put(0,"library","Goblin Instigator"),third=put(0,"library","Mountain");
 for(let n=0;n<20;n++){put(0,"library","Mountain");put(1,"library","Island");}
 const rng=createRng(seed),events=[...beginGame(state)];
 for(let n=0;n<30&&!state.awaiting;n++)events.push(...(state.priorityPlayer===null?advance(state):passPriority(state,null,rng).events));
 assert.equal(state.awaiting?.kind,"draw-card","fixture must reach the actual native held draw");
 const storage=memoryStorage(),store=createMatchStore(storage,matchId),journal=createJournal({matchId,seed}),controller=createController();controller.offer(awaitingChoice(state));
 for(const event of events)journal.write(event.kind,event.data);
 await store.saveMatch({seed,pod:{seats,sourceChoices:true,effectPlayVersion:1,drawBeat:true,skipFirstDraw:false}});await store.appendEvents(journal.events());await store.saveCheckpoint(journal.checkpoint(state,rng.checkpoint()));
 await storage.put(`room/${matchId}`,JSON.stringify({schema:ROOM_SCHEMA,protocol:ROOM_PROTOCOL,matchId,seats,sequence:journal.checkpoint(state,rng.checkpoint()).sequence,pendingSeat:0,pendingActions:null,controller:controller.checkpoint(),receipts:[],leaving:[],departures:{},ended:null,history:[],refusals:{total:0,since:0,first:[]},passStack:true,passEmpty:true,passAfterCast:true,events:[],eventsMark:0,eventsFloor:-1}));
 const room=await openRoom({storage,cards,matchId});
 return {room,store,storage,matchId,snoop,first,second,third};
}
export async function mainAndFund(room){
 for(let n=0;n<30;n++){
  const v=room.view(room.waitingOn);if(v.state.phase==="MAIN1"&&v.seat===0)break;
  const pass=v.decision.options.find(o=>o.act==="pass");assert.ok(pass,"normal native priority must reach main phase without a fabricated decision");await room.act(v.seatId,request(v,{indices:[pass.index]}));
 }
 for(let n=0;n<2;n++){const v=room.view("p0"),tap=v.decision.options.find(o=>o.act==="activate-mana"&&o.label==="Mountain");assert.ok(tap);await room.act("p0",request(v,{indices:[tap.index]}));}
}
export async function killSnoop({room,storage,matchId,snoop}){
 let v=room.view("p0"),record=JSON.parse(await storage.get(`room/${matchId}`)),at=record.pendingActions.findIndex(a=>a.kind==="cast"&&a.label==="Lightning Bolt"&&a.targets?.some(t=>t?.id===snoop));
 assert.ok(at>=0,"actual Lightning Bolt must legally target the actual Snoop");await room.act("p0",request(v,{indices:[at]}));
 for(let n=0;n<8;n++){v=room.view(room.waitingOn);if(!v.state.players[0].zones.Battlefield.cards.some(c=>c.cardId===snoop))return;
  const pass=v.decision.options.find(o=>o.act==="pass");await room.act(v.seatId,request(v,{indices:[pass?.index??0]}));}
 throw new Error("actual native Bolt failed to remove Snoop");
}
export async function verifyNativeSnoop(){
 const fixture=await snoopRoom(),{room,store,first,second,third}=fixture,v=room.view("p0");
 assert.equal(v.decision.kind,"draw");assert.equal(v.state.players[0].zones.Library.cards[0].cardId,first);
 assert.equal(room.view("p1").state.players[0].zones.Library.cards[0].cardId,first);assert.equal(room.watch().state.players[0].zones.Library.cards[0].cardId,first);
 assert.deepEqual(v.state.players[1].zones.Library.cards,[]);await room.act("p0",request(v,{indices:[0]}));
 assert.equal(room.view("p0").state.players[0].zones.Library.cards[0].cardId,second);await mainAndFund(room);
 const current=room.view("p0"),record=JSON.parse(await fixture.storage.get(`room/${fixture.matchId}`)),at=record.pendingActions.findIndex(a=>a.kind==="cast"&&a.objectId===second);assert.ok(at>=0);
 await room.act("p0",request(current,{indices:[at]}));assert.equal(room.view("p0").state.players[0].zones.Library.cards[0].cardId,third);
 await killSnoop(fixture);assert.deepEqual(room.view("p0").state.players[0].zones.Library.cards,[]);assert.deepEqual(room.view("p1").state.players[0].zones.Library.cards,[]);assert.deepEqual(room.watch().state.players[0].zones.Library.cards,[]);
 assert.ok((await store.latestCheckpoint()).state.zones.graveyard[0].length>0);return fixture;
}
