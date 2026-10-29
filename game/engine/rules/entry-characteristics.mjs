/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
import {chosenFor} from "../script/chosen.mjs";
import {validateSbaReturnFirstEntry} from "./sba-move-results.mjs";

export function patchEnteringObject(object, patch) {
  for (const key of patch?.remove ?? []) delete object[key];
  Object.assign(object, structuredClone(patch?.set ?? {}));
}

/* CR 614.12: derive an entrant without moving it or counting it among other battlefield permanents. */
export function prospectiveEnteringState(state, frame) {
  const object = {...(frame.candidate ?? state.objects[frame.objectId]), id: frame.objectId, zone: "battlefield", zonePlayer: null,
    controller: frame.player, counters: {}, tapped: false, timestamp: state.nextTimestamp};
  patchEnteringObject(object, frame.entryFace);
  if (frame.faceDown) Object.assign(object, {types: ["Creature"], subtypes: [], supertypes: [], colors: [], keywords: [], abilities: [], power: 2, toughness: 2});
  patchEnteringObject(object, frame.objectPatch);
  const own = (object.abilities ?? []).filter(ability => ability.kind === "static" && ability.layer !== undefined
    && ability.affects?.self === true && !ability.worksFrom).map(ability => ({...chosenFor(ability, object),
    sourceId: frame.objectId, sourceController: frame.player, timestamp: ability.timestamp ?? object.timestamp,
    partOf: `${frame.objectId}|${ability.text ?? ability.id ?? ""}`, affects: {...ability.affects, ids: [frame.objectId]}}));
  return {...state, objects: {...state.objects, [frame.objectId]: object}, effects: [...(state.effects ?? []), ...own]};
}

/* CR 306.5b, 310.4b: printed values supply intrinsic counters only while the prospective ability exists.
   Independent counter grants and placement replacements remain with their existing callers. */
export function intrinsicEnteringCounters(object, current) {
  const counters = {};
  if (current.types.includes("Planeswalker") && !current.lostAbilities && Number.isInteger(object.loyalty)) counters.loyalty = object.loyalty;
  if (current.types.includes("Battle") && !current.lostAbilities && Number.isInteger(object.defense)) counters.defense = object.defense;
  return counters;
}

/* Internal native entry results survive JSON, but cannot be substituted by a card's skip-replacement flag. */
const PROGRESS_KEYS = ["candidate","entryFace","objectPatch","faceDown","independentCounters","phyrexianLife","raw","counts","kinds","applied","generation","entryApplied"];

function returnCounterBinding(state, objectId, player, returnBatchId, child = null) {
  const operation = state.ruleOperation, batch = operation?.sbaReturnBatches?.[returnBatchId];
  const parent = child ? operation?.frames.at(-2) : operation?.frames.at(-1);
  const member = batch?.members.find(member => member.id === objectId), prepared = operation?.sbaPreparedReturns?.[member?.prepared];
  if (!operation || !batch || batch.operation !== operation.serial || batch.phase !== "counters"
    || !operation.sbaCohorts?.[batch.sourceCohortId] || batch.counterPlanningId !== objectId
    || parent?.kind !== "sba-linked-returns" || parent.returnBatchId !== returnBatchId
    || !["counters","after-counter","counter-recheck","after-counter-recheck"].includes(parent.stage)
    || child && (operation.frames.at(-1) !== child || child.kind !== "entry-counters")
    || !member || member.skipped || member.owner !== player || state.objects[objectId]?.zone !== member.from
    || state.objects[objectId]?.owner !== player || !prepared || prepared.objectId !== objectId
    || prepared.returnBatchId !== returnBatchId || prepared.sourceCohortId !== batch.sourceCohortId)
    throw new Error("No matching native return counter-progress binding");
  return {operation,batch,member,prepared};
}

function readCounterProgress(state, prepared, objectId, player, returnBatchId, child = null) {
  const binding = returnCounterBinding(state,objectId,player,returnBatchId,child);
  readEntryCounterResult(state,prepared,objectId,player,{allowPartial:true});
  const result = binding.operation.entryCounterResults?.[prepared.counterResult], progress = result?.progress;
  if (binding.prepared.counterResult !== prepared.counterResult || !progress || progress.operation !== binding.operation.serial
    || progress.returnBatchId !== returnBatchId || progress.sourceCohortId !== binding.batch.sourceCohortId
    || progress.objectId !== objectId || progress.player !== player
    || typeof progress.complete!=="boolean"
    || JSON.stringify(progress.raw) !== JSON.stringify(result.raw)
    || Object.values(progress.counts ?? {}).some(count => !Number.isInteger(count) || count < 0)
    || JSON.stringify(Object.fromEntries(Object.entries(progress.counts ?? {}).filter(([,count]) => count > 0))) !== JSON.stringify(result.counters)
    || JSON.stringify(progress.kinds) !== JSON.stringify(Object.keys(result.raw))
    || JSON.stringify(Object.keys(progress.counts ?? {})) !== JSON.stringify(progress.kinds)
    || !Array.isArray(progress.entryApplied)||new Set(progress.entryApplied).size!==progress.entryApplied.length
    || progress.entryApplied.some(key=>typeof key!=="string")
    || progress.generation!==undefined&&(!Number.isInteger(progress.generation)||progress.generation<0)
    || Object.values(progress.independentCounters??{}).some(count=>!Number.isInteger(count)||count<0)
    || progress.kinds.some(counter => !Array.isArray(progress.applied?.[counter]) || new Set(progress.applied[counter]).size !== progress.applied[counter].length
      || progress.applied[counter].some(key => typeof key !== "string")))
    throw new Error("No saved native return counter progress");
  return {...binding,result,progress};
}

/* Old receipts still return counts through entryCounterResult. Only a new return-bound receipt can resume a completed
   plan, preserving the exact count and applied identities instead of inferring an order from the final number. */
export function entryCounterProgressFrame(state, prepared, objectId, player, returnBatchId) {
  const binding = readCounterProgress(state,prepared,objectId,player,returnBatchId);
  const frame={...structuredClone(binding.progress),kind:"entry-counters",index:0,progressParent:prepared.counterResult};
  updateReturnCounterGrant(binding,frame);
  return frame;
}

export function restoreEntryCounterProgress(state, frame) {
  if (!frame.progressParent) return;
  const {prepared} = returnCounterBinding(state,frame.objectId,frame.player,frame.returnBatchId,frame);
  if (prepared.counterResult !== frame.progressParent) throw new Error("Counter continuation does not match its native entry result");
  const {progress} = readCounterProgress(state,prepared,frame.objectId,frame.player,frame.returnBatchId,frame);
  if (!frame.progressInitialized) {
    Object.assign(frame,structuredClone(progress),{index:0,progressInitialized:true});
    updateReturnCounterGrant(returnCounterBinding(state,frame.objectId,frame.player,frame.returnBatchId,frame),frame);
  }
}

const ENTERING_PROGRESS_KEYS = ["objectId","player","candidate","entryFace","faceDown","x","escaped","kicked","phyrexianLife",
  "objectPatch","proposal","generation","asks","copyTapped","copyCounters","gainsKeywords","to","selectedProtector","battleGeneration",
  "battleOptions","additionalCounters"];

function returnEntryBinding(state,objectId,player,returnBatchId,child=null) {
  const operation=state.ruleOperation,batch=operation?.sbaReturnBatches?.[returnBatchId];
  const parent=child?operation?.frames.at(-2):operation?.frames.at(-1);
  const member=batch?.members.find(member=>member.id===objectId),prepared=operation?.sbaPreparedReturns?.[member?.prepared];
  const firstRecheck=child&&parent?.reopenReturn&&parent?.kind==="move-one"&&parent.stage==="after-enter";
  if(firstRecheck)validateSbaReturnFirstEntry(state,child);
  const initial=firstRecheck||child&&parent?.kind==="move-one"&&parent.prepareOnly&&parent.returnBatchId===returnBatchId&&parent.id===objectId
    && operation.frames.at(-3)?.kind==="sba-linked-returns"&&operation.frames.at(-3).stage==="after-entry";
  const resumed=parent?.kind==="sba-linked-returns"&&parent.returnBatchId===returnBatchId
    && (child?parent.stage==="after-entry-recheck"&&parent.recheckingEntryId===objectId:parent.stage==="entry-recheck");
  if(!operation||!batch||batch.operation!==operation.serial||!["planning","counters"].includes(batch.phase)
    || !operation.sbaCohorts?.[batch.sourceCohortId]||child&&(operation.frames.at(-1)!==child||child.kind!=="entering")
    || !initial&&!resumed||!member||member.skipped||member.owner!==player||state.objects[objectId]?.zone!==member.from
    || state.objects[objectId]?.owner!==player||!initial&&(!prepared||prepared.objectId!==objectId||prepared.returnBatchId!==returnBatchId))
    throw new Error("No matching native deferred-entry progress binding");
  return {operation,batch,member,prepared};
}

const entryMetadata = entering => Object.fromEntries(Object.entries(entering??{}).filter(([key])=>key!=="counters"));

function readDeferredEntryProgress(state,prepared,objectId,player,returnBatchId,child=null) {
  const binding=returnEntryBinding(state,objectId,player,returnBatchId,child);
  return readBoundEntryProgress(binding,prepared,objectId,player,returnBatchId);
}

function readBoundEntryProgress(binding,prepared,objectId,player,returnBatchId) {
  const progress=binding.operation.sbaEntryProgress?.[prepared.entryProgress];
  if(binding.prepared?.entryProgress!==prepared.entryProgress||!progress||progress.operation!==binding.operation.serial
    || progress.returnBatchId!==returnBatchId||progress.sourceCohortId!==binding.batch.sourceCohortId||progress.source!==binding.member.source
    || progress.objectId!==objectId||progress.player!==player||progress.frame.objectId!==objectId||progress.frame.player!==player
    || JSON.stringify(prepared.entryPatch)!==JSON.stringify(progress.result.objectPatch)
    || JSON.stringify(prepared.counterPlan)!==JSON.stringify(progress.result.counterPlan)
    || JSON.stringify(entryMetadata(prepared.entering))!==JSON.stringify(entryMetadata(progress.result.entering)))
    throw new Error("No saved matching native deferred-entry progress");
  return {...binding,progress};
}

export function deferredEntryProgressFrame(state,prepared,objectId,player,returnBatchId) {
  const {progress}=readDeferredEntryProgress(state,prepared,objectId,player,returnBatchId);
  return {...structuredClone(progress.frame),kind:"entering",returnBatchId,deferCounters:true,entryProgressParent:prepared.entryProgress};
}

/* Only the active native counter child can yield to a newly applicable containing entry replacement. */
export function counterDeferredEntryProgressFrame(state,frame) {
  if(!frame.returnBatchId)return null;
  const binding=returnCounterBinding(state,frame.objectId,frame.player,frame.returnBatchId,frame);
  const {progress}=readBoundEntryProgress(binding,binding.prepared,frame.objectId,frame.player,frame.returnBatchId);
  return {...structuredClone(progress.frame),kind:"entering",returnBatchId:frame.returnBatchId,deferCounters:true,
    entryProgressParent:binding.prepared.entryProgress};
}

function updateReturnCounterGrant(binding,frame) {
  const {progress}=readBoundEntryProgress(binding,binding.prepared,frame.objectId,frame.player,frame.returnBatchId);
  const applied=progress.frame.proposal.appliedBy??[];
  if(JSON.stringify(applied.slice(0,(frame.entryApplied??[]).length))!==JSON.stringify(frame.entryApplied??[]))
    throw new Error("A counter continuation cannot discard its containing entry prefix");
  const next=progress.result.counterPlan.independentCounters??{},previous=frame.independentCounters??{};
  const changed=JSON.stringify(next)!==JSON.stringify(previous);
  if(changed&&applied.length===(frame.entryApplied??[]).length)throw new Error("Counter grants require a new native entry replacement");
  for(const counter of new Set([...Object.keys(previous),...Object.keys(next)])){
    const delta=(next[counter]??0)-(previous[counter]??0);
    if(!Number.isInteger(delta)||delta<0)throw new Error("A containing entry cannot undo committed counter grants");
    if(delta){
      if(!frame.kinds.includes(counter)){frame.kinds.push(counter);frame.raw[counter]=0;frame.counts[counter]=0;frame.applied[counter]=[];}
      frame.counts[counter]+=delta;
    }
  }
  Object.assign(frame,{independentCounters:structuredClone(next),entryApplied:structuredClone(applied),
    entryFace:structuredClone(progress.result.counterPlan.entryFace),objectPatch:structuredClone(progress.result.objectPatch),entryGrantChanged:changed});
}

export function restoreDeferredEntryProgress(state,frame) {
  if(!frame.entryProgressParent)return;
  const binding=returnEntryBinding(state,frame.objectId,frame.player,frame.returnBatchId,frame);
  if(binding.prepared?.entryProgress!==frame.entryProgressParent)throw new Error("Deferred entry does not match its native member receipt");
  const {progress}=readDeferredEntryProgress(state,binding.prepared,frame.objectId,frame.player,frame.returnBatchId,frame);
  if(!frame.entryProgressInitialized)Object.assign(frame,structuredClone(progress.frame),{entryProgressInitialized:true});
}

export function saveDeferredEntryProgress(state,frame,result) {
  const binding=returnEntryBinding(state,frame.objectId,frame.player,frame.returnBatchId,frame),{operation,batch,member}=binding;
  if(frame.entryProgressParent){
    const previous=readDeferredEntryProgress(state,binding.prepared,frame.objectId,frame.player,frame.returnBatchId,frame).progress;
    if(["applied","appliedBy"].some(key=>JSON.stringify((frame.proposal[key]??[]).slice(0,(previous.frame.proposal[key]??[]).length))!==JSON.stringify(previous.frame.proposal[key]??[])))
      throw new Error("A deferred entry cannot discard its committed native replacement prefix");
  }
  const key=`${operation.serial}:sba-entry:${operation.sbaEntryProgressSerial=(operation.sbaEntryProgressSerial??0)+1}`;
  (operation.sbaEntryProgress??={})[key]={operation:operation.serial,returnBatchId:frame.returnBatchId,sourceCohortId:batch.sourceCohortId,
    source:member.source,objectId:frame.objectId,player:frame.player,
    frame:Object.fromEntries(ENTERING_PROGRESS_KEYS.filter(name=>frame[name]!==undefined).map(name=>[name,structuredClone(frame[name])])),result:structuredClone(result)};
  const saved=operation.sbaEntryProgress[key].frame;
  saved.proposal.counters=structuredClone(result.entering.counters);delete saved.proposal.chosenCounters;
  saved.copyCounters={};saved.additionalCounters={};saved.proposal.tapped=result.entering.tapped;saved.copyTapped=false;
  if(frame.entryProgressParent)delete operation.sbaEntryProgress[frame.entryProgressParent];
  return key;
}

export function saveEntryCounterResult(state, frame, raw, counters, {complete=true}={}) {
  const operation = state.ruleOperation;
  if (!operation) throw new Error("Entry counter results require an active rule operation");
  const binding = frame.returnBatchId ? returnCounterBinding(state,frame.objectId,frame.player,frame.returnBatchId,frame) : null;
  if(!complete&&!binding)throw new Error("Partial counters require a native return binding");
  if(binding&&!frame.entryApplied){
    const {progress}=readBoundEntryProgress(binding,binding.prepared,frame.objectId,frame.player,frame.returnBatchId);
    frame.entryApplied=structuredClone(progress.frame.proposal.appliedBy??[]);
  }
  if (frame.progressParent) {
    const previous = operation.entryCounterResults?.[frame.progressParent]?.progress;
    if (!binding || !previous || binding.prepared.counterResult !== frame.progressParent
      || Object.entries(previous.raw).some(([counter,count])=>raw[counter]!==count)
      || Object.keys(raw).some(counter=>!(counter in previous.raw)&&raw[counter]!==0)
      || Object.entries(previous.applied ?? {}).some(([counter,keys]) => JSON.stringify(frame.applied?.[counter]?.slice(0,keys.length)) !== JSON.stringify(keys)))
      throw new Error("A counter continuation cannot discard its committed native prefix");
  }
  const key = `${operation.serial}:${operation.entryCounterSerial = (operation.entryCounterSerial ?? 0) + 1}`;
  (operation.entryCounterResults ??= {})[key] = {objectId: frame.objectId, player: frame.player,
    raw: structuredClone(raw), counters: structuredClone(counters)};
  if (binding) operation.entryCounterResults[key].progress = {
    ...Object.fromEntries(PROGRESS_KEYS.filter(name => frame[name] !== undefined).map(name => [name,structuredClone(frame[name])])),
    operation:operation.serial,returnBatchId:frame.returnBatchId,sourceCohortId:binding.batch.sourceCohortId,objectId:frame.objectId,player:frame.player,complete,
  };
  if (frame.progressParent) delete operation.entryCounterResults[frame.progressParent];
  return key;
}

export function entryCounterResult(state,prepared,objectId,player,{consume=false}={}) {
  return readEntryCounterResult(state,prepared,objectId,player,{consume});
}

function readEntryCounterResult(state, prepared, objectId, player, {consume = false,allowPartial=false} = {}) {
  if (prepared?.counterResult === undefined) return null;
  const operation = state.ruleOperation, result = operation?.entryCounterResults?.[prepared.counterResult];
  const raw = prepared.entering?.counters ?? {};
  if (!result || result.objectId !== objectId || result.player !== player || !allowPartial&&result.progress?.complete===false
    || Object.keys(raw).length !== Object.keys(result.counters).length
    || Object.entries(result.counters).some(([counter, count]) => raw[counter] !== count))
    throw new Error("No matching internal entry counter result");
  const counters = structuredClone(result.counters);
  if (consume) delete operation.entryCounterResults[prepared.counterResult];
  return counters;
}
