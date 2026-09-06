// Whether the number on the screen still describes the deck on the screen.
//
// The whole feature is a claim about staleness, so these assertions are about the
// moments a stale number would slip through: a deck edited after a re-run, a rung
// with no published score, and the one that would be the most confident-looking
// wrong answer this app could give -- subtracting a number measured here from a
// number measured by a different engine.
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {readFile} from "node:fs/promises";

const require = createRequire(import.meta.url);
const Audit = require("../deck-audit.js");
const Measure = require("../deck-measure.js");
const Lineup = require("../lineup-model.js");
const Slot = require("../slot-model.js");

const load = async (p) => JSON.parse(await readFile(new URL(p, import.meta.url), "utf8"));
const plans = (await load("../data/buy-plans.json")).plans;
const catalog = await load("../data/cards.json");
const config = await load("../sim/config.json");
const opponents = await load("../sim/opponents.json");

const cards = {};
(catalog.cards || catalog).forEach((card) => {
  if (card && card.name) cards[Lineup.normalizeName(card.name)] = card;
});

let checks = 0;
const check = (label, fn) => { fn(); checks += 1; void label; };

const planId = Object.keys(plans)[0];
const plan = plans[planId];
const commander = plan.commanderName || plan.commander || "";
const entriesFor = (selection) => Lineup.selectedEntries(plan, selection).map((e) => e.item);
const lineupFor = (selection) => Audit.lineupOf(entriesFor(selection), cards, Lineup.normalizeName, commander);

const tuned = lineupFor(Slot.selectionForRung(plan, "tuned"));
const base = lineupFor(Slot.selectionForRung(plan, "base"));

/* ---------------- the hundred, as the simulator sees it ---------------- */

check("the lineup is a hundred cards with printed text on every one", () => {
  assert.equal(tuned.reduce((n, c) => n + c.quantity, 0), 100);
  const blank = tuned.filter((c) => !c.card.typeLine);
  assert.equal(blank.length, 0,
    `${blank.length} cards have no type line, so the engine would be guessing: ${
      blank.slice(0, 3).map((c) => c.name).join(", ")}`);
});

check("the commander is marked, and exactly one card is", () => {
  const flagged = tuned.filter((c) => c.isCommander);
  assert.equal(flagged.length, 1, "a hundred with no commander is not a Commander deck");
  assert.equal(flagged[0].name, commander);
});

/* ---------------- the hash is what makes staleness detectable ---------------- */

check("the same hundred hashes the same, a different one does not", () => {
  assert.equal(Audit.hashOf(tuned), Audit.hashOf(lineupFor(Slot.selectionForRung(plan, "tuned"))));
  assert.notEqual(Audit.hashOf(tuned), Audit.hashOf(base),
    "Base and Tuned are different hundreds and must hash differently");
});

check("reordering the same cards is not an edit", () => {
  const shuffled = tuned.slice().reverse();
  assert.equal(Audit.hashOf(shuffled), Audit.hashOf(tuned),
    "a deck is a multiset; reshuffling it changes nothing about how it plays");
});

check("changing one copy is an edit", () => {
  const land = tuned.findIndex((c) => c.quantity > 1);
  assert.ok(land >= 0, "the fixture has a card with more than one copy");
  const moved = tuned.map((c, i) => (i === land ? {...c, quantity: c.quantity + 1} : c));
  assert.notEqual(Audit.hashOf(moved), Audit.hashOf(tuned),
    "22 Mountains and 23 Mountains are different decks");
});

/* ---------------- what the strip says ---------------- */

const RUNG_LABELS = Slot.RUNG_LABEL;
const published = {score: 91.5, engine: "v2.4", games: 21000};
const hash = Audit.hashOf(tuned);

check("a deck sitting on a measured rung reports the published figure and its provenance", () => {
  const s = Audit.status({hash, rung: "tuned", published, rungLabels: RUNG_LABELS});
  assert.equal(s.state, "matched");
  assert.match(s.headline, /91\.5 Tuned/);
  assert.match(s.note, /v2\.4/, "the engine that produced it is named, not implied");
  assert.match(s.note, /21,000/);
});

check("a rung with no published score says so rather than showing a blank", () => {
  const s = Audit.status({hash, rung: "fun", published: null, rungLabels: RUNG_LABELS});
  assert.equal(s.state, "matched");
  assert.match(s.headline, /not published/);
});

check("a deck on no rung at all is out of sync, and says why", () => {
  const s = Audit.status({hash, rung: null, published: null, rungLabels: RUNG_LABELS});
  assert.equal(s.state, "adrift");
  assert.equal(s.headline, "Out of sync");
  assert.match(s.note, /not one of the measured rungs/);
});

check("a re-run on THIS hundred leads with its own figure", () => {
  const stored = {
    hash,
    current: {score: 88.12, se: 0.09},
    baseline: {score: 91.5, se: 0.08},
    baselineRung: "tuned"
  };
  const s = Audit.status({hash, rung: null, stored, published, rungLabels: RUNG_LABELS});
  assert.equal(s.state, "measured");
  assert.match(s.headline, /88\.12 measured here/);
  assert.match(s.note, /-3\.38 against Tuned/, "the delta is signed and names what it is against");
});

check("a re-run on a DIFFERENT hundred is not reported as this deck's score", () => {
  // This is the failure the whole feature exists to prevent: a number that was
  // true four edits ago, still standing at the top of the page.
  const stored = {
    hash: "0000000000000000",
    current: {score: 88.12, se: 0.09},
    baseline: {score: 91.5, se: 0.08},
    baselineRung: "tuned"
  };
  const s = Audit.status({hash, rung: "tuned", stored, published, rungLabels: RUNG_LABELS});
  assert.equal(s.state, "matched", "not 'measured': that run does not describe this hundred");
  assert.equal(s.stale, true);
  assert.match(s.note, /different hundred/);
  assert.ok(!/88\.12/.test(s.headline), "the stale figure is never the headline");
});

check("a re-run with no baseline says so instead of inventing one", () => {
  const stored = {hash, current: {score: 88.12, se: 0.09}, baseline: null, baselineRung: null};
  const s = Audit.status({hash, stored, rung: null, rungLabels: RUNG_LABELS});
  assert.equal(s.state, "measured");
  assert.match(s.note, /no baseline/);
  assert.ok(!/[+-]\d/.test(s.note), "no delta is offered against nothing");
});

/* ---------------- the two engines are never subtracted ---------------- */

check("a delta is only ever between two runs measured the same way", () => {
  // The published number came from the v2.4 sweep at 7,000-21,000 games; a re-run
  // here is the six-seed 20,000-game protocol on the engine this app ships. The
  // difference between those is a difference in method as well as in cards.
  const source = require("node:fs").readFileSync(new URL("../deck-audit.js", import.meta.url), "utf8");
  assert.match(source, /published[\s\S]{0,200}never subtracted/i,
    "the file must state the rule it is keeping");
  const stored = {hash, current: {score: 88.12, se: 0.09}, baseline: {score: 91.5, se: 0.08}, baselineRung: "tuned"};
  const s = Audit.status({hash, rung: "tuned", stored, published, rungLabels: RUNG_LABELS});
  // 88.12 - 91.5 = -3.38 (both measured here). 88.12 - 91.5 published would be the
  // same number by coincidence of the fixture, so the check is on which it names.
  assert.match(s.note, /measured the same way/);
});

/* ---------------- a real re-run, end to end ---------------- */

const seats = Measure.buildSeats(opponents, config.table);

check("a re-run measures both hundreds, and the pair is comparable", () => {
  // A preview-sized run: the protocol is asserted in tests/deck-measure.mjs, and
  // repeating a 3.5-second run twice here would put 40 seconds in the suite.
  const quick = (cardsIn) => Measure.measure(Measure.hydrate(cardsIn, null),
    {config, seats, preview: true});
  const a = quick(tuned);
  const b = quick(base);
  assert.ok(a.score > 0 && b.score > 0);
  assert.equal(a.protocol.gamesPerSeed, b.protocol.gamesPerSeed, "same games");
  assert.equal(a.protocol.seeds, b.protocol.seeds, "same seeds");
  // Determinism is what makes the delta mean anything at all.
  assert.equal(quick(tuned).score, a.score, "the same hundred measures the same twice");
});

/* The real thing: two full six-seed runs, about eleven seconds. rerun() takes no
   games knob on purpose -- a short run recorded as though it were the protocol is
   exactly the lie the hash and the protocol stamp exist to prevent -- so the test
   pays the same cost a user does. */
const result = Audit.rerun(tuned, base, {config, seats, baselineRung: "base"});

check("the stored result carries the hash of what was measured", () => {
  assert.equal(result.hash, Audit.hashOf(tuned));
  assert.ok(result.current.score > 0);
  assert.ok(result.baseline.score > 0);
  assert.equal(result.baselineRung, "base");
  assert.equal(result.current.protocol.seeds, 6, "the recorded run is the full protocol");
  assert.equal(result.current.protocol.preview, false);
});

check("with no baseline the result is one figure, not two", () => {
  const alone = Audit.rerun(tuned, null, {config, seats, baselineRung: null});
  assert.equal(alone.baseline, null);
  assert.equal(alone.baselineRung, null);
});

console.log(`deck-audit: ${checks} checks passed · ` +
  `${planId} tuned ${result.current.score.toFixed(2)} vs base ${result.baseline.score.toFixed(2)}, ` +
  `hash ${result.hash}`);
