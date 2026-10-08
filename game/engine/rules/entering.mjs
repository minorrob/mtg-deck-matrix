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
 *
 * "YOU MAY HAVE THIS CREATURE ENTER AS A COPY OF ANY CREATURE ON THE BATTLEFIELD" (`copyOf`) is asked the same way, and
 * its arrival waits for the answer (effects/zones.mjs marks it, rules/trigger.mjs passes it by): copied, it is the copy
 * when its arrival triggers -- the copied card's "when this enters" among what does -- with the copied card's own "as
 * this enters" applied too (replacement.mjs, ownEntering). Not copied, it arrives as itself.
 */

import {runEffect} from "../script/effects/index.mjs";
import {cardsIn, eventCard} from "../state/index.mjs";
import {matchesSelector} from "../script/filter.mjs";
import {creatureTypesInGame} from "../script/effects/asking.mjs";
import {copyOnto} from "../script/effects/permanents.mjs";
import {ownEntering} from "./replacement.mjs";
import {collectTriggers} from "./trigger.mjs";
import {countersPlaced} from "./statics.mjs";

/* The cards in the controller's hand a reveal could show ("an Island or Swamp card"). */
const revealable = (state, player, selector) => cardsIn(state, "hand", player).filter((id) => matchesSelector({...selector, what: "card", zone: "hand"}, state, id, {controller: player}));

/**
 * "You may have this creature enter as a copy of ...": what it is is asked next, and its arrival triggers once that is
 * answered -- the copied card's "when this enters" with it (CR 614.12a). Where a permanent arrives (effects/zones.mjs,
 * rules/stack.mjs) its arrival is marked; rules/trigger.mjs passes a marked one by.
 */
export function holdArrival(state, objectId, arrival) {
  const waiting = (state.enteringQuestions ?? []).filter((q) => q.objectId === objectId && q.copyOf);
  if (!waiting.length || !arrival) return;
  arrival.data.fields.awaitingCopy = true;
  for (const q of waiting) q.arrival = arrival;
}

/**
 * COUNTERS A PERMANENT ENTERED WITH WERE PUT ON IT (CR 122.6): "whenever a +1/+1 counter is put on this creature" (Fathom
 * Mage) sees them -- said once it is on the battlefield, after its arrival, for each kind its entering gave it (`entering`,
 * rules/replacement.mjs enteringModifications; rules/stack.mjs, effects/zones.mjs), from none: it is a new object (CR 400.7).
 *
 * @returns {Array} the counters events
 */
export function enteredWith(state, id, entering) {
  const object = state.objects[id];
  if (object?.zone !== "battlefield") return [];
  return Object.keys(entering?.counters ?? {}).map((counter) => ({kind: "GameEventCardCounters",
    data: {turn: state.turn, phase: state.phase, fields: {card: eventCard(state, id), type: counter, oldValue: 0, newValue: object.counters[counter] ?? 0}}}));
}

/* What it may enter as a copy of: each other permanent the selector matches, "you" its controller. */
const copyChoices = (state, q, object) => state.zones.battlefield.filter((id) => id !== q.objectId
  && matchesSelector({...q.copyOf, what: "permanent"}, state, id, {controller: object.controller, source: q.objectId}));
/* Its arrival, waiting for that answer, triggers now. */
function arrived(state, q) {
  if (!q?.arrival) return;
  delete q.arrival.data.fields.awaitingCopy;
  collectTriggers(state, [q.arrival]);
}

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
    /* "Choose a creature type": of the creature types among the game's cards (effects/asking.mjs); "choose artifact,
       creature, ...": the options named. None to choose among, and nothing is asked. */
    const choices = q.choose === "creature type" ? creatureTypesInGame(state) : Array.isArray(q.choose) ? q.choose : null;
    if (q.choose !== undefined && !(choices ?? []).length) { queue.shift(); continue; }
    /* "Enter as a copy of any creature on the battlefield": nothing to copy, and it arrives as itself. */
    const copies = q.copyOf ? copyChoices(state, q, object) : null;
    if (copies && !copies.length) { arrived(state, q); queue.shift(); continue; }
    state.awaiting = {kind: "entering-choice", player: object.controller, objectId: q.objectId, life: q.life ?? 0, ...(q.reveal ? {reveal: q.reveal} : {}), ...(choices ? {choose: choices} : {}),
      ...(copies ? {copyOf: copies, copy: q.copy ?? {}} : {})};
    return true;
  }
  return false;
}

/** The choice (§12.1): pay, if the player can, or let it enter tapped. */
export function enteringChoice(state, awaiting) {
  const name = state.objects[awaiting.objectId]?.card ?? "It";
  /* "You may have it enter as a copy": each permanent it may copy, or none. */
  if (awaiting.copyOf) return {id: `entering-copy:${awaiting.objectId}`, title: `${name}: enter as a copy?`, mode: "one", min: 1, max: 1,
    options: [...awaiting.copyOf.map((id, index) => ({index, label: state.objects[id]?.card ?? "?", cardId: id, copyOf: id})),
      {index: awaiting.copyOf.length, label: "No copy", cardId: awaiting.objectId, copyOf: null}]};
  if (awaiting.choose) return {id: `entering-choose:${awaiting.objectId}`, title: `${name}: choose`, mode: "one", min: 1, max: 1,
    options: awaiting.choose.map((label, index) => ({index, label, cardId: awaiting.objectId, chosen: label}))};
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
  const asked = (state.enteringQuestions ?? []).shift();
  state.awaiting = null;
  if (option.copyOf !== undefined) {
    const object = state.objects[awaiting.objectId];
    if (option.copyOf !== null && copyOnto(state, awaiting.objectId, option.copyOf, awaiting.copy ?? {})) {
      /* "Enter tapped as a copy" (Vesuva); and what the copied card says of its own entering. */
      const own = ownEntering(state, {objectId: awaiting.objectId, player: object.controller, types: object.types, abilities: object.abilities});
      if (awaiting.copy?.tapped || own.tapped) object.tapped = true;
      /* Put on it as it enters (CR 122.6), by its controller (122.6a): "twice that many instead" sees them. */
      for (const [counter, count] of Object.entries(own.counters)) object.counters[counter] = (object.counters[counter] ?? 0) + countersPlaced(state, awaiting.objectId, counter, count, object.controller);
      for (const ask of own.asks) queueEnteringQuestion(state, awaiting.objectId, ask);
      if (object.tapped && asked?.arrival) asked.arrival.data.fields.enteredTapped = true;
    }
    arrived(state, asked);
  }
  if (option.reveal !== undefined && option.reveal !== null) {
    /* Revealed to everyone (CR 701.20a): the card is named in the history; it stays in the hand. */
    events.push({kind: "GameEventCardRevealed", data: {turn: state.turn, phase: state.phase, fields: {card: {cardId: option.reveal, name: state.objects[option.reveal].card, owner: awaiting.player}, player: {playerId: awaiting.player}}}});
    state.objects[awaiting.objectId].tapped = false;
  }
  /* What was chosen as it entered, kept on the permanent for its abilities to read ("$chosen", script/chosen.mjs). */
  if (option.chosen !== undefined && state.objects[awaiting.objectId]) state.objects[awaiting.objectId].chosen = option.chosen;
  if (option.pay) {
    /* Paying life is losing it (CR 119.4, 119.3). */
    events.push(...runEffect(state, {effect: "loseLife", amount: awaiting.life}, {controller: awaiting.player, source: awaiting.objectId}));
    state.objects[awaiting.objectId].tapped = false;
  }
  askEntering(state);
  return events;
}
