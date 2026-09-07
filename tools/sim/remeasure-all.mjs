#!/usr/bin/env node
/**
 * Re-measure every pinned rung on one regime, and publish what it finds.
 *
 * WHY THIS EXISTS. Until 2026-09-07 no creature's printed power or toughness had ever
 * reached the engine (see docs/simulation-fidelity.md): every body was estimated from mana
 * value. Fixing that re-bases every number in the repository, so the fifty variants' fifty
 * times four published scores describe a simulation that no longer runs.
 *
 * WHY ALL OF THEM AT ONCE. tools/sim/remeasure-variant.mjs opens with the warning that
 * re-measuring ONE variant on a regime the other forty-nine were never measured on makes
 * Compare lie by comparison -- the number moves because the method moved. That warning is
 * exactly right, and it is the argument for doing all two hundred together rather than an
 * argument against doing it. Afterwards every rung on the Compare page has been measured
 * the same way for the first time: the same seeds, the same game count, the same objective
 * per rung, and no residue of whatever size and seed each optimizer happened to stop at.
 *
 * WHAT IT DOES NOT DO. It does not optimize. The hundreds in data/rung-lists.json are the
 * hundreds; not one card moves. This measures what is already published and nothing else,
 * which is why it can be re-run at any time and why its output is comparable with itself.
 *
 * THE OBJECTIVE PER RUNG, unchanged from the sweep that produced them:
 *   Base, Tuned, Max   sim/config.json scoreWeights, win rate rising across the range
 *   Pod Fun            podFunRungScoreWeights, win rate BANDED (floor 30%, ceiling 45%)
 * and `powerScore` is always the performance objective with the band off, because that is
 * what "power" means here -- what the deck is worth when nobody is holding it back.
 *
 *   node tools/sim/remeasure-all.mjs                report every move, write nothing
 *   node tools/sim/remeasure-all.mjs --write        publish into simulation-summary.json
 *   node tools/sim/remeasure-all.mjs --variant 5o   one variant, for a spot check
 *   node tools/sim/remeasure-all.mjs --games 2000   a fast pass; NOT the published protocol
 */

import path from "node:path";
import {createRequire} from "node:module";
import {ROOT, buildTable, loadConfig, loadOpponents, readJson, writeJson, parseArgs} from "./lib.mjs";

const Measure = createRequire(import.meta.url)(path.join(ROOT, "deck-measure.js"));

const args = parseArgs(process.argv.slice(2));
const WRITE = Boolean(args.write);
const ONLY = args.variant || null;
const GAMES = Number(args.games || 20000);
const SEEDS = Number(args.seeds || 6);
/* The baseline pass. Measures the same hundreds on the same uniform protocol but with the
   printed bodies withheld, so the move a rung makes can be split into the part that is the
   new data and the part that is only the new regime. Without this the two are confounded
   and "every score fell" says nothing about why. */
const NO_BODIES = Boolean(args["no-bodies"]);
const ENGINE = NO_BODIES ? "v2.4-uniform" : "v2.6";

const config = await loadConfig();
const opponents = await loadOpponents();
const seats = buildTable(opponents, config.table).seats;
const rungs = await readJson(path.join(ROOT, "data", "rung-lists.json"));
const summary = await readJson(path.join(ROOT, "data", "simulation-summary.json"));
const facts = (await readJson(path.join(ROOT, "data", "card-facts.json"))).cards;
/* WHICH CARD IS THE COMMANDER. The pinned hundreds carry names and quantities and nothing
   else, so without this every deck is measured with an empty command zone -- which costs
   the whole "Gets the commander down" term and most of the win rate, and showed up as a
   uniform 25-point fall that looked like a data disaster rather than a missing flag. */
const commanders = new Map((await readJson(path.join(ROOT, "data", "variants.json")))
  .variants.map((variant) => [variant.id, variant.commander]));
const catalog = new Map((await readJson(path.join(ROOT, "data", "cards.json"))).cards
  .map((card) => [card.name.toLowerCase(), card]));

/* The card as the engine needs it, from whichever file knows it. card-facts.json is the
   richer of the two and wins; cards.json covers the rest of the fifty variants' 1,272
   distinct names. Both carry printed bodies now. */
function cardFor(name, quantity, isCommander) {
  const fact = facts[name] || catalog.get(name.toLowerCase()) || {};
  return {
    name,
    quantity: Number(quantity || 1),
    isCommander: Boolean(isCommander),
    typeLine: fact.typeLine || "",
    manaCost: fact.manaCost || "",
    oracleText: fact.oracleText || "",
    power: NO_BODIES ? undefined : fact.power,
    toughness: NO_BODIES ? undefined : fact.toughness,
    keywords: fact.keywords || [],
    colorIdentity: fact.colorIdentity || [],
    price: Number(fact.price || 0),
    gameChanger: Boolean(fact.gameChanger)
  };
}

function measureRung(list, rungName, commander) {
  const cards = list.map((entry) => cardFor(entry.name, entry.quantity, entry.name === commander));
  const podFun = rungName === "Pod Fun";
  const objective = {
    config: {
      ...config,
      scoreWeights: podFun ? config.podFunRungScoreWeights : config.scoreWeights,
      winRateBand: podFun ? config.winRateBand : null
    },
    seats, games: GAMES, seedCount: SEEDS
  };
  const scored = Measure.measure(cards, objective);
  /* Power is always the performance objective with the band off, whatever the rung was
     optimized for. It is the figure the Pod Fun floor is checked against. */
  const power = podFun
    ? Measure.measure(cards, {config: {...config, scoreWeights: config.scoreWeights, winRateBand: null},
        seats, games: GAMES, seedCount: SEEDS})
    : scored;
  return {scored, power};
}

const ids = Object.keys(rungs.variants).filter((id) => !ONLY || id === ONLY).sort();
const moves = [];
let done = 0;
const started = Date.now();

for (const id of ids) {
  const published = summary.builds[id] || {};
  const commander = commanders.get(id) || null;
  if (!commander) { console.warn(`  ! ${id}: no commander in data/variants.json, skipping`); continue; }
  for (const [rungName, list] of Object.entries(rungs.variants[id])) {
    if (!Array.isArray(list) || !list.length) continue;
    const was = published[rungName];
    if (!was) continue;
    const {scored, power} = measureRung(list, rungName, commander);
    moves.push({
      id, rung: rungName,
      was: was.score, now: scored.score, delta: Number((scored.score - was.score).toFixed(2)),
      wasWin: was.winPct, nowWin: scored.winRate,
      fields: {
        score: scored.score,
        powerScore: power.score,
        winPct: scored.winRate,
        podFunPct: scored.podFunScore,
        funPct: scored.funScore,
        avgWinTurn: scored.avgWinTurn,
        games: GAMES * SEEDS,
        se: scored.se,
        engine: ENGINE
      }
    });
    done += 1;
    if (done % 20 === 0) {
      const per = (Date.now() - started) / done;
      const left = Math.round((per * (ids.length * 4 - done)) / 1000);
      process.stdout.write(`  ${done} rungs measured, about ${left}s left\n`);
    }
  }
}

const worse = moves.filter((m) => m.delta < 0);
const better = moves.filter((m) => m.delta > 0);
const mean = moves.reduce((n, m) => n + m.delta, 0) / Math.max(1, moves.length);
console.log(`\n${moves.length} rungs re-measured on ${SEEDS} seeds of ${GAMES.toLocaleString()} ` +
  `in ${Math.round((Date.now() - started) / 1000)}s.`);
console.log(`${worse.length} scored lower, ${better.length} higher, mean move ${mean.toFixed(2)} points.`);
const sorted = moves.slice().sort((a, b) => a.delta - b.delta);
console.log("\nbiggest falls");
sorted.slice(0, 6).forEach((m) => console.log(`  ${m.id} ${m.rung.padEnd(8)} ${m.was} → ${m.now}  (${m.delta})`));
const rises = sorted.filter((m) => m.delta > 0).slice(-6).reverse();
console.log(rises.length ? "biggest rises" : "nothing rose");
rises.forEach((m) => console.log(`  ${m.id} ${m.rung.padEnd(8)} ${m.was} → ${m.now}  (+${m.delta})`));

if (!WRITE) {
  console.log("\nNothing written. --write to publish into data/simulation-summary.json.");
  process.exit(0);
}

if (NO_BODIES) {
  console.log("\n--no-bodies is a baseline pass; it never writes. Compare its report with the real one.");
  process.exit(0);
}
moves.forEach((m) => { Object.assign(summary.builds[m.id][m.rung], m.fields); });
summary.generatedAt = new Date().toISOString();
summary.engine = ENGINE;
summary.engineNotes = Object.assign({}, summary.engineNotes, {
  [ENGINE]: "Measured on v2.6: the v2.5 model, with two corrections to what the engine " +
    "READS from a card before it plays anything. First, a land that goes and gets a basic " +
    "now enters tapped. entersTapped was read off the fetch's own text, and a fetch does " +
    "not print \"enters tapped\" because the fetch is not the land that does -- so Evolving " +
    "Wilds and Terramorphic Expanse modelled as UNTAPPED FIVE-COLOUR LANDS available the " +
    "turn they were played, which is strictly better than any land in Magic, and both " +
    "Panoramas as untapped tri-lands while really charging {1} on top of the sacrifice. " +
    "Five lands change; the three decks holding them fall 0.17 to 0.53 and the other " +
    "three do not move at all. Second, a Treasure behind a condition inside an activated " +
    "ability is no longer ramp: Currency Converter's cost is a bare {T}, so it modelled as " +
    "a one-mana Treasure engine when the Treasure needs a card discarded, exiled with the " +
    "artifact, and a land at that. One card changes, and it is in no shipped deck. No card " +
    "moved between rungs -- the hundreds are exactly those in data/rung-lists.json."
});
/* THE CAVEATS ARE MEASUREMENTS TOO, and they were being carried forward.
   caveats.inversions and caveats.podFunOverCeiling name the variants where the
   ladder's two promises fail -- a Pod Fun rung that out-powers Tuned, and one that
   wins past the ceiling it exists to stay under. tests/data-integrity.mjs checks
   the NAMES, so a re-measure that moved every score kept passing while the
   magnitudes beside those names still described the previous engine. Recompute
   them from the numbers this run just wrote, by the same rules the test applies. */
const band = summary.winRateBand || {};
const inversions = [];
const overCeiling = [];
for (const [variantId, deckBuilds] of Object.entries(summary.builds)) {
  const tuned = deckBuilds.Tuned;
  const podFun = deckBuilds["Pod Fun"];
  if (tuned?.powerScore != null && podFun?.powerScore != null && podFun.powerScore > tuned.powerScore + 0.05) {
    inversions.push({variantId, by: Number((podFun.powerScore - tuned.powerScore).toFixed(2))});
  }
  if (podFun?.winPct != null && band.ceiling != null && podFun.winPct > band.ceiling + 0.005) {
    overCeiling.push({variantId, winPct: podFun.winPct, ceiling: band.ceiling});
  }
}
summary.caveats = Object.assign({}, summary.caveats, {inversions, podFunOverCeiling: overCeiling});

summary.regimeNote = `All ${moves.length} rungs re-measured together by ` +
  `tools/sim/remeasure-all.mjs on ${SEEDS} seeds of ${GAMES.toLocaleString()} games, on the ` +
  `protocol established when printed power and toughness reached the engine. Before that run each ` +
  `rung carried whatever size and seed its own optimizer stopped at, so the numbers on the ` +
  `Compare page were only loosely comparable with each other; now every one of them was ` +
  `measured the same way. No card moved: the hundreds are exactly those in ` +
  `data/rung-lists.json.`;
await writeJson(path.join(ROOT, "data", "simulation-summary.json"), summary);
console.log(`\nwrote data/simulation-summary.json — ${moves.length} rungs.`);
