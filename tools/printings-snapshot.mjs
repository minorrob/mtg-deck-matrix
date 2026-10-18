// A dated snapshot of every printing's US-dollar price for a list of cards, from Scryfall.
//
//   node tools/printings-snapshot.mjs --out tests/fixtures/printings-snapshot.json "Sol Ring" "Arcane Signet" …
//   node tools/printings-snapshot.mjs --out <file> --names <a text file, one name per line>
//
// WHY (Linear ROB-119). buy-plan.js chooses a printing and a vendor for every card a reader needs, by the reader's
// priorities. It is pure: it reads a snapshot like this one, never the network, so a plan is reproducible from the
// file's generatedAt. The app takes the same shape from scryfall-client.js's prints search at the moment the Shop is
// opened; the suite takes this committed file. USD only (AGENTS.md: the United States, always); Scryfall's `usd` is
// TCGplayer's market price, and the vendor table (data/vendors.json) says what the others are assumed to charge.
//
// curl, not fetch(): the same host-allowlist note graph/ingest/01-fetch.mjs carries.
import {readFile, writeFile} from "node:fs/promises";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {stamp} from "./lib/envelope.mjs";

const run = promisify(execFile);
const args = process.argv.slice(2);
const at = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null; };
const out = at("--out");
if (!out) { console.error("usage: node tools/printings-snapshot.mjs --out <file> [--names <file>] [name ...]"); process.exit(2); }
const names = [];
if (at("--names")) names.push(...(await readFile(at("--names"), "utf8")).split(/\r?\n/).map((s) => s.trim()).filter(Boolean));
for (let i = 0; i < args.length; i++) { if (args[i].startsWith("--")) { i++; continue; } names.push(args[i]); }

async function get(url) {
  const {stdout} = await run("curl", ["-sSL", "--fail", "--max-time", "45", url], {maxBuffer: 32 * 1024 * 1024});
  return JSON.parse(stdout);
}
const num = (v) => (v === null || v === undefined || v === "" ? null : Number(v));

const cards = {};
for (const name of names) {
  const q = `!"${name}" unique:prints game:paper`;
  let page = 1, more = true;
  const prints = [];
  while (more) {
    const data = await get(`https://api.scryfall.com/cards/search?q=${encodeURIComponent(q)}&unique=prints&order=released&page=${page}`);
    for (const c of data.data || []) {
      prints.push({
        set: c.set, setName: c.set_name, collector: c.collector_number, released: c.released_at, rarity: c.rarity,
        usd: num(c.prices && c.prices.usd), usdFoil: num(c.prices && c.prices.usd_foil), usdEtched: num(c.prices && c.prices.usd_etched),
        finishes: c.finishes || [], frame: c.frame, frameEffects: c.frame_effects || [], borderColor: c.border_color, fullArt: !!c.full_art,
        promo: !!c.promo, setType: c.set_type, tcgplayerId: c.tcgplayer_id || null, artist: c.artist || ""
      });
    }
    more = Boolean(data.has_more);
    page += 1;
    await new Promise((r) => setTimeout(r, 110));
  }
  cards[name] = prints;
  console.log(`${name}: ${prints.length} printings, ${prints.filter((p) => p.usd !== null || p.usdFoil !== null).length} priced`);
}
const count = Object.values(cards).reduce((n, p) => n + p.length, 0);
await writeFile(out, JSON.stringify(stamp("printings-snapshot@1", "tools/printings-snapshot.mjs", {
  source: "Scryfall /cards/search q=!\"<name>\" unique:prints game:paper; prices.usd and usd_foil (TCGplayer market, USD)",
  names: names.length,
  cards
}, {count}), null, 1) + "\n", "utf8");
console.log(`wrote ${out}: ${names.length} cards, ${count} printings`);
