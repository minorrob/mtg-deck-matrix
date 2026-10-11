/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* G1 OVER ROB'S WHOLE LIBRARY (tools/fuzz-live.mjs, decksFromLibrary and --library; G1-L, 2026-10-11).
 *
 * G1's 1,400 games played his seven decks' 477 cards; the rest of his library was proven by its cards' scenarios alone. A
 * sweep of 450 games over decks made from the whole library found what only a game finds: a waterbend paid with rider
 * mana that stalled a table (tests/engine-waterbend.mjs holds the rule). Here:
 *   1. Each deck is a Commander deck of the library: a legendary creature the table plays, and 99 cards of the library
 *      the table plays, in its color identity (CR 903.4), none twice but basics (903.5b); the same seed, the same decks.
 *   2. Exactly, on a library made up here: twelve lands at most, the spells, then basics of its colors -- Wastes for a
 *      colorless commander -- to 99.
 *   3. A game's exception is that game unclean, said with its seed, and the run goes on (playSafely).
 *   4. Seed 229, the game that stalled, played through the real room with a person in seat 0: clean, replayed
 *      identically, no seat sent a card it may not know.
 */
import assert from "node:assert/strict";
import {decksFromLibrary, libraryFrom, playSafely, verdict, LIBRARY_BASICS} from "../tools/fuzz-live.mjs";
import {tableCards} from "../cloud/game-room.mjs";

let checks = 0;
const ok = (c, m) => {assert.ok(c, m); checks += 1;};
const eq = (a, b, m) => {assert.deepEqual(a, b, m); checks += 1;};

const BASICS = new Set([...Object.values(LIBRARY_BASICS), "Wastes"]);
const lib = libraryFrom();

/* ---- 1. Commander decks of the library ---- */
{
  ok(lib.library.length > 1000, `the library is Rob's: ${lib.library.length} cards (data/live-load.json)`);
  const problems = [];
  for (const seed of [1, 2, 3, 229]) {
    const decks = decksFromLibrary(seed, {...lib, cards: tableCards});
    if (decks.length !== 4 || new Set(decks.map((d) => d.name)).size !== 4) problems.push(`seed ${seed}: not four commanders`);
    for (const d of decks) {
      const commander = lib.oracle(d.commander[0]), ci = commander.ci || [];
      if (!/Legendary/.test(commander.type) || !/Creature/.test(commander.type.split("//")[0])) problems.push(`${d.name}: not a legendary creature`);
      if (d.cards.length !== 99) problems.push(`${d.name}: ${d.cards.length} cards, not 99`);
      const others = d.cards.filter((n) => !BASICS.has(n));
      if (new Set(others).size !== others.length) problems.push(`${d.name}: a card twice`);
      for (const n of [...d.commander, ...d.cards]) {
        if (!BASICS.has(n) && !lib.library.includes(n)) problems.push(`${d.name}: ${n} is not in the library`);
        if (!tableCards(n)) problems.push(`${d.name}: ${n} is not a card the table plays`);
        if (!(lib.oracle(n)?.ci || []).every((c) => ci.includes(c))) problems.push(`${d.name}: ${n} is outside its color identity`);
      }
    }
  }
  eq(problems, [], "each seed's four decks are Commander decks of the library: a legendary creature, 99 cards the table plays in its color identity, none twice but basics");
  const names = (seed) => decksFromLibrary(seed, {...lib, cards: tableCards}).map((d) => [d.name, ...d.cards].join("|"));
  eq(names(229), names(229), "the same seed makes the same decks");
  ok(JSON.stringify(names(1)) !== JSON.stringify(names(2)), "and another seed others");
}

/* ---- 2. Exactly, on a library made up here ---- */
{
  const card = (type, ci = []) => ({type, ci, layout: "normal"});
  const made = {Colorless: card("Legendary Artifact Creature — Golem"), Red: card("Legendary Creature — Goblin", ["R"]),
    Bolt: card("Instant", ["R"]), Nope: card("Instant", ["R"]), Rock: card("Artifact"), Plaza: card("Land"), Swamp: card("Basic Land — Swamp", ["B"]), Doom: card("Sorcery", ["B"])};
  for (let i = 0; i < 14; i += 1) made[`Ruin ${i}`] = card("Land");
  /* "Nope" is a card the table does not play: never in a deck. */
  const library = Object.keys(made), oracle = (n) => made[n], cards = (n) => (n in made && n !== "Nope" ? {} : null);
  const decks = decksFromLibrary(7, {library, oracle, cards, count: 2});
  const of = (name) => decks.find((d) => d.name === name);
  eq(decks.map((d) => d.name).sort(), ["Colorless", "Red"], "the two legendary creatures lead");
  const lands = (d) => d.cards.filter((n) => /^Ruin|Plaza/.test(n)).length;
  eq([lands(of("Colorless")), lands(of("Red"))], [12, 12], "twelve of the library's fifteen lands, no more");
  eq(of("Colorless").cards.filter((n) => !/^Ruin|Plaza/.test(n)).sort(), ["Rock", ...Array(86).fill("Wastes")].sort(), "the colorless commander: the colorless spell, then Wastes to 99");
  eq(of("Red").cards.filter((n) => !/^Ruin|Plaza/.test(n)).sort(), ["Bolt", "Colorless", "Rock", ...Array(84).fill("Mountain")].sort(),
    "the red one: its red and colorless cards -- the colorless commander among them, a card like any other here -- Mountains to 99, never Doom, the Swamp or the card the table does not play");
}

/* ---- 3. A game's exception is that game unclean, and the run goes on ---- */
{
  const decks = decksFromLibrary(1, {...lib, cards: tableCards});
  const broken = {answer() { throw new Error("pilot broke"); }, choose() { throw new Error("pilot broke"); }};
  const thrown = await playSafely({decks, seed: 1, cards: tableCards, pilot: () => broken, matchId: "lib-thrown"});
  ok(thrown.game === undefined && /pilot broke/.test(thrown.exception ?? ""), `a game that throws is returned as its exception, not thrown: ${thrown.exception}`);
}

/* ---- 4. Seed 229, the game that stalled ---- */
{
  const decks = decksFromLibrary(229, {...lib, cards: tableCards});
  const {game, exception} = await playSafely({decks, seed: 229, cards: tableCards, humans: [0], levels: [null, "normal", "normal", "normal"], replay: true, leaks: true, matchId: "lib-229"});
  eq(exception, undefined, "seed 229 played through the real room throws nothing");
  const v = verdict(game);
  eq(v.problems, [], `and is clean: finished, nothing refused, replayed identically, no leak (${game.turns} turns, ${game.leakChecks} checks of every seat's view)`);
}

console.log(`fuzz-library: ${checks} checks passed -- each seed's four decks Commander decks of Rob's library, the same for the same seed; a game's exception said with its seed; seed 229, the waterbend that stalled a table, played clean.`);
