// Measures what a shell swap did to a variant's published rungs.
//
//   node tools/sim/remeasure-variant.mjs                  # report
//   node tools/sim/remeasure-variant.mjs --write          # publish what moved measurably
//   node tools/sim/remeasure-variant.mjs --games 50000    # games per replicate
//   node tools/sim/remeasure-variant.mjs --replicates 12  # independent seeds
//
// WHY NOT JUST RE-RUN THE SWEEP. The sweep optimizes. Pointed at these two
// variants it would rewrite the other ninety-nine slots as well, which is the
// opposite of what a reviewed one-card swap is for. And a plain re-measure is
// not comparable either: only the Base rung is measure-only, so a fresh baseline
// reproduces its published figure exactly, while Tuned's published number is the
// score its optimizer stopped at and Max's came from the Tier 3 promotion pass
// at its own size and seed. Re-measuring one variant on a regime the other
// forty-nine were never measured on would make the Compare view lie by
// comparison -- the number would move because the method moved.
//
// WHAT THIS DOES INSTEAD. It measures the hundred as it was and the hundred as it
// now is, back to back on the same seed, across several independent seeds. Common
// random numbers cancel most of the shared variance, so the per-seed difference is
// far tighter than either absolute score, and the spread of those differences is
// what says whether the swap did anything: a delta counts only when its mean sits
// more than two standard errors from zero.
//
// The test is on the SCORE, not the win rate. A card can be worth real points
// without winning more games -- Tectonic Reformation turns flooded lands into
// cards, which shows up in flood and dead-card rates and barely at all in wins --
// and gating a composite figure on one of its components would suppress exactly
// the kind of improvement these two swaps were made for.
//
// The swap table matches tools/reshell-basic-swap.mjs. Run this after it.

import path from "node:path";
import {parseArgs, readJson, writeJson, loadCatalog, loadConfig, loadOpponents, buildTable,
  baseCards, tunedCards, funTunedCards, maxedCards, Lineup, Engine, ROOT} from "./lib.mjs";

const args = parseArgs(process.argv.slice(2));
const config = await loadConfig();
const {buyPlans, audited} = await loadCatalog();
const table = buildTable(await loadOpponents(), config.table);

const GAMES = Number(args.games || 25000);
const REPLICATES = Number(args.replicates || 8);
// Seeds neither the sweep's optimizer nor the Tier 3 pass ever ran on, so neither
// list is being scored on the noise it was selected against. Spaced by a prime so
// consecutive replicates cannot share a stream.
const SEED = 20260828;
const SEED_STEP = 7919;

// The same two swaps tools/reshell-basic-swap.mjs applied, stated again here so
// the pre-swap hundred can be reconstructed exactly rather than guessed at.
const SWAPS = [
  {variantId: "3o", basic: "Mountain", add: "Command Tower"},
  {variantId: "5o", basic: "Mountain", add: "Tectonic Reformation"}
];

// Each rung, the list it publishes, and the objective it is scored under. Tuned
// and Max chase raw power on the monotonic curve; Pod Fun is scored against the
// win-rate band with the pod-experience metric weighted in. powerScore is always
// the unbanded performance vector, so it means the same thing on every rung.
const RUNGS = [
  {label: "Base", compose: baseCards, weights: null, band: false},
  {label: "Tuned", compose: tunedCards, weights: null, band: false},
  {label: "Pod Fun", compose: funTunedCards, weights: "podFunRungScoreWeights", band: true},
  {label: "Max", compose: maxedCards, weights: null, band: false}
];

const key = (name) => Lineup.normalizeName(name);
// The composed lists already carry oracle text, mana cost and keywords. They go
// to the engine as they are: lib's literalFor is the compliance shape, and it
// drops exactly the fields the engine classifies cards by, which simulates every
// deck as a pile of blanks.
const measure = (cards, weights, band, seed) => Engine.simulateGames(cards, table.seats, {
  ...config,
  games: GAMES,
  scoreWeights: weights ? config[weights] : config.scoreWeights,
  winRateBand: band ? config.winRateBand : null,
  powerWeights: config.scoreWeights,
  powerBand: null,
  targets: config.targets
}, seed).metrics;

// The hundred as it stood before the swap: the basic back up by one, the added
// card gone. Reconstructed rather than read from git so this stays runnable.
function preSwap(cards, swap) {
  const out = cards.filter((card) => key(card.name) !== key(swap.add)).map((card) => ({...card}));
  const basic = out.find((card) => key(card.name) === key(swap.basic));
  if (!basic) throw new Error(`${swap.variantId}: no ${swap.basic} to put back`);
  basic.quantity = Math.max(1, Number(basic.quantity || 1)) + 1;
  return out;
}

const total = (cards) => cards.reduce((n, card) => n + Math.max(1, Number(card.quantity || 1)), 0);
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const stderr = (xs) => {
  if (xs.length < 2) return Infinity;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1) / xs.length);
};
const summary = await readJson(path.join(ROOT, "data/simulation-summary.json"));
const moves = [];

console.log(`${REPLICATES} seeds × ${GAMES.toLocaleString()} games a list, the same seed on both sides of every pair.`);
console.log(`Δ is the mean paired difference in score, ± two standard errors.\n`);
for (const swap of SWAPS) {
  const plan = buyPlans.plans[swap.variantId];
  console.log(`${swap.variantId}  ${plan.deckName}  —  ${swap.basic} traded for ${swap.add}`);
  for (const rung of RUNGS) {
    const after = rung.compose(plan, audited);
    if (!after.some((card) => key(card.name) === key(swap.add))) {
      console.log(`  ${rung.label.padEnd(8)} skipped — the ${rung.label} hundred does not carry ${swap.add}`);
      continue;
    }
    const before = preSwap(after, swap);
    if (total(before) !== 100 || total(after) !== 100) {
      throw new Error(`${swap.variantId} ${rung.label}: ${total(before)} before / ${total(after)} after, and both must be 100`);
    }
    const runs = [];
    for (let i = 0; i < REPLICATES; i += 1) {
      const seed = SEED + i * SEED_STEP;
      const was = measure(before, rung.weights, rung.band, seed);
      const now = measure(after, rung.weights, rung.band, seed);
      runs.push({
        score: now.score - was.score,
        power: now.powerScore - was.powerScore,
        win: now.winRate - was.winRate,
        podFun: now.podFunScore - was.podFunScore,
        fun: now.funScore - was.funScore,
        endTurn: now.avgEndTurn - was.avgEndTurn,
        wasScore: was.score, nowScore: now.score
      });
    }
    const dScore = mean(runs.map((r) => r.score));
    const dPower = mean(runs.map((r) => r.power));
    const dWin = mean(runs.map((r) => r.win));
    const dPodFun = mean(runs.map((r) => r.podFun));
    const dFun = mean(runs.map((r) => r.fun));
    const dEndTurn = mean(runs.map((r) => r.endTurn));
    const se = stderr(runs.map((r) => r.score));
    // Two standard errors either side of the mean difference. An interval that
    // still contains zero is a swap this model cannot tell from doing nothing,
    // and publishing a figure off it would be inventing precision.
    const real = Math.abs(dScore) > 2 * se;
    const published = summary.builds?.[swap.variantId]?.[rung.label];
    console.log(
      `  ${rung.label.padEnd(8)} score ${mean(runs.map((r) => r.wasScore)).toFixed(1)} → ${mean(runs.map((r) => r.nowScore)).toFixed(1)}` +
      `   Δ ${dScore >= 0 ? "+" : ""}${dScore.toFixed(2)} ±${(2 * se).toFixed(2)}` +
      `   win ${dWin >= 0 ? "+" : ""}${(dWin * 100).toFixed(2)} pts` +
      `   ${real ? "MOVED" : "not distinguishable from zero"}`
    );
    if (real && published) {
      moves.push({
        variantId: swap.variantId, rung: rung.label, published,
        deltas: {dScore, dPower, dWin, dPodFun, dFun, dEndTurn},
        note: `${swap.basic} traded for ${swap.add}, worth ${dScore >= 0 ? "+" : ""}${dScore.toFixed(2)} ±${(2 * se).toFixed(2)} against the same hundred without it over ${REPLICATES} × ${GAMES.toLocaleString()} games`
      });
    }
  }
  console.log("");
}

if (!moves.length) {
  console.log("No rung moved measurably, so no published figure changes.");
  console.log("The pinned lists still describe the decks; the scores under them still describe the lists.");
  process.exit(0);
}

console.log(`${moves.length} published figure(s) would change:`);
moves.forEach((move) => console.log(`  ${move.variantId} ${move.rung}: ${move.published.score} → ${Number((move.published.score + move.deltas.dScore).toFixed(1))}`));

if (!args.write) { console.log("\n(dry run — pass --write to save)"); process.exit(0); }

// The published figure stays anchored in the regime the other forty-nine variants
// were measured in; only the measured difference is applied to it. Every number
// the entry publishes moves together, because they all describe one hundred cards
// and half-updating them would leave a rung whose score and win rate disagree
// about which list they are talking about.
const shift = (value, delta, places) => (typeof value === "number" ? Number((value + delta).toFixed(places)) : value);
moves.forEach((move) => {
  const d = move.deltas;
  Object.assign(move.published, {
    score: shift(move.published.score, d.dScore, 1),
    powerScore: shift(move.published.powerScore, d.dPower, 1),
    winPct: shift(move.published.winPct, d.dWin, 4),
    podFunPct: shift(move.published.podFunPct, d.dPodFun, 3),
    funPct: shift(move.published.funPct, d.dFun, 3),
    avgWinTurn: shift(move.published.avgWinTurn, d.dEndTurn, 2),
    // Re-running the tool must not stack the same sentence twice.
    note: String(move.published.note || "").includes(move.note) ? move.published.note : `${move.published.note} · ${move.note}`
  });
});
summary.generatedAt = new Date().toISOString();
await writeJson(path.join(ROOT, "data/simulation-summary.json"), summary);
console.log("\nwritten to data/simulation-summary.json");
