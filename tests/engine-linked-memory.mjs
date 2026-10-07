/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
/* CR 607.2a, 400.7: linked cards belong to one source incarnation, including a departed source. */
import assert from "node:assert/strict";
import {table, creature, put} from "./helpers/b3-table.mjs";
import {beginResolution, answerResolution} from "../game/engine/script/resolution.mjs";
import {compileSelector, selectMatching} from "../game/engine/script/filter.mjs";
import {amountOf} from "../game/engine/script/amount.mjs";
import {runEffect} from "../game/engine/script/effects/index.mjs";
const s = table(), source = put(s, creature("Source")), other = put(s, creature("Other"));
put(s, creature("First"), "library"); put(s, creature("Second"), "library");
beginResolution(s, [{effect: "dig", count: 2, take: 1, to: "exile", link: true}], {controller: 0, source});
answerResolution(s, [0]);
const exiled = s.zones.exile[0], selector = {what: "card", zone: "exile", exiledWith: "self"};
assert.deepEqual(s.links[source], [exiled]);
assert.deepEqual(selectMatching(s, selector, {controller: 0, source}), [exiled]);
assert.deepEqual(selectMatching(s, selector, {controller: 0, source: other}), []);
assert.equal(amountOf(s, {count: selector}, {controller: 0, source}), 1);
runEffect(s, {effect: "moveZone", targets: [source], to: "graveyard"}, {controller: 0});
const context = {controller: 0, source: null, lastKnown: {cardId: source}};
assert.deepEqual(selectMatching(s, selector, context), [exiled]);
assert.deepEqual(selectMatching(s, selector, {controller: 0}), []);
runEffect(s, {effect: "moveZone", targets: [exiled], to: "graveyard"}, context);
const grave = s.zones.graveyard[0].find((id) => s.objects[id].card === "First");
runEffect(s, {effect: "moveZone", targets: [grave], to: "exile"}, context);
assert.deepEqual(selectMatching(s, selector, context), [], "a later incarnation is not linked");
assert.throws(() => compileSelector({...selector, exiledWith: "other"}), /exiledWith/);
console.log("engine-linked-memory: 9 checks passed -- linked dig, counts, departed source, and stale links.");
