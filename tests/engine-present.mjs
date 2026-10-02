/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* M4 PHASE 3, BATCH 37 (THE CATALOG'S ORDER): A COMPARISON OF THE PERMANENTS PRESENT (Forge's PresentCompare).
 *
 * A condition counts the permanents its selector describes now: at least `atLeast` ("if you control five or more
 * lands"; one when it says nothing), at most `atMost` ("if you control no Snakes", "if no creatures are on the
 * battlefield"), or between the two. A bound with nothing to count is a mistake the schema names.
 */
import assert from "node:assert/strict";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {conditionHolds, conditionProblems} from "../game/engine/script/condition.mjs";
import {missingFor} from "../game/tools/engine-constructs.mjs";

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const s = createState({matchId: "m", seed: "present", players: [{name: "Rob"}, {name: "Maya"}]});
const on = (o, seat) => addObject(s, {...o, owner: seat, controller: seat}, "battlefield", null);
const holds = (condition, controller = 0) => conditionHolds(s, condition, {controller, source: null});
const SNAKES = {what: "permanent", subtypes: ["Snake"], controller: "you"};
const CREATURES = {what: "permanent", types: ["Creature"]};

eq([holds({present: SNAKES, atMost: 0}), holds({present: SNAKES})], [true, false], "no Snake: \"you control no Snakes\" holds, \"a Snake\" does not");
on({card: "Snake", types: ["Creature"], subtypes: ["Snake"]}, 1);
eq([holds({present: SNAKES, atMost: 0}), holds({present: SNAKES, atMost: 0}, 1)], [true, false], "Maya's Snake: Rob still controls none; Maya does");
eq(holds({present: CREATURES, atMost: 0}), false, "\"if no creatures are on the battlefield\": anyone's creature counts");
on({card: "Snake", types: ["Creature"], subtypes: ["Snake"]}, 0); on({card: "Snake", types: ["Creature"], subtypes: ["Snake"]}, 0);
eq([holds({present: SNAKES, atLeast: 2}), holds({present: SNAKES, atLeast: 3}), holds({present: SNAKES, atLeast: 1, atMost: 2}), holds({present: SNAKES, atMost: 1})], [true, false, true, false],
  "two of Rob's: two or more yes, three no; between one and two yes; at most one no");
eq([conditionProblems({present: SNAKES, atMost: 0}).length, conditionProblems({present: SNAKES, atMost: -1}).length > 0, conditionProblems({atMost: 0}).length > 0],
  [0, true, true], "atMost 0 is fine; below 0, or with nothing present to count, is refused");
eq(missingFor({options: ["PresentCompare"]}), [], "the catalog: a comparison of permanents present is built");

console.log(`engine-present: ${checks} checks passed — a condition counts what is present: at least, at most (none), or between; whose it is as the selector says; a bound with nothing to count is refused.`);
