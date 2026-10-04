/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* "AT THE BEGINNING OF COMBAT ON EACH OPPONENT'S TURN, THEY MAY PAY {2}. IF THEY DON'T, CREATURES THEY CONTROL CAN'T
 * ATTACK JACES YOU CONTROL THIS TURN" (Jace, Multiverse Architect; the live-game plan of 2026-10-04, its piece P5).
 *
 * The trigger is a step's beginning on another player's turn (`yours: false`, `notYourTurn`), asked of the player whose
 * turn it is (unlessPays, CR 118.12). Not paid, a restriction on attacking (CR 508.1c) for the turn, an effect
 * (effectUntil's `rule: "cant-attack"`) with `who` the player whose creatures it binds -- a rule changed, not a
 * characteristic, so it reaches the creatures that player controls as they are, one that arrives later included -- and
 * `toward` the planeswalkers it keeps them from: "Jaces you control", "you" the effect's controller (rules/statics.mjs,
 * cantAttack). Attacking a player, or another planeswalker, stays open (CR 506.3).
 *
 * The card scenarios play the card. This suite holds the edges, at a table of four.
 */
import assert from "node:assert/strict";
import {advance, awaitingChoice} from "../game/engine/rules/turn.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {cantAttack} from "../game/engine/rules/statics.mjs";
import {addObject} from "../game/engine/state/index.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const JACE = "Jace, Multiverse Architect";
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const FIX = {
  Bear: {types: ["Creature"], subtypes: ["Bear"], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2},
  /* Another Jace, Trey's: "Jaces YOU control" is not it. */
  "Jace Fixture": {types: ["Planeswalker"], subtypes: ["Jace"], manaCost: "{2}{U}", colors: ["U"], loyalty: 3},
  /* And a planeswalker of Rob's that is no Jace. */
  "Ajani Fixture": {types: ["Planeswalker"], subtypes: ["Ajani"], manaCost: "{2}{W}", colors: ["W"], loyalty: 3},
};
/* Four seats; turn 2 is Maya's. */
const play = (setup, steps) => runScenario({name: "cant attack jaces", seats: 4, setup, steps}, index.definition, FIX).state;
const idOf = (s, card, seat = null) => s.zones.battlefield.find((id) => s.objects[id].card === card && (seat === null || s.objects[id].controller === seat));
/* On to the declare-attackers question, and what it offers. */
function attackOptions(s) {
  for (let n = 0; n < 200 && s.awaiting?.kind !== "declare-attackers"; n += 1) {
    if (s.awaiting) throw new Error(`asked ${s.awaiting.kind} on the way to attacks`);
    if (s.priorityPlayer === null) { advance(s); continue; }
    if (passPriority(s, null).outcome === "step-ends") advance(s);
  }
  return awaitingChoice(s).options.map((o) => o.label).sort();
}
const TABLE = [at(0, "battlefield", JACE, "Ajani Fixture"), at(1, "battlefield", "Bear", "Wastes", "Wastes"), at(2, "battlefield", "Jace Fixture")];
const COMBAT = {to: {turn: 2, phase: "COMBAT_BEGIN"}};

/* ---- not paid: no attacking Rob's Jace; the rest stays open ---- */
{
  const s = play(TABLE, [COMBAT, {resolve: true}, {choose: ["Don't pay"]}]);
  eq(attackOptions(s), ["Bear → Ajani Fixture (Rob)", "Bear → Jace Fixture (Trey)", "Bear → Rob", "Bear → Sam", "Bear → Trey"],
    "not paid: the Bear may attack every player, Rob's Ajani and Trey's Jace -- not Rob's Jace");
}
/* ---- paid: Rob's Jace too ---- */
{
  const s = play(TABLE, [COMBAT, {resolve: true}, {choose: ["Pay {2}"]}]);
  ok(attackOptions(s).includes(`Bear → ${JACE} (Rob)`), "paid: the Bear may attack Rob's Jace");
  eq(s.zones.battlefield.filter((id) => s.objects[id].card === "Wastes" && s.objects[id].tapped).length, 2, "and Maya's two Wastes paid for it");
}
/* ---- the creatures they control as they are: one that arrives later is held as well; another player's is not ---- */
{
  const s = play(TABLE, [COMBAT, {resolve: true}, {choose: ["Don't pay"]}]);
  const jace = idOf(s, JACE);
  const late = addObject(s, {...FIX.Bear, card: "Late Bear", owner: 1, controller: 1}, "battlefield", null);
  const trey = addObject(s, {...FIX.Bear, card: "Trey's Bear", owner: 2, controller: 2}, "battlefield", null);
  eq([cantAttack(s, late, 0, jace), cantAttack(s, late, 0), cantAttack(s, trey, 0, jace)], [true, false, false],
    "a creature Maya gets later can't attack Rob's Jace either, and can attack Rob; Trey's creature is not bound");
  const ajani = idOf(s, "Ajani Fixture"), treyJace = idOf(s, "Jace Fixture");
  eq([cantAttack(s, idOf(s, "Bear"), 0, ajani), cantAttack(s, idOf(s, "Bear"), 2, treyJace)], [false, false], "Rob's Ajani and Trey's Jace stay open");
}
/* ---- "you" is the Jace's controller: Trey's Jace held, on Maya's turn; Rob's other Jace open ---- */
{
  const s = play([at(2, "battlefield", JACE), at(0, "battlefield", "Jace Fixture"), at(1, "battlefield", "Bear")],
    [{to: {turn: 1, phase: "COMBAT_BEGIN"}}, {resolve: true}, {choose: ["Don't pay"]}, COMBAT, {resolve: true}, {choose: ["Don't pay"]}]);
  const options = attackOptions(s);
  eq([options.includes(`Bear → ${JACE} (Trey)`), options.includes("Bear → Jace Fixture (Rob)")], [false, true], "Trey's Jace can't be attacked; Rob's Jace, not Trey's, can");
}
/* ---- this turn only ---- */
{
  const s = play(TABLE, [COMBAT, {resolve: true}, {choose: ["Don't pay"]}, {to: {turn: 3, phase: "UPKEEP"}}]);
  eq((s.effects ?? []).filter((e) => e.rule === "cant-attack").length, 0, "the turn over, the restriction is gone");
  ok(!cantAttack(s, idOf(s, "Bear"), 0, idOf(s, JACE)), "and the Bear could attack Rob's Jace again");
}
/* ---- a player who can't pay is offered only not paying; each opponent is asked on their own turn ---- */
{
  const s = play([at(0, "battlefield", JACE), at(1, "battlefield", "Bear")], [COMBAT, {resolve: true}]);
  eq([s.awaiting?.player, awaitingChoice(s).options.map((o) => o.label)], [1, ["Don't pay"]], "Maya, with no mana, is offered only not paying");
  const t = play([at(0, "battlefield", JACE), at(2, "battlefield", "Bear", "Wastes", "Wastes")], [COMBAT, {resolve: true}, {choose: ["Don't pay"]}, {to: {turn: 3, phase: "COMBAT_BEGIN"}}, {resolve: true}]);
  eq(t.awaiting?.player, 2, "on Trey's turn, Trey is asked");
}
ok(index.resolve(JACE)?.playable === true, `${JACE} is defined and playable`);

console.log(`engine-cant-attack-jaces: ${checks} checks passed -- an opponent's {2} at the beginning of combat or no attacking your Jaces this turn: their creatures as they are, toward your Jaces only, for the turn.`);
