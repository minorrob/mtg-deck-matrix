/* Measuring a hundred cards in the browser, on the published protocol.
 *
 * WHY THIS EXISTS. sim-engine.js has always been able to run in a browser -- it
 * is a UMD module that attaches itself to globalThis -- and nothing ever loaded
 * it there. Every score in the app came from a Node run whose output was
 * committed as data/deck-ratings.json, which works for six decks that ship with
 * the app and not at all for a deck somebody just pasted in.
 *
 * Measured in Chromium on the D6 Krenko hundred: 2,000 games in 56 ms, 20,000 in
 * 622 ms, and the full six-seed protocol in 3.5 s for a score of 71.37 against
 * the published 71.37. So a deck can be measured while its owner is still
 * looking at it, and the answer is the same answer.
 *
 * WHAT THE NUMBER IS NOT. The engine scores a deck on how it plays out a game of
 * creatures, mana and combat. It does not model a storm count, a ritual chain, or
 * winning off a single spell. Measured here: a real mono-red Thor list -- 19
 * instants, 18 artifacts, 14 creatures, and Mana Geyser, Seething Song, Reiterate
 * and Jeska's Will among them -- scores 34.55 against the six baked decks' 71 to
 * 86, on a 0.8% win rate. That is not a verdict on the deck. It is the engine
 * saying it cannot see how the deck wins, and it will say that about every
 * spellslinger list it is shown. Report a score for an imported deck with the
 * archetype in view, or it reads as an insult rather than a measurement.
 *
 * TWO TIERS, DELIBERATELY. A preview is one seed and 2,000 games: fast enough to
 * re-run on every click, and honest about being approximate. The confirm is the
 * published protocol -- six seeds, 20,000 games each -- and is the only run
 * whose number should be recorded. Anything that reports a preview as if it were
 * a measurement is lying by a tenth of a point or so, which is exactly the size
 * of the differences people care about.
 */
(function (root, factory) {
  "use strict";
  const engine = (typeof module === "object" && module.exports && typeof require === "function")
    ? require("./sim-engine.js")
    : root && root.MtgSimEngine;
  const api = factory(engine);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.MtgDeckMeasure = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Engine) {
  "use strict";

  if (!Engine) throw new Error("Deck measurement requires sim-engine.js to be loaded first");

  // The published protocol, and the reason each number is what it is. Six seeds
  // spaced far enough apart that the hash mixer cannot correlate them; 20,000
  // games each because that is where the seed-to-seed spread stops shrinking.
  const FIRST_SEED = 20260904;
  const SEED_STRIDE = 7919;
  const FULL = {seeds: 6, games: 20000};
  const PREVIEW = {seeds: 1, games: 2000};

  function seedsFor(count) {
    return Array.from({length: count}, (_unused, i) => FIRST_SEED + i * SEED_STRIDE);
  }

  /* buildTable lives in tools/sim/lib.mjs, which is Node-only. It is eight lines
     and this is them: turn the named opponent mix into weighted seats. Kept here
     rather than imported so the browser needs nothing from tools/. */
  function buildSeats(opponents, tableName) {
    const name = tableName || opponents.defaultTable;
    const mix = opponents.tables[name];
    if (!mix) throw new Error(`Unknown opponent table "${name}"`);
    const total = mix.reduce((sum, entry) => sum + Number(entry.weight || 0), 0) || 1;
    return mix.map((entry) => ({
      ...opponents.profiles[entry.profile],
      weight: Number(entry.weight || 0) / total
    }));
  }

  /* The engine wants printed facts, not catalogue rows. Sources are tried in the
     order that keeps a browser run identical to the Node one: the card-facts
     file first, then whatever the caller attached to the entry.

     data/cards.json carries no power or toughness for any card, so the engine
     estimates a creature's power from its mana value -- here exactly as in the
     sweep and the ladders. Feeding it the printed figures would measure this
     deck on a footing no other published number shares. */
  /* Colour identity arrives in two shapes. card-facts.json and Scryfall give an
     array, ["W","B"]; graph.json packs it into a string, "WB", because that is
     how the export writes it. The engine indexes it, so a string silently
     becomes a list of characters in some places and throws in others. Normalise
     once, here, rather than at every call site. */
  function colorsOf(value) {
    if (Array.isArray(value)) return value;
    if (typeof value === "string") return value.split("").filter((c) => "WUBRGC".includes(c));
    return [];
  }

  function hydrate(cards, facts) {
    return cards.map((entry) => {
      const fact = (facts && (facts[entry.name] || facts[entry.card && entry.card.name])) || entry.card || {};
      return {
        name: entry.name,
        quantity: Number(entry.quantity || 1),
        isCommander: Boolean(entry.isCommander),
        typeLine: fact.typeLine || fact.type || "",
        manaCost: fact.manaCost || "",
        oracleText: fact.oracleText || "",
        keywords: fact.keywords || [],
        colorIdentity: colorsOf(fact.colorIdentity != null ? fact.colorIdentity : fact.ci),
        price: Number(fact.price != null ? fact.price : (entry.price || 0)),
        gameChanger: Boolean(fact.gameChanger || entry.gameChanger)
      };
    });
  }

  /* A stable fingerprint of the hundred, so the app can tell whether the score on
     screen still describes the list on screen.

     Sorted by name, so reordering the same cards does not change it -- the deck
     is a multiset and reshuffling it is not an edit. Quantity is part of the key,
     because 22 Mountains and 23 Mountains are different decks. The commander flag
     is in there too: moving a card into the command zone changes how the deck
     plays more than swapping it would. */
  function lineupHash(cards) {
    const parts = (cards || [])
      .map((c) => `${String(c.name).toLowerCase()}|${Number(c.quantity || 1)}|${c.isCommander ? "C" : ""}`)
      .sort();
    let h1 = 0x811c9dc5, h2 = 0x01000193;
    const text = parts.join("\n");
    for (let i = 0; i < text.length; i += 1) {
      const code = text.charCodeAt(i);
      h1 = Math.imul(h1 ^ code, 16777619) >>> 0;
      h2 = Math.imul(h2 + code, 2246822519) >>> 0;
    }
    return (h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0"));
  }

  /**
   * Measure one hundred-card list.
   *
   * `onSeed(done, total, runningMean)` is called after each seed so a UI can
   * show the score converging instead of a spinner. A six-seed run is 3.5
   * seconds, which is long enough that a blank wait feels broken.
   */
  function measure(cards, options) {
    const opts = options || {};
    const config = opts.config || {};
    const seats = opts.seats || buildSeats(opts.opponents, config.table);
    const plan = opts.preview ? PREVIEW : FULL;
    const games = opts.games || plan.games;
    const seeds = seedsFor(opts.seedCount || plan.seeds);

    const runs = [];
    seeds.forEach((seed, index) => {
      const metrics = Engine.simulateGames(cards, seats, {
        ...config,
        games,
        scoreWeights: config.scoreWeights,
        powerWeights: config.scoreWeights,
        targets: config.targets,
        // sim/config.json's winRateBand belongs to the Pod Fun rung, which asks a
        // different question. This is a performance measurement, so the win-rate
        // term rises across the whole range.
        winRateBand: null
      }, seed).metrics;
      runs.push(metrics);
      if (typeof opts.onSeed === "function") {
        const mean = runs.reduce((sum, r) => sum + r.score, 0) / runs.length;
        opts.onSeed(index + 1, seeds.length, Number(mean.toFixed(2)));
      }
    });

    const mean = (pick) => runs.reduce((sum, run) => sum + pick(run), 0) / runs.length;
    const scores = runs.map((run) => run.score);
    const scoreMean = scores.reduce((sum, v) => sum + v, 0) / scores.length;
    const variance = scores.reduce((sum, v) => sum + (v - scoreMean) ** 2, 0) / Math.max(1, scores.length - 1);
    const round = (v, places) => Number(v.toFixed(places));

    return {
      score: round(scoreMean, 2),
      se: round(Math.sqrt(variance / scores.length), 3),
      winRate: round(mean((r) => r.winRate), 4),
      screwPct: round(mean((r) => r.screwPct), 4),
      floodPct: round(mean((r) => r.floodPct), 4),
      avgCommanderTurn: round(mean((r) => r.avgCommanderTurn), 2),
      commanderCastRate: round(mean((r) => r.commanderCastRate), 4),
      deadCardsAtT8: round(mean((r) => r.deadCardsAtT8), 2),
      avgWinTurn: round(mean((r) => r.avgWinTurn), 2),
      perSeedScores: scores.map((v) => round(v, 1)),
      // Stamped so a reader can tell a preview from a measurement without
      // having to know which button produced it.
      protocol: {seeds: seeds.length, gamesPerSeed: games, preview: Boolean(opts.preview)},
      hash: lineupHash(cards),
      measuredAt: new Date().toISOString()
    };
  }

  return {
    measure,
    hydrate,
    colorsOf,
    buildSeats,
    lineupHash,
    seedsFor,
    FULL,
    PREVIEW
  };
});
