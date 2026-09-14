/* ONE CARD RECORD, MANY LENSES. data/cards.json is the record set and tools/build-card-records.mjs
 * its one producer; data/card-facts.json and the graph's card block are lenses over it. This
 * suite pins what "derives from" means: the facts table is a projection of the records, the
 * graph's price, body and terms equal the record's for every card the bake knows, every
 * record has one identity and one dated price, a body sits only on a creature, and every
 * name the library and the guides use resolves to a record. The builder's own --check
 * (run by tests/generators.mjs) proves the committed files are what a rebuild would write;
 * this suite proves the rebuild is the right one. */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
import {ROOT} from "../schema/index.mjs";

const require = createRequire(import.meta.url);
const Payload = require(path.join(ROOT, "graph-payload.js"));
const read = (f) => JSON.parse(readFileSync(path.join(ROOT, f), "utf8"));
let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks++; };

const cards = read("data/cards.json"), facts = read("data/card-facts.json").cards, graph = Payload.unpack(read("data/graph.json"));
const records = cards.cards;
const byName = new Map(records.map((r) => [r.name, r]));
for (const r of records) if (r.name.includes(" // ") && !byName.has(r.name.split(" // ")[0])) byName.set(r.name.split(" // ")[0], r);
const TERMS = ["roles", "requires", "causes", "triggers", "produces", "multiplies", "grants", "extends", "mechanics", "tribes", "wants", "makes", "wantsStat", "offersStat"];
const sorted = (a) => JSON.stringify([...(a || [])].sort());

/* Identity: one record per name, one oracle id per record, no two records one oracle id. */
ok(new Set(records.map((r) => r.name)).size === records.length, "one record per name");
ok(records.every((r) => /^[0-9a-f-]{36}$/.test(r.oracleId)), "every record carries an oracle id");
ok(new Set(records.map((r) => r.oracleId)).size === records.length, "no two records share an oracle id");
ok(records.every((r) => r.priceUpdated === "" ? r.price === null : /^\d{4}-\d{2}-\d{2}/.test(r.priceUpdated)), "a price carries its date, and a missing price no date");
ok(records.every((r) => /Creature|Vehicle/.test(r.typeLine) || (r.power === null && r.toughness === null)), "a body sits only on a creature or a vehicle");
const creatures = records.filter((r) => /Creature/.test(r.typeLine));
ok(creatures.every((r) => r.power !== null && r.toughness !== null), `every creature has its printed body (${creatures.length} creatures)`);

/* The facts table is a projection: same facts, same price, same pictures, keyed as the
   archive master names the card. */
let projected = 0;
for (const [name, f] of Object.entries(facts)) {
  const r = byName.get(name);
  ok(r, `facts table names ${name}, which is not a record`);
  for (const k of ["manaCost", "typeLine", "power", "toughness", "loyalty", "oracleText", "rarity", "setName", "setCode", "price"]) assert.deepEqual(f[k] ?? null, r[k] ?? null, `${name}.${k} in the facts table equals the record`);
  assert.deepEqual([f.small, f.normal, f.url], [r.imageSmall, r.image, r.tcgplayerUrl], `${name}: the facts table's pictures and link are the record's`);
  projected += 1;
}
checks += 2;

/* The graph's card block agrees with the record wherever the bake knows the card. */
const graphById = new Map(graph.cards.map((c) => [c.id, c]));
let aligned = 0, priced = 0;
for (const r of records) {
  const g = graphById.get(r.oracleId); if (!g) continue;
  aligned += 1;
  for (const field of TERMS) assert.equal(sorted(g[field]), sorted(r[field]), `${r.name}.${field}: the graph's terms equal the record's`);
  if (g.price != null) { priced += 1; assert.equal(g.price, r.price, `${r.name}: one price in the graph and the record`); }
  if (r.power !== null) assert.equal(String(g.pow), String(r.power), `${r.name}: the graph's power is the record's`);
}
ok(aligned > records.length * 0.95, `the bake knows nearly every record (${aligned} of ${records.length})`);
ok(priced > aligned * 0.9, `the bake prices nearly every record it knows (${priced} of ${aligned})`);
checks += 2;

/* Every name the library and the guides use resolves to a record. */
const live = read("data/live-load.json");
const named = new Set();
for (const d of live.decks) { named.add(d.commander); for (const c of Array.isArray(d.cards) ? d.cards : Object.keys(d.cards)) named.add(typeof c === "string" ? c : c.name); }
for (const g of read("data/deck-guides.json").decks) named.add(g.commander);
const strays = [...named].filter((n) => n && !byName.get(n));
ok(strays.length === 0, `every deck and guide name resolves to a record (missing: ${strays.slice(0, 5).join(", ")})`);

console.log(`card-records: ${checks} checks passed — ${records.length} records, ${projected} projected into the facts table, ${aligned} aligned with the graph (${priced} priced), ${named.size} library and guide names resolved.`);
