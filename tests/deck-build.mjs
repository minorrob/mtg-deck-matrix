/* The bridge from a generated ladder to a deck this app owns.
 *
 * Driven by the real generator against the shared Scryfall stub, not by a
 * hand-written fixture, because the whole risk here is that the two modules
 * disagree about a field name. A fixture I wrote myself would agree with
 * whatever I believed at the time; generator output cannot.
 */
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {readFile} from "node:fs/promises";
import {makeClient} from "./helpers/stub-scryfall.mjs";

const require = createRequire(import.meta.url);
require("../lineup-model.js");
require("../compliance-model.js");
const Generator = require("../deck-generator.js");
const Store = require("../deck-store.js");
const Build = require("../deck-build.js");
const fixture = JSON.parse(await readFile(new URL("./fixtures/scryfall/cards.json", import.meta.url), "utf8"));

let checks = 0;
const check = (fn, message) => { fn(); checks += 1; void message; };

// ---------------------------------------------------------------------------
// Generate once. Everything below reads that one result, so the suite costs one
// build rather than one per assertion.
// ---------------------------------------------------------------------------
const {client} = makeClient(fixture.data);
const result = await Generator.generateForSlot({
  slotId: 101,
  commanderName: "Atraxa, Praetors' Voice",
  themes: ["counters"],
  budgetUsd: 150,
  variantCount: 2,
  createdAt: "2026-09-06T00:00:00.000Z"
}, {client});

assert.ok(result.commander, "the stub must resolve a commander");
assert.ok(result.builds.length >= 1, "at least one variant must be built");
const built = result.builds[0];
assert.equal(built.stages.length, 3, "a build carries three rungs");

// ---------------------------------------------------------------------------
// The rungs themselves
// ---------------------------------------------------------------------------
check(() => assert.equal(Build.RUNGS.length, 3));
check(() => assert.deepEqual(Build.RUNGS.map((r) => r.key), ["base", "tuned", "max"],
  "rung order must match built.stages, or the wrong deck gets saved"));
check(() => assert.equal(Build.rungAt(1).key, "tuned", "an index must resolve to a rung"));
check(() => assert.equal(Build.rungAt("tuned").index, 1, "a key must resolve to the same rung"));
check(() => assert.equal(Build.rungAt("nonsense"), null));
check(() => assert.equal(Build.rungAt(9), null));

// ---------------------------------------------------------------------------
// A hundred cards, and the commander among them
// ---------------------------------------------------------------------------
Build.RUNGS.forEach((rung) => {
  const entries = built.stages[rung.index];
  check(() => assert.equal(Build.countOf(entries), 100,
    `${rung.label} must count 100 cards`));
  check(() => assert.equal(entries.filter((e) => e.isCommander).length, 1,
    `${rung.label} must carry exactly one commander`));
});

// ---------------------------------------------------------------------------
// The record it hands over
// ---------------------------------------------------------------------------
const resolved = Build.toResolved(built, "tuned", {label: "Counters test", now: "2026-09-06T00:00:00.000Z"});
check(() => assert.equal(resolved.source, "generated",
  "a generated deck must not claim to have been pasted"));
check(() => assert.equal(resolved.sourceUrl, null));
check(() => assert.equal(resolved.name, "Counters test"));
check(() => assert.equal(resolved.commander.length, 1));
check(() => assert.equal(resolved.commander[0], result.commander.name));
check(() => assert.equal(resolved.generated.rung, "tuned"));
check(() => assert.ok(resolved.generated.lensLabel, "the lens must be carried through"));
check(() => assert.deepEqual(resolved.unresolved, [],
  "a generated deck has no unmatched names -- every card came from Scryfall"));

const record = Store.toRecord(resolved, {id: "U1", label: resolved.name});
check(() => assert.equal(record.total, 100, "the record must round-trip a hundred cards"));
check(() => assert.equal(record.commander, result.commander.name));
check(() => assert.equal(record.source, "generated"));
check(() => assert.ok(Store.measurable(record),
  "a generated hundred with a commander must be measurable, like any other"));
check(() => assert.deepEqual(Store.problems(record), [],
  "a clean build must produce a record with nothing wrong with it"));

// Every row carries what the simulator and the shop both need.
record.cards.forEach((card) => {
  check(() => assert.ok(card.name, "every row is named"));
  check(() => assert.ok(card.typeLine, `${card.name} must carry a type line`));
  check(() => assert.ok(card.price === null || card.price > 0,
    `${card.name}: an unknown price must be null, never 0 -- a $0.00 shopping list is a lie`));
});

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------
const spend = Build.spendOf(built.stages[1]);
check(() => assert.ok(spend.total >= 0));
check(() => assert.equal(typeof spend.unpriced, "number"));
// Basic lands are free by convention everywhere in this app; an unpriced basic
// must not be reported as a card with a missing price.
const basics = built.stages[1].filter((e) => e.card.isBasicLand).length;
check(() => assert.ok(spend.unpriced <= built.stages[1].length - basics,
  "basics must not be counted as unpriced"));

const priced = built.stages[1].filter((e) => Number(e.card.price || 0) > 0);
const byHand = priced.reduce((n, e) => n + Number(e.card.price) * Math.max(1, e.quantity || 1), 0);
check(() => assert.equal(spend.total, Math.round(byHand * 100) / 100,
  "the total must be the sum of the priced rows, quantity included"));

// ---------------------------------------------------------------------------
// What changed between rungs
// ---------------------------------------------------------------------------
const swapped = Build.countChanged(built.stages[0], built.stages[1]);
check(() => assert.ok(swapped >= 0));
check(() => assert.equal(Build.countChanged(built.stages[1], built.stages[1]), 0,
  "a rung compared with itself has changed nothing"));
check(() => assert.equal(
  Build.countChanged([{card: {name: "Sol Ring"}}], [{card: {name: "Arcane Signet"}}]), 1,
  "a one-for-one swap counts as one card different, not two"));

// ---------------------------------------------------------------------------
// Which rungs get offered
// ---------------------------------------------------------------------------
const offered = Build.offeredRungs(built);
check(() => assert.ok(offered.length >= 1, "the cheapest rung is always offered"));
check(() => assert.equal(offered[0].key, "base"));
offered.slice(1).forEach((rung) => {
  check(() => assert.ok(Build.countChanged(built.stages[rung.index - 1], built.stages[rung.index]) > 0,
    `${rung.label} is only offered when it is a different hundred`));
});
check(() => assert.ok(["base", "tuned"].includes(Build.defaultRung(built))));

// A ladder whose rungs are all the same hundred must offer exactly one.
const flat = {stages: [built.stages[0], built.stages[0], built.stages[0]], variant: built.variant};
check(() => assert.equal(Build.offeredRungs(flat).length, 1,
  "identical hundreds are one rung, not three"));
check(() => assert.equal(Build.defaultRung(flat), "base",
  "with nothing to tune toward, the cheapest build is the default"));

// ---------------------------------------------------------------------------
// What it refuses
// ---------------------------------------------------------------------------
check(() => assert.deepEqual(Build.problems(built, "tuned"), [],
  "a clean build has no problems"));
check(() => assert.equal(Build.measurable(built, "tuned"), true));

// Fifty singleton spells: fewer entries than the real build has, and -- unlike
// slicing the array -- provably fewer than a hundred cards, because basics carry
// their count in a quantity rather than in a row each.
const shortEntries = built.stages[0].filter((e) => !e.card.isBasicLand).slice(0, 50);
const short = {stages: [shortEntries, [], []], compliance: [{tier3: []}, null, null]};
check(() => assert.ok(Build.countOf(shortEntries) < 100, "the short fixture must actually be short"));
check(() => assert.ok(Build.problems(short, "base").some((p) => /not 100/.test(p)),
  "a build short of a hundred must say so"));
check(() => assert.equal(Build.measurable(short, "base"), false));

const headless = {
  stages: [built.stages[0].map((e) => ({...e, isCommander: false, card: {...e.card, isCommander: false}}))],
  compliance: [{tier3: []}]
};
check(() => assert.ok(Build.problems(headless, "base").some((p) => /commander/i.test(p)),
  "a build with no commander must say so"));

const illegal = {stages: [built.stages[0]], compliance: [{tier3: ["Four Game Changers; Bracket 3 allows three."]}]};
check(() => assert.ok(Build.problems(illegal, "base").some((p) => /Game Changers/.test(p)),
  "an unrepaired Tier 3 violation must reach the reader"));

check(() => assert.deepEqual(Build.problems(null, "base"), ["Nothing was generated."]));
check(() => assert.equal(Build.toResolved(null, "base"), null));
check(() => assert.equal(Build.toResolved(built, "nope"), null));

// ---------------------------------------------------------------------------
// The line under each rung button
// ---------------------------------------------------------------------------
const line = Build.describe(built, "base");
check(() => assert.ok(/^\$/.test(line), "a rung's line leads with its price"));
check(() => assert.ok(/Cheapest legal|lowest price/.test(line) || line.includes("$"),
  "the cheapest rung says what it is"));
check(() => assert.ok(/different from Cheapest legal/.test(Build.describe(built, "tuned")),
  "an upper rung says how it differs from the one below"));

// A rung's line must name a rung the reader can see. When Tuned composes to the
// same hundred as Base it is not offered, and No budget must then compare itself
// with Cheapest legal rather than with a button that is not on screen.
const collapsed = {stages: [built.stages[0], built.stages[0], built.stages[2]], variant: built.variant};
check(() => assert.equal(Build.offeredRungs(collapsed).map((r) => r.key).join(","), "base,max",
  "an identical middle rung is not offered"));
check(() => assert.equal(Build.shownBelow(collapsed, 2).key, "base",
  "the rung below a visible one must itself be visible"));
check(() => assert.ok(/different from Cheapest legal/.test(Build.describe(collapsed, "max")),
  "No budget must not compare itself with a rung that was collapsed away"));
check(() => assert.equal(Build.shownBelow(built, 1).key, "base",
  "the rung below the second is always the first"));

// ---------------------------------------------------------------------------
// Wired into the page
// ---------------------------------------------------------------------------
const indexHtml = await readFile(new URL("../index.html", import.meta.url), "utf8");
check(() => assert.ok(/deck-build\.js/.test(indexHtml), "My Decks must load deck-build.js"));
check(() => assert.ok(/deck-generator\.js/.test(indexHtml), "My Decks must load the generator"));
check(() => assert.ok(/build-panel\.js/.test(indexHtml), "My Decks must load the build panel"));

console.log(`deck-build: ${checks} checks passed · ${result.builds.length} generated ladders, ` +
  `${Build.offeredRungs(built).length} distinct rungs, tuned at $${spend.total.toFixed(0)}`);
