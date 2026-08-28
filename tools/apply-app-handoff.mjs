/**
 * Imports the "App Assignment Handoff" workbook into data/active-state.json.
 *
 * The workbook is one row per (slot, choice type) across the six live decks: an Active
 * card, an Assigned card that on first import is the same card, and up to five
 * alternatives (Tuned, Enhance, Max, Fun, Manual). It is a reviewed rebuild, not a
 * re-export of what the app already holds -- most slots keep their card, but a hundred or
 * so change -- so the import replaces the six Active hundreds and seeds Assigned to match.
 *
 * HOW A WORKBOOK SLOT FINDS AN APP SLOT. The workbook's own slotKey (d1-s001) is its
 * numbering, not the app's, and the app anchors a slot to its shell card. The join is the
 * workbook's "Previous Planned Card": the card the app currently has in that slot. That
 * lands 471 of 474 outright; the rest fall back to the card's own name, and anything still
 * unplaced is reported rather than guessed at.
 *
 * A CARD THE PLAN CANNOT OFFER becomes a hand-added candidate on the joined slot, which is
 * the mechanism the app already uses for exactly this. Hand-added cards are alternatives
 * ON a slot, never extra slots, so the deck stays at a hundred by construction.
 *
 * WHAT IS NOT TOUCHED. Ownership, paid prices, which box holds which copy, the bench,
 * comments and game logs are the user's own record of the physical world and survive
 * untouched. Only what each slot holds, and what it was recommended, are rewritten.
 *
 * Rugged Highlands stays out of Atraxa: it is outside that commander's colour identity,
 * the workbook rejects it, and a deck holding it loses a rules check.
 *
 * Run: node tools/apply-app-handoff.mjs <choices.csv> <slots.csv> [--write]
 */
import fs from "node:fs";
import {createRequire} from "node:module";
const require = createRequire(import.meta.url);
const Slot = require("../slot-model.js");
const Lineup = require("../lineup-model.js");

const STATE = new URL("../data/active-state.json", import.meta.url);
const doc = JSON.parse(fs.readFileSync(STATE, "utf8"));
const plans = JSON.parse(fs.readFileSync(new URL("../data/buy-plans.json", import.meta.url), "utf8")).plans;
const catalog = JSON.parse(fs.readFileSync(new URL("../data/cards.json", import.meta.url), "utf8")).cards;

const VARIANT = {Felothar: "1b", Atraxa: "2c", Obuun: "3o", Roon: "4e", Quintorius: "5o", Danitha: "7e"};
const ALTERNATIVES = ["Tuned", "Enhance", "Max", "Fun", "Manual"];

/* A hand-rolled reader rather than a dependency: the only quoting the sheet ever produces
   is a comma inside a card name or a rationale. */
function readCsv(text) {
  const rows = []; let row = [], cell = "", quoted = false;
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
  return rows.filter((r) => r.some((v) => v.trim()))
    .map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] || "").trim()])));
}

const choices = readCsv(fs.readFileSync(process.argv[2], "utf8"));
const sheetSlots = readCsv(fs.readFileSync(process.argv[3], "utf8"));
const write = process.argv.includes("--write");

const byName = new Map();
for (const card of catalog) {
  byName.set(Slot.ownedKey(card.name), card);
  for (const face of card.name.split(" // ")) {
    const key = Slot.ownedKey(face);
    if (!byName.has(key)) byName.set(key, card);
  }
}
const factOf = (name) => byName.get(Slot.ownedKey(name)) || null;

/* Graft the hand-added cards already in the state, the way the app does at load, so a slot
   the audit filled by hand is still reachable while this import decides what it holds. */
function graft(id) {
  const list = doc.state.manualCards[id] || [];
  return list.length ? {...plans[id], manual: list.map((c) => ({...c}))} : plans[id];
}

const report = [];
const added = [];
const refused = [];
const unplaced = [];

for (const [deck, vid] of Object.entries(VARIANT)) {
  const rows = sheetSlots.filter((r) => r["Deck Name"] === deck);
  const commander = (rows.find((r) => r["Commander Slot?"] === "True") || {}).Commander || "";
  const identity = new Set(((factOf(commander) || {}).colorIdentity) || []);
  if (!identity.size) throw new Error(`${vid}: no commander colours for ${commander || deck}`);

  /* Pass one: join every workbook slot to an app slot by the card the app has there. A
     slot can hold several copies of a name, so the app slots are held as a queue per name
     and consumed, which keeps two Forest slots from both claiming the same workbook row. */
  const appSlots = Slot.deckSlots(graft(vid), doc.state.buySelections[vid] || {}, {});
  const queue = new Map();
  appSlots.forEach((s) => {
    if (!s.pick) return;
    const k = Slot.ownedKey(s.pick.name);
    if (!queue.has(k)) queue.set(k, []);
    queue.get(k).push(s);
  });
  const taken = new Set();
  const pairs = [];
  const spare = [];
  for (const row of rows) {
    const prev = row["Previous Planned Card"] || row["Active Card"];
    const list = queue.get(Slot.ownedKey(prev)) || [];
    const seat = list.find((s) => !taken.has(s.slotId));
    if (seat) { taken.add(seat.slotId); pairs.push({row, seat}); } else spare.push(row);
  }
  // Anything left over takes an app slot nothing has claimed, in sheet order.
  const free = appSlots.filter((s) => !taken.has(s.slotId));
  spare.forEach((row) => {
    const seat = free.shift();
    if (seat) { taken.add(seat.slotId); pairs.push({row, seat}); }
    else unplaced.push(`${vid} ${row["Slot Key"]} ${row["Active Card"]}`);
  });

  /* Pass two: make each joined slot hold its Active card, adding the card by hand where
     the plan has no rung for it, and gather the alternatives the workbook names. */
  const manual = (doc.state.manualCards[vid] || []).filter((c) => !String(c.id).startsWith(`handoff-${vid}-`));
  const wanted = new Map();               // slotId -> card name the slot must end up holding
  for (const {row, seat} of pairs) {
    const active = row["Active Card"];
    if (!active) continue;
    wanted.set(seat.slotId, active);
    const names = [active, ...ALTERNATIVES.map((t) => row[`${t} Card`]).filter(Boolean)];
    for (const name of new Set(names)) {
      const fact = factOf(name);
      if (!fact) { refused.push({vid, name, why: "no card by that name in the catalog"}); continue; }
      const ci = fact.colorIdentity || [];
      if (!ci.every((c) => identity.has(c))) {
        refused.push({vid, name, why: `colour identity ${ci.join("") || "colourless"} is outside ${commander}'s`});
        continue;
      }
      // Already a rung on this slot? Then nothing to add -- the plan can serve it.
      if ((seat.rungs || []).some((r) => Slot.ownedKey(r.name) === Slot.ownedKey(name))) continue;
      if (manual.some((c) => Slot.ownedKey(c.name) === Slot.ownedKey(name)
        && String(c.replaces || "") === seat.shellName)) continue;
      manual.push({
        id: `handoff-${vid}-${Slot.ownedKey(name)}-${Slot.ownedKey(seat.shellName)}`,
        name: fact.name, quantity: Math.max(1, Number(row.Quantity) || 1),
        manaCost: fact.manaCost || "", typeLine: fact.typeLine || "",
        oracleText: fact.oracleText || "", keywords: fact.keywords || [],
        colorIdentity: ci, commanderLegal: true,
        rarity: fact.rarity || "common", setName: fact.setName || "",
        image: fact.image || "", price: Number(fact.price) || 0,
        ceiling: Number(fact.ceiling || fact.price) || 0,
        tcgplayerUrl: fact.tcgplayerUrl || row["Active TCGPlayer URL"] || "",
        gameChanger: false, category: "manual", stage: "Manual",
        replaces: seat.shellName,
        purpose: (row["Recommendation & Rationale"] || "From the reviewed handoff workbook.").slice(0, 400)
      });
      added.push(`${vid} ${fact.name}`);
    }
  }
  doc.state.manualCards[vid] = manual;

  /* Pass three: select. Every wanted card is now either a rung of its slot or a hand-added
     candidate on it, so this is a per-slot lookup and never a search. */
  const grafted = graft(vid);
  const selection = {};
  Lineup.ARRAY_KEYS.forEach((k) => { selection[k] = []; });
  const misses = [];
  Slot.deckSlots(grafted, {}, {}).forEach((slot) => {
    const want = wanted.get(slot.slotId);
    if (!want) return;
    const hit = (slot.rungs || []).find((r) => Slot.ownedKey(r.name) === Slot.ownedKey(want));
    if (!hit) { misses.push(`${slot.slotId} wants ${want}`); return; }
    (selection[hit.kind] ||= []).push(hit.entryId);
  });
  doc.state.buySelections[vid] = selection;
  // Active equals Assigned on first import, which is the workbook's whole contract.
  doc.state.assignedSelections = doc.state.assignedSelections || {};
  doc.state.assignedSelections[vid] = JSON.parse(JSON.stringify(selection));

  const composed = Slot.deckSlots(grafted, selection, {});
  const cards = composed.filter((s) => s.pick).reduce((n, s) => n + s.pick.quantity, 0);
  const holes = composed.filter((s) => !s.pick).length;
  report.push({deck, vid, cards, holes, misses, slots: rows.length});
}

doc.state.stateVersion = 4;
doc.exportedAt = new Date().toISOString();
if (write) fs.writeFileSync(STATE, JSON.stringify(doc, null, 1) + "\n");

report.forEach((r) => console.log(
  `${r.deck.padEnd(11)} ${r.vid}  ${r.cards} cards + ${r.holes} empty  (workbook ${r.slots} slots)` +
  (r.misses.length ? `  UNRESOLVED ${r.misses.length}: ${r.misses.slice(0, 3).join(", ")}` : "")));
console.log(`\nhand-added candidates created: ${added.length}`);
if (refused.length) {
  const seen = new Map();
  refused.forEach((r) => seen.set(`${r.vid} ${r.name}`, r.why));
  console.log(`refused ${seen.size}:`);
  [...seen].slice(0, 10).forEach(([k, why]) => console.log(`  ${k} - ${why}`));
}
if (unplaced.length) console.log(`\nno app slot for ${unplaced.length}: ${unplaced.slice(0, 5).join(", ")}`);
console.log(write ? "\nwritten to data/active-state.json" : "\n(dry run - pass --write to save)");
