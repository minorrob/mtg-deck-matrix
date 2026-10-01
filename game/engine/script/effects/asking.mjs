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
import {compileSelector} from "../filter.mjs";
import {event, cardRef, moveOne, playersFor} from "./zones.mjs";
import {proliferate as giveEachAnother} from "./resources.mjs";
import {makeCopies} from "./permanents.mjs";
import {payGeneric, canPayGeneric} from "../../rules/mana.mjs";
import {typesOf} from "../../rules/layers.mjs";

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
      /* A "you may" asks in the card's own words (cards/index.mjs): its sentence, then Yes or No. */
      ...(params.title ? {title: String(params.title)} : {}),
    };
    return true;
  },

  choice(state, awaiting) {
    return {
      id: `modal:${state.turn}:${awaiting.modes.length}`,
      title: awaiting.title ?? (awaiting.choose === 1 ? "Choose one" : `Choose ${awaiting.choose}`),
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

/* ---- proliferate (CR 701.34a) ---- */

/* "Choose any number of permanents and/or players, then give each another counter of each kind already there." Asked
   of the ability's controller: one option per permanent and per player that has a counter, any number of them. */
const hasCounters = (counters) => Object.values(counters ?? {}).some((n) => n > 0);
export const proliferate = {
  open(state, params, context) {
    const candidates = [
      ...state.zones.battlefield.filter((id) => hasCounters(state.objects[id].counters)).map((id) => ({id})),
      ...state.players.filter((p) => !p.lost && hasCounters(p.counters)).map((p) => ({player: p.id})),
    ];
    if (candidates.length === 0) return false;
    state.awaiting = {kind: "effect-choice", effect: "proliferate", player: context.controller, candidates};
    return true;
  },

  choice(state, awaiting) {
    const live = awaiting.candidates;
    const countersOf = (c) => Object.entries((c.player !== undefined ? state.players[c.player] : state.objects[c.id])?.counters ?? {})
      .filter(([, n]) => n > 0).map(([kind, n]) => `${n} ${kind}`).join(", ");
    return {
      id: `proliferate:${state.turn}:${live.length}`,
      title: "Proliferate: choose any number of permanents and players with counters",
      mode: "many",
      min: 0,
      max: live.length,
      options: live.map((c, index) => (c.player !== undefined
        ? {index, label: `${state.players[c.player].name} (${countersOf(c)})`, playerId: c.player}
        : {index, label: `${state.objects[c.id].card} (${countersOf(c)})`, cardId: c.id})),
    };
  },

  apply(state, awaiting, indices) {
    const chosen = (indices ?? []).map((i) => awaiting.candidates[i]).filter(Boolean).map((c) => (c.player !== undefined ? {player: c.player} : c.id));
    return giveEachAnother(state, {chosen}, {controller: awaiting.player});
  },
};

/* ---- sacrifice (CR 701.21a) ---- */

/* "Each opponent sacrifices a creature", "target player sacrifices a creature": each player named, in turn, chooses
   which of their OWN permanents that fit the selector go -- nobody can sacrifice what they do not control -- and
   they go to their owners' graveyards, which is a death "dies" sees (CR 700.4). A player with none is not asked. */
const sacrificeable = (state, player, selector, controller) => {
  const matches = compileSelector({...(selector ?? {}), what: "permanent", controller: "you"});
  return state.zones.battlefield.filter((id) => matches(state, id, {controller: player, source: null}));
};
export const sacrifice = {
  open(state, params, context) {
    /* CR 101.4: the active player chooses first, then each other player in turn order. */
    const seats = state.players.length, apnap = (p) => (p - state.activePlayer + seats) % seats;
    const queue = playersFor(state, params.who, context.controller).filter((p) => sacrificeable(state, p, params.selector).length > 0).sort((a, b) => apnap(a) - apnap(b));
    if (queue.length === 0) return false;
    state.awaiting = {kind: "effect-choice", effect: "sacrifice", player: queue[0], remaining: queue.slice(1), count: params.count ?? 1, selector: params.selector ?? {}};
    return true;
  },

  choice(state, awaiting) {
    const mine = sacrificeable(state, awaiting.player, awaiting.selector);
    const count = Math.min(awaiting.count, mine.length);
    return {
      id: `sacrifice:${awaiting.player}:${state.turn}`,
      title: `Sacrifice ${count === 1 ? "a permanent" : `${count} permanents`}`,
      mode: count === 1 ? "one" : "many",
      min: count,
      max: count,
      /* A token said so: it is public (CR 111.1), and the cheapest thing to give up. */
      options: mine.map((id, index) => ({index, label: state.objects[id].card, cardId: id, ...(state.objects[id].token ? {token: true} : {})})),
    };
  },

  apply(state, awaiting, indices) {
    const events = [];
    const mine = sacrificeable(state, awaiting.player, awaiting.selector);
    for (const id of (indices ?? []).map((i) => mine[i]).filter((id) => id !== undefined)) moveOne(state, id, "graveyard", events);
    const next = (awaiting.remaining ?? []).filter((p) => sacrificeable(state, p, awaiting.selector).length > 0);
    if (next.length > 0) {
      state.awaiting = {...awaiting, player: next[0], remaining: next.slice(1)};
      return {events, again: true};
    }
    return events;
  },
};

/* ---- populate (CR 701.30): create a token that's a copy of a creature token you control -- which one is the player's
   choice; with none, nothing happens. What the copy then gains, or when it is sacrificed, rides along (makeCopies). ---- */
const creatureTokens = (state, player) => state.zones.battlefield.filter((id) => state.objects[id].token === true && state.objects[id].controller === player && typesOf(state, id).includes("Creature"));
export const populate = {
  open(state, params, context) {
    const tokens = creatureTokens(state, context.controller);
    if (tokens.length === 0) return false;
    state.awaiting = {kind: "effect-choice", effect: "populate", player: context.controller, tokens,
      params: {...(params.gainsUntilEndOfTurn ? {gainsUntilEndOfTurn: params.gainsUntilEndOfTurn} : {}), ...(params.gains ? {gains: params.gains} : {}), ...(params.except ? {except: params.except} : {}),
        ...(params.atEndStep ? {atEndStep: params.atEndStep} : {})}, source: context.source ?? null};
    return true;
  },
  choice(state, awaiting) {
    return {id: `populate:${awaiting.player}:${state.turn}:${awaiting.tokens.length}`, title: "Populate: copy which creature token?", mode: "one", min: 1, max: 1,
      options: awaiting.tokens.map((id, index) => ({index, label: state.objects[id]?.card ?? "Token", cardId: id}))};
  },
  apply(state, awaiting, indices) {
    const chosen = awaiting.tokens[(indices ?? [])[0]];
    if (chosen === undefined || !state.objects[chosen]) throw new Error("Invalid selection");
    const events = [];
    makeCopies(state, [chosen], awaiting.params ?? {}, {controller: awaiting.player, source: awaiting.source}, events);
    return events;
  },
};

/* ---- unlessPays (CR 118.12): "counter target spell unless its controller pays {3}", "you may draw a card unless that
   player pays {1}". The player named is asked; paying is offered only to a player who can (pool and untapped mana
   sources together) and taps for them; not paying, the effects that follow `unless` happen, in order, with the same
   targets. Generic mana only; the amount may be counted ("{X}, where X is this creature's power"). ---- */
export const unlessPays = {
  open(state, params, context) {
    const [payer] = playersFor(state, params.who, context.controller);
    if (payer === undefined) return false;
    state.awaiting = {kind: "effect-choice", effect: "unlessPays", player: payer, amount: Math.max(0, params.amount ?? 0),
      effects: structuredClone(params.effects ?? []), source: context.source ?? null};
    return true;
  },
  choice(state, awaiting) {
    const source = awaiting.source !== null ? state.objects[awaiting.source]?.card : null;
    const can = canPayGeneric(state, awaiting.player, awaiting.amount);
    return {id: `unless:${awaiting.player}:${state.turn}:${awaiting.amount}`, title: `${source ? `${source}: ` : ""}pay {${awaiting.amount}}?`, mode: "one", min: 1, max: 1,
      options: [...(can ? [{index: 0, label: `Pay {${awaiting.amount}}`, pay: true}] : []), {index: can ? 1 : 0, label: "Don't pay", pay: false}]};
  },
  apply(state, awaiting, indices) {
    const option = unlessPays.choice(state, awaiting).options[(indices ?? [])[0]];
    if (!option) throw new Error("Invalid selection");
    if (option.pay) return payGeneric(state, awaiting.player, awaiting.amount);
    return {events: [], splice: structuredClone(awaiting.effects)};
  },
};

/** The four, by the name a card script uses. */
/* ---- chooseCard: a search (CR 701.23) ---- */

/* What the search may find: the selector's cards, in the zone it searches, the searcher's own. */
const ZONE_WORD = {library: "library", graveyard: "graveyard", hand: "hand"};
const hasQuality = (selector) => Object.keys(selector ?? {}).some((k) => !["what", "zone"].includes(k));
/* CR 701.23: what the search was for. */

/**
 * "Search your library for a basic land card, put it onto the battlefield tapped, then shuffle." The searcher looks
 * at the whole zone and chooses up to `count` cards the selector matches. CR 701.23b: searching for a card with a
 * stated quality ("a basic land card") may find none even when there is one; CR 701.23d: searching for just "a card"
 * must find that many if the zone has them. Each card chosen goes to the next of `destinations`, in the order chosen
 * -- Cultivate's "one onto the battlefield tapped and the other into your hand" is two -- the last repeating for the
 * rest. `shuffle` shuffles the library after (CR 701.24), before a card put "on top" is put there. The question is
 * always asked, even of a library with nothing to find: the player still searches, and the shuffle still happens.
 */
export const chooseCard = {
  open(state, params, context) {
    const zone = params.zone ?? "library";
    const [player] = playersFor(state, params.who, context.controller);
    if (player === undefined) return false;
    /* A description, or a choice of them (`anyOf`): "a Plains, Island, Swamp, or Mountain card". */
    const alternatives = Array.isArray(params.selector?.anyOf) ? params.selector.anyOf : [params.selector ?? {}];
    const matchers = alternatives.map((one) => compileSelector({...one, what: "card", zone}));
    const cards = cardsIn(state, zone, player).filter((id) => matchers.some((m) => m(state, id, {controller: player, source: context.source})));
    const count = params.count ?? 1;
    const min = params.upTo || hasQuality(params.selector) ? 0 : Math.min(count, cards.length);
    state.awaiting = {
      kind: "effect-choice", effect: "chooseCard", player, zone, cards, min, max: Math.min(count, cards.length),
      destinations: params.destinations ?? [{to: params.to ?? "hand", ...(params.tapped ? {tapped: true} : {})}],
      shuffle: params.shuffle === true, reveal: params.reveal === true, controller: params.controller ?? null,
    };
    return true;
  },

  choice(state, awaiting) {
    return {
      id: `chooseCard:${awaiting.player}:${state.turn}:${awaiting.cards.length}`,
      title: awaiting.max === 0 ? `Search your ${ZONE_WORD[awaiting.zone]}: nothing to find` : `Search your ${ZONE_WORD[awaiting.zone]}`,
      mode: awaiting.max <= 1 ? (awaiting.min === 0 ? "many" : "one") : "many",
      min: awaiting.min,
      max: awaiting.max,
      options: cardOptions(state, awaiting.cards),
    };
  },

  apply(state, awaiting, indices, extra = {}, rng = null) {
    const events = [];
    const chosen = (indices ?? []).map((index) => awaiting.cards[index]);
    if (chosen.length < awaiting.min || chosen.length > awaiting.max || chosen.some((id) => id === undefined) || new Set(chosen).size !== chosen.length)
      throw new Error("Invalid selection");
    const player = awaiting.player;
    const tops = [];
    chosen.forEach((id, i) => {
      const where = awaiting.destinations[Math.min(i, awaiting.destinations.length - 1)];
      if (awaiting.reveal) events.push(event("GameEventCardRevealed", state, {card: cardRef(state, id), player: {playerId: player}}));
      if (where.to === "top") { tops.push(id); return; }
      const moved = moveOne(state, id, where.to, events, {owner: state.objects[id].owner});
      if (moved !== null && state.objects[moved] && where.to === "battlefield") {
        if (where.tapped) state.objects[moved].tapped = true;
        /* "Under your control": the searcher's, when the card is another player's own (it never is from a library). */
        if (awaiting.controller !== null && awaiting.controller !== undefined) state.objects[moved].controller = awaiting.controller;
      }
    });
    if (awaiting.shuffle) {
      if (!rng) throw new Error("A search that shuffles needs the game's random stream");
      const library = state.zones.library[player].filter((id) => !tops.includes(id));
      state.zones.library[player] = rng.shuffle(library);
      events.push(event("GameEventShuffle", state, {player: {playerId: player, name: state.players[player].name}}));
    }
    /* "Then shuffle and put that card on top" (CR 701.24): after the shuffle, on top, in the order chosen. */
    if (tops.length) {
      const library = state.zones.library[player].filter((id) => !tops.includes(id));
      state.zones.library[player] = [...tops, ...library];
    }
    return events;
  },
};

export const ASKING = Object.freeze({scry, dig, discard, modal, chooseCard, proliferate, sacrifice, populate, unlessPays});
