/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
/* CH-59: one dated, private, reopenable summary per human seat, using the existing game record identity. */
import assert from "node:assert/strict";
import {memoryStorage} from "../game/engine/storage.mjs";
import {basicCards} from "../game/room/room.mjs";
import {tableOn} from "../game/room/table.mjs";
import {outcomeForSeat} from "../game/room/result-record.mjs";
let checks = 0;
const eq = (a, b, message) => {assert.deepEqual(a, b, message); checks++;};
const ok = (a, message) => {assert.ok(a, message); checks++;};
const now = Date.parse("2026-10-26T18:00:00Z");
const ROB = "rob@example.com", MAYA = "maya@example.com";
const cards = name => name.startsWith("General") ? {types: ["Creature"], supertypes: ["Legendary"], manaCost: "{9}{G}", power: 1, toughness: 1, colorIdentity: ["G"]} : basicCards(name);
const deck = tag => ({name: `${tag}'s deck`, commander: [`General ${tag}`], cards: Array(99).fill("Forest"), bracket: 3, source: {deckId: `deck:${tag}`, deckVersion: 7}});
const random = count => new Uint8Array(count).fill(7);
async function launch(storage, tableId, ai = false) {
  const t = tableOn(storage, {cards, random});
  await t.create({tableId, host: ROB, hostName: "Rob", seats: [{kind: ai ? "ai" : "human", name: "Maya"}]});
  if (!ai) {
    await t.join(MAYA, (await t.invite(ROB, 1, now)).code, now);
    await t.deck(MAYA, 1, deck("maya"), now); await t.ready(MAYA, true, now);
  } else await t.deck(ROB, 1, deck("ai"), now);
  await t.deck(ROB, 0, deck("rob"), now); await t.ready(ROB, true, now); await t.start(ROB, now);
  const matchId = await t.tick(now + 10000);
  ok(matchId, "a real table match launches");
  return {t, matchId};
}
{
  const storage = memoryStorage(), {t, matchId} = await launch(storage, "recordtwo");
  ok((await t.currentRoom()).view("s0").resultRecordExpected, "new room views identify an expected authoritative result before settlement");
  eq((await t.view(ROB)).gameRecord, null, "an unfinished live match has no filed summary");
  await t.endGame(ROB, now + 12000);
  const mine = (await t.view(ROB)).gameRecord, theirs = (await t.view(MAYA)).gameRecord;
  eq([mine.schema, mine.id, mine.matchId, mine.seatId], ["CrankMagicTableResult@1", `game:table:${matchId}:s0`, matchId, "s0"], "the result uses the existing stable match-and-seat identity");
  eq([mine.source, theirs.source], [{deckId: "deck:rob", deckVersion: 7}, {deckId: "deck:maya", deckVersion: 7}], "each human receives only their own deck source");
  eq([mine.playedAt, mine.outcome, mine.finishReason, mine.pod, mine.bracket, mine.seat], [new Date(now + 12000).toISOString(), "unfinished", "ended early", 2, 3, 1], "the table clock and public result supply the dated summary");
  eq(mine.commanders, ["General rob"], "the played commander is retained");
  eq(mine.opponents, [{seatId: "s1", name: "Maya", commanders: ["General maya"], ai: false}], "opponents contain public commander facts, not deck cards");
  ok(!JSON.stringify(mine).includes("deck:maya") && !/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(JSON.stringify(mine)), "no other deck source or account address leaks into the summary");
  const reopened = tableOn(storage, {cards, random});
  eq((await reopened.view(ROB)).gameRecord, mine, "the summary and its original timestamp survive reopening");
  await reopened.tick(now + 13000);
  eq((await reopened.view(ROB)).gameRecord, mine, "another tick does not create or redate a duplicate");
  eq((await reopened.record(ROB, matchId)).gameRecord, mine, "the existing downloadable record includes the same private seat summary");
  ok((await reopened.record(ROB, matchId)).view.resultRecordExpected, "the expected-result flag survives the room reopen and finished view");
  eq((await reopened.view(null, {any: true})).gameRecord, null, "a public table view never receives a private game summary");
  await assert.rejects(() => reopened.view("stranger@example.com"), e => e.status === 403); checks++;
  const raw = JSON.parse(await storage.get("table"));
  eq(Object.keys(raw.gameRecords[matchId]), ["s0", "s1"], "one summary is persisted for each human seat");
}
{
  const storage = memoryStorage(), {t, matchId} = await launch(storage, "recordai", true);
  await t.concede(ROB, now + 15000);
  const mine = (await t.view(ROB)).gameRecord;
  eq([mine.outcome, mine.finishReason, mine.ai], ["loss", "conceded", true], "the finished two-seat AI game records the human's actual outcome");
  eq(Object.keys(JSON.parse(await storage.get("table")).gameRecords[matchId]), ["s0"], "an AI seat is not filed as a human library record");
}
eq(outcomeForSeat({status: "finished", seatId: "s0", result: {winner: "s0", reason: "last player standing", ending: {seats: [{seatId: "s0", outcome: "won"}]}}}).outcome, "win", "a rules win is a win");
eq(outcomeForSeat({status: "finished", seatId: "s0", result: {winner: null, ending: {kind: "draw", seats: []}}}).outcome, "draw", "a rules draw is a draw");
console.log(`table-game-record: ${checks} checks passed`);
