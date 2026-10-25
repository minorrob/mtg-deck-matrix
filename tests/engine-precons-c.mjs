/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* THE PRECON CARD LOAD (2026-10-25), LANE C (Reign of Dragons): the lane's cards played, and what their scenarios cannot reach.
 *
 * - Every scenario of the lane's cards (docs/engine/card-load-precons-2026-10-25/lane-C-dragons.json), run here on its own:
 *   the rules this lane built are each proved by one of them -- dethrone and Scourge of the Throne's "attacking the player
 *   with the most life", pack tactics, behold as an effect, read ahead, red mana kept between steps, discover's "or put it
 *   into your hand", "each other opponent", "those cards that are still exiled" -- so a change to one shows at once,
 *   without the whole catalog's ten thousand.
 * - The grammar's guards: the conditions `attackingMostLife` and `attackedWithPowerAtLeast`; an amount's `still`; `play`'s
 *   `otherwise` and `rememberCast`; read ahead only on a Saga with chapters; dethrone and read ahead as keywords.
 * - The player with the most life or tied for it: a player who has left the game is not counted (CR 800.4a).
 */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {validateScript} from "../game/engine/script/schema.mjs";
import {conditionProblems, hasMostLife} from "../game/engine/script/condition.mjs";
import {amountProblems} from "../game/engine/script/amount.mjs";
import {loadCardIndex, loadCardScenarios} from "../game/tools/engine-cards.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {KEYWORDS} from "../game/engine/vocabulary.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };

/* ---- the lane's cards, every scenario ---- */
const lane = JSON.parse(readFileSync(new URL("../docs/engine/card-load-precons-2026-10-25/lane-C-dragons.json", import.meta.url), "utf8"));
const names = new Set(lane.cards.map((c) => c.name));
const cards = loadCardIndex();
const files = loadCardScenarios().map((f) => f.scenarios).filter((f) => names.has(f.card));
ok(files.length === names.size, `every card of the lane has its scenarios (${files.length} of ${names.size})`);
let scenarios = 0;
for (const file of files) {
  ok(cards.resolve(file.card)?.playable === true, `${file.card} is playable`);
  for (const scenario of file.scenarios) {
    runScenario(scenario, cards.definition, file.fixtures ?? {});
    scenarios += 1;
    checks += 1;
  }
}

/* ---- the conditions ---- */
ok(conditionProblems({attackingMostLife: true}).length === 0, "attackingMostLife true is a condition");
ok(conditionProblems({attackingMostLife: "yes"}).length > 0, "attackingMostLife is true, nothing else");
ok(conditionProblems({attackedWithPowerAtLeast: 6}).length === 0, "attackedWithPowerAtLeast a whole number is a condition");
ok(conditionProblems({attackedWithPowerAtLeast: "six"}).length > 0 && conditionProblems({attackedWithPowerAtLeast: 0}).length > 0,
  "attackedWithPowerAtLeast is a whole number, 1 or more");

/* The most life or tied for it, among the players still in the game (CR 800.4a): one who has left, at more life, is no rival. */
const players = (lives, lost = []) => ({players: lives.map((life, id) => ({id, life, ...(lost.includes(id) ? {lost: true} : {})}))});
ok(hasMostLife(players([40, 40, 30]), 1), "tied for the most life is the most");
ok(!hasMostLife(players([40, 39, 30]), 1), "one less than another is not");
ok(hasMostLife(players([40, 39, 50], [2]), 0), "a player who has left the game is not counted");
ok(!hasMostLife(players([40, 39, 30], [0]), 0), "and one who has left is never the most, at whatever life");

/* ---- the amount ---- */
ok(amountProblems({rememberedCount: true, still: true, times: 2}).length === 0, "still beside rememberedCount is an amount");
ok(amountProblems({rememberedCount: true, still: "yes"}).length > 0, "still is true, nothing else");
ok(amountProblems({count: {what: "permanent"}, still: true}).length > 0, "still is rememberedCount's alone");

/* ---- play's two ways ---- */
const identity = {name: "Odd", oracleId: "x", types: ["Sorcery"], subtypes: [], manaCost: "{1}", colors: [], colorIdentity: []};
const spellWith = (play) => validateScript({schema: "CrankCardScript@1", identity, oracleText: "Odd.", source: "hand", abilities: [{kind: "spell", text: "Odd.", effects: [play]}]});
const PLAY = {effect: "play", from: "targets", targets: "remembered", free: true};
ok(spellWith({...PLAY, rememberCast: true, otherwise: [{effect: "moveZone", targets: "remembered", to: "hand"}]}).valid, "play with rememberCast and otherwise is valid");
ok(!spellWith({...PLAY, otherwise: []}).valid && !spellWith({...PLAY, otherwise: {effect: "draw"}}).valid, "otherwise is a list of effects, not empty");
ok(!spellWith({...PLAY, otherwise: [{effect: "noSuchThing"}]}).valid, "what otherwise does is held to the catalog");
ok(!spellWith({...PLAY, rememberCast: "yes"}).valid && !spellWith({...PLAY, rememberCast: true, anyNumber: true}).valid, "rememberCast is true, of one spell");

/* ---- the keywords ---- */
ok(KEYWORDS.includes("dethrone") && KEYWORDS.includes("read ahead"), "dethrone and read ahead are keywords a script may name");
const sagaIdentity = {...identity, types: ["Enchantment"], subtypes: ["Saga"]};
const READ = {kind: "keyword", text: "Read ahead", keyword: "read ahead"};
const CHAPTER = (n) => ({kind: "triggered", text: `${"I".repeat(n)} — Draw a card.`, trigger: {on: "chapter", chapter: n}, effects: [{effect: "draw", count: 1}]});
const saga = compileScript({schema: "CrankCardScript@1", identity: sagaIdentity, oracleText: "Read ahead\nI — Draw a card.\nII — Draw a card.", source: "hand", abilities: [READ, CHAPTER(1), CHAPTER(2)]});
ok(saga.definition?.abilities.some((a) => a.kind === "replacement" && a.change?.readAhead === 2), "read ahead offers its Saga's chapters, one to its last");
ok(saga.definition?.keywords.includes("Read ahead"), "and says so among its keywords");
const notSaga = compileScript({schema: "CrankCardScript@1", identity: {...identity, types: ["Enchantment"]}, oracleText: "Read ahead", source: "hand", abilities: [READ]});
ok((notSaga.problems ?? []).some((p) => /not a Saga/.test(p)), "read ahead on a card that is not a Saga is refused");
const creature = {...identity, types: ["Creature"], subtypes: ["Dragon"], power: 5, toughness: 5};
const dethrone = compileScript({schema: "CrankCardScript@1", identity: creature, oracleText: "Dethrone", source: "hand", abilities: [{kind: "keyword", text: "Dethrone", keyword: "dethrone"}]});
ok(dethrone.definition?.abilities.some((a) => a.kind === "triggered" && a.trigger?.defenderMostLife === true && a.effects?.[0]?.counter === "+1/+1"),
  "dethrone is an attack trigger putting a +1/+1 counter on it");

console.log(`engine-precons-c: ${checks} checks passed — the ${files.length} Reign of Dragons cards through their ${scenarios} scenarios, dethrone, pack tactics, behold, read ahead, red mana kept, discover's two ways, and the grammar's guards.`);
