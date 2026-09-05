/* Copilot findings the graph cannot see.
 *
 * The lenses in data/lenses.json are queries over the graph: what a deck is short
 * of, what you own that nothing uses, what the field plays that you do not have.
 * All true, all structural, and none of them can answer the question a simulation
 * answers -- whether a change makes the deck play better.
 *
 * This reads data/deck-ratings.json, where every rung of every deck was measured
 * at six seeds by 20,000 games with a standard error attached, and turns the
 * differences into advice. The most valuable thing in that file is the negative
 * delta: an upgrade path somebody was about to buy that measures WORSE than the
 * deck they already have. Nothing else in this app was in a position to say so.
 *
 * TWO RULES THIS FILE KEEPS.
 *
 * 1. NO INVENTED THRESHOLDS. "Flooding above 15% is bad" is a number nobody
 *    measured. Every comparison here is either against the file's own
 *    significance flag -- which is the measured standard error, not a guess -- or
 *    against the median of the same six decks measured the same way. A deck is
 *    only flagged as an outlier when it is BOTH the worst of the set AND a
 *    stated distance from the median, and the figures are always shown so the
 *    reader can disagree.
 *
 * 2. A FINDING THAT IS NOT SIGNIFICANT IS STILL A FINDING. "You could spend $60
 *    here and the simulation cannot tell the difference" is advice, and it is
 *    advice the reader would otherwise have to work out by comparing two numbers
 *    that look different and are not.
 */
(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.MtgSimLenses = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const money = (n) => "$" + Number(n || 0).toFixed(2);
  const pct = (n) => (Number(n || 0) * 100).toFixed(1) + "%";
  const signed = (n) => (n >= 0 ? "+" : "") + Number(n).toFixed(2);
  const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

  function median(values) {
    const sorted = values.slice().sort((a, b) => a - b);
    if (!sorted.length) return 0;
    const mid = sorted.length / 2;
    return sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  /* The rung a delta is measured between, in the words the app uses for them.
     deck-ratings names them v1/tuned/b3; the reader sees the build they are
     looking at, so the label has to be the one on the button. */
  const RUNG_NAME = {v1: "the deck as it stands", tuned: "the Tuned build", b3: "the B3 upgrades"};
  // "the B3 upgrades measure" and "the Tuned build measures" are both correct and
  // one rule cannot produce both, so each rung carries its own verb.
  const RUNG_VERB = {v1: "measures", tuned: "measures", b3: "measure"};

  /* THE CHAIN, NOT EVERY PAIR. deck-ratings also carries v1ToB3, which is the sum
     of these two and would report the same money twice -- once as "the Tuned
     build is worth +1.24" and again inside "the B3 upgrades are worth +1.22".
     Reporting each STEP once is the only way the numbers add up on screen. */
  const DELTA_PAIRS = [
    {key: "v1ToTuned", from: "v1", to: "tuned"},
    {key: "tunedToB3", from: "tuned", to: "b3"}
  ];

  /* What the upgrade costs, out of the Master's own swap list. A recommendation
     to spend money that does not say how much is not a recommendation. */
  function upgradeCost(master, deckId, rung) {
    const deck = ((master && master.decks) || []).find((d) => d.id === deckId);
    if (!deck) return null;
    const rows = rung === "b3" ? (deck.b3 || []) : (deck.upgrades || []);
    if (!rows.length) return null;
    const cost = rows.reduce((n, r) => n + (Number(r.price) || 0), 0);
    return {cards: rows.length, cost, names: rows.map((r) => r.add).filter(Boolean)};
  }

  /**
   * Build the lenses.
   *
   * `ratings` is data/deck-ratings.json; `master` is data/master-v2.json and is
   * optional -- without it the advice is the same, minus the prices.
   */
  function build(ratings, options) {
    const opts = options || {};
    const master = opts.master || null;
    const decks = (ratings && ratings.decks) || [];
    if (!decks.length) return [];
    const lenses = [];

    /* ---------------- 1. an upgrade that measures worse ---------------- */

    decks.forEach((deck) => {
      DELTA_PAIRS.forEach((pair) => {
        const delta = (deck.delta || {})[pair.key];
        if (!delta || !delta.significant || delta.score >= 0) return;
        const spend = upgradeCost(master, deck.id, pair.to);
        lenses.push({
          id: `sim-worse-${deck.id}-${pair.to}`.toLowerCase(),
          kind: "warning",
          source: "simulation",
          title: `${deck.label}: ${RUNG_NAME[pair.to]} ${RUNG_VERB[pair.to]} ${
            Math.abs(delta.score).toFixed(2)} points worse`,
          why: `${signed(delta.score)} against ${RUNG_NAME[pair.from]}, and the gap is larger than the ` +
            `measurement error, so it is a real drop rather than noise.` +
            (spend ? ` The ${spend.cards} cards would cost about ${money(spend.cost)}.` : ""),
          evidence: `six seeds x 20,000 games per build; se ${
            (deck.builds[pair.to] || {}).se != null ? deck.builds[pair.to].se : "?"}`,
          impact: {score: delta.score, dollars: spend ? -round2(spend.cost) : 0},
          count: spend ? spend.cards : 0,
          action: spend
            ? {verb: "hold", label: `Do not buy these ${spend.cards} yet`}
            : {verb: "hold", label: "Leave this path alone"},
          filter: {deck: deck.label, names: spend ? spend.names : []}
        });
      });
    });

    /* ---------------- 2. an upgrade that pays ---------------- */

    decks.forEach((deck) => {
      DELTA_PAIRS.forEach((pair) => {
        const delta = (deck.delta || {})[pair.key];
        if (!delta || !delta.significant || delta.score <= 0) return;
        const spend = upgradeCost(master, deck.id, pair.to);
        const per = spend && spend.cost > 0 ? delta.score / spend.cost * 100 : null;
        lenses.push({
          id: `sim-pays-${deck.id}-${pair.to}`.toLowerCase(),
          kind: "opportunity",
          source: "simulation",
          title: `${deck.label}: ${RUNG_NAME[pair.to]} ${RUNG_VERB[pair.to]} ${signed(delta.score)}`,
          why: (spend
            ? `${spend.cards} cards, about ${money(spend.cost)}` +
              (per ? `, or ${per.toFixed(2)} points per $100 spent.` : ".")
            : "Measured against " + RUNG_NAME[pair.from] + ".") +
            ` The gain is larger than the measurement error.`,
          evidence: `six seeds x 20,000 games per build; se ${
            (deck.builds[pair.to] || {}).se != null ? deck.builds[pair.to].se : "?"}`,
          impact: {score: delta.score, dollars: spend ? round2(spend.cost) : 0},
          count: spend ? spend.cards : 0,
          action: spend
            ? {verb: "buy", label: `Buy these ${spend.cards}`}
            : {verb: "apply", label: "Switch to this build"},
          filter: {deck: deck.label, names: spend ? spend.names : []}
        });
      });
    });

    /* ---------------- 3. money that buys nothing measurable ---------------- */

    decks.forEach((deck) => {
      const delta = (deck.delta || {}).tunedToB3;
      if (!delta || delta.significant) return;
      const spend = upgradeCost(master, deck.id, "b3");
      // Only worth saying when there is real money on the other side of it.
      if (!spend || spend.cost < 20) return;
      lenses.push({
        id: `sim-flat-${deck.id}-b3`.toLowerCase(),
        kind: "attention",
        source: "simulation",
        title: `${deck.label}: ${money(spend.cost)} of upgrades the simulation cannot separate`,
        why: `${spend.cards} cards move the score by ${signed(delta.score)}, which is inside the ` +
          `measurement error. They may still be worth buying for how they feel to play — ` +
          `the simulation is not measuring that — but not for the number.`,
        evidence: "six seeds x 20,000 games per build; the difference is smaller than the standard error",
        impact: {score: 0, dollars: round2(spend.cost)},
        count: spend.cards,
        action: {verb: "hold", label: "Spend this somewhere else first"},
        filter: {deck: deck.label, names: spend.names}
      });
    });

    /* ---------------- 4. one deck standing apart from the rest ---------------- */

    /* Every threshold here is the median of the same six decks, measured the same
       way, and a deck has to be both the worst of the set and the stated distance
       from that median. No absolute number is asserted, because none was measured. */
    const METRICS = [
      {key: "screwPct", worst: "high", gap: 0.25, unit: pct,
       title: (d, v) => `${d.label} is mana screwed in ${pct(v)} of games`,
       why: (d, v, m) => `Against a median of ${pct(m)} across your six. ` +
         `${d.builds.v1.lands} lands and an average cost of ${d.builds.v1.avgMv}.`},
      {key: "floodPct", worst: "high", gap: 0.25, unit: pct,
       title: (d, v) => `${d.label} floods in ${pct(v)} of games`,
       why: (d, v, m) => `Against a median of ${pct(m)}. ${d.builds.v1.lands} lands.`},
      {key: "deadCardsAtT8", worst: "high", gap: 0.5, unit: (n) => Number(n).toFixed(2),
       title: (d, v) => `${d.label} still holds ${Number(v).toFixed(2)} uncastable cards on turn 8`,
       why: (d, v, m) => `Against a median of ${Number(m).toFixed(2)}. Cards it drew and could not use.`},
      {key: "avgCommanderTurn", worst: "high", gap: 0.15, unit: (n) => "turn " + n,
       title: (d, v) => `${d.label} lands its commander on turn ${v}`,
       why: (d, v, m) => `Against a median of turn ${m}. Cast in ${
         pct(d.builds.v1.commanderCastRate)} of games.`},
      {key: "commanderCastRate", worst: "low", gap: 0.02, unit: pct,
       title: (d, v) => `${d.label} fails to cast its commander in ${pct(1 - v)} of games`,
       why: (d, v, m) => `Cast in ${pct(v)} against a median of ${pct(m)}.`}
    ];

    METRICS.forEach((metric) => {
      const values = decks.map((d) => Number((d.builds.v1 || {})[metric.key]));
      if (values.some((v) => !Number.isFinite(v))) return;
      const mid = median(values);
      if (!mid) return;
      const worstValue = metric.worst === "high" ? Math.max(...values) : Math.min(...values);
      const deck = decks[values.indexOf(worstValue)];
      const away = metric.worst === "high" ? (worstValue - mid) / mid : (mid - worstValue) / mid;
      if (away < metric.gap) return;
      lenses.push({
        id: `sim-outlier-${deck.id}-${metric.key}`.toLowerCase(),
        kind: "attention",
        source: "simulation",
        title: metric.title(deck, worstValue),
        why: metric.why(deck, worstValue, mid),
        evidence: `worst of your ${decks.length}, and ${(away * 100).toFixed(0)}% from their median; ` +
          "six seeds x 20,000 games",
        impact: {score: 0, dollars: 0},
        count: 0,
        action: {verb: "look", label: "Show this deck"},
        filter: {deck: deck.label, names: []}
      });
    });

    return rank(lenses);
  }

  /* Ordered by what is at stake rather than by kind, because a five-point drop
     and a note about mana screw are not the same size of thing. Score points
     first: they are what the reader came for. Money breaks the tie, because
     between two findings worth the same, the expensive one is the one to read. */
  function rank(lenses) {
    return lenses.slice().sort((a, b) => {
      const weight = (l) => Math.abs((l.impact || {}).score || 0);
      const cash = (l) => Math.abs((l.impact || {}).dollars || 0);
      return (weight(b) - weight(a)) || (cash(b) - cash(a)) || a.title.localeCompare(b.title);
    });
  }

  /**
   * Resolve a lens's filter to card ids against the graph's card list.
   *
   * A sim lens is about a deck, not about a set of card ids -- the ratings file
   * has no ids in it. `names` narrows to the cards an upgrade would add;
   * with none, the lens shows the whole deck.
   */
  function resolve(lens, cards, normalize) {
    const key = normalize || ((n) => String(n || "").toLowerCase().trim());
    const filter = lens.filter || {};
    const wanted = new Set((filter.names || []).map(key));
    const deck = filter.deck ? String(filter.deck) : null;
    const ids = [];
    (cards || []).forEach((card) => {
      if (wanted.size) { if (wanted.has(key(card.name))) ids.push(card.id); return; }
      if (!deck) return;
      if ((card.decks || []).some((d) => d.deck === deck && (d.target > 0 || d.actual > 0))) {
        ids.push(card.id);
      }
    });
    return ids;
  }

  return {build, resolve, rank, median, upgradeCost, RUNG_NAME, DELTA_PAIRS};
});
