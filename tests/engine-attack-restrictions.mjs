/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* WHOM A CREATURE CAN'T ATTACK, AND "WHENEVER A PLAYER ATTACKS ONE OF YOUR OPPONENTS" (the plan's X5, D5 Shadrix
 * Aristocrats: Combat Calligrapher; X5g).
 *
 * A restriction on attacking (CR 508.1c; Forge's CantAttack) is a static `cant-attack` (rules/statics.mjs, cantAttack): which
 * creatures (`affects`), whom (`defender`: "you", "owner", or "attacked" -- a player it has already attacked this turn --
 * or anyone), and a condition under which it does not apply (`unless`). Restrictions come first: a player a creature can't
 * attack is never offered for it, and no requirement -- goad (CR 701.15b), encore's "attacks that opponent if able" --
 * asks it of them (CR 508.1d). "Whenever a player attacks one of your opponents" (CR 508.3e) triggers once for each of
 * this ability's controller's opponents attacked, never for creatures put onto the battlefield attacking, about that
 * opponent and the attacking player, who "creates a tapped ... token that's attacking that opponent" (CR 508.4).
 * The card scenarios play the cards (Combat Calligrapher, Sandwurm Convergence, Bloodthirster, Port Razer). This suite holds
 * the edges.
 */
import assert from "node:assert/strict";
import {addObject} from "../game/engine/state/index.mjs";
import {awaitingChoice, resolveAwaiting, advance} from "../game/engine/rules/turn.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {validateScript} from "../game/engine/script/schema.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {missingFor} from "../game/tools/engine-constructs.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const creature = (name, more = {}) => ({types: ["Creature"], subtypes: [name], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2, ...more});
const FIX = {
  Bear: creature("Bear"),
  Bird: creature("Bird", {colors: ["W"], keywords: ["Flying"], power: 1, toughness: 1}),
  Inkling: creature("Inkling", {colors: ["W", "B"], keywords: ["Flying"], power: 2, toughness: 1}),
  /* "This creature can't attack unless you control seven or more lands" (Topiary Stomper's first half). */
  Stomper: creature("Dinosaur", {power: 4, toughness: 4, abilities: [{id: "a0", kind: "static", text: "This creature can't attack unless you control seven or more lands.",
    rule: "cant-attack", affects: {self: true}, unless: {present: {types: ["Land"], controller: "you"}, atLeast: 7}}]}),
  /* "Can't attack its owner" (Alexios, Xantcha). */
  Turncoat: creature("Rogue", {abilities: [{id: "a0", kind: "static", text: "This creature can't attack its owner.", rule: "cant-attack", affects: {self: true}, defender: "owner"}]}),
};
const play = (name, setup, steps, more = {}) => runScenario({name, setup, steps, ...more}, index.definition, FIX).state;
const named = (s, card, zone = "battlefield") => Object.values(s.objects).filter((o) => o.card === card && o.zone === zone);
/* From a main phase to this turn's declare-attackers question, everyone passing (the scenario runner would answer it); null
   when the turn's combat asks none. */
function toDeclaration(s) {
  const turn = s.turn;
  for (let n = 0; n < 60 && s.awaiting?.kind !== "declare-attackers" && s.turn === turn && s.phase !== "MAIN2"; n += 1) {
    if (s.awaiting) throw new Error(`asked ${s.awaiting.kind} before the declaration`);
    if (s.priorityPlayer === null) advance(s);
    else if (passPriority(s).outcome === "step-ends") advance(s);
  }
  return s.awaiting?.kind === "declare-attackers" ? awaitingChoice(s) : null;
}
const whom = (choice, id) => choice.options.filter((o) => o.cardId === id).map((o) => o.defenderId).sort();
const pick = (choice, pairs) => pairs.map(([id, d]) => choice.options.find((o) => o.cardId === id && o.defenderId === d).index);

/* ---- restrictions ---- */
{
  /* Combat Calligrapher: Inklings can't attack Rob. Maya's Inkling may attack Trey; her Bear, anyone. */
  const s = play("inklings", [at(0, "battlefield", "Combat Calligrapher"), at(1, "battlefield", "Inkling", "Bear")], [{to: {turn: 2, phase: "MAIN1"}}], {seats: 3});
  const choice = toDeclaration(s);
  eq([whom(choice, named(s, "Inkling")[0].id), whom(choice, named(s, "Bear")[0].id)], [[2], [0, 2]], "Maya's Inkling is offered Trey, not Rob; her Bear either");
}
{
  /* Sandwurm Convergence, two seats: Maya's flier can attack no one, so it is no candidate; with nothing else, nothing is asked. */
  const s = play("only a flier", [at(0, "battlefield", "Sandwurm Convergence"), at(1, "battlefield", "Bird")], [{to: {turn: 2, phase: "MAIN1"}}]);
  eq(toDeclaration(s), null, "Maya's only creature flies and Rob is the only one she could attack: no declaration is asked");
}
{
  /* "Unless you control seven or more lands": six, and it can't attack; seven, and it can. */
  const six = play("six lands", [at(0, "battlefield", "Stomper", "Forest", "Forest", "Forest", "Forest", "Forest", "Forest", "Bear")], [{to: {turn: 3, phase: "MAIN1"}}]);
  const seven = play("seven lands", [at(0, "battlefield", "Stomper", "Forest", "Forest", "Forest", "Forest", "Forest", "Forest", "Forest")], [{to: {turn: 3, phase: "MAIN1"}}]);
  eq([whom(toDeclaration(six), named(six, "Stomper")[0].id), whom(toDeclaration(seven), named(seven, "Stomper")[0].id)], [[], [1]],
    "with six lands it is not offered; with seven, Maya");
}
{
  /* "Can't attack its owner": Maya's creature, under Rob's control, may attack Trey and not her. */
  const s = play("its owner", [], [{to: {turn: 4, phase: "MAIN1"}}], {seats: 3});
  const stolen = addObject(s, {...FIX.Turncoat, card: "Turncoat", owner: 1, controller: 0}, "battlefield");
  s.objects[stolen].controlledSinceTurn = 0;
  eq(whom(toDeclaration(s), stolen), [2], "Rob controls Maya's Turncoat: it may attack Trey, never Maya");
}
{
  /* "A player it has already attacked this turn" (Port Razer): offered Trey in the additional combat, not Maya. */
  const s = play("already attacked", [at(0, "battlefield", "Port Razer")],
    [{to: {turn: 4, phase: "MAIN1"}}, {attack: ["Port Razer"], at: "Maya"}, {to: {turn: 4, phase: "COMBAT_DAMAGE"}}, {resolve: true}], {seats: 3});
  const choice = toDeclaration(s);
  eq([s.turn, whom(choice, named(s, "Port Razer")[0].id)], [4, [2]], "in the additional combat Port Razer is offered Trey only: it has attacked Maya this turn");
  const next = play("the next turn", [at(0, "battlefield", "Port Razer")],
    [{to: {turn: 4, phase: "MAIN1"}}, {attack: ["Port Razer"], at: "Maya"}, {to: {turn: 7, phase: "MAIN1"}}], {seats: 3});
  eq(whom(toDeclaration(next), named(next, "Port Razer")[0].id), [1, 2], "on Rob's next turn it may attack Maya again: the record is the turn's");
}

/* ---- restrictions before requirements (CR 508.1c-d) ---- */
{
  /* Goaded by Trey, Maya's flier must attack a player other than Trey if able -- but Rob's Sandwurm keeps it from him, so
     it attacks Trey. */
  const s = play("goaded", [at(0, "battlefield", "Sandwurm Convergence"), at(1, "battlefield", "Bird")], [{to: {turn: 2, phase: "MAIN1"}}], {seats: 3});
  const bird = named(s, "Bird")[0].id;
  s.effects = [...(s.effects ?? []), {id: "goad:test", rule: "goaded", affects: {ids: [bird]}, until: "your-next-turn", sourceController: 2}];
  const choice = toDeclaration(s);
  eq(whom(choice, bird), [2], "goaded by Trey and kept from Rob: offered Trey alone");
  resolveAwaiting(s, []);
  eq(s.combat.attacks.map((a) => [a.attacker, a.defender]), [[bird, 2]], "declared with none, it attacks Trey (CR 701.15b): the only player it can");
}
{
  /* Encore's token must attack Rob if able; Rob's Sandwurm forbids a flier to, so nothing is required of it. */
  const EIGHT = ["Plains", "Plains", "Wastes", "Wastes", "Wastes", "Wastes", "Wastes", "Wastes"];
  const s = play("encore and a restriction", [at(0, "battlefield", "Sandwurm Convergence"), at(1, "battlefield", ...EIGHT), at(1, "graveyard", "Angel of Indemnity")],
    [{to: {turn: 2, phase: "MAIN1"}}, ...EIGHT.map((n) => ({tap: n, seat: 1})), {activate: "Angel of Indemnity", seat: 1}, {resolve: true}, {settle: true}], {seats: 3});
  const choice = toDeclaration(s);
  const tokens = named(s, "Angel of Indemnity").map((t) => t.id);
  eq(tokens.map((t) => whom(choice, t)).sort(), [[2], [2]], "both Angels are offered Trey: the one owed to Rob can't attack him");
  resolveAwaiting(s, []);
  eq(s.combat.attacks.map((a) => a.defender), [2], "declared with none: Trey's attacks him; Rob's is required to attack no one it can");
}

/* ---- "whenever a player attacks one of your opponents" ---- */
{
  const s = play("both opponents", [at(0, "battlefield", "Combat Calligrapher", "Bear", "Bird")], [{to: {turn: 4, phase: "MAIN1"}}], {seats: 3});
  const choice = toDeclaration(s);
  resolveAwaiting(s, pick(choice, [[named(s, "Bear")[0].id, 1], [named(s, "Bird")[0].id, 2]]));
  /* Two of Rob's triggers at once: he orders them (CR 603.3b). */
  if (s.awaiting?.kind === "order-triggers") resolveAwaiting(s, awaitingChoice(s).options.map((o) => o.index));
  eq(s.stack.length, 2, "Rob attacks Maya and Trey: two triggers, one for each opponent attacked");
  for (let n = 0; n < 10 && s.stack.length; n += 1) passPriority(s);
  const inklings = named(s, "Inkling");
  eq(inklings.map((i) => [i.controller, i.tapped, i.token]), [[0, true, true], [0, true, true]], "two Inklings, Rob's, tapped");
  eq(s.combat.attacks.filter((a) => inklings.some((i) => i.id === a.attacker)).map((a) => a.defender).sort(), [1, 2], "one attacking each of them");
}
{
  /* Maya attacks Rob and Trey: only Trey is Rob's opponent among them -- one trigger, and Maya creates the Inkling. */
  const s = play("Maya attacks", [at(0, "battlefield", "Combat Calligrapher"), at(1, "battlefield", "Bear", "Bird")], [{to: {turn: 2, phase: "MAIN1"}}], {seats: 3});
  const choice = toDeclaration(s);
  resolveAwaiting(s, pick(choice, [[named(s, "Bear")[0].id, 0], [named(s, "Bird")[0].id, 2]]));
  eq(s.stack.length, 1, "attacking Rob triggers nothing; attacking Trey, one");
  passPriority(s); passPriority(s); passPriority(s);
  const inkling = named(s, "Inkling")[0];
  eq([inkling?.controller, s.combat.attacks.find((a) => a.attacker === inkling?.id)?.defender], [1, 2], "Maya creates it, attacking Trey");
}
{
  const s = play("Maya attacks Rob", [at(0, "battlefield", "Combat Calligrapher"), at(1, "battlefield", "Bear")], [{to: {turn: 2, phase: "MAIN1"}}]);
  const choice = toDeclaration(s);
  resolveAwaiting(s, pick(choice, [[named(s, "Bear")[0].id, 0]]));
  eq([s.stack.length, named(s, "Inkling").length], [0, 0], "two seats, Maya attacks Rob: he is not one of his own opponents, and nothing triggers");
}

/* ---- the schema, and the catalog ---- */
{
  const script = (ability) => ({schema: "CrankCardScript@1", identity: {name: "Test", oracleId: "00000000-0000-4000-8000-000000000000", types: ["Enchantment"], manaCost: "{W}"},
    oracleText: "Creatures can't attack you.", source: "hand", abilities: [{kind: "static", text: "Creatures can't attack you.", rule: "cant-attack", affects: {types: ["Creature"]}, ...ability}]});
  ok(validateScript(script({defender: "you"})).valid && validateScript(script({defender: "owner"})).valid && validateScript(script({defender: "attacked"})).valid && validateScript(script({})).valid,
    "the schema takes whom: you, its owner, a player it attacked this turn, or anyone");
  ok(!validateScript(script({defender: "everyone"})).valid, "and refuses another word");
  ok(!validateScript(script({unless: {present: {types: ["Land"]}, atLeast: 0}})).valid, "and an unless that is not a condition");
}
eq(missingFor({statics: ["CantAttack"]}), [], "the catalog credits CantAttack");
for (const name of ["Combat Calligrapher", "Sandwurm Convergence", "Bloodthirster", "Port Razer"]) ok(index.resolve(name)?.playable === true, `${name} is defined and playable`);

console.log(`engine-attack-restrictions: ${checks} checks passed -- whom a creature can't attack (you, its owner, a player it attacked this turn, anyone; unless a condition), before any requirement; "whenever a player attacks one of your opponents", once per opponent attacked, the attacking player's tapped and attacking token.`);
