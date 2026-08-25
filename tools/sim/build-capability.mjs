// Builds the two ladder rungs the sweep could not produce, and measures them.
//
//   node tools/sim/build-capability.mjs           # report what would change
//   node tools/sim/build-capability.mjs --write   # write data/buy-plans.json
//
// Why this file exists. The sweep optimizes each rung against the one below it
// and stops when no further swap clears the convergence bar. At Tier 2 that bar
// is high -- the Tuned lists already score in the eighties -- so the Max rung
// accepted nothing at all in forty of fifty variants and the Enhance rung in
// forty-nine. Both tabs then rendered empty, which reads as "this deck has no
// upgrades" when the truth is "no upgrade beat the noise floor under the rules
// the Tuned rung already plays by".
//
// The rules are the point. Tuned runs at Tier 2: no Game Changers at all, and a
// $60 ceiling on any single swap. Max is not Tuned with more money -- it is the
// rung where those two restrictions come off. So the Max options here are the
// cards the lower rungs are structurally forbidden from taking: the fifty-three
// cards on Wizards' own Game Changer list, filtered to the deck's colors and
// ranked by how much of the deck's own strategy each one carries. That is a
// capability ladder, and it is what Tier 3 actually means.
//
// Enhance is the opposite question -- what improves the deck without spending
// real money -- so it stays inside Tier 2 and under $20 a card.
//
// Everything written here is measured. Each variant's Tuned hundred, its
// Enhance hundred and its Max-capability hundred are simulated head to head,
// and the delta printed on the page is the one the engine produced. Where
// adopting the whole rung measured WORSE than Tuned, that is what gets
// published: an option this tool offers is not a recommendation it makes.
//
// These items are flagged `capabilityOption` and are deliberately NOT part of
// the pinned rung composition. data/rung-lists.json records the exact hundred
// the sweep measured for each rung, and lineup-compliance.mjs composes each
// plan back against it card for card. Folding an unmeasured-by-the-sweep option
// into that composition would break the one invariant this project actually
// guarantees: that a published score belongs to the deck printed underneath it.

import path from "node:path";
import {
  parseArgs, readJson, writeJson, loadCatalog, loadConfig, loadOpponents, buildTable,
  tunedCards, maxedCards, buildOracleIndex, affinityWeights, cardAffinity, oracleShingles,
  validateList, Compliance, Lineup, Engine, ROOT, SIM_DIR, relative
} from "./lib.mjs";

const args = parseArgs(process.argv.slice(2));
const {buyPlans, cards: cardData, audited} = await loadCatalog();
const config = await loadConfig();
const opponents = await loadOpponents();
const table = buildTable(opponents, config.table);

// Games per measurement. The sweep iterated at 2000 and validated on a
// 5000-game holdout; a single measurement has no iteration to average over, so
// it takes the holdout figure.
const GAMES = 5000;
// Each candidate swap is probed on its own before it is offered. 2000 games is
// the sweep's own iteration size -- enough to see a card break a deck, cheap
// enough to run a dozen times per variant.
const PROBE_GAMES = 2000;
const CANDIDATES_PROBED = 14;
const MAX_PRICE_CAP = 100;      // the Max rung's own ceiling, from the plan
const ENHANCE_PRICE_CAP = 20;   // "a substitution, not a purchase decision"
const MAX_OPTIONS = 6;
const ENHANCE_OPTIONS = 5;

const gameChangers = await readJson(path.join(SIM_DIR, "cache/game-changers.json"), []);
if (!gameChangers.length) {
  console.error(`No Game Changer list at ${relative(path.join(SIM_DIR, "cache/game-changers.json"))}.`);
  process.exit(1);
}

// The Enhance pool is everything the project has ever priced or fetched. The
// audited catalog is what the page can link and price; the cached Scryfall
// pools are what the sweep considered. Both are already normalized.
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

const ROLES = ["Ramp", "Draw", "Removal", "Wipe", "Protection", "Finisher", "Recursion", "Tutor", "Creature", "Land"];
const rolesOf = (card) => {
  const profile = Engine.classifyCard(card || {});
  return ROLES.filter((role) => profile[`is${role}`]).map((role) => role.toLowerCase());
};
const slug = (name, suffix) => `${Lineup.normalizeName(name).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${suffix}`;
const priceOf = (card) => Number(card?.price ?? 0);

// Oracle-text index over the whole priced universe, so "how much of this deck's
// own strategy does this card carry" is measured against a real corpus rather
// than against the deck itself.
const corpus = [...audited.values(), ...pooled.values()];
const oracleIndex = buildOracleIndex(corpus);

// Every card already spoken for anywhere in a plan, so an "upgrade" is never a
// card the deck is being sold twice.
const BUCKETS = ["startingShell", "required", "upgrade", "enhance", "max", "tuned2", "enhance2", "max2", "funTuned", "funMax", "altTuned", "altMax"];
function placedIn(plan) {
  const names = new Set();
  BUCKETS.forEach((bucket) => (plan[bucket] || [])
    // This tool's own previous output is not a reason to skip a card. Ladders
    // here are regenerated whole, so a second run has to see the same universe
    // the first one did or it will quietly produce a worse deck each time.
    .filter((item) => !item.capabilityOption)
    .forEach((item) => String(item.name).split(" // ").forEach((face) => names.add(Lineup.normalizeName(face)))));
  return names;
}

// Cards a ladder now names that data/cards.json has never carried. The page
// prices, links and images every card from that catalog, so an item pointing
// outside it renders as a blank row -- and tests/lineup-compliance.mjs refuses
// the build outright. Same contract bake-ladders.mjs works to.
const newlyAudited = new Map();

function makeItem(card, replaces, {category, stage, suffix, reason, measuredNote}) {
  const name = card.name;
  const key = Lineup.normalizeName(name);
  // A foil printing can be cheaper than the paper one, which would put the
  // floor above the ceiling. The ceiling is a bound, so it takes the larger.
  const ceiling = Math.max(priceOf(card), Number(card.ceiling ?? card.price ?? 0));
  if (!audited.has(key) && !newlyAudited.has(key)) {
    newlyAudited.set(key, {
      name,
      typeLine: card.typeLine || "",
      manaCost: card.manaCost || "",
      oracleText: card.oracleText || "",
      keywords: card.keywords || [],
      colorIdentity: card.colorIdentity || [],
      gameChanger: Boolean(card.gameChanger),
      price: priceOf(card),
      ceiling,
      image: card.image || "",
      tcgplayerUrl: card.tcgplayerUrl || "",
      legalities: {commander: "legal"},
      commanderLegal: true,
      source: card.source || "capability-pool"
    });
  }
  return {
    id: slug(name, suffix),
    name,
    quantity: 1,
    manaCost: card.manaCost || "",
    typeLine: card.typeLine || "",
    price: priceOf(card),
    ceiling,
    category,
    stage,
    purpose: reason,
    why: reason,
    replaces,
    gameChanger: Boolean(card.gameChanger),
    tags: [],
    whereToBuy: "Singles case",
    tcgplayerUrl: card.tcgplayerUrl || "",
    image: card.image || "",
    oracleText: card.oracleText || "",
    keywords: card.keywords || [],
    colorIdentity: card.colorIdentity || [],
    commanderLegal: true,
    maxReason: category === "max" ? reason : undefined,
    brief: {
      value: `$${priceOf(card).toFixed(2)}. ${measuredNote}`,
      fit: reason
    },
    // Offered, not composed. See the header: the pinned rung lists record what
    // the sweep measured, and these options were not in those hundreds.
    capabilityOption: true
  };
}

// Which Tuned card a new card stands in for.
//
// The first version fell back to "the single copy carrying least of the deck's
// plan" when no same-role card was free. That let a Game Changer creature eat a
// ramp spell, and six of those in a row took deck 10's Max rung from 84 to 69 --
// not a stronger deck, a deck with no mana. A swap has to preserve the deck's
// shape to be a swap at all, so the role match is now required: no same-role
// card free, no offer. Never the commander, never a card the deck runs more
// than one of, and lands only ever displace lands.
function pickTarget(tuned, weights, incomingRoles, taken, eligibleNames) {
  if (!incomingRoles.length) return null;
  const wantsLand = incomingRoles.includes("land");
  const ranked = tuned
    // Only cards the rung started with. Without this the second offer can
    // displace the first one's card and the third displace the second's, so
    // six items resolve into one slot and the shop list asks you to buy five
    // cards that never reach the deck.
    .filter((card) => !eligibleNames || eligibleNames.has(Lineup.normalizeName(card.name)))
    .filter((card) =>
      !card.isCommander &&
      Math.max(1, Number(card.quantity || 1)) === 1 &&
      !taken.has(Lineup.normalizeName(card.name)))
    .map((card) => ({card, roles: rolesOf(card)}))
    .filter(({roles}) => roles.includes("land") === wantsLand)
    .filter(({roles}) => roles.some((role) => incomingRoles.includes(role)))
    .map(({card}) => ({card, affinity: cardAffinity(card, weights)}))
    .sort((a, b) => a.affinity - b.affinity || priceOf(a.card) - priceOf(b.card));
  return ranked[0]?.card || null;
}

function measure(cards, seed, games = GAMES) {
  const result = Engine.simulateGames(cards, table.seats, {
    ...config,
    games,
    powerWeights: config.scoreWeights,
    powerBand: null,
    targets: config.targets
  }, seed);
  return result.metrics;
}

const report = [];
for (const [variantId, plan] of Object.entries(buyPlans.plans)) {
  if (!plan?.startingShell) continue;
  const row = {variantId, deckId: plan.deckId};
  try {
    const tuned = tunedCards(plan, audited);
    const commander = tuned.find((card) => card.isCommander);
    const identity = new Set((commander?.colorIdentity || []).map((color) => String(color).toUpperCase()));
    const weights = affinityWeights(tuned, oracleIndex);
    const placed = placedIn(plan);
    const inIdentity = (card) => (card.colorIdentity || [])
      .map((color) => String(color).toUpperCase())
      .every((color) => identity.has(color));

    // ---- Candidate pools -------------------------------------------------
    const gcCandidates = gameChangers
      .filter((card) => !placed.has(Lineup.normalizeName(card.name)))
      .filter(inIdentity)
      // A card with no price is a card the shop list cannot ask you to buy.
      .filter((card) => priceOf(card) > 0 && priceOf(card) <= MAX_PRICE_CAP)
      .map((card) => ({card, affinity: cardAffinity(card, weights), roles: rolesOf(card)}))
      .sort((a, b) => b.affinity - a.affinity || priceOf(a.card) - priceOf(b.card));

    const enhanceCandidates = [];
    const seenCandidate = new Set();
    for (const card of corpus) {
      if (!card?.name || card.gameChanger) continue;
      const key = Lineup.normalizeName(card.name);
      if (placed.has(key) || seenCandidate.has(key)) continue;
      if (card.commanderLegal === false) continue;
      if ((card.legalities?.commander || "legal") !== "legal") continue;
      if (!inIdentity(card)) continue;
      const price = priceOf(card);
      if (!(price > 0) || price > ENHANCE_PRICE_CAP) continue;
      // The Enhance rung is defined by its ceiling as well as its floor: a $6
      // card whose only printing in stock is a $40 foil is not a $6 card.
      if (Number(card.ceiling ?? price) > ENHANCE_PRICE_CAP) continue;
      if (/^Basic /.test(card.typeLine || "")) continue;
      seenCandidate.add(key);
      enhanceCandidates.push({card, affinity: cardAffinity(card, weights), roles: rolesOf(card)});
    }
    enhanceCandidates.sort((a, b) => b.affinity - a.affinity || priceOf(a.card) - priceOf(b.card));

    // ---- Greedy, measured acceptance -------------------------------------
    //
    // Affinity is a good prior for which cards belong in a deck and a poor one
    // for whether the deck still works with them in it. Every offer below is
    // therefore probed against the list it would actually join, and kept only
    // if the deck does not measurably get worse for it. The probe seed differs
    // from the seed the published figure is measured on, so the number printed
    // on the page is an out-of-sample result rather than the one the selection
    // was fitted to.
    const probeSeed = 20260825 + (plan.deckId || 0) * 97;
    const finalSeed = probeSeed + 7919;
    const tolerance = Number(config.convergence?.noiseMargin ?? 1);
    const probe = (cards) => measure(cards, probeSeed, PROBE_GAMES).score;

    const swapInto = (cards, targetName, card) => {
      const key = Lineup.normalizeName(targetName);
      const meta = metaFor(card.name) || card;
      return cards.filter((entry) => Lineup.normalizeName(entry.name) !== key).concat([{
        name: card.name, quantity: 1, isCommander: false,
        typeLine: meta.typeLine || "", manaCost: meta.manaCost || "",
        oracleText: meta.oracleText || "", keywords: meta.keywords || [],
        colorIdentity: meta.colorIdentity || [], commanderLegal: true,
        gameChanger: Boolean(card.gameChanger), price: priceOf(card)
      }]);
    };

    // The hundred both rungs are measured against. Every offer displaces one of
    // these and nothing else.
    const originalNames = new Set(tuned.map((card) => Lineup.normalizeName(card.name)));

    // The deck's own vocabulary: the phrases its cards repeat that the rest of
    // Magic does not. A single affinity number could not protect Dimir Theft's
    // Agent of Treachery -- "gain control of target permanent" is rare enough in
    // the deck that the card scored low against its own role peers, and Bolas's
    // Citadel, which does nothing this deck is about, scored higher. Terms are
    // the right granularity: a card that speaks the deck's language may only be
    // replaced by one that speaks some of it back.
    const planTerms = new Set(Object.keys(weights).slice(0, 60));
    const termsOf = (card) => {
      const spoken = new Set();
      oracleShingles(card?.oracleText || "").forEach((gram) => { if (planTerms.has(gram)) spoken.add(gram); });
      return spoken;
    };

    function greedy(candidates, startList, startScore, taken, {limit, requireGain, tier2Clean, strategyFloor, describe, category, stage, suffix, measuredNote}) {
      const items = [];
      let list = startList;
      let score = startScore;
      let probed = 0;
      for (const {card, roles} of candidates) {
        if (items.length >= limit || probed >= CANDIDATES_PROBED) break;
        const target = pickTarget(list, weights, roles, taken, originalNames);
        if (!target) continue;
        // A swap may not cost the deck its plan. Deck 2a's Max rung offered a
        // Game Changer for one of the four theft cards the whole deck is built
        // around -- the score barely moved, because the engine scores a good
        // card as a good card, and the deck stopped being Dimir Theft. Affinity
        // is what carries that: the incoming card has to hold at least as much
        // of this deck's own strategy as the card leaving does.
        const incoming = cardAffinity(card, weights);
        const leaving = cardAffinity(target, weights);
        if (incoming < leaving * strategyFloor) continue;
        const leavingTerms = termsOf(target);
        if (leavingTerms.size) {
          const incomingTerms = termsOf(card);
          if (![...leavingTerms].some((term) => incomingTerms.has(term))) continue;
        }
        probed += 1;
        const next = swapInto(list, target.name, card);
        // Enhance is a Tier 2 rung and has to stay one. Max is expected to
        // leave Tier 2 -- that is the whole point of it -- so it is not checked
        // against a bar it exists to clear.
        if (tier2Clean && addsTier2(next)) continue;
        const nextScore = probe(next);
        const keeps = requireGain ? nextScore >= score : nextScore >= score - tolerance;
        if (!keeps) continue;
        taken.add(Lineup.normalizeName(target.name));
        list = next;
        score = nextScore;
        items.push(makeItem(card, target.name, {
          category, stage, suffix,
          reason: describe(card, target, roles),
          measuredNote
        }));
      }
      return {items, list, score};
    }

    const taken = new Set();
    const probeBaseline = probe(tuned);

    // Two variants run a Game Changer as their commander (10a's Grand Arbiter
    // Augustin IV, 10d's Braids), so their Tuned build is already outside Tier
    // 2 and no rung built on it can be inside. The bar for Enhance is therefore
    // "adds no violation of its own", not "is clean" -- an absolute check would
    // silently refuse to offer those two decks anything.
    const tier2Baseline = new Set((Compliance.evaluateCardList(tuned).tier2 || []).map((problem) => problem.card));
    const addsTier2 = (cards) => (Compliance.evaluateCardList(cards).tier2 || []).some((problem) => !tier2Baseline.has(problem.card));
    // Whether a Game Changer is new capability for this deck or one more of
    // something it already does changes what is true about it, so it changes
    // what the card's line says.
    const alreadyTier3 = tier2Baseline.size > 0;

    const enhance = greedy(enhanceCandidates, tuned, probeBaseline, taken, {
      // An Enhance card that carries less of the plan than the one it replaces
      // is a sidegrade wearing an upgrade's label.
      limit: ENHANCE_OPTIONS, requireGain: true, tier2Clean: true, strategyFloor: 1,
      category: "enhance", stage: "Enhance", suffix: "enh",
      describe: (card, target, roles) => `Carries more of this deck's own strategy than ${target.name} does, at $${priceOf(card).toFixed(2)} and still inside Tier 2. It ${roles.length ? `covers ${roles.slice(0, 2).join(" and ")}` : "does the same job"}, so the deck keeps its shape.`,
      measuredNote: "Probed against the Tuned build on its own before being offered; kept only because the deck measured no worse with it in."
    });

    const maxed = greedy(gcCandidates, enhance.list, enhance.score, taken, {
      // The floor was 0.75 here on the theory that Max may spend a little of
      // the deck's own text on raw capability. It bought Bolas's Citadel into
      // Dimir Theft for Agent of Treachery -- a generically strong card for one
      // of the four cards the deck is named after -- and the score barely moved,
      // because the engine scores a good card as a good card. A rung that can
      // sell the deck's plan for points is not offering an upgrade.
      limit: MAX_OPTIONS, requireGain: false, tier2Clean: false, strategyFloor: 1,
      category: "max", stage: "Maxxed", suffix: "gc",
      describe: (card, target, roles) => (alreadyTier3
        ? `Tier 3 capability: a Game Changer. This deck's commander is already one, so the deck sits in Bracket 3 either way and has nothing left to protect by refusing a second. It takes the ${roles[0] || "utility"} slot held by ${target.name}.`
        : `Tier 3 capability: a Game Changer, which the Tuned build is not allowed to run at all. It takes the ${roles[0] || "utility"} slot held by ${target.name}.`),
      measuredNote: "A Game Changer — buying it puts the deck in Bracket 3 by definition, whatever it measures."
    });

    const enhanceItems = enhance.items;
    const maxItems = maxed.items;
    row.maxOffered = maxItems.length;
    row.enhanceOffered = enhanceItems.length;

    // ---- Publish: measured out of sample ---------------------------------
    const tunedMetrics = measure(tuned, finalSeed);
    const enhanceMetrics = enhanceItems.length ? measure(enhance.list, finalSeed) : null;
    const maxMetrics = maxItems.length ? measure(maxed.list, finalSeed) : null;

    const total = (cards) => cards.reduce((sum, card) => sum + Math.max(1, Number(card.quantity || 1)), 0);
    row.counts = {tuned: total(tuned), enhance: total(enhance.list), max: total(maxed.list)};
    if (row.counts.enhance !== 100 || row.counts.max !== 100) {
      throw new Error(`composed ${row.counts.enhance}/${row.counts.max} cards, not 100`);
    }
    row.enhanceTier2Clean = !addsTier2(enhance.list);
    row.scores = {tuned: tunedMetrics.score, enhance: enhanceMetrics?.score ?? null, max: maxMetrics?.score ?? null};
    row.margin = Engine.winRateInterval(tunedMetrics).margin * 100;

    // The measured delta, written onto every item of its rung so the page can
    // state it without inventing one.
    const note = (metrics, label) => {
      if (!metrics) return null;
      const delta = metrics.score - tunedMetrics.score;
      const size = Math.abs(delta);
      const verdict = size <= tolerance
        ? "level with the Tuned build inside the margin of error"
        : `${size.toFixed(1)} points ${delta > 0 ? "stronger" : "weaker"} than the Tuned build`;
      return `Adopting the whole ${label} rung measured ${metrics.score.toFixed(1)} against Tuned's ${tunedMetrics.score.toFixed(1)} over ${GAMES.toLocaleString()} games each — ${verdict}.`;
    };
    const enhanceNote = note(enhanceMetrics, "Enhance");
    const maxNote = note(maxMetrics, "Max");
    enhanceItems.forEach((item) => { item.rungMeasurement = enhanceNote; });
    maxItems.forEach((item) => { item.rungMeasurement = maxNote; });

    row.write = () => {
      // Regenerated whole each run, like every other ladder in this project.
      // Hand-kept items whose replaces-pointer no longer resolves are exactly
      // the failure mode bake-ladders was written to stop.
      plan.enhance = [...(plan.enhance || []).filter((item) => item.ownedOptional), ...enhanceItems];
      plan.max = [...(plan.max || []).filter((item) => !item.capabilityOption), ...maxItems];
    };
  } catch (error) {
    row.error = error.message;
  }
  report.push(row);
}

const failed = report.filter((row) => row.error);
report.forEach((row) => {
  if (row.error) { console.log(`${row.variantId.padEnd(4)} FAILED — ${row.error}`); return; }
  const fmt = (value) => (value == null ? "  —  " : value.toFixed(1).padStart(5));
  console.log(`${row.variantId.padEnd(4)} enhance ${String(row.enhanceOffered).padStart(2)} · max ${String(row.maxOffered).padStart(2)}   tuned ${fmt(row.scores.tuned)} → enhance ${fmt(row.scores.enhance)} → max ${fmt(row.scores.max)}   ±${row.margin.toFixed(1)}${row.enhanceTier2Clean ? "" : "  ADDS-TIER2"}`);
});

const offeredMax = report.filter((row) => row.maxOffered > 0).length;
const offeredEnhance = report.filter((row) => row.enhanceOffered > 0).length;
console.log(`\n${report.length} variants · ${failed.length} failed · Max options on ${offeredMax} · Enhance options on ${offeredEnhance}`);
const dirty = report.filter((row) => row.enhanceTier2Clean === false);
if (dirty.length) {
  console.error(`Refusing to write: ${dirty.length} Enhance rung(s) add a Tier 2 violation their Tuned build did not have — ${dirty.map((row) => row.variantId).join(", ")}`);
  process.exit(1);
}
if (failed.length) {
  console.error(`Refusing to write: ${failed.length} variant(s) failed to build.`);
  process.exit(1);
}

console.log(`${newlyAudited.size} card(s) new to the audit will be added to data/cards.json`);

if (args.write) {
  report.forEach((row) => row.write?.());
  if (newlyAudited.size) {
    cardData.cards = [...cardData.cards, ...newlyAudited.values()].sort((a, b) => a.name.localeCompare(b.name));
    await writeJson(path.join(ROOT, "data/cards.json"), cardData);
    // The audit count is a claim about the catalog, so it moves with it.
    if (buyPlans.cardAudit) buyPlans.cardAudit.cardsVerified = cardData.cards.length;
  }
  await writeJson(path.join(ROOT, "data/buy-plans.json"), buyPlans);
  console.log(`written to data/buy-plans.json${newlyAudited.size ? " and data/cards.json" : ""}`);
} else {
  console.log("(dry run — pass --write to save)");
}
