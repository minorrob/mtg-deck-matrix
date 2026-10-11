/* M3's weekly check (tools/ops-week.mjs) against a stand-in for Cloudflare's API: it reads and changes nothing,
   asks for the profile's own Worker and database, counts the monitoring lines by kind and status, reads counts and
   cents but never an address, says how far back Time Travel reaches and whether R2 is on, and names an incident. */
import assert from "node:assert/strict";
import {weekly, render, main} from "../tools/ops-week.mjs";
import {PROFILES} from "../tools/release-pages.mjs";

let checks = 0;
const eq = (a, b, m) => {assert.deepEqual(a, b, m); checks += 1;};
const ok = (v, m) => {assert.ok(v, m); checks += 1;};

const NOW = Date.parse("2026-10-11T12:00:00Z"), DAY = 86400000;
const staging = PROFILES["cloud-staging"];
const answer = (result) => new Response(JSON.stringify({success: true, errors: [], result}));
const refuse = (message) => new Response(JSON.stringify({success: false, errors: [{message}], result: null}));

/* The stand-in: what each read returns, and every request it was sent. */
function cloudflare({aggregates = [], made = "2026-09-24T21:39:07Z", reach = 30, r2 = null, accounts = [{id: "acct1"}]} = {}) {
  const sent = [];
  const fetchImpl = async (url, init = {}) => {
    const u = new URL(url), method = init.method || "GET", body = init.body ? JSON.parse(init.body) : null;
    sent.push({method, path: u.pathname, search: u.search, body, auth: init.headers?.authorization});
    if (u.pathname === "/client/v4/accounts") return answer(accounts);
    if (u.pathname.endsWith("/workers/observability/telemetry/query")) return answer({calculations: [{alias: "lines", aggregates}]});
    if (u.pathname.endsWith("/query")) {
      if (/FROM ai_calls/.test(body.sql)) return answer([{results: [{feature: "coach", outcome: "ok", calls: 12, micros: 84000}, {feature: "coach", outcome: "ungrounded", calls: 1, micros: 7000}]}]);
      return answer([{results: [{people: 3, libraries: 2, versions: 24, characters: 3737336}]}]);
    }
    if (u.pathname.endsWith("/time_travel/bookmark")) {
      const at = Date.parse(u.searchParams.get("timestamp"));
      return at >= NOW - reach * DAY - 60000 ? answer({bookmark: "0000004c-00000000"}) : refuse("internal error");
    }
    if (u.pathname.endsWith("/r2/buckets")) return r2 ? answer({buckets: r2.map((name) => ({name}))}) : refuse("Please enable R2 through the Cloudflare Dashboard.");
    if (/\/d1\/database\/[^/]+$/.test(u.pathname)) return answer({created_at: made});
    return new Response("{}", {status: 404});
  };
  return {fetchImpl, sent};
}
const group = (ops, status, value) => ({value, count: value, groups: [{key: "ops", value: ops}, {key: "status", value: status}]});

/* What it asks, and that it only reads. */
{
  const cf = cloudflare({aggregates: [group("sync-conflict", 409, 2), group("5xx", 503, 4)]});
  const r = await weekly({profile: "cloud-staging", now: NOW, token: "t0k", fetchImpl: cf.fetchImpl});
  ok(cf.sent.every((s) => s.method === "GET" || (s.method === "POST" && /\/(telemetry\/query|query)$/.test(s.path))),
    `it only reads: ${cf.sent.length} requests, each a GET or a query`);
  const sql = cf.sent.filter((s) => s.path.endsWith(`/d1/database/${staging.cloud.database.id}/query`)).map((s) => s.body.sql);
  ok(sql.length === 2 && sql.every((q) => /^SELECT /.test(q) && !/email|body|INSERT|UPDATE|DELETE|DROP/i.test(q)),
    "the database is the profile's own, asked two SELECTs that read no address, no library and change nothing");
  ok(cf.sent.every((s) => s.auth === "Bearer t0k") && cf.sent[0].path === "/client/v4/accounts", "with the token, the account found from it");
  const logs = cf.sent.find((s) => s.path.endsWith("/telemetry/query")).body;
  eq(logs.parameters.filters, [{key: "$metadata.service", operation: "eq", type: "string", value: "crankmagic-staging"}, {key: "ops", operation: "exists", type: "string"}],
    "Workers Logs is asked for the profile's own Worker, and its monitoring lines only");
  eq([logs.timeframe, logs.parameters.groupBys.map((g) => g.value)], [{from: NOW - 7 * DAY, to: NOW}, ["ops", "status"]], "over the week, by kind and status");
  const ai = cf.sent.find((s) => /FROM ai_calls/.test(s.body?.sql || ""));
  eq(ai.body.params, [new Date(NOW - 7 * DAY).toISOString()], "the AI call log from a week ago");
  eq(r.lines, [{ops: "5xx", status: 503, count: 4}, {ops: "sync-conflict", status: 409, count: 2}], "the lines counted by kind and status");
  eq(r.incidents, 0, "a feature switched off (503) and sync conflicts are not incidents");
  eq([r.reach.days, r.reach.from], [30, "2026-09-24T21:40:07.000Z"], "Time Travel: its 30-day window, from just after the database was made");
  eq(r.r2, {on: false, why: "Please enable R2 through the Cloudflare Dashboard."}, "R2 not on, in Cloudflare's words");
  const md = render(r);
  ok(md.includes("**Incidents:** none.") && md.includes("- 5xx 503: 4") && md.includes("- coach ok: 12, 8.4¢") && md.includes("- coach ungrounded: 1, 0.7¢"),
    "the report: no incidents, the lines, the AI calls in cents");
  ok(md.includes("3 people, 2 libraries, 24 versions, 3.7 M characters") && md.includes("since 2026-09-24 21:40 UTC") && md.includes("not yet -- Please enable R2"),
    "what is held, Time Travel's reach and R2's state");
}

/* An incident, a shorter window, R2 on. */
{
  const cf = cloudflare({aggregates: [group("5xx", 500, 3), group("5xx", 502, 1), group("5xx", 503, 9)], made: "2026-01-01T00:00:00Z", reach: 7, r2: ["crankmagic-backups"]});
  const r = await weekly({profile: "cloud-staging", now: NOW, days: 14, fetchImpl: cf.fetchImpl});
  eq(r.incidents, 4, "a 500 and a 502 are incidents; a 503 is not");
  ok(render(r).includes("**Incidents:** 4"), "and the report says so");
  eq(cf.sent.find((s) => s.path.endsWith("/telemetry/query")).body.timeframe.from, NOW - 14 * DAY, "--days sets the window");
  eq([r.reach.days, r.reach.from], [7, new Date(NOW - 7 * DAY).toISOString()], "a database older than Free's 7-day window: Time Travel reaches 7 days");
  eq(r.r2, {on: true, buckets: ["crankmagic-backups"]}, "R2 on, with its buckets");
}

/* What it refuses. */
{
  await assert.rejects(weekly({profile: "github-pages", now: NOW, fetchImpl: cloudflare().fetchImpl}), /not a cloud profile/); checks += 1;
  await assert.rejects(weekly({profile: "cloud-staging", now: NOW, fetchImpl: cloudflare({accounts: [{id: "a"}, {id: "b"}]}).fetchImpl}), /CLOUDFLARE_ACCOUNT_ID/); checks += 1;
  const named = await weekly({profile: "cloud-staging", now: NOW, account: "acct9", fetchImpl: cloudflare({accounts: []}).fetchImpl});
  ok(named.reach, "an account named is used as given");
  await assert.rejects(weekly({profile: "cloud-staging", now: NOW, fetchImpl: cloudflare({aggregates: [{value: 3, groups: [{key: "status", value: 500}]}]}).fetchImpl}), /shape this check does not read/); checks += 1;
}

/* The command: the report printed, and its exit code. */
{
  const printed = [], out = {write: (t) => printed.push(t)};
  const quiet = await main(["--profile", "cloud-staging"], {CLOUDFLARE_ACCOUNT_ID: "acct1"}, {fetchImpl: cloudflare({aggregates: [group("5xx", 503, 2)]}).fetchImpl, out});
  const loud = await main(["--days", "3"], {CLOUDFLARE_ACCOUNT_ID: "acct1"}, {fetchImpl: cloudflare({aggregates: [group("5xx", 500, 1)]}).fetchImpl, out});
  eq([quiet, loud], [0, 1], "it exits 0 for a quiet week and 1 for a week with an incident");
  ok(printed.length === 2 && printed.every((t) => t.startsWith("# crankmagic-staging: the week to")), "and prints the report, for staging unless told otherwise");
}

console.log(`ops-week: ${checks} checks passed — the weekly check reads and changes nothing, counts the Worker's monitoring lines by kind and status, never reads an address, and names an incident.`);
