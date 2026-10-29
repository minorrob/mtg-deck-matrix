/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
/* ROB-209: actual activated/effective abilities, distinct cast routes and declared nonmana costs. */
import assert from "node:assert/strict";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {legalActions,applyAction} from "../game/engine/rules/actions.mjs";
import {awaitingChoice,resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {hashState} from "../game/engine/journal.mjs";
import {moveObject} from "../game/engine/state/index.mjs";
import {projectFor} from "../game/engine/projection.mjs";
import {describeDecision} from "../game/room/decision.mjs";
import {offerDetails} from "../game/room/room.mjs";
import * as stages from "../game/room/cast-stages.mjs";
let checks=0;
const eq=(a,b,m)=>{assert.deepEqual(a,b,m);checks++;},ok=(a,m)=>{assert.ok(a,m);checks++;};
const index=loadCardIndex(),at=(seat,zone,...cards)=>({seat,zone,cards});
const play=(setup,more={})=>runScenario({name:"actual action stages",setup,steps:[],...more},index.definition).state;
const begin=(...args)=>(stages.beginActionDraft??stages.beginCastDraft)(...args);
function finish(s){for(let n=0;n<12&&["choose-cost","choose-targets"].includes(s.awaiting?.kind);n++){
 const q=awaitingChoice(s),rank=o=>(o.label.match(/\{R\}/g)?.length??0)*100+(o.label.match(/\{W\}/g)?.length??0);
 resolveAwaiting(s,q.mode==="one"?[[...q.options].sort((a,b)=>rank(a)-rank(b))[0].index]:q.options.slice(0,q.min).map(o=>o.index));
}}
{
 const s=play([at(0,"battlefield","Cankerbloom"),at(1,"battlefield","Sol Ring","Ghostly Prison")]);s.players[0].manaPool.C=1;
 const source=s.zones.battlefield.find(id=>s.objects[id].card==="Cankerbloom"),offers=legalActions(s,0),action=offers.find(a=>a.objectId===source&&a.modes?.[0]===0);
 const q0=describeDecision(s,{id:"priority",options:offers.map((a,index)=>({index,label:a.label}))},offers,projectFor(s,0));
 ok(q0.options[offers.indexOf(action)].actionStages?.kind==="activate","actual Cankerbloom advertises an unambiguous activated action entry");
 ok(!q0.options[offers.indexOf(action)].castStages,"an activation never advertises itself as casting a creature spell");
 const before=hashState(s);let d=begin(s,0,action,"actual-canker"),q=stages.offerCastDraft(s,d);
 eq([q.stage,q.actionStage.schema,q.actionStage.kind,q.actionStage.abilityId],["modes","CrankActionStage@1","activate",action.abilityId],"activation stages identify the effective ability and their schema");
 ok(!q.castStage,"cast-only metadata is absent from an activation");
 eq(q.options.map(o=>o.modeIndices),[[0],[1],[2]],"starting at the artifact variant retains every legal native mode");
 const mode=q.options.find(o=>o.modeIndices[0]===1);d=stages.answerCastDraft(s,d,{indices:[mode.index]}).draft;q=stages.offerCastDraft(s,d);
 eq([q.stage,q.options[0].label],["targets","Ghostly Prison"],"the enchantment mode gets its own real target choices");
 d=stages.answerCastDraft(s,d,{indices:[0]}).draft;q=stages.offerCastDraft(s,d);
 eq(q.options[0].label,"Pay and activate","activation Pay has the correct action verb");
 eq(q.options[0].costs.activation,[{atom:"mana",cost:"{1}"},{atom:"sacrifice",self:true}],"Pay reports the actual mana and self-sacrifice ability costs");
 ok(!("printed" in q.options[0].costs),"activation Pay does not confuse the creature's casting cost with its ability's cost");
 eq(hashState(s),before,"all activation stages leave full engine resources, zones and RNG state unchanged");
 d=stages.answerCastDraft(s,d,{back:true}).draft;q=stages.offerCastDraft(s,d);eq(q.stage,"targets","Back traverses activated target selection");
 eq(stages.answerCastDraft(s,d,{cancel:true}).draft,null,"Cancel abandons only the uncommitted activation draft");eq(hashState(s),before,"activated Cancel preserves full native state");
 q=stages.offerCastDraft(s,d);d=stages.answerCastDraft(s,d,{indices:[0]}).draft;q=stages.offerCastDraft(s,d);
 const result=stages.answerCastDraft(s,d,{indices:[0]}),events=applyAction(s,0,result.action);finish(s);
 eq([s.players[0].manaPool.C,s.zones.graveyard[0].map(id=>s.objects[id].card)],[0,["Cankerbloom"]],"native Pay spends one mana and actually sacrifices Cankerbloom once");
 eq([s.stack.length,s.stack[0].kind,s.stack[0].script.effects[0].effect],[1,"ability","destroy"],"the chosen activated effect, not a creature spell, reaches the real stack");
 eq(events.filter(e=>e.kind==="GameEventSpellAbilityCast").length,1,"one activation is committed");
 eq(s.stack[0].targets[0].id,s.zones.battlefield.find(id=>s.objects[id].card==="Ghostly Prison"),"the selected enchantment target survives sacrifice of the source");
}
{
 const s=play([at(0,"battlefield","Conspicuous Snoop"),at(1,"battlefield","Sol Ring")],{library:["Goblin Cratermaker"]});s.players[0].manaPool.C=1;
 const source=s.zones.battlefield.find(id=>s.objects[id].card==="Conspicuous Snoop"),action=legalActions(s,0).find(a=>a.kind==="activate"&&a.objectId===source&&a.modes);
 ok(action,"the actual Snoop receives Cratermaker's modal ability through a real effective-ability layer");
 ok(!s.objects[source].abilities.some(a=>a.modal),"the modal ability is absent from the raw source definition");
 const d=begin(s,0,action,"effective-snoop"),q=stages.offerCastDraft(s,d);eq(q.options.length,2,"staging reads the effective modal ability, not raw card abilities");
 const id=q.actionStage.actionId,other=stages.actionEntryFor({...action,abilityId:`${action.abilityId}:different`}).actionId;
 ok(id!==other,"the action identity includes the chosen ability, even on the same physical object");
 const before=hashState(s);moveObject(s,s.zones.library[0][0],"graveyard",0);assert.throws(()=>stages.offerCastDraft(s,d),/no longer|live game/);checks++;
 ok(hashState(s)!==before,"the independently changed library remains changed; expired drafts never restore it");
}
{
 const s=play([at(0,"battlefield","Cankerbloom","Sol Ring"),at(1,"battlefield","Sol Ring")]);s.players[0].manaPool.C=1;
 const action=legalActions(s,0).find(a=>a.kind==="activate"&&a.label==="Cankerbloom"&&a.modes?.[0]===0);
 let d=begin(s,0,action,"changed-activated-targets"),q=stages.offerCastDraft(s,d);d=stages.answerCastDraft(s,d,{indices:[q.options.find(o=>o.modeIndices[0]===0).index]}).draft;q=stages.offerCastDraft(s,d);
 const old=q.id,gone=q.options[0].target.id;moveObject(s,gone,"graveyard",s.objects[gone].owner);const changed=hashState(s);
 assert.throws(()=>stages.answerCastDraft(s,d,{indices:[0]}),/choices changed/i);checks++;
 eq(hashState(s),changed,"a stale activated target answer cannot rewrite independent game facts");
 q=stages.offerCastDraft(s,d);ok(q.id!==old,"changed live activated targets issue a fresh private question identity");
 ok(q.options.every(o=>o.target.id!==gone),"the departed artifact cannot remain a staged target");
 d=stages.answerCastDraft(s,d,{indices:[0]}).draft;eq(stages.offerCastDraft(s,d).stage,"payment","a reoffered activated target can be answered normally without a nonce loop");
}
{
 const s=play([at(0,"hand","Past in Flames"),at(0,"graveyard","Boros Charm"),at(0,"battlefield","Kess, Dissident Mage","Cankerbloom")]);Object.assign(s.players[0].manaPool,{R:2,W:1,C:3});
 applyAction(s,0,legalActions(s,0).find(a=>a.label==="Past in Flames"));finish(s);passPriority(s);passPriority(s);
 const offers=legalActions(s,0).filter(a=>a.label==="Boros Charm"&&a.modes?.[0]===1),back=offers.find(a=>a.flashback),normal=offers.find(a=>!a.flashback);ok(back&&normal,"the actual Kess and Past in Flames expose two different graveyard casting routes");
 ok(stages.castEntryFor(back).actionId!==stages.castEntryFor(normal).actionId,"normal permission and flashback have distinct stable entry identities");
 let d=begin(s,0,back,"actual-flashback"),q=stages.offerCastDraft(s,d);d=stages.answerCastDraft(s,d,{indices:[q.options.find(o=>o.modeIndices[0]===1).index]}).draft;
 q=stages.offerCastDraft(s,d);eq(q.options.length,1,"the flashback draft cannot silently offer the different Kess route at Pay");
 const result=stages.answerCastDraft(s,d,{indices:[0]});eq(result.action.flashback,true,"the chosen native flashback route remains selected through Pay");
 applyAction(s,0,result.action);finish(s);eq(s.stack[0].flashback,true,"the actual cast retains the flashback zone-replacement contract");
 for(const [field,value]of Object.entries({face:"back",adventure:true,alternative:0,escape:"escape",via:0,asType:"Instant",free:true}))
  ok(stages.castEntryFor({...normal,[field]:value}).actionId!==stages.castEntryFor(normal).actionId,`the public route identity distinguishes ${field}; identity fixture, not a new card`);
}
{
 const s=play([at(0,"hand","Collective Effort"),at(0,"battlefield","Cankerbloom"),at(1,"battlefield","Ghostly Prison")]);Object.assign(s.players[0].manaPool,{W:2,C:1});
 const action=legalActions(s,0).find(a=>a.label==="Collective Effort"&&a.modes?.join(",")==="1,2"),options={describeActions:(seat,actions)=>offerDetails(s,seat,actions)};
 let d=begin(s,0,action,"actual-escalate"),q=stages.offerCastDraft(s,d,options);d=stages.answerCastDraft(s,d,{indices:[q.options.find(o=>o.modeIndices.join(",")==="1,2").index]},options).draft;
 for(let n=0;n<2;n++){q=stages.offerCastDraft(s,d,options);d=stages.answerCastDraft(s,d,{indices:[0]},options).draft;}
 q=stages.offerCastDraft(s,d,options);eq(q.options[0].costs.nonmana,[{atom:"tapCreature",count:1,selector:{types:["Creature"]}}],"Pay declares the real one-creature nonmana escalate cost from native offer facts");
 const result=stages.answerCastDraft(s,d,{indices:[0]},options);applyAction(s,0,result.action);eq(awaitingChoice(s).cost,"escalate","final Pay still invokes the existing native cost question");finish(s);
 eq(s.stack[0].modes,[1,2],"the actual native escalate payment preserves both chosen modes");ok(s.zones.battlefield.some(id=>s.objects[id].card==="Cankerbloom"&&s.objects[id].tapped),"native payment, not the metadata projection, taps the cost creature");
}
console.log(`engine-action-stages: ${checks} checks; actual activated/effective modes, isolated cast routes and native nonmana costs`);
