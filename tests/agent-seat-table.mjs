/* THE LLM SEAT AT THE TABLE (AI-2): SEATED ONLY THROUGH THE AI DOOR, ASKED ON THE TABLE'S ALARM, HELD TO ITS GAME'S CAP.
 *
 * cloud/game-room.mjs GameTable, with game/room/agent-brief.mjs and cloud/ai.mjs `pilot`; the model is a stand-in
 * (no network). This suite holds:
 *
 *   1. An AI on Claude is seated only where the door would let the host spend on it: the switch (AI_PILOT), the key, the
 *      caps and the model set, and the host on the allowlist. Otherwise the table is refused, saying so.
 *   2. In play, the table answers the seat's close calls on its alarm, through the model: the request carries no
 *      person's name, the door's model at low effort and the seat's instructions; each call is logged as `pilot` under
 *      the host; and the answers are on the tape, so the game replays without the model.
 *   3. The game's cap holds: past it, the seat's own pilot answers, and the game goes on.
 *   4. An answer that is not the decision's own, or a failed call, is not used: the seat's own pilot answers, and the
 *      call is logged for what it was.
 */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {randomUUID} from "node:crypto";
import {DatabaseSync} from "node:sqlite";
import {GameTable, objectStorage, tableCards} from "../cloud/game-room.mjs";
import {PILOT_SYSTEM} from "../cloud/ai.mjs";
import {replayMatch} from "../game/room/replay.mjs";
import {decksFromBackup, person} from "../tools/fuzz-live.mjs";

let checks = 0;
const ok = (c, m) => {assert.ok(c, m); checks += 1;};
const eq = (a, b, m) => {assert.deepEqual(a, b, m); checks += 1;};

function d1() {
  const db = new DatabaseSync(":memory:");
  for (const f of ["0001_accounts.sql", "0002_ai.sql"]) db.exec(readFileSync(new URL(`../cloud/migrations/${f}`, import.meta.url), "utf8"));
  const statement = (sql, args = []) => ({bind: (...values) => statement(sql, values), first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({results: db.prepare(sql).all(...args), success: true, meta: {}}), run: async () => ({success: true, meta: {changes: Number(db.prepare(sql).run(...args).changes)}})});
  return {raw: db, prepare: (sql) => statement(sql), batch: async () => {throw Error("unused");}};
}
function objectCtx() {
  const map = new Map(), sockets = [], alarms = [];
  return {map, sockets, alarms, storage: {get: async (k) => map.get(k), put: async (k, v) => {map.set(k, v);}, delete: async (k) => map.delete(k),
    list: async ({prefix}) => new Map([...map].filter(([k]) => k.startsWith(prefix)).sort()), setAlarm: async (t) => {alarms.push(t);}, deleteAlarm: async () => {alarms.push(null);}},
  acceptWebSocket: (s, tags) => {s.tags = tags; sockets.push(s);}, getWebSockets: () => sockets, getTags: (s) => s.tags};
}

const ROB = "rob@example.com", EVE = "eve@example.com";
const DB = d1();
DB.raw.prepare("INSERT INTO ai_allowlist (email, added_at, note) VALUES (?, ?, ?)").run(ROB, "2026-10-10T00:00:00Z", "test");
const OPEN = {DB, AI_PILOT: "on", ANTHROPIC_API_KEY: "a-stand-in-key", AI_CAP_PERSON_CENTS: "300", AI_CAP_TOTAL_CENTS: "300", AI_MODEL: "claude-haiku-5-5"};
const backup = JSON.parse(readFileSync(new URL("../data/live-state.json", import.meta.url), "utf8"));
const [robDeck, aiDeck] = decksFromBackup(backup, ["D6 Krenko Goblins", "D2 Chulane Value Loop"]);
let clock = Date.parse("2026-10-10T20:00:00Z");

/* The model, stood in for: what it is sent, and what it answers (`answerWith(body)` -> the {indices, why} it says). */
let sent = [], answerWith = () => ({indices: [0], why: "First."}), status = 200;
const fetchImpl = async (url, init = {}) => {
  if (url !== "https://api.anthropic.com/v1/messages") return new Response("no", {status: 404});
  const body = JSON.parse(init.body);
  sent.push(body);
  if (status !== 200) return new Response(JSON.stringify({error: {type: "api_error"}}), {status});
  return new Response(JSON.stringify({id: "msg", type: "message", model: "claude-haiku-5-5", stop_reason: "end_turn",
    content: [{type: "text", text: JSON.stringify(answerWith(body))}], usage: {input_tokens: 900, output_tokens: 40}}), {status: 200});
};

function objectWith(env) {
  const ctx = objectCtx();
  const table = new GameTable(ctx, env, {now: () => clock, fetchImpl, random: (n) => new Uint8Array(n).map((_, i) => (i * 13 + 7) % 256)});
  const call = async (method, path, email, body) => {
    const r = await table.fetch(new Request(`https://table.internal${path}`, {method, headers: {"content-type": "application/json", "x-crankmagic-email": email}, ...(body !== undefined ? {body: JSON.stringify(body)} : {})}));
    return {status: r.status, json: await r.json()};
  };
  return {ctx, table, call};
}
async function tableWith(env, tableId, {host = ROB, level = "llm"} = {}) {
  const o = objectWith(env);
  const made = await o.call("POST", "/table/create", host, {tableId, hostName: host === ROB ? "Rob" : "Eve", seats: [{kind: "ai", level, name: "Claude"}]});
  return {...o, made};
}

/* A game at the table: Rob at random from what he is offered; the LLM seat on the table's alarm. */
async function playAt(env, tableId) {
  const {ctx, table, call, made} = await tableWith(env, tableId);
  assert.equal(made.status, 201, JSON.stringify(made.json));
  await call("POST", "/table/deck", ROB, {seatId: 0, deck: robDeck});
  await call("POST", "/table/deck", ROB, {seatId: 1, deck: aiDeck});
  await call("POST", "/table/ready", ROB, {ready: true});
  await call("POST", "/table/start", ROB);
  clock += 11000;
  await table.alarm();
  const rob = person(`${tableId}-rob`);
  let room = await table.table.currentRoom(), steps = 0, alarmed = 0, waits = 0;
  const matchId = room.matchId;
  while (room && room.status !== "finished" && steps < 3000) {
    steps += 1;
    if (room.waitingOn === "s1") {
      /* Waiting on the LLM seat, the object sets its alarm for now: its turn is taken there, not in anyone's request. */
      waits += 1;
      ctx.alarms.length = 0;
      await table.schedule();
      if (ctx.alarms.at(-1) !== null && ctx.alarms.at(-1) <= clock) alarmed += 1;
    }
    if (room.waitingOn === "s0") {
      const view = room.view("s0");
      if (view.state.turn > 150) break;
      await room.act("s0", {actionId: randomUUID(), revision: view.revision, ...rob(view.decision, view.state.turn, view)});
    } else await table.alarm();
    room = await table.table.currentRoom() ?? room;
  }
  return {ctx, table, room, matchId, made, alarmed, waits};
}
const pilotCalls = () => DB.raw.prepare("SELECT email, feature, model, outcome, cost_micros, at FROM ai_calls WHERE feature = 'pilot' ORDER BY rowid").all().map((r) => ({...r}));

/* ---- 1. Seated only through the door ---- */
{
  const refused = async (env, host, m) => {
    const {made} = await tableWith(env, `refusedtable${checks}`, {host});
    eq([made.status, /An AI on Claude needs/.test(made.json.error)], [403, true], m);
  };
  await refused({...OPEN, AI_PILOT: undefined}, ROB, "the switch off (AI_PILOT): an AI on Claude is refused, saying why");
  await refused({...OPEN, ANTHROPIC_API_KEY: undefined}, ROB, "no key: refused");
  await refused({...OPEN, AI_CAP_TOTAL_CENTS: undefined}, ROB, "no caps: refused");
  await refused(OPEN, EVE, "a host not on the allowlist: refused");
  eq((await tableWith(OPEN, "evetableplain", {host: EVE, level: "normal"})).made.status, 201, "while a Normal AI is anyone's");
  /* Rob, 2026-10-14: the door open to everyone signed in (AI_EVERYONE): a host Access let in seats one, list or no list. */
  eq((await tableWith({...OPEN, AI_EVERYONE: "on"}, "evetableeveryone", {host: EVE})).made.status, 201, "with AI_EVERYONE on, a host not on the allowlist seats an AI on Claude");
}

/* ---- 2. In play, through the model, on the tape ---- */
{
  sent = []; answerWith = (body) => ({indices: [JSON.parse(body.messages[0].content).housePilotWouldChoose[0] ?? 0], why: "The heuristic is right."});
  const game = await playAt(OPEN, "llmtablea1");
  eq([game.made.json.table.seats[1].level, game.room.status], ["llm", "finished"], `an AI on Claude, seated and played to the end (${game.room.view("s0").state.turn} turns)`);
  ok(sent.length > 0, `its close calls went to the model: ${sent.length} of them`);
  ok(game.waits > 0 && game.alarmed === game.waits, `each time the room waited on the seat, the object's alarm was set for then (${game.alarmed} of ${game.waits})`);
  ok(sent.every((b) => !b.messages[0].content.includes("Rob") && b.model === "claude-haiku-5-5" && b.output_config.effort === "low" && b.system === PILOT_SYSTEM),
    "every request without a person's name, on the door's model at low effort, with the seat's instructions");
  const brief = JSON.parse(sent[0].messages[0].content);
  ok(brief.players.some((p) => p.seat === "you" && Array.isArray(p.hand)) && brief.players.filter((p) => p.hand).length === 1 && brief.decision.options.length > 0,
    "the brief: its own hand alone, the board, and the decision's options");
  /* Its choice may be none: an attack it would not make is `[]` (a game where a person is passed for over the stack,
     `passStack`, reached one). */
  const hints = sent.map((b) => JSON.parse(b.messages[0].content).housePilotWouldChoose);
  ok(hints.every(Array.isArray) && hints.some((h) => h.length > 0), `and every brief carries the house pilot's choice, the hint (${hints.filter((h) => !h.length).length} of ${hints.length} choosing none)`);
  const calls = pilotCalls();
  ok(calls.length === sent.length && calls.every((c) => c.email === ROB && c.outcome === "ok" && c.cost_micros > 0), `each call logged as pilot, under the host, ok (${calls.length})`);
  ok(calls.every((c) => c.at === new Date(clock).toISOString()), `and at the table's clock, not the machine's (${calls[0]?.at})`);
  const replay = await replayMatch({storage: objectStorage(game.ctx.storage), matchId: game.matchId, cards: tableCards});
  const before = sent.length;
  ok(replay.same && sent.length === before, "and the game replays from its tape to the same end without asking the model again");
}

/* ---- 3. The game's cap ---- */
{
  sent = [];
  const game = await playAt({...OPEN, AI_CAP_PILOT_GAME_CENTS: "0.2"}, "llmtableb1");
  const spent = Number(game.ctx.map.get(`pilot-spent/${game.matchId}`)) || 0;
  ok(game.room.status === "finished" && spent > 0 && spent <= 2000 && sent.length >= 1, `at a cap of 0.2 cents the model is asked while it fits (${sent.length} calls, ${spent} micros), then the seat's own pilot answers, to the end`);
}

/* ---- 4. Not the decision's own, or a failure: the seat's own pilot answers ---- */
{
  DB.raw.prepare("DELETE FROM ai_calls").run();
  sent = []; answerWith = () => ({indices: [999], why: "Out of range."});
  const wild = await playAt(OPEN, "llmtablec1");
  ok(wild.room.status === "finished" && pilotCalls().length > 0 && pilotCalls().every((c) => c.outcome === "ungrounded"),
    "an index the decision does not have is not used, and logged as ungrounded; the game goes on to its end");
  DB.raw.prepare("DELETE FROM ai_calls").run();
  sent = []; status = 500;
  const down = await playAt(OPEN, "llmtabled1");
  status = 200;
  ok(down.room.status === "finished" && pilotCalls().length > 0 && pilotCalls().every((c) => c.outcome === "error" && c.cost_micros === 0),
    "a failed call costs nothing, is logged as an error, and the seat's own pilot answers");
}

/* ---- 5. The day's caps, on the table's clock ---- */
{
  DB.raw.prepare("DELETE FROM ai_calls").run();
  DB.raw.prepare("INSERT INTO ai_calls (id, email, feature, model, input_tokens, output_tokens, cost_micros, outcome, at) VALUES ('day', ?, 'coach', 'claude-haiku-5-5', 0, 0, 3000000, 'ok', ?)").run(ROB, new Date(clock - 60e3).toISOString());
  sent = []; answerWith = () => ({indices: [0], why: "First."});
  const capped = await playAt(OPEN, "llmtablee1");
  ok(capped.room.status === "finished" && sent.length === 0 && pilotCalls().length === 0,
    "the host's whole 300 cents spent a minute before the table's clock: the model is not asked, and the seat's own pilot plays to the end");
  DB.raw.prepare("DELETE FROM ai_calls WHERE id = 'day'").run();
}

console.log(`agent-seat-table: ${checks} checks passed — an AI on Claude is seated only through the AI door, its close calls go to the model on the table's alarm with no person's name, logged under the host on the table's clock and held to the game's cap and the day's, and anything it cannot answer the seat's own pilot does.`);
