/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* THREE STATICS COMBAT READS (Train C phase 2, p6-combat):
 *
 *   "Attacking creatures you control get +1/+0" (Goblin Oriflamme): `attacking` in a layer static's affects, read off the
 *   combat (rules/layers.mjs) -- declared or put onto the battlefield attacking (CR 508.4), never a blocker, over when combat
 *   ends (CR 511.3).
 *   "As long as there is a Lesson card in your graveyard, this creature can attack as though it didn't have defender"
 *   (Platypus-Bear; CR 702.3b): the defender permission's own condition (rules/statics.mjs defenderLifted), which the
 *   compiler now lets it carry.
 *   "If Loot's power is negative, he assigns combat damage as though his power were positive" (Loot, the Anomaly; CR
 *   510.1a's exception): `negative-power-as-positive` (rules/statics.mjs combatDamageOf), read wherever combat reads an
 *   amount -- unblocked, blocking, divided among blockers, trampling over.
 *
 * The cards' scenarios play each; this suite holds what they cannot reach.
 */
import assert from "node:assert/strict";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {awaitingChoice, resolveAwaiting, advance} from "../game/engine/rules/turn.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {runEffect} from "../game/engine/script/effects/index.mjs";
import {characteristicsOf} from "../game/engine/rules/layers.mjs";
import {combatDamageOf, STATIC_RULES} from "../game/engine/rules/statics.mjs";
import {attackers} from "../game/engine/rules/combat.mjs";
import {execFileSync} from "node:child_process";
import {fileURLToPath} from "node:url";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const creature = (subtypes, p = 2, t = p, extra = {}) => ({types: ["Creature"], subtypes, manaCost: "{1}", colors: ["G"], power: p, toughness: t, ...extra});
const FIX = {
  Bear: creature(["Bear"]), Wolf: creature(["Wolf"]), Squire: creature(["Human"], 1, 1), Imp: creature(["Imp"], -1, 3),
  Herald: {...creature(["Human"]), abilities: [{id: "h", kind: "triggered", text: "Whenever this creature attacks, create a 1/1 Spirit that's tapped and attacking.",
    trigger: {on: "GameEventAttackersDeclared", who: "self"}, effects: [{effect: "createToken", count: 1, tapped: true, attacking: true,
      token: {name: "Spirit", types: ["Creature"], subtypes: ["Spirit"], colors: ["W"], power: 1, toughness: 1}}]}]},
  Lesson: {types: ["Sorcery"], subtypes: ["Lesson"], manaCost: "{1}", colors: ["G"], spell: {id: "s", text: "You gain 1 life.", targets: [], effects: [{effect: "gainLife", amount: 1}]}},
};
const play = (setup, seats = 2) => runScenario({name: "combat statics", seats, setup}, index.definition, FIX).state;
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const idOf = (s, card, seat) => s.zones.battlefield.find((id) => s.objects[id].card === card && s.objects[id].controller === seat);
const pt = (s, card, seat = 0) => { const c = characteristicsOf(s, idOf(s, card, seat)); return `${c.power}/${c.toughness}`; };
function toDeclaration(s) {
  for (let n = 0; n < 400 && s.awaiting?.kind !== "declare-attackers"; n += 1) {
    if (s.awaiting) { resolveAwaiting(s, []); continue; }
    if (s.priorityPlayer === null) advance(s); else if (passPriority(s).outcome === "step-ends") advance(s);
  }
  return awaitingChoice(s);
}
function attack(s, names) {
  const options = toDeclaration(s).options;
  resolveAwaiting(s, names.map((name) => options.find((o) => s.objects[o.cardId].card === name && o.planeswalkerId === undefined).index));
}
function settle(s) {
  for (let n = 0; n < 400 && (s.awaiting || s.stack.length); n += 1) {
    if (s.awaiting) { const c = awaitingChoice(s); resolveAwaiting(s, c.options.slice(0, Math.max(1, c.min ?? 0)).map((o) => o.index)); continue; }
    passPriority(s);
  }
}
/* On to a step, answering every routine question with none (no blocks), the stack resolved. */
function to(s, phase, turn = s.turn) {
  for (let n = 0; n < 400 && !(s.turn === turn && s.phase === phase); n += 1) {
    if (s.awaiting) { resolveAwaiting(s, s.awaiting.kind === "order-triggers" ? awaitingChoice(s).options.map((o) => o.index) : []); continue; }
    if (s.priorityPlayer === null) advance(s); else if (passPriority(s).outcome === "step-ends") advance(s);
  }
}

/* ---- attacking creatures you control get +1/+0 ---- */
{
  const s = play([at(0, "battlefield", "Goblin Oriflamme", "Herald")]);
  attack(s, ["Herald"]);
  settle(s);
  eq([pt(s, "Herald"), pt(s, "Spirit")], ["3/2", "2/1"], "the Herald declared and the Spirit its trigger put onto the battlefield attacking: both attacking, both +1/+0");
  to(s, "MAIN2");
  eq([pt(s, "Herald"), pt(s, "Spirit"), s.players[1].life], ["2/2", "1/1", 35], "combat over: 2/2 and 1/1 again, after 3 and 2 damage");
}
{
  const s = play([at(0, "battlefield", "Goblin Oriflamme", "Goblin Oriflamme", "Bear")]);
  attack(s, ["Bear"]);
  eq(pt(s, "Bear"), "4/2", "two Oriflammes: +2/+0");
}
{
  const s = play([at(0, "battlefield", "Goblin Oriflamme", "Wolf"), at(1, "battlefield", "Bear")]);
  to(s, "MAIN1", 2);
  attack(s, ["Bear"]);
  for (let n = 0; n < 40 && s.awaiting?.kind !== "declare-blockers"; n += 1) { if (s.awaiting) { resolveAwaiting(s, []); continue; } if (passPriority(s).outcome === "step-ends") advance(s); }
  const block = awaitingChoice(s).options.find((o) => s.objects[o.cardId].card === "Wolf");
  resolveAwaiting(s, [block.index]);
  eq([pt(s, "Wolf"), pt(s, "Bear", 1)], ["2/2", "2/2"], "Rob's Wolf blocking Maya's Bear is not attacking, and Maya's Bear is not Rob's: neither gets +1/+0");
}
{
  const identity = {name: "Odd", oracleId: "x", types: ["Enchantment"], subtypes: [], manaCost: "{1}", colors: [], colorIdentity: []};
  const script = (attacking) => ({schema: "CrankCardScript@1", identity, oracleText: "x", source: "hand",
    abilities: [{kind: "static", text: "x", layer: 7, sublayer: "c", affects: {what: "permanent", types: ["Creature"], attacking}, apply: {power: 1, toughness: 0}}]});
  eq(compileScript(script(true)).problems, [], "a layer static's affects may say attacking: true");
  ok(compileScript(script(false)).problems.some((p) => /attacking: true/.test(p)), "and is refused attacking: false, which the layers do not read");
}

/* ---- can attack as though it didn't have defender, as long as a Lesson is in your graveyard ---- */
{
  const offered = (setup) => { const s = play(setup); return [s, toDeclaration(s).options.map((o) => s.objects[o.cardId].card)]; };
  eq(offered([at(0, "battlefield", "Platypus-Bear", "Bear")])[1], ["Bear"], "no Lesson in Rob's graveyard: defender holds, and only the Bear is offered");
  eq(offered([at(0, "battlefield", "Platypus-Bear", "Bear"), at(1, "graveyard", "Lesson")])[1], ["Bear"], "a Lesson in Maya's graveyard is not in Rob's");
  const [s, list] = offered([at(0, "battlefield", "Platypus-Bear", "Bear"), at(0, "graveyard", "Lesson")]);
  eq(list.sort(), ["Bear", "Platypus-Bear"], "a Lesson in Rob's: both offered");
  runEffect(s, {effect: "moveZone", targets: [s.zones.graveyard[0].find((id) => s.objects[id].card === "Lesson")], to: "exile"}, {controller: 1, source: null});
  eq(attackers.choice(s, s.awaiting).options.map((o) => s.objects[o.cardId].card), ["Bear"], "the Lesson exiled: asked again, the Bear alone -- the condition is read as attackers are offered");
  eq(index.resolve("Platypus-Bear").problems ?? [], [], "and the card's permission, with its condition, compiles");
}

/* ---- as though its power were positive ---- */
{
  const s = play([at(0, "battlefield", "Loot, the Anomaly", "Imp")]);
  const loot = idOf(s, "Loot, the Anomaly", 0), imp = idOf(s, "Imp", 0);
  eq([combatDamageOf(s, loot), combatDamageOf(s, imp)], [2, -1], "Loot at -2 assigns 2; an Imp at -1 without the ability assigns nothing (CR 510.1a)");
  runEffect(s, {effect: "pump", targets: [loot], power: 2, toughness: 0}, {controller: 0, source: null});
  eq(combatDamageOf(s, loot), 0, "Loot at 0: nothing is negative, and 0 assigns nothing");
  runEffect(s, {effect: "pump", targets: [loot], power: 3, toughness: 0}, {controller: 0, source: null});
  eq(combatDamageOf(s, loot), 3, "Loot at 3: its power, as any creature's");
  runEffect(s, {effect: "effectUntil", rule: "combat-damage-by-toughness", targets: [loot], until: "end-of-turn"}, {controller: 0, source: loot});
  eq(combatDamageOf(s, loot), 4, "told to assign its toughness instead (CR 510.1a): 4, its toughness");
}
{
  const s = play([at(0, "battlefield", "Loot, the Anomaly")]);
  const loot = idOf(s, "Loot, the Anomaly", 0);
  runEffect(s, {effect: "pump", targets: [loot], power: -4, toughness: 0}, {controller: 0, source: null});
  runEffect(s, {effect: "effectUntil", rule: "combat-damage-by-toughness", targets: [loot], until: "end-of-turn"}, {controller: 0, source: loot});
  eq(combatDamageOf(s, loot), 4, "a -6/4 told to assign its toughness: its toughness, 4 -- its power, negative or not, is not what it assigns");
}
{
  /* Divided among two blockers (CR 510.1c): its power's size is the total to divide. */
  const s = play([at(0, "battlefield", "Loot, the Anomaly"), at(1, "battlefield", "Squire", "Wolf")]);
  attack(s, ["Loot, the Anomaly"]);
  for (let n = 0; n < 40 && s.awaiting?.kind !== "declare-blockers"; n += 1) { if (s.awaiting) { resolveAwaiting(s, []); continue; } if (passPriority(s).outcome === "step-ends") advance(s); }
  resolveAwaiting(s, awaitingChoice(s).options.map((o) => o.index));
  for (let n = 0; n < 40 && s.awaiting?.kind !== "assign-combat-damage"; n += 1) { if (s.awaiting) { resolveAwaiting(s, []); continue; } if (passPriority(s).outcome === "step-ends") advance(s); }
  const choice = awaitingChoice(s);
  eq([choice.total, choice.title], [2, "Assign 2 damage"], "blocked by the Squire and the Wolf: 2 damage to divide");
  resolveAwaiting(s, [], choice.options.map((o) => (s.objects[o.cardId].card === "Squire" ? 1 : 1)));
  to(s, "MAIN2");
  eq([idOf(s, "Squire", 1) ?? null, s.objects[idOf(s, "Wolf", 1)].damage], [null, 1], "1 to the Squire, which dies, and 1 to the Wolf");
}
{
  /* Trampling over a 1/1 (CR 702.19b): lethal is 1 of its 2, and 1 goes on. */
  const s = play([at(0, "battlefield", "Loot, the Anomaly"), at(1, "battlefield", "Squire")]);
  runEffect(s, {effect: "pump", targets: [idOf(s, "Loot, the Anomaly", 0)], power: 0, toughness: 0, keywords: ["Trample"]}, {controller: 0, source: null});
  attack(s, ["Loot, the Anomaly"]);
  for (let n = 0; n < 40 && s.awaiting?.kind !== "declare-blockers"; n += 1) { if (s.awaiting) { resolveAwaiting(s, []); continue; } if (passPriority(s).outcome === "step-ends") advance(s); }
  resolveAwaiting(s, [0]);
  to(s, "COMBAT_DAMAGE");
  eq([s.awaiting?.kind, awaitingChoice(s).total], ["assign-combat-damage", 2], "Loot's controller is asked for the trample division");
  resolveAwaiting(s, [], [1, 1]);
  to(s, "MAIN2");
  eq([idOf(s, "Squire", 1) ?? null, s.players[1].life], [null, 39], "with trample, blocked by the Squire: 1 to it and 1 to Maya");
  eq(STATIC_RULES["negative-power-as-positive"], "rules/combat.mjs", "a rule rules/combat.mjs reads");
}
{
  /* A printed power below zero, as the batch generator writes it from the oracle data (game/tools/batch/cardlib.py): -2, not
     "no number" -- the definition's own, which tests/engine-cards.mjs holds to the oracle the same way. */
  const root = fileURLToPath(new URL("..", import.meta.url));
  const out = execFileSync("python3", ["-I", "-c", "import sys; sys.path.insert(0, sys.argv[1] + '/game/tools/batch'); from cardlib import Batch; i = Batch(sys.argv[1]).identity(sys.argv[2]); print(i['power'], i['toughness'])",
    root, "Loot, the Anomaly"], {encoding: "utf8"}).trim();
  eq([out, index.definition("Loot, the Anomaly").power], ["-2 4", -2], "Loot's identity is -2/4, from the generator and in its definition");
}

console.log(`engine-combat-statics: ${checks} checks passed -- attacking creatures get +1/+0, a joined attacker too, never a blocker; defender lifted while a Lesson is in your own graveyard, read as attackers are offered; negative power assigned as positive, divided, trampling, and beside the toughness rule.`);
