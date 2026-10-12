/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
/* CR 707.9a, 608.2h: added abilities are copiable and bind the exiled card at creation. */
import assert from "node:assert/strict";
import {table, creature, put} from "./helpers/b3-table.mjs";
import {runEffect} from "../game/engine/script/effects/index.mjs";
import {lastKnown} from "../game/engine/rules/layers.mjs";
import {collectTriggers, openTriggers} from "../game/engine/rules/trigger.mjs";
import {resolveTop, pushAbility} from "../game/engine/rules/stack.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
const s = table(), original = put(s, creature("Original"), "exile"), second = put(s, creature("Other"), "exile");
const hofri = loadCardIndex().definition("Hofri Ghostforge");
const findCopy = (list) => list.flatMap((e) => [e, ...findCopy(e.effects ?? []), ...findCopy(e.then ?? []), ...findCopy(e.otherwise ?? [])]).filter((e) => e.effect === "copyPermanent");
const copyEffect = hofri.abilities.flatMap((a) => findCopy(a.effects ?? []))[0];
assert.equal(copyEffect.except.addAbilities[0].kind, "triggered", "the extra leaves ability was compiled");
const context = {controller: 0, remembered: [original], about: {copiedAs: creature("Copied creature", {power: 6})}};
runEffect(s, {...copyEffect, targets: [original]}, context);
const token = s.zones.battlefield[0];
assert.deepEqual([s.objects[token].card, s.objects[token].power, s.objects[token].token], ["Copied creature", 6, true]);
assert.deepEqual(s.objects[token].abilities[0].effects[0].targets, [original]);
context.remembered = [second];
runEffect(s, {effect: "copyPermanent", targets: [token]}, {controller: 0});
assert.deepEqual(s.objects[s.zones.battlefield[1]].abilities, s.objects[token].abilities, "a copy of the token retains its bound ability");
collectTriggers(s, runEffect(s, {effect: "moveZone", targets: [token], to: "exile"}, {controller: 0}));
openTriggers(s); resolveTop(s);
assert.equal(s.zones.graveyard[0].some((id) => s.objects[id].card === "Original"), true);
assert.equal(s.objects[second].zone, "exile", "later memories do not rebind the ability");
const copied = put(s, creature("Printed")), model = put(s, creature("Copy", {power: 7}));
runEffect(s, {effect: "becomeCopy", targets: [model]}, {controller: 0, source: copied});
assert.equal(lastKnown(s, copied).copiable.power, 7);
assert.equal(lastKnown(s, put(s, creature("Plain"))).copiable, undefined, "ordinary cards need no substituted copy values");
const h = table(); put(h, {...hofri, card: "Hofri Ghostforge"});
const printed = put(h, creature("Printed")), model2 = put(h, creature("Copied", {power: 7}));
runEffect(h, {effect: "becomeCopy", targets: [model2]}, {controller: 0, source: printed});
collectTriggers(h, runEffect(h, {effect: "moveZone", targets: [printed], to: "graveyard"}, {controller: 0}));
openTriggers(h); resolveTop(h);
assert.equal(h.zones.battlefield.some((id) => h.objects[id].token && h.objects[id].card === "Copied" && h.objects[id].power === 7), true, "the death event carries copy values through the trigger into resolution");
/* "Create a token that's a copy of this creature" with this creature gone since its ability went on the stack (Colorstorm
   Stallion's Opus; CR 113.7a, 608.2h): its copiable values kept in the snapshot while an ability of its own waits there, and
   copyPermanent's `lastKnown` makes the copy from them -- its printed values, not what an effect made of it. */
const g = table(), stallion = put(g, creature("Stallion", {power: 3, toughness: 3, keywords: ["Haste"]}));
pushAbility(g, {sourceId: stallion, controller: 0, abilityId: "opus", kind: "trigger", script: {targets: [], effects: []}});
const seen = lastKnown(g, stallion);
assert.deepEqual([seen.copiable?.card, seen.copiable?.power, seen.copiable?.keywords], ["Stallion", 3, ["Haste"]], "an ability of it on the stack: its copiable values are kept");
assert.equal(lastKnown(g, put(g, creature("Bystander"))).copiable, undefined, "and none for a permanent with nothing of its own there");
runEffect(g, {effect: "copyPermanent", targets: [], lastKnown: true}, {controller: 0, source: null, lastKnown: seen});
const copies = g.zones.battlefield.filter((id) => g.objects[id].card === "Stallion" && g.objects[id].token);
assert.deepEqual(copies.map((id) => [g.objects[id].power, g.objects[id].keywords]), [[3, ["Haste"]]], "gone: a token copy of it as it last existed");
runEffect(g, {effect: "copyPermanent", targets: []}, {controller: 0, source: null, lastKnown: seen});
runEffect(g, {effect: "copyPermanent", targets: [], lastKnown: true}, {controller: 0, source: null});
assert.equal(g.zones.battlefield.filter((id) => g.objects[id].card === "Stallion").length, 2, "without `lastKnown`, no target is no copy; and with it, but nothing known of the source, none either");
runEffect(g, {effect: "copyPermanent", targets: [stallion], lastKnown: true}, {controller: 0, source: stallion, lastKnown: {...seen, copiable: {...seen.copiable, card: "Stale"}}});
assert.equal(g.zones.battlefield.filter((id) => g.objects[id].card === "Stallion").length, 3, "still there: a copy of it as it is, the snapshot unread");
console.log("engine-copy-memory: 15 checks passed -- compiled added ability, bound return, copied copiable values, LKI snapshot and death trigger, and a copy of a source gone since its ability went on the stack.");
