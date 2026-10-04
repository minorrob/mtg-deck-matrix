/* EVERY SUITE, SEVERAL AT A TIME, WITH AN EXIT CODE YOU CAN TRUST -- what runtests.sh runs.
 *
 *   node tools/run-suites.mjs        every suite, each one's output in full
 *   node tools/run-suites.mjs -q     one line per suite, output only from the ones that fail
 *
 * The suites are tests/*.mjs and game/tests/*.test.mjs, each run as `node <file>` from here. runtests.sh used to run
 * them one after another: about twenty minutes, one core busy while the rest idled. And a suite that never returned held
 * the gate with it: tests/table-sorting.mjs waited on a page for good on 2026-10-03, on a machine its other suites had
 * loaded, and the gate's second run never ended. Here:
 *
 *   - SUITE_JOBS suites run at a time (default: the cores less one, at most four);
 *   - a suite that drives a browser (it names tests/uat/browser-runner.mjs or Playwright) runs alone, after the others,
 *     as every suite once did: its waits were written for a quiet machine. Beside two engine suites, tests/table-board.mjs
 *     waited thirty seconds for its Focus button to hold still and failed (the gate on 03b9223b, 2026-10-04);
 *   - a suite still running after SUITE_TIMEOUT_MINUTES (default 20; the slowest, engine-gate's thousand games, takes a
 *     few) is stopped with every process it started, and fails, saying so;
 *   - the report is in the suites' order however they finish, and ends as runtests.sh's always did: the failures named
 *     again where they cannot be missed and a non-zero exit, or "N suites passed."
 */
import {spawn} from "node:child_process";
import {readdirSync, readFileSync} from "node:fs";
import {availableParallelism} from "node:os";
import path from "node:path";

const quiet = process.argv.includes("-q");
const ROOT = process.cwd();
const listed = (dir, suffix) => readdirSync(path.join(ROOT, dir)).filter((f) => f.endsWith(suffix)).sort().map((f) => `${dir}/${f}`);
const suites = [...listed("tests", ".mjs"), ...listed("game/tests", ".test.mjs")];
const BROWSER = /browser-runner|playwright/i;
const browser = new Set(suites.filter((file) => BROWSER.test(readFileSync(path.join(ROOT, file), "utf8"))));
const jobs = Math.max(1, Number(process.env.SUITE_JOBS) || Math.min(4, availableParallelism() - 1));
const timeoutMinutes = Number(process.env.SUITE_TIMEOUT_MINUTES) || 20;

const results = new Array(suites.length);
const running = new Map();
let printed = 0;
const began = Date.now();

/* What a suite said, and whether it passed: printed in the suites' order, as soon as every one before it is in. */
function report() {
  while (printed < suites.length && results[printed]) {
    const {file, ok, output, stopped} = results[printed];
    if (quiet) process.stdout.write(ok ? `  ok   ${file}\n` : `  FAIL ${file}${stopped ? ` (stopped after ${timeoutMinutes} minutes)` : ""}\n${output}${output.endsWith("\n") ? "" : "\n"}`);
    else process.stdout.write(`\n===== ${file} =====\n${output}${stopped ? `\n(stopped after ${timeoutMinutes} minutes)\n` : ""}`);
    printed += 1;
  }
}

/* Its own process group, so stopping it stops what it started: a server, a browser's driver. */
function run(index) {
  const file = suites[index], at = Date.now();
  const child = spawn(process.execPath, [file], {cwd: ROOT, env: process.env, stdio: ["ignore", "pipe", "pipe"], detached: true});
  let output = "", stopped = false;
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });
  const timer = setTimeout(() => { stopped = true; stop(child); }, timeoutMinutes * 60000);
  running.set(index, child);
  child.on("close", (code) => {
    clearTimeout(timer);
    running.delete(index);
    results[index] = {file, ok: code === 0 && !stopped, output, stopped, ms: Date.now() - at};
    report();
    schedule();
  });
}
function stop(child) {
  try { process.kill(-child.pid, "SIGKILL"); } catch { try { child.kill("SIGKILL"); } catch { /* gone */ } }
}

/* The order they start in: every other suite first, several at a time; then the browser suites, each alone. */
const order = [...suites.keys()].sort((a, b) => Number(browser.has(suites[a])) - Number(browser.has(suites[b])) || a - b);
let next = 0;
function schedule() {
  while (next < order.length) {
    const index = order[next];
    if (browser.has(suites[index])) {
      if (running.size > 0) break;
      run(index);
      next += 1;
      break;
    }
    if (running.size >= jobs) break;
    run(index);
    next += 1;
  }
  if (printed === suites.length) finish();
}

function finish() {
  const failed = results.filter((r) => !r.ok).map((r) => r.file);
  const slowest = [...results].sort((a, b) => b.ms - a.ms).slice(0, 5).map((r) => `${r.file} ${(r.ms / 1000).toFixed(0)} s`);
  process.stdout.write(`\nslowest: ${slowest.join(", ")}; ${((Date.now() - began) / 60000).toFixed(1)} minutes, ${jobs} at a time\n`);
  if (failed.length) {
    process.stdout.write(`FAILED: ${failed.join(" ")}\n`);
    process.exitCode = 1;
  } else process.stdout.write(`${suites.length} suites passed.\n`);
}

/* Stopped itself (the gate interrupted), it stops what it started rather than leaving it running. */
for (const [signal, code] of [["SIGINT", 130], ["SIGTERM", 143], ["SIGHUP", 129]]) process.on(signal, () => { for (const child of running.values()) stop(child); process.exit(code); });

if (!suites.length) { process.stdout.write("0 suites passed.\n"); } else schedule();
