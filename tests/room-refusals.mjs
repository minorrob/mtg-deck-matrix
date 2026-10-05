/* EVERY REFUSED AI ANSWER IS COUNTED FOR THE WHOLE MATCH, NOT READ OFF THE HISTORY (the independent review of 2026-10-05,
 * F-1; game/room/room.mjs `refusals`, tools/fuzz-live.mjs).
 *
 * The review's finding: its fuzz script counted "was refused" lines in `room.history` once a game was over, and the room
 * keeps only the newest 300 lines, so a refusal early in a long game was gone by then and the script said zero. Its
 * sentinel was a refusal injected at the start of a two-seat game of 55 Forests a side, which runs past turn 100. This
 * suite plays that game, 70 Forests a side so it outruns the window by a margin, with a real refusal: a pilot that
 * answers its opening hand's "Keep this hand?" with no answer at all, which the rules refuse (rules/mulligan.mjs), so
 * the room says so and keeps the hand for it, as it would for any refused answer. Then:
 *
 *   Counted    the room's tally is 1 at the end, though the history no longer holds the line (it holds 300, the first
 *              of them long after the refusal);
 *   Durable    a room reopened from its storage -- mid-game and after the end -- still says 1;
 *   Judged     the harness (tools/fuzz-live.mjs `verdict`) fails the game, both the four-AI one that runs start to finish
 *              inside one call and the one with a person in it, though the room survived with its fallback answer;
 *   Replayed   the game replayed from its seed and tape refuses the same answer once, and the two fingerprints agree;
 *   Clean      the same game with the house pilot as it is has a tally of 0, and the harness passes it;
 *   Honest     a room saved before the tally existed resumes counting from where it is reopened and says so, and the
 *              harness does not take its zero for the whole game.
 */
import assert from "node:assert/strict";
import {memoryStorage} from "../game/engine/storage.mjs";
import {openRoom} from "../game/room/room.mjs";
import {replayMatch} from "../game/room/replay.mjs";
import {housePilot} from "../game/engine/pilots/house-pilot.mjs";
import {playGame, verdict} from "../tools/fuzz-live.mjs";

let checks = 0;
const ok = (c, m) => {assert.ok(c, m); checks += 1;};
const eq = (a, b, m) => {assert.deepEqual(a, b, m); checks += 1;};

const FORESTS = {name: "Forests", commander: [], cards: Array(70).fill("Forest")};
const DECKS = [FORESTS, FORESTS];
const WRONG = 1;   // the seat whose pilot answers its opening hand wrongly
const saidRefused = (room) => room.history.filter((h) => /was refused/.test(h.text));

/* A house pilot that answers "Keep this hand?" with nothing at all -- once, as the match's opening hand comes once. */
const wrongOnce = ({seat, cards}) => {
  const real = housePilot({seat, cards});
  return {...real, answer(view, choice) {
    if (seat === WRONG && choice.title === "Keep this hand?") return {indices: []};
    return real.answer(view, choice);
  }};
};

/* 1. TWO AI SEATS, THE WHOLE GAME INSIDE ONE CALL. */
{
  const storage = memoryStorage();
  const game = await playGame({decks: DECKS, seed: 1, matchId: "ai-only", pilot: wrongOnce, storage});
  const {room} = game;
  eq(room.seats.map((s) => s.pilot), ["house", "house"], "two AI seats and no person: the room plays the whole game inside its start");
  ok(room.status === "finished", `the game ran to its end (${game.turns} turns)`);
  eq(room.refusals.total, 1, "the room's tally holds the one refused answer");
  eq([room.refusals.since, room.refusals.first[0].turn, room.refusals.first[0].seatId, room.refusals.first[0].question], [0, 0, `s${WRONG}`, "Keep this hand?"],
    "counted from the match's first event, and said in full: the opening hand, by the seat that answered it");
  ok(room.history.length === 300 && saidRefused(room).length === 0 && room.history[0].turn > 2,
    `the history has dropped the line (it keeps 300, the first from turn ${room.history[0].turn}): counting its lines would have said zero`);
  const woken = await openRoom({storage, matchId: "ai-only", pilot: wrongOnce});
  eq(woken.refusals.total, 1, "reopened from its storage, the room still says 1");
  const v = verdict(game);
  ok(!v.clean && /1 AI answer was refused/.test(v.problems.join(" ")), `the harness fails the game though the room survived it with its least answer (${v.problems.join("; ")})`);
}

/* 2. A PERSON AND AN AI SEAT, THE ROOM PUT AWAY AND WOKEN EVERY TEN ANSWERS. */
{
  const storage = memoryStorage();
  const game = await playGame({decks: DECKS, seed: 2, matchId: "mixed", pilot: wrongOnce, storage, humans: [0], reopenEvery: 10});
  const {room} = game;
  eq(room.seats.map((s) => s.pilot), ["human", "house"], "a person in seat 1, the AI in seat 2");
  ok(room.status === "finished" && game.decisions > 30 && game.reopened > 2, `the game ran to its end through ${game.decisions} of the person's answers and ${game.reopened} reopenings`);
  eq(room.refusals.total, 1, "every reopening kept the tally: still 1 at the end");
  ok(room.history.length === 300 && saidRefused(room).length === 0, "and the history no longer holds the line");
  eq((await openRoom({storage, matchId: "mixed", pilot: wrongOnce})).refusals.total, 1, "reopened once more after the end, 1");
  ok(!verdict(game).clean, "the harness fails this game too");
  const proof = await replayMatch({storage, matchId: "mixed", pilot: wrongOnce});
  ok(proof.same && proof.original.refused === 1 && proof.replayed.refused === 1,
    `replayed from its seed and the person's ${proof.tape} answers, the game refuses the same answer once, and the fingerprints agree`);
}

/* 3. THE SAME GAMES, CLEAN. */
{
  const storage = memoryStorage();
  const game = await playGame({decks: DECKS, seed: 2, matchId: "clean", storage, humans: [0]});
  eq([game.room.status, game.room.refusals.total, game.room.refusals.since], ["finished", 0, 0], "with the house pilot as it is, the tally is 0, counted from the start");
  ok(verdict(game).clean, "and the harness passes it");
  const proof = await replayMatch({storage, matchId: "clean"});
  ok(proof.same && proof.replayed.refused === 0, "its replay agrees, 0 refused");
  const aiOnly = await playGame({decks: DECKS, seed: 1, matchId: "clean-ai"});
  ok(verdict(aiOnly).clean && aiOnly.room.refusals.total === 0, "and the two-AI game, 0");

  /* 4. A ROOM SAVED BEFORE THE TALLY EXISTED. */
  const record = JSON.parse(await storage.get("room/clean"));
  delete record.refusals;
  await storage.put("room/clean", JSON.stringify(record));
  const old = await openRoom({storage, matchId: "clean"});
  ok(old.refusals.total === 0 && old.refusals.since > 0, `an older room counts from where it is reopened (event ${old.refusals.since}), never from a start it did not see`);
  const v = verdict({...game, room: old, refusals: old.refusals});
  ok(!v.clean && /not the match's start/.test(v.problems[0]), "and the harness does not take that zero for the whole game");
}

console.log(`room-refusals: ${checks} checks passed -- a refused AI answer is counted for the whole match, through the history's 300-line window, reopening and replay, and the harness fails a game that had one.`);
