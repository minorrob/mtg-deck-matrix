/* THE AI-ONLY GAME AND ITS OBSERVER, from the owner's side (ROB-338; docs/program/admin-pane-contract.md §5).
 *
 * Rob, 2026-10-30: the owner has "the ability to run AI-only games and observe." The table already has it (the Observe AI game:
 * docs/ui-lane/lounge-contract.md §1 and §4); the Admin pane is a second way in. This suite is the contract the pane stands on:
 *
 *   refused   General and an Insider cannot make an AI-only table (403, saying who can), and it never appears for them
 *   made      the owner makes one: two to four AI seats and no one else, private unless asked, the owner at no seat
 *   runs      with its AI seats' decks it starts and plays on the room's own clock, with no one acting for any seat
 *   observer  the owner watches (connect?watch=1): every frame of the game is the public view -- no decision, no mana sources, no
 *             seat of their own, no card in any hand or library -- and every action frame answers {type: "refused"} and is not applied
 *   no seat   the owner cannot connect as a seat or act through the table's routes; a stranger cannot watch a private one
 *   filed     nothing: there is no person in it, so no result row
 */
import {ROB, MAYA, EVE, ok, eq, count, world, deckFor} from "./helpers/lounge-harness.mjs";

const T = (id, path = "") => `/api/tables/${id}${path}`;
const w = await world({db: true});
const INSIDER = MAYA;
w.db.raw.prepare("INSERT INTO ai_allowlist (email, added_at, note) VALUES (?, ?, ?)").run(INSIDER, "2026-10-01T00:00:00Z", "test");
const seats = (n) => Array.from({length: n}, (_, i) => ({kind: "ai", name: `Bot ${i + 1}`, level: "normal"}));
const form = {hostName: "Rob", observe: true, seats: seats(2)};
const results = () => w.db.raw.prepare("SELECT COUNT(*) AS n FROM match_results").get().n;

/* 1. REFUSED: not the owner. */
for (const [name, who] of [["General", EVE], ["an Insider", INSIDER]]) {
  const made = await w.make(who, form);
  eq(made.status, 403, `${name} cannot make an AI-only table`);
  ok(/Only CrankMagic's owner can observe an AI game/.test(made.json.error), `${name}: and is told who can`);
  eq(made.id, undefined, `${name}: no table was made`);
}
eq((await w.call("GET", "/api/tables/live", {as: ROB})).json.games, [], "nothing is listed after those refusals");

/* 2. MADE: two to four AI seats and no one else. */
eq((await w.make(ROB, {...form, seats: seats(1)})).status, 400, "one AI seat is not a game");
eq((await w.make(ROB, {...form, seats: seats(5)})).status, 400, "five is more than a table");
eq((await w.make(ROB, {...form, seats: [...seats(2), {kind: "human", name: "Maya"}]})).status, 400, "and a person's seat is refused: an AI-only table has no one else");
const made = await w.make(ROB, form), id = made.id;
eq(made.status, 201, "the owner makes an AI-only table");
const table = made.json.table;
eq([table.observe, table.yourSeat, table.youAreHost, table.youAreAdmin, table.privacy, table.seats.map((s) => s.kind)], [true, null, true, true, "private", ["ai", "ai"]],
  "AI seats only, private by default, the owner at none of them (host and owner, not a player)");
eq((await w.call("GET", "/api/tables/live", {as: EVE})).json.games.length, 0, "a private AI-only table is on no one else's list");

/* 3. RUNS: decks for the AI seats, then the room's own clock; nobody acts for a seat. */
for (const s of table.seats) await w.call("POST", T(id, "/deck"), {as: ROB, body: {seatId: s.seatId, deck: deckFor(`z${s.seatId}`)}});
eq((await w.call("GET", T(id), {as: ROB})).json.table.seats.map((s) => s.ready), [true, true], "the AI seats are ready from their decks");
eq((await w.call("POST", T(id, "/start"), {as: ROB, body: {}})).status, 200, "the owner starts it, as any host does");
const object = w.objects.get(id);
w.clock.t += 10000; await object.alarm();
eq((await w.call("GET", T(id), {as: ROB})).json.table.phase, "playing", "the game is on");

/* 4. THE OBSERVER: the public view, and no way to act. */
eq((await w.watch(id, EVE)).status, 403, "a stranger cannot watch a private AI-only table");
eq((await w.call("GET", T(id) + "?watch=1", {as: EVE})).status, 403, "nor read it");
eq((await w.watch(id, ROB)).status, 200, "the owner watches it");
const eyes = w.socketsOf(id).find((s) => s.tags[0] === "watch");
ok(eyes, "as a spectator's socket, tagged by the object and not by anything the client sent");
const views = () => eyes.frames.filter((f) => f.type === "view");
ok(views().length >= 1, "and is sent the game at once");
const seen = new Set();
const checkFrames = () => {
  for (const f of views()) {
    const v = f.view;
    eq([v.spectator, v.decision, v.manaSources, v.seat, v.seatId], [true, null, [], null, null], `revision ${v.revision}: a spectator's view -- no decision, no mana sources, no seat of its own`);
    ok(!("canUndo" in v) && !("stepByStep" in v) && !("yielding" in v), `revision ${v.revision}: none of a seat's own ways of playing`);
    for (const p of v.state.players) {
      eq([p.zones.Hand.cards.length, p.zones.Library.cards.length], [0, 0], `revision ${v.revision}: no card of any hand or library`);
      ok(Number.isInteger(p.zones.Hand.count) && Number.isInteger(p.zones.Library.count), `revision ${v.revision}: only their sizes`);
    }
    seen.add(v.state.turn);
  }
};
checkFrames();
const first = seen.size;
for (let alarms = 0; alarms < 8; alarms += 1) {w.clock.t += 1000; await object.alarm();}
checkFrames();
eq((await w.call("GET", T(id), {as: ROB})).json.table.phase, "playing", "still being played after eight ticks of the room's clock");
ok(views().length >= 9 && seen.size > first, `the game moved on its own while watched: ${views().length} views, turns ${[...seen].join(", ")}, each the public one`);

/* 5. NOTHING THE OBSERVER SENDS IS PLAYED. */
const latest = views().at(-1).view;
const revision = (await object.load()).view("s0").revision;
const before = eyes.frames.length;
await object.webSocketMessage(eyes, JSON.stringify({type: "act", actionId: crypto.randomUUID(), revision: latest.revision, kind: "answer", choiceId: "anything", indices: [0]}));
const refused = eyes.frames.slice(before);
eq([refused.length, refused[0].type, refused[0].status], [1, "refused", 403], "an action frame answers {type: refused}");
for (const frame of [{type: "act", actionId: "a", revision: latest.revision, kind: "pass"}, {type: "yield", on: true}, {type: "prefer", stepByStep: true}, {type: "check", choiceId: "x", indices: [0]}, {type: "nonsense"}]) {
  await object.webSocketMessage(eyes, JSON.stringify(frame));
  eq(eyes.frames.at(-1).type, "refused", `a ${frame.type} frame is refused too`);
}
eq((await object.load()).view("s0").revision, revision, "and none was applied: the game did not move");

/* 6. THE OWNER HAS NO SEAT TO PLAY FROM. */
eq((await w.call("GET", T(id, "/connect"), {as: ROB, headers: {upgrade: "websocket", origin: "https://crankmagic.test"}})).status, 403, "without watch=1 the owner has no seat to connect to");
for (const action of ["concede", "ready", "rematch"]) {
  const r = await w.call("POST", T(id, `/${action}`), {as: ROB, body: action === "ready" ? {ready: true} : action === "rematch" ? {accept: true} : {}});
  ok(r.status >= 400 && r.status < 500, `/${action}: the owner, at no seat, is refused (${r.status})`);
}
eq((await w.call("GET", T(id), {as: ROB})).json.table.phase, "playing", "and the game is still being played");

/* 7. FILED NOTHING, and the owner can end it. */
eq((await w.call("POST", T(id, "/quit"), {as: ROB, body: {}})).status, 200, "the owner ends the table");
eq([results(), (await w.watch(id, ROB)).status], [0, 409], "no result row was filed for an AI seat, and an ended table cannot be watched");

console.log(`admin-ai-table: ${count()} checks passed — only the owner makes an AI-only table, it runs on the room's clock with decks for its AI seats, and the owner's observer view is the public one with no decision and every action refused.`);
