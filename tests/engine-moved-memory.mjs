/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
/* CR 608.2h: an effect asks what it moved as it last existed, not the returned card. */
import assert from "node:assert/strict";
import {table, creature, put} from "./helpers/b3-table.mjs";
import {beginResolution} from "../game/engine/script/resolution.mjs";
import {conditionHolds} from "../game/engine/script/condition.mjs";
import {runEffect} from "../game/engine/script/effects/index.mjs";
const condition = {about: "moved", is: {subtypes: ["Pirate"]}};
for (const pirate of [true, false]) {
  const s = table(), id = put(s, creature("Bear"));
  if (pirate) runEffect(s, {effect: "pump", targets: [id], power: 0, toughness: 0}, {controller: 0});
  // A layer changes its type; the returned card is its printed Bear again.
  if (pirate) s.effects.push({id: "pirate", layer: 4, affects: {ids: [id]}, apply: {setSubtypes: ["Pirate"]}, until: "end-of-turn", sourceController: 0});
  const before = s.players[0].life;
  beginResolution(s, [{effect: "moveZone", targets: [id], to: "exile", andReturn: true, remember: true},
    {effect: "gainLife", who: "you", amount: 2, condition},
    {effect: "branch", if: condition, then: [{effect: "gainLife", who: "you", amount: 3}]}], {controller: 0});
  assert.equal(s.players[0].life - before, pirate ? 5 : 0);
  assert.deepEqual(s.objects[s.zones.battlefield[0]].subtypes, ["Bear"]);
}
const s = table(), context = {controller: 0};
runEffect(s, {effect: "moveZone", targets: [99999], to: "exile", remember: true}, context);
assert.deepEqual(context.movedWas, []);
assert.equal(conditionHolds(s, condition, context), false);
const id = put(s, creature("Pirate", {subtypes: ["Pirate"]}), "graveyard");
runEffect(s, {effect: "moveZone", targets: [id], to: "exile", remember: true}, context);
assert.equal(conditionHolds(s, condition, context), false, "a graveyard card is not a creature moved from the battlefield");
console.log("engine-moved-memory: 7 checks passed -- pre-move types, effect and branch conditions, and empty moves.");
