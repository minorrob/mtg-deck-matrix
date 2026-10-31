/* THE OWNER'S AI MODEL (ROB-338; cloud/ai-model.mjs, cloud/worker.mjs; docs/program/admin-pane-contract.md).
 *
 * The same stand-ins as tests/ai-door.mjs: the real migrations in Node's SQLite behind a small D1, real RS256 Access tokens,
 * and a stand-in for Anthropic's API that answers both the Messages API and the models list. Nothing here is the real API.
 *
 *   Owner only   General, an Insider, a service token and a request with no token are refused on every route of the model
 *                setting, with the reason, before the database or the models API is touched
 *   The list     what the models API reports for this key (across pages); a model is selectable only if it is listed AND in
 *                MODELS (Rob, 2026-10-09: Sonnet or cheaper); an unlisted or unallowed model is refused and nothing is stored
 *   Stored       a change is stored, read back, outlives the environment that was in force, and is the model of the NEXT AI call
 *   Undo         one press back to the previous model; a second press puts the change back; with nothing to go back to, refused
 *   Fail closed  a list that does not load changes nothing; a stored model outside MODELS keeps the AI door shut; a database
 *                without the table falls back to AI_MODEL
 */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
import {handle} from "../cloud/worker.mjs";
import {forgetKeys} from "../cloud/access.mjs";
import {DEFAULT_MODEL, MODELS, settings} from "../cloud/ai.mjs";

let checks = 0;
const ok = (value, message) => {assert.ok(value, message); checks++;};
const eq = (a, b, message) => {assert.deepEqual(a, b, message); checks++;};

function d1(migrations) {
  const db = new DatabaseSync(":memory:");
  for (const f of migrations) db.exec(readFileSync(new URL(`../cloud/migrations/${f}`, import.meta.url), "utf8"));
  const statement = (sql, args = []) => ({
    bind: (...values) => statement(sql, values),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({results: db.prepare(sql).all(...args), success: true, meta: {}}),
    run: async () => ({success: true, meta: {changes: Number(db.prepare(sql).run(...args).changes)}}),
  });
  return {raw: db, prepare: (sql) => statement(sql), batch: async () => {throw Error("unused");}};
}

const TEAM = "crankmagic-test.cloudflareaccess.com", AUD = "aud-library", AI_AUD = "aud-ai";
const OWNER = "owner@example.com", INSIDER = "insider@example.com", GENERAL = "general@example.com";
const b64url = (buf) => Buffer.from(buf).toString("base64url");
const {publicKey, privateKey} = await crypto.subtle.generateKey({name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256"}, true, ["sign", "verify"]);
const jwk = {...await crypto.subtle.exportKey("jwk", publicKey), kid: "k1"};
const clock = Date.parse("2026-10-31T18:00:00Z");
async function token({aud = AUD, email = OWNER, ...more} = {}) {
  const h = b64url(JSON.stringify({alg: "RS256", kid: "k1", typ: "JWT"}));
  const p = b64url(JSON.stringify({aud: [aud], iss: `https://${TEAM}`, ...(email === null ? {} : {email}), ...more, exp: clock / 1000 + 3600, iat: clock / 1000}));
  return `${h}.${p}.${b64url(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, new TextEncoder().encode(`${h}.${p}`)))}`;
}

/* The stand-in for Anthropic: the models list (in pages, or failing) and the Messages API, each recorded. */
const KEY = "sk-test-not-a-real-key";
let listCalls = [], messages = [], listing = "ok";
const PAGE1 = {data: [{id: "claude-sonnet-5-5", display_name: "Claude Sonnet 5.5", type: "model"}, {id: "claude-opus-5", display_name: "Claude Opus 5", type: "model"}], has_more: true, last_id: "claude-opus-5"};
const PAGE2 = {data: [{id: "claude-haiku-5-5", display_name: "Claude Haiku 5.5", type: "model"}, {id: "claude-mystery-1", display_name: "Claude Mystery", type: "model"}], has_more: false, last_id: "claude-mystery-1"};
const fetchImpl = async (url, init = {}) => {
  const u = new URL(String(url));
  if (url === `https://${TEAM}/cdn-cgi/access/certs`) return new Response(JSON.stringify({keys: [jwk]}));
  if (u.origin + u.pathname === "https://api.anthropic.com/v1/models") {
    listCalls.push({url: String(url), headers: init.headers});
    if (listing === "down") throw new TypeError("network down");
    if (listing === "error") return new Response(JSON.stringify({error: {message: "account details here"}}), {status: 500});
    if (listing === "only-haiku") return new Response(JSON.stringify({data: [PAGE2.data[0]], has_more: false}));
    return new Response(JSON.stringify(u.searchParams.get("after_id") ? PAGE2 : PAGE1));
  }
  if (url === "https://api.anthropic.com/v1/messages") {
    const body = JSON.parse(init.body);
    messages.push(body);
    return new Response(JSON.stringify({id: "msg_1", type: "message", model: body.model, stop_reason: "end_turn", content: [{type: "text", text: JSON.stringify({explanation: "[[Mountain]] is there."})}], usage: {input_tokens: 900, output_tokens: 300}}));
  }
  return new Response("no", {status: 404});
};

const MIGRATIONS = ["0001_accounts.sql", "0002_ai.sql", "0012_ai_settings.sql"];
let DB = d1(MIGRATIONS);
const base = (extra = {}) => ({DB, ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD, AI_ACCESS_AUD: AI_AUD, ANTHROPIC_API_KEY: KEY, AI_CAP_PERSON_CENTS: "25", AI_CAP_TOTAL_CENTS: "100", OWNER_EMAIL: "Owner@Example.com", ...extra});
async function call(path, {env = base(), jwt, method = "GET", body, headers = {}} = {}) {
  const auth = jwt !== undefined ? jwt : await token();
  const init = {method, headers: {...(auth ? {"cf-access-jwt-assertion": auth} : {}), ...(method !== "GET" ? {"content-type": "application/json", "x-crankmagic": "sync"} : {}), ...headers}};
  if (method !== "GET") init.body = JSON.stringify(body ?? {});
  const response = await handle(new Request(`https://crankmagic.test${path}`, init), env, {fetchImpl, now: clock});
  const text = await response.text();
  return {status: response.status, text, json: text ? JSON.parse(text) : null};
}
const MODEL = "/api/admin/ai-model";
const put = (model, more = {}) => call(MODEL, {method: "PUT", body: {model}, ...more});
const undo = (more = {}) => call(`${MODEL}/undo`, {method: "POST", body: {}, ...more});
const stored = () => DB.raw.prepare("SELECT key, value, previous, updated_at AS updatedAt, updated_by AS updatedBy FROM ai_settings").all().map((r) => ({...r}));
const EXPLAIN = {deck: {name: "Krenko", commanders: ["Krenko, Mob Boss"], cards: ["Krenko, Mob Boss", "Mountain"]}, score: {total: 6.5, of: 10, label: "ok"}, measures: [], strongest: [], weakest: []};
async function explainAs(email, env = base()) {
  return call("/api/ai/explain", {env, jwt: await token({aud: AI_AUD, email}), method: "POST", body: EXPLAIN, headers: {"x-crankmagic": "ai"}});
}
forgetKeys();
DB.raw.prepare("INSERT INTO ai_allowlist (email, added_at, note) VALUES (?, ?, ?)").run(INSIDER, "2026-10-01T00:00:00Z", "test");

/* 1. THE OWNER ALONE, on every route of the setting. */
{
  const who = {
    general: await token({email: GENERAL}), insider: await token({email: INSIDER}),
    service: await token({email: null, common_name: "agent-1.access"}),
  };
  const env = base({SERVICE_SEATS: "on"});
  for (const [name, jwt] of Object.entries(who)) {
    const answers = [await call(MODEL, {env, jwt}), await put("claude-sonnet-5-5", {env, jwt}), await undo({env, jwt})];
    eq(answers.map((a) => a.status), [403, 403, 403], `${name}: GET, PUT and undo are all refused (403)`);
    ok(answers.every((a) => /Only CrankMagic's owner can change the AI model/.test(a.json.error)), `${name}: and each says why`);
  }
  for (const answer of [await call(MODEL, {jwt: null}), await put("claude-sonnet-5-5", {jwt: null}), await undo({jwt: null})]) eq(answer.status, 401, "no token: 401");
  eq([listCalls.length, stored().length], [0, 0], "none of that reached the models API or wrote a row");
  eq((await call(MODEL, {env: base({OWNER_EMAIL: ""})})).status, 403, "with no OWNER_EMAIL set, nobody is the owner");
  for (const path of ["/api/admin", "/api/admin/groups", "/api/admin/spend", "/api/admin/features", "/api/admin/health", "/api/admin/invites"]) {
    eq([(await call(path, {jwt: who.general})).status, (await call(path, {jwt: who.insider})).status], [403, 403], `${path}: refused to General and to an Insider`);
  }
  eq((await call(MODEL)).status, 200, "the owner, named by OWNER_EMAIL in any case, is let in");
  eq(listCalls.length, 2, "and only then is the models API asked (its two pages)");
  listCalls = [];
}

/* 2. THE LIST: what the API reports for this key, across pages, with the allow-list applied. */
{
  const {json} = await call(MODEL);
  eq(listCalls.length, 2, "the list is read across its pages (has_more)");
  ok(listCalls[0].url.startsWith("https://api.anthropic.com/v1/models") && listCalls[1].url.includes("after_id=claude-opus-5"), "the second page continues from the first's last id");
  eq([listCalls[0].headers["x-api-key"], listCalls[0].headers["anthropic-version"]], [KEY, "2023-06-01"], "with the Worker's key and the API version");
  eq(json.models.map((m) => [m.id, m.name, m.allowed, m.current]), [
    ["claude-sonnet-5-5", "Claude Sonnet 5.5", true, false], ["claude-opus-5", "Claude Opus 5", false, false],
    ["claude-haiku-5-5", "Claude Haiku 5.5", true, true], ["claude-mystery-1", "Claude Mystery", false, false]], "every model the API reports, in its order; only the ones in MODELS selectable; the one in force marked");
  ok(json.models.filter((m) => !m.allowed).every((m) => /CrankMagic does not use this model/.test(m.reason)), "the others say why they cannot be chosen");
  eq([json.model, json.previous, json.default, json.storage, json.owner], [{id: DEFAULT_MODEL, source: "default"}, null, DEFAULT_MODEL, "ready", true], "nothing stored: the default is in force, nothing to undo");
  ok(!JSON.stringify(json).includes(KEY), "the key is not in the answer");
  eq(MODELS.sort(), ["claude-haiku-5-5", "claude-sonnet-5-5"], "the allow-list is still Haiku 5.5 and Sonnet 5.5");
}

/* 3. AN UNLISTED OR UNALLOWED MODEL IS REFUSED, and nothing is stored. */
{
  const unlisted = await put("claude-sonnet-4-1");
  eq(unlisted.status, 422, "a model the API does not list is refused");
  ok(/does not list that model for this key/.test(unlisted.json.error), "and it says the API does not list it");
  const dear = await put("claude-opus-5");
  eq(dear.status, 422, "a model the API lists but CrankMagic does not allow is refused");
  ok(/CrankMagic does not use that model/.test(dear.json.error) && /claude-haiku-5-5/.test(dear.json.error), "and it says which ones it does use");
  eq((await put("")).status, 400, "no model: 400");
  eq((await put(42)).status, 400, "a model that is not a string: 400");
  eq((await call(MODEL, {method: "PUT", body: {}})).status, 400, "no model field: 400");
  listing = "only-haiku";
  const notListed = await put("claude-sonnet-5-5");
  eq(notListed.status, 422, "a model in MODELS that this key's list does not carry is refused too");
  listing = "ok";
  eq(stored(), [], "nothing was stored by any of them");
}

/* 4. A CHANGE IS STORED, READ BACK, AND IS THE NEXT AI CALL'S MODEL. */
{
  messages = [];
  eq((await explainAs(OWNER)).status, 200, "an AI call before the change");
  eq(messages.at(-1).model, DEFAULT_MODEL, "uses the default model");
  const changed = await put("claude-sonnet-5-5");
  eq(changed.status, 200, "the owner changes the model");
  eq([changed.json.model, changed.json.previous], [{id: "claude-sonnet-5-5", source: "stored"}, DEFAULT_MODEL], "the answer shows the model now in force and the one before it");
  eq(stored().map((r) => [r.key, r.value, r.previous, r.updatedBy, r.updatedAt]), [["model", "claude-sonnet-5-5", DEFAULT_MODEL, OWNER, "2026-10-31T18:00:00.000Z"]], "stored with the previous value, who and when");
  eq((await call(MODEL)).json.model, {id: "claude-sonnet-5-5", source: "stored"}, "and read back");
  eq((await explainAs(OWNER)).status, 200, "the next AI call");
  eq(messages.at(-1).model, "claude-sonnet-5-5", "is made on the new model");
  eq((await explainAs(INSIDER)).status, 200, "an Insider's too");
  eq(messages.at(-1).model, "claude-sonnet-5-5", "is made on the new model");
  const restarted = base({AI_MODEL: "claude-haiku-5-5"});
  eq((await call(MODEL, {env: restarted})).json.model, {id: "claude-sonnet-5-5", source: "stored"}, "a Worker started afresh, whose environment names the other model, still reads the stored one");
  eq((await explainAs(OWNER, restarted)).status, 200, "and calls it");
  eq(messages.at(-1).model, "claude-sonnet-5-5", "the stored model outranks AI_MODEL");
  const again = await put("claude-sonnet-5-5");
  eq([again.status, again.json.previous, stored()[0].previous], [200, DEFAULT_MODEL, DEFAULT_MODEL], "choosing the model already in force changes nothing, so the undo still goes back to what it was");
}

/* 5. UNDO: one press back, a second puts the change back, nothing to undo is refused. */
{
  messages = [];
  const back = await undo();
  eq([back.status, back.json.model, back.json.previous], [200, {id: DEFAULT_MODEL, source: "stored"}, "claude-sonnet-5-5"], "undo returns to the previous model");
  eq((await explainAs(OWNER)).status, 200, "the next call");
  eq(messages.at(-1).model, DEFAULT_MODEL, "is made on it");
  eq(stored().map((r) => [r.value, r.previous]), [[DEFAULT_MODEL, "claude-sonnet-5-5"]], "the change that was undone is the new previous");
  eq((await undo()).json.model.id, "claude-sonnet-5-5", "a second press puts the change back");
  DB = d1(MIGRATIONS);
  const none = await undo({env: base()});
  eq(none.status, 409, "with nothing changed there is nothing to undo");
  ok(/nothing to undo/i.test(none.json.error), "and it says so");
  eq(stored(), [], "and writes nothing");
}

/* 6. THE ENVIRONMENT IS THE FALLBACK, and the first change keeps it as the previous. */
{
  DB = d1(MIGRATIONS);
  const env = () => base({AI_MODEL: "claude-sonnet-5-5"});
  eq((await call(MODEL, {env: env()})).json.model, {id: "claude-sonnet-5-5", source: "env"}, "nothing stored: AI_MODEL is in force");
  messages = [];
  await explainAs(OWNER, env());
  eq(messages.at(-1).model, "claude-sonnet-5-5", "and is what a call uses");
  const changed = await put("claude-haiku-5-5", {env: env()});
  eq([changed.json.model, changed.json.previous], [{id: "claude-haiku-5-5", source: "stored"}, "claude-sonnet-5-5"], "the first change keeps the environment's model as the one to go back to");
  await explainAs(OWNER, env());
  eq(messages.at(-1).model, "claude-haiku-5-5", "and outranks it");
  eq((await undo({env: env()})).json.model.id, "claude-sonnet-5-5", "undo returns to it");
}

/* 7. FAIL CLOSED. */
{
  DB = d1(MIGRATIONS);
  listing = "down";
  const down = await call(MODEL);
  eq([down.status, down.json.models, down.json.model.id], [200, [], DEFAULT_MODEL], "the models API unreachable: the pane still shows the model in force, with no list");
  ok(/could not be loaded/.test(down.json.listError), "and says the list did not load");
  const refused = await put("claude-sonnet-5-5");
  eq([refused.status, stored()], [502, []], "a change is refused, because a model cannot be checked against a list that did not load, and nothing is stored");
  ok(/Nothing was changed/.test(refused.json.error), "and it says nothing changed");
  listing = "error";
  const failed = await put("claude-sonnet-5-5");
  eq([failed.status, stored()], [502, []], "the API answering with an error: the same");
  ok(!failed.text.includes("account details"), "the provider's own error text is not passed on");
  listing = "ok";
  const {ANTHROPIC_API_KEY: _k, ...noKey} = base();
  const keyless = await put("claude-sonnet-5-5", {env: noKey});
  eq([keyless.status, stored()], [503, []], "no key entered: shut, nothing stored");
  eq((await call(MODEL, {env: noKey})).json.models, [], "and no list");

  DB.raw.prepare("INSERT INTO ai_settings (key, value, previous, updated_at, updated_by) VALUES ('model', 'claude-opus-5', NULL, '2026-10-31T00:00:00Z', ?)").run(OWNER);
  messages = [];
  const shut = await explainAs(OWNER);
  eq([shut.status, messages.length], [503, 0], "a stored model outside MODELS (whatever put it there) keeps the AI door shut, and nothing is sent");
  ok(/model CrankMagic does not use/.test(shut.json.error), "and says the model is why");
  const gates = {ANTHROPIC_API_KEY: KEY, AI_CAP_PERSON_CENTS: "25", AI_CAP_TOTAL_CENTS: "100"};
  assert.throws(() => settings({...gates, AI_MODEL: "claude-haiku-5-5"}, "claude-opus-5"), /model CrankMagic does not use/); checks++;
  eq([settings(gates).model, settings({...gates, AI_MODEL: "claude-sonnet-5-5"}).model, settings({...gates, AI_MODEL: "claude-sonnet-5-5"}, "claude-haiku-5-5").model, settings(gates, null).model],
    [DEFAULT_MODEL, "claude-sonnet-5-5", "claude-haiku-5-5", DEFAULT_MODEL], "settings(): the stored model outranks AI_MODEL, which outranks the default");
}

/* 8. A DATABASE WITHOUT THE TABLE (migration 0011 not applied yet) falls back to AI_MODEL, and the pane says so. */
{
  DB = d1(["0001_accounts.sql", "0002_ai.sql"]);
  const env = () => base({AI_MODEL: "claude-sonnet-5-5"});
  messages = [];
  eq((await explainAs(OWNER, env())).status, 200, "an AI call");
  eq(messages.at(-1).model, "claude-sonnet-5-5", "is made on AI_MODEL");
  const read = await call(MODEL, {env: env()});
  eq([read.status, read.json.storage, read.json.model], [200, "missing", {id: "claude-sonnet-5-5", source: "env"}], "the pane reads the environment's model and says the storage is missing");
  const refused = await put("claude-haiku-5-5", {env: env()});
  eq(refused.status, 503, "a change is refused");
  ok(/migration/i.test(refused.json.error) && /Nothing was changed/.test(refused.json.error), "saying a migration is to be applied, and that nothing changed");
}

console.log(`admin-ai-model: ${checks} checks passed — the owner alone, the model list from the API (and only the models CrankMagic allows), a change stored and used by the next AI call, one-press undo, and closed whenever the list, the key or the table is missing.`);
