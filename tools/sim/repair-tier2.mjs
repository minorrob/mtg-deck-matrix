// Removes Game Changers from the rungs that are published as Tier 2, and
// re-measures what is left.
//
//   node tools/sim/repair-tier2.mjs           # report
//   node tools/sim/repair-tier2.mjs --write   # write plans + rung-lists
//
// Tuned and Pod Fun are published as Tier 2 builds and Tier 2 permits no Game
// Changers at all. Seven variants were carrying Glacial Chasm in both -- it is
// on Wizards' list and the catalog had it flagged as an ordinary card, so every
// check the project runs waved it through. Correcting the flag
// (tools/sim/sync-game-changers.mjs) turned a silent illegality into a failing
// test, which is the point of the flag; this repairs the decks behind it.
//
// The replacement is measured, not asserted. Each candidate is simulated in the
// list it would join and the best-scoring legal one is taken, then the repaired
// rung is measured again and data/rung-lists.json is re-pinned to it -- because
// the pinned list is the contract that a published score describes the deck
// printed underneath it, and a repaired deck is a different deck.

import path from "node:path";
import {
  parseArgs, readJson, writeJson, loadCatalog, loadConfig, loadOpponents, buildTable,
  tunedCards, funTunedCards, baseCards, maxedCards, buildOracleIndex, affinityWeights,
  cardAffinity, Compliance, Lineup, Engine, ROOT, SIM_DIR, relative
} from "./lib.mjs";

const args = parseArgs(process.argv.slice(2));
const {buyPlans, cards: cardData, audited} = await loadCatalog();
const config = await loadConfig();
const table = buildTable(await loadOpponents(), config.table);
const GAMES = 5000;
const PROBE_GAMES = 2000;
const TIER2_BUCKETS = ["required", "tuned2", "funTuned"];

const {readdir} = await import("node:fs/promises");
const poolFiles = (await readdir(path.join(SIM_DIR, "cache")).catch(() => [])).filter((name) => name.startsWith("pool-"));
const pooled = new Map();
for (const name of poolFiles) {
  const pool = await readJson(path.join(SIM_DIR, "cache", name), null);
  const list = Array.isArray(pool) ? pool : (pool?.candidates || pool?.cards || []);
  for (const candidate of list) {
    if (!candidate?.name) continue;
    const key = Lineup.normalizeName(candidate.name);
    if (!pooled.has(key)) pooled.set(key, candidate);
  }
}
const metaFor = (name) => audited.get(Lineup.normalizeName(name)) || pooled.get(Lineup.normalizeName(name)) || null;
const priceOf = (card) => Number(card?.price ?? 0);
const ROLES = ["Ramp", "Draw", "Removal", "Wipe", "Protection", "Finisher", "Recursion", "Tutor", "Creature", "Land"];
const rolesOf = (card) => {
  const profile = Engine.classifyCard(card || {});
  return ROLES.filter((role) => profile[`is${role}`]).map((role) => role.toLowerCase());
};
const corpus = [...audited.values(), ...pooled.values()];
const oracleIndex = buildOracleIndex(corpus);
const slug = (name, suffix) => `${Lineup.normalizeName(name).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${suffix}`;

const measure = (cards, seed, games) => Engine.simulateGames(cards, table.seats, {
  ...config, games, powerWeights: config.scoreWeights, powerBand: null, targets: config.targets
}, seed).metrics;

const BUCKETS = ["startingShell", "required", "upgrade", "enhance", "max", "tuned2", "enhance2", "max2", "funTuned", "funMax", "altTuned", "altMax"];
const report = [];

for (const [variantId, plan] of Object.entries(buyPlans.plans)) {
  const commander = plan.startingShell?.find((card) => card.isCommander);
  // A deck whose commander is a Game Changer is Tier 3 by construction and is
  // published as one. Nothing to repair.
  if (!commander || commander.gameChanger) continue;
  const offenders = TIER2_BUCKETS.flatMap((bucket) => (plan[bucket] || [])
    .filter((item) => item.gameChanger)
    .map((item) => ({bucket, item})));
  if (!offenders.length) continue;

  const tuned = tunedCards(plan, audited);
  const weights = affinityWeights(tuned, oracleIndex);
  const identity = new Set((commander.colorIdentity || []).map((color) => String(color).toUpperCase()));
  const placed = new Set(BUCKETS.flatMap((bucket) => (plan[bucket] || [])
    .flatMap((item) => String(item.name).split(" // ").map((face) => Lineup.normalizeName(face)))));
  const seed = 20260825 + (plan.deckId || 0) * 97;

  // One replacement per distinct offending card, reused across every bucket the
  // card appears in -- Tuned and Pod Fun both hold Glacial Chasm in the same
  // slot, and giving them different substitutes would split one deck into two.
  const byName = new Map();
  for (const {item} of offenders) {
    const key = Lineup.normalizeName(item.name);
    if (byName.has(key)) continue;
    const outgoing = metaFor(item.name) || item;
    const outRoles = rolesOf(outgoing);
    const outAffinity = cardAffinity(outgoing, weights);
    const candidates = corpus
      .filter((card) => card?.name && !card.gameChanger)
      .filter((card) => !placed.has(Lineup.normalizeName(card.name)))
      .filter((card) => card.commanderLegal !== false && (card.legalities?.commander || "legal") === "legal")
      .filter((card) => (card.colorIdentity || []).map((color) => String(color).toUpperCase()).every((color) => identity.has(color)))
      // Priced, because the whole point of a ladder item is that you can buy it,
      // and inside the Tuned rung's own $60 swap cap.
      .filter((card) => priceOf(card) > 0 && priceOf(card) <= Number(config.maxSwapInPriceUsd || 60))
      .filter((card) => !/^Basic /.test(card.typeLine || ""))
      .map((card) => ({card, roles: rolesOf(card), affinity: cardAffinity(card, weights)}))
      // Same job, and carrying at least as much of the deck's plan as the card
      // it is standing in for.
      .filter(({roles}) => roles.some((role) => outRoles.includes(role)) && roles.includes("land") === outRoles.includes("land"))
      .filter(({affinity}) => affinity >= outAffinity)
      .sort((a, b) => b.affinity - a.affinity || priceOf(a.card) - priceOf(b.card))
      .slice(0, 8);

    let best = null;
    for (const {card} of candidates) {
      const trial = tuned
        .filter((entry) => Lineup.normalizeName(entry.name) !== key)
        .concat([{
          name: card.name, quantity: 1, isCommander: false,
          typeLine: card.typeLine || "", manaCost: card.manaCost || "",
          oracleText: card.oracleText || "", keywords: card.keywords || [],
          colorIdentity: card.colorIdentity || [], commanderLegal: true,
          gameChanger: false, price: priceOf(card)
        }]);
      if ((Compliance.evaluateCardList(trial).tier2 || []).length) continue;
      const score = measure(trial, seed, PROBE_GAMES).score;
      if (!best || score > best.score) best = {card, score};
    }
    if (!best) throw new Error(`${variantId}: nothing legal, priced and in-role can stand in for ${item.name}`);
    byName.set(key, best.card);
    placed.add(Lineup.normalizeName(best.card.name));
  }

  const before = measure(tuned, seed, GAMES);
  const changes = [];
  for (const {bucket, item} of offenders) {
    const card = byName.get(Lineup.normalizeName(item.name));
    changes.push(`${bucket}: ${item.name} → ${card.name} ($${priceOf(card).toFixed(2)})`);
    Object.assign(item, {
      id: slug(card.name, bucket === "funTuned" ? "pod-fun" : "tuned"),
      name: card.name,
      manaCost: card.manaCost || "",
      typeLine: card.typeLine || "",
      price: priceOf(card),
      ceiling: Math.max(priceOf(card), Number(card.ceiling ?? card.price ?? 0)),
      gameChanger: false,
      image: card.image || "",
      tcgplayerUrl: card.tcgplayerUrl || "",
      oracleText: card.oracleText || "",
      keywords: card.keywords || [],
      colorIdentity: card.colorIdentity || [],
      purpose: `Stands in for ${item.name}, which is on Wizards' Game Changer list and so cannot legally sit in a Tier 2 build. Same job in the deck, inside the rung's own price cap.`,
      why: `Stands in for ${item.name}, which is on Wizards' Game Changer list and so cannot legally sit in a Tier 2 build. Same job in the deck, inside the rung's own price cap.`,
      brief: {
        value: `$${priceOf(card).toFixed(2)}. Replaces a card this rung is not allowed to run.`,
        fit: `Chosen by simulation from the legal, priced cards doing the same job, then measured in the rung it joins.`
      }
    });
  }

  const after = measure(tunedCards(plan, audited), seed, GAMES);
  report.push({variantId, changes, before: before.score, after: after.score, plan});
}

report.forEach((row) => {
  console.log(`${row.variantId.padEnd(4)} ${row.before.toFixed(1)} → ${row.after.toFixed(1)}`);
  row.changes.forEach((change) => console.log(`       ${change}`));
});
console.log(`\n${report.length} variant(s) repaired`);

// The pinned lists are the contract. A repaired deck is a different hundred, so
// the pin moves with it or the next composition check is comparing a deck to a
// list it no longer is.
const rungLists = await readJson(path.join(ROOT, "data/rung-lists.json"));
let repinned = 0;
for (const row of report) {
  const entry = rungLists.variants[row.variantId];
  if (!entry) continue;
  const shape = (cards) => cards.map((card) => ({name: card.name, quantity: Math.max(1, Number(card.quantity || 1))}));
  if (entry.Base) entry.Base = shape(baseCards(row.plan, audited));
  if (entry.Tuned) entry.Tuned = shape(tunedCards(row.plan, audited));
  if (entry["Pod Fun"]) entry["Pod Fun"] = shape(funTunedCards(row.plan, audited));
  if (entry.Max) entry.Max = shape(maxedCards(row.plan, audited));
  repinned += 1;
}
console.log(`${repinned} variant(s) re-pinned in data/rung-lists.json`);

if (args.write) {
  await writeJson(path.join(ROOT, "data/buy-plans.json"), buyPlans);
  rungLists.generatedAt = new Date().toISOString();
  await writeJson(path.join(ROOT, "data/rung-lists.json"), rungLists);
  console.log("written to data/buy-plans.json and data/rung-lists.json");
} else {
  console.log("(dry run — pass --write to save)");
}
