/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
import assert from "node:assert/strict";
import {memoryStorage} from "../game/engine/storage.mjs";
import {startRoom,openRoom,basicCards,seatPilot} from "../game/room/room.mjs";
import {replayMatch} from "../game/room/replay.mjs";

let checks=0,serial=0;
const eq=(a,b,message)=>{assert.deepEqual(a,b,message);checks++;};
const ok=(a,message)=>{assert.ok(a,message);checks++;};
const cards=name=>name==="Public Ping"?{types:["Sorcery"],manaCost:"{0}",spell:{id:"ping",text:"Deal three damage to a player.",
  targets:[{what:"player"}],effects:[{effect:"dealDamage",amount:3,who:{target:0}}]}}:basicCards(name);
const views=[];
const pilot=args=>{
  const actual=seatPilot(args),observe=v=>views.push({seat:args.seat,turn:v.turn,memory:structuredClone(v.pilotCombat)});
  return {...actual,answer(v,c){observe(v);return actual.answer(v,c);},choose(v,a){observe(v);return actual.choose(v,a);}};
};
const storage=memoryStorage();
let room=await startRoom({storage,cards,pilot,matchId:"provocation",seed:"provocation",pod:{passEmpty:true,houseRules:{undoLastPlay:true},seats:[
  {seatId:"person",name:"Person",pilot:"human",commander:[],cards:Array(99).fill("Public Ping")},
  ...["Sable","Trey","Lee"].map((name,i)=>({seatId:`s${i+1}`,name,pilot:"house",level:"normal",...(i===0?{persona:"sable"}:{}),commander:[],cards:Array(99).fill("Plains")}))]}});
const see=()=>room.view(room.waitingOn);
const request=(v,indices)=>({kind:"answer",actionId:`00000000-0000-4000-8000-${String(++serial).padStart(12,"0")}`,revision:v.revision,choiceId:v.decision.id,indices});
const take=async(v,option)=>room.act(v.seatId,request(v,[option.index]));
async function until(stop){
  for(let n=0;n<200;n++){
    const v=see();if(stop(v))return v;
    const option=v.decision.options.find(o=>o.act==="pass")??v.decision.options.find(o=>/keep/i.test(o.label))??v.decision.options[0];
    await take(v,option);
  }
  throw new Error("the native room did not reach the expected public decision");
}
let view=await until(v=>v.decision.options.some(o=>o.act==="cast"&&o.label==="Public Ping"&&/Sable/.test(o.detail??"")));
const offer=view.decision.options.find(o=>o.act==="cast"&&o.label==="Public Ping"&&/Sable/.test(o.detail??""));
const cast=request(view,[offer.index]);await room.act(view.seatId,cast);
view=see();eq(view.state.stack.at(-1).targets,[{kind:"player",id:1}],"the actual room cast targets Sable");
await until(v=>v.state.players[1].life===37);
const saved=JSON.parse(await storage.get("room/provocation"));
eq(saved.pilotCombatMemory.hits[1][0].amount,3,"three actual damage is persisted against the public source controller");
ok(!JSON.stringify(saved.pilotCombatMemory).includes("Ping"),"the host's compact memory stores no card names");
const before=room.fingerprint();
room=await openRoom({storage,cards,pilot,matchId:"provocation"});
eq(room.fingerprint(),before,"reopening preserves the actual engine fingerprint");
await room.act("person",cast);
eq(room.fingerprint(),before,"an accepted retry does not repeat damage or events");
eq(JSON.parse(await storage.get("room/provocation")).pilotCombatMemory,saved.pilotCombatMemory,"accepted retry does not accumulate pressure again");
view=see();
await assert.rejects(()=>room.act("person",request(view,[99999])),/invalid|offered|selection/i);checks++;
eq(JSON.parse(await storage.get("room/provocation")).pilotCombatMemory,saved.pilotCombatMemory,"a refused answer restores the saved memory");
const mark=views.length;
for(let n=0;n<8&&!views.slice(mark).some(v=>v.seat===1&&v.memory?.taken?.[0]>0);n++){
  view=see();await take(view,view.decision.options.find(o=>o.act==="pass")??view.decision.options[0]);
}
const sable=views.slice(mark).find(v=>v.seat===1&&v.memory?.taken?.[0]>0);
ok(sable,"the actual recreated Salty pilot receives its persisted public hit history");
ok(sable.memory.taken[0]>0&&sable.memory.taken[0]<=3,"only the real three damage, with elapsed-turn decay, provokes it");
eq(room.view("person").state.pilotCombat,undefined,"the pilot-only summary does not change the public room-view schema");
view=await until(v=>v.decision.options.some(o=>o.act==="cast"&&o.label==="Public Ping"&&/Sable/.test(o.detail??"")));
const beforeUndo=JSON.parse(await storage.get("room/provocation")).pilotCombatMemory;
await take(view,view.decision.options.find(o=>o.act==="cast"&&o.label==="Public Ping"&&/Sable/.test(o.detail??"")));
view=see();ok(view.canUndo,"the uncommitted new cast has a real undo window");
await take(view,view.decision.options.find(o=>o.act==="undo-play"));
eq(see().state.players[1].life,37,"undoing the new cast deals no new damage");
eq(JSON.parse(await storage.get("room/provocation")).pilotCombatMemory,beforeUndo,"a native cast undo preserves only the earlier committed damage memory");
ok((await replayMatch({storage,cards,pilot,matchId:"provocation"})).same,"damage, refusal, accepted retry, reopen and undo replay to the same native room and journal");
const cleanStorage=memoryStorage();
await startRoom({storage:cleanStorage,cards,matchId:"new-provocation",seed:"new",pod:{seats:[0,1].map(i=>({seatId:`p${i}`,name:`P${i}`,pilot:"human",commander:[],cards:Array(40).fill("Plains")}))}});
eq(JSON.parse(await cleanStorage.get("room/new-provocation")).pilotCombatMemory,undefined,"a new match begins with no old grudge");
console.log(`room-pilot-provocation: ${checks} checks; native damage, retry/refusal, saved memory and actual pilot reopening`);
