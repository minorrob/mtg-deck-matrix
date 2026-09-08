// The names printed on cards that are not the names the rules use.
//
//   node tools/flavor-names.mjs            # write data/flavor-names.json
//   node tools/flavor-names.mjs --check    # fetch and report, write nothing
//
// WHY THIS FILE EXISTS. data/commander-universe.json holds all 31,830 Commander-legal
// cards by their ORACLE name, which is the name the rules and every deck list use. It is
// not always the name on the card a reader is holding. A Secret Lair prints Jodah, the
// Unifier as "SpongeBob SquarePants"; Universes Beyond prints Abrade as "You're Gonna
// Need a Bigger Boat". Somebody typing what is written on their card found nothing,
// because the local catalog had never heard of it -- they had to press "Search exact
// name / link", which reaches Scryfall, which does match flavour names.
//
// That is a wall in the middle of the one thing the app promises: every card findable.
// 647 cards carry a flavour name, which is small enough to ship, so the catalog now
// knows them all offline and the search box answers on the first keystroke.
//
// A card can carry SEVERAL flavour names across printings. All of them are kept: the
// reader types the one on the card in front of them, not the one Scryfall happens to
// return first.
//
// curl, not fetch(): the same host-allowlist note graph/ingest/01-fetch.mjs carries.
import {writeFile} from "node:fs/promises";
import {execFile} from "node:child_process";
import {promisify} from "node:util";

const run = promisify(execFile);
const OUT = new URL("../data/flavor-names.json", import.meta.url);
const check = process.argv.includes("--check");
const QUERY = "has:flavorname legal:commander";

async function get(url) {
  const {stdout} = await run("curl", ["-sSL", "--fail", "--max-time", "45", url], {maxBuffer: 64 * 1024 * 1024});
  return JSON.parse(stdout);
}

const pairs = new Map();   // flavour name -> {oracle, sets:Set}
let page = 1, total = 0, more = true;
while (more) {
  const url = `https://api.scryfall.com/cards/search?q=${encodeURIComponent(QUERY)}&unique=prints&page=${page}`;
  const data = await get(url);
  total = data.total_cards || total;
  for (const card of data.data || []) {
    if (!card.flavor_name || !card.name) continue;
    if (card.flavor_name === card.name) continue;
    const row = pairs.get(card.flavor_name) || {oracle: card.name, sets: new Set()};
    row.sets.add(card.set_name || card.set || "");
    pairs.set(card.flavor_name, row);
  }
  more = Boolean(data.has_more);
  page += 1;
  process.stdout.write(`  page ${page - 1} · ${pairs.size} flavour names of ${total} printings\r`);
  await new Promise((r) => setTimeout(r, 110));   // Scryfall asks for 50-100ms between calls
}

const rows = [...pairs.entries()]
  .map(([flavor, row]) => [flavor, row.oracle, [...row.sets].filter(Boolean).sort().join(" · ")])
  .sort((a, b) => a[0].localeCompare(b[0]));

console.log(`\n${rows.length} flavour names over ${total} printings`);
console.log(rows.slice(0, 6).map(([f, o]) => `  ${f} = ${o}`).join("\n"));

if (check) process.exit(0);
await writeFile(OUT, JSON.stringify({
  generatedAt: new Date().toISOString(),
  source: `Scryfall /cards/search q=${QUERY} unique=prints`,
  fields: ["flavorName", "name", "printedIn"],
  counts: {names: rows.length, printings: total},
  cards: rows
}), "utf8");
console.log("wrote data/flavor-names.json");
