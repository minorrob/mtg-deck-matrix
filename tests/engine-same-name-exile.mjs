/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* EXILED UNTIL THIS LEAVES, WITH EVERYTHING OF THE SAME NAME (Deputy of Detention; AI 1's Chulane deck, after the live
 * game of 2026-10-04).
 *
 * "When this creature enters, exile target nonland permanent an opponent controls and all other nonland permanents that
 * player controls with the same name as that permanent until this creature leaves the battlefield." exileUntil's
 * `sameName` (script/effects/zones.mjs): one target, and the others read as the exile happens -- not targeted, so hexproof
 * does not save them; that player's, as they control them now; the same name (CR 201.2a); nonland. All returned together,
 * under their owners' control, when it leaves (CR 610.3, 610.3c), however it leaves -- its controller leaving the game
 * included. The card's rulings of 2019-01-25: an illegal target, and nothing is exiled; Deputy gone first, and nothing is.
 */
import assert from "node:assert/strict";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {runEffect} from "../game/engine/script/effects/index.mjs";
import {collectTriggers, openTriggers} from "../game/engine/rules/trigger.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {concede} from "../game/engine/rules/sba.mjs";
import {validateScript} from "../game/engine/script/schema.mjs";
import {createRng} from "../game/engine/rng.mjs";

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const DD = "Deputy of Detention";
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const FIX = {Bear: {types: ["Creature"], subtypes: ["Bear"], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2},
  Fur: {types: ["Enchantment"], subtypes: ["Aura"], manaCost: "{G}", colors: ["G"], enchant: {what: "permanent", types: ["Creature"]}}};
/* Rob has cast Deputy of Detention; it is on the stack. */
const cast = (setup, seats = 2) => runScenario({name: "same name", seats, setup: [at(0, "battlefield", "Plains", "Island", "Wastes"), at(0, "hand", DD), ...setup],
  steps: [{tap: "Plains"}, {tap: "Island"}, {tap: "Wastes"}, {cast: DD}]}, index.definition, FIX).state;
const rng = createRng("same name");
const named = (s, card) => s.zones.battlefield.filter((id) => s.objects[id].card === card);
const exiled = (s) => s.zones.exile.map((id) => s.objects[id].card).sort();
const controls = (s, seat) => s.zones.battlefield.filter((id) => s.objects[id].controller === seat).map((id) => s.objects[id].card).sort();
/* Everyone passes until the stack is empty or something is asked. */
const settle = (s) => { openTriggers(s); for (let n = 0; n < 40 && s.stack.length && !s.awaiting; n += 1) passPriority(s, null, rng); };
/* Deputy resolves, its trigger goes on the stack, and the question of its target is waiting. */
const enter = (s) => { settle(s); return awaitingChoice(s); };
const aim = (s, cardId) => resolveAwaiting(s, [awaitingChoice(s).options.find((o) => o.targets?.[0]?.id === cardId).index], null, rng);
const hexproof = (s, id) => runEffect(s, {effect: "effectUntil", layer: 6, targets: [id], apply: {addKeywords: ["Hexproof"]}, until: "ever"}, {controller: 1, source: null});
const leave = (s, card) => { collectTriggers(s, runEffect(s, {effect: "moveZone", targets: named(s, card), to: "graveyard"}, {controller: 1, source: null})); settle(s); };

{
  /* Not targeted: the Bear with hexproof can't be chosen, and goes anyway with the one that is (the card's ruling). */
  const s = cast([at(1, "battlefield", "Bear", "Bear")]);
  const [shy, plain] = named(s, "Bear");
  hexproof(s, shy);
  eq(enter(s).options.map((o) => o.targets[0].id), [plain], "of Maya's two Bears, only the one without hexproof is a target");
  aim(s, plain);
  settle(s);
  eq([exiled(s), controls(s, 1)], [["Bear", "Bear"], []], "both exiled, the one with hexproof too");
  leave(s, DD);
  eq(controls(s, 1), ["Bear", "Bear"], "Deputy gone: both back, under Maya's control");
}
{
  /* The target illegal as it resolves -- it gained hexproof in response -- and nothing at all is exiled (the card's ruling). */
  const s = cast([at(1, "battlefield", "Bear", "Bear")]);
  enter(s);
  const [first] = named(s, "Bear");
  aim(s, first);
  hexproof(s, first);
  settle(s);
  eq([exiled(s), controls(s, 1)], [[], ["Bear", "Bear"]], "its target illegal, the trigger does nothing: the other Bear stays too");
}
{
  /* Nonland, and only that player's, as they control them now: a land of the name stays, and so does the Bear of Maya's that
     Trey controls (CR 110.2). Each exiled one returns under its owner's control (CR 610.3c). */
  const s = cast([at(1, "battlefield", "Bear", "Bear", "Bear", "Forest")], 3);
  const [target, borrowed] = named(s, "Bear");
  const forest = named(s, "Forest")[0];
  s.objects[forest].card = "Bear";   /* a land named Bear, as a copy effect could name it */
  runEffect(s, {effect: "gainControl", targets: [borrowed]}, {controller: 2, source: null});
  enter(s);
  aim(s, target);
  settle(s);
  eq([exiled(s), controls(s, 1), controls(s, 2)], [["Bear", "Bear"], ["Bear"], ["Bear"]], "Maya's two Bears exiled; her Bear land and the Bear Trey controls stay");
  leave(s, DD);
  eq([controls(s, 1), controls(s, 2)], [["Bear", "Bear", "Bear"], ["Bear"]], "back under Maya, their owner");
}
{
  /* An Aura on one of them is put into its owner's graveyard (CR 704.5m): the permanent it was on is gone (the card's ruling). */
  const s = cast([at(1, "battlefield", "Bear", "Bear"), at(1, "hand", "Fur")]);
  const [target, other] = named(s, "Bear");
  runEffect(s, {effect: "moveZone", targets: s.zones.hand[1].filter((id) => s.objects[id].card === "Fur"), to: "battlefield"}, {controller: 1, source: null});
  const fur = named(s, "Fur")[0];
  runEffect(s, {effect: "attach", source: fur, targets: [other]}, {controller: 1, source: fur});
  eq(s.objects[fur].attachedTo, other, "the Fur on the other Bear");
  enter(s);
  aim(s, target);
  settle(s);
  eq([exiled(s), s.zones.graveyard[1].map((id) => s.objects[id].card)], [["Bear", "Bear"], ["Fur"]], "both Bears exiled, the Aura on one in Maya's graveyard");
}
{
  /* Its controller leaves the game, and Deputy with them (CR 800.4a): what it exiled returns to the players still in it. */
  const s = cast([at(1, "battlefield", "Bear", "Bear"), at(2, "battlefield", "Bear")], 3);
  enter(s);
  aim(s, named(s, "Bear")[0]);
  settle(s);
  eq([exiled(s), controls(s, 2)], [["Bear", "Bear"], ["Bear"]], "Maya's two exiled; Trey's Bear, another player's, stays");
  concede(s, 0);
  eq([controls(s, 1), exiled(s)], [["Bear", "Bear"], []], "Rob concedes: Deputy leaves the game, and Maya's Bears return");
}

/* The schema: what else is exiled is a selector. */
{
  const script = (sameName) => ({schema: "CrankCardScript@1", identity: {name: "Test", oracleId: "t", types: ["Creature"], manaCost: "{1}", power: 1, toughness: 1}, oracleText: "x",
    abilities: [{kind: "triggered", text: "x", trigger: {on: "enters"}, targets: [{what: "permanent"}], effects: [{effect: "exileUntil", targets: {target: 0}, until: "this leaves", sameName}]}]});
  eq(validateScript(script({nonTypes: ["Land"]})).valid, true, "a selector of the others: valid");
  eq(validateScript(script({nonland: true})).valid, false, "a key the selector grammar has not: refused");
}

console.log(`engine-same-name-exile: ${checks} checks passed -- the target and every other nonland permanent of its name that player controls, hexproof or not, exiled until Deputy leaves and returned to their owners; nothing when the target is illegal.`);
