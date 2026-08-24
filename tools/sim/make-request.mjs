// Builds a simulation request from a baked variant's Tuned, Enhance, Maxed, or
// Fun build, so a deck can be simulated without downloading anything from the
// browser.
//
//   node tools/sim/make-request.mjs --variant 5o                    # Tuned, Tier 2
//   node tools/sim/make-request.mjs --variant 5o --stage enhance    # Enhance, Tier 2
//   node tools/sim/make-request.mjs --variant 5o --stage maxed      # Maxed, Tier 3
//   node tools/sim/make-request.mjs --variant 5o --stage fun        # Fun, Tier 2, fun-weighted scoring
//   node tools/sim/make-request.mjs --variant 5o --table bracket3-night --out sim/requests/mine.json

import path from "node:path";
import {parseArgs, readJson, writeJson, loadCatalog, loadConfig, loadOpponents, tunedCards, enhanceCards, maxedCards, validateList, requestIdFor, stampNow, relative, ROOT, SIM_DIR} from "./lib.mjs";

const args = parseArgs(process.argv.slice(2));

if (args.help || (!args.variant && !args.list)) {
  console.log("Usage: node tools/sim/make-request.mjs --variant <variantId> [--stage tuned|enhance|maxed|fun] [--table <name>] [--out <file>]");
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

// Tuned, Enhance, and Fun are all checked against Tier 2 (no Game Changers, no
// mass land denial, no two-card combos) — Enhance stays a budget-constrained
// refinement of Tuned rather than a bracket jump, and Fun changes what the
// optimizer scores for, not which bracket it may draw from. Maxed intentionally
// pushes to the Tier 3 line (up to three Game Changers) — that pairing matches
// how the site already frames the stages, so the simulator enforces the rules
// each stage is actually meant to satisfy rather than checking every build
// against one tier by default.
const stageArg = String(args.stage || "tuned").toLowerCase();
if (!["tuned", "enhance", "maxed", "fun"].includes(stageArg)) throw new Error(`--stage must be "tuned", "enhance", "maxed", or "fun", got "${stageArg}"`);
const stage = stageArg === "maxed" ? "Maxed" : stageArg === "enhance" ? "Enhance" : stageArg === "fun" ? "Fun" : "Tuned";
const tier = stageArg === "maxed" ? 3 : 2;
const cards = stageArg === "maxed" ? maxedCards(plan, audited) : stageArg === "enhance" ? enhanceCards(plan, audited) : tunedCards(plan, audited);

const commander = cards.find((card) => card.isCommander);
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
    maxSwapInPriceUsd: Number(args["max-price"] || (stageArg === "maxed" ? 100 : config.maxSwapInPriceUsd)),
    // The Fun rung optimizes for a different objective, not a different legal
    // deck: it keeps fun weighted at .10 (never de-weighted like every other
    // rung's .05) while everything else about the request stays the same.
    scoreWeights: stageArg === "fun" ? config.funRungScoreWeights : undefined,
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
