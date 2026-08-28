import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const variants = JSON.parse(await readFile(new URL("../data/variants.json", import.meta.url), "utf8"));
const buyPlans = JSON.parse(await readFile(new URL("../data/buy-plans.json", import.meta.url), "utf8"));
const cards = JSON.parse(await readFile(new URL("../data/cards.json", import.meta.url), "utf8"));
const simulationSummary = JSON.parse(await readFile(new URL("../data/simulation-summary.json", import.meta.url), "utf8"));
const appSource = await readFile(new URL("../app.js", import.meta.url), "utf8");
const htmlSource = await readFile(new URL("../index.html", import.meta.url), "utf8");
const rungLists = JSON.parse(await readFile(new URL("../data/rung-lists.json", import.meta.url), "utf8"));
const cssSource = await readFile(new URL("../app.css", import.meta.url), "utf8");
const deckPageSource = await readFile(new URL("../deck-page.js", import.meta.url), "utf8");
const shopPageSource = await readFile(new URL("../shop-page.js", import.meta.url), "utf8");
const slotModelSource = await readFile(new URL("../slot-model.js", import.meta.url), "utf8");
const activeState = JSON.parse(await readFile(new URL("../data/active-state.json", import.meta.url), "utf8"));
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

// Where each owned card sits is no longer pinned by name -- the ladders are
// regenerated from measurement (tools/sim/bake-ladders.mjs), so a card's home
// legitimately moves between bakes. What may never happen is an owned card
// falling out of the catalog entirely: everything on the ownership list is
// either in salvage or placed in at least one deck, and a placement that exists
// only as a free substitution (ownedOptional) must name the card it stands in
// for, so the option is actionable rather than decorative.
{
  const LADDER_BUCKETS_ALL = ["startingShell", "required", "upgrade", "enhance", "max", "tuned2", "enhance2", "max2", "funTuned", "funMax", "altTuned", "altMax"];
  const placed = new Set();
  for (const plan of Object.values(buyPlans.plans)) {
    for (const bucket of LADDER_BUCKETS_ALL) {
      for (const item of plan[bucket] || []) String(item.name).split(" // ").forEach((face) => placed.add(face.toLowerCase()));
    }
  }
  const salvaged = new Set((buyPlans.salvage || []).flatMap((card) => String(card.name).split(" // ")).map((face) => face.toLowerCase()));
  for (const name of buyPlans.ownedExtras.filter((entry) => !entry.startsWith("Lorehold Spirit ("))) {
    const faces = String(name).split(" // ").map((face) => face.toLowerCase());
    assert(faces.some((face) => placed.has(face) || salvaged.has(face)), `${name} is owned but sits in no deck and not in Salvage — an owned card the catalog forgets is money wasted twice`);
  }
  for (const plan of Object.values(buyPlans.plans)) {
    for (const item of plan.enhance || []) {
      if (!item.ownedOptional) continue;
      assert(item.ownedExtra, `${plan.variantId}: ${item.name} is a free substitution and must be flagged as owned`);
      assert(item.replaces, `${plan.variantId}: ${item.name} must name the card it stands in for`);
    }
  }
}
assert(buyPlans.plans["5o"].startingShell.find((card) => card.name === "Augusta, Order Returned")?.ownedExtra, "Augusta, Order Returned is already in the official Quintorius shell and must be marked owned without creating an illegal duplicate option");
const salvageNames = new Set((buyPlans.salvage || []).flatMap((card) => [card.name, ...card.name.split(" // ")]));
for (const name of ["Bilbo Baggins, Burglar", "Dwarven Mattock", "Dwarven Mauler", "Dwarven Shortsword", "Gundabad Opportunist", "Guardian of the Halls"]) assert(salvageNames.has(name), `${name} must be in Salvage`);
assert((buyPlans.salvage || []).every((card) => card.reason && card.image && card.typeLine), "Salvage cards must retain an audited reason and card data");
assert(buyPlans.ownedExtras.includes("Bilbo Baggins, Burglar // Take a Glance"), "owned import must include Bilbo's canonical Adventure name");
for (const name of ["Naktamun Lorespinner // Wheel of Fortune", "Kirol, History Buff // Pack a Punch", "Lorehold Archivist // Restore Relic"]) assert(buyPlans.ownedExtras.includes(name), `${name} must use its canonical ownership key`);
assert(buyPlans.ownedExtras.length >= 93, "the complete photographed ownership table must be present");
// The marquee owned cards are held to named variants -- Atraxa and Arcades stay
// where the owner can actually play them, whatever the optimizer thinks. The
// locks are enumerated in data rather than inferred, each with a reason, and a
// locked card must genuinely be in its variant with its ownership showing.
assert(Array.isArray(buyPlans.ownedLocks) && buyPlans.ownedLocks.length >= 2, "owned marquee cards must be locked to named variants");
for (const lock of buyPlans.ownedLocks) {
  const plan = buyPlans.plans[lock.variantId];
  assert(plan, `owned lock names variant ${lock.variantId}, which does not exist`);
  const item = [...plan.startingShell, ...plan.required, ...plan.upgrade, ...plan.enhance, ...plan.max, ...(plan.tuned2 || [])].find((entry) => entry.name === lock.card);
  assert(item, `${lock.variantId} is locked to ${lock.card} but does not contain it`);
  assert(item.ownedExtra, `${lock.card} must be marked owned in ${lock.variantId}`);
  assert(lock.why, `the lock on ${lock.card} in ${lock.variantId} must say why`);
  assert(buyPlans.ownedExtras.includes(lock.card), `${lock.card} must be in ownedExtras to be locked as owned`);
}
// Which Game Changers appear where is measured now, not curated, so no card is
// pinned by name. What holds instead: a ladder item's own gameChanger flag must
// agree with the audited catalog everywhere, in both directions -- a mismarked
// card either publishes an illegal Tier 2 build or forbids a legal one.
for (const plan of Object.values(buyPlans.plans)) {
  for (const bucket of ["required", "upgrade", "enhance", "max", "tuned2", "enhance2", "max2", "funTuned", "funMax"]) {
    for (const item of plan[bucket] || []) {
      const audited = auditedByName.get(item.name.toLowerCase());
      if (!audited) continue;
      assert.equal(Boolean(item.gameChanger), Boolean(audited.gameChanger), `${plan.variantId} ${item.name} (${bucket}): the item's Game Changer flag disagrees with the audit`);
    }
  }
}
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
// Read the tabs off the markup rather than listing them here. The list that used
// to sit in this line named buy, live and cards -- three views retired into Deck
// and Shop -- so it went on passing while the two surviving tabs had no tour of
// their own and fell through to Compare's, which narrated a site of six tabs.
const tabViews = [...htmlSource.matchAll(/class="main-tab[^"]*"\s+data-view="([a-z0-9]+)"/g)].map((m) => m[1]);
assert.ok(tabViews.length >= 4, `expected the tab bar to still have tabs, found ${tabViews.length}`);
for (const view of tabViews) {
  assert.match(appSource, new RegExp(`^\\s{4}${view}: \\[`, "m"), `the tour must define its own steps for the ${view} tab`);
}
for (const view of [...appSource.matchAll(/^\s{4}([a-z0-9]+): \[$/gm)].map((m) => m[1])) {
  assert.ok(tabViews.includes(view), `the tour still defines steps for ${view}, which is no longer a tab`);
}
/* The deck header's arithmetic. Three separate ways it was wrong, all of them from
   counting the wrong thing rather than counting badly. */
{
  const deckSource = await readFile(new URL("../deck-page.js", import.meta.url), "utf8");

  // 1. Lands by the card in the slot, not by the slot. Slot identity is anchored to the
  //    shell so rows stay put when the rung changes, which means a land slot can hold a
  //    creature and an enchantment slot can hold a land. Deck 1 at Tuned read 38 by slot
  //    and 36 by card.
  assert.match(deckSource, /if \(cardTypeOf\(ctx, s\.pick\.name\) === "Land"\) t\.activeLands \+= qty;\s*\n\s*else t\.activeOther \+= qty;/,
    "lands must be read off the card in the slot, and split against the rest of what is boxed");
  // "35/100 cards in the box" beside "36 lands" was two different questions in one row.
  // The two type figures are counted inside the active bucket, so they add up to the 35.
  assert.match(deckSource, /if \(loc\.kind === "active"\) \{\s*\n\s*if \(cardTypeOf/,
    "the type split must be counted inside what is in the box, not across the whole deck");
  assert.ok(!deckSource.includes("t.lands"),
    "a deck-wide land count next to a box count is the confusion this replaced");
  assert.match(deckSource, /const misfiled = pick && realType && realType !== slot\.type/,
    "a row whose card type differs from its group must say so, or counting by eye misses it");

  // 2. Cards, not rows. Eighty-five rows hold a hundred cards, because the basics collapse
  //    into one row each.
  // Match the computation, not the phrase: the comment above the header explains the old
  // "85/85 slots filled" wording, and a bare text search finds that and fails on prose.
  assert.ok(!deckSource.includes("${slots.length - t.holes}/${slots.length}"),
    "the header must no longer compute filled rows over total rows");
  assert.match(deckSource, /<b class="dp-num">\$\{t\.active\}\/\$\{t\.cards\}<\/b> cards in the box/,
    "the header must read as cards in the box over cards in the deck");

  /* 3. Copies are allocated, not counted, and allocated ONCE -- the Deck page and the Shop
        read the same result, because a shopping list that disagrees with the deck it is
        shopping for is worse than either number alone. Ordered copies are allocated too:
        a card in the post is one card, and reading "ordered" off the global count let
        every deck claiming it call itself ordered. */
  assert.match(appSource, /function allocateCopies\(variants, owned, cards\)/,
    "there must be one allocator");
  assert.match(appSource, /Slot\.shopRows\(decks, owned, allocateCopies\(variants, owned, cards\)\.allocated\)/,
    "the Shop must price what the decks were actually allocated, not the raw ledger");
  assert.match(appSource, /else if \(unordered\.get\(key\) >= qty\) got = take\(key, id, qty, "ordered"\);/,
    "ordered copies must be handed out one at a time like held ones");
  assert.match(appSource, /denied: Boolean\(hold && !\(hold\.inHand \|\| 0\) && !\(hold\.ordered \|\| 0\)\)/,
    "a deck the audit says holds none must never be served a spare");
  assert.match(appSource, /if \(claim\.denied\) return void claimSatisfied\.set\(`\$\{key\}\|\$\{id\}`, false\);/,
    "the denial has to be honoured where the copies are handed out");
  // A complete allocation means a missing entry is zero, not "ask the ledger instead".
  assert.match(slotModelSource, /const allocated = holds \? \(holds\[row\.key\] \|\| \{inHand: 0, ordered: 0\}\) : null;/,
    "a card with no allocation was allocated to nobody");
  // An audited file already knows its own split; the manifest is only for older ones.
  assert.match(appSource, /if \(state\.ownershipSchema >= 3 && state\.owned && Object\.keys\(state\.owned\)\.length\) return;/,
    "the ordered manifest must not re-file ownership a state already records per card");
  assert.match(appSource, /claimSatisfied\.set\(`\$\{key\}\|\$\{id\}`, got\);/,
    "each deck's claim on a card must be recorded per deck, not per name");
  assert.ok(!appSource.includes("boxedElsewhere"),
    "counting what other decks boxed is symmetric and starves both; the allocation replaces it");
  /* A ticked slot is answered by the allocator, not the global ledger: the ledger knows
     there is one copy, not which box has it. The answer is what the claim was served
     WITH, so an ordered copy reads as ordered rather than as owned. */
  assert.match(deckSource, /const got = ctx\.claimHeld\(name\);/,
    "a ticked slot must ask what its own claim was served with");
  assert.match(deckSource, /if \(got === "ordered"\) return \{kind: "ordered", glyph: "⧖", label: "Assigned · ordered", assigned\};/,
    "a claim served from the post must read as ordered, not as in the box");
  // Ticking is never refused: the shortfall is a card to buy, and the Shop already asks
  // for it, since shopRows sums quantity across decks against what you own.
  assert.match(deckSource, /label: whose \? `Assigned · another copy needed/,
    "a deck whose copy is elsewhere must still be tickable, and say what it needs");
}

/* Ticking a slot's box is a decision about the deck list, not a claim about the shelf.
   It used to be both: the tick wrote the card into the ownership ledger as in-hand so the
   row would stop reading "to buy". That made it one-way -- tick an ordered card, untick
   it, and it came back "Owned, no box", because the raise had no matching fall -- and for
   as long as it was ticked the ledger held one physical copy twice, once as held and once
   as on order. */
{
  const deckSource = await readFile(new URL("../deck-page.js", import.meta.url), "utf8");
  const handler = appSource.slice(appSource.indexOf("function deckPageChange"));
  // Anchor the end AFTER the start. deckPageChange handles the paid field and the filters
  // before the box, and both of those call renderDeckPage, so an unanchored search found
  // one of them, produced an empty slice, and made every assertion below pass on nothing.
  const boxStart = handler.indexOf("data-dp-box");
  const boxBranch = handler.slice(boxStart, handler.indexOf("renderDeckPage()", boxStart));
  assert.ok(boxStart > 0 && boxBranch.length > 40, "could not find the box branch to check");
  for (const writer of ["markInHand", "state.owned", "state.found", "state.boughtQuantities"]) {
    assert.ok(!boxBranch.includes(writer),
      `ticking a box must not touch ${writer} -- assignment and ownership are separate facts`);
  }
  assert.ok(!appSource.includes("markInHand"),
    "markInHand had one caller and that caller is gone; leaving it invites the bug back");

  // The label has to carry both facts, since the tick no longer hides one of them.
  assert.match(deckSource, /const assigned = Boolean\(slotId && \(ctx\.active \|\| \{\}\)\[slotId\]\);/,
    "locationOf must read the tick separately from the acquisition");
  for (const phrase of ["Assigned · to buy", "Assigned · ordered", "In the box"]) {
    assert.ok(deckSource.includes(phrase), `the row must be able to say "${phrase}"`);
  }
  /* Every bucket is about the CARD -- in this box, held elsewhere, in the post, or still
     to be bought -- and they stay mutually exclusive so they sum to the card count by eye.
     Assignment gets no bucket. It had one, and once every slot was ticked that bucket
     swallowed the other three: a deck with fifty-seven cards in the post and two left to
     buy reported "0 to buy $0.00", which reads as nothing outstanding. */
  assert.match(deckSource, /if \(loc\.kind === "active"\) t\.active \+= qty;\s*\n\s*else if \(loc\.kind === "ordered"\) t\.ordered \+= qty;\s*\n\s*else if \(loc\.kind === "buy"\) \{ t\.buy \+= qty; t\.buyValue \+= costOf\(ctx, s\.pick\)\.value; \}/,
    "the buckets must be filed by where the card is, never gated on whether the slot is ticked");
  assert.doesNotMatch(deckSource, /t\.assigned\b/,
    "assignment must not take a bucket of its own again");
  // Money owed is reported against the to-buy bucket, which is the only place it lives now.
  assert.match(deckSource, /<b class="dp-num">\$\{t\.buy\}<\/b> to buy \$\{money\(t\.buyValue\)\}/,
    "the to-buy term must carry its own subtotal");
  assert.match(deckSource, /<b class="dp-num">\$\{t\.ordered\}<\/b> ordered, not here yet/,
    "cards in the post need a term of their own, or a fully-ticked deck looks finished");
  // Ticking still has to move a number, for a card you cannot hold as much as one you can.
  assert.match(deckSource, /if \(loc\.assigned\) t\.claimed \+= qty;/,
    "the claim count is what a tick moves when the card is not here yet");
  assert.match(deckSource, /<b class="dp-num">\$\{t\.claimed\}\/\$\{t\.cards \+ t\.holes\}<\/b> claimed/,
    "the claim count has to be on screen to be worth moving");
}

/* What a card cost, where you can type it, and what can reach the Bench. These are
   source pins because the behaviour lives in the rendering, not in the data. */
{
  const cssSource = await readFile(new URL("../app.css", import.meta.url), "utf8");
  const shopSource = await readFile(new URL("../shop-page.js", import.meta.url), "utf8");
  const deckSource = await readFile(new URL("../deck-page.js", import.meta.url), "utf8");

  // One writer, so a price typed on the Shop and one typed on a slot are the same number.
  assert.match(appSource, /function commitPaidPrice\(key, raw, label\)/,
    "purchase prices must go through a single writer");
  for (const surface of ["data-sp-paid", "data-dp-paid"]) {
    assert.ok(appSource.includes(surface), `${surface} must be handled in app.js`);
  }
  assert.match(shopSource, /\{key: "paid", label: "Paid"\}/, "the Shop table must carry a Paid column");
  assert.match(shopSource, /if \(key === "paid"\) return row\.paid == null \? -1 : row\.paid;/,
    "Paid must sort as a number, with unpriced below a genuine zero");
  assert.match(deckSource, /data-dp-paid="\$\{esc\(Slot\.ownedKey\(name\)\)\}"/,
    "the slot pane's paid field must key off the same slug the Shop row uses");

  // The Bench intake has to be reachable when the Bench is empty, which is exactly when
  // a card with no home turns up.
  const benchBody = shopSource.slice(shopSource.indexOf("function benchMarkup"));
  // Target the empty-state return itself. Slicing at the first "sp-bench" caught the
  // populated return's intake too, so the assertion passed with the empty one deleted.
  const emptyReturn = /if \(!items\.length\) \{\s*\n?\s*return `([\s\S]*?)`;/.exec(benchBody);
  assert.ok(emptyReturn, "the Bench must still have an empty state");
  assert.ok(emptyReturn[1].includes("${intake}"),
    "the empty Bench must still offer the intake -- that is when it is needed most");
  assert.match(appSource, /new Error\("the lookup timed out"\)/,
    "each lookup must be bounded, or one hung request disables the button for good");
  assert.match(appSource, /const box = \$\("\[data-sp-intake-input\]"\);\s*\n\s*if \(box\) box\.value = failed/,
    "lines that failed must be put back after the re-render, not written to the panel it replaced");

  // Searching for a card should find the slot it COULD fill, not only the slot it fills.
  assert.match(deckSource, /const haystack = \[slot\.shellName, slot\.pick && slot\.pick\.name, \.\.\.slot\.rungs\.map\(\(r\) => r\.name\)\]/,
    "the deck search must read every rung in the slot, not just the active pick");
  assert.match(cssSource, /\.dp-filters\{/, "the deck filter bar needs its own styles");
}

/* The phone tab grid is written as a column count, so it silently stops matching when
   a tab is added or retired: it still said three columns after Calibrate, Decks and
   Cards were folded into Deck and Shop, so the four tabs wrapped to two rows and the
   sticky header ate a third of a 360px screen. */
{
  const cssSource = await readFile(new URL("../app.css", import.meta.url), "utf8");
  const tabCount = [...htmlSource.matchAll(/class="main-tab[^"]*"\s+data-view="/g)].length;
  const columns = /@media\s*\(max-width:\s*700px\)\s*\{\s*\.main-tabs\s*\{[^}]*repeat\((\d+),/.exec(cssSource);
  assert.ok(columns, "the phone rule for .main-tabs must set an explicit column count");
  assert.equal(Number(columns[1]), tabCount,
    `the phone tab grid has ${columns[1]} columns for ${tabCount} tabs, so they wrap to more than one row`);
}

// Compare has two stage controls: the page-level Score stage select and each
// deck's own Rank order row. Only the second one ever restaged the cards, so
// choosing Maxed filtered by Maxed scores while every tile still quoted Tuned's
// cost, power level and Game Changer count -- which read exactly like stale data.
assert.match(appSource, /if \(select\.dataset\.compareFilter === "profileStage"\) \{\s*\n\s*catalog\.decks\.forEach\(\(deck\) => \{ state\.rankStages\[deck\.id\] = Number\(select\.value\); \}\);/,
  "the Score stage select must set every deck's stage, not only the score filter");
assert.match(appSource, /function exportLiveDecks/, "Live Decks must be exportable as a flat inventory");
assert.match(appSource, /mtg-owned-extras-import-v3/, "the complete known inventory must migrate onto each browser once");
assert.doesNotMatch(appSource, /plan\.max\.filter\(\(candidate\) => candidate\.gameChanger && choices\.has/, "the Game Changer guard may not count Max options only");
// The capability audit used to be a list of by-name placements ("Peregrine
// Drake is Max in 4a, with its combo documented"). Those pins described a
// curated ladder; the ladders are measured now, so which card lands where is an
// output, not an input. The invariants that survive are structural and checked
// elsewhere or here: the candidate pool refuses every card the compliance model
// flags (tools/sim/fetch-candidates.mjs), so a two-card-combo piece cannot
// enter any rung by optimization; the Game Changer flag agrees with the audit
// everywhere (above); and each rung composes to exactly the measured hundred
// (tests/lineup-compliance.mjs). What remains asserted here: a Tier 2 rung
// carries no Game Changers, since Tuned and Pod Fun are published as Tier 2.
for (const plan of Object.values(buyPlans.plans)) {
  const commander = plan.startingShell.find((card) => card.isCommander);
  if (commander?.gameChanger) continue; // published as Tier 3 by construction
  for (const bucket of ["required", "tuned2", "funTuned"]) {
    const offenders = (plan[bucket] || []).filter((item) => item.gameChanger);
    assert.equal(offenders.length, 0, `${plan.variantId} ${bucket} carries ${offenders.map((item) => item.name).join(", ")}, but Tuned and Pod Fun are Tier 2 rungs and Tier 2 permits no Game Changers`);
  }
}
// The exclusion ledger survives even though the placements it once guarded are
// regenerated: a card recorded as excluded from a variant's strict Tier 3
// options must stay out of that variant's ladders, with its reason intact. This
// is the one place a human judgment overrides the optimizer, so it is data, not
// a pin in a test.
assert(Array.isArray(buyPlans.tier3Excluded) && buyPlans.tier3Excluded.length > 0, "the Tier 3 exclusion ledger must survive");
for (const excluded of buyPlans.tier3Excluded) {
  assert(excluded.reason, `${excluded.variantId} ${excluded.name} must retain its exclusion rationale`);
  const plan = buyPlans.plans[excluded.variantId];
  if (!plan) continue;
  for (const bucket of ["required", "upgrade", "enhance", "max", "tuned2", "enhance2", "max2", "funTuned", "funMax"]) {
    assert(!(plan[bucket] || []).some((card) => card.name === excluded.name), `${excluded.variantId} ${excluded.name} is on the exclusion ledger and may not reappear in ${bucket}`);
  }
}
// Cards Wizards added to the Game Changer list after this data was first built.
// What is pinned is the FLAG, not where the card sits: which deck plays a card
// is a build decision that the Base rebuild and the optimizer both move, but a
// card that is a Game Changer must be marked as one wherever it appears, or a
// Tier 2 rung will silently be published illegal. Each name must still be found
// somewhere, so the check cannot pass by the card having quietly vanished.
const LADDER_BUCKETS = ["startingShell", "required", "upgrade", "enhance", "max", "tuned2", "enhance2", "max2", "funTuned", "funMax", "altTuned", "altMax"];
for (const name of ["Seedborn Muse", "Notion Thief", "Smothering Tithe"]) {
  // The authority is the audit; being cut from every deck is a legitimate
  // outcome for a Game Changer (the Tier 2 rungs are required to drop it), so
  // presence is not asserted -- only that the flag holds wherever it does appear.
  assert(auditedByName.get(name.toLowerCase())?.gameChanger, `${name} must carry its Game Changer flag in the audit`);
  const appearances = Object.values(buyPlans.plans).flatMap((plan) => LADDER_BUCKETS.flatMap((bucket) => (plan[bucket] || []).filter((card) => card.name === name)));
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

// Ladder shape, checked on the six decks the workbook originally described.
// Every variant now carries every category as an array, because the sweep bakes
// a Tuned and a Pod Fun ladder for all fifty (tools/sim/bake-ladders.mjs); an
// empty array is a rung the sweep found nothing to change at, which is a real
// answer and not a missing one.
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
// The published numbers. Every rung either reports a full measurement or says
// plainly that it was not measured; nothing is inferred at render time, and no
// figure survives from an engine that asked a different question.
const ENGINE = "v2.4";
const MEASURED_RUNGS = ["Base", "Tuned", "Pod Fun", "Max"];
assert.equal(simulationSummary.engine, ENGINE, `the summary must name the engine that produced it`);
assert(simulationSummary.engineNotes?.[ENGINE], "simulation summary must document the engine generation it references");
assert(typeof simulationSummary.engineBoundaryNote === "string" && simulationSummary.engineBoundaryNote.length > 0, "simulation summary must carry an engine-boundary caveat");
assert(simulationSummary.winRateBand?.floor > 0 && simulationSummary.winRateBand.ceiling > simulationSummary.winRateBand.floor, "the summary must publish the win-rate band its Pod Fun rung was scored against");
assert.deepEqual(Object.keys(simulationSummary.builds).sort(), Object.keys(buyPlans.plans).sort(), "simulation summary's builds must cover every variant with a buy plan");
assert.equal(Object.keys(simulationSummary.builds).length, 50, "the sweep covers exactly 50 variants");

for (const [variantId, deckBuilds] of Object.entries(simulationSummary.builds)) {
  assert.deepEqual(Object.keys(deckBuilds), MEASURED_RUNGS, `${variantId}: simulation summary must report exactly the four rungs`);
  for (const buildName of MEASURED_RUNGS) {
    const metrics = deckBuilds[buildName];
    if (metrics.score == null) {
      assert.equal(metrics.games, null, `${variantId} ${buildName}: an unmeasured rung must not report a game count`);
      continue;
    }
    assert(Number.isFinite(metrics.games) && metrics.games > 0, `${variantId} ${buildName}: a measured build must report a positive game count`);
    assert(Number.isFinite(metrics.score), `${variantId} ${buildName}: a measured build must report a finite score`);
    assert(Number.isFinite(metrics.powerScore), `${variantId} ${buildName}: every rung must report its power on the shared performance vector, or the rungs cannot be compared`);
    assert(Number.isFinite(metrics.winPct) && metrics.winPct > 0 && metrics.winPct < 1, `${variantId} ${buildName}: win rate must be a fraction between 0 and 1`);
    assert(Number.isFinite(metrics.podFunPct), `${variantId} ${buildName}: every rung must report how the table's night went`);
    assert.equal(metrics.engine, ENGINE, `${variantId} ${buildName}: rung scores must come from the ${ENGINE} sweep`);
    assert([2, 3].includes(metrics.tier), `${variantId} ${buildName}: every rung must name the bracket it was measured against`);
  }
  // Base is Tier 2 except where the commander is itself a Game Changer, which
  // makes Tier 2 permanently unreachable and the whole deck published as Tier 3.
  const shellCommander = buyPlans.plans[variantId].startingShell.find((card) => card.isCommander);
  assert.equal(deckBuilds.Base.tier, shellCommander?.gameChanger ? 3 : 2, `${variantId}: Base is a Tier 2 rung unless the commander is a Game Changer`);
  assert.equal(deckBuilds.Max.tier, 3, `${variantId}: Max is the Tier 3 rung`);
}

// The invariant the whole constrained-rung design exists to hold: the deck
// optimized to win must be at least as able to win as the one optimized for the
// table's night. It is enforced during the search by a power floor and a
// reconciliation pass, and any variant where it still fails has to be named in
// the summary's own caveats rather than quietly averaged into the medians.
const declaredInversions = new Set((simulationSummary.caveats?.inversions || []).map((row) => row.variantId));
for (const [variantId, deckBuilds] of Object.entries(simulationSummary.builds)) {
  const tuned = deckBuilds.Tuned;
  const podFun = deckBuilds["Pod Fun"];
  if (tuned?.powerScore == null || podFun?.powerScore == null) continue;
  if (podFun.powerScore <= tuned.powerScore + 0.05) continue;
  assert(declaredInversions.has(variantId), `${variantId}: Pod Fun out-powers Tuned by ${(podFun.powerScore - tuned.powerScore).toFixed(1)} and the summary does not admit it in caveats.inversions`);
}
// And the other half of the same promise: a Pod Fun rung that stayed above the
// ceiling is a deck that wins too much to be a good guest, which is exactly the
// thing a reader is spending a hundred dollars to avoid.
const declaredOver = new Set((simulationSummary.caveats?.podFunOverCeiling || []).map((row) => row.variantId));
for (const [variantId, deckBuilds] of Object.entries(simulationSummary.builds)) {
  const podFun = deckBuilds["Pod Fun"];
  if (podFun?.winPct == null) continue;
  if (podFun.winPct <= simulationSummary.winRateBand.ceiling + 0.005) continue;
  assert(declaredOver.has(variantId), `${variantId}: Pod Fun wins ${(podFun.winPct * 100).toFixed(0)}% against a ${(simulationSummary.winRateBand.ceiling * 100).toFixed(0)}% ceiling and the summary does not admit it in caveats.podFunOverCeiling`);
}

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

/* Compare reads its per-stage figures out of variants.json by index, and those
   arrays are written by tools rather than by the page. When the Max rung gained
   Game Changers, the Maxed column went on showing Tuned's cost, Tuned's card
   count and "0 GC" -- and nothing here noticed, because nothing tied the arrays
   to the hundreds they describe. The stage-note counts had in fact been wrong at
   the Tuned rung since Base was rebuilt, months before that. These four tie them
   together. tools/sim/resync-compare.mjs and tools/sim/reprice.mjs fix a break. */
{
  const STAGE_RUNG = ["Base", "Tuned", "Max"];
  const gameChangerNames = new Set(cards.cards.filter((card) => card.gameChanger).map((card) => card.name.toLowerCase()));
  const priceOf = (name) => Number(auditedByName.get(name.toLowerCase())?.price) || 0;
  const dollars = (text) => Number(String(text).replace(/[^0-9.]/g, ""));
  const held = (list) => (list || []).reduce((sum, entry) => sum + (gameChangerNames.has(entry.name.toLowerCase()) ? (entry.quantity || 1) : 0), 0);

  for (const variant of variants.variants) {
    const pinned = rungLists.variants[variant.id];
    assert.ok(pinned, `${variant.id} has no pinned rung lists`);
    const baseNames = new Set((pinned.Base || []).map((entry) => entry.name.toLowerCase()));

    STAGE_RUNG.forEach((rung, index) => {
      const count = held(pinned[rung]);
      assert.equal(variant.brackets[index].gameChangers, `${count} GC`,
        `${variant.id} ${rung}: the Compare chip says ${variant.brackets[index].gameChangers} but the pinned hundred holds ${count}`);
      // compliance-model refuses a Game Changer at Tier 2, so a rung holding one
      // cannot be labelled Bracket 2 whatever a density estimate scored it.
      if (count > 0) {
        assert.doesNotMatch(variant.brackets[index].label, /^B2/,
          `${variant.id} ${rung} is labelled ${variant.brackets[index].label} while holding ${count} Game Changer(s)`);
      }
    });

    [1, 2].forEach((index) => {
      const stated = /·\s*(\d+)\s*(?:upgrade cards|spells)/.exec(variant.stageNotes?.[index] || "");
      if (!stated) return;
      const beyond = (pinned[STAGE_RUNG[index]] || []).filter((entry) => !baseNames.has(entry.name.toLowerCase())).length;
      assert.equal(Number(stated[1]), beyond,
        `${variant.id} ${STAGE_RUNG[index]} note claims ${stated[1]} cards beyond Base; the pinned hundred has ${beyond}`);
    });

    // The reported bug: Maxed showed Tuned's number. Max is Tuned plus bought
    // Game Changers, so its total is strictly the larger of the two.
    assert.ok(dollars(variant.costs[2]) > dollars(variant.costs[1]),
      `${variant.id} publishes a Maxed build cost of ${variant.costs[2]} against a Tuned cost of ${variant.costs[1]}`);
    // Plan items carry the price they were priced at, which drifts a little from
    // the catalog, so this is a drift check rather than a second calculation.
    const summed = (pinned.Max || []).reduce((sum, entry) => sum + priceOf(entry.name) * (entry.quantity || 1), 0);
    const published = dollars(variant.costs[2]);
    assert.ok(Math.abs(summed - published) <= Math.max(5, published * 0.05),
      `${variant.id} publishes ${variant.costs[2]} for Maxed but its pinned hundred prices at $${summed.toFixed(0)}`);
  }
}



/* ---------------------------------------------------------------------------
   Cards you own that would fill a slot, the mobile Shop, and the basics pool.
   Every assertion below was checked by breaking the code it names and watching
   this file fail; none of them can pass against an empty match.
   --------------------------------------------------------------------------- */

// The suggestion box earns its place by being rare. A slot already holding a card you
// have in hand does not want alternatives, so the box is gated on the slot needing one.
assert.match(deckPageSource, /if \(here && here\.kind !== "buy"\) return "";/,
  "the in-slot suggestions must stay hidden on a slot whose card is already in hand");
// It ranks against the card standing in the slot -- the one on screen, the one a
// suggestion would displace -- and only falls back to the shell when the slot is empty.
assert.match(deckPageSource, /const shell = meta\(ctx, \(slot\.pick && slot\.pick\.name\) \|\| slot\.shellName \|\| ""\);/,
  "the fit target must come from the picked card first and the shell only as a fallback");
// A slot whose card is FOR something only offers cards that do that thing.
assert.match(deckPageSource, /row\.fit\.score > 0 && \(!target\.roles\.length \|\| row\.fit\.shared\.length\)/,
  "a slot with roles must require a shared role, or the list fills with same-type noise");
// Colour identity is a gate, not a tiebreak: an out-of-identity card is illegal here.
assert.match(deckPageSource, /\.filter\(\(card\) => \(card\.colorIdentity \|\| \[\]\)\.every\(\(color\) => identity\.indexOf\(color\) >= 0\)\)/,
  "suggestions must be filtered to the deck's colour identity before they are ranked");
// The deck's identity comes from its commander, and the loose pools carry what the fit
// model reads -- a name and a type line cannot say what a card costs or is for.
assert.match(appSource, /identity: \(cards\[Lineup\.normalizeName\(plan\.commanderName \|\| variant\.commander \|\| ""\)\] \|\| \{\}\)\.colorIdentity \|\| \[\]/,
  "the Deck page context must derive colour identity from the commander card");
for (const field of ["manaCost", "oracleText", "colorIdentity"]) {
  assert.ok(new RegExp(`freeCards\\.push\\(\\{[^}]*${field}:`, "s").test(appSource),
    `loose cards must carry ${field} or the fit model cannot read them`);
}
// One way into a slot: the suggestion button drives the same submit path as the dropdown.
assert.match(appSource, /if \(select\) select\.value = name;\n\s*submitManualCard\(slotId\);/,
  "a best-fit button must go through submitManualCard, not a second code path");

// Mobile Shop: the options fold, but the fold hides nothing you cannot get back, and the
// count on the button means a folded bar can never conceal why a card is missing.
assert.match(shopPageSource, /<div class="sp-bar-body">/, "the foldable block must exist to be folded");
assert.match(shopPageSource, /const activeFilters = FILTERS\.reduce/, "the fold button must count the filters it is hiding");
assert.match(shopPageSource, /class="sp-frow sp-frow-tot"/, "the totals row must sit outside the fold");
assert.match(cssSource, /\.sp-bar\[data-open="0"\] \.sp-bar-body \{ display: none; \}/,
  "the fold must be CSS-driven so a desktop never hides the options");
assert.match(cssSource, /\.sp-gal \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\); /,
  "the gallery must be two cards to a row on a phone");
// Every column survives the restack, carrying the label its header used to carry.
assert.match(shopPageSource, /<td data-k="\$\{c\.key\}" data-lab="\$\{esc\(c\.label\)\}">/,
  "restacked table cells must carry their own column label");
assert.match(cssSource, /table\.sp-table \{ min-width: 0;/,
  "the 1000px table floor must be lifted on a phone, or the restack is still a scroller");

// iOS zooms the page when a focused field's text is under 16px and never zooms back.
// The rule has to be last in the file to win the ties it needs to win.
const zoomRule = cssSource.lastIndexOf("select[class], select:not([class]), textarea[class], textarea:not([class]) { font-size: 16px; }");
assert.ok(zoomRule > 0, "the 16px mobile field rule must exist");
assert.ok(cssSource.slice(zoomRule).indexOf("font-size: 14px") < 0,
  "no later rule may put a form field back under 16px on a phone");

// The basics are a pool, and the note has to say what the pool is made of, because the
// number is a claim about a physical box that nothing in the app can re-derive.
for (const basic of ["plains", "island", "swamp", "mountain", "forest"]) {
  assert.ok((activeState.state.boughtQuantities[basic] || 0) >= 80,
    `${basic} should carry at least the box of eighty`);
}
assert.match(activeState.note, /audited Deck Truth sheet/,
  "the note must record where ownership came from");
/* The audit is per deck, so where each copy sits is recorded as well as how many there
   are -- a global count cannot say which box holds which copy. */
assert.ok(Object.keys(activeState.state.deckHolds || {}).length === 6,
  "every active deck should carry its audited holdings");
/* Ownership is one record per card now, and the two legacy fields are derived from it
   rather than kept alongside it. Nothing else in the app writes them independently, so a
   drift here means a second writer has appeared. */
const ownedRecords = activeState.state.owned || {};
assert.ok(Object.keys(ownedRecords).length > 300, "the state should carry explicit ownership for every card");
assert.equal(activeState.state.ownershipSchema, 3, "explicit ownership is schema 3");
const derived = Object.entries(ownedRecords).filter(([key, rec]) =>
  (activeState.state.boughtQuantities[key] || 0) !== rec.inHand
  || Boolean(activeState.state.found[key]) !== rec.inHand > 0);
assert.equal(derived.length, 0,
  `found/boughtQuantities disagree with owned on ${derived.length} cards, e.g. ${derived.slice(0, 3).map(([k]) => k).join(", ")}`);
// The manifest and the ownership records have to name the same set of cards.
{
  const slugged = (name) => String(name).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const fromRecords = new Set(Object.entries(ownedRecords).filter(([, r]) => r.ordered > 0).map(([k]) => k));
  const fromManifest = new Set((activeState.orderedNotYetInHand || []).map(slugged));
  const onlyRecords = [...fromRecords].filter((k) => !fromManifest.has(k));
  const onlyManifest = [...fromManifest].filter((k) => !fromRecords.has(k));
  assert.equal(onlyRecords.length + onlyManifest.length, 0,
    `the ordered manifest and the ownership records disagree: ${onlyRecords.slice(0, 3).join(", ")} | ${onlyManifest.slice(0, 3).join(", ")}`);
}


// A loaded state carries selections; until now it carried no boxes, so the Deck page
// opened on "0/100 cards in the box" for a deck whose hundred was entirely settled.
assert.match(appSource, /deckActive: \{\},\n\s*deckActiveSeed: \{\},/,
  "the Deck page's boxes must be part of the declared state shape, not a key that appears on first click");
assert.match(appSource, /deckActive: saved\.deckActive \|\| \{\},\n\s*deckActiveSeed: saved\.deckActiveSeed \|\| \{\},/,
  "boxes must be restored explicitly from a saved state");
assert.match(appSource, /function ensureDeckBoxesSeeded\(\)/, "the seeding function must exist");
assert.match(appSource, /if \(state\.deckActiveSeed\[variant\.id\]\) return;/,
  "seeding must happen once per variant, or a later render would undo an untick");
assert.match(appSource, /if \(existing && Object\.keys\(existing\)\.length\) \{/,
  "a state that carries its own boxes must keep them");
// Called on load and at boot, not only when the Deck tab is opened -- Compare's copy
// accounting and the Shop's Bench read the same ticks.
assert.match(appSource, /ensureDeckBoxesSeeded\(\);\n\s*saveState\(`Loaded state/,
  "a loaded payload must have its boxes seeded before it is saved");
assert.match(appSource, /sanitizeGameChangerSelections\(\);\n(?:\s*\/\/[^\n]*\n)*\s*ensureDeckBoxesSeeded\(\);/,
  "boot must seed boxes too, for the state already in localStorage");

// A basic-land row's right-hand pill counted rungs, which is always "1 of 1" there.
assert.match(deckPageSource, /\$\{slot\.quantity\} of \$\{stock\}/,
  "a basic-land row must show its copies against the number you own");
assert.match(appSource, /ownedTotal: \(name\) => Slot\.ownedCount\(owned, name\)\.inHand \|\| 0,/,
  "the copies figure must come from what you own outright, before any deck's claim");
assert.match(deckPageSource, /\$\{pool\} of your \$\{stock === null \? pool : stock\} still free/,
  "the sub-line must still say how many are unallocated, or the pill's total is misleading");


/* Cards bought but not yet arrived. The state file lists them beside the state; until
   this was wired up nothing read the list, so each one looked exactly like a card on the
   table and a ticked row said "In the box" about something still in the post. */
assert.match(appSource, /function applyOrderedManifest\(payload\)/, "the ordered manifest must be read, not just stored");
assert.match(appSource, /state = \{\.\.\.blankState\(\), \.\.\.payload\.state\};\n\s*applyOrderedManifest\(payload\);/,
  "the manifest must be applied to the state a load just installed, before anything renders it");
assert.match(appSource, /state\.owned\[key\] = \{inHand: 0, ordered: rec\.inHand \+ \(rec\.ordered \|\| 0\)\};/,
  "an ordered copy must leave in-hand entirely, or acquisitionOf still reads it as held");
assert.match(appSource, /state\.boughtQuantities\[key\] = 0;\n\s*delete state\.found\[key\];/,
  "the legacy found/boughtQuantities pair must be kept in step the way bumpOwned keeps it");
assert.match(appSource, /if \(!rec \|\| !rec\.inHand\) return;/,
  "a manifest name with no ownership behind it is a typo, not a card in the post");

// The manifest has to name cards the state carries a record for, or the list is
// decoration. What "owned" means for those cards -- ordered, not in hand -- is checked
// against the records themselves further down.
{
  const manifest = activeState.orderedNotYetInHand || [];
  assert.ok(manifest.length > 0, "the committed state should carry an ordered manifest");
  const slug = (name) => String(name).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const unmatched = manifest.filter((entry) => !(activeState.state.owned || {})[slug(entry)]);
  assert.equal(unmatched.length, 0,
    `${unmatched.length} ordered names match no owned card, e.g. ${unmatched.slice(0, 3).join(", ")}`);
}


/* The Deck page's filter bar. Status and Active are separate dropdowns because they are
   separate facts -- what the card's situation is, and whether this deck has claimed the
   slot. They replaced a single six-value "Where", which could not express "everything I
   own that is not in this box" without picking two of its values at once. */
assert.match(deckPageSource, /if \(f\.where && f\.where !== "all" && slotWhere\(ctx, slot, deckId\) !== f\.where\) return false;/,
  "Where keeps its own dropdown -- it is the finest-grained of the three, not a thing the other two replace");
assert.match(deckPageSource, /const WHERE_LABEL = \{\n\s*active: "In the box", bench: "Owned, no box", other: "In another box",\n\s*ordered: "Ordered", buy: "To buy", hole: "Empty slot"\n\s*\};/,
  "Where must keep all six of its values");
assert.match(deckPageSource, /const STATUS_LABEL = \{buy: "To buy", owned: "Owned", ordered: "Ordered", hole: "Empty slot"\};/,
  "Status must offer To buy, Owned and Ordered, plus the empty slots that belong to neither");
// The three compose rather than replacing one another, so all three have to reach the matcher.
for (const key of ["where", "status", "active"]) {
  assert.ok(new RegExp(`\\bf\\.${key} !== "all"`).test(deckPageSource), `the ${key} dropdown must filter`);
  assert.ok(new RegExp(`"${key}"`).test(appSource), `${key} must be part of a deck's stored filters`);
}
assert.match(deckPageSource, /const ACTIVE_LABEL = \{active: "Active", inactive: "Inactive"\};/,
  "Active must offer Active and Inactive");
// Owned is one answer about the card, however the copy is filed.
assert.match(deckPageSource, /if \(kind === "buy" \|\| kind === "ordered"\) return kind;\n(?:\s*\/\/[^\n]*\n)*\s*return "owned";/,
  "in-the-box, on-the-bench and in-another-box must all read as Owned");
assert.match(deckPageSource, /if \(f\.status && f\.status !== "all" && slotStatus\(ctx, slot, deckId\) !== f\.status\) return false;/,
  "the Status dropdown must actually filter");
assert.match(deckPageSource, /if \(f\.active && f\.active !== "all" && slotActive\(ctx, slot\) !== f\.active\) return false;/,
  "the Active dropdown must actually filter");

assert.match(deckPageSource, /const GROUP_BY = \[\["type", "Type"\], \["rarity", "Rarity"\], \["status", "Status"\], \["none", "None"\]\];/,
  "Group by must offer exactly Type, Rarity, Status and None");
assert.match(deckPageSource, /if \(groupBy === "none"\) return \[\[null, slots\]\];/,
  "None must return one nameless group rather than a group per row");
assert.match(deckPageSource, /if \(!label\) return `<section class="dp-grp" data-open="1"><div class="dp-grp-body">\$\{body\}<\/div><\/section>`;/,
  "a nameless group must render without a heading, or None still looks grouped");
// Grouping is not a filter: Clear resets what hides rows, not how they are stacked.
assert.match(appSource, /groupBy: ctx\.filters\.groupBy \|\| "type", sortBy: ctx\.filters\.sortBy \|\| ""\};/,
  "Clear must carry the chosen grouping and sort through -- neither hides a row");
assert.match(appSource, /\{query: "", type: "all", rung: "all", where: "all", status: "all", active: "all", groupBy: "type", sortBy: ""\}/,
  "a deck's filters must start with the new keys, or the first render reads undefined");


/* Select all / Deselect all. Deselect is the one that was asked for; select is its way
   back, because eighty-five clicks is not an undo. Neither may touch anything but the
   claim -- a bulk clear that also edited the selection or the ownership ledger would be
   a very expensive mis-click. */
assert.match(deckPageSource, /data-dp-claim="all"/, "Select all must exist");
assert.match(deckPageSource, /data-dp-claim="none"/, "Deselect all must exist");
assert.match(deckPageSource, /\$\{t\.claimed === t\.cards \+ t\.holes \? "disabled" : ""\}/,
  "Select all must be disabled once everything is already claimed");
assert.match(deckPageSource, /\$\{t\.claimed \? "" : "disabled"\}/,
  "Deselect all must be disabled once nothing is claimed");
{
  const handler = appSource.slice(appSource.indexOf('data-dp-claim]'), appSource.indexOf('data-dp-manual-submit]'));
  assert.ok(handler.length > 200, "the claim handler should be found ahead of the manual-submit one");
  assert.match(handler, /state\.deckActive\[ctx\.deckId\] = next;/, "the handler must write the claim map");
  assert.match(handler, /state\.deckActiveSeed\[ctx\.deckId\] = true;/,
    "clearing every box must leave the deck marked seeded, or the next render fills them back in");
  for (const forbidden of ["buySelections", "compareSelections", "boughtQuantities", "state.owned", "deckRung"]) {
    assert.ok(handler.indexOf(forbidden) < 0, `a bulk claim must not write ${forbidden}`);
  }
}


/* One reading of what a card cost. A price typed into the Paid box is the real number;
   the target is an estimate standing in until there is one. Everything that shows or
   sorts by cost goes through costOf, so a row and the sort beside it cannot disagree. */
assert.match(deckPageSource, /function costOf\(ctx, pick\)/, "there must be one place that decides what a card cost");
assert.match(deckPageSource, /const unit = paid === null \? Number\(pick\.price\) \|\| 0 : Number\(paid\);/,
  "a paid price must win over the target, and the row must know which it is showing");
assert.match(deckPageSource, /\}>\$\{money\(cost\.value\)\}<\/span>/, "the row's price must come from costOf, not straight off the plan");
assert.match(deckPageSource, /const cost = \(s\) => \(s\.pick \? costOf\(ctx, s\.pick\)\.value : -1\);/,
  "a cost sort must sort on the same number the row prints");
// Typing a price has to rebuild the page, or the row keeps showing what it replaced.
assert.match(appSource, /paid\.parentElement\?\.classList\.toggle\("is-set", stored !== null\);\n(?:\s*\/\*[\s\S]*?\*\/\n)?\s*renderDeckPage\(\);/,
  "committing a paid price must re-render the deck");

assert.match(deckPageSource, /const SORT_BY = \[\["", "Deck order"\], \["name", "Name A–Z"\], \["name-desc", "Name Z–A"\],\n\s*\["cost-desc", "Cost high–low"\], \["cost", "Cost low–high"\]\];/,
  "Sort by must offer both directions on name and on cost, with deck order as the way back");
assert.match(deckPageSource, /sortSlots\(ctx, rows, \(ctx\.filters \|\| \{\}\)\.sortBy \|\| ""\)/,
  "sorting must happen inside a group, so choosing one never undoes the grouping");

/* The three numbers that used to sit under Rank order -- 25, 5, 1 -- were the same on
   every deck: five variants times five rungs, five rungs, one chosen. Arithmetic, not
   insight, and it cost a row of screen on every page. */
assert.doesNotMatch(deckPageSource, /dp-collapse|dp-cstep/, "the fixed 25 / 5 / 1 strip must not come back");
assert.doesNotMatch(cssSource, /\.dp-cstep/, "its styles must go with it");


/* Cards picked up and dropped on the bench, then offered on the slots they could fill.
   An option is only useful if it is legal, real, and not already chosen for you. */
{
  const Slot = (await import("../slot-model.js")).default || (await import("../slot-model.js"));
  const yard = activeState.state.liveSalvage || {};
  assert.ok(Object.keys(yard).length > 40, "the yard should hold the cards that were added to it");
  const thin = Object.entries(yard).filter(([, e]) => !e.card || !e.card.typeLine || !e.card.name);
  assert.equal(thin.length, 0,
    `${thin.length} yard cards carry no type line, e.g. ${thin.slice(0, 3).map(([k]) => k).join(", ")}`);

  // Every hand-added option has to be legal in the deck it is offered to. Getting this
  // wrong is silent -- the card simply sits there, illegal, until a game says so.
  const cardsByKey = new Map(cards.cards.map((c) => [Slot.ownedKey(c.name), c]));
  const illegal = [];
  const chosen = [];
  for (const [variantId, list] of Object.entries(activeState.state.manualCards || {})) {
    const plan = buyPlans.plans[variantId];
    if (!plan) continue;
    const grafted = {...plan, manual: list.map((c) => ({...c}))};
    const slots = Slot.deckSlots(grafted, activeState.state.buySelections[variantId] || {}, {});
    const seat = slots.find((s) => s.type === "Commander" && s.pick);
    const identity = (seat && (cardsByKey.get(Slot.ownedKey(seat.pick.name)) || {}).colorIdentity) || [];
    assert.ok(identity.length, `${variantId} should have a commander to take its colours from`);
    for (const entry of list) {
      const ci = entry.colorIdentity || [];
      if (!ci.every((c) => identity.indexOf(c) >= 0)) illegal.push(`${variantId}/${entry.name}`);

    }
  }
  assert.equal(illegal.length, 0,
    `${illegal.length} hand-added cards are outside their deck's colours, e.g. ${illegal.slice(0, 3).join(", ")}`);
  /* A card on the bench has to be a copy no box is holding. It may well ALSO be in a box
     -- the audit has Prophetic Prism boxed in deck 3 and a second copy loose -- so the
     test is not "is it in a deck" but "is there a copy left over". Without the spare, one
     of the two records is stale and the same card is being counted twice. */
  const shortBench = [];
  for (const [key, entry] of Object.entries(yard)) {
    const held = (activeState.state.owned[key] || {}).inHand || 0;
    const boxed = Object.values(activeState.state.deckHolds || {})
      .reduce((n, per) => n + ((per[key] || {}).inHand || 0), 0);
    if (held - boxed < (entry.card.quantity || 1)) shortBench.push(`${entry.card.name} (own ${held}, boxed ${boxed})`);
  }
  assert.equal(shortBench.length, 0,
    `${shortBench.length} bench cards have no spare copy behind them, e.g. ${shortBench.slice(0, 3).join(", ")}`);
  void chosen;
}


/* ---------- what a card actually cost ----------
   The Cost column of the master sheet is the record of money spent. It lands in
   state.purchasePrices, keyed by the same slug every other part of the app resolves a
   card by, so a price typed on a Shop row and a price read on a slot are one number. */
{
  const Slot = (await import("../slot-model.js")).default || (await import("../slot-model.js"));
  const prices = activeState.state.purchasePrices || {};
  assert.ok(Object.keys(prices).length > 250,
    `the paid-price ledger should carry the master sheet's costs, found ${Object.keys(prices).length}`);

  const badKey = Object.keys(prices).find((k) => k !== Slot.ownedKey(k));
  assert.equal(badKey, undefined,
    `every paid price must be filed under a slug the app resolves cards by, found ${badKey}`);

  const badValue = Object.entries(prices).find(([, v]) => !Number.isFinite(Number(v)) || Number(v) < 0);
  assert.equal(badValue, undefined, `a paid price must be a real non-negative number, found ${badValue}`);

  // Cents, not fractions of one. A price that will not round-trip through a two-decimal
  // input is a price the Paid box would silently rewrite the moment it was touched.
  const notCents = Object.entries(prices).find(([, v]) => Math.abs(Number(v) * 100 - Math.round(Number(v) * 100)) > 1e-9);
  assert.equal(notCents, undefined, `paid prices are money and must land on a cent, found ${notCents}`);

  /* The prices have to reach the cards actually in the decks, not sit beside them. A card
     the app knows is one in the catalog, on the bench, or hand-added to a slot -- the last
     of those lives only in the state file, so checking the catalog alone would call a
     legitimately priced manual card an orphan. */
  const known = new Set(cards.cards.map((c) => Slot.ownedKey(c.name)));
  Object.keys(activeState.state.liveSalvage || {}).forEach((k) => known.add(k));
  Object.values(activeState.state.manualCards || {})
    .forEach((list) => (list || []).forEach((e) => known.add(Slot.ownedKey(e.name))));
  const orphans = Object.keys(prices).filter((k) => !known.has(k));
  assert.equal(orphans.length, 0,
    `${orphans.length} paid prices name no card the app knows, e.g. ${orphans.slice(0, 3).join(", ")}`);
}

/* ---------- a row that stands for twelve cards costs twelve times ----------
   Rob's rule, and it has to hold everywhere a row shows one money figure: the slot row on
   the Deck page, the Line column and the gallery tile on the Shop. The unit price stays
   available for the Paid box and the hover, because that is what you type into it. */
{
  const ShopPage = (await import("../shop-page.js")).default || (await import("../shop-page.js"));
  const rows = [
    {key: "plains", name: "Plains", price: 0.4, quantity: 12, decks: [], rungs: []},
    {key: "sol-ring", name: "Sol Ring", price: 2, quantity: 1, decks: [], rungs: []}
  ];
  const paid = {Plains: 0.1, "Sol Ring": null};
  const out = ShopPage.decorate(rows, () => ({}), {}, (n) => paid[n] ?? null);
  assert.equal(out[0].lineTotal.toFixed(2), "1.20",
    "twelve Plains at the ten cents you paid is $1.20, not the ten cents and not the target");
  assert.equal(out[1].lineTotal.toFixed(2), "2.00",
    "an unpriced single falls back to its target, undivided and unmultiplied");
  assert.equal(out[0].paid, 0.1, "the per-copy figure stays, because that is what the Paid box takes");

  assert.match(deckPageSource, /const quantity = Math\.max\(1, Number\(pick\.quantity\) \|\| 1\);\s*\n\s*return \{value: unit \* quantity/,
    "the Deck page's slot cost must be the whole row, not one copy of it");
  assert.doesNotMatch(deckPageSource, /costOf\(ctx, s\.pick\)\.value \* Math\.max/,
    "sorting must not multiply a row cost that already counts its copies");
  assert.match(shopPageSource, /lineTotal: unitCost\(row, paidLookup\(row\.name\)\) \* row\.quantity/,
    "the Shop's line total must prefer what was paid over what was estimated");
}


/* ---------- the Store view: the list you hold at a seller's table ----------
   Different job from every other view on the page. Those are for deciding what to buy;
   this one is for the ten seconds after the decision, holding a card, flipping through a
   box. It is judged on two things: how many cards fit on a phone at once, and how few
   taps it takes to say you bought one. */
{
  const ShopPage = (await import("../shop-page.js")).default || (await import("../shop-page.js"));

  assert.match(shopPageSource, /data-sp-view="store"/, "the Store must be reachable from the view segment");
  assert.match(shopPageSource, /data-sp-buy="\$\{esc\(r\.key\)\}"/, "every Store row needs a Buy target");
  assert.match(shopPageSource, /data-sp-unbuy="\$\{esc\(r\.key\)\}"/, "and every bought row an Undo, because a mistap at a booth is likely");
  assert.match(appSource, /shopPickedUp\.add\(key\)/, "a bought row has to be remembered so it can stay in place");
  /* Undo restores the record as it was, rather than decrementing: a card that was already
     partly in hand before the tap must come back partly in hand, not one lower than it. */
  assert.match(appSource, /shopBuyUndo\.set\(key, before\)/, "Buy must record what it is about to overwrite");
  assert.match(appSource, /state\.owned\[key\] = \{inHand: before\.inHand, ordered: before\.ordered\};/,
    "Undo must put back exactly what was there, not guess at a decrement");

  /* The count on the row and the button is what is still owed. A row of two Signets with
     one already in the box is one card to find; labelling it x2 sends you looking for a
     copy you already have. */
  assert.match(shopPageSource, /const many = r\.need > 1;/, "the Store counts what is missing, not what the deck asks for");

  // A price nobody has is not a price of nothing.
  assert.match(shopPageSource, /function isPriced\(row, paid\)/, "the Store must be able to say it does not know a price");
  assert.match(shopPageSource, /\$\{known \? money\(line\) : "\?"\}/, "an unknown price must never render as \\$0.00");

  /* Every tap rebuilds the page, and in this view that is a tap per card. Losing your
     place forty rows into a box, once per purchase, would make the view useless. */
  assert.match(appSource, /withUiState\("#view-shop2", \(\) => window\.MtgShopPage\.render\(host, ctx\)\);/,
    "the Shop must hold its scroll position across a re-render");

  // Grouping has to be able to match how the cards in front of you are actually filed.
  const byKey = Object.fromEntries(ShopPage.GROUP_BY);
  assert.equal(byKey.letter, "First letter", "an alphabetical box needs an alphabetical grouping");
  assert.equal(byKey.setName, "Set", "a box per set needs a grouping per set");

  const rows = [
    {key: "a", name: "Éowyn, Fearless Knight", setName: "Tales of Middle-earth", quantity: 1, need: 1, decks: [], rungs: []},
    {key: "b", name: "Abrupt Decay", setName: "Modern Masters 2017", quantity: 1, need: 1, decks: [], rungs: []},
    {key: "c", name: "9th Sphere", setName: "Modern Masters 2017", quantity: 1, need: 1, decks: [], rungs: []}
  ];
  const letters = ShopPage.groupRows(rows, "letter").map(([g]) => g);
  assert.deepEqual(letters, ["#", "A", "E"],
    "a shop files Eowyn under E and a numeral under the divider at the front");
  const sets = ShopPage.groupRows(rows, "setName").map(([g, list]) => [g, list.length]);
  assert.deepEqual(sets, [["Modern Masters 2017", 2], ["Tales of Middle-earth", 1]], "and a set box holds its set");

  /* The slot's type is the job the slot does; the card's type is where it is filed. Abrupt
     Decay sitting in a Land slot must not send you to the lands box. */
  const decorated = ShopPage.decorate(
    [{key: "abrupt-decay", name: "Abrupt Decay", type: "Land", quantity: 1, need: 1, decks: [], rungs: []}],
    () => ({typeLine: "Instant", colorIdentity: ["B", "G"], rarity: "rare", setName: "Modern Masters 2017"}),
    {}, () => null);
  assert.equal(decorated[0].cardType, "Instant", "the Store row must say what the card is, not what the slot wanted");
}

/* Nothing you still have to buy may be priced at zero. Zero reaches the Store two ways --
   a plan entry that was never priced and a catalog miss -- and standing at a table being
   told a ten-dollar card is free is the single most expensive thing this page could do. */
{
  const Slot = (await import("../slot-model.js")).default || (await import("../slot-model.js"));
  const byName = {};
  cards.cards.forEach((c) => { byName[c.name.split(" // ")[0].toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()] = c; });
  const owned = Slot.normalizeOwned(activeState.state);
  const decks = [];
  for (const [variantId, selection] of Object.entries(activeState.state.buySelections || {})) {
    const plan = buyPlans.plans[variantId];
    if (!plan) continue;
    const grafted = {...plan, manual: (activeState.state.manualCards[variantId] || []).map((c) => ({...c}))};
    decks.push({id: variantId, slots: Slot.deckSlots(grafted, selection, {owned, cards: byName})});
  }
  const prices = activeState.state.purchasePrices || {};
  const free = Slot.shopRows(decks, owned, null)
    .filter((r) => r.need > 0 && !(Number(r.price) > 0) && prices[r.key] === undefined);
  assert.equal(free.length, 0,
    `${free.length} cards you still have to buy carry no price at all, e.g. ${free.slice(0, 4).map((r) => r.name).join(", ")}`);
}

/* One rule about a zero price, applied in both places that read one. slot-model has
   always treated a plan price of exactly zero as missing data wearing a zero -- Cabal
   Ritual and City of Traitors are both in that set -- and the sweep's library did not,
   so the cost published under a deck and the cost quoted on its Shop rows disagreed by
   whatever those cards were really worth. */
{
  const libSource = await readFile(new URL("../tools/sim/lib.mjs", import.meta.url), "utf8");
  assert.match(libSource, /price: Number\(\(entry\.item\.price \|\| meta\.price\) \?\? 0\)/,
    "the sweep must fall back to the catalog on a zero plan price, as slot-model does");
  assert.doesNotMatch(libSource, /Number\(entry\.item\.price \?\? meta\.price \?\? 0\)/,
    "?? keeps a zero, which is the bug this replaced");
}

/* ---------- the two ways of counting what you owe must agree ----------
   The Shop can work out what is still needed from the ledger (how many copies exist) or
   from state.deckHolds (which box is holding which copy). Those are the same question and
   have to give the same answer. They did not: the audit sheet recorded eleven Mountains in
   a deck whose plan sleeves twelve, so the holds path put a twelfth Mountain on the
   shopping list against a shelf of eighty of them. A hold is a claim on the pool, so it
   has to be the count the deck actually composes. */
{
  const Slot = (await import("../slot-model.js")).default || (await import("../slot-model.js"));
  const byName = {};
  cards.cards.forEach((c) => { byName[c.name.split(" // ")[0].toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()] = c; });
  const owned = Slot.normalizeOwned(activeState.state);
  const holds = activeState.state.deckHolds || {};

  const decks = [];
  for (const [variantId, selection] of Object.entries(activeState.state.buySelections || {})) {
    const plan = buyPlans.plans[variantId];
    if (!plan) continue;
    const grafted = {...plan, manual: (activeState.state.manualCards[variantId] || []).map((c) => ({...c}))};
    decks.push({id: variantId, slots: Slot.deckSlots(grafted, selection, {owned, cards: byName})});
  }
  assert.ok(decks.length >= 6, "the shipped state should carry the live decks");

  // No box may claim more copies of a card than the collection holds.
  const overclaimed = [];
  const claimTotals = {};
  for (const per of Object.values(holds)) {
    for (const [key, rec] of Object.entries(per)) {
      const t = claimTotals[key] || (claimTotals[key] = {inHand: 0, ordered: 0});
      t.inHand += rec.inHand || 0;
      t.ordered += rec.ordered || 0;
    }
  }
  for (const [key, t] of Object.entries(claimTotals)) {
    const have = owned[key] || {inHand: 0, ordered: 0};
    if (t.inHand > have.inHand) overclaimed.push(`${key}: boxes hold ${t.inHand}, you own ${have.inHand}`);
  }
  assert.equal(overclaimed.length, 0,
    `${overclaimed.length} cards are claimed by more boxes than you own copies, e.g. ${overclaimed.slice(0, 3).join("; ")}`);

  /* Basics are held against the pool, not against a per-deck line. A deck sleeving twelve
     Mountains off a shelf of eighty must be recorded as holding twelve: recording eleven
     put the twelfth on the shopping list, because the Shop reads the holds and not the
     shelf. Non-basics are exempt -- a deck can legitimately be short a copy, which is
     what "still to buy" means. */
  const BASIC = new Set(["plains", "island", "swamp", "mountain", "forest", "wastes"]);
  const shortBasics = [];
  for (const deck of decks) {
    const per = holds[deck.id] || {};
    for (const slot of deck.slots) {
      if (!slot.pick || !slot.isBasic) continue;
      const key = Slot.ownedKey(slot.pick.name);
      if (!BASIC.has(key)) continue;
      const claimed = (per[key] || {}).inHand || 0;
      const elsewhere = Object.entries(holds)
        .reduce((n, [other, map]) => n + (other === deck.id ? 0 : ((map[key] || {}).inHand || 0)), 0);
      const spare = Math.max(0, ((owned[key] || {}).inHand || 0) - elsewhere);
      const should = Math.min(slot.pick.quantity, spare);
      if (claimed < should) shortBasics.push(`${deck.id} ${slot.pick.name}: sleeves ${slot.pick.quantity}, holds ${claimed}, ${spare} free`);
    }
  }
  assert.equal(shortBasics.length, 0,
    `${shortBasics.length} decks hold fewer basics than they sleeve, which puts a card you own on the shopping list: ${shortBasics.join("; ")}`);

  /* A hold can only ever ADD to what you owe -- it says a box does not have a copy the
     collection does. It must never hide a purchase the ledger can see. */
  const owe = (rs) => rs.reduce((n, r) => n + r.need, 0);
  const fromLedger = owe(Slot.shopRows(decks, owned, null));
  const fromHolds = owe(Slot.shopRows(decks, owned, claimTotals));
  assert.ok(fromHolds >= fromLedger,
    `counting from the boxes owes ${fromHolds} but counting from the ledger owes ${fromLedger}; a hold must never hide a card you have to buy`);
}

/* Whatever else changes, a deck is a hundred cards. A slot the audit could not fill is
   left empty on purpose and shows as one, so the count below it is the honest number. */
{
  const Slot = (await import("../slot-model.js")).default || (await import("../slot-model.js"));
  const short = [];
  for (const [variantId, selection] of Object.entries(activeState.state.buySelections || {})) {
    const plan = buyPlans.plans[variantId];
    if (!plan) continue;
    const grafted = {...plan, manual: (activeState.state.manualCards[variantId] || []).map((c) => ({...c}))};
    const slots = Slot.deckSlots(grafted, selection, {});
    const cards_ = slots.filter((s) => s.pick).reduce((n, s) => n + s.pick.quantity, 0);
    const holes = slots.filter((s) => !s.pick).length;
    if (cards_ + holes !== 100) short.push(`${variantId}: ${cards_} cards + ${holes} empty`);
  }
  assert.equal(short.length, 0,
    `${short.length} live decks do not account for a hundred slots: ${short.join(", ")}`);
}

/* ---------- the Bench is everything loose, not everything a plan happens to name ----------
   It was built by walking the decks' rungs, which finds the cards a slot could take -- the
   useful half -- and silently dropped every other card you own and have not filed. Twenty
   five of sixty-eight loose cards were invisible that way. A bench that hides a third of
   the shelf is not a record of what is unassigned, so the yard is walked too. */
{
  assert.match(appSource, /Object\.values\(state\.liveSalvage \|\| \{\}\)\.forEach\(\(entry\) => \{/,
    "benchItems must read the yard, not only the decks' rungs");
  assert.match(appSource, /\[\.\.\.fromRungs, \.\.\.loose\]\.forEach\(\(rung\) => \{/,
    "and it must walk both sources into one list");
  /* Whether a card is on the bench is how many copies are left over, not whether a box has
     one: owning two Prophetic Prisms with one sleeved leaves one loose. */
  assert.match(appSource, /if \(spareCopies\(rung\.name\) < 1\) return;/,
    "the bench test must be a spare copy, not the absence of a boxed one");
  assert.doesNotMatch(appSource, /if \(seen\.has\(key\) \|\| boxed\[key\]\) return;/,
    "the boolean 'is it in a box' test hid every card you own two of");
  // Eighty spare Plains is one fact about the shelf, not eighty tiles to scroll past.
  assert.match(appSource, /if \(Slot\.isBasicLand\(\{name: rung\.name/,
    "basics are a pool and must not each take a bench tile");
  // And a card nothing offers has to say so rather than claim it is illegal somewhere.
  assert.match(shopPageSource, /No slot in any of the six decks offers this card/,
    "a bench card with no destination must say why it has none");
}

/* ---------- the gallery tile, and what a Buy actually does ----------
   The art carries the name, the colour and the type. Repeating them underneath spent a
   third of the tile restating the picture, so the panel is down to three rows: who wants
   it, what it costs beside the one button worth having there, and where it is. */
{
  assert.match(shopPageSource, /function galleryBody\(r\)/, "the gallery panel must be built in one place");
  const body = shopPageSource.slice(shopPageSource.indexOf("function galleryBody(r)"),
                                   shopPageSource.indexOf("function bandHeader"));
  for (const gone of ["sp-dot", "r.rarity", "r.spot", "sp-pill", "paidInput"]) {
    assert.ok(body.indexOf(gone) < 0, `the gallery panel must no longer carry ${gone}`);
  }
  for (const kept of ["sp-gdecks", "data-sp-price", "data-sp-paid", "data-sp-buy", "triMarkup"]) {
    assert.ok(body.indexOf(kept) >= 0, `the gallery panel still needs ${kept}`);
  }
  /* The price IS the paid box, at rest. Two fields would put an empty bordered input on
     every tile asking to be filled in; one that reads as text until tapped does not. */
  assert.match(shopPageSource, /<span class="sp-gedit" hidden>/, "the editor must start hidden behind the price");
  assert.match(appSource, /if \(\(el = event\.target\.closest\("\[data-sp-price\]"\)\)\)/, "tapping the price must open it");
  assert.match(appSource, /if \(event\.key === "Enter"\) \{[\s\S]{0,200}?closeGalleryPrice\(input\);/,
    "Enter is what closes a keyboard, so Enter is what must commit");
  assert.match(appSource, /closeGalleryPrice\(input\);\s*\n\s*updateShopPaidTotal\(\);\s*\n\s*\}\);/,
    "and tapping away must save rather than discard what was typed");

  /* Buying writes the box's hold, not just the ledger. Without it the purchase went
     nowhere the Shop could see: the audit had recorded "this deck holds none of these",
     the allocator honours that, and the card just paid for stayed on the list. */
  assert.match(appSource, /const CLAIM_ORDER = \["5o", "4e", "2c", "7e", "3o", "1b"\];/,
    "a bought card lands in Rob's deck order: 5, 4, 2, 7, 3, 1");
  assert.match(appSource, /hold\.inHand \+= add;/, "claiming must raise the box's hold");
  assert.match(appSource, /const claimedNow = Object\.values\(state\.deckHolds\)/,
    "free copies must be counted against every box first, not one at a time as they are visited");
  assert.match(appSource, /shopHoldUndo\.set\(key, holdsBefore\);/,
    "and Undo must be able to put the holds back with the ledger");

  /* Assigning off the Bench frees the card it displaces. Without releasing the hold the
     app goes on claiming a card that is sitting loose in your hand. */
  assert.match(appSource, /if \(out && per\[out\] && per\[out\]\.inHand > 0\) \{\s*\n\s*per\[out\]\.inHand -= 1;/,
    "an assignment must release the displaced card's hold");
}

/* A minimum track wider than the column it sits in overflows: a flat 330px floor spilled
   out of a 328px phone, which is how a full-width card comes to look like it fills half
   the screen. */
assert.match(cssSource, /\.sp-bench\{display:grid;grid-template-columns:repeat\(auto-fill,minmax\(min\(100%,320px\),1fr\)\)/,
  "the bench grid's minimum must be capped at the width available");

/* Three panels sit above the slot list, and the place you finish reading one is the place
   you want to shut it. Each ends with its own control; shut, each keeps the one line that
   says what it is. */
{
  assert.match(deckPageSource, /function panelToggle\(key, open, whenShut\)/, "one control, used by all three panels");
  for (const key of ["head", "ready", "filters"]) {
    assert.ok(deckPageSource.indexOf(`panelToggle("${key}"`) >= 0, `the ${key} panel needs a control`);
  }
  assert.match(deckPageSource, /<div class="dp-head" data-open="\$\{headOpen \? 1 : 0\}">/,
    "the head panel's open state must reach the markup");
  assert.match(cssSource, /\.dp-head\[data-open="0"\] \.dp-head-body,\s*\n\.dp-filters\[data-open="0"\] \.dp-filters-body\{display:none\}/,
    "shutting a panel must hide its body and nothing else");
  // What survives a collapse is the line that identifies the panel.
  assert.match(deckPageSource, /<div class="dp-head-top">/, "the deck name and commander stay visible");
  assert.match(deckPageSource, /<div class="dp-filters-body">/, "the search field stays visible");
  assert.match(appSource, /if \(key === "ready"\) deckPageState\.closedPanels\.ready = deckPageState\.closedPanels\.ready === false;/,
    "the compliance panel ships closed, so its flag reads the other way round");
}

console.log(`Validated ${variants.variants.length} variants and ${Object.keys(buyPlans.plans).length} connected buy profiles.`);
