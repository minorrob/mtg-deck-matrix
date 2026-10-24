/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* THE CARD LOAD OF ROB'S FOUR PRIORITY LISTS (2026-10-24), LANE P3 (counters): the lane's cards played, and what their
 * scenarios cannot reach.
 *
 * - Every scenario of the lane's cards (docs/engine/card-load-rob-lists-2026-10-24/lane-P3-counters.json), run here on its
 *   own: the rules this lane built are each proved by one of them, so a change to one shows at once, without the whole
 *   catalog's ten thousand.
 * - The grammar's guards: a selector's `nonCounters` (a kind of counter) and `controlsAny` (a player's, with no controller of
 *   its own); a condition's `counterPutThisTurn` (true or false); "choose one at random" (one mode, nothing else about its
 *   modes); a counted target in a triggered ability's modes only where the mode is chosen at random.
 * - "Move any number of counters" (Resourceful Defense): the question says what it moves, from what, onto what.
 */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {compileSelector} from "../game/engine/script/filter.mjs";
import {conditionProblems} from "../game/engine/script/condition.mjs";
import {loadCardIndex, loadCardScenarios} from "../game/tools/engine-cards.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {awaitingChoice} from "../game/engine/rules/turn.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };

/* ---- the lane's cards, every scenario ---- */
const lane = JSON.parse(readFileSync(new URL("../docs/engine/card-load-rob-lists-2026-10-24/lane-P3-counters.json", import.meta.url), "utf8"));
const names = new Set(lane.cards.map((c) => c.name));
const cards = loadCardIndex();
const files = loadCardScenarios().map((f) => f.scenarios).filter((f) => names.has(f.card));
ok(files.length === names.size, `every card of the lane has its scenarios (${files.length} of ${names.size})`);
for (const file of files) {
  ok(cards.resolve(file.card)?.playable === true, `${file.card} is playable`);
  for (const scenario of file.scenarios) {
    runScenario(scenario, cards.definition, file.fixtures ?? {});
    checks += 1;
  }
}

/* ---- the grammar's guards ---- */
const refused = (selector) => { try { compileSelector(selector); return false; } catch { return true; } };
ok(!refused({what: "permanent", types: ["Creature"], nonCounters: "+1/+1"}), "nonCounters names a kind of counter");
ok(refused({what: "permanent", nonCounters: "any"}) && refused({what: "permanent", nonCounters: "none"}) && refused({what: "permanent", nonCounters: 1}),
  "nonCounters is a kind, not any, none or a number");
ok(!refused({what: "player", who: "opponent", controlsAny: {types: ["Creature"], power: {min: 4}}}), "controlsAny describes a player's permanent");
ok(refused({what: "permanent", controlsAny: {types: ["Creature"]}}), "controlsAny is a player's");
ok(refused({what: "player", controlsAny: {types: ["Creature"], controller: "you"}}), "controlsAny says no controller of its own");
ok(refused({what: "player", controlsAny: {types: ["Creature"], nonsense: true}}), "controlsAny is held to the selector grammar");
ok(conditionProblems({counterPutThisTurn: true}).length === 0, "counterPutThisTurn true is a condition");
ok(conditionProblems({counterPutThisTurn: "yes"}).length > 0, "counterPutThisTurn is true or false");

const identity = {name: "Odd", oracleId: "x", types: ["Enchantment"], subtypes: [], manaCost: "{1}", colors: [], colorIdentity: []};
const problems = (text, ability) => compileScript({schema: "CrankCardScript@1", identity, oracleText: text, source: "hand", abilities: [{text, ...ability}]}).problems ?? [];
const MODES = [
  {text: "Put a +1/+1 counter on target creature.", targets: [{what: "permanent", types: ["Creature"]}], effects: [{effect: "putCounter", targets: {target: 0}, counter: "+1/+1", count: 1}]},
  {text: "Up to one target creature gets +1/+0.", targets: [{what: "permanent", types: ["Creature"], count: {min: 0, max: 1}}], effects: [{effect: "pump", targets: {target: 0}, power: 1, toughness: 0}]}];
const RANDOM = "At the beginning of your upkeep, choose one at random —\n• Put a +1/+1 counter on target creature.\n• Up to one target creature gets +1/+0.";
const upkeep = (modal) => problems(RANDOM, {kind: "triggered", trigger: {on: "upkeep"}, effects: [{effect: "modal", modes: MODES, ...modal}]});
ok(!upkeep({choose: 1, random: true}).some((p) => /at random|counted target/.test(p)), "choose one at random, a counted target in a mode, is a definition");
ok(upkeep({choose: 2, random: true}).some((p) => /at random/.test(p)), "choose two at random is refused");
ok(upkeep({choose: 1, random: true, unchosen: "turn"}).some((p) => /at random/.test(p)), "at random beside \"hasn't been chosen\" is refused");
ok(upkeep({choose: 1}).some((p) => /counted target in a triggered ability's mode is not built/.test(p)), "a counted target in modes a player chooses is still refused");

/* ---- a shield counter and the state-based actions (CR 122.1c, 704.5g) ---- */
/* Lethal damage marked destroys as a state-based action, not as the result of an effect: the shield counter is not spent on
   it -- the creature dies with its counter, none removed. */
const magic = files.find((f) => f.card === "Protection Magic");
const sba = magic.scenarios.find((s) => /not the state-based action/.test(s.name));
const died = runScenario(sba, cards.definition, magic.fixtures ?? {});
ok(!died.events.some((e) => e.kind === "GameEventCardCounters" && e.data?.fields?.type === "shield" && e.data.fields.newValue < e.data.fields.oldValue),
  "no shield counter is removed for a destruction by the state-based actions");

/* ---- "move any number of counters": the question ---- */
const defense = files.find((f) => f.card === "Resourceful Defense");
const moving = defense.scenarios.find((s) => /move any number of counters/.test(s.name));
const asked = runScenario({...moving, steps: moving.steps.filter((s) => !s.choose), expect: []}, cards.definition, defense.fixtures ?? {});
const question = awaitingChoice(asked.state);
ok(question.title === "Move any number of counters from Bauble onto Bear" && question.min === 0 && question.max === 3,
  `the question says what it moves, from what, onto what, none to all (${question.title}, ${question.min}-${question.max})`);

console.log(`engine-roblists-p3: ${checks} checks passed.`);
