// Turns Scryfall bulk + your master sheet into CSVs Neo4j can LOAD.
//
//   node graph/ingest/02-build-csv.mjs [--cache graph/.cache] [--out graph/.import]
//
// THE MODELING DECISION THIS FILE ENCODES. Cards are never linked to cards.
// A card is linked to the EVENTS it fires on and the events it CAUSES, and to the
// RESOURCES it makes and spends. Synergy is then a two-hop path -- Krenko CAUSES
// creature-etb, Purphoros TRIGGERS_ON creature-etb -- so it is derived at query
// time instead of curated. 38k cards would be 1.9 billion authored pairs; this is
// a few hundred thousand edges and it generalises to cards added tomorrow.
//
// Reminder text is stripped before any ability is read. Scryfall prints reminder
// text in parentheses, and reading it as rules text is what once credited Bronze
// Guardian with a +1/+1 counter doubler it does not have.
import {mkdir, readFile, writeFile} from "node:fs/promises";
import {createReadStream, existsSync} from "node:fs";
import {createInterface} from "node:readline";
import {buildPriceIndex} from "./02b-price-index.mjs";

const cacheDir = arg("--cache") || "graph/.cache";
const outDir = arg("--out") || "graph/.import";
function arg(flag) { const i = process.argv.indexOf(flag); return i >= 0 ? process.argv[i + 1] : null; }

const stripReminder = (t) => String(t || "").replace(/\([^()]*\)/g, " ").replace(/[ \t]{2,}/g, " ");
const csv = (v) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const rows = (header, data) => [header.join(","), ...data.map((r) => r.map(csv).join(","))].join("\n") + "\n";

// --- the event vocabulary -------------------------------------------------
// Each entry: the event id, what a card that LISTENS for it says, and what a card
// that CAUSES it says. Keeping both sides in one table is what keeps them aligned.
const EVENTS = [
  {id: "creature-etb",   listen: /whenever (?:another )?(?:a |one or more )?creatures?[^.]{0,40}enters/,
                         cause:  /create (?:a|an|one|two|three|four|x|\d+)[^.]{0,60}creature tokens?|put (?:a|an|two|\d+)[^.]{0,40}creature[^.]{0,20}onto the battlefield|exile [^.]{0,50}(?:then )?returns? (?:it|them|that card|those cards) to the battlefield|returns? (?:it|them|that card) to the battlefield under (?:its|their) owner/},
  {id: "land-drop",      listen: /landfall|whenever a land (?:you control )?enters/,
                         cause:  /you may play an additional land|put (?:a|that) land(?: card)? onto the battlefield|search your library for a[^.]{0,50}land[^.]{0,40}onto the battlefield/},
  {id: "creature-dies",  listen: /whenever (?:another |a |the )?(?:equipped |enchanted |target |nontoken )?creature(?:s)? (?:you control )?(?:dies|die)/,
                         cause:  /sacrifice (?:a|an|another|two|\d+) creature|destroy target creature|deals? \d+ damage to target creature/},
  {id: "attack",         listen: /whenever [^.]{0,40}attacks/,
                         cause:  /must be blocked|attacks? each combat if able|goad/},
  {id: "combat-begin",   listen: /at the beginning of combat/, cause: /additional combat phase|untap all creatures you control/},
  {id: "end-step",       listen: /at the beginning of (?:your |each )?end step/, cause: null},
  {id: "upkeep",         listen: /at the beginning of (?:your |each )?upkeep/, cause: null},
  {id: "cast-spell",     listen: /whenever you cast (?:a|an|your)/, cause: null},
  {id: "proliferate",    listen: /proliferate/,
                         cause:  /put (?:a|an|one|two|three|x|\d+)[^.]{0,40}counters? on|enters with (?:a|an|one|two|three|x|\d+)[^.]{0,30}counters?/},
  {id: "counter-placed", listen: /whenever (?:one or more )?\+1\/\+1 counters? (?:is|are) put/,
                         cause:  /put (?:a|an|one|two|three|x|\d+)[^.]{0,30}\+1\/\+1 counters?/},
  {id: "life-gain",      listen: /whenever you gain life/, cause: /you gain \d+ life|gain (?:that much|x) life|lifelink/},
  {id: "life-loss",      listen: /whenever (?:an? )?opponent loses life/, cause: /each opponent loses \d+ life|target player loses \d+ life/},
  {id: "draw-card",      listen: /whenever you draw/, cause: /draw (?:a|one|two|three|x|\d+) cards?/},
  {id: "sacrifice",      listen: /whenever you sacrifice/, cause: /sacrifice (?:a|an|another)[^:\n]{0,40}:/},
  {id: "graveyard-entry",listen: /whenever (?:a|one or more) [^.]{0,30}(?:card |permanent )?(?:is put into|enters) (?:your |a )?graveyard/,
                         cause:  /mill \d+|discard (?:a|your|\d+)|put (?:the )?top \d+ cards[^.]{0,30}graveyard/}
];

const RESOURCES = [
  {id: "mana",     produce: /\{t\}: add|add \{[wubrgc]\}|add (?:one|two|three|x|\d+) mana/, consume: null},
  {id: "treasure", produce: /create (?:a|an|one|two|three|x|\d+)[^.]{0,30}treasure/, consume: /sacrifice[^.]{0,20}treasure/},
  {id: "card",     produce: /draw (?:a|one|two|three|x|\d+) cards?/, consume: /discard (?:a|your|two|\d+)/},
  {id: "life",     produce: /you gain \d+ life|gain (?:that much|x) life/, consume: /you lose \d+ life|pay \d+ life/},
  {id: "counter",  produce: /put (?:a|an|one|two|three|x|\d+)[^.]{0,30}\+1\/\+1 counters?/, consume: /remove (?:a|an|one|two|x|\d+)[^.]{0,30}counters?/},
  {id: "token",    produce: /create (?:a|an|one|two|three|x|\d+)[^.]{0,60}token/, consume: null}
];

// A card that says "sacrifice a creature" needs bodies; one that pays off counters
// needs a source of counters. These are the REQUIRES edges -- the demand side.
const REQUIRES = [
  {role: "sac-outlet",  when: /sacrifice (?:a|an|another) (?:creature|permanent|token|artifact)/, hard: false},
  {role: "counters",    when: /(?:for each|equal to the number of)[^.]{0,40}\+1\/\+1 counter|remove (?:a|an|x|\d+)[^.]{0,20}\+1\/\+1 counter/, hard: true},
  {role: "creatures",   when: /creatures you control get|whenever (?:another )?creature you control/, hard: true},
  {role: "artifacts",   when: /(?:for each|number of) artifacts? you control|whenever (?:another )?artifact (?:you control )?enters/, hard: true},
  {role: "graveyard",   when: /return target[^.]{0,40}from your graveyard|(?:for each|number of) [^.]{0,30}in your graveyard/, hard: true},
  {role: "lands",       when: /landfall|(?:for each|number of) lands? you control/, hard: true},
  {role: "instants",    when: /(?:for each|number of) instant|whenever you cast (?:an )?instant/, hard: true}
];

// Supply roles. REQUIRES names these, so they must exist on the FILLS side too --
// a demand vocabulary with no matching supply vocabulary reports every payoff as
// unsatisfied, which is worse than not checking at all.
const SUPPLY_ROLES = [
  {id: "creatures", test: (tl) => /Creature/.test(tl)},
  {id: "artifacts", test: (tl) => /Artifact/.test(tl)},
  {id: "lands",     test: (tl) => /Land/.test(tl)},
  {id: "instants",  test: (tl) => /Instant/.test(tl)}
];
const SUPPLY_TEXT = [
  {id: "counters",  re: /put (?:a|an|one|two|three|x|\d+)[^.]{0,30}\+1\/\+1 counters?/},
  {id: "graveyard", re: /mill \d+|discard (?:a|your|\d+)|put (?:the )?top \d+ cards[^.]{0,30}graveyard/},
  {id: "sac-outlet",re: /sacrifice (?:a|an|another) (?:creature|permanent|token|artifact)[^:\n]{0,40}:/}
];

const ROLE_PATTERNS = [
  {id: "ramp",       re: /\{t\}: add|add \{[wubrgc]\}|search your library for a[^.]{0,50}land|you may play an additional land/},
  {id: "draw",       re: /draw (?:a|one|two|three|x|\d+) cards?|draws? that many cards/},
  {id: "removal",    re: /destroy target|exile target (?:creature|permanent|artifact|enchantment|planeswalker)|deals? \d+ damage to (?:target|any target)|fights? target/},
  {id: "wipe",       re: /destroy all|exile all|all creatures get [-−]|each player sacrifices/},
  {id: "protection", re: /hexproof|indestructible|protection from|counter target spell|prevent all damage|can't be countered/},
  {id: "recursion",  re: /return target .{0,40}from your graveyard|return .{0,30}from your graveyard to (?:the battlefield|your hand)/},
  {id: "tutor",      re: /search your library for an? (?:card|artifact|creature|enchantment|instant|sorcery|permanent)/},
  {id: "sac-outlet", re: /sacrifice (?:a|an|another) (?:creature|permanent|token|artifact)[^:\n]{0,40}:/},
  {id: "finisher",   re: /you win the game|each opponent loses \d+ life|extra combat phase/}
];

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
  const rawText = c.oracle_text || faces.map((f) => f.oracle_text || "").join("\n");
  const text = stripReminder(rawText).toLowerCase();
  const mv = Number(c.cmc || 0);
  const ci = (c.color_identity || []).join("");
  const isLand = /\bLand\b/.test(typeLine);

  const pi = priceIndex.get(c.oracle_id);
  const usd = (pi && pi.usd) || Number(c.prices?.usd) || "";
  const foil = (pi && pi.foil) || Number(c.prices?.usd_foil) || "";
  cards.push([c.oracle_id, c.name, mv, ci, typeLine, c.rarity || "", (pi && pi.set) || c.set_name || "",
              usd, foil,
              c.edhrec_rank || "", isLand ? "true" : "false",
              /\bLegendary\b/.test(typeLine) && /Creature/.test(typeLine) ? "true" : "false",
              (c.image_uris?.normal || faces[0]?.image_uris?.normal || ""),
              (pi && pi.tcg) || c.purchase_uris?.tcgplayer || "",
              pi ? pi.printings : 1]);
  printings.push([c.id, c.oracle_id, c.set || "", c.collector_number || "",
                  c.finishes?.includes("foil") ? "true" : "false", Number(c.prices?.usd || 0) || ""]);

  // A trigger doubler listens to whatever it doubles, so it reads as a co-payoff.
  const doublesEtb = /entering the battlefield causes a triggered ability[^.]{0,60}to trigger|triggers? an additional time/.test(text);
  if (doublesEtb) {
    if (/creature|permanent/.test(text)) triggers.push([c.oracle_id, "creature-etb", "true"]);
    if (/land/.test(text)) triggers.push([c.oracle_id, "land-drop", "true"]);
  }
  for (const e of EVENTS) {
    if (e.listen && e.listen.test(text)) triggers.push([c.oracle_id, e.id, /you control/.test(text) ? "true" : "false"]);
    if (e.cause && e.cause.test(text)) causes.push([c.oracle_id, e.id, /whenever|at the beginning/.test(text) ? "repeatable" : "once"]);
  }
  for (const r of RESOURCES) {
    if (r.produce && r.produce.test(text)) produces.push([c.oracle_id, r.id]);
    if (r.consume && r.consume.test(text)) consumes.push([c.oracle_id, r.id]);
  }
  for (const q of REQUIRES) if (q.when.test(text)) requires.push([c.oracle_id, q.role, q.hard ? "hard" : "soft"]);
  for (const r of ROLE_PATTERNS) if (!isLand && r.re.test(text)) fills.push([c.oracle_id, r.id, 1]);
  for (const r of SUPPLY_ROLES) if (r.test(typeLine)) fills.push([c.oracle_id, r.id, 1]);
  for (const r of SUPPLY_TEXT) if (r.re.test(text)) fills.push([c.oracle_id, r.id, 1]);
  for (const k of (c.keywords || [])) mechanics.push([c.oracle_id, k.toLowerCase()]);
  const sub = (typeLine.split("—")[1] || "").trim();
  if (/Creature/.test(typeLine)) for (const t of sub.split(/\s+/).filter(Boolean)) tribes.push([c.oracle_id, t]);
}

// --- your overlays --------------------------------------------------------
const master = JSON.parse(await readFile("data/master-v2.json", "utf8"));
const owns = [], assigned = [];
const DECKS = {D1: "Quintorius", D2: "Chulane", D3: "Atraxa", D4: "Betor", D5: "Shadrix", D6: "Purphoros"};
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
