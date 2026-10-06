/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* A CLASS (CR 716; Innkeeper's Talent, claude/cards-faces-class).
 *
 * A level bar is two abilities (CR 716.2a): an activated one that sets the Class's level to N, from level N-1 only and at
 * sorcery speed (effects/permanents.mjs, setState; script/condition.mjs, `level`), and one granting the level's abilities
 * while its level is N or more -- each ability of the level marked `level: N`
 * and compiled to that condition, or, a triggered one, a gate as it triggers (cards/index.mjs, classLevel; rules/trigger.mjs).
 * A level is a designation, not copiable (716.2b); a permanent with none is level 1 (716.2d). Innkeeper's Talent's levels:
 * ward {1} for permanents its controller controls with counters on them (a layer-6 grant, rules/layers.mjs `counters`),
 * and its card's doubling of every counter its controller puts on a permanent or player (rules/statics.mjs,
 * countersPlaced and playerCountersPlaced: `putBy`, `players`). What the scenarios cannot reach is here: the compiler's
 * forms and refusals, sorcery timing, a copy and a new object at level 1, the counters a player puts by every route -- a
 * planeswalker entering and its loyalty cost, infect, proliferate -- and another player's not, and ward in a four-player game.
 */
import assert from "node:assert/strict";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {SCRIPT_SCHEMA} from "../game/engine/script/schema.mjs";
import {legalActions, applyAction} from "../game/engine/rules/actions.mjs";
import {keywordBuilt} from "../game/tools/engine-constructs.mjs";
import {runEffect} from "../game/engine/script/effects/index.mjs";
import {keywordsOf} from "../game/engine/rules/layers.mjs";
import {projectFor} from "../game/engine/projection.mjs";
import {historyLines} from "../game/room/history.mjs";
import {validateScript} from "../game/engine/script/schema.mjs";
import {checkFidelity} from "../game/engine/cards/compile.mjs";
import {loadCardScripts} from "../game/tools/engine-cards.mjs";
import {collectTriggers} from "../game/engine/rules/trigger.mjs";
import {advance, awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {createRng} from "../game/engine/rng.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const IT = "Innkeeper's Talent";
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const FIX = {
  Bear: {types: ["Creature"], subtypes: ["Bear"], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2},
  Giant: {types: ["Creature"], subtypes: ["Giant"], manaCost: "{6}{G}", colors: ["G"], power: 9, toughness: 9},
};
const run = (setup, steps = [], seats = 2) => runScenario({name: "class", seats, setup, steps}, index.definition, FIX);
const play = (setup, steps, seats) => run(setup, steps, seats).state;
const idOf = (s, name, seat = 0) => s.zones.battlefield.find((id) => s.objects[id].card === name && s.objects[id].controller === seat);
const levelUps = (s, seat = 0) => legalActions(s, seat).filter((a) => a.kind === "activate" && a.label === IT).map((a) => a.abilityId);
/* The Class at a level, as its own ability would leave it (setState), for the checks that are about what a level does. */
const atLevel = (s, level) => { runEffect(s, {effect: "setState", targets: [idOf(s, IT)], level}, {controller: 0, source: idOf(s, IT)}); return s; };

/* ---- the compiled card, and the compiler's refusals ---- */
{
  const it = index.definition(IT);
  const ward = it.abilities.find((a) => a.kind === "static" && a.layer === 6), more = it.abilities.find((a) => a.rule === "more-counters");
  eq([ward.condition, more.condition, more.putBy, more.players], [{level: {atLeast: 2}}, {level: {atLeast: 3}}, "you", true],
    "each level's ability is had while the Class is that level or more (CR 716.2a): level 2's ward, level 3's doubling");
  eq(it.abilities.filter((a) => a.kind === "activated").map((a) => [a.timing, a.condition]), [["sorcery", {level: {exactly: 1}}], ["sorcery", {level: {exactly: 2}}]],
    "and each level bar is an activated ability: only as a sorcery, only from the level below");
  const probe = (abilities) => compileScript({schema: SCRIPT_SCHEMA, identity: {name: "Probe Class", oracleId: "p", types: ["Enchantment"], subtypes: ["Class"], manaCost: "{1}"}, abilities});
  const gated = probe([{kind: "triggered", text: "Whenever you gain life, draw a card.", level: 2, trigger: {on: "life gained"}, effects: [{effect: "draw"}]}]).definition;
  eq([gated.abilities[0].level, gated.abilities[0].condition], [2, undefined], "a triggered ability at a level is gated as it triggers, never an intervening \"if\" asked again as it resolves");
  for (const [abilities, re, what] of [
    [[{kind: "static", text: "Creatures you control get +1/+1.", level: 1, layer: 7, sublayer: "c", affects: {what: "permanent", types: ["Creature"], controller: "you"}, apply: {power: 1, toughness: 1}}], /level 1 is the Class's own text/, "a level of 1"],
    [[{kind: "replacement", text: "If a creature would die, exile it instead.", level: 2, watches: {event: "dies"}, change: {to: "exile"}}], /replacement ability gained at a Class level is not built/, "a replacement at a level"],
    [[{kind: "static", text: "Creatures you control get +1/+1.", level: 2, layer: 7, sublayer: "c", condition: {level: {atLeast: 3}}, affects: {what: "permanent", types: ["Creature"], controller: "you"}, apply: {power: 1, toughness: 1}}], /its Class level is `level`/, "a level said twice"],
  ]) {
    const {definition, problems} = probe(abilities);
    ok(definition === null && problems.some((p) => re.test(p)), `${what} is refused by name (${problems.join("; ")})`);
  }
}

/* ---- gained as a sorcery: never in combat, with the stack loaded, or in another player's turn ---- */
{
  const s = play([at(0, "battlefield", IT, "Bear", "Forest", "Forest")], [{tap: "Forest"}]);
  eq(levelUps(s), ["a1"], "Rob, in his main phase with an empty stack and {G}: level 2 is offered, level 3 is not (CR 716.2a)");
  const fight = play([at(0, "battlefield", IT, "Bear", "Forest")], [{to: {turn: 1, phase: "COMBAT_BEGIN"}}, {choose: ["Bear"]}, {tap: "Forest"}]);
  eq(levelUps(fight), [], "with its own combat trigger on the stack, at the beginning of combat: not offered");
  const theirs = play([at(0, "battlefield", IT, "Forest"), at(1, "battlefield", "Forest")], [{pass: 1}, {tap: "Forest", seat: 1}]);
  eq(legalActions(theirs, 1).filter((a) => a.label === IT).length, 0, "and Maya cannot gain a level of Rob's Class");
  const stacked = play([at(0, "battlefield", IT, "Forest", "Forest", "Wastes", "Wastes", "Wastes")], [{tap: "Forest"}, {activate: IT, ability: "a1"}, {tap: "Forest"}, {tap: "Wastes"}, {tap: "Wastes"}, {tap: "Wastes"}]);
  eq(levelUps(stacked), [], "level 2 still on the stack: level 3 waits for it to resolve, and for an empty stack");
  const s2 = play([at(0, "battlefield", IT, "Forest")], [{tap: "Forest"}, {activate: IT, ability: "a1"}, {resolve: true}]);
  eq(projectFor(s2, 1).players[0].zones.Battlefield.cards.find((c) => c.name === IT).level, 2, "its level is a designation every seat sees (CR 716.2b)");
  const {events} = run([at(0, "battlefield", IT, "Forest")], [{tap: "Forest"}, {activate: IT, ability: "a1"}, {resolve: true}]);
  eq(events.filter((e) => e.kind === "GameEventCardLevel").flatMap((e) => historyLines(e, ["Rob", "Maya"]).map((l) => l.text)), [`${IT} reached level 2`], "and the table's history says so");
}

/* ---- the level bar on the stack, its Class gone before it resolves: nothing to change ---- */
{
  const s = play([at(0, "battlefield", IT, "Forest")], [{tap: "Forest"}, {activate: IT, ability: "a1"}]);
  runEffect(s, {effect: "moveZone", targets: [idOf(s, IT)], to: "hand"}, {controller: 0, source: null});
  passPriority(s, null, createRng("class")); passPriority(s, null, createRng("class"));
  const [card] = s.zones.hand[0].filter((id) => s.objects[id].card === IT);
  eq([s.stack.length, s.objects[card].level], [0, undefined], "returned to Rob's hand in answer, the Class is a new object: \"its level becomes 2\" changes nothing (CR 400.7)");
  const told = runEffect(s, {effect: "setState", targets: [card], level: 2}, {controller: 0, source: null});
  eq([s.objects[card].level, told.length], [undefined, 0], "and setState told to make that card in his hand level 2: a level is a permanent's designation (CR 716.2b), so nothing, and no event");
}

/* ---- a level is not copiable, and a new object has none (CR 716.2b, 716.2d, 400.7) ---- */
{
  const s = atLevel(play([at(0, "battlefield", IT, "Bear")]), 3);
  runEffect(s, {effect: "copyPermanent", targets: [idOf(s, IT)]}, {controller: 0, source: idOf(s, IT)});
  const copies = s.zones.battlefield.filter((id) => s.objects[id].card === IT && s.objects[id].token);
  eq([copies.length, s.objects[copies[0]].level], [1, undefined], "a token copy of the level-3 Class: a Class with no level, so level 1");
  runEffect(s, {effect: "putCounter", targets: [idOf(s, "Bear")], counter: "+1/+1", count: 1}, {controller: 0, source: null});
  eq(s.objects[idOf(s, "Bear")].counters["+1/+1"], 2, "Rob puts one counter: two -- the original doubles, the level-1 copy does not (four would be both)");
  const back = idOf(s, IT);
  runEffect(s, {effect: "moveZone", targets: [back], to: "hand"}, {controller: 0, source: null});
  const [inHand] = s.zones.hand[0].filter((id) => s.objects[id].card === IT);
  runEffect(s, {effect: "moveZone", targets: [inHand], to: "battlefield"}, {controller: 0, source: null});
  const again = s.zones.battlefield.find((id) => s.objects[id].card === IT && !s.objects[id].token);
  eq(s.objects[again].level, undefined, "returned to the battlefield, it is a new object at level 1 (CR 400.7)");
  runEffect(s, {effect: "putCounter", targets: [idOf(s, "Bear")], counter: "+1/+1", count: 1}, {controller: 0, source: null});
  eq([s.objects[idOf(s, "Bear")].counters["+1/+1"], keywordsOf(s, idOf(s, "Bear")).includes("Ward")], [3, false], "one counter is one now, and the Bear has no ward");
}

/* ---- level 3: every counter Rob puts, by every route -- and none another player puts ---- */
{
  /* A planeswalker entering with loyalty counters: its controller puts them (CR 122.6a). Its +2 is a cost Rob pays. */
  const LEVEL3 =[{tap: "Forest"}, {activate: IT, ability: "a1"}, {resolve: true}, {tap: "Forest"}, {tap: "Wastes"}, {tap: "Wastes"}, {tap: "Wastes"}, {activate: IT, ability: "a3"}, {resolve: true}];
  const s = play([at(0, "battlefield", IT, "Forest", "Forest", "Wastes", "Wastes", "Wastes", "Forest", "Island", "Wastes"), at(0, "hand", "Kasmina, Enigma Sage")],
    [...LEVEL3, {tap: "Forest"}, {tap: "Island"}, {tap: "Wastes"}, {cast: "Kasmina, Enigma Sage"}, {resolve: true}]);
  const kasmina = idOf(s, "Kasmina, Enigma Sage");
  eq(s.objects[kasmina].counters.loyalty, 4, "Rob's Kasmina enters with twice its two loyalty counters: he puts them, its controller as it enters (CR 122.6a)");
  const plus = play([at(0, "battlefield", IT, "Forest", "Forest", "Wastes", "Wastes", "Wastes", "Forest", "Island", "Wastes"), at(0, "hand", "Kasmina, Enigma Sage")],
    [...LEVEL3, {tap: "Forest"}, {tap: "Island"}, {tap: "Wastes"}, {cast: "Kasmina, Enigma Sage"}, {resolve: true}, {activate: "Kasmina, Enigma Sage", ability: "a1"}]);
  eq(plus.objects[idOf(plus, "Kasmina, Enigma Sage")].counters.loyalty, 8, "and its +2, a cost Rob pays by putting counters on it: four more (CR 606.4)");
  const maya = play([at(0, "battlefield", IT, "Forest", "Forest", "Wastes", "Wastes", "Wastes"), at(1, "battlefield", "Forest", "Island", "Wastes"), at(1, "hand", "Kasmina, Enigma Sage")],
    [...LEVEL3, {to: {turn: 2, phase: "MAIN1"}}, {tap: "Forest", seat: 1}, {tap: "Island", seat: 1}, {tap: "Wastes", seat: 1}, {cast: "Kasmina, Enigma Sage", seat: 1}, {resolve: true}]);
  eq(maya.objects[idOf(maya, "Kasmina, Enigma Sage", 1)].counters.loyalty, 2, "Maya's Kasmina enters with two: Maya puts them, not Rob");
}
{
  /* Infect, in combat: the counters its damage makes, put by its controller -- poison on a player, -1/-1 on a creature. */
  const s = atLevel(play([at(0, "battlefield", IT, "Ichor Rats"), at(1, "battlefield", "Giant")]), 3);
  const rats = idOf(s, "Ichor Rats");
  runEffect(s, {effect: "dealDamage", amount: 2, from: [rats], toPlayer: 1}, {controller: 0, source: rats});
  runEffect(s, {effect: "dealDamage", amount: 2, from: [rats], targets: [idOf(s, "Giant", 1)]}, {controller: 0, source: rats});
  eq([s.players[1].poison, s.objects[idOf(s, "Giant", 1)].counters["-1/-1"]], [4, 4], "2 infect damage to Maya and to her Giant: four poison counters, four -1/-1 counters");
  /* In combat: Rob's Rats attack Maya, unblocked -- the level reached by its own abilities first. */
  const c = play([at(0, "battlefield", IT, "Ichor Rats", "Forest", "Forest", "Wastes", "Wastes", "Wastes")],
    [{tap: "Forest"}, {activate: IT, ability: "a1"}, {resolve: true}, {tap: "Forest"}, {tap: "Wastes"}, {tap: "Wastes"}, {tap: "Wastes"}, {activate: IT, ability: "a3"}, {resolve: true},
      {to: {turn: 1, phase: "COMBAT_BEGIN"}}, {choose: ["Ichor Rats"]}, {resolve: true}, {attack: ["Ichor Rats"]}, {to: {turn: 1, phase: "MAIN2"}}]);
  eq(c.players[1].poison, 8, "its trigger's one +1/+1 counter is two on the Rats, and their 4 combat damage with infect eight poison counters on Maya");
}
{
  /* "Each opponent gets a poison counter": the effect's controller puts them. */
  const s = atLevel(play([at(0, "battlefield", IT, "Ichor Rats")]), 3);
  const rats = idOf(s, "Ichor Rats");
  runEffect(s, {effect: "poison", who: "opponent", count: 1}, {controller: 0, source: rats});
  eq(s.players[1].poison, 2, "\"each opponent gets a poison counter\", Rob's effect: two");
  runEffect(s, {effect: "poison", who: "opponent", count: 1}, {controller: 1, source: null});
  eq(s.players[0].poison, 1, "the same effect Maya controls, on Rob: one -- she puts it");
}
{
  /* Proliferate (CR 701.34a): the proliferating player puts each counter -- two of each for Rob, on Maya and on her Giant. */
  const s = atLevel(play([at(0, "battlefield", IT), at(1, "battlefield", "Giant")]), 3);
  s.players[1].poison = 1;
  s.objects[idOf(s, "Giant", 1)].counters["-1/-1"] = 1;
  runEffect(s, {effect: "proliferate", chosen: [{player: 1}, idOf(s, "Giant", 1)]}, {controller: 0, source: null});
  eq([s.players[1].poison, s.objects[idOf(s, "Giant", 1)].counters["-1/-1"]], [3, 3], "Rob proliferates: Maya's one poison counter becomes three, her Giant's one -1/-1 counter three");
  runEffect(s, {effect: "proliferate", chosen: [{player: 1}, idOf(s, "Giant", 1)]}, {controller: 1, source: null});
  eq([s.players[1].poison, s.objects[idOf(s, "Giant", 1)].counters["-1/-1"]], [4, 4], "Maya proliferates the same: one more of each");
  runEffect(s, {effect: "putCounter", targets: [idOf(s, "Giant", 1)], counter: "-1/-1", count: 1}, {controller: 1, source: null});
  eq(s.objects[idOf(s, "Giant", 1)].counters["-1/-1"], 5, "and her own counter on her own creature, one");
}

/* ---- the rest of the routes by which Rob puts counters, each doubled at level 3 ---- */
{
  const s = atLevel(play([at(0, "battlefield", IT, "Bear", "Forest"), at(1, "battlefield", "Giant")]), 3);
  runEffect(s, {effect: "putCounterAll", selector: {what: "permanent", types: ["Creature"]}, counter: "+1/+1", count: 1}, {controller: 0, source: null});
  eq([s.objects[idOf(s, "Bear")].counters["+1/+1"], s.objects[idOf(s, "Giant", 1)].counters["+1/+1"]], [2, 2], "a counter on each creature, Rob's effect: two on each, his and Maya's");
  s.players[1].poison = 1;
  runEffect(s, {effect: "multiplyCounters", targets: [idOf(s, "Bear")], who: [1]}, {controller: 0, source: null});
  eq([s.objects[idOf(s, "Bear")].counters["+1/+1"], s.players[1].poison], [6, 3], "\"double the counters\" is putting that many more (CR 122.1): four more on the Bear, two more poison on Maya");
  runEffect(s, {effect: "earthbend", targets: [idOf(s, "Forest")], count: 2}, {controller: 0, source: null});
  eq(s.objects[idOf(s, "Forest")].counters["+1/+1"], 4, "earthbend 2: four +1/+1 counters on the Forest");
  s.players[1].counters.experience = 1;
  runEffect(s, {effect: "proliferate", chosen: [{player: 1}]}, {controller: 0, source: null});
  eq(s.players[1].counters.experience, 3, "Rob proliferates Maya's one experience counter: two more (CR 701.34a)");
  const roots = atLevel(play([at(0, "battlefield", IT, "Wall of Roots")]), 3);
  applyAction(roots, 0, legalActions(roots, 0).find((a) => a.kind === "activate-mana" && a.label === "Wall of Roots"));
  eq(roots.objects[idOf(roots, "Wall of Roots")].counters["-0/-1"], 2, "Wall of Roots' cost, a -0/-1 counter Rob puts on it: two");
  const branching = play([at(0, "battlefield", "Branching Evolution")]);
  runEffect(branching, {effect: "poison", who: "opponent", count: 1}, {controller: 0, source: null});
  eq(branching.players[1].poison, 1, "\"twice that many\" for a creature's counters (Branching Evolution) is not for a player's: one poison counter");
  /* The same ability for counters of any kind ("if one or more counters would be put on a creature you control"): still a
   * permanent's only -- a player's counters are doubled only by an ability that says "or player" (`players`). */
  const anyKind = play([at(0, "battlefield", "Branching Evolution", "Bear")]);
  const evolution = anyKind.objects[idOf(anyKind, "Branching Evolution")];
  evolution.abilities = evolution.abilities.map((ability) => { if (ability.rule !== "more-counters") return ability; const {counter, ...anyCounter} = ability; void counter; return anyCounter; });
  runEffect(anyKind, {effect: "poison", who: "opponent", count: 1}, {controller: 0, source: null});
  runEffect(anyKind, {effect: "putCounter", targets: [idOf(anyKind, "Bear")], counter: "shield", count: 1}, {controller: 0, source: null});
  eq([anyKind.players[1].poison, anyKind.objects[idOf(anyKind, "Bear")].counters.shield], [1, 2], "for counters of any kind: a shield counter on Rob's Bear is two, a poison counter on Maya one");
}
{
  /* Counters it enters with, by its controller (CR 122.6a): Burdened Stoneback's two -1/-1 are four, and the 4/4 dies. */
  const LEVEL3 = [{tap: "Forest"}, {activate: IT, ability: "a1"}, {resolve: true}, {tap: "Forest"}, {tap: "Wastes"}, {tap: "Wastes"}, {tap: "Wastes"}, {activate: IT, ability: "a3"}, {resolve: true}];
  const lands = ["Forest", "Forest", "Wastes", "Wastes", "Wastes"];
  const cast = play([at(0, "battlefield", IT, ...lands, "Plains", "Wastes"), at(0, "hand", "Burdened Stoneback")], [...LEVEL3, {tap: "Plains"}, {tap: "Wastes"}, {cast: "Burdened Stoneback"}, {resolve: true}]);
  eq(cast.zones.graveyard[0].map((id) => cast.objects[id].card), ["Burdened Stoneback"], "cast by Rob: it enters with four -1/-1 counters, 0/0, and dies");
  const put = atLevel(play([at(0, "battlefield", IT), at(0, "hand", "Burdened Stoneback")]), 3);
  runEffect(put, {effect: "moveZone", targets: [put.zones.hand[0][0]], to: "battlefield"}, {controller: 0, source: null});
  eq(put.objects[idOf(put, "Burdened Stoneback")].counters["-1/-1"], 4, "put onto the battlefield by an effect: four, its controller putting them");
  const back = atLevel(play([at(0, "battlefield", IT), at(0, "graveyard", "Bear")]), 3);
  runEffect(back, {effect: "moveZone", targets: [back.zones.graveyard[0][0]], to: "battlefield", withCounter: "+1/+1"}, {controller: 0, source: null});
  eq(back.objects[idOf(back, "Bear")].counters["+1/+1"], 2, "returned \"with a +1/+1 counter on it\": two");
  const copy = play([at(0, "battlefield", IT, ...lands, "Island", "Island", "Wastes", "Wastes"), at(0, "hand", "Clever Impersonator"), at(1, "battlefield", "Burdened Stoneback")],
    [...LEVEL3, {tap: "Island"}, {tap: "Island"}, {tap: "Wastes"}, {tap: "Wastes"}, {cast: "Clever Impersonator"}, {resolve: true}, {choose: ["Burdened Stoneback"]}]);
  eq(copy.zones.graveyard[0].map((id) => copy.objects[id].card), ["Clever Impersonator"], "entering as a copy of Maya's Stoneback, Rob's Impersonator has its own entering doubled: four -1/-1, and it dies");
  const amass = play([at(0, "battlefield", IT, ...lands), at(0, "hand", "Dreadhorde Invasion"), at(0, "battlefield", "Swamp", "Wastes")],
    [...LEVEL3, {tap: "Swamp"}, {tap: "Wastes"}, {cast: "Dreadhorde Invasion"}, {resolve: true}, {to: {turn: 3, phase: "UPKEEP"}}, {resolve: true}]);
  const army = amass.zones.battlefield.find((id) => (amass.objects[id].subtypes ?? []).includes("Army"));
  eq(amass.objects[army].counters["+1/+1"], 2, "amass Zombies 1 at Rob's upkeep: the Army's one counter is two");
  const pending = play([at(0, "battlefield", IT, ...lands, "Plains", "Plains", "Wastes", "Wastes"), at(0, "hand", "Overlord of the Mistmoors")],
    [...LEVEL3, {tap: "Plains"}, {tap: "Plains"}, {tap: "Wastes"}, {tap: "Wastes"}, {cast: "Overlord of the Mistmoors", alternative: 0}, {resolve: true}]);
  eq(pending.objects[idOf(pending, "Overlord of the Mistmoors")].counters.time, 8, "cast for its impending cost: eight time counters, not four");
}
{
  /* Combat: toxic's poison, and infect's -1/-1 counters on a blocker -- the attacker's controller putting them. */
  const FIGHT = {...FIX, Stinger: {types: ["Creature"], manaCost: "{1}", colors: [], power: 1, toughness: 1, keywords: ["Toxic"],
    abilities: [{id: "toxic", kind: "static", rule: "toxic", amount: 1, affects: {what: "permanent", self: true}}]}};
  const {state: t} = runScenario({name: "class", setup: [at(0, "battlefield", IT, "Stinger", "Forest", "Forest", "Wastes", "Wastes", "Wastes")],
    steps: [{tap: "Forest"}, {activate: IT, ability: "a1"}, {resolve: true}, {tap: "Forest"}, {tap: "Wastes"}, {tap: "Wastes"}, {tap: "Wastes"}, {activate: IT, ability: "a3"}, {resolve: true},
      {to: {turn: 1, phase: "COMBAT_BEGIN"}}, {choose: ["Stinger"]}, {resolve: true}, {attack: ["Stinger"]}, {to: {turn: 1, phase: "MAIN2"}}]}, index.definition, FIGHT);
  eq([t.players[1].poison, t.players[1].life], [2, 37], "Rob's toxic 1 Stinger, 3/3 with its two counters: 3 damage, and two poison counters, not one");
  const {state: c} = runScenario({name: "class", setup: [at(0, "battlefield", IT, "Ichor Rats"), at(1, "battlefield", "Giant")],
    steps: [{to: {turn: 1, phase: "COMBAT_BEGIN"}}, {choose: ["Ichor Rats"]}, {resolve: true}, {attack: ["Ichor Rats"]}]}, index.definition, FIX);
  atLevel(c, 3);
  for (let n = 0; n < 20 && c.awaiting?.kind !== "declare-blockers"; n += 1) { if (c.awaiting) break; if (c.priorityPlayer === null) advance(c); else if (passPriority(c, null, createRng("class")).outcome === "step-ends") advance(c); }
  const block = awaitingChoice(c).options.find((o) => o.label.startsWith("Giant blocks"));
  resolveAwaiting(c, [block.index]);
  for (let n = 0; n < 20 && c.phase !== "COMBAT_END" && c.phase !== "MAIN2"; n += 1) { if (c.awaiting) resolveAwaiting(c, awaitingChoice(c).options.slice(0, awaitingChoice(c).min ?? 0).map((o) => o.index)); else if (c.priorityPlayer === null) advance(c); else if (passPriority(c, null, createRng("class")).outcome === "step-ends") advance(c); }
  eq(c.objects[idOf(c, "Giant", 1)].counters["-1/-1"], 6, "Rob's 3/2 Rats (a counter from level 1's trigger) blocked by Maya's Giant at level 3: 3 infect damage, six -1/-1 counters on it");
}

/* ---- a level's triggered abilities, had only at that level -- as the event happens, and as the permanent last was ---- */
{
  const PROBE = "Probe Class";
  const script = {schema: SCRIPT_SCHEMA, identity: {name: PROBE, oracleId: "probe-class", types: ["Enchantment"], subtypes: ["Class"], manaCost: "{1}"},
    abilities: [{kind: "triggered", text: "Whenever you gain life, draw a card.", level: 2, trigger: {on: "life gained"}, effects: [{effect: "draw"}]},
      {kind: "triggered", text: "When this Class leaves the battlefield, draw a card.", level: 2, trigger: {on: "leaves", who: "self"}, effects: [{effect: "draw"}]}]};
  const probe = compileScript(script).definition;
  const cards = (name) => (name === PROBE ? structuredClone(probe) : index.definition(name));
  const fresh = () => runScenario({name: "class", setup: [at(0, "battlefield", PROBE)], steps: []}, cards, FIX).state;
  const gain = (s) => { const events = runEffect(s, {effect: "gainLife", amount: 1}, {controller: 0, source: null}); collectTriggers(s, events); return (s.pendingTriggers ?? []).length; };
  const leave = (s) => { const id = s.zones.battlefield.find((x) => s.objects[x].card === PROBE); const events = runEffect(s, {effect: "moveZone", targets: [id], to: "hand"}, {controller: 0, source: null}); collectTriggers(s, events); return (s.pendingTriggers ?? []).length; };
  const one = fresh(), two = fresh();
  runEffect(two, {effect: "setState", targets: [two.zones.battlefield[0] === undefined ? null : two.zones.battlefield.find((x) => two.objects[x].card === PROBE)], level: 2}, {controller: 0, source: null});
  eq([gain(one), gain(two)], [0, 1], "\"whenever you gain life\" at level 2: at level 1 it does not trigger, at level 2 it does (CR 716.2a)");
  const three = fresh(), four = fresh();
  runEffect(four, {effect: "setState", targets: [four.zones.battlefield.find((x) => four.objects[x].card === PROBE)], level: 2}, {controller: 0, source: null});
  eq([leave(three), leave(four)], [0, 1], "\"when this Class leaves\" at level 2: read as it last was -- at level 1 nothing, at level 2 it triggers");
  const odd = validateScript({...script, abilities: [{kind: "static", text: "Creatures you control get +1/+1.", layer: 7, sublayer: "c", condition: {level: {atLeast: 0}}, affects: {what: "permanent"}, apply: {power: 1, toughness: 1}}]});
  ok(!odd.valid && odd.errors.some((e) => /level is \{atLeast: n\}/.test(e.message)), "a level condition of 0 is refused by the schema");
  ok(checkFidelity(loadCardScripts().find((e) => e.script.identity.name === IT).script).ok, "Innkeeper's Talent is faithful to its card: its first line, the Class's reminder, claims nothing (CR 716.2a's level bars do)");
  ok(keywordBuilt("Class"), "and the catalog counts the Class construct as built (game/tools/engine-constructs.mjs)");
}

/* ---- ward {1} at level 2, in a four-player game ---- */
{
  const s = atLevel(play([at(0, "battlefield", IT, "Bear", "Giant"), at(2, "battlefield", "Mountain", "Wastes"), at(2, "hand", "Lightning Bolt")], [], 4), 2);
  const bear = idOf(s, "Bear");
  s.objects[bear].counters["+1/+1"] = 1;
  eq([keywordsOf(s, bear).includes("Ward"), keywordsOf(s, idOf(s, "Giant")).includes("Ward")], [true, false], "Rob's Bear, with a counter, has ward; his Giant, with none, does not");
  delete s.objects[bear].counters["+1/+1"];
  eq(keywordsOf(s, bear).includes("Ward"), false, "its counter gone, its ward is gone: read as it is now");
  s.objects[bear].counters.stun = 1;
  eq(keywordsOf(s, bear).includes("Ward"), true, "any kind of counter will do: a stun counter");
  const trey = runScenario({name: "class", seats: 4, setup: [at(0, "battlefield", IT, "Bear", "Forest"), at(2, "battlefield", "Mountain", "Wastes"), at(2, "hand", "Lightning Bolt")],
    steps: [{tap: "Forest"}, {activate: IT, ability: "a1"}, {resolve: true}, {to: {turn: 1, phase: "COMBAT_BEGIN"}}, {choose: ["Bear"]}, {resolve: true},
      {to: {turn: 3, phase: "MAIN1"}}, {tap: "Mountain", seat: 2}, {cast: "Lightning Bolt", seat: 2, targets: [{card: "Bear"}]}, {resolve: true}]}, index.definition, FIX).state;
  eq([trey.awaiting?.kind, trey.awaiting?.effect, trey.awaiting?.player], ["effect-choice", "unlessPays", 2], "Trey's Bolt at the Bear: ward asks Trey, the opponent who targeted it, to pay {1}");
  const self = runScenario({name: "class", setup: [at(0, "battlefield", IT, "Bear", "Forest", "Mountain"), at(0, "hand", "Lightning Bolt")],
    steps: [{tap: "Forest"}, {activate: IT, ability: "a1"}, {resolve: true}, {to: {turn: 1, phase: "COMBAT_BEGIN"}}, {choose: ["Bear"]}, {resolve: true},
      {to: {turn: 1, phase: "MAIN2"}}, {tap: "Mountain"}, {cast: "Lightning Bolt", targets: [{card: "Bear"}]}]}, index.definition, FIX).state;
  eq(self.stack.length, 1, "Rob's own Bolt at his Bear: no ward trigger -- ward answers an opponent (CR 702.21a)");
}

console.log(`engine-class: ${checks} checks passed -- a Class's levels gained as a sorcery from the level below, each level's abilities had from that level, a level no copy or new object has; ward on what has counters; every counter its controller puts doubled, and no one else's.`);
