#!/usr/bin/env node
/* What each pilot decision is worth, measured one at a time.
 *
 * The numbers quoted in pilot-policy.js -- "attacking whoever is closest to
 * winning: +10.90" -- came from this. A number in a comment that nobody can
 * reproduce is a number nobody should believe, so this ships beside it.
 *
 *   node tools/sim/pilot-ablation.mjs                    the shipped six, default protocol
 *   node tools/sim/pilot-ablation.mjs --deck D6          one deck
 *   node tools/sim/pilot-ablation.mjs --seeds 6 --games 20000    the published protocol
 *   node tools/sim/pilot-ablation.mjs --lens             casual vs competitive, with attribution
 *
 * TWO MODES, ANSWERING TWO QUESTIONS.
 *
 * The default is a KNOB SWEEP: the published pilot with exactly one decision
 * changed, so each row is that decision's effect in isolation, uncontaminated by
 * the others. That is the calibration view -- it is how the shipped policies were
 * chosen, and it is what catches a knob that is measuring the model's limits
 * rather than a way of playing (blocker retention, which costs 10 to 13 points
 * because the block-reduction estimate is capped, was found exactly here).
 *
 * --lens is the PRODUCT view: the two shipped policies, the gap between them, and
 * one ablation per decision off the competitive line -- the same thing the app
 * runs and shows. Use it to check that what a user is told matches what the model
 * measured.
 */
import {readFile} from "node:fs/promises";
import {createRequire} from "node:module";

const require = createRequire(import.meta.url);
const Measure = require("../../deck-measure.js");
const Policy = require("../../pilot-policy.js");

const load = async (p) => JSON.parse(await readFile(new URL(p, import.meta.url), "utf8"));
const master = await load("../../data/archive/master-v2.json");
const facts = (await load("../../data/card-facts.json")).cards;
const config = await load("../../sim/config.json");
const opponents = await load("../../sim/opponents.json");
const seats = Measure.buildSeats(opponents, config.table);

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = argv.indexOf(`--${name}`);
  return at >= 0 && argv[at + 1] && !argv[at + 1].startsWith("--") ? argv[at + 1] : fallback;
};
const has = (name) => argv.includes(`--${name}`);
const seedCount = Number(flag("seeds", 3));
const games = Number(flag("games", 8000));
const only = flag("deck", null);
// Which combat step to measure under. Some decisions -- blocking above all --
// mean nothing to an engine that has no blocks, and are labelled rather than
// silently reported as zero.
const combatMode = flag("combat", "estimate");
const decks = only ? master.decks.filter((d) => d.id === only) : master.decks;
if (!decks.length) { console.error(`No deck "${only}". Known: ${master.decks.map((d) => d.id).join(", ")}`); process.exit(1); }

function hundred(deck) {
  return Measure.hydrate(master.cards
    .filter((row) => (row.target[deck.id] || 0) > 0)
    .map((row) => ({name: row.name, quantity: row.target[deck.id], isCommander: row.name === deck.commander, price: row.price})), facts);
}
const pad = (v, n) => String(v).padStart(n);
const signed = (v) => (v >= 0 ? "+" : "") + v.toFixed(2);

/* One decision at a time, each on top of the published pilot. Every row shares a
   baseline, so the column is a like-for-like comparison and the rows do not
   interact -- which is the point of an ablation and the reason these numbers do
   not simply add up to the lens gap. */
/* THE BASELINE IS THE HONEST INTERACTION RULE, NOT THE PUBLISHED PILOT, and the
   difference matters enough to be worth a paragraph.

   The published protocol counts an answer as available when you COULD have held
   it up with everything untapped, whether or not you did. Under that rule most
   decks already score full marks on interaction, so deciding to keep mana back
   buys nothing and costs tempo -- it measures -2.13 on D1 and -0.13 on D3, which
   would say holding an answer up is bad play. It is not bad play; it is a
   decision the counterfactual cannot see.

   Both shipped policies are therefore measured on the honest rules -- an answer
   counts only when the mana was genuinely left over, and an answer that stops a
   combo is then spent rather than delaying every combo forever -- and so is every
   row below the first two. The first two rows are printed for context: the published pilot,
   and what the measurement change alone costs before any decision is made. */
const HONEST = {fromUntappedMana: true, answerIsSpent: true};
const KNOBS = [
  ["published pilot", {}],
  ["honest answer rules", {hold: {...HONEST}}],
  ["-- mulligan --", null],
  ["keep almost any seven", {hold: {...HONEST}, mulligan: {maxLands: 6, minEarlyPlays: 1, maxMulligans: 1}}],
  ["mull to five, proactive", {hold: {...HONEST}, mulligan: {minProactive: 1, maxMulligans: 4}}],
  ["-- what you cast --", null],
  ["creature-first", {hold: {...HONEST}, cast: {creature: 6, recursion: 4, finisher: 2, tutor: -12, wipe: -25}}],
  ["develop and tutor", {hold: {...HONEST}, cast: {ramp: 5, draw: 5, tutor: 20, wipe: 10, creature: -6, removal: -4}}],
  ["jam the commander", {hold: {...HONEST}, cast: {commanderThreshold: 200}}],
  ["develop before commander", {hold: {...HONEST}, cast: {commanderThreshold: 62}}],
  ["-- who you attack --", null],
  ["spread the damage", {hold: {...HONEST}, combat: {target: "spread"}}],
  ["the biggest board", {hold: {...HONEST}, combat: {target: "board"}}],
  ["closest to winning", {hold: {...HONEST}, combat: {target: "clock"}}],
  ["-- what you hold back --", null],
  ["keep 1 blocker home", {hold: {...HONEST}, combat: {keepBack: 1}}],
  ["keep 2 blockers home", {hold: {...HONEST}, combat: {keepBack: 2}}],
  ["hold an answer up (t4)", {hold: {...HONEST, reserve: true}}],
  ["hold an answer up (t2)", {hold: {...HONEST, reserve: true, fromTurn: 2}}]
];

function runKnobs() {
  console.log(`Each row is the published pilot with ONE decision changed.`);
  console.log(`${decks.length} deck${decks.length === 1 ? "" : "s"}, ${seedCount} seeds of ${games.toLocaleString()} games each.\n`);
  const header = "decision".padEnd(26) + decks.map((d) => pad(d.id, 8)).join("") + pad("mean", 9) + pad("win%", 8);
  console.log(header);
  console.log("-".repeat(header.length));
  let base = null;
  let published = null;
  for (const [label, spec] of KNOBS) {
    if (spec === null) { console.log(label); continue; }
    const policy = Policy.makePolicy({key: "ablate", label, ...spec});
    void combatMode;
    const scores = [];
    const wins = [];
    for (const deck of decks) {
      const m = Measure.measure(hundred(deck), {config: {...config, combat: combatMode, policy}, seats, seedCount, games});
      scores.push(m.score);
      wins.push(m.winRate);
    }
    const win = wins.reduce((a, b) => a + b, 0) / wins.length;
    if (!published) {
      // Row one: the published pilot, printed as levels. Nothing is measured
      // against it -- it is here so a reader can see where the lens sits.
      published = scores;
      console.log(label.padEnd(26) + scores.map((s) => pad(s.toFixed(2), 8)).join("") + pad("", 9) + pad((win * 100).toFixed(1) + "%", 8));
      continue;
    }
    if (!base) {
      // Row two: the regime every row below shares, and the baseline for them.
      base = scores;
      const drop = scores.map((s, i) => s - published[i]);
      const mean = drop.reduce((a, b) => a + b, 0) / drop.length;
      console.log(label.padEnd(26) + scores.map((s) => pad(s.toFixed(2), 8)).join("") + pad(signed(mean), 9) + pad((win * 100).toFixed(1) + "%", 8));
      continue;
    }
    const deltas = scores.map((s, i) => s - base[i]);
    const mean = deltas.reduce((a, b) => a + b, 0) / deltas.length;
    console.log(label.padEnd(26) + deltas.map((d) => pad(signed(d), 8)).join("") + pad(signed(mean), 9) + pad((win * 100).toFixed(1) + "%", 8));
  }
  console.log(`\nRow one is levels. Row two is levels, with its mean showing what the measurement`);
  console.log(`change alone costs. Every row below is a DELTA against row two, on the same seeds:`);
  console.log(`the honest interaction rule is the regime both shipped policies live in, and`);
  console.log(`pricing a decision against a rule the policies do not use measures nothing.`);
}

function runLens() {
  console.log(`The two shipped policies and what each decision was worth, per deck.`);
  console.log(`${seedCount} seeds of ${games.toLocaleString()} games, ${2 + Policy.ABLATIONS.length} runs per deck, `
    + `${combatMode} combat.\n`);
  for (const deck of decks) {
    const lens = Measure.measureLens(hundred(deck), {
      config: {...config, combat: combatMode}, seats, seedCount, games,
      deckName: String(deck.commander).split(",")[0],
      ablations: Policy.ABLATIONS.map((entry) => entry.key)
    });
    console.log(`${deck.id}  ${deck.commander}`);
    console.log(`  casual ${lens.casual.score.toFixed(2)}   competitive ${lens.competitive.score.toFixed(2)}`
      + `   gap ${signed(lens.gap)} (noise ${lens.noise.toFixed(2)}, ${lens.decisive ? "decisive" : "NOT decisive"})`
      + `   win ${(lens.casual.winRate * 100).toFixed(1)}% -> ${(lens.competitive.winRate * 100).toFixed(1)}%`);
    lens.credits.slice().sort((a, b) => b.points - a.points).forEach((credit) => {
      const entry = Policy.ABLATIONS.find((item) => item.key === credit.key);
      // A decision the running engine cannot see is labelled, not left as a zero.
      const inert = entry.needs && entry.needs !== combatMode ? `  (needs --combat ${entry.needs})` : "";
      console.log(`    ${signed(credit.points).padStart(7)}  ${entry.decision.padEnd(30)} ${entry.doing}${inert}`);
    });
    console.log(`    > ${lens.advice[0].headline}`);
    console.log("");
  }
}

const startedAt = Date.now();
if (has("lens")) runLens(); else runKnobs();
console.error(`\n${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
