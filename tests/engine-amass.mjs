/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* AMASS (CR 701.47), FOR ROB'S PRIORITY LIST: WHAT THE CARDS' SCENARIOS CANNOT REACH.
 *
 * "Amass Goblins 2": with no Army creature, a 0/0 black Goblin Army creature token is made first; then an Army creature
 * its controller controls is chosen, gets the +1/+1 counters, and is a Goblin as well as what it was (CR 701.47a) -- a
 * type change in layer 4 that lasts as long as the creature does, not a turn. With two or more Armies the choice is its
 * controller's (effects/asking.mjs, amass). A changeling is every creature type, Army among them (CR 702.73a): it is an
 * Army, so no token is made, and it is already a Goblin. "The amassed Army" (CR 701.47c) is the creature chosen, which
 * Goblin Plate Mail attaches itself to, asked or not. And Army is a creature type no card's type line carries, so the
 * creature types are read from the creature tokens cards make as well (game/tools/engine-creature-types.mjs).
 */
import assert from "node:assert/strict";
import {awaitingChoice, resolveAwaiting, advance} from "../game/engine/rules/turn.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {compileSelector} from "../game/engine/script/filter.mjs";
import {validateScript} from "../game/engine/script/schema.mjs";
import {CREATURE_TYPES} from "../game/engine/keywords/creature-types.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const army = (subtype) => ({types: ["Creature"], subtypes: [subtype, "Army"], manaCost: "{B}", colors: ["B"], power: 1, toughness: 1});
const FIX = {"Orc Army": army("Orc"), "Zombie Army": army("Zombie"),
  Shapeshifter: {types: ["Creature"], subtypes: ["Shapeshifter"], keywords: ["Changeling"], manaCost: "{U}", colors: ["U"], power: 1, toughness: 1}};
const play = (name, setup, steps) => runScenario({name, setup, steps}, index.definition, FIX).state;
const named = (s, card) => Object.values(s.objects).filter((o) => o.card === card && o.zone === "battlefield").map((o) => o.id);
const is = (s, id, selector) => compileSelector({what: "permanent", ...selector})(s, id, {controller: 0});
const RAGE = [at(0, "battlefield", "Swamp", "Wastes", "Wastes"), at(0, "hand", "Rage into the Valley")];
const CAST_RAGE = [{tap: "Swamp"}, {tap: "Wastes"}, {tap: "Wastes"}, {cast: "Rage into the Valley"}, {resolve: true}];

/* ---- the token ---- */
{
  /* No Army: a 0/0 black Goblin Army creature token, named for its types (CR 111.4), the counters on it. */
  const s = play("amass, no army", RAGE, CAST_RAGE);
  const [id] = named(s, "Goblin Army"), token = s.objects[id];
  eq([token.token, token.types, token.subtypes, token.colors, token.power, token.toughness, token.counters["+1/+1"]],
    [true, ["Creature"], ["Goblin", "Army"], ["B"], 0, 0, 2], "a 0/0 black Goblin Army creature token, with the two counters on it");
  eq((s.effects ?? []).filter((e) => String(e.id).startsWith("amass:")).length, 0, "already a Goblin: no type change is needed");
}

/* ---- an Army there already: a Goblin as well, for good ---- */
{
  /* Rob's Zombie Army takes the counters, and no token is made. */
  const s = play("amass, a zombie army", [...RAGE, at(0, "battlefield", "Zombie Army")], CAST_RAGE);
  const [id] = named(s, "Zombie Army");
  eq([named(s, "Goblin Army").length, s.objects[id].counters["+1/+1"]], [0, 2], "the counters on the Army there was; no token made");
  eq([is(s, id, {subtypes: ["Goblin"]}), is(s, id, {subtypes: ["Zombie"]}), is(s, id, {subtypes: ["Army"]})], [true, true, true],
    "a Goblin as well as a Zombie and an Army (CR 701.47a, layer 4)");
  /* Not until the end of the turn: the type change lasts as long as the creature does (CR 611.2a). Two turns on: */
  for (let n = 0; n < 400 && s.turn < 3; n += 1) {
    if (s.awaiting) resolveAwaiting(s, awaitingChoice(s).options.slice(0, awaitingChoice(s).min ?? 0).map((o) => o.index));
    else if (s.priorityPlayer === null) advance(s);
    else if (passPriority(s).outcome === "step-ends") advance(s);
  }
  eq([s.turn, is(s, id, {subtypes: ["Goblin"]})], [3, true], "and still a Goblin two turns later");
}

/* ---- a changeling is an Army ---- */
{
  /* CR 702.73a: every creature type, Army among them -- so Rob controls an Army, and none is made. */
  const s = play("amass, a changeling", [...RAGE, at(0, "battlefield", "Shapeshifter")], CAST_RAGE);
  const [id] = named(s, "Shapeshifter");
  eq([named(s, "Goblin Army").length, s.objects[id].counters["+1/+1"]], [0, 2], "the counters on the changeling; no token made");
  eq((s.effects ?? []).filter((e) => String(e.id).startsWith("amass:")).length, 0, "and it is a Goblin already: no type change added");
}

/* ---- two Armies: the controller chooses ---- */
{
  /* The changeling and the Orc Army are both Armies: Rob is asked, each its own option, and must name one. */
  const s = play("amass, two armies", [...RAGE, at(0, "battlefield", "Shapeshifter", "Orc Army")], CAST_RAGE);
  const choice = awaitingChoice(s);
  eq([s.awaiting.player, choice.min, choice.max, choice.options.map((o) => o.label).sort()], [0, 1, 1, ["Orc Army", "Shapeshifter"]],
    "Rob is asked which Army: one of the two");
  assert.throws(() => resolveAwaiting(s, []), /./, "no Army named is refused"); checks += 1;
  const orc = choice.options.find((o) => o.label === "Orc Army");
  resolveAwaiting(s, [orc.index]);
  const [orcId] = named(s, "Orc Army"), [shifter] = named(s, "Shapeshifter");
  eq([s.objects[orcId].counters["+1/+1"], s.objects[shifter].counters["+1/+1"] ?? 0, is(s, orcId, {subtypes: ["Goblin"]})], [2, 0, true],
    "the Orc Army chosen takes both counters and is a Goblin too; the changeling none");
}

/* ---- the amassed Army: remembered, asked or not ---- */
{
  /* Goblin Plate Mail: "amass Goblins 1, then attach this Equipment to the amassed Army" (CR 701.47c). */
  const s = play("plate mail, made", [at(0, "battlefield", "Mountain", "Wastes"), at(0, "hand", "Goblin Plate Mail")],
    [{tap: "Mountain"}, {tap: "Wastes"}, {cast: "Goblin Plate Mail"}, {resolve: true}, {resolve: true}]);
  const [mail] = named(s, "Goblin Plate Mail"), [made] = named(s, "Goblin Army");
  eq(s.objects[mail].attachedTo, made, "attached to the Army it made");
}
{
  const s = play("plate mail, asked", [at(0, "battlefield", "Mountain", "Wastes", "Orc Army", "Zombie Army"), at(0, "hand", "Goblin Plate Mail")],
    [{tap: "Mountain"}, {tap: "Wastes"}, {cast: "Goblin Plate Mail"}, {resolve: true}, {resolve: true}]);
  const zombie = awaitingChoice(s).options.find((o) => o.label === "Zombie Army");
  resolveAwaiting(s, [zombie.index]);
  const [mail] = named(s, "Goblin Plate Mail"), [zombieId] = named(s, "Zombie Army");
  eq([s.objects[mail].attachedTo, named(s, "Goblin Army").length], [zombieId, 0], "attached to the Army Rob chose, and no token made");
}

/* ---- what a definition may say ---- */
{
  const spell = (effect) => ({schema: "CrankCardScript@1", identity: {name: "Test", oracleId: "a1b2", types: ["Sorcery"], subtypes: [], manaCost: "{B}", colors: ["B"], power: null, toughness: null},
    oracleText: "Amass.", source: "hand", abilities: [{kind: "spell", text: "Amass.", effects: [effect]}]});
  const errors = (effect) => validateScript(spell(effect)).errors.map((e) => e.path);
  eq(errors({effect: "amass", subtype: "Goblin", count: 2}), [], "amass Goblins 2");
  eq(errors({effect: "amass", subtype: "Zombie", count: 1, remember: true}), [], "and remembering the Army");
  eq(errors({effect: "amass", count: 2}), ["abilities[0].effects[0].subtype"], "no subtype: refused");
  eq(errors({effect: "amass", subtype: "Forest", count: 2}), ["abilities[0].effects[0].subtype"], "a land type: refused");
  eq(errors({effect: "amass", subtype: "Goblin", count: 2, remember: "yes"}), ["abilities[0].effects[0].remember"], "remember is true or absent");
}

/* ---- Army is a creature type ---- */
{
  /* Read from the creature tokens cards make: Army, Servo and Germ are on no card's type line. A Shrine token is an
     enchantment creature token, and Shrine an enchantment type. */
  eq(["Army", "Servo", "Germ", "Goblin", "Shrine", "Forest"].map((t) => CREATURE_TYPES.includes(t)), [true, true, true, true, false, false],
    "Army, Servo and Germ are creature types; Shrine and Forest are not");
}

console.log(`engine-amass: ${checks} checks passed -- amass (CR 701.47): the Army made or chosen, a Goblin for good, a changeling an Army, the amassed Army remembered.`);
