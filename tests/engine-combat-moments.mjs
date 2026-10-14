/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* COMBAT'S OTHER MOMENTS (Train C phase 2, p6-combat): delayed triggers "at end of combat" (CR 511.2; Wall of Junk) and "at
 * the beginning of the declare attackers step on your next turn" (Meandering Towershell), with what they need --
 *
 *   a step whose turn-based action stops to ask (declaring attackers, CR 508.1; the held draw) has its beginning read for
 *   triggers as it begins (rules/turn.mjs): before this, what triggered there was lost whenever the step asked, "at the
 *   beginning of your draw step" under the held draw among them;
 *   a creature put onto the battlefield attacking when nothing was declared still makes an attack (CR 508.8), the active
 *   player's alone (CR 506.3b);
 *   and one put onto the battlefield attacking may attack a planeswalker of a defending player's (CR 508.4), its
 *   controller's choice (effects/asking.mjs, attackWhom);
 *   and Islandwalk (CR 702.14c), forestwalk's rule for Islands.
 */
import assert from "node:assert/strict";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {awaitingChoice, resolveAwaiting, advance, beginGame} from "../game/engine/rules/turn.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {runEffect} from "../game/engine/script/effects/index.mjs";
import {beginResolution} from "../game/engine/script/resolution.mjs";
import {canBlockAttacker, KEYWORD_FAMILIES} from "../game/engine/keywords/combat.mjs";
import {isKeyword} from "../game/engine/vocabulary.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const creature = (subtypes, p = 2, extra = {}) => ({types: ["Creature"], subtypes, manaCost: "{1}", colors: ["G"], power: p, toughness: p, ...extra});
const WALKER = {types: ["Planeswalker"], subtypes: ["Fixture"], manaCost: "{2}", colors: ["U"], loyalty: 5};
const FIX = {Bear: creature(["Bear"]), Wolf: creature(["Wolf"]), Hound: creature(["Hound"]), Walker: WALKER, Sage: {...WALKER, subtypes: ["Sage"]},
  /* A land with the subtype Island that is not a basic Island (CR 305.6, 702.14c). */
  Tundra: {types: ["Land"], subtypes: ["Plains", "Island"], abilities: [{id: "t", kind: "mana", tapSelf: true, produces: {W: 1}}]}};
const play = (setup, seats = 2) => runScenario({name: "moments", seats, setup}, index.definition, FIX).state;
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const idOf = (s, card, seat) => s.zones.battlefield.find((id) => s.objects[id].card === card && s.objects[id].controller === seat);
const exiled = (s, card) => s.zones.exile.some((id) => s.objects[id].card === card);
/* The rules loop with nobody choosing anything: no attackers unless told, no blockers, triggers in the order offered. */
function step(s) {
  if (s.awaiting) { const c = awaitingChoice(s); resolveAwaiting(s, s.awaiting.kind === "order-triggers" ? c.options.map((o) => o.index) : c.options.slice(0, c.min ?? 0).map((o) => o.index)); return; }
  if (s.priorityPlayer === null) advance(s); else if (passPriority(s).outcome === "step-ends") advance(s);
}
function to(s, turn, phase) { for (let n = 0; n < 2000 && !(s.turn === turn && s.phase === phase && !s.awaiting); n += 1) step(s); }
function declare(s, turn, names) {
  for (let n = 0; n < 2000 && !(s.turn === turn && s.awaiting?.kind === "declare-attackers"); n += 1) step(s);
  const options = awaitingChoice(s).options;
  resolveAwaiting(s, names.map((name) => options.find((o) => s.objects[o.cardId].card === name && o.planeswalkerId === undefined).index));
}

/* ---- a step that asks has begun: the held draw, and declaring attackers ---- */
{
  const WASTES = {card: "Wastes", types: ["Land"], supertypes: ["Basic"], abilities: [{id: "a0", kind: "mana", tapSelf: true, produces: {C: 1}}]};
  const s = createState({matchId: "m", seed: "beat", players: [{name: "Rob"}, {name: "Maya"}]});
  s.drawBeat = true;
  for (let seat = 0; seat < 2; seat += 1) for (let i = 0; i < 10; i += 1) addObject(s, {...WASTES, owner: seat, controller: seat}, "library", seat);
  addObject(s, {card: "Dial", types: ["Enchantment"], owner: 0, controller: 0, abilities: [{id: "d", kind: "triggered", text: "At the beginning of your draw step, you gain 1 life.",
    trigger: {on: "GameEventTurnPhase", phase: "DRAW", yourTurn: true}, effects: [{effect: "gainLife", amount: 1}]}]}, "battlefield", null);
  beginGame(s);
  for (let n = 0; n < 400 && !(s.turn === 3 && s.phase === "DRAW" && s.awaiting?.kind === "draw-card"); n += 1) step(s);
  eq(s.awaiting?.kind, "draw-card", "Rob's draw step, turn 3, the draw held for his click");
  eq((s.pendingTriggers ?? []).map((t) => t.abilityId), ["d"], "\"at the beginning of your draw step\" has triggered as the step began, and waits");
  resolveAwaiting(s, [0]);
  to(s, 3, "MAIN1");
  eq(s.players[0].life, 41, "and resolves, every draw step of Rob's: turn 3's under the held draw (it was lost there) -- and none on turn 1, when Rob, first in a two-player game, had no draw step (CR 103.8a)");
}
{
  /* Towershell's return with a creature declared: the declaration asks, and the step's beginning is read before it. */
  const s = play([at(0, "battlefield", "Meandering Towershell", "Bear")]);
  declare(s, 1, ["Meandering Towershell"]);
  for (let n = 0; n < 50 && s.stack.length; n += 1) step(s);
  ok(exiled(s, "Meandering Towershell"), "it attacks and is exiled");
  declare(s, 3, ["Bear"]);
  eq(s.stack.map((e) => e.abilityId), ["delayed"], "Rob declares the Bear on his next turn: the return, triggered as the step began, is on the stack after the declaration");
  for (let n = 0; n < 50 && s.stack.length; n += 1) step(s);
  const shell = idOf(s, "Meandering Towershell", 0);
  eq([s.objects[shell].tapped, s.combat.attacks.map((a) => s.objects[a.attacker]?.card).filter(Boolean).sort()], [true, ["Bear", "Meandering Towershell"]],
    "it is back, tapped and attacking beside the Bear");
}

/* ---- "on your next turn": not another player's, not this turn's second combat ---- */
{
  const s = play([at(0, "battlefield", "Meandering Towershell")], 3);
  declare(s, 1, ["Meandering Towershell"]);
  for (let n = 0; n < 50 && s.stack.length; n += 1) step(s);
  runEffect(s, {effect: "addPhase", phases: ["combat"]}, {controller: 0, source: null});
  to(s, 1, "END_OF_TURN");
  eq(s.combatsThisTurn, 2, "an additional combat phase this turn (CR 500.8), its declare attackers step with it");
  ok(exiled(s, "Meandering Towershell"), "and the Towershell still in exile -- this turn is not its next turn");
  to(s, 3, "MAIN2");
  ok(exiled(s, "Meandering Towershell"), "Maya's and Trey's declare attackers steps pass it by");
  to(s, 4, "COMBAT_DECLARE_ATTACKERS");
  for (let n = 0; n < 50 && s.stack.length; n += 1) step(s);
  ok(idOf(s, "Meandering Towershell", 0) !== undefined && !exiled(s, "Meandering Towershell"), "Rob's next turn: back");
  eq(s.delayedTriggers.filter((d) => d.at === "your next declare attackers"), [], "and the delayed trigger is gone, once (CR 603.7b)");
}

/* ---- an attack made of a creature put onto the battlefield attacking ---- */
{
  const s = play([at(0, "battlefield", "Bear")]);
  to(s, 1, "COMBAT_DECLARE_ATTACKERS");
  eq(s.combat ?? null, null, "nothing declared: no combat");
  beginResolution(s, [{effect: "createToken", count: 1, tapped: true, attacking: true, token: {name: "Spirit", types: ["Creature"], subtypes: ["Spirit"], colors: ["W"], power: 1, toughness: 1}}], {controller: 0});
  eq(s.combat?.attacks?.map((a) => [s.objects[a.attacker].card, a.defender]), [["Spirit", 1]], "a token put onto the battlefield attacking in that step: an attack of Rob's on Maya (CR 508.8)");
  to(s, 1, "MAIN2");
  eq(s.players[1].life, 39, "the declare blockers and combat damage steps happened, and the Spirit dealt its 1");
}
{
  const s = play([at(1, "battlefield", "Bear")]);
  to(s, 1, "COMBAT_DECLARE_ATTACKERS");
  beginResolution(s, [{effect: "createToken", count: 1, tapped: true, attacking: true, token: {name: "Spirit", types: ["Creature"], subtypes: ["Spirit"], colors: ["W"], power: 1, toughness: 1}}], {controller: 1});
  eq(s.combat ?? null, null, "Maya's token on Rob's turn: she is no attacking player, and it never attacks (CR 506.3b)");
}
{
  const s = play([at(0, "battlefield", "Bear")]);
  to(s, 1, "COMBAT_BEGIN");
  beginResolution(s, [{effect: "createToken", count: 1, tapped: true, attacking: true, token: {name: "Spirit", types: ["Creature"], subtypes: ["Spirit"], colors: ["W"], power: 1, toughness: 1}}], {controller: 0});
  eq(s.combat ?? null, null, "at the beginning of combat, before any attack: none is made");
}

/* ---- which player or planeswalker (CR 508.4) ---- */
{
  const s = play([at(0, "battlefield", "Bear", "Sage"), at(1, "battlefield", "Walker")]);
  declare(s, 1, ["Bear"]);
  beginResolution(s, [{effect: "createToken", count: 1, tapped: true, attacking: true, token: {name: "Spirit", types: ["Creature"], subtypes: ["Spirit"], colors: ["W"], power: 1, toughness: 1}}], {controller: 0});
  eq(awaitingChoice(s).options.map((o) => o.label), ["Maya", "Walker (Maya)"], "one opponent with a planeswalker: Rob is asked which -- Maya, or her Walker; never his own Sage");
  resolveAwaiting(s, [1]);
  const spirit = s.combat.attacks.find((a) => s.objects[a.attacker]?.card === "Spirit");
  eq([spirit.defender, s.objects[spirit.planeswalker]?.card], [1, "Walker"], "the Spirit attacks the Walker, Maya defending it");
}
{
  const s = play([at(0, "battlefield", "Bear")]);
  declare(s, 1, ["Bear"]);
  beginResolution(s, [{effect: "createToken", count: 1, tapped: true, attacking: true, token: {name: "Spirit", types: ["Creature"], subtypes: ["Spirit"], colors: ["W"], power: 1, toughness: 1}}], {controller: 0});
  eq([s.awaiting, s.combat.attacks.length], [null, 2], "one opponent and no planeswalker: nothing to ask");
}

/* ---- at end of combat ---- */
{
  const s = play([at(0, "battlefield", "Bear")]);
  declare(s, 1, ["Bear"]);
  runEffect(s, {effect: "delayedTrigger", at: "end of combat", text: "x", effects: [{effect: "gainLife", amount: 3}]}, {controller: 0, source: null});
  to(s, 1, "COMBAT_DAMAGE");
  eq(s.players[0].life, 40, "made in the declare attackers step: not yet in the damage step");
  to(s, 1, "MAIN2");
  eq(s.players[0].life, 43, "at the end of combat step's beginning: done");
  runEffect(s, {effect: "delayedTrigger", at: "end of combat", text: "x", effects: [{effect: "gainLife", amount: 1}]}, {controller: 0, source: null});
  to(s, 3, "MAIN2");
  eq(s.players[0].life, 44, "made after combat: the next end of combat -- Maya's turn's, a combat with no attack in it");
}

/* ---- Islandwalk ---- */
{
  const s = play([at(0, "battlefield", "Bear"), at(1, "battlefield", "Wolf", "Island"), at(2, "battlefield", "Island", "Hound")], 3);
  const bear = idOf(s, "Bear", 0), wolf = idOf(s, "Wolf", 1);
  runEffect(s, {effect: "pump", targets: [bear], power: 0, toughness: 0, keywords: ["Islandwalk"]}, {controller: 0, source: null});
  declare(s, 1, []);
  s.combat = {attackingPlayerId: 0, defenders: [1], attacks: [{attacker: bear, defender: 1, blocked: false, blockers: []}], firstStrike: false};
  eq(canBlockAttacker(s, wolf, bear), false, "Maya controls an Island: her Wolf can't block the islandwalker");
  runEffect(s, {effect: "moveZone", targets: [idOf(s, "Island", 1)], to: "hand"}, {controller: 1, source: null});
  eq(canBlockAttacker(s, wolf, bear), true, "her Island gone -- Trey's Island is not hers: it may block");
  const tundra = addObject(s, {...FIX.Tundra, card: "Tundra", owner: 1, controller: 1}, "battlefield", null);
  eq(canBlockAttacker(s, wolf, bear), false, "a land that is an Island and not a basic one: islandwalk again");
  void tundra;
  ok(KEYWORD_FAMILIES.evasion.includes("Islandwalk") && isKeyword("islandwalk"), "a keyword with behavior, in the vocabulary");
}

/* ---- the compiler ---- */
{
  const identity = {name: "Odd", oracleId: "x", types: ["Creature"], subtypes: [], manaCost: "{1}", colors: [], colorIdentity: [], power: 1, toughness: 1};
  const script = (at) => ({schema: "CrankCardScript@1", identity, oracleText: "x", source: "hand",
    abilities: [{kind: "triggered", text: "x", trigger: {on: "blocks"}, effects: [{effect: "delayedTrigger", at, effects: [{effect: "draw", count: 1}]}]}]});
  eq([compileScript(script("end of combat")).problems, compileScript(script("your next declare attackers")).problems], [[], []], "both moments compile");
  ok(compileScript(script("declare attackers")).problems.some((p) => /no delayed trigger waits for/.test(p)), "any other is refused");
}

console.log(`engine-combat-moments: ${checks} checks passed -- a step that asks has begun (the held draw, the declaration); your next turn's declare attackers step, not another's, not a second combat; an attack made of a creature put onto the battlefield attacking; a planeswalker to attack; end of combat; islandwalk; the compiler.`);
