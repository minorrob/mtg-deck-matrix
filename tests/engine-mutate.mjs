/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
import assert from "node:assert/strict";
import {loadCardIndex, loadCardScenarios} from "../game/tools/engine-cards.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {createState, addObject, moveObject, objectsAfterMove, mergedOrderToAsk, finishMergedOrder, turnFaceUp, transformObject} from "../game/engine/state/index.mjs";
import {mergeObjects} from "../game/engine/keywords/mutate.mjs";
import {moveZone} from "../game/engine/script/effects/zones.mjs";
import {becomeCopy} from "../game/engine/script/effects/permanents.mjs";
import {recheckTargets, shareProblem, countedChoice} from "../game/engine/script/bind.mjs";
import {recordCommanderDamage} from "../game/engine/rules/commander.mjs";
import {alternativeCosts} from "../game/engine/rules/actions.mjs";
import {targetCandidates} from "../game/engine/script/bind.mjs";
import {pushSpell, resolveTop, pushCopy} from "../game/engine/rules/stack.mjs";
import {beginResolution, answerResolution} from "../game/engine/script/resolution.mjs";
import {collectTriggers, openTriggers, askTriggerTargets, resolveTriggerCounted} from "../game/engine/rules/trigger.mjs";
import {keywordsOf} from "../game/engine/rules/layers.mjs";
import {projectFor} from "../game/engine/projection.mjs";
let checks=0;
const check=fn=>{fn();checks++;};
const fresh=()=>{const s=createState({players:[{name:"A"},{name:"B"}]});s.turn=1;s.phase="MAIN1";s.activePlayer=0;return s;};
const index=loadCardIndex();
const nethroi=index.definition("Nethroi, Apex of Death");
assert(nethroi,"Nethroi is supported");
const bear=(s,more={})=>addObject(s,{card:"Bear",owner:0,controller:0,types:["Creature"],subtypes:["Bear"],power:2,toughness:2,...more},"battlefield");
const spell=s=>addObject(s,{...nethroi,card:"Nethroi, Apex of Death",owner:0,controller:0},"stack");
check(()=>{
 const s=fresh(),h=bear(s),n=spell(s);s.objects[h].counters={"+1/+1":2};s.objects[h].tapped=true;
 const since=s.objects[h].controlledSinceTurn;
 const e=mergeObjects(s,n,h,true);
 assert.equal(e[0].kind,"GameEventMutates");assert.equal(s.objects[h].card,"Nethroi, Apex of Death");
 assert.equal(s.objects[h].power,5);assert.equal(s.objects[h].tapped,true);assert.equal(s.objects[h].controlledSinceTurn,since);
 assert.equal(s.objects[h].counters["+1/+1"],2);assert.deepEqual(s.zones.battlefield,[h]);assert(!s.objects[n]);
 assert.equal(s.objects[h].merged.length,2);
 const view=projectFor(s,1).players[0].zones.Battlefield.cards.find(c=>c.cardId===h);
 assert.deepEqual(view.components.map(p=>p.name),["Nethroi, Apex of Death","Bear"]);
 assert(view.text.includes("Whenever this creature mutates"));
 const moved=moveObject(s,h,"graveyard",0);assert.equal(objectsAfterMove(s,moved).length,2);
 assert.equal(s.zones.graveyard[0].length,2);assert.equal(s.players[0].leftThisTurn,1);
 assert.deepEqual(s.zones.graveyard[0].map(id=>s.objects[id].power),[5,2]);
 assert(s.zones.graveyard[0].every(id=>Object.keys(s.objects[id].counters).length===0));
});
check(()=>{
 const s=fresh(),h=bear(s);mergeObjects(s,spell(s),h,false);
 assert.equal(s.objects[h].card,"Bear");assert.equal(s.objects[h].power,2);
 assert(s.objects[h].keywords.includes("Lifelink"));assert(s.objects[h].keywords.includes("Deathtouch"));
 mergeObjects(s,spell(s),h,false);assert.equal(s.objects[h].mutations,2);
 assert.equal(s.objects[h].abilities.filter(a=>a.trigger?.on==="GameEventMutates").length,2);
 const context={controller:0};moveZone(s,{targets:[h],to:"exile",andReturn:true,remember:true},context);
 assert.equal(s.zones.battlefield.length,3);assert.equal(context.remembered.length,3);assert.equal(s.zones.exile.length,0);
});
check(()=>{
 const s=fresh(),h=bear(s),n=spell(s);s.objects[n].commander=true;s.objects[n].commanderKey="nethroi";
 mergeObjects(s,n,h,false);assert.equal(s.objects[h].commander,true);
 recordCommanderDamage(s,1,h,7);assert.equal(s.players[1].commanderDamage.nethroi,7);
 const moved=moveObject(s,h,"command",0,{nonCommanderTo:"hand"});
 assert.equal(s.zones.command[0].length,1);assert.equal(s.zones.hand[0].length,1);
 assert.equal(s.objects[s.zones.command[0][0]].card,"Nethroi, Apex of Death");
});
check(()=>{
 const s=fresh(),h=bear(s),n=spell(s),other=bear(s,{owner:1,controller:0}),human=bear(s,{subtypes:["Human"]});
 const way=alternativeCosts(s,0,n).find(w=>w.mutate);
 assert(way);assert.deepEqual(targetCandidates(s,way.overload.targets[0],{controller:0,source:n}).map(t=>t.id),[h]);
 s.objects[h].controller=1;assert(targetCandidates(s,way.overload.targets[0],{controller:0,source:n}).some(t=>t.id===h));
 beginResolution(s,[{effect:"mergePermanent",targets:[h]}],{controller:0,source:n});
 assert.equal(s.awaiting.player,0,"CR 702.140c: the spell's controller chooses over or under, even on a stolen creature");
 answerResolution(s,[0]);assert.equal(s.objects[h].controller,1,"merging does not change the creature's controller");
});
check(()=>{
 const s=fresh(),a=addObject(s,{card:"Big",owner:0,types:["Creature"],power:11,toughness:11},"graveyard",0),
 b=addObject(s,{card:"Negative",owner:0,types:["Creature"],power:-1,toughness:1},"graveyard",0);
 const spec={what:"card",zone:"graveyard",owner:"you",types:["Creature"],count:{min:0},totalPowerAtMost:10};
 const targets=[{kind:"object",id:a},{kind:"object",id:b}];
 assert(shareProblem(s,spec,[targets[0]],"Nethroi"));assert.equal(shareProblem(s,spec,targets,"Nethroi"),null);
 const c=countedChoice(s,spec,{controller:0},{id:"test",name:"Nethroi"});assert.equal(c.budget.most,10);assert.equal(c.options[1].power,-1);
 assert.equal(recheckTargets(s,[spec],[targets],{controller:0}).fizzles,false);
 moveObject(s,b,"exile");assert.equal(recheckTargets(s,[spec],[targets],{controller:0}).fizzles,true);
 assert.equal(recheckTargets(s,[spec],[[]],{controller:0}).fizzles,false);
});
check(()=>{
 const s=fresh(),h=bear(s),n=spell(s),entry=pushSpell(s,n,{controller:0,permanent:true,targets:[{kind:"object",id:h}]});
 entry.mutating=true;entry.overload=alternativeCosts(s,0,entry.objectId).find(w=>w.mutate).overload;
 moveObject(s,h,"graveyard",0);
 const events=resolveTop(s);
 assert.equal(s.zones.battlefield.length,1);assert.equal(s.objects[s.zones.battlefield[0]].card,"Nethroi, Apex of Death");
 assert(!events.some(e=>e.kind==="GameEventMutates"));assert.equal(s.stack.length,0);
});
check(()=>{
 const s=fresh(),h=bear(s),n=spell(s),entry=pushSpell(s,n,{controller:0,permanent:true,targets:[{kind:"object",id:h}]});
 entry.mutating=true;entry.overload=alternativeCosts(s,0,entry.objectId).find(w=>w.mutate).overload;
 const copy=pushCopy(s,entry,{controller:0});assert.equal(copy.mutating,true);assert.deepEqual(copy.overload,entry.overload);
 resolveTop(s);assert.equal(s.awaiting.effect,"mergePermanent");
 answerResolution(s,[0]);assert.equal(s.objects[h].token,true);
 const moved=moveObject(s,h,"graveyard",0);assert(s.objects[moved].token);assert.equal(s.objects[objectsAfterMove(s,moved)[1]].token,false);
});
check(()=>{
 const s=fresh(),h=bear(s),n=spell(s);s.objects[n].commander=true;s.objects[n].commanderKey="nethroi";
 mergeObjects(s,n,h,false);
 beginResolution(s,[{effect:"moveZone",targets:[h],to:"hand"}],{controller:1});
 assert.equal(s.awaiting.effect,"commanderHome");assert.equal(s.awaiting.player,0);
 answerResolution(s,[0]);
 assert.equal(s.zones.hand[0].length,1);assert.equal(s.zones.command[0].length,1);assert.equal(s.objects[s.zones.hand[0][0]].card,"Bear");
});
check(()=>{
 const s=fresh(),h=bear(s),n=spell(s),entry=pushSpell(s,n,{controller:0,permanent:true,targets:[{kind:"object",id:h}]});
 entry.mutating=true;entry.overload=alternativeCosts(s,0,entry.objectId).find(w=>w.mutate).overload;
 pushCopy(s,entry,{controller:1});resolveTop(s);
 assert.equal(s.awaiting,null);assert.equal(s.zones.battlefield.length,2);
 assert(s.zones.battlefield.some(id=>s.objects[id].owner===1 && s.objects[id].token));
});
check(()=>{
 const s=fresh(),h=bear(s,{commander:true,commanderKey:"bear"}),n=spell(s);s.objects[n].commander=true;s.objects[n].commanderKey="nethroi";
 mergeObjects(s,n,h,false);recordCommanderDamage(s,1,h,21);
 assert.deepEqual(s.players[1].commanderDamage,{bear:21,nethroi:21});
 beginResolution(s,[{effect:"moveZone",targets:[h],to:"hand"}],{controller:0});
 answerResolution(s,[1]);assert.equal(s.awaiting.effect,"commanderHome");answerResolution(s,[0]);
 assert.equal(s.objects[s.zones.command[0][0]].card,"Nethroi, Apex of Death");assert.equal(s.objects[s.zones.hand[0][0]].card,"Bear");
});
check(()=>{
 const s=fresh(),h=bear(s);mergeObjects(s,spell(s),h,true);
 beginResolution(s,[{effect:"moveZone",targets:[h],to:"library",top:true},{effect:"draw",count:1}],{controller:0});
 assert.equal(s.awaiting.effect,"orderMerged");assert.equal(s.zones.hand[0].length,0);
 answerResolution(s,[1,0]);assert.equal(s.objects[s.zones.hand[0][0]].card,"Bear");
 assert.equal(s.objects[s.zones.library[0][0]].card,"Nethroi, Apex of Death");
});
check(()=>{
 const s=fresh(),h=bear(s);mergeObjects(s,spell(s),h,true);const c=bear(s,{card:"Copy body"});
 becomeCopy(s,{targets:[h]},{controller:0,source:c});
 assert.equal(s.objects[c].card,"Nethroi, Apex of Death");assert.equal(s.objects[c].merged,undefined);
 assert(keywordsOf(s,c).includes("Lifelink"));const moved=moveObject(s,c,"graveyard",0);
 assert.equal(s.objects[moved].card,"Copy body");assert.equal(s.zones.graveyard[0].length,1);
});
check(()=>{
 let s=fresh(),h=bear(s);mergeObjects(s,spell(s),h,false);s=JSON.parse(JSON.stringify(s));
 assert.equal(s.objects[h].merged.length,2);moveObject(s,h,"graveyard",0);
 const ask=mergedOrderToAsk(s);assert(ask);finishMergedOrder(s,ask,[1,0]);
 assert.equal(s.objects[s.zones.graveyard[0][0]].card,"Nethroi, Apex of Death");
});
check(()=>{
 const s=fresh(),h=bear(s);const a=addObject(s,{card:"Eight",owner:0,types:["Creature"],power:8,toughness:8},"graveyard",0);
 addObject(s,{card:"Three",owner:0,types:["Creature"],power:3,toughness:3},"graveyard",0);
 collectTriggers(s,mergeObjects(s,spell(s),h,true));openTriggers(s);askTriggerTargets(s);
 assert.equal(s.awaiting.kind,"choose-targets");assert.throws(()=>resolveTriggerCounted(s,s.awaiting,[0,1]),/total power/);
 resolveTriggerCounted(s,s.awaiting,[0]);moveObject(s,h,"exile");
 resolveTop(s);if(s.awaiting?.effect==="orderMerged")answerResolution(s,[0,1]);
 assert(s.zones.battlefield.some(id=>s.objects[id].card==="Eight"),"ability resolves after its source leaves");
});
check(()=>{
 const s=fresh(),h=bear(s);bear(s,{card:"Watcher",abilities:[
 {id:"death",kind:"triggered",trigger:{on:"GameEventCardChangeZone",from:"Battlefield",to:"Graveyard",who:"any",filter:{types:["Creature"]}},effects:[{effect:"draw",count:1}]},
 {id:"cards",kind:"triggered",trigger:{on:"GameEventCardChangeZone",to:"Graveyard",intoGraveyard:true,owner:"you"},effects:[{effect:"draw",count:1}]}]});
 mergeObjects(s,spell(s),h,true);
 const events=moveZone(s,{targets:[h],to:"graveyard"},{controller:0});collectTriggers(s,events);
 assert.equal(s.pendingTriggers.filter(t=>t.abilityId==="death").length,1);
 assert.equal(s.pendingTriggers.filter(t=>t.abilityId==="cards").length,2);
});
check(()=>{
 const s=fresh(),card=addObject(s,{card:"Face",owner:0,controller:0,types:["Creature"],power:3,toughness:3,manaCost:"{2}{G}"},"hand",0);
 const h=moveObject(s,card,"battlefield",null,{faceDown:true});mergeObjects(s,spell(s),h,false);
 assert.equal(s.objects[h].faceDown,true);assert(keywordsOf(s,h).includes("Lifelink"));
 turnFaceUp(s,h);assert.equal(s.objects[h].card,"Face");assert(keywordsOf(s,h).includes("Lifelink"));
 const moved=moveObject(s,h,"graveyard",0);assert(objectsAfterMove(s,moved).every(id=>s.objects[id].owner===0));
});
check(()=>{
 const s=fresh(),front={card:"Front",types:["Creature"],subtypes:["Cat"],manaCost:"{1}{G}",power:2,toughness:2,abilities:[]},
 back={card:"Back",types:["Creature"],subtypes:["Cat"],power:4,toughness:4,abilities:[]};
 const h=addObject(s,{...front,owner:0,controller:0,mdfc:{front,back,transforming:true}},"battlefield");
 mergeObjects(s,spell(s),h,false);assert(transformObject(s,h));
 assert.equal(s.objects[h].card,"Back");assert.equal(s.objects[h].power,4);assert(keywordsOf(s,h).includes("Lifelink"));
 const moved=moveObject(s,h,"graveyard",0);assert.equal(s.objects[moved].card,"Front");
});
for(const {scenarios:file} of loadCardScenarios())if(file.card==="Nethroi, Apex of Death")
 for(const scenario of file.scenarios)check(()=>runScenario(scenario,index.definition,file.fixtures??{}));
console.log(`engine-mutate: ${checks} checks passed`);
