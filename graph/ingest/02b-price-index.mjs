// Builds oracleId -> best available price, across EVERY printing.
//
//   node graph/ingest/02b-price-index.mjs [--cache graph/.cache]
//
// WHY THIS EXISTS. Scryfall's oracle_cards file carries one representative
// printing per card, and that printing is not chosen for having a price. Godless
// Shrine, Hallowed Fountain, Overgrown Tomb and Watery Grave all resolve to a set
// with no TCGPlayer listing at all -- no price, no tcgplayer_id -- so four staple
// shocklands read as free. 1,341 of 31,830 commander-legal cards (4.2%) were
// unpriced for this reason, and they skew toward exactly the cards worth buying.
//
// The fix is the default_cards file, which is every printing. The number that
// matters when you are about to buy one is the CHEAPEST printing you could buy,
// so that is what this takes, along with which set it came from and the
// TCGPlayer link for it.
//
// A NOTE ON THE SOURCE. Scryfall's `usd` IS TCGPlayer market price -- their price
// feed is TCGPlayer's. TCGPlayer's own API needs partner credentials (it answers
// 401 without them), so going through Scryfall is both the same data and the
// polite way to get it in bulk.
import {createReadStream} from "node:fs";
import {createInterface} from "node:readline";
import {writeFile} from "node:fs/promises";

const cacheDir = arg("--cache") || "graph/.cache";
function arg(f) { const i = process.argv.indexOf(f); return i >= 0 ? process.argv[i + 1] : null; }

export async function buildPriceIndex(cacheDir) {
  const file = `${cacheDir}/default_cards.jsonl`;
  const index = new Map();
  const rl = createInterface({input: createReadStream(file), crlfDelay: Infinity});
  let rows = 0;
  for await (const line of rl) {
    const t = line.trim().replace(/,$/, "");
    if (!t || t === "[" || t === "]") continue;
    const c = JSON.parse(t);
    rows++;
    const id = c.oracle_id;
    if (!id) continue;
    const usd = Number(c.prices?.usd) || null;
    const foil = Number(c.prices?.usd_foil) || null;
    let e = index.get(id);
    if (!e) { e = {usd: null, foil: null, set: null, tcg: null, printings: 0, priced: 0}; index.set(id, e); }
    e.printings++;
    if (usd) {
      e.priced++;
      // Cheapest printing wins: it is the one you would actually buy.
      if (e.usd === null || usd < e.usd) {
        e.usd = usd; e.set = c.set_name || c.set || null;
        e.tcg = c.purchase_uris?.tcgplayer || null;
      }
    }
    if (foil && (e.foil === null || foil < e.foil)) e.foil = foil;
    // Keep a link even when nothing is priced, so the card is still shoppable.
    if (!e.tcg && c.purchase_uris?.tcgplayer) e.tcg = c.purchase_uris.tcgplayer;
  }
  return {index, rows};
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const {index, rows} = await buildPriceIndex(cacheDir);
  let priced = 0, linked = 0;
  index.forEach((e) => { if (e.usd) priced++; if (e.tcg) linked++; });
  const out = {};
  index.forEach((e, id) => { out[id] = [e.usd, e.foil, e.set, e.tcg, e.printings]; });
  await writeFile(`${cacheDir}/price-index.json`, JSON.stringify(out));
  console.log(`${rows.toLocaleString()} printings -> ${index.size.toLocaleString()} oracle cards`);
  console.log(`  with a usd price: ${priced.toLocaleString()} (${(100 * priced / index.size).toFixed(1)}%)`);
  console.log(`  with a TCGPlayer link: ${linked.toLocaleString()}`);
}
