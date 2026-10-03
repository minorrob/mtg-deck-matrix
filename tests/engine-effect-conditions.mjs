/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* M4 PHASE 3, BATCH 41 (THE CATALOG'S ORDER): AN EFFECT'S CONDITION (Forge's Condition), AND THE TURN'S.
 *
 * "Metalcraft -- If you control three or more artifacts, exile that creature": an effect with a condition does what it
 * says only if the condition holds as it reaches the head of the resolution -- after the effects before it have done
 * theirs (CR 608.2c). "If it's not your turn" and "during your turn" ask whose turn it is; a cost reduction may be
 * conditional and counted. "If that spell is countered this way, exile it." "Creatures that entered this turn" -- not one
 * that merely changed hands. "With toughness greater than its power", through the layers.
 */
import assert from "node:assert/strict";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {beginGame, advance} from "../game/engine/rules/turn.mjs";
import {costReduction, ruleChanged} from "../game/engine/rules/statics.mjs";
import {beginResolution} from "../game/engine/script/resolution.mjs";
import {runEffects} from "../game/engine/script/effects/index.mjs";
import {selectMatching} from "../game/engine/script/filter.mjs";
import {conditionHolds} from "../game/engine/script/condition.mjs";
import {pushSpell} from "../game/engine/rules/stack.mjs";
import {missingFor} from "../game/tools/engine-constructs.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const cards = loadCardIndex();
const card = (name) => ({...cards.definition(name), card: name});
const WASTES = {card: "Wastes", types: ["Land"], supertypes: ["Basic"], abilities: [{id: "a0", kind: "mana", tapSelf: true, produces: {C: 1}}]};
function table() {
  const s = createState({matchId: "m", seed: "effect-conditions", players: [{name: "Rob"}, {name: "Maya"}]});
  for (let seat = 0; seat < 2; seat += 1) for (let i = 0; i < 12; i += 1) addObject(s, {...WASTES, owner: seat, controller: seat}, "library", seat);
  return s;
}
const on = (s, o, seat) => addObject(s, {...o, owner: seat, controller: seat}, "battlefield", null);
function main(s) { beginGame(s); for (let n = 0; n < 50 && !(s.phase === "MAIN1" && s.priorityPlayer === 0); n += 1) advance(s); return s; }
const RELIC = {card: "Relic", types: ["Artifact"]};
const THREE = {present: {what: "permanent", types: ["Artifact"], controller: "you"}, atLeast: 3};

{
  /* Asked as it reaches the head: the artifact the first effect makes counts for the second. */
  const s = main(table());
  on(s, RELIC, 0); on(s, RELIC, 0);
  const draw = (n) => s.zones.hand[0].length - n;
  const before = s.zones.hand[0].length;
  beginResolution(s, [{effect: "draw", count: 1, condition: THREE}], {controller: 0, source: null});
  eq(draw(before), 0, "two artifacts: \"if you control three or more artifacts, draw a card\" does nothing");
  beginResolution(s, [{effect: "createToken", token: {name: "Clue", types: ["Artifact"]}}, {effect: "draw", count: 1, condition: THREE}], {controller: 0, source: null});
  eq(draw(before), 1, "a Clue made first: now three, and the draw happens (CR 608.2c, in order)");
  beginResolution(s, [{effect: "draw", count: 1, condition: THREE}], {controller: 1, source: null});
  eq(s.zones.hand[1].length, 0, "Maya controls no artifacts: her copy of it draws nothing");
}
{
  /* Whose turn: "if it's not your turn"; "during your turn, spells you cast cost {1} less for each ..." counted. */
  const s = table();
  on(s, card("Temur Battlecrier"), 0);
  const spell = addObject(s, {card: "Study", types: ["Sorcery"], manaCost: "{3}", owner: 0, controller: 0}, "hand", 0);
  main(s);
  eq([conditionHolds(s, {notYourTurn: true}, {controller: 0}), conditionHolds(s, {notYourTurn: true}, {controller: 1})], [false, true], "Rob's turn: not Maya's");
  eq(costReduction(s, 0, spell), 1, "Temur Battlecrier is a 4/3 itself: {1} off");
  on(s, {card: "Ogre", types: ["Creature"], power: 4, toughness: 4}, 0); on(s, {card: "Giant", types: ["Creature"], power: 5, toughness: 5}, 0);
  eq(costReduction(s, 0, spell), 3, "an Ogre and a Giant besides: {3} off");
  s.activePlayer = 1;
  eq(costReduction(s, 0, spell), 0, "on Maya's turn: nothing off");
}
{
  /* Countered and exiled; entered this turn, not stolen; toughness greater than power. */
  const s = table();
  const old = on(s, {card: "Bear", types: ["Creature"], power: 2, toughness: 2}, 1);
  main(s);
  const study = pushSpell(s, addObject(s, {card: "Study", types: ["Sorcery"], manaCost: "{1}", owner: 1, controller: 1}, "hand", 1), {controller: 1});
  runEffects(s, [{effect: "counterSpell", spells: [study.objectId], to: "exile"}], {controller: 0, source: null});
  eq([s.zones.exile.map((id) => s.objects[id].card), s.zones.graveyard[1].length], [["Study"], 0], "\"if that spell is countered this way, exile it\": in exile, not her graveyard");
  const fresh = on(s, {card: "Wall", types: ["Creature"], power: 0, toughness: 4}, 0);
  runEffects(s, [{effect: "gainControl", targets: [old]}], {controller: 0, source: null});
  eq(selectMatching(s, {what: "permanent", types: ["Creature"], enteredThisTurn: true}, {controller: 0}), [fresh], "entered this turn: the Wall -- not the Bear that only changed hands");
  eq(selectMatching(s, {what: "permanent", types: ["Creature"], toughnessOverPower: true}, {controller: 0}), [fresh], "toughness greater than power: the 0/4 Wall, not the 2/2 Bear");
}
{
  /* Bedrock Tortoise: "each creature you control with toughness greater than its power assigns combat damage equal to its
     toughness" -- the 0/4 Wall does, the 3/1 Raider does not. */
  const s = main(table());
  on(s, card("Bedrock Tortoise"), 0);
  const wall = on(s, {card: "Wall", types: ["Creature"], power: 0, toughness: 4}, 0), raider = on(s, {card: "Raider", types: ["Creature"], power: 3, toughness: 1}, 0);
  eq([ruleChanged(s, "combat-damage-by-toughness", wall), ruleChanged(s, "combat-damage-by-toughness", raider)], [true, false], "the Wall assigns by toughness; the Raider by its power");
}
{
  eq([missingFor({options: ["Condition"]}), missingFor({options: ["ConditionPresent"]})], [[], []], "the catalog: an effect's condition is built");
}

console.log(`engine-effect-conditions: ${checks} checks passed — an effect's condition asked at its turn in the resolution; whose turn; a conditional, counted cost reduction; countered into exile; entered this turn, not stolen; toughness over power.`);
