#!/usr/bin/env node
/* THE WEEKLY CHECK (M3, docs/ops.md): what a cloud release did over the last week, for Rob and the session. It
 * reads and changes nothing.
 *
 *   node tools/ops-week.mjs [--profile cloud-staging] [--days 7]
 *
 * With CLOUDFLARE_API_TOKEN, and CLOUDFLARE_ACCOUNT_ID or a token that sees one account:
 * - Workers Logs: the Worker's monitoring lines (cloud/worker.mjs opsLine), counted by kind and status;
 * - D1: how many people, libraries and versions it holds, and the AI call log's week by feature and outcome --
 *   counts and cents, never an address;
 * - D1 Time Travel: how far back the database can be restored;
 * - R2: whether the nightly copy has somewhere to go (R2 is Rob's to turn on).
 * It exits 1 when the week holds an incident: a 5xx other than a feature switched off (503).
 */
import {PROFILES} from "./release-pages.mjs";

const API = "https://api.cloudflare.com/client/v4";
const DAY = 86400000;
/* Time Travel keeps 30 days on Workers Paid and 7 on Free (Cloudflare's D1 limits). */
const REACH = [30, 7];

/** The week's report for one cloud profile, from Cloudflare's API (fetchImpl), read-only. */
export async function weekly({profile, days = 7, now = Date.now(), account, token, fetchImpl = fetch}) {
  const p = PROFILES[profile];
  if (!p?.cloud) throw new Error(`${profile} is not a cloud profile (${Object.keys(PROFILES).filter((k) => PROFILES[k].cloud).join(", ")})`);
  const cf = async (path, init = {}) => {
    const response = await fetchImpl(`${API}${path}`, {...init, headers: {...(token ? {authorization: `Bearer ${token}`} : {}), ...(init.body ? {"content-type": "application/json"} : {})}});
    const json = await response.json().catch(() => null);
    return json || {success: false, errors: [{message: `HTTP ${response.status}`}]};
  };
  const must = (json, what) => {
    if (!json.success) throw new Error(`${what}: ${(json.errors || []).map((e) => e.message).join("; ") || "refused"}`);
    return json.result;
  };
  if (!account) {
    const accounts = must(await cf("/accounts"), "the token's accounts");
    if (accounts.length !== 1) throw new Error(`the token sees ${accounts.length} accounts: set CLOUDFLARE_ACCOUNT_ID`);
    account = accounts[0].id;
  }
  const base = `/accounts/${account}`, since = now - days * DAY, db = p.cloud.database.id;

  /* Workers Logs: the Worker's own lines, by kind and status. */
  const logs = must(await cf(`${base}/workers/observability/telemetry/query`, {method: "POST", body: JSON.stringify({
    queryId: "crankmagic-ops-week", timeframe: {from: since, to: now}, view: "calculations", limit: 100,
    parameters: {datasets: ["cloudflare-workers"],
      filters: [{key: "$metadata.service", operation: "eq", type: "string", value: p.worker}, {key: "ops", operation: "exists", type: "string"}],
      calculations: [{operator: "count", alias: "lines"}],
      groupBys: [{type: "string", value: "ops"}, {type: "number", value: "status"}]},
  })}), "Workers Logs");
  const lines = (logs.calculations?.[0]?.aggregates || []).map((a) => {
    const group = Object.fromEntries((a.groups || []).map((g) => [g.key, g.value]));
    if (!group.ops || !Number.isFinite(Number(group.status)) || !Number.isFinite(Number(a.value)))
      throw new Error(`Workers Logs answered in a shape this check does not read: ${JSON.stringify(a).slice(0, 200)}`);
    return {ops: group.ops, status: Number(group.status), count: Number(a.value)};
  }).sort((a, b) => a.ops.localeCompare(b.ops) || a.status - b.status);

  /* D1: counts only. The SQL reads no address and writes nothing. */
  const sql = async (statement, params = []) => must(await cf(`${base}/d1/database/${db}/query`, {method: "POST", body: JSON.stringify({sql: statement, params})}), "D1")[0].results;
  const [held] = await sql("SELECT (SELECT count(*) FROM users) AS people, (SELECT count(*) FROM heads) AS libraries, (SELECT count(*) FROM snapshots) AS versions, (SELECT coalesce(sum(size), 0) FROM snapshots) AS characters");
  const ai = await sql("SELECT feature, outcome, count(*) AS calls, coalesce(sum(cost_micros), 0) AS micros FROM ai_calls WHERE at >= ?1 GROUP BY feature, outcome ORDER BY feature, outcome", [new Date(since).toISOString()]);

  /* Time Travel: the furthest of its windows the database answers a bookmark for, or since it was made. */
  const made = Date.parse(must(await cf(`${base}/d1/database/${db}`), "the database").created_at);
  let reach = null;
  for (const d of REACH) {
    const at = Math.max(now - d * DAY, made + 60000);
    if ((await cf(`${base}/d1/database/${db}/time_travel/bookmark?timestamp=${encodeURIComponent(new Date(at).toISOString())}`)).success) {reach = {days: d, from: new Date(at).toISOString()}; break;}
  }

  /* R2: where the nightly copy would go. */
  const r2 = await cf(`${base}/r2/buckets`);
  return {profile, worker: p.worker, database: p.cloud.database.name, days, from: new Date(since).toISOString(), to: new Date(now).toISOString(),
    lines, incidents: lines.filter((l) => l.ops === "5xx" && l.status !== 503).reduce((n, l) => n + l.count, 0),
    held, ai, reach, r2: r2.success ? {on: true, buckets: (r2.result?.buckets || []).map((b) => b.name)} : {on: false, why: (r2.errors || []).map((e) => e.message).join("; ")}};
}

const cents = (micros) => `${(micros / 10000).toFixed(1)}¢`;

/** The report as the Markdown a person reads. */
export function render(r) {
  const out = [`# ${r.worker}: the week to ${r.to.slice(0, 10)}`, ""];
  out.push(`**Incidents:** ${r.incidents ? `${r.incidents} (a 5xx other than a feature switched off)` : "none"}.`, "");
  out.push("**Monitoring lines** (Workers Logs):");
  out.push(...(r.lines.length ? r.lines.map((l) => `- ${l.ops} ${l.status}: ${l.count}`) : ["- none"]), "");
  out.push(`**Held** (D1 ${r.database}): ${r.held.people} people, ${r.held.libraries} libraries, ${r.held.versions} versions, ${(r.held.characters / 1e6).toFixed(1)} M characters.`, "");
  out.push("**AI calls** (the call log):");
  out.push(...(r.ai.length ? r.ai.map((a) => `- ${a.feature} ${a.outcome}: ${a.calls}, ${cents(a.micros)}`) : ["- none"]), "");
  out.push(`**Time Travel:** ${r.reach ? `restorable to any minute since ${r.reach.from.slice(0, 16).replace("T", " ")} UTC (its ${r.reach.days}-day window)` : "no bookmark answered: check the database"}.`, "");
  out.push(`**Nightly copy (R2):** ${r.r2.on ? `R2 is on (${r.r2.buckets.join(", ") || "no bucket yet"})` : `not yet -- ${r.r2.why.replace(/\.$/, "")}`}.`);
  return out.join("\n") + "\n";
}

/** The command: the report on `out`, and 1 for a week that holds an incident. */
export async function main(argv, env, {fetchImpl = fetch, out = process.stdout} = {}) {
  const arg = (name, fallback) => {const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : fallback;};
  const report = await weekly({profile: arg("profile", "cloud-staging"), days: Number(arg("days", 7)), account: env.CLOUDFLARE_ACCOUNT_ID, token: env.CLOUDFLARE_API_TOKEN, fetchImpl});
  out.write(render(report));
  return report.incidents ? 1 : 0;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exitCode = await main(process.argv.slice(2), process.env);
