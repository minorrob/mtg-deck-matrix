import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {readFile} from "node:fs/promises";

const require = createRequire(import.meta.url);
const Lineup = require("../lineup-model.js");
const buyPlans = JSON.parse(await readFile(new URL("../data/buy-plans.json", import.meta.url), "utf8"));
const cards = JSON.parse(await readFile(new URL("../data/cards.json", import.meta.url), "utf8"));
const baseRebuild = JSON.parse(await readFile(new URL("../data/base-rebuild.json", import.meta.url), "utf8"));
const appSource = await readFile(new URL("../app.js", import.meta.url), "utf8");
const audited = new Map(cards.cards.map((card) => [Lineup.normalizeName(card.name), card]));
const BASIC_NAMES = new Set(["plains", "island", "swamp", "mountain", "forest", "wastes", "snow covered plains", "snow covered island", "snow covered swamp", "snow covered mountain", "snow covered forest"]);
const LADDER_PREREQS = {enhance2: ["tuned2"], max2: ["tuned2", "enhance2"], funMax: ["funTuned"], altMax: ["altTuned"]};
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
    // Rungs above the first in a newer ladder (enhance2/max2, funMax, altMax) are generated
    // as deltas against their OWN immediate predecessor rung, not against bare defaults --
    // exactly how assemblePreset will apply them (cumulatively, in ladder order). Testing
    // such a rung cold, without first applying the rungs it was diffed against, can produce
    // a spurious singleton: a card the predecessor rung already moved out of its native slot
    // is still sitting there because that predecessor was never applied, so a later rung
    // re-introducing that same card elsewhere reads as a duplicate. Apply the full
    // predecessor chain for that item's own ladder first, matching real usage.
    let baseline = defaults;
    for (const priorCategory of LADDER_PREREQS[entry.kind] || []) {
      for (const priorItem of plan[priorCategory] || []) baseline = Lineup.applyChoice(plan, baseline, priorItem.id);
    }
    let tentative = Lineup.applyChoice(plan, baseline, entry.id);
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

// Win/Fun/Alt-commander ladders: every preset assembles to exactly the workbook's own
// 100-card column (T2/T3 -- the authoritative guard against by-name mis-chaining), and the
// alt-commander decks keep exactly one commander-slot occupant checked through every step
// of applying a preset (T6). Fixture is tools/import_budget_plan.py's own by-column record
// of the workbook it just read, so this re-derives fixture-equality from a live re-read
// each run rather than trusting a stale committed fixture.
const fixtures = JSON.parse(await readFile(new URL("../tests/fixtures/budget-plan-configs.json", import.meta.url), "utf8"));
const PRESET_CHAINS = [
  ["tuned2", "Tuned-2", ["required", "tuned2"]],
  ["enhance2", "Enhance-2", ["required", "tuned2", "enhance2"]],
  ["max2", "Max-2", ["required", "tuned2", "enhance2", "max2"]],
  ["funTuned", "Fun Tuned", ["funTuned"]],
  ["funMax", "Fun Max", ["funTuned", "funMax"]],
  ["altTuned", "Alt Tuned", ["altTuned"]],
  ["altMax", "Alt Max", ["altTuned", "altMax"]]
];
const BASIC_LAND_NAMES = new Set(["Forest", "Plains", "Island", "Swamp", "Mountain"]);
for (const variantId of ["1o", "2c", "3e", "4c", "5o", "6f"]) {
  const plan = buyPlans.plans[variantId];
  const deckFixture = fixtures[variantId];
  const isAltDeck = (plan.altTuned || []).length > 0;
  const baseSelection = Lineup.canonicalizeSelection(plan, {...Lineup.emptySelection(), shell: plan.startingShell.map((item) => String(item.id))});
  const actualBase = new Map();
  for (const entry of Lineup.selectedEntries(plan, baseSelection)) actualBase.set(entry.item.name, (actualBase.get(entry.item.name) || 0) + 1);
  assert.equal(Lineup.quantity(plan, baseSelection), 100, `${variantId}: the assembled Base must total 100`);
  for (const [presetKey, columnName, categoryOrder] of PRESET_CHAINS) {
    const expectedColumn = deckFixture.columns[columnName];
    if (!expectedColumn) continue; // Alt columns absent on decks without an alt commander

    let selection = Lineup.emptySelection();
    selection.shell = plan.startingShell.map((item) => String(item.id));
    selection = Lineup.canonicalizeSelection(plan, selection);
    for (const category of categoryOrder) for (const item of plan[category] || []) selection = Lineup.applyChoice(plan, selection, item.id);

    const entries = Lineup.selectedEntries(plan, selection);
    assert.equal(Lineup.quantity(plan, selection), 100, `${variantId}: assembled ${presetKey} preset must total 100`);
    const actual = new Map();
    for (const entry of entries) actual.set(entry.item.name, (actual.get(entry.item.name) || 0) + 1);
    // What the fixture is authoritative about is the LADDER: which purchase
    // lands in which slot, and what it displaces. It is no longer authoritative
    // about the shell, because Base is now built from measured criteria rather
    // than transcribed from the workbook (tools/sim/build-base.mjs). So the
    // comparison is of deltas -- the column minus its own Base column against
    // the assembled preset minus the assembled Base -- which pins every
    // by-name mis-chaining bug this check was written to catch while letting
    // the starting hundred be rebuilt underneath it.
    const delta = (over, under) => {
      const out = new Map();
      for (const [name, count] of over) if (!BASIC_LAND_NAMES.has(name)) out.set(name, (out.get(name) || 0) + count);
      for (const [name, count] of under) if (!BASIC_LAND_NAMES.has(name)) out.set(name, (out.get(name) || 0) - count);
      for (const [name, count] of Array.from(out)) if (count === 0) out.delete(name);
      return out;
    };
    // The Base rebuild swapped cards out of the starting shell, so a workbook
    // row that displaced "Seedborn Muse" now displaces whatever stood in for it.
    // Reading the substitution map lets the comparison stay card-for-card
    // instead of being loosened to a count, and any swap the map does not
    // account for still fails.
    //
    // A name is only substituted where it refers to the SHELL card. The same
    // name can also be a purchase -- 1o's Fun Max buys Seedborn Muse back after
    // the ladder replaced the shell copy -- and renaming that occurrence would
    // compare the workbook's purchase against a card nobody bought.
    const purchased = new Set(categoryOrder.flatMap((category) => (plan[category] || []).map((item) => item.name)));
    const substitutions = baseRebuild.variants[variantId]?.substitutions || {};
    const rename = (pairs, skip = new Set()) => pairs.map(([name, count]) => [skip.has(name) ? name : (substitutions[name] || name), count]);
    const expectedDelta = delta(rename(Object.entries(expectedColumn), purchased), rename(Object.entries(deckFixture.columns.Base || {})));
    const actualDelta = delta(actual, actualBase);
    for (const [name, count] of expectedDelta) {
      assert.equal(actualDelta.get(name) || 0, count, `${variantId}: assembling ${presetKey} must change ${name} by ${count} exactly as the workbook's ${columnName} column does against its Base`);
    }
    for (const [name, count] of actualDelta) {
      assert.equal(count, expectedDelta.get(name) || 0, `${variantId}: assembling ${presetKey} must not change ${name} — the workbook's ${columnName} column does not`);
    }

    if (isAltDeck && (presetKey === "altTuned" || presetKey === "altMax")) {
      const commanderSlotId = Lineup.buildModel(plan).entries.find((entry) => entry.item.isCommander)?.slotId;
      const commanderOccupants = entries.filter((entry) => entry.slotId === commanderSlotId);
      assert.equal(commanderOccupants.length, 1, `${variantId}: exactly one commander-slot occupant must remain checked after assembling ${presetKey}`);
    }
  }
}

// T8 -- lineage-uncheck is one-directional. applyChoice (used above, and by the preset
// dropdown) clears a slot group symmetrically: whichever entry you feed it wins, and every
// other occupant -- ancestor or descendant -- is cleared. That is correct for assembling a
// preset in ladder order, but wrong for an interactive click: found by exercising the real
// Buy Picks UI, checking a higher-tier card correctly clears what it replaces, but manually
// re-checking that cleared card then claws back the higher-tier pick, which is exactly the
// lock the product spec rules out ("re-checking a downstream/cleared card must NOT clear the
// upstream card"). applyLineageCheck exists to provide that asymmetry; this proves it holds
// both directions. Tries every later rung (not just max2), since a deck can legitimately have
// zero items at any one rung -- the workbook's chain-diff only emits a row where that column
// actually changed from its predecessor -- and still exercises real name-twin ambiguity along
// the way (e.g. a max2 card whose immediate predecessor column carried a tuned2 pick through
// unchanged, which shares its name with an unrelated original-ladder "tuned" card at the same
// slot -- resolveRoot's own ladder-chain walk, just above, is what keeps predecessorId pointed
// at the right twin instead of that unrelated one).
for (const variantId of ["1o", "2c", "3e", "4c", "5o", "6f"]) {
  const plan = buyPlans.plans[variantId];
  if (!Array.isArray(plan.tuned2) || !plan.tuned2.length) continue;
  const model = Lineup.buildModel(plan);
  let exercised = 0;
  for (const [rung, prereqs] of Object.entries(LADDER_PREREQS)) {
    if (!plan[rung]?.length) continue;
    let baseline = Lineup.emptySelection();
    baseline.shell = plan.startingShell.map((item) => String(item.id));
    baseline = Lineup.canonicalizeSelection(plan, baseline);
    for (const category of ["required", ...prereqs]) {
      for (const item of plan[category] || []) baseline = Lineup.applyChoice(plan, baseline, item.id);
    }
    const baselineIds = new Set(Lineup.ARRAY_KEYS.flatMap((key) => baseline[key] || []).map(String));
    for (const candidate of plan[rung]) {
      const candidateEntry = model.byId.get(String(candidate.id));
      const ancestor = model.byId.get(candidateEntry?.predecessorId);
      if (!ancestor || !baselineIds.has(ancestor.id)) continue;
      const afterCheck = Lineup.applyLineageCheck(plan, baseline, candidate.id);
      const checkedAfterCheck = new Set(Lineup.ARRAY_KEYS.flatMap((key) => afterCheck[key] || []).map(String));
      assert(checkedAfterCheck.has(String(candidate.id)), `${variantId}: checking ${candidate.name} (${rung}) must leave it checked`);
      assert(!checkedAfterCheck.has(ancestor.id), `${variantId}: checking ${candidate.name} (${rung}) must clear its replaced ancestor ${ancestor.item.name}`);
      const afterRecheck = Lineup.applyLineageCheck(plan, afterCheck, ancestor.id);
      const checkedAfterRecheck = new Set(Lineup.ARRAY_KEYS.flatMap((key) => afterRecheck[key] || []).map(String));
      assert(checkedAfterRecheck.has(ancestor.id), `${variantId}: re-checking ${ancestor.item.name} must succeed (nothing ever blocks)`);
      assert(checkedAfterRecheck.has(String(candidate.id)), `${variantId}: re-checking ${ancestor.item.name} must NOT clear the higher-tier ${candidate.name} (${rung}) it was replaced by (one-directional, no lock)`);
      exercised++;
    }
  }
  assert(exercised > 0, `${variantId}: expected at least one later-rung entry with a checked ancestor to exercise one-directional lineage-uncheck`);
}

function composeWith(plan, categories) {
  let selection = Lineup.canonicalizeSelection(plan, {...Lineup.emptySelection(), shell: plan.startingShell.map((item) => String(item.id))});
  for (const category of categories) for (const item of plan[category] || []) selection = Lineup.applyChoice(plan, selection, item.id);
  return Lineup.selectedEntries(plan, selection).map((entry) => entry.item);
}
const tunedList = (plan) => composeWith(plan, ["required", "tuned2"]);
const maxList = (plan) => composeWith(plan, ["required", "tuned2", "upgrade", "enhance", "enhance2", "max", "max2"]);

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
// The strategy floor now sits on the builds that get played rather than on the
// starting shell. Base is deliberately the underperforming rung -- cheap
// placeholders held until the real cards arrive (tools/sim/build-base.mjs) --
// so a strong, expensive strategy card moving off it and up to Tuned is the
// design working, not a regression. What must not happen is the deck losing its
// plan in the builds you actually sleeve up.
for (const [rung, cards] of [["Tuned", tunedList(buyPlans.plans["2a"])], ["Max", maxList(buyPlans.plans["2a"])]]) {
  const held = cards.filter((card) => strategyMatches(card, dimirStrategyPatterns));
  assert.ok(held.length >= 4, `Dimir Theft's ${rung} build must still run its theft, reanimation, copy and trigger-doubling plan (found ${held.length}: ${held.map((card) => card.name).join(", ")})`);
}
assert.ok(dimirGenerated.filter((card) => strategyMatches(card, dimirStrategyPatterns)).length >= 4, "Dimir Theft's Base rung may be weak, but it may not stop being a theft deck");
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
