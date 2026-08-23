import {readFile, writeFile} from "node:fs/promises";

const file = new URL("../data/buy-plans.json", import.meta.url);
const catalog = JSON.parse(await readFile(file, "utf8"));
const corrected = [];

for (const [variantId, plan] of Object.entries(catalog.plans || {})) {
  const collections = [
    ["precon", plan.precon ? [plan.precon] : []],
    ["startingShell", plan.startingShell || []],
    ["required", plan.required || []],
    ["upgrade", plan.upgrade || []],
    ["enhance", plan.enhance || []],
    ["max", plan.max || []]
  ];
  for (const [collection, cards] of collections) {
    for (const card of cards) {
      const floor = Number(card.price);
      const ceiling = Number(card.ceiling);
      if (!Number.isFinite(floor) || !Number.isFinite(ceiling) || ceiling <= 0 || floor <= ceiling) continue;
      corrected.push({variantId, collection, name: card.name, from: floor, to: ceiling});
      card.price = ceiling;
    }
  }
}

catalog.priceBoundsAudit = {
  rule: "A user-supplied shopping-cart ceiling is an available price and therefore caps the displayed floor.",
  corrected: corrected.length
};

await writeFile(file, `${JSON.stringify(catalog, null, 2)}\n`);
console.log(JSON.stringify({corrected: corrected.length, examples: corrected.slice(0, 20)}, null, 2));
