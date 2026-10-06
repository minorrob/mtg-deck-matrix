/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* CORRUPTED, AND "CREATURES YOU CONTROL WITH TOXIC HAVE LIFELINK" (Skrelv's Hive; AI 3's Teysa deck).
 *
 * The condition `opponentPoisonAtLeast` (script/condition.mjs): an opponent of its controller, still in the game (CR 800.4a),
 * with that many poison counters (CR 122.1f) -- Corrupted is an ability word (CR 207.2c). A layer's `affects` may now say
 * `keywords` (rules/layers.mjs): read off the derivation as it stands, so an effect that gives the keyword is one the Hive's
 * depends on and goes first (CR 613.8a). The card scenarios play the Hive and its Mites; this suite holds four players, a
 * player who has left, Maya's own Mites, a keyword given by another effect, and the Mite that can't block.
 */
import assert from "node:assert/strict";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {conditionHolds, conditionProblems} from "../game/engine/script/condition.mjs";
import {keywordsOf} from "../game/engine/rules/layers.mjs";
import {ruleChanged} from "../game/engine/rules/statics.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const cards = loadCardIndex();
const card = (name) => ({...cards.definition(name), card: name});
const MITE = {card: "Mite", types: ["Artifact", "Creature"], subtypes: ["Phyrexian", "Mite"], power: 1, toughness: 1, keywords: ["Toxic"],
  abilities: [{id: "toxic", kind: "static", rule: "toxic", text: "Toxic 1", amount: 1, affects: {what: "permanent", self: true}}]};
const BEAR = {card: "Bear", types: ["Creature"], subtypes: ["Bear"], power: 2, toughness: 2};
const four = () => createState({matchId: "m", seed: "corrupted", players: [{name: "Rob"}, {name: "Maya"}, {name: "Trey"}, {name: "Sam"}]});
const put = (s, o, seat) => addObject(s, {...o, owner: seat, controller: seat}, "battlefield");
const corrupted = {opponentPoisonAtLeast: 3};

/* ---- the condition ---- */
{
  const s = four();
  eq(conditionHolds(s, corrupted, {controller: 0}), false, "nobody poisoned: no");
  s.players[2].poison = 3;
  eq([conditionHolds(s, corrupted, {controller: 0}), conditionHolds(s, corrupted, {controller: 2})], [true, false], "Trey at three: true for Rob, and not for Trey -- his own counters are no opponent's");
  s.players[2].lost = true;
  eq(conditionHolds(s, corrupted, {controller: 0}), false, "Trey has left the game: no opponent of Rob's has three (CR 800.4a)");
  s.players[3].poison = 2;
  eq(conditionHolds(s, corrupted, {controller: 0}), false, "Sam at two: not three");
  eq([conditionProblems({opponentPoisonAtLeast: 0}).length, conditionProblems({opponentPoisonAtLeast: "3"}).length, conditionProblems(corrupted)], [1, 1, []], "a whole number, one or more");
}

/* ---- the layer: his creatures with toxic, and only while it holds ---- */
{
  const s = four();
  put(s, card("Skrelv's Hive"), 0);
  const mite = put(s, MITE, 0), bear = put(s, BEAR, 0), hers = put(s, MITE, 1);
  eq(keywordsOf(s, mite).includes("Lifelink"), false, "no opponent poisoned: no lifelink");
  s.players[3].poison = 3;
  eq([keywordsOf(s, mite).includes("Lifelink"), keywordsOf(s, bear).includes("Lifelink"), keywordsOf(s, hers).includes("Lifelink")], [true, false, false],
    "Sam at three: Rob's Mite has lifelink, his Bear (no toxic) not, Maya's Mite not -- \"creatures you control\"");
  /* Toxic given by an effect later than the Hive: the Hive's effect depends on it, and it applies first (CR 613.8a). */
  s.effects = [{id: "give-toxic", layer: 6, affects: {ids: [bear]}, apply: {addKeywords: ["Toxic"]}, until: "end-of-turn", sourceController: 0, timestamp: 1e9}];
  ok(keywordsOf(s, bear).includes("Toxic") && keywordsOf(s, bear).includes("Lifelink"), "a Bear given toxic later has lifelink too: the dependency, not the timestamp, orders them");
  s.effects = [{id: "lose-all", layer: 6, affects: {ids: [mite]}, apply: {removeAllAbilities: true}, until: "end-of-turn", sourceController: 1, timestamp: 1e9}];
  eq(keywordsOf(s, mite).includes("Lifelink"), false, "a Mite that has lost all its abilities later has no toxic, and no lifelink either");
}

/* ---- the Hive's Mite can't block ---- */
{
  const {state} = runScenario({name: "corrupted mite", setup: [{seat: 0, zone: "battlefield", cards: ["Skrelv's Hive"], sick: true}], steps: [{to: {turn: 3, phase: "MAIN1"}}]}, cards.definition, {});
  const mite = state.zones.battlefield.find((id) => state.objects[id].card === "Phyrexian Mite");
  ok(mite !== undefined && ruleChanged(state, "cant-block", mite), "the Mite made at Rob's upkeep can't block");
  eq(state.players[0].life, 39, "and the upkeep cost Rob 1 life");
}

console.log(`engine-corrupted: ${checks} checks passed -- an opponent still in the game with three poison counters, and lifelink for the creatures you control with toxic, through the layers' dependencies.`);
