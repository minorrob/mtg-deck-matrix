/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* THE DECK ADVISOR, THROUGH THE AI DOOR (AI-4 in docs/plan-to-done-2026-09-30.md; cloud/advise.mjs, cloud/ai.mjs `advise`,
 * cloud/worker.mjs POST /api/ai/advise and GET /api/ai-advise), with Rob's own library saved in the cloud and a stand-in
 * for the model (no network):
 *
 *   1. The ask: a deck's id and an optional goal of at most 300 characters; nothing else is read.
 *   2. The library: the head version's backup, opened by the Worker (gzip, base64) and read with the app's own model; the
 *      brief is advise-brief.js's list reading, its candidates the person's own cards and lists only, each card's facts
 *      from the generated catalog (cloud/advise-cards.mjs, which tools/build-advise-cards.mjs --check holds to the data).
 *   3. The door: the allowlist, the advisor's own switch (AI_ADVISE), a POST, the ask's bounds, a library in the cloud and
 *      the deck in it; then the call -- the door's model at low effort, the advisor's instruction (the eval's own) and the
 *      answer's schema -- with the brief built here, never what the browser added, and never who is asking.
 *   4. Grounding: a change is shown only when its card out is in the hundred and not kept and its card in a candidate;
 *      the rest are dropped and counted, logged as ungrounded; an answer with none left is not shown.
 *   5. The caps hold, as for every feature; and GET /api/ai-advise says whether a deck's page may offer the advisor.
 */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {gzipSync} from "node:zlib";
import {DatabaseSync} from "node:sqlite";
import {spawnSync} from "node:child_process";
import {handle} from "../cloud/worker.mjs";
import {forgetKeys} from "../cloud/access.mjs";
import {createLibrary} from "../cloud/library.mjs";
import {readAsk, openVersion, adviseBrief, cardOfFor} from "../cloud/advise.mjs";
import {ADVISE_SYSTEM, ADVISE_MAX_TOKENS, adviseBody, Closed} from "../cloud/ai.mjs";
import * as Advise from "../cloud/advise-brief.mjs";
import {createRequire} from "node:module";
import {MODEL_VERSION, aiSettingsOf, unownedPool} from "../cloud/advise.mjs";
import {ADVISE_FIELDS, ADVISE_CARDS} from "../cloud/advise-cards.mjs";
const require = createRequire(import.meta.url);
const M = require("../collection-model.js"), Catalog = require("../card-catalog.js");

let checks = 0;
const ok = (c, m) => {assert.ok(c, m); checks += 1;};
const eq = (a, b, m) => {assert.deepEqual(a, b, m); checks += 1;};
const ROB = "rob@example.com", STRANGER = "someone@example.com";
const live = JSON.parse(readFileSync(new URL("../data/live-state.json", import.meta.url), "utf8"));
const body = gzipSync(Buffer.from(JSON.stringify(live))).toString("base64");

/* ---- 1. the ask ---- */
{
  eq(readAsk({deckId: "deck:live:D1", ask: "  make it faster  ", brief: {hundred: []}}), {deckId: "deck:live:D1", ask: "make it faster"}, "the ask is the deck's id and the goal, trimmed; nothing else the browser sends");
  for (const [input, why] of [[{deckId: "D1"}, "a deck id that is not one"], [{}, "no deck"], [{deckId: "deck:live:D1", ask: "x".repeat(301)}, "a goal over 300 characters"]]) {
    assert.throws(() => readAsk(input), (e) => e instanceof Closed && e.status === 400, why);
    checks += 1;
  }
}

/* ---- 2. the library and the brief ---- */
const state = await openVersion(body);
const D1 = state.decks.find((d) => d.id === "deck:live:D1");
const brief = adviseBrief(state, D1.id, "more removal");
{
  eq([state.decks.length, D1.name], [7, "D1 Quintorius Spirits"], "the head version's backup, opened here: Rob's seven decks");
  await assert.rejects(openVersion("H4sInotgzip"), (e) => e instanceof Closed && e.status === 502); checks += 1;
  eq([brief.schema, brief.basis, brief.deck.name, brief.constraints.ask, brief.constraints.unowned], ["CrankAdviseBrief@1", "list", D1.name, "more removal", false],
    "the brief is advise-brief.js's list reading of that deck, with the goal, and no cards Rob does not own");
  eq(brief.measure.cards, 100, "its hundred is the deck's");
  const cardOf = cardOfFor(state), quint = cardOf(D1.commanders[0]);
  ok(quint.typeLine.includes("Legendary Creature") && quint.colorIdentity.join("") === "RW" && quint.roles.length > 0 && Number.isFinite(quint.manaValue),
    `each card's facts come from the catalog (${quint.name}: ${quint.typeLine}, ${quint.colorIdentity.join("")}, roles ${quint.roles.join(", ")})`);
  ok(brief.candidates.length > 0 && brief.candidates.every((c) => c.source && !/Not owned/.test(c.source)), `${brief.candidates.length} candidates, every one Rob's own card or on his lists`);
  const text = JSON.stringify(brief);
  ok(!/[\w.+-]+@[\w-]+\.[a-z]/i.test(text) && !/"paid"|pricePaid|"lots"|"lot:/.test(text), "no address, no price paid, no lot");
  assert.throws(() => adviseBrief(state, "deck:not-here", ""), (e) => e instanceof Closed && e.status === 409); checks += 1;
  /* The Worker's brief is the one the eval and the app would build with the whole catalog (data/cards.json). */
  const records = JSON.parse(readFileSync(new URL("../data/cards.json", import.meta.url), "utf8")).cards, byName = new Map(records.map((c) => [Catalog.folded(c.name), c]));
  const full = M.migrate(structuredClone(live.payload.state));
  const fullCardOf = (id) => {const ref = full.cards[id]; if (!ref) return null; const rec = byName.get(Catalog.folded(ref.name)); return rec ? {...rec, ...ref, id, roles: rec.roles || []} : {...ref, roles: []};};
  for (const d of full.decks.filter((x) => !x.archived)) {
    eq(adviseBrief(state, d.id, "more removal"), Advise.buildBrief({state: full, deckId: d.id, cardOf: fullCardOf, ask: "more removal", basis: "list"}), `${d.name}: the Worker's brief, from its slim catalog, is the whole catalog's`);
  }
  eq(MODEL_VERSION, M.VERSION, `the Worker reads a library at the model's own version (${M.VERSION})`);
  const older = gzipSync(Buffer.from(JSON.stringify({...live, payload: {...live.payload, state: {...live.payload.state, schemaVersion: 3}}}))).toString("base64");
  await assert.rejects(openVersion(older), (e) => e instanceof Closed && e.status === 409 && /another version/.test(e.message)); checks += 1;
  const generated = spawnSync(process.execPath, ["tools/build-advise-cards.mjs", "--check"], {cwd: new URL("..", import.meta.url), encoding: "utf8"});
  eq(generated.status, 0, `the catalog the Worker reads is what data/cards.json makes (${(generated.stdout || generated.stderr).trim()})`);
}

/* ---- AI-6: the person's AI Coach settings, read from their library in the cloud ---- */
{
  const withPrefs = (aiCoach) => ({...state, preferences: {...state.preferences, aiCoach}});
  eq(aiSettingsOf(state), {suggestUnowned: false, preferOwned: true, inBracket: true, length: "short", coachSees: "hand"},
    "nothing saved: cards not owned off, own first, inside the bracket, short advice, the Coach sees the hand");
  ok(!adviseBrief(withPrefs({suggestUnowned: false}), D1.id, "").candidates.some((c) => /Not owned/.test(c.source)), "Suggest cards I don't own off: never a card not owned");
  const on = adviseBrief(withPrefs({suggestUnowned: true}), D1.id, ""), notOwned = on.candidates.filter((c) => c.source === "Not owned");
  const records = new Map(JSON.parse(readFileSync(new URL("../data/cards.json", import.meta.url), "utf8")).cards.map((c) => [c.name, c]));
  const held = new Set(Object.values(state.cards).map((c) => c.name)), identity = new Set(on.deck.identity), cap = on.constraints.perCardCap;
  ok(notOwned.length > 0 && on.constraints.unowned === true, `on: cards not owned are candidates (${notOwned.length}, ${notOwned.slice(0, 3).map((c) => c.name).join(", ")})`);
  ok(notOwned.every((c) => {const r = records.get(c.name); return r && !held.has(c.name) && r.legalities?.commander === "legal" && (r.colorIdentity || []).every((x) => identity.has(x)) && (cap === null || c.price === null || c.price <= cap);}),
    "each from the catalog, none in Rob's library, legal in Commander, inside the commander's colors, within the deck's per-card cap");
  const pool = unownedPool(state);
  ok(pool.length > 0 && pool.every((c) => records.get(c.name)?.legalities?.commander === "legal" && !held.has(c.name)),
    `the pool of cards not owned: ${pool.length}, each legal in Commander and none of Rob's`);
  /* Every card in today's catalog is Commander-legal, so a banned one is made here: the table's own row, its legal mark cleared. */
  const legalAt = ADVISE_FIELDS.indexOf("legal"), [sample, row] = Object.entries(ADVISE_CARDS).find(([n]) => !held.has(n));
  eq(unownedPool(state, {[sample]: row, "Banned Card": row.map((v, i) => (i === legalAt ? 0 : v))}).map((c) => c.name), [sample],
    `a card the catalog marks not legal in Commander is never in the pool (${sample} is, its banned twin is not)`);
  /* D5 Shadrix Aristocrats is short of roles that cards Rob does not own fill. */
  const D5 = state.decks.find((d) => d.id === "deck:live:D5"), first = adviseBrief(withPrefs({suggestUnowned: true}), D5.id, "");
  const firstNot = first.candidates.findIndex((c) => c.source === "Not owned"), lastMine = first.candidates.map((c) => c.source !== "Not owned").lastIndexOf(true);
  ok(firstNot > lastMine, `Prefer what I own first: every card of Rob's own before any not owned (his up to ${lastMine}, the first not owned at ${firstNot})`);
  const mixed = adviseBrief(withPrefs({suggestUnowned: true, preferOwned: false}), D5.id, "");
  const mixedFirstNot = mixed.candidates.findIndex((c) => c.source === "Not owned"), mixedLastMine = mixed.candidates.map((c) => c.source !== "Not owned").lastIndexOf(true);
  ok(mixed.candidates.every((c, i, a) => i === 0 || a[i - 1].fills.length >= c.fills.length) && mixedFirstNot < mixedLastMine,
    `off: owned or not, a card filling more short roles first (a card not owned at ${mixedFirstNot}, one of Rob's at ${mixedLastMine})`);
  eq([first.candidates.filter((c) => c.source === "Not owned").length, first.candidates.filter((c) => c.source !== "Not owned").length], [10, 30],
    "cards not owned have ten places of their own, beside his thirty");
  eq([brief.constraints.gameChangers.cap, adviseBrief(withPrefs({inBracket: false}), D1.id, "").constraints.gameChangers.cap], [3, null], "Stay inside the deck's bracket off lifts the game changers' cap");
  eq([brief.constraints.length, adviseBrief(withPrefs({length: "detailed"}), D1.id, "").constraints.length], ["short", "detailed"], "and Advice length is the brief's, short or detailed");
  ok(/constraints\.length is \\?"detailed\\?"/.test(ADVISE_SYSTEM) || ADVISE_SYSTEM.includes('constraints.length is "detailed"'), "which the instruction reads");
}

/* ---- 3-5. the door ---- */
function d1() {
  const db = new DatabaseSync(":memory:");
  for (const f of ["0001_accounts.sql", "0002_ai.sql"]) db.exec(readFileSync(new URL(`../cloud/migrations/${f}`, import.meta.url), "utf8"));
  /* D1 as far as the Worker uses it, batch as one transaction (as tests/cloud-worker.mjs has it): a saved version. */
  const statement = (sql, args = []) => ({bind: (...values) => statement(sql, values), first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({results: db.prepare(sql).all(...args), success: true, meta: {}}), run: async () => ({success: true, meta: {changes: Number(db.prepare(sql).run(...args).changes)}}),
    now: () => ({success: true, meta: {changes: Number(db.prepare(sql).run(...args).changes)}})});
  const batch = async (list) => {db.exec("BEGIN"); try {const out = list.map((s) => s.now()); db.exec("COMMIT"); return out;} catch (e) {db.exec("ROLLBACK"); throw e;}};
  return {raw: db, prepare: (sql) => statement(sql), batch};
}
let clock = Date.parse("2026-10-11T12:00:00Z");
const TEAM = "crankmagic-test.cloudflareaccess.com", AI_AUD = "aud-ai";
const b64url = (buf) => Buffer.from(buf).toString("base64url");
const {publicKey, privateKey} = await crypto.subtle.generateKey({name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256"}, true, ["sign", "verify"]);
const jwk = {...await crypto.subtle.exportKey("jwk", publicKey), kid: "k1"};
async function token(email, aud) {
  const h = b64url(JSON.stringify({alg: "RS256", kid: "k1", typ: "JWT"}));
  const p = b64url(JSON.stringify({aud: [aud], iss: `https://${TEAM}`, email, exp: clock / 1000 + 3600, iat: clock / 1000}));
  return `${h}.${p}.${b64url(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, new TextEncoder().encode(`${h}.${p}`)))}`;
}
let sent = [], answer = null;
const reply = (json, {usage = {input_tokens: 9000, output_tokens: 600}, stop = "end_turn"} = {}) => ({status: 200, json: {id: "msg_1", type: "message", model: "claude-haiku-5-5", stop_reason: stop, content: [{type: "text", text: JSON.stringify(json)}], usage}});
const fetchImpl = async (url, init = {}) => {
  if (url === `https://${TEAM}/cdn-cgi/access/certs`) return new Response(JSON.stringify({keys: [jwk]}));
  if (url === "https://api.anthropic.com/v1/messages") {sent.push(JSON.parse(init.body)); return new Response(JSON.stringify(answer.json), {status: answer.status});}
  return new Response("no", {status: 404});
};
const DB = d1();
const OPEN = {DB, ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: "aud-library", AI_ACCESS_AUD: AI_AUD, ANTHROPIC_API_KEY: "a-stand-in-key", AI_CAP_PERSON_CENTS: "25", AI_CAP_TOTAL_CENTS: "100", AI_MODEL: "claude-haiku-5-5", AI_ADVISE: "on"};
async function ask({env = OPEN, input = {deckId: D1.id, ask: "more removal"}, method = "POST", email = ROB} = {}) {
  const init = {method, headers: {"cf-access-jwt-assertion": await token(email, AI_AUD), "content-type": "application/json", "x-crankmagic": "ai"}};
  if (method !== "GET") init.body = JSON.stringify(input);
  const response = await handle(new Request("https://crankmagic.test/api/ai/advise", init), env, {fetchImpl, now: clock});
  return {status: response.status, json: await response.json().catch(() => null)};
}
const calls = () => DB.raw.prepare("SELECT feature, model, outcome FROM ai_calls ORDER BY rowid").all().map((r) => ({...r}));
forgetKeys();
eq((await ask()).status, 403, "the advisor behind the AI door: not on the allowlist, 403");
DB.raw.prepare("INSERT INTO ai_allowlist (email, added_at, note) VALUES (?, ?, ?)").run(ROB, "2026-10-11T00:00:00Z", "test");
const {AI_ADVISE: _off, ...shut} = OPEN;
eq([(await ask({env: shut})).status, (await ask({env: shut})).json.error], [503, "The deck advisor is not switched on here yet."], "on the list, the advisor's own switch off: 503");
eq((await ask({method: "GET"})).status, 405, "the advisor is a POST");
eq((await ask({input: {deckId: "nope"}})).status, 400, "a deck id that is not one: 400");
const none = await ask();
eq([none.status, /not in the cloud yet/.test(none.json.error)], [409, true], "with no library in the cloud yet, the advisor says to let the device save it");
const library = createLibrary(DB, {now: () => new Date(clock).toISOString()});
const rob = await library.user(ROB);
const head = await library.save(rob.id, {parent: null, revision: 1, device: "Rob's laptop", checksum: "a".repeat(64), body});
eq((await ask({input: {deckId: "deck:made-on-this-device"}})).status, 409, "a deck not yet in the cloud's library: 409, saying to let it save");
eq([sent.length, calls().length], [0, 0], "none of that reached the provider or spent anything");

const outCard = brief.hundred.find((r) => !r.empty && !brief.constraints.keep.includes(r.name)).name, inCard = brief.candidates[0].name;
answer = reply({changes: [{out: outCard, in: inCard, role: "Removal", why: "It answers threats."}], keep: [brief.hundred[0].name], summary: "One swap."});
const good = await ask({input: {deckId: D1.id, ask: "more removal", brief: {candidates: [{name: "Black Lotus"}]}, email: STRANGER}});
eq(good.status, 200, "a grounded answer is shown");
eq([good.json.changes, good.json.dropped, good.json.summary, good.json.model, good.json.savedAt], [[{out: outCard, in: inCard, role: "Removal", why: "It answers threats."}], 0, "One swap.", "claude-haiku-5-5", head.savedAt],
  "its swaps, none dropped, the summary, the model that answered, and when the library it read was saved");
ok(good.json.meter.capCents === 25, "with the person's meter");
const out = sent.at(-1), content = JSON.parse(out.messages[0].content);
eq([out.model, out.max_tokens, out.system[0].text, out.output_config.effort, out.output_config.format.schema], ["claude-haiku-5-5", ADVISE_MAX_TOKENS, ADVISE_SYSTEM, "low", Advise.ANSWER_SCHEMA],
  "the door's model at low effort, with the advisor's instruction and the answer's schema");
eq(content, JSON.parse(JSON.stringify(brief)), "what is sent is the brief built here from Rob's library in the cloud");
ok(!JSON.stringify(out).includes("Black Lotus") && !JSON.stringify(out).includes(ROB) && !JSON.stringify(out).includes(STRANGER), "never anything the browser added, and never who is asking");
eq(calls().at(-1), {feature: "advise", model: "claude-haiku-5-5", outcome: "ok"}, "logged as the advisor's");
const evalRunner = readFileSync(new URL("./ai-advise-eval/run.mjs", import.meta.url), "utf8");
ok(/adviseBody/.test(evalRunner) && !/const SYSTEM = /.test(evalRunner), "the eval asks with the same body (adviseBody), so it measures what is shipped");
eq(adviseBody(brief, "claude-haiku-5-5").system[0].cache_control, {type: "ephemeral"}, "the instruction is the stable prefix, cached");

/* 4. Grounding. */
const kept = brief.constraints.keep[0];
answer = reply({changes: [{out: outCard, in: inCard, role: "Removal", why: "Good."}, {out: outCard, in: "Black Lotus", role: "Ramp", why: "Fast."}, {out: kept, in: inCard, role: "Removal", why: "No."}], keep: [], summary: "Three."});
const part = await ask();
eq([part.status, part.json.changes.length, part.json.dropped, calls().at(-1).outcome], [200, 1, 2, "ungrounded"],
  "a candidate not in the brief and a kept card taken out are dropped and counted; the grounded swap is shown; logged as ungrounded");
answer = reply({changes: [{out: "Sol Ring", in: inCard, role: "Ramp", why: "?"}], keep: [], summary: "?"});
const bad = await ask();
eq([bad.status, /not shown/.test(bad.json.error), calls().at(-1).outcome], [502, true, "ungrounded"], "an answer with no grounded swap left is not shown");
answer = reply({changes: [], keep: [], summary: "No."}, {stop: "refusal"});
eq((await ask()).status, 422, "a refusal is said plainly");

/* 5. The caps, and the page's question. */
DB.raw.prepare("INSERT INTO ai_calls (id, email, feature, model, input_tokens, output_tokens, cost_micros, outcome, at) VALUES ('big', ?, 'coach', 'claude-haiku-5-5', 0, 0, 250000, 'ok', ?)").run(ROB, new Date(clock - 60e3).toISOString());
eq((await ask()).status, 429, "the person's cap holds for the advisor as for every AI feature");
DB.raw.prepare("DELETE FROM ai_calls WHERE id = 'big'").run();
const open = async (env, email = ROB) => {
  const r = await handle(new Request("https://crankmagic.test/api/ai-advise", {headers: {"cf-access-jwt-assertion": await token(email, "aud-library")}}), env, {fetchImpl, now: clock});
  return (await r.json()).open;
};
eq([await open(OPEN), await open(shut), await open(OPEN, STRANGER), await open({...OPEN, ANTHROPIC_API_KEY: ""})], [true, false, false, false],
  "a deck's page may offer the advisor only with its switch on, the door's key and caps set, and the person on the list");
/* AI-6's meter: the person's own spending over the last 24 hours against their cap. */
const meter = async (env, email = ROB) => (await (await handle(new Request("https://crankmagic.test/api/ai-meter", {headers: {"cf-access-jwt-assertion": await token(email, "aud-library")}}), env, {fetchImpl, now: clock})).json());
const spentNow = Number(DB.raw.prepare("SELECT COALESCE(SUM(cost_micros), 0) AS m FROM ai_calls WHERE email = ?").get(ROB).m);
eq([await meter(OPEN), await meter(OPEN, STRANGER), await meter({...OPEN, ANTHROPIC_API_KEY: ""})], [{open: true, spentCents: Math.round(spentNow / 100) / 100, capCents: 25}, {open: false}, {open: false}],
  "the settings' meter: Rob's spending against his 25-cent cap; nothing for someone not on the list, or where the door is shut");

console.log(`advisor: ${checks} checks passed — the deck advisor through the AI door: the brief built from the person's own library in the cloud, the door's model at low effort, grounded swaps only, on the day's caps.`);
