/**
 * Rewrites data/active-state.json from the Deck Master workbook.
 *
 * The workbook is one row per (deck, slot) for the six live decks, plus a Salvage section
 * that is the bench: cards you own that no deck has claimed. It is the record of a physical
 * audit, so it is the authority on everything the app would otherwise guess at:
 *
 *   1. WHICH HUNDRED each deck is. Selections are re-solved so the composed hundred is the
 *      sheet's Final Line-up, card for card, and the result is checked by re-composing
 *      rather than by trusting the search.
 *   2. WHAT YOU OWN. In hand and ordered are summed across the six decks and the bench, so
 *      a card in three boxes is three copies. To buy contributes nothing: it is a card you
 *      do not have.
 *   3. WHICH BOX HOLDS WHICH COPY, written to state.deckHolds -- the fact a global count
 *      cannot carry, since two decks sharing two copies look identical to a counter and
 *      are not at all identical on the table.
 *   4. WHAT IS STILL LOOSE. The Salvage rows become the bench, and the basics among them
 *      are the free pool: total owned is the pool plus what the decks have sleeved.
 *
 * TEMP SLOTS. Where Active Status is Temp, a placeholder is sleeved while the real card is
 * still being bought. The slot is treated as active and assigned -- it is ticked, and the
 * deck is not short a card -- and the Final Line-up card stays on the shopping list, which
 * is the whole point of marking the slot Temp in the first place.
 *
 * Paid prices are a different ledger (what a copy cost, not where it is) and are untouched.
 *
 * Run: node tools/apply-deck-master.mjs <deck-master.json> [--write]
 * where each row is [deckLabel, finalCardName, status, quantity, activeCardName,
 * activeStatus] read out of the Master sheet, "Salvage" being the bench.
 */
import fs from "node:fs";
import {createRequire} from "node:module";
const require = createRequire(import.meta.url);
const Slot = require("../slot-model.js");
const Lineup = require("../lineup-model.js");

const STATE = new URL("../data/active-state.json", import.meta.url);
const rows = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const doc = JSON.parse(fs.readFileSync(STATE, "utf8"));
const plans = JSON.parse(fs.readFileSync(new URL("../data/buy-plans.json", import.meta.url), "utf8")).plans;
const catalog = JSON.parse(fs.readFileSync(new URL("../data/cards.json", import.meta.url), "utf8")).cards;

/* Hand-added cards live in the state, not the buy catalog, because the catalog is
   regenerated from the build kit and anything written into it would be lost. The app
   grafts them onto the plan at load; this does the same, or a card the audit put in a slot
   by hand would have no slot to sit in and the deck would come up short. */
for (const [id, cards] of Object.entries(doc.state.manualCards || {})) {
  if (plans[id] && Array.isArray(cards) && cards.length) {
    plans[id] = {...plans[id], manual: cards.map((c) => ({...c}))};
  }
}

const DECK_OF = {Felothar: "1b", Atraxa: "2c", Obuun: "3o", Roon: "4e", Quintorius: "5o", Danitha: "7e"};
const YARD = "Salvage";
const BASIC_KEYS = new Set(["plains", "island", "swamp", "mountain", "forest", "wastes"]);
/* Hold Pending is a copy another deck is holding but has marked Temp, so it should free
   up. It is not a card to go looking for at a shop, which makes it Ordered's problem. */
const HELD = (s) => /^in hand$/i.test(s);
const ON_ORDER = (s) => /^order/i.test(s) || /^hold pending$/i.test(s);
const TO_BUY = (s) => /^to buy$/i.test(s);

/* The sheet writes a card's front face where the catalog and the plans write both. Every
   face is resolved back to the catalog's name, which is what lets the two be compared. */
const byFace = new Map();
for (const card of catalog) {
  byFace.set(Slot.ownedKey(card.name), card.name);
  for (const face of card.name.split(" // ")) {
    const key = Slot.ownedKey(face);
    if (!byFace.has(key)) byFace.set(key, card.name);
  }
}
for (const list of Object.values(doc.state.manualCards || {})) {
  for (const entry of list || []) {
    const key = Slot.ownedKey(entry.name);
    if (!byFace.has(key)) byFace.set(key, entry.name);
  }
}
for (const entry of Object.values(doc.state.liveSalvage || {})) {
  const name = entry && entry.card && entry.card.name;
  if (name && !byFace.has(Slot.ownedKey(name))) byFace.set(Slot.ownedKey(name), name);
}
const canonical = (name) => byFace.get(Slot.ownedKey(name)) || String(name).trim();
const metaOf = (name) => {
  const full = canonical(name);
  const key = Slot.ownedKey(full);
  return catalog.find((c) => c.name === full)
    || ((doc.state.liveSalvage || {})[key] || {}).card
    || null;
};

/* ---------- 1. the hundred each deck is ---------- */
/* A slot may offer a wanted card, and a wanted card may be offered by several slots, so
   this is an assignment problem, not a lookup. Greedy fails on it: taking the slot with
   the fewest options first still strands a card whose only slot has already been spent.
   Solved as a maximum bipartite matching (Kuhn's augmenting paths), which finds a perfect
   assignment whenever one exists. */
function solve(planId, wanted) {
  const slots = Slot.deckSlots(plans[planId], {}, {});
  const keys = [...wanted.keys()];
  const keyIndex = new Map(keys.map((k, i) => [k, i]));

  /* Edges: slot i can supply key j when it offers that card in exactly the wanted count.
     Basics are the exception. A slot for twelve Mountains is one slot, not twelve, so
     eleven Mountains and a tapland cannot be expressed on it -- a hand-added card is an
     alternative ON a slot, never an extra slot, and the plan's shells are measured rungs
     that must not be edited without re-measuring. A basic slot therefore supplies its
     basic at whatever count the plan carries, and the difference is reported. */
  const edges = slots.map((slot) => {
    const out = [];
    slot.rungs.forEach((rung) => {
      const j = keyIndex.get(Slot.ownedKey(rung.name));
      if (j === undefined) return;
      if (wanted.get(keys[j]) === rung.quantity || (slot.isBasic && BASIC_KEYS.has(keys[j]))) out.push({j, rung});
    });
    return out;
  });

  const slotForKey = new Array(keys.length).fill(-1);
  const rungForKey = new Array(keys.length).fill(null);
  const tryAssign = (i, seen) => {
    for (const {j, rung} of edges[i]) {
      if (seen.has(j)) continue;
      seen.add(j);
      if (slotForKey[j] < 0 || tryAssign(slotForKey[j], seen)) {
        slotForKey[j] = i;
        rungForKey[j] = rung;
        return true;
      }
    }
    return false;
  };
  slots.forEach((_, i) => tryAssign(i, new Set()));

  const selection = {};
  Lineup.ARRAY_KEYS.forEach((k) => { selection[k] = []; });
  rungForKey.forEach((rung) => { if (rung) (selection[rung.kind] ||= []).push(rung.entryId); });
  return {selection, unplaced: keys.filter((_, j) => slotForKey[j] < 0).map((k) => [k, wanted.get(k)])};
}

function identityOf(planId) {
  const seat = Slot.deckSlots(plans[planId], {}, {}).find((s) => s.type === "Commander");
  const card = catalog.find((c) => c.name === canonical((seat && (seat.rungs[0] || {}).name) || ""));
  if (!card) throw new Error(`${planId}: no commander to take colors from`);
  return {name: card.name, identity: new Set(card.colorIdentity || [])};
}

const report = [];
const composed = new Set();      // every card key that ended up in one of the six hundreds
const deckUse = new Map();       // key -> copies the six decks sleeve, basics included
const basicDrift = [];
const unsupplied = [];

for (const [label, id] of Object.entries(DECK_OF)) {
  const mine = rows.filter((r) => r[0] === label);
  const wanted = new Map();
  mine.forEach(([, name, , count]) => {
    const key = Slot.ownedKey(canonical(name));
    wanted.set(key, (wanted.get(key) || 0) + Number(count || 0));
  });
  const {selection, unplaced} = solve(id, wanted);
  doc.state.buySelections[id] = selection;

  // Verify by composing, not by trusting the search.
  const got = new Map();
  Slot.deckSlots(plans[id], selection, {}).forEach((s) => {
    if (!s.pick) return;
    const key = Slot.ownedKey(s.pick.name);
    got.set(key, (got.get(key) || 0) + Math.max(1, Number(s.pick.quantity) || 1));
  });
  got.forEach((n, key) => { composed.add(key); deckUse.set(key, (deckUse.get(key) || 0) + n); });

  const keys = new Set([...wanted.keys(), ...got.keys()]);
  const wrong = [...keys].filter((k) => (wanted.get(k) || 0) !== (got.get(k) || 0));
  wrong.filter((k) => BASIC_KEYS.has(k))
    .forEach((k) => basicDrift.push({id, name: k, wanted: wanted.get(k) || 0, got: got.get(k) || 0}));
  unplaced.forEach(([key, count]) => {
    const name = canonical((rows.find((r) => Slot.ownedKey(canonical(r[1])) === key) || [])[1] || key);
    const fact = metaOf(name);
    const {name: commander, identity} = identityOf(id);
    const ci = (fact && fact.colorIdentity) || [];
    unsupplied.push({id, name, count, why: !fact ? "no card by that name in the catalog or on the bench"
      : !ci.every((c) => identity.has(c))
        ? `color identity ${ci.join("") || "colorless"} is outside ${commander}'s ${[...identity].sort().join("") || "colorless"} - it cannot legally be in this deck`
        : "the plan has no slot that offers it, and a hand-added card is an alternative on a slot, never an extra slot"});
  });
  report.push({label, id, cards: [...got.values()].reduce((a, b) => a + b, 0),
               wanted: [...wanted.values()].reduce((a, b) => a + b, 0), wrong, unplaced});
}

/* ---------- 2. the bench ---------- */
/* Everything in the Salvage section is a card no deck has claimed. The basics among them
   are the free pool and belong to no bench card: they are counted into ownership and left
   out of the yard, because a yard tile per Forest is not a thing anyone wants to scroll. */
const benchPool = new Map();
const yard = {};
const unknown = [];
for (const [deck, name, status, count] of rows) {
  if (deck !== YARD) continue;
  const full = canonical(name);
  const key = Slot.ownedKey(full);
  const qty = Math.max(0, Number(count) || 0);
  benchPool.set(key, (benchPool.get(key) || 0) + qty);
  if (BASIC_KEYS.has(key)) continue;
  const card = metaOf(full);
  if (!card) unknown.push(full);
  yard[key] = {
    card: card ? {...card, quantity: qty}
      : {name: full, quantity: qty, typeLine: "", manaCost: "", oracleText: "", colorIdentity: [], price: 0},
    reason: ON_ORDER(status) ? "On the bench, on order in the audit." : "On the bench in the audit."
  };
}
doc.state.liveSalvage = yard;

/* ---------- 3. what you own ---------- */
/* Deck rows say what each box holds; the bench says what is loose. Ownership is the sum,
   and a basic's total is the free pool plus every copy the decks have sleeved. */
const owned = {};
const bump = (key, field, n) => {
  const rec = owned[key] || (owned[key] = {inHand: 0, ordered: 0});
  rec[field] += n;
};
for (const [deck, name, status, count] of rows) {
  if (deck === YARD) continue;
  const key = Slot.ownedKey(canonical(name));
  if (BASIC_KEYS.has(key)) continue;             // basics are settled from the pool below
  if (HELD(status)) bump(key, "inHand", Number(count || 0));
  else if (ON_ORDER(status)) bump(key, "ordered", Number(count || 0));
}
for (const [key, qty] of benchPool) {
  if (BASIC_KEYS.has(key)) bump(key, "inHand", qty + (deckUse.get(key) || 0));
  else bump(key, "inHand", qty);
}
doc.state.owned = owned;
doc.state.found = {};
doc.state.boughtQuantities = {};
for (const [key, rec] of Object.entries(owned)) {
  doc.state.boughtQuantities[key] = rec.inHand;
  if (rec.inHand > 0) doc.state.found[key] = true;
}
doc.state.ownershipSchema = 3;
doc.orderedNotYetInHand = [...new Set(rows.filter((r) => r[0] !== YARD && ON_ORDER(r[2])).map((r) => canonical(r[1])))]
  .sort((a, b) => a.localeCompare(b));

/* ---------- 4. which box holds which copy ---------- */
doc.state.deckHolds = {};
for (const [deck, name, status, count] of rows) {
  const id = DECK_OF[deck];
  if (!id) continue;
  const key = Slot.ownedKey(canonical(name));
  const per = doc.state.deckHolds[id] || (doc.state.deckHolds[id] = {});
  const rec = per[key] || (per[key] = {inHand: 0, ordered: 0});
  if (HELD(status)) rec.inHand += Number(count || 0);
  else if (ON_ORDER(status)) rec.ordered += Number(count || 0);
}
/* Basics are held against the pool, not against the sheet's per-deck line. Where the plan
   sleeves twelve Mountains and the sheet counts eleven, the deck holds twelve, and leaving
   the hold at eleven would put the twelfth on the shopping list against a shelf of eighty. */
for (const [id, selection] of Object.entries(doc.state.buySelections)) {
  if (!plans[id]) continue;
  const per = doc.state.deckHolds[id] || (doc.state.deckHolds[id] = {});
  Slot.deckSlots(plans[id], selection, {}).forEach((slot) => {
    if (!slot.pick || !slot.isBasic) return;
    const key = Slot.ownedKey(slot.pick.name);
    const pool = (owned[key] || {}).inHand || 0;
    const elsewhere = Object.entries(doc.state.deckHolds)
      .reduce((n, [other, map]) => n + (other === id ? 0 : ((map[key] || {}).inHand || 0)), 0);
    const rec = per[key] || (per[key] = {inHand: 0, ordered: 0});
    rec.inHand = Math.min(slot.pick.quantity, Math.max(0, pool - elsewhere));
  });
}

/* ---------- 5. every slot claimed ----------
   Including the Temp ones: a slot with a placeholder sleeved in it is a slot this deck has
   claimed, whatever is still on order for it. */
doc.state.deckActive = {};
doc.state.deckActiveSeed = {};
for (const id of Object.values(DECK_OF)) {
  const map = {};
  Slot.deckSlots(plans[id], doc.state.buySelections[id], {}).forEach((s) => { if (s.pick) map[s.slotId] = true; });
  doc.state.deckActive[id] = map;
  doc.state.deckActiveSeed[id] = true;
}

doc.exportedAt = new Date().toISOString();
const write = process.argv.includes("--write");
if (write) fs.writeFileSync(STATE, JSON.stringify(doc, null, 1) + "\n");

const copies = (test) => rows.filter((r) => r[0] !== YARD && test(r[2])).reduce((n, r) => n + Number(r[3] || 0), 0);
report.forEach((r) => console.log(
  `${r.label.padEnd(12)} ${r.id}  ${r.cards}/${r.wanted} cards  ` +
  (r.wrong.length ? `MISMATCH on ${r.wrong.length}: ${r.wrong.slice(0, 6).join(", ")}` : "composes exactly")));
console.log(`\nsheet says: ${copies(TO_BUY)} to buy · ${copies(ON_ORDER)} ordered · ${copies(HELD)} in hand`);
const held = Object.values(owned).reduce((n, r) => n + r.inHand, 0);
const onOrder = Object.values(owned).reduce((n, r) => n + r.ordered, 0);
console.log(`ledger: ${Object.keys(owned).length} cards · ${held} in hand · ${onOrder} on order`);
console.log(`bench: ${Object.keys(yard).length} cards, plus a free pool of ` +
  [...benchPool].filter(([k]) => BASIC_KEYS.has(k)).map(([k, n]) => `${n} ${k}`).join(", "));
const temps = rows.filter((r) => /^temp$/i.test(r[5] || ""));
if (temps.length) console.log(`\n${temps.length} Temp slots, ticked as claimed with the final card still on the list:`);
temps.forEach((r) => console.log(`  ${r[0]}: ${r[4]} standing in for ${r[1]} (${r[2]})`));
if (basicDrift.length) {
  console.log(`\nbasic-land counts the plan carries differently from the sheet:`);
  basicDrift.forEach((b) => console.log(`  ${b.id} ${b.name}: sheet ${b.wanted}, plan ${b.got}`));
}
if (unknown.length) console.log(`\n${unknown.length} bench cards are not in the catalog: ${unknown.join(", ")}`);
if (unsupplied.length) {
  console.log(`\n${unsupplied.length} sheet card${unsupplied.length === 1 ? "" : "s"} could not go into the deck:`);
  unsupplied.forEach((r) => console.log(`  ${r.id} ${r.name} x${r.count} - ${r.why}`));
}
console.log(write ? "\nwritten to data/active-state.json" : "\n(dry run - pass --write to save)");
