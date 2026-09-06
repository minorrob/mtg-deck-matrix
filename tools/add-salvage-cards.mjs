/**
 * Adds cards you have just acquired to the Salvage Yard, and offers each one on the deck
 * slots where it could actually do a job.
 *
 * A card lands on a slot's Manual list only where all four hold:
 *   - the deck can legally play it (its color identity is inside the commander's);
 *   - the slot's current card is NOT in your hands -- still to buy, or in the post --
 *     because a slot you can already fill does not need a substitute;
 *   - it does the same job, judged by Slot.slotFit, which is the same scoring the Deck
 *     page uses for "cards you own that would do this slot's job";
 *   - and where the slot's card has a role, the new card shares it. Without that the
 *     lists fill with "also a creature", which is true of half the deck.
 *
 * Nothing is selected. Every card is an option on a slot, one click from being picked,
 * which is the whole point of the Manual rung.
 *
 * Run: node tools/add-salvage-cards.mjs <cards-to-add.json> [cards-to-repair.json]
 */
import fs from "node:fs";
import {createRequire} from "node:module";
const require = createRequire(import.meta.url);
const Slot = require("../slot-model.js");

const STATE = new URL("../data/active-state.json", import.meta.url);
const doc = JSON.parse(fs.readFileSync(STATE, "utf8"));
const plans = JSON.parse(fs.readFileSync(new URL("../data/buy-plans.json", import.meta.url), "utf8")).plans;
const catalog = JSON.parse(fs.readFileSync(new URL("../data/cards.json", import.meta.url), "utf8")).cards;
const fetched = JSON.parse(fs.readFileSync(process.argv[2], "utf8")).data;
/* A second, optional payload used only to fill in bench cards that arrived without
   metadata. Kept separate from the cards being added, or repairing an old entry would
   also put that card on the bench a second time. */
const repairs = process.argv[3] ? JSON.parse(fs.readFileSync(process.argv[3], "utf8")).data : [];

for (const [id, cards] of Object.entries(doc.state.manualCards || {})) {
  if (plans[id] && Array.isArray(cards) && cards.length) plans[id] = {...plans[id], manual: cards.map((c) => ({...c}))};
}

const BASICS = new Set(["plains", "island", "swamp", "mountain", "forest"]);
const money = (n) => (Number.isFinite(Number(n)) ? Number(n) : 0);

/* Scryfall's shape into the catalog's. Only the fields the app reads -- there is no point
   carrying rulings and printings into a state file. */
function toCard(sc) {
  const face = (sc.card_faces && sc.card_faces[0]) || sc;
  return {
    name: sc.name,
    manaCost: sc.mana_cost || face.mana_cost || "",
    typeLine: sc.type_line || face.type_line || "",
    oracleText: sc.oracle_text || face.oracle_text || "",
    keywords: sc.keywords || [],
    colorIdentity: sc.color_identity || [],
    legalities: sc.legalities || {},
    rarity: sc.rarity || "",
    setName: sc.set_name || "",
    setCode: (sc.set || "").toUpperCase(),
    image: (sc.image_uris && sc.image_uris.normal) || (face.image_uris && face.image_uris.normal) || "",
    price: money(sc.prices && sc.prices.usd),
    tcgplayerUrl: (sc.purchase_uris && sc.purchase_uris.tcgplayer) || ""
  };
}

const incoming = fetched.map(toCard);
const repairable = repairs.map(toCard);
const known = new Map(catalog.map((c) => [Slot.ownedKey(c.name), c]));

/* ---------- fill in any bench card that arrived without metadata ---------- */
/* Earlier ingests could only record a name for a card the catalog did not carry, which
   left the bench showing a card with no type, no price and no art. Anything in this
   payload that matches a thin entry is filled in; nothing else is touched. */
const enriched = [];
for (const [key, entry] of Object.entries(doc.state.liveSalvage || {})) {
  if (entry.card && entry.card.typeLine) continue;
  const match = [...incoming, ...repairable].find((c) => Slot.ownedKey(c.name) === key);
  if (!match) continue;
  entry.card = {...entry.card, ...match, quantity: entry.card.quantity || 1};
  enriched.push(match.name);
}

/* ---------- the yard, and what you now own ---------- */
doc.state.liveSalvage ||= {};
doc.state.owned ||= {};
const addedYard = [];
const bumpedBasics = [];
for (const card of incoming) {
  const key = Slot.ownedKey(card.name);
  if (BASICS.has(key)) {
    /* Basics are a pool, not a yard entry. One more Swamp is one more Swamp on the shelf;
       filing it as a loose card would put a single basic on the bench beside a pile of
       eighty and mean nothing. */
    const rec = doc.state.owned[key] || (doc.state.owned[key] = {inHand: 0, ordered: 0});
    rec.inHand += 1;
    bumpedBasics.push(`${card.name} ${rec.inHand}`);
    continue;
  }
  doc.state.liveSalvage[key] = {
    card: {...(known.get(key) || {}), ...card, quantity: 1},
    reason: "Picked up on 2026-08-28; no deck has claimed it."
  };
  const rec = doc.state.owned[key] || (doc.state.owned[key] = {inHand: 0, ordered: 0});
  if (!rec.inHand) rec.inHand = 1;
  addedYard.push(card.name);
}
// found/boughtQuantities stay derived from owned, as they have since the audit.
doc.state.found = {};
doc.state.boughtQuantities = {};
for (const [key, rec] of Object.entries(doc.state.owned)) {
  doc.state.boughtQuantities[key] = rec.inHand;
  if (rec.inHand > 0) doc.state.found[key] = true;
}

/* ---------- where each one could go ---------- */
const owned = Slot.normalizeOwned(doc.state);
const decks = Object.entries(doc.state.compareSelections).map(([, id]) => id).filter(Boolean);
/* A deck's colors are its commander's, and the commander is the card in the commander
   slot -- read from the composed deck rather than a field on the plan, which does not
   carry one. Getting this wrong is silent: an empty identity rejects every card. */
const identityOf = (slots) => {
  const seat = slots.find((s) => s.type === "Commander" && s.pick);
  const card = seat && known.get(Slot.ownedKey(seat.pick.name));
  return (card && card.colorIdentity) || [];
};
const MIN_FIT = Number(process.env.MIN_FIT || 6);
const placements = [];
doc.state.manualCards ||= {};

for (const id of decks) {
  const held = doc.state.deckHolds[id] || {};
  const slots = Slot.deckSlots(plans[id], doc.state.buySelections[id], {owned});
  const identity = identityOf(slots);
  if (!identity.length) throw new Error(`no commander found for ${id}; refusing to offer cards blind`);
  const already = new Set((doc.state.manualCards[id] || []).map((m) => Slot.ownedKey(m.name)));
  const perSlot = new Map();

  for (const card of incoming) {
    const key = Slot.ownedKey(card.name);
    if (BASICS.has(key) || already.has(key)) continue;
    if (!(card.colorIdentity || []).every((c) => identity.indexOf(c) >= 0)) continue;
    if (card.legalities && card.legalities.commander === "not_legal") continue;

    let best = null;
    for (const slot of slots) {
      if (!slot.pick || slot.type === "Commander") continue;
      // The slot has to actually need a card: one you are holding is not up for swapping.
      const hold = held[Slot.ownedKey(slot.pick.name)];
      if (hold && (hold.inHand || 0) > 0) continue;
      if (slot.rungs.some((r) => Slot.ownedKey(r.name) === key)) continue;   // already offered here
      const shell = known.get(Slot.ownedKey(slot.pick.name));
      if (!shell) continue;
      const target = {type: Slot.cardType(shell), manaValue: Slot.manaValueOf(shell), roles: Slot.cardRoles(shell)};
      const fit = Slot.slotFit(card, target);
      if (fit.score < MIN_FIT) continue;
      if (target.roles.length && !fit.shared.length) continue;
      if (!best || fit.score > best.fit.score) best = {slot, fit};
    }
    if (!best) continue;
    /* Each card picks its own best slot independently, so a deck with one instant slot
       left to fill collects every instant on the bench. Three is enough to choose from;
       the fourth-best alternative to a card you have not bought yet is not a decision
       anyone is making. The weakest is dropped, not the newest. */
    const onSlot = perSlot.get(best.slot.slotId) || [];
    if (onSlot.length >= 3 && best.fit.score <= onSlot[onSlot.length - 1].score) continue;

    const list = doc.state.manualCards[id] || (doc.state.manualCards[id] = []);
    list.push({
      id: `manual-${id}-${key}`,
      name: card.name,
      quantity: Math.max(1, Number(best.slot.quantity) || 1),
      manaCost: card.manaCost, typeLine: card.typeLine, oracleText: card.oracleText,
      keywords: card.keywords, colorIdentity: card.colorIdentity,
      commanderLegal: card.legalities.commander !== "not_legal",
      rarity: card.rarity, setName: card.setName, image: card.image,
      price: card.price, ceiling: card.price,
      tcgplayerUrl: card.tcgplayerUrl, gameChanger: false,
      category: "manual", stage: "Manual",
      replaces: best.slot.shellName,
      purpose: `Added by hand from the Salvage yard. Offered here because ${best.slot.pick.name} is not in your hands yet and this does the same job: ${best.fit.reasons.join(", ")}. Not simulated — measured fields read n/a.`,
      why: "n/a — added by hand, not measured by the simulation.",
      whyPrimary: "n/a — added by hand, not measured by the simulation.",
      whereToBuy: "Already owned · in the Salvage yard",
      source: "salvage",
      addedAt: new Date().toISOString()
    });
    const row = {id, card: card.name, slot: best.slot.shellName, slotId: best.slot.slotId,
      was: best.slot.pick.name, score: best.fit.score, why: best.fit.reasons.join(" · ")};
    placements.push(row);
    const bucket = perSlot.get(best.slot.slotId) || [];
    bucket.push(row);
    bucket.sort((a, b) => b.score - a.score);
    if (bucket.length > 3) {
      const cut = bucket.pop();
      const i = placements.indexOf(cut);
      if (i >= 0) placements.splice(i, 1);
      const j = list.findIndex((m) => m.name === cut.card);
      if (j >= 0) list.splice(j, 1);
    }
    perSlot.set(best.slot.slotId, bucket);
  }
}

fs.writeFileSync(STATE, JSON.stringify(doc, null, 1) + "\n");
console.log(`yard: +${addedYard.length} cards (now ${Object.keys(doc.state.liveSalvage).length})`);
if (enriched.length) console.log(`filled in metadata for: ${enriched.join(", ")}`);
if (bumpedBasics.length) console.log(`basics bumped: ${bumpedBasics.join(", ")}`);
console.log(`\nplaced on ${placements.length} slots:`);
placements.sort((a, b) => a.id.localeCompare(b.id) || b.score - a.score)
  .forEach((p) => console.log(`  ${p.id}  ${p.card.padEnd(24)} -> ${p.slot.padEnd(26)} (currently ${p.was}, fit ${p.score}: ${p.why})`));
const placedNames = new Set(placements.map((p) => p.card));
const unplaced = incoming.filter((c) => !BASICS.has(Slot.ownedKey(c.name)) && !placedNames.has(c.name));
console.log(`\non the bench but fitting no slot: ${unplaced.length}`);
unplaced.forEach((c) => console.log(`  ${c.name.padEnd(24)} ${c.typeLine} ${JSON.stringify(c.colorIdentity)}`));
