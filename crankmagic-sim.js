/* The simulator, and the only place in CrankMagic that knows how to ask it anything.
 *
 * CrankMagic shipped with the simulator deliberately disconnected: crankmagic-evidence.js
 * says "Never loads the simulator", the model's `report` command records origin 'imported',
 * and the Deck Lab's last four steps sit behind a "Simulation on hold" pill. That was the
 * right call while the two halves lived on different branches. This module is the join.
 *
 * WHY A SEPARATE MODULE RATHER THAN CALLS FROM THE LAB. Three reasons, and they are the
 * reasons the review asked for:
 *
 *   1. A measurement that cannot be compared is worse than no measurement. The model
 *      already refuses to diff two reports whose protocol, versions or conditions differ
 *      (collection-evidence.js). That only works if something builds those three fields
 *      honestly and in one place. This is that place.
 *   2. The engine is 92 KB and runs 120,000 games. It has no business on the main thread
 *      and no business loading on a page that is only listing cards. It lives in a worker
 *      (sim-worker.js) that is spawned on demand and terminated to cancel.
 *   3. The pure half -- turning a deck into a lineup, judging what the engine can actually
 *      read, shaping the report -- is testable in Node without a browser or a worker, and
 *      tests/crankmagic-sim.mjs tests it there.
 *
 * WHAT THIS IS NOT. The engine models three opponents as sampled profiles with damage
 * curves and scheduled win turns -- not four real decks with hands, libraries and boards.
 * A number from here is a comparison between lists under one model, not a prediction of
 * how an evening will go. Every report says so in `limits`, and the Lab prints it.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CrankSim = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /* The engine generation these reports describe. Pinned by tests/crankmagic-sim.mjs
     against data/simulation-summary.json, so bumping the engine without bumping this --
     which would file new numbers under the old generation's name -- fails the suite. */
  const ENGINE_GENERATION = "v2.7";

  /* Loaded by the worker, in dependency order. sim-engine first because deck-measure
     throws without it; combat and pilot-policy before deck-measure because it resolves
     them lazily off the global. Versions must match the ?v= the pages use, or a browser
     that has one page cached serves the worker a different engine than the page. */
  const ENGINE_SCRIPTS = [
    "sim-engine.js?v=11",
    "combat.js?v=2",
    "pilot-policy.js?v=3",
    "deck-measure.js?v=9"
  ];

  /* NAMED PROTOCOLS, AND WHY THE NAME IS PART OF THE NUMBER.
   *
   * The review's sharpest procedural point: "give the corrected engine a new protocol
   * identifier and remeasure comparable lists. Never mix the lens/header values or
   * silently reinterpret old scores." So a protocol is not a settings bag the caller
   * fills in -- it is a named, closed set, and its name goes in the report. Two reports
   * with different names will not diff, which is the model refusing on the reader's
   * behalf rather than a warning nobody reads.
   *
   * `published` is the protocol every number in data/deck-ratings.json was made on. A
   * deck measured here under that name is comparable with those. `preview` is not, and
   * is named so that it cannot be mistaken for them. */
  const PROTOCOLS = {
    published: {
      id: "published-" + ENGINE_GENERATION + "-6x20000",
      label: "Published protocol",
      seedCount: 6,
      games: 20000,
      note: "Six seeds of 20,000 games — the protocol behind every published rating."
    },
    preview: {
      id: "preview-" + ENGINE_GENERATION + "-1x2000",
      label: "Quick preview",
      seedCount: 1,
      games: 2000,
      note: "One seed of 2,000 games. Fast enough to iterate on, too small to publish."
    },
    /* THE SEARCH TIER, and why one seed could not be it. A one-seed run has a standard
       error of exactly zero -- there is nothing to take a variance over -- so the Deck
       Lab's refinement pass was accepting any swap that gained a quarter of a point
       against a measurement whose real spread is two or three. Every "kept" swap was a
       coin flip wearing a number. Three seeds give the run an error it can be judged
       against, 4,000 games each keeps a trial under half a second, and the name says --
       as loudly as `preview` does -- that it is not comparable with a published rating. */
    refine: {
      id: "refine-" + ENGINE_GENERATION + "-3x4000",
      label: "Refinement pass",
      seedCount: 3,
      games: 4000,
      note: "Three seeds of 4,000 games. Enough spread to have a real standard error, small enough to run dozens of times inside a search."
    }
  };

  function protocolFor(name) {
    const plan = PROTOCOLS[name];
    if (!plan) throw new Error('Unknown protocol "' + name + '" — it is published or preview');
    return plan;
  }

  /* ------------------------------------------------------------------ the lineup */

  /* A CrankMagic deck into the hundred entries the engine reads.
   *
   * Only `main` slots. `upgrade` and `bracket` slots are options the reader has not taken
   * -- measuring them would score a deck nobody owns and nobody is playing. The commander
   * is flagged rather than assumed to be first, because the engine's opening procedure
   * treats it differently and a mis-flagged commander is a silently wrong measurement. */
  function lineupFor(state, deck) {
    if (!state || !deck) throw new Error("A deck is required.");
    const commanders = new Set(deck.commanders || []);
    return (deck.slots || [])
      .filter((slot) => slot.purpose === "main")
      .map((slot) => {
        const card = state.cards[slot.cardId];
        if (!card) throw new Error("Resolve every card identity before measuring.");
        return {
          name: card.name,
          quantity: Number(slot.quantity || 1),
          isCommander: commanders.has(card.id),
          /* deck-measure's hydrate() reads `entry.card` when no facts table is supplied,
             and CrankMagic's catalog rows already carry the printed body, mana cost,
             oracle text, keywords and colour identity it wants. So the catalog IS the
             facts table; there is no second copy to drift. */
          card: card
        };
      });
  }

  /* WHAT THE ENGINE CAN ACTUALLY READ, counted rather than assumed.
   *
   * The review: "Each run carries a support report... An unsupported win condition or
   * removal interaction prevents an overall outcome claim... Unknown is never silently
   * treated as weak." This is the cheap, honest half of that: a card with no type line
   * and no oracle text is not a weak card, it is a card the engine cannot see, and a
   * hundred of them measures nothing. measureLens already throws below half; a published
   * score deserves a harder floor than a lens does.
   *
   * It is not the full support report the review describes -- that needs ability-level
   * coverage, not field presence -- and `blind` is named so nobody mistakes it for one. */
  function coverage(lineup) {
    const rows = lineup || [];
    const total = rows.reduce((n, row) => n + Number(row.quantity || 1), 0);
    const unreadable = rows.filter((row) => {
      const card = row.card || {};
      return !card.typeLine || (!card.oracleText && !/\bLand\b/.test(card.typeLine));
    });
    const known = total - unreadable.reduce((n, row) => n + Number(row.quantity || 1), 0);
    return {
      total,
      known,
      ratio: total ? Number((known / total).toFixed(4)) : 0,
      unreadable: unreadable.map((row) => row.name).sort(),
      blind: true
    };
  }

  const PUBLISHABLE_COVERAGE = 0.95;

  /* Refuse rather than print. A score built on cards the engine could not read is not a
     worse score, it is a different deck's score. */
  function assertMeasurable(cover, protocolName) {
    if (!cover.total) throw new Error("This deck has no cards to measure.");
    if (cover.ratio >= PUBLISHABLE_COVERAGE) return cover;
    if (protocolName === "preview" && cover.ratio >= 0.5) return cover;
    throw new Error(
      "The engine can read " + cover.known + " of " + cover.total + " cards. " +
      "Resolve these before measuring: " + cover.unreadable.slice(0, 6).join(", ") +
      (cover.unreadable.length > 6 ? " and " + (cover.unreadable.length - 6) + " more" : "")
    );
  }

  /* ------------------------------------------------------------------ the report */

  /* The engine's result into the evidence pack collection-evidence.js validates and
     collection-model.js stores. Everything the reader would need to decide whether two of
     these can be subtracted goes in `versions` and `conditions`, because that is exactly
     what compare() checks and it checks them by deep equality. */
  function packFor(result, options) {
    const opts = options || {};
    const plan = protocolFor(opts.protocol || "published");
    const cover = opts.coverage || {};
    const pct = (v) => (v == null ? null : Number((v * 100).toFixed(2)));
    return {
      kind: "report",
      /* Exact-list provenance. The engine already hashes the hundred; reusing its hash
         means a report and a rung that claim the same list can be checked, not trusted. */
      deckFingerprint: result.hash,
      protocol: plan.id,
      versions: {
        engine: ENGINE_GENERATION,
        pilot: opts.pilot || "balanced",
        combat: opts.combat || "estimate",
        cards: opts.cardsVersion || "unknown"
      },
      conditions: {
        table: opts.table || "",
        seats: opts.seatCount || 0,
        seedCount: plan.seedCount,
        gamesPerSeed: plan.games,
        firstSeed: opts.firstSeed || 0
      },
      metrics: {
        score: {value: result.score, unit: "points"},
        scoreStandardError: {value: result.se, unit: "points"},
        winRate: {value: pct(result.winRate), unit: "%"},
        /* Reported beside the win rate, never folded into it. A game the turn cap ended
           is not a loss, and a reader comparing a slow deck with a fast one should be
           able to see how much of the gap is the cutoff. */
        incompleteGames: {value: pct(result.incompleteRate), unit: "%"},
        averageWinTurn: {value: result.avgWinTurn, unit: "turns"},
        commanderCastRate: {value: pct(result.commanderCastRate), unit: "%"},
        averageCommanderTurn: {value: result.avgCommanderTurn, unit: "turns"},
        manaScrew: {value: pct(result.screwPct), unit: "%"},
        manaFlood: {value: pct(result.floodPct), unit: "%"},
        deadCardsAtTurnEight: {value: result.deadCardsAtT8, unit: "cards"},
        podExperience: {value: result.funScore, unit: "index"},
        /* The three figures Pod experience is made of, published beside the index rather
           than folded into it: how many turns the other seats spent unable to act, how
           many of them were still in the game at the end, and when the first one went
           out. An index nobody can decompose is a number nobody can argue with. */
        idleTurnsForOthers: {value: result.avgIdleTurns ?? null, unit: "turns"},
        seatsStillPlayingAtTheEnd: {value: result.avgSurvivingSeats ?? null, unit: "seats"},
        firstEliminationTurn: {value: result.avgFirstElimination ?? null, unit: "turns"},
        answerInHand: {value: pct(result.interactionAvailability), unit: "% of turns"},
        /* How much a game actually happened, and the most that happened in one turn. A
           storm deck lives on the second figure and nothing reported it. */
        spellsCastPerGame: {value: result.avgSpellsPerGame ?? null, unit: "spells"},
        biggestTurn: {value: result.avgStormPeak ?? null, unit: "spells"},
        /* THE HONEST LIMIT OF THE NUMBER ABOVE IT. Counted since v2.7 and shown to
           nobody: cards whose text is "you win the game", whose condition is the part
           this engine does not model. A deck built on one is not a weak deck, it is a
           deck this measurement does not describe -- and a reader who cannot see the
           difference will read the score as the former. */
        winPathsTheEngineCannotWatch: {value: result.unwatchedWinPaths ?? 0, unit: "cards"},
        cardsTheEngineCouldRead: {value: cover.known ?? null, unit: "cards"}
      },
      unwatchedWinCards: result.unwatchedWinCards || [],
      /* WHY THE GAMES WERE LOST, not just how many. Counted by the engine on every run
         and thrown away until now. */
      lossCauses: result.lossCauses || [],
      scoreParts: result.scoreParts || [],
      perCard: result.perCard || [],
      perSeedScores: result.perSeedScores || [],
      run: {
        games: result.games,
        elapsedMs: result.elapsedMs,
        gamesPerSecond: result.gamesPerSecond,
        measuredAt: result.measuredAt
      },
      /* Carried in the report rather than printed once in the UI, because the report is
         what gets exported, re-imported and read a month later with no screen around it. */
      limits: [
        "Three opponents are sampled archetype profiles with damage curves and scheduled win turns — not four real decks with hands, libraries and boards.",
        "There is no stack, no priority and no real blocking unless board combat was enabled; attacks use modelled connection rates.",
        "No recorded human games back this number. It compares lists under one model; it does not predict a real evening.",
        "Turn-capped games are reported separately as incompleteGames and are still counted in the win-rate denominator."
      ].concat(result.unwatchedWinPaths
        ? [`This list carries ${result.unwatchedWinPaths} card${result.unwatchedWinPaths === 1 ? "" : "s"} that simply say "you win the game"${(result.unwatchedWinCards || []).length ? " (" + (result.unwatchedWinCards || []).join(", ") + ")" : ""}. The engine reads the card but not the condition attached to it, so whatever this deck really does to win is not in the score above — it is scored as the creatures and spells around that card.`]
        : []),
      coverage: cover,
      origin: "measured"
    };
  }

  /* ------------------------------------------------------------------ running it */

  /* The worker, spawned on demand. Kept in a closure rather than created per run so a
     second measurement does not pay to parse 92 KB of engine again; killed on cancel,
     because measure() loops its seeds synchronously and there is no other way in. */
  function createRunner(options) {
    const opts = options || {};
    const workerUrl = opts.workerUrl || "sim-worker.js?v=1";
    const WorkerCtor = opts.Worker || (typeof Worker !== "undefined" ? Worker : null);
    let worker = null;
    let ticket = 0;
    let live = null;

    function spawn() {
      if (worker) return worker;
      if (!WorkerCtor) throw new Error("This browser cannot run background workers, so the simulator is unavailable here.");
      worker = new WorkerCtor(workerUrl);
      worker.onmessage = (event) => {
        const message = event.data || {};
        if (!live || message.id !== live.id) return;
        if (message.type === "progress" && live.onProgress) live.onProgress(message);
        if (message.type === "done") { const done = live; live = null; done.resolve(message.result); }
        if (message.type === "error") { const done = live; live = null; done.reject(new Error(message.message)); }
      };
      worker.onerror = (event) => {
        const done = live;
        live = null;
        stop();
        if (done) done.reject(new Error(event.message || "The simulator failed to start."));
      };
      return worker;
    }

    function stop() {
      if (worker) worker.terminate();
      worker = null;
    }

    function measure(request) {
      if (live) throw new Error("A measurement is already running.");
      const plan = protocolFor(request.protocol || "published");
      const id = (ticket += 1);
      const target = spawn();
      return new Promise((resolve, reject) => {
        live = {id, resolve, reject, onProgress: request.onProgress};
        target.postMessage({
          id,
          type: "measure",
          scripts: ENGINE_SCRIPTS,
          lineup: request.lineup,
          config: request.config,
          seats: request.seats,
          opponents: request.opponents,
          table: request.table,
          seedCount: plan.seedCount,
          games: plan.games
        });
      });
    }

    function cancel() {
      const done = live;
      live = null;
      stop();
      if (done) done.reject(new Error("Measurement cancelled."));
    }

    return {measure, cancel, stop, get busy() { return Boolean(live); }};
  }

  return {
    ENGINE_GENERATION,
    ENGINE_SCRIPTS,
    PROTOCOLS,
    PUBLISHABLE_COVERAGE,
    protocolFor,
    lineupFor,
    coverage,
    assertMeasurable,
    packFor,
    createRunner
  };
});
