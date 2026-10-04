/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* "IF FIVE OR MORE MANA WAS SPENT TO CAST THAT SPELL" (Rob's Priority Batch 10.3, its fortieth slice: Expressive
 * Firedancer, the 284th card of Rob's list, and Mica, Reader of Ruins, the 288th).
 *
 * `{manaSpent: "that card"}` (script/amount.mjs): every mana spent to cast the spell a trigger is about -- of whatever
 * kind, as the cast recorded it on the spell (rules/actions.mjs; CR 601.2h) -- or `"self"`, its own object's. Mica needed
 * nothing new: "you may sacrifice an artifact. If you do, copy that spell" is a sacrifice that remembers, and a copy.
 *
 * The card scenarios play the cards. This suite holds the count, its schema, and the line between four mana and five.
 */
import assert from "node:assert/strict";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {amountOf, amountProblems} from "../game/engine/script/amount.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const at = (seat, zone, ...cards) => ({seat, zone, cards});

/* ---- the count ---- */
{
  const s = createState({matchId: "m", seed: "spent", players: [{name: "Rob"}, {name: "Maya"}]});
  const blaze = addObject(s, {card: "Blaze", types: ["Sorcery"], owner: 0, controller: 0}, "stack");
  s.objects[blaze].spent = {R: 1, C: 4};
  const free = addObject(s, {card: "Free", types: ["Sorcery"], owner: 0, controller: 0}, "stack");
  const spent = (ref, about) => amountOf(s, {manaSpent: ref}, {controller: 0, source: blaze, about: {card: about}});
  eq([spent("that card", blaze), spent("that card", free), spent("self", free)], [5, 0, 5], "one red and four colorless spent on Blaze: 5; none on a free spell; \"self\", its own");
}
eq([amountProblems({manaSpent: "that card"}), amountProblems({manaSpent: "self"}), amountProblems({manaSpent: "remembered"}).length], [[], [], 1], "the schema: that card or self");

/* ---- four mana, five ---- */
{
  const FIX = {Burst: {types: ["Sorcery"], manaCost: "{3}{R}", colors: ["R"], spell: {id: "s", text: "Burst deals 1 damage to target player.", targets: [{what: "player"}],
    effects: [{effect: "dealDamage", amount: 1, who: {target: 0}}]}}};
  FIX.Burst5 = {...FIX.Burst, manaCost: "{4}{R}"};
  const doubled = (card, wastes) => {
    const s = runScenario({name: "spent", setup: [at(0, "battlefield", "Expressive Firedancer", "Mountain", ...Array(wastes).fill("Wastes")), at(0, "hand", card)],
      steps: [{tap: "Mountain"}, ...Array(wastes).fill({tap: "Wastes"}), {cast: card, targets: [{player: 1}]}, {resolve: true}]}, index.definition, FIX).state;
    const dancer = s.zones.battlefield.find((id) => s.objects[id].card === "Expressive Firedancer");
    return (s.effects ?? []).some((e) => (e.affects?.ids ?? []).includes(dancer) && (e.apply?.addKeywords ?? []).includes("Double Strike"));
  };
  eq([doubled("Burst", 3), doubled("Burst5", 4)], [false, true], "four mana spent: no double strike; five: double strike");
}
for (const name of ["Expressive Firedancer", "Mica, Reader of Ruins"]) ok(index.resolve(name)?.playable === true, `${name} is defined and playable`);

console.log(`engine-mana-spent-on: ${checks} checks passed -- the mana spent to cast that spell, every kind of it, or its own; the schema; four is not five.`);
