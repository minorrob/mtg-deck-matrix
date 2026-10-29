/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
import assert from "node:assert/strict";
import {createState, addObject, removeObject} from "../game/engine/state/index.mjs";
import {projectFor} from "../game/engine/projection.mjs";
import {attackers, blockers, combatDamage, endCombat} from "../game/engine/rules/combat.mjs";
import {seatPilot} from "../game/room/room.mjs";
import {rememberDamage, combatMemoryFor} from "../game/engine/pilots/provocation.mjs";
import {runEffect} from "../game/engine/script/effects/index.mjs";
import {controllerOf} from "../game/engine/rules/layers.mjs";

let checks = 0;
const eq = (a,b,message) => {assert.deepEqual(a,b,message);checks++;};
const ok = (a,message) => {assert.ok(a,message);checks++;};
function fixture() {
  const state=createState({matchId:"salty",seed:"salty",players:["Sable","Weak","Trampler","Other"].map(name=>({name}))});
  state.turn=5;state.activePlayer=0;state.phase="COMBAT_DECLARE_ATTACKERS";
  state.players[1].life=27;
  const creature=(name,owner,power,toughness,keywords=[])=>{
    const id=addObject(state,{card:name,owner,controller:owner,types:["Creature"],power,toughness,keywords},"battlefield");
    state.objects[id].controlledSinceTurn=0;return id;
  };
  const mine=[0,1,2].map(i=>creature(`Guard ${i}`,0,2,2));
  const trampler=creature("Huge trampler",2,12,12,["Trample"]);
  return {state,mine,trampler};
}
function combat(state,mine,memory,sequence,round) {
  state.turn=5+round*4;state.activePlayer=0;state.phase="COMBAT_DECLARE_ATTACKERS";
  state.players[0].turnBegan=state.turn;
  for(const id of mine)state.objects[id].tapped=false;
  ok(attackers.open(state),"actual rules open the attack declaration");
  const choice=attackers.choice(state,state.awaiting);
  const view={...projectFor(state,0),pilotCombat:combatMemoryFor(memory,0,state.turn,4)};
  const answer=seatPilot({seat:0,level:"normal",persona:"sable",seed:"salty"}).answer(view,choice);
  const target=choice.options.find(o=>o.index===answer.indices[0])?.defenderId;
  ok(answer.indices.length>0,"there is a profitable actual attack");
  attackers.resolve(state,state.awaiting,answer.indices);
  let after=null;
  while(blockers.open(state,after)){after=state.awaiting.player;blockers.resolve(state,state.awaiting,[]);}
  state.phase="COMBAT_DAMAGE";
  eq(combatDamage.open(state),false,"unblocked Guards need no damage allocation question");
  const events=combatDamage.deal(state);
  const damage=events.filter(e=>e.kind==="GameEventPlayerDamaged");
  const damageAmount=damage.reduce((n,e)=>n+e.data.fields.amount,0);
  eq(damageAmount,answer.indices.reduce((n,i)=>n+state.objects[choice.options[i].cardId].power,0),"unblocked declared creatures deal their actual damage");
  for(const event of events)memory=rememberDamage(memory,event,`event:${++sequence}`,4);
  endCombat(state);
  return {target,memory,sequence,damageAmount,answer};
}
{
  const {state,mine}=fixture();let memory=null,sequence=0;const targets=[];
  for(let round=0;round<3;round++){
    const out=combat(state,mine,memory,sequence,round);targets.push(out.target);memory=JSON.parse(JSON.stringify(out.memory));sequence=out.sequence;
    eq(out.damageAmount,6,"each of the three combat turns actually deals six damage");
  }
  ok(new Set(targets).size>=2,"unprovoked Sable does not send three consecutive attacks at only the weakest board");
  ok(!targets.includes(2),"salty pressure does not throw a Guard into the untapped 12/12");
  eq(state.players.slice(1).reduce((n,p)=>n+(p.id===1?27:40)-p.life,0),18,"all eighteen damage is actual combat damage");
}
{
  const {state,mine}=fixture();
  const source=addObject(state,{card:"Borrowed public source",owner:1,controller:3,types:["Instant"]},"stack");
  const events=runEffect(state,{effect:"dealDamage",amount:6,toPlayer:0},{controller:3,source});
  const hit=events.find(e=>e.kind==="GameEventPlayerDamaged");
  eq([state.players[0].life,hit.data.fields.source.owner,hit.data.fields.source.controller],[34,1,3],"real damage belongs to the source's controller, not its owner");
  removeObject(state,source);
  const memory=rememberDamage(null,hit,"event:9",4);
  eq(combatMemoryFor(memory,0,5,4).taken,{1:0,2:0,3:6},"a departed source retains the actual public controller attribution");
  eq(rememberDamage(memory,hit,"event:9",4),memory,"replayed event identity does not accumulate provocation twice");
  eq(combatMemoryFor(memory,0,17,4).taken[3],3,"a grudge decays over three table rounds");
  ok(!JSON.stringify(memory).includes("Borrowed"),"no card name or private card fact enters the saved memory");
  eq(combat(state,mine,memory,9,0).target,3,"an actual hit provokes a viable retaliation instead of blaming the weak seat without evidence");
}
{
  const {state}=fixture();
  const source=addObject(state,{card:"Stolen damage source",owner:3,controller:3,types:["Artifact"]},"battlefield");
  state.effects=[{id:"stolen",layer:2,timestamp:1,affects:{ids:[source]},apply:{controller:1}}];
  eq(controllerOf(state,source),1,"an actual layer-two effect gives the damage source to seat one");
  const hit=runEffect(state,{effect:"dealDamage",amount:4,toPlayer:0},{controller:1,source}).find(e=>e.kind==="GameEventPlayerDamaged");
  eq(hit.data.fields.source.controller,1,"committed damage reports its source's actual layered controller");
  eq(combatMemoryFor(rememberDamage(null,hit,"event:1",4),0,5,4).taken[1],4,"salt attributes a layered stolen source to the player who actually controlled it");
}
{
  const {state}=fixture();
  const source=addObject(state,{card:"Public source",owner:1,controller:1,types:["Artifact"]},"battlefield");
  addObject(state,{card:"Public prevention",owner:0,controller:0,types:["Enchantment"],abilities:[{kind:"replacement",watches:{event:"damage",toPlayer:"you"},change:{prevent:6}}]},"battlefield");
  const prevented=runEffect(state,{effect:"dealDamage",amount:6,toPlayer:0},{controller:1,source});
  let memory=null;for(const [i,event] of prevented.entries())memory=rememberDamage(memory,event,`event:${i+1}`,4);
  eq(state.players[0].life,40,"six prevented damage does not lower life");
  eq(combatMemoryFor(memory,0,5,4).taken[1],0,"prevented damage does not build salt");
  const life=runEffect(state,{effect:"loseLife",who:"you",amount:3},{controller:0,source:null});
  for(const [i,event] of life.entries())memory=rememberDamage(memory,event,`event:${i+100}`,4);
  eq(combatMemoryFor(memory,0,5,4).taken[1],0,"a life payment or life loss does not invent an attacker");
  const self=runEffect(state,{effect:"dealDamage",amount:9,toPlayer:1},{controller:1,source});
  for(const [i,event] of self.entries())memory=rememberDamage(memory,event,`event:${i+200}`,4);
  eq(combatMemoryFor(memory,1,5,4).taken[1],undefined,"self damage is not a grudge against an opponent");
  eq(memory.hits[1]?.[1],undefined,"self damage is absent from saved opponent history too");
}
{
  const {state,mine}=fixture();
  const other=addObject(state,{card:"Another public threat",owner:3,controller:3,types:["Creature"],power:8,toughness:8},"battlefield");
  state.objects[other].tapped=true;
  eq(combat(state,mine,null,0,0).target,3,"with multiple public threats, a profitable hit at the open threatening seat beats unrelated weak-seat pressure");
}
{
  const {state,mine}=fixture();state.players[1].life=6;
  const out=combat(state,mine,null,0,0);
  eq([out.target,state.players[1].life],[1,0],"a real available lethal still beats spreading nonlethal pressure");
}
{
  const {state,mine,trampler}=fixture();state.players[0].life=9;Object.assign(state.objects[mine[0]],{power:4,toughness:4});
  const out=combat(state,mine,null,0,0);
  ok(!state.objects[mine[0]].tapped,"the useful 4/4 blocker remains home against the 12/12 trampler");
  ok(out.answer.indices.length<3,"salt does not send every creature when the swing back needs a blocker");
  state.turn++;state.activePlayer=2;state.players[2].turnBegan=state.turn;state.phase="COMBAT_DECLARE_ATTACKERS";
  ok(attackers.open(state),"the real 12/12 gets its following attack step");
  const attack=attackers.choice(state,state.awaiting).options.find(o=>o.cardId===trampler&&o.defenderId===0);
  attackers.resolve(state,state.awaiting,[attack.index]);
  ok(blockers.open(state),"Sable is actually asked to block the incoming trampler");
  const choice=blockers.choice(state,state.awaiting);
  const answer=seatPilot({seat:0,level:"normal",persona:"sable",seed:"salty"}).answer({...projectFor(state,0),pilotCombat:combatMemoryFor(out.memory,0,state.turn,4)},choice);
  ok(answer.indices.some(i=>choice.options[i].cardId===mine[0]),"the held 4/4 actually blocks the 12/12");
  blockers.resolve(state,state.awaiting,answer.indices);
  state.phase="COMBAT_DAMAGE";
  ok(combatDamage.open(state),"trample actually requires a damage allocation");
  const damageChoice=combatDamage.choice(state,state.awaiting);
  combatDamage.resolve(state,state.awaiting,damageChoice.options.map(o=>o.defender?8:4));
  const events=combatDamage.deal(state);
  eq(events.filter(e=>e.kind==="GameEventPlayerDamaged").reduce((n,e)=>n+e.data.fields.amount,0),8,"the useful blocker absorbs four actual trample damage");
  eq(state.players[0].life,1,"Sable survives the actual swing back by reserving and using the blocker");
}
console.log(`engine-salty-pilot: ${checks} checks passed; actual combat pressure follows public provocation and threats`);
