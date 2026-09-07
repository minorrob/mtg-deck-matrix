// Combat, checked against worked combats rather than against whether a score moved.
//
// WHY THAT DISTINCTION MATTERS HERE. Every other thing this engine does is
// checked by measuring a deck and comparing a number. Combat cannot be: the
// number moves for a hundred reasons at once, and a rule that is subtly wrong
// produces a plausible score forever. So each case below is a combat a player
// could set up on a table, with the answer written down beside it.
import assert from "node:assert/strict";
import {createRequire} from "node:module";

const require = createRequire(import.meta.url);
const Combat = require("../combat.js");

let checks = 0;
const check = (label, fn) => { fn(); checks += 1; void label; };

// A creature, spelled the way the engine spells one.
const c = (power, toughness, extra) => Object.assign({power, toughness, damage: 0}, extra || {});

/* ---------------- who may block whom ---------------- */

check("flying can only be stopped by flying or reach", () => {
  const flier = c(3, 3, {hasFlying: true});
  assert.equal(Combat.canBlock(c(5, 5), flier), false, "a ground creature cannot block a flier");
  assert.equal(Combat.canBlock(c(1, 1, {hasFlying: true}), flier), true);
  assert.equal(Combat.canBlock(c(1, 4, {hasReach: true}), flier), true, "reach blocks fliers");
  assert.equal(Combat.canBlock(c(5, 5), c(3, 3)), true, "and a ground creature blocks a ground creature");
});

check("menace needs two bodies, and one is not enough", () => {
  const menacing = c(3, 3, {hasMenace: true});
  const one = [c(4, 4)];
  assert.deepEqual(Combat.declareBlocks([menacing], one, {life: 40}), [],
    "one creature cannot block a menacing attacker even when the block would be free");
  const two = [c(4, 4), c(4, 4)];
  const blocks = Combat.declareBlocks([menacing], two, {life: 40});
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].blockers.length, 2);
});

/* ---------------- what one block costs ---------------- */

check("a 3/3 blocking a 2/2 kills it and lives", () => {
  const t = Combat.trade(c(2, 2), [c(3, 3)]);
  assert.equal(t.attackerDies, true);
  assert.deepEqual(t.blockersKilled, []);
});

check("deathtouch makes any block a trade, however big the blocker", () => {
  const t = Combat.trade(c(1, 1, {hasDeathtouch: true}), [c(9, 9)]);
  assert.equal(t.attackerDies, true, "the 9/9 kills the 1/1");
  assert.equal(t.blockersKilled.length, 1, "...and one point of deathtouch damage kills the 9/9");
});

check("first strike makes an even block one-sided", () => {
  const even = Combat.trade(c(3, 3), [c(3, 3)]);
  assert.equal(even.attackerDies, true);
  assert.equal(even.blockersKilled.length, 1, "3/3 into 3/3 trades");
  const striking = Combat.trade(c(3, 3, {hasFirstStrike: true}), [c(3, 3)]);
  assert.equal(striking.blockersKilled.length, 1, "the first-striker kills its blocker");
  assert.equal(striking.attackerDies, false, "and takes nothing back");
});

check("trample carries the excess past a blocker it has killed", () => {
  const t = Combat.trade(c(6, 6, {hasTrample: true}), [c(2, 2)]);
  assert.equal(t.blockersKilled.length, 1);
  assert.equal(t.trampleOver, 4, "two to kill the 2/2, four through");
  const stopped = Combat.trade(c(6, 6), [c(2, 2)]);
  assert.equal(stopped.trampleOver, 0, "without trample nothing gets through");
});

check("a blocker that survives stops the trample too", () => {
  // 6/6 trampler into a 2/8 wall: the wall does not die, so nothing tramples over.
  const t = Combat.trade(c(6, 6, {hasTrample: true}), [c(2, 8)]);
  assert.deepEqual(t.blockersKilled, []);
  assert.equal(t.trampleOver, 0);
});

check("a small deathtouch BLOCKER kills the attacker it blocks", () => {
  // The other half of deathtouch, and a different code path from the one above:
  // there it decided how much damage the ATTACKER needed to spend, here it
  // decides whether the attacker dies to what comes back.
  const t = Combat.trade(c(9, 9), [c(1, 1, {hasDeathtouch: true})]);
  assert.equal(t.attackerDies, true, "one point of deathtouch back kills a 9/9");
  assert.equal(t.blockersKilled.length, 1);
  const plain = Combat.trade(c(9, 9), [c(1, 1)]);
  assert.equal(plain.attackerDies, false, "...and without deathtouch it does not");
});

check("a deathtouch trampler needs one point per blocker and carries the rest", () => {
  const t = Combat.trade(c(6, 6, {hasTrample: true, hasDeathtouch: true}), [c(2, 8)]);
  assert.equal(t.blockersKilled.length, 1, "one point of deathtouch kills the 2/8");
  assert.equal(t.trampleOver, 5, "and five carries over");
});

check("which damage step each creature deals in", () => {
  assert.equal(Combat.dealsIn(c(2, 2), "first"), false);
  assert.equal(Combat.dealsIn(c(2, 2), "normal"), true);
  assert.equal(Combat.dealsIn(c(2, 2, {hasFirstStrike: true}), "first"), true);
  assert.equal(Combat.dealsIn(c(2, 2, {hasFirstStrike: true}), "normal"), false, "first strike deals once");
  assert.equal(Combat.dealsIn(c(2, 2, {hasDoubleStrike: true}), "first"), true);
  assert.equal(Combat.dealsIn(c(2, 2, {hasDoubleStrike: true}), "normal"), true, "double strike deals in both");
});

check("a double-strike trampler blocked by a body that dies to the first hit", () => {
  /* THE CASE THAT BROKE THE FIRST IMPLEMENTATION, and the reason combat needs two
     real damage steps rather than a multiplier. A 6/6 double-strike trampler
     blocked by a 2/2:
       first-strike step  -- 2 kills the blocker, 4 tramples over
       normal step        -- the blocker is already dead, so all 6 tramples over
     Ten. Multiply one step by two and you get eight or twelve, and both are wrong
     in a way no score would ever show you. */
  const t = Combat.trade(c(6, 6, {hasTrample: true, hasDoubleStrike: true}), [c(2, 2)]);
  assert.equal(t.trampleOver, 10);
  assert.equal(t.dealtTotal, 12, "and it dealt twelve in total, two of it to the blocker");

  // Through resolveCombat with the block forced, since a 2/2 would rightly decline it.
  const attacker = c(6, 6, {hasTrample: true, hasDoubleStrike: true, hasLifelink: true});
  const blocker = c(2, 2);
  const out = Combat.resolveCombat([attacker], [{attacker, blockers: [blocker]}], {life: 40});
  assert.equal(out.damageToPlayer, 10);
  assert.equal(out.lifelinkGain, 12, "lifelink is paid on every point dealt, blocker included");
  assert.deepEqual(out.blockersDead, [blocker]);
});

check("a 2/2 declines to chump-block a 6/6 at forty life, and takes twelve", () => {
  // Not a bug: the double striker gets through unblocked precisely because the
  // block was refused. Both halves are the model working.
  const result = Combat.fight([c(6, 6, {hasTrample: true, hasDoubleStrike: true})], [c(2, 2)], {life: 40});
  assert.equal(result.assignments.length, 0);
  assert.equal(result.damageToPlayer, 12, "unblocked, a double striker hits twice for its full power");
  const lethal = Combat.fight([c(6, 6, {hasTrample: true, hasDoubleStrike: true})], [c(2, 2)], {life: 8});
  assert.equal(lethal.assignments.length, 1, "at eight life it is blocked, because twelve is lethal");
  assert.equal(lethal.damageToPlayer, 10, "and ten still gets through, which is also lethal");
});

check("menace is enforced by the block requirement, not only by the guard", () => {
  // Two separate places say "two bodies": the early skip in declareBlocks and the
  // minimum handed to chooseBlockers. Break either and a menacing attacker is
  // blocked by one creature, so both are checked.
  const menacing = c(3, 3, {hasMenace: true});
  assert.deepEqual(Combat.chooseBlockers(menacing, [c(9, 9)], {minimum: 2, lethal: false}), [],
    "one blocker is not a legal block, however good it looks");
  assert.deepEqual(Combat.chooseBlockers(menacing, [c(9, 9)], {minimum: 2, lethal: true}), [],
    "...not even to save the game, because it is not legal");
});

check("a big attacker spreads its damage across several blockers", () => {
  const t = Combat.trade(c(6, 6), [c(1, 2), c(1, 2), c(1, 2)]);
  assert.equal(t.blockersKilled.length, 3, "six damage kills three 1/2s");
  assert.equal(t.attackerDies, false, "three power back does not kill a 6/6");
});

/* ---------------- the block-or-take decision ---------------- */

check("a clean profit is always blocked", () => {
  // 3/3 in front of a 2/2: the attacker dies, the blocker lives. Free.
  const blocks = Combat.declareBlocks([c(2, 2)], [c(3, 3)], {life: 40});
  assert.equal(blocks.length, 1);
});

check("the worked example from the specification: take three, keep the creature", () => {
  /* "A player with only 1 creature on the board with 3 toughness, but attacked
     for 3, and the game just started so the player has 40 health, will likely
     take the 3 damage vs. losing the creature, dropping the player to 37 health
     and the creature survives."
     The creature here is a 2/3 -- it would die to the 3/3 and not kill it. */
  const blocks = Combat.declareBlocks([c(3, 3)], [c(2, 3)], {life: 40});
  assert.deepEqual(blocks, [], "chump-blocking at 40 life is not a trade anybody makes");
  const result = Combat.fight([c(3, 3)], [c(2, 3)], {life: 40});
  assert.equal(result.damageToPlayer, 3);
  assert.deepEqual(result.blockersDead, [], "and the creature survives");
});

check("...but the same block is made when the damage is lethal", () => {
  const blocker = c(2, 3);
  const blocks = Combat.declareBlocks([c(3, 3)], [blocker], {life: 3});
  assert.equal(blocks.length, 1, "at 3 life the creature is worth nothing next turn");
  const result = Combat.fight([c(3, 3)], [blocker], {life: 3});
  assert.equal(result.damageToPlayer, 0);
});

check("the cheapest body that can do the job is the one that does it", () => {
  const small = c(3, 3);
  const commander = c(3, 3, {commander: true});
  const blocks = Combat.declareBlocks([c(2, 2)], [commander, small], {life: 40});
  assert.equal(blocks[0].blockers[0], small, "the commander is not spent on a block anything can make");
});

check("a tapped creature cannot block", () => {
  assert.deepEqual(Combat.declareBlocks([c(2, 2)], [c(5, 5, {tapped: true})], {life: 40}), []);
});

check("two blockers gang up when one cannot do it alone", () => {
  // Neither 2/2 kills a 4/4 alone, and both together do -- losing one of them.
  const blocks = Combat.declareBlocks([c(4, 4)], [c(2, 2), c(2, 2)], {life: 40});
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].blockers.length, 2, "8 worth of attacker for one 4-point body is worth it");
});

/* ---------------- resolving the whole step ---------------- */

check("unblocked damage reaches the player, and lifelink pays it back", () => {
  const result = Combat.fight([c(4, 4, {hasLifelink: true}), c(2, 2)], [], {life: 40});
  assert.equal(result.damageToPlayer, 6);
  assert.equal(result.lifelinkGain, 4, "only the lifelinker's damage is gained");
});

check("double strike hits twice", () => {
  const result = Combat.fight([c(3, 3, {hasDoubleStrike: true})], [], {life: 40});
  assert.equal(result.damageToPlayer, 6);
});

check("both sides' dead are reported, as the objects themselves", () => {
  const attacker = c(3, 3);
  const blocker = c(3, 3);
  const result = Combat.fight([attacker], [blocker], {life: 40});
  assert.equal(result.attackersDead.length + result.blockersDead.length, 2, "a 3/3 into a 3/3 trades");
  assert.ok(result.attackersDead.includes(attacker) || result.blockersDead.includes(blocker));
});

check("a creature blocks at most one attacker", () => {
  const blocker = c(5, 5);
  const blocks = Combat.declareBlocks([c(2, 2), c(2, 2)], [blocker], {life: 40});
  const usedTwice = blocks.filter((b) => b.blockers.includes(blocker)).length;
  assert.equal(usedTwice, 1, "one body cannot be in front of two attackers");
});

check("nothing on the board means everything gets through", () => {
  const result = Combat.fight([c(3, 3), c(4, 4)], [], {life: 40});
  assert.equal(result.damageToPlayer, 7);
  assert.deepEqual(result.attackersDead, []);
});

check("no attackers is not a combat", () => {
  const result = Combat.fight([], [c(5, 5)], {life: 40});
  assert.equal(result.damageToPlayer, 0);
  assert.deepEqual(result.blockersDead, []);
});

/* ---------------- what a creature is worth ---------------- */

check("the commander is worth more than its body", () => {
  assert.ok(Combat.worth(c(3, 3, {commander: true})) > Combat.worth(c(3, 3)));
  assert.equal(Combat.worth(c(3, 3)), 6, "power plus toughness, with nothing else known");
  assert.equal(Combat.worth(c(1, 1, {value: 20})), 20, "an engine that knows better says so");
});

/* ---------------- and the engine that uses it ----------------
 *
 * The module above is checked against worked combats. These check the wiring:
 * that asking for board combat changes the game, that NOT asking for it changes
 * nothing at all, and that the pieces the engine owns -- seat boards, tokens as
 * bodies, creatures staying dead -- do what they say.
 */
{
  const {readFile} = await import("node:fs/promises");
  const Engine = require("../sim-engine.js");
  const Measure = require("../deck-measure.js");
  const load = async (f) => JSON.parse(await readFile(new URL(f, import.meta.url), "utf8"));
  const master = await load("../data/master-v2.json");
  const facts = (await load("../data/card-facts.json")).cards;
  const config = await load("../sim/config.json");
  const opponents = await load("../sim/opponents.json");
  const seats = Measure.buildSeats(opponents, config.table);
  const hundred = (deck) => Measure.hydrate(master.cards
    .filter((row) => (row.target[deck.id] || 0) > 0)
    .map((row) => ({name: row.name, quantity: row.target[deck.id], isCommander: row.name === deck.commander, price: row.price})), facts);

  check("no combat setting, and 'estimate', are the same game", () => {
    // The guarantee every published number rests on: turning a switch ON is a
    // decision, and leaving it alone must not be one.
    for (const deck of master.decks) {
      const cards = hundred(deck);
      for (const seed of [20260904, 4242]) {
        const plain = Engine.simulateGames(cards, seats, {...config, games: 900}, seed);
        const named = Engine.simulateGames(cards, seats, {...config, games: 900, combat: "estimate"}, seed);
        assert.deepEqual(named.metrics, plain.metrics, `${deck.id} seed ${seed}: "estimate" is not a no-op`);
      }
    }
  });

  check("board combat is a different game, on every deck", () => {
    // If it were not, nothing below would be worth having.
    for (const deck of master.decks) {
      const cards = hundred(deck);
      const estimate = Engine.simulateGames(cards, seats, {...config, games: 900}, 20260904);
      const board = Engine.simulateGames(cards, seats, {...config, games: 900, combat: "board"}, 20260904);
      assert.notEqual(board.metrics.winRate, estimate.metrics.winRate, `${deck.id}: board combat changed nothing`);
    }
  });

  check("every opponent archetype says how its power is divided into bodies", () => {
    // Without bodySize a seat's board is guessed, and a guess in the data is
    // harder to find than a guess in the code.
    for (const [key, profile] of Object.entries(opponents.profiles)) {
      assert.equal(typeof profile.bodySize, "number", `${key} has no bodySize`);
      assert.ok(profile.bodySize >= 1 && profile.bodySize <= 10, `${key}: bodySize ${profile.bodySize} is not a creature`);
    }
    // ...and the archetypes disagree, which is the point: a tokens seat and a
    // voltron seat with the same threat are not the same board.
    const tokens = opponents.profiles.tokens;
    const voltron = opponents.profiles.voltron;
    assert.ok(voltron.bodySize > tokens.bodySize * 3,
      "voltron is one big creature and tokens is many small ones, or blocking means nothing");
  });

  check("a token maker puts bodies on the board, not power on its parent", () => {
    /* boardWidth folds each token-making clause into the parent as +2 power,
       which is right for an arithmetic model and exactly wrong for combat: it
       turns a go-wide deck into a handful of enormous creatures, and enormous
       creatures get chump-blocked where the same power spread out does not.
       Measured on the first run, with tokens still folded in, D6 Krenko -- whose
       whole plan is Goblins -- fell the furthest of the six. */
    const krenko = master.decks.find((d) => d.id === "D6");
    const cards = hundred(krenko);
    const board = Engine.simulateGames(cards, seats, {...config, games: 900, combat: "board"}, 20260904);
    const estimate = Engine.simulateGames(cards, seats, {...config, games: 900}, 20260904);
    assert.ok(board.metrics.avgPeakBoard > estimate.metrics.avgPeakBoard,
      "the same hundred should hold MORE creatures when its tokens are creatures");
  });

  check("a misspelled combat mode is refused, not quietly measured the old way", () => {
    // "estimate" and "board" are the two. A typo that silently returns the old
    // model is the worst outcome available: the run succeeds, the number looks
    // fine, and it answers a question nobody asked.
    const cards = hundred(master.decks[5]);
    assert.throws(() => Engine.simulateGames(cards, seats, {...config, games: 10, combat: "boad"}, 1),
      /Unknown combat mode/);
  });
}

console.log(`combat: ${checks} checks passed · worked combats, not moved scores`);
