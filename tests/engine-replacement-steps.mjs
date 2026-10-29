/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
import assert from "node:assert/strict";
import {createState, addObject, removeObject} from "../game/engine/state/index.mjs";
import {ruleReplacementCandidates, applyRuleReplacement} from "../game/engine/rules/replacement.mjs";
const state = createState({matchId: "replacement-steps", seed: "steps", players: [{name: "Rob"}, {name: "Maya"}, {name: "Trey"}]});
const id = addObject(state, {card: "Subject", types: ["Creature"], owner: 0, controller: 0}, "battlefield");
const held = to => addObject(state, {card: `Replace ${to}`, types: ["Enchantment"], owner: 1, controller: 1,
  abilities: [{id: "change", kind: "replacement", text: `Put it in ${to} instead`, watches: {event: "zone-change", from: "battlefield", to: "graveyard"}, change: {to}}]}, "battlefield");
const exile = held("exile"), hand = held("hand");
const proposal = {event: "zone-change", objectId: id, from: "battlefield", to: "graveyard", player: 0,
  sourceSnapshot: {colors: ["R"]}};
const before = JSON.stringify(state), candidates = ruleReplacementCandidates(state, proposal);
assert.equal(candidates.length, 2);
assert.deepEqual(candidates.map(c => c.holderId), [exile, hand]);
assert.match(candidates[0].label, /Replace exile/);
candidates[0].ability.change.to = "hand";
assert.equal(JSON.stringify(state), before, "candidate inspection and its returned metadata cannot mutate the game");
const changed = applyRuleReplacement(state, proposal, candidates[0].key);
assert.equal(changed.to, "exile");
assert.deepEqual(changed.sourceSnapshot, proposal.sourceSnapshot, "unrelated proposal facts survive each replacement step");
assert.equal(proposal.to, "graveyard", "the prospective event input stays unchanged");
assert.deepEqual(changed.appliedBy, [`${exile}:change`]);
assert.equal(ruleReplacementCandidates(state, changed).length, 0, "only effects still applicable to the changed event can follow");
removeObject(state, exile);
assert.throws(() => applyRuleReplacement(state, proposal, candidates[0].key), /no longer applies/);
assert.equal(applyRuleReplacement(state, proposal, candidates[1].key).to, "hand", "the selected live replacement is applied by identity");
const entry = {event: "enters", objectId: id, player: 0, types: ["Creature"], entering: {abilities: [
  {id: "tap", kind: "replacement", watches: {event: "enters", who: "self"}, change: {entersTapped: true}},
]}};
const own = ruleReplacementCandidates(state, entry);
assert.equal(own.length, 1);
assert.equal(applyRuleReplacement(state, entry, own[0].key).tapped, true);
assert.equal(ruleReplacementCandidates(state, applyRuleReplacement(state, entry, own[0].key)).length, 0, "an entering replacement cannot apply twice");
for (const run of [() => ruleReplacementCandidates(state, {event: "damage"}), () => applyRuleReplacement(state, {event: "damage"}, "x")])
  assert.throws(run, /zone-change or enters/);
console.log("engine-replacement-steps: 16 checks passed");
