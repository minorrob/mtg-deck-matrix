/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* TRAIN C, P4-REPLACEMENTS: "IF YOU WOULD GAIN LIFE, YOU GAIN TWICE THAT MUCH LIFE INSTEAD" (Rhox Faithmender; CR 614.1a).
 *
 * The static `more-life` (rules/statics.mjs, lifeGained): its `affects` the players, "you" its controller, `times`. Read
 * wherever life is gained -- an effect's gain, lifelink in and out of combat, an exchange of life totals (CR 701.12b) -- all
 * through changeLife (script/effects/resources.mjs) but combat's lifelink (rules/combat.mjs). Only multiplying is built, so
 * two are four times and nobody is asked (CR 616.1). Here: two of them, noncombat lifelink, the trigger and the turn's
 * record that see the doubled gain, can't gain life, a loss, an exchange, four players, and the schema.
 */
import assert from "node:assert/strict";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {runEffects} from "../game/engine/script/effects/index.mjs";
import {collectTriggers} from "../game/engine/rules/trigger.mjs";
import {lifeGained} from "../game/engine/rules/statics.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const RHOX = "Rhox Faithmender";
const FIX = {
  /* A 2/2 with lifelink. */
  Cleric: {types: ["Creature"], subtypes: ["Cleric"], manaCost: "{1}{W}", colors: ["W"], power: 2, toughness: 2, keywords: ["Lifelink"]},
  /* "If you would gain life, you gain three times that much life instead." */
  Tripler: {types: ["Enchantment"], subtypes: [], manaCost: "{2}{W}", colors: ["W"], abilities: [{id: "t", kind: "static", text: "x", rule: "more-life", affects: {who: "you"}, times: 3}]},
  /* "Whenever you gain life, ...": what the trigger is about, how much. */
  Watcher: {types: ["Creature"], subtypes: ["Bat"], manaCost: "{1}{B}", colors: ["B"], power: 1, toughness: 1,
    abilities: [{id: "w", kind: "triggered", text: "x", trigger: {on: "GameEventPlayerLivesChanged", gainer: "you"}, effects: [{effect: "gainLife", amount: 0}]}]},
};
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const table = (setup, seats = 2) => runScenario({name: "life-doubled", seats, setup, steps: []}, index.definition, FIX).state;
const idOf = (s, name, seat = 0) => s.zones.battlefield.find((id) => s.objects[id].card === name && s.objects[id].controller === seat);
const gain = (s, who, amount, controller = who) => runEffects(s, [{effect: "gainLife", who: [who], amount}], {controller, source: null});

{
  const s = table([at(0, "battlefield", RHOX, RHOX)]);
  gain(s, 0, 3);
  eq(s.players[0].life, 52, "two Faithmenders: four times, 12");
  runEffects(s, [{effect: "loseLife", who: [0], amount: 2}], {controller: 1, source: null});
  eq(s.players[0].life, 50, "a loss is as it was");
}
{
  const s = table([at(0, "battlefield", RHOX, "Cleric", "Watcher")]);
  const events = runEffects(s, [{effect: "dealDamage", amount: 2, from: [idOf(s, "Cleric")], who: [1]}], {controller: 0, source: null});
  eq([s.players[0].life, s.players[1].life, s.players[0].gainedThisTurn], [44, 38, 4], "noncombat lifelink: 2 damage, 4 life -- and 4 is what the turn's record keeps");
  collectTriggers(s, events);
  eq(s.pendingTriggers.map((t) => t.about?.amount), [4], "and what \"whenever you gain life\" is about");
}
{
  /* "Your opponents can't gain life" (CR 119.7): no gain to double. */
  const s = table([at(0, "battlefield", RHOX), at(1, "battlefield", "Archfiend of Despair")]);
  gain(s, 0, 3);
  eq(s.players[0].life, 40, "Maya's Archfiend: Rob gains nothing, doubled or not");
}
{
  /* An exchange of life totals is a gain and a loss (CR 701.12b): Rob at 10 trades with Maya at 20, gaining 10 -- doubled. */
  const s = table([at(0, "battlefield", RHOX)]);
  s.players[0].life = 10; s.players[1].life = 20;
  runEffects(s, [{effect: "exchangeLife", who: [0], toPlayer: 1}], {controller: 0, source: null});
  eq([s.players[0].life, s.players[1].life], [30, 10], "Rob gains 20 instead of 10; Maya loses 10");
}
{
  const s = table([at(1, "battlefield", RHOX), at(2, "battlefield", RHOX)], 4);
  gain(s, 0, 1); gain(s, 1, 1); gain(s, 3, 1);
  eq([0, 1, 2, 3].map((p) => s.players[p].life), [41, 42, 40, 41], "four players: each Faithmender its own controller's, Maya's doubling Maya's alone");
  eq([lifeGained(s, 2, 5), lifeGained(s, 1, 0)], [10, 0], "Trey's 5 is 10; none is none");
  eq(lifeGained(table([at(0, "battlefield", "Tripler")]), 0, 2), 6, "times 3: three times as much");
}
{
  const problems = (fields) => compileScript({schema: "CrankCardScript@1",
    identity: {name: "Odd Rhino", oracleId: "x", types: ["Enchantment"], subtypes: [], manaCost: "{W}", colors: ["W"], colorIdentity: ["W"]},
    oracleText: "x", source: "hand", abilities: [{kind: "static", text: "x", rule: "more-life", affects: {who: "you"}, ...fields}]}).problems;
  eq(problems({times: 2}), [], "twice compiles");
  for (const bad of [{}, {times: 1}, {times: "2"}]) ok(problems(bad).some((p) => p.includes("More life instead says how many times")), `and refuses ${JSON.stringify(bad)}`);
}

console.log(`engine-life-doubled: ${checks} checks passed -- twice that much life instead: an effect's gain, lifelink in and out of combat, an exchange; four times for two; what the trigger and the turn see; can't gain life; four seats; the schema.`);
