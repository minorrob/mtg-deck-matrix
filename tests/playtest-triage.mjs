/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* THE TRIAGE LOOP'S MACHINE HALF (tools/playtest-triage.mjs; docs/plan-to-100.md M8, Part 7's G-D). A run's records are
 * the ones the board downloads -- a playtest table's full record (game/room/table.mjs `record`) -- so they are made here
 * the same way: a table of Rob, Maya and an AI, played and ended, its record read by each person.
 *
 *   Replayed   every game played again from its seed and tape, every seat's view judged at every answer
 *   Folded     the agents' copies of one game are one game; copies that disagree are said
 *   Refused    a seat's record (no seed, no tape), a record that throws, one that plays a different game
 *   Fixed      a game a fixed finding names may play differently: its fix, not a failure
 *   Findings   a fixed row names its PR, an as-intended one its CR rule and why; rules and card rows adjudicated;
 *              no S1 or S2 open; every row's game among the records
 *   Exit       at least the run's number of games, and all of the above
 */
import assert from "node:assert/strict";
import {mkdtempSync, mkdirSync, writeFileSync, rmSync} from "node:fs";
import {gzipSync} from "node:zlib";
import {tmpdir} from "node:os";
import path from "node:path";
import {randomUUID} from "node:crypto";
import {createRng} from "../game/engine/rng.mjs";
import {randomLegalPilot} from "../game/engine/pilots/random-legal.mjs";
import {memoryStorage} from "../game/engine/storage.mjs";
import {basicCards} from "../game/room/room.mjs";
import {tableOn} from "../game/room/table.mjs";
import {replayTape} from "../game/room/replay.mjs";
import {createMatchStore} from "../game/engine/storage.mjs";
import {COLUMNS, readFindings, findingOwes, replayRecord, readRecords, verdict, triage} from "../tools/playtest-triage.mjs";

let checks = 0;
const ok = (c, m) => {assert.ok(c, m); checks += 1;};
const eq = (a, b, m) => {assert.deepEqual(a, b, m); checks += 1;};

const FOREST = {types: ["Land"], abilities: [{id: "t-g", kind: "mana", tapSelf: true, produces: {G: 1}}]};
const DEFS = new Map();
const def = (name, d) => {DEFS.set(name, d); return name;};
const cards = (name) => DEFS.get(name) ?? basicCards(name);
const deck = (tag) => ({name: `${tag} deck`, commander: [def(`General ${tag}`, {types: ["Creature"], supertypes: ["Legendary"], power: 3, toughness: 3, manaCost: "{2}{G}"})],
  cards: [...Array.from({length: 38}, () => def(`Grove ${tag}`, FOREST)), ...Array.from({length: 61}, (_, i) => def(`Bear ${tag}-${i}`, {types: ["Creature"], power: 2, toughness: 2, manaCost: "{1}{G}"}))]});
const answerer = (seed) => {const p = randomLegalPilot(createRng(seed)); return (d) => {const a = p.answer(d); return {kind: "answer", choiceId: d.id, ...(a.indices ? {indices: a.indices} : {}), ...(a.amounts ? {amounts: a.amounts} : {}), ...(a.value !== undefined ? {value: a.value} : {})};};};

const ROB = "rob@example.com", MAYA = "maya@example.com";
const now = Date.parse("2026-10-11T20:00:00Z");
let seq = 0;
const random = (n) => {seq += 1; return new Uint8Array(n).map((_, i) => (seq * 17 + i * 3) % 256);};

/* A game at a table of Rob, Maya and an AI, played a while and ended by Maya; each person's download of its record. */
async function played(tableId, {playtest = true} = {}) {
  const storage = memoryStorage(), t = tableOn(storage, {cards, random});
  await t.create({tableId, host: ROB, hostName: "Rob", seats: [{kind: "human", name: "Maya"}, {kind: "ai", name: "Bot"}], playtest});
  await t.join(MAYA, (await t.invite(ROB, 1, now)).code, now);
  await t.deck(ROB, 0, deck(`${tableId}r`), now); await t.deck(MAYA, 1, deck(`${tableId}m`), now); await t.deck(ROB, 2, deck(`${tableId}c`), now);
  await t.ready(ROB, true, now); await t.ready(MAYA, true, now);
  await t.start(ROB, now);
  const matchId = await t.tick(now + 10000);
  const room = await t.currentRoom(), people = answerer(tableId);
  for (let i = 0; i < 40 && room.waitingOn; i += 1) {const who = room.waitingOn, v = room.view(who); await room.act(who, {actionId: randomUUID(), revision: v.revision, ...people(v.decision)});}
  await t.endGame(MAYA, now + 20000);
  return {matchId, rob: await t.record(ROB, matchId), maya: await t.record(MAYA, matchId)};
}
const games = [await played("triage01"), await played("triage02"), await played("triage03")];
const csv = (rows) => [COLUMNS.join(","), ...rows.map((r) => COLUMNS.map((c) => /[",]/.test(r[c] ?? "") ? `"${String(r[c]).replace(/"/g, '""')}"` : (r[c] ?? "")).join(","))].join("\n") + "\n";
const row = (over) => ({id: "PT-T-01", game_id: games[0].matchId, seat: "s0", turn: "3", phase: "main", cards: "Bear", happened: "x", should_have: "y", cr_rule: "", evidence: "pt-01.png", severity: "S3", class: "ux", status: "open", outcome: "", ...over});

/* 1. REPLAYED: a record the board downloads plays again to the same journal, every seat's view judged at every answer. */
{
  const r = await replayRecord(games[0].rob, {cards});
  eq([r.same, r.exception, r.leaks, r.matchId], [true, null, [], games[0].matchId], "a playtest table's record replays to the same journal, nothing thrown, nothing leaked");
  eq(r.leakChecks, r.decisions + 1, `every seat's view judged before the first answer and after each (${r.leakChecks} checks)`);
  const told = await replayRecord(games[0].rob, {cards, judge: async () => [{turn: 1, seatId: "s1", name: "Bear x", context: "…"}]});
  eq([told.exception, told.leaks.length, told.leakChecks], [null, r.leakChecks, r.leakChecks], "and what the oracle finds is kept: one leak told at each look, every one counted");
  eq(r.seats, ["person", "person", "house normal"], "and the seats say who played them: two people and the house pilot at its table setting (Normal)");
}

/* 2. REFUSED: a tape tampered with, a game it no longer plays, a seat's record with nothing to replay. */
{
  const rec = structuredClone(games[1].rob);
  const at = rec.tape.findIndex((e, i) => i >= 3 && e.kind === "answer");
  rec.tape[at] = {...rec.tape[at], seat: rec.tape[at].seat === "s0" ? "s1" : "s0"};
  const r = await replayRecord(rec, {cards});
  ok(r.exception && r.exception.startsWith(`tape entry ${at + 1} of`) && !r.same, `a tape that stops fitting the game throws, and says where (${r.exception})`);
  const other = structuredClone(games[1].rob);
  other.journal = other.journal.slice(0, -1);
  eq((await replayRecord(other, {cards})).same, false, "a record whose journal is not the game's own replays to a different journal");
  /* Cut short where it is still true to itself -- its tape and journal both stopping at the same answer -- a game is
     no finished game, and a record is of one. */
  const cut = structuredClone(games[1].rob), keep = Math.floor(cut.tape.length / 2), storage = memoryStorage();
  cut.tape = cut.tape.slice(0, keep);
  await replayTape({matchId: cut.matchId, pod: cut.pod, seed: cut.seed, tape: cut.tape, cards, storage});
  cut.journal = await createMatchStore(storage, cut.matchId).readJournal();
  eq((await replayRecord(cut, {cards})).same, false, "a record cut short, true to its cut, is not a finished game's");
}

/* 3. FOLDED: four agents' copies of one game are one game, and copies that disagree are said. */
const dir = mkdtempSync(path.join(tmpdir(), "triage-"));
try {
  mkdirSync(path.join(dir, "records"));
  const put = (name, rec) => writeFileSync(path.join(dir, "records", name), JSON.stringify(rec));
  put("g1-rob.json", games[0].rob); put("g1-maya.json", games[0].maya); put("g2-rob.json", games[1].rob);
  writeFileSync(path.join(dir, "records", "g3-rob.json.gz"), gzipSync(JSON.stringify(games[2].rob)));
  writeFileSync(path.join(dir, "notes.json"), JSON.stringify({not: "a record"}));
  const {games: read, problems} = readRecords(dir);
  eq([read.length, problems], [3, []], "four records, three games: the two copies of one game are one, a gzipped record is read, a JSON that is no record is passed over");
  const bad = structuredClone(games[0].maya); bad.journal = bad.journal.slice(1);
  put("g1-maya.json", bad);
  ok(readRecords(dir).problems.some((p) => /two copies of .* disagree/.test(p)), "two copies of one game that disagree: said so");
  put("g1-maya.json", games[0].maya);
  const seat = (await played("triage04", {playtest: false})).rob;
  put("g4-seat.json", seat);
  ok(readRecords(dir).problems.some((p) => /g4-seat\.json: a seat's record, not a playtest table's/.test(p)), "a seat's record from a table that is not a playtest table: said so, as nothing to replay");
  rmSync(path.join(dir, "records", "g4-seat.json"));

  /* 4. FINDINGS: answered, adjudicated, nothing grave left open. */
  eq(findingOwes(row({status: "fixed", outcome: "PR #705, tests/engine-x.mjs"})), [], "a fixed row naming its PR owes nothing");
  ok(findingOwes(row({status: "fixed", outcome: "fixed it"})).some((o) => /names no PR/.test(o)), "a fixed row naming no PR owes it");
  ok(findingOwes(row({status: "as-intended", outcome: "the rule says so"})).some((o) => /without a CR citation/.test(o)), "ruled as intended without a CR citation: owed");
  ok(findingOwes(row({status: "as-intended", cr_rule: "CR 510.1a"})).some((o) => /without saying why/.test(o)), "or without saying why: owed");
  ok(findingOwes(row({class: "rules"})).some((o) => /rules finding not yet adjudicated/.test(o)), "an open rules finding: not adjudicated");
  ok(findingOwes(row({class: "card"})).some((o) => /card finding not yet adjudicated/.test(o)), "an open card finding: not adjudicated");
  ok(findingOwes(row({class: "ui", severity: "S2"})).some((o) => /S2 and open/.test(o)), "an open S2 UI finding: owed");
  ok(findingOwes(row({class: "performance", severity: "S1"})).some((o) => /S1 and open/.test(o)), "an open S1 in any class: owed");
  eq(findingOwes(row({class: "ux", severity: "S3"})), [], "an open S3 UX note owes nothing to the exit");
  eq(readFindings(csv([row({happened: 'said "Bears", then 2'})]))[0].happened, 'said "Bears", then 2', "a finding's quotes and commas survive the CSV");

  /* 5. EXIT: the run's number of games, every game clean, every finding answered. */
  writeFileSync(path.join(dir, "playtest-findings.csv"), csv([
    row({id: "PT-T-01", class: "rules", severity: "S2", status: "as-intended", cr_rule: "CR 510.1a", outcome: "combat damage is dealt at once (CR 510.2)"}),
    row({id: "PT-T-02", game_id: games[1].matchId, class: "ui", severity: "S3", status: "fixed", outcome: "PR #705"}),
    row({id: "PT-T-03", game_id: games[2].matchId}),
  ]));
  const run = await triage(dir, {cards, need: 3});
  eq([run.met, run.fails], [true, []], "three clean games and three answered findings: the exit criteria are met at a run of three");
  ok(run.lines[0].startsWith("3 games: 3 replayed to the same journal, 0 changed by their fix, 0 threw, 0 leaked"), `the games said in one line (${run.lines[0]})`);
  eq(run.lines[1], "3 findings: 1 fixed, 1 as intended, 1 open", "and the findings in another");
  ok((await triage(dir, {cards})).fails.some((f) => /3 games, short of the 50/.test(f)), "the same run against the proposed 50: short, and said by how much");

  /* A game its fix changed, and one nothing explains. */
  const changed = structuredClone(games[1].rob); changed.journal = changed.journal.slice(0, -1);
  put("g2-rob.json", changed);
  const fixed = await triage(dir, {cards, need: 3});
  ok(fixed.met && /1 changed by their fix/.test(fixed.lines[0]), "a game a fixed finding names, replaying differently: its fix, said, not a failure");
  writeFileSync(path.join(dir, "playtest-findings.csv"), csv([row({id: "PT-T-01", class: "ux", status: "open"})]));
  ok((await triage(dir, {cards, need: 3})).fails.some((f) => f === `${games[1].matchId}: replays to a different game, and no fixed finding names it`), "and with no fixed finding naming it: a failure");
  put("g2-rob.json", games[1].rob);

  /* Findings the exit can't pass. */
  writeFileSync(path.join(dir, "playtest-findings.csv"), csv([row({id: "PT-T-04", class: "rules"}), row({id: "PT-T-05", game_id: "elsewhere01g1"})]));
  const owed = await triage(dir, {cards, need: 3});
  ok(!owed.met && owed.fails.some((f) => /^PT-T-04: a rules finding not yet adjudicated/.test(f)), "an open rules finding keeps the run from its exit");
  ok(owed.fails.some((f) => /^PT-T-05: names elsewhere01g1, which is not among the run's records/.test(f)), "and a finding naming a game the run has no record of: said, as it can't be replayed");
  const thrown = verdict({games: [{matchId: "x01g1", exception: "tape entry 2 of 9: no", same: false, leaks: [], leakChecks: 2}], findings: [], need: 1});
  ok(thrown.fails.some((f) => /x01g1: an engine exception, at tape entry 2 of 9/.test(f)), "a game that throws keeps the run from its exit");
  const leaked = verdict({games: [{matchId: "x02g1", exception: null, same: true, leaks: [{turn: 4, seatId: "s1", name: "Bear x"}], leakChecks: 9}], findings: [], need: 1});
  ok(leaked.fails.some((f) => /x02g1: 1 leak \(first: turn 4, s1 was sent "Bear x"\)/.test(f)), "and so does a game that sent a seat a card it may not know");
} finally {
  rmSync(dir, {recursive: true, force: true});
}

console.log(`playtest-triage: ${checks} checks passed — a run's records replayed from their seeds and tapes with every seat's view judged at every answer, the agents' copies folded, and the exit criteria judged: the games, the leaks, the replays, and every finding answered.`);
