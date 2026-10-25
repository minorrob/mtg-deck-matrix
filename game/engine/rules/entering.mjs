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
import {cardsIn, eventCard, moveObject} from "../state/index.mjs";
import {matchesSelector} from "../script/filter.mjs";
import {creatureTypesInGame, discardOne} from "../script/effects/asking.mjs";
import {sacrificeOne} from "../script/effects/zones.mjs";
import {copyOnto} from "../script/effects/permanents.mjs";
import {ownEntering, graveyardBound, placeReplacedCounters} from "./replacement.mjs";
import {collectTriggers} from "./trigger.mjs";
import {enteringCountersPlaced, cantBeSacrificed} from "./statics.mjs";
import {amountOf} from "../script/amount.mjs";
import {withChosen} from "../script/chosen.mjs";

/* A chapter's number as a Saga prints it (CR 714.2a). */
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII"];

/* The cards in the controller's hand a reveal could show ("an Island or Swamp card"). */
const revealable = (state, player, selector) => cardsIn(state, "hand", player).filter((id) => matchesSelector({...selector, what: "card", zone: "hand"}, state, id, {controller: player}));

/**
 * "You may have this creature enter as a copy of ...": what it is is asked next, and its arrival triggers once that is
 * answered -- the copied card's "when this enters" with it (CR 614.12a). Where a permanent arrives (effects/zones.mjs,
 * rules/stack.mjs) its arrival is marked; rules/trigger.mjs passes a marked one by.
 */
export function holdArrival(state, objectId, arrival) {
  /* And a Saga with read ahead (CR 702.155a): its chapter I, an arrival trigger (cards/index.mjs), waits for the number chosen. */
  const waiting = (state.enteringQuestions ?? []).filter((q) => q.objectId === objectId && ((q.copyOf || q.discardInstead) || q.readAhead));
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
  /* Put on it by its controller (CR 122.6a): "whenever you put one or more counters" sees them as theirs. */
  return Object.keys(entering?.counters ?? {}).map((counter) => ({kind: "GameEventCardCounters",
    data: {turn: state.turn, phase: state.phase, fields: {card: eventCard(state, id), type: counter, oldValue: 0, newValue: object.counters[counter] ?? 0, by: object.controller}}}));
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

/* The land cards (what `discardInstead` describes) in its controller's hand that Mox Diamond's replacement may discard. */
const discardableInstead = (state, player, selector) => cardsIn(state, "hand", player)
  .filter((id) => matchesSelector({...(selector ?? {}), what: "card", zone: "hand"}, state, id, {controller: player}));
/* NOT DISCARDED, IT NEVER ENTERED (Mox Diamond; CR 614.1c): into its owner's graveyard from where it was coming -- its held
   arrival rewritten to say so, then seen (a replacement on that route too: Dauthi Voidwalker). It was never on the
   battlefield, so nothing that watches the battlefield sees it come or go. */
function putAside(state, q) {
  const object = state.objects[q.objectId];
  const bound = graveyardBound(state, q.objectId);
  const went = moveObject(state, q.objectId, bound.to, ["graveyard", "library", "hand"].includes(bound.to) ? object.owner : null);
  placeReplacedCounters(state, went, bound);
  if (!q.arrival) return;
  const fields = q.arrival.data.fields;
  delete fields.enteredAs; delete fields.enteredTapped; delete fields.awaitingCopy;
  fields.becomes = went;
  fields.to = {zoneType: bound.to[0].toUpperCase() + bound.to.slice(1), player: {playerId: object.owner}};
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
    /* "You may discard a land card instead": none in the hand, no choice -- it goes to the graveyard. */
    const lands = q.discardInstead ? discardableInstead(state, object.controller, q.discardInstead) : null;
    if (lands && !lands.length) { queue.shift(); putAside(state, q); continue; }
    if (lands) { state.awaiting = {kind: "entering-choice", player: object.controller, objectId: q.objectId, discardInstead: lands}; return true; }
    /* DEVOUR (CR 702.82a, c): the permanents of its controller's that the quality describes, never itself -- none, and nothing
       is asked (it enters with no counters). */
    const fodder = q.devour ? devourable(state, object.controller, q) : null;
    if (fodder && !fodder.length) { queue.shift(); continue; }
    if (fodder) { state.awaiting = {kind: "entering-choice", player: object.controller, objectId: q.objectId, devour: {amount: q.devour.amount, ids: fodder}}; return true; }
    /* "Enter as a copy of any creature on the battlefield": nothing to copy, and it arrives as itself. */
    const copies = q.copyOf ? copyChoices(state, q, object) : null;
    if (copies && !copies.length) { arrived(state, q); queue.shift(); continue; }
    /* Read ahead (CR 702.155a): a chapter from one to its last, always a choice to make. */
    if (q.readAhead) { state.awaiting = {kind: "entering-choice", player: object.controller, objectId: q.objectId, readAhead: q.readAhead}; return true; }
    state.awaiting = {kind: "entering-choice", player: object.controller, objectId: q.objectId, life: q.life ?? 0, ...(q.reveal ? {reveal: q.reveal} : {}), ...(choices ? {choose: choices} : {}),
      ...(q.riot === true ? {riot: true} : {}),
      ...(copies ? {copyOf: copies, copy: q.copy ?? {}} : {})};
    return true;
  }
  return false;
}

/* What a devouring permanent may sacrifice (CR 702.82a, c): its controller's permanents of the quality, other than itself, that
   can be sacrificed. */
const devourable = (state, player, q) => state.zones.battlefield.filter((id) => id !== q.objectId
  && matchesSelector({...q.devour.of, what: "permanent", controller: "you"}, state, id, {controller: player, source: q.objectId}) && !cantBeSacrificed(state, id));

/** The choice (§12.1): pay, if the player can, or let it enter tapped. */
export function enteringChoice(state, awaiting) {
  const name = state.objects[awaiting.objectId]?.card ?? "It";
  /* Devour (CR 702.82a): any number of them, none included -- its controller's to choose. */
  if (awaiting.devour) return {id: `entering-devour:${awaiting.objectId}`, title: `${name}: devour -- sacrifice any number (each gives ${awaiting.devour.amount} +1/+1 counters)`,
    mode: "many", min: 0, max: awaiting.devour.ids.length,
    options: awaiting.devour.ids.map((id, index) => ({index, label: state.objects[id]?.card ?? "?", cardId: id}))};
  /* "You may have it enter as a copy": each permanent it may copy, or none. */
  if (awaiting.copyOf) return {id: `entering-copy:${awaiting.objectId}`, title: `${name}: enter as a copy?`, mode: "one", min: 1, max: 1,
    options: [...awaiting.copyOf.map((id, index) => ({index, label: state.objects[id]?.card ?? "?", cardId: id, copyOf: id})),
      {index: awaiting.copyOf.length, label: "No copy", cardId: awaiting.objectId, copyOf: null}]};
  /* Mox Diamond: each land card it may discard, or none -- and then it goes to the graveyard. */
  if (awaiting.discardInstead) return {id: `entering-discard:${awaiting.objectId}`, title: `${name}: discard a land card?`, mode: "one", min: 1, max: 1,
    options: [...awaiting.discardInstead.map((id, index) => ({index, label: `Discard ${state.objects[id]?.card ?? "?"}: ${name} enters`, cardId: id, discard: id})),
      {index: awaiting.discardInstead.length, label: `Don't discard: ${name} goes to the graveyard`, cardId: awaiting.objectId, discard: null}]};
  /* Read ahead (CR 702.155a): which chapter it starts at -- that many lore counters. */
  if (awaiting.readAhead) return {id: `entering-read-ahead:${awaiting.objectId}`, title: `${name}: read ahead -- choose a chapter to start with`, mode: "one", min: 1, max: 1,
    options: Array.from({length: awaiting.readAhead}, (_, index) => ({index, label: `Chapter ${ROMAN[index] ?? index + 1}`, cardId: awaiting.objectId, readAhead: index + 1}))};
  /* Riot (CR 702.136a): a +1/+1 counter, or haste -- one or the other, the controller's to choose. */
  if (awaiting.riot) return {id: `entering-riot:${awaiting.objectId}`, title: `${name}: riot`, mode: "one", min: 1, max: 1,
    options: [{index: 0, label: `${name} enters with a +1/+1 counter`, cardId: awaiting.objectId, riot: "counter"},
      {index: 1, label: `${name} gains haste`, cardId: awaiting.objectId, riot: "haste"}]};
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
  /* DEVOUR (CR 702.82a, c): the chosen permanents sacrificed (CR 701.21a), and N +1/+1 counters for each one sacrificed -- put
     on as it entered (CR 614.12, 122.6), by its controller (122.6a), and said, as riot's counter is below. */
  if (awaiting.devour) {
    const picked = [...new Set(indices ?? [])];
    if (!Array.isArray(indices) || picked.length !== indices.length || picked.some((i) => !awaiting.devour.ids[i])) throw new Error("Invalid selection");
    const events = [];
    (state.enteringQuestions ?? []).shift();
    state.awaiting = null;
    let eaten = 0;
    for (const i of picked) {
      const id = awaiting.devour.ids[i];
      if (state.objects[id]?.zone === "battlefield" && sacrificeOne(state, id, events) !== null) eaten += 1;
    }
    const devourer = state.objects[awaiting.objectId];
    if (devourer && eaten > 0) {
      const was = devourer.counters["+1/+1"] ?? 0;
      devourer.counters["+1/+1"] = was + enteringCountersPlaced(state, awaiting.objectId, "+1/+1", awaiting.devour.amount * eaten, devourer.controller);
      events.push({kind: "GameEventCardCounters", data: {turn: state.turn, phase: state.phase,
        fields: {card: eventCard(state, awaiting.objectId), type: "+1/+1", oldValue: was, newValue: devourer.counters["+1/+1"], by: devourer.controller}}});
    }
    askEntering(state);
    return events;
  }
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
      /* "Except it enters with an additional +1/+1 counter on it if it's a creature, it enters with an additional loyalty
         counter on it if it's a planeswalker" (Spark Double; CR 707.9a, 614.1c): `except.entersWithCounters`, each `if` a
         description of what it entered as -- the copy, read now -- and the counters it adds to what the copied card's own
         entering gives it. Never on one that entered as itself: the exception is part of the copy. */
      const counters = {...own.counters};
      for (const extra of awaiting.copy?.except?.entersWithCounters ?? [])
        if (matchesSelector({...(extra.if ?? {}), what: "permanent"}, state, awaiting.objectId, {controller: object.controller, source: awaiting.objectId}))
          counters[extra.counter] = (counters[extra.counter] ?? 0) + extra.count;
      /* Put on it as it enters (CR 122.6), by its controller (122.6a): "twice that many instead" sees them, but not its own
         replacement (614.12; enteringCountersPlaced) -- and said, as an entering counter is (enteredWith), with who put them:
         "whenever a +1/+1 counter is put on" sees them too, and "whenever you put" (Exemplar of Light). */
      for (const [counter, count] of Object.entries(counters)) {
        const was = object.counters[counter] ?? 0;
        object.counters[counter] = was + enteringCountersPlaced(state, awaiting.objectId, counter, count, object.controller);
        if (object.counters[counter] > was) events.push({kind: "GameEventCardCounters", data: {turn: state.turn, phase: state.phase,
          fields: {card: eventCard(state, awaiting.objectId), type: counter, oldValue: was, newValue: object.counters[counter], by: object.controller}}});
      }
      for (const ask of own.asks) queueEnteringQuestion(state, awaiting.objectId, ask);
      if (object.tapped && asked?.arrival) asked.arrival.data.fields.enteredTapped = true;
    }
    arrived(state, asked);
  }
  /* Discarded (CR 701.9a), it enters, and its arrival is seen; not, and it goes to the graveyard instead. */
  if (option.discard !== undefined) {
    if (option.discard !== null && state.objects[option.discard]?.zone === "hand") { discardOne(state, option.discard, awaiting.player, events); arrived(state, asked); }
    else putAside(state, asked);
  }
  if (option.reveal !== undefined && option.reveal !== null) {
    /* Revealed to everyone (CR 701.20a): the card is named in the history; it stays in the hand. */
    events.push({kind: "GameEventCardRevealed", data: {turn: state.turn, phase: state.phase, fields: {card: {cardId: option.reveal, name: state.objects[option.reveal].card, owner: awaiting.player}, player: {playerId: awaiting.player}}}});
    state.objects[awaiting.objectId].tapped = false;
  }
  /* READ AHEAD (CR 702.155a): the lore counters it enters with, put on as it entered (CR 122.6) by its controller (122.6a) and
     said, as riot's counter is below -- a chapter they bring it to triggers (CR 714.2b), and none below the number chosen
     (`readAhead`, kept on the permanent; rules/trigger.mjs). Then its arrival is seen: chapter I, when one was chosen. */
  const saga = state.objects[awaiting.objectId];
  if (option.readAhead !== undefined && saga) {
    saga.readAhead = option.readAhead;
    const was = saga.counters.lore ?? 0;
    saga.counters.lore = was + enteringCountersPlaced(state, awaiting.objectId, "lore", option.readAhead, saga.controller);
    events.push({kind: "GameEventCardCounters", data: {turn: state.turn, phase: state.phase, fields: {card: eventCard(state, awaiting.objectId), type: "lore", oldValue: was, newValue: saga.counters.lore, by: saga.controller}}});
    arrived(state, asked);
  }
  /* Riot (CR 702.136a): the counter, put on it as it entered (CR 122.6) by its controller (122.6a) -- "twice that many instead"
     sees it -- and said, as an entering counter is (enteredWith); or haste, for as long as it is this permanent (CR 400.7),
     in layer 6 (CR 613.1f). */
  const riot = state.objects[awaiting.objectId];
  if (option.riot === "counter" && riot) {
    const was = riot.counters["+1/+1"] ?? 0;
    riot.counters["+1/+1"] = was + enteringCountersPlaced(state, awaiting.objectId, "+1/+1", 1, riot.controller);
    events.push({kind: "GameEventCardCounters", data: {turn: state.turn, phase: state.phase, fields: {card: eventCard(state, awaiting.objectId), type: "+1/+1", oldValue: was, newValue: riot.counters["+1/+1"], by: riot.controller}}});
  }
  if (option.riot === "haste" && riot) {
    const timestamp = state.nextTimestamp;
    state.nextTimestamp += 1;
    (state.effects ??= []).push({id: `riot-haste:${awaiting.objectId}:${timestamp}`, layer: 6, affects: {ids: [awaiting.objectId]}, apply: {addKeywords: ["Haste"]}, until: null,
      sourceController: riot.controller, timestamp});
  }
  /* What was chosen as it entered, kept on the permanent for its abilities to read ("$chosen", script/chosen.mjs). */
  if (option.chosen !== undefined && state.objects[awaiting.objectId]) state.objects[awaiting.objectId].chosen = option.chosen;
  /* "This artifact enters with a fellowship counter on it for each creature you control of the chosen type" (Banner of
     Kinship; rules/replacement.mjs, withChoiceCounters): counted now, with the type just chosen, "you" its controller -- and
     put on as it entered with them (CR 614.12, 122.6), by its controller (122.6a), as riot's counter is below. */
  const chooser = state.objects[awaiting.objectId];
  if (option.chosen !== undefined && chooser) for (const {counter, count} of asked?.chosenCounters ?? []) {
    const n = amountOf(state, withChosen(count, option.chosen), {controller: chooser.controller, source: awaiting.objectId});
    if (!(n > 0)) continue;
    const was = chooser.counters[counter] ?? 0;
    chooser.counters[counter] = was + enteringCountersPlaced(state, awaiting.objectId, counter, n, chooser.controller);
    events.push({kind: "GameEventCardCounters", data: {turn: state.turn, phase: state.phase,
      fields: {card: eventCard(state, awaiting.objectId), type: counter, oldValue: was, newValue: chooser.counters[counter], by: chooser.controller}}});
  }
  if (option.pay) {
    /* Paying life is losing it (CR 119.4, 119.3). */
    events.push(...runEffect(state, {effect: "loseLife", amount: awaiting.life}, {controller: awaiting.player, source: awaiting.objectId}));
    state.objects[awaiting.objectId].tapped = false;
  }
  askEntering(state);
  return events;
}
