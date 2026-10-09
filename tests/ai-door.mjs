/* THE AI DOOR, shut until Rob opens it, and honest once he does (cloud/ai.mjs, worker.mjs; M6).
 *
 * The same stand-ins as tests/cloud-worker.mjs: both migrations in Node's own SQLite behind a small D1, and real
 * RS256 Access tokens signed with a key made for the run. The AI provider is a stand-in too, one that records what
 * it was sent and answers as the Messages API does -- so nothing here spends, and nothing here needs a key.
 *
 *   Shut     each of Rob's four decisions is a gate that is closed while unset: the AI Access application, the
 *            allowlist, the key, the caps. A library sign-in never opens it.
 *   Sent     only what the request carries, bounded; the key rides only in the provider's header, never back out.
 *   Spent    every call is logged -- who, what, the model that answered, tokens, cost, outcome -- and the caps
 *            are read from that log over a rolling 24 hours, before anything is sent.
 *   Shown    only an answer whose [[card names]] are all cards that were sent.
 */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
import {handle} from "../cloud/worker.mjs";
import {forgetKeys} from "../cloud/access.mjs";
import {costMicros, grounded, readRequest, DEFAULT_MODEL, MODELS, PRICES} from "../cloud/ai.mjs";

let checks = 0;
const ok = (value, message) => {assert.ok(value, message); checks++;};
const eq = (a, b, message) => {assert.deepEqual(a, b, message); checks++;};

function d1() {
  const db = new DatabaseSync(":memory:");
  for (const f of ["0001_accounts.sql", "0002_ai.sql"]) db.exec(readFileSync(new URL(`../cloud/migrations/${f}`, import.meta.url), "utf8"));
  const statement = (sql, args = []) => ({
    bind: (...values) => statement(sql, values),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({results: db.prepare(sql).all(...args), success: true, meta: {}}),
    run: async () => ({success: true, meta: {changes: Number(db.prepare(sql).run(...args).changes)}}),
  });
  return {raw: db, prepare: (sql) => statement(sql), batch: async () => {throw Error("unused");}};
}

const TEAM = "crankmagic-test.cloudflareaccess.com", AUD = "aud-library", AI_AUD = "aud-ai";
const b64url = (buf) => Buffer.from(buf).toString("base64url");
const {publicKey, privateKey} = await crypto.subtle.generateKey({name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256"}, true, ["sign", "verify"]);
const jwk = {...await crypto.subtle.exportKey("jwk", publicKey), kid: "k1"};
let clock = Date.parse("2026-09-26T18:00:00Z");
async function token({aud = AI_AUD, email = "rob@example.com"} = {}) {
  const h = b64url(JSON.stringify({alg: "RS256", kid: "k1", typ: "JWT"}));
  const p = b64url(JSON.stringify({aud: [aud], iss: `https://${TEAM}`, email, exp: clock / 1000 + 3600, iat: clock / 1000}));
  return `${h}.${p}.${b64url(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, new TextEncoder().encode(`${h}.${p}`)))}`;
}

/* The provider: records each request, answers with whatever `answer` says next. */
const KEY = "sk-test-not-a-real-key";
let sent = [], answer = null;
const reply = (explanation, {model = DEFAULT_MODEL, usage = {input_tokens: 900, output_tokens: 300}, stop = "end_turn"} = {}) => ({status: 200, json: {id: "msg_1", type: "message", model, stop_reason: stop, content: [{type: "text", text: JSON.stringify({explanation})}], usage}});
const fetchImpl = async (url, init = {}) => {
  if (url === `https://${TEAM}/cdn-cgi/access/certs`) return new Response(JSON.stringify({keys: [jwk]}));
  if (url === "https://api.anthropic.com/v1/messages") {
    sent.push({headers: init.headers, body: JSON.parse(init.body)});
    if (answer === "hang") throw new DOMException("timed out", "TimeoutError");
    return new Response(JSON.stringify(answer.json), {status: answer.status});
  }
  return new Response("no", {status: 404});
};

const DB = d1();
const OPEN = {DB, ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD, AI_ACCESS_AUD: AI_AUD, ANTHROPIC_API_KEY: KEY, AI_CAP_PERSON_CENTS: "25", AI_CAP_TOTAL_CENTS: "100"};
const DECK = {deck: {name: "Krenko Goblins", commanders: ["Krenko, Mob Boss"], cards: ["Krenko, Mob Boss", "Goblin Chieftain", "Skirk Prospector", "Mountain"]},
  score: {total: 6.5, of: 10, label: "Closes the game"}, measures: [{name: "Win turn", value: "10.8", note: "turn 8 is full marks"}],
  strongest: [{name: "Goblin Chieftain", note: "lands on turn 4 in 81% of games"}], weakest: [{name: "Skirk Prospector", note: "rarely cast"}]};
async function call({env = OPEN, jwt, body = DECK, path = "/api/ai/explain", method = "POST", headers = {}} = {}) {
  const auth = jwt !== undefined ? jwt : await token();
  const init = {method, headers: {...(auth ? {"cf-access-jwt-assertion": auth} : {}), "content-type": "application/json", "x-crankmagic": "ai", ...headers}};
  if (method !== "GET") init.body = typeof body === "string" ? body : JSON.stringify(body);
  const response = await handle(new Request(`https://crankmagic.test${path}`, init), env, {fetchImpl, now: clock});
  const text = await response.text();
  return {status: response.status, text, json: text ? JSON.parse(text) : null};
}
const calls = () => DB.raw.prepare("SELECT email, feature, model, input_tokens, output_tokens, cost_micros, outcome FROM ai_calls ORDER BY rowid").all().map((r) => ({...r}));
const allow = (email) => DB.raw.prepare("INSERT INTO ai_allowlist (email, added_at, note) VALUES (?, ?, ?)").run(email, "2026-09-26T00:00:00Z", "test");
forgetKeys();

/* SHUT: each gate closed while unset, in order, and nothing sent to the provider. */
const {AI_ACCESS_AUD: _a, ...noAud} = OPEN;
eq((await call({env: noAud})).status, 503, "no AI Access application set: the door is shut (503)");
eq((await call({jwt: await token({aud: AUD})})).status, 401, "a library sign-in, which may be the emailed code, does not open it: a token for the library's application is refused");
eq((await call({jwt: null})).status, 401, "no token: 401");
eq((await call()).status, 403, "signed in to the AI application but not on the allowlist: 403");
ok(/not on CrankMagic's list for AI features/.test((await call()).json.error), "and it says so");
allow("rob@example.com");
const {ANTHROPIC_API_KEY: _k, ...noKey} = OPEN;
eq((await call({env: noKey})).status, 503, "on the list, but no key entered: shut");
const {AI_CAP_PERSON_CENTS: _c, ...noCap} = OPEN;
eq((await call({env: noCap})).status, 503, "no spend cap set: shut, never a default that spends");
ok(/no spend cap/.test((await call({env: noCap})).json.error), "and it says the cap is why");
eq((await call({env: {...OPEN, AI_CAP_TOTAL_CENTS: "0"}})).status, 503, "a cap of zero is no cap: shut");
eq((await call({headers: {"x-crankmagic": "sync"}})).status, 403, "a request without the AI header, as a page elsewhere would send: 403");
eq((await call({method: "GET"})).status, 405, "explain is a POST");
eq((await call({path: "/api/ai/elsewhere"})).status, 404, "no other AI endpoint");
eq([sent.length, calls().length], [0, 0], "none of that reached the provider or spent anything");

/* SENT: an answer, and exactly what went out. */
answer = reply("It scores [[6.5]]? No: it wins on turn 10.8 because [[Goblin Chieftain]] lands late.");
let r = await call();
eq(r.status, 502, "an answer naming something that is not a card in the deck is not shown");
ok(/not in this deck/.test(r.json.error), "and it says why");
eq(calls().at(-1).outcome, "ungrounded", "the call is logged as ungrounded, with what it cost");
answer = reply("It wins on turn 10.8: [[Goblin Chieftain]] carries the team, and [[Skirk Prospector]] is rarely cast.");
r = await call();
eq(r.status, 200, "an answer that names only the deck's own cards is shown");
eq([r.json.explanation.includes("turn 10.8"), r.json.cards, r.json.model], [true, ["Goblin Chieftain", "Skirk Prospector"], DEFAULT_MODEL], "the explanation, the cards it named, and the model that answered");
const out = sent.at(-1);
eq([out.headers["x-api-key"], out.headers["anthropic-version"], out.headers["anthropic-beta"]], [KEY, "2023-06-01", undefined], "the key rides only in the provider's header, with the API version and no beta");
eq([out.body.model, "fallbacks" in out.body, out.body.output_config.format.type, out.body.messages.length], ["claude-sonnet-5-5", false, "json_schema", 1], "Claude Sonnet 5.5 unless Rob names another; no server-side fallback, which can re-run a request on a dearer model; the answer as structured output; one message");
const payload = JSON.parse(out.body.messages[0].content);
eq(Object.keys(payload).sort(), ["deck", "measures", "score", "strongest", "weakest"], "what is sent is only the deck, its score and measures, and its strongest and weakest cards");
ok(!JSON.stringify(out.body).includes("rob@example.com"), "and never who is asking");
ok(!r.text.includes(KEY) && !JSON.stringify(calls()).includes(KEY), "the key is in no response and no log row");
eq((await call({env: {...OPEN, AI_MODEL: "claude-haiku-5-5"}}) , sent.at(-1).body.model), "claude-haiku-5-5", "AI_MODEL, when Rob sets it, is the model asked: here Claude Haiku 5.5, the lowest-cost");
/* Rob, 2026-10-09: "We will always be using sonnet or other lowest cost models." */
ok(MODELS.every((m) => PRICES[m] && PRICES[m][0] <= PRICES["claude-sonnet-5-5"][0] && PRICES[m][1] <= PRICES["claude-sonnet-5-5"][1]), `every model the door may call costs no more than Claude Sonnet 5.5 (${MODELS.join(", ")})`);
for (const dearer of ["claude-opus-5-5", "claude-opus-5", "claude-fable-5-1", "some-new-model"]) {
  const asked = sent.length;
  r = await call({env: {...OPEN, AI_MODEL: dearer}});
  eq([r.status, /model CrankMagic does not use/.test(r.json.error), sent.length], [503, true, asked], `AI_MODEL naming ${dearer} keeps the door shut, and nothing is sent`);
}

/* SPENT: the log, the prices, the meter, the caps. */
const last = calls().at(-2);
eq(last, {email: "rob@example.com", feature: "explain", model: DEFAULT_MODEL, input_tokens: 900, output_tokens: 300, cost_micros: 900 * 2 + 300 * 10, outcome: "ok"}, "every call is logged: who, what for, the model, the tokens and the cost at list price ($2 and $10 a million)");
eq(costMicros("claude-haiku-5-5", 900, 300), 90 + 150, "Claude Haiku 5.5 at $0.10 and $0.50 a million");
ok(costMicros("some-new-model", 900, 300) >= costMicros(DEFAULT_MODEL, 900, 300), "a model not in the price list is priced at the dearest rate, so the meter can only read high");
/* A response that itemizes its attempts at two prices, so an attempt priced at the wrong model's rate shows. */
answer = reply("[[Mountain]] is there.", {model: "claude-haiku-5-5", usage: {input_tokens: 1000, output_tokens: 100, iterations: [{type: "message", model: DEFAULT_MODEL, input_tokens: 800, output_tokens: 0}, {type: "message", model: "claude-haiku-5-5", input_tokens: 1000, output_tokens: 100}]}});
r = await call();
eq([r.json.model, calls().at(-1).cost_micros], ["claude-haiku-5-5", costMicros(DEFAULT_MODEL, 800, 0) + costMicros("claude-haiku-5-5", 1000, 100)], "a response that itemizes its attempts names the model that answered and prices each attempt at its own model's rate");
ok(r.json.meter.capCents === 25 && r.json.meter.spentCents > 0, `the answer carries the meter: ${r.json.meter.spentCents}¢ of ${r.json.meter.capCents}¢`);
answer = reply("", {stop: "refusal"});
eq((await call()).status, 422, "a refusal is said plainly, never run again on another model");
eq(calls().at(-1).outcome, "refused", "and logged");
answer = {status: 529, json: {type: "error", error: {type: "overloaded_error", message: "internal account detail"}}};
r = await call();
eq([r.status, /busy/.test(r.json.error), r.text.includes("internal account detail")], [502, true, false], "the provider busy: said plainly, and its own error text is not passed on");
answer = {status: 500, json: {type: "error", error: {type: "api_error", message: "internal account detail"}}};
r = await call();
eq([r.status, /had a problem/.test(r.json.error), r.text.includes("internal account detail")], [502, true, false], "the provider failing: said plainly, and its own error text is not passed on");
answer = "hang";
eq((await call()).status, 504, "the provider not answering in time: 504, nothing spent");
eq(calls().slice(-3).map((c) => [c.outcome, c.cost_micros]), [["error", 0], ["error", 0], ["error", 0]], "all three logged as errors at no cost");

/* The caps, read from the log over a rolling 24 hours, before anything is sent. */
const before = sent.length;
DB.raw.prepare("INSERT INTO ai_calls (id, email, feature, model, input_tokens, output_tokens, cost_micros, outcome, at) VALUES ('big', 'rob@example.com', 'explain', ?, 0, 0, 240000, 'ok', ?)").run(DEFAULT_MODEL, new Date(clock - 3600e3).toISOString());
r = await call();
eq([r.status, sent.length], [429, before], "a call whose worst case would cross the person's cap is refused before anything is sent");
ok(/your AI spend cap/.test(r.json.error), "and says it is the person's cap, and when to come back");
clock += 25 * 3600e3;
answer = reply("[[Mountain]].");
eq((await call()).status, 200, "a day later the rolling window has moved on");
allow("friend@example.com");
DB.raw.prepare("INSERT INTO ai_calls (id, email, feature, model, input_tokens, output_tokens, cost_micros, outcome, at) VALUES ('others', 'someone@example.com', 'explain', ?, 0, 0, 990000, 'ok', ?)").run(DEFAULT_MODEL, new Date(clock - 60e3).toISOString());
r = await call({jwt: await token({email: "friend@example.com"})});
eq([r.status, /CrankMagic has reached its AI spend cap/.test(r.json.error)], [429, true], "everyone's spend together meets the total cap: refused for everyone");

/* The input, bounded. */
eq((await call({body: "x".repeat(70 * 1024)})).status, 413, "a request larger than a score explanation needs is refused before anything is sent");
eq((await call({body: "{not json"})).status, 400, "and one that is not JSON");
clock += 25 * 3600e3;
eq((await call({body: {deck: {cards: []}, score: {total: 5}}})).status, 400, "a deck with no cards is refused");
eq((await call({body: {deck: DECK.deck}})).status, 400, "and one with no score");
const read = readRequest({...DECK, strongest: [{name: "Black Lotus", note: "not in the deck"}], deck: {...DECK.deck, cards: [...DECK.deck.cards, "  Mountain  ", "x".repeat(500)]}, extra: "never sent"});
eq([read.strongest, read.deck.cards.length, read.deck.cards.at(-1).length, "extra" in read], [[], 5, 200, false], "cards outside the deck are dropped, names are trimmed and de-duplicated and cut to length, and nothing else rides along");
eq(grounded("[[mountain]] and [[Goblin Chieftain]]", DECK.deck.cards).ok, true, "a card name is matched without regard to case");

console.log(`ai-door: ${checks} checks passed — shut at every gate until Rob opens it; sends only the deck and its score; logs and caps every cent; shows only answers grounded in the deck.`);
