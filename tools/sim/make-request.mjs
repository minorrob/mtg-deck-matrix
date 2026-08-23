// Builds a simulation request from a baked variant's Tuned build, so a deck can
// be simulated without downloading anything from the browser.
//
//   node tools/sim/make-request.mjs --variant 5o
//   node tools/sim/make-request.mjs --variant 5o --table bracket3-night --out sim/requests/mine.json

import path from "node:path";
import {parseArgs, readJson, writeJson, loadCatalog, loadConfig, loadOpponents, tunedCards, validateList, requestIdFor, stampNow, relative, ROOT, SIM_DIR} from "./lib.mjs";

const args = parseArgs(process.argv.slice(2));

if (args.help || (!args.variant && !args.list)) {
  console.log("Usage: node tools/sim/make-request.mjs --variant <variantId> [--table <name>] [--out <file>]");
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

const cards = tunedCards(plan, audited);
const commander = cards.find((card) => card.isCommander);
// The land band constrains what a run may change, not which decks may be
// measured: a lands-matter deck at 48 lands is a real deck and gets simulated.
const check = validateList(cards);
if (!check.ok) {
  console.error(`The Tuned build for ${variantId} does not validate:`);
  check.problems.forEach((problem) => console.error(`  - ${problem}`));
  process.exit(1);
}
const landCount = check.result.types.Land || 0;
const landNote = landCount < config.landFloor || landCount > config.landCeiling
  ? `outside the usual ${config.landFloor}-${config.landCeiling} band; the run may not push it further out`
  : "";

const stamp = stampNow();
const id = requestIdFor(variantId, stamp);
const request = {
  schemaVersion: 1,
  id,
  variantId,
  deckId: plan.deckId,
  source: "baked-tuned-build",
  stage: "Tuned",
  createdAt: new Date().toISOString(),
  name: variant?.name || plan.deckName,
  commander: commander?.name || plan.commander,
  table,
  cards,
  constraints: {
    colorIdentity: commander?.colorIdentity || [],
    tier: 3,
    landFloor: Math.min(config.landFloor, landCount),
    landCeiling: Math.max(config.landCeiling, landCount),
    maxSwapInPriceUsd: Number(args["max-price"] || config.maxSwapInPriceUsd),
    mustKeep: [commander?.name].filter(Boolean),
    themes: variant?.mechanics || [],
    budgetTotalUsd: Number(plan.allIn || 0)
  }
};

const out = args.out ? path.resolve(ROOT, String(args.out)) : path.join(SIM_DIR, "requests", `${id}.json`);
await writeJson(out, request);
console.log(`${variantId} · ${request.name}`);
console.log(`  commander     ${request.commander} (${(request.constraints.colorIdentity || []).join("") || "colorless"})`);
console.log(`  tuned build   ${check.result.total} cards · ${landCount} lands${landNote ? ` (${landNote})` : ""} · ${check.result.selectedGameChangers.length} Game Changers · Tier 3 clean`);
console.log(`  opponents     ${table}`);
console.log(`  written to    ${relative(out)}`);
