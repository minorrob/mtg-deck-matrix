/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* THE CARD LOAD OF 2026-10-23, LANE L5 (tokens, counters and sacrifice): what its card scenarios cannot reach.
 *
 * - Two counters divided at activation (The Earth Crystal; CR 601.2d, script/amount.mjs `dividedAmong`): only where the
 *   number of targets fixes the division -- one that would be a choice is refused -- and counted from the targets chosen, so a
 *   target gone illegal gives its share to no other (CR 608.2b).
 * - "Repeat the following process X times" (Torment of Hailfire; `repeatFor` `times`): only a round that asks, and each
 *   round every opponent in turn order (CR 101.4), at three players.
 * - "Choose one that hasn't been chosen this turn" (Monument to Endurance; modal `unchosen: "turn"`): a triggered ability's
 *   one effect only.
 * - The amounts' schema: `dividedAmong` and `mostSharingName`.
 */
import assert from "node:assert/strict";
import {compileScript} from "../game/engine/cards/index.mjs";
import {amountProblems} from "../game/engine/script/amount.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {awaitingChoice} from "../game/engine/rules/turn.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };

const identity = {name: "Odd", oracleId: "x", types: ["Artifact"], subtypes: [], manaCost: "{1}", colors: [], colorIdentity: []};
const script = (text, ability) => ({schema: "CrankCardScript@1", identity, oracleText: text, source: "hand", abilities: [{text, ...ability}]});
const problems = (text, ability) => compileScript(script(text, ability)).problems ?? [];

/* ---- dividedAmong: a division the targets fix, or refused ---- */
const DIVIDE = "{T}: Distribute counters among target creatures you control.";
const divided = (total, count) => problems(DIVIDE, {kind: "activated", cost: [{atom: "{T}"}],
  targets: [{what: "permanent", types: ["Creature"], controller: "you", count}],
  effects: [{effect: "putCounter", targets: {target: 0}, counter: "+1/+1", count: {dividedAmong: {total, target: 0}}}]});
ok(!divided(2, {min: 1, max: 2}).some((p) => /division/.test(p)), "two counters among one or two targets: the targets fix the division");
ok(divided(3, {min: 1, max: 3}).some((p) => /division would be a choice/.test(p)), "three among one to three: two targets would split it as a choice, refused");
ok(divided(2, {min: 1, max: 3}).some((p) => /division would be a choice/.test(p)), "two among up to three: three targets cannot each get one, refused");
ok(amountProblems({dividedAmong: {total: 0, target: 0}}).length > 0, "a total of none is refused");
ok(amountProblems({dividedAmong: {total: 2}}).length > 0, "a division names its target");
ok(amountProblems({dividedAmong: {total: 2, target: 0}}).length === 0, "{total, target} is an amount");
ok(amountProblems({mostSharingName: {what: "permanent", types: ["Artifact"], controller: "you"}}).length === 0, "mostSharingName is an amount");

/* ---- repeatFor's times: a round that asks ---- */
const REPEAT = "Repeat the following process X times. Each opponent loses 3 life.";
const repeated = (inner) => problems(REPEAT, {kind: "spell", effects: [{effect: "repeatFor", each: "opponent", times: "X", effects: inner}]});
ok(repeated([{effect: "loseLife", who: "that player", amount: 3}]).some((p) => /`times` repeats a round of effects that ask/.test(p)), "times on a round that does not ask is refused");
ok(!repeated([{effect: "unlessPays", who: "that player", discard: 1, effects: [{effect: "loseLife", who: "that player", amount: 3}]}]).some((p) => /times/.test(p)), "times on a round that asks is a definition");

/* ---- unchosen "turn": a triggered ability's one modal effect ---- */
const MODES = [{text: "Draw a card.", effects: [{effect: "draw", count: 1}]}, {text: "You gain 1 life.", effects: [{effect: "gainLife", amount: 1}]}];
const MONUMENT = "Whenever you discard a card, choose one that hasn't been chosen this turn —\n• Draw a card.\n• You gain 1 life.";
ok(!problems(MONUMENT, {kind: "triggered", trigger: {on: "discarded", discarder: "you"}, effects: [{effect: "modal", choose: 1, unchosen: "turn", modes: MODES}]}).some((p) => /unchosen/.test(p)),
  "unchosen \"turn\" on a triggered ability's one modal effect is a definition");
ok(problems(MONUMENT, {kind: "spell", effects: [{effect: "modal", choose: 1, unchosen: "turn", modes: MODES}]}).some((p) => /unchosen/.test(p)), "unchosen \"turn\" on a spell is refused");
ok(problems(MONUMENT, {kind: "triggered", trigger: {on: "discarded", discarder: "you"}, effects: [{effect: "modal", choose: 1, unchosen: "week", modes: MODES}]}).some((p) => /unchosen/.test(p)),
  "unchosen is true or \"turn\"");

/* ---- the cards, played where scenarios do not go ---- */
const cards = loadCardIndex();
const run = (scenario, fixtures = {}) => runScenario(scenario, cards.definition, fixtures);
const BEAR = {types: ["Creature"], subtypes: ["Bear"], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2};
const CUB = {...BEAR, power: 1, toughness: 1};
const ROCK = {types: ["Artifact"], manaCost: "{1}"};
const ZAP = {types: ["Instant"], manaCost: "{C}", spell: {id: "s", text: "Destroy target creature.", targets: [{what: "permanent", types: ["Creature"]}], effects: [{effect: "destroy", targets: {target: 0}}]}};
const at = (seat, zone, ...names) => ({seat, zone, cards: names});
const taps = (...lands) => lands.map((tap) => ({tap}));

/* The Earth Crystal, one of its two targets destroyed in response: the other keeps its one counter (doubled to two), not
   both (CR 608.2b). */
{
  const {state} = run({name: "a target gone", setup: [at(0, "battlefield", "The Earth Crystal", "Bear", "Cub", "Forest", "Forest", "Wastes", "Wastes", "Wastes", "Wastes", "Wastes"), at(0, "hand", "Zap")],
    steps: [...taps("Forest", "Forest", "Wastes", "Wastes", "Wastes", "Wastes"), {activate: "The Earth Crystal", targets: [[{card: "Bear"}, {card: "Cub"}]]},
      {tap: "Wastes"}, {cast: "Zap", targets: [{card: "Cub"}]}, {resolve: true}, {resolve: true}],
    expect: [{seat: 0, counters: {card: "Bear", counter: "+1/+1", count: 2}}, {seat: 0, zone: "graveyard", cards: ["Cub", "Zap"]}]}, {Bear: BEAR, Cub: CUB, Zap: ZAP});
  ok(state.stack.length === 0, "The Earth Crystal: the creature still there gets its share alone, one counter doubled to two");
}

/* Torment of Hailfire at three players: each round asks Maya, then Trey, in turn order -- X rounds of it. */
{
  const asked = [];
  const scenario = {name: "three players", seats: 3,
    setup: [at(0, "battlefield", "Swamp", "Swamp", "Wastes", "Wastes"), at(0, "hand", "Torment of Hailfire"), at(1, "battlefield", "Rock"), at(2, "battlefield", "Rock")],
    steps: [...taps("Swamp", "Swamp", "Wastes", "Wastes"), {cast: "Torment of Hailfire", x: 2}, {resolve: true},
      {expect: [{asks: {seat: 1}}]}, {choose: ["Don't pay"]}, {expect: [{asks: {seat: 2}}]}, {choose: ["Sacrifice Rock"]},
      {expect: [{asks: {seat: 1}}]}, {choose: ["Sacrifice Rock"]}, {expect: [{asks: {seat: 2}}]}, {choose: ["Don't pay"]}],
    expect: [{seat: 1, life: 37}, {seat: 2, life: 37}, {seat: 0, life: 40}, {seat: 1, zone: "graveyard", cards: ["Rock"]}, {seat: 2, zone: "graveyard", cards: ["Rock"]}]};
  const {passed} = run(scenario, {Rock: ROCK});
  for (const line of passed) asked.push(line);
  ok(asked.filter((l) => /^asks /.test(l)).length === 4, "Torment of Hailfire, X 2 at three players: four questions, Maya then Trey, twice");
}

/* Torment of Hailfire's question says what paying is: a nonland permanent sacrificed, or a card discarded. */
{
  const {state} = run({name: "the words", setup: [at(0, "battlefield", "Swamp", "Swamp", "Wastes"), at(0, "hand", "Torment of Hailfire"), at(1, "battlefield", "Rock")],
    steps: [...taps("Swamp", "Swamp", "Wastes"), {cast: "Torment of Hailfire", x: 1}, {resolve: true}]}, {Rock: ROCK});
  ok(/sacrifice a nonland permanent or discard a card\?$/.test(awaitingChoice(state).title), `Torment of Hailfire asks "${awaitingChoice(state).title}"`);
}

/* Charismatic Conqueror's question names the permanent to tap. */
{
  const {state} = run({name: "the words", setup: [at(0, "battlefield", "Charismatic Conqueror"), at(1, "battlefield", "Wastes"), at(1, "hand", "Rock")],
    steps: [{to: {turn: 2, phase: "MAIN1"}}, {tap: "Wastes", seat: 1}, {cast: "Rock", seat: 1}, {resolve: true}, {resolve: true}]}, {Rock: ROCK});
  ok(/: tap Rock\?$/.test(awaitingChoice(state).title), `Charismatic Conqueror asks "${awaitingChoice(state).title}"`);
}

/* Curse of the Swine, X 2 with one target: exactly X, so refused (CR 601.2c). */
{
  let refused = null;
  try {
    run({name: "too few", setup: [at(0, "battlefield", "Island", "Island", "Wastes", "Wastes"), at(0, "hand", "Curse of the Swine"), at(1, "battlefield", "Bear", "Cub")],
      steps: [...taps("Island", "Island", "Wastes", "Wastes"), {cast: "Curse of the Swine", x: 2, targets: [[{card: "Bear"}]]}]}, {Bear: BEAR, Cub: CUB});
  } catch (error) { refused = error.message; }
  ok(refused !== null, "Curse of the Swine, X 2: one target is too few");
}

/* Bristly Bill doubles +1/+1 counters, and no other kind. */
{
  const CHARGED = {...CUB, manaCost: "{C}", abilities: [{id: "c", kind: "replacement", text: "This creature enters with a charge counter on it.", watches: {event: "enters", who: "self"},
    change: {entersWithCounters: {counter: "charge", count: 1}}}]};
  run({name: "only +1/+1", setup: [at(0, "battlefield", "Bristly Bill, Spine Sower", "Forest", "Forest", "Wastes", "Wastes", "Wastes", "Wastes"), at(0, "hand", "Charged")],
    steps: [{tap: "Wastes"}, {cast: "Charged"}, {resolve: true}, ...taps("Forest", "Forest", "Wastes", "Wastes", "Wastes"), {activate: "Bristly Bill, Spine Sower"}, {resolve: true}],
    expect: [{seat: 0, counters: {card: "Charged", counter: "charge", count: 1}}]}, {Charged: CHARGED});
  ok(true, "Bristly Bill: a charge counter is not doubled");
}

console.log(`engine-w4d-tokens: ${checks} checks passed -- divided counters (CR 601.2d) only where the targets fix it, a target gone keeping its share (CR 608.2b); a round repeated X times only where it asks, each opponent in turn order; "not chosen this turn" a trigger's.`);
