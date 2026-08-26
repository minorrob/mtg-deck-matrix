// Turns the Max rung into an actual Tier 3 build, and measures what that costs.
//
//   node tools/sim/promote-tier3.mjs           # report
//   node tools/sim/promote-tier3.mjs --write   # write plans, rung lists, summary
//
// The problem this fixes. For forty of fifty variants the Max rung composed to
// byte-identical the Tuned hundred, which says those decks cannot be made Tier 3.
// That is false. Bracket 3 IS the allowance of up to three Game Changers, and
// forty-three of the fifty already had in-colour, priced ones sitting in their
// plan -- filed as `capabilityOption`, a flag that by design keeps an item out of
// the composed rung so the pinned lists still matched. The invariant held and the
// meaning did not: Max became a label over the Tuned hundred.
//
// So the Game Changers stop being offers and become the rung. Three rules govern
// which ones, and all three are the bracket's own:
//
//   1. At most three Game Changers in the finished hundred, counting one that is
//      already the commander. compliance-model.js is the authority; 10a and 10d
//      lead with one, so they have room for two.
//   2. A swap may not sell the deck's plan. A Game Changer is generically strong
//      rather than thematic, so rather than refusing those cards this prefers to
//      displace the most peripheral card in a compatible role -- the earlier
//      version demanded a shared phrase and so starved seven decks entirely.
//   3. Nothing that measurably hurts. Each candidate is probed in the list it
//      would join; the published figure is a separate, larger run on a different
//      seed, so it is out of sample rather than the number selection was fitted to.
//
// Where the answer is "this deck is not measurably better at Tier 3", that is
// what gets written. Capability is the point of the rung; the score is the report.

import path from "node:path";
import {
  parseArgs, readJson, writeJson, loadCatalog, loadConfig, loadOpponents, buildTable,
  tunedCards, maxedCards, buildOracleIndex, affinityWeights, cardAffinity, oracleShingles,
  Compliance, Lineup, Engine, ROOT, SIM_DIR, relative
} from "./lib.mjs";

const args = parseArgs(process.argv.slice(2));
const {buyPlans, cards: cardData, audited} = await loadCatalog();
const config = await loadConfig();
const table = buildTable(await loadOpponents(), config.table);

const GAMES = 5000;          // the published figure
const PROBE_GAMES = 3000;    // selection runs
const TIER3_GAME_CHANGERS = 3;
const MAX_PRICE_CAP = 100;
const CANDIDATES_PROBED = 16;
const TARGETS_PROBED = 4;    // how many slots a candidate is tried in
// What the deck's first Game Changer is allowed to cost, in points. It buys the
// bracket -- without one there is no Tier 3 build at all -- so a small measured
// loss is a fair price. The second and third buy nothing but power, so they are
// held to no loss at all.
const CAPABILITY_COST = 2;

const gameChangers = await readJson(path.join(SIM_DIR, "cache/game-changers.json"), []);
if (!gameChangers.length) {
  console.error(`No Game Changer list at ${relative(path.join(SIM_DIR, "cache/game-changers.json"))}.`);
  process.exit(1);
}

const {readdir} = await import("node:fs/promises");
const poolFiles = (await readdir(path.join(SIM_DIR, "cache")).catch(() => [])).filter((n) => n.startsWith("pool-"));
const pooled = new Map();
for (const name of poolFiles) {
  const pool = await readJson(path.join(SIM_DIR, "cache", name), null);
  for (const candidate of (Array.isArray(pool) ? pool : (pool?.candidates || pool?.cards || []))) {
    if (candidate?.name) {
      const key = Lineup.normalizeName(candidate.name);
      if (!pooled.has(key)) pooled.set(key, candidate);
    }
  }
}
const metaFor = (name) => audited.get(Lineup.normalizeName(name)) || pooled.get(Lineup.normalizeName(name)) || null;
const priceOf = (card) => Number(card?.price ?? 0);
const ROLES = ["Ramp", "Draw", "Removal", "Wipe", "Protection", "Finisher", "Recursion", "Tutor", "Creature", "Land"];
const rolesOf = (card) => {
  const profile = Engine.classifyCard(card || {});
  return ROLES.filter((role) => profile[`is${role}`]).map((role) => role.toLowerCase());
};
const slug = (name) => `${Lineup.normalizeName(name).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-t3`;
const corpus = [...audited.values(), ...pooled.values()];
const oracleIndex = buildOracleIndex(corpus);
const measure = (cards, seed, games) => Engine.simulateGames(cards, table.seats, {
  ...config, games, powerWeights: config.scoreWeights, powerBand: null, targets: config.targets
}, seed).metrics;

const BUCKETS = ["startingShell", "required", "upgrade", "enhance", "max", "tuned2", "enhance2", "max2", "funTuned", "funMax", "altTuned", "altMax"];
const newlyAudited = new Map();

function literal(card) {
  const meta = metaFor(card.name) || card;
  return {
    name: card.name, quantity: 1, isCommander: false,
    typeLine: meta.typeLine || "", manaCost: meta.manaCost || "",
    oracleText: meta.oracleText || "", keywords: meta.keywords || [],
    colorIdentity: meta.colorIdentity || [], commanderLegal: true,
    gameChanger: true, price: priceOf(card), tags: []
  };
}

const report = [];
for (const [variantId, plan] of Object.entries(buyPlans.plans)) {
  if (!plan?.startingShell) continue;
  const row = {variantId, deckId: plan.deckId};
  try {
    const tuned = tunedCards(plan, audited);
    // The rung to build ON is the composed Max, not Tuned: ten variants already
    // carry measured Max swaps from the sweep, and five of those swaps are Game
    // Changers that count against the same ceiling. Baselining on Tuned ignored
    // them -- it would have shipped 10a with four Game Changers and pinned a
    // hundred that Lineup does not actually compose.
    const baseline = maxedCards(plan, audited);
    const commander = tuned.find((card) => card.isCommander);
    const identity = new Set((commander?.colorIdentity || []).map((c) => String(c).toUpperCase()));
    const weights = affinityWeights(tuned, oracleIndex);
    const planTerms = new Set(Object.keys(weights).slice(0, 60));
    const carriesPlan = (card) => {
      let hit = false;
      oracleShingles(card?.oracleText || "").forEach((gram) => { if (planTerms.has(gram)) hit = true; });
      return hit;
    };

    // Room left under the bracket's ceiling, counting a commander that is one.
    const already = baseline.filter((card) => card.gameChanger);
    // 2a ships four today, which is already illegal. Dropping the excess is part
    // of the job, not a precondition for it.
    const overCap = Math.max(0, already.length - TIER3_GAME_CHANGERS);
    const budget = Math.max(0, TIER3_GAME_CHANGERS - already.length);
    row.already = already.length;
    row.overCap = overCap;
    row.budget = budget;
    row.dropped = [];

    const placed = new Set(BUCKETS.flatMap((bucket) => (plan[bucket] || [])
      .filter((item) => !item.capabilityOption)
      .flatMap((item) => String(item.name).split(" // ").map((face) => Lineup.normalizeName(face)))));

    const candidates = gameChangers
      .filter((card) => !placed.has(Lineup.normalizeName(card.name)))
      .filter((card) => (card.colorIdentity || []).map((c) => String(c).toUpperCase()).every((c) => identity.has(c)))
      .filter((card) => priceOf(card) > 0 && priceOf(card) <= MAX_PRICE_CAP)
      .map((card) => ({card, affinity: cardAffinity(card, weights), roles: rolesOf(card)}))
      .sort((a, b) => b.affinity - a.affinity || priceOf(a.card) - priceOf(b.card));
    row.pool = candidates.length;

    const probeSeed = 20260827 + (plan.deckId || 0) * 97;
    const finalSeed = probeSeed + 7919;
    const tolerance = Number(config.convergence?.noiseMargin ?? 1);
    const originalNames = new Set(baseline.map((c) => Lineup.normalizeName(c.name)));

    /* Which card a Game Changer displaces. Same role and same land-ness, and among
       those the most peripheral first: a card carrying none of the deck's repeated
       phrases goes before one that does. The previous rule refused the swap outright
       unless the incoming card shared a phrase, which no generically-strong card ever
       does -- that is what left seven decks with nothing on offer. */
    const pickTargets = (list, incomingRoles, taken) => {
      if (!incomingRoles.length) return [];
      const wantsLand = incomingRoles.includes("land");
      return list
        .filter((c) => originalNames.has(Lineup.normalizeName(c.name)))
        .filter((c) => !c.isCommander && Math.max(1, Number(c.quantity) || 1) === 1)
        .filter((c) => !taken.has(Lineup.normalizeName(c.name)))
        .map((c) => ({card: c, roles: rolesOf(c)}))
        .filter(({roles}) => roles.includes("land") === wantsLand)
        .filter(({roles}) => roles.some((r) => incomingRoles.includes(r)))
        .map(({card}) => ({card, plan: carriesPlan(card) ? 1 : 0, affinity: cardAffinity(card, weights)}))
        .sort((a, b) => a.plan - b.plan || a.affinity - b.affinity || priceOf(a.card) - priceOf(b.card))
        .map((entry) => entry.card)
        .slice(0, TARGETS_PROBED);
    };

    const swapInto = (cards, targetName, card) => cards
      .filter((c) => Lineup.normalizeName(c.name) !== Lineup.normalizeName(targetName))
      .concat([literal(card)]);

    const taken = new Set();
    const items = [];
    // Bring the deck under the ceiling first, dropping whichever measured Max
    // swap costs least to lose. Its Tuned predecessor comes back in its place.
    const dropIds = [];
    let list = baseline;
    if (overCap) {
      const gcItems = (plan.max || []).filter((item) => !item.capabilityOption && item.gameChanger);
      const scored = gcItems.map((item) => {
        const without = list.filter((c) => Lineup.normalizeName(c.name) !== Lineup.normalizeName(item.name));
        const back = tuned.find((c) => Lineup.normalizeName(c.name) === Lineup.normalizeName(item.replaces));
        const trial = back ? without.concat([back]) : without;
        return {item, trial, score: trial.length === list.length ? measure(trial, probeSeed, PROBE_GAMES).score : -Infinity};
      }).sort((a, b) => b.score - a.score);
      for (let i = 0; i < overCap && scored[i]; i += 1) {
        dropIds.push(scored[i].item.id);
        row.dropped.push(`${scored[i].item.name} (back to ${scored[i].item.replaces})`);
        list = scored[i].trial;
      }
    }
    row.dropIds = dropIds;
    const postDrop = list;
    let score = measure(list, probeSeed, PROBE_GAMES).score;
    row.probeBaseline = score;
    let probed = 0;

    for (const {card, roles} of candidates) {
      if (items.length >= budget || probed >= CANDIDATES_PROBED) break;
      /* Try the card in several slots, not just the single most peripheral one.
         One slot per candidate was the main source of loss: in a deck already
         scoring ninety, the lowest-affinity card in a role is still load-bearing
         often enough that a good Game Changer looked like a bad one. */
      const options = pickTargets(list, roles, taken);
      if (!options.length) continue;
      probed += 1;
      let best = null;
      for (const target of options) {
        const next = swapInto(list, target.name, card);
        // The bracket's own ceiling, checked on the real composed list rather
        // than assumed from a counter.
        if ((Compliance.evaluateCardList(next).tier3 || []).length) continue;
        const nextScore = measure(next, probeSeed, PROBE_GAMES).score;
        if (!best || nextScore > best.score) best = {target, next, score: nextScore};
      }
      if (!best || best.score < score - tolerance) continue;
      const target = best.target;
      taken.add(Lineup.normalizeName(target.name));
      list = best.next;
      score = best.score;
      const key = Lineup.normalizeName(card.name);
      if (!audited.has(key) && !newlyAudited.has(key)) {
        newlyAudited.set(key, {
          name: card.name, typeLine: card.typeLine || "", manaCost: card.manaCost || "",
          oracleText: card.oracleText || "", keywords: card.keywords || [],
          colorIdentity: card.colorIdentity || [], gameChanger: true,
          price: priceOf(card), ceiling: Math.max(priceOf(card), Number(card.ceiling ?? card.price ?? 0)),
          image: card.image || "", tcgplayerUrl: card.tcgplayerUrl || "",
          legalities: {commander: "legal"}, commanderLegal: true, source: "scryfall-game-changers"
        });
      }
      const reason = `Tier 3 capability: a Game Changer, which a Tier 2 build may not run at all. It takes the ${
        roles[0] || "utility"} slot held by ${target.name}, the card in that role carrying least of this deck's own plan.`;
      items.push({
        id: slug(card.name), name: card.name, quantity: 1,
        manaCost: card.manaCost || "", typeLine: card.typeLine || "",
        price: priceOf(card), ceiling: Math.max(priceOf(card), Number(card.ceiling ?? card.price ?? 0)),
        category: "max", stage: "Maxxed", purpose: reason, why: reason, maxReason: reason,
        replaces: target.name, gameChanger: true, tags: [], whereToBuy: "Singles case",
        tcgplayerUrl: card.tcgplayerUrl || "", image: card.image || "",
        oracleText: card.oracleText || "", keywords: card.keywords || [],
        colorIdentity: card.colorIdentity || [], commanderLegal: true,
        brief: {
          value: `$${priceOf(card).toFixed(2)}. A Game Changer — this is what puts the deck in Bracket 3.`,
          fit: reason
        }
      });
    }

    // The flat swap list above is a fast stand-in for probing only. What gets
    // pinned and published has to be what lineup-model actually composes, or the
    // published score describes a deck the page never shows -- which is exactly
    // the mismatch this tool's first run produced on 10a.
    const kept = (plan.max || []).filter((item) => !item.capabilityOption && !dropIds.includes(item.id));
    const composeFor = (chosen) => {
      const before = plan.max;
      plan.max = [...kept, ...chosen];
      const out = maxedCards(plan, audited);
      plan.max = before;
      return out;
    };

    /* Confirmation. Selection ran on one seed at probe size, and a run of accepts
       that each cost a little inside the noise margin compounds into a real loss:
       the first pass published fifteen decks whose Tier 3 rung measured WEAKER
       than their Tier 2 one, five of them by more than six points. So the finished
       hundred is re-measured on a seed selection never saw, at the published size,
       and promotions come back out until it holds up. A deck left with one Game
       Changer may still be CAPABILITY_COST behind -- that card is what makes it a
       Bracket 3 deck at all -- but two or three have to earn their place. */
    const confirmSeed = probeSeed + 104729;
    const confirmed = (chosen) => measure(composeFor(chosen), confirmSeed, GAMES).score;
    const baseConfirmed = confirmed([]);
    let chosen = items.slice();
    let chosenScore = chosen.length ? confirmed(chosen) : baseConfirmed;
    row.backedOff = [];
    while (chosen.length) {
      const allowance = chosen.length === 1 ? CAPABILITY_COST : tolerance;
      if (chosenScore >= baseConfirmed - allowance) break;
      const trials = chosen.map((item) => {
        const rest = chosen.filter((other) => other !== item);
        return {item, rest, score: rest.length ? confirmed(rest) : baseConfirmed};
      }).sort((a, b) => b.score - a.score);
      row.backedOff.push(`${trials[0].item.name} (${chosenScore.toFixed(1)} -> ${trials[0].score.toFixed(1)})`);
      chosen = trials[0].rest;
      chosenScore = trials[0].score;
    }
    items.length = 0;
    items.push(...chosen);
    const composed = composeFor(items);
    // Replay the swaps that survived, so the flat list and the composed one stay
    // two independent routes to the same hundred. Assigning `composed` here
    // instead would make the agreement check below assert nothing.
    list = items.reduce((acc, item) => swapInto(acc, item.replaces, item), postDrop);

    row.promoted = items.length;
    row.confirmedBase = baseConfirmed;
    row.confirmedScore = chosenScore;
    row.items = items;
    row.kept = kept;
    row.list = composed;
    row.tuned = tuned;
    row.finalSeed = finalSeed;
    row.tier3Clean = !(Compliance.evaluateCardList(composed).tier3 || []).length;
    row.gcInFinal = composed.filter((c) => c.gameChanger).length;
    row.cards = composed.reduce((sum, c) => sum + Math.max(1, Number(c.quantity) || 1), 0);
    // The probe list and the composed list must agree, or a swap resolved into a
    // slot other than the one it named.
    const nameBag = (cards) => cards.flatMap((c) => Array.from({length: Math.max(1, Number(c.quantity) || 1)}, () => Lineup.normalizeName(c.name))).sort().join("|");
    row.composes = nameBag(list) === nameBag(composed);
  } catch (error) {
    row.error = error.message;
  }
  report.push(row);
}

// Measure what was built, out of sample.
for (const row of report) {
  if (row.error || !row.list) continue;
  row.tunedScore = measure(row.tuned, row.finalSeed, GAMES);
  row.maxScore = row.promoted ? measure(row.list, row.finalSeed, GAMES) : row.tunedScore;
}

report.forEach((row) => {
  if (row.error) { console.log(`${row.variantId.padEnd(4)} FAILED — ${row.error}`); return; }
  const delta = row.maxScore.score - row.tunedScore.score;
  console.log(`${row.variantId.padEnd(4)} +${row.promoted} GC${row.dropped.length ? ` -${row.dropped.length}` : "  "} (budget ${row.budget}, pool ${String(row.pool).padStart(2)})  ${
    row.gcInFinal} in deck  ${row.cards} cards  tuned ${row.tunedScore.score.toFixed(1)} -> max ${
    row.maxScore.score.toFixed(1)} (${delta >= 0 ? "+" : ""}${delta.toFixed(1)})${row.tier3Clean ? "" : "  TIER3-ILLEGAL"}${row.composes ? "" : "  COMPOSE-MISMATCH"}`);
  row.dropped.forEach((d) => console.log(`       dropped over the cap: ${d}`));
  row.backedOff.forEach((d) => console.log(`       taken back, did not hold up out of sample: ${d}`));
});

const failed = report.filter((r) => r.error);
const illegal = report.filter((r) => r.tier3Clean === false);
const overCap = report.filter((r) => r.gcInFinal > TIER3_GAME_CHANGERS);
/* "Identical to Tuned" is a claim about the two hundreds, not about how many
   cards this run happened to add: 2a promotes nothing because it was already at
   the ceiling, yet its Max still differs from Tuned by three Game Changers. */
const bag = (cards) => cards.flatMap((c) => Array.from({length: Math.max(1, Number(c.quantity) || 1)}, () => Lineup.normalizeName(c.name))).sort().join("|");
const empty = report.filter((r) => !r.error && r.list && bag(r.list) === bag(r.tuned));
const wrongSize = report.filter((r) => !r.error && r.cards !== 100);
const mismatch = report.filter((r) => r.composes === false);

console.log(`\n${report.length} variants · ${report.filter((r) => r.promoted > 0).length} now carry a promoted Game Changer`);
console.log(`still identical to Tuned: ${empty.length}${empty.length ? ` (${empty.map((r) => r.variantId).join(", ")})` : ""}`);
const worse = report.filter((r) => !r.error && r.maxScore && r.maxScore.score < r.tunedScore.score - CAPABILITY_COST);
console.log(`Max more than ${CAPABILITY_COST} points below Tuned: ${worse.length}${worse.length ? ` (${
  worse.map((r) => `${r.variantId} ${(r.maxScore.score - r.tunedScore.score).toFixed(1)}`).join(", ")})` : ""}`);
console.log(`took a promotion back after confirmation: ${report.filter((r) => r.backedOff && r.backedOff.length).length}`);
if (failed.length || illegal.length || overCap.length || wrongSize.length || mismatch.length) {
  console.error(`\nRefusing to write:`);
  failed.forEach((r) => console.error(`  ${r.variantId} failed: ${r.error}`));
  illegal.forEach((r) => console.error(`  ${r.variantId} does not pass Tier 3 compliance`));
  overCap.forEach((r) => console.error(`  ${r.variantId} carries ${r.gcInFinal} Game Changers, over the limit of ${TIER3_GAME_CHANGERS}`));
  wrongSize.forEach((r) => console.error(`  ${r.variantId} composes to ${r.cards} cards`));
  mismatch.forEach((r) => console.error(`  ${r.variantId}: the composed rung differs from the list that was measured`));
  process.exit(1);
}
console.log(`every Max rung is Tier 3 legal, carries at most ${TIER3_GAME_CHANGERS} Game Changers, and totals 100 cards`);
console.log(`${newlyAudited.size} card(s) new to the audit`);

if (args.write) {
  report.forEach((row) => {
    const plan = buyPlans.plans[row.variantId];
    // Drop the old offers wholesale and write the promoted cards as real rung
    // members. The Enhance offers are untouched: those are still substitutions
    // layered on Tuned, not part of any measured hundred.
    plan.max = [...row.kept, ...row.items];
  });
  if (newlyAudited.size) {
    cardData.cards = [...cardData.cards, ...newlyAudited.values()].sort((a, b) => a.name.localeCompare(b.name));
    await writeJson(path.join(ROOT, "data/cards.json"), cardData);
    if (buyPlans.cardAudit) buyPlans.cardAudit.cardsVerified = cardData.cards.length;
  }
  await writeJson(path.join(ROOT, "data/buy-plans.json"), buyPlans);

  // The pinned hundred moves with the deck, or the published score stops
  // describing what is printed underneath it.
  const rungLists = await readJson(path.join(ROOT, "data/rung-lists.json"));
  report.forEach((row) => {
    const entry = rungLists.variants[row.variantId];
    if (entry && entry.Max) {
      entry.Max = row.list.map((c) => ({name: c.name, quantity: Math.max(1, Number(c.quantity) || 1)}));
    }
  });
  rungLists.generatedAt = new Date().toISOString();
  await writeJson(path.join(ROOT, "data/rung-lists.json"), rungLists);

  const summary = await readJson(path.join(ROOT, "data/simulation-summary.json"));
  report.forEach((row) => {
    const build = summary.builds?.[row.variantId]?.Max;
    if (!build) return;
    const m = row.maxScore;
    Object.assign(build, {
      games: GAMES, holdoutGames: GAMES, score: Number(m.score.toFixed(1)),
      powerScore: Number(m.score.toFixed(1)), winPct: Number(m.winRate.toFixed(4)),
      tier: 3, iterations: 0, verdict: row.promoted ? "tier-3-promoted" : "no-tier-3-headroom",
      swaps: row.promoted, engine: "v2.4",
      note: row.promoted
        ? `${row.promoted} Game Changer${row.promoted === 1 ? "" : "s"} promoted into the rung; ${row.gcInFinal} in the finished deck, against Bracket 3's limit of three`
        : "no in-colour Game Changer could be added without breaking the deck",
      stopReason: `Measured over ${GAMES.toLocaleString()} games on a seed the selection never saw.`
    });
  });
  summary.generatedAt = new Date().toISOString();
  await writeJson(path.join(ROOT, "data/simulation-summary.json"), summary);
  console.log("written to buy-plans.json, cards.json, rung-lists.json and simulation-summary.json");
} else {
  console.log("(dry run — pass --write to save)");
}
