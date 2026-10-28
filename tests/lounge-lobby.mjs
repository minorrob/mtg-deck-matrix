/* THE LOBBY'S OPERATIONS (docs/ui-lane/lounge-contract.md §3 and the coordinator's change of 2026-10-28), through the Worker's front door.
 *
 *   seat           remove | add-ai: the organizer's; edit-ai: any person at the table (and the owner); the lobby only, and not once a
 *                  person is ready; a table keeps two seats; Hard is chosen as the roster allows; the AI on Claude stays behind the AI door
 *   deck           anyone seated brings an AI seat's deck; a person's own seat stays its sitter's
 *   request-join   a person with no seat asks; the organizer alone sees the request; accept seats them, decline says so
 *   quit           the organizer or the owner ends the table for everyone, and nothing more is done at it
 *   log            the organizer's and the owner's alone, and no hand in it
 */
import {ROB, MAYA, SAM, EVE, AVERY, ok, eq, count, world, deckFor, everyString} from "./helpers/lounge-harness.mjs";
import {tableOn, MATS} from "../game/room/table.mjs";
import {basicCards} from "../game/room/room.mjs";
import {pickMat} from "../game/room/lounge.mjs";
import {memoryStorage} from "../game/engine/storage.mjs";

const w = await world({db: true});
const user = (email, name) => {
  w.db.raw.prepare("INSERT INTO users (email, created_at, seen_at) VALUES (?, 't', 't')").run(email);
  const id = w.db.raw.prepare("SELECT id FROM users WHERE email = ?").get(email).id;
  if (name) w.db.raw.prepare("INSERT INTO profiles (user_id, name, avatar, updated_at) VALUES (?, ?, '', 't')").run(id, name);
};
user(EVE, "Eve Adams"); user(AVERY, "Avery Chen");
const T = (id, path = "") => `/api/tables/${id}${path}`;
const seat = (id, as, body) => w.call("POST", T(id, "/seat"), {as, body});
const view = async (id, as) => (await w.call("GET", T(id), {as})).json?.table;

/* 1. SEATS. Maya hosts a public table with Sam, Sable and Ember. */
const made = await w.make(MAYA, {hostName: "Maya", privacy: "public", seats: [{kind: "human", name: "Sam"}, {kind: "ai", name: "Sable"}, {kind: "ai", name: "Ember", level: "easy"}]});
const id = made.id;
await w.call("POST", T(id, "/join"), {as: SAM, body: {code: (await w.call("POST", T(id, "/invite"), {as: MAYA, body: {seatId: 1}})).json.invite.code}});
eq((await view(id, SAM)).seats[2].persona, undefined, "an AI seat made with no persona has none");

/* edit-ai: any person at the table. */
const edited = await seat(id, SAM, {op: "edit-ai", seatId: 2, name: "Gale", level: "easy", persona: "june"});
eq([edited.status, edited.json.table.seats[2].name, edited.json.table.seats[2].level, edited.json.table.seats[2].persona], [200, "Gale", "easy", "june"], "a guest seated at the table changes an AI seat's name, level and persona");
for (const as of [MAYA, SAM]) eq((await view(id, as)).seats[2].persona, "june", "and every seat sees the persona and level");
const spectated = (await w.call("GET", T(id) + "?watch=1", {as: EVE})).json.table;
eq([spectated.seats[2].level, spectated.seats[2].persona], ["easy", "june"], "and so does a spectator");
eq((await seat(id, EVE, {op: "edit-ai", seatId: 2, name: "Nope"})).status, 403, "someone with no seat cannot");
eq((await seat(id, ROB, {op: "edit-ai", seatId: 2, name: "Gale"})).status, 200, "the owner can, watching");
eq((await seat(id, MAYA, {op: "edit-ai", seatId: 2, level: "hard"})).json.table.seats[2].level, "hard", "Hard can be chosen now that the roster has opened it");
eq((await seat(id, MAYA, {op: "edit-ai", seatId: 2, level: "easy"})).status, 200, "and back to Easy");
eq((await seat(id, MAYA, {op: "edit-ai", seatId: 2, level: "llm"})).status, 403, "the AI on Claude stays behind the AI door");
eq((await seat(id, MAYA, {op: "edit-ai", seatId: 2, persona: "NOPE"})).status, 400, "a persona is lower-case letters");
eq((await seat(id, MAYA, {op: "edit-ai", seatId: 1, name: "x"})).status, 400, "a person's seat is not an AI seat");
eq((await seat(id, MAYA, {op: "edit-ai", seatId: 9, name: "x"})).status, 400, "and a seat that is not there is not");
eq((await seat(id, MAYA, {op: "dance", seatId: 2})).status, 400, "an unknown operation is refused");
eq((await seat(id, SAM, {op: "remove", seatId: 3})).status, 403, "removing a seat is the organizer's");
eq((await seat(id, SAM, {op: "add-ai", seatId: 3})).status, 403, "so is adding one");

/* deck: anyone seated brings an AI seat's deck. */
eq((await w.call("POST", T(id, "/deck"), {as: SAM, body: {seatId: 2, deck: deckFor("sable")}})).status, 200, "a guest brings an AI seat's deck");
eq((await w.call("POST", T(id, "/deck"), {as: EVE, body: {seatId: 2, deck: deckFor("eve")}})).status, 403, "a stranger does not");
eq((await w.call("POST", T(id, "/deck"), {as: MAYA, body: {seatId: 1, deck: deckFor("maya")}})).status, 403, "and a person's own seat stays its sitter's, the host's too");
eq((await seat(id, SAM, {op: "edit-ai", seatId: 2, persona: "benny"})).status, 200, "an AI seat whose deck is chosen (so ready) can still be edited; its deck stays");
eq((await view(id, SAM)).seats[2].ready, true, "and stays ready");

/* remove and add-ai; a table keeps two seats. */
const removed = await seat(id, MAYA, {op: "remove", seatId: 3});
eq([removed.status, removed.json.table.seats[3].kind, removed.json.table.seats[3].occupied, removed.json.table.seats[3].open], [200, "human", false, true], "an AI seat is removed and its chair is open");
eq((await seat(id, MAYA, {op: "remove", seatId: 0})).status, 400, "the host's own seat never");
eq((await seat(id, MAYA, {op: "add-ai", seatId: 2})).status, 409, "an AI is added to an open chair only");
const added = await seat(id, MAYA, {op: "add-ai", seatId: 3, name: "Moss", level: "easy", persona: "marcus"});
eq([added.json.table.seats[3].kind, added.json.table.seats[3].name, added.json.table.seats[3].level, added.json.table.seats[3].persona, added.json.table.seats[3].ready, added.json.table.seats[3].open],
  ["ai", "Moss", "easy", "marcus", false, undefined], "an open chair becomes an AI seat, not ready until it has a deck");
eq((await seat(id, MAYA, {op: "remove", seatId: 3})).status, 200, "removed again");
eq((await seat(id, MAYA, {op: "remove", seatId: 2})).status, 200, "Sable may go: Maya and Sam are two seats");
eq((await seat(id, MAYA, {op: "remove", seatId: 1})).status, 409, "but not Sam: a table needs two seats left");
eq((await seat(id, MAYA, {op: "add-ai", seatId: 2, name: "Sable"})).status, 200, "an AI is added back");

/* Not once a person is ready; not once the countdown or the game has begun. */
await w.call("POST", T(id, "/deck"), {as: SAM, body: {seatId: 1, deck: deckFor("sam")}});
await w.call("POST", T(id, "/ready"), {as: SAM, body: {ready: true}});
const refused = await seat(id, MAYA, {op: "remove", seatId: 3});
eq([refused.status, /ready/.test(refused.json.error)], [409, true], "refused once a person is ready, and says why");
eq((await seat(id, SAM, {op: "edit-ai", seatId: 2, name: "Sable"})).status, 409, "edit-ai too");
await w.call("POST", T(id, "/ready"), {as: SAM, body: {ready: false}});
eq((await seat(id, SAM, {op: "edit-ai", seatId: 2, name: "Sable"})).status, 200, "and allowed again when they take it back");
eq((await seat(id, MAYA, {op: "remove", seatId: 1})).status, 200, "a person who joined is removed: the host sends them away");
eq([(await w.call("GET", T(id), {as: SAM})).status, (await view(id, MAYA)).seats[1].open, (await view(id, MAYA)).seats[1].occupied], [403, true, false], "they have no seat, and the chair is open");

/* 2. REQUESTS TO JOIN. Eve (a name in the cloud) asks; only the organizer sees it. */
const asked = await w.call("POST", T(id, "/request-join"), {as: EVE, body: {}});
eq([asked.status, asked.json.request.name, asked.json.request.status, typeof asked.json.request.requestId], [201, "Eve Adams", "open", "string"], "a person with no seat asks to join a table with an open chair, under their name in the cloud");
ok(!JSON.stringify(asked.json).includes("example.com"), "the answer carries no address");
eq((await w.call("POST", T(id, "/request-join"), {as: EVE, body: {}})).status, 409, "a second request while one is open is refused");
eq((await w.call("POST", T(id, "/request-join"), {as: MAYA, body: {}})).status, 409, "the organizer is already at the table");
const mayaView = await view(id, MAYA);
eq(mayaView.requests, [{requestId: asked.json.request.requestId, name: "Eve Adams"}], "the organizer's view lists it, id and name only");
eq("requests" in (await view(id, ROB)), false, "nobody else's view has the key (the owner watching included)");
const waiting = await w.call("GET", T(id), {as: EVE});
eq([waiting.status, waiting.json.request.status], [403, "open"], "the asker, with no seat, is told their request is open");
eq((await w.call("POST", T(id, "/request"), {as: EVE, body: {requestId: asked.json.request.requestId, accept: true}})).status, 403, "only the organizer answers");
eq((await w.call("POST", T(id, "/request"), {as: MAYA, body: {requestId: "nope", accept: true}})).status, 404, "an unknown request is not found");
eq((await w.call("POST", T(id, "/request"), {as: MAYA, body: {requestId: asked.json.request.requestId}})).status, 400, "accept is a boolean");
const declined = await w.call("POST", T(id, "/request"), {as: MAYA, body: {requestId: asked.json.request.requestId, accept: false}});
eq([declined.status, declined.json.table.requests, (await w.call("GET", T(id), {as: EVE})).json.request.status], [200, [], "declined"], "declining removes it from the organizer's list and tells the asker");
const again = await w.call("POST", T(id, "/request-join"), {as: EVE, body: {}});
eq(again.status, 201, "after a no, they may ask again");
const accepted = await w.call("POST", T(id, "/request"), {as: MAYA, body: {requestId: again.json.request.requestId, accept: true}});
eq([accepted.status, accepted.json.table.requests, accepted.json.table.seats[1].occupied, accepted.json.table.seats[1].name], [200, [], true, "Eve Adams"], "accepting seats them in the first open chair under their name");
const eves = await w.call("GET", T(id), {as: EVE});
eq([eves.status, eves.json.table.yourSeat], [200, 1], "and their next look at the table finds their seat, bound to their address");
eq("requests" in eves.json.table, false, "a guest never sees the requests");
eq((await w.call("POST", T(id, "/request"), {as: MAYA, body: {requestId: again.json.request.requestId, accept: true}})).status, 404, "an answered request is closed");
eq((await w.call("POST", T(id, "/request-join"), {as: EVE, body: {}})).status, 409, "a person already seated cannot ask");
/* Every chair taken, a private table: told of by its id, still asks; but there is no chair. */
const priv = await w.make(AVERY, {hostName: "Avery", seats: [{kind: "ai"}]});
eq((await w.call("POST", T(priv.id, "/request-join"), {as: SAM, body: {}})).status, 409, "a table with no open chair takes no request");
const four = await w.make(AVERY, {hostName: "Avery", seats: [{kind: "human", name: "Pat"}, {kind: "ai"}]});
const asks = await w.call("POST", T(four.id, "/request-join"), {as: SAM, body: {}});
eq(asks.status, 201, "a private table can be asked by someone who was told of it");
const fill = await seat(four.id, AVERY, {op: "add-ai", seatId: 1, name: "Pat's chair"});
eq(fill.status, 200, "the organizer fills the chair with an AI instead");
eq((await w.call("POST", T(four.id, "/request"), {as: AVERY, body: {requestId: asks.json.request.requestId, accept: true}})).status, 409, "accepting with no chair left is refused, saying so");

/* 3. QUIT, and what a table that has ended allows. */
const q = await w.make(MAYA, {hostName: "Maya", privacy: "public", seats: [{kind: "ai", name: "Sable"}]});
eq((await w.call("POST", T(q.id, "/quit"), {as: SAM, body: {}})).status, 403, "a person who is not the organizer or the owner cannot end a table");
const quit = await w.call("POST", T(q.id, "/quit"), {as: ROB, body: {}});
eq([quit.status, quit.json.table.phase, quit.json.table.quit.by, quit.json.table.youAreAdmin], [200, "over", "admin", true], "the owner ends a table that is not theirs, and it is over");
eq((await w.call("GET", "/api/tables/live", {as: EVE})).json.games.some((g) => g.tableId === q.id), false, "it leaves the lounge");
eq((await w.call("POST", T(q.id, "/ready"), {as: MAYA, body: {ready: true}})).status, 409, "nothing more is done at it");
eq((await w.call("POST", T(q.id, "/start"), {as: MAYA, body: {}})).status, 409, "it cannot be started");
eq((await seat(q.id, MAYA, {op: "remove", seatId: 1})).status, 409, "nor its seats changed");
eq((await view(q.id, MAYA)).phase, "over", "its host sees it is over");
const q2 = await w.make(MAYA, {hostName: "Maya", seats: [{kind: "ai", name: "Sable"}]});
eq((await w.call("POST", T(q2.id, "/quit"), {as: MAYA, body: {}})).json.table.quit.by, "organizer", "the organizer ends their own");

/* 4. THE LOG: the organizer's and the owner's alone. */
const lg = await w.call("GET", T(id, "/log"), {as: MAYA});
eq(lg.status, 200, "the organizer reads the log");
ok(lg.json.log.some((l) => /Eve Adams joined/.test(l.text)) && lg.json.log.every((l) => typeof l.text === "string" && "at" in l && "kind" in l), "it holds the lobby's lines, each with when and what kind");
eq(Array.isArray(lg.json.chat), true, "and the chat");
eq([(await w.call("GET", T(id, "/log"), {as: ROB})).status, (await w.call("GET", T(id, "/log"), {as: EVE})).status, (await w.call("POST", T(id, "/log"), {as: MAYA, body: {}})).status], [200, 403, 405], "the owner reads it; a guest and a stranger do not; it is a GET");
ok(![...everyString(lg.json)].some((s) => /@example|Bear|Grove/.test(s)), "no address and no card of any deck in it");

/* 5. AN AI SEAT'S MAT IS CHOSEN FOR IT (Rob, 2026-10-28): deterministic from the table's id and the seat, never felt, never a mat another seat
   holds while the pool lasts; a person starts on felt; editing an AI leaves its mat; the view carries it in `seats[].mat` and nothing more. */
{
  const mats = (table) => table.seats.map((s) => s.mat);
  const three = await w.make(MAYA, {hostName: "Maya", seats: [{kind: "ai"}, {kind: "ai"}, {kind: "ai"}]});
  const m3 = mats(three.json.table);
  eq([m3[0], new Set(m3.slice(1)).size, m3.slice(1).every((m) => MATS.includes(m) && m !== "felt")], ["felt", 3, true], "the host starts on felt; three AI seats each get a mat of the pool, none felt, none shared");
  const withPerson = await w.make(MAYA, {hostName: "Maya", seats: [{kind: "human", name: "Sam"}, {kind: "ai"}]});
  eq([withPerson.json.table.seats[1].mat, withPerson.json.table.seats[2].mat !== "felt"], ["felt", true], "a person's chair starts on felt; the AI's does not");
  const again = async (id) => mats(await tableOn(memoryStorage(), {cards: basicCards}).create({tableId: id, host: MAYA, hostName: "Maya", seats: [{kind: "ai"}, {kind: "ai"}, {kind: "ai"}]}));
  eq(await again("tablemats001"), await again("tablemats001"), "the same table id gives the same mats");
  const spread = new Set();
  for (let n = 0; n < 12; n += 1) spread.add((await again(`tablemats${100 + n}`))[1]);
  ok(spread.size > 3, `and different tables get different ones (${spread.size} of 12 differ)`);
  let shared = 0;
  for (let n = 0; n < 40; n += 1) if (new Set((await again(`tablecrowd${n}`)).slice(1)).size !== 3) shared += 1;
  eq(shared, 0, "forty tables of three AI seats: never two alike");
  /* Collisions are rare in a pool of 28, so the choice itself is tried in a pool of three, where they are not. */
  let clash = 0, spreadSmall = new Set();
  for (let n = 0; n < 60; n += 1) {
    const a = pickMat(["x", "y", "z"], `small${n}`, 1), b = pickMat(["x", "y", "z"], `small${n}`, 2, [a]), c = pickMat(["x", "y", "z"], `small${n}`, 3, [a, b]);
    if (new Set([a, b, c]).size !== 3) clash += 1;
    spreadSmall.add(a);
  }
  eq([clash, spreadSmall.size, pickMat(["x"], "t", 1, ["x"])], [0, 3, "x"], "in a pool of three, three seats never share; and when the pool has run out the seat still gets one");
  /* add-ai gives the new seat one away from the others; edit-ai leaves it alone; remove lets it go. */
  const t = await w.make(MAYA, {hostName: "Maya", seats: [{kind: "human", name: "Sam"}, {kind: "ai"}, {kind: "ai"}]});
  const before = mats(t.json.table);
  const addedAi = await seat(t.id, MAYA, {op: "add-ai", seatId: 1, name: "Newcomer"});
  const after = mats(addedAi.json.table);
  eq([after[1] !== "felt", new Set([after[1], after[2], after[3]]).size, after[2], after[3]], [true, 3, before[2], before[3]], "an AI added to an open chair gets a mat no other AI seat has, and the others keep theirs");
  const edited2 = await seat(t.id, MAYA, {op: "edit-ai", seatId: 1, name: "Renamed", level: "easy", persona: "june"});
  eq(mats(edited2.json.table), after, "editing an AI seat leaves every mat alone");
  eq(mats((await seat(t.id, MAYA, {op: "remove", seatId: 1})).json.table)[1], "felt", "a removed seat's chair is plain felt again");
  const obs = await w.make(ROB, {hostName: "Rob", observe: true, seats: [{kind: "ai"}, {kind: "ai"}, {kind: "ai"}, {kind: "ai"}]});
  eq([new Set(mats(obs.json.table)).size, mats(obs.json.table).includes("felt")], [4, false], "an observed table's four AI seats are all different too");
  eq((await w.call("POST", T(t.id, "/mat"), {as: MAYA, body: {mat: "night"}})).json.table.seats[0].mat, "night", "a person still chooses their own");
}

console.log(`lounge-lobby: ${count()} checks passed — seat operations (remove, add-ai, edit-ai by anyone seated), AI decks by anyone seated, requests to join seen by the organizer alone, quit, and the log.`);
