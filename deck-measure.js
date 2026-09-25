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

  /* pilot-policy.js is needed only by measureLens below, so it is resolved
     lazily and never required for an ordinary measurement. */
  let policyModule;
  function Pilot() {
    if (policyModule !== undefined) return policyModule;
    policyModule = null;
    try {
      if (typeof module === "object" && module.exports && typeof require === "function") policyModule = require("./pilot-policy.js");
      else if (typeof globalThis !== "undefined" && globalThis.MtgPilotPolicy) policyModule = globalThis.MtgPilotPolicy;
    } catch (error) { policyModule = null; }
    return policyModule;
  }

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
        /* THE PRINTED BODY. Without these the engine falls through to estimating a
           creature as max(1, round(cmc * 0.9)) -- a one-mana 2/1 played as a 1/1, a
           seven-mana 4/4 as a 6/6 -- in a simulation whose whole business is combat. The
           fields were absent from every card file until tools/add-power-toughness.mjs put
           them there; passing them through is what makes them count. */
        power: fact.power,
        toughness: fact.toughness,
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
    const cardRuns = [];
    const startedAt = Date.now();
    seeds.forEach((seed, index) => {
      const run = Engine.simulateGames(cards, seats, {
        ...config,
        games,
        scoreWeights: config.scoreWeights,
        powerWeights: config.scoreWeights,
        targets: config.targets,
        // sim/config.json's winRateBand belongs to the Pod Fun rung, which asks a
        // different question. This is a performance measurement, so the win-rate
        // term rises across the whole range.
        winRateBand: null
      }, seed);
      runs.push(run.metrics);
      cardRuns.push(run.perCardStats);
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

    /* HOW THE NUMBER WAS MADE, averaged over the seeds the same way the score is. The
       engine computes these on every run and they used to be thrown away at this line,
       which is why the app could print "51.33" and nothing else. */
    const partsBySeed = runs.map((run) => run.scoreParts || []);
    const scoreParts = (partsBySeed[0] || []).map((part, index) => {
      const across = (pick) => partsBySeed.reduce((sum, list) => sum + pick(list[index] || part), 0) / partsBySeed.length;
      return {
        key: part.key, label: part.label, weight: part.weight,
        norm: round(across((p) => p.norm), 3),
        points: round(across((p) => p.points), 2),
        max: round(part.max, 2),
        lost: round(across((p) => p.lost), 2),
        // The words come from the last seed rather than being averaged: they quote raw
        // measurements, and a sentence stitched from six means would be a sentence nobody
        // measured. The numbers beside them are the averages.
        reads: (partsBySeed[partsBySeed.length - 1][index] || part).reads
      };
    }).sort((a, b) => b.lost - a.lost);

    /* WHICH CARDS CARRIED IT AND WHICH SAT IN HAND. The engine has counted this all along
       -- drawn, cast, the turn it landed, whether the game was won when it was cast -- and
       nothing has ever shown it. Averaged across seeds, one row per card. */
    const cardIndex = new Map();
    cardRuns.forEach((list) => (list || []).forEach((stat) => {
      const row = cardIndex.get(stat.name) || {name: stat.name, n: 0,
        isLand: Boolean(stat.isLand), isCommander: Boolean(stat.isCommander),
        drawnRate: 0, castRate: 0, avgCastTurn: 0, deadRate: 0, winRateWhenCast: 0, stuckRate: 0};
      row.n += 1;
      row.drawnRate += stat.drawnRate;
      row.castRate += stat.castRate;
      row.avgCastTurn += stat.avgCastTurn;
      row.deadRate += stat.deadRate;
      row.winRateWhenCast += stat.winRateWhenCast;
      row.stuckRate += stat.stuckRate || 0;
      cardIndex.set(stat.name, row);
    }));
    const perCard = Array.from(cardIndex.values()).map((row) => ({
      name: row.name,
      isLand: row.isLand,
      isCommander: row.isCommander,
      drawnRate: round(row.drawnRate / row.n, 4),
      castRate: round(row.castRate / row.n, 4),
      avgCastTurn: round(row.avgCastTurn / row.n, 2),
      deadRate: round(row.deadRate / row.n, 4),
      winRateWhenCast: round(row.winRateWhenCast / row.n, 4),
      /* Drawn, and still uncastable in hand on turn eight. The one per-card figure in this
         model that separates one nonland from another -- see sim-engine's note where it is
         counted. deadRate is exactly 1 - castRate and always was, so it ranks nothing. */
      stuckRate: round(row.stuckRate / row.n, 4)
    }));

    const elapsedMs = Date.now() - startedAt;
    const totalGames = games * seeds.length;

    return {
      score: round(scoreMean, 2),
      se: round(Math.sqrt(variance / scores.length), 3),
      scoreParts,
      perCard,
      /* SO THE CLAIM CAN BE CHECKED. "Six seeds, 20,000 games each" is a claim about work
         done, and a claim about work done that carries no timing is one the reader has to
         take on faith. They should not have to. */
      elapsedMs,
      games: totalGames,
      gamesPerSecond: Math.round(totalGames / Math.max(0.001, elapsedMs / 1000)),
      winRate: round(mean((r) => r.winRate), 4),
      screwPct: round(mean((r) => r.screwPct), 4),
      floodPct: round(mean((r) => r.floodPct), 4),
      /* Games the turn cap ended rather than anybody winning. Carried through from the
         engine because a reader comparing a slow deck with a fast one needs to see how
         much of the gap is the cutoff -- winRate is wins/games, and a censored game sits
         in that denominator looking exactly like a loss. */
      incompleteRate: round(mean((r) => r.incompleteRate || 0), 4),
      avgCommanderTurn: round(mean((r) => r.avgCommanderTurn), 2),
      commanderCastRate: round(mean((r) => r.commanderCastRate), 4),
      deadCardsAtT8: round(mean((r) => r.deadCardsAtT8), 2),
      avgWinTurn: round(mean((r) => r.avgWinTurn), 2),
      /* The two experience metrics, averaged like everything else. The engine computes
         them on every run; publishing a rung's Pod Fun figure without them meant carrying
         the previous run's number forward beside a score that had moved. */
      funScore: round(mean((r) => r.funScore || 0), 4),
      podFunScore: round(mean((r) => r.podFunScore || 0), 4),
      perSeedScores: scores.map((v) => round(v, 1)),
      /* WHAT KILLED YOU, which is the only figure in the engine that answers "why did I
         lose" rather than "how often". Counted on every run since the engine was written
         and dropped at this line ever since -- so a reader could see 11% and not that
         nine tenths of the other 89% was one seat's combo landing on turn nine. Summed
         across seeds, then divided by the games behind them, so it reads as a share of
         all games rather than of one seed's. */
      lossCauses: (() => {
        const total = {};
        runs.forEach((run) => Object.entries(run.lossCauses || {}).forEach(([cause, n]) => { total[cause] = (total[cause] || 0) + n; }));
        const played = Math.max(1, games * seeds.length);
        return Object.entries(total).sort((a, b) => b[1] - a[1])
          .map(([cause, n]) => ({cause, games: n, rate: round(n / played, 4)}));
      })(),
      /* The other three the engine keeps about the TABLE rather than about this seat.
         Pod experience is already published as one index; these are what it is made of. */
      avgIdleTurns: round(mean((r) => r.avgIdleTurns || 0), 2),
      avgSurvivingSeats: round(mean((r) => r.avgSurvivingSeats || 0), 2),
      avgFirstElimination: round(mean((r) => r.avgFirstElimination || 0), 2),
      interactionAvailability: round(mean((r) => r.interactionAvailability || 0), 4),
      // Stamped so a reader can tell a preview from a measurement without
      // having to know which button produced it.
      protocol: {seeds: seeds.length, gamesPerSeed: games, preview: Boolean(opts.preview)},
      hash: lineupHash(cards),
      measuredAt: new Date().toISOString()
    };
  }

  /* THE LENS. The published protocol asks one question -- how good is this
     hundred -- and answers it with one pilot. This asks the other one: how much
     of that number is the deck, and how much is the person holding it?
   *
   * Runs the same cards under the casual and the competitive policy on the same
   * seeds, then runs the competitive line again once per named decision with that
   * decision handed back to the casual pilot. Each of those says what one decision
   * was worth ON THIS DECK, which is what turns "it scores twelve more played to
   * win" into "attacking whoever is closest to winning is ten of those points".
   *
   * COST. Two policies plus n ablations is 2 + n full measurements. The defaults
   * -- three seeds of 20,000, and the two decisions that mattered most across the
   * shipped six -- are four runs of 60,000 games. Deliberately shorter than the
   * published six-seed protocol: this measures a difference between two runs, and
   * a difference converges faster than either of its halves.
   *
   * NOT COMPARABLE WITH THE HEADLINE. Both policies are measured on the honest
   * interaction rule -- an answer counts only when the mana to cast it was
   * genuinely left over -- where the published score counts an answer you could
   * have held up whether or not you did. That is worth about ten points to every
   * deck, so these two numbers sit below the headline and belong beside each
   * other, not beside it. */
  const LENS_PLAN = {seeds: 3, games: 20000, ablations: ["target", "hold"]};

  function measureLens(cards, options) {
    const opts = options || {};
    const Policy = Pilot();
    if (!Policy) throw new Error("The pilot lens requires pilot-policy.js to be loaded");
    const config = opts.config || {};
    const seats = opts.seats || buildSeats(opts.opponents, config.table);
    const seedCount = opts.seedCount || LENS_PLAN.seeds;
    const games = opts.games || LENS_PLAN.games;
    const wanted = opts.ablations === undefined ? LENS_PLAN.ablations : opts.ablations;

    /* A HUNDRED CARDS WITH NO TEXT MEASURES SOMETHING, AND IT IS NOT THIS DECK.
       hydrate() takes a facts table; hand it an empty one and every card comes back
       with no type line, no mana cost and no oracle text, which the engine reads as a
       hundred free spells that are not lands. It does not error. It returns a number
       -- the same number for every deck, under every pilot -- and a panel will print
       it. That shipped for exactly one browser run, because card-facts.json is fetched
       lazily and this code read the variable before anything had asked for it. */
    const known = cards.filter((card) => card && card.typeLine).length;
    if (cards.length && known * 2 < cards.length) {
      throw new Error(`Only ${known} of ${cards.length} cards have printed text — the card facts have not loaded, so there is nothing to read`);
    }
    const startedAt = Date.now();

    const jobs = [
      {key: "casual", policy: Policy.CASUAL},
      {key: "competitive", policy: Policy.COMPETITIVE},
      ...wanted.map((key) => ({key: `without:${key}`, ablation: key, policy: Policy.without(key)}))
    ];
    const runs = {};
    jobs.forEach((job, index) => {
      if (typeof opts.onRun === "function") opts.onRun(index, jobs.length, job.policy.label);
      runs[job.key] = measure(cards, {...opts, config: {...config, policy: job.policy}, seats, seedCount, games});
    });

    const casual = runs.casual;
    const competitive = runs.competitive;
    /* What one decision was worth: the competitive score minus the same line with
       that decision reverted. Positive means the competitive answer earned points
       on this deck; negative means this deck would rather you did it the other way,
       which is a finding and not an error. */
    const credits = wanted.map((key) => ({
      key,
      points: Number((competitive.score - runs[`without:${key}`].score).toFixed(2)),
      score: runs[`without:${key}`].score
    }));

    const gap = Number((competitive.score - casual.score).toFixed(2));
    /* Is the gap bigger than the two measurements' own disagreement? Each run
       reports the standard error of its per-seed scores; the difference of two
       independent means carries the root of the sum of their squares. */
    const noise = Number(Math.sqrt((casual.se || 0) ** 2 + (competitive.se || 0) ** 2).toFixed(3));

    return {
      casual,
      competitive,
      credits,
      gap,
      noise,
      decisive: Math.abs(gap) > Math.max(2 * noise, Policy.MEANINGFUL),
      advice: Policy.advise(casual, competitive, {credits, deckName: opts.deckName}),
      elapsedMs: Date.now() - startedAt,
      games: games * seedCount * jobs.length,
      protocol: {seeds: seedCount, gamesPerSeed: games, runs: jobs.length, ablations: wanted},
      hash: lineupHash(cards),
      measuredAt: new Date().toISOString()
    };
  }

  return {
    measure,
    measureLens,
    LENS_PLAN,
    hydrate,
    colorsOf,
    buildSeats,
    lineupHash,
    seedsFor,
    FULL,
    PREVIEW
  };
});
