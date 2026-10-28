/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
/* The card load of 2026-10-23, lane L4 (lands and mana): what the cards' scenarios cannot reach -- the steps that pass by
   themselves while a mana ability that changes the board is at hand (Simian Spirit Guide, Arena of Glory's exert), the
   damage each player was dealt this turn read on a later turn and for a player (Spinerock Knoll), and two Opposition Agents
   at once (CR 722.1: the latest controls the search). */
import assert from "node:assert/strict";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {nothingToDo, legalActions} from "../game/engine/rules/actions.mjs";
import {amountOf, amountProblems} from "../game/engine/script/amount.mjs";
import {searchController} from "../game/engine/rules/statics.mjs";

let checks = 0;
const check = (name, fn) => { try { fn(); checks += 1; } catch (error) { console.error(`engine-lands-and-mana: ${name}`); throw error; } };
const index = loadCardIndex();
const run = (scenario, fixtures = {}) => runScenario({expect: [], ...scenario}, index.definition, fixtures).state;
const at = (seat, zone, ...cards) => ({seat, zone, cards});

/* A spell of Rob's on the stack, Rob holding priority: with only plain mana at hand there is nothing to do; a card in hand
   whose mana ability exiles it, or a land that exerts for mana, is a play (rules/actions.mjs, plainMana). */
const responding = (...extra) => run({setup: [at(0, "hand", "Pyretic Ritual", ...extra.filter((c) => c === "Simian Spirit Guide")),
  at(0, "battlefield", "Mountain", "Wastes", "Mountain", ...extra.filter((c) => c !== "Simian Spirit Guide"))],
  steps: [{tap: "Mountain"}, {tap: "Wastes"}, {cast: "Pyretic Ritual"}]});
check("plain mana only: nothing to do in response", () => {
  const s = responding();
  assert.equal(s.stack.length, 1);
  assert.equal(nothingToDo(s, 0, legalActions(s, 0), {stack: true}), true);
});
check("Simian Spirit Guide in hand: a play", () => {
  const s = responding("Simian Spirit Guide");
  assert(legalActions(s, 0).some((a) => a.kind === "activate-mana" && a.label === "Simian Spirit Guide"));
  assert.equal(nothingToDo(s, 0, legalActions(s, 0), {stack: true}), false);
});
/* Arena's exert costs {R}: with {R} floating it is offered, and is a play; the same board without it is not. */
const floating = (...extra) => run({setup: [at(0, "hand", "Pyretic Ritual"), at(0, "battlefield", "Mountain", "Wastes", "Mountain", ...extra)],
  steps: [{tap: "Mountain"}, {tap: "Wastes"}, {cast: "Pyretic Ritual"}, {tap: "Mountain"}]});
check("{R} floating, no Arena: nothing to do", () => {
  const s = floating();
  assert.equal(nothingToDo(s, 0, legalActions(s, 0), {stack: true}), true);
});
check("Arena of Glory's exert: a play", () => {
  const s = floating("Arena of Glory");
  assert(legalActions(s, 0).some((a) => a.kind === "activate-mana" && a.label === "Arena of Glory" && a.mana.R === 2));
  assert.equal(nothingToDo(s, 0, legalActions(s, 0), {stack: true}), false);
});

/* Spinerock Knoll's count: 6 combat and 1 noncombat to Maya on turn 3, read then, for her ("that player" and "you"), and on
   turn 5, after the turn began again (rules/turn.mjs). */
const DAMAGE = {library: ["Wastes", "Wastes"], setup: [at(0, "battlefield", "Giant", "Mountain", "Wastes", "Wastes", "Shivan Gorge")],
  steps: [{to: {turn: 3, phase: "MAIN1"}}, {attack: ["Giant"]}, {to: {turn: 3, phase: "MAIN2"}}, {tap: "Mountain"}, {tap: "Wastes"}, {tap: "Wastes"},
    {activate: "Shivan Gorge"}, {resolve: true}]};
const GIANT = {Giant: {types: ["Creature"], subtypes: ["Giant"], manaCost: "{5}", colors: ["R"], power: 6, toughness: 6}};
check("damage dealt this turn: combat and noncombat, an opponent's and a player's own", () => {
  const s = run(DAMAGE, GIANT);
  assert.equal(s.players[1].life, 33);
  assert.equal(amountOf(s, {damageTakenThisTurn: "an opponent"}, {controller: 0}), 7);
  assert.equal(amountOf(s, {damageTakenThisTurn: "you"}, {controller: 1}), 7);
  assert.equal(amountOf(s, {damageTakenThisTurn: "you"}, {controller: 0}), 0);
});
check("damage dealt this turn: none on a later turn", () => {
  const s = run({...DAMAGE, steps: [...DAMAGE.steps, {to: {turn: 5, phase: "MAIN1"}}]}, GIANT);
  assert.equal(amountOf(s, {damageTakenThisTurn: "an opponent"}, {controller: 0}), 0);
});
check("damageTakenThisTurn names a player", () => {
  assert.deepEqual(amountProblems({damageTakenThisTurn: "an opponent"}), []);
  assert.notDeepEqual(amountProblems({damageTakenThisTurn: "everyone"}), []);
});

/* Two opponents, each with an Opposition Agent: the later one's controller makes Rob's search (CR 613.7). */
check("two Opposition Agents: the latest controls the search", () => {
  const s = run({seats: 3, library: ["Wastes", "Wastes", "Mountain"], setup: [at(0, "battlefield", "Prismatic Vista"), at(1, "battlefield", "Opposition Agent"), at(2, "battlefield", "Opposition Agent")],
    steps: [{activate: "Prismatic Vista"}, {resolve: true}]});
  const agents = s.zones.battlefield.filter((id) => s.objects[id].card === "Opposition Agent");
  const latest = agents.reduce((a, b) => (s.objects[a].timestamp > s.objects[b].timestamp ? a : b));
  assert.equal(searchController(s, 0), latest);
  assert.equal(s.awaiting.player, s.objects[latest].controller);
  assert.equal(s.awaiting.searcher, 0);
  assert.equal(searchController(s, s.objects[latest].controller), agents.find((id) => id !== latest));
});

/* A choice that is no search of a library is still its player's: Guildless Commons's "return a land you control". */
check("an Opposition Agent takes over only a library's search", () => {
  const s = run({setup: [at(0, "hand", "Guildless Commons"), at(0, "battlefield", "Wastes"), at(1, "battlefield", "Opposition Agent")],
    steps: [{play: "Guildless Commons"}, {resolve: true}]});
  assert.equal(s.awaiting?.effect, "chooseCard");
  assert.equal(s.awaiting.player, 0);
  assert.equal(s.awaiting.searcher, undefined);
});

console.log(`engine-lands-and-mana: ${checks} checks passed -- mana that changes the board is a play, damage dealt this turn, and two Opposition Agents`);
