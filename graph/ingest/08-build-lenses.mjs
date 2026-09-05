// Builds data/lenses.json -- the copilot layer.
//
//   node graph/ingest/08-build-lenses.mjs
//
// WHAT A LENS IS, AND WHY IT IS SHAPED THIS WAY. The copilot never picks cards
// and never edits a deck. It hands over a FILTER, plus the reason it thinks that
// filter is worth looking at and the evidence behind the reason. Everything it
// produces resolves to the same filter state the side pane already drives, which
// means a lens you disagree with costs one click to ignore and can never quietly
// change anything.
//
// Every lens here is derived from a query, never authored. If a finding stops
// being true -- you finish a deck, you buy the card -- the lens disappears on the
// next build rather than sitting there being wrong.
import {writeFile, mkdir} from "node:fs/promises";
import {dirname} from "node:path";

const outFile = arg("--out") || "data/lenses.json";
const url = (process.env.NEO4J_HTTP || "http://localhost:7474") + "/db/neo4j/tx/commit";
const auth = "Basic " + Buffer.from(`${process.env.NEO4J_USER || "neo4j"}:${process.env.NEO4J_PASS || "mtggraph"}`).toString("base64");
function arg(f) { const i = process.argv.indexOf(f); return i >= 0 ? process.argv[i + 1] : null; }

async function cypher(statement, parameters = {}) {
  const res = await fetch(url, {method: "POST",
    headers: {"Content-Type": "application/json", Authorization: auth, Accept: "application/json"},
    body: JSON.stringify({statements: [{statement, parameters}]})});
  if (!res.ok) throw new Error(`Neo4j HTTP ${res.status}. Is it running? ${url}`);
  const body = await res.json();
  if (body.errors?.length) throw new Error(body.errors.map((e) => e.message).join("; "));
  const r = body.results[0];
  return r.data.map((row) => Object.fromEntries(r.columns.map((c, i) => [c, row.row[i]])));
}

const lenses = [];
const money = (n) => "$" + Number(n || 0).toFixed(2);

// 1. A deck that is short of its own target. The build you are shuffling is not
//    the build that was measured, and that gap is the first thing to close.
for (const row of await cypher(`
MATCH (c:Card)-[a:ASSIGNED_TO]->(d:Deck) WHERE a.target > a.actual
OPTIONAL MATCH (:Collection)-[o:OWNS]->(c)
WITH d, collect({id: c.oracleId, name: c.name, gap: a.target - a.actual,
                 have: coalesce(o.qty,0) + coalesce(o.ordered,0), price: coalesce(c.priceUsd, 0)}) AS rows
RETURN d.name AS deck, rows`)) {
  const rows = row.rows;
  const missing = rows.reduce((n, r) => n + r.gap, 0);
  const onHand = rows.filter((r) => r.have > 0).length;
  const toBuy = rows.filter((r) => r.have <= 0);
  const cost = toBuy.reduce((n, r) => n + r.price * r.gap, 0);
  lenses.push({
    id: `short-${row.deck.toLowerCase()}`,
    kind: missing > 20 ? "warning" : "attention",
    title: `${row.deck} is ${missing} cards short of its own target`,
    why: toBuy.length === 0
      ? `Every one of them is already in hand or on order. Cost to finish: nothing.`
      : `${onHand} of ${rows.length} are already in hand or on order; ${toBuy.length} would need buying, about ${money(cost)}.`,
    evidence: "target vs actual on ASSIGNED_TO, priced from the cheapest printing",
    count: rows.length,
    filter: {ids: rows.map((r) => r.id)}
  });
}

// 2. Cards you own that are doing nothing. Free to use, already paid for.
const idle = await cypher(`
MATCH (:Collection)-[o:OWNS]->(c:Card)
WHERE o.qty > 0 AND NOT EXISTS { (c)-[:ASSIGNED_TO]->(:Deck) }
RETURN c.oracleId AS id, c.name AS name, coalesce(c.priceUsd,0) AS price
ORDER BY price DESC`);
if (idle.length) lenses.push({
  id: "idle-collection",
  kind: "opportunity",
  title: `${idle.length} cards you own are in no deck`,
  why: `Already paid for and doing nothing. Worth about ${money(idle.reduce((n, r) => n + r.price, 0))} at cheapest-printing prices.`,
  evidence: "OWNS with no ASSIGNED_TO",
  count: idle.length,
  filter: {ids: idle.map((r) => r.id)}
});

// 3. What the field plays with your commanders that you do not own, cheaply.
//    Ranked by how many of your commanders want it, so the top of the list is
//    the card that fixes the most decks at once.
const staples = await cypher(`
MATCH (cmd:Card)-[p:PLAYED_WITH]->(c:Card)
WHERE p.inclusion >= 0.5 AND NOT EXISTS { (:Collection)-[:OWNS]->(c) }
  AND c.priceUsd IS NOT NULL AND c.priceUsd <= 5
WITH c, count(DISTINCT cmd) AS wantedBy, max(p.inclusion) AS topIncl
WHERE wantedBy >= 2
RETURN c.oracleId AS id, c.name AS name, wantedBy, topIncl, c.priceUsd AS price
ORDER BY wantedBy DESC, topIncl DESC`);
if (staples.length) lenses.push({
  id: "field-staples",
  kind: "opportunity",
  title: `${staples.length} cards under $5 that two or more of your commanders want`,
  why: `Top of the list: ${staples.slice(0, 3).map((s) => `${s.name} (${s.wantedBy} decks, ${money(s.price)})`).join(", ")}.`,
  evidence: "EDHREC inclusion >= 50% across your 49 commanders, and you own none of them",
  count: staples.length,
  filter: {ids: staples.map((r) => r.id)}
});

// 4. A payoff with nothing to pay it off. A hard REQUIRES that almost nothing in
//    the same deck FILLS is a card you are choosing to draw dead.
for (const row of await cypher(`
MATCH (c:Card)-[a:ASSIGNED_TO]->(d:Deck), (c)-[q:REQUIRES]->(need:Role)
WHERE a.target > 0 AND q.strength = 'hard'
OPTIONAL MATCH (s:Card)-[a2:ASSIGNED_TO]->(d) WHERE a2.target > 0 AND (s)-[:FILLS]->(need)
WITH d, need, collect(DISTINCT c) AS payoffs, count(DISTINCT s) AS enablers
WHERE enablers < 2
RETURN d.name AS deck, need.id AS need, enablers,
       [x IN payoffs | {id: x.oracleId, name: x.name}] AS cards`)) {
  lenses.push({
    id: `unmet-${row.deck.toLowerCase()}-${row.need}`,
    kind: "warning",
    title: `${row.deck}: ${row.cards.length} ${row.need} payoff${row.cards.length > 1 ? "s" : ""}, ${row.enablers} enabler${row.enablers === 1 ? "" : "s"}`,
    why: `${row.cards.map((c) => c.name).join(", ")} need${row.cards.length > 1 ? "" : "s"} ${row.need} and the deck barely supplies it.`,
    evidence: "hard REQUIRES with fewer than two FILLS in the same deck",
    count: row.cards.length,
    filter: {ids: row.cards.map((c) => c.id)}
  });
}

const ORDER = {warning: 0, attention: 1, opportunity: 2};
lenses.sort((a, b) => (ORDER[a.kind] - ORDER[b.kind]) || (b.count - a.count));
await mkdir(dirname(outFile), {recursive: true});
await writeFile(outFile, JSON.stringify({generatedAt: new Date().toISOString(), lenses}, null, 1));
console.log(`${lenses.length} lenses -> ${outFile}`);
lenses.forEach((l) => console.log(`  [${l.kind.padEnd(11)}] ${l.title}`));
