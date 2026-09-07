/**
 * "51.33" is not an answer. This is what the app says instead.
 *
 * THE COMPLAINT, VERBATIM: "what does 51.33 mean? Is that a percentage? What was the
 * deck's performance against the different measures? Can I get a better readout? Could I
 * see which cards are underperforming / carrying the deck?" Every one of those questions
 * had an answer inside the engine already and no way out of it. simulateGames has counted
 * per-card draws, casts and wins since it was written; compositeScore has always summed
 * nine weighted parts and returned only the sum. Both were thrown away one function above
 * the screen.
 *
 * So this module renders what was always there:
 *
 *   THE NUMBER, said plainly. Out of 100, not a percentage, and the win rate quoted beside
 *   it so the two are never confused again.
 *
 *   THE RECEIPT. Games, seeds, elapsed milliseconds and games per second. A claim about
 *   120,000 games that carries no timing is a claim the reader has to take on faith, and
 *   "I don't believe that" is the correct response to being asked to. Now it can be
 *   checked: if the rate is impossible, the number is wrong, and that is worth knowing.
 *
 *   WHERE THE POINTS WENT. Nine parts, sorted by what each one COST rather than by what it
 *   scored, because the reader is looking for the problem. Each carries the raw measurement
 *   in words -- "mana screwed in 5.8% of games, against a 10% target" -- so the row is an
 *   explanation and not a second number to interpret.
 *
 *   WHICH CARDS CARRIED IT AND WHICH SAT IN HAND. Win rate when cast, how often a draw
 *   became a cast, and the turn it landed. Basics are excluded: "Plains was drawn a lot"
 *   is not a finding.
 *
 *   WHAT CHANGED. A re-run is measured against the run before it and the difference is
 *   shown BEFORE anything is overwritten, part by part, because "it went up by three" is
 *   the only way to tell whether a swap worked.
 *
 * PURE. Strings in, strings out, no DOM and no globals. tests/measure-report.mjs.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.MtgMeasureReport = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  var BASIC = /^(Plains|Island|Swamp|Mountain|Forest|Wastes|Snow-Covered (Plains|Island|Swamp|Mountain|Forest))$/;

  /* How often a card has to turn up before its numbers mean anything. Set at a twentieth
     of games: over the published protocol's 120,000 that is six thousand draws, which is
     plenty, and it is low enough to survive a deck that does not dig. The first cut was
     a fifth of games, which sounds cautious and emptied the list on five of the six
     shipped decks -- a singleton in a hundred cards is seen in about a fifth of games, so
     the threshold sat exactly where the data does and half of it fell the wrong side. */
  var MIN_DRAWN = 0.05;

  function pct(value, places) {
    return (Number(value || 0) * 100).toFixed(places == null ? 1 : places) + "%";
  }

  /* Elapsed time in the unit a person would use for it. Milliseconds under a second,
     because "0.8 s" hides the difference between 800ms and 1.4s and that difference is
     the whole reason this line exists. */
  function took(ms) {
    var n = Number(ms || 0);
    if (!n) return "";
    if (n < 1000) return n + " ms";
    return (n / 1000).toFixed(n < 10000 ? 1 : 0) + " s";
  }

  function count(n) { return Number(n || 0).toLocaleString("en-US"); }

  /**
   * The receipt: what was actually run, and how fast. Returns "" for a measurement taken
   * before this was recorded, rather than inventing a timing for it.
   */
  function receipt(m) {
    if (!m || !m.protocol) return "";
    var seeds = m.protocol.seeds, per = m.protocol.gamesPerSeed;
    var games = m.games || seeds * per;
    var line = count(games) + " games — " + seeds + (seeds === 1 ? " seed" : " independent seeds")
      + " of " + count(per) + " each";
    if (m.elapsedMs) {
      line += " — in " + took(m.elapsedMs);
      if (m.gamesPerSecond) line += " (" + count(m.gamesPerSecond) + " a second)";
    }
    return line;
  }

  /* The parts, ready to draw: sorted by what each cost, with the bar width already worked
     out. Sorted on `lost` because somebody reading this is looking for the problem, and
     the problem is the row with the biggest gap between got and available. */
  function parts(m) {
    return ((m && m.scoreParts) || []).slice()
      .sort(function (a, b) { return b.lost - a.lost || b.max - a.max; })
      .map(function (part) {
        return {
          key: part.key, label: part.label, reads: part.reads,
          points: part.points, max: part.max, lost: part.lost,
          fill: part.max > 0 ? Math.max(0, Math.min(100, (part.points / part.max) * 100)) : 0
        };
      });
  }

  /* Cards worth naming: seen in at least a fifth of games, and not a land. A card drawn
     twice in 20,000 games has a win rate that means nothing -- and a LAND is cast the turn
     it is drawn, every time, so it tops any list ranked on "how often a draw became a
     cast" while telling the reader only that their deck contains lands. The first version
     of this panel opened with Vault of the Archangel, Orzhov Basilica and Isolated Chapel
     as the cards that carried the deck, which is true and useless.

     `isLand` comes off the engine's own classification; the name pattern is the fallback
     for a measurement taken before the engine carried it. */
  function played(m, minDrawn) {
    return ((m && m.perCard) || []).filter(function (card) {
      return card && card.name && !card.isLand && !BASIC.test(card.name)
        && card.drawnRate >= (minDrawn == null ? MIN_DRAWN : minDrawn);
    });
  }

  function carries(m, limit) {
    return played(m).slice()
      .sort(function (a, b) { return b.winRateWhenCast - a.winRateWhenCast || b.castRate - a.castRate; })
      .slice(0, limit || 5);
  }

  /* What drags: a card that keeps turning up and keeps not being castable. deadRate is the
     share of draws where it was still stuck in hand at turn eight. */
  function drags(m, limit) {
    return played(m).slice()
      .sort(function (a, b) { return b.deadRate - a.deadRate || a.castRate - b.castRate; })
      .filter(function (card) { return card.deadRate > 0.05; })
      .slice(0, limit || 5);
  }

  function cardLine(card) {
    return "cast on " + pct(card.castRate, 0) + " of draws"
      + (card.avgCastTurn ? ", turn " + card.avgCastTurn.toFixed(1) : "")
      + " — won " + pct(card.winRateWhenCast) + " of the games it was cast in";
  }

  /**
   * The whole readout as HTML. `options.compact` drops the card lists, for the review
   * screen where the reader has not saved the deck yet.
   */
  function html(m, options) {
    if (!m) return "";
    var opts = options || {};
    var rows = parts(m);
    var top = carries(m), bad = drags(m);
    var preview = m.protocol && m.protocol.preview;

    var out = '<div class="mr">';
    out += '<div class="mr-head">'
      + '<div class="mr-score"><b>' + esc(m.score.toFixed(2)) + '</b><span>out of 100</span></div>'
      + '<div class="mr-said">'
      + '<p class="mr-what">' + (preview ? "A quick preview" : "Measured")
      + ' — a composite of how the deck actually played, not a percentage. '
      + 'It won <b>' + pct(m.winRate) + '</b> of its games'
      + (m.se ? ', and the six runs agreed to within &plusmn;' + esc(m.se) : "") + '.</p>'
      + '<p class="mr-receipt">' + esc(receipt(m)) + '</p>'
      + (m.perSeedScores && m.perSeedScores.length > 1
        ? '<p class="mr-seeds">Run by run: ' + m.perSeedScores.map(function (s) { return esc(s); }).join(" · ") + '</p>'
        : "")
      + '</div></div>';

    if (rows.length) {
      out += '<h4 class="mr-h">Where the points went</h4><ul class="mr-parts">';
      rows.forEach(function (part) {
        out += '<li class="mr-part">'
          + '<div class="mr-part-top"><b>' + esc(part.label) + '</b>'
          + '<span>' + esc(part.points.toFixed(1)) + ' of ' + esc(part.max.toFixed(0)) + '</span></div>'
          + '<div class="mr-bar"><i class="' + (part.fill < 50 ? "is-low" : "") + '" style="width:'
          + part.fill.toFixed(1) + '%"></i></div>'
          + '<p class="mr-why">' + esc(part.reads) + '</p></li>';
      });
      out += '</ul>';
    }

    if (!opts.compact && (top.length || bad.length)) {
      out += '<div class="mr-cards">';
      if (top.length) {
        out += '<div><h4 class="mr-h">Cards that carried it</h4><ul class="mr-cardlist">'
          + top.map(function (card) {
            return '<li><b>' + esc(card.name) + '</b><span>' + esc(cardLine(card)) + '</span></li>';
          }).join("") + '</ul></div>';
      }
      if (bad.length) {
        out += '<div><h4 class="mr-h">Cards that sat in your hand</h4><ul class="mr-cardlist">'
          + bad.map(function (card) {
            return '<li><b>' + esc(card.name) + '</b><span>stuck in hand on '
              + esc(pct(card.deadRate, 0)) + ' of the draws it appeared on — ' + esc(cardLine(card))
              + '</span></li>';
          }).join("") + '</ul></div>';
      }
      out += '</div>';
    }

    out += '<p class="mr-limit">The simulation plays creatures, mana and combat. It cannot '
      + 'see a storm count, a ritual chain or a one-card combo, so a deck that wins that '
      + 'way scores low here for a reason about the model rather than about the deck.</p>';
    return out + '</div>';
  }

  /**
   * Two runs, side by side. Returns {score, delta, parts:[{label, before, after, delta}],
   * better, worse} -- the shape a "keep it or throw it away" screen needs.
   */
  function compare(after, before) {
    if (!after || !before) return null;
    var byKey = Object.create(null);
    ((before.scoreParts) || []).forEach(function (part) { byKey[part.key] = part; });
    var rows = ((after.scoreParts) || []).map(function (part) {
      var was = byKey[part.key];
      return {
        key: part.key, label: part.label, max: part.max,
        before: was ? was.points : null,
        after: part.points,
        delta: was ? Math.round((part.points - was.points) * 100) / 100 : null,
        reads: part.reads
      };
    }).sort(function (a, b) { return Math.abs(b.delta || 0) - Math.abs(a.delta || 0); });
    var delta = Math.round((after.score - before.score) * 100) / 100;
    /* Whether the move is real or noise. Two measurements each carry a standard error;
       the difference carries both. Under that, the honest word is "the same". */
    var noise = Math.sqrt(Math.pow(Number(after.se) || 0, 2) + Math.pow(Number(before.se) || 0, 2)) * 1.96;
    return {
      before: before.score, after: after.score, delta: delta,
      noise: Math.round(noise * 100) / 100,
      real: Math.abs(delta) > noise,
      parts: rows,
      better: rows.filter(function (r) { return (r.delta || 0) > 0.05; }),
      worse: rows.filter(function (r) { return (r.delta || 0) < -0.05; })
    };
  }

  function compareHtml(diff) {
    if (!diff) return "";
    var sign = function (v) { return (v > 0 ? "+" : "") + v.toFixed(2); };
    var verdict = !diff.real
      ? "The same deck, as far as this many games can tell — the change is inside the noise (&plusmn;"
        + esc(diff.noise.toFixed(2)) + ")."
      : diff.delta > 0
        ? "Better by " + esc(diff.delta.toFixed(2)) + " points, which is outside the noise."
        : "Worse by " + esc(Math.abs(diff.delta).toFixed(2)) + " points, which is outside the noise.";
    var out = '<div class="mr-diff">'
      + '<div class="mr-diff-head"><span class="mr-was">' + esc(diff.before.toFixed(2)) + '</span>'
      + '<span class="mr-arrow">&rarr;</span>'
      + '<span class="mr-now' + (diff.delta > 0 ? " is-up" : (diff.delta < 0 ? " is-down" : "")) + '">'
      + esc(diff.after.toFixed(2)) + '</span>'
      + '<span class="mr-delta">' + esc(sign(diff.delta)) + '</span></div>'
      + '<p class="mr-verdict">' + verdict + '</p>';
    var moved = diff.parts.filter(function (r) { return Math.abs(r.delta || 0) > 0.05; });
    if (moved.length) {
      out += '<ul class="mr-diff-parts">' + moved.map(function (row) {
        return '<li class="' + (row.delta > 0 ? "is-up" : "is-down") + '">'
          + '<b>' + esc(row.label) + '</b>'
          + '<span>' + esc(row.before.toFixed(1)) + ' &rarr; ' + esc(row.after.toFixed(1))
          + ' (' + esc(sign(row.delta)) + ')</span></li>';
      }).join("") + '</ul>';
    } else {
      out += '<p class="mr-verdict">No single measure moved by more than a tenth of a point.</p>';
    }
    return out + '</div>';
  }

  return {
    html: html, compare: compare, compareHtml: compareHtml,
    receipt: receipt, parts: parts, carries: carries, drags: drags,
    took: took, esc: esc
  };
});
