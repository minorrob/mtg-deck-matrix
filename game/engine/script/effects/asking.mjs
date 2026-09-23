/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* THE FOUR PRIMITIVES THAT ASK A PLAYER SOMETHING.
 *
 * `docs/engine/PLAN.md` §12.2 — `dig`, `scry`, `discard` and `modal` (Forge's Charm). Fifty of the
 * 821 API uses across Rob's seven decks, and the reason 2.2a stopped at twenty-one: none of these
 * can be written as a function that returns events, because every one of them stops and waits for a
 * person.
 *
 * Each is a pair. `open` puts the question on `state.awaiting` and returns true; `apply` takes the
 * answer and does the thing. `resolution.mjs` drives the two halves and is what makes what follows
 * still happen afterwards.
 *
 * SCRY IS ONE CHOICE, NOT TWO (CR 701.22a): put any number on the bottom and the rest on top IN ANY
 * ORDER. That is exactly the `manipulate` shape §12.1 already pins, with `toTop` and `toBottom` —
 * so the board can already draw it, `controller.mjs` already validates the ordering, and there is
 * no new dialogue for anybody to build.
 *
 * DISCARD IS THE DISCARDING PLAYER'S CHOICE. "Each opponent discards a card" asks each of them, one
 * at a time, about their own hand. A card reading that does not let its controller pick.
 *
 * MODAL SPLICES RATHER THAN RECURSING. The chosen modes' effects go into the front of the
 * resolution queue, so a mode containing a scry stops the resolution the same way a top-level scry
 * would, and whatever followed the modal is still waiting behind it. Recursion would have had to
 * unwind across the pause and rebuild itself.
 */

import {cardsIn, moveObject} from "../../state/index.mjs";
import {event, cardRef, moveOne, playersFor} from "./zones.mjs";

const cardOptions = (state, ids) => ids.map((id, index) => ({index, label: state.objects[id].card, cardId: id}));

/* ---- scry ---- */

export const scry = {
  open(state, params, context) {
    const count = params.count ?? 1;
    const looked = cardsIn(state, "library", context.controller).slice(0, count);
    if (looked.length === 0) return false;
    state.awaiting = {
      kind: "effect-choice", effect: "scry", player: context.controller, cards: looked,
    };
    return true;
  },

  choice(state, awaiting) {
    return {
      id: `scry:${awaiting.cards.join(",")}`,
      title: `Scry ${awaiting.cards.length}`,
      mode: "order",
      min: awaiting.cards.length,
      max: awaiting.cards.length,
      /* The shape the board already draws and `controller.mjs` already validates. */
      choiceKind: "manipulate",
      toTop: true,
      toBottom: true,
      toAnywhere: false,
      options: cardOptions(state, awaiting.cards).map((option) => ({...option, movable: true})),
    };
  },

  /**
   * `indices` is the order the player put them in; `toBottom` names which of those go under.
   * Everything else stays on top, in the order given.
   */
  apply(state, awaiting, indices, extra = {}) {
    const events = [];
    const player = awaiting.player;
    const chosen = (indices ?? []).map((index) => awaiting.cards[index]).filter((id) => id !== undefined);
    const bottomSet = new Set((extra.toBottom ?? []).map((index) => awaiting.cards[index]));
    const library = state.zones.library[player];

    /* Lift the looked-at cards out, then put them back in the order the player asked for. Removing
       them first is what lets "on top" and "on the bottom" both be written as an insertion. */
    for (const id of awaiting.cards) {
      const at = library.indexOf(id);
      if (at >= 0) library.splice(at, 1);
    }
    const top = chosen.filter((id) => !bottomSet.has(id));
    const bottom = chosen.filter((id) => bottomSet.has(id));
    library.unshift(...top);
    library.push(...bottom);

    if (bottom.length > 0) {
      events.push(event("GameEventShuffle", state, {
        player: {playerId: player, name: state.players[player].name}, scryedToBottom: bottom.length,
      }));
    }
    return events;
  },
};

/* ---- dig ---- */

export const dig = {
  open(state, params, context) {
    const looked = cardsIn(state, "library", context.controller).slice(0, params.count ?? 1);
    if (looked.length === 0) return false;
    state.awaiting = {
      kind: "effect-choice", effect: "dig", player: context.controller, cards: looked,
      take: Math.min(params.take ?? 1, looked.length),
      to: params.to ?? "hand", rest: params.rest ?? "bottom",
    };
    return true;
  },

  choice(state, awaiting) {
    return {
      id: `dig:${awaiting.cards.join(",")}`,
      title: `Choose ${awaiting.take} to put into your ${awaiting.to}`,
      mode: awaiting.take === 1 ? "one" : "many",
      min: awaiting.take,
      max: awaiting.take,
      options: cardOptions(state, awaiting.cards),
    };
  },

  apply(state, awaiting, indices) {
    const events = [];
    const taken = new Set((indices ?? []).map((index) => awaiting.cards[index]));
    for (const id of awaiting.cards) {
      if (!taken.has(id)) continue;
      moveOne(state, id, awaiting.to, events, {owner: awaiting.player});
    }
    /* The rest, in the order they were looked at. "The bottom" is a library move that keeps their
       order; anywhere else is an ordinary zone change. */
    const rest = awaiting.cards.filter((id) => !taken.has(id) && state.objects[id]);
    if (awaiting.rest === "bottom") {
      const library = state.zones.library[awaiting.player];
      for (const id of rest) {
        const at = library.indexOf(id);
        if (at >= 0) library.splice(at, 1);
        library.push(id);
      }
    } else {
      for (const id of rest) moveOne(state, id, awaiting.rest, events, {owner: awaiting.player});
    }
    return events;
  },
};

/* ---- discard ---- */

export const discard = {
  open(state, params, context) {
    /* Each player who has to discard is asked separately, in turn order, about their own hand. */
    const queue = playersFor(state, params.who, context.controller)
      .filter((player) => cardsIn(state, "hand", player).length > 0);
    if (queue.length === 0) return false;
    state.awaiting = {
      kind: "effect-choice", effect: "discard", player: queue[0], remaining: queue.slice(1),
      count: params.count ?? 1, who: params.who, controller: context.controller,
    };
    return true;
  },

  choice(state, awaiting) {
    const hand = cardsIn(state, "hand", awaiting.player);
    const count = Math.min(awaiting.count, hand.length);
    return {
      id: `discard:${awaiting.player}:${state.turn}`,
      title: `Discard ${count} card${count === 1 ? "" : "s"}`,
      mode: count === 1 ? "one" : "many",
      min: count,
      max: count,
      options: cardOptions(state, hand),
    };
  },

  apply(state, awaiting, indices) {
    const events = [];
    const hand = cardsIn(state, "hand", awaiting.player);
    /* Resolved to ids before anything moves, because each move makes a new object and rewrites the
       hand underneath the positions the player answered with. */
    const chosen = (indices ?? []).map((index) => hand[index]).filter((id) => id !== undefined);
    for (const id of chosen) {
      const card = cardRef(state, id);
      const owner = state.objects[id].owner;
      moveObject(state, id, "graveyard", owner);
      events.push(event("GameEventCardChangeZone", state, {
        card,
        from: {zoneType: "Hand", player: {playerId: awaiting.player}},
        to: {zoneType: "Graveyard", player: {playerId: owner}},
        discarded: true,
      }));
    }

    /* The next player who still has to discard, if there is one. */
    const next = (awaiting.remaining ?? []).filter((player) => cardsIn(state, "hand", player).length > 0);
    if (next.length > 0) {
      state.awaiting = {...awaiting, player: next[0], remaining: next.slice(1)};
      return {events, again: true};
    }
    return events;
  },
};

/* ---- modal ---- */

export const modal = {
  open(state, params, context) {
    const modes = params.modes ?? [];
    if (modes.length === 0) return false;
    const choose = Math.min(params.choose ?? 1, modes.length);
    state.awaiting = {
      kind: "effect-choice", effect: "modal", player: context.controller,
      modes: modes.map((mode) => ({text: mode.text ?? "", effects: structuredClone(mode.effects ?? [])})),
      choose,
    };
    return true;
  },

  choice(state, awaiting) {
    return {
      id: `modal:${state.turn}:${awaiting.modes.length}`,
      title: awaiting.choose === 1 ? "Choose one" : `Choose ${awaiting.choose}`,
      mode: awaiting.choose === 1 ? "one" : "many",
      min: awaiting.choose,
      max: awaiting.choose,
      /* Each mode named by the card's own words. "Mode 1" and "mode 2" is not a choice anybody can
         make, and a card with two similar modes is exactly when it matters. */
      options: awaiting.modes.map((mode, index) => ({index, label: mode.text})),
    };
  },

  /**
   * Returns the chosen modes' effects for the resolution to splice into the FRONT of its queue.
   *
   * Splicing rather than running is the whole point: a mode containing a scry then stops the
   * resolution exactly as a top-level scry would, and whatever followed the modal is still waiting
   * behind it.
   */
  apply(state, awaiting, indices) {
    const chosen = (indices ?? []).map((index) => awaiting.modes[index]).filter(Boolean);
    return {events: [], splice: chosen.flatMap((mode) => mode.effects)};
  },
};

/** The four, by the name a card script uses. */
export const ASKING = Object.freeze({scry, dig, discard, modal});
