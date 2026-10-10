/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* THE COACH (X13; AI-1 in docs/plan-to-done-2026-09-30.md; game/room/coach-brief.mjs, cloud/ai.mjs `coach`,
 * cloud/worker.mjs, cloud/game-room.mjs `GET /table/brief`).
 *
 *   Brief     what the Coach may see (Rob, 2026-10-09): the person's own hand, with what each card can do now; the
 *             board as everyone sees it; their deck as a sorted list and the library's count. Never another seat's
 *             hand, a face-down card that is not theirs, or the library's order -- not even a top card a look showed.
 *   Table     the brief is built by the table, from the asking seat's own view, for the Worker alone: a person with no
 *             seat there is refused, and the front door forwards no such path.
 *   Door      POST /api/ai/coach behind the AI door's gates, then its own switch (AI_COACH, until the privacy page
 *             names it); the question bounded; what is sent is the table's brief and the question, never anything the
 *             browser adds, with the brevity instruction ("one to three at most, and aim for one") on Haiku 5.5.
 *   Grounded  an answer naming a card, a play, an id or a seat that is not in the brief -- a card in the other seat's
 *             hand, say -- is not shown, and is logged as ungrounded; a grounded one is shown, logged and metered.
 *   Board     the Coach panel asks the route from the table, shows the answer with its cards in bold, Show me lights
 *             them on the board, Why? opens each play's reason, and signed out of the AI door it offers the sign-in.
 *             This half needs Playwright and Chromium; GEOMETRY_REQUIRED=1 (CI) makes a missing browser a failure.
 */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {randomUUID} from "node:crypto";
import {DatabaseSync} from "node:sqlite";
import {handle} from "../cloud/worker.mjs";
import {forgetKeys} from "../cloud/access.mjs";
import {tables} from "../cloud/tables.mjs";
import {GameTable} from "../cloud/game-room.mjs";
import {basicCards} from "../game/room/room.mjs";
import {coachBrief, COACH_BRIEF_SCHEMA} from "../game/room/coach-brief.mjs";
import {COACH_SYSTEM, COACH_MAX_TOKENS} from "../cloud/ai.mjs";

let checks = 0;
const ok = (c, m) => {assert.ok(c, m); checks += 1;};
const eq = (a, b, m) => {assert.deepEqual(a, b, m); checks += 1;};

/* 1. THE BRIEF, from a view made by hand: a looked-at top card is the board's to show, never the Coach's. */
{
  const zone = (cards = [], count = cards.length) => ({count, hiddenCount: count - cards.length, cards});
  const card = (cardId, name, extra = {}) => ({cardId, name, faceDown: false, tapped: false, counters: {}, types: ["Creature"], power: 2, toughness: 2, keywords: [], commander: false, ...extra});
  const player = (playerId, name, zones) => ({playerId, name, life: 40, health: {life: 40, poison: 0, status: "active", commanderDamageMax: 0}, zones});
  const view = {seat: 0, decision: {title: "Your priority", kind: "priority", options: [{index: 0, label: "Pass priority", act: "pass"}, {index: 1, label: "Bolt", act: "cast", cardId: 3, detail: "→ Maya"}]},
    history: [{turn: 3, text: "Maya played a Forest"}],
    state: {turn: 3, phase: "main1", turnPlayerId: 0, priorityPlayerId: 0, stack: [], players: [
      player(0, "Rob", {Hand: zone([card(3, "Bolt", {types: ["Instant"]})]), Library: zone([card(9, "Top Secret")], 50), Battlefield: zone([card(4, "Bear", {tapped: true})]), Graveyard: zone(), Exile: zone(), Command: zone([card(1, "Rob General", {commander: true})])}),
      player(1, "Maya", {Hand: zone([], 7), Library: zone([], 60), Battlefield: zone([card(5, null, {faceDown: true, types: []})]), Graveyard: zone([card(6, "Opt")]), Exile: zone(), Command: zone()}),
    ]}};
  const brief = coachBrief(view, {name: "Rob's deck", commander: ["Rob General"], cards: ["Mountain", "Bear", "Bolt", "Mountain", "Top Secret"]});
  const text = JSON.stringify(brief);
  eq([brief.schema, brief.you, brief.turnOf, brief.priority], [COACH_BRIEF_SCHEMA, "Rob", "Rob", "Rob"], "the brief is Rob's: his name, whose turn it is, who has priority");
  eq(brief.hand, [{id: 3, name: "Bolt", now: ["Bolt → Maya"]}], "his hand, each card with what it can do now");
  eq(brief.players[1].hand, 7, "Maya's hand is a count, nothing more");
  eq(brief.players[0].library, 50, "his library is a count");
  ok(!text.includes("Top Secret\"") || brief.deck.cards.includes("Top Secret"), "the top card a look showed him is not in the brief as his library's top");
  ok(!brief.players[0].battlefield.some((c) => c.id === 9) && !text.includes('"id":9'), "and no id of any library card is in it");
  eq(brief.deck.cards, ["Bear", "Bolt", "2 Mountain", "Rob General", "Top Secret"], "his deck as a list, sorted by name and counted: what it holds, never its order");
  const shuffled = structuredClone(view);
  shuffled.state.players[0].zones.Library = zone([card(12, "Mountain"), card(9, "Top Secret")], 50);
  eq(coachBrief(shuffled, {name: "Rob's deck", commander: ["Rob General"], cards: ["Top Secret", "Mountain", "Bolt", "Bear", "Mountain"]}), brief, "a library in another order, its top shown or not, and the deck listed in another order give the same brief");
  eq(brief.players[1].battlefield[0].name, "a face-down permanent", "Maya's face-down permanent is just that");
  eq([brief.players[1].graveyard, brief.history], [[{id: 6, name: "Opt"}], ["Turn 3: Maya played a Forest"]], "the public zones and the history's lines");
}

/* 2. A REAL TABLE: Rob against an AI seat, Maya, each deck's cards named for its seat so nothing of Maya's can hide. */
const DEFS = new Map([["Rob General", {types: ["Creature"], supertypes: ["Legendary"], power: 2, toughness: 2, manaCost: "{5}{R}"}],
  ["Maya General", {types: ["Creature"], supertypes: ["Legendary"], power: 2, toughness: 2, manaCost: "{5}{G}"}]]);
/* Maya's Bears cost seven, so the AI seat keeps them in its hand, where Rob must not see them. */
for (const who of ["Rob", "Maya"]) for (let i = 0; i < 20; i += 1) DEFS.set(`${who} Bear ${i}`, {types: ["Creature"], power: 2, toughness: 2, manaCost: who === "Maya" ? "{7}" : "{1}"});
const cards = (name) => basicCards(name) ?? DEFS.get(name) ?? null;
const deck = (who, land) => ({name: `${who}'s deck`, commander: [`${who} General`], cards: [...Array(40)].map((_, i) => (i % 2 ? land : `${who} Bear ${i >> 1}`))});
const ROB = "rob@example.com", STRANGER = "someone@example.com";
let clock = Date.parse("2026-10-09T18:00:00Z");
const map = new Map(), sockets = [];
const ctx = {storage: {get: async (k) => map.get(k), put: async (k, v) => {map.set(k, v);}, delete: async (k) => map.delete(k),
  list: async ({prefix}) => new Map([...map].filter(([k]) => k.startsWith(prefix)).sort()), setAlarm: async () => {}, deleteAlarm: async () => {}},
acceptWebSocket: (s, tags) => {s.tags = tags; sockets.push(s);}, getWebSockets: () => sockets.filter((s) => !s.closed), getTags: (s) => s.tags};
const table = new GameTable(ctx, {}, {cards, now: () => clock});
const TABLE = "coachtable01";
let queue = Promise.resolve();
const serial = (fn) => (queue = queue.then(fn, fn));
const at = (p, {email = ROB, body} = {}) => serial(async () => {
  const r = await table.fetch(new Request(`https://table.internal${p}`, {method: body === undefined ? "GET" : "POST", headers: {"content-type": "application/json", "x-crankmagic-email": email}, ...(body !== undefined ? {body: JSON.stringify(body)} : {})}));
  return {status: r.status, json: await r.json()};
});
await at("/table/create", {body: {tableId: TABLE, hostName: "Rob", seats: [{kind: "ai", name: "Maya"}]}});
await at("/table/deck", {body: {seatId: 0, deck: deck("Rob", "Mountain")}});
await at("/table/deck", {body: {seatId: 1, deck: deck("Maya", "Forest")}});
await at("/table/ready", {body: {ready: true}});
await at("/table/start", {body: {}});
eq((await at("/table/brief")).status, 409, "before the game is on, there is no brief: 409");
clock += 10000; await serial(() => table.alarm());
let latest = null;
const server = {tags: null, closed: false, send(f) {if (!this.closed) {const x = JSON.parse(f); if (x.view) latest = x.view;}}, close() {this.closed = true;}};
await serial(async () => {table.socketPair = () => [{}, server]; table.upgraded = () => ({status: 101}); await table.fetch(new Request("https://table.internal/connect", {headers: {upgrade: "websocket", "x-crankmagic-email": ROB}}));});
const send = (v, indices) => serial(() => table.webSocketMessage(server, JSON.stringify({type: "act", actionId: randomUUID(), revision: v.revision, kind: "answer", choiceId: v.decision.id, indices})));
/* Rob keeps, draws, plays a land a turn and passes, until turn 5. */
for (let i = 0; i < 3000 && latest && latest.status !== "finished" && latest.state.turn < 5; i += 1) {
  if (!latest.decision) {clock += 1000; await serial(() => table.alarm()); continue;}
  const d = latest.decision, me = latest.state.players[latest.seat];
  const land = d.kind === "priority" && !me.landsPlayed && d.options.find((o) => o.act === "play-land");
  const indices = d.kind === "priority" ? [(land || d.options.find((o) => o.act === "pass")).index]
    : d.mode === "ack" ? [] : d.mode === "many" ? d.options.slice(0, d.min).map((o) => o.index) : d.mode === "order" ? d.options.map((o) => o.index)
    : [(d.options.find((o) => /^Keep|^Draw|^No\b|^Don't/i.test(o.label)) || d.options[0]).index];
  await send(latest, indices);
}
ok(latest.state.turn >= 5, `the game is on: turn ${latest.state.turn}`);
const asked = await at("/table/brief");
eq(asked.status, 200, "Rob, seated, gets his brief from the table");
const brief = asked.json.brief, briefText = JSON.stringify(brief);
const robView = latest, robHand = robView.state.players[robView.seat].zones.Hand.cards.map((c) => c.name);
eq(brief.hand.map((c) => c.name).sort(), [...robHand].sort(), "his hand, as his own view shows it");
const mayaView = (await serial(async () => {const r = await table.load(); return r.view("s1");}));
/* Maya's own Bears, each named once in her deck, that are in her hand and nowhere Rob can see. */
const seen = new Set(robView.state.players.flatMap((p) => Object.values(p.zones).flatMap((z) => (z.cards ?? []).map((c) => c.name))).concat(robView.state.stack.map((e) => e.name)));
const mayaHand = mayaView.state.players[1].zones.Hand.cards.map((c) => c.name).filter((n) => /^Maya Bear/.test(n) && !seen.has(n));
ok(mayaHand.length > 0 && mayaHand.every((n) => !briefText.includes(`"${n}"`)), `none of the ${mayaHand.length} Bears in Maya's hand is named anywhere in Rob's brief`);
eq([brief.deck.cards.length, brief.deck.cards[0], brief.deck.library], [22, "20 Mountain", robView.state.players[robView.seat].zones.Library.count], "his deck as a sorted, counted list, and his library's count");
eq((await at("/table/brief", {email: STRANGER})).status, 403, "someone without a seat at the table gets no brief");
const front = await tables(new Request(`https://crankmagic.test/api/tables/${TABLE}/brief`), {TABLES: {idFromName: (n) => n, get: () => ({fetch: () => new Response("{}")})}}, {email: ROB});
eq(front.status, 404, "and the front door forwards no such path: the brief is the Worker's AI door's alone");

/* 3. THE DOOR: POST /api/ai/coach, through the AI door's gates, with the table bound as TABLES. */
function d1() {
  const db = new DatabaseSync(":memory:");
  for (const f of ["0001_accounts.sql", "0002_ai.sql"]) db.exec(readFileSync(new URL(`../cloud/migrations/${f}`, import.meta.url), "utf8"));
  const statement = (sql, args = []) => ({bind: (...values) => statement(sql, values), first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({results: db.prepare(sql).all(...args), success: true, meta: {}}), run: async () => ({success: true, meta: {changes: Number(db.prepare(sql).run(...args).changes)}})});
  return {raw: db, prepare: (sql) => statement(sql), batch: async () => {throw Error("unused");}};
}
const TEAM = "crankmagic-test.cloudflareaccess.com", AI_AUD = "aud-ai";
const b64url = (buf) => Buffer.from(buf).toString("base64url");
const {publicKey, privateKey} = await crypto.subtle.generateKey({name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256"}, true, ["sign", "verify"]);
const jwk = {...await crypto.subtle.exportKey("jwk", publicKey), kid: "k1"};
async function token(email = ROB) {
  const h = b64url(JSON.stringify({alg: "RS256", kid: "k1", typ: "JWT"}));
  const p = b64url(JSON.stringify({aud: [AI_AUD], iss: `https://${TEAM}`, email, exp: clock / 1000 + 3600, iat: clock / 1000}));
  return `${h}.${p}.${b64url(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, new TextEncoder().encode(`${h}.${p}`)))}`;
}
let sent = [], answer = null;
const reply = (body, {usage = {input_tokens: 1800, output_tokens: 120}, stop = "end_turn"} = {}) => ({status: 200, json: {id: "msg_1", type: "message", model: "claude-haiku-5-5", stop_reason: stop, content: [{type: "text", text: JSON.stringify(body)}], usage}});
const fetchImpl = async (url, init = {}) => {
  if (url === `https://${TEAM}/cdn-cgi/access/certs`) return new Response(JSON.stringify({keys: [jwk]}));
  if (url === "https://api.anthropic.com/v1/messages") {sent.push({headers: init.headers, body: JSON.parse(init.body)}); return new Response(JSON.stringify(answer.json), {status: answer.status});}
  return new Response("no", {status: 404});
};
const DB = d1();
const TABLES = {idFromName: (n) => n, get: (name) => ({fetch: (req) => (name === TABLE ? serial(() => table.fetch(req)) : Promise.resolve(new Response(JSON.stringify({error: "There is no such table."}), {status: 404})))})};
const OPEN = {DB, TABLES, ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: "aud-library", AI_ACCESS_AUD: AI_AUD, ANTHROPIC_API_KEY: "a-stand-in-key", AI_CAP_PERSON_CENTS: "25", AI_CAP_TOTAL_CENTS: "100", AI_MODEL: "claude-haiku-5-5", AI_COACH: "on"};
async function ask({env = OPEN, body = {tableId: TABLE, question: "What's my best play?"}, method = "POST", path = "/api/ai/coach", email = ROB} = {}) {
  const init = {method, headers: {"cf-access-jwt-assertion": await token(email), "content-type": "application/json", "x-crankmagic": "ai"}};
  if (method !== "GET") init.body = JSON.stringify(body);
  const response = await handle(new Request(`https://crankmagic.test${path}`, init), env, {fetchImpl, now: clock});
  const text = await response.text();
  return {status: response.status, json: text ? JSON.parse(text) : null, location: response.headers.get("location")};
}
const calls = () => DB.raw.prepare("SELECT feature, model, outcome FROM ai_calls ORDER BY rowid").all().map((r) => ({...r}));
forgetKeys();
eq((await ask()).status, 403, "the Coach behind the AI door: not on the allowlist, 403");
DB.raw.prepare("INSERT INTO ai_allowlist (email, added_at, note) VALUES (?, ?, ?)").run(ROB, "2026-10-09T00:00:00Z", "test");
const {AI_COACH: _off, ...shut} = OPEN;
const off = await ask({env: shut});
eq([off.status, off.json.error], [503, "The Coach is not switched on here yet."], "on the list, but the Coach's own switch off -- until the privacy page names what it sends: 503");
eq((await ask({method: "GET"})).json.error, "The Coach is a POST.", "the Coach is a POST");
eq((await ask({body: {tableId: "no", question: "Hi"}})).status, 400, "a table that is no table's id: 400");
eq((await ask({body: {tableId: TABLE, question: "  "}})).status, 400, "no question: 400");
eq((await ask({body: {tableId: TABLE, question: "x".repeat(301)}})).status, 400, "a question longer than 300 characters: 400");
eq((await ask({body: {tableId: "othertable99", question: "Hi"}})).status, 404, "another table's refusal is passed on as the table said it");
eq([sent.length, calls().length], [0, 0], "none of that reached the provider or spent anything");

const handCard = brief.hand[0];
answer = reply({answer: `Play [[${handCard.name}]].`, plays: [{card: handCard.name, action: "Cast", why: "It is your only play."}], show: [handCard.id]});
const good = await ask({body: {tableId: TABLE, question: "What's my best play?", brief: {hand: [{id: 999, name: "Black Lotus"}]}}});
eq(good.status, 200, "a grounded answer is shown");
eq([good.json.answer, good.json.plays, good.json.show, good.json.model], [`Play [[${handCard.name}]].`, [{card: handCard.name, action: "Cast", why: "It is your only play."}], [handCard.id], "claude-haiku-5-5"], "the answer, its plays, what to highlight, and the model that answered");
ok(good.json.meter.capCents === 25 && good.json.meter.spentCents >= 0, "with the person's meter");
const out = sent.at(-1).body, content = JSON.parse(out.messages[0].content);
eq([out.model, out.max_tokens, out.system, out.output_config.effort, out.output_config.format.type], ["claude-haiku-5-5", COACH_MAX_TOKENS, COACH_SYSTEM, "low", "json_schema"], "Haiku 5.5, at low effort, with the Coach's instruction and its schema");
ok(/one to three at most, and aim for one/.test(out.system) && /never guess/.test(out.system), "the instruction is the brevity control (one to three sentences, aiming for one) and says it sees no other hand or library order");
eq([content.question, content.game.you, content.game.hand.map((c) => c.name).sort()], ["What's my best play?", "Rob", [...robHand].sort()], "what is sent is the question and the table's own brief");
ok(!JSON.stringify(out).includes("Black Lotus") && !JSON.stringify(out).includes(ROB), "never anything the browser added, and never who is asking");
eq(calls().at(-1), {feature: "coach", model: "claude-haiku-5-5", outcome: "ok"}, "logged as the Coach's, with its model");

for (const [bad, why] of [
  [{answer: "Cast [[Black Lotus]].", plays: [], show: []}, "a card in no zone and no deck"],
  [{answer: `Cast [[${mayaHand[0]}]].`, plays: [], show: []}, "a card in Maya's hidden hand"],
  [{answer: "Pass.", plays: [{card: "Sol Ring", action: "Cast", why: "Ramp."}], show: []}, "a play with a card not in the brief"],
  [{answer: "Pass.", plays: [], show: [123456]}, "an id to highlight that is not in the brief"],
  [{answer: "Pass.", plays: [], show: [], threat: {seat: "Nobody", why: "?"}}, "a threat that is no seat"],
]) {
  answer = reply(bad);
  const r = await ask();
  eq([r.status, /not on your table or in your deck/.test(r.json.error), calls().at(-1).outcome], [502, true, "ungrounded"], `an answer naming ${why} is not shown, and is logged as ungrounded`);
}
answer = reply({answer: "Hold.", plays: [], show: [], threat: {seat: "Maya", why: "She has the most creatures."}});
eq((await ask()).json.threat, {seat: "Maya", why: "She has the most creatures."}, "a threat named by a seat at the table is shown");
answer = reply({answer: "Hold.", plays: [], show: []}, {stop: "refusal"});
eq((await ask()).status, 422, "a refusal is said plainly");
const stranger = await ask({email: STRANGER});
eq(stranger.status, 403, "a stranger, not on the list, is refused before the table is asked");
DB.raw.prepare("INSERT INTO ai_calls (id, email, feature, model, input_tokens, output_tokens, cost_micros, outcome, at) VALUES ('big', ?, 'coach', 'claude-haiku-5-5', 0, 0, 250000, 'ok', ?)").run(ROB, new Date(clock - 60e3).toISOString());
eq((await ask()).status, 429, "the person's cap holds for the Coach as for every AI feature");
DB.raw.prepare("DELETE FROM ai_calls WHERE id = 'big'").run();
/* THE COACH'S OWN DAILY CAP, for everyone together (Rob, 2026-10-10: "$1.50 for the coach per day is good"): another
   feature's spending does not count toward it, and the Coach's own does -- here a cap of 2 cents. */
const capped = {...OPEN, AI_CAP_COACH_CENTS: "2"};
DB.raw.prepare("INSERT INTO ai_calls (id, email, feature, model, input_tokens, output_tokens, cost_micros, outcome, at) VALUES ('expl', 'someone-else@example.com', 'explain', 'claude-haiku-5-5', 0, 0, 30000, 'ok', ?)").run(new Date(clock - 60e3).toISOString());
answer = reply({answer: "Hold.", plays: [], show: []});
eq((await ask({env: capped})).status, 200, "another feature's 3 cents count nothing toward the Coach's cap of 2");
/* Someone else's Coach calls bring the Coach's day to 1.95 cents: under the cap, but this call's worst case (its whole
   output allowance alone is 0.06 cents) would pass it, so it is refused before a cent is spent. */
const coachSoFar = Number(DB.raw.prepare("SELECT COALESCE(SUM(cost_micros), 0) AS micros FROM ai_calls WHERE feature = 'coach'").get().micros);
ok(coachSoFar < 19500, `the Coach's calls so far (${coachSoFar} micros) leave room under its cap`);
DB.raw.prepare("INSERT INTO ai_calls (id, email, feature, model, input_tokens, output_tokens, cost_micros, outcome, at) VALUES ('mate', 'someone-else@example.com', 'coach', 'claude-haiku-5-5', 0, 0, ?, 'ok', ?)").run(19500 - coachSoFar, new Date(clock - 60e3).toISOString());
const full = await ask({env: capped});
eq([full.status, full.json.error], [429, "The Coach has reached its spend cap for the last 24 hours. Try again tomorrow."], "the Coach's own spending, anyone's, with this call's worst case would pass its cap: the Coach is refused, saying so");
DB.raw.prepare("DELETE FROM ai_calls WHERE id IN ('expl', 'mate')").run();
const login = await ask({method: "GET", path: `/api/ai/login?to=${encodeURIComponent(`#table?id=${TABLE}`)}`});
eq([login.status, login.location], [302, `https://crankmagic.test/#table?id=${TABLE}`], "signed in to the AI door, back to the table");
eq((await ask({method: "GET", path: "/api/ai/login?to=https://elsewhere.example"})).location, "https://crankmagic.test/", "and never anywhere else");

/* 4. THE BOARD: Rob's Coach panel asks the real route (the door above, the provider a stand-in) from his table. */
const now = (await at("/table/brief")).json.brief, mine = now.hand[0];
const {openBrowser} = await import("./uat/browser-runner.mjs");
const {browser, base, stub, close} = await openBrowser({name: "coach", flag: "GEOMETRY_REQUIRED"});
if (!browser) {console.log(`coach: ${checks} checks passed (the board's half skipped: no browser)`); process.exit(0);}
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8").replace("</head>", '<meta name="crankmagic-accounts" content="on"><meta name="crankmagic-play" content="cloud"></head>');
let door = "open";
async function tablesRoute(route) {
  const req = route.request(), url = new URL(req.url()), method = req.method();
  const m = /^\/api\/tables\/([a-z0-9]+)(?:\/([a-z]+))?$/.exec(url.pathname);
  if (!m || m[1] !== TABLE) return route.fulfill({status: 404, json: {error: "No such endpoint."}});
  const r = await serial(() => table.fetch(new Request(`https://table.internal${m[2] ? `/table/${m[2]}` : "/table"}${url.search}`, {method, headers: {"content-type": "application/json", "x-crankmagic-email": ROB}, ...(method === "GET" ? {} : {body: req.postData() || "{}"})})));
  return route.fulfill({status: r.status, contentType: "application/json", body: await r.text()});
}
function carry(ws) {
  const peer = {tags: null, closed: false, send(f) {if (!this.closed) ws.send(f);}, close() {this.closed = true;}};
  serial(async () => {table.socketPair = () => [{}, peer]; table.upgraded = () => ({status: 101}); await table.fetch(new Request("https://table.internal/connect", {headers: {upgrade: "websocket", "x-crankmagic-email": ROB}}));});
  ws.onMessage((message) => serial(() => table.webSocketMessage(peer, message)));
  ws.onClose(() => {peer.closed = true;});
}
try {
  const context = await browser.newContext({viewport: {width: 1400, height: 900}, serviceWorkers: "block"});
  const page = await context.newPage();
  if (stub) await stub(page);
  await page.route(`${base}/index.html*`, (r) => r.fulfill({contentType: "text/html; charset=utf-8", body: html}));
  await page.route(`${base}/api/me`, (r) => r.fulfill({json: {email: ROB}}));
  await page.route(`${base}/api/library**`, (r) => r.fulfill({json: {head: null}}));
  await page.route(`${base}/api/tables**`, tablesRoute);
  await page.routeWebSocket(/\/api\/tables\/[a-z0-9]+\/connect$/, carry);
  /* The AI door, as the Worker answers it: signed in to it, or not yet (Access's 401). */
  const posted = [];
  await page.route(`${base}/api/ai/coach`, async (route) => {
    posted.push(JSON.parse(route.request().postData() || "null"));
    if (door === "signed out") return route.fulfill({status: 401, json: {error: "Sign in to CrankMagic's AI features to use them."}});
    const res = await handle(new Request("https://crankmagic.test/api/ai/coach", {method: "POST", headers: {"cf-access-jwt-assertion": await token(), "content-type": "application/json", "x-crankmagic": "ai"}, body: route.request().postData()}), OPEN, {fetchImpl, now: clock});
    return route.fulfill({status: res.status, contentType: "application/json", body: await res.text()});
  });
  await page.goto("about:blank");
  await page.goto(`${base}/index.html#table?id=${TABLE}`);
  await page.locator("#cm-board .cm-board-strip").waitFor({timeout: 60000});
  await page.click(".cm-board-coach-open");
  answer = reply({answer: `Play [[${mine.name}]].`, plays: [{card: mine.name, action: "Cast", why: "It is the one card you can use now."}], show: [mine.id]});
  await page.click("[data-action=board-coach-ask][data-q=\"What's my best play?\"]");
  const said = page.locator(".cm-coach-msg.is-coach:not(.is-typing) .cm-coach-said").last();
  await said.waitFor({timeout: 20000});
  eq([(await said.locator("p").textContent()).trim(), await said.locator("p b").textContent()], [`Play ${mine.name}.`, mine.name], "the Coach's answer, the card it names in bold and its brackets gone");
  await said.locator("[data-action=board-coach-show]").click();
  ok(await page.locator(`.cm-bcard.is-coach-shown[data-card="${mine.id}"]`).count() >= 1, "Show me lights the card it names, on the board");
  await said.locator("[data-action=board-coach-why]").click();
  ok(/It is the one card you can use now/.test(await page.locator(".cm-coach-why").last().textContent()), "Why? opens the play's one-sentence reason");
  eq(JSON.parse(sent.at(-1).body.messages[0].content).question, "What's my best play?", "the question went through the door, with the table's brief");
  eq(posted.at(-1), {tableId: TABLE, question: "What's my best play?"}, "the board sends the table and the question, nothing more: the table says what is on it");
  door = "signed out";
  await page.click("[data-action=board-coach-ask][data-q=\"Who's the threat?\"]");
  const link = page.locator(".cm-coach-msg.is-coach .cm-coach-chips a").last();
  await link.waitFor({timeout: 20000});
  eq(await link.getAttribute("href"), `/api/ai/login?to=${encodeURIComponent(`#table?id=${TABLE}`)}`, "signed out of the AI door: a link to sign in, which comes back to this table");
  await context.close();
} finally {
  await close();
}

console.log(`coach: ${checks} checks passed — the Coach sees only Rob's hand, the board and his deck as a list; the table builds that brief for the AI door alone; it asks Haiku 5.5 in one to three sentences, aiming for one; and an answer naming anything not in the brief is not shown.`);
process.exit(0);
