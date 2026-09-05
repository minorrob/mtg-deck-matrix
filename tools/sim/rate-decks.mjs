/**
 * Re-measure the six real decks and write data/deck-ratings.json.
 *
 * The deck viewer's headline numbers come from this file, so they have to be
 * reproducible from the workbook rather than from a scratch directory that no
 * longer exists. Everything the run needs is committed: the hundreds come out of
 * data/master-v2.json, the card text out of data/card-facts.json, the opponents
 * out of sim/opponents.json, and the scoring out of sim/config.json.
 *
 * Three builds per deck, each one a real hundred:
 *
 *   tuned  The Master's target column as it stands. D5's and D6's Tuned swaps
 *          are already applied to it -- every add sits at target=1 and every
 *          displaced card at target=0.
 *   v1     That hundred with the Tuned swaps undone: each add taken out and the
 *          card it displaced put back. Which card that is comes from the slot
 *          notes ("replaced by Tuned add X", "Tuned add X takes the slot", "(for
 *          X)"), not from the Upgrades sheet's CUT list -- the CUT list also
 *          names cards that had already been bench-substituted out before the
 *          Tuned pass, and restoring one of those would fill a slot twice.
 *          D1-D4 have no upgrades, so their v1 IS their tuned and is recorded as
 *          {"sameAs": "v1"} rather than measured twice.
 *   b3     tuned with the Bracket 3 sheet applied. A swap whose displaced card
 *          has already left the hundred is skipped and reported.
 *
 * Cards are supplied the way every other measurement in this repo supplies them:
 * type line, mana cost, oracle text, keywords, colour identity and the Master's
 * price. data/cards.json carries no power or toughness for any card, so the
 * engine estimates a creature's power from its mana value here exactly as it does
 * in the sweep and the ladders. Handing this run the printed figures out of
 * data/card-facts.json would measure these six decks on a different footing from
 * every other published number, so it deliberately does not.
 *
 * The `notes` array is prose about how the file was built, so it is carried forward
 * from the file already on disk rather than regenerated; edit it there when what it
 * describes changes.
 *
 *   node tools/sim/rate-decks.mjs            # measure and print, write nothing
 *   node tools/sim/rate-decks.mjs --write    # write data/deck-ratings.json
 *   node tools/sim/rate-decks.mjs --games 2000 --seeds 2   # a quick look
 */
import path from "node:path";
import {ROOT, Engine, buildTable, loadConfig, loadOpponents, readJson, writeJson, parseArgs} from "./lib.mjs";

const args = parseArgs(process.argv.slice(2));
const GAMES = Number(args.games || 20000);
const SEED_COUNT = Number(args.seeds || 6);
const FIRST_SEED = Number(args.seed || 20260904);
// Six seeds spaced far enough apart that the hash mixer cannot correlate them.
const SEEDS = Array.from({length: SEED_COUNT}, (_unused, index) => FIRST_SEED + index * 7919);

const RATINGS_PATH = path.join(ROOT, "data", "deck-ratings.json");
const METHOD = "Each hundred-card list was played out GAMES times per seed, SEEDS independent seeds apiece, against a four-player pod whose three other seats are drawn from the mixed-pod table in sim/opponents.json — a spread of precon, upgraded-casual, tuned, combo, stax, aristocrats, voltron, tokens and group-hug opponents rather than one fixed gauntlet. Score is a 0–100 composite of how the deck actually played: how often it won, how often it was mana screwed or flooded, how reliably and how early the commander landed, how much interaction was in hand, how fast it closed, and how many uncastable cards were stranded. Higher is better, and a gap between two builds counts as real only when it is larger than twice the combined seed-to-seed noise.";

const norm = (name) => String(name || "").split(" // ")[0].toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/* ---------------- the hundreds ---------------- */

// Which Tuned add took this card's slot. The workbook says it three ways and
// means the same thing each time; anything else (a bench substitution, a plain
// "Cut in Tuned") is NOT a one-for-one displacement and must not be restored.
const DISPLACED_BY = [
  /replaced by Tuned (?:upgrade|add) ([^;(]+)/,
  /Tuned add ([^;(]+) takes the slot/,
  /^Cut in Tuned \(for ([^)]+)\)/
];

function displacementMap(deck, rows) {
  const adds = (deck.upgrades || []).filter((entry) => entry.action === "ADD");
  const pairs = new Map();
  adds.forEach((add) => { if (add.replaces) pairs.set(norm(add.card), add.replaces); });
  rows.forEach((row) => {
    for (const pattern of DISPLACED_BY) {
      const hit = pattern.exec(row.notes || "");
      if (!hit) continue;
      const addName = norm(hit[1]);
      if (!pairs.has(addName)) pairs.set(addName, row.name);
      break;
    }
  });
  const missing = adds.filter((add) => !pairs.has(norm(add.card))).map((add) => add.card);
  return {adds, pairs, missing};
}

function tunedList(deckId, rows) {
  return rows.filter((row) => (row.target[deckId] || 0) > 0)
    .map((row) => ({name: row.name, quantity: row.target[deckId]}));
}

function applySwaps(list, swaps, order) {
  const out = list.map((entry) => ({...entry}));
  const skipped = [];
  swaps.forEach((swap) => {
    const outIndex = out.findIndex((entry) => norm(entry.name) === norm(swap.out));
    if (outIndex < 0) { skipped.push(swap); return; }
    if (out[outIndex].quantity > 1) out[outIndex].quantity -= 1;
    else out.splice(outIndex, 1);
    const inIndex = out.findIndex((entry) => norm(entry.name) === norm(swap.in));
    if (inIndex >= 0) out[inIndex].quantity += 1;
    else out.push({name: swap.in, quantity: 1});
  });
  // Back into the Master's own row order. A hundred is a multiset, but the engine
  // shuffles the array it is handed, so two orderings of the same hundred are two
  // different (equally valid) samples. Ordering every build the same way makes a
  // rerun reproducible and keeps v1, tuned and b3 comparable to each other.
  out.sort((a, b) => order(a.name) - order(b.name));
  return {list: out, skipped};
}

/* ---------------- card metadata ---------------- */

function hydrate(list, facts, catalog, prices, commander) {
  return list.map((entry) => {
    const fact = facts[entry.name] || facts[Object.keys(facts).find((name) => norm(name) === norm(entry.name))] || {};
    const audited = catalog.get(norm(entry.name)) || {};
    return {
      name: entry.name,
      quantity: entry.quantity,
      isCommander: norm(entry.name) === norm(commander),
      typeLine: fact.typeLine || audited.typeLine || "",
      manaCost: fact.manaCost || audited.manaCost || "",
      oracleText: fact.oracleText || audited.oracleText || "",
      keywords: fact.keywords || audited.keywords || [],
      colorIdentity: fact.colorIdentity || audited.colorIdentity || [],
      // The Master's own price column, so a build's cost matches what the
      // shopping pages quote rather than what Scryfall lists today.
      price: Number(prices.get(norm(entry.name)) ?? fact.price ?? audited.price ?? 0),
      gameChanger: Boolean(audited.gameChanger)
    };
  });
}

/* ---------------- measurement ---------------- */

function measure(cards, seats, config) {
  const runs = SEEDS.map((seed) => Engine.simulateGames(cards, seats, {
    ...config,
    games: GAMES,
    scoreWeights: config.scoreWeights,
    powerWeights: config.scoreWeights,
    targets: config.targets,
    // sim/config.json's winRateBand belongs to the Pod Fun rung, which asks a
    // different question (hold the win rate under 45%). These are performance
    // measurements, so the win-rate term rises across the whole range.
    winRateBand: null
  }, seed).metrics);
  const mean = (pick) => runs.reduce((sum, run) => sum + pick(run), 0) / runs.length;
  const scores = runs.map((run) => run.score);
  const scoreMean = scores.reduce((sum, value) => sum + value, 0) / scores.length;
  const variance = scores.reduce((sum, value) => sum + (value - scoreMean) ** 2, 0) / Math.max(1, scores.length - 1);
  const round = (value, places) => Number(value.toFixed(places));
  return {
    score: round(scoreMean, 2),
    se: round(Math.sqrt(variance / scores.length), 3),
    winRate: round(mean((run) => run.winRate), 4),
    screwPct: round(mean((run) => run.screwPct), 4),
    floodPct: round(mean((run) => run.floodPct), 4),
    avgCommanderTurn: round(mean((run) => run.avgCommanderTurn), 2),
    commanderCastRate: round(mean((run) => run.commanderCastRate), 4),
    deadCardsAtT8: round(mean((run) => run.deadCardsAtT8), 2),
    avgWinTurn: round(mean((run) => run.avgWinTurn), 2),
    perSeedScores: scores.map((value) => round(value, 1))
  };
}

function shapeOf(cards) {
  const curve = {};
  let lands = 0;
  let spells = 0;
  let valueSum = 0;
  let cost = 0;
  let count = 0;
  cards.forEach((card) => {
    const profile = Engine.classifyCard(card);
    const copies = card.quantity;
    count += copies;
    cost += Number(card.price || 0) * copies;
    if (profile.isLand) { lands += copies; return; }
    spells += copies;
    valueSum += profile.cmc * copies;
    // One column a mana value at 1 through 8+, so a reader can see the shape of
    // the curve at a glance. A zero-cost spell has no column and is simply not
    // drawn; it is still counted in the average.
    const bucket = Math.min(8, Math.round(profile.cmc));
    if (bucket >= 1) curve[bucket] = (curve[bucket] || 0) + copies;
  });
  return {
    lands,
    avgMv: Number((spells ? valueSum / spells : 0).toFixed(2)),
    curve: Object.fromEntries(Array.from({length: 8}, (_unused, index) => [index + 1, curve[index + 1] || 0])),
    cost: Number(cost.toFixed(2)),
    cards: count
  };
}

function bracketOf(cards) {
  const gameChangers = cards.filter((card) => card.gameChanger).reduce((sum, card) => sum + card.quantity, 0);
  const tier = gameChangers > 0 ? 3 : 2;
  return {label: `B${tier}`, tier, gameChangers};
}

/* ---------------- the run ---------------- */

const config = await loadConfig();
const opponents = await loadOpponents();
const seats = buildTable(opponents, config.table).seats;
const master = await readJson(path.join(ROOT, "data", "master-v2.json"));
const facts = (await readJson(path.join(ROOT, "data", "card-facts.json"))).cards;
const catalog = new Map((await readJson(path.join(ROOT, "data", "cards.json"))).cards.map((card) => [norm(card.name), card]));
const prices = new Map(master.cards.map((row) => [norm(row.name), Number(row.price || 0)]));
const rowIndex = new Map(master.cards.map((row, index) => [norm(row.name), index]));
const rowOrder = (name) => rowIndex.get(norm(name)) ?? Number.MAX_SAFE_INTEGER;
const previous = await readJson(RATINGS_PATH, null);

const decks = [];
for (const deck of Object.values(master.decks)) {
  const tuned = tunedList(deck.id, master.cards);
  const {adds, pairs, missing} = displacementMap(deck, master.cards);
  if (missing.length) throw new Error(`${deck.id}: no displaced card recorded for ${missing.join(", ")}`);
  const undo = adds.map((add) => ({out: add.card, in: pairs.get(norm(add.card))}));
  const v1 = applySwaps(tuned, undo, rowOrder);
  const b3 = applySwaps(tuned, (deck.b3 || []).map((entry) => ({out: entry.replaces, in: entry.add})), rowOrder);

  const builds = {v1: v1.list, tuned, b3: b3.list};
  const hydrated = Object.fromEntries(Object.entries(builds)
    .map(([name, list]) => [name, hydrate(list, facts, catalog, prices, deck.commander)]));
  Object.entries(hydrated).forEach(([name, cards]) => {
    const total = cards.reduce((sum, card) => sum + card.quantity, 0);
    if (total !== 100) throw new Error(`${deck.id} ${name} is ${total} cards, not 100`);
    const blank = cards.filter((card) => !card.typeLine);
    if (blank.length) throw new Error(`${deck.id} ${name}: no card facts for ${blank.map((card) => card.name).join(", ")}`);
  });

  const sameAsV1 = adds.length === 0;
  const measured = {};
  for (const [name, cards] of Object.entries(hydrated)) {
    if (name === "tuned" && sameAsV1) { measured.tuned = {sameAs: "v1"}; continue; }
    process.stderr.write(`${deck.id} ${name} … `);
    measured[name] = {...measure(cards, seats, config), ...shapeOf(cards), bracket: bracketOf(cards)};
    const {lands, avgMv, curve, cost, cards: count, bracket, ...rest} = measured[name];
    measured[name] = {...rest, lands, avgMv, curve, bracket, cost, cards: count};
    process.stderr.write(`${measured[name].score}\n`);
  }

  decks.push({
    id: deck.id,
    label: deck.label,
    commander: deck.commander,
    colorIdentity: [...new Set(hydrated.tuned.flatMap((card) => card.colorIdentity))].sort(),
    builds: measured,
    swapsApplied: {tuned: adds.length, b3: (deck.b3 || []).length - b3.skipped.length}
  });
}

const scoreOf = (deck, build) => {
  const entry = deck.builds[build];
  return entry.sameAs ? deck.builds[entry.sameAs].score : entry.score;
};
const ranking = {};
["v1", "tuned", "b3"].forEach((build) => {
  ranking[build] = decks.slice().sort((a, b) => scoreOf(b, build) - scoreOf(a, build)).map((deck) => deck.id);
  decks.forEach((deck) => {
    deck.rank = deck.rank || {};
    deck.rank[build] = ranking[build].indexOf(deck.id) + 1;
  });
});
// Two builds differ meaningfully only when the gap beats twice the combined
// seed-to-seed noise; anything smaller is a tie however it prints.
const seOf = (deck, build) => {
  const entry = deck.builds[build];
  return entry.sameAs ? deck.builds[entry.sameAs].se : entry.se;
};
const gap = (deck, from, to) => {
  const score = Number((scoreOf(deck, to) - scoreOf(deck, from)).toFixed(2));
  return {score, significant: Math.abs(score) > 2 * Math.hypot(seOf(deck, from), seOf(deck, to))};
};
decks.forEach((deck) => {
  deck.delta = {
    v1ToB3: gap(deck, "v1", "b3"),
    v1ToTuned: gap(deck, "v1", "tuned"),
    tunedToB3: gap(deck, "tuned", "b3")
  };
});

const out = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  engine: "sim-engine.js",
  table: config.table,
  seeds: SEEDS,
  gamesPerSeed: GAMES,
  method: METHOD.replace("GAMES times", `${GAMES.toLocaleString("en-US")} times`).replace("SEEDS independent", `${SEED_COUNT} independent`),
  decks,
  ranking,
  notes: previous ? previous.notes : []
};

decks.forEach((deck) => {
  const line = ["v1", "tuned", "b3"].map((build) => `${build} ${scoreOf(deck, build).toFixed(2)}`).join("  ");
  console.log(`${deck.id} ${deck.label.padEnd(12)} ${line}`);
});

if (args.write) console.log(`wrote ${await writeJson(RATINGS_PATH, out)}`);
else console.log("(nothing written; pass --write)");
