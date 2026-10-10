/* AN AI SEAT'S SETTING, FROM THE NEW TABLE TO THE PILOT (AI-2, Rob, 2026-10-10: "I agree with your recommendations").
 *
 * The host chooses each AI seat's setting, Normal or Easy (crankmagic-table.js); the table keeps it with the seat and
 * launches the game with it (game/room/table.mjs); the room keeps it with the match and makes each AI seat's pilot from
 * it (game/room/room.mjs `seatPilot`): L1 at that setting (game/engine/pilots/scored-pilot.mjs), handed its own deck list
 * and the match's seed, and L0 for a seat without one -- every match launched before settings were -- so those replay as
 * they were played. This suite holds that path, and that a game of L1 seats, easy among them, replays from its seed and
 * tape and plays the same when its room is reopened mid-game: the room tapes no AI answer, so the pilot must answer the
 * same question the same way every time it is asked.
 */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {memoryStorage} from "../game/engine/storage.mjs";
import {startRoom, seatPilot} from "../game/room/room.mjs";
import {tableOn} from "../game/room/table.mjs";
import {HOUSE_PILOT_ID} from "../game/engine/pilots/house-pilot.mjs";
import {SCORED_PILOT_ID} from "../game/engine/pilots/scored-pilot.mjs";
import {decksFromBackup, playGame, verdict} from "../tools/fuzz-live.mjs";
import {tableCards} from "../cloud/game-room.mjs";

let checks = 0;
const ok = (c, m) => {assert.ok(c, m); checks += 1;};
const eq = (a, b, m) => {assert.deepEqual(a, b, m); checks += 1;};

/* ---- The pilot a seat gets ---- */
{
  const easy = seatPilot({seat: 1, cards: () => null, deck: ["Forest"], level: "easy", seed: "s"});
  const normal = seatPilot({seat: 1, cards: () => null, level: "normal"});
  const none = seatPilot({seat: 1, cards: () => null});
  eq([[easy.id, easy.setting], [normal.id, normal.setting], none.id], [[SCORED_PILOT_ID, "easy"], [SCORED_PILOT_ID, "normal"], HOUSE_PILOT_ID],
    "a setting makes L1 at it; none, L0");
}

/* ---- The room keeps the setting with the seat, and hands the pilot its deck and the seed ---- */
{
  const given = [];
  const spy = (args) => {given.push(args); return seatPilot(args);};
  const deck = (n) => Array.from({length: 40}, () => n);
  const room = await startRoom({storage: memoryStorage(), matchId: "levels", seed: "levels-seed", pilot: spy, pod: {seats: [
    {seatId: "rob", name: "Rob", pilot: "human", level: "easy", commander: [], cards: deck("Forest")},
    {seatId: "easy", name: "Easy", pilot: "house", level: "easy", commander: [], cards: deck("Island")},
    {seatId: "odd", name: "Odd", pilot: "house", level: "hard", commander: [], cards: deck("Swamp")},
    {seatId: "old", name: "Old", pilot: "house", commander: [], cards: deck("Plains")}]}});
  eq(room.seats.map((s) => [s.seatId, s.level ?? null]), [["rob", null], ["easy", "easy"], ["odd", null], ["old", null]],
    "a house seat keeps easy; a person's seat has no setting, and one the room does not know is none");
  const made = Object.fromEntries(given.map((g) => [g.seat, g]));
  eq([made[1].level, made[1].deck.length, made[1].deck[0], made[1].seed], ["easy", 40, "Island", "levels-seed"], "the easy seat's pilot is made with its setting, its own deck list and the match's seed");
  eq([made[2].level, made[3].level, made[0]], [null, null, undefined], "the others' with none, and no pilot is made for the person");
}

/* ---- The table: the host's choice, kept, shown and launched ---- */
{
  const cards = (name) => (name === "Forest" ? {types: ["Land"], abilities: [{id: "t-g", kind: "mana", tapSelf: true, produces: {G: 1}}]}
    : /^Bear/.test(name) ? {types: ["Creature"], power: 2, toughness: 2, manaCost: "{1}{G}"}
    : /^General/.test(name) ? {types: ["Creature"], supertypes: ["Legendary"], power: 3, toughness: 3, manaCost: "{2}{G}"} : null);
  const deckFor = (tag) => ({name: `${tag} deck`, commander: [`General ${tag}`], cards: [...Array(38).fill("Forest"), ...Array.from({length: 61}, (_, i) => `Bear ${tag}-${i}`)]});
  let seq = 0;
  const random = (n) => {seq += 1; return new Uint8Array(n).map((_, i) => (seq * 31 + i * 7) % 256);};
  const t = tableOn(memoryStorage(), {cards, random});
  const ROB = "rob@example.com", now = Date.parse("2026-10-10T20:00:00Z");
  const made = await t.create({tableId: "tablelevels", host: ROB, hostName: "Rob", seats: [{kind: "ai", name: "Easy", level: "easy"}, {kind: "ai", name: "Plain"}, {kind: "ai", name: "Odd", level: "hard"}]});
  eq(made.seats.map((s) => [s.kind, s.level ?? null]), [["human", null], ["ai", "easy"], ["ai", "normal"], ["ai", "normal"]],
    "the table keeps the host's Easy, and an AI seat without a setting, or with one it does not know, is Normal");
  for (const seat of [0, 1, 2, 3]) await t.deck(ROB, seat, deckFor(`t${seat}`), now);
  await t.ready(ROB, true, now);
  await t.start(ROB, now);
  await t.tick(now + 10000);
  const room = await t.currentRoom();
  eq(room.seats.map((s) => s.level ?? null), [null, "easy", "normal", "normal"], "and launches the game with each AI seat at its setting");
}

/* ---- A game of L1 seats replays, and plays the same reopened mid-game ---- */
{
  const backup = JSON.parse(readFileSync(new URL("../data/live-state.json", import.meta.url), "utf8"));
  const decks = decksFromBackup(backup, ["D6 Krenko Goblins", "D5 Shadrix Aristocrats", "D2 Chulane Value Loop", "D4 Felothar Walls"]);
  const levels = [null, "easy", "normal", "easy"];
  const game = await playGame({decks, seed: 7, cards: tableCards, humans: [0], levels, replay: true});
  ok(game.status === "finished" && verdict(game).clean, `a game of a person and three L1 seats, two at easy, to its end (${game.turns} turns), no answer refused: ${verdict(game).problems.join("; ") || "clean"}`);
  ok(game.replay.same && game.replay.tape > 0, `replayed from its seed and the person's ${game.replay.tape} answers: the same game`);
  const reopened = await playGame({decks, seed: 7, cards: tableCards, humans: [0], levels, reopenEvery: 5});
  eq([reopened.reopened > 0, reopened.result, reopened.turns, reopened.decisions], [true, game.result, game.turns, game.decisions],
    `and reopened every five of the person's answers (${reopened.reopened} times), the same game to the same end`);
}

/* ---- The bench (tools/pilot-bench.mjs) plays and counts ---- */
{
  const {benchGame, summarize, DECKS, PAIRS} = await import("../tools/pilot-bench.mjs");
  const backup = JSON.parse(readFileSync(new URL("../data/live-state.json", import.meta.url), "utf8"));
  const decksByName = new Map(decksFromBackup(backup, DECKS).map((d) => [d.name, d]));
  const rows = [await benchGame({n: 1, decksByName, cards: tableCards}), await benchGame({n: 22, decksByName, cards: tableCards})];
  eq([PAIRS.length, rows[0].decks, rows[1].decks, rows.map((r) => r.l1Seat)], [21, PAIRS[0], PAIRS[0], [1, 0]], "game n plays the nth of the 21 pairs, and the pair's next round gives L1 the other seat");
  ok(rows.every((r) => ["l1", "l0", "neither"].includes(r.outcome) && r.times.length > 0 && r.refused === 0), "each game is won by one or neither, every L1 decision timed, no answer refused");
  const fake = (outcome) => ({outcome, times: [1, 2], refused: 0, counts: {l1: {passedWithSpell: 0, needlessChump: 1}, l0: {passedWithSpell: 2, needlessChump: 0}}});
  const s = summarize([fake("l1"), fake("l1"), fake("l1"), fake("l0"), fake("neither")]);
  eq([s.l1, s.l0, s.neither, s.share, s.blunders.l0.passedWithSpell, s.blunders.l1.needlessChump], [3, 1, 1, 0.75, 10, 5], "and the summary counts wins over the decided games, and each pilot's blunders");
}

console.log(`room-seat-pilots: ${checks} checks passed — the host's Easy or Normal is kept with the seat, launched with the game, and made into L1 at it with its own deck and the seed; a seat without one is L0; and a game of L1 seats replays, and plays the same reopened.`);
