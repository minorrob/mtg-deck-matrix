// Writes an optimized list back into data/buy-plans.json, in place, so it ships
// with the site instead of living in one browser's storage.
//
//   node tools/sim/bake-result.mjs --result sim/results/<id>.json
//   node tools/sim/bake-result.mjs --result <file> --dry-run
//
// The baked catalog's shape is asserted by tests/data-integrity.mjs, so this
// rewrites one plan's starting shell and clears that plan's ladders rather than
// adding or removing variants. Run both data tests before committing.

import path from "node:path";
import {parseArgs, readJson, writeJson, loadCatalog, loadConfig, validateList, Lineup, ROOT, relative} from "./lib.mjs";

const args = parseArgs(process.argv.slice(2));
if (!args.result) {
  console.log("Usage: node tools/sim/bake-result.mjs --result <resultFile> [--dry-run]");
  process.exit(1);
}

const result = await readJson(path.resolve(ROOT, String(args.result)));
const config = await loadConfig();
const {buyPlans, audited} = await loadCatalog();
const plan = buyPlans.plans[result.variantId];
if (!plan) throw new Error(`No baked plan for ${result.variantId}; a generated deck cannot be baked into the catalog.`);
if (result.verdict === "not-confirmed") {
  console.error(`${result.variantId}: this result was not confirmed on unseen seeds. Baking it would ship a change the simulation says is worse.`);
  process.exit(1);
}

const slug = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const startingShell = result.finalCards.map((card, index) => {
  const meta = audited.get(Lineup.normalizeName(card.name)) || {};
  return {
    id: `shell-${result.variantId}-${index + 1}-${slug(card.name)}`,
    name: card.name,
    quantity: Math.max(1, Number(card.quantity || 1)),
    manaCost: meta.manaCost || "",
    typeLine: card.typeLine || meta.typeLine || "",
    tags: card.isCommander ? ["Commander"] : [],
    isCommander: Boolean(card.isCommander),
    gameChanger: Boolean(card.gameChanger),
    isFlexibleSlot: false,
    image: meta.image || "",
    oracleText: meta.oracleText || "",
    keywords: meta.keywords || [],
    colorIdentity: meta.colorIdentity || [],
    tcgplayerUrl: meta.tcgplayerUrl || "",
    commanderLegal: (meta.legalities?.commander || "legal") === "legal",
    price: Number(card.price ?? meta.price ?? 0)
  };
});

const check = validateList(startingShell, {
  landFloor: Math.min(config.landFloor, result.compliance?.lands || config.landFloor),
  landCeiling: Math.max(config.landCeiling, result.compliance?.lands || config.landCeiling)
});
if (!check.ok) {
  console.error(`${result.variantId}: the optimized list does not validate, so it will not be baked:`);
  check.problems.forEach((problem) => console.error(`  - ${problem}`));
  process.exit(1);
}

buyPlans.plans[result.variantId] = {
  ...plan,
  startingShell,
  startingShellKind: "custom-shell",
  startingShellSource: `Optimized by simulation on ${String(result.finishedAt).slice(0, 10)} (${result.id})`,
  baseCards: startingShell.map((card) => ({
    id: card.id,
    name: card.name,
    quantity: card.quantity,
    typeLine: card.typeLine,
    tags: card.tags,
    isCommander: card.isCommander,
    gameChanger: card.gameChanger
  })),
  precon: null,
  required: [],
  upgrade: [],
  enhance: [],
  max: []
};

console.log(`${result.variantId} · ${result.name}`);
console.log(`  verdict       ${result.verdict}`);
console.log(`  list          ${check.result.total} cards · ${check.result.types.Land || 0} lands · ${check.result.selectedGameChangers.length} Game Changers · Tier 3 ${check.result.tier3.length ? "issues" : "clean"}`);
console.log(`  changes       ${(result.netChanges || []).length} against the previous Tuned build`);

if (args["dry-run"]) {
  console.log("  dry run       data/buy-plans.json was not written");
  process.exit(0);
}

await writeJson(path.join(ROOT, "data/buy-plans.json"), buyPlans);
console.log(`  written to    ${relative(path.join(ROOT, "data/buy-plans.json"))}`);
console.log("  now run       node tests/data-integrity.mjs && node tests/lineup-compliance.mjs");
