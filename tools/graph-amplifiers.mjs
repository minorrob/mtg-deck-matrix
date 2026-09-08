// The three directed fields the bake did not carry: multiplies, grants, extends.
//
//   node tools/graph-amplifiers.mjs            # fetch rules text, write data/graph.json
//   node tools/graph-amplifiers.mjs --check    # re-derive and report, change nothing
//   node tools/graph-amplifiers.mjs --audit    # also report where the OLD fields disagree
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
const FIELDS = ["multiplies", "grants", "extends"];
const check = process.argv.includes("--check");
const audit = process.argv.includes("--audit");

const graph = JSON.parse(await readFile(GRAPH, "utf8"));
const cards = graph.cards || [];
console.log(`${cards.length} cards in the bake`);

/* ------------------------------------------------------------ the rules text */

let cache = {};
try { cache = JSON.parse(await readFile(CACHE, "utf8")); } catch { cache = {}; }
const before = Object.keys(cache).length;
if (before) console.log(`${before} cards' rules text already cached`);

const wanted = cards.map((c) => c.id).filter((id) => id && !cache[id]);
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
let seen = 0, changed = 0, missing = 0;
const disagree = [];
const totals = Object.fromEntries(FIELDS.map((f) => [f, new Map()]));

for (const card of cards) {
  const text = cache[card.id];
  if (!text) { missing += 1; continue; }
  seen += 1;
  const what = Classify.classify({
    typeLine: text.type_line, oracleText: text.oracle_text,
    keywords: text.keywords, card_faces: text.card_faces
  });
  for (const field of FIELDS) {
    if (sorted(card[field]) !== sorted(what[field])) changed += 1;
    if (!check) card[field] = what[field];
    for (const v of what[field]) totals[field].set(v, (totals[field].get(v) || 0) + 1);
  }
  if (audit) {
    for (const field of ["roles", "requires", "causes", "triggers", "produces", "mechanics", "tribes"]) {
      if (sorted(card[field]) !== sorted(what[field])) {
        disagree.push(`${card.name} [${field}]: bake "${sorted(card[field])}", now "${sorted(what[field])}"`);
      }
    }
  }
}

console.log(`${seen} classified, ${missing} without rules text, ${changed} field${changed === 1 ? "" : "s"} ${check ? "would change" : "written"}`);
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
  graph.facets[field] = [...totals[field].keys()].sort();
}
graph.amplifiersAt = new Date().toISOString();
await writeFile(GRAPH, JSON.stringify(graph), "utf8");
console.log(`wrote data/graph.json`);
