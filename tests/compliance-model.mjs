import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {readFile} from "node:fs/promises";

const require = createRequire(import.meta.url);
const Lineup = require("../lineup-model.js");
const Compliance = require("../compliance-model.js");
const buyPlans = JSON.parse(await readFile(new URL("../data/buy-plans.json", import.meta.url), "utf8"));
const cards = JSON.parse(await readFile(new URL("../data/cards.json", import.meta.url), "utf8"));
const appSource = await readFile(new URL("../app.js", import.meta.url), "utf8");
const indexSource = await readFile(new URL("../index.html", import.meta.url), "utf8");
const audited = new Map(cards.cards.map((card) => [Lineup.normalizeName(card.name), card]));
const resolveMeta = (item) => audited.get(Lineup.normalizeName(item.name)) || {};

// Parity: every baked plan's default lineup must be Tier 3 clean through the
// extracted module, exactly as it was through the in-app evaluator.
for (const [variantId, plan] of Object.entries(buyPlans.plans)) {
  const defaults = Lineup.defaultSelection(plan);
  const literal = Lineup.selectedEntries(plan, defaults).map((entry) => ({
    ...entry.item,
    quantity: Number(entry.item.quantity || 1),
    lineupKind: entry.kind,
    colorIdentity: entry.item.colorIdentity || resolveMeta(entry.item).colorIdentity || [],
    legalities: entry.item.legalities || resolveMeta(entry.item).legalities
  }));
  const result = Compliance.evaluateCardList(literal, {resolveMeta});
  assert.equal(result.total, 100, `${variantId}: default lineup must total 100 through the module`);
  assert.deepEqual(result.tier3.map((issue) => `${issue.card}: ${issue.rule}`), [], `${variantId}: default lineup must be Tier 3 clean through the module`);
}

// Fixture decks: exact rule strings must survive the extraction byte-for-byte.
function makeDeck({lands = 36, extras = [], drop = 0} = {}) {
  const deck = [
    {name: "Test Commander", quantity: 1, isCommander: true, typeLine: "Legendary Creature — Elf Druid", colorIdentity: ["G"], tags: []},
    {name: "Forest", quantity: lands, typeLine: "Basic Land — Forest", colorIdentity: [], tags: []}
  ];
  const fillers = 100 - 1 - lands - drop - extras.reduce((sum, card) => sum + Number(card.quantity || 1), 0);
  for (let index = 0; index < fillers; index += 1) {
    deck.push({name: `Filler Creature ${index + 1}`, quantity: 1, typeLine: "Creature — Elf", colorIdentity: ["G"], tags: []});
  }
  return [...deck, ...extras];
}

const clean = Compliance.evaluateCardList(makeDeck());
assert.equal(clean.total, 100);
assert.deepEqual(clean.tier2, []);
assert.deepEqual(clean.tier3, []);
assert.deepEqual(clean.compositionWarnings, []);

const over = Compliance.evaluateCardList(makeDeck({drop: -1, extras: [{name: "One Too Many", quantity: 1, typeLine: "Sorcery", colorIdentity: ["G"]}]}));
assert.equal(over.total, 101);
assert.ok(over.tier3.some((issue) => issue.rule === "Commander requires exactly 100 cards; this selection contains 101."), "over-count rule string must match");
assert.ok(over.tier3.some((issue) => issue.detail === "Cut 1 card."), "over-count detail must match");

const duplicate = Compliance.evaluateCardList(makeDeck({extras: [{name: "Doubled Spell", quantity: 2, typeLine: "Instant", colorIdentity: ["G"]}]}));
assert.ok(duplicate.tier3.some((issue) => issue.card === "Doubled Spell" && issue.rule === "Singleton rule: 2 copies are modeled."), "singleton rule string must match");

const offColor = Compliance.evaluateCardList(makeDeck({extras: [{name: "Azorius Interloper", quantity: 1, typeLine: "Creature — Bird", colorIdentity: ["W", "U"]}]}));
assert.ok(offColor.tier3.some((issue) => issue.card === "Azorius Interloper" && issue.rule === "Color identity falls outside the commander's colors."), "identity rule string must match");

const illegal = Compliance.evaluateCardList(makeDeck({extras: [{name: "Banned Bomb", quantity: 1, typeLine: "Sorcery", colorIdentity: ["G"], commanderLegal: false}]}));
assert.ok(illegal.tier3.some((issue) => issue.card === "Banned Bomb" && issue.rule === "This card is not Commander legal."), "legality rule string must match");

const gameChangers = Compliance.evaluateCardList(makeDeck({extras: [1, 2, 3, 4].map((index) => ({name: `Game Changer ${index}`, quantity: 1, typeLine: "Enchantment", colorIdentity: ["G"], gameChanger: true}))}));
assert.equal(gameChangers.selectedGameChangers.length, 4);
assert.ok(gameChangers.tier3.some((issue) => issue.rule === "Tier 3 allows up to three Game Changers; 4 are selected."), "Game Changer cap rule string must match");
assert.ok(gameChangers.tier2.filter((issue) => issue.rule === "Tier 2 permits no Game Changers.").length === 4, "Tier 2 must flag every Game Changer");

const threeChangers = Compliance.evaluateCardList(makeDeck({extras: [1, 2, 3].map((index) => ({name: `Game Changer ${index}`, quantity: 1, typeLine: "Enchantment", colorIdentity: ["G"], gameChanger: true}))}));
assert.deepEqual(threeChangers.tier3, [], "three Game Changers must stay Tier 3 clean");

const combo = Compliance.evaluateCardList(makeDeck({extras: [
  {name: "Thassa's Oracle", quantity: 1, typeLine: "Creature — Merfolk Wizard", colorIdentity: ["G"]},
  {name: "Demonic Consultation", quantity: 1, typeLine: "Instant", colorIdentity: ["G"]}
]}));
assert.ok(combo.tier3.some((issue) => issue.card === "Thassa's Oracle + Demonic Consultation" && issue.rule === "Tier 3 permits no intentional early-game two-card combo package."), "early combo pair rule string must match");

const massLand = Compliance.evaluateCardList(makeDeck({extras: [{name: "World Burner", quantity: 1, typeLine: "Sorcery", colorIdentity: ["G"], tags: ["Mass land denial"]}]}));
assert.ok(massLand.tier3.some((issue) => issue.card === "World Burner" && issue.rule === "Tier 3 permits no mass land denial."), "mass land rule string must match");

const thinLands = Compliance.evaluateCardList(makeDeck({lands: 30}));
assert.deepEqual(thinLands.compositionWarnings, ["30 lands is below the usual 33–42 starting range; review ramp, curve, and MDFCs before play."], "land floor warning must match");

const baseIssue = {card: "Modeled slot", rule: "Replacement slot could not be resolved: no cut named.", detail: "Choose an exact starting-shell card for this slot."};
const seeded = Compliance.evaluateCardList(makeDeck(), {baseIssues: [baseIssue]});
assert.deepEqual(seeded.tier2[0], baseIssue, "base issues must lead the Tier 2 list");
assert.deepEqual(seeded.tier3[0], baseIssue, "base issues must lead the Tier 3 list");

// Derived tags: only single-card-provable rules may fire on uncurated cards.
assert.deepEqual(Compliance.deriveComplianceTags({oracleText: "Destroy all lands."}), ["mass land denial"]);
assert.deepEqual(Compliance.deriveComplianceTags({oracleText: "Take an extra turn after this one. Exile this card."}), [], "one-shot extra turns must not be tagged");
assert.deepEqual(Compliance.deriveComplianceTags({oracleText: "Take an extra turn after this one. Shuffle this card into its owner's library."}), ["extra turn loop risk"], "self-recurring extra turns must be tagged");
assert.deepEqual(Compliance.deriveComplianceTags({oracleText: "Draw three cards."}), []);
const loopTagged = Compliance.evaluateCardList(makeDeck({extras: [{name: "Endless Weekend", quantity: 1, typeLine: "Sorcery", colorIdentity: ["G"], tags: ["extra turn loop risk"]}]}));
assert.ok(loopTagged.tier3.some((issue) => issue.card === "Endless Weekend" && issue.rule === "Tier 3 should not chain or loop extra turns."), "derived loop tag must trip the extra-turn rule");

// The rules must live in exactly one place: the shared module.
assert.match(appSource, /const Compliance = window\.MtgComplianceModel/, "app.js must bind the shared compliance model");
assert.match(appSource, /Compliance\.evaluateCardList\(literalCards/, "evaluateDeckCompliance must delegate to the shared module");
assert.doesNotMatch(appSource, /const TIER3_EARLY_COMBO_PAIRS = \[/, "combo pairs may not be re-duplicated in app.js");
assert.doesNotMatch(appSource, /const BASIC_LANDS = new Set/, "the basic-land list may not be re-duplicated in app.js");
assert.match(indexSource, /compliance-model\.js\?v=\d+/, "index.html must load the compliance model");
assert.ok(indexSource.indexOf("compliance-model.js") < indexSource.indexOf("app.js?"), "compliance model must load before app.js");
assert.ok(indexSource.indexOf("lineup-model.js") < indexSource.indexOf("compliance-model.js"), "lineup model must load before the compliance model");

console.log(`Compliance module parity holds across ${Object.keys(buyPlans.plans).length} plans and all rule fixtures.`);
