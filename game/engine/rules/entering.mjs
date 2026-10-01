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
import {cardsIn} from "../state/index.mjs";
import {matchesSelector} from "../script/filter.mjs";

/* The cards in the controller's hand a reveal could show ("an Island or Swamp card"). */
const revealable = (state, player, selector) => cardsIn(state, "hand", player).filter((id) => matchesSelector({...selector, what: "card", zone: "hand"}, state, id, {controller: player}));

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
    /* A reveal with nothing to reveal is no choice: it stays tapped, and nobody is asked. */
    if (q.reveal && revealable(state, object.controller, q.reveal).length === 0) { queue.shift(); continue; }
    state.awaiting = {kind: "entering-choice", player: object.controller, objectId: q.objectId, life: q.life ?? 0, ...(q.reveal ? {reveal: q.reveal} : {})};
    return true;
  }
  return false;
}

/** The choice (§12.1): pay, if the player can, or let it enter tapped. */
export function enteringChoice(state, awaiting) {
  const name = state.objects[awaiting.objectId]?.card ?? "It";
  /* A reveal: one option per card that could be shown, and not revealing (the player's own hand: nobody else is asked). */
  if (awaiting.reveal) {
    const cards = revealable(state, awaiting.player, awaiting.reveal);
    return {id: `entering:${awaiting.objectId}`, title: `${name}: reveal a card to have it enter untapped?`, mode: "one", min: 1, max: 1,
      options: [...cards.map((id, index) => ({index, label: `Reveal ${state.objects[id].card}: ${name} enters untapped`, cardId: id, reveal: id})),
        {index: cards.length, label: `Don't reveal: ${name} enters tapped`, cardId: awaiting.objectId, reveal: null}]};
  }
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
  if (option.reveal !== undefined && option.reveal !== null) {
    /* Revealed to everyone (CR 701.20a): the card is named in the history; it stays in the hand. */
    events.push({kind: "GameEventCardRevealed", data: {turn: state.turn, phase: state.phase, fields: {card: {cardId: option.reveal, name: state.objects[option.reveal].card, owner: awaiting.player}, player: {playerId: awaiting.player}}}});
    state.objects[awaiting.objectId].tapped = false;
  }
  if (option.pay) {
    /* Paying life is losing it (CR 119.4, 119.3). */
    events.push(...runEffect(state, {effect: "loseLife", amount: awaiting.life}, {controller: awaiting.player, source: awaiting.objectId}));
    state.objects[awaiting.objectId].tapped = false;
  }
  askEntering(state);
  return events;
}
