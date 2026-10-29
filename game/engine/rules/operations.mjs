/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* Rules outside a spell's effect queue can also ask questions (CR 616.1, 903.9b). Each operation is a stack of plain
   data frames. A handler saves its stage before pushing a child, so resuming never repeats a paid cost, a move, or a
   random draw. Handlers are module code; no function, generator, game snapshot, or replay tape is saved in state. */
const handlers = new Map();
const INDEX_MODES = new Set(["one", "many", "order", "boolean", "index", "draw", "ack"]);

export function registerRuleOperation(kind, handler) {
  if (handlers.has(kind)) throw new Error(`Rule operation already registered: ${kind}`);
  handlers.set(kind, handler);
}

export const ruleOperationPending = state => Boolean(state.ruleOperation);

export function emitRuleEvents(state, events) {
  if (!state.ruleOperation) throw new Error("No rule operation is running");
  state.ruleOperation.events.push(...events);
}

function unreported(operation) {
  const events = operation.events.slice(operation.reported);
  operation.reported = operation.events.length;
  return events;
}

export function askRuleOperation(state, frame, {player, choice}) {
  const operation = state.ruleOperation;
  if (!operation || operation.frames.at(-1) !== frame) throw new Error("Only the current rule frame may ask");
  if (!state.players[player] || state.players[player].lost) throw new Error("A rule frame must handle a departed player before asking");
  if (state.awaiting && (state.awaiting.kind !== "rule-operation" || state.awaiting.operation !== operation.serial))
    throw new Error("A rule frame cannot replace another mechanism's question");
  if (!INDEX_MODES.has(choice?.mode)) throw new Error("Rule operations currently support option-index choices only");
  if (typeof choice.id !== "string" || !choice.id || !Array.isArray(choice.options)
    || !Number.isInteger(choice.min) || !Number.isInteger(choice.max) || choice.min < 0 || choice.max < choice.min || choice.max > choice.options.length)
    throw new Error("A rule question needs an id, options and valid selection bounds");
  state.awaiting = {kind: "rule-operation", player, operation: operation.serial, choice: structuredClone(choice)};
  state.priorityPlayer = null;
  return {status: "waiting"};
}

/** Start a bounded rule operation. A caller still doing other work must put that work into later frames. */
export function beginRuleOperation(state, frames, {after = null} = {}, rng = null) {
  if (state.ruleOperation) throw new Error("A rule operation is already running; enqueue a child frame instead");
  if (state.awaiting) throw new Error("A rule operation cannot replace another mechanism's question");
  const serial = (state.ruleOperationSerial ?? 0) + 1;
  state.ruleOperationSerial = serial;
  state.ruleOperation = {serial, frames: structuredClone(Array.isArray(frames) ? [...frames].reverse() : [frames]), events: [], reported: 0, after};
  return continueRuleOperation(state, rng);
}

/** Run to the next question or completion. Child results are handed to the saved parent frame, never to a closure. */
export function continueRuleOperation(state, rng = null) {
  const operation = state.ruleOperation;
  if (!operation) throw new Error("No rule operation is running");
  if (state.awaiting?.kind === "rule-operation")
    return {status: "waiting", events: unreported(operation), after: operation.after};
  for (let steps = 0; steps < 100000; steps += 1) {
    const frame = operation.frames.at(-1);
    if (!frame) {
      const outcome = {status: "done", events: unreported(operation), all: operation.events, result: operation.result, after: operation.after};
      delete state.ruleOperation;
      return outcome;
    }
    const handler = handlers.get(frame.kind);
    if (!handler) throw new Error(`Unknown rule operation: ${frame.kind}`);
    const outcome = handler(state, frame, rng);
    if (outcome?.status === "waiting") {
      if (state.awaiting?.kind !== "rule-operation") throw new Error("A waiting rule frame must supply its question");
      return {status: "waiting", events: unreported(operation), after: operation.after};
    }
    if (outcome?.status === "done") {
      operation.frames.pop();
      const parent = operation.frames.at(-1);
      if (parent) parent.childResult = outcome.result ?? null;
      else operation.result = outcome.result ?? null;
      continue;
    }
    if (outcome?.status !== "continue") throw new Error(`Rule operation ${frame.kind} returned no continuation`);
    for (const child of [...(outcome.children ?? [])].reverse()) operation.frames.push(structuredClone(child));
  }
  throw new Error("Rule operation did not reach a question or completion");
}

/** The supported option-index choices are also validated for direct rule callers. Other modes are refused at ask time. */
export function answerRuleOperation(state, indices, amounts = null, rng = null, extra = {}) {
  const operation = state.ruleOperation, awaiting = state.awaiting;
  if (!operation || awaiting?.kind !== "rule-operation" || awaiting.operation !== operation.serial)
    throw new Error("No matching rule operation is waiting");
  const choice = awaiting.choice;
  if (INDEX_MODES.has(choice.mode)) {
    if (!Array.isArray(indices) || indices.length < (choice.min ?? 0) || indices.length > (choice.max ?? 0)
      || new Set(indices).size !== indices.length || indices.some(i => !Number.isInteger(i) || i < 0 || i >= (choice.options ?? []).length))
      throw new Error("Select the required rule options");
  }
  operation.frames.at(-1).answer = structuredClone({indices, amounts, extra});
  state.awaiting = null;
  return continueRuleOperation(state, rng);
}

/** A canceled resolution has no remaining rule instructions (CR 800.4a); events already reported stay reported. */
export function cancelRuleOperation(state) {
  if (state.awaiting?.kind === "rule-operation") state.awaiting = null;
  delete state.ruleOperation;
}
