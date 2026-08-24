import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const variants = JSON.parse(await readFile(new URL("../data/variants.json", import.meta.url), "utf8"));
const buyPlans = JSON.parse(await readFile(new URL("../data/buy-plans.json", import.meta.url), "utf8"));
const cards = JSON.parse(await readFile(new URL("../data/cards.json", import.meta.url), "utf8"));
const simulationSummary = JSON.parse(await readFile(new URL("../data/simulation-summary.json", import.meta.url), "utf8"));
const appSource = await readFile(new URL("../app.js", import.meta.url), "utf8");
const auditedByName = new Map(cards.cards.map((card) => [card.name.toLowerCase(), card]));
for (const card of cards.cards) for (const face of card.name.split(" // ")) auditedByName.set(face.toLowerCase(), card);

assert.equal(variants.decks.length, 6, "expected six deck roles");
assert.equal(variants.variants.length, 30, "expected thirty variants");

const ids = new Set(variants.variants.map((variant) => variant.id));
assert.equal(ids.size, 30, "variant IDs must be unique");
assert.equal(Object.keys(buyPlans.plans).length, 30, "every Compare variant must have a Buy Picks profile");
assert.deepEqual(new Set(buyPlans.profileVariantIds), ids, "Buy Picks coverage must match the Compare catalog");

for (const deck of variants.decks) {
  const deckVariants = variants.variants.filter((variant) => variant.deckId === deck.id);
  assert.equal(
    deckVariants.length,
    5,
    `deck ${deck.id} must contain five variants`
  );
  for (const stageIndex of [0, 1, 2]) {
    assert.deepEqual(
      deckVariants.map((variant) => variant.ranks[stageIndex]).sort(),
      [1, 2, 3, 4, 5],
      `deck ${deck.id} stage ${stageIndex + 1} ranks must be complete`
    );
  }
}

for (const variant of variants.variants) {
  assert(variant.detailHtml.length > 1000, `${variant.id} must retain its long-form report`);
  assert(!variant.detailHtml.includes("data:image"), `${variant.id} detail must use external card art`);
  assert(variant.mechanics.length > 0, `${variant.id} must expose at least one filterable mechanic`);
  assert.equal(variant.scores.playstyle.length, 3);
  assert.equal(variant.scores.engine.length, 3);
  assert(variant.scores.playstyle.every((stage) => stage.length === 6), `${variant.id} must retain six playstyle scores per stage`);
  assert(variant.scores.engine.every((stage) => stage.length === 6), `${variant.id} must retain six engine scores per stage`);
  assert.equal(variant.scores.growth.length, 2, `${variant.id} must retain growth scoring`);
}

for (const [variantId, plan] of Object.entries(buyPlans.plans)) {
  assert(ids.has(variantId), `${variantId} must map to a Compare variant`);
  assert.equal(plan.variantId, variantId);
  assert.equal(plan.precon.category, "precon");
  assert.equal(plan.precon.typeLine, "Precon", `${variantId} precon must use the compact type label`);
  assert(plan.precon.manaCost, `${variantId} precon must carry its commander's mana cost`);
  if (plan.sourceKind === "original-shopping-guide") assert(plan.planHtml.length > 1000, `${variantId} must retain its complete shopping-guide plan`);
  else assert.equal(plan.sourceKind, "variant-detail-profile", `${variantId} must identify its profile source`);
  assert(plan.baseCards.length > 0, `${variantId} must retain its modeled starting list`);
  assert(plan.baseCards.reduce((sum, card) => sum + card.quantity, 0) > 70, `${variantId} starting list must be substantial enough for deck checks`);
  assert.equal(plan.startingShell.reduce((sum, card) => sum + card.quantity, 0), 100, `${variantId} must model exactly 100 starting cards`);
  assert.equal(plan.startingShell.filter((card) => card.isCommander).reduce((sum, card) => sum + card.quantity, 0), 1, `${variantId} must identify exactly one commander`);
  assert.equal(plan.startingShell.filter((card) => card.isCommander || card.tags.some((tag) => String(tag).toLowerCase() === "commander")).reduce((sum, card) => sum + card.quantity, 0), 1, `${variantId} must expose exactly one commander to the compliance check`);
  if (plan.startingShellKind === "official-precon") assert(!plan.startingShell.some((card) => card.isFlexibleSlot), `${variantId} official precon may not contain unspecified slots`);
  assert(plan.precon.buyRank && plan.precon.buyStrategy && plan.precon.buyFirst, `${variantId} precon must retain its buying plan`);
  assert(plan.precon.commanderNote && plan.precon.tcgplayerUrl, `${variantId} precon must retain commander and purchase detail`);
  assert(plan.required.every((item) => item.category === "tuned"));
  assert.equal(plan.upgrade.length, 0, `${variantId} must merge legacy Upgrade cards into Enhance`);
  assert(plan.enhance.every((item) => item.category === "enhance"));
  assert(plan.enhance.every((item) => !item.price || item.price <= 15), `${variantId} Enhance cards must stay at or below $15`);
  assert(plan.enhance.every((item) => !item.ceiling || item.ceiling <= 15), `${variantId} Enhance ceiling prices must stay at or below $15`);
  assert([...plan.required, ...plan.upgrade, ...plan.enhance, ...plan.max].every((item) => Number.isFinite(item.price)), `${variantId} purchase options must have a current floor price`);
  assert([plan.precon, ...plan.startingShell, ...plan.required, ...plan.upgrade, ...plan.enhance, ...plan.max].every((item) => !Number.isFinite(Number(item.ceiling)) || Number(item.ceiling) <= 0 || Number(item.price) <= Number(item.ceiling)), `${variantId} floor prices may not exceed user-supplied ceilings`);
  assert(plan.max.every((item) => item.category === "max"));
  assert(plan.max.every((item) => item.maxReason && !/market price|purchase cost|card price|dollar/i.test(item.maxReason)), `${variantId} Max cards must have capability-based rationale`);
  assert([...plan.required, ...plan.enhance].every((item) => item.replaces), `${variantId} Tuned and Enhance purchases must name a one-for-one cut`);
  const allItems = [plan.precon, ...plan.required, ...plan.upgrade, ...plan.enhance, ...plan.max];
  const singletonChoiceNames = [...plan.startingShell, ...plan.required, ...plan.enhance, ...plan.max].map((item) => item.name.split(" // ")[0].toLowerCase());
  assert.equal(new Set(singletonChoiceNames).size, singletonChoiceNames.length, `${variantId} may not offer the same singleton card in two lineup slots`);
  assert(allItems.every((item) => !String(item.image).startsWith("data:")), `${variantId} must not embed images`);
  assert([...plan.required, ...plan.upgrade, ...plan.enhance, ...plan.max].every((item) => item.brief && item.why !== undefined), `${variantId} purchases must retain detail fields`);
  const commander = plan.startingShell.find((card) => card.isCommander);
  const identity = new Set(auditedByName.get(commander.name.toLowerCase()).colorIdentity);
  for (const item of [...plan.startingShell, ...plan.required, ...plan.enhance, ...plan.max].filter((card) => !card.isFlexibleSlot)) {
    const audited = auditedByName.get(item.name.toLowerCase());
    assert(audited, `${variantId}: ${item.name} must exist in the authoritative audit`);
    assert.equal(audited.legalities.commander, "legal", `${variantId}: ${item.name} must be Commander legal`);
    assert(audited.colorIdentity.every((color) => identity.has(color)), `${variantId}: ${item.name} must fit ${commander.name}'s color identity`);
    assert.equal(item.typeLine, audited.typeLine, `${variantId}: ${item.name} must use its audited type line`);
  }
}

assert.equal(cards.missing.length, 0, "all modeled cards must resolve in the authoritative audit");
assert.equal(cards.cards.length, buyPlans.cardAudit.cardsVerified, "audit summary must match the static card catalog");
assert.match(buyPlans.enhanceDefinition, /\$15/, "Enhance definition must state the $15 limit");
assert.match(buyPlans.maxDefinition, /Tier 3/i, "Max must be defined by the Tier 3 capability ceiling");
assert.match(buyPlans.maxDefinition, /rather than card price/i, "Max may not be classified by cost");

const expectedOwnedEnhance = new Map([
  ["Gollum, Riddle Master", ["2c", "Wall of Omens"]],
  ["Giant's Boulder", ["2c", "Chromatic Lantern"]],
  ["Troll Negotiations", ["2c", "Vraska's Contempt"]],
  ["Mirkwood", ["3e", "Foul Orchard"]],
  ["Ragged Short Spear", ["5o", "Monologue Tax"]],
  ["Lake-town Lookout", ["6c", "Wall of Blossoms"]],
  ["Stony-Voiced Goblins", ["6c", "Wall of Blossoms"]],
  ["Great Fierce Bee", ["6c", "Luminous Broodmoth"]]
]);
for (const [name, [variantId, replaces]] of expectedOwnedEnhance) {
  const item = buyPlans.plans[variantId].enhance.find((card) => card.name === name);
  assert(item?.ownedExtra, `${name} must be an owned Enhance option in ${variantId}`);
  assert.equal(item.replaces, replaces, `${name} must replace ${replaces}`);
}
assert(buyPlans.plans["5o"].startingShell.find((card) => card.name === "Augusta, Order Returned")?.ownedExtra, "Augusta, Order Returned is already in the official Quintorius shell and must be marked owned without creating an illegal duplicate option");
for (const name of ["Giant's Boulder", "Troll Negotiations", "Great Fierce Bee"]) {
  const item = Object.values(buyPlans.plans).flatMap((plan) => plan.enhance).find((card) => card.name === name);
  assert(item?.temporaryUntil, `${name} must identify its temporary-until target`);
}
const salvageNames = new Set((buyPlans.salvage || []).flatMap((card) => [card.name, ...card.name.split(" // ")]));
for (const name of ["Bilbo Baggins, Burglar", "Dwarven Mattock", "Dwarven Mauler", "Dwarven Shortsword", "Gundabad Opportunist", "Guardian of the Halls"]) assert(salvageNames.has(name), `${name} must be in Salvage`);
assert((buyPlans.salvage || []).every((card) => card.reason && card.image && card.typeLine), "Salvage cards must retain an audited reason and card data");
assert(buyPlans.ownedExtras.includes("Bilbo Baggins, Burglar // Take a Glance"), "owned import must include Bilbo's canonical Adventure name");
for (const name of ["Naktamun Lorespinner // Wheel of Fortune", "Kirol, History Buff // Pack a Punch", "Lorehold Archivist // Restore Relic"]) assert(buyPlans.ownedExtras.includes(name), `${name} must use its canonical ownership key`);
assert(buyPlans.ownedExtras.length >= 93, "the complete photographed ownership table must be present");
const selectedLiveVariantIds = ["1b", "2c", "3e", "4b", "5o", "6c"];
const normalizeOwnedName = (value) => String(value || "").split(" // ")[0].toLowerCase();
const visibleOwnedCards = new Map();
for (const variantId of selectedLiveVariantIds) {
  const plan = buyPlans.plans[variantId];
  for (const item of [...plan.startingShell, ...plan.required, ...plan.enhance, ...plan.max]) {
    if (item.ownedExtra) visibleOwnedCards.set(normalizeOwnedName(item.name), item);
  }
}
for (const item of buyPlans.salvage || []) if (item.ownedExtra) visibleOwnedCards.set(normalizeOwnedName(item.name), item);
for (const name of buyPlans.ownedExtras.filter((item) => !item.startsWith("Lorehold Spirit ("))) {
  assert(visibleOwnedCards.has(normalizeOwnedName(name)), `${name} must be a visible owned choice in a selected Live Deck or Salvage`);
}
const farewells = Object.values(buyPlans.plans).flatMap((plan) => plan.max).filter((card) => card.name === "Farewell");
assert(farewells.length > 0 && farewells.every((card) => card.gameChanger), "Farewell must be a Max Game Changer under the current list");
assert(Object.values(buyPlans.plans).every((plan) => !plan.enhance.some((card) => card.name === "Farewell")), "Farewell may not remain in Enhance");
assert(buyPlans.plans["5o"].max.filter((card) => card.gameChanger).length > 3, "Quintorius may offer more than three Game Changer alternatives");
assert.doesNotMatch(appSource, /const baseCompliance = evaluateDeckCompliance\(plan, tentative\)/, "Buy Picks checkboxes must not pre-evaluate a hypothetical selection before applying a click");
assert.match(appSource, /assignSelection\(currentState, Lineup\.applyLineageCheck\(plan, currentState, itemId\)\)/, "checking a Buy Picks card must clear its replaced lineage one-directionally, via applyLineageCheck (not applyChoice's symmetric slot-group clearance, which the preset dropdown uses instead) -- so re-checking a card it cleared can never claw back the higher-tier pick that replaced it");
assert.match(appSource, /currentState\[kind\] = \(currentState\[kind\] \|\| \[\]\)\.filter\(\(id\) => id !== itemId\);/, "unchecking a Buy Picks card must remain a plain, independent removal with no side effects on any other item");
assert.match(appSource, /\$\{boughtCount\}\/100<\/b><small>bought/, "collapsed Live Deck headers must show the physically bought count");
assert.match(appSource, /\$\{total\}\/100<\/b><small>active/, "collapsed Live Deck headers must show the active-lineup count");
assert.match(appSource, /data-live-total="\$\{esc\(variant\.id\)\}"/, "collapsed Live Deck headers must show a committed Total Cost");
assert.match(appSource, /if \(metadataAttempts\.get\(key\)\) return;/, "card metadata may only be requested once per session, or unresolved cards re-render the app forever");
assert.match(appSource, /Precon Pack/, "cards that arrive inside a sealed precon must be labelled instead of priced");
assert.doesNotMatch(appSource, /live-critical-insight/, "the duplicate readiness banner must stay out of the Live Deck header");
assert.doesNotMatch(appSource, /Saved on this device"\);\n\s*renderCompare/, "reset must not depend on the removed save-status label");
for (const view of ["compare", "buy", "shop", "live"]) {
  assert.match(appSource, new RegExp(`^\\s{4}${view}: \\[`, "m"), `the tour must define its own steps for the ${view} view`);
}
assert.match(appSource, /function exportLiveDecks/, "Live Decks must be exportable as a flat inventory");
assert.match(appSource, /mtg-owned-extras-import-v3/, "the complete known inventory must migrate onto each browser once");
assert.doesNotMatch(appSource, /plan\.max\.filter\(\(candidate\) => candidate\.gameChanger && choices\.has/, "the Game Changer guard may not count Max options only");
assert(!buyPlans.plans["1c"].max.some((card) => card.name === "Exquisite Blood"), "Exquisite Blood must stay outside the Liesa Tier 3 pool because of redundant early two-card wins");
for (const variantId of ["4a", "6f"]) {
  const drake = buyPlans.plans[variantId].max.find((card) => card.name === "Peregrine Drake");
  assert(drake?.tags.some((tag) => /late two-card infinite combo/i.test(tag)), `${variantId} Peregrine Drake must be Max with its late combo documented`);
  assert(!buyPlans.plans[variantId].enhance.some((card) => card.name === "Peregrine Drake"), `${variantId} Peregrine Drake may not remain Enhance`);
}
assert(buyPlans.plans["6f"].max.some((card) => card.name === "Agent of Treachery"), "Yarok Agent of Treachery must be Max capability");
for (const [variantId, name] of [["2e", "Alhammarret's Archive"], ["3c", "Ancient Greenwarden"], ["3o", "Ancient Greenwarden"], ["5f", "Kinsbaile Cavalier"], ["6d", "Kinnan, Bonder Prodigy"]]) {
  assert(buyPlans.plans[variantId].max.some((card) => card.name === name), `${variantId} ${name} must be Max for capability, not price`);
  assert(!buyPlans.plans[variantId].enhance.some((card) => card.name === name), `${variantId} ${name} may not remain Enhance`);
}
for (const [variantId, name] of [
  ["1o", "Branching Evolution"], ["1a", "Pitiless Plunderer"], ["1a", "Skullclamp"], ["2a", "Hullbreaker Horror"],
  ["2b", "Deserted Temple"], ["4b", "Cyberdrive Awakener"], ["4e", "Deadeye Navigator"], ["5o", "Skullclamp"],
  ["5o", "Sunforger"], ["5e", "Rhys the Redeemed"], ["6f", "Woodland Bellower"]
]) {
  assert(buyPlans.plans[variantId].max.some((card) => card.name === name), `${variantId} ${name} must be Max after the capability audit`);
  assert(!buyPlans.plans[variantId].enhance.some((card) => card.name === name), `${variantId} ${name} may not remain Enhance after the capability audit`);
}
for (const [variantId, name] of [["2o", "Blowfly Infestation"], ["4a", "Strionic Resonator"]]) {
  assert(![...buyPlans.plans[variantId].enhance, ...buyPlans.plans[variantId].max].some((card) => card.name === name), `${variantId} ${name} must stay outside strict Tier 3 options`);
  assert(buyPlans.tier3Excluded.some((card) => card.variantId === variantId && card.name === name && card.reason), `${variantId} ${name} must retain its exclusion rationale`);
}
for (const [variantId, name] of [["1e", "Earthcraft"], ["6f", "Cloudstone Curio"]]) {
  const card = buyPlans.plans[variantId].max.find((candidate) => candidate.name === name);
  assert(card?.tags.some((tag) => /late three-card infinite combo/i.test(tag)), `${variantId} ${name} must document its late three-card line`);
}
for (const [variantId, collection, name] of [
  ["1o", "startingShell", "Seedborn Muse"],
  ["1b", "startingShell", "Seedborn Muse"],
  ["1e", "startingShell", "Seedborn Muse"],
  ["2a", "required", "Notion Thief"],
  ["4b", "required", "Smothering Tithe"]
]) {
  assert(buyPlans.plans[variantId][collection].find((card) => card.name === name)?.gameChanger, `${variantId} ${name} must consume a current Game Changer slot`);
}

// Win/Fun/Alt-commander ladders (tools/import_budget_plan.py), six target decks only --
// the other 24 variants have no -2/Fun/Alt data and must not gain empty placeholder arrays
// (lineup-model.js's `plan?.tuned2 || []` already degrades an absent key gracefully).
const NEW_CATEGORIES = ["tuned2", "enhance2", "max2", "funTuned", "funMax", "altTuned", "altMax"];
const ALT_DECKS = new Set(["1o", "3e", "5o"]);
for (const variantId of ["1o", "2c", "3e", "4c", "5o", "6f"]) {
  const plan = buyPlans.plans[variantId];
  for (const category of NEW_CATEGORIES) {
    if ((category === "altTuned" || category === "altMax") && !ALT_DECKS.has(variantId)) {
      assert.equal((plan[category] || []).length, 0, `${variantId} has no alternative commander -- ${category} must stay empty`);
      continue;
    }
    const items = plan[category];
    assert(Array.isArray(items), `${variantId} must have a ${category} array, even if a given rung had no further changes`);
    for (const item of items) {
      assert.equal(item.category, category, `${variantId} ${item.name} (${category}) must self-report its own category`);
      assert(Number.isFinite(item.price), `${variantId} ${item.name} (${category}) must have a finite price`);
      assert(auditedByName.has(item.name.toLowerCase()), `${variantId} ${item.name} (${category}) must exist in the authoritative audit`);
      assert.equal(auditedByName.get(item.name.toLowerCase()).legalities.commander, "legal", `${variantId} ${item.name} (${category}) must be Commander legal`);
    }
  }
  const commanderCandidates = (plan.altTuned || []).filter((item) => item.isCommander);
  if (ALT_DECKS.has(variantId)) assert.equal(commanderCandidates.length, 1, `${variantId} must flag exactly one Alt Tuned item as the alternative commander`);
  else assert.equal(commanderCandidates.length, 0, `${variantId} has no alternative commander to flag`);
}

// Real simulation results (tools/import_summary_metrics.py), Phase 3's data source for the
// Buy Picks header's additive readout and the Compare-page alt-commander preview. Base/
// Enhance/Max are the site's own published lists and must stay unsimulated (no games/score);
// everything else must carry a finite games/score/winPct and a recognized verdict, tagged
// with the engine generation that actually measured it -- never inferred at render time.
assert(simulationSummary.engineNotes?.v1 && simulationSummary.engineNotes?.["v2.1"], "simulation summary must document both engine generations");
assert(typeof simulationSummary.engineBoundaryNote === "string" && simulationSummary.engineBoundaryNote.length > 0, "simulation summary must carry a v1/v2.1 boundary caveat");
const UNSIMULATED_BUILDS = new Set(["Base", "Enhance", "Max"]);
const SIMULATED_ENGINE = {
  "Tuned": "v1", "Tuned-2": "v1", "Enhance-2": "v1", "Max-2": "v1",
  "Fun Tuned": "v2.1", "Fun Max": "v2.1", "Alt Tuned": "v2.1", "Alt Max": "v2.1"
};
const VALID_VERDICTS = new Set(["confirmed", "within-noise", "not-confirmed", "no-change"]);
assert.deepEqual(Object.keys(simulationSummary.builds).sort(), ["1o", "2c", "3e", "4c", "5o", "6f"], "simulation summary must cover exactly the six decks with new-ladder data");
for (const [variantId, deckBuilds] of Object.entries(simulationSummary.builds)) {
  const expectedBuilds = new Set(["Base", "Tuned", "Enhance", "Max", "Tuned-2", "Enhance-2", "Max-2", "Fun Tuned", "Fun Max"]);
  if (ALT_DECKS.has(variantId)) { expectedBuilds.add("Alt Tuned"); expectedBuilds.add("Alt Max"); }
  assert.deepEqual(new Set(Object.keys(deckBuilds)), expectedBuilds, `${variantId}: simulation summary must report exactly its expected builds`);
  for (const [buildName, metrics] of Object.entries(deckBuilds)) {
    if (UNSIMULATED_BUILDS.has(buildName)) {
      assert.equal(metrics.games, null, `${variantId} ${buildName}: a published-only build must not carry a simulated game count`);
      assert.equal(metrics.engine, null, `${variantId} ${buildName}: a published-only build must not carry an engine tag`);
    } else {
      assert(Number.isFinite(metrics.games) && metrics.games > 0, `${variantId} ${buildName}: a simulated build must report a positive game count`);
      assert(Number.isFinite(metrics.score), `${variantId} ${buildName}: a simulated build must report a finite score`);
      assert(Number.isFinite(metrics.winPct) && metrics.winPct > 0 && metrics.winPct < 1, `${variantId} ${buildName}: win rate must be a fraction between 0 and 1`);
      assert(VALID_VERDICTS.has(metrics.verdict), `${variantId} ${buildName}: verdict must be one of the four documented outcomes, got ${metrics.verdict}`);
      assert.equal(metrics.engine, SIMULATED_ENGINE[buildName], `${variantId} ${buildName}: engine tag must match the documented v1/v2.1 split`);
    }
  }
}
assert.deepEqual(Object.keys(simulationSummary.altCommanderCases).sort(), ["1o", "3e", "5o"], "alt-commander comparison cases must cover exactly the three alt-commander decks");
for (const variantId of ["1o", "3e", "5o"]) {
  const altCase = simulationSummary.altCommanderCases[variantId];
  const plan = buyPlans.plans[variantId];
  const shellCommander = plan.startingShell.find((card) => card.isCommander);
  const altCommander = plan.altTuned.find((item) => item.isCommander);
  assert.equal(altCase.currentCommander, shellCommander.name, `${variantId}: simulation summary's current commander must match the plan's own shell commander`);
  assert.equal(altCase.altCommander, altCommander.name, `${variantId}: simulation summary's alternative commander must match the plan's own Alt Tuned commander`);
  assert(altCase.honestRead.length > 40, `${variantId}: alt-commander case must carry a substantive caution paragraph, not a stub`);
}
assert.match(appSource, /function nearestPresetMatch/, "the Buy Picks header must compute which preset the live selection actually resembles");
assert.match(appSource, /metricFamilyMarkup\("playstyle", playstyle, `metric-playstyle-\$\{variant\.id\}-buy`\)/, "the Buy Picks metric strip must reuse the Compare page's own playstyle scores");
{
  const start = appSource.indexOf("function dynamicMetricsHeaderMarkup");
  const end = appSource.indexOf("function simulationReadoutMarkup", start);
  assert(start > 0 && end > start, "dynamicMetricsHeaderMarkup and simulationReadoutMarkup must both be defined, in that order");
  assert.doesNotMatch(appSource.slice(start, end), /metricFamilyMarkup\("growth"/, "the Buy Picks metric strip must exclude Growth, matching the Compare page's own instruction");
}
assert.match(appSource, /simulationSummary\.engineBoundaryNote/, "a rendered simulation result must always carry the v1\\/v2.1 engine-boundary caveat");

// Phase 4 -- Live Decks/Shop List flow-through for the seven new categories, plus the Alt
// filter and the advisory performance check. levelByKind is the load-bearing map: any new
// category missing from it silently mislabels that card as "Starting Shell" everywhere
// downstream (badges, filters, CSV) -- see the git history for exactly that bug, caught by
// Playwright before this pin existed.
{
  const start = appSource.indexOf("const levelByKind = {");
  const end = appSource.indexOf("};", start);
  const levelByKindBody = appSource.slice(start, end);
  for (const category of NEW_CATEGORIES) {
    assert.match(levelByKindBody, new RegExp(`${category}: \\[`), `configuredDeckCards's levelByKind must map ${category} to a real Live Decks level, not fall through to Starting Shell`);
  }
}
assert.match(appSource, /liveFilterSelect\("category", "Level", LEVEL_FILTER_OPTIONS, filters\.category\)/, "the Live Decks Level filter must use the shared option list");
assert.match(appSource, /selectFilter\("category", "Level", LEVEL_FILTER_OPTIONS, filters\)/, "the Shop List Level filter must use the SAME shared option list as Live Decks, not a separately hand-maintained duplicate");
for (const category of NEW_CATEGORIES) {
  assert(appSource.includes(`["${category}"`), `LEVEL_FILTER_OPTIONS must offer ${category} as a Level filter choice`);
}
assert.match(appSource, /filters\.alt === "alt" && !card\.tags\?\.includes\("alt"\)/, "the Live Decks Alt filter must check the card's own alt tag");
assert.match(appSource, /filters\.alt === "alt" && !item\.tags\?\.includes\("alt"\)/, "the Shop List Alt filter must check the item's own alt tag");
assert.match(appSource, /hasAltData \? liveFilterSelect\("alt"/, "the Live Decks Alt filter control must be conditional on the deck actually having alt-commander data");
const shopFiltersSource = await readFile(new URL("../shop-filters.js", import.meta.url), "utf8");
assert.match(shopFiltersSource, /FILTER_KEYS = \[.*"alt"/, "shop-filters.js's own DOM-scraping Alt filter must be registered in FILTER_KEYS");
assert.match(shopFiltersSource, /cardIsAlt/, "shop-filters.js must read the Alt badge app.js renders, not guess from card text");

// Advisory performance check -- never a gate. Pin both the role-floor numbers themselves and
// the literal words confirming the disclosure is advisory, so a future edit can't silently
// turn "heads-up" into a block without a test noticing.
assert.match(appSource, /const ROLE_FLOORS = \{ramp: 8, draw: 8, interaction: 8, protect: 3\};/, "role-floor advisory must use the documented 8\\/8\\/8\\/3 floors");
assert.match(appSource, /it never blocks anything/, "the performance check must say plainly that it never blocks");
{
  const start = appSource.indexOf("function livePerformanceCheck(");
  const end = appSource.indexOf("function livePerformanceCheckMarkup", start);
  assert(start > 0 && end > start, "livePerformanceCheck and livePerformanceCheckMarkup must both be defined, in that order");
  assert.doesNotMatch(appSource.slice(start, end), /return false/, "the performance check must never be able to gate or refuse a selection");
}

console.log(`Validated ${variants.variants.length} variants and ${Object.keys(buyPlans.plans).length} connected buy profiles.`);
