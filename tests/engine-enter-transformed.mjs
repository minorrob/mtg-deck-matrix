/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
/* CR 712.14a: entering transformed uses the back face; only transforming double-faced cards qualify. */
import assert from "node:assert/strict";
import {table, creature, put} from "./helpers/b3-table.mjs";
import {runEffect} from "../game/engine/script/effects/index.mjs";
const front = {card: "Front", types: ["Enchantment"]}, back = creature("Back", {power: 5});
for (const transforming of [true, false]) {
  const s = table(), id = put(s, {...front, mdfc: {front, back, transforming}}, "exile");
  runEffect(s, {effect: "moveZone", targets: [id], to: "battlefield", transformed: true}, {controller: 0});
  assert.equal(s.zones.battlefield.length, transforming ? 1 : 0);
  if (transforming) {
    assert.deepEqual([s.objects[s.zones.battlefield[0]].card, s.objects[s.zones.battlefield[0]].power], ["Back", 5]);
    runEffect(s, {effect: "moveZone", targets: [s.zones.battlefield[0]], to: "graveyard"}, {controller: 0});
    assert.equal(s.objects[s.zones.graveyard[0][0]].card, "Front");
  } else assert.equal(s.objects[id].zone, "exile");
}
const s = table(), plain = put(s, creature("Plain"), "exile");
runEffect(s, {effect: "moveZone", targets: [plain], to: "battlefield", transformed: true}, {controller: 0});
assert.equal(s.objects[plain].zone, "exile");
const id = put(s, {...front, mdfc: {front, back, transforming: true}});
runEffect(s, {effect: "moveZone", targets: [id], to: "exile", andReturn: true, transformed: true}, {controller: 0});
assert.equal(s.objects[s.zones.battlefield[0]].card, "Back", "exile and return forwards transformed to the return");
console.log("engine-enter-transformed: 7 checks passed -- back face, zone reset, nontransforming refusal, flicker return.");
