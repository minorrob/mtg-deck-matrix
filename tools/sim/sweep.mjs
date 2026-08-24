// Runs every variant through every rung, and writes what each one measured.
//
//   node tools/sim/sweep.mjs                    # all fifty variants, four rungs each
//   node tools/sim/sweep.mjs --variant 9c       # one variant
//   node tools/sim/sweep.mjs --decks 7,8,9,10   # a subset of decks
//   node tools/sim/sweep.mjs --resume           # skip rungs already written
//   node tools/sim/sweep.mjs --offline          # build candidate pools without Scryfall
//
// The four rungs and what each is for:
//
//   Base    the cheapest hundred that is still this deck. Measured, never
//           optimized -- its job is to show what the entry price buys.
//   Tuned   optimized for raw power, Tier 2, $60 a card. "How well can this
//           deck win."
//   Pod Fun optimized for the table's night rather than yours: win rate scored
//           against a 30-45% band instead of maximized, pod experience weighted,
//           and held to a power floor taken from this variant's own Tuned build
//           so the fun rung can never be the stronger one.
//   Max     optimized for raw power again, but at Tier 3 and $100 a card.
//
// Each optimizing rung runs until the improvements are negligible, which the
// runner defines as smaller than the sampling noise or under 5% of the score
// already reached, whichever is larger.

import path from "node:path";
import {spawnSync} from "node:child_process";
import {readdir} from "node:fs/promises";
import {parseArgs, readJson, writeJson, loadCatalog, loadConfig, fileExists, relative, ROOT, SIM_DIR, RESULTS_DIR, CACHE_DIR} from "./lib.mjs";

const args = parseArgs(process.argv.slice(2));
const config = await loadConfig();
const {buyPlans} = await loadCatalog();
const SWEEP_DIR = path.join(SIM_DIR, "sweep");

let variantIds = Object.keys(buyPlans.plans);
if (args.variant) variantIds = String(args.variant).split(",").map((id) => id.trim());
if (args.decks) {
  const wanted = new Set(String(args.decks).split(",").map((id) => id.trim()));
  variantIds = variantIds.filter((id) => wanted.has(String(buyPlans.plans[id].deckId)));
}

const locksFor = (variantId) => (buyPlans.ownedLocks || [])
  .filter((lock) => lock.variantId === variantId)
  .map((lock) => lock.card);

function run(script, scriptArgs, {quiet = true} = {}) {
  const result = spawnSync(process.execPath, [path.join(ROOT, "tools/sim", script), ...scriptArgs], {
    encoding: "utf8",
    stdio: quiet ? "pipe" : "inherit",
    env: process.env,
    maxBuffer: 64 * 1024 * 1024
  });
  return {status: result.status ?? 1, stdout: result.stdout || "", stderr: result.stderr || ""};
}

// One pool per variant per tier, reused across the rungs that share a tier, so
// fifty variants cost a hundred Scryfall passes rather than two hundred.
const pools = new Map();
// Full card data for everything a variant's runs are allowed to reach for,
// keyed by variant then by lowercased name.
const poolMeta = new Map();
async function poolFor(variantId, tier, requestPath) {
  const key = `${variantId}-t${tier}`;
  if (pools.has(key)) return pools.get(key);
  const out = path.join(CACHE_DIR, `pool-sweep-${key}.json`);
  if (!(await fileExists(out))) {
    const build = run("fetch-candidates.mjs", ["--request", requestPath, "--out", out, ...(args.offline ? ["--offline"] : [])]);
    if (build.status !== 0) throw new Error(`candidate pool for ${variantId} failed: ${build.stderr.trim() || build.stdout.trim()}`);
  }
  pools.set(key, out);
  const loaded = await readJson(out, {candidates: []});
  if (!poolMeta.has(variantId)) poolMeta.set(variantId, new Map());
  loaded.candidates.forEach((candidate) => poolMeta.get(variantId).set(String(candidate.name).toLowerCase(), candidate));
  return out;
}

const STAGES = [
  {key: "base", label: "Base", optimize: false},
  {key: "tuned", label: "Tuned", optimize: true},
  {key: "podfun", label: "Pod Fun", optimize: true, constrained: true},
  // Max runs last, after any reconciliation has settled what Tuned is, so it
  // always starts from the final Tuned hundred rather than from a list that
  // then moves out from under it.
  {key: "maxed", label: "Max", optimize: true, afterReconcile: true}
];

async function runStage(variantId, stage, {powerFloor, startFrom, suffix = ""} = {}) {
  const requestPath = path.join(SWEEP_DIR, "requests", `${variantId}-${stage.key}${suffix}.json`);
  const locks = locksFor(variantId);
  let cardsPath = null;
  if (startFrom) {
    cardsPath = path.join(CACHE_DIR, `seed-${variantId}-${stage.key}${suffix}.json`);
    // A result file records only what a reader needs, so a list taken from one
    // has no oracle text and no color identity. Fill it back in from the pool
    // the optimizer drew from, which covers the Scryfall cards the site's own
    // catalog has never seen.
    await writeJson(cardsPath, {cards: startFrom.map((card) => ({...(poolMeta.get(variantId)?.get(card.name.toLowerCase()) || {}), ...card}))});
  }
  const make = run("make-request.mjs", [
    "--variant", variantId,
    "--stage", stage.key,
    "--out", requestPath,
    ...(cardsPath ? ["--cards", cardsPath] : []),
    ...(locks.length ? ["--lock", locks.join(";")] : []),
    ...(Number.isFinite(powerFloor) ? ["--power-floor", String(powerFloor)] : [])
  ]);
  // Exit 2 means the rung genuinely does not exist for this variant, which is
  // not a failure -- it is a deck with no such ladder, and inventing one would
  // publish a build nobody can buy.
  if (make.status === 2) return {skipped: "no ladder for this rung"};
  if (make.status !== 0) throw new Error(`${variantId} ${stage.label} request failed: ${make.stderr.trim() || make.stdout.trim()}`);

  const request = await readJson(requestPath);
  const poolPath = await poolFor(variantId, request.constraints.tier, requestPath);
  const common = ["--request", requestPath, "--pool", poolPath, "--quiet"];

  const init = run("run-sim.mjs", [...common, "--init"]);
  if (init.status !== 0 && init.status !== 10) throw new Error(`${variantId} ${stage.label} baseline failed (exit ${init.status}): ${init.stderr.trim() || init.stdout.trim()}`);

  if (stage.optimize) {
    const auto = run("run-sim.mjs", [...common, "--auto"]);
    // 10 converged, 11 hit a cap, 12 hit the iteration limit, 13 ran out of
    // wall clock. All four are ordinary stopping points that still leave the
    // best measured list behind; only a real error is a failure.
    if (![10, 11, 12, 13].includes(auto.status)) {
      throw new Error(`${variantId} ${stage.label} optimize failed (exit ${auto.status}): ${auto.stderr.trim() || auto.stdout.trim()}`);
    }
  } else {
    run("run-sim.mjs", [...common, "--finalize"]);
  }

  const finished = await readJson(path.join(RESULTS_DIR, `${request.id}.json`), null);
  if (!finished) throw new Error(`${variantId} ${stage.label} produced no result file`);
  return {request, result: finished};
}

const summary = [];
const started = Date.now();
for (const variantId of variantIds) {
  const plan = buyPlans.plans[variantId];
  const outPath = path.join(SWEEP_DIR, `${variantId}.json`);
  if (args.resume && await fileExists(outPath)) {
    console.log(`${variantId.padEnd(4)} already swept, skipping`);
    summary.push(await readJson(outPath));
    continue;
  }
  const rungs = {};
  // Each rung starts where the one below it finished. Two independent
  // hill-climbs from the same list land in different local optima, which is how
  // a Tier 3 Max rung with twice the budget managed to come out weaker than the
  // Tuned rung it is supposed to be an upgrade of. Starting Max and Pod Fun
  // from the hundred Tuned actually reached means neither can be worse than its
  // parent by construction: the search only ever accepts improvements.
  let tunedPower = null;
  let tunedCardList = null;
  const fullCards = {};
  const noteRung = (stage, outcome, powerFloor) => {
    const metrics = outcome.result.finalMetrics || outcome.result.metrics;
    const power = Number(metrics.powerScore ?? metrics.score);
    rungs[stage.key] = {
      label: stage.label,
      tier: outcome.request.constraints.tier,
      requestId: outcome.request.id,
      score: Number(metrics.score.toFixed(1)),
      powerScore: Number(power.toFixed(1)),
      winRate: Number(metrics.winRate.toFixed(4)),
      podFunScore: Number((metrics.podFunScore ?? 0).toFixed(3)),
      funScore: Number((metrics.funScore ?? 0).toFixed(3)),
      avgEndTurn: Number((metrics.avgEndTurn ?? 0).toFixed(2)),
      iterations: outcome.result.iterations ?? 0,
      gamesUsed: outcome.result.totalGamesUsed ?? 0,
      verdict: outcome.result.verdict ?? null,
      stopReason: outcome.result.stopReason ?? outcome.result.note ?? null,
      powerFloor: powerFloor ?? null,
      changes: (outcome.result.recommendedChanges || outcome.result.netChanges || []).length,
      cards: (outcome.result.finalCards || outcome.result.cards || []).map((card) => ({name: card.name, quantity: Math.max(1, Number(card.quantity || 1))}))
    };
    console.log(`${variantId.padEnd(4)} ${stage.label.padEnd(8)} score ${String(rungs[stage.key].score).padStart(5)}  power ${String(rungs[stage.key].powerScore).padStart(5)}  win ${(rungs[stage.key].winRate * 100).toFixed(1).padStart(5)}%  podFun ${rungs[stage.key].podFunScore.toFixed(2)}  ${rungs[stage.key].iterations} iters  ${rungs[stage.key].gamesUsed} games`);
    fullCards[stage.key] = outcome.result.finalCards || outcome.result.cards || [];
    return {power, cards: fullCards[stage.key]};
  };

  const floorFor = () => (tunedPower === null ? undefined : Number((tunedPower * Number(config.powerFloorRatio ?? 0.9)).toFixed(1)));

  for (const stage of STAGES.filter((entry) => !entry.afterReconcile)) {
    const startFrom = stage.key === "podfun" || stage.key === "maxed" ? tunedCardList : null;
    const outcome = await runStage(variantId, stage, {powerFloor: stage.constrained ? floorFor() : undefined, startFrom});
    if (outcome.skipped) {
      console.log(`${variantId.padEnd(4)} ${stage.label.padEnd(8)} skipped — ${outcome.skipped}`);
      continue;
    }
    const done = noteRung(stage, outcome, stage.constrained ? floorFor() : null);
    if (stage.key === "tuned") {
      tunedPower = done.power;
      tunedCardList = done.cards;
    }
  }

  // Reconciliation. If the constrained rung still found more raw power than the
  // rung chasing raw power, that list is by definition a better answer to
  // Tuned's own question, so Tuned adopts it and both are measured again from
  // there. Bounded, because this is a tie-break and not a second optimizer.
  for (let round = 0; round < 2; round += 1) {
    if (!rungs.tuned || !rungs.podfun || rungs.podfun.powerScore <= rungs.tuned.powerScore) break;
    console.log(`${variantId.padEnd(4)} reconciling  Pod Fun out-powered Tuned by ${(rungs.podfun.powerScore - rungs.tuned.powerScore).toFixed(1)}, re-running Tuned from its list`);
    const suffix = `-r${round + 1}`;
    const again = await runStage(variantId, STAGES[1], {startFrom: fullCards.podfun, suffix});
    if (again.skipped) break;
    const tuned = noteRung(STAGES[1], again, null);
    tunedPower = tuned.power;
    tunedCardList = tuned.cards;
    const refun = await runStage(variantId, STAGES[2], {powerFloor: floorFor(), startFrom: tunedCardList, suffix});
    if (refun.skipped) break;
    noteRung(STAGES[2], refun, floorFor());
  }

  for (const stage of STAGES.filter((entry) => entry.afterReconcile)) {
    const outcome = await runStage(variantId, stage, {startFrom: tunedCardList});
    if (outcome.skipped) {
      console.log(`${variantId.padEnd(4)} ${stage.label.padEnd(8)} skipped — ${outcome.skipped}`);
      continue;
    }
    noteRung(stage, outcome, null);
  }

  // The invariant, checked rather than assumed. If the constrained rung somehow
  // came out stronger than the rung that was chasing strength, that is a fact
  // about the search, and it gets recorded instead of quietly averaged away.
  const inversion = rungs.tuned && rungs.podfun && rungs.podfun.powerScore > rungs.tuned.powerScore
    ? {by: Number((rungs.podfun.powerScore - rungs.tuned.powerScore).toFixed(1))}
    : null;
  if (inversion) console.log(`${variantId.padEnd(4)} INVERSION  Pod Fun out-powers Tuned by ${inversion.by}`);

  const record = {
    schemaVersion: 1,
    variantId,
    deckId: plan.deckId,
    name: plan.deckName,
    commander: plan.commander,
    locks: locksFor(variantId),
    sweptAt: new Date().toISOString(),
    engine: "v2.4",
    table: config.table,
    rungs,
    inversion
  };
  await writeJson(outPath, record);
  summary.push(record);
}

const elapsed = ((Date.now() - started) / 1000).toFixed(0);
const ledger = await readJson(path.join(SIM_DIR, "sim-ledger.json"), {totalGames: 0});
const inversions = summary.filter((row) => row.inversion);
console.log(`\n${summary.length} variants swept in ${elapsed}s · ledger at ${ledger.totalGames} of ${config.maxLedgerSimulations} games`);
if (inversions.length) console.log(`${inversions.length} inversion(s): ${inversions.map((row) => row.variantId).join(", ")}`);
console.log(`written to ${relative(SWEEP_DIR)}/`);
