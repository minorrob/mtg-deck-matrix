/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* COUNTS AMONG PERMANENTS: a power greater than a target's, every color among them as mana, and how many different powers
 * (Fell the Mighty, Faeburrow Elder, Loot, the Nexus).
 *
 * "Destroy all creatures with power greater than target creature's power": a selector's `power.moreThan`, a fact about a
 * target, bound to a number as the resolution begins (script/bind.mjs; CR 608.2h) -- and, unbound, matching nothing
 * (script/filter.mjs). "For each color among permanents you control, add one mana of that color": a mana ability's `among`
 * with `each` -- all of those colors, one offer (rules/actions.mjs, manaAlternatives). "One mana of that color for each
 * different power among creatures you control": the amount `differentPowers` (script/amount.mjs), counted as the ability
 * is activated. The scenarios play the cards; this suite holds four players, the layers, responses and the grammar.
 */
import assert from "node:assert/strict";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {legalActions} from "../game/engine/rules/actions.mjs";
import {compileSelector} from "../game/engine/script/filter.mjs";
import {bindEffect} from "../game/engine/script/bind.mjs";
import {amountOf, amountProblems} from "../game/engine/script/amount.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const FELL = "Fell the Mighty", FAE = "Faeburrow Elder", LOOT = "Loot, the Nexus";
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const creature = (name, more = {}) => ({types: ["Creature"], subtypes: [name], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2, ...more});
const FIX = {
  Bear: creature("Bear"), Elf: creature("Elf", {power: 1, toughness: 1}), Ogre: creature("Ogre", {colors: ["R"], power: 3, toughness: 3}),
  Giant: creature("Giant", {power: 5, toughness: 5}), Titan: creature("Titan", {power: 6, toughness: 6, keywords: ["Indestructible"]}),
  /* Two colors in one permanent: white and blue. */
  Sphinx: creature("Sphinx", {colors: ["W", "U"], manaCost: "{W}{U}", power: 1, toughness: 1}),
  Wall: creature("Wall", {power: 0, toughness: 4}),
};
const play = (setup, steps, more = {}) => runScenario({name: "counts", setup, steps, ...more}, index.definition, FIX).state;
const alive = (s, seat) => Object.values(s.objects).filter((o) => o.zone === "battlefield" && o.controller === seat && (o.types ?? []).includes("Creature")).map((o) => o.card).sort();
const lands = ["Plains", "Wastes", "Wastes", "Wastes", "Wastes"];
const pay = lands.map((land) => ({tap: land}));

/* ---- Fell the Mighty: the target's power as it resolves (CR 608.2h), four players ---- */
{
  const s = play([at(0, "battlefield", ...lands, "Elf"), at(0, "hand", FELL), at(1, "battlefield", "Bear", "Giant"), at(2, "battlefield", "Ogre", "Elf"), at(3, "battlefield", "Titan", "Elf")],
    [...pay, {cast: FELL, targets: [{card: "Elf", seat: 0}]}, {resolve: true}], {seats: 4});
  eq([alive(s, 0), alive(s, 1), alive(s, 2), alive(s, 3)], [["Elf"], [], ["Elf"], ["Elf", "Titan"]],
    "aimed at Rob's 1/1: every greater creature of every player is destroyed -- but the indestructible Titan");
}
{
  /* Rob answers his own Fell the Mighty with Giant Growth on his Elf: a 4/4 as it resolves, so only the 5/5 goes. */
  const s = play([at(0, "battlefield", ...lands, "Forest", "Elf"), at(0, "hand", FELL, "Giant Growth"), at(1, "battlefield", "Bear", "Ogre", "Giant")],
    [...pay, {cast: FELL, targets: [{card: "Elf"}]}, {tap: "Forest"}, {cast: "Giant Growth", targets: [{card: "Elf"}]}, {resolve: true}, {resolve: true}]);
  eq(alive(s, 1), ["Bear", "Ogre"], "the Elf grown to 4/4 in response: only Maya's 5/5 Giant has greater power as it resolves");
}
{
  /* The grammar: `moreThan` a number is "greater than"; unbound, it matches nothing, never everything. */
  const s = play([at(0, "battlefield", "Bear", "Ogre", "Elf")], []);
  const match = (power) => s.zones.battlefield.filter((id) => compileSelector({types: ["Creature"], power})(s, id, {controller: 0})).map((id) => s.objects[id].card).sort();
  eq(match({moreThan: 1}), ["Bear", "Ogre"], "power more than 1: the Bear and the Ogre");
  eq(match({moreThan: 2}), ["Ogre"], "more than 2: the Ogre alone -- not the Bear, at 2");
  eq(match({moreThan: null}), [], "a power nobody knows: nothing");
  eq(match({moreThan: {powerOf: {target: 0}}}), [], "a fact never bound: nothing");
  const effect = {effect: "destroyAll", selector: {types: ["Creature"], power: {moreThan: {powerOf: {target: 0}}}}};
  eq(bindEffect(effect, {facts: [{powerOf: 3}]}).selector.power, {moreThan: 3}, "bound as it resolves: the target's power, 3");
  eq(bindEffect(effect, {facts: [null]}).selector.power, {moreThan: null}, "its target gone: null, which matches nothing");
}

/* ---- Faeburrow Elder: every color among Rob's permanents, through the layers ---- */
{
  const s = play([at(0, "battlefield", FAE, "Sphinx")], []);
  const offers = legalActions(s, 0).filter((a) => a.kind === "activate-mana" && a.label === FAE);
  eq(offers.map((a) => a.mana), [{W: 1, U: 1, G: 1}], "green, white and the Sphinx's white and blue: one offer, {W}{U}{G}, each color once");
}
{
  /* Summoning sick, it is not tapped for mana (CR 302.6); its +1/+1s are there at once. */
  const setup = [at(0, "battlefield", "Sphinx"), {seat: 0, zone: "battlefield", cards: [FAE], sick: true}];
  const s = runScenario({name: "sick", setup, steps: []}, index.definition, FIX).state;
  eq(legalActions(s, 0).some((a) => a.kind === "activate-mana" && a.label === FAE), false, "put onto the battlefield this turn: no mana from it");
  const view = runScenario({name: "sick", setup, steps: [], expect: [{seat: 0, stats: {card: FAE, power: 3, toughness: 3}}]}, index.definition, FIX);
  eq(view.passed.length, 1, "and it is a 3/3 at once: white, blue, green");
}
{
  /* A permanent that loses its color loses what it gave: the Sphinx made colorless until end of turn. */
  const s = play([at(0, "battlefield", FAE, "Sphinx")], []);
  const sphinx = s.zones.battlefield.find((id) => s.objects[id].card === "Sphinx");
  (s.effects ??= []).push({id: "pale", layer: 5, affects: {ids: [sphinx]}, apply: {setColors: []}, until: "end-of-turn", sourceController: 0});
  eq(legalActions(s, 0).filter((a) => a.kind === "activate-mana" && a.label === FAE).map((a) => a.mana), [{W: 1, G: 1}], "the Sphinx made colorless: {W}{G} only");
}

/* ---- Loot, the Nexus: how many different powers, counted as it is activated ---- */
{
  const s = play([at(0, "battlefield", LOOT, "Bear", "Elf", "Wall", "Wall"), at(1, "battlefield", "Giant")], []);
  const yours = {what: "permanent", types: ["Creature"], controller: "you"};
  eq(amountOf(s, {differentPowers: yours}, {controller: 0}), 3, "Rob's powers 2, 2, 1, 0 and 0: three different (0 is a power too)");
  eq(amountOf(s, {differentPowers: yours}, {controller: 1}), 1, "Maya's, counted for Maya: her Giant's 5, one");
  const wall = s.zones.battlefield.find((id) => s.objects[id].card === "Wall");
  s.objects[wall].counters["-1/-1"] = 1;
  eq(amountOf(s, {differentPowers: yours}, {controller: 0}), 4, "one Wall at -1 with a -1/-1 counter: -1 and 0 are two powers -- four");
  const elf = s.zones.battlefield.find((id) => s.objects[id].card === "Elf");
  (s.effects ??= []).push({id: "grow", layer: 7, sublayer: "c", affects: {ids: [elf]}, apply: {power: 1, toughness: 1}, until: "end-of-turn", sourceController: 0});
  eq(amountOf(s, {differentPowers: yours}, {controller: 0}), 3, "the Elf grown to 2 joins Loot and the Bear: 2, 0 and -1, three");
  eq(legalActions(s, 0).filter((a) => a.kind === "activate-mana" && a.label === LOOT).map((a) => a.mana),
    [{W: 3}, {U: 3}, {B: 3}, {R: 3}, {G: 3}], "and Loot offers three mana of each color, the color chosen");
  ok(amountProblems({differentPowers: {types: ["Creature"], strength: 3}}).some((p) => /differentPowers/.test(p)), "the grammar is closed: an unknown selector key is refused");
  eq(amountProblems({differentPowers: yours}), [], "and a selector it knows is fine");
}

console.log(`engine-counts-among: ${checks} checks passed -- power greater than a target's as it resolves (four players, a response, the grammar); every color among permanents as one mana ability; different powers through the layers.`);
