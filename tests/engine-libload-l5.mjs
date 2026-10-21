/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* THE LIBRARY CARD LOAD, LANE L5 (TOKENS, COUNTERS AND SACRIFICE; 2026-10-21): WHAT ITS CARDS' SCENARIOS CANNOT REACH.
 *
 * Sixteen cards of Rob's library (docs/engine/library-load-2026-10-21/lane-L5-tokens.json), each with its scenarios. This
 * suite holds the rest of what the lane built:
 *   - "You may sacrifice one or more creatures" as an additional cost (Plumb the Forbidden; rules/actions.mjs,
 *     sacrificeAnyAtom): a permanent that can't be sacrificed is never among the choices, and a cast that names a
 *     permanent it may not sacrifice -- another player's -- is refused before anything is paid, saying what to do.
 *   - The compiler's refusals: that cost without its selector, its reflexive trigger with targets or with an effect not
 *     built; cumulative upkeep's life for an opponent of less than 1; plot's cost that is not mana; a comparison's `prime`
 *     that is not true, and the amount `sacrificedThisWay` that is not true.
 *   - A prime number of lands (script/condition.mjs): 2, 3, 5, 7, 11 and 13 are; 0, 1, 4, 9 and 15 are not.
 *   - The room's words for the plot special action (game/room/room.mjs, offerDetails).
 */
import assert from "node:assert/strict";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex, loadCardScenarios} from "../game/tools/engine-cards.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {legalActions, applyAction} from "../game/engine/rules/actions.mjs";
import {awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {amountProblems} from "../game/engine/script/amount.mjs";
import {conditionHolds, conditionProblems} from "../game/engine/script/condition.mjs";
import {offerDetails} from "../game/room/room.mjs";
import {cardsIn} from "../game/engine/state/index.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };
const throws = (f, re, m) => { assert.throws(f, re, m); checks += 1; };

const index = loadCardIndex();
const PLUMB = "Plumb the Forbidden", BUZZARD = "Blacksnag Buzzard";
const FIX = {
  Bear: {types: ["Creature"], subtypes: ["Bear"], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2},
  /* A creature that can't be sacrificed (rules/statics.mjs, cantBeSacrificed). */
  Stubborn: {types: ["Creature"], subtypes: ["Ox"], manaCost: "{1}{W}", colors: ["W"], power: 2, toughness: 2,
    abilities: [{id: "c", kind: "static", rule: "cant-be-sacrificed", affects: {self: true}}]},
};
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const table = (setup, seats = 2) => runScenario({name: "libload-l5", seats, setup, steps: []}, index.definition, FIX).state;
const idOf = (s, card, seat = 0) => cardsIn(s, "battlefield").find((id) => s.objects[id].card === card && s.objects[id].owner === seat);
function tapFor(s, names, seat = 0) {
  for (const name of names) applyAction(s, seat, legalActions(s, seat).find((a) => a.kind === "activate-mana" && a.label === name && !s.objects[a.objectId].tapped));
}

/* ---- The lane's sixteen cards, their scenarios first: what a break of the lane's engine changes reaches soonest ---- */
const LANE = ["Plumb the Forbidden", "Dark-Dweller Oracle", "Ruthless Lawbringer", "Wall of Shards", "Acrobatic Cheerleader", "Bear Trap", "Blacksnag Buzzard",
  "Boilerbilges Ripper", "Fear of Immobility", "Gold Rush", "Hovel Hurler", "Ruric Thar, Biomagus", "Sunbond", "Tenured Tethermage", "Verdant Kraken",
  "Zimone, All-Questioning"];
{
  const files = loadCardScenarios().map((f) => f.scenarios).filter((f) => LANE.includes(f.card));
  eq(files.map((f) => f.card).sort(), [...LANE].sort(), "each of the sixteen has its scenarios");
  for (const file of files) for (const scenario of file.scenarios) {
    runScenario(scenario, index.definition, file.fixtures ?? {});
    checks += 1;
  }
}

/* ---- Plumb the Forbidden: what may be sacrificed, and a cast that names what may not ---- */
{
  const s = table([at(0, "hand", PLUMB), at(0, "battlefield", "Swamp", "Wastes", "Bear", "Stubborn"), at(1, "battlefield", "Bear")]);
  tapFor(s, ["Swamp", "Wastes"]);
  const cast = legalActions(s, 0).find((a) => a.kind === "cast" && a.label === PLUMB);
  eq([cast?.sacrificeAny, legalActions(s, 0).filter((a) => a.kind === "cast" && a.label === PLUMB).length], [true, 1], "one offer, the sacrifices asked once it is taken");
  /* A cast naming Maya's Bear: refused, and nothing paid or moved. */
  const theirs = idOf(s, "Bear", 1);
  throws(() => applyAction(s, 0, {...cast, sacrificeChosen: [theirs]}), /Those are not permanents Plumb the Forbidden's cost can sacrifice: pick the ones to sacrifice again/,
    "another player's Bear is not his to sacrifice");
  ok(s.objects[theirs]?.zone === "battlefield" && s.stack.length === 0, "and Maya's Bear is where it was, nothing cast");
  applyAction(s, 0, cast);
  const q = awaitingChoice(s);
  eq([q.cost, q.min, q.max, q.options.map((o) => o.label)], ["sacrificeAny", 0, 1, ["Bear"]], "his Bear alone: the one that can't be sacrificed is no choice");
  eq(q.title, "Plumb the Forbidden: sacrifice any number of creatures, or none", "the question says what it asks");
}

/* ---- The compiler's refusals ---- */
{
  const script = (abilities, types = ["Instant"]) => ({schema: "CrankCardScript@1", identity: {name: "Odd Plumb", oracleId: "x", types, subtypes: [], manaCost: "{1}{B}", colors: ["B"], colorIdentity: ["B"],
    ...(types.includes("Creature") ? {power: 1, toughness: 1} : {})}, oracleText: "", abilities});
  const problems = (abilities, types) => compileScript(script(abilities, types)).problems.join(" | ");
  const spell = (atom) => [{kind: "spell", text: "As an additional cost to cast this spell, you may sacrifice one or more creatures.", additionalCost: [atom], effects: [{effect: "draw", count: 1}]}];
  const copies = {text: "When you do, copy this spell.", effects: [{effect: "copySpell", spells: "that card", count: {sacrificedThisWay: true}}]};
  eq(problems(spell({atom: "sacrifice", count: "any", selector: {types: ["Creature"]}, whenYouDo: copies})), "", "Plumb's shape compiles");
  ok(problems(spell({atom: "sacrifice", count: "any"})).includes("sacrifice: an additional cost sacrifices any number of permanents"), "any number, with no selector: refused");
  ok(problems(spell({atom: "sacrifice", count: 2, selector: {types: ["Creature"]}})).includes("sacrifice: an additional cost sacrifices any number of permanents"), "a fixed number of more than one: refused");
  ok(problems(spell({atom: "sacrifice", count: "any", selector: {hue: "B"}})).includes("sacrifice: an additional cost sacrifices any number of permanents"), "a selector that is no selector: refused");
  ok(problems(spell({atom: "sacrifice", count: "any", selector: {types: ["Creature"]}, whenYouDo: {...copies, targets: [{what: "player"}]}})).includes("a reflexive trigger with no targets"),
    "its reflexive trigger with targets: refused");
  ok(problems(spell({atom: "sacrifice", count: "any", selector: {types: ["Creature"]}, whenYouDo: {text: "When you do, ...", effects: [{effect: "noSuchEffect"}]}})).includes("noSuchEffect: declared, not built"),
    "its reflexive trigger with an effect not built: refused");
  const upkeep = (amount) => [{kind: "keyword", text: "Cumulative upkeep", keyword: "cumulative upkeep", cost: [{atom: "opponentGainsLife", amount}]}];
  eq(problems(upkeep(1), ["Creature"]), "", "cumulative upkeep, an opponent gains 1 life: compiles");
  ok(problems(upkeep(0), ["Creature"]).includes("the life an opponent gains is a whole number, 1 or more"), "an opponent gains 0 life: refused");
  const plot = (cost) => [{kind: "keyword", text: "Plot", keyword: "plot", cost}];
  eq(problems(plot([{atom: "mana", cost: "{1}{B}"}]), ["Creature"]), "", "plot {1}{B}: compiles");
  ok(problems(plot([{atom: "payLife", amount: 2}]), ["Creature"]).includes("plot is a mana cost"), "plot for life: refused");
  ok(conditionProblems({compare: {count: 3, prime: "yes"}}).some((p) => p.includes("compare's prime is true")), "prime that is not true: refused");
  ok(conditionProblems({compare: [{count: 3, prime: true}, {count: 1}]}).some((p) => p.includes("compare says against what")), "each of a list of comparisons is held to the rules");
  eq(conditionProblems({compare: [{count: 3, prime: true}, {count: 1, atLeast: 1}]}), [], "a list of two comparisons: fine");
  ok(amountProblems({sacrificedThisWay: 2}).some((p) => p.includes("sacrificedThisWay is true")), "sacrificedThisWay names nothing but itself");
}

/* ---- A prime number, and a list of comparisons that must all hold ---- */
{
  const s = table([]);
  const prime = (n) => conditionHolds(s, {compare: {count: n, prime: true}}, {controller: 0});
  eq([0, 1, 2, 3, 4, 5, 7, 9, 11, 13, 15].filter(prime), [2, 3, 5, 7, 11, 13], "2, 3, 5, 7, 11, 13 are prime; 0, 1, 4, 9, 15 are not");
  eq([conditionHolds(s, {compare: [{count: 3, prime: true}, {count: 1, atLeast: 1}]}, {controller: 0}), conditionHolds(s, {compare: [{count: 3, prime: true}, {count: 0, atLeast: 1}]}, {controller: 0})],
    [true, false], "a list holds when every one does");
}

/* ---- Wall of Shards: the question in words, and an answer that names no opponent ---- */
{
  const wall = loadCardScenarios().map((f) => f.scenarios).find((f) => f.card === "Wall of Shards");
  const four = wall.scenarios.find((sc) => sc.seats === 4);
  /* Up to the second upkeep's payment, said yes to: who gains the first of it is asked. */
  const upTo = four.steps.findIndex((step, i) => i > 4 && step.choose?.[0]?.startsWith("Have an opponent gain 1 life, 2 times"));
  const s = runScenario({...four, steps: four.steps.slice(0, upTo), expect: []}, index.definition, wall.fixtures ?? {}).state;
  eq(awaitingChoice(s).title, "Wall of Shards: have an opponent gain 1 life, 2 times?", "two age counters: the cost twice, in words");
  const pay = awaitingChoice(s).options.find((o) => o.pay === true).index;
  resolveAwaiting(s, [pay]);
  eq([awaitingChoice(s).title, awaitingChoice(s).options.map((o) => o.label)], ["Which opponent gains 1 life (1 of 2)?", ["Maya", "Trey", "Sam"]], "then who gains the first");
  throws(() => resolveAwaiting(s, [7]), /Invalid selection/, "an answer naming no opponent is refused");
  resolveAwaiting(s, [2]);
  eq(awaitingChoice(s).title, "Which opponent gains 1 life (2 of 2)?", "and then the second");
}

/* ---- Plot: a cost paid with life, and a way to pay it that is not one ---- */
{
  /* A fixture with plot {B/P} (Phyrexian mana, CR 107.4f): paid with 2 life, it is life lost. */
  const PHYREX = {Hex: {types: ["Creature"], subtypes: ["Rat"], manaCost: "{2}{B}", colors: ["B"], power: 1, toughness: 1,
    abilities: [{id: "p", kind: "static", rule: "plot", text: "Plot {B/P}", cost: [{atom: "mana", cost: "{B/P}"}], affects: {what: "card", self: true}}]}};
  const s = runScenario({name: "plot for life", seats: 2, setup: [at(0, "hand", "Hex")], steps: []}, index.definition, PHYREX).state;
  const offer = legalActions(s, 0).find((a) => a.kind === "plot");
  throws(() => applyAction(s, 0, {...offer, payWith: "no such way"}), /Hex cannot be plotted with that mana now/, "a way to pay that is not one is refused");
  applyAction(s, 0, offer);
  eq([s.players[0].life, cardsIn(s, "exile").map((id) => s.objects[id].card)], [38, ["Hex"]], "plotted for 2 life");
}

/* ---- The room's words for plot ---- */
{
  const s = table([at(0, "hand", BUZZARD), at(0, "battlefield", "Swamp", "Wastes")]);
  tapFor(s, ["Swamp", "Wastes"]);
  const actions = legalActions(s, 0).filter((a) => a.label === BUZZARD);
  eq(actions.map((a) => a.kind).sort(), ["plot"], "{1}{B} in his pool pays plot, not the Buzzard's {2}{B}");
  eq(offerDetails(s, 0, actions), ["Plot {1}{B}"], "said as the card says it, without the reminder");
  /* Paid more than one way from the pool, each way its own offer, said with the mana that pays. */
  const two = table([at(0, "hand", BUZZARD), at(0, "battlefield", "Swamp", "Mountain", "Forest")]);
  tapFor(two, ["Swamp", "Mountain", "Forest"]);
  const plots = legalActions(two, 0).filter((a) => a.kind === "plot");
  eq(offerDetails(two, 0, plots).sort(), ["Plot {1}{B}, paying {B}{G}", "Plot {1}{B}, paying {B}{R}"], "{B} and {R}, or {B} and {G}: the player's to say");
}

console.log(`engine-libload-l5: ${checks} checks passed`);
