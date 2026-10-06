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
import {deriveMemo} from "../game/engine/rules/layers.mjs";

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

/* THE CPU CHECK, MACHINE BY MACHINE (X9). The budget above catches a game that hangs; it cannot catch a game five times
   slower on a fast machine, which is what F-2 was (seed 11, 4 s to 21 s, all of it under 45). So each game's CPU is
   also measured -- its own thread's, as Cloudflare counts a request's -- in units of a yardstick run in the same process
   just before: fixed engine-like work (objects spread and copied, lists filtered, JSON made, a Map asked). A slower
   machine is slower at both, so the ratio is the machine's no more than the game's. Measured 2026-10-06 on the cloud
   container (Node 22.22, 4 cores), per thousand events: a game 1.8 to 9.4, the ten together 4.1 to 5.4, alone or three
   at a time as the gate runs suites (a run's yardstick moves all ten together by up to a third). With F-2 put back (a
   trial a deep copy) seed 2 was 13.5 and seed 11 37.7. Then the house pilot could pay from a pool more than one way (X8b)
   and every game changed: seed 4 became 75 turns, 3,755 events, on a board of layered effects -- 14.4 alone, 18.0 three
   at a time -- and the ten together 5.5 alone, 6.6 three at a time. So a game may take 25, and the ten together 9.
   The counts are the machine's not at all: each object derived once per question (engine-derive-once) holds the
   derivations to 79-121 an event, and seed 4's crowded board to 638; each pair of effects asked once per ordering (CR
   613.8a, rules/layers.mjs) the dependency trials to 0-961, seed 4's to 1,302; with the memo off a single projection
   derived a board hundreds of thousands of times. */
const CPU_PER_THOUSAND_EVENTS = 25, CPU_PER_THOUSAND_EVENTS_IN_ALL = 9, DERIVATIONS_PER_EVENT = 1000, TRIALS_PER_EVENT = 2500;
ok(typeof process.threadCpuUsage === "function", "this Node measures a thread's own CPU (process.threadCpuUsage, Node 22.22 and later)");
const threadMs = () => { const used = process.threadCpuUsage(); return (used.user + used.system) / 1000; };
function yardstick() {
  const began = threadMs();
  let sink = 0;
  for (let round = 0; round < 160; round += 1) {
    const board = Array.from({length: 60}, (_, i) => ({id: i, types: ["Creature", i % 3 ? "Artifact" : "Enchantment"], subtypes: ["Elf"], keywords: i % 2 ? ["Flying"] : [], power: i % 5, toughness: i % 7, abilities: [{kind: "static", apply: {power: 1}, affects: {what: "creature", controller: "you"}}]}));
    const seen = new Map();
    for (let pass = 0; pass < 120; pass += 1) {
      for (const o of board) {
        const c = {...o, types: [...o.types], keywords: [...o.keywords]};
        if (c.types.includes("Artifact")) c.power += 1;
        const key = `${o.id}|${pass & 3}`;
        if (!seen.has(key)) seen.set(key, JSON.stringify(c).length);
        sink += seen.get(key) + board.filter((x) => x.power === c.power).length;
      }
    }
  }
  ok(sink > 0, "the yardstick did its work");
  return threadMs() - began;
}
yardstick();
const UNIT_MS = [yardstick(), yardstick(), yardstick(), yardstick(), yardstick()].sort((a, b) => a - b)[2];

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
let allCpuMs = 0, allEvents = 0;
for (const seed of SEEDS) {
  const next = stream(seed * 7919);
  const pod = {seats: [0, 1, 2, 3].map((seat) => deck(next, seat)), passEmpty: true};
  const started = Date.now();
  deriveMemo.reset();
  const cpuFrom = threadMs();
  let room;
  try {
    room = await startRoom({storage: memoryStorage(), matchId: `games${seed}`, cards: tableCards, pod, seed: `seed-${seed}`});
  } catch (error) {
    assert.fail(`seed ${seed}: the game threw -- ${error.message}`);
  }
  const ms = Date.now() - started, cpuMs = threadMs() - cpuFrom, turns = Math.max(...room.history.map((h) => h.turn));
  const events = room.fingerprint().events, perThousand = cpuMs / UNIT_MS / (events / 1000);
  allCpuMs += cpuMs; allEvents += events;
  /* The room's own tally (F-1 of the review of 2026-10-05): the history keeps only its newest 300 lines. */
  const refused = room.refusals.total;
  ok(room.status === "finished", `seed ${seed}: four house pilots played their decks of the engine's own cards to the end (${turns} turns)`);
  ok(ms <= BUDGET_MS, `seed ${seed}: inside the budget of ${BUDGET_MS / 1000} s (${(ms / 1000).toFixed(1)} s)`);
  ok(perThousand <= CPU_PER_THOUSAND_EVENTS, `seed ${seed}: its CPU is ${perThousand.toFixed(1)} yardsticks a thousand events (${(cpuMs / 1000).toFixed(1)} s for ${events} events; a yardstick is ${UNIT_MS.toFixed(0)} ms here), inside ${CPU_PER_THOUSAND_EVENTS}`);
  ok(deriveMemo.count() / events <= DERIVATIONS_PER_EVENT, `seed ${seed}: ${Math.round(deriveMemo.count() / events)} derivations an event, inside ${DERIVATIONS_PER_EVENT}`);
  ok(deriveMemo.trials() / events <= TRIALS_PER_EVENT, `seed ${seed}: ${Math.round(deriveMemo.trials() / events)} dependency trials an event, inside ${TRIALS_PER_EVENT}`);
  played.push(`${seed}: ${turns} turns, ${(ms / 1000).toFixed(1)} s, ${perThousand.toFixed(1)} yardsticks/1k events${refused ? `, ${refused} refused answer${refused === 1 ? "" : "s"} survived` : ""}`);
}

const inAll = allCpuMs / UNIT_MS / (allEvents / 1000);
ok(inAll <= CPU_PER_THOUSAND_EVENTS_IN_ALL, `the ten games together: ${inAll.toFixed(1)} yardsticks a thousand events (${(allCpuMs / 1000).toFixed(1)} s of CPU for ${allEvents} events), inside ${CPU_PER_THOUSAND_EVENTS_IN_ALL}`);

console.log(`engine-room-games: ${checks} checks passed -- ${SEEDS.length} four-seat games of the engine's own definitions through the table's card source and the real room, every one to its end with no exception (${played.join("; ")}).`);
