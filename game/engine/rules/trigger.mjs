/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* TRIGGERED ABILITIES: CR 603.
 *
 * `docs/engine/PLAN.md` §3.3, seventh row: "leaves-the-battlefield look-back (603.10), intervening
 * if".
 *
 * A TRIGGER DOES NOT RESOLVE WHERE IT HAPPENED (CR 603.3). It triggers, waits, and is put on the
 * stack the next time a player would receive priority. Running the effect at the moment of the
 * event is the tempting shortcut and it gets the whole game wrong quietly: the trigger cannot be
 * responded to, it happens before state-based actions rather than after, and two triggers from one
 * event resolve in the order the code noticed them rather than the order their controllers chose.
 *
 * APNAP (CR 603.3b). The ACTIVE player's triggers go on the stack first, then each other player's
 * in turn order. Because the stack is last-on-first-off, the active player's therefore resolve
 * LAST. That inversion is the classic error and it stays invisible until two triggers fight over
 * the same permanent.
 *
 * A PLAYER ORDERS THEIR OWN. Two of your triggers at once is a decision and it is yours, not a
 * timestamp the engine picks (CR 603.3b again).
 *
 * THE LOOK-BACK IS NOT SPECIAL MACHINERY (CR 603.10a, 603.6e). "Whenever this creature dies" has to
 * see the creature, and by the time the trigger is collected the creature is gone — a zone change
 * makes a new object, so it is not even the same object any more. Every rules module here takes its
 * `card` snapshot BEFORE applying a move, so the event already carries the object as it was. The
 * look-back falls out of the event envelope rather than needing a shadow copy of the board.
 *
 * WHAT A TRIGGER WATCHES IS THE ENGINE'S OWN EVENTS. A trigger condition is data over the same
 * `CommanderProbeEvent@1` records the journal writes, so phase 2's card script compiles to this
 * rather than to a private vocabulary that would need translating.
 *
 * WHAT IS DEFERRED AND NAMED: state triggers (CR 603.8), which trigger while a condition holds
 * rather than on an event, and delayed triggers (CR 603.7), which are created by a resolving
 * effect. Both need the effect system in phase 2 before they have anything to be created by.
 */

import {pushAbility} from "./stack.mjs";
import {cardsIn} from "../state/index.mjs";

/* An ability lives where its card is (CR 113.6). A triggered ability of a permanent watches the
   game only while that permanent is on the battlefield, so an ability on a card in a graveyard is
   not watching anything — which is why a dead creature's "whenever a creature enters" stays quiet. */
const WATCHING_ZONES = ["battlefield"];

/** Whether an event matches a trigger condition. */
function matches(state, event, condition, sourceId, controller) {
  if (event.kind !== condition.on) return false;
  const fields = event.data?.fields ?? {};

  if (condition.on === "GameEventCardChangeZone") {
    if (condition.from && fields.from?.zoneType !== condition.from) return false;
    if (condition.to && fields.to?.zoneType !== condition.to) return false;
    /* `self` means this permanent, compared against the card AS IT WAS — the event's snapshot, not
       the object, because for a death the object no longer exists. */
    if (condition.who === "self" && fields.card?.cardId !== sourceId) return false;
    return true;
  }

  if (condition.on === "GameEventTurnPhase") {
    if (condition.phase && fields.phase !== condition.phase) return false;
    if (condition.yourTurn && fields.playerTurn?.playerId !== controller) return false;
    return true;
  }

  return true;
}

/* CR 603.4, the intervening "if": checked when the ability WOULD trigger, and again on resolution.
   An ability whose condition is false when the event happens does not trigger at all — it is not
   put on the stack and then removed, it never goes on. */
function conditionHolds(state, condition, controller) {
  if (!condition) return true;
  if (condition.handEmpty === true && cardsIn(state, "hand", controller).length > 0) return false;
  if (condition.handEmpty === false && cardsIn(state, "hand", controller).length === 0) return false;
  return true;
}

/**
 * Find every ability that triggers on these events and queue it (CR 603.2).
 *
 * Nothing goes on the stack here. `openTriggers` does that at the next priority, which is the rule.
 *
 * @param {Array} events  what just happened, as the rules modules returned it
 */
export function collectTriggers(state, events) {
  if (!state.pendingTriggers) state.pendingTriggers = [];
  for (const event of events ?? []) {
    for (const zone of WATCHING_ZONES) {
      for (const id of state.zones[zone]) {
        const object = state.objects[id];
        for (const ability of object.abilities ?? []) {
          if (ability.kind !== "triggered" || !ability.trigger) continue;
          if (!matches(state, event, ability.trigger, id, object.controller)) continue;
          if (!conditionHolds(state, ability.condition, object.controller)) continue;
          state.pendingTriggers.push({
            abilityId: ability.id,
            text: ability.text ?? ability.id,
            controller: object.controller,
            /* The object AS IT WAS. For a death this is the only record of it that still exists. */
            source: {cardId: id, name: object.card},
            /* What caused it, so an effect that refers to "that creature" has it. For a departure
               that is the last known information (CR 113.7a) and not the bare identity reference:
               "each opponent loses life equal to its power" needs the power of a thing that is no
               longer anywhere, and `card` carries only enough to name it. */
            cause: event.data?.fields?.leftBehind ?? event.data?.fields?.card ?? null,
            optional: ability.optional === true,
          });
        }
      }
    }
    /* A trigger that watches a permanent LEAVING has to also fire for the permanent that left,
       whose object is already gone from the battlefield by the time this runs. The event's snapshot
       is the look-back (CR 603.10a), and `cause` carries the ability it belonged to. */
    if (event.kind === "GameEventCardChangeZone" && event.data?.fields?.from?.zoneType === "Battlefield") {
      const gone = event.data.fields.leftBehind;
      for (const ability of gone?.abilities ?? []) {
        if (ability.kind !== "triggered" || !ability.trigger) continue;
        if (!matches(state, event, ability.trigger, gone.cardId, gone.controller)) continue;
        if (!conditionHolds(state, ability.condition, gone.controller)) continue;
        state.pendingTriggers.push({
          abilityId: ability.id,
          text: ability.text ?? ability.id,
          controller: gone.controller,
          source: {cardId: gone.cardId, name: gone.name},
          cause: gone,
          optional: ability.optional === true,
        });
      }
    }
  }
  return state.pendingTriggers.length;
}

/** How many triggers are waiting to go on the stack. */
export const pendingCount = (state) => (state.pendingTriggers ?? []).length;

/* APNAP (CR 603.3b): the active player, then each other in turn order. */
const apnapOrder = (state) => {
  const count = state.players.length;
  const order = [];
  for (let step = 0; step < count; step += 1) {
    const at = (state.activePlayer + step) % count;
    if (!state.players[at].lost) order.push(at);
  }
  return order;
};

const nextToOrder = (state) => {
  for (const player of apnapOrder(state)) {
    if ((state.pendingTriggers ?? []).some((t) => t.controller === player)) return player;
  }
  return null;
};

/**
 * Put waiting triggers on the stack (CR 603.3), in APNAP order.
 *
 * A player with more than one stops the game and is asked for the order. With exactly one there is
 * nothing to decide, so nothing is asked.
 *
 * @returns {boolean} true when the engine is now waiting on an ordering decision
 */
export function openTriggers(state) {
  if (pendingCount(state) === 0) return false;
  const player = nextToOrder(state);
  if (player === null) return false;
  const mine = state.pendingTriggers.filter((t) => t.controller === player);
  if (mine.length > 1) {
    state.awaiting = {kind: "order-triggers", player};
    return true;
  }
  putOnStack(state, mine);
  /* The next player's, and the one after — each in turn, so one call settles the whole round
     unless somebody has an ordering to make. */
  return openTriggers(state);
}

function putOnStack(state, triggers) {
  for (const trigger of triggers) {
    pushAbility(state, {
      sourceId: state.objects[trigger.source.cardId] ? trigger.source.cardId : null,
      controller: trigger.controller,
      abilityId: trigger.abilityId,
      kind: "trigger",
    });
    const at = state.pendingTriggers.indexOf(trigger);
    if (at >= 0) state.pendingTriggers.splice(at, 1);
  }
}

/** The ordering choice (§12.1), for a player with more than one trigger waiting. */
export function triggerChoice(state, awaiting) {
  const mine = state.pendingTriggers.filter((t) => t.controller === awaiting.player);
  return {
    id: `order-triggers:${state.turn}:${awaiting.player}`,
    title: "Choose the order your triggers go on the stack",
    mode: "order",
    min: mine.length,
    max: mine.length,
    options: mine.map((trigger, index) => ({
      index,
      /* The ability's own words, because "trigger 1" and "trigger 2" is not a choice anybody can
         make. The source is named too, since a player may control two copies of one card. */
      label: `${trigger.source.name}: ${trigger.text}`,
      cardId: trigger.source.cardId,
    })),
  };
}

/**
 * Apply the ordering. The FIRST index chosen goes on the stack first, so it resolves last — which
 * is what the choice's title has to mean to a player, and what the board shows.
 */
export function resolveTriggerOrder(state, awaiting, indices) {
  const choice = triggerChoice(state, awaiting);
  const mine = state.pendingTriggers.filter((t) => t.controller === awaiting.player);
  if (!Array.isArray(indices) || indices.length !== mine.length)
    throw new Error("Order all of the triggers");
  if (new Set(indices).size !== indices.length) throw new Error("Invalid selection");
  const ordered = indices.map((index) => {
    if (!choice.options[index]) throw new Error("Invalid selection");
    return mine[index];
  });
  putOnStack(state, ordered);
  state.awaiting = null;
  /* Somebody else may still have triggers waiting, and may also have an ordering to make. */
  openTriggers(state);
  return [];
}
