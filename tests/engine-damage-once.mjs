/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* M4 PHASE 3, BATCH 42 (THE CATALOG'S ORDER): "DAMAGE DEALT ONCE" (Forge's DamageDoneOnce).
 *
 * Enrage -- "whenever this creature is dealt damage" -- and "whenever one or more creatures you control deal combat
 * damage to a player" trigger once for everything one action did, however many sources or attackers: two blockers'
 * damage is one Enrage. For damage to players, once for each player dealt it. The plain damage trigger still triggers
 * once for each damage event.
 */
import assert from "node:assert/strict";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {collectTriggers} from "../game/engine/rules/trigger.mjs";
import {runEffects} from "../game/engine/script/effects/index.mjs";
import {TRIGGER_KINDS, compileScript} from "../game/engine/cards/index.mjs";
import {missingFor} from "../game/tools/engine-constructs.mjs";
import {loadCardIndex, loadCardScripts} from "../game/tools/engine-cards.mjs";

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const cards = loadCardIndex();
const card = (name) => ({...cards.definition(name), card: name});
const table = (n = 2) => createState({matchId: "m", seed: "damage-once", players: ["Rob", "Maya", "Trey"].slice(0, n).map((name) => ({name}))});
const on = (s, o, seat) => addObject(s, {...o, owner: seat, controller: seat}, "battlefield", null);
const triggered = (s, events) => { s.pendingTriggers = []; collectTriggers(s, events); return s.pendingTriggers; };
const hit = (s, source, player, amount = 2) => ({kind: "GameEventPlayerDamaged", data: {turn: 1, phase: "COMBAT_DAMAGE", fields: {
  source: {cardId: source, name: s.objects[source].card, controller: s.objects[source].controller}, target: {playerId: player}, amount, combat: true}}});
const BEAR = {card: "Bear", types: ["Creature"], power: 2, toughness: 2};

{
  /* Enrage: two damage events in one action are one trigger; two actions, two. */
  const s = table();
  const raptor = on(s, card("Ripjaw Raptor"), 0);
  const twice = runEffects(s, [{effect: "dealDamage", targets: [raptor], amount: 1}, {effect: "dealDamage", targets: [raptor], amount: 1}], {controller: 1, source: null});
  eq(twice.filter((e) => e.kind === "GameEventCardDamaged").length, 2, "two damage events");
  eq(triggered(s, twice).length, 1, "one action: Ripjaw Raptor's Enrage triggers once");
  const again = runEffects(s, [{effect: "dealDamage", targets: [raptor], amount: 1}], {controller: 1, source: null});
  eq(triggered(s, again).length, 1, "another action: once more");
}
{
  /* One or more creatures you control: once for each player dealt combat damage -- not once per attacker. */
  const s = table(3);
  on(s, card("Keeper of Fables"), 0);
  const a = on(s, BEAR, 0), b = on(s, BEAR, 0), c = on(s, BEAR, 0);
  const done = triggered(s, [hit(s, a, 1), hit(s, b, 1), hit(s, c, 2)]);
  eq(done.map((t) => t.about.player).sort(), [1, 2], "two Bears hit Maya and one hits Trey: one trigger about Maya, one about Trey");
  eq(done.find((t) => t.about.player === 1).about.cards.length, 2, "the one about Maya is about both Bears that hit her");
  const human = on(s, {card: "Knight", types: ["Creature"], subtypes: ["Human"], power: 2, toughness: 2}, 0);
  eq(triggered(s, [hit(s, human, 1)]).length, 0, "only a Human hits: nothing (non-Human creatures only)");
}
{
  /* The plain damage trigger: still once per event. */
  const s = table();
  const script = structuredClone(loadCardScripts().find(({script: one}) => one.identity.name === "Ripjaw Raptor").script);
  script.abilities[0].trigger = {on: "damage dealt", to: "self"};
  const watcher = on(s, {...compileScript(script).definition, card: "Watcher"}, 0);
  const twice = runEffects(s, [{effect: "dealDamage", targets: [watcher], amount: 1}, {effect: "dealDamage", targets: [watcher], amount: 1}], {controller: 1, source: null});
  eq(triggered(s, twice).length, 2, "Ripjaw Raptor's ability written as the plain \"damage dealt\": twice");
}
{
  eq([TRIGGER_KINDS.includes("damage dealt once"), missingFor({triggers: ["DamageDoneOnce"]})], [true, []], "the trigger is one a card may name, and the catalog credits it");
}

console.log(`engine-damage-once: ${checks} checks passed — Enrage once for an action's damage; "one or more creatures deal combat damage to a player" once per player; the plain damage trigger still per event.`);
