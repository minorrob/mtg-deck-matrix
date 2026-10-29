/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
import assert from "node:assert/strict";
import {createState,addObject,moveObject} from "../game/engine/state/index.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {legalActions,applyAction} from "../game/engine/rules/actions.mjs";
import {beginCastDraft,offerCastDraft,answerCastDraft} from "../game/room/cast-stages.mjs";
import {hashState} from "../game/engine/journal.mjs";
let checks=0;
const eq=(a,b,m)=>{assert.deepEqual(a,b,m);checks++;};
const ok=(a,m)=>{assert.ok(a,m);checks++;};
const index=loadCardIndex();
function fixture(custom=null){
  const state=createState({matchId:"stages",seed:"stages",players:["A","B","C","D"].map(name=>({name}))});
  state.turn=5;state.phase="MAIN1";state.stepIndex=3;state.activePlayer=0;state.priorityPlayer=0;state.passes=2;state.pendingTriggers=[];
  state.players[0].manaPool.W=1;state.players[0].manaPool.C=3;
  const creature=(name,owner,power)=>addObject(state,{card:name,owner,controller:owner,types:["Creature"],power,toughness:power},"battlefield");
  const mine=creature("Mine",0,2),other=creature("Other",1,4);
  const source=addObject(state,{...(custom??index.definition("Getaway Glamer")),card:custom?"Fixture modes":"Getaway Glamer",owner:0,controller:0},"hand",0);
  const action=legalActions(state,0).find(a=>a.kind==="cast"&&a.objectId===source&&(custom||a.modes.length===1));
  ok(action,"the native engine offers the actual source (the real spree starts from a one-mode offer)");
  return {state,source,mine,other,action};
}
const pick=(state,draft,test)=>{
  const choice=offerCastDraft(state,draft),option=choice.options.find(test);assert.ok(option,`option missing at ${choice.stage}`);
  return answerCastDraft(state,draft,{indices:[option.index]});
};
{
  const {state,source,mine,other,action}=fixture(),before=hashState(state);
  let draft=beginCastDraft(state,0,action,"tx:spree");
  let choice=offerCastDraft(state,draft);
  eq([choice.stage,choice.mode,choice.sourceId],["modes","one",source],"stage is separate from cardinality mode and identifies the physical source");
  eq(choice.modeChoices.map(m=>m.additionalCost),["{1}","{2}"],"the actual spree mode costs are exposed before target selection");
  const modeIds=choice.modeChoices.map(m=>m.id);
  ok(choice.options.some(o=>o.modeIndices.join(",")==="0,1"),"the initial one-mode offer does not silently lock the draft to that mode");
  draft=pick(state,draft,o=>o.modeIndices.join(",")==="0,1").draft;
  choice=offerCastDraft(state,draft);const firstGroup=choice.targetGroupId;
  eq([choice.stage,choice.modeId],["targets",modeIds[0]],"the first selected mode gets its own target stage");
  draft=answerCastDraft(state,draft,{indices:[choice.options.find(o=>o.target.id===mine).index]}).draft;
  draft=JSON.parse(JSON.stringify(draft));choice=offerCastDraft(state,draft);
  eq([choice.stage,choice.modeId],["targets",modeIds[1]],"the next selected mode has its own stable printed mode ID after JSON restoration");
  ok(choice.targetGroupId!==firstGroup,"separate mode target instances have distinct IDs");
  draft=answerCastDraft(state,draft,{indices:[choice.options.find(o=>o.target.id===other).index]}).draft;
  choice=offerCastDraft(state,draft);
  eq(choice.stage,"payment","mode targets finish before payment begins");
  eq(hashState(state),before,"modes, targets and JSON restoration never mutate the game or spend resources");
  eq(choice.options[0].costs.additional,"{1}{2}","the actual selected spree costs are both retained at payment");
  const paid=answerCastDraft(state,draft,{indices:[0]});
  eq(paid.draft,null,"final Pay closes the private draft");
  const events=applyAction(state,0,paid.action);
  eq([state.stack.length,state.stack[0].modes,state.stack[0].targets],[1,[0,1],[{kind:"object",id:mine},{kind:"object",id:other}]],"Pay casts the real native multi-mode spell with each chosen target");
  eq([state.players[0].manaPool.W,state.players[0].manaPool.C],[0,0],"native payment spends exactly the actual white plus three additional mana");
  eq(events.filter(e=>e.kind==="GameEventSpellAbilityCast").length,1,"one native cast is committed");
}
{
  const {state,action,mine}=fixture(),before=hashState(state);let draft=beginCastDraft(state,0,action,"tx:back");
  const initial=offerCastDraft(state,draft),ids=initial.modeChoices.map(m=>m.id);
  draft=pick(state,draft,o=>o.modeIndices.join(",")==="0,1").draft;
  draft=pick(state,draft,o=>o.target.id===mine).draft;
  draft=pick(state,draft,o=>o.target.id===mine).draft;
  let choice=offerCastDraft(state,draft);eq(choice.stage,"payment","the same object is legal as a separate target of both real modes");
  const transaction=choice.castStage.transactionId;
  for(let n=0;n<3;n++){draft=answerCastDraft(state,draft,{back:true}).draft;choice=offerCastDraft(state,draft);}
  eq(choice.stage,"modes","Back traverses both target groups to the modes");
  eq([choice.castStage.transactionId,choice.modeChoices.map(m=>m.id)],[transaction,ids],"transaction and printed mode IDs remain stable across Back");
  eq(answerCastDraft(state,draft,{cancel:true}).draft,null,"Cancel abandons the precommit draft");
  eq(hashState(state),before,"Back and Cancel preserve the complete native state");
}
{
  const {state,action,mine,other}=fixture();let draft=beginCastDraft(state,0,action,"tx:changed");
  draft=pick(state,draft,o=>o.modeIndices.join(",")==="0,1").draft;
  draft=pick(state,draft,o=>o.target.id===mine).draft;
  const stale=offerCastDraft(state,draft),oldVersion=draft.version;
  moveObject(state,other,"graveyard",1);const before=hashState(state);
  assert.throws(()=>answerCastDraft(state,draft,{indices:[0]}),/choices changed/i);checks++;
  eq(hashState(state),before,"changed live target choices are refused without rolling back the external move");
  const fresh=offerCastDraft(state,draft);
  ok(draft.version>oldVersion&&fresh.id!==stale.id,"reoffering changed live variants invalidates the old question identity");
  ok(!fresh.options.some(o=>o.target.id===other),"the departed target is absent from the revalidated stage");
}
const target={what:"permanent",types:["Creature"]};
const repeat={types:["Sorcery"],manaCost:"{0}",spell:{id:"s",modal:{choose:2,sameMode:true,modes:[{text:"Grow a creature",targets:[target],effects:[{effect:"putCounter",targets:{target:0},counter:"+1/+1",count:1}]}]}}};
{
  const {state,action,mine}=fixture(repeat);let draft=beginCastDraft(state,0,action,"tx:repeat");
  let choice=offerCastDraft(state,draft);eq(choice.modeCardinality.repeatable,true,"repeatable native modes are described explicitly");
  draft=answerCastDraft(state,draft,{indices:[0]}).draft;choice=offerCastDraft(state,draft);const first=choice.modeInstanceId;
  draft=answerCastDraft(state,draft,{indices:[choice.options.find(o=>o.target.id===mine).index]}).draft;
  choice=offerCastDraft(state,draft);ok(choice.modeInstanceId!==first,"a repeated printed mode gets a distinct target instance ID");
  draft=answerCastDraft(state,draft,{indices:[choice.options.find(o=>o.target.id===mine).index]}).draft;
  choice=offerCastDraft(state,draft);const paid=answerCastDraft(state,draft,{indices:[0]});applyAction(state,0,paid.action);
  eq([state.stack[0].modes,state.stack[0].targets],[[0,0],[[{kind:"object",id:mine}],[{kind:"object",id:mine}]]],"native repeated modes retain their independently legal shared target groups");
}
const optional={types:["Sorcery"],manaCost:"{0}",spell:{id:"s",modal:{choose:0,upTo:1,modes:[{text:"Optional target",targets:[{...target,count:{max:1}}],effects:[{effect:"putCounter",targets:{target:0},counter:"+1/+1",count:1}]}]}}};
for(const none of [true,false]){
  const {state,action}=fixture(optional);let draft=beginCastDraft(state,0,action,`tx:optional:${none}`);
  let choice=offerCastDraft(state,draft);eq(choice.modeCardinality.min,0,"the native up-to modal permits choosing no modes");
  draft=answerCastDraft(state,draft,{indices:[choice.options.find(o=>o.modeIndices.length===(none?0:1)).index]}).draft;
  choice=offerCastDraft(state,draft);
  if(!none){eq([choice.stage,choice.min,choice.max],["targets",0,1],"a selected mode exposes its legal zero-or-one target cardinality");draft=answerCastDraft(state,draft,{indices:[]}).draft;choice=offerCastDraft(state,draft);}
  const paid=answerCastDraft(state,draft,{indices:[0]});applyAction(state,0,paid.action);
  eq(state.stack[0].modes,none?[]:[0],"zero modes or zero optional targets are committed through their real native cast");
}
console.log(`engine-cast-stages: ${checks} checks; real spree costs, mode instances, targets, Back/Cancel and native commit`);
