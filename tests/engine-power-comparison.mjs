/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
/* CR 702.134a, 608.2h: less-than-self compares current layered power, falling back to matching source LKI. */
import assert from "node:assert/strict";
import {table, creature, put} from "./helpers/b3-table.mjs";
import {compileSelector} from "../game/engine/script/filter.mjs";
import {runEffect} from "../game/engine/script/effects/index.mjs";
const s = table(), source = put(s, creature("Mentor", {power: 3})), lesser = put(s, creature("Lesser")), equal = put(s, creature("Equal", {power: 3}));
const fits = compileSelector({what: "permanent", types: ["Creature"], power: {lessThan: "self"}}), ctx = {controller: 0, source};
assert.equal(fits(s, lesser, ctx), true);
assert.equal(fits(s, equal, ctx), false);
runEffect(s, {effect: "pump", targets: [lesser], power: 2, toughness: 0}, ctx);
assert.equal(fits(s, lesser, ctx), false, "the target's current power matters");
runEffect(s, {effect: "pump", targets: [source], power: 3, toughness: 0}, ctx);
assert.equal(fits(s, lesser, ctx), true, "the source's current power matters");
runEffect(s, {effect: "moveZone", targets: [source], to: "graveyard"}, ctx);
assert.equal(fits(s, lesser, {...ctx, lastKnown: {cardId: source, power: 6}}), true);
assert.equal(fits(s, lesser, {...ctx, lastKnown: {cardId: source + 1, power: 6}}), false);
assert.equal(fits(s, lesser, {controller: 0}), false);
assert.throws(() => compileSelector({power: {lessThan: 4}}), /lessThan/);
console.log("engine-power-comparison: 8 checks passed -- strict comparison, layers, source LKI, and grammar.");
