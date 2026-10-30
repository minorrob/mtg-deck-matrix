/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
import assert from "node:assert/strict";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {createRng} from "../game/engine/rng.mjs";
import {registerRuleOperation, beginRuleOperation, continueRuleOperation, answerRuleOperation, askRuleOperation,
  emitRuleEvents, cancelRuleOperation, ruleOperationPending} from "../game/engine/rules/operations.mjs";

let checks = 0;
const eq = (a, b, message) => { assert.deepEqual(a, b, message); checks += 1; };
const fails = (run, message) => { assert.throws(run, message); checks += 1; };
const fresh = () => createState({matchId: "rule-frames", seed: "rule-frames", players: [{name: "Rob"}, {name: "Maya"}, {name: "Trey"}]});
const choice = {id: "rules-test", title: "Choose", mode: "one", min: 1, max: 1, options: [{index: 0, label: "First"}, {index: 1, label: "Second"}]};

/* These handlers are a small rule workflow: a permanent is created before its controller's choice; a nested operation
   asks another player; then both choices are used. The tests observe effects and event delivery across real checkpoints. */
registerRuleOperation("test-parent", (state, frame, rng) => {
  if (!frame.stage) {
    frame.objectId = addObject(state, {card: "Frame Relic", owner: 0, controller: 0, types: ["Artifact"]}, "battlefield");
    frame.roll = rng.int(20);
    state.players[0].life -= 2;
    emitRuleEvents(state, [{kind: "paid", objectId: frame.objectId, roll: frame.roll}]);
    frame.stage = "choose";
  }
  if (frame.stage === "choose") {
    if (!frame.answer) return askRuleOperation(state, frame, {player: 0, choice});
    frame.selected = frame.answer.indices[0]; delete frame.answer;
    frame.stage = "child";
    return {status: "continue", children: [{kind: "test-child", owner: 1}, {kind: "test-child", owner: 2}]};
  }
  state.objects[frame.objectId].counters = {charge: frame.selected + 1, child: frame.childResult.selected + 1};
  emitRuleEvents(state, [{kind: "completed", objectId: frame.objectId}]);
  return {status: "done", result: {selected: frame.selected, child: frame.childResult}};
});
registerRuleOperation("test-child", (state, frame, rng) => {
  if (!frame.stage) {
    frame.roll = rng.int(6);
    frame.stage = "choose";
    emitRuleEvents(state, [{kind: "child-started", player: frame.owner, roll: frame.roll}]);
  }
  /* A player or object can leave while an operation is waiting. The current stage sees the live state; no snapshot
     restores what left, and no automatic answer is invented for that player. */
  if (state.players[frame.owner].lost) return {status: "done", result: {departed: frame.owner}};
  if (!frame.answer) return askRuleOperation(state, frame, {player: frame.owner, choice: {...choice, id: `child:${frame.owner}`}});
  state.players[frame.owner].life += frame.answer.indices[0] + 1;
  return {status: "done", result: {player: frame.owner, selected: frame.answer.indices[0], roll: frame.roll}};
});
registerRuleOperation("test-finished", (state) => { emitRuleEvents(state, [{kind: "tail"}]); return {status: "done", result: "tail-result"}; });

{
  let state = fresh(), rng = createRng("rule-frames"), outcome;
  outcome = beginRuleOperation(state, [{kind: "test-parent"}, {kind: "test-finished"}], {after: {kind: "test-owner"}}, rng);
  eq(outcome.status, "waiting", "parent pauses for its player's answer");
  eq(outcome.events.map(e => e.kind), ["paid"], "prefix events are reported before the question");
  eq([state.players[0].life, state.nextObjectId, rng.draws], [38, 2, 1], "cost, object ID and random draw occur once before the first question");
  eq(ruleOperationPending(state), true, "pending operations are distinguishable from ordinary priority");
  eq(continueRuleOperation(state, rng).events, [], "polling an unanswered question reports no events twice");
  const before = JSON.stringify(state);
  for (const bad of [[], [2], [-1], [0, 0], [0, 1], [0.5], ["0"]]) fails(() => answerRuleOperation(state, bad, null, rng));
  eq(JSON.stringify(state), before, "invalid answers neither consume the question nor mutate its continuation");
  state.awaiting.operation += 1;
  const mismatched = JSON.stringify(state);
  fails(() => answerRuleOperation(state, [0], null, rng), /No matching/);
  eq(JSON.stringify(state), mismatched, "a stale operation serial cannot consume a current question");
  state = JSON.parse(before);
  fails(() => beginRuleOperation(state, {kind: "test-finished"}, {}, rng), /already running/);
  eq(JSON.stringify(state), before, "a second root operation cannot replace the first");

  state = JSON.parse(before); rng = createRng("rule-frames", rng.checkpoint());
  outcome = answerRuleOperation(state, [1], null, rng);
  eq([outcome.status, state.awaiting.player, rng.draws], ["waiting", 1, 2], "first nested child asks Maya after one new random draw");
  eq(outcome.events.map(e => e.kind), ["child-started"], "the original prefix is not reported again on resume");
  eq([state.players[0].life, state.nextObjectId], [38, 2], "resuming did not pay or allocate again");
  state = JSON.parse(JSON.stringify(state)); rng = createRng("rule-frames", rng.checkpoint());
  outcome = answerRuleOperation(state, [0], null, rng);
  eq([outcome.status, state.awaiting.player, rng.draws], ["waiting", 2, 3], "children run in source order, each from its own saved stage");
  eq(state.players[1].life, 41, "the first child's chosen effect happened exactly once");
  eq(outcome.events.map(e => e.kind), ["child-started"], "only the newly started child emits an event");

  const checkpoint = JSON.stringify(state), rngCheckpoint = rng.checkpoint();
  outcome = answerRuleOperation(state, [1], null, rng);
  eq(outcome.status, "done", "the last answer finishes its child, parent and following root frame");
  eq(outcome.events.map(e => e.kind), ["completed", "tail"], "saved parent continuation and root tail each execute once");
  eq(outcome.all.map(e => e.kind), ["paid", "child-started", "child-started", "completed", "tail"],
    "the complete operation batch remains available for grouped triggers while journal events stay incremental");
  eq(outcome.result, "tail-result", "last root result is returned to its caller");
  eq(outcome.after, {kind: "test-owner"}, "the owner's continuation tag survives every question");
  eq([state.players.map(p => p.life), state.objects[1].counters, rng.draws], [[38, 41, 42], {charge: 2, child: 2}, 3], "all earlier choices and randomness survive every reload");
  eq([state.awaiting, ruleOperationPending(state)], [null, false], "no pending choice or frame remains after completion");
  const replay = JSON.parse(checkpoint), replayRng = createRng("rule-frames", rngCheckpoint);
  eq(answerRuleOperation(replay, [1], null, replayRng), outcome, "the same saved answer returns identical events and result");
  eq(replay, state, "and produces the identical full game state");

  /* A concession-like state change while a child waits is retained, rather than overwritten by a start snapshot. */
  const departed = JSON.parse(checkpoint);
  departed.players[2].lost = true;
  eq(continueRuleOperation(departed, createRng("rule-frames", rngCheckpoint)).status, "waiting", "polling does not itself resume an unanswered frame after an external change");
  departed.players[2].lost = true; delete departed.objects[1]; departed.zones.battlefield = [];
  // Cancel this child only: a live handler below demonstrates that it can finish without asking the departed player.
  departed.ruleOperation.frames = [departed.ruleOperation.frames.at(-1)];
  departed.awaiting = null;
  const finished = continueRuleOperation(departed, createRng("rule-frames", rngCheckpoint));
  eq([finished.result, departed.players[2].lost, Object.keys(departed.objects)], [{departed: 2}, true, []], "a departed player and removed object are not resurrected");
}

{
  const state = fresh();
  eq(beginRuleOperation(state, []).status, "done", "an empty instruction list completes without asking");
  fails(() => continueRuleOperation(state), /No rule operation/);
  fails(() => answerRuleOperation(state, [0]), /No matching/);
  fails(() => emitRuleEvents(state, []), /No rule operation/);
  fails(() => askRuleOperation(state, {}, {player: 0, choice}), /Only the current/);
  fails(() => registerRuleOperation("test-child", () => ({})), /already registered/);
  fails(() => beginRuleOperation(state, {kind: "unknown-rule"}), /Unknown rule operation/);
  cancelRuleOperation(state);
  eq(ruleOperationPending(state), false, "cancellation removes an interrupted operation");
  beginRuleOperation(state, {kind: "test-child", owner: 1}, {}, createRng("cancel"));
  cancelRuleOperation(state);
  eq(state.awaiting, null, "cancelling also withdraws its own question");
  state.awaiting = {kind: "another-choice"};
  cancelRuleOperation(state);
  eq(state.awaiting.kind, "another-choice", "cancelling does not erase another mechanism's question");
}

registerRuleOperation("test-error", () => { throw new Error("Original rule error"); });
registerRuleOperation("test-bad-wait", () => ({status: "waiting"}));
registerRuleOperation("test-bad-result", () => null);
registerRuleOperation("test-wrong-frame", state => askRuleOperation(state, {}, {player: 0, choice}));
registerRuleOperation("test-departed-question", (state, frame) => askRuleOperation(state, frame, {player: 1, choice}));
registerRuleOperation("test-question-shape", (state, frame) => askRuleOperation(state, frame, {player: 0, choice: frame.choice}));
registerRuleOperation("test-foreign-question", (state, frame) => {
  state.awaiting = {kind: "effect-choice", player: 1};
  return askRuleOperation(state, frame, {player: 0, choice});
});
fails(() => beginRuleOperation(fresh(), {kind: "test-error"}), /Original rule error/);
fails(() => beginRuleOperation(fresh(), {kind: "test-bad-wait"}), /must supply its question/);
fails(() => beginRuleOperation(fresh(), {kind: "test-bad-result"}), /returned no continuation/);
fails(() => beginRuleOperation(fresh(), {kind: "test-wrong-frame"}), /Only the current/);
const left = fresh(); left.players[1].lost = true;
fails(() => beginRuleOperation(left, {kind: "test-departed-question"}), /departed player/);

for (const mode of ["integer", "text", "damage", "unrecognized"])
  fails(() => beginRuleOperation(fresh(), {kind: "test-question-shape", choice: {...choice, mode}}), /option-index/);
fails(() => beginRuleOperation(fresh(), {kind: "test-question-shape", choice: {...choice, mode:"amount"}}), /feasible total/);
for (const malformed of [{id: ""}, {options: null}, {min: -1}, {min: 1.5}, {max: 0}, {max: 3}, {max: 1.5}])
  fails(() => beginRuleOperation(fresh(), {kind: "test-question-shape", choice: {...choice, ...malformed}}), /valid selection bounds/);
{
  const state = fresh(); state.awaiting = {kind: "effect-choice", player: 1};
  const before = JSON.stringify(state);
  fails(() => beginRuleOperation(state, {kind: "test-finished"}), /another mechanism/);
  eq(JSON.stringify(state), before, "starting an operation cannot overwrite a foreign question or mutate the game");
  fails(() => beginRuleOperation(fresh(), {kind: "test-foreign-question"}), /another mechanism/);
}
{
  const state = fresh();
  beginRuleOperation(state, {kind: "test-question-shape", choice: {...choice, mode: "many", min: 0, max: 2}});
  const before = JSON.stringify(state);
  for (const invalid of [[0, 0], [0, 1, 0], [-1], [2], [0.5], ["0"]]) {
    fails(() => answerRuleOperation(state, invalid), /required rule options/);
    eq(JSON.stringify(state), before, "each independently invalid selection preserves its pending question");
  }
}

console.log(`engine-rule-operations: ${checks} checks passed`);
