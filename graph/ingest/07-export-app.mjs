// Exports a slice of the graph as one JSON file the static app can load.
//
//   node graph/ingest/07-export-app.mjs                 # your working set (~1.6k cards)
//   node graph/ingest/07-export-app.mjs --commanders    # + every legendary creature
//   node graph/ingest/07-export-app.mjs --out data/graph.json
//
// WHY AN EXPORT AND NOT A LIVE CONNECTION. The app is a static site with no
// backend, which is what lets it work at a table with no wifi. Neo4j is the
// workshop; this is the part that ships. 31,830 cards with every edge is far too
// much to hold in a browser, so the default scope is what you can actually build
// with: cards you own, cards your decks name, and cards EDHREC links to your
// commanders.
//
// Edges to Event/Resource/Role/Mechanic/Tribe are flattened onto the card as
// arrays. They are single-hop and high-fanout, so separate node records would
// cost more than they explain. PLAYED_WITH stays a real edge list because it
// carries weights and is what the graph view draws.
import {writeFile, mkdir} from "node:fs/promises";
import {dirname} from "node:path";

const outFile = arg("--out") || "data/graph.json";
const url = (process.env.NEO4J_HTTP || "http://localhost:7474") + "/db/neo4j/tx/commit";
const auth = "Basic " + Buffer.from(`${process.env.NEO4J_USER || "neo4j"}:${process.env.NEO4J_PASS || "mtggraph"}`).toString("base64");
function arg(f) { const i = process.argv.indexOf(f); return i >= 0 ? process.argv[i + 1] : null; }

async function cypher(statement, parameters = {}) {
  const res = await fetch(url, {
    method: "POST",
    headers: {"Content-Type": "application/json", Authorization: auth, Accept: "application/json"},
    body: JSON.stringify({statements: [{statement, parameters}]})
  });
  if (!res.ok) throw new Error(`Neo4j HTTP ${res.status}. Is it running? ${url}`);
  const body = await res.json();
  if (body.errors?.length) throw new Error(body.errors.map((e) => e.message).join("; "));
  const result = body.results[0];
  return result.data.map((row) => Object.fromEntries(result.columns.map((c, i) => [c, row.row[i]])));
}

const scope = process.argv.includes("--commanders")
  ? `EXISTS { (:Collection)-[:OWNS]->(c) } OR EXISTS { (c)-[:ASSIGNED_TO]->(:Deck) }
     OR EXISTS { (:Card)-[:PLAYED_WITH]->(c) } OR c.canBeCommander`
  : `EXISTS { (:Collection)-[:OWNS]->(c) } OR EXISTS { (c)-[:ASSIGNED_TO]->(:Deck) }
     OR EXISTS { (:Card)-[:PLAYED_WITH]->(c) }`;

console.log("querying cards...");
const cards = await cypher(`
MATCH (c:Card) WHERE ${scope}
OPTIONAL MATCH (col:Collection)-[o:OWNS]->(c)
RETURN c.oracleId AS id, c.name AS name, c.manaValue AS mv, c.colorIdentity AS ci,
       c.typeLine AS type, c.rarity AS rarity, c.setName AS set, c.priceUsd AS price,
       c.priceFoil AS priceFoil, c.edhrecRank AS rank, c.isLand AS isLand,
       c.canBeCommander AS isCommander, c.image AS image,
       coalesce(o.qty,0) AS own, coalesce(o.ordered,0) AS ordered, coalesce(o.bench,0) AS bench,
       [(c)-[:FILLS]->(r:Role) | r.id]            AS roles,
       [(c)-[:REQUIRES]->(r:Role) | r.id]         AS requires,
       [(c)-[:CAUSES]->(e:Event) | e.id]          AS causes,
       [(c)-[:TRIGGERS_ON]->(e:Event) | e.id]     AS triggers,
       [(c)-[:PRODUCES]->(r:Resource) | r.id]     AS produces,
       [(c)-[:HAS_MECHANIC]->(m:Mechanic) | m.id] AS mechanics,
       [(c)-[:IS_TRIBE]->(t:Tribe) | t.id]        AS tribes,
       [(c)-[a:ASSIGNED_TO]->(d:Deck) | {deck: d.name, target: a.target, actual: a.actual}] AS decks
ORDER BY c.name`);

console.log(`  ${cards.length.toLocaleString()} cards`);
const known = new Set(cards.map((c) => c.id));

const played = (await cypher(`
MATCH (a:Card)-[p:PLAYED_WITH]->(b:Card)
RETURN a.oracleId AS from, b.oracleId AS to, p.inclusion AS inclusion,
       p.synergy AS synergy, p.numDecks AS decks`))
  .filter((e) => known.has(e.from) && known.has(e.to));
console.log(`  ${played.length.toLocaleString()} PLAYED_WITH edges`);

const decks = await cypher(`MATCH (d:Deck) RETURN d.id AS id, d.name AS name ORDER BY d.id`);

// Facet values, computed here so the side pane does not have to scan on load.
const facet = (key) => [...new Set(cards.flatMap((c) => Array.isArray(c[key]) ? c[key] : [c[key]]).filter(Boolean))].sort();
const payload = {
  generatedAt: new Date().toISOString(),
  scope: process.argv.includes("--commanders") ? "collection + edhrec + all commanders" : "collection + edhrec",
  counts: {cards: cards.length, playedWith: played.length},
  facets: {
    roles: facet("roles"), mechanics: facet("mechanics"), tribes: facet("tribes"),
    causes: facet("causes"), triggers: facet("triggers"), produces: facet("produces"),
    requires: facet("requires"), rarity: facet("rarity"),
    colors: ["W", "U", "B", "R", "G", "C"],
    decks: decks.map((d) => d.name)
  },
  decks, cards, played
};
await mkdir(dirname(outFile), {recursive: true});
await writeFile(outFile, JSON.stringify(payload));
const mb = (JSON.stringify(payload).length / 1e6).toFixed(2);
console.log(`wrote ${outFile}  (${mb} MB)`);
