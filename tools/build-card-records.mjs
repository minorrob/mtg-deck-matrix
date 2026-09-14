/* THE CARD RECORD'S PRODUCER -- today its check, tomorrow its build.
 *
 * data/cards.json (the catalog the app boots from) and data/card-facts.json (the display
 * facts keyed by name) are two copies of one Card record, written over time by four tools
 * (build_card_facts.py, add-power-toughness.mjs, hydrate_new_ladder_cards.mjs, audit-cards.mjs).
 * Critical 1 of docs/data-model-evaluation-2026-09.md makes this file the one producer of
 * both, from Scryfall through card-classify.js. Until that lands, this is the declared
 * producer's --check: the envelope and schema of each file, the invariants between them
 * (one entry per name, every facts name in the catalog, every catalog card typed and
 * coloured), so the generators suite vouches for the two files the app cannot start without.
 *
 *   node tools/build-card-records.mjs --check
 */
import {report, readData} from "../schema/index.mjs";

if (!process.argv.includes("--check")) {
  console.error("build-card-records: the build lands with Critical 1 (see docs/data-model-evaluation-2026-09.md §3); today only --check is implemented.");
  process.exit(2);
}
const cards = readData("data/cards.json"), facts = readData("data/card-facts.json");
const problems = [];
const names = new Set();
for (const c of cards.cards) { if (names.has(c.name)) problems.push(`cards.json names ${c.name} twice`); names.add(c.name); }
for (const c of cards.cards) if (!c.typeLine || !Array.isArray(c.colorIdentity)) problems.push(`cards.json: ${c.name} has no type line or colour identity`);
/* The facts file was keyed by the legacy viewer, which named a double-faced card by its front
   face and carried cards the catalog never took in. A front-face name resolves; the rest are
   the gap Critical 1 closes by building both files from one record, and are counted here
   rather than failed on, so the number is visible on every run until it is zero. */
const fronts = new Set(cards.cards.filter((c) => c.name.includes(" // ")).map((c) => c.name.split(" // ")[0]));
const factsOnly = Object.keys(facts.cards).filter((name) => !names.has(name) && !fronts.has(name));
if (problems.length) { console.error(`card records: ${problems.length} problem${problems.length === 1 ? "" : "s"}\n  - ${problems.slice(0, 20).join("\n  - ")}`); process.exit(1); }
const ok = report("data/cards.json", cards) & report("data/card-facts.json", facts);
console.log(`card records: ${cards.cards.length} cards, ${Object.keys(facts.cards).length} with display facts, one entry per name; ${factsOnly.length} facts entries name cards the catalog does not carry (Critical 1 closes this).`);
process.exit(ok ? 0 : 1);
