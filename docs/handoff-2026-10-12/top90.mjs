// How far the engine is from the most-played 80% / 85% / 90% of Commander card appearances, and what blocks the gap.
import {readFileSync, writeFileSync} from "node:fs";
const [,, root, out] = process.argv;
const {topCards} = await import(root + "/game/tools/engine-top-cards.mjs");
const {tableCards} = await import(root + "/cloud/game-room.mjs");
const graph = JSON.parse(readFileSync(root + "/data/graph.json", "utf8"));
const played = JSON.parse(readFileSync(root + "/data/graph-played.json", "utf8"));
const result = {};
for (const share of [0.8, 0.85, 0.9]) {
  const {cards, total} = topCards({graph, played, share});
  const missing = cards.filter((c) => !tableCards(c.name));
  // The share of all appearances that the defined cards already cover.
  const coveredAppearances = cards.filter((c) => tableCards(c.name)).reduce((a, c) => a + c.appearances, 0);
  result[share] = {cards: cards.length, defined: cards.length - missing.length, missing: missing.length,
    appearanceShareCoveredByDefined: Number((coveredAppearances / total).toFixed(4)), missingNames: missing.map((c) => c.name)};
  console.log(`share ${share}: ${cards.length} cards, ${cards.length - missing.length} defined, ${missing.length} to go; defined cards cover ${(100 * coveredAppearances / total).toFixed(1)}% of all appearances`);
}
writeFileSync(out, JSON.stringify(result));
