import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {readFile} from "node:fs/promises";

const require = createRequire(import.meta.url);
const Lineup = require("../lineup-model.js");
const buyPlans = JSON.parse(await readFile(new URL("../data/buy-plans.json", import.meta.url), "utf8"));
const cards = JSON.parse(await readFile(new URL("../data/cards.json", import.meta.url), "utf8"));
const appSource = await readFile(new URL("../app.js", import.meta.url), "utf8");
const audited = new Map(cards.cards.map((card) => [Lineup.normalizeName(card.name), card]));
const BASIC_NAMES = new Set(["plains", "island", "swamp", "mountain", "forest", "wastes", "snow covered plains", "snow covered island", "snow covered swamp", "snow covered mountain", "snow covered forest"]);
const EARLY_COMBO_PAIRS = [
  ["Thassa's Oracle", "Demonic Consultation"],
  ["Thassa's Oracle", "Tainted Pact"],
  ["Heliod, Sun-Crowned", "Walking Ballista"],
  ["Isochron Scepter", "Dramatic Reversal"],
  ["Devoted Druid", "Vizier of Remedies"],
  ["Bloodchief Ascension", "Mindcrank"],
  ["Iona, Shield of Emeria", "Painter's Servant"]
];

function auditText(card) {
  const metadata = audited.get(Lineup.normalizeName(card.name));
  return [metadata?.name, metadata?.typeLine, metadata?.oracleText, ...(metadata?.keywords || [])].join(" ").toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, " ");
}

function strategyMatches(card, patterns) {
  const text = auditText(card);
  return patterns.some((pattern) => pattern.test(text));
}

function generatedShellCards(plan) {
  return plan.startingShell.filter((card) => card.wasFlexibleSlot);
}

function roleFlags(card) {
  const text = auditText(card);
  return {
    ramp: /\badd\b[^.]{0,35}(?:mana|\{[wubrgc]\})|search your library for [^.]{0,45}(?:basic )?land|put (?:a|that|the) land card[^.]*onto the battlefield|treasure token|spells? you cast cost .* less/.test(text),
    draw: /draw (?:a|one|two|three|x|that many|cards|a card)|put (?:one|that|those|the) cards?[^.]*into your hand|investigate|clue token/.test(text),
    interaction: /destroy (?:target|all|each)|exile (?:target|all)|counter target|return target [^.]*owner'?s hand|deals? [^.]* damage to (?:target|any target|each creature|each opponent)|target creature gets [+-]|creatures? [^.]*get[s]? -|(?:each opponent|each player) sacrifices|\bfight\b|tap target|target permanent[^.]*shuffle|goad target|can'?t block/.test(text),
    protect: /hexproof|indestructible|protection from|regenerate|phase out|prevent all damage|can'?t be countered|counter target spell that targets|return [^.]* you control to (?:its|their) owner'?s hand/.test(text)
  };
}

function roleCount(cardsInRole, role, extraMatch = () => false) {
  return cardsInRole.filter((card) => roleFlags(card)[role] || extraMatch(card)).length;
}

function selectedCards(plan, selection) {
  return Lineup.selectedEntries(plan, selection).map((entry) => entry.item);
}

function issues(plan, selection) {
  const selected = selectedCards(plan, selection);
  const total = selected.reduce((sum, card) => sum + Number(card.quantity || 1), 0);
  const result = [];
  if (total !== 100) result.push(`total ${total}`);
  const commanders = selected.filter((card) => card.isCommander || (card.tags || []).some((tag) => String(tag).toLowerCase() === "commander"));
  if (commanders.reduce((sum, card) => sum + Number(card.quantity || 1), 0) !== 1) result.push("commander count");
  const identity = new Set(audited.get(Lineup.normalizeName(commanders[0]?.name))?.colorIdentity || []);
  const quantities = new Map();
  for (const card of selected) {
    const key = Lineup.normalizeName(card.name);
    quantities.set(key, (quantities.get(key) || 0) + Number(card.quantity || 1));
    const audit = audited.get(key);
    if (!audit) result.push(`unaudited ${card.name}`);
    else {
      if (audit.legalities.commander !== "legal") result.push(`illegal ${card.name}`);
      if (audit.colorIdentity.some((color) => !identity.has(color))) result.push(`color ${card.name}`);
    }
  }
  const selectedNames = new Set(selected.map((card) => Lineup.normalizeName(card.name)));
  for (const [left, right] of EARLY_COMBO_PAIRS) {
    if (selectedNames.has(Lineup.normalizeName(left)) && selectedNames.has(Lineup.normalizeName(right))) result.push(`early two-card combo ${left} + ${right}`);
  }
  for (const [key, quantity] of quantities) {
    const audit = audited.get(key);
    const basic = /\bBasic Land\b/i.test(audit?.typeLine || "") || BASIC_NAMES.has(key);
    if (quantity > 1 && !basic) result.push(`singleton ${audit?.name || key}`);
  }
  const gameChangers = selected.filter((card) => card.gameChanger).length;
  if (gameChangers > 3) result.push(`${gameChangers} Game Changers`);
  for (const card of selected) {
    const tags = (card.tags || []).join(" ").toLowerCase();
    if (/early combo|mass land|land destruction|extra turn|turn loop/.test(tags)) result.push(`Tier 3 tag ${card.name}`);
  }
  return result;
}

function sanitizeGameChangers(plan, selection, protectedId) {
  let next = selection;
  while (selectedCards(plan, next).filter((card) => card.gameChanger).length > 3) {
    const entry = Lineup.selectedEntries(plan, next).find((candidate) => candidate.id !== protectedId && candidate.item.gameChanger && !candidate.item.isCommander);
    assert(entry, `${plan.variantId}: must have a removable Game Changer when testing ${protectedId}`);
    next = Lineup.restoreChoice(plan, next, entry.id);
  }
  return next;
}

for (const [variantId, plan] of Object.entries(buyPlans.plans)) {
  assert.equal(plan.startingShell.reduce((sum, card) => sum + Number(card.quantity || 1), 0), 100, `${variantId}: shell quantity`);
  assert(!plan.startingShell.some((card) => card.isFlexibleSlot || /unspecified|placeholder|\btbd\b/i.test(card.name)), `${variantId}: shell must be exact`);
  assert.equal(Lineup.unresolvedEntries(plan).length, 0, `${variantId}: every option must resolve to a shell slot`);

  const defaults = Lineup.defaultSelection(plan);
  assert.equal(Lineup.quantity(plan, defaults), 100, `${variantId}: literal default checks must total 100`);
  assert.deepEqual(issues(plan, defaults), [], `${variantId}: default lineup must be Tier 3 clean`);

  const model = Lineup.buildModel(plan);
  for (const entry of model.entries.filter((candidate) => candidate.kind !== "shell")) {
    let tentative = Lineup.applyChoice(plan, defaults, entry.id);
    tentative = sanitizeGameChangers(plan, tentative, entry.id);
    assert(Lineup.selectedEntries(plan, tentative).some((candidate) => candidate.id === entry.id), `${variantId}: ${entry.item.name} must be selectable`);
    assert.equal(Lineup.quantity(plan, tentative), 100, `${variantId}: ${entry.item.name} swap must stay at 100`);
    assert.deepEqual(issues(plan, tentative), [], `${variantId}: ${entry.item.name} must have a compliant configuration`);
  }

  for (const [slotId, group] of model.groups) {
    let selection = defaults;
    for (const entry of group.filter((candidate) => candidate.kind !== "shell")) {
      selection = Lineup.applyChoice(plan, selection, entry.id);
      const occupants = Lineup.selectedEntries(plan, selection).filter((candidate) => candidate.slotId === slotId);
      assert.equal(occupants.length, 1, `${variantId}: ${slotId} must have one radio occupant`);
      assert.equal(occupants[0].id, entry.id, `${variantId}: selected radio must be active`);
      assert.equal(Lineup.quantity(plan, selection), 100, `${variantId}: sibling radio sequence must preserve 100`);
    }
  }
}

const bant = buyPlans.plans["4c"];
const bantGroups = Array.from(Lineup.buildModel(bant).groups.values()).map((group) => new Set(group.map((entry) => entry.item.name)));
assert(bantGroups.some((group) => ["Cultivate", "Assault Formation", "Aura Shards", "Dovin's Veto"].every((name) => group.has(name))), "Bant Assault Formation alternatives must share one radio slot");
assert(bantGroups.some((group) => ["Dispel", "Unbreakable Formation", "Teferi's Protection", "Wall of Nets"].every((name) => group.has(name))), "Bant protection alternatives must share one radio slot");

const dimirGenerated = generatedShellCards(buyPlans.plans["2a"]);
const dimirCounterLeak = /\b(?:proliferate|infect|wither)\b|(?:\+1\/\+1|-1\/-1|charge|arrowhead) counters?|double the number of each kind of counter/;
assert.deepEqual(dimirGenerated.filter((card) => dimirCounterLeak.test(auditText(card))).map((card) => card.name), [], "Dimir Theft generated slots must not contain counter-engine leakage");
const dimirStrategyPatterns = [
  /\bgain control\b/,
  /opponent'?s library/,
  /opponent owns/,
  /graveyard[^.]{0,180}under your control/,
  /enchant creature card in a graveyard/,
  /opponent chooses a creature card in their graveyard/,
  /\bcopy target\b/,
  /\bbecomes? a copy\b/,
  /(?:create|becomes?)[^.]{0,90}\bcopy\b/,
  /enter(?:s|ing)[^.]{0,160}trigger[^.]{0,100}additional time/,
  /\bcast that card\b/
];
assert.ok(dimirGenerated.filter((card) => strategyMatches(card, dimirStrategyPatterns)).length >= 6, "Dimir Theft must retain at least six generated theft, reanimation, copy, or trigger-doubling cards");
for (const [role, minimum] of Object.entries({ramp: 8, draw: 8, interaction: 8, protect: 3})) {
  assert.ok(roleCount(dimirGenerated, role) >= minimum, `Dimir Theft generated shell must retain its ${minimum}-card ${role} floor`);
}

const gruul = buyPlans.plans["3f"];
const gruulGenerated = generatedShellCards(gruul);
const gruulRejectedNames = new Set(["Advanced Reconstruction", "Aetherflux Reservoir", "Fungal Plots", "Inspiring Call", "Kruphix's Insight", "Perpetual Timepiece", "Rampart Architect", "Relic Retriever", "Splinterfright", "Staff of Compleation", "Troll Negotiations"]);
const gruulLeakPattern = /\bproliferate\b|\+1\/\+1 counters?|\bpay 50 life\b|creatures? (?:you control )?with defender|enchantment cards? from among|cards? (?:left|leave) your graveyard/;
assert.deepEqual(gruulGenerated.filter((card) => gruulRejectedNames.has(card.name) || gruulLeakPattern.test(auditText(card))).map((card) => card.name), [], "Gruul Landfall generated slots must not contain counter, lifegain, defender, enchantress, or graveyard-engine leakage");
const gruulStrategyPatterns = [
  /\blandfall\b/,
  /\bland enters\b/,
  /\bland cards?\b/,
  /\bbasic land\b/,
  /\badditional land\b/,
  /search your library[^.]{0,90}\bland\b/,
  /put (?:a|that|the) land card[^.]*onto the battlefield/,
  /\belemental\b/
];
assert.ok(gruulGenerated.filter((card) => strategyMatches(card, gruulStrategyPatterns)).length >= 30, "Gruul Landfall must retain at least thirty generated land or Elemental cards");
for (const [role, minimum] of Object.entries({ramp: 8, draw: 8, protect: 3})) {
  assert.ok(roleCount(gruulGenerated, role) >= minimum, `Gruul Landfall generated shell must retain its ${minimum}-card ${role} floor`);
}
const gruulDefault = selectedCards(gruul, Lineup.defaultSelection(gruul));
assert.ok(roleCount(gruulDefault, "interaction", (card) => card.name === "Song of the Dryads") >= 8, "Gruul Landfall default lineup must retain its eight-card interaction floor");

assert.match(appSource, /selectedDeckCards\(plan, ensureBuyState\(variant\.id\)\)/, "Buy Picks counters must use literal selected cards");
assert.doesNotMatch(appSource, /card\.isFlexibleSlot \|\| selectedShell\.has/, "runtime may not force hidden flexible slots into compliance");
assert.match(appSource, /<input type="checkbox" \$\{card\.lineupActive \? "checked"/, "Live Deck cards must be independent toggles, not a slot-exclusive radio group");
assert.doesNotMatch(appSource, /type="radio" name="live-slot-/, "Live Deck cards must not be constrained back into slot-exclusive radio groups");
assert.match(appSource, /Ready to play/, "Live Decks must calculate readiness");
assert.match(appSource, /startingShellKind\s*!==\s*["']official-precon["']/, "Only verified official precons may unlock a whole shell as one bought item");

for (const [variantId, plan] of Object.entries(buyPlans.plans)) {
  assert.ok(["official-precon", "custom-shell"].includes(plan.startingShellKind), `${variantId}: starting shell acquisition mode must be explicit`);
}
assert.ok(Object.values(buyPlans.plans).some((plan) => plan.startingShellKind === "official-precon"), "Expected at least one official precon shell");
assert.ok(Object.values(buyPlans.plans).some((plan) => plan.startingShellKind === "custom-shell"), "Expected at least one custom singles shell");

console.log(`Validated literal 100-card defaults and every selectable slot across ${Object.keys(buyPlans.plans).length} plans.`);
