/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
import {chosenFor} from "../script/chosen.mjs";

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
const PROGRESS_KEYS = ["candidate","entryFace","objectPatch","faceDown","independentCounters","phyrexianLife","raw","counts","kinds","applied"];

function returnCounterBinding(state, objectId, player, returnBatchId, child = null) {
  const operation = state.ruleOperation, batch = operation?.sbaReturnBatches?.[returnBatchId];
  const parent = child ? operation?.frames.at(-2) : operation?.frames.at(-1);
  const member = batch?.members.find(member => member.id === objectId), prepared = operation?.sbaPreparedReturns?.[member?.prepared];
  if (!operation || !batch || batch.operation !== operation.serial || batch.phase !== "counters"
    || !operation.sbaCohorts?.[batch.sourceCohortId] || batch.counterPlanningId !== objectId
    || parent?.kind !== "sba-linked-returns" || parent.returnBatchId !== returnBatchId
    || !["after-counter","counter-recheck","after-counter-recheck"].includes(parent.stage)
    || child && (operation.frames.at(-1) !== child || child.kind !== "entry-counters")
    || !member || member.skipped || member.owner !== player || state.objects[objectId]?.zone !== member.from
    || state.objects[objectId]?.owner !== player || !prepared || prepared.objectId !== objectId
    || prepared.returnBatchId !== returnBatchId || prepared.sourceCohortId !== batch.sourceCohortId)
    throw new Error("No matching native return counter-progress binding");
  return {operation,batch,member,prepared};
}

function readCounterProgress(state, prepared, objectId, player, returnBatchId, child = null) {
  const binding = returnCounterBinding(state,objectId,player,returnBatchId,child);
  entryCounterResult(state,prepared,objectId,player);
  const result = binding.operation.entryCounterResults?.[prepared.counterResult], progress = result?.progress;
  if (binding.prepared.counterResult !== prepared.counterResult || !progress || progress.operation !== binding.operation.serial
    || progress.returnBatchId !== returnBatchId || progress.sourceCohortId !== binding.batch.sourceCohortId
    || progress.objectId !== objectId || progress.player !== player
    || JSON.stringify(progress.raw) !== JSON.stringify(result.raw)
    || Object.values(progress.counts ?? {}).some(count => !Number.isInteger(count) || count < 0)
    || JSON.stringify(Object.fromEntries(Object.entries(progress.counts ?? {}).filter(([,count]) => count > 0))) !== JSON.stringify(result.counters)
    || JSON.stringify(progress.kinds) !== JSON.stringify(Object.keys(result.raw))
    || JSON.stringify(Object.keys(progress.counts ?? {})) !== JSON.stringify(progress.kinds)
    || progress.kinds.some(counter => !Array.isArray(progress.applied?.[counter]) || new Set(progress.applied[counter]).size !== progress.applied[counter].length
      || progress.applied[counter].some(key => typeof key !== "string")))
    throw new Error("No saved native return counter progress");
  return {...binding,result,progress};
}

/* Old receipts still return counts through entryCounterResult. Only a new return-bound receipt can resume a completed
   plan, preserving the exact count and applied identities instead of inferring an order from the final number. */
export function entryCounterProgressFrame(state, prepared, objectId, player, returnBatchId) {
  const {progress} = readCounterProgress(state,prepared,objectId,player,returnBatchId);
  return {...structuredClone(progress),kind:"entry-counters",index:0,progressParent:prepared.counterResult};
}

export function restoreEntryCounterProgress(state, frame) {
  if (!frame.progressParent) return;
  const {prepared} = returnCounterBinding(state,frame.objectId,frame.player,frame.returnBatchId,frame);
  if (prepared.counterResult !== frame.progressParent) throw new Error("Counter continuation does not match its native entry result");
  const {progress} = readCounterProgress(state,prepared,frame.objectId,frame.player,frame.returnBatchId,frame);
  if (!frame.progressInitialized) {
    Object.assign(frame,structuredClone(progress),{index:0,progressInitialized:true});
  }
}

export function saveEntryCounterResult(state, frame, raw, counters) {
  const operation = state.ruleOperation;
  if (!operation) throw new Error("Entry counter results require an active rule operation");
  const binding = frame.returnBatchId ? returnCounterBinding(state,frame.objectId,frame.player,frame.returnBatchId,frame) : null;
  if (frame.progressParent) {
    const previous = operation.entryCounterResults?.[frame.progressParent]?.progress;
    if (!binding || !previous || binding.prepared.counterResult !== frame.progressParent
      || JSON.stringify(previous.raw) !== JSON.stringify(raw)
      || Object.entries(previous.applied ?? {}).some(([counter,keys]) => JSON.stringify(frame.applied?.[counter]?.slice(0,keys.length)) !== JSON.stringify(keys)))
      throw new Error("A counter continuation cannot discard its committed native prefix");
  }
  const key = `${operation.serial}:${operation.entryCounterSerial = (operation.entryCounterSerial ?? 0) + 1}`;
  (operation.entryCounterResults ??= {})[key] = {objectId: frame.objectId, player: frame.player,
    raw: structuredClone(raw), counters: structuredClone(counters)};
  if (binding) operation.entryCounterResults[key].progress = {
    ...Object.fromEntries(PROGRESS_KEYS.filter(name => frame[name] !== undefined).map(name => [name,structuredClone(frame[name])])),
    operation:operation.serial,returnBatchId:frame.returnBatchId,sourceCohortId:binding.batch.sourceCohortId,objectId:frame.objectId,player:frame.player,
  };
  if (frame.progressParent) delete operation.entryCounterResults[frame.progressParent];
  return key;
}

export function entryCounterResult(state, prepared, objectId, player, {consume = false} = {}) {
  if (prepared?.counterResult === undefined) return null;
  const operation = state.ruleOperation, result = operation?.entryCounterResults?.[prepared.counterResult];
  const raw = prepared.entering?.counters ?? {};
  if (!result || result.objectId !== objectId || result.player !== player
    || Object.keys(raw).length !== Object.keys(result.counters).length
    || Object.entries(result.counters).some(([counter, count]) => raw[counter] !== count))
    throw new Error("No matching internal entry counter result");
  const counters = structuredClone(result.counters);
  if (consume) delete operation.entryCounterResults[prepared.counterResult];
  return counters;
}
