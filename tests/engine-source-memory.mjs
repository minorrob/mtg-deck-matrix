/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
/* CR 113.7a, 608.2h: departure filters and stack abilities keep the correct source facts. */
import assert from "node:assert/strict";
import {table, creature, put} from "./helpers/b3-table.mjs";
import {matchesLastKnown} from "../game/engine/script/filter.mjs";
import {amountOf} from "../game/engine/script/amount.mjs";
import {pushAbility, resolveTop} from "../game/engine/rules/stack.mjs";
import {runEffect} from "../game/engine/script/effects/index.mjs";
import {keepLastKnown} from "../game/engine/script/effects/zones.mjs";
const s = table(), source = put(s, creature("Source", {power: 4}));
assert.equal(matchesLastKnown({self: true}, {cardId: source}, {source}), true);
assert.equal(matchesLastKnown({self: true}, {cardId: source + 1}, {source}), false);
const card = put(s, creature("Remembered", {power: 5, toughness: 8}), "library");
assert.deepEqual([amountOf(s, {powerOf: "remembered"}, {remembered: [card]}), amountOf(s, {toughnessOf: "remembered"}, {remembered: [card]})], [5, 8]);
runEffect(s, {effect: "pump", targets: [source], power: 3, toughness: 2}, {controller: 0});
assert.equal(amountOf(s, {powerOf: "remembered"}, {remembered: [source]}), 7, "a battlefield memory uses layers");
pushAbility(s, {sourceId: source, controller: 0, abilityId: "memory", script: {effects: [{effect: "gainLife", who: "you", amount: {powerOf: "self"}}]}});
const life = s.players[0].life;
runEffect(s, {effect: "moveZone", targets: [source], to: "graveyard"}, {controller: 0});
assert.equal(s.stack[0].lastKnown.power, 7);
keepLastKnown(s, source, {cardId: source, power: 99});
assert.equal(s.stack[0].lastKnown.power, 7, "an already captured snapshot is never overwritten");
resolveTop(s);
assert.equal(s.players[0].life - life, 7, "resolution receives the departed source's layered power");
console.log("engine-source-memory: 7 checks passed -- self filters, printed remembered figures, stack LKI capture and use.");
