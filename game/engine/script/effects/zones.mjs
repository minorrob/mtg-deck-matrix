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
import {keywordsOf, controllerOf} from "../../rules/layers.mjs";
import {selectMatching, compileSelector} from "../filter.mjs";
import {applyReplacements, enteringModifications, regenerated} from "../../rules/replacement.mjs";
import {cantBeCountered, entersUntapped, countersPlaced} from "../../rules/statics.mjs";
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

/* The card types a permanent may have (CR 110.4). */
const PERMANENT_TYPES = ["Artifact", "Battle", "Creature", "Enchantment", "Land", "Planeswalker"];

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

  /* A modal double-faced card told to enter with its front face up, when that face is no permanent's (CR 712.14b): it
     stays where it is. */
  if (destination === "battlefield" && object.mdfc && object.face !== "back" && !PERMANENT_TYPES.some((type) => (object.mdfc.front.types ?? []).includes(type))) return null;
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
  /* "If it entered from your library" (Fblthp, the Lost): where the permanent came from, and whose library that was --
     read by the condition `cameFrom` (script/condition.mjs). A library only; rules/stack.mjs records a cast from one. */
  if (destination === "battlefield" && from === "library" && state.objects[moved]) state.objects[moved].cameFrom = {zone: "library", owner: object.zonePlayer ?? object.owner};
  if (hosts) enchantOnArrival(state, moved, hosts, state.objects[moved].controller);
  if (entering) {
    /* Tapped by its own "enters tapped", or by the effect that put it there ("onto the battlefield tapped"): before the
       event, which says how it entered. */
    if ((entering.tapped || tapped) && !entersUntapped(state, moved)) state.objects[moved].tapped = true;
    /* A question it asks as it enters waits for the next priority (rules/entering.mjs). */
    for (const ask of entering.asks ?? []) (state.enteringQuestions ??= []).push({objectId: moved, ...ask});
    /* Counters it enters with are put on it (CR 122.6): "twice that many instead" sees them. */
    for (const [counter, count] of Object.entries(entering.counters)) {
      state.objects[moved].counters[counter] = (state.objects[moved].counters[counter] ?? 0) + countersPlaced(state, moved, counter, count);
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
  /* What it exiled "until this leaves the battlefield", back now (CR 610.3). */
  if (from === "battlefield") returnExiledUntil(state, id, events);
  return moved;
}

/**
 * `exileUntil` -- "exile target creature or planeswalker an opponent controls until this Aura leaves the battlefield"
 * (Ossification; CR 610.3). Each target exiled and linked to the source as it is on the battlefield; immediately after
 * that permanent leaves, a second one-shot effect returns them (returnExiledUntil). If it has already left by the time
 * the exile would happen -- after the ability triggered, or was put on the stack -- nothing moves (CR 610.3a, 610.3b).
 *
 * "And all other nonland permanents that player controls with the same name as that permanent" (Deputy of Detention):
 * `sameName`, a selector of the others. They are not targets -- one with hexproof goes too -- and are read as the exile
 * happens: every other permanent the target's controller then controls that has the target's name (CR 201.2a), exiled
 * with it and returned with it.
 */
export function exileUntil(state, params, context) {
  const events = [];
  /* The source as it is now: null once it has left the battlefield (rules/stack.mjs), and then nothing moves. */
  const source = context.source ?? null;
  if (source === null || state.objects[source]?.zone !== "battlefield") return events;
  const exiling = [...(params.targets ?? [])];
  const named = params.sameName ? exiling.find((id) => state.objects[id]?.zone === "battlefield") : undefined;
  if (named !== undefined) {
    const name = state.objects[named].card, holder = controllerOf(state, named);
    const others = compileSelector({...params.sameName, what: "permanent"});
    for (const id of state.zones.battlefield)
      if (!exiling.includes(id) && state.objects[id].card === name && controllerOf(state, id) === holder && others(state, id, {controller: context.controller, source})) exiling.push(id);
  }
  for (const id of exiling) {
    if (!state.objects[id]) continue;
    const moved = moveOne(state, id, "exile", events);
    if (moved !== null && state.objects[moved]?.zone === "exile") (state.exiledUntil ??= []).push({source, exiled: moved});
  }
  return events;
}

/**
 * THE RETURN (CR 610.3): `departed`, a permanent's id as it was on the battlefield, has just left it -- what it exiled
 * "until this leaves the battlefield" returns to the battlefield under its owner's control (610.3c), at once: a one-shot
 * effect, not a trigger, nothing on the stack. A card that has left exile since is a new object (CR 400.7) and stays
 * where it is; a token exiled has ceased to exist (CR 704.5d); a card whose owner has left the game left with them (CR
 * 800.4a). Every departure from the battlefield calls this: moveOne here, and the state-based actions that move a
 * permanent themselves -- a player leaving the game among them (rules/sba.mjs).
 */
export function returnExiledUntil(state, departed, events) {
  const due = (state.exiledUntil ?? []).filter((link) => link.source === departed);
  if (!due.length) return;
  state.exiledUntil = state.exiledUntil.filter((link) => link.source !== departed);
  for (const {exiled} of due) {
    const card = state.objects[exiled];
    if (card?.zone !== "exile" || state.players[card.owner]?.lost) continue;
    moveOne(state, exiled, "battlefield", events, {owner: card.owner});
  }
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
 * TO SHUFFLE A LIBRARY (CR 701.24; batch 80): a fair random order from the game's stream (rng.mjs), handed in -- never
 * made up here. Whatever a player knew of that library's top cards from looking ends with it (CR 701.20d; projection.mjs,
 * `looks`). Every shuffle an effect makes goes through here.
 */
export function shuffleLibrary(state, player, rng, events) {
  if (!rng) throw new Error("A shuffle needs the game's random stream");
  state.zones.library[player] = rng.shuffle(state.zones.library[player]);
  if (state.looks) state.looks = state.looks.filter((look) => look.owner !== player);
  events.push(event("GameEventShuffle", state, {player: {playerId: player, name: state.players[player].name}}));
}

/** `shuffle` -- Forge's Shuffle: "shuffle your library", "target player shuffles their library": each library `who` names. */
export function shuffle(state, params, context, rng) {
  const events = [];
  for (const player of playersFor(state, params.who, context.controller)) shuffleLibrary(state, player, rng, events);
  return events;
}

/* "In a random order" (CR 701.24 is a library's; this is the same fair order for a few cards): the order they go in. */
const inRandomOrder = (list, rng) => {
  if (!rng) throw new Error("A random order needs the game's random stream");
  return rng.shuffle(list);
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
  /* "Each player sacrifices all creatures they control not chosen this way" (The Eternal Wanderer): `except` what the
     effect before it remembered. */
  const spared = params.except === "remembered" ? new Set(context.remembered ?? []) : null;
  const doomed = state.zones.battlefield.filter((id) => !spared?.has(id) && players.includes(state.objects[id].controller) && matches(state, id, {controller: state.objects[id].controller, source: context.source ?? null}));
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
/* The source a link is kept against: this ability's, or -- one that left the battlefield to trigger it -- as it last was. */
const linkOf = (context) => context.source ?? context.lastKnown?.cardId ?? null;

export function moveZone(state, params, context, rng = null) {
  const events = [];
  const arrived = [], became = [];
  /* Who controlled each as it left the battlefield, for `remember` (moveZoneAll says why). */
  const leftBy = new Map(), was = {};
  /* "The top card of your library", "the top seven cards of that player's library" (`fromTop`, `who`), revealed first if
     it says so (Dark Confidant) -- or simply moved, face up, to exile (Lord of the Void). "The top card of each player's
     library" (Etali, batch 79): of every library `who` names; "the top X cards" (Villainous Wealth): an amount. */
  /* "Exile all but the bottom card of each opponent's library" (Jace, Reality Sculptor): `allButBottom`. */
  const moving = params.fromTop !== undefined || params.allButBottom === true
    ? playersFor(state, params.who, context.controller).flatMap((whose) => { const library = cardsIn(state, "library", whose);
      return params.allButBottom === true ? library.slice(0, Math.max(0, library.length - 1)) : library.slice(0, params.fromTop); })
    /* LINKED ABILITIES (CR 607.2a): "return the exiled card to the battlefield" (Oblivion Ring) -- what this permanent's
       other ability exiled (`link`, below), while it is still that card in exile (CR 400.7: gone from there, it is a new
       object, and nothing returns). */
    : params.linked === true ? [...(state.links?.[linkOf(context)] ?? [])]
    : params.targets ?? [];
  if (params.reveal) for (const id of moving) events.push(event("GameEventCardRevealed", state, {card: cardRef(state, id), player: {playerId: state.objects[id].owner}}));
  /* "Put the rest on the bottom of your library in a random order" (Sunbird's Invocation; batch 80, `random`). */
  for (const id of params.random === true ? inRandomOrder(moving, rng) : moving) {
    /* "Sacrifice it" (`sacrifice: true`): to its owner's graveyard, as a sacrifice. */
    /* A commander whose owner chose the command zone instead (CR 903.9b; effects/asking.mjs, commanderHome). */
    const to = (params.commanderHome ?? []).includes(id) ? "command" : params.to ?? "graveyard";
    if (state.objects[id]?.zone === "battlefield") leftBy.set(id, controllerOf(state, id));
    const moved = params.sacrifice === true ? sacrificeOne(state, id, events) : moveOne(state, id, to, events, {tapped: params.tapped === true});
    /* What it is now, for `remember`: what it became -- or, exiled and returned at once, the permanent that came back
       ("if that creature is a Bird", Splash Portal, batch 79), set below. */
    let landed = moved;
    /* "On top of your library" (Mystic Sanctuary): a card put into a library goes to the bottom unless it says the top --
       or how far down from it ("second from the top", Temporal Cleansing: `position: 2`), the bottom of a shorter one. */
    if (moved !== null && to === "library" && (params.top === true || Number.isInteger(params.position)) && state.objects[moved]) {
      const library = state.zones.library[state.objects[moved].owner];
      library.splice(library.indexOf(moved), 1);
      library.splice(params.top === true ? 0 : Math.min(Math.max(params.position, 1) - 1, library.length), 0, moved);
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
      /* "Return that card to the battlefield under its owner's control at the beginning of that player's next end step" (The
         Eternal Wanderer; CR 603.7): the next end step of a turn of the card's owner -- this turn's, if it is theirs and its
         end step has not begun. */
      else if (params.andReturn === "owner's end step") delayedTrigger(state, {at: "end step", player: state.objects[moved].owner,
        text: "Return that card to the battlefield under its owner's control at the beginning of that player's next end step.", effects: [back]}, context);
      else {
        /* The return remembers what came back in a context of its own, so this effect's `remember` is not overwritten. */
        const returning = {...context};
        events.push(...moveZone(state, {...back, remember: true}, returning));
        landed = returning.remembered?.[0] ?? null;
      }
    }
    if (landed !== null) { became.push(landed); if (leftBy.has(id)) was[landed] = leftBy.get(id); }
  }
  /* "Shuffle it into its owner's library" (`shuffle`, batch 80): each library a card was put into, shuffled after. */
  if (params.shuffle === true) for (const owner of new Set(became.filter((id) => state.objects[id]?.zone === "library").map((id) => state.objects[id].owner))) shuffleLibrary(state, owner, rng, events);
  /* "Exile target creature card from a graveyard. Create a token that's a copy of it": what this moved, as the new
     objects it became (CR 400.7), for the effects after it to name as "remembered" (script/bind.mjs). */
  if (params.remember) { context.remembered = became.filter((id) => state.objects[id]); context.rememberedControllers = was; }
  /* "Exile another target nonland permanent" (Oblivion Ring, `link`): what it exiled, kept against this source for the
     ability linked to it (CR 607.2a); used, the link is spent. Each time the ability exiles adds to what it exiled -- the
     same trigger twice (Panharmonicon) is "the exiled cards", both (Skyclave Apparition's ruling of 2020-09-25). */
  if (params.link === true && context.source !== null && context.source !== undefined) {
    const links = (state.links ??= {});
    links[context.source] = [...(links[context.source] ?? []), ...became.filter((id) => state.objects[id])];
  }
  if (params.linked === true && state.links) delete state.links[linkOf(context)];
  /* Teferi's Time Twist: "if it enters as a creature, it enters with an additional +1/+1 counter on it". */
  if (params.withCounter) for (const id of arrived) if (typesOf(state, id).includes("Creature")) state.objects[id].counters[params.withCounter] = (state.objects[id].counters[params.withCounter] ?? 0) + 1;
  afterwards(state, arrived, params, context);
  return events;
}

/** `moveZoneAll` — every object a selector matches (a board wipe, a mass bounce). */
/**
 * `mayPlay` — "Until the end of your next turn, you may play that card" (Blazing Crescendo), "you may play them this turn":
 * a permission, not a cast now (that is `play`). Its controller may play the named cards from where they are, each the way
 * it could be played from a hand -- a land as their land for the turn (CR 305.2), a spell at its type's speed, its costs
 * paid (CR 601.2a) -- until `until`: "end-of-turn", or "your-next-end", the end of that player's next turn (rules/turn.mjs).
 * `spellsOnly` for "you may cast that card". It names objects, as `remembered` binds them: a card that moves becomes a new
 * object (CR 400.7) and leaves the permission behind -- played, or put back into a library.
 */
export function mayPlay(state, params, context) {
  const ids = (params.targets ?? []).filter((id) => state.objects[id]);
  const player = context.controller;
  if (!ids.length || !state.players[player]) return [];
  (state.effects ??= []).push({id: `may-play:${ids.join(",")}:${state.effects.length}`, rule: "may-play", affects: {ids}, player,
    ...(params.spellsOnly === true ? {spellsOnly: true} : {}), until: params.until ?? "end-of-turn", madeOnTurn: state.turn, sourceController: player});
  return [];
}

export function moveZoneAll(state, params, context, rng = null) {
  const events = [];
  const arrivedAll = [];
  const matched = selectMatching(state, params.selector ?? {what: "permanent"}, context);
  /* A copy, because each move rewrites the zone list underneath the iteration. */
  const was = {};
  for (const id of [...matched]) {
    const controller = state.objects[id]?.zone === "battlefield" ? controllerOf(state, id) : null;
    const moved = moveOne(state, id, params.to ?? "graveyard", events, {tapped: params.tapped === true});
    if (moved !== null) { arrivedAll.push(moved); if (controller !== null) was[moved] = controller; }
  }
  /* "Each player shuffles the cards from their hand into their library" (Winds of Change, batch 80, `shuffle`): each library
     a card was put into, shuffled after. */
  if (params.shuffle === true) for (const owner of new Set(arrivedAll.filter((id) => state.objects[id]?.zone === "library").map((id) => state.objects[id].owner))) shuffleLibrary(state, owner, rng, events);
  /* "Then puts all cards they exiled this way onto the battlefield" (Living Death, batch 79): what this moved, as the new
     objects it became (CR 400.7), for the effects after it to name as "remembered" -- every player's at once. */
  if (params.remember) context.remembered = arrivedAll.filter((id) => state.objects[id]);
  /* And who controlled each as it left the battlefield: "for each creature exiled this way, its controller searches"
     (Winds of Abandon; script/amount.mjs, rememberedCount's `controlledBy`). */
  if (params.remember) context.rememberedControllers = was;
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
 *
 * "Destroy all OTHER creatures" (Martial Coup, White Sun's Twilight): `except: "remembered"`, what an earlier effect of
 * this resolution remembered -- the tokens it just made -- spared.
 */
export function destroyAll(state, params, context) {
  const events = [];
  const spared = params.except === "remembered" ? new Set(context.remembered ?? []) : null;
  const matched = [...selectMatching(state, params.selector ?? {what: "permanent"}, context)].filter((id) => !spared?.has(id));
  const doomed = matched.filter((id) => state.objects[id]?.zone === "battlefield" && !keywordsOf(state, id).includes("Indestructible"));
  /* Each regenerated one stays (CR 701.19a), unless the card says "they can't be regenerated" (`noRegenerate`). */
  const destroyed = [];
  for (const id of doomed) {
    if (params.noRegenerate !== true && regenerated(state, id, events)) continue;
    const moved = moveOne(state, id, "graveyard", events);
    if (moved !== null) destroyed.push(moved);
  }
  /* "You gain 1 life for each creature destroyed this way" (Ob Nixilis, the Ascended): `remember`, what it destroyed --
     neither the indestructible nor the regenerated -- for the effects after it ({rememberedCount: true}). */
  if (params.remember) context.remembered = destroyed;
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
 * `count`: how many that fit to find before it stops, each put where `found` says -- "until you reveal that many creature
 * cards. Put all creature cards revealed this way onto the battlefield" (Mass Polymorph); 0, and nothing is revealed.
 * `rest: "shuffle"`: "then shuffle the rest of the revealed cards into your library" -- they never left it, so it is
 * shuffled, if anything was revealed.
 *
 * "The rest on the bottom of your library in a random order" (`rest: "bottom"`, every card that says it): in a random
 * order from the game's stream (batch 80; before it, in the order they were taken, which was not random).
 */
export function digUntil(state, params, context, rng = null) {
  const events = [];
  const found = [];
  const below = params.manaValueBelow !== undefined ? amountOf(state, params.manaValueBelow, context) : null;
  const fits = params.selector ? compileSelector({...params.selector, what: "card", zone: params.exile ? "exile" : "library", ...(below !== null ? {manaValue: {max: below - 1}} : {})}) : null;
  const valueOf = (id) => (state.objects[id]?.manaCost ? manaValue(parseManaCost(state.objects[id].manaCost)) : 0);
  const wanted = params.count ?? 1;
  for (const player of playersFor(state, params.who, context.controller)) {
    const taken = [], hits = [];
    let total = 0;
    if (wanted > 0) for (const top of cardsIn(state, "library", player)) {
      const id = params.exile ? moveOne(state, top, "exile", events, {owner: player}) : top;
      if (id === null) break;
      if (!params.exile) events.push(event("GameEventCardRevealed", state, {card: cardRef(state, id), player: {playerId: player}}));
      if (fits && fits(state, id, {controller: context.controller, source: context.source})) hits.push(id);
      else { taken.push(id); total += valueOf(id); }
      if (hits.length >= wanted) break;
      if (params.totalManaValue !== undefined && total >= params.totalManaValue) break;
    }
    for (const hit of hits) {
      const to = params.found?.to;
      const landed = to ? moveOne(state, hit, to, events, {owner: player, tapped: params.found?.tapped === true}) : hit;
      if (landed !== null) found.push(landed);
    }
    if (params.rest === "graveyard" || (params.rest === "exile" && !params.exile)) for (const id of taken) moveOne(state, id, params.rest, events, {owner: player});
    if (params.rest === "bottom") for (const id of inRandomOrder(taken, rng)) {
      if (params.exile) { moveOne(state, id, "library", events, {owner: player}); continue; }
      const library = state.zones.library[player];
      library.splice(library.indexOf(id), 1);
      library.push(id);
    }
    if (params.rest === "shuffle" && (taken.length || hits.length)) shuffleLibrary(state, player, rng, events);
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
  const milled = [];
  for (const player of playersFor(state, params.who, context.controller)) {
    for (let i = 0; i < count; i += 1) {
      const library = cardsIn(state, "library", player);
      if (library.length === 0) break;
      /* "Exile the top card of your library" is the same motion to another zone. */
      const moved = moveOne(state, library[0], params.to ?? "graveyard", events, {owner: player});
      if (moved !== null) milled.push(moved);
    }
  }
  /* "A card that player milled this way" (The Ur-Sphinx): what this milled, for the effects after it. */
  if (params.remember) context.remembered = milled.filter((id) => state.objects[id]);
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
      /* "If that spell is countered this way, exile it instead" (Force of Negation, `to: "exile"`); "put it on top of its
         owner's library instead of into that player's graveyard" (Memory Lapse, `to: "top"`) -- or, a commander whose owner
         chose so, the command zone (CR 903.9b; effects/asking.mjs, commandersGoingHome). */
      const owner = state.objects[entry.objectId].owner;
      const to = entry.flashback || entry.graveyardToExile || params.to === "exile" ? "exile"
        : (params.commanderHome ?? []).includes(entry.objectId) ? "command" : params.to === "top" ? "library" : "graveyard";
      const moved = moveOne(state, entry.objectId, to, events, {owner});
      /* "Exile it with three time counters on it ... it gains suspend" (Delay; CR 702.62): in exile, suspended. */
      if (to === "exile" && moved !== null && state.objects[moved] && Number.isInteger(params.timeCounters)) {
        state.objects[moved].counters.time = (state.objects[moved].counters.time ?? 0) + params.timeCounters;
        if (params.suspend === true) state.objects[moved].suspended = true;
      }
      if (to === "library" && moved !== null && state.objects[moved]) {
        const library = state.zones.library[owner];
        library.splice(library.indexOf(moved), 1);
        library.unshift(moved);
      }
    }
    events.push(event("GameEventSpellResolved", state, {
      stackId: entry.stackId, abilityId: entry.abilityId, playerId: entry.playerId,
      kind: entry.kind, countered: true, hasFizzled: false,
    }));
  }
  void context;
  return events;
}
