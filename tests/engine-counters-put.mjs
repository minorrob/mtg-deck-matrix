/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* TRAIN D (WORKER B): COUNTERS PUT ON PLAYERS, AND ON "A CREATURE YOU CONTROL".
 *
 *   1. putCounter's `who` (effects/resources.mjs): "you get an experience counter" (Ezuri, Claw of Progress; CR 122.1) -- on
 *      each player named, as many as "if you would put one or more counters on a ... player" leaves (Innkeeper's Talent's
 *      third level; rules/statics.mjs), none kept for none put on; counted by `{countersOn: "you", counter}`
 *      (script/amount.mjs), its controller's own and never another player's. Proliferate gives one more (CR 701.34a). The
 *      compiler refuses counters on a player of no kind, of a chosen kind, +1/+1, or poison (the `poison` effect's).
 *   2. The "counter added" trigger on any permanent a filter describes (cards/index.mjs, rules/trigger.mjs): "whenever one or
 *      more +1/+1 counters are put on a creature you control" (Simic Ascendancy; CR 122.6) -- about the creature and how
 *      many were put on it (`countersPut`, "that many"). The compiler refuses `each` beside it, `countersPut` anything but
 *      true, and a player's counters counted by a word it does not know.
 * The cards' own scenarios play the rest: Ezuri's X, Simic Ascendancy's growth and its win.
 */
import assert from "node:assert/strict";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {runEffects} from "../game/engine/script/effects/index.mjs";
import {amountOf} from "../game/engine/script/amount.mjs";
import {collectTriggers} from "../game/engine/rules/trigger.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const FIX = {Bear: {types: ["Creature"], subtypes: ["Bear"], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2},
  Rock: {types: ["Artifact"], manaCost: "{1}", colors: []}};
const table = (setup, seats = 3) => runScenario({name: "counters-put", seats, setup, steps: []}, index.definition, FIX).state;
const idOf = (s, name, seat = 0) => s.zones.battlefield.find((id) => s.objects[id].card === name && s.objects[id].controller === seat);
const experience = {effect: "putCounter", who: "you", counter: "experience", count: 1};
const had = (s) => s.players.map((p) => p.counters.experience ?? 0);

/* ---- 1. counters on players ---- */
{
  const s = table([]);
  runEffects(s, [experience], {controller: 0, source: null});
  eq(had(s), [1, 0, 0], "\"you get an experience counter\": Rob's, no one else's");
  runEffects(s, [experience, experience], {controller: 0, source: null});
  eq(had(s), [3, 0, 0], "and they stay, adding up");
  eq([0, 1].map((controller) => amountOf(s, {countersOn: "you", counter: "experience"}, {controller})), [3, 0],
    "\"the number of experience counters you have\": its controller's own, never another player's");
  runEffects(s, [{...experience, who: "opponent", count: 2}], {controller: 0, source: null});
  eq(had(s), [3, 2, 2], "each opponent named gets them");
  runEffects(s, [{effect: "proliferate", chosen: [{player: 1}]}], {controller: 0, source: null});
  eq(had(s), [3, 3, 2], "proliferate gives a player one more of each kind they have (CR 701.34a)");
  const t = table([]);
  runEffects(t, [{...experience, count: 0}], {controller: 0, source: null});
  eq(t.players[0].counters, {}, "none put on, and no kind kept for none");
}
{
  /* "If you would put one or more counters on a permanent or player, put twice that many" (Innkeeper's Talent, level 3). */
  const s = table([{seat: 0, zone: "battlefield", cards: ["Innkeeper's Talent"]}]);
  s.objects[idOf(s, "Innkeeper's Talent")].level = 3;
  runEffects(s, [experience], {controller: 0, source: null});
  eq(had(s), [2, 0, 0], "a player's counters, doubled as they are put on (rules/statics.mjs, playerCountersPlaced)");
  runEffects(s, [experience], {controller: 1, source: null});
  eq(had(s), [2, 1, 0], "only those Rob puts: Maya's own are not doubled");
}

/* ---- 2. counters on a creature you control: Simic Ascendancy ---- */
{
  const s = table([{seat: 0, zone: "battlefield", cards: ["Simic Ascendancy", "Bear", "Rock"]}, {seat: 1, zone: "battlefield", cards: ["Bear"]}]);
  const trigger = (events) => { s.pendingTriggers = []; collectTriggers(s, events); return s.pendingTriggers.map((p) => p.about ?? null); };
  const put = (id, counter, count) => runEffects(s, [{effect: "putCounter", targets: [id], counter, count}], {controller: 0, source: null});
  const bear = idOf(s, "Bear");
  eq(trigger(put(bear, "+1/+1", 3)), [{card: bear, amount: 3}], "three +1/+1 counters on his Bear: one trigger, about the Bear and three");
  eq(trigger(put(bear, "+1/+1", 2)), [{card: bear, amount: 2}], "two more: about the two put on, not the five it has");
  eq(trigger(put(idOf(s, "Bear", 1), "+1/+1", 2)), [], "on Maya's Bear: none");
  eq(trigger(put(idOf(s, "Rock"), "+1/+1", 1)), [], "on his Rock, no creature: none");
  eq(trigger(put(bear, "-1/-1", 1)), [], "a -1/-1 counter: none");
  eq(amountOf(s, {countersPut: true}, {controller: 0, about: {card: bear, amount: 4}}), 4, "\"that many\": the trigger's amount");
}

/* ---- the compiler ---- */
const script = (abilities) => compileScript({schema: "CrankCardScript@1",
  identity: {name: "Odd Elf", oracleId: "x", types: ["Creature"], subtypes: ["Elf"], manaCost: "{G}", colors: ["G"], colorIdentity: ["G"], power: 1, toughness: 1},
  oracleText: "x", source: "hand", abilities}).problems;
const onEnter = (effect) => script([{kind: "triggered", text: "x", trigger: {on: "enters", who: "self"}, effects: [effect]}]);
const counted = (count) => onEnter({effect: "putCounter", targets: "self", counter: "+1/+1", count});
{
  eq(onEnter(experience), [], "an experience counter for you compiles");
  for (const [counter, why] of [[undefined, "of no kind"], ["chosen", "of a chosen kind"], ["+1/+1", "+1/+1"], ["poison", "poison (the poison effect's)"]])
    ok(onEnter({...experience, counter}).some((p) => p.includes("counters on players (who)")), `counters on a player ${why}: refused`);
  eq(counted({countersOn: "you", counter: "experience"}), [], "your experience counters, counted: compiles");
  ok(counted({countersOn: "opponent", counter: "experience"}).some((p) => p.includes("countersOn is")), "a player's counters by a word it does not know: refused");
  ok(counted({countersPut: "yes"}).some((p) => p.includes("countersPut is true")), "countersPut anything but true: refused");
  const added = (trigger) => script([{kind: "triggered", text: "x", trigger: {on: "counter added", counter: "+1/+1", ...trigger}, effects: [{effect: "draw", count: 1}]}]);
  eq(added({who: "any", filter: {types: ["Creature"], controller: "you"}}), [], "\"on a creature you control\" compiles");
  ok(added({who: "any", each: true}).some((p) => p.includes("does not watch for")), "on any permanent, once for each counter: refused, as not built");
  ok(added({who: "another"}).some((p) => p.includes("does not watch for")), "on another permanent: refused, as not built");
  ok(added({who: "any", counter: undefined}).some((p) => p.includes("does not watch for")), "on any permanent, of no kind of counter: refused");
  ok(added({counter: undefined}).some((p) => p.includes("does not watch for")), "on this one, of no kind of counter: refused");
}

console.log(`engine-counters-put: ${checks} checks passed -- counters put on players and counted as theirs, doubled as they are put on; "one or more +1/+1 counters put on a creature you control", about it and that many; the compiler holding both.`);
