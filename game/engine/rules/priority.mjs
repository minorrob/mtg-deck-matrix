/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* PRIORITY: CR 117.
 *
 * `docs/engine/PLAN.md` §3.3, third row. This is the rule that makes a game progress. The phase 1
 * gate — a four-player game runs to completion for 1,000 seeds — is mostly a claim about this file:
 * if a round of passes can fail to complete, the engine does not lose the game, it stops, and a
 * board with nothing to report is the worst failure available.
 *
 * THREE THINGS IMPLEMENTATIONS GET WRONG, each held by a check in `engine-priority`:
 *
 * 1. "ALL PLAYERS PASS IN SUCCESSION" (CR 117.4) means CONSECUTIVE. Any action by anybody starts
 *    the count again. Counting total passes instead resolves spells somebody was still answering.
 *
 * 2. AFTER AN OBJECT RESOLVES, THE ACTIVE PLAYER RECEIVES PRIORITY (CR 117.3b). Not the next seat
 *    in the round, not whoever passed last. Handing it to the wrong seat quietly changes which
 *    responses are possible, which is the kind of wrongness nobody reports and everybody feels.
 *
 * 3. A PLAYER WHO HAS LOST IS NOT IN THE ROUND AT ALL. Waiting for them is a hang.
 *
 * This module returns an OUTCOME rather than driving the turn. "step-ends" is handed back to the
 * controller loop, which calls `advance`. Keeping the call in the loop rather than here is what
 * stops turn.mjs and priority.mjs from importing each other.
 */

import {peekStack, resolveTop} from "./stack.mjs";
import {resolutionPending} from "../script/resolution.mjs";
import {checkStateBasedActions} from "./sba.mjs";
import {collectTriggers, openTriggers} from "./trigger.mjs";
import {askEntering} from "./entering.mjs";

/**
 * The seats that will act this round, in APNAP order: the active player, then each other player in
 * turn order, skipping anyone who has lost.
 */
export function priorityOrder(state) {
  const count = state.players.length;
  const order = [];
  for (let step = 0; step < count; step += 1) {
    const at = (state.activePlayer + step) % count;
    if (!state.players[at].lost) order.push(at);
  }
  return order;
}

/** Give a seat priority and start a fresh round of passes. */
export function grantPriority(state, player) {
  if (!Number.isInteger(player) || !state.players[player])
    throw new Error("Priority belongs to a seat at the table");
  if (state.players[player].lost)
    throw new Error("A player who is out cannot be given priority");
  state.priorityPlayer = player;
  state.passes = 0;
}

/**
 * Record that the player holding priority did something.
 *
 * CR 117.3c: a player who takes an action receives priority again, and CR 117.4's count starts
 * over, because the passes are no longer in succession.
 */
export function takeAction(state, player = state.priorityPlayer) {
  if (state.priorityPlayer === null) throw new Error("Nobody holds priority in this step");
  state.passes = 0;
  state.priorityPlayer = player;
}

/**
 * The player holding priority passes.
 *
 * @returns {{outcome: "passed"|"resolved"|"resolving"|"step-ends", events: Array}}
 *   `passed`     priority moved on; the round continues.
 *   `resolved`   everyone passed on a loaded stack, so the top object resolved (CR 608.1) and the
 *                active player now holds priority.
 *   `resolving`  the top object began to resolve and stopped to ask somebody (`state.awaiting`); it
 *                stays on the stack and nobody holds priority until the answer finishes it.
 *   `step-ends`  everyone passed on an empty stack; the caller advances the step (CR 117.4).
 */
export function passPriority(state, effect = null) {
  if (state.priorityPlayer === null)
    throw new Error("Nobody holds priority in this step, so nobody can pass it");

  const order = priorityOrder(state);
  state.passes += 1;

  if (state.passes < order.length) {
    const at = order.indexOf(state.priorityPlayer);
    /* If the seat holding priority has just left the round — lost between one pass and the next —
       `indexOf` is -1 and this starts the remaining round from the top, which is the active
       player. That is the right answer rather than an exception: the game is still going. */
    state.priorityPlayer = order[(at + 1) % order.length];
    return {outcome: "passed", events: []};
  }

  state.passes = 0;

  if (peekStack(state) === null) {
    /* CR 117.4. The step or phase ends. Priority is released here so that a caller which forgets
       to advance cannot keep passing in a step that is over. */
    state.priorityPlayer = null;
    return {outcome: "step-ends", events: []};
  }

  const events = resolveTop(state, effect);
  if (resolutionPending(state)) {state.priorityPlayer = null; return {outcome: "resolving", events};}
  return {outcome: "resolved", events: afterResolving(state, events)};
}

/**
 * Priority after an object has resolved: CR 117.5 first -- state-based actions, then the triggers that waited go on
 * the stack -- and then CR 117.3b. A creature a spell dealt lethal damage to is gone before anyone may act, and a
 * permanent's "when this enters" goes on the stack above nothing the players could slip in first. Either may ask a
 * question (a commander's owner, the order of a player's triggers), and then priority waits for it.
 *
 * @returns {Array} the events, with whatever the checks added
 */
export function afterResolving(state, events = []) {
  /* What the resolution did triggers now (CR 603.2); then what entered asking (a shock land fetched by a search) is
     answered, before state-based actions and before any trigger goes on the stack. */
  collectTriggers(state, events);
  if (askEntering(state)) { state.priorityPlayer = null; return events; }
  const sba = checkStateBasedActions(state);
  events.push(...sba);
  collectTriggers(state, sba);
  if (!state.awaiting) openTriggers(state);
  if (state.awaiting) {state.priorityPlayer = null; return events;}
  /* CR 117.3b. The ACTIVE player, whoever happened to pass last -- or, when the active player has left the
     game (conceded, CR 104.3a), the next player in turn order still in it (CR 800.4), since what is left on
     the stack still has to resolve. */
  const order2 = priorityOrder(state);
  if (order2.length === 0) {state.priorityPlayer = null; return events;}
  grantPriority(state, state.players[state.activePlayer].lost ? order2[0] : state.activePlayer);
  return events;
}
