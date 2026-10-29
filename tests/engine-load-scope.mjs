/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
import assert from "node:assert/strict";
import {loadScope, scopeStatus} from "../tools/card-load-scope.mjs";

/* One hundred deck appearances: the low-frequency tail is excluded, not 5% of the names.
   No commander estimate is added: these rows deliberately fall below its inclusion floor. */
const names = ["Popular", "Next", "Tail", "Unobserved"];
const graph = {cards: names.map((name, i) => ({name, id: String(i)}))};
const played = {played: [[0, 0, 0.01, 0, 80], [0, 1, 0.01, 0, 15], [0, 2, 0.01, 0, 5]]};
const oracle = {cards: graph.cards.map((c) => ({...c, type: "Creature", layout: "normal"}))};
const given = {graph, played, oracle, banned: new Set()};
const scope = loadScope(given);
assert.deepEqual(scope.cards.map((c) => c.name), ["Popular", "Next"]);
assert.equal(scope.coveredAppearances, 95);
assert.equal(scope.appearances, 100);
assert.deepEqual(scopeStatus(scope, (name) => name === "Popular"),
  {included: 2, required: 2, exempt: 0, final: 1, missing: ["Next"]});
assert.equal(scopeStatus(scope, () => true).missing.length, 0);
assert.deepEqual(scopeStatus(scope, () => true, (name) => name === "Popular").missing, ["Next"],
  "a playable source definition absent from the table bundle is still missing");
assert.throws(() => loadScope({...given, oracle: {cards: oracle.cards.slice(1)}}), /missing from Oracle/);
assert.throws(() => loadScope({...given, banned: new Set(["Next"])}), /outside the legal/);
assert.throws(() => loadScope({...given, played: {played: []}}), /No measured appearances/);
/* The ranking crosses the threshold only on the third name when the second ends at 94%. */
const crossed = loadScope({...given, played: {played: [[0, 0, .01, 0, 80], [0, 1, .01, 0, 14], [0, 2, .01, 0, 6]]}});
assert.equal(crossed.cards.length, 3);
assert.equal(crossed.coveredAppearances, 100);
console.log("engine-load-scope: appearance cutoff, unavailable identities, legality, and final-definition gate pass");
