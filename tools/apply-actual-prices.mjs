/**
 * Writes the master sheet's Cost column into the app's paid-price ledger.
 *
 * The sheet is one row per (deck, card) with a Qty and a per-copy Cost. Cost is what a
 * copy actually cost, which is not the same question as what the card is worth: a Sol Ring
 * that came inside a precon cost a hundredth of the box, and a common out of a bulk bin
 * cost forty cents whatever the market says. Blank means unpriced, which is not free --
 * those cards keep the target estimate the app already carries.
 *
 * ONE NUMBER PER CARD. state.purchasePrices is keyed by card, not by (card, deck), so a
 * card bought twice at two prices has to collapse to one figure. It collapses to the
 * quantity-weighted average -- total spent over total copies -- because that is the only
 * choice that leaves the money right: sum it back over every copy and you get what was
 * actually spent. Taking the highest or the lowest would not.
 *
 * Prices only. Ownership, selections and holds are not read and not written.
 *
 * Run: node tools/apply-actual-prices.mjs <costs.csv>
 * where costs.csv has a header row and the columns Deck, Card, Qty, Cost.
 */
import fs from "node:fs";
import {createRequire} from "node:module";

const require = createRequire(import.meta.url);
const Slot = require("../slot-model.js");
const Lineup = require("../lineup-model.js");

const csvPath = process.argv[2];
if (!csvPath) {
  console.error("usage: node tools/apply-actual-prices.mjs <costs.csv>");
  process.exit(1);
}

/* A hand-rolled reader rather than a dependency: the sheet is four columns and the only
   quoting that ever shows up is a comma inside a card name. */
function readCsv(text) {
  const rows = [];
  let row = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i += 1; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (c !== "\r") cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const head = rows.shift().map((h) => h.trim());
  return rows.filter((r) => r.some((v) => v.trim())).map((r) => {
    const o = {};
    head.forEach((h, i) => { o[h] = (r[i] || "").trim(); });
    return o;
  });
}

/* The sheet writes a card's front face; the catalog writes both faces of a split card.
   Match on the front face, then key on whatever the catalog calls it, so the price lands
   on the same slug the Shop row and the slot both read. */
function nameIndex(state) {
  const index = new Map();
  const add = (name) => {
    if (!name) return;
    const k = Lineup.normalizeName(name);
    if (!index.has(k) || String(name).length > String(index.get(k)).length) index.set(k, name);
  };
  const catalog = JSON.parse(fs.readFileSync(new URL("../data/cards.json", import.meta.url), "utf8"));
  (catalog.cards || []).forEach((c) => add(c.name));
  Object.values(state.liveSalvage || {}).forEach((e) => add(e && e.card ? e.card.name : e && e.name));
  Object.values(state.manualCards || {}).forEach((list) => (list || []).forEach((e) => add(e.name)));
  return index;
}

const doc = JSON.parse(fs.readFileSync(new URL("../data/active-state.json", import.meta.url), "utf8"));
const state = doc.state;
const index = nameIndex(state);

const spend = new Map();   // key -> {name, cents, copies, prices:Set}
const missing = new Set();
let priced = 0, skipped = 0;

for (const row of readCsv(fs.readFileSync(csvPath, "utf8"))) {
  const raw = String(row.Cost || "").trim();
  if (!raw) { skipped += 1; continue; }
  const cost = Number(raw);
  const qty = Math.max(1, Number(row.Qty) || 1);
  if (!Number.isFinite(cost) || cost < 0) { skipped += 1; continue; }
  const resolved = index.get(Lineup.normalizeName(row.Card));
  if (!resolved) { missing.add(row.Card); continue; }
  const key = Slot.ownedKey(resolved);
  const acc = spend.get(key) || {name: resolved, cents: 0, copies: 0, prices: new Set()};
  acc.cents += Math.round(cost * 100) * qty;
  acc.copies += qty;
  acc.prices.add(cost.toFixed(2));
  spend.set(key, acc);
  priced += 1;
}

const prices = {};
const blended = [];
for (const [key, acc] of spend) {
  prices[key] = Math.round(acc.cents / acc.copies) / 100;
  if (acc.prices.size > 1) blended.push({name: acc.name, saw: [...acc.prices].sort(), used: prices[key], copies: acc.copies});
}

state.purchasePrices = prices;
doc.exportedAt = new Date().toISOString();
fs.writeFileSync(new URL("../data/active-state.json", import.meta.url), JSON.stringify(doc, null, 2) + "\n");

const total = [...spend.values()].reduce((n, a) => n + a.cents, 0) / 100;
console.log(`priced rows: ${priced} · blank rows left on target: ${skipped} · cards priced: ${Object.keys(prices).length}`);
console.log(`total spend represented: $${total.toFixed(2)}`);
if (blended.length) {
  console.log(`\n${blended.length} cards were bought at more than one price; each shows its weighted average:`);
  blended.sort((a, b) => a.name.localeCompare(b.name))
    .forEach((b) => console.log(`  ${b.name}: ${b.saw.join(" / ")} over ${b.copies} copies -> ${b.used.toFixed(2)}`));
}
if (missing.size) {
  console.log(`\n${missing.size} sheet names matched no card the app knows:`);
  [...missing].sort().forEach((n) => console.log("  " + n));
}
