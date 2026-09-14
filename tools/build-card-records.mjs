/* THE CARD RECORD'S ONE PRODUCER.
 *
 * data/cards.json is the Card record set: every card the library, the six decks, the ladders,
 * the guides and the pop-ups name -- identity (oracleId, name), the printed facts (type line,
 * rules text, cost, colours, keywords, power and toughness, rarity, legalities), the printing
 * the app shows (set, images, the TCGplayer link), one price with its date, the graph's rank
 * and commander flag, and the classifier's terms (roles, causes, triggers, produces, …)
 * derived here, once, with the same card-classify.js call the graph bake makes. Two lens
 * files derive from it and are written by this tool alone:
 *
 *   data/card-facts.json      the name-keyed facts table the simulator, the guides, the
 *                             measurer and the picture pop-ups read (the names the archive
 *                             master and its decks use);
 *   data/graph.json           the card block's price, body and terms for every record the
 *                             bake knows, so the graph never disagrees with the record.
 *
 * Before this tool the two files were written by four others (build_card_facts.py,
 * add-power-toughness.mjs, hydrate_new_ladder_cards.mjs, audit-cards.mjs) and 106 facts
 * entries named cards the catalog had never taken in; the graph carried a newer price than
 * the catalog for 1,656 cards. Critical 1 of docs/data-model-evaluation-2026-09.md.
 *
 *   node tools/build-card-records.mjs                 rebuild the record set and its two lenses
 *   node tools/build-card-records.mjs --check         rebuild in memory, compare, write nothing
 *   node tools/build-card-records.mjs --add "Name" …  fetch cards from Scryfall (curl) into the
 *                                                     record set, then rebuild
 *   node tools/build-card-records.mjs --refresh       re-read every record from Scryfall: prices,
 *                                                     legality, text, images; a card whose lookup
 *                                                     fails keeps every value it had
 *
 * Sources, all committed: the record set itself (the previous run's output, so the tool is
 * idempotent), the graph's card block (oracle id, rank, foil price, cheapest set, printing
 * count, commander flag, and the bake's price snapshot dated by the graph's stamp), and --
 * on the first run only -- the old facts file for the cards it alone carried. The record's
 * own dated price is the price; the graph's card block takes it. */
import {readFileSync, writeFileSync, existsSync} from "node:fs";
import {execFileSync} from "node:child_process";
import path from "node:path";
import {createRequire} from "node:module";
import {stamp} from "./lib/envelope.mjs";
import {ROOT, report, readData} from "../schema/index.mjs";

const require = createRequire(import.meta.url);
const Classify = require(path.join(ROOT, "card-classify.js"));
const Payload = require(path.join(ROOT, "graph-payload.js"));

const CARDS = "data/cards.json", FACTS = "data/card-facts.json", GRAPH = "data/graph.json", MASTER = "data/archive/master-v2.json";
const args = process.argv.slice(2);
const check = args.includes("--check");
const addAt = args.indexOf("--add");
const refresh = args.includes("--refresh");
const toAdd = addAt >= 0 ? args.slice(addAt + 1).filter((a) => !a.startsWith("--")) : [];

const TERMS = ["roles", "requires", "causes", "triggers", "produces", "multiplies", "grants", "extends", "mechanics", "tribes", "wants", "makes", "wantsStat", "offersStat"];
const FACT_FIELDS = ["manaCost", "typeLine", "power", "toughness", "oracleText", "keywords", "colorIdentity", "rarity", "setName", "setCode"];
const day = (iso) => String(iso || "").slice(0, 10);
const sorted = (a) => JSON.stringify([...(a || [])].sort());

/* ------------------------------------------------------------ the sources */
const prior = readData(CARDS);
const priorFacts = existsSync(path.join(ROOT, FACTS)) ? readData(FACTS) : {cards: {}};
const rawGraph = readData(GRAPH);
const graph = Payload.unpack(JSON.parse(JSON.stringify(rawGraph)));
const graphByName = new Map(graph.cards.map((c) => [c.name, c]));
for (const c of graph.cards) if (c.name.includes(" // ") && !graphByName.has(c.name.split(" // ")[0])) graphByName.set(c.name.split(" // ")[0], c);
const bakeDay = day(graph.generatedAt);
const tribes = new Set(graph.facets && graph.facets.tribes || []);

/* --add: Scryfall's collection endpoint through curl (the proxy this repo's tools use). */
function fetchRecords(names) {
  const out = [];
  for (let i = 0; i < names.length; i += 75) {
    const body = JSON.stringify({identifiers: names.slice(i, i + 75).map((name) => ({name: name.split(" // ")[0]}))});
    const text = execFileSync("curl", ["-sS", "--fail", "--max-time", "60", "-H", "Content-Type: application/json", "-d", body, "https://api.scryfall.com/cards/collection"], {encoding: "utf8", maxBuffer: 64 * 1024 * 1024});
    const data = JSON.parse(text);
    for (const card of data.data || []) out.push(fromScryfall(card));
    for (const miss of data.not_found || []) console.warn(`  Scryfall does not know ${miss.name}`);
    if (i + 75 < names.length) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 120);   // Scryfall asks for 50-100 ms between calls
  }
  return out;
}
function fromScryfall(card) {
  const faces = card.card_faces || [];
  const img = card.image_uris || (faces[0] && faces[0].image_uris) || {};
  return {
    name: card.name, oracleId: card.oracle_id || "",
    manaCost: card.mana_cost || faces.map((f) => f.mana_cost).filter(Boolean).join(" // ") || "",
    typeLine: card.type_line || "", power: card.power ?? (faces[0] && faces[0].power) ?? null, toughness: card.toughness ?? (faces[0] && faces[0].toughness) ?? null,
    oracleText: card.oracle_text || faces.map((f) => f.oracle_text).filter(Boolean).join("\n//\n") || "",
    keywords: card.keywords || [], colorIdentity: card.color_identity || [], legalities: card.legalities || {}, rarity: card.rarity || "",
    setName: card.set_name || "", setCode: card.set || "", image: img.normal || "", imageSmall: img.small || "",
    price: Number(card.prices && (card.prices.usd || card.prices.usd_foil)) || null, priceUpdated: day(new Date().toISOString()),
    tcgplayerUrl: (card.purchase_uris && card.purchase_uris.tcgplayer) || `https://www.tcgplayer.com/search/magic/product?q=${encodeURIComponent(card.name)}&view=grid`,
    scryfallUrl: card.scryfall_uri || "",
  };
}

/* ------------------------------------------------------------ the record set */
const byName = new Map();
for (const c of prior.cards) byName.set(c.name, {...c});
/* The facts file's own cards, the first time through: after that they are records. */
let adopted = 0;
for (const [name, f] of Object.entries(priorFacts.cards || {})) {
  if (byName.has(name)) continue;
  const g = graphByName.get(name);
  if (g && g.name !== name && byName.has(g.name)) continue;            // a front face of a record we hold
  byName.set(name, {name, manaCost: f.manaCost || "", typeLine: f.typeLine || "", power: f.power ?? null, toughness: f.toughness ?? null, oracleText: f.oracleText || "",
    keywords: f.keywords || [], colorIdentity: f.colorIdentity || [], legalities: {commander: "legal"}, rarity: f.rarity || "", setName: f.setName || "", setCode: f.setCode || "",
    ...(f.loyalty != null ? {loyalty: f.loyalty} : {}),
    image: f.normal || "", imageSmall: f.small || "", price: f.price ?? null, priceUpdated: f.price != null ? day(priorFacts.generatedAt) : "", tcgplayerUrl: f.url || ""});
  adopted += 1;
}
const wanted = refresh ? [...byName.keys()].concat(toAdd.filter((n) => !byName.has(n))) : toAdd;
const fetched = wanted.length ? fetchRecords(wanted) : [];
if (refresh) console.log(`refreshed ${fetched.length} of ${wanted.length} records from Scryfall`);
for (const r of fetched) byName.set(r.name, {...(byName.get(r.name) || {}), ...r});
const missing = wanted.filter((n) => !fetched.some((r) => r.name === n || r.name.split(" // ")[0] === n));

const records = [...byName.values()].sort((a, b) => a.name.localeCompare(b.name)).map((c) => {
  const g = graphByName.get(c.name);
  const r = {
    name: c.name, oracleId: c.oracleId || (g ? g.id : ""),
    manaCost: c.manaCost || "", typeLine: c.typeLine || "",
    power: /Creature|Vehicle/.test(c.typeLine || "") ? (c.power ?? (g && g.pow) ?? null) : null, toughness: /Creature|Vehicle/.test(c.typeLine || "") ? (c.toughness ?? (g && g.tou) ?? null) : null,
    oracleText: c.oracleText || "", keywords: c.keywords || [], colorIdentity: c.colorIdentity || (g ? String(g.ci || "").split("").filter(Boolean) : []),
    legalities: c.legalities || {commander: "legal"}, rarity: c.rarity || (g && g.rarity) || "",
    setName: c.setName || "", setCode: c.setCode || "", image: c.image || "", imageSmall: c.imageSmall || (c.image ? c.image.replace("/normal/", "/small/") : ""),
    tcgplayerUrl: c.tcgplayerUrl || "", ...(c.scryfallUrl ? {scryfallUrl: c.scryfallUrl} : {}),
    price: c.price ?? null, priceUpdated: c.price != null ? (c.priceUpdated || bakeDay) : "", priceFoil: c.priceFoil ?? null, cheapestSet: c.cheapestSet || "",
    rank: g && Number.isFinite(g.rank) ? g.rank : (c.rank ?? null), isCommander: g ? Boolean(g.isCommander) : Boolean(c.isCommander), printings: g && g.printings ? g.printings : (c.printings ?? null),
    ...(c.loyalty != null ? {loyalty: c.loyalty} : {}),
    ...(c.gameChanger || (g && g.gameChanger) ? {gameChanger: true} : {}),
    ...(c.flavorName ? {flavorName: c.flavorName} : {}),
  };
  /* ONE PRICE: THE RECORD'S OWN, DATED. The catalog's snapshot is the one every published
     total was computed from, so the record keeps it and the graph's card block takes it (the
     bake's price fills in only where the record has none); --refresh is how a price moves.
     Foil price and cheapest set are the bake's reading and ride along. */
  if (r.price == null && g && g.price != null) { r.price = g.price; r.priceUpdated = bakeDay; }
  if (g) { if (g.priceFoil != null) r.priceFoil = g.priceFoil; if (g.cheapestSet) r.cheapestSet = g.cheapestSet; }
  const what = Classify.classify({name: r.name, typeLine: r.typeLine, oracleText: r.oracleText, keywords: r.keywords, card_faces: [], power: r.power, toughness: r.toughness}, {tribes});
  for (const field of TERMS) if (what[field] && what[field].length) r[field] = what[field];
  return r;
});

/* ------------------------------------------------------------ the lenses */
/* The facts table covers the names the archive master and its decks use, wherever they sit
   in that file -- the set tools/build_card_facts.py served before this tool replaced it. */
const recordByName = new Map(records.map((r) => [r.name, r]));
for (const r of records) if (r.name.includes(" // ") && !recordByName.has(r.name.split(" // ")[0])) recordByName.set(r.name.split(" // ")[0], r);
const masterNames = new Set();
(function walk(v) { if (typeof v === "string") { if (recordByName.has(v)) masterNames.add(v); } else if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === "object") Object.values(v).forEach(walk); })(readData(MASTER));
const facts = {};
for (const name of [...masterNames].sort((a, b) => a.localeCompare(b))) {
  const r = recordByName.get(name);
  const f = {}; for (const k of FACT_FIELDS) if (!(k === "power" || k === "toughness") || r[k] != null) f[k] = r[k];   // a figure a card does not print is absent, as the engine has always read it
  if (r.loyalty != null) f.loyalty = r.loyalty;
  f.small = r.imageSmall; f.normal = r.image; f.price = r.price; f.url = r.tcgplayerUrl;
  facts[name] = f;                                   // keyed as the master names it: a front face stays a front face
}

/* The graph's card block: the record's price, body and terms where the bake knows the card. */
let graphChanged = 0;
const graphById = new Map(graph.cards.map((c) => [c.id, c]));
for (const r of records) {
  const g = graphById.get(r.oracleId); if (!g) continue;
  const before = JSON.stringify(g);
  if (r.price != null) g.price = r.price;
  if (r.power != null && r.power !== "") g.pow = String(r.power); if (r.toughness != null && r.toughness !== "") g.tou = String(r.toughness);
  for (const field of TERMS) { if (r[field] && r[field].length) g[field] = r[field]; else delete g[field]; }
  if (JSON.stringify(g) !== before) graphChanged += 1;
}

const cardsOut = stamp("cards@2", "tools/build-card-records.mjs", {source: `Scryfall, through this tool and the graph bake's price snapshot of ${bakeDay}`, cards: records, missing}, {count: records.length});
const factsOut = stamp("card-facts@1", "tools/build-card-records.mjs", {cards: facts}, {count: Object.keys(facts).length});
const graphOut = graphChanged ? (() => { const parts = Payload.split(Payload.pack(graph)); return stamp("graph@2", rawGraph.generator || "tools/graph-amplifiers.mjs", {...parts.graph, generatedAt: rawGraph.generatedAt}, {count: parts.graph.cards.length}); })() : null;

/* ------------------------------------------------------------ compare or write */
const strip = (o) => JSON.stringify({...o, generatedAt: null});
const same = (a, b) => strip(a) === strip(b);
const diffs = [];
if (!same(cardsOut, prior)) diffs.push(`${CARDS} (${adopted} adopted from the facts file, ${records.length} records)`);
if (!same(factsOut, priorFacts)) diffs.push(`${FACTS} (${Object.keys(facts).length} names; committed ${Object.keys(priorFacts.cards || {}).length})`);
if (graphChanged) diffs.push(`${GRAPH} (${graphChanged} cards' price, body or terms)`);

const noId = records.filter((r) => !r.oracleId).length, noText = records.filter((r) => !r.oracleText && !/Land/.test(r.typeLine)).length;
console.log(`card records: ${records.length} (${adopted} adopted from the facts file, ${fetched.length} fetched); ${Object.keys(facts).length} in the facts table; ${noId} without an oracle id, ${noText} nonland without rules text; ${graphChanged} graph cards to align.`);
if (missing.length) console.warn(`  not found on Scryfall: ${missing.join(", ")}`);

if (check) {
  let ok = report(CARDS, prior) & report(FACTS, priorFacts);
  if (diffs.length) { console.error(`card records: the committed files differ from a rebuild — ${diffs.join("; ")}. Run node tools/build-card-records.mjs.`); ok = 0; }
  process.exit(ok ? 0 : 1);
}
writeFileSync(path.join(ROOT, CARDS), JSON.stringify(cardsOut, null, 1) + "\n");
writeFileSync(path.join(ROOT, FACTS), JSON.stringify(factsOut) + "\n");
if (graphOut) writeFileSync(path.join(ROOT, GRAPH), JSON.stringify(graphOut));
console.log(`wrote ${CARDS}, ${FACTS}${graphOut ? `, ${GRAPH}` : ""}.`);
