// The pilot, and the one thing that must not move.
//
// THE ASSERTION THAT MATTERS. Every score in this repository was produced by a
// pilot with one mulligan rule, one cast order and one attack target. Making that
// pilot a parameter is only safe if the parameter's default is the pilot that was
// already there -- not approximately, not to two decimal places, but the same
// game. So the first check runs several decks under several seeds with no policy
// and under BALANCED, and requires every metric back identical. If that ever
// fails, data/deck-ratings.json, data/simulation-summary.json and every rung in
// data/archive/rung-lists.json are describing a game the engine no longer plays.
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {readFile} from "node:fs/promises";

const require = createRequire(import.meta.url);
const Engine = require("../sim-engine.js");
const Measure = require("../deck-measure.js");
const Policy = require("../pilot-policy.js");

const load = async (p) => JSON.parse(await readFile(new URL(p, import.meta.url), "utf8"));
const master = await load("../data/archive/master-v2.json");
const facts = (await load("../data/card-facts.json")).cards;
const config = await load("../sim/config.json");
const opponents = await load("../sim/opponents.json");
const seats = Measure.buildSeats(opponents, config.table);

let checks = 0;
const check = (label, fn) => { fn(); checks += 1; void label; };

function hundred(deck) {
  return Measure.hydrate(master.cards
    .filter((row) => (row.target[deck.id] || 0) > 0)
    .map((row) => ({name: row.name, quantity: row.target[deck.id], isCommander: row.name === deck.commander, price: row.price})), facts);
}

/* ---------------- the no-op guarantee ---------------- */

check("no policy and BALANCED are the same game, metric for metric", () => {
  for (const deck of master.decks) {
    const cards = hundred(deck);
    for (const seed of [20260904, 12345, 777]) {
      const plain = Engine.simulateGames(cards, seats, {...config, games: 1200}, seed);
      const named = Engine.simulateGames(cards, seats, {...config, games: 1200, policy: "balanced"}, seed);
      assert.deepEqual(named.metrics, plain.metrics,
        `${deck.id} seed ${seed}: BALANCED is not a no-op`);
      assert.deepEqual(named.perCardStats, plain.perCardStats,
        `${deck.id} seed ${seed}: BALANCED changed the per-card counts`);
    }
  }
});

check("a policy object passed directly behaves like its name", () => {
  const cards = hundred(master.decks[0]);
  const byName = Engine.simulateGames(cards, seats, {...config, games: 800, policy: "competitive"}, 4242);
  const byValue = Engine.simulateGames(cards, seats, {...config, games: 800, policy: Policy.COMPETITIVE}, 4242);
  assert.deepEqual(byValue.metrics, byName.metrics);
});

check("an unknown policy name is refused rather than silently ignored", () => {
  assert.throws(() => Engine.simulateGames(hundred(master.decks[0]), seats,
    {...config, games: 10, policy: "aggressive"}, 1), /Unknown pilot policy/);
});

/* ---------------- the policies are complete and distinct ---------------- */

check("every shipped policy carries every decision", () => {
  for (const [key, policy] of Object.entries(Policy.POLICIES)) {
    assert.equal(policy.key, key);
    for (const field of ["minLands", "maxLands", "minEarlyPlays", "earlyCmc", "minProactive"]) {
      assert.equal(typeof policy.mulligan[field], "number", `${key}.mulligan.${field}`);
    }
    for (const field of ["ramp", "draw", "wipe", "finisher", "creature", "recursion", "tutor", "removal", "protection", "other", "wipeThreshold", "commanderThreshold"]) {
      assert.equal(typeof policy.cast[field], "number", `${key}.cast.${field}`);
    }
    assert.ok(Policy.TARGETS[policy.combat.target], `${key} attacks an unknown target`);
    assert.equal(typeof policy.combat.keepBack, "number");
    assert.equal(typeof policy.hold.reserve, "boolean");
    assert.equal(typeof policy.hold.delayTurns, "number");
    assert.ok(policy.blurb && policy.blurb.length > 20, `${key} has no blurb`);
  }
});

check("BALANCED holds the engine's own numbers, so it cannot drift", () => {
  // Spelled out rather than read from the engine: if someone changes the engine's
  // table and this file, both, they have to do it deliberately in two places.
  const b = Policy.BALANCED;
  assert.deepEqual({...b.mulligan}, {minLands: 2, maxLands: 5, minEarlyPlays: 2, earlyCmc: 3, minProactive: 0, maxMulligans: null});
  assert.equal(b.cast.commanderThreshold, 95);
  assert.equal(b.cast.wipeThreshold, 6);
  assert.equal(Object.values({...b.cast, wipeThreshold: 0, commanderThreshold: 0}).every((v) => v === 0), true,
    "BALANCED must apply no cast-priority offsets");
  assert.equal(b.combat.target, "weakest");
  assert.equal(b.combat.keepBack, 0);
  assert.equal(b.hold.reserve, false);
  assert.equal(b.hold.fromUntappedMana, false);
  assert.equal(b.hold.delayTurns, 1.5);
});

check("the two lens policies are measured on the same interaction rule", () => {
  // The gap is only meaningful if both halves are scored the same way. Casual
  // taps out and earns nothing here; competitive reserves and earns it. Score one
  // on the counterfactual and the other on the fact and the gap is an artifact.
  assert.equal(Policy.CASUAL.hold.fromUntappedMana, true);
  assert.equal(Policy.COMPETITIVE.hold.fromUntappedMana, true);
});

check("the blocker-retention parameter ships at zero in every policy", () => {
  // It costs 10-13 points because the model's block reduction is capped, not
  // because keeping blockers home is bad play. Turning it on before combat is
  // modelled would put that measurement error into the advice.
  for (const [key, policy] of Object.entries(Policy.POLICIES)) {
    assert.equal(policy.combat.keepBack, 0, `${key} keeps creatures back, which this model cannot price`);
  }
});

check("an answer that stops a combo is spent, and stops being counted", () => {
  /* THE ARTIFACT THIS PINS. heldAnswers is recounted from hand at the top of every
     turn, so before the fix one instant in hand pushed back every combo on the
     table, every turn, all game -- and was never cast. It made deliberately holding
     mana up measure +15.66, five points more than any real decision, on a card the
     pilot never spent. Both lens policies now spend it; the published pilot does
     not, because every published number was produced under the old counting. */
  const cards = hundred(master.decks[0]);
  const free = Policy.makePolicy({key: "free", hold: {reserve: true, fromUntappedMana: true, answerIsSpent: false}});
  const spent = Policy.makePolicy({key: "spent", hold: {reserve: true, fromUntappedMana: true, answerIsSpent: true}});
  const a = Engine.simulateGames(cards, seats, {...config, games: 3000, policy: free}, 20260904);
  const b = Engine.simulateGames(cards, seats, {...config, games: 3000, policy: spent}, 20260904);
  assert.ok(b.metrics.interactionAvailability < a.metrics.interactionAvailability,
    "spending the answer must reduce how often one is available");
  assert.ok(b.metrics.winRate < a.metrics.winRate,
    "a free answer every turn is worth win rate; spending it must cost some back");
  assert.equal(Policy.BALANCED.hold.answerIsSpent, false, "the published pilot must keep its own counting");
  for (const key of ["casual", "competitive"]) {
    assert.equal(Policy.POLICIES[key].hold.answerIsSpent, true, `${key} must spend the answer it uses`);
  }
});

/* ---------------- ablations revert exactly one decision ---------------- */

check("each ablation reverts one decision and leaves the rest alone", () => {
  for (const entry of Policy.ABLATIONS) {
    const reverted = Policy.without(entry.key);
    const groups = ["mulligan", "cast", "combat", "hold"];
    const changed = groups.filter((group) => JSON.stringify(reverted[group]) !== JSON.stringify(Policy.COMPETITIVE[group]));
    assert.deepEqual(changed, Object.keys(entry.override),
      `${entry.key} changed ${changed.join(",")} but names ${Object.keys(entry.override).join(",")}`);
    // Whatever it reverted, it reverted TO the casual pilot -- an ablation that
    // invents a third way of playing measures nothing anyone would do.
    for (const group of changed) {
      for (const field of Object.keys(entry.override[group])) {
        assert.deepEqual(reverted[group][field], Policy.CASUAL[group][field],
          `${entry.key}: ${group}.${field} is not the casual answer`);
      }
    }
  }
});

check("an unknown decision is refused", () => {
  assert.throws(() => Policy.without("vibes"), /Unknown pilot decision/);
});

/* ---------------- the decisions themselves ---------------- */

const seatsFixture = () => ([
  {key: "combo", life: 40, winTurn: 9, deviation: 1, threat: [0, 0, 1, 1, 2, 2, 2, 2, 2]},
  {key: "tokens", life: 30, winTurn: 12, deviation: 1, threat: [0, 1, 2, 4, 7, 9, 11, 12, 12]},
  {key: "precon", life: 12, winTurn: 16, deviation: 1, threat: [0, 0, 1, 2, 3, 4, 4, 5, 5]}
]);
const threatOf = (seat, turn) => seat.threat[Math.min(turn, seat.threat.length - 1)] * seat.deviation;

check("each attack target picks the player it says it picks", () => {
  const at = (target) => {
    const seats = seatsFixture();
    const out = Policy.allocateCombatDamage(seats, 9, 8, Policy.makePolicy({key: "t", combat: {target}}), threatOf);
    return out.map((a) => `${a.seat.key}:${a.amount}`);
  };
  assert.deepEqual(at("weakest"), ["precon:9"], "the weakest seat is the one on 12 life");
  assert.deepEqual(at("board"), ["tokens:9"], "the biggest board on turn 8 is tokens");
  assert.deepEqual(at("clock"), ["combo:9"], "the seat closest to winning is combo, which has almost no board");
  assert.deepEqual(at("spread"), ["combo:3", "tokens:3", "precon:3"]);
});

check("the biggest board and the nearest win are different players", () => {
  // The whole reason the attack target is worth measuring. If a change to the
  // shipped opponent profiles ever made these agree, the advice would be vacuous.
  const board = Policy.allocateCombatDamage(seatsFixture(), 5, 8, Policy.makePolicy({key: "t", combat: {target: "board"}}), threatOf);
  const clock = Policy.allocateCombatDamage(seatsFixture(), 5, 8, Policy.makePolicy({key: "t", combat: {target: "clock"}}), threatOf);
  assert.notEqual(board[0].seat.key, clock[0].seat.key);
  assert.equal(Object.values(opponents.profiles).some((p) => p.winTurn.mean <= 10
    && p.threatDamageByTurn[8] <= 4), true,
    "no shipped opponent wins early off a small board, so 'attack the leader' has no teeth");
});

check("no damage and no living seats assign nothing", () => {
  const p = Policy.COMPETITIVE;
  assert.deepEqual(Policy.allocateCombatDamage([], 5, 4, p, threatOf), []);
  assert.deepEqual(Policy.allocateCombatDamage(seatsFixture(), 0, 4, p, threatOf), []);
});

check("held-back creatures are the ones that block best", () => {
  const board = [{toughness: 1}, {toughness: 5}, {toughness: 3}, {toughness: 4}];
  const held = Policy.heldBackCreatures(board, Policy.makePolicy({key: "t", combat: {keepBack: 2}}));
  assert.deepEqual([...held].map((c) => c.toughness).sort((a, b) => b - a), [5, 4]);
  assert.equal(Policy.heldBackCreatures(board, Policy.BALANCED), null, "keepBack 0 must return null, not an empty set");
  assert.equal(Policy.heldBackCreatures([], Policy.makePolicy({key: "t", combat: {keepBack: 2}})), null);
});

check("mana is reserved for the cheapest answer, and only when it is affordable", () => {
  const hold = Policy.COMPETITIVE;
  const hand = [
    {cmc: 4, instantSpeed: true, isRemoval: true},
    {cmc: 2, instantSpeed: true, isProtection: true},
    {cmc: 1, instantSpeed: false, isRemoval: true},
    {cmc: 1, instantSpeed: true, isRemoval: false, isProtection: false}
  ];
  assert.equal(Policy.manaToReserve(hand, 6, 5, hold), 2, "the cheapest instant answer is the two-drop");
  assert.equal(Policy.manaToReserve(hand, 1, 5, hold), 0, "cannot reserve what you cannot pay for");
  assert.equal(Policy.manaToReserve(hand, 6, 3, hold), 0, "not before the policy's turn");
  assert.equal(Policy.manaToReserve(hand, 6, 5, Policy.CASUAL), 0, "a pilot who taps out reserves nothing");
  assert.equal(Policy.manaToReserve([{cmc: 1, instantSpeed: false, isRemoval: true}], 6, 5, hold), 0,
    "a sorcery is not an answer you can hold up");
});

/* ---------------- the advice ---------------- */

const fakeMeasurement = (score, winRate, parts) => ({
  score, winRate, podFunScore: 0.8,
  scoreParts: parts.map(([key, label, points, max]) => ({key, label, points, max}))
});

check("a gap inside the noise is reported as no difference, not as advice", () => {
  const parts = [["winRate", "Wins games", 20, 35]];
  const out = Policy.advise(fakeMeasurement(64, 0.3, parts), fakeMeasurement(65.5, 0.31, parts), {});
  assert.equal(out.length, 1);
  assert.equal(out[0].key, "pilot-neutral");
  assert.match(out[0].detail, /inside the noise/);
});

check("the headline names the decision that measured biggest, and reads as English", () => {
  const parts = [["winRate", "Wins games", 20, 35]];
  const out = Policy.advise(
    fakeMeasurement(60, 0.3, parts), fakeMeasurement(78, 0.5, parts),
    {credits: [{key: "hold", points: 4.0}, {key: "target", points: 9.1}], deckName: "Krenko"});
  assert.equal(out[0].key, "play-to-win");
  assert.match(out[0].headline, /^You can play this deck competitively by attacking whoever is closest to winning\.$/);
  // The bug this pins: a bare verb spliced after "by" reads "by attack whoever".
  assert.doesNotMatch(out.map((a) => a.headline).join(" "), /\bby (attack|keep|throw|develop|cast) /);
  assert.match(out[0].detail, /9\.1 of those points/);
  const second = out.find((a) => a.key === "credit-hold");
  assert.ok(second, "the smaller credit is still reported");
  assert.match(second.headline, /4\.0 points/);
});

check("a credit too small to matter is not reported as a reason", () => {
  const parts = [["winRate", "Wins games", 20, 35]];
  const out = Policy.advise(
    fakeMeasurement(60, 0.3, parts), fakeMeasurement(74, 0.45, parts),
    {credits: [{key: "target", points: 0.3}, {key: "hold", points: 7.0}]});
  assert.equal(out[0].headline.includes("keeping the mana"), true);
  assert.equal(out.some((a) => a.key === "credit-target"), false,
    "0.3 points is not a reason and must not be presented as one");
});

check("with no credits the advice claims less, and says so", () => {
  const parts = [["winRate", "Wins games", 20, 35]];
  const out = Policy.advise(fakeMeasurement(60, 0.3, parts), fakeMeasurement(74, 0.45, parts), {});
  assert.equal(out[0].headline, "This deck has real headroom in how it is played.");
  assert.doesNotMatch(out[0].detail, /on its own/, "an unattributed gap must not be attributed");
});

check("a deck that plays worse to win is told to stop", () => {
  const parts = [["winRate", "Wins games", 20, 35]];
  const out = Policy.advise(fakeMeasurement(74, 0.45, parts), fakeMeasurement(60, 0.3, parts), {});
  assert.equal(out[0].key, "already-tuned");
  assert.match(out[0].detail, /14\.0 points worse|gets 14\.0 points worse/);
});

check("part deltas are paired by key, not by position", () => {
  // scoreParts arrives sorted by points lost, so the two runs order them
  // differently. Pairing by index would compare "wins games" with "mana screw".
  const a = fakeMeasurement(60, 0.3, [["winRate", "Wins games", 20, 35], ["screw", "Keeps its hand live", 4, 15]]);
  const b = fakeMeasurement(70, 0.4, [["screw", "Keeps its hand live", 5, 15], ["winRate", "Wins games", 28, 35]]);
  const deltas = Policy.partDeltas(a, b);
  assert.equal(deltas.find((d) => d.key === "winRate").delta, 8);
  assert.equal(deltas.find((d) => d.key === "screw").delta, 1);
});

/* ---------------- the lens ---------------- */

check("the lens runs both policies plus one run per named decision", () => {
  const cards = hundred(master.decks[5]);
  const seen = [];
  const lens = Measure.measureLens(cards, {
    config, seats, seedCount: 2, games: 900, ablations: ["target"],
    onRun: (index, total, label) => seen.push(label)
  });
  assert.equal(seen.length, 3);
  assert.equal(lens.protocol.runs, 3);
  assert.equal(lens.credits.length, 1);
  assert.equal(lens.credits[0].key, "target");
  assert.equal(lens.games, 900 * 2 * 3);
  assert.ok(lens.advice.length > 0);
  assert.equal(lens.hash, Measure.lineupHash(cards));
});

check("a credit is the competitive score minus the same line without that decision", () => {
  const cards = hundred(master.decks[5]);
  const lens = Measure.measureLens(cards, {config, seats, seedCount: 2, games: 900, ablations: ["target", "hold"]});
  lens.credits.forEach((credit) => {
    assert.equal(credit.points, Number((lens.competitive.score - credit.score).toFixed(2)),
      `${credit.key}: the credit does not reconcile with the run it came from`);
  });
  assert.equal(lens.gap, Number((lens.competitive.score - lens.casual.score).toFixed(2)));
});

check("a hundred cards with no printed text is refused, not measured", () => {
  /* THE BUG THIS PINS, which shipped for exactly one browser run. card-facts.json is
     403 KB and is fetched lazily, so the app's FACTS variable is null until somebody
     opens a card. The lens read it anyway. hydrate() does not mind: it returns a
     hundred cards with no type line, no mana cost and no oracle text, which the engine
     reads as a hundred free non-land spells. It does not error -- it returns 28.5, for
     every deck, under every pilot, and the panel prints it. A wrong number that renders
     is worse than an error, so this is an error. */
  const blank = Measure.hydrate(
    hundred(master.decks[0]).map((c) => ({name: c.name, quantity: c.quantity, isCommander: c.isCommander})),
    {});
  assert.equal(blank.filter((c) => c.typeLine).length, 0, "the fixture must actually be blank");
  assert.throws(() => Measure.measureLens(blank, {config, seats, seedCount: 1, games: 100, ablations: []}),
    /card facts have not loaded/);
  // A deck with a few unknown cards is a data gap, not a wiring bug, and still runs.
  const mostly = hundred(master.decks[0]).map((card, index) => (index < 10 ? {...card, typeLine: ""} : card));
  assert.doesNotThrow(() => Measure.measureLens(mostly, {config, seats, seedCount: 1, games: 100, ablations: []}));
});

check("the lens does not disturb the published measurement", () => {
  const cards = hundred(master.decks[5]);
  const before = Measure.measure(cards, {config, seats, seedCount: 1, games: 900});
  Measure.measureLens(cards, {config, seats, seedCount: 1, games: 500, ablations: []});
  const after = Measure.measure(cards, {config, seats, seedCount: 1, games: 900});
  assert.equal(after.score, before.score);
});

console.log(`pilot-policy: ${checks} checks passed`
  + ` · BALANCED is a no-op across ${master.decks.length} decks x 3 seeds`
  + ` · ${Object.keys(Policy.POLICIES).length} policies, ${Policy.ABLATIONS.length} measurable decisions`);
