/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* THE CARD LOAD OF 2026-10-23, LANE L1 (the stack, walkers and two-faced cards): what the cards' scenarios cannot reach.
 *
 * - Boast (CR 702.142a) compiled from a script: "activate only if this creature attacked this turn and only once each
 *   turn" -- no card of the directory boasts yet, so Birgi's scenarios use a compiled fixture, and this proves the script's
 *   form compiles to what that fixture is.
 * - The history's lines for an ability copied (Strionic Resonator) and a number chosen at random (Tibalt's Trickery), and the
 *   copy said as it is made.
 * - "Choose 1, 2, or 3 at random" rolls no die (CR 706.1): nothing that watches a roll sees it.
 * - Liliana, Dreadhorde General's -9 at a three-player table: each opponent chooses their own, in turn order.
 */
import assert from "node:assert/strict";
import {compileScript} from "../game/engine/cards/index.mjs";
import {historyLines} from "../game/room/history.mjs";
import {loadCardIndex, loadCardScenarios} from "../game/tools/engine-cards.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";

let checks = 0;
const check = (name, fn) => { fn(); checks += 1; void name; };

check("a boast ability compiles to its limit and its condition", () => {
  const {definition, problems} = compileScript({schema: "CrankCardScript@1", oracleText: "Boast -- {1}: You gain 1 life.",
    identity: {name: "Boaster", oracleId: "00000000-0000-4000-8000-000000000142", types: ["Creature"], subtypes: [], manaCost: "{1}{R}", colors: ["R"], power: 1, toughness: 1},
    abilities: [{kind: "activated", text: "Boast -- {1}: You gain 1 life.", boast: true, cost: [{atom: "mana", cost: "{1}"}], effects: [{effect: "gainLife", amount: 1}]}]});
  assert.deepEqual(problems, []);
  const ability = definition.abilities[0];
  assert.equal(ability.boast, true);
  assert.equal(ability.limit, 1);
  assert.deepEqual(ability.condition, {present: {what: "permanent", self: true, attackedThisTurn: true}});
});

check("the history says an ability was copied, and a number chosen at random", () => {
  const at = {turn: 3, phase: "MAIN1"};
  assert.deepEqual(historyLines({kind: "GameEventAbilityCopied", data: {...at, fields: {name: "Flamecaller", playerId: 0}}}, ["Rob", "Maya"]),
    [{turn: 3, text: "Rob copied Flamecaller's ability"}]);
  assert.deepEqual(historyLines({kind: "GameEventNumberChosen", data: {...at, fields: {player: {playerId: 1}, of: 3, result: 2}}}, ["Rob", "Maya"]),
    [{turn: 3, text: "Maya chose 2 at random"}]);
});

const index = loadCardIndex();
const scenariosOf = (card) => loadCardScenarios().find((f) => f.scenarios.card === card).scenarios;

check("Tibalt's Trickery chooses its number at random, and rolls no die", () => {
  const file = scenariosOf("Tibalt's Trickery");
  const {events} = runScenario(file.scenarios[0], index.definition, file.fixtures ?? {});
  const chosen = events.filter((e) => e.kind === "GameEventNumberChosen");
  assert.equal(chosen.length, 1);
  assert.ok([1, 2, 3].includes(chosen[0].data.fields.result));
  assert.equal(events.filter((e) => e.kind === "GameEventDieRolled").length, 0);
});

check("Strionic Resonator's copy is said: an ability copied, by whom", () => {
  const file = scenariosOf("Strionic Resonator");
  const {events} = runScenario(file.scenarios[0], index.definition, file.fixtures ?? {});
  const copied = events.filter((e) => e.kind === "GameEventAbilityCopied");
  assert.equal(copied.length, 1);
  assert.equal(copied[0].data.fields.name, "Healer");
  assert.equal(copied[0].data.fields.playerId, 0);
});

check("Liliana, Dreadhorde General's -9 at three seats: each opponent keeps their own", () => {
  const file = scenariosOf("Liliana, Dreadhorde General");
  const nine = file.scenarios.find((s) => s.name.startsWith("-9"));
  const scenario = {...structuredClone(nine), seats: 3,
    setup: [...nine.setup, {seat: 2, zone: "battlefield", cards: ["Bear", "Golem", "Island", "Forest"]}]};
  /* Seat 1 answers its three, then seat 2 its two -- its only artifact, the Golem, kept without asking. */
  /* His turns at three seats are 1, 4, 7 and 10: three +1s bring Liliana to 9. */
  const plusOne = (turn) => [...(turn > 1 ? [{to: {turn, phase: "MAIN1"}}] : []), {activate: "Liliana, Dreadhorde General", ability: "a1"}, {resolve: true}];
  scenario.steps = [...plusOne(1), ...plusOne(4), ...plusOne(7), {to: {turn: 10, phase: "MAIN1"}},
    {activate: "Liliana, Dreadhorde General", ability: "a3"}, {resolve: true}, {expect: [{asks: {seat: 1}}]},
    {choose: ["Golem"]}, {choose: ["Golem"]}, {choose: ["Island"]}, {expect: [{asks: {seat: 2}}]}, {choose: ["Golem"]}, {choose: ["Forest"]}];
  scenario.expect = [{seat: 1, zone: "battlefield", cards: ["Golem", "Island", "Smoke Charm"]}, {seat: 2, zone: "battlefield", cards: ["Forest", "Golem"]}];
  runScenario(scenario, index.definition, file.fixtures ?? {});
});

console.log(`engine-w4d-stack: ${checks} checks passed -- boast compiled, two history lines, a number at random, an ability copy said, Liliana's -9 at three seats`);
