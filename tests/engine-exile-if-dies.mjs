/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* TRAIN C, P4-REPLACEMENTS: "IF THAT CREATURE WOULD DIE THIS TURN, EXILE IT INSTEAD" (Essence Burn, Combustion Technique).
 *
 * A spell's own replacement effect for one object, this turn (CR 614.1a, 700.4): effectUntil's `rule: "exile-if-dies"` about
 * its targets, fixed as it resolves, gone at the turn's cleanup -- read wherever a permanent would be put into a graveyard
 * from the battlefield (rules/replacement.mjs, applicable), each a candidate of its own ordered with the others (CR 616.1).
 * Here, what the scenarios cannot reach: every way to die, a bounce that is no death, a new object, the death that never
 * happened (no "dies" trigger), beside other "exile instead" effects, the turn's end, and the schema.
 */
import assert from "node:assert/strict";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {runEffects} from "../game/engine/script/effects/index.mjs";
import {moveOne, sacrificeOne} from "../game/engine/script/effects/zones.mjs";
import {checkStateBasedActions} from "../game/engine/rules/sba.mjs";
import {collectTriggers} from "../game/engine/rules/trigger.mjs";
import {cardsIn} from "../game/engine/state/index.mjs";
import {advance} from "../game/engine/rules/turn.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {createRng} from "../game/engine/rng.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const rng = createRng("exile-if-dies");
const FIX = {
  Bear: {types: ["Creature"], subtypes: ["Bear"], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2},
  Ogre: {types: ["Creature"], subtypes: ["Ogre"], manaCost: "{2}{R}", colors: ["R"], power: 3, toughness: 3},
  /* "Whenever a creature dies, you gain 1 life." */
  Mourner: {types: ["Enchantment"], subtypes: [], manaCost: "{1}{B}", colors: ["B"],
    abilities: [{id: "m", kind: "triggered", text: "x", trigger: {on: "GameEventCardChangeZone", from: "Battlefield", to: "Graveyard", who: "any", filter: {types: ["Creature"]}},
      effects: [{effect: "gainLife", amount: 1}]}]},
  /* "If a creature an opponent controls would die, exile it instead" (as Liesa says it). */
  Warden: {types: ["Enchantment"], subtypes: [], manaCost: "{2}{W}", colors: ["W"],
    abilities: [{id: "w", kind: "replacement", text: "x", watches: {event: "zone-change", from: "battlefield", to: "graveyard", filter: {types: ["Creature"], controller: "opponent"}}, change: {to: "exile"}}]},
};
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const table = (setup, seats = 2) => runScenario({name: "exile-if-dies", seats, setup, steps: []}, index.definition, FIX).state;
const idOf = (s, name, seat = 1) => s.zones.battlefield.find((id) => s.objects[id].card === name && s.objects[id].controller === seat);
const whereIs = (s, name, seat = 1) => (idOf(s, name, seat) !== undefined ? "battlefield" : cardsIn(s, "graveyard", seat).some((id) => s.objects[id].card === name) ? "graveyard"
  : cardsIn(s, "exile").some((id) => s.objects[id].card === name && s.objects[id].owner === seat) ? "exile"
  : cardsIn(s, "hand", seat).some((id) => s.objects[id].card === name) ? "hand" : "nowhere");
/* What Essence Burn's second sentence does, about these permanents. */
const mark = (s, ids) => runEffects(s, [{effect: "effectUntil", rule: "exile-if-dies", targets: ids, until: "end-of-turn"}], {controller: 0, source: null});

/* ---- every way to die, and what is not dying ---- */
{
  const s = table([at(1, "battlefield", "Bear", "Ogre")]);
  mark(s, [idOf(s, "Bear"), idOf(s, "Ogre")]);
  runEffects(s, [{effect: "destroy", targets: [idOf(s, "Bear")]}], {controller: 0, source: null});
  sacrificeOne(s, idOf(s, "Ogre"), []);
  eq([whereIs(s, "Bear"), whereIs(s, "Ogre")], ["exile", "exile"], "destroyed or sacrificed: exiled");
}
{
  const s = table([at(1, "battlefield", "Bear", "Ogre")]);
  mark(s, [idOf(s, "Bear"), idOf(s, "Ogre")]);
  runEffects(s, [{effect: "dealDamage", amount: 2, targets: [idOf(s, "Bear")]}, {effect: "pump", targets: [idOf(s, "Ogre")], power: 0, toughness: -3, until: "end-of-turn"}], {controller: 0, source: null});
  checkStateBasedActions(s);
  eq([whereIs(s, "Bear"), whereIs(s, "Ogre")], ["exile", "exile"], "lethal damage, or toughness 0, as state-based actions: exiled");
}
{
  /* Another effect about it for the turn is not this one. */
  const s = table([at(1, "battlefield", "Bear")]);
  runEffects(s, [{effect: "effectUntil", rule: "prevent-damage", targets: [idOf(s, "Bear")], apply: {to: true}, until: "end-of-turn"}], {controller: 0, source: null});
  runEffects(s, [{effect: "destroy", targets: [idOf(s, "Bear")]}], {controller: 0, source: null});
  eq(whereIs(s, "Bear"), "graveyard", "a prevention effect about it: destroyed, to the graveyard");
}
{
  const s = table([at(1, "battlefield", "Bear")]);
  mark(s, [idOf(s, "Bear")]);
  moveOne(s, idOf(s, "Bear"), "hand", []);
  eq(whereIs(s, "Bear"), "hand", "returned to its owner's hand: no death, so it goes there");
}
{
  /* It left and came back: a new object (CR 400.7), not the one the spell named. */
  const s = table([at(1, "battlefield", "Bear")]);
  mark(s, [idOf(s, "Bear")]);
  const exiled = moveOne(s, idOf(s, "Bear"), "exile", []);
  moveOne(s, exiled, "battlefield", []);
  runEffects(s, [{effect: "destroy", targets: [idOf(s, "Bear")]}], {controller: 0, source: null});
  eq(whereIs(s, "Bear"), "graveyard", "flickered, then destroyed: to the graveyard");
}
{
  /* Exiled instead, it never died (CR 700.4): "whenever a creature dies" does not trigger. */
  const s = table([at(0, "battlefield", "Mourner"), at(1, "battlefield", "Bear", "Ogre")]);
  mark(s, [idOf(s, "Bear")]);
  const events = runEffects(s, [{effect: "destroy", targets: [idOf(s, "Bear")]}, {effect: "destroy", targets: [idOf(s, "Ogre")]}], {controller: 0, source: null});
  collectTriggers(s, events);
  eq([s.pendingTriggers.length, whereIs(s, "Bear"), whereIs(s, "Ogre")], [1, "exile", "graveyard"], "the exiled Bear triggers nothing; the Ogre that died does");
}

/* ---- beside other "exile it instead" effects: each its own, the same end, no question ---- */
{
  const s = table([at(0, "battlefield", "Warden"), at(1, "battlefield", "Bear")]);
  mark(s, [idOf(s, "Bear")]);
  mark(s, [idOf(s, "Bear")]);
  s.objects[idOf(s, "Bear")].counters.finality = 1;
  runEffects(s, [{effect: "destroy", targets: [idOf(s, "Bear")]}], {controller: 0, source: null});
  eq([whereIs(s, "Bear"), s.awaiting], ["exile", null], "two of these, a finality counter and a Warden: exiled, and nobody asked");
}

/* ---- this turn only ---- */
{
  const s = table([at(1, "battlefield", "Bear")]);
  mark(s, [idOf(s, "Bear")]);
  ok(s.effects.some((e) => e.rule === "exile-if-dies"), "the effect is there this turn");
  /* On through the turn as the room does: pass, and the step ends when everyone has (CR 117.4). */
  for (let n = 0; n < 200 && s.turn === 1 && !s.awaiting; n += 1) {
    if (s.priorityPlayer === null) advance(s);
    else if (passPriority(s, null, rng).outcome === "step-ends") advance(s);
  }
  eq(s.turn, 2, "the turn has ended");
  ok(!(s.effects ?? []).some((e) => e.rule === "exile-if-dies"), "and gone once the turn has ended");
  runEffects(s, [{effect: "destroy", targets: [idOf(s, "Bear")]}], {controller: 0, source: null});
  eq(whereIs(s, "Bear"), "graveyard", "destroyed next turn: to the graveyard");
}

/* ---- the schema ---- */
const spell = (effect) => compileScript({schema: "CrankCardScript@1",
  identity: {name: "Odd Burn", oracleId: "x", types: ["Instant"], subtypes: [], manaCost: "{R}", colors: ["R"], colorIdentity: ["R"]},
  oracleText: "x", source: "hand", abilities: [{kind: "spell", text: "x", targets: [{what: "permanent", types: ["Creature"]}], effects: [{effect: "effectUntil", rule: "exile-if-dies", ...effect}]}]}).problems;
eq(spell({targets: {target: 0}, until: "end-of-turn"}), [], "about its target, this turn: compiles");
for (const bad of [{selector: {what: "permanent"}}, {targets: {target: 0}, until: "ever"}])
  ok(spell(bad).some((p) => p.includes("If it would die this turn, exile it instead")), `and refuses ${JSON.stringify(bad)}`);

console.log(`engine-exile-if-dies: ${checks} checks passed -- if that creature would die this turn, exile it instead: destroyed, sacrificed, dead to damage or toughness, never a death; a bounce, a new object; beside other exile-instead effects; this turn only; the schema.`);
