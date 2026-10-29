/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
import {registerRuleOperation,askRuleOperation,emitRuleEvents} from "./operations.mjs";
import {ruleReplacementCandidates,applyRuleReplacement,consumeDamageReplacements} from "./replacement.mjs";
import {controllerOf} from "./layers.mjs";
import {damageEffectProposals,commitDamageProposal,DAMAGING} from "../script/effects/resources.mjs";
import {runEffect,eachOf} from "../script/effects/index.mjs";
import {conditionHolds} from "../script/condition.mjs";
import {countEffect} from "../script/amount.mjs";
import {bindEffect} from "../script/bind.mjs";
import {zoneEffectFrame} from "./zone-operation.mjs";
import {destructionFrame} from "./destruction-operation.mjs";
import {tokenEntryEffectFrame} from "../script/effects/permanents.mjs";

export const damageEffectFrame=(effect,context)=>({kind:"damage-effect",effect,context});
export const outsideEffectsFrame=(effects,context,prefix=[])=>({kind:"outside-effects",effects,context,prefix});
const liveHit=(state,p)=>p.toPlayer !== undefined && p.toPlayer !== null
  ? Boolean(state.players[p.toPlayer] && !state.players[p.toPlayer].lost)
  : state.objects[p.toCard]?.zone === "battlefield";
const chooser=(state,p)=>p.toPlayer ?? (state.objects[p.toCard] ? controllerOf(state,p.toCard) : null);
const reservations=(frame,except=[])=>frame.proposals.flatMap((p,i)=>!p.void && !except.includes(i) ? p.damageConsumption ?? []:[]);
function finiteGroup(state,frame,key,player) {
  return frame.proposals.flatMap((p,index)=>{
    if (!liveHit(state,p) || chooser(state,p)!==player) return [];
    const candidate=ruleReplacementCandidates(state,p,{reserved:reservations(frame,[index])}).find(c=>c.key===key);
    return Number.isInteger(candidate?.ability.prevent) ? [{index,amount:p.amount,capacity:candidate.ability.prevent}]:[];
  });
}
function sharedShieldOffers(state,frame,player) {
  const offers=frame.proposals.flatMap((p,index)=>liveHit(state,p) && chooser(state,p)===player
    ? ruleReplacementCandidates(state,p,{reserved:reservations(frame,[index])}).map(candidate=>({index,...candidate})):[]);
  if (!offers.some(c=>Number.isInteger(c.ability.prevent) && finiteGroup(state,frame,c.key,player).length>1)) return null;
  // The finite shield is one allocation across the simultaneous event. Modifiers to either source may precede it.
  return offers.filter((c,index)=>!Number.isInteger(c.ability.prevent) || offers.findIndex(other=>other.key===c.key)===index);
}
function applyDamageChoice(state,frame,index,key) {
  const p=frame.proposals[index],group=finiteGroup(state,frame,key,chooser(state,p));
  if (group.length>1) {
    const total=Math.min(group[0].capacity,group.reduce((n,g)=>n+g.amount,0));
    if (total<group.reduce((n,g)=>n+g.amount,0)) {
      frame.allocating={key,group};
      return askRuleOperation(state,frame,{player:chooser(state,p),choice:{
        id:`outside-damage-allocation:${state.ruleOperation.serial}:${index}:${(p.appliedBy ?? []).length}`,
        title:`Allocate ${total} damage prevention`,mode:"amount",min:0,max:0,total,minEach:0,
        options:group.map(g=>({max:g.amount,label:`${frame.proposals[g.index].sourceRef?.name ?? "Source"}: ${g.amount} damage`,
          ...(frame.proposals[g.index].sourceId != null ? {cardId:frame.proposals[g.index].sourceId}:{})}))}});
    }
    const reserved=reservations(frame,group.map(g=>g.index));
    for (const g of group) frame.proposals[g.index]=applyRuleReplacement(state,frame.proposals[g.index],key,{reserved,preventAmount:g.amount});
    frame.cursor=0;
    return {status:"continue"};
  }
  frame.proposals[index]=applyRuleReplacement(state,p,key,{reserved:reservations(frame,[index])});
  return {status:"continue"};
}

registerRuleOperation("damage-effect",(state,frame)=>{
  if (state.players[frame.context.controller]?.lost) return {status:"done"};
  if (!frame.proposals) {
    frame.proposals=damageEffectProposals(state,frame.effect,frame.context);
    const batch=`outside-damage:${state.ruleOperation.serial}:${state.damageOperationSerial=(state.damageOperationSerial ?? 0)+1}`;
    frame.proposals.forEach(p=>p.batch=batch);
    frame.cursor=0;frame.dealt=[];
  }
  if (frame.allocating && frame.answer) {
    const {key,group}=frame.allocating,answer=frame.answer;
    delete frame.allocating;delete frame.answer;
    const current=finiteGroup(state,frame,key,chooser(state,frame.proposals[group[0].index]));
    if (JSON.stringify(current)===JSON.stringify(group)) {
      const reserved=reservations(frame,group.map(g=>g.index));
      group.forEach((g,i)=>{frame.proposals[g.index]=applyRuleReplacement(state,frame.proposals[g.index],key,{reserved,preventAmount:answer.amounts[i]});});
      frame.cursor=0;
    }
  }
  // A concession withdraws the question and re-enters the frame without an answer. Rebuild the current allocation.
  if (frame.allocating && !frame.answer) delete frame.allocating;
  for (;frame.cursor<frame.proposals.length;frame.cursor++) {
    const p=frame.proposals[frame.cursor];
    if (!liveHit(state,p)) {p.void=true;delete frame.answer;continue;}
    if (!frame.answer) {delete frame.keys;delete frame.offers;}
    const reserved=reservations(frame,[frame.cursor]);
    let candidates=ruleReplacementCandidates(state,p,{reserved});
    const offers=sharedShieldOffers(state,frame,chooser(state,p));
    if (frame.answer) {
      const chosen=frame.offers?.[frame.answer.indices[0]] ?? {index:frame.cursor,key:frame.keys?.[frame.answer.indices[0]]};
      delete frame.answer;delete frame.keys;delete frame.offers;
      const chosenHit=frame.proposals[chosen.index];
      if (chosenHit && liveHit(state,chosenHit) && ruleReplacementCandidates(state,chosenHit,{reserved:reservations(frame,[chosen.index])}).some(c=>c.key===chosen.key)) {
        return applyDamageChoice(state,frame,chosen.index,chosen.key);
      }
      // A departing holder cannot reinterpret an old option index as a different replacement.
    }
    if (offers?.length>1) {
      frame.offers=offers.map(c=>({index:c.index,key:c.key}));
      return askRuleOperation(state,frame,{player:chooser(state,p),choice:{
        id:`outside-damage-shared:${state.ruleOperation.serial}:${frame.proposals.reduce((n,one)=>n+(one.appliedBy ?? []).length,0)}`,
        title:"Simultaneous damage: which effect applies next?",mode:"one",min:1,max:1,
        options:offers.map((c,index)=>({index,label:`${state.objects[c.holderId]?.card ?? c.ability.name ?? "Effect"} for ${frame.proposals[c.index].sourceRef?.name ?? "source"}: ${c.ability.text ?? "Prevent this damage"}`,
          ...(c.holderId != null ? {cardId:c.holderId}:{})}))}});
    }
    if (candidates.length>1) {
      frame.keys=candidates.map(c=>c.key);
      return askRuleOperation(state,frame,{player:chooser(state,p),choice:{
        id:`outside-damage:${state.ruleOperation.serial}:${frame.cursor}:${(p.appliedBy ?? []).length}`,
        title:`${p.amount} damage: which effect applies first?`,mode:"one",min:1,max:1,
        options:candidates.map((c,index)=>({index,label:`${state.objects[c.holderId]?.card ?? c.ability.name ?? "Effect"} first: ${c.ability.text ?? "Prevent this damage"}`,
          ...(c.holderId !== null ? {cardId:c.holderId}: {})}))}});
    }
    if (candidates.length===1) {
      return applyDamageChoice(state,frame,frame.cursor,candidates[0].key);
    }
  }
  if (!frame.committed) {
    frame.committed=true;const followUps=[];
    for (const p of frame.proposals) {
      if (p.void || !liveHit(state,p)) continue;
      emitRuleEvents(state,consumeDamageReplacements(state,p));
      emitRuleEvents(state,commitDamageProposal(state,p,frame.context,frame.dealt,{followUps:false}));
      followUps.push(...(p.followUps ?? []));
    }
    if (followUps.length) return {status:"continue",children:followUps.map(f=>outsideEffectsFrame(f.effects,f.context))};
  }
  return {status:"done",result:{context:{...(frame.effect.remember ? {remembered:frame.dealt}:{}),
    ...(frame.context.excessDamage !== undefined ? {excessDamage:frame.context.excessDamage}: {})}}};
});

registerRuleOperation("outside-effects",(state,frame,rng)=>{
  if (!frame.started) {
    frame.started=true;frame.cursor=0;
    emitRuleEvents(state,frame.prefix ?? []);delete frame.prefix;
  }
  if (state.players[frame.context.controller]?.lost) return {status:"done"};
  if (frame.childResult) {Object.assign(frame.context,frame.childResult.context ?? {});delete frame.childResult;}
  if (frame.cursor>=frame.effects.length) return {status:"done",result:{context:frame.context}};
  const effect=countEffect(state,bindEffect(frame.effects[frame.cursor++],frame.context),frame.context);
  if (effect.effect === "branch") {
    const holds=conditionHolds(state,effect.if,{...frame.context,source:frame.context.source ?? null});
    return {status:"continue",children:[outsideEffectsFrame((holds ? effect.then:effect.otherwise) ?? [],frame.context)]};
  }
  if (effect.effect === "repeatFor") return {status:"continue",children:[{kind:"outside-repeat",effect,context:frame.context}]};
  let child=DAMAGING[effect.effect] ? damageEffectFrame(effect,frame.context)
    :zoneEffectFrame(effect,frame.context) ?? tokenEntryEffectFrame(effect,frame.context);
  if (effect.effect === "destroy" || effect.effect === "destroyAll") child=destructionFrame(effect,frame.context);
  if (child) return {status:"continue",children:[child]};
  emitRuleEvents(state,runEffect(state,effect,frame.context,rng));
  return {status:"continue"};
});

registerRuleOperation("outside-repeat",(state,frame)=>{
  if (state.players[frame.context.controller]?.lost) return {status:"done"};
  if (frame.effect.again !== undefined) {
    if (frame.childResult) Object.assign(frame.context,frame.childResult.context ?? {});
    if (frame.started && !conditionHolds(state,frame.effect.again,{controller:frame.context.controller,source:frame.context.source ?? null,
      remembered:frame.context.remembered,targets:frame.context.targets})) return {status:"done",result:{context:frame.context}};
    frame.started=true;delete frame.childResult;
    return {status:"continue",children:[outsideEffectsFrame(frame.effect.effects ?? [],frame.context)]};
  }
  frame.subjects ??= eachOf(state,frame.effect.each,frame.context);frame.cursor ??=0;
  if (frame.cursor >= frame.subjects.length) return {status:"done"};
  const about=frame.subjects[frame.cursor++];
  return {status:"continue",children:[outsideEffectsFrame(frame.effect.effects ?? [],{...frame.context,about:{...(frame.context.about ?? {}),...about}})]};
});
