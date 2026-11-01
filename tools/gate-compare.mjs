#!/usr/bin/env node
/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* "NO NEW FAILURE AGAINST MAIN", COMPUTED (ROB-377).
 *
 * A merge here has been made on "no new failure against main", because the Actions suites job is canceled at its 60-minute cap
 * (ROB-234) and a clean main is not green. Which failures are old was remembered by each merging session. This reads a run of
 * tools/run-suites.mjs and the committed list of failures known on a clean main (tools/gate/known-red-main.json) and says which
 * failures are NEW, which are OLD and which are FIXED:
 *
 *   node tools/run-suites.mjs -q > run.txt; node tools/gate-compare.mjs run.txt
 *   node tools/gate-compare.mjs --failed tests/a.mjs,tests/b.mjs        (a list, when the run was sharded)
 *   options: --baseline <file>  --today YYYY-MM-DD  --env actions|container (default actions, or GATE_ENV)
 *
 *   NEW      fails and the baseline does not list it, or lists it as failing only in the other environment (a suite that
 *            should pass here). Blocks the merge.
 *   EXPIRED  fails and is listed, but its entry's expiry has passed: fix it, retire it, or re-approve it with a new date.
 *            Blocks the merge.
 *   OLD      fails and is listed. Does not block; the merge report names it.
 *   FIXED    listed and passing: its entry is removed in the same change.
 *   SKIPPED  not judged: an entry for the other environment, or a flake that passed this run.
 *
 * The environment is part of the answer: the same suite can be red in the cloud container (Playwright 1.63) and green on Actions
 * (the pin), so a container run is advisory and "actions" is the gate.
 *
 * Exit 0 when nothing is NEW or EXPIRED, 1 when something is, 2 on a usage error. The file's rules (a suite that exists, a known
 * category, a cause, a Linear issue, dates) are held by tests/gate-baseline.mjs.
 */
import {existsSync, readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";

export const CATEGORIES = ["stale-anchor", "test-drift", "container-toolchain", "flake", "real-regression", "retired-candidate", "unknown"];
export const ENVIRONMENTS = ["actions", "container"];
export const UNKNOWN_DAYS = 7;
export const SCHEMA = "crankmagic.known-red@1";
const BASELINE_URL = new URL("./gate/known-red-main.json", import.meta.url);
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** The failing suites in the output of tools/run-suites.mjs: its FAILED line, and the "  FAIL <file>" lines of quiet mode. */
export function parseFailures(text) {
  const found = new Set();
  for (const line of String(text || "").split("\n")) {
    const failed = /^FAILED:\s*(.+)$/.exec(line);
    if (failed) for (const file of failed[1].trim().split(/\s+/)) if (/\.mjs$/.test(file)) found.add(file);
    const quiet = /^\s+FAIL\s+(\S+\.mjs)\b/.exec(line);
    if (quiet) found.add(quiet[1]);
  }
  return [...found].sort();
}

export function readBaseline(file) {
  return JSON.parse(readFileSync(file || BASELINE_URL, "utf8"));
}

/** The comparison. `failing` is a list of suite files, `baseline` the parsed file, `today` an ISO date, `env` where the run happened:
    "actions" (the sharded Actions run, the authoritative gate) or "container" (the cloud container, advisory). */
export function compare({failing, baseline, today, env = "actions"}) {
  const entries = new Map((baseline.entries || []).map((e) => [e.suite, e]));
  const out = {new: [], expired: [], old: [], fixed: [], skipped: [], ok: true};
  const failingSet = new Set(failing);
  for (const suite of [...failingSet].sort()) {
    const e = entries.get(suite);
    if (!e) out.new.push({suite, reason: "not in the baseline"});
    else if (e.onlyIn && e.onlyIn !== env) out.new.push({suite, reason: `listed as failing only in ${e.onlyIn}, and this run is in ${env}`, issue: e.issue});
    else if (e.expires < today) out.expired.push({suite, issue: e.issue, expires: e.expires});
    else out.old.push({suite, issue: e.issue, category: e.category});
  }
  for (const e of baseline.entries || []) {
    if (failingSet.has(e.suite)) continue;
    /* Not judged: an entry for another environment, and a flake, which passes some runs on purpose of its being a flake. */
    if (e.onlyIn && e.onlyIn !== env) out.skipped.push({suite: e.suite, issue: e.issue, why: `${e.onlyIn} only`});
    else if (e.category === "flake") out.skipped.push({suite: e.suite, issue: e.issue, why: "flake, passed this run"});
    else out.fixed.push({suite: e.suite, issue: e.issue});
  }
  out.ok = out.new.length === 0 && out.expired.length === 0;
  return out;
}

/** The file's rules: the problems, as sentences, or []. `suiteExists(path)` says whether a suite file is there. */
export function validateBaseline(baseline, {suiteExists}) {
  const problems = [];
  if (!baseline || baseline.schema !== SCHEMA) problems.push(`schema must be ${SCHEMA}`);
  const entries = Array.isArray(baseline && baseline.entries) ? baseline.entries : [];
  if (!Array.isArray(baseline && baseline.entries)) problems.push("entries must be a list");
  const seen = new Set();
  for (const e of entries) {
    const name = e && e.suite ? e.suite : "(an entry with no suite)";
    if (!e || typeof e.suite !== "string" || !/^(tests|game\/tests)\/[\w.-]+\.mjs$/.test(e.suite)) { problems.push(`${name}: suite must be a path such as tests/x.mjs`); continue; }
    if (seen.has(e.suite)) problems.push(`${name}: listed twice`);
    seen.add(e.suite);
    if (!suiteExists(e.suite)) problems.push(`${name}: the suite does not exist`);
    if (!CATEGORIES.includes(e.category)) problems.push(`${name}: category must be one of ${CATEGORIES.join(", ")}`);
    if (typeof e.cause !== "string" || !e.cause.trim()) problems.push(`${name}: cause is empty`);
    if (typeof e.issue !== "string" || !/^ROB-\d+$/.test(e.issue)) problems.push(`${name}: issue must be a Linear key such as ROB-250`);
    if (!DATE.test(e.firstSeen || "")) problems.push(`${name}: firstSeen must be an ISO date`);
    if (!DATE.test(e.expires || "")) problems.push(`${name}: expires must be an ISO date`);
    else if (DATE.test(e.firstSeen || "") && e.expires <= e.firstSeen) problems.push(`${name}: expires must be after firstSeen`);
    /* A cause nobody has found is allowed to stand for a week, so someone finds it. */
    if (e.category === "unknown" && DATE.test(e.expires || "") && DATE.test((baseline && baseline.asOf) || "") && e.expires > addDays(baseline.asOf, UNKNOWN_DAYS))
      problems.push(`${name}: an unknown cause may stand for ${UNKNOWN_DAYS} days after asOf; expires is later`);
    if (e.onlyIn !== undefined && !ENVIRONMENTS.includes(e.onlyIn)) problems.push(`${name}: onlyIn can only be ${ENVIRONMENTS.map((x) => `"${x}"`).join(" or ")}`);
  }
  return problems;
}

function addDays(iso, days) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function main(argv) {
  const opt = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
  const failedArg = opt("--failed");
  const file = argv.find((a, i) => !a.startsWith("--") && !["--failed", "--baseline", "--today", "--env"].includes(argv[i - 1]));
  let failing;
  if (failedArg !== undefined) failing = failedArg.split(",").map((s) => s.trim()).filter(Boolean);
  else if (file && existsSync(file)) failing = parseFailures(readFileSync(file, "utf8"));
  else { process.stderr.write("usage: node tools/gate-compare.mjs <run-output-file> | --failed a.mjs,b.mjs [--baseline f] [--today D] [--env container|full]\n"); return 2; }
  const baseline = readBaseline(opt("--baseline"));
  const today = opt("--today") || new Date().toISOString().slice(0, 10);
  const env = opt("--env") || process.env.GATE_ENV || "actions";
  if (!ENVIRONMENTS.includes(env)) { process.stderr.write(`--env must be ${ENVIRONMENTS.join(" or ")}\n`); return 2; }
  const r = compare({failing, baseline, today, env});
  const show = (label, rows, more) => { for (const x of rows) process.stdout.write(`  ${label.padEnd(8)} ${x.suite}${x.issue ? `  (${x.issue})` : ""}${more ? more(x) : ""}\n`); };
  show("NEW", r.new, (x) => `  ${x.reason}`);
  show("EXPIRED", r.expired, (x) => `  expired ${x.expires}`);
  show("OLD", r.old);
  show("FIXED", r.fixed, () => "  remove its entry");
  show("SKIPPED", r.skipped, (x) => `  ${x.why}`);
  process.stdout.write(`${failing.length} failing: ${r.new.length} new, ${r.expired.length} expired, ${r.old.length} old; ${r.fixed.length} fixed. ${r.ok ? "No new failure against main." : "Blocked: not green and not the known red."}\n`);
  return r.ok ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
