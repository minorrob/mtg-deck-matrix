/* A FINISHED GAME'S RECORD, DOWNLOADED (docs/plan-to-100.md M8b; Rob's go, 2026-09-29, on the recommendation: the
 * full record for a playtest table only, and each seat its own on any other). game/room/table.mjs `record`,
 * cloud/game-room.mjs GET /table/record, cloud/tables.mjs GET /api/tables/:id/record, crankmagic-board.js History.
 *
 *   Wait      there is no record while the game goes on: a record shows what the game hid
 *   Playtest  a playtest table's record is the whole game: its seed, pod, decision tape and journal, and a fresh
 *             room fed them reaches the same game (the M8a replayer), so a finding can be seen again
 *   Seat      any other table's record is the asking seat's own: its last view and the public history, never the
 *             seed, the tape, the journal or another seat's hidden cards
 *   Who       only a person with a seat at the table, only a game this table played
 *   Flag      a table is a playtest table when it is made, by the Worker's PLAYTEST_TABLES, never by the request
 *   Door      the front door forwards a GET only, and a match id only in its own shape
 */
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {createRng} from "../game/engine/rng.mjs";
import {randomLegalPilot} from "../game/engine/pilots/random-legal.mjs";
import {memoryStorage} from "../game/engine/storage.mjs";
import {basicCards} from "../game/room/room.mjs";
import {replayTape} from "../game/room/replay.mjs";
import {tableOn, RECORD_SCHEMA} from "../game/room/table.mjs";
import {GameTable} from "../cloud/game-room.mjs";
import {tables} from "../cloud/tables.mjs";

let checks = 0;
const ok = (c, m) => {assert.ok(c, m); checks += 1;};
const eq = (a, b, m) => {assert.deepEqual(a, b, m); checks += 1;};
const refuses = async (p, status, re, m) => {await assert.rejects(p, (e) => e.status === status && (!re || re.test(e.message)), m); checks += 1;};
const everyString = (v, out = new Set()) => {if (typeof v === "string") out.add(v); else if (v && typeof v === "object") Object.values(v).forEach((x) => everyString(x, out)); return out;};

const FOREST = {types: ["Land"], abilities: [{id: "t-g", kind: "mana", tapSelf: true, produces: {G: 1}}]};
const DEFS = new Map();
const def = (name, d) => {DEFS.set(name, d); return name;};
const cards = (name) => DEFS.get(name) ?? basicCards(name);
const deck = (tag) => ({name: `${tag} deck`, commander: [def(`General ${tag}`, {types: ["Creature"], power: 3, toughness: 3, manaCost: "{2}{G}"})],
  cards: [...Array.from({length: 38}, () => def(`Grove ${tag}`, FOREST)), ...Array.from({length: 61}, (_, i) => def(`Bear ${tag}-${i}`, {types: ["Creature"], power: 2, toughness: 2, manaCost: "{1}{G}"}))]});
const answerer = (seed) => {const p = randomLegalPilot(createRng(seed)); return (d) => {const a = p.answer(d); return {kind: "answer", choiceId: d.id, ...(a.indices ? {indices: a.indices} : {}), ...(a.amounts ? {amounts: a.amounts} : {}), ...(a.value !== undefined ? {value: a.value} : {})};};};

const ROB = "rob@example.com", MAYA = "maya@example.com", EVE = "eve@example.com";
let now = Date.parse("2026-09-29T20:00:00Z");
let seq = 0;
const random = (n) => {seq += 1; return new Uint8Array(n).map((_, i) => (seq * 17 + i * 3) % 256);};

/* A table of Rob, Maya and an AI, played for a while and then ended by Maya. */
async function playedTable(tableId, {playtest = false} = {}) {
  const storage = memoryStorage(), t = tableOn(storage, {cards, random});
  await t.create({tableId, host: ROB, hostName: "Rob", seats: [{kind: "human", name: "Maya"}, {kind: "ai", name: "Bot"}], playtest});
  await t.join(MAYA, (await t.invite(ROB, 1, now)).code, now);
  await t.deck(ROB, 0, deck(`${tableId}r`), now); await t.deck(MAYA, 1, deck(`${tableId}m`), now); await t.deck(ROB, 2, deck(`${tableId}c`), now);
  await t.ready(ROB, true, now); await t.ready(MAYA, true, now);
  await t.start(ROB, now);
  const matchId = await t.tick(now + 10000);
  const room = await t.currentRoom(), people = answerer(tableId);
  for (let i = 0; i < 60 && room.waitingOn; i += 1) {const who = room.waitingOn, v = room.view(who); await room.act(who, {actionId: randomUUID(), revision: v.revision, ...people(v.decision)});}
  return {t, storage, matchId, room};
}

/* 1. A PLAYTEST TABLE: THE WHOLE GAME. */
{
  const {t, matchId, room} = await playedTable("playtest01", {playtest: true});
  eq((await t.view(ROB)).playtest, true, "the table says it is a playtest table");
  await refuses(t.record(ROB, matchId), 409, /once the game is over/, "while the game goes on there is no record");
  await t.endGame(MAYA, now + 20000);
  const rec = await t.record(ROB, matchId);
  eq([rec.schema, rec.kind, rec.tableId, rec.matchId, rec.playtest], [RECORD_SCHEMA, "full", "playtest01", matchId, true], "after it ends, a playtest table's record is the full record");
  eq([typeof rec.seed, rec.pod.seats.map((s) => s.seatId), rec.tape.length > 10, rec.journal.length > 10], ["string", ["s0", "s1", "s2"], true, true], "its seed, its pod, its decision tape and its journal");
  eq(rec.tape.at(-1).kind, "end", "the tape ends where Maya ended the game");
  eq(rec.result, {winner: null, reason: "ended early", endedBy: "s1"}, "and it says how it ended");
  ok(rec.history.length > 0 && rec.history.every((l) => typeof l.text === "string"), "the public history comes with it");
  const replayed = await replayTape({matchId: rec.matchId, pod: rec.pod, seed: rec.seed, tape: rec.tape, cards});
  eq(replayed.fingerprint(), room.fingerprint(), "a fresh room fed the downloaded seed, pod and tape reaches the same game: a finding can be seen again");
  eq((await t.record(MAYA)).matchId, matchId, "a guest downloads it too, and with no match named it is the table's last game");
  ok(!everyString(rec).has(ROB) && !everyString(rec).has(MAYA), "no one's address is in it: seats are s0, s1, s2");
  await refuses(t.record(EVE, matchId), 403, null, "someone without a seat gets nothing");
  await refuses(t.record(ROB, "playtest01g9"), 404, /no such game/, "a game this table did not play is not found");
}

/* 2. ANY OTHER TABLE: YOUR OWN SEAT. */
{
  const {t, matchId, room, storage} = await playedTable("ordinary01");
  eq((await t.view(ROB)).playtest, false, "a table is not a playtest table unless it was made one");
  await t.endGame(ROB, now + 20000);
  const rec = await t.record(MAYA, matchId);
  eq([rec.schema, rec.kind, rec.seatId, rec.playtest], [RECORD_SCHEMA, "seat", "s1", false], "Maya's record is her own seat's");
  eq(Object.keys(rec).filter((k) => ["seed", "pod", "tape", "journal"].includes(k)), [], "with no seed, pod, tape or journal");
  eq(rec.view.state, room.view("s1").state, "her last view is what she was shown");
  const strings = everyString(rec);
  ok(![...strings].some((s) => s.includes(`${matchId}:`)), "the seed is nowhere in it");
  const hers = room.view("s1").state, hidden = new Set();
  for (const d of [deck("ordinary01r"), deck("ordinary01c")]) for (const c of d.cards) hidden.add(c);
  const seen = everyString(hers);
  ok([...hidden].every((c) => !strings.has(c) || seen.has(c)), "and nothing of another seat's that she was not shown: no one else's hand or library");
  const kept = JSON.parse(await storage.get(`room/${matchId}`)).history;
  eq([rec.history.length, rec.history.map((l) => l.text)], [kept.length, kept.map((l) => l.text)], `the history is the table's public lines, every one the room kept (${kept.length}), not only a view's newest`);
  eq((await t.record(ROB, matchId)).seatId, "s0", "Rob's is his own");
}

/* 3. THE FLAG IS THE WORKER'S, AND THE OBJECT'S ROUTE. */
function objectCtx() {
  const map = new Map();
  return {storage: {get: async (k) => map.get(k), put: async (k, v) => {map.set(k, v);}, delete: async (k) => map.delete(k),
    list: async ({prefix}) => new Map([...map].filter(([k]) => k.startsWith(prefix)).sort()), setAlarm: async () => {}, deleteAlarm: async () => {}},
  acceptWebSocket: () => {}, getWebSockets: () => [], getTags: () => []};
}
const objectCall = (table) => async (method, path, email, body) => {
  const r = await table.fetch(new Request(`https://table.internal${path}`, {method, headers: {"content-type": "application/json", "x-crankmagic-email": email}, ...(body !== undefined ? {body: JSON.stringify(body)} : {})}));
  return {status: r.status, json: await r.json()};
};
{
  const plain = objectCall(new GameTable(objectCtx(), {}, {cards, random, now: () => now}));
  eq((await plain("POST", "/table/create", ROB, {tableId: "flagplain1", hostName: "Rob", seats: [{kind: "ai"}], playtest: true})).json.table.playtest, false, "a request cannot make its own table a playtest table");
  const staging = new GameTable(objectCtx(), {PLAYTEST_TABLES: "on"}, {cards, random, now: () => now}), call = objectCall(staging);
  eq((await call("POST", "/table/create", ROB, {tableId: "flagstage1", hostName: "Rob", seats: [{kind: "ai"}]})).json.table.playtest, true, "where the Worker says PLAYTEST_TABLES is on (staging), every table is a playtest table");
  await call("POST", "/table/deck", ROB, {seatId: 0, deck: deck("fr")}); await call("POST", "/table/deck", ROB, {seatId: 1, deck: deck("fc")});
  await call("POST", "/table/ready", ROB, {ready: true}); await call("POST", "/table/start", ROB);
  now += 10000; await staging.alarm();
  eq((await call("GET", "/table/record", ROB)).status, 409, "the object's record waits for the game to end");
  await call("POST", "/table/end", ROB);
  const got = await call("GET", "/table/record?match=flagstage1g1", ROB);
  eq([got.status, got.json.record.kind, got.json.record.matchId], [200, "full", "flagstage1g1"], "then GET /table/record hands it over");
  eq((await call("GET", "/table/record", EVE)).status, 403, "and to no one without a seat");
}

/* 4. THE FRONT DOOR. */
{
  const seen = [];
  const TABLES = {idFromName: (n) => n, get: () => ({fetch: async (r) => {seen.push([r.method, new URL(r.url).pathname + new URL(r.url).search, r.headers.get("x-crankmagic-email")]); return new Response("{}");}})};
  const who = {email: ROB};
  const go = (method, path) => tables(new Request(`https://crankmagic.test${path}`, {method, ...(method === "POST" ? {body: "{}"} : {})}), {TABLES}, who);
  await go("GET", "/api/tables/tablealpha1/record?match=tablealpha1g2");
  eq(seen.at(-1), ["GET", "/table/record?match=tablealpha1g2", ROB], "GET /api/tables/:id/record reaches the table as the signed-in person, with the match named");
  await go("GET", "/api/tables/tablealpha1/record?match=../../x");
  eq(seen.at(-1)[1], "/table/record", "a match id not in its own shape is dropped, not forwarded");
  eq((await go("POST", "/api/tables/tablealpha1/record")).status, 405, "a record is read with a GET");
  eq((await tables(new Request("https://crankmagic.test/api/tables/tablealpha1/record"), {}, who)).status, 503, "and like every table route it is shut until Play ships");
}

console.log(`table-record: ${checks} checks passed — a finished game's record: the whole game on a playtest table, replayable from its seed and tape; your own seat's view and the public history anywhere else; nothing while the game goes on.`);
