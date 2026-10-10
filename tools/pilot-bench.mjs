#!/usr/bin/env node
/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* THE PILOTS' BENCH (AI-2, docs/plan-to-done-2026-09-30.md: "100 seeded games measuring L1's wins against L0").
 *
 * Seeded two-seat games of Rob's seven decks through the real room (tools/fuzz-live.mjs `playGame`, as the table launches
 * them), one seat on the scored pilot (L1, game/engine/pilots/scored-pilot.mjs) and the other on L0
 * (game/engine/pilots/house-pilot.mjs). Game n plays the nth pair of decks, round the 21 pairs, and gives L1 the first
 * seat on even games and the second on odd ones, so neither the deck nor going first is L1's. Measured:
 *
 *   wins      L1's, L0's, and games neither won (a draw, or the turn limit), with a 95% interval on L1's share of the
 *             decided games;
 *   time      every L1 decision timed: the median, the slowest 5% and the slowest (Rob's five-second rule, G-B);
 *   blunders  a checklist read off each pilot's own decisions, the same for both: passing in its own main phase, the
 *             stack empty, with a spell on offer it could cast (L0's own filters: aimed where its effect is meant, not
 *             an X of 0, not convoked); and blocking with a creature that dies and kills nothing while what came at it
 *             (double strike counted twice) would not have killed it (a chump block it did not need).
 *
 *   node tools/pilot-bench.mjs [--games 100] [--from 1] [--setting normal] [--json <out.json>]
 *
 * The decks are data/live-state.json's, the card source the table's own (cloud/game-room.mjs `tableCards`). */
import {readFileSync, writeFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {performance} from "node:perf_hooks";
import {decksFromBackup, playGame} from "./fuzz-live.mjs";
import {seatPilot} from "../game/room/room.mjs";
import {scoredPilot, fight, WEIGHTS} from "../game/engine/pilots/scored-pilot.mjs";

export const DECKS = ["D1 Quintorius Spirits", "D2 Chulane Value Loop", "D3 Atraxa Proliferate", "D4 Felothar Walls", "D5 Shadrix Aristocrats", "D6 Krenko Goblins", "D7 Maralen Exile Cast"];
export const PAIRS = DECKS.flatMap((a, i) => DECKS.slice(i + 1).map((b) => [a, b]));

/* The checklist, read the same way off either pilot's decisions. */
function watch(pilot, counts) {
  const isCreature = (c) => (c?.types ?? []).includes("Creature");
  return {
    ...pilot,
    choose(view, actions) {
      const chosen = pilot.choose(view, actions);
      const mine = view.turnPlayerId === pilot.seat && ["MAIN1", "MAIN2"].includes(view.phase) && view.stackSize === 0;
      if (chosen.kind === "pass" && mine && actions.some((a) => a.kind === "cast" && a.x !== 0 && !a.convoke && !(a.targets ?? []).length)) counts.passedWithSpell += 1;
      return chosen;
    },
    answer(view, choice) {
      const given = pilot.answer(view, choice);
      if (String(choice.id).startsWith("declare-blockers:")) {
        const onBoard = new Map(view.players.flatMap((p) => p.zones.Battlefield.cards).filter(isCreature).map((c) => [c.cardId, c]));
        const attacks = (view.combat?.attacks ?? []).filter((a) => a.defender === pilot.seat && a.planeswalker === undefined);
        /* What came at it, double strike twice (CR 702.4b), as L1 reckons it. */
        const incoming = attacks.reduce((n, a) => {const c = onBoard.get(a.attacker); return n + Math.max(0, c?.power ?? 0) * ((c?.keywords ?? []).includes("Double Strike") ? 2 : 1);}, 0);
        const life = view.players[pilot.seat].life;
        for (const i of given.indices ?? []) {
          const o = choice.options[i], a = onBoard.get(o?.attackerId), b = onBoard.get(o?.cardId);
          if (!a || !b) continue;
          const r = fight(a, b);
          if (r.blockerDies && !r.attackerDies && incoming < life) counts.needlessChump += 1;
        }
      }
      return given;
    },
  };
}

const interval = (wins, n) => {
  if (!n) return [0, 0];
  const p = wins / n, half = 1.96 * Math.sqrt((p * (1 - p)) / n);
  return [Math.max(0, p - half), Math.min(1, p + half)];
};
const quantile = (sorted, q) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] : 0);

/** One game: game n's pair of decks, L1 in the seat n's parity gives it. */
export async function benchGame({n, decksByName, cards, setting = "normal", parts, weights, turnLimit = 400}) {
  const [a, b] = PAIRS[(n - 1) % PAIRS.length];
  const l1Seat = n % 2 === 0 ? 0 : 1;
  const decks = [decksByName.get(a), decksByName.get(b)];
  const times = [], counts = {l1: {passedWithSpell: 0, needlessChump: 0}, l0: {passedWithSpell: 0, needlessChump: 0}};
  const timed = (p) => ({...p,
    choose(view, actions) {const t = performance.now(); try {return p.choose(view, actions);} finally {times.push(performance.now() - t);}},
    answer(view, choice) {const t = performance.now(); try {return p.answer(view, choice);} finally {times.push(performance.now() - t);}}});
  /* The seats as the table seats them (game/room/room.mjs `seatPilot`): L1 at its setting, handed its deck and the match's
     seed by the room; L0 with none. Only what the bench measures, and any parts or weights it is trying, are added. */
  const levels = l1Seat === 0 ? [setting, null] : [null, setting];
  const makePilot = (given) => (given.level
    ? watch(timed(parts || weights ? scoredPilot({...given, setting: given.level, ...(parts ? {parts} : {}), ...(weights ? {weights} : {})}) : seatPilot(given)), counts.l1)
    : watch(seatPilot(given), counts.l0));
  const game = await playGame({decks, seed: `bench-${n}`, matchId: `bench-${n}`, cards, humans: [], levels, pilot: makePilot, turnLimit});
  const winner = game.result?.winner ?? null;
  const outcome = winner === null ? "neither" : winner === `s${l1Seat}` ? "l1" : "l0";
  return {n, decks: [a, b], l1Seat, outcome, reason: game.result?.reason ?? game.status, turns: game.turns, ms: game.ms, times, counts, refused: game.refusals?.total ?? 0};
}

export function summarize(rows) {
  const l1 = rows.filter((r) => r.outcome === "l1").length, l0 = rows.filter((r) => r.outcome === "l0").length;
  const times = rows.flatMap((r) => r.times).sort((x, y) => x - y);
  const sum = (who, key) => rows.reduce((n, r) => n + r.counts[who][key], 0);
  return {games: rows.length, l1, l0, neither: rows.length - l1 - l0, share: l1 + l0 ? l1 / (l1 + l0) : 0, interval: interval(l1, l1 + l0),
    decisions: times.length, medianMs: quantile(times, 0.5), p95Ms: quantile(times, 0.95), slowestMs: times[times.length - 1] ?? 0,
    blunders: {l1: {passedWithSpell: sum("l1", "passedWithSpell"), needlessChump: sum("l1", "needlessChump")}, l0: {passedWithSpell: sum("l0", "passedWithSpell"), needlessChump: sum("l0", "needlessChump")}},
    refused: rows.reduce((n, r) => n + r.refused, 0)};
}

async function main(argv) {
  const arg = (name, fallback) => {const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : fallback;};
  const games = Number(arg("games", "100")), from = Number(arg("from", "1")), setting = arg("setting", "normal");
  /* --parts cast,attack: only those scored, the rest L0's (none: L0 throughout, the control); --weights '{"exposure": 5}': weights changed for the run. */
  const parts = arg("parts") === "none" ? [] : arg("parts") ? arg("parts").split(",") : undefined;
  const weights = arg("weights") ? {...WEIGHTS, ...JSON.parse(arg("weights"))} : undefined;
  const {tableCards} = await import("../cloud/game-room.mjs");
  const backup = JSON.parse(readFileSync(new URL("../data/live-state.json", import.meta.url), "utf8"));
  const decksByName = new Map(decksFromBackup(backup, DECKS).map((d) => [d.name, d]));
  const rows = [];
  for (let n = from; n < from + games; n += 1) {
    const row = await benchGame({n, decksByName, cards: tableCards, setting, parts, weights});
    rows.push(row);
    console.log(`game ${n}: ${row.decks.join(" v ")}, L1 in s${row.l1Seat}: ${row.outcome === "l1" ? "L1 won" : row.outcome === "l0" ? "L0 won" : "neither"} (${row.reason}), ${row.turns} turns, ${(row.ms / 1000).toFixed(1)} s`);
  }
  const s = summarize(rows);
  console.log(`L1 (${setting}) won ${s.l1}, L0 ${s.l0}, neither ${s.neither} of ${s.games}: L1 ${(100 * s.share).toFixed(0)}% of the decided games (95%: ${(100 * s.interval[0]).toFixed(0)}-${(100 * s.interval[1]).toFixed(0)}%)`);
  console.log(`L1's ${s.decisions} decisions: median ${s.medianMs.toFixed(2)} ms, slowest 5% from ${s.p95Ms.toFixed(2)} ms, slowest ${s.slowestMs.toFixed(1)} ms; ${s.refused} answers refused by the rules`);
  console.log(`blunders, L1 then L0: passed with a spell to cast ${s.blunders.l1.passedWithSpell} / ${s.blunders.l0.passedWithSpell}; a chump block not needed ${s.blunders.l1.needlessChump} / ${s.blunders.l0.needlessChump}`);
  const out = arg("json");
  if (out) writeFileSync(out, JSON.stringify({setting, parts: parts ?? "all", weights: weights ?? WEIGHTS, node: process.version, summary: s, rows: rows.map(({times, ...r}) => r)}, null, 2));
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exit(await main(process.argv.slice(2)));
