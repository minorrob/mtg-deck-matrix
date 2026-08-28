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

/* ---------- a row's status is about the row, not the shelf ----------
   One Sol Ring, wanted by two decks. The ledger says you own one, so reading the status
   off the ledger called the row "In hand" while it was still asking for a second copy --
   and the Shop's "Not in hand" filter dropped it, hiding a card genuinely still owed. */
const twoDecks = () => [
  {id: "3o", slots: [{pick: {name: "Sol Ring", price: 1.2, quantity: 1, rung: "base"}, type: "Artifact", isBasic: false}]},
  {id: "5o", slots: [{pick: {name: "Sol Ring", price: 1.2, quantity: 1, rung: "base"}, type: "Artifact", isBasic: false}]}
];

ok("a row still owed never reads as in hand", () => {
  const rows = Slot.shopRows(twoDecks(), {"sol-ring": {inHand: 1, ordered: 0}});
  const ring = rows.find((r) => r.name === "Sol Ring");
  assert.equal(ring.quantity, 2, "two decks want it, so the row stands for two copies");
  assert.equal(ring.need, 1, "one copy is still to buy");
  assert.equal(ring.acquisition, Slot.ACQUISITION.PARTIAL,
    "a row that still needs a copy cannot claim to be in hand");
});

ok("a deck-scoped row answers for that deck alone", () => {
  // 5o's box holds the copy; 3o's does not. Scoped to 3o the honest answer is "buy one".
  const perDeck = {"5o": {"sol-ring": {inHand: 1, ordered: 0}}, "3o": {}};
  const rows = Slot.shopRows(twoDecks(), {"sol-ring": {inHand: 1, ordered: 0}}, {"sol-ring": {inHand: 1, ordered: 0}}, perDeck);
  const ring = rows.find((r) => r.name === "Sol Ring");

  const obuun = Slot.scopeRow(ring, ["3o"]);
  assert.equal(obuun.quantity, 1, "Obuun wants one");
  assert.equal(obuun.need, 1, "and has none of them");
  assert.equal(obuun.acquisition, Slot.ACQUISITION.NONE, "so for Obuun it is not in hand");

  const quintorius = Slot.scopeRow(ring, ["5o"]);
  assert.equal(quintorius.need, 0, "Quintorius is holding its copy");
  assert.equal(quintorius.acquisition, Slot.ACQUISITION.HAND);

  assert.equal(Slot.scopeRow(ring, []), ring, "naming no deck leaves the row whole");
  assert.equal(Slot.scopeRow(ring, ["1b"]), null, "a deck that does not want the card drops the row");
  assert.equal(Slot.scopeRow(ring, ["3o", "5o"]).quantity, 2, "every deck named is the unscoped row again");
});

ok("scoping is refused rather than guessed when no allocation was supplied", () => {
  const rows = Slot.shopRows(twoDecks(), {"sol-ring": {inHand: 1, ordered: 0}});
  const ring = rows.find((r) => r.name === "Sol Ring");
  assert.equal(Slot.scopeRow(ring, ["3o"]), ring,
    "without a per-deck split, which box holds the copy is unknown and must not be invented");
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

/* ---------- Max is the Tier 3 build ---------- */
const cardsJson = JSON.parse(await readFile(new URL("../data/cards.json", import.meta.url), "utf8"));
const gameChangerNames = new Set(cardsJson.cards.filter((c) => c.gameChanger).map((c) => c.name.toLowerCase()));
const TIER3_LIMIT = 3;
const gameChangersIn = (plan, rung) => Lineup.selectedEntries(plan, Slot.selectionForRung(plan, rung))
  .filter((entry) => gameChangerNames.has(entry.item.name.toLowerCase()));

ok("Max is a Tier 3 build, not a label over the Tuned hundred", () => {
  // It used to be exactly that on 40 of 50, because the Game Changers filling
  // those ladders carried capabilityOption and so never composed into the rung.
  // Bracket 3 IS the allowance of up to three Game Changers, so a Max rung that
  // carries none of them is not a Tier 3 build.
  const same = planIds.filter((id) => {
    const plan = buyPlans.plans[id];
    return Slot.selectionSignature(Slot.selectionForRung(plan, "max"))
        === Slot.selectionSignature(Slot.selectionForRung(plan, "tuned"));
  });
  assert.equal(same.length, 0,
    `${same.length} variants still have Max identical to Tuned (${same.join(", ")})`);
  const carrying = planIds.filter((id) => gameChangersIn(buyPlans.plans[id], "max").length > 0);
  assert.equal(carrying.length, planIds.length,
    `${planIds.length - carrying.length} Max rungs carry no Game Changer at all, so they are not Tier 3 builds`);
});

ok("no Max rung exceeds Bracket 3's limit of three Game Changers", () => {
  // 2a shipped four before this landed -- a genuinely illegal deck that nothing
  // checked, because the Tier 3 ceiling was never asserted against a composed rung.
  for (const id of planIds) {
    const held = gameChangersIn(buyPlans.plans[id], "max");
    assert.ok(held.length <= TIER3_LIMIT,
      `${id} Max carries ${held.length} Game Changers (${held.map((e) => e.item.name).join(", ")}), over the limit of ${TIER3_LIMIT}`);
  }
});

ok("the rungs below Max stay clean of Game Changers", () => {
  // Base, Tuned and Pod Fun are published as Tier 2, which permits none at all.
  // Two decks lead with one as their commander and are Bracket 3 by construction.
  for (const id of planIds) {
    const commander = (buyPlans.plans[id].startingShell || []).find((c) => c.isCommander);
    if (commander && gameChangerNames.has(String(commander.name).toLowerCase())) continue;
    for (const rung of ["base", "tuned", "fun"]) {
      const held = gameChangersIn(buyPlans.plans[id], rung);
      assert.equal(held.length, 0,
        `${id} ${rung} carries ${held.map((e) => e.item.name).join(", ")}, but that rung is published as Tier 2`);
    }
  }
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

ok("the page and the simulation agree about mana, card for card", () => {
  /* slot-model carries its own copy of the two mana rules, because sim-engine is a
     Node-only module and loading eleven hundred lines of it into the page to read a land
     would be absurd. A copy that drifts is worse than no readout at all -- the page would
     tell you a deck can cast itself while the engine scores it as stranded -- so the two
     are checked against each other over the whole catalog rather than trusted to stay in
     step by good intentions. */
  const engine = require("../sim-engine.js");
  const catalog = cardsPayload.cards;
  const costMismatch = [];
  const colorMismatch = [];
  for (const card of catalog) {
    const mine = Slot.manaCostOf(card.manaCost);
    const theirs = engine.parseManaCost(card.manaCost);
    if (JSON.stringify(mine) !== JSON.stringify(theirs)) costMismatch.push(card.name);
    const a = Slot.producesColors(card).slice().sort().join("");
    const b = (engine.classifyCard(card).produces || []).slice().sort().join("");
    if (a !== b) colorMismatch.push(`${card.name}: page ${a || "none"} vs engine ${b || "none"}`);
  }
  assert.equal(costMismatch.length, 0,
    `mana costs read differently on ${costMismatch.length} cards, e.g. ${costMismatch.slice(0, 3).join(", ")}`);
  assert.equal(colorMismatch.length, 0,
    `colour production reads differently on ${colorMismatch.length} cards, e.g. ${colorMismatch.slice(0, 3).join(" | ")}`);
  assert.ok(catalog.length > 1000, `expected the real catalog, got ${catalog.length} cards`);
});

ok("a thin colour is one the deck cannot reliably pay for", () => {
  const deck = [
    {name: "Forest", typeLine: "Basic Land — Forest", colorIdentity: ["G"], quantity: 30},
    {name: "Island", typeLine: "Basic Land — Island", colorIdentity: ["U"], quantity: 3},
    {name: "Cheap Green", typeLine: "Creature", manaCost: "{G}", quantity: 30},
    {name: "Blue Bomb", typeLine: "Sorcery", manaCost: "{4}{U}{U}", quantity: 6}
  ];
  const health = Slot.manaHealth(deck);
  assert.equal(health.lands, 33, "lands are counted by copies, not by rows");
  assert.equal(health.sources.G, 30);
  assert.equal(health.pips.U, 12, "six copies asking for two blue each");
  assert.ok(health.thin.includes("U"), "three Islands behind twelve blue pips is thin");
  assert.ok(!health.thin.includes("G"), "thirty Forests behind thirty green pips is not");
  // The floor scales with demand, so a colour carrying most of the pips has to carry most
  // of the lands. A flat floor called eighteen green sources against thirty-four green
  // pips healthy, which is the shape that actually strands cards in hand.
  const lopsided = Slot.manaHealth([
    {name: "Forest", typeLine: "Basic Land — Forest", colorIdentity: ["G"], quantity: 18},
    {name: "Plains", typeLine: "Basic Land — Plains", colorIdentity: ["W"], quantity: 18},
    {name: "Green Spell", typeLine: "Sorcery", manaCost: "{G}{G}", quantity: 17},
    {name: "White Spell", typeLine: "Sorcery", manaCost: "{W}", quantity: 17}
  ]);
  assert.equal(lopsided.pips.G, 34);
  assert.ok(lopsided.thin.includes("G"), "thirty-four green pips off eighteen sources is thin");
  assert.ok(!lopsided.thin.includes("W"), "seventeen white pips off eighteen sources is not");
  // The commander is excluded from demand: it is cast from a zone you always have access to.
  const withCommander = Slot.manaHealth(deck.concat([{name: "Cmdr", typeLine: "Legendary Creature", manaCost: "{9}{U}", isCommander: true, quantity: 1}]));
  assert.equal(withCommander.pips.U, health.pips.U, "the commander's own pips are not deck demand");
});

ok("card art is asked for at the size the layout actually renders", () => {
  // The catalog stores Scryfall's `small`, 146px wide, because that is what the import
  // captured. The preview renders it at 286 CSS px on a desktop and 316 on a phone --
  // 572 and 948 device pixels once screen scaling is counted. The CSS has always
  // declared aspect-ratio 488/680, which is `normal`'s exact shape.
  const small = "https://cards.scryfall.io/small/front/3/b/3bb17913-fe4d.jpg?1783933150";
  assert.equal(Slot.cardImage(small, "normal"),
    "https://cards.scryfall.io/normal/front/3/b/3bb17913-fe4d.jpg?1783933150");
  // Idempotent, so a card that already arrived at the right size is untouched.
  assert.equal(Slot.cardImage(Slot.cardImage(small, "normal"), "normal"), Slot.cardImage(small, "normal"));
  // Only the size segment moves: the digest, the extension and the cache-busting query
  // all have to survive, or the URL stops resolving.
  assert.match(Slot.cardImage(small, "large"), /\/large\/front\/3\/b\/3bb17913-fe4d\.jpg\?1783933150$/);
  // Anything that is not a Scryfall card image is handed back as it came.
  assert.equal(Slot.cardImage("https://example.com/small/x.png", "normal"), "https://example.com/small/x.png");
  assert.equal(Slot.cardImage(small, "gigantic"), small, "an unknown size must not rewrite anything");
  assert.equal(Slot.cardImage("", "normal"), "");
  assert.equal(Slot.cardImage(null, "normal"), "");
});

ok("Fun branches off Base, it is not Tuned with jokes added", () => {
  const plan = buyPlans.plans[Object.keys(buyPlans.plans).find((id) => (buyPlans.plans[id].funTuned || []).length)];
  const fun = Slot.selectionSignature(Slot.selectionForRung(plan, "fun"));
  assert.notEqual(fun, Slot.selectionSignature(Slot.selectionForRung(plan, "tuned")));
  assert.deepEqual(Slot.RUNG_CHAIN.fun, ["funTuned"], "Fun composes off the shell alone");
});

ok("the page and the simulation agree about what a card is FOR, card for card", () => {
  /* Same argument as the mana rules above. A slot offering you "removal you already own"
     has to mean removal in the sense the simulation scores, or the suggestion is a guess
     wearing the simulation's clothes. Eight roles, whole catalog, no exceptions. */
  const engine = require("../sim-engine.js");
  const FLAG = {
    ramp: "isRamp", draw: "isDraw", removal: "isRemoval", wipe: "isWipe",
    protection: "isProtection", recursion: "isRecursion", tutor: "isTutor", finisher: "isFinisher"
  };
  assert.deepEqual(Object.keys(FLAG).slice().sort(), Slot.ROLE_KEYS.slice().sort(),
    "every role the page can show has to be one the engine actually tests for");
  const drift = [];
  for (const card of cardsPayload.cards) {
    const mine = new Set(Slot.cardRoles(card));
    const theirs = engine.classifyCard(card);
    for (const [role, flag] of Object.entries(FLAG)) {
      if (mine.has(role) !== Boolean(theirs[flag])) drift.push(`${card.name}: ${role} page ${mine.has(role)} vs engine ${Boolean(theirs[flag])}`);
    }
  }
  assert.equal(drift.length, 0, `roles read differently on ${drift.length} card/role pairs, e.g. ${drift.slice(0, 3).join(" | ")}`);
  // The mana value the fit uses is the engine's too, or a "same cost" badge lies.
  const valueDrift = cardsPayload.cards.filter((card) => Slot.manaValueOf(card) !== engine.classifyCard(card).cmc);
  assert.equal(valueDrift.length, 0, `mana value differs on ${valueDrift.length} cards, e.g. ${valueDrift.slice(0, 3).map((c) => c.name).join(", ")}`);
});

ok("a slot's best fit is the card that does the same job at the same cost", () => {
  const target = {type: "Instant", manaValue: 2, roles: ["removal"]};
  const swords = cards[Lineup.normalizeName("Swords to Plowshares")];
  const solRing = cards[Lineup.normalizeName("Sol Ring")];
  assert.ok(swords && solRing, "the catalog should carry both fixtures");
  const a = Slot.slotFit(swords, target);
  const b = Slot.slotFit(solRing, target);
  assert.ok(a.score > b.score, `removal should outrank a mana rock for a removal slot (${a.score} vs ${b.score})`);
  assert.ok(a.reasons.length, "a score with no reasons behind it is a number you cannot argue with");
  assert.ok(a.reasons.some((r) => /removal/.test(r)), `expected the reason to name the role, got ${a.reasons.join(", ")}`);

  // Type is worth more than cost: a slot's shape survives a mana off, not a type swap.
  const sameTypeOffCost = Slot.slotFit({typeLine: "Instant", manaCost: "{4}{W}", oracleText: "Destroy target creature."}, target);
  const offTypeSameCost = Slot.slotFit({typeLine: "Creature — Bear", manaCost: "{1}{W}", oracleText: "Destroy target creature."}, target);
  assert.ok(sameTypeOffCost.score > offTypeSameCost.score,
    `an Instant off-curve should beat a Creature on-curve for an Instant slot (${sameTypeOffCost.score} vs ${offTypeSameCost.score})`);

  // A card that shares nothing scores at or below zero, so "best fit" can come back empty
  // rather than dressing up the least-bad card in the pile as a suggestion.
  const nothing = Slot.slotFit({typeLine: "Land", manaCost: "", oracleText: ""}, target);
  assert.ok(nothing.score <= 0, `an unrelated card should not score as a fit (${nothing.score})`);
});

process.stdout.write(`\n${checks} checks passed across ${planIds.length} plans.\n`);
