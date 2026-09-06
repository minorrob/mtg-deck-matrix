/* What the games actually taught you.
 *
 * The Game Log has been write-only since it was built: it records a game, it
 * exports for the repo, and nothing ever reads it back. Meanwhile the simulator
 * publishes a win rate for every deck. Those two numbers are the most interesting
 * pair in this app and they had never been put side by side.
 *
 * THE HARD PART IS NOT THE ARITHMETIC, IT IS NOT OVERCLAIMING.
 *
 * A Commander night is four or five games. Winning one of twelve with a deck the
 * simulator rates at 54% is NOT evidence the simulator is wrong -- twelve games
 * is barely evidence of anything. The temptation is to print "8% actual vs 54%
 * predicted" in large type, which is a confident-looking lie, and the whole
 * reason this file computes a confidence interval rather than a percentage.
 *
 * Every claim here is gated on a Wilson score interval. If the interval contains
 * the predicted rate, the honest answer is "these agree, or the sample is too
 * small to tell" -- and that is what it says. Only a rate whose interval clears
 * the prediction entirely is reported as a difference.
 *
 * AND THREE THINGS THE LOG CANNOT SEPARATE. When observed and predicted really do
 * diverge, the cause is one of:
 *
 *   the deck    the list plays worse than the model thinks
 *   the pilot   the deck is fine and the lines are being missed
 *   the pod     the simulator measures against a modelled table, not against
 *               the four people you actually sit with
 *
 * Nothing in the log distinguishes them, so nothing here claims to. The finding
 * is "these disagree, and here are the three reasons that could be" -- which is
 * a useful thing to be told, and a much smaller claim than "your deck is bad".
 */
(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.MtgGameRecord = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  // 95%. Two-sided. The one constant in here that is a convention rather than a
  // measurement, and it is the conventional one.
  const Z = 1.959963985;

  /**
   * Wilson score interval for a proportion.
   *
   * Not the normal approximation: at n = 12 and x = 1 the normal interval runs
   * below zero, which is not a win rate. Wilson stays inside [0, 1] at every
   * sample size and is the standard answer for exactly this shape of question.
   */
  function wilson(wins, games, z) {
    const n = Number(games) || 0;
    if (n <= 0) return {low: 0, high: 1, point: null, n: 0};
    const zz = (z || Z);
    const p = Math.max(0, Math.min(1, Number(wins) / n));
    const denom = 1 + (zz * zz) / n;
    const centre = (p + (zz * zz) / (2 * n)) / denom;
    const half = (zz / denom) * Math.sqrt((p * (1 - p)) / n + (zz * zz) / (4 * n * n));
    return {
      low: Math.max(0, centre - half),
      high: Math.min(1, centre + half),
      point: p,
      n
    };
  }

  const mean = (values) => {
    const nums = values.filter((v) => typeof v === "number" && Number.isFinite(v));
    return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
  };

  const round = (v, places) => (v == null ? null : Number(v.toFixed(places)));

  /**
   * Fold the log into one row per deck.
   *
   * A draw is neither a win nor a loss, and is left out of the win-rate
   * denominator rather than counted as half -- a Commander draw is almost always
   * a time-out, which is not half a win by any reading.
   */
  function summarize(entries, options) {
    const opts = options || {};
    const byDeck = new Map();
    (entries || []).forEach((entry) => {
      if (!entry || !entry.variantId) return;
      const id = entry.variantId;
      const row = byDeck.get(id) || {
        id, games: 0, wins: 0, losses: 0, draws: 0,
        turns: [], knockouts: [], eliminatedTurn: [], podFun: [], myFun: [],
        first: entry.playedOn || null, last: entry.playedOn || null
      };
      row.games += 1;
      if (entry.result === "win") row.wins += 1;
      else if (entry.result === "loss") row.losses += 1;
      else row.draws += 1;
      if (typeof entry.turns === "number") row.turns.push(entry.turns);
      if (typeof entry.knockouts === "number") row.knockouts.push(entry.knockouts);
      if (typeof entry.eliminatedTurn === "number") row.eliminatedTurn.push(entry.eliminatedTurn);
      if (entry.podFun) row.podFun.push(Number(entry.podFun));
      if (entry.myFun) row.myFun.push(Number(entry.myFun));
      if (entry.playedOn) {
        if (!row.first || entry.playedOn < row.first) row.first = entry.playedOn;
        if (!row.last || entry.playedOn > row.last) row.last = entry.playedOn;
      }
      byDeck.set(id, row);
    });

    const decks = [...byDeck.values()].map((row) => {
      const decided = row.wins + row.losses;
      const interval = wilson(row.wins, decided);
      return {
        id: row.id,
        label: (opts.labels && opts.labels[row.id]) || row.id,
        games: row.games,
        wins: row.wins,
        losses: row.losses,
        draws: row.draws,
        decided,
        winRate: decided ? row.wins / decided : null,
        interval,
        avgTurns: round(mean(row.turns), 1),
        avgKnockouts: round(mean(row.knockouts), 2),
        avgEliminatedTurn: round(mean(row.eliminatedTurn), 1),
        podFun: round(mean(row.podFun), 2),
        myFun: round(mean(row.myFun), 2),
        first: row.first,
        last: row.last
      };
    });

    decks.sort((a, b) => b.games - a.games || a.label.localeCompare(b.label));
    const totalDecided = decks.reduce((n, d) => n + d.decided, 0);
    const totalWins = decks.reduce((n, d) => n + d.wins, 0);
    return {
      decks,
      totals: {
        games: decks.reduce((n, d) => n + d.games, 0),
        decks: decks.length,
        wins: totalWins,
        decided: totalDecided,
        winRate: totalDecided ? totalWins / totalDecided : null,
        interval: wilson(totalWins, totalDecided),
        podFun: round(mean(decks.map((d) => d.podFun)), 2),
        myFun: round(mean(decks.map((d) => d.myFun)), 2)
      }
    };
  }

  /* How many decided games it would take before an interval could clear a given
     prediction, at the observed rate. Answering "come back after N more" is far
     more useful than "not enough data", because it says how much more. */
  function gamesNeeded(rate, predicted, cap) {
    const limit = cap || 400;
    if (rate == null || predicted == null) return null;
    for (let n = 2; n <= limit; n += 1) {
      const wins = Math.round(rate * n);
      const band = wilson(wins, n);
      if (band.low > predicted || band.high < predicted) return n;
    }
    return null;
  }

  /* How many more decided games somebody could actually play. A year of weekly
     Commander is around two hundred; sixty is a season, and past that "come back
     after N games" stops being advice and becomes arithmetic. */
  const PRACTICAL = 60;

  const VERDICT = {
    agree: "agree",
    below: "below",
    above: "above",
    unknown: "unknown"
  };

  /**
   * One deck's record against what the simulation predicted.
   *
   * `predicted` is a win rate in 0..1, or null when the deck has no published
   * figure. The verdict is deliberately conservative: anything the interval
   * cannot separate comes back as "agree", never as a number to argue with.
   */
  function compare(deck, predicted) {
    if (!deck || predicted == null || !deck.decided) {
      return {verdict: VERDICT.unknown, deck, predicted, need: null};
    }
    const band = deck.interval;
    let verdict = VERDICT.agree;
    if (band.high < predicted) verdict = VERDICT.below;
    else if (band.low > predicted) verdict = VERDICT.above;
    return {
      verdict,
      deck,
      predicted,
      observed: deck.winRate,
      interval: band,
      // Only meaningful while they still agree: how many decided games at this
      // rate before the interval would clear the prediction either way.
      need: verdict === VERDICT.agree ? gamesNeeded(deck.winRate, predicted) : null,
      // Whether that number is advice or arithmetic. 318 more games is true and
      // useless; PRACTICAL is about a year of weekly Commander, which is the
      // most anybody could act on.
      reachable: verdict === VERDICT.agree
        ? Boolean(gamesNeeded(deck.winRate, predicted)) &&
          gamesNeeded(deck.winRate, predicted) - deck.decided <= PRACTICAL
        : false
    };
  }

  const pct = (v) => (v == null ? "—" : (v * 100).toFixed(0) + "%");

  /**
   * The sentence to put on screen.
   *
   * Written here rather than in the view because the wording IS the claim: an
   * interval that contains the prediction has to read as "cannot tell them
   * apart", and it is too easy for a template to turn that into a difference.
   */
  function phrase(result) {
    const d = result.deck;
    if (result.verdict === VERDICT.unknown) {
      return d && d.games
        ? `${d.games} game${d.games === 1 ? "" : "s"} logged, and no published win rate to hold them against.`
        : "No games logged for this deck yet.";
    }
    const seen = `${d.wins} of ${d.decided}`;
    const band = `${pct(result.interval.low)}–${pct(result.interval.high)}`;
    if (result.verdict === VERDICT.agree) {
      const more = result.reachable
        ? ` About ${result.need - d.decided} more decided games at this rate would separate them.`
        // Either the two rates are within a few points of each other, or the gap
        // needs more games than anybody will play. Both are the same advice:
        // stop waiting for the log to settle it.
        : ` They are close enough that no season's worth of games would settle it.`;
      return `Won ${seen}. At this many games the true rate could be anywhere from ` +
        `${band}, which includes the simulation's ${pct(result.predicted)} — so they agree, ` +
        `or there are too few games to tell.${more}`;
    }
    const dir = result.verdict === VERDICT.below ? "below" : "above";
    return `Won ${seen}. Even allowing for the sample, the true rate is ${band}, which is ` +
      `entirely ${dir} the simulation's ${pct(result.predicted)}. That is a real gap — though ` +
      `the log cannot say whether it is the deck, the way it is being piloted, or a pod the ` +
      `simulation was never measured against.`;
  }

  /* Which deck the table enjoys most, against which one wins most.
     This is the question the app exists for and the only place both numbers are
     in the same object. Reported only where both are actually recorded. */
  function funVersusWinning(summary, minGames) {
    const floor = minGames || 3;
    const rated = (summary.decks || []).filter((d) => d.podFun != null && d.decided >= floor);
    if (rated.length < 2) return null;
    const byFun = rated.slice().sort((a, b) => b.podFun - a.podFun);
    const byWin = rated.slice().sort((a, b) => (b.winRate || 0) - (a.winRate || 0));
    if (byFun[0].id === byWin[0].id) {
      return {agree: true, deck: byFun[0],
        note: `${byFun[0].label} both wins most and is the table's favorite.`};
    }
    return {
      agree: false, funniest: byFun[0], winningest: byWin[0],
      note: `The table rates ${byFun[0].label} highest at ${byFun[0].podFun}/5, ` +
        `while ${byWin[0].label} wins most at ${pct(byWin[0].winRate)}.`
    };
  }

  /* The headline figure for a deck, which is not always the win rate.
     One win in one game is a 100% win rate and means nothing, and printing it in
     large type is the whole failure mode this module was written against. Below
     a handful of decided games the range IS the honest headline. */
  const SHOW_POINT_FROM = 5;

  function headline(deck) {
    if (!deck || !deck.decided) return {text: "—", provisional: true};
    if (deck.decided < SHOW_POINT_FROM) {
      return {text: `${pct(deck.interval.low)}–${pct(deck.interval.high)}`, provisional: true};
    }
    return {text: pct(deck.winRate), provisional: false};
  }

  return {summarize, compare, phrase, wilson, gamesNeeded, funVersusWinning, headline,
          pct, VERDICT, Z, PRACTICAL, SHOW_POINT_FROM};
});
