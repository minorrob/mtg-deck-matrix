/* JOINING WITHOUT A STEP (ROB-320; docs/program/rob-320-invitations-contract.md §2), through the Worker's front door.
 *
 * Rob, 2026-10-29: "If via email, they click the link, their browser opens and they are in the seat in the lobby. No confirmations ...
 * If they were in the pre-lobby, they would see the game listed in the live games module. They could click it to join, then enter the
 * lobby, never clicking the link. No confirmations required, they are then in the lobby in the seat."
 *
 * This REPLACES game/room/table.mjs's old header line, "a table's link never adds anyone" (Rob, 2026-09-26), and the host's answer to a
 * request to join. `POST /api/tables/:id/join` with no code seats a signed-in person:
 *   a seat held for their address       -> that seat, under the name the host typed (the email's link)
 *   a public table with an open seat    -> the first open seat, under their profile name (Live games)
 *   anything else                       -> refused, saying what is wrong and what to do instead
 * and it is idempotent. The older code link and the host's own invite route still work.
 */
import {ROB, MAYA, SAM, EVE, AVERY, ok, eq, count, world, deckFor} from "./helpers/lounge-harness.mjs";
import {joinLocation} from "../cloud/worker.mjs";

const w = await world({db: true});
const user = (email, name) => {
  w.db.raw.prepare("INSERT INTO users (email, created_at, seen_at) VALUES (?, 't', 't')").run(email);
  const id = w.db.raw.prepare("SELECT id FROM users WHERE email = ?").get(email).id;
  if (name) w.db.raw.prepare("INSERT INTO profiles (user_id, name, avatar, updated_at) VALUES (?, ?, '', 't')").run(id, name);
};
user(EVE, "Eve Adams"); user(AVERY, "Avery Chen");
const T = (id, path = "") => `/api/tables/${id}${path}`;
const join = (id, as, body = {}) => w.call("POST", T(id, "/join"), {as, body});
const view = async (id, as) => (await w.call("GET", T(id), {as})).json?.table;

/* 1. A seat held for an address: the email's link. */
const priv = await w.make(MAYA, {hostName: "Maya", privacy: "private", seats: [{kind: "human", name: "Sam Rivera", email: SAM}, {kind: "ai", name: "Ember"}]});
const p = priv.id;
const before = await view(p, MAYA);
eq([before.seats[1].invited, before.seats[1].occupied, before.seats[1].open], [true, false, false], "the host sees the guest's seat as invited and held, not open: nothing for the host to do");
eq((await w.call("GET", T(p), {as: SAM})).status, 403, "the guest is no one at the table until they arrive (a private table)");
const sam = await join(p, SAM);
eq([sam.status, sam.json.table.yourSeat, sam.json.table.seats[1].occupied, sam.json.table.seats[1].name, sam.json.table.seats[1].invited], [200, 1, true, "Sam Rivera", false], "the guest follows the link and is in the seat the host named, under the name the host typed, with no code and no answer");
eq((await view(p, MAYA)).seats[1].occupied, true, "and the host sees them take it");
eq((await join(p, SAM)).status, 200, "joining again is the same answer, not a refusal");
eq((await view(p, MAYA)).requests ?? [], [], "no request was ever filed for the host to answer");
const stranger = await join(p, EVE);
eq([stranger.status, /private/.test(stranger.json.error), /Ask the host/.test(stranger.json.error), /Live games/.test(stranger.json.error)], [403, true, true, true], "a stranger at a private table is refused, with who to ask and where else to go");

/* 2. A public table: Live games, one press. */
const pub = await w.make(MAYA, {hostName: "Maya", privacy: "public", seats: [{kind: "human", name: "Seat 2"}, {kind: "human", name: "Seat 3", email: SAM}, {kind: "ai", name: "Ember"}]});
const q = pub.id;
const eve = await join(q, EVE);
eq([eve.status, eve.json.table.yourSeat, eve.json.table.seats[1].name, eve.json.table.seats[1].occupied], [200, 1, "Eve Adams", true], "a public table's open seat is taken at once, under the person's profile name");
const listed = (await w.call("GET", "/api/tables/live", {as: AVERY})).json.games.find((g) => g.tableId === q);
eq([listed.open, listed.human], [0, 3], "Live games counts them: no open seat left, three people");
const late = await join(q, AVERY);
eq([late.status, /Every seat/.test(late.json.error), /Watch/.test(late.json.error), /another game/.test(late.json.error)], [409, true, true, true], "the last seat is held for the invited guest, so a stranger is refused: full, with watching or another game as the way out");
eq((await join(q, SAM)).json.table.yourSeat, 2, "and the guest still gets theirs");

/* 3. The refusals the rules need. */
const full = await w.make(MAYA, {hostName: "Maya", privacy: "public", seats: [{kind: "ai", name: "A"}, {kind: "ai", name: "B"}]});
const f = await join(full.id, EVE);
eq([f.status, /Every seat/.test(f.json.error)], [409, true], "a table with every seat taken refuses");
const going = await w.make(MAYA, {hostName: "Maya", privacy: "public", seats: [{kind: "human", name: "Seat 2"}, {kind: "ai", name: "Ember"}]});
await w.call("POST", T(going.id, "/seat"), {as: MAYA, body: {op: "add-ai", seatId: 1, name: "Moss"}});
const none = await join(going.id, AVERY);
eq(none.status, 409, "an AI filled the open chair: nothing to take");
const open = await w.make(MAYA, {hostName: "Maya", privacy: "public", seats: [{kind: "human", name: "Seat 2"}, {kind: "ai", name: "Ember"}]});
await w.call("POST", T(open.id, "/quit"), {as: MAYA, body: {}});
const ended = await join(open.id, EVE);
eq([ended.status, /ended/.test(ended.json.error), /new table|Live games/.test(ended.json.error)], [409, true, true], "an ended table says so and where to go");

/* A game that has started takes no one new. */
const run = await w.make(MAYA, {hostName: "Maya", privacy: "public", seats: [{kind: "human", name: "Seat 2"}, {kind: "human", name: "Seat 3"}, {kind: "ai", name: "Ember"}]});
const r = run.id;
const first = await join(r, EVE);
eq((await w.call("POST", T(r, "/seat"), {as: MAYA, body: {op: "remove", seatId: 2}})).status, 200, "the host clears the spare chair before readying");
for (const [email, seatId] of [[MAYA, 0], [EVE, first.json.table.yourSeat]]) {
  await w.call("POST", T(r, "/deck"), {as: email, body: {seatId, deck: deckFor(`d${seatId}`)}});
  await w.call("POST", T(r, "/ready"), {as: email, body: {ready: true}});
}
await w.call("POST", T(r, "/deck"), {as: MAYA, body: {seatId: 3, deck: deckFor("ai")}});
eq((await w.call("POST", T(r, "/start"), {as: MAYA, body: {}})).status, 200, "the table starts");
w.clock.t += 10000; await w.objects.get(r).alarm();
const started = await join(r, AVERY);
eq([started.status, /started/.test(started.json.error), /Watch/.test(started.json.error)], [409, true, true], "once the game has started a newcomer is refused, told to watch");

/* 3b. The email's link: /api/join/<table>, through Access's sign-in, comes back to the lobby with the join asked for. */
eq(joinLocation(new URL("https://crankmagic.test/api/join/tablealpha1")), "https://crankmagic.test/#table?id=tablealpha1&join=1", "the lobby link with no code goes back to the app, asking to join");
eq(joinLocation(new URL("https://crankmagic.test/api/join/tablealpha1/AbC_dEf-0123456789xyzXYZ0123456789abcdEFGH0")), "https://crankmagic.test/#table/tablealpha1/AbC_dEf-0123456789xyzXYZ0123456789abcdEFGH0", "a host-sent code link goes back as it always did");
eq(["/api/join/Table_0123", "/api/join/tablealpha1/", "/api/join/tablealpha1/short", "/api/join/tablealpha1/../x", "/api/join/ab"].map((x) => joinLocation(new URL(`https://crankmagic.test${x}`))), [null, null, null, null, null], "anything else is no link (a table id of the wrong shape, a code of the wrong shape, a path after it)");
eq((await w.call("GET", "/api/join/tablealpha1", {as: EVE})).status, 302, "and the Worker answers the link with the redirect, to someone signed in");

/* 4. The older paths still work. */
const coded = await w.make(MAYA, {hostName: "Maya", privacy: "private", seats: [{kind: "human", name: "Sam"}]});
const code = (await w.call("POST", T(coded.id, "/invite"), {as: MAYA, body: {seatId: 1}})).json.invite.code;
eq([(await join(coded.id, SAM, {code})).status, (await join(coded.id, SAM, {code})).status], [200, 200], "a host-sent code link still seats the guest, and opening it again is the same answer");
const stale = await w.make(MAYA, {hostName: "Maya", privacy: "public", seats: [{kind: "human", name: "Sam"}]});
eq((await join(stale.id, EVE, {code: "x".repeat(43)})).status, 410, "a wrong code is still a wrong code, even on a public table");

console.log(`table-open-join: ${count()} checks passed`);
