/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
/* Native SBA move preparation is operation-local; a card/client flag never authorizes committing it. */
import {lastKnown} from "./layers.mjs";
function cohortIn(state, key) {
  const operation = state.ruleOperation, cohort = operation?.sbaCohorts?.[key];
  if (!cohort || cohort.operation !== operation.serial) throw new Error("No matching internal SBA cohort");
  return {operation, cohort};
}

export function startSbaCohort(state, frame, members, prefix = []) {
  const operation = state.ruleOperation;
  if (!operation || operation.frames.at(-1) !== frame || frame.kind !== "sba-cohort") throw new Error("SBA preparation needs its native frame");
  const key = `${operation.serial}:sba:${operation.sbaCohortSerial = (operation.sbaCohortSerial ?? 0) + 1}`;
  (operation.sbaCohorts ??= {})[key] = {operation: operation.serial, phase: "planning", prefix: structuredClone(prefix),
    members: members.map(member => ({...structuredClone(member), from: "battlefield", owner: state.objects[member.id]?.owner})), departures: []};
  return key;
}

export function savePreparedSbaMove(state, frame, data) {
  const {operation, cohort} = cohortIn(state, frame.cohortId);
  const member = cohort.members.find(member => member.id === frame.id);
  validateSbaPreparation(state, frame);
  if (member.token
    || !operation.frames.some(parent => parent.kind === "sba-cohort" && parent.cohortId === frame.cohortId)
    || data.proposal?.objectId !== frame.id || data.proposal?.from !== member.from)
    throw new Error("No matching internal SBA move preparation");
  const token = `${operation.serial}:sba-move:${operation.sbaMoveSerial = (operation.sbaMoveSerial ?? 0) + 1}`;
  (operation.sbaPreparedMoves ??= {})[token] = {...structuredClone(data), operation: operation.serial,
    cohortId: frame.cohortId, objectId: frame.id, from: member.from, owner: member.owner};
  member.token = token;
  return token;
}

export function validateSbaPreparation(state, frame) {
  const {operation, cohort} = cohortIn(state, frame.cohortId);
  const member = cohort.members.find(member => member.id === frame.id);
  if (cohort.phase !== "planning" || !frame.prepareOnly || frame.payment || !member
    || state.objects[frame.id]?.zone !== member.from || state.objects[frame.id]?.owner !== member.owner
    || !operation.frames.some(parent => parent.kind === "sba-cohort" && parent.cohortId === frame.cohortId))
    throw new Error("No matching internal SBA move preparation");
}

export function freezeSbaCohort(state, frame, snapshots) {
  const {operation, cohort} = cohortIn(state, frame.cohortId);
  if (operation.frames.at(-1) !== frame || frame.kind !== "sba-cohort" || frame.stage !== "freeze" || cohort.phase !== "planning")
    throw new Error("An SBA cohort cannot freeze while a sibling choice is pending");
  for (const member of cohort.members) {
    if (member.skipped) continue;
    const object = state.objects[member.id];
    if (!object || object.zone !== member.from) {member.skipped = true; continue;}
    const prepared = operation.sbaPreparedMoves?.[member.token];
    const snapshot = snapshots[member.id];
    if (!prepared || prepared.objectId !== member.id || prepared.cohortId !== frame.cohortId
      || !snapshot || snapshot.leftBehind?.cardId !== member.id || snapshot.card?.cardId !== member.id)
      throw new Error("Every surviving SBA member needs its completed native plan and frozen identity");
  }
  cohort.snapshots = structuredClone(snapshots); cohort.phase = "commit";
}

function readPreparedSbaMove(state, token, cohortId, id, completed = false) {
  const {operation, cohort} = cohortIn(state, cohortId), frame = operation.frames.at(-1);
  const prepared = operation.sbaPreparedMoves?.[token], member = cohort.members.find(member => member.id === id);
  if (cohort.phase !== "commit" || frame?.kind !== "sba-cohort" || frame.cohortId !== cohortId || frame.stage !== "commit"
    || !prepared || prepared.operation !== operation.serial || prepared.cohortId !== cohortId || prepared.objectId !== id
    || !member || member.token !== token || member.committed || member.skipped
    || (!completed && (state.objects[id]?.zone !== prepared.from || state.objects[id]?.owner !== prepared.owner))
    || !cohort.snapshots?.[id]
    || cohort.members.some(other => !other.committed && !other.skipped && !operation.sbaPreparedMoves?.[other.token]))
    throw new Error("No ready, matching internal SBA move result");
  return {...structuredClone(prepared), ...structuredClone(cohort.snapshots[id])};
}

export function preparedSbaMove(state, token, cohortId, id) {return readPreparedSbaMove(state, token, cohortId, id);}

export function consumeSbaMove(state, token, cohortId, id, moved) {
  const prepared = readPreparedSbaMove(state, token, cohortId, id, true);
  const {operation, cohort} = cohortIn(state, cohortId);
  if (moved === null || moved === undefined || moved === id || state.objects[id] || state.objects[moved]?.zone !== prepared.proposal.to
    || state.objects[moved]?.owner !== prepared.owner)
    throw new Error("Only a completed native zone move consumes an SBA result");
  const member = cohort.members.find(member => member.id === id);
  member.committed = true; member.moved = moved;
  delete operation.sbaPreparedMoves[token];
  cohort.departures.push({id, moved, from: prepared.from, destination: prepared.proposal.to,
    proposal: structuredClone(prepared.proposal), leftBehind: structuredClone(prepared.leftBehind)});
}

export function sbaCohort(state, key) {return cohortIn(state, key).cohort;}

export function reopenSbaPreparation(state, frame, id) {
  const {operation, cohort} = cohortIn(state, frame.cohortId), member = cohort.members.find(one => one.id === id);
  const prepared = operation.sbaPreparedMoves?.[member?.token];
  if (operation.frames.at(-1) !== frame || frame.kind !== "sba-cohort" || frame.stage !== "plan" || cohort.phase !== "planning"
    || !prepared || prepared.objectId !== id || prepared.cohortId !== frame.cohortId || state.objects[id]?.zone !== member.from)
    throw new Error("Only the native planning frame may recheck its completed SBA proposal");
  delete operation.sbaPreparedMoves[member.token]; delete member.token;
  return {kind: "move-one", id, to: "graveyard", prepareOnly: true, cohortId: frame.cohortId,
    stage: "replacements", proposal: prepared.proposal, options: prepared.options,
    preparedEntering: prepared.entering, preparedCounterResult: prepared.counterResult, entryPatch: prepared.entryPatch};
}

export function takeSbaDeparture(state, key, id) {
  const {operation, cohort} = cohortIn(state, key), frame = operation.frames.at(-1);
  const departure = cohort.departures.find(one => one.id === id);
  if (cohort.phase !== "commit" || frame?.kind !== "sba-cohort" || frame.cohortId !== key || frame.stage !== "departures"
    || cohort.members.some(member => !member.committed && !member.skipped) || !departure || departure.finished)
    throw new Error("SBA departures require every completed base move and their native callback stage");
  departure.finished = true;
  departure.returnLinks = (state.exiledUntil ?? []).filter(link => link.source === id).map(link => ({id: link.exiled, source: id}));
  return {...structuredClone(departure), departedIds: cohort.members.filter(member => member.committed).map(member => member.id)};
}

/* Linked returns use a separate capability space: only completed native source departures can authorize these
   exile-zone members. Their source cohort remains alive until the return child completes. */
export function startSbaLinkedReturns(state, frame) {
  const {operation, cohort} = cohortIn(state, frame.sourceCohortId);
  const parent = operation.frames.at(-2);
  if (operation.frames.at(-1) !== frame || frame.kind !== "sba-linked-returns" || parent?.kind !== "sba-cohort"
    || parent.cohortId !== frame.sourceCohortId || parent.stage !== "after-linked-returns"
    || cohort.departures.some(departure => !departure.finished)) throw new Error("Linked returns require their completed native source cohort");
  const key = `${operation.serial}:sba-return:${operation.sbaReturnSerial = (operation.sbaReturnSerial ?? 0) + 1}`;
  const seen = new Set();
  const members = cohort.departures.flatMap(departure => departure.returnLinks ?? []).filter(link => {
    const object = state.objects[link.id];
    if (seen.has(link.id) || object?.zone !== "exile" || object.token === true || state.players[object.owner]?.lost) return false;
    seen.add(link.id); return true;
  }).map(link => ({...link, from: "exile", owner: state.objects[link.id].owner}));
  (operation.sbaReturnBatches ??= {})[key] = {operation: operation.serial, sourceCohortId: frame.sourceCohortId, phase: "planning", members};
  return key;
}

export function sbaReturnBatch(state, key) {
  const operation = state.ruleOperation, batch = operation?.sbaReturnBatches?.[key];
  if (!batch || batch.operation !== operation.serial || !operation.sbaCohorts?.[batch.sourceCohortId]) throw new Error("No matching internal linked-return batch");
  return batch;
}

export function validateSbaReturnPreparation(state, frame) {
  const operation = state.ruleOperation, batch = sbaReturnBatch(state,frame.returnBatchId);
  const member = batch.members.find(member => member.id === frame.id);
  if (batch.phase !== "planning" || operation.frames.at(-1) !== frame || frame.kind !== "move-one" || !frame.prepareOnly || frame.payment
    || !member || member.skipped || state.objects[member.id]?.zone !== member.from || state.objects[member.id]?.owner !== member.owner
    || !operation.frames.some(parent => parent.kind === "sba-linked-returns" && parent.returnBatchId === frame.returnBatchId))
    throw new Error("No matching native linked-return preparation");
  return {batch, member};
}

export function savePreparedSbaReturn(state, frame, data) {
  const {batch,member} = validateSbaReturnPreparation(state,frame), operation = state.ruleOperation;
  if (member.prepared || data.proposal.objectId !== member.id || data.proposal.from !== member.from) throw new Error("No matching native linked-return result");
  const key = `${operation.serial}:sba-return-move:${operation.sbaReturnMoveSerial = (operation.sbaReturnMoveSerial ?? 0) + 1}`;
  (operation.sbaPreparedReturns ??= {})[key] = {...structuredClone(data), operation: operation.serial, returnBatchId: frame.returnBatchId,
    sourceCohortId: batch.sourceCohortId, objectId: member.id, from: member.from, owner: member.owner};
  member.prepared = key;
  return key;
}

export function preparedSbaReturn(state,key,returnBatchId,id) {
  const operation = state.ruleOperation, batch = sbaReturnBatch(state,returnBatchId), frame = operation.frames.at(-1);
  const member = batch.members.find(member => member.id === id), result = operation.sbaPreparedReturns?.[key];
  if (batch.phase !== "commit" || frame?.kind !== "sba-linked-returns" || frame.returnBatchId !== returnBatchId || frame.stage !== "commit"
    || !member || member.prepared !== key || member.committed || member.skipped || !result || result.operation !== operation.serial
    || result.returnBatchId !== returnBatchId || result.sourceCohortId !== batch.sourceCohortId || result.objectId !== id
    || state.objects[id]?.zone !== member.from || state.objects[id]?.owner !== member.owner
    || !batch.frozen?.[id] || batch.frozen[id].prepared !== key || batch.frozen[id].host !== result.host
    || batch.frozen[id].counterResult !== result.counterResult
    || batch.members.some(other => !other.skipped && !other.committed && (!other.counterReady || !operation.sbaPreparedReturns?.[other.prepared])))
    throw new Error("No ready matching native linked-return commit");
  return structuredClone(result);
}

export function freezeSbaReturnBatch(state,frame) {
  const operation=state.ruleOperation,batch=sbaReturnBatch(state,frame.returnBatchId);
  if(operation.frames.at(-1)!==frame||frame.kind!=="sba-linked-returns"||frame.stage!=="ready"||batch.phase!=="counters")
    throw new Error("Linked returns cannot commit before native preflight completes");
  const frozen={};
  for(const member of batch.members){
    if(member.skipped)continue;
    const result=operation.sbaPreparedReturns?.[member.prepared];
    if(!member.counterReady||!result||result.objectId!==member.id||result.returnBatchId!==frame.returnBatchId
      || state.objects[member.id]?.zone!==member.from||state.objects[member.id]?.owner!==member.owner
      || result.proposal.to==="battlefield"&&(!result.counterPlan||!operation.entryCounterResults?.[result.counterResult]
        || operation.entryCounterResults[result.counterResult].progress?.complete===false)
      || result.enchant&&(!Number.isInteger(result.host)||state.objects[result.host]?.zone!==result.hostZone))
      throw new Error("Every native return needs its completed choices, counter result and current attachment before commitment");
    frozen[member.id]={prepared:member.prepared,host:result.host,counterResult:result.counterResult};
  }
  batch.frozen=frozen;batch.phase="commit";
}

export function consumeSbaReturn(state,key,returnBatchId,id,moved) {
  const operation = state.ruleOperation, batch = sbaReturnBatch(state,returnBatchId), frame = operation.frames.at(-1);
  const member = batch.members.find(member => member.id === id), result = operation.sbaPreparedReturns?.[key];
  if (batch.phase !== "commit" || frame?.kind !== "sba-linked-returns" || frame.returnBatchId !== returnBatchId || frame.stage !== "commit"
    || !member || member.prepared !== key || member.committed || member.skipped || !result || result.objectId !== id
    || state.objects[id] || moved === null || moved === undefined || state.objects[moved]?.zone !== result.proposal.to || state.objects[moved]?.owner !== member.owner)
    throw new Error("Only the completed native linked return consumes its result");
  member.committed = true; member.moved = moved;
  delete operation.sbaPreparedReturns[key];
}

/* A concession can remove a borrowed replacement source while its controller remains. Only sources of already
   applied follow-ups are remembered here; candidates that have not applied are still queried against live state. */
export function refreshPendingSbaSources(state) {
  const operation = state.ruleOperation;
  if (!operation) return;
  const proposals = [...Object.values(operation.sbaPreparedMoves ?? {}).map(result => result.proposal),
    ...Object.values(operation.sbaPreparedReturns ?? {}).map(result => result.proposal),
    ...operation.frames.filter(frame => frame.prepareOnly && frame.kind === "move-one").map(frame => frame.proposal),
    ...Object.values(operation.sbaCohorts ?? {}).flatMap(cohort => cohort.departures.map(departure => departure.proposal)),
    ...Object.values(operation.sbaReturnBatches ?? {}).flatMap(batch => (batch.followUps ?? []).map(follow => ({followUps:[follow]}))),
    ...operation.frames.filter(frame => frame.kind === "outside-effects" && operation.sbaReturnBatches?.[frame.sbaReturnBatchId])
      .map(frame => ({followUps:[{context:frame.context}]}))];
  for (const proposal of proposals) for (const follow of proposal?.followUps ?? []) {
    const source = follow.context.source;
    if (state.objects[source]?.zone === "battlefield") follow.context.lastKnown = structuredClone(lastKnown(state, source));
  }
}

/* The native commit stage alone can mint a trigger-batch receipt. The canonical event payload and exact cohort are
   retained across JSON, so a copied/altered card field cannot authorize skipping ordinary trigger collection. */
export function markSbaTriggerBatch(state, frame, events) {
  const {operation, cohort} = cohortIn(state, frame.cohortId);
  if (operation.frames.at(-1) !== frame || frame.kind !== "sba-cohort" || frame.stage !== "commit" || cohort.phase !== "commit"
    || cohort.members.some(member => !member.committed && !member.skipped) || cohort.triggerBatch)
    throw new Error("Only the fully committed native SBA cohort can identify its trigger batch");
  const key = `${operation.serial}:${frame.cohortId}:triggers`;
  cohort.triggerBatch = key;
  markInternalSbaEvents(state,key,operation.serial,frame.cohortId,events);
}

export function markSbaReturnEvents(state,frame,events,phase) {
  const operation=state.ruleOperation,batch=sbaReturnBatch(state,frame.returnBatchId);
  if(operation.frames.at(-1)!==frame||frame.kind!=="sba-linked-returns"||frame.stage!=="commit"||batch.phase!=="commit"
    || !["preflight","arrival"].includes(phase)||batch.triggerBatches?.[phase]
    || phase==="preflight"&&batch.members.some(member=>member.committed||!member.skipped&&!member.counterReady)
    || phase==="arrival"&&batch.members.some(member=>!member.skipped&&!member.committed))
    throw new Error("Only the ready native return batch can identify its event phase");
  const key=`${operation.serial}:${frame.returnBatchId}:${phase}:triggers`;
  (batch.triggerBatches??={})[phase]=key;
  markInternalSbaEvents(state,key,operation.serial,batch.sourceCohortId,events);
}

function markInternalSbaEvents(state,key,serial,cohortId,events) {
  const fresh = events.filter(event => !matchingSbaTriggerReceipt(state, event));
  const receipt = {operation: serial, cohortId, events: fresh.map(event => {
    const {sbaTriggerReceipt: ignored, ...payload} = event;
    return JSON.stringify(payload);
  }), collected: []};
  (state.sbaTriggerReceipts ??= {})[key] = receipt;
  fresh.forEach((event, index) => {event.sbaTriggerReceipt = {key, index};});
}

function matchingSbaTriggerReceipt(state, event) {
  const stamp = event.sbaTriggerReceipt, receipt = state.sbaTriggerReceipts?.[stamp?.key];
  if (!receipt || !Number.isInteger(stamp.index) || receipt.operation < 1 || !receipt.cohortId.startsWith(`${receipt.operation}:sba:`)) return null;
  const {sbaTriggerReceipt: ignored, ...payload} = event;
  return receipt.events[stamp.index] === JSON.stringify(payload) ? {receipt, index: stamp.index} : null;
}

export function uncollectedSbaTriggerEvents(state, events) {
  return (events ?? []).filter(event => {
    const matched = matchingSbaTriggerReceipt(state, event);
    if (!matched) return true;
    if (matched.receipt.collected[matched.index]) return false;
    matched.receipt.collected[matched.index] = true;
    return true;
  });
}

export function clearFinishedSbaTriggerReceipts(state) {
  if (state.ruleOperation) return;
  for (const [key, receipt] of Object.entries(state.sbaTriggerReceipts ?? {}))
    if (state.ruleOperation?.serial !== receipt.operation && receipt.events.every((_, index) => receipt.collected[index])) delete state.sbaTriggerReceipts[key];
  if (!Object.keys(state.sbaTriggerReceipts ?? {}).length) delete state.sbaTriggerReceipts;
}
