/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
/* CR 406.3, 702.75a: hideaway has no public characteristics; looking follows its explicit permission. */
import assert from "node:assert/strict";
import {table, creature, put} from "./helpers/b3-table.mjs";
import {beginResolution, answerResolution} from "../game/engine/script/resolution.mjs";
import {projectFor} from "../game/engine/projection.mjs";
import {runEffect} from "../game/engine/script/effects/index.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {moveOne} from "../game/engine/script/effects/zones.mjs";
import {checkStateBasedActions} from "../game/engine/rules/sba.mjs";
import {missingFor} from "../game/tools/engine-constructs.mjs";
assert.deepEqual(missingFor({keywords: ["Hideaway"]}), [], "hideaway is credited only with its compiled behavior and hidden-information proof");
const s = table(), source = put(s, creature("Source"));
put(s, creature("Private secret", {keywords: ["Flying"]}), "library");
const rng = {shuffle: (xs) => [...xs].reverse()};
const hide = loadCardIndex().definition("Watcher for Tomorrow").abilities.find((a) => a.effects?.some((e) => e.effect === "dig"));
assert.equal(hide.kind, "triggered");
assert.deepEqual(hide.effects[0], {effect: "dig", count: 4, take: 1, to: "exile", faceDown: true, link: true, rest: "bottom", random: true});
beginResolution(s, hide.effects, {controller: 0, source}, rng);
const outcome = answerResolution(s, [0], {}, rng), id = s.zones.exile[0], o = s.objects[id];
assert.deepEqual([o.card, o.types, o.power, o.toughness, o.keywords], [null, [], null, null, []]);
assert.equal(JSON.stringify(outcome.events).includes("Private secret"), false, "public move events must not leak the name");
assert.equal(JSON.stringify(projectFor(s, 0)).includes("Private secret"), true);
for (const seat of [1, 2, null]) assert.equal(JSON.stringify(projectFor(s, seat)).includes("Private secret"), false);
runEffect(s, {effect: "gainControl", targets: [source], toPlayer: 1}, {controller: 0});
assert.equal(JSON.stringify(projectFor(s, 1)).includes("Private secret"), true, "the source's new controller may look");
assert.equal(JSON.stringify(projectFor(s, 0)).includes("Private secret"), true, "a previous looker retains permission");
runEffect(s, {effect: "gainControl", targets: [source], toPlayer: 2}, {controller: 0});
assert.equal(JSON.stringify(projectFor(s, 1)).includes("Private secret"), true, "a later controller retains permission after losing control");
runEffect(s, {effect: "moveZone", targets: [source], to: "graveyard"}, {controller: 0});
assert.equal(JSON.stringify(projectFor(s, 2)).includes("Private secret"), true, "the last controller retains permission after the source leaves");
const beforeProjection = structuredClone(s);
projectFor(s, 1);
assert.deepEqual(s, beforeProjection, "projection is read-only");
runEffect(s, {effect: "moveZone", targets: [id], to: "hand"}, {controller: 0});
const returned = s.objects[s.zones.hand[0][0]];
assert.deepEqual([returned.card, returned.power, returned.faceDown === true], ["Private secret", 2, false]);
{
  const h = table(), holder = put(h, creature("Holder")), privateCard = put(h, creature("Owned secret"), "library", 1);
  const hidden = moveOne(h, privateCard, "exile", [], {faceDown: true, lookers: [0], exiledBy: holder});
  assert.equal(JSON.stringify(projectFor(h, 1)).includes("Owned secret"), false, "ownership alone grants no look permission");
  h.effects = [{id: "control", layer: 2, affects: {ids: [holder]}, apply: {controller: 2}, sourceController: 0}];
  checkStateBasedActions(h);
  h.effects = [];
  assert.equal(JSON.stringify(projectFor(h, 2)).includes("Owned secret"), true, "a layered controller keeps permission after the effect ends");
  h.effects.push({id: "control", layer: 2, affects: {ids: [holder]}, apply: {controller: 1}, sourceController: 0});
  runEffect(h, {effect: "moveZone", targets: [holder], to: "graveyard"}, {controller: 0});
  assert.equal(JSON.stringify(projectFor(h, 1)).includes("Owned secret"), true, "departure records the effective controller before removing the source");
  const open = moveOne(h, hidden, "graveyard", []);
  moveOne(h, open, "exile", [], {faceDown: true, lookers: [0]});
  assert.equal(JSON.stringify(projectFor(h, 1)).includes("Owned secret"), false, "a new exile incarnation has no old entitlement");
}
{
  const h = table(), holder = put(h, creature("Holder"));
  h.objects[holder].controller = 1;
  put(h, creature("Delayed secret"), "library");
  beginResolution(h, hide.effects, {controller: 0, source: holder}, rng);
  answerResolution(h, [0], {}, rng);
  h.objects[holder].controller = 2;
  assert.equal(JSON.stringify(projectFor(h, 1)).includes("Delayed secret"), true, "the source's controller as exile is created is entitled even when another player resolves its trigger");
}
for (const [intended, replacement] of [["battlefield", "exile"], ["exile", "graveyard"]]) {
  const h = table();
  put(h, {card: "Gate", types: ["Enchantment"], abilities: [{id: "gate", kind: "replacement", watches: {event: "zone-change", to: intended}, change: {to: replacement}}]});
  const card = put(h, creature("Redirected secret"), "library"), events = [];
  const moved = moveOne(h, card, intended, events, {faceDown: true, lookers: [0]});
  assert.deepEqual([h.objects[moved].zone, h.objects[moved].card, h.objects[moved].faceDown === true], [replacement, "Redirected secret", false], "a hidden move redirected to another zone is face up");
  assert.equal(events[0].data.fields.card.name, "Redirected secret", "the public event names the face-up card");
}
console.log("engine-hidden-exile: 24 checks passed -- compiled hideaway, public secrecy, persistent lookers, read-only projection, and replacement destinations.");
