// Every Commander-legal card, registered -- and every legal commander flagged.
//
//   node tools/commander-universe.mjs                   # rebuild data/commander-universe.json
//   node tools/commander-universe.mjs --repair          # also correct data/graph.json and
//                                                       # backfill rarity onto data/master-v2.json
//   node tools/commander-universe.mjs --repair --cache  # reuse graph/.cache instead of refetching
//
// WHY THIS EXISTS, AND WHY IT IS NOT JUST A BIGGER graph.json.
// data/graph.json is the rich corpus: 7,710 cards carrying rules-derived edges,
// EDHREC co-play weights, prices and ownership. At ~920 bytes a card, the whole
// Commander-legal universe in that shape is 29 MB -- a page nobody opens twice on
// a phone at a table. So the universe ships in a second, flat file instead: name,
// color identity, rarity, mana value, primary type, EDHREC rank, and whether the
// card can be a commander. 31,830 cards in 1.6 MB, which the graph page fetches
// only when somebody actually types into the focus box.
//
// The rich corpus stays the thing you explore. The registry is what makes every
// legal card NAMEABLE: type any of them and the graph brings it in as a visitor,
// classified by the same module the corpus was baked with.
//
// WHY THE COMMANDER FLAG COMES FROM SCRYFALL AND NOT FROM A REGEX.
// The bake used `/Legendary/ && /Creature/` against the whole type line, which is
// wrong in both directions and was wrong in both directions in the shipped file:
//
//   - 29 Kamigawa flip cards were flagged as commanders. Their type line reads
//     "Creature - Goblin Warrior // Legendary Creature - Goblin Berserker", so both
//     halves of the test pass on the joined string. The FRONT face is what decides,
//     and it is not legendary, so none of them can be a commander.
//   - 21 planeswalkers that say "can be your commander" were not flagged at all --
//     8 that were in the corpus, and 13 (Lord Windgrace, Aminatou, Estrid,
//     Commodore Guff and the rest) that the "all commanders" scope therefore never
//     pulled in, so they were absent from the graph entirely.
//   - Grist, the Hunger Tide is a legal commander by a rule no type line states.
//
// There is no regex that gets all three right, because commander eligibility is
// not a property of the type line. Scryfall answers `is:commander` authoritatively,
// so that is the source, fetched once and written down.
import {writeFile, readFile, mkdir} from "node:fs/promises";
import {existsSync} from "node:fs";
import {createRequire} from "node:module";
import {gunzipSync} from "node:zlib";

const require = createRequire(import.meta.url);
const Classify = require("../card-classify.js");

const UA = {"User-Agent": "mtg-deck-matrix/1.0 (github.com/minorrob/mtg-deck-matrix)", Accept: "application/json"};
const OUT = "data/commander-universe.json";
const GRAPH = "data/graph.json";
/* 24 MB and 20 paged requests per run. --cache keeps both beside the graph ingest's
   own downloads so re-running after a change to the emit is free and Scryfall is
   asked once. Not the default: a data sync that quietly used a week-old corpus
   would be worse than a slow one. */
const CACHE = process.argv.includes("--cache") ? "graph/.cache" : null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// One letter per rarity. The registry is 31,830 rows long; "uncommon" nine times
// over for every card on the list is 200 KB of the same nine bytes.
const RARITY = {common: "c", uncommon: "u", rare: "r", mythic: "m", special: "s", bonus: "b"};
const LETTER = Object.fromEntries(Object.entries(RARITY).map(([k, v]) => [v, k]));

// The type somebody would name the card by, in the order the rules resolve ties:
// a Land Creature is filed under Land because that is how it is drawn and shopped.
const TYPES = ["Land", "Creature", "Planeswalker", "Battle", "Artifact", "Enchantment", "Instant", "Sorcery"];
const primaryType = (line) => TYPES.find((t) => (line || "").includes(t)) || "Other";

async function getJson(url) {
  const res = await fetch(url, {headers: UA});
  const body = await res.json();
  if (body.object === "error") throw new Error(`${url} -> ${body.details}`);
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return body;
}

/** Every card Scryfall itself will let you put in a command zone. */
async function commanderNames() {
  const cached = CACHE && `${CACHE}/is-commander.json`;
  if (cached && existsSync(cached)) {
    const names = new Set(JSON.parse(await readFile(cached, "utf8")));
    console.log(`  is:commander -> ${names.size} cards (cached)`);
    return names;
  }
  const names = new Set();
  let url = "https://api.scryfall.com/cards/search?unique=cards&order=name&q="
    + encodeURIComponent("is:commander legal:commander");
  let pages = 0;
  while (url) {
    const page = await getJson(url);
    for (const card of page.data) names.add(card.name);
    pages += 1;
    url = page.has_more ? page.next_page : null;
    await sleep(120);            // Scryfall asks for 50-100ms between calls
  }
  console.log(`  is:commander -> ${names.size} cards over ${pages} pages`);
  if (cached) { await mkdir(CACHE, {recursive: true}); await writeFile(cached, JSON.stringify([...names])); }
  return names;
}

async function oracleCards() {
  const cached = CACHE && `${CACHE}/oracle-universe.jsonl`;
  const stamp = CACHE && `${CACHE}/oracle-universe.stamp`;
  if (cached && existsSync(cached) && existsSync(stamp)) {
    const text = await readFile(cached, "utf8");
    const updatedAt = (await readFile(stamp, "utf8")).trim();
    console.log(`  oracle_cards updated ${updatedAt} (cached)`);
    return {updatedAt, rows: text.split("\n").filter(Boolean).map((l) => JSON.parse(l))};
  }
  const list = await getJson("https://api.scryfall.com/bulk-data");
  const entry = list.data.find((d) => d.type === "oracle_cards");
  console.log(`  oracle_cards updated ${entry.updated_at}`);
  const res = await fetch(entry.jsonl_download_uri, {headers: {"User-Agent": UA["User-Agent"]}});
  if (!res.ok) throw new Error(`bulk download -> HTTP ${res.status}`);
  const text = gunzipSync(Buffer.from(await res.arrayBuffer())).toString("utf8");
  if (cached) {
    await mkdir(CACHE, {recursive: true});
    await writeFile(cached, text);
    await writeFile(stamp, entry.updated_at);
  }
  return {updatedAt: entry.updated_at, rows: text.split("\n").filter(Boolean).map((l) => JSON.parse(l))};
}

console.log("fetching Scryfall...");
const [commanders, oracle] = await Promise.all([commanderNames(), oracleCards()]);
const legal = oracle.rows.filter((c) => c.legalities?.commander === "legal");
console.log(`  ${oracle.rows.length} oracle rows -> ${legal.length} commander-legal`);

const cards = legal
  .map((c) => [
    c.name,
    (c.color_identity || []).join(""),
    RARITY[c.rarity] || "?",
    Math.round(Number(c.cmc) || 0),
    primaryType(c.type_line || ""),
    Number(c.edhrec_rank) || 0,
    commanders.has(c.name) ? 1 : 0
  ])
  .sort((a, b) => a[0].localeCompare(b[0]));

const payload = {
  generatedAt: new Date().toISOString(),
  source: `Scryfall oracle_cards ${oracle.updatedAt} + is:commander legal:commander`,
  counts: {cards: cards.length, commanders: cards.filter((c) => c[6]).length},
  rarityLetters: LETTER,
  // Named here so a reader of the file, or of a diff of it, can tell which column
  // is which without opening this tool.
  fields: ["name", "ci", "rarity", "mv", "type", "rank", "commander"],
  cards
};
await mkdir("data", {recursive: true});
await writeFile(OUT, JSON.stringify(payload));
console.log(`wrote ${OUT}  ${payload.counts.cards} cards, ${payload.counts.commanders} commanders, `
  + `${(JSON.stringify(payload).length / 1e6).toFixed(2)} MB`);

/* ------------------------------------------------------------------ repair ----
 * The corpus is baked through Neo4j, which is a workshop rather than something
 * that runs here. So the flag it got wrong is corrected in place against the list
 * above, and the commanders it never pulled in are built from the same oracle rows
 * and classified by card-classify.js -- the module that classified their neighbors.
 * A card added this way has no PLAYED_WITH edges, which is honest: EDHREC co-play
 * was never computed for it, exactly as for a card looked up in the browser.
 */
if (process.argv.includes("--repair")) {
  const graph = JSON.parse(await readFile(GRAPH, "utf8"));
  const byName = new Map(graph.cards.map((c) => [c.name, c]));
  let cleared = 0, set = 0;
  for (const card of graph.cards) {
    const should = commanders.has(card.name);
    if (card.isCommander === should) continue;
    card.isCommander = should;
    if (should) set += 1; else cleared += 1;
  }

  const missing = legal.filter((c) => commanders.has(c.name) && !byName.has(c.name));
  for (const c of missing) {
    const what = Classify.classify(c);
    const faces = c.card_faces || [];
    graph.cards.push({
      id: c.oracle_id,
      name: c.name,
      mv: Number(c.cmc) || 0,
      ci: (c.color_identity || []).join(""),
      type: c.type_line || "",
      rarity: c.rarity || "",
      set: c.set_name || "",
      price: Number(c.prices?.usd) || 0,
      priceFoil: Number(c.prices?.usd_foil) || 0,
      rank: Number(c.edhrec_rank) || 0,
      isLand: /\bLand\b/.test(c.type_line || ""),
      isCommander: true,
      image: c.image_uris?.normal || faces[0]?.image_uris?.normal || "",
      buy: c.purchase_uris?.tcgplayer || "",
      printings: 1,
      cheapestSet: c.set_name || "",
      own: 0, ordered: 0, bench: 0, decks: [],
      roles: what.roles, requires: what.requires, causes: what.causes,
      triggers: what.triggers, produces: what.produces,
      mechanics: what.mechanics, tribes: what.tribes
    });
  }
  graph.cards.sort((a, b) => a.name.localeCompare(b.name));

  // The side pane reads these rather than scanning on load, so a card added above
  // with a mechanic nothing else has would be unfilterable until they are redone.
  const facet = (key) => [...new Set(graph.cards.flatMap((c) => Array.isArray(c[key]) ? c[key] : [c[key]]).filter(Boolean))].sort();
  for (const key of ["roles", "mechanics", "tribes", "causes", "triggers", "produces", "requires", "rarity"]) {
    graph.facets[key] = facet(key);
  }
  graph.counts.cards = graph.cards.length;
  graph.commanderUniverse = {cards: payload.counts.cards, commanders: payload.counts.commanders};
  await writeFile(GRAPH, JSON.stringify(graph));
  console.log(`repaired ${GRAPH}  +${missing.length} commanders added, ${set} flags set, ${cleared} cleared, `
    + `${graph.cards.length} cards`);
  if (missing.length) console.log(`  added: ${missing.map((c) => c.name).join(", ")}`);

  /* RARITY ON THE MASTER, so the buy list can be filtered by it. The workbook this
     app was built from never carried rarity -- it is a build sheet, not a catalog --
     and "show me the rares I still owe" is a question somebody standing at a case
     asks first. Five of the 648 are modal or transforming cards the sheet files
     under their front face, so a miss falls back to the "Front // Back" name. */
  const master = JSON.parse(await readFile("data/master-v2.json", "utf8"));
  const byOracleName = new Map(legal.map((c) => [c.name, c]));
  const byFrontName = new Map();
  for (const c of legal) {
    const front = c.name.split(" // ")[0];
    if (front !== c.name && !byFrontName.has(front)) byFrontName.set(front, c);
  }
  const rarityOf = master.cards.map((card) => {
    const found = byOracleName.get(card.name) || byFrontName.get(card.name);
    return found ? (found.rarity || "") : null;
  });
  const unknown = master.cards.filter((c, i) => rarityOf[i] === null).map((c) => c.name);

  /* Edited as text, not re-serialized. The file was written by Python and carries
     `"mv": 3.0` where JSON.stringify would write `3`. The two parse to the same
     number, so a round trip is a no-op that rewrites 4,370 lines -- a diff nobody
     can review for the 648 lines that actually changed. priceSource is the last key
     of every card, checked here rather than assumed, so the insertion point is
     unambiguous and a file that stops looking like this fails loudly. */
  let text = await readFile("data/master-v2.json", "utf8");
  const marks = [...text.matchAll(/\n(\s*)"priceSource": ("[^"]*")/g)];
  if (marks.length !== master.cards.length) {
    throw new Error(`expected one priceSource per card, found ${marks.length} for ${master.cards.length} cards`);
  }
  if (/"rarity"/.test(text)) {
    console.log("rarity already on data/master-v2.json -- left alone");
  } else {
    let out = "", at = 0, priced = 0;
    marks.forEach((m, i) => {
      const end = m.index + m[0].length;
      out += text.slice(at, end);
      if (rarityOf[i] !== null) { out += `,\n${m[1]}"rarity": ${JSON.stringify(rarityOf[i])}`; priced += 1; }
      at = end;
    });
    out += text.slice(at);
    await writeFile("data/master-v2.json", out);
    console.log(`rarity on data/master-v2.json  ${priced} of ${master.cards.length} cards`
      + (unknown.length ? `  no match: ${unknown.join(", ")}` : ""));
  }
}
