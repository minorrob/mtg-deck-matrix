/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* TRAIN C, W2D: "ATTACH TARGET EQUIPMENT YOU CONTROL TO UP TO ONE TARGET CREATURE YOU CONTROL" (Iron Hills Stalwart; CR
 * 701.3a-b, 608.2b).
 *
 * attach's `source` may be one of the ability's targets (`{target: n}`, script/bind.mjs): the Equipment that moves is that
 * one, not the ability's source. Here: it moves from the creature it equips; illegal as the ability resolves -- either
 * target -- nothing moves, and the source is never moved in the Equipment's place; a creature it can't be attached to
 * (protection from artifacts, CR 702.16c) and it stays where it was.
 */
import assert from "node:assert/strict";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {beginResolution} from "../game/engine/script/resolution.mjs";
import {bindEffect} from "../game/engine/script/bind.mjs";

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const STALWART = "Iron Hills Stalwart", HAMMER = "Loxodon Warhammer";
const FIX = {
  Bear: {types: ["Creature"], subtypes: ["Bear"], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2},
  "Warded Bear": {types: ["Creature"], subtypes: ["Bear"], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2,
    abilities: [{id: "pr", kind: "static", text: "Protection from artifacts", rule: "protection", affects: {self: true}, from: {types: ["Artifact"]}}]},
};
const table = (setup) => runScenario({name: "attach-target", setup, steps: []}, index.definition, FIX).state;
const idOf = (s, name) => s.zones.battlefield.find((id) => s.objects[id].card === name);
const on = (s, name) => s.objects[idOf(s, name)].attachedTo ?? null;
const enters = (s) => s.objects[idOf(s, STALWART)].abilities.find((a) => a.kind === "triggered").effects;
/* The trigger resolved at the Equipment and the creature named: its second target counted, one of them. */
const resolve = (s, equipment, creature) => beginResolution(s, enters(s), {controller: 0, source: idOf(s, STALWART),
  targets: [{kind: "object", id: idOf(s, equipment)}, [{kind: "object", id: idOf(s, creature)}]]});

{
  const s = table([{seat: 0, zone: "battlefield", cards: [STALWART, HAMMER, "Bear"]}]);
  resolve(s, HAMMER, "Bear");
  eq(on(s, HAMMER), idOf(s, "Bear"), "the targeted Warhammer onto the Bear");
  resolve(s, HAMMER, STALWART);
  eq([on(s, HAMMER), s.objects[idOf(s, "Bear")].attachments ?? []], [idOf(s, STALWART), []], "and from the Bear onto the Stalwart: off the one it equipped");
}
{
  /* The Equipment target illegal as it resolves (CR 608.2b): nothing moves -- the Stalwart, the ability's source, is not
     attached in its place. */
  const s = table([{seat: 0, zone: "battlefield", cards: [STALWART, "Bear"]}]);
  beginResolution(s, enters(s), {controller: 0, source: idOf(s, STALWART), targets: [null, [{kind: "object", id: idOf(s, "Bear")}]]});
  eq([on(s, STALWART), s.objects[idOf(s, "Bear")].attachments ?? []], [null, []], "no Equipment, nothing attached to the Bear");
  eq(bindEffect({effect: "attach", source: {target: 0}, targets: {target: 1}}, {targets: [null, []]}).source, -1, "an illegal Equipment target binds to nothing");
}
{
  /* No creature chosen ("up to one"), and the Warhammer stays; a creature it can't be attached to, and it stays too. */
  const s = table([{seat: 0, zone: "battlefield", cards: [STALWART, HAMMER, "Bear", "Warded Bear"]}]);
  resolve(s, HAMMER, "Bear");
  beginResolution(s, enters(s), {controller: 0, source: idOf(s, STALWART), targets: [{kind: "object", id: idOf(s, HAMMER)}, []]});
  eq(on(s, HAMMER), idOf(s, "Bear"), "up to one: none chosen, and it stays on the Bear");
  resolve(s, HAMMER, "Warded Bear");
  eq(on(s, HAMMER), idOf(s, "Bear"), "protection from artifacts: it does not move (CR 701.3b)");
}

console.log(`engine-attach-target: ${checks} checks passed -- "attach target Equipment to up to one target creature": that Equipment, from where it was; nothing moves for an illegal target, none chosen, or protection.`);
