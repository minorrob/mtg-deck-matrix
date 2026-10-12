/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* THE TABLE'S BASIC LANDS ARE BASIC LANDS (Rob, 2026-10-11: Rampant Growth said "Search your library: nothing to find"
 * in his Chulane deck, whose library held nineteen of its twenty-one basics).
 *
 * The table's card lookup (cloud/game-room.mjs, `tableCards`) took the room's own basics first, and they were bare: a
 * Land with a mana ability, no Basic supertype and no land type. So "search your library for a basic land card"
 * (Rampant Growth, Fertilid, Fabled Passage), "a Plains card" (Claim Jumper), and "unless you control a Forest or an
 * Island" (Hinterland Harbor) all failed at every table -- while every card's scenarios, played with the engine's own
 * definitions (tests/engine-cards.mjs), passed. Here:
 *   1. The table plays the engine's own definition of each basic, and the room's own basics (`basicCards`, a room's
 *      default) are Basic, of their land type, with its mana (CR 205.4c, 305.6).
 *   2. Every card's scenarios pass played with the table's lookup -- the cards exactly as a table plays them.
 *   3. And with the room's own basics put first, as the table once did: the room's basics are good enough to play every
 *      scenario with.
 */
import assert from "node:assert/strict";
import {loadCardScenarios} from "../game/tools/engine-cards.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {tableDefinition} from "../game/engine/cards/definitions.mjs";
import {basicCards} from "../game/room/room.mjs";
import {tableCards} from "../cloud/game-room.mjs";

let checks = 0;
const ok = (c, m) => {assert.ok(c, m); checks += 1;};
const eq = (a, b, m) => {assert.deepEqual(a, b, m); checks += 1;};

const BASICS = {Plains: "W", Island: "U", Swamp: "B", Mountain: "R", Forest: "G", Wastes: "C"};

/* ---- 1. The basics ---- */
eq(Object.keys(BASICS).filter((n) => JSON.stringify(tableCards(n)) !== JSON.stringify(tableDefinition(n))), [],
  "the table plays the engine's own definition of each basic land");
const shape = (c) => ({types: c.types, supertypes: c.supertypes, subtypes: c.subtypes ?? [], produces: (c.abilities ?? []).filter((a) => a.kind === "mana").map((a) => a.produces)});
eq(Object.keys(BASICS).map((n) => shape(basicCards(n))), Object.keys(BASICS).map((n) => ({types: ["Land"], supertypes: ["Basic"], subtypes: n === "Wastes" ? [] : [n], produces: [{[BASICS[n]]: 1}]})),
  "and the room's own basics are Basic, of their land type, with its mana -- Wastes with no land type and {C} (CR 205.4c, 305.6)");
eq(Object.keys(BASICS).map((n) => shape(basicCards(n))), Object.keys(BASICS).map((n) => shape(tableDefinition(n))), "the same, in every way a rule reads, as the engine's own");

/* ---- 2 and 3. Every card's scenarios, with the table's lookup and with the room's basics first ---- */
const files = loadCardScenarios();
const play = (cards) => {
  const failed = [];
  let scenarios = 0;
  for (const {scenarios: file} of files) for (const scenario of file.scenarios) {
    scenarios += 1;
    try {runScenario(scenario, cards, file.fixtures ?? {});} catch (error) {failed.push(`${file.card}, "${scenario.name}": ${String(error.message).split("\n")[0]}`);}
  }
  return {scenarios, failed};
};
const table = play(tableCards);
ok(table.scenarios > 2000, `${table.scenarios} scenarios`);
eq(table.failed, [], "every card's scenarios pass played with the table's own lookup -- Rampant Growth's search, Hinterland Harbor's Forest or Island among them");
const roomFirst = play((n) => basicCards(n) ?? tableDefinition(n));
eq(roomFirst.failed, [], "and with the room's own basics put first, as the table once did");

console.log(`table-basics: ${checks} checks passed — the table plays the engine's own basic lands, the room's own are Basic and of their land type, and all ${table.scenarios} card scenarios pass with the table's lookup and with the room's basics first.`);
