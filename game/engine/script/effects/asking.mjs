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
 * SCRY IS ASKED IN THE SHAPES THE BOARD DRAWS (CR 701.22a): put any number on the bottom IN ANY
 * ORDER and the rest on top IN ANY ORDER. It was once one `manipulate` ordering whose answer had to
 * carry `toBottom` beside the indices, and the board never sent it, so from the table "on the
 * bottom" could not be chosen at all. Now it is a pick-several (which go under) and then an order
 * for each end that holds two or more: every question one the board already draws as a pop-up.
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
import {proliferate as giveEachAnother, addCounters} from "./resources.mjs";
import {makeCopies, afterwards, joinAttack, defendingPlayers, attachTo, createToken, effectUntil} from "./permanents.mjs";
import {payGeneric, canPayGeneric, parseManaCost, manaValue, paymentUnits, paymentIsAChoice, paymentChoice, payWithUnits} from "../../rules/mana.mjs";
import {typesOf, characteristicsOf, everyCreatureTypeOf} from "../../rules/layers.mjs";
import {pushCopy, becameTarget, specsOf} from "../../rules/stack.mjs";
import {loseLife, DAMAGING, damageQuestion} from "./resources.mjs";
import {damageOrderChoice} from "../../rules/replacement.mjs";
import {targetCandidates, targetName} from "../bind.mjs";
import {commanderTax} from "../../rules/commander.mjs";
import {cantBeCountered} from "../../rules/statics.mjs";
import {amountOf} from "../amount.mjs";
import {castNow, castChoicesNow} from "../../rules/actions.mjs";

const cardOptions = (state, ids) => ids.map((id, index) => ({index, label: state.objects[id].card, cardId: id}));

/* ---- scry ---- */

/* SCRY N (CR 701.22a): look at the top N cards of your library, put any number of them on the bottom in any order and the
   rest on top in any order. Up to three questions, each one the board already draws as a pop-up: first which of them go
   on the bottom (pick any, none included); then -- only when two or more go under -- the order they go under in; then --
   only when two or more stay -- the order they go back on top in. Nothing moves until the last answer, and then every
   card looked at is put back together, as the one action the rule describes. A library with nothing in it scries
   nothing; a library with fewer than N cards shows what it has. */
const scryList = (awaiting) => (awaiting.step === "bottom-order" ? awaiting.bottom : awaiting.step === "top-order" ? awaiting.top : awaiting.cards);

/* The cards an order answer names, in the order named, and any it leaves out after them as they were: an answer that
   skips a card never takes it out of the library. */
function inOrder(list, indices) {
  const named = [];
  for (const index of indices ?? []) { const id = list[index]; if (id !== undefined && !named.includes(id)) named.push(id); }
  return [...named, ...list.filter((id) => !named.includes(id))];
}

/* The looked-at cards lifted out and put back: `top` first on top, `bottom` under everything, the last at the very
   bottom. A card no longer in the library is left where it is. */
function finishScry(state, awaiting, top, bottom) {
  const events = [];
  const player = awaiting.player;
  const library = state.zones.library[player];
  const here = (id) => library.includes(id);
  const [onTop, under] = [top.filter(here), bottom.filter(here)];
  for (const id of awaiting.cards) { const at = library.indexOf(id); if (at >= 0) library.splice(at, 1); }
  library.unshift(...onTop);
  library.push(...under);
  if (under.length > 0) {
    events.push(event("GameEventShuffle", state, {
      player: {playerId: player, name: state.players[player].name}, scryedToBottom: under.length,
    }));
  }
  return events;
}

export const scry = {
  open(state, params, context) {
    const looked = cardsIn(state, "library", context.controller).slice(0, params.count ?? 1);
    if (looked.length === 0) return false;
    state.awaiting = {kind: "effect-choice", effect: "scry", player: context.controller, cards: looked, step: "bottom", count: looked.length};
    return true;
  },

  choice(state, awaiting) {
    const list = scryList(awaiting);
    if (awaiting.step === "bottom-order") return {
      id: `scry-bottom-order:${list.join(",")}`,
      title: "Put those on the bottom of your library, the last you choose at the very bottom",
      mode: "order", min: list.length, max: list.length,
      options: cardOptions(state, list),
    };
    if (awaiting.step === "top-order") return {
      id: `scry-order:${list.join(",")}`,
      title: "Put the rest back on top of your library, the first you choose on top",
      mode: "order", min: list.length, max: list.length,
      options: cardOptions(state, list),
    };
    return {
      id: `scry:${list.join(",")}`,
      title: `Scry ${awaiting.count ?? list.length}: choose any to put on the bottom`,
      mode: "many", min: 0, max: list.length,
      options: cardOptions(state, list),
    };
  },

  /**
   * The first answer names the cards that go on the bottom; an order answer names its cards in order. An answer that
   * carries `extra.toBottom` is the one question scry used to ask -- `indices` every card in order, `toBottom` which of
   * them go under -- and is still read that way, so a caller written for it means what it meant.
   */
  apply(state, awaiting, indices, extra = {}) {
    const step = awaiting.step ?? "bottom";
    if (step === "bottom" && Array.isArray(extra?.toBottom)) {
      const order = inOrder(awaiting.cards, indices);
      const under = new Set(extra.toBottom.map((index) => awaiting.cards[index]));
      return finishScry(state, awaiting, order.filter((id) => !under.has(id)), order.filter((id) => under.has(id)));
    }
    let top = awaiting.top, bottom = awaiting.bottom;
    if (step === "bottom") {
      const chosen = new Set((indices ?? []).map((index) => awaiting.cards[index]));
      bottom = awaiting.cards.filter((id) => chosen.has(id));
      top = awaiting.cards.filter((id) => !chosen.has(id));
    } else if (step === "bottom-order") bottom = inOrder(awaiting.bottom, indices);
    else top = inOrder(awaiting.top, indices);

    const next = step === "bottom" && bottom.length >= 2 ? "bottom-order" : step !== "top-order" && top.length >= 2 ? "top-order" : null;
    if (next) {
      state.awaiting = {...awaiting, step: next, top, bottom};
      return {events: [], again: true};
    }
    return finishScry(state, awaiting, top, bottom);
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

/* ---- dig ----

   "Look at the top N cards of your library, put one into your hand and the rest on the bottom": the top `count` cards
   of the controller's library, `take` of them chosen to go `to` a zone. Batch 80, for "look at that many cards from the
   top of your library. You may exile a nonland card from among them. Put the rest on the bottom of your library in a
   random order. You may cast the exiled card" (The Key to the Vault): `selector`, what may be taken (the others are
   shown, not offered); `upTo`, "you may" -- none is a choice; `remember`, what was taken, for the effects after it;
   `random`, the rest in a random order from the game's stream. The cards are looked at, by their controller only. */
/* What dig does with the cards not taken: "the bottom" is a library move -- in a random order when the card says so, else
   in the order they were looked at; anywhere else is an ordinary zone change. */
function digRest(state, player, cards, {rest, random}, rng, events) {
  const left = cards.filter((id) => state.objects[id]);
  if (random && !rng) throw new Error("A random order needs the game's random stream");
  const order = random ? rng.shuffle(left) : left;
  if (rest !== "bottom") { for (const id of order) moveOne(state, id, rest, events, {owner: player}); return; }
  const library = state.zones.library[player];
  for (const id of order) {
    const at = library.indexOf(id);
    if (at >= 0) library.splice(at, 1);
    library.push(id);
  }
}
export const dig = {
  open(state, params, context, rng = null) {
    const looked = cardsIn(state, "library", context.controller).slice(0, params.count ?? 1);
    if (params.remember) context.remembered = [];
    if (looked.length === 0) return false;
    const fits = params.selector ? compileSelector({...params.selector, what: "card", zone: "library"}) : null;
    const offered = fits ? looked.filter((id) => fits(state, id, {controller: context.controller, source: context.source ?? null})) : looked;
    /* Nothing among them that may be taken: nobody is asked, and the rest go where they go. */
    if (offered.length === 0) {
      const events = [];
      digRest(state, context.controller, looked, {rest: params.rest ?? "bottom", random: params.random === true}, rng, events);
      return {events};
    }
    const take = Math.min(params.take ?? 1, offered.length);
    state.awaiting = {
      kind: "effect-choice", effect: "dig", player: context.controller, cards: looked, offered,
      take, min: params.upTo === true ? 0 : take,
      to: params.to ?? "hand", rest: params.rest ?? "bottom",
      ...(params.random === true ? {random: true} : {}), ...(params.remember ? {remember: true} : {}),
    };
    return true;
  },

  choice(state, awaiting) {
    const offered = awaiting.offered ?? awaiting.cards;
    return {
      id: `dig:${awaiting.cards.join(",")}`,
      title: `Choose ${awaiting.min === 0 ? "up to " : ""}${awaiting.take} to put into your ${awaiting.to}`,
      mode: awaiting.take === 1 && awaiting.min === 1 ? "one" : "many",
      min: awaiting.min ?? awaiting.take,
      max: awaiting.take,
      options: cardOptions(state, offered),
    };
  },

  apply(state, awaiting, indices, extra = {}, rng = null) {
    const events = [];
    const offered = awaiting.offered ?? awaiting.cards;
    const chosen = (indices ?? []).map((index) => offered[index]);
    if (chosen.some((id) => id === undefined) || new Set(chosen).size !== chosen.length || chosen.length < (awaiting.min ?? awaiting.take) || chosen.length > awaiting.take)
      throw new Error("Invalid selection");
    const taken = new Set(chosen), found = [];
    for (const id of awaiting.cards) {
      if (!taken.has(id)) continue;
      const moved = moveOne(state, id, awaiting.to, events, {owner: awaiting.player});
      if (moved !== null && state.objects[moved]) found.push(moved);
    }
    digRest(state, awaiting.player, awaiting.cards.filter((id) => !taken.has(id)), awaiting, rng, events);
    return awaiting.remember ? {events, remembered: found} : events;
  },
};

/* ---- discard ---- */

/* One card from a hand to its owner's graveyard, said as a discard (CR 701.9a) -- what "whenever you discard" reads. */
function discardOne(state, id, player, events) {
  const card = cardRef(state, id);
  const owner = state.objects[id].owner;
  const discarded = moveObject(state, id, "graveyard", owner);
  events.push(event("GameEventCardChangeZone", state, {
    card,
    becomes: discarded,
    from: {zoneType: "Hand", player: {playerId: player}},
    to: {zoneType: "Graveyard", player: {playerId: owner}},
    discarded: true,
  }));
  return discarded;
}

export const discard = {
  open(state, params, context, rng = null) {
    /* Each player who has to discard is asked separately, in turn order, about their own hand. */
    const queue = playersFor(state, params.who, context.controller)
      .filter((player) => cardsIn(state, "hand", player).length > 0);
    /* "You may discard a card. If you do, ..." (Toph, batch 70): what this effect's controller discarded, remembered for the
       effects after it -- nothing, until they do. */
    if (params.remember) context.remembered = [];
    if (queue.length === 0) return false;
    /* "Discard a card at random" (Gamble, batch 80; CR 701.9b): nobody chooses -- each card is picked from the hand by the
       game's random stream, and nobody is asked. */
    if (params.random === true) {
      if (!rng) throw new Error("A discard at random needs the game's random stream");
      const events = [];
      for (const player of queue)
        for (let n = 0; n < (params.count ?? 1) && cardsIn(state, "hand", player).length > 0; n += 1)
          discardOne(state, rng.pick(cardsIn(state, "hand", player)), player, events);
      return {events};
    }
    /* CR 101.4: the active player chooses first, then each other player in turn order -- and nobody's card moves until
       the last has chosen (apply). */
    const seats = state.players.length, apnap = (p) => (p - state.activePlayer + seats) % seats;
    const asked = [...queue].sort((a, b) => apnap(a) - apnap(b));
    state.awaiting = {
      kind: "effect-choice", effect: "discard", player: asked[0], remaining: asked.slice(1),
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
    /* CR 101.4: chosen now, discarded when the last player has chosen -- every player's at the same time. */
    const decided = [...(awaiting.decided ?? []), {player: awaiting.player, ids: chosen}];
    const next = (awaiting.remaining ?? []).filter((player) => cardsIn(state, "hand", player).length > 0);
    if (next.length > 0) {
      state.awaiting = {...awaiting, player: next[0], remaining: next.slice(1), decided};
      return {events, again: true};
    }
    /* What the effect's controller discarded, as the cards it became. */
    let remembering = awaiting.remembering;
    for (const {player, ids} of decided) {
      const gone = ids.map((id) => discardOne(state, id, player, events));
      if (remembering && player === awaiting.controller) remembering = [...remembering, ...gone];
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
    /* Kept: the rest go. Otherwise: the ones chosen. CR 101.4: chosen now, sacrificed when the last player has chosen --
       every player's at the same time, so nothing the first gave up is gone while the next decides. */
    const going = awaiting.keep !== undefined ? mine.filter((id) => !chosen.includes(id)) : chosen;
    const decided = [...(awaiting.decided ?? []), {player: awaiting.player, ids: going}];
    const next = (awaiting.remaining ?? []).filter((p) => mustSacrifice(state, p, awaiting));
    if (next.length > 0) {
      state.awaiting = {...awaiting, player: next[0], remaining: next.slice(1), decided};
      return {events, again: true};
    }
    /* What the effect's controller sacrificed, as the objects it became (a token's until it ceases to exist, CR 704.5d). */
    let remembering = awaiting.remembering;
    for (const {player, ids} of decided) {
      const gone = [];
      for (const id of ids) {
        const moved = sacrificeOne(state, id, events);
        if (moved !== null) gone.push(moved);
      }
      if (awaiting.remember === player) remembering = [...remembering, ...gone];
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

/* ---- amass (CR 701.47a): "amass Goblins 2" -- with no Army creature, a 0/0 black Goblin Army creature token is made
   first; then an Army creature its controller controls is chosen, gets the +1/+1 counters, and is a Goblin as well as what
   it was, for as long as it stays (CR 611.2a). Which Army is the player's choice when there are two or more (a changeling
   is one, CR 702.73a); with one, it is that one. "The amassed Army" (CR 701.47c) is the creature chosen, counters or not:
   remembered (`remember`) for the effects after it ("attach this Equipment to the amassed Army"). `count` may be counted. ---- */
const ARMY = compileSelector({what: "permanent", types: ["Creature"], subtypes: ["Army"], controller: "you"});
const armiesOf = (state, player) => state.zones.battlefield.filter((id) => ARMY(state, id, {controller: player}));
function amassOnto(state, army, params, player, source, events) {
  const count = Number.isInteger(params.count) ? params.count : 1;
  addCounters(state, army, "+1/+1", count, events);
  const current = [...typesOf(state, army), ...(state.objects[army].subtypes ?? [])];
  if (!current.includes(params.subtype) && !everyCreatureTypeOf(state, army))
    effectUntil(state, {id: `amass:${params.subtype}:${army}`, layer: 4, targets: [army], apply: {addTypes: [params.subtype]}, until: "ever"}, {controller: player, source});
}
export const amass = {
  open(state, params, context) {
    const player = context.controller;
    if (!state.players[player]) return false;
    const armies = armiesOf(state, player);
    if (armies.length > 1) {
      state.awaiting = {kind: "effect-choice", effect: "amass", player, armies, params: {subtype: params.subtype, count: params.count, remember: params.remember === true},
        source: context.source ?? null};
      return true;
    }
    /* None: the token is made first, and is then the one Army there is. */
    const events = armies.length === 0
      ? createToken(state, {token: {name: `${params.subtype} Army`, types: ["Creature"], subtypes: [params.subtype, "Army"], colors: ["B"], power: 0, toughness: 0}}, {controller: player, source: context.source})
      : [];
    const [army] = armiesOf(state, player);
    if (army !== undefined) amassOnto(state, army, params, player, context.source, events);
    if (params.remember) context.remembered = army === undefined ? [] : [army];
    return {events};
  },
  choice(state, awaiting) {
    return {id: `amass:${awaiting.player}:${state.turn}:${awaiting.armies.join(",")}`, title: `Amass ${awaiting.params.subtype}s ${awaiting.params.count ?? 1}: put the counters on which Army?`,
      mode: "one", min: 1, max: 1, options: awaiting.armies.map((id, index) => ({index, label: state.objects[id]?.card ?? "Army", cardId: id}))};
  },
  apply(state, awaiting, indices) {
    const chosen = awaiting.armies[(indices ?? [])[0]];
    if (chosen === undefined || !Array.isArray(indices) || indices.length !== 1) throw new Error("Invalid selection");
    const events = [];
    if (state.objects[chosen]?.zone === "battlefield") amassOnto(state, chosen, awaiting.params, awaiting.player, awaiting.source, events);
    return awaiting.params.remember ? {events, remembered: [chosen]} : {events};
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
    /* Having said they pay: which mana pays, when that is a choice (rules/mana.mjs, paymentUnits). */
    if (awaiting.paying) return paymentChoice(`unless-mana:${awaiting.player}:${state.turn}:${awaiting.amount}`, awaiting.amount, paymentUnits(state, awaiting.player));
    const source = awaiting.source !== null ? state.objects[awaiting.source]?.card : null;
    const pays = payOptions(state, awaiting).map((option, index) => ({index, ...option}));
    return {id: `unless:${awaiting.player}:${state.turn}:${awaiting.amount}`, title: `${source ? `${source}: ` : ""}${costWords(awaiting)}?`, mode: "one", min: 1, max: 1,
      options: [...pays, {index: pays.length, label: "Don't pay", pay: false}]};
  },
  apply(state, awaiting, indices) {
    /* The mana chosen (CR 605.3a), then the rest of what paying is. */
    if (awaiting.paying) {
      const events = payWithUnits(state, awaiting.player, paymentUnits(state, awaiting.player), indices, awaiting.amount);
      return unlessPaid(state, awaiting, awaiting.paying.option, events);
    }
    const option = unlessPays.choice(state, awaiting).options[(indices ?? [])[0]];
    if (!option) throw new Error("Invalid selection");
    if (!option.pay) return awaiting.ifPaid ? [] : {events: [], splice: structuredClone(awaiting.effects)};
    /* Which mana pays is the payer's: asked next when the ways to pay differ, paid at once when they do not. */
    if ((awaiting.amount ?? 0) > 0 && paymentIsAChoice(paymentUnits(state, awaiting.player), awaiting.amount)) {
      state.awaiting = {...awaiting, paying: {option}};
      return {events: [], again: true};
    }
    const events = [];
    if ((awaiting.amount ?? 0) > 0) {
      const paid = payGeneric(state, awaiting.player, awaiting.amount);
      events.push(...(Array.isArray(paid) ? paid : paid?.events ?? []));
    }
    return unlessPaid(state, awaiting, option, events);
  },
};
/* What paying an "unless" cost is besides its mana -- life, a discard, a sacrifice -- and what follows it. */
function unlessPaid(state, awaiting, option, events) {
  /* Paying life is losing it (CR 119.4, 119.3). */
  if ((awaiting.life ?? 0) > 0) events.push(...loseLife(state, {amount: awaiting.life, who: [awaiting.player]}, {controller: awaiting.player, source: awaiting.source}));
  if (option.discard !== undefined && state.objects[option.discard]) {
    if (moveOne(state, option.discard, "graveyard", events, {owner: awaiting.player}) !== null) events[events.length - 1].data.fields.discarded = true;
  }
  if (option.sacrifice !== undefined && state.objects[option.sacrifice]) sacrificeOne(state, option.sacrifice, events);
  return awaiting.ifPaid ? {events, splice: structuredClone(awaiting.effects)} : events;
}

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
  /* A counted target's list holding its one target (changeTargets): that one. */
  const was = entry.targets[question.index];
  const current = (Array.isArray(was) ? was[0] : was) ?? null;
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
      /* NAMED: a counted target ("up to two target creatures") keeps the original's list on the copy; choosing a new list
         for it is not asked yet. */
      if (params.newTargets === true) copy.targets.forEach((t, index) => { if (!Array.isArray(t)) questions.push({stackId: copy.stackId, index}); });
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
    /* "With a single target" (its own targeting asked that): the one there is -- a counted target's list holding one
       included, the others empty. */
    const index = entry.targets.findIndex((t) => (Array.isArray(t) ? t.length > 0 : Boolean(t)));
    if (index < 0) return false;
    const question = {stackId: entry.stackId, index};
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
      const index = awaiting.question.index ?? 0, chosen = {kind: option.target.kind, id: option.target.id};
      entry.targets[index] = Array.isArray(entry.targets[index]) ? [chosen] : chosen;
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
    /* "You may return another creature you control to its owner's hand" (Temur Sabertooth, batch 79): a permanent chosen
       as the effect resolves, untargeted -- no search (CR 701.23 is of a zone's cards), so one that fits must be chosen
       unless the card says "may" (`upTo`), and none, and nobody is asked. */
    const onField = zone === "battlefield";
    const matchers = alternatives.map((one) => compileSelector({...one, what: "card", zone}));
    /* "A creature card from among them" (Lord of the Void): from what an earlier effect of this resolution moved there,
       face up -- so a card that fits must be chosen; only a search of a hidden zone may fail to find (CR 701.23b). */
    const among = params.among === "remembered";
    /* "Return ANOTHER permanent card" (Rise of the Witch-king, batch 70): not the one an earlier effect of this resolution
       remembered -- the creature sacrificed this way. */
    const except = params.except === "remembered" ? new Set(context.remembered ?? []) : null;
    const pool = (among ? (context.remembered ?? []).filter((id) => state.objects[id]?.zone === zone) : onField ? [...state.zones.battlefield] : cardsIn(state, zone, player))
      .filter((id) => !except?.has(id));
    const cards = pool.filter((id) => matchers.some((m) => m(state, id, {controller: player, source: context.source})));
    /* From among what was looked at or moved (Risen Reef's "if it's a land card"), with nothing that fits: nothing to choose,
       and nobody is asked -- the cards are face up to the chooser, so there is no failing to find (CR 701.23b is a search's). */
    if ((among || onField) && cards.length === 0) return false;
    const count = params.count ?? 1;
    const min = params.upTo || (!among && !onField && hasQuality(params.selector)) ? 0 : Math.min(count, cards.length);
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
      /* A permanent is chosen, not searched for. */
      title: awaiting.zone === "battlefield" ? (awaiting.max > 1 ? "Choose permanents" : "Choose a permanent")
        : awaiting.max === 0 ? `Search your ${ZONE_WORD[awaiting.zone]}: nothing to find` : `Search your ${ZONE_WORD[awaiting.zone]}`,
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
    /* A commander chosen for its owner's hand or library may go to the command zone instead (CR 903.9b): Dream Stalker's
       "return a permanent you control to its owner's hand", Brainstorm's put-back. Its move is left to moveZone, after this
       answer, and its owner is asked first (script/resolution.mjs). One bound for the top takes every card chosen for the
       top with it, so the order chosen holds. */
    const whereOf = (i) => awaiting.destinations[Math.min(i, awaiting.destinations.length - 1)];
    const goingHome = (id, i) => {
      const to = whereOf(i).to, object = state.objects[id];
      if (object?.commander !== true) return false;
      return to === "hand" ? object.zone !== "hand" : (to === "top" || to === "library") && object.zone !== "library";
    };
    const homeTop = chosen.some((id, i) => whereOf(i).to === "top" && goingHome(id, i));
    const home = {hand: [], library: []};
    chosen.forEach((id, i) => {
      const where = whereOf(i);
      if (awaiting.reveal) events.push(event("GameEventCardRevealed", state, {card: cardRef(state, id), player: {playerId: player}}));
      if (where.to === "top" && homeTop) return;
      if (goingHome(id, i)) { home[where.to === "hand" ? "hand" : "library"].push(id); return; }
      /* On top: a card a search found is in the library already; one chosen from a hand ("then put two cards from your
         hand on top of your library", Brainstorm) is moved there first -- a new object (CR 400.7) -- and then put on top. */
      if (where.to === "top") {
        const there = state.objects[id].zone === "library" ? id : moveOne(state, id, "library", events, {owner: state.objects[id].owner});
        if (there !== null && state.objects[there]) tops.push(there);
        return;
      }
      /* "Put a -1/-1 counter on a creature you control" (blight, CR 701.68a): a permanent chosen where it is, and left there --
         remembered for what follows ("the blighted creature", 701.68c). */
      if (where.to === "stay") { found.push(id); return; }
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
    /* The moves a commander's owner is asked about first: each card put on top in turn, the last chosen first, so the first
       chosen ends on top. */
    const splice = [
      ...(homeTop ? [{effect: "moveZone", targets: chosen.filter((id, i) => whereOf(i).to === "top").reverse(), to: "library", top: true}] : []),
      ...(home.hand.length ? [{effect: "moveZone", targets: home.hand, to: "hand"}] : []),
      ...(home.library.length ? [{effect: "moveZone", targets: home.library, to: "library"}] : []),
    ];
    if (splice.length) return {events, splice, ...(awaiting.remember ? {remembered: [...found, ...tops]} : {})};
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
   above the resolving object.
   "You may cast ANY NUMBER of spells from among those cards" (Etali, Villainous Wealth; batch 79, `anyNumber`): asked
   again after each one, of what is left that can still be cast, until the player says "Don't cast" or nothing is left --
   each a choice of theirs, in the order they choose (CR 608.2g). Cast this way, each goes on the stack above the last. */
const playable = (state, player, pool, {most, free, anyMana}) => {
  const valueOf = (id) => (state.objects[id].manaCost ? manaValue(parseManaCost(state.objects[id].manaCost)) : 0);
  const owed = (id) => (free ? (state.objects[id].zone === "command" ? commanderTax(state, player, id) : 0) : anyMana ? valueOf(id) : null);
  /* A card cast a moment ago is on the stack as a new object (CR 400.7): its id here no longer names anything. */
  return pool.filter((id) => state.objects[id] && valueOf(id) <= most)
    .flatMap((id) => {
      const pay = owed(id);
      return pay === null || !canPayGeneric(state, player, pay) ? [] : castChoicesNow(state, player, id).map((action) => ({...action, owed: pay}));
    });
};
export const play = {
  open(state, params, context) {
    const player = context.controller;
    if (!state.players[player]) return false;
    const most = params.manaValueAtMost === undefined ? Infinity : amountOf(state, params.manaValueAtMost, context);
    const from = params.from ?? "hand";
    const pool = from === "hand" ? cardsIn(state, "hand", player)
      : from === "command" ? cardsIn(state, "command", player).filter((id) => state.objects[id].commander === true)
      : (params.targets ?? []).filter((id) => state.objects[id] && !["battlefield", "stack"].includes(state.objects[id].zone));
    const terms = {most, free: params.free === true, anyMana: params.anyMana === true};
    const choices = playable(state, player, pool, terms);
    if (!choices.length) return false;
    /* For `anyNumber`, what may still be cast and on what terms, to ask again (a number, not Infinity: state is JSON). */
    state.awaiting = {kind: "effect-choice", effect: "play", player, choices,
      ...(params.anyNumber === true ? {again: {pool, ...terms, most: Number.isFinite(most) ? most : null}, cast: 0} : {})};
    return true;
  },
  choice(state, awaiting) {
    /* What it still costs (a commander's tax, "for its mana value in any mana"): which mana pays, when that is a choice. */
    if (awaiting.paying) return paymentChoice(`play-mana:${awaiting.player}:${state.turn}:${awaiting.cast ?? 0}`, awaiting.paying.owed, paymentUnits(state, awaiting.player));
    return {id: `play:${awaiting.player}:${state.turn}${awaiting.again ? `:${awaiting.cast}` : ""}`, title: awaiting.cast ? "Cast another spell?" : "Cast a spell?", mode: "one", min: 1, max: 1,
      options: [...awaiting.choices.map((c, index) => ({index, label: c.targetNames?.length ? `${c.label} → ${c.targetNames.join(", ")}` : c.label, cardId: c.objectId})),
        {index: awaiting.choices.length, label: "Don't cast"}]};
  },
  apply(state, awaiting, indices) {
    let chosen, events;
    if (awaiting.paying) {
      chosen = awaiting.choices[awaiting.paying.index];
      events = payWithUnits(state, awaiting.player, paymentUnits(state, awaiting.player), indices, awaiting.paying.owed);
    } else {
      const index = (indices ?? [])[0];
      if (index === awaiting.choices.length) return {events: []};
      chosen = awaiting.choices[index];
      if (!chosen) throw new Error("Invalid selection");
      /* Which mana pays what it still costs is the player's when the ways differ (rules/mana.mjs, paymentUnits). */
      if (chosen.owed && paymentIsAChoice(paymentUnits(state, awaiting.player), chosen.owed)) {
        state.awaiting = {...awaiting, paying: {index, owed: chosen.owed}};
        return {events: [], again: true};
      }
      events = chosen.owed ? payGeneric(state, awaiting.player, chosen.owed) : [];
    }
    const action = {...chosen};
    delete action.owed;
    events.push(...castNow(state, awaiting.player, action));
    /* Any number: asked again, of what is still there to cast. */
    if (awaiting.again) {
      const {pool, most, free, anyMana} = awaiting.again;
      const choices = playable(state, awaiting.player, pool, {most: most ?? Infinity, free, anyMana});
      if (choices.length) {
        const next = {...awaiting, choices, cast: awaiting.cast + 1};
        delete next.paying;
        state.awaiting = next;
        return {events, again: true};
      }
    }
    return {events};
  },
};

/* ---- a commander going to its owner's hand or library (CR 903.9b) ----

   "If a commander would be put into its owner's hand or library from anywhere, its owner may put it into the command zone
   instead." A replacement, so it is asked BEFORE the move -- the card is never seen in the hand -- and of the OWNER. The
   resolution puts this question in front of a moveZone that would move a commander there (script/resolution.mjs): each
   owner in turn order from the active player (CR 101.4), and then the move happens, with the commanders whose owners said
   yes going to the command zone instead (effects/zones.mjs, `commanderHome`). Moved as a whole, so nothing moves before
   every owner has answered. A move other than moveZone (a cost that returns a permanent to its owner's hand) is named,
   not built. */
export function commandersGoingHome(state, params) {
  if (params.commandersAsked) return [];
  /* "Counter target spell. If that spell is countered this way, put it on top of its owner's library instead" (Memory
     Lapse): a commander spell, unless it can't be countered or would be exiled instead (CR 702.34a). */
  if (params.effect === "counterSpell") {
    if (params.to !== "top") return [];
    return (params.spells ?? []).filter((id) => {
      const entry = state.stack.find((e) => e.objectId === id);
      return state.objects[id]?.commander === true && entry && !entry.flashback && !entry.graveyardToExile && !cantBeCountered(state, id);
    });
  }
  if (!["hand", "library"].includes(params.to) || params.sacrifice === true || params.fromTop !== undefined) return [];
  return (params.targets ?? []).filter((id) => state.objects[id]?.commander === true && state.objects[id].zone !== params.to);
}
export const commanderHome = {
  open(state, params) {
    const seats = state.players.length, apnap = (id) => (state.objects[id].owner - (state.activePlayer ?? 0) + seats) % seats;
    const queue = [...params.commanders].sort((a, b) => apnap(a) - apnap(b));
    state.awaiting = {kind: "effect-choice", effect: "commanderHome", player: state.objects[queue[0]].owner, objectId: queue[0], remaining: queue.slice(1),
      home: [], move: params.move};
    return true;
  },
  choice(state, awaiting) {
    return {id: `commander-home:${state.turn}:${awaiting.objectId}`, title: `Put ${state.objects[awaiting.objectId]?.card ?? "your commander"} into the command zone instead?`,
      mode: "boolean", min: 1, max: 1,
      options: [{index: 0, label: "Put it into the command zone"}, {index: 1, label: `Let it go to your ${awaiting.move.to === "top" ? "library" : awaiting.move.to}`}]};
  },
  apply(state, awaiting, indices) {
    if (!Array.isArray(indices) || indices.length !== 1 || ![0, 1].includes(indices[0])) throw new Error("Answer yes or no");
    const home = indices[0] === 0 ? [...awaiting.home, awaiting.objectId] : awaiting.home;
    const [next, ...rest] = (awaiting.remaining ?? []).filter((id) => state.objects[id]);
    if (next !== undefined) {
      state.awaiting = {...awaiting, player: state.objects[next].owner, objectId: next, remaining: rest, home};
      return {events: [], again: true};
    }
    return {events: [], splice: [{...awaiting.move, commandersAsked: true, ...(home.length ? {commanderHome: home} : {})}]};
  },
};

/* ---- the order of the effects that change damage (CR 616.1) ----

   Two or more replacement effects would change one damage event, and the order changes how it ends: Torbran's "plus 2"
   and Fiery Emancipation's tripling, 3 to Maya -- 15 or 11. The player dealt it, or the controller of the permanent dealt
   it, chooses which applies first; asked BEFORE any of the effect's damage is dealt, a hit at a time, and then the effect
   is done with every answer (`damageOrders`, by hit), its hits dealt at once as before. The resolution puts this question
   in front of a damage effect that has one (script/resolution.mjs), and again with each answer given while another hit
   is still to be ordered; an order that ends the same either way is never asked (rules/replacement.mjs). */
export const orderDamage = {
  open(state, params, context, rng) {
    const question = damageQuestion(state, params.damage, context, params.answers);
    if (!question) return {events: DAMAGING[params.damage.effect](state, {...params.damage, damageOrders: params.answers}, context, rng)};
    state.awaiting = {kind: "effect-choice", effect: "orderDamage", player: question.player, key: question.key, proposal: question.proposal,
      options: question.options, answers: params.answers, damage: params.damage};
    return true;
  },
  choice(state, awaiting) {
    return damageOrderChoice(state, awaiting);
  },
  /* The effect itself again, with this answer added, where it stood in the resolution: asked once more while another of
     its hits is still to be ordered, and dealt once none is. */
  apply(state, awaiting, indices) {
    const chosen = Array.isArray(indices) && indices.length === 1 ? awaiting.options[indices[0]] : undefined;
    if (chosen === undefined) throw new Error("Invalid selection");
    const answers = {...awaiting.answers, [awaiting.key]: [...(awaiting.answers[awaiting.key] ?? []), chosen]};
    return {events: [], splice: [{...awaiting.damage, damageOrders: answers}]};
  },
};

export const ASKING = Object.freeze({scry, surveil, dig, discard, modal, chooseCard, proliferate, sacrifice, populate, amass, unlessPays, copySpell, chooseType, play, changeTargets, attackWhom, enchantWhat, commanderHome, orderDamage});
