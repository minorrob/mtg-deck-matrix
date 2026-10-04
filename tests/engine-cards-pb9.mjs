/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* ROB'S PRIORITY BATCH 10.3, THE NINTH SLICE: WHAT ITS SCENARIOS CANNOT REACH.
 *
 * Twenty-one cards from Rob's list, and one thing they needed: a restriction on attacking that an effect leaves for a
 * turn (CR 508.1c). Endbringer's "{C}, {T}: Target creature can't attack or block this turn" is two effects until end of
 * turn -- `rule: "cant-attack"` and `rule: "cant-block"` -- and only the second was read: rules/statics.mjs's cantAttack
 * looked at permanents' static abilities alone. It now reads the effects too, on the creatures they fixed as they
 * resolved, attacking anyone.
 * A scenario names who attacks and never who may not, and declares no blocks: this suite holds both, and the turn after.
 * And Freyalise's "can be your commander" (CR 903.3a): a static ability claiming the line, which the card index reads.
 */
import assert from "node:assert/strict";
import {awaitingChoice, resolveAwaiting, advance} from "../game/engine/rules/turn.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const creature = (name, more = {}) => ({types: ["Creature"], subtypes: [name], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2, ...more});
const FIX = {Bear: creature("Bear"), Bird: creature("Bird", {colors: ["W"], power: 1, toughness: 1})};
const play = (name, setup, steps) => runScenario({name, setup, steps}, index.definition, FIX).state;
const named = (s, card, seat) => Object.values(s.objects).filter((o) => o.card === card && o.zone === "battlefield" && o.controller === seat);
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
/* The creatures offered as attackers, by name. */
const attackers = (s) => [...new Set(toQuestion(s, "declare-attackers").options.map((o) => s.objects[o.cardId].card))].sort();
/* One creature attacking its first defender, then the blockers that defender is offered, by name. */
function blockersAgainst(s, attacker) {
  const declaring = toQuestion(s, "declare-attackers");
  resolveAwaiting(s, [declaring.options.find((o) => o.cardId === attacker).index]);
  return [...new Set(toQuestion(s, "declare-blockers").options.map((o) => s.objects[o.cardId].card))].sort();
}

/* ---- can't attack this turn ---- */
const IN_MAYAS_TURN = [{to: {turn: 2, phase: "MAIN1"}}, {pass: 1}, {tap: "Wastes", seat: 0}, {activate: "Endbringer", seat: 0, ability: "a2", targets: [{card: "Bear"}]}, {resolve: true}];
{
  /* In Maya's turn, before combat, Rob's Endbringer aims at Maya's Bear: Maya is offered the Bird and not the Bear. */
  const s = play("endbringer, Maya's turn", [at(0, "battlefield", "Endbringer", "Wastes"), at(1, "battlefield", "Bear", "Bird")], IN_MAYAS_TURN);
  eq(attackers(s), ["Bird"], "Maya may attack with the Bird, not the Bear (CR 508.1c)");
}
{
  /* Maya's next turn: the effect ended with the turn it was made in (CR 514.2). */
  const s = play("endbringer, Maya's next turn", [at(0, "battlefield", "Endbringer", "Wastes"), at(1, "battlefield", "Bear", "Bird")], [...IN_MAYAS_TURN, {to: {turn: 4, phase: "MAIN1"}}]);
  eq(attackers(s), ["Bear", "Bird"], "two turns on, the Bear may attack again");
}
{
  /* Without Endbringer's answer, the same board offers both: the restriction is the effect's, not the board's. */
  const s = play("no endbringer", [at(0, "battlefield", "Wastes"), at(1, "battlefield", "Bear", "Bird")], [{to: {turn: 2, phase: "MAIN1"}}]);
  eq(attackers(s), ["Bear", "Bird"], "with nothing aimed at it, the Bear may attack");
}

/* ---- and can't block, the same turn ---- */
{
  /* In Rob's turn: Maya's Bear can't block Rob's Bear; Maya's Bird can. */
  const s = play("endbringer, Rob's turn", [at(0, "battlefield", "Endbringer", "Wastes", "Bear"), at(1, "battlefield", "Bear", "Bird")],
    [{tap: "Wastes"}, {activate: "Endbringer", ability: "a2", targets: [{card: "Bear", seat: 1}]}, {resolve: true}]);
  eq(blockersAgainst(s, named(s, "Bear", 0)[0].id), ["Bird"], "Maya may block with the Bird, not the Bear (CR 509.1b)");
  ok(named(s, "Endbringer", 0)[0].tapped, "Endbringer tapped to pay");
}

/* ---- "can be your commander" ---- */
{
  /* CR 903.3a: Freyalise's line is a static of its own, the one source of the definition's canBeCommander -- which the
     table holds a deck's commander to (room/table.mjs, commanderLegal). */
  eq(index.definition("Freyalise, Llanowar's Fury")?.canBeCommander, true, "Freyalise may be a commander: a legendary planeswalker that says so");
  eq(index.definition("Shalai, Voice of Plenty")?.canBeCommander, undefined, "a legendary creature needs no such line");
}

for (const name of ["Shore Lurker", "Timid Shieldbearer", "Wanderer's Strike", "Wild Pack Squad", "Yip Yip!", "Soul of New Phyrexia", "Chulane, Teller of Tales",
  "Dragonlord Dromoka", "Ritual of Soot", "Endbringer", "Tome of Legends", "Bristlebane Battler", "Freyalise, Llanowar's Fury", "Glittering Massif", "Karn's Bastion",
  "Lotus Field", "Rugged Prairie", "Balefire Liege", "Knight of Autumn", "Lorehold Command", "Shalai, Voice of Plenty"])
  ok(index.resolve(name)?.playable === true, `${name} is defined and playable`);

console.log(`engine-cards-pb9: ${checks} checks passed -- Rob's priority list, its ninth slice: "can't attack this turn" from an effect, and the turn it ends; "can be your commander".`);
