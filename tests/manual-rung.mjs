// The Manual rung: cards the owner puts in a slot by hand, from Salvage or a pasted
// TCGplayer link.
//
// lineup-compliance.mjs cannot cover this. It composes data/buy-plans.json, and manual
// cards are deliberately NOT written there -- the buy catalog is regenerated from the
// build kit, so anything stored in it is lost on the next rebuild. They live in
// state.manualCards and app.js grafts them onto each plan at runtime. So the invariant
// that matters -- a hand-added card is one more choice inside a slot, and choosing it
// leaves the deck at a hundred cards -- has to be checked against the grafted plan,
// which is what this does.

import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {readFile} from "node:fs/promises";

const require = createRequire(import.meta.url);
const Lineup = require("../lineup-model.js");
const Slot = require("../slot-model.js");
const buyPlans = JSON.parse(await readFile(new URL("../data/buy-plans.json", import.meta.url), "utf8"));
const cards = JSON.parse(await readFile(new URL("../data/cards.json", import.meta.url), "utf8"));
const activeState = JSON.parse(await readFile(new URL("../data/active-state.json", import.meta.url), "utf8"));
const appSource = await readFile(new URL("../app.js", import.meta.url), "utf8");

const audited = new Map(cards.cards.map((card) => [Lineup.normalizeName(card.name), card]));
const manualCards = activeState.state?.manualCards || {};
const variantIds = Object.keys(manualCards);
let checks = 0;
const ok = (name, run) => { run(); checks += 1; console.log(`  ok  ${name}`); };

// The same graft app.js applies after every catalog rebuild.
const grafted = (variantId) => ({...buyPlans.plans[variantId], manual: manualCards[variantId].map((card) => ({...card}))});

ok("the seeded options are filed against real variants", () => {
  assert.ok(variantIds.length >= 5, `expected the seeded five decks, found ${variantIds.length}`);
  for (const id of variantIds) assert.ok(buyPlans.plans[id], `${id} has manual cards but no buy plan`);
});

ok("data/buy-plans.json carries no manual cards of its own", () => {
  // If they ever land here they are lost on the next rebuild of the buy catalog,
  // which is the durability problem this rung was built to avoid.
  const leaked = Object.entries(buyPlans.plans).filter(([, plan]) => (plan.manual || []).length);
  assert.equal(leaked.length, 0, `manual cards written into buy-plans.json: ${leaked.map(([id]) => id).join(", ")}`);
});

ok("every hand-added card is legal in the deck it was added to", () => {
  for (const id of variantIds) {
    const plan = buyPlans.plans[id];
    const commander = (plan.startingShell || []).find((card) => card.isCommander);
    const identity = new Set((commander?.colorIdentity || []).map((colour) => String(colour).toUpperCase()));
    for (const card of manualCards[id]) {
      assert.notEqual(card.commanderLegal, false, `${id}: ${card.name} is not Commander legal`);
      for (const colour of card.colorIdentity || []) {
        assert.ok(identity.has(String(colour).toUpperCase()),
          `${id}: ${card.name} has colour ${colour}, outside ${commander?.name}'s identity`);
      }
    }
  }
});

ok("each one names a card the deck actually runs, so it lands in a real slot", () => {
  for (const id of variantIds) {
    const model = Lineup.buildModel(grafted(id));
    for (const card of manualCards[id]) {
      const entry = model.entries.find((candidate) => candidate.item.name === card.name && candidate.kind === "manual");
      assert.ok(entry, `${id}: ${card.name} did not reach the lineup model`);
      assert.ok(entry.slotId, `${id}: ${card.name} resolved to no slot — its "replaces" (${card.replaces}) names nothing in the deck`);
      assert.ok(model.groups.has(entry.slotId),
        `${id}: ${card.name} sits in slot ${entry.slotId}, which the model does not know`);
      // The slot it joined is the one holding the card it names, not a slot of its own.
      const roommates = model.groups.get(entry.slotId);
      assert.ok(roommates.length > 1,
        `${id}: ${card.name} opened a new slot instead of joining ${card.replaces}'s`);
    }
  }
});

ok("a manual card is an option, never a default — the hundred is unchanged by adding one", () => {
  for (const id of variantIds) {
    const bare = Lineup.quantity(buyPlans.plans[id], Lineup.defaultSelection(buyPlans.plans[id]));
    const withManual = Lineup.quantity(grafted(id), Lineup.defaultSelection(grafted(id)));
    assert.equal(bare, 100, `${id}: the plan itself no longer totals 100`);
    assert.equal(withManual, 100, `${id}: grafting manual options moved the default off 100 (${withManual})`);
  }
});

ok("choosing a manual card keeps the deck at a hundred cards", () => {
  for (const id of variantIds) {
    const plan = grafted(id);
    for (const card of manualCards[id]) {
      const model = Lineup.buildModel(plan);
      const entry = model.entries.find((candidate) => candidate.item.name === card.name && candidate.kind === "manual");
      const picked = Lineup.applyChoice(plan, Lineup.defaultSelection(plan), entry.id);
      assert.equal(Lineup.quantity(plan, picked), 100,
        `${id}: picking ${card.name} leaves ${Lineup.quantity(plan, picked)} cards, not 100`);
      assert.ok(Lineup.selectedEntries(plan, picked).some((candidate) => candidate.id === entry.id),
        `${id}: ${card.name} could not actually be selected`);
    }
  }
});

ok("every hand-added card has somewhere to hand its slot back to", () => {
  // A card can only leave a slot if something the same size can take it. Without this
  // the return button would be offered on a card that cannot actually go anywhere.
  for (const id of variantIds) {
    const plan = grafted(id);
    const model = Lineup.buildModel(plan);
    for (const card of manualCards[id]) {
      const entry = model.entries.find((candidate) => candidate.item.name === card.name && candidate.kind === "manual");
      const sameSize = (model.groups.get(entry.slotId) || [])
        .filter((candidate) => candidate.id !== entry.id
          && Number(candidate.item.quantity || 1) === Number(entry.item.quantity || 1));
      assert.ok(sameSize.length, `${id}: ${card.name} has no same-sized card to hand slot ${entry.slotId} back to`);
    }
  }
});

ok("sending one back leaves the deck at a hundred cards", () => {
  // The order the app uses: hand the slot back first, then drop the card. A deck that
  // loses a card without gaining one is ninety-nine, and the tally would say so.
  for (const id of variantIds) {
    for (const card of manualCards[id]) {
      const plan = grafted(id);
      const model = Lineup.buildModel(plan);
      const entry = model.entries.find((candidate) => candidate.item.name === card.name && candidate.kind === "manual");
      const picked = Lineup.applyChoice(plan, Lineup.defaultSelection(plan), entry.id);
      const fallback = (model.groups.get(entry.slotId) || [])
        .filter((candidate) => candidate.id !== entry.id
          && Number(candidate.item.quantity || 1) === Number(entry.item.quantity || 1))[0];
      const handedBack = Lineup.applyChoice(plan, picked, fallback.id);
      assert.equal(Lineup.quantity(plan, handedBack), 100,
        `${id}: handing ${card.name}'s slot back leaves ${Lineup.quantity(plan, handedBack)} cards`);

      // And then the card itself goes, which is a plan without it at all.
      const without = {...plan, manual: (plan.manual || []).filter((other) => other.name !== card.name)};
      assert.equal(Lineup.quantity(without, Lineup.defaultSelection(without)), 100,
        `${id}: the deck is not a hundred once ${card.name} has left it`);
    }
  }
});

ok("the return control is read before the pick that sits under it", () => {
  // Match the handler expressions, not any mention -- the comment above the return
  // branch names the pick branch, and an indexOf for the bare selector finds that.
  const returnAt = appSource.indexOf('closest("[data-dp-manual-return]")');
  const pickAt = appSource.indexOf('closest("[data-dp-pick]")');
  assert.ok(returnAt > 0 && pickAt > 0, "both handlers must exist");
  assert.ok(returnAt < pickAt,
    "the return button overlaps its tile, so its handler has to run before the tile's pick handler");
  assert.match(appSource, /function returnManualCard\(slotId, entryId\)/);
  // Ownership is read, never invented: the yard means cards you own.
  assert.match(appSource, /const owned = card\.source === "salvage" \|\| Boolean\(state\.found\?\.\[key\]\)/,
    "a card that was never bought must not be put on the bench");
});

ok("the measured rungs are untouched by what was added by hand", () => {
  // Manual is not in RUNG_CHAIN, so composing Base, Tuned, Fun or Max must return the
  // same hundred whether or not the deck carries hand-added options.
  for (const id of variantIds) {
    for (const rung of ["base", "tuned", "fun", "max"]) {
      const bare = Slot.selectionSignature(Slot.selectionForRung(buyPlans.plans[id], rung));
      const withManual = Slot.selectionSignature(Slot.selectionForRung(grafted(id), rung));
      assert.equal(withManual, bare, `${id}: the ${rung} rung changed once manual options were grafted on`);
    }
  }
});

ok("nothing hand-added is filed against a commander", () => {
  // Picking a manual card on the commander slot left a hundred cards with no commander
  // among them. The box is no longer offered there; this keeps the data honest too.
  for (const id of variantIds) {
    const commander = (buyPlans.plans[id].startingShell || []).find((card) => card.isCommander);
    if (!commander) continue;
    for (const card of manualCards[id]) {
      assert.notEqual(card.replaces, commander.name,
        `${id}: ${card.name} is filed against the commander ${commander.name}`);
    }
  }
  assert.match(appSource, /if \(slot\?\.type === "Commander"\) return say\(/,
    "submitManualCard must refuse the commander slot even if the panel is stale");
});

ok("the loose pool is owned copies no box is holding, and nothing else", () => {
  // Two guards, and both matter. Without the ownership read the box would offer cards
  // that have not been bought; without the committed count it would offer the same
  // physical copy to two decks at once.
  assert.match(appSource, /const held = Slot\.ownedCount\(owned, entry\.name\)\.inHand \|\| 0;/,
    "a card must be owned before it is offered as loose");
  assert.match(appSource, /if \(held <= \(committed\.get\(key\) \|\| 0\)\) return;/,
    "a copy already in a ticked box must not be offered to another deck");
  assert.match(appSource, /if \(mine\.has\(key\)\) return;/,
    "a card this deck already reaches through its own slots must not be offered again");
});

ok("Manual sorts last on a slot, after every measured rung", () => {
  assert.equal(Slot.RUNG_ORDER[Slot.RUNG_ORDER.length - 1], "manual",
    `manual must sort last; RUNG_ORDER is ${Slot.RUNG_ORDER.join(", ")}`);
  assert.equal(Slot.RUNG_LABEL.manual, "Manual");
});

ok("hand-added cards are stored in state, not in the buy catalog", () => {
  assert.match(appSource, /state\.manualCards\[ctx\.deckId\] = list;/,
    "submitManualCard must write to state.manualCards");
  assert.doesNotMatch(appSource, /buyCatalog\.plans\[[^\]]+\]\.manual\.push/,
    "manual cards must never be pushed into the buy catalog, which is regenerated");
  assert.match(appSource, /function applyManualCards\(\)/, "the graft must survive a catalog rebuild");
});

const seeded = variantIds.reduce((sum, id) => sum + manualCards[id].length, 0);
console.log(`\n${checks} checks passed · ${seeded} hand-added options across ${variantIds.length} decks`);
