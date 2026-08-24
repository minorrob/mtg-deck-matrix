import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const variants = JSON.parse(await readFile(new URL("../data/variants.json", import.meta.url), "utf8"));
const buyPlans = JSON.parse(await readFile(new URL("../data/buy-plans.json", import.meta.url), "utf8"));
const cards = JSON.parse(await readFile(new URL("../data/cards.json", import.meta.url), "utf8"));
const simulationSummary = JSON.parse(await readFile(new URL("../data/simulation-summary.json", import.meta.url), "utf8"));
const appSource = await readFile(new URL("../app.js", import.meta.url), "utf8");
const htmlSource = await readFile(new URL("../index.html", import.meta.url), "utf8");
const auditedByName = new Map(cards.cards.map((card) => [card.name.toLowerCase(), card]));
for (const card of cards.cards) for (const face of card.name.split(" // ")) auditedByName.set(face.toLowerCase(), card);

assert.equal(variants.decks.length, 10, "expected ten deck roles");
assert.equal(variants.variants.length, 50, "expected fifty variants");

const ids = new Set(variants.variants.map((variant) => variant.id));
assert.equal(ids.size, 50, "variant IDs must be unique");
assert.equal(Object.keys(buyPlans.plans).length, 50, "every Compare variant must have a Buy Picks profile");
assert.deepEqual(new Set(buyPlans.profileVariantIds), ids, "Buy Picks coverage must match the Compare catalog");

// The Compare "About" panel replaced a one-line carousel card with a full dossier per deck --
// every deck object must carry the extended fields it reads, not just title/objective.
const DECK_ABOUT_FIELDS = ["archetype", "whatItIs", "fitAmongTen", "playstyle", "mood", "winCondition", "asksOfYou", "whenToPickThis", "priorityNote"];
for (const deck of variants.decks) {
  const deckVariants = variants.variants.filter((variant) => variant.deckId === deck.id);
  assert.equal(
    deckVariants.length,
    5,
    `deck ${deck.id} must contain five variants`
  );
  for (const field of DECK_ABOUT_FIELDS) {
    assert(typeof deck[field] === "string" && deck[field].length > 20, `deck ${deck.id} must carry a real "${field}" for the About panel`);
  }
  assert(deck.complexity?.tier && deck.complexity?.why, `deck ${deck.id} must carry a complexity tier and rationale`);
  assert(Number.isInteger(deck.priorityRank?.rank) && deck.priorityRank.rank >= 1 && deck.priorityRank.rank <= variants.decks.length, `deck ${deck.id} priority rank must be within 1..${variants.decks.length}`);
  assert(typeof deck.priorityRank?.rationale === "string" && deck.priorityRank.rationale.length > 10, `deck ${deck.id} priority rank must carry a rationale`);
  for (const stageIndex of [0, 1, 2]) {
    assert.deepEqual(
      deckVariants.map((variant) => variant.ranks[stageIndex]).sort(),
      [1, 2, 3, 4, 5],
      `deck ${deck.id} stage ${stageIndex + 1} ranks must be complete`
    );
  }
}
{
  const ranks = variants.decks.map((deck) => deck.priorityRank.rank).sort((a, b) => a - b);
  assert.deepEqual(ranks, variants.decks.map((_, i) => i + 1), "priority ranks must be a complete 1..N ordering with no gaps or duplicates");
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
  assert(plan.enhance.every((item) => !item.price || item.price <= 20), `${variantId} Enhance cards must stay at or below $20`);
  assert(plan.enhance.every((item) => !item.ceiling || item.ceiling <= 20), `${variantId} Enhance ceiling prices must stay at or below $20`);
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
assert.match(buyPlans.enhanceDefinition, /\$20/, "Enhance definition must state the $20 limit");
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
// A card can also be visible because a variant is deliberately held to it. Two
// of the marquee owned cards (Atraxa, Arcades) are commanders of variants that
// are not in today's selected six, so without this they would read as owned but
// unreachable. The locks are enumerated in data rather than inferred, so the
// exemption cannot quietly grow to cover an owned card that really is homeless.
assert(Array.isArray(buyPlans.ownedLocks) && buyPlans.ownedLocks.length >= 2, "owned marquee cards must be locked to named variants");
for (const lock of buyPlans.ownedLocks) {
  const plan = buyPlans.plans[lock.variantId];
  assert(plan, `owned lock names variant ${lock.variantId}, which does not exist`);
  const item = [...plan.startingShell, ...plan.required, ...plan.upgrade, ...plan.enhance, ...plan.max, ...(plan.tuned2 || [])].find((entry) => entry.name === lock.card);
  assert(item, `${lock.variantId} is locked to ${lock.card} but does not contain it`);
  assert(item.ownedExtra, `${lock.card} must be marked owned in ${lock.variantId}`);
  assert(lock.why, `the lock on ${lock.card} in ${lock.variantId} must say why`);
  assert(buyPlans.ownedExtras.includes(lock.card), `${lock.card} must be in ownedExtras to be locked as owned`);
  visibleOwnedCards.set(normalizeOwnedName(lock.card), item);
}
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
assert.match(appSource, /<b title="\$\{checkedCount\} of \$\{count\} checked to buy">\$\{checkedCount\}\/\$\{count\}<\/b>/, "collapsed Starting Shell type rows must show checked-to-buy over the group total");
// The flat buySection this pin was written for was replaced by tabbed ladder groups, but the
// behaviour it protects is not superseded: a shut group must still report shopping progress,
// since the per-tab counts only render once it is open.
assert.match(appSource, /<b title="\$\{groupChecked\} of \$\{groupTotal\} checked to buy">\$\{groupChecked\}\/\$\{groupTotal\}<\/b>/, "collapsed ladder groups must show checked-to-buy over the group total");
assert.match(appSource, /if \(metadataAttempts\.get\(key\)\) return;/, "card metadata may only be requested once per session, or unresolved cards re-render the app forever");
assert.match(appSource, /Precon Pack/, "cards that arrive inside a sealed precon must be labelled instead of priced");
assert.doesNotMatch(appSource, /live-critical-insight/, "the duplicate readiness banner must stay out of the Live Deck header");
assert.doesNotMatch(appSource, /Saved on this device"\);\n\s*renderCompare/, "reset must not depend on the removed save-status label");
for (const view of ["choose", "compare", "buy", "shop", "live"]) {
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
// Cards Wizards added to the Game Changer list after this data was first built.
// What is pinned is the FLAG, not where the card sits: which deck plays a card
// is a build decision that the Base rebuild and the optimizer both move, but a
// card that is a Game Changer must be marked as one wherever it appears, or a
// Tier 2 rung will silently be published illegal. Each name must still be found
// somewhere, so the check cannot pass by the card having quietly vanished.
const LADDER_BUCKETS = ["startingShell", "required", "upgrade", "enhance", "max", "tuned2", "enhance2", "max2", "funTuned", "funMax", "altTuned", "altMax"];
for (const name of ["Seedborn Muse", "Notion Thief", "Smothering Tithe"]) {
  const appearances = Object.values(buyPlans.plans).flatMap((plan) => LADDER_BUCKETS.flatMap((bucket) => (plan[bucket] || []).filter((card) => card.name === name)));
  assert(appearances.length > 0, `${name} must still appear somewhere in the plans for its Game Changer flag to mean anything`);
  for (const card of appearances) assert(card.gameChanger, `${name} must consume a current Game Changer slot everywhere it appears`);
}
// And the corollary: no Tier 2 rung may carry one. Base, Tuned and Pod Fun are
// all Tier 2 rungs, and a Game Changer in any of them is an illegal deck.
for (const plan of Object.values(buyPlans.plans)) {
  const commander = plan.startingShell.find((card) => card.isCommander);
  if (commander?.gameChanger) continue; // Tier 2 is unreachable for this deck by construction; it is published as Tier 3.
  const offenders = plan.startingShell.filter((card) => card.gameChanger && !card.isCommander);
  assert.equal(offenders.length, 0, `${plan.variantId}'s Base rung carries ${offenders.map((card) => card.name).join(", ")}, which Tier 2 does not permit`);
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

// Real simulation results (tools/sim/run-sim.mjs --init, ingested into this file). Every
// rung is measured as the exact card list the site publishes for it -- no hill-climbing
// optimizer runs -- so a score describes the deck you would actually buy. Base is never
// simulated; Fun Tuned/Fun Max exist only where the workbook carries a fun-weighted ladder,
// and read as an explicit unmeasured entry (all-null metrics) everywhere else rather than
// silently vanishing. Every measured key carries a finite games/score/winPct and the engine
// generation that actually measured it -- never inferred at render time.
assert(simulationSummary.engineNotes?.v1 && simulationSummary.engineNotes?.["v2.1"] && simulationSummary.engineNotes?.["v2.2"] && simulationSummary.engineNotes?.["v2.3"], "simulation summary must document every engine generation it references");
assert(typeof simulationSummary.engineBoundaryNote === "string" && simulationSummary.engineBoundaryNote.length > 0, "simulation summary must carry an engine-boundary caveat");
const MEASURED_AS_PUBLISHED = new Set(["Tuned", "Enhance", "Max", "Fun Tuned", "Fun Max"]);
const ALT_ENGINE = {"Alt Tuned": "v2.1", "Alt Max": "v2.1"};
assert.deepEqual(Object.keys(simulationSummary.builds).sort(), Object.keys(buyPlans.plans).sort(), "simulation summary's builds must cover every variant with a buy plan");
assert.equal(Object.keys(simulationSummary.builds).length, 50, "the sweep covers exactly 50 variants");
for (const [variantId, deckBuilds] of Object.entries(simulationSummary.builds)) {
  const plan = buyPlans.plans[variantId];
  const expectedBuilds = new Set(["Base", "Tuned", "Enhance", "Max", "Fun Tuned", "Fun Max"]);
  if (ALT_DECKS.has(variantId)) { expectedBuilds.add("Alt Tuned"); expectedBuilds.add("Alt Max"); }
  assert.deepEqual(new Set(Object.keys(deckBuilds)), expectedBuilds, `${variantId}: simulation summary must report exactly its expected builds`);
  assert.equal(deckBuilds.Base.score, null, `${variantId}: Base is never simulated`);
  for (const buildName of MEASURED_AS_PUBLISHED) {
    const metrics = deckBuilds[buildName];
    // A Fun rung is measured exactly when the plan actually carries that ladder.
    const ladder = buildName === "Fun Tuned" ? "funTuned" : buildName === "Fun Max" ? "funMax" : null;
    const shouldBeMeasured = !ladder || (plan[ladder] || []).length > 0;
    if (!shouldBeMeasured) {
      assert.equal(metrics.score, null, `${variantId} ${buildName}: a variant with no ${ladder} ladder must report no score`);
      assert.equal(metrics.engine, null, `${variantId} ${buildName}: an unmeasured build must not claim an engine`);
      continue;
    }
    assert(Number.isFinite(metrics.games) && metrics.games > 0, `${variantId} ${buildName}: a measured build must report a positive game count`);
    assert(Number.isFinite(metrics.score), `${variantId} ${buildName}: a measured build must report a finite score`);
    assert(Number.isFinite(metrics.winPct) && metrics.winPct > 0 && metrics.winPct < 1, `${variantId} ${buildName}: win rate must be a fraction between 0 and 1`);
    assert.equal(metrics.verdict, "measured-as-published", `${variantId} ${buildName}: a published-list measurement carries no optimizer verdict`);
    assert.equal(metrics.swaps, 0, `${variantId} ${buildName}: measuring a published list must never report swaps`);
    assert.equal(metrics.engine, "v2.3", `${variantId} ${buildName}: rung scores come from the v2.3 published-list sweep`);
  }
  for (const [buildName, engine] of Object.entries(ALT_ENGINE)) {
    if (!deckBuilds[buildName]) continue;
    assert.equal(deckBuilds[buildName].engine, engine, `${variantId} ${buildName}: alt-commander builds keep their original ${engine} measurement`);
  }
  // The bug this replaced: Tuned and Fun Tuned were both re-optimizations from the same
  // starting list under the same fixed seed, so they could converge on byte-identical
  // metrics. They are different published card lists and must never read as one deck.
  if (deckBuilds["Fun Tuned"].score != null) {
    assert.notEqual(deckBuilds["Fun Tuned"].score, deckBuilds.Tuned.score, `${variantId}: Fun Tuned and Tuned are different lists and must not report identical scores`);
  }
}
// "Trey's Build" marks Rob's own confirmed pick for each of the six deck slots -- authored,
// published data (like priorityRank above), not something derived from any one browser's
// localStorage, so it reads the same for anyone loading the Compare page.
assert.deepEqual(variants.variants.filter((variant) => variant.treysBuild).map((variant) => variant.id).sort(), ["1o", "2c", "3e", "4c", "5o", "6f"], "Trey's Build must mark exactly these six confirmed variant picks");
assert.match(appSource, /is-treys-build/, "the Compare card must render a distinct state for Trey's Build");
assert.match(appSource, /treys-build-ribbon/, "Trey's Build must render a clear visual indicator on the Compare card");
// The three original alt-commander decks (1o/3e/5o) got the full treatment: a hand-built
// second decklist (plan.altTuned/altMax, with its own commander flagged) powering the
// interactive "preview the alt commander" toggle on those specific Compare cards. The other
// 44 variants (every non-flagship original variant, plus all 20 generated ones) get the
// lighter evaluation only -- a scored comparison and a recommendation, with no second
// decklist -- so they must NOT be checked against plan.altTuned, which stays empty for them.
const ALL_ALT_CASE_IDS = [
  "1o", "3e", "5o",
  "1a", "1b", "1c", "1e", "2o", "2a", "2b", "2e", "3o", "3c", "3d", "3f",
  "4o", "4a", "4b", "4e", "5c", "5d", "5e", "5f", "6o", "6c", "6d", "6e",
  "7a", "7b", "7c", "7d", "7e", "8a", "8b", "8c", "8d", "8e",
  "9a", "9b", "9c", "9d", "9e", "10a", "10b", "10c", "10d", "10e"
];
assert.deepEqual(Object.keys(simulationSummary.altCommanderCases).sort(), [...ALL_ALT_CASE_IDS].sort(), "alt-commander comparison cases must cover the three fully-built decks plus all 44 lighter-weight evaluations");
for (const variantId of ["1o", "3e", "5o"]) {
  const altCase = simulationSummary.altCommanderCases[variantId];
  const plan = buyPlans.plans[variantId];
  const shellCommander = plan.startingShell.find((card) => card.isCommander);
  const altCommander = plan.altTuned.find((item) => item.isCommander);
  assert.equal(altCase.currentCommander, shellCommander.name, `${variantId}: simulation summary's current commander must match the plan's own shell commander`);
  assert.equal(altCase.altCommander, altCommander.name, `${variantId}: simulation summary's alternative commander must match the plan's own Alt Tuned commander`);
  assert(altCase.honestRead.length > 40, `${variantId}: alt-commander case must carry a substantive caution paragraph, not a stub`);
}
const LIGHTWEIGHT_ALT_CASE_IDS = ALL_ALT_CASE_IDS.filter((id) => !["1o", "3e", "5o"].includes(id));
assert.equal(LIGHTWEIGHT_ALT_CASE_IDS.length, 44, "expected exactly 44 lighter-weight commander evaluations");
for (const variantId of LIGHTWEIGHT_ALT_CASE_IDS) {
  const altCase = simulationSummary.altCommanderCases[variantId];
  const variant = variants.variants.find((entry) => entry.id === variantId);
  assert(variant, `${variantId}: must map to a real Compare variant`);
  assert.equal(altCase.currentCommander, variant.commander, `${variantId}: simulation summary's current commander must match the variant's own commander`);
  assert(typeof altCase.altCommander === "string" && altCase.altCommander.length > 0, `${variantId}: must name a best-measured alternative commander`);
  assert(Number.isFinite(altCase.currentScore) && Number.isFinite(altCase.altScore), `${variantId}: must carry finite current and alternative scores`);
  assert(Number.isInteger(altCase.currentRank) && altCase.currentRank >= 1, `${variantId}: must carry the current commander's rank among the measured field`);
  assert(Number.isInteger(altCase.candidatesMeasured) && altCase.candidatesMeasured > 0, `${variantId}: must report how many alternative commanders were actually measured`);
  assert(Number.isInteger(altCase.gamesEach) && altCase.gamesEach > 0, `${variantId}: must report the game count each candidate was measured over`);
  assert.equal(altCase.engine, "v2.2", `${variantId}: lighter-weight evaluations must be tagged with the engine generation that measured them`);
  assert((buyPlans.plans[variantId].altTuned || []).length === 0, `${variantId}: has only the lighter-weight evaluation, so altTuned must stay empty`);
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
assert.match(appSource, /simulationSummary\.engineBoundaryNote/, "a rendered simulation result must always carry the engine-boundary caveat");

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
// The Shop List's Alt filter is app.js's, and only app.js's. shop-filters.js injects its
// extra controls into that same grid, so defining an Alt filter there too rendered two
// identical dropdowns side by side.
const shopFiltersSource = await readFile(new URL("../shop-filters.js", import.meta.url), "utf8");
assert.doesNotMatch(shopFiltersSource, /FILTER_KEYS = \[[^\]]*"alt"/, "shop-filters.js must not register a second Alt filter -- app.js already renders one into the same grid");
assert.doesNotMatch(shopFiltersSource, /alt: \["Alt"/, "shop-filters.js must not define an Alt control of its own");
assert.match(appSource, /selectFilter\("alt", "Alt", ALT_FILTER_OPTIONS, filters\)/, "app.js owns the Shop List's single Alt filter");

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

// Live Decks derives its active set from Buy Picks, keyed by a signature of the Buy Picks
// selection. Without that signature the map was append-only and seeded correct values exactly
// once per variant, so every card a later preset introduced was silently benched -- a freshly
// applied 100-card configuration read 100/100 in Buy Picks but 85/100 in Live Decks. The
// signature must be computed from the buy selection alone: deriving it from anything Live
// Decks itself writes would make a manual bench look like an upstream change and wipe it.
assert.match(appSource, /ensureLiveActiveMap\(variant, activeIds, candidates\.map\(\(entry\) => entry\.id\), selectionIdsSignature\(current\)\)/, "the Live Decks active map must be keyed by a signature of the Buy Picks selection");
assert.match(appSource, /state\.liveActiveSeed\[variant\.id\] = selectionSignature;/, "ensureLiveActiveMap must record the signature it rebuilt from");
{
  const start = appSource.indexOf("function ensureLiveActiveMap(");
  const end = appSource.indexOf("function configuredDeckCards(", start);
  assert(start > 0 && end > start, "ensureLiveActiveMap and configuredDeckCards must both be defined, in that order");
  const body = appSource.slice(start, end);
  assert.match(body, /Object\.fromEntries\(candidateIds\.map\(\(id\) => \[id, activeIds\.has\(id\)\]\)\)/, "a changed Buy Picks selection must rebuild the active map wholesale from that selection");
  assert.doesNotMatch(body, /firstEverView/, "the one-time first-view seeding that caused the 85\\/100 mismatch must not come back");
}
assert.match(appSource, /<small>Paid · \$\{priced\.priced\}\/\$\{priced\.bought\} priced<\/small>/, "the Live Decks cost chip must say Paid, since it counts only money actually recorded as paid");
assert.match(appSource, /<small>Market total<\/small>/, "the Buy Picks total must say Market total, since it prices everything selected whether owned or not");

// Buy Picks groups the ladder rungs by what they cost you rather than by which optimizer
// produced them, and the Monte-Carlo-improved rungs are folded into the rungs they improve:
// Tuned holds Tuned (carrying tuned2's cards) and Fun Tuned, Maxxed holds Maxxed (carrying
// enhance2/max2's cards) and Fun Max, Enhance stays its own tier. Tuned-2 and Maxxed-2 must
// not reappear as separately-selectable tabs -- a reader picks how far to invest, not which
// optimizer produced the list. A tab's `preset` is still the configuration it represents end
// to end (Fun Tuned replaces Tuned rather than layering on it), so select-all must apply the
// full stack or it stops producing a legal 100.
{
  const start = appSource.indexOf("const LADDER_GROUPS = [");
  const end = appSource.indexOf("const ladderTabState", start);
  assert(start > 0 && end > start, "LADDER_GROUPS must be defined before the tab state it drives");
  const body = appSource.slice(start, end);
  for (const [group, tabs] of [
    ["tuned", ["tuned", "funTuned"]],
    ["max", ["max", "funMax"]],
    ["alt", ["altTuned", "altMax"]]
  ]) {
    assert.match(body, new RegExp(`key: "${group}", title:`), `the ${group} ladder group must exist`);
    for (const tab of tabs) assert.match(body, new RegExp(`key: "${tab}", label:`), `${tab} must be a tab inside a ladder group, not its own top-level section`);
  }
  assert.match(body, /key: "tuned", label: "Tuned", kinds: \["tuned", "tuned2"\]/, "the Tuned tab must carry the Monte-Carlo-improved Tuned-2 cards alongside the site's own");
  assert.match(body, /key: "max", label: "Maxxed", kinds: \["max", "enhance2", "max2"\]/, "the Maxxed tab must carry the Monte-Carlo-improved Enhance-2/Max-2 cards alongside the site's own");
  for (const gone of ["tuned2", "max2", "enhance2"]) {
    assert.doesNotMatch(body, new RegExp(`key: "${gone}", label:`), `${gone} must not be a separately-selectable tab any more`);
  }
}
assert.match(appSource, /assemblePreset\(plan, input\.checked \? presetKey : "base"\)/, "a tab's select-all must apply that build's whole configuration, so the result is always a complete 100");
assert.match(appSource, /\{key: "enhance", label: "Enhance", categories: \[\.\.\.tunedCategories, "upgrade", "enhance"\]\}/, "an Enhance intent level must exist for the simplified dropdown, built on whatever Tuned resolved to");
// De-emphasis is cosmetic. This app never blocks a choice, so the alt/non-alt groups must
// never be disabled -- only dimmed.
assert.match(appSource, /is-deemphasized/, "ladder groups must support visual de-emphasis");
{
  const cssSource = await readFile(new URL("../app.css", import.meta.url), "utf8");
  const deemphRules = cssSource.split("\n").filter((line) => line.includes("is-deemphasized"));
  assert(deemphRules.length > 0, "de-emphasis must be styled");
  for (const rule of deemphRules) assert.doesNotMatch(rule, /pointer-events\s*:\s*none/, "de-emphasized ladder groups must stay clickable -- the app never blocks a choice");
}
assert.doesNotMatch(appSource, /function buySection\(/, "the flat per-category section renderer is replaced by the grouped one");

// Per-card guidance answers "is checking this a good idea?" from what the tested builds did
// with the card -- every configuration fills each slot exactly once, so we can report which
// builds kept it and what replaced it in the rest. It must never state a per-card number: no
// per-card impact data exists anywhere in this repo, only per-variant ratings and per-build
// simulation results.
assert.match(appSource, /function cardBuildMembership\(/, "the detail sheet must be able to report which tested builds keep a card");
assert.match(appSource, /Based on the configurations that were actually simulated/, "per-card guidance must say it reports real builds, not a prediction");
assert.match(appSource, /Proven results come from the tested configurations/, "Live Decks must say plainly that proven numbers describe the tested configurations");

// Purchase history restores ownership from a Live Decks checklist export. The export writes
// "exactly what is on screen, with its current filters", so a file can legitimately omit cards
// that are owned -- the import must therefore be strictly additive and never unmark anything.
assert.match(appSource, /function importPurchaseHistory\(/, "Shop List must be able to restore ownership from a checklist export");
{
  const start = appSource.indexOf("function importPurchaseHistory(");
  const end = appSource.indexOf("function appendLiveSalvage", start);
  assert(start > 0 && end > start, "importPurchaseHistory must be defined before appendLiveSalvage");
  const body = appSource.slice(start, end);
  assert.doesNotMatch(body, /state\.found\[[^\]]+\]\s*=\s*false/, "importing purchase history must never unmark a card as bought");
  assert.doesNotMatch(body, /delete state\.(found|boughtQuantities|purchasePrices)/, "importing purchase history must never delete existing ownership");
  // Number("") is 0, so a blank Paid cell would otherwise import as a committed price of zero.
  assert.match(body, /paidRaw === "" \? NaN : Number\(paidRaw\)/, "a blank Paid cell must not import as a paid price of zero");
  // The export names double-faced cards "Front // Back" while some catalog entries carry only
  // the front face.
  assert.match(body, /name\.split\(" \/\/ "\)\[0\]/, "double-faced card names must be recognized in either form");
}

// The Compare "About" button replaced the removed carousel overview card; nothing should still
// construct or reference it.
assert.doesNotMatch(appSource, /function makeDeckOverviewCard\(/, "the retired carousel overview card renderer must not come back");
assert.match(appSource, /data-about-deck/, "each deck group must render an About button");
assert.match(appSource, /function openDeckAbout\(/, "an About dialog opener must exist");

// Buy Picks micro-copy (Fun/Enhance/Max rows) must never fabricate a per-card claim: it either
// quotes real authored data (whyOptional, maxReason, the card's own oracle text) or renders
// nothing at all. This mirrors the discipline already pinned for cardBuildMembership above --
// no per-card impact numbers exist anywhere in this repo, and no per-card "this is fun" rating
// exists either.
assert.match(appSource, /function microFitLine\(/, "Buy Picks rows must be able to render the short per-kind micro-copy");
assert.match(appSource, /function deriveFunSignal\(/, "a fun-signal heuristic must exist for Fun Tuned\/Fun Max rows");
{
  const start = appSource.indexOf("function deriveFunSignal(");
  const end = appSource.indexOf("function microFitLine(", start);
  assert(start > 0 && end > start, "deriveFunSignal must be defined before microFitLine");
  const body = appSource.slice(start, end);
  assert.match(body, /\|\|\s*null/, "deriveFunSignal must return null, never a fabricated default, when no real signal matches");
}
{
  const start = appSource.indexOf("function microFitLine(");
  const end = appSource.indexOf("\n  }\n\n  // Base/Tuned/Maxxed", start);
  assert(start > 0 && end > start, "microFitLine must be defined before the ladder-groups comment block");
  const body = appSource.slice(start, end);
  assert.match(body, /return null/, "microFitLine must be able to render nothing rather than force a line");
  assert.match(body, /isSwapEvidenceText\(raw\)\) return null/, "microFitLine must never surface the raw swap-evidence paragraph as a row caption");
}

// The swap-evidence paragraph the fun-ladder importer copied into purpose/why/brief.fit is real
// data ("what is lost by the card it replaces") but reads as a full paragraph, not a row
// caption -- it must be excluded from the row and instead get its own section in the detail
// sheet, which is exactly where a reader who wants the full picture would look.
assert.match(appSource, /function isSwapEvidenceText\(/, "a helper must detect the swap-evidence boilerplate pattern");
assert.match(appSource, /function swapEvidenceSentence\(/, "the detail sheet must be able to surface the full swap-evidence sentence");
assert.match(appSource, /isSwapEvidenceText\(rawSummary\)/, "the Buy Picks row must not render the raw swap-evidence paragraph as its caption");
assert.match(appSource, /What the card it replaces gave up/, "the detail sheet must have a clearly labeled section for what a replaced card's evidence showed");

// Cross-device state portability: export bundles both localStorage keys this app actually
// writes (the main state and, separately, Custom's Choose-step store) into one versioned file;
// Import and Load Active both require confirmation before replacing anything, since a full-state
// file has no safe merge rule the way the purchase-history CSV import does.
assert.match(appSource, /function serializeStatePayload\(/, "a full-state export payload builder must exist");
assert.match(appSource, /function exportFullState\(/, "an Export control must exist");
assert.match(appSource, /function importStateFromFile\(/, "an Import control must exist");
assert.match(appSource, /function loadActiveState\(/, "a Load Active control must exist");
assert.match(appSource, /localStorage\.getItem\(Custom\.STORAGE_KEY\)/, "export must include the Custom (Choose-step) store, not just the main state");
assert.match(appSource, /fetch\("data\/active-state\.json"/, "Load Active must read active-state.json from the repo, not invent a URL");
// Replace, not a field-by-field merge -- a full-state file has no safe merge rule the way the
// purchase-history CSV import does, since it covers every selection, filter, and toggle at once.
assert.match(appSource, /state = \{\.\.\.blankState\(\), \.\.\.payload\.state\}/, "applying a state payload must fully replace state, defaulting only fields the file omits");
{
  const start = appSource.indexOf("function importStateFromFile(");
  const end = appSource.indexOf("function loadActiveState(", start);
  assert(start > 0 && end > start, "importStateFromFile must be defined before loadActiveState");
  const importBody = appSource.slice(start, end);
  const loadActiveBody = appSource.slice(end);
  assert.match(importBody, /window\.confirm\(/, "importing a state file must ask for confirmation before replacing local data");
  assert.match(loadActiveBody.slice(0, loadActiveBody.indexOf("\n  }\n") + 5), /window\.confirm\(/, "Load Active must ask for confirmation before replacing local data");
}
assert.match(htmlSource, /id="export-state-button"/, "an Export button must exist in the header");
assert.match(htmlSource, /id="import-state-input"/, "an Import file input must exist in the header");
assert.match(htmlSource, /id="load-active-button"/, "a Load Active button must exist in the header");

console.log(`Validated ${variants.variants.length} variants and ${Object.keys(buyPlans.plans).length} connected buy profiles.`);
