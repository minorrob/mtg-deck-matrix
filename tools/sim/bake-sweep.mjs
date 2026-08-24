// Turns the sweep's per-variant records into the numbers the site publishes.
//
//   node tools/sim/bake-sweep.mjs             # report what would change
//   node tools/sim/bake-sweep.mjs --write     # write data/simulation-summary.json
//
// Every figure here is something a run actually measured. Nothing is carried
// over from an earlier engine, and nothing is filled in for a rung that was not
// simulated -- a null in this file means "not measured", never "assume it is
// like the one above it".

import path from "node:path";
import {readdir} from "node:fs/promises";
import {parseArgs, readJson, writeJson, loadCatalog, loadConfig, relative, ROOT, SIM_DIR} from "./lib.mjs";

const args = parseArgs(process.argv.slice(2));
const config = await loadConfig();
const {variants, buyPlans} = await loadCatalog();
// The commander comparisons are research, not measurement -- they were written
// by reading cards, not by running games -- so a sweep neither produces them
// nor gets to drop them.
const previous = await readJson(path.join(ROOT, "data/simulation-summary.json"), {});
const SWEEP_DIR = path.join(SIM_DIR, "sweep");

const files = (await readdir(SWEEP_DIR).catch(() => [])).filter((name) => name.endsWith(".json"));
if (!files.length) {
  console.error(`No sweep records in ${relative(SWEEP_DIR)}. Run: node tools/sim/sweep.mjs`);
  process.exit(1);
}
const records = new Map();
for (const file of files) {
  const record = await readJson(path.join(SWEEP_DIR, file));
  records.set(record.variantId, record);
}

const ENGINE = "v2.4";
const RUNGS = [
  ["base", "Base", "the cheapest hundred that is still this deck, measured exactly as it stands"],
  ["tuned", "Tuned", "optimized for raw power at Tier 2, $60 a card"],
  ["podfun", "Pod Fun", "optimized for the table's night: win rate held under the band's ceiling, pod experience weighted, and floored on power so it can never be the stronger build"],
  ["maxed", "Max", "optimized for raw power again, at Tier 3 and $100 a card"]
];

const builds = {};
const missing = [];
for (const variant of variants.variants) {
  const record = records.get(variant.id);
  if (!record) {
    missing.push(variant.id);
    continue;
  }
  const entry = {};
  RUNGS.forEach(([key, label, note]) => {
    const rung = record.rungs?.[key];
    if (!rung) {
      entry[label] = {group: "Measured rungs", games: null, score: null, winPct: null, note: "not measured"};
      return;
    }
    entry[label] = {
      group: "Measured rungs",
      games: rung.gamesUsed ?? null,
      holdoutGames: config.holdoutGames ?? null,
      score: rung.score,
      // What the same list scores on the performance vector, whatever it was
      // optimizing. This is the only number that compares across rungs.
      powerScore: rung.powerScore,
      winPct: rung.winRate,
      podFunPct: rung.podFunScore,
      funPct: rung.funScore,
      avgWinTurn: rung.avgEndTurn,
      tier: rung.tier,
      iterations: rung.iterations,
      powerFloor: rung.powerFloor,
      verdict: rung.verdict,
      swaps: rung.changes,
      engine: ENGINE,
      note,
      stopReason: rung.stopReason
    };
  });
  builds[variant.id] = entry;
}

const inversions = Array.from(records.values()).filter((record) => record.inversion);
const overCeiling = Array.from(records.values()).filter((record) => {
  const podfun = record.rungs?.podfun;
  return podfun && podfun.winRate > Number(config.winRateBand?.ceiling ?? 1) + 0.005;
});

const summary = {
  schemaVersion: 3,
  generatedAt: new Date().toISOString(),
  engine: ENGINE,
  table: config.table,
  engineNotes: {
    [ENGINE]: `Measured on the ${ENGINE} engine: nine opponent archetypes, a four-rung ladder in which every rung starts from the hundred the rung below it finished at, and two objectives rather than one. Tuned and Max maximize win rate. Pod Fun is scored against a ${(config.winRateBand.floor * 100).toFixed(0)}-${(config.winRateBand.ceiling * 100).toFixed(0)}% win-rate band with the ceiling enforced as a constraint, weights the pod-experience metric at ${((config.podFunRungScoreWeights.podFun || 0) * 100).toFixed(0)}%, and is floored at ${(Number(config.powerFloorRatio) * 100).toFixed(0)}% of its own Tuned build's power so it can never come out the stronger deck.`
  },
  engineBoundaryNote: `Every build in this file was measured on ${ENGINE}, so the rungs are comparable with each other. They are not comparable with figures published before it: the win-rate band alone moves a dominant deck's score by ten points or more, and that is a change of question rather than a change of answer.`,
  scoreWeights: config.scoreWeights,
  podFunWeights: config.podFunRungScoreWeights,
  winRateBand: config.winRateBand,
  // Where the model did not get what it was asked for. Published rather than
  // smoothed over: a deck that could not be brought under the ceiling is a deck
  // that wins too much to be a good guest, and that is worth knowing before
  // spending a hundred dollars on it.
  caveats: {
    inversions: inversions.map((record) => ({variantId: record.variantId, by: record.inversion.by})),
    podFunOverCeiling: overCeiling.map((record) => ({
      variantId: record.variantId,
      winPct: record.rungs.podfun.winRate,
      ceiling: config.winRateBand.ceiling
    }))
  },
  builds,
  altCommanderCases: previous.altCommanderCases || {}
};

if (missing.length) console.log(`no sweep record for ${missing.length} variant(s): ${missing.join(", ")}`);
const measured = Object.values(builds).filter((entry) => entry.Tuned?.score != null).length;
console.log(`${Object.keys(builds).length} variants · ${measured} with a measured Tuned rung · engine ${ENGINE}`);
RUNGS.forEach(([, label]) => {
  const scores = Object.values(builds).map((entry) => entry[label]?.score).filter((score) => score != null).sort((a, b) => a - b);
  const wins = Object.values(builds).map((entry) => entry[label]?.winPct).filter((rate) => rate != null);
  if (!scores.length) return;
  const meanWin = wins.reduce((sum, rate) => sum + rate, 0) / wins.length;
  console.log(`  ${label.padEnd(8)} score ${scores[0].toFixed(1)}–${scores[scores.length - 1].toFixed(1)} (median ${scores[Math.floor(scores.length / 2)].toFixed(1)}) · mean win ${(meanWin * 100).toFixed(1)}%`);
});
if (inversions.length) console.log(`  ${inversions.length} variant(s) where Pod Fun still out-powers Tuned: ${inversions.map((record) => record.variantId).join(", ")}`);
if (overCeiling.length) console.log(`  ${overCeiling.length} variant(s) whose Pod Fun rung stayed over the ceiling: ${overCeiling.map((record) => `${record.variantId} ${(record.rungs.podfun.winRate * 100).toFixed(0)}%`).join(", ")}`);

if (args.write) {
  await writeJson(path.join(ROOT, "data/simulation-summary.json"), summary);
  console.log(`written to data/simulation-summary.json`);
} else {
  console.log("(dry run — pass --write to save)");
}
