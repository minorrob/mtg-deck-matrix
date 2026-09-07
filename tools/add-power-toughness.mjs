#!/usr/bin/env node
/**
 * Put the printed power and toughness into the card data.
 *
 * WHAT WAS WRONG. No creature's printed body has ever reached the simulation. Neither
 * data/cards.json nor data/card-facts.json carried a power or toughness field -- 0 of 1,972
 * rows in the first, 60 of 326 creatures in the second -- so sim-engine.js fell through to
 * its estimate for almost every creature it has ever played:
 *
 *     power = max(1, round(cmc * 0.9))     +1 for trample/double strike/menace
 *     toughness = the same                 +2 for defender
 *
 * A one-mana 2/1 was simulated as a 1/1. A seven-mana 4/4 as a 6/6. Ragavan as a 1/1, Grave
 * Titan as a 5/5, every Wall in the deck at whatever its mana value implied. In an engine
 * whose entire business is combat, that is a larger gap than the storm count already named
 * in the caveats -- and it was written down nowhere in this repository.
 *
 * WHERE THE NUMBERS COME FROM. Scryfall's oracle bulk file, which graph/.cache already
 * holds because the commander registry is built from it. No network is needed if the cache
 * is present; tools/commander-universe.mjs refreshes it.
 *
 * DOUBLE-FACED CARDS take the first face that has a body: Fable of the Mirror-Breaker is an
 * Enchantment on its front and a 2/2 on its back, and the back is the thing that fights.
 *
 * WHAT THIS DOES NOT DO. It does not re-measure anything. Every published score in this
 * repository was computed with estimated bodies, so every one of them moves once these
 * fields are read -- that is a separate, deliberate re-bake.
 *
 *   node tools/add-power-toughness.mjs            report coverage, write nothing
 *   node tools/add-power-toughness.mjs --write    patch both card files
 */

import {createReadStream, readFileSync, writeFileSync, existsSync} from "node:fs";
import {createInterface} from "node:readline";
import {fileURLToPath} from "node:url";
import {dirname, join} from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BULK = join(ROOT, "graph", ".cache", "oracle-universe.jsonl");
const WRITE = process.argv.includes("--write");

if (!existsSync(BULK)) {
  console.error(`No Scryfall bulk file at ${BULK}.`);
  console.error("Run: node tools/commander-universe.mjs   (it downloads and caches it)");
  process.exit(2);
}

const read = (...p) => JSON.parse(readFileSync(join(ROOT, ...p), "utf8"));
const catalog = read("data", "cards.json");
const factsFile = read("data", "card-facts.json");

const wanted = new Set(catalog.cards.map((c) => c.name));
Object.keys(factsFile.cards).forEach((name) => wanted.add(name));

/* The first face with a body. A card with no body at all -- an instant, a land -- is not
   recorded, so a missing entry stays missing rather than becoming a 0/0. */
function bodyOf(card) {
  const faces = [card].concat(card.card_faces || []);
  for (const face of faces) {
    if (face.power != null || face.toughness != null) {
      return {power: String(face.power ?? ""), toughness: String(face.toughness ?? "")};
    }
  }
  return null;
}

const bodies = new Map();
let rows = 0;
const lines = createInterface({input: createReadStream(BULK), crlfDelay: Infinity});
for await (const line of lines) {
  if (!line.trim()) continue;
  rows += 1;
  let card;
  try { card = JSON.parse(line); } catch (error) { continue; }
  if (!card.name || !wanted.has(card.name) || bodies.has(card.name)) continue;
  const body = bodyOf(card);
  if (body) bodies.set(card.name, body);
}

const creaturesIn = (list) => list.filter((c) => /Creature/.test(c.typeLine || ""));
const catCreatures = creaturesIn(catalog.cards);
const factCreatures = Object.keys(factsFile.cards)
  .filter((n) => /Creature/.test(factsFile.cards[n].typeLine || ""));

console.log(`${rows.toLocaleString()} cards in the bulk file, ${bodies.size} bodies for the ` +
  `${wanted.size} names this repository holds.`);
console.log(`  data/cards.json      ${catCreatures.filter((c) => bodies.has(c.name)).length}` +
  ` of ${catCreatures.length} creatures`);
console.log(`  data/card-facts.json ${factCreatures.filter((n) => bodies.has(n)).length}` +
  ` of ${factCreatures.length} creatures`);

const missing = catCreatures.filter((c) => !bodies.has(c.name)).map((c) => c.name);
if (missing.length) console.log(`  still without a body: ${missing.join(", ")}`);

if (!WRITE) {
  console.log("\nNothing written. --write to patch both files.");
  console.log("Every published score was measured with estimated bodies and will move once");
  console.log("these are read; re-bake deliberately, not as a side effect of this.");
  process.exit(0);
}

/* Written back in each file's own shape: data/cards.json is indented two spaces and
   data/card-facts.json is minified, and reformatting either would bury the change in a
   diff nobody could read. */
let touched = 0;
catalog.cards = catalog.cards.map((card) => {
  const body = bodies.get(card.name);
  if (!body) return card;
  touched += 1;
  const out = {};
  for (const key of Object.keys(card)) {
    out[key] = card[key];
    if (key === "typeLine") { out.power = body.power; out.toughness = body.toughness; }
  }
  if (!("power" in out)) { out.power = body.power; out.toughness = body.toughness; }
  return out;
});
writeFileSync(join(ROOT, "data", "cards.json"), JSON.stringify(catalog, null, 2) + "\n");

let touchedFacts = 0;
for (const name of Object.keys(factsFile.cards)) {
  const body = bodies.get(name);
  if (!body) continue;
  touchedFacts += 1;
  const card = factsFile.cards[name];
  const out = {};
  for (const key of Object.keys(card)) {
    out[key] = card[key];
    if (key === "typeLine") { out.power = body.power; out.toughness = body.toughness; }
  }
  if (!("power" in out)) { out.power = body.power; out.toughness = body.toughness; }
  factsFile.cards[name] = out;
}
writeFileSync(join(ROOT, "data", "card-facts.json"), JSON.stringify(factsFile) + "\n");

console.log(`\nwrote data/cards.json (${touched} bodies) and data/card-facts.json (${touchedFacts}).`);
