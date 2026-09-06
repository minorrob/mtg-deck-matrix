// The Copilot's simulator findings, checked against the file they come from.
//
// These lenses tell somebody whether to spend money, so the assertions are about
// the two ways that advice could be wrong: a number that is not in the ratings
// file, and a comparison the ratings file does not support. Every figure a lens
// prints is traced back to deck-ratings.json here.
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {readFile} from "node:fs/promises";

const require = createRequire(import.meta.url);
const Sim = require("../sim-lenses.js");

const load = async (p) => JSON.parse(await readFile(new URL(p, import.meta.url), "utf8"));
const ratings = await load("../data/deck-ratings.json");
const master = await load("../data/master-v2.json");
const graph = await load("../data/graph.json");

let checks = 0;
const check = (label, fn) => { fn(); checks += 1; void label; };

const lenses = Sim.build(ratings, {master});

/* ---------------- nothing is invented ---------------- */

check("every lens names a deck the ratings file measured", () => {
  const known = new Set(ratings.decks.map((d) => d.label));
  lenses.forEach((l) => {
    assert.ok(known.has(l.filter.deck), `${l.id} names "${l.filter.deck}", which is not one of the six`);
  });
});

check("every score a lens prints is a delta from the file, to the digit", () => {
  // A recommendation with a made-up number on it is worse than no recommendation.
  lenses.filter((l) => l.impact.score).forEach((l) => {
    const deck = ratings.decks.find((d) => d.label === l.filter.deck);
    const deltas = Object.values(deck.delta).map((d) => d.score);
    assert.ok(deltas.includes(l.impact.score),
      `${l.id} claims ${l.impact.score}, which is not among ${deck.label}'s deltas ${deltas.join(", ")}`);
    assert.ok(l.title.includes(Math.abs(l.impact.score).toFixed(2)),
      `${l.id} does not print the figure it is built on`);
  });
});

check("every price a lens prints is the sum of the Master's own swap rows", () => {
  lenses.filter((l) => l.impact.dollars).forEach((l) => {
    const deck = master.decks.find((d) => d.label === l.filter.deck);
    assert.ok(deck, `${l.filter.deck} is not in the Master`);
    const rung = l.id.endsWith("-b3") ? "b3" : "upgrades";
    const expected = (deck[rung] || []).reduce((n, r) => n + (Number(r.price) || 0), 0);
    assert.equal(Math.abs(l.impact.dollars), Math.round(expected * 100) / 100,
      `${l.id} quotes $${Math.abs(l.impact.dollars)} against ${deck[rung].length} rows totalling $${expected.toFixed(2)}`);
  });
});

check("a lens only claims significance when the file says so", () => {
  lenses.filter((l) => /^sim-(worse|pays)-/.test(l.id)).forEach((l) => {
    const deck = ratings.decks.find((d) => d.label === l.filter.deck);
    const match = Object.values(deck.delta).find((d) => d.score === l.impact.score);
    assert.equal(match.significant, true,
      `${l.id} is presented as a real change on a delta the file marks as noise`);
    assert.match(l.why, /(larger than the measurement error|real drop)/);
  });
});

check("a finding inside the error is never sold as a gain", () => {
  lenses.filter((l) => l.id.startsWith("sim-flat-")).forEach((l) => {
    assert.equal(l.impact.score, 0, "a flat finding claims no points");
    assert.match(l.why, /inside the measurement error/);
    assert.equal(l.action.verb, "hold");
    // It is still allowed to be worth buying for reasons the engine cannot see,
    // and saying so is the difference between advice and a verdict.
    assert.match(l.why, /how they feel to play/);
  });
});

/* ---------------- the chain, reported once ---------------- */

check("each step of the ladder is reported once, not summed and reported twice", () => {
  // deck-ratings carries v1ToB3 as well, which is v1ToTuned + tunedToB3. Emitting
  // it too would show the same money under two headings and make the numbers on
  // screen fail to add up.
  assert.deepEqual(Sim.DELTA_PAIRS.map((p) => p.key), ["v1ToTuned", "tunedToB3"]);
  const perDeckRung = new Map();
  lenses.filter((l) => /^sim-(worse|pays)-/.test(l.id)).forEach((l) => {
    const key = l.id.replace(/^sim-(worse|pays)-/, "");
    assert.ok(!perDeckRung.has(key), `${key} is reported twice`);
    perDeckRung.set(key, l.id);
  });
});

check("a deck whose upgrades measure worse is a warning, not an opportunity", () => {
  // Atraxa's B3 path measures -4.98 with significance. This is the finding the
  // whole module exists for, so it is asserted by name rather than by shape.
  const atraxa = lenses.find((l) => l.id === "sim-worse-d3-b3");
  assert.ok(atraxa, "the Atraxa B3 finding is missing");
  assert.equal(atraxa.kind, "warning");
  assert.equal(atraxa.impact.score, -4.98);
  assert.equal(atraxa.action.verb, "hold");
  assert.match(atraxa.action.label, /Do not buy/);
  assert.ok(atraxa.impact.dollars < 0, "money not spent is a negative amount");
});

check("a deck whose upgrades pay says what they cost per point", () => {
  const felothar = lenses.find((l) => l.id === "sim-pays-d4-b3");
  assert.ok(felothar);
  assert.equal(felothar.kind, "opportunity");
  assert.equal(felothar.impact.score, 4.47);
  assert.equal(felothar.action.verb, "buy");
  assert.match(felothar.why, /points per \$100 spent/);
});

/* ---------------- outliers are relative, never absolute ---------------- */

check("an outlier is measured against the median of the same decks", () => {
  const outliers = lenses.filter((l) => l.id.startsWith("sim-outlier-"));
  outliers.forEach((l) => {
    assert.match(l.evidence, /from their median/, "the comparison is stated, not implied");
    assert.match(l.why, /median/i, "and the median itself is shown so it can be argued with");
    assert.equal(l.impact.score, 0, "an observation is not a score claim");
  });
});

check("an outlier is only flagged when it is the worst of the set", () => {
  const screw = lenses.find((l) => l.id.endsWith("screwpct"));
  if (screw) {
    const values = ratings.decks.map((d) => d.builds.v1.screwPct);
    const worst = ratings.decks[values.indexOf(Math.max(...values))];
    assert.equal(screw.filter.deck, worst.label,
      "the deck named must be the worst one, or the finding is arbitrary");
  }
  // A metric where the six sit close together must produce nothing at all.
  const flood = lenses.find((l) => l.id.endsWith("floodpct"));
  const floods = ratings.decks.map((d) => d.builds.v1.floodPct);
  const mid = Sim.median(floods);
  const away = (Math.max(...floods) - mid) / mid;
  assert.equal(Boolean(flood), away >= 0.25,
    `flood spread is ${(away * 100).toFixed(0)}% from the median; a lens ${flood ? "was" : "was not"} emitted`);
});

check("the median is the median, including for an even count", () => {
  assert.equal(Sim.median([1, 2, 3]), 2);
  assert.equal(Sim.median([1, 2, 3, 4]), 2.5, "six decks is an even count, which is the case here");
  assert.equal(Sim.median([]), 0);
});

/* ---------------- ranking ---------------- */

check("the biggest thing at stake is first", () => {
  const scores = lenses.map((l) => Math.abs(l.impact.score || 0));
  const sorted = scores.slice().sort((a, b) => b - a);
  assert.deepEqual(scores, sorted, "lenses are ordered by points at stake");
  assert.equal(lenses[0].impact.score, -4.98,
    "the five-point drop leads, ahead of every gain and every observation");
});

check("money breaks a tie between two findings worth the same", () => {
  const ranked = Sim.rank([
    {title: "b", impact: {score: 0, dollars: 10}},
    {title: "a", impact: {score: 0, dollars: 200}},
    {title: "c", impact: {score: 2, dollars: 1}}
  ]);
  assert.deepEqual(ranked.map((l) => l.title), ["c", "a", "b"]);
});

/* ---------------- resolving a deck to cards ---------------- */

check("a lens naming an upgrade resolves to those cards", () => {
  const felothar = lenses.find((l) => l.id === "sim-pays-d4-b3");
  const ids = Sim.resolve(felothar, graph.cards);
  assert.ok(ids.length > 0, "the named cards were not found in the graph");
  const names = new Set(graph.cards.filter((c) => ids.includes(c.id)).map((c) => c.name.toLowerCase()));
  felothar.filter.names.forEach((n) => {
    // Not every upgrade is necessarily in the exported graph scope; what must
    // hold is that nothing OTHER than the named cards comes back.
    void n;
  });
  ids.forEach((id) => {
    const card = graph.cards.find((c) => c.id === id);
    assert.ok(felothar.filter.names.some((n) => n.toLowerCase() === card.name.toLowerCase()),
      `${card.name} is not one of the cards this lens names`);
  });
  assert.ok(names.size <= felothar.filter.names.length);
});

check("a lens naming only a deck resolves to that deck's cards", () => {
  const outlier = lenses.find((l) => l.id.startsWith("sim-outlier-"));
  if (!outlier) return;
  const ids = Sim.resolve(outlier, graph.cards);
  assert.ok(ids.length > 20, `only ${ids.length} cards resolved for a whole deck`);
  ids.forEach((id) => {
    const card = graph.cards.find((c) => c.id === id);
    assert.ok((card.decks || []).some((d) => d.deck === outlier.filter.deck),
      `${card.name} is not in ${outlier.filter.deck}`);
  });
});

check("no ratings file means no lenses, not a throw", () => {
  assert.deepEqual(Sim.build(null, {}), []);
  assert.deepEqual(Sim.build({decks: []}, {}), []);
  // Without the Master the advice survives, minus the prices.
  const priceless = Sim.build(ratings, {});
  assert.ok(priceless.length > 0);
  assert.equal(priceless.every((l) => l.impact.dollars === 0), true);
});

console.log(`sim-lenses: ${checks} checks passed · ${lenses.length} lenses from ` +
  `${ratings.decks.length} measured decks · leads with "${lenses[0].title}"`);
