/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
import assert from "node:assert/strict";
import {createState,addObject,moveObject} from "../game/engine/state/index.mjs";
import {applyAction,legalActions} from "../game/engine/rules/actions.mjs";
import {awaitingChoice,resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {beginResolution} from "../game/engine/script/resolution.mjs";
import {runEffect} from "../game/engine/script/effects/index.mjs";
import {projectFor} from "../game/engine/projection.mjs";
import {seatPilot} from "../game/room/room.mjs";
import {concede} from "../game/engine/rules/sba.mjs";
import {beforeProposal,retainProposal} from "../game/engine/rules/cancel.mjs";
let checks=0;
const eq=(a,b,m)=>{assert.deepEqual(a,b,m);checks++;};
const ok=(a,m)=>{assert.ok(a,m);checks++;};
const refuses=(fn,re,m)=>{assert.throws(fn,re,m);checks++;};
function fixture(){
  const s=createState({matchId:"cancel",seed:"cancel",players:[{name:"A"},{name:"B"},{name:"C"},{name:"D"}]});
  s.phase="MAIN1";s.stepIndex=3;s.activePlayer=0;s.priorityPlayer=0;s.turn=5;s.passes=2;s.pendingTriggers=[];
  const bear=addObject(s,{card:"Helper",owner:0,controller:0,types:["Creature"],power:2,toughness:2},"battlefield");
  const spell=addObject(s,{card:"Convoke proposal",owner:0,controller:0,types:["Sorcery"],manaCost:"{1}",keywords:["Convoke"],spell:{id:"s",targets:[],effects:[{effect:"gainLife",who:"you",amount:1}]}},"hand",0);
  const action=legalActions(s,0).find(a=>a.kind==="cast"&&a.objectId===spell&&a.convoke);
  ok(action,"a real four-seat cast is offered by convoking the untapped Helper");
  return {s,bear,spell,action};
}
{
  const {s,action}=fixture(),before=structuredClone(s);
  eq(applyAction(s,0,action),[],"the actual cast stops before costs and has no committed events");
  eq([s.awaiting.kind,s.priorityPlayer],["choose-cost",null],"the engine actually waits on the convoke choice");
  eq(resolveAwaiting(s,[],null,null,{cancel:true}),[],"cancelling the native proposal commits no events");
  eq(s,before,"Cancel restores the entire original state, including passes, mana, zones, objects and priority");
}
{
  const {s,action}=fixture();applyAction(s,0,action);
  const restored=JSON.parse(JSON.stringify(s));
  eq(awaitingChoice(restored).cancellation?.allowed,true,"the precommit cancellation proof survives JSON save/reload");
  resolveAwaiting(restored,[],null,null,{cancel:true});
  eq([restored.awaiting,restored.priorityPlayer,restored.passes],[null,0,2],"a reloaded proposal returns the original actor and pass count");
}
{
  const {s}=fixture();
  const spell=addObject(s,{card:"Optional target proposal",owner:0,controller:0,types:["Sorcery"],manaCost:"{0}",spell:{id:"s",targets:[{what:"permanent",types:["Creature"],count:{max:2}}],effects:[{effect:"destroy",targets:{target:0}}]}},"hand",0);
  applyAction(s,0,legalActions(s,0).find(a=>a.kind==="cast"&&a.objectId===spell));
  eq(awaitingChoice(s).min,0,"the historical proposal's counted target really permits zero targets");
  delete s.awaiting.precommit;
  const before=structuredClone(s);
  eq(awaitingChoice(s).cancellation.allowed,false,"an old unproved action cannot reinterpret Cancel as casting with no targets");
  refuses(()=>resolveAwaiting(s,[],null,null,{cancel:true}),/reversible|cannot.*cancel/i,"Cancel never commits the old action as an empty optional choice");
  eq(s,before,"the old optional-target proposal remains wholly uncommitted");
}
{
  const {s,action}=fixture();applyAction(s,0,action);
  delete s.awaiting.precommit;
  const before=structuredClone(s);
  refuses(()=>resolveAwaiting(s,[],null,null,{cancel:true}),/saved|reversible|cannot.*cancel/i,"an old saved proposal without a proof is conservatively refused");
  eq(s,before,"an unsupported old saved proposal is preserved byte for byte");
}
{
  const {s,action}=fixture();applyAction(s,0,action);
  runEffect(s,{effect:"loseLife",who:"you",amount:1},{controller:0,source:null});
  const before=structuredClone(s);
  eq(awaitingChoice(s).cancellation?.allowed,false,"a real native state mutation invalidates a proposal even without writing its events to a journal");
  refuses(()=>resolveAwaiting(s,[],null,null,{cancel:true}),/changed|reversible|cannot.*cancel/i,"Cancel never rolls back that committed native prefix");
  eq(s,before,"refusing changed-state Cancel preserves every committed fact");
}
{
  const {s,action}=fixture();delete s.pendingTriggers;
  eq(applyAction(s,0,action),[],"this native proposal still emits no events");
  eq(s.pendingTriggers,[],"the engine nevertheless initialized a state field during its prefix");
  eq(s.awaiting.precommit,undefined,"a native no-journal mutation prefix is never stamped as proven reversible");
  eq(awaitingChoice(s).cancellation?.allowed,false,"zero events alone cannot certify a mutated prefix as reversible");
  const before=structuredClone(s);
  refuses(()=>resolveAwaiting(s,[],null,null,{cancel:true}),/reversible|cannot.*cancel/i,"a native no-journal mutation prefix is refused conservatively");
  eq(s,before,"the unsupported prefix remains unchanged after refused Cancel");
}
{
  const {s,spell}=fixture();s.objects[spell].manaCost="{2}";s.players[0].manaPool.G=1;s.players[0].manaPool.R=1;
  const action=legalActions(s,0).find(a=>a.kind==="cast"&&a.objectId===spell&&a.convoke),before=structuredClone(s);
  applyAction(s,0,action);resolveAwaiting(s,[0]);
  eq([s.awaiting.kind,awaitingChoice(s).cost],["choose-cost","pool"],"the real convoke selection is followed by which pooled mana pays the rest");
  eq(s.players[0].manaPool,before.players[0].manaPool,"the first cost stage has not spent any of the floating mana");
  resolveAwaiting(s,[],null,null,{cancel:true});
  eq(s,before,"cancelling a later cost stage restores the whole original proposal and pass count");
}
{
  const {s}=fixture();
  addObject(s,{card:"Other target",owner:1,controller:1,types:["Creature"],power:2,toughness:2},"battlefield");
  const spell=addObject(s,{card:"Divided proposal",owner:0,controller:0,types:["Sorcery"],manaCost:"{0}",spell:{id:"s",targets:[{what:"permanent",types:["Creature"],count:{min:1,max:2}}],divided:{target:0,total:3},effects:[{effect:"dealDamage",targets:{target:0},divided:0}]}},"hand",0);
  const before=structuredClone(s),action=legalActions(s,0).find(a=>a.kind==="cast"&&a.objectId===spell);
  applyAction(s,0,action);
  eq(s.awaiting.kind,"choose-targets","the actual divided spell first opens its counted target stage");
  resolveAwaiting(s,[0,1]);
  eq([s.awaiting.kind,awaitingChoice(s).mode],["choose-cost","amount"],"two real targets lead to the actual numeric division stage");
  resolveAwaiting(s,[],null,null,{cancel:true});
  eq(s,before,"cancelling numeric division abandons the whole multi-stage proposal without paying or targeting anything");
}
{
  const {s,action}=fixture();
  addObject(s,{card:"Secret top",owner:0,controller:0,types:["Land"]},"library",0);
  const proposal=beforeProposal(s,0,action),events=applyAction(s,0,action),before=structuredClone(s);
  const revealed=runEffect(s,{effect:"peekAndReveal",count:1,reveal:true,who:"you"},{controller:0,source:null});
  ok(revealed.some(e=>e.kind==="GameEventCardRevealed"),"an actual public reveal commits information even though no object moves");
  eq(s,before,"that actual reveal has no state mutation for a fingerprint to detect");
  retainProposal(s,proposal,[...events,...revealed]);
  eq(awaitingChoice(s).cancellation.allowed,false,"a continuation reporting an actual information event invalidates even an unchanged-state proposal");
  const committed=structuredClone(s);
  refuses(()=>resolveAwaiting(s,[],null,null,{cancel:true}),/reversible|cannot.*cancel/i,"an information prefix cannot be rolled back as a proposal");
  eq(s,committed,"the information-boundary refusal is atomic");
}
{
  const {s,action,spell}=fixture();applyAction(s,0,action);
  moveObject(s,spell,"graveyard",0);
  const before=structuredClone(s);
  refuses(()=>resolveAwaiting(s,[],null,null,{cancel:true}),/reversible|cannot.*cancel/i,"source departure refuses rollback before trying to describe missing-source cost options");
  eq(s,before,"source departure and all current facts survive refused Cancel");
}
{
  const {s,action}=fixture();applyAction(s,0,action);concede(s,0);
  eq(s.awaiting,null,"actual actor departure withdraws that actor's uncommitted proposal");
  eq(s.priorityPlayer,1,"priority goes to a surviving player after the actual actor leaves");
  const before=structuredClone(s);
  refuses(()=>resolveAwaiting(s,[],null,null,{cancel:true}),/not waiting/i,"a late Cancel cannot resurrect a departed actor's proposal");
  eq(s,before,"late Cancel leaves the departure intact");
}
for(const level of ["easy","normal"]){
  const {s,action,bear}=fixture();applyAction(s,0,action);
  const answer=seatPilot({seat:0,level,seed:"cancel"}).answer(projectFor(s,0),awaitingChoice(s));
  eq(answer.cancel,undefined,`${level} pilot answers the real cost, rather than selecting new Cancel metadata`);
  resolveAwaiting(s,answer.indices,answer.amounts,null,answer);
  eq([s.awaiting,s.stack.length,s.objects[bear].tapped],[null,1,true],`${level} completes the actual cast without a Cancel/retry loop`);
}
{
  const {s}=fixture();
  beginResolution(s,[{effect:"loseLife",who:"you",amount:2},{effect:"discard",count:1},{effect:"gainLife",who:"you",amount:1}],{controller:0,source:null});
  const before=structuredClone(s);
  eq([s.players[0].life,awaitingChoice(s).min],[38,1],"the actual resolving effect has already taken two life before its mandatory discard");
  refuses(()=>resolveAwaiting(s,[],null,null,{cancel:true}),/required|finish|cannot.*cancel/i,"mandatory discard is refused with game-level guidance");
  eq(s,before,"mandatory Cancel neither skips the suffix nor rolls back the paid prefix");
  resolveAwaiting(s,[0]);
  eq(s.players[0].life,39,"answering the mandatory discard still executes its following instruction exactly once");
}
{
  const {s,spell}=fixture();
  beginResolution(s,[{effect:"loseLife",who:"you",amount:2},{effect:"discard",count:1,upTo:true},{effect:"gainLife",who:"you",amount:2}],{controller:0,source:null});
  eq(awaitingChoice(s).min,0,"the actual optional discard permits choosing none");
  resolveAwaiting(s,[],null,null,{cancel:true});
  eq([s.players[0].life,s.objects[spell].zone,s.resolving],[40,"hand",null],"Cancel chooses none legally and executes the remaining effect, without abandoning resolution");
}
console.log(`engine-cancel-decision: ${checks} checks; reversible native proposals and committed resolution boundaries`);
