/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
import assert from "node:assert/strict";
import {createState, addObject, moveObject} from "../game/engine/state/index.mjs";
import {beginResolution, answerResolution} from "../game/engine/script/resolution.mjs";
import {collectTriggers, openTriggers} from "../game/engine/rules/trigger.mjs";
import {resolveTop} from "../game/engine/rules/stack.mjs";
import {characteristicsOf, keywordsOf, lastKnown} from "../game/engine/rules/layers.mjs";
import {cantBeBlockedBy} from "../game/engine/rules/statics.mjs";
import {gainControl} from "../game/engine/script/effects/permanents.mjs";
import {matchesSelector} from "../game/engine/script/filter.mjs";
import {isRingBearer, checkRingBearers} from "../game/engine/keywords/ring.mjs";
import {checkStateBasedActions} from "../game/engine/rules/sba.mjs";
import {loadCardIndex, loadCardScenarios} from "../game/tools/engine-cards.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {projectFor} from "../game/engine/projection.mjs";

let checks = 0;
const check = (fn) => {fn(); checks++;};
const fresh = () => {const s=createState({players: [{name:"A"},{name:"B"},{name:"C"},{name:"D"}]});s.turn=1;s.activePlayer=0;s.phase="MAIN1";return s;};
const bear = (s,owner=0,power=2) => addObject(s,{card:"Bear",owner,controller:owner,types:["Creature"],power,toughness:5},"battlefield");
const tempt = (s,who=0,index=0) => {const r=beginResolution(s,[{effect:"ringTempts"}],{controller:who});return r.status==="waiting" ? answerResolution(s,[index]) : r;};
const event = (s,kind,fields) => ({kind,data:{turn:s.turn,phase:s.phase,fields}});
const trigger = (s,kind,fields) => {collectTriggers(s,[event(s,kind,fields)]); openTriggers(s);};

check(()=>{
  const s=fresh(), outcome=tempt(s);
  assert.equal(outcome.status,"done"); assert.equal(s.players[0].ring.count,1);
  assert.equal(s.players[0].ring.bearer,null);assert.equal(s.zones.command[0].length,1);
  assert(outcome.events.some(e=>e.kind==="GameEventRingTempts"));
  tempt(s);assert.equal(s.zones.command[0].length,1); assert.equal(s.objects[s.players[0].ring.emblem].abilities.length,2);
});
check(()=>{
  let s=fresh();const a=bear(s), b=bear(s), other=bear(s,1,3);
  beginResolution(s,[{effect:"ringTempts"}],{controller:0});
  assert.deepEqual(s.awaiting.cards,[a,b]);s=JSON.parse(JSON.stringify(s));answerResolution(s,[1]);
  assert.equal(s.players[0].ring.bearer,b);assert.equal(isRingBearer(s,a,0),false);
  assert(characteristicsOf(s,b).supertypes.includes("Legendary"));
  assert.equal((s.objects[b].supertypes ?? []).includes("Legendary"),false,"designation is not copiable");
  assert(lastKnown(s,b).supertypes.includes("Legendary"));
  assert(matchesSelector({what:"permanent",supertypes:["Legendary"]},s,b,{controller:0}));
  assert(cantBeBlockedBy(s,b,other));assert.equal(cantBeBlockedBy(s,a,other),false);
  s.objects[other].power=2; assert.equal(cantBeBlockedBy(s,b,other),false);
  tempt(s,0,0);assert.equal(isRingBearer(s,b,0),false);assert.equal(isRingBearer(s,a,0),true);
});
check(()=>{
  const s=fresh(),a=bear(s);tempt(s);
  (s.effects ??= []).push({layer:6,timestamp:999,affects:{ids:[a]},apply:{removeAllAbilities:true}});
  assert(characteristicsOf(s,a).supertypes.includes("Legendary"));
  gainControl(s,{targets:[a],toPlayer:1},{controller:1});gainControl(s,{targets:[a],toPlayer:0},{controller:0});
  assert.equal(s.players[0].ring.bearer,null,"a control change ends the designation even when control returns");
  tempt(s);moveObject(s,a,"graveyard",0);checkRingBearers(s);assert.equal(s.players[0].ring.bearer,null);
});
check(()=>{
  const s=fresh(),a=bear(s);tempt(s);tempt(s);
  const draw=addObject(s,{card:"Drawn",owner:0,types:["Land"]},"library",0);
  trigger(s,"GameEventAttackersDeclared",{player:{playerId:0},attackers:[{card:{cardId:a},defender:{playerId:1}}]});
  assert.equal(s.stack.length,1);assert.equal(s.stack[0].abilityId,"ring-loot");
  resolveTop(s);assert.equal(s.awaiting.effect,"discard");assert.equal(s.zones.hand[0].length,1);
  assert.equal(s.objects[s.zones.hand[0][0]].card,"Drawn");
  answerResolution(s,[0]);assert.equal(s.zones.graveyard[0].length,1);
});
check(()=>{
  const s=fresh(),a=bear(s), b=bear(s,1);tempt(s);tempt(s);tempt(s);
  trigger(s,"GameEventBlockersDeclared",{blockers:[{card:{cardId:b},blocking:{cardId:a}}]});
  assert.equal(s.stack.length,1);resolveTop(s);assert.equal(s.delayedTriggers.length,1);
  assert.equal(s.delayedTriggers[0].at,"end of combat");
  gainControl(s,{targets:[b],toPlayer:2},{controller:2});
  s.phase="COMBAT_END";trigger(s,"GameEventTurnPhase",{phase:"COMBAT_END"});
  assert.equal(s.stack.length,1);resolveTop(s);assert.equal(s.objects[b],undefined);
  assert.equal(s.zones.graveyard[1].length,1);
});
check(()=>{
  const s=fresh(),a=bear(s);for(let i=0;i<5;i++)tempt(s);
  assert.equal(s.players[0].ring.count,5);assert.equal(s.objects[s.players[0].ring.emblem].abilities.length,4);
  trigger(s,"GameEventPlayerDamaged",{source:{cardId:a,controller:0},target:{playerId:1},combat:false,amount:2});
  assert.equal(s.stack.length,0);
  trigger(s,"GameEventPlayerDamaged",{source:{cardId:a,controller:0},target:{playerId:1},combat:true,amount:2});
  assert.equal(s.stack.length,1);resolveTop(s);assert.deepEqual(s.players.map(p=>p.life),[40,37,37,37]);
});
check(()=>{
  const s=fresh(), a=bear(s), b=bear(s);
  s.objects[a].keywords=["Shroud"];s.objects[b].supertypes=["Legendary"];
  tempt(s);assert.equal(isRingBearer(s,a,0),true,"choosing the bearer does not target");
  checkStateBasedActions(s);assert.equal(s.awaiting.kind,"legend-rule");
  assert.deepEqual(s.awaiting.objectIds,[a,b],"the Ring's supertype participates in the legend rule");
});
check(()=>{
  const s=fresh(),a=bear(s),b=bear(s);for(let i=0;i<4;i++)tempt(s);
  trigger(s,"GameEventAttackersDeclared",{player:{playerId:0},attackers:[{card:{cardId:b},defender:{playerId:1}}]});
  assert.equal(s.stack.length,0,"the emblem only watches its bearer");
  const shown=projectFor(s,1).players[0].zones.Command.cards;
  assert.equal(shown[0].name,"The Ring");assert(shown[0].text.includes("each opponent loses 3 life"));
  assert.equal(s.objects[a].abilities.length,0,"the bearer never gains the emblem's abilities");
});
const index=loadCardIndex();
for(const {scenarios: file} of loadCardScenarios()) if(file.card==="Boromir, Warden of the Tower")
  for(const scenario of file.scenarios)check(()=>runScenario(scenario,index.definition,file.fixtures??{}));
console.log(`engine-ring: ${checks} checks passed`);
