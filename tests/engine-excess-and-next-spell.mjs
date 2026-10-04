/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* EXCESS DAMAGE, AND "THE NEXT SPELL YOU CAST THIS TURN CAN'T BE COUNTERED" (Violent Echoes, Theorist's Proxy; the
 * live-game plan of 2026-10-04, lane W5). And "return target spell or creature to its owner's hand" (Fatehold Charm),
 * which needed nothing new: an effect that moves a spell takes it off the stack (effects/zones.mjs, moveOne).
 *
 * Excess damage (CR 120.4a; script/effects/resources.mjs, dealDamage): past lethal to a creature, its damage marked
 * counted, and from a source with deathtouch anything past 1 (702.2c); past its loyalty to a planeswalker; the greater
 * for one that is both. Read before the damage is dealt and kept in the resolution (`excessDamage`), for an amount
 * (script/amount.mjs) and a condition (script/condition.mjs, script/resolution.mjs) after it.
 *
 * The next spell (rules/actions.mjs): an effect of its caster's (`rule: "next-spell-uncounterable"`), used up by the first
 * spell they cast after it, which can't be countered (rules/statics.mjs, cantBeCountered); another player's spell is not
 * theirs, and the effect ends with the turn.
 */
import assert from "node:assert/strict";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {runEffect} from "../game/engine/script/effects/index.mjs";
import {amountOf} from "../game/engine/script/amount.mjs";
import {conditionHolds} from "../game/engine/script/condition.mjs";
import {cantBeCountered} from "../game/engine/rules/statics.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const FIX = {
  Bear: {types: ["Creature"], subtypes: ["Bear"], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2},
  Wall: {types: ["Creature"], subtypes: ["Wall"], manaCost: "{1}{W}", colors: ["W"], power: 0, toughness: 5},
  Walker: {types: ["Planeswalker"], subtypes: ["Ajani"], manaCost: "{2}{W}", colors: ["W"], loyalty: 4},
  /* A creature that is a planeswalker too: 3 toughness, 6 loyalty. */
  Both: {types: ["Creature", "Planeswalker"], subtypes: ["Ajani"], manaCost: "{2}{W}", colors: ["W"], power: 3, toughness: 3, loyalty: 6},
};
const play = (setup, steps = []) => runScenario({name: "excess", setup, steps}, index.definition, FIX).state;
const idOf = (s, card, seat = null) => s.zones.battlefield.find((id) => s.objects[id].card === card && (seat === null || s.objects[id].controller === seat));
/* `amount` damage from `source` (or none) to the card named; the excess the resolution would keep. */
function excess(setup, card, amount, {source = null, marked = 0} = {}) {
  const s = play(setup);
  const target = idOf(s, card);
  s.objects[target].damage = marked;
  const context = {controller: 0, source: source ? idOf(s, source) : null};
  runEffect(s, {effect: "dealDamage", amount, targets: [target]}, context);
  return context.excessDamage ?? 0;
}

/* ---- excess damage ---- */
eq(excess([at(1, "battlefield", "Bear")], "Bear", 6), 4, "6 to a 2/2: 4 past lethal");
eq(excess([at(1, "battlefield", "Bear")], "Bear", 2), 0, "exactly lethal: none");
eq(excess([at(1, "battlefield", "Wall")], "Wall", 6, {marked: 3}), 4, "a 0/5 with 3 damage marked: lethal is 2, so 4");
eq(excess([at(1, "battlefield", "Wall"), at(0, "battlefield", "Arcane Amphisbaena")], "Wall", 4, {source: "Arcane Amphisbaena"}), 3, "from a source with deathtouch: anything past 1 (CR 702.2c)");
eq(excess([at(1, "battlefield", "Walker")], "Walker", 6), 2, "a planeswalker at 4: 2 past its loyalty");
eq(excess([at(1, "battlefield", "Both")], "Both", 7), 4, "a creature planeswalker, 3 toughness and 6 loyalty: the greater, 4");
{
  const s = play([at(1, "battlefield", "Bear", "Wall")]);
  const context = {controller: 0, source: null};
  runEffect(s, {effect: "dealDamage", amount: 5, targets: [idOf(s, "Bear"), idOf(s, "Wall")]}, context);
  eq(context.excessDamage, 3, "5 to a 2/2 and a 0/5 at once: 3 and none");
  eq([amountOf(s, {excessDamage: true}, context), conditionHolds(s, {compare: {count: {excessDamage: true}, atLeast: 1}}, {controller: 0, excessDamage: 3}),
    conditionHolds(s, {compare: {count: {excessDamage: true}, atLeast: 1}}, {controller: 0})], [3, true, false], "counted as an amount, and asked by a condition");
}

/* ---- the next spell ---- */
const PROXY = "Theorist's Proxy";
const SAC = [{tap: "Island"}, {activate: PROXY}, {resolve: true}];
{
  const s = play([at(0, "battlefield", PROXY, "Island")], SAC);
  eq((s.effects ?? []).filter((e) => e.rule === "next-spell-uncounterable").map((e) => e.sourceController), [0], "sacrificed: an effect of Rob's");
  const t = play([at(0, "battlefield", PROXY, "Island", "Forest", "Wastes"), at(0, "hand", "Bear")], [...SAC, {tap: "Forest"}, {tap: "Wastes"}, {cast: "Bear"}]);
  const spell = t.stack[t.stack.length - 1].objectId;
  eq([cantBeCountered(t, spell), (t.effects ?? []).some((e) => e.rule === "next-spell-uncounterable")], [true, false], "Rob's Bear can't be countered, and the effect is used up");
  const u = play([at(0, "battlefield", PROXY, "Island"), at(1, "battlefield", "Forest", "Wastes"), at(1, "hand", "Bear")],
    [...SAC, {pass: 1}, {to: {turn: 2, phase: "MAIN1"}}]);
  eq((u.effects ?? []).filter((e) => e.rule === "next-spell-uncounterable").length, 0, "unused, it ends with the turn");
  const v = play([at(0, "battlefield", PROXY, "Island"), at(1, "battlefield", "Plains", "Island"), at(1, "hand", "Fatehold Charm")],
    [...SAC, {pass: 1}, {tap: "Plains", seat: 1}, {tap: "Island", seat: 1}, {cast: "Fatehold Charm", seat: 1, modes: [2]}]);
  eq([cantBeCountered(v, v.stack[v.stack.length - 1].objectId), (v.effects ?? []).some((e) => e.rule === "next-spell-uncounterable")], [false, true],
    "Maya's instant, cast after it: counterable, and Rob's effect still waits for Rob's next spell");
}

/* ---- a spell returned to its owner's hand ---- */
{
  const s = play([at(0, "battlefield", "Plains", "Island"), at(0, "hand", "Fatehold Charm"), at(1, "battlefield", "Forest", "Wastes"), at(1, "hand", "Bear")],
    [{pass: 1}, {to: {turn: 2, phase: "MAIN1"}}, {tap: "Forest", seat: 1}, {tap: "Wastes", seat: 1}, {cast: "Bear", seat: 1}, {pass: 1},
     {tap: "Plains", seat: 0}, {tap: "Island", seat: 0}, {cast: "Fatehold Charm", seat: 0, modes: [1], targets: [{card: "Bear"}]}, {resolve: true}]);
  eq([s.stack.length, s.zones.hand[1].map((id) => s.objects[id].card).filter((n) => n === "Bear")], [0, ["Bear"]], "Maya's Bear spell, answered on Maya's turn: back in Maya's hand, and off the stack");
}
for (const name of ["Violent Echoes", PROXY, "Fatehold Charm"]) ok(index.resolve(name)?.playable === true, `${name} is defined and playable`);

console.log(`engine-excess-and-next-spell: ${checks} checks passed -- excess damage past lethal, marked damage and deathtouch counted, past loyalty, the greater of both; the next spell its caster casts can't be countered, used up, for the turn; a spell returned to its owner's hand.`);
