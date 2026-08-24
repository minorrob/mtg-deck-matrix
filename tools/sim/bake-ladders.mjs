// Writes the sweep's optimized hundreds back into the buy plans as ladder items.
//
//   node tools/sim/bake-ladders.mjs           # report what would change
//   node tools/sim/bake-ladders.mjs --write   # write data/buy-plans.json
//
// Without this the sweep's work never reaches the page. Decks 7 through 10 in
// particular had no Tuned ladder at all -- zero required purchases across all
// twenty variants -- so their "Tuned" build was their Base build under a
// different name, and their Pod Fun build did not exist. This turns each
// measured list into the purchases that get you there from Base.
//
// Hand-authored items are kept wherever the card they name is still in the
// measured list, so the prose that explains why a card is in a deck survives
// the rebuild. Only the difference is generated, and generated items carry the
// optimizer's own evidence rather than invented enthusiasm.

import path from "node:path";
import {readdir} from "node:fs/promises";
import {parseArgs, readJson, writeJson, loadCatalog, baseCards, tunedCards, funTunedCards, maxedCards, Lineup, Engine, ROOT, SIM_DIR, RESULTS_DIR, relative} from "./lib.mjs";

const args = parseArgs(process.argv.slice(2));
const {buyPlans, cards: cardData, audited} = await loadCatalog();
const SWEEP_DIR = path.join(SIM_DIR, "sweep");
const poolMeta = new Map();

const files = (await readdir(SWEEP_DIR).catch(() => [])).filter((name) => name.endsWith(".json"));
if (!files.length) {
  console.error(`No sweep records in ${relative(SWEEP_DIR)}.`);
  process.exit(1);
}

// Metadata for cards the optimizer reached for that the site has never priced.
const cachedPools = (await readdir(path.join(SIM_DIR, "cache")).catch(() => [])).filter((name) => name.startsWith("pool-sweep-"));
for (const name of cachedPools) {
  const pool = await readJson(path.join(SIM_DIR, "cache", name), {candidates: []});
  pool.candidates.forEach((candidate) => {
    const key = Lineup.normalizeName(candidate.name);
    if (!poolMeta.has(key)) poolMeta.set(key, candidate);
  });
}
const metaFor = (name) => audited.get(Lineup.normalizeName(name)) || poolMeta.get(Lineup.normalizeName(name)) || null;

// One entry per physical copy, so a list that drops a Forest is a list that is
// one card different rather than one card the same.
const expand = (cards) => cards.flatMap((card) => Array.from({length: Math.max(1, Number(card.quantity || 1))}, () => card.name));
const counts = (names) => names.reduce((map, name) => map.set(Lineup.normalizeName(name), (map.get(Lineup.normalizeName(name)) || 0) + 1), new Map());
const diff = (over, under) => {
  const out = [];
  const under2 = new Map(under);
  over.forEach((count, key) => {
    const spare = count - (under2.get(key) || 0);
    for (let index = 0; index < spare; index += 1) out.push(key);
  });
  return out;
};

const slug = (name, suffix) => `${Lineup.normalizeName(name).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${suffix}`;
const rolesOf = (card) => {
  const profile = Engine.classifyCard(card || {});
  return ["Ramp", "Draw", "Removal", "Wipe", "Protection", "Finisher", "Recursion", "Tutor", "Creature", "Land"]
    .filter((role) => profile[`is${role}`]).map((role) => role.toLowerCase());
};

// Reasons the optimizer recorded for the swaps it made, so a generated item can
// say what the simulation actually saw rather than a stock sentence.
async function reasonsFor(requestId) {
  const result = await readJson(path.join(RESULTS_DIR, `${requestId}.json`), null);
  const reasons = new Map();
  (result?.netChanges || []).forEach((change) => {
    const name = change.in?.name || change.add?.name || change.name;
    if (name && change.reason) reasons.set(Lineup.normalizeName(name), change.reason);
  });
  (result?.history || []).forEach((entry) => (entry.swaps || []).forEach((swap) => {
    if (swap.in && swap.reason && !reasons.has(Lineup.normalizeName(swap.in))) reasons.set(Lineup.normalizeName(swap.in), swap.reason);
  }));
  return reasons;
}

function makeItem(name, replaces, {category, stage, suffix, reason}) {
  const meta = metaFor(name);
  if (!meta) throw new Error(`no card data anywhere for ${name}`);
  return {
    id: slug(name, suffix),
    name: meta.name || name,
    quantity: 1,
    manaCost: meta.manaCost || "",
    typeLine: meta.typeLine || "",
    price: Number(meta.price || 0),
    ceiling: Number(meta.ceiling ?? meta.price ?? 0),
    category,
    stage,
    purpose: reason || `Chosen by simulation for the ${stage} build; it replaces ${replaces}.`,
    why: reason || `Chosen by simulation for the ${stage} build; it replaces ${replaces}.`,
    replaces,
    gameChanger: Boolean(meta.gameChanger),
    tags: [],
    whereToBuy: "Singles case",
    tcgplayerUrl: meta.tcgplayerUrl || "",
    image: meta.image || "",
    oracleText: meta.oracleText || "",
    keywords: meta.keywords || [],
    colorIdentity: meta.colorIdentity || [],
    commanderLegal: true,
    ownedExtra: (buyPlans.ownedExtras || []).some((owned) => Lineup.normalizeName(owned) === Lineup.normalizeName(name)) || undefined
  };
}

// Turn "this hundred" into "these purchases, each replacing that card". Existing
// items survive if their card is still wanted; the rest is generated and paired
// by role, so a removal spell is bought to replace a removal spell wherever the
// pool allows it.
function ladderFor(fromNames, targetNames, existing, options) {
  const from = counts(fromNames);
  const target = counts(targetNames);
  // Every ladder is generated whole rather than reconciled against what was
  // there. Keeping hand-authored items sounded like the respectful thing to do
  // and it is how the first version worked, but an item's replaces-pointer is a
  // position in a chain, not just a name: keeping some and regenerating the
  // rest produced chains where two items claimed the same slot and a rung
  // composed to a list fifty cards away from the one that was measured. The
  // prose is a real loss and the correctness is not negotiable -- a published
  // score has to belong to the deck printed underneath it.
  const kept = [];
  const stillNeeded = new Map(target);
  fromNames.forEach((name) => {
    const key = Lineup.normalizeName(name);
    if (stillNeeded.get(key)) stillNeeded.set(key, stillNeeded.get(key) - 1);
  });
  const cuts = diff(from, target);
  const adds = Array.from(stillNeeded.entries()).flatMap(([key, count]) => Array.from({length: Math.max(0, count)}, () => key));
  if (adds.length !== cuts.length) throw new Error(`${adds.length} cards to add against ${cuts.length} to cut — the lists are not both 100`);

  const nameFor = new Map(targetNames.map((name) => [Lineup.normalizeName(name), name]));
  const cutNameFor = new Map(fromNames.map((name) => [Lineup.normalizeName(name), name]));
  const remainingCuts = [...cuts];
  const generated = adds.map((addKey) => {
    const addName = nameFor.get(addKey) || addKey;
    const addRoles = rolesOf(metaFor(addName));
    // Pair like with like where the pool allows it, so the shop list reads as a
    // set of upgrades rather than an unexplained reshuffle.
    let index = remainingCuts.findIndex((cutKey) => rolesOf(metaFor(cutNameFor.get(cutKey) || cutKey)).some((role) => addRoles.includes(role)));
    if (index < 0) index = 0;
    const [cutKey] = remainingCuts.splice(index, 1);
    const cutName = cutNameFor.get(cutKey) || cutKey;
    return makeItem(addName, cutName, {...options, reason: options.reasons.get(addKey)});
  });
  return {kept, generated, items: [...kept, ...generated]};
}

const report = [];
for (const file of files) {
  const record = await readJson(path.join(SWEEP_DIR, file));
  const plan = buyPlans.plans[record.variantId];
  if (!plan) continue;
  const base = expand(baseCards(plan, audited));
  const row = {variantId: record.variantId, deckId: plan.deckId};
  try {
    const tunedTarget = expand(record.rungs.tuned.cards);
    const tuned = ladderFor(base, tunedTarget, [...(plan.required || []), ...(plan.tuned2 || [])], {
      category: "tuned", stage: "Core", suffix: "tuned", reasons: await reasonsFor(record.rungs.tuned.requestId)
    });
    plan.required = tuned.items;
    plan.tuned2 = [];
    row.tuned = {kept: tuned.kept.length, generated: tuned.generated.length};

    if (record.rungs.podfun) {
      const podfun = ladderFor(base, expand(record.rungs.podfun.cards), plan.funTuned || [], {
        category: "funTuned", stage: "Pod Fun", suffix: "pod-fun", reasons: await reasonsFor(record.rungs.podfun.requestId)
      });
      plan.funTuned = podfun.items;
      plan.funMax = [];
      row.podfun = {kept: podfun.kept.length, generated: podfun.generated.length};
    }

    if (record.rungs.maxed) {
      const maxed = ladderFor(tunedTarget, expand(record.rungs.maxed.cards), [...(plan.upgrade || []), ...(plan.enhance || []), ...(plan.enhance2 || []), ...(plan.max || []), ...(plan.max2 || [])], {
        category: "max", stage: "Maxxed", suffix: "max", reasons: await reasonsFor(record.rungs.maxed.requestId)
      });
      plan.max = maxed.items;
      plan.upgrade = [];
      plan.enhance = [];
      plan.enhance2 = [];
      plan.max2 = [];
      row.maxed = {kept: maxed.kept.length, generated: maxed.generated.length};
    }
  } catch (error) {
    row.error = error.message;
  }
  report.push(row);
}

report.forEach((row) => {
  if (row.error) { console.log(`${row.variantId.padEnd(4)} FAILED — ${row.error}`); return; }
  const part = (label, value) => (value ? `${label} ${value.kept}+${value.generated}` : `${label} —`);
  console.log(`${row.variantId.padEnd(4)} ${part("tuned", row.tuned)}   ${part("pod fun", row.podfun)}   ${part("max", row.maxed)}`);
});

// The gate. Composing each rung through lineup-model must reproduce the exact
// hundred the sweep measured, or the page publishes numbers for a deck it does
// not describe. That is the whole reason this file exists, so it is checked
// rather than assumed.
const breaks = [];
for (const file of files) {
  const record = await readJson(path.join(SWEEP_DIR, file));
  const plan = buyPlans.plans[record.variantId];
  if (!plan) continue;
  const check = (label, composed, measured) => {
    if (!measured) return;
    const got = counts(expand(composed));
    const want = counts(expand(measured));
    const total = Array.from(got.values()).reduce((sum, count) => sum + count, 0);
    if (total !== 100) breaks.push(`${record.variantId} ${label}: composes to ${total} cards`);
    const wrong = Array.from(want.entries()).filter(([key, count]) => (got.get(key) || 0) !== count)
      .concat(Array.from(got.entries()).filter(([key, count]) => (want.get(key) || 0) !== count));
    if (wrong.length) breaks.push(`${record.variantId} ${label}: ${wrong.length} card(s) differ from the measured list, first ${wrong[0][0]}`);
  };
  check("Tuned", tunedCards(plan, audited), record.rungs.tuned?.cards);
  check("Pod Fun", (plan.funTuned || []).length ? funTunedCards(plan, audited) : null, record.rungs.podfun?.cards);
  check("Max", maxedCards(plan, audited), record.rungs.maxed?.cards);
}

console.log(`\n${report.length} variants · ${report.filter((row) => row.error).length} failed to build`);
if (breaks.length) {
  console.error(`Refusing to write: ${breaks.length} rung(s) do not compose back to what was measured.`);
  breaks.slice(0, 15).forEach((problem) => console.error(`  - ${problem}`));
  process.exit(1);
}
console.log("every rung composes back to the exact hundred the sweep measured");

if (args.write) {
  await writeJson(path.join(ROOT, "data/buy-plans.json"), buyPlans);
  console.log("written to data/buy-plans.json");
} else {
  console.log("(dry run — pass --write to save)");
}
