// Builds a simulation request from a baked variant's build at one rung, so a
// deck can be simulated without downloading anything from the browser. Every
// stage is the plan's own published card list for that rung -- never a
// re-optimization of a different rung.
//
//   node tools/sim/make-request.mjs --variant 5o --stage base       # Base, Tier 2, measured only
//   node tools/sim/make-request.mjs --variant 5o                    # Tuned, Tier 2
//   node tools/sim/make-request.mjs --variant 5o --stage podfun --power-floor 61.2
//   node tools/sim/make-request.mjs --variant 5o --stage maxed      # Max, Tier 3
//   node tools/sim/make-request.mjs --variant 5o --lock "Atraxa, Praetors' Voice"
//   node tools/sim/make-request.mjs --variant 5o --table bracket3-night --out sim/requests/mine.json

import path from "node:path";
import {parseArgs, readJson, writeJson, loadCatalog, Lineup, loadConfig, loadOpponents, baseCards, tunedCards, enhanceCards, maxedCards, funTunedCards, funMaxCards, validateList, themeCensus, themeTermsFor, buildOracleIndex, affinityWeights, listAffinity, requestIdFor, stampNow, relative, ROOT, SIM_DIR} from "./lib.mjs";

const args = parseArgs(process.argv.slice(2));

if (args.help || (!args.variant && !args.list)) {
  console.log("Usage: node tools/sim/make-request.mjs --variant <variantId> [--stage base|tuned|podfun|maxed|enhance|fun|funmax] [--power-floor <score>] [--cards <file>] [--lock \"Name;Name\"] [--table <name>] [--out <file>]");
  console.log("       node tools/sim/make-request.mjs --list");
  process.exit(args.help ? 0 : 1);
}

const {variants, buyPlans, cards: cardData, audited} = await loadCatalog();

if (args.list) {
  Object.values(buyPlans.plans).forEach((plan) => {
    const variant = variants.variants.find((entry) => entry.id === plan.variantId);
    console.log(`${plan.variantId.padEnd(4)} deck ${plan.deckId}  ${(variant?.name || plan.deckName).padEnd(38)} ${plan.commander}`);
  });
  process.exit(0);
}

const variantId = String(args.variant);
const plan = buyPlans.plans[variantId];
if (!plan) throw new Error(`No buy plan for variant ${variantId}. Run with --list to see the options.`);
const variant = variants.variants.find((entry) => entry.id === variantId);
const config = await loadConfig();
const opponents = await loadOpponents();
const table = String(args.table || config.table || opponents.defaultTable);
if (!opponents.tables[table]) throw new Error(`Unknown opponent table "${table}"`);

// Each stage is checked against the bracket it is actually meant to satisfy,
// matching how the site frames it: Base, Tuned and Pod Fun against Tier 2 (no
// Game Changers, no mass land denial, no two-card combos), while Max
// intentionally pushes to the Tier 3 line (up to three Game Changers).
//
// The four rungs, and what each one is actually optimizing.
//
// Base is the entry price: the cheapest hundred that is still this deck. It is
// measured and never optimized, because its whole job is to show what you get
// for the least money while the real cards are still on the shop list.
//
// Tuned and Max both chase raw power -- "how well can this deck win" -- so they
// score win rate on the original monotonic curve. Max differs only in the room
// it is given: Tier 3 and a $100 card cap instead of Tier 2 and $60.
//
// Pod Fun is the constrained rung. It scores win rate against a BAND rather
// than maximizing it (dominating a table is not a good night for the table),
// weights the pod-experience metric, and is held to a power floor taken from
// the variant's own Tuned build. That floor is what makes "Tuned is at least as
// strong as its Fun sibling" a property of the search rather than a hope.
const STAGES = {
  base: {label: "Base", tier: 2, cards: baseCards, weights: null, band: false, measureOnly: true, objective: "power"},
  tuned: {label: "Tuned", tier: 2, cards: tunedCards, weights: null, band: false, objective: "power"},
  // Pod Fun starts from the TUNED list, not from a separately authored fun
  // ladder. Only six of the fifty variants ever had one, and starting the
  // constrained rung from the same hundred its Tuned sibling reached is what
  // makes the two comparable at all -- it is the same deck, asked a different
  // question.
  podfun: {label: "Pod Fun", tier: 2, cards: tunedCards, weights: "podFunRungScoreWeights", band: true, objective: "podfun"},
  maxed: {label: "Maxed", tier: 3, cards: maxedCards, weights: null, band: false, objective: "max"},
  // Kept for continuity with what the site already publishes: the middle
  // Enhance rung and the older my-fun ladders. Not part of the four-rung sweep.
  enhance: {label: "Enhance", tier: 2, cards: enhanceCards, weights: null, band: false},
  fun: {label: "Fun Tuned", tier: 2, cards: funTunedCards, weights: "funRungScoreWeights", band: false, requires: "funTuned"},
  funmax: {label: "Fun Max", tier: 3, cards: funMaxCards, weights: "funRungScoreWeights", band: false, requires: "funMax"}
};
const stageArg = String(args.stage || "tuned").toLowerCase();
const spec = STAGES[stageArg];
if (!spec) throw new Error(`--stage must be one of ${Object.keys(STAGES).join(", ")}, got "${stageArg}"`);
if (spec.requires && !(plan[spec.requires] || []).length) {
  console.error(`${variantId} has no ${spec.requires} ladder, so its ${spec.label} build does not exist and must not be simulated.`);
  process.exit(2);
}
const stage = spec.label;
// A rung normally starts from its own composed build. The sweep overrides that
// so each rung starts from the hundred the rung below it actually finished at:
// Max and Pod Fun both begin from the optimized Tuned list, which is what makes
// "Max is at least as strong as Tuned" a property of where the search starts
// rather than a coincidence of where two independent hill-climbs happened to
// stop.
// A result file records only what a reader needs to see -- name, quantity,
// price, type -- so a list read back out of one has no oracle text, no mana
// cost and no color identity. Feeding that straight into a new request builds a
// request with an empty color identity and a hundred cards that classify as
// doing nothing, which produces a colorless candidate pool and a run that
// cannot proceed. Every seeded list is re-hydrated from the audited catalog.
const cards = args.cards
  ? (await readJson(path.resolve(ROOT, String(args.cards)))).cards.map((card) => {
      // The catalog first, then whatever the seed itself carries -- an
      // optimizer can swap in a card it found on Scryfall that the site has
      // never priced, and that card is still in the deck.
      const meta = audited.get(Lineup.normalizeName(card.name)) || {};
      const merged = {
        ...meta,
        ...card,
        quantity: Math.max(1, Number(card.quantity || 1)),
        isCommander: Boolean(card.isCommander),
        typeLine: card.typeLine || meta.typeLine || "",
        oracleText: card.oracleText || meta.oracleText || "",
        manaCost: card.manaCost || meta.manaCost || "",
        keywords: card.keywords || meta.keywords || [],
        colorIdentity: card.colorIdentity || meta.colorIdentity || [],
        commanderLegal: card.commanderLegal !== false && (meta.legalities?.commander || "legal") === "legal",
        price: Number(card.price ?? meta.price ?? 0)
      };
      if (!merged.typeLine) throw new Error(`${card.name} has no card data in the seed or in data/cards.json, so a seeded list cannot be re-hydrated`);
      return merged;
    })
  : spec.cards(plan, audited);
if (args.cards && !cards.length) throw new Error(`--cards file ${args.cards} carried no cards`);

const commander = cards.find((card) => card.isCommander);
// A hard exception to the Tier 2 default above: a commander that is itself a
// Game Changer (per Scryfall's own flag) makes Tier 2 permanently unreachable
// no matter what the other 99 cards are, since the commander can never be the
// swapped-out card. Ask for Tier 3 on every rung for that deck instead of
// sending the optimizer after a target it can never legally hit.
const tier = spec.tier === 3 || commander?.gameChanger ? 3 : 2;
// The land band constrains what a run may change, not which decks may be
// measured: a lands-matter deck at 48 lands is a real deck and gets simulated.
// A tier-rule violation alone (most often a required purchase that happens to
// be a Game Changer, which Tier 2 disallows outright) is not fatal here — the
// runner's mandatory legality pass fixes exactly that before any game is
// played. Only a genuine structural problem (not 100 cards) blocks the request,
// since that is not something a card swap can repair.
const check = validateList(cards, {tier});
if (check.result.total !== 100) {
  console.error(`The ${stage} build for ${variantId} does not validate against Tier ${tier}:`);
  check.problems.forEach((problem) => console.error(`  - ${problem}`));
  process.exit(1);
}
if (!check.ok) {
  console.log(`Note: the ${stage} build for ${variantId} is not Tier ${tier} legal as published — the simulation run will fix this before measuring a baseline:`);
  check.problems.forEach((problem) => console.log(`  - ${problem}`));
}
const landCount = check.result.types.Land || 0;
const landNote = landCount < config.landFloor || landCount > config.landCeiling
  ? `outside the usual ${config.landFloor}-${config.landCeiling} band; the run may not push it further out`
  : "";

// Cards this run may never trade away, beyond the commander. The sweep uses
// this to hold a variant to a card the owner already has on the shelf.
const lockedCards = String(args.lock || "").split(";").map((name) => name.trim()).filter(Boolean);
const missingLocks = lockedCards.filter((name) => !cards.some((card) => card.name === name));
if (missingLocks.length) {
  console.error(`${variantId} does not contain ${missingLocks.join(", ")}, so the run cannot be locked to it.`);
  process.exit(1);
}
const themeTerms = themeTermsFor(variant?.mechanics || []);
// The deck's own vocabulary, taken from its Tuned build -- the form it is meant
// to end up in -- and the floor taken from what this particular rung starts
// with. Together they say: swap whatever you like, but do not hand back more
// than a tenth of the plan you began with.
const affinity = affinityWeights(tunedCards(plan, audited), buildOracleIndex(cardData.cards));
const affinityFloor = Number((listAffinity(cards, affinity) * 0.9).toFixed(1));

const stamp = stampNow();
const id = requestIdFor(`${variantId}-${stageArg}`, stamp);
const request = {
  schemaVersion: 2,
  id,
  variantId,
  deckId: plan.deckId,
  source: `baked-${stageArg}-build`,
  stage,
  createdAt: new Date().toISOString(),
  name: variant?.name || plan.deckName,
  commander: commander?.name || plan.commander,
  table,
  cards,
  constraints: {
    colorIdentity: commander?.colorIdentity || [],
    tier,
    landFloor: Math.min(config.landFloor, landCount),
    landCeiling: Math.max(config.landCeiling, landCount),
    // $100/card applies to the Max rung only (D5) -- every other rung keeps the
    // shared default so a Tuned or Enhance run can't drift toward Max pricing.
    maxSwapInPriceUsd: Number(args["max-price"] || (spec.tier === 3 ? 100 : config.maxSwapInPriceUsd)),
    // A rung optimizes for a different objective, not a different legal deck:
    // only the weights and the win-rate band change, never how the list is
    // validated or measured.
    scoreWeights: spec.weights ? config[spec.weights] : undefined,
    // Which ideas the optimizer should try, as distinct from how it scores them.
    objective: spec.objective || "power",
    // Only the constrained rung bands win rate. Tuned and Max are meant to be
    // as strong as they can be, so they keep the monotonic curve.
    winRateBand: spec.band ? config.winRateBand : undefined,
    // The ceiling is the band's upper edge made binding. Only the constrained
    // rung carries one; Tuned and Max are meant to win as often as they can.
    winRateCeiling: spec.band ? Number(config.winRateBand?.ceiling) : undefined,
    // Set by the sweep from the variant's own Tuned power score. A rung with no
    // floor is unconstrained, which is every rung except Pod Fun.
    powerFloor: Number.isFinite(Number(args["power-floor"])) ? Number(args["power-floor"]) : undefined,
    measureOnly: spec.measureOnly || undefined,
    mustKeep: Array.from(new Set([commander?.name, ...lockedCards].filter(Boolean))),
    themes: variant?.mechanics || [],
    // The strategy guard is a floor on how much of the deck's own plan the list
    // carries, measured against the deck's own repeated vocabulary rather than
    // against its declared mechanics label -- the label is too coarse to
    // protect a strategy, since "Control / Interaction" does not describe a
    // theft deck. themeCensus is carried alongside as a readable sanity number,
    // not as a constraint.
    themeTerms,
    themeCensus: themeCensus(cards, themeTerms),
    affinityFloor,
    affinityWeights: affinity,
    budgetTotalUsd: Number(plan.allIn || 0)
  }
};

const out = args.out ? path.resolve(ROOT, String(args.out)) : path.join(SIM_DIR, "requests", `${id}.json`);
await writeJson(out, request);
console.log(`${variantId} · ${request.name} · ${stage} · Tier ${tier}`);
console.log(`  commander     ${request.commander} (${(request.constraints.colorIdentity || []).join("") || "colorless"})`);
console.log(`  ${stage.toLowerCase()} build   ${check.result.total} cards · ${landCount} lands${landNote ? ` (${landNote})` : ""} · ${check.result.selectedGameChangers.length} Game Changers · Tier ${tier} ${check.ok ? "clean" : "will be fixed on --init"}`);
console.log(`  opponents     ${table}`);
console.log(`  written to    ${relative(out)}`);
