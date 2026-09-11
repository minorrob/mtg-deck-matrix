// The three directed fields the bake did not carry: multiplies, grants, extends.
//
//   node tools/graph-amplifiers.mjs            # fetch rules text, write data/graph.json
//   node tools/graph-amplifiers.mjs --check    # re-derive and report, change nothing
//   node tools/graph-amplifiers.mjs --audit    # also report where the OLD fields disagree
//   node tools/graph-amplifiers.mjs --all      # rewrite every classified field, not just the new three
//   node tools/graph-amplifiers.mjs --from-bulk graph/.cache/oracle_cards.jsonl
//                                              # fill the text cache from the Scryfall bulk file
//                                              # 01-fetch already pulled, instead of asking the API
//
// WHY THIS EXISTS RATHER THAN A NEO4J RE-RUN. graph/ingest/ builds data/graph.json out
// of a 90 MB Scryfall bulk file and a Neo4j load, which is the right pipeline for a
// full rebuild and the wrong one for adding three derived columns to a corpus that is
// already correct. This asks Scryfall for the rules text of the 7,764 cards the bake
// already committed -- /cards/collection, 75 oracle ids a request -- runs the SAME
// card-classify.js the app and the pipeline share, and writes back only the new fields.
// Everything else in the file is left untouched, byte for byte.
//
// THE TEXT IS CACHED under graph/.cache/ (gitignored) so a re-run costs nothing and
// --check works offline once the cache exists. The cache is keyed by oracle id, which
// is the identity the bake uses; a card whose text Scryfall no longer answers for keeps
// whatever the previous run gave it rather than silently losing its fields.
//
// curl, not fetch(): the same host-allowlist note graph/ingest/01-fetch.mjs carries.
import {readFile, writeFile, mkdir} from "node:fs/promises";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {createRequire} from "node:module";

const run = promisify(execFile);
const require = createRequire(import.meta.url);
const Classify = require("../card-classify.js");

const GRAPH = new URL("../data/graph.json", import.meta.url);
const CACHE_DIR = new URL("../graph/.cache/", import.meta.url);
const CACHE = new URL("oracle-text.json", CACHE_DIR);
/* offersStat is deliberately NOT here. It is a function of power and toughness, which the
   rules-text cache does not carry, so this pass would compute an empty array for every card
   and wipe what the bake read off the printed numbers. The Neo4j pipeline owns that field;
   tests/card-classify.mjs still holds both sides to the same classifier. */
const NEW_FIELDS = ["multiplies", "grants", "extends", "wants", "makes", "wantsStat"];
const OLD_FIELDS = ["roles", "requires", "causes", "triggers", "produces", "mechanics", "tribes"];
const check = process.argv.includes("--check");
const audit = process.argv.includes("--audit");
/* --all rewrites the fields the Neo4j bake produced as well. That is not a liberty: the
   pipeline and the page share card-classify.js, and tests/card-classify.mjs asserts the
   two agree card for card. When the vocabulary changes -- retiring the "proliferate
   event", say -- the bake has to follow or the test is measuring a fossil. */
const all = process.argv.includes("--all");
const FIELDS = all ? OLD_FIELDS.concat(NEW_FIELDS) : NEW_FIELDS;

const Payload = require("../graph-payload.js");
const rawGraph = JSON.parse(await readFile(GRAPH, "utf8"));
const packed = rawGraph.format === Payload.FORMAT;
const graph = Payload.unpack(rawGraph);
const cards = graph.cards || [];
console.log(`${cards.length} cards in the bake`);

/* ------------------------------------------------------------ the rules text */

let cache = {};
try { cache = JSON.parse(await readFile(CACHE, "utf8")); } catch { cache = {}; }
const before = Object.keys(cache).length;
if (before) console.log(`${before} cards' rules text already cached`);

/* --from-bulk: the bake's own oracle_cards.jsonl carries every field this cache keeps, for
   every legal card, so a whole-format pass needs no API round at all. Same shape as the
   API answer below, so --check and the classify step cannot tell the two apart. */
const bulk = process.argv.indexOf("--from-bulk") >= 0 ? process.argv[process.argv.indexOf("--from-bulk") + 1] : null;
if (bulk) {
  const {createReadStream} = await import("node:fs");
  const {createInterface} = await import("node:readline");
  const need = new Set(cards.map((c) => c.id));
  let filled = 0;
  for await (const line of createInterface({input: createReadStream(bulk), crlfDelay: Infinity})) {
    const t = line.trim().replace(/,$/, ""); if (!t || t === "[" || t === "]") continue;
    const raw = JSON.parse(t);
    if (!need.has(raw.oracle_id)) continue;
    cache[raw.oracle_id] = {
      name: raw.name, type_line: raw.type_line || "", oracle_text: raw.oracle_text || "",
      keywords: raw.keywords || [], game_changer: Boolean(raw.game_changer),
      card_faces: (raw.card_faces || []).map((f) => ({oracle_text: f.oracle_text || "", type_line: f.type_line || ""}))
    };
    filled += 1;
  }
  await mkdir(CACHE_DIR, {recursive: true});
  await writeFile(CACHE, JSON.stringify(cache), "utf8");
  console.log(`${filled} cards' rules text filled from ${bulk}`);
}
/* A cached entry from before game_changer was captured is refetched: a missing flag and
   a false one look the same in JSON, and the difference is a whole bracket. */
const wanted = cards.map((c) => c.id).filter((id) => id && (!cache[id] || cache[id].game_changer === undefined));
if (wanted.length && check) {
  console.log(`${wanted.length} cards have no cached text; --check reports on the rest`);
} else if (wanted.length) {
  console.log(`fetching rules text for ${wanted.length} cards (${Math.ceil(wanted.length / 75)} requests)`);
  for (let i = 0; i < wanted.length; i += 75) {
    const batch = wanted.slice(i, i + 75);
    const body = JSON.stringify({identifiers: batch.map((oracle_id) => ({oracle_id}))});
    let data = null;
    try {
      const {stdout} = await run("curl", ["-sSL", "--fail", "--max-time", "45",
        "-H", "Content-Type: application/json", "-H", "Accept: application/json",
        "--data-binary", body, "https://api.scryfall.com/cards/collection"],
        {maxBuffer: 64 * 1024 * 1024});
      data = JSON.parse(stdout);
    } catch (error) {
      console.warn(`  batch ${i / 75 + 1} failed: ${error.message.split("\n")[0]}`);
    }
    for (const raw of (data && data.data) || []) {
      // A collection answer is one PRINTING; the oracle text is the same on every one.
      cache[raw.oracle_id] = {
        name: raw.name, type_line: raw.type_line || "", oracle_text: raw.oracle_text || "",
        keywords: raw.keywords || [],
        game_changer: Boolean(raw.game_changer),
        card_faces: (raw.card_faces || []).map((f) => ({oracle_text: f.oracle_text || "", type_line: f.type_line || ""}))
      };
    }
    if ((i / 75) % 10 === 0) process.stdout.write(`  ${Math.min(i + 75, wanted.length)}/${wanted.length}\r`);
    await new Promise((r) => setTimeout(r, 110)); // Scryfall asks for 50-100ms between calls
  }
  await mkdir(CACHE_DIR, {recursive: true});
  await writeFile(CACHE, JSON.stringify(cache), "utf8");
  console.log(`\ncached ${Object.keys(cache).length} cards' rules text`);
}

/* -------------------------------------------------------------- the classify */

const sorted = (list) => (list || []).slice().sort().join("|");
/* THE CREATURE-TYPE VOCABULARY. WANTS and MAKES name a tribe only when it is a real one,
   and "real" here means a tribe some card IN THIS FILE carries: that is the set the page
   passes when it classifies a typed card (graph.facets.tribes), the set the test passes,
   and the only set a join inside the file can land on. The Neo4j bake classifies against
   the format-wide list, which is broader; this pass trims the shipped file to its own
   vocabulary, and tools/graph-amplifiers.mjs --check reporting nothing to change is the
   proof the two agree. The cached type lines are the fallback for a file with no facet. */
const KNOWN_TRIBES = new Set(graph.facets && graph.facets.tribes || []);
if (!KNOWN_TRIBES.size) {
  for (const text of Object.values(cache)) {
    for (const t of Classify.tribesOf(text.type_line)) KNOWN_TRIBES.add(t);
    for (const f of text.card_faces || []) for (const t of Classify.tribesOf(f.type_line)) KNOWN_TRIBES.add(t);
  }
}
console.log(`${KNOWN_TRIBES.size} creature types in the shipped vocabulary`);
let seen = 0, changed = 0, missing = 0, gameChangers = 0;
const brackets = new Map();
const disagree = [];
const totals = Object.fromEntries(FIELDS.map((f) => [f, new Map()]));

for (const card of cards) {
  const text = cache[card.id];
  if (!text) { missing += 1; continue; }
  seen += 1;
  const what = Classify.classify({
    name: text.name, typeLine: text.type_line, oracleText: text.oracle_text,
    keywords: text.keywords, card_faces: text.card_faces
  }, {tribes: KNOWN_TRIBES});
  for (const field of FIELDS) {
    if (sorted(card[field]) !== sorted(what[field])) changed += 1;
    /* Written only when it says something. The export drops empty arrays to keep the
       shipped file small, and re-adding them here would undo that on every run. */
    if (!check) { if (what[field].length) card[field] = what[field]; else delete card[field]; }
    for (const v of what[field]) totals[field].set(v, (totals[field].get(v) || 0) + 1);
  }
  /* GAME CHANGER is Scryfall's own flag, not something rules text can be read for -- it is
     a curated list, and a deck holding one of them is bracket 3 at least. The bake never
     carried it, so the Discover pane could not say what bracket a card commits you to. */
  if (!check) { if (text.game_changer) card.gameChanger = true; else delete card.gameChanger; }
  if (text.game_changer) gameChangers += 1;
  /* THE BRACKET SIGNAL, decided here rather than in the page. The page only ever holds a
     graph row for most cards -- no rules text at all -- so a regex in the browser reported
     "no restriction" for Armageddon and Time Warp, which is the one answer that must never
     be wrong. Read once, from text that is always present, and stored as a word. */
  const body = Classify.rulesText({oracleText: text.oracle_text, card_faces: text.card_faces});
  const bracket = text.game_changer ? "gameChanger"
    : /destroy all lands|destroy all nonbasic lands|each player sacrifices (?:a|an|two|three|\d+) lands?|return all lands to their owners/.test(body) ? "massLand"
    : /takes? an extra turn after this one|takes? two extra turns/.test(body) ? "extraTurns"
    : "";
  if (!check) { if (bracket) card.bracket = bracket; else delete card.bracket; }
  if (bracket) brackets.set(bracket, (brackets.get(bracket) || 0) + 1);
  if (audit && !all) {
    for (const field of OLD_FIELDS) {
      if (sorted(card[field]) !== sorted(what[field])) {
        disagree.push(`${card.name} [${field}]: bake "${sorted(card[field])}", now "${sorted(what[field])}"`);
      }
    }
  }
}

console.log(`${seen} classified, ${missing} without rules text, ${changed} field${changed === 1 ? "" : "s"} ${check ? "would change" : "written"}, ${gameChangers} Game Changers`);
console.log("  bracket signals · " + [...brackets.entries()].map(([k, n]) => `${k} ${n}`).join(", "));
for (const field of FIELDS) {
  const rows = [...totals[field].entries()].sort((a, b) => b[1] - a[1]);
  const carrying = cards.filter((c) => (c[field] || []).length).length;
  console.log(`  ${field.padEnd(10)} ${String(carrying).padStart(5)} cards · ${rows.map(([v, n]) => `${v} ${n}`).join(", ")}`);
}
if (audit) {
  console.log(`\n${disagree.length} old-field disagreements with the current classifier`);
  disagree.slice(0, 25).forEach((line) => console.log(`  ${line}`));
}

if (check) process.exit(0);

/* The Filters pane reads graph.facets for the options it offers, so a field the cards
   carry and the facets do not is a filter nobody can reach. */
for (const field of FIELDS) {
  if (graph.facets[field] !== undefined || NEW_FIELDS.includes(field)) {
    graph.facets[field] = [...totals[field].keys()].sort();
  }
}
graph.amplifiersAt = new Date().toISOString();
await writeFile(GRAPH, JSON.stringify(packed ? Payload.pack(graph) : graph), "utf8");
console.log(`wrote data/graph.json`);
