// Reconciles data/cards.json's Game Changer flags against Wizards' own list.
//
//   node tools/sim/sync-game-changers.mjs           # report
//   node tools/sim/sync-game-changers.mjs --write   # correct data/cards.json
//
// The flag decides whether a card is legal at Tier 2 at all, so a card carrying
// the wrong one is not a cosmetic error: the compliance check clears a deck it
// should refuse, and the Max rung offers as "new capability" a card the deck was
// already allowed to run. Twenty entries were wrong when this was first run --
// Cyclonic Rift, Rhystic Study, Demonic Tutor, The One Ring and sixteen others
// all sat in the catalog flagged as ordinary cards.
//
// The list is fetched by tools/sim/build-capability.mjs into
// sim/cache/game-changers.json (Scryfall's is:gamechanger, 53 cards).

import path from "node:path";
import {parseArgs, readJson, writeJson, loadCatalog, Lineup, ROOT, SIM_DIR, relative} from "./lib.mjs";

const args = parseArgs(process.argv.slice(2));
const {buyPlans, cards: cardData} = await loadCatalog();
const official = await readJson(path.join(SIM_DIR, "cache/game-changers.json"), []);
if (!official.length) {
  console.error(`No Game Changer list at ${relative(path.join(SIM_DIR, "cache/game-changers.json"))}.`);
  process.exit(1);
}

const officialNames = new Set(official.map((card) => Lineup.normalizeName(card.name)));
const added = [];
const removed = [];
for (const card of cardData.cards) {
  const isOfficial = officialNames.has(Lineup.normalizeName(card.name));
  if (isOfficial && !card.gameChanger) { added.push(card.name); card.gameChanger = true; }
  // A card the list does not name is not a Game Changer, whatever an earlier
  // import decided. The list is the rule; the catalog only records it.
  if (!isOfficial && card.gameChanger) { removed.push(card.name); card.gameChanger = false; }
}

// The same flag rides on every ladder item, and a stale copy there would win
// over the corrected catalog wherever an item carries its own metadata.
const BUCKETS = ["startingShell", "required", "upgrade", "enhance", "max", "tuned2", "enhance2", "max2", "funTuned", "funMax", "altTuned", "altMax"];
let itemsFixed = 0;
for (const plan of Object.values(buyPlans.plans)) {
  for (const bucket of BUCKETS) {
    for (const item of plan[bucket] || []) {
      const want = officialNames.has(Lineup.normalizeName(item.name));
      if (Boolean(item.gameChanger) !== want) { item.gameChanger = want; itemsFixed += 1; }
    }
  }
}

console.log(`flag added to ${added.length} catalog card(s)${added.length ? `: ${added.join(", ")}` : ""}`);
console.log(`flag cleared from ${removed.length} catalog card(s)${removed.length ? `: ${removed.join(", ")}` : ""}`);
console.log(`${itemsFixed} ladder item(s) corrected`);

if (args.write) {
  await writeJson(path.join(ROOT, "data/cards.json"), cardData);
  await writeJson(path.join(ROOT, "data/buy-plans.json"), buyPlans);
  console.log("written to data/cards.json and data/buy-plans.json");
} else {
  console.log("(dry run — pass --write to save)");
}
