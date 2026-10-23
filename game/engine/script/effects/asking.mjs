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

import {cardsIn, moveObject, addObject, valueCostOf, rememberExileLooker, usesThisTurn, recordUse, recordDiscard} from "../../state/index.mjs";
import {compileSelector, selectMatching} from "../filter.mjs";
import {event, cardRef, moveOne, playersFor, sacrificeOne, destructionQuestion, destructionChoice, dredgers, dredgeInstead, dredgeWords, draw as drawEffect} from "./zones.mjs";
import {proliferate as giveEachAnother, addCounters, putCounter, moveCounters, removeCounter} from "./resources.mjs";
import {makeCopies, afterwards, joinAttack, attackPlaces, attachTo, createToken, effectUntil, COPY_KEYS, gainControl, attach} from "./permanents.mjs";
import {payGeneric, canPayGeneric, parseManaCost, manaValue, paymentUnits, paymentIsAChoice, paymentChoice, payWithUnits, unlessPlans, planWords, payPlan} from "../../rules/mana.mjs";
import {typesOf, characteristicsOf, everyCreatureTypeOf, controllerOf, lastKnown, staticAbilities} from "../../rules/layers.mjs";
import {isLandType} from "../../keywords/types.mjs";
import {pushCopy, becameTarget, specsOf} from "../../rules/stack.mjs";
import {loseLife, gainLife, DAMAGING, damageQuestion, addMana} from "./resources.mjs";
import {damageOrderChoice} from "../../rules/replacement.mjs";
import {targetCandidates, targetName} from "../bind.mjs";
import {commanderTax} from "../../rules/commander.mjs";
import {cantBeCountered, counterOrderChoice, cantBeSacrificed, tokenOrderChoice, drawForbidden} from "../../rules/statics.mjs";
import {amountOf} from "../amount.mjs";
import {castNow, castChoicesNow, landChoicesNow, withFaceUp} from "../../rules/actions.mjs";

import {mergedOrderToAsk, mergedOrderChoice, finishMergedOrder} from "../../state/index.mjs";
import {mergePermanent} from "../../keywords/mutate.mjs";
import {ringTempts} from "../../keywords/ring.mjs";

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
  events.push(scried(state, awaiting, "scry"));
  return events;
}
/* That a player scried or surveilled, once it is done (CR 701.22a, 701.25a): "whenever you scry or surveil" (Proft,
   Consulting Detective; rules/trigger.mjs) -- and counted for the turn, "if you've scried or surveilled this turn"
   (Desperate Futurescribe; script/amount.mjs, scriedOrSurveilledThisTurn), cleared as a turn begins (rules/turn.mjs). */
function scried(state, awaiting, kind) {
  const player = state.players[awaiting.player];
  player.scriedThisTurn = (player.scriedThisTurn ?? 0) + 1;
  return event("GameEventScried", state, {player: {playerId: awaiting.player, name: player.name}, kind, count: awaiting.count ?? awaiting.cards.length});
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

/* ---- rearrangeTop (Forge's RearrangeTopOfLibrary): "look at the top three cards of your library, then put them back in any
   order" (Ponder, Sensei's Divining Top, Halimar Depths). `count` cards off the top of the library of the player `who` names
   (its controller's own unless it says), looked at by this effect's controller alone -- nothing is revealed -- and put back
   on top in the order that player chooses, the first chosen on top: one question, an order of them all. One card has no
   order to choose: it is looked at, and nobody is asked; none, and nothing happens. What the looker then knows is the top
   of that library as it now is (state.looks; projection.mjs). ---- */
function knowsTop(state, viewer, owner, ids) {
  state.looks = [...(state.looks ?? []).filter((l) => !(l.viewer === viewer && l.owner === owner)), {viewer, owner, ids: [...ids]}];
}
export const rearrangeTop = {
  open(state, params, context) {
    const [owner] = playersFor(state, params.who, context.controller);
    if (owner === undefined) return false;
    const looked = cardsIn(state, "library", owner).slice(0, params.count ?? 1);
    if (looked.length === 0) return false;
    if (looked.length === 1) { knowsTop(state, context.controller, owner, looked); return false; }
    state.awaiting = {kind: "effect-choice", effect: "rearrangeTop", player: context.controller, owner, cards: looked};
    return true;
  },
  choice(state, awaiting) {
    const whose = awaiting.owner === awaiting.player ? "your" : `${state.players[awaiting.owner]?.name ?? "that player"}'s`;
    return {id: `rearrangeTop:${awaiting.cards.join(",")}`, title: `Put them back on top of ${whose} library in any order, the first you choose on top`,
      mode: "order", min: awaiting.cards.length, max: awaiting.cards.length, options: cardOptions(state, awaiting.cards)};
  },
  /* The cards in the order named (inOrder: one an answer leaves out keeps its place after them), lifted out and put back on
     top together -- one still there, since a card no longer in the library is left where it is. */
  apply(state, awaiting, indices) {
    const library = state.zones.library[awaiting.owner];
    const back = inOrder(awaiting.cards, indices).filter((id) => library.includes(id));
    for (const id of back) library.splice(library.indexOf(id), 1);
    library.unshift(...back);
    knowsTop(state, awaiting.player, awaiting.owner, back);
    return {events: []};
  },
  /* The looker has left the game (CR 800.4a): the cards stay where they are, in the order they were. */
  left() {
    return [];
  },
};

/* ---- twoPiles (Forge's TwoPiles): "reveal the top five cards of your library. An opponent separates those cards into two
   piles. Put one pile into your hand and the other into your graveyard" (Fact or Fiction). The cards revealed (CR 701.20a);
   the opponent who separates them, chosen by this effect's controller when there is more than one (CR 102.3 makes each
   other player one); that opponent's pile, any of them, none or all (CR 700.3: a pile may be empty); the controller's
   pick of the two; and the piles moved, `chosen` and `rest` where they go. ---- */
const pileWords = (state, ids) => (ids.length ? ids.map((id) => state.objects[id].card).join(", ") : "no cards");
function pilesOf(awaiting) {
  const first = awaiting.cards.filter((id) => awaiting.pile.includes(id));
  return [first, awaiting.cards.filter((id) => !awaiting.pile.includes(id))];
}
export const twoPiles = {
  open(state, params, context) {
    const cards = cardsIn(state, "library", context.controller).slice(0, params.fromTop ?? 5);
    if (cards.length === 0) return false;
    const opponents = state.players.filter((p) => p.id !== context.controller && !p.lost).map((p) => p.id);
    if (opponents.length === 0) return false;
    const reveal = cards.map((id) => event("GameEventCardRevealed", state, {card: cardRef(state, id), player: {playerId: context.controller}}));
    state.resolving?.events.push(...reveal);
    state.awaiting = {kind: "effect-choice", effect: "twoPiles", controller: context.controller, cards, chosen: params.chosen ?? "hand", rest: params.rest ?? "graveyard",
      ...(opponents.length === 1 ? {player: opponents[0], step: "separate"} : {player: context.controller, step: "opponent", opponents})};
    return true;
  },
  choice(state, awaiting) {
    if (awaiting.step === "opponent") return {id: `piles-opponent:${awaiting.cards.join(",")}`, title: "Choose an opponent to separate the cards into two piles", mode: "one", min: 1, max: 1,
      options: awaiting.opponents.map((id, index) => ({index, label: state.players[id].name, playerId: id}))};
    if (awaiting.step === "separate") return {id: `piles-separate:${awaiting.cards.join(",")}`, title: "Separate these cards into two piles: choose the first pile", mode: "many", min: 0, max: awaiting.cards.length,
      options: cardOptions(state, awaiting.cards)};
    const [first, second] = pilesOf(awaiting);
    return {id: `piles-pick:${awaiting.cards.join(",")}`, title: `Choose a pile to put into your ${awaiting.chosen}`, mode: "one", min: 1, max: 1,
      options: [{index: 0, label: `Pile 1: ${pileWords(state, first)}`}, {index: 1, label: `Pile 2: ${pileWords(state, second)}`}]};
  },
  apply(state, awaiting, indices) {
    const [index] = indices ?? [];
    if (awaiting.step === "opponent") {
      const opponent = awaiting.opponents[index];
      if (opponent === undefined) throw new Error("Invalid selection");
      state.awaiting = {...awaiting, player: opponent, step: "separate"};
      return {events: [], again: true};
    }
    if (awaiting.step === "separate") {
      const pile = (indices ?? []).map((i) => awaiting.cards[i]).filter((id) => id !== undefined);
      state.awaiting = {...awaiting, player: awaiting.controller, step: "pick", pile};
      return {events: [], again: true};
    }
    if (index !== 0 && index !== 1) throw new Error("Invalid selection");
    const piles = pilesOf(awaiting), events = [];
    for (const [pile, to] of [[piles[index], awaiting.chosen], [piles[1 - index], awaiting.rest]])
      for (const id of pile) if (state.objects[id]?.zone === "library") moveOne(state, id, to, events, {owner: state.objects[id].owner});
    return events;
  },

  /* The opponent separating has left the game: another opponent separates the cards (CR 800.4g). */
  left(state, awaiting) {
    return {another: awaiting};
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
      events.push(scried(state, awaiting, "surveil"));
      return events;
    }
    for (const id of chosen) moveOne(state, id, "graveyard", events, {owner: state.objects[id].owner});
    const rest = awaiting.cards.filter((id) => !chosen.includes(id) && state.objects[id]?.zone === "library");
    if (rest.length >= 2) {
      state.awaiting = {...awaiting, step: "order", cards: rest};
      return {events, again: true};
    }
    events.push(scried(state, awaiting, "surveil"));
    return events;
  },
};

/* ---- dig ----

   "Look at the top N cards of your library, put one into your hand and the rest on the bottom": the top `count` cards
   of the controller's library, `take` of them chosen to go `to` a zone. Batch 80, for "look at that many cards from the
   top of your library. You may exile a nonland card from among them. Put the rest on the bottom of your library in a
   random order. You may cast the exiled card" (The Key to the Vault): `selector`, what may be taken (the others are
   shown, not offered); `upTo`, "you may" -- none is a choice; `remember`, what was taken, for the effects after it;
   `random`, the rest in a random order from the game's stream. The cards are looked at, by their controller only --
   unless they are revealed (CR 701.20a), shown to every player: `reveal: true`, "reveal the top four cards of your
   library" (Satyr Wayfinder, Mulch), every card it looks at, said in the journal and, while its controller chooses, in
   every seat's view of that library's top (projection.mjs, `looks`; gone once the dig is done); `reveal: "taken"`, "you
   may reveal a permanent card from among them and put it into your hand" (Boughside Wanderers), the cards taken alone,
   said as they are taken. */
const revealedEvents = (state, player, ids) => ids.map((id) => event("GameEventCardRevealed", state, {card: cardRef(state, id), player: {playerId: player}}));
/* The revealed cards' place in every seat's view, while the choice is open, and its end. */
function showRevealed(state, player, ids) {
  const seats = state.players.filter((p) => !p.lost).map((p) => p.id);
  state.looks = [...(state.looks ?? []), ...seats.map((viewer) => ({viewer, owner: player, ids: [...ids], revealed: true}))];
}
const unshowRevealed = (state, player) => { if (state.looks) state.looks = state.looks.filter((l) => !(l.revealed === true && l.owner === player)); };
/* What dig does with the cards not taken: "the bottom" is a library move -- in a random order when the card says so, else
   in the order given (the order its owner chose, digRestAsked below); anywhere else is an ordinary zone change. */
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
/* "THE REST ON THE BOTTOM OF YOUR LIBRARY IN ANY ORDER" (Dig Through Time, Growing Rites of Itlimoc; wave 4c, k2): two or more
   cards put on the bottom of a library at once go there in the order their owner chooses (CR 401.4) -- the looker, whose
   library it is -- one question, an order of them all, the first chosen highest. Never asked for one card, for "in a random
   order" (`random`), or for the rest put anywhere else. Asked after what was taken has moved; `found`, what the dig took,
   kept for "remember" until the order is answered. True when it asks. */
function digRestAsked(state, awaiting, cards, found) {
  const left = cards.filter((id) => state.objects[id]?.zone === "library");
  if ((awaiting.rest ?? "bottom") !== "bottom" || awaiting.random === true || left.length < 2) return false;
  state.awaiting = {kind: "effect-choice", effect: "dig", player: awaiting.player, step: "order", cards: left, rest: "bottom",
    ...(awaiting.remember ? {remember: true, found: [...found]} : {})};
  return true;
}
/* "Put up to one of them on top of your library" (Thassa's Oracle; `to: "top"`): the card taken stays in the library, lifted
   to its top -- no zone change -- before the rest go to the bottom. One card, so there is no order to choose. */
function digToTop(state, player, id) {
  const library = state.zones.library[player];
  const at = library.indexOf(id);
  if (at < 0) return null;
  library.splice(at, 1);
  library.unshift(id);
  return id;
}
/* "PUT ANY NUMBER OF NONLAND PERMANENT CARDS WITH TOTAL MANA VALUE 4 OR LESS FROM AMONG THEM ONTO THE BATTLEFIELD" (Ao, the Dawn
   Sky; `totalManaValueAtMost`): which cards is the looker's choice, made one card at a time -- each question offers only the
   cards that still fit what is left of the total (CR 202.3; an {X} card's mana value is its printed one with X as 0, 202.3e),
   and "No more" -- so no answer can break the total. The cards chosen move together once the last is chosen. */
const cardManaValue = (state, id) => (state.objects[id]?.manaCost ? manaValue(parseManaCost(state.objects[id].manaCost)) : 0);
const budgetLeft = (state, awaiting) => awaiting.offered.filter((id) => !awaiting.picked.includes(id) && cardManaValue(state, id) <= awaiting.budget);
/* What dig takes, moved: "exile one of them face down" (hideaway, CR 702.75a; `faceDown`), seen then by its controller alone
   (`lookers`, projection.mjs) -- and kept against its source for the ability linked to it (`link`, CR 607.2a: "put the
   exiled card into its owner's hand"), as moveZone's `link` keeps what it exiled. */
function digMoved(state, awaiting, chosen, events) {
  const taken = new Set(chosen), found = [];
  for (const id of awaiting.cards) {
    if (!taken.has(id)) continue;
    /* "Put all land cards revealed this way onto the battlefield tapped and put all creature cards revealed this way into your
       hand" (Zimone's Experiment; `toByType`): each to the first destination whose card types it has -- a land creature is a
       land card, and the lands come first. */
    const where = awaiting.toByType?.find((w) => w.types.some((type) => (state.objects[id].types ?? []).includes(type))) ?? {to: awaiting.to};
    if (where.to === "top") { if (digToTop(state, awaiting.player, id) !== null) found.push(id); continue; }
    const moved = moveOne(state, id, where.to, events, {owner: awaiting.player, ...(where.tapped === true ? {tapped: true} : {}),
      ...(awaiting.faceDown ? {faceDown: true, lookers: [awaiting.player], ...(awaiting.link !== undefined ? {exiledBy: awaiting.link} : {})} : {})});
    if (moved !== null && state.objects[moved]) found.push(moved);
  }
  if (awaiting.link !== undefined) {
    const links = (state.links ??= {});
    links[awaiting.link] = [...(links[awaiting.link] ?? []), ...found.filter((id) => state.objects[id]?.zone === "exile")];
    if (state.objects[awaiting.link]?.zone === "battlefield") rememberExileLooker(state, awaiting.link, controllerOf(state, awaiting.link));
  }
  return found;
}
function digTaken(state, awaiting, chosen, rng) {
  const events = digRevealing(state, awaiting, chosen);
  const found = digMoved(state, awaiting, chosen, events);
  if (digRestAsked(state, awaiting, awaiting.cards.filter((id) => !chosen.includes(id)), found)) return {events, again: true};
  digRest(state, awaiting.player, awaiting.cards.filter((id) => !chosen.includes(id)), awaiting, rng, events);
  return awaiting.remember ? {events, remembered: found} : events;
}
/* As the choice is answered: the revealed cards no longer shown in the seats' views (the dig is done with them), and the
   cards taken revealed, when that is what it reveals. */
function digRevealing(state, awaiting, chosen) {
  if (awaiting.revealed) unshowRevealed(state, awaiting.player);
  return awaiting.revealTaken ? revealedEvents(state, awaiting.player, chosen) : [];
}
export const dig = {
  open(state, params, context, rng = null) {
    const looked = cardsIn(state, "library", context.controller).slice(0, params.count ?? 1);
    if (params.remember) context.remembered = [];
    if (looked.length === 0) return false;
    const fits = params.selector ? compileSelector({...params.selector, what: "card", zone: "library"}) : null;
    const fitting = fits ? looked.filter((id) => fits(state, id, {controller: context.controller, source: context.source ?? null})) : looked;
    const budget = params.totalManaValueAtMost;
    const offered = budget === undefined ? fitting : fitting.filter((id) => cardManaValue(state, id) <= budget);
    /* "Reveal the top four": each card, revealed before anything is taken (CR 701.20a). */
    const revealed = params.reveal === true ? revealedEvents(state, context.controller, looked) : [];
    /* Nothing among them that may be taken: nobody is asked, and the rest go where they go. */
    if (offered.length === 0) {
      const events = [...revealed];
      /* Two or more of them to the bottom in any order: that order is still the looker's to choose (digRestAsked). */
      if (digRestAsked(state, {player: context.controller, rest: params.rest, random: params.random === true}, looked, [])) { state.resolving?.events.push(...events); return true; }
      digRest(state, context.controller, looked, {rest: params.rest ?? "bottom", random: params.random === true}, rng, events);
      return {events};
    }
    /* "REVEAL THE TOP X CARDS OF YOUR LIBRARY. PUT ALL LAND CARDS FROM AMONG THEM ONTO THE BATTLEFIELD TAPPED and the rest on
       the bottom of your library in a random order" (Animist's Awakening; `all`): every card the selector fits is taken --
       nobody chooses, so nobody is asked -- and what it took is remembered for the effects after it ("untap those lands"). */
    if (params.all === true) {
      const events = [...revealed];
      const taking = {player: context.controller, cards: looked, to: params.to ?? "hand", rest: params.rest ?? "bottom", random: params.random === true,
        ...(Array.isArray(params.toByType) ? {toByType: structuredClone(params.toByType)} : {})};
      const found = digMoved(state, taking, offered, events);
      if (params.remember) context.remembered = found;
      if (digRestAsked(state, taking, looked.filter((id) => !offered.includes(id)), found)) { state.resolving?.events.push(...events); return true; }
      digRest(state, context.controller, looked.filter((id) => !offered.includes(id)), taking, rng, events);
      return {events};
    }
    if (revealed.length) { state.resolving?.events.push(...revealed); showRevealed(state, context.controller, looked); }
    const take = Math.min(params.take ?? 1, offered.length);
    state.awaiting = {
      kind: "effect-choice", effect: "dig", player: context.controller, cards: looked, offered,
      ...(budget !== undefined ? {budget, picked: []} : {}),
      take, min: params.upTo === true ? 0 : take,
      to: params.to ?? "hand", rest: params.rest ?? "bottom",
      ...(revealed.length ? {revealed: true} : {}), ...(params.reveal === "taken" ? {revealTaken: true} : {}),
      ...(params.random === true ? {random: true} : {}), ...(params.remember ? {remember: true} : {}),
      ...(Array.isArray(params.toByType) ? {toByType: structuredClone(params.toByType)} : {}),
      ...(params.faceDown === true && (params.to ?? "hand") === "exile" ? {faceDown: true} : {}),
      /* Manifest dread (CR 701.62a, script/schema.mjs): the card taken put onto the battlefield face down, manifested (moveOne,
         CR 701.40a) -- a 2/2 with no text, which its controller may look at (CR 708.5) and turn face up if it is a creature card. */
      ...(params.manifest === true ? {faceDown: true, manifest: true} : {}),
      ...(params.link === true && context.source !== null && context.source !== undefined ? {link: context.source} : {}),
    };
    return true;
  },

  choice(state, awaiting) {
    /* The rest's order on the bottom (digRestAsked): all of them, the first chosen highest. */
    if (awaiting.step === "order") return {id: `dig-order:${awaiting.cards.join(",")}`, title: "Put the rest on the bottom of your library in any order, the first you choose highest",
      mode: "order", min: awaiting.cards.length, max: awaiting.cards.length, options: cardOptions(state, awaiting.cards)};
    const offered = awaiting.offered ?? awaiting.cards;
    if (awaiting.budget !== undefined) {
      const left = budgetLeft(state, awaiting);
      return {id: `dig:${awaiting.cards.join(",")}:${awaiting.picked.join(",")}`,
        title: `Choose a card to put onto the ${awaiting.to}: total mana value ${awaiting.budget} or less left${awaiting.picked.length ? `, ${awaiting.picked.map((id) => state.objects[id].card).join(", ")} chosen` : ""}`,
        mode: "one", min: 1, max: 1, options: [...cardOptions(state, left), {index: left.length, label: "No more"}]};
    }
    return {
      id: `dig:${awaiting.cards.join(",")}`,
      title: awaiting.toByType ? `Choose ${awaiting.min === 0 ? "up to " : ""}${awaiting.take} to reveal`
        : awaiting.to === "exile" ? `Choose ${awaiting.min === 0 ? "up to " : ""}${awaiting.take} to exile${awaiting.faceDown ? " face down" : ""}`
        : awaiting.manifest ? "Manifest dread: choose 1 to manifest; the other goes into your graveyard"
        : `Choose ${awaiting.min === 0 ? "up to " : ""}${awaiting.take} to put into your ${awaiting.to}`,
      mode: awaiting.take === 1 && awaiting.min === 1 ? "one" : "many",
      min: awaiting.min ?? awaiting.take,
      max: awaiting.take,
      options: cardOptions(state, offered),
    };
  },

  apply(state, awaiting, indices, extra = {}, rng = null) {
    /* The order answered (inOrder: one an answer leaves out keeps its place after them): to the bottom in that order, each
       still in the library -- and what the dig took, remembered now. */
    if (awaiting.step === "order") {
      if ((indices ?? []).some((i) => awaiting.cards[i] === undefined) || new Set(indices ?? []).size !== (indices ?? []).length) throw new Error("Invalid selection");
      const events = [];
      digRest(state, awaiting.player, inOrder(awaiting.cards, indices).filter((id) => state.objects[id]?.zone === "library"), {rest: "bottom", random: false}, rng, events);
      return awaiting.remember ? {events, remembered: (awaiting.found ?? []).filter((id) => state.objects[id])} : events;
    }
    if (awaiting.budget !== undefined) {
      const left = budgetLeft(state, awaiting);
      if ((indices ?? []).length !== 1 || !(indices[0] >= 0 && indices[0] <= left.length)) throw new Error("Invalid selection");
      if (indices[0] === left.length) return digTaken(state, awaiting, awaiting.picked, rng);
      const picked = [...awaiting.picked, left[indices[0]]];
      const next = {...awaiting, picked, budget: awaiting.budget - cardManaValue(state, left[indices[0]])};
      /* Nothing else fits what is left: the cards chosen go now, nobody asked again. */
      if (!budgetLeft(state, next).length) return digTaken(state, next, picked, rng);
      state.awaiting = next;
      return {events: [], again: true};
    }
    const offered = awaiting.offered ?? awaiting.cards;
    const chosen = (indices ?? []).map((index) => offered[index]);
    if (chosen.some((id) => id === undefined) || new Set(chosen).size !== chosen.length || chosen.length < (awaiting.min ?? awaiting.take) || chosen.length > awaiting.take)
      throw new Error("Invalid selection");
    const events = digRevealing(state, awaiting, chosen);
    const taken = new Set(chosen);
    const found = digMoved(state, awaiting, chosen, events);
    if (digRestAsked(state, awaiting, awaiting.cards.filter((id) => !taken.has(id)), found)) return {events, again: true};
    digRest(state, awaiting.player, awaiting.cards.filter((id) => !taken.has(id)), awaiting, rng, events);
    return awaiting.remember ? {events, remembered: found} : events;
  },
};

/* ---- discard ---- */

/* How many the player asked must discard, or sacrifice: the effect's count, or theirs alone (`counts`, perPlayer). */
const howMany = (awaiting) => (awaiting.counts ? awaiting.counts[awaiting.player] : awaiting.count);
/* "Each player ... sacrifices half the permanents they control" (Pox Plague; `perPlayer`): each player's count, counted with
   "that player" them (script/amount.mjs) -- every player's before anyone is asked or anything is done (CR 101.4, 608.2h). */
const countsFor = (state, params, players, context) => (params.perPlayer === true
  ? Object.fromEntries(players.map((player) => [player, amountOf(state, params.count, {...context, about: {...context.about, player}})])) : null);

/* One card from a hand to its owner's graveyard, said as a discard (CR 701.9a) -- what "whenever you discard" reads. */
function discardOne(state, id, player, events) {
  const card = cardRef(state, id);
  const owner = state.objects[id].owner;
  const discarded = moveObject(state, id, "graveyard", owner);
  recordDiscard(state, player);
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
    /* "Each player ... discards half the cards in their hand" (Pox Plague; `perPlayer`): how many, for each player (countsFor)
       -- none, and they are not asked. */
    const counts = countsFor(state, params, playersFor(state, params.who, context.controller), context);
    /* Each player who has to discard is asked separately, in turn order, about their own hand. */
    const queue = playersFor(state, params.who, context.controller)
      .filter((player) => cardsIn(state, "hand", player).length > 0 && (counts === null || counts[player] > 0));
    /* "You may discard a card. If you do, ..." (Toph, batch 70): what this effect's controller discarded, remembered for the
       effects after it -- nothing, until they do. */
    if (params.remember) context.remembered = [];
    if (queue.length === 0) return false;
    /* "Discard your hand" (Ajani Unrelenting): every card in it, so there is nothing to choose and nobody is asked. "Then
       draw cards equal to the number of cards discarded this way" (Borrowed Knowledge): `remember`, every card discarded, as
       the cards they became -- and whose hand each was, for "each player discards all the cards in their hand, then creates
       that many" (Awaken the Erstwhile; rememberedCount's `controlledBy`, script/amount.mjs). */
    if (params.all === true) {
      const events = [], gone = [], whose = {};
      for (const player of queue) for (const id of cardsIn(state, "hand", player)) {
        const discarded = discardOne(state, id, player, events);
        gone.push(discarded);
        whose[discarded] = player;
      }
      if (params.remember) { context.remembered = gone; context.rememberedControllers = whose; }
      return {events};
    }
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
    /* "TARGET OPPONENT REVEALS THEIR HAND. YOU CHOOSE A NONLAND CARD FROM IT. THAT PLAYER DISCARDS THAT CARD" (Render
       Speechless): the card chosen by this effect's controller (`chooser: "you"`, CR 701.9b) -- from that hand, revealed. */
    if (params.chooser === "you") {
      const outcome = chosenFromHand(state, {player: context.controller, count: params.count ?? 1, ...(params.selector ? {selector: params.selector} : {}),
        source: context.source ?? null, decided: []}, asked);
      if (!outcome.asked) return {events: outcome.events};
      state.resolving?.events.push(...outcome.events);
      return true;
    }
    state.awaiting = {
      kind: "effect-choice", effect: "discard", player: asked[0], remaining: asked.slice(1),
      /* Whose discards are remembered: this effect's controller's, or the player a connive is for (`rememberOf`, script/
         resolution.mjs), whose permanent the counter goes on -- or the one target player told to discard: "target player
         discards any number of cards, then draws that many cards" (Steal the Show) counts what that player discarded. */
      ...(counts === null ? {count: params.count ?? 1} : {counts}), ...(params.who !== undefined ? {who: params.who} : {}),
      controller: Number.isInteger(params.rememberOf) ? params.rememberOf : Array.isArray(params.who) && params.who.length === 1 ? params.who[0] : context.controller,
      ...(params.remember ? {remembering: []} : {}),
      /* "You may discard UP TO two cards. If you do, draw that many cards" (Fable of the Mirror-Breaker, chapter II): how many,
         from none to that many, is the discarder's to say (CR 701.9a, 701.9b); "that many" counts what they discarded
         (`remember`, then `rememberedCount`). "Discards ANY NUMBER of cards" (Steal the Show, `anyNumber`): from none to
         every card in that hand. */
      ...(params.upTo === true ? {upTo: true} : {}), ...(params.anyNumber === true ? {anyNumber: true} : {}),
    };
    return true;
  },

  choice(state, awaiting) {
    if (awaiting.from !== undefined) return chosenFromHandChoice(state, awaiting);
    const hand = cardsIn(state, "hand", awaiting.player);
    const upTo = awaiting.upTo === true || awaiting.anyNumber === true;
    const count = awaiting.anyNumber ? hand.length : Math.min(howMany(awaiting), hand.length);
    return {
      id: `discard:${awaiting.player}:${state.turn}`,
      title: awaiting.anyNumber ? "Discard any number of cards" : `Discard ${upTo ? "up to " : ""}${count} card${count === 1 ? "" : "s"}`,
      mode: count === 1 && !upTo ? "one" : "many",
      min: upTo ? 0 : count,
      max: count,
      options: cardOptions(state, hand),
    };
  },

  apply(state, awaiting, indices) {
    if (awaiting.from !== undefined) return chosenFromHandApply(state, awaiting, indices);
    const events = [];
    const hand = cardsIn(state, "hand", awaiting.player);
    /* Resolved to ids before anything moves, because each move makes a new object and rewrites the
       hand underneath the positions the player answered with. */
    const chosen = (indices ?? []).map((index) => hand[index]).filter((id) => id !== undefined);
    /* Each a card in that hand, once, and no more than it says -- fewer only when it says "up to" or "any number". */
    const most = awaiting.anyNumber ? hand.length : Math.min(howMany(awaiting), hand.length);
    if (new Set(chosen).size !== chosen.length || chosen.length > most || (!awaiting.upTo && !awaiting.anyNumber && chosen.length < most)) throw new Error("Invalid selection");
    /* CR 101.4: chosen now, discarded when the last player has chosen -- every player's at the same time. */
    const decided = [...(awaiting.decided ?? []), {player: awaiting.player, ids: chosen}];
    const next = (awaiting.remaining ?? []).filter((player) => cardsIn(state, "hand", player).length > 0);
    if (next.length > 0) {
      state.awaiting = {...awaiting, player: next[0], remaining: next.slice(1), decided};
      return {events, again: true};
    }
    return discardDecided(state, awaiting, decided, events);
  },

  /* LEFT THE GAME WHILE ASKED (CR 800.4a; script/resolution.mjs, answerDeparted): their hand left with them, so they
     discard nothing, and the next player is asked -- or, theirs the last answer, everyone's discards are made. The
     controller choosing from a revealed hand has left, and the spell or ability with them: nothing is discarded. */
  left(state, awaiting) {
    if (awaiting.from !== undefined) return [];
    return discard.apply(state, awaiting, []);
  },
};

/* What every player chose to discard, discarded at once (CR 101.4); and what the effect's controller discarded, as the cards
   it became. A player who chose and has since left the game discards nothing: their hand left with them (CR 800.4a). */
function discardDecided(state, awaiting, decided, events) {
  let remembering = awaiting.remembering;
  for (const {player, ids} of decided.filter((d) => !state.players[d.player].lost)) {
    const gone = ids.map((id) => discardOne(state, id, player, events));
    if (remembering && player === awaiting.controller) remembering = [...remembering, ...gone];
  }
  return remembering ? {events, remembered: remembering} : events;
}

/* A HAND REVEALED FOR ANOTHER PLAYER TO CHOOSE FROM (Render Speechless, Stinging Vitriol, Dai Li Indoctrination, Auntie's
   Sentence; CR 701.9b, 701.20a): each hand in turn (APNAP, CR 101.4), every card of it revealed -- said in the journal, and
   shown in every seat's view while its card is chosen (`handRevealed`, projection.mjs) -- and this effect's controller
   asked which of the cards `selector` fits ("a nonland card") that player discards, the others shown and not offered.
   None fits: the hand was still revealed, nothing is chosen from it, and the next is. Every card chosen is discarded, by
   its hand's player, once the last is (discardDecided). The first hand to choose from asked, or the discards made. */
function chosenFromHand(state, base, hands) {
  const events = [];
  for (const [n, from] of hands.entries()) {
    const cards = cardsIn(state, "hand", from);
    events.push(...revealedEvents(state, from, cards));
    const fits = base.selector ? compileSelector({...base.selector, what: "card", zone: "hand"}) : null;
    const offered = fits ? cards.filter((id) => fits(state, id, {controller: base.player, source: base.source})) : cards;
    if (offered.length === 0) continue;
    state.awaiting = {kind: "effect-choice", effect: "discard", ...base, from, cards, offered, remaining: hands.slice(n + 1), handRevealed: true};
    return {asked: true, events};
  }
  discardDecided(state, base, base.decided, events);
  return {events};
}
function chosenFromHandChoice(state, awaiting) {
  const count = Math.min(awaiting.count, awaiting.offered.length);
  return {
    id: `discard-from:${awaiting.from}:${state.turn}`,
    title: `${state.players[awaiting.from].name} revealed their hand: choose ${count === 1 ? "a card" : `${count} cards`} for them to discard`,
    mode: count === 1 ? "one" : "many", min: count, max: count,
    options: cardOptions(state, awaiting.offered),
  };
}
function chosenFromHandApply(state, awaiting, indices) {
  const chosen = (indices ?? []).map((index) => awaiting.offered[index]);
  if (chosen.some((id) => id === undefined) || new Set(chosen).size !== chosen.length || chosen.length !== Math.min(awaiting.count, awaiting.offered.length)) throw new Error("Invalid selection");
  const {from: _from, cards: _cards, offered: _offered, remaining, kind: _kind, effect: _effect, resolution: _resolution, handRevealed: _shown, ...base} = awaiting;
  const outcome = chosenFromHand(state, {...base, decided: [...awaiting.decided, {player: awaiting.from, ids: chosen}]}, remaining);
  return outcome.asked ? {events: outcome.events, again: true} : outcome.events;
}

/* ---- modal ---- */

/* "Do this only once each turn" (Tidus, Yuna's Guardian; cards/index.mjs, `onceEachTurn`): what this permanent's ability has
   done this turn, kept on the permanent as its uses are (state/index.mjs) -- so a new object may again (CR 400.7). */
const onceKey = (params, context) => (params.onceEachTurn !== undefined && Number.isInteger(context.source) ? `once:${params.onceEachTurn}` : null);
/* A CHOICE TO DRAW ITS CHOOSER CAN'T TAKE (Narset, Parter of Veils' opponents; CR 121.3, 121.2b): a mode that begins by having
   its chooser draw -- "you may draw a card", "you may draw a card. If you do, discard a card" -- when they can't draw that many
   more this turn (rules/statics.mjs, drawForbidden): "you may draw two cards" not even for their first. */
const drawRefused = (state, mode, chooser, context) => {
  const first = (mode.effects ?? [])[0];
  if (first?.effect !== "draw" || first.who !== undefined || chooser !== context.controller) return false;
  const count = first.count ?? 1;
  return drawForbidden(state, chooser, typeof count === "number" ? count : amountOf(state, count, context));
};
export const modal = {
  open(state, params, context) {
    const key = onceKey(params, context);
    /* Done once this turn: the mode that does it (`once`) is gone, and only "No" is left -- no choice, so nothing is asked. */
    const done = key !== null && usesThisTurn(state, context.source, key) > 0;
    const chooser = Number.isInteger(params.chooser) ? params.chooser : context.controller;
    /* And a draw its chooser can't choose: gone, and with only "No" left, nothing is asked. */
    const refused = (params.modes ?? []).some((mode) => drawRefused(state, mode, chooser, context));
    const modes = (params.modes ?? []).filter((mode) => !(done && mode.once === true) && !drawRefused(state, mode, chooser, context));
    if (modes.length === 0 || ((done || refused) && modes.every((mode) => !(mode.effects ?? []).length))) return false;
    const choose = Math.min(params.choose ?? 1, modes.length);
    state.awaiting = {
      /* Usually the controller's; "its controller may draw up to two cards" is that player's (`chooser`, bound to them). */
      kind: "effect-choice", effect: "modal", player: chooser,
      /* "EACH OPPONENT MAY ... FOR EACH OPPONENT WHO DOES" (Tempt with Vengeance's tempting offer; CR 207.2c, 101.4): a mode that
         says `did` is the player doing so, kept for the effects after it (script/amount.mjs, playersWhoDid) -- the player asked,
         `doer`, even when another chooses for one who has left the game (CR 800.4g; resolution.mjs, chooseInstead). */
      ...(modes.some((mode) => mode.did === true) ? {doer: chooser} : {}),
      modes: modes.map((mode) => ({text: mode.text ?? "", effects: structuredClone(mode.effects ?? []), ...(mode.once === true ? {once: true} : {}), ...(mode.did === true ? {did: true} : {})})),
      choose,
      /* A "you may" asks in the card's own words (cards/index.mjs): its sentence, then Yes or No. */
      ...(params.title ? {title: String(params.title)} : {}),
      ...(key !== null ? {onceOf: {source: context.source, key}} : {}),
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
    /* Taken: done once this turn ("do this only once each turn"). */
    if (awaiting.onceOf && chosen.some((mode) => mode.once === true)) recordUse(state, awaiting.onceOf.source, awaiting.onceOf.key);
    /* Done by the player asked, if they are still in the game: one who has left does nothing (CR 800.4b). */
    const did = chosen.some((mode) => mode.did === true) && Number.isInteger(awaiting.doer) && !state.players[awaiting.doer]?.lost;
    return {events: [], splice: chosen.flatMap((mode) => mode.effects), ...(did ? {did: awaiting.doer} : {})};
  },

  /* Its chooser has left the game ("target opponent may draw a card", Tataru Taru): a choice other than paying, so another
     player makes it (CR 800.4g). */
  left(state, awaiting) {
    return {another: awaiting};
  },
};

/* ---- proliferate (CR 701.34a) ---- */

/* "Choose any number of permanents and/or players, then give each another counter of each kind already there." Asked
   of the ability's controller: one option per permanent and per player that has a counter, any number of them. */
const hasCounters = (counters) => Object.values(counters ?? {}).some((n) => n > 0);
/* A player's counters, poison among them (CR 122.1f; batch 77 -- kept apart, as `poison`, for the state-based action). */
const playerCounters = (player) => ({...(player.counters ?? {}), ...(player.poison > 0 ? {poison: player.poison} : {})});
/* That a player proliferated, once it is done (CR 701.34a): "whenever you proliferate" (Ezuri, Stalker of Spheres;
   rules/trigger.mjs) -- choosing none is proliferating too, "any number" being none as well. */
const proliferated = (state, player) => event("GameEventProliferate", state, {player: {playerId: player, name: state.players[player].name}});
export const proliferate = {
  open(state, params, context) {
    const candidates = [
      ...state.zones.battlefield.filter((id) => hasCounters(state.objects[id].counters)).map((id) => ({id})),
      ...state.players.filter((p) => !p.lost && hasCounters(playerCounters(p))).map((p) => ({player: p.id})),
    ];
    /* Nothing with a counter: nothing to choose, and nobody is asked -- but the player has proliferated. */
    if (candidates.length === 0) return {events: [proliferated(state, context.controller)]};
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
    return [...giveEachAnother(state, {chosen}, {controller: awaiting.player}), proliferated(state, awaiting.player)];
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
  /* Never one that can't be sacrificed (Alexios; rules/statics.mjs): it is not theirs to choose. */
  return state.zones.battlefield.filter((id) => matches(state, id, {controller: player, source}) && !cantBeSacrificed(state, id));
};
/* "A creature with the greatest power among creatures that player controls" (Crackling Doom), "the greatest mana value"
   (Soul Shatter): of what may be sacrificed, those with the most -- a tie is the player's choice among them. */
const greatestBy = {
  power: (state, id) => characteristicsOf(state, id).power ?? 0,
  /* A transformed permanent's is its front face's (CR 202.3b). */
  manaValue: (state, id) => (valueCostOf(state.objects[id]) ? manaValue(parseManaCost(valueCostOf(state.objects[id]))) : 0),
};
/* "Target opponent exiles a creature or planeswalker they control with the greatest mana value among creatures and
   planeswalkers they control" (End of the Hunt; chooseCard's `greatest`, on the battlefield -- script/schema.mjs): of the
   permanents that fit, those with the most -- a tie the chooser's to break (CR 608.2d), as a sacrifice's is. */
const greatestOf = (state, greatest, ids) => {
  if (!greatest) return ids;
  const value = greatestBy[greatest], most = Math.max(...ids.map((id) => value(state, id)));
  return ids.filter((id) => value(state, id) === most);
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
/* "EACH PLAYER PUTS A VOW COUNTER ON A CREATURE THEY CONTROL AND SACRIFICES THE REST" (Promise of Loyalty): `keep` with
   `keepExactly` -- a creature, not "up to" one, so one must be chosen by a player who has any -- `keptCounter`, a counter put
   on each kept one, and `rememberKept`, every player's kept ones for the effects after it ("each of those creatures"). A
   player with no more than that many keeps them all and is not asked; the counters go on first, then every sacrifice at
   once (CR 101.4, 608.2c). */
const keeping = (params) => params.keepExactly === true || params.keptCounter !== undefined || params.rememberKept === true;
/* "EACH PLAYER CHOOSES ANY NUMBER OF CREATURES THEY CONTROL WITH TOTAL POWER 4 OR LESS, THEN SACRIFICES ALL OTHER CREATURES
   THEY CONTROL" (Slaughter the Strong; `keepPowerAtMost`): asked of each player with any creature -- keeping fewer is theirs
   to choose too -- in turn order from the active player (CR 101.4), their powers read as they choose (through the layers),
   the total held to the most (`budget` on the question, for whoever answers it); then every player's rest sacrificed at once. */
const keepsChosen = (awaiting) => awaiting.keep !== undefined || awaiting.keepPowerAtMost !== undefined;
const powerOf = (state, id) => characteristicsOf(state, id).power ?? 0;
/* "FOR EACH PLAYER, YOU CHOOSE FROM AMONG THE PERMANENTS THAT PLAYER CONTROLS AN ARTIFACT, A CREATURE, AN ENCHANTMENT, AND A
   PLANESWALKER. THEN EACH PLAYER SACRIFICES ALL OTHER NONLAND PERMANENTS THEY CONTROL" (Tragic Arrogance; `keepTypes`): the
   effect's controller makes every choice (CR 608.2d), player by player in turn order from the active player and type by
   type in the card's order -- one permanent of that type that player controls, which must be chosen if there is one, and
   may be the one already chosen for another type (an artifact creature). Where only one could be, it is kept without
   asking, the rules leaving no choice. Then every player sacrifices at once the rest the selector describes (CR 608.2c). */
const keepCandidates = (state, player, type) => state.zones.battlefield.filter((id) => controllerOf(state, id) === player && typesOf(state, id).includes(type));
function nextKeepType(state, awaiting) {
  const kept = structuredClone(awaiting.kept);
  let at = awaiting.at;
  for (; at < awaiting.steps.length; at += 1) {
    const {player, type} = awaiting.steps[at];
    const candidates = keepCandidates(state, player, type);
    if (candidates.length > 1) break;
    if (candidates.length === 1) kept[player] = [...new Set([...(kept[player] ?? []), candidates[0]])];
  }
  return {...awaiting, kept, at};
}
function sacrificeUnkept(state, awaiting) {
  const events = [];
  const going = awaiting.everyone.flatMap((player) => sacrificeable(state, player, awaiting.selector, awaiting.source).filter((id) => !(awaiting.kept[player] ?? []).includes(id)));
  for (const id of going) sacrificeOne(state, id, events);
  return events;
}
function finishKeeping(state, awaiting, decided, events) {
  const kept = [];
  for (const player of awaiting.everyone) {
    const mine = offeredToSacrifice(state, player, awaiting);
    const chosen = decided.find((d) => d.player === player);
    for (const id of chosen ? chosen.kept : mine) kept.push(id);
  }
  if (awaiting.keptCounter) for (const id of kept) if (state.objects[id]) addCounters(state, id, awaiting.keptCounter, 1, events);
  for (const {ids} of decided) for (const id of ids) sacrificeOne(state, id, events);
  return awaiting.rememberKept ? {events, remembered: kept.filter((id) => state.objects[id])} : events;
}
export const sacrifice = {
  open(state, params, context) {
    /* CR 101.4: the active player chooses first, then each other player in turn order. */
    const seats = state.players.length, apnap = (p) => (p - state.activePlayer + seats) % seats;
    const asked = {selector: params.selector ?? {}, source: context.source ?? null, ...(params.keep !== undefined ? {keep: params.keep} : {}), ...(params.greatest ? {greatest: params.greatest} : {}),
      ...(params.keepExactly === true ? {keepExactly: true} : {}), ...(params.keptCounter !== undefined ? {keptCounter: params.keptCounter} : {}),
      ...(params.rememberKept === true ? {rememberKept: true} : {})};
    /* "If you sacrificed a creature this way" (Rise of the Witch-king, batch 70): what this effect's controller sacrificed,
       remembered for the effects after it -- nothing, until they do. */
    if (params.remember || params.rememberKept) context.remembered = [];
    const everyone = playersFor(state, params.who, context.controller).sort((a, b) => apnap(a) - apnap(b));
    if (params.keepPowerAtMost !== undefined) asked.keepPowerAtMost = params.keepPowerAtMost;
    /* The effect's controller chooses what each player keeps, by type (Tragic Arrogance). */
    if (Array.isArray(params.keepTypes)) {
      const begun = nextKeepType(state, {kind: "effect-choice", effect: "sacrifice", player: context.controller, selector: asked.selector, source: asked.source,
        keepTypes: [...params.keepTypes], everyone, steps: everyone.flatMap((player) => params.keepTypes.map((type) => ({player, type}))), at: 0, kept: {}});
      if (begun.at >= begun.steps.length) return {events: sacrificeUnkept(state, begun)};
      state.awaiting = begun;
      return true;
    }
    /* Half the permanents they control (Pox Plague): each player's own count (countsFor) -- none, and they are not asked. */
    const counts = countsFor(state, params, everyone, context);
    const queue = everyone.filter((p) => mustSacrifice(state, p, asked) && (counts === null || counts[p] > 0));
    if (keeping(params) && params.keep !== undefined) asked.everyone = everyone;
    /* "EACH OPPONENT MAY SACRIFICE A PERMANENT OF THEIR CHOICE THAT SHARES A CARD TYPE WITH IT. FOR EACH OPPONENT WHO DOESN'T,
       THAT PLAYER LOSES 2 LIFE AND YOU DRAW A CARD" (Braids, Arisen Nightmare): `optional`, each player named may sacrifice
       none -- asked in turn order from the active player as any sacrifice is (CR 101.4), the sacrifices made together once
       the last has chosen -- and `ifNot`, what follows for each of them who sacrifices nothing, a player with nothing to
       sacrifice among them, "that player" each in turn order (unrefused, below). */
    if (params.optional === true) Object.assign(asked, {optional: true, everyone, ...(Array.isArray(params.ifNot) ? {ifNot: structuredClone(params.ifNot)} : {})});
    /* "EACH PLAYER SACRIFICES A CREATURE OR PLANESWALKER OF THEIR CHOICE. EACH PLAYER WHO CAN'T DISCARDS A CARD" (Plaguecrafter):
       a sacrifice that must be made, and `ifNot` what follows for each player named who sacrificed nothing -- only one with
       nothing they could sacrifice -- "that player" each in turn order (unrefused, below), once every sacrifice is made. */
    else if (Array.isArray(params.ifNot)) Object.assign(asked, {ifNot: structuredClone(params.ifNot), named: everyone});
    if (queue.length === 0) {
      if (asked.optional || asked.named) return {events: [], splice: unrefused(state, asked, [])};
      /* Nobody has a choice to make, and what the keeping does is still done: each keeps all they have. */
      if (!asked.everyone) return false;
      const events = [];
      const outcome = finishKeeping(state, asked, [], events);
      if (asked.rememberKept) context.remembered = outcome.remembered;
      return {events};
    }
    state.awaiting = {kind: "effect-choice", effect: "sacrifice", player: queue[0], remaining: queue.slice(1), ...(counts === null ? {count: params.count ?? 1} : {counts}), ...asked,
      ...(params.remember ? {remember: context.controller, remembering: []} : {})};
    return true;
  },

  choice(state, awaiting) {
    if (awaiting.keepTypes) {
      const {player, type} = awaiting.steps[awaiting.at];
      const source = awaiting.source !== null ? state.objects[awaiting.source]?.card : null;
      const noun = `${["Artifact", "Enchantment"].includes(type) ? "an" : "a"} ${type.toLowerCase()}`;
      return {id: `sacrifice-keep-type:${player}:${type}:${state.turn}`, title: `${source ? `${source}: ` : ""}choose ${noun} ${state.players[player].name} keeps`, mode: "one", min: 1, max: 1,
        options: keepCandidates(state, player, type).map((id, index) => ({index, label: state.objects[id].card, cardId: id, keeper: player}))};
    }
    const mine = offeredToSacrifice(state, awaiting.player, awaiting);
    const option = (id, index) => ({index, label: state.objects[id].card, cardId: id, ...(state.objects[id].token ? {token: true} : {})});
    if (awaiting.keepPowerAtMost !== undefined) return {id: `sacrifice-keep:${awaiting.player}:${state.turn}`,
      title: `Choose any number to keep with total power ${awaiting.keepPowerAtMost} or less; the rest are sacrificed`, mode: "many", min: 0, max: mine.length,
      budget: {by: "power", most: awaiting.keepPowerAtMost}, options: mine.map((id, index) => ({...option(id, index), power: powerOf(state, id)}))};
    if (awaiting.keep !== undefined) {
      const keep = Math.min(awaiting.keep, mine.length);
      if (awaiting.keepExactly) return {id: `sacrifice-keep:${awaiting.player}:${state.turn}`,
        title: `Choose ${keep === 1 ? "a creature" : `${keep}`} to keep${awaiting.keptCounter ? ` with a ${awaiting.keptCounter} counter` : ""}; the rest are sacrificed`,
        mode: keep === 1 ? "one" : "many", min: keep, max: keep, options: mine.map(option)};
      return {id: `sacrifice-keep:${awaiting.player}:${state.turn}`, title: `Choose up to ${keep} to keep; the rest are sacrificed`, mode: "many", min: 0, max: keep, options: mine.map(option)};
    }
    const count = Math.min(howMany(awaiting), mine.length);
    return {
      id: `sacrifice:${awaiting.player}:${state.turn}`,
      title: `${awaiting.optional ? "You may sacrifice" : "Sacrifice"} ${count === 1 ? "a permanent" : `${count} permanents`}`,
      /* "May sacrifice": none of them is an answer too. */
      mode: count === 1 && !awaiting.optional ? "one" : "many",
      min: awaiting.optional ? 0 : count,
      max: count,
      /* A token said so: it is public (CR 111.1), and the cheapest thing to give up. */
      options: mine.map((id, index) => ({index, label: state.objects[id].card, cardId: id, ...(state.objects[id].token ? {token: true} : {})})),
    };
  },

  apply(state, awaiting, indices) {
    if (awaiting.keepTypes) {
      const {player, type} = awaiting.steps[awaiting.at];
      const kept = keepCandidates(state, player, type)[(indices ?? [])[0]];
      if ((indices ?? []).length !== 1 || kept === undefined) throw new Error("Invalid selection");
      const next = nextKeepType(state, {...awaiting, kept: {...awaiting.kept, [player]: [...new Set([...(awaiting.kept[player] ?? []), kept])]}, at: awaiting.at + 1});
      if (next.at < next.steps.length) {
        state.awaiting = next;
        return {events: [], again: true};
      }
      return sacrificeUnkept(state, next);
    }
    const events = [];
    const mine = offeredToSacrifice(state, awaiting.player, awaiting);
    const chosen = (indices ?? []).map((i) => mine[i]).filter((id) => id !== undefined);
    /* "Total power 4 or less": the creatures kept, their powers as they are now, held to it -- refused, saying what to do. */
    if (awaiting.keepPowerAtMost !== undefined) {
      const total = chosen.reduce((n, id) => n + powerOf(state, id), 0);
      if (total > awaiting.keepPowerAtMost)
        throw new Error(`Those creatures' total power is ${total}: choose creatures with total power ${awaiting.keepPowerAtMost} or less to keep`);
    }
    if (awaiting.keep !== undefined && chosen.length > awaiting.keep) throw new Error("Invalid selection");
    /* "A creature": exactly that many kept (Promise of Loyalty), however many a player has above it. */
    if ((awaiting.keepExactly && chosen.length !== Math.min(awaiting.keep, mine.length)) || new Set(chosen).size !== chosen.length) throw new Error("Invalid selection");
    /* Kept: the rest go. Otherwise: the ones chosen. CR 101.4: chosen now, sacrificed when the last player has chosen --
       every player's at the same time, so nothing the first gave up is gone while the next decides. */
    const going = keepsChosen(awaiting) ? mine.filter((id) => !chosen.includes(id)) : chosen;
    const decided = [...(awaiting.decided ?? []), {player: awaiting.player, ids: going, kept: chosen}];
    const next = (awaiting.remaining ?? []).filter((p) => mustSacrifice(state, p, awaiting));
    if (next.length > 0) {
      state.awaiting = {...awaiting, player: next[0], remaining: next.slice(1), decided};
      return {events, again: true};
    }
    if (awaiting.everyone && !awaiting.optional) return finishKeeping(state, awaiting, decided, events);
    /* What the effect's controller sacrificed, as the objects it became (a token's until it ceases to exist, CR 704.5d) --
       and as each last existed on the battlefield (`movedWas`, CR 608.2h): "a permanent that shares a card type with it"
       (Braids, Arisen Nightmare) asks what it was, an animated land a creature too. */
    let remembering = awaiting.remembering;
    const movedWas = [];
    for (const {player, ids} of decided) {
      const gone = [];
      for (const id of ids) {
        const was = awaiting.remember === player ? lastKnown(state, id) : null;
        const moved = sacrificeOne(state, id, events);
        if (moved !== null) { gone.push(moved); if (was) movedWas.push(was); }
      }
      if (awaiting.remember === player) remembering = [...remembering, ...gone];
    }
    const refused = awaiting.optional || awaiting.named ? unrefused(state, awaiting, decided) : null;
    return remembering || refused ? {events, ...(remembering ? {remembered: remembering, movedWas} : {}), ...(refused ? {splice: refused} : {})} : events;
  },

  /* Left the game while asked (CR 800.4a): what they controlled left or was exiled with them, so they sacrifice nothing,
     and the next player is asked -- or, theirs the last answer, everyone's sacrifices are made. */
  left(state, awaiting) {
    return sacrifice.apply(state, awaiting, []);
  },
};

/* WHAT FOLLOWS A "MAY SACRIFICE" NOT TAKEN (`ifNot`): for each player named who sacrificed nothing -- declined, or had nothing
   to -- in turn order from the active player, its effects with that player "that player" (a mark before them, as a
   repetition's are spliced, script/resolution.mjs), and the resolution's own subject back after the last. None, and
   nothing follows. And what follows a sacrifice that must be made, for each player named who couldn't (`named`, Plaguecrafter). */
function unrefused(state, awaiting, decided) {
  if (!Array.isArray(awaiting.ifNot)) return [];
  const gave = new Set(decided.filter((d) => d.ids.length > 0).map((d) => d.player));
  const refusers = (awaiting.everyone ?? awaiting.named).filter((player) => !gave.has(player) && !state.players[player].lost);
  const before = state.resolving?.context?.about;
  return [...refusers.flatMap((player) => [{effect: "__about", about: {...(before ?? {}), player}}, ...structuredClone(awaiting.ifNot)]),
    {effect: "__about", ...(before !== undefined ? {about: before} : {})}];
}

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
  addCounters(state, army, "+1/+1", count, events, player);
  const current = [...typesOf(state, army), ...(state.objects[army].subtypes ?? [])];
  if (!current.includes(params.subtype) && !everyCreatureTypeOf(state, army))
    effectUntil(state, {id: `amass:${params.subtype}:${army}`, layer: 4, targets: [army], apply: {addSubtypes: [params.subtype]}, until: "ever"}, {controller: player, source});
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
   targets. Generic mana (`amount`), which may be counted ("{X}, where X is this creature's power"), or a mana cost with
   colored symbols (`mana`, echo's). Paid, `whenPaid` follows if it says so. ---- */
/* Ward's other costs (CR 702.21a): `life`, which a player can pay only if their total is at least that much (CR 119.4);
   `discard` a card, each in their hand its own option; `sacrifice` a permanent of theirs the selector describes, each its
   own option. With mana, all of it is paid or none. */
/* Life is part of the payment when there is some to pay, or when life is all it asks: "pay X life" with X of 0 is still
   paying 0 life (CR 119.4b), not {0}. */
/* A MANA COST WITH COLORED SYMBOLS (`mana`, echo's "sacrifice it unless you pay {3}{W}{W}", CR 702.30a): paid from the pool
   and the payer's plain sources as a generic amount is (rules/mana.mjs, unlessPlans); offered only to a payer who has a way,
   and when there is more than one way, which is the payer's (CR 605.3a). */
const lifeAsked = (awaiting) => awaiting.life > 0 || (awaiting.life === 0 && !(awaiting.amount > 0));
const noun = (selector) => (selector?.subtypes?.length ? `a ${selector.subtypes[0]}` : selector?.types?.length ? `a ${selector.types[0].toLowerCase()}` : "a permanent");
/* "Another creature you control" (Faerie Impostor): `another` read against the "unless" ability's own source. */
const otherNoun = (selector) => (selector?.another === true ? noun(selector).replace(/^a /, "another ") : noun(selector));
/* "Then discard two cards unless you discard a creature card" (Thirst for Identity; CR 118.12, 701.9a): `discard` a selector
   of the card in hand -- each card of the payer's it describes its own option, and with none there, not paying is all there
   is. Any card, as ward's discard is, when it is not one. */
const discardFits = (state, discard, id, player) => typeof discard !== "object" || compileSelector({...discard, what: "card", zone: "hand"})(state, id, {controller: player});
const discardNoun = (discard) => (typeof discard === "object" ? `${noun(discard)} card` : "a card");
/* "Exile this spell and four cards named Sphinx's Approach from your graveyard" (`exileSelf`, `exileFromGraveyard`): the
   cards of the payer's graveyard its selector describes, and the spell itself -- a card on the stack, as it resolves; a copy
   is no card to exile (CR 707.10a), so with one there is no paying. */
const NUMBER_WORDS = [null, "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const graveyardToExile = (state, awaiting) => {
  const fits = compileSelector({...awaiting.exileFromGraveyard.selector, what: "card", zone: "graveyard"});
  return cardsIn(state, "graveyard", awaiting.player).filter((id) => fits(state, id, {controller: awaiting.player, source: awaiting.source}));
};
const exileWords = (state, awaiting) => {
  const {count, selector} = awaiting.exileFromGraveyard, self = awaiting.exileSelf ? `${state.objects[awaiting.source].card} and ` : "";
  return `exile ${self}${NUMBER_WORDS[count]} card${count === 1 ? "" : "s"} named ${selector.named} from your graveyard`;
};
function costWords(awaiting, state) {
  if (awaiting.exileFromGraveyard) return exileWords(state, awaiting);
  if (awaiting.opponentGainsLife) return gainsWords(awaiting.opponentGainsLife);
  if (awaiting.amountX) return "pay {X}";
  if (awaiting.timesAny) return `pay ${awaiting.mana} any number of times`;
  const paid = [awaiting.mana ?? null, awaiting.amount > 0 ? `{${awaiting.amount}}` : null, lifeAsked(awaiting) ? `${awaiting.life} life` : null].filter(Boolean);
  const other = awaiting.discard && awaiting.sacrifice ? `sacrifice ${awaiting.sacrifice.nonTypes?.includes("Land") ? "a nonland permanent" : noun(awaiting.sacrifice)} or discard ${discardNoun(awaiting.discard)}`
    : awaiting.discard ? `discard ${discardNoun(awaiting.discard)}` : awaiting.sacrificeCount ? `sacrifice ${awaiting.sacrificeCount} permanents` : awaiting.sacrifice ? `sacrifice ${noun(awaiting.sacrifice)}`
    : awaiting.returnToHand ? `return ${otherNoun(awaiting.returnToHand)} you control to its owner's hand`
    : awaiting.tap ? `tap ${otherNoun(awaiting.tap).replace(/^(a|another) /, "$1 untapped ").replace(/^a untapped/, "an untapped")} you control` : null;
  return [other, paid.length ? `pay ${paid.join(" and ")}` : null].filter(Boolean).join(" and ") || `pay {${awaiting.amount}}`;
}
/* "CUMULATIVE UPKEEP -- AN OPPONENT GAINS 1 LIFE" (Wall of Shards, library load L5; CR 702.24a, 118.12): `opponentGainsLife`, that
   much life for an opponent of the payer's, `times` over -- one for each age counter, counted as it is asked. Paid, which
   opponent gains each is the payer's choice, the same one or a different one each time (its ruling), asked in turn when there
   is more than one opponent still in the game; each one chosen gains what it was chosen for at once, as one life gain from
   the one cost (CR 119.10). */
const opponentsOf = (state, player) => state.players.filter((p) => p.id !== player && !p.lost).map((p) => p.id);
const gainsWords = ({amount, times}) => `have an opponent gain ${amount} life${times > 1 ? `, ${times} times` : ""}`;
/* "YOU MAY PAY {X}" (Halo Forager; `amountX`, CR 107.3f): X is the payer's to choose as it resolves -- each amount their pool
   and plain mana sources could pay, from {0}, its own option -- and what follows knows it (`paidX`, script/resolution.mjs). */
function xOptions(state, player) {
  const options = [];
  for (let x = 0; canPayGeneric(state, player, x); x += 1) options.push({label: `Pay {${x}}`, pay: true, x});
  return options;
}
/* "YOU MAY PAY {2}{R} ANY NUMBER OF TIMES" (Bloodthirsty Adversary; `timesAny`, CR 118.12a, 601.2g-h's payment repeated):
   how many times is the payer's to choose -- each count their pool and plain mana sources could pay, once and up -- and
   what follows knows it ("when you pay this cost one or more times ... that many", `paidX`, script/resolution.mjs). */
const TIMES = ["once", "twice"];
function timesOptions(state, awaiting) {
  const options = [];
  for (let n = 1; unlessPlans(state, awaiting.player, awaiting.mana.repeat(n), 1).plans.length; n += 1)
    options.push({label: `Pay ${awaiting.mana} ${TIMES[n - 1] ?? `${n} times`}`, pay: true, times: n});
  return options;
}
function payOptions(state, awaiting) {
  if (awaiting.amountX && awaiting.amount === undefined) return xOptions(state, awaiting.player);
  if (awaiting.timesAny && awaiting.paidTimes === undefined) return timesOptions(state, awaiting);
  /* Having said they pay, which opponent gains the next of it; else, to pay it at all, an opponent to gain it. */
  if (awaiting.gaining) return opponentsOf(state, awaiting.player).map((id) => ({label: state.players[id].name, gainer: id}));
  if (awaiting.opponentGainsLife) {
    const words = gainsWords(awaiting.opponentGainsLife);
    return [{label: `${words[0].toUpperCase()}${words.slice(1)}`, pay: true, opponentsGain: true}];
  }
  const {player} = awaiting, amount = awaiting.amount ?? 0, life = awaiting.life ?? 0;
  if (amount > 0 && !canPayGeneric(state, player, amount)) return [];
  if (awaiting.mana && !unlessPlans(state, player, awaiting.mana, 1).plans.length) return [];
  if (life > state.players[player].life) return [];
  const paid = [awaiting.mana ?? null, amount > 0 ? `{${amount}}` : null, lifeAsked(awaiting) ? `${life} life` : null].filter(Boolean).join(" and ");
  const also = paid ? ` and pay ${paid}` : "";
  if (awaiting.sacrifice) {
    const alternatives = Array.isArray(awaiting.sacrifice.anyOf) ? awaiting.sacrifice.anyOf : [awaiting.sacrifice];
    const matchers = alternatives.map((one) => compileSelector({...one, what: "permanent", controller: "you"}));
    /* What they could sacrifice: never one that can't be sacrificed (Alexios; rules/statics.mjs). */
    const mine = state.zones.battlefield.filter((id) => matchers.some((m) => m(state, id, {controller: player})) && !cantBeSacrificed(state, id));
    /* "Sacrifice three permanents": one option, to pay it, if they have that many; which ones is asked next (`sacrificing`). */
    if (awaiting.sacrificeCount) {
      return awaiting.sacrificing ? mine.map((id) => ({label: state.objects[id].card, cardId: id}))
        : mine.length >= awaiting.sacrificeCount ? [{label: `Sacrifice ${awaiting.sacrificeCount} permanents${also}`, pay: true, sacrificeMany: true}] : [];
    }
    const sacrifices = mine.map((id) => ({label: `Sacrifice ${state.objects[id].card}${also}`, pay: true, sacrifice: id, cardId: id}));
    /* "UNLESS THAT PLAYER SACRIFICES A NONLAND PERMANENT OF THEIR CHOICE OR DISCARDS A CARD" (Torment of Hailfire; CR 118.12a):
       `sacrifice` and `discard` both, either one paying it -- each permanent and each card in hand its own option, which one
       the payer's choice. */
    if (!awaiting.discard) return sacrifices;
    return [...sacrifices, ...cardsIn(state, "hand", player).filter((id) => discardFits(state, awaiting.discard, id, player))
      .map((id) => ({label: `Discard ${state.objects[id].card}${also}`, pay: true, discard: id, cardId: id}))];
  }
  if (awaiting.discard) return cardsIn(state, "hand", player).filter((id) => discardFits(state, awaiting.discard, id, player))
    .map((id) => ({label: `Discard ${state.objects[id].card}${also}`, pay: true, discard: id, cardId: id}));
  if (awaiting.exileFromGraveyard) {
    const cards = graveyardToExile(state, awaiting);
    /* Having said they pay, with more than that many there: which ones. */
    if (awaiting.exiling) return cards.map((id) => ({label: state.objects[id].card, cardId: id}));
    const selfOk = !awaiting.exileSelf || state.objects[awaiting.source].copy !== true;
    const words = exileWords(state, awaiting);
    return selfOk && cards.length >= awaiting.exileFromGraveyard.count ? [{label: `${words[0].toUpperCase()}${words.slice(1)}`, pay: true, exileMany: true}] : [];
  }
  /* "YOU MAY TAP ANOTHER UNTAPPED MERFOLK YOU CONTROL. WHEN YOU DO, ..." (Meanders Guide; CR 118.12a, 603.12): each untapped
     permanent of the payer's the selector describes its own option -- `another` not the ability's source -- and not paying.
     Which one is the payer's choice. */
  if (awaiting.tap) {
    const fits = compileSelector({...awaiting.tap, what: "permanent", controller: "you"});
    return state.zones.battlefield.filter((id) => !state.objects[id].tapped && fits(state, id, {controller: player, source: awaiting.source}))
      .map((id) => ({label: `Tap ${state.objects[id].card}${also}`, pay: true, tap: id, cardId: id}));
  }
  /* "UNLESS YOU RETURN ANOTHER CREATURE YOU CONTROL TO ITS OWNER'S HAND" (Faerie Impostor; CR 118.12a, a cost other than
     mana): each permanent of the payer's the selector describes its own option -- `another` not the ability's source --
     and none, and not paying is all there is. Which one is the payer's choice (AGENTS.md: the players decide). */
  if (awaiting.returnToHand) {
    const fits = compileSelector({...awaiting.returnToHand, what: "permanent", controller: "you"});
    return state.zones.battlefield.filter((id) => fits(state, id, {controller: player, source: awaiting.source}))
      .map((id) => ({label: `Return ${state.objects[id].card} to its owner's hand${also}`, pay: true, bounce: id, cardId: id}));
  }
  return [{label: `Pay ${paid || `{${amount}}`}`, pay: true}];
}
/* Not paid: what follows then, if anything -- the effects of "unless", none of "you may pay. If you do". */
const unpaid = (awaiting) => (awaiting.ifPaid ? [] : {events: [], splice: structuredClone(awaiting.effects)});
export const unlessPays = {
  open(state, params, context) {
    const [payer] = playersFor(state, params.who, context.controller);
    if (payer === undefined) return false;
    /* "You may pay {4}. If you do, ..." (Mana Vault), mana alone, by a player who cannot pay it: no choice to make, and
       nothing happens. */
    if (params.ifPaid && !params.life && !params.discard && !params.sacrifice && !params.returnToHand && !canPayGeneric(state, payer, Math.max(0, params.amount ?? 0))) return false;
    /* Any number of times, by a player who cannot pay it once: likewise nothing to choose. */
    if (params.timesAny === true && !unlessPlans(state, payer, String(params.mana ?? ""), 1).plans.length) return false;
    /* "You may exile this spell and four cards named Sphinx's Approach": with fewer there, or this spell no card to exile,
       there is no paying it, and nothing is asked. */
    if (params.exileFromGraveyard && !payOptions(state, {player: payer, amount: 0, exileFromGraveyard: params.exileFromGraveyard, exileSelf: params.exileSelf === true, source: context.source ?? null}).length) return false;
    state.awaiting = {kind: "effect-choice", effect: "unlessPays", player: payer, ...(params.amountX === true ? {} : {amount: Math.max(0, params.amount ?? 0)}),
      /* "For each age counter on it" (cumulative upkeep with colored symbols, CR 702.24a): the cost that many times, counted now. */
      ...(typeof params.mana === "string" && params.mana ? {mana: params.manaTimes === undefined ? params.mana : params.mana.repeat(amountOf(state, params.manaTimes, context))} : {}),
      ...(params.life !== undefined ? {life: params.life} : {}), ...(params.discard ? {discard: params.discard} : {}), ...(params.sacrifice ? {sacrifice: structuredClone(params.sacrifice)} : {}),
      ...(params.sacrificeCount ? {sacrificeCount: params.sacrificeCount} : {}),
      ...(params.returnToHand ? {returnToHand: structuredClone(params.returnToHand)} : {}),
      ...(params.tap ? {tap: structuredClone(params.tap)} : {}),
      ...(params.opponentGainsLife ? {opponentGainsLife: {amount: params.opponentGainsLife.amount, times: Math.max(0, amountOf(state, params.opponentGainsLife.times ?? 1, context))}} : {}),
      ...(params.amountX === true ? {amountX: true} : {}),
      ...(params.timesAny === true ? {timesAny: true} : {}),
      ...(params.exileFromGraveyard ? {exileFromGraveyard: structuredClone(params.exileFromGraveyard), ...(params.exileSelf === true ? {exileSelf: true} : {})} : {}),
      effects: structuredClone(params.effects ?? []), source: context.source ?? null,
      /* "You may pay {1}. If you do, ...": the effects when it is paid, not when it is not. */
      ...(params.ifPaid ? {ifPaid: true} : {}),
      /* "Counter target spell unless its controller pays {2}. If they do, you create a Lander token" (Divert Disaster; CR
         118.12a): an outcome either way -- `effects` if it is not paid, `whenPaid` if it is, each done by this effect's
         controller, not the payer (the resolution's own context carries on with them). */
      ...(Array.isArray(params.whenPaid) && params.whenPaid.length ? {whenPaid: structuredClone(params.whenPaid)} : {})};
    return true;
  },
  choice(state, awaiting) {
    /* Having said they pay: which mana pays, when that is a choice (rules/mana.mjs, paymentUnits). */
    if (awaiting.paying) return paymentChoice(`unless-mana:${awaiting.player}:${state.turn}:${awaiting.amount}`, awaiting.amount, paymentUnits(state, awaiting.player));
    /* Having said they pay a mana cost with colors, and there being more than one way: which way. */
    if (awaiting.choosingPlan) {
      const {units, plans} = unlessPlans(state, awaiting.player, awaiting.mana);
      return {id: `unless-plan:${awaiting.player}:${state.turn}`, title: `Pay ${awaiting.mana}: choose the mana`, mode: "one", min: 1, max: 1,
        options: plans.map((plan, index) => ({index, label: planWords(units, plan)}))};
    }
    /* Having said they exile that many, with more there: which ones. */
    if (awaiting.exiling) return {id: `unless-exile:${awaiting.player}:${state.turn}`, title: `Choose ${NUMBER_WORDS[awaiting.exileFromGraveyard.count]} cards to exile`,
      mode: "many", min: awaiting.exileFromGraveyard.count, max: awaiting.exileFromGraveyard.count, options: payOptions(state, awaiting).map((option, index) => ({index, ...option}))};
    /* Having said they pay, with more than one opponent: who gains the next of it. */
    if (awaiting.gaining) {
      const {amount, times} = awaiting.opponentGainsLife;
      return {id: `unless-gain:${awaiting.player}:${state.turn}:${awaiting.gaining.chosen.length}`, title: `Which opponent gains ${amount} life (${awaiting.gaining.chosen.length + 1} of ${times})?`,
        mode: "one", min: 1, max: 1, options: payOptions(state, awaiting).map((option, index) => ({index, ...option}))};
    }
    /* Having said they sacrifice that many: which ones. */
    if (awaiting.sacrificing) return {id: `unless-sacrifice:${awaiting.player}:${state.turn}`, title: `Choose ${awaiting.sacrificeCount} permanents to sacrifice`, mode: "many",
      min: awaiting.sacrificeCount, max: awaiting.sacrificeCount, options: payOptions(state, awaiting).map((option, index) => ({index, ...option}))};
    const source = awaiting.source !== null ? state.objects[awaiting.source]?.card : null;
    const pays = payOptions(state, awaiting).map((option, index) => ({index, ...option}));
    return {id: `unless:${awaiting.player}:${state.turn}:${awaiting.amount ?? "X"}`, title: `${source ? `${source}: ` : ""}${costWords(awaiting, state)}?`, mode: "one", min: 1, max: 1,
      options: [...pays, {index: pays.length, label: "Don't pay", pay: false}]};
  },
  apply(state, awaiting, indices) {
    /* The mana chosen (CR 605.3a), then the rest of what paying is. */
    if (awaiting.paying) {
      const events = payWithUnits(state, awaiting.player, paymentUnits(state, awaiting.player), indices, awaiting.amount);
      return unlessPaid(state, awaiting, awaiting.paying.option, events);
    }
    /* The way chosen to pay a mana cost with colors: those units, spent. */
    if (awaiting.choosingPlan) {
      const {units, plans} = unlessPlans(state, awaiting.player, awaiting.mana);
      const plan = plans[(indices ?? [])[0]];
      if (!plan || (indices ?? []).length !== 1) throw new Error("Invalid selection");
      const {choosingPlan, ...rest} = awaiting;
      return unlessPays.paid(state, rest, choosingPlan.option, payPlan(state, awaiting.player, units, plan));
    }
    if (awaiting.exiling) {
      const ids = payOptions(state, awaiting).map((o) => o.cardId);
      const chosen = [...new Set(indices ?? [])].map((i) => ids[i]);
      if (chosen.length !== (indices ?? []).length || chosen.length !== awaiting.exileFromGraveyard.count || chosen.some((id) => id === undefined)) throw new Error("Invalid selection");
      const {exiling, ...rest} = awaiting;
      return unlessPaid(state, rest, {...exiling.option, exile: chosen}, []);
    }
    /* The opponent for the next of it: asked again until each has one. */
    if (awaiting.gaining) {
      const gainer = payOptions(state, awaiting)[(indices ?? [])[0]]?.gainer;
      if (gainer === undefined || (indices ?? []).length !== 1) throw new Error("Invalid selection");
      const {gaining, ...rest} = awaiting, chosen = [...gaining.chosen, gainer];
      if (chosen.length < awaiting.opponentGainsLife.times) {
        state.awaiting = {...awaiting, gaining: {...gaining, chosen}};
        return {events: [], again: true};
      }
      return unlessPaid(state, rest, {...gaining.option, gainers: chosen}, []);
    }
    if (awaiting.sacrificing) {
      const ids = payOptions(state, awaiting).map((o) => o.cardId);
      const chosen = [...new Set(indices ?? [])].map((i) => ids[i]);
      if (chosen.length !== awaiting.sacrificeCount || chosen.some((id) => id === undefined)) throw new Error("Invalid selection");
      const {sacrificing, ...rest} = awaiting;
      return unlessPays.paid(state, rest, {...sacrificing.option, sacrifice: chosen});
    }
    const option = unlessPays.choice(state, awaiting).options[(indices ?? [])[0]];
    if (!option) throw new Error("Invalid selection");
    if (option.sacrificeMany) {
      state.awaiting = {...awaiting, sacrificing: {option}};
      return {events: [], again: true};
    }
    /* Exactly that many there: no choice of which (they are those). More: which ones, asked next. */
    if (option.exileMany) {
      const cards = graveyardToExile(state, awaiting);
      if (cards.length === awaiting.exileFromGraveyard.count) return unlessPaid(state, awaiting, {...option, exile: cards}, []);
      state.awaiting = {...awaiting, exiling: {option}};
      return {events: [], again: true};
    }
    if (!option.pay) return unpaid(awaiting);
    /* An opponent to gain it: with one there, that one each time -- no choice -- and with more, asked in turn. */
    if (option.opponentsGain) {
      const opponents = opponentsOf(state, awaiting.player);
      if (opponents.length === 1) return unlessPaid(state, awaiting, {...option, gainers: Array(awaiting.opponentGainsLife.times).fill(opponents[0])}, []);
      state.awaiting = {...awaiting, gaining: {option, chosen: []}};
      return {events: [], again: true};
    }
    /* The X chosen is the amount paid. */
    if (option.x !== undefined) return unlessPays.paid(state, {...awaiting, amount: option.x}, option);
    /* So many times: the cost that many times over, paid as one (CR 601.2h). */
    if (option.times !== undefined) return unlessPays.paid(state, {...awaiting, mana: awaiting.mana.repeat(option.times), paidTimes: option.times}, option);
    return unlessPays.paid(state, awaiting, option);
  },
  /* Paying, with the option chosen: its mana, then the rest. `spent`, what a mana cost with colors was already paid with. */
  paid(state, awaiting, option, spent = null) {
    /* A mana cost with colors (`mana`): the one way there is, paid at once; more, and which is asked next. */
    if (awaiting.mana && spent === null) {
      const {units, plans} = unlessPlans(state, awaiting.player, awaiting.mana);
      if (!plans.length) throw new Error(`${awaiting.mana} can no longer be paid`);
      if (plans.length > 1) {
        state.awaiting = {...awaiting, choosingPlan: {option}};
        return {events: [], again: true};
      }
      return unlessPays.paid(state, awaiting, option, payPlan(state, awaiting.player, units, plans[0]));
    }
    /* Which mana pays is the payer's: asked next when the ways to pay differ, paid at once when they do not. */
    if ((awaiting.amount ?? 0) > 0 && paymentIsAChoice(paymentUnits(state, awaiting.player), awaiting.amount)) {
      state.awaiting = {...awaiting, paying: {option}};
      return {events: [], again: true};
    }
    const events = [...(spent ?? [])];
    if ((awaiting.amount ?? 0) > 0) {
      const paid = payGeneric(state, awaiting.player, awaiting.amount);
      events.push(...(Array.isArray(paid) ? paid : paid?.events ?? []));
    }
    return unlessPaid(state, awaiting, option, events);
  },
  /* Its payer has left the game, deciding or choosing how to pay: the cost is not paid (CR 800.4f). */
  left(state, awaiting) {
    return unpaid(awaiting);
  },
};
/* What paying an "unless" cost is besides its mana -- life, a discard, a sacrifice -- and what follows it. */
function unlessPaid(state, awaiting, option, events) {
  /* Life an opponent gains as the cost is paid: each one chosen, all they were chosen for, at once (CR 119.10). */
  for (const gainer of new Set(option.gainers ?? [])) events.push(...gainLife(state, {amount: awaiting.opponentGainsLife.amount * option.gainers.filter((id) => id === gainer).length, who: [gainer]},
    {controller: awaiting.player, source: awaiting.source}));
  /* Paying life is losing it (CR 119.4, 119.3). */
  if ((awaiting.life ?? 0) > 0) events.push(...loseLife(state, {amount: awaiting.life, who: [awaiting.player]}, {controller: awaiting.player, source: awaiting.source}));
  /* A discard: the card it became, remembered -- "when you discard a card this way, ... the mana value of the discarded card"
     (Argentum Masticore; script/resolution.mjs keeps it for what follows, a reflexive trigger's `about`). */
  let discarded = null;
  if (option.discard !== undefined && state.objects[option.discard]) {
    discarded = moveOne(state, option.discard, "graveyard", events, {owner: awaiting.player});
    if (discarded !== null) events[events.length - 1].data.fields.discarded = true;
  }
  for (const id of option.sacrifice === undefined ? [] : [].concat(option.sacrifice)) if (state.objects[id]) sacrificeOne(state, id, events);
  /* Exiled, as a cost is paid: this spell, off the stack as it resolves -- nothing then puts it in a graveyard (rules/stack.mjs)
     -- and the cards chosen from the graveyard. */
  if (option.exile !== undefined) {
    if (awaiting.exileSelf) moveOne(state, awaiting.source, "exile", events);
    for (const id of option.exile) moveOne(state, id, "exile", events);
  }
  /* Tapped, as a cost is paid -- an option of the answer's own question, asked again as it is answered (apply), so one
     tapped meanwhile is no longer among them (CR 118.3). */
  if (option.tap !== undefined) {
    state.objects[option.tap].tapped = true;
    events.push(event("GameEventCardTapped", state, {card: cardRef(state, option.tap), tapped: true}));
  }
  /* Returned to its owner's hand (CR 400.3), as a cost is paid: still there and still the payer's, or it cannot be. */
  if (option.bounce !== undefined) {
    if (state.objects[option.bounce]?.zone !== "battlefield" || controllerOf(state, option.bounce) !== awaiting.player) throw new Error("That permanent can no longer be returned to its owner's hand");
    moveOne(state, option.bounce, "hand", events);
  }
  const remembered = discarded !== null ? {remembered: [discarded]} : {};
  if (awaiting.ifPaid) return {events, splice: structuredClone(awaiting.effects), ...(awaiting.amountX ? {paidX: awaiting.amount} : awaiting.timesAny ? {paidX: awaiting.paidTimes} : {}), ...remembered};
  /* "If they do, you create a Lander token" (Divert Disaster): what paying leads to. */
  return awaiting.whenPaid ? {events, splice: structuredClone(awaiting.whenPaid), ...remembered} : events;
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

/* ---- chooseColor (CR 105.1, 105.3): "choose a color" as an effect resolves (Skrelv, Defector Mite) -- one of the five, its
   controller's choice; what is chosen, the effects after it name as "$chosenColor" (its letter: `colors: ["$chosenColor"]`;
   script/bind.mjs, chosen.mjs). ---- */
const COLOR_NAMES = Object.freeze([["W", "White"], ["U", "Blue"], ["B", "Black"], ["R", "Red"], ["G", "Green"]]);
export const chooseColor = {
  /* "Each player chooses a color" (Selective Obliteration): repeated for each player, the one a repetition is about choosing
     (`chooser: "that player"`, bound to them, script/bind.mjs) -- each one's color kept by whose it is (`colorChooser`;
     script/resolution.mjs, the context's `chosenColors`), for a selector's `onlyChosenColor` (script/filter.mjs). */
  open(state, params, context) {
    state.awaiting = {kind: "effect-choice", effect: "chooseColor", player: Number.isInteger(params.chooser) ? params.chooser : context.controller, source: context.source ?? null};
    return true;
  },
  choice(state, awaiting) {
    const name = awaiting.source !== null ? state.objects[awaiting.source]?.card : null;
    return {id: `chooseColor:${awaiting.player}:${state.turn}`, title: `${name ? `${name}: c` : "C"}hoose a color`, mode: "one", min: 1, max: 1,
      options: COLOR_NAMES.map(([color, label], index) => ({index, label, color}))};
  },
  apply(state, awaiting, indices) {
    const picked = (indices ?? []).length === 1 ? COLOR_NAMES[indices[0]] : undefined;
    if (!picked) throw new Error("Choose one color");
    return {events: [], chosenColor: picked[0], colorChooser: awaiting.player};
  },
};

/* ---- manaColors: "add one mana of any color" as an effect resolves (CR 106.1a, 106.3) ----

   "At the beginning of your first main phase, remove all charge counters from this artifact. Add one mana of any color for
   each charge counter removed this way" (Coalition Relic): an ability that is not a mana ability adding mana of any color
   (script/resolution.mjs puts this in an `addMana` of `anyColor`'s place). Which color each mana is, its controller's
   choice -- one mana at a time, so each may differ -- and all of it added together once the last is chosen, as one mana
   event. None to add, and nobody is asked. A mana ability's color is chosen as it is activated (rules/actions.mjs), never
   here. */
const MANA_COLORS = Object.freeze([["W", "White"], ["U", "Blue"], ["B", "Black"], ["R", "Red"], ["G", "Green"]]);
/* "Add {B} or {G} for each permanent destroyed this way" (Culling Ritual): of those colors only (`colors`), each mana its
   own choice among them; otherwise any of the five. */
const colorsOffered = (awaiting) => (Array.isArray(awaiting.colors) ? MANA_COLORS.filter(([color]) => awaiting.colors.includes(color)) : MANA_COLORS);
export const manaColors = {
  open(state, params, context) {
    const count = Math.max(0, Number.isInteger(params.count) ? params.count : 1);
    if (count === 0 || !state.players[context.controller]) return false;
    state.awaiting = {kind: "effect-choice", effect: "manaColors", player: context.controller, count, chosen: [], source: context.source ?? null,
      ...(params.oneColor === true ? {oneColor: true} : {}), ...(params.spendOnly ? {spendOnly: params.spendOnly} : {}),
      ...(Array.isArray(params.colors) ? {colors: [...params.colors]} : {})};
    return true;
  },
  choice(state, awaiting) {
    const name = awaiting.source !== null ? state.objects[awaiting.source]?.card : null;
    const named = colorsOffered(awaiting).map(([, label]) => label.toLowerCase());
    const of = Array.isArray(awaiting.colors) ? `${named.slice(0, -1).join(", ")} or ${named[named.length - 1]}` : "any color";
    return {id: `manaColors:${awaiting.player}:${state.turn}:${awaiting.chosen.length}`,
      title: awaiting.oneColor ? `${name ? `${name}: a` : "A"}dd ${awaiting.count} mana of any one color`
        : `${name ? `${name}: a` : "A"}dd one mana of ${of}${awaiting.count > 1 ? ` (${awaiting.chosen.length + 1} of ${awaiting.count})` : ""}`,
      mode: "one", min: 1, max: 1, options: colorsOffered(awaiting).map(([, label], index) => ({index, label}))};
  },
  apply(state, awaiting, indices) {
    const picked = (indices ?? []).length === 1 ? colorsOffered(awaiting)[indices[0]] : undefined;
    if (!picked) throw new Error("Choose one color for the mana");
    /* Of one color: the color once, for all of it. */
    const chosen = awaiting.oneColor ? Array.from({length: awaiting.count}, () => picked[0]) : [...awaiting.chosen, picked[0]];
    if (chosen.length < awaiting.count) {
      state.awaiting = {...awaiting, chosen};
      return {events: [], again: true};
    }
    const mana = {};
    for (const color of chosen) mana[color] = (mana[color] ?? 0) + 1;
    return {events: addMana(state, {mana, ...(awaiting.spendOnly ? {spendOnly: awaiting.spendOnly} : {})}, {controller: awaiting.player, source: awaiting.source})};
  },
};

/* ---- handLook: "look at target player's hand" (Gitaxian Probe; CR 701.20e, 701.20a) ----

   peekAndReveal's `zone: "hand"` (script/resolution.mjs puts this in its place). Each hand `who` names is shown to this
   effect's controller alone, for as long as they look: an acknowledgment asked of them (`ack`), the hand's cards its options,
   and in their view only that hand face up (projection.mjs, `handLookedBy`) -- to nobody once they have seen it. The hands
   one at a time, in turn order from the active player (CR 101.4). An empty hand has nothing to look at, nor does the
   controller's own, already theirs to see: nobody is asked. Nothing moves (CR 701.20b), and the history names no card. */
export const handLook = {
  open(state, params, context) {
    const seats = state.players.length, apnap = (p) => (p - state.activePlayer + seats) % seats;
    const hands = playersFor(state, params.who, context.controller).filter((p) => p !== context.controller && cardsIn(state, "hand", p).length > 0)
      .sort((a, b) => apnap(a) - apnap(b));
    if (!hands.length) return false;
    state.awaiting = {kind: "effect-choice", effect: "handLook", player: context.controller, from: hands[0], remaining: hands.slice(1), cards: cardsIn(state, "hand", hands[0]),
      handLookedBy: context.controller, source: context.source ?? null};
    return true;
  },
  choice(state, awaiting) {
    const name = awaiting.source !== null ? state.objects[awaiting.source]?.card : null;
    return {id: `handLook:${awaiting.from}:${state.turn}`, title: `${name ? `${name}: ` : ""}you look at ${state.players[awaiting.from].name}'s hand`,
      mode: "ack", min: 0, max: 0, options: cardOptions(state, awaiting.cards)};
  },
  apply(state, awaiting, indices) {
    if ((indices ?? []).length !== 0) throw new Error("Nothing is chosen from a hand you look at: say you have seen it");
    /* One who has left the game since took their hand with them (CR 800.4a). */
    const next = (awaiting.remaining ?? []).filter((p) => !state.players[p].lost);
    if (next.length) {
      state.awaiting = {...awaiting, from: next[0], remaining: next.slice(1), cards: cardsIn(state, "hand", next[0])};
      return {events: [], again: true};
    }
    return [];
  },
  /* The looker has left the game (CR 800.4a): the spell left with them, and nobody looks. */
  left() {
    return [];
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
function retargetOptions(state, question, {withOthers = false} = {}) {
  const entry = state.stack.find((e) => e.stackId === question.stackId);
  const spec = entry ? specsOf(state, entry)[question.index] : null;
  if (!entry || !spec) return null;
  /* A counted target's list holding its one target (changeTargets): that one. */
  const was = entry.targets[question.index];
  const current = (Array.isArray(was) ? was[0] : was) ?? null;
  /* An ability's source is the object it came from (entry.cardId), while it is still that object (CR 113.7a). */
  const source = entry.objectId ?? (entry.cardId !== null && state.objects[entry.cardId] ? entry.cardId : null);
  /* `withOthers`: read against the entry's other targets as they stand -- "another target" (`distinctFrom`) not one of them. */
  const others = targetCandidates(state, spec, {controller: entry.playerId, source, ...(entry.about ? {about: entry.about} : {}), ...(entry.x !== undefined ? {x: entry.x} : {}),
    ...(withOthers ? {chosenTargets: entry.targets} : {})})
    /* Never itself (CR 115.5): a spell its own object, an ability its own entry. */
    .filter((c) => !(c.kind === "object" && c.id === entry.objectId) && !(c.kind === "ability" && c.id === entry.stackId))
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
    /* The spell it names by its object (`spells`), or the spell or ability by its stack entry (`stack`, Bolt Bend). */
    const entry = state.stack.find((e) => (e.objectId !== null && (params.spells ?? []).includes(e.objectId)) || (Array.isArray(params.stack) && params.stack.includes(e.stackId)));
    if (!entry) return false;
    /* "CHANGE A TARGET OF TARGET SPELL OR ABILITY TO THIS CREATURE" (Spellskite; "the target of target instant or sorcery
       spell with a single target to this creature", Hydroelectric Specimen; CR 115.7a-b): one of its targets changed to this
       effect's source, a target that source could legally be instead -- by that target's own requirements, never one it is
       already, and not one another target of it must differ from (`distinctFrom`, both ways). Which one, when more than one
       could, is this effect's controller's choice; none, and every target is unchanged (CR 115.7a), nobody asked. The source
       no longer on the battlefield, the resolution has none (rules/stack.mjs), and there is nothing to change one to. A
       counted target's list is left as it is (NAMED). */
    if (params.to === "self") {
      const self = context.source;
      const specs = specsOf(state, entry);
      const isSelf = (t) => t?.kind === "object" && t.id === self;
      const indices = entry.targets.map((_, index) => index).filter((index) => !Array.isArray(entry.targets[index])
        && !specs.some((spec, j) => j !== index && (spec?.distinctFrom ?? []).includes(index) && [].concat(entry.targets[j] ?? []).some(isSelf))
        && (retargetOptions(state, {stackId: entry.stackId, index}, {withOthers: true})?.others ?? []).some(isSelf));
      if (!indices.length) return false;
      if (indices.length === 1) return {events: changeTargets.retarget(state, entry, indices[0], {kind: "object", id: self})};
      state.awaiting = {kind: "effect-choice", effect: "changeTargets", player: context.controller, toSelf: {stackId: entry.stackId, indices, self}};
      return true;
    }
    /* "YOU MAY CHOOSE NEW TARGETS FOR TARGET INSTANT OR SORCERY SPELL" (Wild Ricochet; CR 115.7d): `may`, each of that spell's
       targets kept or changed to another it could have, a question at a time, as a copy's are (copySpell) -- one with no
       other choice is not asked about, and with none to ask, nobody is. A counted target's list is kept, as a copy's is. */
    if (params.may === true) {
      const questions = entry.targets.map((t, index) => ({stackId: entry.stackId, index, list: Array.isArray(t)}))
        .filter((q) => !q.list && (retargetOptions(state, q)?.others ?? []).length > 0).map(({stackId, index}) => ({stackId, index}));
      if (!questions.length) return false;
      state.awaiting = {kind: "effect-choice", effect: "changeTargets", player: context.controller, questions};
      return true;
    }
    /* "With a single target" (its own targeting asked that): the one there is -- a counted target's list holding one
       included, the others empty. */
    const index = entry.targets.findIndex((t) => (Array.isArray(t) ? t.length > 0 : Boolean(t)));
    if (index < 0) return false;
    const question = {stackId: entry.stackId, index};
    if (!(retargetOptions(state, question)?.others ?? []).length) return false;
    state.awaiting = {kind: "effect-choice", effect: "changeTargets", player: context.controller, question};
    return true;
  },
  /* A target of `entry`, at `index`, made `chosen` -- the same shape it had, a counted list holding one -- and it becoming the
     spell's or ability's target (ward, CR 702.21a). */
  retarget(state, entry, index, chosen) {
    entry.targets[index] = Array.isArray(entry.targets[index]) ? [chosen] : chosen;
    return chosen.kind === "object" ? becameTarget(state, entry, chosen.id) : [];
  },
  choice(state, awaiting) {
    /* "Change a target ... to this creature": which of its targets becomes it. */
    if (awaiting.toSelf) {
      const {stackId, indices, self} = awaiting.toSelf, entry = state.stack.find((e) => e.stackId === stackId);
      const many = (entry ? specsOf(state, entry) : []).length > 1;
      return {id: `changeTargets:${stackId}:to-self`, title: `${entry?.name ?? "The spell"}: which target becomes ${state.objects[self]?.card ?? "this"}?`, mode: "one", min: 1, max: 1,
        options: indices.map((index, i) => ({index: i, label: `${many ? `Its ${ordinal(index)} target, ` : ""}${targetName(state, entry?.targets[index]) || "its target, now gone"}`, targetIndex: index}))};
    }
    /* `may`: copySpell's question -- keep it, or one of the others -- about this spell's own target. */
    if (awaiting.questions) {
      const question = awaiting.questions[0], entry = state.stack.find((e) => e.stackId === question.stackId);
      const many = (entry ? specsOf(state, entry) : []).length > 1;
      return {...copySpell.choice(state, awaiting), id: `changeTargets:${question.stackId}:${question.index}`,
        title: `${entry?.name ?? "The spell"}: keep ${many ? `its ${ordinal(question.index)} target` : "its target"}, or choose a new one?`};
    }
    const {entry, others} = retargetOptions(state, awaiting.question) ?? {entry: null, others: []};
    return {id: `changeTargets:${awaiting.question.stackId}`, title: `${entry?.name ?? "The spell"}: its new target`, mode: "one", min: 1, max: 1,
      options: others.map((c, i) => ({index: i, label: targetName(state, c), ...(c.kind === "object" ? {cardId: c.id} : {}), target: c}))};
  },
  apply(state, awaiting, indices) {
    /* `may`: answered as a copy's new targets are, one question at a time. */
    if (awaiting.questions) return copySpell.apply(state, awaiting, indices);
    const option = changeTargets.choice(state, awaiting).options[(indices ?? [])[0]];
    if (!option) throw new Error("Invalid selection");
    /* "To this creature": the target chosen becomes it. */
    if (awaiting.toSelf) {
      const entry = state.stack.find((e) => e.stackId === awaiting.toSelf.stackId);
      return {events: entry ? changeTargets.retarget(state, entry, option.targetIndex, {kind: "object", id: awaiting.toSelf.self}) : []};
    }
    const entry = state.stack.find((e) => e.stackId === awaiting.question.stackId);
    /* It becomes the spell's target (ward, CR 702.21a). */
    return {events: entry ? changeTargets.retarget(state, entry, awaiting.question.index ?? 0, {kind: option.target.kind, id: option.target.id}) : []};
  },
};

/* ---- chooseSource: "the next time a source of your choice would deal damage to you this turn" (Deflecting Palm) ----
   CR 609.7a: chosen as the effect is made, from a permanent; a spell on the stack, a permanent spell included; an object an
   object on the stack refers to -- the source of an ability there, a target -- or one a delayed trigger waiting to trigger
   does; or a face-up object in the command zone. Each while it is still an object: one gone from where it was is a new
   object, or none, and damage from a source that has left is dealt by no object the rules can still name (NAMED: what an
   ability of a departed source deals is sourceless here, as protection reads it too). Remembered for the effects after it.
   Nothing to choose, and nothing is asked. */
function sourcesToChoose(state) {
  const found = [];
  const add = (id) => { if (id !== null && id !== undefined && state.objects[id] && !found.includes(id)) found.push(id); };
  for (const id of state.zones.battlefield) add(id);
  /* Each entry's card: a spell's own object, an ability's source. */
  for (const entry of state.stack) {
    add(entry.cardId);
    for (const t of (entry.targets ?? []).flat()) if (t?.kind === "object") add(t.id);
  }
  for (const delayed of state.delayedTriggers ?? []) add(delayed.source);
  for (const id of state.zones.command.flat()) if (state.objects[id]?.faceDown !== true) add(id);
  return found;
}
export const chooseSource = {
  open(state, params, context) {
    const sources = sourcesToChoose(state);
    if (!sources.length) return false;
    state.awaiting = {kind: "effect-choice", effect: "chooseSource", player: context.controller, sources};
    return true;
  },
  choice(state, awaiting) {
    const whose = (id) => {
      const o = state.objects[id], holder = o.zone === "battlefield" ? controllerOf(state, id) : o.controller;
      return holder === awaiting.player ? "" : ` (${state.players[holder]?.name ?? `Seat ${holder + 1}`}'s)`;
    };
    const where = (id) => ({stack: ", a spell", command: ", in the command zone", graveyard: ", in a graveyard", exile: ", in exile", hand: ", in a hand", library: ", in a library"})[state.objects[id].zone] ?? "";
    const options = awaiting.sources.filter((id) => state.objects[id]).map((id, index) => ({index, label: `${targetName(state, {kind: "object", id})}${where(id)}${whose(id)}`, cardId: id}));
    for (const option of options) {
      const alike = options.filter((o) => o.label === option.label);
      if (alike.length > 1) alike.forEach((o, n) => { o.label = `${o.label} (${n + 1})`; });
    }
    return {id: `chooseSource:${state.turn}:${awaiting.player}`, title: "Choose a source of damage", mode: "one", min: 1, max: 1, options};
  },
  apply(state, awaiting, indices) {
    const option = chooseSource.choice(state, awaiting).options[(indices ?? [])[0]];
    if (!option) throw new Error("Invalid selection");
    return {events: [], remembered: [option.cardId]};
  },
  /* Its chooser has left the game: the spell left with them (CR 800.4a), and no shield is theirs to make. */
  left() {
    return {events: [], remembered: []};
  },
};

/* ---- vote: "starting with you, each player votes for past or present" (Fateful Tempest's council's dilemma; CR 701.38) ----
   Each player in the game votes for one of the choices -- words with no rules meaning (701.38b) -- starting with the
   effect's controller and going on in turn order (701.38a), each seeing the votes cast before theirs. The votes are kept,
   counted by choice, for the effects after it (`votes`, script/resolution.mjs; script/amount.mjs, `{votes: choice}`). A
   player who has left the game is no longer a player to vote (CR 800.4a): asked, they are answered for as no vote (`left`;
   script/resolution.mjs, answerDeparted), and the next is asked. */
const tallied = (votes, choices) => Object.fromEntries(choices.map((c) => [c, votes.filter((v) => v.choice === c).length]));
export const vote = {
  open(state, params, context) {
    const seats = state.players.length, choices = [...new Set(params.choices ?? [])];
    const voters = Array.from({length: seats}, (_, k) => (context.controller + k) % seats);
    if (choices.length < 2) return false;
    state.awaiting = {kind: "effect-choice", effect: "vote", player: voters[0], voters: voters.slice(1), choices, votes: [], ...(params.title ? {title: String(params.title)} : {})};
    return true;
  },
  choice(state, awaiting) {
    const tally = tallied(awaiting.votes, awaiting.choices);
    const sofar = awaiting.votes.length ? ` -- so far ${awaiting.choices.map((c) => `${c} ${tally[c]}`).join(", ")}` : "";
    return {id: `vote:${state.turn}:${awaiting.player}:${awaiting.votes.length}`, title: `${awaiting.title ?? "Vote"}${sofar}`, mode: "one", min: 1, max: 1,
      options: awaiting.choices.map((c, index) => ({index, label: c}))};
  },
  apply(state, awaiting, indices) {
    const choice = awaiting.choices[(indices ?? [])[0]];
    if (choice === undefined) throw new Error("Invalid selection");
    return vote.next(state, {...awaiting, votes: [...awaiting.votes, {player: awaiting.player, choice}]});
  },
  /* The next player asked, or the votes counted. */
  next(state, awaiting) {
    const rest = awaiting.voters;
    if (rest.length) {
      state.awaiting = {...awaiting, player: rest[0], voters: rest.slice(1)};
      return {events: [], again: true};
    }
    return {events: [], votes: tallied(awaiting.votes, awaiting.choices)};
  },
  left(state, awaiting) {
    return vote.next(state, awaiting);
  },
};

/* ---- attackWhom: a creature put onto the battlefield attacking, with more than one defending player or planeswalker it
   could attack (CR 508.4): which one, its controller's choice as it enters -- a question for each, in the order they were made.
   Queued by what made them (effects/permanents.mjs, enterAttacking); never written in a card script. ---- */
export const attackWhom = {
  /* Queued only with two defending players or more, and asked at once: nothing happens between. */
  /* Each defending player, and each planeswalker one of them controls (CR 508.4; effects/permanents.mjs, attackPlaces). */
  open(state, params) {
    state.awaiting = {kind: "effect-choice", effect: "attackWhom", player: params.player, tokens: [...params.tokens], places: attackPlaces(state, params.player)};
    return true;
  },
  choice(state, awaiting) {
    const id = awaiting.tokens[0];
    return {id: `attackWhom:${id}`, title: `${state.objects[id].card} enters attacking: which player or planeswalker?`, mode: "one", min: 1, max: 1,
      options: awaiting.places.map(({player, planeswalker}, index) => ({index, playerId: player,
        ...(planeswalker === undefined ? {label: state.players[player].name} : {label: `${state.objects[planeswalker]?.card ?? "A planeswalker"} (${state.players[player].name})`, planeswalkerId: planeswalker})}))};
  },
  apply(state, awaiting, indices) {
    const option = attackWhom.choice(state, awaiting).options[(indices ?? [])[0]];
    if (!option) throw new Error("Invalid selection");
    const [id, ...rest] = awaiting.tokens;
    joinAttack(state, id, option.playerId, option.planeswalkerId);
    if (rest.length) { state.awaiting = {...awaiting, tokens: rest}; return {events: [], again: true}; }
    return {events: []};
  },
  /* Their controller has left the game, and they left or were exiled with them (CR 800.4a): nothing is left to put into
     the attack. */
  left() {
    return [];
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
  /* Its controller has left the game, and the Aura left or was exiled with them (CR 800.4a): there is nothing to attach. */
  left() {
    return [];
  },
};

/* ---- dredgeDraw (CR 702.52a, 616.1; wave 4c, k2): one card drawn as an effect resolves, or a dredge in its place -- the
   drawing player's choice among the dredge cards of their graveyard that could replace it now (effects/zones.mjs, dredgers);
   with none, the card is drawn and nobody is asked. Queued by script/resolution.mjs, one for each card a draw would draw;
   never written in a card script. ---- */
export const dredgeDraw = {
  open(state, params, context) {
    if (!dredgers(state, params.player).length) return {events: drawEffect(state, {who: [params.player], count: 1}, context)};
    state.awaiting = {kind: "effect-choice", effect: "dredgeDraw", player: params.player, cards: dredgers(state, params.player).map((d) => d.id)};
    return true;
  },
  choice(state, awaiting) {
    const could = new Map(dredgers(state, awaiting.player).map((d) => [d.id, d.amount]));
    return {id: `dredge:${state.turn}:${awaiting.cards.join(",")}`, title: "You would draw a card: draw it, or dredge instead", mode: "one", min: 1, max: 1,
      options: [{index: 0, label: "Draw a card"}, ...awaiting.cards.map((id, i) => ({index: i + 1, cardId: id, label: dredgeWords(state, {id, amount: could.get(id)})}))]};
  },
  apply(state, awaiting, indices) {
    const [index] = indices ?? [];
    if ((indices ?? []).length !== 1 || !(Number.isInteger(index) && index >= 0 && index <= awaiting.cards.length)) throw new Error("Invalid selection");
    const events = [];
    if (index === 0) return drawEffect(state, {who: [awaiting.player], count: 1}, {controller: awaiting.player});
    if (!dredgeInstead(state, awaiting.player, awaiting.cards[index - 1], events)) throw new Error("That card can no longer dredge: draw the card, or dredge with another");
    return events;
  },
  /* The drawing player has left the game (CR 800.4a): nothing is drawn. */
  left() {
    return [];
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
/* "SEARCH YOUR LIBRARY FOR A FOREST CARD AND A PLAINS CARD" (Krosan Verge; `searches`, a description for each card) and "FOR UP
   TO TWO BASIC LAND CARDS THAT SHARE A LAND TYPE" (Myriad Landscape; `sharing: "land type"`, `count` of the selector's): one
   search (CR 701.23h), a card at a time -- each question offers the cards the next description fits, or the selector's that
   share a land type with every card found before it (CR 205.3i) -- and what it found goes where the search puts it,
   together, once the last is asked. Each has a quality, so each may find nothing (CR 701.23b); one after the first with
   nothing to find is not asked, and with `sharing`, finding none ends it. */
const landTypesOf = (state, id) => (state.objects[id]?.subtypes ?? []).filter(isLandType);
const sharesLandType = (state, a, b) => landTypesOf(state, a).some((type) => landTypesOf(state, b).includes(type));
function stepCards(state, awaiting) {
  const {searches, sharing, selector, pool, step, found, source} = awaiting.steps;
  const fits = compileSelector({...(searches ? searches[step] : selector), what: "card", zone: awaiting.zone});
  return pool.filter((id) => !found.includes(id) && fits(state, id, {controller: awaiting.player, source})
    && (sharing !== "land type" || found.every((other) => sharesLandType(state, other, id))));
}
export const chooseCard = {
  open(state, params, context, rng = null) {
    /* "SEARCH YOUR LIBRARY AND GRAVEYARD" (Finale of Devastation's "and/or", both chosen; CR 701.23): `zones`, each the
       searcher's own, searched as one -- every one's cards in the one question, each found where it is, its zone said beside
       it; the library among them hidden, so a search for a card with a quality may find nothing (701.23b), and searched
       ("if you search your library this way", `searched`). */
    const zones = Array.isArray(params.zones) && params.zones.length > 1 ? params.zones : null;
    const zone = zones ? (zones.includes("library") ? "library" : zones[0]) : params.zone ?? "library";
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
    /* "You may exile ONE OF THEM from your graveyard" (Conspiracy Theorist): among what a "one or more" trigger is about
       (`among: "those cards"`, rules/trigger.mjs `batch`), each still the card it was there (CR 400.7) -- face up, as the
       remembered are. */
    /* "Attach an Equipment that was attached to Zack Fair to that creature" (Zack Fair; `among: "was attached to this"`):
       among what was attached to the ability's source as it last existed -- sacrificed as its cost (CR 608.2h) -- each still
       the object it was there (CR 400.7), one chosen if several (CR 701.3a). */
    const among = params.among === "remembered" || params.among === "those cards" || params.among === "was attached to this";
    const amongIds = params.among === "those cards" ? context.about?.cards ?? [] : params.among === "was attached to this" ? context.lastKnown?.attachments ?? [] : context.remembered ?? [];
    /* "Return ANOTHER permanent card" (Rise of the Witch-king, batch 70): not the one an earlier effect of this resolution
       remembered -- the creature sacrificed this way. */
    const except = params.except === "remembered" ? new Set(context.remembered ?? []) : null;
    /* Exile is one zone for every player (CR 406.1): a card there of the kind the selector says -- "a card exiled with this
       artifact" (`exiledWith`, script/filter.mjs) -- whoever owns it, face up (a face-down one has no characteristics,
       406.3a, so no selector with a quality fits it). */
    /* "An artifact or creature card from among those cards" (Spirit of Resilience, cards that left a graveyard): `zone: "any"`
       beside `among`, each wherever it went -- a public zone, the one a leaving trigger can find it in (CR 400.7e) -- and read
       as it is there (CR 608.2h). */
    const anywhere = zone === "any";
    const pool = (zones ? zones.flatMap((z) => cardsIn(state, z, player)) : among ? amongIds.filter((id) => (anywhere ? state.objects[id] !== undefined : state.objects[id]?.zone === zone)) : onField ? [...state.zones.battlefield] : cardsIn(state, zone, zone === "exile" ? null : player))
      .filter((id) => !except?.has(id));
    /* "For each player, choose a creature that player controls" (The Eternal Wanderer): the player a repetition is about,
       for a selector's "that player" (script/resolution.mjs, repeatFor). */
    const fits = (id) => (anywhere || zones ? alternatives.map((one) => compileSelector({...one, what: "card", zone: state.objects[id].zone})) : matchers)
      /* And the X its spell was cast with: "a creature card with mana value X or less" (Finale of Devastation; script/filter.mjs). */
      .some((m) => m(state, id, {controller: player, source: context.source, ...(context.about ? {about: context.about} : {}), ...(context.x !== undefined ? {x: context.x} : {})}));
    const fitting = greatestOf(state, params.greatest, pool.filter(fits));
    /* "Up to four cards with different names" (Gifts Ungiven): one of each name offered -- which of two identical cards in a
       library is found changes nothing, and no answer can then name two of a name. */
    const cards = params.differentNames === true ? fitting.filter((id, i) => fitting.findIndex((other) => state.objects[other].card === state.objects[id].card) === i) : fitting;
    /* From among what was looked at or moved (Risen Reef's "if it's a land card"), with nothing that fits: nothing to choose,
       and nobody is asked -- the cards are face up to the chooser, so there is no failing to find (CR 701.23b is a search's). */
    /* Exile is face up (CR 406.3): what fits there is seen, so there is no failing to find it either. */
    /* So is the command zone (CR 400.2): "put your commander into your hand from the command zone" (Command Beacon, wave 4b)
       takes the one there, and with none there nobody is asked. */
    const faceUp = among || onField || zone === "exile" || zone === "command";
    if (faceUp && cards.length === 0) return false;
    /* "IF AN EQUIPMENT IS PUT ONTO THE BATTLEFIELD THIS WAY, YOU MAY ATTACH IT TO A CREATURE YOU CONTROL" (Armored Skyhunter;
       `attach: "remembered"`, beside `to: "stay"`): "it" is what the effect before it put there (CR 701.3a) -- the permanent
       chosen is what it is attached to, not a target. It no longer there, there is nothing to attach, and nobody is asked. */
    const attaching = params.attach === "remembered" ? (context.remembered ?? []).find((id) => state.objects[id]?.zone === "battlefield") : undefined;
    if (params.attach === "remembered" && attaching === undefined) return false;
    const count = params.count ?? 1;
    const min = params.upTo || (!faceUp && hasQuality(params.selector)) ? 0 : Math.min(count, cards.length);
    const awaiting = {
      kind: "effect-choice", effect: "chooseCard", player, zone, ...(zones ? {zones: [...zones]} : {}), cards, min, max: Math.min(count, cards.length),
      destinations: params.destinations ?? [{to: params.to ?? "hand", ...(params.tapped ? {tapped: true} : {})}],
      shuffle: params.shuffle === true, reveal: params.reveal === true, controller: params.controller === "you" ? context.controller : params.controller ?? null,
      ...(attaching !== undefined ? {attaching} : {}),
      /* "Untap that land" (Fabled Passage): what it found, for the effects after it (resolution.mjs). "Add": beside what was
         remembered before -- each player's creature chosen in turn, "not chosen this way" all of them (The Eternal Wanderer). */
      ...(params.remember ? {remember: params.remember === "add" ? "add" : true} : {}),
      /* "Each player may put a land card from their hand onto the battlefield, then each opponent who didn't draws a card"
         (Kynaios and Tiro of Meletis): `did`, a player who chooses a card has done it (apply, below). */
      ...(params.did === true ? {did: true} : {}),
      /* Sneak Attack: "That creature gains haste. Sacrifice the creature at the beginning of the next end step." */
      /* "Onto the battlefield tapped and attacking that opponent" (Kaalia of the Vast; library load L4): `attacking`, as a
         token made attacking is (effects/permanents.mjs, enterAttacking) -- "that player" the one this ability is about,
         kept with the question (`about`; CR 508.4). */
      ...(params.gains || params.gainsUntilEndOfTurn || params.atEndStep || params.attacking ? {then: {gains: params.gains, gainsUntilEndOfTurn: params.gainsUntilEndOfTurn, atEndStep: params.atEndStep,
        ...(params.attacking ? {attacking: params.attacking} : {})}, source: context.source ?? null,
        ...(params.attacking && context.about ? {about: structuredClone(context.about)} : {})} : {}),
    };
    if (Array.isArray(params.searches) || params.sharing === "land type") {
      state.awaiting = {...awaiting, cards: pool, steps: {searches: params.searches ?? null, sharing: params.sharing ?? null, selector: params.selector ?? null, pool,
        step: 0, total: params.searches ? params.searches.length : count, found: [], source: context.source ?? null}};
      return true;
    }
    /* "Exile a card from your graveyard AT RANDOM" (Advanced Reconstruction): nobody chooses -- each card is picked by the
       game's random stream (rng.mjs), as a random discard's is (CR 701.9b), and nobody is asked. Nothing there, nothing. */
    if (params.random === true) {
      if (!rng) throw new Error("A card chosen at random needs the game's random stream");
      if (params.remember) context.remembered = [];
      const picked = [];
      for (let n = 0; n < awaiting.max; n += 1) picked.push(rng.pick(cards.filter((id) => !picked.includes(id))));
      if (!picked.length) return {events: []};
      const outcome = chooseCard.apply(state, awaiting, picked.map((id) => cards.indexOf(id)), {}, rng);
      if (params.remember) context.remembered = Array.isArray(outcome) ? [] : outcome.remembered ?? [];
      return {events: Array.isArray(outcome) ? outcome : outcome.events ?? []};
    }
    state.awaiting = awaiting;
    return true;
  },

  choice(state, awaiting) {
    if (awaiting.steps) {
      const cards = stepCards(state, awaiting), {step, total, found} = awaiting.steps;
      return {id: `chooseCard:${awaiting.player}:${state.turn}:${awaiting.cards.length}:${step}`,
        title: `Search your ${ZONE_WORD[awaiting.zone]}: card ${step + 1} of ${total}${found.length ? ` (${found.map((id) => state.objects[id].card).join(", ")} found)` : ""}`,
        mode: "many", min: 0, max: Math.min(1, cards.length), options: cardOptions(state, cards)};
    }
    return {
      id: `chooseCard:${awaiting.player}:${state.turn}:${awaiting.cards.length}`,
      /* A permanent is chosen, not searched for. */
      title: awaiting.zone === "battlefield" ? (awaiting.max > 1 ? "Choose permanents" : "Choose a permanent")
        /* A card in exile -- "a card exiled with this artifact" -- is chosen, not searched for. */
        : awaiting.zone === "exile" ? (awaiting.max > 1 ? "Choose cards in exile" : "Choose a card in exile")
        /* Your commander, from the command zone (Command Beacon): chosen there, not searched for. */
        : awaiting.zone === "command" ? "Choose a card in your command zone"
        /* Among cards wherever they went (Spirit of Resilience): chosen, not searched for. */
        : awaiting.zone === "any" ? (awaiting.max > 1 ? "Choose cards from among them" : "Choose a card from among them")
        /* Two zones searched as one (Finale of Devastation): both named. */
        : awaiting.zones ? `Search your ${awaiting.zones.map((z) => ZONE_WORD[z]).join(" and ")}`
        : awaiting.max === 0 ? `Search your ${ZONE_WORD[awaiting.zone]}: nothing to find` : `Search your ${ZONE_WORD[awaiting.zone]}`,
      mode: awaiting.max <= 1 ? (awaiting.min === 0 ? "many" : "one") : "many",
      min: awaiting.min,
      max: awaiting.max,
      /* "Then look at the exiled cards and put them on top of your library in any order" (Scroll Rack): a card exiled face
         down that its chooser may look at (CR 406.3; projection.mjs, `lookers`) is named to them by the card it is. */
      options: cardOptions(state, awaiting.cards).map((option) => {
        const object = state.objects[option.cardId];
        /* Searched in two zones at once: where each card is, said beside it ("Bear, in your graveyard"). */
        if (awaiting.zones) return {...option, label: `${option.label}, in your ${ZONE_WORD[object?.zone] ?? object?.zone}`};
        return object?.faceDown === true && (object.lookers ?? []).includes(awaiting.player) ? {...option, label: object.faceDownCard?.card ?? option.label} : option;
      }),
    };
  },

  apply(state, awaiting, indices, extra = {}, rng = null) {
    if (awaiting.steps) {
      const picked = (indices ?? []).map((index) => stepCards(state, awaiting)[index]);
      if (picked.length > 1 || picked.some((id) => id === undefined)) throw new Error("Invalid selection");
      const next = {...awaiting, steps: {...awaiting.steps, found: [...awaiting.steps.found, ...picked], step: awaiting.steps.step + 1}};
      const over = awaiting.steps.sharing && !picked.length;
      while (!over && next.steps.step < next.steps.total && !stepCards(state, next).length) next.steps = {...next.steps, step: next.steps.step + 1};
      if (!over && next.steps.step < next.steps.total) {
        state.awaiting = next;
        return {events: [], again: true};
      }
      const {steps, ...rest} = next;
      return chooseCard.apply(state, {...rest, cards: steps.found, min: steps.found.length, max: steps.found.length}, steps.found.map((id, i) => i), extra, rng);
    }
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
      if (where.to === "stay") {
        found.push(id);
        /* Armored Skyhunter's Equipment, attached to the creature chosen (CR 701.3a; effects/permanents.mjs, attach). */
        if (awaiting.attaching !== undefined) events.push(...attach(state, {source: awaiting.attaching, targets: [id]}, {controller: player}));
        return;
      }
      const moved = moveOne(state, id, where.to, events, {owner: state.objects[id].owner, controller: awaiting.controller, tapped: where.tapped === true});
      if (moved !== null && state.objects[moved]) found.push(moved);
      if (moved !== null && state.objects[moved] && where.to === "battlefield") {
        arrivedHere.push(moved);
      }
    });
    if (awaiting.then && arrivedHere.length) afterwards(state, arrivedHere, awaiting.then, {controller: player, source: awaiting.source ?? null, ...(awaiting.about ? {about: awaiting.about} : {})});
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
    const adds = awaiting.remember === "add" ? {rememberAdd: true} : {};
    /* A library searched (CR 701.23), found or not: "if you search your library this way, shuffle" (Claim Jumper). */
    const searched = awaiting.zone === "library" ? {searched: true} : {};
    /* A player who chose a card has done what was offered (`did`, beside what it remembers): kept for "each opponent who
       didn't" (script/resolution.mjs, `whoDid`; script/bind.mjs). One who chose none has not. */
    const did = awaiting.did === true && chosen.length > 0 ? {did: player} : {};
    if (splice.length) return {events, splice, ...searched, ...(awaiting.remember ? {remembered: [...found, ...tops], ...adds} : {})};
    return awaiting.remember || awaiting.zone === "library" ? {events, ...searched, ...did, ...(awaiting.remember ? {remembered: [...found, ...tops], ...adds} : {})} : events;
  },

  /* The chooser has left the game. Their own cards went with them (CR 800.4a) -- a search of their library, a choice from
     their hand -- so nothing is chosen and nothing searched. Another player's cards, still there ("target opponent chooses
     two of those cards", Gifts Ungiven), are a choice another player makes (CR 800.4g). */
  left(state, awaiting) {
    return awaiting.cards.some((id) => state.objects[id]?.zone === awaiting.zone) ? {another: awaiting} : [];
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
/* "YOU MAY CAST AN ALLY SPELL FROM AMONG CARDS YOU OWN EXILED WITH THIS CREATURE" (Boiling Rock Rioter; `payMana`, CR 608.2g,
   601.2g-h): cast as the effect resolves, its mana cost paid -- colored symbols and all -- from the pool and the caster's
   plain mana sources (rules/mana.mjs, unlessPlans), one not offered when there is no way to pay it; which way, the
   caster's when there are more (CR 605.3a). NAMED: a card with {X} in its cost is not offered this way -- X would be its
   caster's to choose, and unlessPlans has no ways to pay one -- nor one with an additional cost to choose (castChoicesNow). */
const manaCostOf = (state, id, adventure) => (adventure ? state.objects[id].adventurer?.adventure?.manaCost : state.objects[id].manaCost) ?? "";
const payableCost = (state, player, cost) => !cost || unlessPlans(state, player, cost, 1).plans.length > 0;
/* "YOU MAY PLAY THE EXILED CARD WITHOUT PAYING ITS MANA COST" (Windbrisk Heights; `lands`, CR 305.2a): played, not only cast --
   a land card among them is played as a land (rules/actions.mjs, landChoicesNow: its player's turn, a land play left, CR
   305.2b, 305.3), for nothing, since a land has no mana cost. And a card exiled face down -- a hideaway card (CR 702.75a) -- is
   weighed as the card it is, its mana value and its targets too, since it is turned face up just before it is played (CR
   406.3a; rules/actions.mjs, withFaceUp); castNow plays it the same way. */
const playable = (state, player, pool, {most, free, anyMana, payMana = false, lands = false}) => {
  /* Its mana value as it would be cast: an adventurer card cast as its Adventure has the Adventure's (CR 715.3a). */
  const valueOf = (id, adventure = false) => {
    const cost = adventure ? state.objects[id].adventurer?.adventure?.manaCost : state.objects[id].manaCost;
    return cost ? manaValue(parseManaCost(cost)) : 0;
  };
  const owed = (id, adventure) => (free ? (state.objects[id].zone === "command" ? commanderTax(state, player, id) : 0) : anyMana ? valueOf(id, adventure) : null);
  /* A card cast a moment ago is on the stack as a new object (CR 400.7): its id here no longer names anything. */
  return pool.filter((id) => state.objects[id]).flatMap((id) => withFaceUp(state, id, () => [...(lands ? landChoicesNow(state, player, id) : []),
    ...(valueOf(id) <= most || (Boolean(state.objects[id].adventurer) && valueOf(id, true) <= most) ? castChoicesNow(state, player, id) : [])
      .filter((action) => valueOf(id, action.adventure === true) <= most).flatMap((action) => {
        if (payMana) {
          const cost = manaCostOf(state, id, action.adventure === true);
          return payableCost(state, player, cost) ? [{...action, cost}] : [];
        }
        const pay = owed(id, action.adventure === true);
        return pay === null || !canPayGeneric(state, player, pay) ? [] : [{...action, owed: pay}];
      })]));
};
export const play = {
  open(state, params, context) {
    const player = context.controller;
    if (!state.players[player]) return false;
    const most = params.manaValueAtMost === undefined ? Infinity : amountOf(state, params.manaValueAtMost, context);
    const from = params.from ?? "hand";
    /* Paradigm's copy, made in exile and castable free (CR 702.192a;
       rules/stack.mjs): the copy is made first, whatever is chosen, and is the one card that may be cast (CR 707.12). Not
       cast, it ceases to exist as a copy of a card outside the stack does (CR 704.5e, rules/sba.mjs). */
    const copied = params.copyOf ? addObject(state, {...structuredClone(params.copyOf), copy: true, owner: player, controller: player}, "exile") : null;
    /* "FOR EACH CARD EXILED THIS WAY, COPY IT, AND YOU MAY CAST THE COPY without paying its mana cost" (Mizzix's Mastery; CR
       707.12): each card it names copied in the zone it is in -- its copiable values (CR 707.2), the copy its caster's -- and
       the copies are what may be cast, each chosen for itself (707.12a; with `anyNumber`, one after another in the order
       its caster chooses, CR 608.2g). A copy not cast ceases to exist (CR 707.10a, 704.5e; rules/sba.mjs). */
    const copies = params.copies === true ? (params.targets ?? []).filter((id) => state.objects[id] && !["battlefield", "stack"].includes(state.objects[id].zone))
      .map((id) => {
        const card = state.objects[id];
        const values = Object.fromEntries(COPY_KEYS.filter((key) => card[key] !== undefined).map((key) => [key, structuredClone(card[key])]));
        return addObject(state, {...values, copy: true, owner: player, controller: player}, card.zone, card.zone === "exile" ? null : player);
      }) : null;
    const pool = copied !== null ? [copied] : copies !== null ? copies : from === "hand" ? cardsIn(state, "hand", player)
      : from === "command" ? cardsIn(state, "command", player).filter((id) => state.objects[id].commander === true)
      /* "From among cards you own exiled with this creature" (`from: "selector"`): the cards the selector finds now. */
      : from === "selector" ? selectMatching(state, {what: "card", ...(params.selector ?? {})}, context).filter((id) => !["battlefield", "stack"].includes(state.objects[id]?.zone))
      : (params.targets ?? []).filter((id) => state.objects[id] && !["battlefield", "stack"].includes(state.objects[id].zone)
        /* "For each player, you may cast a card that player milled this way" (The Ur-Sphinx): `ownedBy` "that player". */
        && (params.ownedBy !== "that player" || state.objects[id].owner === context.about?.player));
    const terms = {most, free: params.free === true, anyMana: params.anyMana === true, payMana: params.payMana === true, lands: params.lands === true};
    /* "If that spell would be put into a graveyard, exile it instead" (Halo Forager): the spell cast, so marked (rules/actions.mjs). */
    const exileInstead = params.exileInstead === true ? {exileInstead: true} : {};
    const choices = playable(state, player, pool, terms);
    if (!choices.length) return false;
    /* For `anyNumber`, what may still be cast and on what terms, to ask again (a number, not Infinity: state is JSON). */
    state.awaiting = {kind: "effect-choice", effect: "play", player, choices,
      ...(params.anyNumber === true ? {again: {pool, ...terms, most: Number.isFinite(most) ? most : null}, cast: 0} : {}), ...exileInstead,
      ...(terms.lands ? {lands: true} : {})};
    return true;
  },
  choice(state, awaiting) {
    /* What it still costs (a commander's tax, "for its mana value in any mana"): which mana pays, when that is a choice. */
    if (awaiting.paying) return paymentChoice(`play-mana:${awaiting.player}:${state.turn}:${awaiting.cast ?? 0}`, awaiting.paying.owed, paymentUnits(state, awaiting.player));
    /* Its mana cost, colors and all, when there is more than one way to pay it: which. */
    if (awaiting.planning) {
      const {units, plans} = unlessPlans(state, awaiting.player, awaiting.planning.cost);
      return {id: `play-plan:${awaiting.player}:${state.turn}:${awaiting.cast ?? 0}`, title: `Pay ${awaiting.planning.cost}: choose the mana`, mode: "one", min: 1, max: 1,
        options: plans.map((plan, index) => ({index, label: planWords(units, plan)}))};
    }
    /* Played, a land among them (`lands`): the question says "play". */
    const [title, decline] = awaiting.lands ? ["Play the card?", "Don't play"] : [awaiting.cast ? "Cast another spell?" : "Cast a spell?", "Don't cast"];
    return {id: `play:${awaiting.player}:${state.turn}${awaiting.again ? `:${awaiting.cast}` : ""}`, title, mode: "one", min: 1, max: 1,
      options: [...awaiting.choices.map((c, index) => ({index, label: c.targetNames?.length ? `${c.label} → ${c.targetNames.join(", ")}` : c.label, cardId: c.objectId})),
        {index: awaiting.choices.length, label: decline}]};
  },
  apply(state, awaiting, indices) {
    let chosen, events;
    if (awaiting.planning) {
      chosen = awaiting.choices[awaiting.planning.index];
      const {units, plans} = unlessPlans(state, awaiting.player, awaiting.planning.cost);
      const plan = plans[(indices ?? [])[0]];
      if (!plan || (indices ?? []).length !== 1) throw new Error("Invalid selection");
      events = payPlan(state, awaiting.player, units, plan);
    } else if (awaiting.paying) {
      chosen = awaiting.choices[awaiting.paying.index];
      events = payWithUnits(state, awaiting.player, paymentUnits(state, awaiting.player), indices, awaiting.paying.owed);
    } else {
      const index = (indices ?? [])[0];
      if (index === awaiting.choices.length) return {events: []};
      chosen = awaiting.choices[index];
      if (!chosen) throw new Error("Invalid selection");
      /* Its mana cost, colors and all (`payMana`): the one way there is, paid at once; more, and which is asked. */
      if (chosen.cost !== undefined) {
        const {units, plans} = chosen.cost ? unlessPlans(state, awaiting.player, chosen.cost) : {units: [], plans: []};
        if (chosen.cost && !plans.length) throw new Error(`${chosen.cost} can no longer be paid`);
        if (plans.length > 1) {
          state.awaiting = {...awaiting, planning: {index, cost: chosen.cost}};
          return {events: [], again: true};
        }
        events = plans.length ? payPlan(state, awaiting.player, units, plans[0]) : [];
      } else
      /* Which mana pays what it still costs is the player's when the ways differ (rules/mana.mjs, paymentUnits). */
      if (chosen.owed && paymentIsAChoice(paymentUnits(state, awaiting.player), chosen.owed)) {
        state.awaiting = {...awaiting, paying: {index, owed: chosen.owed}};
        return {events: [], again: true};
      }
      if (chosen.cost === undefined) events = chosen.owed ? payGeneric(state, awaiting.player, chosen.owed) : [];
    }
    const action = {...chosen};
    delete action.owed;
    delete action.cost;
    events.push(...castNow(state, awaiting.player, action, awaiting.exileInstead ? {graveyardToExile: true} : {}));
    /* Any number: asked again, of what is still there to cast. */
    if (awaiting.again) {
      const {pool, most, free, anyMana, payMana} = awaiting.again;
      const choices = playable(state, awaiting.player, pool, {most: most ?? Infinity, free, anyMana, payMana});
      if (choices.length) {
        const next = {...awaiting, choices, cast: awaiting.cast + 1};
        delete next.paying;
        delete next.planning;
        state.awaiting = next;
        return {events, again: true};
      }
    }
    return {events};
  },
};

/* ---- a commander going to its owner's hand or library (CR 903.9b) ----

   A commander on its way to its owner's hand or library from anywhere may go to the command zone instead, if its owner
   chooses. A replacement, so it is asked BEFORE the move -- the card is never seen in the hand -- and of the OWNER. The
   resolution puts this question in front of a moveZone that would move a commander there (script/resolution.mjs): each
   owner in turn order from the active player (CR 101.4), and then the move happens, with the commanders whose owners said
   yes going to the command zone instead (effects/zones.mjs, `commanderHome`). Moved as a whole, so nothing moves before
   every owner has answered. A move other than moveZone (a cost that returns a permanent to its owner's hand) is named,
   not built. */
// A merged commander is asked about by physical card (CR 903.9c), independently of its other components.
const commanderPiece = (state, ref) => typeof ref === "string" && ref.startsWith("merged:")
  ? state.objects[ref.split(":")[1]]?.merged?.[Number(ref.split(":")[2])]?.physical : state.objects[ref];
export function commandersGoingHome(state, params) {
  if (params.commandersAsked) return [];
  /* "Counter target spell. If that spell is countered this way, put it on top of its owner's library instead" (Memory
     Lapse): a commander spell, unless it can't be countered or would be exiled instead (CR 702.34a). */
  if (params.effect === "counterSpell") {
    return (params.spells ?? []).filter((id) => {
      const entry = state.stack.find((e) => e.objectId === id);
      const library = params.to === "top" || ([undefined, "graveyard"].includes(params.to) && entry?.graveyardToLibraryBottom);
      return library && state.objects[id]?.commander === true && entry && !entry.flashback && !entry.graveyardToExile && !cantBeCountered(state, id)
        /* A permanent spell exiled instead (Thranduil's Decree; effects/zones.mjs, counterSpell) goes to no library. */
        && !(params.permanentTo === "exile" && entry.permanent === true);
    });
  }
  if (params.sacrifice === true || params.fromTop !== undefined) return [];
  return (params.targets ?? []).filter((id) => {
    const bottom = params.to === "graveyard" && state.stack.some(e => e.objectId === id && e.graveyardToLibraryBottom && !e.flashback && !e.graveyardToExile);
    return (["hand", "library"].includes(params.to) || bottom) && state.objects[id]?.commander === true && state.objects[id].zone !== params.to;
  }).flatMap(id => state.objects[id].merged ? state.objects[id].merged.flatMap((part, i) => part.physical.commander === true ? [`merged:${id}:${i}`] : []) : [id]);
}
export const commanderHome = {
  open(state, params) {
    const seats = state.players.length, apnap = (id) => (commanderPiece(state, id).owner - (state.activePlayer ?? 0) + seats) % seats;
    const queue = [...params.commanders].sort((a, b) => apnap(a) - apnap(b));
    state.awaiting = {kind: "effect-choice", effect: "commanderHome", player: commanderPiece(state, queue[0]).owner, objectId: queue[0], remaining: queue.slice(1),
      home: [], move: params.move};
    return true;
  },
  choice(state, awaiting) {
    return {id: `commander-home:${state.turn}:${awaiting.objectId}`, title: `Put ${commanderPiece(state, awaiting.objectId)?.card ?? "your commander"} into the command zone instead?`,
      mode: "boolean", min: 1, max: 1,
      options: [{index: 0, label: "Put it into the command zone"}, {index: 1, label: `Let it go to your ${awaiting.move.to === "top" || ([undefined, "graveyard"].includes(awaiting.move.to) && state.stack.some(e => e.objectId === awaiting.objectId && e.graveyardToLibraryBottom)) ? "library" : awaiting.move.to}`}]};
  },
  apply(state, awaiting, indices) {
    if (!Array.isArray(indices) || indices.length !== 1 || ![0, 1].includes(indices[0])) throw new Error("Answer yes or no");
    const home = indices[0] === 0 ? [...awaiting.home, awaiting.objectId] : awaiting.home;
    const [next, ...rest] = (awaiting.remaining ?? []).filter((id) => commanderPiece(state, id));
    if (next !== undefined) {
      state.awaiting = {...awaiting, player: commanderPiece(state, next).owner, objectId: next, remaining: rest, home};
      return {events: [], again: true};
    }
    return {events: [], splice: [{...awaiting.move, commandersAsked: true, ...(home.length ? {commanderHome: home.filter(id => typeof id !== "string" || !id.startsWith("merged:")),
      commanderKeys: home.filter(id => typeof id === "string" && id.startsWith("merged:")).map(id => commanderPiece(state, id).commanderKey)} : {})}]};
  },
  /* Its owner has left the game, and the commander with them (CR 800.4a): it goes nowhere, and the next owner is asked. */
  left(state, awaiting) {
    return commanderHome.apply(state, awaiting, [1]);
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
  /* The player it would be dealt to, or the controller of the permanent, has left the game: the effect again as it now
     stands, without this order -- what would have hit them hits nothing that left with them, and the rest is asked about
     and dealt as before (CR 800.4a, 616.1). */
  left(state, awaiting) {
    return {events: [], splice: [{...awaiting.damage, damageOrders: awaiting.answers}]};
  },
};

/* ---- the order of the effects that change counters put on (CR 616.1) ----

   Two or more replacement effects would change how many counters one effect puts on a permanent, and the order changes
   how many: Hardened Scales' "plus one" and Branching Evolution's "twice that many", one +1/+1 counter on Rob's Bear -- 4
   or 3. The permanent's controller chooses which applies first; asked BEFORE any of the effect's counters are put, a
   placement at a time, and then the effect is done with every answer (`counterOrders`, by placement). The resolution puts
   this question in front of a putCounter or putCounterAll that has one (script/resolution.mjs); an order that ends the
   same either way is never asked (rules/statics.mjs, placeCounters). */
export const orderCounters = {
  /* Opened only with the question the resolution found in front of it (`question`), so there is always one to ask. */
  open(state, params) {
    const {question} = params;
    state.awaiting = {kind: "effect-choice", effect: "orderCounters", player: question.player, key: question.key, id: question.id, counter: question.kind,
      count: question.count, by: question.by, options: question.options, answered: (params.answers[question.key] ?? []).length, answers: params.answers, put: params.put};
    return true;
  },
  choice(state, awaiting) {
    return counterOrderChoice(state, awaiting);
  },
  /* The effect itself again, with this answer added, where it stood in the resolution: asked once more while another of
     its placements is still to be ordered, and done once none is. */
  apply(state, awaiting, indices) {
    const chosen = Array.isArray(indices) && indices.length === 1 ? awaiting.options[indices[0]] : undefined;
    if (chosen === undefined) throw new Error("Invalid selection");
    const answers = {...awaiting.answers, [awaiting.key]: [...(awaiting.answers[awaiting.key] ?? []), chosen]};
    return {events: [], splice: [{...awaiting.put, counterOrders: answers}]};
  },
  /* The permanent's controller has left the game, and the permanent with them (CR 800.4a): the effect again as it now
     stands, the rest asked about and put on as before. */
  left(state, awaiting) {
    return {events: [], splice: [{...awaiting.put, counterOrders: awaiting.answers}]};
  },
};

/* ---- explore (CR 701.44) ----

   "Target creature you control explores" (a Map token's, CR 111.10s; Restless Anchorage makes them): the exploring
   permanent's controller reveals the top card of their library (CR 701.44a). A land card goes to their hand. Anything
   else -- or nothing, a library with no card to reveal -- puts a +1/+1 counter on the exploring permanent, if it is still
   on the battlefield, and that player may put the revealed card into their graveyard: one question, surveil's shape, the
   card shown to every seat while it is open. One no longer on the battlefield is told whose by its last known information
   (701.44c). One permanent explores, the first of `targets`; it has explored whatever of this could be done (701.44b) --
   nothing here triggers on that yet. */
export const explore = {
  open(state, params, context) {
    const [id] = params.targets ?? [];
    if (id === undefined || id === null) return false;
    const here = state.objects[id]?.zone === "battlefield";
    const player = here ? controllerOf(state, id) : context.lastKnown?.cardId === id ? context.lastKnown.controller : context.controller;
    if (!state.players[player] || state.players[player].lost) return false;
    const [top] = cardsIn(state, "library", player);
    const events = top === undefined ? [] : revealedEvents(state, player, [top]);
    if (top !== undefined && typesOf(state, top).includes("Land")) {
      moveOne(state, top, "hand", events, {owner: player});
      return {events};
    }
    if (here) addCounters(state, id, "+1/+1", 1, events, player);
    if (top === undefined) return {events};
    state.resolving?.events.push(...events);
    showRevealed(state, player, [top]);
    state.awaiting = {kind: "effect-choice", effect: "explore", player, cards: [top]};
    return true;
  },
  choice(state, awaiting) {
    return {id: `explore:${awaiting.cards.join(",")}`, title: `Explore: you may put ${state.objects[awaiting.cards[0]]?.card ?? "the revealed card"} into your graveyard`,
      mode: "many", min: 0, max: 1, options: cardOptions(state, awaiting.cards)};
  },
  apply(state, awaiting, indices) {
    const events = [];
    unshowRevealed(state, awaiting.player);
    const chosen = (indices ?? []).map((index) => awaiting.cards[index]).filter((id) => id !== undefined && state.objects[id]?.zone === "library");
    for (const id of chosen) moveOne(state, id, "graveyard", events, {owner: state.objects[id].owner});
    return events;
  },
  /* The exploring player has left the game, their library with them (CR 800.4a): nothing to put anywhere. */
  left(state, awaiting) {
    unshowRevealed(state, awaiting.player);
    return [];
  },
};

/* ---- the order of the effects that change tokens made (CR 616.1) ----

   Two or more replacement effects would change the tokens one effect makes, and the order changes what is made: Anointed
   Procession's "twice that many of those tokens" and Queen Allenal of Ruadach's "those tokens plus a 1/1 white Soldier" --
   one Elemental becomes two and a Soldier, or two and two Soldiers. The tokens' controller chooses which applies first;
   asked BEFORE any is made, an event at a time (a copy effect's, each original), and then the effect is done with every
   answer (`tokenOrders`, by event). The resolution puts this question in front of a createToken or copyPermanent that has
   one (script/resolution.mjs; effects/permanents.mjs, tokenQuestion); an order that ends the same either way is never
   asked (rules/statics.mjs, tokensCreated). */
export const orderTokens = {
  /* Opened only with the question the resolution found in front of it (`question`), so there is always one to ask. */
  open(state, params) {
    const {question} = params;
    state.awaiting = {kind: "effect-choice", effect: "orderTokens", player: question.player, key: question.key, controller: question.controller,
      count: question.count, values: question.values, options: question.options, answered: question.answered, answers: params.answers, make: params.make};
    return true;
  },
  choice(state, awaiting) {
    return tokenOrderChoice(state, awaiting);
  },
  /* The effect itself again, with this answer added, where it stood in the resolution: asked once more while an order is still
     to be chosen, and done once none is. */
  apply(state, awaiting, indices) {
    const chosen = Array.isArray(indices) && indices.length === 1 ? awaiting.options[indices[0]] : undefined;
    if (chosen === undefined) throw new Error("Invalid selection");
    const answers = {...awaiting.answers, [awaiting.key]: [...(awaiting.answers[awaiting.key] ?? []), chosen]};
    return {events: [], splice: [{...awaiting.make, tokenOrders: answers}]};
  },
  /* The tokens' controller has left the game: none is made under their control (CR 800.4a; effects/permanents.mjs). */
  left(state, awaiting) {
    return {events: [], splice: [{...awaiting.make, tokenOrders: awaiting.answers}]};
  },
};

/* ---- whose Alms Collector replaces a draw (CR 616.1) ----

   Maya would draw three cards, and Rob's and Trey's Alms Collectors would each replace it: "instead you and that player each
   draw a card". Whichever applies first ends it -- Maya then draws one, which neither replaces -- so the two end differently,
   and Maya chooses (CR 616.1), before any card is drawn. The answer is kept by drawing player (`drawOrders`), and the draw
   done with it (effects/zones.mjs, draw). Opened only with the question the resolution found (script/resolution.mjs). */
export const orderDraws = {
  open(state, params) {
    const {question} = params;
    state.awaiting = {kind: "effect-choice", effect: "orderDraws", player: question.player, options: question.options, count: question.count,
      answers: params.answers, draw: params.draw};
    return true;
  },
  choice(state, awaiting) {
    const name = (p) => state.players[p].name;
    /* Each option by its effect's card -- "Rob's Alms Collector" -- and what it does; one whose controller has since left the
       game, with it, is said to be gone (CR 800.4a). */
    const held = staticAbilities(state);
    const card = (you) => state.objects[state.zones.battlefield.find((id) => state.objects[id].controller === you
      && held(id).some((a) => a.kind === "static" && a.rule === "draws-instead"))]?.card;
    return {id: `order-draws:${state.turn}:${awaiting.player}`, title: `${name(awaiting.player)} would draw ${awaiting.count} cards: whose replacement applies?`,
      mode: "one", min: 1, max: 1,
      options: awaiting.options.map((you, index) => ({index, player: you,
        label: card(you) ? `${name(you)}'s ${card(you)}: ${name(you)} and ${name(awaiting.player)} each draw a card` : "An effect no longer there"}))};
  },
  apply(state, awaiting, indices) {
    const chosen = Array.isArray(indices) && indices.length === 1 ? awaiting.options[indices[0]] : undefined;
    if (chosen === undefined) throw new Error("Invalid selection");
    return {events: [], splice: [{...awaiting.draw, drawOrders: {...awaiting.answers, [awaiting.player]: chosen}}]};
  },
  /* The drawing player has left the game: there is no draw of theirs to replace (CR 800.4a), and the rest goes on. */
  left(state, awaiting) {
    return {events: [], splice: [{...awaiting.draw, drawOrders: awaiting.answers}]};
  },
};

/* ---- connive (CR 701.50; Train B, X11) ----

   "Each creature that convoked this spell connives" (Lethal Scheme): several permanents told to connive at once. The first
   player in APNAP order who controls one or more of those still to connive chooses which connives next -- it connives, and
   then the next is chosen the same way (701.50c), so what one draws may decide which goes next. That question is this one,
   asked only of a player with two or more still to connive; one, and it is that one. What conniving is -- the draw, the
   discard, the counter -- script/resolution.mjs puts in the queue (`connive`), so each is the draw, the discard and the
   counter it is everywhere else. */
export const conniveWhich = {
  open(state, params) {
    if (!(params.theirs ?? []).length) return false;
    state.awaiting = {kind: "effect-choice", effect: "conniveWhich", player: params.player, theirs: params.theirs, rest: params.rest ?? [], n: params.n ?? 1};
    return true;
  },
  choice(state, awaiting) {
    return {id: `connive:${awaiting.player}:${state.turn}:${awaiting.theirs.length}`, title: "Choose which of them connives next", mode: "one", min: 1, max: 1,
      options: awaiting.theirs.map((c, index) => ({index, label: state.objects[c.id]?.card ?? "A creature that has left the battlefield", cardId: c.id}))};
  },
  apply(state, awaiting, indices) {
    const chosen = Array.isArray(indices) && indices.length === 1 ? awaiting.theirs[indices[0]] : undefined;
    if (!chosen) throw new Error("Invalid selection");
    const rest = [...awaiting.theirs.filter((c) => c !== chosen), ...awaiting.rest];
    return {events: [], splice: [{effect: "connive", one: chosen, count: awaiting.n}, ...(rest.length ? [{effect: "connive", conniving: rest, count: awaiting.n}] : [])]};
  },
  /* Their controller has left the game: the conniving goes on without them, whose draw and discard there is no one to make
     (CR 800.4a; script/resolution.mjs, connive, leaves out a player no longer in the game). */
  left(state, awaiting) {
    return {events: [], splice: [{effect: "connive", conniving: [...awaiting.theirs, ...awaiting.rest], count: awaiting.n}]};
  },
};

/* ---- control given away, a different opponent for each (Train E: Dack Fayden, Helping Hand) ----

   "For each of those permanents, choose a different opponent. Each opponent gains control of the permanent for which they
   were chosen": gainControl's `toEach: "different opponent"`, put here by the resolution (script/resolution.mjs). Its
   controller chooses (CR 608.2d), permanent by permanent in the order the effect names them, among the opponents still in
   the game not chosen yet (CR 102.3, 800.4a) -- with one left, the rules leave no choice and nobody is asked; with none, the
   rest stay where they are. Then each opponent gains control of theirs, at once and for good (CR 613.1b;
   effects/permanents.mjs, gainControl). One gone from the battlefield since is a new object (CR 400.7), and none of them. */
const unchosenOpponents = (awaiting, given) => awaiting.opponents.filter((player) => !given.includes(player));
function giveEachAway(state, awaiting) {
  let given = awaiting.given;
  while (given.length < awaiting.permanents.length) {
    const left = unchosenOpponents(awaiting, given);
    if (left.length > 1) {
      state.awaiting = {...awaiting, given};
      return true;
    }
    if (!left.length) break;
    given = [...given, left[0]];
  }
  for (const [i, player] of given.entries()) gainControl(state, {targets: [awaiting.permanents[i]], toPlayer: player}, {controller: awaiting.player, source: awaiting.source});
  return {events: []};
}
export const controlToOpponents = {
  open(state, params, context) {
    const permanents = [...new Set(params.then.targets ?? [])].filter((id) => state.objects[id]?.zone === "battlefield");
    const opponents = state.players.filter((p) => p.id !== context.controller && !p.lost).map((p) => p.id);
    return giveEachAway(state, {kind: "effect-choice", effect: "controlToOpponents", player: context.controller, source: context.source ?? null, permanents, opponents, given: []});
  },
  choice(state, awaiting) {
    const id = awaiting.permanents[awaiting.given.length];
    return {id: `controlToOpponents:${awaiting.player}:${state.turn}:${id}`, title: `Choose an opponent to gain control of ${state.objects[id]?.card ?? "that permanent"}`,
      mode: "one", min: 1, max: 1, options: unchosenOpponents(awaiting, awaiting.given).map((player, index) => ({index, label: state.players[player].name, playerId: player}))};
  },
  apply(state, awaiting, indices) {
    const player = Array.isArray(indices) && indices.length === 1 ? unchosenOpponents(awaiting, awaiting.given)[indices[0]] : undefined;
    if (player === undefined) throw new Error("Invalid selection");
    const outcome = giveEachAway(state, {...awaiting, given: [...awaiting.given, player]});
    return outcome === true ? {events: [], again: true} : outcome;
  },
  /* Its controller has left the game: their ability left with them (CR 800.4a), and nobody gains anything. */
  left() {
    return {events: []};
  },
};

/* ---- which kind of counter (CR 122.1; Train B, X11) ----

   "Choose a counter on target permanent. Put an additional counter of that kind on that permanent" (Ichormoon Gauntlet),
   "move a counter from target creature you control onto a second target creature you control" (Tidus, Yuna's Guardian): a
   putCounter or moveCounters whose kind of counter is its controller's to choose (`counter: "chosen"`), put here by the
   resolution before it is done (script/resolution.mjs). The options are the kinds of counter on the object it is read
   from -- the moveCounters' `from`, the putCounter's target -- since counters of one kind are alike; the effect follows
   with the kind chosen. One kind there, and the rules leave no choice: it is that one, and nobody is asked. None, or the
   object gone from the battlefield, and there is no counter to choose: the effect does nothing (CR 122.5, for a move). */
const COUNTER_KIND_EFFECTS = {putCounter, moveCounters};
const countersOn = (state, id) => (id !== undefined && state.objects[id]?.zone === "battlefield"
  ? Object.entries(state.objects[id].counters ?? {}).filter(([, n]) => n > 0).map(([kind, n]) => ({kind, n})) : []);
export const counterKind = {
  open(state, params, context) {
    const then = params.then;
    const [on] = (then.effect === "moveCounters" ? then.from : then.targets) ?? [];
    const kinds = countersOn(state, on);
    if (kinds.length < 2) return {events: kinds.length ? COUNTER_KIND_EFFECTS[then.effect](state, {...then, counter: kinds[0].kind}, context) : []};
    state.awaiting = {kind: "effect-choice", effect: "counterKind", player: context.controller, on, kinds, then};
    return true;
  },
  choice(state, awaiting) {
    const name = state.objects[awaiting.on]?.card ?? "that permanent";
    return {id: `counterKind:${awaiting.player}:${state.turn}:${awaiting.on}`, title: `Choose a kind of counter on ${name}`, mode: "one", min: 1, max: 1,
      options: awaiting.kinds.map((k, index) => ({index, label: `${k.kind} counter (${k.n} on ${name})`, cardId: awaiting.on}))};
  },
  apply(state, awaiting, indices) {
    const chosen = Array.isArray(indices) && indices.length === 1 ? awaiting.kinds[indices[0]] : undefined;
    if (!chosen) throw new Error("Invalid selection");
    return {events: COUNTER_KIND_EFFECTS[awaiting.then.effect](state, {...awaiting.then, counter: chosen.kind}, {controller: awaiting.player})};
  },
};

/* ---- which counters to remove (CR 122.1, 608.2d; Train C, w2d) ----

   "Remove up to three counters from another target creature or planeswalker" (Mabel, Bitter Recluse): a removeCounter of
   any kinds (`counter: "any"`), `count` of them in all, "up to" (`upTo`) as few as none -- which ones its controller chooses
   as it resolves, among the counters on its target then; put here by the resolution before it is done
   (script/resolution.mjs). Each counter is an option, as many of each kind as could be removed; the effect follows with the
   answer, how many of each kind (`removing`), so "for each counter removed this way" counts them (effects/resources.mjs).
   Nothing on it, or it gone, and there is nothing to choose; and where every counter there must go, the rules leave no
   choice: nobody is asked either way. */
export const countersToRemove = {
  open(state, params, context) {
    const then = params.then, [on] = then.targets ?? [], most = Math.max(0, then.count ?? 1);
    const units = countersOn(state, on).flatMap(({kind, n}) => Array.from({length: Math.min(n, most)}, () => kind));
    const min = then.upTo === true ? 0 : Math.min(most, units.length);
    if (min === units.length) {
      const removing = {};
      for (const kind of units) removing[kind] = (removing[kind] ?? 0) + 1;
      return {events: removeCounter(state, {...then, removing}, context)};
    }
    state.awaiting = {kind: "effect-choice", effect: "countersToRemove", player: context.controller, on, units, min, max: Math.min(most, units.length), then};
    return true;
  },
  choice(state, awaiting) {
    const name = state.objects[awaiting.on]?.card ?? "that permanent";
    const options = awaiting.units.map((kind, index) => ({index, label: `${kind} counter`, cardId: awaiting.on, counter: kind}));
    for (const option of options) {
      const alike = options.filter((o) => o.counter === option.counter);
      if (alike.length > 1 && option === alike[0]) alike.forEach((o, k) => { o.label = `${o.label} (${k + 1})`; });
    }
    return {id: `remove-counters:${awaiting.player}:${state.turn}:${awaiting.on}`,
      title: `Remove ${awaiting.min === 0 ? "up to " : ""}${awaiting.max} counter${awaiting.max === 1 ? "" : "s"} from ${name}`,
      mode: "many", min: awaiting.min, max: awaiting.max, options};
  },
  apply(state, awaiting, indices) {
    const picked = [...new Set(indices ?? [])];
    if (picked.length !== (indices ?? []).length || picked.length < awaiting.min || picked.length > awaiting.max || picked.some((i) => awaiting.units[i] === undefined))
      throw new Error("Invalid selection");
    const removing = {};
    for (const i of picked) removing[awaiting.units[i]] = (removing[awaiting.units[i]] ?? 0) + 1;
    return {events: [], splice: [{...awaiting.then, removing}]};
  },
  /* Its controller has left the game, and the ability with them (CR 800.4a): nothing is removed. */
  left() {
    return {events: []};
  },
};

/* ---- counters moved onto permanents, split (CR 122.5; Train C, w2d) ----

   "You may move any number of +1/+1 counters from this creature onto other creatures" (Forgotten Ancient): a moveCounters
   onto any of what `onto` describes (`anyNumber`), up to as many of its kind as are on `from`, where each goes its
   controller's choice -- asked a counter at a time, each permanent `onto` matches an option, and "No more" -- and then
   every one moved at once: off the source together, and onto each permanent together, so what changes counters put on
   sees one placement on each (CR 122.6, 616.1). Put here by the resolution before it is done (script/resolution.mjs).
   Nothing on it, or nothing to move them onto, and nobody is asked. */
const ontoName = (state, awaiting, id) => {
  const alike = awaiting.candidates.filter((other) => state.objects[other]?.card === state.objects[id]?.card);
  return alike.length > 1 ? `${state.objects[id].card} (${alike.indexOf(id) + 1})` : state.objects[id]?.card ?? "A permanent no longer there";
};
function countersMovedOnto(state, awaiting) {
  const events = [], source = state.objects[awaiting.from], kind = awaiting.counter;
  /* All or nothing (CR 122.5): the source still there with as many, each destination still there. */
  const plan = awaiting.plan.filter((id) => state.objects[id]?.zone === "battlefield");
  if (!plan.length || source?.zone !== "battlefield" || (source.counters?.[kind] ?? 0) < plan.length) return events;
  const before = source.counters[kind];
  source.counters[kind] = before - plan.length;
  events.push(event("GameEventCardCounters", state, {card: cardRef(state, awaiting.from), type: kind, oldValue: before, newValue: source.counters[kind]}));
  for (const id of awaiting.candidates) {
    const n = plan.filter((to) => to === id).length;
    if (n > 0) addCounters(state, id, kind, n, events, awaiting.player);
  }
  return events;
}
export const countersOnto = {
  open(state, params, context) {
    const then = params.then, [from] = then.from ?? [], kind = then.counter;
    const n = from !== undefined && state.objects[from]?.zone === "battlefield" ? state.objects[from].counters?.[kind] ?? 0 : 0;
    const candidates = selectMatching(state, then.onto, context).filter((id) => id !== from);
    if (n === 0 || !candidates.length) return false;
    state.awaiting = {kind: "effect-choice", effect: "countersOnto", player: context.controller, from, counter: kind, remaining: n, candidates, plan: []};
    return true;
  },
  choice(state, awaiting) {
    const name = state.objects[awaiting.from]?.card ?? "that permanent";
    const moved = awaiting.plan.length ? `; ${awaiting.plan.length} chosen` : "";
    return {id: `move-counters:${awaiting.player}:${state.turn}:${awaiting.from}:${awaiting.plan.length}`,
      title: `Move a ${awaiting.counter} counter from ${name} onto (${awaiting.remaining} left${moved})`, mode: "one", min: 1, max: 1,
      options: [...awaiting.candidates.map((id, index) => ({index, label: ontoName(state, awaiting, id), cardId: id})), {index: awaiting.candidates.length, label: "No more"}]};
  },
  apply(state, awaiting, indices) {
    const i = Array.isArray(indices) && indices.length === 1 ? indices[0] : undefined;
    if (!(Number.isInteger(i) && i >= 0 && i <= awaiting.candidates.length)) throw new Error("Invalid selection");
    if (i === awaiting.candidates.length) return {events: countersMovedOnto(state, awaiting)};
    const next = {...awaiting, plan: [...awaiting.plan, awaiting.candidates[i]], remaining: awaiting.remaining - 1};
    if (next.remaining === 0) return {events: countersMovedOnto(state, next)};
    state.awaiting = next;
    return {events: [], again: true};
  },
  /* Its controller has left the game, and the ability with them (CR 800.4a): nothing moves. */
  left() {
    return {events: []};
  },
};

/* ---- orderDestruction (CR 616.1): a destroy whose destruction of one permanent two or more effects would replace, ending
   differently -- two Auras with umbra armor, or one and a regeneration shield -- asks that permanent's controller which,
   before anything is destroyed (effects/zones.mjs, destructionQuestion; script/resolution.mjs puts this in the destroy's place
   only when there is one); then the destroy again, with the answer, asking the next such permanent's controller or
   destroying. ---- */
export const orderDestruction = {
  open(state, params, context) {
    state.awaiting = {kind: "effect-choice", effect: "orderDestruction", ...destructionQuestion(state, params.destroy, context), destroy: params.destroy};
    return true;
  },
  choice(state, awaiting) {
    return destructionChoice(state, awaiting);
  },
  apply(state, awaiting, indices) {
    const key = Array.isArray(indices) && indices.length === 1 ? awaiting.options[indices[0]] : undefined;
    if (key === undefined) throw new Error("Invalid selection");
    return {events: [], splice: [{...awaiting.destroy, destructionAnswers: {...(awaiting.destroy.destructionAnswers ?? {}), [awaiting.objectId]: key}}]};
  },
};

/* ---- who makes a choice in place of a player who has left the game (CR 800.4g) ----

   A spell or ability asked a player for a choice other than whether to pay, and they have left the game: its controller
   chooses another player to make it -- another opponent, the one who left having been an opponent -- and that player is
   asked the same question. Put here by the resolution when there are two or more to choose between (script/resolution.mjs,
   answerDeparted); never written in a card script. */
export const chooseInstead = {
  choice(state, awaiting) {
    return {id: `choose-instead:${awaiting.departed}:${state.turn}`, title: `${state.players[awaiting.departed].name} has left the game: choose who makes their choice`,
      mode: "one", min: 1, max: 1, options: awaiting.players.map((p, index) => ({index, label: state.players[p].name, playerId: p}))};
  },
  apply(state, awaiting, indices) {
    const player = Array.isArray(indices) && indices.length === 1 ? awaiting.players[indices[0]] : undefined;
    if (player === undefined) throw new Error("Invalid selection");
    state.awaiting = {...awaiting.question, player};
    return {events: [], again: true};
  },
};

export const ASKING = Object.freeze({
  orderMerged: {
    open(state) { const ask = mergedOrderToAsk(state); if (!ask) return false; state.awaiting = {...ask, kind: "effect-choice", effect: "orderMerged"}; return true; },
    choice: mergedOrderChoice, apply: finishMergedOrder,
    left(state, awaiting) { return finishMergedOrder(state, awaiting, awaiting.cards.map((_, i) => i)); },
  },
  mergePermanent, ringTempts, twoPiles, scry, rearrangeTop, surveil, dig, discard, modal, chooseCard, proliferate, sacrifice, populate, amass, unlessPays, copySpell, chooseType, chooseColor, play, changeTargets, attackWhom, enchantWhat, commanderHome, orderDamage, orderCounters, orderTokens, orderDraws, explore,
  conniveWhich, manaColors, counterKind, countersToRemove, countersOnto, orderDestruction, chooseInstead, chooseSource, vote,
  /* Wave 4c: a hand looked at (Gitaxian Probe). */
  handLook,
  /* Train E: a different opponent for each permanent given away (Dack Fayden, Helping Hand). */
  controlToOpponents,
  /* Wave 4c, k2: a draw, or a dredge in its place (CR 702.52a). */
  dredgeDraw});
