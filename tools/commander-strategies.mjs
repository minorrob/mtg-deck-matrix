#!/usr/bin/env node
/* data/commander-strategies.json — the strategies each legal commander offers, derived once.
 *
 * T0 of docs/crankmagic-strategy-trace-plan.md. For every commander in data/graph.json the
 * vocabulary (crankmagic-strategies.js) is asked what the commander's own classified terms
 * offer; the six live decks' definitions (data/live-load.json, `definition.mechanics`) and the
 * hand-checked guides (data/deck-guides.json, `archetype`) add what a person named. A
 * commander with nothing offered is left out, so the file says "no strategy read" by absence.
 *
 *   node tools/commander-strategies.mjs            write the file
 *   node tools/commander-strategies.mjs --check    rebuild in memory and compare, stamp aside
 *
 * Deterministic: commanders by name, strategies in the vocabulary's order. */
import {readFileSync, writeFileSync, existsSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {createRequire} from "node:module";
import {stamp} from "./lib/envelope.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const S = require(path.join(ROOT, "crankmagic-strategies.js"));
const Payload = require(path.join(ROOT, "graph-payload.js"));
const OUT = path.join(ROOT, "data", "commander-strategies.json");
const check = process.argv.includes("--check");
const read = (p) => JSON.parse(readFileSync(path.join(ROOT, p), "utf8"));
const fold = (s) => String(s || "").toLowerCase().replace(/[’']/g, "'").trim();

const graph = Payload.unpack(read("data/graph.json"));
const named = new Map();   // folded commander name -> {strategies: Set, from: Set}
const add = (name, ids, from) => {
  if (!name || !ids.length) return;
  const cur = named.get(fold(name)) || {strategies: new Set(), from: new Set()};
  for (const id of ids) cur.strategies.add(id);
  cur.from.add(from);
  named.set(fold(name), cur);
};
if (existsSync(path.join(ROOT, "data/live-load.json"))) for (const d of read("data/live-load.json").decks || []) add(d.commander, S.fromMechanics(d.definition && d.definition.mechanics), "deck definition");
if (existsSync(path.join(ROOT, "data/deck-guides.json"))) for (const g of read("data/deck-guides.json").decks || []) add(g.commander, S.fromWords([g.archetype, g.hook].join(" ")), "guide");

const order = S.ids();
const rows = [];
for (const c of graph.cards) {
  if (!c.isCommander) continue;
  const derived = S.derive(c);
  const person = named.get(fold(c.name));
  const all = order.filter((id) => derived.includes(id) || (person && person.strategies.has(id)));
  if (!all.length) continue;
  const row = {id: c.id, name: c.name, strategies: all, derived};
  if (person) row.named = {strategies: order.filter((id) => person.strategies.has(id)), from: [...person.from].sort()};
  rows.push(row);
}
rows.sort((a, b) => a.name.localeCompare(b.name));
const perStrategy = Object.fromEntries(order.map((id) => [id, rows.filter((r) => r.strategies.includes(id)).length]));
const body = stamp("commander-strategies@1", "tools/commander-strategies.mjs", {
  source: "data/graph.json (classified terms), data/live-load.json (definition.mechanics), data/deck-guides.json (archetype)",
  vocabulary: S.STRATEGIES.map((s) => ({id: s.id, label: s.label, why: s.why})),
  perStrategy, commanders: rows
}, {count: rows.length});

const strip = (o) => JSON.stringify({...o, generatedAt: null});
if (check) {
  if (!existsSync(OUT)) { console.error("commander-strategies: data/commander-strategies.json is missing; run the tool"); process.exit(1); }
  if (strip(JSON.parse(readFileSync(OUT, "utf8"))) !== strip(body)) { console.error("commander-strategies: data/commander-strategies.json has drifted from the graph and the vocabulary; run the tool and commit"); process.exit(1); }
  console.log(`commander-strategies: ${rows.length} commanders with a strategy — matches the file`);
} else {
  writeFileSync(OUT, JSON.stringify(body, null, 1) + "\n");
  console.log(`wrote data/commander-strategies.json: ${rows.length} of ${graph.cards.filter((c) => c.isCommander).length} commanders carry a strategy; ${Object.entries(perStrategy).map(([k, v]) => `${k} ${v}`).join(", ")}`);
}
