/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* WHAT A PLAYER MAY DO RIGHT NOW.
 *
 * `docs/engine/PLAN.md` §3.6: the `random-legal` pilot "picks uniformly from enumerated legal
 * actions". That sentence is the contract this file exists to keep, and the word that matters is
 * ENUMERATED.
 *
 * LEGALITY IS OFFERED, NOT ASSERTED. The engine lists what a player may do and refuses anything it
 * did not list. The alternative — a pilot that names an action and an engine that performs it if it
 * looks plausible — is how a pilot ends up playing two lands in a turn, or acting on somebody
 * else's, and nobody notices for a month because the board renders it perfectly. Refusing here also
 * means the house pilot, an API pilot and a browser seat are all held to the same rules by the same
 * code, rather than each being trusted to know them.
 *
 * PLAYING A LAND IS A SPECIAL ACTION (CR 116.2a, 305.1): it does not use the stack and cannot be
 * responded to. It is legal only while its player has priority, during a main phase of their own
 * turn, with an empty stack, and while they have a land drop left (CR 305.2). Every clause is a
 * separate way to get it wrong, so each is a separate line below.
 *
 * A MANA ABILITY NEVER TOUCHES THE STACK (CR 605.3a). It cannot be responded to, it resolves as it
 * is activated, and it may be activated any time its controller has priority — not only in a main
 * phase. Putting it on the stack is the most visible rules error an engine can make: every land tap
 * would become a window for instants and every game would play wrong from turn one.
 *
 * TIMING IS TWO RULES, NOT ONE. A sorcery-speed spell needs a main phase of its controller's own
 * turn with an empty stack (CR 307.1). An instant needs priority and nothing else (CR 304.1). Using
 * one test for both either forbids legal instants or allows sorceries during combat.
 *
 * WHAT IS DEFERRED AND IS NAMED RATHER THAN FAKED: CR 601.2g lets a player activate mana abilities
 * DURING casting, once the total cost is known. Here, tapping and casting are separate offered
 * actions — a legal sequence, and the one a human plays. A spell is offered when the POOL can pay
 * for it, not when the battlefield could, so the engine never offers a cast it cannot complete.
 * Automatic land-tapping belongs with the payment choice (§12.1 `payment.automaticEligible`).
 *
 * Attacking needs combat (1.4); non-mana activated abilities need the card script (phase 2). Both
 * are absent rather than stubbed.
 */

import {cardsIn, moveObject} from "../state/index.mjs";
import {pushSpell} from "./stack.mjs";
import {addMana, spend, parseManaCost, automaticPayment, manaValue, poolSize} from "./mana.mjs";
import {commanderTax, recordCommanderCast} from "./commander.mjs";
import {summoningSick, hasFlash} from "../keywords/timing.mjs";

const MAIN_PHASES = ["MAIN1", "MAIN2"];
/* CR 307.1 and 308.1: these are the card types that can only be cast at sorcery speed. */
const SORCERY_SPEED = ["Sorcery", "Creature", "Artifact", "Enchantment", "Planeswalker", "Battle"];

const event = (kind, state, fields) => ({kind, data: {turn: state.turn, phase: state.phase, fields}});

const cardRef = (state, id) => {
  const o = state.objects[id];
  return o ? {cardId: o.id, name: o.card, owner: o.owner, controller: o.controller, faceDown: false} : null;
};

const isLand = (object) => (object.types ?? []).includes("Land");

/** How many lands this player may still play this turn. CR 305.2; effects raise the allowance. */
const landDropsLeft = (state, player) => (state.players[player].landAllowance ?? 1) - state.players[player].landsPlayed;

/**
 * Every action the given player may legally take at this instant.
 *
 * A player who does not hold priority gets an empty list — not a list containing "pass", because
 * they cannot pass either. An empty list is the honest answer to "what may you do", and a caller
 * that treats it as "nothing to do" is right.
 */
export function legalActions(state, player) {
  if (state.priorityPlayer !== player) return [];

  const actions = [{kind: "pass"}];

  /* CR 116.2a and 305.1. All four conditions, each of which is a real way to be wrong. */
  if (player === state.activePlayer
      && MAIN_PHASES.includes(state.phase)
      && state.stack.length === 0
      && landDropsLeft(state, player) > 0) {
    for (const id of cardsIn(state, "hand", player)) {
      if (!isLand(state.objects[id])) continue;
      actions.push({kind: "play-land", objectId: id, label: state.objects[id].card});
    }
  }

  /* CR 605.3a: any time you have priority, whatever the step. */
  for (const id of state.zones.battlefield) {
    const object = state.objects[id];
    if (object.controller !== player) continue;
    for (const ability of object.abilities ?? []) {
      if (ability.kind !== "mana") continue;
      if (ability.tapSelf && object.tapped) continue;
      /* CR 302.6: a creature's {T} ability waits until it has been yours since your turn began, unless it has haste.
         A land is never sick; a land animated this turn is a creature, and is. */
      if (ability.tapSelf && summoningSick(state, id)) continue;
      actions.push({kind: "activate-mana", objectId: id, abilityId: ability.id, label: object.card});
    }
  }

  /* CR 601.2. Offered only when the pool can pay: the engine does not offer what it cannot do.
     A commander is castable from the COMMAND ZONE as well as from hand (CR 903.8), and its tax is
     part of the cost — so a taxed commander a player cannot afford is never offered, rather than
     offered and refused at payment. */
  const castable = [
    ...cardsIn(state, "hand", player).map((id) => ({id, from: "hand"})),
    ...cardsIn(state, "command", player)
      .filter((id) => state.objects[id].commander === true)
      .map((id) => ({id, from: "command"})),
  ];
  for (const {id, from} of castable) {
    const object = state.objects[id];
    if (!object.manaCost) continue;
    if (sorcerySpeed(object) && !hasFlash(state, id) && !(player === state.activePlayer && MAIN_PHASES.includes(state.phase) && state.stack.length === 0))
      continue;
    const tax = from === "command" ? commanderTax(state, player, id) : 0;
    const cost = parseManaCost(object.manaCost);
    const payment = automaticPayment(state.players[player].manaPool, cost, {life: state.players[player].life, x: tax});
    if (!payment) continue;
    actions.push({kind: "cast", objectId: id, label: object.card, payment, from, tax});
  }

  return actions;
}

const sorcerySpeed = (object) => (object.types ?? []).some((type) => SORCERY_SPEED.includes(type));

/**
 * NOTHING TO DO (docs/plan-to-done-2026-09-30.md, item 11): the player holds priority, the stack is empty, and there
 * is no action but to pass. A mana ability counts only while there is something the mana could be for -- a spell
 * castable now, at its speed, with the pool and every untapped source together. That is a count, not a payment:
 * colors are not matched, so a doubtful case is asked rather than passed for the player.
 */
export function nothingToDo(state, player, actions = legalActions(state, player)) {
  if (state.priorityPlayer !== player || state.stack.length) return false;
  if (actions.some((a) => a.kind !== "pass" && a.kind !== "activate-mana")) return false;
  const sources = actions.filter((a) => a.kind === "activate-mana").length;
  if (!sources) return true;
  const mana = poolSize(state.players[player].manaPool) + sources;
  const mainNow = player === state.activePlayer && MAIN_PHASES.includes(state.phase);
  const spells = [...cardsIn(state, "hand", player), ...cardsIn(state, "command", player).filter((id) => state.objects[id].commander === true)];
  return !spells.some((id) => {
    const object = state.objects[id];
    if (!object.manaCost || (sorcerySpeed(object) && !hasFlash(state, id) && !mainNow)) return false;
    const tax = object.zone === "command" ? commanderTax(state, player, id) : 0;
    return manaValue(parseManaCost(object.manaCost)) + tax <= mana;
  });
}

/* Two actions are the same offer when they agree on everything that identifies them. Comparing by
   value rather than by reference is what lets an action survive a round trip through JSON — a pilot
   across a network boundary submits a copy, not the object it was handed. */
const sameAction = (a, b) => a.kind === b.kind
  && (a.objectId ?? null) === (b.objectId ?? null)
  && (a.abilityId ?? null) === (b.abilityId ?? null);

/**
 * Perform an action, after checking the engine actually offered it.
 *
 * @returns {Array} events for the caller to journal
 */
export function applyAction(state, player, action) {
  if (state.priorityPlayer !== player)
    throw new Error("That player does not hold priority");
  const offered = legalActions(state, player);
  if (!action || !offered.some((candidate) => sameAction(candidate, action)))
    throw new Error(`That is not a legal action here: ${JSON.stringify(action?.kind ?? action)}`);

  /* Passing is the priority module's business, because what a full round of passes means depends on
     the stack. The caller routes it there; this refusal is so that nobody routes it here and gets a
     silent no-op instead. */
  if (action.kind === "pass")
    throw new Error("Pass through passPriority, which is what decides whether a round ends a step or resolves an object");

  if (action.kind === "play-land") {
    const events = [];
    const card = cardRef(state, action.objectId);
    moveObject(state, action.objectId, "battlefield");
    state.players[player].landsPlayed += 1;
    /* The order matters to a reader: the land is announced as a land, then as the zone change it
       also is, which is what `match-telemetry.mjs` counts and what the audio rules listen for. */
    events.push(event("GameEventLandPlayed", state, {land: card, player: {playerId: player, name: state.players[player].name}}));
    events.push(event("GameEventCardChangeZone", state, {
      card,
      from: {zoneType: "Hand", player: {playerId: player}},
      to: {zoneType: "Battlefield", player: {playerId: player}},
    }));
    return events;
  }

  if (action.kind === "activate-mana") {
    const events = [];
    const object = state.objects[action.objectId];
    const ability = (object.abilities ?? []).find((candidate) => candidate.id === action.abilityId);
    if (ability.tapSelf) {
      object.tapped = true;
      events.push(event("GameEventCardTapped", state, {card: cardRef(state, action.objectId), tapped: true}));
    }
    addMana(state.players[player].manaPool, ability.produces);
    events.push(event("GameEventManaPool", state, {
      player: {playerId: player, name: state.players[player].name},
      produced: {...ability.produces}, source: cardRef(state, action.objectId),
    }));
    /* NOTHING GOES ON THE STACK. CR 605.3a — the whole point of a mana ability. */
    return events;
  }

  if (action.kind === "cast") {
    const events = [];
    const object = state.objects[action.objectId];
    /* Recomputed rather than trusted: the action arrived from a pilot, possibly across a network,
       and the pool may have moved since it was offered. The offered check above proves the action
       is still on the list, and this proves the payment still balances. */
    const fromCommand = object.zone === "command";
    const tax = fromCommand ? commanderTax(state, player, action.objectId) : 0;
    const cost = parseManaCost(object.manaCost);
    const payment = automaticPayment(state.players[player].manaPool, cost, {life: state.players[player].life, x: tax});
    if (!payment) throw new Error(`${object.card} cannot be paid for from this pool`);
    const card = cardRef(state, action.objectId);
    spend(state.players[player].manaPool, payment.mana);
    if (payment.life > 0) state.players[player].life -= payment.life;
    /* CR 903.8: the tax counts casts from the command zone, so it is recorded only here. */
    if (fromCommand) recordCommanderCast(state, player, action.objectId);

    const permanent = !(object.types ?? []).some((type) => ["Instant", "Sorcery"].includes(type));
    const entry = pushSpell(state, action.objectId, {controller: player, permanent});
    events.push(event("GameEventSpellAbilityCast", state, {
      card,
      sa: {isSpell: true, abilityId: entry.abilityId, stackId: entry.stackId},
      si: {isTrigger: false, actor: {playerId: player, name: state.players[player].name}},
      targetDescription: "",
    }));
    events.push(event("GameEventCardChangeZone", state, {
      card,
      from: {zoneType: fromCommand ? "Command" : "Hand", player: {playerId: player}},
      to: {zoneType: "Stack", player: {playerId: player}},
    }));
    return events;
  }

  /* Unreachable: an action kind that passed the offered check but has no branch would be a kind
     this module enumerates and cannot perform. Loud, per principle 6. */
  throw new Error(`The engine offered ${action.kind} and cannot perform it`);
}
