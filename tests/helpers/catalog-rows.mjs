/* The catalog as the browser builds it, for a Node suite.
 *
 * In the app, card-catalog.js merges the universe, the record set (data/cards.json), the facts, the ranks and, on
 * demand, the graph's card block into one list of rows (`C.catalog.all()`), and the Lab hands that list to the draft
 * builder. A Node suite has no browser catalog, so this helper builds the same kind of row from the committed stores:
 * the graph's card block (every Commander-legal card with its price, rank, audited roles and terms, and Rob's own
 * counts), the engine oracle (rules text, cost, type, identity, keywords) and the record set (Game Changer flags,
 * legalities, the catalog's own prices, which win over the bake's as they do in the browser).
 *
 * Graph rows are marked verified and Commander-legal the way card-catalog.js loadGraph marks them: the graph is baked
 * from the legal universe. The banned list is still applied by the legality check afterwards.
 */
import {readFile} from "node:fs/promises";
import {createRequire} from "node:module";

const require = createRequire(import.meta.url);
const CrankCatalog = require("../../card-catalog.js");

let cache = null;

export async function catalogRows() {
  if (cache) return cache;
  const graph = require("../../graph-payload.js").unpack(JSON.parse(await readFile(new URL("../../data/graph.json", import.meta.url), "utf8")));
  const oracle = Object.values(JSON.parse(await readFile(new URL("../../data/engine/oracle.json", import.meta.url), "utf8")).cards);
  const records = JSON.parse(await readFile(new URL("../../data/cards.json", import.meta.url), "utf8")).cards;
  const byName = new Map(oracle.map((c) => [c.name, c]));
  const recordByName = new Map(records.map((c) => [c.name, c]));
  const rows = [];
  const owned = new Map();
  for (const g of graph.cards) {
    const o = byName.get(g.name) || null;
    const r = recordByName.get(g.name) || null;
    const raw = {
      id: g.id, name: g.name,
      typeLine: g.type || (o && o.type) || "",
      oracleText: (o && o.text) || (r && r.oracleText) || "",
      manaCost: (o && o.mana) || (r && r.manaCost) || "",
      manaValue: g.mv,
      colorIdentity: o && Array.isArray(o.ci) ? o.ci : String(g.ci || "").split("").filter(Boolean),
      keywords: (o && o.keywords) || (r && r.keywords) || [],
      power: g.pow ?? (o && o.power) ?? null, toughness: g.tou ?? (o && o.toughness) ?? null,
      rarity: g.rarity, set: g.set, cheapestSet: g.cheapestSet, printings: g.printings, image: g.image, buy: g.buy,
      price: r && Number.isFinite(r.price) && r.price > 0 ? r.price : g.price, priceFoil: g.priceFoil,
      rank: g.rank, isCommander: g.isCommander, commander: g.isCommander,
      roles: g.roles || [], causes: g.causes || [], triggers: g.triggers || [], produces: g.produces || [], tribes: g.tribes || [],
      wants: g.wants || [], mechanics: g.mechanics || [], grants: g.grants || [], extends: g.extends || [], multiplies: g.multiplies || [],
      legalities: (r && r.legalities) || {commander: "legal"}, verified: true,
      gameChanger: !!((r && r.gameChanger) || g.gameChanger),
      layout: o && o.layout, faces: o && o.faces
    };
    /* The graph's tribal and stat terms, which the catalog's normalize does not carry and the Trace's joins read. */
    rows.push({...CrankCatalog.normalize(raw), wants: g.wants || [], makes: g.makes || [], wantsStat: g.wantsStat || [], offersStat: g.offersStat || [], requires: g.requires || []});
    if (g.own > 0) owned.set(rows[rows.length - 1].id, g.own);
  }
  cache = {rows, owned, counts: {graph: graph.cards.length, oracle: oracle.length, records: records.length}};
  return cache;
}
