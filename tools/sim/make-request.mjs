// Builds a simulation request from a baked variant's Tuned, Enhance, Maxed,
// Fun Tuned, or Fun Max build, so a deck can be simulated without downloading
// anything from the browser. Every stage is the plan's own published card list
// for that rung -- never a re-optimization of a different rung.
//
//   node tools/sim/make-request.mjs --variant 5o                    # Tuned, Tier 2
//   node tools/sim/make-request.mjs --variant 5o --stage enhance    # Enhance, Tier 2
//   node tools/sim/make-request.mjs --variant 5o --stage maxed      # Maxed, Tier 3
//   node tools/sim/make-request.mjs --variant 5o --stage fun        # Fun Tuned, Tier 2, fun-weighted scoring
//   node tools/sim/make-request.mjs --variant 5o --stage funmax     # Fun Max, Tier 3, fun-weighted scoring
//   node tools/sim/make-request.mjs --variant 5o --table bracket3-night --out sim/requests/mine.json

import path from "node:path";
import {parseArgs, readJson, writeJson, loadCatalog, loadConfig, loadOpponents, tunedCards, enhanceCards, maxedCards, funTunedCards, funMaxCards, validateList, requestIdFor, stampNow, relative, ROOT, SIM_DIR} from "./lib.mjs";

const args = parseArgs(process.argv.slice(2));

if (args.help || (!args.variant && !args.list)) {
  console.log("Usage: node tools/sim/make-request.mjs --variant <variantId> [--stage tuned|enhance|maxed|fun|funmax] [--table <name>] [--out <file>]");
  console.log("       node tools/sim/make-request.mjs --list");
  process.exit(args.help ? 0 : 1);
}

const {variants, buyPlans, audited} = await loadCatalog();

if (args.list) {
  Object.values(buyPlans.plans).forEach((plan) => {
    const variant = variants.variants.find((entry) => entry.id === plan.variantId);
    console.log(`${plan.variantId.padEnd(4)} deck ${plan.deckId}  ${(variant?.name || plan.deckName).padEnd(38)} ${plan.commander}`);
  });
  process.exit(0);
}

const variantId = String(args.variant);
const plan = buyPlans.plans[variantId];
if (!plan) throw new Error(`No buy plan for variant ${variantId}. Run with --list to see the options.`);
const variant = variants.variants.find((entry) => entry.id === variantId);
const config = await loadConfig();
const opponents = await loadOpponents();
const table = String(args.table || config.table || opponents.defaultTable);
if (!opponents.tables[table]) throw new Error(`Unknown opponent table "${table}"`);

// Each stage is checked against the bracket it is actually meant to satisfy,
// matching how the site frames it: Tuned, Enhance, and Fun Tuned against Tier 2
// (no Game Changers, no mass land denial, no two-card combos), while Maxed and
// Fun Max intentionally push to the Tier 3 line (up to three Game Changers).
const STAGES = {
  tuned: {label: "Tuned", tier: 2, cards: tunedCards, fun: false},
  enhance: {label: "Enhance", tier: 2, cards: enhanceCards, fun: false},
  maxed: {label: "Maxed", tier: 3, cards: maxedCards, fun: false},
  // The Fun rungs are the plan's own authored fun-weighted ladders, not a
  // re-optimization of Tuned: they exist only where the workbook actually
  // carries them, and they are scored with fun weighted at .10 because that is
  // the objective they were built for.
  fun: {label: "Fun Tuned", tier: 2, cards: funTunedCards, fun: true, requires: "funTuned"},
  funmax: {label: "Fun Max", tier: 3, cards: funMaxCards, fun: true, requires: "funMax"}
};
const stageArg = String(args.stage || "tuned").toLowerCase();
const spec = STAGES[stageArg];
if (!spec) throw new Error(`--stage must be one of ${Object.keys(STAGES).join(", ")}, got "${stageArg}"`);
if (spec.requires && !(plan[spec.requires] || []).length) {
  console.error(`${variantId} has no ${spec.requires} ladder, so its ${spec.label} build does not exist and must not be simulated.`);
  process.exit(2);
}
const stage = spec.label;
const cards = spec.cards(plan, audited);

const commander = cards.find((card) => card.isCommander);
// A hard exception to the Tier 2 default above: a commander that is itself a
// Game Changer (per Scryfall's own flag) makes Tier 2 permanently unreachable
// no matter what the other 99 cards are, since the commander can never be the
// swapped-out card. Ask for Tier 3 on every rung for that deck instead of
// sending the optimizer after a target it can never legally hit.
const tier = spec.tier === 3 || commander?.gameChanger ? 3 : 2;
// The land band constrains what a run may change, not which decks may be
// measured: a lands-matter deck at 48 lands is a real deck and gets simulated.
// A tier-rule violation alone (most often a required purchase that happens to
// be a Game Changer, which Tier 2 disallows outright) is not fatal here — the
// runner's mandatory legality pass fixes exactly that before any game is
// played. Only a genuine structural problem (not 100 cards) blocks the request,
// since that is not something a card swap can repair.
const check = validateList(cards, {tier});
if (check.result.total !== 100) {
  console.error(`The ${stage} build for ${variantId} does not validate against Tier ${tier}:`);
  check.problems.forEach((problem) => console.error(`  - ${problem}`));
  process.exit(1);
}
if (!check.ok) {
  console.log(`Note: the ${stage} build for ${variantId} is not Tier ${tier} legal as published — the simulation run will fix this before measuring a baseline:`);
  check.problems.forEach((problem) => console.log(`  - ${problem}`));
}
const landCount = check.result.types.Land || 0;
const landNote = landCount < config.landFloor || landCount > config.landCeiling
  ? `outside the usual ${config.landFloor}-${config.landCeiling} band; the run may not push it further out`
  : "";

const stamp = stampNow();
const id = requestIdFor(`${variantId}-${stageArg}`, stamp);
const request = {
  schemaVersion: 2,
  id,
  variantId,
  deckId: plan.deckId,
  source: `baked-${stageArg}-build`,
  stage,
  createdAt: new Date().toISOString(),
  name: variant?.name || plan.deckName,
  commander: commander?.name || plan.commander,
  table,
  cards,
  constraints: {
    colorIdentity: commander?.colorIdentity || [],
    tier,
    landFloor: Math.min(config.landFloor, landCount),
    landCeiling: Math.max(config.landCeiling, landCount),
    // $100/card applies to the Max rung only (D5) -- every other rung keeps the
    // shared default so a Tuned or Enhance run can't drift toward Max pricing.
    maxSwapInPriceUsd: Number(args["max-price"] || (spec.tier === 3 ? 100 : config.maxSwapInPriceUsd)),
    // The Fun rungs optimize for a different objective, not a different legal
    // deck: they keep fun weighted at .10 (never de-weighted like every other
    // rung's .05) while everything else about the request stays the same.
    scoreWeights: spec.fun ? config.funRungScoreWeights : undefined,
    mustKeep: [commander?.name].filter(Boolean),
    themes: variant?.mechanics || [],
    budgetTotalUsd: Number(plan.allIn || 0)
  }
};

const out = args.out ? path.resolve(ROOT, String(args.out)) : path.join(SIM_DIR, "requests", `${id}.json`);
await writeJson(out, request);
console.log(`${variantId} · ${request.name} · ${stage} · Tier ${tier}`);
console.log(`  commander     ${request.commander} (${(request.constraints.colorIdentity || []).join("") || "colorless"})`);
console.log(`  ${stage.toLowerCase()} build   ${check.result.total} cards · ${landCount} lands${landNote ? ` (${landNote})` : ""} · ${check.result.selectedGameChangers.length} Game Changers · Tier ${tier} ${check.ok ? "clean" : "will be fixed on --init"}`);
console.log(`  opponents     ${table}`);
console.log(`  written to    ${relative(out)}`);
