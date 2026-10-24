/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* HOW A GAME ENDED, AS DATA (`result.ending`; Linear ROB-166, the Requests table's row 10, asked by Codex · Play;
 * game/room/ending.mjs, game/room/room.mjs `outs`, docs/ui-lane/gameplay-anchor.md).
 *
 * A person knocked out by three AI seats and a person who walked away read the same in `result` -- "every person had left
 * the game, so it ended there" -- and the board called both "The game was ended early". `ending` tells them apart:
 *
 *   1. From the facts alone (`endingOf`): every kind -- won, draw, eliminated, conceded, timed-out, ended -- and every
 *      outcome a seat has; a loss by the rules kept as one when the seat leaves afterward; the last person out read from
 *      the order the seats went out, an AI seat out after them passed over, and seat order in a room that kept none.
 *   2. One person and three AI seats, the person knocked out by damage: "eliminated", their seat, "life" -- in every seat's
 *      view, in a woken room and in the replay.
 *   3. The same from an empty library (CR 704.5b): "eliminated", "empty-library".
 *   4. The person concedes: "conceded".
 *   5. Two people, one conceding and then the other running out of time: "timed-out", the second's seat -- the order kept
 *      with the room, so a woken room says the same.
 *   6. At the table, two people drop and their five minutes run out, the second's last: "timed-out", in the finished
 *      game's record too. (A person alone with AI seats has no clock: their game waits for them, ROB-170.)
 *   7. At the table, the host ends the game: "ended", by the host, every seat still playing; in the record too.
 *   8. One person and one AI seat, the person decked: the rules end it, "won", the AI seat; the person's own loss in `seats`.
 * And through all of it `winner`, `reason` and `endedBy` are what they were.
 */
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {memoryStorage} from "../game/engine/storage.mjs";
import {startRoom, openRoom, basicCards, NO_PERSON_REASON, RoomError} from "../game/room/room.mjs";
import {endingOf, ENDING_KINDS, SEAT_OUTCOMES} from "../game/room/ending.mjs";
import {replayMatch} from "../game/room/replay.mjs";
import {tableOn, AWAY_LIMIT} from "../game/room/table.mjs";
import {person as fuzzPerson} from "../tools/fuzz-live.mjs";

let checks = 0;
const ok = (c, m) => {assert.ok(c, m); checks += 1;};
const eq = (a, b, m) => {assert.deepEqual(a, b, m); checks += 1;};
const kinds = new Set(), outcomes = new Set();
const saw = (ending) => {kinds.add(ending.kind); for (const s of ending.seats) outcomes.add(s.outcome); return ending;};

/* ---- 1. FROM THE FACTS ALONE ---- */
{
  const SEATS = [{seatId: "s0", pilot: "human"}, {seatId: "s1", pilot: "house"}, {seatId: "s2", pilot: "house"}, {seatId: "s3", pilot: "house"}];
  const TWO = [{seatId: "s0", pilot: "human"}, {seatId: "s1", pilot: "human"}, {seatId: "s2", pilot: "house"}, {seatId: "s3", pilot: "house"}];
  const IN = {lost: false}, out = (lostTo) => ({lost: true, lostTo});
  const seat = (seatId, outcome, reason = null) => ({seatId, outcome, reason});
  const NOBODY = {by: null, why: "no-person"}, NO_ONE = {winner: null, reason: NO_PERSON_REASON};

  eq(saw(endingOf({over: {winner: 2, reason: "last player standing"}, seats: SEATS, players: [out("life"), out("poison"), IN, out("commander-damage")]})),
    {kind: "won", seatId: "s2", reason: null, seats: [seat("s0", "lost", "life"), seat("s1", "lost", "poison"), seat("s2", "won"), seat("s3", "lost", "commander-damage")]},
    "1. the rules end it with a winner: won, by the winner's seat; every other seat lost, each for its own reason");
  eq(saw(endingOf({over: {winner: null, reason: "all players lost"}, seats: SEATS, players: [out("conceded"), out("life"), out("life"), out("effect")], departures: {s0: "conceded"}})),
    {kind: "draw", seatId: null, reason: null, seats: [seat("s0", "conceded", "conceded"), seat("s1", "lost", "life"), seat("s2", "lost", "life"), seat("s3", "lost", "effect")]},
    "every player still in it loses at once: a draw, nobody's (CR 104.4a)");
  eq(saw(endingOf({over: NO_ONE, ended: NOBODY, seats: SEATS, players: [out("empty-library"), IN, IN, IN], outs: ["s0"]})),
    {kind: "eliminated", seatId: "s0", reason: "empty-library", seats: [seat("s0", "lost", "empty-library"), seat("s1", "playing"), seat("s2", "playing"), seat("s3", "playing")]},
    "the only person loses by the rules with AI seats still in: eliminated, their seat and their reason; the AI seats still playing");
  eq(saw(endingOf({over: NO_ONE, ended: NOBODY, seats: TWO, players: [out("life"), out("conceded"), IN, out("poison")], departures: {s1: "conceded"}, outs: ["s1", "s0", "s3"]})),
    {kind: "eliminated", seatId: "s0", reason: "life", seats: [seat("s0", "lost", "life"), seat("s1", "conceded", "conceded"), seat("s2", "playing"), seat("s3", "lost", "poison")]},
    "two people: the last of them out is the one it turns on -- an AI seat out after them, in the same check, is passed over");
  eq(saw(endingOf({over: NO_ONE, ended: NOBODY, seats: TWO, players: [out("conceded"), out("conceded"), IN, IN], departures: {s1: "timed-out", s0: "conceded"}, outs: ["s0", "s1"]})),
    {kind: "timed-out", seatId: "s1", reason: "conceded", seats: [seat("s0", "conceded", "conceded"), seat("s1", "timed-out", "conceded"), seat("s2", "playing"), seat("s3", "playing")]},
    "the last person out ran out of time: timed-out, which the engine knows as a concession (CR 104.3a)");
  eq(saw(endingOf({over: NO_ONE, ended: NOBODY, seats: TWO, players: [out("life"), out("conceded"), IN, IN], departures: {s1: "conceded"}})),
    {kind: "conceded", seatId: "s1", reason: "conceded", seats: [seat("s0", "lost", "life"), seat("s1", "conceded", "conceded"), seat("s2", "playing"), seat("s3", "playing")]},
    "a room that kept no order (ended before it did): the last person in seat order");
  eq(saw(endingOf({over: {winner: null, reason: "ended early"}, ended: {by: "s1"}, seats: SEATS, players: [out("conceded"), IN, out("life"), IN], departures: {s0: "timed-out"}, outs: ["s2", "s0"]})),
    {kind: "ended", seatId: "s1", reason: null, seats: [seat("s0", "timed-out", "conceded"), seat("s1", "playing"), seat("s2", "lost", "life"), seat("s3", "playing")]},
    "a person ends it for everyone: ended, by them; whoever had gone already says how, and the rest were still playing");
  eq(endingOf({over: {winner: null, reason: "ended early"}, ended: {by: "s1"}, seats: TWO, players: [out("commander-damage"), IN, IN, IN], departures: {s0: "conceded"}}).seats[0],
    seat("s0", "lost", "commander-damage"), "a person who lost by the rules and left the table afterward lost by the rules, as the engine has it");
  eq(endingOf({over: {winner: null, reason: "ended early"}, ended: {by: "s0"}, seats: TWO, players: [IN, IN, IN, IN], departures: {s1: "conceded"}}).seats[1],
    seat("s1", "conceded", "conceded"), "a person who left before the first turn, the game ended before the engine conceded them: conceded all the same");
}

/* ---- THE ROOMS ---- */
const BEAR = {types: ["Creature"], power: 2, toughness: 2, manaCost: "{1}{G}", colors: ["G"]};
const GENERAL = {types: ["Creature"], supertypes: ["Legendary"], power: 3, toughness: 3, manaCost: "{2}{G}", colors: ["G"]};
const cards = (name) => (/^Bear /.test(name) ? BEAR : name.startsWith("General") ? GENERAL : basicCards(name));
const deck = (tag, n = 99) => ({name: `${tag} deck`, commander: [`General ${tag}`], cards: Array.from({length: n}, (_, i) => (i % 5 < 2 ? "Forest" : `Bear ${tag}-${i}`))});
/* As the table launches a game (game/room/table.mjs): the game ends once every person is out. */
const TABLE = {passEmpty: true, endWhenNoPerson: true, resolveAll: true, passAfterCast: true, endAsks: true, untapMana: true, pooledTaps: true, yieldTurn: true, pilotPicks: true};
const human = (i, tag, n) => ({seatId: `s${i}`, name: ["Rob", "Maya"][i] ?? `Person ${i}`, pilot: "human", ...deck(tag, n)});
const ai = (i, tag) => ({seatId: `s${i}`, name: `Bot ${i}`, pilot: "house", ...deck(tag)});
const solo = (tag, n, more = {}) => ({...TABLE, ...more, seats: [human(0, `${tag}0`, n), ai(1, `${tag}1`), ai(2, `${tag}2`), ai(3, `${tag}3`)]});

/* A person's answers: tools/fuzz-live.mjs's person, an answer the rules refuse given again. */
async function answer(room, people) {
  const who = room.waitingOn, v = room.view(who);
  for (let tries = 1; ; tries += 1) {
    try {await room.act(who, {actionId: randomUUID(), revision: v.revision, ...people[who](v.decision, v.state.turn, v)}); return;}
    catch (error) {if (!(error instanceof RoomError) || error.status !== 422 || tries >= 50) throw error;}
  }
}
async function playOut(room, people, limit = 20000) {
  for (let n = 0; n < limit && room.waitingOn && room.status !== "finished"; n += 1) await answer(room, people);
}
/* Keep, play a land, otherwise pass: a person who plays on and attacks nobody. */
async function keepAndPass(room) {
  for (let n = 0; n < 2000 && room.waitingOn && room.status !== "finished"; n += 1) {
    const v = room.view(room.waitingOn), d = v.decision;
    const pick = d.kind === "priority" ? (d.options.find((o) => o.act === "play-land") ?? d.options.find((o) => o.act === "pass")) : null;
    await room.act(v.seatId, {actionId: randomUUID(), revision: v.revision, kind: "answer", choiceId: d.id, indices: pick ? [pick.index] : d.mode === "many" ? d.options.slice(0, d.min).map((o) => o.index) : [0]});
  }
}
/* What each seat's end is, read off the view's own players (projection.mjs, `health`), for a game ended once every person was out. */
const fromView = (v, departures = {}) => v.state.players.map((p, i) => {
  const seatId = v.seats[i].seatId;
  if (departures[seatId]) return {seatId, outcome: departures[seatId], reason: "conceded"};
  return p.health.status === "lost" ? {seatId, outcome: "lost", reason: p.health.lossReason} : {seatId, outcome: "playing", reason: null};
});
const record = async (storage, matchId) => JSON.parse(await storage.get(`room/${matchId}`));

/* ---- 2. ONE PERSON, THREE AI SEATS: KNOCKED OUT BY DAMAGE ---- */
{
  let knocked = null;
  const seen = [];
  for (let n = 0; n < 12 && !knocked; n += 1) {
    const storage = memoryStorage(), matchId = `ending-ko${n}`;
    const room = await startRoom({storage, matchId, cards, pod: solo(`ko${n}-`, 99, {startingLife: 4}), seed: `ending-ko-${n}`});
    await playOut(room, {s0: fuzzPerson(`ending-ko-person-${n}`)});
    const v = room.view("s0");
    seen.push(`${matchId}: ${v.result?.ending?.kind}`);
    if (v.result?.ending?.kind === "eliminated") knocked = {storage, matchId, room, v};
  }
  ok(knocked, `among a dozen short games of one person against three AI seats, the person is knocked out with AI seats still in (${seen.join("; ")})`);
  const {storage, matchId, room, v} = knocked;
  const {ending, ...words} = v.result;
  eq(words, {winner: null, reason: NO_PERSON_REASON, endedBy: null}, "2. the person knocked out: winner, reason and endedBy are what they were");
  eq(saw(ending), {kind: "eliminated", seatId: "s0", reason: "life", seats: fromView(v)},
    "and `ending` says they lost, and why: eliminated, Rob's seat, life -- the AI seats still in it playing");
  ok(ending.seats.filter((s) => s.outcome === "playing").length >= 2, `with AI seats still playing (${ending.seats.map((s) => `${s.seatId} ${s.outcome}`).join(", ")})`);
  eq(["s1", "s2", "s3"].map((s) => room.view(s).result), [1, 2, 3].map(() => v.result), "every seat is told the same: nothing in it is any one seat's");
  eq((await record(storage, matchId)).outs.at(-1), "s0", "the order the seats went out is kept with the room, the person last");
  eq((await openRoom({storage, matchId, cards})).view("s0").result, v.result, "a woken room says the same");
  const replay = await replayMatch({storage, matchId, cards});
  ok(replay.same, "the game replays as it was played");
  console.log(`  example, one person and three AI seats, knocked out: ${JSON.stringify(v.result)}`);
}

/* ---- 3. ONE PERSON, THREE AI SEATS: AN EMPTY LIBRARY ---- */
{
  const storage = memoryStorage();
  const room = await startRoom({storage, matchId: "ending-empty", cards, pod: solo("em", 7), seed: "ending-empty"});
  await keepAndPass(room);
  const v = room.view("s0");
  eq([v.status, v.result.winner, v.result.reason, v.result.endedBy], ["finished", null, NO_PERSON_REASON, null], "3. the person draws from an empty library, three AI seats still in: the game ends there, its words as before");
  eq(saw(v.result.ending), {kind: "eliminated", seatId: "s0", reason: "empty-library", seats: fromView(v)}, "eliminated, Rob's seat, empty-library (CR 704.5b)");
}

/* ---- 4. THE PERSON CONCEDES ---- */
{
  const storage = memoryStorage();
  await startRoom({storage, matchId: "ending-conceded", cards, pod: solo("co", 99), seed: "ending-conceded"});
  const room = await openRoom({storage, matchId: "ending-conceded", cards});
  await room.leave("s0", "conceded");
  const v = room.view("s0");
  eq([v.status, v.departures], ["finished", {s0: "conceded"}], "4. the only person concedes: the game ends there");
  eq(v.result, {winner: null, reason: NO_PERSON_REASON, endedBy: null, ending: saw({kind: "conceded", seatId: "s0", reason: "conceded",
    seats: [{seatId: "s0", outcome: "conceded", reason: "conceded"}, ...["s1", "s2", "s3"].map((seatId) => ({seatId, outcome: "playing", reason: null}))]})},
  "conceded, not eliminated: they left, and the AI seats were still playing");
}

/* ---- 5. TWO PEOPLE: ONE CONCEDES, THEN THE OTHER RUNS OUT OF TIME ---- */
{
  const storage = memoryStorage(), matchId = "ending-two";
  const room = await startRoom({storage, matchId, cards, pod: {...TABLE, seats: [human(0, "tw0"), human(1, "tw1"), ai(2, "tw2"), ai(3, "tw3")]}, seed: "ending-two"});
  const people = {s0: fuzzPerson("two-rob"), s1: fuzzPerson("two-maya")};
  for (let n = 0; n < 30 && room.waitingOn; n += 1) await answer(room, people);
  await room.leave("s1", "conceded");
  for (let n = 0; n < 30 && room.waitingOn && room.status !== "finished"; n += 1) await answer(room, people);
  ok(room.status === "playing", "5. Maya concedes and Rob plays on");
  await room.leave("s0", "timed-out");
  const v = room.view("s1");
  eq([v.status, v.departures, v.result.winner, v.result.reason, v.result.endedBy], ["finished", {s1: "conceded", s0: "timed-out"}, null, NO_PERSON_REASON, null],
    "then Rob's time runs out: every person is out, and the game ends there, its words as before");
  eq(saw(v.result.ending), {kind: "timed-out", seatId: "s0", reason: "conceded", seats: fromView(v, v.departures)},
    "timed-out, on Rob's seat -- the last person out, though Maya sits after him -- and Maya conceded");
  eq((await openRoom({storage, matchId, cards})).view("s0").result, v.result, "a woken room keeps the order they went out in, and says the same");
}

/* ---- 6 AND 7. AT THE TABLE, AND IN THE RECORD ---- */
const ROB = "rob@example.com";
const now = Date.parse("2026-10-20T20:00:00Z");
let seq = 0;
const random = (n) => {seq += 1; return new Uint8Array(n).map((_, i) => (seq * 11 + i * 7) % 256);};
async function soloTable(tag) {
  const storage = memoryStorage(), t = tableOn(storage, {cards, random});
  await t.create({tableId: `ending${tag}`, host: ROB, hostName: "Rob", seats: [1, 2, 3].map((i) => ({kind: "ai", name: `Bot ${i}`}))});
  for (const s of [0, 1, 2, 3]) await t.deck(ROB, s, deck(`${tag}${s}`), now);
  await t.ready(ROB, true, now);
  await t.start(ROB, now);
  const matchId = await t.tick(now + 10000);
  return {t, matchId};
}
{
  /* Rob, Maya and two AI seats: Maya drops, then Rob a minute later, each on the clock while the other is at the table. */
  const MAYA = "maya@example.com", storage = memoryStorage(), t = tableOn(storage, {cards, random});
  await t.create({tableId: "endingaway", host: ROB, hostName: "Rob", seats: [{kind: "human", name: "Maya"}, {kind: "ai", name: "Bot 2"}, {kind: "ai", name: "Bot 3"}]});
  await t.join(MAYA, (await t.invite(ROB, 1, now)).code, now);
  await t.deck(ROB, 0, deck("away0"), now); await t.deck(MAYA, 1, deck("away1"), now); await t.deck(ROB, 2, deck("away2"), now); await t.deck(ROB, 3, deck("away3"), now);
  await t.ready(ROB, true, now); await t.ready(MAYA, true, now);
  await t.start(ROB, now);
  const matchId = await t.tick(now + 10000);
  await t.dropped(1, now + 20000);
  await t.dropped(0, now + 80000);
  await t.tick(now + 20000 + AWAY_LIMIT);
  eq((await t.view(ROB)).phase, "playing", "6. Maya's five minutes run out first: she is conceded, and Rob's own clock still runs");
  await t.tick(now + 80000 + AWAY_LIMIT);
  eq((await t.view(ROB)).phase, "rematch", "then Rob's: he is conceded, every person is out, and the table moves on");
  const rec = await t.record(ROB, matchId);
  eq([rec.result.winner, rec.result.reason, rec.result.endedBy, rec.departures], [null, NO_PERSON_REASON, null, {s1: "timed-out", s0: "timed-out"}], "the finished game's record has its words as before");
  eq(saw(rec.result.ending), {kind: "timed-out", seatId: "s0", reason: "conceded", seats: [{seatId: "s0", outcome: "timed-out", reason: "conceded"}, {seatId: "s1", outcome: "timed-out", reason: "conceded"},
    ...["s2", "s3"].map((seatId) => ({seatId, outcome: "playing", reason: null}))]},
    "and `ending`: timed out, the last person out's seat, not eliminated and not conceded by choice");
}
{
  const {t, matchId} = await soloTable("end");
  await t.endGame(ROB, now + 20000);
  const rec = await t.record(ROB, matchId);
  eq(rec.result, {winner: null, reason: "ended early", endedBy: "s0", ending: saw({kind: "ended", seatId: "s0", reason: null,
    seats: ["s0", "s1", "s2", "s3"].map((seatId) => ({seatId, outcome: "playing", reason: null}))})},
  "7. the host ends the game: ended, by the host, every seat still playing -- in the record, beside the words as before");
}

/* ---- 8. ONE PERSON, ONE AI SEAT: THE RULES END IT ---- */
{
  const room = await startRoom({storage: memoryStorage(), matchId: "ending-won", cards, pod: {...TABLE, seats: [human(0, "wo0", 7), ai(1, "wo1")]}, seed: "ending-won"});
  await keepAndPass(room);
  const v = room.view("s0");
  eq([v.result.winner, v.result.reason, "endedBy" in v.result], ["s1", "last player standing", false], "8. one person and one AI seat, the person decked: the AI seat is the last player standing, the words as before");
  eq(saw(v.result.ending), {kind: "won", seatId: "s1", reason: null, seats: [{seatId: "s0", outcome: "lost", reason: "empty-library"}, {seatId: "s1", outcome: "won", reason: null}]},
    "won, by the AI seat -- and the person's own loss, and why, in `seats`");
}

eq([...kinds].sort(), [...ENDING_KINDS].sort(), "every kind of ending is made and checked here, and no other");
eq([...outcomes].sort(), [...SEAT_OUTCOMES].sort(), "and every outcome a seat has");

console.log(`room-ending: ${checks} checks passed — how a game ended, as data: won, draw, eliminated, conceded, timed-out and ended, every seat's outcome and the engine's reason; one person knocked out by three AI seats is eliminated, not "every person left"; the last person out read from the order kept with the room; in the table's record too, the words as before.`);
