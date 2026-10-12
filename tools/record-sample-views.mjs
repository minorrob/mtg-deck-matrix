#!/usr/bin/env node
/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* SAMPLE VIEWS FOR A PROTOTYPING TOOL (docs/ui-lane/gameplay-anchor.md, 2026-10-12). One real game through the room the
 * table runs (four seats: s0 a person answering with the fuzz harness's random-legal person, three L1 "normal" AI
 * seats, decks made from the library as tools/fuzz-live.mjs --library makes them), recording every view s0 is sent at
 * its decisions, then keeping the first view of each kind of question, a spread across the game, and the last.
 *
 *   node --stack-size=4000 tools/record-sample-views.mjs <repository root> docs/ui-lane/sample-views.json [seed]
 */
import {writeFileSync} from "node:fs";
const [,, root, out, seedArg = "7"] = process.argv;
const {playGame, person, decksFromLibrary, libraryFrom} = await import(root + "/tools/fuzz-live.mjs");
const {tableCards} = await import(root + "/cloud/game-room.mjs");
const seed = Number(seedArg), library = libraryFrom(new URL("file://" + root + "/"));
const decks = decksFromLibrary(seed, {...library, cards: tableCards});
const seen = [];
const recorder = (s) => {const answer = person(s); const f = (decision, turn, view) => {seen.push(structuredClone(view)); return answer(decision, turn, view);}; Object.defineProperty(f, "stopped", {get: () => answer.stopped}); return f;};
const game = await playGame({decks, seed, cards: tableCards, humans: [0], levels: [null, "normal", "normal", "normal"], people: recorder, matchId: `sample-${seed}`});
const last = game.room.view("s0");
const keyOf = (v) => `${v.decision?.kind || v.decision?.mode}:${(v.decision?.title || "").replace(/[0-9]+/g, "N").replace(/: .*/, "")}`;
const picked = new Map();
for (const v of seen) {const k = keyOf(v); if (!picked.has(k)) picked.set(k, v);}
const spread = seen.filter((_, i) => i % Math.max(1, Math.floor(seen.length / 24)) === 0);
const chosen = [...new Map([...picked.values(), ...spread].map((v) => [v.revision, v])).values()].sort((a, b) => a.revision - b.revision);
const trim = (v) => ({...v, history: (v.history || []).slice(0, 12)});
const sample = {
  schema: "CrankMagicSampleViews@1",
  about: "One seat's views (s0, the person) through one real game played by the CrankMagic room: what that browser is sent at each of its decisions. Hidden information is already removed. Card images: Scryfall by exact name.",
  seed, decks: decks.map((d, i) => ({seatId: `s${i}`, deck: d.name, commander: d.commander})),
  result: last.result, turns: last.state.turn, decisionsInGame: seen.length, kept: chosen.length + 1,
  views: [...chosen.map(trim), trim(last)],
};
writeFileSync(out, JSON.stringify(sample) + "\n");
console.log("game", game.status, "turns", last.state.turn, "person decisions", seen.length, "kinds", picked.size, "kept", sample.kept, "bytes", JSON.stringify(sample).length);
console.log([...picked.keys()].join("\n"));
