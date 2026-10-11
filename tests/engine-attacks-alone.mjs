/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* "ATTACKS ALONE" (CR 506.5), "FOR EACH CARD YOU'VE DISCARDED THIS TURN" (CR 701.9a), AND "DURING COMBAT, PLAYERS CAN'T CAST
 * SPELLS OR ACTIVATE ABILITIES THAT AREN'T MANA ABILITIES" (CR 506.1, 602.5; Train C phase 2, p6-combat).
 *
 * A creature attacks alone when it is the only creature declared as an attacker (rules/trigger.mjs, `alone`): one put onto
 * the battlefield attacking was never declared (CR 508.4) and changes nothing, and one a requirement adds to the declaration
 * (goad) was declared. "Attacks a player alone" is a player, not a planeswalker (CR 506.3). The cards' scenarios play
 * Ironsoul Enforcer, Thoughtweft Imbuer, Jiang Yanggu and Yuriko; this suite holds four players, an attacker joined after
 * the declaration, goad, every way a card is discarded and the turn that clears the count, the lock on every zone's
 * abilities and on a commander, and the compiler's refusals.
 */
import assert from "node:assert/strict";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {validateScript} from "../game/engine/script/schema.mjs";
import {awaitingChoice, resolveAwaiting, advance} from "../game/engine/rules/turn.mjs";
import {legalActions, applyAction} from "../game/engine/rules/actions.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {runEffect} from "../game/engine/script/effects/index.mjs";
import {amountOf} from "../game/engine/script/amount.mjs";
import {STATIC_RULES, activationForbidden, castForbidden} from "../game/engine/rules/statics.mjs";
import {characteristicsOf} from "../game/engine/rules/layers.mjs";
import {beginResolution} from "../game/engine/script/resolution.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const creature = (subtypes = ["Bear"], p = 2) => ({types: ["Creature"], subtypes, manaCost: "{1}", colors: ["G"], power: p, toughness: p});
const FIX = {
  Bear: creature(), Wolf: creature(["Wolf"]), Hound: creature(["Hound"]),
  /* "Whenever this creature attacks, create a 1/1 token that's tapped and attacking" -- one put onto the battlefield attacking. */
  Herald: {...creature(["Human"]), abilities: [{id: "h", kind: "triggered", text: "Whenever this creature attacks, create a 1/1 Spirit that's tapped and attacking.",
    trigger: {on: "GameEventAttackersDeclared", who: "self"}, effects: [{effect: "createToken", count: 1, tapped: true, attacking: true,
      token: {name: "Spirit", types: ["Creature"], subtypes: ["Spirit"], colors: ["W"], power: 1, toughness: 1}}]}]},
  Cycler: {types: ["Creature"], manaCost: "{3}", colors: ["U"], power: 2, toughness: 2, abilities: [{id: "cy", kind: "activated", zone: "hand", cycling: true, text: "Cycling {C}",
    cost: [{atom: "mana", cost: "{C}"}, {atom: "discard", self: true}], targets: [], effects: [{effect: "draw", count: 1}]}]},
  Grinder: {types: ["Artifact"], manaCost: "{1}", colors: [], abilities: [{id: "g", kind: "activated", text: "Discard a card: You gain 1 life.",
    cost: [{atom: "discard"}], targets: [], effects: [{effect: "gainLife", amount: 1}]}]},
  Echo: {types: ["Creature"], manaCost: "{2}", colors: ["B"], power: 1, toughness: 1, abilities: [{id: "gy", kind: "activated", zone: "graveyard", text: "{C}: Return this card to your hand.",
    cost: [{atom: "mana", cost: "{C}"}], targets: [], effects: [{effect: "moveZone", targets: "self", to: "hand"}]}]},
  Captain: {types: ["Creature"], subtypes: ["Soldier"], manaCost: "{C}", colors: ["W"], power: 2, toughness: 2},
  Tithe: {types: ["Sorcery"], manaCost: "{C}", colors: ["B"], spell: {id: "s", text: "As an additional cost to cast this spell, discard a card. You gain 1 life.",
    additionalCost: [{atom: "discard"}], targets: [], effects: [{effect: "gainLife", amount: 1}]}},
  /* A lock of another shape than Yuriko's, to hold activationForbidden to what it says: "your opponents", only while the
     holder is untapped. */
  Warden: {types: ["Artifact"], manaCost: "{1}", colors: [], abilities: [{id: "w", kind: "static", text: "During combat, your opponents can't activate abilities.",
    rule: "cant-activate", affects: {what: "player", who: "opponent"}, duringCombat: true, condition: {present: {what: "permanent", self: true, tapped: false}}}]},
};
const play = (setup, seats = 2, extra = {}) => runScenario({name: "attacks alone", seats, setup, ...extra}, index.definition, FIX).state;
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const idOf = (s, card, seat) => s.zones.battlefield.find((id) => s.objects[id].card === card && s.objects[id].controller === seat);
/* On to this turn's declaration (asking nothing else), then declare: [card name, defender seat]. */
function attack(s, picks) {
  for (let n = 0; n < 400 && s.awaiting?.kind !== "declare-attackers"; n += 1) {
    if (s.awaiting) { resolveAwaiting(s, awaitingChoice(s).options.slice(0, awaitingChoice(s).min ?? 0).map((o) => o.index)); continue; }
    if (s.priorityPlayer === null) advance(s); else if (passPriority(s).outcome === "step-ends") advance(s);
  }
  const options = awaitingChoice(s).options;
  resolveAwaiting(s, picks.map(([name, defender]) => options.find((o) => s.objects[o.cardId].card === name && o.defenderId === defender && o.planeswalkerId === undefined).index));
}
/* Every question answered with its first answer, the stack resolved, until it is empty. */
function settle(s) {
  for (let n = 0; n < 400 && (s.awaiting || s.stack.length); n += 1) {
    if (s.awaiting) { const c = awaitingChoice(s); resolveAwaiting(s, c.options.slice(0, Math.max(1, c.min ?? 0)).map((o) => o.index)); continue; }
    passPriority(s);
  }
}
const pt = (s, name) => { const c = characteristicsOf(s, idOf(s, name, 0)); return `${c.power}/${c.toughness}`; };
const triggered = (s, source) => [...(s.pendingTriggers ?? []), ...s.stack.filter((e) => e.kind === "trigger")]
  .filter((t) => (t.source?.name ?? s.objects[t.cardId]?.card) === source || t.cardId === idOf(s, source, 0)).length;

/* ---- attacks alone, at a table of four ---- */
{
  const s = play([at(0, "battlefield", "Thoughtweft Imbuer", "Bear", "Wolf")], 4);
  attack(s, [["Bear", 2]]);
  eq(triggered(s, "Thoughtweft Imbuer"), 1, "four players: the Bear alone attacks Trey -- it attacks alone, and the Imbuer triggers");
  settle(s);
  eq(pt(s, "Bear"), "3/3", "and the Bear gets +1/+1 for the one Kithkin Rob controls, the Imbuer");
}
{
  const s = play([at(0, "battlefield", "Thoughtweft Imbuer", "Bear", "Wolf")], 4);
  attack(s, [["Bear", 1], ["Wolf", 3]]);
  eq(triggered(s, "Thoughtweft Imbuer"), 0, "the Bear attacks Maya and the Wolf attacks Sam: two declared, so neither attacks alone -- whoever they attack");
}
{
  /* One declared, and a token put onto the battlefield attacking by its own trigger: the declared one attacked alone (CR
     506.5), and the token never attacked at all (CR 508.4) -- the Imbuer triggers once, for the Herald. */
  const s = play([at(0, "battlefield", "Thoughtweft Imbuer", "Herald")]);
  attack(s, [["Herald", 1]]);
  eq(triggered(s, "Thoughtweft Imbuer"), 1, "the Herald is declared alone and its trigger makes a Spirit tapped and attacking: the Imbuer triggers once");
  settle(s);
  const spirit = idOf(s, "Spirit", 0);
  ok(s.combat.attacks.some((a) => a.attacker === spirit), "the Spirit is attacking");
  eq([pt(s, "Herald"), pt(s, "Spirit")], ["3/3", "1/1"], "the Herald, which attacked alone, got +1/+1; the Spirit, which never attacked, nothing");
}
{
  /* Goad (CR 701.15b, 508.1d): a creature the declaration had to include was declared -- two attackers, not one alone. */
  const s = play([at(0, "battlefield", "Thoughtweft Imbuer", "Bear", "Wolf")], 3);
  runEffect(s, {effect: "goad", targets: [idOf(s, "Wolf", 0)]}, {controller: 1, source: null});
  attack(s, [["Bear", 2]]);
  eq(s.combat.attacks.length, 2, "the goaded Wolf attacks too, declared with the Bear");
  eq(triggered(s, "Thoughtweft Imbuer"), 0, "so the Bear does not attack alone, and nothing triggers");
}
{
  /* "Whenever this creature or a commander you control attacks alone" (Ironsoul Enforcer): another player's commander is not
     one Rob controls. */
  const s = play([at(0, "battlefield", "Ironsoul Enforcer"), at(1, "command", "Captain"), at(1, "battlefield", "Wastes")]);
  for (let n = 0; n < 100 && !(s.turn === 2 && s.phase === "MAIN1" && s.priorityPlayer === 1); n += 1) {
    if (s.awaiting) { resolveAwaiting(s, awaitingChoice(s).options.slice(0, awaitingChoice(s).min ?? 0).map((o) => o.index)); continue; }
    if (s.priorityPlayer === null) advance(s); else if (passPriority(s).outcome === "step-ends") advance(s);
  }
  applyAction(s, 1, legalActions(s, 1).find((a) => a.kind === "activate-mana"));
  applyAction(s, 1, legalActions(s, 1).find((a) => a.kind === "cast" && a.label === "Captain"));
  settle(s);
  for (let n = 0; n < 200 && !(s.turn === 4 && s.awaiting?.kind === "declare-attackers"); n += 1) {
    if (s.awaiting) { resolveAwaiting(s, awaitingChoice(s).options.slice(0, awaitingChoice(s).min ?? 0).map((o) => o.index)); continue; }
    if (s.priorityPlayer === null) advance(s); else if (passPriority(s).outcome === "step-ends") advance(s);
  }
  const options = awaitingChoice(s).options;
  resolveAwaiting(s, [options.find((o) => s.objects[o.cardId].card === "Captain").index]);
  eq(triggered(s, "Ironsoul Enforcer"), 0, "Maya's commander attacks Rob alone: not a commander Rob controls, and the Enforcer does not trigger");
}

/* ---- the cards a player has discarded this turn ---- */
{
  const s = play([at(0, "battlefield", "Wastes", "Wastes", "Grinder"), at(0, "hand", "Cycler", "Tithe", "Island", "Mountain", "Plains"), at(1, "hand", "Forest")]);
  const count = (who = "you", about = undefined) => amountOf(s, {cardsDiscardedThisTurn: who}, {controller: 0, ...(about !== undefined ? {about: {player: about}} : {})});
  eq(count(), 0, "none discarded yet");
  applyAction(s, 0, legalActions(s, 0).find((a) => a.kind === "activate-mana"));
  applyAction(s, 0, legalActions(s, 0).find((a) => a.kind === "activate" && a.label === "Cycler"));
  settle(s);
  eq(count(), 1, "cycling a card discards it (CR 702.29a): one");
  applyAction(s, 0, legalActions(s, 0).find((a) => a.kind === "activate" && a.label === "Grinder" && (a.costNames ?? []).includes("Island")));
  settle(s);
  eq(count(), 2, "\"Discard a card:\" as a cost: two");
  applyAction(s, 0, legalActions(s, 0).find((a) => a.kind === "activate-mana"));
  applyAction(s, 0, legalActions(s, 0).find((a) => a.kind === "cast" && a.label === "Tithe" && (a.costNames ?? []).includes("Mountain")));
  settle(s);
  eq(count(), 3, "and as a spell's additional cost (CR 601.2b): three");
  eq([count("that player", 1), count("you", undefined)], [0, 3], "Maya has discarded none; \"that player\" counts the player it is about");
  /* At cleanup, down to seven: Rob is handed eight cards first. */
  for (let i = 0; i < 8; i += 1) runEffect(s, {effect: "draw", count: 1}, {controller: 0});
  for (let n = 0; n < 200 && s.awaiting?.kind !== "discard-to-hand-size"; n += 1) {
    if (s.awaiting) { resolveAwaiting(s, []); continue; }
    if (s.priorityPlayer === null) advance(s); else if (passPriority(s).outcome === "step-ends") advance(s);
  }
  const extra = s.awaiting.count;
  resolveAwaiting(s, awaitingChoice(s).options.slice(0, extra).map((o) => o.index));
  eq(count(), 3 + extra, "the discard to hand size at cleanup is counted too");
  for (let n = 0; n < 50 && s.turn === 1; n += 1) {
    if (s.awaiting) { resolveAwaiting(s, []); continue; }
    if (s.priorityPlayer === null) advance(s); else if (passPriority(s).outcome === "step-ends") advance(s);
  }
  eq([s.turn, count()], [2, 0], "and the next turn begins with none (rules/turn.mjs)");
  const asked = beginResolution(s, [{effect: "discard", count: 1, who: "opponent"}], {controller: 1});
  eq([asked.status, s.awaiting?.player], ["waiting", 0], "Maya's \"each opponent discards a card\": Rob is asked");
  resolveAwaiting(s, [0]);
  eq([count(), count("that player", 1)], [1, 0], "and the discard is Rob's (CR 701.9a), none of Maya's");
}

/* ---- "during combat, players can't cast spells or activate abilities that aren't mana abilities" ---- */
{
  const s = play([at(0, "battlefield", "Yuriko, Blade of the Mighty", "Bear", "Wastes", "Wastes", "Wastes"), at(0, "hand", "Cycler"), at(0, "graveyard", "Echo"), at(0, "command", "Captain")]);
  const kinds = () => legalActions(s, 0).map((a) => `${a.kind}:${a.label ?? ""}`);
  /* A mana ability first: an ability's cost is paid from the pool (rules/actions.mjs). */
  const tap = () => applyAction(s, 0, legalActions(s, 0).find((a) => a.kind === "activate-mana"));
  tap();
  ok(kinds().includes("activate:Cycler") && kinds().includes("activate:Echo") && kinds().includes("cast:Captain"),
    "in Rob's main phase: cycling from his hand, the graveyard's ability, his commander from the command zone -- all offered");
  eq([castForbidden(s, 0, s.zones.command[0][0]), activationForbidden(s, 0)], [false, false], "nothing forbidden outside combat");
  for (let n = 0; n < 20 && s.phase !== "COMBAT_BEGIN"; n += 1) { if (passPriority(s).outcome === "step-ends") advance(s); }
  eq(s.phase, "COMBAT_BEGIN", "the beginning of combat");
  ok(kinds().includes("activate-mana:Wastes"), "a mana ability is still offered (CR 605.3a)");
  tap();
  eq(kinds().filter((k) => !k.startsWith("activate-mana") && k !== "pass:"), [], "the beginning of combat is combat (CR 506.1): no cast, no activation -- from the hand, the graveyard or the command zone");
  attack(s, [["Bear", 1]]);
  passPriority(s);
  eq(s.priorityPlayer, 1, "Maya holds priority in the declare attackers step");
  eq([activationForbidden(s, 1), activationForbidden(s, 0)], [true, true], "players: Maya and Rob both");
  settle(s);
  for (let n = 0; n < 40 && s.phase !== "MAIN2"; n += 1) {
    if (s.awaiting) { resolveAwaiting(s, []); continue; }
    if (s.priorityPlayer === null) advance(s); else if (passPriority(s).outcome === "step-ends") advance(s);
  }
  tap();
  ok(kinds().includes("activate:Cycler") && kinds().includes("cast:Captain"), "combat over, both offered again");
  runEffect(s, {effect: "destroy", targets: [idOf(s, "Yuriko, Blade of the Mighty", 0)]}, {controller: 1, source: null});
  s.phase = "COMBAT_DECLARE_ATTACKERS";
  eq(activationForbidden(s, 0), false, "Yuriko gone, combat locks nothing");
}
{
  /* Another player's combat: "players", whosever turn it is. */
  const s = play([at(1, "battlefield", "Yuriko, Blade of the Mighty")], 3);
  s.phase = "COMBAT_DAMAGE";
  eq([0, 1, 2].map((p) => activationForbidden(s, p)), [true, true, true], "Maya's Yuriko, Rob's combat: every player is locked");
}
{
  /* What the lock's `affects` and condition say, read: "your opponents", while its holder is untapped. */
  const s = play([at(1, "battlefield", "Warden")], 3);
  s.phase = "COMBAT_DECLARE_BLOCKERS";
  eq([0, 1, 2].map((p) => activationForbidden(s, p)), [true, false, true], "\"your opponents\": Rob and Trey, not Maya");
  s.objects[idOf(s, "Warden", 1)].tapped = true;
  eq([0, 1, 2].map((p) => activationForbidden(s, p)), [false, false, false], "its condition false, nobody");
}
{
  const amountProblems = (await import("../game/engine/script/amount.mjs")).amountProblems;
  eq(amountProblems({cardsDiscardedThisTurn: "you"}), [], "cardsDiscardedThisTurn of \"you\" is an amount");
  ok(amountProblems({cardsDiscardedThisTurn: "opponent"}).length > 0, "of anyone else but \"that player\", refused");
}

/* ---- the compiler and the schema ---- */
{
  const identity = {name: "Odd", oracleId: "x", types: ["Creature"], subtypes: [], manaCost: "{1}", colors: [], colorIdentity: [], power: 1, toughness: 1};
  const script = (abilities) => ({schema: "CrankCardScript@1", identity, oracleText: abilities.map((a) => a.text).join("\n"), source: "hand", abilities});
  const attackTrigger = (more) => [{kind: "triggered", text: "Whenever this creature attacks alone, draw a card.", trigger: {on: "attacks", ...more}, effects: [{effect: "draw", count: 1}]}];
  eq(compileScript(script(attackTrigger({alone: true}))).definition.abilities[0].trigger.alone, true, "alone: true compiles to the trigger rules/trigger.mjs reads");
  eq(compileScript(script(attackTrigger({alone: true, defender: "player"}))).definition.abilities[0].trigger.defender, "player", "and \"a player\" with it");
  ok(compileScript(script(attackTrigger({alone: "yes"}))).problems.some((p) => /does not watch for/.test(p)), "alone is true or absent: anything else is refused, not ignored");
  ok(compileScript(script(attackTrigger({defender: "planeswalker"}))).problems.some((p) => /does not watch for/.test(p)), "a defender it does not know is refused");
  const lock = (more) => [{kind: "static", text: "During combat, players can't cast spells.", rule: "cant-cast", affects: {what: "player"}, ...more}];
  ok(validateScript(script(lock({duringCombat: true}))).valid, "cant-cast during combat is a script");
  ok(!validateScript(script([{kind: "static", text: "x", rule: "cant-activate", affects: {what: "player"}}])).valid, "cant-activate says when: during combat, the one form built");
  ok(!validateScript(script([{kind: "static", text: "x", rule: "cant-block", affects: {self: true}, duringCombat: true}])).valid, "duringCombat on any other rule is refused");
  ok(!validateScript(script(lock({duringCombat: false}))).valid, "and duringCombat is true or absent");
  eq(compileScript(script([{kind: "static", text: "During combat, your opponents can't activate abilities as long as this is untapped.", rule: "cant-activate",
    affects: {what: "player", who: "opponent"}, duringCombat: true, condition: {present: {what: "permanent", self: true, tapped: false}}}])).problems, [],
    "a cant-activate static reads its own condition, so one with a condition compiles");
  eq(STATIC_RULES["cant-activate"], "rules/actions.mjs", "cant-activate is a rule rules/actions.mjs reads");
}

console.log(`engine-attacks-alone: ${checks} checks passed -- attacks alone at four seats, after a joined attacker and goad; another's commander; discards by cost, cycling, cleanup and effect, cleared as a turn begins; the combat lock on every zone, for every player; the compiler's refusals.`);
