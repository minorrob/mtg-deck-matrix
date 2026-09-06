/**
 * Rewrites the ownership half of data/active-state.json from Rob's Current State sheet.
 *
 * WHAT THIS SHEET IS, AND WHAT IT IS NOT. One row per card: how many copies are on the
 * shelf, how many are paid for and still in the post, the price and a couple of facts
 * about the card. It is a statement about the COLLECTION, so it decides two things:
 *
 *   1. WHAT YOU OWN -- in hand and on order, per card, as totals.
 *   2. WHAT IS LEFT TO BUY -- everything a deck wants that neither number covers. That
 *      list is not stored; it falls out of the ledger, which is why getting the ledger
 *      right is the whole job.
 *
 * It has no deck column, so unlike tools/apply-deck-truth.mjs it CANNOT decide which
 * hundred each deck is. Selections, the Salvage Yard and the per-slot picks are left
 * exactly as they were; only the ledger moves, and the boxes follow it.
 *
 * BASICS ARE NOT AN EXCEPTION HERE. The older Deck Truth sheet recorded what each deck
 * USED, so summing it gave demand rather than the shelf and the pool had to be carried
 * forward by hand. This sheet counts the shelf directly -- and reads higher than the
 * carried-forward pool on four of the five basics -- so it is taken at its word.
 *
 * Run: node tools/apply-current-state.mjs [--dry]
 */
import fs from "node:fs";
import {execFileSync} from "node:child_process";
import {createRequire} from "node:module";
const require = createRequire(import.meta.url);
const Slot = require("../slot-model.js");

const HERE = new URL(".", import.meta.url);
const STATE = new URL("../data/active-state.json", import.meta.url);
const SOURCE = new URL("../data/source/Robs_MtG_Current_State.xlsx", import.meta.url);
const DRY = process.argv.includes("--dry");

const rows = JSON.parse(execFileSync("python3",
  [new URL("./read-sheet-rows.py", HERE).pathname, SOURCE.pathname], {encoding: "utf8", maxBuffer: 1 << 26}));
const header = rows[0].map((h) => String(h || "").trim().toLowerCase());
const col = (want) => {
  const at = header.indexOf(want);
  if (at < 0) throw new Error(`the sheet has no "${want}" column, only: ${header.join(", ")}`);
  return at;
};
const [C_NAME, C_OWNED, C_ORDER] = [col("card"), col("quantity owned"), col("quantity on order")];

const count = (v) => {
  const n = Number(String(v === null || v === undefined ? "" : v).trim());
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
};

const doc = JSON.parse(fs.readFileSync(STATE, "utf8"));
const catalog = JSON.parse(fs.readFileSync(new URL("../data/cards.json", import.meta.url), "utf8")).cards;

/* The sheet lists a two-faced card by its front face -- "Bilbo Baggins, Burglar" -- and
   the app keys it by the full printed name. Resolving every face back to the catalog is
   what stops five cards being counted twice, once under each spelling. */
const byFace = new Map();
for (const card of catalog) {
  byFace.set(Slot.ownedKey(card.name), card.name);
  for (const face of card.name.split(" // ")) {
    const key = Slot.ownedKey(face);
    if (!byFace.has(key)) byFace.set(key, card.name);
  }
}
const canonical = (name) => byFace.get(Slot.ownedKey(name)) || String(name).trim();

/* ---------- the ledger ---------- */
const owned = {};
const names = new Map();          // key -> the canonical name, for the ordered manifest
let read = 0, renamed = 0, merged = 0;
for (const row of rows.slice(1)) {
  const raw = String(row[C_NAME] === null || row[C_NAME] === undefined ? "" : row[C_NAME]).trim();
  if (!raw) continue;
  read += 1;
  const name = canonical(raw);
  if (name !== raw) renamed += 1;
  const key = Slot.ownedKey(name);
  const inHand = count(row[C_OWNED]);
  const ordered = count(row[C_ORDER]);
  if (owned[key]) merged += 1;
  const rec = owned[key] || (owned[key] = {inHand: 0, ordered: 0});
  rec.inHand += inHand;
  rec.ordered += ordered;
  names.set(key, name);
}
// A card at 0/0 is a card you do not have, which is what an absent key already means.
for (const [key, rec] of Object.entries(owned)) {
  if (!rec.inHand && !rec.ordered) { delete owned[key]; names.delete(key); }
}

/* ---------- which box holds which copy ---------- */
/* The sheet cannot say, so the boxes keep the claims they already had and only the
   status of each claim is re-read: a copy this deck was waiting on has arrived if the
   ledger now says a copy is in hand. Claims are served in deck order and clamped to the
   ledger, so no box ends up holding a card the collection no longer says you own.
 *
 * DENIALS ARE DROPPED, and this is the part that decides whether the Shop tells the
 * truth. A hold of {inHand: 0, ordered: 0} is not an absence, it is an assertion --
 * "this box was counted and holds none of the copies that exist" -- and allocateCopies
 * honours it by never serving that deck, whatever is on the shelf. Those assertions came
 * from an audit with a deck column against a collection that has since grown: 247 of the
 * 263 of them name a card this sheet says is now in hand or in the post, and each one was
 * showing up in the Shop as a card still to buy. This sheet has no deck column, so it
 * cannot restate them, and a stale denial is worse than none: the allocator's fallback is
 * to serve decks in order out of what is unclaimed, which cannot over-allocate because
 * the pool is decremented as it goes. */
const holds = doc.state.deckHolds || {};
let denials = 0;
for (const per of Object.values(holds)) {
  for (const [key, rec] of Object.entries(per)) {
    if (!(Number(rec.inHand) || 0) && !(Number(rec.ordered) || 0)) { delete per[key]; denials += 1; }
  }
}
const deckIds = Object.keys(holds);
const budget = {};
for (const [key, rec] of Object.entries(owned)) budget[key] = {inHand: rec.inHand, ordered: rec.ordered};
let arrived = 0, dropped = 0;
for (const id of deckIds) {
  for (const [key, rec] of Object.entries(holds[id])) {
    const claim = (Number(rec.inHand) || 0) + (Number(rec.ordered) || 0);
    const left = budget[key] || {inHand: 0, ordered: 0};
    const takeHand = Math.min(claim, left.inHand);
    const takeOrder = Math.min(claim - takeHand, left.ordered);
    left.inHand -= takeHand;
    left.ordered -= takeOrder;
    budget[key] = left;
    if (takeHand > (Number(rec.inHand) || 0)) arrived += takeHand - (Number(rec.inHand) || 0);
    if (takeHand + takeOrder < claim) dropped += claim - takeHand - takeOrder;
    holds[id][key] = {inHand: takeHand, ordered: takeOrder};
  }
}

/* ---------- the bench ---------- */
/* A card on the bench is a copy no box is holding, so a card you do not own cannot be on
   it. The sheet decides ownership, so the yard follows: an entry with no spare copy left
   behind it is dropped rather than left contradicting the ledger. Two of the three this
   removed are in the post rather than gone -- they come back to the bench when they
   arrive and a box does not claim them. */
const yard = doc.state.liveSalvage || {};
const boxedOf = (key) => Object.values(holds).reduce((n, per) => n + ((per[key] || {}).inHand || 0), 0);
const unbacked = [];
for (const [key, entry] of Object.entries(yard)) {
  const held = (owned[key] || {}).inHand || 0;
  const want = (entry.card && entry.card.quantity) || 1;
  if (held - boxedOf(key) < want) {
    unbacked.push(`${(entry.card && entry.card.name) || key}` +
      ((owned[key] || {}).ordered ? " (in the post)" : ""));
    delete yard[key];
  }
}
doc.state.liveSalvage = yard;

/* ---------- write ---------- */
const before = Slot.normalizeOwned(doc.state);
doc.state.owned = owned;
doc.state.found = {};
doc.state.boughtQuantities = {};
for (const [key, rec] of Object.entries(owned)) {
  doc.state.boughtQuantities[key] = rec.inHand;
  if (rec.inHand > 0) doc.state.found[key] = true;
}
doc.state.ownershipSchema = 3;
doc.state.deckHolds = holds;
doc.orderedNotYetInHand = [...Object.entries(owned)]
  .filter(([, rec]) => rec.ordered > 0)
  .map(([key]) => names.get(key))
  .sort((a, b) => a.localeCompare(b));

const heldNow = Object.values(owned).reduce((n, r) => n + r.inHand, 0);
const orderNow = Object.values(owned).reduce((n, r) => n + r.ordered, 0);
const heldWas = Object.values(before).reduce((n, r) => n + r.inHand, 0);
const orderWas = Object.values(before).reduce((n, r) => n + r.ordered, 0);

if (!DRY) fs.writeFileSync(STATE, JSON.stringify(doc, null, 1) + "\n");
console.log(`read ${read} rows · ${renamed} names canonicalized to a fuller printed name` +
  (merged ? ` · ${merged} merged onto a key already seen` : ""));
console.log(`ownership: ${Object.keys(owned).length} cards (was ${Object.keys(before).length})`);
console.log(`  in hand: ${heldWas} -> ${heldNow} copies`);
console.log(`  ordered: ${orderWas} -> ${orderNow} copies`);
console.log(`  manifest: ${doc.orderedNotYetInHand.length} names still in the post`);
console.log(`boxes: ${arrived} claimed copies moved from ordered to in hand` +
  (dropped ? `, ${dropped} claims dropped for want of a copy` : "") +
  `, ${denials} audit denials dropped`);
console.log(`bench: ${Object.keys(yard).length} cards` +
  (unbacked.length ? ` · dropped ${unbacked.length} with no spare copy behind them: ${unbacked.join(", ")}` : ""));
console.log(DRY ? "\n--dry: nothing written" : `\nwrote ${STATE.pathname}`);
