/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* ROB'S PRIORITY BATCH 10.3, THE FIRST SLICE: WHAT ITS SCENARIOS CANNOT REACH.
 *
 * Twenty-two cards from the front of Rob's list of cards not yet added (2026-10-04), and the four things they needed:
 * - A restriction on blocking (CR 509.1b; Forge's CantBlock): the static `cant-block` (rules/statics.mjs), read where a
 *   blocker is offered (rules/combat.mjs, canBlock). On a creature itself ("This token can't block": White Sun's
 *   Twilight's Mites), on a selector of creatures, or given until end of turn (Clan Guildmage).
 * - "Destroy all OTHER creatures" (Martial Coup, White Sun's Twilight): createToken remembering what it made, destroyAll
 *   sparing it (`except: "remembered"`), under "if X is 5 or more": the X the spell was cast with, read by a counted
 *   comparison (script/condition.mjs).
 * - "Remove all counters from target creature" (Perfect Intimidation): removeCounter's `counter: "all"`.
 * - "Choose one or both" (Perfect Intimidation): a modal spell's `chooseUpTo`, its modes chosen as it is cast (CR 700.2).
 * The scenarios play the cards. A scenario declares no blocks, so this suite holds the blocks, and the edges: the restriction
 * ending with the turn, a Soldier made before the Coup destroyed with the rest, every kind of counter, the three ways to
 * choose, and the definitions the schema refuses.
 */
import assert from "node:assert/strict";
import {addObject} from "../game/engine/state/index.mjs";
import {awaitingChoice, resolveAwaiting, advance} from "../game/engine/rules/turn.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {legalActions, applyAction} from "../game/engine/rules/actions.mjs";
import {validateScript} from "../game/engine/script/schema.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {missingFor} from "../game/tools/engine-constructs.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {createCardIndex} from "../game/engine/cards/index.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const creature = (name, more = {}) => ({types: ["Creature"], subtypes: [name], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2, ...more});
const FIX = {
  Bear: creature("Bear"),
  Bird: creature("Bird", {colors: ["W"], keywords: ["Flying"], power: 1, toughness: 1}),
  /* A Soldier token made before the Coup: another creature, for all its name. */
  Soldier: creature("Soldier", {colors: ["W"], power: 1, toughness: 1, token: true}),
  /* "Creatures your opponents control can't block" -- the restriction on a selector. */
  Bully: creature("Ogre", {abilities: [{id: "a0", kind: "static", text: "Creatures your opponents control can't block.", rule: "cant-block",
    affects: {what: "permanent", types: ["Creature"], controller: "opponent"}}]}),
};
const play = (name, setup, steps, more = {}) => runScenario({name, setup, steps, ...more}, index.definition, FIX).state;
const named = (s, card, zone = "battlefield") => Object.values(s.objects).filter((o) => o.card === card && o.zone === zone);
/* Everyone passing, from where it stands to the question asked of `kind`; null if this turn's combat ends first. */
function toQuestion(s, kind) {
  const turn = s.turn;
  for (let n = 0; n < 80 && s.awaiting?.kind !== kind && s.turn === turn && s.phase !== "MAIN2"; n += 1) {
    if (s.awaiting) throw new Error(`asked ${s.awaiting.kind} before ${kind}`);
    if (s.priorityPlayer === null) advance(s);
    else if (passPriority(s).outcome === "step-ends") advance(s);
  }
  return s.awaiting?.kind === kind ? awaitingChoice(s) : null;
}
/* Rob's action, as offered. */
function resolveOrApply(s, action) {
  if (!action) throw new Error("no such action offered");
  return applyAction(s, 0, action);
}
/* One creature attacking its first defender, then the blockers that defender is offered, by name. */
function blockersAgainst(s, attacker) {
  const declaring = toQuestion(s, "declare-attackers");
  resolveAwaiting(s, [declaring.options.find((o) => o.cardId === attacker).index]);
  const blocking = toQuestion(s, "declare-blockers");
  return [...new Set(blocking.options.map((o) => s.objects[o.cardId].card))].sort();
}

/* ---- can't block ---- */
{
  /* White Sun's Twilight for 2: two Mites that can't block. On Maya's turn her Bear attacks Rob: his Bear is offered, the
     Mites are not. */
  const s = play("mites", [at(0, "battlefield", "Plains", "Plains", "Wastes", "Wastes", "Bear"), at(0, "hand", "White Sun's Twilight"), at(1, "battlefield", "Bear")],
    [{tap: "Plains"}, {tap: "Plains"}, {tap: "Wastes"}, {tap: "Wastes"}, {cast: "White Sun's Twilight", x: 2}, {resolve: true}, {to: {turn: 2, phase: "MAIN1"}}]);
  eq(named(s, "Phyrexian Mite").length, 2, "two Mites");
  eq(blockersAgainst(s, named(s, "Bear").find((o) => o.controller === 1).id), ["Bear"], "Rob's Bear may block Maya's; his Mites may not (CR 509.1b)");
}
{
  /* Clan Guildmage: "Target creature can't block this turn." Maya's Bear can't block on Rob's turn; her Bird can. On his
     next turn the Bear can again: the effect ended with the turn. */
  const s = play("guildmage", [at(0, "battlefield", "Clan Guildmage", "Mountain", "Wastes", "Bear"), at(1, "battlefield", "Bear", "Bird")],
    [{tap: "Mountain"}, {tap: "Wastes"}, {activate: "Clan Guildmage", ability: "a0", targets: [{card: "Bear", seat: 1}]}, {resolve: true}]);
  const robs = named(s, "Bear").find((o) => o.controller === 0).id;
  eq(blockersAgainst(s, robs), ["Bird"], "this turn Maya may block with her Bird, not the Bear");
  const later = play("guildmage, a turn later", [at(0, "battlefield", "Clan Guildmage", "Mountain", "Wastes", "Bear"), at(1, "battlefield", "Bear", "Bird")],
    [{tap: "Mountain"}, {tap: "Wastes"}, {activate: "Clan Guildmage", ability: "a0", targets: [{card: "Bear", seat: 1}]}, {resolve: true}, {to: {turn: 3, phase: "MAIN1"}}]);
  eq(blockersAgainst(later, named(later, "Bear").find((o) => o.controller === 0).id), ["Bear", "Bird"], "on Rob's next turn the Bear may block again");
}
{
  /* On a selector: Rob's Bully keeps Maya's creatures from blocking -- every one of them -- and not his own. */
  const s = play("bully", [at(0, "battlefield", "Bully", "Bear"), at(1, "battlefield", "Bear", "Bird")], []);
  eq(blockersAgainst(s, named(s, "Bear").find((o) => o.controller === 0).id), [], "Maya is asked, and offered no blocker");
  const back = play("bully, Maya's turn", [at(0, "battlefield", "Bully", "Bear"), at(1, "battlefield", "Bear")], [{to: {turn: 2, phase: "MAIN1"}}]);
  eq(blockersAgainst(back, named(back, "Bear").find((o) => o.controller === 1).id), ["Bear", "Bully"], "on Maya's turn Rob's creatures block as ever");
}

/* ---- "destroy all other creatures" ---- */
{
  /* A Soldier token of Rob's from before is another creature: destroyed with the rest. Only the five this Coup made stay --
     spared as the objects it made, not by their name. */
  const LANDS = ["Plains", "Plains", "Wastes", "Wastes", "Wastes", "Wastes", "Wastes"];
  const s = play("an old Soldier", [at(0, "battlefield", ...LANDS, "Soldier"), at(0, "hand", "Martial Coup")],
    [...LANDS.map((tap) => ({tap})), {cast: "Martial Coup", x: 5}, {resolve: true}]);
  eq(named(s, "Soldier").length, 5, "the Soldier made before is destroyed; the five made now stay");
}

/* ---- remove all counters ---- */
{
  /* Every kind, all of each: +1/+1 and oil counters on Maya's creature, gone. */
  const s = play("counters", [at(0, "battlefield", "Swamp", "Wastes", "Wastes", "Wastes"), at(0, "hand", "Perfect Intimidation")], []);
  const target = addObject(s, {...FIX.Bear, card: "Bear", owner: 1, controller: 1}, "battlefield");
  s.objects[target].counters = {"+1/+1": 2, oil: 3};
  for (const name of ["Swamp", "Wastes", "Wastes", "Wastes"]) resolveOrApply(s, legalActions(s, 0).find((a) => a.kind === "activate-mana" && a.label === name && !s.objects[a.objectId].tapped));
  const cast = legalActions(s, 0).find((a) => a.kind === "cast" && a.label === "Perfect Intimidation" && JSON.stringify(a.modes) === "[1]");
  resolveOrApply(s, cast);
  for (let n = 0; n < 10 && s.stack.length; n += 1) passPriority(s);
  eq(s.objects[target].counters, {"+1/+1": 0, oil: 0}, "both kinds removed, all of each");
}

/* ---- choose one or both ---- */
{
  const s = play("one or both", [at(0, "battlefield", "Swamp", "Wastes", "Wastes", "Wastes"), at(0, "hand", "Perfect Intimidation"), at(1, "battlefield", "Bear"), at(1, "hand", "Bird")], []);
  for (const name of ["Swamp", "Wastes", "Wastes", "Wastes"]) resolveOrApply(s, legalActions(s, 0).find((a) => a.kind === "activate-mana" && a.label === name && !s.objects[a.objectId].tapped));
  const ways = [...new Set(legalActions(s, 0).filter((a) => a.kind === "cast" && a.label === "Perfect Intimidation").map((a) => JSON.stringify(a.modes)))].sort();
  eq(ways, ["[0,1]", "[0]", "[1]"], "the first mode, the second, or both: chosen as it is cast");
}
{
  const script = (ability) => ({schema: "CrankCardScript@1", identity: {name: "Test", oracleId: "00000000-0000-4000-8000-000000000000", types: ["Sorcery"], manaCost: "{B}"},
    oracleText: "Choose one or both --", source: "hand", abilities: [ability]});
  const modal = (more = {}) => ({effect: "modal", choose: 1, chooseUpTo: 2, modes: [{text: "a", targets: [], effects: [{effect: "draw", count: 1}]}, {text: "b", targets: [], effects: [{effect: "gainLife", amount: 1}]}], ...more});
  ok(validateScript(script({kind: "spell", text: "Choose one or both --", effects: [modal()]})).valid, "a spell whose one effect is the modal may say \"one or both\"");
  ok(!validateScript(script({kind: "spell", text: "Choose one or both --", effects: [modal(), {effect: "draw", count: 1}]})).valid, "not with another effect beside it");
  ok(!validateScript(script({kind: "triggered", text: "When this enters, choose one or both --", trigger: {on: "enters", who: "self"}, effects: [modal()]})).valid,
    "nor on a triggered ability, where the modal is asked as it resolves");
  ok(!validateScript(script({kind: "spell", text: "Choose one --", effects: [modal({chooseUpTo: 1})]})).valid, "and chooseUpTo is more than choose");
  /* Modes with no targets are chosen as it is cast too: "one or both" is never asked as it resolves, as one. */
  const untargeted = createCardIndex([script({kind: "spell", text: "Choose one or both --", effects: [modal()]})]).definition("Test");
  eq([untargeted?.spell?.modal?.choose, untargeted?.spell?.modal?.upTo], [1, 2], "a spell whose modes name no target: one or both, chosen as it is cast");
}

/* ---- the schema takes it as a static's rule ---- */
{
  const script = {schema: "CrankCardScript@1", identity: {name: "Test", oracleId: "00000000-0000-4000-8000-000000000000", types: ["Creature"], manaCost: "{B}", power: 2, toughness: 1},
    oracleText: "This creature can't block.", source: "hand", abilities: [{kind: "static", text: "This creature can't block.", rule: "cant-block", affects: {self: true}}]};
  ok(validateScript(script).valid, "\"This creature can't block\" (Bloodghast, Gravecrawler) is a static the schema takes: cant-block");
}

/* ---- the catalog ---- */
eq(missingFor({statics: ["CantBlock"]}), [], "the catalog credits CantBlock");
for (const name of ["Archon of Cruelty", "Contaminated Landscape", "Perilous Landscape", "Fetid Heath", "Mystic Gate", "Sunken Ruins", "Martial Coup",
  "White Sun's Twilight", "Kher Keep", "Jungle Barrier", "Glider Kids", "Pretending Poxbearers", "Airship Engine Room", "Heirloom Auntie", "Perfect Intimidation",
  "Boldwyr Aggressor", "Boneclub Berserker", "Flame-Chain Mauler", "Flamekin Gildweaver", "Impolite Entrance", "Lavaleaper", "Clan Guildmage"])
  ok(index.resolve(name)?.playable === true, `${name} is defined and playable`);

console.log(`engine-cards-pb1: ${checks} checks passed -- Rob's priority list, its first 22 cards: can't block (on itself, on a selector, for a turn), "destroy all other creatures" if X is 5 or more, every counter removed, "choose one or both".`);
