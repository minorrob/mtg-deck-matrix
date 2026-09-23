/* THE HASH IS HOW "THE SAME GAME" IS CHECKED AT ALL.
 *
 * `docs/engine/PLAN.md` §3.1 (journal.mjs: "CommanderProbeEvent@1 writer, state hashes,
 * checkpoints") and the phase 1 gate: a four-player game replays to THE SAME HASH. Everything
 * that claim is worth depends on the hash actually distinguishing one state from another, and on
 * it not distinguishing two states that are the same game.
 *
 * The second half is the one that bites. A hash over `JSON.stringify(state)` looks right and is
 * wrong: object key order is insertion order, so a state rebuilt from a checkpoint in a different
 * order hashes differently and a correct replay is reported as a divergence. This suite pins the
 * property rather than the implementation.
 */
import assert from "node:assert/strict";
import {hashState, createJournal, EVENT_SCHEMA} from "../game/engine/journal.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

/* ---- the hash is stable, and blind to key order ---- */
{
  const a = {turn: 3, active: 0, players: [{life: 40, hand: 7}, {life: 37, hand: 5}]};
  const b = {players: [{hand: 7, life: 40}, {hand: 5, life: 37}], active: 0, turn: 3};
  eq(hashState(a), hashState(b),
    "key order must not change a hash, or a state rebuilt from a checkpoint reads as a divergence");
  eq(hashState(a), hashState(a), "the same state hashes the same twice");
  ok(/^[0-9a-f]{16}$/.test(hashState(a)), "a hash is a short hex string a person can compare by eye");
}

/* ---- but it notices what actually differs ---- */
{
  const base = {turn: 3, players: [{life: 40}, {life: 37}]};
  const differ = [
    [{turn: 4, players: [{life: 40}, {life: 37}]}, "the turn"],
    [{turn: 3, players: [{life: 39}, {life: 37}]}, "one life total"],
    [{turn: 3, players: [{life: 37}, {life: 40}]}, "the order of two players"],
    [{turn: 3, players: [{life: 40}, {life: 37}, {life: 40}]}, "an extra player"],
    [{turn: 3, players: [{life: 40}, {life: "37"}]}, "a number that became a string"],
    [{turn: 3, players: [{life: 40}, {}]}, "a missing field"],
  ];
  for (const [other, what] of differ) {
    ok(hashState(base) !== hashState(other), `the hash notices ${what}`);
  }
  ok(hashState({a: undefined, b: 1}) !== hashState({b: 1, c: undefined}),
    "an undefined field is still a field, and is not silently dropped into equality");
  /* ARRAY ORDER IS MEANING. A library is an ordered zone; sorting it would hide a shuffle. */
  ok(hashState({zone: [1, 2, 3]}) !== hashState({zone: [3, 2, 1]}),
    "array order is preserved — a library is ordered and a shuffle must change its hash");
}

/* ---- the journal ---- */
{
  const j = createJournal({matchId: "m1", seed: "s1"});
  eq(j.events(), [], "a fresh journal is empty");

  const firstId = j.write("GameEventTurnBegan", {turn: 1, player: 0});
  j.write("GameEventCardDrawn", {player: 0, count: 1});
  const events = j.events();
  eq(events.length, 2, "each write is one event");
  eq(events[0].schema, EVENT_SCHEMA, "every event names its schema, so a reader can refuse an old one");

  /* THE ENVELOPE IS THE ONE ALREADY ON DISK. `ForgeProbe.java` writes eventId, sequence and
     visibility; `match-telemetry.mjs` keys its metadata, its rows and its cast-to-resolution
     chains off eventId. An envelope missing it would leave every row with an undefined id and
     fold every chain into one, which looks like a board that has stopped reporting. */
  eq(events[0].eventId, "event:1", "every event carries the eventId the existing readers key off");
  eq(events[1].eventId, "event:2", "derived from the sequence, so a replay produces the same ids");
  eq(firstId, "event:1", "and write returns it, the way the probe's append does");
  eq(events[0].visibility, "engine-private",
    "the journal is the engine's own record; what a seat may see is the host's decision, not this file's");
  eq(events[0].kind, "GameEventTurnBegan", "the engine's event kinds, not a private vocabulary");
  eq(events[0].sequence, 1, "events are numbered from one");
  eq(events[1].sequence, 2, "and the numbers do not repeat");
  eq(events[0].matchId, "m1", "each event carries the match it belongs to");
  ok(!("at" in events[0]) || typeof events[0].at === "number",
    "no wall-clock timestamp, or a number a replay can reproduce — a Date would make a replay differ from its original");

  /* A journal line is a record, not a handle on live state. */
  const written = j.events();
  written[0].data.turn = 99;
  eq(j.events()[0].data.turn, 1, "a caller cannot reach back into a written event and change it");
}

/* ---- checkpoints ---- */
{
  const j = createJournal({matchId: "m2", seed: "s2"});
  j.write("GameEventTurnBegan", {turn: 1});
  const state = {turn: 1, players: [{life: 40}]};
  const point = j.checkpoint(state, {words: [1, 2, 3, 4], draws: 9});

  eq(point.sequence, 1, "a checkpoint says which event it follows");
  eq(point.hash, hashState(state), "and carries the hash of the state it saved");
  eq(point.rng, {words: [1, 2, 3, 4], draws: 9}, "and the rng position, which is what makes resume exact");
  eq(JSON.parse(JSON.stringify(point)), point, "a checkpoint is plain data");

  state.turn = 2;
  ok(point.hash !== hashState(state), "the checkpoint's hash is of the state as it was, not as it becomes");
  eq(point.state.turn, 1, "and it holds its own copy, so the live state moving on does not rewrite history");
}

/* ---- the same run twice is the same journal ---- */
{
  const run = () => {
    const j = createJournal({matchId: "fixed", seed: "fixed"});
    j.write("GameEventTurnBegan", {turn: 1, player: 0});
    j.write("GameEventCardDrawn", {player: 0, count: 1});
    return JSON.stringify(j.events());
  };
  eq(run(), run(), "two identical runs produce byte-identical journals — no clock, no counter shared between games");
}

console.log(`engine-journal: ${checks} checks passed — the hash ignores key order, notices everything that matters, and a checkpoint holds its own copy.`);
