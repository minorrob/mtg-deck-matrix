import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {readFile} from "node:fs/promises";

const require = createRequire(import.meta.url);
const Lineup = require("../lineup-model.js");
const Slot = require("../slot-model.js");
const buyPlans = JSON.parse(await readFile(new URL("../data/buy-plans.json", import.meta.url), "utf8"));

const planIds = Object.keys(buyPlans.plans);
let checks = 0;
const ok = (label, fn) => { fn(); checks += 1; process.stdout.write(`  ok  ${label}\n`); };

/* ---------- price bands ---------- */
ok("price bands partition the number line with no gap or overlap", () => {
  const cases = [
    [0, "<$1"], [0.99, "<$1"], [1, "$1"], [1.99, "$1"], [2, "$2"], [5.99, "$5"],
    [6, "$6"], [6.99, "$6"], [7, "$7-15"], [14.99, "$7-15"], [15, "$15+"], [534.39, "$15+"]
  ];
  cases.forEach(([price, band]) => assert.equal(Slot.priceBand(price), band, `${price} -> ${band}`));
  assert.equal(Slot.priceBand(null), null);
  assert.equal(Slot.priceBand("nonsense"), null);
});

ok("every band a price can produce is one the filter offers", () => {
  for (let cents = 0; cents <= 2000; cents += 7) {
    const band = Slot.priceBand(cents / 100);
    assert.ok(Slot.PRICE_BANDS.includes(band), `${cents / 100} produced ${band}`);
  }
});

/* ---------- ownership migration ---------- */
ok("legacy found + boughtQuantities migrate without losing a card", () => {
  const owned = Slot.normalizeOwned({
    found: {"sol-ring": true, "forest": true, "dead-key": false},
    boughtQuantities: {"forest": 11, "swamp": 4}
  });
  assert.deepEqual(owned["sol-ring"], {inHand: 1, ordered: 0}, "found with no count means one copy");
  assert.deepEqual(owned["forest"], {inHand: 11, ordered: 0}, "found plus a count keeps the count");
  assert.deepEqual(owned["swamp"], {inHand: 4, ordered: 0}, "a count with no found flag still counts");
  assert.ok(!owned["dead-key"], "found:false is not ownership");
});

ok("an already-migrated state round-trips unchanged", () => {
  const start = {owned: {"forest": {inHand: 3, ordered: 8}}};
  assert.deepEqual(Slot.normalizeOwned(start).forest, {inHand: 3, ordered: 8});
});

ok("acquisition separates money spent from a card in hand", () => {
  const A = Slot.ACQUISITION;
  const owned = {
    "a": {inHand: 0, ordered: 0}, "b": {inHand: 0, ordered: 1},
    "c": {inHand: 1, ordered: 0}, "d": {inHand: 4, ordered: 0}, "e": {inHand: 2, ordered: 3}
  };
  assert.equal(Slot.acquisitionOf(owned, "a", 1), A.NONE);
  assert.equal(Slot.acquisitionOf(owned, "b", 1), A.ORDERED, "ordered is not in hand");
  assert.equal(Slot.acquisitionOf(owned, "c", 1), A.HAND);
  assert.equal(Slot.acquisitionOf(owned, "d", 11), A.PARTIAL, "4 of 11 Forests is partial");
  assert.equal(Slot.acquisitionOf(owned, "e", 11), A.PARTIAL);
  assert.equal(Slot.acquisitionOf(owned, "missing", 1), A.NONE);
});

/* ---------- rung folding ---------- */
ok("all twelve storage keys fold onto a rung the UI can render", () => {
  const shown = new Set(Slot.RUNG_ORDER.concat(["alt", "transfer"]));
  Lineup.ARRAY_KEYS.concat(["required", "transfer"]).forEach((key) => {
    assert.ok(shown.has(Slot.rungOf(key)), `${key} folded to ${Slot.rungOf(key)}`);
  });
});

/* ---------- the projection, against every real plan ---------- */
ok(`every one of the ${planIds.length} plans projects to slots with one pick each`, () => {
  planIds.forEach((id) => {
    const plan = buyPlans.plans[id];
    const selection = Lineup.defaultSelection(plan);
    const rows = Slot.deckSlots(plan, selection);
    assert.ok(rows.length > 0, `${id} produced no slots`);
    rows.forEach((row) => {
      const picked = row.rungs.filter((r) => r.selected);
      assert.ok(picked.length <= 1, `${id} slot ${row.slotId} has ${picked.length} picks`);
      assert.equal(row.filled, picked.length === 1);
      if (row.pick) {
        assert.equal(row.pick.entryId, picked[0].entryId);
        assert.ok(Slot.RUNG_ORDER.concat(["alt", "transfer"]).includes(row.pick.rung));
      }
      assert.ok(Slot.TYPE_ORDER.includes(row.type), `${id} slot ${row.slotId} type ${row.type}`);
    });
  });
});

ok("slot quantities reconcile with the lineup model's own count", () => {
  planIds.forEach((id) => {
    const plan = buyPlans.plans[id];
    const selection = Lineup.defaultSelection(plan);
    const rows = Slot.deckSlots(plan, selection);
    const mine = rows.filter((r) => r.pick).reduce((sum, r) => sum + r.pick.quantity, 0);
    assert.equal(mine, Lineup.quantity(plan, selection), `${id} slot total disagrees with Lineup.quantity`);
  });
});

ok("a slot always carries its Base rung, so the thesis is never lost", () => {
  let withBase = 0, total = 0;
  planIds.forEach((id) => {
    const plan = buyPlans.plans[id];
    const rows = Slot.deckSlots(plan, Lineup.defaultSelection(plan));
    rows.forEach((row) => {
      total += 1;
      if (row.rungs.some((r) => r.rung === "base")) withBase += 1;
    });
  });
  assert.ok(withBase / total > 0.99, `only ${withBase}/${total} slots kept a Base rung`);
});

ok("every rung answers with its own field, and Base speaks for the slot", () => {
  const item = {
    purpose: "the slot's job", whyOptional: "the enhance reason",
    maxReason: "the max reason", name: "X"
  };
  assert.equal(Slot.whyFor("base", item), "the slot's job");
  assert.equal(Slot.whyFor("enhance", item), "the enhance reason");
  assert.equal(Slot.whyFor("max", item), "the max reason");
  assert.equal(Slot.whyFor("tuned", item), "the slot's job");
  assert.equal(Slot.whyFor("max", {purpose: "fallback"}), "fallback", "falls back rather than going blank");
});

/* ---------- the shop re-key ---------- */
ok("shop rows merge one card across decks and sum its quantity", () => {
  const decks = ["1b", "3o"].filter((id) => buyPlans.plans[id]).map((id) => ({
    id, slots: Slot.deckSlots(buyPlans.plans[id], Lineup.defaultSelection(buyPlans.plans[id]))
  }));
  assert.ok(decks.length === 2, "needs two real plans to test the merge");
  const rows = Slot.shopRows(decks, {});
  const keys = rows.map((r) => r.key);
  assert.equal(new Set(keys).size, keys.length, "a card appears at most once");

  const perDeck = decks.reduce((sum, d) => sum + d.slots.filter((s) => s.pick).reduce((n, s) => n + s.pick.quantity, 0), 0);
  const merged = rows.reduce((sum, r) => sum + r.quantity, 0);
  assert.equal(merged, perDeck, "merging must not lose or invent copies");

  const shared = rows.filter((r) => r.decks.length > 1);
  assert.ok(shared.length > 0, "two Commander decks should share at least a basic land");
  shared.forEach((r) => assert.ok(r.quantity >= 2, `${r.name} is in ${r.decks.length} decks but quantity ${r.quantity}`));
});

ok("ownership splits a shop row into in hand, ordered and still needed", () => {
  const decks = [{id: "1b", slots: [
    {pick: {name: "Forest", price: 0.1, ceiling: 0.2, quantity: 11, rung: "base"}, type: "Land", isBasic: true},
    {pick: {name: "Sol Ring", price: 1.2, ceiling: 1.5, quantity: 1, rung: "base"}, type: "Artifact", isBasic: false}
  ]}];
  const owned = {forest: {inHand: 4, ordered: 5}, "sol-ring": {inHand: 0, ordered: 1}};
  const rows = Slot.shopRows(decks, owned);
  const forest = rows.find((r) => r.name === "Forest");
  assert.deepEqual(
    {inHand: forest.inHand, ordered: forest.ordered, need: forest.need},
    {inHand: 4, ordered: 5, need: 2},
    "11 Forests: 4 here, 5 coming, 2 still to find"
  );
  const ring = rows.find((r) => r.name === "Sol Ring");
  assert.equal(ring.need, 0, "an ordered card is not still to buy");
  assert.equal(ring.acquisition, Slot.ACQUISITION.ORDERED, "but it is not in hand either");
});

ok("counts never exceed what the decks actually need", () => {
  const decks = [{id: "1b", slots: [{pick: {name: "Forest", price: 0.1, quantity: 2, rung: "base"}, type: "Land", isBasic: true}]}];
  const rows = Slot.shopRows(decks, {forest: {inHand: 40, ordered: 40}});
  assert.equal(rows[0].inHand, 2);
  assert.equal(rows[0].ordered, 0);
  assert.equal(rows[0].need, 0);
});

/* ---------- catalog fallbacks ---------- */
const cardsPayload = JSON.parse(await readFile(new URL("../data/cards.json", import.meta.url), "utf8"));
const cards = {};
(cardsPayload.cards || []).forEach((c) => { if (c && c.name) cards[Lineup.normalizeName(c.name)] = c; });

const activePayload = JSON.parse(await readFile(new URL("../data/active-state.json", import.meta.url), "utf8"));
const activeState = activePayload.state || activePayload;

ok("a starting-shell card with no price of its own falls back to the catalog", () => {
  // The gap shows on real selections, not on defaultSelection: a shipped shell card
  // often carries no price, so a deck built mostly of Base picks undercounts itself.
  let missingBefore = 0, missingAfter = 0, total = 0;
  Object.keys(activeState.buySelections || {}).forEach((id) => {
    const plan = buyPlans.plans[id];
    if (!plan) return;
    const sel = activeState.buySelections[id];
    Slot.deckSlots(plan, sel).forEach((r) => { if (r.pick) { total += 1; if (r.pick.price == null) missingBefore += 1; } });
    Slot.deckSlots(plan, sel, {cards}).forEach((r) => { if (r.pick && r.pick.price == null) missingAfter += 1; });
  });
  assert.ok(total > 0, "the shipped active state should carry real selections");
  assert.ok(missingBefore > 0, "the gap this guards against should exist in the data");
  assert.ok(missingAfter < missingBefore, `catalog fallback fixed nothing (${missingBefore} -> ${missingAfter})`);
  assert.ok(missingAfter / total < 0.08, `${missingAfter} of ${total} picks still have no price`);
  process.stdout.write(`      (unpriced picks: ${missingBefore} -> ${missingAfter} of ${total})\n`);
});

ok("a plan price of exactly zero is treated as missing, not as free", () => {
  const item = {name: "City of Traitors", price: 0};
  const withCatalog = {"city of traitors": {price: 534.39}};
  assert.equal(Slot.priceBand(0), "<$1", "a genuine zero still bands as the cheap drawer");
  const bare = Slot.deckSlots({startingShell: [{id: "x", name: "City of Traitors", price: 0}]}, {shell: ["x"]});
  assert.equal(bare[0].pick.price, null, "with no catalog, a zero price reads as unknown");
  const fixed = Slot.deckSlots({startingShell: [{id: "x", name: "City of Traitors", price: 0}]},
    {shell: ["x"]}, {cards: withCatalog});
  assert.equal(fixed[0].pick.price, 534.39, "the catalog answers instead");
  assert.equal(Slot.vendorSpot(fixed[0].pick.price), "Case", "and it shelves in the case, not the bulk bin");
});

ok("rationale reports whether it was authored or is just the card's rules text", () => {
  const authored = Slot.whySource("max", {maxReason: "because it is the best"}, cards);
  assert.equal(authored, "authored");
  const oracle = Slot.whySource("base", {name: "Sol Ring"}, cards);
  assert.equal(oracle, "oracle", "a shell card with no purpose falls back to oracle text");
  assert.equal(Slot.whySource("base", {name: "Not A Real Card At All"}, cards), "none");
  assert.equal(Slot.whyText("base", {name: "Not A Real Card At All"}, cards), "");
});

ok("Base rungs are overwhelmingly unauthored, which the UI must not hide", () => {
  let authored = 0, fallback = 0;
  planIds.forEach((id) => {
    const plan = buyPlans.plans[id];
    Slot.deckSlots(plan, Lineup.defaultSelection(plan), {cards}).forEach((row) => {
      const base = row.rungs.find((r) => r.rung === "base");
      if (!base) return;
      if (base.whySource === "authored") authored += 1; else fallback += 1;
    });
  });
  assert.ok(fallback > authored, "if this ever flips, the Base copy got written and the label can change");
  process.stdout.write(`      (Base rungs: ${authored} authored, ${fallback} falling back)\n`);
});

ok("where a card sits at the table follows straight from its price", () => {
  const cases = [[0, "Bulk bin"], [0.99, "Bulk bin"], [1, "Boxes"], [3.5, "Boxes"], [6.99, "Boxes"],
                 [7, "Binder"], [14.99, "Binder"], [15, "Case"], [534.39, "Case"]];
  cases.forEach(([price, spot]) => assert.equal(Slot.vendorSpot(price), spot, `${price} -> ${spot}`));
  assert.equal(Slot.vendorSpot(null), null, "an unpriced card has no shelf");
});

ok("every spot a price can produce is one the filter offers, and bands nest inside spots", () => {
  const seen = new Map();
  for (let cents = 0; cents <= 3000; cents += 13) {
    const price = cents / 100;
    const spot = Slot.vendorSpot(price);
    assert.ok(Slot.SPOTS.includes(spot), `${price} produced ${spot}`);
    const band = Slot.priceBand(price);
    if (!seen.has(band)) seen.set(band, spot);
    assert.equal(seen.get(band), spot, `band ${band} must map to exactly one spot`);
  }
  assert.equal(seen.size, Slot.PRICE_BANDS.length, "the sweep should reach every band");
});

/* ---------- the four measured builds ---------- */
const rungLists = JSON.parse(await readFile(new URL("../data/rung-lists.json", import.meta.url), "utf8"));
const RUNG_PIN = {base: "Base", tuned: "Tuned", fun: "Pod Fun", max: "Max"};

ok("the rung buttons are exactly the builds rung-lists.json pins", () => {
  assert.deepEqual(Slot.BUILD_RUNGS, ["base", "tuned", "fun", "max"]);
  // Enhance is a rung on a slot but never a whole deck, so it must not be offered
  // as one -- there is no measured Enhance hundred to switch a deck to.
  assert.ok(!Slot.BUILD_RUNGS.includes("enhance"), "Enhance is not a whole-deck build");
  const pinned = new Set(Object.values(rungLists.variants).flatMap((r) => Object.keys(r)));
  assert.deepEqual([...pinned].sort(), ["Base", "Max", "Pod Fun", "Tuned"]);
});

ok("Compare's three stages land on the right rungs", () => {
  assert.equal(Slot.rungForStage(1), "base");
  assert.equal(Slot.rungForStage(2), "tuned");
  assert.equal(Slot.rungForStage(3), "max");
  // Compare has no Fun stage; an absent or junk value must not invent one.
  assert.equal(Slot.rungForStage(undefined), "tuned");
  assert.equal(Slot.rungForStage("nonsense"), "tuned");
});

ok("applying a rung reproduces the exact hundred that rung was measured on", () => {
  let compared = 0;
  for (const [variantId, rungs] of Object.entries(rungLists.variants)) {
    const plan = buyPlans.plans[variantId];
    assert.ok(plan, `${variantId} is pinned but has no plan`);
    for (const rung of Slot.BUILD_RUNGS) {
      const measured = rungs[RUNG_PIN[rung]];
      if (!measured) continue;
      const selection = Slot.selectionForRung(plan, rung);
      const got = new Map();
      for (const entry of Lineup.selectedEntries(plan, selection)) {
        const key = entry.item.name.toLowerCase();
        got.set(key, (got.get(key) || 0) + Math.max(1, Number(entry.item.quantity || 1)));
      }
      const want = new Map();
      for (const card of measured) {
        const key = card.name.toLowerCase();
        want.set(key, (want.get(key) || 0) + Math.max(1, Number(card.quantity || 1)));
      }
      assert.equal(Lineup.quantity(plan, selection), 100, `${variantId} ${rung} must be 100 cards`);
      for (const [name, count] of want) {
        assert.equal(got.get(name) || 0, count, `${variantId} ${rung}: measured ${count} of ${name}`);
      }
      for (const [name, count] of got) {
        assert.equal(count, want.get(name) || 0, `${variantId} ${rung}: assembled ${name}, not in the measured list`);
      }
      compared += 1;
    }
  }
  assert.equal(compared, 200, `expected four rungs on fifty variants, compared ${compared}`);
});

ok("the highlight is derived, and the reader's click breaks a tie", () => {
  for (const variantId of ["1b", "2c", "5o"]) {
    const plan = buyPlans.plans[variantId];
    for (const rung of Slot.BUILD_RUNGS) {
      const selection = Slot.selectionForRung(plan, rung);
      // Asking for a rung always reports that rung back, even when another rung is
      // the same hundred -- otherwise clicking Max would light up Tuned.
      assert.equal(Slot.activeRung(plan, selection, rung), rung,
        `${variantId} at ${rung} should report ${rung} when ${rung} was asked for`);
      // With no preference, a tie resolves to the earliest rung, deterministically.
      const reported = Slot.activeRung(plan, selection, undefined);
      assert.ok(Slot.BUILD_RUNGS.includes(reported), `${variantId} ${rung} reported ${reported}`);
      assert.equal(Slot.selectionSignature(Slot.selectionForRung(plan, reported)),
        Slot.selectionSignature(selection), `${variantId}: a tie must resolve to an identical hundred`);
    }
  }
});

ok("a hand edit drops the highlight entirely", () => {
  const plan = buyPlans.plans["2a"];
  const tuned = Slot.selectionForRung(plan, "tuned");
  const moved = (plan.max || []).find((item) => !item.capabilityOption && !item.ownedOptional);
  assert.ok(moved, "2a should carry a measured Max card to move");
  assert.equal(Slot.activeRung(plan, Lineup.applyChoice(plan, tuned, moved.id), "tuned"), null,
    "one Max card on a Tuned deck is no longer any whole rung, whatever was clicked");
});

/**
 * KNOWN GAP, being closed separately: Max is supposed to be the Tier 3 build, and
 * for most variants it currently composes to byte-identical the Tuned hundred.
 *
 * The cause is a modelling decision, not a fact about the decks. The v2.4 sweep's
 * Max optimizer accepted no swap on 40 of 50 variants, and the Game Changers added
 * afterwards to fill those ladders carry `capabilityOption`, which by design keeps
 * them out of the composed rung so the pinned lists still match. Bracket 3 is
 * defined by being allowed up to three Game Changers, and 43 of 50 variants have
 * in-colour, priced ones sitting in their plan right now.
 *
 * This test pins the CURRENT state so the fix is visible as a diff rather than
 * slipping in unnoticed. When Max becomes a real Tier 3 build, this number drops
 * and the assertion below is what will say so.
 */
ok("the Max-equals-Tuned collapse is pinned until Max becomes a real Tier 3 build", () => {
  const collapsed = planIds.filter((id) => {
    const plan = buyPlans.plans[id];
    return Slot.selectionSignature(Slot.selectionForRung(plan, "max"))
        === Slot.selectionSignature(Slot.selectionForRung(plan, "tuned"));
  });
  assert.equal(collapsed.length, 40,
    `${collapsed.length} variants have Max identical to Tuned. If this dropped, the Tier 3 fix landed -- update this number. If it rose, a Max rung lost its content.`);
  // Whatever the rung composes to, the Tier 3 cards themselves are present as
  // offers on the ladder, which is what makes the fix a promotion rather than a hunt.
  const withOffers = planIds.filter((id) =>
    (buyPlans.plans[id].max || []).some((item) => item.capabilityOption && item.gameChanger));
  assert.equal(withOffers.length, 43, "43 variants carry in-colour Game Changers as offers");
});

ok("no variant may end up offered more Game Changers than Tier 3 allows", () => {
  // compliance-model.js caps Tier 3 at three. Four variants are currently offered
  // more, so this asserts the ceiling that the promotion step has to enforce.
  const over = planIds
    .map((id) => [id, (buyPlans.plans[id].max || []).filter((i) => i.capabilityOption && i.gameChanger).length])
    .filter(([, n]) => n > 3);
  assert.deepEqual(over.map(([id]) => id).sort(), ["4b", "5f", "6c", "9b"],
    "these are the variants whose offers exceed the Tier 3 limit of three and must be capped when promoted");
});

ok("a slot keeps its place in the list whatever rung is picked", () => {
  // Picking a rung used to re-file the row, because both the group and the sort
  // key were read off the picked card and a rung usually swaps in a different card
  // type. Thirteen of fourteen slots measured jumped group, up to 2,900px, which
  // read as the open pane slamming shut. Identity is the shell; only the contents
  // follow the pick.
  for (const variantId of ["1b", "2c", "5o"]) {
    const plan = buyPlans.plans[variantId];
    const place = (rung) => Slot.deckSlots(plan, Slot.selectionForRung(plan, rung), {owned: {}})
      .map((row, index) => `${index}:${row.slotId}:${row.type}`).join("|");
    const base = place("base");
    for (const rung of Slot.BUILD_RUNGS) {
      assert.equal(place(rung), base,
        `${variantId}: every slot must sit in the same group and the same position at ${rung} as at base`);
    }
  }
});

ok("Fun branches off Base, it is not Tuned with jokes added", () => {
  const plan = buyPlans.plans[Object.keys(buyPlans.plans).find((id) => (buyPlans.plans[id].funTuned || []).length)];
  const fun = Slot.selectionSignature(Slot.selectionForRung(plan, "fun"));
  assert.notEqual(fun, Slot.selectionSignature(Slot.selectionForRung(plan, "tuned")));
  assert.deepEqual(Slot.RUNG_CHAIN.fun, ["funTuned"], "Fun composes off the shell alone");
});

process.stdout.write(`\n${checks} checks passed across ${planIds.length} plans.\n`);
