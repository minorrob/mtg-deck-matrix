/* WHOLE GAMES OF THE ENGINE'S OWN CARDS IN THE ROOM THE TABLE RUNS (the plan review's probe R, as a suite; C4, M5).
 *
 * The cloud table now plays every definition in the card directory (cloud/game-room.mjs, `tableCards`). This plays
 * seeded four-seat games of them through that same card source and the real room (game/room/room.mjs): four house
 * pilots, each seat a random commander-legal definition, 56 random nonland definitions, 6 nonbasic lands and basics to
 * 99, empty steps passed by the room as at a real table. Each game must finish with no exception, inside a time
 * budget -- and a pilot's answer the rules refuse (an attack tax it cannot see) is the room's to survive, said in the
 * history, never the table's end (C2a).
 *
 * At the review (849845bf) two of twelve such games threw (seeds 10 and 11: a departed attacker, a single block on a
 * menace creature) and one never finished. Here every seed finishes or is slow; none throws. Seeds 2, 6 and 7 of the
 * same deal ran past 90 seconds on 2026-10-03 -- the room's per-request cost the review measured (2.12) -- and join now
 * that each object is derived once per question (rules/layers.mjs, `deriving`; engine-derive-once).
 *
 * THE DEAL IS PINNED (tests/fixtures/room-games-pool.json): the cards it deals from, in order, are main's definitions at
 * e243ccde. Dealt from the live directory, every batch of new definitions changed every seed's decks -- X5e to X5g's
 * nine cards turned seed 4 into a 78-turn game nobody had chosen -- so what a seed held depended on the card count, not
 * on the change under test. The table's current definitions of those cards are what is played.
 */
import assert from "node:assert/strict";
import {startRoom} from "../game/room/room.mjs";
import {memoryStorage} from "../game/engine/storage.mjs";
import {tableCards} from "../cloud/game-room.mjs";
import {readFileSync} from "node:fs";
import {commanderLegal} from "../game/room/table.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };

const SEEDS = [1, 2, 4, 6, 7, 8, 9, 10, 11, 12];
/* Seconds a game may take here. THE BUDGET IS A MACHINE'S, AND SAYS WHICH (the independent review of 2026-10-05, F-2).
   Measured alone on the cloud container (Node 22.22, 4 cores, 2026-10-05; docs/review-response-2026-10-05.md): the
   slowest held seed is 1, about 18 s; the rest 1.5-6 s. Seed 11 took 4 s when this budget was set (5022e161), 21 s by
   the code freeze -- the house pilot casting in one action (X8a) put more effects on the board, and ordering a layer's
   effects asked each pair again on every pass, four deep copies a trial -- and 5 s since that was fixed, the same game
   event for event. Node 24 runs it no slower than 22. The review's Windows machine ran these games 2 to 2.6 times
   slower than the container, and slower again beside other jobs: there seed 1 is near the budget. A game over it on a
   machine like the container's is a regression to find; on a slower one, say which machine before moving the number. */
const BUDGET_MS = 45000;

const all = JSON.parse(readFileSync(new URL("./fixtures/room-games-pool.json", import.meta.url), "utf8")).names;
const isLand = (d) => (d.types ?? []).includes("Land");
const spells = all.filter((n) => { const d = tableCards(n); return !isLand(d) && d.manaCost && !(d.types ?? []).includes("Planeswalker"); });
const commanders = all.filter((n) => commanderLegal(tableCards(n)));
const lands = all.filter((n) => isLand(tableCards(n)));
const BASICS = ["Plains", "Island", "Swamp", "Mountain", "Forest"];

/* The deal: a linear congruential stream per seed, so a seed is the same four decks on every machine. */
function stream(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function deck(next, seat) {
  const pick = (list, n) => { const out = new Set(); while (out.size < n && out.size < list.length) out.add(list[Math.floor(next() * list.length)]); return [...out]; };
  const cards = [...pick(spells, 56), ...pick(lands, 6)];
  while (cards.length < 99) cards.push(BASICS[Math.floor(next() * 5)]);
  return {seatId: `s${seat}`, name: ["Rob", "Maya", "Trey", "Sam"][seat], pilot: "house", commander: [commanders[Math.floor(next() * commanders.length)]], cards};
}

const played = [];
for (const seed of SEEDS) {
  const next = stream(seed * 7919);
  const pod = {seats: [0, 1, 2, 3].map((seat) => deck(next, seat)), passEmpty: true};
  const started = Date.now();
  let room;
  try {
    room = await startRoom({storage: memoryStorage(), matchId: `games${seed}`, cards: tableCards, pod, seed: `seed-${seed}`});
  } catch (error) {
    assert.fail(`seed ${seed}: the game threw -- ${error.message}`);
  }
  const ms = Date.now() - started, turns = Math.max(...room.history.map((h) => h.turn));
  /* The room's own tally (F-1 of the review of 2026-10-05): the history keeps only its newest 300 lines. */
  const refused = room.refusals.total;
  ok(room.status === "finished", `seed ${seed}: four house pilots played their decks of the engine's own cards to the end (${turns} turns)`);
  ok(ms <= BUDGET_MS, `seed ${seed}: inside the budget of ${BUDGET_MS / 1000} s (${(ms / 1000).toFixed(1)} s)`);
  played.push(`${seed}: ${turns} turns, ${(ms / 1000).toFixed(1)} s${refused ? `, ${refused} refused answer${refused === 1 ? "" : "s"} survived` : ""}`);
}

console.log(`engine-room-games: ${checks} checks passed -- ${SEEDS.length} four-seat games of the engine's own definitions through the table's card source and the real room, every one to its end with no exception (${played.join("; ")}).`);
