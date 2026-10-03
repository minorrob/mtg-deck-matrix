/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* EFFECT PRIMITIVES THAT MOVE CARDS.
 *
 * `docs/engine/PLAN.md` §12.2, Zones. Five of the measured top twenty-five live here, and between
 * them they are the most-used thing in Rob's decks: `ChangeZone` alone is 100 of the 821 API uses
 * across his seven.
 *
 * EVERY ONE OF THEM MAKES A NEW OBJECT (CR 400.7). `moveObject` returns a new id and the old one
 * stops existing, so an effect that moves a card and then wants to do something else to it must use
 * what came back. Inside a primitive this is the easiest rule in the kernel to forget, because the
 * id it was handed is right there and still reads fine.
 *
 * DESTROY IS NOT A ZONE CHANGE WITH A NICER NAME (CR 701.8). Indestructible stops it and does not
 * stop a "put into its owner's graveyard" effect, regeneration replaces it, and a creature that
 * cannot be destroyed can still be sacrificed. Keeping them separate is what makes those three
 * behave differently later.
 */

import {holdArrival} from "../../rules/entering.mjs";
import {afterwards, delayedTrigger, enchantable, enchantOnArrival} from "./permanents.mjs";
import {typesOf} from "../../rules/layers.mjs";
import {moveObject, cardsIn, PUBLIC_ZONES, removeObject} from "../../state/index.mjs";
import {lastKnown} from "../../rules/layers.mjs";
import {keywordsOf} from "../../rules/layers.mjs";
import {selectMatching, compileSelector} from "../filter.mjs";
import {applyReplacements, enteringModifications, regenerated} from "../../rules/replacement.mjs";
import {cantBeCountered, entersUntapped} from "../../rules/statics.mjs";
import {amountOf} from "../amount.mjs";
import {manaValue, parseManaCost} from "../../rules/mana.mjs";

const ZONE_LABEL = {
  library: "Library", hand: "Hand", battlefield: "Battlefield",
  graveyard: "Graveyard", exile: "Exile", stack: "Stack", command: "Command",
};
/* Which zones belong to a player, so a move knows whose to put it in. */
const PER_PLAYER = ["library", "hand", "graveyard", "command"];


export const event = (kind, state, fields) => ({kind, data: {turn: state.turn, phase: state.phase, fields}});

export const cardRef = (state, id) => {
  const o = state.objects[id];
  return o ? {cardId: o.id, name: o.card, owner: o.owner, controller: o.controller, faceDown: false} : null;
};

/**
 * Move one object, through the replacement effects, and report where it actually went.
 *
 * Shared by everything here, because "the destination an effect asked for" and "the zone the card
 * reached" are two different things the moment anything on the board says "instead" (CR 614).
 */
export function moveOne(state, id, to, events, {owner = null, tapped = false} = {}) {
  const object = state.objects[id];
  if (!object) return null;
  const from = object.zone;
  const card = cardRef(state, id);
  /* Only a departure from the battlefield needs last known information (CR 113.7a): that is the
     zone where an object had characteristics worth remembering. A card moving hand to graveyard
     was never a 5/5. */
  const leftBehind = from === "battlefield" ? lastKnown(state, id) : undefined;

  const {proposal} = applyReplacements(state, {
    event: "zone-change", objectId: id, from, to, player: object.controller,
  });
  /* A spell an effect moves off the stack ("then return it to its owner's hand") is no longer on it: its entry goes too.
     Cast with flashback, it is exiled instead of going anywhere else (CR 702.34a). */
  const leaving = from === "stack" ? state.stack.findIndex((entry) => entry.objectId === id) : -1;
  /* Cast "this way" by Kess: to exile only instead of a graveyard. */
  const destination = leaving >= 0 && (state.stack[leaving].flashback || (state.stack[leaving].graveyardToExile && proposal.to === "graveyard")) ? "exile"
    /* "If it would leave the battlefield, exile it instead of putting it anywhere else" (Whip of Erebos): on the permanent
       (effects/permanents.mjs, afterwards), gone with it when it leaves (CR 400.7). */
    : from === "battlefield" && object.exileIfLeaves === true ? "exile" : proposal.to;
  const holder = owner ?? object.owner;

  /* CR 614.12: how it ENTERS, asked before it moves, because the abilities answering it belong to
     the card as it is now -- a zone change makes a new object. */
  const entering = destination === "battlefield"
    ? enteringModifications(state, {objectId: id, player: object.controller, types: object.types, abilities: object.abilities})
    : null;

  /* An Aura put onto the battlefield by an effect, not resolving as a spell (CR 303.4f; Sun Titan returning one): it
     enchants what its controller chooses as it enters, and with nothing to enchant it stays where it is -- or, from the
     stack, goes to its owner's graveyard (CR 303.4g). */
  const hosts = destination === "battlefield" && object.enchant ? enchantable(state, object.enchant, object.owner) : null;
  if (hosts && !hosts.length) {
    if (from !== "stack") return null;
    return moveOne(state, id, "graveyard", events, {owner: object.owner});
  }
  if (leaving >= 0) state.stack.splice(leaving, 1);
  const moved = moveObject(state, id, destination, PER_PLAYER.includes(destination) ? holder : null);
  if (hosts) enchantOnArrival(state, moved, hosts, state.objects[moved].controller);
  if (entering) {
    /* Tapped by its own "enters tapped", or by the effect that put it there ("onto the battlefield tapped"): before the
       event, which says how it entered. */
    if ((entering.tapped || tapped) && !entersUntapped(state, moved)) state.objects[moved].tapped = true;
    /* A question it asks as it enters waits for the next priority (rules/entering.mjs). */
    for (const ask of entering.asks ?? []) (state.enteringQuestions ??= []).push({objectId: moved, ...ask});
    for (const [counter, count] of Object.entries(entering.counters)) {
      state.objects[moved].counters[counter] = (state.objects[moved].counters[counter] ?? 0) + count;
    }
  }
  events.push(event("GameEventCardChangeZone", state, {
    card,
    ...(leftBehind ? {leftBehind} : {}),
    /* The permanent that arrived is a new object (CR 400.7); "when this enters" looks for it by this. */
    ...(destination === "battlefield" ? {enteredAs: moved} : {}),
    /* "When this land enters untapped" (rules/trigger.mjs) asks how it entered, not how it is later. */
    ...(destination === "battlefield" && state.objects[moved]?.tapped ? {enteredTapped: true} : {}),
    /* And what it became wherever it went, when that zone is public (CR 400.7e): "that card" in a dies trigger. */
    ...(PUBLIC_ZONES.includes(destination) ? {becomes: moved} : {}),
    from: {zoneType: ZONE_LABEL[from] ?? from, player: {playerId: object.controller}},
    to: {zoneType: ZONE_LABEL[destination] ?? destination, player: {playerId: holder}},
  }));
  /* "You may have this creature enter as a copy of ...": its arrival waits for the answer (rules/entering.mjs). */
  if (destination === "battlefield") holdArrival(state, moved, events[events.length - 1]);
  return moved;
}

/** Which players an effect is aimed at. */
export const playersFor = (state, who, controller) => {
  /* A target bound to its player (script/bind.mjs): that player, while still in the game; none when it was not one. */
  if (Array.isArray(who)) return who.filter((id) => state.players[id] && !state.players[id].lost);
  if (who === "opponent") return state.players.filter((p) => p.id !== controller && !p.lost).map((p) => p.id);
  if (who === "any" || who === "each") return state.players.filter((p) => !p.lost).map((p) => p.id);
  return [controller];
};

/**
 * TO SACRIFICE (CR 701.21a): to move a permanent its controller controls to its owner's graveyard -- and to say so. The
 * move is marked `sacrificed`, with who sacrificed it (its controller as it went), for "whenever you sacrifice a
 * permanent" (rules/trigger.mjs). Every sacrifice goes through here: costs, the sacrifice effect, a ward paid this way.
 *
 * @returns {?number} what it became, or null
 */
export function sacrificeOne(state, id, events) {
  const object = state.objects[id];
  if (!object) return null;
  const sacrificer = object.controller;
  const before = events.length;
  const moved = moveOne(state, id, "graveyard", events, {owner: object.owner});
  if (moved !== null && events.length > before) Object.assign(events[events.length - 1].data.fields, {sacrificed: true, sacrificer});
  return moved;
}

/** `sacrificeAll` — "each player sacrifices all permanents they control that are one or more colors" (All Is Dust): each
 * player `who` names (each, unless it says), every permanent they control the selector fits, at once. No choice is made,
 * so there is no order to ask. */
export function sacrificeAll(state, params, context) {
  const events = [];
  const players = playersFor(state, params.who ?? "each", context.controller);
  const matches = compileSelector({...(params.selector ?? {}), what: "permanent"});
  const doomed = state.zones.battlefield.filter((id) => players.includes(state.objects[id].controller) && matches(state, id, {controller: state.objects[id].controller, source: context.source ?? null}));
  for (const id of doomed) if (state.objects[id]) sacrificeOne(state, id, events);
  return events;
}

/**
 * `peekAndReveal` -- Forge's PeekAndReveal (batch 73): "look at the top card of target player's library" (Mishra's Bauble),
 * "reveal the top X cards of your library" (Sunbird's Invocation): the top `count` cards of each library `who` names, left
 * where they are (CR 701.20b) and `remember`ed for the effects after it. Revealed (`reveal`), every player is shown them
 * (CR 701.20a). Looked at, only this effect's controller is (CR 701.20e) -- and keeps seeing them for as long as they are
 * that library's top cards in that order (projection.mjs, `looks`); a draw or a shuffle ends it (CR 701.20d). The history
 * names a looked-at card to nobody.
 */
export function peekAndReveal(state, params, context) {
  const events = [], seen = [];
  const count = params.count ?? 1;
  for (const player of playersFor(state, params.who, context.controller)) {
    const top = cardsIn(state, "library", player).slice(0, count);
    seen.push(...top);
    if (params.reveal) for (const id of top) events.push(event("GameEventCardRevealed", state, {card: cardRef(state, id), player: {playerId: player}}));
    else if (top.length) {
      /* What the looker knows, replacing what they knew of that library before. */
      state.looks = [...(state.looks ?? []).filter((l) => !(l.viewer === context.controller && l.owner === player)), {viewer: context.controller, owner: player, ids: [...top]}];
    }
  }
  if (params.remember) context.remembered = seen;
  return events;
}

/** `moveZone` — put the named objects somewhere. */
export function moveZone(state, params, context) {
  const events = [];
  const arrived = [], became = [];
  /* "The top card of your library", "the top seven cards of that player's library" (`fromTop`, `who`), revealed first if
     it says so (Dark Confidant) -- or simply moved, face up, to exile (Lord of the Void). */
  const [whose] = params.fromTop !== undefined ? playersFor(state, params.who, context.controller) : [];
  const moving = params.fromTop !== undefined ? (whose === undefined ? [] : cardsIn(state, "library", whose).slice(0, params.fromTop)) : params.targets ?? [];
  if (params.reveal) for (const id of moving) events.push(event("GameEventCardRevealed", state, {card: cardRef(state, id), player: {playerId: state.objects[id].owner}}));
  for (const id of moving) {
    /* "Sacrifice it" (`sacrifice: true`): to its owner's graveyard, as a sacrifice. */
    const moved = params.sacrifice === true ? sacrificeOne(state, id, events) : moveOne(state, id, params.to ?? "graveyard", events, {tapped: params.tapped === true});
    if (moved !== null) became.push(moved);
    /* "On top of your library" (Mystic Sanctuary): a card put into a library goes to the bottom unless it says the top. */
    if (moved !== null && params.to === "library" && params.top === true && state.objects[moved]) {
      const library = state.zones.library[state.objects[moved].owner];
      library.splice(library.indexOf(moved), 1);
      library.unshift(moved);
    }
    /* "Onto the battlefield under your control" (Reanimate): the ability's controller, not the card's owner. */
    if (moved !== null && params.to === "battlefield" && params.controller !== undefined && state.objects[moved])
      state.objects[moved].controller = params.controller === "you" ? context.controller : params.controller;
    if (moved !== null && state.objects[moved]?.zone === "battlefield") arrived.push(moved);
    /* "Exile it, then return that card to the battlefield" (a flicker): the card in exile is a new object (CR 400.7),
       found by what the move returned, and comes back now or at the beginning of the next end step -- under its
       owner's control unless the card says yours, with a +1/+1 counter if the card says so and it is a creature. */
    if (moved !== null && params.andReturn && state.objects[moved]) {
      const back = {effect: "moveZone", targets: [moved], to: "battlefield", ...(params.under === "you" ? {controller: context.controller} : {}),
        ...(params.returnWithCounter ? {withCounter: params.returnWithCounter} : {})};
      if (params.andReturn === "end step") delayedTrigger(state, {at: "end step", text: "Return that card to the battlefield at the beginning of the next end step.", effects: [back]}, context);
      else events.push(...moveZone(state, back, context));
    }
  }
  /* "Exile target creature card from a graveyard. Create a token that's a copy of it": what this moved, as the new
     objects it became (CR 400.7), for the effects after it to name as "remembered" (script/bind.mjs). */
  if (params.remember) context.remembered = became.filter((id) => state.objects[id]);
  /* Teferi's Time Twist: "if it enters as a creature, it enters with an additional +1/+1 counter on it". */
  if (params.withCounter) for (const id of arrived) if (typesOf(state, id).includes("Creature")) state.objects[id].counters[params.withCounter] = (state.objects[id].counters[params.withCounter] ?? 0) + 1;
  afterwards(state, arrived, params, context);
  return events;
}

/** `moveZoneAll` — every object a selector matches (a board wipe, a mass bounce). */
export function moveZoneAll(state, params, context) {
  const events = [];
  const arrivedAll = [];
  const matched = selectMatching(state, params.selector ?? {what: "permanent"}, context);
  /* A copy, because each move rewrites the zone list underneath the iteration. */
  for (const id of [...matched]) {
    const moved = moveOne(state, id, params.to ?? "graveyard", events, {tapped: params.tapped === true});
    if (moved !== null) arrivedAll.push(moved);
  }
  /* "They gain haste until end of turn" (Wake the Past). */
  afterwards(state, arrivedAll, params, context);
  return events;
}

/** `draw` — CR 121.1, off the top. An empty library marks the player; 1.5 turns that into a loss. */
export function draw(state, params, context) {
  const events = [];
  const count = params.count ?? 1;
  for (const player of playersFor(state, params.who, context.controller)) {
    for (let i = 0; i < count; i += 1) {
      const library = cardsIn(state, "library", player);
      if (library.length === 0) { state.players[player].drewFromEmpty = true; break; }
      if (moveOne(state, library[0], "hand", events, {owner: player}) !== null) events[events.length - 1].data.fields.drawn = true;
    }
  }
  return events;
}

/**
 * `destroy` — CR 701.8.
 *
 * Indestructible stops it outright (CR 702.12b), and nothing is reported, because nothing happened.
 * An engine that reported a destruction and then left the permanent standing would be describing an
 * event that did not occur, which is the same mistake as reporting a death that was replaced.
 */
export function destroy(state, params, context) {
  const events = [];
  for (const id of params.targets ?? []) {
    if (!state.objects[id]) continue;
    if (keywordsOf(state, id).includes("Indestructible")) continue;
    /* A regeneration shield replaces the destruction (CR 701.19a), unless "it can't be regenerated" (`noRegenerate`). */
    if (params.noRegenerate !== true && regenerated(state, id, events)) continue;
    moveOne(state, id, "graveyard", events);
  }
  void context;
  return events;
}

/**
 * `destroyAll` — CR 701.8 for everything a selector matches, AT ONCE (a board wipe).
 *
 * Which permanents die is decided before any of them moves. Done one at a time, a wipe that killed a lord first
 * would strip the indestructible it was granting and then kill what it had protected; at once, whatever was
 * indestructible when the wipe resolved survives it (CR 702.12b), whatever else it took with it.
 */
export function destroyAll(state, params, context) {
  const events = [];
  const matched = [...selectMatching(state, params.selector ?? {what: "permanent"}, context)];
  const doomed = matched.filter((id) => state.objects[id]?.zone === "battlefield" && !keywordsOf(state, id).includes("Indestructible"));
  /* Each regenerated one stays (CR 701.19a), unless the card says "they can't be regenerated" (`noRegenerate`). */
  for (const id of doomed) {
    if (params.noRegenerate !== true && regenerated(state, id, events)) continue;
    moveOne(state, id, "graveyard", events);
  }
  return events;
}

/**
 * `digUntil` -- "reveal cards from the top of your library until you reveal a land card. Put that card onto the battlefield
 * tapped and the rest on the bottom of your library" (Forge's DigUntil). For each player it names (`who`), cards from the
 * top until one fits `selector` -- of "lesser mana value" than an amount (`manaValueBelow`: Jodah) -- or until those taken
 * total `totalManaValue` or more (Tasha's Hideous Laughter). Revealed as they are taken, or exiled (`exile`). `found`: where
 * the one that fits goes (`to`, `tapped`; no `to` and it stays where it is), `remember`ed for the effects after it ("you
 * may cast that card"). `rest`: "graveyard", "bottom" or "exile". A library that runs out stops it, nothing found.
 *
 * "The rest on the bottom of your library in a random order": in the order they were taken -- no random stream reaches a
 * plain effect yet.
 */
export function digUntil(state, params, context) {
  const events = [];
  const found = [];
  const below = params.manaValueBelow !== undefined ? amountOf(state, params.manaValueBelow, context) : null;
  const fits = params.selector ? compileSelector({...params.selector, what: "card", zone: params.exile ? "exile" : "library", ...(below !== null ? {manaValue: {max: below - 1}} : {})}) : null;
  const valueOf = (id) => (state.objects[id]?.manaCost ? manaValue(parseManaCost(state.objects[id].manaCost)) : 0);
  for (const player of playersFor(state, params.who, context.controller)) {
    const taken = [];
    let hit = null, total = 0;
    for (const top of cardsIn(state, "library", player)) {
      const id = params.exile ? moveOne(state, top, "exile", events, {owner: player}) : top;
      if (id === null) break;
      if (!params.exile) events.push(event("GameEventCardRevealed", state, {card: cardRef(state, id), player: {playerId: player}}));
      if (fits && fits(state, id, {controller: context.controller, source: context.source})) { hit = id; break; }
      taken.push(id);
      total += valueOf(id);
      if (params.totalManaValue !== undefined && total >= params.totalManaValue) break;
    }
    if (hit !== null) {
      const to = params.found?.to;
      const landed = to ? moveOne(state, hit, to, events, {owner: player, tapped: params.found?.tapped === true}) : hit;
      if (landed !== null) found.push(landed);
    }
    if (params.rest === "graveyard" || (params.rest === "exile" && !params.exile)) for (const id of taken) moveOne(state, id, params.rest, events, {owner: player});
    if (params.rest === "bottom") for (const id of taken) {
      if (params.exile) { moveOne(state, id, "library", events, {owner: player}); continue; }
      const library = state.zones.library[player];
      library.splice(library.indexOf(id), 1);
      library.push(id);
    }
  }
  if (params.remember) context.remembered = found.filter((id) => state.objects[id]);
  return events;
}

/**
 * `mill` — CR 701.17: the top N cards of each named player's library into their graveyard, from the top down.
 *
 * MILLING IS NOT DRAWING. A player told to mill more than they have mills what there is (CR 701.17b), and an empty
 * library here is not the empty-library draw that loses the game (CR 704.5b): nothing is marked.
 */
export function mill(state, params, context) {
  const events = [];
  const count = params.count ?? 1;
  for (const player of playersFor(state, params.who, context.controller)) {
    for (let i = 0; i < count; i += 1) {
      const library = cardsIn(state, "library", player);
      if (library.length === 0) break;
      /* "Exile the top card of your library" is the same motion to another zone. */
      moveOne(state, library[0], params.to ?? "graveyard", events, {owner: player});
    }
  }
  return events;
}

/**
 * `counterSpell` — CR 701.6a. The spell leaves the stack and goes to its owner's graveyard.
 *
 * `spells` are the spells' own objects on the stack -- what a script's "counter target spell" binds to (script/bind.mjs)
 * -- and `targets` are stack ids, for a caller that already holds the entry.
 *
 * `targets` are stack ids, not object ids: a spell on the stack is identified by where it is in the
 * resolution order, and two copies of one card can both be there.
 */
export function counterSpell(state, params, context) {
  const events = [];
  const fromSpells = (params.spells ?? []).map((id) => state.stack.find((entry) => entry.objectId === id)?.stackId).filter((id) => id !== undefined);
  /* `stack`: the entries a trigger is about (ward's "counter it"), bound to their stack ids (script/bind.mjs). */
  for (const stackId of [...(params.targets ?? []), ...(Array.isArray(params.stack) ? params.stack : []), ...fromSpells]) {
    const at = state.stack.findIndex((entry) => entry.stackId === stackId);
    if (at < 0) continue;
    /* "This spell can't be countered": the counter effect does nothing to it -- it was still a legal target (CR 101.2). */
    if (state.stack[at].objectId !== null && cantBeCountered(state, state.stack[at].objectId)) continue;
    const [entry] = state.stack.splice(at, 1);
    /* A countered copy ceases to exist (CR 707.10a, 704.5e); it is no card to put into a graveyard. */
    if (entry.objectId !== null && state.objects[entry.objectId]?.copy === true) removeObject(state, entry.objectId);
    else if (entry.objectId !== null && state.objects[entry.objectId]) {
      /* Countered after a flashback cast, it is exiled instead (CR 702.34a). */
      /* "If that spell is countered this way, exile it instead" (Force of Negation, `to: "exile"`). */
      moveOne(state, entry.objectId, entry.flashback || entry.graveyardToExile || params.to === "exile" ? "exile" : "graveyard", events, {owner: state.objects[entry.objectId].owner});
    }
    events.push(event("GameEventSpellResolved", state, {
      stackId: entry.stackId, abilityId: entry.abilityId, playerId: entry.playerId,
      kind: entry.kind, countered: true, hasFizzled: false,
    }));
  }
  void context;
  return events;
}
