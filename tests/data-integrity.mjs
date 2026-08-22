import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const variants = JSON.parse(await readFile(new URL("../data/variants.json", import.meta.url), "utf8"));
const buyPlans = JSON.parse(await readFile(new URL("../data/buy-plans.json", import.meta.url), "utf8"));

assert.equal(variants.decks.length, 6, "expected six deck roles");
assert.equal(variants.variants.length, 30, "expected thirty variants");

const ids = new Set(variants.variants.map((variant) => variant.id));
assert.equal(ids.size, 30, "variant IDs must be unique");

for (const deck of variants.decks) {
  assert.equal(
    variants.variants.filter((variant) => variant.deckId === deck.id).length,
    5,
    `deck ${deck.id} must contain five variants`
  );
}

for (const [variantId, plan] of Object.entries(buyPlans.plans)) {
  assert(ids.has(variantId), `${variantId} must map to a Compare variant`);
  assert.equal(plan.variantId, variantId);
  assert.equal(plan.precon.category, "precon");
  assert(plan.required.every((item) => item.category === "upgrade"));
  assert(plan.enhance.every((item) => item.category === "enhance"));
  assert(plan.enhance.every((item) => !item.price || item.price <= 10), `${variantId} Enhance cards must stay at or below $10`);
  assert(plan.max.every((item) => item.category === "max"));
  assert(plan.max.filter((item) => item.gameChanger).length <= 3, `${variantId} offers at most three Game Changers`);
  const allItems = [plan.precon, ...plan.required, ...plan.enhance, ...plan.max];
  assert(allItems.every((item) => !String(item.image).startsWith("data:")), `${variantId} must not embed images`);
}

console.log(`Validated ${variants.variants.length} variants and ${Object.keys(buyPlans.plans).length} connected buy profiles.`);
