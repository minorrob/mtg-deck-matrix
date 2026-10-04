/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* IMPENDING (CR 702.176; Overlord of the Mistmoors), and "UP TO FOUR CARDS WITH DIFFERENT NAMES" (Gifts Ungiven; the
 * live-game plan of 2026-10-04, lane W6).
 *
 * Impending (cards/index.mjs) is four abilities: an alternative cost that marks the spell and the permanent it becomes
 * (rules/actions.mjs, rules/stack.mjs), the permanent entering with N time counters; "not a creature" while it was cast so
 * and has a time counter (layer 4, `removeTypes`, rules/layers.mjs; the condition `impending`); and at its controller's
 * end step, while so, a time counter removed. Cast for its mana cost, it is none of that.
 * `differentNames` (chooseCard, script/effects/asking.mjs): one card of each name offered.
 */
import assert from "node:assert/strict";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {typesOf} from "../game/engine/rules/layers.mjs";
import {awaitingChoice} from "../game/engine/rules/turn.mjs";

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const OM = "Overlord of the Mistmoors";
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const IMP = ["Plains", "Plains", "Wastes", "Wastes"], FULL = ["Plains", "Plains", "Wastes", "Wastes", "Wastes", "Wastes", "Wastes"];
const play = (setup, steps, more = {}) => runScenario({name: "impending", setup, steps, ...more}, index.definition, {}).state;
const idOf = (s, card) => s.zones.battlefield.find((id) => s.objects[id].card === card);
const cast = (lands, alternative) => [...lands.map((l) => ({tap: l})), {cast: OM, alternative}, {resolve: true}, {resolve: true}];

{
  const s = play([at(0, "battlefield", ...IMP), at(0, "hand", OM)], cast(IMP, 0));
  const overlord = idOf(s, OM);
  eq([typesOf(s, overlord), s.objects[overlord].impending, s.objects[overlord].counters.time], [["Enchantment"], true, 4], "impending: an enchantment, not a creature, with four time counters");
  s.objects[overlord].counters.time = 0;
  eq(typesOf(s, overlord), ["Enchantment", "Creature"], "the last counter gone: a creature");
  const t = play([at(0, "battlefield", ...FULL), at(0, "hand", OM)], cast(FULL, false));
  eq([typesOf(t, idOf(t, OM)), t.objects[idOf(t, OM)].impending ?? false], [["Enchantment", "Creature"], false], "cast for its mana cost: a creature, never impending");
  t.objects[idOf(t, OM)].counters.time = 2;
  eq(typesOf(t, idOf(t, OM)), ["Enchantment", "Creature"], "and a time counter put on it some other way: still a creature, its impending cost never paid");
  const {conditionProblems} = await import("../game/engine/script/condition.mjs");
  eq(conditionProblems({impending: "yes"}), ["impending is true or false"], "the condition is true or false");
  const u = play([at(0, "battlefield", ...IMP), at(0, "hand", OM)], [...cast(IMP, 0), {to: {turn: 2, phase: "MAIN2"}}]);
  eq(u.objects[idOf(u, OM)].counters.time, 3, "Rob's end step: three; Maya's turn removes none");
  const v = play([at(0, "battlefield", ...FULL), at(0, "hand", OM)], [...cast(FULL, false), {to: {turn: 2, phase: "MAIN1"}}]);
  eq([v.stack.length, v.objects[idOf(v, OM)].counters.time ?? 0], [0, 0], "cast for its mana cost: no end-step trigger");
}
{
  const s = play([at(0, "battlefield", "Island", "Wastes", "Wastes", "Wastes"), at(0, "hand", "Gifts Ungiven")],
    [{tap: "Island"}, {tap: "Wastes"}, {tap: "Wastes"}, {tap: "Wastes"}, {cast: "Gifts Ungiven", targets: [{player: 1}]}, {resolve: true}], {library: ["Island", "Island", "Island"]});
  eq(awaitingChoice(s).options.map((o) => o.label), ["Island", "Wastes"], "three Islands and Wastes: one Island and one Wastes offered");
}

console.log(`engine-impending: ${checks} checks passed -- impending: time counters, not a creature while it has one, one removed at its controller's end step; for its mana cost, none of it; different names.`);
