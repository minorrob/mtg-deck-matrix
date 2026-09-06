/**
 * Trades one basic land in a variant's starting shell for a real card.
 *
 * WHY THIS EXISTS. A basic-land slot is one slot carrying a quantity, so "eleven
 * Mountains and a Command Tower" cannot be expressed on a twelve-Mountain slot by
 * choosing a rung -- the choice is per slot, and the slot is the whole pile. The
 * handoff workbook asked for exactly that on two decks, which is why the import
 * reported a one-card gap on Obuun and Quintorius rather than papering over it.
 * The only honest fix is to change the shell: shrink the basic by one and give the
 * new card a slot of its own.
 *
 * WHAT IT TOUCHES.
 *   data/buy-plans.json     the variant's startingShell -- the array every rung
 *                           composes from. The legacy `baseCards` list is left
 *                           alone: on both these variants it long ago stopped
 *                           tracking the shell (5o shares no ids with it at all),
 *                           so writing into it would describe a build nobody has.
 *   data/rung-lists.json    the pinned hundred for all four measured rungs, since
 *                           a shell card is in every one of them.
 *   data/active-state.json  the shell id lists behind Active and Assigned, so the
 *                           new slot is filled rather than showing up as a hole.
 *                           Deck holds are trimmed to the new basic count.
 *
 * WHAT IT DOES NOT TOUCH. Nothing chooses cards here. The swap is stated below,
 * card for card, because it came from a reviewed workbook -- not from an
 * optimizer, which would rewrite the other ninety-nine slots as well.
 *
 * The published scores still describe the old hundred after this runs. Re-measure
 * with tools/sim/remeasure-variant.mjs before shipping.
 *
 * Run: node tools/reshell-basic-swap.mjs [--write]
 */
import fs from "node:fs";
import {createRequire} from "node:module";
const require = createRequire(import.meta.url);
const Lineup = require("../lineup-model.js");

const SWAPS = [
  {
    variantId: "3o",
    basic: "Mountain",
    add: "Command Tower",
    why: "The handoff workbook runs Obuun on eleven Mountains and a Command Tower. A three-color deck fixes its commander's cost better with the Tower than with a twelfth red source."
  },
  {
    variantId: "5o",
    basic: "Mountain",
    add: "Tectonic Reformation",
    why: "The handoff workbook runs Quintorius on five Mountains and Tectonic Reformation, which turns the lands drawn late into cards and feeds the graveyard the deck is built on."
  }
];

const args = new Set(process.argv.slice(2));
const write = args.has("--write");
const url = (name) => new URL(`../data/${name}`, import.meta.url);
const read = (name) => JSON.parse(fs.readFileSync(url(name), "utf8"));

const buyPlans = read("buy-plans.json");
const rungLists = read("rung-lists.json");
const state = read("active-state.json");
const catalog = read("cards.json").cards;

const byName = new Map(catalog.map((card) => [Lineup.normalizeName(card.name), card]));
const slug = (value) => String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const key = (name) => Lineup.normalizeName(name);

let failed = false;
const fail = (message) => { console.error(`  ERROR ${message}`); failed = true; };

for (const swap of SWAPS) {
  const plan = buyPlans.plans[swap.variantId];
  console.log(`${swap.variantId}  ${plan.deckName} — ${swap.basic} −1, ${swap.add} +1`);

  /* ---------- the shell ---------- */
  const basic = plan.startingShell.find((item) => key(item.name) === key(swap.basic));
  if (!basic) { fail(`${swap.variantId} has no ${swap.basic} in its starting shell`); continue; }
  if (basic.quantity < 2) { fail(`${swap.variantId} runs only ${basic.quantity} ${swap.basic}; taking one leaves an empty slot`); continue; }
  if (plan.startingShell.some((item) => key(item.name) === key(swap.add))) {
    fail(`${swap.variantId} already runs ${swap.add}; adding a second copy would make the deck illegal`);
    continue;
  }
  const fact = byName.get(key(swap.add));
  if (!fact) { fail(`${swap.add} is not in data/cards.json, so the shell would carry a card with no printing behind it`); continue; }

  basic.quantity -= 1;
  const entry = {
    id: `shell-${swap.variantId}-${slug(swap.add)}`,
    name: fact.name,
    quantity: 1,
    manaCost: fact.manaCost || "",
    typeLine: fact.typeLine || "",
    tags: [],
    isCommander: false,
    gameChanger: Boolean(fact.gameChanger),
    isFlexibleSlot: false,
    image: fact.image || "",
    oracleText: fact.oracleText || "",
    keywords: fact.keywords || [],
    colorIdentity: fact.colorIdentity || [],
    tcgplayerUrl: fact.tcgplayerUrl || "",
    commanderLegal: (fact.legalities?.commander || "legal") === "legal",
    rarity: fact.rarity || "",
    setName: fact.setName || "",
    price: Number(fact.price ?? 0),
    priceUpdated: String(fact.priceUpdated || "").slice(0, 10),
    why: swap.why
  };
  plan.startingShell.splice(plan.startingShell.indexOf(basic) + 1, 0, entry);
  plan.startingShellSource = `${plan.startingShellSource || "Custom shell"} · ${swap.basic} traded for ${swap.add} on the handoff workbook's reading`;

  const shellTotal = plan.startingShell.reduce((n, item) => n + Math.max(1, Number(item.quantity || 1)), 0);
  if (shellTotal !== 100) fail(`${swap.variantId} shell now totals ${shellTotal}, not 100`);
  console.log(`  shell     ${swap.basic} x${basic.quantity} · ${entry.id} · ${shellTotal} cards`);

  /* ---------- the pinned rungs ---------- */
  const rungs = rungLists.variants[swap.variantId];
  if (!rungs) fail(`${swap.variantId} has no pinned rungs`);
  for (const [rungName, list] of Object.entries(rungs || {})) {
    const pinned = list.find((card) => key(card.name) === key(swap.basic));
    if (!pinned || pinned.quantity < 2) { fail(`${swap.variantId} ${rungName}: no ${swap.basic} to take from`); continue; }
    if (list.some((card) => key(card.name) === key(swap.add))) { fail(`${swap.variantId} ${rungName} already pins ${swap.add}`); continue; }
    pinned.quantity -= 1;
    list.splice(list.indexOf(pinned) + 1, 0, {name: fact.name, quantity: 1});
    const total = list.reduce((n, card) => n + Math.max(1, Number(card.quantity || 1)), 0);
    if (total !== 100) fail(`${swap.variantId} ${rungName}: pinned list now totals ${total}`);
  }
  console.log(`  rungs     ${Object.keys(rungs || {}).join(", ")} re-pinned`);

  /* ---------- what the deck is actually holding ---------- */
  for (const [label, book] of [["Active", state.state.buySelections], ["Assigned", state.state.assignedSelections]]) {
    const selection = book?.[swap.variantId];
    if (!selection) { fail(`${swap.variantId} has no ${label} selection to add the slot to`); continue; }
    if (!selection.shell.includes(entry.id)) selection.shell.push(entry.id);
    // Hand-added cards are candidates the state carries, not the plan, so a count
    // taken from the plan alone reads every one of them as an empty slot.
    const graft = {...plan, manual: (state.state.manualCards?.[swap.variantId] || []).map((card) => ({...card}))};
    const held = Lineup.quantity(graft, Lineup.canonicalizeSelection(graft, selection));
    if (held !== 100) fail(`${swap.variantId} ${label} now holds ${held} cards, not 100`);
  }

  // The basic is a pile the deck box physically holds, so its recorded count has
  // to come down with the slot -- otherwise the shop reads a twelfth Mountain as
  // spoken for by a deck that only wants eleven.
  const hold = state.state.deckHolds?.[swap.variantId]?.[slug(swap.basic)];
  if (hold && hold.inHand > basic.quantity) {
    console.log(`  in the box  ${swap.basic} ${hold.inHand} → ${basic.quantity}`);
    hold.inHand = basic.quantity;
  }
  console.log(`  active    both selections carry the new slot`);
}

if (failed) { console.error("\nNothing was written."); process.exit(1); }

if (!write) { console.log("\nDry run. Pass --write to save."); process.exit(0); }
fs.writeFileSync(url("buy-plans.json"), `${JSON.stringify(buyPlans, null, 2)}\n`);
fs.writeFileSync(url("rung-lists.json"), `${JSON.stringify(rungLists, null, 2)}\n`);
// active-state.json ships at one-space indent; re-indenting it would bury a
// three-line change in a half-million-line diff.
fs.writeFileSync(url("active-state.json"), `${JSON.stringify(state, null, 1)}\n`);
console.log("\nWritten: data/buy-plans.json, data/rung-lists.json, data/active-state.json");
console.log("Next:    node tools/sim/remeasure-variant.mjs --variant 3o,5o --write");
