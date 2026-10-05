#!/usr/bin/env node
/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* SEEDED WHOLE GAMES OF A LIBRARY'S DECKS THROUGH THE REAL ROOM, JUDGED OVER THE WHOLE MATCH (the independent review of
 * 2026-10-05, F-1).
 *
 * The review's fuzz script read `room.history` for "was refused" once a game had ended. The room keeps only its newest
 * 300 history lines, so a refusal early in a long game was gone by then and the script printed zero. This harness reads
 * the room's own tally instead (game/room/room.mjs, `refusals`), which counts every refused pilot answer from the
 * match's first event and is saved with the room, so it is the same after any reopening. A game is clean only when it
 * finished, its tally began at the match's start (`since` 0) and its total is zero -- a refusal the room survived with
 * its least answer is still a refusal.
 *
 * Seats are the table's: s0..s3, each a deck of the backup by name. The human seats answer with the random-legal pilot
 * from a stream of their own, through the same action envelope a browser sends (`room.act`); the others are house
 * pilots, answered inside the room. A person's wait is how long one of their answers took to come back as their next
 * question: everything the AI seats did in between.
 *
 *   node tools/fuzz-live.mjs --backup <crankmagic-backup.json> --decks "<deck 1>|<deck 2>|<deck 3>|<deck 4>"
 *        [--humans 0,1] [--seeds 1-50] [--json <out.json>]
 *
 * Exit 0 when every game is clean, 1 when any is not, 2 on a usage error. The card source is the cloud table's own
 * (cloud/game-room.mjs `tableCards`): a deck with a card the table cannot play is refused by name, as at the table. */
import {readFileSync, writeFileSync} from "node:fs";
import {randomUUID} from "node:crypto";
import {fileURLToPath} from "node:url";
import {startRoom, openRoom} from "../game/room/room.mjs";
import {memoryStorage} from "../game/engine/storage.mjs";
import {createRng} from "../game/engine/rng.mjs";
import {randomLegalPilot} from "../game/engine/pilots/random-legal.mjs";

const NAMES = ["Rob", "Friend", "AI 2", "AI 3"];

/** The decks of a crankmagic-backup file, by name, as the table takes them (crankmagic-table.js `deckForTable`). */
export function decksFromBackup(backup, names) {
  const state = backup && backup.payload && backup.payload.state;
  if (!backup || backup.format !== "crankmagic-backup" || !state) throw new Error("That file is not a CrankMagic backup (crankmagic-backup, version 1).");
  const cardName = (id) => (state.cards[id] || {}).name;
  return names.map((wanted) => {
    const deck = state.decks.find((d) => d.name === wanted && !d.archived);
    if (!deck) throw new Error(`The backup has no deck named "${wanted}". Its decks: ${state.decks.filter((d) => !d.archived).map((d) => d.name).join("; ")}.`);
    const commanders = new Set(deck.commanders || []);
    const cards = [];
    for (const slot of deck.slots || []) {
      if (slot.purpose !== "main" || commanders.has(slot.cardId)) continue;
      for (let i = 0; i < (slot.quantity || 1); i += 1) cards.push(cardName(slot.cardId));
    }
    return {name: deck.name, commander: [...commanders].map(cardName).filter(Boolean), cards: cards.filter(Boolean)};
  });
}

/* A person at the table: answers what they are shown, from a stream of their own. */
function person(seed) {
  const pilot = randomLegalPilot(createRng(seed));
  return (decision) => {
    const a = pilot.answer(decision);
    return {kind: "answer", choiceId: decision.id, ...(a.indices ? {indices: a.indices} : {}), ...(a.amounts ? {amounts: a.amounts} : {}), ...(a.value !== undefined ? {value: a.value} : {})};
  };
}

/**
 * One seeded game, played to its end. `decks` are table decks ({name, commander, cards}); `humans` the seat indices
 * a person sits in; `reopenEvery`, when set, puts the room away and wakes it from its storage after that many of the
 * people's answers, as an evicted Durable Object is. Returns what the game was, never its state: how it ended, its
 * length, the people's longest wait and the room's tally of refused AI answers.
 */
export async function playGame({decks, seed, cards, humans = [], matchId = `fuzz-${seed}`, pilot, storage = memoryStorage(), turnLimit = 400, reopenEvery = 0}) {
  const pod = {passEmpty: true, seats: decks.map((d, i) => ({seatId: `s${i}`, name: NAMES[i] || `Seat ${i + 1}`, pilot: humans.includes(i) ? "human" : "house", commander: d.commander, cards: d.cards}))};
  const people = Object.fromEntries(humans.map((i) => [`s${i}`, person(`person-${seed}-${i}`)]));
  const started = Date.now();
  let room = await startRoom({storage, matchId, ...(cards ? {cards} : {}), pod, seed: `seed-${seed}`, ...(pilot ? {pilot} : {})});
  let decisions = 0, reopened = 0, longest = {ms: 0, turn: null};
  for (;;) {
    const who = room.waitingOn;
    if (!who || room.status === "finished") break;
    const view = room.view(who);
    if (view.state.turn > turnLimit) break;
    const asked = Date.now();
    await room.act(who, {actionId: randomUUID(), revision: view.revision, ...people[who](view.decision)});
    const waited = Date.now() - asked;
    decisions += 1;
    if (waited > longest.ms) longest = {ms: waited, turn: room.view(who).state.turn};
    if (reopenEvery && decisions % reopenEvery === 0) {room = await openRoom({storage, matchId, ...(cards ? {cards} : {}), ...(pilot ? {pilot} : {})}); reopened += 1;}
  }
  const last = room.view(pod.seats[0].seatId);
  return {seed, status: room.status, result: last.result, turns: last.state.turn, decisions, reopened, ms: Date.now() - started, longestWait: longest, refusals: room.refusals, room};
}

/** Whether a game counts as clean, and why not when it does not. */
export function verdict(game) {
  const problems = [];
  if (game.status !== "finished") problems.push(`did not finish (${game.status} at turn ${game.turns})`);
  const r = game.refusals;
  if (!r || typeof r.total !== "number") problems.push("the room kept no refusal tally");
  else {
    if (r.since !== 0) problems.push(`its refusal tally began at event ${r.since}, not the match's start, so a zero would not cover the whole game`);
    if (r.total > 0) problems.push(`${r.total} AI answer${r.total === 1 ? " was" : "s were"} refused by the rules (first: turn ${r.first[0]?.turn}, ${r.first[0]?.seatId}, "${r.first[0]?.question}": ${r.first[0]?.reason})`);
  }
  return {clean: problems.length === 0, problems};
}

/** One line per game, in the review's words, with the whole-match tally. */
export function describe(game) {
  const v = verdict(game), end = game.result ? `${game.result.winner ?? "no one"}, ${game.result.reason}` : "unfinished";
  const wait = game.longestWait.turn === null ? "0 ms (no person)" : `${game.longestWait.ms} ms (turn ${game.longestWait.turn})`;
  return `seed ${game.seed}: ${game.status} (${end}), ${game.turns} turns, ${game.decisions} decisions, ${(game.ms / 1000).toFixed(1)} s, longest wait for a person ${wait}, ${game.refusals?.total ?? "?"} refused over the whole match${v.clean ? "" : ` -- NOT CLEAN: ${v.problems.join("; ")}`}`;
}

const seedsFrom = (spec) => spec.split(",").flatMap((part) => {
  const [a, b] = part.split("-").map(Number);
  if (!Number.isInteger(a) || (b !== undefined && !Number.isInteger(b))) throw new Error(`Seeds are numbers or ranges, like 1-50: ${spec}`);
  return b === undefined ? [a] : Array.from({length: b - a + 1}, (_, i) => a + i);
});

async function main(argv) {
  const arg = (name, fallback) => {const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : fallback;};
  const backupPath = arg("backup"), deckNames = arg("decks");
  if (!backupPath || !deckNames) {console.error("usage: node tools/fuzz-live.mjs --backup <file> --decks \"A|B|C|D\" [--humans 0,1] [--seeds 1-50] [--json <out>]"); return 2;}
  const {tableCards} = await import("../cloud/game-room.mjs");
  const decks = decksFromBackup(JSON.parse(readFileSync(backupPath, "utf8")), deckNames.split("|"));
  const humansSpec = arg("humans", "");
  const humans = humansSpec ? humansSpec.split(",").map(Number) : [];
  const seeds = seedsFrom(arg("seeds", "1-50"));
  decks.forEach((d, i) => console.log(`s${i} ${NAMES[i]} (${humans.includes(i) ? "human" : "house"}): ${d.name}`));
  const rows = [];
  for (const seed of seeds) {
    const game = await playGame({decks, seed, cards: tableCards, humans});
    console.log(describe(game));
    rows.push({seed, status: game.status, result: game.result, turns: game.turns, decisions: game.decisions, ms: game.ms, longestWait: game.longestWait, refusals: game.refusals, clean: verdict(game).clean});
  }
  const clean = rows.filter((r) => r.clean).length;
  console.log(`${clean} of ${rows.length} games clean (finished, refusals counted from the match's start, none refused)`);
  const out = arg("json");
  if (out) writeFileSync(out, JSON.stringify({decks: decks.map((d) => d.name), humans, node: process.version, rows}, null, 2));
  return clean === rows.length ? 0 : 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exit(await main(process.argv.slice(2)));
