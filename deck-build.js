/* From a generated deck to a deck this app owns.
 *
 * deck-generator.js has been in this repo since the Choose tab existed and has
 * been dead code since that tab was retired. It is good code -- it queries
 * Scryfall by role, fills quotas, builds a swap ladder and repairs anything the
 * Tier 3 rules reject -- and it produced a shape nothing downstream now speaks:
 * a *variant*, in the vocabulary of the 50-variant catalog, with key references
 * and a swap ladder and a profile full of pre-rendered HTML.
 *
 * Everything the app does with a deck today -- My Decks, the graph, Copilot,
 * inventory, shopping, the simulator -- goes through the flat record that
 * deck-store.js defines. An import produces one. A generated deck must produce
 * the same one, or it is a second class of deck with a second set of bugs.
 *
 * That is this file's whole job: take what the generator built, pick one rung
 * off its ladder, and hand back exactly what Store.toRecord accepts. Nothing
 * else in the app needs to know a deck was generated rather than pasted.
 *
 * THREE RUNGS, NOT THREE DECKS. The generator builds a ladder -- cheapest
 * legal, tuned inside a budget, then price-blind. Saving all three would put
 * three near-identical decks in My Decks, which is not what a ladder is for:
 * you play one and buy toward the next. So one rung is chosen and saved, and
 * the other two are described with their prices so the choice is informed.
 *
 * WHAT IT REFUSES. A rung that is not a hundred cards with a commander does not
 * become a record. The generator's repair pass makes this rare, but "rare" is
 * not "never", and a 97-card deck that silently became a saved deck would be
 * discovered weeks later on a Shop list that is missing three cards.
 */
(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.MtgDeckBuild = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /* The generator's stages, named for what they mean to somebody spending money
     rather than for the optimizer pass that produced them. The order matches
     `built.stages` and must not be reordered without changing that. */
  const RUNGS = [
    {
      key: "base", index: 0, label: "Cheapest legal",
      blurb: "The whole deck at the lowest price that still plays the theme."
    },
    {
      key: "tuned", index: 1, label: "Tuned",
      blurb: "The upgrades that fit inside the budget you set. This is the one to build."
    },
    {
      key: "max", index: 2, label: "No budget",
      blurb: "What the same shell becomes when price stops being a constraint."
    }
  ];

  const RUNG_BY_KEY = {};
  RUNGS.forEach((rung) => { RUNG_BY_KEY[rung.key] = rung; });

  const DECK_SIZE = 100;

  const qtyOf = (entry) => Math.max(1, Number((entry && entry.quantity) || 1));

  /* What a rung costs, at the prices Scryfall quoted when it was generated.
     Unpriced cards contribute nothing and are counted separately, because a
     total that silently treats six unknown prices as $0 is a total that will
     be wrong at the register. */
  function spendOf(entries) {
    let total = 0;
    let unpriced = 0;
    (entries || []).forEach((entry) => {
      const card = (entry && entry.card) || {};
      const price = Number(card.price || 0);
      if (price > 0) total += price * qtyOf(entry);
      else if (!card.isBasicLand) unpriced += qtyOf(entry);
    });
    return {total: Math.round(total * 100) / 100, unpriced};
  }

  const countOf = (entries) => (entries || []).reduce((n, entry) => n + qtyOf(entry), 0);

  /* The rung a stage index names, tolerating either form. Callers hold a key in
     the UI and an index in the generator's arrays, and getting the two mixed up
     silently saves the wrong deck. */
  function rungAt(which) {
    if (typeof which === "number") return RUNGS[which] || null;
    return RUNG_BY_KEY[String(which || "")] || null;
  }

  /* Everything that would stop this rung becoming a deck. Same contract as
     Store.problems: a list of sentences, empty when there is nothing wrong. */
  function problems(built, which) {
    const rung = rungAt(which);
    const found = [];
    if (!built || !built.stages) return ["Nothing was generated."];
    if (!rung) return ["No such rung."];
    const entries = built.stages[rung.index];
    if (!entries || !entries.length) return [`The ${rung.label} build came back empty.`];

    const total = countOf(entries);
    if (total !== DECK_SIZE) {
      found.push(`${rung.label} came out at ${total} cards, not ${DECK_SIZE}.`);
    }
    if (!entries.some((entry) => entry.isCommander || (entry.card && entry.card.isCommander))) {
      found.push("No card in this build is marked as the commander.");
    }
    // The generator repairs Tier 3 violations, and reports what it could not
    // repair. A deck that is still illegal is worth saying so about before it
    // is saved, not after it is built and sleeved.
    const check = built.compliance && built.compliance[rung.index];
    (check && check.tier3 ? check.tier3 : []).forEach((issue) => {
      found.push(typeof issue === "string" ? issue : (issue.message || issue.rule || "Bracket 3 rule broken."));
    });
    return found;
  }

  const measurable = (built, which) => problems(built, which).length === 0;

  /* Scryfall reports an unknown price as 0. deck-sources.js already learned
     that a $40 card printed as $0.00 is worse than one printed as a dash, and
     the same rule has to hold here or a generated deck's Shop list will quietly
     under-quote itself. */
  const priceOf = (card) => {
    const usd = Number((card && card.price) || 0);
    return usd > 0 ? usd : null;
  };

  /**
   * One rung of a generated ladder, in the shape Store.toRecord accepts.
   *
   * The `card` on each row is the normalized Scryfall record the generator
   * already fetched, so nothing here needs the network -- which matters,
   * because generation has just spent its network budget on the pool.
   */
  function toResolved(built, which, meta) {
    const options = meta || {};
    const rung = rungAt(which);
    if (!built || !rung) return null;
    const entries = built.stages[rung.index] || [];
    const variant = built.variant || {};

    const cards = entries.map((entry) => {
      const card = entry.card || {};
      return {
        name: card.name,
        quantity: qtyOf(entry),
        isCommander: Boolean(entry.isCommander || card.isCommander),
        card: Object.assign({}, card, {price: priceOf(card)}),
        // Why the generator put this card in. Carried through so the deck can
        // still explain itself after it has been saved -- an imported deck has
        // no such reason to carry, and a generated one does.
        role: entry.role || ""
      };
    });
    const commander = cards.filter((row) => row.isCommander).map((row) => row.name);

    return {
      name: options.label || variant.name || "Generated deck",
      commander,
      cards,
      source: "generated",
      sourceUrl: null,
      importedAt: options.now || new Date().toISOString(),
      unresolved: [],
      // The rung, the lens and the inputs, so a saved deck can say where it came
      // from. Everything here is a fact about the generation, not a claim about
      // the deck's strength -- the score comes from the simulator like any other.
      generated: {
        rung: rung.key,
        rungLabel: rung.label,
        lens: variant.lens || "",
        lensLabel: variant.lensLabel || "",
        commanderName: commander[0] || "",
        spend: spendOf(entries),
        inputs: variant.inputs || null
      },
      warnings: problems(built, which),
      measured: null
    };
  }

  /* The one line under each rung button: what it costs and how it differs from
     the rung before it. Written here rather than in the panel because the
     comparison is arithmetic over the generator's output, and the panel should
     not be doing arithmetic. */
  function describe(built, which) {
    const rung = rungAt(which);
    if (!built || !rung) return "";
    const entries = built.stages[rung.index] || [];
    const spend = spendOf(entries);
    const money = spend.total >= 1000
      ? `$${Math.round(spend.total).toLocaleString()}`
      : `$${spend.total.toFixed(0)}`;
    const gap = spend.unpriced
      ? ` · ${spend.unpriced} card${spend.unpriced === 1 ? "" : "s"} with no price quoted`
      : "";
    if (rung.index === 0) return `${money}${gap} · ${rung.blurb}`;
    // Against the nearest rung the reader can actually SEE, not the adjacent one
    // in the array. When Tuned composes to the same hundred as Base it is not
    // offered, and "8 cards different from Tuned" then names a button that is not
    // on screen. Walking down past the collapsed rungs is also numerically the
    // same claim, because a rung is only collapsed when it changed nothing.
    const below = shownBelow(built, rung.index);
    const changed = countChanged(built.stages[below.index], entries);
    return `${money}${gap} · ${changed} card${changed === 1 ? "" : "s"} different from ` +
      `${below.label}`;
  }

  /* The nearest rung below this one whose hundred differs from the rung below
     IT -- which is exactly the set offeredRungs() shows. Index 0 always
     qualifies, so this terminates. */
  function shownBelow(built, index) {
    for (let i = index - 1; i > 0; i -= 1) {
      if (countChanged(built.stages[i - 1], built.stages[i]) > 0) return RUNGS[i];
    }
    return RUNGS[0];
  }

  /* How many cards this rung swapped out relative to the one below. Counted as
     cards leaving, not as a symmetric difference: a ladder replaces one card
     with one card, and reporting "8 changed" for four swaps overstates it. */
  function countChanged(before, after) {
    const has = new Set((after || []).map((entry) => key(entry)));
    return (before || []).filter((entry) => !has.has(key(entry))).length;
  }

  const key = (entry) => String(((entry && entry.card) || {}).name || "").trim().toLowerCase();

  /* Which rung to offer first. Tuned is what the whole ladder is built around --
     Base is a floor and No budget is a ceiling -- so it is the default unless
     it came out identical to Base, in which case offering a "choice" between
     two identical hundreds is a worse experience than offering one. */
  function defaultRung(built) {
    if (!built || !built.stages) return "tuned";
    return countChanged(built.stages[0], built.stages[1]) ? "tuned" : "base";
  }

  /* Which rungs are worth showing at all: one whose hundred is identical to the
     rung below it is not a rung, it is the same deck under a second name. */
  function offeredRungs(built) {
    if (!built || !built.stages) return [];
    return RUNGS.filter((rung, index) =>
      index === 0 || countChanged(built.stages[index - 1], built.stages[rung.index]) > 0);
  }

  return {RUNGS, RUNG_BY_KEY, DECK_SIZE, rungAt, spendOf, countOf, problems, measurable,
          toResolved, describe, countChanged, defaultRung, offeredRungs, shownBelow};
});
