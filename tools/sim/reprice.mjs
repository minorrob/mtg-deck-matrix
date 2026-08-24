// Re-prices every variant against the cards it actually contains.
//
//   node tools/sim/reprice.mjs            # report what would change
//   node tools/sim/reprice.mjs --write    # write data/variants.json and data/buy-plans.json
//
// The published cost figures were computed before the ladders were consolidated
// and before Base was rebuilt, so they had drifted a long way from the truth --
// one variant advertised $82 for a build that costs $115. Every number here is
// summed from the composed hundred for that rung, at the same market prices the
// shop list quotes, with owned cards counted at their real price rather than
// discounted to nothing.

import path from "node:path";
import {parseArgs, writeJson, loadCatalog, baseCards, tunedCards, funTunedCards, maxedCards, Lineup, ROOT} from "./lib.mjs";

const args = parseArgs(process.argv.slice(2));
const {variants, buyPlans, audited} = await loadCatalog();

const BUDGET_CEILING = 110;
const cost = (cards) => cards.reduce((sum, card) => sum + Number(card.price || 0) * Math.max(1, Number(card.quantity || 1)), 0);
const owned = new Set((buyPlans.ownedExtras || []).map((name) => Lineup.normalizeName(name)));
const money = (value) => `$${Math.round(value)}`;

const rows = [];
for (const variant of variants.variants) {
  const plan = buyPlans.plans[variant.id];
  if (!plan) continue;
  const lists = {
    Base: baseCards(plan, audited),
    Tuned: tunedCards(plan, audited),
    "Pod Fun": (plan.funTuned || []).length ? funTunedCards(plan, audited) : null,
    Maxed: maxedCards(plan, audited)
  };
  const totals = Object.fromEntries(Object.entries(lists).map(([label, cards]) => [label, cards ? cost(cards) : null]));
  // What you would still have to buy, as distinct from what the deck is worth.
  const toBuy = Object.fromEntries(Object.entries(lists).map(([label, cards]) => [
    label,
    cards ? cost(cards.filter((card) => !owned.has(Lineup.normalizeName(card.name)))) : null
  ]));
  const upgrades = {
    Tuned: lists.Tuned.filter((card) => !lists.Base.some((base) => Lineup.normalizeName(base.name) === Lineup.normalizeName(card.name))).length,
    Maxed: lists.Maxed.filter((card) => !lists.Base.some((base) => Lineup.normalizeName(base.name) === Lineup.normalizeName(card.name))).length
  };
  rows.push({variant, plan, totals, toBuy, upgrades, oldCosts: variant.costs, oldAllIn: plan.allIn});

  variant.costs = [money(totals.Base), money(totals.Tuned), money(totals.Maxed)].map((value) => `${value} total`);
  plan.allIn = Number(totals.Tuned.toFixed(2));
  // Cost notes are prose about the numbers above them, so they have to be
  // rewritten with them or the page contradicts itself.
  const brief = plan.budgetLabel || `$40-${BUDGET_CEILING}`;
  const noteFor = (label, total, buy, count) => {
    const ownedSaving = total - buy;
    const ownedClause = ownedSaving >= 1 ? ` ${money(ownedSaving)} of that is already on your shelf, so ${money(buy)} is what you would spend.` : "";
    if (label === "Base") return `Base: ${money(total)} all in — the cheapest hundred that is still this deck.${ownedClause} The ${brief} brief covers a tuned build; this is what it costs to have something playable while you buy one.`;
    if (label === "Tuned") {
      const over = total - BUDGET_CEILING;
      const verdict = over > 0 ? `That is ${money(over)} past the ${brief} brief for this slot.` : `That is within the ${brief} brief for this slot.`;
      return `Tuned: ${money(total)} all in — ${count} cards beyond Base.${ownedClause} ${verdict}`;
    }
    return `Maxed: ${money(total)} all in — ${count} cards beyond Base.${ownedClause} The ${brief} brief was never meant to cover a maxed Bracket-3 build; this is ${money(total - BUDGET_CEILING)} past it, by design.`;
  };
  const budgetFor = (total) => (total <= BUDGET_CEILING ? "in budget" : total <= BUDGET_CEILING * 1.25 ? "just over" : "beyond brief");
  if (Array.isArray(variant.facts)) {
    const specs = [["Base", totals.Base, toBuy.Base, 0], ["Tuned", totals.Tuned, toBuy.Tuned, upgrades.Tuned], ["Maxed", totals.Maxed, toBuy.Maxed, upgrades.Maxed]];
    variant.facts = variant.facts.map((fact, index) => {
      const [label, total, buy, count] = specs[index] || specs[specs.length - 1];
      return {...fact, budget: budgetFor(total), costNote: noteFor(label, total, buy, count)};
    });
  }
}

rows.sort((a, b) => Math.abs(b.totals.Tuned - Number(b.oldAllIn || 0)) - Math.abs(a.totals.Tuned - Number(a.oldAllIn || 0)));
console.log("largest corrections at the Tuned rung:");
rows.slice(0, 10).forEach((row) => {
  console.log(`  ${row.variant.id.padEnd(4)} was $${Number(row.oldAllIn || 0).toFixed(0).padStart(4)} → $${row.totals.Tuned.toFixed(0).padStart(4)}   (base $${row.totals.Base.toFixed(0)} · max $${row.totals.Maxed.toFixed(0)} · you'd spend $${row.toBuy.Tuned.toFixed(0)})`);
});
const inBudget = rows.filter((row) => row.totals.Tuned <= BUDGET_CEILING).length;
const spendable = rows.filter((row) => row.toBuy.Tuned <= BUDGET_CEILING).length;
console.log(`\n${rows.length} variants · ${inBudget} Tuned builds under $${BUDGET_CEILING} at full price · ${spendable} under it once owned cards are taken out`);

if (args.write) {
  await writeJson(path.join(ROOT, "data/variants.json"), variants);
  await writeJson(path.join(ROOT, "data/buy-plans.json"), buyPlans);
  console.log("written to data/variants.json and data/buy-plans.json");
} else {
  console.log("(dry run — pass --write to save)");
}
