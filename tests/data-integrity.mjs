import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const variants = JSON.parse(await readFile(new URL("../data/variants.json", import.meta.url), "utf8"));
const buyPlans = JSON.parse(await readFile(new URL("../data/buy-plans.json", import.meta.url), "utf8"));
const cards = JSON.parse(await readFile(new URL("../data/cards.json", import.meta.url), "utf8"));
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
  assert(plan.enhance.every((item) => !item.price || item.price <= 10), `${variantId} Enhance cards must stay at or below $10`);
  assert(plan.max.every((item) => item.category === "max"));
  assert(plan.max.filter((item) => item.gameChanger).length <= 3, `${variantId} offers at most three Game Changers`);
  assert([...plan.required, ...plan.enhance].every((item) => item.replaces), `${variantId} Tuned and Enhance purchases must name a one-for-one cut`);
  const allItems = [plan.precon, ...plan.required, ...plan.upgrade, ...plan.enhance, ...plan.max];
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

console.log(`Validated ${variants.variants.length} variants and ${Object.keys(buyPlans.plans).length} connected buy profiles.`);
