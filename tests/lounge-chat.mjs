/* CHAT (docs/ui-lane/lounge-contract.md §5).
 *
 *   post     {text}, 1-300 characters, from a seated person or the owner watching ("Watching: <name>"); a few a second at most
 *   push     {type: "chat", message: {id, seatId|null, name, text, at}} to every connection, spectators too
 *   view     the last 50 in the table's view (so a reconnect shows them); the last 500 are kept
 *   log      the chat is part of the log
 */
import {ROB, MAYA, SAM, EVE, ok, eq, count, world, running} from "./helpers/lounge-harness.mjs";

const w = await world({db: true});
w.db.raw.prepare("INSERT INTO users (email, created_at, seen_at) VALUES (?, 't', 't')").run(ROB);
w.db.raw.prepare("INSERT INTO profiles (user_id, name, avatar, updated_at) VALUES (1, 'Rob M', '', 't')").run();
const T = (id, path = "") => `/api/tables/${id}${path}`;
const say = (id, as, text) => w.call("POST", T(id, "/chat"), {as, body: {text}});

/* 1. IN THE LOBBY. */
const made = await w.make(MAYA, {hostName: "Maya", privacy: "public", seats: [{kind: "human", name: "Sam"}, {kind: "ai", name: "Ember"}]});
const id = made.id;
await w.call("POST", T(id, "/join"), {as: SAM, body: {code: (await w.call("POST", T(id, "/invite"), {as: MAYA, body: {seatId: 1}})).json.invite.code}});
const one = await say(id, MAYA, "  hello table  ");
eq([one.status, one.json.message.seatId, one.json.message.name, one.json.message.text, one.json.message.id, typeof one.json.message.at], [201, 0, "Maya", "hello table", 1, "number"],
  "a seated person speaks, trimmed, under their seat's name, with the seat they hold");
eq((await say(id, SAM, "hi Maya")).json.message.seatId, 1, "a guest speaks as their seat");
const owner = await say(id, ROB, "just watching");
eq([owner.status, owner.json.message.seatId, owner.json.message.name], [201, null, "Watching: Rob M"], "the owner, watching, speaks as 'Watching: <name>' with no seat");
eq((await say(id, EVE, "let me in")).status, 403, "a stranger cannot");
eq([(await say(id, MAYA, "")).status, (await say(id, MAYA, "   ")).status, (await say(id, MAYA, "x".repeat(301))).status, (await w.call("POST", T(id, "/chat"), {as: MAYA, body: {text: 5}})).status, (await w.call("POST", T(id, "/chat"), {as: MAYA, body: {}})).status], [400, 400, 400, 400, 400],
  "nothing, only spaces, more than 300 characters, and a non-string are refused");
eq((await say(id, MAYA, "x".repeat(300))).status, 201, "300 characters are allowed");
eq((await w.call("GET", T(id, "/chat"), {as: MAYA})).status, 405, "chat is a POST; reading it is the view's and the log's");

/* The rate: a few a second. */
w.clock.t += 5000;
const burst = [];
for (let i = 0; i < 6; i += 1) burst.push((await say(id, MAYA, `burst ${i}`)).status);
eq(burst, [201, 201, 201, 201, 429, 429], "four messages in two seconds, then 429");
eq((await say(id, SAM, "i am not limited by maya")).status, 201, "the limit is per person");
w.clock.t += 2500;
eq((await say(id, MAYA, "and again")).status, 201, "and lifts");

/* The view carries the chat. */
const seen = (await w.call("GET", T(id), {as: SAM})).json.table.chat;
eq([seen.at(-1).text, seen.at(-1).name, seen.map((m) => m.id).every((n, i, all) => i === 0 || n === all[i - 1] + 1)], ["and again", "Maya", true], "the view carries it, in order, ids counting up");
ok((await w.call("GET", T(id), {as: ROB})).json.table.chat.length > 0 && (await w.call("GET", T(id) + "?watch=1", {as: EVE})).json.table.chat.length > 0, "the owner watching, and a spectator of a public table, are shown it too");
const log = (await w.call("GET", T(id, "/log"), {as: MAYA})).json;
ok(log.chat.some((m) => m.text === "hello table"), "and it is in the log");

/* Last 50 in the view, last 500 kept. */
for (let i = 0; i < 520; i += 1) {w.clock.t += 600; await say(id, i % 2 ? MAYA : SAM, `m${i}`);}
const tail = (await w.call("GET", T(id), {as: MAYA})).json.table.chat;
eq([tail.length, tail.at(-1).text, tail[0].text], [50, "m519", "m470"], "the view carries the last 50");
const kept = (await w.call("GET", T(id, "/log"), {as: MAYA})).json.chat;
eq([kept.length, kept.at(-1).text, kept[0].text], [500, "m519", "m20"], "and 500 are kept");

/* 2. IN THE GAME: pushed to every connection. */
const game = await running(w, MAYA, {privacy: "public", people: [{name: "Sam", email: SAM}]});
await game.start();
const gid = game.id, headers = {upgrade: "websocket", origin: "https://crankmagic.test"};
await w.call("GET", T(gid, "/connect"), {as: MAYA, headers}); await w.call("GET", T(gid, "/connect"), {as: SAM, headers}); await w.watch(gid, EVE);
const socks = w.socketsOf(gid), kinds = socks.map((s) => s.tags[0]);
eq(kinds.sort(), ["s0", "s1", "watch"], "two seats and a spectator are connected");
const posted = await say(gid, SAM, "good luck");
for (const s of socks) {
  const pushed = s.frames.filter((f) => f.type === "chat");
  eq([pushed.length, pushed[0].message.text, pushed[0].message.name, pushed[0].message.id], [1, "good luck", "Sam", posted.json.message.id], `the ${s.tags[0] === "watch" ? "spectator" : "seat " + s.tags[0]} is pushed the message`);
}
eq((await say(gid, EVE, "from the stands")).status, 403, "a spectator who is not the owner cannot chat");
ok(!JSON.stringify(socks.find((s) => s.tags[0] === "watch").frames).includes(MAYA), "no address in anything pushed");

console.log(`lounge-chat: ${count()} checks passed — chat in the lobby and the game, rate-limited, pushed to every connection, the last 50 in the view and 500 kept, and in the log.`);
