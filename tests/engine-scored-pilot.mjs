/* THE HOUSE PILOT'S L1 (AI-2, docs/plan-to-done-2026-09-30.md, "The house pilot's levels of decision"): ITS CHOICES SCORED.
 *
 * Rob, 2026-10-10: L1 "considers some probabilistic outcome or other statistically/mathematically derived result for a
 * good choice out of those provided." This suite holds `game/engine/pilots/scored-pilot.mjs` and `odds.mjs`:
 *
 *   1. The draw odds are the hypergeometric distribution's, to the figure.
 *   2. Combat is exact for one attacker and one blocker: first strike, double strike, deathtouch, indestructible, damage
 *      already marked.
 *   3. The defender model blocks as a sensible player does: kills that survive, trades that do not cost more than they
 *      take, walls, and chump blocks only while what gets through would kill.
 *   4. On boards where L0's rule of thumb goes wrong, L1 does not: the mana it spends, where a removal spell goes, the
 *      swing back an all-out attack leaves open, the chump blocks a lethal attack does not need, a hand too light for its
 *      deck's lands.
 *   5. Easy chooses by weighted chance among the plans near the best, the same every time it is asked the same; normal
 *      takes the best.
 *   6. It sees only its seat, as L0 does.
 */
import assert from "node:assert/strict";
import {binomial, exactly, atLeast} from "../game/engine/pilots/odds.mjs";
import {fight, defend, mayBlock, pick, scoredPilot, WEIGHTS, BAND, TEMPERATURE} from "../game/engine/pilots/scored-pilot.mjs";
import {housePilot} from "../game/engine/pilots/house-pilot.mjs";

let checks = 0;
const ok = (c, m) => {assert.ok(c, m); checks += 1;};
const eq = (a, b, m) => {assert.deepEqual(a, b, m); checks += 1;};
const near = (a, b, m) => {assert.ok(Math.abs(a - b) < 1e-4, `${m}: ${a} is not ${b}`); checks += 1;};

/* ---- 1. The draw odds ---- */
eq([binomial(5, 2), binomial(93, 0), binomial(4, 5), binomial(100, 50) > 1e29], [10, 1, 0, true], "C(n, k), and 0 outside its range");
near(exactly(93, 37, 2, 0), (56 * 55) / (93 * 92), "two draws, none of 37 lands in 93 cards");
near(atLeast(92, 35, 2, 1), 1 - (57 * 56) / (92 * 91), "at least one land in two draws: 1 minus none");
near(atLeast(92, 22, 3, 1), 1 - (70 * 69 * 68) / (92 * 91 * 90), "and in three");
near([0, 1, 2, 3].reduce((n, k) => n + exactly(40, 17, 3, k), 0), 1, "every way, together, is certain");
eq([atLeast(10, 3, 2, 0), atLeast(10, 3, 2, 3)], [1, 0], "nothing needed is certain; more than the draws, impossible");

/* ---- 2. Combat, exactly ---- */
const C = (cardId, power, toughness, keywords = [], extra = {}) => ({cardId, name: `Creature ${cardId}`, types: ["Creature"], power, toughness, keywords, damage: 0, tapped: false, controller: 0, owner: 0, ...extra});
const both = (a, b) => {const r = fight(a, b); return [r.attackerDies, r.blockerDies];};
eq(both(C(1, 2, 2), C(2, 2, 2)), [true, true], "two 2/2s trade");
eq(both(C(1, 3, 3), C(2, 2, 2)), [false, true], "a 3/3 kills a 2/2 and survives");
eq(both(C(1, 2, 2, ["First Strike"]), C(2, 2, 2)), [false, true], "first strike kills before the blocker deals its damage (CR 510.4)");
eq(both(C(1, 2, 2, ["First Strike"]), C(2, 2, 3)), [true, false], "and a first striker that does not kill is then dealt damage");
eq(both(C(1, 1, 1, ["Double Strike"]), C(2, 2, 2)), [true, true], "double strike deals damage in both steps, so a 1/1 kills a 2/2 it dies to");
eq(both(C(1, 1, 1, ["Double Strike"]), C(2, 1, 2, ["First Strike"])), [true, false], "but not one that strikes first and kills it");
eq(both(C(1, 1, 1, ["Deathtouch"]), C(2, 6, 6)), [true, true], "any damage from deathtouch is lethal (CR 702.2b)");
eq(both(C(1, 0, 1, ["Deathtouch"]), C(2, 6, 6)), [true, false], "no damage, no deathtouch");
eq(both(C(1, 2, 2, ["Indestructible"]), C(2, 5, 5)), [false, false], "an indestructible attacker is not destroyed by lethal damage (CR 702.12b)");
eq(both(C(1, 3, 3, [], {damage: 2}), C(2, 1, 1)), [true, true], "damage already marked counts (CR 120.6)");

/* ---- 3. The defender model ---- */
const worthOf = (c) => c.power + c.toughness / 2;
{
  const attackers = [C(1, 3, 3), C(2, 3, 3), C(3, 3, 3)], chumps = [C(11, 1, 1), C(12, 1, 1), C(13, 1, 1)];
  const out = defend({attackers, blockers: chumps, life: 7, worth: worthOf});
  eq([out.blocks.size, out.through, out.blockersLost.length], [1, 6, 1], "facing 9 at 7 life, one chump block brings it to 6, and no more are thrown in");
  const safe = defend({attackers, blockers: chumps, life: 20, worth: worthOf});
  eq([safe.blocks.size, safe.through], [0, 9], "at 20 life, no chump block at all");
  const wall = defend({attackers: [C(1, 2, 2)], blockers: [C(21, 0, 4)], life: 20, worth: worthOf});
  eq([wall.blocks.size, wall.through, wall.blockersLost.length], [1, 0, 0], "a blocker that survives stops the damage for nothing");
  const kill = defend({attackers: [C(1, 3, 3), C(2, 5, 5)], blockers: [C(31, 6, 6)], life: 20, worth: worthOf});
  eq([kill.blocks.get(2)?.cardId, kill.attackersLost.map((c) => c.cardId)], [31, [2]], "a blocker that kills and survives takes the worthier attacker");
  const fair = defend({attackers: [C(1, 4, 4)], blockers: [C(41, 4, 2)], life: 20, worth: worthOf});
  const unfair = defend({attackers: [C(1, 2, 2)], blockers: [C(42, 2, 6, ["Flying"])], life: 20, worth: worthOf});
  eq([fair.blocks.size, fair.attackersLost.length], [1, 1], "a trade that costs no more than it takes is made");
  eq(unfair.blocks.size, 1, "(a 2/6 flyer survives a 2/2: that is a wall, not a trade)");
  const dear = defend({attackers: [C(1, 2, 2)], blockers: [C(43, 2, 2, ["Flying", "Deathtouch"])], life: 20, worth: (c) => worthOf(c) + c.keywords.length * 2});
  eq(dear.blocks.size, 0, "and a trade that costs more than it takes is not");
  const chump = defend({attackers: [C(1, 5, 5)], blockers: [C(52, 2, 2), C(53, 1, 1)], life: 4, worth: worthOf});
  eq([...chump.blocks.values()].map((c) => c.cardId), [53], "a chump block takes the cheapest blocker that will do: the 1/1, not the 2/2");
  const trample = defend({attackers: [C(1, 6, 6, ["Trample"])], blockers: [C(51, 2, 2)], life: 3, worth: worthOf});
  eq(trample.through, 4, "a blocked trampler still deals its excess, so a chump does not save a player at 3");
  ok(!mayBlock(C(61, 2, 2), C(1, 2, 2, ["Flying"])) && mayBlock(C(62, 1, 1, ["Reach"]), C(1, 2, 2, ["Flying"])) && !mayBlock(C(63, 5, 5), C(2, 2, 2, ["Menace"])),
    "flying is blocked only by flying or reach, and menace by no one blocker");
}

/* ---- 4. Where L0's rule of thumb goes wrong ---- */
const FACTS = new Map();
const cards = (name) => FACTS.get(name) ?? null;
const fact = (name, f) => {FACTS.set(name, f); return name;};
function viewOf({seat = 0, turn = 5, phase = "MAIN1", turnPlayerId = 0, players, combat = null}) {
  return {viewerSeatId: seat, turn, turnPlayerId, phase, stackSize: 0, combat,
    players: players.map((p, i) => ({playerId: i, name: `P${i}`, life: p.life ?? 40, health: {life: p.life ?? 40, status: "active"}, mana: [],
      zones: {Battlefield: {cards: p.battlefield ?? [], count: (p.battlefield ?? []).length}, Hand: {cards: p.hand ?? [], count: (p.hand ?? []).length},
        Library: {cards: [], count: p.library ?? 60}, Graveyard: {cards: []}, Exile: {cards: []}, Command: {cards: []}}}))};
}
const mine = (cardId, power, toughness, keywords = [], extra = {}) => C(cardId, power, toughness, keywords, {controller: 0, owner: 0, ...extra});
const theirs = (cardId, power, toughness, keywords = [], extra = {}) => C(cardId, power, toughness, keywords, {controller: 1, owner: 1, ...extra});
const l1 = scoredPilot({seat: 0, cards}), l0 = housePilot({seat: 0, cards});

{ /* The mana: five sources, spells of four, three and two. L0 casts the four and strands one; L1 casts the three and two. */
  const lands = Array.from({length: 5}, (_, i) => ({kind: "activate-mana", objectId: 100 + i, label: "Forest", detail: "{G}"}));
  const casts = [["Ogre", 4, 1], ["Wolf", 3, 2], ["Bear", 2, 3]].map(([n, mv, id]) => ({kind: "cast", objectId: id, label: fact(n, {manaValue: mv, types: ["Creature"]}), tax: 0, autoTap: true}));
  const v = viewOf({players: [{}, {}]});
  const actions = [...casts, ...lands, {kind: "pass"}];
  eq([l0.choose(v, actions).label, l1.choose(v, actions).label], ["Ogre", "Wolf"], "five mana and spells of 4, 3 and 2: L0 casts the 4, L1 the 3 then the 2 (all five spent)");
  eq(l1.choose(v, [casts[2], ...lands.slice(0, 2), {kind: "pass"}]).label, "Bear", "with the 3 cast, two mana left: the 2");
  const taxed = [{...casts[0], tax: 2}, casts[1], ...lands, {kind: "pass"}];
  eq(l1.choose(v, taxed).label, "Wolf", "a commander's tax counts toward what it costs (CR 903.8): a 4 with tax 2 does not fit beside the 3");
}
{ /* The aim: one removal spell, offered once per target. L0 takes the first it may aim; L1 the worthiest. */
  const small = theirs(201, 1, 1), big = theirs(202, 6, 6, ["Flying"]);
  const v = viewOf({players: [{}, {battlefield: [small, big]}]});
  const removal = (id) => ({kind: "cast", objectId: 9, label: fact("Murder", {manaValue: 3, types: ["Instant"]}), hostile: true, tax: 0, targets: [{kind: "object", id}]});
  const actions = [removal(201), removal(202), ...[0, 1, 2].map((i) => ({kind: "activate-mana", objectId: 300 + i})), {kind: "pass"}];
  eq([l0.choose(v, actions).targets[0].id, l1.choose(v, actions).targets[0].id], [201, 202], "removal: L0 at the 1/1 offered first, L1 at the 6/6 flyer");
}
{ /* The swing back: two 4/4s at 8 life against an opponent at 10 with three 3/3s, tapped from their own attack. L0 sends
     both (no untapped blocker), and all three come back for 9. L1 sends one and keeps a 4/4 home: 6 comes back. */
  const a = mine(1, 4, 4), b = mine(2, 4, 4);
  const foes = [theirs(11, 3, 3, [], {tapped: true}), theirs(12, 3, 3, [], {tapped: true}), theirs(13, 3, 3, [], {tapped: true})];
  const v = viewOf({phase: "COMBAT_DECLARE_ATTACKERS", players: [{life: 8, battlefield: [a, b]}, {life: 10, battlefield: foes}]});
  const choice = {id: "declare-attackers:5", mode: "many", min: 0, max: 2, exclusiveBy: "cardId", options: [{index: 0, cardId: 1, defenderId: 1}, {index: 1, cardId: 2, defenderId: 1}]};
  eq([l0.answer(v, choice).indices.length, l1.answer(v, choice).indices.length], [2, 1], "L0 attacks with both and dies to the swing back; L1 attacks with one and keeps a 4/4 to block");
  const watchful = viewOf({phase: "COMBAT_DECLARE_ATTACKERS", players: [{life: 8, battlefield: [mine(1, 4, 4, ["Vigilance"]), mine(2, 4, 4, ["Vigilance"])]}, {life: 10, battlefield: foes}]});
  eq(l1.answer(watchful, choice).indices.length, 2, "with vigilance (CR 702.20b) both attack: an attacker that does not tap still guards");
  const far = viewOf({phase: "COMBAT_DECLARE_ATTACKERS", players: [{life: 8, battlefield: [a, b]}, {life: 40, battlefield: foes}]});
  eq(l1.answer(far, choice).indices.length, 0, "against 40 life, four damage is not worth three more coming back at its 8: both stay home");
  const lethal = viewOf({phase: "COMBAT_DECLARE_ATTACKERS", players: [{life: 8, battlefield: [a, b]}, {life: 8, battlefield: foes}]});
  eq(l1.answer(lethal, choice).indices.length, 2, "but when the attack kills, it all goes in: there is no swing back from a player who lost");
}
{ /* The blocks: three 3/3s at 7 life, a 4/4 and three 1/1s to block with. L0, facing lethal, blocks with everything; L1
     kills one with the 4/4, which leaves 6, and chumps nothing. */
  const attackers = [theirs(21, 3, 3), theirs(22, 3, 3), theirs(23, 3, 3)];
  const guards = [mine(31, 4, 4), mine(32, 1, 1), mine(33, 1, 1), mine(34, 1, 1)];
  const v = viewOf({phase: "COMBAT_DECLARE_BLOCKERS", turnPlayerId: 1, players: [{life: 7, battlefield: guards}, {battlefield: attackers}],
    combat: {attackingPlayerId: 1, defenders: [0], attacks: attackers.map((x) => ({attacker: x.cardId, defender: 0, blocked: false, blockers: []}))}});
  const options = guards.flatMap((g) => attackers.map((x) => ({cardId: g.cardId, attackerId: x.cardId}))).map((o, index) => ({index, ...o}));
  const choice = {id: "declare-blockers:5:0", mode: "many", min: 0, max: 4, exclusiveBy: "cardId", options};
  const picked = (answer) => answer.indices.map((i) => options[i].cardId).sort((x, y) => x - y);
  eq([picked(l0.answer(v, choice)), picked(l1.answer(v, choice))], [[31, 32, 33], [31]], "L0 chumps two 1/1s it did not need to; L1 blocks once, with the 4/4, and is left at 1");
  const menace = theirs(24, 3, 3, ["Menace"]);
  const mv = viewOf({phase: "COMBAT_DECLARE_BLOCKERS", turnPlayerId: 1, players: [{life: 20, battlefield: [guards[0]]}, {battlefield: [menace]}],
    combat: {attackingPlayerId: 1, defenders: [0], attacks: [{attacker: 24, defender: 0, blocked: false, blockers: []}]}});
  eq(l1.answer(mv, {id: "declare-blockers:5:0", mode: "many", min: 0, max: 1, exclusiveBy: "cardId", options: [{index: 0, cardId: 31, attackerId: 24}]}).indices, [],
    "never one blocker on a creature with menace (CR 702.111b), though the 4/4 would kill it: the rules would refuse the whole declaration");
}
{ /* The opening hand: two lands in seven, from a deck of 22 lands in 99. L0 keeps any two to five; L1 reads the odds. */
  const deck = [...Array(22).fill(fact("Plains", {manaValue: 0, types: ["Land"]})), ...Array(77).fill(fact("Knight", {manaValue: 3, types: ["Creature"]}))];
  const hand = [0, 1].map((i) => ({cardId: 400 + i, name: "Plains", types: ["Land"]})).concat([2, 3, 4, 5, 6].map((i) => ({cardId: 400 + i, name: "Knight", types: ["Creature"]})));
  const choice = {id: "mulligan:0:0", mode: "one", options: [{index: 0, label: "Keep"}, {index: 1, label: "Mulligan"}]};
  const at = (turnPlayerId, lands) => viewOf({phase: null, turnPlayerId, players: [{hand, library: 92}, {}]});
  const p = scoredPilot({seat: 0, cards, deck});
  const odds = atLeast(92, 20, 2, 1);
  ok(odds < WEIGHTS.keep, `the chance of a third land by turn three on the play is ${odds.toFixed(3)}, under ${WEIGHTS.keep}`);
  eq([l0.answer(at(0), choice).indices, p.answer(at(0), choice).indices], [[0], [1]], "so L0 keeps it and L1 takes a mulligan");
  const rich = [...Array(38).fill("Plains"), ...Array(61).fill("Knight")];
  eq(scoredPilot({seat: 0, cards, deck: rich}).answer(at(0), choice).indices, [0], `from a deck of 38 lands it keeps (${atLeast(92, 36, 2, 1).toFixed(3)})`);
  eq(p.answer(at(0), {...choice, id: "mulligan:0:2"}).indices, [0], "and after two mulligans it keeps, as L0 does");
  /* Going first draws one card fewer by turn three (CR 103.8a): from 26 lands, the same hand is a mulligan on the play
     (two draws) and a keep on the draw (three). */
  const thin = scoredPilot({seat: 0, cards, deck: [...Array(26).fill("Plains"), ...Array(73).fill("Knight")]});
  ok(atLeast(92, 24, 2, 1) < WEIGHTS.keep && atLeast(92, 24, 3, 1) >= WEIGHTS.keep, `24 lands left: ${atLeast(92, 24, 2, 1).toFixed(3)} in two draws, ${atLeast(92, 24, 3, 1).toFixed(3)} in three`);
  eq([thin.answer(at(0), choice).indices, thin.answer(at(1), choice).indices], [[1], [0]], "so it takes a mulligan on the play and keeps on the draw");
  eq(scoredPilot({seat: 0, cards}).answer(at(0), choice).indices, [0], "without its deck list it has no odds, and answers as L0");
}

/* ---- 5. Easy and normal ---- */
{
  const plans = [{value: 10, n: "best"}, {value: 9, n: "close"}, {value: 10 - BAND * TEMPERATURE.easy - 0.01, n: "far"}];
  eq(pick(plans, "normal", () => 0.99).n, "best", "normal takes the best, whatever the roll");
  const counts = {best: 0, close: 0, far: 0};
  for (let i = 0; i < 400; i += 1) counts[pick(plans, "easy", () => (i + 0.5) / 400).n] += 1;
  ok(counts.best > counts.close && counts.close > 0 && counts.far === 0, `easy: mostly the best (${counts.best}), sometimes the close one (${counts.close}), never one beyond the band (${counts.far})`);
  const v = viewOf({players: [{}, {}]});
  const casts = [["Ogre", 4, 1], ["Wolf", 3, 2], ["Bear", 2, 3]].map(([n, mv, id]) => ({kind: "cast", objectId: id, label: n, tax: 0}));
  const actions = [...casts, ...Array.from({length: 4}, (_, i) => ({kind: "activate-mana", objectId: 100 + i})), {kind: "pass"}];
  const chosen = (seed) => scoredPilot({seat: 0, cards, setting: "easy", seed}).choose(v, actions).label;
  const seeds = Array.from({length: 40}, (_, i) => `match-${i}`);
  eq(seeds.map(chosen), seeds.map(chosen), "easy answers the same question the same way every time it is asked: a replay agrees");
  ok(new Set(seeds.map(chosen)).size > 1, `and across matches it does not always choose alike (${[...new Set(seeds.map(chosen))].join(", ")})`);
  assert.throws(() => scoredPilot({seat: 0, setting: "hard"}), /easy or normal/);
  checks += 1;
}

/* ---- 6. Its seat only ---- */
{
  const casts = [["Ogre", 4, 1], ["Wolf", 3, 2]].map(([n, mv, id]) => ({kind: "cast", objectId: id, label: n, tax: 0}));
  assert.throws(() => l1.choose(viewOf({seat: 1, players: [{}, {}]}), [...casts, ...[100, 101, 102, 103].map((objectId) => ({kind: "activate-mana", objectId})), {kind: "pass"}]), /seat 0 was handed seat 1/,
    "a cast it would plan itself, never asked of L0, is refused on another seat's view");
}
assert.throws(() => l1.choose(viewOf({seat: 1, players: [{}, {}]}), [{kind: "pass"}]), /seat 0 was handed seat 1/);
assert.throws(() => l1.answer(viewOf({seat: 1, players: [{}, {}]}), {id: "declare-attackers:1", options: []}), /seat 0 was handed seat 1/);
checks += 3;

console.log(`engine-scored-pilot: ${checks} checks passed — L1 reads the draw odds and combat exactly, blocks as a sensible defender, spends its mana, aims at the worthiest, keeps a guard against the swing back, chumps only what it must, and at easy chooses near the best, the same every time.`);
