// "What does 51.33 mean? Is that a percentage?"
//
// It is not, and until this module existed the app had no way of saying so. The engine
// has always summed nine weighted parts and returned only the sum, and has always counted
// per-card draws, casts and wins and returned them to a function that dropped them. What
// follows pins the readout that gives them back, and the two rules that make it worth
// trusting: the breakdown always adds up to the score, and a re-run says whether the
// change is real before it is allowed to replace anything.
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";

const require = createRequire(import.meta.url);
const Report = require("../measure-report.js");
const Engine = require("../sim-engine.js");
const Measure = require("../deck-measure.js");

let checks = 0;
const check = (label, fn) => { fn(); checks += 1; console.log("  ok  " + label); };

const at = (p) => new URL(p, import.meta.url);
const config = JSON.parse(readFileSync(at("../sim/config.json"), "utf8"));
const opponents = JSON.parse(readFileSync(at("../sim/opponents.json"), "utf8"));
const facts = JSON.parse(readFileSync(at("../data/card-facts.json"), "utf8")).cards;
const rungs = JSON.parse(readFileSync(at("../data/rung-lists.json"), "utf8"));

const COMMANDER = "Quintorius, Loremaster";
const list = Object.values(rungs.variants)
  .map((v) => v.Tuned)
  .find((l) => Array.isArray(l) && l.some((c) => c.name === COMMANDER));
const cards = Measure.hydrate(
  list.map((c) => ({name: c.name, quantity: c.quantity, isCommander: c.name === COMMANDER})), facts);
const seats = Measure.buildSeats(opponents, config.table);
const result = Measure.measure(cards, {config, seats, preview: true});

/* ------------------------------------------------- the breakdown adds up */

check("the parts add up to the score, to the last place shown", () => {
  const summed = result.scoreParts.reduce((n, p) => n + p.points, 0);
  assert.ok(Math.abs(summed - result.score) < 0.06,
    `the breakdown says ${summed.toFixed(2)} and the header says ${result.score} — ` +
    "a receipt that does not match the total is worse than no receipt");
});

check("nothing scores more than its weight allows", () => {
  result.scoreParts.forEach((part) => {
    assert.ok(part.points <= part.max + 0.001, `${part.label} scored ${part.points} of ${part.max}`);
    assert.ok(part.points >= -0.001, `${part.label} scored ${part.points}`);
  });
  const available = result.scoreParts.reduce((n, p) => n + p.max, 0);
  assert.ok(Math.abs(available - 100) < 0.01, `the parts offer ${available} points, not 100`);
});

check("rounding the parts for display never moves the score", () => {
  /* This one is not hypothetical: computing the total from the ROUNDED norms moved D4
     Felothar's published score from 71.90 to 71.88 the first time this module was wired
     in. tests/deck-measure.mjs caught it. Here is the rule, stated where it broke. */
  const metrics = Engine.simulateGames(cards, seats,
    {...config, games: 400, winRateBand: null}, 20260904).metrics;
  const scored = Engine.scoreParts(metrics, config.scoreWeights, config.targets, 5, null);
  assert.equal(scored.score, Engine.compositeScore(metrics, config.scoreWeights, config.targets, 5, null),
    "the number and the breakdown must come from one computation");
});

check("every part says what it measured, in words", () => {
  result.scoreParts.forEach((part) => {
    assert.ok(part.label && part.label.length > 4, `${part.key} has no label`);
    assert.ok(part.reads && part.reads.length > 20,
      `${part.key} has no plain-English reading: "${part.reads}"`);
    assert.ok(!/NaN|undefined/.test(part.reads), `${part.key} reads "${part.reads}"`);
  });
});

/* ------------------------------------------------------- the receipt */

check("the run says how much work it did and how fast", () => {
  assert.equal(result.games, result.protocol.seeds * result.protocol.gamesPerSeed);
  assert.ok(result.elapsedMs > 0, "no elapsed time was recorded");
  assert.ok(result.gamesPerSecond > 0, "no rate was recorded");
  const line = Report.receipt(result);
  assert.match(line, /games/);
  assert.match(line, /a second/);
  /* "I don't believe that" is a fair response to a claim about 120,000 games that carries
     no timing. It is not a fair response to one that does. */
  assert.ok(line.includes(result.games.toLocaleString("en-US")), `receipt: ${line}`);
});

check("a measurement taken before timing existed does not invent one", () => {
  const old = {score: 71.9, protocol: {seeds: 6, gamesPerSeed: 20000}};
  const line = Report.receipt(old);
  assert.match(line, /120,000 games/);
  assert.ok(!/a second/.test(line), `an old record was given a rate it never had: ${line}`);
  assert.equal(Report.receipt(null), "");
});

check("elapsed time is shown in the unit that distinguishes 800 ms from 1.4 s", () => {
  assert.equal(Report.took(812), "812 ms");
  assert.equal(Report.took(1420), "1.4 s");
  assert.equal(Report.took(64000), "64 s");
});

/* --------------------------------------------------- which cards did what */

check("the cards named are cards, not basic lands", () => {
  const named = Report.carries(result).concat(Report.drags(result)).map((c) => c.name);
  assert.ok(named.length > 0, "no cards were named at all");
  assert.ok(!named.some((n) => /^(Plains|Island|Swamp|Mountain|Forest)$/.test(n)),
    `"Plains was drawn a lot" is not a finding: ${named.join(", ")}`);
});

check("a card nobody drew is not given a win rate", () => {
  const thin = {perCard: [
    {name: "Seen Twice", drawnRate: 0.0001, castRate: 1, winRateWhenCast: 1, deadRate: 0},
    {name: "Seen Often", drawnRate: 0.9, castRate: 0.8, winRateWhenCast: 0.6, deadRate: 0.3}
  ]};
  assert.deepEqual(Report.carries(thin).map((c) => c.name), ["Seen Often"]);
});

/* ------------------------------------------------------- the comparison */

check("a re-run says which way it went, and whether that is real", () => {
  const before = {score: 60, se: 0.1, scoreParts: [
    {key: "winRate", label: "Wins games", points: 20, max: 35},
    {key: "clock", label: "Closes the game", points: 5, max: 10}
  ]};
  const after = {score: 63.5, se: 0.1, scoreParts: [
    {key: "winRate", label: "Wins games", points: 23, max: 35, reads: "wins more"},
    {key: "clock", label: "Closes the game", points: 5.5, max: 10, reads: "faster"}
  ]};
  const diff = Report.compare(after, before);
  assert.equal(diff.delta, 3.5);
  assert.equal(diff.real, true, "3.5 points against a 0.1 standard error is not noise");
  assert.equal(diff.parts[0].key, "winRate", "the part that moved most comes first");
  assert.equal(diff.better.length, 2);
  assert.equal(diff.worse.length, 0);
});

check("a change inside the noise is called what it is", () => {
  const before = {score: 60, se: 0.5, scoreParts: []};
  const after = {score: 60.3, se: 0.5, scoreParts: []};
  const diff = Report.compare(after, before);
  assert.equal(diff.real, false,
    "0.3 points against two half-point errors is not a result, and saying it is invites " +
    "somebody to keep a change that did nothing");
  assert.match(Report.compareHtml(diff), /inside the noise/);
});

check("comparing against nothing is not a comparison", () => {
  assert.equal(Report.compare({score: 1}, null), null);
  assert.equal(Report.compareHtml(null), "");
});

/* --------------------------------------------------------------- on screen */

check("the readout renders, escapes, and never prints NaN", () => {
  const html = Report.html(result);
  assert.ok(!/NaN|undefined|\[object/.test(html), "the readout printed a non-number");
  assert.match(html, /out of 100/);
  assert.match(html, /Where the points went/);
  assert.match(html, /storm count/, "the model's blind spot must be stated where the score is");
  const nasty = Report.html({score: 1, winRate: 0, protocol: {seeds: 1, gamesPerSeed: 1},
    scoreParts: [{key: "x", label: "<script>", points: 1, max: 2, lost: 1, reads: "a & b"}], perCard: []});
  assert.ok(!/<script>/.test(nasty), "a label went to the page unescaped");
  assert.match(nasty, /&lt;script&gt;/);
});

check("full marks is not painted as the problem", () => {
  /* The first version flagged a low bar with an attribute selector on the style string --
     i[style*="width:1"] -- which matches "100.0%", because "100.0" contains a "1". The one
     measure that had earned everything available was the one drawn in warning amber. */
  const html = Report.html({score: 50, winRate: 0.3, protocol: {seeds: 1, gamesPerSeed: 10},
    perCard: [], scoreParts: [
      {key: "a", label: "Full marks", points: 10, max: 10, lost: 0, reads: "everything available"},
      {key: "b", label: "Half of it", points: 5, max: 20, lost: 15, reads: "a quarter of it"}
    ]});
  const flagged = (html.match(/class="is-low"/g) || []).length;
  assert.equal(flagged, 1, "exactly the one part under half marks should be flagged");
  const full = html.slice(html.indexOf("Full marks"), html.indexOf("Half of it"));
  assert.ok(!/is-low/.test(full), "a part that scored everything available was flagged as low");
});

check("the compact readout is the same numbers without the card lists", () => {
  const full = Report.html(result);
  const compact = Report.html(result, {compact: true});
  assert.match(full, /Cards that carried it/);
  assert.ok(!/Cards that carried it/.test(compact));
  assert.match(compact, /Where the points went/);
});

check("both screens draw it, and the deck page offers the re-run", () => {
  const viewer = readFileSync(at("../viewer.js"), "utf8");
  const panel = readFileSync(at("../import-panel.js"), "utf8");
  const page = readFileSync(at("../index.html"), "utf8");
  assert.match(page, /src="measure-report\.js/);
  assert.match(panel, /MtgMeasureReport/);
  assert.match(viewer, /How it played/);
  assert.match(viewer, /function showRerun/);
  assert.match(viewer, /if \(before\) return showRerun\(record, before, result\)/,
    "a re-run must be compared before it overwrites the score it is being compared with");
});

console.log(`\nmeasure-report: ${checks} checks passed.`);
