/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* A GAME REPLAYED FROM ITS SEED AND ITS TAPE (docs/plan-to-100.md M8). The playtest program hands over games, and
 * a finding is only as good as our ability to see it happen again. A room keeps the seed and pod it started with
 * (the match store's meta) and the decision tape -- every answer a person gave, every seat that left, the game
 * ended -- and the engine is deterministic, so the two are the whole game: start a fresh room in memory on the
 * same seed and pod, feed it the tape in order, and it reaches the same state, the same journal, the same end.
 *
 * `replayTape` is that, pure: nothing outside memory is touched. `replayMatch` reads a stored match and proves it,
 * returning both fingerprints (game/room/room.mjs `fingerprint()`: the state's hash, the journal's length, the tape's
 * length, the pilot answers refused, and the stored journal's hash) and whether they agree. A tape that stops fitting the game -- an answer for
 * a seat the game is not waiting on -- is refused at that entry, by number, so a tampered record says where it parts.
 *
 * Nothing here returns a state, a hand or a library: fingerprints only. The export (M8b, Rob's go 2026-09-29) is
 * game/room/table.mjs `record`: the seed, pod and tape this replays, for a playtest table only; any other table's
 * seat gets its own last view and the public history. */
import {memoryStorage, createMatchStore} from "../engine/storage.mjs";
import {startRoom, openRoom} from "./room.mjs";
import {hashState} from "../engine/journal.mjs";

/** Replays `tape` on a fresh in-memory room started from `pod` and `seed`; returns the room. */
export async function replayTape({matchId, pod, seed, tape, cards, pilot, storage = memoryStorage()}) {
  const room = await startRoom({storage, matchId, pod, seed, ...(cards ? {cards} : {}), ...(pilot ? {pilot} : {})});
  for (const entry of tape) await room.replay(entry);
  return room;
}

/** Reads a stored match (its seed, pod and tape), replays it, and compares it with the stored game. */
export async function replayMatch({storage, matchId, cards, pilot}) {
  const store = createMatchStore(storage, matchId);
  const meta = await store.loadMatch();
  if (!meta) throw new Error(`There is no match ${matchId} in this storage.`);
  const tape = await store.readTape();
  const original = await openRoom({storage, matchId, ...(cards ? {cards} : {}), ...(pilot ? {pilot} : {})});
  const fresh = memoryStorage(), replayed = await replayTape({matchId, pod: meta.pod, seed: meta.seed, tape, cards, pilot, storage: fresh});
  /* The journals as stored, compared by their hash: the same events, in the same order, with the same ids. */
  const a = {...original.fingerprint(), journal: hashState(await store.readJournal())};
  const b = {...replayed.fingerprint(), journal: hashState(await createMatchStore(fresh, matchId).readJournal())};
  return {same: JSON.stringify(a) === JSON.stringify(b), original: a, replayed: b, tape: tape.length};
}
