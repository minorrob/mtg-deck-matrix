/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* RESOLVE ALL (Rob, 2026-10-09: "#2. Yes, resolve all."; game/room/room.mjs `resolveAll` and `triggerRun`;
 * crankmagic-board.js).
 *
 * Krenko, Mob Boss with Intruder Alarm (D6) is a legal infinite combo. In G1's 1,400 games two boards reached thousands
 * of Goblins and a stack of thousands of one trigger, and each was a pass for the person, a question and a save, so the
 * game stalled as a real table would. Now a run of identical triggers is let resolve with one decision:
 *
 *   Run       the run is the entries from the top of the stack that are the same trigger: the same ability of the same
 *             source, controlled by one player, with the same targets. One alone, a spell or an ability, or a trigger
 *             still choosing its targets, is no run.
 *   Offered   with a run on top, the person's priority question has Resolve all N, saying whose triggers. A game that
 *             did not ask for it (one made before it) offers nothing new.
 *   Taken     one answer, and the room passes for the person through that run only: each trigger resolves, the person
 *             is asked nothing until the run is gone, and the history says it once.
 *   Answered  a question each trigger of the run asks ("you may") is the person's to answer once: the room answers the
 *             same question the same way for the rest of the run, yes or no (Rob: "Yes to all").
 *   Bounded   anything else on top -- another player's ability -- and the person is asked again, the shortcut gone; and
 *             no more passes than the run held when it was chosen.
 *   Kept      a room woken from storage in the middle of a run goes on the same way, and the game replays from its
 *             seed and tape to the same game.
 *   Board     the strip draws Resolve all beside the pass, and its click sends that option; the stack shows the run as one
 *             line, ×N.
 *
 * Two lands stand in for the cards, so a board is built in two turns: Alarm Field ("Whenever another creature enters,
 * you gain 1 life.", Soul Warden's ability) and Goblin Den ("{T}: Create three 1/1 red Goblin creature tokens.",
 * Krenko's effect). The board half needs Playwright and Chromium; GEOMETRY_REQUIRED=1 (CI) makes a missing browser a
 * failure.
 */
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {readFileSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {memoryStorage} from "../game/engine/storage.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {startRoom, openRoom, basicCards, triggerRun, questionKey} from "../game/room/room.mjs";
import {replayMatch} from "../game/room/replay.mjs";
import {GameTable} from "../cloud/game-room.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let checks = 0;
const ok = (c, m) => {assert.ok(c, m); checks += 1;};
const eq = (a, b, m) => {assert.deepEqual(a, b, m); checks += 1;};

const land = (name, ability) => {
  const {definition, problems} = compileScript({schema: "CrankCardScript@1", source: "hand", oracleText: ability.text, abilities: [ability],
    identity: {name, oracleId: `test-${name}`, types: ["Land"], subtypes: [], manaCost: "", colors: [], colorIdentity: [], power: null, toughness: null}});
  assert.ok(definition, `${name} compiles: ${problems}`);
  return definition;
};
const DEFS = new Map([
  ["Alarm Field", land("Alarm Field", {kind: "triggered", text: "Whenever another creature enters, you gain 1 life.",
    trigger: {on: "enters", who: "another", filter: {what: "permanent", types: ["Creature"]}}, effects: [{effect: "gainLife", amount: 1}]})],
  /* Quest for the Goblin Lord's kind of question, once per trigger: "you may". */
  ["Quest Field", land("Quest Field", {kind: "triggered", text: "Whenever another creature enters, you may gain 1 life.", optional: true,
    trigger: {on: "enters", who: "another", filter: {what: "permanent", types: ["Creature"]}}, effects: [{effect: "gainLife", amount: 1}]})],
  ["Goblin Den", land("Goblin Den", {kind: "activated", text: "{T}: Create three 1/1 red Goblin creature tokens.", cost: [{atom: "{T}"}],
    effects: [{effect: "createToken", count: 3, token: {name: "Goblin", types: ["Creature"], subtypes: ["Goblin"], colors: ["R"], power: 1, toughness: 1}}]})],
  ["Rob General", {types: ["Creature"], supertypes: ["Legendary"], power: 2, toughness: 2, manaCost: "{5}{R}"}],
  ["Maya General", {types: ["Creature"], supertypes: ["Legendary"], power: 2, toughness: 2, manaCost: "{5}{G}"}],
]);
const cards = (name) => basicCards(name) ?? (DEFS.has(name) ? structuredClone(DEFS.get(name)) : null);
/* Rob's deck is the two lands; Maya's, Forests and Goblin Dens (at the board, Forests only), so every Alarm Field
   trigger is Rob's. */
const deck = (who, lands = who === "Rob" ? ["Alarm Field", "Goblin Den"] : ["Forest", "Goblin Den"]) => ({commander: [`${who} General`], cards: [...Array(40)].map((_, i) => lands[i % lands.length])});
const WANTS = {Rob: ["Alarm Field", "Goblin Den"], Maya: ["Goblin Den"]};

/* 1. THE RUN, read off a stack. */
{
  const t = (stackId, over = {}) => ({stackId, abilityId: "a1", objectId: null, cardId: 7, name: "Alarm Field", faceDown: false, playerId: 0, kind: "trigger", stage: "waiting", targets: [], ...over});
  eq(triggerRun([]), null, "an empty stack is no run");
  eq(triggerRun([t(1)]), null, "nor is one trigger");
  eq(triggerRun([t(1), t(2), t(3)])?.n, 3, "three of the same trigger are a run of three");
  eq(triggerRun([t(1, {name: "Other", cardId: 9}), t(2), t(3)])?.n, 2, "counted from the top, as far as the same trigger goes");
  eq(triggerRun([t(1), t(2), t(3, {name: "Other", cardId: 9})]), null, "something else on top: no run");
  eq(triggerRun([t(1), t(2, {playerId: 1})]), null, "the same card's trigger for another player is not the same");
  eq(triggerRun([t(1), t(2, {abilityId: "a2"})]), null, "nor another ability of the same card");
  eq(triggerRun([t(1, {targets: [{kind: "player", id: 1}]}), t(2, {targets: [{kind: "player", id: 0}]})]), null, "nor the same trigger aimed elsewhere");
  eq(triggerRun([t(1, {kind: "ability"}), t(2, {kind: "ability"})]), null, "activated abilities are not triggers");
  eq(triggerRun([t(1), t(2, {stage: "targeting"})]), null, "nor is a trigger still choosing its targets");
  /* The same question, for an answer carried through the run: its words, its mode and limits, each option's words and card. */
  const q = (over = {}, options = [{index: 0, label: "Yes"}, {index: 1, label: "No"}]) => ({id: `c-${Math.random()}`, title: "You may gain 1 life.", mode: "one", min: 1, max: 1, options, ...over});
  eq(questionKey(q()), questionKey(q()), "a question asked again in other words of id only is the same question");
  ok(questionKey(q({title: "You may draw a card."})) !== questionKey(q()), "other words are another question");
  ok(questionKey(q({mode: "many", max: 2})) !== questionKey(q()), "so is another mode or limit");
  ok(questionKey(q({}, [{index: 0, label: "Yes"}])) !== questionKey(q()), "or other options");
  ok(questionKey(q({}, [{index: 0, label: "Goblin", cardId: 4}])) !== questionKey(q({}, [{index: 0, label: "Goblin", cardId: 5}])), "or an option naming another card of the same name");
}

/* What one seat is asked, answered by a rule, until `until` says stop: each seat plays the lands it wants, in order, a
   land a turn, and otherwise passes. */
const keepOrDraw = (d) => (d.options.find((o) => /^Keep|^Draw/i.test(o.label)) || d.options[0]).index;
const onField = (view, seat, name) => (view.state.players[seat].zones.Battlefield.cards ?? []).some((c) => c.name === name);
function plays(view, d) {
  const me = view.state.players[view.seat], want = (WANTS[me.name] ?? []).find((name) => !onField(view, view.seat, name));
  const landOf = want && !me.landsPlayed && d.options.find((o) => o.act === "play-land" && o.label === want);
  return (landOf || d.options.find((o) => o.act === "pass")).index;
}
async function answer(room, who, indices) {
  const view = room.view(who);
  return room.act(who, {actionId: randomUUID(), revision: view.revision, kind: "answer", choiceId: view.decision.id, indices});
}
/* Until a seat is asked with a run on the stack, or `until`. */
async function walk(room, until) {
  for (let n = 0; n < 3000; n += 1) {
    const who = room.waitingOn;
    if (!who) return null;
    const view = room.view(who), d = view.decision;
    if (until(view)) return view;
    const index = d.kind === "priority" ? plays(view, d) : d.mode === "order" ? null : keepOrDraw(d);
    await answer(room, who, index === null ? d.options.map((o) => o.index) : [index]);
  }
  throw new Error("the walk did not end");
}
const life = (view, seat) => view.state.players[seat].life;
const denOption = (view) => view.decision?.kind === "priority" && view.state.stack.length === 0 && view.decision.options.find((o) => o.act === "activate" && o.label === "Goblin Den");

/* 2. THE ROOM: Rob and Maya, both people, each with an Alarm Field and a Goblin Den. */
const pod = (resolveAll, field) => ({passEmpty: true, ...(resolveAll ? {resolveAll: true} : {}), seats: [{seatId: "rob", name: "Rob", pilot: "human", ...deck("Rob", [field, "Goblin Den"])}, {seatId: "maya", name: "Maya", pilot: "human", ...deck("Maya")}]});
async function untilRobsDen(storage, resolveAll, field = "Alarm Field") {
  WANTS.Rob = [field, "Goblin Den"];
  const room = await startRoom({storage, matchId: "resolve", cards, seed: "resolve-all-1", pod: pod(resolveAll, field)});
  /* Both lands down for each, and then Rob's turn with the stack empty: he makes three Goblins. */
  const ready = await walk(room, (v) => v.seatId === "rob" && v.state.turnPlayerId === v.seat && denOption(v) && onField(v, 0, field) && onField(v, 1, "Goblin Den"));
  ok(ready, `Rob, on his turn, can tap Goblin Den, his ${field} down and Maya's Goblin Den too`);
  await answer(room, "rob", [denOption(ready).index]);
  /* Maya lets it resolve; three Goblins enter, and Rob's Alarm Field triggers three times: he orders them. */
  const asked = await walk(room, (v) => v.decision.mode === "order");
  eq([asked.seatId, asked.decision.options.length], ["rob", 3], `three Goblins enter, and Rob orders his three ${field} triggers`);
  await answer(room, "rob", asked.decision.options.map((o) => o.index));
  return room;
}
{
  /* An older game, without the beat: the same moment asks as before. */
  const plain = await untilRobsDen(memoryStorage(), false);
  const v = plain.view(plain.waitingOn);
  ok(v.seatId === "rob" && v.decision.kind === "priority" && v.state.stack.length === 3, "without the beat: Rob has priority with his three Alarm Field triggers on the stack");
  ok(!v.decision.options.some((o) => o.act === "resolve-all"), "and nothing new is offered: a game made before Resolve all replays as it was played");
}
const storage = memoryStorage();
let room = await untilRobsDen(storage, true);
{
  const v = room.view("rob"), d = v.decision;
  eq([v.state.stack.length, triggerRun(v.state.stack)?.n], [3, 3], "Rob's three Alarm Field triggers are on the stack, a run of three");
  const all = d.options.find((o) => o.act === "resolve-all");
  ok(d.kind === "priority" && all, "and Rob, with priority, is offered Resolve all");
  eq([all.label, all.count, all.detail, all.index], ["Resolve all 3", 3, "Alarm Field triggers", d.options.length - 1], "Resolve all 3, Alarm Field's triggers, after every other option, so the others keep their numbers");
  ok(!("cardId" in all), "it is no card's option");
  const before = life(v, 0), tape = room.fingerprint().tape;
  await answer(room, "rob", [all.index]);
  /* Maya is asked about each (she chose nothing); Rob is not. */
  const maya = room.view("maya");
  eq([room.waitingOn, maya.state.stack.length], ["maya", 3], "Rob answered once; Maya, still a person, is asked about the first");
  ok(room.history.some((h) => h.text === "Rob let 3 Alarm Field triggers resolve"), "the history says it once");
  /* Woken from storage between two of them, as a Durable Object evicted mid-run is. */
  room = await openRoom({storage, matchId: "resolve", cards});
  let robAsked = 0, mayaAsked = 0;
  for (let n = 0; n < 20 && room.view(room.waitingOn ?? "rob").state.stack.length; n += 1) {
    const who = room.waitingOn, w = room.view(who);
    if (who === "rob") {robAsked += 1; break;}
    mayaAsked += 1;
    await answer(room, "maya", [w.decision.options.find((o) => o.act === "pass").index]);
  }
  const after = room.view("rob");
  eq([robAsked, mayaAsked, after.state.stack.length, life(after, 0) - before], [0, 3, 0, 3], "woken mid-run, the room goes on as it was: Maya passed each of the three, Rob was asked about none, and he gained 3 life");
  eq(room.fingerprint().tape - tape, 4, "the tape holds Rob's one answer and Maya's three");
}

/* 3. BOUNDED: Maya puts something else on top in the middle, and Rob is asked again. */
{
  const s2 = memoryStorage(), r2 = await untilRobsDen(s2, true);
  const v = r2.view("rob");
  await answer(r2, "rob", [v.decision.options.find((o) => o.act === "resolve-all").index]);
  const m = r2.view("maya"), den = m.decision.options.find((o) => o.act === "activate" && o.label === "Goblin Den");
  ok(den, "Maya, asked about the first, can tap her own Goblin Den in response");
  await answer(r2, "maya", [den.index]);
  /* Maya holds priority after her own ability; she passes it, and it is Rob's question again, with her ability on top. */
  const again = await walk(r2, (w) => w.seatId === "rob");
  eq([again.state.stack.at(-1).kind, again.state.stack.at(-1).name, again.decision.kind], ["ability", "Goblin Den", "priority"], "with Maya's ability on top, Rob is asked again: the shortcut covered his run only");
  ok(!again.decision.options.some((o) => o.act === "resolve-all"), "and an ability on top is no run, so nothing like it is offered");
  await answer(r2, "rob", [again.decision.options.find((o) => o.act === "pass").index]);
  /* Her three Goblins enter, and Rob's Alarm Field triggers three more times. */
  const order = await walk(r2, (w) => w.decision.mode === "order");
  await answer(r2, "rob", order.decision.options.map((o) => o.index));
  const next = await walk(r2, (w) => w.decision.kind === "priority" && w.seatId === "rob");
  eq([next.state.stack.length, triggerRun(next.state.stack)?.n], [6, 6], "her Goblins enter, and Rob's Alarm Field triggers three more times, on top of his three she answered: a run of six");
  eq(next.decision.options.find((o) => o.act === "resolve-all")?.label, "Resolve all 6", "Rob is offered Resolve all 6, his to choose again");
  ok((await replayMatch({storage: s2, matchId: "resolve", cards})).same, "and this game replays from its seed and tape to the same game");
}
ok((await replayMatch({storage, matchId: "resolve", cards})).same, "the game woken mid-run replays from its seed and tape to the same game");

/* 3b. NO MORE PASSES THAN WERE THERE: the room keeps how many are left with its record, so a run that grew while it
   resolved could never keep a person passing for good. With none left, Rob is asked about the next one again. */
{
  const s3 = memoryStorage(), r3 = await untilRobsDen(s3, true);
  await answer(r3, "rob", [r3.view("rob").decision.options.find((o) => o.act === "resolve-all").index]);
  const record = JSON.parse(await s3.get("room/resolve"));
  eq(record.standing, {0: {key: record.standing[0]?.key, left: 2, answers: {}}}, "taken for three, the room holds two more passes for Rob, saved with its record (and, so far, no answers to carry)");
  record.standing[0].left = 0;
  await s3.put("room/resolve", JSON.stringify(record));
  const r4 = await openRoom({storage: s3, matchId: "resolve", cards});
  await answer(r4, "maya", [r4.view("maya").decision.options.find((o) => o.act === "pass").index]);
  const v = r4.view(r4.waitingOn);
  eq([v.seatId, v.state.stack.length, v.decision.options.find((o) => o.act === "resolve-all")?.label], ["rob", 2, "Resolve all 2"], "with none left, Rob is asked about the next of the run, and offered Resolve all for the two still there");
}

/* 3c. THE SAME ANSWER FOR THE SAME QUESTION (Rob, 2026-10-09: "Yes to all"). Quest Field's triggers each ask Rob
   "you may gain 1 life": in the run he let resolve, he answers the first, and the room answers the rest his way. */
async function questRun(yes) {
  const s5 = memoryStorage(), r5 = await untilRobsDen(s5, true, "Quest Field");
  const v = r5.view("rob"), before = life(v, 0);
  eq(v.decision.options.find((o) => o.act === "resolve-all")?.label, "Resolve all 3", "Quest Field's three triggers are a run, offered Resolve all 3");
  await answer(r5, "rob", [v.decision.options.find((o) => o.act === "resolve-all").index]);
  const asks = [];
  for (let n = 0; n < 40 && r5.waitingOn && r5.view(r5.waitingOn).state.stack.length; n += 1) {
    const who = r5.waitingOn, d = r5.view(who).decision;
    if (who === "maya") {await answer(r5, "maya", [d.options.find((o) => o.act === "pass").index]); continue;}
    asks.push(d);
    if (d.kind === "priority") break;
    const pick = d.options.find((o) => (yes ? /^yes/i : /^no/i).test(o.label)) ?? d.options[yes ? 0 : 1];
    await answer(r5, "rob", [pick.index]);
  }
  return {asks, gained: life(r5.view("rob"), 0) - before, left: r5.view("rob").state.stack.length, same: (await replayMatch({storage: s5, matchId: "resolve", cards})).same};
}
{
  const yes = await questRun(true);
  eq([yes.asks.length, yes.asks[0]?.forRun, /you may gain 1 life/i.test(yes.asks[0]?.title ?? ""), yes.gained, yes.left], [1, true, true, 3, 0],
    "Rob is asked \"you may gain 1 life\" once, told his answer goes for the run; he says yes, and all three resolve: 3 life");
  ok(yes.same, "and the game replays from its seed and tape, the room's answers with it");
  const no = await questRun(false);
  eq([no.asks.length, no.gained, no.left], [1, 0, 0], "no is carried the same way: asked once, no life gained, the run gone");
}
/* 4. THE BOARD: Rob against an AI seat; his priority with a run of Quest Field's triggers on the stack, in the browser. */
WANTS.Rob = ["Quest Field", "Goblin Den"];
const ROB = "rob@example.com";
let clock = Date.parse("2026-10-09T18:00:00Z");
const map = new Map(), sockets = [];
const ctx = {storage: {get: async (k) => map.get(k), put: async (k, v) => {map.set(k, v);}, delete: async (k) => map.delete(k),
  list: async ({prefix}) => new Map([...map].filter(([k]) => k.startsWith(prefix)).sort()), setAlarm: async () => {}, deleteAlarm: async () => {}},
acceptWebSocket: (s, tags) => {s.tags = tags; sockets.push(s);}, getWebSockets: () => sockets.filter((s) => !s.closed), getTags: (s) => s.tags};
const table = new GameTable(ctx, {}, {cards, now: () => clock});
const TABLE = "resolveall01";
let queue = Promise.resolve();
const serial = (fn) => (queue = queue.then(fn, fn));
const callAt = (p, body) => serial(async () => (await table.fetch(new Request(`https://table.internal${p}`, {method: body === undefined ? "GET" : "POST", headers: {"content-type": "application/json", "x-crankmagic-email": ROB}, ...(body !== undefined ? {body: JSON.stringify(body)} : {})}))).json());
await callAt("/table/create", {tableId: TABLE, hostName: "Rob", seats: [{kind: "ai", name: "Maya"}]});
await callAt("/table/deck", {seatId: 0, deck: {name: "Rob's deck", ...deck("Rob", ["Quest Field", "Goblin Den"])}});
await callAt("/table/deck", {seatId: 1, deck: {name: "Maya's deck", ...deck("Maya", ["Forest"])}});
await callAt("/table/ready", {ready: true});
await callAt("/table/start", {});
clock += 10000; await serial(() => table.alarm());
let latest = null;
function connect(onFrame) {
  const server = {tags: null, closed: false, send(f) {if (!this.closed) onFrame(f);}, close() {this.closed = true;}};
  return serial(async () => {
    table.socketPair = () => [{}, server];
    table.upgraded = () => ({status: 101});
    await table.fetch(new Request("https://table.internal/connect", {headers: {upgrade: "websocket", "x-crankmagic-email": ROB}}));
  }).then(() => server);
}
const node = await connect((f) => {const x = JSON.parse(f); if (x.view) latest = x.view;});
const send = (v, indices) => serial(() => table.webSocketMessage(node, JSON.stringify({type: "act", actionId: randomUUID(), revision: v.revision, kind: "answer", choiceId: v.decision.id, indices})));
/* The table plays the AI seat in slices on its alarm: wake it until Rob is asked. */
async function asked() {
  for (let i = 0; i < 200 && latest && !latest.decision && latest.status !== "finished"; i += 1) {clock += 1000; await serial(() => table.alarm());}
  return latest;
}
for (let i = 0; i < 3000; i += 1) {
  const v = await asked(), d = v.decision;
  if (triggerRun(v.state.stack) && d.kind === "priority") break;
  if (d.mode === "order") {await send(v, d.options.map((o) => o.index)); continue;}
  if (d.kind !== "priority") {await send(v, [keepOrDraw(d)]); continue;}
  const den = onField(v, v.seat, "Quest Field") && onField(v, v.seat, "Goblin Den") && denOption(v);
  await send(v, [den ? den.index : plays(v, d)]);
}
ok(triggerRun(latest.state.stack)?.n === 3 && latest.decision?.options.some((o) => o.act === "resolve-all"), "at the table: Rob has priority with his three Quest Field triggers on the stack, and Resolve all is offered");
const lifeBefore = latest.state.players[0].life;

const {openBrowser} = await import("./uat/browser-runner.mjs");
const {browser, base, stub, close} = await openBrowser({name: "room-resolve-all", flag: "GEOMETRY_REQUIRED"});
if (!browser) {console.log(`room-resolve-all: ${checks} checks passed (the board's half skipped: no browser)`); process.exit(0);}
const html = readFileSync(path.join(ROOT, "index.html"), "utf8").replace("</head>", '<meta name="crankmagic-accounts" content="on"><meta name="crankmagic-play" content="cloud"></head>');
async function api(route) {
  const req = route.request(), url = new URL(req.url()), method = req.method();
  const m = /^\/api\/tables\/([a-z0-9]+)(?:\/([a-z]+))?$/.exec(url.pathname);
  if (!m || m[1] !== TABLE) return route.fulfill({status: 404, json: {error: "No such endpoint."}});
  const r = await serial(() => table.fetch(new Request(`https://table.internal${m[2] ? `/table/${m[2]}` : "/table"}${url.search}`, {method, headers: {"content-type": "application/json", "x-crankmagic-email": ROB}, ...(method === "GET" ? {} : {body: req.postData() || "{}"})})));
  return route.fulfill({status: r.status, contentType: "application/json", body: await r.text()});
}
function carry(ws) {
  const server = {tags: null, closed: false, send(f) {if (!this.closed) {const x = JSON.parse(f); if (x.view) latest = x.view; ws.send(f);}}, close() {this.closed = true;}};
  serial(async () => {
    table.socketPair = () => [{}, server];
    table.upgraded = () => ({status: 101});
    await table.fetch(new Request("https://table.internal/connect", {headers: {upgrade: "websocket", "x-crankmagic-email": ROB}}));
  });
  ws.onMessage((message) => serial(() => table.webSocketMessage(server, message)));
  ws.onClose(() => {server.closed = true;});
}
try {
  const context = await browser.newContext({viewport: {width: 1400, height: 900}, serviceWorkers: "block"});
  const page = await context.newPage();
  if (stub) await stub(page);
  await page.route(`${base}/index.html*`, (r) => r.fulfill({contentType: "text/html; charset=utf-8", body: html}));
  await page.route(`${base}/api/me`, (r) => r.fulfill({json: {email: ROB}}));
  await page.route(`${base}/api/library**`, (r) => r.fulfill({json: {head: null}}));
  await page.route(`${base}/api/tables**`, api);
  await page.routeWebSocket(/\/api\/tables\/[a-z0-9]+\/connect$/, carry);
  await page.goto("about:blank");
  await page.goto(`${base}/index.html#table?id=${TABLE}`);
  const button = page.locator(".cm-board-strip [data-action=board-resolve-all]");
  await button.waitFor({timeout: 60000});
  eq((await button.textContent()).trim(), "Resolve all 3", "the strip draws Resolve all 3 beside the pass");
  const pass = page.locator(".cm-board-strip [data-action=board-pass]");
  eq((await pass.textContent()).trim(), "Resolve Quest Field", "and the pass still says it resolves the one on top");
  ok(await page.evaluate(() => {const a = document.querySelector(".cm-board-strip [data-action=board-pass]"), b = document.querySelector(".cm-board-strip [data-action=board-resolve-all]"); return !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);}), "Resolve all comes right after the pass");
  const line = page.locator(".cm-board-stack li").first();
  eq([await page.locator(".cm-board-stack li").count(), (await line.textContent()).replace(/\s+/g, " ").trim().startsWith("Quest Field ×3")], [1, true], "the stack shows the run as one line, Quest Field ×3");
  /* "You can also" is for what else there is to do; Resolve all is beside the pass, not in it. */
  const others = latest.decision.options.filter((o) => o.act !== "pass" && o.act !== "resolve-all").length;
  eq(await page.locator(".cm-board-strip [data-action=board-also]").count() > 0, others > 0, `You can also shows only for what else there is (${others} other options): Resolve all is not counted in it`);
  if (await page.locator("[data-action=board-also]").count()) {
    await page.click("[data-action=board-also]");
    eq(await page.locator(".cm-board-also [data-action=board-option]", {hasText: "Resolve all"}).count(), 0, "and it is not listed again under You can also");
    await page.click("[data-action=board-also]");
  }
  await button.click();
  await page.waitForFunction(() => !document.querySelector(".cm-board-strip [data-action=board-resolve-all]"), null, {timeout: 20000});
  /* The first trigger asks "you may": the board says the answer goes for the run; one Yes, and the room answers the rest. */
  const note = page.locator("#cm-board-decision .cm-board-for-run");
  await note.waitFor({timeout: 20000});
  ok(/your answer goes for this same question each time the run asks it/.test(await note.textContent()), "the first of the run's questions says the answer goes for the rest of the run");
  await page.locator("#cm-board-decision [data-action=board-option]", {hasText: /^Yes/}).first().click();
  for (let i = 0; i < 200 && latest.state.stack.length; i += 1) {clock += 1000; await serial(() => table.alarm()); await page.waitForTimeout(20);}
  eq([latest.state.stack.length, latest.state.players[0].life - lifeBefore, latest.decision?.title ?? ""].map((x, i) => (i === 2 ? /you may/.test(x) : x)), [0, 3, false], "two clicks in all: Resolve all, then one Yes; the three resolve, Rob gains 3 life, and he is asked no more");
  await context.close();
} finally {
  await close();
}

console.log(`room-resolve-all: ${checks} checks passed — a run of identical triggers on top of the stack is let resolve with one decision, through that run only, its same question answered once, kept across a wake and replayed; the board offers it beside the pass, shows the run as one line, and says the answer goes for the run.`);
process.exit(0);
