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
 * WHAT IS NOT HERE YET, and is absent rather than stubbed: casting a spell needs mana and costs
 * (1.3), attacking needs combat (1.4), activating an ability needs the card script (phase 2). A
 * pilot handed this list today can play lands and pass, which is exactly what the kernel can do.
 */

import {cardsIn, moveObject} from "../state/index.mjs";

const MAIN_PHASES = ["MAIN1", "MAIN2"];

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

  return actions;
}

/* Two actions are the same offer when they agree on everything that identifies them. Comparing by
   value rather than by reference is what lets an action survive a round trip through JSON — a pilot
   across a network boundary submits a copy, not the object it was handed. */
const sameAction = (a, b) => a.kind === b.kind && (a.objectId ?? null) === (b.objectId ?? null);

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

  /* Unreachable: an action kind that passed the offered check but has no branch would be a kind
     this module enumerates and cannot perform. Loud, per principle 6. */
  throw new Error(`The engine offered ${action.kind} and cannot perform it`);
}
