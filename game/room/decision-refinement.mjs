/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
/* Private references into a STILL-LIVE native question. Never save or restore an engine/controller question here. */
import {awaitingChoice} from "../engine/rules/turn.mjs";
import {offerScript,offerSpecs} from "../engine/rules/actions.mjs";
import {hashState} from "../engine/journal.mjs";
import {isChoosing,targetName,targetCandidates} from "../engine/script/bind.mjs";
import {targetFacts} from "../engine/script/decision.mjs";
import {castEntryFor} from "./cast-stages.mjs";
const SCHEMA="CrankDecisionRefinement@1";
const targetKey=t=>t?`${t.kind}:${t.id}`:"none";
const modeKey=m=>(m??[]).join(",");
const expired=()=>Object.assign(new Error("The native question changed. Reopen the table and answer its current choice."),{refinementExpired:true});
const unsupported=message=>Object.assign(new Error(message),{refinementUnavailable:true});
function descriptor(state,pending,{index,routeId}={}){
  const a=state.awaiting,q=awaitingChoice(state);
  if(!a||!pending||q?.id!==pending.id||state.players[a.player]?.lost)throw expired();
  let modal,variants,kind,locked=false,entry=null,sourceId=null,route=null;
  if(a.kind==="trigger-targets"){
    entry=state.stack.find(e=>e.stackId===a.stackId);modal=entry?.script?.modal;
    if(!modal||q.options.some(o=>o.random))throw unsupported("This native mode roll must happen before its targets can be refined.");
    kind="trigger";locked=modal.random===true&&Number.isInteger(entry.randomMode);
    variants=q.options.filter(o=>Array.isArray(o.modes)||o.none).map(o=>({index:o.index,modes:o.modes??[],targets:o.targets??[]}));
    sourceId=entry.cardId;
  }else if(a.kind==="effect-choice"&&a.effect==="play"&&!a.funding&&!a.targeting&&!a.paying&&!a.planning){
    const selected=a.choices?.[index],candidateRoute=routeId??(selected?castEntryFor(selected).actionId:null);
    const action=a.choices?.find(c=>c.kind==="cast"&&castEntryFor(c).actionId===candidateRoute&&Array.isArray(c.modes));
    if(!action)throw unsupported("Choose an offered modal card before refining its modes. Native decline remains its own choice.");
    modal=offerScript(state,{...action,modes:undefined})?.modal;kind="effect-cast";sourceId=action.objectId;route=candidateRoute;
    variants=a.choices.map((c,index)=>({action:c,index})).filter(({action:c})=>c.kind==="cast"&&Array.isArray(c.modes)&&castEntryFor(c).actionId===route)
      .map(({action:c,index})=>({index,modes:c.modes,targets:c.targets??[]}));
  }else throw unsupported("This choice already uses its native target or payment steps. Complete the current native choice.");
  if(!modal||!variants.length)throw expired();
  if(variants.some(v=>v.targets.some(t=>Array.isArray(t)||isChoosing(t))))
    throw unsupported("These modes use native counted-target steps. Answer the original choice to continue those steps.");
  if(kind==="effect-cast")for(const v of variants){
    const action=a.choices[v.index],script=offerScript(state,action),{context}=offerSpecs(state,a.player,action);
    if(!script||script.targets.length!==v.targets.length||v.targets.some((target,index)=>target&&!targetCandidates(state,script.targets[index],context).some(c=>targetKey(c)===targetKey(target))))throw expired();
  }
  const nativeSignature=hashState({facts:hashState(state),choice:q,awaiting:a,entry,resolving:state.resolving??null,operation:state.ruleOperation??null});
  return {q,modal,variants,kind,locked,sourceId,route,nativeSignature,actor:a.player};
}
export function refinementEntry(state,pending,index=0){
  try{const d=descriptor(state,pending,{index});return {schema:SCHEMA,kind:d.kind,originalChoiceId:pending.id,
    ...(d.route?{actionId:d.route}:{}),modeSelection:d.locked?"locked":"choose"};}
  catch(error){if(error.refinementExpired||error.refinementUnavailable)return null;throw error;}
}
export function beginRefinement(state,pending,index,id){
  const d=descriptor(state,pending,{index});
  return {schema:SCHEMA,id,actor:d.actor,kind:d.kind,originalChoiceId:pending.id,originalSignature:hashState(pending),
    nativeSignature:d.nativeSignature,...(d.route?{routeId:d.route}:{}),modes:d.locked?[...d.variants[0].modes]:null,
    targets:[],cursor:0,version:0};
}
function live(state,pending,draft){
  if(draft?.schema!==SCHEMA||pending?.id!==draft.originalChoiceId||hashState(pending)!==draft.originalSignature)throw expired();
  const d=descriptor(state,pending,{routeId:draft.routeId});
  if(d.nativeSignature!==draft.nativeSignature||d.actor!==draft.actor)throw expired();
  return d;
}
function selected(d,draft){
  const variants=d.variants.filter(v=>modeKey(v.modes)===modeKey(draft.modes))
    .filter(v=>draft.targets.every((target,index)=>targetKey(v.targets[index])===targetKey(target)));
  if(!variants.length)throw expired();return variants;
}
function groups(modal,modes,id){
  const result=[],seen=new Map();
  for(const mode of modes){const occurrence=seen.get(mode)??0;seen.set(mode,occurrence+1);
    for(const [local,spec]of(modal.modes[mode].targets??[]).entries())result.push({index:result.length,modeIndex:mode,
      modeInstanceId:`${id}/mode:${mode}/instance:${occurrence}`,id:`${id}/mode:${mode}/instance:${occurrence}/target:${local}`,spec});}
  return result;
}
export function refinementChoice(state,pending,draft){
  const d=live(state,pending,draft),stage=draft.modes===null?"modes":draft.cursor<groups(d.modal,draft.modes,draft.id).length?"targets":"confirm";
  const canBack=draft.cursor>0||(!d.locked&&draft.modes!==null),base={id:`${draft.id}/question:${draft.version}`,stage,
    ...(d.sourceId!==null?{sourceId:d.sourceId}:{}),mode:"one",min:1,max:1,
    cancellation:{schema:"CrankDecisionCancel@1",allowed:true,kind:"close-refinement",returnsPriority:false,
      reason:"Close these private selections. The original native choice stays pending; no priority is returned."},
    refinement:{schema:SCHEMA,transactionId:draft.id,originalChoiceId:draft.originalChoiceId,originalSignature:draft.originalSignature,
      kind:d.kind,stage,canBack,modeSelection:d.locked?"locked":"choose"}};
  if(stage==="modes"){
    const sets=[...new Map(d.variants.map(v=>[modeKey(v.modes),v.modes])).values()];
    const allowedCounts=[...new Set(sets.map(m=>m.length))].sort((a,b)=>a-b);
    return {...base,title:"Choose modes for the pending native choice",
      modeCardinality:{min:allowedCounts[0],max:allowedCounts.at(-1),allowedCounts,repeatable:d.modal.sameMode===true},
      modeChoices:d.modal.modes.map((m,index)=>({id:`${draft.id}/mode:${index}`,modeIndex:index,label:m.text,...(m.cost?{additionalCost:m.cost}:{})})),
      options:sets.map((modes,index)=>({index,id:`${draft.id}/modes:${modeKey(modes)}`,modeIndices:[...modes],
        label:modes.length?modes.map(i=>d.modal.modes[i].text).join("; "):"Choose none"}))};
  }
  const variants=selected(d,draft),all=groups(d.modal,draft.modes,draft.id),group=all[draft.cursor];
  const selectedModes=draft.modes.map(i=>({modeIndex:i,label:d.modal.modes[i].text}));
  if(group){
    const targets=[...new Map(variants.map(v=>[targetKey(v.targets[group.index]),v.targets[group.index]])).values()];
    return {...base,title:`${d.modal.modes[group.modeIndex].text}: choose targets`,modeIndex:group.modeIndex,modeInstanceId:group.modeInstanceId,targetGroupId:group.id,selectedModes,
      options:targets.map((target,index)=>({index,id:`${group.id}/${targetKey(target)}`,target:structuredClone(target),label:targetName(state,target)||"No target",
        ...(target?.kind==="object"?{cardId:target.id}:target?.kind==="player"?{playerId:target.id}:{}),...targetFacts(state,target)}))};
  }
  return {...base,title:"Confirm the pending native choice",selectedModes,selectedTargets:structuredClone(draft.targets),
    options:variants.map((v,index)=>({index,id:`${draft.id}/native:${v.index}`,nativeIndex:v.index,label:d.q.options[v.index].label}))};
}
export function answerRefinement(state,pending,draft,answer){
  const choice=refinementChoice(state,pending,draft);
  if(answer.cancel===true)return {draft:null,closed:true};
  if(answer.back===true){
    if(!choice.refinement.canBack)throw new Error("Back cannot cross this native commitment boundary.");
    if(draft.cursor>0){draft.cursor--;draft.targets=draft.targets.slice(0,draft.cursor);}else draft.modes=null;
  }else{
    const indices=answer.indices??[];
    if(indices.length!==1||!Number.isInteger(indices[0])||!choice.options[indices[0]])throw new Error("Invalid selection");
    const option=choice.options[indices[0]];
    if(choice.stage==="modes")draft.modes=[...option.modeIndices];
    else if(choice.stage==="targets"){draft.targets.push(structuredClone(option.target));draft.cursor++;}
    else return {draft:null,nativeAnswer:{indices:[option.nativeIndex],choiceId:pending.id}};
  }
  draft.version++;return {draft};
}
