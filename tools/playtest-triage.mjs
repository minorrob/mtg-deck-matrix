#!/usr/bin/env node
/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* THE TRIAGE LOOP, WHERE A MACHINE CAN JUDGE IT (docs/plan-to-100.md M8; Part 7's G-D). Grok Bot's agents hand over a
 * run: one row per finding (docs/uat/playtest-findings.md) and each game's record, downloaded from the board's game-over
 * panel. On a playtest table that record is the whole game -- seed, pod, decision tape and journal (game/room/table.mjs
 * `record`) -- so every game is played again here, an answer at a time, and at every answer each seat's view is judged
 * for hidden information by the oracle G1 used (tools/fuzz-live.mjs `checkLeaks`).
 *
 *   node tools/playtest-triage.mjs <run folder> [--games 50] [--json <out.json>]
 *
 * The run folder holds the findings (a playtest*.csv) and the records (*.json, anywhere under it; the four agents'
 * copies of one game are one game). It says, game by game, whether the game replays to the same journal, threw, or sent
 * a seat a card it may not know; row by row, whether the finding is answered; and then the exit criteria (M8): a run of
 * at least 50 games with zero engine exceptions and zero leaks, every rules and card finding adjudicated, and no
 * severity-1 or -2 finding open in any class. Exit 0 when they are met, 1 when not, 2 when the folder is not a run.
 *
 * A game a `fixed` finding names may replay differently once its fix is in: that's the fix, and it is said so, not
 * counted against the run.
 */
import {readFileSync, readdirSync, statSync, writeFileSync} from "node:fs";
import {gunzipSync} from "node:zlib";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {startRoom} from "../game/room/room.mjs";
import {memoryStorage, createMatchStore} from "../game/engine/storage.mjs";
import {hashState} from "../game/engine/journal.mjs";
import {RECORD_SCHEMA} from "../game/room/table.mjs";
import {leakMemory, checkLeaks} from "./fuzz-live.mjs";

/** A finding's columns, in order (tests/playtest-findings.mjs holds every playtest CSV to them). */
export const COLUMNS = ["id", "game_id", "seat", "turn", "phase", "cards", "happened", "should_have", "cr_rule", "evidence", "severity", "class", "status", "outcome"];

/** A CSV line to its cells: commas split, double quotes group, "" is a quote. */
export function cells(line) {
  const out = []; let cur = "", q = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (q) {if (ch === '"' && line[i + 1] === '"') {cur += '"'; i += 1;} else if (ch === '"') q = false; else cur += ch;}
    else if (ch === '"') q = true; else if (ch === ",") {out.push(cur); cur = "";} else cur += ch;
  }
  out.push(cur); return out;
}

/** A playtest CSV's rows, each keyed by column. */
export function readFindings(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  return lines.slice(1).map((line) => Object.fromEntries(cells(line).map((v, k) => [COLUMNS[k], v])));
}

/** What a closed finding owes its reader: a fixed one names its PR, one ruled as intended its CR rule and why. */
export function unanswered(row) {
  const owes = [];
  if (row.status === "fixed" && !/(#\d+|\/pull\/\d+)/.test(row.outcome || "")) owes.push("fixed, but its outcome names no PR");
  if (row.status === "as-intended" && !row.cr_rule) owes.push("ruled as intended without a CR citation");
  if (row.status === "as-intended" && !row.outcome) owes.push("ruled as intended without saying why");
  return owes;
}

/** What a finding still owes the exit: its answer once closed, adjudication if it is a rules or card finding, and no
    S1 or S2 left open. Empty when it owes nothing. */
export function findingOwes(row) {
  const owes = unanswered(row);
  if (row.status === "open" && (row.class === "rules" || row.class === "card")) owes.push(`a ${row.class} finding not yet adjudicated`);
  if (row.status === "open" && (row.severity === "S1" || row.severity === "S2")) owes.push(`${row.severity} and open`);
  return owes;
}

/** A downloaded record played again from its seed and tape, an answer at a time, every seat's view judged for leaks at
    each answer (`judge`, G1's oracle). What it returns is fingerprints and findings, never a hand or a state. */
export async function replayRecord(record, {cards, judge = checkLeaks} = {}) {
  const out = {matchId: record.matchId, decisions: (record.tape || []).length, result: record.result ?? null,
    seats: (record.pod?.seats || []).map((s) => s.pilot === "human" ? "person" : s.level ? `house ${s.level}` : "house"),
    same: false, exception: null, leaks: [], leakChecks: 0};
  const storage = memoryStorage(), memory = leakMemory(out.seats.length);
  let room = null, at = "the game's start";
  try {
    room = await startRoom({storage, matchId: record.matchId, pod: record.pod, seed: record.seed, ...(cards ? {cards} : {})});
    const look = async () => {out.leaks.push(...await judge(room, storage, record.matchId, memory, room.view(room.seats[0].seatId).state.turn)); out.leakChecks += 1;};
    await look();
    for (const [i, entry] of record.tape.entries()) {
      at = `tape entry ${i + 1} of ${record.tape.length}`;
      await room.replay(entry);
      await look();
    }
  } catch (error) {
    out.exception = `${at}: ${error.message}`;
    return out;
  }
  out.same = room.status === "finished" && hashState(await createMatchStore(storage, record.matchId).readJournal()) === hashState(record.journal);
  return out;
}

/** The records under a folder (*.json and *.json.gz), each a full record of a finished game; the agents' copies of one
    game folded to one, and copies that disagree said so. */
export function readRecords(dir) {
  const files = [], problems = [], games = new Map();
  (function walk(d) {for (const f of readdirSync(d).sort()) {const p = path.join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.json(\.gz)?$/.test(f)) files.push(p);}})(dir);
  for (const file of files) {
    let record;
    try {record = JSON.parse((file.endsWith(".gz") ? gunzipSync(readFileSync(file)) : readFileSync(file)).toString("utf8"));} catch {continue;}
    if (record?.schema !== RECORD_SCHEMA) continue;
    const name = path.relative(dir, file);
    if (record.kind !== "full") {problems.push(`${name}: a seat's record, not a playtest table's -- it has no seed or tape to replay (was the game played on staging?)`); continue;}
    const seen = games.get(record.matchId);
    if (!seen) games.set(record.matchId, {record, file: name});
    else if (hashState(seen.record.journal) !== hashState(record.journal)) problems.push(`${name}: two copies of ${record.matchId} disagree (${seen.file})`);
  }
  return {games: [...games.values()], problems};
}

/** The exit criteria (M8) over a run's games and findings. */
export function verdict({games, findings, need = 50, problems = []}) {
  const fixedIn = new Set(findings.filter((r) => r.status === "fixed").map((r) => r.game_id));
  const lines = [], fails = [...problems];
  const thrown = games.filter((g) => g.exception), leaked = games.filter((g) => g.leaks.length);
  const differs = games.filter((g) => !g.exception && !g.same), byFix = differs.filter((g) => fixedIn.has(g.matchId));
  if (games.length < need) fails.push(`${games.length} game${games.length === 1 ? "" : "s"}, short of the ${need} the run needs`);
  for (const g of thrown) fails.push(`${g.matchId}: an engine exception, at ${g.exception}`);
  for (const g of leaked) fails.push(`${g.matchId}: ${g.leaks.length} leak${g.leaks.length === 1 ? "" : "s"} (first: turn ${g.leaks[0].turn}, ${g.leaks[0].seatId} was sent ${JSON.stringify(g.leaks[0].name)})`);
  for (const g of differs.filter((x) => !fixedIn.has(x.matchId))) fails.push(`${g.matchId}: replays to a different game, and no fixed finding names it`);
  const ids = new Set(games.map((g) => g.matchId));
  for (const r of findings) {
    for (const owed of findingOwes(r)) fails.push(`${r.id}: ${owed}`);
    if (!ids.has(r.game_id)) fails.push(`${r.id}: names ${r.game_id}, which is not among the run's records, so it can't be replayed`);
  }
  lines.push(`${games.length} games: ${games.filter((g) => g.same).length} replayed to the same journal, ${byFix.length} changed by their fix, ${thrown.length} threw, ${leaked.length} leaked, in ${games.reduce((n, g) => n + g.leakChecks, 0)} checks of every seat's view`);
  lines.push(`${findings.length} findings: ${findings.filter((r) => r.status === "fixed").length} fixed, ${findings.filter((r) => r.status === "as-intended").length} as intended, ${findings.filter((r) => r.status === "open").length} open`);
  return {met: fails.length === 0, lines, fails};
}

/** A run folder triaged: its findings read, its games replayed, the exit criteria judged. */
export async function triage(dir, {cards, need = 50} = {}) {
  const csvs = readdirSync(dir).filter((f) => /playtest.*\.csv$/.test(f));
  const findings = csvs.flatMap((f) => readFindings(readFileSync(path.join(dir, f), "utf8")));
  const {games: records, problems} = readRecords(dir);
  const games = [];
  for (const {record} of records) games.push(await replayRecord(record, {cards}));
  return {csvs, findings, games, ...verdict({games, findings, need, problems})};
}

async function main(argv) {
  const arg = (name) => {const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : undefined;};
  const dir = argv.find((a, i) => !a.startsWith("--") && !(i > 0 && argv[i - 1].startsWith("--")));
  if (!dir || !statSync(dir, {throwIfNoEntry: false})?.isDirectory()) {console.error("usage: node tools/playtest-triage.mjs <run folder> [--games 50] [--json <out.json>]"); return 2;}
  const {tableCards} = await import("../cloud/game-room.mjs");
  const result = await triage(dir, {cards: tableCards, need: Number(arg("games") ?? 50)});
  if (!result.csvs.length && !result.games.length) {console.error(`playtest-triage: ${dir} holds no playtest CSV and no game record`); return 2;}
  for (const g of result.games) console.log(`${g.matchId} (${g.seats.join(", ")}): ${g.decisions} decisions, ${g.exception ? `THREW at ${g.exception}` : g.same ? "replayed to the same journal" : "replays DIFFERENTLY"}, ${g.leaks.length} leaks in ${g.leakChecks} checks`);
  for (const line of result.lines) console.log(`playtest-triage: ${line}`);
  for (const fail of result.fails) console.log(`  not met: ${fail}`);
  console.log(result.met ? "playtest-triage: the exit criteria are met" : `playtest-triage: the exit criteria are not met (${result.fails.length})`);
  if (arg("json")) writeFileSync(arg("json"), JSON.stringify({games: result.games.map(({leaks, ...g}) => ({...g, leaks: leaks.length})), findings: result.findings.map((r) => ({id: r.id, status: r.status, owes: findingOwes(r)})), met: result.met, fails: result.fails}, null, 2) + "\n");
  return result.met ? 0 : 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exit(await main(process.argv.slice(2)));
