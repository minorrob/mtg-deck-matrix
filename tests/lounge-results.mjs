/* RESULTS AND THE LEADERBOARD (docs/ui-lane/lounge-contract.md §1 and §6; migration 0010_match_results.sql).
 *
 *   at the game's end  one row per PERSON's seat -- win | loss | tie | unfinished -- and never one for an AI seat; a conceded game
 *                      is a loss; Quit/End before a result is unfinished
 *   leaderboard        per person, wins then fewest losses, `you` marks the caller, nobody's address; {rows: []} until the table exists
 *   observe            an AI-only game files nothing and its table closes after the one game
 *   record             a finished game's record carries the chat
 */
import {ROB, MAYA, SAM, EVE, ok, eq, count, world, running, begun, deckFor} from "./helpers/lounge-harness.mjs";
import {readFileSync} from "node:fs";

const T = (id, path = "") => `/api/tables/${id}${path}`;
const rows = (w) => w.db.raw.prepare("SELECT match_id, seat_id, email, name, outcome, humans, ai FROM match_results ORDER BY match_id, seat_id").all();

/* 1. THE GAMES. Maya, Sam and Eve (people) with AI seats between them. */
const w = await world({db: true});
{
  /* a. Two people; Sam concedes: Maya is the last one standing and wins; Sam's is a loss. */
  const g1 = await running(w, MAYA, {privacy: "public", people: [{name: "Sam", email: SAM}], ai: 0});
  await g1.start(); await begun(w, g1.id, [MAYA, SAM]);
  eq(rows(w), [], "no row while the game is on");
  const conceded = await w.call("POST", T(g1.id, "/concede"), {as: SAM, body: {}});
  eq([conceded.status, conceded.json.table.phase], [200, "rematch"], "Sam concedes and the game is over");
  eq(rows(w).map((r) => [r.seat_id, r.name, r.outcome, r.humans, r.ai]), [["s0", "Maya", "win", 2, 0], ["s1", "Sam", "loss", 2, 0]], "the game's end files a win for the last person standing and a loss for the one who conceded");
  ok(rows(w).every((r) => /@example\.com$/.test(r.email)), "each row is the person's, by address, in the database alone");
  await w.call("POST", T(g1.id, "/mat"), {as: MAYA, body: {mat: "night"}});
  eq(rows(w).length, 2, "and a later request writes nothing twice");

  /* b. One person against an AI: they concede -- a loss, and the AI seat has no row. */
  const g2 = await running(w, EVE, {privacy: "public", ai: 1});
  await g2.start(); await begun(w, g2.id, [EVE]);
  await w.call("POST", T(g2.id, "/concede"), {as: EVE, body: {}});
  eq(rows(w).filter((r) => r.match_id.startsWith(g2.id)).map((r) => [r.seat_id, r.outcome, r.humans, r.ai]), [["s0", "loss", 1, 1]], "a person who concedes to an AI has a loss, and the AI seat has no row");

  /* c. Maya and Sam against an AI: Sam concedes, then Maya ends the game: a loss and an unfinished game. */
  const g3 = await running(w, MAYA, {privacy: "public", people: [{name: "Sam", email: SAM}], ai: 1});
  await g3.start(); await begun(w, g3.id, [MAYA, SAM]);
  await w.call("POST", T(g3.id, "/concede"), {as: SAM, body: {}});
  eq(rows(w).filter((r) => r.match_id.startsWith(g3.id)), [], "a game that goes on after a concession files nothing yet");
  await w.call("POST", T(g3.id, "/end"), {as: MAYA, body: {}});
  eq(rows(w).filter((r) => r.match_id.startsWith(g3.id)).map((r) => [r.seat_id, r.outcome]), [["s0", "unfinished"], ["s1", "loss"]], "Maya ending it is unfinished; Sam's concession stays a loss");

  /* d. The organizer quits a game in play: unfinished. */
  const g4 = await running(w, SAM, {privacy: "public", people: [{name: "Maya", email: MAYA}], ai: 1});
  await g4.start(); await begun(w, g4.id, [SAM, MAYA]);
  const quit = await w.call("POST", T(g4.id, "/quit"), {as: SAM, body: {}});
  eq([quit.status, quit.json.table.phase], [200, "over"], "the organizer quits a game in play");
  eq(rows(w).filter((r) => r.match_id.startsWith(g4.id)).map((r) => [r.seat_id, r.outcome, r.ai]), [["s0", "unfinished", 1], ["s1", "unfinished", 1]], "every person's game is unfinished");
  eq((await w.call("GET", T(g4.id), {as: MAYA})).json.table.phase, "over", "the table reads as over to everyone at it");
  eq((await w.call("GET", "/api/tables/mine", {as: MAYA})).json.tables.some((t) => t.tableId === g4.id), false, "and is not on anyone's list to resume");

  /* e. A game started and left in the lobby files nothing; quit in the lobby is not a game. */
  const lobby = await w.make(MAYA, {hostName: "Maya", seats: [{kind: "ai"}]});
  await w.call("POST", T(lobby.id, "/quit"), {as: MAYA, body: {}});
  eq(rows(w).filter((r) => r.match_id.startsWith(lobby.id)), [], "a table ended in its lobby played no game");

  /* The record carries the chat. */
  await w.call("POST", T(g1.id, "/chat"), {as: MAYA, body: {text: "gg"}});
  const record = (await w.call("GET", T(g1.id, "/record"), {as: MAYA})).json.record;
  eq([record.matchId.startsWith(g1.id), record.chat.map((m) => m.text)], [true, ["gg"]], "a finished game's record carries the chat");
}

/* 2. THE LEADERBOARD: per person, from those rows. */
{
  const board = await w.call("GET", "/api/leaderboard", {as: MAYA});
  eq(board.status, 200, "any signed-in person reads it");
  eq(board.json.rows, [
    {name: "Maya", wins: 1, losses: 0, ties: 0, unfinished: 2, you: true},
    {name: "Eve", wins: 0, losses: 1, ties: 0, unfinished: 0, you: false},
    {name: "Sam", wins: 0, losses: 2, ties: 0, unfinished: 1, you: false},
  ], "wins first, then fewest losses; one row a person; `you` marks the caller; unfinished counted apart");
  eq((await w.call("GET", "/api/leaderboard", {as: SAM})).json.rows.map((r) => [r.name, r.you]), [["Maya", false], ["Eve", false], ["Sam", true]], "and it is Sam's own row for Sam");
  ok(!JSON.stringify(board.json).includes("example.com") && !JSON.stringify(board.json).includes("Ember"), "no address, and no AI seat on it");
}

/* 3. UNTIL THE MIGRATION IS APPLIED: the leaderboard is empty, the game goes on, and the rows wait for it. */
{
  const late = await world({db: true, migrations: ["0001_accounts.sql", "0002_ai.sql", "0003_sharing.sql"]});
  eq((await late.call("GET", "/api/leaderboard", {as: MAYA})).json, {rows: []}, "without the table the leaderboard answers {rows: []}");
  const g = await running(late, MAYA, {privacy: "public", people: [{name: "Sam", email: SAM}], ai: 0});
  await g.start(); await begun(late, g.id, [MAYA, SAM]);
  const done = await late.call("POST", T(g.id, "/concede"), {as: SAM, body: {}});
  eq([done.status, done.json.table.phase], [200, "rematch"], "a game ends without the table, and nothing breaks");
  eq((await late.call("GET", "/api/leaderboard", {as: MAYA})).json, {rows: []}, "still empty");
  late.db.raw.exec(readFileSync(new URL("../cloud/migrations/0010_match_results.sql", import.meta.url), "utf8"));
  await late.call("POST", T(g.id, "/mat"), {as: MAYA, body: {mat: "night"}});
  eq((await late.call("GET", "/api/leaderboard", {as: MAYA})).json.rows.length, 0, "the table retries after a pause, not at once");
  late.clock.t += 11 * 60 * 1000;
  await late.call("POST", T(g.id, "/mat"), {as: MAYA, body: {mat: "forge"}});
  eq((await late.call("GET", "/api/leaderboard", {as: MAYA})).json.rows.map((r) => [r.name, r.wins, r.losses]), [["Maya", 1, 0], ["Sam", 0, 1]], "once the table exists the waiting rows are filed");
  const noDb = await world();
  eq((await noDb.call("GET", "/api/tables/live", {as: MAYA})).status, 200, "a Worker with no database still runs the lounge");
}

/* 4. OBSERVE AI GAME: AI seats only, nothing filed, one game. */
{
  const o = await world({db: true});
  const made = await o.make(ROB, {hostName: "Rob", observe: true, privacy: "public", seats: [{kind: "ai", name: "Sable"}, {kind: "ai", name: "Ember"}]});
  const id = made.id;
  eq(made.status, 201, "the owner makes an observed table");
  for (const s of made.json.table.seats) await o.call("POST", T(id, "/deck"), {as: ROB, body: {seatId: s.seatId, deck: deckFor(`o${s.seatId}`)}});
  eq((await o.call("GET", T(id), {as: ROB})).json.table.seats.map((s) => s.ready), [true, true], "the AI seats are ready from their decks; no person is needed");
  eq((await o.call("POST", T(id, "/start"), {as: ROB, body: {}})).status, 200, "the owner starts it");
  o.clock.t += 10000; await o.objects.get(id).alarm();
  eq((await o.call("GET", T(id), {as: ROB})).json.table.phase, "playing", "the game runs with AI seats only");
  eq((await o.watch(id, ROB)).status, 200, "the owner watches it");
  eq((await o.watch(id, EVE)).status, 200, "(a public table: so may anyone)");
  const object = o.objects.get(id);
  let turns = 0;
  for (; turns < 600; turns += 1) {
    if ((await o.call("GET", T(id), {as: ROB})).json.table.phase !== "playing") break;
    o.clock.t += 1000; await object.alarm();
  }
  const after = (await o.call("GET", T(id), {as: ROB})).json.table;
  eq([after.phase, after.rematch.outcome, rows(o).length], ["rematch", "closed", 0], `an observed game that ends (here after ${turns} alarms) closes its table after the one game, and files no row: there is no person in it`);
  eq(rows(o).length, 0, "no row for an AI seat, ever");
  /* Ended while the AI seats are mid-slice: the room can't be ended then, so the table is abandoned where it stands. */
  const again = await o.make(ROB, {hostName: "Rob", observe: true, seats: [{kind: "ai", name: "Sable"}, {kind: "ai", name: "Ember"}]});
  for (const s of again.json.table.seats) await o.call("POST", T(again.id, "/deck"), {as: ROB, body: {seatId: s.seatId, deck: deckFor(`o${s.seatId}`)}});
  await o.call("POST", T(again.id, "/start"), {as: ROB, body: {}});
  o.clock.t += 10000; await o.objects.get(again.id).alarm();
  const midway = await o.call("POST", T(again.id, "/quit"), {as: ROB, body: {}});
  eq([midway.status, midway.json.table.phase], [200, "over"], "an observed game in play is ended by the owner, mid-slice or not");
  eq([(await o.watch(again.id, ROB)).status, rows(o).length], [409, 0], "and cannot be watched after, and filed nothing");
}

console.log(`lounge-results: ${count()} checks passed — one row per person's seat when a game ends (never an AI seat), a concession a loss, End and Quit unfinished, the leaderboard from those rows and empty until migration 0010 is applied, and an observed AI game files nothing.`);
