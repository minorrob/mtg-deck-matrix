/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* A QUESTION ASKED AS A PERMANENT ENTERS: "AS THIS LAND ENTERS, YOU MAY PAY 2 LIFE. IF YOU DON'T, IT ENTERS TAPPED."
 *
 * CR 614.12 makes this part of the land's entering, its controller's choice. The engine cannot stop a zone change
 * half way -- a land fetched by a search is moved in the middle of that search's resolution -- so the land enters as
 * the replacement says it does if the payment is NOT made, tapped, and the question goes in a queue
 * (`state.enteringQuestions`). It is asked at the next point a player would receive priority, before any trigger goes
 * on the stack (after an action, after a resolution, at a step's priority); paying untaps the land. The state a player
 * then acts on is the one the rule describes: paid and untapped, or unpaid and tapped. "Pay" is offered only to a
 * player who can pay (CR 119.4).
 *
 * The replacement says it as `change: {entersTapped: true, unlessPay: {life: 2}}` (replacement.mjs).
 */

import {runEffect} from "../script/effects/index.mjs";

/* The permanent that just entered, and what its controller may pay, waits here until it can be asked. */
export function queueEnteringQuestion(state, objectId, ask) {
  if (!state.enteringQuestions) state.enteringQuestions = [];
  state.enteringQuestions.push({objectId, ...ask});
}

/** Ask the next queued question, if there is one and nothing else is being asked. @returns {boolean} asking */
export function askEntering(state) {
  if (state.awaiting) return Boolean(state.awaiting);
  const queue = state.enteringQuestions ?? [];
  while (queue.length) {
    const q = queue[0];
    const object = state.objects[q.objectId];
    /* Gone before it could be asked (a state-based action, say): nothing to decide. */
    if (!object || object.zone !== "battlefield") { queue.shift(); continue; }
    state.awaiting = {kind: "entering-choice", player: object.controller, objectId: q.objectId, life: q.life ?? 0};
    return true;
  }
  return false;
}

/** The choice (§12.1): pay, if the player can, or let it enter tapped. */
export function enteringChoice(state, awaiting) {
  const name = state.objects[awaiting.objectId]?.card ?? "It";
  const canPay = state.players[awaiting.player].life >= awaiting.life;
  return {
    id: `entering:${awaiting.objectId}`,
    title: `${name}: pay ${awaiting.life} life?`,
    mode: "one",
    min: 1,
    max: 1,
    options: [
      ...(canPay ? [{index: 0, label: `Pay ${awaiting.life} life: ${name} enters untapped`, cardId: awaiting.objectId, pay: true}] : []),
      {index: canPay ? 1 : 0, label: `Don't pay: ${name} enters tapped`, cardId: awaiting.objectId, pay: false},
    ],
  };
}

/** Apply the answer: paying untaps the permanent. Then the next question, if any. */
export function resolveEnteringChoice(state, awaiting, indices) {
  const option = enteringChoice(state, awaiting).options[indices?.[0]];
  if (!Array.isArray(indices) || indices.length !== 1 || !option) throw new Error("Invalid selection");
  const events = [];
  (state.enteringQuestions ?? []).shift();
  state.awaiting = null;
  if (option.pay) {
    /* Paying life is losing it (CR 119.4, 119.3). */
    events.push(...runEffect(state, {effect: "loseLife", amount: awaiting.life}, {controller: awaiting.player, source: awaiting.objectId}));
    state.objects[awaiting.objectId].tapped = false;
  }
  askEntering(state);
  return events;
}
