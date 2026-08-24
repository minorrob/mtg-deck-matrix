// Runs the whole pipeline over several variants at once: request, candidate
// pool, baseline, optimization loop, result. Every per-variant cap in
// sim/config.json still applies, and the batch adds one of its own so a sweep
// cannot run away.
//
//   node tools/sim/run-batch.mjs --variants 5o,1o,3c
//   node tools/sim/run-batch.mjs --all --baseline-only
//   node tools/sim/run-batch.mjs --variants 5o --max-batch-ms 120000

import {spawn} from "node:child_process";
import path from "node:path";
import {parseArgs, loadCatalog, loadConfig, readJson, writeJson, ROOT, SIM_DIR, relative} from "./lib.mjs";

const args = parseArgs(process.argv.slice(2));
const config = await loadConfig();
const {buyPlans, variants} = await loadCatalog();

if (!args.variants && !args.all) {
  console.log("Usage: node tools/sim/run-batch.mjs --variants <a,b,c> | --all [--stage tuned|maxed] [--online] [--baseline-only] [--table <name>] [--max-batch-ms <ms>]");
  process.exit(1);
}

const requested = args.all
  ? Object.keys(buyPlans.plans)
  : String(args.variants).split(",").map((entry) => entry.trim()).filter(Boolean);
const unknown = requested.filter((id) => !buyPlans.plans[id]);
if (unknown.length) throw new Error(`Unknown variant ids: ${unknown.join(", ")}`);

const maxBatchMs = Math.max(10000, Number(args["max-batch-ms"] || 20 * 60 * 1000));
const startedAt = Date.now();

function run(script, scriptArgs) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(ROOT, "tools/sim", script), ...scriptArgs], {cwd: ROOT, stdio: ["ignore", "pipe", "pipe"]});
    let out = "";
    let err = "";
    child.stdout.on("data", (chunk) => { out += chunk; });
    child.stderr.on("data", (chunk) => { err += chunk; });
    child.on("close", (code) => resolve({code, out, err}));
  });
}

const summary = [];
for (const variantId of requested) {
  if (Date.now() - startedAt > maxBatchMs) {
    console.log(`\nStopped the batch at its ${Math.round(maxBatchMs / 1000)}-second budget with ${summary.length} of ${requested.length} variants done.`);
    break;
  }
  const variant = variants.variants.find((entry) => entry.id === variantId);
  process.stdout.write(`\n${variantId} · ${variant?.name || buyPlans.plans[variantId].deckName}\n`);
  const made = await run("make-request.mjs", ["--variant", variantId, ...(args.stage ? ["--stage", String(args.stage)] : []), ...(args.table ? ["--table", String(args.table)] : [])]);
  if (made.code !== 0) {
    console.log(`  request failed: ${made.err.trim() || made.out.trim()}`);
    summary.push({variantId, error: "request failed"});
    continue;
  }
  const requestFile = (made.out.match(/written to\s+(\S+)/) || [])[1];
  const pooled = await run("fetch-candidates.mjs", ["--request", requestFile, ...(args.online ? [] : ["--offline"])]);
  if (pooled.code !== 0) {
    console.log(`  candidate pool failed: ${pooled.err.trim()}`);
    summary.push({variantId, error: "pool failed"});
    continue;
  }
  console.log(`  ${pooled.out.split("\n")[0]}`);
  const mode = args["baseline-only"] ? ["--init"] : ["--init", "--auto"];
  const simmed = await run("run-sim.mjs", ["--request", requestFile, ...mode]);
  process.stdout.write(simmed.out.split("\n").map((line) => (line ? `  ${line}` : "")).join("\n"));
  if (simmed.code === 1) {
    console.log(`  run failed: ${simmed.err.trim()}`);
    summary.push({variantId, error: simmed.err.trim()});
    continue;
  }
  const request = await readJson(path.resolve(ROOT, requestFile));
  const resultPath = path.join(SIM_DIR, "results", `${request.id}.json`);
  const result = await readJson(resultPath, null);
  const baselinePath = path.join(SIM_DIR, "results", `${request.id}.iter0.json`);
  const baseline = await readJson(baselinePath, null);
  summary.push({
    variantId,
    name: request.name,
    commander: request.commander,
    stage: request.stage,
    tier: request.constraints?.tier,
    requestId: request.id,
    exitCode: simmed.code,
    baselineScore: baseline?.metrics.score ?? null,
    baselineWinRate: baseline?.metrics.winRate ?? null,
    baselineFunScore: baseline?.metrics.funScore ?? null,
    finalScore: result?.finalMetrics.score ?? baseline?.metrics.score ?? null,
    finalWinRate: result?.finalMetrics.winRate ?? baseline?.metrics.winRate ?? null,
    finalFunScore: result?.finalMetrics.funScore ?? baseline?.metrics.funScore ?? null,
    holdoutScore: result?.holdoutMetrics?.score ?? null,
    holdoutWinRate: result?.holdoutMetrics?.winRate ?? null,
    holdoutFunScore: result?.holdoutMetrics?.funScore ?? null,
    swaps: result?.swapsApplied?.length ?? 0,
    stopReason: result?.stopReason || "baseline only",
    resultPath: result ? relative(resultPath) : relative(baselinePath)
  });
}

const out = path.join(SIM_DIR, "results", "batch-summary.json");
await writeJson(out, {
  schemaVersion: 1,
  finishedAt: new Date().toISOString(),
  table: args.table || config.table,
  baselineOnly: Boolean(args["baseline-only"]),
  variants: summary
});

console.log("\n=== batch summary ===");
summary
  .filter((entry) => entry.finalScore !== null && entry.finalScore !== undefined)
  .sort((a, b) => b.finalScore - a.finalScore)
  .forEach((entry) => {
    const delta = entry.baselineScore === null ? "" : ` (${entry.finalScore - entry.baselineScore >= 0 ? "+" : ""}${(entry.finalScore - entry.baselineScore).toFixed(1)})`;
    const holdout = entry.holdoutScore === null ? "" : ` · holdout ${entry.holdoutScore.toFixed(1)}`;
    console.log(`${entry.variantId.padEnd(4)} ${String(entry.finalScore.toFixed(1)).padStart(5)}${delta.padEnd(8)} win ${(entry.finalWinRate * 100).toFixed(1)}%${holdout} · ${entry.swaps} swaps · ${entry.name}`);
  });
console.log(`\nwritten to ${relative(out)}`);
