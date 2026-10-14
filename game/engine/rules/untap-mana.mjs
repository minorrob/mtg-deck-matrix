/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* UNTAP, ITS MANA UNSPENT (Rob, 2026-10-11: "I should also be able to click the card to untap it again").
 *
 * A person taps a land for mana, then thinks better of it before anything else has happened, and takes the tap back --
 * as a player at a table puts a land tapped by mistake upright again before anyone has seen it matter. It is not a rule
 * of the game: a mana ability's activation is not undone (CR 605.3a), and the rules for putting a game back are for
 * illegal actions. So the engine never offers it among a player's legal actions and no pilot ever takes it; the
 * room offers it to a person (game/room/room.mjs, `untapMana`), and only while it changes nothing but what the tap did.
 *
 * A TAP THAT CAN BE TAKEN BACK is one that changed the game in exactly two ways: its source tapped, and the mana it
 * added in its player's pool. That is proved, not assumed: undone on a copy at once, the copy must be the game as it was
 * before the tap, to the last field (journal.mjs, hashState). A tap whose ability did anything more -- a pain land's
 * damage, a Treasure's sacrifice, a mana trigger's extra mana, a rider on the mana, a counter, a mill -- is not.
 *
 * NOTHING SINCE. Taps in a row by one player, each of them so, are a run; any of its sources may be untapped while the
 * game is exactly as the last of them left it (`untappable`). Anything else -- a pass, a spell, another player's action,
 * the step ending -- and the run is over.
 */
import {hashState} from "../journal.mjs";
import {event, cardRef} from "../script/effects/zones.mjs";

const unTap = (state, player, take) => {
  state.objects[take.objectId].tapped = false;
  const pool = state.players[player].manaPool;
  for (const [key, n] of Object.entries(take.mana)) pool[key] -= n;
};

/** Before a person's tap for mana: what `tapTaken` compares the game with after it. */
export const beforeTap = (state) => ({hash: hashState(state), passes: state.passes});

/**
 * After it: the run of taps with this one in it, or null when it did anything but tap its source and add its mana. `run`,
 * the run so far (or null): this tap continues it if the game was as its last tap left it.
 */
export function tapTaken(state, player, action, before, events, run = null) {
  const added = events.find((e) => e.kind === "GameEventManaPool");
  const object = state.objects[action.objectId];
  if (!added || !object) return null;
  const take = {objectId: action.objectId, card: object.card, mana: {...added.data.fields.produced}};
  const copy = structuredClone(state);
  unTap(copy, player, take);
  copy.passes = before.passes;
  if (hashState(copy) !== before.hash) return null;
  const continues = run && run.after === before.hash;
  return {player, passes: continues ? run.passes : before.passes, takes: [...(continues ? run.takes : []), take], after: hashState(state)};
}

/** Whether the run's taps may be taken back now: the game is exactly as its last tap left it -- the same player holding
    priority in the same step, nothing cast, paid, passed or changed since. */
export const untappable = (state, run) => !!run && hashState(state) === run.after;

/** One of the run's taps taken back: its source untapped, its mana out of the pool. Returns the events and the run left. */
export function untapTaken(state, run, objectId) {
  const take = run?.takes.find((t) => t.objectId === objectId);
  if (!take || !untappable(state, run)) throw new Error("That land cannot be untapped now: something has happened since it was tapped");
  unTap(state, run.player, take);
  const takes = run.takes.filter((t) => t !== take);
  /* Every tap of the run taken back: the round of passes is as it was before the first (CR 117.4). */
  if (!takes.length) state.passes = run.passes;
  const events = [event("GameEventCardTapped", state, {card: cardRef(state, objectId), tapped: false})];
  return {events, run: takes.length ? {...run, takes, after: hashState(state)} : null};
}
