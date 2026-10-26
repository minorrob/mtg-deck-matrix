/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* CH-57 is a room house rule, not a legal game action. Save a private copy before a play, and offer it only while
   the game is exactly as that play left it. Casting may reveal the played card; nothing else may reveal information,
   move a hidden card, use randomness, or put a trigger on the stack. A run of reversible manual mana taps belongs to
   the play as a unit; automatic mana payment is already inside the saved action. */
import {hashState} from "../journal.mjs";
import {untappable, untapTaken} from "./untap-mana.mjs";

const SAFE_EVENTS = new Set(["GameEventLandPlayed", "GameEventSpellAbilityCast", "GameEventCardChangeZone", "GameEventCardTapped",
  "GameEventManaPool", "GameEventPlayerHealth", "GameEventCardAttribute", "GameEventBecameTarget", "GameEventCrimeCommitted"]);

export function beforePlay(state, player, action, rng, taps = null) {
  if (!["cast", "play-land"].includes(action.kind) || action.disguise || state.awaiting || state.resolving) return null;
  const object = state.objects[action.objectId];
  if (!object || object.faceDown) return null;
  const before = structuredClone(state);
  if (action.kind === "cast" && taps?.player === player && untappable(state, taps)) {
    let run = structuredClone(taps);
    while (run) run = untapTaken(before, run, run.takes[run.takes.length - 1].objectId).run;
  }
  return {player, kind: action.kind, original: action.objectId, name: object.card, before, beforeHash: hashState(before),
    rng: structuredClone(rng), turn: state.turn, phase: state.phase, pending: true, valid: true,
    // Compare against the actual pre-cast stack, even when the saved copy also takes its mana taps back.
    stack: state.stack.map(e => e.stackId)};
}

export function observePlay(play, events) {
  if (!play) return;
  if (!play.pending) {if (events.length) play.valid = false; return;}
  for (const event of events) {
    if (!SAFE_EVENTS.has(event.kind)) play.valid = false;
    // The played card may move; a discarded or sacrificed extra cost may reveal or trigger something else.
    if (event.kind === "GameEventCardChangeZone" && event.data.fields.card.cardId !== play.original) play.valid = false;
  }
}

export function finishPlay(state, play, rng) {
  if (!play || !play.valid || hashState(rng) !== hashState(play.rng) || state.turn !== play.turn || state.phase !== play.phase) return null;
  if (state.awaiting) return play.pending && ["choose-targets", "choose-cost"].includes(state.awaiting.kind) && state.awaiting.player === play.player ? play : null;
  if (state.resolving || state.priorityPlayer !== play.player) return null;
  if (play.pending) {
    const extra = state.stack.filter(e => !play.stack.includes(e.stackId));
    if (state.stack.length !== play.stack.length + (play.kind === "cast" ? 1 : 0)) return null;
    if (play.kind === "cast" && (extra.length !== 1 || extra[0].kind !== "spell" || extra[0].playerId !== play.player)) return null;
    const field = play.kind === "play-land" ? state.zones.battlefield.find(id => !play.before.zones.battlefield.includes(id)) : extra[0].objectId;
    if (field === undefined || !state.objects[field]) return null;
    // Libraries must stay byte-for-byte the same, including their order. Looking or revealing is refused by its event.
    if (hashState(state.zones.library) !== hashState(play.before.zones.library)) return null;
    return {...play, objectId: field, pending: false, after: hashState(state)};
  }
  return hashState(state) === play.after ? play : null;
}

export const mayUndoPlay = (state, play, player, rng) => Boolean(play && !play.pending && play.player === player && finishPlay(state, play, rng));

export function undoPlay(state, play, player, rng) {
  if (!mayUndoPlay(state, play, player, rng) || hashState(play.before) !== play.beforeHash)
    throw new Error("That play can't be undone now: another action, priority, or new information has closed its window.");
  return structuredClone(play.before);
}
