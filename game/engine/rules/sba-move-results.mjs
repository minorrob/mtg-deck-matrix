/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
/* Native SBA move preparation is operation-local; a card/client flag never authorizes committing it. */
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
