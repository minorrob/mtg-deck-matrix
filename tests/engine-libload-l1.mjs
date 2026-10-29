/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* THE LIBRARY LOAD'S L1 (2026-10-21): planeswalkers, loyalty and two-faced cards -- what the cards' scenarios cannot reach.
 *
 * The scenarios (game/engine/cards/<letter>/<slug>.scenarios.json) play each card. This holds the rest: what the compiler and
 * the schema refuse (an emblem's abilities, a static that works everywhere but the battlefield, a process repeated "again",
 * "prevent all but N", "prevent N", an exchange of zones), what the board is shown of an emblem (CR 114), the words a player
 * held to sorcery time by Teferi, Time Raveler is given (AGENTS.md: refused, with instructions), and that hold at a table of
 * four, each opponent's and never its controller's (CR 307.5).
 */

import assert from "node:assert/strict";
import {compileScript} from "../game/engine/cards/index.mjs";
import {validateScript, SCRIPT_SCHEMA} from "../game/engine/script/schema.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {projectFor} from "../game/engine/projection.mjs";
import {whyNot} from "../game/engine/rules/actions.mjs";
import {castForbidden} from "../game/engine/rules/statics.mjs";
import {applyReplacements} from "../game/engine/rules/replacement.mjs";

let checks = 0;
const check = (fn) => { fn(); checks += 1; };

const IDENTITY = {name: "Test Walker", oracleId: "test", types: ["Planeswalker"], subtypes: [], manaCost: "{3}", colors: [], power: null, toughness: null, loyalty: 3};
const compiled = (abilities, identity = IDENTITY) => compileScript({schema: SCRIPT_SCHEMA, identity, oracleText: "", source: "hand", abilities});
const schemaErrors = (abilities, identity = IDENTITY) => validateScript({schema: SCRIPT_SCHEMA, identity, oracleText: "", source: "hand", abilities}).errors.map((e) => e.message).join(" | ");
const loyalty = (effects, amount = -8) => ({kind: "activated", text: "-8: You get an emblem.", cost: [{atom: "loyalty", amount}], effects});
const DRAW_TRIGGER = {kind: "triggered", text: "Whenever you draw a card, exile target permanent an opponent controls.", trigger: {on: "drawn", who: "you"},
  targets: [{what: "permanent", controller: "opponent"}], effects: [{effect: "moveZone", targets: {target: 0}, to: "exile"}]};

/* ---- an emblem's abilities (cards/index.mjs, CR 114.4) ---- */
check(() => {
  const {definition, problems} = compiled([loyalty([{effect: "emblem", abilities: [DRAW_TRIGGER]}])]);
  assert.deepEqual(problems, [], "an emblem with a triggered ability compiles");
  const made = definition.abilities[0].effects[0].abilities[0];
  assert.equal(made.trigger.on, "GameEventCardChangeZone", "its trigger is compiled as a card's is");
  assert.equal(made.targets.length, 1, "with its own target, not the loyalty ability's (it declares none)");
});
check(() => {
  const {problems} = compiled([loyalty([{effect: "emblem", abilities: []}])]);
  assert.match(problems.join(" | "), /an emblem's abilities are a list, with at least one/);
});
check(() => {
  const {problems} = compiled([loyalty([{effect: "emblem", abilities: [{kind: "activated", text: "{T}: Draw a card.", cost: [{atom: "{T}"}], effects: [{effect: "draw", count: 1}]}]}])]);
  assert.match(problems.join(" | "), /an emblem's activated ability -- only triggered and replacement abilities, player rules, loyalty timing for permanents and statics in a layer work from the command zone yet/);
});
check(() => {
  const {problems} = compiled([loyalty([{effect: "emblem", abilities: [{kind: "static", text: "Creatures you control get +1/+1.", layer: 7, sublayer: "c",
    affects: {what: "permanent", types: ["Creature"], controller: "you"}, apply: {power: 1, toughness: 1}}]}])]);
  /* Gathered since the card load of 2026-10-23 (rules/layers.mjs; Liliana of the Dark Realms' emblem plays it). */
  assert.deepEqual(problems, [], "a layer static from an emblem compiles: the layers gather it from the command zone");
});
check(() => {
  const {problems} = compiled([loyalty([{effect: "emblem", abilities: [{kind: "static", text: "You have no maximum hand size.", rule: "no-maximum-hand-size", affects: {what: "player", who: "you"}}]}])]);
  assert.deepEqual(problems, [], "a rule changed for players is an emblem's to have");
});

/* ---- a static that works everywhere but the battlefield (CR 113.6c; Grist, the Hunger Tide) ---- */
check(() => {
  const away = {kind: "static", text: "As long as this isn't on the battlefield, it's a creature.", layer: 4, worksFrom: "elsewhere", apply: {addTypes: ["Creature"]}};
  assert.deepEqual(compiled([{...away, affects: {self: true}}]).problems, []);
  assert.match(compiled([{...away, affects: {what: "permanent", types: ["Creature"]}}]).problems.join(" | "), /about itself/);
  assert.match(compiled([{...away, affects: {self: true}, worksFrom: "hand"}]).problems.join(" | "), /a static works from the battlefield, or from a graveyard/);
});

/* ---- "repeat this process" (repeatFor's `again`) ---- */
check(() => {
  const repeat = (extra) => [loyalty([{effect: "repeatFor", ...extra, effects: [{effect: "mill", count: 1, remember: true}]}], 1)];
  assert.deepEqual(compiled(repeat({again: {about: "remembered", is: {subtypes: ["Insect"]}}})).problems, []);
  assert.match(compiled(repeat({again: {about: "remembered", is: {}}, each: "player"})).problems.join(" | "), /a process repeated while a condition holds/);
  assert.match(schemaErrors(repeat({again: {nonsense: true}})), /condition/i, "the condition is held to the condition grammar");
});

/* ---- prevention and exchanges (script/schema.mjs) ---- */
check(() => {
  const shield = (change) => [{kind: "replacement", text: "Prevent.", watches: {event: "damage", toPlayer: "you"}, change}];
  assert.equal(schemaErrors(shield({preventAllBut: 1})), "");
  assert.match(schemaErrors(shield({preventAllBut: 0})), /"Prevent all but N" leaves N/);
  assert.equal(schemaErrors(shield({prevent: 2})), "");
  assert.match(schemaErrors(shield({prevent: 0})), /that much of it, a whole number, 1 or more/);
  const swap = (selector, to) => [loyalty([{effect: "moveZoneAll", selector, to, exchange: true}], -10)];
  assert.equal(schemaErrors(swap({what: "card", zone: "hand", controller: "you"}, "library")), "");
  assert.match(schemaErrors(swap({what: "card", zone: "hand", controller: "you"}, "hand")), /An exchange of two zones/);
  assert.match(schemaErrors(swap({what: "card", zone: "hand", controller: "opponent"}, "library")), /An exchange of two zones/);
});

/* ---- what the board is shown, and what a player is told ---- */
const index = loadCardIndex();
const play = (scenario) => runScenario({expect: [], ...scenario}, index.definition, {});
check(() => {
  /* Ajani Steadfast's -7, from 7 loyalty: Maya sees Rob's emblem, and what it does. */
  const {state} = play({name: "Ajani's emblem, seen", setup: [{seat: 0, zone: "battlefield", cards: ["Ajani Steadfast"]}],
    steps: [{activate: "Ajani Steadfast", ability: "a0", targets: [[]]}, {resolve: true}, {to: {turn: 3, phase: "MAIN1"}}, {activate: "Ajani Steadfast", ability: "a0", targets: [[]]}, {resolve: true},
      {to: {turn: 5, phase: "MAIN1"}}, {activate: "Ajani Steadfast", ability: "a0", targets: [[]]}, {resolve: true}, {to: {turn: 7, phase: "MAIN1"}},
      {activate: "Ajani Steadfast", ability: "a2"}, {resolve: true}]});
  const shown = projectFor(state, 1).players[0].zones.Command.cards;
  assert.equal(shown.length, 1);
  assert.equal(shown[0].name, "Ajani Steadfast emblem");
  assert.equal(shown[0].emblem, true);
  assert.equal(shown[0].text, "If a source would deal damage to you or a planeswalker you control, prevent all but 1 of that damage.");
  assert.deepEqual(shown[0].types, [], "an emblem has no types (CR 114.3)");
});
check(() => {
  /* Maya with priority on Rob's turn, a Lightning Bolt and the mana for it: refused, saying who holds her to sorcery time. */
  const {state} = play({name: "Teferi's words", setup: [{seat: 0, zone: "battlefield", cards: ["Teferi, Time Raveler"]}, {seat: 1, zone: "battlefield", cards: ["Mountain"]},
    {seat: 1, zone: "hand", cards: ["Lightning Bolt"]}], steps: [{pass: 1}, {tap: "Mountain", seat: 1}]});
  const bolt = state.zones.hand[1].find((id) => state.objects[id].card === "Lightning Bolt");
  assert.equal(whyNot(state, 1, bolt), "Teferi, Time Raveler lets you cast spells only in your own main phase, with nothing on the stack.");
});
check(() => {
  /* At a table of four, on Rob's turn: each opponent is held, Rob is not (CR 307.5). */
  const {state} = play({name: "Teferi at four", seats: 4, setup: [{seat: 0, zone: "battlefield", cards: ["Teferi, Time Raveler"]},
    ...[0, 1, 2, 3].map((seat) => ({seat, zone: "hand", cards: ["Lightning Bolt"]}))], steps: []});
  const bolts = [0, 1, 2, 3].map((seat) => state.zones.hand[seat].find((id) => state.objects[id].card === "Lightning Bolt"));
  assert.deepEqual(bolts.map((id, seat) => castForbidden(state, seat, id)), [false, true, true, true]);
});

/* ---- two preventions where nobody can be asked: the order that leaves the least (CR 616.1; rules/replacement.mjs) ---- */
check(() => {
  /* Hedron-Field Purists at level 1 ("prevent 1") and Ajani Steadfast's emblem ("prevent all but 1"): 3 damage to Rob, the
     emblem first leaves 1 and the Purists then none -- the other way round would leave 1. */
  const {state} = play({name: "two preventions, unasked", setup: [{seat: 0, zone: "battlefield", cards: ["Hedron-Field Purists", "Plains", "Wastes", "Wastes", "Ajani Steadfast"]}],
    steps: [{tap: "Plains"}, {tap: "Wastes"}, {tap: "Wastes"}, {activate: "Hedron-Field Purists", ability: "a0"}, {resolve: true},
      ...[1, 3, 5].flatMap((turn) => [{to: {turn, phase: "MAIN1"}}, {activate: "Ajani Steadfast", ability: "a0", targets: [[]]}, {resolve: true}]),
      {to: {turn: 7, phase: "MAIN1"}}, {activate: "Ajani Steadfast", ability: "a2"}, {resolve: true}]});
  const {proposal} = applyReplacements(state, {event: "damage", toPlayer: 0, amount: 3, sourceId: null, combat: false}, {dry: true});
  assert.equal(proposal.amount, 0);
  assert.equal(applyReplacements(state, {event: "damage", toPlayer: 0, amount: 1, sourceId: null, combat: false}, {dry: true}).proposal.amount, 0);
});

/* ---- a commander in the command zone is no emblem: its abilities do not work there (CR 113.6, 114.4) ---- */
check(() => {
  /* The Mindskinner as Rob's commander, in the command zone: his Lightning Bolt deals Maya all 3, none of it prevented. */
  const {state} = play({name: "a commander's prevention", setup: [{seat: 0, zone: "command", cards: ["The Mindskinner"]}, {seat: 0, zone: "battlefield", cards: ["Mountain"]},
    {seat: 0, zone: "hand", cards: ["Lightning Bolt"]}], steps: [{tap: "Mountain"}, {cast: "Lightning Bolt", targets: [{player: 1}]}, {resolve: true}]});
  assert.equal(state.players[1].life, 37);
});
check(() => {
  /* Reliquary Tower as Rob's commander, in the command zone: with eight cards at cleanup he is asked to discard. */
  const {state} = play({name: "a commander's player rule", setup: [{seat: 0, zone: "command", cards: ["Reliquary Tower"]},
    {seat: 0, zone: "hand", cards: ["Opt", "Opt", "Opt", "Opt", "Opt", "Opt", "Opt", "Opt"]}], steps: [{to: {turn: 1, phase: "CLEANUP"}}]});
  assert.equal(state.awaiting?.player, 0, "the discard to hand size is asked of Rob");
});

console.log(`engine-libload-l1: ${checks} checks passed -- emblems' abilities compiled and refused, a static everywhere but the battlefield, a process repeated again, prevention and exchanges in the schema, an emblem as the board shows it and a commander that is none, two preventions ordered where nobody is asked, and Teferi, Time Raveler's hold and its words.`);
