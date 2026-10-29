/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
/* Private, saved selections over live native offers. This never pays, moves an object or changes the game state. */
import {legalActions,offerScript,offerSpecs,chooseTargetsChoice,pickActionTargets} from "../engine/rules/actions.mjs";
import {countOf,isChoosing,targetName} from "../engine/script/bind.mjs";
import {targetFacts} from "../engine/script/decision.mjs";
import {createController} from "../engine/controller.mjs";
import {hashState} from "../engine/journal.mjs";

const SCHEMA="CrankCastDraft@1";
const key=t=>Array.isArray(t)?`[${t.map(key).join(",")}]`:t?`${t.kind}:${t.id}`:"none";
const modesKey=m=>(m??[]).join(",");
const route=a=>({kind:a.kind,objectId:a.objectId,...(a.face?{face:a.face}:{}),...(a.adventure?{adventure:true}:{})});
export const castEntryFor=action=>({schema:"CrankCastEntry@1",sourceId:action.objectId,actionId:`cast:${action.objectId}:${hashState(route(action))}`});
const sameRoute=(a,b)=>JSON.stringify(route(a))===JSON.stringify(b);
const has=(array,value)=>array.some(t=>key(t)===key(value));
const invalid=()=>Object.assign(new Error("This cast proposal no longer fits the live game. Cancel it and choose the card again."),{castDraftExpired:true});
const modeId=(d,index)=>`card:${d.sourceId}:mode:${index}`;
function modalOf(state,action){return offerScript(state,{...action,modes:undefined})?.modal??null;}
function live(state,draft){
  if(draft?.schema!==SCHEMA||state.awaiting||state.resolving||state.ruleOperation||state.priorityPlayer!==draft.actor||state.players[draft.actor]?.lost)throw invalid();
  const offers=legalActions(state,draft.actor).filter(a=>a.kind==="cast"&&sameRoute(a,draft.route)&&Array.isArray(a.modes));
  const modal=offers.length?modalOf(state,offers[0]):null;
  if(!modal)throw invalid();
  return {offers,modal};
}
function groups(draft,modal){
  const found=[],seen=new Map();
  for(const index of draft.modes??[]){
    const occurrence=seen.get(index)??0;seen.set(index,occurrence+1);
    const instanceId=`${draft.id}/mode:${index}/instance:${occurrence}`;
    for(const [local,spec] of (modal.modes[index]?.targets??[]).entries())found.push({index:found.length,local,spec,
      modeIndex:index,modeId:modeId(draft,index),modeInstanceId:instanceId,id:`${instanceId}/target:${local}`});
  }
  return found;
}
function checked(choice,indices){
  const controller=createController();controller.offer(choice);
  return controller.check({choiceId:choice.id,indices});
}
function fill(state,draft,action,index,value){
  const {specs,context}=offerSpecs(state,draft.actor,action),spec=specs[index];
  if(countOf(spec,context)||isChoosing(action.targets?.[index])){
    const awaiting={kind:"choose-targets",player:draft.actor,action,index},choice=chooseTargetsChoice(state,awaiting);
    const picked=Array.isArray(value)?value:[value];
    const indices=picked.map(t=>choice.options.find(o=>key(o.targets[0])===key(t))?.index);
    if(indices.some(i=>i===undefined)||checked(choice,indices))return null;
    try{return pickActionTargets(state,awaiting,indices).action;}catch{return null;}
  }
  return key(action.targets?.[index])===key(value)?action:null;
}
function chosen(state,draft,offers){
  let actions=offers.filter(a=>modesKey(a.modes)===modesKey(draft.modes));
  for(let index=0;index<draft.cursor;index++)actions=actions.map(a=>fill(state,draft,a,index,draft.targets[index])).filter(Boolean);
  if(!actions.length)throw invalid();
  return actions;
}
export function beginCastDraft(state,actor,action,id){
  if(action?.kind!=="cast"||!modalOf(state,action))throw new Error("That card has no casting modes to step through.");
  const draft={schema:SCHEMA,id,actor,sourceId:action.objectId,route:route(action),version:0,modes:null,targets:[],cursor:0};
  live(state,draft);
  return draft;
}
const canceled={schema:"CrankDecisionCancel@1",allowed:true,kind:"abandon-draft",returnsPriority:true};
function common(draft,stage){return {id:`${draft.id}/question:${draft.version}`,sourceId:draft.sourceId,stage,
  cancellation:canceled,castStage:{schema:"CrankCastStage@1",transactionId:draft.id,actionId:castEntryFor(draft.route).actionId,
    sourceId:draft.sourceId,stage,canBack:stage!=="modes",version:draft.version}};}
export function castDraftChoice(state,draft){
  const {offers,modal}=live(state,draft);
  if(draft.modes===null){
    const sets=[...new Map(offers.map(a=>[modesKey(a.modes),a.modes])).values()];
    const modeChoices=modal.modes.map((m,index)=>({id:modeId(draft,index),modeIndex:index,label:m.text??`Mode ${index+1}`,
      ...(m.cost?{additionalCost:m.cost}:{}),repeatable:modal.sameMode===true,
      most:Math.max(0,...sets.map(set=>set.filter(i=>i===index).length))}));
    return {...common(draft,"modes"),title:`${state.objects[draft.sourceId].card}: choose modes`,mode:"one",min:1,max:1,
      modeChoices,modeCardinality:{min:Math.min(...sets.map(s=>s.length)),max:Math.max(...sets.map(s=>s.length)),repeatable:modal.sameMode===true},
      options:sets.map((set,index)=>({index,id:`${draft.id}/modes:${modesKey(set)}`,modeIndices:set,
        modeIds:set.map(i=>modeId(draft,i)),label:set.length?set.map(i=>modal.modes[i].text).join("; "):"Choose no modes"}))};
  }
  const actions=chosen(state,draft,offers),allGroups=groups(draft,modal),group=allGroups[draft.cursor];
  const selectedModes=draft.modes.map((index,position)=>({modeId:modeId(draft,index),modeIndex:index,position}));
  if(group){
    const base={...common(draft,"targets"),title:`${modal.modes[group.modeIndex].text}: choose targets`,
      modeId:group.modeId,modeInstanceId:group.modeInstanceId,targetGroupId:group.id,targetGroupIndex:group.index,selectedModes};
    const specs=offerSpecs(state,draft.actor,actions[0]);
    const counted=Boolean(countOf(specs.specs[group.index],specs.context))||isChoosing(actions[0].targets?.[group.index]);
    if(!counted){
      const values=[];for(const action of actions)if(!has(values,action.targets[group.index]))values.push(action.targets[group.index]);
      return {...base,mode:"one",min:1,max:1,options:values.map((target,index)=>({index,id:`${group.id}/${key(target)}`,
        label:target?targetName(state,target):"No target",target,...(target?.kind==="object"?{cardId:target.id}:target?.kind==="player"?{playerId:target.id}:{}),...targetFacts(state,target)}))};
    }
    const choices=actions.map(action=>chooseTargetsChoice(state,{kind:"choose-targets",player:draft.actor,action,index:group.index}));
    const options=[];
    for(const c of choices)for(const option of c.options)if(!options.some(o=>key(o.target)===key(option.targets[0])))
      options.push({...option,index:options.length,id:`${group.id}/${key(option.targets[0])}`,target:option.targets[0]});
    const constraints=[...new Map(choices.map(c=>{const value={min:c.min,max:c.max,targetIds:c.options.map(o=>key(o.targets[0])),
      ...(c.budget?{budget:c.budget}:{}),...(c.capped?{capped:c.capped}:{})};return [JSON.stringify(value),value];})).values()];
    return {...base,mode:"many",min:Math.min(...choices.map(c=>c.min)),max:Math.max(...choices.map(c=>c.max)),options,targetConstraints:constraints};
  }
  const unique=[...new Map(actions.map(a=>[hashState(a),a])).values()];
  return {...common(draft,"payment"),title:`${state.objects[draft.sourceId].card}: pay and cast`,mode:"one",min:1,max:1,selectedModes,
    options:unique.map((action,index)=>({index,id:`${draft.id}/pay:${hashState(action)}`,actionId:`${draft.id}/pay:${hashState(action)}`,
      label:"Pay and cast",costs:{printed:state.objects[draft.sourceId].manaCost??"",additional:action.extraMana??"",
        ...(action.x!==undefined?{x:action.x}:{}),...(action.tax?{commanderTax:action.tax}:{}),
        ...(action.payment?{payment:action.payment}:{}),...(action.autoTap?{automaticSources:true}:{})}}))};
}
export function castDraftSignature(choice){
  const {id,castStage,...rest}=choice;
  return hashState(rest);
}
export function offerCastDraft(state,draft){
  let choice=castDraftChoice(state,draft),signature=castDraftSignature(choice);
  if(draft.offeredSignature&&draft.offeredSignature!==signature){draft.version++;choice=castDraftChoice(state,draft);}
  draft.offeredSignature=signature;
  return choice;
}
export function answerCastDraft(state,draft,answer){
  if(answer.cancel===true)return {draft:null};
  const choice=castDraftChoice(state,draft);
  if(castDraftSignature(choice)!==draft.offeredSignature)throw new Error("The cast choices changed. Reopen the table and review them.");
  if(answer.back===true){
    if(!choice.castStage.canBack)throw new Error("This is already the first casting stage.");
    if(draft.cursor>0){draft.cursor--;draft.targets=draft.targets.slice(0,draft.cursor);}
    else{draft.modes=null;draft.targets=[];}
    draft.version++;draft.offeredSignature=null;return {draft};
  }
  const indices=answer.indices??[],problem=checked(choice,indices);
  if(problem)throw new Error(problem);
  if(choice.stage==="modes"){
    draft.modes=[...choice.options[indices[0]].modeIndices];draft.targets=[];draft.cursor=0;
  }else if(choice.stage==="targets"){
    const {offers}=live(state,draft),actions=chosen(state,draft,offers);
    const value=choice.mode==="many"?indices.map(i=>choice.options[i].target):choice.options[indices[0]].target;
    if(!actions.some(action=>fill(state,draft,action,draft.cursor,value)))throw new Error("Invalid selection. Those targets cannot be chosen together for this mode.");
    draft.targets[draft.cursor]=value;draft.cursor++;
  }else{
    const {offers}=live(state,draft),actions=[...new Map(chosen(state,draft,offers).map(a=>[hashState(a),a])).values()];
    const action=actions[indices[0]];
    return {draft:null,action:{...action,castStage:{...choice.castStage,canBack:false,selectedModes:choice.selectedModes}}};
  }
  draft.version++;draft.offeredSignature=null;
  return {draft};
}
