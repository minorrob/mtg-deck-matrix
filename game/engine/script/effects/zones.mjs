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
 * DESTROY IS NOT A ZONE CHANGE WITH A NICER NAME (CR 701.7). Indestructible stops it and does not
 * stop a "put into its owner's graveyard" effect, regeneration replaces it, and a creature that
 * cannot be destroyed can still be sacrificed. Keeping them separate is what makes those three
 * behave differently later.
 */

import {moveObject, cardsIn} from "../../state/index.mjs";
import {keywordsOf} from "../../rules/layers.mjs";
import {selectMatching} from "../filter.mjs";
import {applyReplacements} from "../../rules/replacement.mjs";

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
export function moveOne(state, id, to, events, {owner = null} = {}) {
  const object = state.objects[id];
  if (!object) return null;
  const from = object.zone;
  const card = cardRef(state, id);
  const leftBehind = from === "battlefield"
    ? {cardId: id, name: object.card, controller: object.controller, owner: object.owner,
      abilities: structuredClone(object.abilities ?? [])}
    : undefined;

  const {proposal} = applyReplacements(state, {
    event: "zone-change", objectId: id, from, to, player: object.controller,
  });
  const destination = proposal.to;
  const holder = owner ?? object.owner;
  const moved = moveObject(state, id, destination, PER_PLAYER.includes(destination) ? holder : null);
  events.push(event("GameEventCardChangeZone", state, {
    card,
    ...(leftBehind ? {leftBehind} : {}),
    from: {zoneType: ZONE_LABEL[from] ?? from, player: {playerId: object.controller}},
    to: {zoneType: ZONE_LABEL[destination] ?? destination, player: {playerId: holder}},
  }));
  return moved;
}

/** Which players an effect is aimed at. */
export const playersFor = (state, who, controller) => {
  if (who === "opponent") return state.players.filter((p) => p.id !== controller && !p.lost).map((p) => p.id);
  if (who === "any" || who === "each") return state.players.filter((p) => !p.lost).map((p) => p.id);
  return [controller];
};

/** `moveZone` — put the named objects somewhere. */
export function moveZone(state, params, context) {
  const events = [];
  for (const id of params.targets ?? []) moveOne(state, id, params.to ?? "graveyard", events);
  void context;
  return events;
}

/** `moveZoneAll` — every object a selector matches (a board wipe, a mass bounce). */
export function moveZoneAll(state, params, context) {
  const events = [];
  const matched = selectMatching(state, params.selector ?? {what: "permanent"}, context);
  /* A copy, because each move rewrites the zone list underneath the iteration. */
  for (const id of [...matched]) moveOne(state, id, params.to ?? "graveyard", events);
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
      moveOne(state, library[0], "hand", events, {owner: player});
    }
  }
  return events;
}

/**
 * `destroy` — CR 701.7.
 *
 * Indestructible stops it outright (CR 701.7b), and nothing is reported, because nothing happened.
 * An engine that reported a destruction and then left the permanent standing would be describing an
 * event that did not occur, which is the same mistake as reporting a death that was replaced.
 */
export function destroy(state, params, context) {
  const events = [];
  for (const id of params.targets ?? []) {
    if (!state.objects[id]) continue;
    if (keywordsOf(state, id).includes("Indestructible")) continue;
    moveOne(state, id, "graveyard", events);
  }
  void context;
  return events;
}

/**
 * `counterSpell` — CR 701.5a. The spell leaves the stack and goes to its owner's graveyard.
 *
 * `targets` are stack ids, not object ids: a spell on the stack is identified by where it is in the
 * resolution order, and two copies of one card can both be there.
 */
export function counterSpell(state, params, context) {
  const events = [];
  for (const stackId of params.targets ?? []) {
    const at = state.stack.findIndex((entry) => entry.stackId === stackId);
    if (at < 0) continue;
    const [entry] = state.stack.splice(at, 1);
    if (entry.objectId !== null && state.objects[entry.objectId]) {
      moveOne(state, entry.objectId, "graveyard", events, {owner: state.objects[entry.objectId].owner});
    }
    events.push(event("GameEventSpellResolved", state, {
      stackId: entry.stackId, abilityId: entry.abilityId, playerId: entry.playerId,
      kind: entry.kind, countered: true, hasFizzled: false,
    }));
  }
  void context;
  return events;
}
