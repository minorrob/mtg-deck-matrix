/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* THE FEEDBACK STORE, held to what it promises (the feedback loop, PR 1; docs/feedback-loop/PLAN-2026-10-26.html;
 * feedback-schema.js, cloud/feedback.mjs, cloud/worker.mjs, migration 0009).
 *
 * The Worker as it ships, D1 as Node's own SQLite with every migration applied in order, and Access as real RS256 tokens
 * signed with a key generated for the run. Only the network is a stand-in.
 *   1. The migration: 0009 is the feedback table's, the newest; its columns; no column for a card, a hand or a zone.
 *   2. CrankFeedback@1 (the module both ends load): a full report read back whole; every bound refused by name; unknown
 *      fields dropped, a name in the report never read as the reporter; boundReport trims a draft to what readReport takes;
 *      the state machine's order and what each move must carry.
 *   3. POST /api/feedback: any signed-in person files one (201, state new, the reporter from the token); a screenshot is
 *      dropped and its bytes kept nowhere; the app's header, a sign-in and the schema are each required by name.
 *   4. Ten an hour a person: the eleventh is refused with the reason and when to try again; an hour on, taken; another
 *      person is not held back.
 *   5. GET /api/admin/feedback: a general person may not read; the owner reads every row; since, state and limit filter;
 *      the triage agent's service token reads, on its own application only, and not where no application is named.
 *   6. PATCH /api/admin/feedback/:id: each move to the next state and no other; what each move must carry; facts attached
 *      without a move; who may move a row; the whole loop, new to notified.
 */
import assert from "node:assert/strict";
import {readFileSync, readdirSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
import {handle} from "../cloud/worker.mjs";
import {forgetKeys} from "../cloud/access.mjs";
import {createFeedback, HOURLY_LIMIT, isOwner} from "../cloud/feedback.mjs";
import schema from "../feedback-schema.js";

let checks = 0;
const ok = (c, m) => {assert.ok(c, m); checks += 1;};
const eq = (a, b, m) => {assert.deepEqual(a, b, m); checks += 1;};
const refused = (fn, why, m) => {assert.throws(fn, (e) => e.name === "FeedbackInvalid" && why.test(e.message), m); checks += 1;};

const {readReport, boundReport, readPatch, nextState, mayMove, STATES, REQUIRES, LIMITS, SCHEMA} = schema;

/* ---- D1, as far as the Worker uses it ---- */
const MIGRATIONS = readdirSync(new URL("../cloud/migrations/", import.meta.url)).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();
function d1() {
  const db = new DatabaseSync(":memory:");
  for (const f of MIGRATIONS) db.exec(readFileSync(new URL(`../cloud/migrations/${f}`, import.meta.url), "utf8"));
  const statement = (sql, args = []) => ({
    bind: (...values) => {assert.ok(values.length <= 100, `D1 binds at most 100 values; this statement bound ${values.length}`); return statement(sql, values);},
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({results: db.prepare(sql).all(...args), success: true, meta: {}}),
    run: async () => ({success: true, meta: {changes: Number(db.prepare(sql).run(...args).changes)}}),
    now: () => ({success: true, meta: {changes: Number(db.prepare(sql).run(...args).changes)}}),
  });
  return {raw: db, prepare: (sql) => statement(sql), batch: async (list) => {
    db.exec("BEGIN");
    try {const out = list.map((s) => s.now()); db.exec("COMMIT"); return out;} catch (error) {db.exec("ROLLBACK"); throw error;}
  }};
}

/* ---- 1. The migration ---- */
{
  eq(MIGRATIONS.slice(-1), ["0009_feedback.sql"], "1. migration 0009 is the feedback table's, the newest (0007 and 0008 are reserved in docs/ACTIVE.md)");
  const DB = d1();
  const columns = (t) => DB.raw.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name);
  eq(columns("feedback"), ["id", "reporter", "reporter_group", "kind", "state", "route", "build_commit", "build_profile", "report", "screenshot", "issue", "pr", "release_commit", "message_id", "created_at", "updated_at"],
    "the feedback table: the report, who sent it, and the loop's facts");
  ok(!columns("feedback").some((c) => /hand|card|zone|library|deck/i.test(c)), "no column for a card, a hand, a zone or a library");
  const sql = readFileSync(new URL("../cloud/migrations/0009_feedback.sql", import.meta.url), "utf8");
  ok(/CHECK \(state IN \('new', 'triaged', 'approved', 'in-progress', 'released', 'notified'\)\)/.test(sql), "the table itself refuses a state outside the loop");
  assert.throws(() => DB.raw.prepare("INSERT INTO feedback (id, reporter, reporter_group, kind, state, route, build_commit, build_profile, report, created_at, updated_at) VALUES ('x', 'a@b.c', 'general', 'bug', 'done', '#', 'abcdef0', 'p', '{}', 't', 't')").run(), /CHECK/, "a row in a state outside the loop is refused by the table");
  checks += 1;
}

/* ---- 2. CrankFeedback@1 ---- */
const FULL = {
  schema: SCHEMA, kind: "bug", text: "The attack question hid its Confirm button\nat 1366 wide.",
  page: {route: "#table/abc123de/game", screen: "Play", view: "Full"},
  build: {commit: "c567c581", profile: "cloud-staging"},
  game: {tableId: "abc123de", matchId: "abc123deg2", turn: 7, step: "declare attackers", seat: "Rob", decisionId: "d-41", lastLine: "Maya attacks Rob with Fauna Shaman."},
  deck: {id: "deck-1", name: "Krenko's Horde", card: "Krenko, Mob Boss"},
  device: {viewport: {width: 1366, height: 768}, pixelRatio: 1.5, pointer: "fine", browser: "Chrome", reducedMotion: false, theme: "dark"},
  console: ["TypeError: x is not a function", "ResizeObserver loop"],
};
const webp = (bytes) => `data:image/webp;base64,${Buffer.alloc(bytes, 7).toString("base64")}`;
{
  eq(readReport(FULL), FULL, "2. a full report is read back whole, every field in place");
  eq(readReport({...FULL, schema: undefined}).schema, SCHEMA, "a report with no schema name is read as CrankFeedback@1");
  refused(() => readReport({...FULL, schema: "CrankFeedback@2"}), /not CrankFeedback@1/, "another schema is refused by name");
  refused(() => readReport({...FULL, text: "x".repeat(LIMITS.text + 1)}), /2,001 characters; 2,000 is the most/, "text over 2,000 characters is refused, with both numbers");
  ok(readReport({...FULL, text: "x".repeat(LIMITS.text)}).text.length === LIMITS.text, "and exactly 2,000 is taken");
  refused(() => readReport({...FULL, text: ""}), /text is missing/, "no text: refused");
  refused(() => readReport({...FULL, kind: "wish"}), /kind must be one of bug, enhancement/, "a kind outside the two: refused");
  refused(() => readReport({...FULL, page: {screen: "Play"}}), /route is missing/, "no route: refused");
  refused(() => readReport({...FULL, build: {profile: "x"}}), /commit is missing/, "no build commit: refused");
  refused(() => readReport({...FULL, build: {commit: "main", profile: "x"}}), /not a commit hash/, "a commit that is not a hash: refused");
  eq(readReport({...FULL, build: {commit: "unreleased", profile: "local"}}).build, {commit: "unreleased", profile: "local"}, "\"unreleased\" names a build that is no release");
  refused(() => readReport({...FULL, device: {}}), /viewport is missing/, "no viewport: refused");
  refused(() => readReport({...FULL, device: {viewport: {width: 0, height: 10}}}), /viewport's width/, "a zero-wide viewport: refused");
  refused(() => readReport({...FULL, console: Array.from({length: LIMITS.consoleLines + 1}, () => "e")}), /21 lines; 20 is the most/, "21 console lines: refused");
  refused(() => readReport({...FULL, console: ["x".repeat(LIMITS.consoleLine + 1)]}), /console line 1 is 501/, "a console line over 500: refused");
  eq(readReport({...FULL, screenshot: webp(LIMITS.screenshotBytes)}).screenshot, webp(LIMITS.screenshotBytes), "a 1 MiB WebP screenshot is taken");
  refused(() => readReport({...FULL, screenshot: webp(LIMITS.screenshotBytes + 1)}), /1,048,577 bytes; 1,048,576 is the most/, "one byte more is refused, with both numbers");
  refused(() => readReport({...FULL, screenshot: `data:image/png;base64,${Buffer.alloc(10).toString("base64")}`}), /not a WebP/, "a PNG is refused: the sheet sends WebP");
  refused(() => readReport({...FULL, game: {turn: -1}}), /turn is not a whole number/, "a turn below zero: refused");
  refused(() => readReport({...FULL, game: {lastLine: "x".repeat(LIMITS.line + 1)}}), /last history line is 301/, "a history line over 300: refused");
  /* Unknown fields are dropped: there is no place in a report for a hand, and no name in it is who sent it. */
  const smuggled = readReport({...FULL, hand: ["Sol Ring"], person: {email: "someone@else.example"}, game: {...FULL.game, hands: {Maya: ["Counterspell"]}}, extra: 1});
  eq(smuggled, FULL, "a hand, a person and any other field outside the schema are dropped");
  ok(!JSON.stringify(smuggled).includes("someone@else") && !JSON.stringify(smuggled).includes("Counterspell"), "and nothing of them survives");
  eq(readReport({...FULL, text: "  a\u0007  b \n\n\n\n c  "}).text, "a b\n\nc", "control characters go, runs of spaces become one, three blank lines become one");
  /* boundReport: the sheet's half of the contract. */
  const draft = {kind: "enhancement", text: "y".repeat(5000), page: {route: "#decks", screen: "Decks"}, build: {commit: "not-a-hash", profile: "cloud-production"},
    device: {viewport: {width: 390.4, height: 844}, pixelRatio: 3, pointer: "coarse"}, console: Array.from({length: 30}, (_, i) => `line ${i}`), screenshot: webp(LIMITS.screenshotBytes + 100), hand: ["x"]};
  const bounded = boundReport(draft);
  eq([bounded.text.length, bounded.console.length, bounded.console[0], bounded.console[19], "screenshot" in bounded, "hand" in bounded, bounded.build.commit, bounded.device.viewport.width],
    [LIMITS.text, LIMITS.consoleLines, "line 10", "line 29", false, false, "unreleased", 390],
    "boundReport cuts the text to 2,000, keeps the last 20 console lines, drops a screenshot over 1 MiB and a field outside the schema, names a hashless build unreleased, rounds the viewport");
  eq(readReport(bounded), bounded, "and what it bounds, readReport takes as it is");
  eq(boundReport(FULL), FULL, "a report already within the bounds is unchanged");
  /* The state machine. */
  eq(STATES, ["new", "triaged", "approved", "in-progress", "released", "notified"], "the six states, in order");
  eq(STATES.map(nextState), ["triaged", "approved", "in-progress", "released", "notified", null], "each state's next, and none after notified");
  ok(STATES.every((s, i) => STATES.every((t, j) => mayMove(s, t) === (j === i + 1))), "a move is to the next state only: never a skip, never back, never to itself");
  eq(REQUIRES, {triaged: "issue", released: "release", notified: "messageId"}, "triaged carries the issue, released the commit, notified the message id");
  eq(readPatch({state: "triaged", issue: "ROB-201", pr: 12, release: "c567c581", messageId: "re_1", extra: "x"}), {state: "triaged", issue: "ROB-201", pr: 12, release: "c567c581", messageId: "re_1"}, "a change is read field by field, the unknown dropped");
  refused(() => readPatch({state: "triaged"}), /move to triaged must carry the issue/, "triaged without an issue: refused");
  refused(() => readPatch({state: "released"}), /must carry the release commit/, "released without the commit: refused");
  refused(() => readPatch({state: "notified"}), /must carry the message id/, "notified without the message id: refused");
  refused(() => readPatch({state: "done"}), /state must be one of/, "a state outside the loop: refused");
  refused(() => readPatch({issue: "rob-1"}), /not a Linear key/, "an issue that is not a Linear key: refused");
  refused(() => readPatch({pr: 0}), /PR number/, "PR 0: refused");
  refused(() => readPatch({release: "main"}), /not a commit hash/, "a release that is not a hash: refused");
  refused(() => readPatch({}), /changes nothing/, "an empty change: refused");
}

/* ---- The Worker, Access, the clock ---- */
const TEAM = "crankmagic-test.cloudflareaccess.com", AUD = "aud-library", AGENT_AUD = "aud-feedback-agent";
const OWNER = "rob@example.com", SAM = "sam@example.com", KIM = "kim@example.com";
const b64url = (buf) => Buffer.from(buf).toString("base64url");
const {publicKey, privateKey} = await crypto.subtle.generateKey({name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256"}, true, ["sign", "verify"]);
const jwk = {...await crypto.subtle.exportKey("jwk", publicKey), kid: "k1"};
let clock = Date.parse("2026-10-26T15:00:00Z");
const token = async (claims) => {
  const h = b64url(JSON.stringify({alg: "RS256", kid: "k1", typ: "JWT"}));
  const p = b64url(JSON.stringify({aud: [AUD], iss: `https://${TEAM}`, exp: clock / 1000 + 3600, iat: clock / 1000, ...claims}));
  return `${h}.${p}.${b64url(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, new TextEncoder().encode(`${h}.${p}`)))}`;
};
const person = (email) => token({email});
const agent = (aud = AGENT_AUD, clientId = "feedback-agent-client-id") => token({aud: [aud], common_name: clientId});
const fetchImpl = async () => new Response(JSON.stringify({keys: [jwk]}));
forgetKeys();
const DB = d1();
let ids = 0;
const ENV = {DB, ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD, INVITE_ADMIN_ID: "1", FEEDBACK_AGENT_AUD: AGENT_AUD};
const call = async (method, path, {jwt, body, purpose = "feedback", headers = {}, env = {}} = {}) => {
  const init = {method, headers: {...(jwt ? {"cf-access-jwt-assertion": jwt} : {}), ...(body !== undefined ? {"content-type": "application/json", "x-crankmagic": purpose} : {}), ...headers}};
  if (body !== undefined) init.body = typeof body === "string" ? body : JSON.stringify(body);
  const r = await handle(new Request(`https://crankmagic.test${path}`, init), {...ENV, ...env}, {fetchImpl, now: clock, newId: () => `00000000-0000-4000-8000-${String(++ids).padStart(12, "0")}`});
  const text = await r.text();
  return {status: r.status, headers: r.headers, json: text ? JSON.parse(text) : null};
};
/* The owner is user 1: the first person the Worker meets. */
eq((await call("GET", "/api/me", {jwt: await person(OWNER)})).status, 200, "the owner has signed in, as user 1");
ok(isOwner(ENV, {id: 1}) && !isOwner(ENV, {id: 2}) && !isOwner({}, {id: 1}), "the owner is INVITE_ADMIN_ID's user, and nobody where no administrator is named");
ok(isOwner({OWNER_EMAIL: " Rob@Example.com "}, {id: 9, email: OWNER}) && !isOwner({OWNER_EMAIL: OWNER}, {id: 1, email: SAM}) && isOwner({OWNER_EMAIL: OWNER, INVITE_ADMIN_ID: "1"}, {id: 1, email: SAM}),
  "OWNER_EMAIL names the owner first, in any letter case; the administrator stands in beside it");
{
  const byAddress = await call("GET", "/api/admin/feedback", {jwt: await person(SAM), env: {INVITE_ADMIN_ID: undefined, OWNER_EMAIL: "SAM@example.com"}});
  eq(byAddress.status, 200, "the admin route takes the owner by OWNER_EMAIL where no administrator id is set");
  eq((await call("GET", "/api/admin/feedback", {jwt: await person(KIM), env: {INVITE_ADMIN_ID: undefined, OWNER_EMAIL: "SAM@example.com"}})).status, 403, "and refuses everyone else there");
}

/* ---- 3. POST /api/feedback ---- */
{
  const r = await call("POST", "/api/feedback", {jwt: await person(SAM), body: FULL});
  eq(r.status, 201, "3. a signed-in person files a report: 201");
  const f = r.json.feedback;
  eq([f.id, f.state, f.reporter, f.group, f.screenshot, f.issue, f.pr, f.release, f.messageId, f.createdAt, f.updatedAt],
    ["00000000-0000-4000-8000-000000000001", "new", SAM, "general", null, null, null, null, null, new Date(clock).toISOString(), new Date(clock).toISOString()],
    "the row: a minted id, state new, the reporter from the token, group general, no screenshot, no loop facts yet");
  const {id, state, reporter, group, screenshot, issue, pr, release, messageId, createdAt, updatedAt, ...report} = f;
  eq(report, FULL, "and the report itself, every field as sent");
  /* The reporter is who Access named. */
  const named = await call("POST", "/api/feedback", {jwt: await person(SAM), body: {...FULL, person: {email: OWNER}, reporter: OWNER}});
  eq(named.json.feedback.reporter, SAM, "a name in the report is not the reporter: the token is");
  ok(!("person" in named.json.feedback) && !JSON.stringify(named.json.feedback).includes("person"), "and the name is not kept");
  /* The owner is the owner. */
  eq((await call("POST", "/api/feedback", {jwt: await person(OWNER), body: FULL})).json.feedback.group, "owner", "the owner's report says owner");
  /* A screenshot is dropped, and its bytes kept nowhere (R2 is not on: Rob's call D4, on the default). */
  const shot = webp(4096);
  const withShot = await call("POST", "/api/feedback", {jwt: await person(SAM), body: {...FULL, screenshot: shot}});
  eq([withShot.status, withShot.json.feedback.screenshot], [201, "dropped"], "a report with a screenshot is taken, and the row says the screenshot was dropped");
  ok(!DB.raw.prepare("SELECT report, screenshot FROM feedback").all().some((row) => row.report.includes("base64") || (row.screenshot || "").length > 20), "and no stored value holds the picture's bytes");
  /* Each refusal names the reason. */
  eq((await call("POST", "/api/feedback", {body: FULL})).status, 401, "signed out: 401");
  eq((await call("POST", "/api/feedback", {jwt: await person(SAM), body: FULL, purpose: "sync"})).status, 403, "without the sheet's own header: 403");
  eq((await call("POST", "/api/feedback", {jwt: await person(SAM), body: FULL, headers: {origin: "https://elsewhere.example"}})).status, 403, "from another site: 403");
  eq((await call("GET", "/api/feedback", {jwt: await person(SAM)})).status, 405, "GET: 405");
  const bad = await call("POST", "/api/feedback", {jwt: await person(SAM), body: {...FULL, text: "x".repeat(LIMITS.text + 1)}});
  eq([bad.status, /2,001 characters; 2,000 is the most. Nothing was saved/.test(bad.json.error)], [400, true], "over a bound: 400, the bound named, nothing saved");
  eq((await call("POST", "/api/feedback", {jwt: await person(SAM), body: "{not json"})).status, 400, "not JSON: 400");
  const huge = await call("POST", "/api/feedback", {jwt: await person(SAM), body: JSON.stringify({...FULL, screenshot: webp(1_200_000)})});
  eq([huge.status, /1 MB at most/.test(huge.json.error)], [413, true], "a body past what a bounded report can be: 413 before it is read");
  eq((await call("POST", "/api/feedback", {jwt: await person(SAM), body: FULL, env: {DB: undefined}})).status, 503, "no database: 503, feedback is not on here");
  eq(DB.raw.prepare("SELECT COUNT(*) AS n FROM feedback").get().n, 4, "four rows: the refusals saved nothing");
}

/* ---- 4. Ten an hour a person ---- */
{
  const before = DB.raw.prepare("SELECT COUNT(*) AS n FROM feedback WHERE reporter = ?").get(KIM).n;
  eq(before, 0, "4. Kim has sent nothing");
  for (let i = 0; i < HOURLY_LIMIT; i++) {
    clock += 60_000;
    eq((await call("POST", "/api/feedback", {jwt: await person(KIM), body: {...FULL, text: `report ${i + 1}`}})).status, 201, `report ${i + 1} of ${HOURLY_LIMIT} in the hour: taken`);
  }
  clock += 60_000;
  const eleventh = await call("POST", "/api/feedback", {jwt: await person(KIM), body: FULL});
  eq(eleventh.status, 429, "the eleventh within the hour: 429");
  ok(/sent 10 reports in the last hour.*Nothing was saved.*Wait \d+ minutes?, then send it again/.test(eleventh.json.error), `the refusal says what happened and what to do: ${eleventh.json.error}`);
  /* The first was sent 10 minutes before the eleventh, so the hour after it ends in 50. */
  eq([eleventh.json.retryAfterSeconds, eleventh.headers.get("retry-after")], [50 * 60, String(50 * 60)], "and when: the hour after the oldest report in the window");
  eq((await call("POST", "/api/feedback", {jwt: await person(SAM), body: FULL})).status, 201, "another person is not held back");
  clock += 49 * 60_000;
  eq((await call("POST", "/api/feedback", {jwt: await person(KIM), body: FULL})).status, 429, "49 minutes on, the oldest is still within the hour: refused");
  clock += 60_000;
  eq((await call("POST", "/api/feedback", {jwt: await person(KIM), body: FULL})).status, 201, "a minute later it has left the hour, and Kim's next is taken");
  eq(DB.raw.prepare("SELECT COUNT(*) AS n FROM feedback WHERE reporter = ?").get(KIM).n, HOURLY_LIMIT + 1, "eleven of Kim's rows, over 61 minutes");
}

/* ---- 5. GET /api/admin/feedback ---- */
{
  const sam = await call("GET", "/api/admin/feedback", {jwt: await person(SAM)});
  eq([sam.status, /owner/.test(sam.json.error)], [403, true], "5. a general person may not read feedback: 403, naming the owner");
  eq((await call("GET", "/api/admin/feedback", {})).status, 401, "signed out: 401");
  const all = await call("GET", "/api/admin/feedback", {jwt: await person(OWNER)});
  eq(all.status, 200, "the owner reads");
  const total = DB.raw.prepare("SELECT COUNT(*) AS n FROM feedback").get().n;
  eq(all.json.feedback.length, total, `every row (${total})`);
  ok(all.json.feedback.every((f, i) => i === 0 || f.createdAt >= all.json.feedback[i - 1].createdAt), "oldest first");
  eq(Object.keys(all.json.feedback[0]).sort(), ["build", "console", "createdAt", "deck", "device", "game", "group", "id", "issue", "kind", "messageId", "page", "pr", "release", "reporter", "schema", "screenshot", "state", "text", "updatedAt"], "each row carries the report and the loop's facts");
  const kims = all.json.feedback.filter((f) => f.reporter === KIM);
  const since = await call("GET", `/api/admin/feedback?since=${encodeURIComponent(kims[4].createdAt)}`, {jwt: await person(OWNER)});
  eq(since.json.feedback.length, all.json.feedback.filter((f) => f.createdAt > kims[4].createdAt).length, "since= lists the rows created after that time");
  ok(since.json.feedback.length > 0 && since.json.feedback.length < total, "and it is a proper part of the whole");
  eq((await call("GET", "/api/admin/feedback?limit=3", {jwt: await person(OWNER)})).json.feedback.length, 3, "limit= caps the page");
  eq((await call("GET", "/api/admin/feedback?state=triaged", {jwt: await person(OWNER)})).json.feedback, [], "state=triaged: none yet");
  eq((await call("GET", "/api/admin/feedback?state=new", {jwt: await person(OWNER)})).json.feedback.length, total, "state=new: all of them");
  eq((await call("GET", "/api/admin/feedback?state=done", {jwt: await person(OWNER)})).status, 400, "a state outside the loop: 400");
  eq((await call("GET", "/api/admin/feedback?since=yesterday", {jwt: await person(OWNER)})).status, 400, "a since that is not a date: 400");
  /* The triage agent: a service token for its own Access application. */
  const byAgent = await call("GET", "/api/admin/feedback?state=new", {jwt: await agent()});
  eq([byAgent.status, byAgent.json.feedback.length], [200, total], "the agent's service token reads every new row");
  eq((await call("GET", "/api/admin/feedback", {jwt: await agent(AUD)})).status, 401, "a service token for the app's own application (no person) does not: 401");
  eq((await call("GET", "/api/admin/feedback", {jwt: await agent("aud-other")})).status, 401, "nor one for any other application");
  eq((await call("GET", "/api/admin/feedback", {jwt: await agent(), env: {FEEDBACK_AGENT_AUD: undefined}})).status, 401, "nor the agent's own where no agent application is named: 401");
  eq((await call("GET", "/api/admin/feedback", {jwt: await agent(AUD), env: {FEEDBACK_AGENT_AUD: undefined}})).status, 401, "and where none is named, a service token for the app's own application is not the agent either: 401");
  eq((await call("GET", "/api/admin/feedback", {jwt: await token({aud: [AGENT_AUD], email: SAM})})).status, 403, "a person signed in to the agent's application is still a person: not the owner, 403");
  eq((await call("GET", "/api/admin/feedback", {jwt: await token({aud: [AGENT_AUD], email: OWNER})})).status, 200, "and the owner signed in there is still the owner");
  eq((await call("GET", "/api/admin/feedback/00000000-0000-4000-8000-000000000001", {jwt: await person(OWNER)})).status, 404, "no single-row GET: the list is the read");
  eq((await call("POST", "/api/admin/feedback", {jwt: await person(OWNER), body: {}})).status, 405, "POST on the admin route: 405");
  eq((await call("GET", "/api/admin/feedback", {jwt: await person(OWNER), env: {DB: undefined}})).status, 503, "no database: 503");
}

/* ---- 6. PATCH /api/admin/feedback/:id ---- */
{
  const first = "00000000-0000-4000-8000-000000000001";
  const move = (id, body, jwt, extra = {}) => call("PATCH", `/api/admin/feedback/${id}`, {jwt, body, purpose: "feedback-admin", ...extra});
  const asAgent = await agent(), asOwner = await person(OWNER);
  eq((await move(first, {state: "triaged", issue: "ROB-201"}, await person(SAM))).status, 403, "6. a general person may not move a row: 403");
  eq((await move(first, {state: "triaged", issue: "ROB-201"}, asAgent, {purpose: "feedback"})).status, 403, "without the admin header: 403");
  eq((await move(first, {state: "approved"}, asAgent)).status, 409, "new to approved skips triaged: 409");
  eq((await move(first, {state: "new"}, asAgent)).status, 409, "new to new: 409");
  const noIssue = await move(first, {state: "triaged"}, asAgent);
  eq([noIssue.status, /must carry the issue. Nothing was changed/.test(noIssue.json.error)], [400, true], "triaged without its issue: 400, the reason named");
  eq((await move("00000000-0000-4000-8000-000000000999", {state: "triaged", issue: "ROB-201"}, asAgent)).status, 404, "a row that is not there: 404");
  eq((await move("not-an-id", {state: "triaged", issue: "ROB-201"}, asAgent)).status, 404, "an id that is not one: 404");
  eq((await move(first, {}, asAgent)).status, 400, "an empty change: 400");
  eq((await move(first, "{", asAgent)).status, 400, "not JSON: 400");
  eq((await move(first, {state: "triaged", issue: "ROB-201", note: "x".repeat(9000)}, asAgent)).status, 413, "a change past 8 KiB: 413");
  eq({...DB.raw.prepare("SELECT state, issue, updated_at FROM feedback WHERE id = ?").get(first)}, {state: "new", issue: null, updated_at: new Date(Date.parse("2026-10-26T15:00:00Z")).toISOString()}, "and through all of that the row did not move");
  clock += 60_000;
  const triaged = await move(first, {state: "triaged", issue: "ROB-201"}, asAgent);
  eq([triaged.status, triaged.json.feedback.state, triaged.json.feedback.issue, triaged.json.feedback.updatedAt], [200, "triaged", "ROB-201", new Date(clock).toISOString()], "the agent triages: triaged, the issue on the row, updated now");
  eq(triaged.json.feedback.createdAt, new Date(Date.parse("2026-10-26T15:00:00Z")).toISOString(), "created stays when it was");
  eq((await call("GET", "/api/admin/feedback?state=triaged", {jwt: asOwner})).json.feedback.map((f) => f.id), [first], "and the list finds it by state");
  eq((await move(first, {state: "triaged", issue: "ROB-202"}, asAgent)).status, 409, "triaged again: 409");
  eq((await move(first, {state: "new"}, asAgent)).status, 409, "back to new: 409");
  const pr = await move(first, {pr: 894}, asOwner);
  eq([pr.status, pr.json.feedback.state, pr.json.feedback.pr], [200, "triaged", 894], "the owner attaches the PR without a move: the state stays");
  eq((await move(first, {state: "approved"}, asOwner)).json.feedback.state, "approved", "approved (Rob's label, applied by the session that read it)");
  eq((await move(first, {state: "in-progress"}, asAgent)).json.feedback.state, "in-progress", "in progress, on the branch");
  eq((await move(first, {state: "released"}, asAgent)).status, 400, "released without the commit: 400");
  const released = await move(first, {state: "released", release: "c567c581"}, asAgent);
  eq([released.json.feedback.state, released.json.feedback.release], ["released", "c567c581"], "released, with the commit of main that shipped it");
  eq((await move(first, {state: "notified"}, asAgent)).status, 400, "notified without the message id: 400");
  const notified = await move(first, {state: "notified", messageId: "re_8f2a"}, asAgent);
  eq([notified.json.feedback.state, notified.json.feedback.messageId], ["notified", "re_8f2a"], "notified, with the message that thanked the person");
  const end = await move(first, {state: "notified", messageId: "re_again"}, asAgent);
  eq([end.status, /the end of the loop/.test(end.json.error)], [409, true], "nothing follows notified: 409, saying so");
  eq({...DB.raw.prepare("SELECT state, issue, pr, release_commit, message_id FROM feedback WHERE id = ?").get(first)}, {state: "notified", issue: "ROB-201", pr: 894, release_commit: "c567c581", message_id: "re_8f2a"}, "the row carries the whole loop");
  /* The store on its own, as the release workflow will use it: a move that is not the next says what the next is. */
  const store = createFeedback(DB, {now: () => new Date(clock).toISOString()});
  const second = "00000000-0000-4000-8000-000000000002";
  await assert.rejects(store.patch(second, {state: "in-progress"}), (e) => e.status === 409 && e.state === "new" && /only move from there is to triaged/.test(e.message), "the store names the row's state and its next");
  checks += 1;
  await assert.rejects(store.patch(second, {state: "triaged"}), (e) => e.name === "FeedbackInvalid", "and refuses a move short of what it must carry");
  checks += 1;
  eq((await store.patch(second, {state: "triaged", issue: "ROB-201"})).issue, "ROB-201", "two reports, one issue: duplicates are linked to one");
}

console.log(`feedback-store: ${checks} checks passed`);
