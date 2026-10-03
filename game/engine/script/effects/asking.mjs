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
import {event, cardRef, moveOne, playersFor, sacrificeOne} from "./zones.mjs";
import {proliferate as giveEachAnother} from "./resources.mjs";
import {makeCopies, afterwards, joinAttack, defendingPlayers, attachTo} from "./permanents.mjs";
import {payGeneric, canPayGeneric, parseManaCost, manaValue} from "../../rules/mana.mjs";
import {typesOf, characteristicsOf} from "../../rules/layers.mjs";
import {pushCopy, becameTarget, specsOf} from "../../rules/stack.mjs";
import {loseLife} from "./resources.mjs";
import {targetCandidates, targetName} from "../bind.mjs";
import {commanderTax} from "../../rules/commander.mjs";
import {amountOf} from "../amount.mjs";
import {castNow, castChoicesNow} from "../../rules/actions.mjs";

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

/* ---- surveil ---- */

/* SURVEIL N (CR 701.25a): look at the top N cards of your library, put any number of them into your graveyard and the rest
   on top in any order. Two questions, each one the board already draws as a pop-up: first which of them go to the
   graveyard (pick any, none included), then -- only when two or more stay -- the order they go back in, top first. A
   library with nothing in it surveils nothing (CR 701.25c); one that stays is simply put back. Each card moved is moved
   through the replacement effects, so "if a card would be put into a graveyard, exile it instead" sees it. */
export const surveil = {
  open(state, params, context) {
    const looked = cardsIn(state, "library", context.controller).slice(0, params.count ?? 1);
    if (looked.length === 0) return false;
    state.awaiting = {kind: "effect-choice", effect: "surveil", player: context.controller, cards: looked, step: "graveyard", count: looked.length};
    return true;
  },

  choice(state, awaiting) {
    if (awaiting.step === "order") return {
      id: `surveil-order:${awaiting.cards.join(",")}`,
      title: "Put the rest back on top of your library, the first you choose on top",
      mode: "order", min: awaiting.cards.length, max: awaiting.cards.length,
      options: cardOptions(state, awaiting.cards),
    };
    return {
      id: `surveil:${awaiting.cards.join(",")}`,
      title: `Surveil ${awaiting.count}: choose any to put into your graveyard`,
      mode: "many", min: 0, max: awaiting.cards.length,
      options: cardOptions(state, awaiting.cards),
    };
  },

  apply(state, awaiting, indices) {
    const events = [];
    const player = awaiting.player;
    const chosen = (indices ?? []).map((index) => awaiting.cards[index]).filter((id) => id !== undefined);
    if (awaiting.step === "order") {
      /* Lifted out and put back in the order given, the first on top. */
      const library = state.zones.library[player];
      for (const id of awaiting.cards) { const at = library.indexOf(id); if (at >= 0) library.splice(at, 1); }
      library.unshift(...chosen);
      return events;
    }
    for (const id of chosen) moveOne(state, id, "graveyard", events, {owner: state.objects[id].owner});
    const rest = awaiting.cards.filter((id) => !chosen.includes(id) && state.objects[id]?.zone === "library");
    if (rest.length >= 2) {
      state.awaiting = {...awaiting, step: "order", cards: rest};
      return {events, again: true};
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
    /* "You may discard a card. If you do, ..." (Toph, batch 70): what this effect's controller discarded, remembered for the
       effects after it -- nothing, until they do. */
    if (params.remember) context.remembered = [];
    if (queue.length === 0) return false;
    state.awaiting = {
      kind: "effect-choice", effect: "discard", player: queue[0], remaining: queue.slice(1),
      count: params.count ?? 1, who: params.who, controller: context.controller,
      ...(params.remember ? {remembering: []} : {}),
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
    const gone = [];
    for (const id of chosen) {
      const card = cardRef(state, id);
      const owner = state.objects[id].owner;
      const discarded = moveObject(state, id, "graveyard", owner);
      gone.push(discarded);
      events.push(event("GameEventCardChangeZone", state, {
        card,
        becomes: discarded,
        from: {zoneType: "Hand", player: {playerId: awaiting.player}},
        to: {zoneType: "Graveyard", player: {playerId: owner}},
        discarded: true,
      }));
    }
    /* What the effect's controller discarded, as the cards it became. */
    const remembering = awaiting.remembering && awaiting.player === awaiting.controller ? [...awaiting.remembering, ...gone] : awaiting.remembering;

    /* The next player who still has to discard, if there is one. */
    const next = (awaiting.remaining ?? []).filter((player) => cardsIn(state, "hand", player).length > 0);
    if (next.length > 0) {
      state.awaiting = {...awaiting, player: next[0], remaining: next.slice(1), ...(remembering ? {remembering} : {})};
      return {events, again: true};
    }
    return remembering ? {events, remembered: remembering} : events;
  },
};

/* ---- modal ---- */

export const modal = {
  open(state, params, context) {
    const modes = params.modes ?? [];
    if (modes.length === 0) return false;
    const choose = Math.min(params.choose ?? 1, modes.length);
    state.awaiting = {
      /* Usually the controller's; "its controller may draw up to two cards" is that player's (`chooser`, bound to them). */
      kind: "effect-choice", effect: "modal", player: Number.isInteger(params.chooser) ? params.chooser : context.controller,
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
/* A player's counters, poison among them (CR 122.1f; batch 77 -- kept apart, as `poison`, for the state-based action). */
const playerCounters = (player) => ({...(player.counters ?? {}), ...(player.poison > 0 ? {poison: player.poison} : {})});
export const proliferate = {
  open(state, params, context) {
    const candidates = [
      ...state.zones.battlefield.filter((id) => hasCounters(state.objects[id].counters)).map((id) => ({id})),
      ...state.players.filter((p) => !p.lost && hasCounters(playerCounters(p))).map((p) => ({player: p.id})),
    ];
    if (candidates.length === 0) return false;
    state.awaiting = {kind: "effect-choice", effect: "proliferate", player: context.controller, candidates};
    return true;
  },

  choice(state, awaiting) {
    const live = awaiting.candidates;
    const countersOf = (c) => Object.entries((c.player !== undefined ? playerCounters(state.players[c.player]) : state.objects[c.id]?.counters) ?? {})
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
/* What a player may sacrifice: their own permanents the selector describes -- "another" read against the effect's source
   ("Korvold ... sacrifice another permanent"). */
const sacrificeable = (state, player, selector, source = null) => {
  const matches = compileSelector({...(selector ?? {}), what: "permanent", controller: "you"});
  return state.zones.battlefield.filter((id) => matches(state, id, {controller: player, source}));
};
/* "A creature with the greatest power among creatures that player controls" (Crackling Doom), "the greatest mana value"
   (Soul Shatter): of what may be sacrificed, those with the most -- a tie is the player's choice among them. */
const greatestBy = {
  power: (state, id) => characteristicsOf(state, id).power ?? 0,
  manaValue: (state, id) => (state.objects[id].manaCost ? manaValue(parseManaCost(state.objects[id].manaCost)) : 0),
};
const offeredToSacrifice = (state, player, awaiting) => {
  const mine = sacrificeable(state, player, awaiting.selector, awaiting.source ?? null);
  if (!awaiting.greatest || !mine.length) return mine;
  const value = greatestBy[awaiting.greatest], most = Math.max(...mine.map((id) => value(state, id)));
  return mine.filter((id) => value(state, id) === most);
};
/* "Chooses up to two creatures they control, then sacrifices the rest" (Archfiend of Depravity, `keep`): asked only of a
   player with more than that many. */
const mustSacrifice = (state, player, awaiting) => offeredToSacrifice(state, player, awaiting).length > (awaiting.keep ?? 0);
export const sacrifice = {
  open(state, params, context) {
    /* CR 101.4: the active player chooses first, then each other player in turn order. */
    const seats = state.players.length, apnap = (p) => (p - state.activePlayer + seats) % seats;
    const asked = {selector: params.selector ?? {}, source: context.source ?? null, ...(params.keep !== undefined ? {keep: params.keep} : {}), ...(params.greatest ? {greatest: params.greatest} : {})};
    /* "If you sacrificed a creature this way" (Rise of the Witch-king, batch 70): what this effect's controller sacrificed,
       remembered for the effects after it -- nothing, until they do. */
    if (params.remember) context.remembered = [];
    const queue = playersFor(state, params.who, context.controller).filter((p) => mustSacrifice(state, p, asked)).sort((a, b) => apnap(a) - apnap(b));
    if (queue.length === 0) return false;
    state.awaiting = {kind: "effect-choice", effect: "sacrifice", player: queue[0], remaining: queue.slice(1), count: params.count ?? 1, ...asked,
      ...(params.remember ? {remember: context.controller, remembering: []} : {})};
    return true;
  },

  choice(state, awaiting) {
    const mine = offeredToSacrifice(state, awaiting.player, awaiting);
    const option = (id, index) => ({index, label: state.objects[id].card, cardId: id, ...(state.objects[id].token ? {token: true} : {})});
    if (awaiting.keep !== undefined) {
      const keep = Math.min(awaiting.keep, mine.length);
      return {id: `sacrifice-keep:${awaiting.player}:${state.turn}`, title: `Choose up to ${keep} to keep; the rest are sacrificed`, mode: "many", min: 0, max: keep, options: mine.map(option)};
    }
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
    const mine = offeredToSacrifice(state, awaiting.player, awaiting);
    const chosen = (indices ?? []).map((i) => mine[i]).filter((id) => id !== undefined);
    if (awaiting.keep !== undefined && chosen.length > awaiting.keep) throw new Error("Invalid selection");
    /* Kept: the rest go. Otherwise: the ones chosen. */
    const gone = [];
    for (const id of awaiting.keep !== undefined ? mine.filter((id) => !chosen.includes(id)) : chosen) {
      const moved = sacrificeOne(state, id, events);
      if (moved !== null) gone.push(moved);
    }
    /* What the effect's controller sacrificed, as the objects it became (a token's until it ceases to exist, CR 704.5d). */
    const remembering = awaiting.remember === awaiting.player ? [...awaiting.remembering, ...gone] : awaiting.remembering;
    const next = (awaiting.remaining ?? []).filter((p) => mustSacrifice(state, p, awaiting));
    if (next.length > 0) {
      state.awaiting = {...awaiting, player: next[0], remaining: next.slice(1), ...(remembering ? {remembering} : {})};
      return {events, again: true};
    }
    return remembering ? {events, remembered: remembering} : events;
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
/* Ward's other costs (CR 702.21a): `life`, which a player can pay only if their total is at least that much (CR 119.4);
   `discard` a card, each in their hand its own option; `sacrifice` a permanent of theirs the selector describes, each its
   own option. With mana, all of it is paid or none. */
const noun = (selector) => (selector?.subtypes?.length ? `a ${selector.subtypes[0]}` : selector?.types?.length ? `a ${selector.types[0].toLowerCase()}` : "a permanent");
function costWords(awaiting) {
  const paid = [awaiting.amount > 0 ? `{${awaiting.amount}}` : null, awaiting.life > 0 ? `${awaiting.life} life` : null].filter(Boolean);
  const other = awaiting.discard ? "discard a card" : awaiting.sacrifice ? `sacrifice ${noun(awaiting.sacrifice)}` : null;
  return [other, paid.length ? `pay ${paid.join(" and ")}` : null].filter(Boolean).join(" and ") || `pay {${awaiting.amount}}`;
}
function payOptions(state, awaiting) {
  const {player} = awaiting, amount = awaiting.amount ?? 0, life = awaiting.life ?? 0;
  if (amount > 0 && !canPayGeneric(state, player, amount)) return [];
  if (life > state.players[player].life) return [];
  const paid = [amount > 0 ? `{${amount}}` : null, life > 0 ? `${life} life` : null].filter(Boolean).join(" and ");
  const also = paid ? ` and pay ${paid}` : "";
  if (awaiting.sacrifice) {
    const alternatives = Array.isArray(awaiting.sacrifice.anyOf) ? awaiting.sacrifice.anyOf : [awaiting.sacrifice];
    const matchers = alternatives.map((one) => compileSelector({...one, what: "permanent", controller: "you"}));
    return state.zones.battlefield.filter((id) => matchers.some((m) => m(state, id, {controller: player})))
      .map((id) => ({label: `Sacrifice ${state.objects[id].card}${also}`, pay: true, sacrifice: id, cardId: id}));
  }
  if (awaiting.discard) return cardsIn(state, "hand", player).map((id) => ({label: `Discard ${state.objects[id].card}${also}`, pay: true, discard: id, cardId: id}));
  return [{label: `Pay ${paid || `{${amount}}`}`, pay: true}];
}
export const unlessPays = {
  open(state, params, context) {
    const [payer] = playersFor(state, params.who, context.controller);
    if (payer === undefined) return false;
    /* "You may pay {4}. If you do, ..." (Mana Vault), mana alone, by a player who cannot pay it: no choice to make, and
       nothing happens. */
    if (params.ifPaid && !params.life && !params.discard && !params.sacrifice && !canPayGeneric(state, payer, Math.max(0, params.amount ?? 0))) return false;
    state.awaiting = {kind: "effect-choice", effect: "unlessPays", player: payer, amount: Math.max(0, params.amount ?? 0),
      ...(params.life ? {life: params.life} : {}), ...(params.discard ? {discard: params.discard} : {}), ...(params.sacrifice ? {sacrifice: structuredClone(params.sacrifice)} : {}),
      effects: structuredClone(params.effects ?? []), source: context.source ?? null,
      /* "You may pay {1}. If you do, ...": the effects when it is paid, not when it is not. */
      ...(params.ifPaid ? {ifPaid: true} : {})};
    return true;
  },
  choice(state, awaiting) {
    const source = awaiting.source !== null ? state.objects[awaiting.source]?.card : null;
    const pays = payOptions(state, awaiting).map((option, index) => ({index, ...option}));
    return {id: `unless:${awaiting.player}:${state.turn}:${awaiting.amount}`, title: `${source ? `${source}: ` : ""}${costWords(awaiting)}?`, mode: "one", min: 1, max: 1,
      options: [...pays, {index: pays.length, label: "Don't pay", pay: false}]};
  },
  apply(state, awaiting, indices) {
    const option = unlessPays.choice(state, awaiting).options[(indices ?? [])[0]];
    if (!option) throw new Error("Invalid selection");
    if (!option.pay) return awaiting.ifPaid ? [] : {events: [], splice: structuredClone(awaiting.effects)};
    const events = [];
    if ((awaiting.amount ?? 0) > 0) {
      const paid = payGeneric(state, awaiting.player, awaiting.amount);
      events.push(...(Array.isArray(paid) ? paid : paid?.events ?? []));
    }
    /* Paying life is losing it (CR 119.4, 119.3). */
    if ((awaiting.life ?? 0) > 0) events.push(...loseLife(state, {amount: awaiting.life, who: [awaiting.player]}, {controller: awaiting.player, source: awaiting.source}));
    if (option.discard !== undefined && state.objects[option.discard]) {
      if (moveOne(state, option.discard, "graveyard", events, {owner: awaiting.player}) !== null) events[events.length - 1].data.fields.discarded = true;
    }
    if (option.sacrifice !== undefined && state.objects[option.sacrifice]) sacrificeOne(state, option.sacrifice, events);
    return awaiting.ifPaid ? {events, splice: structuredClone(awaiting.effects)} : events;
  },
};

/* ---- chooseType (CR 205.3m): "choose a creature type" -- one of the creature types among the cards in the game, which is
   every one that could matter; what is chosen, the effects after it name as "$chosen" (resolution.mjs, script/bind.mjs). ---- */
export const creatureTypesInGame = (state) => [...new Set(Object.values(state.objects)
  .filter((o) => (o.types ?? []).some((t) => t === "Creature" || t === "Kindred")).flatMap((o) => o.subtypes ?? []))].sort();
export const chooseType = {
  open(state, params, context) {
    const types = creatureTypesInGame(state);
    if (!types.length) return false;
    state.awaiting = {kind: "effect-choice", effect: "chooseType", player: context.controller, types};
    return true;
  },
  choice(state, awaiting) {
    return {id: `chooseType:${awaiting.player}:${state.turn}`, title: "Choose a creature type", mode: "one", min: 1, max: 1,
      options: awaiting.types.map((label, index) => ({index, label}))};
  },
  apply(state, awaiting, indices) {
    const type = awaiting.types[(indices ?? [])[0]];
    if (type === undefined) throw new Error("Invalid selection");
    return {events: [], chosen: type};
  },
};

/* ---- copySpell (CR 707.10): "copy target instant or sorcery spell. You may choose new targets for the copy." ----

   `spells` are the spells copied, by their objects on the stack (a target, or "that card" -- the spell a trigger is
   about); `count` copies of each ("copy it for each other ..."), controlled by this ability's controller. The copies go
   on the stack at once, with the original's targets. `newTargets`: then, for each copy and each of its targets that has
   another legal choice, its controller keeps the target or chooses a new one (CR 707.10c) -- a question at a time. A
   copy is never its own target (CR 115.5). `except.nonLegendary`: "except it isn't legendary" (Double Major). The
   copies are made as the question opens, so what they did is in the resolution's events even when nothing is asked. */
const ordinal = (n) => ["first", "second", "third", "fourth"][n] ?? `#${n + 1}`;
function retargetOptions(state, question) {
  const entry = state.stack.find((e) => e.stackId === question.stackId);
  const spec = entry ? specsOf(state, entry)[question.index] : null;
  if (!entry || !spec) return null;
  const current = entry.targets[question.index] ?? null;
  const others = targetCandidates(state, spec, {controller: entry.playerId, source: entry.objectId})
    .filter((c) => !(c.kind === "object" && c.id === entry.objectId))
    .filter((c) => !(current && c.kind === current.kind && c.id === current.id));
  return {entry, current, others};
}
export const copySpell = {
  open(state, params, context) {
    const originals = (params.spells ?? []).map((id) => state.stack.find((e) => e.objectId === id)).filter(Boolean);
    const count = Math.max(0, params.count ?? 1);
    const events = [], questions = [];
    for (const original of originals) for (let n = 0; n < count; n += 1) {
      const copy = pushCopy(state, original, {controller: context.controller, nonLegendary: params.except?.nonLegendary === true});
      events.push(event("GameEventSpellCopied", state, {card: cardRef(state, copy.objectId), original: cardRef(state, original.objectId),
        playerId: context.controller, stackId: copy.stackId}));
      if (params.newTargets === true) copy.targets.forEach((_, index) => questions.push({stackId: copy.stackId, index}));
    }
    state.resolving?.events.push(...events);
    const asked = questions.filter((q) => (retargetOptions(state, q)?.others ?? []).length > 0);
    if (asked.length === 0) return false;
    state.awaiting = {kind: "effect-choice", effect: "copySpell", player: context.controller, questions: asked};
    return true;
  },
  choice(state, awaiting) {
    const question = awaiting.questions[0];
    const found = retargetOptions(state, question);
    const {entry, current, others} = found ?? {entry: null, current: null, others: []};
    const many = (entry ? specsOf(state, entry) : []).length > 1;
    return {
      id: `copySpell:${question.stackId}:${question.index}`,
      title: `Copy of ${entry?.name ?? "the spell"}: ${many ? `its ${ordinal(question.index)} target` : "a new target"}?`,
      mode: "one", min: 1, max: 1,
      /* A target that has since left (Sevinne's Reclamation's card, returned by the original) may be kept, and the copy will
         not resolve (CR 608.2b): it is said so, not left a blank name. */
      options: [{index: 0, label: `Keep ${current ? targetName(state, current) || "its target, now gone" : "no target"}`, keep: true},
        ...others.map((c, i) => ({index: i + 1, label: targetName(state, c), ...(c.kind === "object" ? {cardId: c.id} : {}), target: c}))],
    };
  },
  apply(state, awaiting, indices) {
    const option = copySpell.choice(state, awaiting).options[(indices ?? [])[0]];
    if (!option) throw new Error("Invalid selection");
    const [question, ...rest] = awaiting.questions;
    const events = [];
    if (!option.keep) {
      const entry = state.stack.find((e) => e.stackId === question.stackId);
      if (entry) entry.targets[question.index] = {kind: option.target.kind, id: option.target.id};
      /* The new target becomes the copy's target (ward, CR 702.21a). */
      if (entry && option.target.kind === "object") events.push(...becameTarget(state, entry, option.target.id));
    }
    if (rest.length === 0) return {events};
    awaiting.questions = rest;
    return {events, again: true};
  },
};

/* ---- changeTargets: "change the target of target spell with a single target" (Forge's ChangeTargets; CR 115.7) ----
   The spell it names, on the stack with one target (its own targeting asked for that: "with a single target"): this
   effect's controller chooses another target that spell could have -- by its own requirements, never itself -- and it becomes the spell's target. With no other, it keeps the one it
   has and nobody is asked. */
export const changeTargets = {
  open(state, params, context) {
    const entry = state.stack.find((e) => e.objectId !== null && (params.spells ?? []).includes(e.objectId));
    if (!entry) return false;
    const question = {stackId: entry.stackId, index: 0};
    if (!(retargetOptions(state, question)?.others ?? []).length) return false;
    state.awaiting = {kind: "effect-choice", effect: "changeTargets", player: context.controller, question};
    return true;
  },
  choice(state, awaiting) {
    const {entry, others} = retargetOptions(state, awaiting.question) ?? {entry: null, others: []};
    return {id: `changeTargets:${awaiting.question.stackId}`, title: `${entry?.name ?? "The spell"}: its new target`, mode: "one", min: 1, max: 1,
      options: others.map((c, i) => ({index: i, label: targetName(state, c), ...(c.kind === "object" ? {cardId: c.id} : {}), target: c}))};
  },
  apply(state, awaiting, indices) {
    const option = changeTargets.choice(state, awaiting).options[(indices ?? [])[0]];
    if (!option) throw new Error("Invalid selection");
    const entry = state.stack.find((e) => e.stackId === awaiting.question.stackId);
    const events = [];
    if (entry) {
      entry.targets[0] = {kind: option.target.kind, id: option.target.id};
      /* It becomes the spell's target (ward, CR 702.21a). */
      if (option.target.kind === "object") events.push(...becameTarget(state, entry, option.target.id));
    }
    return {events};
  },
};

/* ---- attackWhom: a creature put onto the battlefield attacking, with more than one defending player it could attack
   (CR 508.4): which one, its controller's choice as it enters -- a question for each, in the order they were made.
   Queued by what made them (effects/permanents.mjs, enterAttacking); never written in a card script. ---- */
export const attackWhom = {
  /* Queued only with two defending players or more, and asked at once: nothing happens between. */
  open(state, params) {
    state.awaiting = {kind: "effect-choice", effect: "attackWhom", player: params.player, tokens: [...params.tokens], players: defendingPlayers(state, params.player)};
    return true;
  },
  choice(state, awaiting) {
    const id = awaiting.tokens[0];
    return {id: `attackWhom:${id}`, title: `${state.objects[id].card} enters attacking: which player?`, mode: "one", min: 1, max: 1,
      options: awaiting.players.map((p, index) => ({index, label: state.players[p].name, playerId: p}))};
  },
  apply(state, awaiting, indices) {
    const option = attackWhom.choice(state, awaiting).options[(indices ?? [])[0]];
    if (!option) throw new Error("Invalid selection");
    const [id, ...rest] = awaiting.tokens;
    joinAttack(state, id, option.playerId);
    if (rest.length) { state.awaiting = {...awaiting, tokens: rest}; return {events: [], again: true}; }
    return {events: []};
  },
};

/* ---- enchantWhat: an Aura entering the battlefield without being cast, with more than one thing it could enchant
   (CR 303.4f; effects/permanents.mjs, enchantOnArrival): which, its controller's choice as it enters -- asked at once,
   nothing happening between. Queued by what put it there; never written in a card script. ---- */
export const enchantWhat = {
  open(state, params) {
    state.awaiting = {kind: "effect-choice", effect: "enchantWhat", player: params.player, aura: params.aura, hosts: [...params.hosts]};
    return true;
  },
  choice(state, awaiting) {
    return {id: `enchantWhat:${awaiting.aura}`, title: `${state.objects[awaiting.aura]?.card ?? "The Aura"} enters: what does it enchant?`, mode: "one", min: 1, max: 1,
      options: awaiting.hosts.map((id, index) => ({index, label: state.objects[id]?.card ?? "?", cardId: id}))};
  },
  apply(state, awaiting, indices) {
    const option = enchantWhat.choice(state, awaiting).options[(indices ?? [])[0]];
    if (!option) throw new Error("Invalid selection");
    attachTo(state, awaiting.aura, option.cardId);
    return {events: []};
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
    /* "A creature card from among them" (Lord of the Void): from what an earlier effect of this resolution moved there,
       face up -- so a card that fits must be chosen; only a search of a hidden zone may fail to find (CR 701.23b). */
    const among = params.among === "remembered";
    /* "Return ANOTHER permanent card" (Rise of the Witch-king, batch 70): not the one an earlier effect of this resolution
       remembered -- the creature sacrificed this way. */
    const except = params.except === "remembered" ? new Set(context.remembered ?? []) : null;
    const pool = (among ? (context.remembered ?? []).filter((id) => state.objects[id]?.zone === zone) : cardsIn(state, zone, player)).filter((id) => !except?.has(id));
    const cards = pool.filter((id) => matchers.some((m) => m(state, id, {controller: player, source: context.source})));
    /* From among what was looked at or moved (Risen Reef's "if it's a land card"), with nothing that fits: nothing to choose,
       and nobody is asked -- the cards are face up to the chooser, so there is no failing to find (CR 701.23b is a search's). */
    if (among && cards.length === 0) return false;
    const count = params.count ?? 1;
    const min = params.upTo || (!among && hasQuality(params.selector)) ? 0 : Math.min(count, cards.length);
    state.awaiting = {
      kind: "effect-choice", effect: "chooseCard", player, zone, cards, min, max: Math.min(count, cards.length),
      destinations: params.destinations ?? [{to: params.to ?? "hand", ...(params.tapped ? {tapped: true} : {})}],
      shuffle: params.shuffle === true, reveal: params.reveal === true, controller: params.controller === "you" ? context.controller : params.controller ?? null,
      /* "Untap that land" (Fabled Passage): what it found, for the effects after it (resolution.mjs). */
      ...(params.remember ? {remember: true} : {}),
      /* Sneak Attack: "That creature gains haste. Sacrifice the creature at the beginning of the next end step." */
      ...(params.gains || params.gainsUntilEndOfTurn || params.atEndStep ? {then: {gains: params.gains, gainsUntilEndOfTurn: params.gainsUntilEndOfTurn, atEndStep: params.atEndStep},
        source: context.source ?? null} : {}),
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
    const tops = [], arrivedHere = [], found = [];
    chosen.forEach((id, i) => {
      const where = awaiting.destinations[Math.min(i, awaiting.destinations.length - 1)];
      if (awaiting.reveal) events.push(event("GameEventCardRevealed", state, {card: cardRef(state, id), player: {playerId: player}}));
      if (where.to === "top") { tops.push(id); return; }
      const moved = moveOne(state, id, where.to, events, {owner: state.objects[id].owner, tapped: where.tapped === true});
      if (moved !== null && state.objects[moved]) found.push(moved);
      if (moved !== null && state.objects[moved] && where.to === "battlefield") {
        /* "Under your control": the searcher's, when the card is another player's own (it never is from a library). */
        if (awaiting.controller !== null && awaiting.controller !== undefined) state.objects[moved].controller = awaiting.controller;
        arrivedHere.push(moved);
      }
    });
    if (awaiting.then && arrivedHere.length) afterwards(state, arrivedHere, awaiting.then, {controller: player, source: awaiting.source ?? null});
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
    return awaiting.remember ? {events, remembered: [...found, ...tops]} : events;
  },
};

/* ---- play: "you may cast a spell with mana value 5 or less from your hand without paying its mana cost" (Forge's Play) ----

   As the effect resolves, its controller may cast one card (CR 608.2g): from their hand (`manaValueAtMost`, an amount --
   "X or less", "less than or equal to that damage"), their commander from the command zone (`from: "command"`),
   or the cards it names (`from: "targets"`): a card it targets in a graveyard, or what an earlier effect of this resolution
   moved (`targets: "remembered"` -- "exile the top card of your library; you may cast it without paying its mana cost"). `free`: without paying its mana cost -- a commander's tax still
   paid ("you still pay any additional costs", CR 903.8); `anyMana`: its mana cost, "and mana of any type can be spent" --
   so as much generic mana as its mana value. What is owed is paid as an "unless" cost is, from the pool and the player's
   plain mana sources (rules/mana.mjs, payGeneric); a card they could not pay for is not offered. Nothing to cast, and
   nobody is asked. The spell is cast (rules/actions.mjs, castNow) -- what watches casts sees it -- and goes on the stack
   above the resolving object. */
export const play = {
  open(state, params, context) {
    const player = context.controller;
    if (!state.players[player]) return false;
    const valueOf = (id) => (state.objects[id].manaCost ? manaValue(parseManaCost(state.objects[id].manaCost)) : 0);
    const owed = (id) => (params.free ? (state.objects[id].zone === "command" ? commanderTax(state, player, id) : 0) : params.anyMana ? valueOf(id) : null);
    const most = params.manaValueAtMost === undefined ? Infinity : amountOf(state, params.manaValueAtMost, context);
    const from = params.from ?? "hand";
    const pool = from === "hand" ? cardsIn(state, "hand", player)
      : from === "command" ? cardsIn(state, "command", player).filter((id) => state.objects[id].commander === true)
      : (params.targets ?? []).filter((id) => state.objects[id] && !["battlefield", "stack"].includes(state.objects[id].zone));
    const choices = pool.filter((id) => valueOf(id) <= most)
      .flatMap((id) => {
        const pay = owed(id);
        return pay === null || !canPayGeneric(state, player, pay) ? [] : castChoicesNow(state, player, id).map((action) => ({...action, owed: pay}));
      });
    if (!choices.length) return false;
    state.awaiting = {kind: "effect-choice", effect: "play", player, choices};
    return true;
  },
  choice(state, awaiting) {
    return {id: `play:${awaiting.player}:${state.turn}`, title: "Cast a spell?", mode: "one", min: 1, max: 1,
      options: [...awaiting.choices.map((c, index) => ({index, label: c.targetNames?.length ? `${c.label} → ${c.targetNames.join(", ")}` : c.label, cardId: c.objectId})),
        {index: awaiting.choices.length, label: "Don't cast"}]};
  },
  apply(state, awaiting, indices) {
    const index = (indices ?? [])[0];
    if (index === awaiting.choices.length) return {events: []};
    const chosen = awaiting.choices[index];
    if (!chosen) throw new Error("Invalid selection");
    const {owed, ...action} = chosen;
    const events = owed ? payGeneric(state, awaiting.player, owed) : [];
    events.push(...castNow(state, awaiting.player, action));
    return {events};
  },
};

export const ASKING = Object.freeze({scry, surveil, dig, discard, modal, chooseCard, proliferate, sacrifice, populate, unlessPays, copySpell, chooseType, play, changeTargets, attackWhom, enchantWhat});
