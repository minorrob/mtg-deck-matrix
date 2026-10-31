#!/usr/bin/env node
/* data/commander-index.json — every commander Start from can offer, with what it matches on (the Decks requirements'
 * STF-4 to STF-9, Q10 to Q14; Rob, 2026-10-23).
 *
 * For each commander-eligible card in data/graph.json: its color identity, its EDHREC rank, the play styles it offers
 * (deck-vocabulary.js: the strategies data/commander-strategies.json already read, under players' names, plus the four
 * archetypes the vocabulary reads off the commander's own terms) and the listed mechanics it carries, and how it takes a
 * second commander. The play-style and mechanic lists are written once at the head; each commander names them by index,
 * so Start from can match 3,000-odd commanders without loading the 16 MB graph.
 *
 *   node tools/build-commander-index.mjs            write the file
 *   node tools/build-commander-index.mjs --check    rebuild in memory and compare
 *
 * Deterministic: commanders by name. Nothing here calls a model. */
import {readFileSync, writeFileSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {createRequire} from "node:module";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const V = require(path.join(ROOT, "deck-vocabulary.js"));
const Payload = require(path.join(ROOT, "graph-payload.js"));
const OUT = path.join(ROOT, "data", "commander-index.json");
const read = (p) => JSON.parse(readFileSync(path.join(ROOT, p), "utf8"));

/* How a commander takes a second one (Q14). The final word on a pair is commander-legality.js, asked with both full
   cards once both are chosen; this only says which commanders to offer. */
export function pairKind(c) {
  const m = c.mechanics || [], t = String(c.type || "");
  if (m.includes("partner with")) return "partner-with";
  if (m.includes("partner")) return "partner";
  if (m.includes("choose a background")) return "chooses-background";
  if (/\bBackground\b/.test(t)) return "background";
  if (/\bTime Lord Doctor\b/.test(t)) return "doctor";
  if (m.includes("doctor's companion")) return "companion";
  return "";
}

export function build() {
  const graph = Payload.unpack(read("data/graph.json")), strategies = read("data/commander-strategies.json");
  const offered = new Map(strategies.commanders.map((c) => [c.name, c.strategies || []]));
  const mechanics = V.mechanics(graph.cards);
  const styles = V.ARCHETYPES.map((a) => ({id: a.id, label: a.label}));
  const sIndex = new Map(styles.map((x, i) => [x.id, i])), mIndex = new Map(mechanics.map((x, i) => [x.id, i]));
  const seen = new Set(), commanders = [];
  for (const c of [...graph.cards].sort((a, b) => a.name.localeCompare(b.name, "en-US"))) {
    if (!c.isCommander || seen.has(c.name)) continue;
    seen.add(c.name);
    const row = {n: c.name, ci: c.ci || "", r: Number.isFinite(c.rank) ? c.rank : null,
      s: V.commanderStyles(c, offered.get(c.name) || []).map((id) => sIndex.get(id)),
      m: V.commanderMechanics(c, mechanics).map((id) => mIndex.get(id))};
    const p = pairKind(c);
    if (p) row.p = p;
    commanders.push(row);
  }
  /* Stamped with the date of the data it is compiled from (the graph's last re-classification, else its bake), not the clock, so
     --check still rebuilds the same text; the registry requires every generated file to carry a stamp. */
  return {schema: "commander-index@1", generator: "tools/build-commander-index.mjs", compiledAt: graph.amplifiersAt || graph.generatedAt,
    source: `data/graph.json (${graph.cards.length} cards) and data/commander-strategies.json, read through deck-vocabulary.js`,
    count: commanders.length, styles, mechanics: mechanics.map(({id, label, cards}) => ({id, label, cards})), commanders};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const doc = build(), text = JSON.stringify(doc) + "\n";
  if (process.argv.includes("--check")) {
    const now = readFileSync(OUT, "utf8");
    if (now !== text) {console.error("commander-index: data/commander-index.json is stale; run node tools/build-commander-index.mjs"); process.exit(1);}
    console.log(`commander-index: ${doc.count} commanders, up to date.`);
  } else {writeFileSync(OUT, text); console.log(`commander-index: wrote ${doc.count} commanders, ${doc.styles.length} play styles, ${doc.mechanics.length} mechanics.`);}
}
