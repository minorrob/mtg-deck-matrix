/**
 * Rewrites data/active-state.json from an audited "Deck Truth" sheet.
 *
 * The sheet is one row per (deck, card): which deck it belongs to, whether it is in hand,
 * on order or still to buy, and how many copies. It is the record of a physical audit, so
 * it decides three things the app was previously guessing at separately:
 *
 *   1. WHICH HUNDRED each deck is. Selections are re-solved so the composed hundred is
 *      the audited hundred, card for card. Every card in the sheet is already a rung or a
 *      hand-added option on some slot of its deck's plan, so this is a re-selection and
 *      never an invention.
 *   2. WHAT YOU OWN. In hand and ordered are summed across every deck and the yard, so a
 *      card in three boxes is three copies. To-buy contributes nothing.
 *   3. WHAT IS ON THE BENCH. The yard is replaced by the sheet's Salvage Yard rows.
 *
 * Run: node tools/apply-deck-truth.mjs <truth.json>
 * where truth.json is [[deck, card, status, count], ...] read out of the workbook.
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

/* Hand-added cards live in the state, not the buy catalog, because the catalog is
   regenerated from the build kit and anything written into it would be lost. The app
   grafts them onto the plan at load (applyManualCards); this does the same, or sixteen of
   the audited cards would have no slot to sit in and the deck would come up short. */
for (const [id, cards] of Object.entries(doc.state.manualCards || {})) {
  if (plans[id] && Array.isArray(cards) && cards.length) {
    plans[id] = {...plans[id], manual: cards.map((c) => ({...c}))};
  }
}
const catalog = JSON.parse(fs.readFileSync(new URL("../data/cards.json", import.meta.url), "utf8")).cards;

const DECK_OF = {
  "Deck 1 - Felothar": "1b", "Deck 2 - Atraxa": "2c", "Deck 3 · Obuun": "3o",
  "Deck 4 - Roon": "4e", "Deck 5 - Quintorius": "5o", "Deck 7 - Danitha": "7e"
};
const YARD = "Salvage Yard";
// "Order" appears where "Ordered" was meant; both mean paid for and not yet here.
const HELD = (s) => /in hand|salvage/i.test(s);
const ON_ORDER = (s) => /^order/i.test(s);

/* The sheet lists front faces; the catalog and the plans use full names. Resolving every
   face back to the catalog entry is what lets the two sides be compared at all. */
const byFace = new Map();
for (const card of catalog) {
  byFace.set(Slot.ownedKey(card.name), card.name);
  for (const face of card.name.split(" // ")) {
    const key = Slot.ownedKey(face);
    if (!byFace.has(key)) byFace.set(key, card.name);
  }
}
const canonical = (name) => byFace.get(Slot.ownedKey(name)) || String(name).trim();
const metaOf = (name) => catalog.find((c) => c.name === canonical(name)) || null;

/* ---------- 1. the hundred each deck is ---------- */
/* A slot may offer a wanted card, and a wanted card may be offered by several slots, so
   this is an assignment problem, not a lookup. Greedy fails on it: taking the slot with
   the fewest options first still strands a card whose only slot has already been spent.
   So it is solved as a maximum bipartite matching (Kuhn's augmenting paths), which finds
   a perfect assignment whenever one exists -- and the caller re-composes the deck to
   check the answer rather than trusting the search. */
function solve(planId, wanted) {
  const plan = plans[planId];
  const slots = Slot.deckSlots(plan, {}, {});
  const keys = [...wanted.keys()];
  const keyIndex = new Map(keys.map((k, i) => [k, i]));

  // Edges: slot i can supply key j when it offers that card in exactly the wanted count.
  const edges = slots.map((slot) => {
    const out = [];
    slot.rungs.forEach((rung) => {
      const j = keyIndex.get(Slot.ownedKey(rung.name));
      if (j !== undefined && wanted.get(keys[j]) === rung.quantity) out.push({j, rung});
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
  const unplaced = keys.filter((_, j) => slotForKey[j] < 0).map((k) => [k, wanted.get(k)]);
  return {selection, unplaced};
}

const report = [];
for (const [label, id] of Object.entries(DECK_OF)) {
  const wanted = new Map();
  rows.filter((r) => r[0] === label).forEach(([, name, , count]) => {
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
  const keys = new Set([...wanted.keys(), ...got.keys()]);
  const wrong = [...keys].filter((k) => (wanted.get(k) || 0) !== (got.get(k) || 0));
  report.push({label, id, cards: [...got.values()].reduce((a, b) => a + b, 0), wrong, unplaced});
}

/* ---------- 2. what you own ---------- */
/* Basics are the one thing this sheet cannot see. It records what each deck USES -- twelve
   Forests in deck 3, six Plains in deck 1 -- and summing that gives the demand, not the
   shelf: seventy Plains where the box holds eighty-six. So the pool figure already on
   record is carried forward for the five basics and the sheet decides everything else. */
const BASICS = new Set(["plains", "island", "swamp", "mountain", "forest", "wastes"]);
const priorOwned = Slot.normalizeOwned(doc.state);
const owned = {};
for (const [deck, name, status, count] of rows) {
  const key = Slot.ownedKey(canonical(name));
  const rec = owned[key] || (owned[key] = {inHand: 0, ordered: 0});
  if (HELD(status)) rec.inHand += Number(count || 0);
  else if (ON_ORDER(status)) rec.ordered += Number(count || 0);
  void deck;   // to-buy contributes nothing: it is a card you do not have
}
for (const key of BASICS) {
  const prior = priorOwned[key];
  if (prior && prior.inHand > (owned[key] ? owned[key].inHand : 0)) owned[key] = {...prior};
}
doc.state.owned = owned;
doc.state.found = {};
doc.state.boughtQuantities = {};
for (const [key, rec] of Object.entries(owned)) {
  doc.state.boughtQuantities[key] = rec.inHand;
  if (rec.inHand > 0) doc.state.found[key] = true;
}
doc.state.ownershipSchema = 3;
doc.orderedNotYetInHand = [...new Set(rows.filter((r) => ON_ORDER(r[2])).map((r) => canonical(r[1])))].sort((a, b) => a.localeCompare(b));

/* ---------- 2b. which box holds which copy ---------- */
/* The one fact a global count cannot carry. Two decks sharing two copies of a card look
   identical to a counter and are not at all identical on the table, so the audit's own
   assignment is written down and the allocator serves those decks first. */
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

/* ---------- 3. the bench ---------- */
const yard = {};
for (const [deck, name, , count] of rows) {
  if (deck !== YARD) continue;
  const card = metaOf(name);
  const key = Slot.ownedKey(canonical(name));
  yard[key] = {
    card: card
      ? {...card, quantity: Number(count) || 1}
      : {name: canonical(name), quantity: Number(count) || 1, typeLine: "", manaCost: "", oracleText: "", colorIdentity: [], price: 0},
    reason: "On the bench in the 2026-08-27 audit."
  };
}
doc.state.liveSalvage = yard;

/* ---------- 4. every slot claimed ---------- */
doc.state.deckActive = {};
doc.state.deckActiveSeed = {};
for (const id of Object.values(DECK_OF)) {
  const map = {};
  Slot.deckSlots(plans[id], doc.state.buySelections[id], {}).forEach((s) => { if (s.pick) map[s.slotId] = true; });
  doc.state.deckActive[id] = map;
  doc.state.deckActiveSeed[id] = true;
}

fs.writeFileSync(STATE, JSON.stringify(doc, null, 1) + "\n");

const held = Object.values(owned).reduce((n, r) => n + r.inHand, 0);
const onOrder = Object.values(owned).reduce((n, r) => n + r.ordered, 0);
report.forEach((r) => console.log(
  `${r.label.padEnd(22)} ${r.id}  ${r.cards} cards  ` +
  (r.wrong.length ? `MISMATCH on ${r.wrong.length}: ${r.wrong.slice(0, 6).join(", ")}` : "composes exactly") +
  (r.unplaced.length ? `  UNPLACED ${r.unplaced.map(([k, n]) => `${k}x${n}`).join(", ")}` : "")));
console.log(`\nownership: ${Object.keys(owned).length} cards · ${held} copies in hand · ${onOrder} on order`);
console.log(`bench: ${Object.keys(yard).length} cards`);
