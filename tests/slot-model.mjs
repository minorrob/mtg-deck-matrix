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

process.stdout.write(`\n${checks} checks passed across ${planIds.length} plans.\n`);
