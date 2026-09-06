// What the logged games are allowed to claim.
//
// This module exists to stop the app saying "your deck wins 8% against a
// predicted 54%" after twelve games, which is a confident-looking lie. So most of
// these assertions are about restraint: the interval has to be the Wilson one,
// it has to contain the prediction at small samples, and the wording has to say
// "cannot tell" rather than printing a difference.
import assert from "node:assert/strict";
import {createRequire} from "node:module";

const require = createRequire(import.meta.url);
const Record = require("../game-record.js");

let checks = 0;
const check = (label, fn) => { fn(); checks += 1; void label; };

const near = (actual, expected, tol, message) =>
  assert.ok(Math.abs(actual - expected) <= tol,
    `${message}: ${actual.toFixed(4)} is not within ${tol} of ${expected}`);

/* ---------------- the interval, against published values ---------------- */

check("the Wilson interval matches the standard table", () => {
  // These are the textbook figures for a 95% Wilson score interval. If this
  // drifts, every claim built on top of it drifts with it.
  const a = Record.wilson(1, 12);
  near(a.low, 0.0149, 0.001, "1/12 lower");
  near(a.high, 0.3539, 0.001, "1/12 upper");
  const b = Record.wilson(50, 100);
  near(b.low, 0.4038, 0.001, "50/100 lower");
  near(b.high, 0.5962, 0.001, "50/100 upper");
});

check("it never leaves [0, 1], which is why it is not the normal approximation", () => {
  // The normal interval for 0 of 5 runs below zero, and a negative win rate is
  // not a thing. Wilson is bounded by construction at every sample size.
  const none = Record.wilson(0, 5);
  assert.equal(none.low, 0);
  assert.ok(none.high > 0 && none.high < 1, "zero wins does not mean the rate is zero");
  const all = Record.wilson(5, 5);
  assert.equal(all.high, 1);
  assert.ok(all.low < 1, "five for five does not mean the rate is one");
  for (let n = 1; n <= 40; n += 1) {
    for (let x = 0; x <= n; x += 1) {
      const band = Record.wilson(x, n);
      assert.ok(band.low >= 0 && band.high <= 1, `${x}/${n} escaped [0,1]`);
      assert.ok(band.low <= band.high, `${x}/${n} inverted`);
    }
  }
});

check("it is symmetric at a half, and narrows as games are added", () => {
  const half = Record.wilson(5, 10);
  near(half.low + half.high, 1, 1e-9, "an even split is symmetric about 0.5");
  const widths = [10, 40, 200, 1000].map((n) => {
    const b = Record.wilson(n / 2, n);
    return b.high - b.low;
  });
  widths.slice(1).forEach((w, i) => {
    assert.ok(w < widths[i], `${w} is not narrower than ${widths[i]}`);
  });
});

check("no games is an honest absence, not a zero", () => {
  const none = Record.wilson(0, 0);
  assert.equal(none.n, 0);
  assert.equal(none.point, null, "there is no rate to report");
  assert.equal(none.low, 0);
  assert.equal(none.high, 1, "with no games the rate could be anything");
});

/* ---------------- folding the log ---------------- */

const LOG = [
  {variantId: "1b", result: "win", playedOn: "2026-08-01", turns: 11, knockouts: 1, podFun: 4, myFun: 5},
  {variantId: "1b", result: "loss", playedOn: "2026-08-02", turns: 9, knockouts: 0, podFun: 3, myFun: 3},
  {variantId: "1b", result: "loss", playedOn: "2026-08-03", turns: 8, knockouts: 0, podFun: 3, myFun: 2},
  {variantId: "1b", result: "draw", playedOn: "2026-08-04", turns: 20, knockouts: 0, podFun: 2, myFun: 2},
  {variantId: "2c", result: "win", playedOn: "2026-08-05", turns: 12, podFun: 5, myFun: 4},
  {variantId: "2c", result: "win", playedOn: "2026-08-06", turns: 13, podFun: 5, myFun: 4}
];

const summary = Record.summarize(LOG, {labels: {"1b": "Betor", "2c": "Atraxa"}});

check("a draw is not half a win", () => {
  // A Commander draw is almost always a time-out. Counting it as half a win
  // would move the rate on a game nobody won.
  const betor = summary.decks.find((d) => d.id === "1b");
  assert.equal(betor.games, 4);
  assert.equal(betor.draws, 1);
  assert.equal(betor.decided, 3, "the draw leaves the denominator");
  assert.equal(betor.winRate, 1 / 3);
});

check("the per-deck row carries what a night actually records", () => {
  const betor = summary.decks.find((d) => d.id === "1b");
  assert.equal(betor.label, "Betor");
  assert.equal(betor.avgTurns, 12, "(11+9+8+20)/4");
  assert.equal(betor.avgKnockouts, 0.25);
  assert.equal(betor.podFun, 3);
  assert.equal(betor.myFun, 3);
  assert.equal(betor.first, "2026-08-01");
  assert.equal(betor.last, "2026-08-04");
});

check("a missing figure is missing, not zero", () => {
  // Atraxa's games recorded no knockouts field at all. Averaging that as 0 would
  // report a deck that never knocks anybody out.
  const atraxa = summary.decks.find((d) => d.id === "2c");
  assert.equal(atraxa.avgKnockouts, null);
  assert.equal(atraxa.avgTurns, 12.5);
});

check("decks are ordered by how much is known about them", () => {
  assert.deepEqual(summary.decks.map((d) => d.id), ["1b", "2c"], "four games before two");
});

check("the totals are of decided games, not of all of them", () => {
  assert.equal(summary.totals.games, 6);
  assert.equal(summary.totals.decided, 5, "the draw is out");
  assert.equal(summary.totals.wins, 3);
  assert.equal(summary.totals.decks, 2);
});

check("an empty log is an empty summary, not a throw", () => {
  const none = Record.summarize([], {});
  assert.deepEqual(none.decks, []);
  assert.equal(none.totals.games, 0);
  assert.equal(none.totals.winRate, null);
  assert.deepEqual(Record.summarize(null, {}).decks, []);
  // Junk in the array must not take the whole summary down.
  assert.deepEqual(Record.summarize([null, {}, {result: "win"}], {}).decks, []);
});

/* ---------------- the claim, and the restraint ---------------- */

check("a small sample agreeing with the prediction says it cannot tell", () => {
  // THE ASSERTION THIS FILE EXISTS FOR. Three wins in twelve against a predicted
  // 54.7% is not evidence of anything, and must never be printed as "8% vs 55%".
  const deck = Record.summarize(
    Array.from({length: 12}, (_u, i) => ({variantId: "x", result: i < 3 ? "win" : "loss"})), {}
  ).decks[0];
  const result = Record.compare(deck, 0.547);
  const words = Record.phrase(result);
  assert.match(words, /Won 3 of 12/);
  assert.ok(/could be anywhere from|entirely below/.test(words));
  // Whatever the verdict, the interval is always shown so the reader can judge.
  assert.match(words, /\d+%–\d+%/, "the range is printed, not just a point estimate");
});

check("an interval containing the prediction is reported as agreement", () => {
  const deck = Record.summarize(
    Array.from({length: 5}, (_u, i) => ({variantId: "x", result: i < 4 ? "win" : "loss"})), {}
  ).decks[0];
  const result = Record.compare(deck, 0.547);
  assert.equal(result.verdict, Record.VERDICT.agree, "4 of 5 cannot be separated from 55%");
  assert.ok(result.interval.low < 0.547 && result.interval.high > 0.547);
  assert.match(Record.phrase(result), /so they agree, or there are too few games to tell/);
});

check("and it says how many more games would settle it", () => {
  const deck = Record.summarize(
    Array.from({length: 5}, (_u, i) => ({variantId: "x", result: i < 4 ? "win" : "loss"})), {}
  ).decks[0];
  const result = Record.compare(deck, 0.547);
  assert.ok(result.need > 5, `${result.need} is not more games than have been played`);
  assert.match(Record.phrase(result), /decided games at this rate would separate them/);
});

check("a difference is only claimed when the interval clears the prediction", () => {
  // 40 games at 10% is far enough from 55% that no sample-size caveat rescues it.
  const deck = Record.summarize(
    Array.from({length: 40}, (_u, i) => ({variantId: "x", result: i < 4 ? "win" : "loss"})), {}
  ).decks[0];
  const result = Record.compare(deck, 0.547);
  assert.equal(result.verdict, Record.VERDICT.below);
  assert.ok(result.interval.high < 0.547);
  assert.equal(result.need, null, "there is nothing left to wait for");
});

check("a real gap still refuses to name its cause", () => {
  // The log cannot tell the deck from the pilot from the pod, and a line that
  // said "your deck is weak" would be claiming something never measured.
  const deck = Record.summarize(
    Array.from({length: 40}, (_u, i) => ({variantId: "x", result: i < 4 ? "win" : "loss"})), {}
  ).decks[0];
  const words = Record.phrase(Record.compare(deck, 0.547));
  assert.match(words, /the deck, the way it is being piloted, or a pod/);
  assert.ok(!/your deck is (bad|weak)/i.test(words));
});

check("no published rate is said out loud, not silently skipped", () => {
  const deck = summary.decks[0];
  const result = Record.compare(deck, null);
  assert.equal(result.verdict, Record.VERDICT.unknown);
  assert.match(Record.phrase(result), /no published win rate/);
  assert.match(Record.phrase(Record.compare(null, 0.5)), /No games logged/);
});

check("gamesNeeded grows as the observed rate nears the prediction", () => {
  const far = Record.gamesNeeded(0.1, 0.547);
  const closer = Record.gamesNeeded(0.3, 0.547);
  assert.ok(far < closer, `${far} should be fewer games than ${closer}`);
  assert.ok(far >= 2 && closer < 400);
});

check("a rate too close to separate comes back as null, not as a huge number", () => {
  /* 0.5 against 0.547 needs roughly 435 decided games -- more than the 400 cap,
     and far more than a hobby log will ever hold. Returning null there is the
     honest answer: the phrase then simply omits the "N more games" sentence
     rather than telling somebody to play four hundred games of Commander. */
  assert.equal(Record.gamesNeeded(0.5, 0.547), null);
  assert.equal(Record.gamesNeeded(0.545, 0.547, 60), null);
  // And the wording drops the promise rather than printing "null".
  const deck = Record.summarize(
    Array.from({length: 4}, (_u, i) => ({variantId: "x", result: i < 2 ? "win" : "loss"})), {}
  ).decks[0];
  const words = Record.phrase({...Record.compare(deck, 0.547), need: null});
  assert.ok(!/null/.test(words));
  assert.ok(!/would separate them/.test(words));
});

/* ---------------- fun against winning ---------------- */

check("the deck the table likes and the deck that wins are both named", () => {
  const log = [
    ...Array.from({length: 6}, () => ({variantId: "a", result: "win", podFun: 3})),
    ...Array.from({length: 6}, () => ({variantId: "b", result: "loss", podFun: 5}))
  ];
  const s = Record.summarize(log, {labels: {a: "Krenko", b: "Chulane"}});
  const verdict = Record.funVersusWinning(s);
  assert.equal(verdict.agree, false);
  assert.equal(verdict.funniest.label, "Chulane");
  assert.equal(verdict.winningest.label, "Krenko");
  assert.match(verdict.note, /rates Chulane highest at 5\/5/);
});

check("when they are the same deck it says so instead of inventing a tension", () => {
  const log = [
    ...Array.from({length: 6}, () => ({variantId: "a", result: "win", podFun: 5})),
    ...Array.from({length: 6}, () => ({variantId: "b", result: "loss", podFun: 3}))
  ];
  const s = Record.summarize(log, {labels: {a: "Krenko", b: "Chulane"}});
  assert.equal(Record.funVersusWinning(s).agree, true);
});

check("it stays quiet until there are enough games to mean anything", () => {
  const thin = Record.summarize([{variantId: "a", result: "win", podFun: 5}], {});
  assert.equal(Record.funVersusWinning(thin), null, "one game is not a preference");
  const noRatings = Record.summarize(
    Array.from({length: 8}, (_u, i) => ({variantId: i % 2 ? "a" : "b", result: "win"})), {});
  assert.equal(Record.funVersusWinning(noRatings), null, "no fun ratings, no claim");
});

console.log(`game-record: ${checks} checks passed · Wilson at 95%, ` +
  `${summary.totals.games} fixture games across ${summary.totals.decks} decks`);
