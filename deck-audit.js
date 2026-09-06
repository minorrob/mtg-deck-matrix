/* Whether the number on the screen still describes the deck on the screen.
 *
 * THE PROBLEM. Every score in this app was measured by a Node sweep and
 * committed. The Deck page lets you change any of the hundred slots. Nothing
 * connected the two, so a deck could be twelve cards from the hundred that was
 * measured and still show that hundred's score as if it were its own.
 *
 * TWO KINDS OF OUT OF SYNC, AND THEY ARE NOT THE SAME.
 *
 *   the deck moved   the selection no longer composes any measured rung. The
 *                    published number describes a different hundred. This is the
 *                    common case and it is what the badge is for.
 *
 *   the engine moved a re-measurement here runs a different engine and a
 *                    different protocol from the v2.4 sweep the published rung
 *                    scores came from. So a number measured here is NOT
 *                    comparable with a published one, and putting them side by
 *                    side as a delta would be the most confident-looking wrong
 *                    answer this app could give.
 *
 * WHICH IS WHY A RE-RUN MEASURES TWO HUNDREDS. Measuring the edited deck alone
 * produces a number with nothing to compare it against. So a re-run measures the
 * edited hundred AND the pinned rung it departed from, here, on the same engine
 * and the same six-seed protocol. The difference between those two is real,
 * because everything except the cards is held constant. The published figure is
 * still shown, labelled with the engine that produced it, and never subtracted
 * from anything.
 */
(function (root, factory) {
  "use strict";
  const measure = (typeof module === "object" && module.exports && typeof require === "function")
    ? require("./deck-measure.js")
    : root && root.MtgDeckMeasure;
  const api = factory(measure);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.MtgDeckAudit = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Measure) {
  "use strict";

  if (!Measure) throw new Error("The deck audit needs deck-measure.js");

  /* The literal hundred, as the simulator wants it.
     `entries` are lineup-model items: {name, quantity, ...}. The card facts come
     from the page's own catalog, keyed by normalized name, because that is what
     the Deck page already holds -- no second fetch for cards it has. */
  function lineupOf(entries, cards, normalize, commanderName) {
    const key = normalize || ((n) => String(n || "").toLowerCase());
    const commander = commanderName ? key(commanderName) : null;
    return (entries || []).map((item) => {
      const fact = (cards || {})[key(item.name)] || {};
      return {
        name: item.name,
        quantity: Math.max(1, Number(item.quantity || 1)),
        isCommander: commander != null && key(item.name) === commander,
        card: {
          typeLine: fact.typeLine || item.typeLine || "",
          manaCost: fact.manaCost || item.manaCost || "",
          oracleText: fact.oracleText || item.oracleText || "",
          keywords: fact.keywords || [],
          colorIdentity: fact.colorIdentity || item.colorIdentity || [],
          price: Number(fact.price != null ? fact.price : (item.price || 0)),
          gameChanger: Boolean(fact.gameChanger || item.gameChanger)
        }
      };
    });
  }

  const hashOf = (lineup) => Measure.lineupHash(lineup);

  /**
   * What to say about the score above a deck.
   *
   * `rung` is what the selection currently composes, or null when it composes
   * none. `stored` is the last re-run for this deck, if there is one.
   */
  function status(options) {
    const opts = options || {};
    const hash = opts.hash;
    const rung = opts.rung || null;
    const stored = opts.stored || null;
    const published = opts.published || null;

    const measured = stored && stored.hash === hash ? stored : null;
    const stale = Boolean(stored && stored.hash !== hash);

    if (measured) {
      return {
        state: "measured",
        rung, published, measured, stale: false,
        // A re-run is the answer to "what is this deck worth", so once there is
        // one the badge stops nagging and starts reporting.
        headline: `${measured.current.score.toFixed(2)} measured here`,
        note: measured.baseline
          ? `${signed(measured.current.score - measured.baseline.score)} against ${
              labelOf(measured.baselineRung, opts.rungLabels)} measured the same way`
          : "no baseline was measured alongside it"
      };
    }
    if (rung) {
      return {
        state: "matched", rung, published, measured: null, stale,
        headline: published
          ? `${Number(published.score).toFixed(1)} ${labelOf(rung, opts.rungLabels)}`
          : `${labelOf(rung, opts.rungLabels)}, not published`,
        note: stale
          ? "the last re-run was measured on a different hundred"
          : (published
            ? `published by the ${published.engine || "sweep"} run over ${
                Number(published.games || 0).toLocaleString()} games`
            : "no published score for this rung")
      };
    }
    return {
      state: "adrift", rung: null, published, measured: null, stale,
      headline: "Out of sync",
      note: "this hundred is not one of the measured rungs, so no published score describes it"
    };
  }

  const signed = (n) => (n >= 0 ? "+" : "") + n.toFixed(2);
  const labelOf = (rung, labels) => (labels && labels[rung]) || rung || "the recommendation";

  /**
   * Measure the deck as it stands, and the rung it departed from, the same way.
   *
   * `baseline` is optional: with no rung to fall back on -- a deck built out of
   * manual picks from the start -- there is nothing honest to compare against,
   * and the result says so rather than inventing one.
   */
  function rerun(current, baseline, options) {
    const opts = options || {};
    const run = (cards) => Measure.measure(Measure.hydrate(cards, opts.facts || null), {
      config: opts.config, seats: opts.seats, onSeed: opts.onSeed
    });
    const out = {
      hash: hashOf(current),
      current: run(current),
      baseline: null,
      baselineRung: opts.baselineRung || null,
      measuredAt: new Date().toISOString()
    };
    if (baseline && baseline.length) out.baseline = run(baseline);
    return out;
  }

  /* ---------------- the workbook ---------------- */

  const SHEET_COLUMNS = [
    {key: "n", label: "#", width: 5},
    {key: "name", label: "Card", width: 34},
    {key: "quantity", label: "Qty", width: 5},
    {key: "type", label: "Type", width: 22},
    {key: "cost", label: "Mana", width: 12},
    {key: "mv", label: "MV", width: 5},
    {key: "color", label: "Color", width: 8},
    {key: "rung", label: "Rung", width: 10},
    {key: "where", label: "Where", width: 18},
    {key: "unit", label: "Unit $", width: 9},
    {key: "line", label: "Line $", width: 9},
    {key: "why", label: "Why it is here", width: 60}
  ];

  const SUMMARY_COLUMNS = [
    {key: "deck", label: "Deck", width: 26},
    {key: "commander", label: "Commander", width: 26},
    {key: "rung", label: "Rung", width: 12},
    {key: "cards", label: "Cards", width: 7},
    {key: "lands", label: "Lands", width: 7},
    {key: "avgMv", label: "Avg MV", width: 8},
    {key: "inBox", label: "In box", width: 8},
    {key: "toBuy", label: "To buy", width: 8},
    {key: "toBuyCost", label: "To buy $", width: 10},
    {key: "score", label: "Score", width: 9},
    {key: "scoreSource", label: "Score from", width: 30}
  ];

  /**
   * One workbook, one sheet per deck, with a summary sheet in front.
   *
   * The summary comes first because a workbook of six hundred-row sheets opens
   * on whichever sheet is first and that should be the overview, not deck one.
   */
  function workbook(decks, meta) {
    const sheets = [{
      name: "Summary",
      columns: SUMMARY_COLUMNS,
      rows: (decks || []).map((deck) => ({
        deck: deck.title,
        commander: deck.commander || "",
        rung: deck.rungLabel || "mixed",
        cards: deck.cards.reduce((n, c) => n + (Number(c.quantity) || 1), 0),
        lands: deck.cards.filter((c) => /\bLand\b/.test(c.type || "")).reduce((n, c) => n + (Number(c.quantity) || 1), 0),
        avgMv: round2(avgMv(deck.cards)),
        inBox: deck.cards.filter((c) => c.inBox).reduce((n, c) => n + (Number(c.quantity) || 1), 0),
        toBuy: deck.cards.filter((c) => c.toBuy).reduce((n, c) => n + (Number(c.quantity) || 1), 0),
        toBuyCost: round2(deck.cards.filter((c) => c.toBuy)
          .reduce((n, c) => n + (Number(c.line) || 0), 0)),
        score: deck.score == null ? "" : Number(deck.score),
        scoreSource: deck.scoreSource || ""
      }))
    }];

    (decks || []).forEach((deck) => {
      sheets.push({
        name: deck.title,
        columns: SHEET_COLUMNS,
        rows: deck.cards.map((card, index) => ({
          n: index + 1,
          name: card.name,
          quantity: Number(card.quantity) || 1,
          type: card.type || "",
          cost: card.manaCost || "",
          mv: card.mv == null ? "" : Number(card.mv),
          color: card.color || "",
          rung: card.rung || "",
          where: card.where || "",
          unit: card.unit == null ? "" : round2(card.unit),
          line: card.line == null ? "" : round2(card.line),
          why: card.why || ""
        }))
      });
    });

    return {
      sheets,
      filename: `decks-${(meta && meta.date) || new Date().toISOString().slice(0, 10)}.xlsx`
    };
  }

  function avgMv(cards) {
    let n = 0;
    let sum = 0;
    (cards || []).forEach((c) => {
      if (/\bLand\b/.test(c.type || "")) return;
      const q = Number(c.quantity) || 1;
      n += q;
      sum += (Number(c.mv) || 0) * q;
    });
    return n ? sum / n : 0;
  }

  const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

  return {
    lineupOf, hashOf, status, rerun, workbook, avgMv,
    SHEET_COLUMNS, SUMMARY_COLUMNS
  };
});
