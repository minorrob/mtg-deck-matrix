/* THE EIGHT CI SHARDS RUN EVERY SUITE, EACH EXACTLY ONCE (ROB-351, 2026-11-01).
 *
 * The Tests workflow runs tools/run-suites.mjs as a matrix of eight jobs, each with SUITE_SHARD="i/8", because the
 * 724 suites no longer fit one job's 60-minute cap (run 41144141088 was canceled at 60:39). The partition is the
 * whole point: a suite in no shard is a suite nobody runs (the README's own warning), and a suite in two shards
 * spends a runner twice. So this asks the runner itself, through `--list`, what each shard would run, and checks:
 *
 *   - the eight lists together are exactly the full list, with no suite missing and none twice;
 *   - no shard is empty or lopsided (each holds about an eighth: the slow browser suites are dealt round-robin
 *     separately from the rest, so no job holds all of them);
 *   - a SUITE_SHARD that is not "i/n" is ignored and every suite runs, as on a machine with it unset.
 *
 * Breaking the runner's filter (every shard running everything; shard 0 running nothing; the modulus read as the
 * index) turns each of these red.
 */
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {readFileSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SHARDS = 8;
let checks = 0;
const check = (ok, message) => { assert.ok(ok, message); checks += 1; };

function listed(shard) {
  const env = {...process.env};
  delete env.SUITE_SHARD;
  if (shard !== undefined) env.SUITE_SHARD = shard;
  const run = spawnSync(process.execPath, ["tools/run-suites.mjs", "--list"], {cwd: ROOT, env, encoding: "utf8"});
  assert.equal(run.status, 0, `run-suites --list (SUITE_SHARD=${shard}) exited ${run.status}: ${run.stderr}`);
  return run.stdout.split("\n").filter(Boolean);
}

const every = listed();
check(every.length > 500, `the runner lists every suite when SUITE_SHARD is unset (got ${every.length})`);
check(every.includes("tests/suite-shards.mjs") && every.some((f) => f.startsWith("game/tests/")), "the list covers both trees");
check(new Set(every).size === every.length, "the full list names no suite twice");

const shards = Array.from({length: SHARDS}, (_, i) => listed(`${i}/${SHARDS}`));
const together = shards.flat();
check(together.length === every.length, `the ${SHARDS} shards together hold ${every.length} suites, not ${together.length}`);
check(new Set(together).size === together.length, "no suite is in two shards");
const missing = every.filter((f) => !together.includes(f));
check(missing.length === 0, `every suite is in some shard; missing: ${missing.slice(0, 5).join(", ")}`);
const extra = together.filter((f) => !every.includes(f));
check(extra.length === 0, `no shard lists a suite the full run does not: ${extra.slice(0, 5).join(", ")}`);

const sizes = shards.map((s) => s.length);
const ideal = every.length / SHARDS;
check(sizes.every((n) => n > 0), `no shard is empty: ${sizes.join(" ")}`);
check(sizes.every((n) => Math.abs(n - ideal) <= 2), `each shard holds about an eighth (${ideal.toFixed(1)} ± 2): ${sizes.join(" ")}`);
/* The runner deals the browser suites (those that drive a browser, by the two words the runner looks for) round-robin on
   their own, so no job holds all the slow ones. The words are assembled here so this file is not itself taken for one. */
const BROWSER = new RegExp(["browser", "runner"].join("-") + "|play" + "wright", "i");
const isBrowser = (file) => BROWSER.test(readFileSync(path.join(ROOT, file), "utf8"));
const browserTotal = every.filter(isBrowser).length;
const browserSizes = shards.map((s) => s.filter(isBrowser).length);
check(browserTotal > 50, `there are browser suites to spread (${browserTotal})`);
check(browserSizes.every((n) => Math.abs(n - browserTotal / SHARDS) < 1), `the browser suites are dealt evenly, ${(browserTotal / SHARDS).toFixed(1)} a shard: ${browserSizes.join(" ")}`);
for (const [i, s] of shards.entries()) check(s.every((f, k) => k === 0 || every.indexOf(s[k - 1]) < every.indexOf(f)), `shard ${i} keeps the runner's order`);

check(listed("eight").length === every.length, "a SUITE_SHARD that is not i/n is ignored and every suite runs");
check(listed("0/1").length === every.length, "one shard of one is every suite");

console.log(`suite-shards: ${checks} checks passed (${every.length} suites, ${SHARDS} shards of ${sizes.join("/")})`);
