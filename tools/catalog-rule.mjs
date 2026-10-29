// THE CATALOG RULE (Rob, 2026-10-29, Linear ROB-213): Commander-legal paper cards only.
//
//   CrankMagic uses the Magic cards that are legal in Commander and have been printed on paper. Arena Alchemy cards
//   (seek, conjure, spellbooks), their A- rebalanced versions, and cards that exist only on MTGO or Arena stay out.
//
// A card is in the catalog when ALL of these hold, and `catalogProblem` names the first that does not:
//
//   1. Scryfall says Commander legality is "legal" (banned, restricted and not_legal are out; a missing field is out).
//   2. Its name does not begin "A-" (Arena's rebalanced Alchemy cards; Scryfall marks them not_legal today, and the name
//      test keeps them out if that ever changes).
//   3. It has at least one PAPER printing. This is not the `digital` flag on an oracle_cards row: that row describes the
//      one printing Scryfall chose to stand for the card, and 1,046 real paper cards (Palinchron, Wyluli Wolf, ...) are
//      represented by an MTGO printing. Only Scryfall's own search, `legal:commander game:paper`, answers "any paper
//      printing", so the loaders ask it (`paperOracleIds`) and pass the set in.
//
//   node tools/catalog-rule.mjs            print what the rule refuses of Scryfall's current oracle_cards (needs network)
//
// Used by tools/commander-universe.mjs and tools/build-engine-cards.mjs. tests/catalog-rule.mjs holds the rule and the
// committed catalogs to it.
import {existsSync, readFileSync, writeFileSync, mkdirSync} from "node:fs";
import {join} from "node:path";

export const PAPER_QUERY = "legal:commander game:paper";
const UA = {"User-Agent": "CrankMagic/1.0 (catalog rule; minorrob/mtg-deck-matrix)", Accept: "application/json"};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Why a Scryfall oracle card is not in the catalog, or null when it is. `paperIds` is `paperOracleIds()`'s set. */
export function catalogProblem(card, paperIds) {
  if (card?.legalities?.commander !== "legal") return "not Commander-legal";
  if (/^A-/.test(card.name || "")) return "an Arena rebalanced (A-) card";
  if (!(paperIds instanceof Set)) throw new Error("catalogProblem needs the set of oracle ids with a paper printing (paperOracleIds)");
  if (!paperIds.has(card.oracle_id)) return "no paper printing";
  return null;
}

/** The oracle ids of every Commander-legal card with a paper printing, from Scryfall's search (about 185 pages, 200 ms apart).
    `cacheDir` keeps the answer between runs, as the loaders keep the bulk file (graph/.cache is gitignored). */
export async function paperOracleIds({cacheDir = null, log = console.log} = {}) {
  const cached = cacheDir && join(cacheDir, "paper-commander-ids.json");
  if (cached && existsSync(cached)) {
    const ids = new Set(JSON.parse(readFileSync(cached, "utf8")));
    log(`  ${PAPER_QUERY} -> ${ids.size} cards (cached)`);
    return ids;
  }
  const ids = new Set();
  let url = `https://api.scryfall.com/cards/search?unique=cards&order=name&include_extras=true&q=${encodeURIComponent(PAPER_QUERY)}`, pages = 0;
  for (let tries = 0; url;) {
    const res = await fetch(url, {headers: UA});
    /* Scryfall's own rule: when it says wait, wait, and ask more slowly after. A fourth refusal in a row is given up on. */
    if (res.status === 429 && tries < 3) { tries += 1; log(`  rate-limited; waiting ${60 * tries} s`); await sleep(60000 * tries); continue; }
    tries = 0;
    const page = await res.json();
    if (page.object === "error") throw new Error(`${url} -> ${page.details}`);
    if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
    for (const card of page.data) ids.add(card.oracle_id);
    pages += 1;
    url = page.has_more ? page.next_page : null;
    if (url) await sleep(200);
  }
  log(`  ${PAPER_QUERY} -> ${ids.size} cards over ${pages} pages`);
  if (cached) { mkdirSync(cacheDir, {recursive: true}); writeFileSync(cached, JSON.stringify([...ids])); }
  return ids;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const {gunzipSync} = await import("node:zlib");
  const list = await (await fetch("https://api.scryfall.com/bulk-data", {headers: UA})).json();
  const entry = list.data.find((d) => d.type === "oracle_cards");
  const bulk = gunzipSync(Buffer.from(await (await fetch(entry.jsonl_download_uri, {headers: {"User-Agent": UA["User-Agent"]}})).arrayBuffer())).toString("utf8");
  const rows = bulk.split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const paper = await paperOracleIds();
  const refused = {};
  for (const card of rows) {
    const why = catalogProblem(card, paper);
    if (why && why !== "not Commander-legal") (refused[why] ??= []).push(card.name);
  }
  console.log(`oracle_cards ${entry.updated_at}: ${rows.length} rows, ${rows.filter((c) => !catalogProblem(c, paper)).length} in the catalog`);
  for (const [why, names] of Object.entries(refused)) console.log(`  Commander-legal but ${why}: ${names.length} ${JSON.stringify(names.slice(0, 10))}`);
}
