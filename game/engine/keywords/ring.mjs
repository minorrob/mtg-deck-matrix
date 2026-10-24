/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* The Ring tempts you (CR 701.54). The emblem owns its abilities; the bearer does not gain them.
 * The designation is neither an ability nor a copiable value. Each temptation asks its player,
 * including when the only creature is already the bearer. */
import {addObject, eventCard} from "../state/index.mjs";
import {controllerOf, typesOf} from "../rules/layers.mjs";

export function isRingBearer(state, id, player) {
  return state.players[player]?.ring?.bearer === id && state.objects[id]?.zone === "battlefield"
    && controllerOf(state, id) === player;
}

export function clearRingBearer(state, id) {
  for (const player of state.players) if (player.ring?.bearer === id) player.ring.bearer = null;
}

export function checkRingBearers(state) {
  for (const player of state.players) if (player.ring?.bearer != null && !isRingBearer(state, player.ring.bearer, player.id)) player.ring.bearer = null;
}

const ABILITIES = [
  {id: "ring-evasion", kind: "static", text: "Your Ring-bearer is legendary and can't be blocked by creatures with greater power."},
  {id: "ring-loot", kind: "triggered", text: "Whenever your Ring-bearer attacks, draw a card, then discard a card.",
    trigger: {on: "GameEventAttackersDeclared", who: "ring-bearer"}, targets: [], effects: [{effect: "draw", count: 1}, {effect: "discard", count: 1}]},
  {id: "ring-block", kind: "triggered", text: "Whenever your Ring-bearer becomes blocked by a creature, that creature's controller sacrifices it at end of combat.",
    trigger: {on: "GameEventBlockersDeclared", blockedBy: true, who: "ring-bearer"}, targets: [],
    effects: [{effect: "delayedTrigger", at: "end of combat", effects: [{effect: "moveZone", targets: "that card", to: "graveyard", sacrifice: true}]}]},
  {id: "ring-damage", kind: "triggered", text: "Whenever your Ring-bearer deals combat damage to a player, each opponent loses 3 life.",
    trigger: {on: "GameEventPlayerDamaged", combat: true, who: "ring-bearer"}, targets: [], effects: [{effect: "loseLife", who: "opponent", amount: 3}]},
];

function tempted(state, player, bearer) {
  state.players[player].ring.bearer = bearer;
  return {kind: "GameEventRingTempts", data: {turn: state.turn, phase: state.phase,
    fields: {player: {playerId: player}, ...(bearer != null ? {card: eventCard(state, bearer)} : {})}}};
}

export const ringTempts = {
  open(state, _params, context) {
    const player = context.controller;
    const ring = state.players[player].ring ??= {count: 0, bearer: null, emblem: null};
    const events = [];
    if (ring.emblem === null) {
      ring.emblem = addObject(state, {card: "The Ring", emblem: true, owner: player, controller: player, abilities: []}, "command", player);
      events.push({kind: "GameEventEmblemCreated", data: {turn: state.turn, phase: state.phase, fields: {player: {playerId: player}, card: eventCard(state, ring.emblem)}}});
    }
    ring.count += 1;
    state.objects[ring.emblem].abilities = structuredClone(ABILITIES.slice(0, Math.min(4, ring.count)));
    const cards = state.zones.battlefield.filter((id) => controllerOf(state, id) === player && typesOf(state, id).includes("Creature"));
    if (!cards.length) return {events: [...events, tempted(state, player, null)]};
    state.awaiting = {kind: "effect-choice", effect: "ringTempts", player, cards, events};
    return true;
  },
  choice(_state, awaiting) {
    return {id: `ring-bearer:${awaiting.player}`, title: "Choose your Ring-bearer", mode: "one", min: 1, max: 1,
      options: awaiting.cards.map((cardId, index) => ({index, cardId, label: _state.objects[cardId].card}))};
  },
  apply(state, awaiting, indices) {
    const bearer = awaiting.cards[indices[0]];
    if (bearer === undefined) throw new Error("Choose a creature to be your Ring-bearer.");
    return [...awaiting.events, tempted(state, awaiting.player, bearer)];
  },
  left(state, awaiting) { return [...awaiting.events, tempted(state, awaiting.player, null)]; },
};
