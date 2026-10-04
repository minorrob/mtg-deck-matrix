/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* "EMPOWER JACE N" (the live-game plan of 2026-10-04, its piece P1): "Put N loyalty counters on a Jace token you control.
 * If you don't control one, first create a blue Jace planeswalker token with '[-1]: Surveil 1' and '[-3]: Draw a card.'"
 *
 * `empowerJace` (vocabulary.mjs; script/resolution.mjs) is spliced into the resolution as it reaches the head, as a branch
 * is: a token of its controller's with the subtype Jace -- two or more, and which one is theirs to choose (chooseCard,
 * kept where it is); one, that one; none, the predefined Jace token (script/effects/permanents.mjs) made first, with no
 * printed loyalty, and the counters put on it. A Jace that is a card is no Jace token; another player's is not theirs.
 *
 * And what the empower cards needed beside it: a loyalty ability that adds mana is no mana ability (CR 605.1a; Way of the
 * Pyromancer), and a triggered ability's resolution-time choice by another player is no mode (Plan for All Outcomes:
 * `chooser`, cards/index.mjs), its "up to one" target read by a condition (script/condition.mjs).
 *
 * The card scenarios play the cards. This suite holds the edges.
 */
import assert from "node:assert/strict";
import {legalActions} from "../game/engine/rules/actions.mjs";
import {awaitingChoice} from "../game/engine/rules/turn.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {runEffect, isBuilt} from "../game/engine/script/effects/index.mjs";
import {PREDEFINED_TOKENS} from "../game/engine/script/effects/permanents.mjs";
import {isPrimitive} from "../game/engine/vocabulary.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const spell = (n) => compileScript({schema: "CrankCardScript@1", identity: {name: `Empower ${n}`, oracleId: "x", types: ["Sorcery"], subtypes: [], manaCost: "{0}", colors: ["U"], colorIdentity: ["U"]},
  oracleText: "x", source: "hand", abilities: [{kind: "spell", text: "x", targets: [], effects: [{effect: "empowerJace", count: n}]}]}).definition;
const JACE = PREDEFINED_TOKENS.Jace;
const FIX = {
  "Empower 3": spell(3),
  "Old Jace": {...structuredClone(JACE), card: "Old Jace", token: true, loyalty: 2, manaCost: null},
  "Other Jace": {...structuredClone(JACE), card: "Other Jace", token: true, loyalty: 5, manaCost: null},
  Bear: {types: ["Creature"], subtypes: ["Bear"], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2},
};
const play = (setup, steps = []) => runScenario({name: "empower jace", setup, steps}, index.definition, FIX).state;
const mine = (s, seat = 0) => s.zones.battlefield.filter((id) => s.objects[id].controller === seat);
const jaces = (s, seat = 0) => mine(s, seat).filter((id) => s.objects[id].token && (s.objects[id].subtypes ?? []).includes("Jace"));
const loyalty = (s, id) => s.objects[id].counters?.loyalty ?? 0;
const CAST = [{cast: "Empower 3"}, {resolve: true}];

/* ---- the token ---- */
eq([JACE.name, JACE.types, JACE.subtypes, JACE.colors, JACE.abilities.map((a) => a.loyalty)], ["Jace", ["Planeswalker"], ["Jace"], ["U"], [-1, -3]],
  "a blue Jace planeswalker token with a -1 and a -3");
ok(FIX["Empower 3"] !== null && isPrimitive("empowerJace") && isBuilt("empowerJace"), "empowerJace is a primitive of the catalog, built, and compiles");
assert.throws(() => runEffect(play([]), {effect: "empowerJace", count: 1}, {controller: 0}), /cannot be run directly/, "it runs through a resolution, which can ask which Jace"); checks += 1;

/* ---- none: one made ---- */
{
  const s = play([at(0, "hand", "Empower 3")], CAST);
  const made = jaces(s);
  eq([made.length, loyalty(s, made[0]), s.objects[made[0]].card], [1, 3, "Jace"], "no Jace token: one made, with 3 loyalty");
  eq(legalActions(s, 0).filter((a) => a.kind === "activate" && a.objectId === made[0]).map((a) => a.loyalty), [-1, -3], "and both of its abilities offered");
  const t = play([at(0, "hand", "Empower 3")], [...CAST, {activate: "Jace", ability: "jace-draw"}, {resolve: true}]);
  eq([jaces(t).length, t.zones.hand[0].length], [0, 1], "its -3 at 3: a card drawn, and the token gone with no loyalty");
}
/* ---- one: that one ---- */
{
  const s = play([at(0, "battlefield", "Old Jace"), at(0, "hand", "Empower 3")], CAST);
  eq(jaces(s).map((id) => [s.objects[id].card, loyalty(s, id)]), [["Old Jace", 5]], "one Jace token: 3 more on it, and no other made");
}
/* ---- two: the controller chooses ---- */
{
  const s = play([at(0, "battlefield", "Old Jace", "Other Jace"), at(0, "hand", "Empower 3")], CAST);
  eq([s.awaiting?.player, awaitingChoice(s).options.map((o) => o.label).sort()], [0, ["Old Jace", "Other Jace"]], "two: Rob is asked which");
  const t = play([at(0, "battlefield", "Old Jace", "Other Jace"), at(0, "hand", "Empower 3")], [...CAST, {choose: ["Other Jace"]}]);
  eq(jaces(t).map((id) => [t.objects[id].card, loyalty(t, id)]).sort(), [["Old Jace", 2], ["Other Jace", 8]], "the one chosen gets the 3");
}
/* ---- a Jace card is no Jace token; Maya's token is not Rob's ---- */
{
  const s = play([at(0, "battlefield", "Jace, Multiverse Architect"), at(1, "battlefield", "Old Jace"), at(0, "hand", "Empower 3")], CAST);
  eq([jaces(s).length, loyalty(s, jaces(s)[0]), loyalty(s, jaces(s, 1)[0]), loyalty(s, mine(s).find((id) => s.objects[id].card === "Jace, Multiverse Architect"))], [1, 3, 2, 4],
    "Rob's Jace, Multiverse Architect and Maya's token aside: a token made for Rob, the others untouched");
}
/* ---- a loyalty ability that adds mana uses the stack (CR 605.1a) ---- */
{
  const s = play([at(0, "battlefield", "Way of the Pyromancer", "Old Jace")]);
  const offer = legalActions(s, 0).filter((a) => a.objectId === jaces(s)[0] && a.loyalty === 1);
  eq(offer.map((a) => a.kind), ["activate"], "the granted +1 is an activated ability, not a mana ability");
  const t = play([at(0, "battlefield", "Way of the Pyromancer", "Old Jace")], [{activate: "Old Jace", ability: offer[0].abilityId}]);
  eq([t.stack.length, t.players[0].manaPool.R ?? 0], [1, 0], "activated: on the stack, no mana yet");
}
/* ---- a resolution-time choice by the target's owner, and "up to one" ---- */
{
  const plan = index.definition("Plan for All Outcomes");
  ok(plan.abilities[0].modal === undefined && plan.abilities[0].targets?.length === 1, "Plan's put-back is no mode chosen as it triggers: its target beside it");
  const lands = ["Island", "Wastes", "Wastes", "Wastes"];
  const s = play([at(0, "battlefield", ...lands), at(0, "hand", "Plan for All Outcomes"), at(1, "battlefield", "Bear")],
    [...lands.map((l) => ({tap: l})), {cast: "Plan for All Outcomes"}, {resolve: true}, {answer: []}, {resolve: true}]);
  eq([s.awaiting, mine(s, 1).map((id) => s.objects[id].card)], [null, ["Bear"]], "up to one, and none chosen: nobody asked, Maya's Bear stays");
  const t = play([at(0, "battlefield", ...lands), at(0, "hand", "Plan for All Outcomes"), at(1, "battlefield", "Bear")],
    [...lands.map((l) => ({tap: l})), {cast: "Plan for All Outcomes"}, {resolve: true}, {choose: ["Bear (Maya's)"]}, {resolve: true}, {choose: ["On the top"]}]);
  eq(t.objects[t.zones.library[1][0]].card, "Bear", "Maya chooses the top: the Bear is the top card of Maya's library");
}

console.log(`engine-empower-jace: ${checks} checks passed -- empower Jace: a token made when there is none, the one there is, the controller's choice of two; a Jace card or another player's token aside; and the pieces the empower cards needed.`);
