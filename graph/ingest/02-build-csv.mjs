// Turns Scryfall bulk + your master sheet into CSVs Neo4j can LOAD.
//
//   node graph/ingest/02-build-csv.mjs [--cache graph/.cache] [--out graph/.import]
//
// THE MODELING DECISION lives in card-classify.js, which this file used to own
// outright: cards are never linked to cards, they are linked to the EVENTS they fire
// on and cause and the RESOURCES they make and spend, and synergy is the two-hop path
// between them. The graph page now classifies cards too -- somebody types a
// Commander-legal card this bake never included and the page draws its neighborhood --
// and a second copy of that vocabulary would drift somewhere nobody could see it. So
// the tables moved out and both callers read the same ones.
import {mkdir, readFile, writeFile} from "node:fs/promises";
import {createReadStream, existsSync} from "node:fs";
import {createInterface} from "node:readline";
import {createRequire} from "node:module";
import {buildPriceIndex} from "./02b-price-index.mjs";

const require = createRequire(import.meta.url);
const Classify = require("../../card-classify.js");

const cacheDir = arg("--cache") || "graph/.cache";
const outDir = arg("--out") || "graph/.import";
function arg(flag) { const i = process.argv.indexOf(flag); return i >= 0 ? process.argv[i + 1] : null; }

const csv = (v) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const rows = (header, data) => [header.join(","), ...data.map((r) => r.map(csv).join(","))].join("\n") + "\n";

// --- read the corpus ------------------------------------------------------
async function *jsonl(path) {
  const rl = createInterface({input: createReadStream(path), crlfDelay: Infinity});
  for await (const line of rl) { const t = line.trim().replace(/,$/, ""); if (t && t !== "[" && t !== "]") yield JSON.parse(t); }
}

await mkdir(outDir, {recursive: true});

// Prices come from every printing, not the one representative row oracle_cards
// carries -- see 02b for why four staple shocklands otherwise read as free.
let priceIndex = new Map();
if (existsSync(`${cacheDir}/default_cards.jsonl`)) {
  const built = await buildPriceIndex(cacheDir);
  priceIndex = built.index;
  console.log(`priced from ${built.rows.toLocaleString()} printings`);
} else {
  console.log("no default_cards.jsonl -- falling back to one printing per card; run 01-fetch.mjs to fix prices");
}

/* WHO CAN BE A COMMANDER, from the file that asked Scryfall rather than from a
   regex over the type line. This was `/Legendary/ && /Creature/` against the whole
   type line, and it was wrong in both directions: the 29 Kamigawa flip cards read
   "Creature - ... // Legendary Creature - ..." so both halves matched a card whose
   FRONT face is not legendary, and the 21 planeswalkers that say "can be your
   commander" matched neither half. Grist, the Hunger Tide is legal by a rule no
   type line states at all. tools/commander-universe.mjs writes the answer down;
   this reads it. Without the file the old heuristic still runs, so a bake on a
   fresh checkout produces something rather than nothing -- and says that it did. */
const commanderNames = await (async () => {
  try {
    const uni = JSON.parse(await readFile("data/commander-universe.json", "utf8"));
    const names = new Set(uni.cards.filter((c) => c[6]).map((c) => c[0]));
    console.log(`commanders from data/commander-universe.json (${names.size})`);
    return names;
  } catch (err) {
    console.log("no data/commander-universe.json -- falling back to the type-line guess, "
      + "which misses planeswalker commanders; run tools/commander-universe.mjs to fix");
    return null;
  }
})();
function canBeCommander(card) {
  if (commanderNames) return commanderNames.has(card.name);
  const front = card.card_faces?.[0]?.type_line || card.type_line || "";
  return (/\bLegendary\b/.test(front) && /Creature/.test(front))
    || /can be your commander/i.test(card.oracle_text || "")
    || (card.card_faces || []).some((f) => /can be your commander/i.test(f.oracle_text || ""));
}

const cards = [], fills = [], causes = [], triggers = [], produces = [], consumes = [],
      requires = [], mechanics = [], tribes = [], printings = [];
let seen = 0, legal = 0;

for await (const c of jsonl(`${cacheDir}/oracle_cards.jsonl`)) {
  seen++;
  const commanderLegal = c.legalities?.commander === "legal";
  if (!commanderLegal) continue;
  legal++;
  const typeLine = c.type_line || "";
  const faces = c.card_faces || [];
  const mv = Number(c.cmc || 0);
  const ci = (c.color_identity || []).join("");
  const isLand = /\bLand\b/.test(typeLine);

  const pi = priceIndex.get(c.oracle_id);
  const usd = (pi && pi.usd) || Number(c.prices?.usd) || "";
  const foil = (pi && pi.foil) || Number(c.prices?.usd_foil) || "";
  cards.push([c.oracle_id, c.name, mv, ci, typeLine, c.rarity || "", (pi && pi.set) || c.set_name || "",
              usd, foil,
              c.edhrec_rank || "", isLand ? "true" : "false",
              canBeCommander(c) ? "true" : "false",
              (c.image_uris?.normal || faces[0]?.image_uris?.normal || ""),
              (pi && pi.tcg) || c.purchase_uris?.tcgplayer || "",
              pi ? pi.printings : 1]);
  printings.push([c.id, c.oracle_id, c.set || "", c.collector_number || "",
                  c.finishes?.includes("foil") ? "true" : "false", Number(c.prices?.usd || 0) || ""]);

  // What the card does, from the one copy of the vocabulary. The CSVs carry two things
  // the graph page never needs -- how often a cause fires, and whether a requirement is
  // hard -- so those come back alongside rather than being re-derived from a second copy
  // of the patterns.
  const what = Classify.classify(c);
  const detail = Classify.edgeDetail(c);
  for (const e of what.triggers) triggers.push([c.oracle_id, e, detail.triggersYoursOnly]);
  for (const e of what.causes) causes.push([c.oracle_id, e, detail.causeRate]);
  for (const r of what.produces) produces.push([c.oracle_id, r]);
  for (const r of what.consumes) consumes.push([c.oracle_id, r]);
  for (const q of what.requires) requires.push([c.oracle_id, q, detail.requireStrength(q)]);
  for (const r of what.roles) fills.push([c.oracle_id, r, 1]);
  for (const m of what.mechanics) mechanics.push([c.oracle_id, m]);
  for (const t of what.tribes) tribes.push([c.oracle_id, t]);
}

// --- your overlays --------------------------------------------------------
const master = JSON.parse(await readFile("data/master-v2.json", "utf8"));
const owns = [], assigned = [];
// The deck labels come from the Master, never from a constant here. They were
// hardcoded once -- D4 "Betor", D6 "Purphoros" -- and when the 2026-09-05 rebuild
// moved Felothar and Krenko into those command zones, this file kept writing the
// old names into assigned.csv. The Deck nodes, graph.json and every Copilot
// warning then named two commanders that no longer held their seats, and nothing
// downstream could notice because the CSV looked internally consistent.
const DECKS = Object.fromEntries(master.decks.map((deck) => [deck.id, deck.label]));
for (const card of master.cards) {
  const own = Number(card.own || 0), ordered = Number(card.ordered || 0);
  if (own || ordered) owns.push([card.name, own, ordered, Number(card.benchActual || 0)]);
  for (const [id, label] of Object.entries(DECKS)) {
    const t = Number(card.target?.[id] || 0), a = Number(card.actual?.[id] || 0);
    if (t || a) assigned.push([card.name, id, label, t, a, a >= t && t > 0 ? "in-deck" : (a > 0 ? "partial" : "missing")]);
  }
}

const files = {
  "cards.csv":      rows(["oracleId","name","manaValue","colorIdentity","typeLine","rarity","setName","priceUsd","priceFoil","edhrecRank","isLand","canBeCommander","image","tcgUri","printings"], cards),
  "printings.csv":  rows(["scryfallId","oracleId","set","collectorNumber","hasFoil","priceUsd"], printings),
  "fills.csv":      rows(["oracleId","role","weight"], fills),
  "causes.csv":     rows(["oracleId","event","rate"], causes),
  "triggers.csv":   rows(["oracleId","event","yoursOnly"], triggers),
  "produces.csv":   rows(["oracleId","resource"], produces),
  "consumes.csv":   rows(["oracleId","resource"], consumes),
  "requires.csv":   rows(["oracleId","role","strength"], requires),
  "mechanics.csv":  rows(["oracleId","mechanic"], mechanics),
  "tribes.csv":     rows(["oracleId","tribe"], tribes),
  "owns.csv":       rows(["name","own","ordered","bench"], owns),
  "assigned.csv":   rows(["name","deckId","deckName","target","actual","state"], assigned)
};
for (const [f, body] of Object.entries(files)) await writeFile(`${outDir}/${f}`, body);

console.log(`scanned ${seen} oracle cards, ${legal} commander-legal`);
for (const [f, body] of Object.entries(files)) console.log(`  ${f.padEnd(16)} ${(body.split("\n").length - 2).toLocaleString()} rows`);
