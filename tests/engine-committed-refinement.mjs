/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
/* Actual saved modal cards; private child choices never replace the original committed native question. */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {legalActions,applyAction} from "../game/engine/rules/actions.mjs";
import {awaitingChoice,resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {concede} from "../game/engine/rules/sba.mjs";
import {moveObject} from "../game/engine/state/index.mjs";
import {createRng} from "../game/engine/rng.mjs";
import {createController} from "../game/engine/controller.mjs";
import {hashState} from "../game/engine/journal.mjs";
import {refinementEntry,beginRefinement,refinementChoice,answerRefinement} from "../game/room/decision-refinement.mjs";
let checks=0;
const eq=(a,b,m)=>{assert.deepEqual(a,b,m);checks++;},ok=(a,m)=>{assert.ok(a,m);checks++;};
const index=loadCardIndex(),at=(seat,zone,...cards)=>({seat,zone,cards}),play=(setup,steps=[],more={})=>runScenario({name:"native committed refinement",setup,steps,...more},index.definition).state;
function finish(s){for(let n=0;n<12&&["choose-cost","choose-targets"].includes(s.awaiting?.kind);n++){const q=awaitingChoice(s);resolveAwaiting(s,q.mode==="one"?[q.options.length-1]:q.options.slice(0,q.min).map(o=>o.index));}}
{
 const s=play([at(0,"hand","Getaway Glamer"),at(0,"battlefield","Ao, the Dawn Sky","Cankerbloom")]);Object.assign(s.players[0].manaPool,{W:1,C:2});
 const ao=s.zones.battlefield.find(id=>s.objects[id].card==="Ao, the Dawn Sky"),action=legalActions(s,0).find(a=>a.label==="Getaway Glamer"&&a.modes?.join(",")==="1"&&a.targets?.some(t=>t.id===ao));
 applyAction(s,0,action);finish(s);passPriority(s);passPriority(s);
 const pending=awaitingChoice(s),native=hashState(s),controller=createController();controller.offer(pending);
 eq(s.stack[0].cardId,null,"actual departed Ao's native trigger has no live source");ok(s.stack[0].lastKnown&&s.stack[0].script.modal,"the trigger retains its native LKI and modal script");
 ok(refinementEntry(s,pending),"departed Ao can refine the saved native question without a live-source requirement");
 let d=beginRefinement(s,pending,0,"ao-child"),q=refinementChoice(s,pending,d);eq(q.stage,"modes","Ao's private child starts at modes");
 d=answerRefinement(s,pending,d,{indices:[q.options.find(o=>o.modeIndices[0]===1).index]}).draft;q=refinementChoice(s,pending,d);
 eq([q.stage,q.cancellation.returnsPriority],["confirm",false],"a targetless chosen mode confirms its original native question, without priority return");
 eq(hashState(s),native,"the Ao child has not changed any engine state, stack, native awaiting or resources");
 eq(controller.pending,pending,"the original controller question was not replaced by a child");
 eq(answerRefinement(s,pending,d,{cancel:true}),{draft:null,closed:true},"closing the child does not pretend to cancel its mandatory trigger");eq(hashState(s),native,"child close leaves the native Ao trigger fully pending");
 const result=answerRefinement(s,pending,d,{indices:[0]});resolveAwaiting(s,result.nativeAnswer.indices);passPriority(s);passPriority(s);
 eq(s.zones.battlefield.map(id=>s.objects[id]).find(o=>o.card==="Cankerbloom").counters["+1/+1"],2,"the actual original native Ao handler resolves its chosen counter effect once");
 assert.throws(()=>refinementChoice(s,pending,d),/native question changed/i);checks++;
}
{
 const s=play([at(0,"battlefield","Shadrix Silverquill")],[{to:{turn:1,phase:"COMBAT_BEGIN"}}],{seats:3}),pending=awaitingChoice(s),before=hashState(s);
 let d=beginRefinement(s,pending,0,"shadrix-child"),q=refinementChoice(s,pending,d);eq(q.modeCardinality?.allowedCounts,[0,2],"actual Shadrix exposes zero-or-two modes, never an invented one-mode intermediate");d=answerRefinement(s,pending,d,{indices:[q.options.find(o=>o.modeIndices.join(",")==="0,1").index]}).draft;
 q=refinementChoice(s,pending,d);d=answerRefinement(s,pending,d,{indices:[q.options.find(o=>o.target.id===0).index]}).draft;q=refinementChoice(s,pending,d);
 ok(q.options.every(o=>o.target.id!==0),"the second mode obeys the real combined different-player variant constraint");
 d=answerRefinement(s,pending,d,{indices:[q.options.find(o=>o.target.id===1).index]}).draft;q=refinementChoice(s,pending,d);eq(q.stage,"confirm","both Shadrix mode targets finish before native confirmation");
 eq(hashState(s),before,"Shadrix selections do not remove or answer its original native question");
 const result=answerRefinement(s,pending,d,{indices:[0]});resolveAwaiting(s,result.nativeAnswer.indices);eq([s.stack[0].modes,s.stack[0].targets.map(t=>t.id)],[[0,1],[0,1]],"the original native handler receives exactly the chosen complete legal Shadrix variant");
}
function scepter(name){return play([at(0,"battlefield",...Array(4).fill("Wastes"),"Cankerbloom"),at(1,"battlefield","Cankerbloom"),at(0,"hand","Isochron Scepter",name)],
 [{tap:"Wastes"},{tap:"Wastes"},{cast:"Isochron Scepter"},{resolve:true},{resolve:true},{choose:[name]},{tap:"Wastes"},{tap:"Wastes"},{activate:"Isochron Scepter"},{resolve:true}],{seats:3});}
{
 const s=play([at(0,"battlefield","Shadrix Silverquill")],[{to:{turn:1,phase:"COMBAT_BEGIN"}}]),pending=awaitingChoice(s),before=hashState(s);
 let d=beginRefinement(s,pending,0,"shadrix-native-none"),q=refinementChoice(s,pending,d);d=answerRefinement(s,pending,d,{indices:[q.options.find(o=>o.modeIndices.length===0).index]}).draft;
 eq(refinementChoice(s,pending,d).stage,"confirm","the actual native optional-none variant remains an explicit confirmable choice");eq(hashState(s),before,"selecting optional none privately does not prematurely remove its native trigger");
 const result=answerRefinement(s,pending,d,{indices:[0]});resolveAwaiting(s,result.nativeAnswer.indices);eq([s.awaiting,s.stack.length],[null,0],"explicit confirmation invokes the real native choose-none handler");
}
{
 const s=scepter("Boros Charm"),pending=awaitingChoice(s),before=hashState(s),index=s.awaiting.choices.findIndex(c=>c.modes?.[0]===0);
 let d=beginRefinement(s,pending,index,"scepter-child"),q=refinementChoice(s,pending,d);eq(q.options.length,3,"a physical free-cast entry retains all three actual native Boros Charm modes");
 q.options[0].modeIndices.push(999);eq(hashState(s),before,"returned effect-cast mode arrays are detached from the live native choices");q=refinementChoice(s,pending,d);
 let aimed=beginRefinement(s,pending,index,"scepter-target-copy"),first=refinementChoice(s,pending,aimed);aimed=answerRefinement(s,pending,aimed,{indices:[first.options.find(o=>o.modeIndices[0]===0).index]}).draft;
 first=refinementChoice(s,pending,aimed);first.options[0].target.id=999;eq(hashState(s),before,"returned effect-cast target references cannot mutate the native question");
 d=answerRefinement(s,pending,d,{indices:[q.options.find(o=>o.modeIndices[0]===1).index]}).draft;q=refinementChoice(s,pending,d);
 eq(hashState(s),before,"Scepter has already paid its prefix, but refining the copied card changes none of it");
 const result=answerRefinement(s,pending,d,{indices:[0]});resolveAwaiting(s,result.nativeAnswer.indices);
 eq([s.stack.length,s.stack[0].name,s.stack[0].modes],[1,"Boros Charm",[1]],"confirmation invokes the original effect-play handler and its suffix, not a priority cast shortcut");
}
{
 const s=scepter("Boros Charm"),pending=awaitingChoice(s),d=beginRefinement(s,pending,0,"stale-effect"),id=s.awaiting.choices[0].objectId;
 moveObject(s,id,"graveyard",0);const changed=hashState(s);
 assert.throws(()=>answerRefinement(s,pending,d,{indices:[0]}),/native question changed|offered modal|current choice/i);checks++;
 eq(hashState(s),changed,"an expired copied-card refinement cannot write back the old native question or restore its source");
}
{
 const s=scepter("Boros Charm"),pending=awaitingChoice(s),d=beginRefinement(s,pending,0,"different-native-frame");
 /* Counterfactual saved-frame boundary: the same visible question must not let an old child attach to another caster's resolution. */
 s.resolving.context.controller=1;const changed=hashState(s);eq(awaitingChoice(s),pending,"the visible question alone cannot identify its native resolving frame");
 assert.throws(()=>answerRefinement(s,pending,d,{cancel:true}),/native question changed/i);checks++;
 eq(hashState(s),changed,"expired child close never restores its old native context or question");
}
{
 const s=scepter("Boros Charm"),pending=awaitingChoice(s),index=s.awaiting.choices.findIndex(c=>c.modes?.[0]===2&&s.objects[c.targets[0].id]?.owner===1);
 let d=beginRefinement(s,pending,index,"stale-native-effect-target"),q=refinementChoice(s,pending,d);d=answerRefinement(s,pending,d,{indices:[q.options.find(o=>o.modeIndices[0]===2).index]}).draft;
 const target=s.awaiting.choices[index].targets[0].id;concede(s,1);const changed=hashState(s);ok(!s.objects[target],"actual opponent concession removes the previously offered Boros target while two other seats remain");
 assert.throws(()=>refinementChoice(s,pending,d),/native question changed/i);checks++;
 eq(hashState(s),changed,"a departed target is not restored by a stale effect-cast child");
}
{
 const data=JSON.parse(readFileSync(new URL("../game/engine/cards/s/summon-magus-sisters.scenarios.json",import.meta.url),"utf8"));
 const example=data.scenarios.find(s=>s.name.startsWith("I: the game rolls Combine Powers!")),s=runScenario({...example,steps:example.steps.slice(0,8),expect:[]},index.definition,data.fixtures).state;
 let pending=awaitingChoice(s);eq(refinementEntry(s,pending),null,"the actual mandatory native random mode roll cannot be replaced by a private mode chooser");
 const rng=createRng("refinement-roll"),before=rng.checkpoint();resolveAwaiting(s,[0],null,rng);ok(rng.checkpoint().draws>before.draws,"the native random handler consumes the actual RNG stream");
 const entry=s.stack.find(e=>e.stackId===s.awaiting.stackId);ok(Number.isInteger(entry.randomMode),"the real stack entry records its committed mode roll");
 pending=awaitingChoice(s);ok(refinementEntry(s,pending),"this actual committed Defense roll exposes only its native target refinement");
  const d=beginRefinement(s,pending,0,"rolled-child"),q=refinementChoice(s,pending,d);eq(q.refinement.modeSelection,"locked","a post-roll child cannot choose a different mode");
  ok(q.stage!=="modes"&&!q.refinement.canBack,"post-roll target selection cannot Back across the native RNG commitment");
  assert.throws(()=>answerRefinement(s,pending,d,{back:true}),/native commitment boundary/);checks++;
}
for(const ability of [false,true]){
 const s=play([at(0,"hand",...(ability?["Return the Favor"]:["Getaway Glamer","Reverberate"])),at(0,"battlefield","Cankerbloom","Sol Ring"),at(1,"battlefield","Cankerbloom","Sol Ring","Ghostly Prison")]);
 Object.assign(s.players[0].manaPool,ability?{R:2,C:2}:{W:1,R:2,C:3});
 const source=legalActions(s,0).find(a=>ability?a.kind==="activate"&&a.label==="Cankerbloom"&&a.modes?.[0]===0:a.label==="Getaway Glamer"&&a.modes?.join(",")==="0,1");ok(source,"the actual native modal original is available");applyAction(s,0,source);finish(s);
 const copyAction=legalActions(s,0).find(a=>a.label===(ability?"Return the Favor":"Reverberate")&&(!ability||a.modes?.join(",")==="0"));ok(copyAction,"the actual copy spell can target that modal original");applyAction(s,0,copyAction);finish(s);
 for(let n=0;n<4&&!s.awaiting;n++)passPriority(s);
 const pending=awaitingChoice(s),copy=s.stack.find(e=>e.copy===true),before=hashState(s);ok(copy&&s.awaiting?.effect==="copySpell","the original native copy handler asks only its target questions");
 eq(refinementEntry(s,pending),null,"a copy cannot advertise a fresh modal choice");assert.throws(()=>beginRefinement(s,pending,0,"forged-copy-mode"),/native target|current native choice/i);checks++;
 eq(hashState(s),before,"refusing an invented copy-mode refinement changes no native fact");
 const modes=structuredClone(copy.modes??null),effects=structuredClone(copy.script?.effects??null),targets=structuredClone(copy.targets),pool=structuredClone(s.players[0].manaPool);
 if(ability)ok(pending.options.every(o=>!o.cardId||s.objects[o.cardId].types.includes("Artifact")),"the copied Cankerbloom artifact mode cannot silently become its enchantment mode");else eq(copy.modes,[0,1],"the actual modal spell copy inherits both original modes");
 resolveAwaiting(s,[],null,null,{cancel:true});eq([copy.modes??null,copy.script?.effects??null,copy.targets],[modes,effects,targets],"native copy Cancel keeps its inherited modes, script and original targets");eq(s.players[0].manaPool,pool,"keeping a copy's targets never charges a modal cost again");
}
console.log(`engine-committed-refinement: ${checks} checks; actual departed Ao, Shadrix, Scepter, stale facts and native random-mode boundary`);
