// Re-price the archived variants' published cost figures from the current catalog.
//
//   node tools/reprice-variants.mjs
//
// A COST IS A CLAIM ABOUT TODAY. data/archive/variants.json publishes three dollar figures
// per variant -- Base, Tuned, Max -- and each is meant to be what that exact hundred costs.
// The hundred does not change; the prices under it move every week, and after a catalog
// refresh most of those figures describe a shopping trip nobody can take any more.
//
// This is not the same as rewriting a score. A score is a claim about a protocol and an
// exact list, and carrying one forward onto a different list is the dishonesty this
// codebase exists to prevent. A price is a claim about a market on a date. Re-deriving it
// from the pinned hundred and the refreshed catalog is the only way it stays true.
//
// tests/data-integrity.mjs holds the two invariants this must not break: Max costs more
// than Tuned, and every published figure is within 5% of its own hundred.

import {readFile, writeFile} from "node:fs/promises";

const VARIANTS = new URL("../data/archive/variants.json", import.meta.url);
const RUNGS = new URL("../data/archive/rung-lists.json", import.meta.url);
const CARDS = new URL("../data/cards.json", import.meta.url);
const ORDER = ["Base", "Tuned", "Max"];

const variants = JSON.parse(await readFile(VARIANTS, "utf8"));
const rungLists = JSON.parse(await readFile(RUNGS, "utf8"));
const catalog = JSON.parse(await readFile(CARDS, "utf8"));
const priceOf = new Map(catalog.cards.map((c) => [c.name.toLowerCase(), Number(c.price) || 0]));

/* An entry the catalog cannot price is not free. It keeps whatever the figure already
   carried for it, which is impossible to recover per card -- so instead the variant keeps
   its published figure whole and is named at the end. A number half-derived from today's
   prices and half from a year ago is worse than an old number honestly labelled. */
function priceHundred(list) {
  let total = 0, unpriced = 0;
  for (const entry of list || []) {
    const price = priceOf.get(entry.name.toLowerCase());
    if (price === undefined) unpriced += 1;
    else total += price * (entry.quantity || 1);
  }
  return {total, unpriced};
}

let moved = 0;
const skipped = [];
for (const variant of variants.variants) {
  const pinned = rungLists.variants[variant.id];
  if (!pinned) continue;
  const priced = ORDER.map((rung) => priceHundred(pinned[rung]));
  const missing = priced.reduce((n, p) => n + p.unpriced, 0);
  if (missing) { skipped.push(`${variant.id} (${missing} cards the catalog cannot price)`); continue; }
  const next = priced.map((p) => `$${Math.round(p.total)} total`);
  if (next.join("|") !== variant.costs.join("|")) moved += 1;
  variant.costs = next;
}

await writeFile(VARIANTS, JSON.stringify(variants, null, 2) + "\n");
console.log(`repriced ${moved} of ${variants.variants.length} variants from data/cards.json (${catalog.generatedAt.slice(0, 10)})`);
if (skipped.length) console.log(`  left alone: ${skipped.join(", ")}`);
